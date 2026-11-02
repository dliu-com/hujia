'use strict';
// Writes through CloudFront to the Lambda URL fail with a signature error without x-amz-content-sha256.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');

function loadWrapper(){
  const sent=[];
  const context={URL,Request,Headers,crypto:globalThis.crypto,location:{href:'https://jh.dliu.com/api/preview',origin:'https://jh.dliu.com'},fetch:async request=>{sent.push(request);return new Response('{}');}};
  context.globalThis=context;
  new Function('globalThis','location','URL','Request','Headers','crypto',fs.readFileSync(path.join(root,'web/api-fetch.js'),'utf8'))(context,context.location,URL,Request,Headers,context.crypto);
  return {fetch:context.fetch,sent};
}

test('same-origin writes carry the SHA-256 of their body',async()=>{
  const {fetch,sent}=loadWrapper();
  const body=JSON.stringify({version:3,text:'记得'});
  await fetch('/api/notes/bonfire',{method:'PUT',headers:{'content-type':'application/json'},body});
  assert.equal(sent[0].url,'https://jh.dliu.com/api/notes/bonfire');
  assert.equal(sent[0].headers.get('x-amz-content-sha256'),crypto.createHash('sha256').update(body).digest('hex'));
  assert.equal(sent[0].headers.get('content-type'),'application/json');
  assert.equal(await sent[0].text(),body);
  await fetch('/api/memories',{method:'POST'});
  assert.equal(sent[1].headers.get('x-amz-content-sha256'),crypto.createHash('sha256').update('').digest('hex'));
});

test('reads and direct S3 uploads are left unchanged',async()=>{
  const {fetch,sent}=loadWrapper();
  await fetch('/api/story',{cache:'no-store'});
  await fetch('https://bucket.s3.eu-west-1.amazonaws.com/upload?X-Amz-Signature=x',{method:'PUT',body:'file'});
  assert.equal(sent[0].headers.has('x-amz-content-sha256'),false);
  assert.equal(sent[1].headers.has('x-amz-content-sha256'),false);
});

test('Lambda-served pages load the wrapper before their own scripts',async()=>{
  process.env.FILES_BUCKET ||= 'test-bucket';
  process.env.AWS_REGION ||= 'eu-west-1';
  const html=(await require('../lambda/api/preview.js').page('library')).body;
  const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(scripts[0],'/api-fetch.js');
});
