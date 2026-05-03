/**
 * Generates a PDF invoice/receipt for an Order. Mirrors the HTML invoice in
 * src/components/admin/Invoice.tsx so the customer's emailed PDF matches what
 * the admin can download from the dashboard.
 *
 * The logo is fetched from the live Hosting site once per function instance
 * and cached; if the fetch fails the PDF still renders without a logo.
 */
import PDFDocument from "pdfkit";
import {
  COLLECTION_ADDRESS,
  type Order,
} from "./firestore";

const LOGO_URL =
  "https://drumsareme.co.za/images/logos/logo-black-trimmed.png";

const BUSINESS = {
  name: "DrumsAreMe",
  tagline: "Premium American Hickory Drumsticks",
  email: "drumsareme.ent@gmail.com",
  website: "drumsareme.co.za",
  banking: {
    bank: "Capitec",
    accountName: "DRUMSAREME - NG MPHARALALA",
    accountNumber: "2515581117",
    branchCode: "470010",
    referenceHint: "Use the invoice number as the payment reference",
  },
};

let cachedLogo: Buffer | null | undefined; // undefined = not tried, null = tried and failed

async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) {
      cachedLogo = null;
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    cachedLogo = Buffer.from(arrayBuffer);
    return cachedLogo;
  } catch {
    cachedLogo = null;
    return null;
  }
}

function isPaid(order: Order): boolean {
  return (
    order.status === "paid" ||
    order.status === "shipped" ||
    order.status === "completed"
  );
}

function formatZAR(value: number): string {
  return `R${value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(ts: FirebaseFirestore.Timestamp | undefined): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function customerAddressLines(order: Order): string[] {
  // Collection address lives in the right column; BILL TO keeps just contact.
  if (order.fulfilment === "collection") return [];
  const lines: string[] = [];
  if (order.customer.addressLine1) lines.push(order.customer.addressLine1);
  if (order.customer.suburb) lines.push(order.customer.suburb);
  const cityLine = [
    order.customer.city,
    order.customer.province,
    order.customer.postalCode,
  ]
    .filter((v) => v && v.trim().length > 0)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  return lines;
}

export async function generateInvoicePdf(order: Order): Promise<Buffer> {
  const logo = await loadLogo();
  const paid = isPaid(order);
  const cancelled = order.status === "cancelled";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const rightEdge = doc.page.margins.left + pageWidth;
    const headerTop = doc.y;

    // === Header: logo + business name (left) and invoice meta (right) ===
    if (logo) {
      try {
        doc.image(logo, leftX, headerTop, { width: 90 });
      } catch {
        // Bad image data — skip silently.
      }
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#0a0a0a")
      .text(BUSINESS.name, leftX + (logo ? 100 : 0), headerTop, {
        width: pageWidth - (logo ? 100 : 0),
      });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#6b7280")
      .text(BUSINESS.tagline, leftX + (logo ? 100 : 0), doc.y, {
        width: pageWidth - (logo ? 100 : 0),
      })
      .fontSize(9)
      .text(`${BUSINESS.email}  ·  ${BUSINESS.website}`, leftX + (logo ? 100 : 0), doc.y + 4);

    // Right column: invoice/receipt label + ref + status
    const metaLabel = paid ? "Receipt" : cancelled ? "Cancelled" : "Invoice";
    const metaWidth = 180;
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#6b7280")
      .text(metaLabel.toUpperCase(), rightEdge - metaWidth, headerTop, {
        width: metaWidth,
        align: "right",
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor("#0a0a0a")
      .text(order.ref, rightEdge - metaWidth, doc.y + 2, {
        width: metaWidth,
        align: "right",
      });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#6b7280")
      .text(`Issued ${formatDate(order.createdAt)}`, rightEdge - metaWidth, doc.y + 4, {
        width: metaWidth,
        align: "right",
      });

    // Status pill
    const pillLabel = paid
      ? `PAID${order.paidAt ? ` · ${formatDate(order.paidAt)}` : ""}`
      : cancelled
        ? "CANCELLED"
        : "PAYMENT DUE";
    const pillColor = paid ? "#16a34a" : cancelled ? "#6b7280" : "#b45309";
    const pillBg = paid ? "#dcfce7" : cancelled ? "#e5e7eb" : "#fef3c7";
    const pillY = doc.y + 6;
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(pillColor);
    const pillTextWidth = doc.widthOfString(pillLabel);
    const pillW = pillTextWidth + 12;
    const pillX = rightEdge - pillW;
    doc
      .roundedRect(pillX, pillY, pillW, 16, 8)
      .fillColor(pillBg)
      .fill();
    doc
      .fillColor(pillColor)
      .text(pillLabel, pillX + 6, pillY + 4, { width: pillW - 12 });

    // Move below the header
    doc.y = Math.max(doc.y, pillY + 30);
    doc
      .moveTo(leftX, doc.y)
      .lineTo(rightEdge, doc.y)
      .strokeColor("#d1d5db")
      .lineWidth(1)
      .stroke();
    doc.moveDown(1);

    // === Bill to + fulfilment ===
    const colWidth = pageWidth / 2 - 10;
    const billY = doc.y;

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280")
      .text("BILL TO", leftX, billY);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#0a0a0a")
      .text(
        `${order.customer.firstName} ${order.customer.lastName}`.trim(),
        leftX,
        doc.y + 2,
        { width: colWidth },
      );
    doc.font("Helvetica").fontSize(10).fillColor("#374151");
    for (const line of customerAddressLines(order)) {
      doc.text(line, leftX, doc.y, { width: colWidth });
    }
    if (order.customer.phone) {
      doc.text(order.customer.phone, leftX, doc.y, { width: colWidth });
    }
    if (order.customer.email) {
      doc.text(order.customer.email, leftX, doc.y, { width: colWidth });
    }
    const leftBottom = doc.y;

    // Right column
    const rightColX = leftX + colWidth + 20;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        order.fulfilment === "collection" ? "COLLECTION" : "FULFILMENT",
        rightColX,
        billY,
      );
    if (order.fulfilment === "collection") {
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0a0a0a")
        .text(
          `Self-collection from ${COLLECTION_ADDRESS.name}`,
          rightColX,
          doc.y + 2,
          { width: colWidth },
        );
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(
          `${COLLECTION_ADDRESS.line1}, ${COLLECTION_ADDRESS.suburb}`,
          rightColX,
          doc.y,
          { width: colWidth },
        )
        .text(
          `${COLLECTION_ADDRESS.city}, ${COLLECTION_ADDRESS.postalCode}`,
          rightColX,
          doc.y,
          { width: colWidth },
        );
    } else {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#374151")
        .text(
          order.fulfilment === "delivery"
            ? "Delivery to address shown"
            : "To be confirmed",
          rightColX,
          doc.y + 2,
          { width: colWidth },
        );
    }
    if (order.tracking) {
      doc
        .fontSize(9)
        .fillColor("#6b7280")
        .text(
          `Tracking: ${order.tracking.carrier} · ${order.tracking.number}`,
          rightColX,
          doc.y + 4,
          { width: colWidth },
        );
    }
    doc.y = Math.max(leftBottom, doc.y) + 20;

    // === Line items table ===
    const tableTop = doc.y;
    const colItem = leftX;
    const colQty = leftX + pageWidth * 0.55;
    const colUnit = leftX + pageWidth * 0.7;
    const colLine = leftX + pageWidth * 0.85;

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280");
    doc.text("ITEM", colItem, tableTop);
    doc.text("QTY", colQty, tableTop, { width: pageWidth * 0.1, align: "right" });
    doc.text("UNIT", colUnit, tableTop, { width: pageWidth * 0.13, align: "right" });
    doc.text("TOTAL", colLine, tableTop, {
      width: pageWidth - (colLine - leftX),
      align: "right",
    });
    doc
      .moveTo(leftX, tableTop + 14)
      .lineTo(rightEdge, tableTop + 14)
      .strokeColor("#d1d5db")
      .stroke();

    let rowY = tableTop + 20;
    doc.font("Helvetica").fontSize(10).fillColor("#0a0a0a");
    for (const item of order.items) {
      const yStart = rowY;
      // Combine name + productId on one line so the row divider doesn't
      // visually cross through the SKU label.
      const labelText = `${item.name}  ·  ${item.productId}`;
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#0a0a0a")
        .text(labelText, colItem, rowY, { width: pageWidth * 0.5 });

      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#0a0a0a");
      doc.text(String(item.qty), colQty, yStart, {
        width: pageWidth * 0.1,
        align: "right",
      });
      doc.text(formatZAR(item.unitPrice), colUnit, yStart, {
        width: pageWidth * 0.13,
        align: "right",
      });
      doc.text(formatZAR(item.lineTotal), colLine, yStart, {
        width: pageWidth - (colLine - leftX),
        align: "right",
      });
      rowY = doc.y + 8;
      doc
        .moveTo(leftX, rowY - 4)
        .lineTo(rightEdge, rowY - 4)
        .strokeColor("#e5e7eb")
        .stroke();
    }

    // === Totals ===
    const totalsX = leftX + pageWidth * 0.6;
    const totalsLabelX = totalsX;
    const totalsValueX = totalsX + 60;
    const totalsValueWidth = pageWidth - (totalsValueX - leftX);
    let tY = rowY + 4;
    doc.font("Helvetica").fontSize(10);
    doc.fillColor("#6b7280").text("Subtotal", totalsLabelX, tY);
    doc.fillColor("#0a0a0a").text(formatZAR(order.subtotal), totalsValueX, tY, {
      width: totalsValueWidth,
      align: "right",
    });
    tY = doc.y + 4;
    const shippingLabel =
      order.fulfilment === "collection"
        ? "Collection"
        : order.fulfilment === "delivery"
          ? "Delivery"
          : "Shipping";
    doc.fillColor("#6b7280").text(shippingLabel, totalsLabelX, tY);
    doc
      .fillColor("#0a0a0a")
      .text(
        order.shipping > 0 ? formatZAR(order.shipping) : "Free",
        totalsValueX,
        tY,
        { width: totalsValueWidth, align: "right" },
      );
    tY = doc.y + 6;
    doc
      .moveTo(totalsLabelX, tY)
      .lineTo(rightEdge, tY)
      .strokeColor("#0a0a0a")
      .lineWidth(1)
      .stroke();
    tY += 6;
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#0a0a0a")
      .text(paid ? "Total paid" : "Total due", totalsLabelX, tY);
    doc.text(formatZAR(order.total), totalsValueX, tY, {
      width: totalsValueWidth,
      align: "right",
    });

    // === Banking section (only when payment due) ===
    if (!paid && !cancelled) {
      doc.moveDown(2);
      const boxY = doc.y;
      const boxHeight = 130;
      doc
        .rect(leftX, boxY, pageWidth, boxHeight)
        .fillColor("#fef3c7")
        .fill();
      doc
        .fillColor("#92400e")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text("How to pay", leftX + 12, boxY + 10, { width: pageWidth - 24 });
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#92400e")
        .text(
          `Make an EFT to the account below and use ${order.ref} as the payment reference.`,
          leftX + 12,
          doc.y + 4,
          { width: pageWidth - 24 },
        );

      const bankingTop = doc.y + 8;
      const labelW = 110;
      const rows: Array<[string, string]> = [
        ["Bank", BUSINESS.banking.bank],
        ["Account name", BUSINESS.banking.accountName],
        ["Account number", BUSINESS.banking.accountNumber],
        ["Branch code", BUSINESS.banking.branchCode],
        ["Reference", order.ref],
      ];
      let bY = bankingTop;
      for (const [label, value] of rows) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#92400e")
          .text(label, leftX + 12, bY, { width: labelW });
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#0a0a0a")
          .text(value, leftX + 12 + labelW, bY, {
            width: pageWidth - 24 - labelW,
          });
        bY = doc.y + 2;
      }
    }

    // === Notes ===
    if (order.customer.notes) {
      doc.moveDown(1.5);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#0a0a0a")
        .text("Notes", leftX, doc.y);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#6b7280")
        .text(order.customer.notes, leftX, doc.y + 2, { width: pageWidth });
    }

    // === Footer ===
    const footerY = doc.page.height - doc.page.margins.bottom - 24;
    doc
      .moveTo(leftX, footerY)
      .lineTo(rightEdge, footerY)
      .strokeColor("#e5e7eb")
      .stroke();
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#6b7280")
      .text(
        `Thanks for choosing ${BUSINESS.name}. Questions? ${BUSINESS.email}`,
        leftX,
        footerY + 8,
        { width: pageWidth, align: "center" },
      );

    doc.end();
  });
}
