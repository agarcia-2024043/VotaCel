// Pruebas de firestore.rules con el emulador.
// Ejecutar: npm run test:emu
import test, { before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection,
  serverTimestamp, writeBatch,
} from "firebase/firestore";

let env;
const ADMIN = "adminUid";

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-votacion",
    firestore: {
      rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins", ADMIN), { email: "admin@iglesia.org" });
    await setDoc(doc(db, "config", "state"), {
      activeDirectivaId: "d1",
      activeRoundId: "rOpen",
      usePadron: false,
    });
    await setDoc(doc(db, "candidates", "c1"), {
      directivaId: "d1", nombre: "Ana", numero: 1, foto: "", elected: false, electedCargo: null,
    });
    await setDoc(doc(db, "candidates", "c2"), {
      directivaId: "d1", nombre: "Luis", numero: 2, foto: "", elected: false, electedCargo: null,
    });
    await setDoc(doc(db, "candidates", "c9"), {
      directivaId: "d1", nombre: "Elegido", numero: 9, foto: "", elected: true, electedCargo: "Presidente",
    });
    await setDoc(doc(db, "rounds", "rOpen"), {
      directivaId: "d1", cargoId: "vp", status: "open", candidateIds: ["c1", "c2"], winnerId: null,
    });
    await setDoc(doc(db, "rounds", "rClosed"), {
      directivaId: "d1", cargoId: "pres", status: "closed", candidateIds: ["c1", "c2"], winnerId: "c1",
    });
    await setDoc(doc(db, "rounds", "rPending"), {
      directivaId: "d1", cargoId: "sec", status: "pending", candidateIds: ["c1", "c2"], winnerId: null,
    });
    await setDoc(doc(db, "tallies", "rClosed"), { counts: { c1: 5, c2: 3 }, total: 8 });

    // Padrón de prueba
    await setDoc(doc(db, "padron", "juan_perez"), { nombre: "Juan Pérez" });
  });
});

const dbDe = (uid) => env.authenticatedContext(uid).firestore();

/** Helper para emitir un voto atómico (voto + device) en un solo batch */
function emitirVoto(db, roundId, nameKey, uid, candidateId = "c1", nombre = "Juan Pérez", extraVoto = {}, extraDev = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "rounds", roundId, "votes", nameKey), {
    candidateId,
    nombre,
    uid,
    createdAt: serverTimestamp(),
    ...extraVoto,
  });
  b.set(doc(db, "rounds", roundId, "devices", uid), {
    nameKey,
    createdAt: serverTimestamp(),
    ...extraDev,
  });
  return b.commit();
}

// ───────── Se permite ─────────
test("PERMITE: voto válido atómico (votes/{nameKey} + devices/{uid})", async () => {
  const db = dbDe("uidA");
  await assertSucceeds(emitirVoto(db, "rOpen", "juan_perez", "uidA"));
});

test("PERMITE: el votante lee su propio voto y su propio dispositivo", async () => {
  const db = dbDe("uidA");
  await emitirVoto(db, "rOpen", "juan_perez", "uidA");
  await assertSucceeds(getDoc(doc(db, "rounds", "rOpen", "votes", "juan_perez")));
  await assertSucceeds(getDoc(doc(db, "rounds", "rOpen", "devices", "uidA")));
});

test("PERMITE: el votante lee padron, config, directivas y candidatos", async () => {
  const db = dbDe("uidA");
  await assertSucceeds(getDoc(doc(db, "config", "state")));
  await assertSucceeds(getDoc(doc(db, "rounds", "rOpen")));
  await assertSucceeds(getDocs(collection(db, "candidates")));
  await assertSucceeds(getDoc(doc(db, "padron", "juan_perez")));
  await assertSucceeds(getDocs(collection(db, "padron")));
});

test("PERMITE: operaciones del admin (incluyendo habilitar persona y padrón)", async () => {
  const adminDb = env.authenticatedContext(ADMIN).firestore();
  await assertSucceeds(setDoc(doc(adminDb, "config", "state"), {
    activeDirectivaId: "d1", activeRoundId: "rPending", usePadron: true,
  }));
  await assertSucceeds(updateDoc(doc(adminDb, "rounds", "rOpen"), { status: "closed" }));
  await assertSucceeds(setDoc(doc(adminDb, "candidates", "c3"), {
    directivaId: "d1", nombre: "Nuevo", numero: 3, foto: "", elected: false, electedCargo: null,
  }));
  await assertSucceeds(setDoc(doc(adminDb, "tallies", "rOpen"), { counts: {}, total: 0 }));
  await assertSucceeds(getDoc(doc(adminDb, "tallies", "rClosed")));
  await assertSucceeds(getDocs(collection(adminDb, "rounds", "rOpen", "votes")));
  await assertSucceeds(getDocs(collection(adminDb, "rounds", "rOpen", "devices")));
  await assertSucceeds(setDoc(doc(adminDb, "padron", "maria_lopez"), { nombre: "María López" }));
  await assertSucceeds(deleteDoc(doc(adminDb, "padron", "maria_lopez")));
  await assertSucceeds(addDoc(collection(adminDb, "audit"), {
    action: "test", by: ADMIN, at: serverTimestamp(), detail: {},
  }));

  // Sembrar voto para probar habilitar persona
  await env.withSecurityRulesDisabled(async (ctx) => {
    const sdb = ctx.firestore();
    await setDoc(doc(sdb, "rounds", "rOpen", "votes", "carlos_gomez"), {
      candidateId: "c1", nombre: "Carlos Gómez", uid: "uidCarlos", createdAt: new Date(),
    });
    await setDoc(doc(sdb, "rounds", "rOpen", "devices", "uidCarlos"), {
      nameKey: "carlos_gomez", createdAt: new Date(),
    });
  });

  const b = writeBatch(adminDb);
  b.delete(doc(adminDb, "rounds", "rOpen", "votes", "carlos_gomez"));
  b.delete(doc(adminDb, "rounds", "rOpen", "devices", "uidCarlos"));
  await assertSucceeds(b.commit());
});

// ───────── Se deniega ─────────
test("DENIEGA: voto doble por el mismo dispositivo (mismo uid)", async () => {
  const db = dbDe("uidA");
  await assertSucceeds(emitirVoto(db, "rOpen", "persona_uno", "uidA", "c1", "Persona Uno"));
  // Mismo dispositivo intenta votar con otro nombre
  await assertFails(emitirVoto(db, "rOpen", "persona_dos", "uidA", "c2", "Persona Dos"));
});

test("DENIEGA: voto doble por el mismo nombre desde otro dispositivo (otro uid)", async () => {
  const db1 = dbDe("uidTel1");
  await assertSucceeds(emitirVoto(db1, "rOpen", "mario_rossi", "uidTel1", "c1", "Mario Rossi"));
  // Otro teléfono intenta votar con el mismo nombre
  const db2 = dbDe("uidTel2");
  await assertFails(emitirVoto(db2, "rOpen", "mario_rossi", "uidTel2", "c2", "Mario Rossi"));
});

test("DENIEGA: voto sin el doc de dispositivo (o viceversa)", async () => {
  const db = dbDe("uidA");
  // Solo crear voto sin device
  await assertFails(setDoc(doc(db, "rounds", "rOpen", "votes", "juan_perez"), {
    candidateId: "c1", nombre: "Juan Pérez", uid: "uidA", createdAt: serverTimestamp(),
  }));
  // Solo crear device sin voto
  await assertFails(setDoc(doc(db, "rounds", "rOpen", "devices", "uidA"), {
    nameKey: "juan_perez", createdAt: serverTimestamp(),
  }));
});

test("DENIEGA: voto sin sesión autenticada", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(emitirVoto(db, "rOpen", "juan_perez", "anon"));
});

test("DENIEGA: voto con uid en doc distinto al de la sesión", async () => {
  const db = dbDe("uidA");
  await assertFails(emitirVoto(db, "rOpen", "juan_perez", "uidFalso"));
});

test("DENIEGA: voto en ronda cerrada o pendiente", async () => {
  const db = dbDe("uidA");
  await assertFails(emitirVoto(db, "rClosed", "juan_perez", "uidA"));
  await assertFails(emitirVoto(db, "rPending", "juan_perez", "uidA"));
});

test("DENIEGA: candidato fuera de candidateIds", async () => {
  const db = dbDe("uidA");
  await assertFails(emitirVoto(db, "rOpen", "juan_perez", "uidA", "c9")); // c9 no está en candidateIds
});

test("DENIEGA: campos extra, faltantes o createdAt falsificado", async () => {
  const db = dbDe("uidA");
  await assertFails(emitirVoto(db, "rOpen", "juan_perez", "uidA", "c1", "Juan Pérez", { extra: 123 }));
  await assertFails(emitirVoto(db, "rOpen", "juan_perez", "uidA", "c1", "Juan Pérez", { createdAt: new Date("2020-01-01") }));
});

test("DENIEGA: update o delete de un voto por un votante", async () => {
  const db = dbDe("uidA");
  await assertSucceeds(emitirVoto(db, "rOpen", "juan_perez", "uidA"));
  const refVoto = doc(db, "rounds", "rOpen", "votes", "juan_perez");
  const refDev = doc(db, "rounds", "rOpen", "devices", "uidA");
  await assertFails(updateDoc(refVoto, { candidateId: "c2" }));
  await assertFails(deleteDoc(refVoto));
  await assertFails(deleteDoc(refDev));
});

test("DENIEGA: leer votos ajenos, la lista completa de votos o tallies", async () => {
  await emitirVoto(dbDe("uidA"), "rOpen", "juan_perez", "uidA");
  const otro = dbDe("uidOtro");
  await assertFails(getDoc(doc(otro, "rounds", "rOpen", "votes", "juan_perez")));
  await assertFails(getDoc(doc(otro, "rounds", "rOpen", "devices", "uidA")));
  await assertFails(getDocs(collection(otro, "rounds", "rOpen", "votes")));
  await assertFails(getDocs(collection(otro, "rounds", "rOpen", "devices")));
  await assertFails(getDoc(doc(otro, "tallies", "rClosed")));
  await assertFails(getDocs(collection(otro, "tallies")));
});

test("DENIEGA: escribir rounds, candidates, config, padron o audit sin ser admin", async () => {
  const db = dbDe("uidA");
  await assertFails(updateDoc(doc(db, "rounds", "rOpen"), { status: "closed" }));
  await assertFails(setDoc(doc(db, "config", "state"), { activeRoundId: "hack" }));
  await assertFails(setDoc(doc(db, "candidates", "cH"), { nombre: "H", numero: 8 }));
  await assertFails(setDoc(doc(db, "padron", "hacker"), { nombre: "Hacker" }));
  await assertFails(addDoc(collection(db, "audit"), { action: "hacked" }));
});

test("DENIEGA: votar con nombre fuera de padrón cuando usePadron está activo", async () => {
  // Activamos usePadron
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "config", "state"), { usePadron: true });
  });

  const db = dbDe("uidA");
  // "alguien_no_registrado" no está en padron
  await assertFails(emitirVoto(db, "rOpen", "alguien_no_registrado", "uidA", "c1", "Alguien No Registrado"));

  // "juan_perez" sí está en padron -> debe permitir
  await assertSucceeds(emitirVoto(db, "rOpen", "juan_perez", "uidA", "c1", "Juan Pérez"));
});
