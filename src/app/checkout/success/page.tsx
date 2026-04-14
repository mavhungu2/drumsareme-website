"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, CircleDashed } from "lucide-react";
import { useCart } from "@/lib/cart-context";

interface OrderSummary {
  id: string;
  ref: string;
  status: "pending" | "paid" | "failed";
  total: number;
  items: { name: string; qty: number; lineTotal: number }[];
}

function SuccessInner() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const { clearCart } = useCart();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("Missing order reference.");
      return;
    }
    let cancelled = false;
    const fetchOrder = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (!res.ok) throw new Error("Order not found");
        const data: OrderSummary = await res.json();
        if (!cancelled) setOrder(data);
        if (data.status === "paid") clearCart();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load order");
        }
      }
    };
    fetchOrder();
    return () => {
      cancelled = true;
    };
  }, [orderId, clearCart]);

  if (error) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Payment received</h1>
        <p className="text-muted mb-8">
          {error} — if you were charged we will still process your order. Contact us
          with your payment reference.
        </p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <CircleDashed size={40} className="animate-spin mx-auto mb-6 text-muted" />
        <p className="text-muted">Confirming your order…</p>
      </div>
    );
  }

  const paid = order.status === "paid";

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center mb-10">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
            paid ? "bg-green text-white" : "bg-surface text-muted"
          }`}
        >
          {paid ? <Check size={28} /> : <CircleDashed size={28} />}
        </div>
        <h1 className="text-3xl font-bold mb-2">
          {paid ? "Thanks for your order!" : "We're confirming your payment…"}
        </h1>
        <p className="text-muted">
          Order <span className="font-mono">{order.ref}</span>
        </p>
        {paid && (
          <p className="text-muted mt-2 text-sm">
            A receipt is on its way to your inbox.
          </p>
        )}
      </div>

      <div className="border border-border rounded-2xl p-6 sm:p-8">
        <h2 className="text-sm font-semibold text-muted uppercase tracking-widest mb-4">
          Summary
        </h2>
        <div className="space-y-3 text-sm">
          {order.items.map((it) => (
            <div key={it.name} className="flex justify-between">
              <span>
                {it.qty} × {it.name}
              </span>
              <span>R{it.lineTotal.toLocaleString("en-ZA")}</span>
            </div>
          ))}
          <div className="border-t border-border pt-3 flex justify-between font-semibold">
            <span>Total</span>
            <span>R{order.total.toLocaleString("en-ZA")}</span>
          </div>
        </div>
      </div>

      <div className="text-center mt-10">
        <Link
          href="/products"
          className="inline-flex items-center gap-2 border border-border text-foreground px-8 py-3.5 rounded-full text-sm font-medium hover:bg-surface transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-muted">
          Loading…
        </div>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}
