"use client";

import { Loader2, Trash2 } from "lucide-react";
import type { AdminListItem } from "@/lib/admin/admins-types";
import { formatDateTime } from "@/lib/admin/format";

interface AdminUsersTableProps {
  admins: AdminListItem[];
  callerEmail: string;
  loading?: boolean;
  onRequestRemove: (email: string) => void;
}

function sourceLabel(source: AdminListItem["source"]): string {
  return source === "seed" ? "Seed" : "Firestore";
}

function reasonDisabled(
  admin: AdminListItem,
  callerEmail: string,
): string | null {
  if (admin.email.toLowerCase() === callerEmail.toLowerCase()) {
    return "You cannot remove your own access.";
  }
  if (admin.source === "seed") {
    return "Seed admins are managed via the env file.";
  }
  return null;
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border rounded-2xl p-12 text-center">
      <p className="text-sm text-muted">No admins yet.</p>
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
      <p className="mt-2 text-sm text-muted">Loading admins…</p>
    </div>
  );
}

export default function AdminUsersTable({
  admins,
  callerEmail,
  loading,
  onRequestRemove,
}: AdminUsersTableProps) {
  if (loading && admins.length === 0) return <LoadingState />;
  if (!loading && admins.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      <div className="hidden md:block overflow-hidden border border-border rounded-2xl bg-background">
        <table className="w-full text-left">
          <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Email
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Source
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Added by
              </th>
              <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                Added
              </th>
              <th scope="col" className="px-4 py-3 font-medium whitespace-nowrap">
                Last sign-in
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {admins.map((admin) => {
              const disabledReason = reasonDisabled(admin, callerEmail);
              const isSelf =
                admin.email.toLowerCase() === callerEmail.toLowerCase();
              return (
                <tr key={admin.email}>
                  <td className="px-4 py-3 align-middle text-sm text-foreground">
                    <span className="font-medium">{admin.email}</span>
                    {isSelf ? (
                      <span className="ml-2 text-xs text-muted">(you)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        admin.source === "seed"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-border bg-surface text-muted"
                      }`}
                    >
                      {sourceLabel(admin.source)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-sm text-muted">
                    {admin.addedByEmail ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-middle text-sm text-muted whitespace-nowrap">
                    {admin.addedAt ? formatDateTime(admin.addedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 align-middle text-sm text-muted whitespace-nowrap">
                    {admin.lastSignInAt
                      ? formatDateTime(admin.lastSignInAt)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <button
                      type="button"
                      onClick={() => onRequestRemove(admin.email)}
                      disabled={!admin.removable}
                      title={disabledReason ?? undefined}
                      aria-label={`Remove ${admin.email}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-background disabled:hover:text-foreground"
                    >
                      <Trash2 size={12} aria-hidden />
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden space-y-3">
        {admins.map((admin) => {
          const disabledReason = reasonDisabled(admin, callerEmail);
          const isSelf =
            admin.email.toLowerCase() === callerEmail.toLowerCase();
          return (
            <li
              key={admin.email}
              className="bg-background border border-border rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {admin.email}
                    {isSelf ? (
                      <span className="ml-2 text-xs text-muted">(you)</span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {admin.source === "seed"
                      ? "Seed admin"
                      : admin.addedByEmail
                        ? `Added by ${admin.addedByEmail}`
                        : "Firestore admin"}
                  </p>
                  {admin.addedAt ? (
                    <p className="text-xs text-muted">
                      Added {formatDateTime(admin.addedAt)}
                    </p>
                  ) : null}
                  {admin.lastSignInAt ? (
                    <p className="text-xs text-muted">
                      Last sign-in {formatDateTime(admin.lastSignInAt)}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onRequestRemove(admin.email)}
                  disabled={!admin.removable}
                  title={disabledReason ?? undefined}
                  aria-label={`Remove ${admin.email}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={12} aria-hidden />
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
