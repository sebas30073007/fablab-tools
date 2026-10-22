// visor-base.js - lo común de los gemelos 3D del Fab Lab (CNC, láser).
//
// Renderer con luz de estudio, sombra, cámara orbital, bucle que solo dibuja cuando algo cambió,
// trayectorias del G-code (una capa por trabajo, lo hecho se aclara) y la posición suavizada
// hacia la última que reportó la máquina. Cada máquina extiende la clase y define:
//   _construir()   el modelo y los grupos que se animan
//   _colocar()     mueve los grupos según this.pos (posición de máquina mostrada)
//   v3(x, y, z)    de coordenadas de máquina a three
//   vista(v)       "3d" | "arriba" | "frente"
//   _cuadro(t)     (opcional) trabajo por cuadro; devuelve true si hay que redibujar
// Unidades: mm.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export class VisorBase {
  // fondo: color de la escena · sol: {pos:[x,y,z], hacia:[x,y,z], mitad} caja de sombra
  // distancia: [mín, máx] de la cámara · pos: posición inicial de máquina
  constructor(cont, { fondo = 0xe5e7eb, sol = {}, distancia = [45, 1600], pos = { x: 0, y: 0, z: 0 }, colores = {} } = {}) {
    this.cont = cont;
    this.colores = { rapido: 0x8e939b, hecho: 0x111317, ...colores };
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    cont.appendChild(r.domElement);

    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(fondo);
    s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.55;
    const luz = (this.sol = new THREE.DirectionalLight(0xffffff, 1.5));
    luz.position.set(...(sol.pos || [-200, 500, 300])); luz.castShadow = true;
    luz.shadow.mapSize.set(2048, 2048);
    const m = sol.mitad || 300;
    Object.assign(luz.shadow.camera, { left: -m, right: m, top: m, bottom: -m, near: 10, far: 1500 + m });
    luz.target.position.set(...(sol.hacia || [0, 0, 0]));
    s.add(luz, luz.target);

    this.camera = new THREE.PerspectiveCamera(30, 1, 20, 6000);
    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true; c.dampingFactor = 0.12;
    c.maxPolarAngle = Math.PI / 2 - 0.02; c.minDistance = distancia[0]; c.maxDistance = distancia[1];
    c.screenSpacePanning = true;
    c.addEventListener("change", () => (this.sucio = true));

    this.pos = { ...pos };       // posición de máquina mostrada
    this.meta = { ...pos };      // la última que reportó la máquina
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
      if (this._cuadro(t, dt)) this.sucio = true;
      if (c.update() || this.sucio) { this.sucio = false; r.render(s, this.camera); }
    });
  }

  _construir() {}
  _colocar() {}
  _cuadro() { return false; }
  v3(x, y, z) { return new THREE.Vector3(x, z, -y); }
  vista() {}

  _tam() {
    const w = this.cont.clientWidth || 1, h = this.cont.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    // Si cambió cuánto hay que alejarse (visor más angosto o más ancho), se vuelve a encuadrar la vista
    if (this._vista && Math.abs(this._lejos() - (this._lejosUsado || 1)) > 0.05) this.vista(this._vista);
    this.sucio = true;
  }

  // Cuánto alejar la cámara: el campo de visión es vertical, así que en un visor angosto la máquina
  // se cortaría a los lados
  _lejos() { const a = this.camera.aspect || 1.6; return a < 1.3 ? Math.min(2.4, 1.3 / a) : 1; }

  // Coloca la cámara: desde = posición para un visor ancho, centro = a dónde mira
  _encuadrar(v, desde, centro) {
    this._vista = v; this._lejosUsado = this._lejos();
    this.camera.position.copy(desde).sub(centro).multiplyScalar(this._lejosUsado).add(centro);
    this.controls.target.copy(centro);
    this.controls.update(); this.sucio = true;
  }

  // ---------------- Primitivas ----------------
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

  // ---------------- Posición ----------------
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

  // ---------------- Trayectorias ----------------
  // capas: [{ id, segs, color }]; el grupo this.trayectos ya está donde va el cero de trabajo.
  // zv(z): la altura a la que se dibuja cada punto (la CNC lo sube a la superficie del cobre).
  ponerTrayectos(capas, zv = (z) => z) {
    this.trayectos.clear();
    this._capas = {};
    for (const capa of capas) {
      const n = capa.segs.length;
      const pos = new Float32Array(n * 6), col = new Float32Array(n * 8);
      const base = new THREE.Color(capa.color);
      capa.segs.forEach((s, i) => {
        const a = this.v3(s.a.x, s.a.y, zv(s.a.z)), b = this.v3(s.b.x, s.b.y, zv(s.b.z));
        pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, 4));
      const lineas = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      lineas.renderOrder = 2;
      this.trayectos.add(lineas);
      this._capas[capa.id] = { lineas, segs: capa.segs, base, color: capa.colorSeg };
      this.progreso(capa.id, -1);
    }
    this.sucio = true;
  }

  // Marca como hechos los segmentos hasta la línea n del programa: lo hecho se aclara para que se vea
  // lo que la máquina dejó (surco o quemado). Los viajes van en gris tenue.
  // capa.colorSeg(s) (opcional) da el color de cada segmento (el láser lo tiñe por potencia).
  progreso(id, n) {
    const c = this._capas?.[id]; if (!c) return;
    const col = c.lineas.geometry.attributes.color;
    const h = new THREE.Color(this.colores.hecho), gris = new THREE.Color(this.colores.rapido);
    for (let i = 0; i < c.segs.length; i++) {
      const s = c.segs[i];
      const hecho = s.n <= n;
      // En el láser, un G1 con el láser apagado también es viaje (la CNC corta con cualquier G1)
      const viaje = s.rapido || (this.apagadoEsViaje && !s.on);
      const k = viaje ? gris : hecho ? h : c.color?.(s) || c.base;
      const a = viaje ? (hecho ? 0.15 : 0.55) : hecho ? 0.12 : 1;
      col.setXYZW(i * 2, k.r, k.g, k.b, a); col.setXYZW(i * 2 + 1, k.r, k.g, k.b, a);
    }
    col.needsUpdate = true; this.sucio = true;
  }

  // ---------------- Translucidez ----------------
  // Desde arriba lo que tapa el trabajo se vuelve translúcido (excepto lo que ya lo era)
  _translucido(grupo, on, excepto = null) {
    grupo.traverse((o) => {
      if (!o.isMesh || o === excepto || o.material.transparent && !o.userData.propio) return;
      if (!o.userData.propio) { o.material = o.material.clone(); o.userData.propio = true; }
      o.material.transparent = on; o.material.opacity = on ? 0.18 : 1; o.material.depthWrite = !on;
      o.castShadow = !on;
    });
    this.sucio = true;
  }
}
