/**
 * Product category presentation rules.
 *
 * The catalog started as drumsticks only, so "per pair", size/colour pills and
 * the size/colour filters were hardcoded across the storefront. Now that the
 * shop also carries audio gear, those choices are data: each category declares
 * how its products are priced, described and filtered, and the UI reads the
 * declaration rather than assuming sticks.
 *
 * Adding a category means adding one entry here — no branching in components.
 */

export type CategoryId = "drumsticks" | "audio-interfaces";

/** Product fields that can render as a spec pill or drive a listing filter. */
export type SpecField = "size" | "color";

export interface CategoryPresentation {
  id: CategoryId;
  /** Tab label on the listing page. */
  label: string;
  /** Plural noun for generated copy, e.g. "drumsticks". */
  pluralNoun: string;
  /**
   * Rendered after the price, e.g. "per pair". Empty string renders no suffix —
   * correct for anything sold as a single item.
   */
  unitLabel: string;
  /** Fields shown as pills on cards and the detail page, in order. */
  specPills: ReadonlyArray<SpecField>;
  /** Filters the listing page offers while this category is active. */
  filters: ReadonlyArray<SpecField>;
  /** Blurb under the listing heading when this category is active. */
  blurb: string;
}

/**
 * Products written before categories existed are drumsticks — that was the
 * whole catalog. `backfillProductCategory` makes it explicit in Firestore;
 * this default keeps the storefront correct in the meantime.
 */
export const DEFAULT_CATEGORY: CategoryId = "drumsticks";

export const CATEGORIES: ReadonlyArray<CategoryPresentation> = [
  {
    id: "drumsticks",
    label: "Drumsticks",
    pluralNoun: "drumsticks",
    unitLabel: "per pair",
    specPills: ["size", "color"],
    filters: ["size", "color"],
    blurb:
      "Premium American Hickory drumsticks. From R150 per pair. Available in 5 sizes and a full range of colours, plus our premium Silver range.",
  },
  {
    id: "audio-interfaces",
    label: "Audio Interfaces",
    pluralNoun: "audio interfaces",
    unitLabel: "",
    specPills: [],
    filters: [],
    blurb:
      "Recording interfaces for tracking at home or on the road. Studio-grade conversion, built to travel.",
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function isCategoryId(value: string): value is CategoryId {
  return BY_ID.has(value as CategoryId);
}

/**
 * Presentation rules for a product. Unknown or missing categories fall back to
 * {@link DEFAULT_CATEGORY} so a bad value degrades to the historical behaviour
 * rather than rendering a blank page.
 */
export function categoryOf(
  product: Readonly<{ category?: string }>,
): CategoryPresentation {
  const id = product.category ?? DEFAULT_CATEGORY;
  return BY_ID.get(id as CategoryId) ?? BY_ID.get(DEFAULT_CATEGORY)!;
}

export function categoryById(id: string): CategoryPresentation | undefined {
  return BY_ID.get(id as CategoryId);
}
