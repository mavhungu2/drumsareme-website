"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Minus, Plus, ShoppingCart, Check } from "lucide-react";
import { products, getProduct } from "@/lib/products";
import { useCart } from "@/lib/cart-context";

export default function ProductDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const product = getProduct(slug);
  const { addItem } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-2xl font-bold mb-4">Product Not Found</h1>
        <Link href="/products" className="text-accent hover:text-accent-dark">
          Back to Shop
        </Link>
      </div>
    );
  }

  const sameSize = products.filter(
    (p) => p.size === product.size && p.id !== product.id
  );

  const handleAdd = () => {
    addItem(product, quantity);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Shop
        </Link>
      </div>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
          {/* Image */}
          <div className="relative aspect-[3/4] bg-surface rounded-2xl overflow-hidden">
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover"
              priority
            />
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center">
            <div className="flex gap-2 mb-4">
              <span className="bg-surface text-xs font-semibold px-3 py-1 rounded-full">
                {product.size}
              </span>
              <span className="bg-surface text-xs font-medium px-3 py-1 rounded-full text-muted">
                {product.color}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
              {product.name}
            </h1>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-2xl font-bold">R{product.price}</span>
              <span className="text-sm text-muted">per pair</span>
            </div>

            <p className="text-muted leading-relaxed mb-8">
              {product.description}
            </p>

            <div className="mb-8">
              <h3 className="text-sm font-semibold mb-3">Features</h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-2 text-sm text-muted"
                  >
                    <Check size={14} className="text-green shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Quantity + Add to Cart */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center border border-border rounded-full">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-3 text-muted hover:text-foreground transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center text-sm font-medium">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-3 text-muted hover:text-foreground transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>

              <button
                onClick={handleAdd}
                disabled={added}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-sm font-semibold transition-colors ${
                  added
                    ? "bg-green text-white"
                    : "bg-foreground text-white hover:bg-gray-800"
                }`}
              >
                {added ? (
                  <>
                    <Check size={16} />
                    Added to Cart
                  </>
                ) : (
                  <>
                    <ShoppingCart size={16} />
                    Add to Cart — R{product.price * quantity}
                  </>
                )}
              </button>
            </div>

            {/* Brick Deal */}
            <div className="mt-8 border border-accent/20 bg-accent/5 rounded-xl p-5">
              <p className="text-sm font-semibold mb-1">
                Brick Deal — 12 pairs for R{product.brickPrice.toLocaleString()}
              </p>
              <p className="text-xs text-muted">
                Save R{product.price * product.brickQuantity - product.brickPrice} per brick.{" "}
                <Link
                  href="/contact"
                  className="text-accent hover:text-accent-dark font-medium"
                >
                  Enquire now
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Same Size, Different Colors */}
        {sameSize.length > 0 && (
          <div className="mt-20">
            <h2 className="text-xl font-bold mb-6">
              Also available in {product.size}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {sameSize.map((p) => (
                <Link
                  key={p.id}
                  href={`/products/${p.slug}`}
                  className="group"
                >
                  <div className="relative aspect-[3/4] bg-surface rounded-2xl overflow-hidden mb-3">
                    <Image
                      src={p.image}
                      alt={p.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <h3 className="font-medium text-sm">{p.name}</h3>
                  <p className="text-sm text-muted">R{p.price}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
