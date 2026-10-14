'use strict';
// Import reviewed private metadata without overwriting edits made in the shared album.
const fs=require('node:fs'),path=require('node:path');
const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,GetCommand,PutCommand}=require('@aws-sdk/lib-dynamodb');
async function main(){
  require('./check-aws-identity').assertNonRootIdentity();
 const input=process.argv[2];if(!input)throw new Error('Usage: node scripts/import-memories.js <private-content.json>');
 const outputs=JSON.parse(fs.readFileSync(path.join(__dirname,'../.local/deploy-outputs.json'))).HujiaMemory;
 const records=JSON.parse(fs.readFileSync(path.resolve(input))).memories;
 if(!Array.isArray(records))throw new Error('Expected a memories array');
 const client=DynamoDBDocumentClient.from(new DynamoDBClient({region:'eu-west-1'}));let added=0,kept=0;
 for(const memory of records){
  if(!/^memory-[a-z0-9-]{1,70}$/.test(memory.id)||memory.kind!=='memory'||memory.version!==1||!memory.photos?.length||memory.publicPreview!==false)throw new Error('Invalid reviewed private memory');
  const Key={pk:'OUR-STORY',sk:memory.id};
  const existing=(await client.send(new GetCommand({TableName:outputs.TableName,Key,ConsistentRead:true}))).Item;
  if(existing){kept++;continue;}
  try{await client.send(new PutCommand({TableName:outputs.TableName,Item:{...memory,...Key},ConditionExpression:'attribute_not_exists(pk)'}));added++;}catch(e){if(e.name==='ConditionalCheckFailedException')kept++;else throw e;}
 }
 console.log(`Imported ${added} reviewed private memories; preserved ${kept} existing records.`);
}
main().catch(e=>{console.error('Import failed: '+e.message);process.exitCode=1;});
