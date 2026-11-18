// round-engine.js — Lógica de rondas con candidatos fijos definidos en código.
import {
  db, doc, collection, query, where, getDoc, getDocs, getDocsFromServer, setDoc, updateDoc,
  writeBatch, serverTimestamp,
} from "./firebase.js";
import { contarVotos, lideres, siguienteCargo } from "./logic.js";
import { DIRECTIVAS_FIJAS, CANDIDATOS_FIJOS } from "./candidatos-datos.js?v=2";

const TAM_LOTE = 400;
const rondaRef = (id) => doc(db, "rounds", id);
const auditRef = () => doc(collection(db, "audit"));

function auditar(batch, adminUid, action, detail = {}) {
  batch.set(auditRef(), { action, by: adminUid, at: serverTimestamp(), detail });
}

async function borrarEnLotes(refs) {
  for (let i = 0; i < refs.length; i += TAM_LOTE) {
    const b = writeBatch(db);
    refs.slice(i, i + TAM_LOTE).forEach((r) => b.delete(r));
    await b.commit();
  }
}

export async function rondasDeDirectiva(directivaId) {
  const q = await getDocs(query(collection(db, "rounds"), where("directivaId", "==", directivaId)));
  return q.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function borrarVotosDeRonda(roundId) {
  const votos = await getDocsFromServer(collection(db, "rounds", roundId, "votes"));
  await borrarEnLotes(votos.docs.map((d) => d.ref));
  return votos.size;
}

export async function activarDirectiva(directivaId, adminUid) {
  const directiva = DIRECTIVAS_FIJAS.find((d) => d.id === directivaId);
  if (!directiva) throw new Error("La directiva no existe en candidatos-datos.js.");

  const rondas = await rondasDeDirectiva(directivaId);
  const batch = writeBatch(db);

  // 1. Si hay alguna ronda abierta o pendiente, la activamos y sincronizamos sus candidatos
  const rondaActiva = rondas.find((r) => r.status === "open" || r.status === "pending");
  if (rondaActiva) {
    const cargo = directiva.cargos?.[0] || { id: "diacono", nombre: "Diácono" };
    
    // Si la ronda está pendiente, actualizamos candidateIds con la lista actual de CANDIDATOS_FIJOS
    if (rondaActiva.status === "pending") {
      const electosIds = new Set();
      rondas.forEach((r) => {
        if (r.id !== rondaActiva.id) {
          if (r.winnerId) electosIds.add(r.winnerId);
          if (r.coWinnerId) electosIds.add(r.coWinnerId);
        }
      });
      const disponibles = CANDIDATOS_FIJOS
        .filter((c) => c.directivaId === directivaId && !electosIds.has(c.id))
        .map((c) => c.id);

      batch.update(rondaRef(rondaActiva.id), {
        cargoId: cargo.id,
        cargoNombre: cargo.nombre,
        candidateIds: disponibles,
      });
    }

    batch.set(doc(db, "config", "state"), {
      activeDirectivaId: directivaId,
      activeRoundId: rondaActiva.id,
      directivaCompletada: false,
      updatedAt: serverTimestamp(),
    });
    auditar(batch, adminUid, "activar_directiva", { directivaId, rondaId: rondaActiva.id });
    await batch.commit();
    return { completa: false, rondaId: rondaActiva.id };
  }

  // 2. Si no hay ninguna ronda creada aún, creamos la Ronda 1
  const cargo = directiva.cargos?.[0] || { id: "diacono", nombre: "Diácono" };
  if (!rondas.length) {
    const todos = CANDIDATOS_FIJOS
      .filter((c) => c.directivaId === directivaId)
      .map((c) => c.id);

    const rondaId = `${directivaId}_${cargo.id}_1`;
    batch.set(rondaRef(rondaId), {
      directivaId,
      cargoId: cargo.id,
      cargoNombre: cargo.nombre,
      numero: 1,
      status: "pending",
      candidateIds: todos,
      winnerId: null,
      coWinnerId: null,
      tieBreak: null,
      openedAt: null,
      closedAt: null,
    });

    batch.set(doc(db, "config", "state"), {
      activeDirectivaId: directivaId,
      activeRoundId: rondaId,
      directivaCompletada: false,
      updatedAt: serverTimestamp(),
    });
    auditar(batch, adminUid, "activar_directiva", { directivaId, rondaId });
    await batch.commit();
    return { completa: false, rondaId };
  }

  // 3. Si todas las rondas están cerradas, apuntamos a la última ronda cerrada para ver su ganador
  const ultima = [...rondas].sort((a, b) => b.numero - a.numero)[0];
  batch.set(doc(db, "config", "state"), {
    activeDirectivaId: directivaId,
    activeRoundId: ultima.id,
    directivaCompletada: false,
    updatedAt: serverTimestamp(),
  });
  auditar(batch, adminUid, "activar_directiva", { directivaId, rondaId: ultima.id });
  await batch.commit();
  return { completa: false, rondaId: ultima.id };
}

export async function siguienteRonda(directivaId, adminUid) {
  const directiva = DIRECTIVAS_FIJAS.find((d) => d.id === directivaId);
  if (!directiva) throw new Error("La directiva no existe.");

  const rondas = await rondasDeDirectiva(directivaId);
  const electosIds = new Set();
  rondas.forEach((r) => {
    if (r.winnerId) electosIds.add(r.winnerId);
    if (r.coWinnerId) electosIds.add(r.coWinnerId);
  });

  const disponibles = CANDIDATOS_FIJOS
    .filter((c) => c.directivaId === directivaId && !electosIds.has(c.id))
    .map((c) => c.id);

  if (!disponibles.length) {
    throw new Error("No quedan más candidatos disponibles para elegir en esta directiva.");
  }

  const cargo = directiva.cargos?.[0] || { id: "diacono", nombre: "Diácono" };
  const numRonda = rondas.length + 1;
  const nuevoId = `${directivaId}_${cargo.id}_${numRonda}`;

  const batch = writeBatch(db);
  batch.set(rondaRef(nuevoId), {
    directivaId,
    cargoId: cargo.id,
    cargoNombre: cargo.nombre,
    numero: numRonda,
    status: "pending",
    candidateIds: disponibles,
    winnerId: null,
    coWinnerId: null,
    tieBreak: null,
    openedAt: null,
    closedAt: null,
  });

  batch.set(doc(db, "config", "state"), {
    activeDirectivaId: directivaId,
    activeRoundId: nuevoId,
    directivaCompletada: false,
    updatedAt: serverTimestamp(),
  });

  auditar(batch, adminUid, "siguiente_ronda", { directivaId, nuevoId, numero: numRonda, disponibles: disponibles.length });
  await batch.commit();
  return nuevoId;
}

export async function completarDirectiva(directivaId, adminUid) {
  const batch = writeBatch(db);
  batch.set(doc(db, "config", "state"), {
    activeDirectivaId: directivaId,
    activeRoundId: null,
    directivaCompletada: true,
    updatedAt: serverTimestamp(),
  });
  auditar(batch, adminUid, "completar_directiva", { directivaId });
  await batch.commit();
  return { completada: true };
}

export async function abrirRonda(roundId, adminUid) {
  const snap = await getDoc(rondaRef(roundId));
  if (!snap.exists()) throw new Error("La ronda no existe.");
  const r = snap.data();
  if (r.status !== "pending") throw new Error("Solo se puede abrir una ronda pendiente.");

  const rondas = await rondasDeDirectiva(r.directivaId);
  const electosIds = new Set();
  rondas.forEach((x) => {
    if (x.id !== roundId) {
      if (x.winnerId) electosIds.add(x.winnerId);
      if (x.coWinnerId) electosIds.add(x.coWinnerId);
    }
  });

  // SIEMPRE sincronizamos con la lista actual de CANDIDATOS_FIJOS
  const candidateIds = CANDIDATOS_FIJOS
    .filter((c) => c.directivaId === r.directivaId && !electosIds.has(c.id))
    .map((c) => c.id);

  if (!candidateIds.length) throw new Error("No quedan candidatos disponibles para este cargo.");
  const batch = writeBatch(db);
  batch.update(rondaRef(roundId), { status: "open", candidateIds, openedAt: serverTimestamp() });
  auditar(batch, adminUid, "abrir_ronda", { roundId, candidatos: candidateIds.length });
  await batch.commit();
}

export async function contarYDeclarar(roundId, adminUid, segundoGanadorId = null) {
  const rSnap = await getDoc(rondaRef(roundId));
  const r = rSnap.data();
  if (r.status !== "closed") throw new Error("La ronda debe estar cerrada para contar.");
  if (r.winnerId) return { ganadorId: r.winnerId, yaDeclarado: true };

  const votosSnap = await getDocsFromServer(collection(db, "rounds", roundId, "votes"));
  const { counts, total } = contarVotos(votosSnap.docs.map((d) => d.data()), r.candidateIds);
  const lid = lideres(counts);

  const batch = writeBatch(db);
  batch.set(doc(db, "tallies", roundId), { counts, total, closedAt: r.closedAt ?? serverTimestamp() });
  
  if (lid.empate && !segundoGanadorId) {
    auditar(batch, adminUid, "empate_detectado", { roundId, empatados: lid.ids, counts, total });
    await batch.commit();
    return { empate: true, ids: lid.ids, counts, total };
  }

  const ganadorId = lid.ids[0];
  const updateData = { winnerId: ganadorId };
  if (segundoGanadorId) {
    updateData.coWinnerId = segundoGanadorId;
  }
  
  batch.update(rondaRef(roundId), updateData);
  auditar(batch, adminUid, "declarar_ganador", { roundId, ganadorId, segundoGanadorId, counts, total });
  await batch.commit();
  return { ganadorId, segundoGanadorId, counts, total };
}

export async function cerrarRonda(roundId, adminUid, segundoGanadorId = null) {
  await updateDoc(rondaRef(roundId), { status: "closed", closedAt: serverTimestamp() });
  return contarYDeclarar(roundId, adminUid, segundoGanadorId);
}

export async function declararSegundoGanador(roundId, segundoGanadorId, adminUid) {
  const batch = writeBatch(db);
  batch.update(rondaRef(roundId), { coWinnerId: segundoGanadorId });
  auditar(batch, adminUid, "declarar_segundo_ganador", { roundId, segundoGanadorId });
  await batch.commit();
}

export async function desempateManual(roundId, ganadorId, motivo, adminUid) {
  const rSnap = await getDoc(rondaRef(roundId));
  const r = rSnap.data();
  if (!r.candidateIds.includes(ganadorId)) throw new Error("Ese candidato no estaba en la ronda.");
  const tallySnap = await getDoc(doc(db, "tallies", roundId));
  const tieBreak = { tipo: "manual", motivo, por: adminUid, ganadorId };
  const batch = writeBatch(db);
  batch.update(rondaRef(roundId), { winnerId: ganadorId, tieBreak });
  auditar(batch, adminUid, "desempate_manual", { roundId, ganadorId, motivo, counts: tallySnap.data()?.counts ?? null });
  await batch.commit();
}

export async function segundaVuelta(roundId, empatadosIds, adminUid) {
  const r = (await getDoc(rondaRef(roundId))).data();
  const nuevoId = `${r.directivaId}_${r.cargoId}_${r.numero + 1}`;
  const batch = writeBatch(db);
  batch.set(rondaRef(nuevoId), {
    directivaId: r.directivaId,
    cargoId: r.cargoId,
    cargoNombre: r.cargoNombre,
    numero: r.numero + 1,
    status: "pending",
    candidateIds: empatadosIds,
    winnerId: null,
    tieBreak: null,
    openedAt: null,
    closedAt: null,
  });
  batch.update(rondaRef(roundId), { tieBreak: { tipo: "segunda_vuelta", siguienteRondaId: nuevoId, empatados: empatadosIds } });
  batch.set(doc(db, "config", "state"), { activeDirectivaId: r.directivaId, activeRoundId: nuevoId, updatedAt: serverTimestamp() }, { merge: true });
  auditar(batch, adminUid, "segunda_vuelta", { roundId, nuevoId, empatadosIds });
  await batch.commit();
  return nuevoId;
}

export async function repetirRonda(roundId, adminUid) {
  const rSnap = await getDoc(rondaRef(roundId));
  if (!rSnap.exists()) throw new Error("La ronda no existe.");
  const r = rSnap.data();

  if (r.status === "open") {
    await updateDoc(rondaRef(roundId), { status: "closed", closedAt: serverTimestamp() });
  }

  const votosBorrados = await borrarVotosDeRonda(roundId);

  const batch = writeBatch(db);
  batch.delete(doc(db, "tallies", roundId));
  batch.update(rondaRef(roundId), {
    status: "open",
    winnerId: null,
    tieBreak: null,
    closedAt: null,
    openedAt: serverTimestamp(),
  });
  batch.set(doc(db, "config", "state"), { activeDirectivaId: r.directivaId, activeRoundId: roundId, updatedAt: serverTimestamp() }, { merge: true });
  auditar(batch, adminUid, "repetir_ronda", { roundId, votosBorrados });
  await batch.commit();
}

export async function reabrirCargo(roundId, adminUid) {
  const rSnap = await getDoc(rondaRef(roundId));
  if (!rSnap.exists()) throw new Error("La ronda no existe.");
  const r = rSnap.data();
  const batch = writeBatch(db);
  batch.delete(doc(db, "tallies", roundId));
  batch.update(rondaRef(roundId), {
    status: "open",
    winnerId: null,
    coWinnerId: null,
    tieBreak: null,
    closedAt: null,
  });
  batch.set(doc(db, "config", "state"), {
    activeDirectivaId: r.directivaId,
    activeRoundId: roundId,
    directivaCompletada: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  auditar(batch, adminUid, "reabrir_cargo", { roundId });
  await batch.commit();
}

export async function reiniciarRonda(roundId, adminUid) {
  return repetirRonda(roundId, adminUid);
}

export async function reiniciarDirectiva(directivaId, adminUid) {
  const rondas = await rondasDeDirectiva(directivaId);
  await setDoc(doc(db, "config", "state"), { activeDirectivaId: directivaId, activeRoundId: null, updatedAt: serverTimestamp() }, { merge: true });
  for (const r of rondas) if (r.status === "open") await updateDoc(rondaRef(r.id), { status: "closed" });

  let votosBorrados = 0;
  for (const r of rondas) {
    votosBorrados += await borrarVotosDeRonda(r.id);
  }
  await borrarEnLotes([...rondas.map((r) => rondaRef(r.id)), ...rondas.map((r) => doc(db, "tallies", r.id))]);

  const b = writeBatch(db);
  auditar(b, adminUid, "reiniciar_directiva", { directivaId, rondasBorradas: rondas.length, votosBorrados });
  await b.commit();
  return activarDirectiva(directivaId, adminUid);
}
