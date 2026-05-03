/**
 * Business identity rendered on customer-facing invoices.
 * Update banking details here when you have real EFT credentials.
 */
export const BUSINESS_INFO = {
  name: "DrumsAreMe",
  tagline: "Premium American Hickory Drumsticks",
  email: "drumsareme.ent@gmail.com",
  website: "drumsareme.co.za",
  banking: {
    bank: "Capitec",
    accountName: "DRUMSAREME - NG MPHARALALA",
    accountNumber: "2515581117",
    // Capitec universal branch code
    branchCode: "470010",
    referenceHint: "Use the invoice number as the payment reference",
  },
} as const;
