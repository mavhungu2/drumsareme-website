"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { PromoListItem } from "@/lib/admin/promos-types";
import { formatDateTime } from "@/lib/admin/format";

interface PromoTableProps {
  items: PromoListItem[];
  loading?: boolean;
  busyCode: string | null;
  onEdit: (promo: PromoListItem) => void;
  onDelete: (promo: PromoListItem) => void;
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">No promo codes yet.</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="border border-border rounded-2xl p-12 text-center">
      <Loader2
        size={18}
        className="animate-spin mx-auto text-muted"
        aria-hidden
      />
      <p className="mt-2 text-sm text-muted">Loading codes…</p>
    </div>
  );
}

function valueLabel(promo: PromoListItem): string {
  return promo.kind === "percent" ? `${promo.value}% off` : `R${promo.value} off`;
}

function statusLabel(promo: PromoListItem): {
  label: string;
  className: string;
} {
  if (!promo.active) {
    return {
      label: "Inactive",
      className: "bg-gray-100 text-gray-700 border-gray-200",
    };
  }
  const now = Date.now();
  if (promo.startsAt && Date.parse(promo.startsAt) > now) {
    return {
      label: "Scheduled",
      className: "bg-blue-50 text-blue-700 border-blue-200",
    };
  }
  if (promo.expiresAt && Date.parse(promo.expiresAt) < now) {
    return {
      label: "Expired",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }
  if (
    typeof promo.maxRedemptions === "number" &&
    promo.redemptionCount >= promo.maxRedemptions
  ) {
    return {
      label: "Limit reached",
      className: "bg-red-50 text-red-700 border-red-200",
    };
  }
  return {
    label: "Active",
    className: "bg-green-50 text-green-700 border-green-200",
  };
}

export default function PromoTable({
  items,
  loading,
  busyCode,
  onEdit,
  onDelete,
}: PromoTableProps) {
  if (loading && items.length === 0) return <LoadingState />;
  if (!loading && items.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden border border-border rounded-2xl bg-background">
      <table className="w-full text-left">
        <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Code</th>
            <th scope="col" className="px-4 py-3 font-medium">Discount</th>
            <th scope="col" className="px-4 py-3 font-medium">Status</th>
            <th scope="col" className="px-4 py-3 font-medium">Window</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Used</th>
            <th scope="col" className="px-4 py-3 font-medium">Updated</th>
            <th scope="col" className="w-20" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((promo) => {
            const status = statusLabel(promo);
            const limit =
              typeof promo.maxRedemptions === "number"
                ? `${promo.redemptionCount}/${promo.maxRedemptions}`
                : `${promo.redemptionCount}`;
            const window = [
              promo.startsAt
                ? `from ${new Date(promo.startsAt).toLocaleDateString("en-ZA")}`
                : null,
              promo.expiresAt
                ? `until ${new Date(promo.expiresAt).toLocaleDateString("en-ZA")}`
                : null,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <tr key={promo.code} className="hover:bg-surface">
                <td className="px-4 py-3 align-middle">
                  <div className="flex flex-col">
                    <span className="text-sm font-mono font-semibold text-foreground">
                      {promo.code}
                    </span>
                    {promo.notes ? (
                      <span className="text-xs text-muted truncate max-w-[18rem]">
                        {promo.notes}
                      </span>
                    ) : null}
                    {promo.firstOrderOnly ? (
                      <span className="text-[10px] uppercase tracking-wide text-blue-700 mt-0.5">
                        First-time customers only
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-middle text-sm text-foreground tabular-nums">
                  {valueLabel(promo)}
                </td>
                <td className="px-4 py-3 align-middle">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted whitespace-nowrap">
                  {window || "Always"}
                </td>
                <td className="px-4 py-3 align-middle text-right text-sm tabular-nums">
                  {limit}
                </td>
                <td className="px-4 py-3 align-middle text-xs text-muted whitespace-nowrap">
                  {formatDateTime(promo.updatedAt)}
                </td>
                <td className="px-4 py-3 align-middle">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(promo)}
                      disabled={busyCode === promo.code}
                      aria-label={`Edit ${promo.code}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-background hover:text-foreground disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Pencil size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(promo)}
                      disabled={busyCode === promo.code}
                      aria-label={`Delete ${promo.code}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {busyCode === promo.code ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden />
                      ) : (
                        <Trash2 size={14} aria-hidden />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
