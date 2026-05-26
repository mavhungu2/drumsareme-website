"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import {
  AdminApiError,
  listCustomers,
  updateCustomer,
} from "@/lib/admin/api-client";
import type {
  CustomerListItem,
  UpdateCustomerInput,
  UpdateCustomerResponse,
} from "@/lib/admin/customers-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import CustomersTable from "@/components/admin/CustomersTable";

export default function AdminCustomersPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await listCustomers();
      setCustomers(response.items);
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load customers";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    void refresh();
  }, [authLoading, user, refresh]);

  const handleEdit = useCallback(
    async (
      id: string,
      input: UpdateCustomerInput,
    ): Promise<UpdateCustomerResponse> => {
      const response = await updateCustomer(id, input);
      // Refresh so re-sort by total spend reflects post-update state.
      await refresh();
      return response;
    },
    [refresh],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Customers
          </h1>
          <p className="mt-1 text-sm text-muted">
            One row per customer record. Order totals and last-order date are
            computed from paid, shipped, and completed orders. Editing a row
            updates every past order&apos;s snapshot for that customer.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Refresh customers"
        >
          <RefreshCcw size={14} aria-hidden />
          Refresh
        </button>
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

      <CustomersTable
        customers={customers}
        loading={loading}
        onEdit={handleEdit}
      />
    </div>
  );
}
