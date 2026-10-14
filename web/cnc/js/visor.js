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
import { VisorBase } from "../../shared/js/visor-base.js";
import { construirCubiko, pintarPantalla, Z_FRESA } from "./cubiko.js";

export const AREA = { x: 145, y: 110, z: 40 };
const Z_CAMA = -40;          // Z de máquina de la superficie del MDF de sacrificio (punta de la fresa en su punto más bajo)
const C = {
  fondo: 0xe5e7eb, carcasa: 0x1a1d22, carcasa2: 0x2a2d33, aluminio: 0xc9ccd1, acero: 0xb7bcc4,
  mdf: 0xc8a27a, cobre: 0xd28b53, fr4: 0x2f5e3a, acrilico: 0x9aa3ad, verde: 0x3ddc84,
  rapido: 0x8e939b, hecho: 0x111317, cero: 0x111317, area: 0x6b6f76,
};
// Color por trabajo (contenido, capa 3): el mismo en el panel y en el 3D
export const COLOR_TRABAJO = { pistas: 0x2563eb, hoyos: 0x00bfa6, contorno: 0x7c3aed, grabado: 0xb45309, vaciado: 0x4d7c0f, archivo: 0x2563eb };
// Cómo se ve cada material: cuerpo, cara de arriba (lienzo del surco), brillo y el tono del fondo del surco
// de poco a muy hondo. El cobre conserva la capa metálica y el sustrato verde de siempre.
export const ACABADO = {
  cobre:    { cuerpo: 0x2f5e3a, cara: "#a8673d", lado: 0xa8673d, metal: 0.55, aspereza: 0.5, hondo: [[47, 94, 58], [30, 62, 40]] },
  acrilico: { cuerpo: 0xd5e3ea, cara: "#dde9ef", lado: 0xc9dbe4, metal: 0, aspereza: 0.18, hondo: [[188, 204, 214], [128, 146, 158]] },
  mdf:      { cuerpo: 0xa97c52, cara: "#b8895c", lado: 0xa97c52, metal: 0, aspereza: 0.92, hondo: [[150, 110, 72], [96, 66, 40]] },
  madera:   { cuerpo: 0xcfa36c, cara: "#d8b07a", lado: 0xc89a62, metal: 0, aspereza: 0.85, hondo: [[176, 128, 80], [110, 76, 44]] },
  otro:     { cuerpo: 0x9aa3ad, cara: "#b8bec6", lado: 0x9aa3ad, metal: 0.1, aspereza: 0.6, hondo: [[140, 148, 156], [90, 96, 104]] },
};

const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);   // máquina → three

export class Visor extends VisorBase {
  constructor(cont) {
    super(cont, {
      fondo: C.fondo, colores: { rapido: C.rapido, hecho: C.hecho },
      sol: { pos: [-200, 500, 300], hacia: [-72, 0, Z_FRESA], mitad: 300 },
      distancia: [45, 1600], pos: { x: -72.5, y: -55, z: -5 },
    });
    this.controls.addEventListener("change", () => this._acotar());
  }

  // El surco se sube a la textura cada 70 ms como mucho
  _cuadro(t) {
    const su = this._surco;
    if (su?.sucio && t - su.t > 70) { su.sucio = false; su.t = t; su.texColor.needsUpdate = su.texRelieve.needsUpdate = true; return true; }
    return false;
  }

  _construir() {
    const s = this.scene;
    const cx = -AREA.x / 2;             // centro X del recorrido = centro de la máquina
    const m = construirCubiko({ cx, zCama: Z_CAMA });
    this.zFresa = Z_FRESA;
    s.add(m.fijo);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), new THREE.ShadowMaterial({ opacity: 0.14 }));
    piso.rotation.x = -Math.PI / 2; piso.position.y = m.medidas.yPiso - 0.1; piso.receiveShadow = true; s.add(piso);
    this.luz = m.luz; this.techo = m.techo; this.tapa = m.tapa; this._pantalla = m.pantalla; this._fijo = m.fijo;
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
  ponerMaterial({ ancho, alto, grosor = 1.6, base = 2, tipo = "cobre" }) {
    this.placa.clear();
    const g = (this.mat = new THREE.Group()); this.placa.add(g);
    this._dim = { ancho, alto, grosor, tipo };
    const A = ACABADO[tipo] || ACABADO.cobre;
    this._centroPlaca = { x: ancho / 2, y: alto / 2 };
    this._o = null;
    const zc = Z_CAMA + base;   // MDF de sacrificio debajo
    const m = (w, h, d, mat, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const c = v3(ancho / 2, alto / 2, 0);
    m(ancho + 10, base, alto + 10, this._mat(C.mdf, { roughness: 0.9 }), c.x, Z_CAMA + base / 2, c.z);
    m(ancho, grosor - 0.2, alto, this._mat(A.cuerpo, { roughness: 0.8 }), c.x, zc + (grosor - 0.2) / 2, c.z);
    // La cara de arriba es el lienzo del surco; en el cobre el relieve también apaga el brillo metálico donde ya no hay cobre
    const s = this._surcoNuevo(ancho, alto, A.cara);
    const lado = this._mat(A.lado, { metalness: A.metal, roughness: A.aspereza });
    const arriba = new THREE.MeshStandardMaterial({ map: s.texColor, bumpMap: s.texRelieve, bumpScale: 10, metalnessMap: A.metal ? s.texRelieve : null, metalness: A.metal, roughness: A.aspereza });
    m(ancho, 0.2, alto, [lado, lado, arriba, lado, lado, lado], c.x, zc + grosor - 0.1, c.z);
    this.zCobre = zc + grosor;
    this._diseno = null;
    if (this._dArgs) this.ponerDiseno(...this._dArgs);
    this._aplicarGiro();
    this._reenfocar();
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

  _surcoNuevo(ancho, alto, cara = "#a8673d") {
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
    const col = lienzo(cara), rel = lienzo("#ffffff");
    const texColor = new THREE.CanvasTexture(col.cv); texColor.colorSpace = THREE.SRGBColorSpace; texColor.anisotropy = 8;
    const texRelieve = new THREE.CanvasTexture(rel.cv); texRelieve.anisotropy = 8;
    return (this._surco = { k, alto, col, rel, texColor, texRelieve, ult: null, sucio: false, t: 0, cortado: false });
  }
  limpiarSurcos() { if (this._dim) this.ponerMaterial(this._dim); }
  get hayCortes() { return !!this._surco?.cortado; }

  // Color y relieve del fondo del surco según qué tan hondo va. Cada vez más oscuro canal por canal,
  // para que pintar con «darken» nunca aclare un surco ya hecho (los puentes del contorno, una pasada repetida).
  _tono(p) {
    const g = this._dim.grosor, cobre = (this._dim.tipo || "cobre") === "cobre";
    if (p >= g - 0.05) return ["rgb(26,24,21)", "rgb(0,0,0)"];              // atravesó: se ve la sombra del MDF
    if (cobre && p <= 0.035) return ["rgb(150,88,50)", "rgb(205,205,205)"]; // solo rayó el cobre
    const t = Math.min(1, p / g), f = (a, b) => Math.round(a + (b - a) * t);
    const r = f(150, 30), [h0, h1] = (ACABADO[this._dim.tipo] || ACABADO.cobre).hondo;
    return [`rgb(${f(h0[0], h1[0])},${f(h0[1], h1[1])},${f(h0[2], h1[2])})`, `rgb(${r},${r},${r})`];  // el sustrato o el material
  }

  // Puntos de la punta de la fresa en coordenadas de máquina (rastro del simulador o reportes de GRBL).
  // Donde la punta está debajo de la superficie, deja surco. superficie(x, y) → Z de máquina de la cara del
  // material (la pone la app: simulación o mapa de alturas); sin ella, la cara está en Z0.
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
    // Profundidad bajo la superficie real (mapa de alturas o simulación) si se conoce; si no, bajo Z0
    const sup = this.superficie?.(p.x, p.y);
    return { x, y, p: (sup ?? o.z) - p.z };
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
      this._reenfocar();
      this.sucio = true;
    }
    this._oDisp = o; this._anclZ = anclado.z;
  }
  _colocar() {
    const p = this.pos;
    this.carroX.position.x = p.x;
    this.husillo.position.y = p.z;
    // La cama: el punto (x, y) de la máquina queda bajo la fresa (three z = zFresa)
    this.cama.position.z = p.y + this.zFresa - 0;
    // En Arriba y Frente la cámara viaja con la cama: el trabajo se queda quieto en pantalla y lo
    // que se ve moverse es la fresa sobre él
    const dz = this.cama.position.z - (this._camaZ ?? this.cama.position.z);
    this._camaZ = this.cama.position.z;
    if (dz && this._foco) {
      this.camera.position.z += dz; this.controls.target.z += dz;
      this._foco.limite.min.z += dz; this._foco.limite.max.z += dz;
    }
    this.sucio = true;
  }

  contacto(on) { if (this.aro.visible !== on) { this.aro.visible = on; this.sucio = true; } }
  encendida(on) { this.luz.material.color.set(on ? C.verde : 0x4a4d52); this.sucio = true; }

  // ---------------- Trayectorias ----------------
  // capas: [{ id, segs, color }] en coordenadas de trabajo.
  // Lo que va debajo de Z0 se dibuja sobre la superficie del cobre (no enterrado en la placa):
  // la línea dice por dónde pasa la fresa; lo hondo lo muestra el surco cuando se corta.
  ponerTrayectos(capas) { super.ponerTrayectos(capas, (z) => Math.max(z, 0) + 0.12); this._reenfocar(); }

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
  // 3D: la máquina completa y órbita libre, como siempre.
  // Arriba y Frente: miran al trabajo cargado (o, si no hay, al material), con la máquina despejada
  // (solo quedan la base, la cama con lo que lleva y la fresa) y el movimiento acotado a esa zona.
  vista(v) {
    const foco = v === "arriba" || v === "frente";
    this._limpio(foco);
    const c = this.controls;
    if (!foco) {
      this._foco = null;
      Object.assign(c, { enableRotate: true, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity,
        minPolarAngle: 0, maxPolarAngle: Math.PI / 2 - 0.02, minDistance: 45, maxDistance: 1600 });
      const centro = new THREE.Vector3(-AREA.x / 2, Z_CAMA + 30, Z_FRESA + 38);
      this._encuadrar(v, new THREE.Vector3(centro.x + 560, 470, 940), centro);
      return;
    }
    // Caja del trabajo en el mundo; sin trabajo, la del material
    this.scene.updateMatrixWorld(true);
    const caja = new THREE.Box3();
    if (this.trayectos.children.length) caja.setFromObject(this.trayectos);
    if (caja.isEmpty()) caja.setFromObject(this.mat);
    const centro = caja.getCenter(new THREE.Vector3()), tam = caja.getSize(new THREE.Vector3());
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)), a = this.camera.aspect || 1.6;
    // Distancia para que quepa con aire: ancho contra el campo horizontal, fondo (o alto) contra el vertical
    const ELEV = THREE.MathUtils.degToRad(20);             // Frente: un poco desde arriba para ver la placa
    const alto = v === "arriba" ? tam.z : tam.z * Math.sin(ELEV) + Math.max(tam.y, 6);
    const d = Math.max(20, (Math.max(tam.x / a, alto) / 2 / t) * 1.25);
    const desde = v === "arriba"
      ? new THREE.Vector3(centro.x, centro.y + d, centro.z + 0.01)
      : new THREE.Vector3(centro.x, centro.y + d * Math.sin(ELEV), centro.z + d * Math.cos(ELEV));
    // Movimiento acotado: acercarse hasta ver detalle, alejarse poco, desplazarse solo sobre la zona,
    // Arriba sin girar y Frente girando unos grados
    const margen = Math.max(tam.x, tam.z) * 0.2 + 5;
    this._foco = { limite: caja.clone().expandByVector(new THREE.Vector3(margen, 0, margen)) };
    Object.assign(c, {
      minDistance: Math.max(12, d * 0.2), maxDistance: d * 1.6,
      enableRotate: v === "frente",
      minAzimuthAngle: v === "frente" ? -0.4 : -Infinity, maxAzimuthAngle: v === "frente" ? 0.4 : Infinity,
      minPolarAngle: v === "frente" ? THREE.MathUtils.degToRad(45) : 0,
      maxPolarAngle: v === "frente" ? THREE.MathUtils.degToRad(84) : Math.PI / 2 - 0.02,
    });
    this._vista = v; this._lejosUsado = this._lejos();
    this.camera.position.copy(desde);
    c.target.copy(centro);
    c.update(); this.sucio = true;
  }

  // Deja solo la base, la cama y la fresa (on) o todo (off). El aro de contacto lo maneja contacto().
  _limpio(on) {
    for (const o of this._fijo.children) if (!o.userData.base) o.visible = !on;
    for (const o of this.carroX.children) if (o !== this.husillo) o.visible = !on;
    for (const o of this.husillo.children) if (!o.userData.fresa && o !== this.aro) o.visible = !on;
    this.sucio = true;
  }

  // Si cambia el trabajo, el material o dónde está el cero, Arriba y Frente se vuelven a encuadrar
  _reenfocar() {
    if (!this._foco || this._reenfoque) return;
    this._reenfoque = requestAnimationFrame(() => { this._reenfoque = 0; if (this._foco) this.vista(this._vista); });
  }

  // Al cambiar el tamaño del visor, Arriba y Frente se encuadran de nuevo (dependen de la proporción)
  _tam() {
    super._tam();
    if (this._foco) this._reenfocar();
  }

  // Desplazarse en Arriba y Frente: el punto al que se mira no sale de la zona del trabajo
  _acotar() {
    const f = this._foco; if (!f) return;
    const c = this.controls.target, q = c.clone().clamp(f.limite.min, f.limite.max);
    if (q.equals(c)) return;
    const d = q.sub(c);
    c.add(d); this.camera.position.add(d);
  }

  // Encuadra la cama sobre el trabajo cargado
  enfocar(caja) {
    if (!caja || !isFinite(caja.min.x)) return;
    this.sucio = true;
  }
}
