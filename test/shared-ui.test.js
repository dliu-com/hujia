'use strict';
// Keeps every jh.dliu.com page on the shared dliu.com look (https://files.dliu.com/dliu.com/README.md).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const DL_CSS='https://files.dliu.com/dliu.com/ui/v1/dl.css';
const DL_DOCS_CSS='https://files.dliu.com/dliu.com/ui/v1/dl-docs.css';
const DL_ICON='https://files.dliu.com/dliu.com/favicon.png';
const pages={'web/index.html':read('web/index.html'),'lambda/api/library.html':read('lambda/api/library.html')};
const stylesheets=html=>[...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m=>m[1]);

test('every page loads the shared stylesheet before its own and uses the DL icon as favicon',()=>{
  for(const [file,html] of Object.entries(pages)){
    const styles=stylesheets(html);
    assert.equal(styles[0],DL_CSS,file);
    assert.ok(styles.includes('/style.css'),file);
    assert.match(html,new RegExp(`<link rel="icon" type="image/png" href="${DL_ICON}">`),file);
    assert.doesNotMatch(html,/\/icon\.png/,file);
  }
  assert.equal(fs.existsSync(path.join(root,'web/icon.png')),false);
});

test('every page has the shared header, main and footer',()=>{
  for(const [file,html] of Object.entries(pages)){
    assert.match(html,/<body class="dl-page[" ]/,file);
    assert.ok(html.includes(`<a class="dl-logo" href="https://dliu.com" aria-label="dliu.com"><img src="${DL_ICON}"`),file);
    assert.ok(html.includes('<a class="dl-brand" href="/">胡佳 · 德威</a>'),file);
    assert.match(html,/<nav class="dl-nav"/,file);
    assert.match(html,/<main [^>]*class="dl-main[" ]/,file);
    assert.ok(html.includes('<footer class="dl-footer"><a href="https://dliu.com">dliu.com</a>'),file);
  }
});

test('the home page uses the shared sign-in button and language switcher',()=>{
  const html=pages['web/index.html'];
  assert.match(html,/<a class="dl-button dl-signin" id="sign-in" href="\/auth\/login/);
  assert.ok(html.includes('<div class="dl-language">'));
  assert.ok(html.includes('class="dl-button dl-language-toggle" aria-controls="dl-languages"'));
  assert.ok(html.includes('<div id="dl-languages" class="dl-languages" role="group"'));
  assert.ok(html.lastIndexOf('dl-language')<html.indexOf('</nav>'),'language switcher sits inside the nav');
});

test('About and Security pages use the shared docs stylesheet and tabs',()=>{
  assert.ok(stylesheets(pages['web/index.html']).includes(DL_DOCS_CSS));
  const app=read('web/app.js');
  assert.ok(app.includes("main.className='dl-main dl-docs-main'"));
  assert.ok(app.includes("el('nav',null,'dl-tabs')"));
  assert.ok(app.includes("el('article',null,'dl-docs')"));
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
    assert.match(csp,/img-src 'self'[^;]* https:\/\/files\.dliu\.com\/dliu\.com\/ /);
    assert.doesNotMatch(csp,/https:\/\/files\.dliu\.com[ ;]/);
  }
});
