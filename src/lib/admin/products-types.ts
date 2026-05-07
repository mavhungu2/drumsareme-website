/**
 * Mirror of functions/src/adminProducts.ts response shapes. Keep in sync.
 */
export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  size: string;
  color: string;
  price: number;
  description: string;
  features: string[];
  image: string;
  /**
   * Catalog visibility toggle set in the admin form. The product table
   * surfaces *real* availability by combining this with `inventory`.
   */
  inStock: boolean;
  sortOrder: number;
  updatedAt?: string;
  /** Live inventory snapshot, present once the SKU has been seeded. */
  inventory?: {
    currentStock: number;
    unitsSold: number;
    reorderLevel: number;
    lowStock: boolean;
  };
}

export interface ListProductsResponse {
  items: ProductListItem[];
}

export interface CreateProductInput {
  slug: string;
  name: string;
  size: string;
  color: string;
  price: number;
  description: string;
  features: string[];
  image: string;
  inStock: boolean;
  sortOrder?: number;
}

export type UpdateProductInput = Partial<Omit<CreateProductInput, "slug">>;
