# fablab-tools

> Herramientas web del Fab Lab: conectas la máquina por USB y trabajas desde el navegador. CNC Genmitsu Cubiko (de los Gerber de KiCad a la placa fresada, y de un DXF o SVG al corte en acrílico, MDF o madera) y cortadora láser xTool S1 (del SVG o la imagen al corte y grabado).

| Campo | Valor |
|---|---|
| Estado | activo |
| Año | 2026 |
| ID SEBS | FAB-01 (acento Copper) |
| Repo(s) | [sebas30073007/fablab-tools](https://github.com/sebas30073007/fablab-tools); `web/` en GitHub Pages |
| Publicado en sebs.mx | no (previsto: subdominio de sebs.mx) |

## Contenido
- `web/` — el sitio. Se publica tal cual, sin compilar (ES modules + importmap)
  - `index.html` — catálogo de máquinas (CNC y láser activas; 3D y sublimado en preparación)
  - `shared/` — lo común a las apps
    - `js/serie.js` — Web Serial por líneas con cola y `ok` (GRBL y la S1 lo extienden)
    - `js/ui.js` — DOM, hojas, asistentes, jog compacto; `crearLs(prefijo)` para el guardado de cada app
    - `js/navegacion.js` — niveles del panel (pestañas, detalle, sub-detalle)
    - `js/gcode.js` — leer G-code (vista previa, tiempo, potencia del láser por tramo) y transformarlo
    - `js/visor-base.js` — base de los gemelos 3D: luz, cámara, trayectorias, posición suavizada
    - `js/iconos.js` — el set de íconos
    - `css/app.css` (componentes, piel SEBS) · `css/lab.css` (piel Laboratorio) · `css/tutorial.css`
    - `vendor/three/` — three.js vendorizado (copiado de maquina-dibujo)
  - `cnc/` — app de la CNC. El panel derecho funciona como app móvil (arquitectura de OPI, ver `docs/laboratorio-ui.md`)
    - `js/main.js` — estado, máquina, navegación por niveles y acciones
    - `js/vistas.js` — Inicio (widgets Ahora con los pasos, PCB, Origen, Trabajos), Mover, Consola y los detalles (PCB → Configuración; Origen → Mapa de alturas y Calibración fina)
    - `js/herramientas.js` — Configuración: campos, notas y dibujos de cada herramienta (fresa en V, broca, fresa de maíz) que cambian con los valores
    - `js/ui.js`, `js/gcode.js` — reexportan los de `shared/` (la CNC guarda con el prefijo `fablab.cnc.`)
    - `js/tutorial.js` — botón Tutorial: elegir, manual y motor del recorrido guiado · `js/tutorial-bloques.js` (el recorrido, en bloques) · `js/manual.js` (los 6 pasos de Inicio, más Antes y Al terminar, con sus checks) · `js/examen.js` (examen de 30 preguntas y certificado en PDF). Ver `docs/tutorial.md`
    - `js/grbl.js` — Web Serial + protocolo GRBL 1.1 (conteo de caracteres, tiempo real, estado)
    - `js/grbl-sim.js` — GRBL emulado para el modo Simulación (placa virtual, sonda, alarmas)
    - `js/gerber.js`, `raster.js`, `cam.js` — Gerber/Excellon → imágenes en blanco y negro → trayectorias → G-code
    - `js/dxf.js`, `svg.js`, `vector.js` — dibujos DXF y SVG para cortar otros materiales (o una placa sin pistas): la capa del dibujo decide la operación (ver `docs/cnc-dibujos.md`)
    - `js/materiales.js` — cobre, acrílico, MDF y madera: profundidad, bajadas, avance, sentido de corte y acabado de partida
    - `js/alturas.js` — mapa de alturas, compatible con el `.map` de Candle
    - `js/visor.js` — gemelo 3D: animación, cama, trayectorias, malla y cámaras
    - `js/cubiko.js` — la Cubiko modelada con primitivas a partir de fotos y medidas oficiales (no hay CAD público)
    - `cnc.css` — lo propio de la CNC (material y dibujos de las herramientas)
  - `laser/` — app de la xTool S1 (camino A: G-code en streaming por USB). Ver `docs/xtool-s1.md`
    - `js/s1.js` — protocolo de la S1 sobre `serie.js` (estados M222, posición, casa, pausa, cancelar, alarmas)
    - `js/perfil-s1.js` — todo lo que falta confirmar en la máquina, en un solo lugar
    - `js/bloqueo.js` — órdenes que la app nunca manda (sensor de tapa, firmware, láser fijo)
    - `js/s1-sim.js` — la S1 emulada para Simulación (tapa abierta y flama para practicar)
    - `js/svg.js` — SVG → trazos en mm por color · `js/grabado.js` — imagen → tramado → renglones · `js/trabajo.js` — arma el G-code (grabado → marcado → corte) y el encuadre
    - `js/materiales.js` — biblioteca de materiales (valores de partida, por validar) y lo prohibido
    - `js/visor.js` — gemelo 3D con quemado sobre el material · `js/s1-modelo.js` — la S1 con primitivas (ver `docs/xtool-s1-modelo.md`)
    - `js/main.js`, `js/vistas.js` — estado y panel (Inicio con 6 pasos, Diseño, Material, Máquina, Mover, Consola)
    - `diagnostico.html` + `js/diagnostico.js` — prueba la conexión con la S1 real y descarga un `.json`
    - `modelo.html` — vista suelta del modelo 3D para revisarlo
    - `ejemplos/llavero.svg` — ejemplo con corte, marcado y grabado    - `ejemplos/kicad-basics/` — Gerber de `course-docs/pcb/kicad-basics-course` para el botón Ejemplo
    - `ejemplos/carrito/` — Gerber de `cpm/pcb/carrito-base-tb6612` (ejemplo anterior, ya no se usa)
  - `img/cnc-cubiko.webp` — la Cubiko en felpa para la tarjeta del catálogo (ChatGPT, con una foto de la reseña de SainSmart como referencia; original en `E:\00_INBOX\fablab-cubiko-felpa.png`)
  - `img/fresa/` — la mascota de la CNC (11 poses), generada con ChatGPT a partir de la Fresa de OPI
  - `img/kiwi/` — la mascota del láser (12 poses, ChatGPT con Fresa como referencia; ver `docs/kiwi.md`)
  - `img/laser-s1.webp` — la xTool S1 en felpa para la tarjeta del catálogo
  - `img/manual/` — las imágenes del manual (ChatGPT, estilo de producto ligeramente afelpado); `xy.webp` es un recorte de `placa.webp`
  - `css/` — capas SEBS: `tokens.css` y `chrome.css` (copias, no editar), `project.css` (FAB-01), `hub.css`
- `docs/cubiko.md` — la máquina, su firmware y lo aprendido calibrándola
- `docs/grbl.md` — el protocolo, en corto
- `docs/cnc-dibujos.md` — CNC con DXF/SVG: capas, piezas y huecos, sentido de corte por material, acabado, vaciado y grabado
- `docs/laboratorio-ui.md` — reglas de la piel Laboratorio (OPI en claro) para llevar a otros proyectos
- `docs/tutorial.md` — el manual y el recorrido guiado: tipos de paso, bloques, anclas y cómo rehacer un bloque
- `docs/xtool-s1.md` — la S1, su protocolo (de xTool Studio, ha-xtool y LightBurn), caminos A y B, qué falta confirmar
- `docs/xtool-s1-modelo.md` — medidas y fuentes del modelo 3D de la S1
- `docs/kiwi.md` — la mascota del láser: reglas y prompts
- `cad/` — vacío: aquí va el CAD de la Cubiko si aparece (ver docs/cubiko.md)
- `media/` — capturas del gemelo
- `servir.py` — servidor local en el puerto 8767

## Cómo correrlo
```
python servir.py           # abre http://localhost:8767 en Chrome
python servir.py cnc/      # directo a la CNC
python servir.py laser/    # directo al láser
```
Web Serial solo funciona en Chrome o Edge de escritorio, y solo en `https://` o `localhost`.
Sin la máquina: botón **Simulación** en la barra.

## Publicar (GitHub Pages)
Repo: https://github.com/sebas30073007/fablab-tools. Cada push a `main` publica `web/` con `.github/workflows/pages.yml` (sin build).
1. Settings → Pages → Source: **GitHub Actions** (una sola vez).
2. Subdominio: Settings → Pages → Custom domain (p. ej. `fablab.sebs.mx`) y un registro CNAME en el DNS de sebs.mx hacia `sebas30073007.github.io`. Con Actions no hace falta archivo `CNAME`.
3. `web/cnc/ejemplos/` (carrito y KiCad Basics) va público junto con el sitio.
