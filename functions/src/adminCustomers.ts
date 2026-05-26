/**
 * Admin endpoints for the canonical `customers/{customerId}` collection.
 *
 *   GET    /api/admin/customers           — list all customers with computed
 *                                            order stats (totalOrders, spend,
 *                                            lastOrderAt)
 *   PATCH  /api/admin/customers/{id}      — update identity (firstName,
 *                                            lastName, email, phone). Also
 *                                            propagates the change onto every
 *                                            order snapshot so historical
 *                                            invoices read correctly.
 *
 * Note: `order.customer` snapshots remain authoritative for shipping records;
 * the customer doc here is the identity source-of-truth.
 */
import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  type CustomerRecord,
  type Order,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";
import {
  normalizeEmailLower,
  normalizePhoneDigits,
} from "./lib/customers";

const ROOT_PATH = "/api/admin/customers";
const MAX_NAME_LEN = 100;
const MAX_PHONE_LEN = 40;
const MAX_EMAIL_LEN = 254;
const MAX_NOTES_LEN = 2000;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const ORDER_BATCH_LIMIT = 400;

interface CustomerListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  defaultAddress?: CustomerRecord["defaultAddress"];
  notes?: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface CustomerIdentityUpdates {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

function parseTail(rawPath: string): string[] {
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean);
}

function toIso(
  ts: FirebaseFirestore.Timestamp | undefined | null,
): string | undefined {
  return ts ? ts.toDate().toISOString() : undefined;
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

interface OrderStats {
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string;
}

const REVENUE_STATUSES: ReadonlyArray<Order["status"]> = [
  "paid",
  "shipped",
  "completed",
];

function isRevenue(order: Order): boolean {
  return REVENUE_STATUSES.includes(order.status);
}

/**
 * Computes per-customer order stats from a single orders scan. Uses
 * `order.customerId` when present and falls back to the legacy email|phone|
 * name key so pre-migration orders still aggregate correctly.
 */
function aggregateStats(
  orders: Order[],
): {
  byId: Map<string, OrderStats>;
  byLegacyKey: Map<string, OrderStats>;
} {
  const byId = new Map<string, OrderStats>();
  const byLegacyKey = new Map<string, OrderStats>();

  const bump = (
    bucket: Map<string, OrderStats>,
    key: string,
    order: Order,
  ): void => {
    const iso = order.createdAt
      ? order.createdAt.toDate().toISOString()
      : "";
    const existing = bucket.get(key);
    if (existing) {
      existing.totalOrders += 1;
      existing.totalSpend += order.total ?? 0;
      if (iso > existing.lastOrderAt) existing.lastOrderAt = iso;
    } else {
      bucket.set(key, {
        totalOrders: 1,
        totalSpend: order.total ?? 0,
        lastOrderAt: iso,
      });
    }
  };

  for (const order of orders) {
    if (!isRevenue(order)) continue;
    if (order.customerId) {
      bump(byId, order.customerId, order);
    } else {
      const email = (order.customer.email ?? "").trim().toLowerCase();
      const phone = (order.customer.phone ?? "").replace(/\s+/g, "");
      const legacyKey = email
        ? `email:${email}`
        : phone
          ? `phone:${phone}`
          : `name:${(order.customer.firstName ?? "") + (order.customer.lastName ?? "")}`.toLowerCase();
      bump(byLegacyKey, legacyKey, order);
    }
  }

  return { byId, byLegacyKey };
}

function legacyKeyForCustomer(customer: CustomerRecord): string {
  if (customer.emailLower) return `email:${customer.emailLower}`;
  if (customer.phoneDigits) return `phone:${customer.phoneDigits}`;
  return `name:${customer.firstName.toLowerCase()}${customer.lastName.toLowerCase()}`;
}

async function loadAllOrders(): Promise<Order[]> {
  const snap = await db.collection("orders").get();
  return snap.docs.map((doc) => doc.data() as Order);
}

async function listCustomers(res: Response): Promise<void> {
  const [customersSnap, orders] = await Promise.all([
    db.collection("customers").orderBy("updatedAt", "desc").get(),
    loadAllOrders(),
  ]);
  const { byId, byLegacyKey } = aggregateStats(orders);

  const items: CustomerListItem[] = customersSnap.docs.map((doc) => {
    const record = doc.data() as CustomerRecord;
    const idStats = byId.get(doc.id);
    const legacyStats = byLegacyKey.get(legacyKeyForCustomer(record));
    const merged: OrderStats = {
      totalOrders:
        (idStats?.totalOrders ?? 0) + (legacyStats?.totalOrders ?? 0),
      totalSpend:
        (idStats?.totalSpend ?? 0) + (legacyStats?.totalSpend ?? 0),
      lastOrderAt:
        (idStats?.lastOrderAt ?? "") > (legacyStats?.lastOrderAt ?? "")
          ? (idStats?.lastOrderAt ?? "")
          : (legacyStats?.lastOrderAt ?? ""),
    };
    return {
      id: doc.id,
      firstName: record.firstName,
      lastName: record.lastName,
      email: record.email,
      phone: record.phone,
      defaultAddress: record.defaultAddress,
      notes: record.notes,
      totalOrders: merged.totalOrders,
      totalSpend: merged.totalSpend,
      lastOrderAt: merged.lastOrderAt || undefined,
      createdAt: toIso(record.createdAt),
      updatedAt: toIso(record.updatedAt),
    };
  });

  // Sort by total spend desc to match the previous Customers screen sort.
  items.sort((a, b) => b.totalSpend - a.totalSpend);

  res.status(200).json({ items });
}

function validateString(
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== "string") {
    if (!required && value === undefined) return { ok: true, value: "" };
    return { ok: false, error: `${field} must be a string` };
  }
  const trimmed = value.trim();
  if (required && trimmed.length === 0) {
    return { ok: false, error: `${field} is required` };
  }
  if (trimmed.length > max) {
    return { ok: false, error: `${field} too long` };
  }
  return { ok: true, value: trimmed };
}

function validateUpdates(
  body: Record<string, unknown>,
): { ok: true; updates: CustomerIdentityUpdates } | { ok: false; error: string } {
  const allowed = ["firstName", "lastName", "email", "phone", "notes"] as const;
  for (const k of Object.keys(body)) {
    if (!(allowed as readonly string[]).includes(k)) {
      return { ok: false, error: `Unexpected field: ${k}` };
    }
  }
  const updates: CustomerIdentityUpdates = {};

  if (body.firstName !== undefined) {
    const r = validateString(body.firstName, "firstName", MAX_NAME_LEN, true);
    if (!r.ok) return r;
    updates.firstName = r.value;
  }
  if (body.lastName !== undefined) {
    const r = validateString(body.lastName, "lastName", MAX_NAME_LEN, false);
    if (!r.ok) return r;
    updates.lastName = r.value;
  }
  if (body.email !== undefined) {
    if (typeof body.email !== "string") {
      return { ok: false, error: "email must be a string" };
    }
    const trimmed = body.email.trim();
    if (trimmed.length === 0) {
      updates.email = "";
    } else {
      if (trimmed.length > MAX_EMAIL_LEN) {
        return { ok: false, error: "email too long" };
      }
      if (!EMAIL_PATTERN.test(trimmed)) {
        return { ok: false, error: "Invalid email" };
      }
      updates.email = trimmed;
    }
  }
  if (body.phone !== undefined) {
    const r = validateString(body.phone, "phone", MAX_PHONE_LEN, true);
    if (!r.ok) return r;
    updates.phone = r.value;
  }
  if (body.notes !== undefined) {
    const r = validateString(body.notes, "notes", MAX_NOTES_LEN, false);
    if (!r.ok) return r;
    updates.notes = r.value;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "At least one field is required" };
  }
  return { ok: true, updates };
}

/**
 * Propagates identity changes to every order's customer snapshot. Skipped if
 * the updates only touch `notes`, which lives on the customer doc only.
 */
async function propagateToOrders(
  customerId: string,
  customer: CustomerRecord,
  updates: CustomerIdentityUpdates,
): Promise<number> {
  const fieldUpdates: Record<string, string> = {};
  if (updates.firstName !== undefined)
    fieldUpdates["customer.firstName"] = updates.firstName;
  if (updates.lastName !== undefined)
    fieldUpdates["customer.lastName"] = updates.lastName;
  if (updates.email !== undefined)
    fieldUpdates["customer.email"] = updates.email;
  if (updates.phone !== undefined)
    fieldUpdates["customer.phone"] = updates.phone;
  if (Object.keys(fieldUpdates).length === 0) return 0;

  // Collect matching orders: by customerId AND by legacy key (so legacy
  // orders from before normalization still get the snapshot fix).
  const [byId, byLegacy] = await Promise.all([
    db.collection("orders").where("customerId", "==", customerId).get(),
    (async () => {
      const orders = await db.collection("orders").get();
      const legacyKey = legacyKeyForCustomer(customer);
      return orders.docs.filter((doc) => {
        const o = doc.data() as Order;
        if (o.customerId) return false; // already handled by byId scan
        const email = (o.customer.email ?? "").trim().toLowerCase();
        const phone = (o.customer.phone ?? "").replace(/\s+/g, "");
        const k = email
          ? `email:${email}`
          : phone
            ? `phone:${phone}`
            : `name:${(o.customer.firstName ?? "") + (o.customer.lastName ?? "")}`.toLowerCase();
        return k === legacyKey;
      });
    })(),
  ]);

  const refs: FirebaseFirestore.DocumentReference[] = [
    ...byId.docs.map((d) => d.ref),
    ...byLegacy.map((d) => d.ref),
  ];

  let updated = 0;
  for (let i = 0; i < refs.length; i += ORDER_BATCH_LIMIT) {
    const slice = refs.slice(i, i + ORDER_BATCH_LIMIT);
    const batch = db.batch();
    for (const ref of slice) batch.update(ref, fieldUpdates);
    await batch.commit();
    updated += slice.length;
  }
  return updated;
}

async function patchCustomer(
  req: Request,
  res: Response,
  auth: AdminIdentity,
  id: string,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const validated = validateUpdates(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const docRef = db.doc(`customers/${id}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const existing = snap.data() as CustomerRecord;
  const updates = validated.updates;

  const docUpdates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (updates.firstName !== undefined) docUpdates.firstName = updates.firstName;
  if (updates.lastName !== undefined) docUpdates.lastName = updates.lastName;
  if (updates.email !== undefined) {
    docUpdates.email = updates.email;
    docUpdates.emailLower = normalizeEmailLower(updates.email);
  }
  if (updates.phone !== undefined) {
    docUpdates.phone = updates.phone;
    docUpdates.phoneDigits = normalizePhoneDigits(updates.phone);
  }
  if (updates.notes !== undefined) docUpdates.notes = updates.notes;

  await docRef.update(docUpdates);

  // Propagate identity-only changes onto historical order snapshots.
  const ordersUpdated = await propagateToOrders(id, existing, updates);

  const saved = await docRef.get();
  logger.info("adminCustomers patch", {
    uid: auth.uid,
    id,
    fields: Object.keys(updates),
    ordersUpdated,
  });

  const record = saved.data() as CustomerRecord;
  const item: CustomerListItem = {
    id,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    phone: record.phone,
    defaultAddress: record.defaultAddress,
    notes: record.notes,
    totalOrders: 0,
    totalSpend: 0,
    createdAt: toIso(record.createdAt),
    updatedAt: toIso(record.updatedAt),
  };
  res.status(200).json({ ordersUpdated, customer: item });
}

export const adminCustomers = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req: Request, res: Response) => {
    applyCors(req, res, "GET,PATCH");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      const tail = parseTail(req.path);

      if (tail.length === 0) {
        if (req.method === "GET") {
          await listCustomers(res);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      if (tail.length === 1) {
        if (req.method === "PATCH") {
          await patchCustomer(req, res, auth, tail[0]);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("adminCustomers failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);

export type { CustomerListItem, CustomerIdentityUpdates };
