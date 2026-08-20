"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCcw, Search } from "lucide-react";
import {
  AdminApiError,
  deleteExpense,
  listExpenses,
} from "@/lib/admin/api-client";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABEL,
  type ExpenseListItem,
  type ExpenseType,
} from "@/lib/admin/expenses-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import { formatZar } from "@/lib/admin/format";
import ExpenseForm from "@/components/admin/ExpenseForm";
import ExpenseTable from "@/components/admin/ExpenseTable";

type TypeFilter = ExpenseType | "all";

/** Page size — the server caps at 500. */
const PAGE_LIMIT = 500;

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

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function AdminExpensesPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [items, setItems] = useState<ExpenseListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [exact, setExact] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Server-side filters.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // Client-side filter over the loaded page (Firestore has no substring search).
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listExpenses({
        from: dateInputToIsoStart(from),
        to: dateInputToIsoEnd(to),
        type: typeFilter,
        limit: PAGE_LIMIT,
      });
      setItems(response.items);
      setTotal(response.total);
      setCount(response.count);
      setTruncated(response.truncated);
      setExact(response.exact);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load expenses";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [from, to, typeFilter, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const handleDelete = useCallback(
    async (id: string) => {
      const confirmed = window.confirm(
        "Delete this expense? This cannot be undone.",
      );
      if (!confirmed) return;
      setDeletingId(id);
      setError(null);
      try {
        await deleteExpense(id);
        await refresh();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Delete failed";
        setError(message);
      } finally {
        setDeletingId(null);
      }
    },
    [refresh],
  );

  const searchTerm = search.trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!searchTerm) return items;
    return items.filter((item) =>
      item.description.toLowerCase().includes(searchTerm),
    );
  }, [items, searchTerm]);

  const searchTotal = useMemo(
    () =>
      Math.round(
        visibleItems.reduce((sum, item) => sum + item.amount, 0) * 100,
      ) / 100,
    [visibleItems],
  );

  const hasFilters =
    from !== "" || to !== "" || typeFilter !== "all" || search !== "";

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setTypeFilter("all");
    setSearch("");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Expenses
          </h1>
          <p className="mt-1 text-sm text-muted">
            Log running costs. Total feeds the dashboard&rsquo;s net profit.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Refresh expenses"
        >
          <RefreshCcw size={14} aria-hidden />
          Refresh
        </button>
      </div>

      <ExpenseForm onAdded={refresh} />

      <fieldset
        disabled={loading}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
      >
        <legend className="sr-only">Filter expenses</legend>
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
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>Type</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className={FIELD_CLASS}
          >
            <option value="all">All types</option>
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXPENSE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>Description</span>
          <span className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search descriptions"
              className={`${FIELD_CLASS} pl-9`}
            />
          </span>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface disabled:opacity-40 transition-colors"
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

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground tabular-nums">
            {count}
          </span>{" "}
          {count === 1 ? "expense" : "expenses"} in range
          {searchTerm && (
            <>
              {" · "}
              <span className="font-semibold text-foreground tabular-nums">
                {visibleItems.length}
              </span>{" "}
              matching &ldquo;{search.trim()}&rdquo;
            </>
          )}
        </p>
        <p className="text-sm text-muted">
          {searchTerm ? "Matched total" : "Total"}:{" "}
          <span className="text-base font-semibold text-foreground tabular-nums">
            {formatZar(searchTerm ? searchTotal : total)}
          </span>
          {searchTerm && (
            <span className="ml-2 text-xs">of {formatZar(total)} in range</span>
          )}
          {!exact && !searchTerm && (
            <span className="ml-2 text-xs text-amber-700">(partial)</span>
          )}
        </p>
      </div>

      {truncated && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Showing the {items.length} most recent of {count} matching expenses.
          Narrow the date range to reach older entries — the total above still
          covers all {count}.
          {searchTerm
            ? " Description search only looks at the rows loaded here."
            : ""}
        </p>
      )}

      <ExpenseTable
        items={visibleItems}
        loading={loading}
        deletingId={deletingId}
        onDelete={handleDelete}
      />
    </div>
  );
}
