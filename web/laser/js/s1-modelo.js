// s1-modelo.js - la xTool S1 (40 W, versión negra) modelada con primitivas.
//
// No hay CAD público de la máquina. Las proporciones salen de (detalle en docs/xtool-s1-modelo.md):
//   · ficha oficial: exterior 765 × 561 × 183 mm (sin elevador), área 498 × 319 mm con el módulo de 40 W,
//     42 mm de altura de material
//   · renders oficiales de la tienda y de la Quick Start Guide: caja en «U» negra grafito, tapa de acrílico
//     tintado que cubre techo y frente con pequeños retornos en las esquinas, sección trasera opaca de
//     ~215 mm con tira de aluminio en la bisagra, frente bajo con botón e indicador anular abajo a la
//     derecha, paro de emergencia rojo en el costado derecho junto al fondo, salida de humo con
//     ventilador en el costado izquierdo junto al fondo, panel de puertos en la cara trasera
//   · foto de soporte con la carcasa quitada: viga X negra de pared a pared, motor Y y eje de transmisión
//     al fondo, cadena portacables a la izquierda
//   · fotos del módulo de 40 W: caja champán con rejilla arriba, boquilla cónica al frente-derecha,
//     sensor de distancia y husillo del eje Z a su derecha
//
// Marco de three (mm): X a la derecha, Y arriba, Z hacia el usuario (frente de la máquina). El origen de
// trabajo (X0 Y0 de máquina, esquina TRASERA izquierda del área) está en (0, yCama, 0); +X de máquina va a
// la derecha y +Y de máquina hacia el frente, así que el punto (x, y) de la cama es (x, yCama, y) en three.
// Devuelve los grupos que el gemelo anima.

import * as THREE from "three";

// Área útil del módulo de 40 W y altura máxima de material (ficha oficial)
export const AREA = { x: 498, y: 319 };
export const ALTURA_UTIL = 42;

// Caja exterior y posición del origen de trabajo dentro de ella (desde la esquina trasera izquierda,
// cara exterior). El área no está centrada: a la izquierda solo cabe medio módulo; a la derecha van el
// sensor de distancia y el husillo Z. Al fondo, tras Y0, quedan la viga, el eje del motor Y y la placa.
const EXT = { x: 765, y: 183, z: 561 };
const OX = 128, OZ = 172;

const COL = {
  caja: 0x3d4148, cajaClara: 0x4a4f56, interior: 0x1b1d21, fondo: 0x26292d, negro: 0x141518,
  aluminio: 0xc3c7cc, acero: 0xbfc4ca, viga: 0x1d1f23, placa: 0x8f949b, champan: 0xcdb99b,
  champanOscuro: 0x6f6252, cobre: 0xc9935f, rojo: 0xd2232a, amarillo: 0xf2c230, acrilico: 0x2a6a3c,
  bordeAcrilico: 0x6fdc8f, panalFondo: "#3a3e44", panalPared: "#b7bcc3",
};

export function construirS1({ sombra = true } = {}) {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
  const M = {
    caja: mat(COL.caja, { roughness: 0.62, metalness: 0.35 }), cajaClara: mat(COL.cajaClara, { roughness: 0.5, metalness: 0.4 }),
    interior: mat(COL.interior, { roughness: 0.85 }), fondo: mat(COL.fondo, { roughness: 0.7, metalness: 0.3 }),
    negro: mat(COL.negro, { roughness: 0.8 }), viga: mat(COL.viga, { roughness: 0.55, metalness: 0.4 }),
    aluminio: mat(COL.aluminio, { metalness: 0.7, roughness: 0.32 }), acero: mat(COL.acero, { metalness: 0.92, roughness: 0.22 }),
    placa: mat(COL.placa, { metalness: 0.6, roughness: 0.4 }), champan: mat(COL.champan, { metalness: 0.55, roughness: 0.38 }),
    champanOscuro: mat(COL.champanOscuro, { metalness: 0.4, roughness: 0.6 }), cobre: mat(COL.cobre, { metalness: 0.85, roughness: 0.3 }),
    rojo: mat(COL.rojo, { roughness: 0.35 }), amarillo: mat(COL.amarillo, { roughness: 0.5 }),
  };
  const rosca = roscaMaterial();
  const sombras = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = sombra; m.receiveShadow = true; } }); return o; };
  const caja = (w, h, d, m, x, y, z, padre) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); padre.add(o); return o; };
  // Caja dada por sus límites (x0..x1, y0..y1, z0..z1): más cómodo para piezas que van de pared a pared
  const entre = (x0, x1, y0, y1, z0, z1, m, padre) => caja(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, padre);
  const cil = (r, h, m, padre, eje = "y", seg = 32) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    if (eje === "x") o.rotation.z = Math.PI / 2;
    if (eje === "z") o.rotation.x = Math.PI / 2;
    padre.add(o); return o;
  };
  // Contorno en planta (x, z) con esquinas redondeadas; radios: uno para todas o uno por vértice
  const contorno = (pts, radios = 0, Clase = THREE.Shape) => {
    const s = new Clase(), n = pts.length, V = ([x, z]) => new THREE.Vector2(x, -z);
    for (let i = 0; i < n; i++) {
      const P = V(pts[i]), A = V(pts[(i - 1 + n) % n]), B = V(pts[(i + 1) % n]);
      const r = Array.isArray(radios) ? radios[i] : radios;
      if (!r) { i ? s.lineTo(P.x, P.y) : s.moveTo(P.x, P.y); continue; }
      const p1 = P.clone().addScaledVector(A.clone().sub(P).normalize(), r), p2 = P.clone().addScaledVector(B.clone().sub(P).normalize(), r);
      i ? s.lineTo(p1.x, p1.y) : s.moveTo(p1.x, p1.y);
      s.quadraticCurveTo(P.x, P.y, p2.x, p2.y);
    }
    s.closePath(); return s;
  };
  const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  // Prisma: una planta extruida en altura desde y0; con bisel suaviza las aristas sin cambiar la medida
  const prisma = (forma, y0, h, m, padre, bisel = 0) => {
    const g = new THREE.ExtrudeGeometry(forma, {
      depth: h - 2 * bisel, curveSegments: 6, bevelEnabled: bisel > 0,
      bevelSize: bisel, bevelThickness: bisel, bevelOffset: -bisel, bevelSegments: 2,
    });
    g.rotateX(-Math.PI / 2); g.translate(0, y0 + bisel, 0);
    const o = new THREE.Mesh(g, m); padre.add(o); return o;
  };
  // Caja redondeada (perfil w × h redondeado, profundidad d en z), centrada (igual que en cubiko.js)
  const redondeada = (w, h, d, r, m, padre, bisel = 1.5) => {
    const s = new THREE.Shape(), x = -w / 2 + bisel, y = -h / 2 + bisel, W = w - 2 * bisel, H = h - 2 * bisel, R = Math.min(r, W / 2, H / 2);
    s.moveTo(x + R, y); s.lineTo(x + W - R, y); s.quadraticCurveTo(x + W, y, x + W, y + R); s.lineTo(x + W, y + H - R);
    s.quadraticCurveTo(x + W, y + H, x + W - R, y + H); s.lineTo(x + R, y + H); s.quadraticCurveTo(x, y + H, x, y + H - R);
    s.lineTo(x, y + R); s.quadraticCurveTo(x, y, x + R, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bisel, bevelEnabled: true, bevelSize: bisel, bevelThickness: bisel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -(d - 2 * bisel) / 2);
    const o = new THREE.Mesh(g, m); padre.add(o); return o;
  };
  const m4 = new THREE.Matrix4();

  // ---- Cotas (todas en el marco de three) ----
  const X0 = -OX, X1 = EXT.x - OX, Z0 = -OZ, Z1 = EXT.z - OZ;      // caja exterior: x −128…637, z −172…389
  const yPiso = 0, yBase = 4, yFondo = 12;                          // mesa, panza de la caja (patas de 4) y cara de la placa base
  const yCama = 34;                                                 // panal de 22 mm sobre la placa base
  const yTecho = EXT.y, ESP = 4, yParedes = yTecho - ESP;           // la tapa de 4 mm descansa sobre las paredes
  const PARED = 55, hFrente = 75;                                   // paredes laterales gruesas (guías y correas dentro); frente bajo
  const xi0 = X0 + PARED, xi1 = X1 - PARED, zi0 = Z0 + 20, zi1 = Z1 - 30;   // hueco interior: x −73…582, z −152…359
  const zBisagra = Z0 + 215;                                        // la sección trasera opaca mide ~215 mm (z = 43)
  const RET = 40;                                                   // fondo de los retornos laterales de la tapa
  const c = yCama;

  // ================= Fijo =================
  const fijo = new THREE.Group();
  // Patas
  for (const x of [X0 + 46, X1 - 46]) for (const z of [Z0 + 36, Z1 - 30]) entre(x - 17, x + 17, yPiso, yBase, z - 11, z + 11, M.negro, fijo);
  // Tina inferior (hasta el borde del frente) con el hueco del interior
  const base = contorno(rect(X0, X1, Z0, Z1), 14);
  base.holes.push(contorno(rect(xi0, xi1, zi0, zi1), 18, THREE.Path));
  prisma(base, yBase, hFrente - yBase, M.caja, fijo);
  // Paredes en «U» (laterales y fondo) hasta la tapa; en el frente dejan el escalón de los retornos de acrílico
  const u = [
    [X0 + ESP, Z1 - ESP], [X0 + ESP, Z1 - RET], [X0, Z1 - RET], [X0, Z0], [X1, Z0], [X1, Z1 - RET], [X1 - ESP, Z1 - RET],
    [X1 - ESP, Z1 - ESP], [xi1, Z1 - ESP], [xi1, zi0], [xi0, zi0], [xi0, Z1 - ESP],
  ];
  prisma(contorno(u, [1, 0, 0, 14, 14, 0, 0, 1, 1, 10, 10, 1]), hFrente, yParedes - hFrente, M.caja, fijo);
  // Techo de la sección trasera (al ras de la tapa) y la tira de aluminio de la bisagra
  prisma(contorno(rect(X0, X1, Z0, zBisagra - 12), [14, 14, 0, 0]), yParedes, ESP, M.caja, fijo);
  entre(X0 + 2, X1 - 2, yParedes, yTecho + 0.4, zBisagra - 12, zBisagra, M.aluminio, fijo);
  // Faldón bajo la bisagra (cara frontal de la sección trasera) con una barra de luz
  entre(xi0, xi1, yParedes - 32, yParedes, zBisagra - 18, zBisagra - 12, M.interior, fijo);
  const blanco = new THREE.MeshBasicMaterial({ color: 0xf1f5f2 });
  entre(xi0 + 30, xi1 - 30, yParedes - 34, yParedes - 31, zBisagra - 20, zBisagra - 14, blanco, fijo);
  // Ranura decorativa a lo largo del frente, un poco bajo el borde
  entre(X0 + 20, X1 - 20, hFrente - 9, hFrente - 8, Z1 - 0.2, Z1 + 0.15, M.negro, fijo);
  // Interior: placa base, forro oscuro de las paredes y barra de luz en la cara interna del frente
  entre(xi0, xi1, yBase, yFondo, zi0, zi1, M.fondo, fijo);
  entre(xi0 + 0.2, xi0 + 0.6, yFondo, yParedes - 1, zi0, zi1, M.interior, fijo);
  entre(xi1 - 0.6, xi1 - 0.2, yFondo, yParedes - 1, zi0, zi1, M.interior, fijo);
  entre(xi0, xi1, yFondo, yParedes - 1, zi0 + 0.2, zi0 + 0.6, M.interior, fijo);
  entre(xi0 + 40, xi1 - 40, hFrente - 14, hFrente - 9, zi1 - 1.5, zi1 - 0.2, blanco, fijo);

  // Panal: marco de aluminio de 10 mm y celdas hexagonales (textura) sobre la placa base
  const panal = { x0: -25, x1: AREA.x + 25, z0: -25, z1: AREA.y + 25 };
  const tex = panalTextura(), celda = 36, alto = 20.78;           // un mosaico de la textura = 36 × 20.78 mm (lado de celda 3 mm)
  tex.repeat.set((panal.x1 - panal.x0 - 20) / celda, (panal.z1 - panal.z0 - 20) / alto);
  const mPanal = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.5 });
  const cuerpoPanal = new THREE.Mesh(new THREE.BoxGeometry(panal.x1 - panal.x0 - 20, c - 0.4 - yFondo, panal.z1 - panal.z0 - 20),
    [M.aluminio, M.aluminio, mPanal, M.aluminio, M.aluminio, M.aluminio]);
  cuerpoPanal.position.set((panal.x0 + panal.x1) / 2, (yFondo + c - 0.4) / 2, (panal.z0 + panal.z1) / 2); fijo.add(cuerpoPanal);
  entre(panal.x0, panal.x1, yFondo, c, panal.z0, panal.z0 + 10, M.aluminio, fijo);
  entre(panal.x0, panal.x1, yFondo, c, panal.z1 - 10, panal.z1, M.aluminio, fijo);
  entre(panal.x0, panal.x0 + 10, yFondo, c, panal.z0 + 10, panal.z1 - 10, M.aluminio, fijo);
  entre(panal.x1 - 10, panal.x1, yFondo, c, panal.z0 + 10, panal.z1 - 10, M.aluminio, fijo);

  // Guías del eje Y pegadas a las paredes laterales, con su correa
  const yGuia = c + 92;
  for (const [x0, x1] of [[xi0, xi0 + 14], [xi1 - 14, xi1]]) {
    entre(x0, x1, yGuia - 8, yGuia, zi0 + 4, zi1 - 8, M.aluminio, fijo);
    entre(x0 + 3, x1 - 3, yGuia + 1, yGuia + 7, zi0 + 4, zi1 - 8, M.negro, fijo);
  }
  // Al fondo: motor Y con su eje de transmisión a ambos lados y la caja de la placa de control
  const ejeY = cil(4, xi1 - xi0 - 30, M.acero, fijo, "x", 16); ejeY.position.set((xi0 + xi1) / 2, c + 55, zi0 + 16);
  entre(360, 400, c + 34, c + 76, zi0 + 1, zi0 + 31, M.negro, fijo);
  entre(xi0 + 2, xi0 + 190, yFondo, yFondo + 50, zi0 + 1, zi0 + 34, M.interior, fijo);

  // Botón de arranque con indicador anular (abajo a la derecha del frente): `luz` es el anillo
  const xBoton = X1 - 57, yBoton = yBase + 34;
  const luz = new THREE.Mesh(new THREE.TorusGeometry(7.6, 1.5, 10, 36),
    new THREE.MeshStandardMaterial({ color: 0x20242a, emissive: 0xe8f0ff, emissiveIntensity: 1, roughness: 0.4 }));
  luz.position.set(xBoton, yBoton, Z1 + 0.6); fijo.add(luz);
  const bisel = cil(9.6, 1.6, M.acero, fijo, "z", 32); bisel.position.set(xBoton, yBoton, Z1 + 0.4);
  const tecla = cil(6, 2.6, M.aluminio, fijo, "z", 28); tecla.position.set(xBoton, yBoton, Z1 + 1.3);

  // Paro de emergencia en el costado derecho, junto al fondo y arriba
  const paro = new THREE.Group(); fijo.add(paro);
  cil(15, 5, M.negro, paro, "x", 28).position.set(2.5, 0, 0);
  cil(11.5, 9, M.rojo, paro, "x", 28).position.set(9.5, 0, 0);
  const domo = new THREE.Mesh(new THREE.SphereGeometry(11.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.rojo);
  domo.rotation.z = -Math.PI / 2; domo.scale.y = 0.35; domo.position.set(14, 0, 0); paro.add(domo);
  paro.position.set(X1, yTecho - 32, Z0 + 62);

  // Salida de humo en el costado izquierdo, junto al fondo: brida cuadrada, ventilador y el tubo puesto
  const humo = new THREE.Group(); fijo.add(humo);
  entre(-4, 0, -55, 55, -55, 55, M.negro, humo);
  // Collar abierto (sin tapas) para que se vea el ventilador; al fondo, el hueco oscuro de la pared
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(46, 46, 34, 36, 1, true), mat(COL.negro, { roughness: 0.8, side: THREE.DoubleSide }));
  collar.rotation.z = Math.PI / 2; collar.position.set(-21, 0, 0); humo.add(collar);
  const boca = new THREE.Mesh(new THREE.CircleGeometry(46, 32), M.interior); boca.rotation.y = -Math.PI / 2; boca.position.set(-4.2, 0, 0); humo.add(boca);
  const aspas = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 30, 9), M.viga, 5);
  for (let i = 0; i < 5; i++) { m4.makeRotationX((i / 5) * Math.PI * 2).setPosition(-30, 0, 0); m4.multiply(new THREE.Matrix4().makeTranslation(0, 17, 0)); aspas.setMatrixAt(i, m4); }
  humo.add(aspas);
  cil(9, 6, M.viga, humo, "x", 20).position.set(-30, 0, 0);
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(46.5, 1.6, 6, 32), M.negro); r.rotation.y = Math.PI / 2; r.position.set(-8 - i * 5.4, 0, 0); humo.add(r); }
  humo.position.set(X0, yBase + 92, Z0 + 78);

  // Panel de puertos en la cara trasera (interruptor, alimentación, USB, llave, 3 extensiones, 2 racores)
  const puertos = new THREE.Group(); fijo.add(puertos);
  entre(-110, 110, -32, 32, -1, 0, M.negro, puertos);
  entre(-96, -84, -10, 14, -2.5, -1, M.viga, puertos);                                   // interruptor
  for (const [x, y] of [[-70, 8], [-70, -12]]) cil(4.5, 4, M.acero, puertos, "z", 16).position.set(x, y, -2.5);
  entre(-52, -38, -18, -12, -2, -1, M.viga, puertos);                                    // USB
  entre(-30, -22, -20, -8, -2, -1, M.viga, puertos);                                     // llave
  for (let i = 0; i < 3; i++) entre(36, 42, 16 - i * 15, 24 - i * 15, -2, -1, M.viga, puertos);
  for (const y of [12, -12]) { cil(5, 8, M.aluminio, puertos, "z", 16).position.set(76, y, -4); cil(7.5, 2, M.negro, puertos, "z", 16).position.set(76, y, -1.5); }
  puertos.position.set(260, yBase + 88, Z0);
  sombras(fijo);
  luz.castShadow = false;

  // ================= Tapa (gira en la bisagra trasera) =================
  // El grupo está en la línea de la bisagra; en coordenadas locales z = 0 es la bisagra y y = 0 el techo.
  const tapa = new THREE.Group(); tapa.position.set(0, yTecho, zBisagra); fijo.add(tapa);
  const acril = new THREE.MeshPhysicalMaterial({
    color: COL.acrilico, transparent: true, opacity: 0.35, roughness: 0.08, metalness: 0, clearcoat: 0.6,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const lz = Z1 - zBisagra, ly = hFrente - yTecho;               // largo de la tapa (346) y bajada del frente (−108)
  const placas = [
    entre(X0, X1, -ESP, 0, 12, lz, acril, tapa),                  // techo
    entre(X0, X1, ly, -ESP, lz - ESP, lz, acril, tapa),           // frente
    entre(X0, X0 + ESP, ly, -ESP, lz - RET, lz - ESP, acril, tapa),   // retornos de las esquinas
    entre(X1 - ESP, X1, ly, -ESP, lz - RET, lz - ESP, acril, tapa),
  ];
  sombras(tapa);
  for (const p of placas) { p.renderOrder = 5; p.castShadow = false; }
  // Cantos del acrílico: se ven más claros que las caras
  const cantos = new THREE.LineBasicMaterial({ color: COL.bordeAcrilico, transparent: true, opacity: 0.45 });
  for (const p of placas) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry), cantos); l.position.copy(p.position); l.renderOrder = 6; tapa.add(l); }
  // Marco negro: travesaño de la bisagra y las agarraderas en las esquinas del frente
  entre(X0 + 1, X1 - 1, -ESP - 1.5, 0.6, 0, 12, M.negro, tapa);
  for (const [x0, x1] of [[X0 + 14, X0 + 76], [X1 - 76, X1 - 14]]) entre(x0, x1, -ESP - 5, 1.2, lz - 13, lz - 1, M.negro, tapa);
  tapa.userData.abrir = (f) => { tapa.rotation.x = -THREE.MathUtils.degToRad(75) * Math.min(1, Math.max(0, f)); };

  // ================= Pórtico (se mueve en Y de máquina = z de three) =================
  // Todo en coordenadas absolutas con la boquilla en z = 0: porticoY.position.z = y la lleva a Y = y.
  const porticoY = new THREE.Group();
  const vz0 = -114, vz1 = -70, vy0 = c + 78, vy1 = c + 122;      // viga X: 44 × 44 mm detrás del carro
  entre(xi0 + 16, xi1 - 16, vy0, vy1, vz0, vz1, M.viga, porticoY);
  for (const y of [c + 88, c + 112]) { const v = cil(4, xi1 - xi0 - 32, M.acero, porticoY, "x", 16); v.position.set((xi0 + xi1) / 2, y, vz1 + 4); }
  // Carros de los extremos, montados sobre las guías Y
  for (const [x0, x1] of [[xi0, xi0 + 18], [xi1 - 18, xi1]]) {
    entre(x0, x1, yGuia - 2, vy1 + 6, vz0 - 8, vz1 + 8, M.negro, porticoY);
    for (const z of [vz0 - 2, vz1 + 2]) { const r = cil(5, 6, M.placa, porticoY, "x", 16); r.position.set((x0 + x1) / 2, yGuia - 3, z); }
  }
  // Etiqueta amarilla de advertencia en el extremo izquierdo de la viga (sin texto)
  entre(xi0 + 26, xi0 + 44, vy0 + 14, vy0 + 30, vz1, vz1 + 0.4, M.amarillo, porticoY);
  sombras(porticoY);

  // ================= Carro X =================
  const carroX = new THREE.Group(); porticoY.add(carroX);
  entre(-62, 66, c + 70, c + 132, -62, -54, M.placa, carroX);    // placa del carro sobre las varillas
  entre(44, 64, c + 36, c + 132, -54, -30, M.negro, carroX);      // columna del eje Z (a la derecha del módulo)
  const husZ = cil(4, 88, rosca, carroX, "y", 16); husZ.position.set(54, c + 84, -24);
  for (const y of [c + 40, c + 128]) entre(47, 61, y - 4, y + 4, -30, -18, M.negro, carroX);
  const resortes = new THREE.InstancedMesh(new THREE.TorusGeometry(5.5, 0.8, 6, 18), M.acero, 8);   // resorte del husillo
  for (let i = 0; i < 8; i++) { m4.makeRotationX(Math.PI / 2).setPosition(54, c + 46 + i * 2.6, -24); resortes.setMatrixAt(i, m4); }
  carroX.add(resortes);
  sombras(carroX);

  // Cruz roja de posicionamiento: proyectada sobre la cama, desplazada (−21.5, −0.5) mm de la boquilla
  const cruz = new THREE.Group(); cruz.visible = false; carroX.add(cruz);
  const rojoCruz = new THREE.MeshBasicMaterial({ color: 0xff2a2a, toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const rot of [0, Math.PI / 2]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(34, 0.7), rojoCruz); l.rotation.set(-Math.PI / 2, 0, rot); cruz.add(l); }
  cruz.position.set(-21.5, c + 0.3, -0.5);

  // ================= Módulo Z (sube y baja el láser) =================
  const modZ = new THREE.Group(); carroX.add(modZ);
  entre(-44, 34, c + 30, c + 98, -54, -46, M.negro, modZ);        // placa deslizante del módulo

  // ---- Cabezal: módulo de 40 W, caja champán con la boquilla al frente-derecha ----
  const cabezal = new THREE.Group(); modZ.add(cabezal);
  const mx = -18, mz = -8, my0 = c + 22, my1 = c + 97;           // caja 96 × 75 × 76 mm; la boquilla queda en (0, 0)
  const cuerpo = redondeada(96, my1 - my0 - 6, 76, 4, M.champan, cabezal); cuerpo.position.set(mx, (my0 + 6 + my1) / 2, mz);
  // Zócalo oscuro con ranuras de ventilación
  entre(mx - 46, mx + 46, my0, my0 + 6.5, mz - 36, mz + 36, M.champanOscuro, cabezal);
  const ranuras = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 3.6, 0.8), M.negro, 14);
  for (let i = 0; i < 14; i++) { m4.makeTranslation(mx - 39 + i * 6, my0 + 3.2, mz + 36.2); ranuras.setMatrixAt(i, m4); }
  cabezal.add(ranuras);
  // Rejilla de aletas arriba: dos paneles de ranuras
  const aletas = new THREE.InstancedMesh(new THREE.BoxGeometry(36, 1, 2.4), M.champanOscuro, 22);
  let k = 0;
  for (const dx of [-21, 21]) for (let i = 0; i < 11; i++) { m4.makeTranslation(mx + dx, my1 + 0.2, mz - 30 + i * 6); aletas.setMatrixAt(k++, m4); }
  cabezal.add(aletas);
  // «40W» al frente (sin logotipo) y la etiqueta amarilla de apertura del láser
  const rotulo = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshBasicMaterial({ map: rotuloTextura(), transparent: true, depthWrite: false }));
  rotulo.position.set(mx - 20, my0 + 22, mz + 38.2); cabezal.add(rotulo);
  entre(mx + 26, mx + 42, my0 + 12, my0 + 22, mz + 38, mz + 38.4, M.amarillo, cabezal);
  // Costado izquierdo: conector y racor del aire asistido
  entre(mx - 48.4, mx - 48, my0 + 30, my0 + 46, mz + 4, mz + 22, M.negro, cabezal);
  const racor = cil(2.2, 6, M.cobre, cabezal, "x", 12); racor.position.set(mx - 51, my0 + 12, mz + 26);
  // Boquilla de aire: cuello y cono de cobre; la punta queda 10 mm sobre el foco
  const cuello = cil(9, 6, M.cobre, cabezal, "y", 28); cuello.position.set(0, c + 19, 0);
  const cono = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 2.6, 6, 28), M.cobre); cono.position.set(0, c + 13, 0); cabezal.add(cono);
  // Sensor de distancia (autoenfoque) entre el módulo y la columna Z, con su palpador
  entre(31, 43, c + 30, c + 72, -4, 10, M.negro, cabezal);
  const palpador = cil(0.8, 16, M.acero, cabezal, "y", 8); palpador.position.set(37, c + 22, 3);
  sombras(modZ);
  rotulo.castShadow = false;

  // Foco del haz (la app cuelga aquí el rayo y el punto)
  const boquilla = new THREE.Object3D(); boquilla.position.set(0, c, 0); cabezal.add(boquilla);

  return {
    fijo, tapa, porticoY, carroX, modZ, cabezal, boquilla, cruz, luz,
    medidas: {
      exterior: { x: EXT.x, y: EXT.z, z: EXT.y },                 // ancho, fondo y alto como en la ficha (ejes de máquina)
      yCama, yPiso,
      centro: new THREE.Vector3(AREA.x / 2, yCama, AREA.y / 2),
      origenEnCaja: { x: OX, z: OZ },                              // desde la esquina trasera izquierda exterior
      caja: { x0: X0, x1: X1, z0: Z0, z1: Z1, y1: yTecho },
      bisagra: { y: yTecho, z: zBisagra },
    },
  };
}

// Panal hexagonal: mosaico repetible (lado de celda de 15 px; 8 columnas × 4 filas de hexágonos por mosaico)
function panalTextura() {
  const s = 15, h = Math.sqrt(3) * s, W = 12 * s, H = Math.round(4 * h);      // 180 × 104 px
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d");
  x.fillStyle = COL.panalFondo; x.fillRect(0, 0, W, H);
  x.strokeStyle = COL.panalPared; x.lineWidth = 2;
  const hy = H / 8;                                              // medio alto de hexágono ajustado al mosaico
  for (let col = -1; col <= 4; col++) for (let fila = -1; fila <= 4; fila++) {
    const cx = col * 3 * s, cy = fila * 2 * hy;
    for (const [ox, oy] of [[0, 0], [1.5 * s, hy]]) {
      x.beginPath();
      for (let i = 0; i <= 6; i++) { const a = (Math.PI / 3) * i; x.lineTo(cx + ox + s * Math.cos(a), cy + oy + hy * Math.sin(a) * (2 / Math.sqrt(3))); }
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Husillo trapecial del eje Z: rayas diagonales que se repiten a lo largo
function roscaMaterial() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 16;
  const x = cv.getContext("2d");
  x.fillStyle = "#9aa0a7"; x.fillRect(0, 0, 64, 16);
  x.strokeStyle = "#5d636a"; x.lineWidth = 3;
  for (let i = -16; i < 80; i += 8) { x.beginPath(); x.moveTo(i, 16); x.lineTo(i + 8, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 12); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.35 });
}

// Potencia del módulo al frente, en el gris claro de las fotos
function rotuloTextura() {
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 104;
  const x = cv.getContext("2d");
  x.font = "600 84px Manrope, 'Segoe UI', sans-serif"; x.textAlign = "left"; x.textBaseline = "middle";
  x.fillStyle = "rgba(245,242,236,0.9)"; x.fillText("40W", 6, 56);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
