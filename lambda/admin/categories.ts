import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { getPresignedUrl } from "../utils/lib";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);
const TableName = process.env.DB_TABLE_NAME;

type Bindings = {
  event: LambdaEvent;
};
const region = process.env.REGION as string;
const Bucket = process.env.BUCKET_NAME as string;
const s3Client = new S3Client({ region });

const app = new Hono<{ Bindings: Bindings }>();
app.post("/admin/categories", async (c) => {
  const body = await c.req.json();
  // creates image = {category}.{file-extention}
  const image = `${body.category}.${body.image.split(".")[body.image.split(".").length - 1]}`;
  let url = "";
  let res = await db.get({
    TableName,
    Key: {
      pk: "categories",
      sk: "metadata",
    },
  });

  // Creates 'categories' item in db that holds category metadata
  if (!res.Item) {
    db.put({
      TableName,
      Item: {
        pk: "categories",
        sk: "metadata",
        [body.category]: { qty: 0, image },
      },
    });
    url = await getPresignedUrl(`categories/${image}`);
    return c.json({ imgUrl: url });
  }
  if (res.Item[body.category])
    return c.json({ status: "error", message: "category already exists" });
  res = await db.update({
    TableName,
    UpdateExpression: `set ${body.category} = :category`,
    ExpressionAttributeValues: {
      ":category": { qty: 0, image },
    },
    Key: {
      pk: "categories",
      sk: "metadata",
    },
  });
  if (res.$metadata.httpStatusCode === 200) {
    url = await getPresignedUrl(`categories/${image}`);
    return c.json({ imgUrl: url });
  }
  c.status(500);
  return c.json({ status: "error", message: "category creation failed" });
});

app.patch("/admin/categories", async (c) => {
  type updateCategoryBody = {
    initCategory: string;
    updated: {
      category?: string;
      image?: string;
    };
  };
  let imgUrl: string | undefined;
  const body: updateCategoryBody = await c.req.json();
  const image = body.updated.image
    ? `${body.updated.category}.${body.updated.image.split(".")[body.updated.image.split(".").length - 1]}`
    : undefined;
  const { Item } = await db.get({
    TableName,
    Key: {
      pk: "categories",
      sk: "metadata",
    },
    ProjectionExpression: body.initCategory,
  });
  if (!Item) return c.json({ status: "error", message: "category not found" });

  //Update if the category name is changed
  if (body.updated.category && Item) {
    await db.update({
      TableName,
      Key: {
        pk: "categories",
        sk: "metadata",
      },
      UpdateExpression: `remove ${body.initCategory}`,
    });
  }
  await db.update({
    TableName,
    Key: {
      pk: "categories",
      sk: "metadata",
    },
    UpdateExpression: `set ${body.updated.category}= :category`,
    ExpressionAttributeValues: {
      ":category": {
        ...Item[body.initCategory],
        image: image ?? Item[body.initCategory].image,
      },
    },
    ReturnValues: "UPDATED_NEW",
  });

  // Delete the old image and send new presigned URL if image is updated
  if (Item && Item[body.initCategory].image && image) {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket,
        Key: `categories/${Item[body.initCategory].image}`,
      }),
    );
    imgUrl = await getPresignedUrl(`categories/${image}`);
  }
  return c.json({ imgUrl });
});

export const handler = handle(app);
