import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

const bannersCol = collection(db, "banners");

export async function listBanners() {
  const q = query(bannersCol, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createBanner(data) {
  const result = await addDoc(bannersCol, {
    ...data,
    active: data.active !== false,
    // NEW — "image" (default, existing behaviour) or "video". Kept as a
    // plain string field so old banners without it still work as images.
    mediaType: data.mediaType === "video" ? "video" : "image",
    imageUrl: data.imageUrl || "",
    // NEW — Cloudinary video URL for video banners.
    videoUrl: data.videoUrl || "",
    title: data.title || "",
    link: data.link || "/",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bannerschange"));
  }
  return result;
}

export async function updateBanner(id, data) {
  const result = await updateDoc(doc(db, "banners", id), { ...data, updatedAt: serverTimestamp() });
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bannerschange"));
  }
  return result;
}

export async function deleteBanner(id) {
  const result = await deleteDoc(doc(db, "banners", id));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("bannerschange"));
  }
  return result;
}
