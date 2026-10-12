# fablab-tools

> Herramientas web del Fab Lab: conectas la máquina por USB y trabajas desde el navegador. Primera herramienta: CNC Genmitsu Cubiko, de los Gerber de KiCad a la placa fresada.

| Campo | Valor |
|---|---|
| Estado | activo |
| Año | 2026 |
| ID SEBS | FAB-01 (acento Copper) |
| Repo(s) | [sebas30073007/fablab-tools](https://github.com/sebas30073007/fablab-tools); `web/` en GitHub Pages |
| Publicado en sebs.mx | no (previsto: subdominio de sebs.mx) |

## Contenido
- `web/` — el sitio. Se publica tal cual, sin compilar (ES modules + importmap)
  - `index.html` — catálogo de máquinas (CNC activa; láser, 3D y sublimado en preparación)
  - `cnc/` — app de la CNC. El panel derecho funciona como app móvil (arquitectura de OPI, ver `docs/laboratorio-ui.md`)
    - `js/main.js` — estado, máquina, navegación por niveles y acciones
    - `js/vistas.js` — Inicio (widgets Ahora con los pasos, PCB, Origen, Trabajos), Mover, Consola y los detalles (PCB → Configuración; Origen → Mapa de alturas y Calibración fina)
    - `js/herramientas.js` — Configuración: campos, notas y dibujos de cada herramienta (fresa en V, broca, fresa de maíz) que cambian con los valores
    - `js/ui.js` — hojas accesibles que suben desde abajo, ventana centrada, asistentes, jog compacto
    - `js/tutorial.js` — botón Tutorial: elegir, manual y motor del recorrido guiado · `js/tutorial-bloques.js` (el recorrido, en bloques) · `js/manual.js` (los 6 pasos de Inicio, más Antes y Al terminar, con sus checks) · `js/examen.js` (examen de 30 preguntas y certificado en PDF). Ver `docs/tutorial.md`
    - `js/grbl.js` — Web Serial + protocolo GRBL 1.1 (conteo de caracteres, tiempo real, estado)
    - `js/grbl-sim.js` — GRBL emulado para el modo Simulación (placa virtual, sonda, alarmas)
    - `js/gerber.js`, `raster.js`, `cam.js` — Gerber/Excellon → imágenes en blanco y negro → trayectorias → G-code
    - `js/gcode.js` — vista previa y transformaciones (alineación con 2 agujeros, mapa de alturas, prueba en aire)
    - `js/alturas.js` — mapa de alturas, compatible con el `.map` de Candle
    - `js/visor.js` — gemelo 3D: animación, cama, trayectorias, malla y cámaras
    - `js/cubiko.js` — la Cubiko modelada con primitivas a partir de fotos y medidas oficiales (no hay CAD público)
    - `cnc.css` (componentes, piel SEBS) · `lab.css` (piel Laboratorio) · `tutorial.css`
    - `ejemplos/kicad-basics/` — Gerber de `course-docs/pcb/kicad-basics-course` para el botón Ejemplo
    - `ejemplos/carrito/` — Gerber de `cpm/pcb/carrito-base-tb6612` (ejemplo anterior, ya no se usa)
  - `img/cnc-cubiko.webp` — la Cubiko en felpa para la tarjeta del catálogo (ChatGPT, con una foto de la reseña de SainSmart como referencia; original en `E:\00_INBOX\fablab-cubiko-felpa.png`)
  - `img/fresa/` — la mascota (11 poses), generada con ChatGPT a partir de la Fresa de OPI
  - `img/manual/` — las imágenes del manual (ChatGPT, estilo de producto ligeramente afelpado); `xy.webp` es un recorte de `placa.webp`
  - `css/` — capas SEBS: `tokens.css` y `chrome.css` (copias, no editar), `project.css` (FAB-01), `hub.css`
  - `shared/vendor/three/` — three.js vendorizado (copiado de maquina-dibujo)
- `docs/cubiko.md` — la máquina, su firmware y lo aprendido calibrándola
- `docs/grbl.md` — el protocolo, en corto
- `docs/laboratorio-ui.md` — reglas de la piel Laboratorio (OPI en claro) para llevar a otros proyectos
- `docs/tutorial.md` — el manual y el recorrido guiado: tipos de paso, bloques, anclas y cómo rehacer un bloque
- `cad/` — vacío: aquí va el CAD de la Cubiko si aparece (ver docs/cubiko.md)
- `media/` — capturas del gemelo
- `servir.py` — servidor local en el puerto 8767

## Cómo correrlo
```
python servir.py           # abre http://localhost:8767 en Chrome
python servir.py cnc/      # directo a la CNC
```
Web Serial solo funciona en Chrome o Edge de escritorio, y solo en `https://` o `localhost`.
Sin la máquina: botón **Simulación** en la barra.

## Publicar (GitHub Pages)
Repo: https://github.com/sebas30073007/fablab-tools. Cada push a `main` publica `web/` con `.github/workflows/pages.yml` (sin build).
1. Settings → Pages → Source: **GitHub Actions** (una sola vez).
2. Subdominio: Settings → Pages → Custom domain (p. ej. `fablab.sebs.mx`) y un registro CNAME en el DNS de sebs.mx hacia `sebas30073007.github.io`. Con Actions no hace falta archivo `CNAME`.
3. `web/cnc/ejemplos/` (carrito y KiCad Basics) va público junto con el sitio.
