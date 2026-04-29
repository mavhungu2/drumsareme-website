import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  type InventoryItem,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { getServerProduct } from "./lib/products";

const ROOT_PATH = "/api/admin/inventory";
const MAX_SUPPLIER_LEN = 120;

interface InventoryListItem {
  productId: string;
  name: string;
  openingStock: number;
  unitsSold: number;
  currentStock: number;
  reorderLevel: number;
  supplier?: string;
  updatedAt?: string;
  lowStock: boolean;
}

function parseTail(rawPath: string): string[] {
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean);
}

function toIso(ts: FirebaseFirestore.Timestamp | undefined): string | undefined {
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

function toListItem(productId: string, item: InventoryItem): InventoryListItem {
  return {
    productId,
    name: item.name,
    openingStock: item.openingStock,
    unitsSold: item.unitsSold,
    currentStock: item.currentStock,
    reorderLevel: item.reorderLevel,
    supplier: item.supplier,
    updatedAt: toIso(item.updatedAt),
    lowStock: item.currentStock <= item.reorderLevel,
  };
}

async function listInventory(res: Response): Promise<void> {
  const snap = await db.collection("inventory").get();
  const items = snap.docs
    .map((doc) => toListItem(doc.id, doc.data() as InventoryItem))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.status(200).json({ items });
}

interface UpsertInput {
  productId: string;
  openingStock: number;
  reorderLevel: number;
  supplier?: string;
}

function validateUpsert(
  body: Record<string, unknown>,
  productIdFromPath?: string,
): { ok: true; input: UpsertInput } | { ok: false; error: string } {
  const {
    productId: rawProductId,
    openingStock,
    reorderLevel,
    supplier,
    ...extra
  } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }

  const productId =
    productIdFromPath ??
    (typeof rawProductId === "string" ? rawProductId.trim() : "");
  if (!productId) {
    return { ok: false, error: "productId is required" };
  }
  if (!getServerProduct(productId)) {
    return { ok: false, error: `Unknown productId: ${productId}` };
  }

  if (typeof openingStock !== "number" || !Number.isFinite(openingStock) || openingStock < 0 || !Number.isInteger(openingStock)) {
    return { ok: false, error: "openingStock must be a non-negative integer" };
  }
  if (typeof reorderLevel !== "number" || !Number.isFinite(reorderLevel) || reorderLevel < 0 || !Number.isInteger(reorderLevel)) {
    return { ok: false, error: "reorderLevel must be a non-negative integer" };
  }

  let supplierClean: string | undefined;
  if (supplier !== undefined) {
    if (typeof supplier !== "string") {
      return { ok: false, error: "supplier must be a string" };
    }
    const trimmed = supplier.trim();
    if (trimmed.length > MAX_SUPPLIER_LEN) {
      return { ok: false, error: "supplier too long" };
    }
    supplierClean = trimmed.length > 0 ? trimmed : undefined;
  }

  return {
    ok: true,
    input: {
      productId,
      openingStock,
      reorderLevel,
      supplier: supplierClean,
    },
  };
}

async function upsertInventory(
  req: Request,
  res: Response,
  auth: AdminIdentity,
  productIdFromPath?: string,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const validated = validateUpsert(parsed.body, productIdFromPath);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { input } = validated;

  const product = getServerProduct(input.productId)!;
  const docRef = db.collection("inventory").doc(input.productId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const existingSold =
      snap.exists ? ((snap.data() as InventoryItem).unitsSold ?? 0) : 0;
    const currentStock = Math.max(0, input.openingStock - existingSold);
    const updates: Record<string, unknown> = {
      productId: input.productId,
      name: product.name,
      openingStock: input.openingStock,
      unitsSold: existingSold,
      currentStock,
      reorderLevel: input.reorderLevel,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.supplier !== undefined) {
      updates.supplier = input.supplier;
    } else if (!snap.exists) {
      updates.supplier = FieldValue.delete();
    }
    if (snap.exists) {
      tx.update(docRef, updates);
    } else {
      tx.set(docRef, updates);
    }
    return { unitsSold: existingSold, currentStock };
  });

  const saved = await docRef.get();
  const data = saved.data() as InventoryItem;

  logger.info("adminInventory upsert", {
    uid: auth.uid,
    productId: input.productId,
    openingStock: input.openingStock,
    unitsSold: result.unitsSold,
  });

  res.status(200).json(toListItem(saved.id, data));
}

export const adminInventory = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,PATCH");

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
          await listInventory(res);
          return;
        }
        if (req.method === "POST") {
          await upsertInventory(req, res, auth);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      if (tail.length === 1 && req.method === "PATCH") {
        await upsertInventory(req, res, auth, tail[0]);
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("adminInventory failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);
