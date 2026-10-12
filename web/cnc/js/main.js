// main.js - la app CNC: estado, máquina, navegación del panel y acciones.
//
// El panel funciona como la app de un teléfono (arquitectura de OPI):
//   nivel 0  Inicio · Mover · Consola (barra inferior) + «+» acciones rápidas
//   nivel 2  el detalle de cada widget (Máquina, Pasos, PCB, Origen), con flecha al padre
//   nivel 3  lo que se abre desde un detalle (PCB → Configuración; Origen → Mapa de alturas, Calibración fina)
//   hojas    lo corto sube desde abajo: asistentes, confirmaciones, cada trabajo
// Las vistas viven en vistas.js; aquí está todo lo que hace algo.
// Depuración: window.__cnc

import { Grbl } from "./grbl.js";
import { SUPERFICIE } from "./grbl-sim.js";
import { Visor, COLOR_TRABAJO, AREA } from "./visor.js";
import { ALARMAS, ERRORES } from "./alarmas.js";
import { leer, transformar, alineacion, formatoTiempo, tiempoAcumulado } from "./gcode.js";
import { MapaAlturas } from "./alturas.js";
import { clasificar, leerGerber, leerTaladros, leerJob } from "./gerber.js";
import { marco, imagenes } from "./raster.js";
import * as cam from "./cam.js";
import { $, $$, esc, ico, mm, ls, descargar, asistente, confirmar, miniJog, hoja, hojaAbierta, cerrarHojaSuperior, dialogoAbierto, cerrarDialogoSuperior, anunciar } from "./ui.js";
import { abrirTutorial, recorrido } from "./tutorial.js";
import { VISTAS, ahora } from "./vistas.js";

const grbl = new Grbl();
const visor = new Visor($("#visor"));

const S = {
  modo: ls.get("modo", "real"),
  estilo: document.documentElement.dataset.estilo || "lab",
  homed: false, xyListo: false, zListo: false, herramientaZ: null,
  alinear: null, mapa: null, usarMapa: true, dzAire: ls.get("dzAire", 5),
  alarma: null,          // código de ALARM, "bloqueo" al encender, o null
  archivos: [],          // {nombre, tipo, texto}
  pcb: null,             // {cobre, contorno, hoyos, job, marco, imgs, miniatura, nombre}
  params: conPistasV(structuredClone(ls.get("params", null) || cam.DEF)),
  material: null,        // {ancho, alto, grosor, x, y}: la placa virgen y dónde va el diseño dentro de ella
  trabajos: [],          // {id, origen, nombre, herramienta, lineas, prev, estado}
  corriendo: null,       // id del trabajo en curso
  prog: null,            // {id, h, n, t0, aire}
  generando: false, midiendo: null,
};
for (const k of Object.keys(cam.DEF)) S.params[k] = { ...cam.DEF[k], ...(S.params[k] || {}) };
const MAT_DEF = { ancho: 100, alto: 70, grosor: 1.6, x: 3, y: 3 };
S.material = { ...MAT_DEF, ...(ls.get("material", null) || {}) };

const MASC = {
  hola: "../img/fresa/hola.webp", sonda: "../img/fresa/sonda.webp", fresando: "../img/fresa/fresando.webp",
  placa: "../img/fresa/placa.webp", archivos: "../img/fresa/archivos.webp", alerta: "../img/fresa/alerta.webp",
  // poses del tutorial
  senala: "../img/fresa/senala.webp", explica: "../img/fresa/explica.webp", piensa: "../img/fresa/piensa.webp",
  celebra: "../img/fresa/celebra.webp", lupa: "../img/fresa/lupa.webp",
};

// ======================================================================
// Navegación del panel
// ======================================================================
const TABS = ["inicio", "mover", "consola"];
const PADRE = { config: "placa", alturas: "origen", fina: "origen" };
const nav = { actual: null, vivo: null };

function irA(id, { dir = null, foco = true } = {}) {
  const antes = nav.actual;
  const nivel = (v) => (TABS.includes(v) ? 0 : PADRE[v] ? 3 : 2);
  if (!dir) dir = !antes ? "ninguna" : nivel(id) > nivel(antes) ? "der" : nivel(id) < nivel(antes) ? "izq" : "funde";
  nav.actual = id;
  const cont = $("#vista");
  const pag = document.createElement("div");
  pag.className = "pag" + ({ der: " pag--entra-der", izq: " pag--entra-izq", funde: " pag--funde" }[dir] || "");
  const r = VISTAS[id](pag, app) || {};
  nav.vivo = r.vivo || null;
  cont.replaceChildren(pag);
  cont.scrollTop = 0;
  // Barra inferior: en el nivel 2 sigue encendido Inicio
  const tab = TABS.includes(id) ? id : "inicio";
  $$(".navinf__pildora [data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    if (b.dataset.tab === "inicio") b.querySelector("use").setAttribute("href", on ? "#i-casa-on" : "#i-casa");
  });
  if (foco && antes && dir !== "ninguna") pag.querySelector("h2")?.focus({ preventScroll: true });
  nav.vivo?.();
}
function regresar() { irA(PADRE[nav.actual] || "inicio", { dir: "izq" }); }
// Vuelve a pintar la página actual, sin animación y sin perder el scroll
function refrescar() {
  if (!nav.actual) return;
  const st = $("#vista").scrollTop;
  irA(nav.actual, { dir: "ninguna", foco: false });
  $("#vista").scrollTop = st;
}
$$(".navinf__pildora [data-tab]").forEach((b) => (b.onclick = () => irA(b.dataset.tab)));
$("#btn-mas").onclick = () => accionesRapidas();

// ======================================================================
// Máquina
// ======================================================================
async function conectar(modo = S.modo) {
  if (grbl.conectado) { await grbl.desconectar(); refrescar(); return; }
  if (modo !== S.modo) ponerModo(modo);
  S.homed = false; S.xyListo = false; S.zListo = false; S.herramientaZ = null; S.alarma = null;
  if (modo === "sim") grbl.conectarSim(); else await grbl.conectar();
  refrescar();
}
function ponerModo(m) { S.modo = m; ls.set("modo", m); }
async function cambiarModo(m) {
  if (m === S.modo) return;
  if (grbl.conectado) await grbl.desconectar();
  ponerModo(m); refrescar();
}
async function homing() {
  S.alarma = null; refrescar();
  const r = await grbl.enviar("$H");
  // La máquina gobierna: tras el ok se espera su reporte de posición (en la Cubiko real, 0,0,0)
  // para que el gemelo quede en casa con ella, sin animación de por medio.
  if (r.ok) { S.homed = true; await grbl.esperarQuieto(5000); visor.saltar(); anunciar("Homing hecho"); }
  refrescar();
}
async function desbloquear() {
  await grbl.enviar("$X");
  S.alarma = null; refrescar();
}
async function paro() {
  if (!grbl.listo) return;
  await grbl.parar();
  log("PARO: pausa y reinicio. La posición se conserva.", "sys err");
  anunciar("Paro");
}
function ponerEstilo(e) { S.estilo = e; document.documentElement.dataset.estilo = e; ls.set("estilo", e); refrescar(); }

let pendiente = false;
grbl.addEventListener("cambio", () => { if (!pendiente) { pendiente = true; requestAnimationFrame(() => { pendiente = false; actualizar(); }); } });
grbl.addEventListener("alarma", (e) => {
  const n = e.detail.codigo;
  if ([1, 3, 6, 7, 8, 9, 10].includes(n)) S.homed = false;
  S.alarma = n;
  anunciar(`Alarma ${n}. ${ALARMAS[n]?.t || ""}`);
  if (!hojaAbierta() && nav.actual !== "inicio") irA("inicio"); else refrescar();
});
grbl.addEventListener("error", (e) => { const t = ERRORES[e.detail.codigo]; if (t) log(`  ${t}`, "err"); });
grbl.addEventListener("log", (e) => {
  log(e.detail.texto, e.detail.clase);
  if (/\[MSG:'\$H'\|'\$X' to unlock\]/.test(e.detail.texto)) { S.alarma = "bloqueo"; refrescar(); }
});

// La Cubiko real trae HOMING_FORCE_SET_ORIGIN (la «Z» de [OPT:VMZ0L,…]): tras $H su posición de
// máquina es 0,0,0 y el recorrido va en positivo. El gemelo está en el marco de GRBL estándar
// (X −145…0, Y −110…0, Z −40…0, casa a la izquierda, atrás y arriba menos el retroceso $27), así
// que se traslada al dibujar. WPos no cambia: MPos y WCO se trasladan igual. El simulador ya
// trabaja en el marco estándar y no anuncia la «Z».
function aGemelo(p) {
  if (!p || !/Z/.test((grbl.opciones || "").split(",")[0])) return p;
  const r = grbl.ajustes[27] ?? 2;
  return { x: p.x - AREA.x + r, y: p.y - AREA.y + r, z: p.z - r };
}

function actualizar() {
  const e = grbl.est, ok = grbl.listo;
  if (ok && e.estado !== "Alarm" && S.alarma != null) S.alarma = null;
  const w = e.wpos;
  $("#wx").textContent = ok ? mm(w.x) : "—"; $("#wy").textContent = ok ? mm(w.y) : "—"; $("#wz").textContent = ok ? mm(w.z) : "—";
  // Fresando, la fresa toca el cobre todo el tiempo: el aviso de contacto es solo para calibrar
  const toca = ok && grbl.contacto && !S.corriendo;
  $("#sonda-visor").hidden = !toca;
  $("#btn-paro").disabled = !ok;
  visor.ponerPosicion(ok ? aGemelo(e.mpos) : visor.meta, aGemelo(e.wco), { xy: ok && S.xyListo, z: ok && S.zListo });
  // Surco: con el simulador, todo el rastro (también las esquinas que pasan entre dos reportes)
  if (ok) visor.cortar(grbl.sim ? grbl.sim.tomarRastro() : [aGemelo(e.mpos)]);
  visor.contacto(toca);
  visor.encendida(grbl.conectado);
  visor.pantalla({ conectado: ok, estado: e.estado, wpos: e.wpos });
  // Alarma visible desde cualquier pestaña: punto en «Inicio»
  const bi = $('.navinf__pildora [data-tab="inicio"]');
  const alarma = ok && e.estado === "Alarm";
  if (bi.classList.contains("con-alerta") !== alarma) {
    bi.classList.toggle("con-alerta", alarma);
    bi.setAttribute("aria-label", alarma ? "Inicio, hay una alarma" : "Inicio");
  }
  nav.vivo?.();
}

// ======================================================================
// Consola (un solo elemento; la página Consola lo adopta)
// ======================================================================
const consola = document.createElement("div");
consola.className = "consola"; consola.setAttribute("role", "log"); consola.setAttribute("aria-label", "Respuestas de la máquina"); consola.tabIndex = 0;
function log(texto, clase = "") {
  const d = document.createElement("div");
  d.className = clase; d.textContent = texto;
  consola.appendChild(d);
  while (consola.childElementCount > 600) consola.firstChild.remove();
  consola.scrollTop = consola.scrollHeight;
}
const hist = ls.get("hist", []);
function enviarComando(v) {
  v = v.trim(); if (!v) return;
  if (v === "?" || v === "!" || v === "~") grbl.tiempoReal(v);
  else grbl.enviar(v).then(async (r) => { if (v.toUpperCase() === "$H" && r.ok) { S.homed = true; await grbl.esperarQuieto(5000); visor.saltar(); refrescar(); } });
  if (hist[hist.length - 1] !== v) { hist.push(v); if (hist.length > 50) hist.shift(); ls.set("hist", hist); }
}

// ======================================================================
// Movimiento
// ======================================================================
let pasoJog = ls.get("pasoJog", 1);
function jog(x, y, z) {
  if (!grbl.listo || grbl.corriendo) return;
  const f = z ? Math.min(600, Math.max(60, pasoJog * 300)) : Math.min(2000, Math.max(100, pasoJog * 600));
  grbl.jog(x * pasoJog, y * pasoJog, z * pasoJog, f);
}
function ponerPasoJog(p) { pasoJog = p; ls.set("pasoJog", p); }
async function fijarXY() {
  const r = await grbl.enviar("G10 L20 P1 X0 Y0");
  if (r.ok) { S.xyListo = true; S.alinear = null; previsualizar(); anunciar("X0 Y0 fijado"); refrescar(); }
}
async function irACero() {
  const z = S.zListo ? S.params.comun.zSeguro : Math.max(grbl.est.wpos.z, 0);
  await grbl.enviarVarias(["G90", `G0 Z${z.toFixed(3)}`, "G0 X0 Y0"]);
}
async function subirZ() { await grbl.enviar("G53 G0 Z-1"); }
async function recorrerArea() {
  const c = cajaTrabajos(); if (!c) return;
  const z = S.zListo ? S.params.comun.zSeguro : Math.max(0, grbl.est.wpos.z);
  const p = (x, y) => `G0 X${x.toFixed(3)} Y${y.toFixed(3)}`;
  await grbl.enviarVarias(["G90", `G0 Z${z.toFixed(3)}`, p(c.x, c.y), p(c.x + c.ancho, c.y), p(c.x + c.ancho, c.y + c.alto), p(c.x, c.y + c.alto), p(c.x, c.y)]);
}

// ======================================================================
// Archivos y CAM
// ======================================================================
async function abrirArchivos(files) {
  for (const f of files) {
    const texto = await f.text();
    const tipo = clasificar(f.name, texto);
    if (tipo === "map") { S.mapa = MapaAlturas.deMap(texto); visor.ponerMalla(S.mapa); log(`Mapa de alturas: ${f.name}`, "sys"); continue; }
    S.archivos = S.archivos.filter((a) => a.nombre !== f.name);
    S.archivos.push({ nombre: f.name, tipo, texto });
  }
  procesarArchivos();
  refrescar();
}
$("#archivos").onchange = (e) => { abrirArchivos([...e.target.files]); e.target.value = ""; };
const elegirArchivos = () => $("#archivos").click();
function quitarArchivo(nombre) { S.archivos = S.archivos.filter((a) => a.nombre !== nombre); procesarArchivos(); refrescar(); }

function procesarArchivos() {
  const de = (t) => S.archivos.filter((a) => a.tipo === t);
  S.trabajos = S.trabajos.filter((t) => t.origen !== "nc");
  de("nc").forEach((a, i) => {
    S.trabajos.push({ id: `nc${i}`, origen: "nc", nombre: a.nombre.replace(/\.[^.]+$/, ""), herramienta: herramientaDeComentario(a.texto), lineas: a.texto.split(/\r?\n/), prev: leer(a.texto), estado: "pendiente" });
  });
  const cobre = de("cobre-sup")[0] || de("cobre-inf")[0];
  const contorno = de("contorno")[0];
  if (cobre || contorno) {
    const pcb = {
      cobre: cobre ? leerGerber(cobre.texto) : null,
      contorno: contorno ? leerGerber(contorno.texto) : null,
      hoyos: de("taladro").flatMap((t) => leerTaladros(t.texto).hoyos),
      job: de("job")[0] ? leerJob(de("job")[0].texto) : null,
    };
    if (pcb.contorno && !isFinite(pcb.contorno.caja.x0)) pcb.contorno = null;
    pcb.marco = marco(pcb, { dpi: 1000, margen: Math.max(2, S.params.contorno.diam + 1.5) });
    if (pcb.marco) {
      pcb.imgs = imagenes(pcb, pcb.marco);
      pcb.miniatura = miniatura(pcb.imgs.pistas || pcb.imgs.interior);
      pcb.nombre = pcb.job?.nombre || (cobre || contorno).nombre.replace(/[-_]?(F_Cu|B_Cu|Edge_Cuts)?\.(gbr|gtl|gbl|gko|gm1)$/i, "");
      S.pcb = pcb;
      S.trabajos = S.trabajos.filter((t) => t.origen !== "cam");
      aplicarMaterial();
    }
  } else S.pcb = null;
  previsualizar();
}

function miniatura(cv) {
  const k = 200 / Math.max(cv.width, cv.height);
  const m = document.createElement("canvas");
  m.width = Math.round(cv.width * k); m.height = Math.round(cv.height * k);
  const x = m.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(cv, 0, 0, m.width, m.height);
  return m.toDataURL("image/png");
}

function herramientaDeComentario(texto) {
  const m = texto.match(/\((?:[^)]*?)(FRESA|BROCA|V-?BIT|END ?MILL|TOOL)[^)]*?(\d+(?:\.\d+)?)\s*MM[^)]*\)/i);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]} mm` : "La del archivo";
}

async function cargarEjemplo() {
  // La placa del curso básico de KiCad (course-docs/pcb/kicad-basics-course)
  const base = "ejemplos/kicad-basics/";
  const nombres = ["F_Cu.gbr", "Edge_Cuts.gbr", "PTH.drl", "NPTH.drl", "job.gbrjob"].map((x) => `kicad basics course-${x}`);
  const files = [];
  for (const n of nombres) { try { const r = await fetch(base + encodeURIComponent(n)); if (r.ok) files.push(new File([await r.text()], n)); } catch (_) {} }
  if (files.length) await abrirArchivos(files);
}

async function generar() {
  if (!S.pcb || S.generando) return;
  S.generando = true; refrescar();
  await new Promise((r) => setTimeout(r, 40));
  const t0 = performance.now();
  const P = S.params, pcb = S.pcb, m = pcb.marco, nuevos = [], M = S.material;
  const origen = cam.origenDe(m, M);   // X0 Y0 = esquina del material; el diseño queda en (M.x, M.y)
  if (pcb.imgs.pistas) {
    const paths = cam.trayectoriasPistas(pcb.imgs.pistas, m, P.pistas, P.comun, origen);
    nuevos.push({ id: "pistas", origen: "cam", nombre: "Pistas", herramienta: `V ${P.pistas.angulo}° punta ${P.pistas.punta} · corte ${P.pistas.diam} mm`, lineas: cam.gcodePistas(paths, P.pistas, P.comun) });
  }
  const hoyos = cam.seleccionHoyos(pcb.hoyos || [], P.hoyos, m, origen);
  if (hoyos.length) nuevos.push({ id: "hoyos", origen: "cam", nombre: "Hoyos", herramienta: `Broca ${P.hoyos.broca} mm`, lineas: cam.gcodeHoyos(hoyos, P.hoyos, P.comun) });
  {
    const paths = cam.trayectoriasContorno(pcb.imgs.interior, m, P.contorno, P.comun, origen);
    nuevos.push({ id: "contorno", origen: "cam", nombre: "Contorno", herramienta: `Fresa ${P.contorno.diam} mm`, lineas: cam.gcodeContorno(paths, P.contorno, P.comun) });
  }
  for (const t of nuevos) {
    t.lineas.splice(1, 0, `(DISENO A X${M.x} Y${M.y} DE LA ESQUINA DEL MATERIAL)`);
    t.prev = leer(t.lineas.join("\n")); t.estado = "pendiente";
  }
  S.trabajos = [...nuevos, ...S.trabajos.filter((t) => t.origen !== "cam")];
  S.generando = false;
  S.ultimaGen = (performance.now() - t0) / 1000;
  previsualizar();
  anunciar(`Trayectorias listas: ${nuevos.map((t) => t.nombre).join(", ")}`);
  refrescar();
}
// Pistas con fresa en V: el ancho de corte (diam, el que usa el CAM) sale de punta, ángulo y
// profundidad. Los ajustes guardados antes de existir esos campos toman la fresa por defecto.
function conPistasV(P) {
  const q = P.pistas;
  if (q.punta == null || q.angulo == null) { q.punta = cam.DEF.pistas.punta; q.angulo = cam.DEF.pistas.angulo; }
  q.diam = cam.anchoV(q);
  return P;
}
function ponerParam(g, k, v) { S.params[g][k] = v; conPistasV(S.params); ls.set("params", S.params); }
function paramsPorDefecto() { S.params = structuredClone(cam.DEF); ls.set("params", S.params); refrescar(); }

function previsualizar() {
  // t.vista: el trabajo como lo verá la máquina (con la alineación); t.prev: en coordenadas del material
  for (const t of S.trabajos) t.vista = S.alinear ? leer(transformar(t.lineas, { alinear: S.alinear }).join("\n")) : t.prev;
  visor.ponerTrayectos(S.trabajos.map((t) => ({ id: t.id, segs: t.vista.segs, color: COLOR_TRABAJO[t.id] ?? COLOR_TRABAJO.archivo })));
  visor.ponerGiro(S.alinear);
  marcarDiseno();
}
function cajaTrabajos() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of S.trabajos) {
    const c = (t.vista || t.prev).corteCaja;
    if (!isFinite(c.min.x)) continue;
    x0 = Math.min(x0, c.min.x); y0 = Math.min(y0, c.min.y); x1 = Math.max(x1, c.max.x); y1 = Math.max(y1, c.max.y);
  }
  return isFinite(x0) ? { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 } : null;
}
function descargarTrabajo(id) {
  const t = S.trabajos.find((x) => x.id === id); if (!t) return;
  descargar(t.origen === "nc" ? `${t.nombre}.nc` : `${S.pcb?.nombre || "placa"}_${t.id}.nc`, t.lineas.join("\n") + "\n");
}
function nuevaPlaca() {
  S.archivos = []; S.pcb = null; S.trabajos = []; S.xyListo = false; S.zListo = false; S.herramientaZ = null; S.alinear = null; S.mapa = null;
  visor.ponerMalla(null); visor.limpiarSurcos(); previsualizar(); refrescar();
}

// ======================================================================
// Material: la placa virgen. X0 Y0 es su esquina inferior izquierda y el diseño va en (x, y) dentro de ella.
// ======================================================================
const diamDe = (txt) => { const m = String(txt || "").match(/(\d+(?:\.\d+)?)\s*mm/i); return m ? +m[1] : 0; };
function aplicarMaterial() {
  const M = S.material;
  visor.ponerMaterial({ ancho: M.ancho, alto: M.alto, grosor: M.grosor });
  SUPERFICIE.z = -40 + 2 + M.grosor;     // el simulador toca el cobre donde se ve (MDF de 2 mm + material)
  marcarDiseno();
}
// Tamaño del diseño: el contorno de la placa de KiCad
function tamDiseno() { const p = S.pcb?.marco?.placa; return p ? { ancho: p.x1 - p.x0, alto: p.y1 - p.y0 } : null; }
// Lo que ocupa el corte en el material, con el radio de cada herramienta (antes de generar: el diseño más el contorno)
function holgura() {
  const M = S.material;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const crecer = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  if (S.trabajos.length) {
    for (const t of S.trabajos) {
      const c = t.prev.corteCaja, r = diamDe(t.herramienta) / 2;
      if (isFinite(c.min.x)) crecer(c.min.x - r, c.min.y - r, c.max.x + r, c.max.y + r);
    }
  } else if (S.pcb) {
    const d = tamDiseno(), r = S.params.contorno.diam;
    crecer(M.x - r, M.y - r, M.x + d.ancho + r, M.y + d.alto + r);
  }
  if (!isFinite(x0)) return null;
  const sale = { izq: Math.max(0, -x0), der: Math.max(0, x1 - M.ancho), abajo: Math.max(0, -y0), arriba: Math.max(0, y1 - M.alto) };
  const cabe = Object.values(sale).every((v) => v < 0.05);
  const w = x1 - x0, h = y1 - y0;
  return {
    x0, y0, x1, y1, sale, cabe,
    margen: Math.min(x0, y0, M.ancho - x1, M.alto - y1),
    cabeCentrado: !cabe && w <= M.ancho && h <= M.alto,
    cabeGirado: !cabe && w <= M.alto && h <= M.ancho,
  };
}
function marcarDiseno() {
  const d = tamDiseno(), h = holgura();
  visor.ponerDiseno(d ? { x: S.material.x, y: S.material.y, ...d } : null, !h || h.cabe);
}
// Ya se empezó a fresar: mover el diseño dejaría lo hecho en otro lugar
const disenoBloqueado = () => !!S.corriendo || S.trabajos.some((t) => t.origen === "cam" && t.estado === "hecho");
async function moverDiseno() {
  ls.set("material", S.material);
  if (S.pcb && S.trabajos.some((t) => t.origen === "cam")) await generar();
  else { marcarDiseno(); refrescar(); }
}
function ponerMaterial(k, v) {
  if (!isFinite(v) || (["ancho", "alto", "grosor"].includes(k) && v <= 0)) { refrescar(); return; }
  S.material[k] = v;
  ls.set("material", S.material);
  if (k === "x" || k === "y") return moverDiseno();
  aplicarMaterial(); refrescar();
}
function centrarDiseno() {
  const d = tamDiseno(), M = S.material; if (!d) return;
  M.x = Math.round(((M.ancho - d.ancho) / 2) * 10) / 10; M.y = Math.round(((M.alto - d.alto) / 2) * 10) / 10;
  moverDiseno();
}
function girarMaterial() {
  const M = S.material;
  [M.ancho, M.alto] = [M.alto, M.ancho];
  ls.set("material", M); aplicarMaterial();
  if (holgura()?.cabeCentrado) centrarDiseno(); else refrescar();
}
function materialNuevo() { visor.limpiarSurcos(); anunciar("Material nuevo: cobre limpio"); }
const siguienteTrabajo = () => S.trabajos.find((t) => t.estado !== "hecho") || null;

// Arrastrar y soltar en el visor
const vis = $("#visor");
vis.addEventListener("dragover", (e) => { e.preventDefault(); $("#soltar").hidden = false; });
vis.addEventListener("dragleave", (e) => { if (!vis.contains(e.relatedTarget)) $("#soltar").hidden = true; });
vis.addEventListener("drop", (e) => { e.preventDefault(); $("#soltar").hidden = true; abrirArchivos([...e.dataTransfer.files]); });

// ======================================================================
// Asistentes (hojas)
// ======================================================================
const FIG_SONDA = `<svg viewBox="0 0 320 130" role="img" aria-label="Caimán en la fresa y cable a la placa de cobre" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <rect x="135" y="4" width="50" height="46" rx="8" fill="#1A1D22"/><path d="M160 50v42" stroke="#B7BCC4" stroke-width="6"/><path d="M157 92l3 8 3-8z" fill="#FF6B35"/>
  <rect x="40" y="104" width="240" height="6" rx="2" fill="#D28B53"/><rect x="40" y="110" width="240" height="9" rx="2" fill="#2F5E3A"/>
  <path d="M166 72c28-6 54 0 82-20" stroke="#E30613" stroke-width="2.5"/><rect x="164" y="67" width="13" height="9" rx="2" fill="#E30613"/>
  <path d="M248 52c18-12 36-2 36 18v34" stroke="#111317" stroke-width="2.5"/><circle cx="284" cy="104" r="4" fill="#111317"/></svg>`;
const mascImg = (k, ancho = 150) => `<img src="${MASC[k]}" alt="" width="${ancho}" style="align-self:center;height:auto" onerror="this.remove()">`;

async function asistenteZ(trabajo, { cambio = false } = {}) {
  const herr = trabajo?.herramienta || "la fresa";
  let probado = false, vio = false;
  const ok = await asistente({
    titulo: cambio ? "Cambio de fresa" : "Calibrar Z",
    pasos: [
      { titulo: cambio ? `Pon ${herr}` : `¿${herr} puesta?`, render(c) {
        c.innerHTML = `${cambio ? "<p>La fresa ya subió. Cambia la herramienta y apriétala.</p>" : ""}${mascImg("hola")}`;
      } },
      { titulo: "Conecta la sonda", render(c, api) {
        c.innerHTML = `<div class="figura">${FIG_SONDA}</div>
          <p>Toca la placa con el caimán para probar.</p>
          <div class="indicador" data-on="0" role="status"><span class="foco" aria-hidden="true"></span><span data-t>Sin contacto</span></div>
          ${grbl.sim ? '<button type="button" class="btn-pill btn-pill--suave" data-tocar>Mantén para simular el toque</button>' : ""}`;
        const ind = c.querySelector(".indicador");
        api.habilitar(probado);
        const tick = () => {
          const on = grbl.contacto;
          ind.dataset.on = on ? "1" : "0";
          ind.querySelector("[data-t]").textContent = on ? "Contacto" : probado ? "La sonda funciona" : "Sin contacto";
          if (on) vio = true;
          if (vio && !on && !probado) { probado = true; api.habilitar(true); anunciar("La sonda funciona"); }
        };
        const id = setInterval(tick, 80); api.alLimpiar(() => clearInterval(id));
        const b = c.querySelector("[data-tocar]");
        if (b) { const on = () => grbl.sim?.tocar(true), off = () => grbl.sim?.tocar(false); b.onpointerdown = on; b.onpointerup = off; b.onpointerleave = off; }
      } },
      { titulo: "Acerca la fresa a unos 5 mm", render(c, api) {
        c.innerHTML = `<div data-jog></div><p class="mono muted" data-z></p>
          <div class="aviso" data-aviso hidden>${ico("alerta")}<span>Hay contacto antes de bajar: el caimán no debe tocar la placa.</span></div>`;
        miniJog(c.querySelector("[data-jog]"), grbl);
        const id = setInterval(() => {
          c.querySelector("[data-z]").textContent = `Z ${mm(grbl.est.mpos.z, 2)} (máquina)`;
          const toca = grbl.contacto; c.querySelector("[data-aviso]").hidden = !toca; api.habilitar(!toca && grbl.est.estado === "Idle");
        }, 100);
        api.alLimpiar(() => clearInterval(id));
      } },
      { titulo: "Tocar la placa", render(c, api) {
        const g = ls.get("grosorSonda", 0);
        c.innerHTML = `<label class="campo" style="max-width:200px"><span>Placa de contacto mm</span><input type="number" step="0.01" min="0" value="${g}" data-g></label>
          <div class="resultado" data-r hidden role="status"></div>`;
        api.boton("Bajar y tocar");
        let hecho = false;
        api.alSiguiente(async () => {
          if (hecho) return true;
          const grosor = Math.max(0, +c.querySelector("[data-g]").value || 0); ls.set("grosorSonda", grosor);
          const r = c.querySelector("[data-r]"); r.hidden = false; r.textContent = "Bajando…";
          const p = await sondaZ(grosor);
          if (!p) { r.textContent = `No tocó. ${ALARMAS[5].pasos.join(". ")}.`; api.boton("Reintentar"); return false; }
          hecho = true; r.textContent = `Z0 fijado · contacto en ${mm(p.z, 3)} (máquina)`; api.boton("Siguiente");
          return false;
        });
      } },
      { titulo: "Quita el caimán", render(c) { c.innerHTML = mascImg("sonda"); } },
    ],
  });
  if (ok) { S.zListo = true; S.herramientaZ = herr; visor.herramienta(diamDe(herr)); anunciar("Z0 fijado"); }
  refrescar();
  return ok;
}

async function sondaZ(grosor) {
  if (grbl.est.estado === "Alarm") { await grbl.enviar("$X"); await new Promise((r) => setTimeout(r, 250)); }
  await grbl.enviarVarias(["G21", "G91"]);
  let p = await grbl.sondear("G38.2 Z-15 F100");
  if (!p) { await grbl.enviar("G90"); return null; }
  await grbl.enviar("G0 Z1");
  p = await grbl.sondear("G38.2 Z-2 F20");
  if (!p) { await grbl.enviar("G90"); return null; }
  await grbl.enviar(`G10 L20 P1 Z${grosor.toFixed(3)}`);
  await grbl.enviarVarias(["G0 Z5", "G90"]);
  await grbl.esperarQuieto();
  S.alarma = null;
  return p;
}

async function asistenteZManual(trabajo) {
  const herr = trabajo?.herramienta || "la fresa";
  const ok = await asistente({
    titulo: "Z sin sonda",
    pasos: [
      { titulo: "Papel sobre el cobre", render(c) { c.innerHTML = `<p>${esc(herr)} puesta y una hoja de papel bajo la fresa.</p>`; } },
      { titulo: "Baja hasta que el papel se atore", render(c) { c.innerHTML = `<div data-jog></div>`; miniJog(c.querySelector("[data-jog]"), grbl, { ejes: "Z" }); } },
      { titulo: "Fijar Z0", render(c, api) {
        c.innerHTML = `<p class="muted">Se descuentan 0.1 mm del papel y la fresa sube 5 mm.</p>`;
        api.boton("Fijar Z0");
        api.alSiguiente(async () => { await grbl.enviar("G10 L20 P1 Z0.1"); await grbl.enviarVarias(["G91", "G0 Z5", "G90"]); return true; });
      } },
    ],
  });
  if (ok) { S.zListo = true; S.herramientaZ = herr; }
  refrescar();
}

async function asistenteAlinear() {
  const hoyos = S.pcb ? cam.seleccionHoyos(S.pcb.hoyos, { min: 0, max: 99 }, S.pcb.marco, cam.origenDe(S.pcb.marco, S.material)) : [];
  if (hoyos.length < 2) return;
  const grandes = hoyos.slice().sort((a, b) => b.d - a.d).slice(0, Math.min(12, hoyos.length));
  let A = grandes[0], B = grandes[1], dmax = 0;
  for (const a of grandes) for (const b of grandes) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d > dmax) { dmax = d; A = a; B = b; } }
  const medido = {};
  const opcion = (h, i) => `<option value="${i}">Ø${h.d.toFixed(2)} · ${h.x.toFixed(2)}, ${h.y.toFixed(2)}</option>`;
  const ok = await asistente({
    titulo: "Alinear con 2 agujeros",
    pasos: [
      { titulo: "Dos agujeros separados", render(c) {
        c.innerHTML = `<label class="campo"><span>Agujero A</span><select data-a>${hoyos.map(opcion).join("")}</select></label>
          <label class="campo"><span>Agujero B</span><select data-b>${hoyos.map(opcion).join("")}</select></label>`;
        const sa = c.querySelector("[data-a]"), sb = c.querySelector("[data-b]");
        sa.value = hoyos.indexOf(A); sb.value = hoyos.indexOf(B);
        sa.onchange = () => (A = hoyos[+sa.value]); sb.onchange = () => (B = hoyos[+sb.value]);
      } },
      ...["A", "B"].map((k) => ({ titulo: `Centra la fresa en ${k}`, render(c, api) {
        const h = k === "A" ? A : B;
        c.innerHTML = `<button type="button" class="btn-pill btn-pill--suave" data-ir>${ico("mira")}Ir a donde debería estar</button>
          <div data-jog></div><p class="mono muted" data-p></p>`;
        miniJog(c.querySelector("[data-jog]"), grbl);
        c.querySelector("[data-ir]").onclick = () => grbl.enviarVarias(["G90", `G0 Z${S.params.comun.zSeguro}`, `G0 X${h.x.toFixed(3)} Y${h.y.toFixed(3)}`]);
        const id = setInterval(() => (c.querySelector("[data-p]").textContent = `${mm(grbl.est.wpos.x)}, ${mm(grbl.est.wpos.y)}`), 100);
        api.alLimpiar(() => clearInterval(id));
        api.boton("Está centrada");
        api.alSiguiente(async () => { medido[k] = { ...grbl.est.wpos }; return true; });
      } })),
      { titulo: "Resultado", render(c, api) {
        const al = alineacion(A, B, medido.A, medido.B);
        const err = Math.abs(al.escala - 1) * Math.hypot(B.x - A.x, B.y - A.y);
        c.innerHTML = `<div class="celdas"><div class="celda"><span>Giro</span><b>${((al.ang * 180) / Math.PI).toFixed(3)}°</b></div><div class="celda"><span>Desplazamiento</span><b>${al.dx.toFixed(2)}, ${al.dy.toFixed(2)}</b></div></div>
          ${err > 0.3 ? `<div class="aviso">${ico("alerta")}<span>La distancia entre agujeros difiere ${err.toFixed(2)} mm del diseño. ¿Son los agujeros elegidos?</span></div>` : ""}`;
        api.boton("Aplicar");
        api.alSiguiente(async () => { S.alinear = al; return true; });
      } },
    ],
  });
  if (ok) previsualizar();
  refrescar();
}

// Material chueco: con la esquina (X0 Y0) y un punto del borde de abajo sale el giro.
// Bastan dos puntos: el material es un rectángulo, así que el borde de abajo da el ángulo de todo.
async function asistenteBorde() {
  let medido = null;
  const grados = (p) => (Math.atan2(p.y, p.x) * 180) / Math.PI;
  const ok = await asistente({
    titulo: "Alinear con el borde",
    pasos: [
      { titulo: "La fresa sobre la esquina", render(c, api) {
        c.innerHTML = `<p>Punta justo encima de la esquina inferior izquierda del material, casi tocando.</p><div data-jog></div>`;
        miniJog(c.querySelector("[data-jog]"), grbl);
        api.boton("Fijar X0 Y0 aquí");
        api.alSiguiente(async () => {
          const r = await grbl.enviar("G10 L20 P1 X0 Y0");
          if (!r.ok) return false;
          S.xyListo = true; S.alinear = null; previsualizar();
          return true;
        });
      } },
      { titulo: "Ahora sobre el borde de abajo", render(c, api) {
        c.innerHTML = `<p>Ve a la derecha, cerca de la otra esquina, y corrige Y hasta quedar justo encima del borde.</p>
          <div data-jog></div><p class="mono muted" data-p></p>`;
        miniJog(c.querySelector("[data-jog]"), grbl);
        const id = setInterval(() => {
          const w = grbl.est.wpos;
          c.querySelector("[data-p]").textContent = `${mm(w.x)}, ${mm(w.y)} · giro ${grados(w).toFixed(2)}°`;
          api.habilitar(w.x >= 20 && grbl.est.estado === "Idle");
        }, 100);
        api.alLimpiar(() => clearInterval(id));
        api.boton("Está sobre el borde");
        api.alSiguiente(async () => { medido = { ...grbl.est.wpos }; return true; });
      } },
      { titulo: "Resultado", render(c, api) {
        const g = grados(medido), corre = Math.abs(Math.tan((g * Math.PI) / 180)) * S.material.ancho;
        c.innerHTML = `<div class="celdas"><div class="celda"><span>Giro</span><b>${g.toFixed(2)}°</b></div><div class="celda"><span>En ${mm(S.material.ancho, 0)} mm se corre</span><b>${mm(corre, 2)} mm</b></div></div>
          ${Math.abs(g) < 0.05 ? "<p>Tu material está derecho: no hace falta girar.</p>" : ""}
          ${Math.abs(g) > 10 ? `<div class="aviso">${ico("alerta")}<span>Más de 10° es mucho. ¿La fresa quedó sobre el borde de abajo?</span></div>` : ""}`;
        api.boton("Aplicar");
        api.alSiguiente(async () => { S.alinear = { ox: 0, oy: 0, ang: Math.atan2(medido.y, medido.x), dx: 0, dy: 0, borde: true }; return true; });
      } },
    ],
  });
  if (ok) { previsualizar(); anunciar("Material alineado"); }
  refrescar();
}

async function medirAlturas(d) {
  const c = cajaTrabajos(); if (!c) return;
  if (!S.zListo) { await confirmar({ titulo: "Primero calibra Z", html: "<p>El mapa se mide desde Z0.</p>", si: "Entendido", no: "Cerrar" }); return; }
  if (!(await confirmar({ titulo: "Medir alturas", html: "<p>Caimán en la fresa y cable en la placa hasta que termine.</p>", si: "Empezar" }))) return;
  const nx = Math.max(2, Math.ceil(c.ancho / d.paso) + 1), ny = Math.max(2, Math.ceil(c.alto / d.paso) + 1);
  const mapa = new MapaAlturas({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto, nx, ny });
  S.midiendo = { k: 0, n: nx * ny };
  visor.ponerMalla(mapa); refrescar();
  await grbl.enviarVarias(["G21", "G90", "G0 Z2"]);
  for (const p of mapa.recorrido()) {
    await grbl.enviar(`G0 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`);
    const r = await grbl.sondear(`G38.2 Z-${d.prof} F${d.f}`);
    if (!r) { log(`El sondeo falló en ${p.x.toFixed(1)}, ${p.y.toFixed(1)}.`, "sys err"); S.midiendo = null; refrescar(); return; }
    mapa.valores[p.j][p.i] = r.z - grbl.est.wco.z;
    await grbl.enviar("G0 Z2");
    S.midiendo.k++; visor.ponerMalla(mapa); nav.vivo?.();
  }
  await grbl.enviar(`G0 Z${S.params.comun.zSeguro}`);
  S.mapa = mapa; S.midiendo = null;
  anunciar("Mapa de alturas listo");
  refrescar();
}
function exportarMapa() { if (S.mapa) descargar("mapa.map", S.mapa.aMap()); }

// ======================================================================
// Trabajos
// ======================================================================
const hex = (id) => "#" + (COLOR_TRABAJO[id] ?? COLOR_TRABAJO.archivo).toString(16).padStart(6, "0");
function abrirTrabajo(t) {
  hoja({
    titulo: t.nombre, meta: t.estado === "hecho" ? "Hecho" : "",
    contenido(c, h) {
      c.innerHTML = `
        <div class="celdas" style="margin:0">
          <div class="celda"><span>Herramienta</span><b>${esc(t.herramienta)}</b></div>
          <div class="celda"><span>Tiempo</span><b>${formatoTiempo(t.prev.tiempo)}</b></div>
        </div>
        <div class="filas">
          <div class="fila"><span></span><span class="fila__nom">Líneas</span><span class="fila__val">${t.lineas.length}</span><span></span></div>
          <div class="fila"><span></span><span class="fila__nom">Profundidad máxima</span><span class="fila__val">${mm(t.prev.caja.min.z, 2)} mm</span><span></span></div>
        </div>
        <label class="campo" style="max-width:220px"><span>Prueba en aire: subir mm</span><input type="number" min="1" step="1" value="${S.dzAire}" data-dz></label>
        <div class="hoja__pie">
          <button type="button" class="btn-texto" data-bajar aria-label="Descargar .nc">${ico("bajar")}</button>
          <button type="button" class="btn-pill btn-pill--suave" data-aire>${ico("aire")}Prueba en aire</button>
          <button type="button" class="btn-pill btn-pill--main" data-fresar style="flex:1" data-foco>${ico("play")}Fresar</button>
        </div>`;
      c.querySelector("[data-dz]").onchange = (e) => { S.dzAire = Math.max(1, +e.target.value || 5); ls.set("dzAire", S.dzAire); };
      c.querySelector("[data-bajar]").onclick = () => descargarTrabajo(t.id);
      c.querySelector("[data-aire]").onclick = () => { h.cerrar(); correrTrabajo(t, { aire: true }); };
      c.querySelector("[data-fresar]").onclick = () => { h.cerrar(); correrTrabajo(t, { aire: false }); };
      const listo = grbl.listo && !S.corriendo && grbl.est.estado !== "Alarm";
      c.querySelector("[data-aire]").disabled = c.querySelector("[data-fresar]").disabled = !listo;
    },
  });
}

async function correrTrabajo(t, { aire }) {
  if (S.corriendo) return;       // un trabajo a la vez
  if (!S.xyListo || !S.zListo) {
    if (await confirmar({ titulo: `Falta ${!S.xyListo ? "X0 Y0" : "Z0"}`, html: "<p>Se fija en Origen.</p>", si: "Ir a Origen", no: "Cerrar" })) irA("origen");
    return;
  }
  if (!aire && S.herramientaZ && t.herramienta !== S.herramientaZ && t.origen === "cam") {
    if (!(await confirmar({ titulo: `Cambiar a ${t.herramienta}`, html: `<p>Z se calibró con ${esc(S.herramientaZ)}. La fresa sube para el cambio.</p>`, si: "Subir la fresa" }))) return;
    await grbl.enviarVarias(["M5", "G53 G0 Z-1"]);
    S.zListo = false;
    if (!(await asistenteZ(t, { cambio: true }))) return;
  }
  const c = t.prev.caja;
  const html = aire
    ? `<p>El trabajo completo con la fresa ${S.dzAire} mm más arriba.</p>`
    : `<div class="pila-s">${[`Puesta: ${esc(t.herramienta)}`, "Placa pegada, MDF debajo", "Caimán quitado", "Gafas y tapa"].map((x, i) => `<label class="check"><input type="checkbox" data-chk ${i ? "" : "data-foco"}> ${x}</label>`).join("")}</div>
       <p class="mono muted">${formatoTiempo(t.prev.tiempo)} · Z mín. ${mm(c.min.z, 2)} mm</p>
       ${holgura()?.cabe === false ? `<div class="aviso">${ico("alerta")}<span>El corte se sale del material. Revísalo en Placa → Material.</span></div>` : ""}`;
  if (!(await confirmar({ titulo: aire ? `Prueba en aire · ${t.nombre}` : `Fresar ${t.nombre}`, html, si: aire ? "Probar" : "Fresar" }))) return;
  const lineas = transformar(t.lineas, { alinear: S.alinear, alturas: S.usarMapa && S.mapa?.completo ? S.mapa : null, dz: aire ? S.dzAire : 0 });
  visor.herramienta(diamDe(t.herramienta) || 0.3);
  S.corriendo = t.id; S.prog = { id: t.id, h: 0, n: lineas.length, t0: performance.now(), aire, acum: tiempoAcumulado(lineas) };
  visor.progreso(t.id, -1);
  irA("inicio");
  const r = await grbl.correr(lineas, {
    alProgreso: (h, n) => { if (!S.prog) return; S.prog.h = h; S.prog.n = n; visor.progreso(t.id, Math.floor((h / n) * t.lineas.length)); nav.vivo?.(); },
  });
  S.corriendo = null; S.prog = null;
  if (r.ok) { log(`${aire ? "Prueba en aire" : t.nombre}: terminado.`, "sys"); if (!aire) t.estado = "hecho"; anunciar(`${t.nombre} terminado`); }
  else log(`${t.nombre}: detenido (${r.error}${r.linea ? ` en «${r.linea}»` : ""}).`, "sys err");
  if (aire) visor.progreso(t.id, -1);
  refrescar();
}

// Botón principal del widget Ahora cuando toca un trabajo
async function siguientePaso(t) {
  const otraFresa = S.herramientaZ && t.herramienta !== S.herramientaZ && t.origen === "cam";
  if (!S.zListo) return asistenteZ(t);
  if (otraFresa) { await grbl.enviarVarias(["M5", "G53 G0 Z-1"]); S.zListo = false; return asistenteZ(t, { cambio: true }); }
  return correrTrabajo(t, { aire: false });
}

// ======================================================================
// Acciones rápidas («+»): rejilla de 2, solo ícono y nombre
// ======================================================================
function accionesRapidas() {
  const listo = grbl.listo && !S.corriendo;
  const sig = siguienteTrabajo();
  const A = [
    { ico: "abrir", t: "Abrir archivos", ok: true, fn: elegirArchivos },
    { ico: "casa", t: "Homing", ok: listo, fn: homing },
    { ico: "candado", t: "Desbloquear", ok: grbl.listo && grbl.est.estado === "Alarm", fn: desbloquear },
    { ico: "mira", t: "Ir a X0 Y0", ok: listo && S.xyListo, fn: irACero },
    { ico: "subir", t: "Subir Z", ok: listo, fn: subirZ },
    { ico: "ruta", t: "Recorrer el área", ok: listo && !!cajaTrabajos(), fn: recorrerArea },
    { ico: "aire", t: "Prueba en aire", ok: listo && !!sig, fn: () => correrTrabajo(sig, { aire: true }) },
    { ico: "capas", t: "Mapa de alturas", ok: true, fn: () => irA("alturas") },
  ];
  hoja({
    titulo: "Acciones rápidas",
    contenido(c, h) {
      c.innerHTML = `<div class="acciones">${A.map((a, i) => `<button type="button" class="accion" data-i="${i}" ${a.ok ? "" : "disabled"}><span class="accion__ico">${ico(a.ico)}</span>${a.t}</button>`).join("")}</div>`;
      c.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { h.cerrar(); A[+b.dataset.i].fn(); }));
    },
  });
}

// ======================================================================
// Teclado: Esc = PARO si algo se mueve; si no, sale del tutorial o cierra la ventana o la hoja.
// Flechas = jog.
// ======================================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const mueve = S.corriendo || ["Run", "Jog", "Home", "Hold"].includes(grbl.est.estado);
    if (mueve && grbl.listo) { e.preventDefault(); paro(); return; }
    if (recorrido.esc()) { e.preventDefault(); return; }
    if (dialogoAbierto()) { e.preventDefault(); cerrarDialogoSuperior(); return; }
    if (hojaAbierta()) { e.preventDefault(); cerrarHojaSuperior(); }
    return;
  }
  if (e.target.closest("input, textarea, select") || hojaAbierta() || dialogoAbierto()) return;
  const m = { ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0], ArrowUp: [0, 1, 0], ArrowDown: [0, -1, 0], PageUp: [0, 0, 1], PageDown: [0, 0, -1] }[e.key];
  if (m && grbl.listo) { e.preventDefault(); jog(...m); }
});
$("#btn-paro").onclick = paro;
$("#btn-tutorial").onclick = () => abrirTutorial(app);
// En teléfono el 3D va arriba a media altura; este botón lo agranda o lo regresa
function ponerVisorGrande(on) {
  $(".app").classList.toggle("visor-grande", on);
  const b = $("#btn-visor");
  b.setAttribute("aria-pressed", on);
  b.setAttribute("aria-label", on ? "Achicar vista 3D" : "Agrandar vista 3D");
  b.querySelector("use").setAttribute("href", on ? "#i-achicar" : "#i-agrandar");
  ls.set("visorGrande", on);
}
ponerVisorGrande(ls.get("visorGrande", false));
$("#btn-visor").onclick = () => ponerVisorGrande(!$(".app").classList.contains("visor-grande"));
$$("#vistas button").forEach((b) => (b.onclick = () => { visor.vista(b.dataset.vista); $$("#vistas button").forEach((x) => x.setAttribute("aria-checked", x === b)); }));

// ======================================================================
// Contexto para las vistas
// ======================================================================
const app = {
  S, grbl, visor, MASC, consola, hist, hex,
  irA, regresar, refrescar, log, anunciar,
  get pasoJog() { return pasoJog; },
  get vistaActual() { return nav.actual; },
  acc: {
    conectar, cambiarModo, homing, desbloquear, paro, ponerEstilo,
    jog, ponerPasoJog, fijarXY, irACero, subirZ, recorrerArea,
    elegirArchivos, quitarArchivo, cargarEjemplo, generar, ponerParam, paramsPorDefecto, descargarTrabajo, nuevaPlaca,
    ponerMaterial, centrarDiseno, girarMaterial, materialNuevo, holgura, tamDiseno, disenoBloqueado, asistenteBorde,
    asistenteZ, asistenteZManual, asistenteAlinear, quitarAlineacion: () => { S.alinear = null; previsualizar(); refrescar(); },
    medirAlturas, exportarMapa, ponerUsarMapa: (v) => { S.usarMapa = v; },
    abrirTrabajo, correrTrabajo, siguientePaso, siguienteTrabajo,
    pausar: () => grbl.pausar(), reanudar: () => grbl.reanudar(),
    enviarComando, limpiarConsola: () => (consola.innerHTML = ""),
    velocidadSim: (v) => { if (grbl.sim) grbl.sim.velocidad = v; },
    cajaTrabajos,
  },
};

aplicarMaterial();
irA("inicio");
actualizar();
log("Elige Simulación para practicar sin la máquina, o conecta la Cubiko por USB.", "sys");
window.__cnc = { S, grbl, visor, irA, app, recorrido, ahora: () => ahora(app) };
