/**
 * Business identity rendered on the customer-facing HTML invoice.
 *
 * DUPLICATED (deliberately) in functions/src/lib/invoicePdf.ts — the two
 * TypeScript projects cannot import from each other, and that copy renders
 * the PDF attached to invoice/receipt emails. CHANGE BOTH TOGETHER, or
 * customers get different banking details on the page vs the PDF.
 */
export const BUSINESS_INFO = {
  name: "DrumsAreMe",
  tagline: "Premium American Hickory Drumsticks",
  email: "drumsareme.ent@gmail.com",
  website: "drumsareme.co.za",
  banking: {
    bank: "Capitec",
    accountName: "DRUMSAREME AUDIO PTY LTD",
    accountNumber: "1055755233",
    // Capitec universal branch code
    branchCode: "470010",
    referenceHint: "Use the invoice number as the payment reference",
  },
} as const;
