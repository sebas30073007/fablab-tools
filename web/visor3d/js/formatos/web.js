// web.js - formatos que se arman en la página con three.js: GLB/glTF (leer y escribir) y FBX (assimp).
//
// glTF usa Y arriba y metros por convención; la malla del visor va en mm con Z arriba.
// Al leer se pasa de metros a mm solo si el modelo es diminuto (< 2 m de lado se asume en metros).
// FBX: se arma el GLB y assimp (WASM, fork con exportador FBX) lo convierte. Se carga la primera vez
// que se pide un FBX: pesa 4 MB.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { yAz, zAy, unir } from "../nucleo/malla.js";

// archivos: { nombre: Uint8Array }; el principal es .glb o .gltf
export async function leerGLTF(archivos) {
  const principal = Object.keys(archivos).find((n) => /\.(glb|gltf)$/i.test(n));
  const urls = {};
  for (const [n, d] of Object.entries(archivos)) urls[n.split(/[\\/]/).pop()] = URL.createObjectURL(new Blob([d]));
  const gestor = new THREE.LoadingManager();
  gestor.setURLModifier((u) => urls[decodeURIComponent(u.split(/[\\/]/).pop())] || u);
  const gltf = await new GLTFLoader(gestor).loadAsync(urls[principal.split(/[\\/]/).pop()]);
  Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
  gltf.scene.updateMatrixWorld(true);
  const mallas = [];
  let textura = null;
  for (const o of listaMallas(gltf.scene)) {
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const pos = Float32Array.from(g.attributes.position.array);
    const n = pos.length / 3;
    const idx = g.index ? Uint32Array.from(g.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
    let col = null, uv = null;
    const c = g.attributes.color;
    if (c) {
      col = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) {
        const k = (x) => (c.normalized || c.array instanceof Float32Array ? Math.round(Math.min(1, x) * 255) : x);
        col[i * 4] = k(c.getX(i)); col[i * 4 + 1] = k(c.getY(i)); col[i * 4 + 2] = k(c.getZ(i)); col[i * 4 + 3] = c.itemSize === 4 ? k(c.getW(i)) : 255;
      }
    } else if (o.material?.color && !o.material.map) {
      // Color del material: se pasa a los vértices para no perderlo
      const k = o.material.color.clone().convertLinearToSRGB();
      col = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) col.set([k.r * 255, k.g * 255, k.b * 255, 255], i * 4);
    }
    if (g.attributes.uv && o.material?.map?.image && !textura) {
      uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { uv[i * 2] = g.attributes.uv.getX(i); uv[i * 2 + 1] = 1 - g.attributes.uv.getY(i); }   // glTF: v hacia abajo
      textura = await imagenAPNG(o.material.map.image);
    }
    mallas.push({ pos, idx, col, uv, textura: null, nombre: "modelo", origen: "glb" });
  }
  if (!mallas.length) throw new Error("El glTF no trae mallas");
  const m = unir(mallas);
  if (m.uv && textura) m.textura = textura; else m.uv = null;
  // Escala: si mide menos de 2 m de lado, viene en metros → mm
  let max = 0; for (let i = 0; i < m.pos.length; i++) max = Math.max(max, Math.abs(m.pos[i]));
  if (max < 2) for (let i = 0; i < m.pos.length; i++) m.pos[i] *= 1000;
  yAz(m.pos);
  m.nombre = principal.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
  m.archivo = principal.split(/[\\/]/).pop();
  m.origen = "glb";
  return m;
}

function listaMallas(raiz) { const r = []; raiz.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) r.push(o); }); return r; }

async function imagenAPNG(img) {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext("2d").drawImage(img, 0, 0);
  const b = await c.convertToBlob({ type: "image/png" });
  return { datos: new Uint8Array(await b.arrayBuffer()), tipo: "image/png", nombre: "textura.png" };
}

// malla → objeto de three listo para exportar (Y arriba). unidad: mm por unidad del archivo
// (glTF va en metros: 1000; FBX en centímetros: 10, que es lo que assimp declara)
async function aObjeto(m, { color = "auto", unidad = 1000 } = {}) {
  const g = new THREE.BufferGeometry();
  const pos = zAy(m.pos.slice());
  for (let i = 0; i < pos.length; i++) pos[i] /= unidad;
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
  const conTex = (color === "auto" || color === "textura") && m.uv && m.textura;
  const conCol = !conTex && (color === "auto" || color === "vertice") && m.col;
  if (conTex) {
    const uv = new Float32Array(m.uv.length);
    for (let i = 0; i < uv.length; i += 2) { uv[i] = m.uv[i]; uv[i + 1] = 1 - m.uv[i + 1]; }
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const bmp = await createImageBitmap(new Blob([m.textura.datos], { type: m.textura.tipo }));
    const lienzo = document.createElement("canvas"); lienzo.width = bmp.width; lienzo.height = bmp.height;
    lienzo.getContext("2d").drawImage(bmp, 0, 0);
    const t = new THREE.CanvasTexture(lienzo); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
    mat.map = t;
  } else if (conCol) {
    g.setAttribute("color", new THREE.BufferAttribute(m.col, 4, true));
    mat.vertexColors = true;
  } else mat.color.set(0xb8bcc2);
  const obj = new THREE.Mesh(g, mat);
  obj.name = m.nombre;
  return obj;
}

export async function escribirGLB(m, opciones = {}) {
  const obj = await aObjeto(m, opciones);
  const r = await new GLTFExporter().parseAsync(obj, { binary: true, maxTextureSize: 8192 });
  return { nombre: `${m.nombre}.glb`, datos: new Uint8Array(r) };
}

// ---------------- FBX con assimp ----------------
let assimp = null;
const RUTA_ASSIMP = new URL("../../../shared/vendor/assimpjs/", import.meta.url).href;
async function cargarAssimp() {
  if (assimp) return assimp;
  if (!self.assimpjs) {
    await new Promise((ok, mal) => {
      const s = document.createElement("script"); s.src = RUTA_ASSIMP + "assimpjs.js";
      s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar assimp")); document.head.appendChild(s);
    });
  }
  assimp = await self.assimpjs({ locateFile: (f) => RUTA_ASSIMP + f });
  return assimp;
}

export async function escribirFBX(m, opciones = {}) {
  const [ajs, glb] = await Promise.all([cargarAssimp(), escribirGLB(m, { ...opciones, unidad: 10 })]);
  const lista = new ajs.FileList();
  lista.AddFile("modelo.glb", glb.datos);
  const r = ajs.ConvertFileList(lista, "fbx");
  if (!r.IsSuccess() || r.FileCount() === 0) throw new Error(`assimp no pudo convertir a FBX (${r.GetErrorCode()})`);
  const archivos = [];
  for (let i = 0; i < r.FileCount(); i++) {
    const f = r.GetFile(i);
    archivos.push({ nombre: i === 0 ? `${m.nombre}.fbx` : f.GetPath().split(/[\\/]/).pop(), datos: new Uint8Array(f.GetContent()) });
  }
  // Con textura, la imagen va al lado (el FBX la referencia por nombre)
  if (m.textura && (opciones.color === "textura" || opciones.color === "auto")) archivos.push({ nombre: m.textura.nombre || "textura.png", datos: m.textura.datos });
  return archivos;
}
