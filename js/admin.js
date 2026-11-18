// admin.js — Monitoreo y control directo sin pestañas ni subida de JSONs.
import {
  db, doc, collection, onSnapshot,
} from "./firebase.js";
import { configPendiente } from "./firebase-config.js";
import { el, toast, confirmar, avisoConfig } from "./ui.js";
import { vigilarAdmin, entrarAdmin, salirAdmin } from "./admin-auth.js";
import { lideres, ordenarPorVotos, contarVotos } from "./logic.js";
import * as motor from "./round-engine.js";
import { DIRECTIVAS_FIJAS, CANDIDATOS_FIJOS } from "./candidatos-datos.js?v=2";

const $ = (id) => document.getElementById(id);
const A = {
  user: null, estado: null, ronda: null, votos: [],
  candidatos: CANDIDATOS_FIJOS,
  directivas: DIRECTIVAS_FIJAS,
  rondas: [], dirCands: null,
  unsub: {}, ocupado: false,
};

if (!avisoConfig(configPendiente)) {
  vigilarAdmin(entrar, salir);
}

$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-error").textContent = "";
  const err = await entrarAdmin($("correo").value.trim(), $("clave").value);
  if (err) $("login-error").textContent = err;
});

$("btn-salir").addEventListener("click", () => salirAdmin());

function salir(mensaje) {
  Object.values(A.unsub).forEach((f) => f?.());
  A.unsub = {}; A.user = null;
  $("panel").hidden = true; $("login").hidden = false;
  $("btn-salir").hidden = true; $("lnk-pantalla").hidden = true;
  $("login-error").textContent = mensaje || "";
}

async function entrar(user) {
  A.user = user;
  $("login").hidden = true; $("panel").hidden = false;
  $("btn-salir").hidden = false; $("lnk-pantalla").hidden = false;
  
  cargarSelectDirectivas();

  A.unsub.estado = onSnapshot(doc(db, "config", "state"), (s) => {
    A.estado = s.exists() ? s.data() : {};
    alCambiarEstado();
  }, console.error);
}

function cargarSelectDirectivas() {
  const sel = $("sel-directiva");
  sel.replaceChildren(...A.directivas.map((d) => el("option", { value: d.id }, d.nombre)));
  if (A.estado?.activeDirectivaId) sel.value = A.estado.activeDirectivaId;
}

function alCambiarEstado() {
  const dirId = A.estado?.activeDirectivaId || null;
  const rondaId = A.estado?.activeRoundId || null;
  if (dirId && $("sel-directiva").value !== dirId && A.directivas.some((d) => d.id === dirId)) {
    $("sel-directiva").value = dirId;
  }

  if (dirId !== A.dirCands) {
    A.dirCands = dirId;
    A.unsub.rondasDir?.();
    A.rondas = [];
    if (dirId) {
      A.unsub.rondasDir = onSnapshot(collection(db, "rounds"), () => {
        motor.rondasDeDirectiva(dirId).then((rnds) => {
          A.rondas = rnds;
          renderRondas();
        });
      }, console.error);
    }
  }

  if (rondaId !== A.rondaId) {
    A.unsub.ronda?.(); A.unsub.votos?.(); A.rondaId = rondaId; A.ronda = null; A.votos = []; A.tally = null; A.votosDe = null;
    if (rondaId) {
      A.unsub.ronda = onSnapshot(doc(db, "rounds", rondaId), (s) => {
        A.ronda = s.exists() ? { id: s.id, ...s.data() } : null;
        alCambiarRonda();
      }, console.error);
    }
  }
  renderVivo();
}

function alCambiarRonda() {
  const r = A.ronda;
  if (r && r.status !== "pending" && A.votosDe !== r.id) {
    A.votosDe = r.id;
    A.unsub.votos = onSnapshot(collection(db, "rounds", r.id, "votes"), (s) => {
      A.votos = s.docs.map((d) => ({ uid: d.id, ...d.data() }));
      renderVivo();
    }, console.error);
  }
  if (r && r.status === "pending") {
    A.unsub.votos?.();
    A.votos = [];
    A.votosDe = null;
  }
  renderVivo();
}

const nombreDe = (id) => {
  if (!id || id === "null" || id === "undefined") return "";
  return A.candidatos.find((c) => c.id === id)?.nombre || id;
};

function renderVivo() {
  const r = A.ronda;
  const dir = A.directivas.find((d) => d.id === A.estado?.activeDirectivaId);
  const nombreCargo = r?.cargoNombre && r.cargoNombre !== "null" ? r.cargoNombre : "Diácono";
  $("v-titulo").textContent = r ? `${dir?.nombre || ""}: ${nombreCargo}` : "Sin ronda activa";
  
  const est = $("v-estado");
  est.textContent = r ? ({ pending: "Pendiente", open: "Votación Abierta", closed: "Ronda Cerrada" }[r.status]) : "Inactivo";
  est.style.color = r?.status === "open" ? "var(--cyan)" : "var(--text-muted)";
  est.style.borderColor = r?.status === "open" ? "var(--cyan)" : "var(--border)";

  $("v-sub").textContent = r ? `Ronda ${r.numero || 1} · ${r.candidateIds?.length || 0} candidatos en lista` : (A.estado?.activeDirectivaId ? "Directiva completa o esperando inicio." : "Selecciona una directiva para iniciar.");

  const total = A.votos.length;
  $("v-total").textContent = total;

  pintarBarras();
  pintarAcciones();
}

function pintarBarras() {
  const cont = $("v-bars");
  const r = A.ronda;
  if (!r || !r.candidateIds?.length || r.status === "pending") {
    cont.replaceChildren();
    return;
  }
  const cands = r.candidateIds.map((id) => A.candidatos.find((c) => c.id === id) || { id, nombre: id, numero: 0 });
  const { counts, total } = contarVotos(A.votos, r.candidateIds);
  const orden = ordenarPorVotos(cands, counts);
  const max = Math.max(1, ...Object.values(counts));

  cont.replaceChildren(...orden.map((c, i) => {
    const votos = counts[c.id] || 0;
    const pct = total > 0 ? (votos / max) * 100 : 0;
    const isLeader = i === 0 && votos > 0;

    return el("div", { class: `bar-row ${isLeader ? "leader" : ""}` },
      el("div", { class: "bar-fill", style: `width: ${pct}%` }),
      el("div", { class: "bar-content" },
        el("div", { style: "display:flex; align-items:center; gap:10px;" },
          el("span", { style: "font-family:var(--font-mono); color:var(--cyan); font-weight:700; font-size:0.9rem;" }, `#${c.numero}`),
          el("strong", { style: "color:#FFF; font-size:0.95rem;" }, c.nombre)
        ),
        el("div", { class: "bar-votes" }, `${votos} ${votos === 1 ? "voto" : "votos"}`)
      )
    );
  }));
}

function pintarAcciones() {
  const r = A.ronda;
  const st = r?.status;
  $("btn-abrir").hidden = st !== "pending";
  $("btn-cerrar").hidden = st !== "open";
  $("btn-cerrar-dos").hidden = st !== "open";
  const sinConteo = st === "closed" && !r.winnerId && !r.tieBreak;
  const hayEmpate = Boolean(r?.tieBreak?.empatados?.length);

  $("btn-reintentar").hidden = !(sinConteo && !hayEmpate && !A.ocupado);
  $("btn-siguiente-ronda").hidden = !(st === "closed" && r.winnerId);
  $("btn-completar-directiva").hidden = !(st === "closed" && r.winnerId);
  $("btn-repetir-ronda").hidden = !(st === "open" || (st === "closed" && !r.winnerId));
  $("btn-reabrir-cargo").hidden = !(st === "closed" && r.winnerId);

  $("v-empate").hidden = !hayEmpate;
  if (hayEmpate) {
    const empatados = r.tieBreak.empatados;
    $("v-empate-txt").textContent = `Empatan: ${empatados.map(nombreDe).join(", ")}.`;
    const sel = $("desempate-ganador");
    const previo = sel.value;
    sel.replaceChildren(...empatados.map((id) => el("option", { value: id }, nombreDe(id))));
    if (empatados.includes(previo)) sel.value = previo;
    A.empateIds = empatados;
  }
  if (st === "closed" && r.winnerId && r.winnerId !== "null") {
    const tieneSegundo = r.coWinnerId && r.coWinnerId !== "null" && r.coWinnerId !== r.winnerId;
    const txtGanadores = tieneSegundo 
      ? `Ganadores Oficiales: ${nombreDe(r.winnerId)} y ${nombreDe(r.coWinnerId)}.`
      : `Ganador Oficial: ${nombreDe(r.winnerId)}${r.tieBreak?.tipo === "manual" ? " (por desempate manual)" : ""}.`;
    $("v-msg").textContent = txtGanadores;
  } else {
    $("v-msg").textContent = "";
  }
}

function renderRondas() {
  const tb = $("tabla-rondas");
  const orden = [...A.rondas].sort((a, b) => (a.numero || 0) - (b.numero || 0));
  tb.replaceChildren(...orden.map((r) => {
    const tieneSegundo = r.coWinnerId && r.coWinnerId !== "null" && r.coWinnerId !== r.winnerId;
    const gText = (r.winnerId && r.winnerId !== "null")
      ? (tieneSegundo ? `${nombreDe(r.winnerId)} + ${nombreDe(r.coWinnerId)}` : nombreDe(r.winnerId))
      : "—";

    return el("tr", {},
      el("td", {}, r.cargoNombre && r.cargoNombre !== "null" ? r.cargoNombre : "Diácono"),
      el("td", {}, `Ronda ${r.numero || 1}`),
      el("td", {}, { pending: "Pendiente", open: "Abierta", closed: "Cerrada" }[r.status]),
      el("td", { style: "color:var(--cyan); font-weight:700;" }, gText),
      el("td", {}, r.status !== "pending"
        ? el("button", { class: "btn btn-danger", style: "height:30px; padding:0 10px; font-size:0.75rem;", type: "button", onclick: () => reiniciarRonda(r) }, "Reiniciar") : "")
    );
  }));
}

async function ejecutar(boton, fn, okMsg) {
  if (A.ocupado) return;
  A.ocupado = true;
  boton && (boton.disabled = true);
  try {
    const res = await fn();
    if (okMsg) toast(okMsg, "ok");
    return res;
  } catch (e) {
    console.error(e);
    toast(e.message || "Error al ejecutar.", "error");
  } finally {
    A.ocupado = false;
    boton && (boton.disabled = false);
    renderVivo();
  }
}

$("btn-activar").addEventListener("click", () => {
  const id = $("sel-directiva").value;
  if (!id) return;
  if (A.ronda?.status === "open" && id !== A.estado?.activeDirectivaId) {
    return toast("Cierra la ronda abierta antes de cambiar de directiva.", "error");
  }
  ejecutar($("btn-activar"), () => motor.activarDirectiva(id, A.user.uid), "Directiva activada");
});

$("btn-abrir").addEventListener("click", () =>
  ejecutar($("btn-abrir"), () => motor.abrirRonda(A.ronda.id, A.user.uid), "Votación abierta")
);

$("btn-cerrar").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Cerrar votación",
    texto: `Se cerrará la ronda de ${A.ronda.cargoNombre} y se declarará al ganador con más votos.`,
    si: "Sí, cerrar y computar",
    no: "Cancelar",
  });
  if (!ok) return;
  ejecutar($("btn-cerrar"), async () => {
    const res = await motor.cerrarRonda(A.ronda.id, A.user.uid);
    if (res.empate) {
      toast("Hay un empate: elige cómo resolverlo.", "info");
      return;
    }
    toast(`Ganador declarado: ${nombreDe(res.ganadorId)}`, "ok");
  });
});

// Botón para elegir dos ganadores
$("btn-cerrar-dos").addEventListener("click", () => {
  const box = $("box-segundo-ganador");
  const sel = $("sel-segundo-ganador");
  const candIds = A.ronda?.candidateIds || [];
  
  // Ordenamos por votos para sugerir el segundo lugar
  const { counts } = contarVotos(A.votos, candIds);
  const ordenados = [...candIds].sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

  sel.replaceChildren(...ordenados.map((id) => {
    const c = A.candidatos.find((x) => x.id === id);
    return el("option", { value: id }, `${c ? c.nombre : id} (#${c ? c.numero : "?"}) — ${counts[id] || 0} votos`);
  }));
  
  if (ordenados.length > 1) {
    sel.selectedIndex = 1; // Seleccionar por defecto el 2do más votado
  }

  box.style.display = "block";
});

$("btn-cancelar-dos").addEventListener("click", () => {
  $("box-segundo-ganador").style.display = "none";
});

$("btn-confirmar-dos").addEventListener("click", async () => {
  const segundoId = $("sel-segundo-ganador").value;
  if (!segundoId) return toast("Selecciona el segundo ganador.", "error");

  const ok = await confirmar({
    titulo: "Proclamar 2 Ganadores",
    texto: `Se cerrará la ronda eligiendo al 1.er lugar y además proclamando a ${nombreDe(segundoId)}. Ambos saldrán en pantalla. ¿Confirmar?`,
    si: "Sí, proclamar ambos",
    no: "Cancelar",
  });
  if (!ok) return;

  $("box-segundo-ganador").style.display = "none";

  ejecutar($("btn-cerrar-dos"), async () => {
    const res = await motor.cerrarRonda(A.ronda.id, A.user.uid, segundoId);
    const tieneSegundo = res.segundoGanadorId && res.segundoGanadorId !== "null";
    const msg = tieneSegundo 
      ? `Proclamados: ${nombreDe(res.ganadorId)} y ${nombreDe(res.segundoGanadorId)}`
      : `Ganador declarado: ${nombreDe(res.ganadorId)}`;
    toast(msg, "ok");
  });
});

$("btn-reintentar").addEventListener("click", () => ejecutar($("btn-reintentar"), async () => {
  const res = await motor.contarYDeclarar(A.ronda.id, A.user.uid);
  if (res.empate) {
    toast("Hay un empate: elige cómo resolverlo.", "info");
    return;
  }
  toast(`Ganador declarado: ${nombreDe(res.ganadorId)}`, "ok");
}));

$("btn-siguiente-ronda").addEventListener("click", () => ejecutar($("btn-siguiente-ronda"), async () => {
  await motor.siguienteRonda(A.estado.activeDirectivaId, A.user.uid);
  toast("Nueva ronda lista. Puedes abrir la votación cuando estés listo.", "ok");
}));

$("btn-completar-directiva").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Completar Directiva",
    texto: "¿Deseas formalizar y marcar esta directiva como completada?",
    si: "Sí, completar directiva",
    no: "Cancelar",
  });
  if (!ok) return;
  ejecutar($("btn-completar-directiva"), async () => {
    await motor.completarDirectiva(A.estado.activeDirectivaId, A.user.uid);
    toast("¡Directiva completada con éxito!", "ok");
  });
});

$("btn-repetir-ronda").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Reiniciar ronda",
    texto: `Se borrarán todos los votos de "${A.ronda.cargoNombre}" y se reabrirá la votación para todos.`,
    si: "Sí, reiniciar",
    no: "Cancelar",
  });
  if (ok) ejecutar($("btn-repetir-ronda"), () => motor.repetirRonda(A.ronda.id, A.user.uid), "Ronda reiniciada");
});

$("btn-reabrir-cargo").addEventListener("click", async () => {
  const r = A.ronda;
  if (!(await pedirReiniciar("Reabrir cargo", `Se revertirá al ganador de "${r.cargoNombre}" y se creará una nueva ronda para elegir nuevamente.`))) return;
  ejecutar($("btn-reabrir-cargo"), () => motor.reabrirCargo(r.id, A.user.uid), "Cargo reabierto");
});

$("btn-segunda").addEventListener("click", async () => {
  const ok = await confirmar({
    titulo: "Segunda vuelta",
    texto: "Se abrirá una nueva ronda exclusivamente entre los candidatos empatados.",
    si: "Crear segunda vuelta",
    no: "Cancelar",
  });
  if (ok) ejecutar($("btn-segunda"), () => motor.segundaVuelta(A.ronda.id, A.empateIds, A.user.uid), "Segunda vuelta lista");
});

$("btn-desempate").addEventListener("click", async () => {
  const motivo = $("desempate-motivo").value.trim();
  if (motivo.length < 5) return toast("Escribe el motivo del desempate.", "error");
  const ganador = $("desempate-ganador").value;
  const ok = await confirmar({
    titulo: "Confirmar desempate",
    texto: `Declarar ganador a ${nombreDe(ganador)}.`,
    si: "Confirmar",
    no: "Cancelar",
  });
  if (!ok) return;
  ejecutar($("btn-desempate"), async () => {
    await motor.desempateManual(A.ronda.id, ganador, motivo, A.user.uid);
    $("desempate-motivo").value = "";
  }, "Ganador declarado");
});

async function pedirReiniciar(titulo, texto) {
  const campo = el("input", { type: "text", autocomplete: "off", placeholder: "REINICIAR" });
  return confirmar({
    titulo, texto, si: "Confirmar", no: "Cancelar",
    contenido: el("div", { style: "margin: 14px 0;" }, el("label", { style: "font-size:0.85rem; color:var(--text-muted); display:block; margin-bottom:6px;" }, "Escribe REINICIAR para confirmar"), campo),
    validar: () => {
      if (campo.value.trim() === "REINICIAR") return true;
      toast("Debes escribir REINICIAR", "error");
      return false;
    },
  });
}

async function reiniciarRonda(r) {
  if (!(await pedirReiniciar("Reiniciar ronda", `Se borrarán los votos de “${r.cargoNombre}” y se reabrirá.`))) return;
  ejecutar(null, () => motor.reiniciarRonda(r.id, A.user.uid), "Ronda reiniciada");
}

$("btn-reiniciar-directiva").addEventListener("click", async () => {
  const id = A.estado?.activeDirectivaId;
  if (!id) return toast("No hay directiva activa.", "error");
  if (!(await pedirReiniciar("Restablecer directiva", "Se borrarán todas las rondas y votos de esta directiva."))) return;
  ejecutar($("btn-reiniciar-directiva"), () => motor.reiniciarDirectiva(id, A.user.uid), "Directiva restablecida");
});
