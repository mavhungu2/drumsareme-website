import { beforeEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { clearFirestore, db, makeOrder, makeExpense, makeInventoryItem } from "./helpers";
import { buildAnalytics } from "../src/adminAnalytics";
import type { Order, Customer } from "../src/lib/firestore";

// buildAnalytics only uses firebase-admin Firestore — no firebase-functions mocks needed.

beforeEach(async () => { await clearFirestore(); });

async function seedOrder(id: string, overrides: Partial<Order>) {
  await db.collection("orders").doc(id).set(makeOrder(overrides));
}

const ALT_CUSTOMER = (n: number): Customer => ({
  firstName: "Customer",
  lastName: String(n),
  email: `c${n}@example.com`,
  phone: "0821234567",
  addressLine1: "1 Test St",
  city: "Cape Town",
  province: "Western Cape",
  postalCode: "8001",
});

describe("adminAnalytics — KPI aggregation", () => {
  it("grossRevenue sums only paid/shipped; others excluded", async () => {
    await seedOrder("o1", { status: "paid", total: 400 });
    await seedOrder("o2", { status: "shipped", total: 600 });
    await seedOrder("o3", { status: "pending", total: 200 });
    await seedOrder("o4", { status: "failed", total: 150 });
    await seedOrder("o5", { status: "cancelled", total: 300 });

    const r = await buildAnalytics(null, null);
    expect(r.kpis.grossRevenue).toBe(1000);
    expect(r.kpis.paidOrders).toBe(2);
    expect(r.kpis.totalOrders).toBe(5);
  });

  it("netProfit = grossRevenue - totalExpenses", async () => {
    await seedOrder("o1", { status: "paid", total: 500 });
    await db.collection("expenses").add(makeExpense({ amount: 120 }));
    await db.collection("expenses").add(makeExpense({ amount: 80 }));

    const r = await buildAnalytics(null, null);
    expect(r.kpis.netProfit).toBe(300); // 500 - 200
  });

  it("empty dataset: all KPIs zero, empty arrays, no crash", async () => {
    const r = await buildAnalytics(null, null);
    expect(r.kpis.grossRevenue).toBe(0);
    expect(r.kpis.netProfit).toBe(0);
    expect(r.kpis.totalOrders).toBe(0);
    expect(r.topCustomers).toHaveLength(0);
    expect(r.lowStock).toHaveLength(0);
  });
});

describe("adminAnalytics — payments breakdown", () => {
  it("yoco-source and no-source count under yoco; manual counts by method", async () => {
    await seedOrder("o1", { status: "paid", source: "yoco", total: 300 });
    await seedOrder("o2", { status: "paid", total: 300 }); // no source → yoco
    await seedOrder("o3", { status: "paid", source: "manual", manualPaymentMethod: "eft", total: 300 });
    await seedOrder("o4", { status: "paid", source: "manual", manualPaymentMethod: "cash", total: 300 });

    const r = await buildAnalytics(null, null);
    expect(r.payments.yoco).toBe(2);
    expect(r.payments.eft).toBe(1);
    expect(r.payments.cash).toBe(1);
  });
});

describe("adminAnalytics — topCustomers", () => {
  it("sorted by totalSpend desc, capped at 5", async () => {
    for (let i = 1; i <= 7; i++) {
      await seedOrder(`o${i}`, { status: "paid", total: i * 100, customer: ALT_CUSTOMER(i) });
    }

    const r = await buildAnalytics(null, null);
    expect(r.topCustomers).toHaveLength(5);
    expect(r.topCustomers[0].email).toBe("c7@example.com"); // 700
    expect(r.topCustomers[4].email).toBe("c3@example.com"); // 300
  });

  it("aggregates multiple orders from same customer", async () => {
    await seedOrder("o1", { status: "paid", total: 300 }); // both use TEST_CUSTOMER email
    await seedOrder("o2", { status: "paid", total: 200 });

    const r = await buildAnalytics(null, null);
    expect(r.topCustomers).toHaveLength(1);
    expect(r.topCustomers[0].totalSpend).toBe(500);
    expect(r.topCustomers[0].orderCount).toBe(2);
  });
});

describe("adminAnalytics — lowStock", () => {
  it("includes items where currentStock <= reorderLevel, excludes others", async () => {
    await db.collection("inventory").doc("7a-natural").set(
      makeInventoryItem({ productId: "7a-natural", currentStock: 3, reorderLevel: 5 }),
    );
    await db.collection("inventory").doc("5a-black").set(
      makeInventoryItem({ productId: "5a-black", currentStock: 10, reorderLevel: 5 }),
    );
    await db.collection("inventory").doc("5b-natural").set(
      makeInventoryItem({ productId: "5b-natural", currentStock: 5, reorderLevel: 5 }),
    );

    const r = await buildAnalytics(null, null);
    const ids = r.lowStock.map((i) => i.productId);
    expect(ids).toContain("7a-natural");
    expect(ids).toContain("5b-natural"); // at threshold
    expect(ids).not.toContain("5a-black");
  });
});

describe("adminAnalytics — date range filter", () => {
  it("excludes orders and expenses outside the date window", async () => {
    const inRange = Timestamp.fromDate(new Date("2026-04-15"));
    const outRange = Timestamp.fromDate(new Date("2026-03-01"));

    await db.collection("orders").doc("in").set(makeOrder({ status: "paid", total: 400, createdAt: inRange }));
    await db.collection("orders").doc("out").set(makeOrder({ status: "paid", total: 999, createdAt: outRange }));
    await db.collection("expenses").add(makeExpense({ amount: 50, date: inRange }));
    await db.collection("expenses").add(makeExpense({ amount: 9999, date: outRange }));

    const r = await buildAnalytics(new Date("2026-04-01"), new Date("2026-04-30"));
    expect(r.kpis.grossRevenue).toBe(400);
    expect(r.kpis.totalExpenses).toBe(50);
    expect(r.kpis.totalOrders).toBe(1);
  });
});
