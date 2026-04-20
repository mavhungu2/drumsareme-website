/**
 * Mirror of functions/src/lib/firestore.ts — keep in sync when the Order
 * shape changes. The two TypeScript projects (root and functions/) do not
 * share a tsconfig, so we deliberately duplicate these interfaces here and
 * serialize Firestore Timestamp values to ISO strings at the API boundary.
 */

export type OrderStatus =
  | "pending"
  | "paid"
  | "failed"
  | "shipped"
  | "cancelled";

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
  at: string;
  by: string;
  body: string;
}

export interface OrderTracking {
  carrier: string;
  number: string;
  url?: string;
}

export interface Order {
  id: string;
  ref: string;
  status: OrderStatus;
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
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
  cancelledAt?: string;
  tracking?: OrderTracking;
  notes?: OrderNote[];
}

export interface OrderListItem {
  id: string;
  ref: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  customerCity: string;
  total: number;
  itemCount: number;
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
}

export interface ListOrdersResponse {
  orders: OrderListItem[];
  nextCursor: string | null;
}

export interface ListOrdersQuery {
  status?: OrderStatus;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export const ORDER_STATUSES: ReadonlyArray<OrderStatus> = [
  "pending",
  "paid",
  "failed",
  "shipped",
  "cancelled",
];

export const ORDER_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  shipped: "Shipped",
  cancelled: "Cancelled",
};
