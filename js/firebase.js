// firebase.js — Inicialización única. Importa el SDK modular desde el CDN oficial con versión FIJA 10.14.1
// (debe coincidir con SDK_VERSION en firebase-config.js; los imports ES requieren URL literal).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Para ensayar contra el emulador local: abre la página con ?emu=1 en localhost.
if (["localhost", "127.0.0.1"].includes(location.hostname) && new URLSearchParams(location.search).has("emu")) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}

export {
  signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
export {
  doc, collection, query, where, orderBy, limit, getDoc, getDocs, getDocsFromServer, getCountFromServer,
  setDoc, updateDoc, deleteDoc, addDoc, writeBatch, onSnapshot, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

