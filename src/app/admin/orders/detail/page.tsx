"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import {
  AdminApiError,
  addNote,
  getOrder,
  resendReceipt,
} from "@/lib/admin/api-client";
import type { Order } from "@/lib/admin/orders-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import OrderDetailView from "@/components/admin/OrderDetailView";
import MarkShippedDialog from "@/components/admin/MarkShippedDialog";
import CancelOrderDialog from "@/components/admin/CancelOrderDialog";

type MutationBanner =
  | { kind: "error"; message: string }
  | { kind: "success"; message: string };

function BackLink() {
  return (
    <Link
      href="/admin/orders/"
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
    >
      <ArrowLeft size={14} aria-hidden />
      Back to orders
    </Link>
  );
}

function MissingIdState() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-foreground">Missing order id</h1>
      <p className="mt-2 text-sm text-muted">
        This page requires an <code className="font-mono">?id=</code> query
        parameter. Return to the orders list and choose an order.
      </p>
      <div className="mt-6">
        <BackLink />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">
      <div
        role="alert"
        className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
      >
        <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <p>{message}</p>
      </div>
      <div className="mt-6 text-center">
        <BackLink />
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center">
      <Loader2
        size={18}
        className="animate-spin mx-auto text-muted"
        aria-hidden
      />
      <p className="mt-2 text-sm text-muted">Loading order…</p>
    </div>
  );
}

function MutationBannerView({ banner }: { banner: MutationBanner }) {
  const isError = banner.kind === "error";
  const wrapperClass = isError
    ? "flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    : "flex items-start gap-3 rounded-xl border border-green/30 bg-green-light/20 p-3 text-sm text-foreground";
  const Icon = isError ? AlertCircle : CheckCircle2;
  const iconClass = isError
    ? "mt-0.5 shrink-0"
    : "mt-0.5 shrink-0 text-green";
  return (
    <div role={isError ? "alert" : "status"} className={wrapperClass}>
      <Icon size={16} className={iconClass} aria-hidden />
      <p>{banner.message}</p>
    </div>
  );
}

function OrderDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const { user, loading: authLoading } = useAdminAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const [mutationBanner, setMutationBanner] = useState<MutationBanner | null>(
    null,
  );
  const [shipDialogOpen, setShipDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

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
            : err.status === 403
              ? "Your account is not authorised to access this order."
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
    refetch();
  }, [authLoading, user, refetch]);

  const handleShipped = useCallback(async () => {
    setMutating(true);
    setMutationBanner(null);
    try {
      await refetch();
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  const handleCancelled = useCallback(async () => {
    setMutating(true);
    setMutationBanner(null);
    try {
      await refetch();
      setMutationBanner({ kind: "success", message: "Order cancelled." });
    } finally {
      setMutating(false);
    }
  }, [refetch]);

  const handleResendReceipt = useCallback(async () => {
    if (!id) return;
    if (!window.confirm("Resend receipt email to customer?")) return;
    setMutating(true);
    setMutationBanner(null);
    try {
      await resendReceipt(id);
      setMutationBanner({
        kind: "success",
        message: "Receipt email sent.",
      });
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to resend receipt";
      setMutationBanner({ kind: "error", message });
    } finally {
      setMutating(false);
    }
  }, [id]);

  const handleAddNote = useCallback(
    async (body: string) => {
      if (!id) return;
      setMutating(true);
      setMutationBanner(null);
      try {
        await addNote(id, body);
        await refetch();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to add note";
        setMutationBanner({ kind: "error", message });
        // Re-throw so AddNoteForm keeps its own inline state aware of the
        // failure and does not clear the textarea.
        throw err;
      } finally {
        setMutating(false);
      }
    },
    [id, refetch],
  );

  if (!id) return <MissingIdState />;
  if (!order && loading) return <LoadingState />;
  if (!order && authLoading) return <LoadingState />;
  if (error && !order) return <ErrorState message={error} />;
  if (!order) return <LoadingState />;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        {loading || mutating ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-muted"
            aria-live="polite"
          >
            <Loader2 size={12} className="animate-spin" aria-hidden />
            {mutating ? "Saving…" : "Refreshing…"}
          </span>
        ) : null}
      </div>
      {mutationBanner ? <MutationBannerView banner={mutationBanner} /> : null}
      <OrderDetailView
        order={order}
        mutating={mutating}
        onMarkShipped={() => setShipDialogOpen(true)}
        onCancel={() => setCancelDialogOpen(true)}
        onResendReceipt={handleResendReceipt}
        onAddNote={handleAddNote}
      />
      <MarkShippedDialog
        orderId={order.id}
        open={shipDialogOpen}
        onClose={() => setShipDialogOpen(false)}
        onShipped={handleShipped}
      />
      <CancelOrderDialog
        orderId={order.id}
        currentStatus={order.status}
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
        onCancelled={handleCancelled}
      />
    </div>
  );
}

export default function AdminOrderDetailPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <OrderDetailContent />
    </Suspense>
  );
}
