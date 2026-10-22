// trabajador.js - el worker del visor: tiene el modelo y su historial, y hace todo lo pesado
// (leer, editar, exportar) sin congelar la página.
//
// Mensajes de la página: { id, op, ...datos } → respuesta { id, ok, ... } y, mientras trabaja,
// { id, avance: 0…1, texto }. Después de cada cambio manda una copia del modelo para dibujarlo
// (la del worker se queda para la siguiente edición). El modelo actual se guarda en IndexedDB:
// al volver a la página se puede seguir donde se quedó.

import { leer3MF } from "./formatos/leer-3mf.js";
import { leerPLY } from "./formatos/leer-ply.js";
import { leerSTL, leerOBJ } from "./formatos/leer-stl-obj.js";
import { escribirSTL, escribirOBJ, escribirPLY, escribir3MF, escribirASC, empacar } from "./formatos/escribir.js";
import { diagnostico, bordes, componentes, volumenFirmado } from "./ops/topologia.js";
import * as E from "./ops/editar.js";
import { hornear } from "./ops/hornear.js";
import { rebanar, acomodar, aSVG, aDXF } from "./ops/cortes.js";
import { copia, caja } from "./nucleo/malla.js";
import { unzipSync } from "../../shared/vendor/three/addons/libs/fflate.module.js";

const S = { actual: null, original: null, atras: [], adelante: [] };
const MAX_HIST = 8;

const LEER = {
  "3mf": (a, archivos, av) => leer3MF(a, av),
  ply: (a, archivos, av) => leerPLY(a, archivos, av),
  stl: (a, archivos, av) => leerSTL(a, av),
  obj: (a, archivos, av) => leerOBJ(a, archivos, av),
};
const ESCRIBIR = { stl: escribirSTL, obj: escribirOBJ, ply: escribirPLY, "3mf": escribir3MF, asc: escribirASC };

// Ediciones que cambian el modelo (con deshacer)
const EDITAR = {
  transformar: (m, o) => {
    let r = E.transformar(m, o.matriz);
    if (o.piso) r = alPiso(r, o.matriz, o.piso);
    return o.apoyar ? apoyar(r) : r;
  },
  reparar: (m) => { const r = E.reparar(m), o = E.orientar(r); return { ...o, info: { ...r.info, ...o.info } }; },
  islas: (m, o) => E.quitarIslas(m, o),
  orientar: (m) => E.orientar(m),
  borrar: (m, o) => E.borrar(m, o.mascara),
  cortar: (m, o) => E.cortar(m, o),
  caja: (m, o) => E.recortarCaja(m, o),
  rellenar: (m, o) => E.rellenar(m, o),
  suavizar: (m, o) => E.suavizar(m, o),
  simplificar: (m, o) => E.simplificar(m, o),
  hornear: (m) => hornear(m),
  quitarColor: (m) => ({ ...m, col: null, uv: null, textura: null }),
};

const ext = (n) => (n.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();

self.onmessage = async (e) => {
  const { id, op } = e.data;
  const avance = (f, texto) => self.postMessage({ id, avance: f, texto });
  try {
    const r = await HACER[op](e.data, avance);
    const { respuesta, transfer = [] } = r || {};
    self.postMessage({ id, ok: true, ...respuesta }, transfer);
  } catch (err) {
    console.error(err);
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  }
};

// Copia para la página (la del worker se queda), con su diagnóstico
function paraPagina(extra = {}) {
  const m = copia(S.actual);
  if (m.textura) m.textura = { ...m.textura, datos: m.textura.datos.slice() };
  const respuesta = { malla: m, diag: diagnostico(S.actual), puedeDeshacer: S.atras.length > 0, puedeRehacer: S.adelante.length > 0, ...extra };
  return { respuesta, transfer: [m.pos.buffer, m.idx.buffer, m.col?.buffer, m.uv?.buffer, m.textura?.datos.buffer].filter(Boolean) };
}

function poner(m, { nuevo = false } = {}) {
  if (nuevo) { S.original = m; S.atras = []; S.adelante = []; }
  else { S.atras.push(S.actual); if (S.atras.length > MAX_HIST) S.atras.shift(); S.adelante = []; }
  S.actual = m;
  guardar();
}

const HACER = {
  // archivos: { nombre: Uint8Array }. El principal es el primero con un formato de malla.
  async abrir({ archivos }, avance) {
    // Un .zip (OBJ + MTL + PNG, por ejemplo) se abre como si fueran sus archivos sueltos
    for (const n of Object.keys(archivos)) {
      if (ext(n) !== "zip") continue;
      const dentro = unzipSync(archivos[n]);
      delete archivos[n];
      for (const [k, v] of Object.entries(dentro)) if (v.length) archivos[k] = v;
    }
    const nombres = Object.keys(archivos);
    const orden = ["3mf", "ply", "obj", "stl"];
    const principal = nombres.filter((n) => orden.includes(ext(n))).sort((a, b) => orden.indexOf(ext(a)) - orden.indexOf(ext(b)))[0];
    if (!principal) throw new Error("No encontré un modelo 3D (3MF, PLY, OBJ, STL, GLB)");
    const m = LEER[ext(principal)](archivos[principal], archivos, avance);
    if (!m.idx.length) throw new Error(m.pos.length ? "El archivo es una nube de puntos sin triángulos" : "El archivo no trae triángulos");
    m.nombre = principal.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
    m.archivo = principal.split(/[\\/]/).pop();
    m.peso = archivos[principal].length;
    avance(0.97, "Revisando la malla");
    const volteado = voltearSiAdentro(m);
    poner(m, { nuevo: true });
    return paraPagina({ volteado });
  },
  // Modelo que armó la página (GLB/glTF con three.js)
  async cargar({ malla }) { const volteado = voltearSiAdentro(malla); poner(malla, { nuevo: true }); return paraPagina({ volteado }); },

  async editar({ nombre, opciones = {} }, avance) {
    avance(0.1, "Trabajando");
    const m = await EDITAR[nombre](S.actual, opciones);
    const info = m.info; delete m.info;
    poner(m);
    return paraPagina({ info });
  },
  deshacer() { if (!S.atras.length) return paraPagina(); S.adelante.push(S.actual); S.actual = S.atras.pop(); guardar(); return paraPagina(); },
  rehacer() { if (!S.adelante.length) return paraPagina(); S.atras.push(S.actual); S.actual = S.adelante.pop(); guardar(); return paraPagina(); },
  original() { poner(S.original); return paraPagina(); },

  // Previas: no cambian el modelo
  islas({ opciones }) { const r = E.mascaraIslas(S.actual, opciones); return { respuesta: { mascara: r }, transfer: [r.buffer] }; },
  huecos() { return { respuesta: { lazos: bordes(S.actual).lazos } }; },
  // Piezas que se quedan (tocadas en el 3D): máscara de lo que se borraría
  piezas({ opciones }) {
    if (S._comp?.de !== S.actual) S._comp = { de: S.actual, ...componentes(S.actual) };
    const { pieza } = S._comp, quedan = new Set(opciones.caras.map((c) => pieza[c]));
    const r = new Uint8Array(pieza.length);
    for (let t = 0; t < pieza.length; t++) r[t] = quedan.has(pieza[t]) ? 0 : 1;
    return { respuesta: { mascara: r, piezas: quedan.size }, transfer: [r.buffer] };
  },
  lazo({ opciones }) { const r = E.seleccionLazo(S.actual, opciones); return { respuesta: { mascara: r }, transfer: [r.buffer] }; },

  async exportar({ formato, opciones }, avance) {
    avance(0.1, "Preparando");
    let m = S.actual;
    // Formatos sin imagen: si se pidió color y solo hay textura, se hornea
    if (opciones.color === "vertice" && !m.col && m.textura) { avance(0.2, "Pasando la textura a color"); m = await hornear(m); }
    avance(0.4, "Escribiendo");
    const archivos = ESCRIBIR[formato](m, { nombre: S.actual.nombre, ...opciones });
    const a = opciones.zip === false ? archivos[0] : empacar(archivos, S.actual.nombre);
    return { respuesta: { nombre: a.nombre, datos: a.datos, archivos: archivos.map((x) => x.nombre) }, transfer: [a.datos.buffer] };
  },
  // La malla tal cual (con textura horneada si hace falta) para que la página arme GLB o FBX
  async malla({ hornearTextura = false }) {
    let m = S.actual;
    if (hornearTextura && m.textura && !m.col) m = await hornear(m);
    const c = copia(m); if (c.textura) c.textura = { ...c.textura, datos: c.textura.datos.slice() };
    return { respuesta: { malla: c }, transfer: [c.pos.buffer, c.idx.buffer, c.col?.buffer, c.uv?.buffer, c.textura?.datos.buffer].filter(Boolean) };
  },

  cortes({ opciones }) {
    const reb = rebanar(S.actual, opciones);
    const lay = acomodar(reb, opciones);
    const hojas = lay.hojas.map((h) => ({ svg: aSVG(h, lay), dxf: aDXF(h), piezas: h.piezas.length }));
    return { respuesta: { rebanadas: reb.map((r) => ({ altura: r.altura, lazos: r.lazos })), hojas, grandes: lay.grandes, caja: caja(S.actual) } };
  },

  async recuperar() {
    const g = await idb("get");
    if (!g) return { respuesta: { hay: false } };
    S.original = g.malla; S.actual = g.malla; S.atras = []; S.adelante = [];
    return paraPagina({ hay: true });
  },
  async ultimo() { const g = await idb("get", null, true); return { respuesta: g ? { hay: true, nombre: g.nombre, triangulos: g.triangulos, fecha: g.fecha } : { hay: false } }; },
  async olvidar() { await idb("del"); S.actual = null; return { respuesta: {} }; },
};

// Apoyar: el punto más bajo en Z = 0 y el centro en X, Y = 0 (así lo esperan los laminadores)
function apoyar(m) {
  const c = caja(m), p = m.pos;
  for (let i = 0; i < p.length; i += 3) { p[i] -= c.centro[0]; p[i + 1] -= c.centro[1]; p[i + 2] -= c.min[2]; }
  return m;
}

// «Elegir la cara de abajo»: la cara tocada ya quedó horizontal. Si la mayor parte del modelo quedó
// debajo de ella (se tocó la mesa o la tornamesa, que miran hacia arriba), se voltea 180°.
function alPiso(m, M, [x, y, z]) {
  const zp = M[2] * x + M[6] * y + M[10] * z + M[14], p = m.pos;
  let arriba = 0, abajo = 0;
  for (let i = 2; i < p.length; i += 3) { if (p[i] > zp + 0.5) arriba++; else if (p[i] < zp - 0.5) abajo++; }
  return abajo > arriba ? E.transformar(m, [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]) : m;
}

// Si la malla viene con las normales hacia adentro (volumen negativo medido desde su centro), se
// voltea. Desde el origen no sirve: en los escaneos el origen es la cámara, a 40 cm del modelo.
function voltearSiAdentro(m) {
  if (volumenFirmado(m, caja(m).centro) >= 0) return false;
  const I = m.idx;
  for (let t = 0; t < I.length; t += 3) { const x = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = x; }
  return true;
}

// ---------------- IndexedDB: el último modelo ----------------
let tGuardar = 0;
function guardar() {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => idb("put", { malla: S.actual, nombre: S.actual.nombre, triangulos: S.actual.idx.length / 3, fecha: Date.now() }).catch(() => {}), 800);
}
function idb(accion, valor, soloResumen = false) {
  return new Promise((ok, mal) => {
    const r = indexedDB.open("fablab-visor3d", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("modelo");
    r.onerror = () => mal(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction("modelo", accion === "get" ? "readonly" : "readwrite"), st = tx.objectStore("modelo");
      const q = accion === "get" ? st.get("actual") : accion === "put" ? st.put(valor, "actual") : st.delete("actual");
      q.onsuccess = () => {
        const v = q.result;
        ok(accion === "get" && v && soloResumen ? { nombre: v.nombre, triangulos: v.triangulos, fecha: v.fecha } : v);
        db.close();
      };
      q.onerror = () => { mal(q.error); db.close(); };
    };
  });
}
