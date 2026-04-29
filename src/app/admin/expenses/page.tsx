"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import {
  AdminApiError,
  deleteExpense,
  listExpenses,
} from "@/lib/admin/api-client";
import type { ExpenseListItem } from "@/lib/admin/expenses-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import { formatZar } from "@/lib/admin/format";
import ExpenseForm from "@/components/admin/ExpenseForm";
import ExpenseTable from "@/components/admin/ExpenseTable";

export default function AdminExpensesPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [items, setItems] = useState<ExpenseListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listExpenses({ limit: 200 });
      setItems(response.items);
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
  }, [user]);

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

  const total = items.reduce((sum, item) => sum + item.amount, 0);

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

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}

      <ExpenseTable
        items={items}
        loading={loading}
        deletingId={deletingId}
        onDelete={handleDelete}
      />

      {items.length > 0 && (
        <div className="flex justify-end">
          <p className="text-sm text-muted">
            Total:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {formatZar(total)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
