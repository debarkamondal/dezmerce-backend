import { PutObjectCommand, S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from '@aws-sdk/lib-dynamodb'
import { Hono } from 'hono'
import { handle } from 'hono/aws-lambda'
import { AuthEvent, Product } from '../../types'
import { ulid } from "ulidx";

type Bindings = {
    event: AuthEvent
}
const TableName = process.env.DB_TABLE_NAME;
const Bucket = process.env.BUCKET_NAME;
const region = process.env.REGION as string;

const app = new Hono<{ Bindings: Bindings }>()

const dbClient = new DynamoDB({})
const db = DynamoDBDocument.from(dbClient)
const s3Client = new S3Client({ region });

const getPresignedUrl = (key: string, image: string) => {
    const command = new PutObjectCommand({ Bucket, Key: `products/${key}/${image}`, ContentType: "image/*" });
    return getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

const genUpdateExp = (body: any) => {
    let updateExp: string[] = [];
    let ExpAttrVals: { [key: string]: string } = {}
    const keys = Object.keys(body)
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] === 'category') updateExp.push(`lsi = :category`)
        else updateExp.push(` ${keys[i]}= :${keys[i]}`)
        Object.assign(ExpAttrVals, { [`:${keys[i]}`]: body[keys[i]] })
    }
    return { UpdateExpression: updateExp.join(", "), ExpressionAttributeValues: ExpAttrVals }
}


app.post('/admin/products', async (c) => {
    const body: Omit<Product, "id"> = await c.req.json()
    try {
        const id = ulid();
        const result = await db.put({
            TableName,
            Item: {
                pk: 'product',
                sk: body.category + "-" + id,
                lsi: body.gender,
                title: body.title,
                images: body.images,
                thumbnail: body.thumbnail,
                price: body.price,
                ratings: body.ratings,
                variants: body.variants,
                description: body.description,
                specs: body.specs
            },
        })
        if (result.$metadata.httpStatusCode !== 200) {
            return c.json({ status: "error", message: "DB error" })
        }
        const thumbnailUrl = await getPresignedUrl(`${body.category}/${id}`, body.thumbnail)
        const imageUrls = body.images.map((image) => getPresignedUrl(`${body.category}/${id}`, image))
        return c.json({ id: body.category + "-" + id, thumbnail: thumbnailUrl, imageUrls: await Promise.all(imageUrls) })
    } catch (error: any) {
        throw new Error(error)
    }
})
app.delete('/admin/products', async (c) => {
    const { id } = await c.req.json()
    try {
        const result = await db.delete({
            TableName,
            Key: {
                pk: "product",
                sk: id
            },
            ReturnValues: 'ALL_OLD'
        })
        if (result.$metadata.httpStatusCode !== 200) return c.json({ status: "error", message: "DB error" }, 400)
        const { $metadata } = await s3Client.send(
            new DeleteObjectsCommand({
                Bucket,
                Delete: {
                    Objects: [result.Attributes?.thumbnail, ...result.Attributes?.images].map((key: string) => ({ Key: `products/${id.split("-")[0]}/${id.split("-")[1]}/${key}` })),
                },
            }),
        );
        if ($metadata.httpStatusCode !== 200) return c.json({ status: "error", message: "S3 error" }, 400)
        return c.json({ status: "success", messages: "Product deleted" })
    } catch (error: any) {
        throw new Error(error)
    }
})
app.patch('/admin/products', async (c) => {
    const body = await c.req.json()
    const { UpdateExpression, ExpressionAttributeValues } = genUpdateExp(body)
    try {
        const result = await db.update({
            TableName,
            Key: {
                pk: "product",
                sk: body.category + "-" + body.id
            },
            UpdateExpression: "set" + " " + UpdateExpression,
            ExpressionAttributeValues
        }
        )
        if (result.$metadata.httpStatusCode !== 200) return c.json({ status: "error", message: "DB error" })
        const thumbnailUrl = await getPresignedUrl(body.id, body.thumbnail)
        const imageUrls = body.images.map((image: string) => getPresignedUrl(body.id, image))
        return c.json({ thumbnail: thumbnailUrl, imageUrls: await Promise.all(imageUrls) })

    } catch (error: any) {
        throw new Error(error)
    }
})

export const handler = handle(app)
