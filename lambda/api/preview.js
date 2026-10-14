'use strict';
const { createFiles } = require('./s3');
let client, cache, cachedAt=0;
const files=createFiles();
async function read(key){
  const {S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');
  client ||= new S3Client({});
  const result=await client.send(new GetObjectCommand({Bucket:process.env.FILES_BUCKET,Key:key}));
  return result.Body.transformToString();
}
async function manifest(){if(!cache||Date.now()-cachedAt>60000){cache=JSON.parse(await read('preview/manifest.json'));cachedAt=Date.now();}return cache;}
async function page(kind){
  const body=kind==='library'?require('node:fs').readFileSync(require('node:path').join(__dirname,'library.html'),'utf8'):await read(kind==='old'?'preview/old-website.html':'preview/current.html');
  const bucket=`https://${process.env.FILES_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
  return {statusCode:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':`default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${bucket}; media-src 'self' blob: ${bucket}; font-src 'self' data:; connect-src 'self' ${bucket}; frame-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`},body};
}
async function media(name){const all=await manifest();if(!Object.hasOwn(all,name))return null;return files.downloadUrl('preview',name,all[name]);}
// Only these reviewed scenery copies can be shown without signing in. Never derive this from user uploads.
const guestAssets = Object.freeze(['guestSea','guestHarbour']);
async function guestMedia(name){return guestAssets.includes(name)?media(name):null;}
module.exports={page,media,guestMedia,guestAssets};
