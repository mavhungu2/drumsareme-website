/**
 * One-off cleanup: deletes every order with status="pending" from Firestore.
 * Pending orders are excluded from analytics; this purges the historical
 * abandoned-checkout backlog so they stop appearing on the orders list.
 *
 * Run from functions/:
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node src/scripts/deletePendingOrders.ts
 */
import { db, type Order } from "../lib/firestore";

async function main() {
  const snap = await db
    .collection("orders")
    .where("status", "==", "pending")
    .get();

  if (snap.empty) {
    console.log("No pending orders found.");
    return;
  }

  console.log(`Found ${snap.size} pending orders. Deleting…`);
  const batchSize = 400;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    const slice = snap.docs.slice(i, i + batchSize);
    for (const doc of slice) {
      const order = doc.data() as Order;
      console.log(`  ${doc.id} ref=${order.ref ?? "—"}`);
      batch.delete(doc.ref);
    }
    await batch.commit();
    deleted += slice.length;
  }
  console.log(`Deleted ${deleted} pending order(s).`);
}

main().catch((err) => {
  console.error("Delete failed:", err);
  process.exit(1);
});
