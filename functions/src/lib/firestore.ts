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

export interface Order {
  ref: string;
  status: "pending" | "paid" | "failed" | "shipped" | "cancelled";
  source?: OrderSource;
  manualPaymentMethod?: ManualPaymentMethod;
  inventoryApplied?: boolean;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  customer: Customer;
  yoco: {
    checkoutId: string;
    paymentId?: string;
    failureReason?: string;
  };
  createdAt: FirebaseFirestore.Timestamp;
  paidAt?: FirebaseFirestore.Timestamp;
  shippedAt?: FirebaseFirestore.Timestamp;
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
  const yyyymmdd = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const counterRef = db.doc("counters/orders");
  const seq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = (snap.exists ? (snap.data()?.seq as number) : 0) || 0;
    const next = current + 1;
    tx.set(counterRef, { seq: next }, { merge: true });
    return next;
  });
  return `KT-${yyyymmdd}-${String(seq).padStart(4, "0")}`;
}
