import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  generateOrderRef,
  type Customer,
  type Fulfilment,
  type InventoryItem,
  type Order,
  type OrderItem,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { InsufficientStockError } from "./lib/errors";
import { getServerProduct } from "./lib/products";
import { sendCustomerInvoice } from "./lib/resend";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const MAX_NAME_LEN = 120;
const MAX_PHONE_LEN = 30;
const MAX_NOTES_LEN = 500;

interface ManualSaleItemInput {
  productId: string;
  qty: number;
}

interface ManualSaleInput {
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  };
  items: ManualSaleItemInput[];
  fulfilment: Fulfilment;
  deliveryFee: number;
  notes?: string;
}

function parseJsonBody(
  req: Request,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, body: raw as Record<string, unknown> };
  }
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, body: parsed as Record<string, unknown> };
      }
      return { ok: false, error: "Body must be a JSON object" };
    } catch {
      return { ok: false, error: "Invalid JSON" };
    }
  }
  return { ok: false, error: "Missing JSON body" };
}

function trimRequiredString(
  value: unknown,
  field: string,
  max: number,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    return { ok: false, error: `${field} must be a string` };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: `${field} is required` };
  }
  if (trimmed.length > max) {
    return { ok: false, error: `${field} too long` };
  }
  return { ok: true, value: trimmed };
}

function validate(
  body: Record<string, unknown>,
): { ok: true; input: ManualSaleInput } | { ok: false; error: string } {
  const {
    customer,
    items,
    fulfilment: rawFulfilment,
    deliveryFee,
    notes,
    ...extra
  } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }

  let fulfilment: Fulfilment = "delivery";
  if (rawFulfilment !== undefined) {
    if (rawFulfilment !== "delivery" && rawFulfilment !== "collection") {
      return {
        ok: false,
        error: "fulfilment must be 'delivery' or 'collection'",
      };
    }
    fulfilment = rawFulfilment;
  }

  let deliveryFeeClean = 0;
  if (deliveryFee !== undefined) {
    if (
      typeof deliveryFee !== "number" ||
      !Number.isFinite(deliveryFee) ||
      deliveryFee < 0
    ) {
      return { ok: false, error: "deliveryFee must be a non-negative number" };
    }
    deliveryFeeClean = Math.round(deliveryFee * 100) / 100;
  }
  if (fulfilment === "collection" && deliveryFeeClean > 0) {
    return {
      ok: false,
      error: "deliveryFee must be 0 for collection orders",
    };
  }

  if (!customer || typeof customer !== "object") {
    return { ok: false, error: "customer is required" };
  }
  const c = customer as Record<string, unknown>;
  const firstName = trimRequiredString(c.firstName, "firstName", MAX_NAME_LEN);
  if (!firstName.ok) return firstName;
  const lastName = trimRequiredString(c.lastName, "lastName", MAX_NAME_LEN);
  if (!lastName.ok) return lastName;
  const phone = trimRequiredString(c.phone, "phone", MAX_PHONE_LEN);
  if (!phone.ok) return phone;

  let email: string | undefined;
  if (c.email !== undefined) {
    if (typeof c.email !== "string") {
      return { ok: false, error: "email must be a string" };
    }
    const trimmed = c.email.trim();
    if (trimmed.length > 0) {
      if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
        return { ok: false, error: "Invalid email" };
      }
      email = trimmed;
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "At least one item is required" };
  }
  const cleanItems: ManualSaleItemInput[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Invalid item" };
    }
    const it = raw as Record<string, unknown>;
    if (typeof it.productId !== "string" || it.productId.trim().length === 0) {
      return { ok: false, error: "item.productId required" };
    }
    if (
      typeof it.qty !== "number" ||
      !Number.isFinite(it.qty) ||
      !Number.isInteger(it.qty) ||
      it.qty <= 0 ||
      it.qty > 1000
    ) {
      return { ok: false, error: "item.qty must be a positive integer ≤ 1000" };
    }
    cleanItems.push({ productId: it.productId.trim(), qty: it.qty });
  }

  let notesClean: string | undefined;
  if (notes !== undefined) {
    if (typeof notes !== "string") {
      return { ok: false, error: "notes must be a string" };
    }
    const trimmed = notes.trim();
    if (trimmed.length > MAX_NOTES_LEN) {
      return { ok: false, error: "notes too long" };
    }
    notesClean = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    ok: true,
    input: {
      customer: {
        firstName: firstName.value,
        lastName: lastName.value,
        phone: phone.value,
        email,
      },
      items: cleanItems,
      fulfilment,
      deliveryFee: deliveryFeeClean,
      notes: notesClean,
    },
  };
}

async function createManualSale(
  req: Request,
  res: Response,
  auth: AdminIdentity,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const validated = validate(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { input } = validated;

  const orderItems: OrderItem[] = [];
  let subtotal = 0;
  for (const it of input.items) {
    const product = await getServerProduct(it.productId);
    if (!product) {
      res.status(400).json({ error: `Unknown product ${it.productId}` });
      return;
    }
    const lineTotal = product.price * it.qty;
    orderItems.push({
      productId: product.id,
      name: product.name,
      qty: it.qty,
      unitPrice: product.price,
      lineTotal,
    });
    subtotal += lineTotal;
  }

  // Reject up front if any tracked SKU has insufficient stock. Untracked
  // SKUs (no inventory doc) pass through. The Mark as Paid transaction
  // re-checks atomically — this is just an early sanity gate so the admin
  // doesn't create a pending sale for a stick we can't fulfil.
  const inventoryRefs = orderItems.map((item) => ({
    productId: item.productId,
    qty: item.qty,
    name: item.name,
    ref: db.collection("inventory").doc(item.productId),
  }));
  const inventorySnaps = await Promise.all(
    inventoryRefs.map(({ ref }) => ref.get()),
  );
  for (let i = 0; i < inventoryRefs.length; i += 1) {
    const snap = inventorySnaps[i];
    if (!snap.exists) continue;
    const data = snap.data() as InventoryItem;
    const available = Math.max(
      0,
      (data.openingStock ?? 0) - (data.unitsSold ?? 0),
    );
    if (inventoryRefs[i].qty > available) {
      throw new InsufficientStockError(inventoryRefs[i].name, available);
    }
  }

  const ref = await generateOrderRef();
  const orderDoc = db.collection("orders").doc();

  // Firestore rejects explicit `undefined` field values — only include
  // optional fields when set.
  const customer: Customer = {
    firstName: input.customer.firstName,
    lastName: input.customer.lastName,
    email: input.customer.email ?? "",
    phone: input.customer.phone,
    addressLine1: "",
    city: "",
    province: "",
    postalCode: "",
    ...(input.notes ? { notes: input.notes } : {}),
  };

  // Pending draft: fulfilment + delivery fee captured up front so the
  // emailed invoice has the right total. Payment method and the inventory
  // decrement are still deferred to the Mark as Paid action.
  const total = subtotal + input.deliveryFee;
  await orderDoc.set({
    ref,
    status: "pending",
    source: "manual",
    fulfilment: input.fulfilment,
    inventoryApplied: false,
    items: orderItems,
    subtotal,
    shipping: input.deliveryFee,
    total,
    customer,
    yoco: { checkoutId: "" },
    createdAt: FieldValue.serverTimestamp(),
  });

  logger.info("adminManualSales create-pending", {
    uid: auth.uid,
    orderId: orderDoc.id,
    ref,
    subtotal,
    deliveryFee: input.deliveryFee,
    fulfilment: input.fulfilment,
  });

  // Fire-and-forget invoice email so the customer gets EFT details
  // automatically. Failure must not block the create response.
  if (customer.email) {
    try {
      const saved = await orderDoc.get();
      const order = { ...(saved.data() as Order) };
      await sendCustomerInvoice(RESEND_API_KEY.value(), order);
      await orderDoc.update({
        receiptResendAt: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      logger.error("Auto invoice email failed", {
        uid: auth.uid,
        orderId: orderDoc.id,
        err: String(err),
      });
    }
  }

  res.status(201).json({
    id: orderDoc.id,
    ref,
    subtotal,
    total,
    shipping: input.deliveryFee,
    fulfilment: input.fulfilment,
  });
}

export const adminManualSales = onRequest(
  {
    region: "us-central1",
    cors: false,
    invoker: "public",
    secrets: [RESEND_API_KEY],
  },
  async (req, res) => {
    applyCors(req, res, "POST");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      await createManualSale(req, res, auth);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        logger.info("adminManualSales rejected — insufficient stock", {
          uid: auth.uid,
          product: err.productName,
          available: err.available,
        });
        if (!res.headersSent) {
          res.status(409).json({
            error: err.message,
            available: err.available,
            productName: err.productName,
          });
        }
        return;
      }
      logger.error("adminManualSales failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);

// Re-export Order so the type stays referenced.
export type { Order };
