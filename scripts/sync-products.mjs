#!/usr/bin/env node
/**
 * Build-time bake: fetches every product from Firestore (public read) that
 * has a matching inventory/{productId} row and writes them to
 * src/lib/products.generated.json so the static export and
 * generateStaticParams have a synchronous source. A product with no
 * inventory row is excluded entirely — with no stock row there is no
 * quantity cap, and checkout lets untracked products through with no limit,
 * so baking it in would allow unlimited overselling. A row with
 * currentStock 0 is still baked; it just shows as sold out, since only
 * existence of the row is checked here.
 *
 * Runs as a prebuild step. The site also overlays live price/inStock from
 * Firestore on hydration so admin edits between builds are reflected.
 *
 * Fails open: if the inventory fetch errors or comes back empty, every
 * product is baked unfiltered rather than risk emptying the shop.
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

/**
 * Mirrors DEFAULT_CATEGORY in src/lib/product-categories.ts. Products written
 * before categories existed are drumsticks — that was the whole catalog. Baked
 * explicitly so the storefront never has to guess, and so a doc that somehow
 * loses the field still renders as it always did.
 */
const DEFAULT_CATEGORY = "drumsticks";

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

  const allProducts = snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        slug: data.slug,
        name: data.name,
        size: data.size,
        color: data.color,
        category:
          typeof data.category === "string" && data.category
            ? data.category
            : DEFAULT_CATEGORY,
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

  // A product only belongs in the shop once it has a stock row. Fetch
  // inventory and use it as a gate: inventoryIds stays null (meaning "don't
  // filter") whenever the fetch fails or comes back empty, so a transient
  // Firestore error can never silently empty the shop.
  let inventoryIds;
  try {
    const inventorySnap = await getDocs(collection(db, "inventory"));
    inventoryIds = new Set(inventorySnap.docs.map((doc) => doc.id));
    if (inventoryIds.size === 0) {
      console.warn(
        "Inventory collection returned 0 documents — baking all products unfiltered.",
      );
      inventoryIds = null;
    }
  } catch (err) {
    console.warn(
      "Failed to fetch inventory — baking all products unfiltered:",
      err,
    );
    inventoryIds = null;
  }

  let products = allProducts;
  if (inventoryIds) {
    products = allProducts.filter((product) => inventoryIds.has(product.id));
    const skipped = allProducts.filter(
      (product) => !inventoryIds.has(product.id),
    );
    if (skipped.length > 0) {
      console.log(
        `Skipped ${skipped.length} product${skipped.length === 1 ? "" : "s"} with no inventory row: ${skipped
          .map((product) => product.id)
          .join(", ")}`,
      );
    }
  }

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
