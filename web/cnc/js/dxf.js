// dxf.js - leer un DXF en texto (AutoCAD, Fusion, Inkscape, LibreCAD, SolidWorks…) a trazos en mm.
//
//   leerDXF(texto) → { trazos: [{ pts, cerrado, capa, circulo? }], avisos: [] }
//
// Geometría: LINE, LWPOLYLINE y POLYLINE (con arcos por «bulge»), ARC, CIRCLE, ELLIPSE, SPLINE
// (NURBS por de Boor, o por sus puntos de ajuste) e INSERT de bloques (anidados, con escala, giro,
// espejo y arreglos). Unidades por $INSUNITS. Se saltan el espacio papel, las capas apagadas o
// congeladas y lo que no es geometría de corte (textos, cotas, rellenos HATCH: su borde repetiría
// el contorno y se anularía).
// Los arcos se cortan en segmentos con un error de cuerda de 0.01 mm.

const ERR = 0.01;
const UNIDADES = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 13: 0.001, 14: 100 };
const NO_CORTE = new Set(["TEXT", "MTEXT", "ATTRIB", "ATTDEF", "DIMENSION", "LEADER", "MLEADER", "MULTILEADER", "TOLERANCE"]);

// Matriz afín [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f
const I = [1, 0, 0, 1, 0, 0];
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const ap = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const tras = (x, y) => [1, 0, 0, 1, x, y];
const giro = (a) => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const esc = (sx, sy) => [sx, 0, 0, sy, 0, 0];
const ESPEJO_X = [-1, 0, 0, 1, 0, 0];   // OCS con extrusión (0, 0, −1): el eje X local apunta a −X

// Pasos para un arco de radio r y barrido |a| con error de cuerda ERR
function pasos(r, a) {
  const r_ = Math.max(Math.abs(r), ERR * 2);
  const da = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - ERR / r_)));
  return Math.min(720, Math.max(2, Math.ceil(Math.abs(a) / (da || 0.1))));
}
function arco(cx, cy, r, a0, barrido, incluirInicio = true) {
  const n = pasos(r, barrido), pts = [];
  for (let k = incluirInicio ? 0 : 1; k <= n; k++) { const a = a0 + (barrido * k) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}
// Tramo con bulge b de p a q (b = tan(θ/4), positivo = antihorario)
function tramoBulge(p, q, b) {
  if (!b || Math.abs(b) < 1e-9) return [q];
  const th = 4 * Math.atan(b), dx = q[0] - p[0], dy = q[1] - p[1], c = Math.hypot(dx, dy);
  if (c < 1e-12) return [q];
  const r = c / (2 * Math.sin(th / 2)), al = Math.atan2(dy, dx) + Math.PI / 2 - th / 2;
  const cx = p[0] + r * Math.cos(al), cy = p[1] + r * Math.sin(al);
  const a0 = Math.atan2(p[1] - cy, p[0] - cx);
  const pts = arco(cx, cy, Math.abs(r), a0, th, false);
  pts[pts.length - 1] = q;
  return pts;
}

// NURBS por de Boor en coordenadas homogéneas
function nurbs(p, U, P, W, n) {
  const m = U.length, a = U[p], b = U[m - p - 1], res = [];
  for (let s = 0; s <= n; s++) {
    const u = a + ((b - a) * s) / n;
    let k = p;
    while (k < m - p - 2 && u >= U[k + 1]) k++;
    const d = [];
    for (let j = 0; j <= p; j++) { const i = j + k - p, w = W[i] ?? 1; d.push([P[i][0] * w, P[i][1] * w, w]); }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = j + k - p, den = U[i + p - r + 1] - U[i];
        const al = den > 1e-12 ? (u - U[i]) / den : 0;
        d[j] = [(1 - al) * d[j - 1][0] + al * d[j][0], (1 - al) * d[j - 1][1] + al * d[j][1], (1 - al) * d[j - 1][2] + al * d[j][2]];
      }
    }
    const w = d[p][2] || 1;
    res.push([d[p][0] / w, d[p][1] / w]);
  }
  return res;
}

export function leerDXF(texto) {
  const avisos = [], trazos = [];
  if (/^AutoCAD Binary DXF/.test(texto.slice(0, 22))) return { trazos, avisos: ["DXF binario: guárdalo como DXF de texto (ASCII)"] };
  const L = texto.split(/\r\n|\r|\n/);
  // Pares código/valor → entidades (cada «0» abre una)
  const ents = [];
  let cur = null;
  for (let i = 0; i + 1 < L.length; i += 2) {
    const c = parseInt(L[i], 10), v = L[i + 1].trim();
    if (Number.isNaN(c)) continue;
    if (c === 0) { cur = { tipo: v.toUpperCase(), d: [] }; ents.push(cur); } else if (cur) cur.d.push([c, v]);
  }
  const header = {}, capas = {}, bloques = {}, modelo = [];
  let seccion = null, bloque = null, poli = null, conAtributos = false;
  for (const e of ents) {
    if (e.tipo === "SECTION") {
      seccion = (e.d.find(([c]) => c === 2)?.[1] || "").toUpperCase();
      if (seccion === "HEADER") { let k = null; for (const [c, v] of e.d) { if (c === 9) k = v; else if (k && c !== 2 && !(k in header)) header[k] = v; } }
      continue;
    }
    if (e.tipo === "ENDSEC") { seccion = null; continue; }
    if (e.tipo === "EOF") break;
    if (seccion === "TABLES") {
      if (e.tipo === "LAYER") { const nom = g(e, 2, ""), col = +g(e, 62, 7), fl = +g(e, 70, 0); capas[nom.toUpperCase()] = { apagada: col < 0, congelada: (fl & 1) === 1 }; }
      continue;
    }
    if (seccion === "BLOCKS") {
      if (e.tipo === "BLOCK") { bloque = { nombre: g(e, 2, ""), base: [+g(e, 10, 0), +g(e, 20, 0)], ents: [] }; bloques[bloque.nombre.toUpperCase()] = bloque; continue; }
      if (e.tipo === "ENDBLK") { bloque = null; continue; }
    }
    if (seccion !== "BLOCKS" && seccion !== "ENTITIES") continue;
    const lista = seccion === "BLOCKS" ? bloque?.ents : modelo;
    if (!lista) continue;
    // POLYLINE + VERTEX… + SEQEND (y los ATTRIB de un INSERT) son una sola cosa
    if (e.tipo === "VERTEX") { poli?.vertices.push(e); continue; }
    if (e.tipo === "SEQEND") { poli = null; conAtributos = false; continue; }
    if (e.tipo === "ATTRIB" && conAtributos) continue;
    if (e.tipo === "POLYLINE") { e.vertices = []; poli = e; }
    if (e.tipo === "INSERT") conAtributos = +g(e, 66, 0) === 1;
    lista.push(e);
  }

  const u = +(header.$INSUNITS ?? 0);
  const k = UNIDADES[u];
  if (!k) avisos.push("El archivo no dice sus unidades: se leyó en milímetros");
  const raiz = esc(k || 1, k || 1);
  const ignorados = {};

  const visible = (e, capa) => {
    if (+g(e, 67, 0) === 1 || +g(e, 60, 0) === 1) return false;
    const c = capas[String(capa).toUpperCase()];
    if (String(capa).toUpperCase() === "DEFPOINTS") return false;
    return !(c && (c.apagada || c.congelada));
  };
  const empujar = (M, pts, cerrado, capa, circulo) => {
    if (pts.length < 2) return;
    const t = { pts: pts.map((p) => ap(M, p)), cerrado, capa };
    if (circulo) {
      const sx = Math.hypot(M[0], M[1]), sy = Math.hypot(M[2], M[3]);
      if (Math.abs(sx - sy) < 1e-6 * Math.max(1, sx)) { const [x, y] = ap(M, [circulo.x, circulo.y]); t.circulo = { x, y, d: circulo.d * sx }; }
    }
    trazos.push(t);
  };

  function convertir(e, M, capaPadre, nivel) {
    let capa = g(e, 8, "0");
    if (capa === "0" && capaPadre) capa = capaPadre;    // lo dibujado en la capa 0 de un bloque toma la capa del INSERT
    if (!visible(e, capa)) return;
    const ocs = +g(e, 230, 1) < 0 ? mul(M, ESPEJO_X) : M;
    const x = +g(e, 10, 0), y = +g(e, 20, 0);
    switch (e.tipo) {
      case "LINE": empujar(M, [[x, y], [+g(e, 11, 0), +g(e, 21, 0)]], false, capa); break;
      case "CIRCLE": {
        const r = +g(e, 40, 0); if (r <= 0) break;
        const pts = arco(x, y, r, 0, 2 * Math.PI); pts[pts.length - 1] = pts[0];
        empujar(ocs, pts, true, capa, { x, y, d: 2 * r });
        break;
      }
      case "ARC": {
        const r = +g(e, 40, 0); if (r <= 0) break;
        const a0 = (+g(e, 50, 0) * Math.PI) / 180;
        let a1 = (+g(e, 51, 360) * Math.PI) / 180;
        while (a1 <= a0) a1 += 2 * Math.PI;
        empujar(ocs, arco(x, y, r, a0, a1 - a0), false, capa);
        break;
      }
      case "ELLIPSE": {
        const ax = +g(e, 11, 1), ay = +g(e, 21, 0), ra = +g(e, 40, 1), nz = +g(e, 230, 1) < 0 ? -1 : 1;
        const bx = -ay * ra * nz, by = ax * ra * nz;
        const t0 = +g(e, 41, 0);
        let t1 = +g(e, 42, 2 * Math.PI);
        while (t1 <= t0) t1 += 2 * Math.PI;
        const n = pasos(Math.hypot(ax, ay), t1 - t0), pts = [];
        for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; pts.push([x + ax * Math.cos(t) + bx * Math.sin(t), y + ay * Math.cos(t) + by * Math.sin(t)]); }
        const cerrada = Math.abs(t1 - t0 - 2 * Math.PI) < 1e-6;
        if (cerrada) pts[pts.length - 1] = pts[0];
        empujar(M, pts, cerrada, capa);
        break;
      }
      case "LWPOLYLINE": {
        const vs = [];
        for (const [c, v] of e.d) { if (c === 10) vs.push({ p: [+v, 0], b: 0 }); else if (c === 20 && vs.length) vs[vs.length - 1].p[1] = +v; else if (c === 42 && vs.length) vs[vs.length - 1].b = +v; }
        empujarPoli(ocs, vs, (+g(e, 70, 0) & 1) === 1, capa);
        break;
      }
      case "POLYLINE": {
        const fl = +g(e, 70, 0);
        if (fl & (16 | 64)) { ignorados.MALLA = (ignorados.MALLA || 0) + 1; break; }
        const vs = (e.vertices || []).filter((v) => !(+g(v, 70, 0) & 16)).map((v) => ({ p: [+g(v, 10, 0), +g(v, 20, 0)], b: +g(v, 42, 0) }));
        empujarPoli(fl & 8 ? M : ocs, vs, (fl & 1) === 1, capa);
        break;
      }
      case "SPLINE": {
        const p = +g(e, 71, 3), U = todos(e, 40), W = todos(e, 41);
        const xs = todos(e, 10), ys = todos(e, 20), fx = todos(e, 11), fy = todos(e, 21);
        const P = xs.map((v, i) => [v, ys[i] ?? 0]);
        let pts;
        if (P.length > p && U.length === P.length + p + 1) pts = nurbs(p, U, P, W, Math.min(2000, Math.max(24, P.length * 12)));
        else if (fx.length > 1) pts = fx.map((v, i) => [v, fy[i] ?? 0]);
        else if (P.length > 1) pts = P;
        else break;
        const cerrada = (+g(e, 70, 0) & 1) === 1 || (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6);
        if (cerrada && pts.length > 2) pts[pts.length - 1] = pts[0];
        empujar(M, pts, cerrada, capa);
        break;
      }
      case "INSERT": {
        const b = bloques[g(e, 2, "").toUpperCase()];
        if (!b || nivel > 8) break;
        const sx = +g(e, 41, 1), sy = +g(e, 42, 1), rot = (+g(e, 50, 0) * Math.PI) / 180;
        const nc = Math.max(1, +g(e, 70, 1)), nf = Math.max(1, +g(e, 71, 1)), dc = +g(e, 44, 0), df = +g(e, 45, 0);
        for (let i = 0; i < nc; i++) for (let j = 0; j < nf; j++) {
          // arreglo: las copias se separan en los ejes del INSERT ya girado
          const T = mul(ocs, mul(tras(x, y), mul(giro(rot), mul(tras(i * dc, j * df), mul(esc(sx, sy), tras(-b.base[0], -b.base[1]))))));
          for (const s of b.ents) convertir(s, T, capa, nivel + 1);
        }
        break;
      }
      default:
        if (NO_CORTE.has(e.tipo) || e.tipo === "HATCH" || e.tipo === "POINT" || e.tipo === "SOLID" || e.tipo === "3DFACE") ignorados[e.tipo] = (ignorados[e.tipo] || 0) + 1;
    }
  }
  function empujarPoli(M, vs, cerrada, capa) {
    if (vs.length < 2) return;
    const pts = [vs[0].p];
    for (let i = 1; i < vs.length; i++) pts.push(...tramoBulge(vs[i - 1].p, vs[i].p, vs[i - 1].b));
    if (cerrada) pts.push(...tramoBulge(vs[vs.length - 1].p, vs[0].p, vs[vs.length - 1].b));
    if (cerrada) pts[pts.length - 1] = pts[0];
    empujar(M, pts, cerrada, capa);
  }

  for (const e of modelo) convertir(e, raiz, null, 0);
  const textos = (ignorados.TEXT || 0) + (ignorados.MTEXT || 0);
  if (textos) avisos.push(`${textos} ${textos === 1 ? "texto no se corta" : "textos no se cortan"}: conviértelos a curvas en tu programa de dibujo`);
  if (ignorados.MALLA) avisos.push("Las mallas 3D no se cortan");
  if (!trazos.length && !avisos.length) avisos.push("El DXF no tiene líneas que cortar");
  return { trazos, avisos };
}

function g(e, c, def) { const p = e.d.find(([k]) => k === c); return p ? p[1] : def; }
function todos(e, c) { return e.d.filter(([k]) => k === c).map(([, v]) => +v); }
