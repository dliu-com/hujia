'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const {S3Client,GetPublicAccessBlockCommand,GetBucketOwnershipControlsCommand,GetBucketPolicyStatusCommand,PutObjectCommand}=require('@aws-sdk/client-s3');
const root=path.join(__dirname,'..');
async function main(){
  require('./check-aws-identity').assertNonRootIdentity();
  const deployment=JSON.parse(fs.readFileSync(path.join(root,'.local/deploy-outputs.json'),'utf8')).HujiaMemory;
  const bucket=deployment.FilesBucketName;
  const directory=path.join(root,'.local/live-assets');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  const redacted=JSON.parse(fs.readFileSync(path.join(root,'.local/media/provisional-manifest.json'),'utf8'));
  if(manifest.provisional.sha256!==redacted.sha256)throw new Error('The licence asset differs from the reviewed redacted raster.');
  const s3=new S3Client({region:'eu-west-1'});
  const [block,owner,policy]=await Promise.all([s3.send(new GetPublicAccessBlockCommand({Bucket:bucket})),s3.send(new GetBucketOwnershipControlsCommand({Bucket:bucket})),s3.send(new GetBucketPolicyStatusCommand({Bucket:bucket}))]);
  for(const key of ['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'])if(block.PublicAccessBlockConfiguration[key]!==true)throw new Error('S3 public access must be blocked.');
  if(owner.OwnershipControls.Rules[0].ObjectOwnership!=='BucketOwnerEnforced'||policy.PolicyStatus.IsPublic)throw new Error('Private bucket ownership/policy check failed.');
  async function upload(key,file,type,sha){const bytes=fs.readFileSync(file);const digest=createHash('sha256').update(bytes).digest();if(sha&&digest.toString('hex')!==sha)throw new Error('Prepared asset checksum changed.');await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:type,CacheControl:'private, no-store',ChecksumSHA256:digest.toString('base64'),Metadata:{sha256:digest.toString('hex')}}));}
  const selection=process.argv.find(a=>a.startsWith('--assets='))?.slice(9).split(',');
  if(selection?.some(name=>!Object.hasOwn(manifest,name)))throw new Error('Selected media is absent from the manifest.');
  const queue=process.argv.includes('--pages-only')?[]:Object.entries(manifest).filter(([name])=>!selection||selection.includes(name));let done=0;
  await Promise.all(Array.from({length:3},async()=>{while(queue.length){const [name,asset]=queue.shift();if(!/^[A-Za-z0-9-]+$/.test(name))throw new Error('Invalid asset name.');await upload('trips/preview/'+name,path.join(directory,name),asset.type,asset.sha256);done++;if(done%10===0)console.log(`Uploaded ${done} original-quality media assets.`);}}));
  for(const [file,type] of [['manifest.json','application/json'],['current.html','text/html; charset=utf-8'],['old-website.html','text/html; charset=utf-8']])await upload('preview/'+file,path.join(directory,file),type);
  console.log(`Published ${done} private media assets and authenticated pages. No original identity PDF was uploaded.`);
}
main().catch(error=>{console.error('Preview upload failed: '+error.name+' '+error.message);process.exitCode=1;});
