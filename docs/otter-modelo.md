# Modelo 3D del Creality CR-Scan Otter

Archivo: `web/escaner/js/otter-modelo.js` · vista: `web/escaner/?equipo=otter` (con `python servir.py`, http://localhost:8767/escaner/?equipo=otter).

No hay CAD público del Otter, así que se armó con primitivas de three.js, como el Pika ([pika-modelo.md](pika-modelo.md)). Usa las mismas utilidades (`herramientas`, `cara`, `ajustarUV`) y el mismo tripié, tornamesa y torre. No lleva el logotipo, la marca ni los sellos de la etiqueta.

## Fuentes
- **Ficha** (Adorama, MatterHackers, 3DJake):
  - Cuerpo: 165 × 37 × 59 mm, 390 g, de metal y sin ventilador.
  - Ópticos: 4 cámaras en dos pares estéreo (focal larga para piezas chicas y corta para grandes), luz estructurada NIR, cámara RGB de 24 bits, 2 LED blancos y 8 IR.
  - Alcance: de 110 a 1000 mm; campo de 1350 × 840 mm a 1000 mm; precisión de hasta 0.02 mm; hasta 20 fps.
  - Conexión: USB 3.0 más un cable USB 2.0 de apoyo a 5 V.
- **Foro de Creality** (reseña del Otter):
  - Botones: «+» y «−» cambian la exposición IR; «▷» inicia o pausa el escaneo, y si se mantiene 3 s lo termina.
  - Un indicador anular da la distancia: verde está bien, naranja-rojo es muy cerca y azul es muy lejos.
- **Fotos del Otter del laboratorio** (21 oct 2026): el frente y el lado de los botones salen casi ortogonales.

## Marco
Igual que el Pika: X a la derecha mirando el frente, Y arriba y Z hacia donde mira. El origen está en el centro de la cara de abajo, en la rosca de 1/4". `construirOtter()` devuelve `raiz`, `cuerpo`, `nir` y `modo("apagado" | "luz" | "nir")`.

## Cotas medidas en las fotos
| Pieza | Cota |
|---|---|
| Casco | prisma de 165 × 37 × 59 cortado con planos: chaflanes de 10 × 8 en las esquinas vistas de frente y de 4 × 4 vistas desde arriba |
| Colores | techo, piso y extremos en aluminio negro; frente, fondo y chaflanes en gris metálico |
| Vidrio del frente | octágono 2.7 mm adentro del borde, con muescas de 2.6 mm al centro arriba y abajo (28 mm de ancho) |
| Cámaras (x, Ø) | −60.7 Ø9.4 · −25.5 Ø10.7 · +24.7 Ø11.1 · +60.7 Ø9.6 |
| Proyector y RGB | proyector Ø18.1 en −0.6; RGB Ø9.9 en +42.9 |
| LED | IR Ø2.8 a ±10.8 mm sobre y bajo las 4 cámaras; blancos Ø4.5 en +41.8 a ±10.8 |
| Atrás | píldora de botones de 50.8 × 15.9 centrada en X +39; etiqueta de 48.7 × 23 en X −19; salida del cable de ~27 × 24 en X −62.5; 4 tapones grises en las esquinas |
| Techo y piso | la placa gris de atrás entra 7 mm en los 76 mm del centro, con extremos a 45° |

## Placa de calibración
`construirPlacaCalibracion()`: placa blanca de 210 × 240 × 3 mm sobre un tapete negro de 244 × 326. Lleva 6 × 7 puntos de Ø6 con un paso de 35 mm y 4 puntos de Ø10 al centro. Las proporciones salen de la foto; **el paso de 35 mm es una estimación**, porque no había nada para dar escala.

## Qué falta o es supuesto
- **Indicador anular:** el foro lo menciona, pero no se ve dónde está en las fotos, así que no se modeló.
- **Cable:** el conector y el cable trenzado son aproximados, y no está el cable USB 2.0 de apoyo.
- **Calibración:** hay que medir la placa y su tapete con regla para fijar el paso de los puntos.
