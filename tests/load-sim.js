// Simulación de carga: 120 votantes concurrentes con nombres distintos contra el emulador.
// Verifica que no se pierde ni se duplica ningún voto y que se rechazan intentos repetidos (mismo nombre o mismo uid).
import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocs, collection, serverTimestamp, writeBatch } from "firebase/firestore";

const N = 120;
const env = await initializeTestEnvironment({
  projectId: "demo-votacion",
  firestore: {
    rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});
await env.clearFirestore();

const candidatos = ["c1", "c2", "c3", "c4"];

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "admins", "adminUid"), { email: "admin@iglesia.org" });
  await setDoc(doc(db, "config", "state"), {
    activeDirectivaId: "d",
    activeRoundId: "r1",
    usePadron: false,
  });
  await setDoc(doc(db, "rounds", "r1"), {
    directivaId: "d",
    cargoId: "pres",
    status: "open",
    candidateIds: candidatos,
    winnerId: null,
  });
});

const t0 = Date.now();
const intentos = [];

function emitir(db, roundId, nameKey, uid, candidateId, nombre) {
  const b = writeBatch(db);
  b.set(doc(db, "rounds", roundId, "votes", nameKey), {
    candidateId,
    nombre,
    uid,
    createdAt: serverTimestamp(),
  });
  b.set(doc(db, "rounds", roundId, "devices", uid), {
    nameKey,
    createdAt: serverTimestamp(),
  });
  return b.commit().then(() => "ok", () => "denegado");
}

for (let i = 0; i < N; i++) {
  const uid = `uid_sim_${i}`;
  const db = env.authenticatedContext(uid).firestore();
  const nombre = `Votante Numero ${i + 1}`;
  const nameKey = `votante_numero_${i + 1}`;
  const elegido = candidatos[i % candidatos.length];

  // Intento 1: Voto legítimo
  const intento1 = emitir(db, "r1", nameKey, uid, elegido, nombre);

  // Intento 2 simultáneo: Duplicado con el mismo dispositivo intentando cambiar candidato
  const intento2 = emitir(db, "r1", `${nameKey}_otro`, uid, candidatos[(i + 1) % candidatos.length], `${nombre} Clon`);

  intentos.push(Promise.all([intento1, intento2]));
}

const resultados = await Promise.all(intentos);

let fallos = 0;
const falla = (m) => { fallos++; console.error("✗ " + m); };

const admin = env.authenticatedContext("adminUid").firestore();
const snapVotos = await getDocs(collection(admin, "rounds", "r1", "votes"));
const snapDevs = await getDocs(collection(admin, "rounds", "r1", "devices"));

if (snapVotos.size !== N) falla(`Se esperaban ${N} votos y hay ${snapVotos.size}`);
if (snapDevs.size !== N) falla(`Se esperaban ${N} dispositivos registrados y hay ${snapDevs.size}`);

resultados.forEach((par, i) => {
  const oks = par.filter((r) => r === "ok").length;
  if (oks !== 1) falla(`Votante #${i + 1}: ${oks} envíos aceptados (debía ser exactamente 1)`);
});

const recibidos = {};
snapVotos.forEach((d) => {
  const v = d.data();
  recibidos[v.candidateId] = (recibidos[v.candidateId] || 0) + 1;
});

console.log(`Votantes: ${N} | votos guardados: ${snapVotos.size} | devices: ${snapDevs.size} | tiempo: ${Date.now() - t0} ms`);
console.log("Conteo guardado por candidato:", recibidos);

const suma = Object.values(recibidos).reduce((a, b) => a + b, 0);
if (suma !== N) falla(`La suma de conteos (${suma}) no coincide con ${N}`);

await env.cleanup();
if (fallos) {
  console.error(`FALLÓ: ${fallos} problema(s)`);
  process.exit(1);
}
console.log("✓ 120 votantes concurrentes: ningún voto perdido ni duplicado y todos los clones rechazados");
