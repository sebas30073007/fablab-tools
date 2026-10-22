// ui.js - utilidades de interfaz: DOM, hojas que suben desde abajo, asistentes, jog compacto.
// Compartido por las apps del Fab Lab; cada app crea su `ls` con su prefijo (crearLs).
//
// Las hojas viven dentro del panel (#hojas), no en toda la ventana: el 3D sigue a la vista.
// Accesibilidad: role="dialog" + aria-modal, el foco entra a la hoja y no se escapa con Tab,
// y al cerrar regresa a donde estaba. Esc lo maneja main.js (PARO tiene prioridad).

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const ico = (id, extra = "") => `<svg class="ico ${extra}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
export const mm = (v, d = 3) => (v == null || !isFinite(v) ? "—" : (Math.abs(v) < 0.0005 ? 0 : v).toFixed(d));
const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// Guardado local de cada app: crearLs("fablab.cnc.") / crearLs("fablab.laser.")
export const crearLs = (prefijo) => ({
  get(k, def) { try { const v = localStorage.getItem(prefijo + k); return v == null ? def : JSON.parse(v); } catch (_) { return def; } },
  set(k, v) { try { localStorage.setItem(prefijo + k, JSON.stringify(v)); } catch (_) {} },
});

export function descargar(nombre, contenido, tipo = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo }));
  a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Anuncio para lectores de pantalla (región aria-live del panel)
export function anunciar(txt) {
  const el = $("#anuncio"); if (!el) return;
  el.textContent = ""; setTimeout(() => (el.textContent = txt), 30);
}

// ---------------- Hojas ----------------
const pila = [];
export const hojaAbierta = () => pila.length > 0;
export function cerrarHojaSuperior() { pila[pila.length - 1]?.cerrar(false); }

// Abre una hoja. contenido(el, h) pinta dentro; h.cerrar(valor) la cierra y resuelve la promesa.
export function hoja({ titulo, meta = "", contenido, alto = null }) {
  const cont = $("#hojas");
  const previo = document.activeElement;
  const id = "h" + Math.random().toString(36).slice(2, 8);
  const capa = document.createElement("div");
  capa.className = "hoja-capa";
  capa.innerHTML = `
    <div class="hoja-velo" data-cerrar></div>
    <section class="hoja" role="dialog" aria-modal="true" aria-labelledby="${id}" ${alto ? `style="height:${alto}"` : ""}>
      <header class="hoja__cab">
        <h2 id="${id}">${esc(titulo)}</h2>
        <span class="hoja__meta" data-meta>${esc(meta)}</span>
        <button type="button" class="btn-icono" data-cerrar aria-label="Close">${ico("x")}</button>
      </header>
      <div class="hoja__cuerpo"></div>
    </section>`;
  cont.appendChild(capa);
  document.body.classList.add("con-hoja");
  let resolver, limpiezas = [];
  const promesa = new Promise((r) => (resolver = r));
  const h = {
    el: capa.querySelector(".hoja"),
    cuerpo: capa.querySelector(".hoja__cuerpo"),
    meta: (t) => (capa.querySelector("[data-meta]").textContent = t),
    titulo: (t) => (capa.querySelector(`#${id}`).textContent = t),
    alLimpiar: (f) => limpiezas.push(f),
    cerrado: false,
    cerrar(v) {
      if (h.cerrado) return; h.cerrado = true;
      limpiezas.forEach((f) => f()); limpiezas = [];
      pila.splice(pila.indexOf(h), 1);
      capa.classList.remove("abierta");
      const fin = () => { capa.remove(); if (!pila.length) document.body.classList.remove("con-hoja"); };
      if (reducido()) fin(); else setTimeout(fin, 280);
      if (previo && document.contains(previo)) previo.focus({ preventScroll: true });
      resolver(v);
    },
  };
  capa.querySelectorAll("[data-cerrar]").forEach((b) => (b.onclick = () => h.cerrar(false)));
  // El foco no sale de la hoja
  capa.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = $$('button:not([disabled]), input:not([disabled]), select, [href], [tabindex="0"]', h.el).filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  pila.push(h);
  contenido(h.cuerpo, h);
  requestAnimationFrame(() => {
    capa.classList.add("abierta");
    const primero = h.cuerpo.querySelector("[data-foco]") || h.cuerpo.querySelector("button:not([disabled]), input") || h.el.querySelector("[data-cerrar].btn-icono");
    primero?.focus({ preventScroll: true });
  });
  return { promesa, h };
}

// ---------------- Ventana centrada (sobre toda la app) ----------------
// Para lo que no es de la máquina: el tutorial y el manual. Mismo trato que la hoja:
// role="dialog" + aria-modal, foco atrapado y de regreso al cerrar.
const pilaD = [];
export const dialogoAbierto = () => pilaD.length > 0;
export function cerrarDialogoSuperior() { pilaD[pilaD.length - 1]?.cerrar(false); }

export function dialogo({ titulo, meta = "", clase = "", contenido }) {
  const previo = document.activeElement;
  const id = "d" + Math.random().toString(36).slice(2, 8);
  const capa = document.createElement("div");
  capa.className = "dlg-capa";
  capa.innerHTML = `
    <div class="dlg-velo" data-cerrar></div>
    <section class="dlg ${clase}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <header class="dlg__cab">
        <button type="button" class="btn-atras" data-atras hidden aria-label="Back">${ico("atras")}</button>
        <h2 id="${id}" tabindex="-1"></h2><span class="dlg__meta" data-meta></span>
        <span class="dlg__acc"><span data-extra></span><button type="button" class="btn-icono" data-cerrar aria-label="Close">${ico("x")}</button></span>
      </header>
      <div class="dlg__cuerpo"></div>
    </section>`;
  document.body.appendChild(capa);
  let resolver;
  const promesa = new Promise((r) => (resolver = r));
  const d = {
    el: capa.querySelector(".dlg"),
    cuerpo: capa.querySelector(".dlg__cuerpo"),
    extra: capa.querySelector("[data-extra]"),
    titulo(t) { capa.querySelector(`#${id}`).textContent = t; },
    meta(t) { capa.querySelector("[data-meta]").textContent = t; },
    // atras(fn) muestra la flecha; atras(null) la quita
    atras(fn) { const b = capa.querySelector("[data-atras]"); b.hidden = !fn; b.onclick = fn; },
    enfocar() { capa.querySelector(`#${id}`).focus({ preventScroll: true }); },
    cerrado: false,
    cerrar(v) {
      if (d.cerrado) return; d.cerrado = true;
      pilaD.splice(pilaD.indexOf(d), 1);
      capa.classList.remove("abierta");
      const fin = () => capa.remove();
      if (reducido()) fin(); else setTimeout(fin, 260);
      if (previo && document.contains(previo)) previo.focus({ preventScroll: true });
      resolver(v);
    },
  };
  d.titulo(titulo); d.meta(meta);
  capa.querySelectorAll("[data-cerrar]").forEach((b) => (b.onclick = () => d.cerrar(false)));
  capa.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const f = $$('button:not([disabled]), input:not([disabled]), select, [href], [tabindex="0"]', d.el).filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });
  pilaD.push(d);
  contenido(d.cuerpo, d);
  requestAnimationFrame(() => { capa.classList.add("abierta"); d.enfocar(); });
  return { promesa, d };
}

// ---------------- Asistente: varios pasos en una hoja ----------------
// pasos: [{ titulo, render(cuerpo, api) }]. api: siguiente(), atras(), habilitar(bool), boton(texto),
// alSiguiente(fn async → bool), cerrar(valor), alLimpiar(fn), ocultarSiguiente(bool)
export function asistente({ titulo, pasos }) {
  let i = 0, alSig = null, limp = [];
  const { promesa, h } = hoja({
    titulo, meta: `1 / ${pasos.length}`,
    contenido(c) {
      c.innerHTML = `<div class="fases" aria-hidden="true">${pasos.map(() => "<i></i>").join("")}</div>
        <h3 class="asis__tit" tabindex="-1"></h3>
        <div class="asis__cuerpo pila"></div>
        <div class="hoja__pie">
          <button type="button" class="btn-texto" data-atras>Back</button>
          <button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-sig>Next</button>
        </div>`;
    },
  });
  const c = h.cuerpo, sig = c.querySelector("[data-sig]"), atras = c.querySelector("[data-atras]");
  const pintar = () => {
    limp.forEach((f) => f()); limp = []; alSig = null;
    const p = pasos[i];
    h.meta(`${i + 1} / ${pasos.length}`);
    c.querySelectorAll(".fases i").forEach((f, k) => f.classList.toggle("on", k <= i));
    const t = c.querySelector(".asis__tit"); t.textContent = p.titulo;
    sig.textContent = i === pasos.length - 1 ? "Done" : "Next";
    sig.disabled = false; sig.hidden = false; atras.hidden = i === 0;
    const cuerpo = c.querySelector(".asis__cuerpo"); cuerpo.innerHTML = "";
    p.render(cuerpo, api);
    t.focus({ preventScroll: true });
  };
  const api = {
    siguiente: () => { if (i < pasos.length - 1) { i++; pintar(); } else h.cerrar(true); },
    atras: () => { if (i) { i--; pintar(); } },
    habilitar: (on) => (sig.disabled = !on),
    boton: (t) => (sig.textContent = t),
    alSiguiente: (fn) => (alSig = fn),
    cerrar: (v) => h.cerrar(v),
    alLimpiar: (f) => limp.push(f),
    ocultarSiguiente: (on = true) => (sig.hidden = on),
  };
  h.alLimpiar(() => limp.forEach((f) => f()));
  atras.onclick = api.atras;
  sig.onclick = async () => {
    if (alSig) { sig.disabled = true; const ok = await alSig(); sig.disabled = false; if (!ok) return; }
    api.siguiente();
  };
  pintar();
  return promesa;
}

// Confirmación en hoja. Con casillas [data-chk], el botón espera a que estén todas marcadas.
export function confirmar({ titulo, html, si = "Continue", no = "Cancel", peligro = false }) {
  const { promesa } = hoja({
    titulo,
    contenido(c, h) {
      c.innerHTML = `<div class="pila">${html}</div>
        <div class="hoja__pie">
          <button type="button" class="btn-texto" data-no>${esc(no)}</button>
          <button type="button" class="btn-pill btn-pill--ancho ${peligro ? "btn-pill--paro" : "btn-pill--main"}" data-si>${esc(si)}</button>
        </div>`;
      const bs = c.querySelector("[data-si]");
      c.querySelector("[data-no]").onclick = () => h.cerrar(false);
      bs.onclick = () => h.cerrar(true);
      const chks = $$("[data-chk]", c);
      if (chks.length) {
        const revisar = () => (bs.disabled = !chks.every((x) => x.checked));
        chks.forEach((x) => (x.onchange = revisar)); revisar();
      }
    },
  });
  return promesa;
}

// Jog compacto para hojas y páginas. maquina: cualquier objeto con jog(dx, dy, dz, f)
export function miniJog(cont, maquina, { ejes = "XYZ" } = {}) {
  let paso = 1;
  const b = (j, t, eje) => `<button type="button" class="btn-pill btn-pill--suave" data-j="${j}" data-eje="${eje}">${t}</button>`;
  cont.innerHTML = `
    <div class="minijog">
      <div class="fila-wrap">
        ${ejes.includes("X") ? b("-1,0,0", "X−", "X") + b("1,0,0", "X+", "X") : ""}
        ${ejes.includes("Y") ? b("0,-1,0", "Y−", "Y") + b("0,1,0", "Y+", "Y") : ""}
        ${ejes.includes("Z") ? b("0,0,1", "Z+", "Z") + b("0,0,-1", "Z−", "Z") : ""}
      </div>
      <div class="seg seg--mono" role="radiogroup" aria-label="Step in mm">
        ${[0.05, 0.1, 1, 10].map((p) => `<button type="button" role="radio" data-p="${p}" aria-checked="${p === paso}">${p}</button>`).join("")}
      </div>
    </div>`;
  cont.querySelectorAll("[data-p]").forEach((x) => (x.onclick = () => {
    paso = +x.dataset.p;
    cont.querySelectorAll("[data-p]").forEach((y) => y.setAttribute("aria-checked", y === x));
  }));
  cont.querySelectorAll("[data-j]").forEach((x) => (x.onclick = () => {
    const [dx, dy, dz] = x.dataset.j.split(",").map(Number);
    const f = dz ? Math.min(600, Math.max(60, paso * 300)) : Math.min(2000, Math.max(100, paso * 600));
    maquina.jog(dx * paso, dy * paso, dz * paso, f);
  }));
}
