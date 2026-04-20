"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, LogOut, ShoppingBag, User as UserIcon } from "lucide-react";
import { useAdminAuth } from "@/lib/admin/auth-context";
import SignInGate from "./SignInGate";

interface NavItem {
  href: string;
  label: string;
  icon: typeof ShoppingBag;
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    href: "/admin/orders/",
    label: "Orders",
    icon: ShoppingBag,
    match: (pathname) => pathname.startsWith("/admin/orders"),
  },
];

function LoadingState() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex items-center gap-3 text-muted">
        <Loader2 size={18} className="animate-spin" aria-hidden />
        <span className="text-sm">Loading admin…</span>
      </div>
    </div>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAdminAuth();
  const pathname = usePathname() ?? "";
  const [signingOut, setSigningOut] = useState(false);

  if (loading) return <LoadingState />;
  if (!user) return <SignInGate />;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const displayName = user.displayName ?? user.email ?? "Admin";

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col bg-surface border-r border-border">
        <div className="h-16 px-6 flex items-center border-b border-border">
          <span className="font-semibold tracking-tight text-foreground">
            Admin
          </span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-foreground text-white"
                    : "text-muted hover:text-foreground hover:bg-background"
                }`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={16} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted">
            <UserIcon size={14} aria-hidden />
            <span className="truncate" title={displayName}>
              {displayName}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-background transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <LogOut size={14} aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden h-14 px-4 flex items-center justify-between border-b border-border bg-surface">
          <span className="font-semibold tracking-tight text-foreground">
            Admin
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors disabled:opacity-60"
          >
            <LogOut size={14} aria-hidden />
            {signingOut ? "…" : "Sign out"}
          </button>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
