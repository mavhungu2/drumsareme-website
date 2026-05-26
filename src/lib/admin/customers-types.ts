/**
 * Mirror of functions/src/adminCustomers.ts request/response shapes.
 * Keep in sync.
 */
export interface CustomerListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  defaultAddress?: {
    addressLine1?: string;
    suburb?: string;
    city?: string;
    province?: string;
    postalCode?: string;
  };
  notes?: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListCustomersResponse {
  items: CustomerListItem[];
}

export interface UpdateCustomerInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface UpdateCustomerResponse {
  ordersUpdated: number;
  customer: CustomerListItem;
}
