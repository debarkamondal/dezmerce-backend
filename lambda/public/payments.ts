import { Hono } from "hono";
import { handle, LambdaEvent } from "hono/aws-lambda";
import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils";

type Bindings = {
  event: LambdaEvent;
};

const pgSecret = process.env.PAYMENT_GW_KEY_SECRET as string;
const app = new Hono<{ Bindings: Bindings }>();
app.post("/payments/verify", async (c) => {
  const data = await c.req.formData();
  const pg = {
    payment_id: data.get("razorpay_payment_id")?.toString(),
    order_id: data.get("razorpay_order_id")?.toString(),
    signature: data.get("razorpay_signature")?.toString(),
  };
  if (pg.order_id == undefined && !pg.payment_id && !pg.signature)
    return c.json({ status: "error", message: "Malformed data" });
  const isPaymentValid = validatePaymentVerification(
    {
      order_id: pg.order_id as string,
      payment_id: pg.payment_id as string,
    },
    pg.signature as string,
    pgSecret,
  );
  console.log(isPaymentValid);
  return c.redirect("https://dkmondal.in/about");
});
export const handler = handle(app);
