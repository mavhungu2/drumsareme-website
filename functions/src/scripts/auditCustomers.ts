/**
 * Audit pass over the canonical `customers/{id}` records vs. the snapshots
 * still living on each order. Flags four kinds of finding:
 *
 *   FILLABLE     — customer record has a blank email/phone but at least one
 *                  order snapshot provides a value. Safe to backfill.
 *   IDENTITY_DRIFT — record and order snapshot disagree on a non-blank value
 *                  (different names, different emails, etc.). Needs admin review.
 *   POSSIBLE_BAD_MERGE — orders linked to the same customer have very different
 *                  contact details (probably two different people).
 *   ORPHAN       — order has no customerId (should be zero after the
 *                  normalize-customers migration ran).
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node \
 *     src/scripts/auditCustomers.ts
 */
import { db, type CustomerRecord, type Order } from "../lib/firestore";
import {
  normalizeEmailLower,
  normalizePhoneDigits,
} from "../lib/customers";

interface OrderRow {
  id: string;
  order: Order;
}

interface Finding {
  customerId: string;
  customerName: string;
  kind:
    | "FILLABLE"
    | "IDENTITY_DRIFT"
    | "POSSIBLE_BAD_MERGE"
    | "ORPHAN";
  detail: string;
}

function ts(t: FirebaseFirestore.Timestamp | undefined | null): string {
  return t ? t.toDate().toISOString().slice(0, 16).replace("T", " ") : "—";
}

function describeOrder(row: OrderRow): string {
  const c = row.order.customer;
  return `${row.order.ref} (${row.order.status}, ${ts(row.order.createdAt)}) name="${(c.firstName ?? "") + " " + (c.lastName ?? "")}".trim() email="${c.email ?? ""}" phone="${c.phone ?? ""}"`.replace(
    /"\.trim\(\)/,
    '"',
  );
}

function nameOf(c: { firstName?: string; lastName?: string }): string {
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
}

async function main(): Promise<void> {
  const [customersSnap, ordersSnap] = await Promise.all([
    db.collection("customers").get(),
    db.collection("orders").get(),
  ]);

  const customers = new Map<string, CustomerRecord>();
  customersSnap.forEach((doc) =>
    customers.set(doc.id, doc.data() as CustomerRecord),
  );

  const ordersById = new Map<string, OrderRow[]>();
  const orphans: OrderRow[] = [];
  ordersSnap.forEach((doc) => {
    const order = doc.data() as Order;
    const row: OrderRow = { id: doc.id, order };
    if (!order.customerId) {
      orphans.push(row);
      return;
    }
    const bucket = ordersById.get(order.customerId) ?? [];
    bucket.push(row);
    ordersById.set(order.customerId, bucket);
  });

  // Sort each bucket newest-first so the "latest snapshot" is index 0.
  for (const bucket of ordersById.values()) {
    bucket.sort(
      (a, b) =>
        (b.order.createdAt?.toMillis() ?? 0) -
        (a.order.createdAt?.toMillis() ?? 0),
    );
  }

  const findings: Finding[] = [];

  // ORPHAN check.
  for (const row of orphans) {
    findings.push({
      customerId: "—",
      customerName: nameOf(row.order.customer),
      kind: "ORPHAN",
      detail: describeOrder(row),
    });
  }

  // Per-customer checks.
  for (const [customerId, record] of customers) {
    const bucket = ordersById.get(customerId) ?? [];
    const customerName = nameOf(record);

    // FILLABLE: blank on record, value on at least one order.
    if (!record.email) {
      const withEmail = bucket.find(
        (r) => (r.order.customer.email ?? "").trim().length > 0,
      );
      if (withEmail) {
        findings.push({
          customerId,
          customerName,
          kind: "FILLABLE",
          detail: `record email blank, order ${withEmail.order.ref} has "${withEmail.order.customer.email}"`,
        });
      }
    }
    if (!record.phone) {
      const withPhone = bucket.find(
        (r) => (r.order.customer.phone ?? "").trim().length > 0,
      );
      if (withPhone) {
        findings.push({
          customerId,
          customerName,
          kind: "FILLABLE",
          detail: `record phone blank, order ${withPhone.order.ref} has "${withPhone.order.customer.phone}"`,
        });
      }
    }

    // IDENTITY_DRIFT: record + snapshot disagree on a non-blank value.
    for (const row of bucket) {
      const oc = row.order.customer;
      const snapEmail = (oc.email ?? "").trim();
      const recEmail = (record.email ?? "").trim();
      if (snapEmail && recEmail && snapEmail.toLowerCase() !== recEmail.toLowerCase()) {
        findings.push({
          customerId,
          customerName,
          kind: "IDENTITY_DRIFT",
          detail: `email mismatch: record="${recEmail}" vs ${row.order.ref}="${snapEmail}"`,
        });
      }

      const snapPhoneDigits = normalizePhoneDigits(oc.phone);
      const recPhoneDigits = normalizePhoneDigits(record.phone);
      if (
        snapPhoneDigits &&
        recPhoneDigits &&
        snapPhoneDigits !== recPhoneDigits
      ) {
        findings.push({
          customerId,
          customerName,
          kind: "IDENTITY_DRIFT",
          detail: `phone mismatch: record="${record.phone}" vs ${row.order.ref}="${oc.phone}"`,
        });
      }

      const snapName = nameOf(oc).toLowerCase();
      const recName = customerName.toLowerCase();
      if (snapName && recName && snapName !== recName) {
        findings.push({
          customerId,
          customerName,
          kind: "IDENTITY_DRIFT",
          detail: `name mismatch: record="${customerName}" vs ${row.order.ref}="${nameOf(oc)}"`,
        });
      }
    }

    // POSSIBLE_BAD_MERGE: orders in the bucket disagree on identity among
    // themselves. Heuristic: at least one pair has a non-empty conflicting
    // email OR a non-empty conflicting phone-digits AND a different name.
    if (bucket.length >= 2) {
      const emails = new Set(
        bucket
          .map((r) => (r.order.customer.email ?? "").trim().toLowerCase())
          .filter(Boolean),
      );
      const phones = new Set(
        bucket
          .map((r) => normalizePhoneDigits(r.order.customer.phone))
          .filter(Boolean),
      );
      const names = new Set(
        bucket
          .map((r) => nameOf(r.order.customer).toLowerCase())
          .filter(Boolean),
      );
      if (emails.size > 1 || (phones.size > 1 && names.size > 1)) {
        findings.push({
          customerId,
          customerName,
          kind: "POSSIBLE_BAD_MERGE",
          detail: `bucket has ${emails.size} distinct emails, ${phones.size} distinct phones, ${names.size} distinct names across ${bucket.length} orders`,
        });
      }
    }
  }

  // Report.
  const counts = {
    FILLABLE: 0,
    IDENTITY_DRIFT: 0,
    POSSIBLE_BAD_MERGE: 0,
    ORPHAN: 0,
  };
  for (const f of findings) counts[f.kind] += 1;

  console.log(
    `\nScanned ${customers.size} customers vs ${ordersSnap.size} orders ` +
      `(${orphans.length} orphan).`,
  );
  console.log(
    `Findings: FILLABLE=${counts.FILLABLE}  IDENTITY_DRIFT=${counts.IDENTITY_DRIFT}  POSSIBLE_BAD_MERGE=${counts.POSSIBLE_BAD_MERGE}  ORPHAN=${counts.ORPHAN}\n`,
  );

  const sectionOrder: Array<Finding["kind"]> = [
    "ORPHAN",
    "POSSIBLE_BAD_MERGE",
    "IDENTITY_DRIFT",
    "FILLABLE",
  ];

  for (const kind of sectionOrder) {
    const subset = findings.filter((f) => f.kind === kind);
    if (subset.length === 0) continue;
    console.log(`=== ${kind} (${subset.length}) ===`);
    for (const f of subset) {
      console.log(
        `  [${f.customerId.slice(0, 8)}…] ${f.customerName.padEnd(28)} ${f.detail}`,
      );
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("audit failed:", err);
  process.exit(1);
});
