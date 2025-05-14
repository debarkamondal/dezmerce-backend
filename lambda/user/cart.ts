import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { type AuthContext } from "../../types";

type Bindings = {
  event: LambdaEvent;
  requestContext: AuthContext;
};

const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);
const TableName = process.env.DB_TABLE_NAME;
const app = new Hono<{ Bindings: Bindings }>();

app.get("/cart", async (c) => {
  try {
    const cart = await db.get({
      TableName,
      Key: {
        pk: "cart",
        sk: c.env.requestContext.authorizer.lambda.email,
      },
    });
    if (!cart.Item) return c.json({ items: [] });
    return c.json(cart.Item.items);
  } catch (error) {
    return c.json({ status: "error", message: error });
  }
});

app.post("/cart", async (c) => {
  try {
    const cart = await db.put({
      TableName,
      Item: {
        pk: "cart",
        sk: c.env.requestContext.authorizer.lambda.email,
        items: (await c.req.json()).items,
      },
    });
    if (cart.$metadata.httpStatusCode !== 200)
      throw new Error("couldn't update cart");
    return c.json(cart);
  } catch (error: any) {
    return c.json({ status: "error", message: error });
  }
});

export const handler = handle(app);
