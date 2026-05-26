/**
 * One-off inspection: dumps the merged customers from the normalizeCustomers
 * migration plus every order linked to them, so the admin can confirm whether
 * the merges are correct or need to be split back out.
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node \
 *     src/scripts/inspectMergedCustomers.ts
 */
import { db, type CustomerRecord, type Order } from "../lib/firestore";

const TARGET_IDS = [
  // shammah customer — also matched by phone:0742793957
  "ssjwnETkfLgi55gzhDRf",
  // phone-only customer (0658885648) — also matched email:thabeloduncan@gmail.com
  "0Zq6KYzGkDH5rgGkehBl",
];

function ts(t: FirebaseFirestore.Timestamp | undefined | null): string {
  return t ? t.toDate().toISOString().replace("T", " ").slice(0, 16) : "—";
}

async function main(): Promise<void> {
  for (const id of TARGET_IDS) {
    const snap = await db.doc(`customers/${id}`).get();
    if (!snap.exists) {
      console.log(`\n[${id}] NOT FOUND`);
      continue;
    }
    const c = snap.data() as CustomerRecord;
    console.log(`\n=== customers/${id} ===`);
    console.log(`  name:         ${c.firstName} ${c.lastName}`.trimEnd());
    console.log(`  email:        ${c.email || "—"}`);
    console.log(`  emailLower:   ${c.emailLower || "—"}`);
    console.log(`  phone:        ${c.phone || "—"}`);
    console.log(`  phoneDigits:  ${c.phoneDigits || "—"}`);
    console.log(`  createdAt:    ${ts(c.createdAt)}`);

    const ordersSnap = await db
      .collection("orders")
      .where("customerId", "==", id)
      .get();
    console.log(`  orders:       ${ordersSnap.size}`);

    const rows = ordersSnap.docs
      .map((doc) => ({ id: doc.id, order: doc.data() as Order }))
      .sort(
        (a, b) =>
          (a.order.createdAt?.toMillis() ?? 0) -
          (b.order.createdAt?.toMillis() ?? 0),
      );

    for (const { id: orderId, order } of rows) {
      const name =
        `${order.customer.firstName ?? ""} ${order.customer.lastName ?? ""}`.trim() ||
        "—";
      console.log(
        `    ${order.ref.padEnd(8)} ${ts(order.createdAt)}  status=${order.status.padEnd(9)}  R${(order.total ?? 0).toString().padStart(5)}  ${name.padEnd(26)} ${order.customer.email || "—"} / ${order.customer.phone || "—"}`,
      );
      console.log(`             orderId=${orderId}`);
    }
  }
}

main().catch((err) => {
  console.error("inspect failed:", err);
  process.exit(1);
});
