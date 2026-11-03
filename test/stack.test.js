'use strict';
// Synthesizes the CDK stack and checks the security-relevant settings (least privilege, private bucket, edge behaviors).
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs'}});
const {App}=require('aws-cdk-lib');const {Template}=require('aws-cdk-lib/assertions');
const {HujiaStack}=require('../lib/hujia-stack');

const outdir=fs.mkdtempSync(path.join(os.tmpdir(),'hujia-synth-'));
const app=new App({outdir});
const stack=new HujiaStack(app,'HujiaMemory',{env:{account:'111111111111',region:'eu-west-1'}});
const template=Template.fromStack(stack).toJSON();
fs.rmSync(outdir,{recursive:true,force:true});
const resources=type=>Object.entries(template.Resources).filter(([,r])=>r.Type===type);
const list=value=>[].concat(value);
const text=value=>JSON.stringify(value);
const [mediaId]=resources('AWS::S3::Bucket').find(([id])=>id.startsWith('PrivateMedia'));
const onMedia=resource=>text(resource).includes(mediaId);

test('the API role has only the S3 and DynamoDB actions the handler uses',()=>{
  const [,policy]=resources('AWS::IAM::Policy').find(([,p])=>text(p.Properties.Roles).includes('ApiServiceRole'));
  const statements=policy.Properties.PolicyDocument.Statement;
  const actions=statements.flatMap(s=>list(s.Action));
  for(const action of actions)assert.doesNotMatch(action,/\*|DeleteObjectVersion|PutObjectRetention|PutObjectLegalHold|PutBucket|Scan|BatchWrite|DeleteItem|UpdateItem/,action);
  const dynamo=statements.filter(s=>list(s.Action).some(a=>a.startsWith('dynamodb:'))).flatMap(s=>list(s.Action)).sort();
  assert.deepEqual(dynamo,['dynamodb:GetItem','dynamodb:PutItem','dynamodb:Query']);
  const del=statements.filter(s=>list(s.Action).includes('s3:DeleteObject'));
  assert.equal(del.length,1);assert.equal(list(del[0].Resource).length,1);assert.match(text(del[0].Resource),/\/pending\/\*/);
  const put=statements.find(s=>list(s.Action).includes('s3:PutObject'));
  assert.deepEqual(list(put.Resource).map(r=>text(r).match(/\/(\w+)\/\*/)[1]).sort(),['pending','trips']);
});

test('the private bucket blocks public access, requires TLS and lets CloudFront read only the two scenery photos',()=>{
  const [,bucket]=resources('AWS::S3::Bucket').find(([id])=>id===mediaId);
  assert.deepEqual(bucket.Properties.PublicAccessBlockConfiguration,{BlockPublicAcls:true,BlockPublicPolicy:true,IgnorePublicAcls:true,RestrictPublicBuckets:true});
  assert.equal(bucket.Properties.VersioningConfiguration.Status,'Enabled');
  assert.equal(bucket.Properties.OwnershipControls.Rules[0].ObjectOwnership,'BucketOwnerEnforced');
  const [,policy]=resources('AWS::S3::BucketPolicy').find(([,p])=>onMedia(p.Properties.Bucket));
  const statements=policy.Properties.PolicyDocument.Statement;
  assert.ok(statements.some(s=>s.Effect==='Deny'&&text(s.Condition).includes('"aws:SecureTransport":"false"')));
  const allows=statements.filter(s=>s.Effect==='Allow');
  assert.equal(allows.length,1);
  assert.deepEqual(allows[0].Principal,{Service:'cloudfront.amazonaws.com'});
  assert.equal(allows[0].Action,'s3:GetObject');
  assert.deepEqual(list(allows[0].Resource).map(r=>text(r).match(/\/(trips\/preview\/\w+)"/)[1]),['trips/preview/guestSea','trips/preview/guestHarbour']);
  assert.ok(allows[0].Condition.StringEquals['AWS:SourceArn']);
});

test('CloudFront routes guest photos to the private bucket before the API, caches them, and keeps the API uncached',()=>{
  const [,distribution]=resources('AWS::CloudFront::Distribution')[0];
  const config=distribution.Properties.DistributionConfig;
  const behaviors=config.CacheBehaviors;
  assert.deepEqual(behaviors.map(b=>b.PathPattern),['old-website','api/guest/*','api/*','auth/*']);
  const guest=behaviors[1],origin=config.Origins.find(o=>o.Id===guest.TargetOriginId);
  assert.ok(text(origin.DomainName).includes(mediaId));assert.ok(origin.OriginAccessControlId);
  assert.deepEqual(guest.AllowedMethods,['GET','HEAD']);
  assert.equal(guest.OriginRequestPolicyId,undefined,'nothing from the viewer is forwarded to the private bucket');
  const [,cache]=resources('AWS::CloudFront::CachePolicy').find(([id])=>text(guest.CachePolicyId).includes(id));
  assert.equal(cache.Properties.CachePolicyConfig.ParametersInCacheKeyAndForwardedToOrigin.CookiesConfig.CookieBehavior,'none');
  assert.equal(cache.Properties.CachePolicyConfig.ParametersInCacheKeyAndForwardedToOrigin.QueryStringsConfig.QueryStringBehavior,'none');
  // CachingDisabled for the API, sign-in and the old website.
  for(const b of [behaviors[0],behaviors[2],behaviors[3]])assert.equal(b.CachePolicyId,'4135ea2d-6df8-44a3-9df3-4b5a84be39ad',b.PathPattern);
  assert.equal(config.ViewerCertificate.MinimumProtocolVersion,'TLSv1.2_2021');
  assert.deepEqual(config.Logging?.IncludeCookies??false,false);
});

test('the Lambda URL needs IAM signatures and the API logs expire',()=>{
  const [,url]=resources('AWS::Lambda::Url')[0];assert.equal(url.Properties.AuthType,'AWS_IAM');
  const [,fn]=resources('AWS::Lambda::Function').find(([id])=>id.startsWith('Api'));assert.equal(fn.Properties.ReservedConcurrentExecutions,10);
  const [,logs]=resources('AWS::Logs::LogGroup').find(([id])=>id.startsWith('ApiLogs'));assert.equal(logs.Properties.RetentionInDays,90);
});
