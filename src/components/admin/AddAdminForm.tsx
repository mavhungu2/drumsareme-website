"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { AdminApiError, addAdmin } from "@/lib/admin/api-client";
import type { AdminApiCode } from "@/lib/admin/admins-types";

interface AddAdminFormProps {
  onAdded: () => void;
  disabled?: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function messageForCode(code: AdminApiCode | undefined, fallback: string): string {
  switch (code) {
    case "INVALID_EMAIL":
      return "That doesn't look like a valid email address.";
    case "ALREADY_ADMIN":
      return "That email is already an admin.";
    case "SEED_ADMIN":
      return "That email is already a seed admin.";
    default:
      return fallback;
  }
}

export default function AddAdminForm({ onAdded, disabled }: AddAdminFormProps) {
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const canSubmit = trimmed.length > 0 && !submitting && !disabled;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      if (!EMAIL_PATTERN.test(trimmed)) {
        setError("That doesn't look like a valid email address.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await addAdmin({ email: trimmed });
        setEmail("");
        onAdded();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? messageForCode(err.code, err.message)
            : err instanceof Error
              ? err.message
              : "Failed to add admin";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, onAdded, trimmed],
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-background p-4 sm:p-5 space-y-3"
    >
      <label
        htmlFor={inputId}
        className="flex flex-col gap-1 text-xs font-medium text-muted"
      >
        <span>Invite admin by email</span>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id={inputId}
            type="email"
            autoComplete="off"
            inputMode="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting || disabled}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Adding…
              </>
            ) : (
              <>
                <UserPlus size={14} aria-hidden />
                Add admin
              </>
            )}
          </button>
        </div>
      </label>
      <p className="text-xs text-muted">
        The new admin signs in with Google using this email. Access is granted
        the first time they sign in.
      </p>
      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
