// leer-3mf.js - 3MF (zip con un XML) → malla, sin DOMParser.
//
// El 3MF «Textura» de Creality Scan pesa 70 MB de XML: en un DOM no cabe. Aquí se recorre el XML como
// bytes, etiqueta por etiqueta, y se leen solo los atributos que importan:
//   · <vertex x y z>, <triangle v1 v2 v3 pid p1 p2 p3>, <object id pid pindex>, <component objectid transform>
//   · <build><item objectid transform>
//   · color: <m:colorgroup><m:color color="#RRGGBBAA"> y <basematerials><base displaycolor>
//   · textura: <m:texture2d path> + <m:texture2dgroup texid><m:tex2coord u v>
// unit="micron|millimeter|centimeter|inch|foot|meter" se pasa a mm.

import { unzipSync, strFromU8 } from "../../../shared/vendor/three/addons/libs/fflate.module.js";
import { Crece, unir } from "../nucleo/malla.js";
import { desdeEsquinas } from "../nucleo/esquinas.js";

const UNIDAD = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

export function leer3MF(datos, avance = () => {}) {
  avance(0.02, "Descomprimiendo");
  const zip = unzipSync(datos, { filter: (f) => /\.model$|\.rels$|\.(png|jpe?g)$/i.test(f.name) });
  const nombres = Object.keys(zip);
  // La parte principal sale de _rels/.rels; si no, la primera .model
  let principal = "3D/3dmodel.model";
  if (zip["_rels/.rels"]) {
    const m = /Target="\/?([^"]+\.model)"/i.exec(strFromU8(zip["_rels/.rels"]));
    if (m && zip[m[1]]) principal = m[1];
  }
  if (!zip[principal]) principal = nombres.find((n) => /\.model$/i.test(n));
  if (!principal) throw new Error("El 3MF no trae ningún modelo");
  const r = leerModelo(zip[principal], (f) => avance(0.05 + f * 0.85, "Leyendo triángulos"));
  avance(0.92, "Armando la malla");
  // Textura: la ruta del <m:texture2d> (puede venir con / al inicio)
  let textura = null;
  if (r.texturaRuta) {
    const ruta = r.texturaRuta.replace(/^\//, "");
    const k = nombres.find((n) => n.toLowerCase() === ruta.toLowerCase());
    if (k) textura = { datos: zip[k], tipo: /\.jpe?g$/i.test(k) ? "image/jpeg" : "image/png", nombre: k.split("/").pop() };
  }
  const m = r.malla;
  if (textura && m.uv) m.textura = textura; else if (!textura) m.uv = null;
  return m;
}

// ---------- lectura del XML como bytes ----------
function leerModelo(d, avance) {
  const n = d.length;
  const objetos = new Map();        // id → { v: Crece, t: Crece, props: Crece, pid, pindex, comps: [] }
  const colores = new Map();        // id de grupo → Uint8Array RGBA (de colorgroup o basematerials)
  const texGrupos = new Map();      // id → { tex, uv: Float32Array }
  const texturas = new Map();       // id → ruta
  const items = [];
  let escala = 1;
  let obj = null, grupoCol = null, grupoTex = null, enBuild = false;
  let i = 0, siguienteAvance = 0;

  // Atributos de la etiqueta que empieza en a (después del nombre) hasta '>'
  const atrib = {};
  const leerAtrib = (a) => {
    for (const k in atrib) delete atrib[k];
    let j = a;
    while (j < n) {
      const c = d[j];
      if (c === 62) break;                    // >
      if (c <= 32 || c === 47) { j++; continue; }
      const k0 = j; while (j < n && d[j] !== 61 && d[j] > 32 && d[j] !== 62) j++;
      const k1 = j;
      while (j < n && d[j] !== 34 && d[j] !== 39 && d[j] !== 62) j++;
      if (d[j] === 62) break;
      const q = d[j], v0 = ++j; while (j < n && d[j] !== q) j++;
      atrib[nombre(d, k0, k1)] = [v0, j]; j++;
    }
    return j;
  };
  const texto = ([a, b]) => nombre(d, a, b);
  const numero = (k, def = 0) => (atrib[k] ? num(d, atrib[k][0], atrib[k][1]) : def);
  const entero = (k, def = -1) => (atrib[k] ? ent(d, atrib[k][0], atrib[k][1]) : def);

  while (true) {
    i = d.indexOf(60, i); if (i < 0) break;
    if (i > siguienteAvance) { avance(i / n); siguienteAvance = i + 4_000_000; }
    let j = i + 1, cierra = false;
    if (d[j] === 47) { cierra = true; j++; }
    else if (d[j] === 63 || d[j] === 33) { i = j; continue; }
    const a = j; while (j < n && d[j] > 32 && d[j] !== 62 && d[j] !== 47) j++;
    const etq = local(nombre(d, a, j));
    if (cierra) {
      if (etq === "object") obj = null;
      else if (etq === "colorgroup" || etq === "basematerials") grupoCol = null;
      else if (etq === "texture2dgroup") grupoTex = null;
      else if (etq === "build") enBuild = false;
      i = j; continue;
    }
    switch (etq) {
      case "vertex":
        if (obj) { j = leerVertice(d, j, n, obj.v); i = j; continue; }
        break;
      case "triangle":
        if (obj) {
          j = leerAtrib(j);
          obj.t.push3(entero("v1", 0), entero("v2", 0), entero("v3", 0));
          const p1 = entero("p1");
          obj.props.push4(entero("pid"), p1, entero("p2", p1), entero("p3", p1));
          i = j; continue;
        }
        break;
      case "model":
        j = leerAtrib(j);
        if (atrib.unit) escala = UNIDAD[texto(atrib.unit)] ?? 1;
        break;
      case "object":
        j = leerAtrib(j);
        obj = { v: new Crece(Float32Array, 3 << 14), t: new Crece(Uint32Array, 3 << 15), props: new Crece(Int32Array, 4 << 15), pid: entero("pid"), pindex: entero("pindex", 0), comps: [] };
        objetos.set(entero("id"), obj);
        break;
      case "component":
        j = leerAtrib(j);
        if (obj) obj.comps.push({ id: entero("objectid"), m: atrib.transform ? matriz(texto(atrib.transform)) : null });
        break;
      case "build": enBuild = true; break;
      case "item":
        j = leerAtrib(j);
        if (enBuild) items.push({ id: entero("objectid"), m: atrib.transform ? matriz(texto(atrib.transform)) : null });
        break;
      case "colorgroup":
      case "basematerials":
        j = leerAtrib(j);
        grupoCol = { id: entero("id"), c: new Crece(Uint8Array, 4096) };
        colores.set(grupoCol.id, grupoCol);
        break;
      case "color":
      case "base":
        if (grupoCol) {
          j = leerAtrib(j);
          const k = atrib.color || atrib.displaycolor;
          const [r, g, b, al] = k ? hex(d, k[0], k[1]) : [200, 200, 200, 255];
          grupoCol.c.push4(r, g, b, al);
        }
        break;
      case "texture2d":
        j = leerAtrib(j);
        texturas.set(entero("id"), texto(atrib.path || [0, 0]));
        break;
      case "texture2dgroup":
        j = leerAtrib(j);
        grupoTex = { tex: entero("texid"), uv: new Crece(Float32Array, 8192) };
        texGrupos.set(entero("id"), grupoTex);
        break;
      case "tex2coord":
        if (grupoTex) { j = leerAtrib(j); grupoTex.uv.push2(numero("u"), numero("v")); }
        break;
    }
    i = j;
  }
  const colArr = new Map([...colores].map(([k, g]) => [k, g.c.listo()]));
  const texArr = new Map([...texGrupos].map(([k, g]) => [k, { tex: g.tex, uv: g.uv.listo() }]));

  // ¿Hay textura o color? Se mira qué grupos usan los triángulos
  let usaTex = false, usaCol = false, texturaRuta = null;
  for (const o of objetos.values()) {
    const p = o.props.a;
    for (let k = 0; k < o.props.n; k += 4) {
      const pid = p[k] >= 0 ? p[k] : o.pid;
      if (texArr.has(pid)) { usaTex = true; texturaRuta ||= texturas.get(texArr.get(pid).tex); }
      else if (colArr.has(pid)) usaCol = true;
      if (usaTex) break;
    }
  }

  // Cada item del build (o todos los objetos con malla si no hay build), con su transformación
  const mallas = [];
  const agregar = (id, m, nivel = 0) => {
    const o = objetos.get(id); if (!o || nivel > 8) return;
    if (o.t.n) mallas.push(armar(o, m, escala, colArr, texArr, usaTex, usaCol));
    for (const c of o.comps) agregar(c.id, multiplicar(c.m, m), nivel + 1);
  };
  if (items.length) items.forEach((it) => agregar(it.id, it.m));
  else for (const id of objetos.keys()) agregar(id, null);
  const malla = unir(mallas);
  return { malla, texturaRuta: usaTex ? texturaRuta : null };
}

// Un objeto → malla, con la transformación aplicada y el color o la UV por esquina resueltos
function armar(o, m, escala, colArr, texArr, usaTex, usaCol) {
  const pos = o.v.listo(), idx = o.t.listo(), props = o.props.a, nt = idx.length / 3;
  for (let k = 0; k < pos.length; k += 3) {
    let x = pos[k], y = pos[k + 1], z = pos[k + 2];
    if (m) [x, y, z] = [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
    pos[k] = x * escala; pos[k + 1] = y * escala; pos[k + 2] = z * escala;
  }
  let uvEsq = null, colEsq = null;
  if (usaTex) {
    uvEsq = new Float32Array(nt * 6);
    for (let t = 0; t < nt; t++) {
      const pid = props[t * 4] >= 0 ? props[t * 4] : o.pid, g = texArr.get(pid);
      if (!g) continue;
      for (let c = 0; c < 3; c++) {
        let p = props[t * 4 + 1 + c]; if (p < 0) p = o.pindex;
        uvEsq[t * 6 + c * 2] = g.uv[p * 2] ?? 0; uvEsq[t * 6 + c * 2 + 1] = g.uv[p * 2 + 1] ?? 0;
      }
    }
  } else if (usaCol) {
    colEsq = new Uint8Array(nt * 12).fill(200);
    for (let t = 0; t < nt; t++) {
      const pid = props[t * 4] >= 0 ? props[t * 4] : o.pid, g = colArr.get(pid);
      for (let c = 0; c < 3; c++) {
        let p = props[t * 4 + 1 + c]; if (p < 0) p = o.pindex;
        if (g && p >= 0 && p * 4 < g.length) for (let j = 0; j < 4; j++) colEsq[t * 12 + c * 4 + j] = g[p * 4 + j];
        else colEsq[t * 12 + c * 4 + 3] = 255;
      }
    }
  }
  const r = desdeEsquinas({ pos, idx, uvEsq, colEsq });
  r.origen = "3mf";
  return r;
}

// <vertex x="…" y="…" z="…"/>: el caso más frecuente, sin pasar por el diccionario de atributos
function leerVertice(d, j, n, v) {
  let x = 0, y = 0, z = 0;
  while (j < n && d[j] !== 62) {
    const c = d[j];
    if ((c === 120 || c === 121 || c === 122) && d[j + 1] === 61 && d[j - 1] <= 32) {
      const q = j + 3; let e = q; while (d[e] !== 34 && d[e] !== 39) e++;
      const val = num(d, q, e);
      if (c === 120) x = val; else if (c === 121) y = val; else z = val;
      j = e + 1;
    } else j++;
  }
  v.push3(x, y, z);
  return j;
}

function nombre(d, a, b) {
  let s = "";
  for (let k = a; k < b; k++) s += String.fromCharCode(d[k]);
  return s;
}
const local = (s) => { const k = s.indexOf(":"); return k < 0 ? s : s.slice(k + 1); };

function num(d, a, b) {
  let i = a, s = 1, v = 0;
  while (i < b && d[i] <= 32) i++;
  if (d[i] === 45) { s = -1; i++; } else if (d[i] === 43) i++;
  while (i < b && d[i] >= 48 && d[i] <= 57) { v = v * 10 + d[i] - 48; i++; }
  if (d[i] === 46) {
    i++; let f = 0, div = 1;
    while (i < b && d[i] >= 48 && d[i] <= 57) { if (div < 1e15) { f = f * 10 + d[i] - 48; div *= 10; } i++; }
    v += f / div;
  }
  if (d[i] === 101 || d[i] === 69) {
    i++; let es = 1, e = 0;
    if (d[i] === 45) { es = -1; i++; } else if (d[i] === 43) i++;
    while (i < b && d[i] >= 48 && d[i] <= 57) { e = e * 10 + d[i] - 48; i++; }
    v *= Math.pow(10, es * e);
  }
  return s * v;
}
function ent(d, a, b) {
  let i = a, v = 0, s = 1;
  if (d[i] === 45) { s = -1; i++; }
  while (i < b && d[i] >= 48 && d[i] <= 57) { v = v * 10 + d[i] - 48; i++; }
  return s * v;
}
// #RRGGBB o #RRGGBBAA
function hex(d, a, b) {
  const h = (k) => { const c = d[k]; return c <= 57 ? c - 48 : (c | 32) - 87; };
  if (d[a] === 35) a++;
  const r = h(a) * 16 + h(a + 1), g = h(a + 2) * 16 + h(a + 3), bl = h(a + 4) * 16 + h(a + 5);
  const al = b - a >= 8 ? h(a + 6) * 16 + h(a + 7) : 255;
  return [r, g, bl, al];
}
// "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (filas; el punto va a la izquierda)
function matriz(s) { const v = s.trim().split(/\s+/).map(Number); return v.length === 12 ? v : null; }
function multiplicar(a, b) {
  if (!a) return b; if (!b) return a;
  const r = new Array(12);
  for (let f = 0; f < 4; f++) for (let c = 0; c < 3; c++) {
    r[f * 3 + c] = a[f * 3] * b[c] + a[f * 3 + 1] * b[3 + c] + a[f * 3 + 2] * b[6 + c] + (f === 3 ? b[9 + c] : 0);
  }
  return r;
}
