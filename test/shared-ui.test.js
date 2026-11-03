'use strict';
// Keeps every jh.dliu.com page on the shared dliu.com look (https://files.dliu.com/dliu.com/README.md).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const DL_CSS='https://files.dliu.com/dliu.com/ui/v1/dl.css';
const DL_DOCS_CSS='https://files.dliu.com/dliu.com/ui/v1/dl-docs.css';
const DL_ICON='https://files.dliu.com/dliu.com/favicon.png';
const pages={'web/index.html':read('web/index.html'),'web/docs.html':read('web/docs.html'),'lambda/api/library.html':read('lambda/api/library.html')};
const stylesheets=html=>[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);

test('every page loads the shared stylesheet before its own and uses the app logo as favicon',()=>{
  for(const [file,html] of Object.entries(pages)){
    const styles=stylesheets(html);
    assert.equal(styles[0],DL_CSS,file);
    assert.ok(styles.includes('/style.css'),file);
    assert.ok(html.includes('<link rel="icon" type="image/png" href="/icon.png">'),file);
  }
  assert.ok(fs.existsSync(path.join(root,'web/icon.png')));
});

test('every page has the shared header, main and footer',()=>{
  for(const [file,html] of Object.entries(pages)){
    assert.match(html,/<body class="dl-page[" ]/,file);
    assert.ok(html.includes('<a class="dl-brand" href="/"><img class="dl-logo" src="/icon.png" alt="" width="32" height="32">胡佳 · 德威</a>'),file);
    assert.match(html,/<nav class="dl-nav"/,file);
    assert.match(html,/<main [^>]*class="dl-main[" ]/,file);
    assert.ok(html.includes(`<footer class="dl-footer"><a class="dl-footer-logo" href="https://dliu.com" aria-label="dliu.com"><img src="${DL_ICON}" alt="" width="24" height="24"></a><a href="https://dliu.com">dliu.com</a>`),file);
  }
});

test('the bilingual pages use the shared sign-in button and language switcher',()=>{
  for(const html of [pages['web/index.html'],pages['web/docs.html']]){
  assert.match(html,/<a class="dl-button dl-signin" id="sign-in" href="\/auth\/login/);
  assert.ok(html.includes('<div class="dl-language">'));
  assert.ok(html.includes('class="dl-button dl-language-toggle" aria-controls="dl-languages"'));
  assert.ok(html.includes('<div id="dl-languages" class="dl-languages" role="group"'));
  assert.ok(html.lastIndexOf('dl-language')<html.indexOf('</nav>'),'language switcher sits inside the nav');
  }
});

test('/docs uses the shared docs stylesheet and tabs for architecture, cost and security',()=>{
  const html=pages['web/docs.html'],styles=stylesheets(html);
  assert.equal(styles[1],DL_DOCS_CSS);
  assert.match(html,/<main id="main" class="dl-main dl-docs-main">/);
  assert.match(html,/<nav class="dl-tabs" aria-label="Docs sections">/);
  for(const [href,zh,en] of [['/docs','技术架构','Technical architecture'],['/docs/cost','运行成本','Cost'],['/docs/security','安全','Security']]){
    assert.ok(html.includes(`<a href="${href}"`)&&html.includes(`<span lang="zh-CN">${zh}</span><span lang="en">${en}</span>`),href);
    assert.ok(html.includes(`<article class="dl-docs" id="`)&&html.includes(`data-path="${href}">`),href);
  }
  // No API tab: the API serves only this site, and the page says so.
  assert.doesNotMatch(html,/href="\/docs\/api"/);
  assert.match(html,/There is no API tab/);
  // Docs live below /docs/, so their own files are linked from the site root.
  assert.doesNotMatch(html,/(src|href)="(?![\/#]|https?:)/);
});

test('every header ends its links with a Docs button and every footer links to Docs',()=>{
  for(const [file,html] of Object.entries(pages)){
    const nav=html.slice(html.indexOf('<nav class="dl-nav"'),html.indexOf('</nav>',html.indexOf('<nav class="dl-nav"')));
    assert.match(nav,/<a class="dl-button"[^>]* href="\/docs"[^>]*>文档<\/a>/,file);
    assert.doesNotMatch(nav,/href="\/(about|security)"/,file);
    assert.match(html,/<a href="https:\/\/dliu\.com">dliu\.com<\/a> · <a href="\/docs"( id="footer-docs")?>文档<\/a><\/footer>/,file);
  }
  const app=read('web/app.js');
  assert.ok(app.includes("['docs-link',t('文档','Docs')]")&&app.includes("['footer-docs',t('文档','Docs')]"));
});

test('app stylesheets leave the header, buttons, fonts and palette to dl.css',()=>{
  for(const file of ['web/style.css','web/library.css','web/edit-conflict.css']){
    const css=read(file);
    assert.doesNotMatch(css,/header\.site|\.brand\b|\.logo\b|\.languages?\b|\.language-toggle|\.button\b|button\.|\.info-tabs|Songti|SimSun|font-family|--(?!dl-)[a-z-]+:/,file);
    assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b/i,`${file} uses --dl-* colours`);
  }
  for(const file of ['web/app.js','web/library.js','web/edit-conflict.js','lambda/api/library.html'])
    assert.doesNotMatch(read(file),/className='button|class="button|'button primary'|,'button'\)/,file);
});

test('the CSP allows only the shared folders on files.dliu.com',()=>{
  const stack=read('lib/hujia-stack.ts'),preview=read('lambda/api/preview.js');
  for(const csp of [stack,preview]){
    assert.match(csp,/style-src 'self'[^;]* https:\/\/files\.dliu\.com\/dliu\.com\/ui\/;/);
    assert.match(csp,/img-src 'self'[^;]* https:\/\/files\.dliu\.com\/dliu\.com\/[ ;]/);
    assert.doesNotMatch(csp,/https:\/\/files\.dliu\.com[ ;]/);
  }
  // Public pages load nothing from S3, so the site-wide CSP does not name the private bucket.
  assert.doesNotMatch(stack.match(/contentSecurityPolicy:`([^`]+)`/)[1],/amazonaws|bucketName/);
});
