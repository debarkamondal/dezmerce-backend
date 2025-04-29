import { Hono } from "hono"
import { handle } from "hono/aws-lambda"
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { AuthEvent } from "../../types";

type Bindings = {
    event: AuthEvent
}

const dbClient = new DynamoDB({})
const db = DynamoDBDocument.from(dbClient)
const TableName = process.env.DB_TABLE_NAME;
const app = new Hono<{ Bindings: Bindings }>()


app.get('/products/:id', async (c) => {
    try {
        const { Item } = await db.get({
            TableName,
            Key: {
                pk: c.req.param('id').split('-')[0],
                sk: c.req.param('id').split('-')[1]
            },
        })
        if (!Item) return c.json({ status: "error", message: "No product found with given id" })
        return c.json({
            category: Item.pk,
            id: Item.sk,
            gender: Item.gender,
            title: Item.title,
            images: Item.images,
            thumbnail: Item.thumbnail,
            price: Item.price,
            ratings: Item.ratings,
            variants: Item.variants,
            description: Item.description,
            specs: Item.specs
        })
    } catch (error) {
        c.status(400)
        return c.json({ status: 'error', message: error })
    }
})
app.get('/products', async (c) => {
    try {
        const data = await db.query({
            TableName,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues:{
                ":pk": "product"
            },
            ProjectionExpression: "sk, thumbnail, price, title"
        })
        return c.json(data.Items)
    } catch (error) {
        c.status(400)
        return c.json({ status: 'error', message: error })
    }
})
export const handler = handle(app)
