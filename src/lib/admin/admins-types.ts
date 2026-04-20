export type AdminSource = "firestore" | "seed";

export interface AdminListItem {
  email: string;
  source: AdminSource;
  addedByEmail?: string;
  addedAt?: string;
  lastSignInAt?: string;
  removable: boolean;
}

export interface ListAdminsResponse {
  admins: AdminListItem[];
  callerEmail: string;
  seedCount: number;
}

export interface AddAdminInput {
  email: string;
}

export interface RemoveAdminResponse {
  ok: true;
  email: string;
}

export type AdminApiCode =
  | "INVALID_EMAIL"
  | "ALREADY_ADMIN"
  | "SEED_ADMIN"
  | "NOT_FOUND"
  | "CANNOT_REMOVE_SEED"
  | "CANNOT_REMOVE_SELF"
  | "MISSING_TOKEN"
  | "INVALID_TOKEN"
  | "EMAIL_CLAIM_MISSING"
  | "NOT_VERIFIED"
  | "NOT_IN_ALLOWLIST"
  | "NO_ADMINS_CONFIGURED";
