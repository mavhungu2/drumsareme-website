import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { clearFirestore, db, makeOrder, TEST_ITEM } from "./helpers";
import type { InventoryItem } from "../src/lib/firestore";

// vi.mock calls are hoisted before imports by vitest's transformer.
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
vi.mock("../src/lib/yoco", () => ({ verifyYocoSignature: () => true }));
vi.mock("../src/lib/resend", () => ({
  sendCustomerReceipt: vi.fn().mockResolvedValue(undefined),
  sendMerchantNotification: vi.fn().mockResolvedValue(undefined),
}));

// Because onRequest is mocked to return the handler directly, yocoWebhook IS the handler.
import { yocoWebhook } from "../src/yocoWebhook";
type HandlerFn = (req: unknown, res: unknown) => Promise<void>;
const handler = yocoWebhook as unknown as HandlerFn;

function makeWebhookReq(orderId: string, eventType = "payment.succeeded", paymentId = "pay_123") {
  const body = JSON.stringify({
    type: eventType,
    payload: { id: paymentId, metadata: { orderId } },
  });
  return {
    method: "POST",
    path: "/",
    rawBody: Buffer.from(body),
    get: (h: string) => {
      const map: Record<string, string> = {
        "webhook-id": "wh_test",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,test-sig",
      };
      return map[h];
    },
    ip: "127.0.0.1",
  };
}

function makeRes() {
  const res = {
    _status: 200 as number,
    _body: undefined as unknown,
    status(c: number) { this._status = c; return this; },
    send(b: unknown) { this._body = b; return this; },
    json(b: unknown) { this._body = b; return this; },
  };
  return res;
}

async function seedInventory(productId: string, openingStock: number, unitsSold = 0) {
  await db.collection("inventory").doc(productId).set({
    productId,
    openingStock,
    unitsSold,
    currentStock: openingStock - unitsSold,
    updatedAt: Timestamp.now(),
  });
}

beforeEach(async () => { await clearFirestore(); });

describe("yocoWebhook — payment.succeeded inventory decrement", () => {
  it("single-item order: increments unitsSold, sets inventoryApplied on order", async () => {
    const orderId = "order-single";
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending" }));
    await seedInventory("7a-natural", 50, 10);

    const res = makeRes();
    await handler(makeWebhookReq(orderId), res);

    expect(res._status).toBe(200);
    expect(res._body).toBe("OK");

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.unitsSold).toBe(12); // 10 existing + 2 from order
    expect(inv.currentStock).toBe(38); // 50 - 12

    const order = (await db.collection("orders").doc(orderId).get()).data();
    expect(order?.status).toBe("paid");
    expect(order?.inventoryApplied).toBe(true);
  });

  it("multi-item order: all items decrement in one transaction", async () => {
    const orderId = "order-multi";
    const items = [
      { productId: "7a-natural", name: "7A", qty: 3, unitPrice: 150, lineTotal: 450 },
      { productId: "5a-black", name: "5A Black", qty: 1, unitPrice: 150, lineTotal: 150 },
    ];
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending", items }));
    await seedInventory("7a-natural", 20, 0);
    await seedInventory("5a-black", 10, 2);

    await handler(makeWebhookReq(orderId), makeRes());

    const inv1 = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv1.unitsSold).toBe(3);
    expect(inv1.currentStock).toBe(17);

    const inv2 = (await db.collection("inventory").doc("5a-black").get()).data() as InventoryItem;
    expect(inv2.unitsSold).toBe(3); // 2 + 1
    expect(inv2.currentStock).toBe(7); // 10 - 3
  });

  it("item with no inventory doc: creates doc with openingStock:0", async () => {
    const orderId = "order-noinv";
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending" }));

    await handler(makeWebhookReq(orderId), makeRes());

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.openingStock).toBe(0);
    expect(inv.unitsSold).toBe(TEST_ITEM.qty); // 2
    expect(inv.currentStock).toBe(-2);
  });

  it("idempotency: double delivery does NOT double-decrement unitsSold", async () => {
    const orderId = "order-idempotent";
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending" }));
    await seedInventory("7a-natural", 50, 0);

    await handler(makeWebhookReq(orderId), makeRes());
    const res2 = makeRes();
    await handler(makeWebhookReq(orderId), res2);

    expect(res2._body).toBe("Already paid");

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.unitsSold).toBe(2); // incremented exactly once
  });

  it("already-paid order short-circuits without touching inventory", async () => {
    const orderId = "order-alreadypaid";
    await db.collection("orders").doc(orderId).set(
      makeOrder({ status: "paid", inventoryApplied: true }),
    );
    await seedInventory("7a-natural", 50, 5);

    await handler(makeWebhookReq(orderId), makeRes());

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.unitsSold).toBe(5); // unchanged
  });
});

describe("yocoWebhook — payment.failed", () => {
  it("marks order failed and does not touch inventory", async () => {
    const orderId = "order-fail";
    await db.collection("orders").doc(orderId).set(makeOrder({ status: "pending" }));
    await seedInventory("7a-natural", 50, 0);

    const body = JSON.stringify({
      type: "payment.failed",
      payload: { failureReason: "insufficient_funds", metadata: { orderId } },
    });
    const req = { ...makeWebhookReq(orderId, "payment.failed"), rawBody: Buffer.from(body) };
    await handler(req, makeRes());

    const order = (await db.collection("orders").doc(orderId).get()).data();
    expect(order?.status).toBe("failed");

    const inv = (await db.collection("inventory").doc("7a-natural").get()).data() as InventoryItem;
    expect(inv.unitsSold).toBe(0); // unchanged
  });
});
