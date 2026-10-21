// pika-modelo.js - el escáner Creality Pika y sus accesorios, modelados con primitivas.
//
// No hay CAD público del Pika (busqué el 21 oct 2026 en Printables, MakerWorld, Thingiverse y GrabCAD).
// Las cotas salen de (detalle en docs/pika-modelo.md):
//   · ficha oficial: 100 × 60 × 35 mm, 260 g, pantalla táctil de 3", Wi-Fi 6, USB-C 3.0
//   · nueve fotos del Pika del laboratorio (21 oct 2026), medidas sobre la foto de frente casi ortogonal:
//     dos discos de cámara de Ø26.5 a 15 mm de los costados, la píldora central de 39.5 × 19, todo a
//     17.5 mm del techo; arriba encendido, rejilla y disparo; a la derecha el interruptor USB/WLAN y la
//     tapa de la batería; a la izquierda el USB-C con tornillo de seguro y el ojal del cordón
//   · reseña de CNX Software: cada cámara 3D lleva 2 luces blancas/azules y 2 infrarrojas; al centro
//     van el proyector DOE (NIR), el láser azul de 7 líneas paralelas y la cámara RGB
//
// Marco de three (mm): X a la derecha mirando el frente, Y arriba, Z hacia donde mira el escáner (las
// lentes ven +Z; la pantalla queda en −Z). El origen es el centro de la cara de abajo, donde está la
// rosca de 1/4", así que el escáner se monta en el tripié sin desplazarlo.
// No lleva el logotipo ni la palabra de la marca, igual que la Cubiko y la S1.

import * as THREE from "three";

export const PIKA = { x: 100, y: 60, z: 35 };

const COL = {
  cuerpo: 0x2b2d31, frente: 0x1f2124, bisel: 0x2a2c30, vidrio: 0x050608, tapa: 0x232529,
  metal: 0xb9bdc2, lente: 0x10141c, ledBlanco: 0xf3e3a6, ledIR: 0x9aa1a8, chip: 0x2c2620,
  hule: 0x141516, grip: 0x1e2023, marcaAnillo: 0x3a3c40, marcaGris: 0x2a2b2e, retro: 0xc9cbce,
};

// Utilidades compartidas por las piezas
function herramientas(sombra) {
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
  const vidrio = (color = COL.vidrio, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.06, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, ...o });
  const sombras = (o) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = sombra; m.receiveShadow = true; } }); return o; };
  // Rectángulo redondeado (w × h, radio r) como Shape, centrado
  const rr = (w, h, r, Clase = THREE.Shape) => {
    const s = new Clase(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
    s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    return s;
  };
  // Losa: una forma extruida en Z de z0 a z1, con bisel que redondea los cantos sin cambiar la medida
  const losa = (forma, z0, z1, m, padre, bisel = 0, seg = 3) => {
    const g = new THREE.ExtrudeGeometry(forma, {
      depth: Math.max(0.01, z1 - z0 - 2 * bisel), curveSegments: 16, bevelEnabled: bisel > 0,
      bevelSize: bisel, bevelThickness: bisel, bevelOffset: -bisel, bevelSegments: seg,
    });
    g.translate(0, 0, z0 + bisel);
    const o = new THREE.Mesh(g, m); padre.add(o); return o;
  };
  const cil = (r, h, m, padre, seg = 40, r2 = r) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), m); padre.add(o); return o; };
  // Cilindro con el eje en Z (para lentes y biseles del frente), de z0 a z1
  const disco = (r, z0, z1, m, padre, x = 0, y = 0, seg = 48) => {
    const o = cil(r, z1 - z0, m, padre, seg); o.rotation.x = Math.PI / 2; o.position.set(x, y, (z0 + z1) / 2); return o;
  };
  const tex = (w, h, dibujar) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    dibujar(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  };
  return { mat, vidrio, sombras, rr, losa, cil, disco, tex };
}

// ================= El escáner =================
export function construirPika({ sombra = true } = {}) {
  const { mat, vidrio, sombras, rr, losa, cil, disco, tex } = herramientas(sombra);
  const M = {
    cuerpo: mat(COL.cuerpo, { roughness: 0.55 }),
    frente: mat(COL.frente, { roughness: 0.32, metalness: 0.15 }),
    bisel: mat(COL.bisel, { roughness: 0.22, metalness: 0.75 }),
    vidrio: vidrio(),
    tapa: mat(COL.tapa, { roughness: 0.5 }),
    metal: mat(COL.metal, { roughness: 0.3, metalness: 0.9 }),
    lente: vidrio(COL.lente, { roughness: 0.02, iridescence: 0.6, iridescenceIOR: 1.4 }),
    anilloLente: mat(0x08090a, { roughness: 0.45 }),
    chip: mat(COL.chip, { roughness: 0.5 }),
    hule: mat(COL.hule, { roughness: 0.9 }),
    hueco: mat(0x050505, { roughness: 1 }),
  };
  const raiz = new THREE.Group(); raiz.name = "pika";
  const W = PIKA.x, H = PIKA.y, yc = H / 2;
  const cuerpo = new THREE.Group(); cuerpo.position.y = yc; raiz.add(cuerpo);   // dentro de cuerpo, (0,0,0) = centro de la caja

  // ---- Casco: 100 × 60, esquinas de r 5.5 vistas de frente y cantos redondeados atrás y adelante ----
  const zAtras = -15.5, zFrente = 14.0;
  losa(rr(W, H, 5.5), zAtras, zFrente, M.cuerpo, cuerpo, 3, 4);
  // Tapa trasera con la pantalla: un escalón de 2 mm, un poco más chica que el casco
  const zVidrio = -17.2;
  losa(rr(W - 3, H - 3, 4.6), zVidrio + 0.3, zAtras + 0.5, M.tapa, cuerpo, 0.8);
  // Cristal: 80 × 49, centrado y 1 mm más abajo (foto de atrás)
  const cristal = losa(rr(80, 49, 2.6), zVidrio, zVidrio + 0.4, M.vidrio, cuerpo, 0.15, 2);
  cristal.position.y = -1;
  // Pantalla de 3" (64 × 40) bajo el cristal: un lienzo que la app puede redibujar
  const lienzo = document.createElement("canvas"); lienzo.width = 640; lienzo.height = 400;
  const texPantalla = new THREE.CanvasTexture(lienzo); texPantalla.colorSpace = THREE.SRGBColorSpace;
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(64, 40),
    new THREE.MeshBasicMaterial({ map: texPantalla, toneMapped: false, transparent: true, opacity: 0.92 }));
  pantalla.rotation.y = Math.PI; pantalla.position.set(1.5, -1, zVidrio - 0.02); cuerpo.add(pantalla);
  pantalla.userData.dibujar = (estado = "apagada") => dibujarPantalla(lienzo, estado, texPantalla);
  pantalla.userData.dibujar("apagada");

  // ---- Frente: placa satinada, 1.2 mm más chica que el casco ----
  const zPlaca = zFrente - 0.6, zCara = 15.6;
  losa(rr(W - 2.4, H - 2.4, 4.6), zPlaca, zCara, M.frente, cuerpo, 0.5);

  const yOjos = H / 2 - 17.5;          // eje de los discos y de la píldora: 17.5 mm bajo el techo
  const ojos = [];
  // Luces: blancas (rectangulares, fósforo amarillo) a los lados de cada cámara; infrarrojas (redondas) arriba y abajo
  const ledsBlancos = [], ledsIR = [];
  const matLedBlanco = () => mat(COL.ledBlanco, { roughness: 0.35, emissive: 0x000000, emissiveIntensity: 2.2 });
  const matLedIR = () => vidrio(COL.ledIR, { roughness: 0.1, transparent: true, opacity: 0.55, emissive: 0x000000, emissiveIntensity: 1.6 });
  for (const lado of [-1, 1]) {
    const ojo = new THREE.Group(); ojo.position.set(lado * (W / 2 - 15), yOjos, 0); cuerpo.add(ojo); ojos.push(ojo);
    // Bisel: anillo metálico oscuro de Ø26.5 que sobresale 1.9 mm, con el canto pulido
    const anillo = new THREE.Shape(); anillo.absarc(0, 0, 13.25, 0, Math.PI * 2);
    const hueco = new THREE.Path(); hueco.absarc(0, 0, 12.1, 0, Math.PI * 2, true); anillo.holes.push(hueco);
    losa(anillo, zCara - 0.2, 17.5, M.bisel, ojo, 0.35, 3);
    disco(12.15, zCara - 0.2, 17.0, M.vidrio, ojo, 0, 0, 64);
    const zv = 17.0;
    // Cámara: barril negro de Ø8.4 con la lente de Ø4.2
    disco(4.2, zv - 0.4, zv + 0.15, M.anilloLente, ojo);
    disco(3.1, zv, zv + 0.25, M.bisel, ojo);
    disco(2.1, zv + 0.05, zv + 0.32, M.lente, ojo);
    // Luces blancas: ventana de 3.1 × 4.2 a ±8 mm, con el fósforo y la pista del dado
    for (const s of [-1, 1]) {
      const v = losa(rr(3.3, 4.4, 0.5), zv - 0.2, zv + 0.12, M.anilloLente, ojo); v.position.x = s * 8;
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), matLedBlanco()); f.position.set(s * 8, 0, zv + 0.14); ojo.add(f); ledsBlancos.push(f);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), M.chip); d.position.set(s * 8 + 0.35, -0.3, zv + 0.15); ojo.add(d);
    }
    // Infrarrojas: domo transparente de Ø3.8 a ±7.7 mm con el dado oscuro adentro
    for (const s of [-1, 1]) {
      disco(1.9, zv - 0.2, zv + 0.1, M.anilloLente, ojo, 0, s * 7.7);
      const domo = new THREE.Mesh(new THREE.SphereGeometry(1.75, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), matLedIR());
      domo.rotation.x = Math.PI / 2; domo.scale.y = 0.55; domo.position.set(0, s * 7.7, zv + 0.1); ojo.add(domo); ledsIR.push(domo);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), M.chip); d.position.set(0, s * 7.7, zv + 0.12); ojo.add(d);
    }
  }

  // ---- Píldora central (39.5 × 19): proyector DOE, láser azul de 7 líneas y cámara RGB ----
  const pildora = new THREE.Group(); pildora.position.set(0, yOjos, 0); cuerpo.add(pildora);
  const pf = rr(39.5, 18.9, 9.45), ph = rr(37.4, 16.8, 8.4, THREE.Path); pf.holes.push(ph);
  losa(pf, zCara - 0.2, 17.1, M.bisel, pildora, 0.35, 3);
  losa(rr(37.5, 16.9, 8.45), zCara - 0.2, 16.6, M.vidrio, pildora, 0.1, 2);
  const zp = 16.6;
  // Proyector DOE (NIR): ventana cuadrada de 6 mm con el emisor claro al centro, y el sensor de luz debajo
  const doe = new THREE.Group(); doe.position.x = -13.3; pildora.add(doe);
  losa(rr(6.2, 6.2, 1.2), zp - 0.3, zp + 0.25, M.anilloLente, doe);
  losa(rr(4.4, 4.4, 0.8), zp, zp + 0.3, M.bisel, doe);
  const emisor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat(0x9fb3a8, { roughness: 0.25, metalness: 0.4, emissive: 0x000000, emissiveIntensity: 1.5 }));
  emisor.position.z = zp + 0.32; doe.add(emisor);
  disco(0.55, zp - 0.1, zp + 0.12, M.anilloLente, doe, 0, -5.6, 16);
  // Láser azul: barril de Ø12.2 que asoma, con la ventana vertical de 3.2 × 6.8 y la varilla de vidrio estriada
  const laser = new THREE.Group(); laser.position.x = -1.1; pildora.add(laser);
  disco(6.1, zp - 0.3, zp + 0.55, M.anilloLente, laser, 0, 0, 56);
  disco(5.0, zp + 0.3, zp + 0.75, M.bisel, laser, 0, 0, 56);
  losa(rr(3.6, 7.2, 0.8), zp + 0.5, zp + 0.95, M.hueco, laser);
  const varilla = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 6.2), new THREE.MeshPhysicalMaterial({
    map: tex(64, 128, (g, w, h) => { g.fillStyle = "#b8c4cc"; g.fillRect(0, 0, w, h); g.fillStyle = "#56616a"; for (let y = 6; y < h; y += 16) g.fillRect(0, y, w, 5); g.fillStyle = "#e9f0f4"; g.fillRect(w * 0.3, 0, w * 0.18, h); }),
    roughness: 0.1, metalness: 0.3, clearcoat: 1, emissive: 0x000000, emissiveIntensity: 2,
  }));
  varilla.position.z = zp + 0.97; laser.add(varilla);
  // Cámara RGB: lente de Ø7.7 cerca del extremo derecho
  const rgb = new THREE.Group(); rgb.position.x = 15.7; pildora.add(rgb);
  disco(3.85, zp - 0.3, zp + 0.2, M.anilloLente, rgb);
  disco(2.6, zp, zp + 0.3, M.bisel, rgb);
  disco(1.6, zp + 0.1, zp + 0.36, M.lente, rgb);

  // ---- Techo (y = 30): encendido, rejilla del ventilador y disparo, al centro del fondo ----
  const yTecho = H / 2;
  const icono = (dibujar) => tex(128, 128, (g, w) => {
    g.fillStyle = "#1a1b1e"; g.fillRect(0, 0, w, w);
    g.strokeStyle = "#d9dbde"; g.fillStyle = "#d9dbde"; g.lineWidth = 7; g.lineCap = "round"; g.lineJoin = "round"; dibujar(g, w);
  });
  const boton = (x, mapa) => {
    const b = new THREE.Group(); b.position.set(x, yTecho, -0.5); cuerpo.add(b);
    const aro = cil(5.1, 0.5, M.hueco, b, 40); aro.position.y = -0.1;
    // grupos del cilindro: costado, tapa de arriba (con el icono), tapa de abajo
    const c = cil(4.75, 0.9, [mat(0x1a1b1e, { roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: mapa, roughness: 0.4 }), M.hueco], b, 40);
    c.position.y = 0.45; c.rotation.y = Math.PI;   // el icono se lee desde atrás, donde está la persona
    return b;
  };
  const encender = boton(25, icono((g, w) => { g.beginPath(); g.arc(w / 2, w / 2 + 4, 26, -Math.PI * 0.33, Math.PI * 1.33); g.stroke(); g.beginPath(); g.moveTo(w / 2, w / 2 - 28); g.lineTo(w / 2, w / 2 + 2); g.stroke(); }));
  const disparo = boton(-25, icono((g, w) => { g.beginPath(); g.moveTo(w / 2 - 18, w / 2 - 24); g.lineTo(w / 2 + 26, w / 2); g.lineTo(w / 2 - 18, w / 2 + 24); g.closePath(); g.stroke(); }));
  // Rejilla: placa de 26 × 10 con ranuras finas
  const texRejilla = tex(512, 192, (g, w, h) => {
    g.fillStyle = "#3a3d42"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#0a0a0b"; for (let x = 36; x < w - 36; x += 13) g.fillRect(x, 30, 6, h - 60);
  });
  const rejilla = losa(rr(26, 10, 2.2), 0, 0.7, [new THREE.MeshStandardMaterial({ map: texRejilla, roughness: 0.55 }), mat(0x26282c, { roughness: 0.4 })], cuerpo, 0.2, 2);
  // la cara del frente de la losa (grupo 0) recibe la textura: se acuesta en el techo
  rejilla.rotation.x = -Math.PI / 2; rejilla.position.set(0, yTecho - 0.25, 0);
  ajustarUV(rejilla.geometry, 26, 10);

  // ---- Costado derecho (+X): interruptor USB/WLAN arriba, tapa de batería abajo ----
  const xD = W / 2;
  const costado = new THREE.Group(); costado.position.x = xD; costado.rotation.y = Math.PI / 2; cuerpo.add(costado);
  // dentro de "costado": x local = −z del escáner (hacia atrás es +x), y = y, z sale del costado
  const texInter = tex(256, 256, (g, w, h) => {
    g.fillStyle = "#1b1c1f"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#c9ccd0"; g.font = "600 34px Manrope, Segoe UI, sans-serif"; g.textAlign = "center";
    g.fillText("USB", w / 2, 62); g.fillText("WLAN", w / 2, 222);
  });
  const panelI = losa(rr(24, 19, 2.6), -0.6, 0.15, [new THREE.MeshStandardMaterial({ map: texInter, roughness: 0.55 }), M.cuerpo], costado, 0.15, 2);
  panelI.position.set(1, 36.5 - yc, 0); ajustarUV(panelI.geometry, 24, 19);
  const ranura = losa(rr(7.5, 3.4, 1.2), -0.2, 0.25, M.hueco, costado); ranura.position.set(1, 36.5 - yc, 0);
  const perilla = losa(rr(3.4, 2.4, 0.8), -0.1, 0.55, mat(0x2b2d31, { roughness: 0.5 }), costado, 0.15); perilla.position.set(-0.8, 36.5 - yc, 0);
  disco(0.45, -0.3, 0.2, M.hueco, costado, 12.5, 36 - yc, 12);   // micrófono / reinicio
  const bateria = losa(rr(26, 21, 2.8), -0.4, 0.2, M.cuerpo, costado, 0.15, 2); bateria.position.set(0.5, 16 - yc, 0);
  const seguro = losa(rr(6, 3, 0.9), -0.2, 0.35, M.hueco, costado); seguro.position.set(-5, 18 - yc, 0);
  losa(rr(4.6, 1.6, 0.6), 0, 0.5, mat(0x2b2d31), costado).position.set(-5, 18.4 - yc, 0);

  // ---- Costado izquierdo (−X): USB-C vertical en un hueco con la rosca del seguro, y el ojal del cordón ----
  const izq = new THREE.Group(); izq.position.x = -xD; izq.rotation.y = -Math.PI / 2; cuerpo.add(izq);
  // dentro de "izq": x local = +z del escáner (hacia el frente es +x)
  const nicho = new THREE.Shape(); { const s = nicho;
    s.moveTo(-5.5, -7); s.lineTo(4.5, -7); s.lineTo(4.5, 1.5); s.lineTo(8.5, 1.5); s.lineTo(8.5, 7); s.lineTo(-5.5, 7); s.closePath(); }
  const ni = losa(nicho, -0.9, 0.05, M.tapa, izq); ni.position.set(-5, 23 - yc, 0);
  losa(rr(3.4, 8.8, 1.6), -0.85, 0.1, M.hueco, izq).position.set(-5.5, 23 - yc, 0);
  losa(rr(1.4, 6.6, 0.6), -0.8, -0.2, M.metal, izq).position.set(-5.5, 23 - yc, 0);
  disco(1.25, -0.85, 0.12, M.metal, izq, 1.5, 27.3 - yc, 20);      // rosca del seguro del cable
  disco(0.7, -0.84, 0.14, M.hueco, izq, 1.5, 27.3 - yc, 16);
  // ojal del cordón, en la esquina de abajo hacia el frente
  const ojal = losa(rr(5, 1.6, 0.7), -0.6, 0.1, M.hueco, izq); ojal.position.set(4, 3.2 - yc, 0);

  // ---- Abajo: inserto metálico de 1/4"-20 al centro ----
  const inserto = cil(4.6, 0.6, M.metal, raiz, 32); inserto.position.y = 0.1;
  cil(3.2, 0.62, M.hueco, raiz, 24).position.y = 0.12;

  // ---- Cordón: sale del ojal y cuelga con su tope ----
  const cordon = new THREE.Group(); raiz.add(cordon);
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-W / 2 + 0.5, 3.2, 4), new THREE.Vector3(-W / 2 - 2, -2, 6), new THREE.Vector3(-W / 2 - 4, -22, 9),
    new THREE.Vector3(-W / 2 - 3, -48, 8), new THREE.Vector3(-W / 2 - 6, -62, 5),
  ]);
  cordon.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 48, 0.9, 8), M.hule));
  const tope = cil(2.6, 9, mat(0x101112, { roughness: 0.5 }), cordon, 16, 2.0); tope.position.copy(curva.getPoint(0.55));

  // ---- Láser de 7 líneas paralelas y abanico NIR: se ven solo al escanear ----
  const origenLaser = new THREE.Vector3(-1.1, yc + yOjos, 17.6);
  const haces = new THREE.Group(); haces.position.copy(origenLaser); haces.visible = false; raiz.add(haces);
  const matHaz = new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const L = 400;   // alcance del modo láser (160–400 mm)
  for (let i = -3; i <= 3; i++) {
    // cada línea es un plano vertical; a 400 mm las 7 líneas cubren ~110 mm de ancho
    const g = new THREE.BufferGeometry(), dx = i * 18, alto = 110;
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, dx, -alto, L, dx, alto, L], 3));
    haces.add(new THREE.Mesh(g, matHaz));
  }
  // abanico NIR: pirámide abierta hasta 1000 mm, donde cubre 764 × 670 (ficha)
  const gNir = new THREE.BufferGeometry(), E = [[-382, -335], [382, -335], [382, 335], [-382, 335]], vn = [];
  for (let i = 0; i < 4; i++) { const [a, b] = E[i], [c, d] = E[(i + 1) % 4]; vn.push(0, 0, 0, a, b, 1000, c, d, 1000); }
  gNir.setAttribute("position", new THREE.Float32BufferAttribute(vn, 3));
  const nir = new THREE.Mesh(gNir, new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  nir.position.set(-13.3, yc + yOjos, 17); nir.visible = false; raiz.add(nir);

  // Estados de las luces: "apagado", "listo" (pantalla), "laser" (luces blancas + 7 líneas), "nir" (IR + abanico)
  const modo = (m) => {
    const blanco = m === "laser", ir = m === "nir";
    ledsBlancos.forEach((l) => l.material.emissive.setHex(blanco ? 0xfff2cc : 0x000000));
    ledsIR.forEach((l) => l.material.emissive.setHex(ir ? 0x8a2030 : 0x000000));
    emisor.material.emissive.setHex(ir ? 0xc0304a : 0x000000);
    varilla.material.emissive.setHex(blanco ? 0x2a5cff : 0x000000);
    haces.visible = blanco; nir.visible = ir;
    pantalla.userData.dibujar(m === "apagado" ? "apagada" : m);
  };

  sombras(raiz);
  haces.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  nir.castShadow = nir.receiveShadow = false;
  return { raiz, cuerpo, pantalla, haces, nir, modo, botones: { encender, disparo }, medidas: { ...PIKA, yOjos: yc + yOjos, origenLaser } };
}

// La cara frontal de una losa (grupo 0 de ExtrudeGeometry) trae UV en mm: se pasan a 0…1
function ajustarUV(g, w, h) {
  const uv = g.attributes.uv, pos = g.attributes.position, grupo = g.groups[0];
  for (let i = grupo.start; i < grupo.start + grupo.count; i++) {
    const k = g.index ? g.index.getX(i) : i;
    uv.setXY(k, pos.getX(k) / w + 0.5, pos.getY(k) / h + 0.5);
  }
  uv.needsUpdate = true;
}

// Pantalla del escáner: lo justo para que el gemelo diga en qué modo está
function dibujarPantalla(c, estado, t) {
  const g = c.getContext("2d"), w = c.width, h = c.height;
  g.fillStyle = "#020304"; g.fillRect(0, 0, w, h);
  if (estado !== "apagada") {
    g.fillStyle = "#0b1220"; g.fillRect(0, 0, w, h);
    const col = estado === "nir" ? "#ff6b84" : estado === "laser" ? "#5b8cff" : "#e8edf5";
    // malla de puntos como una nube a medio escanear
    g.fillStyle = col; g.globalAlpha = 0.85;
    for (let i = 0; i < 900; i++) {
      const a = (i * 2.399) % (Math.PI * 2), r = Math.sqrt(i / 900) * 120;
      const x = w / 2 + Math.cos(a) * r * 1.2, y = h / 2 + 8 + Math.sin(a) * r * 0.85;
      g.fillRect(x, y, 3, 3);
    }
    g.globalAlpha = 1; g.fillStyle = "#e8edf5"; g.font = "600 30px Manrope, Segoe UI, sans-serif";
    g.fillText(estado === "nir" ? "NIR" : estado === "laser" ? "Láser azul" : "Listo", 26, 46);
    g.fillStyle = "#9aa4b2"; g.font = "500 22px Manrope, Segoe UI, sans-serif"; g.fillText("Pika", w - 80, 46);
    g.fillStyle = "#ff3b47"; g.beginPath(); g.arc(w - 50, h - 50, 22, 0, Math.PI * 2); g.fill();
  }
  t.needsUpdate = true;
}

// ================= Tripié de mano (viene en la caja) =================
// Rótula con placa de Ø28 y perilla, tubo central y tres patas que se cierran en mango con grip.
// Origen en la mesa, al centro. `cima` es la cara de la placa donde se atornilla el escáner.
export function construirTripie({ sombra = true, abierto = 1 } = {}) {
  const { mat, sombras, cil } = herramientas(sombra);
  const M = {
    negro: mat(0x16171a, { roughness: 0.5, metalness: 0.2 }), anodizado: mat(0x1c1d21, { roughness: 0.35, metalness: 0.6 }),
    plata: mat(0xc7cace, { roughness: 0.22, metalness: 0.95 }), hule: mat(0x0f1012, { roughness: 0.95 }), grip: mat(COL.grip, { roughness: 0.85 }),
    laton: mat(0xb08d57, { roughness: 0.3, metalness: 0.9 }),
  };
  const g = new THREE.Group(); g.name = "tripie";
  // Las patas cuelgan de una bisagra justo bajo la rótula; el tubo central baja entre ellas
  const yBisagra = 109, largo = 122;
  cil(7.6, 54, M.anodizado, g, 32).position.y = yBisagra - 27;
  cil(8.2, 4, M.plata, g, 32).position.y = yBisagra - 52;     // aro al pie del tubo
  cil(10.5, 10, M.negro, g, 32).position.y = yBisagra;        // collar de las bisagras
  // Cuerpo de la rótula, rótula y placa
  cil(13, 30, M.negro, g, 40).position.y = yBisagra + 20;
  cil(13.4, 1.2, M.plata, g, 40).position.y = yBisagra + 35.6;
  // La rótula gira desde el centro de la bola: el cuello, la placa y lo que se monte en `cima` van con ella
  const rotula = new THREE.Group(); rotula.position.y = yBisagra + 43; g.add(rotula);
  rotula.add(new THREE.Mesh(new THREE.SphereGeometry(9, 32, 20), M.plata));
  cil(4, 9, M.plata, rotula, 20).position.y = 9;
  cil(14, 5, M.negro, rotula, 48).position.y = 15.5;
  cil(13, 0.6, M.hule, rotula, 48).position.y = 18.2;
  cil(3, 1.5, M.laton, rotula, 16).position.y = 19;            // tornillo de 1/4"
  const cima = new THREE.Group(); cima.position.y = 18.5; rotula.add(cima);
  // Perilla de la rótula, al costado
  const perilla = new THREE.Group(); perilla.position.set(12, yBisagra + 30, 0); perilla.rotation.z = -Math.PI / 2; g.add(perilla);
  cil(2.5, 8, M.plata, perilla, 12).position.y = 3;
  cil(7, 6, M.negro, perilla, 6).position.y = 9;
  // Patas: cápsulas aplanadas con grip texturizado afuera
  const patas = [];
  for (let i = 0; i < 3; i++) {
    const pivote = new THREE.Group(); pivote.position.y = yBisagra; pivote.rotation.y = i * (Math.PI * 2 / 3) + Math.PI / 6; g.add(pivote);
    const pata = new THREE.Group(); pata.position.z = 7; pivote.add(pata);
    const cuerpo = new THREE.Mesh(new THREE.CapsuleGeometry(6, largo - 12, 6, 16), M.negro);
    cuerpo.scale.set(1.75, 1, 1); cuerpo.position.y = -largo / 2 + 2; pata.add(cuerpo);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(4.6, largo - 44, 4, 14), M.grip);
    grip.scale.set(1.75, 1, 0.5); grip.position.set(0, -largo / 2 - 4, 3.8); pata.add(grip);
    const pie = new THREE.Mesh(new THREE.SphereGeometry(6.4, 16, 10), M.hule); pie.scale.set(1.7, 0.8, 1); pie.position.y = -largo + 3; pata.add(pie);
    patas.push(pata);
  }
  // abierto: 1 = patas abiertas (~30°, apoyadas en la mesa), 0 = cerradas como mango
  const abrir = (f) => { patas.forEach((p) => (p.rotation.x = -(0.04 + f * 0.48))); };
  abrir(abierto);
  sombras(g);
  return { raiz: g, rotula, cima, abrir, alto: rotula.position.y + cima.position.y };
}

// ================= Tornamesa manual: Ø203 × 14 mm (ficha de Creality) =================
export function construirTornamesa({ sombra = true } = {}) {
  const { mat, sombras, cil } = herramientas(sombra);
  const g = new THREE.Group(); g.name = "tornamesa";
  const negro = mat(0x18191c, { roughness: 0.72 }), base = mat(0x121315, { roughness: 0.6 });
  const R = 101.5;
  cil(R - 1.5, 6, base, g, 96).position.y = 3;
  cil(R - 6, 1.2, mat(0x050506, { roughness: 1 }), g, 96).position.y = 6.6;      // ranura entre base y plato
  const plato = new THREE.Group(); plato.position.y = 7.2; g.add(plato);
  cil(R, 6.8, negro, plato, 128).position.y = 3.4;
  // borde un poco levantado y el centro apenas marcado, como en la foto
  const borde = new THREE.Mesh(new THREE.TorusGeometry(R - 3.5, 0.8, 8, 128), negro); borde.rotation.x = Math.PI / 2; borde.position.y = 6.8; plato.add(borde);
  cil(9, 0.3, mat(0x1c1d20, { roughness: 0.5 }), plato, 48).position.y = 6.9;
  sombras(g);
  return { raiz: g, plato, alto: 14, radio: R };
}

// ================= Torre de marcadores =================
// Domo facetado con 13 marcadores retrorreflectivos (1 arriba, 4 en diagonal, 8 alrededor) y anillos
// octagonales apilables con un marcador por cara. Las caras salen de cortar con planos (semiespacios).
export function construirTorre({ sombra = true, anillos = 5 } = {}) {
  const { mat, sombras } = herramientas(sombra);
  const matCuerpo = mat(0x141517, { roughness: 0.78, metalness: 0.15 });
  const g = new THREE.Group(); g.name = "torre";
  const hAnillo = 9;
  const marcador = (padre, centro, normal, r = 9.5) => {
    const m = new THREE.Group(); m.position.copy(centro).addScaledVector(normal, 0.05);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); padre.add(m);
    const capa = (radio, z, material) => { const o = new THREE.Mesh(new THREE.CircleGeometry(radio, 48), material); o.position.z = z; m.add(o); };
    capa(r, 0.02, mat(0x0a0b0c, { roughness: 0.4 }));
    capa(r * 0.86, 0.05, mat(COL.marcaAnillo, { roughness: 0.65 }));
    capa(r * 0.62, 0.08, mat(0x101112, { roughness: 0.5 }));
    capa(r * 0.47, 0.11, mat(COL.retro, { roughness: 0.55, metalness: 0.5 }));
  };
  // Anillos: prisma octagonal con las caras un poco inclinadas hacia adentro arriba
  for (let k = 0; k < anillos; k++) {
    const y0 = k * hAnillo, ani = new THREE.Group(); ani.position.y = y0; g.add(ani);
    const rB = 42.5, rA = 40.5;
    const geo = new THREE.CylinderGeometry(rA / Math.cos(Math.PI / 8), rB / Math.cos(Math.PI / 8), hAnillo - 0.8, 8, 1);
    geo.translate(0, (hAnillo - 0.8) / 2, 0);   // con 8 lados, las caras ya quedan a 22.5° + k·45°, como en el domo
    const gp = geo.toNonIndexed(); gp.computeVertexNormals();
    ani.add(new THREE.Mesh(gp, matCuerpo));
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4, inc = Math.atan2(rB - rA, hAnillo);
      const n = new THREE.Vector3(Math.sin(a) * Math.cos(inc), Math.sin(inc), Math.cos(a) * Math.cos(inc));
      marcador(ani, new THREE.Vector3(Math.sin(a) * (rA + rB) / 2, (hAnillo - 0.8) / 2, Math.cos(a) * (rA + rB) / 2), n, 3.6);
    }
  }
  // Domo
  const domo = new THREE.Group(); domo.position.y = anillos * hAnillo; g.add(domo);
  const P = [];
  const plano = (elev, az, punto, marca = true) => {
    const n = new THREE.Vector3(Math.cos(elev) * Math.sin(az), Math.sin(elev), Math.cos(elev) * Math.cos(az));
    P.push({ n, d: n.dot(punto), marca });
  };
  const enAz = (r, y, az) => new THREE.Vector3(r * Math.sin(az), y, r * Math.cos(az));
  const g2r = Math.PI / 180;
  plano(90 * g2r, 0, new THREE.Vector3(0, 50, 0));                                         // tapa
  for (let i = 0; i < 4; i++) plano(52 * g2r, (45 + 90 * i) * g2r, enAz(25, 37, (45 + 90 * i) * g2r));            // 4 en diagonal
  for (let i = 0; i < 4; i++) plano(56 * g2r, (90 * i) * g2r, enAz(26, 41.5, (90 * i) * g2r), false);            // valles sin marcador
  for (let i = 0; i < 8; i++) plano(24 * g2r, (22.5 + 45 * i) * g2r, enAz(42.5, 0, (22.5 + 45 * i) * g2r));       // 8 alrededor
  P.push({ n: new THREE.Vector3(0, -1, 0), d: 0, marca: false });                           // base
  const pos = [];
  for (const [i, pl] of P.entries()) {
    const poli = cara(pl, P.filter((_, j) => j !== i));
    if (poli.length < 3) continue;
    const c = poli.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / poli.length);
    for (let k = 1; k < poli.length - 1; k++) pos.push(...poli[0].toArray(), ...poli[k].toArray(), ...poli[k + 1].toArray());
    if (pl.marca) {
      // el marcador va en el punto de la cara más cercano a su centro y cabe con 2 mm de margen
      const r = Math.min(9.6, radioInscrito(poli, c, pl.n) - 1.6);
      marcador(domo, c, pl.n, r);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  domo.add(new THREE.Mesh(geo, matCuerpo));
  sombras(g);
  return { raiz: g, alto: anillos * hAnillo + 50 };
}

// Polígono de un plano recortado por los demás (todos como n·p ≤ d), en orden CCW visto desde afuera
function cara(pl, otros) {
  const n = pl.n, u = new THREE.Vector3(), v = new THREE.Vector3();
  u.copy(Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).cross(n).normalize();
  v.copy(n).cross(u);
  const o = n.clone().multiplyScalar(pl.d), S = 500;
  let poli = [[-S, -S], [S, -S], [S, S], [-S, S]].map(([a, b]) => o.clone().addScaledVector(u, a).addScaledVector(v, b));
  for (const q of otros) {
    const sal = [];
    for (let i = 0; i < poli.length; i++) {
      const A = poli[i], B = poli[(i + 1) % poli.length], da = q.n.dot(A) - q.d, db = q.n.dot(B) - q.d;
      if (da <= 0) sal.push(A);
      if ((da < 0) !== (db < 0) && da !== db) sal.push(A.clone().lerp(B, da / (da - db)));
    }
    poli = sal; if (poli.length < 3) return [];
  }
  return poli;
}
function radioInscrito(poli, c, n) {
  let r = Infinity;
  for (let i = 0; i < poli.length; i++) {
    const A = poli[i], B = poli[(i + 1) % poli.length], e = B.clone().sub(A).normalize(), perp = n.clone().cross(e);
    r = Math.min(r, Math.abs(c.clone().sub(A).dot(perp)));
  }
  return r;
}
