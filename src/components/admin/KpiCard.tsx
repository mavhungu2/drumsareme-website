"use client";

import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "warn";
}

const TONE_CLASSES: Readonly<Record<NonNullable<KpiCardProps["tone"]>, string>> = {
  default: "text-foreground",
  positive: "text-green",
  negative: "text-red-700",
  warn: "text-amber-700",
};

export default function KpiCard({
  label,
  value,
  hint,
  tone = "default",
}: KpiCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5 sm:p-6">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-2 text-2xl sm:text-3xl font-semibold tabular-nums ${TONE_CLASSES[tone]}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
