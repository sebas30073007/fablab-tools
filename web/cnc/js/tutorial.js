// tutorial.js - el botón Tutorial: una ventana para elegir entre el manual y el recorrido guiado,
// el manual (contenido en manual.js) y el motor del recorrido (contenido en tutorial-bloques.js).
//
// El motor no sabe nada de la CNC: recorre bloques de pasos, oscurece la pantalla menos el
// objetivo, coloca el globo de Fresa junto a él y avanza cuando se cumple la condición del paso.
// Lo que cambie en la interfaz se arregla en el bloque, no aquí.
//
// Accesibilidad: el globo es role="dialog" y recibe el foco en cada paso; Tab recorre el globo
// y el objetivo; Esc sale (main.js le da prioridad a PARO). Respeta prefers-reduced-motion.

import { esc, ico, dialogo, hojaAbierta, dialogoAbierto, cerrarHojaSuperior, ls } from "./ui.js";
import { MANUAL } from "./manual.js";
import { BLOQUES } from "./tutorial-bloques.js";
import { abrirExamen } from "./examen.js";

const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const MASC_TIPO = { info: "explica", "señala": "senala", pulsa: "senala", espera: "hola" };
// Tres clases de tarjeta, cada una con su ícono: concepto (centrada), interfaz y acción (junto al objetivo)
const CLASE = { info: "info", "señala": "interfaz", pulsa: "accion", espera: "accion" };
const CHIP = { info: ["info", "Concepto"], interfaz: ["interfaz", "Interfaz"], accion: ["clic", "Tu turno"] };

// ======================================================================
// Ventana: elegir
// ======================================================================
export function abrirTutorial(app) {
  dialogo({ titulo: "Tutorial", clase: "dlg--angosta", contenido: (c, d) => elegir(c, d, app) });
}
export function abrirManual(app) {
  dialogo({ titulo: MANUAL.titulo, contenido: (c, d) => manual(c, d, app) });
}

function elegir(c, d, app) {
  d.titulo("Tutorial"); d.meta(""); d.atras(null); d.extra.innerHTML = "";
  d.el.classList.add("dlg--angosta");
  c.innerHTML = `<div class="tuto-opciones">
    <button type="button" class="tuto-op" data-op="manual">
      <span class="tuto-op__img"><img src="${MANUAL.pasos[5].img}" alt="" onerror="this.remove()"></span>
      <span class="tuto-op__t">Manual de uso</span>
      <span class="tuto-op__d">Los ${MANUAL.pasos.length} pasos de tu placa, de KiCad a la placa terminada, con sus checks.</span>
    </button>
    <button type="button" class="tuto-op" data-op="guiado">
      <span class="tuto-op__img tuto-op__img--escena"><img src="${MANUAL.antes[1].img}" alt="" onerror="this.remove()">
        <img class="tuto-op__fresa" src="${app.MASC.senala}" alt="" onerror="this.remove()">
        <span class="tuto-op__tag">Si es tu primera PCB, te recomendamos esta opción</span></span>
      <span class="tuto-op__t">Tutorial guiado</span>
      <span class="tuto-op__d">Fresa te lleva por los 6 pasos y fabrican juntos una placa en simulación. Unos 10 minutos.</span>
    </button>
  </div>
  <button type="button" class="tuto-examen" data-op="examen">
    <img src="${app.MASC.lupa}" alt="" onerror="this.remove()">
    <span><b>Examen y certificado</b><small>${ls.get("examenAprobado", null) ? "Aprobado · descarga tu certificado cuando quieras" : "15 preguntas; con 80 % obtienes el certificado del Curso básico de CNC"}</small></span>
    ${ico("chev")}
  </button>`;
  c.querySelector('[data-op="manual"]').onclick = () => manual(c, d, app, true);
  c.querySelector('[data-op="examen"]').onclick = () => { d.cerrar(); abrirExamen(app); };
  c.querySelector('[data-op="guiado"]').onclick = () => { d.cerrar(); setTimeout(() => recorrido.iniciar(app), reducido() ? 0 : 220); };
}

function manual(c, d, app, desdeElegir = false) {
  d.titulo(MANUAL.titulo); d.meta(`${MANUAL.pasos.length} pasos`);
  d.el.classList.remove("dlg--angosta");
  d.atras(() => { elegir(c, d, app); d.enfocar(); });
  d.extra.innerHTML = `<button type="button" class="btn-texto" data-imprimir>Imprimir</button>`;
  d.extra.querySelector("[data-imprimir]").onclick = () => window.print();
  const tarjeta = (p, num) => `
    <li class="man-paso">
      <span class="man-paso__img"><img src="${p.img}" alt="" loading="lazy" onerror="this.remove()"></span>
      <h3>${num ? `<span>${num}</span>` : ""}${esc(p.t)}</h3>
      <p>${esc(p.d)}</p>
      ${p.checks.map((k) => `<label class="check"><input type="checkbox"> ${esc(k)}</label>`).join("")}
    </li>`;
  const seccion = (t, sub, lista, numerar, clase = "") => `<section class="man-sec ${clase}"><h3 class="man-sec__t">${esc(t)}<small>${esc(sub)}</small></h3>
    <ol class="man-pasos">${lista.map((p, i) => tarjeta(p, numerar ? i + 1 : 0)).join("")}</ol></section>`;
  c.innerHTML = `<div class="man" aria-label="${esc(MANUAL.sub)}">
    ${seccion("Antes", "fuera de la app", MANUAL.antes, false, "man-sec--extra")}
    ${seccion("Los 6 pasos de tu placa", "los mismos de Inicio y del tutorial guiado", MANUAL.pasos, true)}
    ${seccion("Al terminar", "fuera de la app", MANUAL.despues, false, "man-sec--extra")}</div>
    <div class="man-pie">${MANUAL.pie.map(([a, b]) => `<span><b>${esc(a)}</b> ${esc(b)}</span>`).join("")}</div>`;
  c.scrollTop = 0;
  if (desdeElegir) d.enfocar();
}

// ======================================================================
// Recorrido guiado
// ======================================================================
class Recorrido {
  constructor() {
    this.activo = false;
    this._click = this._click.bind(this);
    this._tecla = this._tecla.bind(this);
  }

  iniciar(app, bloques = BLOQUES) {
    if (this.activo) this.salir();
    this.app = app; this.bloques = bloques; this.activo = true;
    this.bi = 0; this.pi = -1; this.hist = []; this.token = 0; this.forma = "";
    while (hojaAbierta()) cerrarHojaSuperior();
    const r = document.createElement("div");
    r.className = "tour";
    r.innerHTML = `<svg class="tour__velo" aria-hidden="true"><path fill-rule="evenodd"/></svg>
      <div class="tour__aro" aria-hidden="true"></div><span class="tour__clic" aria-hidden="true">${ico("clic")}</span>
      <section class="tour__pop" role="dialog" aria-modal="false" aria-labelledby="tour-tit" aria-describedby="tour-txt"></section>`;
    document.body.appendChild(r);
    document.body.classList.add("con-tour");
    this.root = r; this.pop = r.querySelector(".tour__pop");
    document.addEventListener("click", this._click, true);
    document.addEventListener("keydown", this._tecla, true);
    this.vigia = setInterval(() => this._vigilar(), 150);
    const marco = () => { if (!this.activo) return; this._marco(); this.raf = requestAnimationFrame(marco); };
    this.raf = requestAnimationFrame(marco);
    this.siguiente();
  }

  salir(terminado = false) {
    if (!this.activo) return;
    this.activo = false; this.token++;
    clearInterval(this.vigia); cancelAnimationFrame(this.raf);
    document.removeEventListener("click", this._click, true);
    document.removeEventListener("keydown", this._tecla, true);
    this.root.remove();
    document.body.classList.remove("con-tour");
    if (terminado) ls.set("tutorialHecho", true);
    document.querySelector('[data-tour="tutorial"]')?.focus({ preventScroll: true });
  }

  // Esc: true si lo atendió. Mientras el estudiante trabaja en una hoja, Esc es de la hoja.
  esc() {
    if (!this.activo) return false;
    if (this.paso?.tipo === "espera" && hojaAbierta()) return false;
    this.salir(); return true;
  }

  // ---------------- Navegación ----------------
  _valido(b, p) {
    const app = this.app;
    if (b.si && !b.si(app)) return false;
    if (p.si && !p.si(app)) return false;
    if (p.hasta && (p.tipo === "pulsa" || p.tipo === "espera") && p.hasta(app)) return false;
    return true;
  }
  siguiente() {
    for (;;) {
      const b = this.bloques[this.bi];
      if (!b) { this.salir(true); return; }
      if (this.pi === -1 && b.si && !b.si(this.app)) { this.bi++; continue; }
      this.pi++;
      if (this.pi >= b.pasos.length) { this.bi++; this.pi = -1; continue; }
      if (this._valido(b, b.pasos[this.pi])) { this._mostrar(); return; }
    }
  }
  atras() {
    this.hist.pop();
    while (this.hist.length) {
      const [bi, pi] = this.hist.pop();
      const b = this.bloques[bi];
      if (this._valido(b, b.pasos[pi])) { this.bi = bi; this.pi = pi; this._mostrar(); return; }
    }
  }
  _avanzar() {
    if (this.avanzando) return;
    this.avanzando = true;
    const tok = this.token;
    setTimeout(() => { this.avanzando = false; if (tok === this.token && this.activo) this.siguiente(); }, 380);
  }

  // ---------------- Pintar un paso ----------------
  async _mostrar() {
    const app = this.app, b = this.bloques[this.bi], p = b.pasos[this.pi];
    const tok = ++this.token;
    this.paso = p; this.bloque = b; this.el = null; this.forma = ""; this.lado = null;
    this.hist.push([this.bi, this.pi]);
    p.antes?.(app);
    if (p.objetivo && (p.tipo === "señala" || p.tipo === "pulsa")) {
      const t0 = performance.now();
      while (!this._objetivo() && performance.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 100));
      if (tok !== this.token) return;
      const el = this._objetivo();
      const vista = document.getElementById("vista");
      if (el && vista?.contains(el)) el.scrollIntoView({ block: "center", behavior: reducido() ? "auto" : "smooth" });
    }
    const conObjetivo = !!(p.objetivo && this._objetivo());
    this.modo = p.tipo === "espera" ? "libre" : conObjetivo ? "objetivo" : "centro";
    this.root.classList.toggle("tour--libre", this.modo === "libre");
    this._globo(p, b, conObjetivo);
    this._marco(true);
    this.pop.classList.remove("tour__pop--entra"); void this.pop.offsetWidth;
    if (!reducido()) this.pop.classList.add("tour__pop--entra");
    this.pop.querySelector(".tour__tit").focus({ preventScroll: true });
  }

  _globo(p, b, conObjetivo) {
    const app = this.app;
    const textos = [].concat(p.texto || []);
    const masc = p.masc || MASC_TIPO[p.tipo];
    const clase = CLASE[p.tipo];
    const pulsable = p.tipo === "pulsa" && conObjetivo;
    const conSig = p.tipo === "info" || p.tipo === "señala" || (p.tipo === "pulsa" && !conObjetivo && !p.hazlo);
    const ofreceHazlo = p.hazlo && (p.tipo === "espera" || p.tipo === "pulsa");
    // Dónde vas: capítulo (de los 6 pasos) y tarjeta dentro del capítulo
    const nPasos = this.bloques.filter((x) => x.paso).length;
    const ultimoPaso = Math.max(0, ...this.bloques.slice(0, this.bi + 1).map((x) => x.paso || 0));
    const cap = b.paso ? `Paso ${b.paso} de ${nPasos} · ${b.titulo}` : b.titulo;
    const vistas = new Set(this.hist.filter(([bi, pi]) => bi === this.bi && !this.bloques[bi].pasos[pi].breve).map(([, pi]) => pi));
    // Total = las ya vistas + las que faltan y se van a ver (las de «luego» cuentan aunque su
    // condición aún no se cumpla); se recalcula en cada tarjeta, sin contar las transiciones breves
    const n = p.breve ? 0 : vistas.size;
    const total = n + b.pasos.slice(this.pi + 1).filter((x) => !x.breve && (x.luego || this._valido(b, x))).length;
    const [icoChip, txtChip] = CHIP[clase];
    this.pop.className = `tour__pop tour__pop--${clase}` + (this.modo === "centro" ? " tour__pop--centro" : p.img ? " tour__pop--ancho" : "");
    this.pop.innerHTML = `
      <div class="tour__cab">
        <span class="tour__cap">${esc(cap)}</span>
        <span class="fases" aria-hidden="true">${Array.from({ length: nPasos }, (_, k) => `<i class="${k + 1 < (b.paso || ultimoPaso + 1) ? "on" : k + 1 === b.paso ? "actual" : ""}"></i>`).join("")}</span>
        <span class="sr-only">${b.paso ? `Paso ${b.paso} de ${nPasos}` : esc(b.titulo)}${n ? `, tarjeta ${n} de ${total}` : ""}</span>
      </div>
      <div class="tour__cuerpo">
        ${masc && app.MASC[masc] ? `<img class="tour__masc" src="${app.MASC[masc]}" alt="" onerror="this.remove()">` : ""}
        <div class="tour__main">
          <span class="tour__chip tour__chip--${clase}">${ico(icoChip)}${txtChip}</span>
          <h3 class="tour__tit" id="tour-tit" tabindex="-1">${esc(p.titulo)}</h3>
          <div id="tour-txt">${textos.map((t) => `<p class="tour__txt">${t}</p>`).join("")}
            ${p.img ? `<div class="tour__fig"><img src="${p.img}" alt="" onerror="this.parentElement.remove()"></div>` : ""}
            ${p.pista && (pulsable || p.tipo === "espera") ? `<div class="tour__pista">${ico("clic")}${esc(p.pista)}</div>` : ""}</div>
        </div>
      </div>
      <div class="tour__pie">
        ${p.fin ? `<button type="button" class="btn-texto" data-terminar>Terminar</button>` : `<button type="button" class="btn-texto" data-salir>Salir</button>`}
        ${this.hist.length > 1 && p.tipo !== "espera" && !p.fin ? `<button type="button" class="btn-texto" data-atras>Atrás</button>` : ""}
        <span class="tour__cuenta" aria-hidden="true">${n && total > 1 ? `${Array.from({ length: total }, (_, k) => `<i class="${k < n ? "on" : ""}"></i>`).join("")}<span>${n} de ${total}</span>` : ""}</span>
        ${ofreceHazlo ? `<button type="button" class="btn-pill btn-pill--suave" data-hazlo>${esc(p.hazloTexto || "Hazlo por mí")}</button>` : ""}
        ${p.fin ? `<button type="button" class="btn-pill btn-pill--suave" data-manual>Manual</button><button type="button" class="btn-pill btn-pill--main" data-examen>Hacer el examen</button>` : ""}
        ${conSig && !p.fin ? `<button type="button" class="btn-pill btn-pill--main" data-sig>Siguiente</button>` : ""}
      </div>
      <i class="tour__flecha" aria-hidden="true"></i>`;
    const q = (s) => this.pop.querySelector(s);
    if (q("[data-salir]")) q("[data-salir]").onclick = () => this.salir();
    if (q("[data-terminar]")) q("[data-terminar]").onclick = () => this.salir(true);
    if (q("[data-atras]")) q("[data-atras]").onclick = () => this.atras();
    if (q("[data-sig]")) q("[data-sig]").onclick = () => this.siguiente();
    if (q("[data-manual]")) q("[data-manual]").onclick = () => { this.salir(true); abrirManual(app); };
    if (q("[data-examen]")) q("[data-examen]").onclick = () => { this.salir(true); abrirExamen(app); };
    if (q("[data-hazlo]")) {
      const hb = q("[data-hazlo]");
      if (p.hazloSi) hb.hidden = !p.hazloSi(app);
      hb.onclick = async () => {
        hb.disabled = true;
        try { await p.hazlo(app); } finally { hb.disabled = false; }
        if (!p.hasta) this._avanzar();
      };
    }
  }

  // ---------------- Objetivo, velo y posición ----------------
  _objetivo() {
    const p = this.paso; if (!p?.objetivo) return null;
    for (const s of [].concat(p.objetivo)) {
      for (const el of document.querySelectorAll(s)) {
        if (this.root.contains(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !el.closest("[hidden]")) return el;
      }
    }
    return null;
  }

  _marco(forzar = false) {
    const W = innerWidth, H = innerHeight, p = this.paso;
    if (!p) return;
    const path = this.root.querySelector("path"), aro = this.root.querySelector(".tour__aro"), clic = this.root.querySelector(".tour__clic");
    let r = null;
    // Explorar: si al tocar lo resaltado se abre una hoja o cambia la vista, el velo se quita
    // y la tarjeta espera a un lado hasta que pulses Siguiente
    const el = this.modo === "objetivo" ? this._objetivo() : null;
    const explorando = this.modo === "objetivo" && p.tipo === "señala" && (!el || hojaAbierta() || dialogoAbierto());
    this.root.classList.toggle("tour--libre", this.modo === "libre" || explorando);
    if (this.modo === "objetivo" && !explorando) {
      // En el panel, el globo sale a su izquierda (sobre el 3D) para no tapar el resto del panel
      this.zona = el?.closest("[data-tour-zona]")?.getBoundingClientRect() || null;
      if (el) { const b = el.getBoundingClientRect(); const m = 6; r = { left: b.left - m, top: b.top - m, width: b.width + 2 * m, height: b.height + 2 * m }; r.right = r.left + r.width; r.bottom = r.top + r.height; }
    }
    const forma = r ? `${W}|${H}|${r.left.toFixed(1)}|${r.top.toFixed(1)}|${r.width.toFixed(1)}|${r.height.toFixed(1)}` : `${W}|${H}|${this.modo}|${explorando}`;
    const tam = `${this.pop.offsetWidth}x${this.pop.offsetHeight}`;
    if (!forzar && forma === this.forma && tam === this.tam) return;
    this.forma = forma; this.tam = tam;

    let d = `M0 0H${W}V${H}H0Z`;
    if (r) {
      const k = Math.min(16, r.height / 2, r.width / 2), { left: x, top: y, width: w, height: h } = r;
      d += `M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z`;
      Object.assign(aro.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${k}px` });
      aro.dataset.pulsa = p.tipo === "pulsa" ? "1" : "0";
      // En una acción, el ícono de clic va pegado a donde hay que pulsar
      if (p.tipo === "pulsa") Object.assign(clic.style, { display: "grid", left: `${Math.min(r.right - 18, W - 44)}px`, top: `${Math.min(r.bottom - 18, H - 44)}px` });
      else clic.style.display = "none";
    } else { aro.style.display = "none"; clic.style.display = "none"; }
    path.setAttribute("d", d);
    this._colocar(r, W, H, explorando);
  }

  _colocar(r, W, H, explorando = false) {
    const pop = this.pop, pw = pop.offsetWidth, ph = pop.offsetHeight, m = 14, g = 18;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    let x, y, lado;
    const tel = W < 720;
    if (this.modo === "libre" || explorando) {
      // Sin velo: el globo se acomoda abajo a la izquierda del 3D, donde no tapa el panel.
      // En teléfono, arriba, sobre el 3D: abajo está la hoja en la que trabaja el estudiante
      const v = document.querySelector('[data-tour="visor"]')?.getBoundingClientRect();
      lado = "libre";
      if (tel) { x = (W - pw) / 2; y = m + 44; }
      else if (v && v.width > pw + 2 * m) { x = v.left + 20; y = v.bottom - ph - 76; }
      else { x = (W - pw) / 2; y = H - ph - m; }
    } else if (!r) {
      lado = "centro"; x = (W - pw) / 2; y = (H - ph) / 2;
    } else {
      const grande = r.width > W * 0.5 || r.height > H * 0.6;
      // Siempre el mismo criterio, para que la vista no salte de un lado a otro: lo del panel,
      // a su izquierda; lo de la barra, abajo; lo grande, adentro; lo demás, abajo o arriba
      const pref = this.paso.lado || (this.zona ? "izq" : r.top < 90 ? "abajo" : grande ? "dentro" : null);
      const cand = {
        izq: () => { const L = this.zona ? Math.min(this.zona.left, r.left) : r.left; return { x: L - g - pw, y: r.top + r.height / 2 - ph / 2, ok: L - g - pw >= m }; },
        der: () => ({ x: r.right + g, y: r.top + r.height / 2 - ph / 2, ok: r.right + g + pw <= W - m }),
        abajo: () => ({ x: r.left + r.width / 2 - pw / 2, y: r.bottom + g, ok: r.bottom + g + ph <= H - m }),
        arriba: () => ({ x: r.left + r.width / 2 - pw / 2, y: r.top - g - ph, ok: r.top - g - ph >= m }),
        dentro: () => ({ x: r.left + 24, y: r.bottom - ph - 76, ok: true }),
      };
      // En teléfono no hay lado: abajo si el objetivo está en la mitad de arriba, si no arriba;
      // si no cabe, el globo se acopla al borde contrario sin flecha
      const arribaDeLaMitad = r.top + r.height / 2 < H / 2;
      const orden = tel ? (arribaDeLaMitad ? ["abajo", "arriba"] : ["arriba", "abajo"])
        : [pref, "izq", "abajo", "arriba", "der", "dentro"].filter((k, i, a) => k && a.indexOf(k) === i);
      for (const k of orden) { const c = cand[k](); if (c.ok) { x = c.x; y = c.y; lado = k; break; } }
      if (lado === undefined) { lado = "libre"; x = (W - pw) / 2; y = arribaDeLaMitad ? H - ph - m : m; }
    }
    x = clamp(x, m, W - pw - m); y = clamp(y, m, H - ph - m);
    pop.style.left = `${x}px`; pop.style.top = `${y}px`;
    const f = pop.querySelector(".tour__flecha");
    if (f && r) {
      f.style.left = f.style.top = "";
      if (lado === "izq" || lado === "der") f.style.top = `${clamp(r.top + r.height / 2 - y - 8, 18, ph - 34)}px`;
      else if (lado === "abajo" || lado === "arriba") f.style.left = `${clamp(r.left + r.width / 2 - x - 8, 18, pw - 34)}px`;
    }
    pop.dataset.lado = lado;
  }

  // ---------------- Eventos ----------------
  _vigilar() {
    if (!this.activo || !this.paso || this.avanzando) return;
    const p = this.paso, app = this.app;
    if (p.hasta && (p.tipo === "pulsa" || p.tipo === "espera") && p.hasta(app)) { this._avanzar(); return; }
    const hb = this.pop.querySelector("[data-hazlo]");
    if (hb && p.hazloSi) hb.hidden = !p.hazloSi(app);
  }
  _click(e) {
    const p = this.paso;
    if (!this.activo || !p || p.tipo !== "pulsa" || this.modo !== "objetivo") return;
    const el = this._objetivo();
    if (el && el.contains(e.target) && !p.hasta) this._avanzar();
  }
  _tecla(e) {
    if (e.key !== "Tab" || this.modo === "libre") return;
    // Tab: el globo y, si hay que pulsarlo, el objetivo
    const f = [...this.pop.querySelectorAll("button:not([disabled]):not([hidden])")];
    const el = this.paso?.tipo === "pulsa" || this.paso?.tipo === "señala" ? this._objetivo() : null;
    if (el) f.push(el.matches("button, [href], input") ? el : el.querySelector("button, [href], input") || el);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
}

export const recorrido = new Recorrido();
