"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import ManualSaleForm from "@/components/admin/ManualSaleForm";
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
          Saves the order as <strong>pending</strong>. Capture payment method,
          fulfilment, and any delivery fee on the order detail page when
          payment lands — that&rsquo;s also when stock decrements.
        </p>
      </div>

      {last ? (
        <div
          role="status"
          className="flex flex-col gap-3 p-4 rounded-2xl border border-green/30 bg-green-light/10 text-foreground sm:flex-row sm:items-start"
        >
          <CheckCircle2
            size={18}
            className="mt-0.5 shrink-0 text-green"
            aria-hidden
          />
          <div className="flex-1">
            <p className="font-semibold">
              Pending order saved — {last.ref}
            </p>
            <p className="text-sm text-muted">
              Subtotal {formatZar(last.subtotal)} · awaiting payment
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/orders/detail/?id=${encodeURIComponent(last.id)}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
            >
              Open & Mark as Paid
              <ArrowRight size={14} aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => setLast(null)}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface transition-colors"
            >
              Record another
            </button>
          </div>
        </div>
      ) : (
        <ManualSaleForm onSubmitted={setLast} />
      )}
    </div>
  );
}
