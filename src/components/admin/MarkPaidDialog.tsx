"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Loader2, MapPin, Truck, X } from "lucide-react";
import { AdminApiError, markOrderPaid } from "@/lib/admin/api-client";
import {
  COLLECTION_ADDRESS,
  MANUAL_PAYMENT_METHOD_LABEL,
  type Fulfilment,
  type ManualPaymentMethod,
} from "@/lib/admin/orders-types";
import Dialog from "./Dialog";

interface MarkPaidDialogProps {
  orderId: string;
  open: boolean;
  onClose: () => void;
  onMarked: () => void;
}

const PAYMENTS: ManualPaymentMethod[] = ["cash", "card", "eft"];

const FIELD_CLASS =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default function MarkPaidDialog({
  orderId,
  open,
  onClose,
  onMarked,
}: MarkPaidDialogProps) {
  const titleId = useId();
  const paymentId = useId();
  const deliveryId = useId();
  const firstFieldRef = useRef<HTMLSelectElement | null>(null);

  const [paymentMethod, setPaymentMethod] =
    useState<ManualPaymentMethod>("cash");
  const [fulfilment, setFulfilment] = useState<Fulfilment>("delivery");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaymentMethod("cash");
    setFulfilment("delivery");
    setDeliveryFee("0");
    setSubmitting(false);
    setError(null);
  }, [open]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      const fee =
        fulfilment === "collection" ? 0 : Number.parseFloat(deliveryFee);
      if (fulfilment === "delivery" && (!Number.isFinite(fee) || fee < 0)) {
        setError("Delivery fee must be a non-negative number.");
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        await markOrderPaid(orderId, {
          manualPaymentMethod: paymentMethod,
          fulfilment,
          deliveryFee: fulfilment === "delivery" ? fee : 0,
        });
        onMarked();
        onClose();
      } catch (err) {
        const message =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to mark as paid";
        setError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [
      deliveryFee,
      fulfilment,
      onClose,
      onMarked,
      orderId,
      paymentMethod,
      submitting,
    ],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      titleId={titleId}
      initialFocusRef={firstFieldRef}
    >
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          Mark order as paid
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close dialog"
          className="rounded-md p-1 text-muted transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4" noValidate>
        <label
          htmlFor={paymentId}
          className="flex flex-col gap-1 text-xs font-medium text-muted"
        >
          <span>
            Payment method <span className="text-red-700">*</span>
          </span>
          <select
            ref={firstFieldRef}
            id={paymentId}
            value={paymentMethod}
            onChange={(e) =>
              setPaymentMethod(e.target.value as ManualPaymentMethod)
            }
            disabled={submitting}
            className={FIELD_CLASS}
          >
            {PAYMENTS.map((p) => (
              <option key={p} value={p}>
                {MANUAL_PAYMENT_METHOD_LABEL[p]}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2" disabled={submitting}>
          <legend className="text-xs font-medium text-muted">
            Fulfilment <span className="text-red-700">*</span>
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              className={`cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
                fulfilment === "delivery"
                  ? "border-foreground bg-surface"
                  : "border-border bg-background hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="fulfilment"
                value="delivery"
                checked={fulfilment === "delivery"}
                onChange={() => setFulfilment("delivery")}
                className="sr-only"
              />
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Truck size={14} aria-hidden />
                Delivery
              </span>
              <span className="block text-xs text-muted mt-0.5">
                Ships to the customer&rsquo;s address
              </span>
            </label>
            <label
              className={`cursor-pointer rounded-lg border px-3 py-3 text-sm transition-colors ${
                fulfilment === "collection"
                  ? "border-foreground bg-surface"
                  : "border-border bg-background hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="fulfilment"
                value="collection"
                checked={fulfilment === "collection"}
                onChange={() => setFulfilment("collection")}
                className="sr-only"
              />
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <MapPin size={14} aria-hidden />
                Self-collection
              </span>
              <span className="block text-xs text-muted mt-0.5">
                {COLLECTION_ADDRESS.name}, {COLLECTION_ADDRESS.line1},{" "}
                {COLLECTION_ADDRESS.city}
              </span>
            </label>
          </div>
        </fieldset>

        {fulfilment === "delivery" && (
          <label
            htmlFor={deliveryId}
            className="flex flex-col gap-1 text-xs font-medium text-muted"
          >
            <span>Delivery fee (ZAR)</span>
            <input
              id={deliveryId}
              type="number"
              min={0}
              step={0.01}
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              disabled={submitting}
              className={FIELD_CLASS}
            />
          </label>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Marking as paid…
              </>
            ) : (
              "Mark as paid"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
