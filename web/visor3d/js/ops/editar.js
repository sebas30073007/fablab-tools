// editar.js - las ediciones del visor (en el worker). Cada una recibe una malla y devuelve otra nueva:
// la página guarda la anterior para deshacer.
//
//   transformar(m, M)             matriz 4×4 (columna, como three) aplicada a las posiciones
//   reparar(m)                    une vértices repetidos, quita triángulos degenerados y repetidos
//   quitarIslas(m, {minimo})      borra las piezas sueltas de menos de `minimo` triángulos
//   orientar(m)                   normales coherentes y hacia afuera
//   borrar(m, mascara)            borra los triángulos marcados (selección con lazo)
//   cortar(m, {n, d, tapar})      corta con el plano n·x = d y se queda con el lado n·x ≤ d
//   recortarCaja(m, {min, max})   se queda con lo que cae dentro de la caja
//   rellenar(m, {maxBorde})       tapa los huecos de hasta maxBorde aristas
//   suavizar(m, {pasadas})        Taubin (suaviza sin encoger)
//   simplificar(m, {meta})        meshoptimizer, conservando color y textura
//   seleccionLazo(m, {...})       triángulos dentro del lazo dibujado en pantalla

import { compactar, normalCara, nVert } from "../nucleo/malla.js";
import { aristas, componentes, bordes, volumenFirmado } from "./topologia.js";
import { MeshoptSimplifier } from "../../../shared/vendor/meshoptimizer/meshopt_simplifier.js";

// ---------------- Transformar ----------------
export function transformar(m, M) {
  const p = m.pos.slice();
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    p[i] = M[0] * x + M[4] * y + M[8] * z + M[12];
    p[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    p[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
  }
  // Una escala negativa voltea el sentido de los triángulos: se corrige para que sigan hacia afuera
  const det = M[0] * (M[5] * M[10] - M[6] * M[9]) - M[4] * (M[1] * M[10] - M[2] * M[9]) + M[8] * (M[1] * M[6] - M[2] * M[5]);
  let idx = m.idx;
  if (det < 0) { idx = idx.slice(); for (let t = 0; t < idx.length; t += 3) { const a = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = a; } }
  return { ...m, pos: p, idx };
}

// ---------------- Reparar ----------------
// Une vértices en la misma posición (tolerancia en mm), respetando las costuras de la textura
export function reparar(m, { tolerancia = 1e-4 } = {}) {
  const nv = nVert(m), p = m.pos, q = 1 / tolerancia;
  let tam = 1; while (tam < nv * 2) tam <<= 1;
  const tabla = new Int32Array(tam).fill(-1), clave = new Int32Array(nv * 3), mapa = new Int32Array(nv);
  const rep = new Int32Array(nv);
  let unicos = 0;
  for (let v = 0; v < nv; v++) {
    const a = Math.round(p[v * 3] * q), b = Math.round(p[v * 3 + 1] * q), c = Math.round(p[v * 3 + 2] * q);
    let h = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791)) & (tam - 1);
    while (true) {
      const e = tabla[h];
      if (e < 0) { tabla[h] = v; clave[v * 3] = a; clave[v * 3 + 1] = b; clave[v * 3 + 2] = c; mapa[v] = v; rep[unicos++] = v; break; }
      if (clave[e * 3] === a && clave[e * 3 + 1] === b && clave[e * 3 + 2] === c && (!m.uv || (m.uv[e * 2] === m.uv[v * 2] && m.uv[e * 2 + 1] === m.uv[v * 2 + 1]))) { mapa[v] = e; break; }
      h = (h + 1) & (tam - 1);
    }
  }
  // Triángulos con los índices nuevos; fuera los degenerados y los repetidos
  const idx = m.idx, nt = idx.length / 3, nuevo = new Uint32Array(idx.length), queda = new Uint8Array(nt);
  const vistos = new Set();
  let quitados = 0;
  for (let t = 0; t < nt; t++) {
    const a = mapa[idx[t * 3]], b = mapa[idx[t * 3 + 1]], c = mapa[idx[t * 3 + 2]];
    nuevo[t * 3] = a; nuevo[t * 3 + 1] = b; nuevo[t * 3 + 2] = c;
    if (a === b || b === c || a === c) { quitados++; continue; }
    // mismo triángulo (en cualquier orden): se queda uno
    const s = [a, b, c].sort((x, y) => x - y), k = `${s[0]},${s[1]},${s[2]}`;
    if (vistos.has(k)) { quitados++; continue; }
    vistos.add(k); queda[t] = 1;
  }
  const r = compactar({ ...m, idx: nuevo }, queda);
  r.info = { unidos: nv - unicos, quitados };
  return r;
}

// ---------------- Islas ----------------
export function quitarIslas(m, { minimo = 0, soloMayor = false } = {}) {
  const { pieza, tam } = componentes(m);
  const mayor = tam.indexOf(Math.max(...tam));
  const umbral = minimo || Math.max(50, Math.round(tam[mayor] * 0.01));
  const queda = new Uint8Array(pieza.length);
  let borradas = new Set();
  for (let t = 0; t < pieza.length; t++) {
    const ok = soloMayor ? pieza[t] === mayor : tam[pieza[t]] >= umbral;
    queda[t] = ok ? 1 : 0; if (!ok) borradas.add(pieza[t]);
  }
  const r = compactar(m, queda);
  r.info = { borradas: borradas.size };
  return r;
}

// Máscara de los triángulos que se irían con quitarIslas (para pintarlos en rojo antes)
export function mascaraIslas(m, opciones = {}) {
  const { pieza, tam } = componentes(m);
  const mayor = tam.indexOf(Math.max(...tam));
  const umbral = opciones.minimo || Math.max(50, Math.round(tam[mayor] * 0.01));
  const r = new Uint8Array(pieza.length);
  for (let t = 0; t < pieza.length; t++) r[t] = (opciones.soloMayor ? pieza[t] !== mayor : tam[pieza[t]] < umbral) ? 1 : 0;
  return r;
}

// ---------------- Orientar ----------------
export function orientar(m) {
  const { claves, rep } = aristas(m), idx = m.idx.slice(), nt = idx.length / 3;
  // Vecinos por arista: se ordenan las esquinas por clave y se emparejan las que comparten
  const k = new Uint32Array(claves.length); for (let i = 0; i < k.length; i++) k[i] = i;
  k.sort((a, b) => claves[a] - claves[b]);
  const vecino = new Int32Array(nt * 3).fill(-1);
  for (let i = 0; i + 1 < k.length; i++) {
    if (claves[k[i]] === claves[k[i + 1]] && (i + 2 >= k.length || claves[k[i + 2]] !== claves[k[i]]) && (i === 0 || claves[k[i - 1]] !== claves[k[i]])) {
      vecino[k[i]] = k[i + 1]; vecino[k[i + 1]] = k[i]; i++;
    }
  }
  const visto = new Uint8Array(nt), cola = new Int32Array(nt);
  let volteados = 0;
  for (let s = 0; s < nt; s++) {
    if (visto[s]) continue;
    let ini = 0, fin = 0; cola[fin++] = s; visto[s] = 1;
    const enPieza = [];
    while (ini < fin) {
      const t = cola[ini++]; enPieza.push(t);
      for (let c = 0; c < 3; c++) {
        const e = vecino[t * 3 + c]; if (e < 0) continue;
        const u = (e / 3) | 0; if (visto[u]) continue;
        // Coherentes si la arista compartida va en sentidos opuestos
        const a = rep[idx[t * 3 + c]], b = rep[idx[t * 3 + (c + 1) % 3]];
        const ec = e % 3, a2 = rep[idx[u * 3 + ec]], b2 = rep[idx[u * 3 + (ec + 1) % 3]];
        if (a === a2 && b === b2) { const x = idx[u * 3 + 1]; idx[u * 3 + 1] = idx[u * 3 + 2]; idx[u * 3 + 2] = x; volteados++; }
        visto[u] = 1; cola[fin++] = u;
      }
    }
    // Hacia afuera: el volumen con signo de la pieza, medido desde su centro, debe ser positivo
    const p = m.pos; let cx = 0, cy = 0, cz = 0;
    for (const t of enPieza) for (let c = 0; c < 3; c++) { const v = idx[t * 3 + c] * 3; cx += p[v]; cy += p[v + 1]; cz += p[v + 2]; }
    const inv = 1 / (enPieza.length * 3);
    if (volumenFirmado({ pos: p, idx }, [cx * inv, cy * inv, cz * inv], enPieza) < 0) for (const t of enPieza) { const x = idx[t * 3 + 1]; idx[t * 3 + 1] = idx[t * 3 + 2]; idx[t * 3 + 2] = x; volteados++; }
  }
  return { ...m, idx, info: { volteados } };
}

// ---------------- Borrar ----------------
export function borrar(m, mascara) {
  const queda = new Uint8Array(mascara.length);
  let n = 0; for (let t = 0; t < mascara.length; t++) { queda[t] = mascara[t] ? 0 : 1; n += mascara[t]; }
  const r = compactar(m, queda); r.info = { borrados: n }; return r;
}

// ---------------- Cortar con un plano ----------------
// Se queda con n·x ≤ d. Con tapar, cierra el corte con una cara plana (para imprimir).
export function cortar(m, { n, d, tapar = false }) {
  const p = m.pos, nv = nVert(m), idx = m.idx;
  const s = new Float32Array(nv);
  for (let v = 0; v < nv; v++) { const x = n[0] * p[v * 3] + n[1] * p[v * 3 + 1] + n[2] * p[v * 3 + 2] - d; s[v] = x === 0 ? -1e-7 : x; }
  const P = Array.from(p), C = m.col ? Array.from(m.col) : null, U = m.uv ? Array.from(m.uv) : null;
  const corte = new Map();            // arista → vértice nuevo en el plano
  const enPlano = (a, b) => {
    const k = a < b ? a * nv + b : b * nv + a;
    let v = corte.get(k); if (v !== undefined) return v;
    const f = s[a] / (s[a] - s[b]);
    v = P.length / 3;
    for (let j = 0; j < 3; j++) P.push(p[a * 3 + j] + (p[b * 3 + j] - p[a * 3 + j]) * f);
    if (C) for (let j = 0; j < 4; j++) C.push(Math.round(m.col[a * 4 + j] + (m.col[b * 4 + j] - m.col[a * 4 + j]) * f));
    if (U) for (let j = 0; j < 2; j++) U.push(m.uv[a * 2 + j] + (m.uv[b * 2 + j] - m.uv[a * 2 + j]) * f);
    corte.set(k, v); return v;
  };
  const I = [], segs = [];
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]], dentro = v.map((x) => s[x] <= 0), nd = dentro.filter(Boolean).length;
    if (nd === 3) { I.push(...v); continue; }
    if (nd === 0) continue;
    // Se rota para que la esquina «distinta» quede primero
    let r = 0;
    for (let k = 0; k < 3; k++) if ((nd === 1 && dentro[k]) || (nd === 2 && !dentro[k])) r = k;
    const a = v[r], b = v[(r + 1) % 3], c = v[(r + 2) % 3];
    const ab = enPlano(a, b), ca = enPlano(c, a);
    if (nd === 1) { I.push(a, ab, ca); segs.push(ab, ca); }           // queda la punta a
    else { I.push(ab, b, c, ab, c, ca); segs.push(ca, ab); }          // queda el trapecio b c
  }
  let pos = new Float32Array(P);
  let indices = I;
  if (tapar && segs.length) indices = I.concat(tapa(pos, segs, n));
  const r = compactar({ ...m, pos, idx: new Uint32Array(indices), col: C ? new Uint8Array(C) : null, uv: U ? new Float32Array(U) : null }, null);
  r.info = { tapa: tapar && segs.length > 0 };
  return r;
}

// Encadena los segmentos del corte en lazos y los rellena (normal hacia afuera = +n)
function tapa(pos, segs, n) {
  const sig = new Map();
  for (let i = 0; i < segs.length; i += 2) sig.set(segs[i], segs[i + 1]);
  const lazos = [], usado = new Set();
  for (const ini of sig.keys()) {
    if (usado.has(ini)) continue;
    const l = []; let v = ini, k = 0;
    while (!usado.has(v) && sig.has(v) && k++ < 1e6) { usado.add(v); l.push(v); v = sig.get(v); }
    if (v === ini && l.length >= 3) lazos.push(l);
  }
  return rellenarLazos(pos, lazos, n, true);
}

// ---------------- Recortar con caja ----------------
export function recortarCaja(m, { min, max, tapar = false }) {
  let r = m;
  const planos = [[[1, 0, 0], max[0]], [[-1, 0, 0], -min[0]], [[0, 1, 0], max[1]], [[0, -1, 0], -min[1]], [[0, 0, 1], max[2]], [[0, 0, -1], -min[2]]];
  for (const [n, d] of planos) r = cortar(r, { n, d, tapar });
  return r;
}

// ---------------- Rellenar huecos ----------------
// Cada hueco se cierra con anillos que van del borde a un vértice nuevo en su centro: cada arista del
// borde recibe un solo triángulo, así que la malla queda cerrada sin aristas raras aunque el hueco no
// sea plano. Los huecos de 3 a 5 aristas se cierran directo, sin vértices nuevos.
export function rellenar(m, { maxBorde = 200 } = {}) {
  const { lazos } = bordes(m);
  const elegidos = lazos.filter((l) => l.length <= maxBorde);
  const P = Array.from(m.pos), C = m.col ? Array.from(m.col) : null, U = m.uv ? Array.from(m.uv) : null;
  const I = Array.from(m.idx);
  const nuevo = (x, y, z, col, uv) => { const v = P.length / 3; P.push(x, y, z); if (C) C.push(...col); if (U) U.push(...uv); return v; };
  for (const l0 of elegidos) {
    // El lazo va en el sentido de los triángulos vecinos: el relleno va al revés (b → a)
    const l = l0.slice().reverse(), n = l.length;
    if (n <= 5) { for (let i = 1; i + 1 < n; i++) I.push(l[0], l[i], l[i + 1]); continue; }
    let cx = 0, cy = 0, cz = 0; const cc = [0, 0, 0, 0], cu = [0, 0];
    for (const v of l) {
      cx += m.pos[v * 3]; cy += m.pos[v * 3 + 1]; cz += m.pos[v * 3 + 2];
      if (C) for (let j = 0; j < 4; j++) cc[j] += m.col[v * 4 + j];
      if (U) { cu[0] += m.uv[v * 2]; cu[1] += m.uv[v * 2 + 1]; }
    }
    cx /= n; cy /= n; cz /= n;
    const anillos = Math.max(1, Math.min(6, Math.round(Math.sqrt(n) / 3)));
    let previo = l;
    for (let k = 1; k <= anillos; k++) {
      const f = k / (anillos + 1), anillo = [];
      const lerp = (a, b) => a + (b - a) * f;
      for (const v of l) {
        anillo.push(nuevo(lerp(m.pos[v * 3], cx), lerp(m.pos[v * 3 + 1], cy), lerp(m.pos[v * 3 + 2], cz),
          C ? [0, 1, 2, 3].map((j) => Math.round(lerp(m.col[v * 4 + j], cc[j] / n))) : null,
          U ? [lerp(m.uv[v * 2], cu[0] / n), lerp(m.uv[v * 2 + 1], cu[1] / n)] : null));
      }
      for (let i = 0; i < n; i++) {
        const a = previo[i], b = previo[(i + 1) % n], c = anillo[(i + 1) % n], d = anillo[i];
        I.push(a, b, c, a, c, d);
      }
      previo = anillo;
    }
    const centro = nuevo(cx, cy, cz, C ? cc.map((x) => Math.round(x / n)) : null, U ? [cu[0] / n, cu[1] / n] : null);
    for (let i = 0; i < n; i++) I.push(previo[i], previo[(i + 1) % n], centro);
  }
  return {
    ...m, pos: new Float32Array(P), idx: new Uint32Array(I), col: C ? new Uint8Array(C) : null, uv: U ? new Float32Array(U) : null,
    info: { rellenos: elegidos.length, quedan: lazos.length - elegidos.length },
  };
}

// Triangula lazos planos (o casi): proyecta en su plano y corta orejas. Con agujeros adentro
// (lazos contenidos en otro) se usa el mismo plano y se resuelven por par exterior/agujero.
//   normalFija: la normal del plano (tapas de corte); si no, la de cada lazo (Newell)
//   alFrente: true = los triángulos miran hacia normalFija; false = contrarios al sentido del lazo
function rellenarLazos(pos, lazos, normalFija, alFrente) {
  const salida = [];
  const proy = (l, u, w) => l.map((v) => [pos[v * 3] * u[0] + pos[v * 3 + 1] * u[1] + pos[v * 3 + 2] * u[2], pos[v * 3] * w[0] + pos[v * 3 + 1] * w[1] + pos[v * 3 + 2] * w[2]]);
  const base = (nn) => {
    const a = Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [nn[1] * a[2] - nn[2] * a[1], nn[2] * a[0] - nn[0] * a[2], nn[0] * a[1] - nn[1] * a[0]];
    const lu = Math.hypot(...u); u = u.map((x) => x / lu);
    const w = [nn[1] * u[2] - nn[2] * u[1], nn[2] * u[0] - nn[0] * u[2], nn[0] * u[1] - nn[1] * u[0]];
    return [u, w];
  };
  const newell = (l) => {
    const r = [0, 0, 0];
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      r[0] += (pos[a * 3 + 1] - pos[b * 3 + 1]) * (pos[a * 3 + 2] + pos[b * 3 + 2]);
      r[1] += (pos[a * 3 + 2] - pos[b * 3 + 2]) * (pos[a * 3] + pos[b * 3]);
      r[2] += (pos[a * 3] - pos[b * 3]) * (pos[a * 3 + 1] + pos[b * 3 + 1]);
    }
    const lr = Math.hypot(...r) || 1; return r.map((x) => x / lr);
  };
  const orientar = (tri, nn, signo) => {
    const f = [0, 0, 0]; normalCara(pos, tri[0], tri[1], tri[2], f);
    const dot = f[0] * nn[0] + f[1] * nn[1] + f[2] * nn[2];
    return dot * signo < 0 ? [tri[0], tri[2], tri[1]] : tri;
  };
  if (normalFija) {
    // Tapas: todos los lazos en el mismo plano; los contenidos en otro son agujeros
    const [u, w] = base(normalFija);
    const pr = lazos.map((l) => proy(l, u, w));
    const area = pr.map(areaFirmada);
    const dentroDe = pr.map((pl, i) => pr.findIndex((q, j) => j !== i && Math.abs(area[j]) > Math.abs(area[i]) && puntoEn(pl[0], q)));
    const profundidad = (i) => { let k = 0, j = dentroDe[i]; while (j >= 0 && k < 50) { k++; j = dentroDe[j]; } return k; };
    lazos.forEach((l, i) => {
      if (profundidad(i) % 2) return;                // es agujero de otro
      const agujeros = lazos.map((_, j) => j).filter((j) => dentroDe[j] === i && profundidad(j) % 2 === 1);
      for (const tri of orejas(pr[i], l, agujeros.map((j) => ({ p: pr[j], v: lazos[j] })))) salida.push(...orientar(tri, normalFija, alFrente ? 1 : -1));
    });
  } else {
    for (const l of lazos) {
      const nn = newell(l), [u, w] = base(nn);
      for (const tri of orejas(proy(l, u, w), l, [])) salida.push(...orientar(tri, nn, -1));
    }
  }
  return salida;
}

function areaFirmada(pl) { let a = 0; for (let i = 0; i < pl.length; i++) { const [x1, y1] = pl[i], [x2, y2] = pl[(i + 1) % pl.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
function puntoEn([x, y], pl) {
  let dentro = false;
  for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
    const [xi, yi] = pl[i], [xj, yj] = pl[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Corte de orejas con agujeros (los agujeros se unen al contorno por el puente más corto)
function orejas(contorno, verts, agujeros) {
  let pts = contorno.map((p, i) => ({ x: p[0], y: p[1], v: verts[i] }));
  if (areaFirmada(contorno) < 0) pts.reverse();
  for (const h of agujeros.sort((a, b) => Math.max(...b.p.map((q) => q[0])) - Math.max(...a.p.map((q) => q[0])))) {
    let hp = h.p.map((p, i) => ({ x: p[0], y: p[1], v: h.v[i] }));
    if (areaFirmada(h.p) > 0) hp.reverse();
    // Puente: el vértice del agujero más a la derecha con el vértice visible más cercano del contorno
    let hi = 0; hp.forEach((q, i) => { if (q.x > hp[hi].x) hi = i; });
    let ci = 0, mejor = Infinity;
    pts.forEach((q, i) => { const dd = (q.x - hp[hi].x) ** 2 + (q.y - hp[hi].y) ** 2; if (q.x >= hp[hi].x - 1e-9 && dd < mejor) { mejor = dd; ci = i; } });
    if (mejor === Infinity) pts.forEach((q, i) => { const dd = (q.x - hp[hi].x) ** 2 + (q.y - hp[hi].y) ** 2; if (dd < mejor) { mejor = dd; ci = i; } });
    const anillo = hp.slice(hi).concat(hp.slice(0, hi + 1));
    pts = pts.slice(0, ci + 1).concat(anillo, pts.slice(ci));
  }
  const tris = [];
  const cruz = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const dentro = (p, a, b, c) => cruz(a, b, p) >= 0 && cruz(b, c, p) >= 0 && cruz(c, a, p) >= 0;
  let lista = pts.slice(), guardia = 0;
  while (lista.length > 3 && guardia++ < 1e6) {
    let hecho = false;
    for (let i = 0; i < lista.length; i++) {
      const a = lista[(i + lista.length - 1) % lista.length], b = lista[i], c = lista[(i + 1) % lista.length];
      if (cruz(a, b, c) <= 1e-12) continue;
      let vacia = true;
      for (const q of lista) { if (q === a || q === b || q === c || q.v === a.v || q.v === b.v || q.v === c.v) continue; if (dentro(q, a, b, c)) { vacia = false; break; } }
      if (!vacia) continue;
      tris.push([a.v, b.v, c.v]); lista.splice(i, 1); hecho = true; break;
    }
    if (!hecho) {   // polígono raro (se cruza): abanico desde el primero para no dejar el hueco abierto
      for (let i = 1; i + 1 < lista.length; i++) tris.push([lista[0].v, lista[i].v, lista[i + 1].v]);
      return tris;
    }
  }
  if (lista.length === 3) tris.push([lista[0].v, lista[1].v, lista[2].v]);
  return tris.filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
}

// ---------------- Suavizar (Taubin) ----------------
export function suavizar(m, { pasadas = 5, fuerza = 0.5, bordesFijos = true } = {}) {
  const nv = nVert(m), idx = m.idx;
  // Vecinos de cada vértice (CSR)
  const grado = new Uint32Array(nv + 1);
  for (let t = 0; t < idx.length; t++) grado[idx[t] + 1] += 2;
  for (let v = 0; v < nv; v++) grado[v + 1] += grado[v];
  const vec = new Uint32Array(grado[nv]), lleno = grado.slice(0, nv);
  for (let t = 0; t < idx.length; t += 3) for (let c = 0; c < 3; c++) {
    const a = idx[t + c], b = idx[t + (c + 1) % 3], cc = idx[t + (c + 2) % 3];
    vec[lleno[a]++] = b; vec[lleno[a]++] = cc;
  }
  const fijo = new Uint8Array(nv);
  if (bordesFijos) for (const l of bordes(m).lazos) for (const v of l) fijo[v] = 1;
  let p = m.pos.slice(); const q = new Float32Array(p.length);
  const paso = (f) => {
    for (let v = 0; v < nv; v++) {
      const a = grado[v], b = grado[v + 1];
      if (fijo[v] || a === b) { q[v * 3] = p[v * 3]; q[v * 3 + 1] = p[v * 3 + 1]; q[v * 3 + 2] = p[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (let k = a; k < b; k++) { const w = vec[k]; x += p[w * 3]; y += p[w * 3 + 1]; z += p[w * 3 + 2]; }
      const n = b - a;
      q[v * 3] = p[v * 3] + f * (x / n - p[v * 3]); q[v * 3 + 1] = p[v * 3 + 1] + f * (y / n - p[v * 3 + 1]); q[v * 3 + 2] = p[v * 3 + 2] + f * (z / n - p[v * 3 + 2]);
    }
    p.set(q);
  };
  for (let i = 0; i < pasadas; i++) { paso(fuerza); paso(-fuerza - 0.03); }
  return { ...m, pos: p };
}

// ---------------- Simplificar ----------------
// meta: triángulos que deben quedar. Conserva la forma, el color y la costura de la textura.
export async function simplificar(m, { meta }) {
  await MeshoptSimplifier.ready;
  const nv = nVert(m), metaIdx = Math.max(3, Math.min(m.idx.length, Math.floor(meta) * 3));
  const st = (m.col ? 3 : 0) + (m.uv ? 2 : 0);
  let nuevos;
  if (st) {
    const at = new Float32Array(nv * st), pesos = [];
    for (let v = 0; v < nv; v++) {
      let o = v * st;
      if (m.col) { at[o++] = m.col[v * 4] / 255; at[o++] = m.col[v * 4 + 1] / 255; at[o++] = m.col[v * 4 + 2] / 255; }
      if (m.uv) { at[o++] = m.uv[v * 2]; at[o++] = m.uv[v * 2 + 1]; }
    }
    if (m.col) pesos.push(0.5, 0.5, 0.5);
    if (m.uv) pesos.push(1, 1);
    // Con textura, los bordes de las islas de UV no se mueven (si no, la imagen se corre)
    [nuevos] = MeshoptSimplifier.simplifyWithAttributes(m.idx, m.pos, 3, at, st, pesos, null, metaIdx, 0.05, m.uv ? ["LockBorder"] : []);
  } else {
    [nuevos] = MeshoptSimplifier.simplify(m.idx, m.pos, 3, metaIdx, 0.05, []);
  }
  const r = compactar({ ...m, idx: nuevos }, null);
  r.info = { antes: m.idx.length / 3, despues: nuevos.length / 3 };
  return r;
}

// ---------------- Selección con lazo ----------------
// vp: matriz vista-proyección (columna, 16); lazo: [[x, y]…] en coordenadas de pantalla −1…1;
// soloVisibles: solo triángulos que miran a la cámara; ojo: posición de la cámara.
export function seleccionLazo(m, { vp, lazo, soloVisibles = true, ojo, agregar = null }) {
  const p = m.pos, idx = m.idx, nt = idx.length / 3, nv = nVert(m);
  const ok = new Uint8Array(nv);
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const [x, y] of lazo) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  for (let v = 0; v < nv; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2];
    const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
    if (w <= 0) continue;
    const px = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w, py = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
    ok[v] = px >= minx && px <= maxx && py >= miny && py <= maxy && puntoEn([px, py], lazo) ? 1 : 0;
  }
  const sel = agregar ? agregar.slice() : new Uint8Array(nt), f = [0, 0, 0];
  for (let t = 0; t < nt; t++) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    if (!(ok[a] && ok[b] && ok[c])) continue;
    if (soloVisibles) {
      normalCara(p, a, b, c, f);
      const dx = ojo[0] - p[a * 3], dy = ojo[1] - p[a * 3 + 1], dz = ojo[2] - p[a * 3 + 2];
      if (f[0] * dx + f[1] * dy + f[2] * dz <= 0) continue;
    }
    sel[t] = 1;
  }
  return sel;
}
