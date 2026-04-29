"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import {
  AdminApiError,
  listInventory,
  upsertInventory,
} from "@/lib/admin/api-client";
import type {
  InventoryListItem,
  UpsertInventoryInput,
} from "@/lib/admin/inventory-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import { products } from "@/lib/products";
import InventoryTable from "@/components/admin/InventoryTable";

interface MissingProduct {
  productId: string;
  name: string;
}

function buildMissing(items: InventoryListItem[]): MissingProduct[] {
  const tracked = new Set(items.map((i) => i.productId));
  return products
    .filter((p) => !tracked.has(p.id))
    .map((p) => ({ productId: p.id, name: p.name }));
}

export default function AdminInventoryPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listInventory();
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const handleSave = useCallback(
    async (input: UpsertInventoryInput) => {
      setSavingProductId(input.productId);
      setError(null);
      try {
        await upsertInventory(input);
        await refresh();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Save failed";
        setError(message);
        throw err;
      } finally {
        setSavingProductId(null);
      }
    },
    [refresh],
  );

  const handleAdd = useCallback(
    async (productId: string) => {
      setAddingProductId(productId);
      setError(null);
      try {
        await upsertInventory({
          productId,
          openingStock: 0,
          reorderLevel: 5,
        });
        await refresh();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to add product";
        setError(message);
      } finally {
        setAddingProductId(null);
      }
    },
    [refresh],
  );

  const missing = buildMissing(items);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-muted">
            Track stock per SKU. Sales decrement automatically; cancellations
            credit back.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Refresh inventory"
        >
          <RefreshCcw size={14} aria-hidden />
          Refresh
        </button>
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

      <InventoryTable
        items={items}
        loading={loading}
        savingProductId={savingProductId}
        onSave={handleSave}
      />

      {missing.length > 0 && (
        <section className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-3">
          <header>
            <h2 className="text-base font-semibold text-foreground">
              Catalog products not yet tracked
            </h2>
            <p className="mt-1 text-xs text-muted">
              Add a product to start tracking stock. Opening stock defaults to 0
              and reorder level to 5; edit after adding.
            </p>
          </header>
          <ul className="space-y-2">
            {missing.map((p) => (
              <li
                key={p.productId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {p.name}
                  </p>
                  <p className="text-xs font-mono text-muted">{p.productId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAdd(p.productId)}
                  disabled={addingProductId === p.productId}
                  className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface disabled:opacity-60 transition-colors"
                >
                  {addingProductId === p.productId ? "Adding…" : "Add"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
