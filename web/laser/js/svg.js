// svg.js - SVG → polilíneas en mm, agrupadas en capas por color.
//
//   leerSVG(texto) → { ancho, alto, capas: [{ color, trazos: [{ pts, cerrado }], relleno }], avisos }
//
// Coordenadas: mm desde la esquina de arriba a la izquierda del dibujo, Y hacia abajo. Es el mismo
// sentido que la S1 (Y hacia el frente), así que lo que se ve arriba en el SVG queda al fondo.
// Unidades: width/height con unidad (mm, cm, in, pt, px) y viewBox; sin unidad se toma px a 96 por
// pulgada, como Inkscape. Curvas y arcos se aplanan con un error máximo de TOL mm.
// Capas: por color de trazo; las figuras con relleno y sin trazo forman capas de relleno (grabado).

const TOL = 0.05;
const MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 25.4 / 96 };

// ---------------- Matrices 2D: [a, b, c, d, e, f] ----------------
const I = [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const aplicar = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const escalaDe = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

export function leerTransform(t) {
  let m = I;
  if (!t) return m;
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = (args.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    let n = I;
    if (fn === "matrix" && a.length === 6) n = a;
    else if (fn === "translate") n = [1, 0, 0, 1, a[0] || 0, a[1] || 0];
    else if (fn === "scale") n = [a[0], 0, 0, a[1] ?? a[0], 0, 0];
    else if (fn === "rotate") {
      const r = ((a[0] || 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      n = [c, s, -s, c, 0, 0];
      if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (fn === "skewX") n = [1, 0, Math.tan(((a[0] || 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === "skewY") n = [1, Math.tan(((a[0] || 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

// ---------------- Trazos: d de un path → subtrazos en unidades del usuario ----------------
// tol: error permitido en unidades del usuario
export function leerPath(d, tol = 0.1) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi) || [];
  const subs = [];
  let i = 0, cmd = null, x = 0, y = 0, x0 = 0, y0 = 0, cx = 0, cy = 0, qx = 0, qy = 0, act = null, prev = null;
  const n = () => +toks[i++];
  const hayNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const linea = (nx, ny) => { act.pts.push({ x: nx, y: ny }); x = nx; y = ny; };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "M") {
      const nx = n() + ox, ny = n() + oy;
      act = { pts: [{ x: nx, y: ny }], cerrado: false }; subs.push(act);
      x = x0 = nx; y = y0 = ny;
      cmd = rel ? "l" : "L";      // pares siguientes = líneas
      prev = "M";
    } else if (C === "Z") {
      if (act) { act.cerrado = true; if (x !== x0 || y !== y0) act.pts.push({ x: x0, y: y0 }); }
      x = x0; y = y0;
      // Un trazo después de Z sin M empieza en el mismo punto
      act = { pts: [{ x, y }], cerrado: false }; subs.push(act);
      prev = "Z";
      continue;
    } else {
      if (!act) { act = { pts: [{ x, y }], cerrado: false }; subs.push(act); }
      if (C === "L") linea(n() + ox, n() + oy);
      else if (C === "H") linea(n() + ox, y);
      else if (C === "V") linea(x, n() + oy);
      else if (C === "C" || C === "S") {
        let x1, y1;
        if (C === "C") { x1 = n() + ox; y1 = n() + oy; }
        else { x1 = prev === "C" || prev === "S" ? 2 * x - cx : x; y1 = prev === "C" || prev === "S" ? 2 * y - cy : y; }
        const x2 = n() + ox, y2 = n() + oy, ex = n() + ox, ey = n() + oy;
        bezier3(act.pts, x, y, x1, y1, x2, y2, ex, ey, tol);
        cx = x2; cy = y2; x = ex; y = ey;
      } else if (C === "Q" || C === "T") {
        let x1, y1;
        if (C === "Q") { x1 = n() + ox; y1 = n() + oy; }
        else { x1 = prev === "Q" || prev === "T" ? 2 * x - qx : x; y1 = prev === "Q" || prev === "T" ? 2 * y - qy : y; }
        const ex = n() + ox, ey = n() + oy;
        // Cuadrática como cúbica
        bezier3(act.pts, x, y, x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), ex + (2 / 3) * (x1 - ex), ey + (2 / 3) * (y1 - ey), ex, ey, tol);
        qx = x1; qy = y1; x = ex; y = ey;
      } else if (C === "A") {
        const rx = n(), ry = n(), rot = n(), grande = n(), barrido = n(), ex = n() + ox, ey = n() + oy;
        arco(act.pts, x, y, rx, ry, rot, !!grande, !!barrido, ex, ey, tol);
        x = ex; y = ey;
      } else { i++; continue; }
      prev = C;
    }
    // Más números después del comando: el mismo comando se repite
    if (!hayNum() && i < toks.length && /^[a-zA-Z]$/.test(toks[i])) continue;
  }
  return subs.filter((s) => s.pts.length > 1);
}

function bezier3(pts, x0, y0, x1, y1, x2, y2, x3, y3, tol) {
  // Pasos según la longitud del polígono de control (suficiente para el error pedido)
  const L = Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2);
  const n = Math.min(200, Math.max(2, Math.ceil(Math.sqrt(L / tol) * 1.2)));
  for (let k = 1; k <= n; k++) {
    const t = k / n, u = 1 - t;
    pts.push({
      x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    });
  }
}

// Arco elíptico de SVG (notas de implementación de la especificación, F.6.5)
function arco(pts, x1, y1, rx, ry, rotGrados, grande, barrido, x2, y2, tol) {
  if (rx === 0 || ry === 0) { pts.push({ x: x2, y: y2 }); return; }
  rx = Math.abs(rx); ry = Math.abs(ry);
  const fi = (rotGrados * Math.PI) / 180, cf = Math.cos(fi), sf = Math.sin(fi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const xp = cf * dx + sf * dy, yp = -sf * dx + cf * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let k = Math.sqrt(Math.max(0, num / den));
  if (grande === barrido) k = -k;
  const cxp = (k * rx * yp) / ry, cyp = (-k * ry * xp) / rx;
  const cx = cf * cxp - sf * cyp + (x1 + x2) / 2, cy = sf * cxp + cf * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!barrido && dt > 0) dt -= 2 * Math.PI;
  if (barrido && dt < 0) dt += 2 * Math.PI;
  const r = Math.max(rx, ry);
  const paso = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tol / r))) || 0.2;
  const n = Math.min(360, Math.max(2, Math.ceil(Math.abs(dt) / paso)));
  for (let j = 1; j <= n; j++) {
    const t = t1 + (dt * j) / n, ct = Math.cos(t), st = Math.sin(t);
    pts.push({ x: cf * rx * ct - sf * ry * st + cx, y: sf * rx * ct + cf * ry * st + cy });
  }
  pts[pts.length - 1] = { x: x2, y: y2 };
}

// ---------------- Figuras → d ----------------
const nums = (s) => (s || "").match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
function dDe(el) {
  const a = (k) => parseFloat(el.getAttribute(k)) || 0;
  switch (el.tagName.toLowerCase()) {
    case "path": return el.getAttribute("d") || "";
    case "rect": {
      const x = a("x"), y = a("y"), w = a("width"), h = a("height");
      let rx = el.hasAttribute("rx") ? a("rx") : a("ry"), ry = el.hasAttribute("ry") ? a("ry") : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (w <= 0 || h <= 0) return "";
      if (!rx || !ry) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
    }
    case "circle": case "ellipse": {
      const cx = a("cx"), cy = a("cy"), rx = el.tagName.toLowerCase() === "circle" ? a("r") : a("rx"), ry = el.tagName.toLowerCase() === "circle" ? a("r") : a("ry");
      if (rx <= 0 || ry <= 0) return "";
      return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
    }
    case "line": return `M${a("x1")},${a("y1")}L${a("x2")},${a("y2")}`;
    case "polyline": case "polygon": {
      const p = nums(el.getAttribute("points"));
      if (p.length < 4) return "";
      let d = `M${p[0]},${p[1]}`;
      for (let k = 2; k + 1 < p.length; k += 2) d += `L${p[k]},${p[k + 1]}`;
      return el.tagName.toLowerCase() === "polygon" ? d + "Z" : d;
    }
    default: return "";
  }
}

// ---------------- Estilo heredado ----------------
function estilo(el, padre) {
  const e = { ...padre };
  const st = {};
  for (const [, k, v] of (el.getAttribute("style") || "").matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) st[k.trim()] = v.trim();
  for (const k of ["stroke", "fill", "display", "visibility", "stroke-width"]) {
    const v = st[k] ?? el.getAttribute(k);
    if (v != null && v !== "inherit") e[k] = v;
  }
  return e;
}
function color(c) {
  if (!c || c === "none" || c === "transparent" || c.startsWith("url(")) return null;
  const cv = color._cv || (color._cv = document.createElement("canvas").getContext("2d"));
  cv.fillStyle = "#000"; cv.fillStyle = c;
  return cv.fillStyle;    // normalizado a #rrggbb
}

// ---------------- Documento ----------------
export function leerSVG(texto) {
  const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
  const raiz = doc.documentElement;
  if (!raiz || raiz.tagName.toLowerCase() !== "svg" || doc.querySelector("parsererror")) throw new Error("No es un SVG válido");
  const avisos = [];
  const medida = (v) => { const m = String(v || "").trim().match(/^(-?\d*\.?\d+)\s*([a-z%]*)$/i); return m ? { v: +m[1], u: m[2].toLowerCase() } : null; };
  const vb = nums(raiz.getAttribute("viewBox"));
  const W = medida(raiz.getAttribute("width")), H = medida(raiz.getAttribute("height"));
  // mm por unidad del usuario
  let kx = MM[""], ky = MM[""];
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (W && W.u !== "%" && MM[W.u] !== undefined) kx = (W.v * MM[W.u]) / vb[2];
    if (H && H.u !== "%" && MM[H.u] !== undefined) ky = (H.v * MM[H.u]) / vb[3];
    if (!W && H) kx = ky; if (W && !H) ky = kx;
  } else if (W && MM[W.u] !== undefined) kx = ky = MM[W.u];
  if (!W && !H) avisos.push("El SVG no dice su tamaño: se tomó 96 px por pulgada (como Inkscape). Revisa las medidas.");
  const base = mul([kx, 0, 0, ky, 0, 0], vb.length === 4 ? [1, 0, 0, 1, -vb[0], -vb[1]] : I);

  const capas = new Map();
  const capa = (col, relleno) => {
    const k = `${relleno ? "r" : "t"}${col}`;
    if (!capas.has(k)) capas.set(k, { color: col, relleno, trazos: [] });
    return capas.get(k);
  };
  let ignorados = 0;
  const visitar = (el, m, est) => {
    const tag = el.tagName.toLowerCase();
    if (["defs", "clippath", "mask", "symbol", "metadata", "title", "desc", "style", "pattern", "marker"].includes(tag)) return;
    const e = estilo(el, est);
    if (e.display === "none" || e.visibility === "hidden") return;
    const mm = mul(m, leerTransform(el.getAttribute("transform")));
    if (tag === "use") {
      const ref = el.getAttribute("href") || el.getAttribute("xlink:href");
      const obj = ref && doc.getElementById(ref.slice(1));
      if (obj) visitar(obj, mul(mm, [1, 0, 0, 1, parseFloat(el.getAttribute("x")) || 0, parseFloat(el.getAttribute("y")) || 0]), e);
      return;
    }
    if (tag === "g" || tag === "svg" || tag === "a") { for (const h of el.children) visitar(h, mm, e); return; }
    if (tag === "text" || tag === "image") { ignorados++; return; }
    const d = dDe(el);
    if (!d) return;
    const tolUsuario = TOL / escalaDe(mm);
    const subs = leerPath(d, tolUsuario).map((s) => ({ pts: s.pts.map((p) => aplicar(mm, p.x, p.y)), cerrado: s.cerrado }));
    const trazo = color(e.stroke), relleno = color(e.fill ?? "#000");
    if (trazo) capa(trazo, false).trazos.push(...subs);
    else if (relleno) capa(relleno, true).trazos.push(...subs.map((s) => ({ ...s, cerrado: true })));
  };
  for (const h of raiz.children) visitar(h, base, { fill: "#000" });
  if (ignorados) avisos.push(`${ignorados} texto${ignorados > 1 ? "s" : ""} o imagen${ignorados > 1 ? "es" : ""} sin convertir: en Inkscape usa Trayecto → Objeto a trayecto.`);

  // Caja de todo y traslado a la esquina (0, 0)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of capas.values()) for (const t of c.trazos) for (const p of t.pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  if (!isFinite(x0)) return { ancho: 0, alto: 0, capas: [], avisos: [...avisos, "El SVG no tiene trazos que se puedan cortar."] };
  for (const c of capas.values()) for (const t of c.trazos) for (const p of t.pts) { p.x -= x0; p.y -= y0; }
  return { ancho: x1 - x0, alto: y1 - y0, capas: [...capas.values()], avisos };
}
