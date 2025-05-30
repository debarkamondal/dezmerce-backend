import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";

type Bindings = {
  event: LambdaEvent;
};

const TableName = process.env.DB_TABLE_NAME;

const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);

const app = new Hono<{ Bindings: Bindings }>();

app.get("/admin/orders", async (c) => {
  const status = c.req.query("status");
  const orders = await db.query({
    TableName,
    IndexName: "lsi",
    KeyConditionExpression: "pk = :pk AND lsi=:lsi",
    ExpressionAttributeValues: {
      ":pk": "order",
      ":lsi": status || "paid",
    },
    ScanIndexForward: false,
  });
  if (orders.$metadata.httpStatusCode !== 200)
    return c.json({ status: "error", message: "DB error" });
  return c.json(orders.Items);
});
export const handler = handle(app);
