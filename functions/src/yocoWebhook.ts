import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, FieldValue, type Order, type InventoryItem } from "./lib/firestore";
import { verifyYocoSignature } from "./lib/yoco";
import { sendCustomerReceipt, sendMerchantNotification } from "./lib/resend";

const YOCO_WEBHOOK_SECRET = defineSecret("YOCO_WEBHOOK_SECRET");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
const MERCHANT_EMAIL = defineString("MERCHANT_EMAIL", {
  default: "drumsareme.ent@gmail.com",
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

      // Wrap order update + inventory decrement in one transaction for atomicity.
      // inventoryApplied guards against double-decrement on Yoco retries.
      await db.runTransaction(async (tx) => {
        const freshSnap = await tx.get(orderRef);
        if (!freshSnap.exists) throw new Error("Order vanished");
        const fresh = freshSnap.data() as Order;
        if (fresh.status === "paid" || fresh.inventoryApplied) return;

        const paymentId = event.payload?.id ?? null;
        tx.update(orderRef, {
          status: "paid",
          paidAt: FieldValue.serverTimestamp(),
          "yoco.paymentId": paymentId,
          inventoryApplied: true,
        });

        for (const item of fresh.items) {
          const invRef = db.collection("inventory").doc(item.productId);
          const invSnap = await tx.get(invRef);
          if (invSnap.exists) {
            const inv = invSnap.data() as InventoryItem;
            const newUnitsSold = (inv.unitsSold ?? 0) + item.qty;
            tx.update(invRef, {
              unitsSold: newUnitsSold,
              currentStock: (inv.openingStock ?? 0) - newUnitsSold,
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            tx.set(invRef, {
              productId: item.productId,
              openingStock: 0,
              unitsSold: item.qty,
              currentStock: -item.qty,
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
        }
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
