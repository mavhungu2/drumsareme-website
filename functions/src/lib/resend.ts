import { Resend } from "resend";
import type { Order } from "./firestore";

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

function orderBodyHtml(order: Order, intro: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0a0a0a">
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
  </div>`;
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
