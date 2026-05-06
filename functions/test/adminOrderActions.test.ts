import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { clearFirestore, db, makeOrder, makeInventoryItem } from "./helpers";
import type { InventoryItem } from "../src/lib/firestore";

vi.mock("firebase-functions/params", () => ({
  defineSecret: () => ({ value: () => "test-secret" }),
  defineString: (_: string, opts?: { default?: string }) => ({ value: () => opts?.default ?? "" }),
}));
vi.mock("firebase-functions", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("firebase-functions/v2/https", () => ({
  onRequest: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock("../src/lib/resend", () => ({
  sendCancellationNotification: vi.fn().mockResolvedValue(undefined),
  sendCustomerReceipt: vi.fn().mockResolvedValue(undefined),
  sendShippingConfirmation: vi.fn().mockResolvedValue(undefined),
  sendMerchantNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/lib/auth", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ uid: "admin1", email: "admin@test.com" }),
  ADMIN_EMAILS: { value: () => "" },
}));

import { adminOrderActions } from "../src/adminOrderActions";
type HandlerFn = (req: unknown, res: unknown) => Promise<void>;
const handler = adminOrderActions as unknown as HandlerFn;

function cancelReq(orderId: string, reason = "Test cancel", notifyCustomer = false) {
  const body = JSON.stringify({ reason, notifyCustomer });
  return {
    method: "POST",
    path: `/api/admin/orders/${orderId}/cancel`,
    body: JSON.parse(body),
    get: (h: string) => (h.toLowerCase() === "authorization" ? "Bearer test-token" : undefined),
    rawBody: Buffer.from(body),
    ip: "127.0.0.1",
  };
}

function makeRes() {
  const res = {
    _status: 200 as number,
    _body: undefined as unknown,
    headersSent: false,
    status(c: number) { this._status = c; return this; },
    json(b: unknown) { this._body = b; this.headersSent = true; return this; },
    send(b: unknown) { this._body = b; this.headersSent = true; return this; },
    setHeader() { return this; },
  };
  return res;
}

async function seedInventory(productId: string, overrides: Partial<InventoryItem> = {}) {
  const item = makeInventoryItem({ productId, ...overrides });
  await db.collection("inventory").doc(productId).set({
    ...item,
    updatedAt: Timestamp.now(),
  });
}

beforeEach(async () => { await clearFirestore(); });

describe("adminOrderActions cancel — inventory credit-back", () => {
  it("credits inventory back when inventoryApplied=true", async () => {
    const orderId = "order-credit";
    await db.collection("orders").doc(orderId).set(
      makeOrder({ status: "paid", inventoryApplied: true }),
    );
    await seedInventory("7a-natural", { openingStock: 50, unitsSold: 10, currentStock: 40 });

    await handler(cancelReq(orderId), makeRes());

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    // Order had qty:2 → unitsSold should drop from 10 to 8
    expect(inv.unitsSold).toBe(8);
    expect(inv.currentStock).toBe(42); // 50 - 8

    const order = (await db.collection("orders").doc(orderId).get()).data();
    expect(order?.status).toBe("cancelled");
    expect(order?.inventoryApplied).toBe(false);
  });

  it("does NOT touch inventory when inventoryApplied is false (pending order)", async () => {
    const orderId = "order-pending-cancel";
    await db.collection("orders").doc(orderId).set(
      makeOrder({ status: "pending", inventoryApplied: false }),
    );
    await seedInventory("7a-natural", { openingStock: 50, unitsSold: 5, currentStock: 45 });

    await handler(cancelReq(orderId), makeRes());

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.unitsSold).toBe(5); // unchanged
    expect(inv.currentStock).toBe(45);
  });

  it("cancelling already-cancelled order is idempotent (no double credit)", async () => {
    const orderId = "order-already-cancelled";
    await db.collection("orders").doc(orderId).set(
      makeOrder({ status: "cancelled", inventoryApplied: false }),
    );
    await seedInventory("7a-natural", { openingStock: 50, unitsSold: 5, currentStock: 45 });

    const res = makeRes();
    await handler(cancelReq(orderId), res);

    expect(res._status).toBe(200);
    expect((res._body as Record<string, unknown>).already).toBe(true);
    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.unitsSold).toBe(5); // unchanged
  });
});

describe("adminOrderActions cancel — validation", () => {
  it("rejects reason longer than 500 chars", async () => {
    const orderId = "order-longreason";
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending" }));

    const res = makeRes();
    await handler(cancelReq(orderId, "x".repeat(501)), res);
    expect(res._status).toBe(400);
  });

  it("rejects missing reason field", async () => {
    const orderId = "order-noreason";
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending" }));

    const body = JSON.stringify({ notifyCustomer: false });
    const req = {
      method: "POST",
      path: `/api/admin/orders/${orderId}/cancel`,
      body: JSON.parse(body),
      get: (h: string) => (h.toLowerCase() === "authorization" ? "Bearer test-token" : undefined),
      rawBody: Buffer.from(body),
      ip: "127.0.0.1",
    };
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });
});
