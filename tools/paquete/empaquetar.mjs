// empaquetar.mjs - la CNC en inglés como versión fija (dist/fablab-cnc-<versión>/ y su .zip).
//
//   node tools/paquete/empaquetar.mjs extraer   pone en tools/paquete/en/*.json los textos nuevos (en: "")
//   node tools/paquete/empaquetar.mjs           arma el paquete; se detiene si falta traducir algo
//
// El código fuente sigue en español (fablab.sebs.mx no cambia). Cada JSON de en/ es la lista de textos de
// un archivo: { es, en, l } (l = la línea donde aparece por primera vez). en: null = no es texto, se queda
// igual. Para una versión nueva: subir VERSION en web/cnc/js/version.js, «extraer», traducir lo que quedó
// en "" (TRADUCIR.md) y volver a empaquetar; buscar-espanol.mjs revisa lo armado. Si cambian los videos
// de las manos, se vuelven a grabar en inglés en tools/paquete/videos (ver abajo, en empaquetar()).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse } from "./vendor/acorn.mjs";
import { full } from "./vendor/walk.mjs";
import { textosJS, traducirJS, esqueleto } from "./textos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "../..");
const WEB = path.join(RAIZ, "web");
const EN = path.join(AQUI, "en");
const VERSION = fs.readFileSync(path.join(WEB, "cnc/js/version.js"), "utf8").match(/VERSION = "([^"]+)"/)[1];
const NOMBRE = `fablab-cnc-${VERSION}`;
const DIST = path.join(RAIZ, "dist", NOMBRE);

// Lo que lleva el paquete (rutas de web/). Los módulos JS se buscan solos a partir de cnc/js/main.js;
// esto es lo demás: hojas de estilo, imágenes, videos y ejemplos.
const FIJOS = [
  "cnc/index.html", "cnc/cnc.css", "cnc/ejemplos",
  "css/tokens.css", "css/chrome.css", "css/project.css",
  "shared/css/app.css", "shared/css/lab.css", "shared/css/tutorial.css",
  "shared/vendor/three",
  "img/simbolo.png", "img/fresa", "img/manual",
  "videos/manos",
];
// Se traducen pero no van en el paquete: la página que dibuja los videos de las manos (para grabarlos en inglés)
const SOLO_GRABAR = ["demo/manos"];

// ---------------- Archivos ----------------
const lista = (rel) => {
  const p = path.join(WEB, rel);
  if (!fs.existsSync(p)) throw new Error(`No existe web/${rel}`);
  return fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((n) => lista(path.posix.join(rel, n))) : [rel];
};
// Módulos que importa main.js (y los que importan ellos), resueltos con el importmap de cnc/index.html
function modulos(inicio) {
  const html = fs.readFileSync(path.join(WEB, "cnc/index.html"), "utf8");
  const mapa = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const vistos = new Set(), pila = [inicio];
  const resolver = (desde, esp) => {
    for (const [k, v] of Object.entries(mapa)) {
      if (esp === k) return path.posix.normalize(path.posix.join("cnc", v));
      if (k.endsWith("/") && esp.startsWith(k)) return path.posix.normalize(path.posix.join("cnc", v + esp.slice(k.length)));
    }
    return path.posix.normalize(path.posix.join(path.posix.dirname(desde), esp));
  };
  while (pila.length) {
    const f = pila.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    const ast = parse(fs.readFileSync(path.join(WEB, f), "utf8"), { ecmaVersion: "latest", sourceType: "module" });
    full(ast, (n) => {
      const src = n.type === "ImportExpression" ? n.source : n.source;
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration", "ImportExpression"].includes(n.type) && src?.type === "Literal") pila.push(resolver(f, src.value));
    });
  }
  return [...vistos].filter((f) => !f.startsWith("shared/vendor/"));
}

const archivosPaquete = () => [...new Set([...FIJOS.flatMap(lista), ...modulos("cnc/js/main.js")])].sort();
const traducibles = (todos) => [...todos, ...SOLO_GRABAR.flatMap(lista)].filter((f) => /\.(js|html)$/.test(f) && !f.startsWith("shared/vendor/"));

// ---------------- Diccionarios ----------------
const rutaDic = (f) => path.join(EN, f.replace(/\//g, "__") + ".json");
const leerDic = (f) => (fs.existsSync(rutaDic(f)) ? JSON.parse(fs.readFileSync(rutaDic(f), "utf8")) : []);
const comoMapa = (d) => Object.fromEntries(d.filter((x) => !x.plantilla).map((x) => [x.es, x.en]));
const forzadas = (d) => new Set(d.filter((x) => x.forzar).map((x) => x.es));
const enteras = (d) => Object.fromEntries(d.filter((x) => x.plantilla).map((x) => [x.es, x.en]));

// HTML: el texto entre etiquetas y los atributos que se leen (title, aria-label, alt, placeholder, content
// de la descripción); se trata cada pedazo como una cadena más
function textosHTML(html) {
  const res = [];
  const re = /(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->)|<[^>]+>|([^<]+)/g;
  for (let m; (m = re.exec(html));) {
    if (m[1]) continue;
    if (m[2] != null) {
      const t = m[2].trim();
      if (/\p{L}{2,}/u.test(t)) { const ini = m.index + m[2].indexOf(t); res.push({ s: t, ini, fin: ini + t.length }); }
      continue;
    }
    for (const a of m[0].matchAll(/\b(title|aria-label|alt|placeholder|content)="([^"]*)"/g)) {
      if (a[1] === "content" && !/name="description"/.test(m[0])) continue;
      if (!/\p{L}{2,}/u.test(a[2])) continue;
      const ini = m.index + a.index + a[0].indexOf('"') + 1;
      res.push({ s: a[2], ini, fin: ini + a[2].length });
    }
  }
  return res;
}
const textosDe = (f, codigo, forzar) => (f.endsWith(".html") ? textosHTML(codigo).map((x) => ({ ...x, linea: codigo.slice(0, x.ini).split("\n").length })) : textosJS(codigo, { forzar }));

function extraer() {
  fs.mkdirSync(EN, { recursive: true });
  let nuevos = 0, pendientes = 0;
  for (const f of traducibles(archivosPaquete())) {
    const codigo = fs.readFileSync(path.join(WEB, f), "utf8");
    const dv = leerDic(f), viejo = comoMapa(dv), d = dv.filter((x) => x.plantilla), vistos = new Set();
    const fz = forzadas(dv);
    for (const x of textosDe(f, codigo, fz)) {
      if (vistos.has(x.s)) continue;
      vistos.add(x.s);
      if (!(x.s in viejo)) nuevos++;
      const en = x.s in viejo ? viejo[x.s] : "";
      if (en === "") pendientes++;
      d.push({ es: x.s, en, l: x.linea, ...(fz.has(x.s) ? { forzar: true } : {}) });   // (si era obsoleta y volvió, deja de serlo)
    }
    // Lo traducido que ya no está en el código se guarda al final (por si vuelve, o se ajustó una regla)
    const sobran = dv.filter((x) => !x.plantilla && !vistos.has(x.es) && x.en !== "");
    d.push(...sobran.map((x) => ({ ...x, obsoleta: true })));
    if (d.length || fs.existsSync(rutaDic(f))) fs.writeFileSync(rutaDic(f), JSON.stringify(d, null, 1) + "\n");
    console.log(`${f.padEnd(34)} ${String(d.length).padStart(4)} textos${sobran.length ? ` · ${sobran.length} ya no están` : ""}`);
  }
  console.log(`\n${nuevos} nuevos · ${pendientes} sin traducir`);
}

// ---------------- Traducir y revisar ----------------
function traducir(f, codigo) {
  const dv = leerDic(f), dic = comoMapa(dv), errores = [];
  // Las etiquetas de HTML (sin el texto) deben quedar idénticas
  for (const { es, en } of dv) if (en && esqueleto(es) !== esqueleto(en)) errores.push(`${f}: cambió el HTML de «${es.slice(0, 60)}»`);
  let out = codigo, faltan = [];
  if (f.endsWith(".html")) {
    const t = textosHTML(codigo);
    let r = "", i = 0;
    for (const x of t) {
      const en = dic[x.s];
      if (en === undefined || en === "") { faltan.push(x); continue; }
      if (en === null) continue;
      r += codigo.slice(i, x.ini) + en; i = x.fin;
    }
    out = (r + codigo.slice(i)).replace(/<html lang="es"/, '<html lang="en"');
  } else {
    let errs;
    ({ codigo: out, faltan, errores: errs } = traducirJS(codigo, dic, enteras(dv), forzadas(dv)));
    errores.push(...errs.map((e) => `${f}: ${e}`));
    try { parse(out, { ecmaVersion: "latest", sourceType: "module" }); } catch (e) { errores.push(`${f}: el JS traducido no se lee (${e.message})`); }
  }
  for (const x of faltan) errores.push(`${f}:${x.linea ?? "?"} sin traducir: «${x.s.slice(0, 70)}»`);
  return { out, errores };
}

function empaquetar() {
  const todos = archivosPaquete();
  const trad = new Set(traducibles(todos));
  // Se vacía (no se borra): un servidor de prueba puede tener la carpeta abierta
  if (fs.existsSync(DIST)) for (const n of fs.readdirSync(DIST)) fs.rmSync(path.join(DIST, n), { recursive: true, force: true });
  const errores = [];
  const escribir = (f, datos) => { const d = path.join(DIST, f); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, datos); };
  // Los videos de las manos van con subtítulos en inglés: los de tools/paquete/videos (se graban con
  // python tools/grabar_clips.py --raiz dist/grabar --salida tools/paquete/videos)
  const VIDEOS = path.join(AQUI, "videos");
  for (const f of todos) {
    if (f.startsWith("videos/manos/")) {
      const en = path.join(VIDEOS, path.basename(f));
      if (fs.existsSync(en)) escribir(f, fs.readFileSync(en));
      else errores.push(`${f}: falta en tools/paquete/videos (grábalo en inglés)`);
      continue;
    }
    if (!trad.has(f)) { escribir(f, fs.readFileSync(path.join(WEB, f))); continue; }
    const r = traducir(f, fs.readFileSync(path.join(WEB, f), "utf8"));
    errores.push(...r.errores);
    escribir(f, r.out);
  }
  // dist/grabar/: una copia de web/ con la página de las manos en inglés, de donde se graban los videos
  const GRABAR = path.join(RAIZ, "dist", "grabar");
  fs.rmSync(GRABAR, { recursive: true, force: true });
  for (const d of ["demo", "shared", "cnc", "css", "img"]) fs.cpSync(path.join(WEB, d), path.join(GRABAR, d), { recursive: true });
  for (const f of [...trad].filter((f) => todos.includes(f))) fs.copyFileSync(path.join(DIST, f), path.join(GRABAR, f));
  for (const f of traducibles([])) {
    const r = traducir(f, fs.readFileSync(path.join(WEB, f), "utf8"));
    errores.push(...r.errores);
    fs.writeFileSync(path.join(GRABAR, f), r.out);
  }
  if (errores.length) { console.error(errores.join("\n")); console.error(`\n${errores.length} problemas: no se armó el zip.`); process.exit(1); }
  for (const f of fs.readdirSync(path.join(AQUI, "raiz"))) escribir(f, fs.readFileSync(path.join(AQUI, "raiz", f), "utf8").replaceAll("{{VERSION}}", VERSION));
  const zip = path.join(RAIZ, "dist", `${NOMBRE}.zip`);
  fs.rmSync(zip, { force: true });
  // el tar de Windows (bsdtar) sabe hacer .zip; el de Git Bash no
  const TAR = process.platform === "win32" ? path.join(process.env.SystemRoot, "System32", "tar.exe") : "tar";
  execFileSync(TAR, ["-a", "-c", "-f", path.basename(zip), NOMBRE], { cwd: path.join(RAIZ, "dist") });
  const mb = (fs.statSync(zip).size / 1e6).toFixed(1);
  console.log(`${todos.length} archivos · ${trad.size} traducidos · ${path.relative(RAIZ, zip)} (${mb} MB)`);
}

// revisar <web/ruta…>: traduce esos archivos en memoria y dice qué falla (HTML cambiado, JS que no se lee, sin traducir)
function revisar(fs_) {
  let n = 0;
  for (const f of fs_) {
    const { errores } = traducir(f, fs.readFileSync(path.join(WEB, f), "utf8"));
    errores.forEach((e) => console.log(e)); n += errores.length;
  }
  console.log(n ? `${n} problemas` : "sin problemas");
}

if (process.argv[2] === "extraer") extraer();
else if (process.argv[2] === "revisar") revisar(process.argv.slice(3));
else if (process.argv[2] === "lista") console.log(archivosPaquete().join("\n"));
else empaquetar();
