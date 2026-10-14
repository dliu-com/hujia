'use strict';
let language=localStorage.getItem('hujia-language')||'zh';
const main=document.getElementById('main');
const t=(zh,en)=>language==='en'?en:zh;
function el(tag,text,className){const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n;}
function link(href,text){const a=el('a',text);a.href=href;return a;}
function renderInfo(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  document.getElementById('about-link').textContent=t('关于','About');
  const signOut=document.querySelector('#account a[href="/auth/logout"]');if(signOut)signOut.textContent=t('退出','Sign out');
  document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  if(!['/about','/security'].includes(location.pathname))return;
  main.classList.add('info-page');const security=location.pathname==='/security';main.replaceChildren(el('h1',security?t('安全与隐私','Security and privacy'):t('关于这个礼物','About this gift')));
  const nav=el('nav',null,'info-tabs');for(const [href,text] of [['/about',t('关于','About')],['/security',t('安全与隐私','Security and privacy')]]){const a=link(href,text);if(href===location.pathname)a.setAttribute('aria-current','page');nav.append(a);}main.append(nav);
  const sections=security?[
    [t('谁能看到回忆','Who can see the memories'),t('访客只看到公开入口和两张精选风景照片。回忆页面、照片、视频和证件材料都需要先登录。可以登录的账号由 Microsoft 端管理。','Visitors see the entrance and two selected scenery photos. Memories, photos, videos and documents require sign-in. Eligible accounts are managed on the Microsoft side.')],
    [t('素材存在哪里','Where media is stored'),t('素材存放在独立的私有 S3 存储桶，禁止公开访问。网页代码与私人素材分开，私人媒体链接需要登录后获取，并在短时间内过期；公开入口仅使用单独审核过、已移除拍摄信息的风景副本。','Media is kept in a separate private S3 bucket with public access blocked. Public website code and private media are separate. Private media links are issued after sign-in and expire shortly afterwards. The entrance uses separately reviewed scenery copies with capture metadata removed.')],
    [t('证件脱敏','Document redaction'),t('临时驾照的证件号码、出生日期和其他敏感字段已从保存的图片中删除。姓名、照片、签发日期和地址按我们的选择保留。原始证件不会随网页发布。','The saved provisional-licence image has had its identifier, birth date and other sensitive fields permanently removed. Name, portrait, issue date and address are retained by choice. The original identity document is not published with the site.')],
    [t('一起保存回忆','Saving memories together'),t('回忆相簿支持共同编辑和原件上传，回忆册里的补写会保存到两人共用的空间。没有保存成功的文字会保留在当前浏览器，方便重新保存。','The shared album supports edits and original-media uploads. Notes in the memory book are saved to shared storage. Unsaved drafts stay in the current browser for retrying.')],
  ]:[
    [t('为什么有这个网页','Why this website exists'),t('这是德威送给胡佳的一份礼物。把写过的卡片、做过的网页、一起住过的家和走过的地方，放在一个可以慢慢翻看的地方。','This is a gift from Dewei to Hujia: a place to revisit the cards, the first website, the homes and the places we have shared.')],
    [t('两个人继续写的回忆','Memories we can keep writing'),t('回忆可以有多张照片，也可以有保留原声的视频。我们各自记得的那句话，都可以继续补在旁边。以后，也可以把新的故事放进来。','A memory can hold several photos and videos with their original sound. Both of us can add what we remember and keep new stories here.')],
    [t('怎么运行','How it runs'),t('网页通过 S3 与 CloudFront 提供；Microsoft Entra 负责登录。回忆素材使用独立私有 S3，内容保存功能使用 Lambda 与 DynamoDB。网站代码与私人素材分开维护，DL 图标用作网站标识。','S3 and CloudFront serve the website, with Microsoft Entra for sign-in. A separate private S3 bucket stores memory media; Lambda and DynamoDB support saved content. Website code and private media are maintained separately; DL branding identifies the site.')],
  ];for(const [title,body] of sections)main.append(el('h2',title),el('p',body));main.append(link('/',t('回到首页','Back to home')));
}
document.querySelectorAll('[data-language]').forEach(b=>b.addEventListener('click',()=>{language=b.dataset.language;localStorage.setItem('hujia-language',language);renderInfo();}));
document.querySelector('.language-toggle').addEventListener('click',e=>{const open=document.getElementById('site-languages').classList.toggle('is-open');e.currentTarget.setAttribute('aria-expanded',String(open));});
renderInfo();
fetch('/api/me',{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error();return r.json();}).then(me=>{if(!me.signedIn)return;const account=document.getElementById('account');account.append(el('span',me.name+' · '),link('/auth/logout',t('退出','Sign out')));if(location.pathname==='/'){main.replaceChildren(el('p','我们的回忆','kicker'),el('h1','又有一份心意，想交给你。'),el('p','现在可以翻看回忆、播放视频，也可以看看当年的网页。'));const actions=el('div',null,'actions');const play=link('/api/preview','打开我们的回忆');play.className='button primary';const old=link('/api/old-website','重看当年的网页');old.className='button';const album=link('/api/library','整理我们的相簿');album.className='button';actions.append(play,album,old);main.append(actions);}}).catch(()=>{const status=document.getElementById('status');if(status)status.textContent='登录状态暂时无法读取，请稍后再试。';});
