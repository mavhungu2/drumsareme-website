/**
 * Server-side price catalog — the source of truth for /api/checkout.
 * Mirrors src/lib/products.ts but only the fields that affect payment.
 * Keep in sync when adding/renaming products.
 */
export interface ServerProduct {
  id: string;
  name: string;
  price: number;
}

export const SHIPPING_FLAT_ZAR = 100;

export const BRICK_QUANTITY = 12;
export const BRICK_PRICE_ZAR = 1600;

const basePairs: ServerProduct[] = [
  { id: "5a-natural", name: "Keep Time 5A - Natural", price: 150 },
  { id: "5a-black", name: "Keep Time 5A - Black", price: 150 },
  { id: "5a-pink", name: "Keep Time 5A - Pink", price: 150 },
  { id: "5b-natural", name: "Keep Time 5B - Natural", price: 150 },
  { id: "5b-black", name: "Keep Time 5B - Black", price: 150 },
  { id: "5b-pink", name: "Keep Time 5B - Pink", price: 150 },
  { id: "ex5a-natural", name: "Keep Time EX5A - Natural", price: 150 },
  { id: "ex5b-natural", name: "Keep Time EX5B - Natural", price: 150 },
];

const brickPairs: ServerProduct[] = basePairs.map((p) => ({
  id: `${p.id}-brick`,
  name: `${p.name} — Brick (${BRICK_QUANTITY} pairs)`,
  price: BRICK_PRICE_ZAR,
}));

const catalog = new Map<string, ServerProduct>(
  [...basePairs, ...brickPairs].map((p) => [p.id, p]),
);

export function getServerProduct(id: string): ServerProduct | undefined {
  return catalog.get(id);
}
