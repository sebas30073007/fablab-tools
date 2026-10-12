// gerber.js - leer lo que exporta KiCad para fabricar: Gerber (RS-274X), Excellon y .gbrjob.
//
//   clasificar(nombre, texto) → "cobre-sup" | "cobre-inf" | "contorno" | "taladro" | "job" | "nc" | "map" | "otro"
//   leerGerber(texto)         → { items, aperturas, caja }   (mm, Y hacia arriba como en el diseño)
//   leerTaladros(texto)       → { hoyos: [{x, y, d}], ranuras: n }
//   dibujarGerber(ctx, g, T)  → pinta en un canvas 2D (blanco = material) con T(x, y) → [px, py] y s (px/mm)
//   lazos(g)                  → contornos cerrados de un Gerber de perfil (Edge.Cuts)

// ---------------- Clasificación ----------------
export function clasificar(nombre, texto) {
  const n = nombre.toLowerCase();
  if (n.endsWith(".gbrjob")) return "job";
  if (/\.(nc|gcode|ngc|tap|cnc)$/.test(n)) return "nc";
  if (n.endsWith(".map")) return "map";
  if (/\.(drl|xln|exc)$/.test(n) || /^\s*M48/m.test(texto.slice(0, 200))) return "taladro";
  const ff = texto.match(/%TF\.FileFunction,([^*]+)\*%/)?.[1] || texto.match(/G04 #@! TF\.FileFunction,([^*]+)\*/)?.[1] || "";
  if (/^Copper/i.test(ff)) return /Bot/i.test(ff) ? "cobre-inf" : "cobre-sup";
  if (/^Profile/i.test(ff)) return "contorno";
  if (ff) return "otro";
  if (/f[._]cu|\.gtl$/.test(n)) return "cobre-sup";
  if (/b[._]cu|\.gbl$/.test(n)) return "cobre-inf";
  if (/edge[._]cuts|\.gko$|\.gm1$/.test(n)) return "contorno";
  if (/\.(gbr|ger|gtl|gbl)$/.test(n) || texto.includes("%FS")) return "otro";
  // G-code sin extensión conocida
  if (/^\s*(G0?0|G0?1|G21|G90)\b/m.test(texto)) return "nc";
  return "otro";
}

export function leerJob(texto) {
  try {
    const j = JSON.parse(texto);
    return {
      nombre: j.GeneralSpecs?.ProjectId?.Name || "",
      tam: j.GeneralSpecs?.Size ? { x: j.GeneralSpecs.Size.X, y: j.GeneralSpecs.Size.Y } : null,
      grosor: j.GeneralSpecs?.BoardThickness ?? 1.6,
      capas: j.GeneralSpecs?.LayerNumber ?? null,
      reglas: j.DesignRules?.[0] || null,
      archivos: (j.FilesAttributes || []).map((f) => ({ ruta: f.Path, funcion: f.FileFunction })),
    };
  } catch (_) { return null; }
}

// ---------------- Expresiones de macros ----------------
function evaluar(expr, vars) {
  const s = expr.replace(/\$(\d+)/g, (_, k) => `(${vars[k] ?? 0})`).replace(/x/gi, "*");
  if (!/^[\d.+\-*/() eE]*$/.test(s)) return 0;
  try { return Function(`"use strict";return (${s || 0});`)(); } catch (_) { return 0; }
}

// ---------------- Gerber ----------------
export function leerGerber(texto) {
  const g = { items: [], aperturas: {}, macros: {}, caja: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } };
  let dec = [4, 6], esc = 1, x = 0, y = 0, modo = 1, ap = null, pol = "D", region = null, contorno = null;
  let multi = true;
  const coord = (s, eje) => {
    if (s.includes(".")) return +s * esc;
    const d = eje === "x" ? dec[0] : dec[1];
    return (parseInt(s, 10) / 10 ** d) * esc;
  };
  const crecer = (px, py, m = 0) => {
    const c = g.caja; c.x0 = Math.min(c.x0, px - m); c.y0 = Math.min(c.y0, py - m); c.x1 = Math.max(c.x1, px + m); c.y1 = Math.max(c.y1, py + m);
  };
  const radioAp = () => {
    const a = g.aperturas[ap]; if (!a) return 0;
    if (a.tipo === "C") return a.p[0] / 2;
    if (a.tipo === "R" || a.tipo === "O") return Math.hypot(a.p[0], a.p[1]) / 2;
    if (a.tipo === "P") return a.p[0] / 2;
    return a.r ?? 1;
  };

  // Parte el texto en sentencias; los bloques %…% son parámetros extendidos
  const bloques = [];
  const re = /%([^%]*)%|([^%*]*)\*/g;
  let m;
  while ((m = re.exec(texto))) {
    if (m[1] !== undefined) bloques.push({ ext: true, s: m[1].trim() });
    else if (m[2].trim()) bloques.push({ ext: false, s: m[2].trim() });
  }

  for (const b of bloques) {
    if (b.ext) {
      const s = b.s;
      if (s.startsWith("FS")) { const f = s.match(/X(\d)(\d)Y(\d)(\d)/); if (f) dec = [+f[2], +f[4]]; }
      else if (s.startsWith("MO")) esc = s.includes("IN") ? 25.4 : 1;
      else if (s.startsWith("LP")) pol = s[2];
      else if (s.startsWith("AM")) {
        const partes = s.slice(2).split("*").map((t) => t.trim()).filter(Boolean);
        const nombre = partes.shift();
        g.macros[nombre] = partes.filter((p) => !/^0\s/.test(p) && p !== "0");
      } else if (s.startsWith("AD")) {
        const a = s.match(/^ADD(\d+)([A-Za-z_$][\w.$-]*)(?:,(.*))?\*?$/);
        if (a) {
          const p = (a[3] || "").replace(/\*$/, "").split("X").filter((t) => t !== "").map(Number);
          const tipo = a[2];
          const ap_ = { tipo, p: p.map((v) => v * esc) };
          if (!["C", "R", "O", "P"].includes(tipo)) { ap_.tipo = "M"; ap_.macro = tipo; ap_.vars = Object.fromEntries(p.map((v, i) => [i + 1, v])); }
          if (tipo === "P") ap_.p = [p[0] * esc, p[1], p[2] || 0];
          g.aperturas["D" + a[1]] = ap_;
          if (ap_.tipo === "M") ap_.prims = expandirMacro(g.macros[tipo] || [], ap_.vars, esc);
          if (ap_.prims) ap_.r = ap_.prims.reduce((r, q) => Math.max(r, q.r || 0), 0);
        }
      }
      continue;
    }
    // Sentencias de función: pueden traer G, coordenadas y D en una sola
    let s = b.s;
    if (/^G0?4/.test(s) || s.startsWith("M02")) continue;
    if (s === "G36") { region = []; contorno = null; continue; }
    if (s === "G37") { if (contorno?.length > 2) region.push(contorno); if (region?.length) { g.items.push({ tipo: "region", contornos: region, pol }); } region = null; contorno = null; continue; }
    if (s === "G74") { multi = false; continue; }
    if (s === "G75") { multi = true; continue; }
    const gm = s.match(/^G0?([123])(?!\d)/);
    if (gm) { modo = +gm[1]; s = s.slice(gm[0].length); if (!s) continue; }
    const sel = s.match(/^(?:G54)?D(\d+)$/);
    if (sel && +sel[1] >= 10) { ap = "D" + sel[1]; continue; }
    const c = s.match(/^(?:X([-+]?[\d.]+))?(?:Y([-+]?[\d.]+))?(?:I([-+]?[\d.]+))?(?:J([-+]?[\d.]+))?D0?([123])$/);
    if (!c) continue;
    const nx = c[1] !== undefined ? coord(c[1], "x") : x;
    const ny = c[2] !== undefined ? coord(c[2], "y") : y;
    const op = +c[5];
    if (op === 2) {
      if (region) { if (contorno?.length > 2) region.push(contorno); contorno = [[nx, ny]]; }
    } else if (op === 3) {
      if (!region) { g.items.push({ tipo: "flash", ap, x: nx, y: ny, pol }); crecer(nx, ny, radioAp()); }
    } else {
      let pts;
      if (modo === 1) pts = [[nx, ny]];
      else {
        const i = c[3] !== undefined ? coord(c[3], "x") : 0, j = c[4] !== undefined ? coord(c[4], "y") : 0;
        pts = arco(x, y, nx, ny, i, j, modo === 2, multi);
      }
      if (region) {
        if (!contorno) contorno = [[x, y]];
        contorno.push(...pts);
        pts.forEach(([px, py]) => crecer(px, py));
      } else {
        const ult = g.items[g.items.length - 1];
        // Une trazos consecutivos con la misma apertura en una polilínea
        if (ult?.tipo === "trazo" && ult.ap === ap && ult.pol === pol && ult.fin[0] === x && ult.fin[1] === y) ult.puntos.push(...pts);
        else g.items.push({ tipo: "trazo", ap, pol, puntos: [[x, y], ...pts] });
        g.items[g.items.length - 1].fin = [nx, ny];
        const r = radioAp();
        crecer(x, y, r); pts.forEach(([px, py]) => crecer(px, py, r));
      }
    }
    x = nx; y = ny;
  }
  return g;
}

function arco(x0, y0, x1, y1, i, j, cw, multi) {
  let cx = x0 + i, cy = y0 + j;
  if (!multi) {
    // Cuadrante único: los signos de I/J no vienen; se elige el centro que mejor cuadra
    let mejor = null;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ccx = x0 + sx * Math.abs(i), ccy = y0 + sy * Math.abs(j);
      const e = Math.abs(Math.hypot(x1 - ccx, y1 - ccy) - Math.hypot(x0 - ccx, y0 - ccy));
      if (!mejor || e < mejor.e) mejor = { e, ccx, ccy };
    }
    cx = mejor.ccx; cy = mejor.ccy;
  }
  const r = Math.hypot(x0 - cx, y0 - cy);
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  let da = Math.atan2(y1 - cy, x1 - cx) - a0;
  if (cw && da >= 0) da -= 2 * Math.PI;
  if (!cw && da <= 0) da += 2 * Math.PI;
  if (Math.abs(x0 - x1) < 1e-9 && Math.abs(y0 - y1) < 1e-9) da = cw ? -2 * Math.PI : 2 * Math.PI;
  const n = Math.max(2, Math.ceil((Math.abs(da) * r) / 0.05));
  const pts = [];
  for (let k = 1; k <= n; k++) { const a = a0 + (da * k) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  pts[pts.length - 1] = [x1, y1];
  return pts;
}

// Primitivas de macro → formas en mm relativas al centro del flash
function expandirMacro(lineas, varsIni, esc) {
  const vars = { ...varsIni };
  const prims = [];
  const rot = (px, py, a) => { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180); return [px * c - py * s, px * s + py * c]; };
  for (const l of lineas) {
    const def = l.match(/^\$(\d+)=(.+)$/);
    if (def) { vars[def[1]] = evaluar(def[2], vars); continue; }
    const v = l.split(",").map((t) => evaluar(t.trim(), vars));
    const cod = v[0], exp = v[1];
    if (cod === 1) {
      const [cx, cy] = rot(v[3] * esc, v[4] * esc, v[5] || 0);
      prims.push({ forma: "circulo", exp, d: v[2] * esc, cx, cy, r: Math.hypot(cx, cy) + (v[2] * esc) / 2 });
    } else if (cod === 20 || cod === 2) {
      const w = v[2] * esc, a = rot(v[3] * esc, v[4] * esc, v[7] || 0), b = rot(v[5] * esc, v[6] * esc, v[7] || 0);
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * (w / 2), ny = (dx / L) * (w / 2);
      const poli = [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]];
      prims.push({ forma: "poli", exp, poli, r: Math.max(...poli.map((p) => Math.hypot(...p))) });
    } else if (cod === 21) {
      const w = v[2] * esc, h = v[3] * esc, cx = v[4] * esc, cy = v[5] * esc, a = v[6] || 0;
      const poli = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => rot(px + cx, py + cy, a));
      prims.push({ forma: "poli", exp, poli, r: Math.max(...poli.map((p) => Math.hypot(...p))) });
    } else if (cod === 4) {
      const n = v[2], poli = [];
      for (let k = 0; k <= n; k++) poli.push(rot(v[3 + 2 * k] * esc, v[4 + 2 * k] * esc, v[5 + 2 * n] || 0));
      prims.push({ forma: "poli", exp, poli, r: Math.max(...poli.map((p) => Math.hypot(...p))) });
    } else if (cod === 5) {
      const n = v[2], cx = v[3] * esc, cy = v[4] * esc, R = (v[5] * esc) / 2, a = v[6] || 0, poli = [];
      for (let k = 0; k < n; k++) poli.push(rot(cx + R * Math.cos((2 * Math.PI * k) / n), cy + R * Math.sin((2 * Math.PI * k) / n), a));
      prims.push({ forma: "poli", exp, poli, r: Math.hypot(cx, cy) + R });
    } else if (cod === 7) {
      const [cx, cy] = [v[1] * esc, v[2] * esc];
      prims.push({ forma: "circulo", exp: 1, d: v[3] * esc, cx, cy, r: v[3] * esc / 2 });
      prims.push({ forma: "circulo", exp: 0, d: v[4] * esc, cx, cy, r: 0 });
    }
  }
  return prims;
}

// ---------------- Dibujo ----------------
// T(x, y) → [px, py]; s = px por mm. blanco = cobre/material (polaridad oscura de Gerber).
export function dibujarGerber(ctx, g, T, s) {
  const color = (pol, exp = 1) => (pol === "C" || exp === 0 ? "#000" : "#fff");
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const it of g.items) {
    if (it.tipo === "region") {
      ctx.beginPath();
      for (const c of it.contornos) c.forEach(([x, y], k) => { const [px, py] = T(x, y); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.fillStyle = color(it.pol); ctx.fill("evenodd");
      continue;
    }
    const a = g.aperturas[it.ap];
    if (!a) continue;
    if (it.tipo === "trazo") {
      const w = a.tipo === "C" ? a.p[0] : a.tipo === "R" || a.tipo === "O" ? Math.min(a.p[0], a.p[1]) : (a.r || 0.1) * 2;
      ctx.beginPath();
      it.puntos.forEach(([x, y], k) => { const [px, py] = T(x, y); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.strokeStyle = color(it.pol); ctx.lineWidth = Math.max(1, w * s); ctx.stroke();
      continue;
    }
    // flash
    const [cx, cy] = T(it.x, it.y);
    ctx.fillStyle = color(it.pol);
    if (a.tipo === "C") { ctx.beginPath(); ctx.arc(cx, cy, (a.p[0] / 2) * s, 0, 2 * Math.PI); ctx.fill(); }
    else if (a.tipo === "R") ctx.fillRect(cx - (a.p[0] / 2) * s, cy - (a.p[1] / 2) * s, a.p[0] * s, a.p[1] * s);
    else if (a.tipo === "O") {
      const w = a.p[0] * s, h = a.p[1] * s, r = Math.min(w, h) / 2;
      ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r); ctx.fill();
    } else if (a.tipo === "P") {
      const [d, n, rot] = a.p; ctx.beginPath();
      for (let k = 0; k < n; k++) { const ang = (rot * Math.PI) / 180 + (2 * Math.PI * k) / n; const px = cx + (d / 2) * s * Math.cos(ang), py = cy - (d / 2) * s * Math.sin(ang); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.fill();
    } else if (a.tipo === "M") {
      for (const p of a.prims || []) {
        ctx.fillStyle = color(it.pol, p.exp);
        ctx.beginPath();
        if (p.forma === "circulo") ctx.arc(cx + p.cx * s, cy - p.cy * s, (p.d / 2) * s, 0, 2 * Math.PI);
        else p.poli.forEach(([px, py], k) => (k ? ctx.lineTo(cx + px * s, cy - py * s) : ctx.moveTo(cx + px * s, cy - py * s)));
        ctx.fill();
      }
    }
  }
}

// ---------------- Contorno: segmentos sueltos → lazos cerrados ----------------
export function lazos(g, tol = 0.02) {
  const segs = [];
  for (const it of g.items) {
    if (it.tipo === "trazo") for (let k = 1; k < it.puntos.length; k++) segs.push([it.puntos[k - 1], it.puntos[k]]);
    if (it.tipo === "region") for (const c of it.contornos) for (let k = 1; k < c.length; k++) segs.push([c[k - 1], c[k]]);
  }
  const clave = ([x, y]) => `${Math.round(x / tol)},${Math.round(y / tol)}`;
  const porPunto = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = clave(p); if (!porPunto.has(k)) porPunto.set(k, []); porPunto.get(k).push(i); } });
  const usado = new Uint8Array(segs.length);
  const res = [];
  for (let i = 0; i < segs.length; i++) {
    if (usado[i]) continue;
    usado[i] = 1;
    const lazo = [segs[i][0], segs[i][1]];
    let extremo = segs[i][1];
    for (;;) {
      const cand = (porPunto.get(clave(extremo)) || []).find((j) => !usado[j]);
      if (cand === undefined) break;
      usado[cand] = 1;
      const [a, b] = segs[cand];
      extremo = clave(a) === clave(extremo) ? b : a;
      lazo.push(extremo);
    }
    if (lazo.length > 2) res.push(lazo);
  }
  return res;
}

// ---------------- Excellon ----------------
export function leerTaladros(texto) {
  let esc = 1, decimales = null, tool = null, x = 0, y = 0, ranuras = 0;
  const tools = {}, hoyos = [];
  const num = (s) => {
    if (s.includes(".")) return +s * esc;
    const d = decimales ?? (esc === 1 ? 3 : 4);
    return (parseInt(s, 10) / 10 ** d) * esc;
  };
  for (const cruda of texto.split(/\r?\n/)) {
    const l = cruda.trim();
    if (!l || l.startsWith(";")) continue;
    if (/^METRIC/.test(l)) { esc = 1; const z = l.match(/0+\.(0+)/); if (z) decimales = z[1].length; continue; }
    if (/^INCH/.test(l)) { esc = 25.4; const z = l.match(/0+\.(0+)/); if (z) decimales = z[1].length; continue; }
    const td = l.match(/^T(\d+)(?:F[\d.]+|S[\d.]+)*C([\d.]+)/);
    if (td) { tools[+td[1]] = +td[2] * esc; continue; }
    const ts = l.match(/^T(\d+)$/);
    if (ts) { tool = +ts[1]; continue; }
    if (/G85/.test(l)) { ranuras++; continue; }
    const c = l.match(/^(?:G0[01])?(?:X([-+]?[\d.]+))?(?:Y([-+]?[\d.]+))?$/);
    if (c && (c[1] !== undefined || c[2] !== undefined) && tool !== null) {
      if (c[1] !== undefined) x = num(c[1]);
      if (c[2] !== undefined) y = num(c[2]);
      if (!/^G00/.test(l)) hoyos.push({ x, y, d: tools[tool] ?? 0 });
    }
  }
  return { hoyos, ranuras };
}
