# Tutorial de la CNC

El botón **Tutorial** de la barra abre una ventana con tres opciones:

| Opción | Qué es | Contenido | Imágenes |
|---|---|---|---|
| **Manual de uso** | Una página con los 6 pasos de Inicio (Máquina, Archivos, Trayectorias, X0 Y0, Z0, Fresar), más «Antes» (exportar de KiCad, fijar la placa) y «Al terminar» (acabado). Cada uno con imagen y checks; se puede imprimir. | `web/cnc/js/manual.js` | `web/img/manual/<id>.webp` |
| **Tutorial guiado** (recomendado para la primera PCB) | Fresa lleva al estudiante por los mismos 6 pasos y fabrican una placa en simulación. | `web/cnc/js/tutorial-bloques.js` | poses de Fresa en `web/img/fresa/` |
| **Examen y certificado** | 15 preguntas al azar de un banco de 30; se aprueba con 80 % (12 de 15) y se repite sin límite. Al aprobar, el estudiante escribe su nombre y descarga el certificado en PDF. | `web/cnc/js/examen.js` | Fresa `celebra` y el símbolo del Fab Lab |

- **Los 6 pasos son los mismos en tres lugares:** `pasos()` en `vistas.js` (la franja de pasos de «Ahora» y la página Pasos), `MANUAL.pasos` y los bloques con `paso: 1…6`. Si cambia uno, cambian los tres.
- **Motor:** `web/cnc/js/tutorial.js`.
- **Estilo:** `web/cnc/tutorial.css`.

## Cómo funciona el recorrido

- Oscurece toda la pantalla menos el objetivo (un hueco redondeado en un SVG) y le pone un aro cobre. El cobre ya significa «lo que toca ahora» en esta app.
- La tarjeta siempre tiene la misma forma:
  - arriba, dónde vas: «Paso 3 de 6 · Trayectorias» y la barra de los 6 pasos
  - Fresa siempre a la izquierda
  - el tipo de tarjeta, el título y el texto
  - abajo, la tarjeta dentro del paso: puntos y «2 de 5». El total se recalcula en cada tarjeta
- Hay tres clases de tarjeta, cada una con su ícono:

  | Clase | Tipo de paso | Dónde sale | Qué hace |
  |---|---|---|---|
  | **Concepto** (ⓘ) | `info` | ventana centrada | explica una idea |
  | **Interfaz** | `señala` | junto al objetivo | muestra una parte de la pantalla; avanza con Siguiente. Lo resaltado **se puede tocar para explorar**: si eso abre una hoja o cambia la vista, el velo se quita y la tarjeta espera a un lado |
  | **Tu turno** (clic) | `pulsa`, `espera` | junto al objetivo, con un ícono de clic pegado a lo que hay que pulsar | el estudiante hace la acción; `espera` va sin velo, para trabajar en una hoja |

- **Posición sin saltos:**
  - lo del panel sale a su izquierda, sobre el 3D
  - lo de la barra sale abajo
  - lo grande sale adentro
  - lo demás, abajo o arriba
- **Se adapta a lo que ya se hizo:** un paso `pulsa` o `espera` cuya condición `hasta()` ya se cumple se salta solo. Si la máquina ya está conectada, por ejemplo, no pide pulsar Simulación.
- **«Hazlo por mí»:** cada paso de acción tiene un `hazlo()` que hace lo mismo que el botón, por si el estudiante se atora o el botón cambió.
- **Si un objetivo desaparece** (cambió la interfaz), la tarjeta sale centrada y el paso sigue funcionando con Siguiente o «Hazlo por mí».
- **Accesibilidad:**
  - la tarjeta es `role="dialog"` y recibe el foco en cada paso
  - Tab recorre la tarjeta y el objetivo
  - Esc sale, pero PARO tiene prioridad si algo se mueve; durante un paso `espera`, Esc cierra la hoja
  - se respeta `prefers-reduced-motion`

## Bloques

Cada bloque es un capítulo independiente. Cuando cambie una parte de la interfaz, se rehace solo el bloque que la explica. Son 29 tarjetas en total.

| Bloque | Paso | Explica | Pide |
|---|---|---|---|
| `bienvenida` | — | tipos de tarjeta, qué es una CNC, gemelo 3D y vistas, los 6 pasos, Ahora y PARO | — |
| `maquina` | 1 | X/Y/Z, bloqueo al encender, origen de máquina | Simulación, Homing |
| `archivos` | 2 | archivos de KiCad, fresado de aislamiento | Ejemplo |
| `tray` | 3 | imagen en blanco y negro, parámetros, un trabajo por herramienta | Placa, Generar |
| `xy` | 4 | cero de trabajo, mover los ejes | Mover, llevar a la esquina, Fijar X0 Y0 |
| `z` | 5 | la sonda (circuito caimán–placa) | Empezar y el asistente de Z |
| `fresar` | 6 | prueba en aire, «En curso», qué sigue con una placa real | Prueba en aire, Probar, PARO |
| `mas` | — | Mapa de alturas y Calibración fina (en Origen), dónde volver al tutorial | — |
| `fin` | — | cierre | Hacer el examen, Manual o Terminar |

## Examen

- Las preguntas están en `PREGUNTAS` (`examen.js`) con la forma `{ q, ok, no: [distractores], por }`. El texto de `por` aparece al revisar lo que falló.
- Son de comprensión, no de memoria: escenarios («cambiaste a la broca, ¿qué recalibras?») y distractores que suenan bien.
- El mejor intento aprobado se guarda en `localStorage` (`fablab.cnc.examenAprobado`: aciertos, fecha, folio y nombre), así que el certificado se puede volver a descargar.
- El PDF se arma sin librerías: el certificado se dibuja en un canvas (A4 horizontal a 200 ppp), se exporta como JPEG y se mete en una página PDF (`pdfDeJPEG`).

## Anclas

Los objetivos se buscan por atributos que no dependen del estilo. **Si cambias una vista, conserva estos atributos o actualiza el bloque.**

- `data-tour`:

  | Dónde | Anclas |
  |---|---|
  | Barra | `tutorial` · `paro` |
  | Visor | `visor` · `coords` · `vistas` |
  | Panel | `mas` |
  | Inicio | `ahora` (con `pasos`, la franja que abre los 6 pasos) · `estado` · `w-placa` (PCB) · `w-origen` · `trabajos` |
  | PCB | `material` · `config` · `imagen` |
  | Configuración | `herr-pistas` · `herr-hoyos` · `herr-contorno` · `herr-comun` |
  | Origen | `mapa` · `fina` |
  | Mover | `posicion` · `pad` |

- `data-acc`: los botones de acción (`sim`, `homing`, `ejemplo`, `generar`, `mover`, `fijar`, `paso`, `aire`…).
- `data-tab`: la barra inferior (`inicio`, `mover`, `consola`).
- `data-tour-zona`: el panel; los globos de lo que está adentro salen a su izquierda.

## Rehacer un bloque

1. Abre `tutorial-bloques.js` y busca el bloque por su `id`.
2. Cambia sus pasos (el formato está comentado al inicio del archivo).
3. Para probar desde ese bloque, en la consola del navegador:
   ```js
   const c = __cnc; c.recorrido.iniciar(c.app); c.recorrido.bi = 3; c.recorrido.pi = -1; c.recorrido.siguiente();
   ```
   `bi` es el índice del bloque.
4. En simulación, `__cnc.grbl.sim.velocidad = 50` acelera el homing y los trabajos.

## Imágenes

Generadas en ChatGPT (sesión de Sebastián, Chrome «Browser 2»). Los PNG originales están en `E:\00_INBOX`.

- **Fresa:** `senala`, `explica`, `piensa`, `celebra` y `lupa` se suman a las 6 poses anteriores. Se hicieron con las poses `hola` y `sonda` como referencia; mismo personaje, PNG transparente y recorte a 440 px de alto.
- **Manual:** 8 escenas en estilo de producto ligeramente afelpado, sobrio. Se usó la Cubiko en felpa de la tarjeta del catálogo como referencia y se generaron como dos cuadrículas de 2×2, cortadas a 720 × 480.
