import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { db, Timestamp, type Order, type Expense, type InventoryItem } from "./lib/firestore";
import { requireAdmin } from "./lib/auth";
import { applyCors } from "./lib/cors";

interface KPIs {
  grossRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalOrders: number;
  paidOrders: number;
}

interface PaymentBreakdown {
  yoco: number;
  [method: string]: number;
}

interface TopCustomer {
  email: string;
  name: string;
  totalSpend: number;
  orderCount: number;
}

interface LowStockItem {
  productId: string;
  currentStock: number;
  reorderLevel: number;
}

interface AnalyticsPayload {
  kpis: KPIs;
  payments: PaymentBreakdown;
  topCustomers: TopCustomer[];
  lowStock: LowStockItem[];
}

export async function buildAnalytics(
  fromDate: Date | null,
  toDate: Date | null,
): Promise<AnalyticsPayload> {
  let ordersQuery: FirebaseFirestore.Query = db.collection("orders");
  if (fromDate) ordersQuery = ordersQuery.where("createdAt", ">=", Timestamp.fromDate(fromDate));
  if (toDate) ordersQuery = ordersQuery.where("createdAt", "<=", Timestamp.fromDate(toDate));

  let expensesQuery: FirebaseFirestore.Query = db.collection("expenses");
  if (fromDate) expensesQuery = expensesQuery.where("date", ">=", Timestamp.fromDate(fromDate));
  if (toDate) expensesQuery = expensesQuery.where("date", "<=", Timestamp.fromDate(toDate));

  const [ordersSnap, expensesSnap, inventorySnap] = await Promise.all([
    ordersQuery.get(),
    expensesQuery.get(),
    db.collection("inventory").get(),
  ]);

  const orders = ordersSnap.docs.map((d) => d.data() as Order);
  const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "shipped");
  const expenses = expensesSnap.docs.map((d) => d.data() as Expense);

  const grossRevenue = paidOrders.reduce((sum, o) => sum + (o.total ?? 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0);

  const payments: PaymentBreakdown = { yoco: 0 };
  for (const order of paidOrders) {
    if (!order.source || order.source === "yoco") {
      payments.yoco += 1;
    } else {
      const method = order.manualPaymentMethod ?? "unknown";
      payments[method] = (payments[method] ?? 0) + 1;
    }
  }

  const customerMap = new Map<string, TopCustomer>();
  for (const order of paidOrders) {
    const email = order.customer?.email ?? "unknown";
    const existing = customerMap.get(email);
    if (existing) {
      existing.totalSpend += order.total ?? 0;
      existing.orderCount += 1;
    } else {
      customerMap.set(email, {
        email,
        name: `${order.customer?.firstName ?? ""} ${order.customer?.lastName ?? ""}`.trim(),
        totalSpend: order.total ?? 0,
        orderCount: 1,
      });
    }
  }
  const topCustomers = [...customerMap.values()]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5);

  const lowStock: LowStockItem[] = inventorySnap.docs
    .map((d) => d.data() as InventoryItem)
    .filter((item) => item.reorderLevel !== undefined && item.currentStock <= item.reorderLevel)
    .map((item) => ({
      productId: item.productId,
      currentStock: item.currentStock,
      reorderLevel: item.reorderLevel!,
    }));

  return {
    kpis: {
      grossRevenue,
      totalExpenses,
      netProfit: grossRevenue - totalExpenses,
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
    },
    payments,
    topCustomers,
    lowStock,
  };
}

export const adminAnalytics = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "GET") { res.status(405).json({ error: "Method Not Allowed" }); return; }

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    const { from, to } = req.query as Record<string, string | undefined>;
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    if (fromDate && isNaN(fromDate.getTime())) {
      res.status(400).json({ error: "Invalid from date" });
      return;
    }
    if (toDate && isNaN(toDate.getTime())) {
      res.status(400).json({ error: "Invalid to date" });
      return;
    }

    try {
      const payload = await buildAnalytics(fromDate, toDate);
      logger.info("adminAnalytics", { uid: auth.uid });
      res.status(200).json(payload);
    } catch (err) {
      logger.error("adminAnalytics error", { err: String(err) });
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  },
);
