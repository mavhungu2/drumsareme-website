"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

interface AddNoteFormProps {
  onAddNote: (body: string) => Promise<void>;
  disabled?: boolean;
}

const MAX_LENGTH = 2000;

export default function AddNoteForm({ onAddNote, disabled }: AddNoteFormProps) {
  const textareaId = useId();
  const counterId = useId();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !submitting && !disabled;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      try {
        await onAddNote(trimmed);
        setBody("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to add note";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, onAddNote, trimmed],
  );

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-2" noValidate>
      <label htmlFor={textareaId} className="sr-only">
        Add a note
      </label>
      <textarea
        id={textareaId}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_LENGTH))}
        placeholder="Add a note (visible to admins only)"
        maxLength={MAX_LENGTH}
        rows={3}
        disabled={submitting || disabled}
        aria-describedby={counterId}
        className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3">
        <span id={counterId} className="text-xs text-muted tabular-nums" aria-live="polite">
          {body.length} / {MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Adding…
            </>
          ) : (
            "Add note"
          )}
        </button>
      </div>
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
