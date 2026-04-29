"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Plus, RefreshCcw } from "lucide-react";
import {
  AdminApiError,
  deleteProduct,
  listProducts,
} from "@/lib/admin/api-client";
import type { ProductListItem } from "@/lib/admin/products-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import ProductTable from "@/components/admin/ProductTable";
import ProductForm from "@/components/admin/ProductForm";

type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; product: ProductListItem };

export default function AdminProductsPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listProducts();
      setItems(response.items);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load products";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const handleSaved = useCallback(() => {
    setMode({ kind: "list" });
    void refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (product: ProductListItem) => {
      const confirmed = window.confirm(
        `Delete ${product.name}? This will remove it from the catalog. Existing orders that reference it are preserved.`,
      );
      if (!confirmed) return;
      setBusyId(product.id);
      setError(null);
      try {
        await deleteProduct(product.id);
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
        setBusyId(null);
      }
    },
    [refresh],
  );

  if (mode.kind === "create" || mode.kind === "edit") {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {mode.kind === "create" ? "New product" : "Edit product"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {mode.kind === "create"
              ? "Adds a row to the catalog. Customer pages refresh on next deploy; price and in-stock changes show live."
              : "Price and in-stock changes show live on the storefront. Other changes appear after the next deploy."}
          </p>
        </div>
        <ProductForm
          initial={mode.kind === "edit" ? mode.product : null}
          onSaved={handleSaved}
          onCancel={() => setMode({ kind: "list" })}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Products
          </h1>
          <p className="mt-1 text-sm text-muted">
            Edit price, availability, and copy. Adding new products requires
            a redeploy to update the static pages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode({ kind: "create" })}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-foreground text-sm font-medium text-background hover:bg-foreground/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={14} aria-hidden />
            Add product
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Refresh products"
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

      <ProductTable
        items={items}
        loading={loading}
        busyId={busyId}
        onEdit={(product) => setMode({ kind: "edit", product })}
        onDelete={handleDelete}
      />
    </div>
  );
}
