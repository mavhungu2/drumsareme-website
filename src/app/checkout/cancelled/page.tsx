"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";

function CancelledInner() {
  const params = useSearchParams();
  const failed = params.get("failed") === "1";

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mx-auto mb-6">
        <AlertCircle size={28} className="text-muted" />
      </div>
      <h1 className="text-3xl font-bold mb-2">
        {failed ? "Payment failed" : "Payment cancelled"}
      </h1>
      <p className="text-muted mb-8">
        {failed
          ? "Your payment didn't go through. No charge was made — try again or use a different card."
          : "No worries — your cart is still saved. Try again when you're ready."}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/checkout"
          className="inline-flex items-center justify-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          Try again
        </Link>
        <Link
          href="/products"
          className="inline-flex items-center justify-center gap-2 border border-border text-foreground px-8 py-3.5 rounded-full text-sm font-medium hover:bg-surface transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutCancelledPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center text-muted">
          Loading…
        </div>
      }
    >
      <CancelledInner />
    </Suspense>
  );
}
