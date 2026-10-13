// svg.js - leer un SVG (Inkscape, Illustrator, Figma…) a trazos en mm con Y hacia arriba.
//
//   leerSVG(texto) → { trazos: [{ pts, cerrado, capa, circulo? }], avisos: [] }
//
// path (todos sus comandos, arcos incluidos), rect (con esquinas redondeadas), circle, ellipse,
// line, polyline, polygon y use, con sus transformaciones. Las unidades salen de width/height y
// viewBox; sin unidades, 96 px por pulgada (CSS). La capa es la de Inkscape (inkscape:label del
// grupo capa) o, si no hay, el id del grupo de primer nivel. Lo oculto, defs y textos no se cortan.

const ERR = 0.01;   // mm de error de cuerda en curvas
const MM = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, q: 0.25, "": 25.4 / 96 };
const NO = new Set(["defs", "clipPath", "mask", "symbol", "marker", "pattern", "title", "desc", "metadata", "style", "script", "image", "foreignObject", "linearGradient", "radialGradient", "filter"]);

const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const ap = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

function longitud(s) {
  const m = /^\s*([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?)\s*(mm|cm|in|pt|pc|px|q|%)?\s*$/i.exec(s || "");
  if (!m || m[2] === "%") return null;
  return +m[1] * MM[(m[2] || "").toLowerCase()];
}

function transformacion(txt) {
  let M = [1, 0, 0, 1, 0, 0];
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(txt || ""))) {
    const v = m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let T;
    switch (m[1]) {
      case "matrix": T = v.length === 6 ? v : [1, 0, 0, 1, 0, 0]; break;
      case "translate": T = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; break;
      case "scale": T = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]; break;
      case "rotate": {
        const a = ((v[0] || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0;
        T = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
        break;
      }
      case "skewX": T = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0]; break;
      case "skewY": T = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    M = mul(M, T);
  }
  return M;
}

// Número de tramos para una curva de largo aproximado L (unidades del usuario; k = mm por unidad)
const tramos = (L, k) => Math.min(200, Math.max(4, Math.ceil(Math.sqrt((L * k) / (8 * ERR)) * 2)));

function arcoSVG(x1, y1, rx, ry, phi, fa, fs, x2, y2, k) {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  const c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = c * dx + s * dy, yp = -s * dx + c * dy;
  const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
  let co = Math.sqrt(Math.max(0, num / den));
  if (fa === fs) co = -co;
  const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const r = Math.max(rx, ry) * k, da = 2 * Math.acos(Math.max(-1, 1 - ERR / Math.max(r, ERR * 2)));
  const n = Math.min(720, Math.max(2, Math.ceil(Math.abs(dt) / (da || 0.1))));
  const pts = [];
  for (let i = 1; i <= n; i++) { const t = t1 + (dt * i) / n; pts.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c]); }
  pts[pts.length - 1] = [x2, y2];
  return pts;
}

// Atributo d → subtrayectos [{pts, cerrado}] en unidades del usuario
export function caminos(d, k = 1) {
  const res = [];
  const RN = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/y;
  let i = 0, cmd = "", x = 0, y = 0, x0 = 0, y0 = 0, cx = 0, cy = 0, cur = null, prev = "";
  const ws = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const hay = () => { ws(); return i < d.length && /[-+.\d]/.test(d[i]); };
  const num = () => { ws(); RN.lastIndex = i; const m = RN.exec(d); if (!m) throw new Error("d"); i = RN.lastIndex; return +m[0]; };
  const flag = () => { ws(); const c = d[i++]; if (c !== "0" && c !== "1") throw new Error("d"); return c === "1"; };
  const nuevo = () => { cur = { pts: [[x, y]], cerrado: false }; res.push(cur); };
  const a = (p) => { if (!cur) nuevo(); cur.pts.push(p); };
  try {
    for (;;) {
      ws();
      if (i >= d.length) break;
      if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
      else if (!cmd) break;
      const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      switch (C) {
        case "M": x = ox + num(); y = oy + num(); x0 = x; y0 = y; nuevo(); cmd = rel ? "l" : "L"; break;
        case "L": x = ox + num(); y = oy + num(); a([x, y]); break;
        case "H": x = ox + num(); a([x, y]); break;
        case "V": y = (rel ? y : 0) + num(); a([x, y]); break;
        case "C": case "S": {
          let x1, y1;
          if (C === "C") { x1 = ox + num(); y1 = oy + num(); } else { const r = /[CS]/.test(prev.toUpperCase()); x1 = r ? 2 * x - cx : x; y1 = r ? 2 * y - cy : y; }
          const x2 = ox + num(), y2 = oy + num(), xe = ox + num(), ye = oy + num();
          const n = tramos(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(xe - x2, ye - y2), k);
          for (let j = 1; j <= n; j++) { const t = j / n, u = 1 - t; a([u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * xe, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ye]); }
          cx = x2; cy = y2; x = xe; y = ye;
          break;
        }
        case "Q": case "T": {
          let x1, y1;
          if (C === "Q") { x1 = ox + num(); y1 = oy + num(); } else { const r = /[QT]/.test(prev.toUpperCase()); x1 = r ? 2 * x - cx : x; y1 = r ? 2 * y - cy : y; }
          const xe = ox + num(), ye = oy + num();
          const n = tramos(Math.hypot(x1 - x, y1 - y) + Math.hypot(xe - x1, ye - y1), k);
          for (let j = 1; j <= n; j++) { const t = j / n, u = 1 - t; a([u * u * x + 2 * u * t * x1 + t * t * xe, u * u * y + 2 * u * t * y1 + t * t * ye]); }
          cx = x1; cy = y1; x = xe; y = ye;
          break;
        }
        case "A": {
          const rx = num(), ry = num(), phi = (num() * Math.PI) / 180, fa = flag(), fs = flag(), xe = ox + num(), ye = oy + num();
          for (const p of arcoSVG(x, y, rx, ry, phi, fa, fs, xe, ye, k)) a(p);
          x = xe; y = ye;
          break;
        }
        case "Z":
          if (cur) { cur.cerrado = true; const p = cur.pts[0]; if (Math.hypot(p[0] - x, p[1] - y) > 1e-9) cur.pts.push([p[0], p[1]]); else cur.pts[cur.pts.length - 1] = [p[0], p[1]]; }
          x = x0; y = y0; cur = null;
          break;
        default: throw new Error("d");
      }
      prev = C;
      // Con más números el comando se repite (M ya se volvió L); Z no lleva números
      if (C === "Z" && hay()) break;
    }
  } catch (_) { /* lo leído hasta el error se queda */ }
  return res.filter((s) => s.pts.length > 1);
}

function elipse(cx, cy, rx, ry, k) {
  const n = Math.min(720, Math.max(16, Math.ceil(2 * Math.PI / (2 * Math.acos(Math.max(-1, 1 - ERR / Math.max(Math.max(rx, ry) * k, ERR * 2)))))));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = (2 * Math.PI * i) / n; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
  pts[n] = pts[0];
  return pts;
}

export function leerSVG(texto) {
  const avisos = [], trazos = [];
  const doc = new DOMParser().parseFromString(texto, "image/svg+xml");
  const raiz = doc.documentElement;
  if (!raiz || raiz.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return { trazos, avisos: ["El SVG no se pudo leer"] };
  const vb = (raiz.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
  const W = longitud(raiz.getAttribute("width")), H = longitud(raiz.getAttribute("height"));
  let sx = MM.px, sy = MM.px, tx = 0, ty = 0;
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (W) sx = W / vb[2]; if (H) sy = H / vb[3];
    if (W && !H) sy = sx; if (H && !W) sx = sy;
    tx = -vb[0]; ty = -vb[1];
  } else if (!W) avisos.push("El SVG no dice su tamaño: se leyó a 96 px por pulgada");
  // Y hacia arriba como en la máquina
  const M0 = mul([sx, 0, 0, -sy, 0, 0], [1, 0, 0, 1, tx, ty]);
  const porId = new Map();
  for (const el of doc.querySelectorAll("[id]")) porId.set(el.getAttribute("id"), el);
  let textos = 0;

  const oculto = (el) => el.getAttribute("display") === "none" || el.getAttribute("visibility") === "hidden" || /display\s*:\s*none|visibility\s*:\s*hidden/.test(el.getAttribute("style") || "");
  const empujar = (M, pts, cerrado, capa, circulo) => {
    if (pts.length < 2) return;
    const t = { pts: pts.map((p) => ap(M, p)), cerrado, capa };
    if (circulo) {
      const ex = Math.hypot(M[0], M[1]), ey = Math.hypot(M[2], M[3]), orto = Math.abs(M[0] * M[2] + M[1] * M[3]) < 1e-9 * ex * ey;
      if (orto && Math.abs(ex - ey) < 1e-6 * ex) { const [x, y] = ap(M, [circulo.x, circulo.y]); t.circulo = { x, y, d: circulo.d * ex }; }
    }
    trazos.push(t);
  };
  const num = (el, a, def = 0) => { const v = parseFloat(el.getAttribute(a)); return Number.isFinite(v) ? v : def; };

  function recorrer(el, M, capa, nivel) {
    const tag = el.localName;
    if (!tag || NO.has(tag) || oculto(el)) return;
    if (tag === "text") { textos++; return; }
    const T = mul(M, transformacion(el.getAttribute("transform")));
    const k = Math.sqrt(Math.abs(T[0] * T[3] - T[1] * T[2])) || 1;
    if (tag === "g" || tag === "svg" || tag === "a") {
      let c = capa;
      const modo = el.getAttribute("inkscape:groupmode"), lbl = el.getAttribute("inkscape:label");
      if (modo === "layer" && lbl) c = lbl;
      else if (nivel === 1 && tag === "g" && !capa) c = lbl || el.getAttribute("id") || capa;
      for (const h of el.children) recorrer(h, T, c, nivel + 1);
      return;
    }
    const c = capa || "0";
    switch (tag) {
      case "path": for (const s of caminos(el.getAttribute("d") || "", k)) empujar(T, s.pts, s.cerrado, c); break;
      case "rect": {
        const x = num(el, "x"), y = num(el, "y"), w = num(el, "width"), h = num(el, "height");
        if (w <= 0 || h <= 0) break;
        let rx = parseFloat(el.getAttribute("rx")), ry = parseFloat(el.getAttribute("ry"));
        if (!Number.isFinite(rx)) rx = Number.isFinite(ry) ? ry : 0; if (!Number.isFinite(ry)) ry = rx;
        rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
        if (rx > 0 && ry > 0) {
          const d = `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
          for (const s of caminos(d, k)) empujar(T, s.pts, true, c);
        } else empujar(T, [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], true, c);
        break;
      }
      case "circle": { const r = num(el, "r"); if (r > 0) empujar(T, elipse(num(el, "cx"), num(el, "cy"), r, r, k), true, c, { x: num(el, "cx"), y: num(el, "cy"), d: 2 * r }); break; }
      case "ellipse": { const rx = num(el, "rx"), ry = num(el, "ry"); if (rx > 0 && ry > 0) empujar(T, elipse(num(el, "cx"), num(el, "cy"), rx, ry, k), true, c); break; }
      case "line": empujar(T, [[num(el, "x1"), num(el, "y1")], [num(el, "x2"), num(el, "y2")]], false, c); break;
      case "polyline": case "polygon": {
        const v = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
        const pts = []; for (let j = 0; j + 1 < v.length; j += 2) pts.push([v[j], v[j + 1]]);
        if (tag === "polygon" && pts.length > 2) pts.push(pts[0].slice());
        empujar(T, pts, tag === "polygon", c);
        break;
      }
      case "use": {
        const ref = (el.getAttribute("href") || el.getAttribute("xlink:href") || "").replace(/^#/, "");
        const obj = porId.get(ref);
        if (obj && nivel < 12) {
          const U = mul(T, [1, 0, 0, 1, num(el, "x"), num(el, "y")]);
          if (obj.localName === "symbol") for (const h of obj.children) recorrer(h, U, c, nivel + 1);
          else recorrer(obj, U, c, nivel + 1);
        }
        break;
      }
    }
  }
  for (const h of raiz.children) recorrer(h, M0, null, 1);
  if (textos) avisos.push(`${textos} ${textos === 1 ? "texto no se corta" : "textos no se cortan"}: conviértelos a trayectos en tu programa de dibujo`);
  if (!trazos.length && !avisos.length) avisos.push("El SVG no tiene líneas que cortar");
  return { trazos, avisos };
}
