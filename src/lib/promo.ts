/**
 * Public promo-code helpers used by the checkout UI. The validation endpoint
 * lives at /api/promo/validate and always returns a 200 with a tagged body
 * so the client can render the message inline.
 */
export type PromoValidateOk = {
  ok: true;
  code: string;
  discount: number;
  kind: "percent" | "fixed";
  value: number;
};

export type PromoValidateResponse =
  | PromoValidateOk
  | { ok: false; error: string };

export interface ValidatePromoInput {
  code: string;
  subtotal: number;
  email?: string;
}

export async function validatePromo(
  input: ValidatePromoInput,
): Promise<PromoValidateResponse> {
  const res = await fetch("/api/promo/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let message = "Could not validate code";
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string") message = body.error;
    } catch {
      // fall through
    }
    return { ok: false, error: message };
  }
  return (await res.json()) as PromoValidateResponse;
}
