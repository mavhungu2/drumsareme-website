"use client";

import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Music,
  Package,
  Plus,
  Trash2,
  Truck,
} from "lucide-react";
import { AdminApiError, editOrder } from "@/lib/admin/api-client";
import {
  COLLECTION_ADDRESS,
  type EditOrderInput,
  type EditOrderItemInput,
  type Order,
} from "@/lib/admin/orders-types";
import { products as bakedProducts } from "@/lib/products";
import { useLiveCatalog, useLiveOverlay } from "@/lib/use-live-products";
import { formatZar } from "@/lib/admin/format";

type LineRow =
  | { rowId: string; kind: "product"; productId: string; qty: string }
  | {
      rowId: string;
      kind: "service";
      description: string;
      unitPrice: string;
      qty: string;
    };

interface EditOrderFormProps {
  order: Order;
  onSaved: () => void;
  onCancel: () => void;
}

function randomRowId(): string {
  return `row_${Math.random().toString(36).slice(2, 10)}`;
}

function rowsFromOrder(order: Order): LineRow[] {
  return order.items.map((item) =>
    item.productId
      ? {
          rowId: randomRowId(),
          kind: "product" as const,
          productId: item.productId,
          qty: String(item.qty),
        }
      : {
          rowId: randomRowId(),
          kind: "service" as const,
          description: item.name,
          unitPrice: String(item.unitPrice),
          qty: String(item.qty),
        },
  );
}

/** Canonical serialization for change detection. */
function serializeItems(items: EditOrderItemInput[]): string {
  return JSON.stringify(items);
}

function itemsFromRows(rows: LineRow[]): EditOrderItemInput[] {
  return rows.map((row) =>
    row.kind === "product"
      ? { productId: row.productId, qty: Number.parseInt(row.qty, 10) }
      : {
          description: row.description.trim(),
          qty: Number.parseInt(row.qty, 10),
          unitPrice:
            Math.round((Number.parseFloat(row.unitPrice) || 0) * 100) / 100,
        },
  );
}

function itemsFromOrder(order: Order): EditOrderItemInput[] {
  return order.items.map((item) =>
    item.productId
      ? { productId: item.productId, qty: item.qty }
      : { description: item.name, qty: item.qty, unitPrice: item.unitPrice },
  );
}

const FIELD_CLASS =
  "h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function EditOrderForm({
  order,
  onSaved,
  onCancel,
}: EditOrderFormProps) {
  const firstNameId = useId();
  const lastNameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const notesId = useId();
  const discountId = useId();

  const products = useLiveCatalog(bakedProducts);
  const overlay = useLiveOverlay();
  const defaultProductId = products[0]?.id ?? "";

  const [firstName, setFirstName] = useState(order.customer.firstName ?? "");
  const [lastName, setLastName] = useState(order.customer.lastName ?? "");
  const [phone, setPhone] = useState(order.customer.phone ?? "");
  const [email, setEmail] = useState(order.customer.email ?? "");
  const [addressLine1, setAddressLine1] = useState(
    order.customer.addressLine1 ?? "",
  );
  const [suburb, setSuburb] = useState(order.customer.suburb ?? "");
  const [city, setCity] = useState(order.customer.city ?? "");
  const [province, setProvince] = useState(order.customer.province ?? "");
  const [postalCode, setPostalCode] = useState(order.customer.postalCode ?? "");
  const [notes, setNotes] = useState(order.customer.notes ?? "");
  const [rows, setRows] = useState<LineRow[]>(() => rowsFromOrder(order));
  const [deliveryFeeInput, setDeliveryFeeInput] = useState(
    String(order.shipping ?? 0),
  );
  const [discountPercentInput, setDiscountPercentInput] = useState(
    String(order.discountPercent ?? 0),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fulfilment = order.fulfilment ?? "delivery";
  const hasPromo = Boolean(order.promoCode);
  const isPaidOrLater = order.status !== "pending";

  const deliveryFee =
    fulfilment === "delivery"
      ? Math.round(
          Math.max(0, Number.parseFloat(deliveryFeeInput) || 0) * 100,
        ) / 100
      : 0;

  // Mirror server rounding so the preview equals the saved order exactly.
  const discountPercent = hasPromo
    ? 0
    : Math.round(
        Math.min(
          100,
          Math.max(0, Number.parseFloat(discountPercentInput) || 0),
        ) * 100,
      ) / 100;

  const lineTotalFor = useCallback(
    (row: LineRow): number => {
      const qty = Number.parseInt(row.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) return 0;
      if (row.kind === "product") {
        const product = products.find((p) => p.id === row.productId);
        if (product) return product.price * qty;
        // Product no longer in catalog — fall back to the order's stored
        // unit price so the preview stays meaningful.
        const original = order.items.find(
          (item) => item.productId === row.productId,
        );
        return original ? original.unitPrice * qty : 0;
      }
      const price = Number.parseFloat(row.unitPrice);
      return Number.isFinite(price) && price >= 0 ? price * qty : 0;
    },
    [products, order.items],
  );

  const subtotal = useMemo(
    () =>
      Math.round(rows.reduce((sum, row) => sum + lineTotalFor(row), 0) * 100) /
      100,
    [rows, lineTotalFor],
  );

  // For paid/shipped orders stock was already decremented for the CURRENT
  // items, so only the extra units beyond the original quantities need stock.
  const originalQtyByProduct = useMemo(() => {
    const map = new Map<string, number>();
    if (order.inventoryApplied !== true) return map;
    for (const item of order.items) {
      if (!item.productId) continue;
      map.set(item.productId, (map.get(item.productId) ?? 0) + item.qty);
    }
    return map;
  }, [order.inventoryApplied, order.items]);

  const requestedByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.kind !== "product") continue;
      const qty = Number.parseInt(row.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      map.set(row.productId, (map.get(row.productId) ?? 0) + qty);
    }
    return map;
  }, [rows]);

  const stockIssues = useMemo(() => {
    const issues: Array<{ name: string; extra: number; stock: number }> = [];
    requestedByProductId.forEach((requested, productId) => {
      const stock = overlay.get(productId)?.stock;
      if (stock === undefined) return;
      const extra = requested - (originalQtyByProduct.get(productId) ?? 0);
      if (extra > stock) {
        const product = products.find((p) => p.id === productId);
        issues.push({ name: product?.name ?? productId, extra, stock });
      }
    });
    return issues;
  }, [overlay, products, requestedByProductId, originalQtyByProduct]);
  const hasStockIssue = stockIssues.length > 0;

  const discountAmount = hasPromo
    ? (order.discount ?? 0)
    : Math.round(
        Math.min(subtotal, (subtotal * discountPercent) / 100) * 100,
      ) / 100;
  const previewTotal =
    Math.round(
      (Math.max(0, subtotal - discountAmount) + deliveryFee) * 100,
    ) / 100;

  const updateRow = (rowId: string, patch: Partial<LineRow>) => {
    setRows((prev) =>
      prev.map((row) =>
        row.rowId === rowId ? ({ ...row, ...patch } as LineRow) : row,
      ),
    );
  };
  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };
  const addProductRow = () => {
    setRows((prev) => [
      ...prev,
      {
        rowId: randomRowId(),
        kind: "product",
        productId: defaultProductId,
        qty: "1",
      },
    ]);
  };
  const addServiceRow = () => {
    setRows((prev) => [
      ...prev,
      {
        rowId: randomRowId(),
        kind: "service",
        description: "",
        unitPrice: "0",
        qty: "1",
      },
    ]);
  };

  const buildPayload = useCallback(():
    | { ok: true; input: EditOrderInput; changes: string[] }
    | { ok: false; error: string } => {
    const fn = firstName.trim();
    const ph = phone.trim();
    if (!fn) return { ok: false, error: "First name is required." };
    if (!ph) return { ok: false, error: "Phone number is required." };
    if (rows.length === 0)
      return { ok: false, error: "Add at least one item." };

    for (const row of rows) {
      const qty = Number.parseInt(row.qty, 10);
      if (!Number.isInteger(qty) || qty <= 0) {
        return {
          ok: false,
          error: "Every line needs a positive whole-number quantity.",
        };
      }
      if (row.kind === "service") {
        if (!row.description.trim()) {
          return {
            ok: false,
            error: "Give every custom line a description.",
          };
        }
        const price = Number.parseFloat(row.unitPrice);
        if (!Number.isFinite(price) || price < 0) {
          return {
            ok: false,
            error: `Price for "${row.description.trim()}" must be a non-negative number.`,
          };
        }
      }
    }

    const input: EditOrderInput = {};
    const changes: string[] = [];

    const newItems = itemsFromRows(rows);
    if (serializeItems(newItems) !== serializeItems(itemsFromOrder(order))) {
      input.items = newItems;
      changes.push("items");
    }

    const c = order.customer;
    const customerChanged =
      fn !== (c.firstName ?? "") ||
      lastName.trim() !== (c.lastName ?? "") ||
      email.trim() !== (c.email ?? "") ||
      ph !== (c.phone ?? "") ||
      addressLine1.trim() !== (c.addressLine1 ?? "") ||
      suburb.trim() !== (c.suburb ?? "") ||
      city.trim() !== (c.city ?? "") ||
      province.trim() !== (c.province ?? "") ||
      postalCode.trim() !== (c.postalCode ?? "") ||
      notes.trim() !== (c.notes ?? "");
    if (customerChanged) {
      input.customer = {
        firstName: fn,
        lastName: lastName.trim(),
        email: email.trim(),
        phone: ph,
        addressLine1: addressLine1.trim(),
        suburb: suburb.trim(),
        city: city.trim(),
        province: province.trim(),
        postalCode: postalCode.trim(),
        notes: notes.trim(),
      };
      changes.push("customer");
    }

    if (fulfilment === "delivery" && deliveryFee !== (order.shipping ?? 0)) {
      input.deliveryFee = deliveryFee;
      changes.push("delivery fee");
    }

    if (!hasPromo && discountPercent !== (order.discountPercent ?? 0)) {
      input.discountPercent = discountPercent;
      changes.push("discount");
    }

    if (changes.length === 0) {
      return { ok: false, error: "Nothing has changed." };
    }
    return { ok: true, input, changes };
  }, [
    addressLine1,
    city,
    deliveryFee,
    discountPercent,
    email,
    firstName,
    fulfilment,
    hasPromo,
    lastName,
    notes,
    order,
    phone,
    postalCode,
    province,
    rows,
    suburb,
  ]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      const payload = buildPayload();
      if (!payload.ok) {
        setError(payload.error);
        return;
      }
      if (hasStockIssue) {
        const first = stockIssues[0];
        setError(
          `${first.name}: only ${first.stock} more in stock — reduce the quantity.`,
        );
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await editOrder(order.id, payload.input);
        onSaved();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to save changes";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [buildPayload, hasStockIssue, onSaved, order.id, stockIssues, submitting],
  );

  const fulfilmentBadge =
    fulfilment === "collection" ? (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <MapPin size={14} aria-hidden />
        Self-collection — {COLLECTION_ADDRESS.name}, {COLLECTION_ADDRESS.city}
      </span>
    ) : fulfilment === "none" ? (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <Music size={14} aria-hidden />
        Service / no shipping
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
        <Truck size={14} aria-hidden />
        Delivery
      </span>
    );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-5"
    >
      {isPaidOrLater ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This order is already {order.status}. Changing items or fees changes
          the total — settle any difference with the customer manually. Stock
          adjustments apply immediately.
        </p>
      ) : (
        <p className="text-xs text-muted">
          Changes update the pending invoice. Use “Resend invoice” on the order
          page afterwards if the customer should receive the new version.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Customer</h2>
        <p className="text-xs text-muted">
          Edits apply to this order only — the saved customer record is managed
          on the Customers page.
        </p>
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
              onChange={(e) => setFirstName(e.target.value)}
              className={FIELD_CLASS}
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
              onChange={(e) => setLastName(e.target.value)}
              className={FIELD_CLASS}
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
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
          <label
            htmlFor={emailId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>Email</span>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD_CLASS}
            />
          </label>
        </div>
        {fulfilment === "delivery" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
              <span>Street address</span>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              <span>Suburb</span>
              <input
                type="text"
                value={suburb}
                onChange={(e) => setSuburb(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              <span>City</span>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              <span>Province</span>
              <input
                type="text"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              <span>Postal code</span>
              <input
                type="text"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                className={FIELD_CLASS}
              />
            </label>
          </div>
        )}
        <label
          htmlFor={notesId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Order notes</span>
          <input
            id={notesId}
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-foreground">Items</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addProductRow}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface transition-colors"
            >
              <Package size={14} aria-hidden />
              Add product
            </button>
            <button
              type="button"
              onClick={addServiceRow}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-surface transition-colors"
            >
              <Plus size={14} aria-hidden />
              Add custom line
            </button>
          </div>
        </header>
        <div className="space-y-2">
          {rows.map((row) => {
            if (row.kind === "service") {
              return (
                <div
                  key={row.rowId}
                  className="grid grid-cols-12 gap-2 items-end"
                >
                  <label className="col-span-12 sm:col-span-6 flex flex-col gap-1 text-xs font-medium text-muted">
                    <span>Description (service / custom)</span>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) =>
                        updateRow(row.rowId, { description: e.target.value })
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="col-span-3 sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
                    <span>Unit price</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={row.unitPrice}
                      onChange={(e) =>
                        updateRow(row.rowId, { unitPrice: e.target.value })
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                  <label className="col-span-3 sm:col-span-1 flex flex-col gap-1 text-xs font-medium text-muted">
                    <span>Qty</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={row.qty}
                      onChange={(e) =>
                        updateRow(row.rowId, { qty: e.target.value })
                      }
                      className={FIELD_CLASS}
                    />
                  </label>
                  <div className="col-span-4 sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
                    <span>Line total</span>
                    <p className="h-10 inline-flex items-center px-3 text-sm font-semibold tabular-nums">
                      {formatZar(lineTotalFor(row))}
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
                </div>
              );
            }
            const inCatalog = products.some((p) => p.id === row.productId);
            const stockForProduct = overlay.get(row.productId)?.stock;
            const requestedForProduct =
              requestedByProductId.get(row.productId) ?? 0;
            const extraForProduct =
              requestedForProduct -
              (originalQtyByProduct.get(row.productId) ?? 0);
            const overSpec =
              stockForProduct !== undefined && extraForProduct > stockForProduct;
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
                    className={FIELD_CLASS}
                  >
                    {!inCatalog && (
                      <option value={row.productId}>
                        {row.productId} (not in catalog)
                      </option>
                    )}
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
                    className={FIELD_CLASS}
                  />
                </label>
                <div className="col-span-6 sm:col-span-3 flex flex-col gap-1 text-xs font-medium text-muted">
                  <span>Line total</span>
                  <p className="h-10 inline-flex items-center px-3 text-sm font-semibold tabular-nums">
                    {formatZar(lineTotalFor(row))}
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
                        : "text-muted"
                    }`}
                  >
                    {overSpec && <AlertTriangle size={12} aria-hidden />}
                    {overSpec
                      ? `Only ${stockForProduct} more in stock — needs ${extraForProduct} extra`
                      : `${stockForProduct} in stock${
                          originalQtyByProduct.has(row.productId)
                            ? " (beyond this order)"
                            : ""
                        }`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Fulfilment</h2>
        <div className="flex items-center gap-3">
          {fulfilmentBadge}
          <span className="text-xs text-muted">(fixed for this order)</span>
        </div>
        {fulfilment === "delivery" && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            <span>Delivery fee (ZAR)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={deliveryFeeInput}
              onChange={(e) => setDeliveryFeeInput(e.target.value)}
              className={`${FIELD_CLASS} max-w-xs`}
            />
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Discount</h2>
        {hasPromo ? (
          <p className="text-xs text-muted">
            Promo <span className="font-mono">{order.promoCode}</span> is
            applied to this order — its value recalculates automatically if the
            items change.
          </p>
        ) : (
          <label
            htmlFor={discountId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>Percentage off the subtotal (0 clears it)</span>
            <div className="relative max-w-[8rem]">
              <input
                id={discountId}
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={discountPercentInput}
                onChange={(e) => setDiscountPercentInput(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background pl-3 pr-7 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                %
              </span>
            </div>
          </label>
        )}
      </section>

      <section className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <dl className="text-sm text-foreground space-y-1 tabular-nums min-w-[12rem]">
          <div className="flex gap-3 justify-between sm:justify-start">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatZar(subtotal)}</dd>
          </div>
          {discountAmount > 0 && (
            <div className="flex gap-3 justify-between sm:justify-start text-green-700">
              <dt>
                {hasPromo
                  ? `Promo (${order.promoCode})`
                  : `Discount (${discountPercent}%)`}
              </dt>
              <dd>−{formatZar(discountAmount)}</dd>
            </div>
          )}
          {fulfilment !== "none" && (
            <div className="flex gap-3 justify-between sm:justify-start">
              <dt className="text-muted">
                {fulfilment === "collection" ? "Collection" : "Delivery"}
              </dt>
              <dd>{deliveryFee > 0 ? formatZar(deliveryFee) : "Free"}</dd>
            </div>
          )}
          <div className="flex gap-3 justify-between sm:justify-start font-semibold pt-1 border-t border-border mt-1">
            <dt>Total</dt>
            <dd>
              {formatZar(previewTotal)}
              {previewTotal !== (order.total ?? 0) && (
                <span className="ml-2 text-xs font-normal text-muted line-through">
                  {formatZar(order.total ?? 0)}
                </span>
              )}
            </dd>
          </div>
        </dl>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-surface disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
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
              "Save changes"
            )}
          </button>
        </div>
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
