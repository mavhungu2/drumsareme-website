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
}

export interface ListExpensesQuery {
  from?: string;
  to?: string;
  limit?: number;
}

export interface CreateExpenseInput {
  date: string;
  type: ExpenseType;
  description: string;
  amount: number;
}
