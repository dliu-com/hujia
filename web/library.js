'use strict';
const $=id=>document.getElementById(id);
let memories=[],selected=null,photoIndex=0,drafts={};try{drafts=JSON.parse(localStorage.getItem('hujia-album-drafts')||'{}');}catch{}
const persistDrafts=()=>localStorage.setItem('hujia-album-drafts',JSON.stringify(drafts));
const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(cls)el.className=cls;return el;};
function errorText(error){if(error.status===409)return '这段回忆刚在另一台设备上改过。请重新打开再保存，你写的内容仍留在这里。';if(error.status===401)return '登录已过期，请重新登录。';if(error.status===400)return '请检查日期、标题和文件格式。照片最多 100 MB，视频最多 2 GB。';return '暂时没有保存成功，你写的内容还留在这里，请再试一次。';}
async function api(path,method='GET',body){const r=await fetch(path,{method,cache:'no-store',headers:body?{'content-type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){const e=new Error(data.error);e.status=r.status;throw e;}return data;}
const shownDate=m=>m.datePrecision==='year'?m.date.slice(0,4)+' 年':m.datePrecision==='month'?m.date.slice(0,7):m.date;
function stopMedia(){document.querySelectorAll('video').forEach(v=>v.pause());}
function list(){const year=$('year-filter').value,search=$('memory-search').value.trim().toLowerCase();$('memory-list').replaceChildren();const items=memories.filter(m=>(!year||m.date.startsWith(year))&&(!search||[m.title,m.place,m.caption].join(' ').toLowerCase().includes(search))).sort((a,b)=>b.date.localeCompare(a.date));for(const m of items){const button=node('button',null,'memory-row');button.type='button';button.setAttribute('aria-pressed',String(selected?.id===m.id));button.append(node('strong',m.title),node('small',[shownDate(m),m.place].filter(Boolean).join(' · ')));button.onclick=()=>select(m);$('memory-list').append(button);}if(!items.length)$('memory-list').append(node('p','还没有找到这段回忆。','muted'));}
function showPhoto(){stopMedia();const holder=$('memory-media');holder.replaceChildren();const photos=selected.photos||[];$('photo-count').textContent=photos.length?`${photoIndex+1} / ${photos.length}`:'还没有放照片';$('photo-prev').disabled=photoIndex===0;$('photo-next').disabled=photoIndex>=photos.length-1;const p=photos[photoIndex];if(!p){holder.append(node('p','把那天的照片放进来。','muted'));return;}const href=`/api/memories/${selected.id}/photos/${p.id}?studio=1`;
 if(p.type.startsWith('video/')){const v=node('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.src=href;holder.append(v);}else if(!/image\/(heic|heif)/.test(p.type)){const img=node('img');img.alt=selected.title;img.src=href;img.onerror=()=>{$('media-status').textContent='这个文件暂时不能预览，可以打开原件查看。';};holder.append(img);}else holder.append(node('p','原件已保存，可以打开查看。','muted'));
 const original=node('a','打开原件','original-link');original.href=href;original.target='_blank';original.rel='noopener';holder.append(original);$('media-status').textContent='';
}
function select(m){selected=m;photoIndex=0;$('detail').hidden=false;$('empty-detail').hidden=true;$('memory-title').textContent=m.title;$('memory-date').textContent=[shownDate(m),m.place].filter(Boolean).join(' · ');$('memory-caption').textContent=m.caption;const docs=$('document-originals');docs.replaceChildren();for(const file of m.attachments||[]){const a=node('a',file.title||'打开文档原件','button');a.href='/api/media/'+file.assetId;a.target='_blank';a.rel='noopener';docs.append(a);}$('perspective').value=drafts[m.id]?.text??m.perspective??'';$('save-status').textContent=drafts[m.id]?'还有一句没收好，点一下保存。':'';showPhoto();list();}
function replace(saved){memories=memories.map(m=>m.id===saved.id?saved:m);select(saved);}
function refreshYears(){const current=$('year-filter').value;$('year-filter').replaceChildren();const all=node('option','所有年份');all.value='';$('year-filter').append(all);for(const year of [...new Set(memories.map(m=>m.date.slice(0,4)))].sort().reverse()){const opt=node('option',year);opt.value=year;$('year-filter').append(opt);}$('year-filter').value=current;}
function localDate(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
async function load(){try{const story=await api('/api/story?studio=1');memories=story.memories.sort((a,b)=>b.date.localeCompare(a.date));refreshYears();list();if(memories.length)select(memories.find(m=>m.id===new URLSearchParams(location.search).get('memory'))||memories[0]);}catch(e){$('empty-detail').textContent=errorText(e);}}
$('memory-search').oninput=list;$('year-filter').onchange=list;
$('photo-prev').onclick=()=>{photoIndex--;showPhoto();};$('photo-next').onclick=()=>{photoIndex++;showPhoto();};
$('perspective').oninput=()=>{if(selected){drafts[selected.id]={text:$('perspective').value,version:drafts[selected.id]?.version??selected.version};persistDrafts();}};
$('save-perspective').onclick=async()=>{
 if(!selected)return;
 const button=$('save-perspective'),target=selected.id,draft=$('perspective').value,version=drafts[target]?.version??selected.version;
 button.disabled=true;$('perspective').readOnly=true;$('save-status').textContent='正在收好……';
 const accept=saved=>{delete drafts[target];persistDrafts();memories=memories.map(m=>m.id===target?saved:m);if(selected.id===target){select(saved);$('save-status').textContent='收好了，我们都能看到。';}else list();};
 const write=(text,version)=>api('/api/memories/'+target+'?studio=1','PUT',{version,perspective:text});
 try{accept(await write(draft,version));}
 catch(e){if(e.status===409&&window.resolveMemoryConflict){try{const saved=await window.resolveMemoryConflict({draft,read:async()=>{const m=await api('/api/memories/'+target+'?studio=1');return {text:m.perspective||'',version:m.version};},write});if(saved)accept(saved);else if(selected.id===target)$('save-status').textContent='你写的字还留在这里。';}catch(error){if(selected.id===target)$('save-status').textContent=errorText(error);}}
 else if(selected.id===target){$('save-status').textContent=errorText(e);$('perspective').value=draft;}}
 finally{button.disabled=false;$('perspective').readOnly=false;}
};
const dialog=$('edit-dialog');let editorBase=null;
function openEditor(create){editorBase=create?null:{...selected};$('edit-save').textContent='保存';$('edit-heading').textContent=create?'再留下一段回忆':'调整这段回忆';$('edit-title').value=create?'':selected.title;$('edit-date').value=create?localDate():selected.date;$('edit-place').value=create?'':selected.place||'';$('edit-caption').value=create?'':selected.caption||'';$('edit-published').checked=create?true:selected.published;$('editor-status').textContent='';dialog.dataset.mode=create?'create':'edit';dialog.showModal();}
$('new-memory').onclick=()=>openEditor(true);$('edit-memory').onclick=()=>openEditor(false);$('edit-cancel').onclick=()=>dialog.close();
$('edit-save').onclick=async()=>{
 const create=dialog.dataset.mode==='create',button=$('edit-save');button.disabled=true;
 const body={title:$('edit-title').value,date:$('edit-date').value,place:$('edit-place').value,caption:$('edit-caption').value,published:$('edit-published').checked};
 const changed=create?body:Object.fromEntries(Object.entries(body).filter(([key,value])=>value!==(editorBase[key]??'')));
 try{
  let saved;
  try{saved=await api(create?'/api/memories':'/api/memories/'+editorBase.id+'?studio=1',create?'POST':'PUT',create?body:{...changed,version:editorBase.version});}
  catch(error){
   if(create||error.status!==409)throw error;
   const latest=await api('/api/memories/'+editorBase.id+'?studio=1');
   const conflicts=Object.keys(changed).filter(key=>latest[key]!==editorBase[key]&&latest[key]!==changed[key]);
   if(conflicts.length){
    const names={title:'标题',date:'日期',place:'地点',caption:'说明',published:'显示状态'};
    $('editor-status').replaceChildren(node('p','另一台设备也改了这些内容。下面是已保存的版本；上面的输入仍是你写的。请比较后再保存。'));
    for(const key of conflicts)$('editor-status').append(node('p',names[key]+'：'+(typeof latest[key]==='boolean'?(latest[key]?'已显示':'暂存'):latest[key])));
    for(const [key,value] of Object.entries(body))if(!(key in changed)){const input=$('edit-'+key);if(key==='published')input.checked=latest[key];else input.value=latest[key]||'';}
    editorBase=latest;button.textContent='以这里的内容保存';return;
   }
   saved=await api('/api/memories/'+editorBase.id+'?studio=1','PUT',{...changed,version:latest.version});
  }
  if(create)memories.push(saved);else memories=memories.map(m=>m.id===saved.id?saved:m);refreshYears();select(saved);dialog.close();
 }catch(e){$('editor-status').textContent=errorText(e);}finally{button.disabled=false;}
};
$('upload-files').onchange=async e=>{
 if(!selected)return;const target=selected.id,files=Array.from(e.target.files);let current=selected;
 $('upload-status').textContent='正在把照片收进来……';$('upload-files').disabled=true;
 try{for(let i=0;i<files.length;i++){
  const file=files[i];$('upload-status').textContent=`正在保存 ${i+1} / ${files.length}：${file.name}`;
  const fallback=/\.(heic|heif)$/i.test(file.name)?'image/heic':/\.mov$/i.test(file.name)?'video/quicktime':/\.mp4$/i.test(file.name)?'video/mp4':'';
  const intent=await api('/api/memories/'+target+'/photos?studio=1','POST',{name:file.name,type:file.type||fallback,size:file.size});
  const response=await fetch(intent.uploadUrl,{method:'PUT',headers:intent.uploadHeaders,body:file});if(!response.ok)throw new Error('Upload incomplete');
  // Appending a photo preserves other edits, so a version conflict can safely retry the same upload.
  let saved;for(let attempt=0;attempt<3;attempt++){try{saved=await api('/api/memories/'+target+'/photos/'+intent.photoId+'?studio=1','PUT',{version:current.version});break;}catch(error){if(error.status!==409||attempt===2)throw error;current=await api('/api/memories/'+target+'?studio=1');}}
  current=saved;memories=memories.map(m=>m.id===target?saved:m);if(selected.id===target){select(saved);photoIndex=saved.photos.length-1;showPhoto();}else list();
 }$('upload-status').textContent='收好了，照片和视频都保留原件。';}
 catch(error){$('upload-status').textContent=errorText(error);}
 finally{$('upload-files').disabled=false;e.target.value='';}
};
window.addEventListener('pagehide',stopMedia);load();
