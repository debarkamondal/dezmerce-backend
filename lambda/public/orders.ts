import { Hono } from "hono";
import { ulid } from "ulidx";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  PutCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import Razorpay from "razorpay";
import { CartItem } from "../../types";
import { verify } from "hono/jwt";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";

type Bindings = {
  event: LambdaEvent;
};

const db = new DynamoDB({});
const client = DynamoDBDocumentClient.from(db);
const TableName = process.env.DB_TABLE_NAME as string;
const pgId = process.env.PAYMENT_GW_KEY_ID as string;
const pgSecret = process.env.PAYMENT_GW_KEY_SECRET as string;

const instance = new Razorpay({ key_id: pgId, key_secret: pgSecret });
const app = new Hono<{ Bindings: Bindings }>();
type OrderBody = {
  items?: CartItem[];
  user: {
    email?: string;
    number?: number;
  };
};
app.post("/orders", async (c) => {
  let items = [];
  let userEmail;
  let recipt: {
    total: number;
    items: Record<string, { price: number; qty: number }>;
  } = { total: 0, items: {} };

  const body: OrderBody = await c.req.json();

  if (c.req.header("authorization")) {
    const decodedToken = await verify(
      c.req.header("authorization") as string,
      process.env.JWTSecret as string,
    );
    userEmail = decodedToken.email;
    const { Item } = await client.send(
      new GetCommand({
        TableName,
        Key: {
          pk: "cart",
          sk: decodedToken.email,
        },
      }),
    );
    if (Item?.items) items = Item.items;
  } else {
    userEmail = body.user.email;
    const Keys = body.items?.map((item) => {
      return {
        pk: "products:" + item.category,
        sk: item.id,
      };
    });

    //Fetching updated item prices
    const data = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [TableName]: {
            Keys,
            ProjectionExpression: "pk, sk, price",
          },
        },
      }),
    );
    if (!data.Responses)
      return c.json({ status: "error", message: "DB error" });
    items = data.Responses[TableName];
  }

  recipt.total = items.reduce((price: number, item: CartItem) => {
    recipt.items[`${item.category}-${item.id}`] = {
      qty: item.qty,
      price: item.price,
    };
    return (price += item.price * item.qty);
  }, 0);

  const id = ulid();
  try {
    //Creating an order on Razorpay
    const res = await instance.orders.create({
      amount: recipt.total * 100,
      currency: "INR",
      receipt: `order:${id}`,
    });

    if (res.status !== "created")
      throw new Error("Couldn't initiate order with RazorPay");
    // Storing the order details in db
    const data = await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName,
              Item: {
                pk: `order:${id}`,
                sk: userEmail,
                status: res.status,
                gwOrderId: res.id,
                ...recipt,
              },
            },
          },
          {
            Update: {
              TableName,
              Key: {
                pk: "user",
                sk: userEmail,
              },
              UpdateExpression: `SET #orders = list_append(#orders,:order)`,
              ExpressionAttributeNames: {
                "#orders": "orders",
              },
              ExpressionAttributeValues: {
                ":order": [id],
              },
            },
          },
        ],
      }),
    );
    if (data.$metadata.httpStatusCode !== 200) throw new Error("DB error");
    const response = {
      amount: recipt.total * 100,
      currency: "INR",
      description: `order:${id}`,
      order_id: res.id,
      prefill: {
        email: userEmail,
      },
      theme: {
        color: "#c93063",
        backdrop_color: "#ffffff",
      },
    };
    return c.json(response);
  } catch (err) {
    return c.json({ status: "error", message: err });
  }
});

app.post("/orders/verify", async (c) => {
  // validatePaymentVerification()
  return c.json(await c.req.formData());
});
export const handler = handle(app);
