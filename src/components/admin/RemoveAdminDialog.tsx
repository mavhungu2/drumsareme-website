"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Loader2, X } from "lucide-react";
import { AdminApiError, removeAdmin } from "@/lib/admin/api-client";
import type { AdminApiCode } from "@/lib/admin/admins-types";
import Dialog from "./Dialog";

interface RemoveAdminDialogProps {
  email: string;
  open: boolean;
  onClose: () => void;
  onRemoved: () => void;
}

function messageForCode(code: AdminApiCode | undefined, fallback: string): string {
  switch (code) {
    case "CANNOT_REMOVE_SELF":
      return "You cannot remove your own access.";
    case "CANNOT_REMOVE_SEED":
      return "Seed admins are managed via the env file, not the dashboard.";
    case "NOT_FOUND":
      return "That admin is no longer in the list.";
    default:
      return fallback;
  }
}

export default function RemoveAdminDialog({
  email,
  open,
  onClose,
  onRemoved,
}: RemoveAdminDialogProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError(null);
  }, [open]);

  const handleConfirm = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await removeAdmin(email.toLowerCase());
      onRemoved();
      onClose();
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? messageForCode(err.code, err.message)
          : err instanceof Error
            ? err.message
            : "Failed to remove admin";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [email, onClose, onRemoved, submitting]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      initialFocusRef={confirmRef}
    >
      <div className="flex items-start justify-between px-5 pt-5 pb-2">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            Remove admin
          </h2>
          <p className="mt-1 text-xs text-muted">
            This revokes dashboard access for{" "}
            <span className="font-medium text-foreground">{email}</span>. They
            will need to be re-added to sign in again.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close dialog"
          className="rounded-md p-1 text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="px-5 pb-5 space-y-4">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Removing…
              </>
            ) : (
              "Remove admin"
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
