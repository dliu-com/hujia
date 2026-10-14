'use strict';
// Resolve a real concurrent edit by showing the saved text next to the retained draft.
window.resolveMemoryConflict = async function({draft,read,write}) {
 let latest=await read();
 const dialog=document.createElement('dialog');dialog.className='shared-edit-dialog';
 const title=document.createElement('h2');title.textContent='这段回忆，刚被补写过。';
 const intro=document.createElement('p');intro.textContent='你写的字还在这里。看看另一边新补的内容，再把想留下的合在一起。';
 const savedLabel=document.createElement('h3');savedLabel.textContent='已经收好的';
 const saved=document.createElement('p');saved.className='saved-shared-text';saved.textContent=latest.text||'还没有写文字。';
 const label=document.createElement('label');label.textContent='这次想留下的';
 const input=document.createElement('textarea');input.maxLength=5000;input.value=draft;label.append(input);
 const status=document.createElement('p');status.setAttribute('role','status');
 const actions=document.createElement('div');actions.className='shared-edit-actions';
 const save=document.createElement('button');save.type='button';save.textContent='把合好的内容收好';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='先不改';actions.append(save,cancel);
 dialog.append(title,intro,savedLabel,saved,label,status,actions);document.body.append(dialog);dialog.showModal();input.focus();
 return new Promise(resolve=>{
  const finish=result=>{dialog.close();dialog.remove();resolve(result);};
  cancel.onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  save.onclick=async()=>{save.disabled=true;status.textContent='正在收好……';try{finish(await write(input.value,latest.version));}catch(error){if(error.status===409){try{latest=await read();saved.textContent=latest.text||'还没有写文字。';status.textContent='又补上了新的内容。你写的还在这里，对照一下再收好。';}catch{status.textContent='暂时没有读到新内容，你写的字还在这里。';}}else status.textContent=error.status===401?'登录过期了，重新登录后再保存。':'没有保存成功，你写的字还在这里。';save.disabled=false;}};
 });
};
