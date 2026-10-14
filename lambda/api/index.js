'use strict';
const crypto = require('crypto');
const auth = require('./auth');
const { loadConfig, NotConfigured } = require('./config');
const model = require('./model');
const json = (statusCode, data, cookies) => ({statusCode, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}, ...(cookies ? {cookies} : {}), body:JSON.stringify(data)});
const redirect = (location, cookies) => ({statusCode:302, headers:{location,'cache-control':'no-store'}, ...(cookies ? {cookies} : {}), body:''});
const clean = item => Object.fromEntries(Object.entries(item).filter(([key]) => !['pk','sk'].includes(key)));
function createHandler(deps = {}) {
  let store, files;
  const db = () => store ||= deps.store || require('./store').createStore();
  const media = () => files ||= deps.files || require('./s3').createFiles();
  const getConfig = deps.loadConfig || loadConfig;
  const siteUrl = deps.siteUrl || process.env.SITE_URL;
  const now = deps.now || Date.now;
  async function read(id) { const item = await db().get(id); if (!item || item.deleted) throw new model.HttpError(404, 'Not found'); return item; }
  return async event => {
    const method = event.requestContext?.http?.method || 'GET';
    const path = event.rawPath || '/';
    const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(), v]));
    try {
      if (path === '/auth/logout' && method === 'GET') return redirect('/', auth.logoutCookies());
      const guest = path.match(/^\/api\/guest\/([A-Za-z0-9-]{1,60})$/);
      if (guest && method === 'GET') {
        const url = await (deps.preview || require('./preview')).guestMedia(guest[1]);
        if (!url) throw new model.HttpError(404,'Photo not found');
        return redirect(url);
      }
      if (path === '/api/public' && method === 'GET') return json(200,{photos:['guestSea','guestHarbour'].map(name=>({url:'/api/guest/'+name}))});
      if (path.startsWith('/api/public/photos/')) throw new model.HttpError(404,'Photo not found');
      let config;
      try { config = await getConfig(); } catch (error) { if (path === '/api/me' && error instanceof NotConfigured) return json(200, {signedIn:false,configured:false}); throw error; }
      if (path === '/auth/login' && method === 'GET') { const r = auth.startLogin(config, siteUrl, now(), event.queryStringParameters?.returnTo); return redirect(r.location, r.cookies); }
      if (path === '/auth/callback' && method === 'GET') { const r = await auth.finishLogin(event, config, siteUrl, {now:now(),fetchImpl:deps.fetchImpl}); return r.location ? redirect(r.location,r.cookies) : json(r.status,{error:r.error},r.cookies); }
      const session = auth.getSession(event, config, now());
      const email = String(session?.user || '').toLowerCase();
      const role = session && email.endsWith('@' + config.allowedDomain) ? 'member' : null;
      if (path === '/api/me' && method === 'GET') return json(200, role ? {signedIn:true,name:session.name || session.user,role} : {signedIn:false,configured:true});
      if (!role) {
        if (method === 'GET' && ['/api/preview','/api/old-website','/api/library'].includes(path) && /text\/html/.test(headers.accept || '')) return redirect('/auth/login?returnTo='+encodeURIComponent(path));
        throw new model.HttpError(401, 'Sign in to open your story');
      }
      if (path === '/api/preview' && method === 'GET') return await (deps.preview || require('./preview')).page('current');
      if (path === '/api/old-website' && method === 'GET') return await (deps.preview || require('./preview')).page('old');
      if (path === '/api/library' && method === 'GET') return await (deps.preview || require('./preview')).page('library');
      const asset=path.match(/^\/api\/media\/([A-Za-z0-9-]{1,60})$/);
      if(asset && ['GET','HEAD'].includes(method)){const url=await (deps.preview || require('./preview')).media(asset[1]);if(!url)throw new model.HttpError(404,'Media not found');return redirect(url);}
      const admin = Boolean(role);
      const onlyAdmin = () => { if (!admin) throw new model.HttpError(403,'Sign in to use the studio'); };
      let body;
      if (!['GET','HEAD'].includes(method)) {
        if (headers.origin !== siteUrl) throw new model.HttpError(403,'Cross-site request refused');
        if (!/^application\/json(?:;|$)/i.test(headers['content-type'] || '')) throw new model.HttpError(415,'Expected JSON');
        const raw = Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
        if (raw.length > 96 * 1024) throw new model.HttpError(413,'Request too large');
        try { body = JSON.parse(raw.toString()); } catch { throw new model.HttpError(400,'Invalid JSON'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new model.HttpError(400,'Invalid request');
      }
      const save = async (item, patch, expected) => {
        model.version(expected);
        if (item.version !== expected) throw new model.HttpError(409,'This changed on another device. Reload before saving; your text is still here.');
        return clean(await db().save({...item,...patch,version:expected+1,updatedAt:new Date(now()).toISOString(),updatedBy:session.user},expected));
      };
      const noteMatch = path.match(/^\/api\/notes\/([a-zA-Z0-9-]{1,60})$/);
      if (noteMatch) {
        // The gift book and album edit the same memory, including its optimistic version.
        const noteMemories = {bonfire:'memory-bonfire',farm:'memory-farm',kaka:'memory-kaka',friends:'memory-new-home',london:'memory-london',christmas:'memory-christmas',joke:'memory-christmas-joke',birthday:'memory-stephanie-birthday'};
        const memoryId = noteMemories[noteMatch[1]];
        const memory = memoryId && await db().get(memoryId);
        if (memory && !memory.deleted) {
          const note = value => ({id:`note-${noteMatch[1]}`,kind:'note',version:value.version,text:value.perspective || ''});
          if (method === 'GET') return json(200,note(memory));
          if (method === 'PUT') return json(200,note(await save(memory,{perspective:model.text(body.text,5000,'Note')},body.version)));
        }
        const id = `note-${noteMatch[1]}`;
        const existing = await db().get(id);
        if (method === 'GET') return json(200, existing ? clean(existing) : {id,kind:'note',version:0,text:''});
        if (method === 'PUT') {
          const value = model.text(body.text, 5000, 'Note');
          if (!Number.isSafeInteger(body.version) || body.version < 0) throw new model.HttpError(400,'A valid version is required');
          if (existing) return json(200, await save(existing,{text:value},body.version));
          if (body.version !== 0) throw new model.HttpError(409,'This note changed on another device. Reload before saving.');
          return json(200, clean(await db().save({id,kind:'note',version:1,text:value,updatedAt:new Date(now()).toISOString(),updatedBy:session.user})));
        }
      }
      if (path === '/api/story' && method === 'GET') {
        const items = await db().list();
        const settings = clean(items.find(i => i.id === 'settings') || {id:'settings',version:1,startDate:'2020-09-19',anniversaryDate:'2026-10-19',letter:'',letterPublished:false,coverMemoryId:''});
        if (event.queryStringParameters?.studio !== '1' && !settings.letterPublished) settings.letter = '';
        return json(200,{settings,memories:items.filter(i => i.kind === 'memory' && !i.deleted && (event.queryStringParameters?.studio === '1' || i.published)).map(clean),wishes:items.filter(i => i.kind === 'wish' && !i.deleted).map(clean)});
      }
      if (path === '/api/initialize' && method === 'POST') {
        onlyAdmin();
        // Conditional creates preserve everything already edited or imported.
        const seed = require('./seed.json');
        for (const item of [seed.settings,...seed.memories]) { if (!await db().get(item.id)) { try { await db().save(item); } catch (error) { if (error.status !== 409) throw error; } } }
        return json(200,{initialized:true});
      }
      if (path === '/api/settings' && method === 'PUT') { onlyAdmin(); return json(200,await save(await read('settings'),model.parseSettings(body),body.version)); }
      if (path === '/api/memories' && method === 'POST') {
        onlyAdmin(); const fields = model.parseMemory(body,true);
        return json(201,clean(await db().save({id:`memory-${crypto.randomUUID()}`,kind:'memory',version:1,published:false,favorite:false,perspective:'',place:'',caption:'',publicPreview:false,photos:[],...fields,createdAt:new Date(now()).toISOString(),updatedBy:session.user})));
      }
      const match = path.match(/^\/api\/memories\/([a-zA-Z0-9-]{1,80})(?:\/(photos)(?:\/([a-zA-Z0-9-]{1,80}))?)?$/);
      if (match) {
        const [,id,sub,fid] = match;
        const item = await read(id);
        if (item.kind !== 'memory' || (!item.published && event.queryStringParameters?.studio !== '1')) throw new model.HttpError(404,'Memory not found');
        if (!sub && method === 'GET') return json(200,clean(item));
        if (!sub && method === 'PUT') return json(200,await save(item,model.parseMemory(body,admin,item),body.version));
        if (!sub && method === 'DELETE') { onlyAdmin(); return json(200,await save(item,{deleted:true},body.version)); }
        if (sub === 'photos' && !fid && method === 'POST') {
          onlyAdmin();
          if (item.photos.length >= 24) throw new model.HttpError(400,'A memory can hold up to 24 photos');
          const photo = model.parseUpload(body); const photoId = crypto.randomUUID();
          const intent = {id:`upload-${photoId}`,kind:'upload',memoryId:id,photoId,...photo,version:1,expiresAt:Math.floor(now()/1000)+3600};
          await db().save(intent);
          const upload = media().uploadUrl(id,photoId,photo);
          return json(201,{photoId,uploadUrl:upload.url,uploadHeaders:upload.headers});
        }
        if (sub === 'photos' && fid && method === 'GET') {
          const photo = item.photos.find(p => p.id === fid); if (!photo) throw new model.HttpError(404,'Photo not found');
          if (photo.assetId) {
            const url = await (deps.preview || require('./preview')).media(photo.assetId);
            if (!url) throw new model.HttpError(404,'Photo not found');
            return redirect(url);
          }
          return redirect(media().downloadUrl(id,fid,photo));
        }
        if (sub === 'photos' && fid && method === 'PUT') {
          onlyAdmin(); const expected = model.version(body.version);
          if (item.photos.some(p => p.id === fid)) return json(200,clean(item));
          if (expected !== item.version) throw new model.HttpError(409,'Memory changed. Reload and try the upload again.');
          if (item.photos.length >= 24) throw new model.HttpError(400,'A memory can hold up to 24 photos');
          const intent = await read(`upload-${fid}`);
          if (intent.memoryId !== id || intent.expiresAt < Math.floor(now()/1000)) throw new model.HttpError(400,'Upload expired');
          const uploaded = await media().uploaded(id,fid);
          if (!uploaded || uploaded.size !== intent.size || uploaded.type !== intent.type) throw new model.HttpError(400,'Photo upload is incomplete or has the wrong size/type');
          await media().keep(id,fid);
          const saved = await save(item,{photos:[...item.photos,{id:fid,name:intent.name,size:intent.size,type:intent.type}]},expected);
          // Cleanup is best effort; lifecycle expiry handles a failed deletion after a successful commit.
          try { await media().finish(id,fid); } catch { console.warn('Pending upload cleanup deferred'); }
          return json(201,saved);
        }
        if (sub === 'photos' && fid && method === 'DELETE') {
          onlyAdmin();
          // Keep underlying bytes for recovery; S3 versioning also retains past objects.
          return json(200,await save(item,{photos:item.photos.filter(p => p.id !== fid)},body.version));
        }
      }
      if (path === '/api/wishes' && method === 'POST') {
        const title = model.text(body.title,500,'Wish'); if (!title) throw new model.HttpError(400,'Write a wish first');
        return json(201,clean(await db().save({id:`wish-${crypto.randomUUID()}`,kind:'wish',version:1,title,done:false,createdBy:session.user,createdAt:new Date(now()).toISOString()})));
      }
      const wish = path.match(/^\/api\/wishes\/([a-zA-Z0-9-]{1,80})$/);
      if (wish && method === 'PUT') { const item = await read(wish[1]); if (item.kind !== 'wish' || typeof body.done !== 'boolean') throw new model.HttpError(400,'Invalid wish'); return json(200,await save(item,{done:body.done},body.version)); }
      throw new model.HttpError(404,'Not found');
    } catch (error) {
      if (error instanceof model.HttpError) return json(error.status,{error:error.message});
      if (error instanceof NotConfigured) return json(503,{error:'Sign-in needs to be configured before the story can open.'});
      console.error(JSON.stringify({path,method,error:error.message}));
      return json(500,{error:'Unable to save right now. Your text is still here; please try again.'});
    }
  };
}
module.exports = {createHandler,handler:createHandler()};
