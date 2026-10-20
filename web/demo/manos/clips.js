// clips.js - muestras de clips con manos para el tutorial de la CNC (no está enlazado desde la app).
//
// Cada clip: cámara, una o dos manos con cuadros clave (shared/js/manos.js), accesorios que se mueven
// y subtítulos. «Grabar» reproduce el clip completo y descarga un .webm con el subtítulo dentro.
// Depuración: ?clip=usb&t=3.2 congela el cuadro; ?poses muestra todas las poses de la mano.
//
// Marco (mm, igual que cubiko.js): X a la derecha, Y arriba, Z hacia quien está al frente.
// La cama queda en y = 0; la base de la máquina va de y −68 (mesa) a −14.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { construirCubiko, pintarPantalla, Z_FRESA } from "../../cnc/js/cubiko.js";
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
Object.assign(sol.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500, near: 10, far: 2000 });
sol.shadow.bias = -0.0005;
escena.add(sol, new THREE.HemisphereLight(0xffffff, 0xd8dbe0, 0.6));
const mesaTrabajo = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1000), new THREE.MeshStandardMaterial({ color: 0xdcd7cf, roughness: 0.9 }));
mesaTrabajo.rotation.x = -Math.PI / 2; mesaTrabajo.position.y = -68.2; mesaTrabajo.receiveShadow = true;
escena.add(mesaTrabajo);

const cub = construirCubiko({ cx: 0, zCama: 0 });
escena.add(cub.fijo, cub.mesa, cub.carroX, cub.husillo);
cub.mesa.position.z = Z_FRESA - 55;          // cama centrada bajo la fresa
cub.husillo.position.y = 35;                 // fresa 35 mm sobre la cama
const Y_PISO = cub.medidas.yPiso, Z_ATRAS = cub.medidas.zAtras;
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });

// Placa de cobre sobre la cama
const placa = new THREE.Mesh(new THREE.BoxGeometry(70, 1.6, 50), [mat(0xc9a45c), mat(0xc9a45c), mat(0xd08a4e, { metalness: 0.7, roughness: 0.3 }), mat(0xc9a45c), mat(0xc9a45c), mat(0xc9a45c)]);
placa.position.set(0, 0.8, Z_FRESA); placa.castShadow = placa.receiveShadow = true; escena.add(placa);

// ---------------- Panel trasero (POR CONFIRMAR en la Cubiko real: posición de interruptor, jack y USB-B) ----------------
const panel = new THREE.Group(); panel.position.set(0, Y_PISO + 14, Z_ATRAS); panel.rotation.y = Math.PI; escena.add(panel);
// en el marco del panel, +X va hacia la izquierda de la máquina vista de frente y +Z sale del panel hacia atrás
const P = { interruptor: -100, jack: -80, usb: -62 };
const marco = (w, h, x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), mat(0x111214, { roughness: 0.7 })); m.position.set(x, 0, 1); panel.add(m); return m; };
marco(16, 22, P.interruptor);
const tecla = new THREE.Group(); tecla.position.set(P.interruptor, 0, 2); panel.add(tecla);
const paleta = new THREE.Mesh(new THREE.BoxGeometry(12, 18, 3), mat(0x1c1d20, { roughness: 0.6 })); paleta.position.z = 1.5; tecla.add(paleta);
const marcaI = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 0.4), new THREE.MeshBasicMaterial({ color: 0xe9ebee })); marcaI.position.set(0, 5, 3.1); tecla.add(marcaI);
const marcaO = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.5, 8, 20), new THREE.MeshBasicMaterial({ color: 0xe9ebee })); marcaO.position.set(0, -5, 3.1); tecla.add(marcaO);
const jack = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 4, 24), mat(0x2a2c30)); jack.rotation.x = Math.PI / 2; jack.position.set(P.jack, 0, 2); panel.add(jack);
marco(14, 13, P.usb);
const bocaUsb = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 0.6), mat(0x050506)); bocaUsb.position.set(P.usb, 0, 2.05); panel.add(bocaUsb);
const enMundo = (x, y = 0, z = 0) => panel.localToWorld(new THREE.Vector3(x, y, z));
panel.updateMatrixWorld(true);
const PUNTO = {
  teclaI: enMundo(P.interruptor, 5, 4),          // la mitad «I» de la tecla
  usb: enMundo(P.usb, 0, 2.2),                    // boca del puerto USB-B
};

// Clavija USB-B con su cable (la punta en el origen, el cuerpo hacia +Z local = hacia atrás)
const clavija = new THREE.Group(); escena.add(clavija);
const metal = new THREE.Mesh(new THREE.BoxGeometry(8.6, 7.6, 9), mat(0xc4c8ce, { metalness: 0.9, roughness: 0.25 })); metal.position.z = 4.5; clavija.add(metal);
const cuerpoUsb = new THREE.Mesh(new THREE.BoxGeometry(12, 11, 26), mat(0x2b2d31)); cuerpoUsb.position.z = 9 + 13; clavija.add(cuerpoUsb);
const funda = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 12, 16), mat(0x2b2d31)); funda.rotation.x = Math.PI / 2; funda.position.z = 35 + 6; clavija.add(funda);
clavija.traverse((o) => { if (o.isMesh) o.castShadow = true; });

// Caimán rojo con su cable (mordazas hacia −Z local, se abren en el plano XZ)
const caiman = new THREE.Group(); escena.add(caiman);
const rojo = mat(0xd3262e, { roughness: 0.45 }), acero = mat(0xc4c8ce, { metalness: 0.9, roughness: 0.25 });
const mordaza = (lado) => {
  const g = new THREE.Group(); g.position.set(lado * 1.2, 0, 0);
  const m = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 16), acero); m.position.z = -8; g.add(m);
  for (let i = 0; i < 4; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.2), acero); d.position.set(-lado * 1.2, 0, -14 + i * 3); g.add(d); }
  caiman.add(g); return g;
};
const mordazas = [mordaza(-1), mordaza(1)];
const bota = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5.2, 36, 20), rojo); bota.rotation.x = Math.PI / 2; bota.position.z = 18; caiman.add(bota);
caiman.traverse((o) => { if (o.isMesh) o.castShadow = true; });

// Cables: tubo que se recalcula cada cuadro desde la parte trasera del accesorio hasta un punto fijo
function cable(color, radio) {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), mat(color, { roughness: 0.6 })); m.castShadow = true; escena.add(m);
  return (desde, dir, hasta) => {
    const a = desde.clone(), b = desde.clone().addScaledVector(dir, 50);
    const c = new THREE.Vector3((b.x + hasta.x) / 2, Math.min(b.y, hasta.y) - 20, (b.z + hasta.z) / 2);
    c.y = Math.max(c.y, -66);
    m.geometry.dispose();
    m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c, hasta]), 60, radio, 10, false);
  };
}
const cableUsb = cable(0x2b2d31, 2.4), cableCaiman = cable(0xd3262e, 1.6);
// Cable de corriente, siempre puesto en el jack
const clavijaDC = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 22, 20), mat(0x1c1d20)); clavijaDC.rotation.x = Math.PI / 2;
clavijaDC.position.set(P.jack, 0, 13); panel.add(clavijaDC); panel.updateMatrixWorld(true);
cable(0x1c1d20, 2.6)(enMundo(P.jack, 0, 24), new THREE.Vector3(0, 0, -1), new THREE.Vector3(160, -66, -620));

// Señal: aro cobre que late donde hay que actuar (siempre de frente a la cámara, encima de todo)
const senal = new THREE.Mesh(new THREE.RingGeometry(11, 14, 40), new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, depthTest: false }));
senal.renderOrder = 10; escena.add(senal);
function ponerSenal(s, t) {
  senal.visible = !!s && t >= s.t0 && t <= s.t1;
  if (!senal.visible) return;
  const f = (t - s.t0) % 1;
  senal.position.copy(s.pos); senal.quaternion.copy(camara.quaternion);
  senal.scale.setScalar(1 + f * 0.6); senal.material.opacity = 1 - f * 0.8;
}

// ---------------- Estado de la máquina ----------------
const luzApagada = cub.luz.material.color.getHex();
function encendida(si) {
  cub.luz.material.color.set(si ? 0x3ddc84 : luzApagada);
  if (si) pintarPantalla(cub.pantalla, { conectado: false });
  else { const x = cub.pantalla.cv.getContext("2d"); x.fillStyle = "#0b0d10"; x.fillRect(0, 0, 256, 160); cub.pantalla.tex.needsUpdate = true; }
}

// ---------------- Clips ----------------
// pos/rot de las manos en mm y grados (YXZ). Rot [0,0,0] = palma abajo, dedos hacia el fondo.
const ATRAS = 180;           // girada para entrar por detrás de la máquina
const ti = PUNTO.teclaI, u = PUNTO.usb;
const CLIPS = [
  {
    id: "encender", nombre: "1 · Enciende", paso: "Máquina",
    duracion: 7,
    camara: [{ t: 0, pos: [ti.x + 300, ti.y + 140, ti.z - 420], mira: [ti.x - 30, ti.y + 10, ti.z - 40] },
             { t: 3.2, pos: [ti.x + 220, ti.y + 95, ti.z - 310], mira: [ti.x - 20, ti.y, ti.z - 20] },
             { t: 4.4, pos: [420, 60, 0], mira: [0, -50, 0] },                    // rodea por la derecha…
             { t: 6.2, pos: [260, 30, 520], mira: [-40, -45, 150] }],               // …hasta ver la franja y la pantalla
    senal: { pos: ti, t0: 0.6, t1: 2.6 },
    subtitulos: [[0, "El interruptor está atrás, junto al cable de corriente"], [2.2, "Presiona el lado «I»"], [4.6, "Al frente, la franja de luz y la pantalla se encienden"]],
    manos: [{
      lado: "der", ancla: "index-finger-tip",
      kf: [
        { t: 0, pos: [ti.x - 40, ti.y + 70, ti.z - 160], rot: [0, ATRAS, -80], pose: "relajada" },
        { t: 1.6, pos: [ti.x, ti.y + 4, ti.z - 25], rot: [-5, ATRAS, -80], pose: "apuntar" },
        { t: 2.3, pos: [ti.x, ti.y, ti.z - 2], rot: [-5, ATRAS, -80], pose: "apuntar" },
        { t: 2.7, pos: [ti.x, ti.y, ti.z + 2], rot: [-5, ATRAS, -80], pose: "presionar" },
        { t: 3.2, pos: [ti.x, ti.y, ti.z - 18], rot: [-5, ATRAS, -80], pose: "apuntar" },
        { t: 4.6, pos: [ti.x - 40, ti.y + 70, ti.z - 170], rot: [0, ATRAS, -80], pose: "relajada" },
      ],
    }],
    alTiempo(t) {
      const on = t >= 2.6;
      tecla.rotation.x = on ? -0.22 : 0.22;          // la mitad «I» queda hundida
      encendida(on);
      clavija.visible = caiman.visible = false;
      cub.tapa.visible = true;
    },
  },
  {
    id: "usb", nombre: "2 · Conecta el USB", paso: "Máquina",
    duracion: 7,
    camara: [{ t: 0, pos: [u.x + 40, u.y + 150, u.z - 480], mira: [u.x + 10, u.y + 10, u.z - 60] },
             { t: 7, pos: [u.x + 20, u.y + 50, u.z - 330], mira: [u.x + 10, u.y, u.z - 10] }],
    senal: { pos: u, t0: 0.4, t1: 3.0 },
    subtitulos: [[0, "Toma el cable USB de la laptop"], [1.8, "La clavija cuadrada entra en un solo sentido"], [3.8, "Empújala hasta el fondo"], [5.4, "Listo: ahora conéctate desde la app"]],
    accesorio: {
      // punta de la clavija; dirección +Z del mundo = hacia el panel (la máquina está en z > −168)
      kf: [
        { t: 0, pos: [u.x + 70, u.y + 60, u.z - 200] },
        { t: 2.2, pos: [u.x, u.y, u.z - 30] },
        { t: 3.2, pos: [u.x, u.y, u.z - 9] },
        { t: 4.2, pos: [u.x, u.y, u.z + 8] },
        { t: 7, pos: [u.x, u.y, u.z + 8] },
      ],
    },
    manos: [{
      lado: "der", ancla: "pinza",
      kf: [
        { t: 0, pos: [u.x + 70, u.y + 60, u.z - 222], rot: [0, ATRAS, -90], pose: "pinza" },
        { t: 2.2, pos: [u.x, u.y, u.z - 52], rot: [0, ATRAS, -90], pose: "pinza" },
        { t: 3.2, pos: [u.x, u.y, u.z - 31], rot: [0, ATRAS, -90], pose: "pinza" },
        { t: 4.2, pos: [u.x, u.y, u.z - 14], rot: [0, ATRAS, -90], pose: "apretar" },
        { t: 4.8, pos: [u.x, u.y, u.z - 20], rot: [0, ATRAS, -90], pose: "pinzaAbierta" },
        { t: 6.4, pos: [u.x - 130, u.y + 150, u.z - 110], rot: [0, ATRAS, -60], pose: "relajada" },
      ],
    }],
    alTiempo(t, clip) {
      encendida(true); tecla.rotation.x = -0.22;
      caiman.visible = false; clavija.visible = true; cub.tapa.visible = true;
      const [a, b, s] = tramo(clip.accesorio.kf, t);
      clavija.position.set(...a.pos).lerp(new THREE.Vector3(...b.pos), s);
      clavija.rotation.set(0, Math.PI, 0);       // la punta mira a +Z del mundo
      cableUsb(clavija.localToWorld(new THREE.Vector3(0, 0, 47)), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-180, -66, -600));   // la laptop, a la izquierda vista desde atrás
    },
  },
  {
    id: "caiman", nombre: "3 · Caimán en la fresa", paso: "Z0",
    duracion: 7,
    camara: [{ t: 0, pos: [-300, 170, 200], mira: [10, 35, -10] }, { t: 7, pos: [-200, 110, 120], mira: [0, 40, -25] }],
    senal: { pos: new THREE.Vector3(0, 42, Z_FRESA + 2), t0: 0.6, t1: 3.4 },
    subtitulos: [[0, "Con la tapa abierta, toma el caimán rojo"], [1.6, "Apriétalo para abrir la boca"], [3.4, "Muérdele la fresa, arriba de la punta"], [5, "Suéltalo con cuidado: la fresa es frágil"]],
    accesorio: {
      // punta de las mordazas; abre = 0…1
      kf: [
        { t: 0, pos: [40, 60, 180], abre: 0 },
        { t: 1.6, pos: [8, 44, 40], abre: 0 },
        { t: 2.4, pos: [0, 42, 10], abre: 1 },
        { t: 3.6, pos: [0, 42, Z_FRESA + 9], abre: 1 },
        { t: 4.4, pos: [0, 42, Z_FRESA + 9], abre: 0.2 },
        { t: 7, pos: [0, 42, Z_FRESA + 9], abre: 0.2 },
      ],
    },
    manos: [{
      // la pinza toma el caimán por la parte de atrás de la funda (+28 en z), de lado para apretar las asas
      lado: "der", ancla: "pinza",
      kf: [
        { t: 0, pos: [40, 60, 180 + 28], rot: [0, 0, -90], pose: "pinza" },
        { t: 1.6, pos: [8, 44, 40 + 28], rot: [0, 0, -90], pose: "pinza" },
        { t: 2.4, pos: [0, 42, 10 + 28], rot: [0, 0, -90], pose: "apretar" },
        { t: 3.6, pos: [0, 42, Z_FRESA + 9 + 28], rot: [0, 0, -90], pose: "apretar" },
        { t: 4.4, pos: [0, 42, Z_FRESA + 9 + 30], rot: [0, 0, -90], pose: "pinzaAbierta" },
        { t: 6.2, pos: [70, 90, 160], rot: [0, 0, -70], pose: "relajada" },
      ],
    }],
    alTiempo(t, clip) {
      encendida(true); tecla.rotation.x = -0.22;
      clavija.visible = false; caiman.visible = true; cub.tapa.visible = false;
      const [a, b, s] = tramo(clip.accesorio.kf, t);
      caiman.position.set(...a.pos).lerp(new THREE.Vector3(...b.pos), s);
      const abre = a.abre + (b.abre - a.abre) * s;
      mordazas[0].rotation.y = abre * 0.35; mordazas[1].rotation.y = -abre * 0.35;
      cableCaiman(caiman.localToWorld(new THREE.Vector3(0, 0, 36)), new THREE.Vector3(0, 0, 1), new THREE.Vector3(260, -66, 300));
    },
  },
];

// ---------------- Reproductor ----------------
const manos = { der: await Mano.crear("der", { base: "../../shared/vendor/manos/" }), izq: await Mano.crear("izq", { base: "../../shared/vendor/manos/" }) };
escena.add(manos.der.raiz, manos.izq.raiz);

let clip = CLIPS.find((c) => c.id === qs.get("clip")) ?? CLIPS[0];
let t = Number(qs.get("t") ?? 0), corriendo = !qs.has("t"), libre = false;
const v3 = (a) => new THREE.Vector3(...a);

function aplicar() {
  for (const m of Object.values(manos)) m.raiz.visible = false;
  for (const p of clip.manos) { const m = manos[p.lado]; m.raiz.visible = true; animarMano(m, p.kf, t, p.ancla); }
  clip.alTiempo(t, clip);
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
for (const c of CLIPS) {
  const b = document.createElement("button"); b.textContent = c.nombre; b.dataset.id = c.id;
  b.onclick = () => elegir(c); $("clips").append(b);
}
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
  const lista = await Promise.all(nombres.map(() => Mano.crear("der", { base: "../../shared/vendor/manos/" })));
  for (const o of [cub.fijo, cub.mesa, cub.carroX, cub.husillo, placa, panel, clavija, caiman]) o.visible = false;
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
