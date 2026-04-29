/**
 * Mirror of functions/src/adminInventory.ts response shapes. Keep in sync.
 */
export interface InventoryListItem {
  productId: string;
  name: string;
  openingStock: number;
  unitsSold: number;
  currentStock: number;
  reorderLevel: number;
  supplier?: string;
  updatedAt?: string;
  lowStock: boolean;
}

export interface ListInventoryResponse {
  items: InventoryListItem[];
}

export interface UpsertInventoryInput {
  productId: string;
  openingStock: number;
  reorderLevel: number;
  supplier?: string;
}
