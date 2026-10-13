// gcode.js - leer G-code para la vista previa y reescribirlo para enviarlo.
//
//   leer(texto, {rapido})     → { segs, caja, tiempo, lineas }   (coordenadas de trabajo, mm)
//                               cada segmento lleva s (potencia) y on (el láser quema en ese tramo)
//   transformar(lineas, opts) → líneas nuevas con: alineación XY (2 agujeros),
//                               mapa de alturas y desplazamiento de Z (prueba en aire)
//
// Al transformar, los arcos se convierten en rectas y todo sale en G90/G21.

const RAPIDO = 2000;   // mm/min por defecto ($110 de la Cubiko); el láser pasa el suyo

function palabras(l) {
  const w = { G: [], M: [] };
  for (const [, k, v] of l.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)) {
    if (k === "G" || k === "M") w[k].push(+v); else w[k] = +v;
  }
  return w;
}

export function limpiar(l) {
  return l.replace(/\(.*?\)/g, "").replace(/;.*$/, "").trim().toUpperCase();
}

// Recorre el programa y llama a alMover(desde, hasta, {modo, f, arco}) por cada movimiento.
function recorrer(lineas, alMover, alOtra) {
  const st = { abs: true, esc: 1, modo: 0, f: 0, s: 0, laser: false, p: { x: 0, y: 0, z: 0 }, k: { x: false, y: false, z: false } };
  lineas.forEach((cruda, n) => {
    const l = limpiar(cruda);
    if (!l) { alOtra?.(cruda, n, null); return; }
    const w = palabras(l);
    let maq = false, movimiento = false;
    for (const g of w.G) {
      if (g === 90) st.abs = true; else if (g === 91) st.abs = false;
      else if (g === 20) st.esc = 25.4; else if (g === 21) st.esc = 1;
      else if (g === 53) maq = true;
      else if ([0, 1, 2, 3].includes(g)) st.modo = g;
      else if (g === 38.2 || g === 38.3 || g === 10 || g === 92 || g === 28 || g === 30 || g === 4) { alOtra?.(cruda, n, w); return; }
    }
    if (w.F !== undefined) st.f = w.F * st.esc;
    if (w.S !== undefined) st.s = w.S;
    for (const m of w.M) { if (m === 3 || m === 4) st.laser = true; else if (m === 5 || m === 2 || m === 30) st.laser = false; }
    const hayEje = ["X", "Y", "Z"].some((e) => w[e] !== undefined);
    if (!hayEje || maq) { alOtra?.(cruda, n, w); return; }
    const t = { ...st.p };
    for (const e of ["X", "Y", "Z"]) if (w[e] !== undefined) {
      const k = e.toLowerCase(), v = w[e] * st.esc;
      t[k] = st.abs ? v : st.p[k] + v;
      st.k[k] = true;
    }
    let arco = null;
    if (st.modo === 2 || st.modo === 3) {
      if (w.R !== undefined) arco = centroPorRadio(st.p, t, w.R * st.esc, st.modo === 2);
      else arco = { cx: st.p.x + (w.I ?? 0) * st.esc, cy: st.p.y + (w.J ?? 0) * st.esc, cw: st.modo === 2 };
    }
    movimiento = true;
    alMover(st.p, t, { modo: st.modo, f: st.f, arco, n, cruda, w, conocido: { ...st.k }, s: st.s, on: st.laser && st.modo !== 0 && st.s > 0 });
    st.p = t;
    void movimiento;
  });
}

function centroPorRadio(a, b, r, cw) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4));
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  let s = cw ? -1 : 1; if (r < 0) s = -s;
  return { cx: mx - (s * h * dy) / d, cy: my + (s * h * dx) / d, cw };
}

// Arco → puntos (sin el inicial)
function linealizarArco(a, b, { cx, cy, cw }, paso = 0.25) {
  const r = Math.hypot(a.x - cx, a.y - cy);
  const a0 = Math.atan2(a.y - cy, a.x - cx);
  let da = Math.atan2(b.y - cy, b.x - cx) - a0;
  if (cw && da >= 0) da -= 2 * Math.PI;
  if (!cw && da <= 0) da += 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(da) * r) / paso));
  const pts = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, ang = a0 + da * t;
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), z: a.z + (b.z - a.z) * t });
  }
  pts[pts.length - 1] = { ...b };
  return pts;
}

export function leer(texto, { rapido = RAPIDO } = {}) {
  const lineas = texto.split(/\r?\n/);
  const segs = [];
  const caja = { min: { x: Infinity, y: Infinity, z: Infinity }, max: { x: -Infinity, y: -Infinity, z: -Infinity } };
  const corteCaja = { min: { x: Infinity, y: Infinity }, max: { x: -Infinity, y: -Infinity } };
  let tiempo = 0, primero = true;
  const crecer = (p, corte) => {
    for (const k of ["x", "y", "z"]) { caja.min[k] = Math.min(caja.min[k], p[k]); caja.max[k] = Math.max(caja.max[k], p[k]); }
    if (corte) for (const k of ["x", "y"]) { corteCaja.min[k] = Math.min(corteCaja.min[k], p[k]); corteCaja.max[k] = Math.max(corteCaja.max[k], p[k]); }
  };
  recorrer(lineas, (a, b, { modo, f, arco, n, s, on }) => {
    // El primer movimiento sale de un origen desconocido: no se dibuja el viaje
    const pts = arco ? linealizarArco(a, b, arco) : [b];
    let prev = a;
    for (const p of pts) {
      const L = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      if (!primero) {
        segs.push({ a: prev, b: p, rapido: modo === 0, n, s, on });
        tiempo += L / ((modo === 0 ? rapido : f || 100) / 60);
        crecer(prev, modo !== 0);
      }
      crecer(p, modo !== 0 && !primero);
      prev = p;
    }
    primero = false;
  });
  return { segs, caja, corteCaja, tiempo, lineas };
}

// ---------------- Transformaciones ----------------
// alinear: {dx, dy, ang, ox, oy}  rota ang (rad) alrededor de (ox, oy) y traslada dx, dy
// alturas: objeto con z(x, y) (alturas.js)
// dz: suma a toda Z (prueba en aire)
export function transformar(lineas, { alinear = null, alturas = null, dz = 0, paso = 1 } = {}) {
  const sinCambio = !alinear && !alturas && !dz;
  if (sinCambio) return lineas.slice();
  const T = (p) => {
    let { x, y } = p;
    if (alinear) {
      const c = Math.cos(alinear.ang), s = Math.sin(alinear.ang);
      const rx = x - alinear.ox, ry = y - alinear.oy;
      x = alinear.ox + rx * c - ry * s + alinear.dx;
      y = alinear.oy + rx * s + ry * c + alinear.dy;
    }
    let z = p.z + dz;
    if (alturas) z += alturas.z(x, y);
    return { x, y, z };
  };
  const f3 = (v) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4).replace(/\.?0+$/, "");
  const out = ["G90", "G21"];
  let fActual = null, primero = true;
  recorrer(lineas, (a, b, { modo, f, arco, conocido }) => {
    // Ejes que el programa aún no ha mencionado: no se inventan (la máquina se queda donde está)
    const xy = conocido.x && conocido.y;
    let pts = arco ? linealizarArco(a, b, arco) : [b];
    // Con mapa de alturas, los cortes se parten en tramos cortos para seguir la superficie
    if (alturas && modo !== 0 && !primero) {
      const fino = []; let prev = a;
      for (const p of pts) {
        const L = Math.hypot(p.x - prev.x, p.y - prev.y);
        const n = Math.max(1, Math.ceil(L / paso));
        for (let i = 1; i <= n; i++) fino.push({ x: prev.x + ((p.x - prev.x) * i) / n, y: prev.y + ((p.y - prev.y) * i) / n, z: prev.z + ((p.z - prev.z) * i) / n });
        prev = p;
      }
      pts = fino;
    }
    for (const p of pts) {
      const q = xy ? T(p) : { ...p, z: p.z + dz };
      let l = `${modo === 0 ? "G0" : "G1"}`;
      if (xy || conocido.x) l += ` X${f3(q.x)}`;
      if (xy || conocido.y) l += ` Y${f3(q.y)}`;
      if (conocido.z) l += ` Z${f3(q.z)}`;
      if (modo !== 0 && f !== fActual) { l += ` F${f3(f)}`; fActual = f; }
      out.push(l);
    }
    primero = false;
  }, (cruda, n, w) => {
    const l = limpiar(cruda);
    if (!l) return;
    // G90/G91/G20/G21 ya quedaron resueltos en coordenadas absolutas en mm
    if (w && w.G.length && w.G.every((g) => [90, 91, 20, 21].includes(g)) && !["X", "Y", "Z", "F", "S"].some((e) => w[e] !== undefined) && !w.M.length) return;
    out.push(l.replace(/G9[01]|G2[01]/g, "").trim() || l);
  });
  return out.filter(Boolean);
}

// Alineación con dos puntos: diseño (a1, a2) → medidos en la máquina (b1, b2), en coordenadas de trabajo.
export function alineacion(a1, a2, b1, b2) {
  const angA = Math.atan2(a2.y - a1.y, a2.x - a1.x);
  const angB = Math.atan2(b2.y - b1.y, b2.x - b1.x);
  const ang = angB - angA;
  const escala = Math.hypot(b2.x - b1.x, b2.y - b1.y) / Math.hypot(a2.x - a1.x, a2.y - a1.y);
  return { ox: a1.x, oy: a1.y, ang, dx: b1.x - a1.x, dy: b1.y - a1.y, escala };
}

// Tiempo estimado acumulado: acum[i] = segundos hasta antes de la línea i (acum[n] = total).
// Sirve para el progreso y el «quedan» de un trabajo en curso: las líneas no duran lo mismo.
export function tiempoAcumulado(lineas, { rapido = RAPIDO } = {}) {
  const porLinea = new Float64Array(lineas.length);
  let primero = true;
  recorrer(lineas, (a, b, { modo, f, arco, n }) => {
    const pts = arco ? linealizarArco(a, b, arco) : [b];
    let prev = a;
    for (const p of pts) {
      if (!primero) porLinea[n] += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) / ((modo === 0 ? rapido : f || 100) / 60);
      prev = p;
    }
    primero = false;
  });
  const acum = new Float64Array(lineas.length + 1);
  for (let i = 0; i < lineas.length; i++) acum[i + 1] = acum[i] + porLinea[i];
  return acum;
}

export function formatoTiempo(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h} h ${m} min` : m >= 10 ? `${m} min` : m ? `${m} min ${ss} s` : `${ss} s`;
}
