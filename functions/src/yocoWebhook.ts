import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, FieldValue, type Order } from "./lib/firestore";
import { verifyYocoSignature } from "./lib/yoco";
import { sendCustomerReceipt, sendMerchantNotification } from "./lib/resend";

const YOCO_WEBHOOK_SECRET = defineSecret("YOCO_WEBHOOK_SECRET");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const MERCHANT_EMAIL = defineString("MERCHANT_EMAIL", {
  default: "orders@drumsareme.co.za",
});

interface YocoPaymentPayload {
  type: string;
  payload?: {
    id?: string;
    metadata?: Record<string, string>;
    status?: string;
    failureReason?: string;
  };
}

export const yocoWebhook = onRequest(
  {
    secrets: [YOCO_WEBHOOK_SECRET, RESEND_API_KEY],
    region: "us-central1",
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }
    const id = req.get("webhook-id") ?? "";
    const timestamp = req.get("webhook-timestamp") ?? "";
    const signature = req.get("webhook-signature") ?? "";
    const rawBody = req.rawBody?.toString("utf8") ?? "";

    if (
      !verifyYocoSignature(
        YOCO_WEBHOOK_SECRET.value(),
        id,
        timestamp,
        rawBody,
        signature,
      )
    ) {
      logger.warn("Webhook signature mismatch", { id });
      res.status(401).send("Invalid signature");
      return;
    }

    let event: YocoPaymentPayload;
    try {
      event = JSON.parse(rawBody);
    } catch {
      res.status(400).send("Invalid JSON");
      return;
    }

    const orderId = event.payload?.metadata?.orderId;
    if (!orderId) {
      res.status(200).send("No orderId — ignored");
      return;
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();
    if (!snap.exists) {
      logger.warn("Webhook for unknown order", { orderId });
      res.status(200).send("Unknown order — ignored");
      return;
    }
    const order = snap.data() as Order;

    if (event.type === "payment.succeeded") {
      if (order.status === "paid") {
        res.status(200).send("Already paid");
        return;
      }
      await orderRef.update({
        status: "paid",
        paidAt: FieldValue.serverTimestamp(),
        "yoco.paymentId": event.payload?.id ?? null,
      });
      const paidOrder: Order = { ...order, status: "paid" };
      try {
        await sendCustomerReceipt(RESEND_API_KEY.value(), paidOrder);
        await sendMerchantNotification(
          RESEND_API_KEY.value(),
          MERCHANT_EMAIL.value(),
          paidOrder,
        );
      } catch (err) {
        logger.error("Email send failed", err);
      }
      res.status(200).send("OK");
      return;
    }

    if (event.type === "payment.failed") {
      if (order.status === "failed") {
        res.status(200).send("Already failed");
        return;
      }
      await orderRef.update({
        status: "failed",
        "yoco.failureReason": event.payload?.failureReason ?? "unknown",
      });
      res.status(200).send("OK");
      return;
    }

    res.status(200).send("Ignored");
  },
);
