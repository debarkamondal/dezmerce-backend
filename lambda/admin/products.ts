import { S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { type AuthEvent, type resProduct } from "../../types";
import { ulid } from "ulidx";
import { getPresignedUrl } from "../utils/lib";

type Bindings = {
  event: AuthEvent;
};
const TableName = process.env.DB_TABLE_NAME;
const Bucket = process.env.BUCKET_NAME;
const region = process.env.REGION as string;

const app = new Hono<{ Bindings: Bindings }>();

const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);
const s3Client = new S3Client({ region });

const genUpdateExp = (body: any) => {
  let updateExp: string[] = [];
  let ExpAttrVals: { [key: string]: string } = {};
  const keys = Object.keys(body);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === "category") updateExp.push(`lsi = :gender`);
    else updateExp.push(` ${keys[i]}= :${keys[i]}`);
    Object.assign(ExpAttrVals, { [`:${keys[i]}`]: body[keys[i]] });
  }
  return {
    UpdateExpression: updateExp.join(", "),
    ExpressionAttributeValues: ExpAttrVals,
  };
};

app.post("/admin/products", async (c) => {
  const body: Omit<resProduct, "id"> = await c.req.json();
  try {
    const id = ulid();
    const result = await db.put({
      TableName,
      Item: {
        pk: "products:" + body.category,
        sk: id,
        lsi: body.gender,
        title: body.title,
        images: body.images,
        thumbnail: body.thumbnail,
        price: body.price,
        ratings: body.ratings,
        variants: body.variants,
        description: body.description,
        specs: body.specs,
      },
    });
    const categories = await db.get({
      TableName,
      Key: {
        pk: "categories",
        sk: "metadata",
      },
      ProjectionExpression: body.category,
    });
    if (!categories.Item)
      return c.json({ status: "error", message: "DB error" });
    const res = await db.update({
      TableName,
      Key: {
        pk: "categories",
        sk: "metadata",
      },
      UpdateExpression: `set ${body.category} = :category`,
      ExpressionAttributeValues: {
        ":category": {
          ...categories.Item[body.category],
          qty: categories.Item[body.category].qty + 1,
        },
      },
    });
    if (res.$metadata.httpStatusCode !== 200)
      return c.json({ status: "error", message: "DB error" });
    const thumbnailUrl = await getPresignedUrl(
      `products/${body.category}/${id}/${body.thumbnail}`,
    );
    const imageUrls = body.images.map((image) =>
      getPresignedUrl(`products/${body.category}/${id}/${image}`),
    );
    return c.json({
      id: body.category + "-" + id,
      thumbnail: thumbnailUrl,
      imageUrls: await Promise.all(imageUrls),
    });
  } catch (error: any) {
    throw new Error(error);
  }
});
app.delete("/admin/products", async (c) => {
  const { category, id } = await c.req.json();
  try {
    const result = await db.delete({
      TableName,
      Key: {
        pk: "products:" + category,
        sk: id,
      },
      ReturnValues: "ALL_OLD",
    });
    if (result.$metadata.httpStatusCode !== 200)
      return c.json({ status: "error", message: "DB error" }, 400);
    const { $metadata } = await s3Client.send(
      new DeleteObjectsCommand({
        Bucket,
        Delete: {
          Objects: [
            result.Attributes?.thumbnail,
            ...result.Attributes?.images,
          ].map((key: string) => ({
            Key: `products/${id.split("-")[0]}/${id.split("-")[1]}/${key}`,
          })),
        },
      }),
    );
    if ($metadata.httpStatusCode !== 200)
      return c.json({ status: "error", message: "S3 error" }, 400);
    return c.json({ status: "success", messages: "Product deleted" });
  } catch (error: any) {
    throw new Error(error);
  }
});

//FIX: Wrong PK & SK
app.patch("/admin/products", async (c) => {
  const body: Partial<resProduct> = await c.req.json();
  const { UpdateExpression, ExpressionAttributeValues } = genUpdateExp(body);
  try {
    const result = await db.update({
      TableName,
      Key: {
        pk: "product:" + body.category,
        sk: body.id,
      },
      UpdateExpression: "set" + " " + UpdateExpression,
      ExpressionAttributeValues,
    });
    if (result.$metadata.httpStatusCode !== 200)
      return c.json({ status: "error", message: "DB error" });
    const thumbnailUrl = await getPresignedUrl(
      `products/${body.category}/${body.id}/${body.thumbnail}`,
    );
    const imageUrls = body.images?.map((image) =>
      getPresignedUrl(`products/${body.category}/${body.id}/${image}`),
    );
    return c.json({
      id: body.category + "-" + body.id,
      thumbnail: thumbnailUrl,
      imageUrls: imageUrls ? await Promise.all(imageUrls) : null,
    });
  } catch (error: any) {
    throw new Error(error);
  }
});

export const handler = handle(app);
