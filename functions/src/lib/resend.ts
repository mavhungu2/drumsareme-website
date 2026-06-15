import { Resend } from "resend";
import { COLLECTION_ADDRESS, type Order, type OrderTracking } from "./firestore";
import { generateInvoicePdf } from "./invoicePdf";

async function buildPdfAttachment(order: Order, paid: boolean) {
  try {
    const pdf = await generateInvoicePdf(order);
    return [
      {
        filename: `${paid ? "Receipt" : "Invoice"}-${order.ref}.pdf`,
        content: pdf.toString("base64"),
      },
    ];
  } catch {
    // PDF generation must never block the email — log nothing here
    // (caller's logger has more context) and just send without attachment.
    return undefined;
  }
}

const FROM = "DrumsAreMe <orders@drumsareme.co.za>";

function formatZAR(n: number): string {
  return `R${n.toLocaleString("en-ZA")}`;
}

function itemsHtml(order: Order): string {
  return order.items
    .map(
      (it) =>
        `<tr><td style="padding:6px 0">${it.qty} × ${it.name}</td><td style="padding:6px 0;text-align:right">${formatZAR(it.lineTotal)}</td></tr>`,
    )
    .join("");
}

function customerAddress(order: Order): string {
  const c = order.customer;
  return [c.addressLine1, c.suburb, c.city, c.province, c.postalCode]
    .filter(Boolean)
    .join(", ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailContainer(innerHtml: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a">
    ${innerHtml}
  </div>`;
}

function fulfilmentBlockHtml(order: Order): string {
  // Service invoices have no delivery/collection block.
  if (order.fulfilment === "none") return "";
  if (order.fulfilment === "collection") {
    const a = COLLECTION_ADDRESS;
    return `
      <h3 style="margin:24px 0 8px;font-size:14px">Self-collection</h3>
      <p style="margin:0 0 8px;font-size:14px;color:#374151">${order.customer.firstName} ${order.customer.lastName}<br>${order.customer.phone} &middot; ${order.customer.email}</p>
      <p style="margin:0;font-size:14px;color:#374151"><strong>Pick up from:</strong><br>${a.name}<br>${a.line1}, ${a.suburb}<br>${a.city}, ${a.postalCode}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#6b7280">We'll WhatsApp / call you when it's ready to collect.</p>`;
  }
  return `
      <h3 style="margin:24px 0 8px;font-size:14px">Delivery</h3>
      <p style="margin:0;font-size:14px;color:#374151">${order.customer.firstName} ${order.customer.lastName}<br>${customerAddress(order)}<br>${order.customer.phone} &middot; ${order.customer.email}</p>`;
}

function orderBodyHtml(order: Order, intro: string): string {
  const discount = order.discount ?? 0;
  const discountRow =
    discount > 0
      ? `<tr><td style="padding:6px 0;color:#047857">Promo${order.promoCode ? ` (${escapeHtml(order.promoCode)})` : ""}</td><td style="padding:6px 0;text-align:right;color:#047857">−${formatZAR(discount)}</td></tr>`
      : "";
  // Service ("none") invoices have no shipping concept — omit the row entirely.
  const shippingRow =
    order.fulfilment === "none"
      ? ""
      : `<tr><td style="padding:6px 0">${order.fulfilment === "collection" ? "Collection" : "Shipping"}</td><td style="padding:6px 0;text-align:right">${order.fulfilment === "collection" ? "Free" : formatZAR(order.shipping)}</td></tr>`;
  return emailContainer(`
    <h2 style="margin:0 0 8px">${intro}</h2>
    <p style="color:#6b7280;margin:0 0 24px">Order <strong>${order.ref}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemsHtml(order)}
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb">Subtotal</td><td style="padding:6px 0;text-align:right;border-top:1px solid #e5e7eb">${formatZAR(order.subtotal)}</td></tr>
      ${discountRow}
      ${shippingRow}
      <tr><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600">Total</td><td style="padding:8px 0;text-align:right;border-top:1px solid #e5e7eb;font-weight:600">${formatZAR(order.total)}</td></tr>
    </table>
    ${fulfilmentBlockHtml(order)}
    ${order.customer.notes ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280"><em>Note:</em> ${order.customer.notes}</p>` : ""}
  `);
}

function invoiceBodyHtml(order: Order): string {
  const discount = order.discount ?? 0;
  const discountRow =
    discount > 0
      ? `<tr><td style="padding:6px 0;color:#047857">Promo${order.promoCode ? ` (${escapeHtml(order.promoCode)})` : ""}</td><td style="padding:6px 0;text-align:right;color:#047857">−${formatZAR(discount)}</td></tr>`
      : "";
  // Match the attached PDF + admin surfaces: omit only for service ("none")
  // invoices; collection/free-delivery still show the row labelled "Free".
  const shippingRow =
    order.fulfilment === "none"
      ? ""
      : `<tr><td style="padding:6px 0">${order.fulfilment === "collection" ? "Collection" : "Shipping"}</td><td style="padding:6px 0;text-align:right">${order.shipping > 0 ? formatZAR(order.shipping) : "Free"}</td></tr>`;
  return emailContainer(`
    <h2 style="margin:0 0 8px">Here's your invoice</h2>
    <p style="color:#6b7280;margin:0 0 16px">Order <strong>${order.ref}</strong></p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151">Thanks for your order. The invoice is attached as a PDF and the line items are listed below. Please pay via EFT using the banking details and reference shown on the invoice. Send proof of payment to <a href="mailto:orders@drumsareme.co.za">orders@drumsareme.co.za</a> and we'll mark the order as paid.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemsHtml(order)}
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb">Subtotal</td><td style="padding:6px 0;text-align:right;border-top:1px solid #e5e7eb">${formatZAR(order.subtotal)}</td></tr>
      ${discountRow}
      ${shippingRow}
      <tr><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600">Total due</td><td style="padding:8px 0;text-align:right;border-top:1px solid #e5e7eb;font-weight:600">${formatZAR(order.total)}</td></tr>
    </table>
    ${
      order.customer.notes
        ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280"><em>Note:</em> ${escapeHtml(order.customer.notes)}</p>`
        : ""
    }
  `);
}

export async function sendCustomerInvoice(
  apiKey: string,
  order: Order,
): Promise<void> {
  if (!order.customer.email) return;
  const resend = new Resend(apiKey);
  const attachments = await buildPdfAttachment(order, false);
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject: `Invoice ${order.ref} — payment due`,
    html: invoiceBodyHtml(order),
    attachments,
  });
}

export async function sendCustomerReceipt(
  apiKey: string,
  order: Order,
): Promise<void> {
  const resend = new Resend(apiKey);
  const attachments = await buildPdfAttachment(order, true);
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject: `Order ${order.ref} confirmed — thanks for your order!`,
    html: orderBodyHtml(order, "Thanks, your order is confirmed"),
    attachments,
  });
}

export async function sendMerchantNotification(
  apiKey: string,
  merchantEmail: string,
  order: Order,
): Promise<void> {
  const resend = new Resend(apiKey);
  const attachments = await buildPdfAttachment(order, true);
  await resend.emails.send({
    from: FROM,
    to: merchantEmail,
    subject: `New paid order ${order.ref} — ${formatZAR(order.total)}`,
    html: orderBodyHtml(order, "New paid order"),
    attachments,
  });
}

function trackingHtml(tracking: OrderTracking): string {
  const identifier = tracking.url
    ? `<a href="${tracking.url}">${tracking.number}</a>`
    : tracking.number;
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:16px auto 0;color:#0a0a0a">
    <h3 style="margin:0 0 8px;font-size:14px">Tracking</h3>
    <p style="margin:0;font-size:14px;color:#374151">${tracking.carrier} &middot; ${identifier}</p>
  </div>`;
}

export async function sendShippingConfirmation(
  apiKey: string,
  order: Order,
  tracking?: OrderTracking,
): Promise<void> {
  const isCollection = order.fulfilment === "collection";
  const subject = isCollection
    ? `Order ${order.ref} ready for collection`
    : `Your order ${order.ref} has shipped!`;
  const intro = isCollection
    ? "Your order is ready to collect"
    : "Your order is on its way";
  // Collection emails skip the courier-style tracking block — the pickup
  // address is already rendered in the body via fulfilmentBlockHtml.
  const body =
    !isCollection && tracking
      ? `${orderBodyHtml(order, intro)}${trackingHtml(tracking)}`
      : orderBodyHtml(order, intro);
  const resend = new Resend(apiKey);
  const attachments = await buildPdfAttachment(order, true);
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject,
    html: body,
    attachments,
  });
}

function cancellationBodyHtml(order: Order, reason: string): string {
  const shippingRow =
    order.fulfilment === "none"
      ? ""
      : `<tr><td style="padding:6px 0">${order.fulfilment === "collection" ? "Collection" : "Shipping"}</td><td style="padding:6px 0;text-align:right">${order.fulfilment === "collection" ? "Free" : formatZAR(order.shipping)}</td></tr>`;
  return emailContainer(`
    <h2 style="margin:0 0 8px">Your order has been cancelled</h2>
    <p style="color:#6b7280;margin:0 0 16px">Order <strong>${order.ref}</strong></p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151">We're sorry — your order has been cancelled. If any payment has already been taken, it will be refunded via Yoco and should return to your account within a few business days.</p>
    <h3 style="margin:24px 0 8px;font-size:14px">Reason</h3>
    <p style="margin:0 0 16px;font-size:14px;color:#374151">${escapeHtml(reason)}</p>
    <h3 style="margin:24px 0 8px;font-size:14px">Your order</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemsHtml(order)}
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb">Subtotal</td><td style="padding:6px 0;text-align:right;border-top:1px solid #e5e7eb">${formatZAR(order.subtotal)}</td></tr>
      ${
        (order.discount ?? 0) > 0
          ? `<tr><td style="padding:6px 0;color:#047857">Promo${order.promoCode ? ` (${escapeHtml(order.promoCode)})` : ""}</td><td style="padding:6px 0;text-align:right;color:#047857">−${formatZAR(order.discount ?? 0)}</td></tr>`
          : ""
      }
      ${shippingRow}
      <tr><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600">Total</td><td style="padding:8px 0;text-align:right;border-top:1px solid #e5e7eb;font-weight:600">${formatZAR(order.total)}</td></tr>
    </table>
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280">If you have any questions, reply to this email and we'll be happy to help.</p>
  `);
}

export async function sendCancellationNotification(
  apiKey: string,
  order: Order,
  reason: string,
): Promise<void> {
  const resend = new Resend(apiKey);
  const attachments = await buildPdfAttachment(order, false);
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject: `Order ${order.ref} has been cancelled`,
    html: cancellationBodyHtml(order, reason),
    attachments,
  });
}
