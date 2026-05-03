"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, Printer } from "lucide-react";
import { AdminApiError, getOrder } from "@/lib/admin/api-client";
import type { Order } from "@/lib/admin/orders-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import Invoice from "@/components/admin/Invoice";

function MissingIdState() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Missing order id</h1>
      <p className="mt-2 text-sm text-muted">
        This page requires an <code>?id=</code> query parameter.
      </p>
    </div>
  );
}

function InvoiceContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { user, loading: authLoading } = useAdminAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getOrder(id);
      setOrder(result);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.status === 404
            ? "Order not found."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load order";
      setError(message);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refetch();
  }, [authLoading, user, refetch]);

  if (!id) return <MissingIdState />;

  if (loading || (!order && !error)) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Loader2
          size={18}
          className="animate-spin mx-auto text-muted"
          aria-hidden
        />
        <p className="mt-2 text-sm text-muted">Loading invoice…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error ?? "Failed to load invoice"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="invoice-page bg-surface min-h-screen py-6 print:bg-white print:py-0">
      <div className="invoice-toolbar max-w-[210mm] mx-auto mb-4 px-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/admin/orders/detail/?id=${encodeURIComponent(order.id)}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} aria-hidden />
          Back to order
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Printer size={14} aria-hidden />
          Print / Save as PDF
        </button>
      </div>
      <Invoice order={order} />
    </div>
  );
}

export default function InvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <Loader2
            size={18}
            className="animate-spin mx-auto text-muted"
            aria-hidden
          />
        </div>
      }
    >
      <InvoiceContent />
    </Suspense>
  );
}
