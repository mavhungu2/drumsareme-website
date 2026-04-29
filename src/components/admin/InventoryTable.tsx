"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import type {
  InventoryListItem,
  UpsertInventoryInput,
} from "@/lib/admin/inventory-types";
import { formatDateTime } from "@/lib/admin/format";

interface InventoryTableProps {
  items: InventoryListItem[];
  loading?: boolean;
  savingProductId: string | null;
  onSave: (input: UpsertInventoryInput) => Promise<void>;
}

interface EditorState {
  productId: string;
  openingStock: string;
  reorderLevel: string;
  supplier: string;
}

function toEditor(item: InventoryListItem): EditorState {
  return {
    productId: item.productId,
    openingStock: String(item.openingStock),
    reorderLevel: String(item.reorderLevel),
    supplier: item.supplier ?? "",
  };
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">
        No inventory yet. Add products from the catalog to start tracking stock.
      </p>
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
      <p className="mt-2 text-sm text-muted">Loading inventory…</p>
    </div>
  );
}

export default function InventoryTable({
  items,
  loading,
  savingProductId,
  onSave,
}: InventoryTableProps) {
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading && items.length === 0) return <LoadingState />;
  if (!loading && items.length === 0) return <EmptyState />;

  const startEdit = (item: InventoryListItem) => {
    setEditing(toEditor(item));
    setError(null);
  };
  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const submitEdit = async () => {
    if (!editing) return;
    const opening = Number.parseInt(editing.openingStock, 10);
    const reorder = Number.parseInt(editing.reorderLevel, 10);
    if (!Number.isInteger(opening) || opening < 0) {
      setError("Opening stock must be a non-negative whole number.");
      return;
    }
    if (!Number.isInteger(reorder) || reorder < 0) {
      setError("Reorder level must be a non-negative whole number.");
      return;
    }
    setError(null);
    try {
      await onSave({
        productId: editing.productId,
        openingStock: opening,
        reorderLevel: reorder,
        supplier: editing.supplier.trim() || undefined,
      });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="overflow-hidden border border-border rounded-2xl bg-background">
      <table className="w-full text-left">
        <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">SKU</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Opening</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Sold</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Stock</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Reorder ≤</th>
            <th scope="col" className="px-4 py-3 font-medium">Supplier</th>
            <th scope="col" className="px-4 py-3 font-medium">Updated</th>
            <th scope="col" className="w-10" aria-label="Edit" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => {
            const isEditing = editing?.productId === item.productId;
            const isSaving = savingProductId === item.productId;
            if (isEditing && editing) {
              return (
                <tr key={item.productId} className="bg-surface/50">
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="text-xs font-mono text-muted">
                        {item.productId}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editing.openingStock}
                      onChange={(e) =>
                        setEditing({ ...editing, openingStock: e.target.value })
                      }
                      className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle text-right text-sm text-muted tabular-nums">
                    {item.unitsSold}
                  </td>
                  <td className="px-4 py-3 align-middle text-right text-sm text-foreground tabular-nums">
                    {Math.max(
                      0,
                      Number.parseInt(editing.openingStock, 10) - item.unitsSold || 0,
                    )}
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={editing.reorderLevel}
                      onChange={(e) =>
                        setEditing({ ...editing, reorderLevel: e.target.value })
                      }
                      className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-right text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="text"
                      value={editing.supplier}
                      onChange={(e) =>
                        setEditing({ ...editing, supplier: e.target.value })
                      }
                      placeholder="Supplier"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </td>
                  <td colSpan={2} className="px-4 py-3 align-middle">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={submitEdit}
                          disabled={isSaving}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {isSaving && (
                            <Loader2
                              size={14}
                              className="animate-spin"
                              aria-hidden
                            />
                          )}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={isSaving}
                          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface disabled:opacity-60 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      {error && (
                        <p
                          role="alert"
                          className="text-xs text-red-700"
                        >
                          {error}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={item.productId} className="hover:bg-surface">
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs font-mono text-muted">
                      {item.productId}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm text-foreground tabular-nums">
                  {item.openingStock}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm text-muted tabular-nums">
                  {item.unitsSold}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm font-semibold text-foreground tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {item.lowStock && (
                      <AlertTriangle
                        size={14}
                        className="text-amber-600"
                        aria-label="Low stock"
                      />
                    )}
                    {item.currentStock}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm text-muted tabular-nums">
                  {item.reorderLevel}
                </td>
                <td className="px-4 py-3 align-middle text-sm text-muted">
                  {item.supplier ?? "—"}
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted whitespace-nowrap">
                  {formatDateTime(item.updatedAt)}
                </td>
                <td className="px-4 py-3 align-middle">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    aria-label={`Edit ${item.name}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
