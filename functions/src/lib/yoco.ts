import { createHmac, timingSafeEqual } from "crypto";

const YOCO_API = "https://payments.yoco.com/api";

export interface CreateCheckoutInput {
  amount: number; // cents
  currency: "ZAR";
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  metadata: Record<string, string>;
}

export interface YocoCheckout {
  id: string;
  redirectUrl: string;
  status: string;
}

export async function createYocoCheckout(
  secretKey: string,
  input: CreateCheckoutInput,
): Promise<YocoCheckout> {
  const res = await fetch(`${YOCO_API}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yoco createCheckout failed: ${res.status} ${text}`);
  }
  return (await res.json()) as YocoCheckout;
}

/**
 * Verify Yoco webhook signature.
 * Headers used: `webhook-id`, `webhook-timestamp`, `webhook-signature`.
 * Signed payload: `${id}.${timestamp}.${rawBody}`.
 * Secret is prefixed "whsec_" + base64 — strip the prefix, base64-decode, HMAC-SHA256.
 * Header may contain multiple space-separated `v1,<sig>` entries — any match passes.
 */
export function verifyYocoSignature(
  secret: string,
  webhookId: string,
  webhookTimestamp: string,
  rawBody: string,
  signatureHeader: string,
): boolean {
  if (!secret || !webhookId || !webhookTimestamp || !signatureHeader) return false;
  const secretKey = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret);
  const signed = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretKey).update(signed).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const candidates = signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((s): s is string => !!s);
  return candidates.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length &&
      timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}
