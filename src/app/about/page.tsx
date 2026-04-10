import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description:
    "The story behind #DrumsAreMe and Keep Time Studio. Premium American Hickory drumsticks from South Africa.",
};

const values = [
  {
    title: "Quality First",
    description:
      "Every pair is crafted from premium American Hickory — selected for consistent grain, weight, and response. No shortcuts.",
  },
  {
    title: "Affordable Excellence",
    description:
      "We believe every drummer deserves great sticks. At R150 a pair, there's no reason to settle for less.",
  },
  {
    title: "Built for South Africa",
    description:
      "Made for our drummers — from church worship teams to metal bands, from drum schools to jazz combos.",
  },
  {
    title: "Community Driven",
    description:
      "We're drummers too. #DrumsAreMe is more than a brand — it's a community of people who live and breathe rhythm.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-4">
              Our Story
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              We live and breathe drums.
            </h1>
            <p className="text-lg text-muted leading-relaxed max-w-2xl">
              #DrumsAreMe started with a simple belief: South African drummers
              deserve premium sticks at a price that doesn&apos;t break the bank.
              Every pair of Keep Time Studio sticks is built on that promise.
            </p>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">
            <div className="relative aspect-square rounded-2xl overflow-hidden bg-surface">
              <Image
                src="/images/gallery/20260110_165835.jpg"
                alt="Keep Time Studio drumsticks"
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
                Good Wood, Perfected
              </h2>
              <div className="space-y-4 text-muted leading-relaxed">
                <p>
                  It all started behind the kit. As working drummers, we were
                  tired of the trade-off: pay a fortune for quality sticks, or
                  settle for cheap ones that splinter after a few sessions.
                </p>
                <p>
                  We set out to change that. Keep Time Studio drumsticks are
                  crafted from hand-selected American Hickory — the gold standard
                  in drumstick wood. Each pair is precision-turned for consistent
                  weight, balance, and response.
                </p>
                <p>
                  Available in 5A, 5B, EX5A, and EX5B sizes, with Natural, Black,
                  and Pink finishes — there&apos;s a stick for every player and every
                  style. And at R150 a pair, you can stock up without guilt.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="bg-foreground text-white py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-2">
              What We Stand For
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Our Values
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 gap-8">
            {values.map((v) => (
              <div key={v.title} className="border-l-2 border-accent pl-6">
                <h3 className="text-lg font-semibold mb-2">{v.title}</h3>
                <p className="text-gray-400 leading-relaxed">
                  {v.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Teaser */}
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {[
              "/images/gallery/20260110_170024.jpg",
              "/images/gallery/20260110_170109.jpg",
              "/images/gallery/20260213_112428.jpg",
              "/images/gallery/20260110_170229.jpg",
            ].map((src, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-xl overflow-hidden bg-surface"
              >
                <Image
                  src={src}
                  alt="DrumsAreMe gallery"
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link
              href="/gallery"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-foreground transition-colors"
            >
              View Full Gallery
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Want to stock our sticks?
          </h2>
          <p className="text-muted max-w-md mx-auto mb-8">
            We work with drum shops, music schools, and churches across South
            Africa. Get in touch for wholesale pricing.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Contact Us
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
