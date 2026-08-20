/**
 * Mirror of functions/src/adminAnalytics.ts response shape. Keep in sync.
 */
import type { ExpenseType } from "./expenses-types";

export interface PaymentBreakdown {
  cash: number;
  card: number;
  eft: number;
  yoco: number;
}

export interface StatusBreakdown {
  pending: number;
  paid: number;
  failed: number;
  shipped: number;
  completed: number;
  cancelled: number;
}

export interface CustomerAggregate {
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string;
}

export interface ProductPerformance {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

export interface LowStockItem {
  productId: string;
  name: string;
  currentStock: number;
  reorderLevel: number;
}

export interface AnalyticsKpis {
  grossRevenue: number;
  unitsSold: number;
  totalOrders: number;
  paidOrders: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
}

export interface ExpenseTypeBreakdown {
  type: ExpenseType;
  total: number;
  count: number;
  /** Fraction of totalExpenses in range (0..1). */
  share: number;
}

export interface ExpenseDescriptionBreakdown {
  description: string;
  /** Every expense type this description was filed under, sorted. */
  types: ExpenseType[];
  total: number;
  count: number;
  share: number;
}

export interface AnalyticsResponse {
  range: { from: string | null; to: string | null };
  kpis: AnalyticsKpis;
  payments: PaymentBreakdown;
  statuses: StatusBreakdown;
  bestSeller: ProductPerformance | null;
  productPerformance: ProductPerformance[];
  customers: CustomerAggregate[];
  topCustomers: CustomerAggregate[];
  lowStock: LowStockItem[];
  expensesByType: ExpenseTypeBreakdown[];
  expensesByDescription: ExpenseDescriptionBreakdown[];
}

export interface AnalyticsQuery {
  from?: string;
  to?: string;
}

export type ManualSaleItemInput =
  | { productId: string; qty: number }
  | { description: string; qty: number; unitPrice: number };

export interface ManualSaleInput {
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    addressLine1?: string;
    suburb?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  items: ManualSaleItemInput[];
  fulfilment: "delivery" | "collection" | "none";
  deliveryFee: number;
  notes?: string;
  promoCode?: string;
  /** Ad-hoc manual percentage discount (0 < p <= 100). */
  discountPercent?: number;
}

export interface ManualSaleResponse {
  id: string;
  ref: string;
  subtotal: number;
  total: number;
  shipping: number;
  fulfilment: "delivery" | "collection" | "none";
}

export interface MarkPaidInput {
  manualPaymentMethod: "cash" | "card" | "eft";
  fulfilment: "delivery" | "collection" | "none";
  deliveryFee?: number;
}

export interface MarkPaidResponse {
  ok: true;
  status: "paid";
  manualPaymentMethod: "cash" | "card" | "eft";
  fulfilment: "delivery" | "collection" | "none";
  shipping: number;
}
