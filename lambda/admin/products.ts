import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { AuthContext, Product } from '../../types'
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { ulid } from "ulidx";

type Bindings = {
    event: AuthContext
}
const TableName = process.env.DB_TABLE_NAME;

const app = new Hono<{ Bindings: Bindings }>()

const client = new DynamoDB({})
const db = DynamoDBDocument.from(client)

app.post('/admin/products', async (c) => {
    const body: Omit<Product, "id"> = await c.req.json()
    try {
        const result = await db.put({
            TableName,
            Item: {
                pk: "product",
                sk: ulid(),
                lsi: body.category,
                thumbnail: body.thumbnail,
                price: body.price,
                title: body.title,
                ratings: body.ratings,
                images: body.images,
                variants: body.variants,
                info: body.info,
                specs: body.specs
            },
        })
        if (result.$metadata.httpStatusCode !== 200) return c.text("Couldn't add product")
        return c.text("Product Added")
    } catch (error: any) {
        throw new Error(error)
    }
})
app.delete('/admin/products/:id', async (c) => {
    const id = c.req.param('id').split("-")
    try {
        const result = await db.delete({
            TableName,
            Key: {
                pk: id[0],
                sk: id[1]
            }
        })
        if (result.$metadata.httpStatusCode !== 200) return c.text("Couldn't delete product")
        return c.text("Product Deleted")
    } catch (error: any) {
        throw new Error(error)
    }
})

export const handler = handle(app)
