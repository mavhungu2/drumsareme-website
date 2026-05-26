/**
 * One-off cleanup driven by the customer audit run on 2026-05-26.
 *
 *   1. customers/0Zq6KYzGkDH5rgGkehBl (Thabelo Duncan) — email is blank on
 *      the record though order KT-0065 carries it. Backfill.
 *   2. customers/yl0cOmzxrItpmfyC0JQM ("Word of life Jaqueline") — really
 *      Isaac Mpharalala. 7 of 8 orders in this bucket are Isaac with phone
 *      0826092370; only one stray order (KT-20260416-0009) used the church
 *      name. Rename the canonical record. Order snapshots are intentionally
 *      left alone — the historical shipping records are accurate as they
 *      stand.
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node \
 *     src/scripts/applyCustomerAuditFixes.ts
 */
import { db, FieldValue } from "../lib/firestore";

async function applyThabeloFix(): Promise<void> {
  const id = "0Zq6KYzGkDH5rgGkehBl";
  const email = "thabeloduncan@gmail.com";
  await db.doc(`customers/${id}`).set(
    {
      email,
      emailLower: email.toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(`Thabelo Duncan: email backfilled (${email})`);
}

async function applyJaquelineRename(): Promise<void> {
  const id = "yl0cOmzxrItpmfyC0JQM";
  await db.doc(`customers/${id}`).set(
    {
      firstName: "Isaac",
      lastName: "Mpharalala",
      phone: "0826092370",
      phoneDigits: "0826092370",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  console.log(
    "Word of life Jaqueline → Isaac Mpharalala (phone updated to 0826092370). Order snapshots unchanged.",
  );
}

async function main(): Promise<void> {
  await applyThabeloFix();
  await applyJaquelineRename();
  console.log("Done.");
}

main().catch((err) => {
  console.error("apply fixes failed:", err);
  process.exit(1);
});
