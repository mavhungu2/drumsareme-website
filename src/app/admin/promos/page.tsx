"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Plus, RefreshCcw } from "lucide-react";
import {
  AdminApiError,
  deletePromo,
  listPromos,
} from "@/lib/admin/api-client";
import type { PromoListItem } from "@/lib/admin/promos-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import PromoTable from "@/components/admin/PromoTable";
import PromoForm from "@/components/admin/PromoForm";

type Mode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; promo: PromoListItem };

export default function AdminPromosPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [items, setItems] = useState<PromoListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listPromos();
      setItems(response.items);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load promo codes",
      );
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
    async (promo: PromoListItem) => {
      const confirmed = window.confirm(
        `Delete ${promo.code}? Existing orders that used it are preserved.`,
      );
      if (!confirmed) return;
      setBusyCode(promo.code);
      setError(null);
      try {
        await deletePromo(promo.code);
        await refresh();
      } catch (err) {
        setError(
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Delete failed",
        );
      } finally {
        setBusyCode(null);
      }
    },
    [refresh],
  );

  if (mode.kind === "create" || mode.kind === "edit") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {mode.kind === "create" ? "New promo code" : "Edit promo code"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Codes apply to subtotal only — shipping is added on top.
          </p>
        </div>
        <PromoForm
          initial={mode.kind === "edit" ? mode.promo : null}
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
            Promo codes
          </h1>
          <p className="mt-1 text-sm text-muted">
            Discounts customers can enter on the checkout page. Redemption
            counts increment when an order transitions to paid.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode({ kind: "create" })}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-foreground text-sm font-medium text-background hover:bg-foreground/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Plus size={14} aria-hidden />
            New code
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Refresh promo codes"
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

      <PromoTable
        items={items}
        loading={loading}
        busyCode={busyCode}
        onEdit={(promo) => setMode({ kind: "edit", promo })}
        onDelete={handleDelete}
      />
    </div>
  );
}
