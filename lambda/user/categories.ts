import { Hono } from 'hono'
import { handle, LambdaEvent } from 'hono/aws-lambda'
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'

type Bindings = {
  event: LambdaEvent
}

const TableName = process.env.DB_TABLE_NAME;
const dbClient = new DynamoDB({})
const db = DynamoDBDocument.from(dbClient)

const app = new Hono<{ Bindings: Bindings }>()


app.get('/categories', async (c) => {
  const { Item } = await db.get({
    TableName,
    Key: {
      pk: "categories",
      sk: "metadata"
    }
  })
  if (!Item) return c.json({ status: 'error', message: 'no categories found' })
  return c.json(Item)
})

app.get('/categories/:category', async (c) => {
  const { Items } = await db.query({
    TableName,
    KeyConditionExpression: "pk = :category",
    ExpressionAttributeValues: {
      ":category": "products:" + c.req.param("category"),
    },
    ProjectionExpression: "pk, sk, thumbnail, price, title"
  })
  if (!Items) return c.json({ status: 'error', message: 'no categories found' })
  return c.json(Items)
})
export const handler = handle(app)
