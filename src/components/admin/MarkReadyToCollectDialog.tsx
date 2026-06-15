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
  markReadyToCollect,
  type MarkReadyToCollectInput,
} from "@/lib/admin/api-client";
import Dialog from "./Dialog";

interface MarkReadyToCollectDialogProps {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onReady: () => void;
}

interface FormState {
  collectorName: string;
  collectorContact: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  collectorName: "",
  collectorContact: "",
  note: "",
};

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function buildPayload(form: FormState): MarkReadyToCollectInput {
  const payload: MarkReadyToCollectInput = {};
  const name = form.collectorName.trim();
  const contact = form.collectorContact.trim();
  const note = form.note.trim();
  if (name) payload.collectorName = name;
  if (contact) payload.collectorContact = contact;
  if (note) payload.note = note;
  return payload;
}

export default function MarkReadyToCollectDialog({
  orderId,
  open,
  onClose,
  onReady,
}: MarkReadyToCollectDialogProps) {
  const titleId = useId();
  const nameId = useId();
  const contactId = useId();
  const noteId = useId();

  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        await markReadyToCollect(orderId, buildPayload(form));
        onReady();
        onClose();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to mark ready to collect";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [form, onClose, onReady, orderId, submitting],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      initialFocusRef={firstFieldRef}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          Mark ready to collect
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
        <p className="text-xs text-muted">
          The customer is emailed that their order is ready. Collector details
          are optional — fill them only if someone else (e.g. a courier) is
          collecting on their behalf.
        </p>

        <label
          htmlFor={nameId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Collector name (optional)</span>
          <input
            ref={firstFieldRef}
            id={nameId}
            type="text"
            maxLength={200}
            autoComplete="off"
            value={form.collectorName}
            onChange={(e) => update("collectorName", e.target.value)}
            placeholder="e.g. the customer, or a courier"
            className={FIELD_CLASS}
            disabled={submitting}
          />
        </label>

        <label
          htmlFor={contactId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Collector contact (optional)</span>
          <input
            id={contactId}
            type="text"
            maxLength={200}
            autoComplete="off"
            value={form.collectorContact}
            onChange={(e) => update("collectorContact", e.target.value)}
            placeholder="Phone number"
            className={FIELD_CLASS}
            disabled={submitting}
          />
        </label>

        <label
          htmlFor={noteId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Note (optional)</span>
          <input
            id={noteId}
            type="text"
            maxLength={200}
            autoComplete="off"
            value={form.note}
            onChange={(e) => update("note", e.target.value)}
            placeholder="e.g. Bolt driver collecting Friday"
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
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Marking ready…
              </>
            ) : (
              "Mark ready to collect"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
