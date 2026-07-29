"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { AdminApiError, getOrder } from "@/lib/admin/api-client";
import {
  isOrderEditable,
  ORDER_STATUS_LABEL,
  type Order,
} from "@/lib/admin/orders-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import EditOrderForm from "@/components/admin/EditOrderForm";

function BackLink({ orderId }: { orderId?: string | null }) {
  const href = orderId
    ? `/admin/orders/detail/?id=${encodeURIComponent(orderId)}`
    : "/admin/orders/";
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
    >
      <ArrowLeft size={14} aria-hidden />
      Back to order
    </Link>
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

function ErrorState({
  message,
  orderId,
}: {
  message: string;
  orderId?: string | null;
}) {
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
        <BackLink orderId={orderId} />
      </div>
    </div>
  );
}

function EditOrderContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  const handleSaved = useCallback(() => {
    if (!id) return;
    router.push(`/admin/orders/detail/?id=${encodeURIComponent(id)}`);
  }, [id, router]);

  const handleCancel = useCallback(() => {
    if (!id) return;
    router.push(`/admin/orders/detail/?id=${encodeURIComponent(id)}`);
  }, [id, router]);

  if (!id) {
    return <ErrorState message="Missing ?id= query parameter." orderId={null} />;
  }
  if (authLoading || (loading && !order)) return <LoadingState />;
  if (error) return <ErrorState message={error} orderId={id} />;
  if (!order) return <LoadingState />;

  if (!isOrderEditable(order)) {
    const reason =
      order.source === "yoco" && order.status === "pending"
        ? "This pending online order can't be edited — the customer may be completing payment."
        : `${ORDER_STATUS_LABEL[order.status]} orders can't be edited.`;
    return <ErrorState message={reason} orderId={id} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <BackLink orderId={id} />
      <div>
        <p className="text-xs uppercase tracking-wider text-muted">
          Edit order
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">
          {order.ref}
        </h1>
      </div>
      <EditOrderForm
        order={order}
        onSaved={handleSaved}
        onCancel={handleCancel}
      />
    </div>
  );
}

export default function AdminEditOrderPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <EditOrderContent />
    </Suspense>
  );
}
