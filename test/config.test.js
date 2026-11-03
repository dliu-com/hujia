'use strict';
// The Entra tenant comes from the shared /dliu/entra-tenant-id; client ID and secret stay under /hujia/.
const test=require('node:test'),assert=require('node:assert/strict');
const {loadConfig,resetConfigCache,NotConfigured}=require('../lambda/api/config');
function fakeSsm({tenant='tenant-from-dliu',tenantError}={}){
  const calls=[];
  return {calls,async send(command){const input=command.input;calls.push({type:command.constructor.name,input});
    if(command.constructor.name==='GetParameterCommand'){if(tenantError){const e=new Error(tenantError);e.name=tenantError;throw e;}return {Parameter:{Name:input.Name,Value:tenant}};}
    return {Parameters:input.Names.map(Name=>({Name,Value:Name.endsWith('client-id')?'client':'secret'}))};}};
}
test.beforeEach(()=>{resetConfigCache();delete process.env.ENTRA_TENANT_ID;});

test('reads the tenant from /dliu/entra-tenant-id and only the client settings from /hujia/',async()=>{
  const ssm=fakeSsm();const config=await loadConfig(ssm,1);
  assert.equal(config.tenantId,'tenant-from-dliu');assert.equal(config.clientId,'client');assert.equal(config.clientSecret,'secret');
  assert.deepEqual(ssm.calls.find(c=>c.type==='GetParameterCommand').input,{Name:'/dliu/entra-tenant-id'});
  assert.deepEqual(ssm.calls.find(c=>c.type==='GetParametersCommand').input.Names,['/hujia/entra-client-id','/hujia/entra-client-secret']);
  assert.ok(!JSON.stringify(ssm.calls).includes('/hujia/entra-tenant-id'));
});

test('falls back to the deploy-time tenant if the shared parameter cannot be read',async()=>{
  process.env.ENTRA_TENANT_ID='tenant-from-deploy';
  assert.equal((await loadConfig(fakeSsm({tenantError:'AccessDeniedException'}),1)).tenantId,'tenant-from-deploy');
});

test('a missing tenant means sign-in is not configured',async()=>{
  await assert.rejects(loadConfig(fakeSsm({tenantError:'ParameterNotFound'}),1),NotConfigured);
  resetConfigCache();
  await assert.rejects(loadConfig(fakeSsm({tenantError:'ThrottlingException'}),1),{name:'ThrottlingException'});
});
