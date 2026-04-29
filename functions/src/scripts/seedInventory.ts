/**
 * One-off seed: writes 17 inventory rows from the legacy Excel workbook
 * (DRUMSAREME_Business_Workbook_Enhanced.xlsx) so reorder alerts and current
 * stock are correct on day one.
 *
 * Run from the functions/ directory:
 *   npx ts-node src/scripts/seedInventory.ts
 *
 * Targets the live project by default. To run against the emulator, export:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=rois-movers ...
 */
import { db, FieldValue, type InventoryItem } from "../lib/firestore";
import { getServerProduct } from "../lib/products";

interface SeedRow {
  productId: string;
  openingStock: number;
  unitsSold: number;
  reorderLevel: number;
}

const SEED_ROWS: SeedRow[] = [
  { productId: "5a-natural", openingStock: 48, unitsSold: 3, reorderLevel: 5 },
  { productId: "ex5a-natural", openingStock: 39, unitsSold: 6, reorderLevel: 5 },
  { productId: "ex5b-natural", openingStock: 19, unitsSold: 0, reorderLevel: 5 },
  { productId: "5b-natural", openingStock: 16, unitsSold: 1, reorderLevel: 5 },
  { productId: "5a-red", openingStock: 15, unitsSold: 2, reorderLevel: 5 },
  { productId: "5a-green", openingStock: 14, unitsSold: 2, reorderLevel: 5 },
  { productId: "5a-yellow", openingStock: 13, unitsSold: 2, reorderLevel: 5 },
  { productId: "5b-black", openingStock: 13, unitsSold: 1, reorderLevel: 5 },
  { productId: "5a-blue", openingStock: 12, unitsSold: 0, reorderLevel: 5 },
  { productId: "ex5a-black", openingStock: 8, unitsSold: 0, reorderLevel: 5 },
  { productId: "5a-silver-blade", openingStock: 8, unitsSold: 0, reorderLevel: 5 },
  { productId: "7a-green", openingStock: 8, unitsSold: 0, reorderLevel: 5 },
  { productId: "7a-red", openingStock: 7, unitsSold: 0, reorderLevel: 5 },
  { productId: "7a-blue", openingStock: 5, unitsSold: 0, reorderLevel: 5 },
  { productId: "5a-pink", openingStock: 3, unitsSold: 0, reorderLevel: 5 },
  { productId: "7a-natural", openingStock: 3, unitsSold: 0, reorderLevel: 5 },
  { productId: "5a-black", openingStock: 0, unitsSold: 0, reorderLevel: 5 },
];

const SUPPLIER = "Keep Time";

async function main() {
  console.log(`Seeding ${SEED_ROWS.length} inventory rows…`);
  for (const row of SEED_ROWS) {
    const product = getServerProduct(row.productId);
    if (!product) {
      console.error(`SKIP ${row.productId}: not in catalog`);
      continue;
    }
    const currentStock = Math.max(0, row.openingStock - row.unitsSold);
    const data: Omit<InventoryItem, "updatedAt"> & {
      updatedAt: FirebaseFirestore.FieldValue;
    } = {
      productId: row.productId,
      name: product.name,
      openingStock: row.openingStock,
      unitsSold: row.unitsSold,
      currentStock,
      reorderLevel: row.reorderLevel,
      supplier: SUPPLIER,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.collection("inventory").doc(row.productId).set(data, { merge: true });
    console.log(
      `  ${row.productId.padEnd(18)} opening=${row.openingStock.toString().padStart(3)} sold=${row.unitsSold.toString().padStart(3)} stock=${currentStock.toString().padStart(3)}`,
    );
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
