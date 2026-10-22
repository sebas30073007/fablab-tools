// escena.js - el gemelo del escáner sobre la mesa: escáner en su tripié, tornamesa con la torre de
// marcadores y, con el Otter, su placa de calibración. La guía lo mueve paso a paso:
//   vista(n)   "mesa" | "escaner" | "frente" | "atras" | "lado" | "izq" | "arriba" | "placa"
//   modo(m)    "apagado" | "laser" | "luz" | "nir"
//   girar(on)  la tornamesa da vueltas
// ?captura oculta los mandos; ?solo deja el escáner solo (para revisar el modelo).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { construirPika, construirTripie, construirTornamesa, construirTorre } from "./pika-modelo.js";
import { construirOtter, construirPlacaCalibracion } from "./otter-modelo.js";

export function crearEscena(cont, { otter = false, solo = false } = {}) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.NeutralToneMapping;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  cont.prepend(r.domElement);

  const s = new THREE.Scene();
  s.background = new THREE.Color(0xe5e7eb);
  s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
  s.environmentIntensity = 0.9;
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(-250, 700, 450); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0004;
  Object.assign(sol.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 2000 });
  s.add(sol, sol.target);
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.16 }));
  piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; s.add(piso);

  const esc = otter ? construirOtter() : construirPika();
  const tripie = construirTripie();
  const mesa = construirTornamesa();
  const torre = construirTorre();
  const placa = otter ? construirPlacaCalibracion() : null;
  // El escáner va atornillado a la rótula del tripié, inclinado hacia la torre de la tornamesa
  const montaje = tripie.rotula;
  const centro = new THREE.Vector3(0, esc.medidas.y / 2, 0);
  if (solo) s.add(esc.raiz);
  else {
    s.add(mesa.raiz);
    mesa.plato.add(torre.raiz); torre.raiz.position.y = mesa.alto - mesa.plato.position.y;
    tripie.raiz.position.set(0, 0, -330); s.add(tripie.raiz);
    tripie.cima.add(esc.raiz);
    if (placa) { placa.raiz.position.set(-300, 0, -330); placa.raiz.rotation.y = 0.25; s.add(placa.raiz); }
    const blanco = new THREE.Vector3(0, mesa.alto + torre.alto * 0.5, 0);
    const ojo = new THREE.Vector3(0, tripie.alto + esc.medidas.yOjos, -330);
    montaje.rotation.x = Math.atan2(ojo.y - blanco.y, blanco.z - ojo.z);
    s.updateMatrixWorld(true);
    centro.applyMatrix4(esc.raiz.matrixWorld);
  }

  const cam = new THREE.PerspectiveCamera(30, 1, 5, 8000);
  const ctl = new OrbitControls(cam, r.domElement);
  ctl.enableDamping = true; ctl.dampingFactor = 0.12; ctl.screenSpacePanning = true;
  ctl.maxPolarAngle = Math.PI / 2 - 0.02;
  // Vistas: [objetivo, dirección desde el objetivo, distancia]; el Otter mide 165 de largo y se ve más lejos
  const k = otter ? 1.45 : 1, rot = () => montaje.rotation;
  const VISTAS = {
    mesa: () => [new THREE.Vector3(0, 90, -150), new THREE.Vector3(1.1, 0.75, 0.55), 900],
    escaner: () => [centro, new THREE.Vector3(0.55, 0.32, 1).applyEuler(rot()), 330 * k],
    frente: () => [centro, new THREE.Vector3(0, 0.02, 1).applyEuler(rot()), 300 * k],
    atras: () => [centro, new THREE.Vector3(-0.35, 0.3, -1).applyEuler(rot()), 300 * k],
    arriba: () => [centro, new THREE.Vector3(0.3, 1, 0.6).applyEuler(rot()), 300 * k],
    lado: () => [centro, new THREE.Vector3(1, 0.15, 0.25).applyEuler(rot()), 280 * k],
    izq: () => [centro, new THREE.Vector3(-1, 0.15, -0.25).applyEuler(rot()), 280 * k],
    placa: () => (placa ? [new THREE.Vector3(-300, 0, -330), new THREE.Vector3(0.4, 1, 0.7), 620] : VISTAS.mesa()),
    tornamesa: () => [new THREE.Vector3(0, 50, 30), new THREE.Vector3(0.75, 0.85, 1.1), 470],
  };
  VISTAS.pika = VISTAS.escaner;
  // La cámara viaja suave de una vista a otra
  let viaje = null;
  function vista(n, { suave = true } = {}) {
    const [t, d, dist] = (VISTAS[n] || VISTAS.mesa)();
    const destino = t.clone().addScaledVector(d.clone().normalize(), dist);
    if (!suave || matchMedia("(prefers-reduced-motion: reduce)").matches) { ctl.target.copy(t); cam.position.copy(destino); ctl.update(); viaje = null; return; }
    viaje = { t0: performance.now(), dur: 900, dePos: cam.position.clone(), deObj: ctl.target.clone(), aPos: destino, aObj: t.clone() };
  }
  let gira = false;
  const girar = (on) => (gira = on);

  function tam() {
    const w = cont.clientWidth || 1, h = cont.clientHeight || 1;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  new ResizeObserver(tam).observe(cont); tam();
  r.setAnimationLoop((t) => {
    if (viaje) {
      let f = Math.min(1, (t - viaje.t0) / viaje.dur); f = f * f * (3 - 2 * f);
      cam.position.lerpVectors(viaje.dePos, viaje.aPos, f); ctl.target.lerpVectors(viaje.deObj, viaje.aObj, f);
      if (f >= 1) viaje = null;
    }
    if (gira || esc.haces?.visible || esc.nir.visible) mesa.plato.rotation.y += 0.004;
    ctl.update(); r.render(s, cam);
  });
  vista(solo ? "escaner" : "mesa", { suave: false });
  return { escaner: esc, vista, modo: (m) => esc.modo(m), girar, cam, ctl };
}
