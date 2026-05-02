#!/usr/bin/env node
/**
 * Build-time bake: fetches every product from Firestore (public read) and
 * writes them to src/lib/products.generated.json so the static export and
 * generateStaticParams have a synchronous source.
 *
 * Runs as a prebuild step. The site also overlays live price/inStock from
 * Firestore on hydration so admin edits between builds are reflected.
 *
 * Usage: node scripts/sync-products.mjs
 */
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDjtz_1ngepcvqphxtWzAtd0mLmCwlwXc0",
  authDomain: "drumsareme-website.firebaseapp.com",
  projectId: "drumsareme-website",
  storageBucket: "drumsareme-website.firebasestorage.app",
  messagingSenderId: "77814675159",
  appId: "1:77814675159:web:33eff6a7e98e596a4fe292",
};

async function main() {
  const outPath = resolve(__dirname, "..", "src", "lib", "products.generated.json");

  const app = initializeApp(FIREBASE_CONFIG);
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, "products"));

  const products = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        slug: data.slug,
        name: data.name,
        size: data.size,
        color: data.color,
        price: data.price,
        description: data.description,
        features: Array.isArray(data.features) ? data.features : [],
        image: data.image,
        inStock: data.inStock !== false,
        sortOrder:
          typeof data.sortOrder === "number" ? data.sortOrder : 999,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Defensive: never wipe the existing catalog if the fetch returned nothing.
  // A 0-product write would empty generateStaticParams and break the build.
  if (products.length === 0) {
    const { existsSync } = await import("node:fs");
    if (existsSync(outPath)) {
      console.warn(
        "Firestore returned 0 products — keeping existing products.generated.json untouched.",
      );
      return;
    }
    throw new Error(
      "Firestore returned 0 products and no existing JSON to preserve.",
    );
  }

  await writeFile(outPath, JSON.stringify(products, null, 2) + "\n", "utf8");
  console.log(`Wrote ${products.length} products to ${outPath}`);
}

main().catch((err) => {
  console.error("sync-products failed:", err);
  process.exit(1);
});
