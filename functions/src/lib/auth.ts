import { getAuth } from "firebase-admin/auth";
import { defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { db, FieldValue } from "./firestore";

export const ADMIN_EMAILS = defineString("ADMIN_EMAILS", { default: "" });

export interface AdminIdentity {
  uid: string;
  email: string;
}

interface AuthRequest {
  get: (header: string) => string | undefined;
  ip?: string;
}

interface AuthErrorBody {
  error: string;
  code: AdminAuthCode;
}

interface AuthResponse {
  status: (code: number) => { json: (body: AuthErrorBody) => void };
}

export type AdminAuthCode =
  | "MISSING_TOKEN"
  | "INVALID_TOKEN"
  | "EMAIL_CLAIM_MISSING"
  | "NOT_VERIFIED"
  | "NOT_IN_ALLOWLIST"
  | "NO_ADMINS_CONFIGURED";

const BEARER = /^Bearer (.+)$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  return trimmed.length > 0 && EMAIL_PATTERN.test(trimmed);
}

function parseAllowlist(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function getSeedEmails(): string[] {
  return parseAllowlist(ADMIN_EMAILS.value()).map((s) => s.toLowerCase());
}

export async function loadFirestoreAdmins(): Promise<Set<string>> {
  try {
    const snap = await db.collection("admins").get();
    const set = new Set<string>();
    snap.forEach((doc) => set.add(doc.id));
    return set;
  } catch (err) {
    logger.error("loadFirestoreAdmins failed", { err: String(err) });
    return new Set<string>();
  }
}

function sendError(
  res: AuthResponse,
  status: number,
  code: AdminAuthCode,
  error: string,
): null {
  res.status(status).json({ error, code });
  return null;
}

export async function requireAdmin(
  req: AuthRequest,
  res: AuthResponse,
): Promise<AdminIdentity | null> {
  const header = req.get("authorization") ?? req.get("Authorization") ?? "";
  const match = BEARER.exec(header);
  if (!match) {
    logger.warn("Admin auth missing token", { ip: req.ip });
    return sendError(res, 401, "MISSING_TOKEN", "Missing token");
  }

  let uid: string;
  let emailRaw: string | undefined;
  let emailVerified: boolean | undefined;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    uid = decoded.uid;
    emailRaw = decoded.email;
    emailVerified = decoded.email_verified;
  } catch (err) {
    logger.warn("Admin auth invalid token", { ip: req.ip, err: String(err) });
    return sendError(res, 401, "INVALID_TOKEN", "Invalid token");
  }

  if (typeof emailRaw !== "string" || emailRaw.length === 0) {
    logger.warn("Admin auth missing email claim", { uid });
    return sendError(
      res,
      403,
      "EMAIL_CLAIM_MISSING",
      "Token is missing an email claim",
    );
  }
  if (emailVerified !== true) {
    logger.warn("Admin auth email not verified", { uid });
    return sendError(
      res,
      403,
      "NOT_VERIFIED",
      "Email address is not verified",
    );
  }

  const email = normalizeEmail(emailRaw);
  const seeds = getSeedEmails();

  if (seeds.includes(email)) {
    logger.info("Admin auth success (seed)", { uid, email });
    return { uid, email };
  }

  const firestoreAdmins = await loadFirestoreAdmins();
  if (firestoreAdmins.has(email)) {
    logger.info("Admin auth success (firestore)", { uid, email });
    void db
      .doc(`admins/${email}`)
      .set({ lastSignInAt: FieldValue.serverTimestamp() }, { merge: true })
      .catch((err) => {
        logger.warn("lastSignInAt bump failed", { email, err: String(err) });
      });
    return { uid, email };
  }

  if (seeds.length === 0 && firestoreAdmins.size === 0) {
    logger.warn("Admin auth rejected — no admins configured", { uid, email });
    return sendError(
      res,
      403,
      "NO_ADMINS_CONFIGURED",
      "No admins configured",
    );
  }

  logger.warn("Admin auth rejected — email not in allowlist", { uid, email });
  return sendError(res, 403, "NOT_IN_ALLOWLIST", "Forbidden");
}
