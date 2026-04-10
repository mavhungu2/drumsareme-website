import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { blogPosts, getBlogPost } from "@/lib/blog";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  if (!post) notFound();

  const paragraphs = post.content.split("\n\n");

  return (
    <>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Blog
        </Link>
      </div>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <header className="mb-10">
          <div className="flex items-center gap-2 text-xs text-muted mb-4">
            <span className="bg-surface text-xs font-semibold px-2.5 py-1 rounded-full">
              {post.category}
            </span>
            <span>·</span>
            <time>
              {new Date(post.date).toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.15] mb-6">
            {post.title}
          </h1>
          <p className="text-lg text-muted leading-relaxed">{post.excerpt}</p>
        </header>

        <div className="relative aspect-[16/9] bg-surface rounded-2xl overflow-hidden mb-12">
          <Image
            src={post.image}
            alt={post.title}
            fill
            className="object-cover"
            priority
          />
        </div>

        <div className="prose prose-lg max-w-none">
          {paragraphs.map((p, i) => {
            if (p.startsWith("## ")) {
              return (
                <h2
                  key={i}
                  className="text-2xl font-bold mt-10 mb-4 tracking-tight"
                >
                  {p.replace("## ", "")}
                </h2>
              );
            }
            if (p.startsWith("**") && p.endsWith("**")) {
              return (
                <p key={i} className="font-semibold text-foreground mb-4">
                  {p.replace(/\*\*/g, "")}
                </p>
              );
            }
            if (p.startsWith("**")) {
              const parts = p.split("**");
              return (
                <p key={i} className="text-muted leading-relaxed mb-4">
                  {parts.map((part, j) =>
                    j % 2 === 1 ? (
                      <strong key={j} className="text-foreground font-semibold">
                        {part}
                      </strong>
                    ) : (
                      <span key={j}>{part}</span>
                    )
                  )}
                </p>
              );
            }
            if (p.startsWith("- ")) {
              const items = p.split("\n").filter((l) => l.startsWith("- "));
              return (
                <ul key={i} className="list-disc pl-6 space-y-1 mb-4 text-muted">
                  {items.map((item, j) => (
                    <li key={j}>{item.replace("- ", "")}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={i} className="text-muted leading-relaxed mb-4">
                {p}
              </p>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 border border-border rounded-2xl p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Ready to try our sticks?</h3>
          <p className="text-muted mb-6">
            Premium American Hickory, R150 per pair.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 bg-foreground text-white px-8 py-3.5 rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors"
          >
            Shop Now
            <ArrowRight size={16} />
          </Link>
        </div>
      </article>
    </>
  );
}
