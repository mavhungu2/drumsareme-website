/**
 * One-off backfill: stamp an explicit `category` on every product that lacks
 * one.
 *
 * The catalog was drumsticks-only, so every product created before categories
 * existed carries no `category` field and the storefront falls back to
 * DEFAULT_PRODUCT_CATEGORY. This writes the value down so the admin form, the
 * baked catalog and any future query read a real category instead of leaning
 * on that fallback.
 *
 * Idempotent: a product that already carries a valid category is left alone,
 * so re-running is a no-op and an admin's later re-categorisation is never
 * stomped. A product carrying an unknown value IS repaired — the storefront
 * treats unknown and missing identically, so there is nothing to preserve.
 *
 * Deliberately does not touch `updatedAt`. This is a mechanical migration, not
 * an edit, and bumping it would wipe the real "last edited" signal off every
 * product in the admin table. The `productsAutoRedeploy` trigger fires on the
 * write itself, so the site still rebuilds either way.
 *
 * Dry run by default — prints the plan and writes nothing. Pass --apply to
 * write.
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node \
 *     src/scripts/backfillProductCategory.ts
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node \
 *     src/scripts/backfillProductCategory.ts --apply
 */
import {
  db,
  DEFAULT_PRODUCT_CATEGORY,
  isProductCategory,
  type CategoryId,
  type Product,
} from "../lib/firestore";

/**
 * Products that are not the historical drumsticks default. Everything else in
 * the catalog predates categories and is drumsticks by definition.
 */
const OVERRIDES: Readonly<Record<string, CategoryId>> = {
  sf2403: "audio-interfaces",
};

/** Firestore caps a WriteBatch at 500 operations. */
const MAX_BATCH_WRITES = 500;

interface Planned {
  id: string;
  /** How the current value is broken: absent entirely, or an unknown string. */
  reason: "missing" | "invalid";
  current: unknown;
  target: CategoryId;
}

const targetFor = (id: string): CategoryId =>
  OVERRIDES[id] ?? DEFAULT_PRODUCT_CATEGORY;

const plural = (n: number) => (n === 1 ? "" : "s");

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const snap = await db.collection("products").get();
  const rows = snap.docs.map((d) => ({ id: d.id, p: d.data() as Product }));

  const planned: Planned[] = [];
  const conflicts: string[] = [];
  let unchanged = 0;

  for (const { id, p } of rows) {
    const target = targetFor(id);
    // Firestore is schemaless, so the declared `CategoryId` on Product is a
    // claim about writes, not a guarantee about reads. Widen before checking.
    const current: unknown = p.category;

    if (isProductCategory(current)) {
      unchanged += 1;
      // Already categorised, so out of scope for a backfill — but if it
      // disagrees with what this script would have set, only a human can tell
      // whether that was a deliberate admin change or a mistake.
      if (current !== target) {
        conflicts.push(`${id}: is "${current}", this script would set "${target}"`);
      }
      continue;
    }

    planned.push({
      id,
      reason: current === undefined ? "missing" : "invalid",
      current,
      target,
    });
  }

  const absentOverrides = Object.keys(OVERRIDES).filter(
    (id) => !rows.some((r) => r.id === id),
  );

  console.log(
    `Scanned ${rows.length} product${plural(rows.length)} — ` +
      `${planned.length} to update, ${unchanged} already categorised.\n`,
  );

  if (planned.length > 0) {
    console.log(`=== PLANNED (${planned.length}) ===`);
    for (const row of planned) {
      const from =
        row.reason === "missing" ? "(none)" : `${JSON.stringify(row.current)}!`;
      console.log(`  ${row.id.padEnd(22)} ${from.padEnd(14)} → ${row.target}`);
    }
    console.log("\n  (! = present but not a known category — being repaired)\n");
  }

  if (conflicts.length > 0) {
    console.log(`=== ALREADY SET, BUT DISAGREES (${conflicts.length}) ===`);
    for (const line of conflicts) console.log(`  ${line}`);
    console.log("\n  Left untouched — change it in the admin UI if wrong.\n");
  }

  if (absentOverrides.length > 0) {
    console.log(
      `WARNING: override${plural(absentOverrides.length)} for ` +
        `${absentOverrides.join(", ")} matched no product — check the id.\n`,
    );
  }

  if (planned.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (!apply) {
    console.log("Dry run — nothing written. Re-run with --apply to write.");
    return;
  }

  if (planned.length > MAX_BATCH_WRITES) {
    throw new Error(
      `${planned.length} updates exceeds the ${MAX_BATCH_WRITES}-write batch ` +
        "limit — chunk the commit before re-running.",
    );
  }

  const batch = db.batch();
  for (const row of planned) {
    batch.update(db.collection("products").doc(row.id), {
      category: row.target,
    });
  }
  await batch.commit();

  console.log(`Applied ${planned.length} update${plural(planned.length)}.`);
  console.log(
    "Each write fires productsAutoRedeploy; the products-redeploy workflow " +
      "concurrency group collapses the burst into a rebuild.",
  );
}

main().catch((err) => {
  console.error("backfill failed:", err);
  process.exit(1);
});
