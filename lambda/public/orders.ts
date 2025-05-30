import { Hono } from "hono";
import { ulid } from "ulidx";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  GetCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { sign, verify } from "hono/jwt";
import { setCookie } from "hono/cookie";
import { adminOrder, orderBody } from "../../types";

type Bindings = {
  event: LambdaEvent;
};

const TableName = process.env.DB_TABLE_NAME as string;
const JWTSecret = process.env.JWTSecret as string;

const db = new DynamoDB({});
const client = DynamoDBDocumentClient.from(db);
const app = new Hono<{ Bindings: Bindings }>();

app.get("/orders", async (c) => {
  const decodedToken = await verify(
    c.req.header("order-token") as string,
    JWTSecret,
  );
  const { Item } = await client.send(
    new GetCommand({
      TableName,
      Key: {
        pk: "order",
        sk: decodedToken.email + ":" + decodedToken.id,
      },
    }),
  );
  if (!Item) return c.json({ status: "error", message: "DB error" });
  const { pk, sk, lsi, ...rest } = Item;
  return c.json({
    id: sk.split(":")[1],
    status: lsi,
    ...rest,
  });
});

app.post("/orders", async (c) => {
  let userEmail;
  let recipt: {
    total: number;
    items: Record<string, { price: number; qty: number; title: string }>;
  } = { total: 0, items: {} };

  const body: orderBody = await c.req.json();

  if (c.req.header("authorization")) {
    const decodedToken = await verify(
      c.req.header("authorization") as string,
      JWTSecret,
    );
    userEmail = decodedToken.email;
  } else {
    userEmail = body.user.email;
  }
  const Keys = Object.keys(body.items).map((key: string) => {
    return {
      pk: "products:" + body.items[key].category,
      sk: key,
    };
  });

  //Fetching updated item prices
  const data = await client.send(
    new BatchGetCommand({
      RequestItems: {
        [TableName]: {
          Keys,
          ProjectionExpression: "pk, sk, price,title",
        },
      },
    }),
  );
  if (!data.Responses) return c.json({ status: "error", message: "DB error" });
  const items = data.Responses[TableName] as {
    pk: string;
    sk: string;
    price: number;
    title: string;
  }[];

  recipt.total = items.reduce((price: number, item) => {
    recipt.items[`${item.pk.split(":")[1]}-${item.sk}`] = {
      qty: body.items[item.sk].qty,
      price: item.price,
      title: item.title,
    };
    return (price += item.price * body.items[item.sk].qty);
  }, 0);

  const id = ulid();
  const Item: Omit<adminOrder, "gwOrderId" | "payment_id"> = {
    pk: `order`,
    sk: userEmail + ":" + id,
    user: {
      name: body.user.name,
      phone: body.user.phone,
      email: body.user.email,
      address: body.user.address,
    },
    ...recipt,
    lsi: "initiated",
  };
  try {
    const transactions: Array<Record<string, any>> = [
      {
        Put: {
          TableName,
          Item,
        },
      },
    ];

    //Update order information if user has account
    if (c.req.header("authorization"))
      transactions.push(
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
        {
          Delete: {
            TableName,
            Key: {
              pk: "cart",
              sk: userEmail,
            },
          },
        },
      );
    const data = await client.send(
      new TransactWriteCommand({
        TransactItems: transactions,
      }),
    );
    if (data.$metadata.httpStatusCode !== 200) throw new Error("DB error");
    const payload = {
      email: userEmail,
      id,
    };
    setCookie(c, "order", await sign(payload, process.env.JWTSecret as string));
    return c.json(payload);
  } catch (err) {
    return c.json({ status: "error", message: err });
  }
});

export const handler = handle(app);
