"use client";

import type { Metadata } from "next";
import Image from "next/image";
import { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

const galleryImages = [
  { src: "/images/gallery/20260110_165720.jpg", alt: "Keep Time drumsticks display" },
  { src: "/images/gallery/20260110_165835.jpg", alt: "Drumstick close-up" },
  { src: "/images/gallery/20260110_165902.jpg", alt: "Drumstick collection" },
  { src: "/images/gallery/20260110_165943.jpg", alt: "Keep Time Studio packaging" },
  { src: "/images/gallery/20260110_170024.jpg", alt: "5B Natural drumsticks" },
  { src: "/images/gallery/20260110_170109.jpg", alt: "Drumstick detail shot" },
  { src: "/images/gallery/20260110_170118.jpg", alt: "Drumstick range" },
  { src: "/images/gallery/20260110_170154.jpg", alt: "Drumstick styling" },
  { src: "/images/gallery/20260110_170156.jpg", alt: "Drumsticks on display" },
  { src: "/images/gallery/20260110_170225.jpg", alt: "Product photography" },
  { src: "/images/gallery/20260110_170229.jpg", alt: "Drumstick showcase" },
  { src: "/images/gallery/20260110_170247.jpg", alt: "Keep Time drumstick pair" },
  { src: "/images/gallery/20260110_170314.jpg", alt: "Drumstick close shot" },
  { src: "/images/gallery/20260110_170336.jpg", alt: "Wood tip detail" },
  { src: "/images/gallery/20260110_170349.jpg", alt: "5A Natural drumsticks" },
  { src: "/images/gallery/20260110_170351.jpg", alt: "Drumstick branding" },
  { src: "/images/gallery/20260110_170406.jpg", alt: "Pink drumsticks" },
  { src: "/images/gallery/20260110_170420.jpg", alt: "Multiple colors" },
  { src: "/images/gallery/20260110_170429.jpg", alt: "Drumstick spread" },
  { src: "/images/gallery/20260110_170432.jpg", alt: "Black drumsticks" },
  { src: "/images/gallery/20260110_170444.jpg", alt: "Extended reach sticks" },
  { src: "/images/gallery/20260110_170446.jpg", alt: "Full product line" },
  { src: "/images/gallery/20260213_112428.jpg", alt: "Latest drumstick photo" },
  { src: "/images/gallery/20260213_112437.jpg", alt: "Drumstick detail" },
];

export default function GalleryPage() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goNext = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % galleryImages.length);
  };

  const goPrev = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex(
      (lightboxIndex - 1 + galleryImages.length) % galleryImages.length
    );
  };

  return (
    <>
      <section className="bg-surface border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <p className="text-sm font-semibold text-accent uppercase tracking-widest mb-4">
            Gallery
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            Behind the Sticks
          </h1>
          <p className="text-lg text-muted max-w-2xl">
            Product shots, behind-the-scenes, and the craft that goes into every
            pair of Keep Time Studio drumsticks.
          </p>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="columns-2 md:columns-3 lg:columns-4 gap-3 sm:gap-4">
            {galleryImages.map((img, i) => (
              <button
                key={img.src}
                onClick={() => openLightbox(i)}
                className="block mb-3 sm:mb-4 break-inside-avoid w-full group cursor-pointer"
              >
                <div className="relative overflow-hidden rounded-xl bg-surface">
                  <Image
                    src={img.src}
                    alt={img.alt}
                    width={600}
                    height={800}
                    className="w-full h-auto group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center animate-fade-in"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 z-10"
            aria-label="Close"
          >
            <X size={28} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-4 text-white/80 hover:text-white p-2 z-10"
            aria-label="Previous"
          >
            <ChevronLeft size={32} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-4 text-white/80 hover:text-white p-2 z-10"
            aria-label="Next"
          >
            <ChevronRight size={32} />
          </button>

          <div
            className="relative max-w-5xl max-h-[85vh] w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={galleryImages[lightboxIndex].src}
              alt={galleryImages[lightboxIndex].alt}
              width={1920}
              height={1440}
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg"
            />
            <p className="text-center text-white/60 text-sm mt-4">
              {lightboxIndex + 1} / {galleryImages.length}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
