"use client";

import type { ReactNode } from "react";
import { AdminAuthProvider } from "@/lib/admin/auth-context";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminAuthProvider>
      <AdminShell>{children}</AdminShell>
    </AdminAuthProvider>
  );
}
