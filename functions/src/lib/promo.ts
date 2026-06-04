/**
 * Promo code validation shared by:
 *   - validatePromo (public endpoint used by the checkout UI live-validation)
 *   - createCheckout (Yoco-paid flow)
 *   - adminManualSales (admin-recorded orders)
 *
 * Returns a tagged result rather than throwing — the caller decides whether a
 * failure aborts the order or just shows a softer message to the user.
 */
import { db, Timestamp, type PromoCode } from "./firestore";

export interface PromoValidationInput {
  code: string;
  subtotal: number;
  /**
   * Customer email used for the firstOrderOnly check. Optional — when the
   * code is firstOrderOnly and email is absent, validation rejects with a
   * message asking the customer to supply it.
   */
  email?: string;
}

export type PromoValidationResult =
  | {
      ok: true;
      code: string;
      discount: number;
      promo: PromoCode;
    }
  | {
      ok: false;
      code?: string;
      error: string;
    };

export function normalizePromoCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function computeDiscount(promo: PromoCode, subtotal: number): number {
  if (subtotal <= 0) return 0;
  if (promo.kind === "percent") {
    const raw = (subtotal * promo.value) / 100;
    return round2(Math.min(subtotal, raw));
  }
  return round2(Math.min(subtotal, promo.value));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function customerHasPriorOrder(email: string): Promise<boolean> {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) return false;
  const customersSnap = await db
    .collection("customers")
    .where("emailLower", "==", emailLower)
    .limit(1)
    .get();
  if (customersSnap.empty) return false;
  const customerId = customersSnap.docs[0].id;
  const ordersSnap = await db
    .collection("orders")
    .where("customerId", "==", customerId)
    .where("status", "in", ["paid", "shipped", "completed"])
    .limit(1)
    .get();
  return !ordersSnap.empty;
}

export async function validatePromoCode(
  input: PromoValidationInput,
): Promise<PromoValidationResult> {
  const code = normalizePromoCode(input.code);
  if (!code) return { ok: false, error: "Enter a promo code" };

  const snap = await db.doc(`promoCodes/${code}`).get();
  if (!snap.exists) {
    return { ok: false, code, error: "Code not recognised" };
  }
  const promo = snap.data() as PromoCode;

  if (!promo.active) {
    return { ok: false, code, error: "Code is inactive" };
  }
  const now = Timestamp.now().toMillis();
  if (promo.startsAt && promo.startsAt.toMillis() > now) {
    return { ok: false, code, error: "Code is not yet active" };
  }
  if (promo.expiresAt && promo.expiresAt.toMillis() < now) {
    return { ok: false, code, error: "Code has expired" };
  }
  if (
    typeof promo.maxRedemptions === "number" &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return { ok: false, code, error: "Code has reached its limit" };
  }
  if (input.subtotal <= 0) {
    return { ok: false, code, error: "Add items to your cart first" };
  }

  if (promo.firstOrderOnly) {
    if (!input.email || !input.email.trim()) {
      return {
        ok: false,
        code,
        error: "Enter your email — this code is for new customers only",
      };
    }
    const hasPrior = await customerHasPriorOrder(input.email);
    if (hasPrior) {
      return {
        ok: false,
        code,
        error: "This code is for first-time customers only",
      };
    }
  }

  const discount = computeDiscount(promo, input.subtotal);
  if (discount <= 0) {
    return { ok: false, code, error: "Code does not apply" };
  }

  return { ok: true, code, discount, promo };
}
