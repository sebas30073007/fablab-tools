# Laboratorio de UI (estilo OPI en claro)

fablab-tools es el banco de pruebas para llevar la arquitectura de OPI (Casita, tomada de Samsung Health / One UI) a las apps SEBS, en tonos claros. Lo que funcione aquí se pasa a la skill `sebs-brand` y a los demás proyectos.

- **Dónde vive:** `web/shared/css/app.css` (componentes y piel SEBS), `web/shared/css/lab.css` (piel Laboratorio), `web/shared/js/ui.js` (hojas, asistentes), `web/shared/js/navegacion.js` (niveles del panel), `web/shared/js/iconos.js` (íconos). Cada app pone sus widgets y páginas en su `js/vistas.js` (`web/cnc/`, `web/laser/`).
- **Para comparar:** Máquina → Apariencia: Laboratorio | SEBS. Se guarda por navegador (`fablab.cnc.estilo`).

## Arquitectura

| Nivel | Qué es | En la CNC |
|---|---|---|
| 0 | Destinos de la barra inferior | Inicio · Mover · Consola, y el «+» redondo aparte |
| 1 | Widgets de Inicio, uno por renglón | Ahora (con los pasos arriba) · PCB · Origen · Trabajos |
| 2 | Detalle de un widget: entra por la derecha y la flecha regresa al padre | Pasos · Máquina · PCB · Origen |
| 3 | Lo que se abre desde un detalle; la flecha regresa a ese detalle | PCB → Configuración · Origen → Mapa de alturas, Calibración fina |
| Hoja | Lo corto sube desde abajo, dentro del panel, sin tapar el 3D | Asistentes de Z y alineación · cada trabajo · confirmar · acciones rápidas |

- **Widget «Ahora».** Arriba, «Paso 3 de 6 · Trayectorias» con la barra de pasos: es un botón que abre los 6 pasos (antes era otro widget, «Tu placa», que repetía la misma información). Abajo, el siguiente paso con su botón; la mascota va a la altura del texto para no tapar la flecha. Cuando hay un trabajo corriendo se vuelve «En curso»: porcentaje, tiempo que queda, tira de trabajos medida por duración, «Luego», y Pausar con PARO. Cuando hay una alarma se vuelve la alarma: qué pasó, los pasos para salir y Desbloquear u Homing.
- **Explicar un campo.** Lo que cambia se resalta al instante en su dibujo; la frase de qué hace sale en una etiqueta junto al puntero tras un momento encima (y es la descripción del campo para el lector de pantalla). Nunca un texto fijo que cambia al pasar el mouse: confunde.
- **Mascota.** Solo donde cabe completa: si un widget queda bajo (sin botones), va sin mascota.
- **Portada y detalle.** La portada lleva lo mínimo (cifra, miniatura o celdas) y un chevron. El chevron solo aparece si el widget abre algo; un widget con botones propios no es botón.
- **Hojas.** Las hojas se usan para lo corto y las páginas para lo largo (imágenes, parámetros, listas).
- **Asistentes.** La tira de fases va arriba, el título de cada paso es la instrucción y el botón principal va abajo a todo el ancho.
- **Acciones rápidas.** Rejilla de dos columnas, solo ícono y nombre, deshabilitadas cuando no aplican.
- **Alarmas.** Se ven desde cualquier pestaña: un punto rojo en «Inicio» y, si no hay una hoja abierta, la app regresa a Inicio sola.

## Piel Laboratorio

**Superficies:**
- Fondo `#F3F4F6`, tarjetas blancas con un filo de 1 px `#E4E6EA` y sin sombra.
- Riel o selector `#ECEEF1`.
- La sombra solo va en lo que flota: barra inferior, «+», selector del visor, píldoras de coordenadas y hojas.

**Radios:**

| Elemento | Radio |
|---|---|
| Widget | 22 |
| Hoja | 28 arriba |
| Celdas | 14 |
| Campos | 12 |
| Botones, selectores y chips | píldora |
| Botones del pad | 18 |

**Acción principal:** píldora grafito con texto blanco. En la piel SEBS, cobre con texto grafito.

**Tipografía (Manrope):**

| Uso | Tamaño / peso |
|---|---|
| Título de página | 24/800 |
| Título de nivel 2 | 19/800 |
| Cifra | 26/800 con unidad 13/600 gris |
| Título de widget | 13/600 |
| Texto principal | 18/700 |
| Secundario | 12.5 |

Plex Mono solo para coordenadas, valores y archivos.

**Color = dato:**

| Dato | Color |
|---|---|
| X | azul |
| Y | teal (`#007E6E` cuando es texto) |
| Pistas | azul |
| Hoyos | teal |
| Contorno | violeta |
| Listo / contacto | verde |
| Aviso | naranja |
| Paso actual / lo que se fresa | cobre rayado |
| PARO y alarma | rojo, y nada más |

Las cifras van en el color del texto.

**Barras:** píldoras compuestas. Las puntas son redondas y las caras que se tocan llevan un radio leve. Las metas que se cuentan van en rayitas (una por paso).

**Mascota:** la Fresa de OPI con gafas de seguridad (`web/img/fresa/*.webp`, generadas con ChatGPT sobre las referencias de OPI). Va una por pantalla y según lo que pasa:

| Momento | Pose |
|---|---|
| Saludo | hola |
| Calibrar Z | sonda |
| En curso | fresando |
| Terminado | placa |
| Sin archivos | archivos |
| Alarma | alerta |
| Tutorial: señalar un botón | senala |
| Tutorial: explicar un concepto | explica |
| Tutorial: pregunta («¿Qué es una CNC?») | piensa |
| Tutorial: revisar | lupa |
| Tutorial: fin | celebra |

En el tutorial habla una sola Fresa: la del globo. Mientras está activo se ocultan las de los widgets, y si hay una hoja abierta habla la de la hoja.

## Anchos

Vale igual para la CNC, Pólux (manipulador-3dof) y la Flota AGV: cada una lo escribe en su CSS, al final, bajo «Anchos».

| Ancho | Cuándo | Cómo se ve |
|---|---|---|
| Ancho | ≥ 1100 px | 3D a la izquierda, panel de 400 px a la derecha |
| Medio | 720–1099 px (media pantalla, tableta, teléfono acostado) | Igual, lado a lado, con `--panel-w: clamp(320px, 36vw, 400px)`. La barra en un renglón: sin subtítulo, y lo secundario solo con ícono (su nombre en `aria-label`). |
| Teléfono | < 720 px | Barra · 3D · panel en una columna, a pantalla fija (`100dvh`). |

**En teléfono:**
- No se desplaza la página, solo el panel. La barra inferior siempre se ve.
- El 3D se agranda o se achica con su botón (⤢, `aria-pressed`); la elección se recuerda.
- Las hojas se abren sobre toda la pantalla, con `max-height: 88dvh`.
- PARO o ALTO siempre en la barra, con texto.
- Lo que flota sobre el 3D se hace más compacto.
- La cámara se aleja si el visor queda vertical: el campo de visión es vertical y si no, la máquina se corta a los lados.

**Siempre, en cualquier ancho:**
- `viewport-fit=cover` y márgenes con `env(safe-area-inset-*)`.
- Con `(pointer: coarse)`, todo lo que se toca mide al menos 44 px.
- Con `(hover: none)`, se ocultan las leyendas del mouse, y lo que salía al pasar el mouse sale al enfocar.
- Lo que depende del ancho del panel y no de la pantalla va con `@container`.

## Reglas de texto y accesibilidad

**Texto:**
- El botón dice lo que pasa: «Conectar», «Fijar aquí», «Calibrar con la sonda», «Fresar».
- Sin subtítulos que expliquen el botón y sin eyebrows.
- Un secundario solo si aporta un dato (herramienta, tiempo, «Esquina inferior izquierda de la placa»).
- Nunca línea de color al costado. Un estado se marca con relleno tenue más ícono o punto, y siempre con texto (Fijado / Pendiente / Hecho).

**Accesibilidad:**
- Objetivos táctiles de 44 px o más; los botones principales de las hojas miden 50 px.
- Las hojas son `role="dialog"` con `aria-modal`. El foco entra al abrir, no se escapa con Tab y regresa al cerrar.
- **Esc:** si algo se mueve, hace PARO; si no, cierra la hoja.
- Región `aria-live` (`#anuncio`): anuncia el siguiente paso, «Z0 fijado», alarmas y trabajos terminados. El widget de alarma lleva `role="alert"`.
- Selectores con `role="radiogroup"` y `aria-checked`; la pestaña actual con `aria-current="page"`.
- El teal como texto usa `#007E6E` por contraste. Se respeta `prefers-reduced-motion`.

**Movimiento:**

| Transición | Duración |
|---|---|
| Página que entra (desde ±28 %) | 340 ms |
| Hoja que sube | 320 ms |
| Velo | 280 ms |
| Cambio de pestaña (fundido) | 220 ms |

Curva: `cubic-bezier(.2,.8,.2,1)`.

## Tutorial

El botón Tutorial de la barra abre una ventana centrada (no una hoja: el tutorial no es de la máquina) con el manual y el recorrido guiado. El recorrido oscurece todo menos el objetivo, con aro cobre («lo que toca ahora»), y lleva la Fresa en un globo. El contenido está escrito en bloques independientes para rehacerlos cuando cambie la interfaz. Detalles en `docs/tutorial.md`.

## Pendiente de decidir con uso real
- Si la piel Laboratorio sube a la skill `sebs-brand` como variante «app» o se queda por proyecto.
- Modelo 3D real de la Cubiko (hoy es por primitivas).
