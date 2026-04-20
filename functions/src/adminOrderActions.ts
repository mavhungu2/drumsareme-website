import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  Timestamp,
  type Order,
  type OrderNote,
  type OrderTracking,
} from "./lib/firestore";
import { ADMIN_UIDS, requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";
import {
  sendCancellationNotification,
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

  const validated = validateTrackingInput(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { tracking } = validated;

  const orderRef = db.collection("orders").doc(orderId);
  const snap = await orderRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const order = snap.data() as Order;

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
    });
    return;
  }

  if (order.status !== "paid") {
    res.status(409).json({
      error: `Cannot mark ${order.status} order as shipped`,
    });
    return;
  }

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

  await orderRef.update({
    status: "cancelled",
    cancelledAt: FieldValue.serverTimestamp(),
    notes: FieldValue.arrayUnion(cancellationNote),
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

const adminResendReceipt: Handler = async ({ res, uid, orderId }) => {
  const orderRef = db.collection("orders").doc(orderId);

  type TxResult =
    | { kind: "not-found" }
    | { kind: "bad-status"; status: Order["status"] }
    | { kind: "rate-limited"; retryAfterSeconds: number }
    | { kind: "ok"; order: Order };

  const result = await db.runTransaction<TxResult>(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) return { kind: "not-found" };
    const order = snap.data() as Order;

    if (order.status !== "paid" && order.status !== "shipped") {
      return { kind: "bad-status", status: order.status };
    }

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
    return { kind: "ok", order };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (result.kind === "bad-status") {
    res.status(409).json({
      error: `Cannot resend receipt for ${result.status} order`,
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
    await sendCustomerReceipt(RESEND_API_KEY.value(), result.order);
  } catch (err) {
    logger.error("Receipt resend email failed", {
      uid,
      orderId,
      err: String(err),
    });
    res.status(502).json({ error: "Email send failed" });
    return;
  }

  const sentAt = new Date().toISOString();
  logger.info("adminOrderActions", {
    uid,
    action: "resend-receipt",
    orderId,
  });
  res.status(200).json({ ok: true, sentAt });
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

    void ADMIN_UIDS;

    const uid = await requireAdmin(req, res);
    if (!uid) return;

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
