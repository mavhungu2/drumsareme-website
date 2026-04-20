"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "@/lib/firebase-client";

interface AdminAuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

const AdminAuthContext = createContext<AdminAuthState | undefined>(undefined);

function readError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected authentication error";
}

interface AuthSnapshot {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => AuthSnapshot;
  getAuth: () => Auth | null;
  clearError: () => void;
  setError: (message: string) => void;
}

function createAuthStore(): AuthStore {
  let auth: Auth | null = null;
  let initError: string | null = null;
  try {
    auth = getFirebaseAuth();
  } catch (err) {
    initError = readError(err);
  }

  let snapshot: AuthSnapshot = {
    user: null,
    loading: auth !== null,
    error: initError,
  };

  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const update = (next: Partial<AuthSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    emit();
  };

  let unsubscribers: Array<() => void> = [];
  let refCount = 0;

  const activate = () => {
    if (!auth || unsubscribers.length > 0) return;
    const offAuth = onAuthStateChanged(
      auth,
      (user) => update({ user, loading: false }),
      (err) => update({ error: readError(err), loading: false }),
    );
    const offToken = onIdTokenChanged(auth, (user) => {
      if (snapshot.user && user && user.uid === snapshot.user.uid) {
        update({ user });
      }
    });
    unsubscribers = [offAuth, offToken];
  };

  const deactivate = () => {
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      refCount += 1;
      if (refCount === 1) activate();
      return () => {
        listeners.delete(listener);
        refCount -= 1;
        if (refCount === 0) deactivate();
      };
    },
    getSnapshot: () => snapshot,
    getAuth: () => auth,
    clearError: () => update({ error: initError }),
    setError: (message) => update({ error: message }),
  };
}

const EMPTY_SNAPSHOT: AuthSnapshot = { user: null, loading: false, error: null };
let storeSingleton: AuthStore | null = null;

function ensureStore(): AuthStore {
  if (typeof window === "undefined") {
    // SSR/prerender — return an inert store; real initialization happens on
    // the client after hydration.
    return {
      subscribe: () => () => {},
      getSnapshot: () => EMPTY_SNAPSHOT,
      getAuth: () => null,
      clearError: () => {},
      setError: () => {},
    };
  }
  if (!storeSingleton) storeSingleton = createAuthStore();
  return storeSingleton;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const store = ensureStore();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );

  const signIn = useCallback(async () => {
    store.clearError();
    try {
      const auth = store.getAuth() ?? getFirebaseAuth();
      await signInWithPopup(auth, getGoogleProvider());
    } catch (err) {
      store.setError(readError(err));
      throw err;
    }
  }, [store]);

  const signOut = useCallback(async () => {
    store.clearError();
    try {
      const auth = store.getAuth() ?? getFirebaseAuth();
      await firebaseSignOut(auth);
    } catch (err) {
      store.setError(readError(err));
      throw err;
    }
  }, [store]);

  const getIdToken = useCallback(
    async (forceRefresh = false) => {
      const current = store.getAuth()?.currentUser ?? null;
      if (!current) return null;
      return current.getIdToken(forceRefresh);
    },
    [store],
  );

  const value = useMemo<AdminAuthState>(
    () => ({
      user: snapshot.user,
      loading: snapshot.loading,
      error: snapshot.error,
      signIn,
      signOut,
      getIdToken,
    }),
    [snapshot, signIn, signOut, getIdToken],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthState {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return ctx;
}
