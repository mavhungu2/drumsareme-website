/**
 * One-off import: backfills the 11 historical sales from the Excel
 * workbook (DRS0001–DRS0011) as manual orders so the admin dashboard,
 * customers page, and reports reflect them.
 *
 * Important: inventory was seeded with the post-sale unitsSold values
 * from the same workbook, so this script intentionally does NOT touch
 * inventory. Otherwise we'd double-decrement.
 *
 * Three rows reference SKUs not in the catalog (5a-red, 5a-green —
 * skipped per prior decision). Those are reported and not imported.
 *
 * Run from functions/:
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node src/scripts/importHistoricalSales.ts
 */
import {
  db,
  FieldValue,
  Timestamp,
  type Customer,
  type ManualPaymentMethod,
  type OrderItem,
} from "../lib/firestore";
import { getServerProduct } from "../lib/products";

interface SourceRow {
  ref: string;
  customer: string;
  phone?: string;
  productId: string;
  qty: number;
  paymentMethod: ManualPaymentMethod;
  deliveryFee: number;
}

const SALE_DATE = new Date("2026-04-25T12:00:00Z");

const ROWS: SourceRow[] = [
  { ref: "DRS0001", customer: "Rotondwa Nengudza", phone: "674909450", productId: "5a-green", qty: 1, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0002", customer: "Answer Matodzi", phone: "714201630", productId: "5a-natural", qty: 1, paymentMethod: "card", deliveryFee: 0 },
  { ref: "DRS0003", customer: "Answer Matodzi", phone: "714201630", productId: "ex5a-natural", qty: 1, paymentMethod: "card", deliveryFee: 0 },
  { ref: "DRS0004", customer: "Kundi", productId: "5a-yellow", qty: 1, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0005", customer: "JB", productId: "ex5a-natural", qty: 5, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0006", customer: "Dakalo Junior", productId: "5b-natural", qty: 1, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0007", customer: "Dakalo Junior", productId: "5b-black", qty: 1, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0008", customer: "Gift", productId: "5a-natural", qty: 2, paymentMethod: "eft", deliveryFee: 110 },
  { ref: "DRS0009", customer: "Gift", productId: "5a-yellow", qty: 1, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0010", customer: "Gift", productId: "5a-red", qty: 2, paymentMethod: "eft", deliveryFee: 0 },
  { ref: "DRS0011", customer: "Gift", productId: "5a-green", qty: 1, paymentMethod: "eft", deliveryFee: 0 },
];

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "—" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function main() {
  const saleTs = Timestamp.fromDate(SALE_DATE);
  let imported = 0;
  let skipped = 0;
  let alreadyExists = 0;

  for (const row of ROWS) {
    const product = await getServerProduct(row.productId);
    if (!product) {
      console.warn(
        `  ${row.ref} SKIP — productId '${row.productId}' not in catalog`,
      );
      skipped += 1;
      continue;
    }

    const lineTotal = product.price * row.qty;
    const subtotal = lineTotal;
    const total = subtotal + row.deliveryFee;

    const items: OrderItem[] = [
      {
        productId: product.id,
        name: product.name,
        qty: row.qty,
        unitPrice: product.price,
        lineTotal,
      },
    ];

    const { firstName, lastName } = splitName(row.customer);
    const customer: Customer = {
      firstName,
      lastName,
      email: "",
      phone: row.phone ?? "",
      addressLine1: "",
      city: "",
      province: "",
      postalCode: "",
      notes: "Backfilled from Excel workbook",
    };

    // Use the workbook ref as the doc id for traceability and idempotency.
    // Re-running the script will skip rows that were already imported.
    const docRef = db.collection("orders").doc(row.ref);
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`  ${row.ref} already imported — skipping`);
      alreadyExists += 1;
      continue;
    }

    await docRef.set({
      ref: row.ref,
      status: "paid",
      source: "manual",
      manualPaymentMethod: row.paymentMethod,
      // inventoryApplied: false because the seeded inventory's unitsSold
      // already reflects these sales. If admin later cancels one of these
      // orders, inventory will NOT be credited back — that's correct
      // because the original stock numbers already account for it.
      inventoryApplied: false,
      items,
      subtotal,
      shipping: row.deliveryFee,
      total,
      customer,
      yoco: { checkoutId: "" },
      createdAt: saleTs,
      paidAt: saleTs,
    });

    console.log(
      `  ${row.ref} ${row.customer.padEnd(20)} ${product.name.padEnd(28)} qty=${row.qty} total=R${total}`,
    );
    imported += 1;
    void FieldValue;
  }

  console.log(
    `\nDone. imported=${imported} skipped=${skipped} alreadyExists=${alreadyExists}`,
  );
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
