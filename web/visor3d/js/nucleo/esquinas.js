// esquinas.js - datos por esquina de triángulo → datos por vértice.
//
// Varios formatos guardan el color o la coordenada de textura por esquina (3MF, PLY con texcoord por
// cara, OBJ con vt). La malla del visor los quiere por vértice:
//   · UV por esquina: el vértice se parte donde la textura tiene una costura (misma posición, otra UV)
//   · color por esquina: se promedia en el vértice (es un horneado; la diferencia no se nota)

import { nueva } from "./malla.js";

// pos Float32Array(3n), idx Uint32Array(3m), uvEsq? Float32Array(6m), colEsq? Uint8Array(12m)
export function desdeEsquinas({ pos, idx, uvEsq = null, colEsq = null, colVert = null }) {
  let nPos = pos, nIdx = idx, uv = null, origenDe = null;
  if (uvEsq) {
    const nv = pos.length / 3, nc = idx.length;
    // Cadena por vértice original: primero[v] = primer vértice nuevo; siguiente[w] = el siguiente
    const primero = new Int32Array(nv).fill(-1);
    let sig = new Int32Array(nv + 1024), org = new Int32Array(nv + 1024), uvs = new Float32Array((nv + 1024) * 2);
    let total = 0;
    nIdx = new Uint32Array(nc);
    for (let k = 0; k < nc; k++) {
      const v = idx[k], u = uvEsq[k * 2], w = uvEsq[k * 2 + 1];
      let e = primero[v], previo = -1;
      while (e >= 0 && (uvs[e * 2] !== u || uvs[e * 2 + 1] !== w)) { previo = e; e = sig[e]; }
      if (e < 0) {
        if (total >= org.length) {
          const t = org.length * 2;
          const s2 = new Int32Array(t); s2.set(sig); sig = s2;
          const o2 = new Int32Array(t); o2.set(org); org = o2;
          const u2 = new Float32Array(t * 2); u2.set(uvs); uvs = u2;
        }
        e = total++;
        org[e] = v; sig[e] = -1; uvs[e * 2] = u; uvs[e * 2 + 1] = w;
        if (previo < 0) primero[v] = e; else sig[previo] = e;
      }
      nIdx[k] = e;
    }
    nPos = new Float32Array(total * 3);
    for (let e = 0; e < total; e++) { const v = org[e]; nPos[e * 3] = pos[v * 3]; nPos[e * 3 + 1] = pos[v * 3 + 1]; nPos[e * 3 + 2] = pos[v * 3 + 2]; }
    uv = uvs.slice(0, total * 2);
    origenDe = org.subarray(0, total);
  }
  let col = null;
  const nvN = nPos.length / 3;
  if (colEsq) {
    const suma = new Float32Array(nvN * 4), cuenta = new Uint32Array(nvN);
    for (let k = 0; k < nIdx.length; k++) {
      const v = nIdx[k];
      suma[v * 4] += colEsq[k * 4]; suma[v * 4 + 1] += colEsq[k * 4 + 1]; suma[v * 4 + 2] += colEsq[k * 4 + 2]; suma[v * 4 + 3] += colEsq[k * 4 + 3];
      cuenta[v]++;
    }
    col = new Uint8Array(nvN * 4);
    for (let v = 0; v < nvN; v++) {
      const c = cuenta[v] || 1;
      if (!cuenta[v]) { col.fill(200, v * 4, v * 4 + 3); col[v * 4 + 3] = 255; continue; }
      for (let j = 0; j < 4; j++) col[v * 4 + j] = Math.round(suma[v * 4 + j] / c);
    }
  } else if (colVert) {
    // Color que ya venía por vértice: si los vértices se partieron por la textura, se copia
    if (origenDe) { col = new Uint8Array(nvN * 4); for (let e = 0; e < nvN; e++) col.set(colVert.subarray(origenDe[e] * 4, origenDe[e] * 4 + 4), e * 4); }
    else col = colVert;
  }
  const m = nueva(nPos, nIdx);
  m.uv = uv; m.col = col;
  return m;
}
