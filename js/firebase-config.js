// firebase-config.js — REEMPLAZA los valores TU_... con los de tu proyecto
// (Consola de Firebase → Configuración del proyecto → Tus apps → Configuración del SDK).
// La apiKey de Firebase web NO es un secreto: la protección real son las reglas
// de Firestore y la restricción de dominios (ver README).
export const firebaseConfig = {
  apiKey: "AIzaSyCBA8QeXvR1Oe7y9zGDXd7oJBRR8L8oeNc",
  authDomain: "votacel-3fe1d.firebaseapp.com",
  projectId: "votacel-3fe1d",
  storageBucket: "votacel-3fe1d.firebasestorage.app",
  messagingSenderId: "1077513764744",
  appId: "1:1077513764744:web:1b98dee0d92f9ffabcc43d",
  measurementId: "G-HNFFMJCM34"
};

// Versión FIJA del SDK desde el CDN oficial. Cámbiala solo si actualizas en firebase.js a la vez.
export const SDK_VERSION = "10.14.1";

// ¿Siguen los placeholders? Las páginas muestran un aviso en lugar de fallar en silencio.
export const configPendiente = Object.values(firebaseConfig).some((v) => String(v).startsWith("TU_"));

