import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  Timestamp,
  type Expense,
  type ExpenseType,
  type InventoryItem,
  type ManualPaymentMethod,
  type Order,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";

interface PaymentBreakdown {
  cash: number;
  card: number;
  eft: number;
  yoco: number;
}

interface StatusBreakdown {
  pending: number;
  paid: number;
  failed: number;
  shipped: number;
  completed: number;
  cancelled: number;
}

interface CustomerAggregate {
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string;
}

interface ProductPerformance {
  productId: string;
  name: string;
  unitsSold: number;
  revenue: number;
}

interface LowStockItem {
  productId: string;
  name: string;
  currentStock: number;
  reorderLevel: number;
}

interface ExpenseTypeBreakdown {
  type: ExpenseType;
  total: number;
  count: number;
  /** Fraction of totalExpenses in range (0..1). */
  share: number;
}

interface ExpenseDescriptionBreakdown {
  description: string;
  /** Every expense type this description was filed under, sorted. */
  types: ExpenseType[];
  total: number;
  count: number;
  share: number;
}

interface AnalyticsResponse {
  range: { from: string | null; to: string | null };
  kpis: {
    grossRevenue: number;
    unitsSold: number;
    totalOrders: number;
    paidOrders: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
  };
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

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseIsoTimestamp(raw: string | undefined): Timestamp | undefined {
  if (!raw) return undefined;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return undefined;
  return Timestamp.fromDate(date);
}

interface DateRange {
  from?: Timestamp;
  to?: Timestamp;
}

function parseRange(
  rawQuery: Record<string, string | string[] | undefined>,
): DateRange | string {
  const from = parseIsoTimestamp(firstQueryValue(rawQuery.from));
  if (rawQuery.from && !from) return "Invalid 'from' date";
  const to = parseIsoTimestamp(firstQueryValue(rawQuery.to));
  if (rawQuery.to && !to) return "Invalid 'to' date";
  return { from, to };
}

function applyRange(
  q: FirebaseFirestore.Query,
  field: string,
  range: DateRange,
): FirebaseFirestore.Query {
  if (range.from) q = q.where(field, ">=", range.from);
  if (range.to) q = q.where(field, "<=", range.to);
  return q;
}

function paymentKey(order: Order): keyof PaymentBreakdown {
  if (order.source === "manual" && order.manualPaymentMethod) {
    return order.manualPaymentMethod;
  }
  return "yoco";
}

function customerKeyFor(order: Order): string {
  // Prefer the canonical customerId once it's been backfilled. Falls back to
  // the legacy email|phone|name composite key for orders that pre-date the
  // normalize-customers migration.
  if (order.customerId) return `id:${order.customerId}`;
  const email = order.customer.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = order.customer.phone?.replace(/\s+/g, "");
  if (phone) return `phone:${phone}`;
  return `name:${(order.customer.firstName + order.customer.lastName).toLowerCase()}`;
}

function customerName(order: Order): string {
  return `${order.customer.firstName} ${order.customer.lastName}`.trim();
}

async function buildAnalytics(range: DateRange): Promise<AnalyticsResponse> {
  let ordersQ: FirebaseFirestore.Query = db.collection("orders");
  ordersQ = applyRange(ordersQ, "createdAt", range);
  const [ordersSnap, expensesSnap, inventorySnap] = await Promise.all([
    ordersQ.get(),
    applyRange(db.collection("expenses"), "date", range).get(),
    db.collection("inventory").get(),
  ]);

  const payments: PaymentBreakdown = { cash: 0, card: 0, eft: 0, yoco: 0 };
  const statuses: StatusBreakdown = {
    pending: 0,
    paid: 0,
    failed: 0,
    shipped: 0,
    completed: 0,
    cancelled: 0,
  };
  const productMap = new Map<string, ProductPerformance>();
  const customerMap = new Map<string, CustomerAggregate>();

  let grossRevenue = 0;
  let unitsSold = 0;
  let totalOrders = 0;
  let paidOrders = 0;

  ordersSnap.forEach((doc) => {
    const order = doc.data() as Order;
    // Always count the status so the dashboard's status breakdown reflects
    // pending drafts. Skip pending for revenue / units / customers / product
    // performance below since drafts haven't generated revenue yet.
    statuses[order.status] += 1;
    if (order.status === "pending") return;
    totalOrders += 1;

    const isRevenue =
      order.status === "paid" ||
      order.status === "shipped" ||
      order.status === "completed";
    if (!isRevenue) return;
    paidOrders += 1;

    payments[paymentKey(order)] += 1;
    grossRevenue += order.total ?? 0;

    for (const item of order.items ?? []) {
      // Service lines (no productId) contribute to revenue via order.total but
      // are not catalog units — keep them out of unitsSold / product perf.
      if (!item.productId) continue;
      unitsSold += item.qty;
      const existing = productMap.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        unitsSold: 0,
        revenue: 0,
      };
      existing.unitsSold += item.qty;
      existing.revenue += item.lineTotal;
      productMap.set(item.productId, existing);
    }

    const key = customerKeyFor(order);
    const lastOrderIso = order.createdAt
      ? order.createdAt.toDate().toISOString()
      : "";
    const existingCustomer = customerMap.get(key);
    if (existingCustomer) {
      existingCustomer.totalOrders += 1;
      existingCustomer.totalSpend += order.total ?? 0;
      if (lastOrderIso > existingCustomer.lastOrderAt) {
        existingCustomer.lastOrderAt = lastOrderIso;
      }
    } else {
      customerMap.set(key, {
        name: customerName(order),
        email: order.customer.email ?? "",
        phone: order.customer.phone ?? "",
        totalOrders: 1,
        totalSpend: order.total ?? 0,
        lastOrderAt: lastOrderIso,
      });
    }
  });

  let totalExpenses = 0;
  const expenseTypeMap = new Map<
    ExpenseType,
    { total: number; count: number }
  >();
  const expenseDescMap = new Map<
    string,
    {
      description: string;
      total: number;
      count: number;
      types: Set<ExpenseType>;
    }
  >();
  expensesSnap.forEach((doc) => {
    const expense = doc.data() as Expense;
    const amount = expense.amount ?? 0;
    totalExpenses += amount;

    const type = (expense.type ?? "other") as ExpenseType;
    const typeEntry = expenseTypeMap.get(type) ?? { total: 0, count: 0 };
    typeEntry.total += amount;
    typeEntry.count += 1;
    expenseTypeMap.set(type, typeEntry);

    // Group by a normalized description so "Hickory dowels" and
    // "hickory  dowels" fold together; the first-seen spelling is displayed.
    const trimmed = (expense.description ?? "").trim();
    const description = trimmed.length > 0 ? trimmed : "(no description)";
    const key = description.toLowerCase().replace(/\s+/g, " ");
    const descEntry = expenseDescMap.get(key) ?? {
      description,
      total: 0,
      count: 0,
      types: new Set<ExpenseType>(),
    };
    descEntry.total += amount;
    descEntry.count += 1;
    descEntry.types.add(type);
    expenseDescMap.set(key, descEntry);
  });
  // Normalize after float accumulation so cents are exact.
  totalExpenses = Math.round(totalExpenses * 100) / 100;

  const expensesByType: ExpenseTypeBreakdown[] = [...expenseTypeMap.entries()]
    .map(([type, v]) => ({
      type,
      total: Math.round(v.total * 100) / 100,
      count: v.count,
      share: totalExpenses > 0 ? v.total / totalExpenses : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const expensesByDescription: ExpenseDescriptionBreakdown[] = [
    ...expenseDescMap.values(),
  ]
    .map((v) => ({
      description: v.description,
      types: [...v.types].sort(),
      total: Math.round(v.total * 100) / 100,
      count: v.count,
      share: totalExpenses > 0 ? v.total / totalExpenses : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const productPerformance = [...productMap.values()].sort(
    (a, b) => b.revenue - a.revenue,
  );
  const bestSeller = productPerformance[0] ?? null;

  const customers = [...customerMap.values()].sort(
    (a, b) => b.totalSpend - a.totalSpend,
  );
  const topCustomers = customers.slice(0, 5);

  const lowStock: LowStockItem[] = [];
  inventorySnap.forEach((doc) => {
    const item = doc.data() as InventoryItem;
    if (item.currentStock <= item.reorderLevel) {
      lowStock.push({
        productId: doc.id,
        name: item.name,
        currentStock: item.currentStock,
        reorderLevel: item.reorderLevel,
      });
    }
  });
  lowStock.sort((a, b) => a.currentStock - b.currentStock);

  const netProfit = grossRevenue - totalExpenses;
  const profitMargin = grossRevenue > 0 ? netProfit / grossRevenue : 0;

  return {
    range: {
      from: range.from ? range.from.toDate().toISOString() : null,
      to: range.to ? range.to.toDate().toISOString() : null,
    },
    kpis: {
      grossRevenue,
      unitsSold,
      totalOrders,
      paidOrders,
      totalExpenses,
      netProfit,
      profitMargin,
    },
    payments,
    statuses,
    bestSeller,
    productPerformance,
    customers,
    topCustomers,
    lowStock,
    expensesByType,
    expensesByDescription,
  };
}

export const adminAnalytics = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req: Request, res: Response) => {
    applyCors(req, res, "GET");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const range = parseRange(
      req.query as Record<string, string | string[] | undefined>,
    );
    if (typeof range === "string") {
      res.status(400).json({ error: range });
      return;
    }

    try {
      const data = await buildAnalytics(range);
      logger.info("adminAnalytics", {
        uid: auth.uid,
        totalOrders: data.kpis.totalOrders,
        paidOrders: data.kpis.paidOrders,
      });
      res.status(200).json(data);
    } catch (err) {
      logger.error("adminAnalytics failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to build analytics" });
      }
    }
  },
);

// Re-export for type sharing in client (do not import this file in client; use
// src/lib/admin/analytics-types.ts which mirrors the shape).
export type {
  AnalyticsResponse,
  ExpenseTypeBreakdown,
  ExpenseDescriptionBreakdown,
  CustomerAggregate,
  ProductPerformance,
  LowStockItem,
  PaymentBreakdown,
  StatusBreakdown,
};
// Also re-exporting the manual payment method enum so the manual-sale endpoint
// can reuse it without circular imports.
export type ManualPaymentMethodAlias = ManualPaymentMethod;
