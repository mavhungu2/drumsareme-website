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
  inStock: boolean;
  sortOrder: number;
  updatedAt?: string;
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
