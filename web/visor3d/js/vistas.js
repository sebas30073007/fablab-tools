// vistas.js - lo que se ve en el panel del Visor 3D. Cada vista recibe (pag, app).
//
// Reglas (docs/laboratorio-ui.md): un widget por renglón · título del widget sin ícono · chevron solo
// si abre algo · cifras en color de texto · un botón dice lo que pasa · el color es dato.

import { esc, ico } from "../../shared/js/ui.js";
import { FORMATOS, USOS, CREALITY } from "./datos.js";

const chev = ico("chev");
const miles = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${Math.round(n / 1000)} mil` : n.toLocaleString("es-MX"));
const mm = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
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
const colorDe = (m) => (m.uv && m.textura ? "Textura" : m.col ? "Color por vértice" : m.faltaTextura ? "Textura sin imagen" : "Sin color");

// Las tres preguntas de la revisión, en lenguaje de uso
function semaforo(d) {
  const imprimir = d.cerrado ? { ok: 1, t: "Lista para laminar" } : { ok: 0, t: `Falta cerrarla: ${d.huecos} ${d.huecos === 1 ? "hueco" : "huecos"}${d.aristasRaras ? `, ${d.aristasRaras} aristas raras` : ""}` };
  const limpia = d.islas ? { ok: 0, t: `${d.islas} ${d.islas === 1 ? "pieza suelta" : "piezas sueltas"}` } : { ok: 1, t: "Sin piezas sueltas" };
  const ligera = d.triangulos > 300000 ? { ok: 0, t: `${miles(d.triangulos)} triángulos: pesada para web` } : { ok: 1, t: "Ligera para web" };
  return { imprimir, limpia, ligera };
}

// ======================================================================
// MODELO (inicio)
// ======================================================================
function inicio(pag, app) {
  const { S } = app, m = S.m, d = S.diag;
  if (!m) {
    pag.innerHTML = `
      <header class="cab0"><h2 tabindex="-1">Visor 3D</h2></header>
      <section class="w w-ahora" aria-label="Empezar">
        <span class="w-cab"><span>Empezar</span></span>
        <span class="w-texto">Abre un modelo 3D</span>
        <span class="w-sub">3MF, PLY, OBJ, STL o GLB. Si trae textura, abre también su PNG. Puedes arrastrarlos al 3D.</span>
        <span class="w-acc">${btn("elegirArchivo", "Abrir archivo", { main: true, icono: "abrir" })}${btn("ejemplo", "Ejemplo: búho")}</span>
      </section>
      ${S.ultimo ? `<section class="w">
        <span class="w-cab"><span>La vez pasada</span></span>
        <span class="w-texto">${esc(S.ultimo.nombre)}</span>
        <span class="w-sub">${miles(S.ultimo.triangulos)} triángulos · ${new Date(S.ultimo.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}</span>
        <span class="w-acc">${btn("seguir", "Seguir con este", { main: true })}${btn("olvidar", "Olvidar")}</span>
      </section>` : ""}
      <button type="button" class="w" data-ir="formatos">
        <span class="w-cab"><span>¿Qué exporto en Creality Scan?</span>${chev}</span>
        <span class="w-sub">Las 7 opciones de exportar y cuál conviene para cada cosa</span>
      </button>
      <a class="w w--enlace" href="../escaner/">
        <span class="w-cab"><span>Escanear con el Pika o el Otter</span>${chev}</span>
        <span class="w-sub">Guía paso a paso de Creality Scan</span>
      </a>`;
    cablear(pag, app);
    return;
  }
  const s = semaforo(d), t = S.caja.tam;
  const fila = (x) => `<span class="sem" data-ok="${x.ok}">${ico(x.ok ? "ok" : "alerta", "ico--s")}${esc(x.t)}</span>`;
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">Modelo</h2></header>
    <section class="w" aria-label="Modelo">
      <span class="w-cab"><span>${esc(m.archivo || m.nombre)}</span></span>
      <span class="w-cifra">${miles(d.triangulos)}<small>triángulos</small></span>
      <span class="w-sub">${mm(t[0])} × ${mm(t[1])} × ${mm(t[2])} mm · ${colorDe(m)}</span>
      <span class="w-acc">${btn("irExportar", "Exportar", { main: true, icono: "bajar" })}${btn("irEditar", "Editar", { icono: "tijeras" })}</span>
    </section>
    <button type="button" class="w" data-ir="revision">
      <span class="w-cab"><span>Revisión</span>${chev}</span>
      <span class="sems">${fila(s.imprimir)}${fila(s.limpia)}${fila(s.ligera)}</span>
    </button>
    <section class="w">
      <span class="w-cab"><span>Acomodar</span></span>
      <span class="w-sub">Si el modelo salió acostado o de cabeza, elige qué cara va abajo.</span>
      <span class="w-acc">${btn("cara", "Elegir la cara de abajo", { icono: "clic" })}<button type="button" class="btn-pill" data-herr="girar">${ico("girar")}Girar</button></span>
    </section>
    <button type="button" class="w" data-ir="formatos">
      <span class="w-cab"><span>¿Qué exporto en Creality Scan?</span>${chev}</span>
      <span class="w-sub">Las 7 opciones de exportar y cuál conviene</span>
    </button>`;
  cablear(pag, app, {
    irExportar: () => app.irA("exportar"), irEditar: () => app.irA("editar"),
    cara: () => app.acc.herramienta("cara"),
  });
}

// ======================================================================
// REVISIÓN
// ======================================================================
function revision(pag, app) {
  const d = app.S.diag;
  if (!d) { app.irA("inicio"); return; }
  const s = semaforo(d);
  const cel = (t, v, ok = null) => `<div class="celda" ${ok == null ? "" : `data-ok="${ok ? 1 : 0}"`}><span>${t}</span><b>${v}</b></div>`;
  const arreglo = (cond, herr, t, sub) => cond ? `<button type="button" class="fila" data-herr="${herr}">${ico("escoba")}<span class="fila__nom">${t}<small>${sub}</small></span><span></span>${chev}</button>` : "";
  pag.innerHTML = `${cab2("Modelo", "Revisión")}
    <section class="w">
      <span class="w-cab"><span>Para qué sirve así</span></span>
      <div class="celdas celdas--col">
        ${cel("Imprimir", s.imprimir.ok ? "Lista" : "Falta cerrarla", s.imprimir.ok)}
        ${cel("Sin basura", s.limpia.ok ? "Sí" : `${d.islas} sueltas`, s.limpia.ok)}
        ${cel("Web y AR", s.ligera.ok ? "Ligera" : "Pesada", s.ligera.ok)}
      </div>
    </section>
    <section class="w">
      <span class="w-cab"><span>La malla</span></span>
      <div class="celdas">
        ${cel("Triángulos", miles(d.triangulos))}${cel("Vértices", miles(d.vertices))}
        ${cel("Huecos", d.huecos, !d.huecos)}${cel("Piezas", d.piezas)}
        ${cel("Aristas raras", d.aristasRaras, !d.aristasRaras)}${cel("Triángulos rotos", d.degenerados, !d.degenerados)}
        ${cel("Área", `${(d.area / 100).toFixed(1)} cm²`)}${cel("Volumen", d.cerrado ? `${(d.volumen / 1000).toFixed(1)} cm³` : "—")}
      </div>
      ${!d.cerrado ? `<span class="w-sub">El volumen solo se puede medir con la malla cerrada.</span>` : ""}
    </section>
    ${d.huecos || d.islas || d.aristasRaras || d.degenerados || d.triangulos > 300000 ? `<section class="w">
      <span class="w-cab"><span>Arreglar</span></span>
      <div class="filas">
        ${arreglo(d.islas, "islas", "Quitar piezas sueltas", `${d.islas} pedazos chicos del escaneo`)}
        ${arreglo(d.huecos, "rellenar", "Rellenar huecos", d.huecosChicos ? `${d.huecosChicos} chicos de ${d.huecos}` : `${d.huecos}; el mayor tiene ${d.bordeMayor} aristas`)}
        ${arreglo(d.aristasRaras || d.degenerados, "reparar", "Reparar la malla", "Une vértices repetidos y quita triángulos rotos")}
        ${arreglo(d.triangulos > 300000, "simplificar", "Simplificar", "Menos triángulos, casi la misma forma")}
      </div>
    </section>` : ""}
    <section class="w">
      <span class="w-cab"><span>Qué es cada cosa</span></span>
      <ul class="lista-txt">
        <li><b>Hueco:</b> una parte que el escáner no vio, como la base que estaba sobre la tornamesa. Para imprimir tiene que estar cerrado.</li>
        <li><b>Pieza suelta:</b> pedazos del fondo o de la mesa que se colaron al escaneo.</li>
        <li><b>Arista rara:</b> la comparten más de dos triángulos. Confunde a los laminadores.</li>
      </ul>
    </section>`;
  cablear(pag, app);
}

// ======================================================================
// EDITAR
// ======================================================================
function editar(pag, app) {
  const { S } = app, d = S.diag;
  if (!S.m) { pag.innerHTML = `<header class="cab0"><h2 tabindex="-1">Editar</h2></header><section class="w"><span class="w-texto muted">Abre un modelo primero</span><span class="w-acc">${btn("elegirArchivo", "Abrir archivo", { main: true, icono: "abrir" })}${btn("ejemplo", "Ejemplo: búho")}</span></section>`; cablear(pag, app); return; }
  const f = (herr, icono, t, val = "") => `<button type="button" class="fila" data-herr="${herr}">${ico(icono)}<span class="fila__nom">${t}</span><span class="fila__val">${val}</span>${chev}</button>`;
  pag.innerHTML = `<header class="cab0"><h2 tabindex="-1">Editar</h2></header>
    <h3 class="titulo-sec">Acomodar</h3>
    <section class="w"><div class="filas">
      ${f("medidas", "regla", "Medidas y escala", `${mm(S.caja.tam[2])} mm alto`)}
      ${f("girar", "girar", "Girar y apoyar")}
      ${f("cara", "clic", "Elegir la cara de abajo")}
    </div></section>
    <h3 class="titulo-sec">Recortar</h3>
    <section class="w"><div class="filas">
      ${f("plano", "plano", "Cortar con un plano")}
      ${f("caja", "caja", "Caja de recorte")}
      ${f("lazo", "lazo", "Borrar con lazo")}
    </div></section>
    <h3 class="titulo-sec">Limpiar</h3>
    <section class="w"><div class="filas">
      ${f("islas", "escoba", "Quitar piezas sueltas", d.islas ? `${d.islas}` : "0")}
      ${f("rellenar", "escoba", "Rellenar huecos", `${d.huecos}`)}
      ${f("reparar", "escoba", "Reparar la malla")}
      ${f("suavizar", "escoba", "Suavizar")}
    </div></section>
    <h3 class="titulo-sec">Aligerar</h3>
    <section class="w"><div class="filas">
      ${f("simplificar", "cubo", "Simplificar", miles(d.triangulos))}
      ${S.m.col || S.m.textura ? f("color", "imagen", "Color", S.m.textura ? "Textura" : "Por vértice") : ""}
    </div></section>
    <div class="fila-wrap">${btn("deshacer", "Deshacer", { icono: "deshacer", dis: !S.puedeDeshacer })}${btn("volverOriginal", "Volver al original", { icono: "girar" })}</div>`;
  cablear(pag, app);
}

// ======================================================================
// EXPORTAR
// ======================================================================
function exportar(pag, app) {
  const { S } = app, m = S.m;
  const uso = USOS.find((u) => u.id === S.uso) || USOS[0];
  const marca = (v, t) => `<span class="guarda" data-v="${v}">${ico(v ? "ok" : "x", "ico--s")}${t}</span>`;
  pag.innerHTML = `<header class="cab0"><h2 tabindex="-1">Exportar</h2></header>
    <section class="w">
      <span class="w-cab"><span>¿Para qué lo quieres?</span></span>
      <div class="seg seg--envuelve" role="radiogroup" aria-label="Uso">${USOS.map((u) => `<button type="button" role="radio" data-uso="${u.id}" aria-checked="${u.id === uso.id}">${u.t}</button>`).join("")}</div>
      <span class="w-sub">${esc(uso.nota)}</span>
    </section>
    <section class="w"><div class="filas">
      ${FORMATOS.map((f) => {
        const rec = uso.rec.includes(f.id);
        return `<button type="button" class="fila fila--formato ${rec ? "es-rec" : ""}" data-fmt="${f.id}" ${!m && !f.pronto ? "disabled" : ""} ${f.pronto ? 'aria-disabled="true"' : ""}>
          <span class="fmt">${esc(f.t.split(" ")[0])}</span>
          <span class="fila__nom">${esc(f.t)}${rec ? `<em class="rec">Recomendado</em>` : ""}${f.pronto ? `<em class="pronto">Próximamente</em>` : ""}<small>${esc(f.para)}</small>
            ${f.pronto || f.ir ? "" : `<span class="guardas">${marca(f.guarda.color, "color")}${marca(f.guarda.textura, "textura")}</span>`}</span>
          <span></span>${f.pronto ? "" : chev}</button>`;
      }).join("")}
    </div></section>
    ${!m ? `<span class="w-sub">Abre un modelo para exportarlo.</span>` : ""}`;
  pag.querySelectorAll("[data-uso]").forEach((b) => (b.onclick = () => { S.uso = b.dataset.uso; app.ls.set("uso", S.uso); app.refrescar(); }));
  pag.querySelectorAll("[data-fmt]").forEach((b) => (b.onclick = () => {
    const f = FORMATOS.find((x) => x.id === b.dataset.fmt);
    if (f.pronto) { app.avisoVisor("STEP llega pronto: por ahora Inventor y Fusion importan STL u OBJ como malla.", "info"); return; }
    if (f.ir) app.irA(f.ir); else app.acc.herramienta("exportar:" + f.id);
  }));
}

// ======================================================================
// FORMATOS DE CREALITY SCAN
// ======================================================================
function formatos(pag, app) {
  pag.innerHTML = `${cab2(app.S.m ? "Modelo" : "Visor 3D", "Exportar en Creality Scan")}
    <section class="w">
      <span class="w-cab"><span>Al terminar de escanear</span></span>
      <span class="w-sub">En Creality Scan: <b>Exportar</b> → elige el formato en la lista. Esto es lo que trae cada opción.</span>
      <div class="filas">${CREALITY.map((c) => `<div class="fila fila--txt">
        <span class="fmt fmt--chico">${esc(c.op.split(" ")[0])}</span>
        <span class="fila__nom">${esc(c.op)}${c.rec ? `<em class="rec">Empieza aquí</em>` : ""}<small>${esc(c.que)} ${esc(c.para)}</small></span></div>`).join("")}</div>
    </section>
    <section class="w">
      <span class="w-cab"><span>Qué conserva cada formato</span></span>
      <table class="tabla">
        <thead><tr><th>Formato</th><th>Color</th><th>Textura</th></tr></thead>
        <tbody>${FORMATOS.filter((f) => !f.ir).map((f) => `<tr><td>${esc(f.t)}${f.pronto ? " <small>(pronto)</small>" : ""}</td><td>${["—", "a medias", "✔"][f.guarda.color]}</td><td>${["—", "a medias", "✔"][f.guarda.textura]}</td></tr>`).join("")}</tbody>
      </table>
      <span class="w-sub">Aquí puedes abrir cualquiera y convertirlo a los demás. Si pasas de textura a un formato sin imagen, el color se hornea en los vértices.</span>
    </section>`;
  cablear(pag, app);
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
const base = { inicio, revision, editar, exportar, formatos, cortes };
export const VISTAS = Object.fromEntries(Object.entries(base).map(([k, f]) => [k, (pag, app) => { if (k !== "cortes") app.visor.rebanadas(null); return f(pag, app); }]));
