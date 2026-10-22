// herramientas.js - cada herramienta de edición abre una hoja con sus controles y su vista previa en
// el 3D. Al aplicar, el worker hace el cambio (se puede deshacer); al cerrar, la previa se quita.

import { esc, ico, hoja } from "../../shared/js/ui.js";
import { FORMATOS, COLOR_T } from "./datos.js";

const miles = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${Math.round(n / 1000)} mil` : Math.round(n).toLocaleString("es-MX"));
const mm = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
const pie = (txt = "Aplicar", extra = "") => `<div class="hoja__pie">${extra}<button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-aplicar>${esc(txt)}</button></div>`;
const rad = (g) => (g * Math.PI) / 180;

// Matriz 4×4 en columnas (como three)
const M = {
  rotX: (a) => [1, 0, 0, 0, 0, Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1],
  rotY: (a) => [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1],
  rotZ: (a) => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  escala: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  // Rotación que lleva el vector a hacia b (unitarios)
  alinear(a, b) {
    const v = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (c < -0.99999) { const e = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const ax = [a[1] * e[2] - a[2] * e[1], a[2] * e[0] - a[0] * e[2], a[0] * e[1] - a[1] * e[0]]; const l = Math.hypot(...ax); return rotEje(ax.map((x) => x / l), Math.PI); }
    const k = 1 / (1 + c), [x, y, z] = v;
    return [x * x * k + c, y * x * k + z, z * x * k - y, 0, x * y * k - z, y * y * k + c, z * y * k + x, 0, x * z * k + y, y * z * k - x, z * z * k + c, 0, 0, 0, 0, 1];
  },
};
function rotEje([x, y, z], a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [t * x * x + c, t * x * y + s * z, t * x * z - s * y, 0, t * x * y - s * z, t * y * y + c, t * y * z + s * x, 0, t * x * z + s * y, t * y * z - s * x, t * z * z + c, 0, 0, 0, 0, 1];
}

// Hoja de herramienta: pinta, cablea [data-aplicar] y limpia la previa al cerrar
function abrir(app, { titulo, meta = "", html, alAbrir = () => {}, aplicar, limpiar = () => {}, cerrarAlAplicar = true }) {
  const { promesa, h } = hoja({
    titulo, meta,
    contenido(c, hh) {
      c.innerHTML = html;
      alAbrir(c, hh);
      const b = c.querySelector("[data-aplicar]");
      if (b && aplicar) b.onclick = async () => {
        b.disabled = true;
        const info = await aplicar(c, hh);
        b.disabled = false;
        if (info !== false && cerrarAlAplicar) hh.cerrar(true);
      };
    },
  });
  h.alLimpiar(limpiar);
  return promesa;
}

// ======================================================================
export const HERRAMIENTAS = {
  // ---------------- Acomodar ----------------
  cara(app) {
    app.avisoVisor("Toca la base del modelo o la mesa del escaneo: esa cara queda horizontal, abajo", "medida");
    app.visor.elegirCara(async (hit) => {
      app.avisoVisor(null);
      await app.acc.editar("transformar", { matriz: M.alinear(hit.normal, [0, 0, -1]), piso: hit.punto, apoyar: true }, { encuadrar: true, texto: "Girando" });
      app.visor.vista("3d");
    });
  },

  girar(app) {
    abrir(app, {
      titulo: "Girar y apoyar",
      html: `<p class="muted">Cada botón gira 90° y deja el modelo apoyado en la mesa. Puedes deshacer.</p>
        <div class="giros">
          ${[["x", "X"], ["y", "Y"], ["z", "Z"]].map(([e, t]) => `<div class="giro"><b data-eje="${t}">${t}</b>
            <button type="button" class="btn-pill btn-pill--suave" data-g="${e}" data-a="-90">−90°</button>
            <button type="button" class="btn-pill btn-pill--suave" data-g="${e}" data-a="90">+90°</button></div>`).join("")}
        </div>
        <div class="fila-wrap">
          <button type="button" class="btn-pill" data-apoyar>${ico("bajar")}Apoyar y centrar</button>
          <button type="button" class="btn-pill" data-espejo>Espejo en X</button>
          <button type="button" class="btn-pill" data-cara>${ico("clic")}Elegir la cara de abajo</button>
        </div>`,
      alAbrir(c, h) {
        c.querySelectorAll("[data-g]").forEach((b) => (b.onclick = async () => {
          const a = rad(+b.dataset.a), m = { x: M.rotX, y: M.rotY, z: M.rotZ }[b.dataset.g](a);
          await app.acc.editar("transformar", { matriz: m, apoyar: true }, { encuadrar: true, texto: "Girando" });
        }));
        c.querySelector("[data-apoyar]").onclick = () => app.acc.editar("transformar", { matriz: M.escala(1, 1, 1), apoyar: true }, { encuadrar: true });
        c.querySelector("[data-espejo]").onclick = () => app.acc.editar("transformar", { matriz: M.escala(-1, 1, 1), apoyar: true });
        c.querySelector("[data-cara]").onclick = () => { h.cerrar(); HERRAMIENTAS.cara(app); };
      },
    });
  },

  medidas(app) {
    const t = app.S.caja.tam;
    abrir(app, {
      titulo: "Medidas y escala",
      html: `<div class="celdas">${["X", "Y", "Z"].map((e, i) => `<div class="celda"><span>${e}</span><b class="num">${mm(t[i])} mm</b></div>`).join("")}</div>
        <div class="campo"><span>El archivo venía en</span>
          <div class="seg seg--ancho" role="radiogroup">${[["1", "mm"], ["10", "cm"], ["1000", "m"], ["25.4", "pulgadas"]].map(([f, n]) => `<button type="button" role="radio" data-u="${f}" aria-checked="${f === "1"}">${n}</button>`).join("")}</div>
          <small class="muted">Si el modelo se ve diminuto o gigante, probablemente venía en otra unidad.</small></div>
        <div class="campos">${["X", "Y", "Z"].map((e, i) => `<label class="campo"><span>${e} nuevo</span><span class="u"><input type="number" step="0.1" min="0.1" value="${t[i].toFixed(1)}" data-d="${i}"><i>mm</i></span></label>`).join("")}</div>
        <label class="check"><input type="checkbox" data-prop checked>Proporcional</label>
        <label class="campo"><span>O por porcentaje</span><span class="u"><input type="number" step="1" min="1" value="100" data-pct><i>%</i></span></label>
        ${pie("Escalar")}`,
      alAbrir(c) {
        const ins = [...c.querySelectorAll("[data-d]")], pct = c.querySelector("[data-pct]"), prop = c.querySelector("[data-prop]");
        const poner = (f, salvo = -1) => { ins.forEach((x, i) => { if (i !== salvo) x.value = (t[i] * f).toFixed(1); }); pct.value = (f * 100).toFixed(1).replace(/\.0$/, ""); };
        c.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => {
          c.querySelectorAll("[data-u]").forEach((x) => x.setAttribute("aria-checked", x === b)); poner(+b.dataset.u);
        }));
        ins.forEach((x, i) => (x.oninput = () => { if (prop.checked && +x.value > 0 && t[i] > 0) poner(+x.value / t[i], i); }));
        pct.oninput = () => { if (+pct.value > 0) poner(+pct.value / 100); };
      },
      async aplicar(c) {
        const f = [...c.querySelectorAll("[data-d]")].map((x, i) => (t[i] > 0 ? +x.value / t[i] : 1));
        if (f.some((x) => !(x > 0))) return false;
        return await app.acc.editar("transformar", { matriz: M.escala(...f), apoyar: true }, { encuadrar: true, texto: "Escalando" });
      },
    });
  },

  // ---------------- Recortar ----------------
  plano(app) {
    const c0 = app.S.caja;
    let eje = 2, arriba = false, pos = c0.min[2] + c0.tam[2] * 0.1, tapar = true;
    const previa = () => {
      const n = [0, 0, 0]; n[eje] = arriba ? -1 : 1;
      // Se queda con n·x ≤ d: abajo (n = +eje, d = pos) o arriba (n = −eje, d = −pos)
      app.visor.plano({ n, d: arriba ? -pos : pos });
      return { n, d: arriba ? -pos : pos };
    };
    abrir(app, {
      titulo: "Cortar con un plano",
      html: `<p class="muted">Mueve el plano azul. Lo que se ve en cobre es la cara del corte.</p>
        <div class="campo"><span>Plano perpendicular a</span><div class="seg seg--ancho" role="radiogroup" data-ejes>${["X", "Y", "Z"].map((e, i) => `<button type="button" role="radio" data-e="${i}" aria-checked="${i === eje}">${e}</button>`).join("")}</div></div>
        <label class="campo"><span>Posición <b class="num" data-v="pos"></b></span><input type="range" class="rango" data-pos step="0.1"></label>
        <div class="campo"><span>Conservar</span><div class="seg seg--ancho" role="radiogroup">${[["0", "Lo de abajo"], ["1", "Lo de arriba"]].map(([v, t]) => `<button type="button" role="radio" data-q="${v}" aria-checked="${v === "0"}">${t}</button>`).join("")}</div></div>
        <label class="check"><input type="checkbox" data-tapar checked>Tapar el corte (cara plana, para imprimir)</label>
        ${pie("Cortar")}`,
      alAbrir(c) {
        const r = c.querySelector("[data-pos]");
        const ponerEje = () => {
          r.min = c0.min[eje]; r.max = c0.max[eje]; pos = Math.min(c0.max[eje], Math.max(c0.min[eje], pos));
          if (pos <= c0.min[eje] || pos >= c0.max[eje]) pos = c0.min[eje] + c0.tam[eje] * 0.1;
          r.value = pos; actualizar();
        };
        const actualizar = () => { c.querySelector("[data-v=pos]").textContent = `${mm(pos)} mm`; previa(); };
        c.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => { eje = +b.dataset.e; c.querySelectorAll("[data-e]").forEach((x) => x.setAttribute("aria-checked", x === b)); ponerEje(); }));
        c.querySelectorAll("[data-q]").forEach((b) => (b.onclick = () => { arriba = b.dataset.q === "1"; c.querySelectorAll("[data-q]").forEach((x) => x.setAttribute("aria-checked", x === b)); actualizar(); }));
        r.oninput = () => { pos = +r.value; actualizar(); };
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
    abrir(app, {
      titulo: "Caja de recorte",
      html: `<p class="muted">Se queda lo que está dentro de la caja azul.</p>
        ${["X", "Y", "Z"].map((e, i) => `<div class="rango2"><b data-eje="${e}">${e}</b>
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

  lazo(app) {
    let mascara = null, visibles = true;
    const lienzo = document.getElementById("lazo"), g = lienzo.getContext("2d");
    const cuenta = (c) => { let n = 0; if (mascara) for (let i = 0; i < mascara.length; i++) n += mascara[i]; c.querySelector("[data-v=n]").textContent = n ? `${miles(n)} triángulos marcados` : "Nada marcado"; c.querySelector("[data-aplicar]").disabled = !n; };
    let cuerpo = null;
    const modoDibujo = (on) => {
      lienzo.hidden = !on; app.visor.orbitar(!on);
      if (on) { const r = lienzo.parentElement.getBoundingClientRect(); lienzo.width = r.width * devicePixelRatio; lienzo.height = r.height * devicePixelRatio; }
    };
    let pts = null;
    lienzo.onpointerdown = (e) => { lienzo.setPointerCapture(e.pointerId); pts = [[e.offsetX, e.offsetY]]; };
    lienzo.onpointermove = (e) => {
      if (!pts) return;
      pts.push([e.offsetX, e.offsetY]);
      g.clearRect(0, 0, lienzo.width, lienzo.height); g.save(); g.scale(devicePixelRatio, devicePixelRatio);
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
      g.fillStyle = "rgba(225, 29, 72, .12)"; g.strokeStyle = "#e11d48"; g.lineWidth = 2; g.setLineDash([6, 4]); g.fill(); g.stroke(); g.restore();
    };
    lienzo.onpointerup = async () => {
      const lista = pts; pts = null; g.clearRect(0, 0, lienzo.width, lienzo.height);
      if (!lista || lista.length < 3) return;
      const w = lienzo.clientWidth, h = lienzo.clientHeight;
      const lazo = lista.map(([x, y]) => [(x / w) * 2 - 1, -(y / h) * 2 + 1]);
      const { vp, ojo } = app.visor.vp();
      const r = await app.previa("lazo", { vp, ojo, lazo, soloVisibles: visibles, agregar: mascara });
      mascara = r.mascara; app.visor.mascara(mascara); if (cuerpo) cuenta(cuerpo);
    };
    abrir(app, {
      titulo: "Borrar con lazo",
      html: `<p class="muted">Dibuja alrededor de lo que sobra (la mesa, la tornamesa, el fondo). Puedes dibujar varias veces y girar la vista entre trazos.</p>
        <div class="seg seg--ancho" role="radiogroup"><button type="button" role="radio" data-m="1" aria-checked="true">${ico("lazo")} Dibujar</button><button type="button" role="radio" data-m="0" aria-checked="false">${ico("mover")} Girar la vista</button></div>
        <label class="check"><input type="checkbox" data-vis checked>Solo lo que se ve (no lo de atrás)</label>
        <span class="w-sub" data-v="n">Nada marcado</span>
        <button type="button" class="btn-texto" data-limpiar>Desmarcar todo</button>
        ${pie("Borrar lo marcado")}`,
      alAbrir(c) {
        cuerpo = c;
        c.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { c.querySelectorAll("[data-m]").forEach((x) => x.setAttribute("aria-checked", x === b)); modoDibujo(b.dataset.m === "1"); }));
        c.querySelector("[data-vis]").onchange = (e) => (visibles = e.target.checked);
        c.querySelector("[data-limpiar]").onclick = () => { mascara = null; app.visor.mascara(null); cuenta(c); };
        modoDibujo(true); cuenta(c);
      },
      aplicar: async () => { const m = mascara; mascara = null; modoDibujo(false); return app.acc.editar("borrar", { mascara: m }, { texto: "Borrando" }); },
      limpiar: () => { modoDibujo(false); app.visor.orbitar(true); app.visor.mascara(null); lienzo.onpointerdown = lienzo.onpointermove = lienzo.onpointerup = null; },
    });
  },

  // ---------------- Limpiar ----------------
  // Dos maneras: tocar en el 3D las piezas que se quedan (lo demás se borra), o borrar las chicas
  islas(app) {
    const varias = app.S.diag.piezas > 1;
    let modo = varias ? "tocar" : "chicas", minimo = 0, caras = [], mascara = null, abierta = true;
    const contar = (c) => {
      let n = 0; if (mascara) for (let i = 0; i < mascara.length; i++) n += mascara[i];
      c.querySelector("[data-v=n]").textContent = modo === "tocar" && !caras.length ? "Toca la pieza que quieres conservar" : n ? `Se borran ${miles(n)} triángulos (en rojo)` : "Nada que borrar con esta regla";
      c.querySelector("[data-aplicar]").disabled = !n;
    };
    const previa = async (c) => {
      if (modo === "tocar") {
        mascara = caras.length ? (await app.previa("piezas", { caras })).mascara : null;
      } else mascara = (await app.previa("islas", { minimo })).mascara;
      app.visor.mascara(mascara); contar(c);
    };
    const tocar = (c) => app.visor.elegirCara((hit) => {
      if (!abierta || modo !== "tocar") return;
      caras.push(hit.cara); previa(c); tocar(c);
    });
    abrir(app, {
      titulo: "Quitar piezas sueltas",
      meta: `${app.S.diag.piezas} piezas`,
      html: `<p class="muted">Pedazos de la mesa, la tornamesa o los marcadores que se colaron al escaneo.</p>
        <div class="seg seg--ancho" role="radiogroup"><button type="button" role="radio" data-s="tocar" aria-checked="${modo === "tocar"}">Tocar las que se quedan</button><button type="button" role="radio" data-s="chicas" aria-checked="${modo === "chicas"}">Las chicas</button></div>
        <label class="campo" data-min ${modo === "tocar" ? "hidden" : ""}><span>Más chicas que (triángulos; 0 = automático, 1 % de la mayor)</span><input type="number" min="0" step="50" value="0"></label>
        <span class="w-sub" data-v="n">Buscando…</span>
        <button type="button" class="btn-texto" data-otra ${modo === "tocar" ? "" : "hidden"}>Empezar de nuevo</button>
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
      limpiar: () => { abierta = false; app.visor.elegirCara(null); app.visor.mascara(null); },
    });
  },

  rellenar(app) {
    let lazos = [], max = 200;
    const pintar = (c) => {
      const si = lazos.filter((l) => l.length <= max).length;
      c.querySelector("[data-v=n]").textContent = `Se cierran ${si} de ${lazos.length} huecos`;
      c.querySelector("[data-v=max]").textContent = `${max} aristas`;
      app.visor.lineas(lazos.filter((l) => l.length <= max));
      c.querySelector("[data-aplicar]").disabled = !si;
    };
    abrir(app, {
      titulo: "Rellenar huecos",
      html: `<p class="muted">En naranja, los bordes de los huecos que se van a cerrar. Los grandes (como la base que tocaba la tornamesa) quedan mejor cortando con un plano y tapando.</p>
        <label class="campo"><span>Hasta <b class="num" data-v="max"></b> de borde</span><input type="range" class="rango" data-max min="3" max="3000" step="1" value="${max}"></label>
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
    abrir(app, {
      titulo: "Reparar la malla",
      html: `<ul class="lista-txt"><li>Une los vértices repetidos (la malla queda conectada).</li><li>Quita triángulos rotos o repetidos.</li><li>Pone todas las caras hacia afuera.</li></ul>${pie("Reparar")}`,
      async aplicar() {
        const i = await app.acc.editar("reparar", {}, { texto: "Reparando" });
        if (i) app.avisoVisor(`Reparada: ${i.unidos} vértices unidos, ${i.quitados} triángulos quitados, ${i.volteados} caras volteadas.`, "info");
        return i;
      },
    });
  },

  suavizar(app) {
    let pasadas = 3;
    abrir(app, {
      titulo: "Suavizar",
      html: `<p class="muted">Quita el ruido de la superficie sin encoger la pieza. Más pasadas = más liso, menos detalle.</p>
        <label class="campo"><span>Pasadas: <b class="num" data-v="p">${pasadas}</b></span><input type="range" class="rango" min="1" max="20" value="${pasadas}" data-p></label>
        ${pie("Suavizar")}`,
      alAbrir(c) { c.querySelector("[data-p]").oninput = (e) => { pasadas = +e.target.value; c.querySelector("[data-v=p]").textContent = pasadas; }; },
      aplicar: () => app.acc.editar("suavizar", { pasadas }, { texto: "Suavizando" }),
    });
  },

  simplificar(app) {
    const total = app.S.diag.triangulos;
    let meta = Math.min(total, 100000);
    abrir(app, {
      titulo: "Simplificar",
      html: `<p class="muted">Menos triángulos, casi la misma forma. Conserva el color y la textura.</p>
        <div class="w-cifra"><span data-v="m"></span><small>triángulos</small></div>
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
    abrir(app, {
      titulo: "Color",
      html: `<p>${m.textura ? "El modelo trae textura: una imagen pegada con coordenadas UV. Es lo más nítido." : "El modelo trae un color por vértice."}</p>
        ${m.textura ? `<button type="button" class="btn-pill" data-hornear>Pasar la textura a color por vértice</button><small class="muted">Para formatos sin imagen (3MF de color, PLY, ASC). Se pierde nitidez.</small>` : ""}
        <button type="button" class="btn-pill" data-quitar>Quitar el color</button>`,
      alAbrir(c, h) {
        c.querySelector("[data-hornear]")?.addEventListener("click", async () => { await app.acc.editar("hornear", {}, { texto: "Horneando" }); h.cerrar(); });
        c.querySelector("[data-quitar]").onclick = async () => { await app.acc.editar("quitarColor"); h.cerrar(); };
      },
    });
  },
};

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
    abrir(app, {
      titulo: `Exportar ${f.t}`,
      meta: m.nombre,
      html: `<p class="muted">${esc(f.para)}.</p>
        ${perdida.length ? `<div class="aviso">${ico("alerta")}<span>${esc(f.t)} no guarda ${perdida.join(" ni ")}.</span></div>` : ""}
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
