// contacto.js - contacto de las manos con la escena, sin motor de física.
//
// Cada malla visible se aproxima con la caja de su geometría (en su propio marco) o, si es un cilindro,
// con su cilindro. Con eso se mide cuánto entra un punto en algo (distancia con signo, mm): manos.js lo
// usa para que los dedos se abran en vez de atravesar y para que los que agarran se cierren hasta tocar,
// y la prueba de los clips para medir lo que todavía se atraviesa.

import * as THREE from "three";

export class Obstaculos {
  // raices: grupos donde buscar mallas. omitir(malla): true para no tomarla en cuenta.
  constructor(raices, { omitir } = {}) {
    this.lista = [];
    for (const r of raices) r.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.sinColision || omitir?.(o)) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingSphere) g.computeBoundingSphere();
      const p = g.parameters || {};
      const cil = g.type === "CylinderGeometry" ? { r: Math.max(p.radiusTop, p.radiusBottom), h: p.height } : null;
      this.lista.push({ malla: o, cil, bb: g.boundingBox, bs: g.boundingSphere, rt: new Float64Array(9), activo: false });
    });
  }

  // Lee la posición de cada malla (llamar después de mover la escena y de updateMatrixWorld)
  actualizar() {
    for (const e of this.lista) {
      e.activo = visible(e.malla);
      if (!e.activo) continue;
      const m = e.malla.matrixWorld.elements;
      const s = [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])];
      // Rotación transpuesta (filas = ejes locales unitarios) y traslación
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) e.rt[i * 3 + j] = m[i * 4 + j] / (s[i] || 1);
      e.tx = m[12]; e.ty = m[13]; e.tz = m[14];
      const b = e.bb;
      // En el marco girado (sin escala) la caja mide su tamaño por la escala
      e.cx = ((b.min.x + b.max.x) / 2) * s[0]; e.cy = ((b.min.y + b.max.y) / 2) * s[1]; e.cz = ((b.min.z + b.max.z) / 2) * s[2];
      e.hx = Math.max(((b.max.x - b.min.x) / 2) * s[0], 0.5); e.hy = Math.max(((b.max.y - b.min.y) / 2) * s[1], 0.5); e.hz = Math.max(((b.max.z - b.min.z) / 2) * s[2], 0.5);
      if (e.cil) { e.r = e.cil.r * Math.max(s[0], s[2]); e.hh = (e.cil.h / 2) * s[1]; }
      const c = e.bs.center;
      e.sx = m[0] * c.x + m[4] * c.y + m[8] * c.z + m[12];
      e.sy = m[1] * c.x + m[5] * c.y + m[9] * c.z + m[13];
      e.sz = m[2] * c.x + m[6] * c.y + m[10] * c.z + m[14];
      e.sr = e.bs.radius * Math.max(s[0], s[1], s[2]);
    }
  }

  // Las entradas activas cuya esfera toca la esfera (x, y, z, r)
  cerca(x, y, z, r) {
    const out = [];
    for (const e of this.lista) if (e.activo && Math.hypot(e.sx - x, e.sy - y, e.sz - z) < e.sr + r) out.push(e);
    return out;
  }

  // Distancia con signo de un punto a una entrada (negativa = adentro)
  static sdf(e, x, y, z) {
    const dx = x - e.tx, dy = y - e.ty, dz = z - e.tz, R = e.rt;
    const lx = R[0] * dx + R[1] * dy + R[2] * dz - e.cx;
    const ly = R[3] * dx + R[4] * dy + R[5] * dz - e.cy;
    const lz = R[6] * dx + R[7] * dy + R[8] * dz - e.cz;
    if (e.cil) {
      const rr = Math.hypot(lx, lz) - e.r, yy = Math.abs(ly) - e.hh;
      return Math.hypot(Math.max(rr, 0), Math.max(yy, 0)) + Math.min(Math.max(rr, yy), 0);
    }
    const qx = Math.abs(lx) - e.hx, qy = Math.abs(ly) - e.hy, qz = Math.abs(lz) - e.hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
  }

  // Cuánto entran los puntos (Float32Array x,y,z…) en las entradas dadas: { pen ≥ 0, entrada }.
  // corte: si algo entra más que eso, devuelve en cuanto lo ve (para búsquedas de sí/no).
  static penetracion(pts, lista, corte = Infinity) {
    let pen = 0, cual = null;
    for (const e of lista) for (let i = 0; i < pts.length; i += 3) {
      const d = -Obstaculos.sdf(e, pts[i], pts[i + 1], pts[i + 2]);
      if (d > pen) { pen = d; cual = e; if (pen > corte) return { pen, entrada: cual }; }
    }
    return { pen, entrada: cual };
  }
}

function visible(o) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}
