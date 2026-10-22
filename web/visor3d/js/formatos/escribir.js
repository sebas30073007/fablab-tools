// escribir.js - malla → archivos (en el worker). Cada función devuelve [{ nombre, datos: Uint8Array }]:
// un archivo, o varios cuando el formato necesita la imagen de la textura al lado (OBJ, PLY).
// Los formatos web (GLB) y FBX se arman en la página con three.js y assimp (formatos/web.js).
//
// Convenciones: la malla va en mm con Z arriba. OBJ se escribe con Y arriba (lo que esperan Blender,
// Unity y Maya); STL, PLY, 3MF y ASC se quedan con Z arriba (impresión 3D y CAD).

import { zipSync, strToU8 } from "../../../shared/vendor/three/addons/libs/fflate.module.js";
import { normalCara } from "../nucleo/malla.js";

const ext = (t) => (t?.tipo === "image/jpeg" ? "jpg" : "png");
const f6 = (x) => (Math.abs(x) < 5e-7 ? "0" : +x.toFixed(5) + "");

// Texto grande sin juntar un string gigante: se codifica por pedazos
class Texto {
  constructor() { this.partes = []; this.buf = []; this.largo = 0; this.enc = new TextEncoder(); }
  add(s) { this.buf.push(s); this.largo += s.length; if (this.largo > 1 << 20) this._vaciar(); }
  _vaciar() { if (this.buf.length) this.partes.push(this.enc.encode(this.buf.join(""))); this.buf = []; this.largo = 0; }
  bytes() {
    this._vaciar();
    const total = this.partes.reduce((s, p) => s + p.length, 0), r = new Uint8Array(total);
    let o = 0; for (const p of this.partes) { r.set(p, o); o += p.length; }
    return r;
  }
}

// ---------------- STL binario (sin color: el formato no lo guarda) ----------------
export function escribirSTL(m, { nombre }) {
  const nt = m.idx.length / 3, b = new ArrayBuffer(84 + nt * 50), v = new DataView(b), p = m.pos, n = [0, 0, 0];
  const cab = strToU8(`Fab Lab Visor 3D - ${nombre}`.slice(0, 79));
  new Uint8Array(b).set(cab, 0);
  v.setUint32(80, nt, true);
  for (let t = 0; t < nt; t++) {
    const a = m.idx[t * 3], bb = m.idx[t * 3 + 1], c = m.idx[t * 3 + 2], o = 84 + t * 50;
    normalCara(p, a, bb, c, n);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    v.setFloat32(o, n[0] / l, true); v.setFloat32(o + 4, n[1] / l, true); v.setFloat32(o + 8, n[2] / l, true);
    let k = o + 12;
    for (const w of [a, bb, c]) { v.setFloat32(k, p[w * 3], true); v.setFloat32(k + 4, p[w * 3 + 1], true); v.setFloat32(k + 8, p[w * 3 + 2], true); k += 12; }
  }
  return [{ nombre: `${nombre}.stl`, datos: new Uint8Array(b) }];
}

// ---------------- OBJ (+MTL +imagen) ----------------
// color: "textura" (vt + map_Kd), "vertice" (v x y z r g b) o "ninguno"
export function escribirOBJ(m, { nombre, color }) {
  const t = new Texto(), p = m.pos, nv = p.length / 3;
  const conTex = color === "textura" && m.uv && m.textura, conCol = color === "vertice" && m.col;
  t.add(`# Fab Lab Visor 3D\n# ${nv} vértices, ${m.idx.length / 3} triángulos, mm, Y arriba\n`);
  if (conTex) t.add(`mtllib ${nombre}.mtl\nusemtl material0\n`);
  for (let i = 0; i < nv; i++) {
    // Z arriba → Y arriba: (x, y, z) → (x, z, −y)
    let s = `v ${f6(p[i * 3])} ${f6(p[i * 3 + 2])} ${f6(-p[i * 3 + 1])}`;
    if (conCol) s += ` ${(m.col[i * 4] / 255).toFixed(4)} ${(m.col[i * 4 + 1] / 255).toFixed(4)} ${(m.col[i * 4 + 2] / 255).toFixed(4)}`;
    t.add(s + "\n");
  }
  if (conTex) for (let i = 0; i < nv; i++) t.add(`vt ${f6(m.uv[i * 2])} ${f6(m.uv[i * 2 + 1])}\n`);
  const I = m.idx;
  for (let k = 0; k < I.length; k += 3) {
    const a = I[k] + 1, b = I[k + 1] + 1, c = I[k + 2] + 1;
    t.add(conTex ? `f ${a}/${a} ${b}/${b} ${c}/${c}\n` : `f ${a} ${b} ${c}\n`);
  }
  const salida = [{ nombre: `${nombre}.obj`, datos: t.bytes() }];
  if (conTex) {
    const img = `${nombre}.${ext(m.textura)}`;
    salida.push({ nombre: `${nombre}.mtl`, datos: strToU8(`newmtl material0\nKa 1 1 1\nKd 1 1 1\nKs 0 0 0\nillum 1\nmap_Kd ${img}\n`) });
    salida.push({ nombre: img, datos: m.textura.datos });
  }
  return salida;
}

// ---------------- PLY binario ----------------
// color: "vertice" (red green blue alpha), "textura" (texcoord por cara + TextureFile) o "ninguno"
export function escribirPLY(m, { nombre, color, ascii = false }) {
  const nv = m.pos.length / 3, nt = m.idx.length / 3;
  const conCol = color === "vertice" && m.col, conTex = color === "textura" && m.uv && m.textura;
  const img = conTex ? `${nombre}.${ext(m.textura)}` : null;
  let cab = `ply\nformat ${ascii ? "ascii" : "binary_little_endian"} 1.0\ncomment Fab Lab Visor 3D, mm, Z arriba\n`;
  if (conTex) cab += `comment TextureFile ${img}\n`;
  cab += `element vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\n`;
  if (conCol) cab += "property uchar red\nproperty uchar green\nproperty uchar blue\nproperty uchar alpha\n";
  cab += `element face ${nt}\nproperty list uchar int vertex_indices\n`;
  if (conTex) cab += "property list uchar float texcoord\n";
  cab += "end_header\n";
  let datos;
  if (ascii) {
    const t = new Texto(); t.add(cab);
    for (let i = 0; i < nv; i++) {
      let s = `${f6(m.pos[i * 3])} ${f6(m.pos[i * 3 + 1])} ${f6(m.pos[i * 3 + 2])}`;
      if (conCol) s += ` ${m.col[i * 4]} ${m.col[i * 4 + 1]} ${m.col[i * 4 + 2]} ${m.col[i * 4 + 3]}`;
      t.add(s + "\n");
    }
    for (let k = 0; k < m.idx.length; k += 3) {
      const a = m.idx[k], b = m.idx[k + 1], c = m.idx[k + 2];
      let s = `3 ${a} ${b} ${c}`;
      if (conTex) s += ` 6 ${[a, b, c].map((v) => `${f6(m.uv[v * 2])} ${f6(m.uv[v * 2 + 1])}`).join(" ")}`;
      t.add(s + "\n");
    }
    datos = t.bytes();
  } else {
    const cb = strToU8(cab), tv = 12 + (conCol ? 4 : 0), tf = 13 + (conTex ? 25 : 0);
    const buf = new ArrayBuffer(cb.length + nv * tv + nt * tf), dv = new DataView(buf);
    new Uint8Array(buf).set(cb, 0);
    let o = cb.length;
    for (let i = 0; i < nv; i++) {
      dv.setFloat32(o, m.pos[i * 3], true); dv.setFloat32(o + 4, m.pos[i * 3 + 1], true); dv.setFloat32(o + 8, m.pos[i * 3 + 2], true); o += 12;
      if (conCol) { for (let c = 0; c < 4; c++) dv.setUint8(o + c, m.col[i * 4 + c]); o += 4; }
    }
    for (let k = 0; k < m.idx.length; k += 3) {
      dv.setUint8(o, 3); o++;
      for (let c = 0; c < 3; c++) { dv.setInt32(o, m.idx[k + c], true); o += 4; }
      if (conTex) {
        dv.setUint8(o, 6); o++;
        for (let c = 0; c < 3; c++) { const v = m.idx[k + c]; dv.setFloat32(o, m.uv[v * 2], true); dv.setFloat32(o + 4, m.uv[v * 2 + 1], true); o += 8; }
      }
    }
    datos = new Uint8Array(buf);
  }
  const salida = [{ nombre: `${nombre}.ply`, datos }];
  if (conTex) salida.push({ nombre: img, datos: m.textura.datos });
  return salida;
}

// ---------------- 3MF ----------------
// color: "vertice" (m:colorgroup, un color por vértice repetido en cada esquina), "textura"
// (m:texture2d + tex2coord) o "ninguno". Unidad: milímetros.
export function escribir3MF(m, { nombre, color }) {
  const conTex = color === "textura" && m.uv && m.textura, conCol = color === "vertice" && m.col;
  const t = new Texto(), nv = m.pos.length / 3, p = m.pos;
  t.add(`<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="es-MX" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">\n`);
  t.add(`<metadata name="Title">${xml(nombre)}</metadata>\n<metadata name="Application">Fab Lab Visor 3D</metadata>\n<resources>\n`);
  let ref = null;            // índice del color o de la coordenada de cada vértice
  const img = conTex ? `/3D/Textures/${nombre.replace(/[^\w.-]+/g, "_")}.${ext(m.textura)}` : null;
  if (conTex) {
    t.add(`<m:texture2d id="1" path="${img}" contenttype="${m.textura.tipo}" tilestyleu="wrap" tilestylev="wrap" filter="auto"/>\n<m:texture2dgroup id="2" texid="1">\n`);
    for (let i = 0; i < nv; i++) t.add(`<m:tex2coord u="${f6(m.uv[i * 2])}" v="${f6(m.uv[i * 2 + 1])}"/>\n`);
    t.add(`</m:texture2dgroup>\n`);
  } else if (conCol) {
    // Paleta sin repetidos: muchos vértices comparten color
    const mapa = new Map(); ref = new Uint32Array(nv);
    t.add(`<m:colorgroup id="2">\n`);
    for (let i = 0; i < nv; i++) {
      const k = (m.col[i * 4] << 24 | m.col[i * 4 + 1] << 16 | m.col[i * 4 + 2] << 8 | m.col[i * 4 + 3]) >>> 0;
      let r = mapa.get(k);
      if (r === undefined) { r = mapa.size; mapa.set(k, r); t.add(`<m:color color="#${k.toString(16).padStart(8, "0").toUpperCase()}"/>\n`); }
      ref[i] = r;
    }
    t.add(`</m:colorgroup>\n`);
  }
  t.add(`<object id="3" type="model"${conTex || conCol ? ` pid="2" pindex="0"` : ""}>\n<mesh>\n<vertices>\n`);
  for (let i = 0; i < nv; i++) t.add(`<vertex x="${f6(p[i * 3])}" y="${f6(p[i * 3 + 1])}" z="${f6(p[i * 3 + 2])}"/>\n`);
  t.add(`</vertices>\n<triangles>\n`);
  for (let k = 0; k < m.idx.length; k += 3) {
    const a = m.idx[k], b = m.idx[k + 1], c = m.idx[k + 2];
    if (conTex) t.add(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="2" p1="${a}" p2="${b}" p3="${c}"/>\n`);
    else if (conCol) t.add(`<triangle v1="${a}" v2="${b}" v3="${c}" pid="2" p1="${ref[a]}" p2="${ref[b]}" p3="${ref[c]}"/>\n`);
    else t.add(`<triangle v1="${a}" v2="${b}" v3="${c}"/>\n`);
  }
  t.add(`</triangles>\n</mesh>\n</object>\n</resources>\n<build>\n<item objectid="3"/>\n</build>\n</model>\n`);
  const archivos = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`),
    "3D/3dmodel.model": t.bytes(),
  };
  if (conTex) {
    archivos[img.slice(1)] = [m.textura.datos, { level: 0 }];
    archivos["3D/_rels/3dmodel.model.rels"] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="${img}" Id="rel1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dtexture"/></Relationships>`);
  }
  return [{ nombre: `${nombre}.3mf`, datos: zipSync(archivos, { level: 6 }) }];
}

// ---------------- ASC: nube de puntos (x y z [r g b]) ----------------
export function escribirASC(m, { nombre, color }) {
  const t = new Texto(), p = m.pos, conCol = color === "vertice" && m.col;
  for (let i = 0; i < p.length / 3; i++) {
    let s = `${f6(p[i * 3])} ${f6(p[i * 3 + 1])} ${f6(p[i * 3 + 2])}`;
    if (conCol) s += ` ${m.col[i * 4]} ${m.col[i * 4 + 1]} ${m.col[i * 4 + 2]}`;
    t.add(s + "\n");
  }
  return [{ nombre: `${nombre}.asc`, datos: t.bytes() }];
}

// Varios archivos → un .zip (para descargar de una vez)
export function empacar(archivos, nombre) {
  if (archivos.length === 1) return archivos[0];
  return { nombre: `${nombre}.zip`, datos: zipSync(Object.fromEntries(archivos.map((a) => [a.nombre, [a.datos, { level: /\.(png|jpe?g)$/i.test(a.nombre) ? 0 : 6 }]]))) };
}

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
