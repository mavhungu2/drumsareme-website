/**
 * Helpers for the canonical `customers/{customerId}` collection.
 *
 * Two normalized lookup fields are stored on every record:
 *   - emailLower: lowercased trimmed email, used for case-insensitive matching
 *   - phoneDigits: digits-only phone, used to match despite formatting variance
 *
 * `findOrCreateCustomer` is the primary entry point used by all order-creating
 * surfaces (manual sales, Yoco checkout). It is intentionally NOT transactional
 * because Firestore queries cannot run inside a transaction; the resulting
 * race window (two simultaneous first-time orders from the same new customer
 * creating two docs) is rare for a small shop and reconcilable by re-running
 * the normalize-customers migration script.
 */
import { db, FieldValue, type CustomerRecord } from "./firestore";

export interface CustomerSnapshot {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  addressLine1?: string;
  suburb?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

export function normalizeEmailLower(email: string | undefined | null): string {
  return (email ?? "").trim().toLowerCase();
}

export function normalizePhoneDigits(
  phone: string | undefined | null,
): string {
  return (phone ?? "").replace(/\D+/g, "");
}

export function buildDefaultAddress(
  snapshot: CustomerSnapshot,
): CustomerRecord["defaultAddress"] | undefined {
  const fields: NonNullable<CustomerRecord["defaultAddress"]> = {};
  if (snapshot.addressLine1) fields.addressLine1 = snapshot.addressLine1;
  if (snapshot.suburb) fields.suburb = snapshot.suburb;
  if (snapshot.city) fields.city = snapshot.city;
  if (snapshot.province) fields.province = snapshot.province;
  if (snapshot.postalCode) fields.postalCode = snapshot.postalCode;
  return Object.keys(fields).length === 0 ? undefined : fields;
}

async function lookupByEmail(
  emailLower: string,
): Promise<string | undefined> {
  if (!emailLower) return undefined;
  const snap = await db
    .collection("customers")
    .where("emailLower", "==", emailLower)
    .limit(1)
    .get();
  return snap.docs[0]?.id;
}

async function lookupByPhone(
  phoneDigits: string,
): Promise<string | undefined> {
  if (!phoneDigits) return undefined;
  const snap = await db
    .collection("customers")
    .where("phoneDigits", "==", phoneDigits)
    .limit(1)
    .get();
  return snap.docs[0]?.id;
}

/**
 * Resolves a customer for an incoming order. Returns the matching customer's
 * id when found (by email or phone), otherwise creates a new customer doc
 * and returns its id.
 *
 * On match, identity fields (name / email / phone) are NOT overwritten — the
 * admin's curated values stay authoritative. The customer's `defaultAddress`
 * IS refreshed when the new snapshot includes a delivery address, since
 * that's the most recently observed shipping target.
 */
export async function findOrCreateCustomer(
  snapshot: CustomerSnapshot,
): Promise<string> {
  const emailLower = normalizeEmailLower(snapshot.email);
  const phoneDigits = normalizePhoneDigits(snapshot.phone);

  const existing =
    (await lookupByEmail(emailLower)) ?? (await lookupByPhone(phoneDigits));

  const address = buildDefaultAddress(snapshot);

  if (existing) {
    // Refresh updatedAt + defaultAddress if we have one. Leave identity alone.
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (address) updates.defaultAddress = address;
    await db.doc(`customers/${existing}`).set(updates, { merge: true });
    return existing;
  }

  const ref = db.collection("customers").doc();
  const newRecord: Omit<CustomerRecord, "createdAt" | "updatedAt"> & {
    createdAt: FirebaseFirestore.FieldValue;
    updatedAt: FirebaseFirestore.FieldValue;
  } = {
    firstName: snapshot.firstName,
    lastName: snapshot.lastName,
    email: snapshot.email ?? "",
    emailLower,
    phone: snapshot.phone,
    phoneDigits,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (address) newRecord.defaultAddress = address;
  await ref.set(newRecord);
  return ref.id;
}
