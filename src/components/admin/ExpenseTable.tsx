"use client";

import { Loader2, Trash2 } from "lucide-react";
import {
  EXPENSE_TYPE_LABEL,
  type ExpenseListItem,
} from "@/lib/admin/expenses-types";
import { formatDate, formatZar } from "@/lib/admin/format";

interface ExpenseTableProps {
  items: ExpenseListItem[];
  loading?: boolean;
  deletingId: string | null;
  onDelete: (id: string) => void;
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">No expenses logged yet.</p>
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
      <p className="mt-2 text-sm text-muted">Loading expenses…</p>
    </div>
  );
}

export default function ExpenseTable({
  items,
  loading,
  deletingId,
  onDelete,
}: ExpenseTableProps) {
  if (loading && items.length === 0) return <LoadingState />;
  if (!loading && items.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden border border-border rounded-2xl bg-background">
      <table className="w-full text-left">
        <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Date</th>
            <th scope="col" className="px-4 py-3 font-medium">Type</th>
            <th scope="col" className="px-4 py-3 font-medium">Description</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">
              Amount
            </th>
            <th scope="col" className="w-10" aria-label="Delete" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-surface">
              <td className="px-4 py-3 align-middle text-sm text-muted whitespace-nowrap">
                {formatDate(item.date)}
              </td>
              <td className="px-4 py-3 align-middle text-sm text-foreground">
                {EXPENSE_TYPE_LABEL[item.type]}
              </td>
              <td className="px-4 py-3 align-middle text-sm text-foreground">
                {item.description}
              </td>
              <td className="px-4 py-3 align-middle text-right text-sm font-semibold tabular-nums">
                {formatZar(item.amount)}
              </td>
              <td className="px-4 py-3 align-middle">
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  disabled={deletingId === item.id}
                  aria-label={`Delete expense ${item.description}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {deletingId === item.id ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <Trash2 size={14} aria-hidden />
                  )}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
