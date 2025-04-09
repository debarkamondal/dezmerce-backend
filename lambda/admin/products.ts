import { PutObjectCommand, S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
const Bucket = process.env.BUCKET_NAME;
const region = process.env.REGION as string;

const app = new Hono<{ Bindings: Bindings }>()

const dbClient = new DynamoDB({})
const db = DynamoDBDocument.from(dbClient)
const s3Client = new S3Client({ region });

const getPresignedUrl = (id: string, images: string[]) => {
    const preSignedUrls = images.map((key) => {
        const command = new PutObjectCommand({ Bucket, Key: `products/${id}/${key}` });
        return getSignedUrl(s3Client, command, { expiresIn: 3600 });
    })
    return preSignedUrls
};

app.post('/admin/products', async (c) => {
    const body: Omit<Product, "id"> = await c.req.json()
    try {
        const id = ulid();
        const imageUrls = await Promise.all(getPresignedUrl(id, [body.thumbnail, ...body.images]))
        const result = await db.put({
            TableName,
            Item: {
                pk: "product",
                sk: id,
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
        if (result.$metadata.httpStatusCode !== 200) {
            return c.json({status: "error", message:"Couldn't add product"})
        }
        return c.json({ imageUrls })
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
            },
            ReturnValues: 'ALL_OLD'
        })
        if (result.$metadata.httpStatusCode !== 200) return c.json({status:"error", message: "DB error" }, 400)
        const { $metadata } = await s3Client.send(
            new DeleteObjectsCommand({
                Bucket,
                Delete: {
                    Objects: [result.Attributes?.thumbnail, ...result.Attributes?.images].map((key: string) => ({ Key: `products/${id[1]}/${key}` })),
                },
            }),
        );
        if ($metadata.httpStatusCode !== 200) return c.json({status:"error", message: "S3 error"}, 400)
            return c.json({status: "success", messages: "Product deleted"})
    } catch (error: any) {
        throw new Error(error)
    }
})

export const handler = handle(app)
