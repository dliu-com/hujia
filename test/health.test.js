'use strict';
// Guards the status.dliu.com health contract: /health, /docs/health and /docs/health.md (dliu-com/status HEALTH.md).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {FUNCTIONS,health}=require('../lambda/api/health');
const {createHandler}=require('../lambda/api');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const md=read('web/docs/health.md'),html=read('web/docs.html');
const page=html.slice(html.indexOf('<article class="dl-docs" id="health"'),html.indexOf('</article>',html.indexOf('<article class="dl-docs" id="health"')));
const KEYS=FUNCTIONS.map(f=>f.key);
const section=(text,title)=>text.split(title)[1].split('\n## ')[0];
const mdRows=text=>text.split('\n').filter(l=>/^\| (?!-)/.test(l)).slice(1).map(l=>l.slice(1,-1).split('|').map(c=>c.trim().replace(/`/g,'')));
const htmlRows=text=>[...text.matchAll(/<tr>((?:<td>.*?<\/td>)+)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td>(.*?)<\/td>/g)].map(c=>c[1].replace(/<\/?code>/g,'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')));
const probes=(over={})=>({memories:async()=>{},media:async()=>{},signin:async()=>{},...over});

test('/health reports every function in application/health+json, cached 60 s, and reveals nothing private',async()=>{
  const r=await health({probes:probes(),now:()=>Date.UTC(2026,10,3,23)});
  assert.equal(r.statusCode,200);assert.equal(r.headers['content-type'],'application/health+json');assert.equal(r.headers['cache-control'],'public, max-age=60');
  const body=JSON.parse(r.body);
  assert.deepEqual(Object.keys(body),['status','time','functions']);
  assert.equal(body.status,'pass');assert.equal(body.time,'2026-11-03T23:00:00Z');
  assert.deepEqual(body.functions,FUNCTIONS.map(f=>({...f,status:'pass'})));
  assert.doesNotMatch(r.body,/hujia|bucket|table|arn:|amazonaws|dliu\.com|@/i);
});

test('a slow check warns (200), a failed or timed-out check fails (503) with a generic reason only',async()=>{
  let t=0;const clock=()=>(t+=1300);
  const slow=JSON.parse((await health({probes:probes(),clock})).body);
  assert.equal(slow.status,'warn');assert.ok(slow.functions.every(f=>f.status==='warn'&&f.output==='slow'));
  const failed=await health({probes:probes({media:async()=>{throw new Error('AccessDenied for arn:aws:s3:::secret-bucket');}})});
  assert.equal(failed.statusCode,503);
  const body=JSON.parse(failed.body);assert.equal(body.status,'fail');
  assert.deepEqual(body.functions.find(f=>f.key==='media'),{key:'media',name:'Private media storage',status:'fail',output:'read failed'});
  assert.doesNotMatch(failed.body,/AccessDenied|arn|secret/);
  const hung=JSON.parse((await health({probes:probes({memories:()=>new Promise(()=>{})})})).body);
  assert.equal(hung.functions.find(f=>f.key==='memories').output,'timeout');
});

test('the handler answers /health without reading cookies, headers, the query string or the body',async()=>{
  let calls=0;const handler=createHandler({health:async()=>{calls++;return {statusCode:200,body:'{}'};}});
  for(const method of ['GET','HEAD']){
    const event={rawPath:'/health',requestContext:{http:{method}}};
    for(const field of ['cookies','headers','queryStringParameters','body','isBase64Encoded'])Object.defineProperty(event,field,{get(){throw new Error(`/health read ${field}`);}});
    assert.equal((await handler(event)).statusCode,200);
  }
  assert.equal(calls,2);
  // Other methods are not health checks.
  const post=await handler({rawPath:'/health',requestContext:{http:{method:'POST'}},headers:{},cookies:[]});
  assert.notEqual(post.statusCode,200);
});

test('the function keys agree across /health, the Testing tab and /docs/health.md',()=>{
  const mdFunctions=mdRows(section(md,'## Functions')).map(r=>r[0]);
  const pageFunctions=[...page.matchAll(/data-function="([a-z]+)"/g)].map(m=>m[1]);
  assert.deepEqual(pageFunctions,mdFunctions);
  for(const key of KEYS)assert.ok(mdFunctions.includes(key),key);
  const mdJson=JSON.parse(section(md,'## Health endpoint').split('```json\n')[1].split('```')[0]);
  assert.deepEqual(mdJson.functions.map(f=>[f.key,f.name]),FUNCTIONS.map(f=>[f.key,f.name]));
  assert.deepEqual(mdRows(section(md,'## Health endpoint')).map(r=>r[0]),KEYS);
  for(const key of mdRows(section(md,'## Guest checks')).map(r=>r[0]))assert.ok(mdFunctions.includes(key),key);
});

test('the Markdown file has every guest check, and the Testing tab\'s numbers and chart follow from it',()=>{
  const guest=mdRows(section(md,'## Guest checks')),reads=mdRows(section(md,'## Health endpoint'));
  for(const [,method,url,status] of guest){assert.match(method,/^(GET|HEAD)$/);assert.match(url,/^https:\/\/jh\.dliu\.com\//);assert.match(status,/^\d{3}$/);}
  assert.ok(guest.some(r=>r[2]==='https://jh.dliu.com/auth/login'&&r[3]==='302'&&r[5].includes('https://login.microsoftonline.com/')));
  assert.ok(guest.some(r=>r[2]==='https://jh.dliu.com/api/story'&&r[3]==='401'));
  assert.deepEqual(reads.map(r=>r[0]),KEYS);
  const functions=mdRows(section(md,'## Functions')).map(r=>r[0]);
  assert.equal(page.match(/data-count="functions">(\d+)</)[1],String(functions.length));
  assert.equal(page.match(/data-count="checks">(\d+)</)[1],String(guest.length+1),'guest checks + /health');
  const bars=[...page.matchAll(/class="health-chart-bar" data-checks="(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(bars,functions.map(key=>guest.filter(r=>r[0]===key).length+(KEYS.includes(key)?1:0)));
  for(const n of new Set(bars))assert.ok(read('web/style.css').includes(`.health-chart-bar[data-checks="${n}"]{width:`),`bar width for ${n}`);
  // Each endpoint the tab names is one the Markdown file tests.
  const tested=new Set([...guest.map(r=>new URL(r[2]).pathname),'/health']);
  for(const [p] of page.replace('href="/docs/health.md"','').matchAll(/\/(?:api|auth|health|docs)[a-z\/]*/g))assert.ok(tested.has(p),p);
});

test('the Testing tab (/docs#health) shows flows, numbers, a table and a chart, without exact technical details',()=>{
  assert.match(page,/data-path="\/docs#health"/);
  assert.match(html,/<a href="\/docs#health"><span lang="zh-CN">测试<\/span><span lang="en">Testing<\/span><\/a>/);
  assert.doesNotMatch(html,/href="\/docs\/health"/);
  assert.match(read('web/app.js'),/location\.hash==='#health'\?'\/docs#health'/);
  assert.match(page,/class="dg-flow"/);assert.ok((page.match(/class="dg-step/g)||[]).length>=4);assert.match(page,/class="dg-arrow"/);
  for(const result of ['dg-good','dg-warn','dg-bad'])assert.match(page,new RegExp(`class="dg-step ${result}"`),result);
  assert.ok((page.match(/class="dg-stat"/g)||[]).length>=4);
  assert.match(page,/<table>/);assert.equal((page.match(/<tr data-function=/g)||[]).length,6);
  assert.match(page,/class="health-chart"/);
  assert.match(page,/lang="zh-CN">测不到的部分/);assert.match(section(md,'## Not tested'),/upload/);
  // High-level endpoint names are fine; exact details are not: no code, folds, full URLs, methods, status codes,
  // headers, content types or JSON.
  assert.doesNotMatch(page,/<code|<pre|<details|https?:\/\/|\b(GET|HEAD|POST)\b|\b(200|301|302|401|403|404|503)\b|application\/|text\/|Content-Type|Cache-Control|Authorization|cookie|[{}]/i);
  assert.match(page,/<p><a href="\/docs\/health\.md"><span lang="zh-CN">[^<]+<\/span><span lang="en">Technical version for machines \(Markdown\)<\/span><\/a><\/p>\s*$/);
});

test('/docs/health moves to /docs#health, /health is routed, and health.md is deployed as Markdown',()=>{
  const c={};vm.runInNewContext(read('lib/routes.cjs'),c);
  const route=uri=>c.handler({request:{uri,querystring:{},headers:{host:{value:'jh.dliu.com'}}}});
  for(const uri of ['/docs/health','/docs/health/']){const r=route(uri);assert.equal(r.statusCode,301,uri);assert.equal(r.headers.location.value,'/docs#health',uri);}assert.equal(route('/docs/health.md').uri,'/docs/health.md');assert.equal(route('/health').uri,'/health');
  const stack=read('lib/hujia-stack.ts');
  assert.match(stack,/'health':healthBehavior/);
  assert.match(stack,/new deploy\.BucketDeployment\(this,'Markdown',\{[^}]*include:\['\*\.md'\][^}]*contentType:'text\/markdown; charset=utf-8'/);
  assert.match(stack,/exclude:\['\*\.html','\*\.md'\]/);
});
