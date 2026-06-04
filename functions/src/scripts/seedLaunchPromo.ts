/**
 * Seeds the launch promo code. Idempotent — re-running just refreshes
 * `updatedAt`. Edit / disable / delete from the admin Promo codes page after
 * launch.
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node \
 *     src/scripts/seedLaunchPromo.ts
 */
import { db, FieldValue, Timestamp, type PromoCode } from "../lib/firestore";

const CODE = "LAUNCH15";

async function main(): Promise<void> {
  const ref = db.doc(`promoCodes/${CODE}`);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.update({ updatedAt: FieldValue.serverTimestamp() });
    console.log(`${CODE} already exists — touched updatedAt.`);
    return;
  }
  // Default window: starts now, runs for 30 days. Adjust in the admin UI
  // after seeding if a different window is wanted.
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const data: Omit<PromoCode, "createdAt" | "updatedAt"> & {
    createdAt: FirebaseFirestore.FieldValue;
    updatedAt: FirebaseFirestore.FieldValue;
  } = {
    code: CODE,
    kind: "percent",
    value: 15,
    active: true,
    expiresAt: Timestamp.fromDate(expires),
    redemptionCount: 0,
    firstOrderOnly: true,
    notes: "Launch special — 15% off your first order. 30-day window.",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  console.log(
    `Created ${CODE}: 15% off, first-time customers only, expires ${expires.toISOString().slice(0, 10)}.`,
  );
}

main().catch((err) => {
  console.error("seed failed:", err);
  process.exit(1);
});
