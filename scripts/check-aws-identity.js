'use strict';
const {execFileSync}=require('node:child_process');
function assertNonRootIdentity(){const arn=execFileSync('aws',['sts','get-caller-identity','--query','Arn','--output','text'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();if(arn.endsWith(':root'))throw new Error('Root credentials are prohibited. Select the existing Dewei IAM user or an authorized role.');return arn;}
module.exports={assertNonRootIdentity};
if(require.main===module){assertNonRootIdentity();console.log('Non-root AWS identity verified.');}
