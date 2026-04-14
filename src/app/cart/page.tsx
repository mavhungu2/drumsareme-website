"use client";

import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight, Lock } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { SHIPPING_FLAT_ZAR } from "@/lib/products";

export default function CartPage() {
  const { items, updateQuantity, removeItem, clearCart, totalPrice } =
    useCart();
  const shipping = items.length > 0 ? SHIPPING_FLAT_ZAR : 0;
  const total = totalPrice + shipping;

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 text-center">
        <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center mx-auto mb-6">
          <ShoppingCart size={24} className="text-muted" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
        <p className="text-muted mb-8">
          Add some sticks to get started.
        </p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          Shop Now
          <ArrowRight size={16} />
        </Link>
      </div>
    );
  }

  return (
    <>
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Your Cart
          </h1>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-10 lg:gap-16">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <div
                  key={item.product.id}
                  className="flex gap-4 sm:gap-6 border border-border rounded-2xl p-4 sm:p-5"
                >
                  <Link
                    href={`/products/${item.product.slug}`}
                    className="relative w-20 h-24 sm:w-24 sm:h-32 bg-surface rounded-xl overflow-hidden shrink-0"
                  >
                    <Image
                      src={item.product.image}
                      alt={item.product.name}
                      fill
                      className="object-cover"
                    />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/products/${item.product.slug}`}
                          className="font-semibold text-sm sm:text-base hover:text-accent transition-colors"
                        >
                          {item.product.name}
                        </Link>
                        <p className="text-xs text-muted mt-0.5">
                          {item.product.size} · {item.product.color}
                        </p>
                      </div>
                      <button
                        onClick={() => removeItem(item.product.id)}
                        className="text-muted hover:text-red-500 transition-colors p-1"
                        aria-label="Remove item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center border border-border rounded-full">
                        <button
                          onClick={() =>
                            updateQuantity(
                              item.product.id,
                              item.quantity - 1
                            )
                          }
                          className="p-1.5 sm:p-2 text-muted hover:text-foreground transition-colors"
                          aria-label="Decrease"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="w-8 text-center text-xs font-medium">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(
                              item.product.id,
                              item.quantity + 1
                            )
                          }
                          className="p-1.5 sm:p-2 text-muted hover:text-foreground transition-colors"
                          aria-label="Increase"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <p className="font-semibold text-sm">
                        R{(item.product.price * item.quantity).toLocaleString("en-ZA")}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={clearCart}
                className="text-xs text-muted hover:text-red-500 transition-colors"
              >
                Clear cart
              </button>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="border border-border rounded-2xl p-6 sm:p-8 sticky top-28">
                <h2 className="text-lg font-bold mb-6">Order Summary</h2>

                <div className="space-y-3 mb-6">
                  {items.map((item) => (
                    <div
                      key={item.product.id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-muted truncate mr-4">
                        {item.product.name} &times; {item.quantity}
                      </span>
                      <span className="font-medium shrink-0">
                        R{(item.product.price * item.quantity).toLocaleString("en-ZA")}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-4 mb-6 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Subtotal</span>
                    <span>R{totalPrice.toLocaleString("en-ZA")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Shipping</span>
                    <span>R{shipping.toLocaleString("en-ZA")}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-border mt-2">
                    <span className="font-semibold">Total</span>
                    <span className="text-xl font-bold">
                      R{total.toLocaleString("en-ZA")}
                    </span>
                  </div>
                </div>

                <Link
                  href="/checkout"
                  className="w-full inline-flex items-center justify-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors mb-3"
                >
                  <Lock size={14} />
                  Checkout
                </Link>

                <Link
                  href="/products"
                  className="w-full inline-flex items-center justify-center gap-2 border border-border text-foreground px-8 py-3.5 rounded-full text-sm font-medium hover:bg-surface transition-colors"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
