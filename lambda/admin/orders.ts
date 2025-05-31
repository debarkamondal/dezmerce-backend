import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import Razorpay from "razorpay";

type Bindings = {
  event: LambdaEvent;
};

const TableName = process.env.DB_TABLE_NAME as string;

const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);

const app = new Hono<{ Bindings: Bindings }>();

app.get("/admin/orders", async (c) => {
  const status = c.req.query("status");
  try {
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
    if (orders.$metadata.httpStatusCode !== 200) throw new Error("DB Error");
    return c.json(orders.Items);
  } catch (error) {
    c.status(400);
    return c.json({ message: error });
  }
});
app.post("/admin/orders/ship/:orderId", async (c) => {
  try {
    const body: { trackingId: string; email: string } = await c.req.json();
    const res = await db.update({
      TableName,
      Key: {
        pk: "order",
        sk: body.email + ":" + c.req.param("orderId"),
      },
      UpdateExpression: "SET trackingId = :trackingId, lsi = :status",
      ExpressionAttributeValues: {
        ":trackingId": body.trackingId,
        ":status": "shipped",
      },
    });
    if (res.$metadata.httpStatusCode !== 200) throw new Error("DB error");
    return c.json({ status: "success" });
  } catch (error) {
    c.status(400);
    return c.json({ message: error });
  }
});
app.post("/admin/orders/cancel/:orderId", async (c) => {
  const pgId = process.env.PAYMENT_GW_KEY_ID as string;
  const pgSecret = process.env.PAYMENT_GW_KEY_SECRET as string;

  var instance = new Razorpay({
    key_id: pgId,
    key_secret: pgSecret,
  });

  try {
    const body: { email: string } = await c.req.json();
    const orderId = c.req.param("orderId");
    const { Item } = await db.get({
      TableName,
      Key: {
        pk: "order",
        sk: body.email + ":" + orderId,
      },
      ProjectionExpression: "#total_price, payment_id",
      ExpressionAttributeNames: {
        "#total_price": "total",
      },
    });
    if (!Item) throw new Error("Couldn't fetch orderInfo");

    const refund = await instance.payments.refund(Item.payment_id, {
      amount: Item.total * 100,
      speed: "normal",
      receipt: "order:" + c.req.param("orderId"),
    });
    if (refund.status !== "processed" && refund.status !== "pending")
      throw new Error("Couldn't process the refund");
    const payload = {
      TableName,
      Key: {
        pk: "order",
        sk: body.email + ":" + orderId,
      },
      UpdateExpression: "SET lsi = :status, refundId= :refundId",
      ExpressionAttributeValues: {
        ":status": "cancelled",
        ":refundId": refund.id,
      },
    };

    const res = await db.update(payload);
    if (res.$metadata.httpStatusCode !== 200) throw new Error("DB error");
    return c.json({ status: "success" });
  } catch (error) {
    c.status(400);
    return c.json({ message: error });
  }
});
export const handler = handle(app);
