"use client";

import { useState } from "react";
import { LogIn, ShieldCheck } from "lucide-react";
import { useAdminAuth } from "@/lib/admin/auth-context";

export default function SignInGate() {
  const { signIn, error: contextError } = useAdminAuth();
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const error = localError ?? contextError;

  const handleSignIn = async () => {
    setLocalError(null);
    setSubmitting(true);
    try {
      await signIn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-sm p-8">
        <div className="w-12 h-12 rounded-full bg-accent/10 text-accent-dark flex items-center justify-center mb-5">
          <ShieldCheck size={22} aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Admin sign-in
        </h1>
        <p className="mt-2 text-sm text-muted leading-relaxed">
          Sign in with an authorised Google account to manage orders and
          admins. Unauthorised sign-ins will be rejected by the server.
        </p>
        <button
          type="button"
          onClick={handleSignIn}
          disabled={submitting}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-foreground text-white px-5 py-3 rounded-full text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <LogIn size={16} aria-hidden />
          {submitting ? "Signing in…" : "Sign in with Google"}
        </button>
        {error && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
