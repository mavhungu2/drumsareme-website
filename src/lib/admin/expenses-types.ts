/**
 * Mirror of functions/src/adminExpenses.ts response shapes. Keep in sync.
 */
export type ExpenseType =
  | "materials"
  | "shipping"
  | "marketing"
  | "operations"
  | "other";

export const EXPENSE_TYPES: ReadonlyArray<ExpenseType> = [
  "materials",
  "shipping",
  "marketing",
  "operations",
  "other",
];

export const EXPENSE_TYPE_LABEL: Readonly<Record<ExpenseType, string>> = {
  materials: "Materials",
  shipping: "Shipping",
  marketing: "Marketing",
  operations: "Operations",
  other: "Other",
};

export interface ExpenseListItem {
  id: string;
  date: string;
  type: ExpenseType;
  description: string;
  amount: number;
  createdAt: string;
  createdBy: string;
}

export interface ListExpensesResponse {
  items: ExpenseListItem[];
  /** Sum over the WHOLE filtered set, not just the returned page. */
  total: number;
  /** Number of expenses matching the filters. */
  count: number;
  /** True when more rows match than were returned in `items`. */
  truncated: boolean;
  /** False when the total is a page-only fallback (aggregate unavailable). */
  exact: boolean;
}

export interface ListExpensesQuery {
  from?: string;
  to?: string;
  /** Omit (or "all") for every type. */
  type?: ExpenseType | "all";
  limit?: number;
}

export interface CreateExpenseInput {
  date: string;
  type: ExpenseType;
  description: string;
  amount: number;
}
