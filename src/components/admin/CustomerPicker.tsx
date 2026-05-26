"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { Search, UserPlus, X } from "lucide-react";
import { listCustomers } from "@/lib/admin/api-client";
import type { CustomerListItem } from "@/lib/admin/customers-types";
import { formatZar } from "@/lib/admin/format";

export interface PickerCustomer {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

interface CustomerPickerProps {
  /** Called when the admin selects an existing customer or clears the picker. */
  onPick: (customer: PickerCustomer | null) => void;
  /**
   * If provided, used as the visible "selected" chip. Pass null when no
   * customer is currently picked so the search box re-appears.
   */
  selected: PickerCustomer | null;
}

function customerToPicker(c: CustomerListItem): PickerCustomer {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone ?? "",
    email: c.email ?? "",
  };
}

function customerDisplayName(c: CustomerListItem): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

function matches(query: string, c: CustomerListItem): boolean {
  const q = query.toLowerCase();
  return (
    customerDisplayName(c).toLowerCase().includes(q) ||
    (c.email ?? "").toLowerCase().includes(q) ||
    (c.phone ?? "").toLowerCase().includes(q)
  );
}

export default function CustomerPicker({
  onPick,
  selected,
}: CustomerPickerProps) {
  const inputId = useId();
  const listboxId = useId();

  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCustomers()
      .then((response) => {
        if (cancelled) return;
        setCustomers(response.items ?? []);
      })
      .catch(() => {
        // Fail open — admin can still type a fresh customer.
        if (cancelled) return;
        setCustomers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) return customers.slice(0, 8);
    return customers.filter((c) => matches(trimmed, c)).slice(0, 8);
  }, [customers, query]);

  const handleSelect = useCallback(
    (c: CustomerListItem) => {
      onPick(customerToPicker(c));
      setOpen(false);
      setQuery("");
      setHighlight(0);
    },
    [onPick],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!open) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => Math.min(filtered.length - 1, h + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => Math.max(0, h - 1));
      } else if (e.key === "Enter") {
        const choice = filtered[highlight];
        if (choice) {
          e.preventDefault();
          handleSelect(choice);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    },
    [filtered, handleSelect, highlight, open],
  );

  if (selected) {
    const fullName =
      `${selected.firstName} ${selected.lastName}`.trim() || "Customer";
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground/30 bg-surface px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-foreground truncate">{fullName}</p>
          <p className="text-xs text-muted truncate">
            {selected.phone || "—"}
            {selected.email ? ` · ${selected.email}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
        >
          <X size={12} aria-hidden />
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <label
        htmlFor={inputId}
        className="flex flex-col gap-1 text-xs font-medium text-muted"
      >
        <span>Find existing customer (optional)</span>
        <span className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            aria-hidden
          />
          <input
            id={inputId}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={handleKey}
            placeholder={
              loading
                ? "Loading customers…"
                : "Search by name, phone or email"
            }
            disabled={loading}
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
            autoComplete="off"
          />
        </span>
      </label>

      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-auto rounded-lg border border-border bg-background shadow-lg"
        >
          {filtered.map((c, i) => {
            const fullName = customerDisplayName(c) || "—";
            const meta = [
              c.phone || null,
              c.email || null,
              c.totalOrders > 0
                ? `${c.totalOrders} order${c.totalOrders === 1 ? "" : "s"}`
                : null,
              c.totalSpend > 0 ? formatZar(c.totalSpend) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(c);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    i === highlight ? "bg-surface" : "hover:bg-surface"
                  }`}
                >
                  <p className="font-medium text-foreground">{fullName}</p>
                  <p className="text-xs text-muted truncate">{meta || "—"}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && !loading && filtered.length === 0 && query.trim().length > 0 && (
        <div className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted shadow-lg">
          <span className="inline-flex items-center gap-1.5">
            <UserPlus size={12} aria-hidden />
            No match — type the customer below to record a new one.
          </span>
        </div>
      )}
    </div>
  );
}
