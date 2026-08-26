/**
 * Audit the live `products` collection — aimed at catching problems in
 * products created by hand (admin UI or direct Firestore writes) that bypass
 * some of the API's validation.
 *
 *   GCLOUD_PROJECT=drumsareme-website npx ts-node src/scripts/auditProducts.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db, type InventoryItem, type Product } from "../lib/firestore";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const PUBLIC_DIR = resolve(REPO_ROOT, "public");
const BAKED_JSON = resolve(REPO_ROOT, "src", "lib", "products.generated.json");

type Severity = "BLOCKER" | "WARN" | "INFO";

interface Finding {
  severity: Severity;
  id: string;
  issue: string;
}

const findings: Finding[] = [];
const add = (severity: Severity, id: string, issue: string) =>
  findings.push({ severity, id, issue });

function isMissing(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && !v.trim());
}

async function imageReachable(image: string): Promise<string | null> {
  if (image.startsWith("/")) {
    return existsSync(resolve(PUBLIC_DIR, image.replace(/^\//, "")))
      ? null
      : `image file not found in public/ → ${image}`;
  }
  if (/^https?:\/\//.test(image)) {
    try {
      const res = await fetch(image, { method: "HEAD" });
      return res.ok ? null : `image URL returned ${res.status} → ${image}`;
    } catch (err) {
      return `image URL unreachable (${String(err)}) → ${image}`;
    }
  }
  return `image is neither an absolute path nor an http(s) URL → "${image}"`;
}

async function main(): Promise<void> {
  const [productsSnap, inventorySnap] = await Promise.all([
    db.collection("products").get(),
    db.collection("inventory").get(),
  ]);

  const inventory = new Map<string, InventoryItem>();
  inventorySnap.forEach((d) => inventory.set(d.id, d.data() as InventoryItem));

  const baked: string[] = existsSync(BAKED_JSON)
    ? (JSON.parse(readFileSync(BAKED_JSON, "utf8")) as Array<{ id: string }>).map(
        (p) => p.id,
      )
    : [];
  const bakedSet = new Set(baked);

  const rows = productsSnap.docs.map((d) => ({
    id: d.id,
    p: d.data() as Product,
  }));

  console.log(
    `Auditing ${rows.length} Firestore products ` +
      `(${baked.length} baked into the deployed site)\n`,
  );

  const slugSeen = new Map<string, string[]>();
  const nameSeen = new Map<string, string[]>();
  const sortSeen = new Map<number, string[]>();
  const sizeVariants = new Map<string, Set<string>>();
  const colorVariants = new Map<string, Set<string>>();

  for (const { id, p } of rows) {
    // --- required fields ---
    for (const field of [
      "slug",
      "name",
      "size",
      "color",
      "description",
      "image",
    ] as const) {
      if (isMissing(p[field])) add("BLOCKER", id, `missing/empty ${field}`);
    }
    if (typeof p.price !== "number" || !Number.isFinite(p.price)) {
      add("BLOCKER", id, `price is not a number (${JSON.stringify(p.price)})`);
    } else if (p.price <= 0) {
      add("BLOCKER", id, `price is ${p.price}`);
    } else if (Math.round(p.price * 100) / 100 !== p.price) {
      add("WARN", id, `price has sub-cent precision (${p.price})`);
    }
    if (typeof p.inStock !== "boolean") {
      add(
        "WARN",
        id,
        `inStock is ${JSON.stringify(p.inStock)} — code treats anything !== false as in stock`,
      );
    }
    if (typeof p.sortOrder !== "number" || !Number.isInteger(p.sortOrder)) {
      add(
        "WARN",
        id,
        `sortOrder is ${JSON.stringify(p.sortOrder)} — ordering will be unstable`,
      );
    }
    if (!Array.isArray(p.features)) {
      add("WARN", id, "features is not an array");
    } else if (p.features.length === 0) {
      add("INFO", id, "no feature bullets — product page will look thin");
    }
    if (!p.updatedAt) add("INFO", id, "no updatedAt timestamp");

    // --- slug integrity (code assumes slug === doc id) ---
    if (typeof p.slug === "string" && p.slug) {
      if (p.slug !== id) {
        add(
          "BLOCKER",
          id,
          `slug "${p.slug}" !== doc id — product page URL and lookups will not match`,
        );
      }
      if (!SLUG_PATTERN.test(p.slug)) {
        add("BLOCKER", id, `slug "${p.slug}" is not lowercase-hyphenated`);
      }
      slugSeen.set(p.slug, [...(slugSeen.get(p.slug) ?? []), id]);
    }
    if (typeof p.name === "string" && p.name.trim()) {
      const key = p.name.trim().toLowerCase();
      nameSeen.set(key, [...(nameSeen.get(key) ?? []), id]);
      if (p.name !== p.name.trim()) {
        add("WARN", id, `name has leading/trailing whitespace: "${p.name}"`);
      }
    }
    if (typeof p.sortOrder === "number") {
      sortSeen.set(p.sortOrder, [...(sortSeen.get(p.sortOrder) ?? []), id]);
    }

    // --- filter-pill consistency (sizes/colors are derived from the catalog) ---
    if (typeof p.size === "string" && p.size) {
      const k = p.size.trim().toLowerCase();
      sizeVariants.set(k, (sizeVariants.get(k) ?? new Set()).add(p.size));
    }
    if (typeof p.color === "string" && p.color) {
      const k = p.color.trim().toLowerCase();
      colorVariants.set(k, (colorVariants.get(k) ?? new Set()).add(p.color));
    }

    // --- inventory ---
    const inv = inventory.get(id);
    if (!inv) {
      add(
        "BLOCKER",
        id,
        "no inventory row — stock is untracked, so checkout will NOT block overselling",
      );
    } else {
      const derived = Math.max(
        0,
        (inv.openingStock ?? 0) - (inv.unitsSold ?? 0),
      );
      if (inv.currentStock !== derived) {
        add(
          "WARN",
          id,
          `inventory currentStock ${inv.currentStock} != openingStock ${inv.openingStock} - unitsSold ${inv.unitsSold} (${derived})`,
        );
      }
      if (p.inStock !== false && derived <= 0) {
        add("INFO", id, "listed in catalog but 0 in stock (shows Sold out)");
      }
    }

    // --- image ---
    if (typeof p.image === "string" && p.image.trim()) {
      const problem = await imageReachable(p.image.trim());
      if (problem) add("BLOCKER", id, problem);
    }

    // --- deployed visibility ---
    if (!bakedSet.has(id)) {
      add(
        "BLOCKER",
        id,
        "NOT in the deployed catalog — no /products/<slug> page exists and it is absent from the shop listing until the site is rebuilt",
      );
    }
  }

  // --- cross-product checks ---
  slugSeen.forEach((ids, slug) => {
    if (ids.length > 1) {
      add("BLOCKER", ids.join(", "), `duplicate slug "${slug}"`);
    }
  });
  nameSeen.forEach((ids, name) => {
    if (ids.length > 1) {
      add("WARN", ids.join(", "), `duplicate product name "${name}"`);
    }
  });
  sortSeen.forEach((ids, order) => {
    if (ids.length > 1) {
      add("INFO", ids.join(", "), `share sortOrder ${order} — order is arbitrary between them`);
    }
  });
  sizeVariants.forEach((variants, key) => {
    if (variants.size > 1) {
      add(
        "WARN",
        "(catalog)",
        `size "${key}" written ${variants.size} ways: ${[...variants].map((v) => JSON.stringify(v)).join(", ")} — creates duplicate filter pills`,
      );
    }
  });
  colorVariants.forEach((variants, key) => {
    if (variants.size > 1) {
      add(
        "WARN",
        "(catalog)",
        `colour "${key}" written ${variants.size} ways: ${[...variants].map((v) => JSON.stringify(v)).join(", ")} — creates duplicate filter pills`,
      );
    }
  });

  // Baked-but-deleted products.
  for (const id of baked) {
    if (!rows.some((r) => r.id === id)) {
      add(
        "WARN",
        id,
        "in the deployed catalog but no longer in Firestore — its page is still live and will 404 on data lookups",
      );
    }
  }

  // --- report ---
  const order: Severity[] = ["BLOCKER", "WARN", "INFO"];
  const counts = { BLOCKER: 0, WARN: 0, INFO: 0 };
  findings.forEach((f) => (counts[f.severity] += 1));
  console.log(
    `Findings: ${counts.BLOCKER} blocker, ${counts.WARN} warn, ${counts.INFO} info\n`,
  );
  for (const sev of order) {
    const subset = findings.filter((f) => f.severity === sev);
    if (!subset.length) continue;
    console.log(`=== ${sev} (${subset.length}) ===`);
    for (const f of subset) console.log(`  [${f.id}] ${f.issue}`);
    console.log();
  }

  console.log("=== CATALOG SNAPSHOT ===");
  const sorted = [...rows].sort(
    (a, b) => (a.p.sortOrder ?? 999) - (b.p.sortOrder ?? 999),
  );
  for (const { id, p } of sorted) {
    const inv = inventory.get(id);
    const stock = inv
      ? String(Math.max(0, (inv.openingStock ?? 0) - (inv.unitsSold ?? 0)))
      : "—";
    console.log(
      `  ${bakedSet.has(id) ? " " : "*"} ${id.padEnd(20)} ${String(p.sortOrder ?? "?").padStart(3)}  R${String(p.price ?? "?").padStart(6)}  stock=${stock.padStart(3)}  ${p.inStock === false ? "HIDDEN " : "visible"}  ${p.size ?? "?"}/${p.color ?? "?"}`,
    );
  }
  console.log("\n  (* = not in the deployed catalog)");
}

main().catch((err) => {
  console.error("audit failed:", err);
  process.exit(1);
});
