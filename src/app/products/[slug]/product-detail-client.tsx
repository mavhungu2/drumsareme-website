"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { ArrowLeft, Minus, Plus, ShoppingCart, Check } from "lucide-react";
import { products, getProduct, type Product } from "@/lib/products";
import {
  useLiveOverlay,
  useLiveProduct,
  useStock,
} from "@/lib/use-live-products";
import { useCart } from "@/lib/cart-context";

const LOW_STOCK_THRESHOLD = 12;

function StockBadge({ productId }: { productId: string }) {
  const stock = useStock(productId);
  if (stock === undefined) return null;
  if (stock <= 0) {
    return <span className="text-xs font-medium text-red-700">Sold out</span>;
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

export default function ProductDetailClient({ slug }: { slug: string }) {
  const baked = getProduct(slug);
  const product = useLiveProduct(baked ?? products[0]);
  const stock = useStock(baked?.id ?? "");
  const { addItem, items: cartItems } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [quickAddedId, setQuickAddedId] = useState<string | null>(null);
  const soldOut = stock !== undefined && stock <= 0;
  const inCart =
    cartItems.find((i) => i.product.id === baked?.id)?.quantity ?? 0;
  const remaining =
    stock === undefined ? undefined : Math.max(0, stock - inCart);
  const maxAddable = remaining ?? Number.POSITIVE_INFINITY;

  const overlay = useLiveOverlay();

  const quickAdd =
    (item: Product, soldOutNow: boolean, capReachedNow: boolean) =>
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (soldOutNow || capReachedNow) return;
      addItem(item, 1);
      setQuickAddedId(item.id);
      setTimeout(() => {
        setQuickAddedId((prev) => (prev === item.id ? null : prev));
      }, 1500);
    };

  if (!baked) {
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
    if (soldOut || maxAddable <= 0) return;
    const safeQty = Math.min(quantity, maxAddable);
    addItem(product, safeQty);
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
          <div className="relative aspect-[3/4] bg-surface rounded-2xl overflow-hidden">
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover"
              priority
            />
          </div>

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

            <div className="flex items-baseline gap-3 mb-2">
              <span className="text-2xl font-bold">R{product.price}</span>
              <span className="text-sm text-muted">per pair</span>
            </div>
            <div className="mb-6">
              {stock === undefined ? null : stock <= 0 ? (
                <span className="text-sm font-medium text-red-700">
                  Sold out
                </span>
              ) : stock < LOW_STOCK_THRESHOLD ? (
                <span
                  className={
                    stock <= 3
                      ? "text-sm font-medium text-amber-700"
                      : "text-sm text-muted"
                  }
                >
                  Only {stock} left in stock
                </span>
              ) : null}
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
                  onClick={() =>
                    setQuantity((q) => Math.min(q + 1, maxAddable || 1))
                  }
                  disabled={quantity >= maxAddable}
                  className="p-3 text-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  aria-label="Increase quantity"
                >
                  <Plus size={16} />
                </button>
              </div>

              <button
                onClick={handleAdd}
                disabled={added || soldOut}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  added
                    ? "bg-green text-white"
                    : "bg-foreground text-white hover:bg-gray-800"
                }`}
              >
                {soldOut ? (
                  "Sold out"
                ) : added ? (
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
          </div>
        </div>

        {sameSize.length > 0 && (
          <div className="mt-20">
            <h2 className="text-xl font-bold mb-6">
              Also available in {product.size}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
              {sameSize.map((p) => {
                const justAdded = quickAddedId === p.id;
                const pStock = overlay.get(p.id)?.stock;
                const pSoldOut = pStock !== undefined && pStock <= 0;
                const pInCart =
                  cartItems.find((i) => i.product.id === p.id)?.quantity ?? 0;
                const pCapReached = pStock !== undefined && pInCart >= pStock;
                const pDisabled = pSoldOut || pCapReached;
                return (
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
                      <button
                        type="button"
                        onClick={quickAdd(p, pSoldOut, pCapReached)}
                        disabled={pDisabled}
                        aria-label={
                          pSoldOut
                            ? `${p.name} sold out`
                            : pCapReached
                              ? `${p.name} — all available stock in cart`
                              : `Add ${p.name} to cart`
                        }
                        className={`absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground motion-safe:opacity-0 motion-safe:translate-y-1 motion-safe:group-hover:opacity-100 motion-safe:group-hover:translate-y-0 motion-safe:group-focus-within:opacity-100 disabled:cursor-not-allowed ${
                          justAdded
                            ? "bg-green text-white"
                            : pDisabled
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
                    <h3 className="font-medium text-sm">{p.name}</h3>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted">R{p.price}</p>
                      <StockBadge productId={p.id} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
