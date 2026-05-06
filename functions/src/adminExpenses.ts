import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  Timestamp,
  VALID_EXPENSE_TYPES,
  type Expense,
} from "./lib/firestore";
import { requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";

export async function handleExpensesRequest(
  req: { method: string; path: string; body: unknown; query: Record<string, unknown> },
  res: { status: (code: number) => { json: (b: unknown) => void; send: (b: unknown) => void } },
  uid: string,
): Promise<void> {
  const parts = req.path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const expenseId = parts[parts.length - 1] !== "expenses" ? parts[parts.length - 1] : undefined;

  if (req.method === "GET") {
    let query: FirebaseFirestore.Query = db.collection("expenses").orderBy("date", "desc");

    const { from, to } = req.query;
    if (typeof from === "string" && from) {
      query = query.where("date", ">=", Timestamp.fromDate(new Date(from)));
    }
    if (typeof to === "string" && to) {
      query = query.where("date", "<=", Timestamp.fromDate(new Date(to)));
    }

    const snap = await query.get();
    const expenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.status(200).json({ expenses });
    return;
  }

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;

    if (!VALID_EXPENSE_TYPES.includes(body.type as Expense["type"])) {
      res.status(400).json({ error: `type must be one of: ${VALID_EXPENSE_TYPES.join(", ")}` });
      return;
    }
    if (typeof body.description !== "string" || !body.description.trim()) {
      res.status(400).json({ error: "description is required" });
      return;
    }
    if (typeof body.amount !== "number" || body.amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    if (typeof body.date !== "string" || isNaN(Date.parse(body.date))) {
      res.status(400).json({ error: "date must be an ISO date string" });
      return;
    }

    const expense: Expense = {
      type: body.type as Expense["type"],
      description: (body.description as string).trim(),
      amount: body.amount,
      date: Timestamp.fromDate(new Date(body.date)),
      createdAt: Timestamp.now(),
    };

    const ref = await db.collection("expenses").add(expense);
    logger.info("adminExpenses create", { uid, expenseId: ref.id });
    res.status(201).json({ id: ref.id, ...expense });
    return;
  }

  if (req.method === "DELETE") {
    if (!expenseId) {
      res.status(400).json({ error: "Missing expense id" });
      return;
    }
    const ref = db.collection("expenses").doc(expenseId);
    const snap = await ref.get();
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await ref.delete();
    logger.info("adminExpenses delete", { uid, expenseId });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method Not Allowed" });
}

export const adminExpenses = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,DELETE");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      await handleExpensesRequest(req as never, res as never, auth.uid);
    } catch (err) {
      logger.error("adminExpenses error", { err: String(err) });
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  },
);
