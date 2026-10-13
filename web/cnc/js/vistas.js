// vistas.js - lo que se ve en el panel. Cada vista recibe (pag, app) y puede devolver { vivo }
// para actualizar lo que cambia con el estado de GRBL sin volver a pintar todo.
//
// Reglas (Casita/OPI): un widget por renglón · título del widget sin ícono · chevron solo si abre
// algo · cifras en color de texto · un botón dice lo que pasa · nada de frases que expliquen el botón.

import { ALARMAS, ESTADOS } from "./alarmas.js";
import { formatoTiempo } from "./gcode.js";
import { esc, ico, mm, ls, miniJog, descargar } from "./ui.js";
import { aPNG, vista } from "./raster.js";
import { anchoV, igualHerr } from "./cam.js";
import { MATERIALES } from "./materiales.js";
import { HERRAMIENTAS, CAMPOS, NOTAS, BROCAS, resumen, atraviesa, dibujosPistas, dibujosHoyos, dibujosContorno, dibujosComun, dibujosGrabado, dibujosVaciado } from "./herramientas.js";

const chev = ico("chev");
const masc = (app, k) => `<img class="w-masc" src="${app.MASC[k]}" alt="" onerror="this.remove()">`;
const hecho = (t) => t.estado === "hecho" || t.estado === "omitido";
// Lo que está abierto: una PCB o la pieza de un dibujo DXF/SVG
const queEs = (S) => (S.pcb?.vector ? "Pieza" : "PCB");
const superficie = (app) => (app.acc.mat().conduce ? "Superficie del cobre" : `Superficie del ${app.acc.mat().t.toLowerCase()}`);
const btn = (acc, txt, { main = false, icono = null, dis = false, texto = false } = {}) =>
  `<button type="button" class="${texto ? "btn-texto" : `btn-pill ${main ? "btn-pill--main" : ""}`}" data-acc="${acc}" ${dis ? "disabled" : ""}>${icono ? ico(icono) : ""}${esc(txt)}</button>`;
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
  const { grbl, S } = app;
  if (!grbl.conectado) return { s: "off", t: "Desconectada" };
  if (!grbl.listo) return { s: "espera", t: "Conectando…" };
  const e = grbl.est.estado;
  const quien = S.modo === "sim" ? "Simulación" : "Cubiko";
  if (e === "Alarm") return { s: "alarma", t: `${quien} · Alarma` };
  if (["Run", "Jog", "Home"].includes(e)) return { s: "run", t: `${quien} · ${ESTADOS[e]}` };
  if (e === "Hold") return { s: "espera", t: `${quien} · En pausa` };
  return { s: "on", t: `${quien} · ${ESTADOS[e] || e}` };
}

// ======================================================================
// «Ahora»: el siguiente paso, con su botón
// ======================================================================
export function ahora(app) {
  const { S, grbl, acc } = app;
  const e = grbl.est.estado;
  if (S.corriendo && S.prog) return { k: "curso", tipo: "curso" };
  if (!grbl.conectado) {
    if (!grbl.hayWebSerial) return { k: "sinserial", cab: "Ahora", texto: "Abre esta página en Chrome o Edge", masc: "hola", acc: [{ id: "sim", t: "Simulación", main: true }] };
    return { k: "conectar", cab: "Ahora", texto: "Conectar la Cubiko", masc: "hola", acc: [{ id: "conectar", t: "Conectar", main: true, ico: "usb" }, { id: "sim", t: "Simulación" }] };
  }
  if (!grbl.listo) return { k: "esperando", cab: "Ahora", texto: "Conectando…", masc: "hola", acc: [] };
  if (S.alarma === "bloqueo" || (e === "Alarm" && S.alarma == null)) return { k: "bloqueo", tipo: "alarma", cab: "Bloqueada", texto: "Hacer homing", masc: "alerta", acc: [{ id: "homing", t: "Homing", main: true, ico: "casa" }, { id: "desbloquear", t: "Desbloquear" }] };
  if (e === "Alarm" && S.alarma != null) {
    const a = ALARMAS[S.alarma] || { t: `Alarma ${S.alarma}`, pasos: [], accion: "desbloquear" };
    const h = a.accion === "homing";
    return { k: `alarma${S.alarma}`, tipo: "alarma", cab: `ALARM:${S.alarma}`, texto: a.t, pasos: a.pasos, masc: "alerta",
      acc: [{ id: h ? "homing" : "desbloquear", t: h ? "Homing" : "Desbloquear", main: true, ico: h ? "casa" : "candado" }, { id: h ? "desbloquear" : "homing", t: h ? "Desbloquear" : "Homing" }] };
  }
  if (e === "Home") return { k: "homing", cab: "Ahora", texto: "Homing…", masc: "fresando", acc: [] };
  if (!S.homed) return { k: "home", cab: "Ahora", texto: "Hacer homing", masc: "hola", acc: [{ id: "homing", t: "Homing", main: true, ico: "casa" }, { id: "desbloquear", t: "Ya está en casa" }] };
  if (!S.pcb && !S.trabajos.length) return { k: "archivos", cab: "Ahora", texto: "Abrir la placa", sub: "Gerber de KiCad, DXF, SVG o .nc", masc: "archivos", acc: [{ id: "abrir", t: "Abrir archivos", main: true, ico: "abrir" }, { id: "ejemplo", t: "Ejemplo" }] };
  if (S.pcb && !S.trabajos.length) return { k: "generar" + S.generando, cab: "Ahora", texto: S.generando ? "Calculando trayectorias…" : "Generar trayectorias", sub: S.pcb.nombre, masc: "archivos", acc: S.generando ? [] : [{ id: "generar", t: "Generar", main: true }, { id: "verPlaca", t: "Ajustar" }] };
  if (!S.xyListo) return { k: "xy", cab: "Ahora", texto: "Fijar X0 Y0", sub: "Esquina inferior izquierda del material", masc: "hola", acc: [{ id: "mover", t: "Mover", main: true, ico: "mover" }] };
  const t = acc.siguienteTrabajo();
  if (!t) return { k: "fin", cab: "Ahora", texto: S.pcb?.vector ? "Pieza terminada" : "Placa terminada", masc: "placa", acc: [{ id: "nueva", t: S.pcb?.vector ? "Nueva pieza" : "Nueva placa", main: true }] };
  if (!S.zListo) return { k: "z" + t.id, cab: "Ahora", texto: "Calibrar Z", sub: t.herramienta, masc: "sonda", acc: [{ id: "paso", t: "Empezar", main: true }, { id: "zmanual", t: "Sin sonda" }] };
  if (S.herramientaZ && !igualHerr(t.herramienta, S.herramientaZ) && t.origen === "cam") return { k: "cambio" + t.id, cab: "Ahora", texto: `Cambiar a ${t.herramienta}`, sub: `para ${t.nombre}`, masc: "sonda", acc: [{ id: "paso", t: "Empezar", main: true }, { id: "misma", t: "Misma fresa", texto: true }] };
  return { k: "fresar" + t.id, cab: "Ahora", texto: `Fresar ${t.nombre}`, sub: `${t.herramienta} · ${formatoTiempo(t.prev.tiempo)}`, masc: "hola", acc: [{ id: "paso", t: "Fresar", main: true, ico: "play" }, { id: "aire", t: "Prueba en aire", ico: "aire" }] };
}

// Un solo widget: arriba en qué paso vas (abre los 6 pasos), abajo lo que toca ahora con su botón
function ahoraHTML(app, a, ps) {
  const { S, grbl } = app;
  const i = ps.findIndex((p) => p.s === "ahora"), actual = i >= 0 ? ps[i] : null, num = actual ? i + 1 : ps.length;
  const cab = `<button type="button" class="w-pasos" data-tour="pasos" data-ir="pasos" aria-label="Paso ${num} de ${ps.length}${actual ? `, ${actual.nom}` : ", todo hecho"}. Ver los ${ps.length} pasos">
      <span class="w-cab"><span>Paso ${num} de ${ps.length}${actual ? ` · ${esc(actual.nom)}` : ""}</span>${chev}</span>
      <span class="rayitas" aria-hidden="true">${ps.map((p) => `<i class="${p.s === "hecho" ? "on" : p.s}"></i>`).join("")}</span>
    </button>`;
  if (a.tipo === "curso") {
    const t = S.trabajos.find((x) => x.id === S.corriendo);
    const pausa = grbl.est.estado === "Hold";
    const idx = S.trabajos.indexOf(t);
    const luego = S.prog.aire ? null : S.trabajos.slice(idx + 1).find((x) => !hecho(x));
    const total = S.trabajos.reduce((s, x) => s + Math.max(1, x.prev.tiempo), 0);
    return `<section class="w w-ahora con-masc" aria-label="Ahora" data-tour="ahora">${cab}
      <span class="w-cab w-ahora__cab"><span>${S.prog.aire ? "Prueba en aire" : "En curso"} · ${esc(t.nombre)}</span></span>
      <span class="w-cifra"><span data-v="pct">0</span><small>%</small></span>
      <span class="w-sub" data-v="quedan">calculando…</span>
      <span class="progreso"><i data-v="barra"></i></span>
      <span class="tira" aria-hidden="true">${S.trabajos.map((x) => `<i style="flex:${Math.max(1, x.prev.tiempo) / total}${x.id === t.id ? ";background:var(--d-actual)" : ""}" class="${x.estado === "hecho" ? "on" : ""}"></i>`).join("")}</span>
      ${luego ? `<span class="w-sub" style="margin-top:6px">Luego: ${esc(luego.nombre)} · ${esc(luego.herramienta)}</span>` : ""}
      ${masc(app, "fresando")}
      <span class="w-acc"><button type="button" class="btn-pill btn-pill--suave" data-acc="${pausa ? "reanudar" : "pausar"}" style="min-height:50px">${ico(pausa ? "play" : "pausa")}${pausa ? "Reanudar" : "Pausar"}</button>
        <button type="button" class="btn-pill btn-pill--paro" data-acc="paro" style="flex:1;min-height:50px" aria-keyshortcuts="Escape">PARO</button></span>
    </section>`;
  }
  const alarma = a.tipo === "alarma";
  // La mascota solo cuando hay botones: sin ellos el widget queda bajo y solo se le vería la cabeza
  const conMasc = a.acc.length > 0;
  return `<section class="w w-ahora ${conMasc ? "con-masc" : ""} ${alarma ? "w--alarma" : ""}" aria-label="Ahora" data-tour="ahora" ${alarma ? 'role="alert"' : ""}>${cab}
    ${alarma ? `<span class="w-cab w-ahora__cab"><span>${esc(a.cab)}</span></span>` : ""}
    <span class="w-texto">${esc(a.texto)}</span>
    ${a.sub ? `<span class="w-sub">${esc(a.sub)}</span>` : ""}
    ${a.pasos?.length ? `<ol class="w-pasos-alarma">${a.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>` : ""}
    ${conMasc ? masc(app, a.masc) : ""}
    ${a.acc.length ? `<span class="w-acc">${a.acc.map((b) => btn(b.id, b.t, { main: b.main, icono: b.ico, texto: b.texto })).join("")}</span>` : ""}
  </section>`;
}

// ======================================================================
// Pasos de la placa
// ======================================================================
function pasos(app) {
  const { S, grbl } = app;
  const todos = S.trabajos.length > 0 && S.trabajos.every(hecho);
  const lista = [
    { id: "maquina", nom: "Máquina", ok: grbl.listo && S.homed && grbl.est.estado !== "Alarm", val: grbl.listo ? (S.modo === "sim" ? "Simulación" : "Cubiko") : "", ir: "maquina" },
    { id: "archivos", nom: "Archivos", ok: !!S.pcb || S.trabajos.some((t) => t.origen === "nc"), val: S.pcb?.nombre || "", ir: "placa" },
    { id: "tray", nom: "Trayectorias", ok: S.trabajos.length > 0, val: S.trabajos.length ? `${S.trabajos.length} trabajos` : "", ir: "placa" },
    { id: "xy", nom: "X0 Y0", ok: S.xyListo, val: S.alinear ? "Alineada" : "", ir: "origen" },
    { id: "z", nom: "Z0", ok: S.zListo, val: S.zListo ? S.herramientaZ || "" : "", ir: "origen" },
    { id: "fresar", nom: "Fresar", ok: todos, val: S.trabajos.length ? `${S.trabajos.filter(hecho).length} de ${S.trabajos.length}` : "", ir: "inicio" },
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
    const a = ahora(app);
    const em = estadoMaquina(app);
    const ps = pasos(app);
    const t = S.trabajos;
    const cel = (lbl, ok, val) => `<span class="celda" data-ok="${ok ? 1 : 0}"><span>${lbl}</span><b>${esc(val)}</b></span>`;
    pag.innerHTML = `
      <header class="cab0"><h2 tabindex="-1">CNC</h2>
        <button type="button" class="chip" data-tour="estado" data-ir="maquina" data-s="${em.s}" data-v="chip"><span class="punto" aria-hidden="true"></span><span data-v="chip-t">${esc(em.t)}</span></button></header>
      ${ahoraHTML(app, a, ps)}
      <button type="button" class="w ${S.pcb ? "con-thumb" : ""}" data-tour="w-placa" data-ir="placa">
        <span class="w-cab"><span>${queEs(S)}</span>${chev}</span>
        ${S.pcb ? `<span class="w-texto">${esc(S.pcb.nombre)}</span><span class="w-sub">${mm(S.pcb.marco.placa.x1 - S.pcb.marco.placa.x0, 1)} × ${mm(S.pcb.marco.placa.y1 - S.pcb.marco.placa.y0, 1)} mm · material ${mm(S.material.ancho, 0)} × ${mm(S.material.alto, 0)}</span>
          ${acc.holgura()?.cabe === false ? `<span class="w-sub w-sub--atencion">${ico("alerta")}No cabe en el material</span>` : ""}
          <img class="w-thumb" src="${S.pcb.miniatura}" alt="">`
        : t.length ? `<span class="w-texto">${esc(t[0].nombre)}</span><span class="w-sub">${t.length} archivo${t.length > 1 ? "s" : ""} .nc</span>`
        : `<span class="w-texto muted">Sin archivos</span>`}
      </button>
      <button type="button" class="w" data-tour="w-origen" data-ir="origen">
        <span class="w-cab"><span>Origen</span>${chev}</span>
        <span class="celdas celdas--col">${cel("X0 Y0", S.xyListo, S.xyListo ? (S.alinear ? "Alineada" : "Fijado") : "Pendiente")}${cel(S.zListo && S.mapa?.completo && S.usarMapa && acc.mat().conduce ? "Z0 · con mapa" : "Z0", S.zListo, S.zListo ? S.herramientaZ || "Fijado" : "Pendiente")}</span>
      </button>
      ${t.length ? `<section class="w" aria-labelledby="w-trab" data-tour="trabajos">
        <span class="w-cab"><span id="w-trab">Trabajos</span></span>
        <span class="filas">${t.map((x) => `<button type="button" class="fila" data-trabajo="${x.id}">
          <span class="cuad" style="background:${app.hex(x.id)}"></span>
          <span class="fila__nom">${esc(x.nombre)}<small>${esc(x.herramienta)}</small></span>
          ${x.estado === "hecho" ? `<span class="fila__ok">${ico("ok")}Hecho</span>` : x.estado === "omitido" ? `<span class="fila__val">Omitido</span>` : `<span class="fila__val">${formatoTiempo(x.prev.tiempo)}</span>`}
          ${chev}</button>`).join("")}</span>
      </section>` : ""}`;
    cablear(pag, {
      __irA: app.irA,
      conectar: () => acc.conectar("real"), sim: () => acc.conectar("sim"), homing: acc.homing, desbloquear: acc.desbloquear,
      abrir: acc.elegirArchivos, ejemplo: acc.cargarEjemplo, generar: acc.generar, verPlaca: () => app.irA("placa"),
      mover: () => app.irA("mover"), nueva: acc.nuevaPlaca,
      paso: () => acc.siguientePaso(acc.siguienteTrabajo()), zmanual: () => acc.asistenteZManual(acc.siguienteTrabajo()),
      misma: () => acc.mismaFresa(acc.siguienteTrabajo()),
      aire: () => acc.correrTrabajo(acc.siguienteTrabajo(), { aire: true }),
      pausar: () => { acc.pausar(); setTimeout(app.refrescar, 300); }, reanudar: () => { acc.reanudar(); setTimeout(app.refrescar, 300); }, paro: acc.paro,
    });
    pag.querySelectorAll("[data-trabajo]").forEach((b) => (b.onclick = () => acc.abrirTrabajo(S.trabajos.find((x) => x.id === b.dataset.trabajo))));
    if (clave && a.k !== clave && a.texto) app.anunciar(`${a.cab}: ${a.texto}`);
    clave = a.k;
  };
  pintar();
  const claveGlobal = () => `${ahora(app).k}|${app.grbl.est.estado === "Hold"}|${S.homed}|${S.xyListo}|${S.zListo}|${estadoMaquina(app).s}`;
  let ultima = claveGlobal();
  return {
    vivo() {
      const k = claveGlobal();
      if (k !== ultima) { ultima = k; const st = pag.parentElement?.scrollTop; pintar(); if (pag.parentElement) pag.parentElement.scrollTop = st; return; }
      const em = estadoMaquina(app);
      const chip = pag.querySelector('[data-v="chip"]');
      if (chip) { chip.dataset.s = em.s; pag.querySelector('[data-v="chip-t"]').textContent = em.t; }
      if (S.prog) {
        // Por tiempo estimado, no por líneas: una línea puede ser un corte largo o un ajuste de Z
        const ac = S.prog.acum, tot = ac ? ac[ac.length - 1] : 0, hecho = ac ? ac[Math.min(S.prog.h, ac.length - 1)] : 0;
        const f = tot > 0 ? hecho / tot : S.prog.n ? S.prog.h / S.prog.n : 0;
        const pct = pag.querySelector('[data-v="pct"]'); if (pct) pct.textContent = Math.floor(f * 100);
        const barra = pag.querySelector('[data-v="barra"]'); if (barra) barra.style.width = `${f * 100}%`;
        const q = pag.querySelector('[data-v="quedan"]');
        if (q) {
          // Lo que falta según el G-code, corregido por el ritmo real cuando ya hay con qué medirlo
          // (GRBL confirma líneas antes de ejecutarlas, así que el ritmo se acota)
          const seg = (performance.now() - S.prog.t0) / 1000;
          const medido = hecho >= 30 && seg >= 10 ? Math.min(3, Math.max(0.02, seg / hecho)) : 1;
          S.prog.ritmo = S.prog.ritmo == null ? medido : S.prog.ritmo * 0.97 + medido * 0.03;   // suavizado: que no brinque
          const ritmo = S.prog.ritmo;
          const lleva = `lleva ${formatoTiempo(seg)}`;
          q.textContent = tot > 0 ? `${lleva} · quedan ~${formatoTiempo(Math.max(0, tot - hecho) * ritmo)}` : `${lleva} · línea ${S.prog.h} de ${S.prog.n}`;
        }
      }
    },
  };
}

// ======================================================================
// PASOS: los 6 pasos, con dónde se hace cada uno
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
const NOMBRES_AJUSTES = {
  20: "Límites por software", 21: "Límites físicos", 22: "Homing", 23: "Dirección del homing", 24: "Homing lento mm/min", 25: "Homing rápido mm/min",
  27: "Retroceso del homing mm", 30: "Husillo máx. rpm", 31: "Husillo mín. rpm", 32: "Modo láser",
  100: "Pasos/mm X", 101: "Pasos/mm Y", 102: "Pasos/mm Z", 110: "Velocidad máx. X", 111: "Velocidad máx. Y", 112: "Velocidad máx. Z",
  120: "Aceleración X", 121: "Aceleración Y", 122: "Aceleración Z", 130: "Recorrido X mm", 131: "Recorrido Y mm", 132: "Recorrido Z mm",
};
function maquina(pag, app) {
  const { S, grbl, acc } = app;
  const em = estadoMaquina(app);
  const aj = grbl.ajustes;
  const area = aj[130] ? `${aj[130]} × ${aj[131]} × ${aj[132]} mm` : "145 × 110 × 40 mm";
  pag.innerHTML = `${cab2("Inicio", "Máquina")}
    <section class="w" aria-labelledby="m-con">
      <span class="w-cab"><span id="m-con">Conexión</span></span>
      <span class="w-texto">${esc(em.t)}</span>
      <div class="seg seg--ancho" role="radiogroup" aria-label="Con qué trabajar" style="margin-top:10px">
        <button type="button" role="radio" data-modo="real" aria-checked="${S.modo === "real"}">Cubiko por USB</button>
        <button type="button" role="radio" data-modo="sim" aria-checked="${S.modo === "sim"}">Simulación</button>
      </div>
      <span class="w-acc">${grbl.conectado ? btn("conectar", "Desconectar") : btn("conectar", "Conectar", { main: true, icono: S.modo === "sim" ? "sim" : "usb" })}</span>
    </section>
    <section class="w" aria-labelledby="m-pos">
      <span class="w-cab"><span id="m-pos">Posición</span></span>
      <span class="celdas"><span class="celda" data-ok="${S.homed ? 1 : 0}"><span>Homing</span><b>${S.homed ? "Hecho" : "Pendiente"}</b></span>
        <span class="celda"><span>Área</span><b class="mono" style="font-size:14px">${area}</b></span></span>
      <span class="w-acc">${btn("homing", "Homing", { icono: "casa", dis: !grbl.listo })}${btn("desbloquear", "Desbloquear", { icono: "candado", dis: !grbl.listo })}</span>
    </section>
    ${grbl.sim ? `<section class="w" aria-labelledby="m-sim"><span class="w-cab"><span id="m-sim">Velocidad de la simulación</span></span>
      <div class="seg seg--ancho seg--mono" role="radiogroup" aria-label="Velocidad de la simulación" style="margin-top:8px">${[1, 5, 20, 50].map((v) => `<button type="button" role="radio" data-vel="${v}" aria-checked="${grbl.sim.velocidad === v}">${v}×</button>`).join("")}</div></section>` : ""}
    <details class="desp" ${Object.keys(aj).length ? "" : "hidden"}>
      <summary><span></span><span>Ajustes de GRBL</span><span class="desp__resumen">${Object.keys(aj).length}</span>${chev}</summary>
      <div class="desp__cuerpo"><span class="filas">${Object.entries(aj).map(([k, v]) => `<span class="fila"><span class="mono muted">$${k}</span><span class="fila__nom" style="font-weight:500">${NOMBRES_AJUSTES[k] || ""}</span><span class="fila__val">${v}</span><span></span></span>`).join("")}</span></div>
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
        <div class="cartela__campo"><dt>Máquina</dt><dd>Cubiko</dd></div>
        ${grbl.grblVer ? `<div class="cartela__campo"><dt>FW</dt><dd>${esc(grbl.grblVer)}</dd></div>` : ""}
        <div class="cartela__campo"><dt>Estado</dt><dd><i class="dot ${grbl.conectado ? "dot--active" : ""}" aria-hidden="true"></i>${!grbl.conectado ? "OFFLINE" : S.modo === "sim" ? "SIM" : grbl.est.estado === "Alarm" ? "ALARM" : "LIVE"}</dd></div>
      </dl>
    </footer>`;
  cablear(pag, { __irA: app.irA, conectar: () => acc.conectar(), homing: acc.homing, desbloquear: acc.desbloquear });
  pag.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => acc.cambiarModo(b.dataset.modo)));
  pag.querySelectorAll("[data-vel]").forEach((b) => (b.onclick = () => { acc.velocidadSim(+b.dataset.vel); pag.querySelectorAll("[data-vel]").forEach((x) => x.setAttribute("aria-checked", x === b)); }));
  pag.querySelectorAll("[data-estilo]").forEach((b) => (b.onclick = () => acc.ponerEstilo(b.dataset.estilo)));
  pag.querySelector("[data-atras]").onclick = app.regresar;
  let antes = `${em.s}|${grbl.grblVer}|${Object.keys(aj).length}|${S.homed}`;
  return { vivo() { const k = `${estadoMaquina(app).s}|${grbl.grblVer}|${Object.keys(grbl.ajustes).length}|${S.homed}`; if (k !== antes) { antes = k; app.refrescar(); } } };
}

// ======================================================================
// PCB: archivos, material, configuración (página aparte) e imagen en blanco y negro
// ======================================================================
const TIPOS = { "cobre-sup": "Cobre", "cobre-inf": "Cobre inferior", contorno: "Contorno", taladro: "Taladros", job: "Trabajo KiCad", nc: "G-code", dxf: "Dibujo DXF", svg: "Dibujo SVG", otro: "No se usa" };
// Al enfocar o señalar un campo se resalta en el dibujo lo que cambia (data-k = clave del campo)
function resaltar(raiz, clave) { raiz.querySelectorAll("svg [data-k]").forEach((e) => e.classList.toggle("hl", e.dataset.k === clave)); }

function placa(pag, app) {
  const { S, acc } = app;
  const P = S.params, pcb = S.pcb;
  const sep = pcb?.job?.reglas?.TrackToTrack;
  const cam = S.trabajos.filter((t) => t.origen === "cam");
  const nc = S.trabajos.filter((t) => t.origen === "nc");
  const GRUPOS = acc.gruposActivos();
  const aviso = (t) => `<div class="aviso">${ico("alerta")}<span>${esc(t)}</span></div>`;
  pag.innerHTML = `${cab2("Inicio", pcb ? pcb.nombre : "PCB")}
    ${!S.archivos.length ? `<section class="w con-masc" aria-labelledby="p-arch">
      <span class="w-cab"><span id="p-arch">Archivos</span></span>
      <span class="w-texto">Abre la placa</span>
      <span class="w-sub">Gerber de KiCad, DXF, SVG o .nc</span>
      ${masc(app, "archivos")}
      <span class="w-acc">${btn("abrir", "Abrir archivos", { main: true, icono: "abrir" })}${btn("ejemplo", "Ejemplo")}</span>
    </section>
    <details class="desp"><summary><span></span><span>Exportar desde KiCad</span><span></span>${chev}</summary>
      <div class="desp__cuerpo"><ol class="w-pasos-alarma" style="margin:0">
        <li>Archivo → Salidas de fabricación → Gerbers: F.Cu y Edge.Cuts</li>
        <li>En la misma ventana: Generar archivos de taladro, en milímetros</li>
        <li>Abre aquí toda la carpeta; lo que no sirve se ignora</li></ol></div></details>` : ""}
    ${sep && P.pistas.diam > sep ? `<div class="aviso">${ico("alerta")}<span>El corte de pistas (${P.pistas.diam} mm) es más ancho que la separación mínima del diseño (${sep} mm): algunas pistas quedarán unidas.</span></div>` : ""}
    ${(pcb?.avisos || []).concat(S.avisosGen || []).map(aviso).join("")}
    ${materialHTML(app)}
    <button type="button" class="w" data-tour="config" data-ir="config">
      <span class="w-cab"><span>Configuración</span>${chev}</span>
      <span class="mini-herr">${GRUPOS.map((g) => `<span><span class="cuad" style="background:${HERRAMIENTAS[g].color}"></span>${HERRAMIENTAS[g].t}<b>${resumen(g, P[g])}</b></span>`).join("")}</span>
    </button>
    ${pcb ? `<button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-acc="generar" ${S.generando ? "disabled" : ""}>${S.generando ? "Calculando…" : cam.length ? "Volver a generar" : "Generar trayectorias"}</button>
    <span class="w-sub" role="status" style="text-align:center">${S.ultimaGen && cam.length ? `Listo en ${S.ultimaGen.toFixed(1)} s` : ""}</span>
    <details class="desp" data-tour="imagen" data-imagen>
      <summary><img class="desp__mini" src="${pcb.miniatura}" alt=""><span>Imagen</span><span class="desp__resumen">${Math.round(pcb.marco.dpi)} dpi</span>${chev}</summary>
      <div class="desp__cuerpo">
        <div class="seg seg--ancho" role="radiogroup" aria-label="Imagen">
          ${pcb.imgs.pistas ? '<button type="button" role="radio" data-img="pistas" aria-checked="true">Pistas</button>' : ""}
          ${pcb.imgs.hoyos ? '<button type="button" role="radio" data-img="hoyos" aria-checked="false">Hoyos</button>' : ""}
          <button type="button" role="radio" data-img="interior" aria-checked="${pcb.imgs.pistas ? "false" : "true"}">Contorno</button>
          ${pcb.imgs.vaciado ? '<button type="button" role="radio" data-img="vaciado" aria-checked="false">Vaciado</button>' : ""}
        </div>
        <canvas class="raster" data-raster role="img" aria-label="Imagen en blanco y negro: ${pcb.vector ? "lo blanco es material que se queda" : "lo blanco es cobre que se queda"}"></canvas>
        <span class="fila-wrap" style="justify-content:space-between"><span class="w-sub mono">${pcb.marco.W} × ${pcb.marco.H} px · ${pcb.vector ? "blanco = material que se queda" : "blanco = cobre que se queda"}</span>
          <button type="button" class="btn-texto" data-png>${ico("bajar")}PNG</button></span>
      </div>
    </details>` : ""}
    ${S.archivos.length ? `<details class="desp">
      <summary><span></span><span>Archivos</span><span class="desp__resumen">${S.archivos.length}</span>${chev}</summary>
      <div class="desp__cuerpo"><span class="filas">${S.archivos.map((a) => `<span class="fila">
        <span class="cuad" style="background:${a.tipo === "otro" ? "var(--riel)" : "var(--d-hecho)"}"></span>
        <span class="fila__nom">${esc(a.nombre)}<small>${TIPOS[a.tipo] || a.tipo}</small></span><span></span>
        <button type="button" class="btn-icono" data-quitar="${esc(a.nombre)}" aria-label="Quitar ${esc(a.nombre)}">${ico("x")}</button></span>`).join("")}</span>
        <span class="w-acc" style="margin-top:4px">${btn("abrir", "Abrir más", { icono: "abrir" })}${btn("nueva", pcb?.vector ? "Nueva pieza" : "Nueva placa")}</span></div>
    </details>` : ""}
    ${[...cam, ...nc].length ? `<section class="w" aria-labelledby="p-nc"><span class="w-cab"><span id="p-nc">Archivos .nc</span></span>
      <span class="filas">${[...cam, ...nc].map((t) => `<span class="fila"><span class="cuad" style="background:${app.hex(t.id)}"></span>
        <span class="fila__nom">${esc(t.nombre)}<small>${t.lineas.length} líneas · ${formatoTiempo(t.prev.tiempo)}</small></span><span></span>
        <button type="button" class="btn-icono" data-bajar="${t.id}" aria-label="Descargar ${esc(t.nombre)}.nc">${ico("bajar")}</button></span>`).join("")}</span></section>` : ""}`;

  cablear(pag, { __irA: app.irA, abrir: acc.elegirArchivos, ejemplo: acc.cargarEjemplo, generar: acc.generar, nueva: acc.nuevaPlaca,
    centrar: acc.centrarDiseno, girarMat: acc.girarMaterial, girarPieza: acc.girarPieza, matNuevo: () => { acc.materialNuevo(); app.refrescar(); } });
  const selMat = pag.querySelector("[data-mat-tipo]");
  if (selMat) selMat.onchange = () => acc.ponerTipoMaterial(selMat.value);
  pag.querySelectorAll("[data-m]").forEach((inp) => {
    inp.onchange = () => acc.ponerMaterial(inp.dataset.m, +inp.value);
    inp.addEventListener("focus", () => resaltar(pag, inp.dataset.m));
    inp.addEventListener("blur", () => resaltar(pag, null));
  });
  pag.querySelector("[data-atras]").onclick = app.regresar;
  pag.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = () => acc.quitarArchivo(b.dataset.quitar)));
  pag.querySelectorAll("[data-bajar]").forEach((b) => (b.onclick = () => acc.descargarTrabajo(b.dataset.bajar)));
  if (pcb) {
    let img = pcb.imgs.pistas ? "pistas" : "interior";
    const det = pag.querySelector("[data-imagen]"), cv = pag.querySelector("[data-raster]");
    const pintar = () => {
      pcb.vistas ??= {};
      const src = (pcb.vistas[img] ??= vista(pcb, pcb.marco, pcb.imgs[img])), k = Math.min(1, 720 / src.width);
      cv.width = Math.round(src.width * k); cv.height = Math.round(src.height * k);
      const x = cv.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, cv.width, cv.height);
    };
    // Se pinta al abrir: cerrada no cuesta nada
    det.addEventListener("toggle", () => { if (det.open) pintar(); });
    pag.querySelectorAll("[data-img]").forEach((b) => (b.onclick = () => { img = b.dataset.img; pag.querySelectorAll("[data-img]").forEach((x) => x.setAttribute("aria-checked", x === b)); pintar(); }));
    pag.querySelector("[data-png]").onclick = async () => descargar(`${pcb.nombre}_${img}_${Math.round(pcb.marco.dpi)}dpi.png`, await aPNG(pcb.imgs[img]));
  }
}

// ---- Material: la placa virgen con el diseño encima, a escala; cada medida en su eje ----
function materialHTML(app) {
  const { S, acc, visor } = app;
  const M = S.material, d = acc.tamDiseno(), h = acc.holgura(), bloq = acc.disenoBloqueado();
  const medida = (k, eje, txt, paso = 0.5) => `<label class="mat__campo mat__campo--${k}"><span><b data-eje="${eje}">${eje}</b>${txt}</span>
    <span class="u"><input type="number" step="${paso}" min="0.1" data-m="${k}" value="${M[k]}"><i>mm</i></span></label>`;
  const offset = (k, txt) => `<label class="campo"><span>${txt}</span><span class="u"><input type="number" step="0.5" min="-50" data-m="${k}" value="${M[k]}" ${bloq ? "disabled" : ""}><i>mm</i></span></label>`;
  const LADOS = { izq: "por la izquierda", der: "por la derecha", abajo: "por abajo", arriba: "por arriba" };
  const sale = h ? Object.keys(LADOS).filter((k) => h.sale[k] >= 0.05).map((k) => `${mm(h.sale[k], 1)} mm ${LADOS[k]}`) : [];
  const estado = !h ? ""
    : h.cabe ? `<span class="w-sub">Cabe · ${mm(Math.max(0, h.margen), 1)} mm de orilla en el lado más justo</span>`
    : `<div class="aviso">${ico("alerta")}<span>No cabe: se sale ${sale.join(" y ")}.${h.cabeCentrado ? " Centrado sí cabe." : h.cabeGirado ? " Girando el material 90° sí cabe." : " Necesitas un material más grande."}</span></div>`;
  const area = M.ancho > 145 || M.alto > 110;
  const dib = dibujoMaterial(M, d, h);
  return `<section class="w" aria-labelledby="p-mat" data-tour="material">
    <span class="w-cab"><span id="p-mat">Material</span>
      <select class="mat__tipo" data-mat-tipo aria-label="Qué material" ${bloq ? "disabled" : ""}>${Object.entries(MATERIALES).map(([k, m]) => `<option value="${k}" ${k === M.tipo ? "selected" : ""}>${esc(m.t)}</option>`).join("")}</select></span>
    <div class="mat">
      ${medida("alto", "Y", "Alto")}
      <div class="mat__dib">${dib.svg}</div>
      ${medida("grosor", "Z", "Grosor", 0.1)}
      ${medida("ancho", "X", "Ancho").replace("<label ", `<label style="margin-left:${Math.max(0, dib.cx - 46).toFixed(0)}px" `)}
    </div>
    ${estado}
    ${area ? `<div class="aviso">${ico("alerta")}<span>Más grande que el área de la Cubiko (145 × 110 mm).</span></div>` : ""}
    ${d ? `<div class="campos campos--2">${offset("x", "Offset izquierdo")}${offset("y", "Offset inferior")}</div>` : ""}
    <span class="w-acc" style="margin-top:8px">${d ? btn("centrar", "Centrar", { dis: bloq }) : ""}${S.pcb?.vector ? btn("girarPieza", "Girar pieza 90°", { dis: bloq }) : ""}${btn("girarMat", S.pcb?.vector ? "Girar material" : "Girar 90°", { dis: bloq })}${visor.hayCortes ? btn("matNuevo", "Borrar cortes del 3D") : ""}</span>
  </section>`;
}
// Vista de arriba con la cota de X y la de Y, cada una del color de su eje. Devuelve el SVG y dónde
// queda el centro de la cota de X (px desde la izquierda), para poner el campo Ancho justo debajo.
function dibujoMaterial(M, d, h) {
  const s = Math.max(M.ancho, M.alto), c = s * 0.075, pad = s * 0.03, t = s * 0.018;
  const x0 = Math.min(0, h?.x0 ?? 0) - c - pad, x1 = Math.max(M.ancho, h?.x1 ?? 0) + c + pad;
  const yTop = Math.max(M.alto, h?.y1 ?? 0) + pad, yBot = Math.min(0, h?.y0 ?? 0) - c - pad;
  const Y = (y) => yTop - y;        // el SVG crece hacia abajo; la máquina, hacia arriba
  const r = (x, y, w, hh, extra) => `<rect x="${x}" y="${Y(y + hh)}" width="${w}" height="${hh}" ${extra}/>`;
  const ln = (xa, ya, xb, yb) => `<line x1="${xa}" y1="${Y(ya)}" x2="${xb}" y2="${Y(yb)}" vector-effect="non-scaling-stroke"/>`;
  const fuera = h && !h.cabe;
  const yX = -c * 0.6, xY = -c * 0.6;
  const ancho = Math.min(256, (190 * (x1 - x0)) / (yTop - yBot));     // la columna mide lo que el dibujo
  return { cx: ((M.ancho / 2 - x0) / (x1 - x0)) * ancho, svg: `<svg class="mat-dib" style="width:${ancho.toFixed(0)}px" viewBox="${x0} 0 ${x1 - x0} ${yTop - yBot}" role="img" aria-label="Material de ${mm(M.ancho, 1)} por ${mm(M.alto, 1)} por ${mm(M.grosor, 1)} mm${d ? ` con el diseño de ${mm(d.ancho, 1)} por ${mm(d.alto, 1)} mm` : ""}">
    ${r(0, 0, M.ancho, M.alto, 'class="mat-dib__cobre" vector-effect="non-scaling-stroke"')}
    ${h ? r(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0, `class="mat-dib__corte${fuera ? " es-fuera" : ""}"`) : ""}
    ${d ? r(M.x, M.y, d.ancho, d.alto, `class="mat-dib__diseno${fuera ? " es-fuera" : ""}" vector-effect="non-scaling-stroke"`) : ""}
    ${d ? `<g class="mcota mcota--off" data-k="x">${ln(0, M.y + d.alto / 2, M.x, M.y + d.alto / 2)}</g><g class="mcota mcota--off" data-k="y">${ln(M.x + d.ancho / 2, 0, M.x + d.ancho / 2, M.y)}</g>` : ""}
    <g class="mcota mcota--x" data-k="ancho">${ln(0, yX, M.ancho, yX)}${ln(0, yX - t, 0, yX + t)}${ln(M.ancho, yX - t, M.ancho, yX + t)}</g>
    <g class="mcota mcota--y" data-k="alto">${ln(xY, 0, xY, M.alto)}${ln(xY - t, 0, xY + t, 0)}${ln(xY - t, M.alto, xY + t, M.alto)}</g>
    <circle cx="0" cy="${Y(0)}" r="${s * 0.016}" class="mat-dib__cero"/>
  </svg>` };
}

// ======================================================================
// CONFIGURACIÓN: las herramientas de los tres trabajos, con dibujos que siguen a los valores
// ======================================================================
// Etiqueta junto al puntero: sale tras un momento sobre un campo y dice qué hace. Lo que cambia
// se resalta en el dibujo al instante; el texto no se mueve de lugar.
const tip = (() => {
  let el = null, t = null, x = 0, y = 0;
  const colocar = () => {
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, x - r.width / 2))}px`;
    el.style.top = `${y - r.height - 14 < 8 ? y + 22 : y - r.height - 14}px`;
  };
  const mostrar = (texto) => {
    if (!el) { el = document.createElement("div"); el.className = "tip"; el.setAttribute("role", "tooltip"); document.body.appendChild(el); }
    el.textContent = texto; el.hidden = false; colocar();
  };
  return {
    sobre(texto, e) {
      clearTimeout(t); x = e.clientX; y = e.clientY;
      t = setTimeout(() => mostrar(texto), 650);
    },
    mover(e) { x = e.clientX; y = e.clientY; if (el && !el.hidden) colocar(); },
    // Anclada a un elemento (pantalla táctil, al enfocar): sin espera
    en(texto, ancla) { clearTimeout(t); const r = ancla.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top; mostrar(texto); },
    fuera() { clearTimeout(t); if (el) el.hidden = true; },
  };
})();

const sinMouse = () => matchMedia("(hover: none)").matches;

function config(pag, app) {
  const { S, acc } = app;
  const P = S.params, grosor = S.material.grosor, caja = acc.tamDiseno();
  const sep = S.pcb?.job?.reglas?.TrackToTrack;
  const hoyos = acc.hoyosDiseno();
  const GRUPOS = acc.gruposActivos();
  const desc = (g, k) => `<span id="n-${g}-${k}" hidden>${NOTAS[g][k] || ""}</span>`;
  const campo = (g, [k, txt, u, o = {}]) => {
    const e = o.esc || 1;
    if (o.opciones) {
      const ops = BROCAS.includes(P[g][k]) ? BROCAS : [...BROCAS, P[g][k]].sort((a, b) => a - b);
      return `<label class="campo"><span>${txt}</span><select data-p="${g}.${k}" data-esc="1" aria-describedby="n-${g}-${k}">${ops.map((v) => `<option value="${v}" ${v === P[g][k] ? "selected" : ""}>${v} mm${v === 3.175 ? " (1/8\")" : ""}</option>`).join("")}</select>${desc(g, k)}</label>`;
    }
    return `<label class="campo"><span>${txt}</span><span class="u"><input type="number" data-p="${g}.${k}" data-esc="${e}" step="${o.paso ?? 0.01}" ${o.min != null ? `min="${o.min}"` : ""} ${o.max != null ? `max="${o.max}"` : ""} value="${+(P[g][k] * e).toFixed(4)}" ${u.length > 3 ? "data-largo" : ""} aria-describedby="n-${g}-${k}">${u ? `<i>${u}</i>` : ""}</span>${desc(g, k)}</label>`;
  };
  // Qué hoyos del diseño se perforan: un renglón que se lee como frase
  const rango = () => {
    const mini = (k, lbl) => `<label class="rango__campo" aria-label="${lbl}"><span class="u"><input type="number" data-p="hoyos.${k}" data-esc="1" step="0.05" min="0" value="${P.hoyos[k]}" aria-describedby="n-hoyos-${k}"><i>mm</i></span>${desc("hoyos", k)}</label>`;
    return `<div class="rango"><span>Perforar los de Ø</span>${mini("min", "Desde Ø")}<span>a</span>${mini("max", "Hasta Ø")}</div>`;
  };
  const dib = (g, Q) => g === "pistas" ? dibujosPistas(Q) : g === "hoyos" ? dibujosHoyos(Q, grosor) : g === "contorno" ? dibujosContorno(Q, grosor, caja)
    : g === "grabado" ? dibujosGrabado(Q) : g === "vaciado" ? dibujosVaciado(Q, grosor, P.contorno.diam) : dibujosComun(Q);
  const aviso = (t) => `<div class="aviso">${ico("alerta")}<span>${t}</span></div>`;
  const extra = (g, Q) => {
    if (g === "pistas") return sep && Q.diam > sep ? aviso(`La separación mínima del diseño es ${sep} mm: con ${Q.diam} mm algunas pistas quedarán unidas.`) : "";
    if (g === "hoyos") {
      const dentro = (dm) => dm >= Q.min - 1e-6 && dm <= Q.max + 1e-6;
      const cuenta = {};
      hoyos.forEach((x) => (cuenta[x.d.toFixed(2)] = (cuenta[x.d.toFixed(2)] || 0) + 1));
      const lista = Object.entries(cuenta).sort((a, b) => a[0] - b[0]);
      const n = hoyos.filter((x) => dentro(x.d)).length;
      return `${atraviesa(Q, grosor) ? "" : aviso(`No atraviesa: con material de ${grosor} mm, baja más de ${grosor} mm.`)}
        ${lista.length ? `<span class="w-sub">Hoyos del diseño · se perforan ${n} de ${hoyos.length}</span>
          <span class="chips-d">${lista.map(([dm, c]) => `<span class="chip-d" data-on="${dentro(+dm) ? 1 : 0}">Ø${dm}<small>×${c}</small></span>`).join("")}</span>`
        : `<span class="w-sub">Abre la placa para ver sus hoyos</span>`}`;
    }
    if (g === "contorno") return `${Q.prof < grosor ? aviso(`No atraviesa el material de ${grosor} mm.`) : ""}
      ${Q.puentes > 0 && Math.abs(Q.zPuente) >= grosor ? aviso("Con Z puente más hondo que el material no quedan puentes.") : ""}
      ${Q.acabado > 0 && Q.acabado >= Q.diam / 2 ? aviso("El acabado es más grande que el radio de la fresa: la última vuelta cortaría de más.") : ""}`;
    if (g === "vaciado") return Q.prof >= grosor ? aviso(`Con ${+(+Q.prof).toFixed(2)} mm atraviesa el material de ${grosor} mm.`) : "";
    return "";
  };
  const seccion = (g) => {
    const H = HERRAMIENTAS[g];
    return `<section class="w herr" data-herr="${g}" data-tour="herr-${g}" aria-labelledby="h-${g}">
      <span class="w-cab"><span id="h-${g}" class="herr__t"><span class="cuad" style="background:${H.color}"></span>${H.t}</span><span class="desp__resumen" data-res>${resumen(g, P[g])}</span></span>
      <div class="herr__dib" data-dib>${dib(g, P[g])}</div>
      <div class="pila-s" data-extra>${extra(g, P[g])}</div>
      ${g === "hoyos" ? rango() : ""}
      <div class="campos">${CAMPOS[g].map((c) => campo(g, c)).join("")}</div>
      ${g === "comun" ? `<label class="check"><input type="checkbox" data-p="comun.climb" ${P.comun.climb ? "checked" : ""} aria-describedby="n-comun-climb"> Fresado en concordancia${desc("comun", "climb")}</label>` : ""}
    </section>`;
  };
  const cam = S.trabajos.some((t) => t.origen === "cam");
  pag.innerHTML = `${cab2(queEs(S), "Configuración")}
    ${[...GRUPOS, "comun"].map(seccion).join("")}
    <button type="button" class="btn-texto" data-acc="defecto" style="align-self:center">Valores por defecto</button>
    ${S.pcb ? `<button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-acc="generar" ${S.generando ? "disabled" : ""}>${S.generando ? "Calculando…" : cam ? "Volver a generar" : "Generar trayectorias"}</button>` : ""}`;
  cablear(pag, { __irA: app.irA, generar: acc.generar, defecto: acc.paramsPorDefecto });
  pag.querySelector("[data-atras]").onclick = app.regresar;
  tip.fuera();
  pag.addEventListener("wheel", tip.fuera, { passive: true });

  pag.querySelectorAll("[data-herr]").forEach((sec) => {
    const g = sec.dataset.herr;
    const leer = () => {
      const Q = { ...P[g] };
      sec.querySelectorAll("[data-p]").forEach((i) => {
        const k = i.dataset.p.split(".")[1];
        if (i.type === "checkbox") Q[k] = i.checked;
        else if (i.value !== "" && isFinite(+i.value)) Q[k] = +i.value / +i.dataset.esc;
      });
      if (g === "pistas") Q.diam = anchoV(Q);
      return Q;
    };
    const enfocado = () => sec.querySelector("[data-p]:focus")?.dataset.p.split(".")[1] || null;
    const repintar = () => {
      const Q = leer();
      sec.querySelector("[data-dib]").innerHTML = dib(g, Q);
      sec.querySelector("[data-extra]").innerHTML = extra(g, Q);
      sec.querySelector("[data-res]").textContent = resumen(g, Q);
      resaltar(sec, enfocado());
      return Q;
    };
    sec.querySelectorAll("[data-p]").forEach((inp) => {
      const k = inp.dataset.p.split(".")[1], lbl = inp.closest("label");
      inp.addEventListener("focus", () => { resaltar(sec, k); if (sinMouse() && NOTAS[g][k]) tip.en(NOTAS[g][k], lbl); });
      inp.addEventListener("blur", () => { resaltar(sec, null); tip.fuera(); });
      lbl.addEventListener("mouseenter", (e) => { resaltar(sec, k); if (NOTAS[g][k]) tip.sobre(NOTAS[g][k], e); });
      lbl.addEventListener("mousemove", tip.mover);
      lbl.addEventListener("mouseleave", () => { tip.fuera(); resaltar(sec, enfocado()); });
      lbl.addEventListener("mousedown", tip.fuera);
      inp.addEventListener("input", repintar);
      inp.addEventListener("change", () => { const Q = repintar(); if (Q[k] !== undefined && (typeof Q[k] === "boolean" || isFinite(Q[k]))) acc.ponerParam(g, k, Q[k]); });
    });
  });
}

// ======================================================================
// ORIGEN: X0 Y0 y Z0 (con su mapa de alturas); la calibración fina va aparte
// ======================================================================
function origen(pag, app) {
  const { S, grbl, acc } = app;
  const sig = acc.siguienteTrabajo();
  const dis = !grbl.listo || !!S.corriendo;
  const r = S.mapa?.completo ? S.mapa.rango : null;
  pag.innerHTML = `${cab2("Inicio", "Origen")}
    <section class="w" aria-labelledby="c-xy">
      <span class="w-cab"><span id="c-xy">X0 Y0</span></span>
      <span class="w-texto">${S.xyListo ? "Fijado" : "Pendiente"}</span>
      <span class="w-sub">Esquina inferior izquierda del material</span>
      <div data-jog style="margin-top:10px"></div>
      <span class="w-acc">${btn("fijar", "Fijar aquí", { main: !S.xyListo, icono: "mira", dis })}${btn("ir", "Ir a X0 Y0", { dis: dis || !S.xyListo })}${btn("recorrer", "Recorrer el área", { icono: "ruta", dis: dis || !acc.cajaTrabajos() })}</span>
    </section>
    <section class="w" aria-labelledby="c-z">
      <span class="w-cab"><span id="c-z">Z0</span></span>
      <span class="w-texto">${S.zListo ? esc(S.herramientaZ || "Fijado") : "Pendiente"}</span>
      <span class="w-sub">${sig ? `${superficie(app)} · siguiente trabajo: ${esc(sig.nombre)} · ${esc(sig.herramienta)}` : superficie(app)}</span>
      <span class="w-acc">${btn("sonda", "Calibrar con la sonda", { main: S.xyListo && !S.zListo, icono: "sonda", dis })}${btn("zmanual", "Sin sonda", { dis })}</span>
      <span class="filas" style="margin-top:8px"><button type="button" class="fila fila--sep" data-tour="mapa" data-ir="alturas">
        ${ico("capas")}<span class="fila__nom">Mapa de alturas<small>${!acc.mat().conduce ? "Solo sobre cobre" : r ? (S.usarMapa ? "Se aplica al fresar" : "Sin aplicar") : "Opcional · si la placa no está plana"}</small></span>
        <span class="fila__val">${r ? `${mm(r.max - r.min, 2)} mm` : "Sin medir"}</span>${chev}</button></span>
    </section>
    <button type="button" class="w" data-tour="fina" data-ir="fina">
      <span class="w-cab"><span>Calibración fina</span>${chev}</span>
      <span class="w-texto ${S.alinear ? "" : "muted"}">${S.alinear ? `Giro ${((S.alinear.ang * 180) / Math.PI).toFixed(2)}°` : "Opcional"}</span>
      <span class="w-sub">Si el material quedó chueco o lo moviste</span>
    </button>`;
  if (!dis) miniJog(pag.querySelector("[data-jog]"), grbl);
  cablear(pag, {
    __irA: app.irA, fijar: acc.fijarXY, ir: acc.irACero, recorrer: acc.recorrerArea,
    sonda: () => acc.asistenteZ(sig), zmanual: () => acc.asistenteZManual(sig),
  });
  pag.querySelector("[data-atras]").onclick = app.regresar;
  let antes = `${grbl.listo}|${!!S.corriendo}`;
  return { vivo() { const k = `${grbl.listo}|${!!S.corriendo}`; if (k !== antes) { antes = k; app.refrescar(); } } };
}

// ---- Calibración fina: dos formas de corregir un material chueco o movido ----
const FIG_BORDE = `<svg class="dib dib--fig" viewBox="0 0 280 100" role="img" aria-label="Material girado: se mide la esquina y un punto del borde de abajo">
  <g transform="rotate(-6 46 80)"><rect x="46" y="20" width="190" height="60" rx="2" class="m-placa"/></g>
  <line x1="46" y1="80" x2="262" y2="80" class="dib__ref"/>
  <path d="M 106 80 A 60 60 0 0 0 105.7 73.7" class="dib__arco"/><text class="dib__rot" x="112" y="76">giro</text>
  <circle cx="46" cy="80" r="4.5" class="dib__pto"/><text class="dib__rot" x="46" y="96" text-anchor="middle">X0 Y0</text>
  <circle cx="205" cy="63.3" r="4.5" class="dib__pto"/><text class="dib__rot" x="205" y="54" text-anchor="middle">punto del borde</text>
</svg>`;
const FIG_HOYOS = `<svg class="dib dib--fig" viewBox="0 0 280 100" role="img" aria-label="Placa movida: se centra la fresa en dos agujeros ya hechos">
  <rect x="44" y="16" width="180" height="64" rx="2" class="dib__fantasma"/>
  <g transform="translate(12 -2) rotate(4 44 80)"><rect x="44" y="16" width="180" height="64" rx="2" class="m-placa"/>
    <circle cx="66" cy="62" r="6" class="m-hoyo"/><circle cx="202" cy="32" r="6" class="m-hoyo"/>
    <text class="dib__rot" x="66" y="48" text-anchor="middle">A</text><text class="dib__rot" x="202" y="54" text-anchor="middle">B</text></g>
  <text class="dib__rot" x="44" y="96">antes</text>
</svg>`;
function fina(pag, app) {
  const { S, grbl, acc } = app;
  const dis = !grbl.listo || !!S.corriendo;
  const hayHoyos = (S.pcb?.hoyos?.length || 0) >= 2;
  const al = S.alinear, deBorde = !!al?.borde, deHoyos = !!al && !al.borde;
  const giro = (d) => `<span class="celda"><span>Giro</span><b>${((al.ang * 180) / Math.PI).toFixed(d)}°</b></span>`;
  const falta = !hayHoyos ? "Tu diseño necesita 2 hoyos o más" : !S.xyListo ? "Primero fija X0 Y0" : "";
  pag.innerHTML = `${cab2("Origen", "Calibración fina")}
    <section class="w" aria-labelledby="f-borde">
      <span class="w-cab"><span id="f-borde">Con el borde</span></span>
      ${FIG_BORDE}
      <span class="w-sub">El material quedó girado al pegarlo. Se mide la esquina y un punto del borde de abajo, y todo el trabajo se gira igual. Antes de fresar.</span>
      ${deBorde ? `<span class="celdas">${giro(2)}</span>` : ""}
      <span class="w-acc">${btn("borde", deBorde ? "Volver a medir" : "Alinear con el borde", { dis })}${deBorde ? btn("quitarAl", "Quitar") : ""}</span>
    </section>
    <section class="w" aria-labelledby="f-hoyos">
      <span class="w-cab"><span id="f-hoyos">Con 2 agujeros</span></span>
      ${FIG_HOYOS}
      <span class="w-sub">La placa ya tiene hoyos y se movió (la quitaste o se despegó). Se centra la fresa en dos hoyos ya hechos y se corrigen el giro y la posición.</span>
      ${deHoyos ? `<span class="celdas">${giro(3)}<span class="celda"><span>Desplazamiento</span><b>${al.dx.toFixed(2)}, ${al.dy.toFixed(2)}</b></span></span>` : ""}
      ${falta ? `<span class="w-sub w-sub--atencion">${ico("alerta")}${falta}</span>` : ""}
      <span class="w-acc">${btn("alinear", deHoyos ? "Volver a alinear" : "Alinear con 2 agujeros", { dis: dis || !!falta })}${deHoyos ? btn("quitarAl", "Quitar") : ""}</span>
    </section>`;
  cablear(pag, { __irA: app.irA, alinear: acc.asistenteAlinear, quitarAl: acc.quitarAlineacion, borde: acc.asistenteBorde });
  pag.querySelector("[data-atras]").onclick = app.regresar;
  let antes = `${grbl.listo}|${!!S.corriendo}`;
  return { vivo() { const k = `${grbl.listo}|${!!S.corriendo}`; if (k !== antes) { antes = k; app.refrescar(); } } };
}

// ======================================================================
// MAPA DE ALTURAS (desde Z0 en Origen)
// ======================================================================
function alturas(pag, app) {
  const { S, grbl, acc } = app;
  const d = ls.get("alturas", { paso: 10, prof: 2, f: 30 });
  const c = acc.cajaTrabajos();
  const malla = () => {
    if (!c) return "Primero genera o abre un trabajo";
    const nx = Math.max(2, Math.ceil(c.ancho / d.paso) + 1), ny = Math.max(2, Math.ceil(c.alto / d.paso) + 1);
    return `${mm(c.ancho, 1)} × ${mm(c.alto, 1)} mm → ${nx} × ${ny} = ${nx * ny} puntos`;
  };
  const r = S.mapa?.rango;
  pag.innerHTML = `${cab2("Origen", "Mapa de alturas")}
    <section class="w" aria-labelledby="a-res">
      <span class="w-cab"><span id="a-res">Diferencia</span></span>
      ${r && S.mapa.completo ? `<span class="w-cifra">${mm(r.max - r.min, 3)}<small>mm</small></span><span class="w-sub mono">de ${mm(r.min, 3)} a ${mm(r.max, 3)}</span>` : `<span class="w-texto muted">Sin medir</span>`}
      ${S.midiendo ? `<span class="progreso"><i data-v="barra" style="width:${(S.midiendo.k / S.midiendo.n) * 100}%"></i></span><span class="w-sub" data-v="cuenta">${S.midiendo.k} de ${S.midiendo.n}</span>` : ""}
      <label class="check" style="margin-top:6px"><input type="checkbox" data-usar ${S.usarMapa ? "checked" : ""}> Aplicar al fresar</label>
    </section>
    <section class="w" aria-labelledby="a-cfg">
      <span class="w-cab"><span id="a-cfg">Malla</span></span>
      <div class="campos" style="margin-top:6px">
        <label class="campo"><span>Separación mm</span><input type="number" step="1" min="3" data-h="paso" value="${d.paso}"></label>
        <label class="campo"><span>Bajar hasta mm</span><input type="number" step="0.5" data-h="prof" value="${d.prof}"></label>
        <label class="campo"><span>Sondeo mm/min</span><input type="number" step="5" data-h="f" value="${d.f}"></label>
      </div>
      <span class="w-sub" data-v="malla" style="margin-top:6px">${malla()}</span>
      ${acc.mat().conduce ? "" : `<div class="aviso">${ico("alerta")}<span>Se mide tocando el material con la sonda: el ${esc(acc.mat().t.toLowerCase())} no conduce.</span></div>`}
      <span class="w-acc">${btn("medir", "Medir", { main: true, icono: "sonda", dis: !grbl.listo || !c || !!S.midiendo || !!S.corriendo || !acc.mat().conduce })}${btn("importar", ".map", { icono: "abrir" })}${btn("exportar", ".map", { icono: "bajar", dis: !S.mapa })}</span>
    </section>`;
  pag.querySelectorAll("[data-h]").forEach((i) => (i.onchange = () => { d[i.dataset.h] = +i.value; ls.set("alturas", d); pag.querySelector('[data-v="malla"]').textContent = malla(); }));
  pag.querySelector("[data-usar]").onchange = (e) => acc.ponerUsarMapa(e.target.checked);
  cablear(pag, { __irA: app.irA, medir: () => acc.medirAlturas(d), importar: acc.elegirArchivos, exportar: acc.exportarMapa });
  pag.querySelector('[data-acc="importar"]').setAttribute("aria-label", "Importar .map");
  pag.querySelector('[data-acc="exportar"]').setAttribute("aria-label", "Descargar .map");
  pag.querySelector("[data-atras]").onclick = app.regresar;
  return { vivo() {
    if (!S.midiendo) return;
    const b = pag.querySelector('[data-v="barra"]'), n = pag.querySelector('[data-v="cuenta"]');
    if (b) b.style.width = `${(S.midiendo.k / S.midiendo.n) * 100}%`;
    if (n) n.textContent = `${S.midiendo.k} de ${S.midiendo.n}`;
  } };
}

// ======================================================================
// MOVER
// ======================================================================
function mover(pag, app) {
  const { S, grbl, acc } = app;
  const p = app.pasoJog;
  const dis = !grbl.listo || !!S.corriendo;
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">Mover</h2>
      <span class="chip" style="cursor:default" data-v="sonda" data-s="off"><span class="punto" aria-hidden="true"></span><span data-v="sonda-t">Sonda libre</span></span></header>
    <div class="aviso" data-v="alarma" hidden role="alert">${ico("alerta")}<span style="flex:1">Alarma: la máquina no se mueve.</span>
      <button type="button" class="btn-pill btn-pill--suave" data-acc="desbloquear" style="min-height:36px">Desbloquear</button></div>
    <section class="w" aria-label="Posición de trabajo" data-tour="posicion">
      <div class="pos">
        <b data-eje="X">X</b><span class="pos__v" data-v="x">—</span>
        <b data-eje="Y">Y</b><span class="pos__v" data-v="y">—</span>
        <b data-eje="Z">Z</b><span class="pos__v" data-v="z">—</span>
      </div>
      <span class="w-sub mono" data-v="mpos"></span>
    </section>
    <section class="w" aria-label="Mover los ejes" data-tour="pad">
      <div class="pad" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown">
        <span></span><button type="button" data-j="0,1,0" data-eje="Y" aria-label="Y más">Y+</button><span></span><span></span><button type="button" class="pad__z" data-j="0,0,1" data-eje="Z" aria-label="Z arriba">Z+</button>
        <button type="button" data-j="-1,0,0" data-eje="X" aria-label="X menos">X−</button>
        <button type="button" class="pad__centro" data-cero aria-label="Ir a X0 Y0">${ico("mira")}</button>
        <button type="button" data-j="1,0,0" data-eje="X" aria-label="X más">X+</button><span></span><span></span>
        <span></span><button type="button" data-j="0,-1,0" data-eje="Y" aria-label="Y menos">Y−</button><span></span><span></span><button type="button" class="pad__z" data-j="0,0,-1" data-eje="Z" aria-label="Z abajo">Z−</button>
      </div>
      <div class="seg seg--ancho seg--mono" role="radiogroup" aria-label="Paso en mm">${[0.05, 0.1, 1, 10].map((v) => `<button type="button" role="radio" data-paso="${v}" aria-checked="${p === v}">${v} mm</button>`).join("")}</div>
    </section>
    <span class="fila-wrap">${btn("fijar", "Fijar X0 Y0 aquí", { main: !S.xyListo, icono: "mira", dis })}${btn("subir", "Subir Z", { icono: "subir", dis })}</span>`;
  pag.querySelectorAll("[data-j]").forEach((b) => (b.onclick = () => { const [x, y, z] = b.dataset.j.split(",").map(Number); acc.jog(x, y, z); }));
  pag.querySelector("[data-cero]").onclick = acc.irACero;
  pag.querySelectorAll("[data-paso]").forEach((b) => (b.onclick = () => { acc.ponerPasoJog(+b.dataset.paso); pag.querySelectorAll("[data-paso]").forEach((x) => x.setAttribute("aria-checked", x === b)); }));
  cablear(pag, { __irA: app.irA, fijar: acc.fijarXY, subir: acc.subirZ, desbloquear: acc.desbloquear });
  const botones = [...pag.querySelectorAll(".pad button")];
  let antes = null;
  return { vivo() {
    const ok = grbl.listo, w = grbl.est.wpos, m = grbl.est.mpos;
    pag.querySelector('[data-v="x"]').innerHTML = ok ? `${mm(w.x)}<small>mm</small>` : "—";
    pag.querySelector('[data-v="y"]').innerHTML = ok ? `${mm(w.y)}<small>mm</small>` : "—";
    pag.querySelector('[data-v="z"]').innerHTML = ok ? `${mm(w.z)}<small>mm</small>` : "—";
    pag.querySelector('[data-v="mpos"]').textContent = ok ? `Máquina ${mm(m.x, 2)}, ${mm(m.y, 2)}, ${mm(m.z, 2)}` : "";
    const toca = ok && grbl.contacto;
    const s = pag.querySelector('[data-v="sonda"]'); s.dataset.s = toca ? "on" : "off";
    pag.querySelector('[data-v="sonda-t"]').textContent = toca ? "Contacto" : "Sonda libre";
    const alarma = ok && grbl.est.estado === "Alarm";
    pag.querySelector('[data-v="alarma"]').hidden = !alarma;
    const d = !ok || !!S.corriendo || alarma;
    if (d !== antes) { antes = d; botones.forEach((b) => (b.disabled = d)); pag.querySelectorAll('.fila-wrap [data-acc]').forEach((b) => (b.disabled = d)); }
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
    <form class="envio" autocomplete="off"><input id="cmd" placeholder="G-code" aria-label="Comando G-code" spellcheck="false"><button type="submit" class="btn-pill btn-pill--main">Enviar</button></form>
    <span class="fila-wrap">${["$X", "$H", "$#", "$$", "?"].map((c) => `<button type="button" class="btn-pill btn-pill--suave mono" data-cmd="${c}" style="min-height:36px">${c}</button>`).join("")}</span>`;
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
  const habil = () => { const ok = app.grbl.listo; inp.disabled = !ok; pag.querySelectorAll("[data-cmd], [type=submit]").forEach((b) => (b.disabled = !ok)); };
  habil();
  return { vivo: habil };
}

export const VISTAS = { inicio, mover, consola: consolaVista, pasos: vistaPasos, maquina, placa, config, origen, fina, alturas };
