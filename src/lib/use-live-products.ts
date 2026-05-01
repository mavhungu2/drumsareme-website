"use client";

import { useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { FIREBASE_WEB_APP_CONFIG } from "./firebase-web-app-config";
import type { Product } from "./products";

interface LiveOverlayEntry {
  price: number;
  inStock: boolean;
  stock?: number;
  name?: string;
  description?: string;
  features?: string[];
  image?: string;
  slug?: string;
  size?: string;
  color?: string;
  sortOrder?: number;
}

type LiveOverlay = ReadonlyMap<string, LiveOverlayEntry>;

/**
 * Reads the public Firestore `products` collection and exposes a map of
 * `id -> {price, inStock}`. Used to overlay statically-baked product data
 * with admin edits made between builds.
 *
 * Fails open: if the fetch errors, the overlay is empty and pages display
 * their baked values.
 */
function getReadonlyApp() {
  if (getApps().length > 0) return getApp();
  return initializeApp(FIREBASE_WEB_APP_CONFIG);
}

let cached: LiveOverlay | null = null;
let inflight: Promise<LiveOverlay> | null = null;

async function loadOverlay(): Promise<LiveOverlay> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const db = getFirestore(getReadonlyApp());
      const [productsSnap, inventorySnap] = await Promise.all([
        getDocs(collection(db, "products")),
        getDocs(collection(db, "inventory")),
      ]);
      const stockByProduct = new Map<string, number>();
      inventorySnap.forEach((doc) => {
        const data = doc.data() as { currentStock?: unknown };
        if (
          typeof data.currentStock === "number" &&
          Number.isFinite(data.currentStock)
        ) {
          stockByProduct.set(doc.id, data.currentStock);
        }
      });
      const map = new Map<string, LiveOverlayEntry>();
      productsSnap.forEach((doc) => {
        const data = doc.data() as {
          price?: unknown;
          inStock?: unknown;
          name?: unknown;
          description?: unknown;
          features?: unknown;
          image?: unknown;
          slug?: unknown;
          size?: unknown;
          color?: unknown;
          sortOrder?: unknown;
        };
        const price =
          typeof data.price === "number" && Number.isFinite(data.price)
            ? data.price
            : undefined;
        if (price === undefined) return;
        const inStock = data.inStock !== false;
        const entry: LiveOverlayEntry = { price, inStock };
        const stock = stockByProduct.get(doc.id);
        if (stock !== undefined) entry.stock = stock;
        if (typeof data.name === "string" && data.name.length > 0) {
          entry.name = data.name;
        }
        if (typeof data.description === "string") {
          entry.description = data.description;
        }
        if (Array.isArray(data.features)) {
          entry.features = data.features.filter(
            (f): f is string => typeof f === "string",
          );
        }
        if (typeof data.image === "string" && data.image.length > 0) {
          entry.image = data.image;
        }
        if (typeof data.slug === "string" && data.slug.length > 0) {
          entry.slug = data.slug;
        }
        if (typeof data.size === "string") entry.size = data.size;
        if (typeof data.color === "string") entry.color = data.color;
        if (
          typeof data.sortOrder === "number" &&
          Number.isFinite(data.sortOrder)
        ) {
          entry.sortOrder = data.sortOrder;
        }
        map.set(doc.id, entry);
      });
      cached = map;
      return map;
    } catch {
      const empty: LiveOverlay = new Map();
      cached = empty;
      return empty;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useLiveOverlay(): LiveOverlay {
  const [overlay, setOverlay] = useState<LiveOverlay>(() => cached ?? new Map());

  useEffect(() => {
    let mounted = true;
    void loadOverlay().then((next) => {
      if (mounted) setOverlay(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return overlay;
}

function applyOverlay(
  product: Product,
  live: LiveOverlayEntry | undefined,
): Product {
  if (!live) return product;
  return {
    ...product,
    price: live.price,
    inStock: live.inStock,
    name: live.name ?? product.name,
    description: live.description ?? product.description,
    features: live.features ?? product.features,
    image: live.image ?? product.image,
  };
}

export function useLiveProduct(product: Product): Product {
  const overlay = useLiveOverlay();
  return useMemo(
    () => applyOverlay(product, overlay.get(product.id)),
    [overlay, product],
  );
}

export function useLiveProducts(items: ReadonlyArray<Product>): Product[] {
  const overlay = useLiveOverlay();
  return useMemo(
    () => items.map((product) => applyOverlay(product, overlay.get(product.id))),
    [overlay, items],
  );
}

/**
 * Returns the current stock count for a product, or `undefined` if inventory
 * data hasn't loaded yet or no inventory row exists for this product.
 */
export function useStock(productId: string): number | undefined {
  const overlay = useLiveOverlay();
  return overlay.get(productId)?.stock;
}

/**
 * Returns the full catalog merged from the baked JSON plus any Firestore-only
 * products (added in admin since the last static rebuild). Falls back to the
 * baked list while the Firestore overlay is still loading. Used by the
 * manual sale form so new SKUs appear in the dropdown without waiting for the
 * auto-redeploy workflow to rebuild the storefront.
 */
export function useLiveCatalog(
  baked: ReadonlyArray<Product>,
): Product[] {
  const overlay = useLiveOverlay();
  return useMemo(() => {
    const seen = new Set<string>();
    const result: Product[] = [];
    for (const p of baked) {
      const live = overlay.get(p.id);
      result.push(applyOverlay(p, live));
      seen.add(p.id);
    }
    overlay.forEach((entry, id) => {
      if (seen.has(id)) return;
      // Firestore-only product (admin added it after the last build). Need
      // every Product field; if any is missing we skip rather than render a
      // half-broken row.
      if (
        !entry.slug ||
        !entry.name ||
        entry.size === undefined ||
        entry.color === undefined
      ) {
        return;
      }
      result.push({
        id,
        slug: entry.slug,
        name: entry.name,
        size: entry.size,
        color: entry.color,
        price: entry.price,
        description: entry.description ?? "",
        features: entry.features ?? [],
        image: entry.image ?? "",
        inStock: entry.inStock,
      });
    });
    // Stable order: baked items keep their original order; new items append
    // at the end sorted by sortOrder.
    return result;
  }, [overlay, baked]);
}
