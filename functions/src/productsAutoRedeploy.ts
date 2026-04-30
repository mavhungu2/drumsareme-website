import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

/**
 * Fires whenever a `products/{productId}` doc is written (created, updated,
 * or deleted). Calls GitHub's workflow_dispatch API to trigger the
 * `auto-redeploy-products.yml` workflow, which re-bakes the static product
 * pages and redeploys Firebase Hosting.
 *
 * Setup (one-time):
 *   1. Generate a fine-grained GitHub PAT with `actions:write` on
 *      mavhungu2/drumsareme-website.
 *   2. Store it as a Firebase secret:
 *        firebase functions:secrets:set GITHUB_DISPATCH_TOKEN
 *      (paste the PAT when prompted)
 *   3. Redeploy this function: `firebase deploy --only functions:productsAutoRedeploy`
 *
 * If the secret is unset or the dispatch fails, the function logs a warning
 * and returns — it never throws. A failed dispatch is non-critical: the admin
 * can still run `npm run sync:products && npm run build && firebase deploy`
 * manually.
 */

const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");

const REPO_OWNER = "mavhungu2";
const REPO_NAME = "drumsareme-website";
const WORKFLOW_FILENAME = "auto-redeploy-products.yml";
const REF = "main";

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

    let token: string;
    try {
      token = GITHUB_DISPATCH_TOKEN.value();
    } catch {
      logger.warn(
        "productsAutoRedeploy skipped — GITHUB_DISPATCH_TOKEN not configured. Run `firebase functions:secrets:set GITHUB_DISPATCH_TOKEN` to enable.",
        { productId, reason },
      );
      return;
    }
    if (!token) {
      logger.warn(
        "productsAutoRedeploy skipped — GITHUB_DISPATCH_TOKEN secret is empty",
        { productId, reason },
      );
      return;
    }

    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILENAME}/dispatches`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ref: REF,
          inputs: { reason: `${reason} ${productId}` },
        }),
      });

      if (response.status === 204) {
        logger.info("productsAutoRedeploy dispatched workflow", {
          productId,
          reason,
        });
        return;
      }

      const body = await response.text();
      logger.error("productsAutoRedeploy failed to dispatch workflow", {
        productId,
        reason,
        status: response.status,
        body,
      });
    } catch (err) {
      logger.error("productsAutoRedeploy dispatch threw", {
        productId,
        reason,
        err: String(err),
      });
    }
  },
);
