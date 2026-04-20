import type { OrderStatus } from "./orders-types";

const ZAR_FORMATTER = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
});

export function formatZar(value: number): string {
  return ZAR_FORMATTER.format(value);
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium",
});

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMATTER.format(date);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_ONLY_FORMATTER.format(date);
}

/**
 * Tailwind classes for each order status. Kept as a lookup table so the badge
 * component stays purely declarative.
 */
export const ORDER_STATUS_CLASSES: Readonly<Record<OrderStatus, string>> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-green-light/20 text-green border-green/30",
  failed: "bg-red-100 text-red-800 border-red-200",
  shipped: "bg-blue-100 text-blue-800 border-blue-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};
