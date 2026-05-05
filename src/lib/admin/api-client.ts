import { ADMIN_API_BASE, getFirebaseAuth } from "@/lib/firebase-client";
import type {
  AddAdminInput,
  AdminApiCode,
  AdminListItem,
  ListAdminsResponse,
  RemoveAdminResponse,
} from "./admins-types";
import type {
  ListOrdersQuery,
  ListOrdersResponse,
  Order,
  OrderNote,
  OrderTracking,
} from "./orders-types";
import type {
  InventoryListItem,
  ListInventoryResponse,
  UpsertInventoryInput,
} from "./inventory-types";
import type {
  CreateExpenseInput,
  ExpenseListItem,
  ListExpensesQuery,
  ListExpensesResponse,
} from "./expenses-types";
import type {
  AnalyticsQuery,
  AnalyticsResponse,
  ManualSaleInput,
  ManualSaleResponse,
  MarkPaidInput,
  MarkPaidResponse,
} from "./analytics-types";
import type {
  CreateProductInput,
  ListProductsResponse,
  ProductListItem,
  UpdateProductInput,
} from "./products-types";

export class AdminApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly code?: AdminApiCode;

  constructor(
    status: number,
    message: string,
    retryAfterSeconds?: number,
    code?: AdminApiCode,
  ) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.code = code;
  }
}

async function currentIdToken(forceRefresh = false): Promise<string> {
  const user = getFirebaseAuth().currentUser;
  if (!user) {
    throw new AdminApiError(401, "Not signed in");
  }
  return user.getIdToken(forceRefresh);
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const base = ADMIN_API_BASE ? ADMIN_API_BASE.replace(/\/+$/, "") : "";
  const url = `${base}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str === "") continue;
    params.append(key, str);
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

interface ErrorBody {
  message: string;
  code?: AdminApiCode;
}

async function readError(response: Response): Promise<ErrorBody> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        code?: AdminApiCode;
      };
      const message =
        (typeof body.error === "string" && body.error) ||
        (typeof body.message === "string" && body.message) ||
        `Request failed with status ${response.status}`;
      return { message, code: body.code };
    }
    const text = await response.text();
    if (text) return { message: text };
  } catch {
    // fall through to default message
  }
  return { message: `Request failed with status ${response.status}` };
}

async function requestJson<T>(input: string, init: RequestInit = {}): Promise<T> {
  const send = async (token: string): Promise<Response> =>
    fetch(input, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

  let response = await send(await currentIdToken(false));
  if (response.status === 401) {
    // Token may have expired between navigations; refresh once and retry.
    response = await send(await currentIdToken(true));
  }
  if (!response.ok) {
    const err = await readError(response);
    throw new AdminApiError(response.status, err.message, undefined, err.code);
  }
  return (await response.json()) as T;
}

export async function listOrders(
  params: ListOrdersQuery = {},
): Promise<ListOrdersResponse> {
  const url = buildUrl("/api/admin/orders", {
    status: params.status,
    q: params.q,
    from: params.from,
    to: params.to,
    limit: params.limit,
    cursor: params.cursor,
    includeArchived: params.includeArchived ? "true" : undefined,
  });
  return requestJson<ListOrdersResponse>(url, { method: "GET" });
}

export async function getOrder(id: string): Promise<Order> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(`/api/admin/orders/${encodeURIComponent(id)}`);
  return requestJson<Order>(url, { method: "GET" });
}

export interface MarkShippedInput {
  carrier: string;
  number: string;
  url?: string;
}

export interface MarkShippedResponse {
  ok?: true;
  already?: true;
  tracking: OrderTracking;
}

export async function markShipped(
  id: string,
  input: MarkShippedInput,
): Promise<MarkShippedResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(`/api/admin/orders/${encodeURIComponent(id)}/mark-shipped`);
  return requestJson<MarkShippedResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function addNote(
  id: string,
  body: string,
): Promise<{ note: OrderNote }> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(`/api/admin/orders/${encodeURIComponent(id)}/notes`);
  return requestJson<{ note: OrderNote }>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export interface CancelOrderInput {
  reason: string;
  notifyCustomer: boolean;
}

export type CancelOrderResponse =
  | { ok: true; status: "cancelled" }
  | { already: true; cancelledAt: string };

export async function cancelOrder(
  id: string,
  input: CancelOrderInput,
): Promise<CancelOrderResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(`/api/admin/orders/${encodeURIComponent(id)}/cancel`);
  return requestJson<CancelOrderResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type ArchiveOrderResponse =
  | { ok: true; id: string }
  | { already: true };

export async function archiveOrder(
  id: string,
): Promise<ArchiveOrderResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(`/api/admin/orders/${encodeURIComponent(id)}/archive`);
  return requestJson<ArchiveOrderResponse>(url, { method: "POST" });
}

export async function unarchiveOrder(
  id: string,
): Promise<ArchiveOrderResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(
    `/api/admin/orders/${encodeURIComponent(id)}/unarchive`,
  );
  return requestJson<ArchiveOrderResponse>(url, { method: "POST" });
}

export interface ResendReceiptResponse {
  ok: true;
  sentAt: string;
}

/**
 * Parses retry-after information from a 429 response.
 * Prefers a JSON body `{retryAfterSeconds}` field (server-specified), falling
 * back to the standard `Retry-After` header. Returns undefined when neither
 * source yields a positive finite integer.
 */
async function readRetryAfterSeconds(
  response: Response,
): Promise<number | undefined> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.clone().json()) as {
        retryAfterSeconds?: unknown;
      };
      const value = body.retryAfterSeconds;
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.ceil(value);
      }
    }
  } catch {
    // Ignore JSON parse errors; fall through to the header.
  }
  const header = response.headers.get("retry-after");
  if (header) {
    const numeric = Number.parseInt(header, 10);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return undefined;
}

function formatCooldown(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

export async function resendReceipt(
  id: string,
): Promise<ResendReceiptResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(
    `/api/admin/orders/${encodeURIComponent(id)}/resend-receipt`,
  );

  const send = async (token: string): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

  let response = await send(await currentIdToken(false));
  if (response.status === 401) {
    response = await send(await currentIdToken(true));
  }

  if (response.status === 429) {
    const retryAfterSeconds = await readRetryAfterSeconds(response);
    const message = retryAfterSeconds
      ? `Rate limited — wait ${formatCooldown(retryAfterSeconds)} before retrying.`
      : "Rate limited — try again shortly.";
    throw new AdminApiError(429, message, retryAfterSeconds);
  }

  if (!response.ok) {
    const err = await readError(response);
    throw new AdminApiError(response.status, err.message, undefined, err.code);
  }
  return (await response.json()) as ResendReceiptResponse;
}

export async function listAdmins(): Promise<ListAdminsResponse> {
  const url = buildUrl("/api/admin/admins");
  return requestJson<ListAdminsResponse>(url, { method: "GET" });
}

export async function addAdmin(input: AddAdminInput): Promise<AdminListItem> {
  const url = buildUrl("/api/admin/admins");
  return requestJson<AdminListItem>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function removeAdmin(
  emailLower: string,
): Promise<RemoveAdminResponse> {
  if (!emailLower) throw new AdminApiError(400, "Missing email");
  const url = buildUrl(
    `/api/admin/admins/${encodeURIComponent(emailLower)}`,
  );
  return requestJson<RemoveAdminResponse>(url, { method: "DELETE" });
}

export async function listInventory(): Promise<ListInventoryResponse> {
  const url = buildUrl("/api/admin/inventory");
  return requestJson<ListInventoryResponse>(url, { method: "GET" });
}

export async function upsertInventory(
  input: UpsertInventoryInput,
): Promise<InventoryListItem> {
  const url = buildUrl(
    `/api/admin/inventory/${encodeURIComponent(input.productId)}`,
  );
  return requestJson<InventoryListItem>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      openingStock: input.openingStock,
      reorderLevel: input.reorderLevel,
      supplier: input.supplier,
    }),
  });
}

export async function listExpenses(
  params: ListExpensesQuery = {},
): Promise<ListExpensesResponse> {
  const url = buildUrl("/api/admin/expenses", {
    from: params.from,
    to: params.to,
    limit: params.limit,
  });
  return requestJson<ListExpensesResponse>(url, { method: "GET" });
}

export async function createExpense(
  input: CreateExpenseInput,
): Promise<ExpenseListItem> {
  const url = buildUrl("/api/admin/expenses");
  return requestJson<ExpenseListItem>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteExpense(
  id: string,
): Promise<{ ok: true; id: string }> {
  if (!id) throw new AdminApiError(400, "Missing expense id");
  const url = buildUrl(`/api/admin/expenses/${encodeURIComponent(id)}`);
  return requestJson<{ ok: true; id: string }>(url, { method: "DELETE" });
}

export async function getAnalytics(
  params: AnalyticsQuery = {},
): Promise<AnalyticsResponse> {
  const url = buildUrl("/api/admin/analytics", {
    from: params.from,
    to: params.to,
  });
  return requestJson<AnalyticsResponse>(url, { method: "GET" });
}

export async function createManualSale(
  input: ManualSaleInput,
): Promise<ManualSaleResponse> {
  const url = buildUrl("/api/admin/sales/manual");
  return requestJson<ManualSaleResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function markOrderPaid(
  id: string,
  input: MarkPaidInput,
): Promise<MarkPaidResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(
    `/api/admin/orders/${encodeURIComponent(id)}/mark-paid`,
  );
  return requestJson<MarkPaidResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export type MarkCompletedResponse =
  | { ok: true; status: "completed" }
  | { already: true; completedAt: string | null };

export async function markCompleted(
  id: string,
): Promise<MarkCompletedResponse> {
  if (!id) throw new AdminApiError(400, "Missing order id");
  const url = buildUrl(
    `/api/admin/orders/${encodeURIComponent(id)}/mark-completed`,
  );
  return requestJson<MarkCompletedResponse>(url, { method: "POST" });
}

export async function listProducts(): Promise<ListProductsResponse> {
  const url = buildUrl("/api/admin/products");
  return requestJson<ListProductsResponse>(url, { method: "GET" });
}

export async function createProduct(
  input: CreateProductInput,
): Promise<ProductListItem> {
  const url = buildUrl("/api/admin/products");
  return requestJson<ProductListItem>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<ProductListItem> {
  if (!id) throw new AdminApiError(400, "Missing product id");
  const url = buildUrl(`/api/admin/products/${encodeURIComponent(id)}`);
  return requestJson<ProductListItem>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteProduct(
  id: string,
): Promise<{ ok: true; id: string }> {
  if (!id) throw new AdminApiError(400, "Missing product id");
  const url = buildUrl(`/api/admin/products/${encodeURIComponent(id)}`);
  return requestJson<{ ok: true; id: string }>(url, { method: "DELETE" });
}

export interface ProductImageUploadResponse {
  url: string;
  path: string;
}

export async function uploadProductImage(
  productId: string,
  file: File,
): Promise<ProductImageUploadResponse> {
  if (!productId) throw new AdminApiError(400, "Missing productId");
  const url = buildUrl("/api/admin/uploads/product-image");
  const form = new FormData();
  form.append("productId", productId);
  form.append("file", file, file.name);

  const send = async (token: string): Promise<Response> =>
    fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      body: form,
    });

  let response = await send(await currentIdToken(false));
  if (response.status === 401) {
    response = await send(await currentIdToken(true));
  }
  if (!response.ok) {
    const err = await readError(response);
    throw new AdminApiError(response.status, err.message, undefined, err.code);
  }
  return (await response.json()) as ProductImageUploadResponse;
}
