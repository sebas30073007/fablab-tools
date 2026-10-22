// vistas.js - lo que se ve en el panel. Cada vista recibe (pag, app) y puede devolver { vivo }
// para actualizar lo que cambia con el estado de GRBL sin volver a pintar todo.
//
// Reglas (Casita/OPI): un widget por renglón · título del widget sin ícono · chevron solo si abre
// algo · cifras en color de texto · un botón dice lo que pasa · nada de frases que expliquen el botón.

import { ALARMAS, ESTADOS } from "./alarmas.js";
import { formatoTiempo } from "./gcode.js";
import { esc, ico, mm, ls, miniJog, descargar, dialogo } from "./ui.js";
import { aPNG, vista } from "./raster.js";
import { anchoV, anchoAislado, igualHerr } from "./cam.js";
import { MATERIALES } from "./materiales.js";
import { VERSION } from "./version.js";
import { HERRAMIENTAS, CAMPOS, NOTAS, BROCAS, atraviesa, revisarRango, dibujosPistas, dibujosHoyos, dibujosContorno, dibujosComun, dibujosGrabado, dibujosVaciado } from "./herramientas.js";

const chev = ico("chev");
const masc = (app, k) => `<img class="w-masc" src="${app.MASC[k]}" alt="" onerror="this.remove()">`;
const hecho = (t) => t.estado === "hecho" || t.estado === "omitido";
// Lo que está abierto: una PCB o la pieza de un dibujo DXF/SVG
const queEs = (S) => (S.pcb?.vector ? "Pieza" : "PCB");
const superficie = (app) => (app.acc.mat().conduce ? "Superficie del cobre" : `Superficie del ${app.acc.mat().t.toLowerCase()}`);
// terc: botón terciario, solo el texto sobre el fondo (sombra al pasar el puntero)
const btn = (acc, txt, { main = false, icono = null, dis = false, texto = false, terc = false } = {}) =>
  `<button type="button" class="${texto ? "btn-texto" : terc ? "btn-terc" : `btn-pill ${main ? "btn-pill--main" : ""}`}" data-acc="${acc}" ${dis ? "disabled" : ""}>${icono ? ico(icono) : ""}${esc(txt)}</button>`;
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
    // Final de carrera: qué eje y hacia dónde alejarlo
    let pasos = a.pasos;
    if (S.alarma === 1 && S.tope?.length) pasos = [pasos[0], `Aleja ${S.tope.map((x) => `${x.eje} con ${x.eje}${x.sale}`).join(" y ")}, pasos de 1 mm`, ...pasos.slice(2)];
    return { k: `alarma${S.alarma}`, tipo: "alarma", cab: `ALARM:${S.alarma}`, texto: a.t, sub: a.d, pasos, masc: "alerta",
      acc: [{ id: h ? "homing" : "desbloquear", t: h ? "Homing" : "Desbloquear", main: true, ico: h ? "casa" : "candado" }, { id: h ? "desbloquear" : "homing", t: h ? "Desbloquear" : "Homing" }] };
  }
  if (e === "Home") return { k: "homing", cab: "Ahora", texto: "Homing…", masc: "fresando", acc: [] };
  if (!S.homed) return { k: "home", cab: "Ahora", texto: "Hacer homing", masc: "hola", acc: [{ id: "homing", t: "Homing", main: true, ico: "casa" }, { id: "desbloquear", t: "Ya está en casa" }] };
  if (S.abriendo) return { k: "abriendo", cab: "Ahora", texto: "Abriendo la placa…", masc: "archivos", acc: [] };
  if (!S.pcb && !S.trabajos.length) return { k: "archivos", cab: "Ahora", texto: "Abrir la placa", sub: "Gerber de KiCad, DXF, SVG o .nc", masc: "archivos", acc: [{ id: "abrir", t: "Abrir archivos", main: true, ico: "abrir" }, { id: "ejemplo", t: "Ejemplo", terc: true }] };
  if (S.pcb && !S.trabajos.length) return { k: "generar" + S.generando, cab: "Ahora", texto: S.generando ? "Calculando trayectorias…" : "Generar trayectorias", sub: S.pcb.nombre, masc: "archivos", acc: S.generando ? [] : [{ id: "generar", t: "Generar", main: true }, { id: "verPlaca", t: "Ajustar", terc: true }] };
  if (!S.xyListo) return { k: "xy", cab: "Ahora", texto: "Fijar X0 Y0", sub: "Esquina inferior izquierda del material", masc: "hola", acc: [{ id: "mover", t: "Mover", main: true, ico: "mover" }] };
  const t = acc.siguienteTrabajo();
  if (!t) return { k: "fin", cab: "Ahora", texto: S.pcb?.vector ? "Pieza terminada" : "Placa terminada", masc: "placa", acc: [{ id: "nueva", t: S.pcb?.vector ? "Nueva pieza" : "Nueva placa", main: true }] };
  if (S.midiendo) return { k: "midiendo" + S.midiendo.k, cab: "Ahora", texto: "Midiendo alturas…", sub: `${S.midiendo.k} de ${S.midiendo.n} puntos · el caimán sigue puesto`, masc: "sonda", acc: [] };
  if (!S.zListo) return { k: "z" + t.id, cab: "Ahora", texto: "Calibrar Z", sub: t.herramienta, masc: "sonda", acc: [{ id: "paso", t: "Empezar", main: true }, { id: "zmanual", t: "Sin sonda" }] };
  if (S.herramientaZ && !igualHerr(t.herramienta, S.herramientaZ) && t.origen === "cam") return { k: "cambio" + t.id, cab: "Ahora", texto: `Cambiar a ${t.herramienta}`, sub: `para ${t.nombre}`, masc: "sonda", acc: [{ id: "paso", t: "Empezar", main: true }, { id: "aire", t: "Prueba en aire", ico: "aire" }, { id: "misma", t: "Misma fresa", texto: true }] };
  // Antes de las pistas, el mapa de alturas: es lo que más decide que salgan parejas
  if (t.id === "pistas" && acc.mat().conduce && !S.mapa?.completo && !S.sinMapa) {
    const pm = acc.puntosMapa();
    return { k: "mapa", cab: "Ahora", texto: "Medir el mapa de alturas", sub: `Recomendado: la placa nunca está del todo plana${pm ? ` · ${pm.n} puntos, unos ${pm.min} min` : ""}`, masc: "sonda",
      acc: [{ id: "mapa", t: "Medir", main: true, ico: "capas" }, { id: "aire", t: "Prueba en aire", ico: "aire" }, { id: "borde", t: "Recorrer borde", ico: "ruta", terc: true }, { id: "sinMapa", t: "Sin mapa", texto: true }] };
  }
  return { k: "fresar" + t.id, cab: "Ahora", texto: `Fresar ${t.nombre}`, sub: `${t.herramienta} · ${formatoTiempo(t.prev.tiempo)}`, masc: "hola",
    acc: [{ id: "paso", t: "Fresar", main: true, ico: "play" }, { id: "aire", t: "Prueba en aire", ico: "aire" }, { id: "borde", t: "Recorrer borde", ico: "ruta", terc: true }] };
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
    ${a.acc.length ? `<span class="w-acc">${a.acc.map((b) => btn(b.id, b.t, { main: b.main, icono: b.ico, texto: b.texto, terc: b.terc })).join("")}</span>` : ""}
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
    pag.innerHTML = `
      <header class="cab0"><h2 tabindex="-1">CNC</h2>
        <button type="button" class="chip" data-tour="estado" data-ir="maquina" data-s="${em.s}" data-v="chip"><span class="punto" aria-hidden="true"></span><span data-v="chip-t">${esc(em.t)}</span></button></header>
      ${ahoraHTML(app, a, ps)}
      ${S.pcb || t.length ? `<button type="button" class="w ${S.pcb ? "con-thumb con-thumb--grande" : ""}" data-tour="w-placa" data-ir="placa">
        <span class="w-cab"><span>Archivo</span>${chev}</span>
        ${S.pcb ? `<span class="w-texto">${esc(S.pcb.nombre)}</span><span class="w-sub">${mm(S.pcb.marco.placa.x1 - S.pcb.marco.placa.x0, 1)} × ${mm(S.pcb.marco.placa.y1 - S.pcb.marco.placa.y0, 1)} mm · material ${mm(S.material.ancho, 0)} × ${mm(S.material.alto, 0)}</span>
          ${acc.holgura()?.cabe === false ? `<span class="w-sub w-sub--atencion">${ico("alerta")}No cabe en el material</span>` : ""}
          <img class="w-thumb" src="${S.pcb.miniatura}" alt="">`
        : `<span class="w-texto">${esc(t[0].nombre)}</span><span class="w-sub">${t.length} archivo${t.length > 1 ? "s" : ""} .nc</span>`}
      </button>` : ""}
      ${t.length && S.xyListo && (S.zListo || t.some(hecho)) ? `<section class="w" aria-labelledby="w-trab" data-tour="trabajos">
        <span class="w-cab"><span id="w-trab">Trabajo pendiente</span><span class="desp__resumen">${t.filter(hecho).length} de ${t.length}</span></span>
        <span class="filas">${t.map((x) => `<button type="button" class="fila tarea" data-trabajo="${x.id}" data-hecho="${hecho(x) ? 1 : 0}">
          <span class="tarea__check" style="--c:${app.hex(x.id)}" aria-label="${x.estado === "hecho" ? "Hecho" : x.estado === "omitido" ? "Omitido" : "Pendiente"}">${x.estado === "hecho" ? ico("ok") : ""}</span>
          <span class="fila__nom">${esc(x.nombre)}<small>${esc(x.herramienta)}</small></span>
          <span class="fila__val">${x.estado === "hecho" ? "Hecho" : x.estado === "omitido" ? "Omitido" : formatoTiempo(x.prev.tiempo)}</span>
          ${chev}</button>`).join("")}</span>
      </section>` : ""}
      <nav class="w-sec" aria-label="Más">
        ${!S.corriendo && !S.midiendo ? `<div class="w-sec__fila" data-tour="curso">
          <span class="w-sec__t">Curso básico de CNC${ls.get("examenAprobado", null) ? " · aprobado" : ""}</span>
          <span class="w-sec__acc">${btn("tutorial", "Tutorial")}${btn("examen", "Examen", { terc: true })}</span>
        </div>` : ""}
      </nav>
      <p class="firma">Fab Lab CNC v${VERSION} · © 2026 <a href="https://sebs.mx" target="_blank" rel="noopener">Sebastián Méndez</a></p>`;
    cablear(pag, {
      __irA: app.irA,
      conectar: () => acc.conectar("real"), sim: () => acc.conectar("sim"), homing: acc.homing, desbloquear: acc.desbloquear,
      abrir: acc.elegirArchivos, ejemplo: acc.cargarEjemplo, generar: () => generarYVer(app), verPlaca: () => app.irA("placa"),
      mover: () => app.irA("mover"), nueva: acc.nuevaPlaca,
      paso: () => acc.siguientePaso(acc.siguienteTrabajo()), zmanual: () => acc.asistenteZManual(acc.siguienteTrabajo()),
      misma: () => acc.mismaFresa(acc.siguienteTrabajo()),
      aire: () => acc.correrTrabajo(acc.siguienteTrabajo(), { aire: true }),
      mapa: acc.medirMapa, sinMapa: acc.sinMapa, tutorial: acc.tutorialGuiado, examen: acc.abrirExamen, borde: acc.recorrerBorde,
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
  const fuera = acc.paramsFuera(), cambiados = acc.paramsCambiados().length;
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
      <span class="w-cab"><span>Configuraciones de CNC</span>${chev}</span>
      <span class="w-sub ${fuera.length ? "w-sub--atencion" : ""}">${fuera.length ? `${fuera.length} ${fuera.length === 1 ? "valor fuera" : "valores fuera"} de rango` : cambiados ? `Cambiaste ${cambiados} ${cambiados === 1 ? "valor" : "valores"}` : "Valores de la Cubiko"}</span>
      <span class="cfg-res" style="--n:${GRUPOS.length}">${GRUPOS.map((g) => `<span class="cfg-res__col">
        <span class="cfg-res__t"><span class="cuad" style="background:${HERRAMIENTAS[g].color}"></span>${HERRAMIENTAS[g].t}</span>
        ${datosHerr(g, P[g]).map(([k, v]) => `<span class="cfg-res__d"><small>${k}</small><b>${v}</b></span>`).join("")}</span>`).join("")}</span>
    </button>
    ${fuera.length && !S.permitirFuera ? aviso("Corrige la configuración para poder generar.") : ""}
    ${pcb ? `<button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-acc="generar" ${S.generando ? "disabled" : ""}>${S.generando ? "Calculando…" : cam.length ? "Volver a generar" : "Generar trayectorias"}</button>
    <span class="w-sub" role="status" style="text-align:center">${S.ultimaGen && cam.length ? `Listo en ${S.ultimaGen.toFixed(1)} s` : ""}</span>
    ${previaHTML(app)}
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
        <span class="w-sub mono" style="text-align:center">${pcb.marco.W} × ${pcb.marco.H} px · ${pcb.vector ? "blanco = material que se queda" : "blanco = cobre que se queda"}</span>
        <span class="w-acc w-acc--centro" style="margin-top:0"><button type="button" class="btn-pill btn-pill--suave btn-igual" data-png>${ico("bajar")}PNG</button></span>
      </div>
    </details>` : ""}
    ${S.archivos.length ? `<details class="desp">
      <summary><span></span><span>Archivos</span><span class="desp__resumen">${S.archivos.length}</span>${chev}</summary>
      <div class="desp__cuerpo"><span class="filas">${S.archivos.map((a) => `<span class="fila">
        <span class="cuad" style="background:${a.tipo === "otro" ? "var(--riel)" : "var(--d-hecho)"}"></span>
        <span class="fila__nom">${esc(a.nombre)}<small>${TIPOS[a.tipo] || a.tipo}</small></span><span></span>
        <button type="button" class="btn-icono" data-quitar="${esc(a.nombre)}" aria-label="Quitar ${esc(a.nombre)}">${ico("x")}</button></span>`).join("")}</span>
        <span class="w-acc w-acc--centro" style="margin-top:4px">${btn("abrir", "Abrir más", { icono: "abrir" })}${btn("nueva", pcb?.vector ? "Nueva pieza" : "Nueva placa")}</span></div>
    </details>` : ""}
    ${[...cam, ...nc].length ? `<section class="w" aria-labelledby="p-nc"><span class="w-cab"><span id="p-nc">Archivos .nc</span></span>
      <span class="filas">${[...cam, ...nc].map((t) => `<span class="fila"><span class="cuad" style="background:${app.hex(t.id)}"></span>
        <span class="fila__nom">${esc(t.nombre)}<small>${t.lineas.length} líneas · ${formatoTiempo(t.prev.tiempo)}</small></span><span></span>
        <button type="button" class="btn-icono" data-bajar="${t.id}" aria-label="Descargar ${esc(t.nombre)}.nc">${ico("bajar")}</button></span>`).join("")}</span></section>` : ""}`;

  cablear(pag, { __irA: app.irA, abrir: acc.elegirArchivos, ejemplo: acc.cargarEjemplo, generar: () => generarYVer(app), nueva: acc.nuevaPlaca,
    centrar: acc.centrarDiseno, girarPieza: acc.girarPieza, matNuevo: () => { acc.materialNuevo(); app.refrescar(); } });
  const selMat = pag.querySelector("[data-mat-tipo]");
  if (selMat) selMat.onchange = () => acc.ponerTipoMaterial(selMat.value);
  pag.querySelectorAll("[data-m]").forEach((inp) => {
    inp.onchange = () => acc.ponerMaterial(inp.dataset.m, +inp.value);
    inp.addEventListener("focus", () => resaltar(pag, inp.dataset.m));
    inp.addEventListener("blur", () => resaltar(pag, null));
  });
  pag.querySelector("[data-atras]").onclick = app.regresar;
  pintarPrevia(pag, app);
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

// ---- Vista previa: la placa desde arriba como va a quedar (previa.js); Ampliar abre una ventana con zoom ----
function previaHTML(app) {
  const r = app.acc.vistaPrevia();
  if (!r) return "";
  const { S } = app, cobre = app.acc.mat().conduce, P = S.params.pistas;
  const pistas = S.trabajos.some((t) => t.id === "pistas" && t.estado !== "omitido");
  const aviso = (t) => `<div class="aviso">${ico("alerta")}<span>${esc(t)}</span></div>`;
  const muestra = (color, t) => `<span><span class="cuad" style="background:${color}"></span>${t}</span>`;
  return `<section class="w" aria-labelledby="p-prev" data-tour="previa">
    <span class="w-cab"><span id="p-prev">Vista previa</span><button type="button" class="btn-texto" data-ampliar style="min-height:32px">Ampliar</button></span>
    <canvas class="previa" data-previa role="img" aria-label="Vista desde arriba de cómo quedará: ${cobre ? "cobre que se queda, " : ""}lo fresado, lo que atraviesa y los hoyos"></canvas>
    <span class="leyenda">${muestra("var(--m-cobre)", cobre ? "Cobre" : S.material.tipo === "otro" ? "Material" : esc(app.acc.mat().t))}${muestra("var(--m-fr4)", "Fresado")}${muestra("#1A1815", "Atraviesa")}${r.cortaCobre > 0.02 ? muestra("#DC2626", "Corta el diseño") : ""}</span>
    ${pistas ? `<span class="w-sub">Pistas: ${P.pasadas} ${P.pasadas === 1 ? "pasada" : "pasadas"} · aíslan ${mm(anchoAislado(P), 2)} mm${S.zonas.length ? ` · ${S.zonas.length} ${S.zonas.length === 1 ? "zona" : "zonas"} sin cobre` : ""}</span>` : ""}
    <span class="w-sub">${esc(r.fuente)}</span>
    ${r.cambiado ? aviso("Cambiaste valores: vuelve a generar para ver el resultado con ellos.") : ""}
    ${r.cortaCobre > 0.02 ? aviso(`La fresa entra en el cobre del diseño (${r.cortaCobre.toFixed(2)} mm², en rojo).`) : ""}
    ${r.sinTaladrar ? `<span class="w-sub">${r.sinTaladrar} ${r.sinTaladrar === 1 ? "hoyo queda" : "hoyos quedan"} sin taladrar (anillos naranja)</span>` : ""}
  </section>`;
}
function pintarPrevia(pag, app) {
  const cv = pag.querySelector("[data-previa]");
  if (!cv) return;
  const r = app.acc.vistaPrevia();
  const dpr = devicePixelRatio || 1, w = cv.clientWidth || 320, k = (w * dpr) / r.cv.width;
  cv.width = Math.round(w * dpr); cv.height = Math.max(1, Math.round(r.cv.height * k));
  const x = cv.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(r.cv, 0, 0, cv.width, cv.height);
  cv.onclick = pag.querySelector("[data-ampliar]").onclick = () => ampliarPrevia(app);
}
// Generar desde un botón: al terminar se abre la vista previa grande. Si se generó fuera de Inicio
// (desde PCB o Configuraciones), la ventana trae «Ir a Inicio» para seguir con los pasos.
async function generarYVer(app) {
  const antes = app.S.trabajos;
  await app.acc.generar();
  if (app.S.trabajos !== antes && app.S.trabajos.some((t) => t.origen === "cam")) ampliarPrevia(app, { irInicio: app.vistaActual !== "inicio" });
}
// Herramientas de la ventana: Mover (arrastrar), Regla (dos clics, en mm o pulgadas) y, en una PCB,
// Sin cobre (arrastrar rectángulos donde se quita todo el cobre que no es del diseño; tocar uno lo quita).
function ampliarPrevia(app, { irInicio = false } = {}) {
  let r = app.acc.vistaPrevia();
  if (!r) return;
  const { S, acc } = app;
  const conZonas = !r.vector && acc.mat().conduce && !!S.pcb?.imgs?.pistas;
  dialogo({ titulo: "Vista previa", clase: "dlg--previa", contenido(c, d) {
    d.meta(`${mm(r.caja.x1 - r.caja.x0, 1)} × ${mm(r.caja.y1 - r.caja.y0, 1)} mm`);
    const modoBtn = (k, t) => `<button type="button" role="radio" data-modo="${k}" aria-checked="${k === "mover"}">${t}</button>`;
    c.innerHTML = `<div class="previa-ctl previa-ctl--arriba">
        <div class="seg" role="radiogroup" aria-label="Herramienta">${modoBtn("mover", "Mover")}${modoBtn("regla", `${ico("regla")}Regla`)}${conZonas ? modoBtn("zonas", "Sin cobre") : ""}</div>
        <span class="previa-dato mono" data-dato aria-live="polite"></span>
        <div class="seg seg--chico" role="radiogroup" aria-label="Unidad" data-unidades hidden>
          <button type="button" role="radio" data-u="mm">mm</button><button type="button" role="radio" data-u="in">in</button></div>
        <button type="button" class="btn-texto" data-borrar-zonas hidden>Quitar todas</button></div>
      <div class="previa-zoom" data-z tabindex="0" aria-label="Vista previa; rueda o botones para acercar, arrastra para mover">
        <div class="previa-lienzo" data-lienzo><svg class="previa-capa" data-capa preserveAspectRatio="none"></svg></div></div>
      <div class="previa-ctl"><button type="button" class="btn-icono" data-menos aria-label="Alejar">−</button><span class="mono" data-pct></span>
        <button type="button" class="btn-icono" data-mas aria-label="Acercar">+</button><button type="button" class="btn-texto" data-ajustar>Ajustar</button>
        <span class="w-sub" data-fuente>${esc(r.fuente)}</span>
        ${irInicio ? `<span style="flex:1"></span><button type="button" class="btn-pill btn-pill--main" data-inicio>Ir a Inicio</button>` : ""}</div>`;
    if (irInicio) c.querySelector("[data-inicio]").onclick = () => { d.cerrar(); app.irA("inicio"); };
    const z = c.querySelector("[data-z]"), pct = c.querySelector("[data-pct]"), lienzo = c.querySelector("[data-lienzo]"), capa = c.querySelector("[data-capa]");
    const dato = c.querySelector("[data-dato]"), unidades = c.querySelector("[data-unidades]"), borrarZonas = c.querySelector("[data-borrar-zonas]");
    const img = document.createElement("canvas");
    img.className = "previa-grande"; lienzo.prepend(img);
    const ponerImagen = () => {
      img.width = r.cv.width; img.height = r.cv.height; img.getContext("2d").drawImage(r.cv, 0, 0);
      capa.setAttribute("viewBox", `0 0 ${img.width} ${img.height}`);
    };
    ponerImagen();
    let e = 1, modo = "mover", unidad = ls.get("unidadRegla", "mm"), regla = [], vivo = null, arrastre = null, calculando = false;
    // píxel de la imagen ↔ mm de trabajo ↔ mm del diseño (las zonas se guardan en el diseño)
    const aMM = (px, py) => [r.caja.x0 + px / r.s, r.caja.y1 - py / r.s];
    const aPx = (x, y) => [(x - r.caja.x0) * r.s, (r.caja.y1 - y) * r.s];
    const enImagen = (ev) => { const b = lienzo.getBoundingClientRect(); return [(ev.clientX - b.left) / e, (ev.clientY - b.top) / e]; };
    const largo = (v) => (unidad === "in" ? `${(v / 25.4).toFixed(3)} in` : `${mm(v, 2)} mm`);
    const pintarCapa = () => {
      const k = 1 / e, partes = [];
      for (const [i, zn] of S.zonas.entries()) {
        const [ax, ay] = aPx(zn.x0 - r.origen.x, zn.y1 - r.origen.y), [bx, by] = aPx(zn.x1 - r.origen.x, zn.y0 - r.origen.y);
        partes.push(`<rect class="previa-zona" data-zona="${i}" x="${ax}" y="${ay}" width="${bx - ax}" height="${by - ay}" vector-effect="non-scaling-stroke"/>`);
      }
      if (arrastre?.rect) { const [ax, ay, bx, by] = arrastre.rect; partes.push(`<rect class="previa-zona previa-zona--nueva" x="${Math.min(ax, bx)}" y="${Math.min(ay, by)}" width="${Math.abs(bx - ax)}" height="${Math.abs(by - ay)}" vector-effect="non-scaling-stroke"/>`); }
      const pts = vivo && regla.length === 1 ? [regla[0], vivo] : regla;
      if (pts.length) {
        const [[ax, ay], [bx, by] = pts[0]] = pts;
        partes.push(`<line class="previa-regla" x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" vector-effect="non-scaling-stroke"/>`,
          ...pts.map(([x, y]) => `<circle class="previa-regla__p" cx="${x}" cy="${y}" r="${4 * k}" vector-effect="non-scaling-stroke"/>`));
        if (pts.length === 2) partes.push(`<text class="previa-regla__t" x="${(ax + bx) / 2}" y="${(ay + by) / 2 - 8 * k}" font-size="${13 * k}">${largo(Math.hypot(bx - ax, by - ay) / r.s)}</text>`);
      }
      capa.innerHTML = partes.join("");
      // Lo que dice la barra según la herramienta
      if (modo === "regla") {
        if (pts.length === 2) {
          const [[ax, ay], [bx, by]] = pts, dx = Math.abs(bx - ax) / r.s, dy = Math.abs(by - ay) / r.s;
          dato.textContent = `${largo(Math.hypot(dx, dy))} · ΔX ${largo(dx)} · ΔY ${largo(dy)}`;
        } else dato.textContent = regla.length ? "Clic en el segundo punto" : "Clic en el primer punto";
      } else if (modo === "zonas") dato.textContent = calculando ? "Calculando…" : S.zonas.length ? `${S.zonas.length} ${S.zonas.length === 1 ? "zona" : "zonas"} · toca una para quitarla${S.zonasVacias ? " · solo hay cobre del diseño" : ""}` : "Arrastra un rectángulo donde no quieres cobre";
      else dato.textContent = "";
      borrarZonas.hidden = modo !== "zonas" || !S.zonas.length;
    };
    const ponerModo = (m) => {
      modo = m; regla = []; vivo = null;
      c.querySelectorAll("[data-modo]").forEach((b) => b.setAttribute("aria-checked", b.dataset.modo === m));
      z.dataset.modo = m; unidades.hidden = m !== "regla";
      pintarCapa();
    };
    const ponerUnidad = (u) => { unidad = u; ls.set("unidadRegla", u); unidades.querySelectorAll("[data-u]").forEach((b) => b.setAttribute("aria-checked", b.dataset.u === u)); pintarCapa(); };
    c.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => ponerModo(b.dataset.modo)));
    unidades.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => ponerUnidad(b.dataset.u)));
    ponerUnidad(unidad);
    // Las zonas cambian el G-code: se vuelve a generar y la imagen se actualiza aquí mismo
    const cambiarZonas = async (lista) => {
      calculando = true; pintarCapa();
      await acc.ponerZonas(lista);
      calculando = false;
      const nueva = acc.vistaPrevia();
      if (nueva) { r = nueva; ponerImagen(); poner(e); c.querySelector("[data-fuente]").textContent = r.fuente; }
      pintarCapa();
    };
    borrarZonas.onclick = () => cambiarZonas([]);

    const ajuste = () => Math.min(z.clientWidth / img.width, z.clientHeight / img.height);
    const poner = (nuevo, cx = z.clientWidth / 2, cy = z.clientHeight / 2) => {
      nuevo = Math.min(2, Math.max(ajuste(), nuevo));
      const px = (z.scrollLeft + cx) / e, py = (z.scrollTop + cy) / e;
      e = nuevo; lienzo.style.width = `${img.width * e}px`; lienzo.style.height = `${img.height * e}px`;
      z.scrollLeft = px * e - cx; z.scrollTop = py * e - cy;
      pct.textContent = `${(e / ajuste()).toFixed(1)}×`;
      pintarCapa();
    };
    requestAnimationFrame(() => { e = ajuste(); poner(e); });
    c.querySelector("[data-mas]").onclick = () => poner(e * 1.6);
    c.querySelector("[data-menos]").onclick = () => poner(e / 1.6);
    c.querySelector("[data-ajustar]").onclick = () => poner(ajuste());
    z.addEventListener("wheel", (ev) => { ev.preventDefault(); const b = z.getBoundingClientRect(); poner(e * (ev.deltaY < 0 ? 1.25 : 0.8), ev.clientX - b.left, ev.clientY - b.top); }, { passive: false });
    // Arrastrar mueve (con mouse; en táctil la vista se desplaza sola) salvo en Sin cobre, donde dibuja.
    // Un clic sin arrastrar pone un punto de la regla o quita la zona tocada.
    z.addEventListener("pointerdown", (ev) => {
      if (ev.button > 0 || calculando) return;
      const p = enImagen(ev);
      if (modo === "zonas") arrastre = { x: ev.clientX, y: ev.clientY, p, rect: null, zona: ev.target.closest?.("[data-zona]")?.dataset.zona };
      else if (ev.pointerType === "mouse") { arrastre = { x: ev.clientX, y: ev.clientY, l: z.scrollLeft, t: z.scrollTop, p }; z.classList.add("arrastrando"); }
      else arrastre = { x: ev.clientX, y: ev.clientY, p, toque: true };
      z.setPointerCapture(ev.pointerId);
    });
    z.addEventListener("pointermove", (ev) => {
      if (modo === "regla" && regla.length === 1) { vivo = enImagen(ev); pintarCapa(); }
      if (!arrastre) return;
      const lejos = Math.hypot(ev.clientX - arrastre.x, ev.clientY - arrastre.y) > 4;
      if (modo === "zonas") { if (lejos || arrastre.rect) { arrastre.rect = [...arrastre.p, ...enImagen(ev)]; pintarCapa(); } return; }
      if (arrastre.l != null) { z.scrollLeft = arrastre.l - (ev.clientX - arrastre.x); z.scrollTop = arrastre.t - (ev.clientY - arrastre.y); }
      if (lejos) arrastre.movio = true;
    });
    z.addEventListener("pointerup", (ev) => {
      const a = arrastre; arrastre = null; z.classList.remove("arrastrando");
      if (!a) return;
      if (modo === "zonas") {
        if (a.rect) {
          const [ax, ay, bx, by] = a.rect;
          const [x0, y1] = aMM(Math.min(ax, bx), Math.min(ay, by)), [x1, y0] = aMM(Math.max(ax, bx), Math.max(ay, by));
          if (x1 - x0 > 0.3 && y1 - y0 > 0.3) return cambiarZonas([...S.zonas, { x0: x0 + r.origen.x, y0: y0 + r.origen.y, x1: x1 + r.origen.x, y1: y1 + r.origen.y }]);
          return pintarCapa();
        }
        if (a.zona != null) cambiarZonas(S.zonas.filter((_, i) => i !== +a.zona));
        return;
      }
      if (modo === "regla" && !a.movio) {
        regla = regla.length === 1 ? [regla[0], enImagen(ev)] : [enImagen(ev)];
        vivo = null; pintarCapa();
      }
    });
    z.addEventListener("pointercancel", () => { arrastre = null; z.classList.remove("arrastrando"); pintarCapa(); });
    ponerModo("mover");
  } });
}

// ---- Material: la placa virgen en 3D (isométrico) con el diseño encima; sus tres medidas en un renglón ----
function materialHTML(app) {
  const { S, acc, visor } = app;
  const M = S.material, d = acc.tamDiseno(), h = acc.holgura(), bloq = acc.disenoBloqueado();
  const medida = (k, eje, txt, paso = 0.5) => `<label class="mat__campo"><span><b data-eje="${eje}">${eje}</b>${txt}</span>
    <span class="u"><input type="number" step="${paso}" min="0.1" data-m="${k}" value="${M[k]}"><i>mm</i></span></label>`;
  const offset = (k, txt) => `<label class="campo"><span>${txt}</span><span class="u"><input type="number" step="0.5" min="-50" data-m="${k}" value="${M[k]}" ${bloq ? "disabled" : ""}><i>mm</i></span></label>`;
  const LADOS = { izq: "por la izquierda", der: "por la derecha", abajo: "por abajo", arriba: "por arriba" };
  const sale = h ? Object.keys(LADOS).filter((k) => h.sale[k] >= 0.05).map((k) => `${mm(h.sale[k], 1)} mm ${LADOS[k]}`) : [];
  const estado = !h || h.cabe ? ""
    : `<div class="aviso">${ico("alerta")}<span>No cabe: se sale ${sale.join(" y ")}.${h.cabeCentrado ? " Centrado sí cabe." : h.cabeGirado ? " Girando el diseño 90° sí cabe." : " Necesitas un material más grande."}</span></div>`;
  const area = M.ancho > 145 || M.alto > 110;
  return `<section class="w" aria-labelledby="p-mat" data-tour="material">
    <span class="w-cab"><span id="p-mat">Material</span>
      <select class="mat__tipo" data-mat-tipo aria-label="Qué material" ${bloq ? "disabled" : ""}>${Object.entries(MATERIALES).map(([k, m]) => `<option value="${k}" ${k === M.tipo ? "selected" : ""}>${esc(m.t)}</option>`).join("")}</select></span>
    <div class="mat__dib">${placaIso(M, d, h)}</div>
    <div class="campos mat__dims">${medida("ancho", "X", "Ancho")}${medida("alto", "Y", "Alto")}${medida("grosor", "Z", "Grosor", 0.1)}</div>
    ${estado}
    ${area ? `<div class="aviso">${ico("alerta")}<span>Más grande que el área de la Cubiko (145 × 110 mm).</span></div>` : ""}
    ${d ? `<div class="campos campos--2">${offset("x", "Offset izquierdo")}${offset("y", "Offset inferior")}</div>` : ""}
    ${d || visor.hayCortes ? `<span class="w-acc w-acc--centro">${d ? btn("centrar", "Centrar", { dis: bloq }) + btn("girarPieza", "Girar 90°", { dis: bloq }) : ""}${visor.hayCortes ? btn("matNuevo", "Borrar cortes del 3D") : ""}</span>` : ""}
  </section>`;
}
// La placa en isométrico: cara de arriba del color del material, cantos, el diseño punteado encima y los ejes
// en la esquina del cero (X rojo, Y verde, Z azul). Se ajusta a las medidas; el grosor se exagera para verse.
function placaIso(M, d, h) {
  const ex = [0.9, 0.36], ey = [0.62, -0.42], ez = [0, -1];
  const s = Math.max(M.ancho, M.alto), g = Math.max(M.grosor, s * 0.035);
  const P = (x, y, z = g) => [x * ex[0] + y * ey[0] + z * ez[0], x * ex[1] + y * ey[1] + z * ez[1]];
  const pol = (pts, cls, extra = "") => `<polygon class="${cls}" points="${pts.map((p) => p.map((v) => v.toFixed(2)).join(",")).join(" ")}" ${extra}/>`;
  const rect = (x, y, w, hh, z, cls, extra) => pol([P(x, y, z), P(x + w, y, z), P(x + w, y + hh, z), P(x, y + hh, z)], cls, extra);
  const W = M.ancho, H = M.alto, fuera = h && !h.cabe;
  const largo = s * 0.16;
  const flecha = (a, b, cls) => `<line class="iso-eje ${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" marker-end="url(#iso-p-${cls})"/>`;
  const pts = [P(0, 0, 0), P(W, 0, 0), P(W, H, 0), P(0, H, 0), P(0, 0), P(W, 0), P(W, H), P(0, H), P(0, 0, g + largo), P(-largo * 0.2, 0)];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), pad = s * 0.06;
  const vb = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
  const marca = (cls) => `<marker id="iso-p-${cls}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="iso-punta ${cls}"/></marker>`;
  return `<svg class="mat-iso" viewBox="${vb.map((v) => v.toFixed(2)).join(" ")}" role="img" aria-label="Material de ${mm(W, 1)} por ${mm(H, 1)} por ${mm(M.grosor, 1)} mm${d ? ` con el diseño de ${mm(d.ancho, 1)} por ${mm(d.alto, 1)} mm` : ""}">
    <defs>${marca("x")}${marca("y")}${marca("z")}</defs>
    ${pol([P(0, 0, 0), P(W, 0, 0), P(W, 0), P(0, 0)], "iso-frente")}
    ${pol([P(W, 0, 0), P(W, H, 0), P(W, H), P(W, 0)], "iso-lado")}
    ${rect(0, 0, W, H, g, "iso-arriba")}
    ${h ? rect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0, g, `iso-corte${fuera ? " es-fuera" : ""}`) : ""}
    ${d ? rect(M.x, M.y, d.ancho, d.alto, g, `iso-diseno${fuera ? " es-fuera" : ""}`, 'vector-effect="non-scaling-stroke"') : ""}
    ${flecha(P(0, 0), P(largo, 0), "x")}${flecha(P(0, 0), P(0, largo), "y")}${flecha(P(0, 0), P(0, 0, g + largo), "z")}
    <circle class="iso-cero" cx="${P(0, 0)[0]}" cy="${P(0, 0)[1]}" r="${s * 0.014}"/>
  </svg>`;
}

// Lo más importante de cada herramienta, para el resumen de Configuraciones de CNC
const nn = (v, d = 2) => +(+v).toFixed(d);
function datosHerr(g, Q) {
  if (g === "pistas") return [["Fresa", `V ${nn(Q.angulo, 0)}° · ${nn(Q.punta)}`], ["Corte", `${nn(Q.diam)} mm`], ["Prof.", `${nn(Q.prof)} mm`], ["Pasadas", Q.pasadas], ["Avance", nn(Q.f, 0)]];
  if (g === "hoyos") return [["Broca", `Ø${nn(Q.broca)}`], ["Prof.", `${nn(Q.prof)} mm`], ["Hoyos", `Ø${nn(Q.min)}–${nn(Q.max)}`], ["Bajada", nn(Q.fz, 0)]];
  if (g === "contorno") return [["Fresa", `Ø${nn(Q.diam)}`], ["Prof.", `${nn(Q.prof)} mm`], ["Pasadas", Q.pasadas], ["Puentes", Q.puentes], ["Avance", nn(Q.f, 0)]];
  if (g === "grabado") return [["Fresa", `V ${nn(Q.angulo, 0)}° · ${nn(Q.punta)}`], ["Prof.", `${nn(Q.prof)} mm`], ["Pasadas", Q.pasadas], ["Avance", nn(Q.f, 0)]];
  if (g === "vaciado") return [["Prof.", `${nn(Q.prof)} mm`], ["Pasadas", Q.pasadas], ["Traslape", `${nn(Q.traslape * 100, 0)}%`], ["Avance", nn(Q.f, 0)]];
  return [];
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
  // Fuera de rango: el aviso y el campo en rojo (no se genera hasta corregirlo)
  const malos = (g, Q) => revisarRango(g, Q, grosor);
  const extraTodo = (g, Q) => extra(g, Q) + Object.values(malos(g, Q)).map((t) => `<div class="aviso aviso--fuera">${ico("alerta")}<span>${esc(t)}</span></div>`).join("");
  const seccion = (g) => {
    const H = HERRAMIENTAS[g];
    return `<section class="w herr" data-herr="${g}" data-tour="herr-${g}" aria-labelledby="h-${g}">
      <span class="w-cab"><span id="h-${g}" class="herr__t"><span class="cuad" style="background:${H.color}"></span>${H.t}</span></span>
      <div class="herr__dib" data-dib>${dib(g, P[g])}</div>
      <div class="pila-s" data-extra>${extraTodo(g, P[g])}</div>
      ${g === "hoyos" ? rango() : ""}
      <div class="campos">${CAMPOS[g].map((c) => campo(g, c)).join("")}</div>
      ${g === "pistas" ? `<label class="check"><input type="checkbox" data-p="pistas.orilla" ${P.pistas.orilla !== false ? "checked" : ""} aria-describedby="n-pistas-orilla"> Limpiar la orilla${desc("pistas", "orilla")}</label>` : ""}
      ${g === "comun" ? `<label class="check"><input type="checkbox" data-p="comun.climb" ${P.comun.climb ? "checked" : ""} aria-describedby="n-comun-climb"> Fresado en concordancia${desc("comun", "climb")}</label>` : ""}
    </section>`;
  };
  const cam = S.trabajos.some((t) => t.origen === "cam");
  const nFuera = acc.paramsFuera().length;
  pag.innerHTML = `${cab2(queEs(S), "Configuraciones de CNC")}
    ${[...GRUPOS, "comun"].map(seccion).join("")}
    ${nFuera ? `<label class="check" style="align-self:center"><input type="checkbox" data-permitir ${S.permitirFuera ? "checked" : ""}> Generar con valores fuera de rango</label>` : ""}
    <button type="button" class="btn-texto" data-acc="defecto" style="align-self:center">Valores por defecto</button>
    ${previaHTML(app)}
    ${S.pcb ? `<button type="button" class="btn-pill btn-pill--main btn-pill--ancho" data-acc="generar" ${S.generando ? "disabled" : ""}>${S.generando ? "Calculando…" : cam ? "Volver a generar" : "Generar trayectorias"}</button>` : ""}`;
  cablear(pag, { __irA: app.irA, generar: () => generarYVer(app), defecto: acc.paramsPorDefecto });
  pag.querySelector("[data-atras]").onclick = app.regresar;
  const perm = pag.querySelector("[data-permitir]");
  if (perm) perm.onchange = () => acc.ponerPermitirFuera(perm.checked);
  pintarPrevia(pag, app);
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
      sec.querySelector("[data-extra]").innerHTML = extraTodo(g, Q);
      marcar(Q);
      resaltar(sec, enfocado());
      return Q;
    };
    const marcar = (Q) => {
      const m = malos(g, Q);
      sec.querySelectorAll("[data-p]").forEach((i) => { const k = i.dataset.p.split(".")[1]; i.toggleAttribute("aria-invalid", !!m[k]); i.closest("label")?.classList.toggle("es-fuera", !!m[k]); });
      sec.querySelectorAll("svg [data-k]").forEach((e) => e.classList.toggle("es-fuera", !!m[e.dataset.k]));
    };
    marcar(P[g]);
    sec.querySelectorAll("[data-p]").forEach((inp) => {
      const k = inp.dataset.p.split(".")[1], lbl = inp.closest("label");
      inp.addEventListener("focus", () => { resaltar(sec, k); if (sinMouse() && NOTAS[g][k]) tip.en(NOTAS[g][k], lbl); });
      inp.addEventListener("blur", () => { resaltar(sec, null); tip.fuera(); });
      lbl.addEventListener("mouseenter", (e) => { resaltar(sec, k); if (NOTAS[g][k]) tip.sobre(NOTAS[g][k], e); });
      lbl.addEventListener("mousemove", tip.mover);
      lbl.addEventListener("mouseleave", () => { tip.fuera(); resaltar(sec, enfocado()); });
      lbl.addEventListener("mousedown", tip.fuera);
      inp.addEventListener("input", repintar);
      inp.addEventListener("change", () => {
        // Lo imposible no se acepta: bajo el mínimo del campo, o pasadas y puentes con decimales
        if (inp.type === "number" && inp.value !== "") {
          let v = +inp.value;
          if (inp.min !== "" && v < +inp.min) v = +inp.min;
          if (["pasadas", "puentes"].includes(k)) v = Math.round(v);
          if (v !== +inp.value) inp.value = v;
        }
        const Q = repintar(); if (Q[k] !== undefined && (typeof Q[k] === "boolean" || isFinite(Q[k]))) acc.ponerParam(g, k, Q[k]); });
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
        ${ico("capas")}<span class="fila__nom">Mapa de alturas<small>${!acc.mat().conduce ? "Solo sobre cobre" : r ? (S.usarMapa ? "Se aplica al fresar" : "Sin aplicar") : "Recomendado para las pistas"}</small></span>
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
      <label class="check"><input type="checkbox" data-ver ${S.verMalla ? "checked" : ""}> Ver en el 3D</label>
    </section>
    <section class="w" aria-labelledby="a-cfg">
      <span class="w-cab"><span id="a-cfg">Malla</span></span>
      <div class="campos" style="margin-top:6px">
        <label class="campo"><span>Separación mm</span><input type="number" step="1" min="3" data-h="paso" value="${d.paso}"><small class="muted">Distancia entre puntos</small></label>
        <label class="campo"><span>Bajar hasta mm</span><input type="number" step="0.5" min="0.5" data-h="prof" value="${d.prof}"><small class="muted">Lo más que baja bajo Z0</small></label>
        <label class="campo"><span>Sondeo mm/min</span><input type="number" step="5" min="5" data-h="f" value="${d.f}"><small class="muted">Velocidad al bajar</small></label>
      </div>
      <span class="w-sub" data-v="malla" style="margin-top:6px">${malla()}</span>
      ${acc.mat().conduce ? "" : `<div class="aviso">${ico("alerta")}<span>Se mide tocando el material con la sonda: el ${esc(acc.mat().t.toLowerCase())} no conduce.</span></div>`}
      <span class="w-acc">${btn("medir", "Medir", { main: true, icono: "sonda", dis: !grbl.listo || !c || !!S.midiendo || !!S.corriendo || !acc.mat().conduce })}${btn("importar", ".map", { icono: "abrir" })}${btn("exportar", ".map", { icono: "bajar", dis: !S.mapa })}</span>
    </section>`;
  pag.querySelectorAll("[data-h]").forEach((i) => (i.onchange = () => { if (!isFinite(+i.value) || +i.value < +i.min) { i.value = d[i.dataset.h]; return; } d[i.dataset.h] = +i.value; ls.set("alturas", d); pag.querySelector('[data-v="malla"]').textContent = malla(); }));
  pag.querySelector("[data-usar]").onchange = (e) => acc.ponerUsarMapa(e.target.checked);
  pag.querySelector("[data-ver]").onchange = (e) => acc.ponerVerMalla(e.target.checked);
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
