/**
 * Shared line-item validation + building for admin order writes (manual sale
 * create and order edit). A line is a catalog product when it carries a
 * productId (server-authoritative price via getServerProduct); otherwise it's
 * an ad-hoc service line (description + unitPrice, no inventory).
 */
import { round2 } from "./discount";
import type { OrderItem } from "./firestore";
import { getServerProduct } from "./products";

export type ItemInput =
  | { kind: "product"; productId: string; qty: number }
  | { kind: "service"; description: string; qty: number; unitPrice: number };

const MAX_SERVICE_DESC_LEN = 200;
const MAX_SERVICE_UNIT_PRICE = 1_000_000;
const MAX_QTY = 1000;

export function validateItemsInput(
  items: unknown,
): { ok: true; items: ItemInput[] } | { ok: false; error: string } {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "At least one item is required" };
  }
  const clean: ItemInput[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "Invalid item" };
    }
    const it = raw as Record<string, unknown>;

    const qtyValid =
      typeof it.qty === "number" &&
      Number.isFinite(it.qty) &&
      Number.isInteger(it.qty) &&
      it.qty > 0 &&
      it.qty <= MAX_QTY;
    if (!qtyValid) {
      return {
        ok: false,
        error: `item.qty must be a positive integer ≤ ${MAX_QTY}`,
      };
    }
    const qty = it.qty as number;

    const hasProductId =
      typeof it.productId === "string" && it.productId.trim().length > 0;
    if (hasProductId) {
      clean.push({
        kind: "product",
        productId: (it.productId as string).trim(),
        qty,
      });
      continue;
    }

    // Service line.
    if (
      typeof it.description !== "string" ||
      it.description.trim().length === 0
    ) {
      return {
        ok: false,
        error: "item must have a productId or a service description",
      };
    }
    const description = it.description.trim();
    if (description.length > MAX_SERVICE_DESC_LEN) {
      return { ok: false, error: "item.description too long" };
    }
    if (
      typeof it.unitPrice !== "number" ||
      !Number.isFinite(it.unitPrice) ||
      it.unitPrice < 0 ||
      it.unitPrice > MAX_SERVICE_UNIT_PRICE
    ) {
      return {
        ok: false,
        error: "service item.unitPrice must be a non-negative number",
      };
    }
    clean.push({
      kind: "service",
      description,
      qty,
      unitPrice: round2(it.unitPrice),
    });
  }
  return { ok: true, items: clean };
}

/**
 * Resolves validated inputs into OrderItem rows with a normalized subtotal.
 * Product prices come from the server catalog — never the client.
 */
export async function buildOrderItems(
  items: ItemInput[],
): Promise<
  | { ok: true; orderItems: OrderItem[]; subtotal: number }
  | { ok: false; error: string }
> {
  const orderItems: OrderItem[] = [];
  let subtotal = 0;
  for (const it of items) {
    if (it.kind === "service") {
      const lineTotal = round2(it.unitPrice * it.qty);
      orderItems.push({
        name: it.description,
        qty: it.qty,
        unitPrice: it.unitPrice,
        lineTotal,
      });
      subtotal += lineTotal;
      continue;
    }
    const product = await getServerProduct(it.productId);
    if (!product) {
      return { ok: false, error: `Unknown product ${it.productId}` };
    }
    const lineTotal = product.price * it.qty;
    orderItems.push({
      productId: product.id,
      name: product.name,
      qty: it.qty,
      unitPrice: product.price,
      lineTotal,
    });
    subtotal += lineTotal;
  }
  return { ok: true, orderItems, subtotal: round2(subtotal) };
}
