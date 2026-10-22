// demos.js - la animación que va arriba de cada hoja de herramienta: el búho haciendo lo que hace la
// herramienta, en bucle, como un GIF (pero dibujado en vivo). Un solo renderer para todas las hojas.
// Las versiones «antes» y «después» salen de las mismas funciones del visor (ops/editar.js) sobre
// un búho ligero (ejemplos/buho-mini.3mf, 12 mil triángulos).
//   const d = await demo(contenedor, "medidas"); …; d.parar();

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { leer3MF } from "./formatos/leer-3mf.js";
import { caja } from "./nucleo/malla.js";
import * as E from "./ops/editar.js";
import { bordes } from "./ops/topologia.js";

const PERIODO = 4.2;           // segundos por vuelta de la animación
const COBRE = 0xff6b35, ROJO = 0xe11d48, NARANJA = 0xea580c, AZUL = 0x2563eb;
let base = null, R = null, entorno = null;
const cache = {};

async function buho() {
  if (base) return base;
  const r = await fetch(new URL("../ejemplos/buho-mini.3mf", import.meta.url));
  const m = leer3MF(new Uint8Array(await r.arrayBuffer()));
  const c = caja(m);
  for (let i = 0; i < m.pos.length; i += 3) { m.pos[i] -= c.centro[0]; m.pos[i + 1] -= c.centro[1]; m.pos[i + 2] -= c.min[2]; }
  base = m; return m;
}
function geometria(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(m.pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  if (m.col) g.setAttribute("color", new THREE.BufferAttribute(m.col, 4, true));
  g.computeVertexNormals(); g.computeBoundingBox();
  return g;
}
const suave = (x) => x * x * (3 - 2 * x);
// 0 → 1 → 0 con pausas en los extremos
const vaiven = (s) => suave(Math.min(1, Math.max(0, s < 0.5 ? (s - 0.1) / 0.3 : (0.9 - s) / 0.3)));
// 0 → 1 y se queda (para «antes → después»)
const paso = (s, a, b) => suave(Math.min(1, Math.max(0, (s - a) / (b - a))));

export async function demo(cont, id) {
  const m = await buho();
  if (!R) {
    R = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    R.setPixelRatio(Math.min(devicePixelRatio, 2)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping;
    R.localClippingEnabled = true;
    entorno = new THREE.PMREMGenerator(R).fromScene(new RoomEnvironment(), 0.04).texture;
  }
  const w = cont.clientWidth || 360, h = Math.round(Math.min(200, w * 0.5));
  R.setSize(w, h);
  cont.appendChild(R.domElement);
  const s = new THREE.Scene(); s.background = new THREE.Color(0xeef0f3); s.environment = entorno; s.environmentIntensity = 0.9;
  const sol = new THREE.DirectionalLight(0xffffff, 1.2); sol.position.set(-60, 120, 90); s.add(sol);
  const t3 = caja(m).tam, alto = t3[2], lado = Math.max(...t3);
  const cam = new THREE.PerspectiveCamera(28, w / h, 1, 2000);
  const mirar = (dir, dist = 2.6, y = 0.45) => { cam.position.copy(new THREE.Vector3(...dir).normalize().multiplyScalar(lado * dist)).add(new THREE.Vector3(0, alto * y, 0)); cam.lookAt(0, alto * y, 0); };
  mirar([1, 0.55, 1.15]);
  const rej = new THREE.GridHelper(lado * 2.4, 12, 0xc3c8cf, 0xdde0e4); s.add(rej);
  const modelo = new THREE.Group(); modelo.rotation.x = -Math.PI / 2; s.add(modelo);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
  const malla = new THREE.Mesh(geometria(m), mat); modelo.add(malla);
  const extra = new THREE.Group(); modelo.add(extra);
  let anim = () => {};
  const centro = new THREE.Vector3(0, 0, alto / 2);

  switch (id) {
    case "girar": {
      const piv = new THREE.Group(); piv.position.copy(centro); modelo.add(piv); piv.attach(malla);
      [0xd63a2f, 0x15803d, 0x2563eb].forEach((c, i) => {
        const anillo = new THREE.Mesh(new THREE.TorusGeometry(lado * 0.62, lado * 0.008, 8, 96), new THREE.MeshBasicMaterial({ color: c }));
        if (i === 0) anillo.rotation.y = Math.PI / 2; else if (i === 1) anillo.rotation.x = Math.PI / 2;
        anillo.position.copy(centro); modelo.add(anillo);
      });
      anim = (q) => { piv.rotation.x = vaiven(q) * Math.PI / 2; };
      break;
    }
    case "medidas": {
      anim = (q) => { const k = 1 - 0.45 * vaiven(q); malla.scale.setScalar(k); };
      break;
    }
    case "cara": {
      const piv = new THREE.Group(); piv.position.copy(centro); modelo.add(piv); piv.attach(malla);
      anim = (q) => { const f = 1 - paso(q, 0.25, 0.7); piv.rotation.set(-0.8 * f, 0.5 * f, 0); piv.position.z = alto / 2 + alto * 0.35 * f; };
      break;
    }
    case "plano": {
      const pl = new THREE.Plane(new THREE.Vector3(0, -1, 0), alto);
      mat.clippingPlanes = [pl]; mat.side = THREE.FrontSide;
      const sec = new THREE.Mesh(malla.geometry, new THREE.MeshBasicMaterial({ color: COBRE, side: THREE.BackSide, clippingPlanes: [pl] })); modelo.add(sec);
      const vidrio = new THREE.Mesh(new THREE.PlaneGeometry(lado * 1.4, lado * 1.4), new THREE.MeshBasicMaterial({ color: AZUL, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
      modelo.add(vidrio);
      anim = (q) => { const z = alto * (1.05 - 0.6 * vaiven(q)); pl.constant = z; vidrio.position.z = z; };
      break;
    }
    case "caja": {
      const pls = [0, 1, 2, 3, 4, 5].map(() => new THREE.Plane());
      mat.clippingPlanes = pls; mat.side = THREE.FrontSide;
      const sec = new THREE.Mesh(malla.geometry, new THREE.MeshBasicMaterial({ color: COBRE, side: THREE.BackSide, clippingPlanes: pls })); modelo.add(sec);
      const ayuda = new THREE.Box3Helper(new THREE.Box3(), AZUL); extra.add(ayuda);
      const b0 = new THREE.Box3(new THREE.Vector3(-lado * 0.7, -lado * 0.7, -1), new THREE.Vector3(lado * 0.7, lado * 0.7, alto * 1.15));
      const b1 = new THREE.Box3(new THREE.Vector3(-t3[0] * 0.35, -t3[1] * 0.6, -1), new THREE.Vector3(t3[0] * 0.6, t3[1] * 0.6, alto * 0.62));
      anim = (q) => {
        const f = vaiven(q), b = new THREE.Box3(b0.min.clone().lerp(b1.min, f), b0.max.clone().lerp(b1.max, f));
        ayuda.box.copy(b);
        const M = modelo.matrixWorld;
        [[1, 0, 0, b.max.x], [-1, 0, 0, -b.min.x], [0, 1, 0, b.max.y], [0, -1, 0, -b.min.y], [0, 0, 1, b.max.z], [0, 0, -1, -b.min.z]].forEach(([x, y, z, d], i) => {
          pls[i].set(new THREE.Vector3(-x, -y, -z), d).applyMatrix4(M);
        });
      };
      break;
    }
    case "lazo": {
      // La cabeza se marca en rojo y se borra
      cache.lazo ||= (() => {
        const mask = new Uint8Array(m.idx.length / 3);
        for (let t = 0; t < mask.length; t++) { const v = m.idx[t * 3]; if (m.pos[v * 3 + 2] > alto * 0.66 && m.pos[v * 3] > -t3[0] * 0.1) mask[t] = 1; }
        const sel = new Uint32Array(mask.reduce((a, x) => a + x, 0) * 3); let k = 0;
        for (let t = 0; t < mask.length; t++) if (mask[t]) { sel[k++] = m.idx[t * 3]; sel[k++] = m.idx[t * 3 + 1]; sel[k++] = m.idx[t * 3 + 2]; }
        return { sel, resto: E.borrar(m, mask) };
      })();
      const gs = new THREE.BufferGeometry(); gs.setAttribute("position", malla.geometry.attributes.position); gs.setIndex(new THREE.BufferAttribute(cache.lazo.sel, 1));
      const roja = new THREE.Mesh(gs, new THREE.MeshBasicMaterial({ color: ROJO, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 })); extra.add(roja);
      const despues = new THREE.Mesh(geometria(cache.lazo.resto), mat); despues.visible = false; modelo.add(despues);
      // El trazo del lazo, dibujado sobre la imagen
      const capa = document.createElement("canvas"); capa.className = "demo__capa"; capa.width = w * 2; capa.height = h * 2; cont.appendChild(capa);
      const g = capa.getContext("2d");
      anim = (q) => {
        const dibujo = paso(q, 0.05, 0.35), rojo = paso(q, 0.35, 0.45), fuera = q > 0.6;
        g.clearRect(0, 0, capa.width, capa.height);
        if (q < 0.6) {
          g.save(); g.scale(2, 2); g.strokeStyle = "#e11d48"; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath();
          const cx = w * 0.52, cy = h * 0.28;
          for (let i = 0; i <= 60 * dibujo; i++) { const a = (i / 60) * Math.PI * 2; const x = cx + Math.cos(a) * w * 0.17, y = cy + Math.sin(a) * h * 0.2; i ? g.lineTo(x, y) : g.moveTo(x, y); }
          g.stroke(); g.restore();
        }
        roja.material.opacity = fuera ? 0 : rojo * 0.8;
        malla.visible = !fuera; despues.visible = fuera;
      };
      break;
    }
    case "islas": {
      const bolas = [[-0.75, -0.3, 0.1], [0.7, 0.4, 0.05], [0.55, -0.6, 0.35], [-0.5, 0.6, 0.6]].map(([x, y, z], i) => {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(lado * (0.06 + 0.02 * i), 1), new THREE.MeshStandardMaterial({ color: 0x6b7280, flatShading: true }));
        b.position.set(x * lado, y * lado, z * alto + lado * 0.06); extra.add(b); return b;
      });
      anim = (q) => {
        const rojo = paso(q, 0.25, 0.35), fuera = paso(q, 0.55, 0.7);
        for (const b of bolas) { b.material.color.setHex(rojo > 0.5 ? ROJO : 0x6b7280); b.scale.setScalar(Math.max(0.001, 1 - fuera)); }
      };
      break;
    }
    case "rellenar": {
      cache.rellenar ||= (() => {
        const corte = { n: [0, 0, -1], d: -alto * 0.12 };
        const abierto = E.cortar(m, { ...corte, tapar: false }), cerrado = E.cortar(m, { ...corte, tapar: true });
        return { abierto, cerrado, lazos: bordes(abierto).lazos };
      })();
      mirar([1, -0.55, 1.1], 2.4, 0.3);
      malla.geometry = geometria(cache.rellenar.abierto); mat.side = THREE.FrontSide;
      const cerrada = new THREE.Mesh(geometria(cache.rellenar.cerrado), mat); cerrada.visible = false; modelo.add(cerrada);
      const p = cache.rellenar.abierto.pos, v = [];
      for (const l of cache.rellenar.lazos) for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; v.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]); }
      const gl = new THREE.BufferGeometry(); gl.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      const borde = new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: NARANJA, depthTest: false })); borde.renderOrder = 5; extra.add(borde);
      rej.visible = false;
      anim = (q) => { const listo = q > 0.5 && q < 0.95; cerrada.visible = listo; malla.visible = !listo; borde.visible = !listo; };
      break;
    }
    case "reparar": {
      cache.reparar ||= (() => {
        const r = { ...m, idx: m.idx.slice() };
        for (let t = 0; t < r.idx.length; t += 3) if ((t / 3) % 7 < 2 && m.pos[r.idx[t] * 3 + 2] > alto * 0.3) { const x = r.idx[t + 1]; r.idx[t + 1] = r.idx[t + 2]; r.idx[t + 2] = x; }
        return r;
      })();
      const mal = new THREE.Mesh(geometria(cache.reparar), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.FrontSide })); modelo.add(mal);
      anim = (q) => { const listo = q > 0.5 && q < 0.95; mal.visible = !listo; malla.visible = listo; };
      break;
    }
    case "suavizar": {
      cache.suavizar ||= (() => {
        const r = { ...m, pos: m.pos.slice() };
        for (let i = 0; i < r.pos.length; i++) r.pos[i] += (Math.sin(i * 12.9898) * 43758.5453 % 1) * lado * 0.006;
        return { ruido: r, liso: E.suavizar(r, { pasadas: 6 }) };
      })();
      const gR = geometria(cache.suavizar.ruido), gL = geometria(cache.suavizar.liso);
      anim = (q) => { malla.geometry = q > 0.5 && q < 0.95 ? gL : gR; };
      mirar([0.7, 0.4, 1.2], 1.6, 0.7);
      break;
    }
    case "simplificar": {
      cache.simplificar ||= await E.simplificar(m, { meta: 1500 });
      const gA = malla.geometry, gB = geometria(cache.simplificar);
      const alambre = new THREE.Mesh(gA, new THREE.MeshBasicMaterial({ color: 0x1f2937, wireframe: true, transparent: true, opacity: 0.45 })); modelo.add(alambre);
      anim = (q) => { const g = q > 0.5 && q < 0.95 ? gB : gA; malla.geometry = g; alambre.geometry = g; };
      break;
    }
    case "color": {
      const gris = new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.6, side: THREE.DoubleSide });
      anim = (q) => { malla.material = q > 0.5 && q < 0.95 ? gris : mat; };
      break;
    }
  }

  let vivo = true;
  const t0 = performance.now();
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cuadro = (t) => {
    if (!vivo) return;
    const q = reducido ? 0.45 : ((t - t0) / 1000 / PERIODO) % 1;
    s.updateMatrixWorld(); anim(q);
    R.render(s, cam);
    if (!reducido) requestAnimationFrame(cuadro);
  };
  requestAnimationFrame(cuadro);
  return {
    parar() {
      vivo = false;
      cont.querySelector(".demo__capa")?.remove();
      if (R.domElement.parentElement === cont) cont.removeChild(R.domElement);
      s.traverse((o) => { if (o.geometry && o.geometry !== malla.geometry) o.geometry.dispose?.(); });
    },
  };
}
