"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { products, sizes, colors } from "@/lib/products";

export default function ProductsPage() {
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [colorFilter, setColorFilter] = useState<string>("all");

  const filtered = products.filter((p) => {
    if (sizeFilter !== "all" && p.size !== sizeFilter) return false;
    if (colorFilter !== "all" && p.color !== colorFilter) return false;
    return true;
  });

  const clearFilters = () => {
    setSizeFilter("all");
    setColorFilter("all");
  };

  const hasFilters = sizeFilter !== "all" || colorFilter !== "all";

  return (
    <>
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-4">
            Shop
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            All Drumsticks
          </h1>
          <p className="text-lg text-muted max-w-2xl">
            Premium American Hickory drumsticks. R150 per pair. Available in
            4 sizes and 3 finishes.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-10">
            <span className="text-sm font-medium text-muted mr-1">Size:</span>
            <button
              onClick={() => setSizeFilter("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                sizeFilter === "all"
                  ? "bg-foreground text-white"
                  : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              All
            </button>
            {sizes.map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilter(s)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sizeFilter === s
                    ? "bg-foreground text-white"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}

            <span className="text-sm font-medium text-muted ml-4 mr-1">
              Color:
            </span>
            <button
              onClick={() => setColorFilter("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                colorFilter === "all"
                  ? "bg-foreground text-white"
                  : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              All
            </button>
            {colors.map((c) => (
              <button
                key={c}
                onClick={() => setColorFilter(c)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  colorFilter === c
                    ? "bg-foreground text-white"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}

            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-muted hover:text-foreground transition-colors ml-2"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {filtered.map((product) => (
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
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <span className="bg-white/90 backdrop-blur-sm text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full">
                      {product.size}
                    </span>
                    <span className="bg-white/90 backdrop-blur-sm text-[10px] sm:text-xs font-medium px-2.5 py-1 rounded-full text-muted">
                      {product.color}
                    </span>
                  </div>
                </div>
                <h3 className="font-semibold text-sm sm:text-base">
                  {product.name}
                </h3>
                <p className="text-sm text-muted">R{product.price}</p>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-muted mb-4">
                No products match your filters.
              </p>
              <button
                onClick={clearFilters}
                className="text-sm font-medium text-accent hover:text-accent-dark transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Brick Deal */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-2xl font-bold mb-2">
            Brick Deal — 12 Pairs for R1,600
          </h2>
          <p className="text-muted mb-6">
            Save R200 when you buy a full brick. Mix and match sizes and colors.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Order a Brick
          </Link>
        </div>
      </section>
    </>
  );
}
