import { onDocumentWritten } from "firebase-functions/v2/firestore";
import {
  GITHUB_DISPATCH_TOKEN,
  dispatchRedeployWorkflow,
} from "./lib/githubDispatch";

/**
 * Fires whenever a `products/{productId}` doc is written (created, updated,
 * or deleted). Calls GitHub's workflow_dispatch API to trigger the
 * `auto-redeploy-products.yml` workflow, which re-bakes the static product
 * pages and redeploys Firebase Hosting.
 *
 * The dispatch itself — including the GITHUB_DISPATCH_TOKEN setup steps and
 * the non-throwing failure contract — lives in `./lib/githubDispatch.ts`,
 * shared with `inventoryAutoRedeploy`. A failed dispatch is non-critical: the
 * admin can still run `npm run sync:products && npm run build && firebase
 * deploy` manually.
 */

export const productsAutoRedeploy = onDocumentWritten(
  {
    document: "products/{productId}",
    secrets: [GITHUB_DISPATCH_TOKEN],
    region: "us-central1",
  },
  async (event) => {
    const productId = event.params.productId;
    const after = event.data?.after;
    const reason = !event.data?.before?.exists
      ? "create"
      : !after?.exists
        ? "delete"
        : "update";

    await dispatchRedeployWorkflow({
      source: "productsAutoRedeploy",
      dispatchReason: `${reason} ${productId}`,
      logFields: { productId, reason, collection: "products" },
    });
  },
);
