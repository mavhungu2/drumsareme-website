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
import {
  AdminApiError,
  createManualSale,
} from "@/lib/admin/api-client";
import type {
  ManualSaleInput,
  ManualSaleItemInput,
  ManualSaleResponse,
} from "@/lib/admin/analytics-types";
import {
  COLLECTION_ADDRESS,
  type Fulfilment,
} from "@/lib/admin/orders-types";
import { products as bakedProducts } from "@/lib/products";
import { useLiveCatalog, useLiveOverlay } from "@/lib/use-live-products";
import { formatZar } from "@/lib/admin/format";
import CustomerPicker, {
  type PickerCustomer,
} from "./CustomerPicker";

type LineRow =
  | { rowId: string; kind: "product"; productId: string; qty: string }
  | {
      rowId: string;
      kind: "service";
      description: string;
      unitPrice: string;
      qty: string;
    };

interface ManualSaleFormProps {
  onSubmitted: (response: ManualSaleResponse) => void;
}

function randomRowId(): string {
  return `row_${Math.random().toString(36).slice(2, 10)}`;
}

function newProductRow(productId: string): LineRow {
  return { rowId: randomRowId(), kind: "product", productId, qty: "1" };
}

function newServiceRow(): LineRow {
  return {
    rowId: randomRowId(),
    kind: "service",
    description: "",
    unitPrice: "0",
    qty: "1",
  };
}

export default function ManualSaleForm({ onSubmitted }: ManualSaleFormProps) {
  const firstNameId = useId();
  const lastNameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const notesId = useId();
  const discountId = useId();

  // Live catalog merges baked products with Firestore so SKUs added via the
  // admin UI appear in the dropdown without a redeploy.
  const products = useLiveCatalog(bakedProducts);
  const defaultProductId = products[0]?.id ?? "";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineRow[]>([
    newProductRow(defaultProductId),
  ]);
  const [fulfilment, setFulfilment] = useState<Fulfilment>("delivery");
  const [deliveryFeeInput, setDeliveryFeeInput] = useState("0");
  const [discountPercentInput, setDiscountPercentInput] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedCustomer, setPickedCustomer] = useState<PickerCustomer | null>(
    null,
  );

  const deliveryFee =
    fulfilment === "delivery"
      ? Math.max(0, Number.parseFloat(deliveryFeeInput) || 0)
      : 0;

  const overlay = useLiveOverlay();

  const handlePickCustomer = useCallback((customer: PickerCustomer | null) => {
    setPickedCustomer(customer);
    if (customer) {
      setFirstName(customer.firstName);
      setLastName(customer.lastName);
      setPhone(customer.phone);
      setEmail(customer.email);
    }
  }, []);

  const lineTotalFor = useCallback(
    (row: LineRow): number => {
      const qty = Number.parseInt(row.qty, 10);
      if (!Number.isFinite(qty) || qty <= 0) return 0;
      if (row.kind === "product") {
        const product = products.find((p) => p.id === row.productId);
        return product ? product.price * qty : 0;
      }
      const price = Number.parseFloat(row.unitPrice);
      return Number.isFinite(price) && price >= 0 ? price * qty : 0;
    },
    [products],
  );

  const subtotal = useMemo(
    () => rows.reduce((sum, row) => sum + lineTotalFor(row), 0),
    [rows, lineTotalFor],
  );

  // Ad-hoc manual percentage discount (0–100), applied to the subtotal.
  // Round to 2dp to mirror the server (adminManualSales validate()), so the
  // live preview matches the saved invoice exactly.
  const discountPercent =
    Math.round(
      Math.min(100, Math.max(0, Number.parseFloat(discountPercentInput) || 0)) *
        100,
    ) / 100;
  const discountAmount =
    Math.round(Math.min(subtotal, (subtotal * discountPercent) / 100) * 100) /
    100;
  const previewTotal =
    Math.round((Math.max(0, subtotal - discountAmount) + deliveryFee) * 100) /
    100;

  // Sum requested qty per productId so the same SKU on multiple rows is
  // checked against the combined total (matches what the server does).
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
      prev.map((row) =>
        row.rowId === rowId ? ({ ...row, ...patch } as LineRow) : row,
      ),
    );
  };
  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.rowId !== rowId));
  };
  const addProductRow = () => {
    setRows((prev) => [...prev, newProductRow(defaultProductId)]);
  };
  const addServiceRow = () => {
    setRows((prev) => [...prev, newServiceRow()]);
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

      const items: ManualSaleItemInput[] = [];
      for (const row of rows) {
        const qty = Number.parseInt(row.qty, 10);
        if (!Number.isInteger(qty) || qty <= 0) {
          return setError("Every line needs a positive whole-number quantity.");
        }
        if (row.kind === "product") {
          const product = products.find((p) => p.id === row.productId);
          if (!product) return setError("Pick a product for every line.");
          items.push({ productId: product.id, qty });
        } else {
          const description = row.description.trim();
          if (!description) {
            return setError("Give every custom line a description.");
          }
          const unitPrice = Number.parseFloat(row.unitPrice);
          if (!Number.isFinite(unitPrice) || unitPrice < 0) {
            return setError(
              `Price for "${description}" must be a non-negative number.`,
            );
          }
          items.push({ description, qty, unitPrice });
        }
      }

      if (stockIssues.length > 0) {
        const first = stockIssues[0];
        return setError(
          `${first.name} only has ${first.stock} in stock — reduce the quantity or remove the line.`,
        );
      }

      if (
        fulfilment === "delivery" &&
        (!Number.isFinite(deliveryFee) || deliveryFee < 0)
      ) {
        return setError("Delivery fee must be a non-negative number.");
      }

      if (discountPercent < 0 || discountPercent > 100) {
        return setError("Discount must be between 0 and 100%.");
      }

      const addressLine1Trim = addressLine1.trim();
      const cityTrim = city.trim();
      const provinceTrim = province.trim();
      const postalCodeTrim = postalCode.trim();

      setSubmitting(true);
      setError(null);
      try {
        const payload: ManualSaleInput = {
          customer: {
            firstName: fn,
            lastName: ln,
            phone: ph,
            email: email.trim() || undefined,
            ...(fulfilment === "delivery"
              ? {
                  ...(addressLine1Trim ? { addressLine1: addressLine1Trim } : {}),
                  ...(suburb.trim() ? { suburb: suburb.trim() } : {}),
                  ...(cityTrim ? { city: cityTrim } : {}),
                  ...(provinceTrim ? { province: provinceTrim } : {}),
                  ...(postalCodeTrim ? { postalCode: postalCodeTrim } : {}),
                }
              : {}),
          },
          items,
          fulfilment,
          deliveryFee,
          notes: notes.trim() || undefined,
          ...(discountPercent > 0 ? { discountPercent } : {}),
        };
        const response = await createManualSale(payload);
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
      addressLine1,
      city,
      deliveryFee,
      discountPercent,
      email,
      firstName,
      fulfilment,
      lastName,
      notes,
      onSubmitted,
      phone,
      postalCode,
      products,
      province,
      rows,
      stockIssues,
      suburb,
    ],
  );

  const fulfilmentOptions: Array<{
    value: Fulfilment;
    label: string;
    hint: string;
    icon: typeof Truck;
  }> = [
    {
      value: "delivery",
      label: "Delivery",
      hint: "Ships to the customer’s address",
      icon: Truck,
    },
    {
      value: "collection",
      label: "Self-collection",
      hint: `${COLLECTION_ADDRESS.name}, ${COLLECTION_ADDRESS.line1}, ${COLLECTION_ADDRESS.city}`,
      icon: MapPin,
    },
    {
      value: "none",
      label: "Service / no shipping",
      hint: "For gigs & performances — no delivery",
      icon: Music,
    },
  ];

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-border bg-background p-5 sm:p-6 space-y-5"
    >
      <p className="text-xs text-muted">
        This saves the order as <strong>pending</strong> and emails the
        customer the invoice with EFT details. Open the order from the list
        to capture payment method and decrement stock when payment lands.
      </p>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Customer</h2>
        <CustomerPicker selected={pickedCustomer} onPick={handlePickCustomer} />
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
                      placeholder="e.g. Drumming performance — 2hr set"
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                      className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
            const product = products.find((p) => p.id === row.productId);
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
                {!product && (
                  <p className="col-span-12 text-xs text-amber-700">
                    Pick a product for this line.
                  </p>
                )}
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
                    {overSpec && <AlertTriangle size={12} aria-hidden />}
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
        <h2 className="text-base font-semibold text-foreground">Fulfilment</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {fulfilmentOptions.map((opt) => {
            const Icon = opt.icon;
            const active = fulfilment === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
                  active
                    ? "border-foreground bg-surface"
                    : "border-border bg-background hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="fulfilment"
                  value={opt.value}
                  checked={active}
                  onChange={() => setFulfilment(opt.value)}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Icon size={14} aria-hidden />
                  {opt.label}
                </span>
                <span className="block text-xs text-muted mt-0.5">
                  {opt.hint}
                </span>
              </label>
            );
          })}
        </div>
        {fulfilment === "delivery" && (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-medium text-muted">
                <span>Street address (optional)</span>
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  placeholder="123 Example Rd"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                <span>Suburb (optional)</span>
                <input
                  type="text"
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                <span>City (optional)</span>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                <span>Province (optional)</span>
                <input
                  type="text"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="GP / WC / KZN…"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                <span>Postal code (optional)</span>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              <span>Delivery fee (ZAR)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={deliveryFeeInput}
                onChange={(e) => setDeliveryFeeInput(e.target.value)}
                className="h-10 max-w-xs rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </label>
          </>
        )}
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

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Discount</h2>
        <label
          htmlFor={discountId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>Percentage off the subtotal (optional)</span>
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
      </section>

      <section className="border-t border-border pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <dl className="text-sm text-foreground space-y-1 tabular-nums min-w-[12rem]">
          <div className="flex gap-3 justify-between sm:justify-start">
            <dt className="text-muted">Subtotal</dt>
            <dd>{formatZar(subtotal)}</dd>
          </div>
          {discountAmount > 0 && (
            <div className="flex gap-3 justify-between sm:justify-start text-green-700">
              <dt>Discount ({discountPercent}%)</dt>
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
            <dd>{formatZar(previewTotal)}</dd>
          </div>
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
