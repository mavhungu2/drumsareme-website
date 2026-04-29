import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, Timestamp, type Order } from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";

const VALID_STATUSES: ReadonlyArray<Order["status"]> = [
  "pending",
  "paid",
  "failed",
  "shipped",
  "cancelled",
];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

interface OrderListItem {
  id: string;
  ref: string;
  status: Order["status"];
  customerName: string;
  customerEmail: string;
  customerCity: string;
  total: number;
  itemCount: number;
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
}

interface ListQuery {
  status?: Order["status"];
  q?: string;
  from?: Timestamp;
  to?: Timestamp;
  limit: number;
  cursor?: string;
}

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseIsoTimestamp(raw: string | undefined): Timestamp | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return Timestamp.fromDate(date);
}

function parseLimit(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function parseQuery(
  rawQuery: Record<string, string | string[] | undefined>,
): ListQuery | string {
  const statusRaw = firstQueryValue(rawQuery.status);
  let status: Order["status"] | undefined;
  if (statusRaw) {
    if (!VALID_STATUSES.includes(statusRaw as Order["status"])) {
      return `Invalid status: ${statusRaw}`;
    }
    status = statusRaw as Order["status"];
  }

  const qRaw = firstQueryValue(rawQuery.q);
  const q = qRaw ? qRaw.trim().toLowerCase() : undefined;

  const from = parseIsoTimestamp(firstQueryValue(rawQuery.from));
  if (rawQuery.from && !from) return "Invalid 'from' date";
  const to = parseIsoTimestamp(firstQueryValue(rawQuery.to));
  if (rawQuery.to && !to) return "Invalid 'to' date";

  const limit = parseLimit(firstQueryValue(rawQuery.limit));
  const cursor = firstQueryValue(rawQuery.cursor);

  return { status, q, from, to, limit, cursor: cursor || undefined };
}

function matchesSearch(order: Order, q: string): boolean {
  return (
    order.ref.toLowerCase().includes(q) ||
    order.customer.email.toLowerCase().includes(q)
  );
}

function timestampToIso(
  value: FirebaseFirestore.Timestamp | undefined,
): string | undefined {
  return value ? value.toDate().toISOString() : undefined;
}

function toListItem(id: string, order: Order): OrderListItem {
  const itemCount = order.items.reduce((sum, item) => sum + item.qty, 0);
  const createdAt = timestampToIso(order.createdAt) ?? "";
  return {
    id,
    ref: order.ref,
    status: order.status,
    customerName: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
    customerEmail: order.customer.email,
    customerCity: order.customer.city,
    total: order.total,
    itemCount,
    createdAt,
    paidAt: timestampToIso(order.paidAt),
    shippedAt: timestampToIso(order.shippedAt),
  };
}

// NOTE: If you combine `status` equality with a `createdAt` range, Firestore
// requires a composite index on (status ASC, createdAt DESC). Add it via the
// Firebase Console the first time the query runs — the error message will
// include a direct link.
async function runOrdersQuery(
  query: ListQuery,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  let q: FirebaseFirestore.Query = db
    .collection("orders")
    .orderBy("createdAt", "desc");

  if (query.status) q = q.where("status", "==", query.status);
  if (query.from) q = q.where("createdAt", ">=", query.from);
  if (query.to) q = q.where("createdAt", "<=", query.to);

  if (query.cursor) {
    const cursorSnap = await db.collection("orders").doc(query.cursor).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }

  // Fetch one extra to detect whether there's a next page.
  const snap = await q.limit(query.limit + 1).get();
  return snap.docs;
}

export const adminListOrders = onRequest(
  {
    region: "us-central1",
    cors: false,
    invoker: "public",
  },
  async (req, res) => {
    applyCors(req, res, "GET");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Touch the param so it's discovered at deploy time even though we use
    // it only indirectly via requireAdmin. See firebase-functions v2 params.
    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;
    const { uid } = auth;

    const parsed = parseQuery(
      req.query as Record<string, string | string[] | undefined>,
    );
    if (typeof parsed === "string") {
      res.status(400).json({ error: parsed });
      return;
    }

    try {
      const docs = await runOrdersQuery(parsed);
      const hasMore = docs.length > parsed.limit;
      const pageDocs = hasMore ? docs.slice(0, parsed.limit) : docs;

      // Substring search (ref / email) is applied in-memory because Firestore
      // does not support `LIKE`-style queries. This is safe at the current
      // volume; revisit with Algolia / Typesense if the dataset grows.
      const filtered = parsed.q
        ? pageDocs.filter((doc) => matchesSearch(doc.data() as Order, parsed.q!))
        : pageDocs;

      const orders = filtered.map((doc) => toListItem(doc.id, doc.data() as Order));
      const nextCursor = hasMore ? pageDocs[pageDocs.length - 1].id : null;

      logger.info("adminListOrders", {
        uid,
        action: "list",
        count: orders.length,
        hasMore,
      });
      res.status(200).json({ orders, nextCursor });
    } catch (err) {
      logger.error("adminListOrders failed", { uid, err: String(err) });
      res.status(500).json({ error: "Failed to list orders" });
    }
  },
);
