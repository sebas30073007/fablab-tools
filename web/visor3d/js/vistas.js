// vistas.js - el panel del Visor 3D: Modelo (sus propiedades), Exportar y Cortes. Cada vista recibe
// (pag, app). Las herramientas no viven aquí: están en la barra del 3D y abren su hoja.
//
// Reglas (docs/laboratorio-ui.md): un widget por renglón · cifras en color de texto · el color es dato ·
// un botón dice lo que pasa. El visor es universal: nada de una marca o un escáner en particular.

import { esc, ico } from "../../shared/js/ui.js";
import { FORMATOS, USOS } from "./datos.js";

const chev = ico("chev");
const miles = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${Math.round(n / 1000)} mil` : n.toLocaleString("es-MX"));
const mm = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
const peso = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const btn = (acc, txt, { main = false, icono = null, dis = false } = {}) =>
  `<button type="button" class="btn-pill ${main ? "btn-pill--main" : ""}" data-acc="${acc}" ${dis ? "disabled" : ""}>${icono ? ico(icono) : ""}${esc(txt)}</button>`;
const cab2 = (padre, titulo) => `<header class="cab2"><button type="button" class="btn-atras" data-atras aria-label="Regresar a ${esc(padre)}">${ico("atras")}</button>
  <div class="cab2__txt"><small>${esc(padre)}</small><h2 tabindex="-1">${esc(titulo)}</h2></div></header>`;
function cablear(pag, app, mapa = {}) {
  pag.querySelectorAll("[data-acc]").forEach((b) => { const f = mapa[b.dataset.acc] || app.acc[b.dataset.acc]; if (f) b.onclick = () => f(b); });
  pag.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => app.irA(b.dataset.ir)));
  pag.querySelectorAll("[data-herr]").forEach((b) => (b.onclick = () => app.acc.herramienta(b.dataset.herr)));
  pag.querySelector("[data-atras]")?.addEventListener("click", () => app.regresar());
}
// Íconos a color de color y textura (definidos en index.html); en gris pálido si no hay
const insignia = (tipo, si, txt) => `<span class="insignia" data-si="${si ? 1 : 0}"><svg aria-hidden="true"><use href="#c-${tipo}"/></svg>${txt ? `<span>${esc(txt)}</span>` : ""}</span>`;

// ======================================================================
// MODELO: sus propiedades
// ======================================================================
function inicio(pag, app) {
  const { S } = app, m = S.m, d = S.diag;
  if (!m) {
    pag.innerHTML = `
      <header class="cab0"><h2 tabindex="-1">Visor 3D</h2></header>
      <section class="w">
        <span class="w-texto">Abre un modelo 3D</span>
        <span class="w-sub">3MF, PLY, OBJ, STL, GLB o .zip. Si trae textura, abre también su imagen. Puedes arrastrarlos al 3D.</span>
        <span class="w-acc">${btn("elegirArchivo", "Abrir archivo", { main: true, icono: "abrir" })}${btn("ejemplo", "Ver un ejemplo")}</span>
      </section>
      ${S.ultimo ? `<section class="w">
        <span class="w-cab"><span>Último modelo</span></span>
        <span class="w-texto">${esc(S.ultimo.nombre)}</span>
        <span class="w-sub">${miles(S.ultimo.triangulos)} triángulos · ${new Date(S.ultimo.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</span>
        <span class="w-acc">${btn("seguir", "Abrirlo", { main: true })}${btn("olvidar", "Olvidar")}</span>
      </section>` : ""}`;
    cablear(pag, app);
    return;
  }
  const t = S.caja.tam;
  const tex = !!(m.uv && m.textura), col = !!m.col;
  const fila = (nom, val, extra = "") => `<div class="prop"><span>${nom}</span><b class="num">${val}</b>${extra}</div>`;
  const estado = (ok, txt, herr, accion) => `<div class="prop prop--estado" data-ok="${ok ? 1 : 0}">${ico(ok ? "ok" : "alerta", "ico--s")}<span>${esc(txt)}</span>${!ok && herr ? `<button type="button" class="btn-texto" data-herr="${herr}">${esc(accion)}</button>` : ""}</div>`;
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">Modelo</h2></header>
    <section class="w" aria-label="Archivo">
      <span class="w-cab"><span class="mono">${esc(m.archivo || m.nombre)}</span>${m.peso ? `<span class="muted num">${peso(m.peso)}</span>` : ""}</span>
      <span class="w-cifra">${miles(d.triangulos)}<small>triángulos · ${miles(d.vertices)} vértices</small></span>
      <span class="insignias">${insignia("color", col, col ? "Color por vértice" : "Sin color")}${insignia("textura", tex, tex ? "Textura" : m.faltaTextura ? "Falta la imagen" : "Sin textura")}</span>
    </section>
    <section class="w" aria-label="Medidas">
      <span class="w-cab"><span>Medidas</span><button type="button" class="btn-texto" data-herr="medidas">Escalar</button></span>
      <div class="props">
        ${fila(`<b class="eje" data-eje="X">X</b> Ancho`, `${mm(t[0])} mm`)}
        ${fila(`<b class="eje" data-eje="Y">Y</b> Fondo`, `${mm(t[1])} mm`)}
        ${fila(`<b class="eje" data-eje="Z">Z</b> Alto`, `${mm(t[2])} mm`)}
        ${fila("Volumen", d.cerrado ? `${(d.volumen / 1000).toFixed(1)} cm³` : "—", d.cerrado ? "" : `<small class="muted">solo con la malla cerrada</small>`)}
        ${fila("Área", `${(d.area / 100).toFixed(1)} cm²`)}
      </div>
    </section>
    <section class="w" aria-label="Malla">
      <span class="w-cab"><span>Malla</span></span>
      <div class="props">
        ${estado(d.cerrado, d.cerrado ? "Cerrada (hermética)" : "Abierta", d.huecos ? "rellenar" : "reparar", d.huecos ? "Cerrar" : "Reparar")}
        ${estado(d.piezas === 1, d.piezas === 1 ? "1 pieza" : `${d.piezas} piezas`, "islas", "Quitar")}
        ${estado(!d.huecos, d.huecos ? `${d.huecos} ${d.huecos === 1 ? "hueco" : "huecos"}` : "Sin huecos", "rellenar", "Rellenar")}
        ${d.aristasRaras || d.degenerados ? estado(false, `${d.aristasRaras + d.degenerados} errores de malla`, "reparar", "Reparar") : ""}
        ${estado(d.triangulos <= 300000, d.triangulos <= 300000 ? "Ligera" : `Pesada: ${miles(d.triangulos)} triángulos`, "simplificar", "Simplificar")}
      </div>
    </section>`;
  cablear(pag, app);
}

// ======================================================================
// EXPORTAR
// ======================================================================
function exportar(pag, app) {
  const { S } = app, m = S.m;
  const uso = USOS.find((u) => u.id === S.uso) || USOS[0];
  pag.innerHTML = `<header class="cab0"><h2 tabindex="-1">Exportar</h2></header>
    <section class="w">
      <span class="w-cab"><span>¿Para qué lo quieres?</span></span>
      <div class="usos" role="radiogroup" aria-label="Uso">${USOS.map((u) => `<button type="button" role="radio" data-uso="${u.id}" aria-checked="${u.id === uso.id}">${u.t}</button>`).join("")}</div>
      <span class="w-sub">${esc(uso.nota)}</span>
    </section>
    <div class="formatos">${FORMATOS.map((f) => {
      const rec = uso.rec.includes(f.id);
      return `<button type="button" class="formato ${rec ? "es-rec" : ""}" data-fmt="${f.id}" ${(!m && !f.pronto) || f.pronto ? "disabled" : ""}>
        ${rec ? `<span class="formato__rec">★ Recomendado</span>` : f.pronto ? `<span class="formato__rec formato__rec--pronto">Pronto</span>` : ""}
        <span class="formato__t">${esc(f.id === "cortes" ? "Cortes" : f.t)}</span>
        <span class="formato__para">${esc(f.id === "cortes" ? "SVG · DXF para láser y CNC" : f.para)}</span>
        ${f.ir || f.pronto ? "" : `<span class="formato__ins">${insignia("color", f.guarda.color)}${insignia("textura", f.guarda.textura)}</span>`}
      </button>`;
    }).join("")}</div>
    ${!m ? `<span class="w-sub">Abre un modelo para exportarlo.</span>` : `<span class="leyenda">${insignia("color", true, "guarda el color")}${insignia("textura", true, "guarda la textura")}</span>`}`;
  pag.querySelectorAll("[data-uso]").forEach((b) => (b.onclick = () => { S.uso = b.dataset.uso; app.ls.set("uso", S.uso); app.refrescar(); }));
  pag.querySelectorAll("[data-fmt]").forEach((b) => (b.onclick = () => {
    const f = FORMATOS.find((x) => x.id === b.dataset.fmt);
    if (f.ir) app.irA(f.ir); else app.acc.herramienta("exportar:" + f.id);
  }));
}

// ======================================================================
// CORTES (láser y CNC)
// ======================================================================
function cortes(pag, app) {
  const { S } = app, o = S.cortes;
  if (!S.m) { app.irA("exportar"); return; }
  const t = S.caja.tam, ejeT = ["X", "Y", "Z"][o.eje], n = Math.max(1, Math.floor(t[o.eje] / o.paso));
  pag.innerHTML = `${cab2("Exportar", "Cortes para láser o CNC")}
    <section class="w">
      <span class="w-cab"><span>Rebanadas</span></span>
      <span class="w-sub">El modelo se parte en capas del grosor de tu material. Al cortarlas y pegarlas en orden, vuelve a salir la pieza.</span>
      <div class="campos campos--2">
        <label class="campo"><span>Grosor del material</span><span class="u"><input type="number" min="0.5" max="50" step="0.5" value="${o.paso}" data-c="paso"><i>mm</i></span></label>
        <label class="campo"><span>Apilar a lo largo de</span><select data-c="eje">${["X", "Y", "Z (alto)"].map((e, i) => `<option value="${i}" ${i === o.eje ? "selected" : ""}>${e}</option>`).join("")}</select></label>
        <label class="campo"><span>Hoja: ancho</span><span class="u"><input type="number" min="50" max="2000" value="${o.ancho}" data-c="ancho"><i>mm</i></span></label>
        <label class="campo"><span>Hoja: alto</span><span class="u"><input type="number" min="50" max="2000" value="${o.alto}" data-c="alto"><i>mm</i></span></label>
      </div>
      <span class="w-sub">${n} rebanadas de ${o.paso} mm a lo largo de ${ejeT} (${mm(t[o.eje])} mm).</span>
      <span class="w-acc">${btn("rebanar", "Ver rebanadas", { main: true })}</span>
    </section>
    <div data-v="resultado"></div>`;
  pag.querySelectorAll("[data-c]").forEach((i) => (i.onchange = () => { o[i.dataset.c] = +i.value; app.ls.set("cortes", o); app.refrescar(); }));
  const pintar = async () => {
    const r = await app.acc.cortes({ eje: o.eje, paso: o.paso, ancho: o.ancho, alto: o.alto });
    if (!r) return;
    app.visor.rebanadas(r.rebanadas, o.eje);
    const res = pag.querySelector("[data-v=resultado]");
    res.innerHTML = `<section class="w">
      <span class="w-cab"><span>${r.rebanadas.length} rebanadas en ${r.hojas.length} ${r.hojas.length === 1 ? "hoja" : "hojas"}</span></span>
      ${r.grandes ? `<span class="w-sub w-sub--atencion">${ico("alerta")}${r.grandes} no caben en la hoja: escala el modelo o usa una hoja más grande.</span>` : ""}
      <div class="hojas-prev">${r.hojas.map((h, i) => `<figure><div class="hoja-svg">${h.svg.replace(/^<\?xml[^>]*>/, "")}</div><figcaption>Hoja ${i + 1} · ${h.piezas} piezas</figcaption></figure>`).join("")}</div>
      <span class="w-acc">${btn("svg", "Descargar SVG", { main: true, icono: "bajar" })}${btn("dxf", "Descargar DXF", { icono: "bajar" })}</span>
      <span class="w-acc">${btn("laser", "Abrir en el láser", { icono: "laser" })}${btn("cnc", "Abrir en la CNC")}</span>
      <span class="w-sub">El láser y la CNC abren la primera hoja; las demás, descárgalas y ábrelas después.</span>
    </section>`;
    const nombre = app.S.m.nombre;
    const bajar = async (tipo) => {
      const archivos = r.hojas.map((h, i) => ({ nombre: `${nombre}-hoja${i + 1}.${tipo}`, datos: new TextEncoder().encode(h[tipo]) }));
      if (archivos.length === 1) { const { descargar } = await import("../../shared/js/ui.js"); descargar(archivos[0].nombre, new Blob([archivos[0].datos])); return; }
      const { zipSync } = await import("../../shared/vendor/three/addons/libs/fflate.module.js");
      const { descargar } = await import("../../shared/js/ui.js");
      descargar(`${nombre}-cortes-${tipo}.zip`, new Blob([zipSync(Object.fromEntries(archivos.map((a) => [a.nombre, a.datos])))]));
    };
    cablear(res, app, {
      svg: () => bajar("svg"), dxf: () => bajar("dxf"),
      laser: () => app.acc.enviarA("laser", { nombre: `${nombre}-hoja1.svg`, tipo: "svg", texto: r.hojas[0].svg }),
      cnc: () => app.acc.enviarA("cnc", { nombre: `${nombre}-hoja1.dxf`, tipo: "dxf", texto: r.hojas[0].dxf }),
    });
  };
  cablear(pag, app, { rebanar: pintar });
}

// Las rebanadas del 3D solo se ven en su página
const base = { inicio, exportar, cortes };
export const VISTAS = Object.fromEntries(Object.entries(base).map(([k, f]) => [k, (pag, app) => { if (k !== "cortes") app.visor.rebanadas(null); return f(pag, app); }]));
