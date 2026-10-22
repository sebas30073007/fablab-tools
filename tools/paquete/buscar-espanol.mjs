// buscar-espanol.mjs - lo que quedó en español en el paquete armado (dist/fablab-cnc-<v>/ y dist/grabar/demo).
//   node tools/paquete/buscar-espanol.mjs
// Revisa cada cadena y pedazo de plantilla del JS ya traducido: acentos o palabras que solo existen en español.
// Lo que salga aquí falta en los diccionarios (o el extractor no lo vio): se arregla y se vuelve a empaquetar.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./vendor/acorn.mjs";
import { full } from "./vendor/walk.mjs";
import { visible } from "./textos.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VERSION = fs.readFileSync(path.join(RAIZ, "web/cnc/js/version.js"), "utf8").match(/VERSION = "([^"]+)"/)[1];
const DIRS = [path.join(RAIZ, "dist", `fablab-cnc-${VERSION}`), path.join(RAIZ, "dist", "grabar", "demo")];
const PALABRAS = new Set(("de del que la el los las y con sin para por una uno unos unas es está están son hay más menos muy " +
  "puesta puesto aquí ahí listo lista hecho hecha falta faltan quedan queda sale salen entra corta graba sube baja " +
  "fresa fresas broca pasada pasadas pista pistas hoyo hoyos placa material cobre puente puentes bajada bajadas " +
  "paso pasos zona zonas valor valores archivo archivos trabajo trabajos punto puntos minuto minutos segundos " +
  "arriba abajo izquierda derecha dentro fuera tu tus su sus cuando donde como pero también ya aún sí no otra otro").split(" "));
const ES = /[áéíóúñ¿¡«»]/i;

const lista = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === "vendor" ? [] : lista(path.join(d, e.name))) : [path.join(d, e.name)]);
let n = 0;
for (const dir of DIRS) {
  for (const f of lista(dir).filter((f) => f.endsWith(".js"))) {
    const codigo = fs.readFileSync(f, "utf8");
    const ast = parse(codigo, { ecmaVersion: "latest", sourceType: "module", locations: true });
    const malos = [];
    full(ast, (nd) => {
      let s = null;
      if (nd.type === "Literal" && typeof nd.value === "string") s = nd.value;
      else if (nd.type === "TemplateElement") s = nd.value.cooked ?? nd.value.raw;
      if (s == null) return;
      const v = visible(s);
      const palabras = v.toLowerCase().match(/\p{L}+/gu) || [];
      const es = palabras.filter((p) => PALABRAS.has(p));
      // «no» y «a» existen en inglés: cuentan solo junto a otra palabra en español
      const fuerte = es.filter((p) => !["no", "a", "es"].includes(p));
      // Una sola palabra sin espacios es casi siempre un id ("pasadas", "broca"); «y» suelta es el eje
      const frase = /\p{L}\s+\p{L}/u.test(v);
      if (ES.test(v) || (frase && (fuerte.length || /\p{L}{2,} y \p{L}{2,}/u.test(v)))) malos.push(`${nd.loc.start.line}\t${JSON.stringify(s.trim()).slice(0, 120)}`);
    });
    if (malos.length) { console.log(`== ${path.relative(RAIZ, f)}\n${malos.join("\n")}`); n += malos.length; }
  }
}
console.log(n ? `\n${n} cadenas con español` : "sin español");
