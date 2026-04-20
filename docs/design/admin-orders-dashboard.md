# Admin Orders Dashboard — Design

**Status:** Draft for review
**Date:** 2026-04-20
**Author:** Isaac Mpharalala (with Claude)
**Related:** `CHECKOUT_SETUP.md` → "Known follow-ups" → *Admin dashboard (read Firestore orders behind auth)*

---

## 1. Problem

The public checkout flow creates `orders/{id}` documents in Firestore and notifies the merchant via a Resend email. There is currently no UI to:

- Review historical orders
- Change fulfillment state (e.g. mark as shipped)
- Add operational context (tracking numbers, internal notes)
- Re-send a customer receipt if it bounced

The owner today manages orders from the merchant notification email + the Yoco dashboard. This doesn't scale past a handful of orders per week and provides no single source of truth for fulfillment state.

## 2. Goals

1. **Track** — at-a-glance list of all orders, filterable by status, date range, and searchable by ref / customer email.
2. **Drill** — per-order detail view with full items, customer, payment IDs, and event history.
3. **Manage** — mark as `shipped` (with carrier + tracking), add internal notes, resend customer receipt, mark as `cancelled`.
4. **Stay safe** — gate the whole surface behind Firebase Auth with a small admin allowlist. Customer PII must not leak to unauthenticated users.

## 3. Non-goals

- Processing refunds inline. Yoco dashboard remains the refund tool; we only mirror the resulting status.
- Inventory tracking (separate future feature).
- Discount / promo code management.
- Multi-role staff hierarchy beyond a single admin role.
- Bulk operations on orders (scale doesn't justify it yet).

## 4. Constraints (audited from the repo)

| Constraint | Source | Implication |
|---|---|---|
| `output: "export"` | `next.config.ts` | Admin UI is a client-rendered SPA. No SSR, no server components, no Next.js API routes — data flows through Cloud Functions. |
| `firestore.rules` deny-all | `firestore.rules` | Reads/writes must go through authenticated Cloud Functions. Do **not** loosen rules. |
| `Order` type lives in `functions/src/lib/firestore.ts` | existing code | Reuse, don't fork. Extend `status` and add new optional fields. |
| `Product` type is duplicated across `src/lib/products.ts` + `functions/src/lib/products.ts` | pre-implementation rule | Any new shared admin type that crosses the boundary must likewise stay in sync (or live server-only). |
| No existing auth | greenfield | Introduce Firebase Auth — already in the stack via `firebase-admin` on the server. |
| Current `Order.status` = `"pending" \| "paid" \| "failed"` | `firestore.ts:32` | Need to accommodate post-payment fulfillment states. |
| Next.js 16 "NOT the Next.js you know" | `AGENTS.md` | Before implementing, read `node_modules/next/dist/docs/` for App Router and static export specifics. |

## 5. Domain model

### 5.1 Order (extended)

```ts
interface Order {
  ref: string;                         // KT-YYYYMMDD-NNNN
  status:
    | "pending"                        // checkout created, awaiting Yoco
    | "paid"                           // Yoco payment succeeded
    | "failed"                         // Yoco payment failed
    | "shipped"                        // admin marked as shipped
    | "cancelled";                     // admin cancelled (any prior state)
  items: OrderItem[];
  subtotal: number; shipping: number; total: number;
  customer: Customer;
  yoco: { checkoutId: string; paymentId?: string; failureReason?: string };
  createdAt: Timestamp;
  paidAt?: Timestamp;
  shippedAt?: Timestamp;               // NEW
  cancelledAt?: Timestamp;             // NEW
  tracking?: {                         // NEW
    carrier: string;
    number: string;
    url?: string;
  };
  notes?: OrderNote[];                 // NEW
}

interface OrderNote {
  at: Timestamp;
  by: string;                          // admin email or UID
  body: string;
}
```

### 5.2 Design choice — widen `status` vs. separate `fulfillment`

| Option | Pros | Cons |
|---|---|---|
| **A. Widen `status`** *(proposed)* | Single source of truth; simple filter UI; no migration of existing docs | Mixes payment + fulfillment; admin mutations must enforce valid transitions server-side |
| **B. Add `fulfillment: "new" \| "shipped" \| "cancelled"` alongside payment `status`** | Clean separation; payment state stays immutable | Two filters in UI; more state to reason about |

**Recommendation: A.** Current scale (~handful/week), fulfillment always follows payment, and the transition matrix is small enough to encode in the Cloud Function:

```
pending    → cancelled
paid       → shipped | cancelled
failed     → cancelled
shipped    → (terminal; allow cancelled with reason)
cancelled  → (terminal)
```

If scale grows or returns/exchanges become a thing, revisit.

## 6. Access control

### 6.1 Auth mechanism

**Firebase Auth** with **Google sign-in**. Admin identity is pinned by UID using a server-side allowlist stored as a Firebase Functions param (`defineString("ADMIN_UIDS")`) — comma-separated UIDs.

**Rejected:** custom claims (`admin: true`). Better for scale but requires a provisioning step. The allowlist is simpler for a 1-person admin and can migrate to claims later without any data shape change.

**Rejected:** email/password auth. Google sign-in gives MFA for free via the owner's Google account.

### 6.2 Firestore rules — unchanged

`firestore.rules` stays deny-all. The admin dashboard **never** uses the client Firestore SDK; everything goes through authenticated Cloud Functions. This keeps the blast radius of any rule bug at zero.

### 6.3 Auth middleware

New file `functions/src/lib/auth.ts`:

```ts
export async function requireAdmin(req, res): Promise<string | null> {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) { res.status(401).send("Missing token"); return null; }
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    const allow = (ADMIN_UIDS.value() ?? "").split(",").map(s => s.trim());
    if (!allow.includes(decoded.uid)) {
      res.status(403).send("Forbidden"); return null;
    }
    return decoded.uid;
  } catch {
    res.status(401).send("Invalid token"); return null;
  }
}
```

Every admin endpoint calls `requireAdmin` before doing anything.

## 7. API surface (new Cloud Functions)

All endpoints require `Authorization: Bearer <Firebase ID token>` and pass the allowlist check. All mounted via `firebase.json` rewrites under `/api/admin/...`.

| Method | Path | Function | Purpose |
|---|---|---|---|
| `GET` | `/api/admin/orders` | `adminListOrders` | Paginated list. Query: `status`, `q` (ref or email contains), `from`, `to` (ISO dates), `limit` (default 50, max 100), `cursor` (opaque). Returns `{orders, nextCursor}`. |
| `GET` | `/api/admin/orders/:id` | `adminGetOrder` | Full order including PII and yoco IDs. |
| `POST` | `/api/admin/orders/:id/mark-shipped` | `adminMarkShipped` | Body `{carrier, number, url?}`. Transitions `paid → shipped`, writes `tracking`, `shippedAt`. Triggers `sendShippingConfirmation` email. |
| `POST` | `/api/admin/orders/:id/cancel` | `adminCancelOrder` | Body `{reason, notifyCustomer}`. Transitions to `cancelled`, writes `cancelledAt`, appends a note. Optionally emails customer. |
| `POST` | `/api/admin/orders/:id/notes` | `adminAddNote` | Body `{body}`. Appends an `OrderNote`. |
| `POST` | `/api/admin/orders/:id/resend-receipt` | `adminResendReceipt` | Re-invokes `sendCustomerReceipt`. Rate-limited to 1× per 10 minutes per order (Firestore doc-level `lastResendAt` check). |

Each function logs `{ actor: uid, orderId, action, result }` via the existing `firebase-functions` logger. No new monitoring dashboard for Phase 1 — logs are enough.

### 7.1 `firebase.json` rewrite additions

```json
{ "source": "/api/admin/orders", "function": "adminListOrders" },
{ "source": "/api/admin/orders/**", "function": "adminOrderActions" }
```

`adminOrderActions` is one dispatcher function that routes by method + path suffix (`/:id`, `/:id/mark-shipped`, `/:id/cancel`, `/:id/notes`, `/:id/resend-receipt`). Alternative: one Cloud Function per endpoint — cleaner but 5× the cold starts. **Recommendation:** single dispatcher. Matches the pattern of `getOrder.ts` which already path-parses.

## 8. Frontend

### 8.1 Routing (static export compatible)

```
src/app/admin/
├── layout.tsx                    # AdminShell: auth guard + sidebar + sign-out
├── page.tsx                      # redirects to /admin/orders/
└── orders/
    ├── page.tsx                  # list view
    └── detail/
        └── page.tsx              # detail view, reads ?id=... query param
```

Because `output: "export"` pre-builds every route at build time, the detail route is a fixed `/admin/orders/detail/` page that reads `?id=<orderId>` client-side. This avoids per-order pre-rendering (infeasible — orders are created at runtime).

**Rejected alternatives:**
- `/admin/orders/[id]/page.tsx` — needs `generateStaticParams` or it breaks with `output: export`.
- `/admin/[[...slug]]/page.tsx` catch-all — works but adds client-side routing complexity for little benefit.

### 8.2 Component/file additions

```
src/app/admin/...                    # as above
src/components/admin/
├── AdminShell.tsx                   # sidebar + topbar + children
├── OrderTable.tsx                   # list view
├── OrderFilters.tsx                 # status/date/search filter bar
├── OrderDetailView.tsx              # items, customer, payment, actions
├── MarkShippedDialog.tsx
├── CancelOrderDialog.tsx
└── NotesList.tsx
src/lib/admin/
├── auth-context.tsx                 # Firebase Auth provider + idToken helper
├── api-client.ts                    # fetch wrapper injecting Bearer token
└── orders-types.ts                  # mirror of functions/src/lib/firestore.ts::Order
```

### 8.3 Client Firebase config

Firebase Auth client needs the public web config. Add `src/lib/firebase-client.ts` with:

```ts
export const firebaseApp = initializeApp({ /* public config */ });
export const auth = getAuth(firebaseApp);
```

The public Firebase config is safe to commit (Auth is secured by server-side allowlist, not by hiding config).

### 8.4 UI primitives

Tailwind v4 + existing custom color tokens (`bg-surface`, `text-muted`, `border-border`, `bg-foreground`) from `globals.css`. **No new UI library.** Keeps the admin consistent with the public site's aesthetic and avoids bundle bloat.

Icon set: reuse `lucide-react` (already a dep).

### 8.5 Data fetching pattern

```ts
const res = await fetch("/api/admin/orders?status=paid", {
  headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` }
});
```

All admin reads flow through `api-client.ts` which:
- Injects the Bearer token
- Refreshes the ID token on 401 (once) and retries
- Throws typed errors for the UI to render

No Firestore client SDK. No direct DB reads. This means a single auth surface (ID tokens at the Function boundary) and keeps `firestore.rules` stable.

## 9. Emails (new template)

Add to `functions/src/lib/resend.ts`:

```ts
export async function sendShippingConfirmation(apiKey, order, tracking) { ... }
```

Triggered from `adminMarkShipped`. Uses the existing verified `drumsareme.co.za` sender domain. Template mirrors the receipt template structure for consistency.

Cancellation email is **optional** and gated by the `notifyCustomer` flag in the cancel action — avoids accidentally emailing customers for internal/test cancellations.

## 10. Observability

- All admin mutations log `{ actor, orderId, action, outcome }` at `info` level.
- Failed auth attempts log `{ reason, ip }` at `warn`.
- No new monitoring / alerting for Phase 1.

## 11. Security considerations

| Risk | Mitigation |
|---|---|
| Stolen ID token replay | Firebase ID tokens expire in 1h; client refreshes automatically. Acceptable blast radius. |
| CSRF | Admin endpoints require `Authorization: Bearer` — not cookie auth — so CSRF is N/A. |
| PII leak via list endpoint | Server filters responses to only ship what the UI needs; response for list omits `yoco.paymentId` and truncates address. Detail endpoint returns everything. |
| Admin UID leaked in allowlist | It's a UID, not a credential. No risk on leak. |
| Accidental destructive action | All mutations are idempotent-ish (cancel is terminal); confirmation modal required in UI for cancel. |
| Enumeration via `/admin/orders/:id` | Requires valid admin token — not exploitable without a prior auth compromise. |

## 12. Open questions *(resolve before implementation)*

1. **Carriers** — fixed dropdown (PostNet / Aramex / Paxi / The Courier Guy / Other) or free text?
2. **Retention** — should cancelled orders older than N days be hidden by default in the list, or always visible?
3. **Resend rate limit** — 1× per 10 min per order reasonable, or stricter?
4. **Auth provider** — Google sign-in OK, or require email/password?
5. **Admin count** — expected 1 forever, or could this grow to 2–3? (affects allowlist vs. custom claims decision)
6. **Cancellation email copy** — do you want to draft a template now, or defer to Phase 3 when this action ships?

## 13. Phased rollout

| Phase | Scope | Ship goal |
|---|---|---|
| **1 — read-only** | Auth + list + detail (no mutations) | Validate UX and access control end-to-end before adding write actions |
| **2 — fulfillment** | `mark-shipped` + shipping email + `notes` | Everyday workflow |
| **3 — edge cases** | `cancel` + `resend-receipt` + rate limiting | Long tail |

Each phase ships independently on `main` with its own MR.

## 14. Deferred / explicitly out of scope

- Inline refund processing → Yoco dashboard stays authoritative.
- Inventory and stock-out handling.
- Staff role hierarchy.
- Audit log UI (server logs only for Phase 1).
- Bulk actions on multiple orders.
- Order editing (changing items / prices after creation) — not needed at this scale.

## 15. Implementation checklist *(not started)*

### Backend
- [ ] `functions/src/lib/auth.ts` — `requireAdmin` middleware
- [ ] Extend `Order` type in `functions/src/lib/firestore.ts` with `shippedAt`, `cancelledAt`, `tracking`, `notes`
- [ ] Widen `Order.status` union to include `"shipped" | "cancelled"`
- [ ] `functions/src/adminListOrders.ts`
- [ ] `functions/src/adminOrderActions.ts` — dispatcher for all per-order routes
- [ ] `functions/src/lib/resend.ts` — add `sendShippingConfirmation`
- [ ] Export new functions from `functions/src/index.ts`
- [ ] Update `firebase.json` rewrites
- [ ] Set `ADMIN_UIDS` functions param

### Frontend
- [ ] `src/lib/firebase-client.ts` — client Firebase app + Auth
- [ ] `src/lib/admin/auth-context.tsx`
- [ ] `src/lib/admin/api-client.ts`
- [ ] `src/lib/admin/orders-types.ts`
- [ ] `src/app/admin/layout.tsx` — auth guard
- [ ] `src/app/admin/page.tsx` — redirect
- [ ] `src/app/admin/orders/page.tsx` — list
- [ ] `src/app/admin/orders/detail/page.tsx` — detail
- [ ] `src/components/admin/*` — UI components (list + dialogs)

### Verification
- [ ] `npm run build` passes with static export
- [ ] `npm run lint` clean
- [ ] Manual flow: sign in as admin UID → list orders → view detail → mark shipped → verify email arrives → verify Firestore updated
- [ ] Manual flow: sign in as non-allowlisted UID → receive 403
- [ ] Read Next.js 16 docs under `node_modules/next/dist/docs/` for any App Router + static export caveats touched

### Docs
- [ ] Update `CHECKOUT_SETUP.md` → move "Admin dashboard" from follow-ups to completed
- [ ] Add `docs/admin-setup.md` — how to add/remove admins (edit `ADMIN_UIDS` param)
