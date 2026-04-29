"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, RefreshCcw } from "lucide-react";
import { AdminApiError, getAnalytics } from "@/lib/admin/api-client";
import type { AnalyticsResponse } from "@/lib/admin/analytics-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import { formatZar } from "@/lib/admin/format";
import KpiCard from "@/components/admin/KpiCard";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getAnalytics();
      setData(response);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.status === 403
            ? "Your account is not authorised to access the admin dashboard."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load dashboard";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted">
            Lifetime totals across Yoco and manual sales.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/orders/manual/"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-foreground text-sm font-medium text-background hover:bg-foreground/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Record manual sale
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Refresh dashboard"
          >
            <RefreshCcw size={14} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total sales revenue"
          value={formatZar(data?.kpis.grossRevenue ?? 0)}
        />
        <KpiCard label="Units sold" value={data?.kpis.unitsSold ?? 0} />
        <KpiCard
          label="Net profit"
          value={formatZar(data?.kpis.netProfit ?? 0)}
          tone={(data?.kpis.netProfit ?? 0) >= 0 ? "positive" : "negative"}
          hint={`Margin ${formatPercent(data?.kpis.profitMargin ?? 0)}`}
        />
        <KpiCard
          label="Total orders (paid)"
          value={data?.kpis.paidOrders ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            Payment method breakdown
          </h2>
          <ul className="space-y-2 text-sm">
            {(["cash", "card", "eft", "yoco"] as const).map((key) => (
              <li
                key={key}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <span className="text-muted capitalize">{key}</span>
                <span className="font-semibold tabular-nums">
                  {data?.payments[key] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            Order status
          </h2>
          <ul className="space-y-2 text-sm">
            {(
              ["pending", "paid", "shipped", "failed", "cancelled"] as const
            ).map((status) => (
              <li
                key={status}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <span className="text-muted capitalize">{status}</span>
                <span className="font-semibold tabular-nums">
                  {data?.statuses[status] ?? 0}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-3">
          <header>
            <h2 className="text-base font-semibold text-foreground">
              Best-selling model
            </h2>
          </header>
          {data?.bestSeller ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-foreground">
                {data.bestSeller.name}
              </p>
              <p className="text-sm text-muted">
                {data.bestSeller.unitsSold} units ·{" "}
                {formatZar(data.bestSeller.revenue)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">No sales yet.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Low stock alerts
            </h2>
            <Link
              href="/admin/inventory/"
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Manage inventory →
            </Link>
          </header>
          {data?.lowStock && data.lowStock.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {data.lowStock.map((item) => (
                <li
                  key={item.productId}
                  className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <AlertTriangle
                      size={14}
                      className="text-amber-600"
                      aria-hidden
                    />
                    {item.name}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {item.currentStock} / reorder ≤ {item.reorderLevel}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">All SKUs are above reorder levels.</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            Top 5 customers
          </h2>
          <Link
            href="/admin/customers/"
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            View all →
          </Link>
        </header>
        {data?.topCustomers && data.topCustomers.length > 0 ? (
          <div className="overflow-hidden border border-border rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Customer</th>
                  <th className="px-4 py-2 font-medium text-right">Orders</th>
                  <th className="px-4 py-2 font-medium text-right">Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.topCustomers.map((c) => (
                  <tr key={`${c.email}-${c.phone}-${c.name}`}>
                    <td className="px-4 py-2 align-middle text-sm text-foreground">
                      {c.name || "—"}
                    </td>
                    <td className="px-4 py-2 align-middle text-right text-sm tabular-nums">
                      {c.totalOrders}
                    </td>
                    <td className="px-4 py-2 align-middle text-right text-sm font-semibold tabular-nums">
                      {formatZar(c.totalSpend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No customers yet.</p>
        )}
      </section>
    </div>
  );
}
