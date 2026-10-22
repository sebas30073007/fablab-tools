// previa.js - la placa vista desde arriba como va a quedar: cobre, lo fresado, lo que atraviesa y los hoyos.
//
// Sale del G-code de cada trabajo, no de las imágenes: cada surco se pinta con el ancho de su herramienta a
// la profundidad a la que corta en ese punto (la fresa en V abre más entre más baja). Si la superficie no es
// plana (mapa medido sin aplicar, o la superficie de la simulación), la profundidad cambia de un lugar a
// otro, y ahí se ven las pistas que no se aíslan o los hilos de cobre que quedan entre pasadas.
//
// Encima, en rojo, el cobre del diseño que la fresa se come (pistas o contorno; los hoyos atraviesan su pad
// a propósito y no cuentan), y los hoyos del diseño como anillos (punteados los que no se taladran).

import { anchoV } from "./cam.js";

const MAX_PX = 6e6;          // la vista grande; a 50 px/mm una placa de 50 × 40 mm usa ~5 M px
const TRAMO = 0.4;           // mm: cada corte se parte en tramos para seguir la superficie
const ROJO = [220, 38, 38];

// h: { v: {punta, angulo} } fresa en V · { d } fresa plana o broca
function herramientaDe(t, P, diamDe) {
  if (t.id === "pistas") return { v: P.pistas };
  if (t.id === "grabado") return { v: P.grabado };
  if (t.id === "hoyos") return { d: P.hoyos.broca };
  if (t.id === "contorno" || t.id === "vaciado") return { d: P.contorno.diam };
  const m = String(t.herramienta || "").match(/^V\s*(\d+(?:\.\d+)?)°\s*punta\s*(\d+(?:\.\d+)?)/i);
  return m ? { v: { angulo: +m[1], punta: +m[2] } } : { d: diamDe(t.herramienta) || 0.3 };
}
const anchoA = (h, prof) => (h.v ? anchoV({ punta: h.v.punta ?? 0.1, angulo: h.v.angulo ?? 30, prof }) : h.d);

// trabajos: los de S (con prev.segs en mm de trabajo) · altura(x, y): superficie respecto a Z0 (null = plana)
// colores: { cara, hondo: [[r,g,b] poco hondo, [r,g,b] muy hondo] } · cobreDiseno: { cv, m, origen } para el rojo
export function previa({ trabajos, P, M, conduce, colores, altura = null, hoyos = [], cobreDiseno = null, diamDe }) {
  const ts = trabajos.filter((t) => t.estado !== "omitido" && t.prev?.segs?.length);
  if (!ts.length) return null;
  // Lo que se ve: el área de corte más 2 mm
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of ts) { const c = t.prev.corteCaja; if (!isFinite(c.min.x)) continue; x0 = Math.min(x0, c.min.x); y0 = Math.min(y0, c.min.y); x1 = Math.max(x1, c.max.x); y1 = Math.max(y1, c.max.y); }
  if (!isFinite(x0)) return null;
  x0 -= 2.5; y0 -= 2.5; x1 += 2.5; y1 += 2.5;
  const s = Math.min(50, Math.sqrt(MAX_PX / ((x1 - x0) * (y1 - y0))));
  const W = Math.ceil((x1 - x0) * s), H = Math.ceil((y1 - y0) * s);
  const X = (x) => (x - x0) * s, Y = (y) => (y1 - y) * s;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  // Fuera del material, gris; el material, con su cara (cobre, acrílico…)
  ctx.fillStyle = "#d9dde2"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = colores.cara; ctx.fillRect(X(0), Y(M.alto), M.ancho * s, M.alto * s);

  // Tramos de corte con su profundidad real
  const tramos = [];
  for (const t of ts) {
    const h = herramientaDe(t, P, diamDe), protege = t.id !== "hoyos";
    for (const g of t.prev.segs) {
      if (g.rapido || Math.min(g.a.z, g.b.z) >= 0) continue;
      const L = Math.hypot(g.b.x - g.a.x, g.b.y - g.a.y);
      const n = Math.max(1, Math.ceil(L / TRAMO));
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n, um = (u0 + u1) / 2;
        const ax = g.a.x + (g.b.x - g.a.x) * u0, ay = g.a.y + (g.b.y - g.a.y) * u0;
        const bx = g.a.x + (g.b.x - g.a.x) * u1, by = g.a.y + (g.b.y - g.a.y) * u1;
        // Una bajada vertical corta a su punto más hondo
        const z = L < 1e-6 ? Math.min(g.a.z, g.b.z) : g.a.z + (g.b.z - g.a.z) * um;
        const sup = altura ? altura((ax + bx) / 2, (ay + by) / 2) : 0;
        const prof = sup - z;
        if (prof <= 0.002) continue;
        tramos.push({ ax, ay, bx, by, prof, w: anchoA(h, prof), protege });
      }
    }
  }
  tramos.sort((a, b) => a.prof - b.prof);
  const tono = (p) => {
    if (p >= M.grosor - 0.05) return "rgb(26,24,21)";                       // atraviesa: se ve el MDF a la sombra
    if (conduce && p <= 0.035) return "rgb(150,88,50)";                      // solo rayó el cobre
    const [a, b] = colores.hondo, f = Math.min(1, p / M.grosor), m = (i) => Math.round(a[i] + (b[i] - a[i]) * f);
    return `rgb(${m(0)},${m(1)},${m(2)})`;
  };
  ctx.lineCap = ctx.lineJoin = "round";
  const trazar = (c, t, w) => {
    if (Math.hypot(t.bx - t.ax, t.by - t.ay) < 1e-6) { c.beginPath(); c.arc(X(t.ax), Y(t.ay), Math.max(0.5, (w * s) / 2), 0, 2 * Math.PI); c.fill(); return; }
    c.lineWidth = Math.max(1, w * s); c.beginPath(); c.moveTo(X(t.ax), Y(t.ay)); c.lineTo(X(t.bx), Y(t.by)); c.stroke();
  };
  for (const t of tramos) { const col = tono(t.prof); ctx.strokeStyle = ctx.fillStyle = col; trazar(ctx, t, t.w); }

  // Rojo: donde la fresa entra en cobre del diseño (con 0.05 mm de tolerancia por lado: el borde de la imagen
  // del cobre y el del trazo no coinciden al píxel aunque la trayectoria esté justo a un radio)
  let cortaCobre = 0;
  if (cobreDiseno?.cv && conduce) {
    const { cv: src, m, origen } = cobreDiseno;
    const a = document.createElement("canvas"); a.width = W; a.height = H;
    const ca = a.getContext("2d", { willReadFrequently: true });
    ca.fillStyle = "#000"; ca.fillRect(0, 0, W, H);
    ca.setTransform(s / m.s, 0, 0, s / m.s, (m.x0 - origen.x - x0) * s, (y1 - m.yTop + origen.y) * s);
    ca.drawImage(src, 0, 0);
    ca.setTransform(1, 0, 0, 1, 0, 0);
    const b = document.createElement("canvas"); b.width = W; b.height = H;
    const cb = b.getContext("2d", { willReadFrequently: true });
    cb.fillStyle = "#000"; cb.fillRect(0, 0, W, H);
    cb.strokeStyle = cb.fillStyle = "#fff"; cb.lineCap = "round";
    for (const t of tramos) if (t.protege && t.w > 0.1) trazar(cb, t, t.w - 0.1);
    const A = ca.getImageData(0, 0, W, H).data, B = cb.getImageData(0, 0, W, H).data;
    const img = ctx.getImageData(0, 0, W, H), D = img.data;
    for (let i = 0; i < D.length; i += 4) if (A[i] > 127 && B[i] > 127) { D[i] = ROJO[0]; D[i + 1] = ROJO[1]; D[i + 2] = ROJO[2]; cortaCobre++; }
    if (cortaCobre) ctx.putImageData(img, 0, 0);
  }

  // Hoyos del diseño: anillo del tamaño pedido; punteado y naranja si no se taladra
  ctx.lineWidth = Math.max(1, 0.04 * s);
  for (const hz of hoyos) {
    ctx.beginPath(); ctx.arc(X(hz.x), Y(hz.y), Math.max(1, (hz.d / 2) * s), 0, 2 * Math.PI);
    ctx.setLineDash(hz.taladra ? [] : [Math.max(2, 0.15 * s), Math.max(2, 0.1 * s)]);
    ctx.strokeStyle = hz.taladra ? "rgba(255,255,255,.75)" : "#C2410C";
    ctx.stroke();
  }
  ctx.setLineDash([]);
  return { cv, s, caja: { x0, y0, x1, y1 }, cortaCobre: cortaCobre / (s * s), sinTaladrar: hoyos.filter((h) => !h.taladra).length };
}
