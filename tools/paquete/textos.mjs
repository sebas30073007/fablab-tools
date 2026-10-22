// textos.mjs - los textos que ve el usuario dentro de un archivo JS, con su posición exacta.
//
// Se lee el JS con acorn (vendor/, MIT) y se toman las cadenas ("…", '…') y los pedazos fijos de las
// plantillas (`…${x}…`). Una cadena cuenta como texto si tiene letras de un idioma: acentos, dos palabras,
// una palabra con mayúscula, una palabra que une pedazos (« de », « y »…) o texto en MAYÚSCULAS (comentarios
// del G-code). Los nombres internos (ids, clases, rutas, selectores, CSS) se quedan fuera. Lo que se cuela
// de más se marca en el diccionario como null y se queda igual: no rompe nada.
//
// Una cadena que las reglas no ven (una palabra suelta como argumento: rotulo(x, y, "pista")) se agrega a
// mano con "forzar": true.
//
// Una plantilla entera también puede traducirse de una vez (entrada con "plantilla": true y el texto crudo
// completo, ${…} incluidos): sirve cuando el inglés necesita otro orden que el español.

import { parse } from "./vendor/acorn.mjs";
import { full } from "./vendor/walk.mjs";

const ACENTOS = /[áéíóúüñÁÉÍÓÚÜÑ¿¡«»…·]/;
const DOS_PALABRAS = /\p{L}{2,}[\s,.:;]+\p{L}{2,}/u;
const ETIQUETA = /^\s*\p{Lu}\p{Ll}+/u;
const UNE = /(^|[^\p{L}])(de|del|y|o|a|en|con|sin|por|para|al|la|el|los|las|un|una|no|se|que|es)([^\p{L}]|$)/u;
const MAYUS = /(^|[^\p{L}])\p{Lu}{3,}([^\p{L}]|$)/u;
// Lo que nunca es texto: rutas, selectores, colores, medidas, G-code suelto, CSS, identificadores
const NO = [/^[\w.-]*\/[\w./-]*$/, /^[#.[][\w-]/, /^#[0-9a-f]{3,8}$/i, /^[\d.\s]+(px|mm|%|em|rem|vh|vw|s|ms)?$/,
  /^([A-Z]-?[\d.]+\s*)+$/, /^\s*$/, /^[a-z-]+:[^\s;]+;?$/, /^;?[a-z-]+:\s*var\(--/, /^[a-z][\w-]*$/, /^[a-z]+:[a-z]+$/i, /^[\w-]+(\[[^\]]*\]|:not\([^)]*\))/];

// Lo visible de una cadena con HTML: el texto entre etiquetas más aria-label, title, alt y placeholder.
// Un pedazo de plantilla puede empezar dentro de una etiqueta («">Contorno</button>»): eso no se lee.
export function visible(s) {
  const attrs = [...s.matchAll(/\b(?:aria-label|title|alt|placeholder)="([^"$]*)"?/g)].map((m) => m[1]);
  let t = s;
  const c = t.indexOf(">"), a = t.indexOf("<");
  // Lo que va antes de la primera « " » es el final del valor de un atributo (puede ser un aria-label)
  if (c >= 0 && (a < 0 || c < a) && /["=]/.test(t.slice(0, c))) { const q = t.indexOf('"'); t = (q >= 0 && q < c ? t.slice(0, q) : "") + " " + t.slice(c + 1); }
  t = t.replace(/<[^>]*>?/g, " ");
  return [t, ...attrs].join(" ");
}

export function esTexto(s) {
  const v = visible(s).trim();
  // Un identificador no tiene espacios alrededor: « de » es texto, "de" puede ser un id
  if (!v || NO.some((r) => r.test(v)) && !(/^\s|\s$/.test(s) && UNE.test(v))) return false;
  return ACENTOS.test(v) || DOS_PALABRAS.test(v) || ETIQUETA.test(v) || UNE.test(v) || MAYUS.test(v) || /^[A-Z]\s\p{Ll}{3,}/u.test(v) || /^es(-[A-Z]{2})?$/.test(v);
}

// [{ s, ini, fin, linea, tipo }]: s es el texto crudo tal como está en el código (sin comillas);
// ini/fin, sus posiciones para reemplazarlo. plantillas: [{ s, ini, fin, partes: [índices en la lista] }]
export function textosJS(codigo, { conPlantillas = false, forzar = new Set() } = {}) {
  const ast = parse(codigo, { ecmaVersion: "latest", sourceType: "module", locations: true });
  const fuera = new Set();   // literales que son rutas de import o claves de objeto
  // Una palabra suelta en minúsculas cuenta si es una rama de «? :», se pega con «+» o es argumento
  // (plurales: n === 1 ? "hoyo" : "hoyos"; rotulo(x, y, "pista"))
  const ramas = new Set();
  full(ast, (n) => {
    if ((n.type === "ImportDeclaration" || n.type === "ExportNamedDeclaration" || n.type === "ExportAllDeclaration") && n.source) fuera.add(n.source);
    if (n.type === "ImportExpression" && n.source.type === "Literal") fuera.add(n.source);
    if (n.type === "Property" && !n.computed && n.key.type === "Literal") fuera.add(n.key);
    if (n.type === "ConditionalExpression") ramas.add(n.consequent).add(n.alternate);
    if (n.type === "BinaryExpression" && n.operator === "+") ramas.add(n.left).add(n.right);
    if (n.type === "TemplateLiteral") n.expressions.forEach((e) => ramas.add(e));
  });
  const palabra = (n, s) => ramas.has(n) && /^\p{Ll}{3,}$/u.test(s);
  const res = [], plantillas = [];
  full(ast, (n) => {
    if (n.type === "Literal" && typeof n.value === "string" && !fuera.has(n)) {
      const s = codigo.slice(n.start + 1, n.end - 1);
      if (esTexto(s) || palabra(n, s) || forzar.has(s)) res.push({ s, ini: n.start + 1, fin: n.end - 1, linea: n.loc.start.line, tipo: n.raw[0] });
    } else if (n.type === "TemplateElement") {
      const s = n.value.raw;
      if (esTexto(s) || forzar.has(s)) res.push({ s, ini: n.start, fin: n.end, linea: n.loc.start.line, tipo: "`" });
    } else if (conPlantillas && n.type === "TemplateLiteral" && n.expressions.length) {
      plantillas.push({ s: codigo.slice(n.start + 1, n.end - 1), ini: n.start + 1, fin: n.end - 1, linea: n.loc.start.line });
    }
  });
  res.sort((a, b) => a.ini - b.ini);
  return conPlantillas ? { textos: res, plantillas } : res;
}

// ${…} de una plantilla cruda, en orden
const huecos = (s) => {
  const r = [];
  for (let i = s.indexOf("${"); i >= 0; i = s.indexOf("${", i)) {
    let d = 0, j = i + 1;
    for (; j < s.length; j++) { if (s[j] === "{") d++; else if (s[j] === "}" && --d === 0) break; }
    r.push(s.slice(i, j + 1)); i = j + 1;
  }
  return r;
};

// Cambia cada texto por su traducción; devuelve el código, lo que falta y los errores de plantillas.
// dic: { es: en } con en = texto, null (se queda igual) o "" (falta); enteras: { textoCrudo: en } de plantillas
export function traducirJS(codigo, dic, enteras = {}, forzar = new Set()) {
  const { textos, plantillas } = textosJS(codigo, { conPlantillas: true, forzar });
  const faltan = [], errores = [], cambios = [];
  // Primero las plantillas enteras: sus pedazos ya no se traducen sueltos
  const tapadas = [];
  for (const p of plantillas) {
    const en = enteras[p.s];
    if (en == null) continue;
    const a = huecos(p.s).sort().join("\n"), b = huecos(en).sort().join("\n");
    if (a !== b) { errores.push(`plantilla de la línea ${p.linea}: los \${…} no son los mismos`); continue; }
    cambios.push({ ini: p.ini, fin: p.fin, en }); tapadas.push(p);
  }
  for (const x of textos) {
    if (tapadas.some((p) => x.ini >= p.ini && x.fin <= p.fin)) continue;
    const en = dic[x.s];
    if (en === null) continue;
    if (en == null || en === "") { faltan.push(x); continue; }
    cambios.push({ ini: x.ini, fin: x.fin, en });
  }
  // Una plantilla dentro de otra plantilla entera ya va dentro de su texto
  cambios.sort((a, b) => a.ini - b.ini);
  let out = "", i = 0;
  for (const c of cambios) { if (c.ini < i) continue; out += codigo.slice(i, c.ini) + c.en; i = c.fin; }
  return { codigo: out + codigo.slice(i), faltan, errores, textos };
}

// Lo que no debe cambiar al traducir un texto con HTML: cuántos <, >, " e = hay y los atributos que no se
// leen (clases, data-*, estilos…) con su valor
export function esqueleto(s) {
  const n = (c) => s.split(c).length - 1;
  const attrs = [...s.matchAll(/([\w-]+)="([^"]*)"/g)].filter((m) => !/^(aria-label|title|alt|placeholder)$/.test(m[1]) && !/[^\x00-\x7f]|\s\p{L}{2,}\s/u.test(m[2])).map((m) => m[0]).sort();
  return [n("<"), n(">"), n('"'), n("="), ...attrs].join("|");
}
