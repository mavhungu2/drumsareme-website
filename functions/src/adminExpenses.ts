import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  Timestamp,
  type Expense,
  type ExpenseType,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";

const ROOT_PATH = "/api/admin/expenses";
const MAX_DESCRIPTION_LEN = 500;
const VALID_TYPES: ReadonlyArray<ExpenseType> = [
  "materials",
  "shipping",
  "marketing",
  "operations",
  "other",
];

interface ExpenseListItem {
  id: string;
  date: string;
  type: ExpenseType;
  description: string;
  amount: number;
  createdAt: string;
  createdBy: string;
}

function parseTail(rawPath: string): string[] {
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean);
}

function toIso(ts: FirebaseFirestore.Timestamp): string {
  return ts.toDate().toISOString();
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

function toListItem(id: string, expense: Expense): ExpenseListItem {
  return {
    id,
    date: toIso(expense.date),
    type: expense.type,
    description: expense.description,
    amount: expense.amount,
    createdAt: toIso(expense.createdAt),
    createdBy: expense.createdBy,
  };
}

interface ListQuery {
  from?: Timestamp;
  to?: Timestamp;
  limit: number;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

function parseListQuery(
  rawQuery: Record<string, string | string[] | undefined>,
): ListQuery | string {
  const from = parseIsoTimestamp(firstQueryValue(rawQuery.from));
  if (rawQuery.from && !from) return "Invalid 'from' date";
  const to = parseIsoTimestamp(firstQueryValue(rawQuery.to));
  if (rawQuery.to && !to) return "Invalid 'to' date";
  const limitRaw = firstQueryValue(rawQuery.limit);
  const parsed = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT;
  const limit =
    Number.isFinite(parsed) && parsed > 0
      ? Math.min(parsed, MAX_LIMIT)
      : DEFAULT_LIMIT;
  return { from, to, limit };
}

async function listExpenses(req: Request, res: Response): Promise<void> {
  const parsed = parseListQuery(
    req.query as Record<string, string | string[] | undefined>,
  );
  if (typeof parsed === "string") {
    res.status(400).json({ error: parsed });
    return;
  }

  let q: FirebaseFirestore.Query = db
    .collection("expenses")
    .orderBy("date", "desc");
  if (parsed.from) q = q.where("date", ">=", parsed.from);
  if (parsed.to) q = q.where("date", "<=", parsed.to);

  const snap = await q.limit(parsed.limit).get();
  const items = snap.docs.map((doc) =>
    toListItem(doc.id, doc.data() as Expense),
  );

  res.status(200).json({ items });
}

interface CreateInput {
  date: Timestamp;
  type: ExpenseType;
  description: string;
  amount: number;
}

function validateCreate(
  body: Record<string, unknown>,
): { ok: true; input: CreateInput } | { ok: false; error: string } {
  const { date, type, description, amount, ...extra } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }
  if (typeof date !== "string") {
    return { ok: false, error: "date must be an ISO string" };
  }
  const dateParsed = new Date(date);
  if (Number.isNaN(dateParsed.getTime())) {
    return { ok: false, error: "Invalid date" };
  }
  if (typeof type !== "string" || !VALID_TYPES.includes(type as ExpenseType)) {
    return {
      ok: false,
      error: `type must be one of ${VALID_TYPES.join(", ")}`,
    };
  }
  if (typeof description !== "string") {
    return { ok: false, error: "description must be a string" };
  }
  const descTrimmed = description.trim();
  if (descTrimmed.length === 0) {
    return { ok: false, error: "description is required" };
  }
  if (descTrimmed.length > MAX_DESCRIPTION_LEN) {
    return { ok: false, error: "description too long" };
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "amount must be a non-negative number" };
  }
  return {
    ok: true,
    input: {
      date: Timestamp.fromDate(dateParsed),
      type: type as ExpenseType,
      description: descTrimmed,
      amount: Math.round(amount * 100) / 100,
    },
  };
}

async function createExpense(
  req: Request,
  res: Response,
  auth: AdminIdentity,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const validated = validateCreate(parsed.body);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { input } = validated;

  const docRef = await db.collection("expenses").add({
    date: input.date,
    type: input.type,
    description: input.description,
    amount: input.amount,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: auth.uid,
  });

  const saved = await docRef.get();
  const data = saved.data() as Expense;

  logger.info("adminExpenses create", {
    uid: auth.uid,
    id: saved.id,
    type: input.type,
    amount: input.amount,
  });
  res.status(201).json(toListItem(saved.id, data));
}

async function deleteExpense(
  res: Response,
  auth: AdminIdentity,
  id: string,
): Promise<void> {
  const docRef = db.collection("expenses").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await docRef.delete();
  logger.info("adminExpenses delete", { uid: auth.uid, id });
  res.status(200).json({ ok: true, id });
}

export const adminExpenses = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,DELETE");

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
          await listExpenses(req, res);
          return;
        }
        if (req.method === "POST") {
          await createExpense(req, res, auth);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      if (tail.length === 1 && req.method === "DELETE") {
        await deleteExpense(res, auth, tail[0]);
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("adminExpenses failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);
