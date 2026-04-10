import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Star, Truck, Shield, Package } from "lucide-react";

const featuredProducts = [
  {
    name: "5A Natural",
    slug: "5a-natural",
    image: "/images/gallery/20260110_170349.jpg",
    tag: "Best Seller",
  },
  {
    name: "5A Black",
    slug: "5a-black",
    image: "/images/gallery/20260110_170351.jpg",
    tag: "Popular",
  },
  {
    name: "5A Pink",
    slug: "5a-pink",
    image: "/images/gallery/20260110_170406.jpg",
    tag: "New",
  },
  {
    name: "5B Natural",
    slug: "5b-natural",
    image: "/images/gallery/20260110_170024.jpg",
    tag: "Power",
  },
];

const testimonials = [
  {
    name: "Thabo M.",
    text: "Best sticks I've played with. The balance is perfect and they last way longer than other brands in this price range.",
    rating: 5,
  },
  {
    name: "Sarah K.",
    text: "Love the pink 5As! They look amazing on stage and the feel is just as good as any premium stick.",
    rating: 5,
  },
  {
    name: "James R.",
    text: "Switched my whole drum school to Keep Time. Great quality at an unbeatable price. The brick deal is incredible value.",
    rating: 5,
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-foreground text-white overflow-hidden">
        <div className="absolute inset-0 opacity-40">
          <Image
            src="/images/products/featured-drumsticks.jpg"
            alt=""
            fill
            className="object-cover"
            priority
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 sm:py-40">
          <div className="max-w-2xl">
            <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-4">
              Keep Time Studio
            </p>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
              Good Wood,
              <br />
              <span className="text-accent">Perfected.</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-300 mb-10 max-w-lg leading-relaxed">
              Premium American Hickory drumsticks crafted for every drummer.
              From practice rooms to main stages.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/products"
                className="inline-flex items-center justify-center gap-2 bg-white text-foreground px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-100 transition-colors"
              >
                Shop Now
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center gap-2 border border-gray-600 text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Our Story
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {[
              { icon: Package, label: "R150 Per Pair" },
              { icon: Truck, label: "Nationwide Delivery" },
              { icon: Shield, label: "Quality Guaranteed" },
              { icon: Star, label: "5-Star Reviews" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 py-2">
                <Icon size={20} className="text-muted" />
                <span className="text-xs sm:text-sm font-medium text-muted">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-2">
                Our Sticks
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
                Featured Products
              </h2>
            </div>
            <Link
              href="/products"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              View All
              <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {featuredProducts.map((product) => (
              <Link
                key={product.slug}
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
                  <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full">
                    {product.tag}
                  </span>
                </div>
                <h3 className="font-semibold text-sm sm:text-base">
                  {product.name}
                </h3>
                <p className="text-sm text-muted">R150</p>
              </Link>
            ))}
          </div>

          <div className="sm:hidden mt-8 text-center">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              View All Products
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Brick Deal Banner */}
      <section className="bg-foreground text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <div className="flex-1">
              <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">
                Bulk Deal
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
                Brick Deal — 12 Pairs for R1,600
              </h2>
              <p className="text-gray-400 leading-relaxed mb-8 max-w-md">
                Stock up and save. Perfect for drum schools, worship teams,
                session drummers, and anyone who goes through sticks fast. That's
                just R133 per pair.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-accent text-foreground px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-accent-dark transition-colors"
              >
                Enquire Now
                <ArrowRight size={16} />
              </Link>
            </div>
            <div className="relative w-full md:w-80 aspect-[3/4] rounded-2xl overflow-hidden shrink-0">
              <Image
                src="/images/products/drumsticks-sale.png"
                alt="Brick Deal - 12 pairs for R1600"
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-2">
              Reviews
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              What Drummers Say
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="border border-border rounded-2xl p-6 sm:p-8"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className="fill-accent text-accent"
                    />
                  ))}
                </div>
                <p className="text-muted leading-relaxed mb-6">&ldquo;{t.text}&rdquo;</p>
                <p className="text-sm font-semibold">{t.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Ready to upgrade your sticks?
          </h2>
          <p className="text-muted max-w-md mx-auto mb-8">
            Join thousands of drummers across South Africa who trust Keep Time
            Studio sticks for every gig, session, and practice.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Shop All Sticks
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
