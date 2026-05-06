import { getFirestore, Timestamp } from "firebase-admin/firestore";
import type { Order, Customer, OrderItem, InventoryItem, Expense } from "../src/lib/firestore";

export const db = getFirestore();

/** Wipe all emulator data between tests. Requires emulator to be running. */
export async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
  const resp = await fetch(
    `http://${host}/emulator/v1/projects/demo-drumsareme/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!resp.ok) throw new Error(`clearFirestore failed: ${resp.status}`);
}

export const TEST_CUSTOMER: Customer = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "0821234567",
  addressLine1: "1 Test St",
  city: "Cape Town",
  province: "Western Cape",
  postalCode: "8001",
};

export const TEST_ITEM: OrderItem = {
  productId: "7a-natural",
  name: "Keep Time 7A - Natural",
  qty: 2,
  unitPrice: 150,
  lineTotal: 300,
};

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    ref: "KT-20260506-0001",
    status: "pending",
    items: [TEST_ITEM],
    subtotal: 300,
    shipping: 100,
    total: 400,
    customer: TEST_CUSTOMER,
    yoco: { checkoutId: "chk_test" },
    createdAt: Timestamp.now(),
    ...overrides,
  };
}

export function makeInventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    productId: "7a-natural",
    openingStock: 50,
    unitsSold: 10,
    currentStock: 40,
    reorderLevel: 5,
    ...overrides,
  };
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    type: "materials",
    description: "Drumstick blanks",
    amount: 500,
    date: Timestamp.fromDate(new Date("2026-05-01")),
    createdAt: Timestamp.now(),
    ...overrides,
  };
}

/** Build a minimal mock request object for handler tests. */
export function mockReq(
  overrides: {
    method?: string;
    path?: string;
    body?: unknown;
    query?: Record<string, string>;
    rawBody?: Buffer;
    headers?: Record<string, string>;
  } = {},
) {
  const headers: Record<string, string> = overrides.headers ?? {};
  return {
    method: overrides.method ?? "GET",
    path: overrides.path ?? "/",
    body: overrides.body ?? {},
    query: overrides.query ?? {},
    rawBody: overrides.rawBody ?? Buffer.from(""),
    get: (h: string) => headers[h.toLowerCase()],
    ip: "127.0.0.1",
  };
}

/** Build a minimal mock response that captures status + body. */
export function mockRes() {
  const res = {
    _status: 200 as number,
    _body: undefined as unknown,
    _headers: {} as Record<string, string>,
    headersSent: false,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      this.headersSent = true;
      return this;
    },
    send(body: unknown) {
      this._body = body;
      this.headersSent = true;
      return this;
    },
    setHeader(k: string, v: string) {
      this._headers[k] = v;
      return this;
    },
  };
  return res;
}
