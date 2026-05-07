import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  type InventoryItem,
  type Product,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { invalidateProductCache } from "./lib/products";

const ROOT_PATH = "/api/admin/products";
const MAX_NAME_LEN = 200;
const MAX_DESC_LEN = 2000;
const MAX_FEATURE_LEN = 200;
const MAX_FEATURES = 20;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  price: number;
  description: string;
  features: string[];
  image: string;
  inStock: boolean;
  sortOrder: number;
  updatedAt?: string;
  /**
   * Live inventory snapshot for this product. `undefined` when no inventory
   * row exists yet (admin hasn't seeded the SKU). Used by the admin Products
   * table to surface real availability instead of just the catalog-visibility
   * toggle (`inStock`).
   */
  inventory?: {
    currentStock: number;
    unitsSold: number;
    reorderLevel: number;
    lowStock: boolean;
  };
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

function toInventorySummary(
  item: InventoryItem,
): NonNullable<ProductListItem["inventory"]> {
  return {
    currentStock: item.currentStock,
    unitsSold: item.unitsSold,
    reorderLevel: item.reorderLevel,
    lowStock: item.currentStock <= item.reorderLevel,
  };
}

function toListItem(
  id: string,
  product: Product,
  inventory?: InventoryItem,
): ProductListItem {
  return {
    id,
    slug: product.slug,
    name: product.name,
    size: product.size,
    color: product.color,
    price: product.price,
    description: product.description,
    features: product.features,
    image: product.image,
    inStock: product.inStock,
    sortOrder: product.sortOrder,
    updatedAt: toIso(product.updatedAt),
    inventory: inventory ? toInventorySummary(inventory) : undefined,
  };
}

async function loadInventoryMap(): Promise<Map<string, InventoryItem>> {
  const snap = await db.collection("inventory").get();
  const map = new Map<string, InventoryItem>();
  snap.forEach((doc) => map.set(doc.id, doc.data() as InventoryItem));
  return map;
}

async function listProducts(res: Response): Promise<void> {
  const [productsSnap, inventoryMap] = await Promise.all([
    db.collection("products").orderBy("sortOrder").get(),
    loadInventoryMap(),
  ]);
  const items = productsSnap.docs.map((doc) =>
    toListItem(doc.id, doc.data() as Product, inventoryMap.get(doc.id)),
  );
  res.status(200).json({ items });
}

interface ValidatedFields {
  slug?: string;
  name?: string;
  size?: string;
  color?: string;
  price?: number;
  description?: string;
  features?: string[];
  image?: string;
  inStock?: boolean;
  sortOrder?: number;
}

function validateString(
  value: unknown,
  field: string,
  max: number,
  required: boolean,
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  if (value === undefined) {
    if (required) return { ok: false, error: `${field} is required` };
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string") {
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

function validateFields(
  body: Record<string, unknown>,
  partial: boolean,
): { ok: true; fields: ValidatedFields } | { ok: false; error: string } {
  const {
    slug,
    name,
    size,
    color,
    price,
    description,
    features,
    image,
    inStock,
    sortOrder,
    ...extra
  } = body;
  if (Object.keys(extra).length > 0) {
    return { ok: false, error: `Unexpected field: ${Object.keys(extra)[0]}` };
  }

  const fields: ValidatedFields = {};

  const slugCheck = validateString(slug, "slug", 100, !partial);
  if (!slugCheck.ok) return slugCheck;
  if (slugCheck.value !== undefined) {
    if (!SLUG_PATTERN.test(slugCheck.value)) {
      return {
        ok: false,
        error: "slug must be lowercase, alphanumeric with single hyphens",
      };
    }
    fields.slug = slugCheck.value;
  }

  const nameCheck = validateString(name, "name", MAX_NAME_LEN, !partial);
  if (!nameCheck.ok) return nameCheck;
  if (nameCheck.value !== undefined) fields.name = nameCheck.value;

  const sizeCheck = validateString(size, "size", 40, !partial);
  if (!sizeCheck.ok) return sizeCheck;
  if (sizeCheck.value !== undefined) fields.size = sizeCheck.value;

  const colorCheck = validateString(color, "color", 40, !partial);
  if (!colorCheck.ok) return colorCheck;
  if (colorCheck.value !== undefined) fields.color = colorCheck.value;

  if (price !== undefined) {
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      return { ok: false, error: "price must be a non-negative number" };
    }
    fields.price = Math.round(price * 100) / 100;
  } else if (!partial) {
    return { ok: false, error: "price is required" };
  }

  const descCheck = validateString(description, "description", MAX_DESC_LEN, !partial);
  if (!descCheck.ok) return descCheck;
  if (descCheck.value !== undefined) fields.description = descCheck.value;

  if (features !== undefined) {
    if (!Array.isArray(features)) {
      return { ok: false, error: "features must be an array of strings" };
    }
    if (features.length > MAX_FEATURES) {
      return { ok: false, error: `features cannot exceed ${MAX_FEATURES}` };
    }
    const cleaned: string[] = [];
    for (const f of features) {
      if (typeof f !== "string") {
        return { ok: false, error: "every feature must be a string" };
      }
      const trimmed = f.trim();
      if (trimmed.length === 0) continue;
      if (trimmed.length > MAX_FEATURE_LEN) {
        return { ok: false, error: "feature too long" };
      }
      cleaned.push(trimmed);
    }
    fields.features = cleaned;
  } else if (!partial) {
    fields.features = [];
  }

  const imageCheck = validateString(image, "image", 300, !partial);
  if (!imageCheck.ok) return imageCheck;
  if (imageCheck.value !== undefined) fields.image = imageCheck.value;

  if (inStock !== undefined) {
    if (typeof inStock !== "boolean") {
      return { ok: false, error: "inStock must be a boolean" };
    }
    fields.inStock = inStock;
  } else if (!partial) {
    fields.inStock = true;
  }

  if (sortOrder !== undefined) {
    if (
      typeof sortOrder !== "number" ||
      !Number.isFinite(sortOrder) ||
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      return { ok: false, error: "sortOrder must be a non-negative integer" };
    }
    fields.sortOrder = sortOrder;
  } else if (!partial) {
    fields.sortOrder = 0;
  }

  return { ok: true, fields };
}

async function createProduct(
  req: Request,
  res: Response,
  auth: AdminIdentity,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const validated = validateFields(parsed.body, false);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const { fields } = validated;
  const id = fields.slug as string;

  const docRef = db.collection("products").doc(id);
  try {
    await docRef.create({
      slug: fields.slug,
      name: fields.name,
      size: fields.size,
      color: fields.color,
      price: fields.price,
      description: fields.description,
      features: fields.features,
      image: fields.image,
      inStock: fields.inStock,
      sortOrder: fields.sortOrder,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === 6 || code === "already-exists") {
      res.status(409).json({ error: `Product ${id} already exists` });
      return;
    }
    throw err;
  }

  invalidateProductCache();

  const saved = await docRef.get();
  const inventorySnap = await db.collection("inventory").doc(id).get();
  const inventory = inventorySnap.exists
    ? (inventorySnap.data() as InventoryItem)
    : undefined;
  logger.info("adminProducts create", { uid: auth.uid, id });
  res
    .status(201)
    .json(toListItem(saved.id, saved.data() as Product, inventory));
}

async function patchProduct(
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
  const validated = validateFields(parsed.body, true);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }

  const updates: Record<string, unknown> = {
    ...validated.fields,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // Slug is the doc id; renaming would orphan downstream references (orders,
  // inventory). Block renames; admin can delete + recreate if a slug change
  // is unavoidable.
  if (validated.fields.slug && validated.fields.slug !== id) {
    res.status(400).json({ error: "slug cannot be changed" });
    return;
  }
  delete (updates as { slug?: unknown }).slug;

  const docRef = db.collection("products").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await docRef.update(updates);
  invalidateProductCache();

  const saved = await docRef.get();
  const inventorySnap = await db.collection("inventory").doc(id).get();
  const inventory = inventorySnap.exists
    ? (inventorySnap.data() as InventoryItem)
    : undefined;
  logger.info("adminProducts patch", {
    uid: auth.uid,
    id,
    fields: Object.keys(validated.fields),
  });
  res
    .status(200)
    .json(toListItem(saved.id, saved.data() as Product, inventory));
}

async function deleteProduct(
  res: Response,
  auth: AdminIdentity,
  id: string,
): Promise<void> {
  const docRef = db.collection("products").doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await docRef.delete();
  invalidateProductCache();
  logger.info("adminProducts delete", { uid: auth.uid, id });
  res.status(200).json({ ok: true, id });
}

export const adminProducts = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,PATCH,DELETE");

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
          await listProducts(res);
          return;
        }
        if (req.method === "POST") {
          await createProduct(req, res, auth);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      if (tail.length === 1) {
        if (req.method === "PATCH") {
          await patchProduct(req, res, auth, tail[0]);
          return;
        }
        if (req.method === "DELETE") {
          await deleteProduct(res, auth, tail[0]);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("adminProducts failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);
