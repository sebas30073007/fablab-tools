// visor.js - el 3D del Visor: muestra la malla y las ayudas de edición.
//
// La malla viene en mm con Z arriba; three usa Y arriba, así que va dentro de `modelo`, un grupo
// girado −90° en X. Todo lo que se mide o se elige se devuelve en coordenadas de la malla.
//   ponerMalla(m, {encuadrar})   geometría con color o textura
//   modo("color"|"solido"|"malla"|"rayos")
//   mascara(Uint8Array|null)     triángulos en rojo (islas, selección)
//   lineas(lazos|null)           lazos de vértices (bordes de huecos) en naranja
//   recorte({min,max}|null) · plano({n,d}|null)   vista previa con planos de corte
//   rebanadas(lista|null, eje)   contornos de los cortes para láser o CNC
//   medir(on, alMedir) · elegirCara(alElegir) · vp() · captura()

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const AZUL = 0x2563eb, NARANJA = 0xea580c, ROJO = 0xe11d48, COBRE = 0xff6b35;

export class Visor3D {
  constructor(cont) {
    this.cont = cont;
    const r = (this.r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    cont.prepend(r.domElement);
    const s = (this.escena = new THREE.Scene());
    s.background = new THREE.Color(0xe9ebee);
    s.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    s.environmentIntensity = 0.8;
    this.sol = new THREE.DirectionalLight(0xffffff, 1.4); this.sol.castShadow = true; this.sol.shadow.mapSize.set(2048, 2048); this.sol.shadow.bias = -0.0005;
    s.add(this.sol, this.sol.target);
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.5, 20000);
    const c = (this.ctl = new OrbitControls(this.cam, r.domElement));
    c.enableDamping = true; c.dampingFactor = 0.12; c.screenSpacePanning = true;
    c.addEventListener("change", () => (this.sucio = true));
    this.modelo = new THREE.Group(); this.modelo.rotation.x = -Math.PI / 2; s.add(this.modelo);
    this.ayudas = new THREE.Group(); this.modelo.add(this.ayudas);
    this.piso = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.12 }));
    this.piso.rotation.x = -Math.PI / 2; this.piso.receiveShadow = true; s.add(this.piso);
    this.rejilla = null;
    this._modo = "color";
    this.mat = {};
    new ResizeObserver(() => this._tam()).observe(cont); this._tam();
    r.setAnimationLoop(() => { if (this.ctl.update() || this.sucio) { this.sucio = false; r.render(s, this.cam); } });
    r.domElement.addEventListener("pointerdown", (e) => this._abajo(e));
    r.domElement.addEventListener("pointerup", (e) => this._arriba(e));
  }

  _tam() {
    const w = this.cont.clientWidth || 1, h = this.cont.clientHeight || 1;
    this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.sucio = true;
  }

  // ---------------- La malla ----------------
  async ponerMalla(m, { encuadrar = false } = {}) {
    this.m = m;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(m.pos, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeVertexNormals();
    if (m.col) g.setAttribute("color", new THREE.BufferAttribute(m.col, 4, true));
    if (m.uv) g.setAttribute("uv", new THREE.BufferAttribute(m.uv, 2));
    g.computeBoundingBox(); g.computeBoundingSphere();
    // Textura: solo se vuelve a cargar si cambió la imagen
    if (m.textura && m.textura.datos !== this._texDatos && m.textura.datos.length !== this._texLargo) {
      const bmp = await createImageBitmap(new Blob([m.textura.datos], { type: m.textura.tipo }));
      const lienzo = document.createElement("canvas"); lienzo.width = bmp.width; lienzo.height = bmp.height;
      lienzo.getContext("2d").drawImage(bmp, 0, 0);
      this.textura?.dispose();
      this.textura = new THREE.CanvasTexture(lienzo); this.textura.colorSpace = THREE.SRGBColorSpace; this.textura.anisotropy = 8;
      this._texLargo = m.textura.datos.length;
    }
    if (!m.textura) { this.textura?.dispose(); this.textura = null; this._texLargo = 0; }
    if (this.malla) { this.modelo.remove(this.malla); this.malla.geometry.dispose(); }
    this.malla = new THREE.Mesh(g, this._material()); this.malla.castShadow = true; this.malla.receiveShadow = true;
    this.modelo.add(this.malla);
    this._seccion?.geometry?.dispose();
    if (this._seccion) { this.modelo.remove(this._seccion); this._seccion = null; }
    this.mascara(null); this.lineas(null);
    // Se vuelve a encuadrar si se pide o si el modelo se movió o cambió mucho (girar, deshacer, recortar
    // casi todo); con ediciones chicas la cámara se queda donde estaba
    const b = g.boundingBox, c = b.getCenter(new THREE.Vector3()), d = b.getSize(new THREE.Vector3()).length();
    const d0 = this._tam3?.length() || 0;
    if (encuadrar || !this._centro || c.distanceTo(this._centro) > 0.25 * d0 || Math.abs(d - d0) > 0.3 * d0) this._colocar();
    this._recortes();
    this.sucio = true;
  }
  tieneColor() { return !!(this.m?.col || (this.m?.uv && this.textura)); }

  _material() {
    const m = this.m, modo = this._modo;
    const base = { roughness: 0.75, metalness: 0, side: this._planos?.length ? THREE.FrontSide : THREE.DoubleSide, clippingPlanes: this._planos || [] };
    let mat;
    if (modo === "rayos") mat = new THREE.MeshStandardMaterial({ ...base, color: 0x9aa3ad, transparent: true, opacity: 0.28, depthWrite: false });
    else if (modo === "malla") mat = new THREE.MeshBasicMaterial({ color: 0x3b4250, wireframe: true, clippingPlanes: base.clippingPlanes });
    else if (modo === "color" && m?.uv && this.textura) mat = new THREE.MeshStandardMaterial({ ...base, map: this.textura });
    else if (modo === "color" && m?.col) mat = new THREE.MeshStandardMaterial({ ...base, vertexColors: true });
    else mat = new THREE.MeshStandardMaterial({ ...base, color: 0xb9bec6, roughness: 0.6 });
    return mat;
  }
  modo(modo) {
    this._modo = modo;
    if (this.malla) { this.malla.material.dispose(); this.malla.material = this._material(); }
    this.sucio = true;
  }

  // Encuadre: el modelo centrado sobre la rejilla, apoyado en su punto más bajo
  _colocar() {
    const b = this.malla.geometry.boundingBox;
    const c = b.getCenter(new THREE.Vector3()), t = b.getSize(new THREE.Vector3());
    this._centro = c.clone(); this._base = b.min.z; this._tam3 = t.clone();
    this.modelo.position.set(-c.x, -b.min.z, c.y);
    const lado = Math.max(t.x, t.y, t.z) || 10;
    // Rejilla con paso redondo (1, 5, 10, 50, 100 mm) según el tamaño
    if (this.rejilla) { this.escena.remove(this.rejilla); this.rejilla.geometry.dispose(); }
    const paso = [1, 2, 5, 10, 20, 50, 100, 200, 500].find((p) => lado / p <= 30) || 1000;
    const n = Math.ceil((lado * 1.6) / paso);
    this.rejilla = new THREE.GridHelper(n * paso, n, 0xb3b9c2, 0xd3d7dd);
    this.rejilla.position.y = 0.01; this.escena.add(this.rejilla);
    this.pasoRejilla = paso;
    this.piso.scale.set(lado * 6, lado * 6, 1);
    this.sol.position.set(-lado * 1.2, lado * 2.5, lado * 1.5); this.sol.target.position.set(0, 0, 0);
    Object.assign(this.sol.shadow.camera, { left: -lado, right: lado, top: lado, bottom: -lado, near: 1, far: lado * 8 });
    this.sol.shadow.camera.updateProjectionMatrix();
    this.ctl.minDistance = lado * 0.05; this.ctl.maxDistance = lado * 12;
    this.cam.near = lado / 200; this.cam.far = lado * 40; this.cam.updateProjectionMatrix();
    this.vista("3d");
  }
  // Vistas: 3d, frente, lado, arriba, abajo (en la convención de la malla: frente mira hacia −Y)
  vista(v = "3d") {
    if (!this._tam3) return;
    const t = this._tam3, lado = Math.max(t.x, t.y, t.z), alto = t.z / 2;
    const d = lado * 2.4 * (this.cam.aspect < 1 ? 1.4 / this.cam.aspect : 1);
    const dir = { "3d": [0.9, 0.65, 1.1], frente: [0, 0.05, 1], lado: [1, 0.05, 0], arriba: [0, 1, 0.001], atras: [0, 0.05, -1] }[v] || [0.9, 0.65, 1.1];
    const o = new THREE.Vector3(0, alto, 0);
    this.cam.position.copy(o).add(new THREE.Vector3(...dir).normalize().multiplyScalar(d));
    this.ctl.target.copy(o); this.ctl.update(); this.sucio = true;
  }

  // ---------------- Ayudas ----------------
  mascara(mask) {
    if (this._masc) { this.ayudas.remove(this._masc); this._masc.geometry.dispose(); this._masc = null; }
    if (mask && this.m) {
      let n = 0; for (let t = 0; t < mask.length; t++) n += mask[t];
      if (n) {
        const idx = new Uint32Array(n * 3); let k = 0;
        for (let t = 0; t < mask.length; t++) if (mask[t]) { idx[k++] = this.m.idx[t * 3]; idx[k++] = this.m.idx[t * 3 + 1]; idx[k++] = this.m.idx[t * 3 + 2]; }
        const g = new THREE.BufferGeometry(); g.setAttribute("position", this.malla.geometry.attributes.position); g.setIndex(new THREE.BufferAttribute(idx, 1));
        this._masc = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ROJO, transparent: true, opacity: 0.75, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, depthTest: true }));
        this.ayudas.add(this._masc);
      }
    }
    this.sucio = true;
  }
  lineas(lazos, color = NARANJA) {
    if (this._lin) { this.ayudas.remove(this._lin); this._lin.geometry.dispose(); this._lin = null; }
    if (lazos?.length && this.m) {
      const p = this.m.pos, v = [];
      for (const l of lazos) for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; v.push(p[a * 3], p[a * 3 + 1], p[a * 3 + 2], p[b * 3], p[b * 3 + 1], p[b * 3 + 2]); }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      this._lin = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      this._lin.renderOrder = 5; this.ayudas.add(this._lin);
    }
    this.sucio = true;
  }
  // Contornos de las rebanadas (cortes para láser) sobre el modelo
  rebanadas(lista, eje = 2) {
    if (this._reb) { this.ayudas.remove(this._reb); this._reb.geometry.dispose(); this._reb = null; }
    if (lista?.length) {
      const v = [];
      for (const r of lista) for (const l of r.lazos) for (let i = 0; i < l.length; i++) {
        const [a1, b1] = l[i], [a2, b2] = l[(i + 1) % l.length], h = r.altura;
        const P = (a, b) => (eje === 2 ? [a, b, h] : eje === 1 ? [a, h, b] : [h, a, b]);
        v.push(...P(a1, b1), ...P(a2, b2));
      }
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
      this._reb = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COBRE, depthTest: false, transparent: true }));
      this._reb.renderOrder = 6; this.ayudas.add(this._reb);
    }
    this.sucio = true;
  }

  // Vista previa de recortes: planos de corte del material (en coordenadas de la malla)
  recorte(c) { this._caja = c; this._plano = null; this._recortes(); }
  plano(p) { this._plano = p; this._caja = null; this._recortes(); }
  _recortes() {
    if (!this.malla) return;
    const M = this.modelo.matrixWorld; this.modelo.updateMatrixWorld(true);
    const planos = [];
    const agregar = (n, d) => {
      // n·x ≤ d en la malla → plano de three que deja visible lo de dentro
      const pl = new THREE.Plane(new THREE.Vector3(-n[0], -n[1], -n[2]), d);
      planos.push(pl.applyMatrix4(M));
    };
    if (this._caja) {
      const { min, max } = this._caja;
      agregar([1, 0, 0], max[0]); agregar([-1, 0, 0], -min[0]); agregar([0, 1, 0], max[1]); agregar([0, -1, 0], -min[1]); agregar([0, 0, 1], max[2]); agregar([0, 0, -1], -min[2]);
    }
    if (this._plano) agregar(this._plano.n, this._plano.d);
    this._planos = planos;
    // Con corte, las caras de atrás no se pintan: por el hueco se ve la sección en cobre
    const mat = this.malla.material, lado = planos.length && this._modo !== "rayos" ? THREE.FrontSide : THREE.DoubleSide;
    if ((mat.clippingPlanes?.length || 0) !== planos.length || mat.side !== lado) { mat.side = lado; mat.needsUpdate = true; }
    mat.clippingPlanes = planos;
    // Por dentro del corte se ve la sección en cobre (como la cara que quedaría al tapar)
    if (planos.length && !this._seccion) {
      this._seccion = new THREE.Mesh(this.malla.geometry, new THREE.MeshBasicMaterial({ color: COBRE, side: THREE.BackSide, clippingPlanes: planos }));
      this.modelo.add(this._seccion);
    } else if (this._seccion) {
      if (planos.length) {
        if (this._seccion.material.clippingPlanes.length !== planos.length) this._seccion.material.needsUpdate = true;
        this._seccion.material.clippingPlanes = planos; this._seccion.geometry = this.malla.geometry;
      }
      else { this.modelo.remove(this._seccion); this._seccion = null; }
    }
    // Caja de recorte dibujada
    if (this._cajaH) { this.ayudas.remove(this._cajaH); this._cajaH = null; }
    if (this._caja) {
      const b = new THREE.Box3(new THREE.Vector3(...this._caja.min), new THREE.Vector3(...this._caja.max));
      this._cajaH = new THREE.Box3Helper(b, AZUL); this.ayudas.add(this._cajaH);
    }
    if (this._planoH) { this.ayudas.remove(this._planoH); this._planoH.geometry.dispose(); this._planoH = null; }
    if (this._plano && this._tam3) {
      const lado = Math.max(this._tam3.x, this._tam3.y, this._tam3.z) * 1.3;
      const n = new THREE.Vector3(...this._plano.n);
      const g = new THREE.PlaneGeometry(lado, lado);
      this._planoH = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: AZUL, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
      this._planoH.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      this._planoH.position.copy(this._centro).projectOnPlane(n).addScaledVector(n, this._plano.d);
      this.ayudas.add(this._planoH);
    }
    this.sucio = true;
  }

  // ---------------- Tocar el modelo ----------------
  _abajo(e) { this._toque = { x: e.clientX, y: e.clientY }; }
  _arriba(e) {
    if (!this._toque || Math.hypot(e.clientX - this._toque.x, e.clientY - this._toque.y) > 5) return;   // fue un giro de cámara
    const hit = this._rayo(e); if (!hit) return;
    if (this._alElegir) { const f = this._alElegir; this._alElegir = null; f(hit); return; }
    if (this._alMedir) this._punto(hit);
  }
  _rayo(e) {
    if (!this.malla) return null;
    const r = this.r.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.cam);
    const h = ray.intersectObject(this.malla, false).find((x) => !this._planos?.length || this._planos.every((p) => p.distanceToPoint(x.point) >= 0));
    if (!h) return null;
    const inv = this.modelo.matrixWorld.clone().invert();
    const p = h.point.clone().applyMatrix4(inv);
    // Normal de la cara en la malla
    const a = h.face.a, b = h.face.b, c = h.face.c, P = this.m.pos;
    const v = (i) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const n = v(b).sub(v(a)).cross(v(c).sub(v(a))).normalize();
    return { punto: [p.x, p.y, p.z], normal: [n.x, n.y, n.z], cara: h.faceIndex };
  }
  elegirCara(f) { this._alElegir = f; }
  medir(on, alMedir) {
    this._alMedir = on ? alMedir : null; this._puntos = [];
    this.marcas(null);
  }
  _punto(hit) {
    this._puntos = this._puntos.length >= 2 ? [hit.punto] : [...this._puntos, hit.punto];
    this.marcas(this._puntos);
    if (this._puntos.length === 2) { const [a, b] = this._puntos; this._alMedir({ a, b, d: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) }); }
    else this._alMedir({ a: this._puntos[0] });
  }
  marcas(pts) {
    if (this._marcas) { this.ayudas.remove(this._marcas); this._marcas = null; }
    if (pts?.length) {
      const g = new THREE.Group(), lado = Math.max(this._tam3.x, this._tam3.y, this._tam3.z);
      const esf = new THREE.SphereGeometry(lado * 0.008, 16, 12), mat = new THREE.MeshBasicMaterial({ color: AZUL, depthTest: false });
      for (const p of pts) { const s = new THREE.Mesh(esf, mat); s.position.set(...p); s.renderOrder = 7; g.add(s); }
      if (pts.length === 2) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: AZUL, depthTest: false })); l.renderOrder = 7; g.add(l); }
      this._marcas = g; this.ayudas.add(g);
    }
    this.sucio = true;
  }

  // Para la selección con lazo: matriz vista-proyección en coordenadas de la malla y el ojo
  vp() {
    this.modelo.updateMatrixWorld(true); this.cam.updateMatrixWorld(true);
    const m = new THREE.Matrix4().multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse).multiply(this.modelo.matrixWorld);
    const ojo = this.cam.position.clone().applyMatrix4(this.modelo.matrixWorld.clone().invert());
    return { vp: Array.from(m.elements), ojo: [ojo.x, ojo.y, ojo.z] };
  }
  orbitar(on) { this.ctl.enabled = on; }

  async captura() {
    this.r.render(this.escena, this.cam);
    return await new Promise((ok) => this.r.domElement.toBlob(ok, "image/png"));
  }
}
