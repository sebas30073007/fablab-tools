// vistas.js - lo que se ve en el panel del láser. Cada vista recibe (pag, app) y puede devolver
// { vivo } para actualizar lo que cambia con la máquina sin volver a pintar todo.
//
// Reglas (Casita/OPI, docs/laboratorio-ui.md): un widget por renglón · título del widget sin ícono ·
// chevron solo si abre algo · cifras en color de texto · un botón dice lo que pasa.

import { formatoTiempo } from "../../shared/js/gcode.js";
import { esc, ico, mm } from "../../shared/js/ui.js";
import { MATERIALES, OPERACIONES, PROHIBIDOS, ajustes } from "./materiales.js";
import { AIRE } from "./perfil-s1.js";

const chev = ico("chev");
const masc = (app, k) => `<img class="w-masc" src="${app.MASC[k]}" alt="" onerror="this.remove()">`;
const btn = (acc, txt, { main = false, icono = null, dis = false } = {}) =>
  `<button type="button" class="btn-pill ${main ? "btn-pill--main" : ""}" data-acc="${acc}" ${dis ? "disabled" : ""}>${icono ? ico(icono) : ""}${esc(txt)}</button>`;
function cablear(pag, mapa) {
  pag.querySelectorAll("[data-acc]").forEach((b) => { const f = mapa[b.dataset.acc]; if (f) b.onclick = () => f(b); });
  pag.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => mapa.__irA(b.dataset.ir)));
}
const cab2 = (padre, titulo) => `<header class="cab2"><button type="button" class="btn-atras" data-atras aria-label="Regresar a ${esc(padre)}">${ico("atras")}</button>
  <div class="cab2__txt"><small>${esc(padre)}</small><h2 tabindex="-1">${esc(titulo)}</h2></div></header>`;

// ======================================================================
// Estado de la máquina en una frase corta (chip)
// ======================================================================
function estadoMaquina(app) {
  const { s1, S } = app;
  if (!s1.conectado) return { s: "off", t: "Desconectada" };
  if (!s1.listo) return { s: "espera", t: "Conectando…" };
  const e = s1.est, quien = S.modo === "sim" ? "Simulación" : "S1";
  if (e.tipo === "alarma") return { s: "alarma", t: `${quien} · ${e.estado}` };
  if (e.tipo === "pausa") return { s: "espera", t: `${quien} · En pausa` };
  if (s1.trabajando) return { s: "run", t: `${quien} · ${S.corriendo ? "Cortando" : e.estado}` };
  return { s: "on", t: `${quien} · ${e.estado}` };
}

// ======================================================================
// «Ahora»: el siguiente paso, con su botón
// ======================================================================
export function ahora(app) {
  const { S, s1 } = app;
  if (S.corriendo && S.prog) return { k: "curso", tipo: "curso" };
  if (!s1.conectado) {
    if (!s1.hayWebSerial) return { k: "sinserial", cab: "Ahora", texto: "Abre esta página en Chrome o Edge", masc: "hola", acc: [{ id: "sim", t: "Simulación", main: true }] };
    return { k: "conectar", cab: "Ahora", texto: "Conectar la S1", sub: "Cable USB, máquina encendida y xTool Studio cerrado", masc: "hola", acc: [{ id: "conectar", t: "Conectar", main: true, ico: "usb" }, { id: "sim", t: "Simulación" }] };
  }
  if (!s1.listo) return { k: "esperando", cab: "Ahora", texto: "Conectando…", masc: "hola", acc: [] };
  if (S.alarma || s1.est.tipo === "alarma") {
    const a = S.alarma || { t: s1.est.estado, pasos: [] };
    const tapa = s1.sim?.tapa;
    return { k: `alarma${a.codigo}`, tipo: "alarma", cab: a.t, texto: a.t, pasos: a.pasos, masc: a.codigo === 9 ? "extintor" : "alerta",
      acc: tapa ? [{ id: "tapaSim", t: "Cerrar la tapa", main: true, ico: "tapa" }] : [{ id: "entendido", t: "Entendido", main: true }] };
  }
  if (!S.homed) return { k: "casa", cab: "Ahora", texto: "Mandar el cabezal a casa", sub: "Atrás a la izquierda", masc: "hola", acc: [{ id: "casa", t: "A casa", main: true, ico: "casa" }, { id: "yaCasa", t: "Ya está en casa" }] };
  if (!S.diseno) return { k: "archivo", cab: "Ahora", texto: "Abrir el diseño", sub: "SVG, imagen o .gcode", masc: "archivos", acc: [{ id: "abrir", t: "Abrir archivo", main: true, ico: "abrir" }, { id: "ejemplo", t: "Ejemplo" }] };
  if (!S.materialOk && S.diseno.tipo !== "gcode") return { k: "material", cab: "Ahora", texto: "Elegir el material", sub: "La potencia y la velocidad salen de aquí", masc: "lupa", acc: [{ id: "irMaterial", t: "Material", main: true, ico: "material" }] };
  const t = S.trabajo;
  if (!t || !t.prev) return { k: "vacio", cab: "Ahora", texto: "Nada que cortar", sub: t?.avisos?.[0] || "Revisa las capas del diseño", masc: "piensa", acc: [{ id: "irDiseno", t: "Diseño", main: true }] };
  if (t.fuera) return { k: "fuera", cab: "Ahora", texto: "Colocar el diseño", sub: "Se sale del área de corte", masc: "piensa", acc: [{ id: "irDiseno", t: "Diseño", main: true }] };
  if (S.hecho) return { k: "fin", cab: "Ahora", texto: "Pieza terminada", sub: "Espera a que salga el humo antes de abrir", masc: "pieza", acc: [{ id: "nuevo", t: "Otro diseño", main: true }, { id: "otraVez", t: "Cortar otra" }] };
  if (!S.encuadrado) return { k: "encuadre", cab: "Ahora", texto: "Encuadrar", sub: "El cabezal recorre el contorno sin láser", masc: "encuadrando", acc: [{ id: "encuadrar", t: "Encuadrar", main: true, ico: "ruta" }, { id: "irDiseno", t: "Mover el diseño" }] };
  return { k: "cortar", cab: "Ahora", texto: `Cortar ${S.diseno.nombre}`, sub: `${app.material().t} · ${formatoTiempo(t.tiempo)}`, masc: "hola", acc: [{ id: "cortar", t: "Cortar", main: true, ico: "play" }, { id: "encuadrar", t: "Encuadrar otra vez", ico: "ruta" }] };
}

function ahoraHTML(app, a, ps) {
  const { S, s1 } = app;
  const i = ps.findIndex((p) => p.s === "ahora"), actual = i >= 0 ? ps[i] : null, num = actual ? i + 1 : ps.length;
  const cab = `<button type="button" class="w-pasos" data-ir="pasos" aria-label="Paso ${num} de ${ps.length}${actual ? `, ${actual.nom}` : ", todo hecho"}. Ver los ${ps.length} pasos">
      <span class="w-cab"><span>Paso ${num} de ${ps.length}${actual ? ` · ${esc(actual.nom)}` : ""}</span>${chev}</span>
      <span class="rayitas" aria-hidden="true">${ps.map((p) => `<i class="${p.s === "hecho" ? "on" : p.s}"></i>`).join("")}</span>
    </button>`;
  if (a.tipo === "curso") {
    const pausa = s1.est.tipo === "pausa";
    return `<section class="w w-ahora con-masc" aria-label="Ahora">${cab}
      <span class="w-cab w-ahora__cab"><span>Cortando · ${esc(S.diseno.nombre)}</span></span>
      <span class="w-cifra"><span data-v="pct">0</span><small>%</small></span>
      <span class="w-sub" data-v="quedan">calculando…</span>
      <span class="progreso"><i data-v="barra"></i></span>
      ${masc(app, "cortando")}
      <span class="w-acc"><button type="button" class="btn-pill btn-pill--suave" data-acc="${pausa ? "reanudar" : "pausar"}" style="min-height:50px">${ico(pausa ? "play" : "pausa")}${pausa ? "Reanudar" : "Pausar"}</button>
        <button type="button" class="btn-pill btn-pill--paro" data-acc="paro" style="flex:1;min-height:50px" aria-keyshortcuts="Escape">PARO</button></span>
    </section>`;
  }
  const alarma = a.tipo === "alarma";
  const conMasc = a.acc.length > 0;
  return `<section class="w w-ahora ${conMasc ? "con-masc" : ""} ${alarma ? "w--alarma" : ""}" aria-label="Ahora" ${alarma ? 'role="alert"' : ""}>${cab}
    ${alarma ? `<span class="w-cab w-ahora__cab"><span>Alarma</span></span>` : ""}
    <span class="w-texto">${esc(a.texto)}</span>
    ${a.sub ? `<span class="w-sub">${esc(a.sub)}</span>` : ""}
    ${a.pasos?.length ? `<ol class="w-pasos-alarma">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${conMasc ? masc(app, a.masc) : ""}
    ${a.acc.length ? `<span class="w-acc">${a.acc.map((b) => btn(b.id, b.t, { main: b.main, icono: b.ico })).join("")}</span>` : ""}
  </section>`;
}

// ======================================================================
// Los 6 pasos
// ======================================================================
function pasos(app) {
  const { S, s1 } = app;
  const t = S.trabajo;
  const lista = [
    { id: "maquina", nom: "Máquina", ok: s1.listo && S.homed && s1.est.tipo !== "alarma", val: s1.listo ? (S.modo === "sim" ? "Simulación" : "S1") : "", ir: "maquina" },
    { id: "archivo", nom: "Archivo", ok: !!S.diseno, val: S.diseno?.nombre || "", ir: "diseno" },
    { id: "material", nom: "Material", ok: S.materialOk || S.diseno?.tipo === "gcode", val: S.materialOk ? app.material().t : "", ir: "material" },
    { id: "posicion", nom: "Posición", ok: !!t?.prev && !t.fuera, val: t?.prev ? `${mm(t.caja.x, 0)}, ${mm(t.caja.y, 0)} mm` : "", ir: "diseno" },
    { id: "encuadre", nom: "Encuadre", ok: S.encuadrado, val: S.encuadrado ? "Hecho" : "", ir: "inicio" },
    { id: "cortar", nom: "Cortar", ok: S.hecho, val: t?.prev ? formatoTiempo(t.tiempo) : "", ir: "inicio" },
  ];
  const actual = lista.findIndex((p) => !p.ok);
  lista.forEach((p, i) => (p.s = p.ok ? "hecho" : i === actual ? "ahora" : ""));
  return lista;
}

// ======================================================================
// INICIO
// ======================================================================
function inicio(pag, app) {
  const { S, acc } = app;
  let clave = null;
  const pintar = () => {
    const a = ahora(app), em = estadoMaquina(app), ps = pasos(app), M = app.material(), d = S.diseno, t = S.trabajo;
    pag.innerHTML = `
      <header class="cab0"><h2 tabindex="-1">Láser</h2>
        <button type="button" class="chip" data-ir="maquina" data-s="${em.s}" data-v="chip"><span class="punto" aria-hidden="true"></span><span data-v="chip-t">${esc(em.t)}</span></button></header>
      ${ahoraHTML(app, a, ps)}
      <button type="button" class="w ${d?.miniatura || d?.previa ? "con-thumb" : ""}" data-ir="diseno">
        <span class="w-cab"><span>Diseño</span>${chev}</span>
        ${d ? `<span class="w-texto">${esc(d.nombre)}</span><span class="w-sub">${mm(d.ancho * S.lugar.escala, 1)} × ${mm(d.alto * S.lugar.escala, 1)} mm${t?.pasos?.length ? ` · ${t.pasos.map((p) => p.t).join(", ")}` : ""}</span>
          ${t?.fuera ? `<span class="w-sub w-sub--atencion">${ico("alerta")}Se sale del área</span>` : ""}
          ${d.miniatura || d.previa ? `<img class="w-thumb" src="${d.miniatura || d.previa}" alt="">` : ""}`
        : `<span class="w-texto muted">Sin diseño</span>`}
      </button>
      <button type="button" class="w" data-ir="material">
        <span class="w-cab"><span>Material</span>${chev}</span>
        <span class="fila-wrap"><span class="muestra" style="background:${M.tono}"></span><span class="w-texto">${S.materialOk ? esc(M.t) : "Sin elegir"}</span></span>
        ${S.materialOk ? `<span class="w-sub">${M.validado ? `Probado ${esc(M.validado)}` : "Valores de partida, sin probar en el lab"}</span>` : ""}
      </button>
      ${t?.prev ? `<button type="button" class="w" data-acc="trabajo">
        <span class="w-cab"><span>Trabajo</span>${chev}</span>
        <span class="celdas"><span class="celda"><span>Tiempo</span><b>${formatoTiempo(t.tiempo)}</b></span><span class="celda"><span>Líneas</span><b>${t.lineas.length}</b></span></span>
      </button>` : ""}`;
    cablear(pag, {
      __irA: app.irA,
      conectar: () => acc.conectar("real"), sim: () => acc.conectar("sim"), casa: acc.casa, yaCasa: acc.yaEnCasa,
      entendido: acc.entendido, tapaSim: acc.tapaSim,
      abrir: acc.elegirArchivo, ejemplo: acc.cargarEjemplo, irMaterial: () => app.irA("material"), irDiseno: () => app.irA("diseno"),
      encuadrar: acc.encuadrar, cortar: acc.cortar, trabajo: acc.abrirTrabajo,
      nuevo: () => { acc.quitarDiseno(); acc.materialNuevo(); }, otraVez: () => { acc.materialNuevo(); S.hecho = false; S.encuadrado = false; app.refrescar(); },
      pausar: () => { acc.pausar(); setTimeout(app.refrescar, 300); }, reanudar: () => { acc.reanudar(); setTimeout(app.refrescar, 300); }, paro: acc.paro,
    });
    if (clave && a.k !== clave && a.texto) app.anunciar(`${a.cab}: ${a.texto}`);
    clave = a.k;
  };
  pintar();
  const claveGlobal = () => `${ahora(app).k}|${app.s1.est.tipo}|${S.homed}|${S.encuadrado}|${estadoMaquina(app).s}|${!!S.trabajo}`;
  let ultima = claveGlobal();
  return {
    vivo() {
      const k = claveGlobal();
      if (k !== ultima) { ultima = k; const st = pag.parentElement?.scrollTop; pintar(); if (pag.parentElement) pag.parentElement.scrollTop = st; return; }
      const em = estadoMaquina(app);
      const chip = pag.querySelector('[data-v="chip"]');
      if (chip) { chip.dataset.s = em.s; pag.querySelector('[data-v="chip-t"]').textContent = em.t; }
      if (S.prog) {
        const ac = S.prog.acum, tot = ac ? ac[ac.length - 1] : 0, hecho = ac ? ac[Math.min(S.prog.h, ac.length - 1)] : 0;
        const f = tot > 0 ? hecho / tot : S.prog.n ? S.prog.h / S.prog.n : 0;
        const pct = pag.querySelector('[data-v="pct"]'); if (pct) pct.textContent = Math.floor(f * 100);
        const barra = pag.querySelector('[data-v="barra"]'); if (barra) barra.style.width = `${f * 100}%`;
        const q = pag.querySelector('[data-v="quedan"]');
        if (q) {
          const seg = (performance.now() - S.prog.t0) / 1000;
          q.textContent = tot > 0 ? `lleva ${formatoTiempo(seg)} · quedan ~${formatoTiempo(Math.max(0, tot - hecho))}` : `lleva ${formatoTiempo(seg)}`;
        }
      }
    },
  };
}

// ======================================================================
// PASOS
// ======================================================================
function vistaPasos(pag, app) {
  const ps = pasos(app);
  pag.innerHTML = `${cab2("Inicio", "Pasos")}
    <section class="w"><span class="filas">${ps.map((p) => `
      <button type="button" class="fila" data-ir="${p.ir}">
        <span class="marca-paso" data-s="${p.s}">${p.s === "hecho" ? ico("ok") : ""}</span>
        <span class="fila__nom">${p.nom}${p.s === "ahora" ? "<small>Sigue</small>" : ""}</span>
        <span class="fila__val">${esc(p.val)}</span>${chev}
      </button>`).join("")}</span></section>`;
  cablear(pag, { __irA: app.irA });
  pag.querySelector("[data-atras]").onclick = app.regresar;
}

// ======================================================================
// MÁQUINA
// ======================================================================
function maquina(pag, app) {
  const { S, s1, acc, PERFIL } = app;
  const em = estadoMaquina(app), e = s1.est;
  pag.innerHTML = `${cab2("Inicio", "Máquina")}
    <section class="w" aria-labelledby="m-con">
      <span class="w-cab"><span id="m-con">Conexión</span></span>
      <span class="w-texto">${esc(em.t)}</span>
      <div class="seg seg--ancho" role="radiogroup" aria-label="Con qué trabajar" style="margin-top:10px">
        <button type="button" role="radio" data-modo="real" aria-checked="${S.modo === "real"}">S1 por USB</button>
        <button type="button" role="radio" data-modo="sim" aria-checked="${S.modo === "sim"}">Simulación</button>
      </div>
      <span class="w-acc">${s1.conectado ? btn("conectar", "Desconectar") : btn("conectar", "Conectar", { main: true, icono: S.modo === "sim" ? "sim" : "usb" })}</span>
    </section>
    <section class="w" aria-labelledby="m-pos">
      <span class="w-cab"><span id="m-pos">Cabezal</span></span>
      <span class="celdas"><span class="celda" data-ok="${S.homed ? 1 : 0}"><span>Casa</span><b>${S.homed ? "Hecha" : "Pendiente"}</b></span>
        <span class="celda"><span>Área</span><b class="mono" style="font-size:14px">${e.area.x} × ${e.area.y} mm</b></span></span>
      <span class="celdas"><span class="celda"><span>Aire</span><b>${AIRE[e.aire] ?? e.aire}</b></span>
        <span class="celda"><span>Estado M222</span><b class="mono" style="font-size:14px">${e.codigo ?? "—"}</b></span></span>
      <span class="w-acc">${btn("casa", "A casa", { icono: "casa", dis: !s1.listo || s1.trabajando })}</span>
    </section>
    ${s1.sim ? `<section class="w" aria-labelledby="m-sim"><span class="w-cab"><span id="m-sim">Simulación</span></span>
      <div class="seg seg--ancho seg--mono" role="radiogroup" aria-label="Velocidad de la simulación" style="margin-top:8px">${[1, 5, 20, 50].map((v) => `<button type="button" role="radio" data-vel="${v}" aria-checked="${s1.sim.velocidad === v}">${v}×</button>`).join("")}</div>
      <span class="w-acc">${btn("tapaSim", s1.sim.tapa ? "Cerrar la tapa" : "Abrir la tapa", { icono: "tapa" })}</span></section>` : ""}
    <details class="desp">
      <summary><span></span><span>Perfil de la S1</span><span class="desp__resumen">por confirmar</span>${chev}</summary>
      <div class="desp__cuerpo"><span class="filas">
        <span class="fila"><span></span><span class="fila__nom">Velocidad del puerto</span><span class="fila__val">${PERFIL.baud}</span><span></span></span>
        <span class="fila"><span></span><span class="fila__nom">Potencia al 100 %</span><span class="fila__val">S${PERFIL.sMax}</span><span></span></span>
        <span class="fila"><span></span><span class="fila__nom">Búfer</span><span class="fila__val">${PERFIL.rx} B</span><span></span></span>
        ${e.info ? `<span class="fila"><span></span><span class="fila__nom">Respuesta a M2003</span><span class="fila__val">${Object.keys(e.info).length} datos</span><span></span></span>` : ""}
      </span><a class="btn-texto" href="diagnostico.html">${ico("usb")}Diagnóstico de la conexión</a></div>
    </details>
    <section class="w" aria-labelledby="m-est">
      <span class="w-cab"><span id="m-est">Apariencia</span></span>
      <div class="seg seg--ancho" role="radiogroup" aria-label="Apariencia" style="margin-top:8px">
        <button type="button" role="radio" data-estilo="lab" aria-checked="${S.estilo === "lab"}">Laboratorio</button>
        <button type="button" role="radio" data-estilo="sebs" aria-checked="${S.estilo === "sebs"}">SEBS</button>
      </div>
    </section>
    <footer class="cartela cartela--compacta" aria-label="Ficha">
      <span class="cartela__nombre">FAB-01</span>
      <dl class="cartela__campos">
        <div class="cartela__campo"><dt>Máquina</dt><dd>xTool S1</dd></div>
        <div class="cartela__campo"><dt>Enlace</dt><dd>USB · G-code</dd></div>
        <div class="cartela__campo"><dt>Estado</dt><dd><i class="dot ${s1.conectado ? "dot--active" : ""}" aria-hidden="true"></i>${!s1.conectado ? "OFFLINE" : S.modo === "sim" ? "SIM" : e.tipo === "alarma" ? "ALARM" : "LIVE"}</dd></div>
      </dl>
    </footer>`;
  cablear(pag, { __irA: app.irA, conectar: () => acc.conectar(), casa: acc.casa, tapaSim: acc.tapaSim });
  pag.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => acc.cambiarModo(b.dataset.modo)));
  pag.querySelectorAll("[data-vel]").forEach((b) => (b.onclick = () => { acc.velocidadSim(+b.dataset.vel); pag.querySelectorAll("[data-vel]").forEach((x) => x.setAttribute("aria-checked", x === b)); }));
  pag.querySelectorAll("[data-estilo]").forEach((b) => (b.onclick = () => acc.ponerEstilo(b.dataset.estilo)));
  pag.querySelector("[data-atras]").onclick = app.regresar;
  const k = () => `${estadoMaquina(app).s}|${S.homed}|${s1.est.aire}|${s1.est.codigo}|${s1.sim?.tapa}`;
  let antes = k();
  return { vivo() { const n = k(); if (n !== antes) { antes = n; app.refrescar(); } } };
}

// ======================================================================
// DISEÑO: capas → operación, tamaño y lugar en la cama
// ======================================================================
const MODOS = { jarvis: "Jarvis", floyd: "Floyd", umbral: "Umbral", gris: "Grises" };
function diseno(pag, app) {
  const { S, acc } = app;
  const d = S.diseno, t = S.trabajo, L = S.lugar;
  if (!d) {
    pag.innerHTML = `${cab2("Inicio", "Diseño")}
      <section class="w con-masc"><span class="w-cab"><span>Archivo</span></span>
        <span class="w-texto">Abre tu diseño</span><span class="w-sub">SVG (Inkscape, Illustrator), PNG o JPG, o un .gcode</span>
        ${masc(app, "archivos")}
        <span class="w-acc">${btn("abrir", "Abrir archivo", { main: true, icono: "abrir" })}${btn("ejemplo", "Ejemplo")}</span></section>
      <details class="desp"><summary><span></span><span>Colores en el SVG</span><span></span>${chev}</summary>
        <div class="desp__cuerpo"><ol class="w-pasos-alarma" style="margin:0">
          <li>Trazo rojo: corte</li><li>Trazo de otro color: marcado</li><li>Relleno sin trazo: grabado</li>
          <li>Se cambia aquí después de abrirlo</li><li>Textos: convertirlos a trayecto antes de guardar</li></ol></div></details>`;
    cablear(pag, { __irA: app.irA, abrir: acc.elegirArchivo, ejemplo: acc.cargarEjemplo });
    pag.querySelector("[data-atras]").onclick = app.regresar;
    return;
  }
  const W = d.ancho * L.escala, H = d.alto * L.escala;
  const campo = (k, txt, v, paso = 0.5, dis = false) => `<label class="campo"><span>${txt}</span><span class="u"><input type="number" step="${paso}" data-l="${k}" value="${+v.toFixed(2)}" ${dis ? "disabled" : ""}><i>mm</i></span></label>`;
  const opsDe = (c) => (c.relleno ? ["grabado", "nada"] : ["corte", "marcado", "nada"]);
  const nombreOp = (o) => (o === "nada" ? "No" : OPERACIONES[o].t);
  const gcode = d.tipo === "gcode";
  pag.innerHTML = `${cab2("Inicio", d.nombre)}
    ${d.avisos.map((a) => `<div class="aviso">${ico("alerta")}<span>${esc(a)}</span></div>`).join("")}
    ${d.miniatura || d.previa ? `<section class="w"><img class="previa ${d.previa ? "previa--img" : ""}" src="${d.previa || d.miniatura}" alt="Vista previa de ${esc(d.nombre)}"></section>` : ""}
    ${d.capas.length ? `<section class="w" aria-labelledby="d-capas"><span class="w-cab"><span id="d-capas">Capas</span></span>
      ${d.capas.map((c) => `<div class="capa"><span class="capa__color" style="background:${c.color}"></span>
        <span class="capa__nom">${c.relleno ? "Relleno" : "Trazo"}<small>${c.trazos.length} figura${c.trazos.length > 1 ? "s" : ""}</small></span>
        <div class="seg" role="radiogroup" aria-label="Qué hacer con la capa ${c.color}">${opsDe(c).map((o) => `<button type="button" role="radio" data-capa="${c.id}" data-op="${o}" aria-checked="${c.op === o}">${nombreOp(o)}</button>`).join("")}</div></div>`).join("")}
    </section>` : ""}
    ${d.imagen ? `<section class="w" aria-labelledby="d-img"><span class="w-cab"><span id="d-img">Imagen</span></span>
      <div class="seg seg--ancho" role="radiogroup" aria-label="Tramado" style="margin-top:6px">${Object.entries(MODOS).map(([k, v]) => `<button type="button" role="radio" data-modo="${k}" aria-checked="${d.imagen.modo === k}">${v}</button>`).join("")}</div>
      <div class="campos campos--2" style="margin-top:8px">
        <label class="campo"><span>Brillo</span><input type="number" step="10" min="-120" max="120" data-im="brillo" value="${d.imagen.brillo}"></label>
        <label class="campo"><span>Contraste</span><input type="number" step="10" min="-120" max="120" data-im="contraste" value="${d.imagen.contraste}"></label>
      </div>
      <label class="check" style="margin-top:6px"><input type="checkbox" data-invertir ${d.imagen.invertir ? "checked" : ""}> Invertir (para materiales oscuros)</label>
    </section>` : ""}
    <section class="w" aria-labelledby="d-lugar"><span class="w-cab"><span id="d-lugar">Tamaño y lugar</span></span>
      <div class="campos campos--2" style="margin-top:6px">
        ${campo("ancho", "Ancho", W, 1, gcode)}<label class="campo"><span>Alto</span><span class="u"><input type="number" value="${+H.toFixed(2)}" disabled><i>mm</i></span></label>
        ${campo("x", "Desde la izquierda", L.x, 1, gcode)}${campo("y", "Desde el fondo", L.y, 1, gcode)}
      </div>
      ${t?.fuera ? `<div class="aviso">${ico("alerta")}<span>Se sale del área de ${app.PERFIL.area.x} × ${app.PERFIL.area.y} mm.</span></div>` : ""}
      <span class="w-acc">${gcode ? "" : btn("centrar", "Centrar en el material")}${btn("ir", "Llevar el cabezal ahí", { icono: "mira", dis: !app.s1.listo || app.s1.trabajando || !t?.prev })}</span>
    </section>
    <section class="w" aria-labelledby="d-pieza"><span class="w-cab"><span id="d-pieza">Hoja de material en la cama</span></span>
      <div class="campos campos--2" style="margin-top:6px">
        <label class="campo"><span>Ancho</span><span class="u"><input type="number" step="1" data-p="ancho" value="${S.pieza.ancho}"><i>mm</i></span></label>
        <label class="campo"><span>Alto</span><span class="u"><input type="number" step="1" data-p="alto" value="${S.pieza.alto}"><i>mm</i></span></label>
        <label class="campo"><span>Desde la izquierda</span><span class="u"><input type="number" step="1" data-p="x" value="${S.pieza.x}"><i>mm</i></span></label>
        <label class="campo"><span>Desde el fondo</span><span class="u"><input type="number" step="1" data-p="y" value="${S.pieza.y}"><i>mm</i></span></label>
      </div>
    </section>
    <span class="fila-wrap" style="justify-content:space-between">${btn("abrir", "Abrir otro", { icono: "abrir" })}${t?.lineas?.length ? `<button type="button" class="btn-texto" data-acc="bajar">${ico("bajar")}.gcode</button>` : ""}</span>`;
  cablear(pag, { __irA: app.irA, abrir: acc.elegirArchivo, centrar: acc.centrarEnPieza, ir: acc.irAlDiseno,
    bajar: () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t.lineas.join("\n") + "\n"])); a.download = `${d.nombre}.gcode`; a.click(); } });
  pag.querySelectorAll("[data-capa]").forEach((b) => (b.onclick = () => acc.ponerOp(b.dataset.capa, b.dataset.op)));
  pag.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => acc.ponerImagen("modo", b.dataset.modo)));
  pag.querySelectorAll("[data-im]").forEach((i) => (i.onchange = () => acc.ponerImagen(i.dataset.im, +i.value || 0)));
  const inv = pag.querySelector("[data-invertir]"); if (inv) inv.onchange = () => acc.ponerImagen("invertir", inv.checked);
  pag.querySelectorAll("[data-l]").forEach((i) => (i.onchange = () => (i.dataset.l === "ancho" ? acc.ponerTamano(+i.value) : acc.ponerLugar(i.dataset.l, +i.value))));
  pag.querySelectorAll("[data-p]").forEach((i) => (i.onchange = () => acc.ponerPieza(i.dataset.p, +i.value)));
  pag.querySelector("[data-atras]").onclick = app.regresar;
}

// ======================================================================
// MATERIAL: la biblioteca y los ajustes de cada operación
// ======================================================================
function material(pag, app) {
  const { S, acc } = app;
  const M = app.material();
  const fila = (x) => `<button type="button" class="fila" data-mat="${x.id}" aria-pressed="${S.materialOk && x.id === M.id}">
      <span class="muestra" style="background:${x.tono}"></span>
      <span class="fila__nom">${esc(x.t)}<small>${x.validado ? `Probado ${esc(x.validado)}` : "Sin probar en el lab"}</small></span>
      <span class="fila__val">${S.materialOk && x.id === M.id ? ico("ok") : ""}</span><span></span></button>`;
  const campos = (op) => {
    const a = ajustes(M, op, S.propios); if (!a) return "";
    const c = (k, txt, u, paso, min, max) => `<label class="campo"><span>${txt}</span><span class="u"><input type="number" data-op="${op}" data-k="${k}" step="${paso}" min="${min}" max="${max}" value="${a[k]}"><i>${u}</i></span></label>`;
    return `<section class="w"><span class="w-cab"><span class="op-t"><span class="cuad" style="background:var(--d-${op})"></span>${OPERACIONES[op].t}</span></span>
      <div class="campos campos--2" style="margin-top:6px">
        ${c("potencia", "Potencia", "%", 1, 1, 100)}${c("velocidad", "Velocidad", "mm/s", 1, 1, 600)}
        ${c("pasadas", "Pasadas", "", 1, 1, 10)}${c("aire", "Aire", "0–4", 1, 0, 4)}
        ${op === "grabado" ? c("densidad", "Densidad", "líneas/mm", 1, 2, 20) : ""}
      </div></section>`;
  };
  pag.innerHTML = `${cab2("Inicio", "Material")}
    <section class="w"><span class="filas">${MATERIALES.map(fila).join("")}</span></section>
    ${M.nota ? `<div class="aviso">${ico("alerta")}<span>${esc(M.nota)}</span></div>` : ""}
    ${S.materialOk ? `${["corte", "marcado", "grabado"].map(campos).join("")}
      <button type="button" class="btn-texto" data-acc="defecto" style="align-self:center">Valores de la biblioteca</button>` : ""}
    <details class="desp"><summary><span></span><span>Nunca en la láser</span><span class="desp__resumen">${PROHIBIDOS.length}</span>${chev}</summary>
      <div class="desp__cuerpo"><ul class="lista-no">${PROHIBIDOS.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></details>`;
  pag.querySelectorAll("[data-mat]").forEach((b) => (b.onclick = () => acc.elegirMaterial(b.dataset.mat)));
  pag.querySelectorAll("input[data-op]").forEach((i) => (i.onchange = () => acc.ponerAjuste(i.dataset.op, i.dataset.k, +i.value)));
  cablear(pag, { __irA: app.irA, defecto: acc.ajustesPorDefecto });
  pag.querySelector("[data-atras]").onclick = app.regresar;
}

// ======================================================================
// MOVER
// ======================================================================
function mover(pag, app) {
  const { S, s1, acc } = app;
  const p = app.pasoJog;
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">Mover</h2></header>
    <div class="aviso" data-v="alarma" hidden role="alert">${ico("alerta")}<span style="flex:1">Alarma: la máquina no se mueve.</span></div>
    <section class="w" aria-label="Posición del cabezal">
      <div class="pos">
        <b data-eje="X">X</b><span class="pos__v" data-v="x">—</span>
        <b data-eje="Y">Y</b><span class="pos__v" data-v="y">—</span>
      </div>
      <span class="w-sub">Desde la esquina de atrás a la izquierda</span>
    </section>
    <section class="w" aria-label="Mover el cabezal">
      <div class="pad" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight">
        <span></span><button type="button" data-j="0,-1" data-eje="Y" aria-label="Hacia el fondo">Fondo</button><span></span><span></span><span></span>
        <button type="button" data-j="-1,0" data-eje="X" aria-label="A la izquierda">X−</button>
        <button type="button" class="pad__centro" data-casa aria-label="Mandar a casa">${ico("casa")}</button>
        <button type="button" data-j="1,0" data-eje="X" aria-label="A la derecha">X+</button><span></span><span></span>
        <span></span><button type="button" data-j="0,1" data-eje="Y" aria-label="Hacia el frente">Frente</button><span></span><span></span><span></span>
      </div>
      <div class="seg seg--ancho seg--mono" role="radiogroup" aria-label="Paso en mm">${[1, 10, 50, 100].map((v) => `<button type="button" role="radio" data-paso="${v}" aria-checked="${p === v}">${v} mm</button>`).join("")}</div>
    </section>
    <span class="fila-wrap">${btn("diseno", "Ir al diseño", { icono: "mira", dis: !S.trabajo?.prev })}${btn("centro", "Al centro")}</span>`;
  pag.querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => { const [x, y] = b.dataset.j.split(",").map(Number); acc.jog(x, y); }));
  pag.querySelector("[data-casa]").onclick = acc.casa;
  pag.querySelectorAll("[data-paso]").forEach((b) => (b.onclick = () => { acc.ponerPasoJog(+b.dataset.paso); pag.querySelectorAll("[data-paso]").forEach((x) => x.setAttribute("aria-checked", x === b)); }));
  cablear(pag, { __irA: app.irA, diseno: acc.irAlDiseno, centro: () => acc.irA(app.PERFIL.area.x / 2, app.PERFIL.area.y / 2) });
  const botones = [...pag.querySelectorAll(".pad button, .fila-wrap [data-acc]")];
  let antes = null;
  return { vivo() {
    const ok = s1.listo, q = s1.sim ? s1.sim.pos : s1.est.pos;
    pag.querySelector('[data-v="x"]').innerHTML = ok ? `${mm(q.x, 1)}<small>mm</small>` : "—";
    pag.querySelector('[data-v="y"]').innerHTML = ok ? `${mm(q.y, 1)}<small>mm</small>` : "—";
    const alarma = ok && s1.est.tipo === "alarma";
    pag.querySelector('[data-v="alarma"]').hidden = !alarma;
    const d = !ok || s1.trabajando || alarma;
    if (d !== antes) { antes = d; botones.forEach((b) => (b.disabled = d)); }
  } };
}

// ======================================================================
// CONSOLA
// ======================================================================
function consolaVista(pag, app) {
  const { acc } = app;
  pag.classList.add("pag--consola");
  pag.innerHTML = `<header class="cab0"><h2 tabindex="-1">Consola</h2><button type="button" class="btn-texto" data-limpiar style="margin-left:auto">Limpiar</button></header>
    <div data-sitio style="display:flex;flex:1;min-height:0"></div>
    <form class="envio" autocomplete="off"><input id="cmd" placeholder="G-code o M-code" aria-label="Comando" spellcheck="false"><button type="submit" class="btn-pill btn-pill--main">Enviar</button></form>
    <span class="fila-wrap">${["M222", "M303", "M2003", "M223", "M15"].map((c) => `<button type="button" class="btn-pill btn-pill--suave mono" data-cmd="${c}" style="min-height:36px">${c}</button>`).join("")}</span>`;
  pag.querySelector("[data-sitio]").appendChild(app.consola);
  app.consola.scrollTop = app.consola.scrollHeight;
  const inp = pag.querySelector("#cmd");
  let hi = app.hist.length;
  pag.querySelector("form").onsubmit = (e) => { e.preventDefault(); acc.enviarComando(inp.value); hi = app.hist.length; inp.value = ""; };
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && hi > 0) { inp.value = app.hist[--hi]; e.preventDefault(); }
    if (e.key === "ArrowDown") { hi = Math.min(app.hist.length, hi + 1); inp.value = app.hist[hi] || ""; e.preventDefault(); }
  });
  pag.querySelectorAll("[data-cmd]").forEach((b) => (b.onclick = () => acc.enviarComando(b.dataset.cmd)));
  pag.querySelector("[data-limpiar]").onclick = acc.limpiarConsola;
  const habil = () => { const ok = app.s1.listo; inp.disabled = !ok; pag.querySelectorAll("[data-cmd], [type=submit]").forEach((b) => (b.disabled = !ok)); };
  habil();
  return { vivo: habil };
}

export const VISTAS = { inicio, mover, consola: consolaVista, pasos: vistaPasos, maquina, diseno, material };
