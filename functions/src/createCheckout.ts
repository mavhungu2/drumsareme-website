import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  generateOrderRef,
  type Customer,
  type Fulfilment,
  type InventoryItem,
  type OrderItem,
} from "./lib/firestore";
import { findOrCreateCustomer } from "./lib/customers";
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
  fulfilment?: Fulfilment;
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
  if (!c) return "Missing customer";

  let fulfilment: Fulfilment = "delivery";
  if (b.fulfilment !== undefined) {
    if (b.fulfilment !== "delivery" && b.fulfilment !== "collection") {
      return "Invalid fulfilment";
    }
    fulfilment = b.fulfilment;
  }

  // Always require contact fields. Address fields are only required when
  // the order is being delivered.
  const required: Array<keyof Customer> = ["firstName", "lastName", "email", "phone"];
  if (fulfilment === "delivery") {
    required.push("addressLine1", "city", "province", "postalCode");
  }
  for (const k of required) {
    const v = (c as unknown as Record<string, unknown>)[k];
    if (typeof v !== "string" || v.trim().length === 0) {
      return `Missing customer.${k}`;
    }
  }
  if (!/^\S+@\S+\.\S+$/.test(c.email)) return "Invalid email";
  return { ...(b as CheckoutRequest), fulfilment };
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
      const product = await getServerProduct(it.id);
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

    // Prevent overselling: reject if any item exceeds current stock. Inventory
    // is decremented at payment time, but this is the earliest point we can
    // refuse — saves the customer a trip through Yoco for a stick we can't
    // ship. There's still a tiny race window between this read and the
    // webhook decrement; the webhook itself is the authoritative gate.
    const inventoryRefs = items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
      ref: db.collection("inventory").doc(item.productId),
    }));
    const inventorySnaps = await Promise.all(
      inventoryRefs.map(({ ref }) => ref.get()),
    );
    for (let i = 0; i < inventoryRefs.length; i += 1) {
      const snap = inventorySnaps[i];
      if (!snap.exists) continue; // Untracked product — allow through.
      const data = snap.data() as InventoryItem;
      const available = Math.max(
        0,
        (data.openingStock ?? 0) - (data.unitsSold ?? 0),
      );
      if (inventoryRefs[i].qty > available) {
        res.status(409).json({
          error: `Only ${available} of ${items[i].name} in stock`,
          productId: inventoryRefs[i].productId,
          available,
        });
        return;
      }
    }

    const fulfilment: Fulfilment = validated.fulfilment ?? "delivery";
    const shipping = fulfilment === "collection" ? 0 : SHIPPING_FLAT_ZAR;
    const total = subtotal + shipping;

    const ref = await generateOrderRef();
    const orderDoc = db.collection("orders").doc();
    const orderId = orderDoc.id;

    // Link this order to its canonical customer record. Matches existing
    // customer by email or phone; creates a new one when no match exists.
    const customerId = await findOrCreateCustomer({
      firstName: validated.customer.firstName,
      lastName: validated.customer.lastName,
      email: validated.customer.email,
      phone: validated.customer.phone,
      addressLine1: validated.customer.addressLine1,
      suburb: validated.customer.suburb,
      city: validated.customer.city,
      province: validated.customer.province,
      postalCode: validated.customer.postalCode,
    });

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
        source: "yoco",
        fulfilment,
        items,
        subtotal,
        shipping,
        total,
        customerId,
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
