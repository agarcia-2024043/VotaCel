// admin-manage.js — Gestión: importar JSON (directivas, candidatos, padrón), auditoría.
import {
  db, doc, collection, getDocs, getDocsFromServer, writeBatch, serverTimestamp, query, orderBy, limit,
} from "./firebase.js";
import { aCSV, validarDirectivas, validarCandidatos, validarPadron } from "./logic.js";

const TAM_LOTE = 400;

async function enLotes(items, aplicar) {
  for (let i = 0; i < items.length; i += TAM_LOTE) {
    const b = writeBatch(db);
    items.slice(i, i + TAM_LOTE).forEach((it) => aplicar(b, it));
    await b.commit();
  }
}
const audit = (b, uid, action, detail) =>
  b.set(doc(collection(db, "audit")), { action, by: uid, at: serverTimestamp(), detail });

/** Importa directivas (merge: no borra nada existente). */
export async function importarDirectivas(texto, uid) {
  let json;
  try { json = JSON.parse(texto); } catch { return { ok: false, errores: ["El texto no es un JSON válido."] }; }
  const v = validarDirectivas(json);
  if (!v.ok) return v;
  const b = writeBatch(db);
  v.datos.forEach((d) => b.set(doc(db, "directivas", d.id), { nombre: d.nombre, orden: d.orden, cargos: d.cargos }));
  audit(b, uid, "importar_directivas", { cantidad: v.datos.length });
  await b.commit();
  return { ok: true, cantidad: v.datos.length };
}

/** Importa candidatos. Si ya existen, conserva elected/electedCargo. */
export async function importarCandidatos(texto, uid) {
  let json;
  try { json = JSON.parse(texto); } catch { return { ok: false, errores: ["El texto no es un JSON válido."] }; }
  const dirs = (await getDocs(collection(db, "directivas"))).docs.map((d) => d.id);
  const v = validarCandidatos(json, dirs);
  if (!v.ok) return v;
  const existentes = new Set((await getDocs(collection(db, "candidates"))).docs.map((d) => d.id));
  await enLotes(v.datos, (b, c) => {
    const base = { directivaId: c.directivaId, nombre: c.nombre, numero: c.numero, foto: c.foto };
    b.set(doc(db, "candidates", c.id), existentes.has(c.id) ? base : { ...base, elected: false, electedCargo: null }, { merge: true });
  });
  const b = writeBatch(db);
  audit(b, uid, "importar_candidatos", { cantidad: v.datos.length });
  await b.commit();
  return { ok: true, cantidad: v.datos.length };
}

/** Parsea texto a lista de nombres (soporta JSON o CSV/líneas simples) */
function parsearTextoNombres(texto) {
  const trim = texto.trim();
  if (trim.startsWith("[") || trim.startsWith("{")) {
    try {
      const parsed = JSON.parse(trim);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // si falla JSON, procesa como líneas
    }
  }
  return trim.split(/[\r\n]+/).map((l) => {
    const lim = l.replace(/^["'\s]+|["'\s]+$/g, "").trim();
    return lim;
  }).filter(Boolean);
}

/** Importa lista de personas al padrón electoral (padron/{nameKey}) */
export async function importarPadron(texto, uid) {
  const items = parsearTextoNombres(texto);
  const v = validarPadron(items);
  if (!v.ok) return v;

  await enLotes(v.datos, (b, p) => {
    b.set(doc(db, "padron", p.nameKey), { nombre: p.nombre });
  });

  const b = writeBatch(db);
  audit(b, uid, "importar_padron", { cantidad: v.datos.length });
  await b.commit();
  return { ok: true, cantidad: v.datos.length };
}

/** Lee todas las personas registradas en el padrón electoral */
export async function listarPadron() {
  const snap = await getDocsFromServer(collection(db, "padron"));
  return snap.docs
    .map((d) => ({ nameKey: d.id, ...d.data() }))
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { numeric: true }));
}

/** Vacía el padrón electoral */
export async function vaciarPadron(uid) {
  const snap = await getDocsFromServer(collection(db, "padron"));
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += TAM_LOTE) {
    const b = writeBatch(db);
    refs.slice(i, i + TAM_LOTE).forEach((r) => b.delete(r));
    await b.commit();
  }
  const b = writeBatch(db);
  audit(b, uid, "vaciar_padron", { cantidadBorrados: refs.length });
  await b.commit();
}

/** Lee la lista de votos de una ronda en el servidor */
export async function listarVotosRonda(roundId) {
  const snap = await getDocsFromServer(collection(db, "rounds", roundId, "votes"));
  return snap.docs.map((d) => ({
    nameKey: d.id,
    ...d.data(),
  })).sort((a, b) => {
    const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return tb - ta; // más recientes primero
  });
}

/** Obtiene los últimos registros de la bitácora */
export async function ultimosAudit() {
  const q = await getDocs(query(collection(db, "audit"), orderBy("at", "desc"), limit(50)));
  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Exporta una lista arbitraria a CSV descargable */
export function descargarCSV(filas, nombreArchivo = "exportacion.csv") {
  const blob = new Blob(["\ufeff" + aCSV(filas)], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: nombreArchivo,
  });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
