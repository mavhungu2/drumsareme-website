"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AdminApiError,
  createPromo,
  updatePromo,
} from "@/lib/admin/api-client";
import type {
  CreatePromoInput,
  PromoCodeKind,
  PromoListItem,
  UpdatePromoInput,
} from "@/lib/admin/promos-types";

interface PromoFormProps {
  initial: PromoListItem | null;
  onSaved: () => void;
  onCancel: () => void;
}

interface FormState {
  code: string;
  kind: PromoCodeKind;
  value: string;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  maxRedemptions: string;
  firstOrderOnly: boolean;
  notes: string;
}

function toIsoDateOnly(iso: string | undefined): string {
  if (!iso) return "";
  // input[type=date] wants YYYY-MM-DD in local time.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fromIsoDateOnly(local: string): string | null {
  if (!local) return null;
  // Send midnight UTC so the date the admin picks is the date that's
  // displayed everywhere — avoids time-zone shifting the boundary.
  return new Date(`${local}T00:00:00Z`).toISOString();
}

function toInitialState(initial: PromoListItem | null): FormState {
  if (!initial) {
    return {
      code: "",
      kind: "percent",
      value: "10",
      active: true,
      startsAt: "",
      expiresAt: "",
      maxRedemptions: "",
      firstOrderOnly: false,
      notes: "",
    };
  }
  return {
    code: initial.code,
    kind: initial.kind,
    value: String(initial.value),
    active: initial.active,
    startsAt: toIsoDateOnly(initial.startsAt),
    expiresAt: toIsoDateOnly(initial.expiresAt),
    maxRedemptions:
      typeof initial.maxRedemptions === "number"
        ? String(initial.maxRedemptions)
        : "",
    firstOrderOnly: initial.firstOrderOnly,
    notes: initial.notes ?? "",
  };
}

export default function PromoForm({
  initial,
  onSaved,
  onCancel,
}: PromoFormProps) {
  const codeId = useId();
  const valueId = useId();
  const startsId = useId();
  const expiresId = useId();
  const maxId = useId();
  const notesId = useId();

  const [state, setState] = useState<FormState>(toInitialState(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const valueNum = Number.parseFloat(state.value);
    if (!Number.isFinite(valueNum) || valueNum <= 0) {
      setError("Value must be a positive number");
      return;
    }
    if (state.kind === "percent" && valueNum > 100) {
      setError("Percent must be ≤ 100");
      return;
    }
    const maxNum = state.maxRedemptions.trim()
      ? Number.parseInt(state.maxRedemptions, 10)
      : null;
    if (maxNum !== null && (!Number.isInteger(maxNum) || maxNum <= 0)) {
      setError("Max redemptions must be a positive integer");
      return;
    }

    const startsAt = state.startsAt ? fromIsoDateOnly(state.startsAt) : null;
    const expiresAt = state.expiresAt ? fromIsoDateOnly(state.expiresAt) : null;

    setSubmitting(true);
    try {
      if (initial) {
        const updates: UpdatePromoInput = {
          kind: state.kind,
          value: valueNum,
          active: state.active,
          startsAt,
          expiresAt,
          maxRedemptions: maxNum,
          firstOrderOnly: state.firstOrderOnly,
          notes: state.notes,
        };
        await updatePromo(initial.code, updates);
      } else {
        const code = state.code.trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
          setError("Code must be 3–30 chars A-Z 0-9 _ -");
          setSubmitting(false);
          return;
        }
        const input: CreatePromoInput = {
          code,
          kind: state.kind,
          value: valueNum,
          active: state.active,
          firstOrderOnly: state.firstOrderOnly,
          ...(startsAt ? { startsAt } : {}),
          ...(expiresAt ? { expiresAt } : {}),
          ...(maxNum !== null ? { maxRedemptions: maxNum } : {}),
          ...(state.notes.trim() ? { notes: state.notes } : {}),
        };
        await createPromo(input);
      }
      onSaved();
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Save failed",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <label
          htmlFor={codeId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Code {initial ? "(immutable)" : ""}</span>
          <input
            id={codeId}
            type="text"
            required
            disabled={Boolean(initial)}
            value={state.code}
            onChange={(e) =>
              update("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))
            }
            placeholder="LAUNCH15"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-mono uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:bg-surface disabled:text-muted"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>Discount type</span>
          <select
            value={state.kind}
            onChange={(e) => update("kind", e.target.value as PromoCodeKind)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed amount off (ZAR)</option>
          </select>
        </label>
        <label
          htmlFor={valueId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>
            {state.kind === "percent" ? "Percent (1–100)" : "Amount (ZAR)"}
          </span>
          <input
            id={valueId}
            type="number"
            step="0.01"
            min={0}
            required
            value={state.value}
            onChange={(e) => update("value", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={maxId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Max redemptions (blank = unlimited)</span>
          <input
            id={maxId}
            type="number"
            min={1}
            step={1}
            value={state.maxRedemptions}
            onChange={(e) => update("maxRedemptions", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={startsId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Starts on (optional)</span>
          <input
            id={startsId}
            type="date"
            value={state.startsAt}
            onChange={(e) => update("startsAt", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={expiresId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Expires on (optional)</span>
          <input
            id={expiresId}
            type="date"
            value={state.expiresAt}
            onChange={(e) => update("expiresAt", e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={notesId}
          className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2"
        >
          <span>Notes (admin only)</span>
          <textarea
            id={notesId}
            rows={3}
            value={state.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="e.g. Launch promo — runs while we ramp marketing"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.active}
            onChange={(e) => update("active", e.target.checked)}
            className="h-4 w-4 rounded border-border text-foreground focus:ring-accent"
          />
          Active
        </label>
        <label className="inline-flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.firstOrderOnly}
            onChange={(e) => update("firstOrderOnly", e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-foreground focus:ring-accent"
          />
          <span className="flex flex-col">
            <span>First-time customers only</span>
            <span className="text-xs text-muted">
              Checks the customer&apos;s email against past paid orders. The
              checkout will ask for an email before applying.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface disabled:opacity-60 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {submitting && <Loader2 size={14} className="animate-spin" aria-hidden />}
          {initial ? "Save changes" : "Create code"}
        </button>
      </div>
    </form>
  );
}
