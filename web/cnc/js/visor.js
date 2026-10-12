// visor.js - gemelo 3D de la Genmitsu Cubiko.
//
// El modelo de la máquina está en cubiko.js (primitivas a partir de fotos y medidas oficiales;
// no hay CAD público). En la Cubiko la cama se mueve en Y y el husillo en X y Z, y así se anima.
//
// Unidades: mm. Ejes de three: X = X de la máquina, Y = Z de la máquina (arriba),
// Z = −Y de la máquina (hacia el usuario). Todo lo que va sobre la cama
// (material, trayectorias, malla de alturas, cero) vive en el grupo `cama`, en
// coordenadas de máquina, y se mueve con ella.
//
// Material: la placa virgen, con su esquina inferior izquierda en X0 Y0. La cara de
// cobre es un lienzo: donde la punta de la fresa baja de Z0 se pinta un surco del
// ancho de la herramienta (color y relieve según la profundidad).

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { construirCubiko, pintarPantalla, Z_FRESA } from "./cubiko.js";

export const AREA = { x: 145, y: 110, z: 40 };
const Z_CAMA = -40;          // Z de máquina de la superficie del MDF de sacrificio (punta de la fresa en su punto más bajo)
const C = {
  fondo: 0xe5e7eb, carcasa: 0x1a1d22, carcasa2: 0x2a2d33, aluminio: 0xc9ccd1, acero: 0xb7bcc4,
  mdf: 0xc8a27a, cobre: 0xd28b53, fr4: 0x2f5e3a, acrilico: 0x9aa3ad, verde: 0x3ddc84,
  rapido: 0x8e939b, hecho: 0x111317, cero: 0x111317, area: 0x6b6f76,
};
// Color por trabajo (contenido, capa 3): el mismo en el panel y en el 3D
export const COLOR_TRABAJO = { pistas: 0x2563eb, hoyos: 0x00bfa6, contorno: 0x7c3aed, archivo: 0x2563eb };

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);   // máquina → three
const COBRE = 0xa8673d;

export class Visor {
  constructor(cont) {
    this.cont = cont;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    cont.appendChild(r.domElement);

    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(C.fondo);
    s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;
    const sol = new THREE.DirectionalLight(0xffffff, 1.5);
    sol.position.set(-200, 500, 300); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 1500 });
    sol.target.position.set(-72, 0, Z_FRESA);
    s.add(sol, sol.target);

    this.camera = new THREE.PerspectiveCamera(30, 1, 20, 4000);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true; c.dampingFactor = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.02; c.minDistance = 45; c.maxDistance = 1600;
    c.screenSpacePanning = true;
    c.addEventListener("change", () => (this.sucio = true));

    this.pos = { x: -72.5, y: -55, z: -5 };     // posición de máquina mostrada
    this.meta = { ...this.pos };
    this.wco = { x: 0, y: 0, z: 0 };
    this._construir();
    this.vista("3d");

    new ResizeObserver(() => this._tam()).observe(cont);
    this._tam();
    this.sucio = true;
    let antes = performance.now();
    r.setAnimationLoop((t) => {
      const dt = Math.min(0.1, (t - antes) / 1000); antes = t;
      if (this._suavizar(dt)) this.sucio = true;
      const su = this._surco;
      if (su?.sucio && t - su.t > 70) { su.sucio = false; su.t = t; su.texColor.needsUpdate = su.texRelieve.needsUpdate = true; this.sucio = true; }
      if (c.update() || this.sucio) { this.sucio = false; r.render(s, this.camera); }
    });
  }

  _tam() {
    const w = this.cont.clientWidth || 1, h = this.cont.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // Si cambió cuánto hay que alejarse (visor más angosto o más ancho), se vuelve a encuadrar la vista
    if (this._vista && Math.abs(this._lejos() - (this._lejosUsado || 1)) > 0.05) this.vista(this._vista);
    this.sucio = true;
  }

  // ---------------- Modelo ----------------
  _mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...extra }); }
  _caja(w, h, d, mat, x, y, z, padre) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; padre.add(m); return m;
  }
  _cil(r, h, mat, padre, eje = "y") {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat);
    if (eje === "x") m.rotation.z = Math.PI / 2;
    if (eje === "z") m.rotation.x = Math.PI / 2;
    m.castShadow = true; padre.add(m); return m;
  }

  _construir() {
    const s = this.scene;
    const cx = -AREA.x / 2;             // centro X del recorrido = centro de la máquina
    const m = construirCubiko({ cx, zCama: Z_CAMA });
    this.zFresa = Z_FRESA;
    s.add(m.fijo);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.ShadowMaterial({ opacity: 0.14 }));
    piso.rotation.x = -Math.PI / 2; piso.position.y = m.medidas.yPiso - 0.1; piso.receiveShadow = true; s.add(piso);
    this.luz = m.luz; this.techo = m.techo; this.tapa = m.tapa; this._pantalla = m.pantalla;
    pintarPantalla(this._pantalla, { conectado: false });

    // ---- Cama: se mueve con Y ----
    const cama = (this.cama = new THREE.Group()); s.add(cama);
    cama.add(m.mesa);
    // Área alcanzable sobre la cama (lo que la fresa puede tocar)
    const pts = [v3(-AREA.x, -AREA.y, Z_CAMA), v3(0, -AREA.y, Z_CAMA), v3(0, 0, Z_CAMA), v3(-AREA.x, 0, Z_CAMA), v3(-AREA.x, -AREA.y, Z_CAMA)];
    pts.forEach((p) => (p.y += 0.2));
    const area = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: C.area, dashSize: 4, gapSize: 3 }));
    area.computeLineDistances(); cama.add(area);
    this.placa = new THREE.Group(); cama.add(this.placa);
    this.diam = 0.2;
    this.ponerMaterial({ ancho: 100, alto: 70, grosor: 1.6 });
    this.cero = new THREE.Group(); cama.add(this.cero);
    const ejeL = (dir, color) => new THREE.ArrowHelper(dir, new THREE.Vector3(), 14, color, 4, 2.4);
    this.cero.add(ejeL(new THREE.Vector3(1, 0, 0), 0xd63a2f), ejeL(new THREE.Vector3(0, 0, -1), 0x15803d), ejeL(new THREE.Vector3(0, 1, 0), 0x2563eb));
    this.trayectos = new THREE.Group(); cama.add(this.trayectos);
    this.malla = new THREE.Group(); cama.add(this.malla);

    // ---- Carro X + husillo Z ----
    this.carroX = m.carroX; s.add(this.carroX);
    this.husillo = m.husillo; this.carroX.add(this.husillo);
    // Aro de contacto (sonda)
    this.aro = new THREE.Mesh(new THREE.RingGeometry(3.5, 5, 32), new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.aro.rotation.x = -Math.PI / 2; this.aro.position.set(0, 0.3, Z_FRESA); this.aro.visible = false; this.husillo.add(this.aro);
    this._colocar();
  }

  // La pantalla del control repite el estado y la posición, como en la máquina real
  pantalla(datos) {
    const k = `${datos.conectado}|${datos.estado}|${datos.wpos ? [datos.wpos.x, datos.wpos.y, datos.wpos.z].map((v) => v.toFixed(2)).join() : ""}`;
    if (k === this._kPantalla) return;
    const t = performance.now();
    if (this._tPantalla && t - this._tPantalla < 200 && datos.estado === this._ePantalla) return;
    this._kPantalla = k; this._tPantalla = t; this._ePantalla = datos.estado;
    pintarPantalla(this._pantalla, datos);
    this.sucio = true;
  }

  // ---------------- Material ----------------
  // En coordenadas de trabajo: la esquina inferior izquierda del material es X0 Y0 (se mueve con el cero XY).
  // Volver a ponerlo deja el cobre limpio, como una placa virgen nueva.
  ponerMaterial({ ancho, alto, grosor = 1.6, base = 2 }) {
    this.placa.clear();
    const g = (this.mat = new THREE.Group()); this.placa.add(g);
    this._dim = { ancho, alto, grosor };
    this._centroPlaca = { x: ancho / 2, y: alto / 2 };
    this._o = null;
    const zc = Z_CAMA + base;   // MDF de sacrificio debajo
    const m = (w, h, d, mat, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const c = v3(ancho / 2, alto / 2, 0);
    m(ancho + 10, base, alto + 10, this._mat(C.mdf, { roughness: 0.9 }), c.x, Z_CAMA + base / 2, c.z);
    m(ancho, grosor - 0.2, alto, this._mat(C.fr4, { roughness: 0.8 }), c.x, zc + (grosor - 0.2) / 2, c.z);
    // Cobre: la cara de arriba es el lienzo del surco; el relieve también apaga el brillo metálico donde ya no hay cobre
    const s = this._surcoNuevo(ancho, alto);
    const lado = this._mat(COBRE, { metalness: 0.55, roughness: 0.5 });
    const arriba = new THREE.MeshStandardMaterial({ map: s.texColor, bumpMap: s.texRelieve, bumpScale: 10, metalnessMap: s.texRelieve, metalness: 0.55, roughness: 0.5 });
    m(ancho, 0.2, alto, [lado, lado, arriba, lado, lado, lado], c.x, zc + grosor - 0.1, c.z);
    this.zCobre = zc + grosor;
    this._diseno = null;
    if (this._dArgs) this.ponerDiseno(...this._dArgs);
    this._aplicarGiro();
    this.sucio = true;
  }

  // Rectángulo del diseño sobre el material (mm del material). Si no cabe, va en rojo y se ve lo que sale.
  ponerDiseno(r, cabe = true) {
    this._dArgs = [r, cabe];
    if (this._diseno) { this.mat.remove(this._diseno); this._diseno.traverse((o) => o.geometry?.dispose()); }
    this._diseno = null;
    if (r) {
      const y = this.zCobre + 0.3, P = (px, py) => new THREE.Vector3(px, y, -py);
      const pts = [P(r.x, r.y), P(r.x + r.ancho, r.y), P(r.x + r.ancho, r.y + r.alto), P(r.x, r.y + r.alto), P(r.x, r.y)];
      const g = (this._diseno = new THREE.Group());
      const linea = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: cabe ? 0x111317 : 0xdc2626, dashSize: 2, gapSize: 1.4 }));
      linea.computeLineDistances(); linea.renderOrder = 3; g.add(linea);
      if (!cabe) {
        const velo = new THREE.Mesh(new THREE.PlaneGeometry(r.ancho, r.alto), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
        velo.rotation.x = -Math.PI / 2; velo.position.set(r.x + r.ancho / 2, y, -(r.y + r.alto / 2)); g.add(velo);
      }
      this.mat.add(g);
    }
    this.sucio = true;
  }

  // Giro de la placa (alineación): el material se ve girado igual que se giran las trayectorias
  ponerGiro(al) { this._giro = al || null; this._aplicarGiro(); }
  _aplicarGiro() {
    if (!this.mat) return;
    const al = this._giro;
    if (!al) { this.mat.position.set(0, 0, 0); this.mat.rotation.set(0, 0, 0); }
    else {
      // p' = o + R(p − o) + d  →  traslación o + d − R·o
      const c = Math.cos(al.ang), s = Math.sin(al.ang);
      const tx = al.ox + al.dx - (c * al.ox - s * al.oy), ty = al.oy + al.dy - (s * al.ox + c * al.oy);
      this.mat.position.set(tx, 0, -ty); this.mat.rotation.set(0, al.ang, 0);
    }
    if (this._surco) this._surco.ult = null;
    this.sucio = true;
  }

  // ---------------- Surco ----------------
  // Diámetro de la herramienta puesta (lo que mide de ancho el surco)
  herramienta(d) { if (d > 0) this.diam = d; }

  _surcoNuevo(ancho, alto) {
    const viejo = this._surco;
    if (viejo) { viejo.texColor.dispose(); viejo.texRelieve.dispose(); }
    const k = Math.min(16, 2048 / Math.max(ancho, alto));       // px por mm
    const W = Math.max(2, Math.round(ancho * k)), H = Math.max(2, Math.round(alto * k));
    const lienzo = (fondo) => {
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const x = cv.getContext("2d"); x.fillStyle = fondo; x.fillRect(0, 0, W, H);
      x.lineCap = x.lineJoin = "round"; x.globalCompositeOperation = "darken";
      return { cv, x };
    };
    const col = lienzo("#a8673d"), rel = lienzo("#ffffff");
    const texColor = new THREE.CanvasTexture(col.cv); texColor.colorSpace = THREE.SRGBColorSpace; texColor.anisotropy = 8;
    const texRelieve = new THREE.CanvasTexture(rel.cv); texRelieve.anisotropy = 8;
    return (this._surco = { k, alto, col, rel, texColor, texRelieve, ult: null, sucio: false, t: 0, cortado: false });
  }
  limpiarSurcos() { if (this._dim) this.ponerMaterial(this._dim); }
  get hayCortes() { return !!this._surco?.cortado; }

  // Color y relieve del fondo del surco según qué tan hondo va. Cada vez más oscuro canal por canal,
  // para que pintar con «darken» nunca aclare un surco ya hecho (los puentes del contorno, una pasada repetida).
  _tono(p) {
    const g = this._dim.grosor;
    if (p >= g - 0.05) return ["rgb(26,24,21)", "rgb(0,0,0)"];              // atravesó: se ve la sombra del MDF
    if (p <= 0.035) return ["rgb(150,88,50)", "rgb(205,205,205)"];          // solo rayó el cobre
    const t = Math.min(1, p / g), f = (a, b) => Math.round(a + (b - a) * t);
    const r = f(150, 30);
    return [`rgb(${f(47, 30)},${f(94, 62)},${f(58, 40)})`, `rgb(${r},${r},${r})`];  // el sustrato (FR-1/FR-4)
  }

  // Puntos de la punta de la fresa en coordenadas de máquina (rastro del simulador o reportes de GRBL).
  // Donde la punta está debajo de Z0, deja surco.
  cortar(pts) {
    const s = this._surco;
    if (!s || !pts?.length) return;
    for (const p of pts) {
      const q = this._enMaterial(p);
      if (!q || q.p <= 0.005) { s.ult = null; continue; }
      this._rayar(s.ult || q, q);
      s.ult = q;
    }
  }
  _enMaterial(p) {
    const o = this._oDisp;
    if (!o || !this._anclZ) return null;
    let x = p.x - o.x, y = p.y - o.y;
    const al = this._giro;
    if (al) {
      const ux = x - al.ox - al.dx, uy = y - al.oy - al.dy, c = Math.cos(al.ang), s = Math.sin(al.ang);
      x = al.ox + ux * c + uy * s; y = al.oy - ux * s + uy * c;
    }
    return { x, y, p: o.z - p.z };
  }
  _rayar(a, b) {
    const s = this._surco, k = s.k;
    const [c, r] = this._tono(Math.max(a.p, b.p));
    const ax = a.x * k, ay = (s.alto - a.y) * k, bx = b.x * k, by = (s.alto - b.y) * k, w = Math.max(1.2, this.diam * k);
    for (const [x, est] of [[s.col.x, c], [s.rel.x, r]]) {
      x.strokeStyle = x.fillStyle = est; x.lineWidth = w;
      x.beginPath();
      if (Math.hypot(bx - ax, by - ay) < 0.3) { x.arc(bx, by, w / 2, 0, Math.PI * 2); x.fill(); }
      else { x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); }
    }
    s.sucio = s.cortado = true;
  }

  // ---------------- Estado ----------------
  // anclado.xy / anclado.z: si el cero ya se fijó. Mientras no, la placa y las trayectorias
  // se muestran en el centro del área y sobre el cobre, como vista provisional.
  ponerPosicion(mpos, wco, anclado = { xy: true, z: true }) {
    this.meta = { ...mpos };
    const c = this._centroPlaca || { x: 0, y: 0 };
    const o = {
      x: anclado.xy ? wco.x : -AREA.x / 2 - c.x,
      y: anclado.xy ? wco.y : -AREA.y / 2 - c.y,
      z: anclado.z ? wco.z : this.zCobre,
    };
    const k = `${o.x},${o.y},${o.z}`;
    if (k !== this._o) {
      this._o = k; this.wco = { ...wco };
      const v = v3(o.x, o.y, o.z);
      for (const g of [this.cero, this.trayectos, this.malla]) g.position.copy(v);
      this.placa.position.set(v.x, 0, v.z);
      if (this._surco) this._surco.ult = null;
      this.sucio = true;
    }
    this._oDisp = o; this._anclZ = anclado.z;
  }
  saltar() { this.pos = { ...this.meta }; this._colocar(); }

  _suavizar(dt) {
    const k = 1 - Math.exp(-dt * 18);
    let mov = false;
    for (const e of ["x", "y", "z"]) {
      const d = this.meta[e] - this.pos[e];
      if (Math.abs(d) > 0.002) { this.pos[e] += Math.abs(d) < 0.05 ? d : d * k; mov = true; }
    }
    if (mov) this._colocar();
    return mov;
  }

  _colocar() {
    const p = this.pos;
    this.carroX.position.x = p.x;
    this.husillo.position.y = p.z;
    // La cama: el punto (x, y) de la máquina queda bajo la fresa (three z = zFresa)
    this.cama.position.z = p.y + this.zFresa - 0;
    this.sucio = true;
  }

  contacto(on) { if (this.aro.visible !== on) { this.aro.visible = on; this.sucio = true; } }
  encendida(on) { this.luz.material.color.set(on ? C.verde : 0x4a4d52); this.sucio = true; }

  // ---------------- Trayectorias ----------------
  // capas: [{ id, segs, color }] en coordenadas de trabajo.
  // Lo que va debajo de Z0 se dibuja sobre la superficie del cobre (no enterrado en la placa):
  // la línea dice por dónde pasa la fresa; lo hondo lo muestra el surco cuando se corta.
  ponerTrayectos(capas) {
    this.trayectos.clear();
    this._capas = {};
    const zv = (z) => Math.max(z, 0) + 0.12;
    for (const capa of capas) {
      const n = capa.segs.length;
      const pos = new Float32Array(n * 6), col = new Float32Array(n * 8);
      const base = new THREE.Color(capa.color);
      capa.segs.forEach((s, i) => {
        const a = v3(s.a.x, s.a.y, zv(s.a.z)), b = v3(s.b.x, s.b.y, zv(s.b.z));
        pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 4));
      const lineas = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      lineas.renderOrder = 2;
      this.trayectos.add(lineas);
      this._capas[capa.id] = { lineas, segs: capa.segs, base };
      this.progreso(capa.id, -1);
    }
    this.sucio = true;
  }

  // Marca como hechos los segmentos hasta la línea n del programa: lo hecho se aclara para que se vea el surco
  progreso(id, n) {
    const c = this._capas?.[id]; if (!c) return;
    const col = c.lineas.geometry.attributes.color;
    const h = new THREE.Color(C.hecho), gris = new THREE.Color(C.rapido);
    for (let i = 0; i < c.segs.length; i++) {
      const s = c.segs[i];
      const hecho = s.n <= n;
      const k = s.rapido ? gris : hecho ? h : c.base;
      const a = s.rapido ? (hecho ? 0.15 : 0.55) : hecho ? 0.12 : 1;
      col.setXYZW(i * 2, k.r, k.g, k.b, a); col.setXYZW(i * 2 + 1, k.r, k.g, k.b, a);
    }
    col.needsUpdate = true; this.sucio = true;
  }

  // ---------------- Mapa de alturas ----------------
  ponerMalla(mapa, exagerar = 20) {
    this.malla.clear();
    if (!mapa) { this.sucio = true; return; }
    const g = new THREE.PlaneGeometry(mapa.ancho, mapa.alto, mapa.nx - 1, mapa.ny - 1);
    const p = g.attributes.position;
    for (let j = 0; j < mapa.ny; j++) for (let i = 0; i < mapa.nx; i++) {
      const k = (mapa.ny - 1 - j) * mapa.nx + i;
      const v = mapa.valores[j][i];
      p.setXYZ(k, mapa.x + (mapa.ancho * i) / (mapa.nx - 1), mapa.y + (mapa.alto * j) / (mapa.ny - 1), (v ?? 0) * exagerar + 0.3);
    }
    g.computeVertexNormals();
    const malla = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x2563eb, wireframe: true, transparent: true, opacity: 0.7 }));
    malla.rotation.x = -Math.PI / 2;     // (x, y, z) del plano → (x, z, −y) de three
    this.malla.add(malla);
    const puntos = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x111317, size: 4, sizeAttenuation: false }));
    puntos.rotation.x = -Math.PI / 2;
    this.malla.add(puntos);
    this.sucio = true;
  }

  // ---------------- Cámara ----------------
  // Cuánto alejar la cámara: el campo de visión es vertical, así que en un visor angosto la máquina
  // se cortaría a los lados
  _lejos() { const a = this.camera.aspect || 1.6; return a < 1.3 ? Math.min(2.4, 1.3 / a) : 1; }

  vista(v) {
    this._vista = v; this._lejosUsado = this._lejos();
    const centro = new THREE.Vector3(-AREA.x / 2, Z_CAMA + 30, Z_FRESA + 38);
    // Desde arriba el husillo tapa el trabajo: se vuelve translúcido
    this._translucido(this.carroX, v === "arriba");
    this.techo.visible = v !== "arriba";
    this.tapa.visible = v !== "arriba";
    if (v === "arriba") { this.camera.position.set(centro.x, 760, centro.z + 0.01); }
    else if (v === "frente") { this.camera.position.set(centro.x, 60, 1060); }
    else { this.camera.position.set(centro.x + 560, 470, 940); }
    this.camera.position.sub(centro).multiplyScalar(this._lejosUsado).add(centro);
    this.controls.target.copy(centro);
    this.controls.update(); this.sucio = true;
  }

  _translucido(grupo, on) {
    grupo.traverse((o) => {
      if (!o.isMesh || o === this.aro || o.material.transparent && !o.userData.propio) return;
      if (!o.userData.propio) { o.material = o.material.clone(); o.userData.propio = true; }
      o.material.transparent = on; o.material.opacity = on ? 0.18 : 1; o.material.depthWrite = !on;
      o.castShadow = !on;
    });
    this.sucio = true;
  }

  // Encuadra la cama sobre el trabajo cargado
  enfocar(caja) {
    if (!caja || !isFinite(caja.min.x)) return;
    this.sucio = true;
  }
}
