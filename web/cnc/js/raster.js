// raster.js - imágenes en blanco y negro de la placa, como las de mods.
//
//   pistas    blanco = cobre que se queda
//   interior  blanco = la placa (lo que queda dentro del contorno)
//   hoyos     negro  = agujeros, sobre la placa en blanco (solo para ver)
//
// Todas comparten el mismo marco: px = (x − x0)·s, py = (yTop − y)·s, s = px/mm.

import { dibujarGerber, lazos } from "./gerber.js";

const MAX_PX = 30e6;

export function marco(pcb, { dpi = 1000, margen = 3 } = {}) {
  const c = pcb.contorno?.caja && isFinite(pcb.contorno.caja.x0) ? pcb.contorno.caja : pcb.cobre?.caja;
  if (!c || !isFinite(c.x0)) return null;
  let s = dpi / 25.4;
  const ancho = c.x1 - c.x0 + 2 * margen, alto = c.y1 - c.y0 + 2 * margen;
  if (ancho * alto * s * s > MAX_PX) s = Math.sqrt(MAX_PX / (ancho * alto));
  const W = Math.ceil(ancho * s), H = Math.ceil(alto * s);
  const x0 = c.x0 - margen, yTop = c.y1 + margen;
  return { s, W, H, x0, yTop, dpi: s * 25.4, placa: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, T: (x, y) => [(x - x0) * s, (yTop - y) * s] };
}

function lienzo(W, H, fondo) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
  return { cv, ctx };
}

export function imagenes(pcb, m) {
  const out = {};
  if (pcb.cobre) {
    const { cv, ctx } = lienzo(m.W, m.H, "#000");
    dibujarGerber(ctx, pcb.cobre, m.T, m.s);
    out.pistas = cv;
  }
  {
    const { cv, ctx } = lienzo(m.W, m.H, "#000");
    const ls = pcb.contorno ? lazos(pcb.contorno) : [];
    ctx.fillStyle = "#fff";
    if (ls.length) {
      ctx.beginPath();
      for (const l of ls) l.forEach(([x, y], k) => { const [px, py] = m.T(x, y); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.closePath(); ctx.fill("evenodd");
    } else {
      const p = m.placa, [a, b] = m.T(p.x0 - 1, p.y1 + 1), [c, d] = m.T(p.x1 + 1, p.y0 - 1);
      ctx.fillRect(a, b, c - a, d - b);
    }
    out.interior = cv;
  }
  if (pcb.hoyos?.length) {
    const { cv, ctx } = lienzo(m.W, m.H, "#000");
    ctx.drawImage(out.interior, 0, 0);
    ctx.fillStyle = "#000";
    for (const h of pcb.hoyos) { const [px, py] = m.T(h.x, h.y); ctx.beginPath(); ctx.arc(px, py, Math.max(1, (h.d / 2) * m.s), 0, 2 * Math.PI); ctx.fill(); }
    out.hoyos = cv;
  }
  return out;
}

// Copia solo para ver: fuera de la placa en blanco y el contorno como línea negra.
// Las imágenes de pcb.imgs no se tocan: de ellas salen las trayectorias y el PNG para mods.
export function vista(pcb, m, src) {
  const cv = document.createElement("canvas");
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext("2d");
  ctx.drawImage(src, 0, 0);
  const ls = pcb.contorno ? lazos(pcb.contorno) : [];
  const borde = new Path2D();
  if (ls.length) {
    for (const l of ls) { l.forEach(([x, y], k) => { const [px, py] = m.T(x, y); k ? borde.lineTo(px, py) : borde.moveTo(px, py); }); borde.closePath(); }
  } else {
    const p = m.placa, [a, b] = m.T(p.x0, p.y1), [c, d] = m.T(p.x1, p.y0);
    borde.rect(a, b, c - a, d - b);
  }
  const fuera = new Path2D();
  fuera.rect(0, 0, cv.width, cv.height);
  fuera.addPath(borde);
  ctx.fillStyle = "#fff"; ctx.fill(fuera, "evenodd");
  ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(2, 0.3 * m.s); ctx.lineJoin = "round";
  ctx.stroke(borde);
  return cv;
}

// Canvas → máscara binaria (1 = blanco)
export function binaria(cv) {
  const { width: W, height: H } = cv;
  const d = cv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const b = new Uint8Array(W * H);
  for (let i = 0, k = 0; i < b.length; i++, k += 4) b[i] = d[k] > 127 ? 1 : 0;
  return b;
}

// PNG con la resolución anotada en el nombre (mods la necesita para escalar)
export function aPNG(cv) {
  return new Promise((r) => cv.toBlob(r, "image/png"));
}
