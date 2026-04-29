/**
 * Server product catalog. Reads from the Firestore `products/{id}` collection
 * with a short in-memory TTL cache so per-request reads stay cheap on warm
 * function instances. Used by createCheckout, adminInventory, adminManualSales.
 *
 * Pricing and availability are sourced from Firestore so admin edits flow
 * through to checkout without redeploying the customer-facing static export.
 */
import { db, type Product } from "./firestore";

export interface ServerProduct {
  id: string;
  name: string;
  price: number;
}

export const SHIPPING_FLAT_ZAR = 100;

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  products: Map<string, ServerProduct>;
  loadedAt: number;
}

let cache: CacheEntry | null = null;

async function loadCatalog(): Promise<Map<string, ServerProduct>> {
  const snap = await db.collection("products").get();
  const map = new Map<string, ServerProduct>();
  snap.forEach((doc) => {
    const data = doc.data() as Product;
    map.set(doc.id, {
      id: doc.id,
      name: data.name,
      price: data.price,
    });
  });
  return map;
}

async function getCatalog(): Promise<Map<string, ServerProduct>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.products;
  }
  const products = await loadCatalog();
  cache = { products, loadedAt: Date.now() };
  return products;
}

export async function getServerProduct(
  id: string,
): Promise<ServerProduct | undefined> {
  const catalog = await getCatalog();
  return catalog.get(id);
}

export async function listServerProducts(): Promise<ServerProduct[]> {
  const catalog = await getCatalog();
  return [...catalog.values()];
}

/** Test/seed escape hatch — invalidate the in-process cache. */
export function invalidateProductCache(): void {
  cache = null;
}
