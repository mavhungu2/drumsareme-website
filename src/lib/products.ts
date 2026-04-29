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

export interface Product {
  id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
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
  price: p.price,
  description: p.description,
  features: p.features,
  image: p.image,
  inStock: p.inStock,
}));

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getProductsBySize(size: string): Product[] {
  return products.filter((p) => p.size === size);
}

export function getProductsByColor(color: string): Product[] {
  return products.filter((p) => p.color === color);
}

export const sizes = ["7A", "5A", "5B", "EX5A", "EX5B"] as const;
export const colors = [
  "Natural",
  "Black",
  "Pink",
  "Red",
  "Green",
  "Blue",
  "Yellow",
  "Silver Blade",
] as const;

export const SHIPPING_FLAT_ZAR = 100;
