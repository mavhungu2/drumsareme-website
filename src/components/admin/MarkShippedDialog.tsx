"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Loader2, X } from "lucide-react";
import {
  AdminApiError,
  markShipped,
  type MarkShippedInput,
} from "@/lib/admin/api-client";
import type { OrderTracking } from "@/lib/admin/orders-types";
import Dialog from "./Dialog";

interface MarkShippedDialogProps {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onShipped: (tracking: OrderTracking) => void;
}

interface FormState {
  carrier: string;
  number: string;
  url: string;
}

const EMPTY_FORM: FormState = { carrier: "", number: "", url: "" };

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function buildPayload(form: FormState): MarkShippedInput {
  const url = form.url.trim();
  return {
    carrier: form.carrier.trim(),
    number: form.number.trim(),
    ...(url ? { url } : {}),
  };
}

export default function MarkShippedDialog({
  orderId,
  open,
  onClose,
  onShipped,
}: MarkShippedDialogProps) {
  const titleId = useId();
  const carrierId = useId();
  const numberId = useId();
  const urlId = useId();

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog opens, so a second use starts clean.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError(null);
    setSubmitting(false);
  }, [open]);

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const response = await markShipped(orderId, buildPayload(form));
        onShipped(response.tracking);
        onClose();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to mark as shipped";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [form, onClose, onShipped, orderId, submitting],
  );

  const canSubmit =
    form.carrier.trim() !== "" && form.number.trim() !== "" && !submitting;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      initialFocusRef={firstFieldRef}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          Mark order as shipped
        </h2>
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

      <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4" noValidate>
        <label
          htmlFor={carrierId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>
            Carrier <span className="text-red-700">*</span>
          </span>
          <input
            ref={firstFieldRef}
            id={carrierId}
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            value={form.carrier}
            onChange={(e) => update("carrier", e.target.value)}
            placeholder="e.g. The Courier Guy"
            className={FIELD_CLASS}
            disabled={submitting}
          />
        </label>

        <label
          htmlFor={numberId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>
            Tracking number <span className="text-red-700">*</span>
          </span>
          <input
            id={numberId}
            type="text"
            required
            maxLength={100}
            autoComplete="off"
            value={form.number}
            onChange={(e) => update("number", e.target.value)}
            placeholder="e.g. TCG123456789"
            className={FIELD_CLASS}
            disabled={submitting}
          />
        </label>

        <label
          htmlFor={urlId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Tracking URL (optional)</span>
          <input
            id={urlId}
            type="url"
            maxLength={500}
            autoComplete="off"
            value={form.url}
            onChange={(e) => update("url", e.target.value)}
            placeholder="https://…"
            className={FIELD_CLASS}
            disabled={submitting}
          />
        </label>

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
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Marking as shipped…
              </>
            ) : (
              "Mark as shipped"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
