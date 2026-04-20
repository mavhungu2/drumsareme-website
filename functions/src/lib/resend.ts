import { Resend } from "resend";
import type { Order, OrderTracking } from "./firestore";

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

function orderBodyHtml(order: Order, intro: string): string {
  return emailContainer(`
    <h2 style="margin:0 0 8px">${intro}</h2>
    <p style="color:#6b7280;margin:0 0 24px">Order <strong>${order.ref}</strong></p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${itemsHtml(order)}
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb">Subtotal</td><td style="padding:6px 0;text-align:right;border-top:1px solid #e5e7eb">${formatZAR(order.subtotal)}</td></tr>
      <tr><td style="padding:6px 0">Shipping</td><td style="padding:6px 0;text-align:right">${formatZAR(order.shipping)}</td></tr>
      <tr><td style="padding:8px 0;border-top:1px solid #e5e7eb;font-weight:600">Total</td><td style="padding:8px 0;text-align:right;border-top:1px solid #e5e7eb;font-weight:600">${formatZAR(order.total)}</td></tr>
    </table>
    <h3 style="margin:24px 0 8px;font-size:14px">Delivery</h3>
    <p style="margin:0;font-size:14px;color:#374151">${order.customer.firstName} ${order.customer.lastName}<br>${customerAddress(order)}<br>${order.customer.phone} &middot; ${order.customer.email}</p>
    ${order.customer.notes ? `<p style="margin:12px 0 0;font-size:13px;color:#6b7280"><em>Note:</em> ${order.customer.notes}</p>` : ""}
  `);
}

export async function sendCustomerReceipt(
  apiKey: string,
  order: Order,
): Promise<void> {
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject: `Order ${order.ref} confirmed — thanks for your order!`,
    html: orderBodyHtml(order, "Thanks, your order is confirmed"),
  });
}

export async function sendMerchantNotification(
  apiKey: string,
  merchantEmail: string,
  order: Order,
): Promise<void> {
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: FROM,
    to: merchantEmail,
    subject: `New paid order ${order.ref} — ${formatZAR(order.total)}`,
    html: orderBodyHtml(order, "New paid order"),
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
  tracking: OrderTracking,
): Promise<void> {
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject: `Your order ${order.ref} has shipped!`,
    html: `${orderBodyHtml(order, "Your order is on its way")}${trackingHtml(tracking)}`,
  });
}

function cancellationBodyHtml(order: Order, reason: string): string {
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
      <tr><td style="padding:6px 0">Shipping</td><td style="padding:6px 0;text-align:right">${formatZAR(order.shipping)}</td></tr>
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
  await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject: `Order ${order.ref} has been cancelled`,
    html: cancellationBodyHtml(order, reason),
  });
}
