// Admin Seller Management — sellers are stored in Firestore ("sellers"
// collection), keyed by normalized email, so records persist across
// refreshes/devices and an admin lookup ("is this seller verified?") is a
// single getDoc instead of a collection scan.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import { normalizeEmail } from "./allowedEmails";

const sellersCol = collection(db, "sellers");

export const SELLER_VERIFICATION_STATUSES = ["pending", "under_review", "verified", "rejected"];
export const SELLER_STATUSES = ["active", "inactive", "suspended"];

export async function listSellers() {
  const q = query(sellersCol, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSeller(email) {
  const id = normalizeEmail(email);
  if (!id) return null;
  const snap = await getDoc(doc(db, "sellers", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Handy for showing a "✓ Verified Seller" badge next to a seller's name or
// on their products elsewhere in the app.
export async function isSellerVerified(email) {
  const seller = await getSeller(email);
  return !!seller && seller.verificationStatus === "verified";
}

export async function createSeller(data) {
  const id = normalizeEmail(data.email);
  if (!id) throw new Error("Seller email is required.");
  if (!data.fullName?.trim()) throw new Error("Seller full name is required.");

  const existing = await getDoc(doc(db, "sellers", id));
  if (existing.exists()) throw new Error("A seller with this email already exists.");

  await setDoc(doc(db, "sellers", id), {
    fullName: (data.fullName || "").trim(),
    phone: (data.phone || "").trim(),
    cnic: (data.cnic || "").trim(),
    email: id,
    age: data.age ? Number(data.age) : null,
    gender: data.gender || "",
    address: (data.address || "").trim(),
    postalCode: (data.postalCode || "").trim(),
    city: (data.city || "").trim(),
    area: (data.area || "").trim(),
    registrationDate: data.registrationDate || new Date().toISOString().slice(0, 10),
    status: SELLER_STATUSES.includes(data.status) ? data.status : "active",
    verificationStatus: SELLER_VERIFICATION_STATUSES.includes(data.verificationStatus) ? data.verificationStatus : "pending",
    notes: (data.notes || "").trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

// Note: email is the document id, so it can't be changed via update — a
// seller who needs a different email should be deleted and re-added.
export async function updateSeller(id, data) {
  const patch = { ...data, updatedAt: serverTimestamp() };
  delete patch.email;
  delete patch.id;
  if (patch.age !== undefined) patch.age = patch.age ? Number(patch.age) : null;
  await updateDoc(doc(db, "sellers", id), patch);
}

export async function deleteSeller(id) {
  await deleteDoc(doc(db, "sellers", id));
}

export async function setSellerVerification(id, verificationStatus) {
  if (!SELLER_VERIFICATION_STATUSES.includes(verificationStatus)) {
    throw new Error("Invalid verification status.");
  }
  await updateDoc(doc(db, "sellers", id), { verificationStatus, updatedAt: serverTimestamp() });
}

export async function setSellerStatus(id, status) {
  if (!SELLER_STATUSES.includes(status)) {
    throw new Error("Invalid seller status.");
  }
  await updateDoc(doc(db, "sellers", id), { status, updatedAt: serverTimestamp() });
}