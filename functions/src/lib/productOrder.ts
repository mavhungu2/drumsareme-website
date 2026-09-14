/**
 * Pure ordering logic for the admin Products table's `sortOrder` column.
 * Shared by `createProduct` (insert) and `patchProduct` (move) in
 * `adminProducts.ts` so there is exactly one place that knows how to keep
 * `sortOrder` a dense, gap-free 0..n-1 sequence — duplicates become
 * structurally impossible instead of something to detect and reject.
 *
 * Every `products/{id}` write fires the `productsAutoRedeploy` Firestore
 * trigger (a full site rebuild + redeploy via GitHub Actions), so callers
 * should only write the documents whose `sortOrder` this module says
 * actually changed. See the callers in `adminProducts.ts` for the diffing.
 */

export interface OrderedProduct {
  id: string;
  sortOrder: number;
}

/**
 * Rebuilds the full ordering after moving an existing product or inserting
 * a new one at `position`.
 *
 * `products` is the CURRENT full set (id + sortOrder only) and does not
 * need to already be contiguous or duplicate-free: the order is recomputed
 * from scratch every call (sort, remove/insert, re-index), so stray gaps or
 * duplicates left by a manual Firestore edit self-heal on the very next
 * write instead of compounding.
 *
 * Pass `{ movingId }` to reposition a product already present in
 * `products`, or `{ insertingId }` for one that ISN'T in `products` yet.
 * `position` is clamped into the valid range before being applied — an
 * out-of-range position means "move to the end", not an error:
 *   - move:   valid range is 0..products.length-1
 *   - insert: valid range is 0..products.length
 *
 * Returns the complete new ordering, re-indexed 0..n-1, including entries
 * that didn't move. Callers diff this against the input themselves to find
 * which documents actually need writing.
 */
export function reorderProducts(
  products: readonly OrderedProduct[],
  position: number,
  op: { movingId: string } | { insertingId: string },
): OrderedProduct[] {
  const sorted = [...products].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );

  if ("movingId" in op) {
    const rest = sorted.filter((p) => p.id !== op.movingId);
    if (rest.length === sorted.length) {
      throw new Error(`Product ${op.movingId} not found in current ordering`);
    }
    return insertAt(rest, position, op.movingId);
  }
  return insertAt(sorted, position, op.insertingId);
}

function insertAt(
  rest: OrderedProduct[],
  position: number,
  id: string,
): OrderedProduct[] {
  const clamped = Math.max(0, Math.min(position, rest.length));
  const result = [...rest];
  result.splice(clamped, 0, { id, sortOrder: clamped });
  return result.map((p, index) => ({ id: p.id, sortOrder: index }));
}
