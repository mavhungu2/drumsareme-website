import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";

/**
 * Shared GitHub Actions dispatch for every Firestore trigger that needs to
 * re-bake the static shop and redeploy Hosting (currently
 * `productsAutoRedeploy` for `products/{productId}` and
 * `inventoryAutoRedeploy` for `inventory/{productId}`). Centralising the
 * HTTP call and error handling here means the two triggers cannot drift in
 * behaviour.
 *
 * Setup (one-time):
 *   1. Generate a fine-grained GitHub PAT with `actions:write` on
 *      mavhungu2/drumsareme-website.
 *   2. Store it as a Firebase secret:
 *        firebase functions:secrets:set GITHUB_DISPATCH_TOKEN
 *      (paste the PAT when prompted)
 *   3. Redeploy the functions that use it (they list it in `secrets`).
 */

export const GITHUB_DISPATCH_TOKEN = defineSecret("GITHUB_DISPATCH_TOKEN");

const REPO_OWNER = "mavhungu2";
const REPO_NAME = "drumsareme-website";
const WORKFLOW_FILENAME = "auto-redeploy-products.yml";
const REF = "main";

export interface DispatchRedeployParams {
  /**
   * Identifies the calling trigger, e.g. "productsAutoRedeploy" or
   * "inventoryAutoRedeploy". Prefixes every log message so the two triggers
   * stay distinguishable in Cloud Logging even before inspecting structured
   * fields.
   */
  source: string;
  /**
   * Human-readable reason sent to GitHub as `inputs.reason` (shows up in the
   * Actions run list) — e.g. "create 5a-natural".
   */
  dispatchReason: string;
  /**
   * Structured fields attached to every log line for this call, e.g.
   * `{ productId, reason: "create", collection: "inventory" }`.
   */
  logFields: Record<string, unknown>;
}

/**
 * POSTs a workflow_dispatch for `auto-redeploy-products.yml`. NEVER throws:
 * a missing/empty secret, a non-204 response, or a network error is logged
 * and swallowed so a failed dispatch can never fail the Firestore write that
 * triggered it. The admin can always fall back to
 * `npm run sync:products && npm run build && firebase deploy` manually.
 */
export async function dispatchRedeployWorkflow({
  source,
  dispatchReason,
  logFields,
}: DispatchRedeployParams): Promise<void> {
  let token: string;
  try {
    token = GITHUB_DISPATCH_TOKEN.value();
  } catch {
    logger.warn(
      `${source} skipped — GITHUB_DISPATCH_TOKEN not configured. Run \`firebase functions:secrets:set GITHUB_DISPATCH_TOKEN\` to enable.`,
      logFields,
    );
    return;
  }
  if (!token) {
    logger.warn(
      `${source} skipped — GITHUB_DISPATCH_TOKEN secret is empty`,
      logFields,
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
      body: JSON.stringify({ ref: REF, inputs: { reason: dispatchReason } }),
    });

    if (response.status === 204) {
      logger.info(`${source} dispatched workflow`, logFields);
      return;
    }

    const body = await response.text();
    logger.error(`${source} failed to dispatch workflow`, {
      ...logFields,
      status: response.status,
      body,
    });
  } catch (err) {
    logger.error(`${source} dispatch threw`, {
      ...logFields,
      err: String(err),
    });
  }
}
