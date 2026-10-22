// cortes.js - rebanadas del modelo para cortarlas en láser o CNC y apilarlas (o una sola sección).
//
// Cada rebanada es el contorno del modelo a una altura, en lazos cerrados (mm). Se acomodan en hojas
// del tamaño del material y salen como SVG (rojo = corte, como lo lee la app del láser) o DXF
// (una capa por rebanada, unidades mm; lo lee la app de la CNC como Edge_Cuts).

export function rebanar(m, { eje = 2, paso = 3, desde = null, hasta = null, alturas = null }) {
  const p = m.pos, idx = m.idx, nv = p.length / 3;
  let min = Infinity, max = -Infinity;
  for (let v = 0; v < nv; v++) { const h = p[v * 3 + eje]; if (h < min) min = h; if (h > max) max = h; }
  const a = desde ?? min, b = hasta ?? max;
  const lista = alturas || [];
  if (!alturas) for (let h = a + paso / 2; h < b; h += paso) lista.push(h);
  const [u, w] = eje === 2 ? [0, 1] : eje === 1 ? [0, 2] : [1, 2];
  // Triángulos ordenados por su altura mínima, para no revisar todos en cada rebanada
  const nt = idx.length / 3, tmin = new Float32Array(nt), tmax = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    const h0 = p[idx[t * 3] * 3 + eje], h1 = p[idx[t * 3 + 1] * 3 + eje], h2 = p[idx[t * 3 + 2] * 3 + eje];
    tmin[t] = Math.min(h0, h1, h2); tmax[t] = Math.max(h0, h1, h2);
  }
  const orden = new Uint32Array(nt).map((_, i) => i).sort((x, y) => tmin[x] - tmin[y]);
  const rebanadas = [];
  for (const h0 of lista) {
    const h = h0 + 1e-6;               // que ningún vértice caiga justo en el plano
    const sig = new Map(), puntos = new Map();
    for (let k = 0; k < nt; k++) {
      const t = orden[k];
      if (tmin[t] > h) break;
      if (tmax[t] < h) continue;
      const vs = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
      const cruces = [];
      for (let c = 0; c < 3; c++) {
        const i = vs[c], j = vs[(c + 1) % 3], hi = p[i * 3 + eje], hj = p[j * 3 + eje];
        if ((hi < h) === (hj < h)) continue;
        const clave = i < j ? i * nv + j : j * nv + i;
        if (!puntos.has(clave)) {
          const f = (h - hi) / (hj - hi);
          puntos.set(clave, [p[i * 3 + u] + (p[j * 3 + u] - p[i * 3 + u]) * f, p[i * 3 + w] + (p[j * 3 + w] - p[i * 3 + w]) * f]);
        }
        cruces.push({ clave, sube: hi < h });
      }
      if (cruces.length !== 2) continue;
      // Sentido: el segmento va de donde la superficie sube a donde baja (contorno exterior antihorario)
      const [c0, c1] = cruces[0].sube ? [cruces[1], cruces[0]] : [cruces[0], cruces[1]];
      sig.set(c0.clave, c1.clave);
    }
    const lazos = [], usado = new Set();
    for (const ini of sig.keys()) {
      if (usado.has(ini)) continue;
      const l = []; let c = ini, g = 0;
      while (c !== undefined && !usado.has(c) && g++ < 1e6) { usado.add(c); l.push(puntos.get(c)); c = sig.get(c); }
      if (l.length >= 3) lazos.push(simplificarLazo(l, 0.05));
    }
    if (lazos.length) rebanadas.push({ altura: h0, lazos });
  }
  return rebanadas;
}

// Quita puntos casi alineados (Douglas–Peucker simple sobre el lazo cerrado)
function simplificarLazo(l, tol) {
  if (l.length < 8) return l;
  const fuera = new Uint8Array(l.length);
  const dp = (a, b) => {
    let maxD = 0, k = -1;
    const [x1, y1] = l[a], [x2, y2] = l[b], dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * l[i][0] - dx * l[i][1] + x2 * y1 - y2 * x1) / L; if (d > maxD) { maxD = d; k = i; } }
    if (maxD > tol && k > 0) { dp(a, k); dp(k, b); } else for (let i = a + 1; i < b; i++) fuera[i] = 1;
  };
  dp(0, l.length - 1);
  return l.filter((_, i) => !fuera[i]);
}

// Acomoda las rebanadas en hojas de ancho × alto (mm), de izquierda a derecha y de arriba abajo
export function acomodar(rebanadas, { ancho = 300, alto = 200, separacion = 3 }) {
  const piezas = rebanadas.map((r, i) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of r.lazos) for (const [x, y] of l) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { i, r, x0, y0, w: x1 - x0, h: y1 - y0 };
  });
  const hojas = [];
  let hoja = null, cx = 0, cy = 0, filaAlto = 0;
  const nuevaHoja = () => { hoja = { piezas: [] }; hojas.push(hoja); cx = separacion; cy = separacion; filaAlto = 0; };
  nuevaHoja();
  for (const pz of piezas) {
    if (cx + pz.w + separacion > ancho) { cx = separacion; cy += filaAlto + separacion; filaAlto = 0; }
    if (cy + pz.h + separacion > alto && hoja.piezas.length) { nuevaHoja(); }
    hoja.piezas.push({ ...pz, dx: cx - pz.x0, dy: cy - pz.y0 });
    cx += pz.w + separacion; filaAlto = Math.max(filaAlto, pz.h);
  }
  const grandes = piezas.filter((pz) => pz.w > ancho || pz.h > alto).length;
  return { hojas, ancho, alto, grandes };
}

// SVG en mm (una hoja). Rojo = corte; el número de cada rebanada va como un punto de marcado azul.
export function aSVG(hoja, { ancho, alto }) {
  const f = (x) => +x.toFixed(3);
  const caminos = hoja.piezas.map((pz) => pz.r.lazos.map((l) =>
    `<path d="M${l.map(([x, y]) => `${f(x + pz.dx)},${f(alto - (y + pz.dy))}`).join("L")}Z"/>`).join("")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}mm" height="${alto}mm" viewBox="0 0 ${ancho} ${alto}">
<g fill="none" stroke="#ff0000" stroke-width="0.1">
${caminos}
</g>
</svg>
`;
}

// DXF R12 (lo más compatible): POLYLINE cerradas, una capa por rebanada (R01, R02…)
export function aDXF(hoja) {
  const L = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  for (const pz of hoja.piezas) {
    const capa = `R${String(pz.i + 1).padStart(2, "0")}`;
    for (const l of pz.r.lazos) {
      L.push("0", "POLYLINE", "8", capa, "66", "1", "70", "1");
      for (const [x, y] of l) L.push("0", "VERTEX", "8", capa, "10", (x + pz.dx).toFixed(4), "20", (y + pz.dy).toFixed(4));
      L.push("0", "SEQEND", "8", capa);
    }
  }
  L.push("0", "ENDSEC", "0", "EOF");
  return L.join("\n") + "\n";
}
