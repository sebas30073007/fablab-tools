// trabajo.js - del diseño colocado en la cama al G-code de la S1.
//
//   armar({ diseno, lugar, material, propios, perfil }) → { lineas, prev, tiempo, caja, avisos, pasos }
//   encuadre(caja, perfil)                              → líneas para recorrer el contorno sin láser
//
// diseno: { nombre, ancho, alto, capas: [{ id, color, relleno, trazos, op }], imagen?: { fuente, op, modo, … } }
//   op de cada capa: "corte" | "marcado" | "grabado" | "nada"
// lugar: { x, y, escala } esquina de arriba a la izquierda del diseño en la cama (mm de la máquina)
//
// Orden del trabajo: primero lo que graba, luego lo que marca y al final lo que corta (si se corta
// antes, la pieza se mueve y lo demás sale chueco). Dentro del corte, primero los agujeros y al final
// el contorno de la pieza.

import { leer, tiempoAcumulado } from "../../shared/js/gcode.js";
import { OPERACIONES, ajustes } from "./materiales.js";
import { aGris, tramar, gcodeGrabado } from "./grabado.js";

const f2 = (v) => (Math.abs(v) < 5e-3 ? 0 : v).toFixed(2).replace(/\.?0+$/, "");
const comentario = (t) => `; ${String(t).replace(/[\r\n]/g, " ")}`;

// Ramer–Douglas–Peucker
function simplificar(pts, tol) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  let dmax = 0, k = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const d = L < 1e-9 ? Math.hypot(p.x - a.x, p.y - a.y) : Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / L;
    if (d > dmax) { dmax = d; k = i; }
  }
  if (dmax <= tol) return [a, b];
  return [...simplificar(pts.slice(0, k + 1), tol).slice(0, -1), ...simplificar(pts.slice(k), tol)];
}

// Orden voraz: siempre al trazo más cercano; los cerrados empiezan en su punto más cercano
function ordenar(trazos, desde = { x: 0, y: 0 }) {
  const quedan = trazos.slice(), out = [];
  let p = desde;
  while (quedan.length) {
    let mejor = 0, dmin = Infinity, giro = 0, rev = false;
    quedan.forEach((t, i) => {
      if (t.cerrado) {
        t.pts.forEach((q, j) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < dmin) { dmin = d; mejor = i; giro = j; rev = false; } });
      } else {
        const a = t.pts[0], b = t.pts[t.pts.length - 1];
        const da = Math.hypot(a.x - p.x, a.y - p.y), db = Math.hypot(b.x - p.x, b.y - p.y);
        if (da < dmin) { dmin = da; mejor = i; giro = 0; rev = false; }
        if (db < dmin) { dmin = db; mejor = i; giro = 0; rev = true; }
      }
    });
    const t = quedan.splice(mejor, 1)[0];
    let pts = t.pts;
    if (t.cerrado && giro) { const anillo = pts.slice(0, -1); pts = [...anillo.slice(giro), ...anillo.slice(0, giro), anillo[giro]]; }
    if (rev) pts = pts.slice().reverse();
    out.push({ ...t, pts });
    p = pts[pts.length - 1];
  }
  return out;
}

const areaCaja = (t) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of t.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return (x1 - x0) * (y1 - y0);
};

// Trazos del diseño → mm de la máquina
const colocar = (trazos, lugar) => trazos.map((t) => ({ ...t, pts: t.pts.map((p) => ({ x: lugar.x + p.x * lugar.escala, y: lugar.y + p.y * lugar.escala })) }));

function vector(trazos, op, aj, sMax, tolerancia = 0.02) {
  const L = [comentario(`${OPERACIONES[op].t}: ${aj.potencia} % · ${aj.velocidad} mm/s · ${aj.pasadas} pasada${aj.pasadas > 1 ? "s" : ""}`), "M3", `M15 S${aj.aire}`, `G1 F${Math.round(aj.velocidad * 60)}`];
  const s = Math.round((aj.potencia / 100) * sMax);
  let lista = trazos.map((t) => ({ ...t, pts: simplificar(t.pts, tolerancia) }));
  // Corte: de adentro hacia afuera (los agujeros antes que el contorno de la pieza)
  if (op === "corte") lista.sort((a, b) => areaCaja(a) - areaCaja(b));
  else lista = ordenar(lista);
  for (let k = 0; k < aj.pasadas; k++) {
    for (const t of lista) {
      const [a, ...resto] = t.pts;
      L.push(`G0 X${f2(a.x)} Y${f2(a.y)} S0`);
      resto.forEach((p, i) => L.push(`G1 X${f2(p.x)} Y${f2(p.y)}${i === 0 ? ` S${s}` : ""}`));
    }
  }
  L.push("M5");
  return L;
}

// Rellenos vectoriales → imagen a la densidad del grabado
function rasterRelleno(trazos, caja, densidad) {
  const W = Math.max(1, Math.round((caja.x1 - caja.x0) * densidad)), H = Math.max(1, Math.round((caja.y1 - caja.y0) * densidad));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
  x.fillStyle = "#000";
  x.beginPath();
  for (const t of trazos) t.pts.forEach((p, i) => (i ? x.lineTo : x.moveTo).call(x, (p.x - caja.x0) * densidad, (p.y - caja.y0) * densidad));
  x.fill("evenodd");
  const d = x.getImageData(0, 0, W, H).data, px = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) px[i] = d[i * 4] < 128 ? 0 : 255;
  return { px, W, H };
}

function cajaDe(trazos) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of trazos) for (const p of t.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

function raster(img, aj, lugar, sMax, limiteX) {
  const L = [comentario(`Grabado: ${aj.potencia} % · ${aj.velocidad} mm/s · ${aj.densidad} líneas/mm`), "M4", `M15 S${aj.aire}`];
  for (let k = 0; k < aj.pasadas; k++) L.push(...gcodeGrabado(img, { ...aj, velocidad: aj.velocidad * 60, sobrebarrido: Math.min(5, aj.velocidad / 60) }, { ...lugar, limiteX }, sMax));
  L.push("M5");
  return L;
}

export function armar({ diseno, lugar, material, propios = {}, perfil }) {
  const avisos = [], pasos = [];
  const sMax = perfil.sMax;
  const capas = diseno.capas.filter((c) => c.op && c.op !== "nada");
  const porOp = (op) => capas.filter((c) => c.op === op);
  const cuerpo = [];
  const W = diseno.ancho * lugar.escala, H = diseno.alto * lugar.escala;

  // 1. Grabado: imagen y rellenos
  const ajG = ajustes(material, "grabado", propios);
  if (diseno.imagen && diseno.imagen.op === "grabado") {
    if (!ajG) avisos.push(`${material.t} no se graba.`);
    else {
      const im = diseno.imagen, d = ajG.densidad;
      const w = Math.max(1, Math.round(W * d)), h = Math.max(1, Math.round(H * d));
      const px = tramar(aGris(im.fuente, w, h, im), w, h, im.modo, im.umbral);
      cuerpo.push(...raster({ px, W: w, H: h }, ajG, { x: lugar.x, y: lugar.y, ancho: W, alto: H }, sMax, perfil.area.x));
      pasos.push({ op: "grabado", t: "Imagen" });
    }
  }
  const rellenos = porOp("grabado");
  if (rellenos.length) {
    if (!ajG) avisos.push(`${material.t} no se graba.`);
    else {
      const tz = colocar(rellenos.flatMap((c) => c.trazos), lugar), c = cajaDe(tz);
      const img = rasterRelleno(tz, c, ajG.densidad);
      cuerpo.push(...raster(img, ajG, { x: c.x0, y: c.y0, ancho: c.x1 - c.x0, alto: c.y1 - c.y0 }, sMax, perfil.area.x));
      pasos.push({ op: "grabado", t: "Rellenos" });
    }
  }
  // 2. Marcado y 3. corte
  for (const op of ["marcado", "corte"]) {
    const cs = porOp(op);
    if (!cs.length) continue;
    const aj = ajustes(material, op, propios);
    if (!aj) { avisos.push(`${material.t} no admite ${OPERACIONES[op].t.toLowerCase()}.`); continue; }
    cuerpo.push(...vector(colocar(cs.flatMap((c) => c.trazos), lugar), op, aj, sMax));
    pasos.push({ op, t: OPERACIONES[op].t });
  }

  const caja = { x: lugar.x, y: lugar.y, ancho: W, alto: H };
  const fuera = caja.x < -0.01 || caja.y < -0.01 || caja.x + W > perfil.area.x + 0.01 || caja.y + H > perfil.area.y + 0.01;
  if (fuera) avisos.push("El diseño se sale del área de corte.");
  if (!cuerpo.length) return { lineas: [], prev: null, tiempo: 0, caja, avisos, pasos, fuera };

  const lineas = [
    comentario(`${diseno.nombre} · ${material.t}`),
    comentario("Generado por Fab Lab · Láser (camino A: streaming por USB)"),
    "$L",
    ...perfil.encabezado({ ancho: Math.ceil(W), alto: Math.ceil(H) }),
    ...cuerpo,
    ...perfil.pie(),
  ];
  const prev = leer(lineas.join("\n"), { rapido: perfil.rapido });
  return { lineas, prev, tiempo: prev.tiempo, acum: tiempoAcumulado(lineas, { rapido: perfil.rapido }), caja, avisos, pasos, fuera };
}

// Encuadre: el cabezal recorre la caja del diseño con el láser apagado, para ver dónde caerá
export function encuadre(caja, perfil, vueltas = 1) {
  const p = (x, y) => `G0 X${f2(x)} Y${f2(y)} F3000`;
  const { x, y, ancho: w, alto: h } = caja;
  const L = ["M110 X1 Y1 Z1", "M5", "G90"];
  for (let k = 0; k < vueltas; k++) L.push(p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h));
  L.push(p(x, y));
  return L;
}
