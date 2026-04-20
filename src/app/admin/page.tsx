"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/orders/");
  }, [router]);

  return (
    <div className="px-4 py-16 text-center text-sm text-muted">
      <p>Redirecting to orders…</p>
      <Link
        href="/admin/orders/"
        className="inline-block mt-3 text-foreground underline hover:text-accent-dark"
      >
        Open orders
      </Link>
    </div>
  );
}
