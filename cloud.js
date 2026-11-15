// Bundle Wise cloud (Firebase free Spark plan): accounts, products, discount, orders and About us.
// Your Firebase values live in config.js (the only file you need to edit).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, getDoc, setDoc, deleteDoc, addDoc, updateDoc, query, where, serverTimestamp, increment, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

// Customer cancels their own order (the database rules only allow this while the order is still Pending)
export const cancelOrder = (id, reason) => updateDoc(doc(db, "orders", id), { status: "Cancelled", cancelledBy: "customer", cancelReason: reason, cancelledAt: serverTimestamp() });

// Customer service chat: one thread per customer at chats/{customerUid}, messages inside it
export const watchChats = cb => onSnapshot(collection(db, "chats"), s => cb(s.docs.map(withId)), err);
export const watchChat = (uid, cb) => onSnapshot(doc(db, "chats", uid), s => cb(s.exists() ? s.data() : null), err);
export const watchMessages = (uid, cb) => onSnapshot(collection(db, "chats", uid, "messages"), s => cb(s.docs.map(withId)), err);
export const sendMessage = async (uid, from, text, customerName) => {
  await addDoc(collection(db, "chats", uid, "messages"), { from, text, createdAt: serverTimestamp() });
  const meta = { uid, lastMessage: text.slice(0, 120), lastFrom: from, lastAt: serverTimestamp() };
  if (from === "customer") { meta.customerName = customerName; meta.adminUnread = increment(1); } else meta.customerUnread = increment(1);
  await setDoc(doc(db, "chats", uid), meta, { merge: true });
};
// Delete a whole conversation (all messages, then the thread itself). Works for the customer who owns it and for admins.
export const deleteChat = async uid => {
  const snap = await getDocs(collection(db, "chats", uid, "messages"));
  for (let i = 0; i < snap.docs.length; i += 400){ const b = writeBatch(db); snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
  await deleteDoc(doc(db, "chats", uid));
};
export const markChatRead = (uid, who) => updateDoc(doc(db, "chats", uid), who === "admin" ? { adminUnread: 0 } : { customerUnread: 0 }).catch(err);

// Admin: all customer accounts (for the analytics page)
export const watchCustomers = cb => onSnapshot(collection(db, "customers"), s => cb(s.docs.map(withId)), err);

// Accounts
export const isAdmin = async uid => (await getDoc(doc(db, "admins", uid))).exists();
export const getProfile = async uid => { const s = await getDoc(doc(db, "customers", uid)); return s.exists() ? s.data() : null; };
export const logIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const register = async (name, contact, email, password) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "customers", cred.user.uid), { name, contact, email, createdAt: serverTimestamp() });
  return cred;
};
export const logOut = () => signOut(auth);
export const onUser = cb => onAuthStateChanged(auth, cb);
