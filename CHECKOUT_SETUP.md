# Online Checkout — Setup & Deploy Checklist

Status: **code complete, committed locally as `d0aa782`, NOT yet pushed**.

Once pushed, the merge workflow will:
1. Deploy the new Checkout UI to `drumsareme.co.za` (hosting).
2. Attempt to deploy `functions/` + `firestore.rules`.

Step 2 will fail until the prereqs below are complete, and the live
"Pay" button will 404 because the WhatsApp flow was removed. **Do the
prereqs before pushing.**

---

## 1. Yoco — credentials & webhook

1. Yoco dashboard → **Developers**.
2. Copy the **live secret key** (`sk_live_…`) and the **webhook signing secret** (`whsec_…`).
3. Register a webhook endpoint:
   - URL: `https://drumsareme.co.za/api/yoco/webhook`
   - Events: `payment.succeeded`, `payment.failed`

## 2. Resend — verify sending domain

1. Sign up at resend.com.
2. Domains → add `drumsareme.co.za`.
3. Add the DKIM/SPF TXT records via Afrihost DNS.
   - Current SPF: `v=spf1 include:spf.aserv.co.za +a +mx -all`
   - Append Resend's include (per their instructions) before the `-all`.
4. Generate an API key (`re_…`).

## 3. Set Firebase Function secrets (interactive)

Run these from the repo root. Paste each value when prompted.

```bash
firebase functions:secrets:set YOCO_SECRET_KEY
firebase functions:secrets:set YOCO_WEBHOOK_SECRET
firebase functions:secrets:set RESEND_API_KEY
```

Optional non-secret override (defaults to `drumsareme.ent@gmail.com`):

```bash
firebase functions:config:set runtime.merchant_email="drumsareme.ent@gmail.com"
```

Note: Resend requires a verified sender domain. The `from:` address in
`functions/src/lib/resend.ts` stays on the verified `drumsareme.co.za`
domain — the merchant notification email above is only the *recipient*
address (where order notifications are delivered). To send *from*
`drumsareme.ent@gmail.com`, Gmail cannot be verified with Resend; use
Gmail's own SMTP or keep the verified domain as the sender.

## 4. Grant extra IAM to the CI service account

The GitHub Actions SA (`github-action-1206896954@…`) was created with
Hosting Admin only. Functions + Firestore deploys need these extras:

```bash
SA=github-action-1206896954@drumsareme-website.iam.gserviceaccount.com
PROJECT=drumsareme-website
for ROLE in \
    roles/cloudfunctions.admin \
    roles/run.admin \
    roles/iam.serviceAccountUser \
    roles/datastore.owner \
    roles/firebaserules.admin ; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" --role="$ROLE" --condition=None
done
```

`roles/datastore.owner` covers Firestore data; `roles/firebaserules.admin`
is required for `firebase deploy --only firestore:rules`. If you also
deploy Storage rules later, add `roles/firebaserules.admin` is
sufficient.

Alternative: use the [IAM console](https://console.cloud.google.com/iam-admin/iam?project=drumsareme-website).

## 5. Push and deploy

```bash
git push origin main
gh run watch $(gh run list --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

## 6. Smoke test on prod

1. Visit https://drumsareme.co.za/products/5a-natural/ → Add to Cart.
2. Go to `/cart` → Checkout → fill form → Pay.
3. Complete a real R250 purchase (1 pair × R150 + R100 shipping) with a real card.
4. Confirm:
   - Redirect to `/checkout/success/?orderId=…` and order ref shown.
   - Customer receipt + merchant email both arrive.
   - `orders/{id}` in Firestore shows `status: "paid"`.
5. Refund yourself from the Yoco dashboard.

---

## Architecture summary

```
Browser                                   Firebase Hosting            Cloud Functions           External
  │                                                │                          │                    │
  │ GET /checkout/ (static export)                 │                          │                    │
  ├──────────────────────────────────────────────▶ │                          │                    │
  │                                                │                          │                    │
  │ POST /api/checkout                             │                          │                    │
  ├──────────────────────────────────────────────▶ rewrite ──────────────────▶ createCheckout       │
  │                                                                           │  createOrder(pending)│
  │                                                                           ├──────────────────▶ Yoco: POST /checkouts
  │ {redirectUrl}                                                         ◀───┤                    │
  │                                                                           │                    │
  │ location = redirectUrl                                                                         │
  ├───────────────────────────────────────────────────────────────────────────────────────────────▶ Yoco hosted page
  │                                                                                                │ customer pays
  │                                                                                                │
  │                                                                           ◀────────────────────┤ webhook → /api/yoco/webhook
  │                                                                           │ yocoWebhook        │
  │                                                                           │  verify sig        │
  │                                                                           │  order.status=paid │
  │                                                                           │  Resend.send(x2)   │
  │                                                                                                │
  │ redirect to /checkout/success/?orderId=…                                                       │
  │ GET /api/orders/{id} ─▶ getOrder ─▶ Firestore                                                  │
```

## File map

Server:
- `functions/src/createCheckout.ts` — POST handler, creates Firestore order + Yoco session.
- `functions/src/yocoWebhook.ts` — verifies signature, flips status, sends emails.
- `functions/src/getOrder.ts` — public-safe order lookup for success page.
- `functions/src/lib/yoco.ts` — fetch wrapper + HMAC-SHA256 signature verify.
- `functions/src/lib/products.ts` — **server price catalog** (source of truth).
- `functions/src/lib/firestore.ts` — admin init, Order/Customer types, `generateOrderRef`.
- `functions/src/lib/resend.ts` — customer + merchant email templates.
- `firestore.rules` — deny-all; functions use admin SDK.

Client:
- `src/app/checkout/page.tsx` — form + summary → POST `/api/checkout`.
- `src/app/checkout/success/page.tsx` — polls `GET /api/orders/:id`, clears cart on paid.
- `src/app/checkout/cancelled/page.tsx` — fallback for cancel/fail.
- `src/app/cart/page.tsx` — WhatsApp CTA replaced by Checkout link + shipping line.
- `src/lib/products.ts` — exports `SHIPPING_FLAT_ZAR` and the client product catalog.

Infra:
- `firebase.json` — `rewrites` for `/api/*`, `functions`, `firestore` blocks.
- `.github/workflows/firebase-hosting-merge.yml` — extra step deploys `functions,firestore:rules`.
- `package.json` — `deploy:firebase` now deploys hosting + functions + rules.

## Rollback

If checkout breaks on prod and you need the WhatsApp flow back fast:

```bash
git revert d0aa782
git push origin main
```

CI will redeploy the previous hosting build (WhatsApp cart). Functions +
rules can stay deployed — they'll just be unused until re-enabled.

## Known follow-ups (out of scope for now)

- Admin dashboard (read Firestore orders behind auth)
- Inventory tracking
- Discount codes
- Tax/VAT line (confirm R150 is inclusive before adding)
- Refund flow in admin UI
