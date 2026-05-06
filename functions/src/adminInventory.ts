import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, FieldValue, type InventoryItem } from "./lib/firestore";
import { requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { getServerProduct } from "./lib/products";

const ROOT_PATH = "/api/admin/inventory/";

function extractProductId(rawPath: string): string {
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/")[0] ?? "";
}

function parseIntField(
  val: unknown,
  name: string,
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof val !== "number" || !Number.isFinite(val)) {
    return { ok: false, error: `${name} must be a number` };
  }
  if (!Number.isInteger(val) || val < 0) {
    return { ok: false, error: `${name} must be a non-negative integer` };
  }
  return { ok: true, value: val };
}

export async function handleInventoryRequest(
  req: { method: string; path: string; body: unknown },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    json?: (body: unknown) => void;
  },
  uid: string,
): Promise<void> {
  const productId = extractProductId(req.path);

  if (!productId) {
    res.status(400).json({ error: "Missing productId" });
    return;
  }

  if (req.method === "GET") {
    const snap = await db.collection("inventory").doc(productId).get();
    if (!snap.exists) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(200).json({ id: snap.id, ...snap.data() });
    logger.info("adminInventory get", { uid, productId });
    return;
  }

  if (req.method === "POST" || req.method === "PATCH") {
    if (!getServerProduct(productId)) {
      res.status(400).json({ error: "Unknown productId" });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const invRef = db.collection("inventory").doc(productId);
    const snap = await invRef.get();
    const existing = snap.exists ? (snap.data() as InventoryItem) : null;

    let openingStock: number | undefined;
    let reorderLevel: number | undefined;

    if (body.openingStock !== undefined) {
      const r = parseIntField(body.openingStock, "openingStock");
      if (!r.ok) { res.status(400).json({ error: r.error }); return; }
      openingStock = r.value;
    }
    if (body.reorderLevel !== undefined) {
      const r = parseIntField(body.reorderLevel, "reorderLevel");
      if (!r.ok) { res.status(400).json({ error: r.error }); return; }
      reorderLevel = r.value;
    }

    if (!snap.exists) {
      const newOpening = openingStock ?? 0;
      const doc: Record<string, unknown> = {
        productId,
        openingStock: newOpening,
        unitsSold: 0,
        currentStock: newOpening,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (reorderLevel !== undefined) doc.reorderLevel = reorderLevel;
      await invRef.set(doc);
    } else {
      const newOpening =
        openingStock !== undefined ? openingStock : (existing?.openingStock ?? 0);
      const updates: Record<string, unknown> = {
        currentStock: newOpening - (existing?.unitsSold ?? 0),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (openingStock !== undefined) updates.openingStock = openingStock;
      if (reorderLevel !== undefined) updates.reorderLevel = reorderLevel;
      await invRef.update(updates);
    }

    const updated = (await invRef.get()).data();
    logger.info("adminInventory upsert", { uid, productId });
    res.status(200).json({ id: productId, ...updated });
    return;
  }

  res.status(405).json({ error: "Method Not Allowed" });
}

export const adminInventory = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,PATCH");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      await handleInventoryRequest(req, res, auth.uid);
    } catch (err) {
      logger.error("adminInventory error", { err: String(err) });
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  },
);
