// cubiko.js - la Genmitsu Cubiko modelada con primitivas.
//
// No hay CAD público de la máquina (solo del spoilboard). Las proporciones salen de:
//   · medidas oficiales: exterior 300 × 335 × 318 mm, área 145–150 × 110 × 40 mm, 58 mm bajo el pórtico
//   · fotos de la reseña de SainSmart / hardwarepoint (ago 2025): base de dos niveles con chaflanes al
//     frente, torre en «C» gris por fuera y negra por dentro, eje X con dos varillas y husillo trapecial
//     al fondo, carro negro con motor NEMA 17 arriba, cubierta del husillo con «Genmitsu» y rejilla,
//     pinza ER11, franja LED verde y control con pantalla y cruceta al frente, cubierta de acrílico ahumado.
//   · fotos de la Cubiko del Fab Lab (20 oct 2026): E-STOP y ON/OFF en el costado derecho de la base,
//     USB-B y corriente atrás en ese mismo costado; Upgrade Interface, 4th axis y Leveling en la pared
//     derecha por dentro, arriba; barra LED entre la varilla de abajo y el husillo; finales de carrera
//     bajo la varilla de abajo; cama de aluminio con rejilla de roscas y un perno de latón; sujetadores
//     de aluminio con tornillo Allen.
//
// Marco de three (mm): X = X de máquina, Y arriba, Z hacia el usuario. La punta de la fresa corta en
// z = Z_FRESA; la cama se desplaza en z con el eje Y. Devuelve los grupos que el visor anima.

import * as THREE from "three";

// La punta de la fresa queda a 2/5 del fondo desde la tapa: con la cama hasta atrás (Y −110) el borde
// trasero de la cama no llega a la pared del fondo.
export const Z_FRESA = -30;

const COL = {
  base: 0x2b2e33, cubierta: 0x5d626a, cubiertaClara: 0x6e737b, torre: 0x50555c, negro: 0x16181b, interior: 0x1d2024,
  carro: 0x2f3237, husillo: 0x6c7178, aluminio: 0xc9ccd1, acero: 0xbfc4ca, rosca: 0x9aa0a7, motor: 0x232529,
  control: 0x55595f, boton: 0xe9ebee, humo: 0x3a4048, ledApagado: 0x3c4046, conector: 0xeeeae2,
};

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });

export function construirCubiko({ cx, zCama, sombra = true }) {
  const M = {
    base: mat(COL.base, { roughness: 0.7 }), cubierta: mat(COL.cubierta, { roughness: 0.5 }), cubiertaClara: mat(COL.cubiertaClara, { roughness: 0.45 }),
    torre: mat(COL.torre, { roughness: 0.55 }), negro: mat(COL.negro, { roughness: 0.8 }), interior: mat(COL.interior, { roughness: 0.85 }),
    carro: mat(COL.carro, { roughness: 0.6 }), husillo: mat(COL.husillo, { roughness: 0.45 }),
    aluminio: mat(COL.aluminio, { metalness: 0.65, roughness: 0.35 }), acero: mat(COL.acero, { metalness: 0.92, roughness: 0.22 }),
    motor: mat(COL.motor, { metalness: 0.3, roughness: 0.5 }), control: mat(COL.control, { roughness: 0.5 }), boton: mat(COL.boton, { roughness: 0.4 }),
    conector: mat(COL.conector, { roughness: 0.6 }),
  };
  const rosca = roscaMaterial();
  const sombras = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = sombra; m.receiveShadow = true; } }); return o; };
  const caja = (w, h, d, m, x, y, z, padre) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); padre.add(o); return o; };
  const cil = (r, h, m, padre, eje = "y", seg = 32) => {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
    if (eje === "x") o.rotation.z = Math.PI / 2;
    if (eje === "z") o.rotation.x = Math.PI / 2;
    padre.add(o); return o;
  };
  // Prisma desde una planta (x, z) extruida en altura
  const prisma = (pts, y0, h, m, padre) => {
    const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
    const o = new THREE.Mesh(g, m); padre.add(o); return o;
  };
  // Caja redondeada (perfil w × h redondeado, profundidad d en z), centrada
  const redondeada = (w, h, d, r, m, padre, bisel = 1.5) => {
    const s = new THREE.Shape(), x = -w / 2 + bisel, y = -h / 2 + bisel, W = w - 2 * bisel, H = h - 2 * bisel, R = Math.min(r, W / 2, H / 2);
    s.moveTo(x + R, y); s.lineTo(x + W - R, y); s.quadraticCurveTo(x + W, y, x + W, y + R); s.lineTo(x + W, y + H - R);
    s.quadraticCurveTo(x + W, y + H, x + W - R, y + H); s.lineTo(x + R, y + H); s.quadraticCurveTo(x, y + H, x, y + H - R);
    s.lineTo(x, y + R); s.quadraticCurveTo(x, y, x + R, y);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * bisel, bevelEnabled: true, bevelSize: bisel, bevelThickness: bisel, bevelSegments: 3, curveSegments: 8 });
    g.translate(0, 0, -(d - 2 * bisel) / 2);
    const o = new THREE.Mesh(g, m); padre.add(o); return o;
  };
  // Planta con chaflanes en las esquinas del frente
  const planta = (x0, x1, zAtras, zFrente, ch) => [[x0, zAtras], [x1, zAtras], [x1, zFrente - ch], [x1 - ch, zFrente], [x0 + ch, zFrente], [x0, zFrente - ch]];

  const yPiso = zCama - 68;                 // la cama de aluminio queda 68 mm sobre la mesa
  const yCubierta = yPiso + 55;             // cara superior de la base (donde corren las ranuras)
  const yTecho = yPiso + 268, yTope = yPiso + 318;
  const zAtras = -168, zFrente = 167, zTorre = -34;  // 335 de fondo: la torre opaca ocupa 2/5 (134), la tapa ahumada 3/5
  const X0 = cx - 150, X1 = cx + 150, XI0 = cx - 127, XI1 = cx + 127;

  // ================= Fijo =================
  const fijo = new THREE.Group();
  // Base de dos niveles con chaflán al frente
  prisma(planta(X0, X1, zAtras, zFrente, 36), yPiso, 28, M.base, fijo);
  prisma(planta(X0 + 5, X1 - 5, zAtras + 3, zFrente - 6, 32), yPiso + 28, 26, M.cubierta, fijo);
  prisma(planta(X0 + 16, X1 - 16, zTorre, zFrente - 16, 26), yCubierta - 1, 1.6, M.cubiertaClara, fijo);
  // Ranuras por donde baja el carro de la cama (cerca de las orillas de la cama)
  for (const dx of [-70, 70]) caja(7, 1, 164, M.negro, cx + dx, yCubierta + 0.4, Z_FRESA, fijo);   // sus carros van de Z_FRESA−77 a +77
  // Hueco al frente donde asienta la tapa (su sensor: por confirmar)
  const sensorTapa = caja(14, 0.6, 7, M.negro, cx, yCubierta + 0.5, zFrente - 22, fijo);
  // Franja LED (estado) y control con pantalla
  const luz = caja(72, 5, 1.2, new THREE.MeshBasicMaterial({ color: COL.ledApagado }), cx - 72, yPiso + 14, zFrente + 0.4, fijo);   // cx−108…cx−36, dentro del chaflán (cx−114)

  // Costado derecho de la base: E-STOP y ON/OFF al frente, USB-B y corriente atrás.
  // Marco del costado: +z sale de la máquina (+X del mundo), +x va hacia atrás (−Z del mundo).
  const costado = new THREE.Group(); costado.position.set(X1, yPiso, 0); costado.rotation.y = Math.PI / 2; fijo.add(costado);
  const enCostado = (o, z, y) => { o.position.set(-z, y, 0); costado.add(o); return o; };
  const boton = (z, tapaColor) => {
    const g = enCostado(new THREE.Group(), z, 14);
    const bisel = cil(8, 2, mat(0x111214, { roughness: 0.4 }), g, "z", 32); bisel.position.z = 1;
    const tapaB = cil(5.6, 2.4, tapaColor, g, "z", 32); tapaB.position.z = 2.4;
    return { g, tapa: tapaB };
  };
  const paro = boton(73, mat(0xd8392f, { roughness: 0.45 }));
  const encendido = boton(23, mat(0x1b1d20, { roughness: 0.35 }));
  // Símbolo de encendido: anillo abierto y raya, se ilumina con la máquina prendida
  const anilloOn = new THREE.MeshBasicMaterial({ color: 0x55595f });
  const arco = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.45, 8, 32, Math.PI * 1.6), anilloOn); arco.rotation.z = Math.PI / 2 + Math.PI * 0.2; arco.position.z = 3.7; encendido.g.add(arco);
  const raya = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3, 0.3), anilloOn); raya.position.set(0, 1.6, 3.7); encendido.g.add(raya);
  for (const [z, txt] of [[73, "E-STOP"], [23, "ON/OFF"]]) { const r = rotulo(txt, 22, 4.5); enCostado(r, z, 3.6).position.z = 0.15; }
  // Puertos: corriente (clavija en ángulo) arriba y USB-B abajo, casi en la esquina de atrás
  const jack = enCostado(new THREE.Group(), zAtras + 20, 21);
  cil(5, 1.2, mat(0x111214), jack, "z", 24).position.z = 0.4;
  cil(2.6, 1.4, mat(0x050506), jack, "z", 16).position.z = 0.6;
  const usb = enCostado(new THREE.Group(), zAtras + 36, 9);
  caja(14, 13, 1.2, mat(0x111214), 0, 0, 0.4, usb);
  caja(11, 10, 0.6, mat(0x050506), 0, 0, 0.8, usb);
  caja(6, 4.5, 0.4, mat(0x9aa0a7), 0, -0.6, 1.0, usb);
  // Hasta aquí, la base: en las vistas Arriba y Frente es lo único de la parte fija que sigue visible
  for (const o of fijo.children) o.userData.base = true;
  const control = new THREE.Group(); fijo.add(control);
  redondeada(124, 48, 12, 7, M.control, control);
  const pantallaCv = document.createElement("canvas"); pantallaCv.width = 256; pantallaCv.height = 160;
  const pantallaTex = new THREE.CanvasTexture(pantallaCv); pantallaTex.colorSpace = THREE.SRGBColorSpace;
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(50, 31), new THREE.MeshBasicMaterial({ map: pantallaTex, toneMapped: false }));
  pantalla.position.set(-28, 0, 6.2); control.add(pantalla);
  const dpad = new THREE.Group(); dpad.position.set(30, 0, 6.2); control.add(dpad);
  const anillo = new THREE.Mesh(new THREE.TorusGeometry(10, 4.2, 10, 28), M.boton); anillo.scale.z = 0.35; dpad.add(anillo);
  const ok = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 2.4, 24), M.boton); ok.rotation.x = Math.PI / 2; dpad.add(ok);
  for (const [bx, by] of [[-22, 13], [-22, -13], [22, 13], [22, -13]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 2, 18), M.boton); b.rotation.x = Math.PI / 2; b.position.set(bx, by, 0); dpad.add(b); }
  control.position.set(cx + 52, yPiso + 22, zFrente + 9); control.rotation.x = -0.32;

  // Torre en «C»: paredes grises por fuera, negras por dentro, techo y fondo
  for (const lado of [-1, 1]) {
    caja(16, yTope - yCubierta, zTorre - zAtras, M.torre, cx + lado * 135, (yTope + yCubierta) / 2, (zTorre + zAtras) / 2, fijo);
    caja(1.5, yTecho - yCubierta, zTorre - zAtras - 14, M.interior, cx + lado * 126.6, (yTecho + yCubierta) / 2, (zTorre + zAtras) / 2 + 3, fijo);
  }
  caja(254, yTecho - yCubierta, 12, M.torre, cx, (yTecho + yCubierta) / 2, zAtras + 6, fijo);
  caja(253, yTecho - yCubierta - 2, 1.5, M.interior, cx, (yTecho + yCubierta) / 2, zAtras + 12.8, fijo);
  // Ventanas redondeadas del fondo (en las fotos se ve la pared clara detrás)
  for (const dx of [-60, 60]) { const v = redondeada(88, 58, 1, 12, mat(0x3a3f46, { roughness: 0.9 }), fijo, 0.3); v.position.set(cx + dx, yPiso + 186, zAtras + 13.9); }
  const techo = new THREE.Group(); fijo.add(techo);
  caja(300, yTope - yTecho, zTorre - zAtras + 4, M.torre, cx, (yTope + yTecho) / 2, (zTorre + zAtras) / 2 + 2, techo);
  caja(298, 7, 1, M.negro, cx, yTecho + 9, zTorre + 4.1, techo);             // banda oscura del frente del techo

  // Conectores en la pared derecha, por dentro y arriba, cerca del frente (de arriba abajo: Upgrade, 4th axis, Leveling)
  const xPared = cx + 125.8, zCon = zTorre - 22;
  caja(0.6, 64, 30, M.negro, xPared - 0.1, yPiso + 228, zCon, fijo);
  const rot = new THREE.Mesh(new THREE.PlaneGeometry(30, 64), new THREE.MeshBasicMaterial({ map: rotulosConectores(), transparent: true, depthWrite: false }));
  rot.rotation.y = -Math.PI / 2; rot.position.set(xPared - 0.5, yPiso + 228, zCon); fijo.add(rot);
  caja(1.2, 12, 1.6, mat(0x050506), xPared - 0.7, yPiso + 249, zCon - 6, fijo);                 // ranura Upgrade Interface
  const cuartoEje = caja(4, 15, 5.5, M.conector, xPared - 2, yPiso + 230, zCon - 6, fijo);        // 4th axis (6 pines)
  const leveling = new THREE.Group(); leveling.position.set(xPared, yPiso + 211, zCon - 6); fijo.add(leveling);
  caja(4, 7, 5.5, M.conector, -2, 0, 0, leveling);                                                // Leveling (2 pines)
  caja(0.6, 5, 3.5, mat(0x0b0c0e), -4.1, 0, 0, leveling);                                         // boca
  caja(0.4, 7.4, 0.8, mat(0x2f6fd6), -0.2, 0, -3, leveling);                                      // filo azul
  void cuartoEje;
  // Conector suelto que cuelga del techo (el del láser)
  const colgante = new THREE.Group(); colgante.position.set(cx + 108, yTecho, zTorre - 30); fijo.add(colgante);
  cil(1.4, 26, M.negro, colgante, "y", 10).position.y = -13;
  caja(8.5, 6, 4.5, M.conector, 0, -29, 0, colgante);

  // Eje X: dos varillas con sus soportes redondos, husillo trapecial con su cople y barra LED entre los dos
  const largoX = XI1 - XI0;
  const yVarSup = yPiso + 216, yVarInf = yPiso + 150, yRosca = yPiso + 183, zVarillas = Z_FRESA - 78;
  for (const y of [yVarSup, yVarInf]) {
    const r = cil(4, largoX, M.acero, fijo, "x"); r.position.set(cx, y, zVarillas);
    for (const lado of [-1, 1]) { const s = cil(8, 11, M.negro, fijo, "x", 28); s.position.set(cx + lado * 120.5, y, zVarillas); }
  }
  const roscaX = cil(4, largoX - 20, rosca, fijo, "x", 24); roscaX.position.set(cx - 4, yRosca, zVarillas);
  const cople = cil(6.5, 18, M.negro, fijo, "x", 24); cople.position.set(cx + 112, yRosca, zVarillas);
  for (const dx of [-4, 4]) { const p = cil(1.2, 1, mat(0x0b0c0e), fijo, "y", 8); p.position.set(cx + 112 + dx, yRosca + 6.6, zVarillas); }
  const antijuego = cil(5, 10, mat(0xd8dade, { metalness: 0.3, roughness: 0.25, transparent: true, opacity: 0.75 }), fijo, "x", 20); antijuego.position.set(cx - 96, yRosca, zVarillas);
  caja(8, 18, 18, M.negro, cx - 123, yRosca, zVarillas, fijo);
  // Barra LED: detrás de las varillas, entre la de abajo y el husillo
  caja(232, 7, 4, M.negro, cx, yVarInf + 13, zVarillas - 15, fijo);
  const barraLed = caja(226, 4, 1, new THREE.MeshBasicMaterial({ color: 0xf4f6f8 }), cx, yVarInf + 13, zVarillas - 12.6, fijo);
  // Finales de carrera de X: uno en cada pared, bajo la varilla de abajo
  for (const lado of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(cx + lado * 124.5, yVarInf - 24, zVarillas + 8); fijo.add(g);
    caja(3, 13, 16, mat(0x22252a), 0, 0, 0, g);
    caja(4.5, 7, 6, mat(0x0d0e10), -lado * 3.6, 1, -2, g);
    caja(0.6, 6, 9, M.acero, -lado * 6.2, 1, 1, g).rotation.y = lado * 0.25;
  }
  sombras(fijo);
  luz.castShadow = false; barraLed.castShadow = false; rot.castShadow = false;
  // La luz de la barra ilumina la cama
  const lampara = new THREE.SpotLight(0xf6f8ff, 1.1, 0, 0.95, 0.7, 0);
  lampara.position.set(cx, yVarInf + 13, zVarillas - 10);
  lampara.target.position.set(cx, zCama, Z_FRESA + 25);
  fijo.add(lampara, lampara.target);

  // Cubierta de acrílico ahumado (tapa frontal): se quita completa, hacia arriba
  const tapa = new THREE.Group(); fijo.add(tapa);
  const humo = new THREE.MeshPhysicalMaterial({ color: COL.humo, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const bordes = new THREE.LineBasicMaterial({ color: 0x8e939b, transparent: true, opacity: 0.45 });
  const pTapa = [[X0 + 4, zTorre], [X1 - 4, zTorre], [X1 - 4, zFrente - 42], [X1 - 34, zFrente - 12], [X0 + 34, zFrente - 12], [X0 + 4, zFrente - 42]];
  const hTapa = yTope - yCubierta - 2;
  // Paneles: laterales y los tres del frente (la arista 0→1 es la torre)
  for (let i = 1; i < pTapa.length; i++) {
    const [ax, az] = pTapa[i], [bx, bz] = pTapa[(i + 1) % pTapa.length];
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(bx - ax, bz - az), hTapa), humo);
    pan.position.set((ax + bx) / 2, yCubierta + 1 + hTapa / 2, (az + bz) / 2);
    pan.rotation.y = -Math.atan2(bz - az, bx - ax);
    pan.renderOrder = 5; tapa.add(pan);
  }
  const techoTapa = prisma(pTapa, yTope - 1.5, 1.5, humo, tapa); techoTapa.renderOrder = 5;
  const contorno = [];
  for (const y of [yCubierta + 1, yTope]) for (let i = 0; i < pTapa.length; i++) { const a = pTapa[i], b = pTapa[(i + 1) % pTapa.length]; if (i === 0 && y < yTope) continue; contorno.push(a[0], y, a[1], b[0], y, b[1]); }
  for (const [x, z] of pTapa.slice(2)) contorno.push(x, yCubierta + 1, z, x, yTope, z);
  const gB = new THREE.BufferGeometry(); gB.setAttribute("position", new THREE.Float32BufferAttribute(contorno, 3));
  tapa.add(new THREE.LineSegments(gB, bordes));

  // ================= Cama (se mueve en Y) =================
  // Placa de aluminio 186 × 136 con roscas: rejilla de 6 × 5 (paso 32 × 27), cuatro roscas más entre la
  // primera y la segunda columna de cada orilla, y un perno de latón atrás a la derecha (como en la foto)
  const mesa = new THREE.Group();
  const czCama = 55;                        // centro de la cama en coordenadas locales (y de máquina = −55)
  caja(186, 6, 136, M.aluminio, cx, zCama - 3, czCama, mesa);
  const roscas = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) roscas.push([-80 + i * 32, -54 + j * 27]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) roscas.push([sx * 64, sz * 40.5]);
  const hoyo = new THREE.InstancedMesh(new THREE.CircleGeometry(2.5, 18).rotateX(-Math.PI / 2), mat(0x34383e, { roughness: 0.85 }), roscas.length);
  const bocel = new THREE.InstancedMesh(new THREE.RingGeometry(2.5, 3.3, 18).rotateX(-Math.PI / 2), mat(0x8d9299, { metalness: 0.6, roughness: 0.4 }), roscas.length);
  const m4 = new THREE.Matrix4();
  roscas.forEach(([x, z], k) => { m4.makeTranslation(cx + x, zCama + 0.03, czCama + z); hoyo.setMatrixAt(k, m4); bocel.setMatrixAt(k, m4); });
  mesa.add(hoyo, bocel);
  const laton = cil(3, 1.2, mat(0xc8a24a, { metalness: 0.85, roughness: 0.3 }), mesa, "y", 20); laton.position.set(cx + 64, zCama + 0.3, czCama - 54);
  for (const dx of [-70, 70]) caja(12, 14, 44, M.negro, cx + dx, zCama - 13, czCama, mesa);
  sombras(mesa); hoyo.castShadow = bocel.castShadow = false;
  // Rosca de la cama en coordenadas de la mesa (para poner sujetadores)
  const roscaCama = (i, j) => new THREE.Vector3(cx - 80 + i * 32, zCama, czCama - 54 + j * 27);

  // ================= Carro X (se mueve en X) =================
  const carroX = new THREE.Group();
  caja(64, 98, 12, M.carro, 0, (yVarSup + yVarInf) / 2 + 2, zVarillas + 16, carroX);
  for (const y of [yVarSup, yVarInf]) { const b = cil(12, 26, M.carro, carroX, "x", 28); b.position.set(0, y, zVarillas); const a = cil(8, 27, M.acero, carroX, "x", 24); a.position.set(0, y, zVarillas); }
  caja(22, 20, 20, M.carro, 0, yRosca, zVarillas, carroX);
  // Guías del eje Z y su husillo, motor NEMA 17 arriba
  const zZ = Z_FRESA - 42;
  for (const dx of [-17, 17]) { const r = cil(3.5, 150, M.acero, carroX, "y", 20); r.position.set(dx, yPiso + 168, zZ); }
  const roscaZ = cil(3.5, 150, rosca, carroX, "y", 20); roscaZ.position.set(0, yPiso + 168, zZ - 4);
  caja(64, 8, 30, M.carro, 0, yPiso + 236, zZ, carroX);
  caja(42, 34, 42, M.motor, 0, yPiso + 257, zZ - 6, carroX);
  for (const dy of [-15.5, 15.5]) caja(42.5, 3, 42.5, mat(0xaab0b7, { metalness: 0.7, roughness: 0.35 }), 0, yPiso + 257 + dy, zZ - 6, carroX);
  sombras(carroX);

  // ================= Husillo (se mueve en Z; la punta en y = 0) =================
  const husillo = new THREE.Group();
  const zH = Z_FRESA;
  // Herramienta intercambiable: punta en V, fresa de maíz o broca (ponerHerramienta)
  const herramienta = new THREE.Group(); herramienta.position.z = zH; husillo.add(herramienta);
  herramienta.userData.fresa = true;    // lo único del husillo que queda en Arriba y Frente
  const ponerHerramienta = (tipo) => {
    for (const o of [...herramienta.children]) herramienta.remove(o);
    herramienta.add(construirHerramienta(tipo)); sombras(herramienta);
    herramienta.userData.tipo = tipo;
  };
  ponerHerramienta("v");
  const tuerca = cil(9.5, 9, mat(COL.acero, { metalness: 0.92, roughness: 0.22, flatShading: true }), husillo, "y", 6); tuerca.position.set(0, 17.5, zH);     // tuerca hexagonal de la pinza ER11
  const nariz = cil(13, 12, mat(0x3a3e44, { metalness: 0.5, roughness: 0.4 }), husillo, "y", 32); nariz.position.set(0, 28, zH);
  const cuerpo = redondeada(52, 58, 52, 10, M.husillo, husillo); cuerpo.position.set(0, 34 + 29, zH + 2);
  const cabeza = redondeada(46, 30, 48, 9, M.husillo, husillo); cabeza.position.set(0, 92 + 15, zH);
  // Rejilla de ventilación y logotipo al frente
  const rejilla = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 2.2, 1), M.negro, 18);
  let k = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { m4.makeTranslation(-12.5 + i * 5, 99 + j * 4, zH + 24.2); rejilla.setMatrixAt(k++, m4); }
  husillo.add(rejilla);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(38, 7), new THREE.MeshBasicMaterial({ map: logoTextura(), transparent: true, depthWrite: false }));
  logo.position.set(0, 116, zH + 24.3); husillo.add(logo);
  // placa trasera que une la cubierta con el carro Z
  caja(40, 70, 20, M.carro, 0, 70, zH - 34, husillo);
  sombras(husillo); logo.castShadow = false;

  return {
    fijo, mesa, carroX, husillo, luz, techo, tapa, control, lampara, barraLed, sensorTapa,
    botones: { paro: paro.tapa, encendido: encendido.tapa, simbolo: anilloOn },
    puertos: { usb, jack, leveling },
    roscaCama, ponerHerramienta,
    pantalla: { cv: pantallaCv, tex: pantallaTex },
    medidas: { yPiso, yCubierta, yTope, zAtras, zFrente, zTorre },
  };
}

// Las tres herramientas que se usan en PCB, con la punta en el origen y el vástago (1/8") hacia arriba.
// Se distinguen a simple vista: la V es un cono afilado, la de maíz un cilindro rayado en rombos con la
// punta plana, y la broca es delgada, con hélice, punta de 118° y un anillo de color en el vástago.
export function construirHerramienta(tipo) {
  const g = new THREE.Group();
  const acero = mat(COL.acero, { metalness: 0.92, roughness: 0.22 });
  const pieza = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; g.add(o); return o; };
  if (tipo === "maiz") {
    pieza(new THREE.CylinderGeometry(1.6, 1.6, 18, 20), acero, 12 + 9);
    pieza(new THREE.CylinderGeometry(1.6, 1.6, 12, 24), texturaMaiz(), 6);
  } else if (tipo === "broca") {
    pieza(new THREE.CylinderGeometry(1.6, 1.6, 17, 20), acero, 13 + 8.5);
    pieza(new THREE.CylinderGeometry(2.7, 2.7, 2.4, 24), mat(0x2a6fd6, { roughness: 0.5 }), 12);
    pieza(new THREE.CylinderGeometry(1.6, 0.5, 2.5, 20), acero, 9.6);
    pieza(new THREE.CylinderGeometry(0.5, 0.5, 7.8, 14), texturaHelice(), 0.5 + 3.9);
    pieza(new THREE.ConeGeometry(0.5, 0.5, 14).rotateX(Math.PI), acero, 0.25);
  } else {
    pieza(new THREE.CylinderGeometry(1.6, 1.6, 21, 20), acero, 9 + 10.5);
    pieza(new THREE.CylinderGeometry(1.6, 0.04, 9, 24), mat(0x2b2e33, { metalness: 0.7, roughness: 0.3 }), 4.5);
  }
  return g;
}

// Sujetador de aluminio con su tornillo Allen de cabeza plana y arandela. Marco: la lengüeta que pisa la
// placa mira a +X, el pie apoya en la cama (y = 0) y el tornillo pasa por la ranura en x = 0.
// Devuelve { grupo, tornillo }: el tornillo baja en y (0 = apretado) y gira sobre su eje.
export function crearSujetador({ grosorPlaca = 1.6 } = {}) {
  const alu = mat(0xd3d6da, { metalness: 0.6, roughness: 0.32 });
  const grupo = new THREE.Group();
  const yBarra = grosorPlaca + 0.8;
  // Barra vista desde arriba: rectángulo con ranura alargada y un hoyo chico, extruida en altura
  const s = new THREE.Shape(); s.moveTo(-20, -7); s.lineTo(16, -7); s.lineTo(16, 7); s.lineTo(-20, 7); s.lineTo(-20, -7);
  const ranura = new THREE.Path(); ranura.absarc(7, 0, 2.4, -Math.PI / 2, Math.PI / 2, false); ranura.absarc(-7, 0, 2.4, Math.PI / 2, Math.PI * 1.5, false);
  const chico = new THREE.Path(); chico.absarc(-15.5, 0, 1.3, 0, Math.PI * 2, true);
  s.holes.push(ranura, chico);
  const gBarra = new THREE.ExtrudeGeometry(s, { depth: 4.6, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 1 });
  gBarra.rotateX(Math.PI / 2); gBarra.translate(0, yBarra + 4.6 + 0.4, 0);
  const barra = new THREE.Mesh(gBarra, alu); grupo.add(barra);
  const caja = (w, h, d, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), alu); o.position.set(x, y, z); grupo.add(o); return o; };
  caja(6, yBarra + 4.6, 14, -23, (yBarra + 4.6) / 2, 0);          // pie
  caja(3, 2.2, 14, -27.5, 1.1, 0);                                // ceja del pie
  caja(5, 1.8, 10, 18.5, grosorPlaca + 0.9, 0);                    // lengüeta que pisa la placa
  // Tornillo: cabeza cilíndrica baja con hexágono, arandela y cuerda M4
  const tornillo = new THREE.Group(); grupo.add(tornillo);
  const negro = mat(0x2a2c30, { metalness: 0.7, roughness: 0.35 });
  const t = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; tornillo.add(o); return o; };
  const yApoyo = yBarra + 5.4;
  t(new THREE.CylinderGeometry(5, 5, 0.8, 28), mat(0xc4c8ce, { metalness: 0.9, roughness: 0.25 }), yApoyo + 0.4);
  t(new THREE.CylinderGeometry(3.8, 4, 2.6, 28), negro, yApoyo + 0.8 + 1.3);
  t(new THREE.CylinderGeometry(1.45, 1.45, 0.4, 6), mat(0x050506), yApoyo + 0.8 + 2.45);
  t(new THREE.CylinderGeometry(2, 2, 12, 16), negro, yApoyo - 6);
  tornillo.userData.tope = yApoyo + 3.4;      // cara de la cabeza (donde entra la llave)
  grupo.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { grupo, tornillo };
}

// Husillo trapecial: rayas diagonales que se repiten a lo largo
function roscaMaterial() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 16;
  const x = cv.getContext("2d");
  x.fillStyle = "#9aa0a7"; x.fillRect(0, 0, 64, 16);
  x.strokeStyle = "#5d636a"; x.lineWidth = 3;
  for (let i = -16; i < 80; i += 8) { x.beginPath(); x.moveTo(i, 16); x.lineTo(i + 8, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 30); t.colorSpace = THREE.SRGBColorSpace;
  t.rotation = Math.PI / 2;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.35 });
}

// Fresa de maíz: rombos oscuros sobre acero (dos hélices cruzadas)
function texturaMaiz() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
  const x = cv.getContext("2d");
  x.fillStyle = "#3c4046"; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = "#c9ced4"; x.lineWidth = 3;
  for (let i = -64; i < 128; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.7, roughness: 0.35 });
}

// Broca: hélice de dos canales
function texturaHelice() {
  const cv = document.createElement("canvas"); cv.width = 64; cv.height = 64;
  const x = cv.getContext("2d");
  x.fillStyle = "#c4c9cf"; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = "#4a4f56"; x.lineWidth = 9;
  for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 64, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 3); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.3 });
}

// Rótulo plano (texto claro sobre transparente), ancho × alto en mm
function rotulo(txt, w, h) {
  const cv = document.createElement("canvas"); cv.width = Math.round(w * 16); cv.height = Math.round(h * 16);
  const x = cv.getContext("2d");
  x.font = `700 ${Math.round(h * 11)}px Manrope, 'Segoe UI', sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = "rgba(40,42,46,0.95)"; x.fillText(txt, cv.width / 2, cv.height / 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
}

// Rótulos de la pared derecha, en vertical como en la máquina (30 × 64 mm)
function rotulosConectores() {
  const cv = document.createElement("canvas"); cv.width = 240; cv.height = 512;
  const x = cv.getContext("2d");
  x.fillStyle = "#e6e8eb"; x.font = "700 30px Manrope, 'Segoe UI', sans-serif"; x.textBaseline = "middle";
  const vertical = (txt, cxp, cyp) => { x.save(); x.translate(cxp, cyp); x.rotate(-Math.PI / 2); x.textAlign = "center"; x.fillText(txt, 0, 0); x.restore(); };
  vertical("Upgrade", 150, 70); vertical("Interface", 186, 70);
  vertical("4th axis", 168, 232);
  vertical("Leveling", 168, 390);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function logoTextura() {
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 96;
  const x = cv.getContext("2d");
  x.font = "italic 800 64px Manrope, 'Segoe UI', sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = "rgba(225,228,232,0.92)"; x.fillText("Genmitsu", 256, 50);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Pantalla del control: lo mismo que muestra la Cubiko (estado y posición de trabajo)
export function pintarPantalla(p, { conectado, estado, wpos }) {
  const x = p.cv.getContext("2d"), W = p.cv.width, H = p.cv.height;
  x.fillStyle = "#0b0d10"; x.fillRect(0, 0, W, H);
  if (!conectado) {
    x.fillStyle = "#e9ebee"; x.font = "italic 800 30px Manrope, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("Genmitsu", W / 2, H / 2 - 6);
    x.fillStyle = "#7c828a"; x.font = "600 13px Manrope, sans-serif"; x.fillText("Cubiko", W / 2, H / 2 + 22);
  } else {
    const al = estado === "Alarm", col = al ? "#ff3b47" : estado === "Idle" ? "#3ddc84" : "#5b9cff";
    x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.roundRect(10, 10, 86, 28, 8); x.stroke();
    x.fillStyle = col; x.font = "800 17px Manrope, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(al ? "ALARM" : String(estado || "").toUpperCase().slice(0, 5), 53, 25);
    x.textAlign = "left"; x.font = "500 15px 'IBM Plex Mono', monospace";
    x.fillStyle = "#cfd3d8"; x.fillText("Wpos", 14, 58);
    ["X", "Y", "Z"].forEach((e, i) => {
      const v = wpos?.[e.toLowerCase()] ?? 0;
      x.fillStyle = "#8e939b"; x.fillText(e, 14, 84 + i * 24);
      x.fillStyle = "#e9ebee"; x.fillText((v >= 0 ? " " : "") + v.toFixed(3).padStart(8, " "), 40, 84 + i * 24);
    });
    x.fillStyle = "#3ddc84"; x.beginPath(); x.roundRect(176, 52, 66, 22, 5); x.fill();
    x.fillStyle = "#0b0d10"; x.font = "700 12px Manrope, sans-serif"; x.textAlign = "center"; x.fillText("X0Y0", 209, 64);
    x.fillStyle = "#2a78d6"; x.beginPath(); x.roundRect(176, 82, 66, 22, 5); x.fill();
    x.fillStyle = "#ffffff"; x.fillText("Probe", 209, 94);
  }
  p.tex.needsUpdate = true;
}
