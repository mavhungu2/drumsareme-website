"use client";

import { Loader2 } from "lucide-react";
import type { CustomerAggregate } from "@/lib/admin/analytics-types";
import { formatDateTime, formatZar } from "@/lib/admin/format";

interface CustomersTableProps {
  customers: CustomerAggregate[];
  loading?: boolean;
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">No customers yet.</p>
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
      <p className="mt-2 text-sm text-muted">Loading customers…</p>
    </div>
  );
}

export default function CustomersTable({
  customers,
  loading,
}: CustomersTableProps) {
  if (loading && customers.length === 0) return <LoadingState />;
  if (!loading && customers.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden border border-border rounded-2xl bg-background">
      <table className="w-full text-left">
        <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Customer</th>
            <th scope="col" className="px-4 py-3 font-medium">Phone</th>
            <th scope="col" className="px-4 py-3 font-medium">Email</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Orders</th>
            <th scope="col" className="px-4 py-3 font-medium text-right">Spend</th>
            <th scope="col" className="px-4 py-3 font-medium">Last order</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {customers.map((customer, index) => (
            <tr
              key={`${customer.email}-${customer.phone}-${index}`}
              className="hover:bg-surface"
            >
              <td className="px-4 py-3 align-middle text-sm text-foreground">
                {customer.name || "—"}
              </td>
              <td className="px-4 py-3 align-middle text-sm text-muted">
                {customer.phone || "—"}
              </td>
              <td className="px-4 py-3 align-middle text-sm text-muted truncate max-w-[16rem]">
                {customer.email || "—"}
              </td>
              <td className="px-4 py-3 align-middle text-right text-sm text-foreground tabular-nums">
                {customer.totalOrders}
              </td>
              <td className="px-4 py-3 align-middle text-right text-sm font-semibold text-foreground tabular-nums">
                {formatZar(customer.totalSpend)}
              </td>
              <td className="px-4 py-3 align-middle text-xs text-muted whitespace-nowrap">
                {formatDateTime(customer.lastOrderAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
