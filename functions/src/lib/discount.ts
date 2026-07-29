import type { Order } from "./firestore";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * ZAR discount for an ad-hoc manual percentage, capped at the subtotal.
 * Shared by manual-sale create and order edit so both compute identically.
 */
export function computePercentDiscount(
  subtotal: number,
  percent: number,
): number {
  if (subtotal <= 0 || percent <= 0) return 0;
  return round2(Math.min(subtotal, (subtotal * percent) / 100));
}

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
