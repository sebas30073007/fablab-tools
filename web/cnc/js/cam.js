// cam.js - de las imágenes y los taladros a trayectorias y G-code (al estilo de mods "mill 2D PCB").
//
// Pistas: transformada de distancia sobre la imagen de cobre; cada pasada de
// aislamiento es la curva de nivel a r + k·d·(1 − traslape) del cobre
// (marching squares, precisión de subpíxel). Contorno: la curva a r por fuera
// de la imagen interior, en varias pasadas y con puentes. Hoyos: un taladro por
// agujero (GRBL no tiene ciclos G81/G83: se expanden).
//
// Coordenadas de salida: mm de trabajo, con el origen en la esquina inferior
// izquierda del material (X0 Y0) y Z0 en la superficie del cobre. El diseño va
// desplazado dentro del material: `origen` es el punto del Gerber que cae en X0 Y0.

import { binaria } from "./raster.js";

export const DEF = {
  comun: { zSeguro: 5, rpm: 10000, espera: 3, climb: true },
  pistas: { diam: 0.2, prof: 0.1, pasadas: 2, traslape: 0.5, f: 120, fz: 60 },
  hoyos: { broca: 1.0, prof: 1.8, fz: 60, min: 0.6, max: 1.3 },
  contorno: { diam: 1.0, prof: 1.85, pasadas: 4, f: 120, fz: 60, puentes: 4, anchoPuente: 3.1, zPuente: -0.9 },
};

// ---------------- Transformada de distancia (Felzenszwalb–Huttenlocher) ----------------
const INF = 1e20;
function dt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
// Distancia (px) de cada píxel al píxel "1" más cercano
export function distancia(bin, W, H) {
  const g = new Float64Array(W * H);
  for (let i = 0; i < g.length; i++) g[i] = bin[i] ? 0 : INF;
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    dt1d(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) f[x] = g[o + x];
    dt1d(f, W, d, v, z);
    for (let x = 0; x < W; x++) out[o + x] = Math.sqrt(d[x]);
  }
  return out;
}

// ---------------- Curvas de nivel (marching squares) ----------------
// Devuelve polilíneas en px (centros de píxel) de la frontera F = L.
export function curvas(F, W, H, L) {
  const pt = new Map();        // id de arista → [x, y]
  const ady = new Map();       // id de arista → [seg, seg]
  const sa = [], sb = [];
  const NH = W * H;
  const arista = (id) => {
    if (pt.has(id)) return;
    let ax, ay, bx, by;
    if (id < NH) { ax = id % W; ay = (id / W) | 0; bx = ax + 1; by = ay; } else { const k = id - NH; ax = k % W; ay = (k / W) | 0; bx = ax; by = ay + 1; }
    const fa = F[ay * W + ax], fb = F[by * W + bx];
    const t = (L - fa) / (fb - fa);
    pt.set(id, [ax + (bx - ax) * t, ay + (by - ay) * t]);
  };
  const unir = (a, b) => {
    arista(a); arista(b);
    const s = sa.length; sa.push(a); sb.push(b);
    (ady.get(a) || ady.set(a, []).get(a)).push(s);
    (ady.get(b) || ady.set(b, []).get(b)).push(s);
  };
  for (let j = 0; j < H - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const tl = F[j * W + i] < L, tr = F[j * W + i + 1] < L, br = F[(j + 1) * W + i + 1] < L, bl = F[(j + 1) * W + i] < L;
      const c = (tl << 3) | (tr << 2) | (br << 1) | bl;
      if (c === 0 || c === 15) continue;
      const T = j * W + i, B = (j + 1) * W + i, Le = NH + j * W + i, R = NH + j * W + i + 1;
      switch (c) {
        case 1: case 14: unir(Le, B); break;
        case 2: case 13: unir(B, R); break;
        case 3: case 12: unir(Le, R); break;
        case 4: case 11: unir(T, R); break;
        case 6: case 9: unir(T, B); break;
        case 7: case 8: unir(Le, T); break;
        case 5: case 10: {
          const centro = (F[j * W + i] + F[j * W + i + 1] + F[(j + 1) * W + i + 1] + F[(j + 1) * W + i]) / 4 < L;
          if ((c === 5) === centro) { unir(Le, T); unir(B, R); } else { unir(Le, B); unir(T, R); }
          break;
        }
      }
    }
  }
  // Encadenar segmentos
  const usado = new Uint8Array(sa.length);
  const polis = [];
  for (let s0 = 0; s0 < sa.length; s0++) {
    if (usado[s0]) continue;
    usado[s0] = 1;
    const cadena = [sa[s0], sb[s0]];
    // hacia adelante
    for (let fin = sb[s0]; ;) {
      const s = ady.get(fin).find((k) => !usado[k]);
      if (s === undefined) break;
      usado[s] = 1; fin = sa[s] === fin ? sb[s] : sa[s]; cadena.push(fin);
    }
    // hacia atrás (si no cerró)
    if (cadena[0] !== cadena[cadena.length - 1]) {
      for (let ini = sa[s0]; ;) {
        const s = ady.get(ini).find((k) => !usado[k]);
        if (s === undefined) break;
        usado[s] = 1; ini = sa[s] === ini ? sb[s] : sa[s]; cadena.unshift(ini);
      }
    }
    const cerrado = cadena[0] === cadena[cadena.length - 1];
    polis.push({ pts: cadena.map((id) => pt.get(id)), cerrado });
  }
  return polis;
}

// Ramer–Douglas–Peucker
function simplificar(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const pila = [[0, pts.length - 1]];
  while (pila.length) {
    const [a, b] = pila.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    let max = -1, k = -1;
    for (let i = a + 1; i < b; i++) {
      // Lazo cerrado (extremos iguales): se mide la distancia al punto, no a la recta
      const d = L < 1e-9 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L;
      if (d > max) { max = d; k = i; }
    }
    if (max > tol) { keep[k] = 1; pila.push([a, k], [k, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// px → mm de trabajo, orientada para que el material quede a la derecha (climb con M3) o a la izquierda
function aMM(polis, F, W, L, m, origen, climb) {
  const muestra = (x, y) => { const i = Math.min(W - 1, Math.max(0, Math.round(x))), j = Math.max(0, Math.round(y)); return F[j * W + i] ?? INF; };
  return polis.map(({ pts, cerrado }) => {
    let p = simplificar(pts, 0.35);
    if (p.length < 2) return null;
    // ¿De qué lado está el material? (en px, con y hacia abajo la izquierda es (dy, −dx))
    const k = Math.floor((p.length - 1) / 2);
    const [ax, ay] = p[k], [bx, by] = p[k + 1];
    const L2 = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (by - ay) / L2, ny = -(bx - ax) / L2;      // izquierda en pantalla
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    // La imagen se ve igual que la placa: la izquierda en pantalla es la izquierda en mm
    const materialDer = !(muestra(mx + nx * 1.2, my + ny * 1.2) < L);
    if (materialDer !== climb) p = p.reverse();
    return {
      cerrado,
      pts: p.map(([x, y]) => [m.x0 + (x + 0.5) / m.s - origen.x, m.yTop - (y + 0.5) / m.s - origen.y]),
    };
  }).filter(Boolean);
}

// Orden voraz: siempre a la trayectoria más cercana; los lazos empiezan en su punto más cercano
function ordenar(paths, desde = [0, 0]) {
  const res = [], quedan = paths.slice();
  let p = desde;
  while (quedan.length) {
    let mejor = 0, dMejor = Infinity, rot = 0;
    quedan.forEach((t, i) => {
      if (t.cerrado) {
        for (let k = 0; k < t.pts.length; k += Math.max(1, (t.pts.length / 64) | 0)) {
          const d = (t.pts[k][0] - p[0]) ** 2 + (t.pts[k][1] - p[1]) ** 2;
          if (d < dMejor) { dMejor = d; mejor = i; rot = k; }
        }
      } else {
        const d = (t.pts[0][0] - p[0]) ** 2 + (t.pts[0][1] - p[1]) ** 2;
        if (d < dMejor) { dMejor = d; mejor = i; rot = 0; }
      }
    });
    const t = quedan.splice(mejor, 1)[0];
    if (t.cerrado && rot) { const a = t.pts.slice(0, -1); t.pts = [...a.slice(rot), ...a.slice(0, rot), a[rot]]; }
    res.push(t);
    p = t.pts[t.pts.length - 1];
  }
  return res;
}

// ---------------- Trabajos ----------------
// desp: dónde queda la esquina inferior izquierda del diseño, medida desde la esquina del material
export function origenDe(m, desp = { x: 0, y: 0 }) { return { x: m.placa.x0 - desp.x, y: m.placa.y0 - desp.y }; }

// Cada pasada va un poco más afuera que la anterior: así se quita más cobre junto a la pista
// y no quedan hilos sueltos entre pistas vecinas.
export function anchoAislado(P) { return P.diam + Math.max(0, P.pasadas - 1) * P.diam * (1 - P.traslape); }

export function trayectoriasPistas(cvPistas, m, P, C, origen = origenDe(m)) {
  const bin = binaria(cvPistas);
  const F = distancia(bin, m.W, m.H);
  const r = (P.diam / 2) * m.s, paso = P.diam * (1 - P.traslape) * m.s;
  const todas = [];
  for (let k = 0; k < P.pasadas; k++) {
    const L = r + k * paso;
    const polis = curvas(F, m.W, m.H, L).filter((p) => p.pts.length > 3);
    todas.push(...ordenar(aMM(polis, F, m.W, L, m, origen, C.climb)));
  }
  return todas;
}

export function trayectoriasContorno(cvInterior, m, P, C, origen = origenDe(m)) {
  const bin = binaria(cvInterior);
  const F = distancia(bin, m.W, m.H);
  const L = (P.diam / 2) * m.s;
  return ordenar(aMM(curvas(F, m.W, m.H, L).filter((p) => p.pts.length > 3), F, m.W, L, m, origen, C.climb));
}

export function seleccionHoyos(hoyos, P, m, origen = origenDe(m)) {
  return hoyos.filter((h) => h.d >= P.min - 1e-6 && h.d <= P.max + 1e-6).map((h) => ({ x: h.x - origen.x, y: h.y - origen.y, d: h.d }));
}

// ---------------- G-code ----------------
const f4 = (v) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4).replace(/\.?0+$/, "").replace(/^-0$/, "0");

function cabecera(titulo, notas, C) {
  return [
    `(${titulo})`, ...notas.map((n) => `(${n})`),
    "(ORIGEN X0 Y0: ESQUINA INFERIOR IZQUIERDA DEL MATERIAL - Z0: SUPERFICIE DEL COBRE)",
    "(GENERADO POR FAB LAB CNC)",
    "G21", "G90", "G17", "G94", "G54",
    `G0 Z${f4(C.zSeguro)}`,
    `M3 S${C.rpm}`, `G4 P${C.espera}`,
  ];
}
const pie = (C) => [`G0 Z${f4(C.zSeguro)}`, "M5", "G0 X0 Y0"];

export function gcodePistas(paths, P, C) {
  const out = cabecera("PISTAS - AISLAMIENTO", [`FRESA ${P.diam} MM - PROFUNDIDAD ${P.prof} MM - ${P.pasadas} PASADAS`], C);
  for (const t of paths) {
    const [x, y] = t.pts[0];
    out.push(`G0 Z${f4(C.zSeguro)}`, `G0 X${f4(x)} Y${f4(y)}`, "G0 Z0.5", `G1 Z${f4(-P.prof)} F${P.fz}`);
    let primera = true;
    for (const [px, py] of t.pts.slice(1)) { out.push(`G1 X${f4(px)} Y${f4(py)}${primera ? ` F${P.f}` : ""}`); primera = false; }
  }
  return [...out, ...pie(C)];
}

export function gcodeHoyos(hoyos, P, C) {
  const orden = ordenar(hoyos.map((h) => ({ pts: [[h.x, h.y]], cerrado: false, d: h.d })));
  const out = cabecera("HOYOS - TALADRADO", [`BROCA ${P.broca} MM - PROFUNDIDAD ${P.prof} MM - ${orden.length} HOYOS`, "MDF DE SACRIFICIO DEBAJO DE LA PLACA"], C);
  for (const h of orden) {
    const [x, y] = h.pts[0];
    out.push(`G0 X${f4(x)} Y${f4(y)}`, "G0 Z0.5", `G1 Z${f4(-P.prof)} F${P.fz}`, `G0 Z${f4(Math.min(2, C.zSeguro))}`);
  }
  return [...out, ...pie(C)];
}

export function gcodeContorno(paths, P, C) {
  const out = cabecera("CONTORNO - CORTE", [
    `FRESA DE CORTE LATERAL ${P.diam} MM (NO BROCA HELICOIDAL)`,
    `${P.pasadas} PASADAS HASTA Z-${P.prof} - ${P.puentes} PUENTES DE ${P.anchoPuente} MM A Z${P.zPuente}`,
  ], C);
  // Los puentes van en el lazo más largo (el borde exterior)
  const largo = (t) => t.pts.reduce((a, p, i) => (i ? a + Math.hypot(p[0] - t.pts[i - 1][0], p[1] - t.pts[i - 1][1]) : 0), 0);
  const exterior = paths.reduce((a, t) => (!a || largo(t) > largo(a) ? t : a), null);
  for (const t of paths) {
    const L = largo(t);
    const conPuentes = t === exterior && P.puentes > 0 && t.cerrado;
    const centros = conPuentes ? Array.from({ length: P.puentes }, (_, k) => ((k + 0.5) * L) / P.puentes) : [];
    const media = (P.anchoPuente + P.diam) / 2;
    const enPuente = (s) => centros.some((c) => Math.abs(s - c) < media);
    const [x0, y0] = t.pts[0];
    out.push(`G0 Z${f4(C.zSeguro)}`, `G0 X${f4(x0)} Y${f4(y0)}`, "G0 Z0.5");
    for (let k = 1; k <= P.pasadas; k++) {
      const z = (-P.prof * k) / P.pasadas;
      const zp = Math.max(z, P.zPuente);
      // Re-muestrea a 0.5 mm para poder subir y bajar en los puentes
      let s = 0, zAct = enPuente(0) ? zp : z;
      out.push(`G1 Z${f4(zAct)} F${P.fz}`);
      let primera = true;
      for (let i = 1; i < t.pts.length; i++) {
        const [ax, ay] = t.pts[i - 1], [bx, by] = t.pts[i];
        const d = Math.hypot(bx - ax, by - ay);
        const n = conPuentes ? Math.max(1, Math.ceil(d / 0.5)) : 1;
        for (let q = 1; q <= n; q++) {
          const u = q / n, px = ax + (bx - ax) * u, py = ay + (by - ay) * u, sq = s + d * u;
          const zq = conPuentes && enPuente(sq) ? zp : z;
          if (zq !== zAct) { out.push(`G1 X${f4(px)} Y${f4(py)}${primera ? ` F${P.f}` : ""}`, `G1 Z${f4(zq)} F${P.fz}`); zAct = zq; primera = true; continue; }
          if (q === n || conPuentes) { out.push(`G1 X${f4(px)} Y${f4(py)}${primera ? ` F${P.f}` : ""}`); primera = false; }
        }
        s += d;
      }
    }
    out.push(`G0 Z${f4(C.zSeguro)}`);
  }
  return [...out, ...pie(C)];
}
