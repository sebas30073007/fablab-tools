# Bitácora

## 2026-10-08 · Arranque
- Origen: llegó a la universidad una Genmitsu Cubiko. Dos días haciéndola funcionar con Candle 1.1.7 y ChatGPT; las interfaces no son intuitivas. El Fab Lab abrirá pronto y la idea es un catálogo de herramientas web sin instalar nada. Lecciones en `docs/cubiko.md`.
- Decisiones: hub + CNC primero; sitio estático en GitHub Pages con subdominio de sebs.mx (Sebastián publica); marca SEBS, ID FAB-01, acento Copper; CAD del fabricante por conseguir.
- Hecho:
  - núcleo GRBL por Web Serial
  - emulador GRBL
  - visor 3D provisional
  - flujo de 7 pasos con asistentes:
    - Z con sonda (indicador de contacto, reintento tras ALARM:5)
    - Z sin sonda
    - XY
    - alineación con 2 agujeros
    - cambio de fresa
  - mapa de alturas (`.map` de Candle)
  - CAM Gerber → PNG en blanco y negro → pistas, hoyos y contorno con puentes
  - envío con prueba en aire, pausa y PARO
- Probado en simulación con la placa `carrito-base-tb6612`:
  - pistas: 5592 líneas, 32 min
  - hoyos: 64 líneas
  - contorno: 3128 líneas con puentes
  - sonda: ALARM:5 provocado y luego éxito
  - mapa: 5×6 puntos, variación de 0.18 mm
  - prueba en aire, pausa, reanudar, PARO
  - cambio de fresa
- **Pendiente:**
  - probar con la Cubiko real: `$$`, contacto `Pn:P`, Z0 en placa de prueba, prueba en aire, fresado
  - comparar el .nc generado con los de `E:\00_INBOX\Cubiko_*` en Candle
  - conseguir el CAD
  - decidir si el ejemplo del curso va público
  - publicar

## 2026-10-08 (noche) · Laboratorio de UI tipo OPI
- Sebastián pidió tomar la arquitectura de Casita/OPI (Samsung Health) en tonos claros, como experimento frente a SEBS estricto. Propuesta con maquetas: https://claude.ai/artifact/CtsrEdgGjKxUzqamHEZueK
- Hecho:
  - el panel ahora es una app móvil:
    - barra Inicio · Mover · Consola con «+» de acciones rápidas
    - widgets en Inicio («Ahora» dice el siguiente paso; «En curso» mientras fresa; alarma con salida)
    - detalles de nivel 2
    - hojas que suben dentro del panel para asistentes y confirmaciones
  - se quitó la barra de pasos de arriba; la barra superior solo tiene la marca y PARO
  - selector de vista y coordenadas flotando sobre el 3D
  - interruptor Laboratorio | SEBS en Máquina → Apariencia
  - mascota Fresa con gafas: 6 poses generadas en ChatGPT con las referencias de OPI (`web/img/fresa`)
  - accesibilidad:
    - hojas modales con foco atrapado
    - región aria-live
    - Esc = PARO si algo se mueve; si no, cierra la hoja
    - teal de texto con contraste
    - punto rojo de alarma en Inicio
- Decisiones tomadas por defecto (cambiables): barra Inicio · Mover · Consola, acción principal en píldora grafito, Laboratorio como piel opcional (por defecto activa).
- Probado en simulación:
  - conectar, bloqueo inicial, homing
  - ejemplo, generar, Mover, fijar X0 Y0
  - asistente de Z completo como hoja
  - hoja de trabajo, cambio de fresa, acciones rápidas
  - prueba en aire «En curso»
  - ALARM:2 desde Mover (regresa a Inicio con la mascota de alerta)
  - piel SEBS

## 2026-10-08 (cierre) · Gemelo fiel de la Cubiko
- Se buscó un CAD o render: no existe público (solo spoilboards en Printables y MakerWorld).
- Se recreó con primitivas en `web/cnc/js/cubiko.js` a partir de las fotos de la reseña de SainSmart y de las medidas oficiales (300 × 335 × 318 mm).
- Lo que se modeló:
  - base de dos niveles con chaflanes
  - torre en «C»
  - eje X con varillas, husillo y barra LED
  - carro con NEMA 17
  - husillo «Genmitsu» con rejilla y ER11
  - cama con roscas M5 y ranuras
  - control con pantalla en vivo
  - acrílico ahumado
- Desde arriba se ocultan el techo y la tapa.
- Captura en `media/`.

## 2026-10-09 · Imagen del catálogo y tutorial
- Tarjeta de la CNC en el catálogo: la Cubiko en felpa (ChatGPT, con una foto de la reseña de SainSmart como referencia), `web/img/cnc-cubiko.webp`.
- Botón **Tutorial** en la barra, a la derecha de «CNC». Abre una ventana con dos opciones:
  - **Manual de uso:** los 8 pasos para fabricar una PCB, con imagen y checks; se puede imprimir.
  - **Tutorial guiado** («Si es tu primera PCB, te recomendamos esta opción»): oscurece todo menos el botón que hay que pulsar y Fresa explica en un globo. Recorre conectar en simulación, homing, ejemplo, imagen y parámetros, generar, X0 Y0, Z con el asistente, prueba en aire y PARO.
- El recorrido está escrito en 10 bloques independientes con anclas estables (`data-tour`, `data-acc`, `data-tab`):
  - se salta lo que el estudiante ya hizo
  - ofrece «Hazlo por mí»
  - si cambia la interfaz, se rehace solo el bloque afectado (`docs/tutorial.md`)
- 5 poses nuevas de Fresa: senala, explica, piensa, celebra, lupa.
- Probado en simulación de principio a fin, en Chrome.

## 2026-10-09 (tarde) · Tutorial por los 6 pasos, examen y certificado
- **Reloj de «En curso»:** el «quedan» se calculaba por líneas confirmadas; si una línea larga tardaba, la estimación crecía casi un minuto por segundo. Ahora sale del tiempo estimado de cada línea del G-code (`tiempoAcumulado` en `gcode.js`), corregido y suavizado con el ritmo real. Dice «lleva X · quedan ~Y» y el % también es por tiempo.
- **Manual = los 6 pasos de Tu placa** (Máquina, Archivos, Trayectorias, X0 Y0, Z0, Fresar), más «Antes» (exportar, fijar la placa) y «Al terminar» (acabado). La prueba en aire quedó dentro de Fresar. Imagen nueva `xy.webp`, recortada de `placa.webp`.
- **Recorrido guiado rehecho:**
  - capítulos iguales a los 6 pasos; de 37 a 29 tarjetas
  - tres clases de tarjeta: Concepto (ⓘ, centrada), Interfaz y Tu turno (ícono de clic pegado al botón)
  - Fresa siempre a la izquierda
  - «Paso n de 6» arriba y «tarjeta n de m» abajo
  - lo resaltado se puede tocar para explorar
  - menos saltos de posición
- **Selector del tutorial:** el tutorial guiado usa una escena del manual con Fresa adentro. Se agregó la opción «Examen y certificado».
- **Examen:** 30 preguntas, 15 al azar, 80 % para aprobar, intentos ilimitados.
- **Certificado:** nombre del estudiante, folio y calificación; PDF armado sin librerías.
- **Ejemplo:** el botón Ejemplo ahora abre la placa del curso básico de KiCad (`ejemplos/kicad-basics/`).
- Probado en simulación en Chrome:
  - recorrido completo
  - explorar una pestaña resaltada
  - reloj de un trabajo de 19 min
  - examen reprobado (11/15) y aprobado (13/15)
  - PDF abierto en el visor de Chrome

## 2026-10-09 · Vista de la imagen de la placa
- La vista previa de Pistas, Hoyos y Contorno ahora pinta en blanco lo que queda fuera de la placa y marca el contorno con una línea negra de 0.3 mm (`vista()` en `raster.js`). Antes el fondo negro tapaba el contorno.
- Solo cambia lo que se ve: `pcb.imgs` sigue igual porque de ahí salen las trayectorias y el PNG para mods.

## 2026-10-09 (noche) · Material, surco animado y material chueco
- **Material** (Placa → Material): ancho, alto y grosor de la placa virgen, y dónde va el diseño dentro de ella (por defecto 100 × 70 × 1.6 mm, diseño a 3 mm de la esquina).
  - Se dibuja a escala en el panel y en el 3D. Si el corte (con el radio de cada herramienta) se sale, avisa por qué lado y cuánto; sugiere Centrar o Girar 90° cuando eso lo arregla. También avisa en Inicio y al confirmar Fresar.
  - **Cambia el origen del G-code:** X0 Y0 ahora es la esquina inferior izquierda del material, no la del diseño (`origenDe(m, desp)` en `cam.js`). Con el diseño en 0, 0 queda igual que antes.
  - Mover el diseño vuelve a generar las trayectorias; ya no se puede mover cuando un trabajo está hecho.
  - El simulador toca el cobre a la altura del grosor que se puso (`SUPERFICIE` en `grbl-sim.js`).
- **Surco animado:** la cara de cobre es un lienzo. Donde la punta baja de Z0 se pinta un surco del ancho de la herramienta, con color y relieve según lo hondo: rayón en el cobre, sustrato o atravesado (`cortar()` en `visor.js`). Con el simulador se usa todo su rastro, así salen las esquinas aunque vaya acelerado; con la Cubiko, los reportes de posición. La prueba en aire no deja surco.
- **Trayectorias sobre la superficie:** lo que va debajo de Z0 se dibuja sobre el cobre, no enterrado. Lo ya hecho se aclara para que se vea el surco.
- **Material chueco** (Ceros): con la esquina y un punto del borde de abajo sale el giro, y las trayectorias y el material del 3D se giran igual. Bastan dos puntos porque el material es un rectángulo.
- **Pistas:** las pasadas desplazadas hacia afuera ya existían; ahora se ven el ancho aislado («aísla 0.30 mm») y un dibujo de las pasadas.
- Ya no se pueden correr dos trabajos a la vez, y el aro de contacto de la sonda se oculta mientras se fresa.
- Probado en simulación en Chrome:
  - el ejemplo en materiales de 100 × 70, 50 × 70 (no cabe) y 70 × 50
  - mover el diseño
  - surco de pistas y de un corte que atraviesa
  - alinear con el borde (2.5°)

## 2026-10-11 · Ejes y homing
- Ejes con la convención de siempre: X rojo, Y verde, Z azul (letras del visor, Mover, minijog y flechas del cero en 3D). El rojo de X (`#D63A2F`) es otro que el de PARO.
- Homing: en la Cubiko real, vista de frente, el husillo va a la izquierda y la cama hacia atrás. El simulador antes iba al revés (a MPos 0,0,0). Ahora sigue `$23` como GRBL: con `$23=3` termina en X −143 Y −108 Z −2. Falta confirmarlo leyendo `$$` en la máquina.

## 2026-10-11 · Gemelo y panel, segunda vuelta
- Gemelo 3D: la franja verde ya no pasa del chaflán izquierdo; sin el cable que salía por la derecha con X al máximo; carro X, cabezal y rieles de la cama más al frente (`Z_FRESA` −58 → −30), así la cama hasta atrás ya no atraviesa la pared del fondo; de lado, la torre opaca ocupa 2/5 y la tapa ahumada 3/5.
- Inicio: «Ahora» y «Tu placa» en un solo widget (los pasos arriba abren la lista; la mascota baja para no tapar la flecha). «Placa» → **PCB**, «Ceros» → **Origen** (X0 Y0 arriba, Z0 abajo). Se quitó el widget de Alturas: el mapa vive dentro de Z0, en Origen.
- PCB: Material con ancho (X), alto (Y) y grosor (Z) en sus ejes del dibujo y «Offset izquierdo / inferior»; Configuración en una página aparte; la imagen en blanco y negro, plegada y abajo. «Material nuevo» ahora sale solo si hay cortes en el 3D, como «Borrar cortes del 3D».
- Configuración (`js/herramientas.js`): Pistas, Hoyos, Contorno y Husillo a la vista, con unidades. Cada una con la silueta de su herramienta y dibujos que cambian al escribir (corte de lado, pasadas, puentes, Z seguro); al enfocar un campo se resalta lo que cambia y sale una frase de qué hace. Brocas estándar en un selector y los hoyos del diseño marcados según el rango.
- Origen → **Calibración fina**: alinear con el borde y con 2 agujeros, cada uno con dibujo y cuándo usarlo; dice por qué está bloqueado.
- Navegación de nivel 3 (la flecha regresa al detalle padre). Tutorial, manual, examen y docs al día con los nombres nuevos.
- Ajustes tras revisarlo con Sebastián:
  - Sin mascota en «Ahora» cuando no hay botones (Homing…, Conectando…), porque solo se le veía la cabeza.
  - Material: Ancho centrado bajo la cota de X y Grosor abajo a la izquierda; ya sin canto verde ni cota Z.
  - Configuración:
    - Sin subtítulos y sin el texto que cambiaba al pasar el mouse; la explicación sale en una etiqueta junto al puntero.
    - El cobre se dibuja igual de grueso en todos los dibujos.
    - Broca en una lista desplegable (0.3–3.175 mm).
    - El rango de hoyos se lee como frase junto a los hoyos del diseño.
    - Contorno en dos dibujos en vez de tres: la placa con sus puentes y uno de cerca.
  - Simulación: al conectar, la máquina arranca al centro (antes retomaba dónde quedó la última vez) y el homing sale de ahí.

## 2026-10-12 · Vistas angostas
- Tres anchos, el mismo patrón en la CNC, Pólux y la Flota AGV (`docs/laboratorio-ui.md` → Anchos): ancho ≥ 1100 px; medio 720–1099 px, lado a lado con el panel más angosto; teléfono < 720 px, con barra, 3D y panel a pantalla fija, solo el panel se desplaza y la barra inferior siempre se ve.
- CNC: el 3D se agranda con su botón ⤢ (`#btn-visor`, se recuerda); la cámara se aleja en un visor vertical; las hojas se abren sobre toda la pantalla; Tutorial queda solo con ícono; el pad de Mover se encoge.
- CNC: el tutorial pone el globo abajo o arriba del objetivo, a todo lo ancho; la ayuda de Configuración sale al enfocar en pantallas táctiles; objetivos de 44 px con dedo; zona segura.
- Hub: en teléfono, el aviso del navegador baja a su renglón.

## 2026-10-12 · Gemelo y sonda con la Cubiko real
- La Cubiko real trae HOMING_FORCE_SET_ORIGIN (`[OPT:VMZ0L]`): tras `$H` su posición es 0,0,0 y el recorrido es positivo. El gemelo suponía el marco estándar (negativo) y se quedaba a medio recorrido, con la placa fuera de la cama. Ahora `aGemelo()` traslada lo que llega de la máquina; la máquina gobierna y, al confirmar el homing, el gemelo salta a casa con ella. El simulador deja de anunciar la «Z» (ya usa el marco estándar).
- Calibrar Z se quedaba en «Bajando…» tras tocar: el sondeo solo terminaba si leía `[PRB:x,y,z:1]` con tres números. Ahora acepta más ejes y espacios, y si llega el `ok` sin un `[PRB]` legible toma la posición actual (sin contacto habría ALARM:5).
- Pistas: «Ancho de corte» se reemplaza por **Punta** y **Ángulo** de la fresa en V (por defecto 20° 0.1 mm); el ancho sale de punta + 2·profundidad·tan(ángulo/2) (`anchoV` en cam.js) y el dibujo usa el ángulo real. Los ajustes guardados sin esos campos toman la fresa por defecto.
- Contorno se detenía en la esquina de inicio: su cabecera llevaba un paréntesis dentro de otro, la limpieza de comentarios dejaba un «)» suelto, GRBL lo rechazaba (error:1) y la app dejaba de enviar mientras la máquina terminaba las ~10 líneas de su búfer. Ahora los comentarios no llevan paréntesis, `correr` limpia como GRBL (hasta el primer «)») y descarta sobrantes, y si GRBL rechaza una línea sale un aviso con la línea y el error.

## 2026-10-12 · Láser xTool S1: base y simulador (camino A)
- Origen: segunda máquina del Fab Lab, una xTool S1 40 W (la tiene un compañero). Se analizó cómo controlarla sin xTool Studio. Decisión: camino A (USB + Web Serial, G-code en streaming como LightBurn) y después camino B (subir el archivo con el protocolo `f3f4` de xTool Studio). Mascota: Kiwi.
- Fuentes del protocolo:
  - la extensión de la S1 dentro de xTool Studio 1.9.11 (`resources/exts.zip` → `S1/index.js`): encabezado del G-code, tabla de estados `M222`, consultas, movimiento
  - ha-xtool (Home Assistant, probado en una S1)
  - foro de LightBurn
  - Todo en `docs/xtool-s1.md`.
- Compartido entre apps (`web/shared/`):
  - `serie.js` (Web Serial + cola con `ok`; `Grbl` ahora lo extiende)
  - `ui.js` con `crearLs`, `navegacion.js`, `iconos.js`
  - `gcode.js` con potencia del láser por tramo
  - `visor-base.js` (el visor de la CNC lo extiende)
  - `css/app.css`, `lab.css`, `tutorial.css`
  - La CNC quedó igual: probada en Simulación (homing, ejemplo, trayectorias, hoyos completos sin errores).
- App `web/laser/`:
  - protocolo `s1.js` con perfil por confirmar y bloqueo de órdenes peligrosas
  - simulador con tapa y flama
  - SVG → capas por color (corte, marcado, grabado), imagen → tramado Jarvis, Floyd, umbral o grises
  - biblioteca de 7 materiales (por validar) y lista de prohibidos
  - encuadre, 6 pasos en Inicio
  - gemelo 3D de la S1 hecho a mano con medidas oficiales (no hay modelo público), con rayo, cruz roja, tapa que se abre y quemado sobre el material
  - `diagnostico.html` para la máquina real
- Probado:
  - en Node, `s1.js` contra el simulador: conexión, casa, mover, trabajo con láser, alarma de tapa, bloqueo, pausa y reanudar
  - en Chrome, con el ejemplo del llavero: 3 capas, 1624 líneas, encuadre y corte completo (1619 líneas `ok`), quemado visible en el gemelo
- **Pendiente:**
  - correr `diagnostico.html` con la S1 y ajustar `perfil-s1.js` (baud, `ok`, escala de S, búfer, enfoque, botón)
  - validar la biblioteca de materiales con matrices de prueba
  - generar las poses de Kiwi y la tarjeta del catálogo (`docs/kiwi.md`)
  - tutorial y examen del láser
  - camino B (`f3f4`)

## 2026-10-12 · Kiwi y la tarjeta del láser
- Kiwi rediseñado:
  - el primer intento (rodaja con patas, bordado, infantil) se descartó
  - de una hoja de tres propuestas «de la familia de Fresa» se eligió la media fruta: cara en la pulpa, torso café, lentes de laboratorio, felpa flocada sin costuras
- 12 poses en `web/img/kiwi/`, recortadas a 440 px como Fresa.
- Tarjeta del catálogo `web/img/laser-s1.webp`: la S1 en felpa, hecha con la tarjeta de la Cubiko y una captura del gemelo 3D como referencias (sin fotos de xTool).
- Detalle y prompts en `docs/kiwi.md`.
