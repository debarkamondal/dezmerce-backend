
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { getPresignedUrl } from "../utils/lib";

const dbClient = new DynamoDB({})
const db = DynamoDBDocument.from(dbClient)
const TableName = process.env.DB_TABLE_NAME;

type Bindings = {
    event: LambdaEvent
}
const app = new Hono<{ Bindings: Bindings }>()
app.post('/admin/categories', async (c) => {
    const body = await c.req.json()
    // creates image = {category}.{file-extention}
    const image = `${body.category}.${body.image.split(".")[body.image.split(".").length - 1]}`
    let url = ""
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
                [body.category]: { qty: 0, image},
            }
        })
        url = await getPresignedUrl(`categories/${image}`)
        return c.json({ imgUrl: url })
    }
    if (res.Item[body.category]) return c.json({ status: "error", message: "category already exists" })
    res = await db.update({
        TableName,
        UpdateExpression: `set ${body.category} = :category`,
        ExpressionAttributeValues: {
            ":category": { qty: 0, image}
        },
        Key: {
            pk: 'categories',
            sk: 'metadata'
        },
    })
    if (res.$metadata.httpStatusCode === 200) {
        url = await getPresignedUrl(`categories/${image}`)
        return c.json({ imgUrl: url })
    }
    c.status(500)
    return c.json({ status: "error", message: "category creation failed" })
})

export const handler = handle(app)
