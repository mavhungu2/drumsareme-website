/**
 * End-to-end smoke test for every admin endpoint deployed at
 * https://drumsareme-website.web.app/api/admin/...
 *
 * Two modes:
 *   1. Unauthenticated probe (default): hits every endpoint without a token
 *      and asserts a 401 response. This proves the route is wired and the
 *      auth gate works. Run with:
 *          GCLOUD_PROJECT=drumsareme-website npx ts-node src/scripts/smoke.ts
 *
 *   2. Full authenticated suite: exercises CRUD with cleanup. Requires the
 *      caller to provide a Firebase ID token from a signed-in admin. Get
 *      one in the browser DevTools console while logged in to the admin:
 *          await firebase.auth().currentUser.getIdToken()
 *      Then run:
 *          ID_TOKEN=ey... npx ts-node src/scripts/smoke.ts
 */
import { db } from "../lib/firestore";

const BASE = "https://drumsareme-website.web.app";
const TEST_ADMIN_EMAIL = "smoke-test-temp@drumsareme.test";
const TEST_PRODUCT_SLUG = "smoke-test-product";

interface TestResult {
  label: string;
  expected: number | "2xx";
  status: number;
  ok: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function record(
  label: string,
  status: number,
  expected: number | "2xx" = "2xx",
  detail?: string,
) {
  const ok =
    expected === "2xx"
      ? status >= 200 && status < 300
      : status === expected;
  results.push({ label, expected, status, ok, detail });
  const tag = ok ? "✓" : "✗";
  console.log(
    `${tag} ${label.padEnd(60)} ${status}${detail ? `  ${detail}` : ""}`,
  );
}

async function call(
  method: string,
  path: string,
  token: string | null,
  body?: unknown,
  contentType = "application/json",
): Promise<{ status: number; data: unknown; text?: string }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && contentType === "application/json") {
    headers["Content-Type"] = contentType;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body:
      body === undefined
        ? undefined
        : typeof body === "string" || body instanceof FormData
          ? (body as string | FormData)
          : JSON.stringify(body),
  });
  let data: unknown = null;
  let text: string | undefined;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    text = await res.text();
  }
  return { status: res.status, data, text };
}

async function probeUnauthenticated() {
  const probes: Array<[string, string]> = [
    ["GET", "/api/admin/admins"],
    ["POST", "/api/admin/admins"],
    ["DELETE", "/api/admin/admins/whatever@example.com"],
    ["GET", "/api/admin/orders"],
    ["GET", "/api/admin/orders/anything"],
    ["DELETE", "/api/admin/orders/anything"],
    ["POST", "/api/admin/orders/anything/notes"],
    ["POST", "/api/admin/orders/anything/cancel"],
    ["POST", "/api/admin/orders/anything/mark-paid"],
    ["POST", "/api/admin/orders/anything/mark-shipped"],
    ["POST", "/api/admin/orders/anything/mark-completed"],
    ["POST", "/api/admin/orders/anything/resend-receipt"],
    ["GET", "/api/admin/inventory"],
    ["PATCH", "/api/admin/inventory/anything"],
    ["GET", "/api/admin/expenses"],
    ["POST", "/api/admin/expenses"],
    ["DELETE", "/api/admin/expenses/anything"],
    ["GET", "/api/admin/analytics"],
    ["POST", "/api/admin/sales/manual"],
    ["GET", "/api/admin/products"],
    ["POST", "/api/admin/products"],
    ["PATCH", "/api/admin/products/anything"],
    ["DELETE", "/api/admin/products/anything"],
    ["POST", "/api/admin/uploads/product-image"],
  ];
  console.log("== Unauthenticated probes (expect 401) ==\n");
  for (const [method, path] of probes) {
    const r = await call(method, path, null);
    record(`${method} ${path}`, r.status, 401);
  }
}

async function authenticatedSuite(token: string) {
  console.log("\n== Authenticated suite ==\n");

  // === ADMINS ===
  const adminsList = await call("GET", "/api/admin/admins", token);
  record("GET /api/admin/admins", adminsList.status);

  const addAdmin = await call("POST", "/api/admin/admins", token, {
    email: TEST_ADMIN_EMAIL,
  });
  record("POST /api/admin/admins (add temp)", addAdmin.status, 201);

  const removeAdmin = await call(
    "DELETE",
    `/api/admin/admins/${encodeURIComponent(TEST_ADMIN_EMAIL)}`,
    token,
  );
  record("DELETE /api/admin/admins/:email", removeAdmin.status);

  // === PRODUCTS ===
  const productsList = await call("GET", "/api/admin/products", token);
  record("GET /api/admin/products", productsList.status);

  const createProduct = await call("POST", "/api/admin/products", token, {
    slug: TEST_PRODUCT_SLUG,
    name: "Smoke Test Product",
    size: "TEST",
    color: "Smoke",
    price: 999,
    description: "Created by smoke test — safe to delete.",
    features: ["Test feature"],
    image: "/images/gallery/IMG_7489.jpg",
    inStock: true,
    sortOrder: 9999,
  });
  record("POST /api/admin/products (create)", createProduct.status, 201);

  const patchProduct = await call(
    "PATCH",
    `/api/admin/products/${TEST_PRODUCT_SLUG}`,
    token,
    { price: 1, inStock: false },
  );
  record("PATCH /api/admin/products/:id", patchProduct.status);

  // === INVENTORY ===
  const inventoryList = await call("GET", "/api/admin/inventory", token);
  record("GET /api/admin/inventory", inventoryList.status);

  const existing = (
    inventoryList.data as {
      items?: Array<{
        productId: string;
        openingStock: number;
        reorderLevel: number;
        supplier?: string;
      }>;
    }
  ).items?.find((i) => i.productId === "5a-natural");
  if (existing) {
    const inventoryPatch = await call(
      "PATCH",
      "/api/admin/inventory/5a-natural",
      token,
      {
        openingStock: existing.openingStock,
        reorderLevel: existing.reorderLevel,
        supplier: existing.supplier,
      },
    );
    record("PATCH /api/admin/inventory/:productId", inventoryPatch.status);
  }

  // === EXPENSES ===
  const expensesList = await call("GET", "/api/admin/expenses", token);
  record("GET /api/admin/expenses", expensesList.status);

  const createExpense = await call("POST", "/api/admin/expenses", token, {
    date: new Date().toISOString(),
    type: "other",
    description: "Smoke test — safe to delete",
    amount: 0.01,
  });
  record("POST /api/admin/expenses (create)", createExpense.status, 201);

  const expenseId = (createExpense.data as { id?: string } | null)?.id;
  if (expenseId) {
    const deleteExpense = await call(
      "DELETE",
      `/api/admin/expenses/${expenseId}`,
      token,
    );
    record("DELETE /api/admin/expenses/:id", deleteExpense.status);
  }

  // === ANALYTICS ===
  const analytics = await call("GET", "/api/admin/analytics", token);
  record("GET /api/admin/analytics", analytics.status);

  // === ORDERS LIST ===
  const ordersList = await call(
    "GET",
    "/api/admin/orders?limit=5",
    token,
  );
  record("GET /api/admin/orders", ordersList.status);

  // === MANUAL SALE pending → mark-paid → cancel cycle ===
  const manualSale = await call("POST", "/api/admin/sales/manual", token, {
    customer: {
      firstName: "Smoke",
      lastName: "Test",
      phone: "0000000000",
    },
    items: [{ productId: "7a-natural", qty: 1 }],
  });
  record("POST /api/admin/sales/manual (pending)", manualSale.status, 201);

  const manualOrderId = (manualSale.data as { id?: string } | null)?.id;
  if (manualOrderId) {
    const getOrder = await call(
      "GET",
      `/api/admin/orders/${manualOrderId}`,
      token,
    );
    record("GET /api/admin/orders/:id", getOrder.status);

    const addNote = await call(
      "POST",
      `/api/admin/orders/${manualOrderId}/notes`,
      token,
      { body: "Smoke test note" },
    );
    record("POST /api/admin/orders/:id/notes", addNote.status, 201);

    const markPaid = await call(
      "POST",
      `/api/admin/orders/${manualOrderId}/mark-paid`,
      token,
      {
        manualPaymentMethod: "cash",
        fulfilment: "collection",
        deliveryFee: 0,
      },
    );
    record("POST /api/admin/orders/:id/mark-paid", markPaid.status);

    const markPaidAgain = await call(
      "POST",
      `/api/admin/orders/${manualOrderId}/mark-paid`,
      token,
      {
        manualPaymentMethod: "cash",
        fulfilment: "collection",
        deliveryFee: 0,
      },
    );
    record(
      "POST /api/admin/orders/:id/mark-paid (idempotent)",
      markPaidAgain.status,
    );

    const cancel = await call(
      "POST",
      `/api/admin/orders/${manualOrderId}/cancel`,
      token,
      { reason: "Smoke test cleanup", notifyCustomer: false },
    );
    record("POST /api/admin/orders/:id/cancel", cancel.status);

    const resend = await call(
      "POST",
      `/api/admin/orders/${manualOrderId}/resend-receipt`,
      token,
    );
    record(
      "POST /api/admin/orders/:id/resend-receipt (expects 409)",
      resend.status,
      409,
    );

    const markShipped = await call(
      "POST",
      `/api/admin/orders/${manualOrderId}/mark-shipped`,
      token,
      { carrier: "Test", number: "TEST-123" },
    );
    record(
      "POST /api/admin/orders/:id/mark-shipped (expects 409)",
      markShipped.status,
      409,
    );
  }

  // === IMAGE UPLOAD ===
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
    "base64",
  );
  const form = new FormData();
  form.append("productId", TEST_PRODUCT_SLUG);
  form.append(
    "file",
    new Blob([png], { type: "image/png" }),
    "smoke-test-1x1.png",
  );
  const upload = await call(
    "POST",
    "/api/admin/uploads/product-image",
    token,
    form,
    "multipart/form-data",
  );
  record("POST /api/admin/uploads/product-image", upload.status);

  // === CLEANUP ===
  const deleteProduct = await call(
    "DELETE",
    `/api/admin/products/${TEST_PRODUCT_SLUG}`,
    token,
  );
  record("DELETE /api/admin/products/:id", deleteProduct.status);

  if (manualOrderId) {
    await db.collection("orders").doc(manualOrderId).delete();
    console.log("Cleaned up smoke order doc:", manualOrderId);
  }
}

async function main() {
  await probeUnauthenticated();

  const idToken = process.env.ID_TOKEN;
  if (idToken) {
    await authenticatedSuite(idToken);
  } else {
    console.log(
      "\nSkipping authenticated suite. To run it, paste a Firebase ID token:",
    );
    console.log(
      "  In the admin browser DevTools console while signed in:",
    );
    console.log(
      "    firebase.auth().currentUser.getIdToken().then(t => copy(t))",
    );
    console.log(
      "  Then run:",
    );
    console.log(
      "    ID_TOKEN=<paste> GCLOUD_PROJECT=drumsareme-website npx ts-node src/scripts/smoke.ts",
    );
  }

  console.log("\n──────────── Summary ────────────");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(
        `  ${r.label}: got ${r.status}, expected ${r.expected}${r.detail ? ` (${r.detail})` : ""}`,
      );
    }
    process.exit(1);
  }
  console.log("All checks passed ✓");
}

main().catch((err) => {
  console.error("\nSmoke test crashed:", err);
  process.exit(1);
});
