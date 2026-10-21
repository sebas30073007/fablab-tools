// manos.js - manos 3D para los clips del tutorial.
//
// Modelo: perfil «generic-hand» de WebXR Input Profiles (MIT, vendor/manos/LICENSE.md), 25 articulaciones
// con los nombres de WebXR. En el .glb los huesos vienen sueltos (el navegador de RV les da a cada uno su
// pose); aquí se encadenan muñeca → metacarpo → falanges para que doblar un hueso arrastre a los siguientes.
//
// Marco de cada articulación (WebXR): −Z a lo largo del hueso hacia la punta, +Y hacia el dorso.
// Doblar = girar sobre la X local; abrir los dedos = girar sobre la Y local.
//
// Marco de la mano (Mano.raiz): con rotación cero la palma mira abajo y los dedos apuntan a −Z (hacia
// el fondo de la máquina, como cuando la persona mete la mano desde el frente). Unidades: mm.
//
// Contacto (con contacto.js): la piel son los 1360 vértices del modelo, calculados en el mundo con sus
// huesos. ajustar() abre cada dedo hasta que no atraviese nada y cierra los que agarran hasta tocar.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as clonarConHuesos } from "three/addons/utils/SkeletonUtils.js";
import { Obstaculos } from "./contacto.js";

const DEDOS = {
  pulgar: ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  indice: ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
  medio: ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
  anular: ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
  menique: ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"],
};
const NOMBRES = Object.keys(DEDOS);
const ABRIR = { indice: 1, medio: 0, anular: -1, menique: -2 };   // reparto de «abrir» entre los dedos

// Poses en grados: por dedo, cuánto se dobla cada articulación (de la base a la punta). «abrir»: separación.
// Pulgar: [girar el metacarpo hacia la palma, doblar el metacarpo, doblar la base, doblar la punta, rodar el
// metacarpo sobre su eje (opcional; es lo que lo opone al índice)].
// Las poses con «alcanzar» no fijan el pulgar a mano: Mano.crear lo resuelve para que su punta quede a
// «holgura» mm del hueso indicado (lo que se sostiene en la pinza mide eso).
export const POSES = {
  abierta: { pulgar: [0, 0, 0, 0], indice: [0, 0, 0], medio: [0, 0, 0], anular: [0, 0, 0], menique: [0, 0, 0], abrir: 4 },
  plana: { pulgar: [8, 0, 4, 4], indice: [2, 2, 1], medio: [2, 2, 1], anular: [3, 3, 2], menique: [4, 4, 2], abrir: 1 },
  relajada: { pulgar: [10, 5, 10, 10], indice: [12, 18, 10], medio: [16, 22, 12], anular: [20, 26, 14], menique: [24, 30, 16], abrir: 2 },
  apuntar: { indice: [0, 4, 2], medio: [80, 95, 50], anular: [85, 95, 50], menique: [88, 95, 50], abrir: 0,
    alcanzar: ["middle-finger-phalanx-intermediate", 9] },
  presionar: { indice: [18, 12, 4], medio: [80, 95, 50], anular: [85, 95, 50], menique: [88, 95, 50], abrir: 0,
    alcanzar: ["middle-finger-phalanx-intermediate", 9] },
  // Para sostener algo de lado (tarjeta, clavija, caimán): el índice casi recto y el pulgar debajo de su yema
  sostener: { indice: [16, 12, 6], medio: [30, 36, 20], anular: [44, 54, 30], menique: [54, 64, 34], abrir: 0,
    alcanzar: ["index-finger-tip", 20] },
  pinzaAbierta: { indice: [30, 25, 10], medio: [45, 50, 25], anular: [60, 70, 35], menique: [70, 80, 40], abrir: 0,
    alcanzar: ["index-finger-tip", 30] },
  pinza: { indice: [40, 35, 18], medio: [55, 60, 30], anular: [65, 75, 40], menique: [72, 85, 45], abrir: 0,
    alcanzar: ["index-finger-tip", 12] },
  apretar: { indice: [44, 42, 22], medio: [60, 70, 35], anular: [68, 80, 42], menique: [74, 88, 46], abrir: 0,
    alcanzar: ["index-finger-tip", 8] },
  puno: { indice: [85, 95, 55], medio: [88, 95, 55], anular: [88, 95, 55], menique: [88, 95, 55], abrir: 0,
    alcanzar: ["middle-finger-phalanx-intermediate", 10] },
};

export function mezclarPoses(a, b, t) {
  const r = { abrir: a.abrir + (b.abrir - a.abrir) * t };
  for (const d of NOMBRES) { const n = Math.max(a[d].length, b[d].length); r[d] = Array.from({ length: n }, (_, i) => (a[d][i] ?? 0) + ((b[d][i] ?? 0) - (a[d][i] ?? 0)) * t); }
  const m = t < 0.5 ? a : b, o = m === a ? b : a;
  r.cierre = m.cierre ?? o.cierre; r.abierto = m.abierto ?? o.abierto;
  return r;
}
const mezclar = (a, b, t) => Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + ((b[i] ?? 0) - (a[i] ?? 0)) * t);

const cache = {};
function cargarGlb(lado, base) {
  const url = `${base}${lado === "izq" ? "left" : "right"}.glb`;
  cache[url] ??= new GLTFLoader().loadAsync(url);
  return cache[url];
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();

export class Mano {
  // lado: "der" | "izq"; base: carpeta de los .glb
  static async crear(lado = "der", { base = "../shared/vendor/manos/", color = 0xe8e2dc } = {}) {
    const gltf = await cargarGlb(lado, base);
    const mano = new Mano(clonarConHuesos(gltf.scene), lado, color);
    // El pulgar de las poses con «alcanzar» se resuelve una vez y vale para las dos manos (espejo)
    for (const pose of Object.values(POSES)) if (!pose.pulgar) pose.pulgar = mano.resolverPulgar(pose);
    mano.ponerPose(POSES.relajada);
    return mano;
  }

  // Yema del índice: el punto del eje del dedo bajo la yema y hacia dónde mira (lado de la palma)
  yemaIndice(p = new THREE.Vector3(), n = new THREE.Vector3()) {
    const d = this.huesos["index-finger-phalanx-distal"], t = this.huesos["index-finger-tip"];
    d.getWorldPosition(p).lerp(t.getWorldPosition(_c), 0.6);
    n.set(0, -1, 0).applyQuaternion(d.getWorldQuaternion(new THREE.Quaternion()));
    return { p, n };
  }

  // Busca el pulgar (rejilla gruesa y luego fina). Con pose.alcanzar = ["index-finger-tip", h] la punta del pulgar
  // queda enfrente de la yema del índice, a h mm (entre los ejes de los dos dedos: lo que se sostiene mide h − 12,
  // por la piel de los dos) y con su yema mirando a la del índice; con otro hueso, a h mm de ese hueso.
  // Para oponerse, el pulgar también gira sobre su eje (5.º valor).
  resolverPulgar(pose) {
    const [hueso, holgura] = pose.alcanzar, punta = this.huesos["thumb-tip"], meta = this.huesos[hueso], dist = this.huesos["thumb-phalanx-distal"];
    const opuesto = hueso === "index-finger-tip";
    const p0 = this.raiz.position.clone(), q0 = this.raiz.quaternion.clone(), pose0 = this.pose;
    this.raiz.position.set(0, 0, 0); this.raiz.quaternion.identity();
    const yp = new THREE.Vector3(), yn = new THREE.Vector3(), tn = new THREE.Vector3(), q = new THREE.Quaternion();
    const costo = (p) => {
      this.ponerPose({ ...pose, pulgar: p });
      this.raiz.updateMatrixWorld(true);
      const torsion = 0.02 * (Math.abs(p[0]) + Math.abs(p[1]) + p[2] + p[3] + Math.abs(p[4]));   // que no se tuerza de más
      if (!opuesto) return Math.abs(punta.getWorldPosition(_a).distanceTo(meta.getWorldPosition(_b)) - holgura) + torsion;
      this.yemaIndice(yp, yn);
      const d = punta.getWorldPosition(_a).distanceTo(_b.copy(yp).addScaledVector(yn, holgura));
      tn.set(0, -1, 0).applyQuaternion(dist.getWorldQuaternion(q));
      return d + 12 * (1 + tn.dot(yn)) + torsion;
    };
    let mejor = [0, 0, 0, 0, 0], cm = Infinity;
    const probar = (rangos) => {
      const [A, B, C, D, E] = rangos;
      for (const a of A) for (const b of B) for (const c of C) for (const d of D) for (const e of E) {
        const k = costo([a, b, c, d, e]); if (k < cm) { cm = k; mejor = [a, b, c, d, e]; }
      }
    };
    const paso = (de, a, d) => { const r = []; for (let v = de; v <= a + 1e-9; v += d) r.push(v); return r; };
    if (opuesto) probar([paso(-60, 60, 20), paso(-30, 60, 15), paso(0, 70, 17.5), paso(0, 60, 30), paso(-80, 80, 20)]);
    else probar([paso(-60, 60, 10), paso(-30, 60, 10), paso(0, 70, 10), paso(0, 60, 15), [0]]);
    const c0 = [...mejor];
    if (opuesto) probar(c0.map((v, i) => paso(v - 10, v + 10, 5)));
    else probar(c0.map((v, i) => (i === 4 ? [0] : paso(v - (i === 3 ? 10 : 6), v + (i === 3 ? 10 : 6), i === 3 ? 4 : 2))));
    this.raiz.position.copy(p0); this.raiz.quaternion.copy(q0); this.ponerPose(pose0); this.raiz.updateMatrixWorld(true);
    return mejor;
  }

  // Pose de pinza para sostener algo de «ancho» mm entre el pulgar y el índice (se guarda por ancho)
  poseAgarre(ancho, base = "pinza") {
    const k = `${base}|${Math.round(ancho)}`;
    this._agarres ??= {};
    if (!this._agarres[k]) {
      // entre los ejes de los dedos: el ancho, 12 de piel y 4 de holgura (luego ajustar() cierra hasta tocar)
      const p = { ...POSES[base], alcanzar: ["index-finger-tip", Math.round(ancho) + 16] };
      p.pulgar = this.resolverPulgar(p);
      p.cierre = { pulgar: this.resolverPulgar({ ...POSES[base], alcanzar: ["index-finger-tip", 4] }) };
      p.abierto = { pulgar: this.resolverPulgar({ ...POSES[base], alcanzar: ["index-finger-tip", Math.round(ancho) + 45] }) };
      this._agarres[k] = p;
    }
    return this._agarres[k];
  }

  constructor(escena, lado, color) {
    this.lado = lado;
    this.raiz = new THREE.Group();                  // lo que se mueve y gira
    const escala = new THREE.Group(); escala.scale.setScalar(1000);   // el .glb está en metros
    const alinear = new THREE.Group();

    const huesos = {};
    let malla = null;
    escena.traverse((o) => {
      if (o.isBone) huesos[o.name] = o;
      if (o.isSkinnedMesh) {
        malla = o;
        o.material = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
        o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      }
    });
    escena.updateMatrixWorld(true);
    // Encadenar sin mover nada (attach conserva la pose del mundo)
    const muneca = huesos.wrist;
    for (const cadena of Object.values(DEDOS)) {
      let padre = muneca;
      for (const n of cadena) { padre.attach(huesos[n]); padre = huesos[n]; }
    }
    // La muñeca al origen de la mano, con su marco alineado al de la mano (en metros: la escala va después)
    const q = muneca.getWorldQuaternion(new THREE.Quaternion()).invert();
    const p = muneca.getWorldPosition(new THREE.Vector3()).applyQuaternion(q).negate();
    alinear.quaternion.copy(q); alinear.position.copy(p);
    this.raiz.add(escala); escala.add(alinear); alinear.add(escena);
    // Hasta dónde llega el modelo hacia el antebrazo (+Z), en mm
    const pos = malla.geometry.attributes.position, v = new THREE.Vector3();
    let zMax = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(malla.matrixWorld).applyQuaternion(q).add(p);
      zMax = Math.max(zMax, v.z * 1000);
    }
    // Manga: tapa el corte de la muñeca del modelo
    const largo = 170;
    const manga = new THREE.Mesh(new THREE.CylinderGeometry(26, 29, largo, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3f46, roughness: 0.8, side: THREE.DoubleSide }));
    manga.rotation.x = Math.PI / 2; manga.scale.set(1.12, 1, 0.82); manga.position.z = zMax - 14 + largo / 2; manga.castShadow = true;
    this.raiz.add(manga);
    this.manga = manga;
    this.zMuneca = zMax;

    this.huesos = huesos;
    this.malla = malla;
    this.reposo = Object.fromEntries(Object.entries(huesos).map(([n, h]) => [n, h.quaternion.clone()]));
    this._prepararPiel();
    this.pose = POSES.relajada;
    this.ponerPose(this.pose);
  }

  ponerPose(pose) {
    this.pose = pose;
    for (const d of NOMBRES) this.ponerDedo(d, pose[d], pose.abrir);
  }

  ponerDedo(dedo, v, abrir = 0) {
    if (!v) return;                                   // pulgar aún sin resolver (durante resolverPulgar no pasa)
    const g = THREE.MathUtils.degToRad, qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    const lado = this.lado === "izq" ? -1 : 1, cadena = DEDOS[dedo];
    if (dedo === "pulgar") {
      const [hacia, meta, base, punta, rodar = 0] = v;
      this.girar(cadena[0], qy.setFromAxisAngle(Y, g(-hacia) * lado), qx.setFromAxisAngle(X, g(-meta)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), g(rodar) * lado));
      this.girar(cadena[1], qx.setFromAxisAngle(X, g(-base)));
      this.girar(cadena[2], qx.setFromAxisAngle(X, g(-punta)));
    } else {
      this.girar(cadena[1], qy.setFromAxisAngle(Y, g(abrir * ABRIR[dedo]) * lado), qx.setFromAxisAngle(X, g(-v[0])));
      this.girar(cadena[2], qx.setFromAxisAngle(X, g(-v[1])));
      this.girar(cadena[3], qx.setFromAxisAngle(X, g(-v[2])));
    }
  }

  girar(nombre, ...qs) {
    const h = this.huesos[nombre];
    h.quaternion.copy(this.reposo[nombre]);
    for (const q of qs) h.quaternion.multiply(q);
  }

  // Punto de la mano en el mundo: un hueso («index-finger-tip»…) o «pinza» (entre pulgar e índice)
  punto(ancla, v = new THREE.Vector3()) {
    this.raiz.updateMatrixWorld(true);
    if (ancla === "pinza") {
      const a = this.huesos["thumb-tip"].getWorldPosition(new THREE.Vector3());
      return this.huesos["index-finger-tip"].getWorldPosition(v).add(a).multiplyScalar(0.5);
    }
    return this.huesos[ancla].getWorldPosition(v);
  }

  // Coloca la mano para que «ancla» quede en «destino» con la orientación q
  colocar(destino, q, ancla = "index-finger-tip") {
    this.raiz.quaternion.copy(q);
    this.raiz.position.set(0, 0, 0);
    const p = this.punto(ancla);
    this.raiz.position.copy(destino).sub(p);
    this.raiz.updateMatrixWorld(true);
  }

  // Dónde poner la raíz para sostener algo con la pinza de «pose»: el punto medio entre la punta del pulgar y
  // la yema del índice en «centro», la línea pulgar→índice a lo largo de «eje» y la palma mirando hacia «palma».
  // En esta mano la pinza queda bajo la palma y su línea va casi a lo largo de los dedos: el pulgar atrás, la
  // yema del índice adelante. Así, el antebrazo sale del lado del pulgar (≈ −eje).
  transformarAgarre({ centro, eje, palma }, pose) {
    const p0 = this.raiz.position.clone(), q0 = this.raiz.quaternion.clone(), pose0 = this.pose;
    this.raiz.position.set(0, 0, 0); this.raiz.quaternion.identity(); this.ponerPose(pose); this.raiz.updateMatrixWorld(true);
    const pt = this.huesos["thumb-tip"].getWorldPosition(new THREE.Vector3()), pi = this.yemaIndice().p;
    const m = pt.clone().add(pi).multiplyScalar(0.5);
    const a = pi.clone().sub(pt).normalize(), w = new THREE.Vector3(0, -1, 0);
    w.addScaledVector(a, -w.dot(a)).normalize();
    const A = eje.clone().normalize(), W = palma.clone();
    W.addScaledVector(A, -W.dot(A)).normalize();
    const Mh = new THREE.Matrix4().makeBasis(a, w, _c.crossVectors(a, w));
    const Mo = new THREE.Matrix4().makeBasis(A, W, new THREE.Vector3().crossVectors(A, W));
    const q = new THREE.Quaternion().setFromRotationMatrix(Mo.multiply(Mh.transpose()));
    const pos = centro.clone().sub(m.applyQuaternion(q));
    this.raiz.position.copy(p0); this.raiz.quaternion.copy(q0); this.ponerPose(pose0); this.raiz.updateMatrixWorld(true);
    return { pos, q };
  }

  // ---------------- Piel y contacto ----------------
  _prepararPiel() {
    const g = this.malla.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const n = pos.count, huesos = this.malla.skeleton.bones;
    this._n = n;
    this._base = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(this.malla.bindMatrix); this._base.set([v.x, v.y, v.z], i * 3); }
    // Índices y pesos como números (getX… desnormaliza si el .glb los guarda en bytes)
    this._si = new Uint16Array(n * 4); this._sw = new Float32Array(n * 4);
    const get = ["getX", "getY", "getZ", "getW"];
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) { this._si[i * 4 + j] = si[get[j]](i); this._sw[i * 4 + j] = sw[get[j]](i); }
    // Cada vértice es del dedo de su hueso con más peso (los metacarpos, salvo el del pulgar, son palma)
    const dedoDeHueso = huesos.map((h) => {
      const d = NOMBRES.find((k) => DEDOS[k].includes(h.name));
      return d && (d === "pulgar" || !h.name.endsWith("metacarpal")) ? d : "palma";
    });
    const grupos = { palma: [] }; for (const d of NOMBRES) grupos[d] = [];
    for (let i = 0; i < n; i++) {
      let k = 0; for (let j = 1; j < 4; j++) if (this._sw[i * 4 + j] > this._sw[i * 4 + k]) k = j;
      grupos[dedoDeHueso[this._si[i * 4 + k]]].push(i);
    }
    this._vert = Object.fromEntries(Object.entries(grupos).map(([d, l]) => [d, Uint16Array.from(l)]));
    this._vert.todo = Uint16Array.from({ length: n }, (_, i) => i);
    this._salida = {};
    this._mats = huesos.map(() => new Float64Array(16));
  }

  // Posiciones en el mundo de los vértices de un dedo («pulgar»…, «palma» o «todo»): Float32Array x,y,z…
  piel(dedo = "todo") {
    const huesos = this.malla.skeleton.bones, inv = this.malla.skeleton.boneInverses;
    _m.multiplyMatrices(this.malla.matrixWorld, this.malla.bindMatrixInverse);
    const M = new THREE.Matrix4();
    for (let k = 0; k < huesos.length; k++) { M.multiplyMatrices(_m, huesos[k].matrixWorld).multiply(inv[k]); this._mats[k].set(M.elements); }
    const ids = this._vert[dedo], out = (this._salida[dedo] ??= new Float32Array(ids.length * 3));
    const B = this._base, S = this._si, W = this._sw, Ms = this._mats;
    for (let t = 0; t < ids.length; t++) {
      const i = ids[t], x = B[i * 3], y = B[i * 3 + 1], z = B[i * 3 + 2];
      let rx = 0, ry = 0, rz = 0;
      for (let j = 0; j < 4; j++) {
        const w = W[i * 4 + j]; if (!w) continue;
        const e = Ms[S[i * 4 + j]];
        rx += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
        ry += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
        rz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      }
      out[t * 3] = rx; out[t * 3 + 1] = ry; out[t * 3 + 2] = rz;
    }
    return out;
  }

  // Puntos del eje de la manga (para medir si el antebrazo atraviesa algo) y su radio
  ejeManga() {
    const pts = new Float32Array(7 * 3), p = new THREE.Vector3();
    for (let i = 0; i < 7; i++) {
      p.set(0, -85 + 25 + (i * (170 - 50)) / 6, 0).applyMatrix4(this.manga.matrixWorld);   // sin las puntas
      pts.set([p.x, p.y, p.z], i * 3);
    }
    return { pts, radio: 24 };
  }

  // Ajusta los dedos a la escena. Con cierre = 0 cada dedo que atraviesa algo se abre (hacia «plana») lo
  // justo para no hacerlo; con cierre > 0 los dedos de «dedosCierre» además se cierran hacia su pose de
  // cierre hasta tocar (cierre = 1: hasta el contacto; entre 0 y 1, la fracción del recorrido).
  ajustar(obs, { cierre = 0, dedosCierre = ["pulgar", "indice", "medio"], tol = 0.35 } = {}) {
    const pose = this.pose, final = { abrir: pose.abrir };
    this.raiz.updateMatrixWorld(true);
    for (const d of NOMBRES) {
      const cadena = DEDOS[d];
      const base = this.huesos[cadena[d === "pulgar" ? 0 : 1]].getWorldPosition(_a);
      const lista = obs.cerca(base.x, base.y, base.z, d === "pulgar" ? 75 : 95);
      let v = pose[d];
      if (!lista.length) { final[d] = v; continue; }
      const pen = (vals, corte) => { this.ponerDedo(d, vals, pose.abrir); this.raiz.updateMatrixWorld(true); return Obstaculos.penetracion(this.piel(d), lista, corte).pen; };
      // 1) abrir hasta no atravesar
      if (pen(v, tol) > tol) {
        const abierto = d === "pulgar" ? (pose.abierto?.pulgar ?? POSES.abierta.pulgar) : POSES.plana[d];
        let mejor = v, menor = Infinity, ok = false;
        for (let s = 0.15; s <= 1.0001; s += 0.17) {
          const c = mezclar(v, abierto, s), p = pen(c, Infinity);
          if (p <= tol) { mejor = c; ok = true; break; }
          if (p < menor) { menor = p; mejor = c; }
        }
        v = mejor;
        if (ok) {     // afinar entre la pose pedida y la primera que no atraviesa
          let lo = 0, hi = 1, a0 = pose[d], a1 = v;
          for (let k = 0; k < 4; k++) { const m = (lo + hi) / 2, c = mezclar(a0, a1, m); if (pen(c, tol) <= tol) hi = m; else lo = m; }
          v = mezclar(a0, a1, hi);
        }
      }
      // 2) cerrar hasta tocar
      if (cierre > 0 && dedosCierre.includes(d)) {
        const meta = d === "pulgar" ? (pose.cierre?.pulgar ?? POSES.apretar.pulgar) : v.map((x, i) => Math.min(x + [28, 28, 18][i], 100));
        let lo = 0, hi = 1;
        if (pen(meta, tol) > tol) {
          for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (pen(mezclar(v, meta, m), tol) <= tol) lo = m; else hi = m; }
        } else lo = 1;
        v = mezclar(v, meta, lo * cierre);
      }
      final[d] = v;
      this.ponerDedo(d, v, pose.abrir);
    }
    this.pose = final;
    this.raiz.updateMatrixWorld(true);
  }
}

// ---------------- Línea de tiempo ----------------
// Cuadros clave de una mano: { t, pos: [x, y, z], rot: [x, y, z] en grados (orden YXZ), pose: "nombre" | objeto }
// Entre cuadros: posición y pose con suavizado, giro por slerp. «ancla» es fija para toda la pista.

const suave = (x) => x * x * (3 - 2 * x);
export const qDe = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.map(THREE.MathUtils.degToRad), "YXZ"));

export function tramo(kf, t) {
  if (t <= kf[0].t) return [kf[0], kf[0], 0];
  for (let i = 1; i < kf.length; i++) if (t <= kf[i].t) return [kf[i - 1], kf[i], suave((t - kf[i - 1].t) / (kf[i].t - kf[i - 1].t))];
  const u = kf[kf.length - 1]; return [u, u, 0];
}

export function animarMano(mano, kf, t, ancla) {
  const [a, b, u] = tramo(kf, t);
  const pa = typeof a.pose === "string" ? POSES[a.pose] : a.pose, pb = typeof b.pose === "string" ? POSES[b.pose] : b.pose;
  mano.ponerPose(mezclarPoses(pa, pb, u));
  const pos = new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), u);
  const q = qDe(a.rot).slerp(qDe(b.rot), u);
  mano.colocar(pos, q, ancla);
}
