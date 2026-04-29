"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { ProductListItem } from "@/lib/admin/products-types";
import { formatDateTime, formatZar } from "@/lib/admin/format";

interface ProductTableProps {
  items: ProductListItem[];
  loading?: boolean;
  busyId: string | null;
  onEdit: (product: ProductListItem) => void;
  onDelete: (product: ProductListItem) => void;
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">No products yet.</p>
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
      <p className="mt-2 text-sm text-muted">Loading products…</p>
    </div>
  );
}

export default function ProductTable({
  items,
  loading,
  busyId,
  onEdit,
  onDelete,
}: ProductTableProps) {
  if (loading && items.length === 0) return <LoadingState />;
  if (!loading && items.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden border border-border rounded-2xl bg-background">
      <table className="w-full text-left">
        <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Product</th>
            <th scope="col" className="px-4 py-3 font-medium">Slug</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Price</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Order</th>
            <th scope="col" className="px-4 py-3 font-medium">Updated</th>
            <th scope="col" className="w-20" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-surface">
              <td className="px-4 py-3 align-middle">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {item.name}
                  </span>
                  <span className="text-xs text-muted">
                    {item.size} · {item.color}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 align-middle text-xs font-mono text-muted">
                {item.slug}
              </td>
              <td className="px-4 py-3 align-middle text-right text-sm font-semibold tabular-nums">
                {formatZar(item.price)}
              </td>
              <td className="px-4 py-3 align-middle">
                {item.inStock ? (
                  <span className="inline-flex items-center rounded-full border border-green/30 bg-green-light/20 px-2.5 py-0.5 text-xs font-medium text-green">
                    In stock
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    Hidden
                  </span>
                )}
              </td>
              <td className="px-4 py-3 align-middle text-right text-sm text-muted tabular-nums">
                {item.sortOrder}
              </td>
              <td className="px-4 py-3 align-middle text-xs text-muted whitespace-nowrap">
                {formatDateTime(item.updatedAt)}
              </td>
              <td className="px-4 py-3 align-middle">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    disabled={busyId === item.id}
                    aria-label={`Edit ${item.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    disabled={busyId === item.id}
                    aria-label={`Delete ${item.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {busyId === item.id ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                      <Trash2 size={14} aria-hidden />
                    )}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
