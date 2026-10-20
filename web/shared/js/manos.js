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

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as clonarConHuesos } from "three/addons/utils/SkeletonUtils.js";

const DEDOS = {
  pulgar: ["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"],
  indice: ["index-finger-metacarpal", "index-finger-phalanx-proximal", "index-finger-phalanx-intermediate", "index-finger-phalanx-distal", "index-finger-tip"],
  medio: ["middle-finger-metacarpal", "middle-finger-phalanx-proximal", "middle-finger-phalanx-intermediate", "middle-finger-phalanx-distal", "middle-finger-tip"],
  anular: ["ring-finger-metacarpal", "ring-finger-phalanx-proximal", "ring-finger-phalanx-intermediate", "ring-finger-phalanx-distal", "ring-finger-tip"],
  menique: ["pinky-finger-metacarpal", "pinky-finger-phalanx-proximal", "pinky-finger-phalanx-intermediate", "pinky-finger-phalanx-distal", "pinky-finger-tip"],
};
const ABRIR = { indice: 1, medio: 0, anular: -1, menique: -2 };   // reparto de «abrir» entre los dedos

// Poses en grados: por dedo, cuánto se dobla cada articulación (de la base a la punta). «abrir»: separación.
// Pulgar: [girar el metacarpo hacia la palma, doblar el metacarpo, doblar la base, doblar la punta].
// Las poses con «alcanzar» no fijan el pulgar a mano: Mano.crear lo resuelve para que su punta quede a
// «holgura» mm del hueso indicado (lo que se sostiene en la pinza mide eso).
export const POSES = {
  abierta: { pulgar: [0, 0, 0, 0], indice: [0, 0, 0], medio: [0, 0, 0], anular: [0, 0, 0], menique: [0, 0, 0], abrir: 4 },
  relajada: { pulgar: [10, 5, 10, 10], indice: [12, 18, 10], medio: [16, 22, 12], anular: [20, 26, 14], menique: [24, 30, 16], abrir: 2 },
  apuntar: { indice: [0, 4, 2], medio: [80, 95, 50], anular: [85, 95, 50], menique: [88, 95, 50], abrir: 0,
    alcanzar: ["middle-finger-phalanx-intermediate", 9] },
  presionar: { indice: [18, 12, 4], medio: [80, 95, 50], anular: [85, 95, 50], menique: [88, 95, 50], abrir: 0,
    alcanzar: ["middle-finger-phalanx-intermediate", 9] },
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
  for (const d of Object.keys(DEDOS)) r[d] = a[d].map((v, i) => v + (b[d][i] - v) * t);
  return r;
}

const cache = {};
function cargarGlb(lado, base) {
  const url = `${base}${lado === "izq" ? "left" : "right"}.glb`;
  cache[url] ??= new GLTFLoader().loadAsync(url);
  return cache[url];
}

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

  // Busca el pulgar que deja su punta a «holgura» mm del hueso de pose.alcanzar (rejilla gruesa y luego fina)
  resolverPulgar(pose) {
    const [hueso, holgura] = pose.alcanzar, punta = this.huesos["thumb-tip"], meta = this.huesos[hueso];
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.raiz.position.set(0, 0, 0); this.raiz.quaternion.identity();
    const costo = (p) => {
      this.ponerPose({ ...pose, pulgar: p });
      this.raiz.updateMatrixWorld(true);
      const d = punta.getWorldPosition(a).distanceTo(meta.getWorldPosition(b));
      return Math.abs(d - holgura) + 0.02 * (Math.abs(p[0]) + Math.abs(p[1]) + p[2] + p[3]);   // y que no se tuerza de más
    };
    let mejor = [0, 0, 0, 0], cm = Infinity;
    const probar = (rangos) => {
      const [A, B, C, D] = rangos;
      for (const p0 of A) for (const p1 of B) for (const p2 of C) for (const p3 of D) {
        const c = costo([p0, p1, p2, p3]); if (c < cm) { cm = c; mejor = [p0, p1, p2, p3]; }
      }
    };
    const paso = (de, a, d) => { const r = []; for (let v = de; v <= a + 1e-9; v += d) r.push(v); return r; };
    probar([paso(-60, 60, 10), paso(-30, 60, 10), paso(0, 70, 10), paso(0, 60, 15)]);
    const c0 = [...mejor];
    probar(c0.map((v, i) => paso(v - (i === 3 ? 10 : 6), v + (i === 3 ? 10 : 6), i === 3 ? 4 : 2)));
    return mejor;
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
    this.zMuneca = zMax;

    this.huesos = huesos;
    this.reposo = Object.fromEntries(Object.entries(huesos).map(([n, h]) => [n, h.quaternion.clone()]));
    this.pose = POSES.relajada;
    this.ponerPose(this.pose);
  }

  ponerPose(pose) {
    this.pose = pose;
    const g = THREE.MathUtils.degToRad, qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
    const lado = this.lado === "izq" ? -1 : 1;
    for (const [dedo, cadena] of Object.entries(DEDOS)) {
      const v = pose[dedo];
      if (dedo === "pulgar") {
        if (!v) continue;                              // aún sin resolver (durante resolverPulgar no pasa)
        const [hacia, meta, base, punta] = v;
        this.girar(cadena[0], qy.setFromAxisAngle(Y, g(-hacia) * lado), qx.setFromAxisAngle(X, g(-meta)));
        this.girar(cadena[1], qx.setFromAxisAngle(X, g(-base)));
        this.girar(cadena[2], qx.setFromAxisAngle(X, g(-punta)));
      } else {
        this.girar(cadena[1], qy.setFromAxisAngle(Y, g(pose.abrir * ABRIR[dedo]) * lado), qx.setFromAxisAngle(X, g(-v[0])));
        this.girar(cadena[2], qx.setFromAxisAngle(X, g(-v[1])));
        this.girar(cadena[3], qx.setFromAxisAngle(X, g(-v[2])));
      }
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
}

// ---------------- Línea de tiempo ----------------
// Cuadros clave de una mano: { t, pos: [x, y, z], rot: [x, y, z] en grados (orden YXZ), pose: "nombre" | objeto }
// Entre cuadros: posición y pose con suavizado, giro por slerp. «ancla» es fija para toda la pista.

const suave = (x) => x * x * (3 - 2 * x);
const qDe = (r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.map(THREE.MathUtils.degToRad), "YXZ"));

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
