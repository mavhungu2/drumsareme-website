"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { AdminApiError, listAdmins } from "@/lib/admin/api-client";
import type {
  AdminListItem,
  ListAdminsResponse,
} from "@/lib/admin/admins-types";
import { useAdminAuth } from "@/lib/admin/auth-context";
import AddAdminForm from "@/components/admin/AddAdminForm";
import AdminUsersTable from "@/components/admin/AdminUsersTable";
import RemoveAdminDialog from "@/components/admin/RemoveAdminDialog";

export default function AdminUsersPage() {
  const { user, loading: authLoading } = useAdminAuth();
  const [data, setData] = useState<ListAdminsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchAdmins = useCallback(async () => {
    if (!user) return;
    const id = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await listAdmins();
      if (id !== requestIdRef.current) return;
      setData(response);
    } catch (err) {
      if (id !== requestIdRef.current) return;
      const message =
        err instanceof AdminApiError
          ? err.status === 403
            ? "Your account is not authorised to manage admins."
            : err.message
          : err instanceof Error
            ? err.message
            : "Failed to load admins";
      setError(message);
      setData(null);
    } finally {
      if (id === requestIdRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    fetchAdmins();
  }, [authLoading, user, fetchAdmins]);

  const admins: AdminListItem[] = data?.admins ?? [];
  const callerEmail = data?.callerEmail ?? user?.email?.toLowerCase() ?? "";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Admins
          </h1>
          <p className="mt-1 text-sm text-muted">
            Invite or remove the Google accounts that can sign into this
            dashboard. Seed admins (defined in the server env) are protected
            from removal.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchAdmins}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-border text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Refresh admins"
        >
          <RefreshCcw size={14} aria-hidden />
          Refresh
        </button>
      </div>

      <AddAdminForm onAdded={fetchAdmins} disabled={loading} />

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm"
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      <AdminUsersTable
        admins={admins}
        callerEmail={callerEmail}
        loading={loading}
        onRequestRemove={setRemoveTarget}
      />

      <RemoveAdminDialog
        email={removeTarget ?? ""}
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        onRemoved={fetchAdmins}
      />
    </div>
  );
}
