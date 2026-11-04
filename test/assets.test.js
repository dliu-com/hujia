'use strict';
// Pages link the site's own scripts and styles by content hash, so a new page never runs with an old cached file.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {stamp}=require('../lambda/api/assets');
const root=path.join(__dirname,'..'),web=path.join(root,'web');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(web,file))).digest('hex').slice(0,10);
const versions=Object.fromEntries(fs.readdirSync(web).filter(f=>/\.(js|css|png)$/.test(f)).map(f=>['/'+f,hash(f)]));

test('stamp adds ?v=<hash> to the site\'s own files only',()=>{
  const html='<link rel="stylesheet" href="https://files.dliu.com/dliu.com/ui/v1/dl.css"><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script><img src="/icon.png"><a href="/docs/health.md">md</a><script src="/missing.js"></script><a href="/constructor.js">';
  const out=stamp(html,{'/style.css':'aaaa','/app.js':'bbbb','/icon.png':'cccc'});
  assert.ok(out.includes('href="/style.css?v=aaaa"')&&out.includes('src="/app.js?v=bbbb"')&&out.includes('src="/icon.png?v=cccc"'));
  for(const kept of ['href="https://files.dliu.com/dliu.com/ui/v1/dl.css"','href="/docs/health.md"','src="/missing.js"','href="/constructor.js"'])assert.ok(out.includes(kept),kept);
});

test('every script, stylesheet and icon a page links is a hashed site file',()=>{
  const pages=[...fs.readdirSync(web).filter(f=>f.endsWith('.html')).map(f=>path.join(web,f)),path.join(root,'lambda/api/library.html')];
  for(const page of pages){
    const html=fs.readFileSync(page,'utf8'),links=[...html.matchAll(/\b(?:src|href)="(\/[^"?#]+\.(?:js|css|png))"/g)].map(m=>m[1]);
    assert.ok(links.length,page);
    for(const link of links)assert.ok(versions[link],`${path.basename(page)} links ${link}`);
    assert.doesNotMatch(stamp(html,versions),/\b(?:src|href)="\/[^"?#]+\.(?:js|css|png)"/,page);
  }
});

test('pages the Lambda serves are stamped from the deploy\'s hashes, including the injected /api-fetch.js',async()=>{
  process.env.ASSET_VERSIONS=JSON.stringify(versions);
  try{
    const {page}=require('../lambda/api/preview');
    const {body}=await page('library');
    for(const file of ['/api-fetch.js','/library.js','/library.css','/style.css','/edit-conflict.js'])assert.ok(body.includes(`${file}?v=${versions[file]}"`),file);
  }finally{delete process.env.ASSET_VERSIONS;}
});
