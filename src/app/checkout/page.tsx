"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Lock } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { SHIPPING_FLAT_ZAR } from "@/lib/products";

const provinces = [
  { value: "GP", label: "Gauteng" },
  { value: "WC", label: "Western Cape" },
  { value: "KZN", label: "KwaZulu-Natal" },
  { value: "EC", label: "Eastern Cape" },
  { value: "FS", label: "Free State" },
  { value: "LP", label: "Limpopo" },
  { value: "MP", label: "Mpumalanga" },
  { value: "NW", label: "North West" },
  { value: "NC", label: "Northern Cape" },
];

interface Customer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
  notes: string;
}

const emptyCustomer: Customer = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  suburb: "",
  city: "",
  province: "GP",
  postalCode: "",
  notes: "",
};

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-foreground/10 focus:border-foreground";

export default function CheckoutPage() {
  const { items, totalPrice } = useCart();
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = totalPrice;
  const shipping = items.length > 0 ? SHIPPING_FLAT_ZAR : 0;
  const total = subtotal + shipping;

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 text-center">
        <h1 className="text-2xl font-bold mb-2">Your cart is empty</h1>
        <p className="text-muted mb-8">Add some sticks before checking out.</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          Shop Now
        </Link>
      </div>
    );
  }

  const update = (key: keyof Customer) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => setCustomer((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ id: i.product.id, qty: i.quantity })),
          customer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Cart
        </Link>
      </div>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8">
          Checkout
        </h1>

        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-10 lg:gap-16">
          <div className="lg:col-span-2 space-y-8">
            <fieldset className="space-y-4">
              <legend className="text-lg font-bold mb-4">Contact</legend>
              <div className="grid sm:grid-cols-2 gap-4">
                <input
                  className={inputClass}
                  placeholder="First name"
                  required
                  value={customer.firstName}
                  onChange={update("firstName")}
                />
                <input
                  className={inputClass}
                  placeholder="Last name"
                  required
                  value={customer.lastName}
                  onChange={update("lastName")}
                />
              </div>
              <input
                className={inputClass}
                type="email"
                placeholder="Email"
                required
                value={customer.email}
                onChange={update("email")}
              />
              <input
                className={inputClass}
                type="tel"
                placeholder="Phone (e.g. 082 123 4567)"
                required
                value={customer.phone}
                onChange={update("phone")}
              />
            </fieldset>

            <fieldset className="space-y-4">
              <legend className="text-lg font-bold mb-4">Delivery address</legend>
              <input
                className={inputClass}
                placeholder="Street address"
                required
                value={customer.addressLine1}
                onChange={update("addressLine1")}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <input
                  className={inputClass}
                  placeholder="Suburb (optional)"
                  value={customer.suburb}
                  onChange={update("suburb")}
                />
                <input
                  className={inputClass}
                  placeholder="City"
                  required
                  value={customer.city}
                  onChange={update("city")}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <select
                  className={inputClass}
                  required
                  value={customer.province}
                  onChange={update("province")}
                >
                  {provinces.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClass}
                  placeholder="Postal code"
                  required
                  value={customer.postalCode}
                  onChange={update("postalCode")}
                />
              </div>
              <textarea
                className={inputClass}
                placeholder="Delivery notes (optional)"
                rows={3}
                value={customer.notes}
                onChange={update("notes")}
              />
            </fieldset>
          </div>

          <div className="lg:col-span-1">
            <div className="border border-border rounded-2xl p-6 sm:p-8 sticky top-28">
              <h2 className="text-lg font-bold mb-6">Order Summary</h2>

              <div className="space-y-4 mb-6">
                {items.map((item) => (
                  <div key={item.product.id} className="flex gap-3">
                    <div className="relative w-14 h-14 bg-surface rounded-lg overflow-hidden shrink-0">
                      <Image
                        src={item.product.image}
                        alt={item.product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <p className="font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-muted">Qty {item.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold shrink-0">
                      R{(item.product.price * item.quantity).toLocaleString("en-ZA")}
                    </p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span>R{subtotal.toLocaleString("en-ZA")}</span>
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

              {error && (
                <p className="mt-4 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-6 inline-flex items-center justify-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <Lock size={14} />
                {submitting ? "Redirecting…" : `Pay R${total.toLocaleString("en-ZA")}`}
              </button>
              <p className="mt-3 text-center text-xs text-muted">
                Secure payment by Yoco
              </p>
            </div>
          </div>
        </form>
      </section>
    </>
  );
}
