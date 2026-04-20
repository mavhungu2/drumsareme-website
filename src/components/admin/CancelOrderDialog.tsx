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
  cancelOrder,
} from "@/lib/admin/api-client";
import {
  ORDER_STATUS_LABEL,
  type OrderStatus,
} from "@/lib/admin/orders-types";
import Dialog from "./Dialog";

interface CancelOrderDialogProps {
  orderId: string;
  currentStatus: OrderStatus;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
}

interface FormState {
  reason: string;
  notifyCustomer: boolean;
}

const EMPTY_FORM: FormState = { reason: "", notifyCustomer: false };
const MAX_REASON_LENGTH = 500;

export default function CancelOrderDialog({
  orderId,
  currentStatus,
  open,
  onClose,
  onCancelled,
}: CancelOrderDialogProps) {
  const titleId = useId();
  const reasonId = useId();
  const counterId = useId();
  const notifyId = useId();

  const reasonRef = useRef<HTMLTextAreaElement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog opens so a second use starts clean.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setError(null);
    setSubmitting(false);
  }, [open]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      const trimmedReason = form.reason.trim();
      if (trimmedReason === "") {
        setError("Reason is required.");
        return;
      }
      if (trimmedReason.length > MAX_REASON_LENGTH) {
        setError(`Reason must be ${MAX_REASON_LENGTH} characters or fewer.`);
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await cancelOrder(orderId, {
          reason: trimmedReason,
          notifyCustomer: form.notifyCustomer,
        });
        onCancelled();
        onClose();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to cancel order";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [form.notifyCustomer, form.reason, onCancelled, onClose, orderId, submitting],
  );

  const trimmedReason = form.reason.trim();
  const canSubmit = trimmedReason.length > 0 && !submitting;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      initialFocusRef={reasonRef}
    >
      <div className="flex items-start justify-between px-5 pt-5 pb-2">
        <div>
          <h2
            id={titleId}
            className="text-base font-semibold text-foreground"
          >
            Cancel order
          </h2>
          <p className="mt-1 text-xs text-muted">
            Current status: {ORDER_STATUS_LABEL[currentStatus]}. This action
            cannot be undone.
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

      <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4" noValidate>
        <label
          htmlFor={reasonId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>
            Reason <span className="text-red-700">*</span>
          </span>
          <textarea
            ref={reasonRef}
            id={reasonId}
            required
            maxLength={MAX_REASON_LENGTH}
            rows={3}
            value={form.reason}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                reason: e.target.value.slice(0, MAX_REASON_LENGTH),
              }))
            }
            placeholder="Why is this order being cancelled?"
            aria-describedby={counterId}
            disabled={submitting}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          />
          <span
            id={counterId}
            aria-live="polite"
            className="text-xs text-muted tabular-nums self-end"
          >
            {form.reason.length} / {MAX_REASON_LENGTH}
          </span>
        </label>

        <label
          htmlFor={notifyId}
          className="flex items-start gap-2 text-sm text-foreground"
        >
          <input
            id={notifyId}
            type="checkbox"
            checked={form.notifyCustomer}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notifyCustomer: e.target.checked }))
            }
            disabled={submitting}
            className="mt-0.5 h-4 w-4 rounded border-border text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
          />
          <span>Send cancellation email to customer</span>
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
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Cancelling…
              </>
            ) : (
              "Confirm cancellation"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
