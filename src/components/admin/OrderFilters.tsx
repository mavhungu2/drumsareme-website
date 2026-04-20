"use client";

import { Search } from "lucide-react";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUSES,
  type OrderStatus,
} from "@/lib/admin/orders-types";

export interface OrderFiltersValue {
  status: OrderStatus | "";
  q: string;
  from: string;
  to: string;
  hideCancelled: boolean;
}

interface OrderFiltersProps {
  value: OrderFiltersValue;
  onChange: (next: OrderFiltersValue) => void;
  disabled?: boolean;
}

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function OrderFilters({
  value,
  onChange,
  disabled,
}: OrderFiltersProps) {
  const update = <K extends keyof OrderFiltersValue>(
    key: K,
    next: OrderFiltersValue[K],
  ) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <fieldset
      disabled={disabled}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      <legend className="sr-only">Order filters</legend>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted lg:col-span-2">
        <span>Search</span>
        <span className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            aria-hidden
          />
          <input
            type="search"
            value={value.q}
            onChange={(e) => update("q", e.target.value)}
            placeholder="Search ref or email…"
            className={`${FIELD_CLASS} pl-9`}
          />
        </span>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        <span>Status</span>
        <select
          value={value.status}
          onChange={(e) => update("status", e.target.value as OrderStatus | "")}
          className={FIELD_CLASS}
        >
          <option value="">All</option>
          {ORDER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {ORDER_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        <span>From</span>
        <input
          type="date"
          value={value.from}
          onChange={(e) => update("from", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        <span>To</span>
        <input
          type="date"
          value={value.to}
          onChange={(e) => update("to", e.target.value)}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-foreground lg:col-span-5">
        <input
          type="checkbox"
          checked={value.hideCancelled}
          onChange={(e) => update("hideCancelled", e.target.checked)}
          className="h-4 w-4 rounded border-border text-foreground focus:ring-accent"
        />
        Hide cancelled orders
      </label>
    </fieldset>
  );
}
