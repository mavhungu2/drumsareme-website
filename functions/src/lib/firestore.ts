import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export { FieldValue, Timestamp };

export interface OrderItem {
  /**
   * Catalog SKU. Present for products (inventory-tracked); ABSENT for ad-hoc
   * service line items (e.g. a drumming gig or singing performance) added on a
   * manual invoice. Inventory logic must skip items without a productId.
   */
  productId?: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  suburb?: string;
  city: string;
  province: string;
  postalCode: string;
  notes?: string;
}

export interface OrderNote {
  at: FirebaseFirestore.Timestamp;
  by: string;
  body: string;
}

export interface OrderTracking {
  carrier: string;
  number: string;
  url?: string;
}

/**
 * Optional details captured when a self-collection order is marked ready to
 * collect. All fields optional — the customer usually collects in person, but
 * they may send a courier / third party, in which case the admin records who.
 */
export interface OrderCollection {
  collectorName?: string;
  collectorContact?: string;
  note?: string;
}

export type OrderSource = "yoco" | "manual";
export type ManualPaymentMethod = "cash" | "card" | "eft";
/**
 * "none" = a service/no-shipping invoice (e.g. a performance booking). Such
 * orders have no delivery fee, no shipping line, and skip the shipped /
 * ready-to-collect step — they go straight paid → completed. The storefront
 * only ever uses "delivery" | "collection"; "none" is manual-invoice only.
 */
export type Fulfilment = "delivery" | "collection" | "none";

/**
 * Shared collection address. The retailer offers customer self-collection from
 * Spring Glade, so the storefront and admin both show this string. Update it
 * here if the address ever changes.
 */
export const COLLECTION_ADDRESS = {
  name: "Spring Glade",
  line1: "Vermooten Rd",
  suburb: "Princess",
  city: "Roodepoort",
  postalCode: "1724",
} as const;

export interface Order {
  ref: string;
  status:
    | "pending"
    | "paid"
    | "failed"
    | "shipped"
    | "completed"
    | "cancelled";
  source?: OrderSource;
  manualPaymentMethod?: ManualPaymentMethod;
  fulfilment?: Fulfilment;
  inventoryApplied?: boolean;
  items: OrderItem[];
  subtotal: number;
  /**
   * ZAR amount discounted from `subtotal` via a promo code. `total` already
   * reflects this. Always 0 when no code was applied (or omitted on legacy
   * orders that pre-date promo codes — readers must treat `undefined` as 0).
   */
  discount?: number;
  /** Promo code used on this order, uppercased. Matches `promoCodes/{code}`. */
  promoCode?: string;
  shipping: number;
  total: number;
  /**
   * Link to the canonical record in `customers/{customerId}`. Populated on
   * every new order (manual or Yoco). Legacy orders without this field are
   * still grouped by the analytics email|phone|name key.
   */
  customerId?: string;
  customer: Customer;
  yoco: {
    checkoutId: string;
    paymentId?: string;
    failureReason?: string;
  };
  createdAt: FirebaseFirestore.Timestamp;
  paidAt?: FirebaseFirestore.Timestamp;
  shippedAt?: FirebaseFirestore.Timestamp;
  completedAt?: FirebaseFirestore.Timestamp;
  cancelledAt?: FirebaseFirestore.Timestamp;
  receiptResendAt?: FirebaseFirestore.Timestamp;
  tracking?: OrderTracking;
  collection?: OrderCollection;
  notes?: OrderNote[];
}

export interface InventoryItem {
  productId: string;
  name: string;
  openingStock: number;
  unitsSold: number;
  currentStock: number;
  reorderLevel: number;
  supplier?: string;
  updatedAt: FirebaseFirestore.Timestamp;
}

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
  sortOrder: number;
  updatedAt: FirebaseFirestore.Timestamp;
}

/**
 * Canonical customer record. Each order references this via `order.customerId`
 * while still keeping a denormalized `order.customer` snapshot so historical
 * invoices/shipping records remain accurate.
 *
 * `emailLower` and `phoneDigits` are normalized lookup fields used to match
 * existing customers at checkout / manual sale time. They're maintained by
 * callers of `findOrCreateCustomer`.
 */
export interface CustomerRecord {
  firstName: string;
  lastName: string;
  email: string;
  emailLower: string;
  phone: string;
  phoneDigits: string;
  /**
   * Most recently observed delivery address. Used as a default when creating
   * a new order for this customer. Order-level addresses are still recorded
   * on each order; this is purely a convenience.
   */
  defaultAddress?: {
    addressLine1?: string;
    suburb?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  notes?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export type PromoCodeKind = "percent" | "fixed";

/**
 * A redeemable promo code. The doc id IS the code (uppercased) so lookups
 * are O(1). Validation lives in `lib/promo.ts` and is shared by the public
 * validate endpoint, createCheckout, and adminManualSales — never trust the
 * client-supplied discount, always recompute server-side.
 *
 * `redemptionCount` is incremented atomically when an order transitions to
 * `paid` (Yoco webhook + admin mark-paid). A small race window exists where
 * two near-simultaneous payments can overshoot `maxRedemptions` by one or
 * two; acceptable for a small shop. Hard caps would need a reservation
 * counter at checkout time.
 */
export interface PromoCode {
  code: string;
  kind: PromoCodeKind;
  /** For "percent": 1..100. For "fixed": ZAR amount. */
  value: number;
  active: boolean;
  startsAt?: FirebaseFirestore.Timestamp;
  expiresAt?: FirebaseFirestore.Timestamp;
  maxRedemptions?: number;
  redemptionCount: number;
  /** Only customers with no prior paid|shipped|completed orders qualify. */
  firstOrderOnly?: boolean;
  notes?: string;
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
}

export type ExpenseType =
  | "materials"
  | "shipping"
  | "marketing"
  | "operations"
  | "other";

export interface Expense {
  date: FirebaseFirestore.Timestamp;
  type: ExpenseType;
  description: string;
  amount: number;
  createdAt: FirebaseFirestore.Timestamp;
  createdBy: string;
}

export async function generateOrderRef(): Promise<string> {
  const counterRef = db.doc("counters/orders");
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = (snap.exists ? (snap.data()?.seq as number) : 0) || 0;
    const next = current + 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });
  return `KT-${String(seq).padStart(4, "0")}`;
}
