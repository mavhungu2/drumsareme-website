import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import { db, FieldValue } from "./lib/firestore";
import {
  ADMIN_EMAILS,
  getSeedEmails,
  isValidEmail,
  normalizeEmail,
  requireAdmin,
  type AdminIdentity,
} from "./lib/auth";
import { applyCors } from "./lib/cors";

const ROOT_PATH = "/api/admin/admins";

interface AdminDoc {
  email: string;
  addedByEmail: string;
  addedByUid: string;
  addedAt: FirebaseFirestore.Timestamp;
  lastSignInAt?: FirebaseFirestore.Timestamp;
}

type AdminSource = "firestore" | "seed";

interface AdminListItem {
  email: string;
  source: AdminSource;
  addedByEmail?: string;
  addedAt?: string;
  lastSignInAt?: string;
  removable: boolean;
}

function parseTail(rawPath: string): string[] {
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean);
}

function toIso(ts: FirebaseFirestore.Timestamp | undefined): string | undefined {
  return ts ? ts.toDate().toISOString() : undefined;
}

function parseJsonBody(
  req: Request,
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, body: raw as Record<string, unknown> };
  }
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, body: parsed as Record<string, unknown> };
      }
      return { ok: false, error: "Body must be a JSON object" };
    } catch {
      return { ok: false, error: "Invalid JSON" };
    }
  }
  return { ok: false, error: "Missing JSON body" };
}

async function listAdmins(res: Response, auth: AdminIdentity): Promise<void> {
  const snap = await db.collection("admins").get();
  const firestoreRows: AdminListItem[] = [];
  const firestoreKeys = new Set<string>();

  snap.forEach((doc) => {
    const data = doc.data() as Partial<AdminDoc>;
    firestoreKeys.add(doc.id);
    firestoreRows.push({
      email: typeof data.email === "string" ? data.email : doc.id,
      source: "firestore",
      addedByEmail: data.addedByEmail,
      addedAt: toIso(data.addedAt as FirebaseFirestore.Timestamp | undefined),
      lastSignInAt: toIso(
        data.lastSignInAt as FirebaseFirestore.Timestamp | undefined,
      ),
      removable: doc.id !== auth.email,
    });
  });

  const seeds = getSeedEmails();
  const seedRows: AdminListItem[] = seeds
    .filter((seed) => !firestoreKeys.has(seed))
    .map((seed) => ({
      email: seed,
      source: "seed",
      removable: false,
    }));

  for (const row of firestoreRows) {
    if (seeds.includes(row.email.toLowerCase())) {
      row.removable = false;
    }
  }

  const admins = [...seedRows, ...firestoreRows].sort((a, b) =>
    a.email.localeCompare(b.email),
  );

  res.status(200).json({
    admins,
    callerEmail: auth.email,
    seedCount: seeds.length,
  });
}

async function addAdmin(
  req: Request,
  res: Response,
  auth: AdminIdentity,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error, code: "INVALID_EMAIL" });
    return;
  }
  const { email, ...extra } = parsed.body;
  if (Object.keys(extra).length > 0) {
    res.status(400).json({
      error: `Unexpected field: ${Object.keys(extra)[0]}`,
      code: "INVALID_EMAIL",
    });
    return;
  }
  if (typeof email !== "string" || !isValidEmail(email)) {
    res.status(400).json({ error: "Invalid email", code: "INVALID_EMAIL" });
    return;
  }

  const emailDisplay = email.trim();
  const emailLower = normalizeEmail(email);
  const seeds = getSeedEmails();

  if (seeds.includes(emailLower)) {
    res.status(409).json({
      error: "Email is already a seed admin",
      code: "SEED_ADMIN",
    });
    return;
  }

  const docRef = db.doc(`admins/${emailLower}`);
  const doc: AdminDoc = {
    email: emailDisplay,
    addedByEmail: auth.email,
    addedByUid: auth.uid,
    addedAt: FieldValue.serverTimestamp() as unknown as FirebaseFirestore.Timestamp,
  };

  try {
    await docRef.create(doc);
  } catch (err) {
    if (isAlreadyExists(err)) {
      res.status(409).json({
        error: "Email is already an admin",
        code: "ALREADY_ADMIN",
      });
      return;
    }
    throw err;
  }

  const saved = await docRef.get();
  const data = saved.data() as AdminDoc | undefined;

  logger.info("adminUsers add", {
    uid: auth.uid,
    action: "add",
    email: emailLower,
  });

  res.status(201).json({
    email: data?.email ?? emailDisplay,
    source: "firestore",
    addedByEmail: data?.addedByEmail ?? auth.email,
    addedAt: toIso(data?.addedAt),
    removable: true,
  } satisfies AdminListItem);
}

async function removeAdmin(
  res: Response,
  auth: AdminIdentity,
  rawEmail: string,
): Promise<void> {
  const emailLower = normalizeEmail(decodeURIComponent(rawEmail));
  if (!emailLower) {
    res.status(400).json({ error: "Invalid email", code: "INVALID_EMAIL" });
    return;
  }

  if (emailLower === auth.email) {
    res.status(409).json({
      error: "You cannot remove your own admin access",
      code: "CANNOT_REMOVE_SELF",
    });
    return;
  }

  if (getSeedEmails().includes(emailLower)) {
    res.status(409).json({
      error: "Seed admins cannot be removed via the dashboard",
      code: "CANNOT_REMOVE_SEED",
    });
    return;
  }

  const docRef = db.doc(`admins/${emailLower}`);
  const snap = await docRef.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Admin not found", code: "NOT_FOUND" });
    return;
  }

  await docRef.delete();

  logger.info("adminUsers remove", {
    uid: auth.uid,
    action: "remove",
    email: emailLower,
  });

  res.status(200).json({ ok: true, email: emailLower });
}

function isAlreadyExists(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === 6 || code === "already-exists";
}

export const adminUsers = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,DELETE");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    void ADMIN_EMAILS;

    const auth = await requireAdmin(req, res);
    if (!auth) return;

    try {
      const tail = parseTail(req.path);
      if (tail.length === 0) {
        if (req.method === "GET") {
          await listAdmins(res, auth);
          return;
        }
        if (req.method === "POST") {
          await addAdmin(req, res, auth);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      if (tail.length === 1 && req.method === "DELETE") {
        await removeAdmin(res, auth, tail[0]);
        return;
      }

      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("adminUsers failed", {
        uid: auth.uid,
        err: String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);
