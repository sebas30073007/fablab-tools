// herramientas.js - la página Configuración: cada herramienta con sus campos y dibujos que
// cambian con los valores (escala fija por herramienta: si la fresa crece, se ve crecer).
//
// Solo contenido y SVG. La vista que lo arma está en vistas.js (config).
// Cada cota lleva data-k = el parámetro que dibuja; al enfocar ese campo se resalta.

import { anchoAislado } from "./cam.js";

const n = (v, d = 2) => (isFinite(v) ? String(+(+v).toFixed(d)) : "—");
const TAN15 = Math.tan((15 * Math.PI) / 180);

// ---------------- Campos ----------------
// [clave, etiqueta, unidad, { paso, min, max, esc }]  esc: lo que se muestra = valor × esc
export const CAMPOS = {
  pistas: [
    ["diam", "Ancho de corte", "mm", { paso: 0.01, min: 0.02 }], ["prof", "Profundidad", "mm", { paso: 0.01, min: 0.01 }],
    ["pasadas", "Pasadas", "", { paso: 1, min: 1 }], ["traslape", "Traslape", "%", { paso: 5, min: 0, max: 90, esc: 100 }],
    ["f", "Avance", "mm/min", { paso: 10, min: 1 }], ["fz", "Bajada", "mm/min", { paso: 10, min: 1 }],
  ],
  hoyos: [
    ["broca", "Broca Ø", "", { opciones: "brocas" }], ["prof", "Profundidad", "mm", { paso: 0.1, min: 0.1 }],
    ["fz", "Bajada", "mm/min", { paso: 10, min: 1 }],
  ],
  contorno: [
    ["diam", "Fresa Ø", "mm", { paso: 0.1, min: 0.1 }], ["prof", "Profundidad", "mm", { paso: 0.05, min: 0.1 }],
    ["pasadas", "Pasadas", "", { paso: 1, min: 1 }], ["puentes", "Puentes", "", { paso: 1, min: 0 }],
    ["anchoPuente", "Ancho puente", "mm", { paso: 0.1, min: 0 }], ["zPuente", "Z puente", "mm", { paso: 0.05 }],
    ["f", "Avance", "mm/min", { paso: 10, min: 1 }], ["fz", "Bajada", "mm/min", { paso: 10, min: 1 }],
  ],
  comun: [
    ["zSeguro", "Z seguro", "mm", { paso: 0.5, min: 0.5 }], ["rpm", "Husillo", "rpm", { paso: 500, min: 0 }], ["espera", "Arranque", "s", { paso: 1, min: 0 }],
  ],
};

export const HERRAMIENTAS = {
  pistas: { t: "Pistas", color: "var(--d-pistas)" },
  hoyos: { t: "Hoyos", color: "var(--d-hoyos)" },
  contorno: { t: "Contorno", color: "var(--d-contorno)" },
  comun: { t: "Husillo y alturas", color: "var(--alloy-light)" },
};

// Lo que hace cada parámetro: sale junto al puntero tras un momento sobre el campo
// (y lo lee el lector de pantalla como descripción del campo)
export const NOTAS = {
  pistas: {
    diam: "Ancho que raya la punta. Si es mayor que la separación entre pistas, se unen.",
    prof: "Cuánto entra la punta bajo el cobre (el cobre mide 0.035 mm).",
    pasadas: "Vueltas alrededor de cada pista, cada una más afuera. Más pasadas, menos hilos de cobre sueltos.",
    traslape: "Cuánto se encima cada pasada sobre la anterior.",
    f: "Velocidad al avanzar cortando.",
    fz: "Velocidad al bajar a cortar.",
  },
  hoyos: {
    broca: "Diámetro de la broca: todos los hoyos del rango salen de este tamaño. Solo perfora hacia abajo; no corta de lado.",
    prof: "Tiene que atravesar la placa y entrar un poco en el MDF.",
    fz: "Velocidad al perforar.",
    min: "Los hoyos del diseño más chicos que esto no se perforan.",
    max: "Los hoyos del diseño más grandes que esto no se perforan (un hoyo grande se hace aparte).",
  },
  contorno: {
    diam: "Diámetro de la fresa de maíz: corta de lado y de punta. Una broca no sirve para el contorno.",
    prof: "Profundidad total: el grosor de la placa y un poco más.",
    pasadas: "La profundidad se reparte en varias bajadas para no forzar la fresa.",
    puentes: "Pestañas que sostienen la placa para que no se suelte al terminar.",
    anchoPuente: "Largo de cada puente a lo largo del corte.",
    zPuente: "Hasta dónde baja en los puentes; lo que queda abajo sostiene la placa.",
    f: "Velocidad al avanzar cortando.",
    fz: "Velocidad al bajar a cortar.",
  },
  comun: {
    zSeguro: "Altura sobre la placa para moverse de un corte a otro sin tocarla.",
    rpm: "Vueltas por minuto de la fresa.",
    espera: "Segundos de espera para que el husillo tome velocidad antes de cortar.",
    climb: "La fresa gira a favor del avance: deja mejor borde en el cobre.",
  },
};

// Brocas para PCB que se consiguen (mm); 3.175 = 1/8"
export const BROCAS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.175];

// Resumen corto de cada herramienta (en la fila de PCB y en su cabecera)
export function resumen(g, P) {
  if (g === "pistas") return `${n(P.diam)} mm · ${P.pasadas}×`;
  if (g === "hoyos") return `Ø${n(P.broca)} mm`;
  if (g === "contorno") return `Ø${n(P.diam)} mm · ${P.puentes} puentes`;
  return `Z ${n(P.zSeguro)} · ${P.rpm} rpm`;
}

// ---------------- Piezas de SVG ----------------
const svg = (w, h, aria, cuerpo) => `<svg class="dib" viewBox="0 0 ${w} ${h}" role="img" aria-label="${aria}">${cuerpo}</svg>`;
// Etiqueta con fondo, para que el número se lea encima de cualquier material
function eti(x, y, txt, ancla = "middle") {
  const w = String(txt).length * 5.9 + 10, h = 15;
  const x0 = ancla === "middle" ? x - w / 2 : ancla === "end" ? x - w + 4 : x - 4;
  return `<rect class="dib__eti" x="${x0}" y="${y - 11}" width="${w}" height="${h}" rx="3"/><text x="${x}" y="${y}" text-anchor="${ancla}">${txt}</text>`;
}
// Cota horizontal (texto arriba) y vertical (texto a la derecha)
function cotaH(x1, x2, y, txt, k, abajo = false) {
  const t = 4;
  return `<g class="cota" data-k="${k}"><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/><line x1="${x1}" y1="${y - t}" x2="${x1}" y2="${y + t}"/><line x1="${x2}" y1="${y - t}" x2="${x2}" y2="${y + t}"/>
    ${eti((x1 + x2) / 2, abajo ? y + 16 : y - 8, txt)}</g>`;
}
function cotaV(x, y1, y2, txt, k, izq = false) {
  const t = 4;
  return `<g class="cota" data-k="${k}"><line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/><line x1="${x - t}" y1="${y1}" x2="${x + t}" y2="${y1}"/><line x1="${x - t}" y1="${y2}" x2="${x + t}" y2="${y2}"/>
    ${eti(izq ? x - 8 : x + 8, (y1 + y2) / 2 + 4, txt, izq ? "end" : "start")}</g>`;
}
const flecha = (x1, y1, x2, y2, txt, k, ancla = "start") => {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 6;
  const p = (s) => `${x2 - L * Math.cos(a + s)},${y2 - L * Math.sin(a + s)}`;
  return `<g class="cota" data-k="${k}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><polyline points="${p(0.5)} ${x2},${y2} ${p(-0.5)}" fill="none"/>
    ${eti(ancla === "end" ? Math.min(x1, x2) - 8 : Math.max(x1, x2) + 8, (y1 + y2) / 2 + 4, txt, ancla)}</g>`;
};
const escala = (x, y, px, txt) => `<g class="dib__escala"><line x1="${x}" y1="${y}" x2="${x + px}" y2="${y}"/><line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}"/><line x1="${x + px}" y1="${y - 3}" x2="${x + px}" y2="${y + 3}"/><text x="${x + px / 2}" y="${y - 6}" text-anchor="middle">${txt}</text></g>`;
const rotulo = (x, y, txt, clase = "") => `<text class="dib__rot ${clase}" x="${x}" y="${y}">${txt}</text>`;

// La herramienta completa, de pie y a su proporción; el círculo marca la punta que se ve de cerca al lado
export function silueta(tipo) {
  const lineas = (y0, y1, paso, inclin) => Array.from({ length: Math.ceil((y1 - y0) / paso) + 2 }, (_, i) => `<line x1="8" y1="${y0 + i * paso}" x2="32" y2="${y0 + i * paso + inclin}"/>`).join("");
  let cuerpo = "";
  if (tipo === "v") cuerpo = `<rect x="12" y="0" width="16" height="78" rx="1.5" class="m-acero"/><polygon points="12,78 28,78 20.6,138 19.4,138" class="m-acero"/>`;
  if (tipo === "broca") cuerpo = `<rect x="13" y="0" width="14" height="58" rx="1.5" class="m-acero"/>
    <clipPath id="sil-broca"><polygon points="14.5,58 25.5,58 25.5,128 20,138 14.5,128"/></clipPath><polygon points="14.5,58 25.5,58 25.5,128 20,138 14.5,128" class="m-acero"/>
    <g clip-path="url(#sil-broca)" class="m-helice">${lineas(50, 140, 8, 9)}</g>`;
  if (tipo === "maiz") cuerpo = `<rect x="12" y="0" width="16" height="70" rx="1.5" class="m-acero"/>
    <clipPath id="sil-maiz"><rect x="13" y="70" width="14" height="68" rx="1"/></clipPath><rect x="13" y="70" width="14" height="68" rx="1" class="m-acero"/>
    <g clip-path="url(#sil-maiz)" class="m-helice">${lineas(56, 140, 5, 14)}${Array.from({ length: 20 }, (_, i) => `<line x1="8" y1="${60 + i * 5 + 14}" x2="32" y2="${60 + i * 5}"/>`).join("")}</g>`;
  return `<svg class="dib dib--sil" viewBox="0 0 40 150" aria-hidden="true">${cuerpo}<line x1="0" y1="138.5" x2="40" y2="138.5" class="dib__ref"/><circle cx="20" cy="134" r="10" class="dib__lupa"/></svg>`;
}
const conSilueta = (tipo, svgLado) => `<div class="herr__fila">${silueta(tipo)}${svgLado}</div>`;

// Placa en corte: cobre, FR4 y MDF de sacrificio. Devuelve el SVG y dónde quedó cada capa.
// El cobre se dibuja igual de grueso en todos los dibujos (a escala no se vería: mide 0.035 mm).
const CU = 6;
function capas(W, ySup, k, grosor, yMax) {
  const cu = CU, yBot = Math.min(yMax, ySup + grosor * k);
  return {
    yBot,
    svg: `<rect x="0" y="${yBot}" width="${W}" height="${yMax - yBot}" class="m-mdf"/>
      <rect x="0" y="${ySup}" width="${W}" height="${yBot - ySup}" class="m-fr4"/>
      <rect x="0" y="${ySup}" width="${W}" height="${cu}" class="m-cobre"/>`,
  };
}

// ======================================================================
// PISTAS
// ======================================================================
export function dibujosPistas(P) {
  return conSilueta("v", cortePistas(P)) + pasadasPistas(P);
}
// De lado: la punta en V de 30° entra «prof» bajo el cobre; el corte mide «diam» en la superficie
function cortePistas(P) {
  const W = 320, H = 150, k = 200, ySup = 64, cx = 170;     // 200 px por mm: la ventana mide 1.6 mm
  const prof = Math.max(0, Math.min(P.prof, 0.4)), yTip = ySup + prof * k;
  const t = Math.max(0.02, P.diam - 2 * P.prof * TAN15) * k;   // punta plana
  const med = (y) => t / 2 + (yTip - y) * TAN15;
  const fresa = `<polygon class="m-acero" data-k="diam" points="${cx - t / 2},${yTip} ${cx + t / 2},${yTip} ${cx + med(0)},0 ${cx - med(0)},0"/>`;
  const ancho = P.diam * k, xd = cx + Math.max(ancho / 2, med(ySup)) + 18;
  const L = capas(W, ySup, k, 1.6, H);
  return svg(W, H, `De lado: la punta en V entra ${n(P.prof)} mm y corta ${n(P.diam)} mm de ancho`, `
    ${L.svg}${fresa}
    ${rotulo(8, ySup - 6, "pista")}${rotulo(8, ySup + 30, "FR4", "dib__rot--claro")}
    ${cotaH(cx - ancho / 2, cx + ancho / 2, ySup - 16, `${n(P.diam)} mm`, "diam")}
    ${prof > 0.004 ? cotaV(xd, ySup, yTip, `${n(P.prof)} mm`, "prof") : ""}
    ${flecha(cx - 52, 8, cx - 52, 36, `${P.fz} mm/min`, "fz", "end")}
    ${escala(W - 112, H - 10, 100, "0.5 mm")}`);
}
// De arriba: la pista y las pasadas, cada una más afuera; lo encimado se ve más oscuro
function pasadasPistas(P) {
  const W = 320, H = 116, y0 = 26, y1 = 86, xP = 64;
  const nP = Math.min(8, Math.max(1, P.pasadas | 0)), paso = P.diam * (1 - P.traslape), ais = anchoAislado({ ...P, pasadas: nP });
  const k = Math.min(150, (W - xP - 40) / Math.max(ais, 0.1));     // fijo mientras quepa: si la fresa crece, se ve crecer
  const cortes = Array.from({ length: nP }, (_, i) => `<rect x="${xP + i * paso * k}" y="${y0}" width="${P.diam * k}" height="${y1 - y0}" class="m-surco"/>`).join("");
  const enc = nP > 1 && P.traslape > 0 ? cotaH(xP + paso * k, xP + P.diam * k, y0 - 10, `${Math.round(P.traslape * 100)} %`, "traslape") : "";
  return svg(W, H, `De arriba: ${nP} pasadas junto a la pista, aíslan ${n(ais)} mm`, `
    <rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" class="m-cobre"/>
    <rect x="0" y="${y0}" width="${xP}" height="${y1 - y0}" class="m-pista"/>
    ${cortes}
    ${rotulo(10, (y0 + y1) / 2 + 4, "pista")}
    ${enc}
    ${flecha(xP + (P.diam * k) / 2, y1 - 8, xP + (P.diam * k) / 2, y0 + 10, `${P.f} mm/min`, "f")}
    ${cotaH(xP, xP + ais * k, y1 + 12, `${nP} ${nP > 1 ? "pasadas" : "pasada"} · aísla ${n(ais)} mm`, "pasadas", true)}`);
}

// ======================================================================
// HOYOS
// ======================================================================
export function dibujosHoyos(P, grosor) {
  const W = 320, H = 196, k = 56, ySup = 40, cx = 132;       // 56 px por mm: la ventana mide 5.7 mm
  const d = P.broca, w = d * k, punta = 0.3 * d;              // punta de 118°
  const yTip = Math.min(H - 4, ySup + P.prof * k), yCono = yTip - punta * k;
  const L = capas(W, ySup, k, grosor, H);
  const id = "cl-broca";
  const helice = Array.from({ length: 16 }, (_, i) => `<line x1="${cx - w}" y1="${i * 16 - 30}" x2="${cx + w}" y2="${i * 16 - 30 + w * 0.9}"/>`).join("");
  const broca = `<g data-k="broca"><clipPath id="${id}"><polygon points="${cx - w / 2},0 ${cx + w / 2},0 ${cx + w / 2},${yCono} ${cx},${yTip} ${cx - w / 2},${yCono}"/></clipPath>
    <polygon class="m-acero" points="${cx - w / 2},0 ${cx + w / 2},0 ${cx + w / 2},${yCono} ${cx},${yTip} ${cx - w / 2},${yCono}"/>
    <g clip-path="url(#${id})" class="m-helice">${helice}</g></g>`;
  const xd = cx + w / 2 + 16;
  return conSilueta("broca", svg(W, H, `De lado: broca de ${n(d)} mm que baja ${n(P.prof)} mm en una placa de ${n(grosor)} mm`, `
    ${L.svg}${broca}
    ${rotulo(8, ySup + 26, `FR4 ${n(grosor)} mm`, "dib__rot--claro")}${rotulo(8, L.yBot + 18, "MDF")}
    ${cotaH(cx - w / 2, cx + w / 2, 16, `Ø ${n(d)} mm`, "broca")}
    ${cotaV(xd, ySup, yTip, `${n(P.prof)} mm`, "prof")}
    ${flecha(cx - w / 2 - 36, 4, cx - w / 2 - 36, 30, `${P.fz} mm/min`, "fz", "end")}
    ${escala(14, H - 8, k, "1 mm")}`));
}
// Atraviesa si la punta sale por abajo (la salida es algo más chica que la broca, como en los .nc que ya funcionan)
export const atraviesa = (P, grosor) => P.prof > grosor + 0.05;

// ======================================================================
// CONTORNO
// ======================================================================
export function dibujosContorno(P, grosor, caja) {
  return conSilueta("maiz", corteContorno(P, grosor)) + puentesContorno(P, grosor, caja);
}
// De lado: la fresa de maíz en su última bajada; las líneas marcan cada pasada
function corteContorno(P, grosor) {
  const W = 320, H = 180, k = 56, ySup = 40, cx = 132;
  const w = P.diam * k, yTip = Math.min(H - 4, ySup + P.prof * k), nP = Math.max(1, P.pasadas | 0);
  const L = capas(W, ySup, k, grosor, H);
  const id = "cl-maiz";
  const red = [];
  for (let i = -20; i < 40; i++) {
    red.push(`<line x1="${cx - w / 2 + i * 6}" y1="0" x2="${cx - w / 2 + i * 6 + yTip}" y2="${yTip}"/>`);
    red.push(`<line x1="${cx - w / 2 + i * 6}" y1="0" x2="${cx - w / 2 + i * 6 - yTip}" y2="${yTip}"/>`);
  }
  const niveles = Array.from({ length: nP }, (_, i) => {
    const y = ySup + ((P.prof * (i + 1)) / nP) * k, ya = ySup + ((P.prof * i) / nP) * k;
    return `${i < nP - 1 ? `<line class="dib__nivel" x1="${cx - w / 2 - 8}" y1="${y}" x2="${cx + w / 2 + 8}" y2="${y}"/>` : ""}
      ${(y - ya) > 9 ? `<text class="dib__num" x="${cx - w / 2 - 12}" y="${(y + ya) / 2 + 4}" text-anchor="end">${i + 1}</text>` : ""}`;
  }).join("");
  const fresa = `<g data-k="diam"><clipPath id="${id}"><rect x="${cx - w / 2}" y="0" width="${w}" height="${yTip}" rx="1.5"/></clipPath>
    <rect class="m-acero" x="${cx - w / 2}" y="0" width="${w}" height="${yTip}" rx="1.5"/>
    <g clip-path="url(#${id})" class="m-helice">${red.join("")}</g></g>`;
  return svg(W, H, `De lado: fresa de ${n(P.diam)} mm, ${nP} bajadas hasta ${n(P.prof)} mm`, `
    ${L.svg}${fresa}<g class="cota" data-k="pasadas">${niveles}</g>
    ${rotulo(8, ySup + 26, "FR4", "dib__rot--claro")}${rotulo(8, L.yBot + 18, "MDF")}
    ${cotaH(cx - w / 2, cx + w / 2, 16, `Ø ${n(P.diam)} mm`, "diam")}
    ${cotaV(cx + w / 2 + 16, ySup, yTip, `${n(P.prof)} mm`, "prof")}
    ${escala(W - 70, H - 8, k, "1 mm")}`);
}
// Izquierda, la placa desde arriba con sus puentes repartidos; derecha, uno de cerca a lo largo del
// corte: el canal llega hasta «prof» salvo en el puente, que se queda en «zPuente»
function puentesContorno(P, grosor, caja) {
  const W = 320, H = 128;
  const a = caja?.ancho || 60, b = caja?.alto || 40, kt = Math.min(92 / a, 92 / b);
  const w = a * kt, h = b * kt, x0 = 8 + (100 - w) / 2, y0 = 18 + (100 - h) / 2, per = 2 * (w + h);
  const pto = (s) => { s = ((s % per) + per) % per; if (s < w) return [x0 + s, y0 + h, 0]; s -= w; if (s < h) return [x0 + w, y0 + h - s, 1]; s -= h; if (s < w) return [x0 + w - s, y0, 0]; s -= w; return [x0, y0 + s, 1]; };
  const np = Math.max(0, P.puentes | 0), lp = Math.max(4, P.anchoPuente * kt);
  const marcas = Array.from({ length: np }, (_, i) => { const [x, y, v] = pto(((i + 0.5) * per) / np); return v ? `<rect x="${x - 3.5}" y="${y - lp / 2}" width="7" height="${lp}" class="m-puente"/>` : `<rect x="${x - lp / 2}" y="${y - 3.5}" width="${lp}" height="7" class="m-puente"/>`; }).join("");
  const [lx, ly] = np ? pto((0.5 * per) / np) : [0, 0];
  // De cerca
  const X0 = 132, X1 = 314, kx = 20, ky = 34, ySup = 36, xc = (X0 + X1) / 2;
  const yBot = ySup + grosor * ky, yMdf = H - 10, yFin = Math.min(yMdf - 2, ySup + P.prof * ky), zp = Math.abs(P.zPuente);
  const yP = Math.min(yFin, ySup + zp * ky), aw = Math.min(X1 - X0 - 20, Math.max(3, P.anchoPuente * kx)), bx = xc - aw / 2, queda = grosor - zp;
  const canal = np > 0
    ? `<polygon class="m-hueco" points="${X0},${ySup} ${X1},${ySup} ${X1},${yFin} ${bx + aw},${yFin} ${bx + aw},${yP} ${bx},${yP} ${bx},${yFin} ${X0},${yFin}"/>`
    : `<rect class="m-hueco" x="${X0}" y="${ySup}" width="${X1 - X0}" height="${yFin - ySup}"/>`;
  return svg(W, H, np > 0 ? `${np} puentes; cada uno de ${n(P.anchoPuente)} mm deja ${n(Math.max(0, queda))} mm de placa` : "Sin puentes", `
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="2" class="m-placa"/>
    <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="2" class="m-contorno"/>
    <g class="cota" data-k="puentes">${marcas}${eti(x0 + w / 2, y0 + h / 2 + 4, `${np} ${np === 1 ? "puente" : "puentes"}`)}</g>
    ${np ? `<circle cx="${lx}" cy="${ly}" r="9" class="dib__lupa"/><line x1="${lx + 9}" y1="${ly}" x2="${X0 - 2}" y2="${(ySup + yMdf) / 2}" class="dib__ref"/>` : ""}
    <rect x="${X0}" y="${yBot}" width="${X1 - X0}" height="${yMdf - yBot}" class="m-mdf"/>
    <rect x="${X0}" y="${ySup}" width="${X1 - X0}" height="${yBot - ySup}" class="m-fr4"/>
    <rect x="${X0}" y="${ySup}" width="${X1 - X0}" height="${CU}" class="m-cobre"/>
    ${canal}
    ${np > 0 ? `${cotaH(bx, bx + aw, ySup - 10, `${n(P.anchoPuente)} mm`, "anchoPuente")}
      ${cotaV(bx - 9, ySup, yP, `Z ${n(P.zPuente)}`, "zPuente", true)}
      ${queda > 0.01 ? cotaV(bx + aw + 9, yP, yBot, `${n(queda)} mm`, "zPuente") : ""}` : ""}`);
}

// ======================================================================
// HUSILLO Y ALTURAS
// ======================================================================
export function dibujosComun(P) {
  const W = 320, H = 116, k = 4, yPl = 96, cx = 100;
  const yTip = yPl - Math.min(P.zSeguro, 20) * k;
  return svg(W, H, `La fresa se mueve ${n(P.zSeguro)} mm sobre la placa, a ${P.rpm} rpm`, `
    <rect x="0" y="${yPl}" width="${W}" height="14" class="m-fr4"/><rect x="0" y="${yPl}" width="${W}" height="${CU}" class="m-cobre"/>
    <rect x="${cx - 6}" y="0" width="12" height="${yTip}" rx="2" class="m-acero"/>
    <g class="cota" data-k="rpm"><path d="M ${cx - 14} 14 A 14 6 0 1 0 ${cx + 14} 14" fill="none"/><text x="${cx + 22}" y="18">${P.rpm} rpm</text></g>
    ${cotaV(cx - 22, yTip, yPl, `${n(P.zSeguro)} mm`, "zSeguro", true)}
    ${flecha(cx + 14, yTip - 6, cx + 110, yTip - 6, "al siguiente corte", "zSeguro")}`);
}
