"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import {
  AdminApiError,
  createManualSale,
} from "@/lib/admin/api-client";
import type { ManualSaleResponse } from "@/lib/admin/analytics-types";
import { products as bakedProducts } from "@/lib/products";
import { useLiveCatalog, useLiveOverlay } from "@/lib/use-live-products";
import { formatZar } from "@/lib/admin/format";
import CustomerPicker, {
  type PickerCustomer,
} from "./CustomerPicker";

interface LineRow {
  rowId: string;
  productId: string;
  qty: string;
}

interface ManualSaleFormProps {
  onSubmitted: (response: ManualSaleResponse) => void;
}

function newRow(productId: string): LineRow {
  return {
    rowId: `row_${Math.random().toString(36).slice(2, 10)}`,
    productId,
    qty: "1",
  };
}

export default function ManualSaleForm({ onSubmitted }: ManualSaleFormProps) {
  const firstNameId = useId();
  const lastNameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const notesId = useId();

  // Live catalog merges baked products with Firestore so SKUs added via the
  // admin UI appear in the dropdown without a redeploy.
  const products = useLiveCatalog(bakedProducts);
  const defaultProductId = products[0]?.id ?? "";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineRow[]>([newRow(defaultProductId)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedCustomer, setPickedCustomer] = useState<PickerCustomer | null>(
    null,
  );

  const overlay = useLiveOverlay();

  const handlePickCustomer = useCallback(
    (customer: PickerCustomer | null) => {
      setPickedCustomer(customer);
      if (customer) {
        setFirstName(customer.firstName);
        setLastName(customer.lastName);
        setPhone(customer.phone);
        setEmail(customer.email);
      }
    },
    [],
  );

  const subtotal = useMemo(() => {
    return rows.reduce((sum, row) => {
      const product = products.find((p) => p.id === row.productId);
      const qty = Number.parseInt(row.qty, 10);
      if (!product || !Number.isFinite(qty) || qty <= 0) return sum;
      return sum + product.price * qty;
    }, 0);
  }, [products, rows]);

  // Sum requested qty per productId so the same SKU appearing on multiple
  // rows is checked against the combined total (matches what the server
  // does when it walks orderItems).
  const requestedByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const qty = Number.parseInt(row.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      map.set(row.productId, (map.get(row.productId) ?? 0) + qty);
    }
    return map;
  }, [rows]);

  const stockIssues = useMemo(() => {
    const issues: Array<{
      productId: string;
      name: string;
      requested: number;
      stock: number;
    }> = [];
    requestedByProductId.forEach((requested, productId) => {
      const stock = overlay.get(productId)?.stock;
      if (stock === undefined) return;
      if (requested > stock) {
        const product = products.find((p) => p.id === productId);
        issues.push({
          productId,
          name: product?.name ?? productId,
          requested,
          stock,
        });
      }
    });
    return issues;
  }, [overlay, products, requestedByProductId]);
  const hasStockIssue = stockIssues.length > 0;

  const updateRow = (rowId: string, patch: Partial<LineRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
    );
  };
  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };
  const addRow = () => {
    setRows((prev) => [...prev, newRow(defaultProductId)]);
  };

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const fn = firstName.trim();
      const ln = lastName.trim();
      const ph = phone.trim();
      if (!fn) return setError("First name is required.");
      if (!ln) return setError("Last name is required.");
      if (!ph) return setError("Phone number is required.");
      if (rows.length === 0) return setError("Add at least one item.");

      const items: { productId: string; qty: number }[] = [];
      for (const row of rows) {
        const product = products.find((p) => p.id === row.productId);
        if (!product) return setError("Pick a product for every line.");
        const qty = Number.parseInt(row.qty, 10);
        if (!Number.isInteger(qty) || qty <= 0) {
          return setError(
            `Quantity for ${product.name} must be a positive whole number.`,
          );
        }
        items.push({ productId: product.id, qty });
      }

      if (stockIssues.length > 0) {
        const first = stockIssues[0];
        return setError(
          `${first.name} only has ${first.stock} in stock — reduce the quantity or remove the line.`,
        );
      }

      setSubmitting(true);
      setError(null);
      try {
        const response = await createManualSale({
          customer: {
            firstName: fn,
            lastName: ln,
            phone: ph,
            email: email.trim() || undefined,
          },
          items,
          notes: notes.trim() || undefined,
        });
        onSubmitted(response);
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to record sale";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      email,
      firstName,
      lastName,
      notes,
      onSubmitted,
      phone,
      rows,
      stockIssues,
    ],
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-5"
    >
      <p className="text-xs text-muted">
        This saves the order as <strong>pending</strong>. Open the order from
        the list to capture payment method, fulfilment, and decrement stock
        when payment lands.
      </p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Customer</h2>
        <CustomerPicker
          selected={pickedCustomer}
          onPick={handlePickCustomer}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label
            htmlFor={firstNameId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>First name</span>
            <input
              id={firstNameId}
              type="text"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value);
                if (pickedCustomer) setPickedCustomer(null);
              }}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <label
            htmlFor={lastNameId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>Last name</span>
            <input
              id={lastNameId}
              type="text"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value);
                if (pickedCustomer) setPickedCustomer(null);
              }}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <label
            htmlFor={phoneId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>Phone</span>
            <input
              id={phoneId}
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (pickedCustomer) setPickedCustomer(null);
              }}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
          <label
            htmlFor={emailId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>Email (optional)</span>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (pickedCustomer) setPickedCustomer(null);
              }}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Items</h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface transition-colors"
          >
            <Plus size={14} aria-hidden />
            Add line
          </button>
        </header>
        <div className="space-y-2">
          {rows.map((row) => {
            const product = products.find((p) => p.id === row.productId);
            const qty = Number.parseInt(row.qty, 10);
            const lineTotal =
              product && Number.isFinite(qty) && qty > 0
                ? product.price * qty
                : 0;
            const stockForProduct = overlay.get(row.productId)?.stock;
            const requestedForProduct =
              requestedByProductId.get(row.productId) ?? 0;
            const overSpec =
              stockForProduct !== undefined &&
              requestedForProduct > stockForProduct;
            return (
              <div
                key={row.rowId}
                className={`grid grid-cols-12 gap-2 items-end rounded-lg ${
                  overSpec ? "bg-red-50/40 p-2 -mx-2" : ""
                }`}
              >
                <label className="col-span-12 sm:col-span-6 flex flex-col gap-1 text-xs font-medium text-muted">
                  <span>Product</span>
                  <select
                    value={row.productId}
                    onChange={(e) =>
                      updateRow(row.rowId, { productId: e.target.value })
                    }
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {formatZar(p.price)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-4 sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
                  <span>Qty</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(row.rowId, { qty: e.target.value })
                    }
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                </label>
                <div className="col-span-6 sm:col-span-3 flex flex-col gap-1 text-xs font-medium text-muted">
                  <span>Line total</span>
                  <p className="h-10 inline-flex items-center px-3 text-sm font-semibold tabular-nums">
                    {formatZar(lineTotal)}
                  </p>
                </div>
                <div className="col-span-2 sm:col-span-1 flex items-center justify-end pb-1">
                  <button
                    type="button"
                    onClick={() => removeRow(row.rowId)}
                    disabled={rows.length === 1}
                    aria-label="Remove line"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                {stockForProduct !== undefined && (
                  <p
                    className={`col-span-12 text-xs ${
                      overSpec
                        ? "text-red-700 font-medium flex items-center gap-1.5"
                        : stockForProduct <= 3
                          ? "text-amber-700"
                          : "text-muted"
                    }`}
                  >
                    {overSpec && (
                      <AlertTriangle size={12} aria-hidden />
                    )}
                    {overSpec
                      ? `Only ${stockForProduct} in stock — requested ${requestedForProduct}`
                      : stockForProduct <= 0
                        ? "Sold out"
                        : `${stockForProduct} in stock`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Notes</h2>
        <label
          htmlFor={notesId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Optional internal notes</span>
          <input
            id={notesId}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
      </section>

      <section className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <dl className="text-sm text-foreground space-y-1 tabular-nums">
          <div className="flex gap-3 justify-between sm:justify-start font-semibold">
            <dt>Subtotal</dt>
            <dd>{formatZar(subtotal)}</dd>
          </div>
          <p className="text-xs text-muted font-normal">
            Delivery fee added when marking the order paid.
          </p>
        </dl>
        <button
          type="submit"
          disabled={submitting || hasStockIssue}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          title={hasStockIssue ? "Resolve stock issues to save" : undefined}
        >
          {submitting ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              Saving…
            </>
          ) : hasStockIssue ? (
            "Resolve stock issues"
          ) : (
            "Save as pending"
          )}
        </button>
      </section>

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
