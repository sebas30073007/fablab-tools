// leer-stl-obj.js - STL (binario o ASCII) y OBJ (+MTL) → malla.
//
// STL guarda cada triángulo con sus 3 vértices sueltos: aquí se unen los que caen en la misma posición
// para que la malla quede conectada (sin eso no se pueden contar huecos ni islas).
// OBJ: v (con color opcional «v x y z r g b»), vt, f con índices negativos y polígonos, mtllib + map_Kd.
// OBJ usa Y arriba por convención: se pasa a Z arriba.

import { Crece, yAz } from "../nucleo/malla.js";
import { desdeEsquinas } from "../nucleo/esquinas.js";
import { buscarArchivo } from "./leer-ply.js";

export function leerSTL(datos, avance = () => {}) {
  const v = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
  const nb = datos.length >= 84 ? v.getUint32(80, true) : 0;
  const binario = datos.length >= 84 && 84 + nb * 50 === datos.length;
  const tri = new Crece(Float32Array, 1 << 16);
  if (binario) {
    for (let t = 0; t < nb; t++) {
      const o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k++) tri.push1(v.getFloat32(o + k * 4, true));
      if ((t & 0xffff) === 0) avance(0.1 + 0.5 * t / nb, "Leyendo triángulos");
    }
  } else {
    const txt = new TextDecoder().decode(datos);
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g; let m;
    while ((m = re.exec(txt))) tri.push3(+m[1], +m[2], +m[3]);
  }
  avance(0.65, "Uniendo vértices");
  const sueltos = tri.listo();
  const { pos, idx } = unirIguales(sueltos);
  const r = desdeEsquinas({ pos, idx });
  r.origen = "stl";
  return r;
}

// Vértices en la misma posición exacta → uno solo (tabla hash sobre los bits del float)
export function unirIguales(sueltos) {
  const n = sueltos.length / 3, bits = new Uint32Array(sueltos.buffer, sueltos.byteOffset, sueltos.length);
  let tam = 1; while (tam < n * 2) tam <<= 1;
  const tabla = new Int32Array(tam).fill(-1);
  const pos = new Float32Array(n * 3), idx = new Uint32Array(n);
  let nuevos = 0;
  for (let i = 0; i < n; i++) {
    const a = bits[i * 3], b = bits[i * 3 + 1], c = bits[i * 3 + 2];
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & (tam - 1);
    while (true) {
      const e = tabla[h];
      if (e < 0) { tabla[h] = nuevos; pos[nuevos * 3] = sueltos[i * 3]; pos[nuevos * 3 + 1] = sueltos[i * 3 + 1]; pos[nuevos * 3 + 2] = sueltos[i * 3 + 2]; idx[i] = nuevos++; break; }
      if (pos[e * 3] === sueltos[i * 3] && pos[e * 3 + 1] === sueltos[i * 3 + 1] && pos[e * 3 + 2] === sueltos[i * 3 + 2]) { idx[i] = e; break; }
      h = (h + 1) & (tam - 1);
    }
  }
  return { pos: pos.slice(0, nuevos * 3), idx };
}

export function leerOBJ(datos, archivos = {}, avance = () => {}) {
  const txt = new TextDecoder().decode(datos);
  const P = new Crece(Float32Array, 1 << 16), C = new Crece(Uint8Array, 1 << 16), T = new Crece(Float32Array, 1 << 16);
  const I = new Crece(Uint32Array, 1 << 16), TI = new Crece(Int32Array, 1 << 16);
  let conColor = false, mtllib = null;
  const largo = txt.length;
  let i = 0, linea = 0;
  const f = [], ft = [];
  while (i < largo) {
    let e = txt.indexOf("\n", i); if (e < 0) e = largo;
    const l = txt.slice(i, e).trim(); i = e + 1;
    if ((++linea & 0x3ffff) === 0) avance(0.05 + 0.75 * i / largo, "Leyendo");
    if (!l || l[0] === "#") continue;
    const c0 = l.charCodeAt(0), c1 = l.charCodeAt(1);
    if (c0 === 118 && c1 === 32) {              // v
      const p = l.split(/\s+/);
      P.push3(+p[1], +p[2], +p[3]);
      if (p.length >= 7) { conColor = true; const k = (x) => Math.round(Math.min(1, Math.max(0, +x)) * 255); C.push4(k(p[4]), k(p[5]), k(p[6]), 255); }
      else C.push4(200, 200, 200, 255);
    } else if (c0 === 118 && c1 === 116) {       // vt
      const p = l.split(/\s+/); T.push2(+p[1], +p[2]);
    } else if (c0 === 102 && c1 === 32) {        // f
      const p = l.split(/\s+/); f.length = 0; ft.length = 0;
      const nv = P.n / 3, nt = T.n / 2;
      for (let k = 1; k < p.length; k++) {
        const [a, b] = p[k].split("/");
        let v = parseInt(a, 10); v = v < 0 ? nv + v : v - 1;
        let t = b ? parseInt(b, 10) : NaN; t = isNaN(t) ? -1 : t < 0 ? nt + t : t - 1;
        f.push(v); ft.push(t);
      }
      for (let k = 1; k + 1 < f.length; k++) { I.push3(f[0], f[k], f[k + 1]); TI.push3(ft[0], ft[k], ft[k + 1]); }
    } else if (l.startsWith("mtllib")) mtllib = l.slice(6).trim();
  }
  avance(0.85, "Armando la malla");
  const pos = P.listo(), idx = I.listo(), uvs = T.listo(), ti = TI.listo();
  let uvEsq = null;
  if (uvs.length && ti.some((x) => x >= 0)) {
    uvEsq = new Float32Array(idx.length * 2);
    for (let k = 0; k < idx.length; k++) { const t = ti[k]; if (t >= 0) { uvEsq[k * 2] = uvs[t * 2]; uvEsq[k * 2 + 1] = uvs[t * 2 + 1]; } }
  }
  const m = desdeEsquinas({ pos, idx, uvEsq, colVert: conColor ? C.listo() : null });
  yAz(m.pos);
  m.origen = "obj";
  if (m.uv) {
    // La textura sale del MTL (map_Kd); si no hay MTL, de una imagen que venga junto
    let nombreTex = null;
    const mtl = mtllib && buscarArchivo(archivos, mtllib);
    if (mtl) { const r = /map_Kd\s+(?:-\S+\s+\S+\s+)*(.+)/i.exec(new TextDecoder().decode(mtl.datos)); if (r) nombreTex = r[1].trim(); }
    const t = nombreTex ? buscarArchivo(archivos, nombreTex) : Object.keys(archivos).find((k) => /\.(png|jpe?g)$/i.test(k)) && buscarArchivo(archivos, Object.keys(archivos).find((k) => /\.(png|jpe?g)$/i.test(k)));
    if (t) m.textura = t; else m.faltaTextura = nombreTex || "la imagen de la textura";
  }
  return m;
}
