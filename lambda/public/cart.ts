import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { type CartItem, type AuthContext } from "../../types";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchGetCommand } from "@aws-sdk/lib-dynamodb";

type Bindings = {
  event: LambdaEvent;
  requestContext: AuthContext;
};

const db = new DynamoDB({});
const client = DynamoDBDocumentClient.from(db);
const TableName = process.env.DB_TABLE_NAME as string;
const app = new Hono<{ Bindings: Bindings }>();

app.put("/cart", async (c) => {
  const body: { items: CartItem[] } = await c.req.json();
  const items = body.items.map((item) => {
    return {
      pk: "products:" + item.category,
      sk: item.id,
    };
  });
  const data = await client.send(
    new BatchGetCommand({
      RequestItems: {
        [TableName]: {
          Keys: items,
          ProjectionExpression: "pk, sk, price",
        },
      },
    }),
  );

  if (!data.Responses) return c.json({ status: "error", message: "DB error" });
  const res: Record<string, number> = {};
  data.Responses[TableName].map((item) => {
    res[item.sk] = item.price;
    return null;
  });
  return c.json(res);
});

export const handler = handle(app);
