// clips.js - muestras de clips con manos para el tutorial de la CNC (no está enlazado desde la app).
//
// Cada clip: cámara, una o dos manos con cuadros clave (shared/js/manos.js), accesorios que se mueven
// y subtítulos. «Grabar» reproduce el clip completo y descarga un .webm con el subtítulo dentro.
// Depuración: ?clip=usb&t=3.2 congela el cuadro; ?poses muestra todas las poses de la mano.
//
// Marco (mm, igual que cubiko.js): X a la derecha, Y arriba, Z hacia quien está al frente.
// La cama queda en y = 0; la base de la máquina va de y −68 (mesa) a −13.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { construirCubiko, construirHerramienta, crearSujetador, pintarPantalla, Z_FRESA } from "../../cnc/js/cubiko.js";
import { Mano, POSES, animarMano, tramo } from "../../shared/js/manos.js";

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------------- Escena ----------------
const lienzo = $("lienzo");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
lienzo.prepend(renderer.domElement);
const escena = new THREE.Scene();
escena.background = new THREE.Color(0xf3f4f6);
escena.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
escena.environmentIntensity = 0.7;
const camara = new THREE.PerspectiveCamera(32, 1, 5, 6000);
const orbita = new OrbitControls(camara, renderer.domElement);
orbita.enableDamping = true;
const sol = new THREE.DirectionalLight(0xffffff, 1.6);
sol.position.set(300, 700, 400); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 10, far: 2200 });
sol.shadow.bias = -0.0005;
escena.add(sol, new THREE.HemisphereLight(0xffffff, 0xd8dbe0, 0.6));
const mesaTrabajo = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1400), new THREE.MeshStandardMaterial({ color: 0xdcd7cf, roughness: 0.9 }));
mesaTrabajo.rotation.x = -Math.PI / 2; mesaTrabajo.position.y = -68.2; mesaTrabajo.receiveShadow = true;
escena.add(mesaTrabajo);

const cub = construirCubiko({ cx: 0, zCama: 0 });
escena.add(cub.fijo, cub.mesa, cub.carroX, cub.husillo);
cub.mesa.position.z = Z_FRESA - 55;          // cama centrada bajo la fresa
cub.husillo.position.y = 35;                 // fresa 35 mm sobre la cama
cub.fijo.updateMatrixWorld(true);
const MED = cub.medidas;
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const v3 = (a) => new THREE.Vector3(...a);
const enMundo = (o, x = 0, y = 0, z = 0) => o.localToWorld(new THREE.Vector3(x, y, z));

// Placa de cobre sobre la cama, sujeta con dos sujetadores
const placa = new THREE.Mesh(new THREE.BoxGeometry(70, 1.6, 50), [mat(0xc9a45c), mat(0xc9a45c), mat(0xd08a4e, { metalness: 0.7, roughness: 0.3 }), mat(0xc9a45c), mat(0xc9a45c), mat(0xc9a45c)]);
placa.position.set(0, 0.8, Z_FRESA); placa.castShadow = placa.receiveShadow = true; escena.add(placa);
// El tornillo de cada uno entra en la rosca (±48, Z_FRESA) de la cama; la lengüeta pisa 4 mm de placa
const sujIzq = crearSujetador(), sujDer = crearSujetador();
sujIzq.grupo.position.set(-52, 0, Z_FRESA); sujIzq.tornillo.position.x = 4;
sujDer.grupo.position.set(52, 0, Z_FRESA); sujDer.grupo.rotation.y = Math.PI; sujDer.tornillo.position.x = 4;
escena.add(sujIzq.grupo, sujDer.grupo);
const tornilloDer = sujDer.tornillo.getWorldPosition(new THREE.Vector3());   // (48, 0, Z_FRESA)
const TOPE = sujDer.tornillo.userData.tope;

// Puntos de la máquina en el mundo
const PUNTO = {
  on: enMundo(cub.botones.encendido, 0, 0, 1.2),        // cara del botón ON/OFF
  paro: enMundo(cub.botones.paro, 0, 0, 1.2),
  usb: enMundo(cub.puertos.usb, 0, 0, 0.8),              // boca del USB-B
  jack: enMundo(cub.puertos.jack, 0, 0, 1),
  leveling: enMundo(cub.puertos.leveling, -4.4, 0, 0),   // boca del conector Leveling (mira a −X)
  sensor: cub.sensorTapa.getWorldPosition(new THREE.Vector3()),
  punta: new THREE.Vector3(0, 35, Z_FRESA),
};

// Clavija USB-B con su cable (la punta en el origen, el cuerpo hacia +Z local)
const clavija = new THREE.Group(); escena.add(clavija);
const metal = new THREE.Mesh(new THREE.BoxGeometry(8.6, 7.6, 9), mat(0xc4c8ce, { metalness: 0.9, roughness: 0.25 })); metal.position.z = 4.5; clavija.add(metal);
const cuerpoUsb = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 26), mat(0x2b2d31)); cuerpoUsb.position.z = 9 + 13; clavija.add(cuerpoUsb);
const funda = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 12, 16), mat(0x2b2d31)); funda.rotation.x = Math.PI / 2; funda.position.z = 35 + 6; clavija.add(funda);
clavija.traverse((o) => { if (o.isMesh) o.castShadow = true; });

// Caimán (mordazas hacia −Z local, se abren en el plano XZ); devuelve { g, abrir(0…1) }
const acero = mat(0xc4c8ce, { metalness: 0.9, roughness: 0.25 });
function crearCaiman(color) {
  const g = new THREE.Group(); escena.add(g);
  const mordaza = (lado) => {
    const m = new THREE.Group(); m.position.set(lado * 1.2, 0, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 16), acero); b.position.z = -8; m.add(b);
    for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.2), acero); d.position.set(-lado * 1.2, 0, -14 + i * 3); m.add(d); }
    g.add(m); return m;
  };
  const ms = [mordaza(-1), mordaza(1)];
  const bota = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 36, 20), mat(color, { roughness: 0.45 })); bota.rotation.x = Math.PI / 2; bota.position.z = 18; g.add(bota);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, abrir: (a) => { ms[0].rotation.y = a * 0.35; ms[1].rotation.y = -a * 0.35; } };
}
const rojo = crearCaiman(0xd3262e), negro = crearCaiman(0x26282c);

// Conector de la sonda (blanco, 2 pines): la punta en el origen, el cuerpo hacia −X local (entra hacia +X)
const conector = new THREE.Group(); escena.add(conector);
const cuerpoCon = new THREE.Mesh(new THREE.BoxGeometry(9, 6.5, 5.5), mat(0xeeeae2, { roughness: 0.6 })); cuerpoCon.position.x = -4.5; conector.add(cuerpoCon);
conector.traverse((o) => { if (o.isMesh) o.castShadow = true; });

// Llave Allen: punta corta hacia −Y (entra en el tornillo), brazo largo hacia +X; el origen en la punta
const llave = new THREE.Group(); escena.add(llave);
const pavonado = mat(0x1d1f22, { metalness: 0.6, roughness: 0.35 });
const corta = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 16, 6), pavonado); corta.position.y = 8; llave.add(corta);
const codo = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), pavonado); codo.position.y = 16; llave.add(codo);
const larga = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 56, 6), pavonado); larga.rotation.z = Math.PI / 2; larga.position.set(28, 16, 0); llave.add(larga);
llave.traverse((o) => { if (o.isMesh) o.castShadow = true; });

// Las tres herramientas de PCB en fila, para compararlas (clip «herramientas»)
const muestrario = new THREE.Group(); escena.add(muestrario);
const NOMBRES = { v: "Punta en V", maiz: "Maíz", broca: "Broca" };
["v", "maiz", "broca"].forEach((tipo, i) => {
  const h = construirHerramienta(tipo); h.position.set(34 + i * 16, 22, Z_FRESA); muestrario.add(h);
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
  const x = cv.getContext("2d"); x.font = "700 34px Manrope, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#111317"; x.fillText(NOMBRES[tipo], 128, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(14, 3.5, 1); s.position.set(34 + i * 16, 17, Z_FRESA); s.renderOrder = 9; muestrario.add(s);
});

// Cables: tubo que se recalcula cada cuadro desde la parte trasera del accesorio hasta un punto
function cable(color, radio) {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat(color, { roughness: 0.6 })); m.castShadow = true; escena.add(m);
  const f = (desde, dir, hasta, caida = 20) => {
    const a = desde.clone(), b = desde.clone().addScaledVector(dir, 50);
    const c = new THREE.Vector3((b.x + hasta.x) / 2, Math.min(b.y, hasta.y) - caida, (b.z + hasta.z) / 2);
    c.y = Math.max(c.y, -66);
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c, hasta]), 60, radio, 10, false);
  };
  f.malla = m;
  return f;
}
const cableUsb = cable(0x2b2d31, 2.4), cableRojo = cable(0xd3262e, 1.3), cableNegro = cable(0x26282c, 1.3);
// Corriente: clavija en ángulo siempre puesta en el jack; el cable sale hacia atrás
const clavijaDC = new THREE.Group(); clavijaDC.position.copy(PUNTO.jack); escena.add(clavijaDC);
const dc1 = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 12, 20), mat(0x1c1d20)); dc1.rotation.z = Math.PI / 2; dc1.position.x = 6; clavijaDC.add(dc1);
const dc2 = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.4, 18, 20), mat(0x1c1d20)); dc2.rotation.x = Math.PI / 2; dc2.position.set(10, 0, -8); clavijaDC.add(dc2);
cable(0x1c1d20, 2.6)(PUNTO.jack.clone().add(v3([10, 0, -17])), new THREE.Vector3(0, 0, -1), new THREE.Vector3(260, -66, -620));

// Señal: aro cobre que late donde hay que actuar (siempre de frente a la cámara, encima de todo)
const senal = new THREE.Mesh(new THREE.RingGeometry(11, 14, 40), new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, depthTest: false }));
senal.renderOrder = 10; escena.add(senal);
function ponerSenal(lista, t) {
  const s = (Array.isArray(lista) ? lista : [lista]).find((x) => x && t >= x.t0 && t <= x.t1);
  senal.visible = !!s;
  if (!s) return;
  const f = (t - s.t0) % 1;
  senal.position.copy(s.pos); senal.quaternion.copy(camara.quaternion);
  senal.scale.setScalar((s.r ?? 1) * (1 + f * 0.6)); senal.material.opacity = 1 - f * 0.8;
}

// ---------------- Estado de la máquina ----------------
const luzApagada = cub.luz.material.color.getHex();
function encendida(si) {
  cub.luz.material.color.set(si ? 0x3ddc84 : luzApagada);
  cub.botones.simbolo.color.set(si ? 0xf4f8ff : 0x55595f);
  cub.barraLed.material.color.set(si ? 0xf4f6f8 : 0x4a4e55);
  cub.lampara.visible = si;
  if (si) pintarPantalla(cub.pantalla, { conectado: false });
  else { const x = cub.pantalla.cv.getContext("2d"); x.fillStyle = "#0b0d10"; x.fillRect(0, 0, 256, 160); cub.pantalla.tex.needsUpdate = true; }
}
// Lo que cada clip no toca queda así: prendida, tapa puesta, sin accesorios, sujetadores apretados
function escenaBase() {
  encendida(true);
  cub.botones.encendido.position.z = 2.4;
  cub.tapa.visible = true; cub.tapa.position.set(0, 0, 0);
  for (const o of [clavija, rojo.g, negro.g, conector, llave, muestrario, cableUsb.malla, cableRojo.malla, cableNegro.malla]) o.visible = false;
  cub.carroX.position.x = 0; cub.husillo.position.y = 35;
  cub.husillo.children[0].visible = true;
  if (cub.husillo.children[0].userData.tipo !== "v") cub.ponerHerramienta("v");
  cub.husillo.children[0].position.y = 0;
  sujDer.grupo.position.x = 52; sujDer.tornillo.position.y = 0; sujDer.tornillo.rotation.y = 0;
}
const entre = (kf, t, campo) => { const [a, b, s] = tramo(kf, t); return Array.isArray(a[campo]) ? v3(a[campo]).lerp(v3(b[campo]), s) : a[campo] + (b[campo] - a[campo]) * s; };

// ---------------- Clips ----------------
// pos/rot de las manos en mm y grados (YXZ). Rot [0,0,0] = palma abajo, dedos hacia el fondo.
// [0,90,0]: dedos hacia −X (la mano entra por la derecha); [0,0,-90]: de canto, para tomar con la pinza.
const on = PUNTO.on, pa = PUNTO.paro, u = PUNTO.usb, lv = PUNTO.leveling;

// Tapa: desplazamiento de la tapa (y de las manos que la cargan); se quita hacia arriba y se deja a la izquierda
const TAPA_KF = [{ t: 0, o: [0, 0, 0] }, { t: 2.0, o: [0, 0, 0] }, { t: 3.4, o: [0, 120, 0] }, { t: 5.0, o: [-370, 120, 90] }, { t: 5.8, o: [-370, -55, 90] }, { t: 9, o: [-370, -55, 90] }];
const AGARRE = { der: [161, 50, 50], izq: [-161, 50, 50] };      // palmas contra los costados de la tapa
const manoTapa = (lado) => {
  const s = lado === "der" ? 1 : -1, g = AGARRE[lado], r = [0, 0, -90 * s];
  const con = (t, pose) => { const o = TAPA_KF.find((k) => k.t === t).o; return { t, pos: [g[0] + o[0], g[1] + o[1], g[2] + o[2]], rot: r, pose }; };
  return {
    lado, ancla: "middle-finger-phalanx-proximal",
    kf: [
      { t: 0, pos: [g[0] + s * 120, g[1] + 60, g[2] + 140], rot: [0, 0, -60 * s], pose: "relajada" },
      { t: 1.5, pos: [g[0] + s * 8, g[1], g[2]], rot: r, pose: "abierta" },
      con(2.0, "abierta"), con(3.4, "abierta"), con(5.0, "abierta"), con(5.8, "abierta"),
      { t: 6.4, pos: [g[0] - 370 + s * 30, g[1] - 40, g[2] + 90], rot: r, pose: "relajada" },
      { t: 7.4, pos: [g[0] - 370 + s * 120, g[1] + 40, g[2] + 300], rot: [0, 0, -60 * s], pose: "relajada" },
    ],
  };
};
// La misma pista al revés en el tiempo (para «Pon la tapa»)
const alReves = (kf, d) => kf.map((k) => ({ ...k, t: d - k.t })).reverse();
const TAPA_D = 9;

// Sujetador: la lengüeta entra sobre la placa, la llave Allen da dos vueltas y el tornillo baja
const SUJ = { t: [0, 1.2, 1.4, 2.4, 5.2, 6.2], vueltas: 2, baja: 1.6 };

// Sonda: el conector entra en Leveling, el caimán negro muerde la orilla de la placa y el rojo la fresa
const NEGRO_EN = [20, 0.8, Z_FRESA + 25 - 6], ROJO_EN = [0, 42, Z_FRESA + 9];
const INCLINA = -0.5;                                    // el negro baja hacia la placa
const LEJOS = [220, 120, 380];                           // los caimanes, fuera de cuadro hasta que la mano los trae
const dirNegro = new THREE.Vector3(0, -Math.sin(INCLINA), Math.cos(INCLINA));   // del pico hacia la bota

const CLIPS = [
  {
    id: "encender", nombre: "Enciende", paso: "Máquina",
    duracion: 8,
    camara: [{ t: 0, pos: [on.x + 360, on.y + 150, on.z + 330], mira: [on.x - 10, on.y + 10, on.z + 20] },
             { t: 3.6, pos: [on.x + 260, on.y + 90, on.z + 230], mira: [on.x - 10, on.y, on.z + 20] },
             { t: 5.0, pos: [520, 80, 420], mira: [20, -45, 120] },
             { t: 7.0, pos: [260, 30, 560], mira: [-40, -45, 150] }],
    senal: [{ pos: on, t0: 0.6, t1: 2.8 }, { pos: pa, t0: 3.4, t1: 4.6, r: 0.8 }],
    subtitulos: [[0, "El botón ON/OFF está en el costado derecho"], [2.2, "Presiónalo una vez"], [3.4, "El rojo es el paro de emergencia"], [5.2, "Al frente se encienden la franja y la pantalla"]],
    manos: [{
      lado: "der", ancla: "index-finger-tip",
      kf: [
        { t: 0, pos: [on.x + 160, on.y + 70, on.z + 60], rot: [0, 90, -10], pose: "relajada" },
        { t: 1.6, pos: [on.x + 24, on.y + 2, on.z], rot: [-18, 90, 0], pose: "apuntar" },
        { t: 2.3, pos: [on.x + 1, on.y, on.z], rot: [-18, 90, 0], pose: "apuntar" },
        { t: 2.7, pos: [on.x - 1, on.y, on.z], rot: [-18, 90, 0], pose: "presionar" },
        { t: 3.2, pos: [on.x + 22, on.y + 4, on.z], rot: [-18, 90, 0], pose: "apuntar" },
        { t: 4.6, pos: [on.x + 170, on.y + 80, on.z + 70], rot: [0, 90, -10], pose: "relajada" },
      ],
    }],
    alTiempo(t) {
      cub.botones.encendido.position.z = t >= 2.55 && t < 2.95 ? 1.4 : 2.4;
      encendida(t >= 2.7);
    },
  },
  {
    id: "usb", nombre: "Conecta el USB", paso: "Máquina",
    duracion: 7,
    camara: [{ t: 0, pos: [u.x + 420, u.y + 170, u.z + 260], mira: [u.x + 20, u.y + 10, u.z + 10] },
             { t: 7, pos: [u.x + 260, u.y + 80, u.z + 160], mira: [u.x + 10, u.y, u.z] }],
    senal: { pos: u, t0: 0.4, t1: 3.0 },
    subtitulos: [[0, "El USB entra atrás, en el costado derecho"], [1.8, "La clavija cuadrada entra en un solo sentido"], [3.8, "Empújala hasta el fondo"], [5.4, "Listo: ahora conéctate desde la app"]],
    accesorio: {
      // punta de la clavija; entra hacia −X
      kf: [
        { t: 0, pos: [u.x + 200, u.y + 60, u.z + 70] },
        { t: 2.2, pos: [u.x + 30, u.y, u.z] },
        { t: 3.2, pos: [u.x + 9, u.y, u.z] },
        { t: 4.2, pos: [u.x - 8, u.y, u.z] },
        { t: 7, pos: [u.x - 8, u.y, u.z] },
      ],
    },
    manos: [{
      lado: "der", ancla: "pinza",
      kf: [
        { t: 0, pos: [u.x + 222, u.y + 60, u.z + 70], rot: [0, 90, -90], pose: "pinza" },
        { t: 2.2, pos: [u.x + 52, u.y, u.z], rot: [0, 90, -90], pose: "pinza" },
        { t: 3.2, pos: [u.x + 31, u.y, u.z], rot: [0, 90, -90], pose: "pinza" },
        { t: 4.2, pos: [u.x + 14, u.y, u.z], rot: [0, 90, -90], pose: "apretar" },
        { t: 4.8, pos: [u.x + 20, u.y, u.z], rot: [0, 90, -90], pose: "pinzaAbierta" },
        { t: 6.4, pos: [u.x + 150, u.y + 150, u.z + 130], rot: [0, 90, -60], pose: "relajada" },
      ],
    }],
    alTiempo(t, clip) {
      clavija.visible = cableUsb.malla.visible = true;
      clavija.position.copy(entre(clip.accesorio.kf, t, "pos"));
      clavija.rotation.set(0, Math.PI / 2, 0);       // el cuerpo hacia +X, la punta hacia la máquina
      cableUsb(enMundo(clavija, 0, 0, 47), new THREE.Vector3(1, 0, 0), new THREE.Vector3(560, -66, -260));   // la laptop, a la derecha
    },
  },
  {
    id: "quitarTapa", nombre: "Quita la tapa", paso: "Tapa",
    duracion: TAPA_D,
    camara: [{ t: 0, pos: [420, 320, 780], mira: [0, 40, 60] }, { t: 5.5, pos: [220, 420, 1050], mira: [-170, 20, 60] }, { t: TAPA_D, pos: [180, 330, 820], mira: [-40, -10, 80] }],
    senal: { pos: PUNTO.sensor, t0: 6.6, t1: TAPA_D },
    subtitulos: [[0, "Toma la tapa de los costados"], [2.0, "Levántala derecho hacia arriba"], [4.2, "Déjala a un lado, sobre la mesa"], [6.4, "Sin tapa la máquina se mueve, pero el husillo no enciende"]],
    manos: [manoTapa("der"), manoTapa("izq")],
    alTiempo(t) { cub.tapa.position.copy(entre(TAPA_KF, t, "o")); },
  },
  {
    id: "ponerTapa", nombre: "Pon la tapa", paso: "Tapa",
    duracion: TAPA_D,
    camara: [{ t: 0, pos: [180, 330, 820], mira: [-40, -10, 80] }, { t: 3.5, pos: [220, 420, 1050], mira: [-170, 20, 60] }, { t: TAPA_D, pos: [420, 300, 780], mira: [0, 30, 60] }],
    senal: { pos: PUNTO.sensor, t0: 6.2, t1: 7.8 },
    subtitulos: [[0, "Toma la tapa de los costados"], [3.0, "Llévala sobre la máquina"], [4.6, "Bájala derecho hasta que asiente"], [6.4, "Con la tapa puesta, el husillo ya puede encender"]],
    manos: [manoTapa("der"), manoTapa("izq")].map((m) => ({ ...m, kf: alReves(m.kf, TAPA_D) })),
    alTiempo(t) { cub.tapa.position.copy(entre(TAPA_KF, TAPA_D - t, "o")); },
  },
  {
    id: "sujetador", nombre: "Sujeta la placa", paso: "Placa",
    duracion: 7,
    camara: [{ t: 0, pos: [tornilloDer.x + 120, 95, tornilloDer.z + 120], mira: [tornilloDer.x - 10, 4, tornilloDer.z] },
             { t: 7, pos: [tornilloDer.x + 80, 70, tornilloDer.z + 85], mira: [tornilloDer.x - 6, 4, tornilloDer.z] }],
    senal: { pos: new THREE.Vector3(35, 2, Z_FRESA), t0: 0.2, t1: 1.4, r: 0.6 },
    subtitulos: [[0, "La lengüeta del sujetador va sobre la orilla de la placa"], [1.4, "Aprieta el tornillo con la llave Allen"], [4.2, "Firme, sin forzar: la placa no debe moverse"], [6.0, "Haz lo mismo del otro lado"]],
    manos: [],
    alTiempo(t) {
      cub.tapa.visible = false;
      const [t0, t1, t2, t3, t4, t5] = SUJ.t;
      // El sujetador entra de lado con el tornillo flojo
      const s = THREE.MathUtils.smoothstep(t, t0, t1);
      sujDer.grupo.position.x = 52 + 30 * (1 - s);
      const giro = THREE.MathUtils.clamp((t - t3) / (t4 - t3), 0, 1);
      sujDer.tornillo.position.y = SUJ.baja * (1 - giro);
      sujDer.tornillo.rotation.y = -giro * SUJ.vueltas * Math.PI * 2;
      // La llave baja al hexágono, gira con el tornillo y sale
      llave.visible = t >= t1 && t <= t5;
      const dentro = THREE.MathUtils.smoothstep(t, t1, t2 + 0.6) * (1 - THREE.MathUtils.smoothstep(t, t4, t5));
      const top = enMundo(sujDer.tornillo, 0, TOPE - 0.4, 0);
      llave.position.set(top.x, top.y + (1 - dentro) * 30, top.z);
      llave.rotation.set(0, sujDer.tornillo.rotation.y + Math.PI * 0.75, 0);
    },
  },
  {
    id: "herramientas", nombre: "Las herramientas", paso: "Herramienta",
    duracion: 12,
    camara: [{ t: 0, pos: [70, 60, Z_FRESA + 95], mira: [0, 44, Z_FRESA] }, { t: 8.6, pos: [80, 58, Z_FRESA + 100], mira: [0, 44, Z_FRESA] },
             { t: 9.6, pos: [70, 55, Z_FRESA + 110], mira: [34, 30, Z_FRESA] }, { t: 12, pos: [60, 50, Z_FRESA + 100], mira: [38, 30, Z_FRESA] }],
    senal: null,
    subtitulos: [[0, "Punta en V: graba las pistas"], [3, "Maíz: corta el contorno de la placa"], [6, "Broca: hace los hoyos"], [9, "Fíjate en la punta para saber cuál está puesta"]],
    manos: [],
    alTiempo(t) {
      cub.tapa.visible = false;
      cub.husillo.position.y = 40;
      const i = Math.min(2, Math.floor(t / 3)), tipo = ["v", "maiz", "broca"][i], f = t - i * 3;
      const h = cub.husillo.children[0];
      if (h.userData.tipo !== tipo) cub.ponerHerramienta(tipo);
      // entra desde abajo, se queda y sale (la última se queda)
      const baja = (1 - THREE.MathUtils.smoothstep(f, 0, 0.6)) + (i < 2 ? THREE.MathUtils.smoothstep(f, 2.4, 3) : 0);
      h.position.y = -28 * baja;
      h.visible = t < 9;
      muestrario.visible = t >= 9;
    },
  },
  {
    id: "sonda", nombre: "Conecta la sonda", paso: "Z0",
    duracion: 14,
    camara: [{ t: 0, pos: [-110, 330, 420], mira: [lv.x - 25, lv.y - 15, lv.z + 10] }, { t: 3.6, pos: [-70, 290, 340], mira: [lv.x - 20, lv.y - 10, lv.z + 5] },
             { t: 4.8, pos: [-160, 150, 260], mira: [10, 10, -10] }, { t: 8, pos: [-180, 120, 230], mira: [10, 10, -10] },
             { t: 9, pos: [-300, 170, 200], mira: [10, 35, -10] }, { t: 14, pos: [-200, 110, 120], mira: [0, 40, -25] }],
    senal: [{ pos: lv, t0: 0.4, t1: 2.2, r: 0.7 }, { pos: v3(NEGRO_EN), t0: 4.6, t1: 5.8, r: 0.8 }, { pos: v3(ROJO_EN).add(v3([0, 0, -9])), t0: 8.8, t1: 10.6 }],
    subtitulos: [[0, "El conector blanco va en «Leveling», arriba a la derecha"], [3, "El caimán negro muerde la orilla de la placa"], [8, "El rojo, la fresa, arriba de la punta"], [12, "Suéltalo con cuidado: la fresa es frágil"]],
    accesorio: {
      conector: [{ t: 0, pos: [lv.x - 140, lv.y - 60, lv.z + 160] }, { t: 1.8, pos: [lv.x - 20, lv.y, lv.z] }, { t: 2.4, pos: [lv.x - 6, lv.y, lv.z] }, { t: 2.9, pos: [lv.x + 3, lv.y, lv.z] }, { t: 14, pos: [lv.x + 3, lv.y, lv.z] }],
      negro: [{ t: 0, pos: LEJOS, abre: 0 }, { t: 4.4, pos: LEJOS, abre: 0 }, { t: 5.6, pos: [NEGRO_EN[0], NEGRO_EN[1] + 14, NEGRO_EN[2] + 30], abre: 1 },
              { t: 6.4, pos: NEGRO_EN, abre: 1 }, { t: 7.0, pos: NEGRO_EN, abre: 0.15 }, { t: 14, pos: NEGRO_EN, abre: 0.15 }],
      rojo: [{ t: 0, pos: LEJOS, abre: 0 }, { t: 8.0, pos: LEJOS, abre: 0 }, { t: 9.4, pos: [8, 44, 40], abre: 0 },
             { t: 10.2, pos: [0, 42, 10], abre: 1 }, { t: 11.2, pos: ROJO_EN, abre: 1 }, { t: 12.0, pos: ROJO_EN, abre: 0.2 }, { t: 14, pos: ROJO_EN, abre: 0.2 }],
    },
    manos: [{
      lado: "der", ancla: "pinza",
      kf: [
        // el conector: los dedos hacia +X y atrás, el brazo sale por el frente izquierdo
        { t: 0, pos: [lv.x - 145, lv.y - 60, lv.z + 160], rot: [0, -45, -90], pose: "pinza" },
        { t: 1.8, pos: [lv.x - 25, lv.y, lv.z], rot: [0, -45, -90], pose: "pinza" },
        { t: 2.4, pos: [lv.x - 11, lv.y, lv.z], rot: [0, -45, -90], pose: "pinza" },
        { t: 2.9, pos: [lv.x - 2, lv.y, lv.z], rot: [0, -45, -90], pose: "apretar" },
        { t: 3.4, pos: [lv.x - 20, lv.y, lv.z + 8], rot: [0, -45, -90], pose: "pinzaAbierta" },
        // el negro: de canto para morder la placa, inclinado hacia ella
        { t: 4.4, pos: v3(LEJOS).addScaledVector(dirNegro, 28).toArray(), rot: [-28, 0, 0], pose: "pinza" },
        { t: 5.6, pos: v3([NEGRO_EN[0], NEGRO_EN[1] + 14, NEGRO_EN[2] + 30]).addScaledVector(dirNegro, 28).toArray(), rot: [-28, 0, 0], pose: "apretar" },
        { t: 6.4, pos: v3(NEGRO_EN).addScaledVector(dirNegro, 28).toArray(), rot: [-28, 0, 0], pose: "apretar" },
        { t: 7.0, pos: v3(NEGRO_EN).addScaledVector(dirNegro, 31).toArray(), rot: [-28, 0, 0], pose: "pinzaAbierta" },
        // el rojo
        { t: 8.0, pos: [LEJOS[0], LEJOS[1], LEJOS[2] + 28], rot: [0, 0, -90], pose: "pinza" },
        { t: 9.4, pos: [8, 44, 40 + 28], rot: [0, 0, -90], pose: "pinza" },
        { t: 10.2, pos: [0, 42, 10 + 28], rot: [0, 0, -90], pose: "apretar" },
        { t: 11.2, pos: [0, 42, ROJO_EN[2] + 28], rot: [0, 0, -90], pose: "apretar" },
        { t: 12.0, pos: [0, 42, ROJO_EN[2] + 30], rot: [0, 0, -90], pose: "pinzaAbierta" },
        { t: 13.6, pos: [70, 90, 160], rot: [0, 0, -70], pose: "relajada" },
      ],
    }],
    alTiempo(t, clip) {
      cub.tapa.visible = false;
      const A = clip.accesorio;
      conector.visible = rojo.g.visible = negro.g.visible = true;
      cableNegro.malla.visible = t >= 4.4; cableRojo.malla.visible = t >= 8.0;
      conector.position.copy(entre(A.conector, t, "pos"));
      negro.g.position.copy(entre(A.negro, t, "pos")); negro.abrir(entre(A.negro, t, "abre"));
      negro.g.rotation.set(INCLINA, 0, Math.PI / 2);   // de canto: las mordazas abren arriba y abajo
      rojo.g.position.copy(entre(A.rojo, t, "pos")); rojo.abrir(entre(A.rojo, t, "abre"));
      rojo.g.rotation.set(0, 0, 0);
      const salida = enMundo(conector, -9, 0, 0);
      cableNegro(enMundo(negro.g, 0, 0, 36), new THREE.Vector3(0, 0, 1).applyQuaternion(negro.g.quaternion), salida, 40);
      cableRojo(enMundo(rojo.g, 0, 0, 36), new THREE.Vector3(0, 0, 1), salida, 30);
    },
  },
];

// ---------------- Reproductor ----------------
const BASE_MANOS = "../../shared/vendor/manos/";
const manos = { der: await Mano.crear("der", { base: BASE_MANOS }), izq: await Mano.crear("izq", { base: BASE_MANOS }) };
escena.add(manos.der.raiz, manos.izq.raiz);

let clip = CLIPS.find((c) => c.id === qs.get("clip")) ?? CLIPS[0];
let t = Number(qs.get("t") ?? 0), corriendo = !qs.has("t"), libre = false;

function aplicar() {
  for (const m of Object.values(manos)) m.raiz.visible = false;
  escenaBase();
  clip.alTiempo(t, clip);
  for (const p of clip.manos) { const m = manos[p.lado]; m.raiz.visible = true; animarMano(m, p.kf, t, p.ancla); }
  if (qs.has("mira")) {        // depuración: cámara fija
    camara.position.fromArray(qs.get("cam").split(",").map(Number)); orbita.target.fromArray(qs.get("mira").split(",").map(Number));
  } else if (!libre) {
    const [a, b, s] = tramo(clip.camara, t);
    camara.position.copy(v3(a.pos).lerp(v3(b.pos), s));
    orbita.target.copy(v3(a.mira).lerp(v3(b.mira), s));
  }
  ponerSenal(clip.senal, t);
  const sub = [...clip.subtitulos].reverse().find(([ts]) => t >= ts);
  $("subtitulo").textContent = sub ? sub[1] : "";
  $("paso").textContent = clip.paso;
  $("barra").value = Math.round((t / clip.duracion) * 1000);
  $("tiempo").textContent = `${t.toFixed(1)} / ${clip.duracion.toFixed(1)} s`;
  $("play").textContent = corriendo ? "❚❚" : "▶";
}

function elegir(c) {
  clip = c; t = 0; libre = false; corriendo = true;
  for (const b of $("clips").children) b.setAttribute("aria-pressed", b.dataset.id === c.id);
}
CLIPS.forEach((c, i) => {
  const b = document.createElement("button"); b.textContent = `${i + 1} · ${c.nombre}`; b.dataset.id = c.id;
  b.onclick = () => elegir(c); $("clips").append(b);
});
for (const b of $("clips").children) b.setAttribute("aria-pressed", b.dataset.id === clip.id);
$("play").onclick = () => { if (t >= clip.duracion) t = 0; corriendo = !corriendo; };
$("barra").oninput = (e) => { t = (e.target.value / 1000) * clip.duracion; corriendo = false; };
orbita.addEventListener("start", () => { libre = true; });

// Grabar: el clip completo, con el subtítulo dibujado en el video
let grabando = null;
const cuadro = document.createElement("canvas"), cx2 = cuadro.getContext("2d");
$("grabar").onclick = () => {
  if (grabando) return;
  const c = renderer.domElement; cuadro.width = c.width; cuadro.height = c.height;
  const tipo = ["video/webm;codecs=vp9", "video/webm"].find((x) => MediaRecorder.isTypeSupported(x));
  const rec = new MediaRecorder(cuadro.captureStream(30), { mimeType: tipo, videoBitsPerSecond: 8e6 });
  const partes = []; rec.ondataavailable = (e) => partes.push(e.data);
  rec.onstop = () => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(partes, { type: "video/webm" }));
    a.download = `clip-${clip.id}.webm`; a.click(); grabando = null; $("grabar").classList.remove("activo"); $("grabar").textContent = "Grabar";
  };
  t = 0; libre = false; corriendo = true; grabando = rec; rec.start();
  $("grabar").classList.add("activo"); $("grabar").textContent = "Grabando…";
};
function pintarCuadro() {
  const c = renderer.domElement;
  cx2.drawImage(c, 0, 0);
  const s = $("subtitulo").textContent, k = c.height / 720;
  if (s) {
    cx2.font = `600 ${Math.round(26 * k)}px Manrope, sans-serif`; cx2.textAlign = "center"; cx2.textBaseline = "middle";
    const w = cx2.measureText(s).width + 40 * k, h = 50 * k, x = c.width / 2, y = c.height - 50 * k;
    cx2.fillStyle = "rgba(17,19,23,.82)"; cx2.beginPath(); cx2.roundRect(x - w / 2, y - h / 2, w, h, 12 * k); cx2.fill();
    cx2.fillStyle = "#fff"; cx2.fillText(s, x, y);
  }
}

function tamano() {
  const r = lienzo.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); camara.aspect = r.width / r.height; camara.updateProjectionMatrix();
}
new ResizeObserver(tamano).observe(lienzo); tamano();

// ?poses: todas las poses de la mano en fila, para afinarlas
if (qs.has("poses")) {
  const nombres = Object.keys(POSES);
  const lista = await Promise.all(nombres.map(() => Mano.crear("der", { base: BASE_MANOS })));
  for (const o of [cub.fijo, cub.mesa, cub.carroX, cub.husillo, placa, sujIzq.grupo, sujDer.grupo, clavijaDC]) o.visible = false;
  lista.forEach((m, i) => { m.ponerPose(POSES[nombres[i]]); m.colocar(new THREE.Vector3((i - (nombres.length - 1) / 2) * 120, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 * Number(qs.get("poses") || 0), 0, 0)), "wrist"); escena.add(m.raiz); });
  clip = { ...CLIPS[0], manos: [], alTiempo() {}, camara: [{ t: 0, pos: (qs.get("cam") || "0,380,700").split(",").map(Number), mira: [0, 0, 0] }], subtitulos: [[0, nombres.join(" · ")]] };
}

let antes = performance.now();
renderer.setAnimationLoop((ahora) => {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora;
  if (corriendo) { t += dt; if (t >= clip.duracion) { t = clip.duracion; corriendo = false; grabando?.stop(); } }
  aplicar();
  orbita.update();
  renderer.render(escena, camara);
  if (grabando) pintarCuadro();
});
window.listo = true;
