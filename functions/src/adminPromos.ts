/**
 * Admin CRUD for promo codes.
 *
 *   GET    /api/admin/promos          — list every promo
 *   POST   /api/admin/promos          — create (body must include code)
 *   PATCH  /api/admin/promos/{code}   — partial update (code immutable)
 *   DELETE /api/admin/promos/{code}   — remove
 *
 * Code is the doc id, normalized to uppercase A-Z0-9_- (no spaces) so URLs
 * stay clean.
 */
import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import {
  db,
  FieldValue,
  Timestamp,
  type PromoCode,
  type PromoCodeKind,
} from "./lib/firestore";
import { ADMIN_EMAILS, requireAdmin, type AdminIdentity } from "./lib/auth";
import { applyCors } from "./lib/cors";
import { normalizePromoCode } from "./lib/promo";

const ROOT_PATH = "/api/admin/promos";
const CODE_PATTERN = /^[A-Z0-9_-]{3,30}$/;
const MAX_NOTES_LEN = 500;

interface PromoListItem {
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

function parseTail(rawPath: string): string[] {
  const trimmed = rawPath.startsWith(ROOT_PATH)
    ? rawPath.slice(ROOT_PATH.length)
    : rawPath.replace(/^\/+/, "");
  return trimmed.split("/").filter(Boolean);
}

function toIso(
  ts: FirebaseFirestore.Timestamp | undefined | null,
): string | undefined {
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

function toListItem(code: string, promo: PromoCode): PromoListItem {
  return {
    code,
    kind: promo.kind,
    value: promo.value,
    active: promo.active,
    startsAt: toIso(promo.startsAt),
    expiresAt: toIso(promo.expiresAt),
    maxRedemptions: promo.maxRedemptions,
    redemptionCount: promo.redemptionCount,
    firstOrderOnly: promo.firstOrderOnly === true,
    notes: promo.notes,
    createdAt: toIso(promo.createdAt),
    updatedAt: toIso(promo.updatedAt),
  };
}

interface ValidatedFields {
  kind?: PromoCodeKind;
  value?: number;
  active?: boolean;
  startsAt?: FirebaseFirestore.Timestamp | null;
  expiresAt?: FirebaseFirestore.Timestamp | null;
  maxRedemptions?: number | null;
  firstOrderOnly?: boolean;
  notes?: string;
}

function parseIsoTimestamp(
  raw: unknown,
  field: string,
): { ok: true; value: FirebaseFirestore.Timestamp | null } | { ok: false; error: string } {
  if (raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: `${field} must be an ISO date string` };
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: `${field} is not a valid date` };
  }
  return { ok: true, value: Timestamp.fromDate(date) };
}

function validateFields(
  body: Record<string, unknown>,
  partial: boolean,
): { ok: true; fields: ValidatedFields } | { ok: false; error: string } {
  const allowed = [
    "kind",
    "value",
    "active",
    "startsAt",
    "expiresAt",
    "maxRedemptions",
    "firstOrderOnly",
    "notes",
  ] as const;
  for (const k of Object.keys(body)) {
    if (!(allowed as readonly string[]).includes(k)) {
      return { ok: false, error: `Unexpected field: ${k}` };
    }
  }
  const fields: ValidatedFields = {};

  if (body.kind !== undefined) {
    if (body.kind !== "percent" && body.kind !== "fixed") {
      return { ok: false, error: "kind must be 'percent' or 'fixed'" };
    }
    fields.kind = body.kind;
  } else if (!partial) {
    return { ok: false, error: "kind is required" };
  }

  if (body.value !== undefined) {
    if (
      typeof body.value !== "number" ||
      !Number.isFinite(body.value) ||
      body.value <= 0
    ) {
      return { ok: false, error: "value must be a positive number" };
    }
    const kindForCheck = fields.kind ?? (partial ? undefined : "fixed");
    if (kindForCheck === "percent" && body.value > 100) {
      return { ok: false, error: "percent value must be ≤ 100" };
    }
    fields.value = Math.round(body.value * 100) / 100;
  } else if (!partial) {
    return { ok: false, error: "value is required" };
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return { ok: false, error: "active must be a boolean" };
    }
    fields.active = body.active;
  } else if (!partial) {
    fields.active = true;
  }

  if (body.startsAt !== undefined) {
    const r = parseIsoTimestamp(body.startsAt, "startsAt");
    if (!r.ok) return r;
    fields.startsAt = r.value;
  }
  if (body.expiresAt !== undefined) {
    const r = parseIsoTimestamp(body.expiresAt, "expiresAt");
    if (!r.ok) return r;
    fields.expiresAt = r.value;
  }
  if (fields.startsAt && fields.expiresAt && fields.startsAt.toMillis() >= fields.expiresAt.toMillis()) {
    return { ok: false, error: "expiresAt must be after startsAt" };
  }

  if (body.maxRedemptions !== undefined) {
    if (body.maxRedemptions === null) {
      fields.maxRedemptions = null;
    } else if (
      typeof body.maxRedemptions !== "number" ||
      !Number.isInteger(body.maxRedemptions) ||
      body.maxRedemptions <= 0
    ) {
      return {
        ok: false,
        error: "maxRedemptions must be a positive integer or null",
      };
    } else {
      fields.maxRedemptions = body.maxRedemptions;
    }
  }

  if (body.firstOrderOnly !== undefined) {
    if (typeof body.firstOrderOnly !== "boolean") {
      return { ok: false, error: "firstOrderOnly must be a boolean" };
    }
    fields.firstOrderOnly = body.firstOrderOnly;
  } else if (!partial) {
    fields.firstOrderOnly = false;
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return { ok: false, error: "notes must be a string" };
    }
    const trimmed = body.notes.trim();
    if (trimmed.length > MAX_NOTES_LEN) {
      return { ok: false, error: "notes too long" };
    }
    fields.notes = trimmed;
  }

  return { ok: true, fields };
}

async function listPromos(res: Response): Promise<void> {
  const snap = await db.collection("promoCodes").orderBy("code").get();
  const items = snap.docs.map((doc) =>
    toListItem(doc.id, doc.data() as PromoCode),
  );
  res.status(200).json({ items });
}

function fieldsToDoc(fields: ValidatedFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (fields.kind !== undefined) out.kind = fields.kind;
  if (fields.value !== undefined) out.value = fields.value;
  if (fields.active !== undefined) out.active = fields.active;
  if (fields.startsAt !== undefined) {
    out.startsAt = fields.startsAt ?? FieldValue.delete();
  }
  if (fields.expiresAt !== undefined) {
    out.expiresAt = fields.expiresAt ?? FieldValue.delete();
  }
  if (fields.maxRedemptions !== undefined) {
    out.maxRedemptions =
      fields.maxRedemptions === null
        ? FieldValue.delete()
        : fields.maxRedemptions;
  }
  if (fields.firstOrderOnly !== undefined)
    out.firstOrderOnly = fields.firstOrderOnly;
  if (fields.notes !== undefined) {
    out.notes = fields.notes.length === 0 ? FieldValue.delete() : fields.notes;
  }
  return out;
}

async function createPromo(
  req: Request,
  res: Response,
  auth: AdminIdentity,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const rawCode = parsed.body.code;
  if (typeof rawCode !== "string") {
    res.status(400).json({ error: "code is required" });
    return;
  }
  const code = normalizePromoCode(rawCode);
  if (!CODE_PATTERN.test(code)) {
    res
      .status(400)
      .json({ error: "code must be 3–30 chars A-Z 0-9 _ - only" });
    return;
  }
  const { code: _stripped, ...rest } = parsed.body;
  void _stripped;
  const validated = validateFields(rest, false);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const ref = db.doc(`promoCodes/${code}`);
  try {
    await ref.create({
      code,
      redemptionCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...fieldsToDoc(validated.fields),
    });
  } catch (err) {
    const errCode = (err as { code?: unknown }).code;
    if (errCode === 6 || errCode === "already-exists") {
      res.status(409).json({ error: `Promo ${code} already exists` });
      return;
    }
    throw err;
  }
  const saved = await ref.get();
  logger.info("adminPromos create", { uid: auth.uid, code });
  res.status(201).json(toListItem(code, saved.data() as PromoCode));
}

async function patchPromo(
  req: Request,
  res: Response,
  auth: AdminIdentity,
  code: string,
): Promise<void> {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (parsed.body.code !== undefined && normalizePromoCode(String(parsed.body.code)) !== code) {
    res.status(400).json({ error: "code cannot be changed" });
    return;
  }
  const { code: _stripped, ...rest } = parsed.body;
  void _stripped;
  const validated = validateFields(rest, true);
  if (!validated.ok) {
    res.status(400).json({ error: validated.error });
    return;
  }
  const ref = db.doc(`promoCodes/${code}`);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await ref.update({
    ...fieldsToDoc(validated.fields),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  logger.info("adminPromos patch", {
    uid: auth.uid,
    code,
    fields: Object.keys(validated.fields),
  });
  res.status(200).json(toListItem(code, saved.data() as PromoCode));
}

async function deletePromo(
  res: Response,
  auth: AdminIdentity,
  code: string,
): Promise<void> {
  const ref = db.doc(`promoCodes/${code}`);
  const snap = await ref.get();
  if (!snap.exists) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await ref.delete();
  logger.info("adminPromos delete", { uid: auth.uid, code });
  res.status(200).json({ ok: true, code });
}

export const adminPromos = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req, res) => {
    applyCors(req, res, "GET,POST,PATCH,DELETE");

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
          await listPromos(res);
          return;
        }
        if (req.method === "POST") {
          await createPromo(req, res, auth);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      if (tail.length === 1) {
        const code = normalizePromoCode(decodeURIComponent(tail[0]));
        if (req.method === "PATCH") {
          await patchPromo(req, res, auth, code);
          return;
        }
        if (req.method === "DELETE") {
          await deletePromo(res, auth, code);
          return;
        }
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }
      res.status(404).json({ error: "Not found" });
    } catch (err) {
      logger.error("adminPromos failed", { uid: auth.uid, err: String(err) });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      }
    }
  },
);

export type { PromoListItem };
