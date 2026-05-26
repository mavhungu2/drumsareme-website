import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
export { FieldValue, Timestamp };

export interface OrderItem {
  productId: string;
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

export type OrderSource = "yoco" | "manual";
export type ManualPaymentMethod = "cash" | "card" | "eft";
export type Fulfilment = "delivery" | "collection";

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
