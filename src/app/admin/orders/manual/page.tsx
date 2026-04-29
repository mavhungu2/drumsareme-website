"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import ManualSaleForm from "@/components/admin/ManualSaleForm";
import { MANUAL_PAYMENT_METHOD_LABEL } from "@/lib/admin/orders-types";
import { formatZar } from "@/lib/admin/format";
import type { ManualSaleResponse } from "@/lib/admin/analytics-types";

export default function AdminManualSalePage() {
  const [last, setLast] = useState<ManualSaleResponse | null>(null);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Record manual sale
        </h1>
        <p className="mt-1 text-sm text-muted">
          Use for cash, card, or EFT sales collected outside Yoco. Stock is
          decremented automatically.
        </p>
      </div>

      {last ? (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-2xl border border-green/30 bg-green-light/10 text-foreground"
        >
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0 text-green"
            aria-hidden
          />
          <div className="flex-1">
            <p className="font-semibold">
              Sale recorded — {last.ref}
            </p>
            <p className="text-sm text-muted">
              {MANUAL_PAYMENT_METHOD_LABEL[last.paymentMethod]} ·{" "}
              {formatZar(last.total)} · subtotal {formatZar(last.subtotal)}
              {last.shipping > 0
                ? ` · delivery ${formatZar(last.shipping)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLast(null)}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            Record another
          </button>
        </div>
      ) : (
        <ManualSaleForm onSubmitted={setLast} />
      )}
    </div>
  );
}
