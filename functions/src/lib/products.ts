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

const catalogList: ServerProduct[] = [
  // 7A
  { id: "7a-natural", name: "Keep Time 7A - Natural", price: 150 },
  { id: "7a-blue", name: "Keep Time 7A - Blue", price: 150 },
  { id: "7a-green", name: "Keep Time 7A - Green", price: 150 },
  { id: "7a-red", name: "Keep Time 7A - Red", price: 150 },

  // 5A
  { id: "5a-natural", name: "Keep Time 5A - Natural", price: 150 },
  { id: "5a-black", name: "Keep Time 5A - Black", price: 150 },
  { id: "5a-pink", name: "Keep Time 5A - Pink", price: 150 },
  { id: "5a-red", name: "Keep Time 5A - Red", price: 150 },
  { id: "5a-green", name: "Keep Time 5A - Green", price: 150 },
  { id: "5a-blue", name: "Keep Time 5A - Blue", price: 150 },
  { id: "5a-yellow", name: "Keep Time 5A - Yellow", price: 150 },
  { id: "5a-silver-blade", name: "Keep Time 5A - Silver Blade", price: 180 },

  // 5B
  { id: "5b-natural", name: "Keep Time 5B - Natural", price: 150 },
  { id: "5b-black", name: "Keep Time 5B - Black", price: 150 },

  // EX5A
  { id: "ex5a-natural", name: "Keep Time EX5A - Natural", price: 150 },
  { id: "ex5a-black", name: "Keep Time EX5A - Black", price: 150 },

  // EX5B
  { id: "ex5b-natural", name: "Keep Time EX5B - Natural", price: 150 },
];

const catalog = new Map<string, ServerProduct>(
  catalogList.map((p) => [p.id, p]),
);

export function getServerProduct(id: string): ServerProduct | undefined {
  return catalog.get(id);
}
