// accesorios.js - lo que las manos usan en los clips: caimán, terminal de horquilla, llave Allen, llaves
// fijas, clavija USB-B, conector de la sonda, aspiradora y cables. Todo en mm, hecho con geometría propia.
//
// Cada pieza devuelve su grupo y, si se agarra, su «agarre» en coordenadas propias:
//   { centro, eje (del pulgar al índice), ancho (lo que mide entre los dedos) }

import * as THREE from "three";

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, ...o });
export const MAT = {
  acero: mat(0xc9ced4, { metalness: 0.92, roughness: 0.26 }),
  cromo: mat(0xdde1e5, { metalness: 0.96, roughness: 0.16 }),
  pavonado: mat(0x1b1c1f, { metalness: 0.75, roughness: 0.32 }),
  pvcRojo: mat(0xc9212b, { roughness: 0.48 }),
  pvcNegro: mat(0x23252a, { roughness: 0.55 }),
  plasticoBlanco: mat(0xeeeae2, { roughness: 0.6 }),
  plasticoGris: mat(0x3b3f45, { roughness: 0.6 }),
  laton: mat(0xc9a14a, { metalness: 0.85, roughness: 0.3 }),
};
const sombra = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };

// ---------------- Geometría de barrido ----------------
// Tubo de sección variable a lo largo de z: perfil(z) → lista de [x, y] (polígono convexo, mismo número de
// puntos en todos los anillos). Tapas planas en los dos extremos.
function loft(zs, perfil) {
  const anillos = zs.map((z) => perfil(z).map(([x, y]) => [x, y, z]));
  const M = anillos[0].length, pos = [], idx = [];
  for (const a of anillos) for (const p of a) pos.push(...p);
  for (let i = 0; i < anillos.length - 1; i++) for (let j = 0; j < M; j++) {
    const a = i * M + j, b = i * M + ((j + 1) % M), c = (i + 1) * M + j, d = (i + 1) * M + ((j + 1) % M);
    idx.push(a, b, c, b, d, c);
  }
  for (const [k, inv] of [[0, true], [anillos.length - 1, false]]) {
    const a = anillos[k], cx = a.reduce((s, p) => s + p[0], 0) / M, cy = a.reduce((s, p) => s + p[1], 0) / M;
    const c = pos.length / 3; pos.push(cx, cy, a[0][2]);
    for (let j = 0; j < M; j++) { const p = k * M + j, q = k * M + ((j + 1) % M); if (inv) idx.push(c, q, p); else idx.push(c, p, q); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Superelipse (n = 2 elipse, n grande = rectángulo redondeado), de t0 a t1 con k puntos
const superelipse = (a, b, n, t0, t1, k, dy = 0) => Array.from({ length: k }, (_, i) => {
  const t = t0 + ((t1 - t0) * i) / (k - 1), c = Math.cos(t), s = Math.sin(t);
  return [a * Math.sign(c) * Math.abs(c) ** (2 / n), dy + b * Math.sign(s) * Math.abs(s) ** (2 / n)];
});

// Prisma hexagonal barrido por un camino plano (en XY) con caras planas; camino: [{ p: [x, y], t: [tx, ty] }]
function barridoHex(camino, r) {
  const pos = [], nor = [], idx = [];
  const ang = (k) => (Math.PI / 3) * k + Math.PI / 6;
  const punto = (c, a) => { const N = [-c.t[1], c.t[0]]; return [c.p[0] + N[0] * r * Math.cos(a), c.p[1] + N[1] * r * Math.cos(a), r * Math.sin(a)]; };
  for (let k = 0; k < 6; k++) {
    const a0 = ang(k), a1 = ang(k + 1), am = (a0 + a1) / 2, base = pos.length / 3;
    for (const c of camino) {
      const N = [-c.t[1], c.t[0]], n = [N[0] * Math.cos(am), N[1] * Math.cos(am), Math.sin(am)];
      pos.push(...punto(c, a0), ...punto(c, a1)); nor.push(...n, ...n);
    }
    for (let i = 0; i < camino.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  for (const [c, s] of [[camino[0], -1], [camino[camino.length - 1], 1]]) {
    const base = pos.length / 3; pos.push(c.p[0], c.p[1], 0); nor.push(c.t[0] * s, c.t[1] * s, 0);
    for (let k = 0; k < 6; k++) { pos.push(...punto(c, ang(k))); nor.push(c.t[0] * s, c.t[1] * s, 0); }
    for (let k = 0; k < 6; k++) { const a = base + 1 + k, b = base + 1 + ((k + 1) % 6); if (s > 0) idx.push(base, a, b); else idx.push(base, b, a); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return g;
}

// ---------------- Caimán ----------------
// Pinza de cocodrilo con funda: las mordazas (acero dentado) salen al frente hacia −Z y la punta queda en
// el origen; la funda va de z = 8 a 46 y el cable sale en z = 52. Se aprieta arriba/abajo (eje Y local): la
// mitad de arriba y la de abajo giran sobre el perno (z = 17) y la boca se abre en el plano YZ.
export function crearCaiman(pvc = MAT.pvcRojo) {
  const g = new THREE.Group(), PIVOTE = 17, FIN = 46;
  const mitades = [1, -1].map((s) => {
    const m = new THREE.Group(); m.position.z = PIVOTE; g.add(m);
    // Funda: más angosta adelante, con estrías donde se aprieta; atrás deja un hueco entre las dos mitades
    const zs = []; for (let z = 8; z <= FIN; z += 1) zs.push(z);
    const geo = loft(zs, (z) => {
      const u = (z - 8) / (FIN - 8), w = 4.2 + 1.6 * u, h = 2.4 + 1.5 * Math.sin(Math.min(u * 1.3, 1) * Math.PI / 2);
      const estria = z > 27 && z < 43 ? 0.35 * Math.max(0, Math.cos(((z - 27) / 3.2) * Math.PI * 2)) ** 6 : 0;
      const hueco = Math.max(0, (z - PIVOTE) / (FIN - PIVOTE)) * 1.6;
      const pts = superelipse(w + estria, h + estria, 3.2, 0, Math.PI, 14, 0.15 + hueco);
      return s > 0 ? pts : pts.map(([x, y]) => [-x, -y]);
    });
    geo.translate(0, 0, -PIVOTE);
    m.add(new THREE.Mesh(geo, pvc));
    // Mordaza: placa con dientes hacia la otra mitad
    const placa = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 17), MAT.acero); placa.position.set(0, s * 0.75, -PIVOTE + 8.5 + 1); m.add(placa);
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.9), MAT.acero);
      d.rotation.x = Math.PI / 4; d.position.set(0, s * 0.35, -PIVOTE + 1.6 + i * 2.1); m.add(d);
    }
    const punta = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.6, 0.8), MAT.acero); punta.position.set(0, s * 0.3, -PIVOTE + 0.4); m.add(punta);
    return m;
  });
  const perno = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9.8, 12), MAT.acero); perno.rotation.z = Math.PI / 2; perno.position.z = PIVOTE; g.add(perno);
  const alivio = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.6, 7, 16), pvc); alivio.rotation.x = Math.PI / 2; alivio.position.z = FIN + 3; g.add(alivio);
  sombra(g);
  return {
    g, salida: new THREE.Vector3(0, 0, FIN + 6.5),
    // abrir: 0 cerrado … 1 abierto (≈ 7 mm en la punta; una fresa de 1/8" cabe con 0.7)
    abrir(a) { mitades[0].rotation.x = 0.2 * a; mitades[1].rotation.x = -0.2 * a; },
    // dónde se aprieta: atrás, de arriba a abajo
    agarre: { centro: new THREE.Vector3(0, 0, 41), eje: new THREE.Vector3(0, 1, 0), ancho: 8 },
  };
}

// ---------------- Terminal de horquilla ----------------
// Funda roja aislada y horquilla plana para tornillo M5. La horquilla va en el plano XZ (y = 0), abre hacia −Z
// (la punta en z = −12); el cable sale por +Z.
export function crearTerminal(pvc = MAT.pvcRojo) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-2, 0); s.lineTo(2, 0); s.lineTo(2, -3); s.lineTo(4.6, -4.6); s.lineTo(4.6, -12); s.lineTo(2.9, -12); s.lineTo(2.9, -7);
  s.absarc(0, -7, 2.9, 0, Math.PI, false); s.lineTo(-2.9, -12); s.lineTo(-4.6, -12); s.lineTo(-4.6, -4.6); s.lineTo(-2, -3); s.lineTo(-2, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false, curveSegments: 10 }); geo.rotateX(Math.PI / 2); geo.translate(0, 0.4, 0);
  const horquilla = new THREE.Mesh(geo, mat(0xd7b58a, { metalness: 0.8, roughness: 0.3 })); g.add(horquilla);
  const funda = new THREE.Mesh(loft([0, 3, 10, 15, 17], (z) => superelipse(z < 3 ? 2.6 + z * 0.35 : z > 15 ? 3.4 - (z - 15) * 0.5 : 3.6, z < 3 ? 2.2 + z * 0.3 : z > 15 ? 3.0 - (z - 15) * 0.5 : 3.1, 2.4, 0, Math.PI * 2 * (15 / 16), 16)), pvc);
  g.add(funda);
  sombra(g);
  return { g, salida: new THREE.Vector3(0, 0, 17), agarre: { centro: new THREE.Vector3(0, 0, 10), eje: new THREE.Vector3(1, 0, 0), ancho: 7 } };
}

// ---------------- Llave Allen ----------------
// Llave en L de 3 mm (ISO 2936: 63 × 20): la punta corta entra en el tornillo, en el origen, y sube por +Y;
// el doblez tiene radio 3.5 y el brazo largo va hacia +X. Pavonada.
export function crearLlaveAllen(s = 3, largo = 63, corto = 20) {
  const r = s / Math.sqrt(3), rb = 3.5, camino = [];
  camino.push({ p: [0, 0], t: [0, 1] }, { p: [0, corto - rb], t: [0, 1] });
  for (let i = 1; i <= 10; i++) { const a = Math.PI - (Math.PI / 2) * (i / 10); camino.push({ p: [rb + rb * Math.cos(a), corto - rb + rb * Math.sin(a)], t: [Math.sin(a), -Math.cos(a)] }); }
  camino.push({ p: [largo, corto], t: [1, 0] });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(barridoHex(camino, r), MAT.pavonado));
  sombra(g);
  return { g };
}

// ---------------- Llave fija ----------------
// Llave española de 13 mm por los dos lados, cromada, 130 mm. En el plano XZ (grosor en Y), la boca del
// origen abre hacia −X con 15° de giro y la otra queda en +X. La boca del origen abraza lo que esté en el origen.
export function crearLlaveFija(boca = 13, largo = 130) {
  const g = new THREE.Group(), R = boca * 0.98, L = largo - 2 * R * 0.9;
  const cabeza = () => {
    const h = boca / 2, xe = Math.sqrt(R * R - h * h), prof = boca * 0.95, xc = xe - prof + h;
    const s = new THREE.Shape(); const a0 = Math.asin(h / R);
    s.moveTo(xe, h); s.absarc(0, 0, R, a0, Math.PI * 2 - a0, false); s.lineTo(xc, -h); s.absarc(xc, 0, h, -Math.PI / 2, Math.PI / 2, true); s.lineTo(xe, h);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 4, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 2, curveSegments: 20 });
    geo.translate(-xc, 0, -2);          // el centro de la boca en el origen
    geo.rotateX(Math.PI / 2);
    return geo;
  };
  const c1 = new THREE.Mesh(cabeza(), MAT.cromo); c1.rotation.y = Math.PI + 0.26; g.add(c1);
  const c2 = new THREE.Mesh(cabeza(), MAT.cromo); c2.rotation.y = -0.26; c2.position.x = L + 2 * boca * 0.5; g.add(c2);
  // Mango: rectángulo redondeado que se angosta al centro
  const m = new THREE.Shape(), x0 = boca * 0.5, x1 = L + boca * 0.5, w0 = 6, w1 = 4.6;
  m.moveTo(x0, -w0); m.quadraticCurveTo((x0 + x1) / 2, -w1, x1, -w0); m.lineTo(x1, w0); m.quadraticCurveTo((x0 + x1) / 2, w1, x0, w0); m.lineTo(x0, -w0);
  const gm = new THREE.ExtrudeGeometry(m, { depth: 3, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 2, curveSegments: 12 });
  gm.translate(0, 0, -1.5); gm.rotateX(Math.PI / 2);
  g.add(new THREE.Mesh(gm, MAT.cromo));
  // «13» grabado en el mango
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
  const x = cv.getContext("2d"); x.fillStyle = "rgba(60,64,70,0.85)"; x.font = "700 44px Manrope, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(boca), 64, 34);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const rot = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  rot.rotation.x = -Math.PI / 2; rot.position.set(boca * 0.5 + 16, 2.25, 0); rot.userData.sinColision = true; g.add(rot);
  sombra(g); rot.castShadow = false;
  return { g, agarre: { centro: new THREE.Vector3(L * 0.62, 0, 0), eje: new THREE.Vector3(0, 0, 1), ancho: 12 } };
}

// ---------------- Clavija USB-B ----------------
// La punta en el origen, el cuerpo hacia +Z; se toma de los costados del cuerpo.
export function crearClavijaUSB() {
  const g = new THREE.Group();
  const metal = new THREE.Mesh(new THREE.BoxGeometry(8.6, 7.6, 9), MAT.cromo); metal.position.z = 4.5; g.add(metal);
  const cuerpo = new THREE.Mesh(loft([9, 12, 30, 35], (z) => superelipse(z < 12 ? 6.2 : z > 30 ? 6 - (z - 30) * 0.5 : 6.4, z < 12 ? 5.6 : z > 30 ? 5.4 - (z - 30) * 0.4 : 5.8, 5, 0, Math.PI * 2 * (23 / 24), 24)), MAT.pvcNegro);
  g.add(cuerpo);
  const funda = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 12, 16), MAT.pvcNegro); funda.rotation.x = Math.PI / 2; funda.position.z = 35 + 6; g.add(funda);
  sombra(g);
  return { g, salida: new THREE.Vector3(0, 0, 47), agarre: { centro: new THREE.Vector3(0, 0, 29), eje: new THREE.Vector3(1, 0, 0), ancho: 12.8 } };
}

// ---------------- Conector de la sonda ----------------
// Carcasa blanca de 2 pines: la punta en el origen, entra hacia +X; los cables salen por −X.
export function crearConector() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.BoxGeometry(9, 6.2, 5.2), MAT.plasticoBlanco); c.position.x = -4.5; g.add(c);
  const traba = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 3), MAT.plasticoBlanco); traba.position.set(-5, 3.4, 0); g.add(traba);
  sombra(g);
  return { g, salida: new THREE.Vector3(-9, 0, 0), agarre: { centro: new THREE.Vector3(-5, 0, 0), eje: new THREE.Vector3(0, 0, -1), ancho: 5.2 } };
}

// ---------------- Aspiradora de mano ----------------
// Cuerpo gris con depósito ahumado y boquilla para rendijas que termina en el origen (apunta a −Z).
export function crearAspiradora() {
  const g = new THREE.Group();
  const boquilla = new THREE.Mesh(loft([0, 70, 110], (z) => {
    const u = z / 110, a = 15 - 5 * (1 - u), b = 4 + 11 * u;
    return superelipse(a, b, 2 + 6 * (1 - u), 0, Math.PI * 2 * (23 / 24), 24);
  }), MAT.plasticoGris);
  g.add(boquilla);
  const deposito = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 70, 32), new THREE.MeshPhysicalMaterial({ color: 0x5b6068, transparent: true, opacity: 0.55, roughness: 0.15 }));
  deposito.rotation.x = Math.PI / 2; deposito.position.z = 110 + 35; g.add(deposito);
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(32, 30, 130, 32), mat(0x2c2f34, { roughness: 0.5 })); cuerpo.rotation.x = Math.PI / 2; cuerpo.position.z = 180 + 65; g.add(cuerpo);
  const boton = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 18), mat(0xf2c230, { roughness: 0.45 })); boton.position.set(0, 32, 200); g.add(boton);
  // Asa arriba del cuerpo, de donde se toma
  const asaM = mat(0x2c2f34, { roughness: 0.45 });
  const asa = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 84), asaM); asa.position.set(0, 52, 262); g.add(asa);
  for (const z of [224, 300]) { const poste = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 10), asaM); poste.position.set(0, 38, z); g.add(poste); }
  sombra(g);
  return { g, agarre: { centro: new THREE.Vector3(0, 52, 262), eje: new THREE.Vector3(-1, 0, 0), ancho: 16 } };
}

// ---------------- Cable ----------------
// Tubo que se recalcula cada cuadro: sale de «desde» en la dirección «dir», cuelga y llega a «hasta» (con
// su propia dirección de llegada si se da). «via»: puntos intermedios opcionales para rodear algo.
export function crearCable(escena, color, radio) {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat(color, { roughness: 0.6 })); m.castShadow = true; m.userData.sinColision = true; escena.add(m);
  let curva = null;
  const f = (desde, dir, hasta, { caida = 25, dirFin = null, via = [], piso = -66, rigido = 14 } = {}) => {
    const a = desde.clone(), b = desde.clone().addScaledVector(dir, rigido);
    const pts = [a, b, ...via];
    const ult = pts[pts.length - 1];
    const fin = dirFin ? hasta.clone().addScaledVector(dirFin, -rigido) : null;
    const c = new THREE.Vector3().addVectors(ult, fin ?? hasta).multiplyScalar(0.5);
    c.y = Math.max(Math.min(ult.y, (fin ?? hasta).y) - caida, piso);
    pts.push(c); if (fin) pts.push(fin); pts.push(hasta.clone());
    curva = new THREE.CatmullRomCurve3(pts, false, "centripetal");
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(curva, 80, radio, 10, false);
  };
  f.malla = m;
  // Puntos del cable para medir si atraviesa la mano
  f.muestras = (n = 60) => (curva ? curva.getSpacedPoints(n) : []);
  f.radio = radio;
  return f;
}
