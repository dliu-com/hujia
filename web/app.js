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
// Diagram icons and arrows for the shared dliu.com docs kit, same shapes and colours as the other sites' diagrams.
// The colour is set through the CSSOM because the CSP forbids inline style attributes.
const ICONS={
  browser:['#4b6575',[['rect',{x:3,y:4.5,width:18,height:15,rx:2}],['path',{d:'M3 9h18'}]]],
  users:['#805719',[['circle',{cx:9,cy:8.5,r:3.2}],['path',{d:'M2.8 19.5c.6-3.5 3.2-5.5 6.2-5.5s5.6 2 6.2 5.5'}],['circle',{cx:16.6,cy:9,r:2.6}],['path',{d:'M16.4 14.2c2.5.1 4.3 1.9 4.9 4.8'}]]],
  user:['#4b6575',[['circle',{cx:12,cy:8,r:3.8}],['path',{d:'M4.5 20.5c.9-4.2 4-6.6 7.5-6.6s6.6 2.4 7.5 6.6'}]]],
  bot:['#7b2d2d',[['rect',{x:4.5,y:8,width:15,height:11.5,rx:3}],['path',{d:'M12 8V4.5M9.5 16h5'}],['circle',{cx:9.2,cy:12.3,r:1.2,fill:'#fff'}],['circle',{cx:14.8,cy:12.3,r:1.2,fill:'#fff'}]]],
  cloudfront:['#8c4fff',[['circle',{cx:12,cy:12,r:8.5}],['ellipse',{cx:12,cy:12,rx:3.6,ry:8.5}],['path',{d:'M3.5 12h17M5 7.5h14M5 16.5h14'}]]],
  page:['#4b6575',[['path',{d:'M6 2.5h8.5l4 4V21.5H6z'}],['path',{d:'M14.5 2.5v4h4M9 12h6.5M9 15.5h6.5'}]]],
  lambda:['#ed7100',[['path',{d:'M6.5 4h3.5l8 16'}],['path',{d:'M12.3 10.6 6.5 20'}]]],
  s3:['#7aa116',[['ellipse',{cx:12,cy:6,rx:8,ry:2.6}],['path',{d:'M4 6l1.9 12.6c.3 1.6 2.9 2.6 6.1 2.6s5.8-1 6.1-2.6L20 6'}]]],
  dynamodb:['#3b48cc',[['ellipse',{cx:12,cy:5.8,rx:7,ry:2.5}],['path',{d:'M5 5.8v12.4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5.8M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5'}]]],
  ssm:['#e7157b',[['path',{d:'M4 6h16M4 12h16M4 18h16'}],['circle',{cx:9,cy:6,r:2,fill:'#e7157b'}],['circle',{cx:15.5,cy:12,r:2,fill:'#e7157b'}],['circle',{cx:7.5,cy:18,r:2,fill:'#e7157b'}]]],
  entra:['#0078d4',[['rect',{x:4.5,y:4.5,width:6.8,height:6.8,fill:'#fff',stroke:'none'}],['rect',{x:12.7,y:4.5,width:6.8,height:6.8,fill:'#fff',stroke:'none'}],['rect',{x:4.5,y:12.7,width:6.8,height:6.8,fill:'#fff',stroke:'none'}],['rect',{x:12.7,y:12.7,width:6.8,height:6.8,fill:'#fff',stroke:'none'}]]],
  lock:['#dd344c',[['rect',{x:4.5,y:10.5,width:15,height:10.5,rx:2}],['path',{d:'M8 10.5V7.8a4 4 0 0 1 8 0v2.7M12 14.5v3'}]]],
  check:['#2e8540',[['circle',{cx:12,cy:12,r:8.5}],['path',{d:'M8 12.3l2.7 2.7L16 9.6'}]]],
  chart:['#147cab',[['path',{d:'M4 4v16h16'}],['path',{d:'M7 15l4-5 3 3 5.5-7'}]]],
  clock:['#147cab',[['circle',{cx:12,cy:12,r:8.5}],['path',{d:'M12 7.5V12l3.2 2'}]]],
  pin:['#147cab',[['path',{d:'M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z'}],['circle',{cx:12,cy:10,r:2.3}]]],
  power:['#2e8540',[['path',{d:'M12 3v8.5'}],['path',{d:'M7.2 6.6a7.5 7.5 0 1 0 9.6 0'}]]],
};
function drawDiagrams(){
  const NS='http://www.w3.org/2000/svg';
  const svg=parts=>{const s=document.createElementNS(NS,'svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('focusable','false');for(const [tag,attrs] of parts){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);s.append(n);}return s;};
  document.querySelectorAll('.dg-icon[data-icon]').forEach(box=>{const [colour,parts]=ICONS[box.dataset.icon]||ICONS.browser;box.style.setProperty('--dg',colour);box.setAttribute('aria-hidden','true');box.replaceChildren(svg(parts));});
  document.querySelectorAll('.dg-arrow:empty').forEach(arrow=>{arrow.setAttribute('aria-hidden','true');arrow.append(svg([['path',{d:'M4 12h15M13 6l6 6-6 6'}]]));});
}
drawDiagrams();
fetch('/api/me',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(me=>{if(!me.signedIn)return;const account=document.getElementById('account');account.textContent=me.name;account.hidden=false;document.getElementById('sign-in').hidden=true;document.getElementById('sign-out').hidden=false;if(location.pathname==='/'){main.replaceChildren(el('p','我们的回忆','kicker'),el('h1','又有一份心意，想交给你。'),el('p','现在可以翻看回忆、播放视频，也可以看看当年的网页。'));const actions=el('div',null,'actions');const play=link('/api/preview','打开我们的回忆');play.className='dl-button dl-button-primary';const old=link('/api/old-website','重看当年的网页');old.className='dl-button';const album=link('/api/library','整理我们的相簿');album.className='dl-button';actions.append(play,album,old);main.append(actions);}}).catch(()=>{const status=document.getElementById('status');if(status)status.textContent='登录状态暂时无法读取，请稍后再试。';});
