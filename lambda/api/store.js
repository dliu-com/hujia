'use strict';
const { HttpError } = require('./model');
function createStore() {
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const TableName = process.env.TABLE_NAME;
  const key = id => ({pk:'OUR-STORY', sk:id});
  return {
    async get(id) { const r = await db.send(new GetCommand({TableName, Key:key(id), ConsistentRead:true})); return r.Item; },
    async list() {
      let cursor; const items = [];
      do { const r = await db.send(new QueryCommand({TableName, KeyConditionExpression:'pk = :pk', ExpressionAttributeValues:{':pk':'OUR-STORY'}, ExclusiveStartKey:cursor, ConsistentRead:true})); items.push(...r.Items); cursor = r.LastEvaluatedKey; } while (cursor);
      return items;
    },
    async save(item, expected) {
      try {
        await db.send(new PutCommand({TableName, Item:{...item,...key(item.id)}, ConditionExpression:expected ? '#v = :v' : 'attribute_not_exists(pk)', ExpressionAttributeNames:expected ? {'#v':'version'} : undefined, ExpressionAttributeValues:expected ? {':v':expected} : undefined}));
      } catch (error) { if (error.name === 'ConditionalCheckFailedException') throw new HttpError(409, 'This changed on another device. Reload before saving; your text is still here.'); throw error; }
      return item;
    }
  };
}
module.exports = {createStore};
