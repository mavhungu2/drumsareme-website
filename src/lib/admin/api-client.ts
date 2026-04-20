import { ADMIN_API_BASE, getFirebaseAuth } from "@/lib/firebase-client";
import type {
  ListOrdersQuery,
  ListOrdersResponse,
  Order,
  OrderNote,
  OrderTracking,
} from "./orders-types";

export class AdminApiError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
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

async function readError(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as { error?: string; message?: string };
      if (typeof body.error === "string") return body.error;
      if (typeof body.message === "string") return body.message;
    } else {
      const text = await response.text();
      if (text) return text;
    }
  } catch {
    // fall through to default message
  }
  return `Request failed with status ${response.status}`;
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
    throw new AdminApiError(response.status, await readError(response));
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
    throw new AdminApiError(response.status, await readError(response));
  }
  return (await response.json()) as ResendReceiptResponse;
}
