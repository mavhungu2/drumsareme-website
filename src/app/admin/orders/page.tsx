"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { AdminApiError, listOrders } from "@/lib/admin/api-client";
import type { ListOrdersQuery, OrderListItem } from "@/lib/admin/orders-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import OrderTable from "@/components/admin/OrderTable";
import OrderFilters, {
  type OrderFiltersValue,
} from "@/components/admin/OrderFilters";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

const INITIAL_FILTERS: OrderFiltersValue = {
  status: "",
  q: "",
  from: "",
  to: "",
  hideCancelled: false,
};

function dateInputToIsoStart(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function dateInputToIsoEnd(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function buildQuery(
  filters: OrderFiltersValue,
  debouncedQ: string,
): ListOrdersQuery {
  return {
    status: filters.status || undefined,
    q: debouncedQ.trim() || undefined,
    from: dateInputToIsoStart(filters.from),
    to: dateInputToIsoEnd(filters.to),
    limit: PAGE_SIZE,
  };
}

function filterVisible(
  orders: OrderListItem[],
  hideCancelled: boolean,
): OrderListItem[] {
  return hideCancelled
    ? orders.filter((order) => order.status !== "cancelled")
    : orders;
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAdminAuth();
  const [filters, setFilters] = useState<OrderFiltersValue>(INITIAL_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedQ(filters.q),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [filters.q]);

  const query = useMemo(
    () => buildQuery(filters, debouncedQ),
    [filters, debouncedQ],
  );

  const fetchInitial = useCallback(async () => {
    if (!user) return;
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await listOrders(query);
      if (id !== requestIdRef.current) return;
      setOrders(response.orders);
      setNextCursor(response.nextCursor);
    } catch (err) {
      if (id !== requestIdRef.current) return;
      const message =
        err instanceof AdminApiError
          ? err.status === 403
            ? "Your account is not authorised to access the admin dashboard."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load orders";
      setError(message);
      setOrders([]);
      setNextCursor(null);
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, [user, query]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchInitial();
  }, [authLoading, user, fetchInitial]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await listOrders({ ...query, cursor: nextCursor });
      setOrders((prev) => [...prev, ...response.orders]);
      setNextCursor(response.nextCursor);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load more orders";
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, query]);

  const handleRowClick = useCallback(
    (order: OrderListItem) => {
      router.push(`/admin/orders/detail/?id=${encodeURIComponent(order.id)}`);
    },
    [router],
  );

  const visibleOrders = useMemo(
    () => filterVisible(orders, filters.hideCancelled),
    [orders, filters.hideCancelled],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Orders
          </h1>
          <p className="mt-1 text-sm text-muted">
            Review and filter customer orders.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchInitial}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Refresh orders"
        >
          <RefreshCcw size={14} aria-hidden />
          Refresh
        </button>
      </div>

      <OrderFilters
        value={filters}
        onChange={setFilters}
        disabled={loading && orders.length === 0}
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <OrderTable
        orders={visibleOrders}
        loading={loading}
        hasMore={Boolean(nextCursor)}
        loadingMore={loadingMore}
        onRowClick={handleRowClick}
        onLoadMore={handleLoadMore}
      />
    </div>
  );
}
