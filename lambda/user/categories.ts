import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { dbProduct, resProduct } from "../../types";

type Bindings = {
  event: LambdaEvent;
};

const TableName = process.env.DB_TABLE_NAME;
const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);

const app = new Hono<{ Bindings: Bindings }>();

app.get("/categories", async (c) => {
  const { Item } = await db.get({
    TableName,
    Key: {
      pk: "categories",
      sk: "metadata",
    },
  });
  if (!Item) return c.json({ status: "error", message: "no categories found" });
  delete Item.pk;
  delete Item.sk;
  return c.json(Item);
});

app.get("/categories/:category", async (c) => {
  const res = await db.query({
    TableName,
    KeyConditionExpression: "pk = :category",
    ExpressionAttributeValues: {
      ":category": "products:" + c.req.param("category"),
    },
    ProjectionExpression: "pk, sk, thumbnail, price, title, lsi",
  });
  if (!res.Items)
    return c.json({ status: "error", message: "no categories found" });
  const Items: dbProduct[] = res.Items as dbProduct[];
  const products = Items.map((item) => {
    const { pk, sk, lsi, ...rest } = item;
    const payload: resProduct = {
      category: pk.split(":")[1],
      id: sk,
      gender: lsi,
      ...rest,
    };
    return payload;
  });
  return c.json(products);
});
export const handler = handle(app);
