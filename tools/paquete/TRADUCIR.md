# Translating the CNC app to English

The source code stays in Spanish. `node tools/paquete/empaquetar.mjs` builds the English package by
replacing every user-visible string with its translation from `tools/paquete/en/<file>.json`.

## The dictionary files

Each file in `en/` is a JSON array of `{ "es": …, "en": …, "l": … }`, one entry per distinct string of one
source file (`cnc__js__vistas.js.json` ↔ `web/cnc/js/vistas.js`). `l` is the line where it first appears.
Fill `en`; never change `es` or `l`, never add or remove entries.

- `en` is a **string**: the English text, written exactly as it must appear in the source code in place of `es`.
- `en` is **null** when the string is not something a person reads: an internal key or id, a value compared in
  code (`estado === "hecho"`, GRBL states like `"Alarm"`, `"Run"`, `"Jog"`, `"Hold"`, `"Idle"`), a CSS class or
  style, an event name, a localStorage key, a file name, a regex, a G-code command. **Open the source file at
  line `l` and look at how the string is used before deciding.** When unsure whether it is shown, look further.
- If the same `es` is used both as a key and as visible text in that file, set `en` to null and list it in your
  final report (it will be fixed in the source).

## Rules for `en`

1. It is raw source text. `es` was taken from between the quotes (or backticks) of the source, so:
   - inside "…" strings do not add unescaped `"`; inside '…' strings do not add unescaped `'`;
   - inside template-literal chunks (backticks) never add a backtick or `${`;
   - keep existing escapes (`\n`, `\"`, `\u…`) where they are needed.
   Prefer typographic quotes “ ” and ’ for quoting inside text (Spanish « » become “ ”).
2. **HTML stays identical.** Translate only the text between tags and the values of `aria-label`, `title`,
   `alt`, `placeholder`. Every tag, attribute name, class, `data-*`, style and order must be the same.
3. Keep leading/trailing spaces and punctuation: the chunks join with `${…}` values in code
   (`"Aleja "` + axis + `", pasos de 1 mm"` → `"Move "` … `", 1 mm steps"`). Read the whole template on that
   line so the English sentence reads well once the values are inserted. Plurals built in code
   (`n === 1 ? "hoyo" : "hoyos"`) translate each branch.
4. Units, numbers, axis letters, G-code, `GRBL`, `Cubiko`, `KiCad`, `Gerber`, `Fab Lab` stay as they are.
5. G-code comments (uppercase text inside the generated G-code, e.g. `PISTAS - AISLAMIENTO`) stay UPPERCASE,
   plain ASCII, without parentheses.
6. Tone: same as the Spanish — short, plain, friendly, second person ("you"), imperative for actions, for
   students in a Fab Lab. US English. Do not add explanations that are not in the Spanish. Keep it as short as
   the original (buttons and labels have little room).
7. Exam questions: keep the meaning and which answer is correct exactly.

## Glossary (use these consistently)

| Spanish | English |
|---|---|
| Pistas (trabajo) / aislamiento | Traces / isolation |
| Hoyos / taladrar | Holes / drill |
| Contorno | Outline |
| Grabado | Engraving |
| Vaciado | Pocket |
| Zonas sin cobre / Sin cobre (herramienta) | Copper-free zones / Clear copper |
| Regla | Ruler |
| fresa (herramienta) | bit (end mill for flat bits; V-bit for fresa en V) |
| broca | drill bit |
| fresa de corte lateral | end mill |
| Fresa (la mascota, una fresa/strawberry) | Fresa (keep the name) |
| pasadas | passes |
| traslape | overlap |
| profundidad | depth |
| avance | feed rate |
| bajada (velocidad al bajar) | plunge rate |
| bajada (cada paso en Z) | step down |
| puentes | tabs |
| husillo | spindle |
| concordancia / convencional | climb / conventional |
| mapa de alturas | height map |
| sonda / calibrar con la sonda | probe / probe |
| sujetador | clamp |
| caimán (cable) | alligator clip |
| placa (PCB) | board |
| placa de cobre / material virgen | copper-clad board / stock |
| material | material |
| MDF de sacrificio | spoilboard (MDF) |
| cobre | copper |
| gemelo 3D | 3D twin |
| Inicio / Mover / Consola (pestañas) | Home / Jog / Console |
| PARO | STOP |
| Homing / Desbloquear | Homing / Unlock |
| Configuraciones de CNC | CNC settings |
| Generar trayectorias / Volver a generar | Generate toolpaths / Regenerate |
| Vista previa / Ampliar | Preview / Enlarge |
| Fijar X0 Y0 / Z0 | Set X0 Y0 / Z0 |
| Origen | Origin |
| Simulación | Simulation |
| Recorrido guiado / Tutorial / Examen | Guided tour / Tutorial / Exam |
| Acciones rápidas | Quick actions |
| Pieza (dibujo DXF/SVG) | Part |
| Desconectada / Conectada | Disconnected / Connected |

## Check your work

From `E:\30_PROJECTS\fablab-tools`:

    node tools/paquete/empaquetar.mjs revisar cnc/js/vistas.js

It translates the file in memory and lists every problem: entries still empty, HTML that changed, or
translated JS that no longer parses. Repeat until it says `sin problemas` for each of your files.
Edit the JSON with a script or careful edits; keep it valid JSON (2-space-free format is fine).
