// admin-auth.js — Sesión de administrador (correo y contraseña). Es admin solo si existe admins/{uid}.
import { auth, db, signInWithEmailAndPassword, signOut, onAuthStateChanged, doc, getDoc } from "./firebase.js";

const MENSAJES = {
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/invalid-email": "El correo no es válido.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
  "auth/network-request-failed": "Sin conexión a internet.",
};

/**
 * Vigila la sesión. alEntrar(user) solo se llama si hay documento admins/{uid};
 * en cualquier otro caso alSalir(mensaje?) y NO se muestra nada del panel.
 */
export function vigilarAdmin(alEntrar, alSalir) {
  onAuthStateChanged(auth, async (u) => {
    if (!u || u.isAnonymous) return alSalir();
    try {
      const s = await getDoc(doc(db, "admins", u.uid));
      if (s.exists()) return alEntrar(u);
      await signOut(auth); // cuenta registrada sin poder alguno
      alSalir("Esta cuenta no tiene permisos de administrador.");
    } catch (e) {
      console.error(e);
      alSalir("No se pudo verificar tu cuenta. Revisa tu conexión.");
    }
  });
}

export async function entrarAdmin(correo, clave) {
  try { await signInWithEmailAndPassword(auth, correo, clave); return null; }
  catch (e) { return MENSAJES[e.code] || "No se pudo iniciar sesión."; }
}

export const salirAdmin = () => signOut(auth);

