"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { AdminApiError, getAnalytics } from "@/lib/admin/api-client";
import type { AnalyticsResponse } from "@/lib/admin/analytics-types";
import { EXPENSE_TYPE_LABEL } from "@/lib/admin/expenses-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import { formatZar } from "@/lib/admin/format";
import KpiCard from "@/components/admin/KpiCard";

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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function AdminReportsPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getAnalytics({
        from: dateInputToIsoStart(from),
        to: dateInputToIsoEnd(to),
      });
      setData(response);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load reports";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [from, to, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const productPerformance = useMemo(
    () => data?.productPerformance ?? [],
    [data],
  );
  const topCustomers = useMemo(() => data?.topCustomers ?? [], [data]);
  const expensesByType = useMemo(() => data?.expensesByType ?? [], [data]);
  const expensesByDescription = useMemo(
    () => data?.expensesByDescription ?? [],
    [data],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Reports
          </h1>
          <p className="mt-1 text-sm text-muted">
            Revenue, profit, expenses, and product performance for the selected
            range.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <RefreshCcw size={14} aria-hidden />
          Refresh
        </button>
      </div>

      <fieldset
        disabled={loading}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <legend className="sr-only">Report range</legend>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface transition-colors"
          >
            Clear
          </button>
        </div>
      </fieldset>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Gross Revenue"
          value={formatZar(data?.kpis.grossRevenue ?? 0)}
        />
        <KpiCard
          label="Total Expenses"
          value={formatZar(data?.kpis.totalExpenses ?? 0)}
          tone="negative"
        />
        <KpiCard
          label="Net Profit"
          value={formatZar(data?.kpis.netProfit ?? 0)}
          tone={
            (data?.kpis.netProfit ?? 0) >= 0 ? "positive" : "negative"
          }
        />
        <KpiCard
          label="Profit Margin"
          value={formatPercent(data?.kpis.profitMargin ?? 0)}
          tone={
            (data?.kpis.profitMargin ?? 0) >= 0 ? "positive" : "negative"
          }
        />
        <KpiCard
          label="Total Orders (paid)"
          value={data?.kpis.paidOrders ?? 0}
        />
        <KpiCard label="Units Sold" value={data?.kpis.unitsSold ?? 0} />
      </div>

      <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            Product performance
          </h2>
          <p className="mt-1 text-xs text-muted">
            Sorted by revenue in selected range.
          </p>
        </header>
        {productPerformance.length === 0 ? (
          <p className="text-sm text-muted">No sales in this range.</p>
        ) : (
          <div className="overflow-hidden border border-border rounded-xl">
            <table className="w-full text-left">
              <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium text-right">
                    Units
                  </th>
                  <th className="px-4 py-2 font-medium text-right">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {productPerformance.map((p) => (
                  <tr key={p.productId}>
                    <td className="px-4 py-2 align-middle text-sm text-foreground">
                      {p.name}
                    </td>
                    <td className="px-4 py-2 align-middle text-right text-sm tabular-nums">
                      {p.unitsSold}
                    </td>
                    <td className="px-4 py-2 align-middle text-right text-sm font-semibold tabular-nums">
                      {formatZar(p.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-4">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Expenses by type
            </h2>
            <p className="mt-1 text-xs text-muted">
              Sorted by amount in selected range.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {formatZar(data?.kpis.totalExpenses ?? 0)}
          </p>
        </header>
        {expensesByType.length === 0 ? (
          <p className="text-sm text-muted">No expenses in this range.</p>
        ) : (
          <ul className="space-y-3">
            {expensesByType.map((row) => (
              <li key={row.type} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-foreground">
                    {EXPENSE_TYPE_LABEL[row.type] ?? row.type}
                    <span className="ml-2 text-xs text-muted">
                      {row.count} {row.count === 1 ? "entry" : "entries"}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-foreground">
                      {formatZar(row.total)}
                    </span>
                    <span className="ml-2 text-xs text-muted">
                      {formatPercent(row.share)}
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-foreground/70"
                    style={{ width: `${Math.max(row.share * 100, 1.5)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            Expenses by description
          </h2>
          <p className="mt-1 text-xs text-muted">
            Entries sharing a description are grouped. Sorted by amount.
          </p>
        </header>
        {expensesByDescription.length === 0 ? (
          <p className="text-sm text-muted">No expenses in this range.</p>
        ) : (
          <div className="overflow-hidden border border-border rounded-xl">
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Entries
                    </th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expensesByDescription.map((row, index) => (
                    <tr key={`${row.description}-${index}`}>
                      <td className="px-4 py-2 align-middle text-sm text-foreground">
                        {row.description}
                      </td>
                      <td className="px-4 py-2 align-middle text-xs text-muted">
                        {row.types
                          .map((t) => EXPENSE_TYPE_LABEL[t] ?? t)
                          .join(", ")}
                      </td>
                      <td className="px-4 py-2 align-middle text-right text-sm tabular-nums">
                        {row.count}
                      </td>
                      <td className="px-4 py-2 align-middle text-right text-sm font-semibold tabular-nums">
                        {formatZar(row.total)}
                        <span className="ml-2 text-xs font-normal text-muted">
                          {formatPercent(row.share)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">
            Top 5 customers
          </h2>
        </header>
        {topCustomers.length === 0 ? (
          <p className="text-sm text-muted">No customer activity in this range.</p>
        ) : (
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
                {topCustomers.map((c) => (
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
        )}
      </section>
    </div>
  );
}
