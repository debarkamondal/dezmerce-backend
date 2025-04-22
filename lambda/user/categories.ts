import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { Hono } from 'hono'
import { handle, LambdaEvent } from 'hono/aws-lambda'
type Bindings = {
    event: LambdaEvent
}

const TableName = process.env.DB_TABLE_NAME;

const dbClient = new DynamoDB({})
const db = DynamoDBDocument.from(dbClient)

const app = new Hono<{ Bindings: Bindings }>()

app.post('/admin/categories', async (c) => {
    const body = await c.req.json()
    let res = await db.get({
        TableName,
        Key: {
            pk: 'categories',
            sk: 'metadata'
        }
    })

    // Creates 'categories' item in db that holds category metadata
    if (!res.Item) {
        db.put({
            TableName,
            Item: {
                pk: 'categories',
                sk: 'metadata',
                [body.category]: { qty: 0 },
            }
        })
        return c.json({ status: "success", message: "category created" })
    }
    if (res.Item[body.category]) return c.json({ status: "error", message: "category already exists" })
    res = await db.update({
        TableName,
        UpdateExpression: `set ${body.category} = :category`,
        ExpressionAttributeValues: {
            ":category": { qty: 0 }
        },
        Key: {
            pk: 'categories',
            sk: 'metadata'
        },
    })
    console.log(res)
    if (res.$metadata.httpStatusCode === 200) return c.json({ status: "success", message: "category craeted" })
    c.status(500)
    return c.json({ status: "error", message: "category creation failed" })
})

app.get('/admin/categories', async (c) => {
    const { Item } = await db.get({
        TableName,
        Key: {
            pk: "categories",
            sk: "metadata"
        }
    })
    return c.json(Item)
})
export const handler = handle(app)
