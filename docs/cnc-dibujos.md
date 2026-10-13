# CNC con dibujos DXF y SVG

La app sigue enfocada en PCB. Lo único que cambia para quien la usa es que **Abrir archivos** también acepta `.dxf` y `.svg`. Además, el widget **Material** (en Placa) tiene un selector para elegir qué se corta. El resto del flujo es el mismo: homing, X0 Y0, Z0 y fresar.

## Cómo entra un dibujo

Un dibujo entra por la misma puerta que el `Edge_Cuts` de KiCad. El recorrido es: lazos → imagen interior → contorno a un radio de la fresa por fuera.

- Con un Gerber de cobre o de contorno abierto, se usa el Gerber y el dibujo se ignora (lo dice la consola).
- Con varios DXF/SVG a la vez, se juntan en un solo diseño.

| Archivo | Lector | Qué entiende |
|---|---|---|
| DXF de texto | `cnc/js/dxf.js` | LINE, LWPOLYLINE/POLYLINE con arcos (bulge), ARC, CIRCLE, ELLIPSE, SPLINE (NURBS), INSERT de bloques (anidados, escala, giro, espejo, arreglos). Unidades por `$INSUNITS` (sin unidades: mm, con aviso). Se saltan el espacio papel, las capas apagadas o congeladas y `Defpoints`. |
| SVG | `cnc/js/svg.js` | path (todos los comandos), rect con esquinas, circle, ellipse, line, polyline, polygon, use y transformaciones. Unidades de `width`/`height` + `viewBox` (sin unidades: 96 px/in). La capa es la de Inkscape (`inkscape:label`) o el id del grupo de primer nivel. |

No se cortan los textos (aviso: hay que convertirlos a curvas), las cotas ni los rellenos HATCH. El borde de un HATCH repetiría el contorno, y al rellenar por par/impar se anularía la pieza.

`vector.js` hace tres cosas:
- quita los trazos duplicados (en DXF pasa seguido);
- une los segmentos sueltos en lazos, con 0.05 mm de tolerancia. Un hueco de hasta 0.3 mm se cierra y avisa;
- da a cada trazo su operación según el nombre de su capa.

## La capa decide la operación

| Capa (contiene…) | Operación | Trabajo |
|---|---|---|
| `grab`, `engrav`, `marc`, `etch`, `text`, `rotul` | Grabado: la fresa en V sigue la línea | Grabado |
| `vac`, `bolsa`, `pocket`, `cajea`, `rebaj` | Vaciado: se rebaja el interior hasta una profundidad | Vaciado |
| `linea`, `centr`, `on line`, `kerf` | Corte pasante **sobre** la línea, sin compensar la fresa | dentro de Contorno |
| `constr`, `ayuda`, `refer`, `cota`, `dim`, `oculta` | No se usa | — |
| cualquier otra | Lazo cerrado → **contorno**. Línea abierta → **grabado** (una línea abierta no encierra ninguna pieza) | Contorno / Grabado |

Un círculo más chico que la fresa del contorno no se puede fresar por dentro. Va a **Hoyos** y se taladra con la broca, dentro del rango Ø de Configuración.

Orden de los trabajos: Grabado (fresa en V) → Hoyos (broca) → Vaciado → Contorno. Vaciado y Contorno usan la misma fresa, así que no hay cambio entre ellos. Cualquier trabajo se puede **omitir** desde su hoja.

## Piezas y huecos: por fuera o por dentro

No importa en qué sentido se dibujó cada lazo. Lo que decide es cuántos lazos lo rodean:
- **par** (0, 2…) es el borde de una pieza y se corta por fuera, con puentes;
- **impar** es un hueco y se corta por dentro.

Una pieza dentro de un hueco vuelve a ser pieza. Sale solo porque el contorno es la curva a un radio de la fresa por fuera de lo blanco en la imagen interior, rellenada por par/impar.

Primero se cortan los lazos más adentro: los huecos de cada pieza van antes que su borde, para que la pieza siga sujeta mientras se trabaja. Cada lazo baja todas sus pasadas antes de pasar al siguiente.

Cada pieza lleva sus propios puentes:
- el número de Configuración, o menos si la pieza es chica (hasta una cuarta parte de su perímetro en puentes; al menos 2 si caben en la mitad);
- se ubican por posición, así que la vuelta de acabado los respeta igual que el desbaste.

## Sentido de corte

Con el husillo en M3, concordancia significa que el material que se queda va a la derecha del avance: las piezas se recorren en sentido horario y los huecos en antihorario. Convencional es al revés. Es la casilla **Fresado en concordancia** de Configuración, y el material la pone:

| Material | Grosor | Profundidad | Bajada máx. | Avance | Sentido | Acabado | Sonda |
|---|---|---|---|---|---|---|---|
| Placa de cobre | 1.6 | grosor + 0.25 | 0.5 | 120 | concordancia | 0 | directa |
| Acrílico | 3 | grosor + 0.3 | 0.5 | 300 | concordancia: se calienta menos, no se funde | 0.15 | placa de contacto o papel |
| MDF | 3 | grosor + 0.3 | 0.75 | 400 | convencional: la fresa no jala en una máquina ligera | 0.1 | placa de contacto o papel |
| Madera o triplay | 3 | grosor + 0.3 | 0.75 | 400 | convencional | 0.1 | placa de contacto o papel |
| Otro | — | no cambia nada | | | | | placa de contacto o papel |

- La placa de cobre reproduce exactamente los valores de siempre. Se verificó que el G-code de la PCB de ejemplo sale idéntico al de antes, salvo los comentarios.
- Los demás materiales son valores de arranque para una fresa de maíz de 1 a 3 mm: hay que confirmarlos con un corte de prueba y ajustarlos en `cnc/js/materiales.js`.
- Al cambiar el grosor se recalculan la profundidad, las bajadas, la Z de los puentes y la profundidad de los hoyos.
- Cuando el material no conduce:
  - el asistente de Z pide una placa de contacto metálica y su grosor (o el método del papel);
  - el mapa de alturas se desactiva, porque se mide tocando el material con la sonda.

**Acabado.** Las pasadas de desbaste van a radio + acabado. Al final, una vuelta a radio exacto a toda profundidad, en el mismo sentido, deja un borde más limpio y la medida más exacta.

## Vaciado

Son curvas de nivel hacia dentro de la zona: a r, r + paso, … hasta que ya no cabe la fresa.
- Se recorren del centro hacia la pared, región por región y bajada por bajada.
- El paso no pasa del radio (traslape mínimo de 50 %), para que no quede una cresta sin cortar en el eje de una zona angosta.
- Entre anillos sube a Z0.5; para ir a otra región, a Z seguro.

## Probar sin la máquina

En Simulación se puede abrir un DXF o SVG, cambiar el material y fresar. El gemelo pinta el material con su color (acrílico, MDF, madera) y el surco con el tono de su profundidad.
