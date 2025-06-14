import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { verify } from "hono/jwt";
import Razorpay from "razorpay";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";

type Bindings = {
  event: LambdaEvent;
};

const pgSecret = process.env.PAYMENT_GW_KEY_SECRET as string;
const pgId = process.env.PAYMENT_GW_KEY_ID as string;
const JWTSecret = process.env.JWTSecret as string;
const TableName = process.env.DB_TABLE_NAME as string;

const app = new Hono<{ Bindings: Bindings }>();
const instance = new Razorpay({ key_id: pgId, key_secret: pgSecret });
const dbClient = new DynamoDB({});
const db = DynamoDBDocument.from(dbClient);

app.get("/payments", async (c) => {
  // Creating an order on Razorpay
  const orderToken = await verify(c.req.header("order") as string, JWTSecret);
  const { Item } = await db.get({
    TableName,
    Key: {
      pk: "order",
      sk: orderToken.email + ":" + orderToken.id,
    },
  });

  if (!Item)
    return c.json({ status: "error", adminmessage: "Order isn't initiated" });
  if (Item.gwOrderId)
    return c.json({
      token: c.req.header("order") as string,
      prefill: {
        email: Item.user.email,
        contact: Item.user.phone,
      },
      order_id: Item.gwOrderId,
      description: "order:" + orderToken.id,
    });

  const res = await instance.orders.create({
    amount: Item.total * 100,
    currency: "INR",
    receipt: `order:${orderToken.id}`,
  });

  if (res.status !== "created")
    throw new Error("Couldn't initiate order with RazorPay");

  await db.update({
    TableName,
    Key: {
      pk: "order",
      sk: orderToken.email + ":" + orderToken.id,
    },
    UpdateExpression: "set gwOrderId = :orderId",
    ExpressionAttributeValues: {
      ":orderId": res.id,
    },
  });
  return c.json({
    token: c.req.header("order") as string,
    prefill: {
      email: Item.user.email,
      contact: Item.user.phone,
    },
    order_id: res.id,
    description: "order:" + orderToken.id,
  });
});
app.post("/payments", async (c) => {
  const data = await c.req.formData();
  const decodecToken = await verify(c.req.query("token") as string, JWTSecret);
  const { Item } = await db.get({
    TableName,
    Key: {
      pk: "order",
      sk: decodecToken.email + ":" + decodecToken.id,
    },
    ProjectionExpression: "gwOrderId",
  });
  if (!Item) return c.json({ status: "error", message: "Invalid Token" });
  const pg = {
    order_id: Item.gwOrderId,
    payment_id: data.get("razorpay_payment_id") as string,
    signature: data.get("razorpay_signature") as string,
  };
  if (!pg.order_id && !pg.payment_id && !pg.signature)
    return c.json({ status: "error", message: "Malformed data" });

  const isPaymentValid = validatePaymentVerification(
    {
      order_id: pg.order_id,
      payment_id: pg.payment_id,
    },
    pg.signature as string,
    pgSecret,
  );

  if (!isPaymentValid)
    return c.json({
      status: "error",
      message: "Payment verification failed. Signature doesn't match",
    });
  const payment = await instance.payments.fetch(pg.payment_id);
  if (payment.status !== "captured")
    return c.redirect("https://dkmondal.in/payment-failed");
  await db.update({
    TableName,
    Key: {
      pk: "order",
      sk: payment.email + ":" + payment.description?.split(":")[1],
    },
    UpdateExpression: "SET #status= :status, payment_id= :payment_id",
    ExpressionAttributeValues: {
      ":status": "paid",
      ":payment_id": payment.id,
    },
    ExpressionAttributeNames: {
      "#status": "lsi",
    },
    ReturnValues: "ALL_NEW",
  });
  return c.redirect(`https://dkmondal.in/public/order`);
});
export const handler = handle(app);
