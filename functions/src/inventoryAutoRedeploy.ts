import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  GITHUB_DISPATCH_TOKEN,
  dispatchRedeployWorkflow,
} from "./lib/githubDispatch";

/**
 * Fires whenever an `inventory/{productId}` doc is written. The static shop
 * only bakes in products that have an inventory row (see
 * `scripts/sync-products.mjs`), so — just like writing `products/{productId}`
 * — creating or deleting an inventory row flips a product's published state
 * and must trigger the same redeploy. Without this trigger, adding a brand
 * new inventory row leaves the product invisible on the live shop until some
 * unrelated product edit happens to trigger a rebuild.
 *
 * Deliberately narrower than `productsAutoRedeploy`, though: inventory docs
 * are written far more often than product docs. Every paid sale (Yoco
 * webhook, admin mark-paid) and every order edit/cancellation decrements or
 * restores `unitsSold`/`currentStock` via a plain field update on an
 * *existing* doc — it never changes whether the doc exists. None of those
 * fields feed the static bake (only presence/absence of the doc does), so an
 * "update" can never change what's published — only a create (row added) or
 * delete (row removed) can. Dispatching on every update would redeploy the
 * entire site on every single sale, which is wasteful and would hammer
 * GitHub Actions for no visible effect; restricting to create/delete gets
 * "adding stock publishes the product" without that cost. (The workflow's
 * `products-redeploy` concurrency group would collapse a burst of dispatches
 * into one extra run rather than queuing them all, but relying on that to
 * absorb per-sale dispatch traffic would still be needless load.)
 *
 * Shares its dispatch + error-handling logic with `productsAutoRedeploy` via
 * `./lib/githubDispatch.ts`.
 */

export const inventoryAutoRedeploy = onDocumentWritten(
  {
    document: "inventory/{productId}",
    secrets: [GITHUB_DISPATCH_TOKEN],
    region: "us-central1",
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const created = !before?.exists && !!after?.exists;
    const deleted = !!before?.exists && !after?.exists;
    if (!created && !deleted) {
      // Plain field update (stock decremented/restored by a sale, or admin
      // edited openingStock/reorderLevel/supplier) — doc existence didn't
      // change, so the static shop's published set didn't change either.
      return;
    }

    const productId = event.params.productId;
    const reason = created ? "create" : "delete";

    await dispatchRedeployWorkflow({
      source: "inventoryAutoRedeploy",
      dispatchReason: `${reason} ${productId}`,
      logFields: { productId, reason, collection: "inventory" },
    });
  },
);
