// main.js - la app del láser: estado, máquina, navegación del panel y acciones.
//
// Misma arquitectura que la CNC (docs/laboratorio-ui.md):
//   nivel 0  Inicio · Mover · Consola (barra inferior) + «+» acciones rápidas
//   nivel 2  el detalle de cada widget (Máquina, Pasos, Diseño, Material)
//   hojas    lo corto sube desde abajo: confirmaciones, el trabajo
// Los 6 pasos: Máquina → Archivo → Material → Posición → Encuadre → Cortar.
// Las vistas viven en vistas.js; aquí está todo lo que hace algo. Depuración: window.__laser

import "../../shared/js/iconos.js";
import * as THREE from "three";
import { crearNavegacion } from "../../shared/js/navegacion.js";
import { $, $$, esc, ico, mm, crearLs, descargar, confirmar, hoja, hojaAbierta, cerrarHojaSuperior, anunciar } from "../../shared/js/ui.js";
import { leer, formatoTiempo, tiempoAcumulado } from "../../shared/js/gcode.js";
import { S1 } from "./s1.js";
import { PERFIL } from "./perfil-s1.js";
import { revisar } from "./bloqueo.js";
import { Visor, COLOR_OP, AREA } from "./visor.js";
import { leerSVG } from "./svg.js";
import { aGris, tramar, aLienzo } from "./grabado.js";
import { MATERIALES, porId, ajustes } from "./materiales.js";
import { armar, encuadre } from "./trabajo.js";
import { VISTAS, ahora } from "./vistas.js";

const ls = crearLs("fablab.laser.");
const s1 = new S1(PERFIL);
const visor = new Visor($("#visor"));

const S = {
  modo: ls.get("modo", "real"),
  estilo: document.documentElement.dataset.estilo || "lab",
  homed: false,
  diseno: null,          // { nombre, tipo: svg|imagen|gcode, ancho, alto, capas, imagen, miniatura, avisos, lineas }
  lugar: { x: 10, y: 10, escala: 1 },
  materialId: ls.get("material", null),
  materialOk: false,     // la persona eligió el material de este trabajo
  propios: ls.get("propios", {}),    // ajustes cambiados por material y operación
  pieza: { x: 0, y: 0, ancho: 300, alto: 200, ...(ls.get("pieza", null) || {}) },   // la hoja de material en la cama
  trabajo: null,         // { lineas, prev, acum, caja, avisos, pasos, fuera }
  encuadrado: false,
  hecho: false,
  corriendo: false,
  prog: null,            // { h, n, t0, acum }
  alarma: null,          // {codigo, t, pasos}
};
const material = () => porId(S.materialId || MATERIALES[0].id);

const K = "../img/kiwi/";
const MASC = Object.fromEntries(["hola", "senala", "explica", "piensa", "celebra", "lupa", "alerta", "archivos", "cortando", "encuadrando", "extintor", "pieza"].map((k) => [k, `${K}${k}.webp`]));

// ======================================================================
// Navegación
// ======================================================================
const { nav, irA, regresar, refrescar } = crearNavegacion({ vistas: VISTAS, tabs: ["inicio", "mover", "consola"], app: () => app });
$("#btn-mas").onclick = () => accionesRapidas();

// ======================================================================
// Máquina
// ======================================================================
async function conectar(modo = S.modo) {
  if (s1.conectado) { await s1.desconectar(); refrescar(); return; }
  if (modo !== S.modo) ponerModo(modo);
  S.homed = false; S.alarma = null;
  if (modo === "sim") s1.conectarSim(); else await s1.conectar();
  refrescar();
}
function ponerModo(m) { S.modo = m; ls.set("modo", m); }
async function cambiarModo(m) {
  if (m === S.modo) return;
  if (s1.conectado) await s1.desconectar();
  ponerModo(m); refrescar();
}
async function casa() {
  S.alarma = null; refrescar();
  const ok = await s1.casa("xy");
  if (ok) { S.homed = true; visor.saltar(); anunciar("El cabezal está en casa"); }
  refrescar();
}
function yaEnCasa() { S.homed = true; refrescar(); }
async function paro() {
  if (!s1.conectado) return;
  await s1.parar();
  visor.laser(false);
  log("PARO: trabajo cancelado y láser apagado.", "sys err");
  anunciar("Paro");
  refrescar();
}
function entendido() { S.alarma = null; s1.enviar(PERFIL.consultas.estado, { callado: true, origen: "auto" }); refrescar(); }
function ponerEstilo(e) { S.estilo = e; document.documentElement.dataset.estilo = e; ls.set("estilo", e); refrescar(); }

let pendiente = false;
s1.addEventListener("cambio", () => { if (!pendiente) { pendiente = true; requestAnimationFrame(() => { pendiente = false; actualizar(); }); } });
s1.addEventListener("alarma", (e) => {
  S.alarma = e.detail;
  visor.laser(false);
  anunciar(`Alarma: ${e.detail.t}`);
  if (!hojaAbierta() && nav.actual !== "inicio") irA("inicio"); else refrescar();
});
s1.addEventListener("lista", () => refrescar());
s1.addEventListener("log", (e) => log(e.detail.texto, e.detail.clase));

// Dónde está el cabezal: en simulación se lee del simulador (sin esperar consultas); con la máquina
// real, de M303 o, durante un trabajo, de la última línea confirmada.
let ultN = -1;
function actualizar() {
  const e = s1.est, ok = s1.listo;
  if (S.alarma && e.tipo !== "alarma" && e.codigo != null) S.alarma = null;
  const sim = s1.sim;
  const p = sim ? sim.pos : e.pos;
  $("#wx").textContent = ok ? mm(p.x, 1) : "—"; $("#wy").textContent = ok ? mm(p.y, 1) : "—";
  $("#btn-paro").disabled = !s1.conectado;
  if (ok) visor.ponerPosicion(p);
  // Quemado y rayo
  let on = false, f = 0;
  if (sim) {
    const r = sim.tomarRastro();
    visor.quemar(r, PERFIL.sMax);
    const m = sim.plan[0];
    on = !sim.pausa && !!m?.on; f = on ? m.s / PERFIL.sMax : 0;
  } else if (S.corriendo && S.trabajo?.prev) {
    // Estimado: lo confirmado hasta ahora ya pasó por la máquina
    const segs = S.trabajo.prev.segs, n = S.prog?.h ?? 0;
    const nuevos = segs.filter((s) => s.n > ultN && s.n <= n);
    if (nuevos.length) {
      visor.quemar(nuevos.flatMap((s) => [{ ...s.a, s: s.s, on: false }, { ...s.b, s: s.s, on: s.on }]), PERFIL.sMax);
      const u = nuevos[nuevos.length - 1]; visor.ponerPosicion(u.b); on = u.on; f = (u.s || 0) / PERFIL.sMax;
    }
    ultN = Math.max(ultN, n);
  }
  visor.laser(on && ok, f);
  $("#laser-visor").hidden = !(on && ok);
  visor.luz(!s1.conectado ? "off" : e.tipo === "alarma" ? "alarma" : e.tipo === "pausa" ? "pausa" : e.tipo === "fin" ? "fin" : s1.trabajando ? "run" : "on");
  visor.tapa(sim?.tapa ? 1 : 0);
  // Alarma visible desde cualquier pestaña: punto en «Inicio»
  const bi = $('.navinf__pildora [data-tab="inicio"]');
  const alarma = ok && e.tipo === "alarma";
  if (bi.classList.contains("con-alerta") !== alarma) {
    bi.classList.toggle("con-alerta", alarma);
    bi.setAttribute("aria-label", alarma ? "Inicio, hay una alarma" : "Inicio");
  }
  nav.vivo?.();
}
// En simulación el cabezal se mueve sin que nadie pregunte: se lee en cada cuadro
(function bucle() { if (s1.sim) actualizar(); requestAnimationFrame(bucle); })();

// ======================================================================
// Consola
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
  s1.enviar(v);
  if (hist[hist.length - 1] !== v) { hist.push(v); if (hist.length > 50) hist.shift(); ls.set("hist", hist); }
}

// ======================================================================
// Movimiento
// ======================================================================
let pasoJog = ls.get("pasoJog", 10);
function jog(x, y) {
  if (!s1.listo || s1.trabajando) return;
  const p = s1.sim ? s1.sim.pos : s1.est.pos;
  s1.est.pos = { ...p };
  s1.jog(x * pasoJog, y * pasoJog, 0, Math.min(6000, Math.max(600, pasoJog * 300)));
}
function ponerPasoJog(p) { pasoJog = p; ls.set("pasoJog", p); }
const irA_ = (x, y) => s1.mover(x, y);
async function irAlDiseno() { const c = S.trabajo?.caja; if (c) await s1.mover(c.x, c.y); }

// ======================================================================
// Archivos
// ======================================================================
$("#archivos").onchange = (e) => { if (e.target.files[0]) abrirArchivo(e.target.files[0]); e.target.value = ""; };
const elegirArchivo = () => $("#archivos").click();

async function abrirArchivo(f) {
  const nombre = f.name.replace(/\.[^.]+$/, "");
  try {
    if (/\.svg$/i.test(f.name)) ponerDiseno(disenoSVG(await f.text(), nombre));
    else if (/\.(png|jpe?g|webp|bmp)$/i.test(f.name)) ponerDiseno(await disenoImagen(f, nombre));
    else ponerDiseno(disenoGcode(await f.text(), nombre));
  } catch (err) {
    confirmar({ titulo: "No se pudo abrir", html: `<p>${esc(f.name)}: ${esc(err.message)}</p>`, si: "Entendido", no: "Cerrar" });
  }
}

// Operación por defecto de cada capa: lo rojo corta, lo azul marca, los rellenos se graban
function opDe(color, relleno) {
  if (relleno) return "grabado";
  const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
  if (r > 180 && g < 90 && b < 90) return "corte";
  return "marcado";
}
function disenoSVG(texto, nombre) {
  const d = leerSVG(texto);
  return {
    nombre, tipo: "svg", ancho: d.ancho, alto: d.alto, avisos: d.avisos,
    capas: d.capas.map((c, i) => ({ ...c, id: `c${i}`, op: opDe(c.color, c.relleno) })),
    miniatura: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(texto),
  };
}
async function disenoImagen(f, nombre) {
  const fuente = await createImageBitmap(f);
  // 10 px por mm hasta 100 mm de ancho; el tamaño se ajusta en Diseño
  const ancho = Math.min(100, fuente.width / 10), alto = (ancho * fuente.height) / fuente.width;
  return { nombre, tipo: "imagen", ancho, alto, avisos: [], capas: [], imagen: { fuente, op: "grabado", modo: "jarvis", umbral: 128, invertir: false, brillo: 0, contraste: 0 } };
}
function disenoGcode(texto, nombre) {
  const lineas = texto.split(/\r?\n/);
  const malas = revisar(lineas);
  const prev = leer(texto, { rapido: PERFIL.rapido });
  const c = prev.corteCaja;
  return {
    nombre, tipo: "gcode", lineas, malas, avisos: malas.length ? [`${malas.length} línea${malas.length > 1 ? "s" : ""} con órdenes que la app no manda (línea ${malas[0].n}: ${malas[0].motivo}). Este archivo no se puede cortar.`] : [],
    ancho: isFinite(c.min.x) ? c.max.x - c.min.x : 0, alto: isFinite(c.min.x) ? c.max.y - c.min.y : 0, capas: [], prev, origen: isFinite(c.min.x) ? { x: c.min.x, y: c.min.y } : { x: 0, y: 0 },
  };
}
async function cargarEjemplo() {
  try { const r = await fetch("ejemplos/llavero.svg"); if (r.ok) ponerDiseno(disenoSVG(await r.text(), "Llavero kiwi")); } catch (_) {}
}

function ponerDiseno(d) {
  S.diseno = d; S.hecho = false; S.encuadrado = false;
  if (d.tipo === "gcode") S.lugar = { x: d.origen.x, y: d.origen.y, escala: 1 };
  else S.lugar = { x: S.pieza.x + 10, y: S.pieza.y + 10, escala: 1 };
  if (d.tipo === "imagen") previaImagen();
  rearmar();
  irA("inicio");
}
function quitarDiseno() { S.diseno = null; S.trabajo = null; S.encuadrado = false; S.hecho = false; rearmar(); refrescar(); }

// La imagen tramada como la verá la máquina (para la vista previa de Diseño)
function previaImagen() {
  const d = S.diseno; if (d?.tipo !== "imagen") return;
  const aj = ajustes(material(), "grabado", S.propios) || { densidad: 10 };
  const k = Math.min(aj.densidad, 600 / Math.max(d.ancho, d.alto) / S.lugar.escala);
  const w = Math.max(1, Math.round(d.ancho * S.lugar.escala * k)), h = Math.max(1, Math.round(d.alto * S.lugar.escala * k));
  d.previa = aLienzo(tramar(aGris(d.imagen.fuente, w, h, d.imagen), w, h, d.imagen.modo, d.imagen.umbral), w, h).toDataURL();
}

// Vuelve a armar el trabajo con el diseño, el lugar y el material actuales
let tRearmar = null;
function rearmar({ pronto = false } = {}) {
  clearTimeout(tRearmar);
  const f = () => {
    const d = S.diseno;
    if (!d) { S.trabajo = null; visor.ponerTrayectos([]); visor.ponerDiseno(null); return; }
    if (d.tipo === "gcode") {
      const fuera = d.prev.corteCaja.min.x < -0.01 || d.prev.corteCaja.min.y < -0.01 || d.prev.corteCaja.max.x > PERFIL.area.x + 0.01 || d.prev.corteCaja.max.y > PERFIL.area.y + 0.01;
      S.trabajo = { lineas: d.lineas, prev: d.prev, acum: tiempoAcumulado(d.lineas, { rapido: PERFIL.rapido }), tiempo: d.prev.tiempo, caja: { x: d.origen.x, y: d.origen.y, ancho: d.ancho, alto: d.alto }, avisos: [...d.avisos, ...(fuera ? ["El archivo se sale del área de corte."] : [])], pasos: [{ op: "archivo", t: "Archivo" }], fuera, bloqueado: d.malas.length > 0 };
    } else {
      S.trabajo = armar({ diseno: d, lugar: S.lugar, material: material(), propios: S.propios, perfil: PERFIL });
    }
    const t = S.trabajo;
    visor.ponerTrayectos(t.prev ? [{ id: "trabajo", segs: t.prev.segs, color: COLOR_OP.archivo, colorSeg: colorSeg }] : []);
    visor.ponerDiseno(t.caja, !t.fuera);
    nav.vivo?.();
  };
  if (pronto) f(); else tRearmar = setTimeout(f, 120);
}
// Cada tramo del color de su operación (por potencia: corte fuerte → violeta; marcado → azul; grabado → verde azulado)
const C_OP = { corte: new THREE.Color(COLOR_OP.corte), marcado: new THREE.Color(COLOR_OP.marcado), grabado: new THREE.Color(COLOR_OP.grabado) };
function colorSeg(s) {
  const t = S.trabajo; if (!t) return null;
  const aj = (op) => ajustes(material(), op, S.propios);
  const sCorte = aj("corte") ? (aj("corte").potencia / 100) * PERFIL.sMax : Infinity;
  if (s.s >= sCorte - 0.5) return C_OP.corte;
  const sMarca = aj("marcado") ? (aj("marcado").potencia / 100) * PERFIL.sMax : -1;
  return Math.abs(s.s - sMarca) < 0.5 ? C_OP.marcado : C_OP.grabado;
}

function ponerLugar(k, v) {
  if (!isFinite(v)) { refrescar(); return; }
  if (k === "escala") v = Math.max(0.01, v);
  S.lugar[k] = v; S.encuadrado = false; S.hecho = false;
  if (S.diseno?.tipo === "imagen") previaImagen();
  rearmar(); refrescar();
}
function ponerTamano(ancho) {
  const d = S.diseno; if (!d || !(ancho > 0)) { refrescar(); return; }
  ponerLugar("escala", ancho / d.ancho);
}
function centrarEnPieza() {
  const d = S.diseno, P = S.pieza; if (!d) return;
  S.lugar.x = Math.round((P.x + (P.ancho - d.ancho * S.lugar.escala) / 2) * 10) / 10;
  S.lugar.y = Math.round((P.y + (P.alto - d.alto * S.lugar.escala) / 2) * 10) / 10;
  S.encuadrado = false; rearmar(); refrescar();
}
function ponerOp(capaId, op) {
  const c = S.diseno?.capas.find((x) => x.id === capaId); if (!c) return;
  c.op = op; S.encuadrado = false; rearmar(); refrescar();
}
function ponerImagen(k, v) {
  const im = S.diseno?.imagen; if (!im) return;
  im[k] = v; previaImagen(); rearmar(); refrescar();
}

// ======================================================================
// Material
// ======================================================================
function elegirMaterial(id) {
  S.materialId = id; S.materialOk = true; ls.set("material", id);
  const M = material();
  aplicarPieza(); S.encuadrado = false;
  if (S.diseno?.tipo === "imagen") previaImagen();
  rearmar(); anunciar(`Material: ${M.t}`); refrescar();
}
function ponerAjuste(op, k, v) {
  if (!isFinite(v)) return;
  const id = material().id;
  S.propios[id] = S.propios[id] || {};
  S.propios[id][op] = { ...(S.propios[id][op] || {}), [k]: v };
  ls.set("propios", S.propios);
  if (S.diseno?.tipo === "imagen") previaImagen();
  rearmar();
}
function ajustesPorDefecto() { delete S.propios[material().id]; ls.set("propios", S.propios); rearmar(); refrescar(); }
function ponerPieza(k, v) {
  if (!isFinite(v) || (["ancho", "alto"].includes(k) && v <= 0)) { refrescar(); return; }
  S.pieza[k] = v; ls.set("pieza", S.pieza); aplicarPieza(); refrescar();
}
function aplicarPieza() {
  const M = material(), P = S.pieza;
  visor.ponerMaterial({ ...P, grosor: M.grosor, tono: M.tono });
}
function materialNuevo() { visor.limpiarQuemado(); S.hecho = false; anunciar("Material nuevo"); refrescar(); }

// ======================================================================
// Encuadre y trabajo
// ======================================================================
async function encuadrar() {
  const t = S.trabajo; if (!t || !s1.listo || s1.trabajando) return;
  if (t.fuera) { irA("diseno"); return; }
  visor.cruz(true);
  const r = await s1.correr(encuadre(t.caja, PERFIL));
  visor.cruz(false);
  if (r.ok) { S.encuadrado = true; anunciar("Encuadre hecho"); }
  refrescar();
}

function abrirTrabajo() {
  const t = S.trabajo; if (!t) return;
  hoja({
    titulo: S.diseno.nombre, meta: material().t,
    contenido(c, h) {
      c.innerHTML = `
        <div class="celdas" style="margin:0">
          <div class="celda"><span>Tiempo</span><b>${formatoTiempo(t.tiempo)}</b></div>
          <div class="celda"><span>Tamaño</span><b>${mm(t.caja.ancho, 1)} × ${mm(t.caja.alto, 1)} mm</b></div>
        </div>
        <div class="filas">${t.pasos.map((p) => `<div class="fila"><span class="cuad" style="background:var(--d-${p.op === "archivo" ? "marcado" : p.op})"></span><span class="fila__nom">${esc(p.t)}</span><span class="fila__val"></span><span></span></div>`).join("")}
          <div class="fila"><span></span><span class="fila__nom">Líneas</span><span class="fila__val">${t.lineas.length}</span><span></span></div></div>
        ${t.avisos.map((a) => `<div class="aviso">${ico("alerta")}<span>${esc(a)}</span></div>`).join("")}
        <div class="hoja__pie">
          <button type="button" class="btn-texto" data-bajar aria-label="Descargar .gcode">${ico("bajar")}</button>
          <button type="button" class="btn-pill btn-pill--suave" data-encuadrar>${ico("ruta")}Encuadrar</button>
          <button type="button" class="btn-pill btn-pill--main" data-cortar style="flex:1" data-foco>${ico("play")}Cortar</button>
        </div>`;
      c.querySelector("[data-bajar]").onclick = () => descargar(`${S.diseno.nombre}.gcode`, t.lineas.join("\n") + "\n");
      c.querySelector("[data-encuadrar]").onclick = () => { h.cerrar(); encuadrar(); };
      c.querySelector("[data-cortar]").onclick = () => { h.cerrar(); cortar(); };
      const listo = s1.listo && !s1.trabajando && !S.alarma && !t.fuera && !t.bloqueado;
      c.querySelector("[data-encuadrar]").disabled = !s1.listo || s1.trabajando || t.fuera;
      c.querySelector("[data-cortar]").disabled = !listo;
    },
  });
}

async function cortar() {
  const t = S.trabajo; if (!t || S.corriendo) return;
  if (t.bloqueado) return;
  if (!S.encuadrado) {
    if (!(await confirmar({ titulo: "Sin encuadrar", html: "<p>El encuadre recorre el contorno del diseño para ver que cae sobre el material.</p>", si: "Cortar sin encuadrar", no: "Cancelar" }))) return;
  }
  const M = material();
  const html = `<div class="pila-s">${[`Material: ${esc(M.t)}`, "Material plano, sobre el panal", "Extractor encendido y ducto conectado", "Tapa cerrada", "Alguien se queda junto a la máquina todo el tiempo"].map((x, i) => `<label class="check"><input type="checkbox" data-chk ${i ? "" : "data-foco"}> ${x}</label>`).join("")}</div>
    <p class="mono muted">${formatoTiempo(t.tiempo)} · ${t.pasos.map((p) => p.t).join(" → ")}</p>`;
  if (!(await confirmar({ titulo: `Cortar ${S.diseno.nombre}`, html, si: "Cortar" }))) return;
  S.corriendo = true; S.hecho = false; ultN = -1;
  S.prog = { h: 0, n: t.lineas.length, t0: performance.now(), acum: t.acum };
  visor.progreso("trabajo", -1);
  irA("inicio");
  const r = await s1.correr(t.lineas, {
    alProgreso: (h, n) => { if (!S.prog) return; S.prog.h = h; S.prog.n = n; visor.progreso("trabajo", h); nav.vivo?.(); },
  });
  S.corriendo = false; S.prog = null;
  visor.laser(false);
  if (r.ok) { S.hecho = true; log(`${S.diseno.nombre}: terminado.`, "sys"); anunciar(`${S.diseno.nombre} terminado`); }
  else log(`${S.diseno.nombre}: detenido (${r.error}${r.linea ? ` en «${r.linea}»` : ""}).`, "sys err");
  refrescar();
}

// ======================================================================
// Arrastrar y soltar en el visor
// ======================================================================
const vis = $("#visor");
vis.addEventListener("dragover", (e) => { e.preventDefault(); $("#soltar").hidden = false; });
vis.addEventListener("dragleave", (e) => { if (!vis.contains(e.relatedTarget)) $("#soltar").hidden = true; });
vis.addEventListener("drop", (e) => { e.preventDefault(); $("#soltar").hidden = true; if (e.dataTransfer.files[0]) abrirArchivo(e.dataTransfer.files[0]); });

// ======================================================================
// Acciones rápidas («+»)
// ======================================================================
function accionesRapidas() {
  const listo = s1.listo && !s1.trabajando;
  const A = [
    { ico: "abrir", t: "Abrir archivo", ok: true, fn: elegirArchivo },
    { ico: "casa", t: "Mandar a casa", ok: listo, fn: casa },
    { ico: "ruta", t: "Encuadrar", ok: listo && !!S.trabajo && !S.trabajo.fuera, fn: encuadrar },
    { ico: "mira", t: "Ir al diseño", ok: listo && !!S.trabajo, fn: irAlDiseno },
    { ico: "material", t: "Material nuevo", ok: true, fn: materialNuevo },
    { ico: "aire", t: s1.est.aire ? "Apagar el aire" : "Probar el aire", ok: listo, fn: () => s1.aire(s1.est.aire ? 0 : 2).then(() => s1.enviar("M15", { callado: true, origen: "auto" })) },
    ...(s1.sim ? [
      { ico: "tapa", t: s1.sim.tapa ? "Cerrar la tapa" : "Abrir la tapa", ok: true, fn: () => { s1.sim.abrirTapa(!s1.sim.tapa); setTimeout(refrescar, 50); } },
      { ico: "llama", t: "Simular flama", ok: s1.trabajando, fn: () => s1.sim.flama() },
    ] : []),
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
// Teclado: Esc = PARO si algo se mueve; si no, cierra la hoja. Flechas = mover.
// ======================================================================
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (s1.conectado && (S.corriendo || s1.trabajando)) { e.preventDefault(); paro(); return; }
    if (hojaAbierta()) { e.preventDefault(); cerrarHojaSuperior(); }
    return;
  }
  if (e.target.closest("input, textarea, select") || hojaAbierta()) return;
  const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (m && s1.listo) { e.preventDefault(); jog(...m); }
});
$("#btn-paro").onclick = paro;
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
  S, s1, visor, MASC, consola, hist, ls, PERFIL, material,
  irA, regresar, refrescar, log, anunciar,
  get pasoJog() { return pasoJog; },
  acc: {
    conectar, cambiarModo, casa, yaEnCasa, paro, entendido, ponerEstilo,
    jog, ponerPasoJog, irA: irA_, irAlDiseno,
    elegirArchivo, cargarEjemplo, quitarDiseno, ponerLugar, ponerTamano, centrarEnPieza, ponerOp, ponerImagen,
    elegirMaterial, ponerAjuste, ajustesPorDefecto, ponerPieza, materialNuevo,
    encuadrar, abrirTrabajo, cortar,
    pausar: () => s1.pausar(), reanudar: () => s1.reanudar(),
    enviarComando, limpiarConsola: () => (consola.innerHTML = ""),
    velocidadSim: (v) => { if (s1.sim) s1.sim.velocidad = v; },
    tapaSim: () => { s1.sim?.abrirTapa(!s1.sim.tapa); setTimeout(refrescar, 50); },
  },
};

aplicarPieza();
irA("inicio");
actualizar();
log("Elige Simulación para practicar sin la máquina, o conecta la S1 por USB.", "sys");
window.__laser = { S, s1, visor, irA, app, ahora: () => ahora(app) };
