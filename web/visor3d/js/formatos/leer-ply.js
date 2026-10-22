// leer-ply.js - PLY (ASCII o binario) → malla.
//
// Lo que exporta Creality Scan:
//   · «Malla» / «Fused»: vértices con normales y caras (vertex_indices)
//   · «Mapeo de colores»: además, por cara, una lista texcoord con 6 floats (u v de cada esquina)
//     y un «comment TextureFile ColorMapping.png» con la imagen al lado
// También se leen colores por vértice (red green blue [alpha], uchar o float) y uv por vértice
// (s t / u v / texture_u texture_v). Las caras de más de 3 lados se parten en abanico.

import { Crece } from "../nucleo/malla.js";
import { desdeEsquinas } from "../nucleo/esquinas.js";


export function leerPLY(datos, archivos = {}, avance = () => {}) {
  const fin = buscar(datos, "end_header");
  if (fin < 0) throw new Error("No es un PLY: falta end_header");
  let cuerpo = fin + 10;
  if (datos[cuerpo] === 13) cuerpo++;
  if (datos[cuerpo] === 10) cuerpo++;
  const cab = new TextDecoder().decode(datos.subarray(0, fin));
  const lineas = cab.split(/\r?\n/);
  if (lineas[0].trim() !== "ply") throw new Error("No es un PLY");
  let formato = "ascii", texturaArchivo = null;
  const elementos = [];
  for (const l of lineas) {
    const p = l.trim().split(/\s+/);
    if (p[0] === "format") formato = p[1];
    else if (p[0] === "comment" && /^texturefile$/i.test(p[1])) texturaArchivo = p.slice(2).join(" ");
    else if (p[0] === "element") elementos.push({ nombre: p[1], n: +p[2], props: [] });
    else if (p[0] === "property") {
      const e = elementos[elementos.length - 1];
      if (p[1] === "list") e.props.push({ nombre: p[4], lista: true, tCuenta: p[2], tValor: p[3] });
      else e.props.push({ nombre: p[2], tipo: p[1] });
    }
  }
  const lector = formato === "ascii" ? new LectorTexto(datos, cuerpo) : new LectorBinario(datos, cuerpo, formato === "binary_little_endian");

  let pos = null, colVert = null, uvVert = null, idx = new Crece(Uint32Array, 1 << 16), uvEsq = null;
  for (const e of elementos) {
    if (e.nombre === "vertex") {
      const k = (nom) => e.props.findIndex((p) => p.nombre === nom);
      const ix = k("x"), iy = k("y"), iz = k("z");
      const ir = [k("red"), k("diffuse_red"), k("r")].find((v) => v >= 0) ?? -1;
      const ig = [k("green"), k("diffuse_green"), k("g")].find((v) => v >= 0) ?? -1;
      const ib = [k("blue"), k("diffuse_blue"), k("b")].find((v) => v >= 0) ?? -1;
      const ia = k("alpha");
      const iu = [k("s"), k("u"), k("texture_u"), k("texture_s")].find((v) => v >= 0) ?? -1;
      const iv = [k("t"), k("v"), k("texture_v"), k("texture_t")].find((v) => v >= 0) ?? -1;
      const flotante = ir >= 0 && /float|double/.test(e.props[ir].tipo);
      pos = new Float32Array(e.n * 3);
      if (ir >= 0) colVert = new Uint8Array(e.n * 4);
      if (iu >= 0 && iv >= 0) uvVert = new Float32Array(e.n * 2);
      const fila = new Float64Array(e.props.length);
      for (let v = 0; v < e.n; v++) {
        for (let j = 0; j < e.props.length; j++) {
          const p = e.props[j];
          if (p.lista) { const c = lector.leer(p.tCuenta); for (let q = 0; q < c; q++) lector.leer(p.tValor); fila[j] = 0; }
          else fila[j] = lector.leer(p.tipo);
        }
        pos[v * 3] = fila[ix]; pos[v * 3 + 1] = fila[iy]; pos[v * 3 + 2] = fila[iz];
        if (colVert) {
          const f = flotante ? 255 : 1;
          colVert[v * 4] = fila[ir] * f; colVert[v * 4 + 1] = fila[ig] * f; colVert[v * 4 + 2] = fila[ib] * f;
          colVert[v * 4 + 3] = ia >= 0 ? fila[ia] * f : 255;
        }
        if (uvVert) { uvVert[v * 2] = fila[iu]; uvVert[v * 2 + 1] = fila[iv]; }
        if ((v & 0xffff) === 0) avance(0.05 + 0.4 * v / e.n, "Leyendo vértices");
      }
    } else if (e.nombre === "face") {
      const iIdx = e.props.findIndex((p) => p.lista && /^vertex_ind/.test(p.nombre));
      const iTex = e.props.findIndex((p) => p.lista && p.nombre === "texcoord");
      const esq = iTex >= 0 ? new Crece(Float32Array, 1 << 16) : null;
      const vs = [], ts = [];
      for (let f = 0; f < e.n; f++) {
        vs.length = 0; ts.length = 0;
        for (let j = 0; j < e.props.length; j++) {
          const p = e.props[j];
          if (p.lista) {
            const c = lector.leer(p.tCuenta);
            for (let q = 0; q < c; q++) {
              const x = lector.leer(p.tValor);
              if (j === iIdx) vs.push(x); else if (j === iTex) ts.push(x);
            }
          } else lector.leer(p.tipo);
        }
        for (let q = 1; q + 1 < vs.length; q++) {
          idx.push3(vs[0], vs[q], vs[q + 1]);
          if (esq) {
            const t = (k) => (ts.length >= vs.length * 2 ? [ts[k * 2], ts[k * 2 + 1]] : [0, 0]);
            esq.push2(...t(0)); esq.push2(...t(q)); esq.push2(...t(q + 1));
          }
        }
        if ((f & 0xffff) === 0) avance(0.45 + 0.45 * f / e.n, "Leyendo caras");
      }
      if (esq) uvEsq = esq.listo();
    } else {
      // Otros elementos (aristas, materiales…): se saltan
      for (let r = 0; r < e.n; r++) for (const p of e.props) {
        if (p.lista) { const c = lector.leer(p.tCuenta); for (let q = 0; q < c; q++) lector.leer(p.tValor); }
        else lector.leer(p.tipo);
      }
    }
  }
  if (!pos) throw new Error("El PLY no trae vértices");
  avance(0.92, "Armando la malla");
  const indices = idx.listo();
  // Sin caras es una nube de puntos: se muestra como puntos
  let m;
  if (uvEsq) m = desdeEsquinas({ pos, idx: indices, uvEsq, colVert });
  else { m = desdeEsquinas({ pos, idx: indices, colVert }); if (uvVert) m.uv = uvVert; }
  m.origen = "ply";
  if (m.uv) {
    const t = texturaArchivo && buscarArchivo(archivos, texturaArchivo);
    if (t) m.textura = t;
    else m.faltaTextura = texturaArchivo || "la imagen de la textura";
  }
  return m;
}

export function buscarArchivo(archivos, nombre) {
  const base = nombre.split(/[\\/]/).pop().toLowerCase();
  const k = Object.keys(archivos).find((n) => n.split(/[\\/]/).pop().toLowerCase() === base);
  if (!k) return null;
  return { datos: archivos[k], tipo: /\.jpe?g$/i.test(k) ? "image/jpeg" : "image/png", nombre: k.split(/[\\/]/).pop() };
}

function buscar(d, texto) {
  const b = new TextEncoder().encode(texto);
  const lim = Math.min(d.length, 1 << 16);
  fuera: for (let i = 0; i < lim; i++) {
    for (let j = 0; j < b.length; j++) if (d[i + j] !== b[j]) continue fuera;
    return i;
  }
  return -1;
}

class LectorBinario {
  constructor(d, o, le) { this.v = new DataView(d.buffer, d.byteOffset, d.byteLength); this.o = o; this.le = le; }
  leer(t) {
    const v = this.v, o = this.o, le = this.le;
    switch (t) {
      case "char": case "int8": this.o += 1; return v.getInt8(o);
      case "uchar": case "uint8": this.o += 1; return v.getUint8(o);
      case "short": case "int16": this.o += 2; return v.getInt16(o, le);
      case "ushort": case "uint16": this.o += 2; return v.getUint16(o, le);
      case "int": case "int32": this.o += 4; return v.getInt32(o, le);
      case "uint": case "uint32": this.o += 4; return v.getUint32(o, le);
      case "float": case "float32": this.o += 4; return v.getFloat32(o, le);
      case "double": case "float64": this.o += 8; return v.getFloat64(o, le);
    }
    throw new Error(`PLY: tipo desconocido ${t}`);
  }
}
class LectorTexto {
  constructor(d, o) { this.d = d; this.o = o; }
  leer() {
    const d = this.d; let i = this.o;
    while (i < d.length && d[i] <= 32) i++;
    const a = i; while (i < d.length && d[i] > 32) i++;
    this.o = i;
    return parseFloat(String.fromCharCode.apply(null, d.subarray(a, i)));
  }
}

