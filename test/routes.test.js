'use strict';
// The CloudFront viewer-request function (lib/routes.cjs): host lock, /docs routing and redirects, guest photo allowlist.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/routes.cjs'),'utf8'),context);
const route=(uri,host='jh.dliu.com')=>context.handler({request:{uri,querystring:{},headers:host?{host:{value:host}}:{}}});

test('only jh.dliu.com is served; the *.cloudfront.net name and missing hosts redirect',()=>{
  for(const host of ['d3example.cloudfront.net','evil.example','jh.dliu.com.evil.example','JH.DLIU.COM.',''])
    for(const uri of ['/','/api/me','/api/guest/guestSea']){const r=route(uri,host);assert.equal(r.statusCode,301,`${host}${uri}`);assert.equal(r.headers.location.value,`https://jh.dliu.com${uri}`);}
});

test('/docs, /docs/cost and /docs/security serve docs.html; the old About and Security addresses move there',()=>{
  for(const uri of ['/docs','/docs/cost','/docs/security'])assert.equal(route(uri).uri,'/docs.html',uri);
  for(const [from,to] of [['/about','/docs'],['/about/','/docs'],['/docs/','/docs'],['/security','/docs/security'],['/security/','/docs/security']]){const r=route(from);assert.equal(r.statusCode,301,from);assert.equal(r.headers.location.value,to,from);}
  assert.equal(route('/').uri,'/index.html');
  assert.equal(route('/old-website').uri,'/api/old-website');
  assert.equal(route('/app.js').uri,'/app.js');
  assert.equal(route('/api/story').uri,'/api/story');
});

test('only the two reviewed scenery photos map into the private bucket',()=>{
  assert.equal(route('/api/guest/guestSea').uri,'/trips/preview/guestSea');
  assert.equal(route('/api/guest/guestHarbour').uri,'/trips/preview/guestHarbour');
  for(const name of ['portrait','provisional','letter','guestsea','guestSea.jpg','guestSea/','..%2Fportrait','../portrait','constructor','__proto__','toString','hasOwnProperty',''])
    assert.equal(route('/api/guest/'+name).statusCode,404,name);
  assert.equal(route('/api/guest').uri,'/api/guest');
});
