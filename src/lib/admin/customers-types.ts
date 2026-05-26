/**
 * Mirror of functions/src/adminCustomers.ts request/response shapes.
 * Keep in sync.
 */
import type { CustomerAggregate } from "./analytics-types";

export interface EditCustomerIdentity {
  /** Display name as shown on the customer aggregate row. */
  name: string;
  email: string;
  phone: string;
}

export interface EditCustomerUpdates {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface EditCustomerInput {
  identity: EditCustomerIdentity;
  updates: EditCustomerUpdates;
}

export interface EditCustomerResponse {
  ordersUpdated: number;
  customer: CustomerAggregate;
}
