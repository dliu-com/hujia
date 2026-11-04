'use strict';
let language=localStorage.getItem('hujia-language')||'zh';
const main=document.getElementById('main');
const t=(zh,en)=>language==='en'?en:zh;
function el(tag,text,className){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;}
function link(href,text){const a=el('a',text);a.href=href;return a;}
// /docs, /docs/cost and /docs/security share docs.html; show the section for this address.
function renderDocs(){
  const sections=document.querySelectorAll('.dl-docs[data-path]');if(!sections.length)return;
  // The Health tab lives at /docs#health; the other tabs have their own paths.
  const base=location.pathname.replace(/\/$/,'')||'/docs',path=base==='/docs'&&location.hash==='#health'?'/docs#health':base;
  const current=[...sections].some(s=>s.dataset.path===path)?path:'/docs';
  sections.forEach(s=>{s.hidden=s.dataset.path!==current;});
  document.querySelectorAll('.dl-tabs a').forEach(a=>{if(a.getAttribute('href')===current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const title={'/docs':t('架构','Architecture'),'/docs/cost':t('运行成本','Cost'),'/docs/security':t('安全与隐私','Security and privacy'),'/docs#health':t('网站怎么被测试','How the site is tested')}[current];
  document.title=`${title} · ${t('文档','Docs')} · 胡佳 · 德威`;
}
function renderLanguage(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  for(const [id,text] of [['docs-link',t('文档','Docs')],['footer-docs',t('文档','Docs')],['sign-in',t('登录','Sign in')],['sign-out',t('退出','Sign out')]]){const node=document.getElementById(id);if(node)node.textContent=text;}
  document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  renderDocs();
}
const languages=document.getElementById('dl-languages'),toggle=document.querySelector('.dl-language-toggle');
function closeLanguages(){languages.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');}
document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>{language=b.dataset.language;localStorage.setItem('hujia-language',language);closeLanguages();renderLanguage();}));
toggle.addEventListener('click',()=>{const open=languages.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));});
document.addEventListener('click',e=>{if(!e.target.closest('.dl-language'))closeLanguages();});
renderLanguage();
window.addEventListener('hashchange',renderDocs);
fetch('/api/me',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(me=>{if(!me.signedIn)return;const account=document.getElementById('account');account.textContent=me.name;account.hidden=false;document.getElementById('sign-in').hidden=true;document.getElementById('sign-out').hidden=false;if(location.pathname==='/'){main.replaceChildren(el('p','我们的回忆','kicker'),el('h1','又有一份心意，想交给你。'),el('p','现在可以翻看回忆、播放视频，也可以看看当年的网页。'));const actions=el('div',null,'actions');const play=link('/api/preview','打开我们的回忆');play.className='dl-button dl-button-primary';const old=link('/api/old-website','重看当年的网页');old.className='dl-button';const album=link('/api/library','整理我们的相簿');album.className='dl-button';actions.append(play,album,old);main.append(actions);}}).catch(()=>{const status=document.getElementById('status');if(status)status.textContent='登录状态暂时无法读取，请稍后再试。';});
