/**
 * Mirror of functions/src/adminPromos.ts response shapes. Keep in sync.
 */
export type PromoCodeKind = "percent" | "fixed";

export interface PromoListItem {
  code: string;
  kind: PromoCodeKind;
  value: number;
  active: boolean;
  startsAt?: string;
  expiresAt?: string;
  maxRedemptions?: number;
  redemptionCount: number;
  firstOrderOnly: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListPromosResponse {
  items: PromoListItem[];
}

export interface CreatePromoInput {
  code: string;
  kind: PromoCodeKind;
  value: number;
  active: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
  maxRedemptions?: number | null;
  firstOrderOnly?: boolean;
  notes?: string;
}

export type UpdatePromoInput = Partial<Omit<CreatePromoInput, "code">>;
