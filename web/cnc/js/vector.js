// vector.js - de un dibujo (DXF o SVG) a lo que entiende la CNC: piezas, huecos, líneas y vaciados.
//
// Los lectores (dxf.js, svg.js) entregan trazos en mm con Y hacia arriba:
//   { pts: [[x, y], …], cerrado, capa, circulo?: { x, y, d } }
// Aquí se quitan los duplicados, se unen los segmentos sueltos en lazos y cada trazo toma su
// operación por el nombre de su capa (sin pantallas nuevas: la capa del CAD decide):
//   grabado  /grab|engrav|marc|etch|text|rotul/   la fresa en V sigue la línea, poco profundo
//   vaciado  /vac|bolsa|pocket|cajea|rebaj/       se vacía el interior hasta una profundidad
//   linea    /linea|línea|centr|on.?line|kerf/    corte pasante sobre la línea, sin compensar
//   ignorar  /constr|ayuda|refer|defpoints|cota|dim|hidden|oculta/
//   el resto: lazo cerrado → contorno (las piezas se cortan por fuera y los huecos por dentro,
//             según cuántos lazos lo rodean, no según el sentido en que se dibujó);
//             línea abierta → grabado (una línea abierta no encierra ninguna pieza)

const TOL = 0.05;          // mm: dos extremos más cerca que esto son el mismo punto
const TOL_CIERRE = 0.3;    // mm: un lazo que casi cierra se cierra (exportaciones con huecos mínimos)

export function operacionDe(capa) {
  const c = String(capa || "").toLowerCase();
  if (/constr|ayuda|refer|defpoints|cota|dim|hidden|oculta/.test(c)) return "ignorar";
  if (/grab|engrav|marc|etch|text|rotul/.test(c)) return "grabado";
  if (/vac|bolsa|pocket|cajea|rebaj/.test(c)) return "vaciado";
  if (/linea|línea|centr|on.?line|kerf/.test(c)) return "linea";
  return "auto";
}

const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

export function areaFirmada(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
export function dentro([x, y], pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function largo(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

// Cuántos lazos rodean a cada uno: par = pieza (se corta por fuera), impar = hueco (por dentro)
export function niveles(lazos) {
  const cajas = lazos.map(cajaDe);
  return lazos.map((l, i) => {
    const p = l[0];
    let n = 0;
    lazos.forEach((o, j) => {
      if (j === i) return;
      const c = cajas[j];
      if (p[0] < c.x0 || p[0] > c.x1 || p[1] < c.y0 || p[1] > c.y1) return;
      if (dentro(p, o)) n++;
    });
    return n;
  });
}

export function cajaDe(pts, c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) {
  for (const [x, y] of pts) { if (x < c.x0) c.x0 = x; if (y < c.y0) c.y0 = y; if (x > c.x1) c.x1 = x; if (y > c.y1) c.y1 = y; }
  return c;
}

// El mismo trazo dibujado dos veces (pasa seguido en DXF) se anularía al rellenar por par/impar
function sinDuplicados(trazos) {
  const vistos = new Set(), res = [];
  const q = ([x, y]) => `${Math.round(x / TOL)},${Math.round(y / TOL)}`;
  for (const t of trazos) {
    if (t.pts.length < 2) continue;
    const ida = t.pts.map(q);
    const k1 = ida.join(";"), k2 = ida.slice().reverse().join(";");
    // un lazo es el mismo aunque empiece en otro vértice: se compara por su conjunto de vértices
    const k3 = t.cerrado ? `L${t.pts.length}:` + ida.slice(0, -1).sort().join(";") : null;
    if (vistos.has(k1) || vistos.has(k2) || (k3 && vistos.has(k3))) continue;
    vistos.add(k1); if (k3) vistos.add(k3);
    res.push(t);
  }
  return res;
}

// Segmentos sueltos → cadenas. Une por el extremo más cercano dentro de TOL (rejilla para no comparar todos con todos).
function unir(trazos, avisos) {
  const lazos = [], abiertos = [];
  const sueltos = [];
  for (const t of trazos) {
    const pts = t.pts;
    if (t.cerrado || (pts.length > 2 && d2(pts[0], pts[pts.length - 1]) <= TOL * TOL)) {
      const l = pts.slice(); if (d2(l[0], l[l.length - 1]) > 1e-12) l.push(l[0]); else l[l.length - 1] = l[0];
      if (l.length > 3) lazos.push({ pts: l, circulo: t.circulo });
    } else sueltos.push(pts);
  }
  const celda = TOL * 2, rejilla = new Map();
  const llave = (p) => `${Math.floor(p[0] / celda)},${Math.floor(p[1] / celda)}`;
  const meter = (p, i, fin) => { const k = llave(p); if (!rejilla.has(k)) rejilla.set(k, []); rejilla.get(k).push([i, fin]); };
  sueltos.forEach((s, i) => { meter(s[0], i, 0); meter(s[s.length - 1], i, 1); });
  const usado = new Uint8Array(sueltos.length);
  const buscar = (p) => {
    const cx = Math.floor(p[0] / celda), cy = Math.floor(p[1] / celda);
    let mejor = null, dm = TOL * TOL;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const [i, fin] of rejilla.get(`${cx + dx},${cy + dy}`) || []) {
        if (usado[i]) continue;
        const s = sueltos[i], q = fin ? s[s.length - 1] : s[0], d = d2(p, q);
        if (d <= dm) { dm = d; mejor = [i, fin]; }
      }
    }
    return mejor;
  };
  for (let i = 0; i < sueltos.length; i++) {
    if (usado[i]) continue;
    usado[i] = 1;
    let cad = sueltos[i].slice();
    for (let lado = 0; lado < 2; lado++) {
      for (;;) {
        const m = buscar(cad[cad.length - 1]);
        if (!m) break;
        usado[m[0]] = 1;
        const s = m[1] ? sueltos[m[0]].slice().reverse() : sueltos[m[0]];
        cad = cad.concat(s.slice(1));
      }
      cad.reverse();
    }
    const hueco = Math.sqrt(d2(cad[0], cad[cad.length - 1]));
    if (cad.length > 2 && hueco <= TOL_CIERRE) {
      if (hueco > TOL) avisos.push(`Un lazo no cerraba por ${hueco.toFixed(2)} mm: se cerró`);
      cad[cad.length - 1] = cad[0];
      if (hueco > 1e-9) cad.push(cad[0]);
      lazos.push({ pts: cad });
    } else abiertos.push(cad);
  }
  return { lazos, abiertos };
}

// Trazos de uno o varios archivos → el diseño por operación, en mm del dibujo
export function diseno(trazos, avisos = []) {
  const grupos = { auto: [], grabado: [], vaciado: [], linea: [] };
  const ignoradas = new Set();
  for (const t of sinDuplicados(trazos)) {
    const op = operacionDe(t.capa);
    if (op === "ignorar") { ignoradas.add(t.capa); continue; }
    grupos[op].push(t);
  }
  if (ignoradas.size) avisos.push(`No se usa la capa ${[...ignoradas].join(", ")}`);
  const auto = unir(grupos.auto, avisos), grab = unir(grupos.grabado, avisos), vac = unir(grupos.vaciado, avisos), lin = unir(grupos.linea, avisos);
  if (auto.abiertos.length) avisos.push(auto.abiertos.length === 1 ? "1 línea abierta va a Grabado: no encierra ninguna pieza" : `${auto.abiertos.length} líneas abiertas van a Grabado: no encierran ninguna pieza`);
  if (vac.abiertos.length) avisos.push(`${vac.abiertos.length} ${vac.abiertos.length === 1 ? "línea abierta" : "líneas abiertas"} de vaciado no cierran y no se vacían`);
  const d = {
    contorno: auto.lazos.map((l) => l.pts),
    circulos: auto.lazos.filter((l) => l.circulo).map((l) => l.circulo),
    grabado: [...grab.lazos.map((l) => ({ pts: l.pts, cerrado: true })), ...grab.abiertos.map((p) => ({ pts: p, cerrado: false })), ...auto.abiertos.map((p) => ({ pts: p, cerrado: false }))],
    vaciado: vac.lazos.map((l) => l.pts),
    linea: [...lin.lazos.map((l) => ({ pts: l.pts, cerrado: true })), ...lin.abiertos.map((p) => ({ pts: p, cerrado: false }))],
    avisos,
  };
  const c = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const l of [...d.contorno, ...d.vaciado]) cajaDe(l, c);
  for (const t of [...d.grabado, ...d.linea]) cajaDe(t.pts, c);
  d.caja = isFinite(c.x0) ? c : null;
  return d;
}
