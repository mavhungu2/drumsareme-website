import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Truck,
} from "lucide-react";
import {
  COLLECTION_ADDRESS,
  MANUAL_PAYMENT_METHOD_LABEL,
  formatCollectionAddress,
  type Order,
} from "@/lib/admin/orders-types";
import { formatDate, formatDateTime, formatZar } from "@/lib/admin/format";
import OrderStatusBadge from "./OrderStatusBadge";
import AddNoteForm from "./AddNoteForm";

interface OrderDetailViewProps {
  order: Order;
  onMarkPaid?: () => void;
  onMarkShipped?: () => void;
  onMarkCompleted?: () => Promise<void>;
  onCancel?: () => void;
  onResendReceipt?: () => Promise<void>;
  onAddNote?: (body: string) => Promise<void>;
  mutating?: boolean;
}

interface DetailRow {
  label: string;
  value: React.ReactNode;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-background border border-border rounded-2xl p-5 sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailList({ rows }: { rows: DetailRow[] }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted">{row.label}</dt>
          <dd className="text-foreground break-words">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function OrderDetailView({
  order,
  onMarkPaid,
  onMarkShipped,
  onMarkCompleted,
  onCancel,
  onResendReceipt,
  onAddNote,
  mutating = false,
}: OrderDetailViewProps) {
  const isService = order.fulfilment === "none";
  const canMarkPaid =
    Boolean(onMarkPaid) &&
    order.status === "pending" &&
    order.source === "manual";
  // Service invoices have no shipped / ready-to-collect step.
  const canMarkShipped =
    Boolean(onMarkShipped) && order.status === "paid" && !isService;
  const canMarkCompleted =
    Boolean(onMarkCompleted) &&
    (order.status === "shipped" ||
      (order.status === "paid" && isService));
  const canCancel =
    Boolean(onCancel) &&
    order.status !== "cancelled" &&
    order.status !== "completed";
  const canResendReceipt =
    Boolean(onResendReceipt) &&
    Boolean(order.customer.email) &&
    (order.status === "paid" ||
      order.status === "shipped" ||
      order.status === "completed" ||
      (order.status === "pending" && order.source === "manual"));
  const resendLabel =
    order.status === "pending" ? "Resend invoice" : "Resend receipt";

  const isCollection = order.fulfilment === "collection";
  const isDelivery = order.fulfilment === "delivery";

  const fulfilmentValue = isCollection ? (
    <span className="inline-flex items-center gap-1.5">
      <MapPin size={14} className="text-foreground" aria-hidden />
      Self-collection — {COLLECTION_ADDRESS.name},{" "}
      {COLLECTION_ADDRESS.line1}, {COLLECTION_ADDRESS.city}
    </span>
  ) : isDelivery ? (
    <span className="inline-flex items-center gap-1.5">
      <Truck size={14} className="text-foreground" aria-hidden />
      Delivery
    </span>
  ) : isService ? (
    <span className="text-foreground">Service / no shipping</span>
  ) : (
    <span className="text-muted">Not set yet — choose at Mark as Paid</span>
  );

  const customerRows: DetailRow[] = [
    {
      label: "Name",
      value: `${order.customer.firstName} ${order.customer.lastName}`.trim() || "—",
    },
    { label: "Email", value: order.customer.email || "—" },
    { label: "Phone", value: order.customer.phone || "—" },
    { label: "Fulfilment", value: fulfilmentValue },
    {
      label: isCollection
        ? "Collection point"
        : isDelivery
          ? "Delivery address"
          : "Address",
      value: isCollection
        ? formatCollectionAddress()
        : [
            order.customer.addressLine1,
            order.customer.suburb,
            order.customer.city,
            order.customer.province,
            order.customer.postalCode,
          ]
            .filter(Boolean)
            .join(", ") || "—",
    },
    {
      label: "Notes",
      value: order.customer.notes || "—",
    },
  ];

  // Collector details captured at the ready-to-collect step (optional).
  if (isCollection && order.collection) {
    const c = order.collection;
    const who = [c.collectorName, c.collectorContact].filter(Boolean).join(" · ");
    if (who) customerRows.push({ label: "Collected by", value: who });
    if (c.note) customerRows.push({ label: "Collection note", value: c.note });
  }

  const paymentRows: DetailRow[] = [
    {
      label: "Source",
      value:
        order.source === "manual"
          ? "Manual entry"
          : order.source === "yoco"
            ? "Yoco checkout"
            : "—",
    },
    {
      label: "Payment method",
      value: order.manualPaymentMethod
        ? MANUAL_PAYMENT_METHOD_LABEL[order.manualPaymentMethod]
        : order.source === "yoco"
          ? "Card / Yoco"
          : "Not set yet",
    },
    { label: "Checkout ID", value: order.yoco.checkoutId || "—" },
    { label: "Payment ID", value: order.yoco.paymentId ?? "—" },
    { label: "Failure reason", value: order.yoco.failureReason ?? "—" },
    { label: "Paid at", value: formatDateTime(order.paidAt) },
  ];

  const timelineRows: DetailRow[] = [
    { label: "Created", value: formatDateTime(order.createdAt) },
    { label: "Paid", value: formatDateTime(order.paidAt) },
    { label: "Shipped", value: formatDateTime(order.shippedAt) },
    { label: "Completed", value: formatDateTime(order.completedAt) },
    { label: "Cancelled", value: formatDateTime(order.cancelledAt) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Order</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">
            {order.ref}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <OrderStatusBadge status={order.status} />
          <div className="flex flex-wrap items-center gap-2">
            {canMarkPaid ? (
              <button
                type="button"
                onClick={onMarkPaid}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutating ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 size={14} aria-hidden />
                )}
                Mark as paid
              </button>
            ) : null}
            {canMarkShipped ? (
              <button
                type="button"
                onClick={onMarkShipped}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutating ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : isCollection ? (
                  <MapPin size={14} aria-hidden />
                ) : (
                  <Truck size={14} aria-hidden />
                )}
                {isCollection ? "Mark as ready to collect" : "Mark as shipped"}
              </button>
            ) : null}
            {canMarkCompleted ? (
              <button
                type="button"
                onClick={onMarkCompleted}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutating ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 size={14} aria-hidden />
                )}
                Mark as completed
              </button>
            ) : null}
            <Link
              href={`/admin/orders/invoice/?id=${encodeURIComponent(order.id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <FileText size={14} aria-hidden />
              {order.status === "pending"
                ? "Download invoice"
                : order.status === "cancelled"
                  ? "Download cancellation"
                  : "Download receipt"}
            </Link>
            {canResendReceipt ? (
              <button
                type="button"
                onClick={onResendReceipt}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mail size={14} aria-hidden />
                {resendLabel}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-background px-4 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Ban size={14} aria-hidden />
                Cancel order
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <SectionCard title="Items">
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted">
              <tr className="border-b border-border">
                <th scope="col" className="py-2 text-left font-medium">
                  Product
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Unit price
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Line total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item, index) => (
                <tr key={`${item.productId ?? "service"}-${index}`}>
                  <td className="py-3 pr-3 text-foreground">{item.name}</td>
                  <td className="py-3 text-right tabular-nums">{item.qty}</td>
                  <td className="py-3 text-right tabular-nums text-muted">
                    {formatZar(item.unitPrice)}
                  </td>
                  <td className="py-3 text-right tabular-nums font-medium">
                    {formatZar(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t border-border">
                <td colSpan={3} className="py-2 text-right text-muted">
                  Subtotal
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatZar(order.subtotal)}
                </td>
              </tr>
              {(order.discount ?? 0) > 0 && (
                <tr>
                  <td colSpan={3} className="py-2 text-right text-green-700">
                    Promo
                    {order.promoCode ? ` (${order.promoCode})` : ""}
                  </td>
                  <td className="py-2 text-right tabular-nums text-green-700">
                    −{formatZar(order.discount ?? 0)}
                  </td>
                </tr>
              )}
              {!isService && (
                <tr>
                  <td colSpan={3} className="py-2 text-right text-muted">
                    {isCollection ? "Collection" : "Shipping"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {order.shipping > 0 ? formatZar(order.shipping) : "Free"}
                  </td>
                </tr>
              )}
              <tr className="border-t border-border">
                <td colSpan={3} className="py-3 text-right font-semibold">
                  Total
                </td>
                <td className="py-3 text-right tabular-nums font-bold">
                  {formatZar(order.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Customer">
          <DetailList rows={customerRows} />
        </SectionCard>
        <SectionCard title="Payment (Yoco)">
          <DetailList rows={paymentRows} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Timeline">
          <DetailList rows={timelineRows} />
        </SectionCard>
        <SectionCard title="Tracking">
          {order.tracking ? (
            <DetailList
              rows={[
                { label: "Carrier", value: order.tracking.carrier },
                { label: "Number", value: order.tracking.number },
                {
                  label: "URL",
                  value: order.tracking.url ? (
                    <a
                      href={order.tracking.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-dark underline hover:text-foreground"
                    >
                      Open tracking
                    </a>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
          ) : (
            <p className="text-sm text-muted">No tracking details yet.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Notes">
        {order.notes && order.notes.length > 0 ? (
          <ul className="space-y-3">
            {order.notes.map((note, idx) => (
              <li
                key={`${note.at}-${idx}`}
                className="border border-border rounded-xl p-3"
              >
                <div className="flex items-center justify-between text-xs text-muted mb-1">
                  <span>{note.by}</span>
                  <span>{formatDateTime(note.at)}</span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {note.body}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No notes yet.</p>
        )}
        {onAddNote ? <AddNoteForm onAddNote={onAddNote} disabled={mutating} /> : null}
      </SectionCard>
    </div>
  );
}
