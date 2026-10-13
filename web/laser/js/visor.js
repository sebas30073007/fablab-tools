// visor.js - gemelo 3D de la xTool S1.
//
// El modelo está en s1-modelo.js (primitivas a partir de la ficha oficial y de los renders; no hay CAD
// público). La S1 es de pórtico: la viga se mueve en Y, el módulo en X sobre la viga y sube o baja en Z.
//
// Marco: máquina (x, y, z) → three (x, z, y). El origen de trabajo (atrás a la izquierda) está en
// (0, yCama, 0); Y de máquina crece hacia el frente, igual que Z de three. Todo lo que va sobre la
// cama (material, quemado, trayectorias, diseño) se dibuja en ese marco.
//
// Quemado: la cara de arriba del material es un lienzo; donde pasa el láser encendido se oscurece
// según la potencia (marcado: café claro; corte: negro).

import * as THREE from "three";
import { VisorBase } from "../../shared/js/visor-base.js";
import { construirS1, AREA } from "./s1-modelo.js";

export { AREA };
// Color por operación (contenido, capa 3): el mismo en el panel y en el 3D
export const COLOR_OP = { grabado: 0x0f766e, marcado: 0x2563eb, corte: 0x7c3aed, archivo: 0x2563eb };

export class Visor extends VisorBase {
  constructor(cont) {
    super(cont, {
      fondo: 0xe5e7eb,
      sol: { pos: [-150, 900, 500], hacia: [249, 0, 160], mitad: 600 },
      distancia: [120, 3200], pos: { x: AREA.x / 2, y: AREA.y / 2, z: 0 },
    });
    this.apagadoEsViaje = true;
  }

  v3(x, y, z) { return new THREE.Vector3(x, z, y); }

  _construir() {
    const m = (this.modelo = construirS1());
    const s = this.scene;
    s.add(m.fijo, m.porticoY);
    this.yCama = m.medidas.yCama;
    this.centro = m.medidas.centro.clone();
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.ShadowMaterial({ opacity: 0.14 }));
    piso.rotation.x = -Math.PI / 2; piso.position.y = (m.medidas.yPiso ?? 0) - 0.1; piso.receiveShadow = true; s.add(piso);

    // Lo que va sobre la cama, en el marco de la máquina
    const cama = (this.cama = new THREE.Group()); cama.position.set(0, this.yCama, 0); s.add(cama);
    const P = (x, y) => new THREE.Vector3(x, 0.3, y);
    const area = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P(0, 0), P(AREA.x, 0), P(AREA.x, AREA.y), P(0, AREA.y), P(0, 0)]),
      new THREE.LineDashedMaterial({ color: 0x6b6f76, dashSize: 6, gapSize: 4 }));
    area.computeLineDistances(); cama.add(area);
    this.placa = new THREE.Group(); cama.add(this.placa);
    this.trayectos = new THREE.Group(); cama.add(this.trayectos);
    this.marcoDiseno = new THREE.Group(); cama.add(this.marcoDiseno);
    this.grosor = 0;

    // Rayo y punto: hijos del carro X, desde la boquilla hasta la superficie
    m.porticoY.position.z = 0; m.carroX.position.x = 0; m.modZ.position.y = 0;
    m.porticoY.updateMatrixWorld(true);
    const foco = m.carroX.worldToLocal(m.boquilla.getWorldPosition(new THREE.Vector3()));
    this._foco = foco;
    const brillo = new THREE.MeshBasicMaterial({ color: 0x8fb4ff, toneMapped: false, transparent: true, opacity: 0.85 });
    this.rayo = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 8), brillo);
    this.punto = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 0.95 }));
    this.punto.rotation.x = -Math.PI / 2;
    this.rayo.visible = this.punto.visible = false;
    m.carroX.add(this.rayo, this.punto);
    this.ponerMaterial(null);
    this._colocar();
  }

  // ---------------- Material ----------------
  // { ancho, alto, grosor, x, y, tono } en mm de la máquina (x, y: esquina de atrás a la izquierda).
  // Volver a ponerlo deja la superficie limpia.
  ponerMaterial(M) {
    this.placa.clear();
    if (this._q) { this._q.tex.dispose(); this._q = null; }
    this._M = M;
    this.grosor = M ? M.grosor : 0;
    this.trayectos.position.y = this.grosor + 0.15;
    this.marcoDiseno.position.y = this.grosor + 0.25;
    if (M) {
      const k = Math.min(6, 2048 / Math.max(M.ancho, M.alto));        // px por mm
      const W = Math.max(2, Math.round(M.ancho * k)), H = Math.max(2, Math.round(M.alto * k));
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const x = cv.getContext("2d"); x.fillStyle = M.tono || "#D9B98B"; x.fillRect(0, 0, W, H);
      x.lineCap = x.lineJoin = "round"; x.globalCompositeOperation = "darken";
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      this._q = { k, x, tex, ult: null, sucio: false, t: 0, quemado: false };
      const lado = this._mat(new THREE.Color(M.tono || "#D9B98B").multiplyScalar(0.8), { roughness: 0.85 });
      const arriba = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
      const caja = new THREE.Mesh(new THREE.BoxGeometry(M.ancho, M.grosor, M.alto), [lado, lado, arriba, lado, lado, lado]);
      caja.position.set(M.x + M.ancho / 2, M.grosor / 2, M.y + M.alto / 2);
      caja.castShadow = caja.receiveShadow = true;
      this.placa.add(caja);
    }
    this._colocar();
    this.sucio = true;
  }
  limpiarQuemado() { if (this._M) this.ponerMaterial(this._M); }
  get hayQuemado() { return !!this._q?.quemado; }

  // Puntos {x, y, s, on} en mm de la máquina: donde el láser va encendido se quema la superficie
  quemar(pts, sMax = 1000) {
    const q = this._q, M = this._M;
    if (!q || !pts?.length) return;
    for (const p of pts) {
      if (!p.on || !(p.s > 0)) { q.ult = null; continue; }
      const a = q.ult || p;
      const f = Math.min(1, p.s / sMax);
      // De café claro (marcado suave) a negro (corte)
      const c = (v0, v1) => Math.round(v0 + (v1 - v0) * Math.pow(f, 0.6));
      q.x.strokeStyle = q.x.fillStyle = `rgb(${c(150, 18)},${c(105, 14)},${c(62, 10)})`;
      q.x.lineWidth = Math.max(1, 0.2 * q.k);
      const ax = (a.x - M.x) * q.k, ay = (a.y - M.y) * q.k, bx = (p.x - M.x) * q.k, by = (p.y - M.y) * q.k;
      q.x.beginPath(); q.x.moveTo(ax, ay); q.x.lineTo(bx, by); q.x.stroke();
      q.ult = p; q.sucio = q.quemado = true;
    }
  }

  _cuadro(t) {
    const q = this._q;
    if (q?.sucio && t - q.t > 70) { q.sucio = false; q.t = t; q.tex.needsUpdate = true; return true; }
    return false;
  }

  // Rectángulo del diseño en la cama; en rojo si se sale del área
  ponerDiseno(r, cabe = true) {
    this.marcoDiseno.clear();
    if (r) {
      const P = (x, y) => new THREE.Vector3(x, 0, y);
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([P(r.x, r.y), P(r.x + r.ancho, r.y), P(r.x + r.ancho, r.y + r.alto), P(r.x, r.y + r.alto), P(r.x, r.y)]),
        new THREE.LineDashedMaterial({ color: cabe ? 0x111317 : 0xdc2626, dashSize: 4, gapSize: 3 }));
      l.computeLineDistances(); l.renderOrder = 3; this.marcoDiseno.add(l);
    }
    this.sucio = true;
  }

  // ---------------- Máquina ----------------
  ponerPosicion(pos) { this.meta = { ...pos }; }

  _colocar() {
    const m = this.modelo, p = this.pos;
    if (!m) return;
    m.carroX.position.x = p.x;
    m.porticoY.position.z = p.y;
    // El módulo se enfoca sobre el material (la S1 mide la altura y sube lo que haga falta)
    m.modZ.position.y = this.grosor + Math.max(0, p.z || 0);
    if (this.rayo) {
      const yTop = this._foco.y + m.modZ.position.y, yBase = this._foco.y + this.grosor;
      this.rayo.scale.y = Math.max(0.1, yTop - yBase + 10);
      this.rayo.position.set(this._foco.x, (yTop + 10 + yBase) / 2, this._foco.z);
      this.punto.position.set(this._foco.x, yBase + 0.3, this._foco.z);
    }
    this.sucio = true;
  }

  // Láser encendido: rayo y punto, más brillantes con más potencia
  laser(on, f = 1) {
    if (this.rayo.visible === on && this._f === f) return;
    this.rayo.visible = this.punto.visible = on; this._f = f;
    this.rayo.material.opacity = 0.35 + 0.6 * f;
    this.punto.scale.setScalar(0.6 + 0.6 * f);
    this.sucio = true;
  }
  cruz(on) { if (this.modelo.cruz.visible !== on) { this.modelo.cruz.visible = on; this.sucio = true; } }
  tapa(fraccion) { this.modelo.tapa.userData.abrir?.(fraccion); this.sucio = true; }
  // Anillo del botón: apagado, lista, trabajando, alarma
  luz(estado) {
    const c = { off: 0x2a2d33, on: 0xf5f7fa, run: 0x3b82f6, pausa: 0xf59e0b, alarma: 0xdc2626, fin: 0x22c55e }[estado] ?? 0x2a2d33;
    if (this._luz === c) return;
    this._luz = c;
    this.modelo.luz.material.emissive.setHex(c);
    this.modelo.luz.material.emissiveIntensity = estado === "off" ? 0.1 : 1.4;
    this.sucio = true;
  }

  // Trayectorias: lo que quema en su color, más intenso con más potencia; los viajes tenues
  ponerTrayectos(capas) { super.ponerTrayectos(capas, () => 0); }

  // ---------------- Cámara ----------------
  vista(v) {
    const c = this.centro;
    const m = this.modelo;
    m.tapa.visible = v !== "arriba";
    // Desde arriba también estorba la parte opaca del techo (atrás de la bisagra): todo lo del gabinete
    // que queda arriba del módulo se oculta
    if (!this._techo) {
      this._techo = [];
      m.fijo.updateMatrixWorld(true);
      const caja = new THREE.Box3();
      m.fijo.traverse((o) => { if (o.isMesh && !m.tapa.getObjectById(o.id) && caja.setFromObject(o).min.y > this.yCama + 110) this._techo.push(o); });
    }
    this._techo.forEach((o) => (o.visible = v !== "arriba"));
    this._translucido(m.porticoY, v === "arriba", this.rayo);
    const desde = v === "arriba" ? new THREE.Vector3(c.x, 1500, c.z + 0.01)
      : v === "frente" ? new THREE.Vector3(c.x, 260, c.z + 1750)
      : new THREE.Vector3(c.x + 700, 900, c.z + 1250);
    this._encuadrar(v, desde, c.clone().setY(c.y + 20));
  }
}
