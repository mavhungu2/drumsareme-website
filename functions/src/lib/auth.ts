import { getAuth } from "firebase-admin/auth";
import { defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import "./firestore";

export const ADMIN_UIDS = defineString("ADMIN_UIDS", { default: "" });

interface AuthRequest {
  get: (header: string) => string | undefined;
  ip?: string;
}

interface AuthResponse {
  status: (code: number) => { send: (body: string) => void };
}

const BEARER = /^Bearer (.+)$/;

function parseAllowlist(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function requireAdmin(
  req: AuthRequest,
  res: AuthResponse,
): Promise<string | null> {
  const header = req.get("authorization") ?? req.get("Authorization") ?? "";
  const match = BEARER.exec(header);
  if (!match) {
    logger.warn("Admin auth missing token", { ip: req.ip });
    res.status(401).send("Missing token");
    return null;
  }

  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    uid = decoded.uid;
  } catch (err) {
    logger.warn("Admin auth invalid token", { ip: req.ip, err: String(err) });
    res.status(401).send("Invalid token");
    return null;
  }

  const allow = parseAllowlist(ADMIN_UIDS.value());
  if (allow.length === 0) {
    logger.warn("Admin auth rejected — ADMIN_UIDS empty", { uid });
    res.status(403).send("No admins configured");
    return null;
  }
  if (!allow.includes(uid)) {
    logger.warn("Admin auth rejected — uid not in allowlist", { uid });
    res.status(403).send("Forbidden");
    return null;
  }

  logger.info("Admin auth success", { uid });
  return uid;
}
