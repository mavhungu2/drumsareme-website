"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import type {
  CustomerListItem,
  UpdateCustomerInput,
  UpdateCustomerResponse,
} from "@/lib/admin/customers-types";
import { formatDateTime, formatZar } from "@/lib/admin/format";

interface CustomersTableProps {
  customers: CustomerListItem[];
  loading?: boolean;
  onEdit: (
    id: string,
    input: UpdateCustomerInput,
  ) => Promise<UpdateCustomerResponse>;
}

interface EditorState {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  notes: string;
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

function toEditor(customer: CustomerListItem): EditorState {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    notes: customer.notes ?? "",
  };
}

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function validate(editor: EditorState): string | null {
  if (!editor.firstName.trim()) return "First name is required";
  if (!editor.phone.trim()) return "Phone is required";
  const email = editor.email.trim();
  if (email.length > 0 && !EMAIL_PATTERN.test(email)) {
    return "Email looks invalid";
  }
  return null;
}

function diffUpdates(
  editor: EditorState,
  original: CustomerListItem,
): UpdateCustomerInput {
  const updates: UpdateCustomerInput = {};
  if (editor.firstName.trim() !== original.firstName.trim()) {
    updates.firstName = editor.firstName.trim();
  }
  if (editor.lastName.trim() !== original.lastName.trim()) {
    updates.lastName = editor.lastName.trim();
  }
  if (editor.email.trim() !== original.email.trim()) {
    updates.email = editor.email.trim();
  }
  if (editor.phone.trim() !== original.phone.trim()) {
    updates.phone = editor.phone.trim();
  }
  if (editor.notes.trim() !== (original.notes ?? "").trim()) {
    updates.notes = editor.notes.trim();
  }
  return updates;
}

export default function CustomersTable({
  customers,
  loading,
  onEdit,
}: CustomersTableProps) {
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading && customers.length === 0) return <LoadingState />;
  if (!loading && customers.length === 0) return <EmptyState />;

  const startEdit = (customer: CustomerListItem) => {
    setEditing(toEditor(customer));
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const submitEdit = async (original: CustomerListItem) => {
    if (!editing) return;
    const validationError = validate(editing);
    if (validationError) {
      setError(validationError);
      return;
    }
    const updates = diffUpdates(editing, original);
    if (Object.keys(updates).length === 0) {
      setEditing(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onEdit(editing.id, updates);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

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
            <th scope="col" className="w-12" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {customers.map((customer) => {
            const isEditing = editing?.id === customer.id;
            if (isEditing && editing) {
              return (
                <tr key={`edit-${customer.id}`} className="bg-surface/50">
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editing.firstName}
                          onChange={(e) =>
                            setEditing({ ...editing, firstName: e.target.value })
                          }
                          placeholder="First name"
                          aria-label="First name"
                          className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                        <input
                          type="text"
                          value={editing.lastName}
                          onChange={(e) =>
                            setEditing({ ...editing, lastName: e.target.value })
                          }
                          placeholder="Last name"
                          aria-label="Last name"
                          className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        />
                      </div>
                      <input
                        type="text"
                        value={editing.notes}
                        onChange={(e) =>
                          setEditing({ ...editing, notes: e.target.value })
                        }
                        placeholder="Internal notes"
                        aria-label="Internal notes"
                        className="h-9 rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="tel"
                      value={editing.phone}
                      onChange={(e) =>
                        setEditing({ ...editing, phone: e.target.value })
                      }
                      placeholder="Phone"
                      aria-label="Phone"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="email"
                      value={editing.email}
                      onChange={(e) =>
                        setEditing({ ...editing, email: e.target.value })
                      }
                      placeholder="Email"
                      aria-label="Email"
                      className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    />
                  </td>
                  <td className="px-4 py-3 align-middle text-right text-sm text-muted tabular-nums">
                    {customer.totalOrders}
                  </td>
                  <td className="px-4 py-3 align-middle text-right text-sm text-muted tabular-nums">
                    {formatZar(customer.totalSpend)}
                  </td>
                  <td colSpan={2} className="px-4 py-3 align-middle">
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => submitEdit(customer)}
                          disabled={saving}
                          className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {saving && (
                            <Loader2
                              size={14}
                              className="animate-spin"
                              aria-hidden
                            />
                          )}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface disabled:opacity-60 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                      <p className="text-xs text-muted">
                        Identity changes also update every past order&apos;s
                        snapshot.
                      </p>
                      {error && (
                        <p role="alert" className="text-xs text-red-700">
                          {error}
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }
            const fullName =
              `${customer.firstName} ${customer.lastName}`.trim() || "—";
            return (
              <tr key={customer.id} className="hover:bg-surface">
                <td className="px-4 py-3 align-middle text-sm text-foreground">
                  <div className="flex flex-col">
                    <span>{fullName}</span>
                    {customer.notes ? (
                      <span className="text-xs text-muted truncate max-w-[20rem]">
                        {customer.notes}
                      </span>
                    ) : null}
                  </div>
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
                <td className="px-4 py-3 align-middle">
                  <button
                    type="button"
                    onClick={() => startEdit(customer)}
                    aria-label={`Edit ${fullName}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
