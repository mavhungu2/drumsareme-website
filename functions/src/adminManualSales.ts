import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  generateOrderRef,
  type Customer,
  type InventoryItem,
  type ManualPaymentMethod,
  type Order,
  type OrderItem,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { getServerProduct } from "./lib/products";

const VALID_PAYMENTS: ReadonlyArray<ManualPaymentMethod> = [
  "cash",
  "card",
  "eft",
];
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
  paymentMethod: ManualPaymentMethod;
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
  const { customer, items, paymentMethod, deliveryFee, notes, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
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

  if (
    typeof paymentMethod !== "string" ||
    !VALID_PAYMENTS.includes(paymentMethod as ManualPaymentMethod)
  ) {
    return {
      ok: false,
      error: `paymentMethod must be one of ${VALID_PAYMENTS.join(", ")}`,
    };
  }

  if (
    typeof deliveryFee !== "number" ||
    !Number.isFinite(deliveryFee) ||
    deliveryFee < 0
  ) {
    return { ok: false, error: "deliveryFee must be a non-negative number" };
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
      paymentMethod: paymentMethod as ManualPaymentMethod,
      deliveryFee: Math.round(deliveryFee * 100) / 100,
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
    const product = getServerProduct(it.productId);
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
  const total = subtotal + input.deliveryFee;

  const ref = await generateOrderRef();
  const orderDoc = db.collection("orders").doc();

  const customer: Customer = {
    firstName: input.customer.firstName,
    lastName: input.customer.lastName,
    email: input.customer.email ?? "",
    phone: input.customer.phone,
    addressLine1: "",
    city: "",
    province: "",
    postalCode: "",
    notes: input.notes,
  };

  await db.runTransaction(async (tx) => {
    const inventoryRefs = orderItems.map((item) => ({
      ref: db.collection("inventory").doc(item.productId),
      qty: item.qty,
      name: item.name,
    }));
    const inventorySnaps = await Promise.all(
      inventoryRefs.map(({ ref }) => tx.get(ref)),
    );

    inventorySnaps.forEach((snap, i) => {
      const { ref: invRef, qty, name } = inventoryRefs[i];
      if (snap.exists) {
        const item = snap.data() as InventoryItem;
        const nextSold = (item.unitsSold ?? 0) + qty;
        const nextStock = Math.max(0, item.openingStock - nextSold);
        tx.update(invRef, {
          unitsSold: nextSold,
          currentStock: nextStock,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        tx.set(invRef, {
          productId: invRef.id,
          name,
          openingStock: 0,
          unitsSold: qty,
          currentStock: 0,
          reorderLevel: 0,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });

    tx.set(orderDoc, {
      ref,
      status: "paid",
      source: "manual",
      manualPaymentMethod: input.paymentMethod,
      inventoryApplied: true,
      items: orderItems,
      subtotal,
      shipping: input.deliveryFee,
      total,
      customer,
      yoco: { checkoutId: "" },
      createdAt: FieldValue.serverTimestamp(),
      paidAt: FieldValue.serverTimestamp(),
    });
  });

  logger.info("adminManualSales create", {
    uid: auth.uid,
    orderId: orderDoc.id,
    ref,
    total,
    paymentMethod: input.paymentMethod,
  });

  res.status(201).json({
    id: orderDoc.id,
    ref,
    total,
    subtotal,
    shipping: input.deliveryFee,
    paymentMethod: input.paymentMethod,
  });
}

export const adminManualSales = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
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
