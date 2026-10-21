// escena.js - la escena de los clips: la Cubiko, la placa con sus sujetadores, los accesorios y el estado
// de la máquina. Los clips (clips.js) la animan; el reproductor (reproductor.js) dibuja y mide.
//
// Marco (mm, igual que cubiko.js): X a la derecha, Y arriba, Z hacia quien está al frente. La cama queda en
// y = 0; la base de la máquina va de y −68 (mesa) a −13. Coordenadas «de cama» (bx, bz): desde el centro de
// la cama, +bz hacia el frente; se mueven con ella.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { construirCubiko, construirHerramienta, crearSujetador, pintarPantalla, Z_FRESA } from "../../cnc/js/cubiko.js";
import { MAT, crearCaiman, crearTerminal, crearLlaveAllen, crearLlaveFija, crearClavijaUSB, crearConector, crearAspiradora, crearCable } from "./accesorios.js";
import { Obstaculos } from "../../shared/js/contacto.js";

export { Z_FRESA };
export const v3 = (a) => new THREE.Vector3(...a);
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });

// ---------------- Render y luz ----------------
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
export const escena = new THREE.Scene();
escena.background = new THREE.Color(0xf3f4f6);
escena.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
escena.environmentIntensity = 0.7;
export const camara = new THREE.PerspectiveCamera(32, 1, 3, 6000);
const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.position.set(300, 700, 400); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 10, far: 2200 });
sol.shadow.bias = -0.0005;
escena.add(sol, new THREE.HemisphereLight(0xffffff, 0xd8dbe0, 0.6));
const mesaTrabajo = new THREE.Mesh(new THREE.BoxGeometry(1800, 10, 1400), mat(0xdcd7cf, { roughness: 0.9 }));
mesaTrabajo.position.y = -68.2 - 5; mesaTrabajo.receiveShadow = true; mesaTrabajo.name = "mesa de trabajo";
escena.add(mesaTrabajo);

// ---------------- Máquina ----------------
export const cub = construirCubiko({ cx: 0, zCama: 0 });
escena.add(cub.fijo, cub.mesa, cub.carroX);
cub.carroX.add(cub.husillo);                  // el husillo va en el carro X (como en el visor de la app)
cub.fijo.name = "máquina"; cub.mesa.name = "cama"; cub.carroX.name = "carro X"; cub.husillo.name = "husillo"; cub.tapa.name = "tapa";
cub.pinza.rotation.y = Math.PI / 2;           // las caras planas de la pinza miran a ±Z (ahí entra la llave)
cub.tuerca.rotation.y = Math.PI / 6;           // y dos caras de la tuerca también
export const MED = cub.medidas;
const CZ = 55;                                  // centro de la cama en coordenadas de la mesa

// La herramienta sobre el punto (bx, bz) de la cama, con la punta h mm arriba de la cama
export function fresaSobre(bx, bz, h) {
  cub.carroX.position.x = bx;
  cub.mesa.position.z = Z_FRESA - CZ - bz;
  cub.husillo.position.y = h;
}
// Coordenadas de máquina (las de la app: X −145…0, Y −110…0, Z −40…0 con Z0 de máquina arriba)
export function maquina(x, y, z) {
  cub.carroX.position.x = x + 72.5;
  cub.mesa.position.z = y + Z_FRESA;
  cub.husillo.position.y = z + 40;
}
export const deCama = (bx, y, bz) => cub.mesa.localToWorld(new THREE.Vector3(bx, y, CZ + bz));
const enMesa = (o, bx, y, bz) => { o.position.set(bx, y, CZ + bz); cub.mesa.add(o); return o; };

// ---------------- Placa de cobre (en la cama) ----------------
// 100 × 95 × 1.6, centrada en (0, −5) de la cama. La cara de arriba es un lienzo: ahí se dibuja el surco.
export const PLACA = { ancho: 100, fondo: 95, grosor: 1.6, bx: 0, bz: -5 };
const lienzoPlaca = document.createElement("canvas"); lienzoPlaca.width = 500; lienzoPlaca.height = 475;
const texPlaca = new THREE.CanvasTexture(lienzoPlaca); texPlaca.colorSpace = THREE.SRGBColorSpace; texPlaca.anisotropy = 4;
export const placa = new THREE.Group(); placa.name = "placa";
{
  const canto = mat(0xcfb27a, { roughness: 0.7 });
  const cara = new THREE.MeshStandardMaterial({ map: texPlaca, metalness: 0.55, roughness: 0.32 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(PLACA.ancho, PLACA.grosor, PLACA.fondo), [canto, canto, cara, canto, canto, canto]);
  m.position.y = PLACA.grosor / 2; m.castShadow = m.receiveShadow = true; placa.add(m);
}
enMesa(placa, PLACA.bx, 0, PLACA.bz);
// Surco: segmentos [x0, z0, x1, z1] en coordenadas de la placa (mm desde su centro) que ya cortó la fresa
export function pintarPlaca(segmentos = [], polvo = 0) {
  const x = lienzoPlaca.getContext("2d"), W = lienzoPlaca.width, H = lienzoPlaca.height, k = W / PLACA.ancho;
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#d99a5c"); g.addColorStop(0.5, "#e7ae73"); g.addColorStop(1, "#cf8f55");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "#a8884f"; x.lineWidth = 0.2 * k * 1.6; x.lineCap = "round";
  for (const [x0, z0, x1, z1] of segmentos) { x.beginPath(); x.moveTo((x0 + 50) * k, (z0 + 47.5) * k); x.lineTo((x1 + 50) * k, (z1 + 47.5) * k); x.stroke(); }
  if (polvo > 0) {         // polvo de cobre y fibra junto al surco
    x.fillStyle = `rgba(214,190,150,${0.55 * polvo})`;
    for (const [x0, z0, x1, z1] of segmentos) for (let i = 0; i < 4; i++) { const u = (i + 0.5) / 4; x.beginPath(); x.arc((x0 + (x1 - x0) * u + 50) * k + Math.sin(i * 7.3 + x0) * 4, (z0 + (z1 - z0) * u + 47.5) * k + Math.cos(i * 5.1 + z0) * 4, 2.2, 0, Math.PI * 2); x.fill(); }
  }
  texPlaca.needsUpdate = true;
}
pintarPlaca();

// ---------------- Sujetadores (en las roscas extra de la cama, como en el manual) ----------------
// En diagonal: el izquierdo en la rosca de atrás (−66.4, −39.75) y el derecho, girado, en la de adelante
// (66.4, 39.75), donde va la horquilla de la sonda. Así la esquina de adelante a la izquierda (X0 Y0) queda
// libre. La lengüeta pisa 4 mm de la orilla de la placa.
export const suj = { izq: crearSujetador(), der: crearSujetador() };
suj.izq.grupo.name = "sujetador izq."; suj.der.grupo.name = "sujetador der.";
export const SUJ = { izq: { bx: -66.45, bz: -39.75, giro: 0 }, der: { bx: 66.45, bz: 39.75, giro: Math.PI } };
export const ROSCA_SUJ = { izq: [-66.4, -39.75], der: [66.4, 39.75] };
for (const k of ["izq", "der"]) { enMesa(suj[k].grupo, SUJ[k].bx, 0, SUJ[k].bz); suj[k].grupo.rotation.y = SUJ[k].giro; suj[k].tornillo.position.x = 0.05; }

// ---------------- Accesorios ----------------
const nombrar = (o, n) => { o.name = n; return o; };
export const rojo = crearCaiman(MAT.pvcRojo); escena.add(nombrar(rojo.g, "caimán"));
export const terminal = crearTerminal(MAT.pvcRojo); escena.add(nombrar(terminal.g, "horquilla"));
export const conector = crearConector(); escena.add(nombrar(conector.g, "conector"));
export const allen = crearLlaveAllen(); escena.add(nombrar(allen.g, "llave Allen"));
export const llaves = [crearLlaveFija(), crearLlaveFija()]; llaves.forEach((l, i) => escena.add(nombrar(l.g, `llave fija ${i + 1}`)));
export const clavija = crearClavijaUSB(); escena.add(nombrar(clavija.g, "clavija USB"));
export const aspiradora = crearAspiradora(); escena.add(nombrar(aspiradora.g, "aspiradora"));
// Herramienta suelta (la que sale de la pinza o la que entra), y las tres en fila para compararlas
export const suelta = new THREE.Group(); suelta.name = "herramienta suelta"; escena.add(suelta);
export function ponerSuelta(tipo) { if (suelta.userData.tipo === tipo) return; suelta.clear(); suelta.add(construirHerramienta(tipo)); suelta.userData.tipo = tipo; }
export const muestrario = new THREE.Group(); muestrario.name = "muestrario"; escena.add(muestrario);
{
  const NOMBRES = { v: "Punta en V", maiz: "Maíz", broca: "Broca" };
  ["v", "maiz", "broca"].forEach((tipo, i) => {
    const h = construirHerramienta(tipo); h.position.set(i * 16, 0, 0); muestrario.add(h);
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
    const x = cv.getContext("2d"); x.font = "700 34px Manrope, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#111317"; x.fillText(NOMBRES[tipo], 128, 32);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(14, 3.5, 1); s.position.set(i * 16, -5, 0); s.renderOrder = 9; muestrario.add(s);
  });
}
// Marca del cero de trabajo (como en la app: X rojo, Y verde, Z azul)
export const cero = new THREE.Group(); cero.name = "cero"; cub.mesa.add(cero);
{
  const flecha = (dir, color) => new THREE.ArrowHelper(new THREE.Vector3(...dir), new THREE.Vector3(), 14, color, 4, 2.4);
  cero.add(flecha([1, 0, 0], 0xd63a2f), flecha([0, 0, -1], 0x15803d), flecha([0, 1, 0], 0x2563eb));
  cero.traverse((o) => { o.userData.sinColision = true; });
}
// Puntos del mapa de alturas (en la cama)
export const puntosMapa = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0x16a34a }), 16);
puntosMapa.userData.sinColision = true; cub.mesa.add(puntosMapa);
// Aro de contacto de la sonda (verde, como en la app)
export const aroContacto = new THREE.Mesh(new THREE.RingGeometry(3.5, 5, 32), new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
aroContacto.rotation.x = -Math.PI / 2; aroContacto.renderOrder = 8; aroContacto.userData.sinColision = true; escena.add(aroContacto);
// Polvo que salta al cortar: puntos que dependen solo del tiempo (se puede adelantar y regresar)
const N_POLVO = 80;
export const polvo = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xd8b98a, size: 1.1, sizeAttenuation: true }));
polvo.geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(N_POLVO * 3), 3)); escena.add(polvo);
export function ponerPolvo(t, punta, activo) {
  polvo.visible = activo; if (!activo) return;
  const p = polvo.geometry.attributes.position;
  for (let i = 0; i < N_POLVO; i++) {
    const f = (t * 2.2 + i / N_POLVO) % 1, a = i * 2.399, r = 2 + f * 16;
    p.setXYZ(i, punta.x + Math.cos(a + t * 3) * r, punta.y + 0.6 + Math.sin(f * Math.PI) * 7, punta.z + Math.sin(a + t * 3) * r);
  }
  p.needsUpdate = true;
}

// Cables: USB, corriente (fijo), y la sonda (conector → caimán y conector → horquilla)
export const cables = {
  usb: crearCable(escena, 0x2b2d31, 2.4),
  caiman: crearCable(escena, 0x1c1d20, 1.1),
  horquilla: crearCable(escena, 0xc9212b, 1.6),
  aspiradora: null,
};
for (const [n, c] of Object.entries(cables)) if (c) c.malla.name = `cable ${n}`;

// ---------------- Puntos de la máquina ----------------
cub.fijo.updateMatrixWorld(true);
const enMundo = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));
export const PUNTO = {
  on: enMundo(cub.botones.encendido, 0, 0, 1.2),        // cara del botón ON/OFF
  paro: enMundo(cub.botones.paro, 0, 0, 1.2),
  usb: enMundo(cub.puertos.usb, 0, 0, 0.8),              // boca del USB-B
  jack: enMundo(cub.puertos.jack, 0, 0, 1),
  leveling: enMundo(cub.puertos.leveling, -4.4, 0, 0),   // boca del conector Leveling (mira a −X)
};
// Corriente: clavija en ángulo siempre puesta en el jack; el cable sale hacia atrás
{
  const g = new THREE.Group(); g.position.copy(PUNTO.jack); g.name = "clavija de corriente"; escena.add(g);
  const a = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 12, 20), MAT.pvcNegro); a.rotation.z = Math.PI / 2; a.position.x = 6; g.add(a);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.4, 18, 20), MAT.pvcNegro); b.rotation.x = Math.PI / 2; b.position.set(10, 0, -8); g.add(b);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  crearCable(escena, 0x1c1d20, 2.6)(PUNTO.jack.clone().add(v3([10, 0, -17])), new THREE.Vector3(0, 0, -1), new THREE.Vector3(260, -66, -620));
}

// ---------------- Estado ----------------
const luzApagada = cub.luz.material.color.getHex();
export function encendida(si) {
  cub.luz.material.color.set(si ? 0x3ddc84 : luzApagada);
  cub.botones.simbolo.color.set(si ? 0xf4f8ff : 0x55595f);
  cub.barraLed.material.color.set(si ? 0xf4f6f8 : 0x4a4e55);
  cub.lampara.visible = si;
  const k = si ? "on" : "off";
  if (cub.pantalla.k === k) return;
  cub.pantalla.k = k;
  if (si) pintarPantalla(cub.pantalla, { conectado: false });
  else { const x = cub.pantalla.cv.getContext("2d"); x.fillStyle = "#0b0d10"; x.fillRect(0, 0, 256, 160); cub.pantalla.tex.needsUpdate = true; }
}
export const herramienta = cub.husillo.children[0];
// Lo que cada clip no toca queda así: prendida, tapa puesta, cama al centro con la placa sujeta, fresa en V
// 35 mm arriba, sin accesorios a la vista
const ocultables = [rojo.g, terminal.g, conector.g, allen.g, ...llaves.map((l) => l.g), clavija.g, aspiradora.g, suelta, muestrario, cero, puntosMapa, aroContacto, polvo,
  cables.usb.malla, cables.caiman.malla, cables.horquilla.malla];
export function escenaBase() {
  encendida(true);
  cub.botones.encendido.position.z = 2.4; cub.botones.paro.position.z = 2.4;
  cub.tapa.visible = true; cub.tapa.position.set(0, 0, 0);
  for (const o of ocultables) o.visible = false;
  fresaSobre(0, 0, 35);
  if (herramienta.userData.tipo !== "v") cub.ponerHerramienta("v");
  herramienta.visible = true; herramienta.position.y = 0; herramienta.rotation.y = 0;
  cub.tuerca.position.y = 21; cub.tuerca.rotation.y = Math.PI / 6;
  placa.visible = true; placa.position.set(PLACA.bx, 0, CZ + PLACA.bz); placa.rotation.set(0, 0, 0);
  for (const k of ["izq", "der"]) {
    const s = suj[k]; s.grupo.visible = true; s.grupo.position.set(SUJ[k].bx, 0, CZ + SUJ[k].bz); s.grupo.rotation.set(0, SUJ[k].giro, 0);
    s.tornillo.position.set(0.05, 0, 0); s.tornillo.rotation.set(0, 0, 0);
  }
  rojo.abrir(0);
  puntosMapa.count = 0;
}

// ---------------- Obstáculos (para que las manos no atraviesen nada) ----------------
export const obstaculos = new Obstaculos([escena], {
  omitir: (o) => o.isPoints || o.isLine || o.isSprite || o === aroContacto || !!o.parent?.isArrowHelper || o.material?.isMeshBasicMaterial && o.geometry?.type === "PlaneGeometry",
});

// Registro de lo que se puede agarrar: id → { o, agarre (en coordenadas de o) }
export const OBJ = {
  caiman: { o: rojo.g, agarre: rojo.agarre },
  horquilla: { o: terminal.g, agarre: terminal.agarre },
  conector: { o: conector.g, agarre: conector.agarre },
  clavija: { o: clavija.g, agarre: clavija.agarre },
  aspiradora: { o: aspiradora.g, agarre: aspiradora.agarre },
  tapa: { o: cub.tapa },
  placa: { o: placa, agarre: { centro: new THREE.Vector3(0, PLACA.grosor / 2, PLACA.fondo / 2 - 5), eje: new THREE.Vector3(0, 1, 0), ancho: PLACA.grosor } },
  sujDer: { o: suj.der.grupo, agarre: { centro: new THREE.Vector3(-4, 4.7, 0), eje: new THREE.Vector3(0, 0, 1), ancho: 15 } },
};
