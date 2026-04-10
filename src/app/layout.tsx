import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { CartProvider } from "@/lib/cart-context";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "#DrumsAreMe | Premium Drumsticks - South Africa",
    template: "%s | #DrumsAreMe",
  },
  description:
    "Premium American Hickory drumsticks by Keep Time Studio. Available in 5A, 5B, EX5A, EX5B sizes. Natural, Black, and Pink finishes. R150 per pair. South Africa.",
  keywords: [
    "drumsticks",
    "drums",
    "South Africa",
    "Keep Time Studio",
    "American Hickory",
    "5A",
    "5B",
    "drumsticks sale",
  ],
  openGraph: {
    title: "#DrumsAreMe | Premium Drumsticks",
    description: "Good Wood Perfected. Premium American Hickory drumsticks from South Africa.",
    type: "website",
    locale: "en_ZA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
