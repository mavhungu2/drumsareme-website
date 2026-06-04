/**
 * Public endpoint used by the checkout UI to live-validate a promo code.
 * Returns the computed discount + a friendly display label. Always answers
 * 200 with `{ok: boolean, error?}` so the client can render the result
 * without distinguishing transport errors from business validation errors.
 */
import { onRequest, type Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { logger } from "firebase-functions";
import { applyCors } from "./lib/cors";
import { validatePromoCode } from "./lib/promo";

interface ValidateBody {
  code: unknown;
  subtotal: unknown;
  email?: unknown;
}

function parseBody(req: Request): ValidateBody | null {
  const raw = req.body;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as ValidateBody;
  }
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as ValidateBody;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export const validatePromo = onRequest(
  { region: "us-central1", cors: false, invoker: "public" },
  async (req: Request, res: Response) => {
    applyCors(req, res, "POST");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const body = parseBody(req);
    if (!body) {
      res.status(400).json({ ok: false, error: "Invalid request" });
      return;
    }
    if (typeof body.code !== "string") {
      res.status(400).json({ ok: false, error: "code is required" });
      return;
    }
    if (
      typeof body.subtotal !== "number" ||
      !Number.isFinite(body.subtotal) ||
      body.subtotal < 0
    ) {
      res.status(400).json({ ok: false, error: "subtotal is required" });
      return;
    }
    const email =
      typeof body.email === "string" && body.email.trim().length > 0
        ? body.email.trim()
        : undefined;

    try {
      const result = await validatePromoCode({
        code: body.code,
        subtotal: body.subtotal,
        email,
      });
      if (!result.ok) {
        res.status(200).json({ ok: false, error: result.error });
        return;
      }
      res.status(200).json({
        ok: true,
        code: result.code,
        discount: result.discount,
        kind: result.promo.kind,
        value: result.promo.value,
      });
    } catch (err) {
      logger.error("validatePromo failed", { err: String(err) });
      res.status(500).json({ ok: false, error: "Validation failed" });
    }
  },
);
