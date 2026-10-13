# Kiwi, la mascota del láser

Compañero de Fresa (CNC). Su cabeza es un kiwi partido a la mitad, visto de frente, con volumen de fruta real y no plano como moneda:
- la cara va sobre la pulpa verde
- un anillo de semillas rodea el centro crema
- el borde es de piel café afelpada

Tiene torso, brazos y piernas de felpa café, y lleva los mismos lentes de seguridad de laboratorio que Fresa.

## Diseño aprobado (12 oct 2026)
- Se eligió la propuesta 3 de una hoja de tres. Las otras dos eran el kiwi entero con una rodaja como corona y el kiwi entero con una ramita y cuerpo verde.
- **Primer intento, descartado:** una rodaja con patas, sin torso, bordada y con costuras, de aspecto infantil.
- **Reglas que lo arreglaron:**
  - las mismas proporciones que Fresa: cabeza grande con la forma de la fruta, y torso, brazos y piernas propios
  - felpa fina tipo terciopelo flocado, **sin costuras, bordados ni puntadas**
  - los mismos ojos, cejas, sonrisa discreta y lentes que Fresa
  - la misma edad y actitud que Fresa, sin verse de bebé

## Archivos
- **Ubicación:** `web/img/kiwi/<pose>.webp`. Son PNG transparentes de ChatGPT recortados a lo visible, escalados a 440 px de alto y pasados a webp (calidad 90), igual que Fresa.
- **Originales:** `E:\00_INBOX\kiwi-<pose>.png` (1024 × 1536).
- **En la app:** `MASC` en `web/laser/js/main.js`.

| Pose | Momento |
|---|---|
| `hola` | conectar, cortar (paso listo) |
| `senala` | señalar algo en la interfaz |
| `explica` | explicar un concepto |
| `piensa` | nada que cortar, el diseño se sale del área |
| `celebra` | logro (examen aprobado) |
| `lupa` | elegir el material (se sube los lentes a la frente para usar la lupa) |
| `alerta` | alarma: tapa abierta, fuera del área, error |
| `archivos` | abrir el diseño |
| `cortando` | trabajo en curso |
| `encuadrando` | encuadre (cruz roja sobre la madera) |
| `extintor` | alarma de flama |
| `pieza` | pieza terminada (llavero con el kiwi grabado) |

## Cómo se hicieron (ChatGPT, sesión de Sebastián, Chrome «Browser 2»)
1. **Personaje.** En un chat nuevo se adjuntó `web/img/fresa/hola.webp` y se pidió la hoja de tres propuestas «de la misma familia que Fresa», con las reglas de arriba. Se eligió una y se generó sola, saludando, con fondo transparente.
2. **Poses.** En el mismo chat, cada pose con: *«Mismo Kiwi exacto, mismas reglas (fondo transparente PNG, cuerpo completo, sin texto, vertical 2:3). Pose: …»*.
3. **Descarga.** Desde la Biblioteca de ChatGPT. Luego el recorte y la conversión con Pillow.

## Tarjeta del catálogo
- **Archivo:** `web/img/laser-s1.webp`, 1120 × 700. Original en `E:\00_INBOX\laser-s1-portada.png`.
- **Cómo se hizo:** con la tarjeta de la Cubiko (`img/cnc-cubiko.webp`) como referencia de estilo y una captura del gemelo 3D (`web/laser/modelo.html`) como referencia de la máquina. Así no se usaron fotos de xTool.
- **Resultado:** la S1 en felpa gris oscuro, tapa de acrílico verde ahumado, anillo del botón en verde, sin logotipos.
- **Sin mascota,** igual que la tarjeta de la CNC.
