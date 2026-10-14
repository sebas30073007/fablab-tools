// herramientas.js - la página Configuración: cada herramienta con sus campos y dibujos que
// cambian con los valores (escala fija por herramienta: si la fresa crece, se ve crecer).
//
// Solo contenido y SVG. La vista que lo arma está en vistas.js (config).
// Cada cota lleva data-k = el parámetro que dibuja; al enfocar ese campo se resalta.

import { anchoAislado, anchoV } from "./cam.js";

const n = (v, d = 2) => (isFinite(v) ? String(+(+v).toFixed(d)) : "—");

// ---------------- Campos ----------------
// [clave, etiqueta, unidad, { paso, min, max, esc }]  esc: lo que se muestra = valor × esc
export const CAMPOS = {
  pistas: [
    ["punta", "Punta", "mm", { paso: 0.05, min: 0.01 }], ["angulo", "Ángulo", "°", { paso: 5, min: 5, max: 90 }],
    ["prof", "Profundidad", "mm", { paso: 0.01, min: 0.01 }],
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
    ["acabado", "Acabado", "mm", { paso: 0.05, min: 0 }],
  ],
  grabado: [
    ["punta", "Punta", "mm", { paso: 0.05, min: 0.01 }], ["angulo", "Ángulo", "°", { paso: 5, min: 5, max: 90 }],
    ["prof", "Profundidad", "mm", { paso: 0.05, min: 0.01 }], ["pasadas", "Pasadas", "", { paso: 1, min: 1 }],
    ["f", "Avance", "mm/min", { paso: 10, min: 1 }], ["fz", "Bajada", "mm/min", { paso: 10, min: 1 }],
  ],
  vaciado: [
    ["prof", "Profundidad", "mm", { paso: 0.1, min: 0.05 }], ["pasadas", "Pasadas", "", { paso: 1, min: 1 }],
    ["traslape", "Traslape", "%", { paso: 5, min: 50, max: 90, esc: 100 }],
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
  grabado: { t: "Grabado", color: "var(--d-grabado)" },
  vaciado: { t: "Vaciado", color: "var(--d-vaciado)" },
  comun: { t: "Husillo y alturas", color: "var(--alloy-light)" },
};

// Lo que hace cada parámetro: sale junto al puntero tras un momento sobre el campo
// (y lo lee el lector de pantalla como descripción del campo)
export const NOTAS = {
  pistas: {
    punta: "Ancho de la punta plana de la V; viene en la caja o grabado en la fresa (por ejemplo, 20° 0.1 mm).",
    angulo: "Ángulo de la V. Con la profundidad decide el ancho que raya en el cobre.",
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
    diam: "Diámetro de la fresa de maíz: corta de lado y de punta. Una broca no sirve para el contorno. El vaciado usa la misma.",
    prof: "Profundidad total: el grosor del material y un poco más. Sigue al grosor cuando eliges el material.",
    pasadas: "La profundidad se reparte en varias bajadas para no forzar la fresa.",
    puentes: "Pestañas que sostienen la placa para que no se suelte al terminar.",
    anchoPuente: "Largo de cada puente a lo largo del corte.",
    zPuente: "Hasta dónde baja en los puentes; lo que queda abajo sostiene la placa.",
    f: "Velocidad al avanzar cortando.",
    fz: "Velocidad al bajar a cortar.",
    acabado: "Lo que el desbaste deja junto a la pieza para una última vuelta fina a toda profundidad: borde más limpio y medida más exacta. 0 = sin acabado.",
  },
  grabado: {
    punta: "Ancho de la punta plana de la fresa en V.",
    angulo: "Ángulo de la V. Con la profundidad decide el ancho de la línea grabada.",
    prof: "Cuánto entra la punta en el material.",
    pasadas: "La profundidad se reparte en varias bajadas.",
    f: "Velocidad al avanzar grabando.",
    fz: "Velocidad al bajar.",
  },
  vaciado: {
    prof: "Hasta dónde se rebaja la zona, desde la superficie.",
    pasadas: "La profundidad se reparte en varias bajadas para no forzar la fresa.",
    traslape: "Cuánto se encima cada vuelta sobre la anterior. Desde 50 % no quedan crestas sin cortar.",
    f: "Velocidad al avanzar cortando.",
    fz: "Velocidad al bajar a cortar.",
  },
  comun: {
    zSeguro: "Altura sobre la placa para moverse de un corte a otro sin tocarla.",
    rpm: "Vueltas por minuto de la fresa.",
    espera: "Segundos de espera para que el husillo tome velocidad antes de cortar.",
    climb: "Concordancia: la fresa gira a favor del avance; se calienta menos y deja mejor borde en cobre y acrílico. Sin marcar (convencional): en madera o MDF evita que la fresa jale hacia el material.",
  },
};

// ---------------- Rangos seguros ----------------
// Fuera de estos valores la app no genera (salvo que en Avanzado se acepte a propósito): es lo que
// rompe fresas, raya el MDF de más o se come las pistas. g → k → (valor, grupo, grosor) → aviso o null.
const fuera = (v, a, b, txt) => (v < a - 1e-9 || v > b + 1e-9 ? txt : null);
export const RANGO = {
  pistas: {
    prof: (v, Q) => v > 0.2 ? `${n(v)} mm es demasiado: el surco mide ${n(anchoV({ ...Q, prof: v }))} mm y se come las pistas. Usa 0.05 a 0.2 mm.`
      : fuera(v, 0.03, 0.2, `Con ${n(v)} mm la punta apenas raya y deja cobre. Usa 0.05 a 0.2 mm.`),
    pasadas: (v) => fuera(v, 1, 6, "Usa de 1 a 6 pasadas."),
    punta: (v) => fuera(v, 0.05, 0.5, "La punta de una fresa en V mide de 0.05 a 0.5 mm."),
    angulo: (v) => fuera(v, 10, 90, "El ángulo de una fresa en V va de 10° a 90°."),
    f: (v) => fuera(v, 30, 600, "Avance seguro: 30 a 600 mm/min."),
    fz: (v) => fuera(v, 10, 300, "Bajada segura: 10 a 300 mm/min."),
  },
  hoyos: {
    prof: (v, Q, g) => fuera(v, g + 0.05, g + 0.8, v > g + 0.8 ? `Entra ${n(v - g)} mm en el MDF: con ${n(g + 0.2)} mm basta.` : null),
    fz: (v) => fuera(v, 10, 200, "Bajada segura: 10 a 200 mm/min."),
  },
  contorno: {
    prof: (v, Q, g) => fuera(v, g, g + 0.8, v > g + 0.8 ? `Entra ${n(v - g)} mm en el MDF: con ${n(g + 0.25)} mm basta.` : null),
    pasadas: (v, Q) => Q.prof / v > 0.8 + 1e-9 ? `Cada bajada sería de ${n(Q.prof / v)} mm y fuerza la fresa: usa ${Math.ceil(Q.prof / 0.5)} pasadas o más.` : fuera(v, 1, 30, "Usa de 1 a 30 pasadas."),
    diam: (v) => fuera(v, 0.5, 3.175, "La fresa de maíz va de 0.5 a 3.175 mm."),
    f: (v) => fuera(v, 30, 800, "Avance seguro: 30 a 800 mm/min."),
    fz: (v) => fuera(v, 10, 300, "Bajada segura: 10 a 300 mm/min."),
  },
  grabado: {
    prof: (v) => fuera(v, 0.02, 1, "Usa 0.02 a 1 mm."),
    f: (v) => fuera(v, 30, 800, "Avance seguro: 30 a 800 mm/min."),
  },
  vaciado: {
    pasadas: (v, Q) => (Q.prof / v > 1 + 1e-9 ? `Cada bajada sería de ${n(Q.prof / v)} mm: usa ${Math.ceil(Q.prof)} pasadas o más.` : null),
    f: (v) => fuera(v, 30, 800, "Avance seguro: 30 a 800 mm/min."),
  },
  comun: {
    zSeguro: (v) => fuera(v, 1, 15, "Z seguro: de 1 a 15 mm sobre la placa."),
  },
};
// Los avisos de un grupo: { clave: texto }
export function revisarRango(g, Q, grosor) {
  const r = {};
  for (const [k, f] of Object.entries(RANGO[g] || {})) { const t = isFinite(Q[k]) ? f(Q[k], Q, grosor) : null; if (t) r[k] = t; }
  return r;
}

// Brocas para PCB que se consiguen (mm); 3.175 = 1/8"
export const BROCAS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.5, 3, 3.175];

// Resumen corto de cada herramienta (en la fila de PCB y en su cabecera)
export function resumen(g, P) {
  if (g === "pistas") return `${n(P.diam)} mm · ${P.pasadas}×`;
  if (g === "hoyos") return `Ø${n(P.broca)} mm`;
  if (g === "contorno") return `Ø${n(P.diam)} mm · ${P.puentes} puentes`;
  if (g === "grabado") return `V ${n(P.angulo, 0)}° · ${n(P.prof)} mm`;
  if (g === "vaciado") return `${n(P.prof)} mm · ${P.pasadas}×`;
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

// Nombre del material en los dibujos (lo pone la app al cambiar de material; los colores van por CSS)
let MAT = "FR4";
export function ponerMatDibujo(t) { MAT = t || "FR4"; }

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
// De lado: la punta en V entra «prof» bajo el cobre; el corte mide anchoV(P) en la superficie
function cortePistas(P, grabado = false) {
  const W = 320, H = 150, k = 200, ySup = 64, cx = 170;     // 200 px por mm: la ventana mide 1.6 mm
  const prof = Math.max(0, Math.min(P.prof, 0.4)), yTip = ySup + prof * k;
  const tanM = Math.tan(((P.angulo || 30) / 2) * Math.PI / 180);
  const t = Math.max(0.02, P.punta ?? 0.1) * k;             // punta plana
  const med = (y) => t / 2 + (yTip - y) * tanM;
  const fresa = `<polygon class="m-acero" data-k="angulo" points="${cx - t / 2},${yTip} ${cx + t / 2},${yTip} ${cx + med(0)},0 ${cx - med(0)},0"/>
    <line class="m-acero" data-k="punta" x1="${cx - t / 2}" y1="${yTip}" x2="${cx + t / 2}" y2="${yTip}" stroke-width="3"/>`;
  P = { ...P, diam: anchoV(P) };
  const ancho = P.diam * k, xd = cx + Math.max(ancho / 2, med(ySup)) + 18;
  const L = capas(W, ySup, k, 1.6, H);
  return svg(W, H, `De lado: la punta en V ${grabado ? "graba" : "entra"} ${n(P.prof)} mm y corta ${n(P.diam)} mm de ancho`, `
    ${L.svg}${fresa}
    ${grabado ? "" : rotulo(8, ySup - 6, "pista")}${rotulo(8, ySup + 30, MAT, "dib__rot--claro")}
    ${cotaH(cx - ancho / 2, cx + ancho / 2, ySup - 16, `Corte ${n(P.diam)} mm`, "diam")}
    ${prof > 0.004 ? cotaV(xd, ySup, yTip, `Profundidad ${n(P.prof)} mm`, "prof") : ""}
    ${flecha(cx - 52, 8, cx - 52, 36, `Bajada ${P.fz} mm/min`, "fz", "end")}
    ${escala(W - 112, H - 10, 100, "0.5 mm")}`);
}
// De arriba: la pista y las pasadas, cada una más afuera; lo encimado se ve más oscuro
function pasadasPistas(P) {
  const W = 320, H = 116, y0 = 26, y1 = 86, xP = 64;
  const nP = Math.min(8, Math.max(1, P.pasadas | 0)), paso = P.diam * (1 - P.traslape), ais = anchoAislado({ ...P, pasadas: nP });
  const k = Math.min(150, (W - xP - 40) / Math.max(ais, 0.1));     // fijo mientras quepa: si la fresa crece, se ve crecer
  const cortes = Array.from({ length: nP }, (_, i) => `<rect x="${xP + i * paso * k}" y="${y0}" width="${P.diam * k}" height="${y1 - y0}" class="m-surco"/>`).join("");
  const enc = nP > 1 && P.traslape > 0 ? cotaH(xP + paso * k, xP + P.diam * k, y0 - 10, `Traslape ${Math.round(P.traslape * 100)} %`, "traslape") : "";
  return svg(W, H, `De arriba: ${nP} pasadas junto a la pista, aíslan ${n(ais)} mm`, `
    <rect x="0" y="${y0}" width="${W}" height="${y1 - y0}" class="m-cobre"/>
    <rect x="0" y="${y0}" width="${xP}" height="${y1 - y0}" class="m-pista"/>
    ${cortes}
    ${rotulo(10, (y0 + y1) / 2 + 4, "pista")}
    ${enc}
    ${flecha(xP + (P.diam * k) / 2, y1 - 8, xP + (P.diam * k) / 2, y0 + 10, `Avance ${P.f} mm/min`, "f")}
    ${cotaH(xP, xP + ais * k, y1 + 12, `${nP} ${nP > 1 ? "pasadas" : "pasada"} · aísla ${n(ais)} mm`, "pasadas", true)}`);
}

// ======================================================================
// HOYOS
// ======================================================================
export function dibujosHoyos(P, grosor) {
  // 56 px por mm (la ventana mide 5.7 mm); con material grueso se encoge para que se vea el MDF debajo
  const W = 320, H = 196, ySup = 40, cx = 132, k = Math.min(56, (H - ySup - 26) / Math.max(grosor, P.prof, 0.1));
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
    ${rotulo(8, ySup + 26, `${MAT} ${n(grosor)} mm`, "dib__rot--claro")}${L.yBot + 18 < H ? rotulo(8, L.yBot + 18, "MDF") : ""}
    ${cotaH(cx - w / 2, cx + w / 2, 16, `Broca Ø ${n(d)} mm`, "broca")}
    ${cotaV(xd, ySup, yTip, `Profundidad ${n(P.prof)} mm`, "prof")}
    ${flecha(cx - w / 2 - 36, 4, cx - w / 2 - 36, 30, `Bajada ${P.fz} mm/min`, "fz", "end")}
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
  const W = 320, H = 180, ySup = 40, cx = 132, k = Math.min(56, (H - ySup - 26) / Math.max(grosor, P.prof, 0.1));
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
    ${rotulo(8, ySup + 26, MAT, "dib__rot--claro")}${L.yBot + 18 < H ? rotulo(8, L.yBot + 18, "MDF") : ""}
    ${cotaH(cx - w / 2, cx + w / 2, 16, `Fresa Ø ${n(P.diam)} mm`, "diam")}
    ${cotaV(cx + w / 2 + 16, ySup, yTip, `Profundidad ${n(P.prof)} mm`, "prof")}
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
  // ky: 34 px por mm mientras quepa (placa de 1.6 mm); un material grueso se encoge para caber en la ventana
  const X0 = 132, X1 = 314, kx = 20, ySup = 36, xc = (X0 + X1) / 2, ky = Math.min(34, (H - 10 - ySup - 6) / Math.max(grosor, P.prof, 0.1));
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
// GRABADO: la misma V de las pistas, sobre el material del dibujo
// ======================================================================
export function dibujosGrabado(P) {
  return conSilueta("v", cortePistas(P, true));
}

// ======================================================================
// VACIADO: de lado, la zona rebajada con sus bajadas; la fresa, en la pared
// ======================================================================
export function dibujosVaciado(P, grosor, diam) {
  const W = 320, H = 150, ySup = 36, x0 = 86, x1 = 270, k = Math.min(34, (H - ySup - 24) / Math.max(grosor, P.prof, 0.1));
  const nP = Math.max(1, P.pasadas | 0), yFin = Math.min(H - 6, ySup + P.prof * k), w = Math.max(6, diam * k);
  const L = capas(W, ySup, k, grosor, H);
  const niveles = Array.from({ length: nP - 1 }, (_, i) => { const y = ySup + ((P.prof * (i + 1)) / nP) * k; return `<line class="dib__nivel" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}"/>`; }).join("");
  const atraviesa = P.prof >= grosor;
  return conSilueta("maiz", svg(W, H, `De lado: se rebaja ${n(P.prof)} mm en ${nP} ${nP > 1 ? "bajadas" : "bajada"}`, `
    ${L.svg}
    <rect class="m-hueco" x="${x0}" y="${ySup}" width="${x1 - x0}" height="${yFin - ySup}"/>
    <g class="cota" data-k="pasadas">${niveles}</g>
    <rect class="m-acero" x="${x1 - w}" y="0" width="${w}" height="${yFin}" rx="1.5"/>
    ${rotulo(8, Math.max(yFin, ySup + 12) + 16, MAT, "dib__rot--claro")}${atraviesa || L.yBot + 18 >= H ? "" : rotulo(8, L.yBot + 18, "MDF")}
    ${cotaV(x0 + 12, ySup, yFin, `Profundidad ${n(P.prof)} mm`, "prof")}
    <g class="cota" data-k="traslape">${eti((x0 + x1 - w) / 2 + 30, ySup - 12, "del centro a la pared")}</g>
    ${escala(W - 70, H - 8, k, "1 mm")}`));
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
