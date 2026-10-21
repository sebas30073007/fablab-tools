// otter-modelo.js - el escáner Creality CR-Scan Otter y su placa de calibración, modelados con primitivas.
//
// No hay CAD público del Otter. Las cotas salen de (detalle en docs/otter-modelo.md):
//   · ficha (Adorama, MatterHackers, 3DJake): 165 × 37 × 59 mm, 390 g, cuerpo de metal sin ventilador,
//     4 cámaras en dos pares estéreo (focal larga y corta), luz estructurada NIR, 2 LED blancos y 8 IR,
//     110–1000 mm de distancia de trabajo, 1350 × 840 mm de campo a 1000 mm, USB 3.0 + USB 2.0 de apoyo
//   · seis fotos del Otter del laboratorio (21 oct 2026): frente casi ortogonal (8.8 px/mm) y atrás (8.6 px/mm)
//     · frente: vidrio negro con marco de aluminio gris; de izquierda a derecha, cámara Ø9.4 en −60.7,
//       cámara Ø10.7 en −25.5, proyector Ø18 al centro, cámara Ø11 en +24.7, cámara RGB Ø9.9 en +42.9 con
//       los 2 LED blancos arriba y abajo, cámara Ø9.6 en +60.7; los 8 LED IR arriba y abajo de las 4 cámaras
//     · atrás: botones «+ △ −» en una píldora del lado derecho del escáner, etiqueta al centro, salida del
//       cable en el extremo izquierdo, cuatro tapones grises en las esquinas
//     · arriba: aluminio negro; la placa gris de atrás sube 7 mm al techo en los 76 mm del centro
//
// Marco de three (mm): igual que el Pika. X a la derecha mirando el frente, Y arriba, Z hacia donde mira el
// escáner; origen en el centro de la cara de abajo (rosca de 1/4"). No lleva el logotipo ni la marca.

import * as THREE from "three";
import { herramientas, ajustarUV, cara } from "./pika-modelo.js";

export const OTTER = { x: 165, y: 37, z: 59 };

export function construirOtter({ sombra = true } = {}) {
  const { mat, vidrio, sombras, rr, losa, cil, disco, tex } = herramientas(sombra);
  const M = {
    negro: mat(0x1c1d20, { roughness: 0.45, metalness: 0.55 }),
    plata: mat(0x8c8f94, { roughness: 0.42, metalness: 0.7 }),
    aro: mat(0xc4c7cb, { roughness: 0.22, metalness: 0.95 }),
    vidrio: vidrio(0x040506),
    lente: vidrio(0x0e131b, { roughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.4 }),
    barril: mat(0x08090a, { roughness: 0.5 }),
    hueco: mat(0x050505, { roughness: 1 }),
    tapon: mat(0x9a9da2, { roughness: 0.5, metalness: 0.2 }),
    hule: mat(0x111214, { roughness: 0.85 }),
  };
  const W = OTTER.x / 2, H = OTTER.y / 2, D = OTTER.z / 2;
  const raiz = new THREE.Group(); raiz.name = "otter";
  const cuerpo = new THREE.Group(); cuerpo.position.y = H; raiz.add(cuerpo);   // (0,0,0) = centro de la caja

  // ---- Casco: prisma facetado, cortado con planos (aluminio maquinado de aristas vivas) ----
  const P = [];
  const plano = (x, y, z, d, m) => P.push({ n: new THREE.Vector3(x, y, z).normalize(), d, m });
  const corte = (n, punto, m) => { n.normalize(); P.push({ n, d: n.dot(punto), m }); };
  plano(0, 0, 1, D, "plata"); plano(0, 0, -1, D, "plata");
  plano(0, 1, 0, H, "negro"); plano(0, -1, 0, H, "negro");
  plano(1, 0, 0, W, "negro"); plano(-1, 0, 0, W, "negro");
  for (const sx of [-1, 1]) {
    // chaflanes de los extremos vistos de frente: 10 mm en X por 8 en Y
    for (const sy of [-1, 1]) corte(new THREE.Vector3(sx * 8, sy * 10, 0), new THREE.Vector3(sx * (W - 10), sy * H, 0), "plata");
    // chaflanes vistos desde arriba: 4 × 4 en las esquinas del frente y de atrás
    for (const sz of [-1, 1]) corte(new THREE.Vector3(sx * 4, 0, sz * 4), new THREE.Vector3(sx * (W - 4), 0, sz * D), "plata");
  }
  const posN = [], posP = [];
  for (const [i, pl] of P.entries()) {
    const poli = cara(pl, P.filter((_, j) => j !== i));
    const dest = pl.m === "negro" ? posN : posP;
    for (let k = 1; k < poli.length - 1; k++) dest.push(...poli[0].toArray(), ...poli[k].toArray(), ...poli[k + 1].toArray());
  }
  for (const [pos, m] of [[posN, M.negro], [posP, M.plata]]) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    cuerpo.add(new THREE.Mesh(g, m));
  }
  // La placa gris de atrás sube al techo y al piso en los 76 mm del centro (con los extremos a 45°)
  for (const s of [1, -1]) {
    // la forma se dibuja en (x, ±z) y se acuesta: hacia arriba en el techo, hacia abajo en el piso
    const y0 = s * D, y1 = s * (D - 7);
    const f = new THREE.Shape([new THREE.Vector2(-38, y0), new THREE.Vector2(38, y0), new THREE.Vector2(31, y1), new THREE.Vector2(-31, y1)]);
    const g = new THREE.ShapeGeometry(f); g.rotateX(-s * Math.PI / 2);
    const o = new THREE.Mesh(g, M.plata); o.position.y = s * (H + 0.06); cuerpo.add(o);
  }

  // ---- Frente: vidrio negro con muescas arriba y abajo al centro, y los ópticos ----
  const zV = D, zC = D + 0.45;
  const contornoVidrio = [
    [-69.5, -15.8], [-16.5, -15.8], [-13.9, -13.2], [13.9, -13.2], [16.5, -15.8], [69.5, -15.8], [78.2, -9], [78.2, 9],
    [69.5, 15.8], [16.5, 15.8], [13.9, 13.2], [-13.9, 13.2], [-16.5, 15.8], [-69.5, 15.8], [-78.2, 9], [-78.2, -9],
  ];
  const fv = new THREE.Shape(contornoVidrio.map(([x, y]) => new THREE.Vector2(x, y)));
  losa(fv, zV - 0.2, zC, M.vidrio, cuerpo, 0.12, 1);
  const camara = (x, d) => {
    const g = new THREE.Group(); g.position.x = x; cuerpo.add(g);
    const aro = new THREE.Shape(); aro.absarc(0, 0, d / 2, 0, Math.PI * 2);
    const h = new THREE.Path(); h.absarc(0, 0, d * 0.36, 0, Math.PI * 2, true); aro.holes.push(h);
    losa(aro, zC - 0.1, zC + 0.6, M.aro, g, 0.15, 2);
    disco(d * 0.37, zC - 0.2, zC + 0.2, M.barril, g, 0, 0, 40);
    disco(d * 0.22, zC + 0.1, zC + 0.35, M.lente, g, 0, 0, 32);
    return g;
  };
  [[-60.7, 9.4], [-25.5, 10.7], [24.7, 11.1], [60.7, 9.6]].forEach(([x, d]) => camara(x, d));
  // Proyector NIR al centro: aro grueso de Ø18 con una lente grande y su barril escalonado
  const proyector = camara(-0.6, 18.1);
  disco(4.6, zC + 0.05, zC + 0.3, M.barril, proyector, 0, 0, 40);
  const emisor = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), mat(0x2a3140, { roughness: 0.2, metalness: 0.5, emissive: 0x000000, emissiveIntensity: 1.8 }));
  emisor.position.z = zC + 0.36; proyector.add(emisor);
  camara(42.9, 9.9);   // cámara RGB
  // 8 LED infrarrojos (arriba y abajo de las 4 cámaras) y 2 blancos (con la RGB)
  const ledsIR = [], ledsBlancos = [];
  for (const x of [-60.2, -25.5, 24, 60.2]) for (const y of [-10.8, 10.8]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), mat(0x3a1c18, { roughness: 0.25, emissive: 0x000000, emissiveIntensity: 2 }));
    l.position.set(x, y, zC + 0.02); cuerpo.add(l); ledsIR.push(l);
  }
  for (const y of [-10.8, 10.8]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(2.25, 24), mat(0xe8e48a, { roughness: 0.35, emissive: 0x000000, emissiveIntensity: 2.2 }));
    l.position.set(41.8, y, zC + 0.02); cuerpo.add(l); ledsBlancos.push(l);
  }

  // ---- Atrás (z = −D): grupo girado; x local = −X del escáner, así se lee como en la foto ----
  const atras = new THREE.Group(); atras.position.z = -D; atras.rotation.y = Math.PI; cuerpo.add(atras);
  // Píldora de botones «+ △ −» (táctiles) del lado derecho del escáner
  const texBotones = tex(512, 160, (g, w, h) => {
    g.fillStyle = "#141517"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#e6e8eb"; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
    const c1 = w * 0.2, c2 = w * 0.5, c3 = w * 0.8, cy = h / 2;
    g.beginPath(); g.moveTo(c1 - 24, cy); g.lineTo(c1 + 24, cy); g.moveTo(c1, cy - 24); g.lineTo(c1, cy + 24); g.stroke();
    g.beginPath(); g.moveTo(c2, cy - 24); g.lineTo(c2 + 24, cy + 20); g.lineTo(c2 - 24, cy + 20); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(c3, cy - 24); g.lineTo(c3, cy + 24); g.stroke();
  });
  const marcoPildora = losa(rr(50.8, 15.9, 7.95), -0.3, 0.35, mat(0x2a2c30, { roughness: 0.3, metalness: 0.5 }), atras, 0.2, 2);
  marcoPildora.position.set(-39.1, 1.2, 0);
  const pildora = losa(rr(48.6, 13.7, 6.85), 0, 0.55, [new THREE.MeshPhysicalMaterial({ map: texBotones, roughness: 0.15, clearcoat: 1 }), M.barril], atras, 0.1, 1);
  pildora.position.set(-39.1, 1.2, 0); ajustarUV(pildora.geometry, 48.6, 13.7);
  // Etiqueta: rectángulo oscuro con renglones genéricos y el cuadro del código (sin textos ni sellos)
  const texEtiqueta = tex(512, 240, (g, w, h) => {
    g.fillStyle = "#151619"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#b9bcc1"; for (let i = 0; i < 6; i++) g.fillRect(24, 22 + i * 18, i % 2 ? 300 : 430, 6);
    g.fillStyle = "#f2f2f2"; g.fillRect(24, 160, 150, 52); g.fillStyle = "#151619"; g.fillRect(32, 168, 34, 34);
    g.strokeStyle = "#b9bcc1"; g.lineWidth = 4; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(240 + i * 62, 132, 18, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 3; i++) g.strokeRect(220 + i * 70, 178, 52, 30);
  });
  const etiqueta = losa(rr(48.7, 23, 0.8), 0, 0.12, [new THREE.MeshStandardMaterial({ map: texEtiqueta, roughness: 0.6 }), M.barril], atras);
  etiqueta.position.set(19.3, 2.9, 0); ajustarUV(etiqueta.geometry, 48.7, 23);
  // Tapones grises de los tornillos, dos por extremo
  for (const [x, y] of [[-75, 7], [-73.5, -6], [75, 7], [73.5, -6]]) disco(2.25, -0.1, 0.25, M.tapon, atras, x, y, 24);
  // Salida del cable en el extremo izquierdo: hueco con el conector negro adentro
  const hueco = losa(rr(27, 24, 4), -6, 0.05, M.hueco, atras); hueco.position.set(62.5, -1, 0);
  const conector = losa(rr(21, 10, 2.5), -5, 1.5, M.hule, atras, 0.8); conector.position.set(63.5, 0, 0);
  // Cable trenzado: sale hacia la izquierda y cae
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-W + 22, H, -D - 1), new THREE.Vector3(-W - 6, H, -D - 4), new THREE.Vector3(-W - 30, H - 6, -D - 6),
    new THREE.Vector3(-W - 52, -12, -D - 4), new THREE.Vector3(-W - 64, -40, -D + 6),
  ]);
  raiz.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 64, 2.4, 10), M.hule));

  // ---- Abajo: inserto de 1/4"-20 al centro ----
  cil(4.6, 0.6, mat(0xb9bdc2, { roughness: 0.3, metalness: 0.9 }), raiz, 32).position.y = 0.1;
  cil(3.2, 0.62, M.hueco, raiz, 24).position.y = 0.12;

  // ---- Abanico NIR: pirámide hasta 1000 mm, donde cubre 1350 × 840 (ficha) ----
  const gNir = new THREE.BufferGeometry(), E = [[-675, -420], [675, -420], [675, 420], [-675, 420]], vn = [];
  for (let i = 0; i < 4; i++) { const [a, b] = E[i], [c, d] = E[(i + 1) % 4]; vn.push(0, 0, 0, a, b, 1000, c, d, 1000); }
  gNir.setAttribute("position", new THREE.Float32BufferAttribute(vn, 3));
  const nir = new THREE.Mesh(gNir, new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.035, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  nir.position.set(-0.6, H, D + 0.5); nir.scale.setScalar(0.42); nir.visible = false; raiz.add(nir);   // en el gemelo solo se dibuja hasta ~420 mm

  // Modos: "apagado", "luz" (LED blancos para textura), "nir" (proyector + IR)
  const modo = (m) => {
    const ir = m === "nir", luz = m === "luz" || m === "laser";
    ledsIR.forEach((l) => l.material.emissive.setHex(ir ? 0x9a2030 : 0x000000));
    ledsBlancos.forEach((l) => l.material.emissive.setHex(luz ? 0xfff2cc : 0x000000));
    emisor.material.emissive.setHex(ir ? 0xc0304a : 0x000000);
    nir.visible = ir;
  };

  sombras(raiz); nir.castShadow = nir.receiveShadow = false;
  return { raiz, cuerpo, nir, modo, medidas: { ...OTTER, yOjos: H } };
}

// ================= Placa de calibración sobre su tapete =================
// Placa blanca de 210 × 240 con 6 × 7 puntos (paso de 35) y 4 puntos grandes al centro, sobre un tapete
// negro de 244 × 326. Medidas deducidas de la foto (el paso de 35 mm es una estimación). Origen en la mesa.
export function construirPlacaCalibracion({ sombra = true } = {}) {
  const { mat, sombras, rr, losa } = herramientas(sombra);
  const g = new THREE.Group(); g.name = "placa-calibracion";
  const acostar = (o) => { o.rotation.x = -Math.PI / 2; return o; };
  acostar(losa(rr(244, 326, 22), 0, 1.5, mat(0x121315, { roughness: 0.9 }), g, 0.4));
  acostar(losa(rr(210, 240, 9), 1.5, 4.5, mat(0xeceef0, { roughness: 0.55 }), g, 0.5));
  const punto = mat(0x0b0b0c, { roughness: 0.6 });
  const dot = (x, z, r) => { const o = new THREE.Mesh(new THREE.CircleGeometry(r, 32), punto); o.rotation.x = -Math.PI / 2; o.position.set(x, 4.52, z); g.add(o); };
  const P = 35;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) if (!(i === 3 && j === 3)) dot((i - 2.5) * P, (j - 3) * P, 3);
  for (const [i, j] of [[3, 3], [2.5, 2.5], [2.5, 3.5], [3, 3.5]]) dot((i - 2.5) * P, (j - 3) * P, 5);
  // flecha «arriba» al centro del borde de atrás
  const f = new THREE.Mesh(new THREE.CircleGeometry(2.4, 3), punto); f.rotation.set(-Math.PI / 2, 0, Math.PI / 2); f.position.set(0, 4.52, -112); g.add(f);
  sombras(g);
  return { raiz: g, alto: 4.5 };
}
