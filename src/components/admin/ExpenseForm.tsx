"use client";

import { useCallback, useId, useState, type FormEvent } from "react";
import { Loader2, PlusCircle } from "lucide-react";
import {
  AdminApiError,
  createExpense,
} from "@/lib/admin/api-client";
import {
  EXPENSE_TYPES,
  EXPENSE_TYPE_LABEL,
  type ExpenseType,
} from "@/lib/admin/expenses-types";

interface ExpenseFormProps {
  onAdded: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({ onAdded }: ExpenseFormProps) {
  const dateId = useId();
  const typeId = useId();
  const descId = useId();
  const amountId = useId();
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState<ExpenseType>("materials");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const desc = description.trim();
      const amountValue = Number.parseFloat(amount);
      if (!desc) {
        setError("Description is required.");
        return;
      }
      if (!Number.isFinite(amountValue) || amountValue < 0) {
        setError("Amount must be a non-negative number.");
        return;
      }
      const dateParsed = new Date(`${date}T12:00:00`);
      if (Number.isNaN(dateParsed.getTime())) {
        setError("Invalid date.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await createExpense({
          date: dateParsed.toISOString(),
          type,
          description: desc,
          amount: amountValue,
        });
        setDescription("");
        setAmount("");
        onAdded();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to add expense";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [amount, date, description, onAdded, type],
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-background p-4 sm:p-5 space-y-3"
    >
      <h2 className="text-base font-semibold text-foreground">Log expense</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label htmlFor={dateId} className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>Date</span>
          <input
            id={dateId}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label htmlFor={typeId} className="flex flex-col gap-1 text-xs font-medium text-muted">
          <span>Type</span>
          <select
            id={typeId}
            value={type}
            onChange={(e) => setType(e.target.value as ExpenseType)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>
                {EXPENSE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor={descId}
          className="flex flex-col gap-1 text-xs font-medium text-muted lg:col-span-2"
        >
          <span>Description</span>
          <input
            id={descId}
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Hickory blanks order"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <label
          htmlFor={amountId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Amount (ZAR)</span>
          <input
            id={amountId}
            type="number"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        <div className="lg:col-span-4 flex justify-end">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Adding…
              </>
            ) : (
              <>
                <PlusCircle size={14} aria-hidden />
                Add expense
              </>
            )}
          </button>
        </div>
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
