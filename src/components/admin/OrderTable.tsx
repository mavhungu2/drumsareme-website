"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import type { OrderListItem } from "@/lib/admin/orders-types";
import { formatDateTime, formatZar } from "@/lib/admin/format";
import OrderStatusBadge from "./OrderStatusBadge";

interface OrderTableProps {
  orders: OrderListItem[];
  loading?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onRowClick: (order: OrderListItem) => void;
  onLoadMore?: () => void;
}

interface Column {
  key: string;
  label: string;
  className?: string;
  render: (order: OrderListItem) => React.ReactNode;
}

const COLUMNS: ReadonlyArray<Column> = [
  {
    key: "ref",
    label: "Ref",
    className: "font-mono text-sm text-foreground",
    render: (order) => order.ref,
  },
  {
    key: "date",
    label: "Date",
    className: "text-sm text-muted whitespace-nowrap",
    render: (order) => formatDateTime(order.createdAt),
  },
  {
    key: "status",
    label: "Status",
    render: (order) => <OrderStatusBadge status={order.status} />,
  },
  {
    key: "customer",
    label: "Customer",
    className: "text-sm",
    render: (order) => (
      <div className="flex flex-col">
        <span className="text-foreground">{order.customerName || "—"}</span>
        <span className="text-muted text-xs truncate max-w-[16rem]">
          {order.customerEmail}
        </span>
      </div>
    ),
  },
  {
    key: "city",
    label: "City",
    className: "text-sm text-muted",
    render: (order) => order.customerCity || "—",
  },
  {
    key: "items",
    label: "Items",
    className: "text-sm text-foreground tabular-nums text-right",
    render: (order) => order.itemCount,
  },
  {
    key: "total",
    label: "Total",
    className: "text-sm font-semibold text-foreground tabular-nums text-right",
    render: (order) => formatZar(order.total),
  },
];

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">No orders match the current filters.</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="border border-border rounded-2xl p-12 text-center">
      <Loader2
        size={18}
        className="animate-spin mx-auto text-muted"
        aria-hidden
      />
      <p className="mt-2 text-sm text-muted">Loading orders…</p>
    </div>
  );
}

export default function OrderTable({
  orders,
  loading,
  hasMore,
  loadingMore,
  onRowClick,
  onLoadMore,
}: OrderTableProps) {
  if (loading && orders.length === 0) return <LoadingState />;
  if (!loading && orders.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="hidden md:block overflow-hidden border border-border rounded-2xl bg-background">
        <table className="w-full text-left">
          <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-4 py-3 font-medium ${
                    col.className?.includes("text-right") ? "text-right" : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
              <th scope="col" className="w-10" aria-label="Open" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {orders.map((order) => (
              <tr
                key={order.id}
                onClick={() => onRowClick(order)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick(order);
                  }
                }}
                tabIndex={0}
                role="button"
                className="cursor-pointer hover:bg-surface focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 align-middle ${col.className ?? ""}`}
                  >
                    {col.render(order)}
                  </td>
                ))}
                <td className="px-4 py-3 text-muted">
                  <ChevronRight size={14} aria-hidden />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <button
              type="button"
              onClick={() => onRowClick(order)}
              className="w-full text-left bg-background border border-border rounded-2xl p-4 hover:border-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-foreground">
                    {order.ref}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="mt-3 text-sm text-foreground">
                {order.customerName || "—"}
              </div>
              <div className="text-xs text-muted truncate">
                {order.customerEmail}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatZar(order.total)}
                </span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {loadingMore && (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            )}
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
