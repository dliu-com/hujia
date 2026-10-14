#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { HujiaStack } from '../lib/hujia-stack';
const app=new App();
const region=process.env.CDK_DEFAULT_REGION||'eu-west-1';
if(region!=='eu-west-1')throw new Error('Hujia must deploy in eu-west-1.');
new HujiaStack(app,'HujiaMemory',{env:{account:process.env.CDK_DEFAULT_ACCOUNT,region},tags:{service:'hujia'}});
