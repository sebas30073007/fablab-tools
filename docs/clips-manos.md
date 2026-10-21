# Clips con manos 3D

Videos cortos del tutorial de la CNC: una mano 3D hace lo que hay que hacer fuera de la app. Página en `web/demo/manos/`
(fablab.sebs.mx/demo/manos/, todavía no enlazada desde la app). «Grabar» descarga cada clip como `.webm`.

## Clips (en el orden de uso)

| # | Clip | Qué muestra |
|---|------|-------------|
| 1 | Enciende | corriente atrás a la derecha; ON/OFF en el costado derecho; el E-STOP; se prenden franja, pantalla y luz |
| 2 | Conecta el USB | USB-B atrás en el costado derecho |
| 3 | Quita la tapa | con las dos manos: sube, sale al frente y va a un lado. Sin tapa se mueve y hace homing, pero el husillo no enciende |
| 4 | Pon la placa | con las dos manos, de las orillas, cobre arriba, al centro |
| 5 | Sujeta la placa | el sujetador desliza bajo su tornillo; acercamiento a la llave Allen de 3 mm apretando |
| 6 | Las herramientas | V, maíz y broca en la pinza, y en fila con su nombre |
| 7 | Pon la fresa en V | acercamiento sin mano: dos llaves de 13 (pinza y tuerca), afloja, cambia la broca por la V, aprieta |
| 8 | Homing | sube Z y busca los topes de X y Y |
| 9 | X0 Y0 | jog de 10 mm y de 1 mm hasta la esquina de adelante a la izquierda; aparece el cero |
| 10 | Conecta la sonda | conector en Leveling; la horquilla bajo el tornillo del sujetador de adelante; el caimán en la fresa |
| 11 | Toca la placa | baja despacio, contacto, Z0 |
| 12 | Mapa de alturas | 4 × 3 toques sobre la placa |
| 13 | Quita el caimán | antes de fresar (la horquilla se queda) |
| 14 | Pon la tapa | lo mismo que quitarla, al revés |
| 15 | Prueba en aire y fresa | 5 mm arriba y luego cortando (surco y polvo), mano junto al PARO |
| 16 | Paro de emergencia | se presiona el rojo y todo se detiene |
| 17 | Aspira el polvo | aspiradora de mano por pasadas |
| 18 | Saca la placa | afloja, retira sujetadores, desliza y levanta con las dos manos |
| 19 | Apaga | ON/OFF |

## Datos de la máquina (fuentes)

- **Plano de la cama** (SainSmart, `cubiko_platform_drawings.pdf`): aluminio 180 × 120 × 5.5, esquinas R5, 34 roscas M5
  (rejilla 6 × 5 con paso 33.2 × 26.5 y cuatro extra en 23.6 | 156.4, 20.25 | 99.75), hoyo mayor en (163, 111.5).
- **Manual** (Cubiko Instruction V1.1, abr 2025): tornillos M5 de cabeza plana con hexágono (8 a 40 mm), llaves Allen de
  3 y 2.5 mm, dos llaves de 13 mm, dos sujetadores de aluminio, V de 20° y brocas de 1/8". El cable de alturas va entre
  la herramienta y el material y se conecta en el puerto de adentro; en las fotos del manual, un caimán muerde la fresa y
  una horquilla roja va bajo el tornillo de un sujetador (el sujetador pisa el cobre).
- **Fotos de la Cubiko del Fab Lab** (20 oct 2026): botones, puertos, conectores, riel, luz, sujetadores y pinza.
- Medido en las fotos (no viene en el plano ni en el manual): el sujetador (44 × 15, pie de 9.5, lengüeta) y la pinza
  (tuerca y caras planas de 13).

## Cómo está hecho

- `web/cnc/js/cubiko.js`: la máquina (la comparte el visor de la app). Exporta `crearSujetador`, `construirHerramienta`.
- `web/demo/manos/accesorios.js`: caimán (dos mitades que giran sobre el perno, mordazas dentadas, funda con estrías),
  horquilla, llave Allen (hexágono barrido con su doblez), llave de 13, clavija USB-B, conector, aspiradora, cables.
- `web/demo/manos/escena.js`: escena, placa con su surco, sujetadores en las roscas reales, estado de la máquina.
- `web/demo/manos/clips.js`: los clips. Cuadros de mano libres (`pos`, `rot`, `pose`, `en` = en el marco de un objeto) o
  de agarre (`agarra`, `palma`): en un agarre la mano sigue al objeto y los dedos se cierran hasta tocarlo.
- `web/shared/js/manos.js` + `contacto.js`: la mano. Su piel (1360 vértices) se calcula con sus huesos y se mide contra
  cada pieza (caja o cilindro de su geometría): los dedos se abren lo justo para no atravesar y los que agarran se
  cierran hasta el contacto. El pulgar tiene un quinto giro (sobre su eje) para oponerse al índice. `empuja` en un
  cuadro aleja toda la mano si aún atraviesa algo.
- **Fluidez (21 oct 2026):** el contacto ya no se calcula en cada cuadro (hacía temblar los dedos). Antes de reproducir
  un clip se «hornea»: en el instante de cada cuadro clave se ajustan los dedos a lo que tocan y se guarda esa pose. Al
  reproducir solo se interpola entre poses fijas; la posición sigue una curva de Hermite, así que la mano pasa sin
  frenar por los cuadros intermedios y solo se detiene en los extremos, al agarrar o donde un cuadro diga `alto`. Lo
  que se atraviese entre cuadros lo esconde la cámara (la mano de canto o de dorso, el objeto delante de los dedos).
- En esta mano la pinza (pulgar → yema del índice) va casi a lo largo de los dedos, bajo la palma: el antebrazo sale del
  lado del pulgar. Por eso cada agarre dice qué caras se aprietan (`eje` del objeto) y hacia dónde mira la palma.

## Videos (tutorial y examen)

`python tools/grabar_clips.py` (o `... usb,sonda`) graba los clips como MP4 1280 × 720 a 30 cuadros por segundo con el
subtítulo dentro, más un póster JPEG, en `web/videos/manos/` (y la lista `clips.json`). Usa Edge sin ventana con la GPU
(`?grabar`: cada cuadro en un tiempo exacto) y ffmpeg; los 19 tardan ~2 min. Volver a grabar después de editar poses.

Dónde se ven (`web/cnc/js/videos.js`):
- **Manual**: cada paso tiene botones ▶ que abren su video encima.
- **Recorrido guiado**: los pasos con `video` (encender, homing, sujetador, sonda, mapa, quitar la sonda, poner la tapa,
  PARO, cambio de herramienta) lo muestran en la tarjeta, en bucle y sin sonido.
- **Examen**: 7 preguntas con video (tapa, homing, sujetador, herramientas, cambio de fresa, sonda, quitar la sonda).

## Editor de manos (`?editar`)

fablab.sebs.mx/demo/manos/?editar. Panel a la derecha y, bajo la barra de tiempo, una pista por mano con sus
cuadros clave (rombos; negros = editados a mano, cobre = el elegido).

- **Derecha / Izquierda**: elige la mano; si el clip no la tiene, la agrega. «Quitar mano» borra su pista.
- **+ Cuadro aquí** (K) agrega un cuadro en el tiempo actual; ◀ ▶ (flechas) saltan entre cuadros; Borrar (Supr).
- En un cuadro: la flecha en la palma mueve (W) o gira (E) la mano; las barras doblan cada dedo; «Pose» aplica una
  pose con nombre; «Tiempo» mueve el cuadro; «Sigue a» lo pega a un objeto (la placa, la tapa, el caimán…).
- Un cuadro tocado queda **manual**: se reproduce tal cual, sin el ajuste automático de contacto.
- Se guarda solo en el navegador (borrador). **Guardar archivo** descarga `poses.json`; ese archivo, junto a
  `index.html`, reemplaza las pistas de mano de los clips que trae, para todos. «Descartar este clip» borra el borrador.

## Prueba

- `?prueba` (o `?prueba=usb,sonda`): recorre cada clip a 15 cuadros por segundo y reporta cuánto entran la piel (por
  dedo y palma), la manga y los cables en algo, con el momento y la pieza. Resultado en `<pre id="reporte">`.
- `?fluidez` (o `?fluidez=usb`): sigue la muñeca y las puntas de los dedos a 60 cuadros por segundo y reporta el
  cambio de velocidad más brusco; por debajo de ~40 se ve fluido.
- `?hoja=usb&n=8`: tira de cuadros de un clip, para revisarlo de un vistazo.
- `?mano=agarre&ancho=8`: la mano sola en una pose, de tres lados (azul: punta del pulgar; rojo: yema del índice).
- `?clip=usb&t=3.2` congela un cuadro; `&cam=x,y,z&mira=x,y,z` fija la cámara.
- Estado del 20 oct 2026: 14 de 19 clips sin nada que atraviese más de 1 mm; los demás, 5 mm o menos en momentos
  cortos (sobre todo cables al soltar algo y el pulgar sobre la clavija USB).

## Pendiente

- Enlazar los clips desde el manual y el recorrido guiado (cada paso con su clip).
- Sujetadores en el visor de la app (tendrían que seguir el tamaño de la placa).
