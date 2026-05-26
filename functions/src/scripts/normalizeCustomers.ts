/**
 * One-off migration: promotes the denormalized `order.customer` snapshots
 * into a first-class `customers/{customerId}` collection.
 *
 * Run from the functions/ directory:
 *   npx ts-node src/scripts/normalizeCustomers.ts
 *
 * Strategy:
 *   1. Read every order.
 *   2. Group orders by the same email|phone|name aggregation key analytics
 *      already uses (so the grouping matches what's been shown in the UI).
 *   3. For each group, either reuse an existing customers/{id} doc (if any
 *      order in the group already has a customerId, or the group's email/phone
 *      matches an existing customer record) or create a new one seeded from
 *      the most recent order's snapshot.
 *   4. Backfill `order.customerId` on every order in the group.
 *
 * Idempotent: re-running on already-migrated data is a no-op aside from a
 * defaultAddress refresh.
 */
import { db, FieldValue, type Order } from "../lib/firestore";
import {
  buildDefaultAddress,
  normalizeEmailLower,
  normalizePhoneDigits,
} from "../lib/customers";

interface OrderRow {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  order: Order;
}

function groupKey(order: Order): string {
  const email = (order.customer.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = (order.customer.phone ?? "").replace(/\s+/g, "");
  if (phone) return `phone:${phone}`;
  const name = `${order.customer.firstName ?? ""}${order.customer.lastName ?? ""}`.toLowerCase();
  return `name:${name}`;
}

function orderTimestamp(order: Order): number {
  return order.createdAt ? order.createdAt.toMillis() : 0;
}

async function loadOrders(): Promise<OrderRow[]> {
  const snap = await db.collection("orders").get();
  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    order: doc.data() as Order,
  }));
}

async function findExistingCustomerId(
  emailLower: string,
  phoneDigits: string,
): Promise<string | undefined> {
  if (emailLower) {
    const snap = await db
      .collection("customers")
      .where("emailLower", "==", emailLower)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  }
  if (phoneDigits) {
    const snap = await db
      .collection("customers")
      .where("phoneDigits", "==", phoneDigits)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  }
  return undefined;
}

interface MigrationStats {
  groups: number;
  customersCreated: number;
  customersReused: number;
  ordersBackfilled: number;
  ordersAlreadyLinked: number;
}

async function main(): Promise<void> {
  console.log("Loading orders…");
  const rows = await loadOrders();
  console.log(`  ${rows.length} orders total`);

  const groups = new Map<string, OrderRow[]>();
  for (const row of rows) {
    const key = groupKey(row.order);
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  console.log(`  ${groups.size} customer groups`);

  const stats: MigrationStats = {
    groups: groups.size,
    customersCreated: 0,
    customersReused: 0,
    ordersBackfilled: 0,
    ordersAlreadyLinked: 0,
  };

  for (const [key, bucket] of groups) {
    bucket.sort((a, b) => orderTimestamp(b.order) - orderTimestamp(a.order));
    const latest = bucket[0];
    const snapshot = latest.order.customer;
    const emailLower = normalizeEmailLower(snapshot.email);
    const phoneDigits = normalizePhoneDigits(snapshot.phone);

    // Resolve customerId: prefer one already set on any order in the bucket,
    // otherwise look up by email/phone, otherwise create new.
    let customerId =
      bucket.find((r) => r.order.customerId)?.order.customerId ?? undefined;

    if (!customerId) {
      customerId = await findExistingCustomerId(emailLower, phoneDigits);
      if (customerId) {
        stats.customersReused += 1;
      } else {
        const ref = db.collection("customers").doc();
        customerId = ref.id;
        const address = buildDefaultAddress({
          firstName: snapshot.firstName,
          lastName: snapshot.lastName,
          phone: snapshot.phone,
          addressLine1: snapshot.addressLine1,
          suburb: snapshot.suburb,
          city: snapshot.city,
          province: snapshot.province,
          postalCode: snapshot.postalCode,
        });
        const newRecord: Record<string, unknown> = {
          firstName: snapshot.firstName ?? "",
          lastName: snapshot.lastName ?? "",
          email: snapshot.email ?? "",
          emailLower,
          phone: snapshot.phone ?? "",
          phoneDigits,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (address) newRecord.defaultAddress = address;
        await ref.set(newRecord);
        stats.customersCreated += 1;
      }
    } else {
      stats.customersReused += 1;
    }

    // Backfill customerId on every order in the bucket that doesn't already
    // have it. Batches kept under Firestore's 500-write limit.
    const needsBackfill = bucket.filter((r) => !r.order.customerId);
    stats.ordersAlreadyLinked += bucket.length - needsBackfill.length;
    for (let i = 0; i < needsBackfill.length; i += 400) {
      const slice = needsBackfill.slice(i, i + 400);
      const batch = db.batch();
      for (const row of slice) {
        batch.update(row.ref, { customerId });
      }
      await batch.commit();
      stats.ordersBackfilled += slice.length;
    }

    console.log(
      `  ${key.padEnd(60)} → ${customerId} (${bucket.length} orders, ${needsBackfill.length} backfilled)`,
    );
  }

  console.log("\nMigration complete.");
  console.log(`  groups:               ${stats.groups}`);
  console.log(`  customers created:    ${stats.customersCreated}`);
  console.log(`  customers reused:     ${stats.customersReused}`);
  console.log(`  orders backfilled:    ${stats.ordersBackfilled}`);
  console.log(`  orders already linked:${stats.ordersAlreadyLinked}`);
}

main().catch((err) => {
  console.error("normalizeCustomers failed:", err);
  process.exit(1);
});
