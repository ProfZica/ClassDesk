// ════════════════════════════════════════════════════════════
// STORE FIREBASE — gestisce autenticazione e dati su Firestore
// ════════════════════════════════════════════════════════════
import { initializeApp } from "firebase/app";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut as fbSignOut,
  sendPasswordResetEmail
} from "firebase/auth";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, writeBatch
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

let app, auth, db;
let firebaseReady = false;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  firebaseReady = firebaseConfig.apiKey !== "INSERISCI_QUI_LA_TUA_API_KEY";
} catch (e) {
  console.error("Firebase non configurato correttamente:", e);
  firebaseReady = false;
}

export function isFirebaseReady() {
  return firebaseReady;
}

// ── AUTENTICAZIONE ──────────────────────────────────────────

export function onAuthChange(callback) {
  if (!firebaseReady) { callback(null); return () => {}; }
  return onAuthStateChanged(auth, callback);
}

export async function registerWithEmail(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOut() {
  await fbSignOut(auth);
}

// ── DATI: elenco classi dell'utente ─────────────────────────
// Struttura Firestore: users/{uid}/classes/{classId}  -> { name, color, createdAt }
//                       users/{uid}/classes/{classId}/data/main -> { layout, students, neverAdjacent, history }

export async function fetchClassesList(uid) {
  const snap = await getDocs(collection(db, "users", uid, "classes"));
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function saveClassMeta(uid, classId, meta) {
  await setDoc(doc(db, "users", uid, "classes", classId), meta, { merge: true });
}

export async function deleteClassCloud(uid, classId) {
  await deleteDoc(doc(db, "users", uid, "classes", classId));
  await deleteDoc(doc(db, "users", uid, "classes", classId, "data", "main"));
}

// ── DATI: contenuto di una singola classe ───────────────────

export async function fetchClassData(uid, classId) {
  const ref = doc(db, "users", uid, "classes", classId, "data", "main");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function saveClassData(uid, classId, data) {
  const ref = doc(db, "users", uid, "classes", classId, "data", "main");
  await setDoc(ref, data, { merge: true });
}

// ── MIGRAZIONE: porta i dati salvati in localStorage su Firestore ──
// Chiamata una sola volta al primo login, se ci sono dati locali da migrare
export async function migrateLocalDataToCloud(uid) {
  try {
    const localClassesRaw = localStorage.getItem("cd_classes_list");
    if (!localClassesRaw) return { migrated: 0 };

    const localClasses = JSON.parse(localClassesRaw);
    if (!Array.isArray(localClasses) || localClasses.length === 0) return { migrated: 0 };

    const batch = writeBatch(db);
    let count = 0;

    for (const cls of localClasses) {
      const classRef = doc(db, "users", uid, "classes", cls.id);
      batch.set(classRef, { name: cls.name, color: cls.color, createdAt: cls.createdAt || Date.now() });

      const layout = localStorage.getItem(`cd_${cls.id}_layout`);
      const students = localStorage.getItem(`cd_${cls.id}_students`);
      const neverAdj = localStorage.getItem(`cd_${cls.id}_never_adj`);
      const history = localStorage.getItem(`cd_${cls.id}_history`);
      const setupDone = localStorage.getItem(`cd_${cls.id}_setup_done`);

      const dataRef = doc(db, "users", uid, "classes", cls.id, "data", "main");
      batch.set(dataRef, {
        layout: layout ? JSON.parse(layout) : null,
        students: students ? JSON.parse(students) : [],
        neverAdjacent: neverAdj ? JSON.parse(neverAdj) : [],
        history: history ? JSON.parse(history) : {},
        setupDone: setupDone === "true"
      });
      count++;
    }

    await batch.commit();

    // Pulizia localStorage dopo migrazione riuscita, per evitare di rifarla ogni volta
    localStorage.setItem("cd_migrated_to_cloud", "true");

    return { migrated: count };
  } catch (e) {
    console.error("Errore durante la migrazione dei dati locali:", e);
    return { migrated: 0, error: e.message };
  }
}

export function hasLocalDataToMigrate() {
  if (localStorage.getItem("cd_migrated_to_cloud") === "true") return false;
  const raw = localStorage.getItem("cd_classes_list");
  if (!raw) return false;
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length > 0;
  } catch {
    return false;
  }
}
