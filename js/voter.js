// voter.js — 100% Anónimo. Candidatos fijos en código.
import {
  auth, db, signInAnonymously, onAuthStateChanged, doc, getDoc,
  onSnapshot, setDoc, serverTimestamp,
} from "./firebase.js";
import { configPendiente } from "./firebase-config.js";
import { el, toast, confirmar, fotoSlot, avisoConfig } from "./ui.js";
import { esperaCreciente } from "./logic.js";
import { DIRECTIVAS_FIJAS, CANDIDATOS_FIJOS } from "./candidatos-datos.js?v=2";

const $ = (id) => document.getElementById(id);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const S = {
  uid: null,
  estado: null,
  ronda: null,
  directiva: null,
  candidatos: new Map(CANDIDATOS_FIJOS.map((c) => [c.id, { ...c }])),
  votoDe: {},          // roundId -> boolean
  votoRevisado: null,
  seleccion: null,
  enviando: false,
  gridRonda: null,
  unsubRonda: null,
  rondaId: null,
  directivaId: null,
};

async function asegurarSesion() {
  const previo = await new Promise((res) => {
    const off = onAuthStateChanged(auth, (u) => { off(); res(u); });
  });
  if (previo) return previo.uid;

  for (let intento = 0; ; intento++) {
    try {
      const cred = await signInAnonymously(auth);
      return cred.user.uid;
    } catch (e) {
      console.warn("Reintentando sesión...", e);
      await dormir(esperaCreciente(intento));
    }
  }
}

function iniciarEscuchas() {
  onSnapshot(doc(db, "config", "state"), (snap) => {
    S.estado = snap.exists() ? snap.data() : {};
    alCambiarEstado();
  }, (e) => console.error("Error escuchando estado:", e));
}

async function alCambiarEstado() {
  const dirId = S.estado?.activeDirectivaId || null;
  const rondaId = S.estado?.activeRoundId || null;

  if (dirId !== S.directivaId) {
    S.directivaId = dirId;
    S.directiva = DIRECTIVAS_FIJAS.find((d) => d.id === dirId) || null;
  }

  if (rondaId !== S.rondaId) {
    S.unsubRonda?.();
    S.rondaId = rondaId;
    S.ronda = null;
    S.seleccion = null;
    S.gridRonda = null;

    if (rondaId) {
      S.unsubRonda = onSnapshot(doc(db, "rounds", rondaId), (snap) => {
        S.ronda = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        comprobarVoto();
        render();
      }, (e) => console.error(e));
    }
  }
  render();
}

async function comprobarVoto() {
  const r = S.ronda;
  if (!r || r.status !== "open" || S.votoRevisado === r.id || S.votoDe[r.id] !== undefined) return;
  if (!S.uid) return;
  S.votoRevisado = r.id;

  try {
    const vSnap = await getDoc(doc(db, "rounds", r.id, "votes", S.uid));
    S.votoDe[r.id] = vSnap.exists();
  } catch (e) {
    console.error("Error al comprobar voto:", e);
    // Si no hay permiso o falla, no bloqueamos falsamente la UI
    S.votoDe[r.id] = false;
  }
  render();
}

function mostrar(id) {
  for (const s of ["s-espera", "s-votar", "s-registrado"]) {
    $(s).hidden = s !== id;
  }
}

function render() {
  const r = S.ronda;
  if (r && r.status === "open") {
    const voto = S.votoDe[r.id];
    if (voto === true) {
      mostrar("s-registrado");
      return;
    }
    pintarVotar();
    return;
  }
  pintarEspera();
}

function pintarEspera(mensajeFijo) {
  const r = S.ronda;
  const nombreDirectiva = S.directiva?.nombre || "Votación";
  $("espera-directiva").textContent = nombreDirectiva;
  const nombreCargo = (r?.cargoNombre && r.cargoNombre !== "null") ? r.cargoNombre : (S.directiva?.cargos?.[0]?.nombre || "Diácono");
  
  let msg = mensajeFijo;
  if (!msg || msg === "null") {
    if (!S.estado?.activeDirectivaId) msg = "La votación comenzará en unos momentos.";
    else if (!r) msg = S.estado?.directivaCompletada ? "Directiva completa. ¡Gracias por participar!" : "Esperando inicio de la siguiente elección...";
    else if (r.status === "closed") msg = "Ronda cerrada. Esperando la siguiente votación...";
    else msg = `Siguiente cargo: ${nombreCargo}. Se abrirá en breve.`;
  }
  $("espera-mensaje").textContent = msg;
  mostrar("s-espera");
}

const SVG_CHECK = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function pintarVotar() {
  const r = S.ronda;
  const nombreDirectiva = S.directiva?.nombre || "Directiva";
  const nombreCargo = (r?.cargoNombre && r.cargoNombre !== "null") ? r.cargoNombre : (S.directiva?.cargos?.[0]?.nombre || "Diácono");
  $("votar-directiva").textContent = nombreDirectiva;
  $("votar-cargo").textContent = nombreCargo;

  if (S.gridRonda !== r.id) {
    S.gridRonda = r.id;
    S.seleccion = null;

    const dirActual = r.directivaId || S.directivaId;
    let listaIds = (r.candidateIds && r.candidateIds.length) ? r.candidateIds : [];
    
    // Validamos que los IDs correspondan a la directiva activa
    const idsValidos = new Set(CANDIDATOS_FIJOS.filter((c) => c.directivaId === dirActual).map((c) => c.id));
    let lista = listaIds
      .filter((id) => idsValidos.has(id))
      .map((id) => S.candidatos.get(id))
      .filter(Boolean);

    // Si por alguna razón la lista quedó vacía o incompleta por datos antiguos de Firestore,
    // cargamos directamente todos los candidatos disponibles de esta directiva
    if (!lista.length) {
      lista = CANDIDATOS_FIJOS.filter((c) => c.directivaId === dirActual);
    }
    lista.sort((a, b) => a.numero - b.numero);

    $("grid").replaceChildren(...lista.map((c) => {
      const b = el("button", {
        class: "card",
        type: "button",
        "aria-pressed": "false",
        "data-id": c.id,
        onclick: () => seleccionar(c.id),
      },
        el("span", { class: "card-num" }, `#${c.numero}`),
        Object.assign(el("span", { class: "card-check" }), { innerHTML: SVG_CHECK }),
        fotoSlot(c),
        el("div", { class: "card-info" },
          el("div", { class: "card-name" }, c.nombre),
          el("div", { class: "card-tag" }, `Candidato #${c.numero}`)
        )
      );
      return el("li", {}, b);
    }));
    actualizarBarra();
  }
  mostrar("s-votar");
}

function seleccionar(id) {
  S.seleccion = id;
  document.querySelectorAll("#grid .card").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
  actualizarBarra();
}

function actualizarBarra() {
  const c = S.candidatos.get(S.seleccion);
  const t = $("votebar-text");
  t.replaceChildren(...(c ? ["Seleccionado: ", el("strong", {}, `${c.nombre} (#${c.numero})`)] : ["Selecciona un candidato"]));
  $("btn-votar").disabled = !c || S.enviando;
}

$("btn-votar").addEventListener("click", async () => {
  const c = S.candidatos.get(S.seleccion);
  if (!c || S.enviando) return;
  const si = await confirmar({
    titulo: "Confirmar voto",
    texto: `¿Confirmas tu voto por ${c.nombre} (#${c.numero})? Solo podrás votar una vez.`,
    si: "Sí, emitir voto",
    no: "Cancelar",
  });
  if (si) enviarVoto(c);
});

async function enviarVoto(c) {
  const ronda = S.ronda;
  if (!ronda || ronda.status !== "open" || !S.uid) return;
  S.enviando = true;
  const btn = $("btn-votar");
  btn.disabled = true;
  btn.textContent = "Emitiendo...";

  try {
    await setDoc(doc(db, "rounds", ronda.id, "votes", S.uid), {
      candidateId: c.id,
      createdAt: serverTimestamp(),
    });
    S.votoDe[ronda.id] = true;
    toast("Tu voto ha sido registrado correctamente", "ok");
    render();
  } catch (e) {
    console.error("Error al votar:", e);
    if (e.code === "permission-denied") {
      S.votoDe[ronda.id] = true;
      toast("Tu voto ya había sido registrado para esta ronda.", "ok");
      render();
    } else {
      toast("Error de conexión. Intenta nuevamente.", "error");
    }
  } finally {
    S.enviando = false;
    btn.textContent = "Votar Ahora";
    actualizarBarra();
  }
}

if (!avisoConfig(configPendiente)) {
  asegurarSesion().then((uid) => {
    S.uid = uid;
    iniciarEscuchas();
  });
}
render();
