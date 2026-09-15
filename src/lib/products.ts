/**
 * Customer-facing product catalog.
 *
 * The data lives in Firestore (`products/{id}`) so admins can manage it at
 * runtime. At build time, `scripts/sync-products.mjs` fetches every product
 * and bakes them into `products.generated.json`, which is imported here so
 * server components and `generateStaticParams` have a synchronous source.
 *
 * For live freshness between builds, the customer-facing pages overlay the
 * latest `price` and `inStock` values via `useLiveProduct` (see
 * `src/lib/use-live-product.ts`).
 */
import generated from "./products.generated.json";
import { categoryOf, type CategoryId, type SpecField } from "./product-categories";

export interface Product {
  id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  /**
   * Category id driving presentation — see `./product-categories`. Typed as a
   * plain string, not `CategoryId`: this value comes from Firestore via the
   * baked JSON, so it can be absent (docs predating categories) or unknown (a
   * hand-written doc). `categoryOf()` normalizes both to `DEFAULT_CATEGORY`.
   */
  category?: string;
  price: number;
  description: string;
  features: string[];
  image: string;
  inStock: boolean;
}

interface GeneratedProduct extends Product {
  sortOrder: number;
}

const generatedTyped = generated as ReadonlyArray<GeneratedProduct>;

export const products: ReadonlyArray<Product> = generatedTyped.map((p) => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  size: p.size,
  color: p.color,
  category: p.category,
  price: p.price,
  description: p.description,
  features: p.features,
  image: p.image,
  inStock: p.inStock,
}));

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}



function uniqueOrdered<T>(values: ReadonlyArray<T>): T[] {
  return Array.from(new Set(values));
}

const specValueCache = new Map<string, string[]>();

/**
 * Distinct values of `field` among the products in `categoryId`, in catalog
 * order — the source for the listing page's filter pills.
 *
 * Derived from the live catalog, so a brand-new size or colour (e.g. a Purple
 * variant) gets a filter pill with no code change. Order follows insertion
 * order in `products.generated.json` (which honours `sortOrder` from
 * Firestore), keeping related sizes/colours grouped naturally.
 *
 * Scoped by category so drumstick sizes never leak into a listing of audio
 * gear. Which fields are worth offering at all is the category's call —
 * see `filters` in `./product-categories`.
 *
 * Memoized: the catalog is baked at build time and never mutates, so repeated
 * calls return the same array, preserving the stable identity the module-level
 * `sizes`/`colors` constants used to give React.
 */
export function specValues(field: SpecField, categoryId: CategoryId): string[] {
  const key = `${categoryId}:${field}`;
  const cached = specValueCache.get(key);
  if (cached) return cached;
  const values = uniqueOrdered(
    products
      .filter((p) => categoryOf(p).id === categoryId)
      .map((p) => p[field]),
  );
  specValueCache.set(key, values);
  return values;
}

export const SHIPPING_FLAT_ZAR = 120;
