// main.js - el Visor 3D: estado, worker, archivos, navegación del panel y acciones.
//
// Misma arquitectura que la CNC y el láser (docs/laboratorio-ui.md):
//   nivel 0  Modelo · Editar · Exportar (barra inferior) + «+» acciones rápidas
//   nivel 2  Revisión, Formatos de Creality Scan, Cortes
//   hojas    cada herramienta de edición, con vista previa en el 3D
// Lo pesado vive en el worker (trabajador.js); aquí solo se dibuja y se decide.
// Depuración: window.__visor3d

import "../../shared/js/iconos.js";
import { crearNavegacion } from "../../shared/js/navegacion.js";
import { $, $$, esc, crearLs, descargar, confirmar, hoja, hojaAbierta, cerrarHojaSuperior, anunciar } from "../../shared/js/ui.js";
import { Visor3D } from "./visor.js";
import { VISTAS } from "./vistas.js";
import { HERRAMIENTAS } from "./herramientas.js";
import { leerGLTF, escribirGLB, escribirFBX } from "./formatos/web.js";
import { caja, transferibles } from "./nucleo/malla.js";
import { enviar } from "../../shared/js/envios.js";

const ls = crearLs("fablab.visor3d.");
const visor = new Visor3D($("#visor"));

const S = {
  m: null,                 // la malla que se ve (copia de la del worker)
  diag: null,              // diagnóstico del worker
  caja: null,
  puedeDeshacer: false, puedeRehacer: false,
  ultimo: null,            // el modelo guardado de la sesión anterior
  ocupado: false,
  modo: "color",
  aviso: null,             // { t, tipo } texto sobre el 3D
  uso: ls.get("uso", "imprimir"),
  cortes: ls.get("cortes", { eje: 2, paso: 3, ancho: 300, alto: 200 }),
};

// ======================================================================
// Worker
// ======================================================================
const trabajador = new Worker(new URL("./trabajador.js", import.meta.url), { type: "module" });
const pendientes = new Map();
let nId = 0;
trabajador.onmessage = (e) => {
  const r = e.data, p = pendientes.get(r.id); if (!p) return;
  if (r.avance != null) { progreso(r.avance, r.texto); return; }
  pendientes.delete(r.id);
  if (r.ok) p.ok(r); else p.mal(new Error(r.error));
};
trabajador.onerror = (e) => { console.error(e); for (const p of pendientes.values()) p.mal(new Error("El worker falló: " + (e.message || "error"))); pendientes.clear(); };
function w(op, datos = {}, transfer = []) {
  return new Promise((ok, mal) => { const id = ++nId; pendientes.set(id, { ok, mal }); trabajador.postMessage({ id, op, ...datos }, transfer); });
}

// Tarea larga con barra sobre el 3D; los errores se muestran en una hoja
async function tarea(texto, f) {
  if (S.ocupado) return null;
  S.ocupado = true; progreso(0, texto);
  try { return await f(); }
  catch (err) {
    console.error(err);
    confirmar({ titulo: "No se pudo", html: `<p>${esc(err.message)}</p>`, si: "Entendido", no: "Cerrar" });
    return null;
  } finally { S.ocupado = false; progreso(null); }
}
function progreso(f, texto) {
  const el = $("#progreso");
  if (f == null) { el.hidden = true; return; }
  el.hidden = false;
  if (texto) el.querySelector("[data-v=t]").textContent = texto;
  el.querySelector("[data-v=b]").style.width = `${Math.round(f * 100)}%`;
}

// Lo que regresa el worker después de cada cambio
async function recibir(r, { encuadrar = false } = {}) {
  if (!r?.malla) return;
  S.m = r.malla; S.diag = r.diag; S.caja = caja(r.malla);
  S.puedeDeshacer = r.puedeDeshacer; S.puedeRehacer = r.puedeRehacer;
  await visor.ponerMalla(S.m, { encuadrar });
  // Sin color ni textura, el modo «Color» no tiene sentido
  const hayColor = visor.tieneColor();
  $('[data-modo="color"]').hidden = !hayColor;
  if (!hayColor && S.modo === "color") ponerModo("solido");
  else visor.modo(S.modo);
  pintarMedidas();
  $("#btn-deshacer").disabled = !S.puedeDeshacer; $("#btn-rehacer").disabled = !S.puedeRehacer;
  $("#modos").hidden = $("#medidas").hidden = $("#herr-visor").hidden = false;
  refrescar();
}
function pintarMedidas() {
  const t = S.caja?.tam || [0, 0, 0], f = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
  $('#medidas [data-v="x"]').textContent = `${f(t[0])} mm`;
  $('#medidas [data-v="y"]').textContent = `${f(t[1])} mm`;
  $('#medidas [data-v="z"]').textContent = `${f(t[2])} mm`;
}
function ponerModo(m) {
  S.modo = m; visor.modo(m);
  $$("#modos [data-modo]").forEach((b) => b.setAttribute("aria-checked", b.dataset.modo === m));
}
$$("#modos [data-modo]").forEach((b) => (b.onclick = () => ponerModo(b.dataset.modo)));

// ======================================================================
// Archivos
// ======================================================================
const elegirArchivo = () => $("#archivos").click();
$("#btn-abrir").onclick = elegirArchivo;
$("#archivos").onchange = (e) => { if (e.target.files.length) abrirArchivos([...e.target.files]); e.target.value = ""; };

async function abrirArchivos(lista) {
  if (S.ocupado) return;
  visor.medir(false); avisoVisor(null);
  const r = await tarea("Abriendo", async () => {
    const archivos = {};
    for (const f of lista) archivos[f.name] = new Uint8Array(await f.arrayBuffer());
    if (Object.keys(archivos).some((n) => /\.(glb|gltf)$/i.test(n))) {
      progreso(0.3, "Leyendo glTF");
      const m = await leerGLTF(archivos);
      return await w("cargar", { malla: m }, transferibles(m));
    }
    return await w("abrir", { archivos }, Object.values(archivos).map((a) => a.buffer));
  });
  if (!r) return;
  cerrarHojas();
  await recibir(r, { encuadrar: true });
  const notas = [];
  if (r.volteado) notas.push("Las caras venían hacia adentro: ya están hacia afuera.");
  if (S.m.faltaTextura) notas.push(`Falta ${S.m.faltaTextura}: ábrela junto con el modelo para ver el color.`);
  if (notas.length) avisoVisor(notas.join(" "), S.m.faltaTextura ? "atencion" : "info");
  anunciar(`${S.m.nombre} abierto: ${S.diag.triangulos.toLocaleString("es-MX")} triángulos`);
  irA("inicio");
}
async function ejemplo() {
  const r = await fetch("ejemplos/buho.3mf");
  const b = await r.blob();
  abrirArchivos([new File([b], "buho.3mf")]);
}
async function seguir() {
  const r = await tarea("Recuperando", () => w("recuperar"));
  if (r?.hay) { await recibir(r, { encuadrar: true }); irA("inicio"); }
}
async function olvidar() {
  await w("olvidar"); S.ultimo = null; refrescar();
}

// Arrastrar y soltar sobre el 3D (varios archivos a la vez: modelo + textura + MTL)
const vEl = $("#visor");
vEl.addEventListener("dragover", (e) => { e.preventDefault(); $("#soltar").hidden = false; });
vEl.addEventListener("dragleave", (e) => { if (!vEl.contains(e.relatedTarget)) $("#soltar").hidden = true; });
vEl.addEventListener("drop", (e) => { e.preventDefault(); $("#soltar").hidden = true; if (e.dataTransfer.files.length) abrirArchivos([...e.dataTransfer.files]); });
// También se puede soltar sobre el panel
$(".panel").addEventListener("dragover", (e) => e.preventDefault());
$(".panel").addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files.length) abrirArchivos([...e.dataTransfer.files]); });

// ======================================================================
// Edición
// ======================================================================
async function editar(nombre, opciones = {}, { encuadrar = false, texto = "Trabajando" } = {}) {
  const r = await tarea(texto, () => w("editar", { nombre, opciones }, opciones.mascara ? [opciones.mascara.buffer] : []));
  if (!r) return null;
  await recibir(r, { encuadrar });
  return r.info || {};
}
async function deshacer() { if (!S.puedeDeshacer || hojaAbierta()) return; const r = await tarea("Deshaciendo", () => w("deshacer")); if (r) { await recibir(r); anunciar("Deshecho"); } }
async function rehacer() { if (!S.puedeRehacer || hojaAbierta()) return; const r = await tarea("Rehaciendo", () => w("rehacer")); if (r) { await recibir(r); anunciar("Rehecho"); } }
async function volverOriginal() {
  if (!await confirmar({ titulo: "Volver al original", html: "<p>Se quitan todas las ediciones. Puedes deshacerlo.</p>", si: "Volver al original" })) return;
  const r = await tarea("Volviendo al original", () => w("original")); if (r) await recibir(r, { encuadrar: true });
}
$("#btn-deshacer").onclick = deshacer;
$("#btn-rehacer").onclick = rehacer;
const previa = (op, opciones) => w(op, { opciones });

// ======================================================================
// Exportar
// ======================================================================
async function exportar(formato, opciones = {}) {
  const r = await tarea("Exportando", async () => {
    if (formato === "glb" || formato === "fbx") {
      const { malla } = await w("malla", { hornearTextura: opciones.color === "vertice" });
      progreso(0.5, formato === "fbx" ? "Convirtiendo a FBX" : "Armando el GLB");
      if (formato === "glb") return await escribirGLB(malla, opciones);
      const archivos = await escribirFBX(malla, opciones);
      if (archivos.length === 1) return archivos[0];
      const { zipSync } = await import("../../shared/vendor/three/addons/libs/fflate.module.js");
      return { nombre: `${malla.nombre}.zip`, datos: zipSync(Object.fromEntries(archivos.map((a) => [a.nombre, a.datos]))) };
    }
    return await w("exportar", { formato, opciones });
  });
  if (!r) return false;
  descargar(r.nombre, new Blob([r.datos]));
  anunciar(`Descargado ${r.nombre}`);
  return true;
}
async function cortes(opciones) { return await tarea("Rebanando", () => w("cortes", { opciones })); }

// Envía el SVG o DXF a la app del láser o de la CNC
const enviarA = (destino, archivo) => enviar(destino, archivo);

// ======================================================================
// Ayudas del 3D
// ======================================================================
function avisoVisor(t, tipo = "info") {
  const el = $("#aviso-visor");
  if (!t) { el.hidden = true; return; }
  el.hidden = false; el.dataset.tipo = tipo;
  el.innerHTML = `<span>${esc(t)}</span><button type="button" class="btn-icono" aria-label="Cerrar aviso"><svg class="ico ico--s" aria-hidden="true"><use href="#i-x"/></svg></button>`;
  el.querySelector("button").onclick = () => avisoVisor(null);
}
$$("#herr-visor [data-vista]").forEach((b) => (b.onclick = () => visor.vista(b.dataset.vista)));
$("#btn-medir").onclick = (e) => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", on);
  visor.medir(on, ({ a, d }) => avisoVisor(d != null ? `Distancia: ${d.toFixed(2)} mm` : "Toca el segundo punto", "medida"));
  avisoVisor(on ? "Toca dos puntos del modelo" : null, "medida");
};
$("#btn-captura").onclick = async () => { const b = await visor.captura(); descargar(`${S.m?.nombre || "modelo"}.png`, b); };
$("#btn-visor").onclick = (e) => {
  const on = !$(".app").classList.contains("visor-grande");
  $(".app").classList.toggle("visor-grande", on);
  e.currentTarget.setAttribute("aria-pressed", on);
};

// ======================================================================
// Navegación y acciones rápidas
// ======================================================================
const { nav, irA, regresar, refrescar } = crearNavegacion({ vistas: VISTAS, tabs: ["inicio", "editar", "exportar"], padre: { cortes: "exportar" }, app: () => app });
function cerrarHojas() { while (hojaAbierta()) cerrarHojaSuperior(); }
function herramienta(id) { if (!S.m) return; HERRAMIENTAS[id]?.(app); }

$("#btn-mas").onclick = () => hoja({
  titulo: "Acciones rápidas",
  contenido(c, h) {
    const a = (id, ico, t, dis = false) => `<button type="button" class="accion" data-a="${id}" ${dis ? "disabled" : ""}><span class="accion__ico"><svg class="ico" aria-hidden="true"><use href="#i-${ico}"/></svg></span>${t}</button>`;
    c.innerHTML = `<div class="acciones">
      ${a("abrir", "abrir", "Abrir archivo")}${a("ejemplo", "cubo", "Ejemplo: búho")}
      ${a("captura", "camara", "Guardar imagen", !S.m)}${a("original", "girar", "Volver al original", !S.m)}
      ${a("formatos", "info", "Formatos de Creality")}${a("escaner", "escaner", "Escáneres")}
    </div>`;
    const f = { abrir: elegirArchivo, ejemplo, captura: () => $("#btn-captura").click(), original: volverOriginal, formatos: () => irA("formatos"), escaner: () => (location.href = "../escaner/") };
    c.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => { h.cerrar(); f[b.dataset.a](); }));
  },
});

// Teclado: Ctrl+Z / Ctrl+Y, Esc cierra la hoja
document.addEventListener("keydown", (e) => {
  if (e.target.matches?.("input, select, textarea")) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z" && !e.shiftKey) { e.preventDefault(); deshacer(); }
  else if ((e.ctrlKey || e.metaKey) && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); rehacer(); }
  else if (k === "escape" && hojaAbierta()) cerrarHojaSuperior();
});

const app = {
  S, ls, visor, w, previa, irA, regresar, refrescar, nav, tarea, progreso, avisoVisor,
  acc: { elegirArchivo, abrirArchivos, ejemplo, seguir, olvidar, editar, deshacer, rehacer, volverOriginal, exportar, cortes, enviarA, herramienta, ponerModo, recibir },
};
window.__visor3d = app;

irA("inicio");
// ¿Quedó un modelo de la vez pasada?
w("ultimo").then((r) => { if (r.hay) { S.ultimo = r; if (!S.m) refrescar(); } }).catch(() => {});
// Abrir un archivo que mandó otra página (?ejemplo)
if (new URLSearchParams(location.search).has("ejemplo")) ejemplo();
