// pantalla.js — Proyector Dark Mode SaaS Premium (solo lectura).
import { db, doc, collection, onSnapshot } from "./firebase.js";
import { configPendiente } from "./firebase-config.js";
import { el, fotoSlot, avisoConfig } from "./ui.js";
import { vigilarAdmin } from "./admin-auth.js";
import { contarVotos, lideres } from "./logic.js";
import { DIRECTIVAS_FIJAS, CANDIDATOS_FIJOS } from "./candidatos-datos.js?v=2";

const $ = (id) => document.getElementById(id);
const P = {
  estado: null,
  ronda: null,
  votos: [],
  candidatos: CANDIDATOS_FIJOS,
  unsub: {},
  rondaId: null,
  dirId: null,
  votosDe: null,
};

if (!avisoConfig(configPendiente)) {
  vigilarAdmin(entrar, () => {
    $("p-login").hidden = false;
    $("p-main").hidden = true;
    $("p-volver").hidden = true;
  });
}

function entrar() {
  $("p-login").hidden = true;
  $("p-main").hidden = false;
  $("p-volver").hidden = false;
  P.unsub.estado ||= onSnapshot(doc(db, "config", "state"), (s) => {
    P.estado = s.exists() ? s.data() : {};
    cambioEstado();
  }, console.error);
}

function cambioEstado() {
  const dirId = P.estado?.activeDirectivaId || null;
  const rondaId = P.estado?.activeRoundId || null;

  P.dirId = dirId;

  if (rondaId !== P.rondaId) {
    P.unsub.ronda?.();
    P.unsub.votos?.();
    P.rondaId = rondaId;
    P.ronda = null;
    P.votos = [];
    P.votosDe = null;

    if (rondaId) {
      P.unsub.ronda = onSnapshot(doc(db, "rounds", rondaId), (s) => {
        P.ronda = s.exists() ? { id: s.id, ...s.data() } : null;
        cambioRonda();
      }, console.error);
    }
  }
  render();
}

function cambioRonda() {
  const r = P.ronda;
  if (r && r.status !== "pending" && P.votosDe !== r.id) {
    P.votosDe = r.id;
    P.unsub.votos = onSnapshot(collection(db, "rounds", r.id, "votes"), (s) => {
      P.votos = s.docs.map((d) => d.data());
      render();
    }, console.error);
  }
  render();
}

function render() {
  if ($("p-main").hidden) return;
  const cuerpo = $("p-cuerpo");
  const dir = DIRECTIVAS_FIJAS.find((d) => d.id === P.dirId);
  $("p-directiva").textContent = dir ? `Elección de ${dir.nombre}` : "Elección en Vivo";

  const r = P.ronda;

  // 1. Si la directiva se marcó como completada
  if (P.estado?.directivaCompletada && !P.rondaId) {
    $("p-cargo").textContent = dir?.nombre || "Directiva";
    cuerpo.replaceChildren(
      el("div", { class: "badge-tag", style: "background:rgba(0,229,255,0.2); border-color:var(--cyan); color:var(--cyan); font-size:1.2rem; padding:10px 28px; margin-bottom:14px;" },
        "¡Directiva Completada!"
      ),
      el("div", { style: "font-size:clamp(1.8rem, 4vw, 3rem); font-weight:800; color:#FFF; margin-top:16px;" },
        "Elección finalizada con éxito"
      ),
      el("p", { style: "color:var(--text-muted); font-size:1.15rem; margin-top:10px;" },
        "Todos los cargos han sido formalmente electos."
      )
    );
    return;
  }

  // 2. Si no hay ronda activa
  if (!r) {
    $("p-cargo").textContent = "Esperando Inicio";
    cuerpo.replaceChildren(
      el("div", { style: "color:var(--text-muted); font-size:1.4rem; margin-top:20px;" },
        "Seleccione una directiva en la consola para comenzar."
      )
    );
    return;
  }

  // 3. SI LA RONDA ESTÁ CERRADA Y TIENE GANADOR(ES) -> SE QUEDA EN PANTALLA FIJO SIN TEMPORIZADOR
  if (r.status === "closed" && r.winnerId && r.winnerId !== "null") {
    const c1 = P.candidatos.find((x) => x.id === r.winnerId);
    const tieneSegundo = r.coWinnerId && r.coWinnerId !== "null" && r.coWinnerId !== r.winnerId;
    const c2 = tieneSegundo ? P.candidatos.find((x) => x.id === r.coWinnerId) : null;

    const nombreCargo = r.cargoNombre && r.cargoNombre !== "null" ? r.cargoNombre : (dir?.cargos?.[0]?.nombre || "Diácono");
    $("p-cargo").textContent = nombreCargo;

    const cardsGanadores = [];

    // Tarjeta Ganador 1
    if (c1) {
      cardsGanadores.push(el("div", { style: "display:flex; flex-direction:column; align-items:center; gap:14px; min-width:260px;" },
        el("div", { style: "width:min(320px, 40vw); aspect-ratio:1/1; border:3px solid var(--cyan); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--cyan-glow);" },
          fotoSlot(c1)
        ),
        el("div", { class: "proj-leader-name", style: "font-size:clamp(1.8rem, 4vw, 3.2rem);" }, c1.nombre),
        c1.numero ? el("div", { style: "font-family:var(--font-mono); color:var(--cyan); font-size:1.4rem; font-weight:700;" }, `#${c1.numero}`) : ""
      ));
    }

    // Tarjeta Ganador 2 (si fue seleccionado)
    if (c2) {
      cardsGanadores.push(el("div", { style: "display:flex; flex-direction:column; align-items:center; gap:14px; min-width:260px;" },
        el("div", { style: "width:min(320px, 40vw); aspect-ratio:1/1; border:3px solid var(--cyan); border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--cyan-glow);" },
          fotoSlot(c2)
        ),
        el("div", { class: "proj-leader-name", style: "font-size:clamp(1.8rem, 4vw, 3.2rem);" }, c2.nombre),
        c2.numero ? el("div", { style: "font-family:var(--font-mono); color:var(--cyan); font-size:1.4rem; font-weight:700;" }, `#${c2.numero}`) : ""
      ));
    }

    cuerpo.replaceChildren(
      el("div", { class: "badge-tag", style: "background:rgba(0,229,255,0.2); border-color:var(--cyan); color:var(--cyan); font-size:1.1rem; padding:8px 24px; margin-bottom:12px;" },
        c2 ? `¡${nombreCargo}s Electos!` : `¡${nombreCargo} Electo!`
      ),
      el("div", { style: "display:flex; justify-content:center; gap:clamp(20px, 6vw, 60px); flex-wrap:wrap; margin-top:14px;" },
        ...cardsGanadores
      )
    );
    return;
  }

  // 4. Si la ronda está pendiente (aún no se ha abierto para votar)
  if (r.status === "pending") {
    const nombreCargo = r.cargoNombre && r.cargoNombre !== "null" ? r.cargoNombre : (dir?.cargos?.[0]?.nombre || "Diácono");
    $("p-cargo").textContent = `${nombreCargo} (Ronda ${r.numero || 1})`;
    cuerpo.replaceChildren(
      el("div", { class: "badge-tag", style: "font-size:1rem; padding:6px 18px;" }, "Próxima Votación"),
      el("div", { style: "color:var(--text-muted); font-size:1.5rem; margin-top:20px; font-weight:600;" },
        "La votación se abrirá en unos momentos..."
      ),
      el("div", { style: "font-family:var(--font-mono); color:var(--cyan); font-size:1.1rem; margin-top:12px;" },
        `${r.candidateIds?.length || 0} candidatos en lista`
      )
    );
    return;
  }

  // 5. Si la votación está abierta en curso
  if (r.status === "open") {
    const nombreCargo = r.cargoNombre && r.cargoNombre !== "null" ? r.cargoNombre : (dir?.cargos?.[0]?.nombre || "Diácono");
    $("p-cargo").textContent = `${nombreCargo} (Ronda ${r.numero || 1})`;
    const { counts, total } = contarVotos(P.votos, r.candidateIds || []);
    const lid = lideres(counts);
    const lider = P.candidatos.find((c) => c.id === lid.ids[0]);
    const nombreLider = total === 0 ? "Aún sin votos" : lid.empate ? "Empate Técnico" : `${lider?.nombre || ""} (#${lider?.numero || 0})`;

    cuerpo.replaceChildren(
      el("div", { class: "badge-tag", style: "background:rgba(0,229,255,0.15); border-color:var(--cyan); color:var(--cyan); font-size:1rem; padding:6px 20px;" },
        "Votación en Curso"
      ),
      el("div", { class: "proj-big-num" }, String(total)),
      el("div", { style: "font-family:var(--font-mono); font-size:1.15rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--text-dim); margin-bottom:12px;" },
        total === 1 ? "Voto Registrado" : "Votos Registrados"
      ),
      el("div", { class: "proj-leader-name", style: "font-size:clamp(1.4rem, 3.5vw, 2.4rem); color:var(--text-muted);" },
        total === 0 ? "Esperando participación..." : `Al frente: ${nombreLider}`
      )
    );
    return;
  }

  // 6. Ronda cerrada sin ganador aún definido
  $("p-cargo").textContent = `${r.cargoNombre} (Ronda ${r.numero})`;
  cuerpo.replaceChildren(
    el("div", { class: "badge-tag" }, "Votación Cerrada"),
    el("div", { style: "color:var(--text-muted); font-size:1.4rem; margin-top:20px;" }, "Computando resultados...")
  );
}
