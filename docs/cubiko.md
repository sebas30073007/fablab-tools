# Genmitsu Cubiko

## Datos
| | |
|---|---|
| Área de trabajo | 145 × 110 × 40 mm (manual; algunas reseñas dicen 150 × 110) |
| Exterior | 300 × 335 × 318 mm (58 mm libres bajo el pórtico) |
| Velocidad máx. | 2000 mm/min |
| Firmware | `Grbl 1.1f`; `$I` → `[VER:V44.2.20250822:]` `[OPT:VMZ0L,35,254]` (variante de Genmitsu) |
| Puerto | USB B, 115200 baud (COM18 en la laptop de Sebastián) |
| Movimiento | la **cama se mueve en Y**; el husillo en X y Z |
| Coordenadas | todo el recorrido es negativo (X −145…0, Y −110…0, Z −40…0). En el homing, visto de frente, el husillo va a la **izquierda** y la cama hacia **atrás**: X e Y buscan su tope negativo (`$23=3`) y quedan cerca de X −143 Y −108 Z −2 (observado el 11 oct 2026; falta leer `$$`) |

**Modelo 3D.** No hay CAD público de la máquina completa: solo hay modelos del spoilboard en Printables y MakerWorld. El gemelo de `web/cnc/js/cubiko.js` está hecho con primitivas a partir de las medidas oficiales y de las fotos de la [reseña de SainSmart](https://www.sainsmart.com/blogs/news/part-1-genmitsu-cubiko-full-review-from-unboxing-to-projects-the-new-benchmark-for-desktop-cnc) (fotos de hardwarepoint.net, ago 2025). Lo que reproduce:
- base de dos niveles con chaflanes al frente, franja LED verde y control con pantalla y cruceta (la pantalla muestra el estado y la posición en vivo)
- torre en «C», gris por fuera y negra por dentro, con ventanas en el fondo y la placa de conexiones a la derecha
- eje X con dos varillas y husillo trapecial, más la barra LED bajo la varilla inferior
- carro con guías Z y motor NEMA 17 arriba
- cubierta del husillo con logotipo y rejilla, pinza ER11
- cama de aluminio de 170 × 124 mm con roscas M5 cada 20 mm, que corre en Y por dos ranuras
- cubierta de acrílico ahumado

Captura: `media/gemelo-cubiko-2026-10-08.jpg`. Si algún día aparece el CAD (la SD de la máquina o soporte de SainSmart), se exporta a `cad/cubiko.glb` y se reemplaza `construirCubiko`.

**Por confirmar en la máquina real** (aún no se ha leído `$$`): `$130–$132`, `$22` (homing), `$20` (límites por software), `$110` (rápidos). La app lee `$$` al conectar; se ven con el botón `$$` de la consola.

## Lo aprendido calibrándola (7 y 8 de octubre de 2026, con Candle y ChatGPT)
Cada punto tiene su respuesta en la app.

1. **El orden no era obvio**: homing → fresa → Z → colocar placa → XY → mapa de alturas → fresar. Para eso están los widgets «Ahora» (siguiente paso con su botón) y «Tu placa».
2. **Alarma de límite** por tener la placa contra un extremo; en la repetición del homing el motor hacía un ruido raro y volvía la alarma. Las alarmas salen traducidas, con el siguiente paso (`$X` / `$H`).
3. **Sonda confusa**: al mandar `?` salía `ok` con y sin caimán, y parecía que no funcionaba. Lo que importa es `Pn:P` en el estado. La app muestra un indicador de contacto y el asistente pide tocar la placa con el caimán antes de bajar.
4. **ALARM:5** con `G38.2 Z-3 F20`: no tocó en 3 mm. El asistente baja hasta 15 mm a F100, sube 1 mm y repite a F20; si falla explica por qué y desbloquea para reintentar.
5. **«Acceso denegado» en el puerto** (Candle y otra ventana a la vez). La app avisa que hay que cerrar el otro programa.
6. **Mapa de alturas deshabilitado** en Candle. Aquí es un paso propio; importa y exporta `.map` de Candle.
7. **FlatCAM / mods confusos** («no encuentro path to G-code», no se descargó el .nc). El CAM está dentro de la app.
8. **No sabía hacer la prueba en aire**. Hay un botón: el mismo trabajo con Z +5 mm.
9. **La placa se movió** al limpiarla y al otro día hubo que recalcular a mano las coordenadas de los agujeros. La app alinea con 2 agujeros y corrige desplazamiento y giro.
10. **El visor de Candle no se actualizaba** al cargar otro archivo.
11. **Herramientas**: pistas con fresa fina; hoyos con broca de 1 mm; contorno con **fresa de corte lateral de 1 mm** (no broca helicoidal). Entre trabajos hay que cambiar la fresa y recalibrar Z: hay un asistente de cambio.

Parámetros que funcionaron (archivos en `E:\00_INBOX\Cubiko_*.nc`): pistas F120 S10000 Z seguro 5; hoyos broca 1 mm con `G4 P3`; contorno 4 pasadas (−0.45 / −0.90 / −1.35 / −1.85) y 4 puentes de 3.1 mm a Z −0.9; Z0 en el cobre, MDF de sacrificio debajo. Son los valores por defecto del CAM.
