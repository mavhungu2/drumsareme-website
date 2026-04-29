"use client";

import { useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { FIREBASE_WEB_APP_CONFIG } from "./firebase-web-app-config";
import type { Product } from "./products";

interface LiveOverlayEntry {
  price: number;
  inStock: boolean;
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
      const snap = await getDocs(collection(db, "products"));
      const map = new Map<string, LiveOverlayEntry>();
      snap.forEach((doc) => {
        const data = doc.data() as { price?: unknown; inStock?: unknown };
        const price =
          typeof data.price === "number" && Number.isFinite(data.price)
            ? data.price
            : undefined;
        const inStock = data.inStock !== false;
        if (price !== undefined) map.set(doc.id, { price, inStock });
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

export function useLiveProduct(product: Product): Product {
  const overlay = useLiveOverlay();
  return useMemo(() => {
    const live = overlay.get(product.id);
    if (!live) return product;
    if (live.price === product.price && live.inStock === product.inStock) {
      return product;
    }
    return { ...product, price: live.price, inStock: live.inStock };
  }, [overlay, product]);
}

export function useLiveProducts(items: ReadonlyArray<Product>): Product[] {
  const overlay = useLiveOverlay();
  return useMemo(
    () =>
      items.map((product) => {
        const live = overlay.get(product.id);
        if (!live) return product;
        if (live.price === product.price && live.inStock === product.inStock) {
          return product;
        }
        return { ...product, price: live.price, inStock: live.inStock };
      }),
    [overlay, items],
  );
}
