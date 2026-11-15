// Bundle Wise cloud (Firebase free Spark plan): accounts, products, discount, orders and About us.
// Your Firebase values live in config.js (the only file you need to edit).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, setDoc, deleteDoc, addDoc, updateDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { firebaseConfig } from "./config.js";

export const configured = !firebaseConfig.apiKey.startsWith("PASTE");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const err = e => console.error("Bundle Wise cloud:", e);
const withId = d => ({ ...d.data(), id: d.id });

// Live data
export const watchProducts = cb => onSnapshot(collection(db, "products"), s => cb(s.docs.map(d => d.data()).sort((a, b) => a.id - b.id)), err);
export const watchDiscount = cb => onSnapshot(doc(db, "settings", "discount"), s => cb(s.exists() ? s.data() : null), err);
export const watchAbout = cb => onSnapshot(doc(db, "settings", "about"), s => cb(s.exists() ? s.data() : null), err);
export const watchBundles = cb => onSnapshot(collection(db, "settings"), s => cb(s.docs.filter(d => d.id.startsWith("bundle_")).map(d => ({ ...d.data(), id: d.id }))), err);
export const watchAllOrders = cb => onSnapshot(collection(db, "orders"), s => cb(s.docs.map(withId)), err);
export const watchMyOrders = (uid, cb) => onSnapshot(query(collection(db, "orders"), where("uid", "==", uid)), s => cb(s.docs.map(withId)), err);

// Admin writes (the database rules only allow these for admin accounts)
export const setProduct = p => setDoc(doc(db, "products", String(p.id)), p);
export const removeProduct = id => deleteDoc(doc(db, "products", String(id)));
export const setBundle = b => setDoc(doc(db, "settings", b.id), b);
export const removeBundle = id => deleteDoc(doc(db, "settings", id));
export const setDiscount = d => setDoc(doc(db, "settings", "discount"), d);
export const setAbout = a => setDoc(doc(db, "settings", "about"), a);
export const updateOrder = (id, patch) => updateDoc(doc(db, "orders", id), patch);
export const removeOrder = id => deleteDoc(doc(db, "orders", id));

// Customer write
export const placeOrder = o => addDoc(collection(db, "orders"), { ...o, createdAt: serverTimestamp() });

// Accounts
export const isAdmin = async uid => (await getDoc(doc(db, "admins", uid))).exists();
export const getProfile = async uid => { const s = await getDoc(doc(db, "customers", uid)); return s.exists() ? s.data() : null; };
export const logIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const register = async (name, contact, email, password) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "customers", cred.user.uid), { name, contact, email });
  return cred;
};
export const logOut = () => signOut(auth);
export const onUser = cb => onAuthStateChanged(auth, cb);
