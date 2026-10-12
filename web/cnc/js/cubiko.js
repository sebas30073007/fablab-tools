// cubiko.js - la Genmitsu Cubiko modelada con primitivas.
//
// No hay CAD público de la máquina (solo del spoilboard). Las proporciones salen de:
//   · medidas oficiales: exterior 300 × 335 × 318 mm, área 145–150 × 110 × 40 mm, 58 mm bajo el pórtico
//   · fotos de la reseña de SainSmart / hardwarepoint (ago 2025): base de dos niveles con chaflanes al
//     frente, torre en «C» gris por fuera y negra por dentro, eje X con dos varillas y husillo trapecial
//     al fondo, barra LED bajo la varilla inferior, carro gris con motor NEMA 17 arriba, cubierta del
//     husillo con «Genmitsu» y rejilla, pinza ER11, cama de aluminio con roscas M5 que corre en Y por dos
//     ranuras, franja LED verde y control con pantalla y cruceta al frente, cubierta de acrílico ahumado.
//
// Marco de three (mm): X = X de máquina, Y arriba, Z hacia el usuario. La punta de la fresa corta en
// z = Z_FRESA; la cama se desplaza en z con el eje Y. Devuelve los grupos que el visor anima.

import * as THREE from "three";

// La punta de la fresa queda a 2/5 del fondo desde la tapa: con la cama hasta atrás (Y −110) el borde
// trasero de la cama no llega a la pared del fondo.
export const Z_FRESA = -30;

const COL = {
  base: 0x2b2e33, cubierta: 0x5d626a, cubiertaClara: 0x6e737b, torre: 0x50555c, negro: 0x16181b, interior: 0x1d2024,
  carro: 0x60656c, husillo: 0x6c7178, aluminio: 0xc9ccd1, acero: 0xbfc4ca, rosca: 0x9aa0a7, motor: 0x232529,
  control: 0x55595f, boton: 0xe9ebee, humo: 0x3a4048, ledApagado: 0x3c4046,
};

export function construirCubiko({ cx, zCama, sombra = true }) {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...o });
  const M = {
    base: mat(COL.base, { roughness: 0.7 }), cubierta: mat(COL.cubierta, { roughness: 0.5 }), cubiertaClara: mat(COL.cubiertaClara, { roughness: 0.45 }),
    torre: mat(COL.torre, { roughness: 0.55 }), negro: mat(COL.negro, { roughness: 0.8 }), interior: mat(COL.interior, { roughness: 0.85 }),
    carro: mat(COL.carro, { roughness: 0.5 }), husillo: mat(COL.husillo, { roughness: 0.45 }),
    aluminio: mat(COL.aluminio, { metalness: 0.65, roughness: 0.35 }), acero: mat(COL.acero, { metalness: 0.92, roughness: 0.22 }),
    motor: mat(COL.motor, { metalness: 0.3, roughness: 0.5 }), control: mat(COL.control, { roughness: 0.5 }), boton: mat(COL.boton, { roughness: 0.4 }),
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
  // Ranuras por donde baja el carro de la cama
  for (const dx of [-42, 42]) caja(16, 1, 164, M.negro, cx + dx, yCubierta + 0.4, Z_FRESA, fijo);   // sus carros van de Z_FRESA−77 a +77
  // Franja LED (estado) y control con pantalla
  const luz = caja(72, 5, 1.2, new THREE.MeshBasicMaterial({ color: COL.ledApagado }), cx - 72, yPiso + 14, zFrente + 0.4, fijo);   // cx−108…cx−36, dentro del chaflán (cx−114)
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
  caja(30, 3, 4, M.negro, cx, yTecho + 3, zTorre + 3, techo);                // asa para abrir la tapa
  // Placa de conexiones en la pared derecha (Upgrade, 4th axis, Leveling)
  caja(1.5, 46, 14, M.negro, cx + 125.6, yPiso + 205, -112, fijo);
  for (let i = 0; i < 3; i++) caja(2, 6, 8, M.boton, cx + 124.5, yPiso + 220 - i * 14, -112, fijo);

  // Eje X: dos varillas, husillo trapecial y barra LED
  const largoX = XI1 - XI0;
  const yVarSup = yPiso + 216, yVarInf = yPiso + 150, yRosca = yPiso + 183, zVarillas = Z_FRESA - 78;
  for (const y of [yVarSup, yVarInf]) { const r = cil(4, largoX, M.acero, fijo, "x"); r.position.set(cx, y, zVarillas); }
  const roscaX = cil(4, largoX, rosca, fijo, "x", 24); roscaX.position.set(cx, yRosca, zVarillas);
  for (const lado of [-1, 1]) for (const y of [yVarSup, yVarInf, yRosca]) caja(8, 14, 16, M.negro, cx + lado * 123, y, zVarillas, fijo);
  const barraLed = caja(226, 5, 3, new THREE.MeshBasicMaterial({ color: 0xf4f6f8 }), cx, yVarInf - 13, zVarillas - 4, fijo);
  void barraLed;
  sombras(fijo);
  luz.castShadow = false;

  // Cubierta de acrílico ahumado (tapa frontal)
  const tapa = new THREE.Group(); fijo.add(tapa);
  const humo = new THREE.MeshPhysicalMaterial({ color: COL.humo, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const bordes = new THREE.LineBasicMaterial({ color: 0x8e939b, transparent: true, opacity: 0.35 });
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
  const mesa = new THREE.Group();
  const czCama = 55;                        // centro de la cama en coordenadas locales (y de máquina = −55)
  caja(170, 6, 124, M.aluminio, cx, zCama - 3, czCama, mesa);
  const nx = 8, nz = 6, paso = 20;
  const agujeros = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 14), mat(0x4b5057, { roughness: 0.8 }), nx * nz);
  const m4 = new THREE.Matrix4(); let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { m4.makeTranslation(cx - ((nx - 1) * paso) / 2 + i * paso, zCama + 0.02, czCama - ((nz - 1) * paso) / 2 + j * paso); agujeros.setMatrixAt(k++, m4); }
  mesa.add(agujeros);
  for (const dx of [-42, 42]) caja(14, 14, 44, M.negro, cx + dx, zCama - 13, czCama, mesa);
  sombras(mesa); agujeros.castShadow = false;

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
  const fresa = cil(1.6, 18, M.acero, husillo, "y", 16); fresa.position.set(0, 9 + 3, zH);
  const punta = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 16), mat(0xd9a441, { metalness: 0.8, roughness: 0.3 }));
  punta.rotation.x = Math.PI; punta.position.set(0, 1.5, zH); husillo.add(punta);
  const tuerca = cil(9.5, 9, M.acero, husillo, "y", 12); tuerca.position.set(0, 17.5, zH);
  const nariz = cil(13, 12, mat(0x3a3e44, { metalness: 0.5, roughness: 0.4 }), husillo, "y", 32); nariz.position.set(0, 28, zH);
  const cuerpo = redondeada(52, 58, 52, 10, M.husillo, husillo); cuerpo.position.set(0, 34 + 29, zH + 2);
  const cabeza = redondeada(46, 30, 48, 9, M.husillo, husillo); cabeza.position.set(0, 92 + 15, zH);
  // Rejilla de ventilación y logotipo al frente
  const rejilla = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 2.2, 1), M.negro, 18);
  k = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { m4.makeTranslation(-12.5 + i * 5, 99 + j * 4, zH + 24.2); rejilla.setMatrixAt(k++, m4); }
  husillo.add(rejilla);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(38, 7), new THREE.MeshBasicMaterial({ map: logoTextura(), transparent: true, depthWrite: false }));
  logo.position.set(0, 116, zH + 24.3); husillo.add(logo);
  // placa trasera que une la cubierta con el carro Z
  caja(40, 70, 20, M.carro, 0, 70, zH - 34, husillo);
  sombras(husillo); logo.castShadow = false;

  return {
    fijo, mesa, carroX, husillo, luz, techo, tapa, control,
    pantalla: { cv: pantallaCv, tex: pantallaTex },
    medidas: { yPiso, yCubierta, yTope, zAtras, zFrente },
  };
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
