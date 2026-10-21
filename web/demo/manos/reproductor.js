// reproductor.js - reproduce los clips (clips.js) sobre la escena (escena.js), con las manos.
//
// Las manos: cada cuadro clave se convierte en una pose de la raíz (posición y giro) y una pose de dedos;
// entre cuadros se mezclan, y luego los dedos se ajustan a lo que tocan (manos.js + contacto.js).
// «Grabar» reproduce el clip y descarga un .webm con el subtítulo dentro.
//
// Depuración y prueba:
//   ?clip=usb&t=3.2        congela ese cuadro
//   &cam=x,y,z&mira=x,y,z  fija la cámara
//   ?hoja=usb&n=8          tira de n cuadros del clip (para revisarlo de un vistazo)
//   ?prueba[=id]           mide, cuadro por cuadro, cuánto atraviesan la piel, la manga y los cables
//                          (resultado en <pre id="reporte"> y window.reporte)
//   ?mano=agarre&ancho=8   la mano sola en una pose, de tres lados

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { renderer, escena, camara, escenaBase, obstaculos, OBJ, cables, v3 } from "./escena.js";
import { Mano, POSES, mezclarPoses, tramo, qDe } from "../../shared/js/manos.js";
import { Obstaculos } from "../../shared/js/contacto.js";
import { CLIPS } from "./clips.js";

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const lienzo = $("lienzo");
lienzo.prepend(renderer.domElement);
const orbita = new OrbitControls(camara, renderer.domElement);
orbita.enableDamping = true;

// ---------------- Manos ----------------
const BASE = "../../shared/vendor/manos/";
const manos = { der: await Mano.crear("der", { base: BASE }), izq: await Mano.crear("izq", { base: BASE }) };
escena.add(manos.der.raiz, manos.izq.raiz);
// Las poses de agarre se resuelven antes (cada ancho una vez)
for (const c of CLIPS) for (const p of c.manos) for (const k of p.kf) if (k.agarra) manos[p.lado].poseAgarre(OBJ[k.agarra].agarre.ancho);

const poseDe = (p) => (typeof p === "string" ? POSES[p] : p);
// Un cuadro clave → { pos, q, pose, cierre } de la raíz de la mano (evaluado en el instante actual)
function evaluar(mano, k, pista) {
  if (k.agarra) {
    const { o, agarre } = OBJ[k.agarra];
    o.updateMatrixWorld(true);
    const palma = v3(k.palma ?? [0, -1, 0]).normalize();
    const pose = mano.poseAgarre(agarre.ancho);
    const T = mano.transformarAgarre({ centro: o.localToWorld(agarre.centro.clone()), eje: agarre.eje.clone().transformDirection(o.matrixWorld), palma }, pose);
    // «aleja»: la mano se retira de lo que agarra (hacia el dorso y hacia el antebrazo)
    if (k.aleja) T.pos.addScaledVector(new THREE.Vector3(0, 0.7, 0.7).applyQuaternion(T.q), k.aleja);
    const vista = k.pose ? { ...poseDe(k.pose), cierre: pose.cierre, abierto: pose.abierto } : pose;
    return { pos: T.pos, q: T.q, pose: vista, cierre: k.cierre ?? 1 };
  }
  let pos = v3(k.pos), q = qDe(k.rot);
  if (k.en) { const o = OBJ[k.en].o; o.updateMatrixWorld(true); pos = o.localToWorld(pos); q = o.getWorldQuaternion(new THREE.Quaternion()).multiply(q); }
  const pose = poseDe(k.pose);
  mano.ponerPose(pose); mano.colocar(pos, q, k.ancla ?? pista.ancla ?? "index-finger-tip");
  return { pos: mano.raiz.position.clone(), q: mano.raiz.quaternion.clone(), pose, cierre: k.cierre ?? 0 };
}
// ---------------- Horneado: el contacto se calcula una vez por cuadro clave ----------------
// Calcular el contacto en cada cuadro hacía temblar los dedos (cada cuadro encontraba otra solución). Ahora,
// antes de reproducir, se pone la escena en el instante de cada cuadro clave, se ajustan los dedos a lo que
// tocan y se guarda esa pose (y el desplazamiento de «empuja»). Al reproducir solo se interpola entre poses
// fijas, así que el movimiento es continuo; lo que se atraviese entre cuadros lo esconde la cámara.
function hornear(c) {
  if (c._horneado) return;
  for (const p of c.manos) {
    const m = manos[p.lado];
    for (const k of p.kf) {
      for (const o of Object.values(manos)) o.raiz.visible = false;
      escenaBase(); c.alTiempo?.(k.t); escena.updateMatrixWorld(true); obstaculos.actualizar();
      m.raiz.visible = true;
      const E = evaluar(m, k, p);
      m.ponerPose(E.pose); m.raiz.position.copy(E.pos); m.raiz.quaternion.copy(E.q); m.raiz.updateMatrixWorld(true);
      m.ajustar(obstaculos, { cierre: E.cierre });
      const pose = m.pose;
      if (k.empuja) empujar(m, v3(k.empuja).normalize());
      (k._horno ??= {})[p.lado] = { pose, off: m.raiz.position.clone().sub(E.pos) };
    }
  }
  c._horneado = true;
}

// Posición de la mano en un cuadro clave, en el instante actual (los agarres siguen a su objeto)
function puntoKF(mano, pista, i) {
  const k = pista.kf[i], E = evaluar(mano, k, pista);
  return { ...E, pos: E.pos.add(k._horno[pista.lado].off), pose: k._horno[pista.lado].pose };
}
// Pasa sin detenerse por un cuadro libre que va en la misma dirección; se detiene en los extremos, en los
// agarres (la mano llega a tomar algo) y donde marque «alto»
const pasaPor = (kf, i, P) => {
  const k = kf[i];
  if (i === 0 || i === kf.length - 1 || k.agarra || k.en || k.alto) return null;
  const a = P(i - 1), b = P(i), c = P(i + 1);
  if (b.clone().sub(a).dot(c.clone().sub(b)) <= 0) return null;
  return c.sub(a).divideScalar(kf[i + 1].t - kf[i - 1].t);
};
function animar(mano, pista, t) {
  const kf = pista.kf;
  let i = kf.findIndex((k) => k.t > t) - 1;
  if (i < 0) i = t < kf[0].t ? 0 : kf.length - 1;
  const j = Math.min(i + 1, kf.length - 1);
  const A = puntoKF(mano, pista, i), B = j === i ? A : puntoKF(mano, pista, j);
  const dt = kf[j].t - kf[i].t, s = dt > 0 ? THREE.MathUtils.clamp((t - kf[i].t) / dt, 0, 1) : 0;
  const u = s * s * (3 - 2 * s);
  // Posición: curva de Hermite (velocidad continua donde la mano solo pasa)
  const P = (n) => puntoKF(mano, pista, n).pos;
  const m0 = j === i ? null : pasaPor(kf, i, P), m1 = j === i ? null : pasaPor(kf, j, P);
  const h10 = s * s * s - 2 * s * s + s, h11 = s * s * s - s * s;
  const pos = A.pos.clone().lerp(B.pos, u);
  if (m0) pos.addScaledVector(m0, h10 * dt);
  if (m1) pos.addScaledVector(m1, h11 * dt);
  mano.ponerPose(mezclarPoses(A.pose, B.pose, u));
  mano.raiz.position.copy(pos); mano.raiz.quaternion.copy(A.q).slerp(B.q, u);
  mano.raiz.updateMatrixWorld(true);
}
function empujar(mano, d, tol = 0.6) {
  const p0 = mano.raiz.position.clone();
  const pen = (x) => { mano.raiz.position.copy(p0).addScaledVector(d, x); mano.raiz.updateMatrixWorld(true); const c = mano.raiz.position; return Obstaculos.penetracion(mano.piel("todo"), obstaculos.cerca(c.x, c.y, c.z, 230), tol).pen; };
  if (pen(0) <= tol) { pen(0); return; }
  let lo = 0, hi = 40;
  if (pen(hi) > tol) { pen(hi); return; }
  for (let k = 0; k < 7; k++) { const m = (lo + hi) / 2; if (pen(m) <= tol) hi = m; else lo = m; }
  pen(hi);
}

// ---------------- Un cuadro ----------------
let clip = CLIPS.find((c) => c.id === (qs.get("clip") || qs.get("hoja"))) ?? CLIPS[0];
let t = Number(qs.get("t") ?? 0), corriendo = !qs.has("t") && !qs.has("hoja") && !qs.has("prueba"), libre = false;

// Una señal: aro cobre que late donde hay que actuar (de frente a la cámara, encima de todo)
const senal = new THREE.Mesh(new THREE.RingGeometry(11, 14, 40), new THREE.MeshBasicMaterial({ color: 0xff6b35, transparent: true, depthTest: false }));
senal.renderOrder = 10; senal.userData.sinColision = true; escena.add(senal);
function ponerSenal(lista, tt) {
  const s = (Array.isArray(lista) ? lista : [lista]).find((x) => x && tt >= x.t0 && tt <= x.t1);
  senal.visible = !!s;
  if (!s) return;
  const f = (tt - s.t0) % 1;
  senal.position.copy(s.pos); senal.quaternion.copy(camara.quaternion);
  senal.scale.setScalar((s.r ?? 1) * (1 + f * 0.6)); senal.material.opacity = 1 - f * 0.8;
}

function escenaEn(c, tt) {
  hornear(c);
  for (const m of Object.values(manos)) m.raiz.visible = false;
  escenaBase();
  c.alTiempo?.(tt);
  escena.updateMatrixWorld(true);
  obstaculos.actualizar();
  for (const p of c.manos) {
    if ((p.desde != null && tt < p.desde) || (p.hasta != null && tt > p.hasta)) continue;   // la mano aún no entra (o ya salió)
    const m = manos[p.lado]; m.raiz.visible = true; animar(m, p, tt);
  }
}
function camaraEn(c, tt) {
  if (qs.has("mira")) { camara.position.fromArray(qs.get("cam").split(",").map(Number)); orbita.target.fromArray(qs.get("mira").split(",").map(Number)); }
  else if (!libre) { const [a, b, s] = tramo(c.camara, tt); camara.position.copy(v3(a.pos).lerp(v3(b.pos), s)); orbita.target.copy(v3(a.mira).lerp(v3(b.mira), s)); }
  camara.lookAt(orbita.target);
}
const subtituloEn = (c, tt) => [...c.subtitulos].reverse().find(([ts]) => tt >= ts)?.[1] ?? "";

function aplicar() {
  escenaEn(clip, t);
  camaraEn(clip, t);
  ponerSenal(clip.senal, t);
  $("subtitulo").textContent = subtituloEn(clip, t);
  $("paso").textContent = clip.paso;
  $("barra").value = Math.round((t / clip.duracion) * 1000);
  $("tiempo").textContent = `${t.toFixed(1)} / ${clip.duracion.toFixed(1)} s`;
  $("play").textContent = corriendo ? "❚❚" : "▶";
}

// ---------------- Interfaz ----------------
function elegir(c) {
  clip = c; t = 0; libre = false; corriendo = true;
  for (const b of $("clips").querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.id === c.id);
}
{
  let paso = null;
  CLIPS.forEach((c, i) => {
    if (c.paso !== paso) { paso = c.paso; const s = document.createElement("span"); s.className = "grupo"; s.textContent = paso; $("clips").append(s); }
    const b = document.createElement("button"); b.textContent = `${i + 1} · ${c.nombre}`; b.dataset.id = c.id;
    b.setAttribute("aria-pressed", c.id === clip.id); b.onclick = () => elegir(c); $("clips").append(b);
  });
}
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
function subtituloEnLienzo(x, s, W, H) {
  if (!s) return;
  const k = H / 720;
  x.font = `600 ${Math.round(26 * k)}px Manrope, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle";
  const w = x.measureText(s).width + 40 * k, h = 50 * k, cx = W / 2, cy = H - 50 * k;
  x.fillStyle = "rgba(17,19,23,.82)"; x.beginPath(); x.roundRect(cx - w / 2, cy - h / 2, w, h, 12 * k); x.fill();
  x.fillStyle = "#fff"; x.fillText(s, cx, cy);
}

function tamano() {
  const r = lienzo.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); camara.aspect = r.width / r.height; camara.updateProjectionMatrix();
}
new ResizeObserver(tamano).observe(lienzo); tamano();

// ---------------- ?hoja: tira de cuadros ----------------
if (qs.has("hoja")) {
  const n = Number(qs.get("n") || 8), W = 480, H = 300, cols = 4, filas = Math.ceil(n / cols);
  const hoja = document.createElement("canvas"); hoja.width = W * cols; hoja.height = H * filas;
  const x = hoja.getContext("2d");
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); camara.aspect = W / H; camara.updateProjectionMatrix();
  for (let i = 0; i < n; i++) {
    const tt = (clip.duracion * (i + 0.5)) / n;
    escenaEn(clip, tt); camaraEn(clip, tt); ponerSenal(clip.senal, tt);
    renderer.render(escena, camara);
    const px = (i % cols) * W, py = Math.floor(i / cols) * H;
    x.drawImage(renderer.domElement, px, py, W, H);
    x.save(); x.translate(px, py); subtituloEnLienzo(x, subtituloEn(clip, tt), W, H);
    x.fillStyle = "rgba(17,19,23,.75)"; x.font = "700 14px 'IBM Plex Mono', monospace"; x.textAlign = "left"; x.fillText(`${clip.id} ${tt.toFixed(1)} s`, 10, 18); x.restore();
    x.strokeStyle = "#fff"; x.lineWidth = 2; x.strokeRect(px, py, W, H);
  }
  document.body.innerHTML = ""; document.body.style.cssText = "margin:0;background:#fff;display:block";
  hoja.style.cssText = "display:block;width:100%"; document.body.append(hoja);
  window.listo = true;
  throw new Error("hoja lista");      // nada más que hacer en este modo
}

// ---------------- ?mano=pose&ancho=8: la mano sola en esa pose, de lado, desde abajo y de frente ----------------
if (qs.has("mano")) {
  const nombre = qs.get("mano"), ancho = Number(qs.get("ancho") || 8);
  const lista = await Promise.all([0, 1, 2].map(() => Mano.crear("der", { base: BASE })));
  escena.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh && o.parent !== escena) o.visible = false; });
  for (const o of [...escena.children]) if (o.isGroup || (o.isMesh && o.geometry?.type !== "BoxGeometry")) o.visible = false;
  for (const m of Object.values(manos)) m.raiz.visible = false;
  const pose = nombre === "agarre" ? lista[0].poseAgarre(ancho) : POSES[nombre];
  const giros = [[0, 0, 0], [90, 0, 0], [0, 90, 0]];      // de lado (palma abajo), desde abajo, de frente
  lista.forEach((m, i) => {
    m.ponerPose(pose); m.raiz.visible = true; escena.add(m.raiz);
    m.raiz.position.set((i - 1) * 230, 120, 0); m.raiz.quaternion.copy(qDe(giros[i]));
    m.raiz.updateMatrixWorld(true);
    const pt = m.huesos["thumb-tip"].getWorldPosition(new THREE.Vector3()), y = m.yemaIndice().p;
    for (const [p, c] of [[pt, 0x2563eb], [y, 0xdc2626]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(2.5), new THREE.MeshBasicMaterial({ color: c, depthTest: false })); b.position.copy(p); b.renderOrder = 9; escena.add(b); }
  });
  clip = { ...CLIPS[0], manos: [], alTiempo() {}, camara: [{ t: 0, pos: [0, 120, 700], mira: [0, 120, 0] }], subtitulos: [[0, `${nombre} ${ancho} · azul: pulgar · rojo: yema del índice`]] };
  CLIPS.unshift(clip);
}

// ---------------- ?prueba: cuánto se atraviesa ----------------
// Piel de la mano contra todo lo sólido, la manga (antebrazo) contra todo, y los cables contra la mano.
const nombre = (o) => { const p = []; for (let q = o; q; q = q.parent) if (q.name) { p.push(q.name); if (p.length === 2) break; } return `${p.join(" < ") || "?"} (${o.geometry?.type?.replace("Geometry", "") ?? ""})`; };
function capsulasMano(m) {
  const H = m.huesos, w = (n) => H[n].getWorldPosition(new THREE.Vector3()), out = [];
  const dedos = [["thumb-metacarpal", "thumb-phalanx-proximal", "thumb-phalanx-distal", "thumb-tip"], ...["index-finger", "middle-finger", "ring-finger", "pinky-finger"].map((d) => ["phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip"].map((s) => `${d}-${s}`))];
  for (const c of dedos) for (let i = 0; i < c.length - 1; i++) out.push([w(c[i]), w(c[i + 1]), 7]);
  for (const d of ["index-finger", "middle-finger", "ring-finger", "pinky-finger"]) out.push([w("wrist"), w(`${d}-phalanx-proximal`), 11]);
  return out;
}
const dSeg = (p, a, b) => { const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
function medir(c, tt, peores) {
  for (const p of c.manos) {
    const m = manos[p.lado];
    if (!m.raiz.visible) continue;
    m.raiz.updateMatrixWorld(true);
    const c0 = m.raiz.position, lista = obstaculos.cerca(c0.x, c0.y, c0.z, 230);
    for (const g of ["palma", "pulgar", "indice", "medio", "anular", "menique"]) {
      const piel = Obstaculos.penetracion(m.piel(g), lista);
      if (piel.pen > 0.5) { const e = piel.entrada; peores.push({ t: tt, mano: p.lado, que: g, mm: piel.pen, contra: `${nombre(e.malla)} @${Math.round(e.sx)},${Math.round(e.sy)},${Math.round(e.sz)}` }); }
    }
    const { pts, radio } = m.ejeManga();
    for (let i = 0; i < pts.length; i += 3) for (const e of obstaculos.cerca(pts[i], pts[i + 1], pts[i + 2], radio)) {
      const d = radio - Obstaculos.sdf(e, pts[i], pts[i + 1], pts[i + 2]);
      if (d > 2) peores.push({ t: tt, mano: p.lado, que: "manga", mm: d, contra: nombre(e.malla) });
    }
    const caps = capsulasMano(m);
    for (const [n, cb] of Object.entries(cables)) {
      if (!cb?.malla.visible) continue;
      for (const q of cb.muestras(80)) for (const [a, b, r] of caps) {
        const d = r + cb.radio - dSeg(q, a, b);
        if (d > 1) peores.push({ t: tt, mano: p.lado, que: "cable", mm: d, contra: `cable ${n}` });
      }
    }
  }
}
// ?fluidez: sigue la muñeca y las puntas de los dedos a 60 cuadros por segundo y reporta los saltos: el cambio
// de velocidad más brusco entre dos cuadros (mm/s por cuadro). Una mano que se mueve bien no pasa de ~40.
if (qs.has("fluidez")) {
  const lista = qs.get("fluidez") ? CLIPS.filter((c) => qs.get("fluidez").split(",").includes(c.id)) : CLIPS;
  const PUNTOS = ["wrist", "thumb-tip", "index-finger-tip", "middle-finger-tip", "pinky-finger-tip"], dt = 1 / 60, reporte = {};
  for (const c of lista) {
    const hist = {}, peor = {};
    for (let tt = 0; tt <= c.duracion + 1e-6; tt += dt) {
      escenaEn(c, tt);
      for (const p of c.manos) {
        const m = manos[p.lado];
        for (const n of PUNTOS) {
          const k = `${p.lado} ${n}`, h = (hist[k] ??= []);
          if (!m.raiz.visible) { h.length = 0; continue; }
          h.push(m.huesos[n].getWorldPosition(new THREE.Vector3())); if (h.length > 3) h.shift();
          if (h.length === 3) {
            const salto = h[2].clone().sub(h[1]).sub(h[1].clone().sub(h[0])).length() / (dt * dt) * dt;   // mm/s de cambio por cuadro
            if (!peor[k] || salto > peor[k].v) peor[k] = { v: +salto.toFixed(0), t: +tt.toFixed(2) };
          }
        }
      }
    }
    reporte[c.id] = Object.fromEntries(Object.entries(peor).sort((a, b) => b[1].v - a[1].v).slice(0, 4));
    await new Promise((r) => setTimeout(r, 0));
  }
  const pre = document.createElement("pre"); pre.id = "reporte"; pre.textContent = JSON.stringify(reporte, null, 1);
  document.body.innerHTML = ""; document.body.append(pre);
  window.listo = true;
  throw new Error("fluidez lista");
}

if (qs.has("prueba")) {
  const lista = qs.get("prueba") ? CLIPS.filter((c) => qs.get("prueba").split(",").includes(c.id)) : CLIPS;
  const reporte = {};
  for (const c of lista) {
    const peores = [];
    for (let tt = 0; tt <= c.duracion + 1e-6; tt += 1 / 15) { escenaEn(c, tt); medir(c, tt, peores); }
    // por tipo y contra qué: lo peor y cuándo
    const grupos = {};
    for (const p of peores) { const k = `${p.mano} ${p.que} × ${p.contra}`; if (!grupos[k] || grupos[k].mm < p.mm) grupos[k] = { mm: +p.mm.toFixed(1), t: +p.t.toFixed(2), desde: grupos[k]?.desde ?? +p.t.toFixed(2), n: (grupos[k]?.n ?? 0) + 1 }; else { grupos[k].n++; } }
    for (const p of peores) { const k = `${p.mano} ${p.que} × ${p.contra}`; grupos[k].desde = Math.min(grupos[k].desde, +p.t.toFixed(2)); grupos[k].hasta = Math.max(grupos[k].hasta ?? 0, +p.t.toFixed(2)); }
    reporte[c.id] = Object.fromEntries(Object.entries(grupos).sort((a, b) => b[1].mm - a[1].mm));
    await new Promise((r) => setTimeout(r, 0));
  }
  window.reporte = reporte;
  const pre = document.createElement("pre"); pre.id = "reporte"; pre.textContent = JSON.stringify(reporte, null, 1);
  document.body.innerHTML = ""; document.body.append(pre);
  window.listo = true;
  throw new Error("prueba lista");
}

// ---------------- Bucle ----------------
let antes = performance.now();
renderer.setAnimationLoop((ahora) => {
  const dt = Math.min(0.05, (ahora - antes) / 1000); antes = ahora;
  if (corriendo) { t += dt; if (t >= clip.duracion) { t = clip.duracion; corriendo = false; grabando?.stop(); } }
  aplicar();
  if (libre) orbita.update();
  renderer.render(escena, camara);
  if (grabando) { const c = renderer.domElement; cx2.drawImage(c, 0, 0); subtituloEnLienzo(cx2, $("subtitulo").textContent, c.width, c.height); }
});
window.listo = true;
