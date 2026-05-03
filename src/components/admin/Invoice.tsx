"use client";

import type { Order } from "@/lib/admin/orders-types";
import {
  COLLECTION_ADDRESS,
  formatCollectionAddress,
} from "@/lib/admin/orders-types";
import { BUSINESS_INFO } from "@/lib/admin/business-info";
import { formatDate, formatZar } from "@/lib/admin/format";

interface InvoiceProps {
  order: Order;
}

const isPaid = (order: Order) =>
  order.status === "paid" ||
  order.status === "shipped" ||
  order.status === "completed";

function formatCustomerAddress(order: Order): string[] {
  if (order.fulfilment === "collection") {
    return [
      `Collection from ${COLLECTION_ADDRESS.name}`,
      formatCollectionAddress(),
    ];
  }
  const cityLine = [
    order.customer.city,
    order.customer.province,
    order.customer.postalCode,
  ]
    .filter((v): v is string => Boolean(v && v.trim().length > 0))
    .join(", ");
  const lines: string[] = [];
  if (order.customer.addressLine1) lines.push(order.customer.addressLine1);
  if (order.customer.suburb) lines.push(order.customer.suburb);
  if (cityLine.length > 0) lines.push(cityLine);
  return lines;
}

export default function Invoice({ order }: InvoiceProps) {
  const paid = isPaid(order);
  const cancelled = order.status === "cancelled";
  const customerAddress = formatCustomerAddress(order);

  return (
    <article className="invoice-doc bg-white text-black mx-auto max-w-[210mm] p-10 sm:p-16 print:p-12">
      <header className="flex items-start justify-between gap-6 border-b border-gray-300 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {BUSINESS_INFO.name}
          </h1>
          <p className="text-sm text-gray-600">{BUSINESS_INFO.tagline}</p>
          <p className="mt-2 text-xs text-gray-600">
            {BUSINESS_INFO.email} &middot; {BUSINESS_INFO.website}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-gray-500">
            {paid ? "Receipt" : cancelled ? "Cancelled" : "Invoice"}
          </p>
          <p className="text-xl font-semibold tracking-tight font-mono">
            {order.ref}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Issued {formatDate(order.createdAt)}
          </p>
          <p
            className={`mt-2 inline-block px-2.5 py-1 text-xs font-semibold rounded-full ${
              paid
                ? "bg-green-100 text-green-800"
                : cancelled
                  ? "bg-gray-200 text-gray-700"
                  : "bg-amber-100 text-amber-800"
            }`}
          >
            {paid
              ? `PAID${order.paidAt ? ` · ${formatDate(order.paidAt)}` : ""}`
              : cancelled
                ? "CANCELLED"
                : "PAYMENT DUE"}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-6 mt-6 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Bill to
          </p>
          <p className="font-semibold">
            {order.customer.firstName} {order.customer.lastName}
          </p>
          {customerAddress.map((line) => (
            <p key={line} className="text-gray-700">
              {line}
            </p>
          ))}
          {order.customer.phone && (
            <p className="text-gray-700">{order.customer.phone}</p>
          )}
          {order.customer.email && (
            <p className="text-gray-700">{order.customer.email}</p>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            {order.fulfilment === "collection" ? "Collection" : "Fulfilment"}
          </p>
          <p className="text-gray-700">
            {order.fulfilment === "collection"
              ? `Self-collection from ${COLLECTION_ADDRESS.name}`
              : order.fulfilment === "delivery"
                ? "Delivery to address above"
                : "To be confirmed"}
          </p>
          {order.tracking && (
            <p className="mt-2 text-xs text-gray-600">
              Tracking: {order.tracking.carrier} &middot;{" "}
              {order.tracking.number}
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-300">
            <tr className="text-xs uppercase tracking-wider text-gray-500">
              <th className="py-2 text-left font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Unit price</th>
              <th className="py-2 text-right font-medium">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {order.items.map((item, index) => (
              <tr key={`${item.productId}-${index}`}>
                <td className="py-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-gray-500 font-mono">
                    {item.productId}
                  </p>
                </td>
                <td className="py-3 text-right tabular-nums">{item.qty}</td>
                <td className="py-3 text-right tabular-nums">
                  {formatZar(item.unitPrice)}
                </td>
                <td className="py-3 text-right tabular-nums font-medium">
                  {formatZar(item.lineTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-6 max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="tabular-nums">{formatZar(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">
              {order.fulfilment === "collection"
                ? "Collection"
                : order.fulfilment === "delivery"
                  ? "Delivery"
                  : "Shipping"}
            </span>
            <span className="tabular-nums">
              {order.shipping > 0 ? formatZar(order.shipping) : "Free"}
            </span>
          </div>
          <div className="flex justify-between border-t border-gray-300 pt-2 mt-2 text-base font-bold">
            <span>Total {paid ? "paid" : "due"}</span>
            <span className="tabular-nums">{formatZar(order.total)}</span>
          </div>
        </div>
      </section>

      {!paid && !cancelled && (
        <section className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm">
          <h2 className="text-sm font-semibold text-amber-900 mb-2">
            How to pay
          </h2>
          <p className="text-amber-900 mb-3">
            Make an EFT to the account below and use{" "}
            <strong>{order.ref}</strong> as the payment reference.
          </p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-amber-900">
            <dt className="text-xs uppercase tracking-wider opacity-75">
              Bank
            </dt>
            <dd>{BUSINESS_INFO.banking.bank}</dd>
            <dt className="text-xs uppercase tracking-wider opacity-75">
              Account name
            </dt>
            <dd>{BUSINESS_INFO.banking.accountName}</dd>
            <dt className="text-xs uppercase tracking-wider opacity-75">
              Account number
            </dt>
            <dd className="font-mono">
              {BUSINESS_INFO.banking.accountNumber}
            </dd>
            <dt className="text-xs uppercase tracking-wider opacity-75">
              Branch code
            </dt>
            <dd className="font-mono">{BUSINESS_INFO.banking.branchCode}</dd>
            <dt className="text-xs uppercase tracking-wider opacity-75">
              Reference
            </dt>
            <dd className="font-mono font-semibold">{order.ref}</dd>
          </dl>
          <p className="mt-3 text-xs text-amber-800">
            {BUSINESS_INFO.banking.referenceHint}. Send proof of payment to{" "}
            {BUSINESS_INFO.email} so we can mark the order as paid and
            dispatch / prepare for collection.
          </p>
        </section>
      )}

      {order.customer.notes && (
        <section className="mt-8 text-xs text-gray-600">
          <p className="font-semibold text-gray-800 mb-1">Notes</p>
          <p>{order.customer.notes}</p>
        </section>
      )}

      <footer className="mt-10 pt-4 border-t border-gray-200 text-center text-xs text-gray-500">
        Thanks for choosing {BUSINESS_INFO.name}. Questions?{" "}
        {BUSINESS_INFO.email}
      </footer>
    </article>
  );
}
