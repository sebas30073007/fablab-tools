// malla.js - el modelo con el que trabaja todo el visor (en el worker y en la página).
//
//   { pos: Float32Array(3n)   posiciones en mm, con Z hacia arriba (convención de impresión 3D)
//     idx: Uint32Array(3m)    triángulos
//     col?: Uint8Array(4n)    color RGBA por vértice
//     uv?: Float32Array(2n)   coordenadas de textura por vértice
//     textura?: { datos: Uint8Array, tipo: "image/png" | "image/jpeg", nombre }
//     nombre, origen }        nombre sin extensión y formato del que salió
//
// Código puro (sin DOM ni importaciones con nombre suelto): corre en el worker, en la página y en Node.

export function nueva(pos, idx, extra = {}) {
  return { pos, idx, col: null, uv: null, textura: null, nombre: "modelo", origen: "", ...extra };
}

export const nVert = (m) => m.pos.length / 3;
export const nTri = (m) => m.idx.length / 3;

// Arreglo que crece (Float32, Uint32, Int32, Uint8): para leer archivos sin saber cuántos datos vienen
export class Crece {
  constructor(Tipo, inicial = 1024) { this.T = Tipo; this.a = new Tipo(inicial); this.n = 0; }
  _lugar(k) {
    if (this.n + k <= this.a.length) return;
    let t = this.a.length * 2; while (t < this.n + k) t *= 2;
    const b = new this.T(t); b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  push1(x) { this._lugar(1); this.a[this.n++] = x; }
  push2(x, y) { this._lugar(2); const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; this.n += 2; }
  push3(x, y, z) { this._lugar(3); const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = z; this.n += 3; }
  push4(x, y, z, w) { this._lugar(4); const a = this.a, n = this.n; a[n] = x; a[n + 1] = y; a[n + 2] = z; a[n + 3] = w; this.n += 4; }
  listo() { return this.a.slice(0, this.n); }
}

export function caja(m) {
  const p = m.pos, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
    if (y < min[1]) min[1] = y; if (y > max[1]) max[1] = y;
    if (z < min[2]) min[2] = z; if (z > max[2]) max[2] = z;
  }
  if (!p.length) return { min: [0, 0, 0], max: [0, 0, 0], tam: [0, 0, 0], centro: [0, 0, 0] };
  return { min, max, tam: max.map((v, i) => v - min[i]), centro: max.map((v, i) => (v + min[i]) / 2) };
}

// Quita los vértices que ya no usa ningún triángulo (después de borrar o recortar).
// conservar: Uint8Array(m) opcional; 1 = el triángulo se queda.
export function compactar(m, conservar = null) {
  const nv = nVert(m), idx = m.idx, nt = idx.length / 3;
  const mapa = new Int32Array(nv).fill(-1);
  let quedan = 0;
  for (let t = 0; t < nt; t++) if (!conservar || conservar[t]) quedan++;
  const nIdx = new Uint32Array(quedan * 3);
  let k = 0, nuevos = 0;
  for (let t = 0; t < nt; t++) {
    if (conservar && !conservar[t]) continue;
    for (let c = 0; c < 3; c++) {
      const v = idx[t * 3 + c];
      if (mapa[v] < 0) mapa[v] = nuevos++;
      nIdx[k++] = mapa[v];
    }
  }
  const pos = new Float32Array(nuevos * 3);
  const col = m.col ? new Uint8Array(nuevos * 4) : null;
  const uv = m.uv ? new Float32Array(nuevos * 2) : null;
  for (let v = 0; v < nv; v++) {
    const w = mapa[v]; if (w < 0) continue;
    pos[w * 3] = m.pos[v * 3]; pos[w * 3 + 1] = m.pos[v * 3 + 1]; pos[w * 3 + 2] = m.pos[v * 3 + 2];
    if (col) for (let c = 0; c < 4; c++) col[w * 4 + c] = m.col[v * 4 + c];
    if (uv) { uv[w * 2] = m.uv[v * 2]; uv[w * 2 + 1] = m.uv[v * 2 + 1]; }
  }
  return { ...m, pos, idx: nIdx, col, uv };
}

// Junta varias mallas en una (archivos con varios objetos). Si unas traen color y otras no,
// las que no traen quedan en gris; la textura solo se conserva si hay una sola.
export function unir(lista) {
  lista = lista.filter((m) => m && m.idx.length);
  if (lista.length === 1) return lista[0];
  if (!lista.length) return nueva(new Float32Array(0), new Uint32Array(0));
  const nv = lista.reduce((s, m) => s + nVert(m), 0), ni = lista.reduce((s, m) => s + m.idx.length, 0);
  const conCol = lista.some((m) => m.col), conUV = lista.every((m) => m.uv) && lista.filter((m) => m.textura).length <= 1;
  const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const col = conCol ? new Uint8Array(nv * 4).fill(200) : null, uv = conUV ? new Float32Array(nv * 2) : null;
  let ov = 0, oi = 0;
  for (const m of lista) {
    pos.set(m.pos, ov * 3);
    for (let i = 0; i < m.idx.length; i++) idx[oi + i] = m.idx[i] + ov;
    if (col && m.col) col.set(m.col, ov * 4);
    if (uv) uv.set(m.uv, ov * 2);
    ov += nVert(m); oi += m.idx.length;
  }
  return { ...lista[0], pos, idx, col, uv, textura: conUV ? lista.find((m) => m.textura)?.textura || null : null };
}

export function copia(m) {
  return { ...m, pos: m.pos.slice(), idx: m.idx.slice(), col: m.col?.slice() || null, uv: m.uv?.slice() || null };
}

// Lo que se puede pasar al worker sin copiar
export function transferibles(m) {
  return [m.pos.buffer, m.idx.buffer, m.col?.buffer, m.uv?.buffer, m.textura?.datos?.buffer].filter(Boolean);
}

// De Y arriba (OBJ, glTF) a Z arriba y de regreso: (x, y, z) → (x, −z, y)
export function yAz(pos) { for (let i = 0; i < pos.length; i += 3) { const y = pos[i + 1]; pos[i + 1] = -pos[i + 2]; pos[i + 2] = y; } return pos; }
export function zAy(pos) { for (let i = 0; i < pos.length; i += 3) { const z = pos[i + 2]; pos[i + 2] = -pos[i + 1]; pos[i + 1] = z; } return pos; }

// Normales por cara (sin normalizar: su largo es el doble del área)
export function normalCara(p, a, b, c, out) {
  const ax = p[b * 3] - p[a * 3], ay = p[b * 3 + 1] - p[a * 3 + 1], az = p[b * 3 + 2] - p[a * 3 + 2];
  const bx = p[c * 3] - p[a * 3], by = p[c * 3 + 1] - p[a * 3 + 1], bz = p[c * 3 + 2] - p[a * 3 + 2];
  out[0] = ay * bz - az * by; out[1] = az * bx - ax * bz; out[2] = ax * by - ay * bx;
  return out;
}

// Normales por vértice, ponderadas por área
export function normalesVertice(m) {
  const p = m.pos, idx = m.idx, n = new Float32Array(p.length), f = [0, 0, 0];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    normalCara(p, a, b, c, f);
    for (const v of [a, b, c]) { n[v * 3] += f[0]; n[v * 3 + 1] += f[1]; n[v * 3 + 2] += f[2]; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
