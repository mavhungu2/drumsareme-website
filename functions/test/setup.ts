// Must be set before any firebase-admin import so the SDK points at the emulator.
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.GCLOUD_PROJECT = "demo-drumsareme";

import { initializeApp, getApps } from "firebase-admin/app";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-drumsareme" });
}
