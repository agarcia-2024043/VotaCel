// ui.js — Utilidades de interfaz compartidas: toasts, modales accesibles, reveal, tarjetas de candidato.
import { iniciales, colorParaNombre } from "./logic.js";

/** Crea un elemento: el("div", {class:"x", onclick:fn}, hijos…) */
export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const h of hijos.flat()) if (h != null && h !== false) n.append(h.nodeType ? h : document.createTextNode(h));
  return n;
}

/** Texto en una región aria-live (lectores de pantalla). */
export function anunciar(texto) {
  let r = document.getElementById("live-region");
  if (!r) {
    r = el("div", { id: "live-region", class: "sr-only", "aria-live": "polite", role: "status" });
    document.body.append(r);
  }
  r.textContent = "";
  setTimeout(() => (r.textContent = texto), 50);
}

/** Aviso temporal. tipo: "ok" | "error" | "info" */
export function toast(texto, tipo = "info", ms = 4000) {
  let c = document.getElementById("toasts");
  if (!c) {
    c = el("div", { id: "toasts", class: "toasts", "aria-live": "polite" });
    document.body.append(c);
  }
  const t = el("div", { class: `toast toast--${tipo}`, role: tipo === "error" ? "alert" : "status" }, texto);
  c.append(t);
  setTimeout(() => t.remove(), ms);
}

/**
 * Ventana de confirmación basada en <dialog> (foco atrapado y Esc nativos).
 * opciones: {titulo, texto, si, no, peligro, contenido(nodo), validar()→bool}
 * Devuelve Promise<boolean>.
 */
export function confirmar({ titulo, texto, si = "Aceptar", no = "Cancelar", peligro = false, contenido = null, validar = null }) {
  return new Promise((resolve) => {
    const dlg = el("dialog", { class: "modal", "aria-labelledby": "modal-titulo" });
    const bSi = el("button", { class: `btn ${peligro ? "btn--alert" : "btn--gold"}`, type: "button" }, si);
    const bNo = el("button", { class: "btn btn--ghost", type: "button" }, no);
    dlg.append(
      el("h2", { id: "modal-titulo", class: "modal__title" }, titulo),
      texto ? el("p", { class: "modal__text" }, texto) : null,
      contenido,
      el("div", { class: "modal__actions" }, bNo, bSi)
    );
    const cerrar = (v) => { dlg.close(); dlg.remove(); resolve(v); };
    bSi.addEventListener("click", () => { if (!validar || validar()) cerrar(true); });
    bNo.addEventListener("click", () => cerrar(false));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(false); });
    document.body.append(dlg);
    dlg.showModal();
    bNo.focus();
  });
}

/** Animación .reveal al entrar en pantalla (IntersectionObserver). */
let observador;
export function revelar(raiz = document) {
  if (!("IntersectionObserver" in window)) {
    raiz.querySelectorAll(".reveal").forEach((n) => n.classList.add("is-in"));
    return;
  }
  observador ||= new IntersectionObserver((entradas) => {
    for (const e of entradas) if (e.isIntersecting) { e.target.classList.add("is-in"); observador.unobserve(e.target); }
  }, { threshold: 0.12 });
  raiz.querySelectorAll(".reveal:not(.is-in)").forEach((n) => observador.observe(n));
}

/** Contenedor de foto con respaldo: si falta o falla, muestra las iniciales sobre un color. */
export function fotoSlot(c, clase = "") {
  const slot = el("div", { class: `image-slot ${clase}`, style: `--slot-bg:${colorParaNombre(c.nombre)}` });
  const ini = el("span", { class: "image-slot__ini", "aria-hidden": "true" }, iniciales(c.nombre));
  slot.append(ini);
  if (c.foto) {
    const img = el("img", { src: c.foto, alt: `Foto de ${c.nombre}`, loading: "lazy", width: "400", height: "400" });
    img.addEventListener("error", () => img.remove());
    slot.append(img);
  }
  return slot;
}

/** Muestra un aviso fijo si firebase-config.js aún tiene placeholders. */
export function avisoConfig(pendiente) {
  if (!pendiente) return false;
  document.body.prepend(el("div", { class: "banner banner--alert", role: "alert" },
    "Falta configurar Firebase: edita js/firebase-config.js con los datos de tu proyecto (ver README)."));
  return true;
}

export const fmtHora = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("es") : "—");

