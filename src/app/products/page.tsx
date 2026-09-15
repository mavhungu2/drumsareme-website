"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { products, specValues, type Product } from "@/lib/products";
import {
  CATEGORIES,
  categoryById,
  categoryOf,
  isCategoryId,
  type CategoryId,
  type SpecField,
} from "@/lib/product-categories";
import SpecPills from "@/components/product/SpecPills";
import { useLiveProducts, useLiveOverlay, useStock } from "@/lib/use-live-products";
import { useCart } from "@/lib/cart-context";

const LOW_STOCK_THRESHOLD = 12;

/** Sentinel for "no filter applied" — never a real category or spec value. */
const ALL = "all";

type CategorySelection = CategoryId | typeof ALL;

/** Spec fields left out are simply unfiltered. */
type SpecSelection = Partial<Record<SpecField, string>>;

const SPEC_LABELS: Record<SpecField, string> = {
  size: "Size",
  color: "Color",
};

const CATEGORY_NOUNS = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
}).format(CATEGORIES.map((c) => c.pluralNoun));

const ALL_BLURB = `Browse the full range: ${CATEGORY_NOUNS}, delivered nationwide across South Africa.`;

const unique = <T,>(values: ReadonlyArray<T>): T[] => Array.from(new Set(values));

function StockBadge({ productId }: { productId: string }) {
  const stock = useStock(productId);
  if (stock === undefined) return null;
  if (stock <= 0) {
    return (
      <span className="text-xs font-medium text-red-700">Sold out</span>
    );
  }
  if (stock < LOW_STOCK_THRESHOLD) {
    const className =
      stock <= 3
        ? "text-xs font-medium text-amber-700"
        : "text-xs text-muted";
    return <span className={className}>Only {stock} left</span>;
  }
  return null;
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: ReadonlyArray<FilterOption>;
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-muted mr-1">{label}:</span>
      {[{ value: ALL, label: "All" }, ...options].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-pressed={selected === option.value}
          className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
            selected === option.value
              ? "bg-foreground text-white"
              : "bg-surface text-muted hover:text-foreground"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function ProductsPage() {
  const { addItem, items: cartItems } = useCart();
  const [addedId, setAddedId] = useState<string | null>(null);
  const live = useLiveProducts(products);
  const overlay = useLiveOverlay();

  const quickAdd = (product: Product, soldOut: boolean, capReached: boolean) =>
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (soldOut || capReached) return;
      addItem(product, 1);
      setAddedId(product.id);
      setTimeout(() => {
        setAddedId((prev) => (prev === product.id ? null : prev));
      }, 1500);
    };
  const [category, setCategory] = useState<CategorySelection>(ALL);
  const [specs, setSpecs] = useState<SpecSelection>({});

  // Only the categories in view offer filters, so picking Audio Interfaces
  // drops the size/colour rows entirely and "All" offers the union.
  const scope =
    category === ALL ? CATEGORIES : CATEGORIES.filter((c) => c.id === category);

  const specFilters = unique(scope.flatMap((c) => c.filters)).map((field) => ({
    field,
    label: SPEC_LABELS[field],
    values: unique(
      scope.flatMap((c) =>
        c.filters.includes(field) ? specValues(field, c.id) : [],
      ),
    ),
  }));

  const filtered = live.filter((p) => {
    if (!p.inStock) return false;
    if (category !== ALL && categoryOf(p).id !== category) return false;
    return specFilters.every(
      ({ field }) => !specs[field] || p[field] === specs[field],
    );
  });

  const selectCategory = (value: string) => {
    setCategory(isCategoryId(value) ? value : ALL);
    // Spec values are category-scoped, so a stale pick would silently empty
    // the grid after switching.
    setSpecs({});
  };

  const selectSpec = (field: SpecField, value: string) => {
    setSpecs((prev) => ({
      ...prev,
      [field]: value === ALL ? undefined : value,
    }));
  };

  const clearFilters = () => {
    setCategory(ALL);
    setSpecs({});
  };

  const hasFilters = category !== ALL || Object.values(specs).some(Boolean);

  const active = category === ALL ? undefined : categoryById(category);

  return (
    <>
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-4">
            Shop
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {active ? active.label : "All Products"}
          </h1>
          <p className="text-lg text-muted max-w-2xl">
            {active ? active.blurb : ALL_BLURB}
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mb-10">
            <FilterGroup
              label="Category"
              selected={category}
              onSelect={selectCategory}
              options={CATEGORIES.map((c) => ({
                value: c.id,
                label: c.label,
              }))}
            />

            {specFilters.map(({ field, label, values }) => (
              <FilterGroup
                key={field}
                label={label}
                selected={specs[field] ?? ALL}
                onSelect={(value) => selectSpec(field, value)}
                options={values.map((value) => ({ value, label: value }))}
              />
            ))}

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filtered.map((product) => {
              const justAdded = addedId === product.id;
              const stock = overlay.get(product.id)?.stock;
              const soldOut = stock !== undefined && stock <= 0;
              const inCart =
                cartItems.find((i) => i.product.id === product.id)?.quantity ??
                0;
              const capReached = stock !== undefined && inCart >= stock;
              const disabled = soldOut || capReached;
              return (
                <Link
                  key={product.id}
                  href={`/products/${product.slug}`}
                  className="group"
                >
                  <div className="relative aspect-[3/4] bg-surface rounded-2xl overflow-hidden mb-4">
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <SpecPills
                      product={product}
                      className="absolute top-3 left-3 flex gap-1.5"
                      pillClassName="bg-white/90 backdrop-blur-sm text-[10px] sm:text-xs px-2.5 py-1 rounded-full"
                    />
                    <button
                      type="button"
                      onClick={quickAdd(product, soldOut, capReached)}
                      disabled={disabled}
                      aria-label={
                        soldOut
                          ? `${product.name} sold out`
                          : capReached
                            ? `${product.name} — all available stock in cart`
                            : `Add ${product.name} to cart`
                      }
                      className={`absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground motion-safe:opacity-0 motion-safe:translate-y-1 motion-safe:group-hover:opacity-100 motion-safe:group-hover:translate-y-0 motion-safe:group-focus-within:opacity-100 disabled:cursor-not-allowed ${
                        justAdded
                          ? "bg-green text-white"
                          : disabled
                            ? "bg-gray-300 text-gray-500"
                            : "bg-white text-foreground hover:bg-foreground hover:text-white"
                      }`}
                    >
                      {justAdded ? (
                        <Check size={16} aria-hidden />
                      ) : (
                        <ShoppingCart size={16} aria-hidden />
                      )}
                    </button>
                  </div>
                  <h3 className="font-semibold text-sm sm:text-base">
                    {product.name}
                  </h3>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted">R{product.price}</p>
                    <StockBadge productId={product.id} />
                  </div>
                </Link>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-muted mb-4">
                No products match your filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
