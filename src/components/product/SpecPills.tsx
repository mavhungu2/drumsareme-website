import { categoryOf, type SpecField } from "@/lib/product-categories";

/**
 * Anything carrying the spec fields plus its category. Structural so both the
 * storefront `Product` and the admin `ProductListItem` satisfy it without
 * either module depending on the other.
 */
export type SpecSource = Readonly<Record<SpecField, string>> & {
  readonly category?: string;
};

/**
 * The spec fields a product actually has something to show for: its category's
 * declared pills, minus any the product leaves blank. Single source of truth
 * for "which specs does this product display" — storefront cards, the product
 * page and the admin table all read it.
 */
export function specFieldsOf(product: SpecSource): ReadonlyArray<SpecField> {
  return categoryOf(product).specPills.filter((field) => product[field]);
}

interface SpecPillsProps {
  product: SpecSource;
  /** Classes for the pill row. */
  className: string;
  /** Classes shared by every pill; weight and tone are added per position. */
  pillClassName: string;
}

/**
 * Renders a product's spec pills, or nothing at all when its category declares
 * none (an audio interface has no meaningful size or colour).
 */
export default function SpecPills({
  product,
  className,
  pillClassName,
}: SpecPillsProps) {
  const fields = specFieldsOf(product);
  if (fields.length === 0) return null;

  return (
    <div className={className}>
      {fields.map((field, index) => (
        <span
          key={field}
          className={`${pillClassName} ${
            index === 0 ? "font-semibold" : "font-medium text-muted"
          }`}
        >
          {product[field]}
        </span>
      ))}
    </div>
  );
}
