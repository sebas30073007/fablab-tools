// herramientas.js - cada herramienta de la barra del 3D abre una hoja: arriba la animación de lo que hace
// (demos.js), abajo sus controles y, en el 3D, la vista previa. Al aplicar, el worker hace el cambio
// (se puede deshacer); al cerrar la hoja, la previa se quita.

import { esc, ico, hoja } from "../../shared/js/ui.js";
import { FORMATOS, COLOR_T } from "./datos.js";
import { demo } from "./demos.js";

const miles = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${Math.round(n / 1000)} mil` : Math.round(n).toLocaleString("es-MX"));
const mm = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
const pie = (txt = "Aplicar") => `<div class="hoja__pie"><button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-aplicar>${esc(txt)}</button></div>`;
const rad = (g) => (g * Math.PI) / 180;
const EJES = [["x", "X"], ["y", "Y"], ["z", "Z"]];

// Matrices 4×4 en columnas (como three)
const M = {
  rot: (eje, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return eje === "x" ? [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]
      : eje === "y" ? [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
        : [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },
  escala: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  // A · B (columnas)
  por(a, b) {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) r[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
    return r;
  },
  mover: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  // m aplicada alrededor del punto p: T(p) · m · T(−p)
  en(m, p) { return M.por(M.mover(...p), M.por(m, M.mover(-p[0], -p[1], -p[2]))); },
  // Rotación que lleva el vector a hacia b (unitarios)
  alinear(a, b) {
    const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (c < -0.99999) return M.rot(Math.abs(a[0]) < 0.9 ? "x" : "y", Math.PI);
    const k = 1 / (1 + c), [x, y, z] = v;
    return [x * x * k + c, y * x * k + z, z * x * k - y, 0, x * y * k - z, y * y * k + c, z * y * k + x, 0, x * z * k + y, y * z * k - x, z * z * k + c, 0, 0, 0, 0, 1];
  },
};

// Hoja de herramienta: la animación arriba, los controles, y [data-aplicar] cableado
function abrir(app, { id, titulo, meta = "", que, html, alAbrir = () => {}, aplicar, limpiar = () => {}, cerrarAlAplicar = true }) {
  let d = null;
  const { promesa, h } = hoja({
    titulo, meta,
    contenido(c, hh) {
      c.innerHTML = `${id ? `<div class="demo" data-demo aria-hidden="true"></div>` : ""}${que ? `<p class="que">${esc(que)}</p>` : ""}${html}`;
      if (id) demo(c.querySelector("[data-demo]"), id).then((x) => { if (hh.cerrado) x.parar(); else d = x; }).catch(() => {});
      alAbrir(c, hh);
      const b = c.querySelector("[data-aplicar]");
      if (b && aplicar) b.onclick = async () => {
        b.disabled = true;
        const info = await aplicar(c, hh);
        b.disabled = false;
        if (info !== false && info != null && cerrarAlAplicar) hh.cerrar(true);
      };
    },
  });
  h.alLimpiar(() => { d?.parar(); limpiar(); });
  return promesa;
}

// ======================================================================
export const HERRAMIENTAS = {
  // ---------------- Acomodar ----------------
  girar(app) {
    const caja = () => app.S.caja, centro = () => caja().centro;
    // Cada giro se hace alrededor del centro y la pieza se queda donde estaba (misma base, mismo centro)
    const aplicarM = async (m) => {
      await app.acc.editar("transformar", { matriz: M.en(m, centro()), apoyar: "mantener" }, { fijo: true, texto: "Girando" });
      armar();
    };
    const armar = () => app.visor.giro(true, (m) => app.acc.editar("transformar", { matriz: m, apoyar: "mantener" }, { fijo: true, texto: "Girando" }).then(armar));
    return abrir(app, {
      id: "girar", titulo: "Girar",
      que: "Arrastra los anillos del 3D para girar a mano (salta de 15 en 15°), o usa los botones.",
      html: `<div class="giros">${EJES.map(([e, t]) => `<div class="giro"><b data-eje="${t}">${t}</b>
          <button type="button" class="btn-pill btn-pill--suave" data-g="${e}" data-a="-90">−90°</button>
          <button type="button" class="btn-pill btn-pill--suave" data-g="${e}" data-a="90">+90°</button>
          <button type="button" class="btn-pill btn-pill--suave" data-e="${e}">Espejo</button></div>`).join("")}</div>`,
      alAbrir(c) {
        c.querySelectorAll("[data-g]").forEach((b) => (b.onclick = () => aplicarM(M.rot(b.dataset.g, rad(+b.dataset.a)))));
        c.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => aplicarM(M.escala(b.dataset.e === "x" ? -1 : 1, b.dataset.e === "y" ? -1 : 1, b.dataset.e === "z" ? -1 : 1))));
        armar();
      },
      limpiar: () => app.visor.giro(false),
    });
  },

  medidas(app) {
    const t = app.S.caja.tam;
    let f = [1, 1, 1];
    return abrir(app, {
      id: "medidas", titulo: "Escala",
      que: "Cambia el tamaño de la pieza. La base se queda en su lugar.",
      html: `<div class="campo"><span>El archivo venía en</span>
          <div class="seg seg--ancho" role="radiogroup">${[["1", "mm"], ["10", "cm"], ["1000", "m"], ["25.4", "pulgadas"]].map(([u, n]) => `<button type="button" role="radio" data-u="${u}" aria-checked="${u === "1"}">${n}</button>`).join("")}</div>
          <small class="muted">Si la pieza se ve diminuta o gigante, seguro venía en otra unidad.</small></div>
        <div class="campos">${["X", "Y", "Z"].map((e, i) => `<label class="campo"><span data-eje="${e}">${e}</span><span class="u"><input type="number" step="0.1" min="0.1" value="${t[i].toFixed(1)}" data-d="${i}"><i>mm</i></span></label>`).join("")}</div>
        <div class="fila-wrap"><label class="check"><input type="checkbox" data-prop checked>Proporcional</label>
          <label class="campo campo--pct"><span class="u"><input type="number" step="1" min="1" value="100" data-pct aria-label="Porcentaje"><i>%</i></span></label></div>
        ${pie("Escalar")}`,
      alAbrir(c) {
        const ins = [...c.querySelectorAll("[data-d]")], pct = c.querySelector("[data-pct]"), prop = c.querySelector("[data-prop]");
        const poner = (k, salvo = -1) => {
          f = Array.isArray(k) ? k : [k, k, k];
          ins.forEach((x, i) => { if (i !== salvo) x.value = (t[i] * f[i]).toFixed(1); });
          pct.value = +(f[0] * 100).toFixed(1);
          app.visor.previaEscala(f.every((x) => Math.abs(x - 1) < 1e-6) ? null : f);
        };
        c.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => { c.querySelectorAll("[data-u]").forEach((x) => x.setAttribute("aria-checked", x === b)); poner(+b.dataset.u); }));
        ins.forEach((x, i) => (x.oninput = () => {
          if (!(+x.value > 0) || !(t[i] > 0)) return;
          if (prop.checked) poner(+x.value / t[i], i);
          else { const g = f.slice(); g[i] = +x.value / t[i]; poner(g, i); }
        }));
        pct.oninput = () => { if (+pct.value > 0) poner(+pct.value / 100); };
      },
      async aplicar() {
        if (f.every((x) => Math.abs(x - 1) < 1e-6)) return false;
        const c = app.S.caja, base = [c.centro[0], c.centro[1], c.min[2]];
        app.visor.previaEscala(null);
        return await app.acc.editar("transformar", { matriz: M.en(M.escala(...f), base) }, { fijo: true, texto: "Escalando" });
      },
      limpiar: () => app.visor.previaEscala(null),
    });
  },

  cara(app) {
    let viva = true;
    return abrir(app, {
      id: "cara", titulo: "Cara abajo",
      que: "Toca en el 3D la cara que debe quedar sobre la mesa: la base de la pieza, o la mesa que salió en el escaneo. La pieza gira para dejarla abajo.",
      html: `<div class="espera">${ico("clic")}<span>Esperando que toques la pieza…</span></div>`,
      alAbrir(c, h) {
        app.visor.elegirCara(async (hit) => {
          if (!viva) return;
          await app.acc.editar("transformar", { matriz: M.alinear(hit.normal, [0, 0, -1]), piso: hit.punto, apoyar: true }, { encuadrar: true, texto: "Girando" });
          app.visor.vista("3d"); h.cerrar(true);
        });
      },
      limpiar: () => { viva = false; app.visor.elegirCara(null); },
    });
  },

  // ---------------- Recortar ----------------
  plano(app) {
    const c0 = app.S.caja;
    let eje = 2, arriba = true, pos = c0.min[2] + c0.tam[2] * 0.1, tapar = true;
    const previa = () => {
      const n = [0, 0, 0]; n[eje] = arriba ? -1 : 1;
      const p = { n, d: arriba ? -pos : pos };
      app.visor.plano(p); return p;
    };
    return abrir(app, {
      id: "plano", titulo: "Cortar con un plano",
      que: "Mueve el plano azul. Lo que ves en cobre es la cara que deja el corte.",
      html: `<div class="campo"><span>Plano perpendicular a</span><div class="seg seg--ancho" role="radiogroup">${["X", "Y", "Z"].map((e, i) => `<button type="button" role="radio" data-e="${i}" aria-checked="${i === eje}">${e}</button>`).join("")}</div></div>
        <label class="campo"><span>Posición <b class="num" data-v="pos"></b></span><input type="range" class="rango" data-pos step="0.1"></label>
        <div class="campo"><span>Se queda</span><div class="seg seg--ancho" role="radiogroup">${[["1", "Lo de arriba"], ["0", "Lo de abajo"]].map(([v, t]) => `<button type="button" role="radio" data-q="${v}" aria-checked="${v === "1"}">${t}</button>`).join("")}</div></div>
        <label class="check"><input type="checkbox" data-tapar checked>Tapar el corte (cara plana, cerrada)</label>
        ${pie("Cortar")}`,
      alAbrir(c) {
        const r = c.querySelector("[data-pos]");
        const act = () => { c.querySelector("[data-v=pos]").textContent = `${mm(pos)} mm`; previa(); };
        const ponerEje = () => {
          r.min = c0.min[eje]; r.max = c0.max[eje];
          if (pos <= c0.min[eje] || pos >= c0.max[eje]) pos = c0.min[eje] + c0.tam[eje] * 0.1;
          r.value = pos; act();
        };
        c.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => { eje = +b.dataset.e; c.querySelectorAll("[data-e]").forEach((x) => x.setAttribute("aria-checked", x === b)); ponerEje(); }));
        c.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { arriba = b.dataset.q === "1"; c.querySelectorAll("[data-q]").forEach((x) => x.setAttribute("aria-checked", x === b)); act(); }));
        r.oninput = () => { pos = +r.value; act(); };
        c.querySelector("[data-tapar]").onchange = (e) => (tapar = e.target.checked);
        ponerEje();
      },
      aplicar: () => { const p = previa(); app.visor.plano(null); return app.acc.editar("cortar", { ...p, tapar }, { texto: "Cortando" }); },
      limpiar: () => app.visor.plano(null),
    });
  },

  caja(app) {
    const c0 = app.S.caja, min = c0.min.slice(), max = c0.max.slice();
    let tapar = false;
    return abrir(app, {
      id: "caja", titulo: "Caja de recorte",
      que: "Se queda lo que está dentro de la caja azul.",
      html: `${["X", "Y", "Z"].map((e, i) => `<div class="rango2"><b data-eje="${e}">${e}</b>
          <input type="range" class="rango" data-min="${i}" min="${c0.min[i]}" max="${c0.max[i]}" step="0.1" value="${c0.min[i]}" aria-label="${e} mínimo">
          <input type="range" class="rango" data-max="${i}" min="${c0.min[i]}" max="${c0.max[i]}" step="0.1" value="${c0.max[i]}" aria-label="${e} máximo">
          <span class="num" data-v="${i}"></span></div>`).join("")}
        <label class="check"><input type="checkbox" data-tapar>Tapar los cortes</label>
        ${pie("Recortar")}`,
      alAbrir(c) {
        const act = () => { [0, 1, 2].forEach((i) => (c.querySelector(`[data-v="${i}"]`).textContent = `${mm(max[i] - min[i])} mm`)); app.visor.recorte({ min, max }); };
        c.querySelectorAll("[data-min]").forEach((r) => (r.oninput = () => { const i = +r.dataset.min; min[i] = Math.min(+r.value, max[i] - 0.5); r.value = min[i]; act(); }));
        c.querySelectorAll("[data-max]").forEach((r) => (r.oninput = () => { const i = +r.dataset.max; max[i] = Math.max(+r.value, min[i] + 0.5); r.value = max[i]; act(); }));
        c.querySelector("[data-tapar]").onchange = (e) => (tapar = e.target.checked);
        act();
      },
      aplicar: () => { app.visor.recorte(null); return app.acc.editar("caja", { min, max, tapar }, { texto: "Recortando" }); },
      limpiar: () => app.visor.recorte(null),
    });
  },

  // Lazo: el clic izquierdo dibuja sobre el 3D; el derecho gira la vista; la rueda acerca.
  // En el celular: un dedo dibuja, dos dedos giran y acercan.
  lazo(app) {
    let mascara = null, visibles = true, pts = null, cuerpo = null;
    const lienzo = document.getElementById("lazo"), g = lienzo.getContext("2d"), area = app.visor.r.domElement;
    const contar = () => {
      let n = 0; if (mascara) for (let i = 0; i < mascara.length; i++) n += mascara[i];
      cuerpo.querySelector("[data-v=n]").textContent = n ? `${miles(n)} triángulos marcados` : "Nada marcado todavía";
      cuerpo.querySelector("[data-aplicar]").disabled = !n;
    };
    const xy = (e) => { const r = area.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const abajo = (e) => {
      if (e.button !== 0 || (e.pointerType === "touch" && !e.isPrimary)) return;
      pts = [xy(e)];
      const r = area.getBoundingClientRect(); lienzo.width = r.width * devicePixelRatio; lienzo.height = r.height * devicePixelRatio;
    };
    const mover = (e) => {
      if (!pts) return;
      pts.push(xy(e));
      g.clearRect(0, 0, lienzo.width, lienzo.height); g.save(); g.scale(devicePixelRatio, devicePixelRatio);
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = "rgba(225, 29, 72, .12)"; g.strokeStyle = "#e11d48"; g.lineWidth = 2; g.setLineDash([6, 4]); g.fill(); g.stroke(); g.restore();
    };
    const arriba = async () => {
      const lista = pts; pts = null; g.clearRect(0, 0, lienzo.width, lienzo.height);
      if (!lista || lista.length < 4) return;
      const r = area.getBoundingClientRect();
      const lazo = lista.map(([x, y]) => [(x / r.width) * 2 - 1, -(y / r.height) * 2 + 1]);
      const { vp, ojo } = app.visor.vp();
      const res = await app.previa("lazo", { vp, ojo, lazo, soloVisibles: visibles, agregar: mascara });
      mascara = res.mascara; app.visor.mascara(mascara); contar();
    };
    return abrir(app, {
      id: "lazo", titulo: "Borrar con lazo",
      que: "Dibuja alrededor de lo que sobra. Puedes dibujar varias veces y girar entre trazos.",
      html: `<div class="teclas"><span><kbd>Clic izquierdo</kbd> dibuja</span><span><kbd>Clic derecho</kbd> gira</span><span><kbd>Rueda</kbd> acerca</span></div>
        <label class="check"><input type="checkbox" data-vis checked>Solo lo que se ve (no lo de atrás)</label>
        <div class="fila-wrap"><span class="w-sub" data-v="n">Nada marcado todavía</span><button type="button" class="btn-texto" data-limpiar>Desmarcar</button></div>
        ${pie("Borrar lo marcado")}`,
      alAbrir(c) {
        cuerpo = c;
        c.querySelector("[data-vis]").onchange = (e) => (visibles = e.target.checked);
        c.querySelector("[data-limpiar]").onclick = () => { mascara = null; app.visor.mascara(null); contar(); };
        app.visor.modoLazo(true); lienzo.hidden = false;
        area.addEventListener("pointerdown", abajo); area.addEventListener("pointermove", mover); window.addEventListener("pointerup", arriba);
        area.addEventListener("contextmenu", sinMenu);
        contar();
      },
      aplicar: async () => { const m = mascara; mascara = null; return app.acc.editar("borrar", { mascara: m }, { texto: "Borrando" }); },
      limpiar: () => {
        app.visor.modoLazo(false); lienzo.hidden = true; app.visor.mascara(null);
        area.removeEventListener("pointerdown", abajo); area.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", arriba);
        area.removeEventListener("contextmenu", sinMenu);
      },
    });
  },

  // Dos maneras: tocar en el 3D las piezas que se quedan (lo demás se borra), o borrar las chicas
  islas(app) {
    const varias = app.S.diag.piezas > 1;
    let modo = varias ? "tocar" : "chicas", minimo = 0, caras = [], mascara = null, viva = true;
    const contar = (c) => {
      let n = 0; if (mascara) for (let i = 0; i < mascara.length; i++) n += mascara[i];
      c.querySelector("[data-v=n]").textContent = modo === "tocar" && !caras.length ? "Toca en el 3D la pieza que se queda" : n ? `Se borran ${miles(n)} triángulos (en rojo)` : "Nada que borrar";
      c.querySelector("[data-aplicar]").disabled = !n;
    };
    const previa = async (c) => {
      mascara = modo === "tocar" ? (caras.length ? (await app.previa("piezas", { caras })).mascara : null) : (await app.previa("islas", { minimo })).mascara;
      app.visor.mascara(mascara); contar(c);
    };
    const tocar = (c) => app.visor.elegirCara((hit) => { if (!viva || modo !== "tocar") return; caras.push(hit.cara); previa(c); tocar(c); });
    return abrir(app, {
      id: "islas", titulo: "Piezas sueltas", meta: `${app.S.diag.piezas} ${app.S.diag.piezas === 1 ? "pieza" : "piezas"}`,
      que: "Pedazos de la mesa, del fondo o de otros objetos que se colaron.",
      html: `<div class="seg seg--ancho" role="radiogroup"><button type="button" role="radio" data-s="tocar" aria-checked="${modo === "tocar"}">Tocar las que se quedan</button><button type="button" role="radio" data-s="chicas" aria-checked="${modo === "chicas"}">Las chicas</button></div>
        <label class="campo" data-min ${modo === "tocar" ? "hidden" : ""}><span>Más chicas que (triángulos; 0 = 1 % de la mayor)</span><input type="number" min="0" step="50" value="0"></label>
        <div class="fila-wrap"><span class="w-sub" data-v="n">Buscando…</span><button type="button" class="btn-texto" data-otra ${modo === "tocar" ? "" : "hidden"}>Empezar de nuevo</button></div>
        ${pie("Borrar lo rojo")}`,
      alAbrir(c) {
        c.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => {
          modo = b.dataset.s; c.querySelectorAll("[data-s]").forEach((x) => x.setAttribute("aria-checked", x === b));
          c.querySelector("[data-min]").hidden = modo === "tocar"; c.querySelector("[data-otra]").hidden = modo !== "tocar";
          if (modo === "tocar") tocar(c); else app.visor.elegirCara(null);
          previa(c);
        }));
        c.querySelector("[data-min] input").onchange = (e) => { minimo = +e.target.value; previa(c); };
        c.querySelector("[data-otra]").onclick = () => { caras = []; previa(c); };
        if (modo === "tocar") tocar(c);
        previa(c);
      },
      aplicar: () => (modo === "tocar" ? app.acc.editar("borrar", { mascara }, { texto: "Borrando", encuadrar: true }) : app.acc.editar("islas", { minimo }, { texto: "Quitando piezas" })),
      limpiar: () => { viva = false; app.visor.elegirCara(null); app.visor.mascara(null); },
    });
  },

  // ---------------- Limpiar ----------------
  rellenar(app) {
    let lazos = [], max = 200;
    const pintar = (c) => {
      const si = lazos.filter((l) => l.length <= max).length;
      c.querySelector("[data-v=n]").textContent = lazos.length ? `Se cierran ${si} de ${lazos.length}` : "No hay huecos";
      c.querySelector("[data-v=max]").textContent = `${max} aristas`;
      app.visor.lineas(lazos.filter((l) => l.length <= max));
      c.querySelector("[data-aplicar]").disabled = !si;
    };
    return abrir(app, {
      id: "rellenar", titulo: "Huecos",
      que: "En naranja, el borde de cada hueco que se va a cerrar. Uno muy grande queda mejor con un corte plano tapado.",
      html: `<label class="campo"><span>Hasta <b class="num" data-v="max"></b> de borde</span><input type="range" class="rango" data-max min="3" max="3000" step="1" value="${max}"></label>
        <span class="w-sub" data-v="n">Buscando huecos…</span>
        ${pie("Rellenar")}`,
      async alAbrir(c) {
        const r = await app.previa("huecos", {});
        lazos = r.lazos; const mayor = Math.max(3, ...lazos.map((l) => l.length));
        const rg = c.querySelector("[data-max]"); rg.max = mayor; max = Math.min(max, mayor); rg.value = max;
        rg.oninput = () => { max = +rg.value; pintar(c); };
        pintar(c);
      },
      aplicar: () => app.acc.editar("rellenar", { maxBorde: max }, { texto: "Rellenando" }),
      limpiar: () => app.visor.lineas(null),
    });
  },

  reparar(app) {
    return abrir(app, {
      id: "reparar", titulo: "Reparar",
      que: "Une vértices repetidos, quita triángulos rotos o repetidos y pone todas las caras hacia afuera.",
      html: pie("Reparar"),
      async aplicar() {
        const i = await app.acc.editar("reparar", {}, { texto: "Reparando" });
        if (i) app.avisoVisor(`Reparada: ${i.unidos} vértices unidos, ${i.quitados} triángulos quitados, ${i.volteados} caras volteadas.`, "info");
        return i;
      },
    });
  },

  suavizar(app) {
    let pasadas = 3;
    return abrir(app, {
      id: "suavizar", titulo: "Suavizar",
      que: "Quita el ruido de la superficie sin encoger la pieza. Más pasadas: más liso, menos detalle.",
      html: `<label class="campo"><span>Pasadas: <b class="num" data-v="p">${pasadas}</b></span><input type="range" class="rango" min="1" max="20" value="${pasadas}" data-p></label>${pie("Suavizar")}`,
      alAbrir(c) { c.querySelector("[data-p]").oninput = (e) => { pasadas = +e.target.value; c.querySelector("[data-v=p]").textContent = pasadas; }; },
      aplicar: () => app.acc.editar("suavizar", { pasadas }, { texto: "Suavizando" }),
    });
  },

  simplificar(app) {
    const total = app.S.diag.triangulos;
    let meta = Math.min(total, 100000);
    return abrir(app, {
      id: "simplificar", titulo: "Simplificar",
      que: "Menos triángulos, casi la misma forma. Conserva el color y la textura.",
      html: `<div class="w-cifra"><span data-v="m"></span><small>de ${miles(total)} triángulos</small></div>
        <input type="range" class="rango" data-r min="1" max="100" step="1" aria-label="Porcentaje">
        <div class="fila-wrap">${[["Web y celular", 100000], ["Impresión", 300000], ["Mitad", Math.round(total / 2)]].filter(([, n]) => n < total).map(([t, n]) => `<button type="button" class="btn-pill btn-pill--suave" data-n="${n}">${t}</button>`).join("")}</div>
        ${pie("Simplificar")}`,
      alAbrir(c) {
        const r = c.querySelector("[data-r]");
        const pintar = () => { c.querySelector("[data-v=m]").textContent = miles(meta); r.value = Math.max(1, Math.round((meta / total) * 100)); };
        r.oninput = () => { meta = Math.round((total * +r.value) / 100); pintar(); };
        c.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => { meta = +b.dataset.n; pintar(); }));
        pintar();
      },
      async aplicar() {
        const i = await app.acc.editar("simplificar", { meta }, { texto: "Simplificando" });
        if (i) app.avisoVisor(`De ${miles(i.antes)} a ${miles(i.despues)} triángulos.`, "info");
        return i;
      },
    });
  },

  color(app) {
    const m = app.S.m;
    return abrir(app, {
      id: "color", titulo: "Color",
      que: m.textura ? "Trae textura: una imagen pegada con coordenadas UV. Es lo más nítido." : m.col ? "Trae un color por vértice." : "No trae color.",
      html: `<div class="pila-s">
        ${m.textura ? `<button type="button" class="btn-pill" data-hornear>Pasar la textura a color por vértice</button><small class="muted">Para formatos sin imagen (3MF de color, PLY, ASC). Se pierde nitidez.</small>` : ""}
        ${m.col || m.textura ? `<button type="button" class="btn-pill" data-quitar>Quitar el color</button>` : ""}</div>`,
      alAbrir(c, h) {
        c.querySelector("[data-hornear]")?.addEventListener("click", async () => { await app.acc.editar("hornear", {}, { texto: "Horneando" }); h.cerrar(); });
        c.querySelector("[data-quitar]")?.addEventListener("click", async () => { await app.acc.editar("quitarColor"); h.cerrar(); });
      },
    });
  },
};

function sinMenu(e) { e.preventDefault(); }

// ---------------- Exportar (una hoja por formato) ----------------
for (const f of FORMATOS) {
  if (f.ir || f.pronto) continue;
  HERRAMIENTAS["exportar:" + f.id] = (app) => {
    const m = app.S.m;
    const disponibles = f.colores.filter((c) => (c === "textura" ? m.uv && m.textura : c === "vertice" ? m.col || m.textura : true));
    let color = disponibles[0] || "ninguno";
    const perdida = [];
    if ((m.col || m.textura) && !f.guarda.color) perdida.push("el color");
    if (f.puntos) perdida.push("los triángulos (quedan solo puntos)");
    return abrir(app, {
      titulo: `Exportar ${f.t}`, meta: m.nombre,
      que: `${f.para}.`,
      html: `${perdida.length ? `<div class="aviso">${ico("alerta")}<span>${esc(f.t)} no guarda ${perdida.join(" ni ")}.</span></div>` : ""}
        ${disponibles.length > 1 ? `<div class="campo"><span>Color</span><div class="seg seg--ancho" role="radiogroup">${disponibles.map((c) => `<button type="button" role="radio" data-c="${c}" aria-checked="${c === color}">${COLOR_T[c]}</button>`).join("")}</div>
          ${disponibles.includes("vertice") && !m.col ? `<small class="muted">Color por vértice: se hornea desde la textura.</small>` : ""}</div>` : ""}
        ${f.id === "obj" || f.id === "ply" ? `<small class="muted">Con textura se descarga un .zip con el modelo y su imagen.</small>` : ""}
        ${f.pesado ? `<small class="muted">La primera vez se descarga el convertidor (4 MB).</small>` : ""}
        ${pie("Descargar")}`,
      alAbrir(c) { c.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { color = b.dataset.c; c.querySelectorAll("[data-c]").forEach((x) => x.setAttribute("aria-checked", x === b)); })); },
      aplicar: () => app.acc.exportar(f.id, { color }),
    });
  };
}
