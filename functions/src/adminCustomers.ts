/**
 * Customer details are denormalized — every order carries its own
 * `customer` snapshot (firstName, lastName, email, phone, address). There is
 * no `customers/{id}` collection; the Customers screen aggregates over
 * orders by `email | phone | name` (see adminAnalytics).
 *
 * This endpoint lets the admin patch a customer's identity (name / email /
 * phone) in one place. We resolve "the customer" by the original aggregate
 * key (the same logic analytics uses) and then propagate the change to every
 * matching order. Address fields are intentionally NOT updated in bulk — a
 * historical order's ship-to address is a record of where it actually went,
 * not the customer's current location.
 */
import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import { db, type Order } from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";

const MAX_NAME_LEN = 100;
const MAX_PHONE_LEN = 40;
const MAX_EMAIL_LEN = 254;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const BATCH_LIMIT = 400;

interface IdentitySnapshot {
  name: string;
  email: string;
  phone: string;
}

interface IdentityUpdates {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface CustomerAggregate {
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string;
}

interface EditCustomerResponseBody {
  ordersUpdated: number;
  customer: CustomerAggregate;
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

function normalizeForKey(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

function normalizePhone(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, "");
}

function customerKey(customer: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}): string {
  const email = normalizeForKey(customer.email);
  if (email) return `email:${email}`;
  const phone = normalizePhone(customer.phone);
  if (phone) return `phone:${phone}`;
  const name = `${(customer.firstName ?? "").trim()}${(customer.lastName ?? "").trim()}`.toLowerCase();
  return `name:${name}`;
}

function keyFromSnapshot(snapshot: IdentitySnapshot): string {
  const trimmedName = snapshot.name.trim();
  const lastSpace = trimmedName.lastIndexOf(" ");
  const firstName =
    lastSpace >= 0 ? trimmedName.slice(0, lastSpace) : trimmedName;
  const lastName = lastSpace >= 0 ? trimmedName.slice(lastSpace + 1) : "";
  return customerKey({
    email: snapshot.email,
    phone: snapshot.phone,
    firstName,
    lastName,
  });
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

function validateIdentity(
  raw: unknown,
): { ok: true; identity: IdentitySnapshot } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "identity is required" };
  }
  const i = raw as Record<string, unknown>;
  const nameCheck = validateString(i.name, "identity.name", MAX_NAME_LEN * 2, false);
  if (!nameCheck.ok) return nameCheck;
  const emailCheck = validateString(i.email, "identity.email", MAX_EMAIL_LEN, false);
  if (!emailCheck.ok) return emailCheck;
  const phoneCheck = validateString(i.phone, "identity.phone", MAX_PHONE_LEN, false);
  if (!phoneCheck.ok) return phoneCheck;
  const identity: IdentitySnapshot = {
    name: nameCheck.value,
    email: emailCheck.value,
    phone: phoneCheck.value,
  };
  if (!identity.name && !identity.email && !identity.phone) {
    return {
      ok: false,
      error: "identity must include at least one of name, email, phone",
    };
  }
  return { ok: true, identity };
}

function validateUpdates(
  raw: unknown,
): { ok: true; updates: IdentityUpdates } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "updates is required" };
  }
  const u = raw as Record<string, unknown>;
  const allowed = ["firstName", "lastName", "email", "phone"] as const;
  for (const k of Object.keys(u)) {
    if (!(allowed as readonly string[]).includes(k)) {
      return { ok: false, error: `Unexpected field: ${k}` };
    }
  }
  const updates: IdentityUpdates = {};

  if (u.firstName !== undefined) {
    const r = validateString(u.firstName, "firstName", MAX_NAME_LEN, true);
    if (!r.ok) return r;
    updates.firstName = r.value;
  }
  if (u.lastName !== undefined) {
    // Allow blank lastName so admin can record mononymous customers.
    const r = validateString(u.lastName, "lastName", MAX_NAME_LEN, false);
    if (!r.ok) return r;
    updates.lastName = r.value;
  }
  if (u.email !== undefined) {
    if (typeof u.email !== "string") {
      return { ok: false, error: "email must be a string" };
    }
    const trimmed = u.email.trim();
    if (trimmed.length === 0) {
      // Blank wipes the email; allowed.
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
  if (u.phone !== undefined) {
    const r = validateString(u.phone, "phone", MAX_PHONE_LEN, true);
    if (!r.ok) return r;
    updates.phone = r.value;
  }
  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "At least one update field is required" };
  }
  return { ok: true, updates };
}

interface MatchedOrder {
  ref: FirebaseFirestore.DocumentReference;
  order: Order;
}

async function findMatchingOrders(
  targetKey: string,
): Promise<MatchedOrder[]> {
  // Linear scan of orders. For a small shop this is fine. If the collection
  // grows large enough to matter, introduce a `customerKey` field on each
  // order written at create time and query on it directly.
  const snap = await db.collection("orders").get();
  const matches: MatchedOrder[] = [];
  snap.forEach((doc) => {
    const order = doc.data() as Order;
    if (!order.customer) return;
    if (customerKey(order.customer) === targetKey) {
      matches.push({ ref: doc.ref, order });
    }
  });
  return matches;
}

function aggregateFromOrders(matches: MatchedOrder[]): CustomerAggregate {
  if (matches.length === 0) {
    return {
      name: "",
      email: "",
      phone: "",
      totalOrders: 0,
      totalSpend: 0,
      lastOrderAt: "",
    };
  }
  const first = matches[0].order.customer;
  const name = `${first.firstName ?? ""} ${first.lastName ?? ""}`.trim();
  let totalOrders = 0;
  let totalSpend = 0;
  let lastOrderAt = "";
  for (const { order } of matches) {
    if (order.status === "pending") continue;
    const isRevenue =
      order.status === "paid" ||
      order.status === "shipped" ||
      order.status === "completed";
    if (!isRevenue) continue;
    totalOrders += 1;
    totalSpend += order.total ?? 0;
    const iso = order.createdAt
      ? order.createdAt.toDate().toISOString()
      : "";
    if (iso > lastOrderAt) lastOrderAt = iso;
  }
  return {
    name,
    email: first.email ?? "",
    phone: first.phone ?? "",
    totalOrders,
    totalSpend,
    lastOrderAt,
  };
}

async function applyUpdates(
  matches: MatchedOrder[],
  updates: IdentityUpdates,
): Promise<void> {
  // Firestore batch limit is 500 writes; chunk just below to leave headroom.
  for (let i = 0; i < matches.length; i += BATCH_LIMIT) {
    const slice = matches.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const { ref } of slice) {
      const fieldUpdates: Record<string, string> = {};
      if (updates.firstName !== undefined)
        fieldUpdates["customer.firstName"] = updates.firstName;
      if (updates.lastName !== undefined)
        fieldUpdates["customer.lastName"] = updates.lastName;
      if (updates.email !== undefined)
        fieldUpdates["customer.email"] = updates.email;
      if (updates.phone !== undefined)
        fieldUpdates["customer.phone"] = updates.phone;
      batch.update(ref, fieldUpdates);
    }
    await batch.commit();
  }
}

export const adminCustomers = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req: Request, res: Response) => {
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

    const parsed = parseJsonBody(req);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const identity = validateIdentity(parsed.body.identity);
    if (!identity.ok) {
      res.status(400).json({ error: identity.error });
      return;
    }
    const updates = validateUpdates(parsed.body.updates);
    if (!updates.ok) {
      res.status(400).json({ error: updates.error });
      return;
    }

    try {
      const targetKey = keyFromSnapshot(identity.identity);
      const matches = await findMatchingOrders(targetKey);
      if (matches.length === 0) {
        res
          .status(404)
          .json({ error: "No orders found for this customer" });
        return;
      }

      await applyUpdates(matches, updates.updates);

      // Re-read so the aggregate reflects the post-update state.
      const refreshed = await findMatchingOrders(
        customerKey({
          email: updates.updates.email ?? identity.identity.email,
          phone: updates.updates.phone ?? identity.identity.phone,
          firstName:
            updates.updates.firstName ??
            identity.identity.name.split(" ")[0] ??
            "",
          lastName:
            updates.updates.lastName ??
            identity.identity.name.split(" ").slice(1).join(" "),
        }),
      );

      logger.info("adminCustomers edit", {
        uid: auth.uid,
        targetKey,
        ordersUpdated: matches.length,
      });

      const body: EditCustomerResponseBody = {
        ordersUpdated: matches.length,
        customer: aggregateFromOrders(refreshed),
      };
      res.status(200).json(body);
    } catch (err) {
      logger.error("adminCustomers failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to update customer" });
      }
    }
  },
);

export type {
  IdentitySnapshot,
  IdentityUpdates,
  CustomerAggregate as AdminCustomerAggregate,
  EditCustomerResponseBody,
};
