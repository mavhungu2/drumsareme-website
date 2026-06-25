import type { Order } from "./firestore";

/**
 * Human label for an order's discount line, shared by every render surface
 * (emails + PDF) so they stay consistent:
 *   - promo code   -> "Promo (CODE)"
 *   - manual %      -> "Discount (10%)"
 *   - bare amount   -> "Discount"
 */
export function discountLabel(order: Order): string {
  if (order.promoCode) return `Promo (${order.promoCode})`;
  if (typeof order.discountPercent === "number" && order.discountPercent > 0) {
    return `Discount (${order.discountPercent}%)`;
  }
  return "Discount";
}
