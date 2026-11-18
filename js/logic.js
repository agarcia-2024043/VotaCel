// logic.js — Lógica pura (sin Firebase ni DOM).

/**
 * Genera la clave de nombre única para evitar duplicados:
 * minúsculas, sin tildes, caracteres especiales y espacios convertidos a "_".
 * Debe coincidir con la validación de regex en firestore.rules: ^[a-z0-9_]{3,80}$
 */
export function generarNameKey(nombre) {
  if (!nombre || typeof nombre !== "string") return "";
  const normalizado = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita tildes y diacríticos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")   // reemplaza espacios y signos por _
    .replace(/^_+|_+$/g, "")       // quita _ al inicio y final
    .slice(0, 80);
  return normalizado;
}

/** Valida que el nombre tenga al menos dos palabras y longitud adecuada */
export function validarNombre(nombre) {
  if (!nombre || typeof nombre !== "string") return { ok: false, error: "Escribe tu nombre." };
  const limpio = nombre.trim();
  if (limpio.length < 3) return { ok: false, error: "El nombre debe tener al menos 3 caracteres." };
  if (limpio.length > 80) return { ok: false, error: "El nombre es demasiado largo (máximo 80 caracteres)." };
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (palabras.length < 2) return { ok: false, error: "Por favor escribe tu nombre completo (nombre y apellido)." };
  const key = generarNameKey(limpio);
  if (!/^[a-z0-9_]{3,80}$/.test(key)) {
    return { ok: false, error: "El nombre contiene caracteres no permitidos." };
  }
  return { ok: true, nombre: limpio, key };
}

/** Valida lista para importar al padrón */
export function validarPadron(items) {
  const errores = [];
  if (!Array.isArray(items) || !items.length) {
    return { ok: false, errores: ["Debe ser una lista con al menos un nombre."], datos: [] };
  }
  const vistos = new Set();
  const datos = [];
  items.forEach((item, idx) => {
    const raw = typeof item === "string" ? item : (item?.nombre || item?.name || "");
    const v = validarNombre(raw);
    if (!v.ok) {
      errores.push(`Fila #${idx + 1} ("${raw}"): ${v.error}`);
    } else if (vistos.has(v.key)) {
      errores.push(`Fila #${idx + 1}: el nombre "${v.nombre}" está duplicado en el padrón.`);
    } else {
      vistos.add(v.key);
      datos.push({ nameKey: v.key, nombre: v.nombre });
    }
  });
  return { ok: !errores.length, errores, datos };
}

/** Cuenta votos por candidato. */
export function contarVotos(votos, candidateIds) {
  const counts = Object.fromEntries(candidateIds.map((id) => [id, 0]));
  let total = 0;
  for (const v of votos) {
    if (Object.prototype.hasOwnProperty.call(counts, v.candidateId)) {
      counts[v.candidateId] += 1;
      total += 1;
    }
  }
  return { counts, total };
}

/** Devuelve el máximo y la lista de candidatos que lo comparten (más de uno = empate). */
export function lideres(counts) {
  const ids = Object.keys(counts);
  if (!ids.length) return { max: 0, ids: [], empate: false };
  const max = Math.max(...ids.map((i) => counts[i]));
  const top = ids.filter((i) => counts[i] === max);
  return { max, ids: top, empate: top.length > 1 };
}

/** Ordena candidatos por votos (desc) y luego por número de participante. */
export function ordenarPorVotos(candidatos, counts) {
  return [...candidatos].sort(
    (a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || (a.numero || 0) - (b.numero || 0)
  );
}

/**
 * Decide qué cargo toca. `rondas` son las rondas existentes de la directiva.
 * Devuelve: {tipo:'reusar', ronda} | {tipo:'nueva', cargo} | {tipo:'completa'}
 */
export function siguienteCargo(cargos, rondas) {
  const ordenados = [...cargos].sort((a, b) => a.orden - b.orden);
  for (const cargo of ordenados) {
    const delCargo = rondas.filter((r) => r.cargoId === cargo.id);
    if (delCargo.some((r) => r.winnerId)) continue; // cargo ya cubierto
    if (!delCargo.length) return { tipo: "nueva", cargo };
    const ultima = [...delCargo].sort((a, b) => b.numero - a.numero)[0];
    return { tipo: "reusar", ronda: ultima, cargo };
  }
  return { tipo: "completa" };
}

/** Iniciales (máx. 2) para el respaldo de foto. */
export function iniciales(nombre) {
  const p = String(nombre || "?").trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Colores oscuros: el texto blanco de las iniciales cumple contraste AA.
const COLORES_INICIALES = ["#1B2A41", "#8B1E3F", "#2F7D4F", "#3B4A7A", "#6B3A1E", "#2D5F6B"];
export function colorParaNombre(nombre) {
  let h = 0;
  for (const c of String(nombre)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORES_INICIALES[h % COLORES_INICIALES.length];
}

/** Espera creciente (ms) para reintentos: 2 s, 4 s, 8 s… tope 30 s, más un poco de azar. */
export function esperaCreciente(intento, azar = Math.random()) {
  return Math.min(30000, 2000 * 2 ** intento) + Math.floor(azar * 1000);
}

/** Convierte filas (arrays) a CSV con escape correcto. */
export function aCSV(filas) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return filas.map((f) => f.map(esc).join(",")).join("\r\n");
}

const slug = (s) =>
  String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export { slug };

/** Valida el JSON de directivas. */
export function validarDirectivas(arr) {
  const errores = [];
  if (!Array.isArray(arr) || !arr.length) return { ok: false, errores: ["Debe ser una lista con al menos una directiva."], datos: [] };
  const datos = arr.map((d, i) => {
    const n = `Directiva #${i + 1}`;
    if (!d || typeof d.nombre !== "string" || !d.nombre.trim()) errores.push(`${n}: falta "nombre".`);
    const cargos = Array.isArray(d?.cargos) ? d.cargos : [];
    if (!cargos.length) errores.push(`${n}: falta la lista "cargos".`);
    const cs = cargos.map((c, j) => {
      if (!c || typeof c.nombre !== "string" || !c.nombre.trim()) errores.push(`${n}, cargo #${j + 1}: falta "nombre".`);
      return { id: String(c?.id || slug(c?.nombre || `cargo-${j + 1}`)), nombre: String(c?.nombre || "").trim(), orden: Number(c?.orden ?? j + 1) };
    });
    return { id: String(d?.id || slug(d?.nombre || `directiva-${i + 1}`)), nombre: String(d?.nombre || "").trim(), orden: Number(d?.orden ?? i + 1), cargos: cs };
  });
  return { ok: !errores.length, errores, datos };
}

/** Valida el JSON de candidatos. El ID del documento será directivaId-numero. */
export function validarCandidatos(arr, idsDirectivas = null) {
  const errores = [];
  if (!Array.isArray(arr) || !arr.length) return { ok: false, errores: ["Debe ser una lista con al menos un candidato."], datos: [] };
  const vistos = new Set();
  const datos = arr.map((c, i) => {
    const n = `Candidato #${i + 1}`;
    if (!c || typeof c.nombre !== "string" || !c.nombre.trim()) errores.push(`${n}: falta "nombre".`);
    if (!c || typeof c.directivaId !== "string" || !c.directivaId) errores.push(`${n}: falta "directivaId".`);
    else if (idsDirectivas && !idsDirectivas.includes(c.directivaId)) errores.push(`${n}: la directiva "${c.directivaId}" no existe.`);
    if (!Number.isInteger(Number(c?.numero)) || Number(c?.numero) < 1) errores.push(`${n}: "numero" debe ser un entero positivo.`);
    const id = `${c?.directivaId}-${Number(c?.numero)}`;
    if (vistos.has(id)) errores.push(`${n}: número repetido en la misma directiva (${id}).`);
    vistos.add(id);
    return { id, directivaId: String(c?.directivaId), nombre: String(c?.nombre || "").trim(), numero: Number(c?.numero), foto: String(c?.foto || "") };
  });
  return { ok: !errores.length, errores, datos };
}
