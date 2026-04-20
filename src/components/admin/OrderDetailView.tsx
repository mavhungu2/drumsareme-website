import { Ban, Loader2, Mail, Truck } from "lucide-react";
import type { Order } from "@/lib/admin/orders-types";
import { formatDate, formatDateTime, formatZar } from "@/lib/admin/format";
import OrderStatusBadge from "./OrderStatusBadge";
import AddNoteForm from "./AddNoteForm";

interface OrderDetailViewProps {
  order: Order;
  onMarkShipped?: () => void;
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
  onMarkShipped,
  onCancel,
  onResendReceipt,
  onAddNote,
  mutating = false,
}: OrderDetailViewProps) {
  const canMarkShipped = Boolean(onMarkShipped) && order.status === "paid";
  const canCancel = Boolean(onCancel) && order.status !== "cancelled";
  const canResendReceipt =
    Boolean(onResendReceipt) &&
    (order.status === "paid" || order.status === "shipped");

  const customerRows: DetailRow[] = [
    {
      label: "Name",
      value: `${order.customer.firstName} ${order.customer.lastName}`.trim() || "—",
    },
    { label: "Email", value: order.customer.email || "—" },
    { label: "Phone", value: order.customer.phone || "—" },
    {
      label: "Address",
      value: [
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

  const paymentRows: DetailRow[] = [
    { label: "Checkout ID", value: order.yoco.checkoutId || "—" },
    { label: "Payment ID", value: order.yoco.paymentId ?? "—" },
    { label: "Failure reason", value: order.yoco.failureReason ?? "—" },
    { label: "Paid at", value: formatDateTime(order.paidAt) },
  ];

  const timelineRows: DetailRow[] = [
    { label: "Created", value: formatDateTime(order.createdAt) },
    { label: "Paid", value: formatDateTime(order.paidAt) },
    { label: "Shipped", value: formatDateTime(order.shippedAt) },
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
            {canMarkShipped ? (
              <button
                type="button"
                onClick={onMarkShipped}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutating ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Truck size={14} aria-hidden />
                )}
                Mark as shipped
              </button>
            ) : null}
            {canResendReceipt ? (
              <button
                type="button"
                onClick={onResendReceipt}
                disabled={mutating}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Mail size={14} aria-hidden />
                Resend receipt
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
              {order.items.map((item) => (
                <tr key={`${item.productId}-${item.name}`}>
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
              <tr>
                <td colSpan={3} className="py-2 text-right text-muted">
                  Shipping
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatZar(order.shipping)}
                </td>
              </tr>
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
