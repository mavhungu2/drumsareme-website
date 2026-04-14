import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  generateOrderRef,
  type Customer,
  type OrderItem,
} from "./lib/firestore";
import {
  getServerProduct,
  SHIPPING_FLAT_ZAR,
} from "./lib/products";
import { createYocoCheckout } from "./lib/yoco";

const YOCO_SECRET_KEY = defineSecret("YOCO_SECRET_KEY");
const SITE_URL = defineString("SITE_URL", {
  default: "https://drumsareme.co.za",
});

const ALLOWED_ORIGINS = [
  "https://drumsareme.co.za",
  "https://www.drumsareme.co.za",
  "https://drumsareme-website.web.app",
  "http://localhost:3000",
];

interface CheckoutRequestItem {
  id: string;
  qty: number;
}

interface CheckoutRequest {
  items: CheckoutRequestItem[];
  customer: Customer;
}

function applyCors(req: { get: (h: string) => string | undefined }, res: {
  set: (k: string, v: string) => void;
}) {
  const origin = req.get("origin") ?? "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

function validate(body: unknown): CheckoutRequest | string {
  if (!body || typeof body !== "object") return "Invalid body";
  const b = body as Partial<CheckoutRequest>;
  if (!Array.isArray(b.items) || b.items.length === 0) return "No items";
  for (const it of b.items) {
    if (
      !it ||
      typeof it.id !== "string" ||
      typeof it.qty !== "number" ||
      it.qty <= 0 ||
      it.qty > 100
    ) {
      return "Invalid item";
    }
  }
  const c = b.customer;
  const req: Array<keyof Customer> = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "addressLine1",
    "city",
    "province",
    "postalCode",
  ];
  if (!c) return "Missing customer";
  for (const k of req) {
    const v = (c as unknown as Record<string, unknown>)[k];
    if (typeof v !== "string" || v.trim().length === 0) {
      return `Missing customer.${k}`;
    }
  }
  if (!/^\S+@\S+\.\S+$/.test(c.email)) return "Invalid email";
  return b as CheckoutRequest;
}

export const createCheckout = onRequest(
  { secrets: [YOCO_SECRET_KEY], cors: false, region: "us-central1" },
  async (req, res) => {
    applyCors(req, res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const validated = validate(req.body);
    if (typeof validated === "string") {
      res.status(400).json({ error: validated });
      return;
    }

    const items: OrderItem[] = [];
    let subtotal = 0;
    for (const it of validated.items) {
      const product = getServerProduct(it.id);
      if (!product) {
        res.status(400).json({ error: `Unknown product ${it.id}` });
        return;
      }
      const lineTotal = product.price * it.qty;
      items.push({
        productId: product.id,
        name: product.name,
        qty: it.qty,
        unitPrice: product.price,
        lineTotal,
      });
      subtotal += lineTotal;
    }

    const shipping = SHIPPING_FLAT_ZAR;
    const total = subtotal + shipping;

    const ref = await generateOrderRef();
    const orderDoc = db.collection("orders").doc();
    const orderId = orderDoc.id;

    const siteUrl = SITE_URL.value();
    try {
      const checkout = await createYocoCheckout(YOCO_SECRET_KEY.value(), {
        amount: total * 100,
        currency: "ZAR",
        successUrl: `${siteUrl}/checkout/success/?orderId=${orderId}`,
        cancelUrl: `${siteUrl}/checkout/cancelled/`,
        failureUrl: `${siteUrl}/checkout/cancelled/?failed=1`,
        metadata: { orderId, ref },
      });

      await orderDoc.set({
        ref,
        status: "pending",
        items,
        subtotal,
        shipping,
        total,
        customer: validated.customer,
        yoco: { checkoutId: checkout.id },
        createdAt: FieldValue.serverTimestamp(),
      });

      res.status(200).json({ orderId, ref, redirectUrl: checkout.redirectUrl });
    } catch (err) {
      logger.error("createCheckout failed", err);
      res.status(502).json({ error: "Payment provider unavailable" });
    }
  },
);
