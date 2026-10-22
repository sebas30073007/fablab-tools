// topologia.js - cómo está armada la malla: aristas, bordes (huecos), piezas sueltas (islas), volumen.
// Todo con arreglos tipados para que aguante el medio millón de triángulos de un escaneo.

import { normalCara } from "../nucleo/malla.js";

// Con textura, un vértice se parte en la costura (misma posición, otra UV). Para contar huecos y piezas
// eso no es un borde: cada vértice se representa por el primero que está en su misma posición.
const cache = new WeakMap();
export function representantes(m) {
  const c = cache.get(m.pos); if (c && c.n === m.pos.length) return c.rep;
  const nv = m.pos.length / 3, rep = new Int32Array(nv);
  if (!m.uv) { for (let v = 0; v < nv; v++) rep[v] = v; }
  else {
    const bits = new Uint32Array(m.pos.buffer, m.pos.byteOffset, m.pos.length);
    let tam = 1; while (tam < nv * 2) tam <<= 1;
    const tabla = new Int32Array(tam).fill(-1);
    for (let v = 0; v < nv; v++) {
      const a = bits[v * 3], b = bits[v * 3 + 1], cc = bits[v * 3 + 2];
      let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(cc, 83492791)) & (tam - 1);
      while (true) {
        const e = tabla[h];
        if (e < 0) { tabla[h] = v; rep[v] = v; break; }
        if (bits[e * 3] === a && bits[e * 3 + 1] === b && bits[e * 3 + 2] === cc) { rep[v] = e; break; }
        h = (h + 1) & (tam - 1);
      }
    }
  }
  cache.set(m.pos, { n: m.pos.length, rep });
  return rep;
}

// Aristas sin dirección, ordenadas: clave = min * nv + max (cabe en un double con millones de vértices)
export function aristas(m) {
  const idx = m.idx, nt = idx.length / 3, nv = m.pos.length / 3, rep = representantes(m);
  const claves = new Float64Array(nt * 3);
  for (let t = 0; t < nt; t++) for (let c = 0; c < 3; c++) {
    const a = rep[idx[t * 3 + c]], b = rep[idx[t * 3 + (c + 1) % 3]];
    claves[t * 3 + c] = a < b ? a * nv + b : b * nv + a;
  }
  const orden = claves.slice().sort();
  return { claves, orden, nv, rep };
}

// Unión-búsqueda sobre vértices: qué vértices están conectados
export function componentes(m) {
  const nv = m.pos.length / 3, idx = m.idx, padre = new Int32Array(nv), rep = representantes(m);
  for (let i = 0; i < nv; i++) padre[i] = i;
  const raiz = (x) => { while (padre[x] !== x) { padre[x] = padre[padre[x]]; x = padre[x]; } return x; };
  const unir = (a, b) => { a = raiz(a); b = raiz(b); if (a !== b) padre[a] = b; };
  for (let t = 0; t < idx.length; t += 3) { unir(rep[idx[t]], rep[idx[t + 1]]); unir(rep[idx[t]], rep[idx[t + 2]]); }
  // Número de pieza por triángulo y tamaño de cada pieza (en triángulos)
  const nt = idx.length / 3, pieza = new Int32Array(nt), numDe = new Map(), tam = [];
  for (let t = 0; t < nt; t++) {
    const r = raiz(rep[idx[t * 3]]);
    let k = numDe.get(r); if (k === undefined) { k = tam.length; numDe.set(r, k); tam.push(0); }
    pieza[t] = k; tam[k]++;
  }
  return { pieza, tam };
}

// Bordes: aristas que usa un solo triángulo. Se encadenan en lazos (cada lazo es un hueco o el borde
// de una superficie abierta). Cada lazo va en el sentido de su triángulo: a → b.
export function bordes(m, ar = aristas(m)) {
  const { claves, orden, rep } = ar, idx = m.idx;
  const unica = new Set();
  let raras = 0;
  for (let i = 0; i < orden.length;) {
    let j = i + 1; while (j < orden.length && orden[j] === orden[i]) j++;
    if (j - i === 1) unica.add(orden[i]); else if (j - i > 2) raras++;
    i = j;
  }
  const sig = new Map();          // a → [b…]
  for (let k = 0; k < claves.length; k++) {
    if (!unica.has(claves[k])) continue;
    const t = (k / 3) | 0, c = k % 3;
    const a = rep[idx[t * 3 + c]], b = rep[idx[t * 3 + (c + 1) % 3]];
    const l = sig.get(a); if (l) l.push(b); else sig.set(a, [b]);
  }
  const lazos = [];
  for (const inicio of sig.keys()) {
    let l = sig.get(inicio);
    while (l && l.length) {
      const lazo = [inicio]; let v = l.pop(), pasos = 0;
      while (v !== inicio && pasos++ < 1e6) {
        lazo.push(v);
        const s = sig.get(v); if (!s || !s.length) break;
        v = s.pop();
      }
      if (v === inicio && lazo.length >= 3) lazos.push(lazo);
      l = sig.get(inicio);
    }
  }
  return { lazos, nBorde: unica.size, raras };
}

// Volumen con signo medido desde el punto o (positivo = caras hacia afuera). Con la malla cerrada no
// importa el punto; con una abierta (un escaneo) hay que medir desde su centro.
export function volumenFirmado(m, o = [0, 0, 0], tris = null) {
  const p = m.pos, I = m.idx;
  let v = 0;
  const una = (t) => {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ax = p[a] - o[0], ay = p[a + 1] - o[1], az = p[a + 2] - o[2], bx = p[b] - o[0], by = p[b + 1] - o[1], bz = p[b + 2] - o[2];
    const cx = p[c] - o[0], cy = p[c + 1] - o[1], cz = p[c + 2] - o[2];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  };
  if (tris) for (const t of tris) una(t); else for (let t = 0; t < I.length / 3; t++) una(t);
  return v / 6;
}

export function diagnostico(m) {
  const ar = aristas(m), b = bordes(m, ar), comp = componentes(m), p = m.pos, idx = m.idx, n = [0, 0, 0];
  let area = 0, degenerados = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], bb = idx[t + 1], c = idx[t + 2];
    normalCara(p, a, bb, c, n);
    const ar2 = Math.hypot(n[0], n[1], n[2]);
    if (ar2 < 1e-12 || a === bb || bb === c || a === c) degenerados++;
    area += ar2 / 2;
  }
  let cx = 0, cy = 0, cz = 0; const nv = p.length / 3;
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2]; }
  const vol = volumenFirmado(m, nv ? [cx / nv, cy / nv, cz / nv] : [0, 0, 0]);
  const tamOrden = comp.tam.slice().sort((x, y) => y - x);
  const nt = idx.length / 3;
  // Islas: piezas de menos del 1 % de la principal (polvo del escaneo, marcadores, pedazos de mesa)
  const islas = tamOrden.slice(1).filter((t) => t < Math.max(50, tamOrden[0] * 0.01)).length;
  const huecos = b.lazos.map((l) => l.length).sort((x, y) => x - y);
  return {
    vertices: p.length / 3, triangulos: nt, piezas: comp.tam.length, islas,
    huecos: huecos.length, huecosChicos: huecos.filter((x) => x <= 200).length, bordeMayor: huecos[huecos.length - 1] || 0,
    aristasRaras: b.raras, degenerados,
    cerrado: b.nBorde === 0 && b.raras === 0,
    area, volumen: Math.abs(vol), volumenNegativo: vol < 0,
  };
}
