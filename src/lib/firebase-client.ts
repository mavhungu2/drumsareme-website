import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { GoogleAuthProvider, getAuth, type Auth } from "firebase/auth";

interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function readConfig(): FirebaseClientConfig {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => `NEXT_PUBLIC_FIREBASE_${camelToSnake(key).toUpperCase()}`);

  if (missing.length > 0) {
    throw new Error(
      `Firebase client config is missing: ${missing.join(", ")}. ` +
        "Copy .env.local.example to .env.local and fill in the Firebase Web config.",
    );
  }

  return config as FirebaseClientConfig;
}

function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function getOrCreateApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(readConfig());
}

/**
 * Lazy accessor for the Firebase Auth instance. Initializing lazily avoids
 * crashing the static-export build when `NEXT_PUBLIC_FIREBASE_*` vars are
 * unset — the error only surfaces at runtime when the admin UI actually
 * attempts to authenticate.
 */
export function getFirebaseAuth(): Auth {
  return getAuth(getOrCreateApp());
}

export function getGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

export const ADMIN_API_BASE = process.env.NEXT_PUBLIC_ADMIN_API_BASE ?? "";
