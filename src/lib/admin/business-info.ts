/**
 * Business identity rendered on customer-facing invoices.
 * Update banking details here when you have real EFT credentials.
 */
export const BUSINESS_INFO = {
  name: "DrumsAreMe",
  tagline: "Premium American Hickory Drumsticks",
  email: "drumsareme.ent@gmail.com",
  website: "drumsareme.co.za",
  // TODO: replace placeholder banking details with the real account
  banking: {
    bank: "TBC",
    accountName: "DrumsAreMe",
    accountNumber: "TBC",
    branchCode: "TBC",
    referenceHint: "Use the invoice number as the payment reference",
  },
} as const;
