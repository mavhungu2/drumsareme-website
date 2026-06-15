import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  Timestamp,
  type Fulfilment,
  type InventoryItem,
  type ManualPaymentMethod,
  type Order,
  type OrderCollection,
  type OrderItem,
  type OrderNote,
  type OrderTracking,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { InsufficientStockError } from "./lib/errors";
import {
  sendCancellationNotification,
  sendCustomerInvoice,
  sendCustomerReceipt,
  sendShippingConfirmation,
} from "./lib/resend";

const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

type Handler = (ctx: ActionContext) => Promise<void>;

interface ActionContext {
  req: Request;
  res: Response;
  uid: string;
  orderId: string;
}

interface RouteEntry {
  method: "GET" | "POST";
  handler: Handler;
  action: string;
}

const ROOT_PATH = "/api/admin/orders/";
const MAX_TRACKING_FIELD_LEN = 100;
const MAX_NOTE_LEN = 2000;
const MAX_CANCEL_REASON_LEN = 500;
const RECEIPT_RESEND_WINDOW_MS = 10 * 60 * 1000;
const VALID_PAYMENT_METHODS: ReadonlyArray<ManualPaymentMethod> = [
  "cash",
  "card",
  "eft",
];

function parsePath(rawPath: string): string[] {
  // Firebase rewrites forward the full path (e.g. /api/admin/orders/abc/cancel)
  // but when invoked directly via the function URL the path is just "/abc/cancel".
  // Strip the known prefix if present, then split.
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean);
}

function hasToDate(value: object): value is { toDate: () => Date } {
  const candidate = (value as { toDate?: unknown }).toDate;
  return typeof candidate === "function";
}

function serializeTimestamps(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeTimestamps);
  if (value && typeof value === "object") {
    if (hasToDate(value)) return value.toDate().toISOString();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeTimestamps(v);
    }
    return out;
  }
  return value;
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

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateTrackingInput(
  body: Record<string, unknown>,
): { ok: true; tracking: OrderTracking } | { ok: false; error: string } {
  const { carrier, number, url, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }

  if (typeof carrier !== "string") {
    return { ok: false, error: "Invalid carrier" };
  }
  const carrierTrimmed = carrier.trim();
  if (carrierTrimmed.length === 0) {
    return { ok: false, error: "Invalid carrier" };
  }
  if (carrierTrimmed.length > MAX_TRACKING_FIELD_LEN) {
    return { ok: false, error: "carrier too long" };
  }

  if (typeof number !== "string") {
    return { ok: false, error: "Invalid number" };
  }
  const numberTrimmed = number.trim();
  if (numberTrimmed.length === 0) {
    return { ok: false, error: "Invalid number" };
  }
  if (numberTrimmed.length > MAX_TRACKING_FIELD_LEN) {
    return { ok: false, error: "number too long" };
  }

  const tracking: OrderTracking = {
    carrier: carrierTrimmed,
    number: numberTrimmed,
  };

  if (url !== undefined) {
    if (typeof url !== "string" || !isHttpUrl(url.trim())) {
      return { ok: false, error: "Invalid url" };
    }
    tracking.url = url.trim();
  }

  return { ok: true, tracking };
}

const MAX_COLLECTION_FIELD_LEN = 200;

function validateCollectionReadyInput(
  body: Record<string, unknown>,
):
  | { ok: true; collection: OrderCollection }
  | { ok: false; error: string } {
  const { collectorName, collectorContact, note, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }
  const collection: OrderCollection = {};
  const optionalFields: Array<[string, unknown, keyof OrderCollection]> = [
    ["collectorName", collectorName, "collectorName"],
    ["collectorContact", collectorContact, "collectorContact"],
    ["note", note, "note"],
  ];
  for (const [label, value, key] of optionalFields) {
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      return { ok: false, error: `${label} must be a string` };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > MAX_COLLECTION_FIELD_LEN) {
      return { ok: false, error: `${label} too long` };
    }
    collection[key] = trimmed;
  }
  return { ok: true, collection };
}

function validateNoteInput(
  body: Record<string, unknown>,
): { ok: true; body: string } | { ok: false; error: string } {
  const { body: noteBody, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }
  if (typeof noteBody !== "string") {
    return { ok: false, error: "Invalid body" };
  }
  const trimmed = noteBody.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "body is required" };
  }
  if (trimmed.length > MAX_NOTE_LEN) {
    return { ok: false, error: "body too long" };
  }
  return { ok: true, body: trimmed };
}

function validateCancelInput(
  body: Record<string, unknown>,
):
  | { ok: true; reason: string; notifyCustomer: boolean }
  | { ok: false; error: string } {
  const { reason, notifyCustomer, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }
  if (typeof reason !== "string") {
    return { ok: false, error: "Invalid reason" };
  }
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "reason is required" };
  }
  if (trimmed.length > MAX_CANCEL_REASON_LEN) {
    return { ok: false, error: "reason too long" };
  }
  let notify = false;
  if (notifyCustomer !== undefined) {
    if (typeof notifyCustomer !== "boolean") {
      return { ok: false, error: "Invalid notifyCustomer" };
    }
    notify = notifyCustomer;
  }
  return { ok: true, reason: trimmed, notifyCustomer: notify };
}

const adminGetOrder: Handler = async ({ res, uid, orderId }) => {
  const snap = await db.collection("orders").doc(orderId).get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const order = snap.data() as Order;
  logger.info("adminOrderActions", { uid, action: "get", orderId });
  res.status(200).json({
    id: snap.id,
    ...(serializeTimestamps(order) as Record<string, unknown>),
  });
};

const adminMarkShipped: Handler = async ({ req, res, uid, orderId }) => {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const order = snap.data() as Order;
  const isCollection = order.fulfilment === "collection";

  // Service ("none") invoices have no shipping / ready-to-collect step — the
  // UI hides the button, but guard the endpoint against direct calls.
  if (order.fulfilment === "none") {
    res
      .status(409)
      .json({ error: "Service invoices have no shipping step" });
    return;
  }

  if (order.status === "shipped") {
    logger.info("adminOrderActions idempotent mark-shipped", {
      uid,
      action: "mark-shipped",
      orderId,
    });
    res.status(200).json({
      already: true,
      tracking: order.tracking
        ? (serializeTimestamps(order.tracking) as Record<string, unknown>)
        : null,
      collection: order.collection ?? null,
    });
    return;
  }

  if (order.status !== "paid") {
    res.status(409).json({
      error: `Cannot mark ${order.status} order as ${
        isCollection ? "ready to collect" : "shipped"
      }`,
    });
    return;
  }

  // Collection orders capture OPTIONAL collector details (no courier tracking).
  // Delivery orders require carrier + tracking number.
  if (isCollection) {
    const validated = validateCollectionReadyInput(parsed.body);
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const { collection } = validated;
    const hasCollection = Object.keys(collection).length > 0;

    await orderRef.update({
      status: "shipped",
      shippedAt: FieldValue.serverTimestamp(),
      ...(hasCollection ? { collection } : {}),
    });

    const readyOrder: Order = {
      ...order,
      status: "shipped",
      ...(hasCollection ? { collection } : {}),
    };
    try {
      await sendShippingConfirmation(RESEND_API_KEY.value(), readyOrder);
    } catch (err) {
      logger.error("Ready-to-collect email send failed", {
        uid,
        orderId,
        err: String(err),
      });
    }

    logger.info("adminOrderActions", {
      uid,
      action: "mark-ready-to-collect",
      orderId,
    });
    res.status(200).json({ ok: true, collection });
    return;
  }

  const validated = validateTrackingInput(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { tracking } = validated;

  await orderRef.update({
    status: "shipped",
    shippedAt: FieldValue.serverTimestamp(),
    tracking,
  });

  const shippedOrder: Order = { ...order, status: "shipped", tracking };
  try {
    await sendShippingConfirmation(
      RESEND_API_KEY.value(),
      shippedOrder,
      tracking,
    );
  } catch (err) {
    logger.error("Shipping email send failed", {
      uid,
      orderId,
      err: String(err),
    });
  }

  logger.info("adminOrderActions", { uid, action: "mark-shipped", orderId });
  res.status(200).json({ ok: true, tracking });
};

const adminAddNote: Handler = async ({ req, res, uid, orderId }) => {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const validated = validateNoteInput(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // FieldValue.serverTimestamp() cannot be used inside array elements;
  // Timestamp.now() is the supported path for arrayUnion payloads.
  const note: OrderNote = {
    at: Timestamp.now(),
    by: uid,
    body: validated.body,
  };

  await orderRef.update({ notes: FieldValue.arrayUnion(note) });

  logger.info("adminOrderActions", { uid, action: "add-note", orderId });
  res.status(201).json({
    note: {
      at: note.at.toDate().toISOString(),
      by: note.by,
      body: note.body,
    },
  });
};

const adminCancelOrder: Handler = async ({ req, res, uid, orderId }) => {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const validated = validateCancelInput(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { reason, notifyCustomer } = validated;

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const order = snap.data() as Order;

  if (order.status === "cancelled") {
    logger.info("adminOrderActions idempotent cancel", {
      uid,
      action: "cancel",
      orderId,
    });
    res.status(200).json({
      already: true,
      cancelledAt: order.cancelledAt
        ? order.cancelledAt.toDate().toISOString()
        : null,
    });
    return;
  }

  // Any non-cancelled status (pending, paid, failed, shipped) may transition
  // to cancelled. Shipped orders cancel with admin judgement (e.g. arrange
  // return); refunds remain Yoco-dashboard-driven.
  const cancellationNote: OrderNote = {
    at: Timestamp.now(),
    by: uid,
    body: `Order cancelled: ${reason}`,
  };

  // Credit inventory back if this order had decremented stock. Run atomically
  // so concurrent cancel attempts cannot double-credit. Inventory is only
  // applied for paid/shipped orders (via webhook or manual sale).
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(orderRef);
    if (!fresh.exists) return;
    const current = fresh.data() as Order;
    if (current.status === "cancelled") return;
    const shouldCredit = current.inventoryApplied === true;

    if (shouldCredit) {
      const inventoryRefs = (current.items ?? [])
        .filter((item): item is OrderItem & { productId: string } =>
          Boolean(item.productId),
        )
        .map((item) => ({
          ref: db.collection("inventory").doc(item.productId),
          qty: item.qty,
        }));
      const inventorySnaps = await Promise.all(
        inventoryRefs.map(({ ref }) => tx.get(ref)),
      );
      inventorySnaps.forEach((snap, i) => {
        if (!snap.exists) return;
        const item = snap.data() as InventoryItem;
        const { ref: invRef, qty } = inventoryRefs[i];
        const nextSold = Math.max(0, (item.unitsSold ?? 0) - qty);
        const nextStock = Math.max(0, item.openingStock - nextSold);
        tx.update(invRef, {
          unitsSold: nextSold,
          currentStock: nextStock,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    }

    tx.update(orderRef, {
      status: "cancelled",
      cancelledAt: FieldValue.serverTimestamp(),
      inventoryApplied: shouldCredit ? false : current.inventoryApplied ?? false,
      notes: FieldValue.arrayUnion(cancellationNote),
    });
  });

  if (notifyCustomer) {
    try {
      await sendCancellationNotification(RESEND_API_KEY.value(), order, reason);
    } catch (err) {
      logger.error("Cancellation email send failed", {
        uid,
        orderId,
        err: String(err),
      });
    }
  }

  logger.info("adminOrderActions", {
    uid,
    action: "cancel",
    orderId,
    notifyCustomer,
  });
  res.status(200).json({ ok: true, status: "cancelled" });
};

interface MarkPaidInput {
  manualPaymentMethod: ManualPaymentMethod;
  fulfilment: Fulfilment;
  deliveryFee: number;
}

function validateMarkPaidInput(
  body: Record<string, unknown>,
): { ok: true; input: MarkPaidInput } | { ok: false; error: string } {
  const { manualPaymentMethod, fulfilment, deliveryFee, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }
  if (
    typeof manualPaymentMethod !== "string" ||
    !VALID_PAYMENT_METHODS.includes(manualPaymentMethod as ManualPaymentMethod)
  ) {
    return {
      ok: false,
      error: `manualPaymentMethod must be one of ${VALID_PAYMENT_METHODS.join(", ")}`,
    };
  }
  if (
    fulfilment !== "delivery" &&
    fulfilment !== "collection" &&
    fulfilment !== "none"
  ) {
    return {
      ok: false,
      error: "fulfilment must be 'delivery', 'collection' or 'none'",
    };
  }
  let fee = 0;
  if (deliveryFee !== undefined) {
    if (
      typeof deliveryFee !== "number" ||
      !Number.isFinite(deliveryFee) ||
      deliveryFee < 0
    ) {
      return { ok: false, error: "deliveryFee must be a non-negative number" };
    }
    fee = Math.round(deliveryFee * 100) / 100;
  }
  if (fulfilment !== "delivery" && fee > 0) {
    return {
      ok: false,
      error: "deliveryFee must be 0 for collection and service orders",
    };
  }
  return {
    ok: true,
    input: {
      manualPaymentMethod: manualPaymentMethod as ManualPaymentMethod,
      fulfilment,
      deliveryFee: fee,
    },
  };
}

const adminMarkPaid: Handler = async ({ req, res, uid, orderId }) => {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const validated = validateMarkPaidInput(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { input } = validated;

  const orderRef = db.collection("orders").doc(orderId);

  type TxResult =
    | { kind: "not-found" }
    | { kind: "bad-status"; status: Order["status"] }
    | { kind: "bad-source"; source: string | undefined }
    | { kind: "ok"; transitioned: boolean };

  try {
    const result = await db.runTransaction<TxResult>(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) return { kind: "not-found" };
      const order = snap.data() as Order;
      if (order.status === "paid" || order.inventoryApplied === true) {
        // Idempotent: already marked paid by a concurrent click. No transition
        // happened here, so the caller must NOT re-send the ready-to-collect
        // email.
        return { kind: "ok", transitioned: false };
      }
      if (order.status !== "pending") {
        return { kind: "bad-status", status: order.status };
      }
      if (order.source !== "manual") {
        return { kind: "bad-source", source: order.source };
      }

      // Service lines (no productId) carry no stock — only product lines hit
      // inventory.
      const inventoryRefs = (order.items ?? [])
        .filter((item): item is OrderItem & { productId: string } =>
          Boolean(item.productId),
        )
        .map((item) => ({
          ref: db.collection("inventory").doc(item.productId),
          qty: item.qty,
          name: item.name,
        }));
      const inventorySnaps = await Promise.all(
        inventoryRefs.map(({ ref }) => tx.get(ref)),
      );

      // Reject the transition if any tracked SKU has insufficient stock.
      // Untracked SKUs (no inventory doc) are created on-demand below.
      for (let i = 0; i < inventorySnaps.length; i += 1) {
        const invSnap = inventorySnaps[i];
        if (!invSnap.exists) continue;
        const item = invSnap.data() as InventoryItem;
        const available = Math.max(
          0,
          (item.openingStock ?? 0) - (item.unitsSold ?? 0),
        );
        if (inventoryRefs[i].qty > available) {
          throw new InsufficientStockError(
            inventoryRefs[i].name,
            available,
          );
        }
      }

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

      // Preserve any promo-code discount stored at order creation. Discount
      // applies to subtotal; the new delivery fee is added on top.
      const discount = order.discount ?? 0;
      const total =
        Math.max(0, (order.subtotal ?? 0) - discount) + input.deliveryFee;
      // Collection orders skip the "shipped" step — the moment the customer
      // pays the goods are ready at Spring Glade. Stamp shippedAt alongside
      // paidAt so the timeline reflects both events.
      const isCollection = input.fulfilment === "collection";
      const transitionUpdates: Record<string, unknown> = {
        status: isCollection ? "shipped" : "paid",
        paidAt: FieldValue.serverTimestamp(),
        manualPaymentMethod: input.manualPaymentMethod,
        fulfilment: input.fulfilment,
        shipping: input.deliveryFee,
        total,
        inventoryApplied: true,
      };
      if (isCollection) {
        transitionUpdates.shippedAt = FieldValue.serverTimestamp();
      }
      tx.update(orderRef, transitionUpdates);

      // Track promo redemption inside the same transaction.
      if (order.promoCode) {
        tx.update(db.doc(`promoCodes/${order.promoCode}`), {
          redemptionCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      return { kind: "ok", transitioned: true };
    });

    if (result.kind === "not-found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "bad-status") {
      res.status(409).json({
        error: `Cannot mark ${result.status} order as paid`,
      });
      return;
    }
    if (result.kind === "bad-source") {
      res.status(409).json({
        error: "Only manual orders can be marked paid here — Yoco orders flip via the payment webhook",
      });
      return;
    }

    logger.info("adminOrderActions", {
      uid,
      action: "mark-paid",
      orderId,
      manualPaymentMethod: input.manualPaymentMethod,
      fulfilment: input.fulfilment,
      deliveryFee: input.deliveryFee,
    });

    // Collection orders auto-advance to "shipped" (= ready to collect) at
    // mark-paid time. Fire the ready-to-collect email so the customer knows
    // their order is waiting at Spring Glade. Only on a real transition —
    // a concurrent double-click hits the idempotent branch and must not
    // re-email.
    const finalStatus =
      input.fulfilment === "collection" ? "shipped" : "paid";
    if (input.fulfilment === "collection" && result.transitioned) {
      try {
        const fresh = await orderRef.get();
        if (fresh.exists && fresh.data()?.customer?.email) {
          const updated = fresh.data() as Order;
          await sendShippingConfirmation(RESEND_API_KEY.value(), updated);
        }
      } catch (err) {
        logger.error("Ready-to-collect email failed", {
          uid,
          orderId,
          err: String(err),
        });
      }
    }

    res.status(200).json({
      ok: true,
      status: finalStatus,
      manualPaymentMethod: input.manualPaymentMethod,
      fulfilment: input.fulfilment,
      shipping: input.deliveryFee,
    });
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      logger.info("adminOrderActions mark-paid rejected — insufficient stock", {
        uid,
        orderId,
        product: err.productName,
        available: err.available,
      });
      res.status(409).json({
        error: err.message,
        available: err.available,
        productName: err.productName,
      });
      return;
    }
    throw err;
  }
};

const adminMarkCompleted: Handler = async ({ res, uid, orderId }) => {
  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const order = snap.data() as Order;

  if (order.status === "completed") {
    res.status(200).json({
      already: true,
      completedAt: order.completedAt
        ? order.completedAt.toDate().toISOString()
        : null,
    });
    return;
  }
  // Service ("none") invoices have no shipped step — they complete straight
  // from paid. Everything else must be shipped first.
  const completable =
    order.status === "shipped" ||
    (order.status === "paid" && order.fulfilment === "none");
  if (!completable) {
    res.status(409).json({
      error:
        order.fulfilment === "none"
          ? `Cannot mark ${order.status} order as completed — must be paid first`
          : `Cannot mark ${order.status} order as completed — must be shipped first`,
    });
    return;
  }

  await orderRef.update({
    status: "completed",
    completedAt: FieldValue.serverTimestamp(),
  });

  logger.info("adminOrderActions", { uid, action: "mark-completed", orderId });
  res.status(200).json({ ok: true, status: "completed" });
};

const adminResendReceipt: Handler = async ({ res, uid, orderId }) => {
  const orderRef = db.collection("orders").doc(orderId);

  type TxResult =
    | { kind: "not-found" }
    | { kind: "bad-status"; status: Order["status"] }
    | { kind: "no-email" }
    | { kind: "rate-limited"; retryAfterSeconds: number }
    | { kind: "ok"; order: Order; mode: "invoice" | "receipt" };

  const result = await db.runTransaction<TxResult>(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { kind: "not-found" };
    const order = snap.data() as Order;

    // Mode is decided by status: pending sends the invoice (with EFT
    // banking details); paid/shipped/completed re-send the receipt.
    const isPending =
      order.status === "pending" && order.source === "manual";
    const isReceipt =
      order.status === "paid" ||
      order.status === "shipped" ||
      order.status === "completed";
    if (!isPending && !isReceipt) {
      return { kind: "bad-status", status: order.status };
    }

    if (!order.customer.email) return { kind: "no-email" };

    const last = order.receiptResendAt;
    if (last) {
      const elapsed = Date.now() - last.toDate().getTime();
      if (elapsed < RECEIPT_RESEND_WINDOW_MS) {
        const retryAfterSeconds = Math.ceil(
          (RECEIPT_RESEND_WINDOW_MS - elapsed) / 1000,
        );
        return { kind: "rate-limited", retryAfterSeconds };
      }
    }

    tx.update(orderRef, {
      receiptResendAt: FieldValue.serverTimestamp(),
    });
    return {
      kind: "ok",
      order,
      mode: isPending ? "invoice" : "receipt",
    };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (result.kind === "bad-status") {
    res.status(409).json({
      error: `Cannot resend email for ${result.status} order`,
    });
    return;
  }
  if (result.kind === "no-email") {
    res.status(409).json({
      error: "Order has no customer email address on file",
    });
    return;
  }
  if (result.kind === "rate-limited") {
    res.setHeader("Retry-After", String(result.retryAfterSeconds));
    res.status(429).json({
      error: `Too soon — wait ${result.retryAfterSeconds} seconds`,
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return;
  }

  // Transaction committed the timestamp. If the email now fails the admin
  // can't retry for 10 min — documented trade-off vs. double-send risk.
  try {
    if (result.mode === "invoice") {
      await sendCustomerInvoice(RESEND_API_KEY.value(), result.order);
    } else {
      await sendCustomerReceipt(RESEND_API_KEY.value(), result.order);
    }
  } catch (err) {
    logger.error("Email resend failed", {
      uid,
      orderId,
      mode: result.mode,
      err: String(err),
    });
    res.status(502).json({ error: "Email send failed" });
    return;
  }

  const sentAt = new Date().toISOString();
  logger.info("adminOrderActions", {
    uid,
    action: "resend-email",
    orderId,
    mode: result.mode,
  });
  res.status(200).json({ ok: true, sentAt, mode: result.mode });
};

// Route table: first match wins. Leading segment is always the orderId, so
// `subPath` is the remainder (empty string = bare detail route).
const ROUTES: Array<{
  subPath: string;
  entries: RouteEntry[];
}> = [
  {
    subPath: "",
    entries: [{ method: "GET", action: "get", handler: adminGetOrder }],
  },
  {
    subPath: "mark-shipped",
    entries: [
      { method: "POST", action: "mark-shipped", handler: adminMarkShipped },
    ],
  },
  {
    subPath: "cancel",
    entries: [
      { method: "POST", action: "cancel", handler: adminCancelOrder },
    ],
  },
  {
    subPath: "mark-paid",
    entries: [
      { method: "POST", action: "mark-paid", handler: adminMarkPaid },
    ],
  },
  {
    subPath: "mark-completed",
    entries: [
      {
        method: "POST",
        action: "mark-completed",
        handler: adminMarkCompleted,
      },
    ],
  },
  {
    subPath: "notes",
    entries: [{ method: "POST", action: "notes", handler: adminAddNote }],
  },
  {
    subPath: "resend-receipt",
    entries: [
      {
        method: "POST",
        action: "resend-receipt",
        handler: adminResendReceipt,
      },
    ],
  },
];

function resolveRoute(
  parts: string[],
  method: string,
): { handler: Handler; orderId: string } | { error: string; status: number } {
  if (parts.length === 0) {
    return { error: "Missing orderId", status: 400 };
  }
  const [orderId, ...rest] = parts;
  const subPath = rest.join("/");

  const match = ROUTES.find((r) => r.subPath === subPath);
  if (!match) return { error: "Not found", status: 404 };

  const entry = match.entries.find((e) => e.method === method);
  if (!entry) return { error: "Method Not Allowed", status: 405 };

  return { handler: entry.handler, orderId };
}

export const adminOrderActions = onRequest(
  {
    region: "us-central1",
    cors: false,
    invoker: "public",
    secrets: [RESEND_API_KEY],
  },
  async (req, res) => {
    applyCors(req, res, "GET,POST");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { uid } = auth;

    const parts = parsePath(req.path);
    const resolved = resolveRoute(parts, req.method);
    if ("error" in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    try {
      await resolved.handler({ req, res, uid, orderId: resolved.orderId });
    } catch (err) {
      logger.error("adminOrderActions failed", {
        uid,
        orderId: resolved.orderId,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);
