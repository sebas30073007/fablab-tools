# Kiwi, la mascota del láser

Media fruta de kiwi de felpa con la cara cortada a la vista: pulpa verde, centro claro y semillas negras en rayos. El corte es el chiste: es lo que hace la láser. Hace familia con Fresa (CNC): misma felpa, mismos ojos y la misma escala.

## Reglas
- **Formato:** igual que Fresa, `.webp` de 440 px de alto, fondo transparente.
- **Dónde va:** `web/img/kiwi/<pose>.webp`. La app ya pide estos nombres (`MASC` en `web/laser/js/main.js`); si falta una imagen, no se muestra nada.
- **Una por pantalla:** pose según el momento, igual que en `laboratorio-ui.md`.
- **Seguridad:** siempre con lentes de seguridad verdes cuando hay láser encendido (`cortando`, `encuadrando`).
- **Sin logos ni marcas de terceros.**

## Prompts (ChatGPT, con una pose de Fresa adjunta como referencia de estilo)
Base para todas:

> Personaje de felpa: media rodaja de kiwi, de frente, con la cara cortada a la vista (pulpa verde brillante, anillo de semillas negras en rayos, centro crema) y la cáscara café afelpada en el borde. Ojos y boca bordados como en la fresa de la referencia, brazos y piernas cortos de felpa. Mismo estilo, iluminación y nivel de detalle que la referencia. Fondo transparente, cuerpo completo, 1:1.

| Pose | Agrega |
|---|---|
| `hola` | saluda con una mano, sonriente |
| `senala` | señala hacia su derecha con el brazo extendido |
| `explica` | una mano levantada como explicando, boca abierta |
| `piensa` | mano en la barbilla, mirando hacia arriba |
| `celebra` | brazos arriba, saltando, confeti verde |
| `lupa` | mira por una lupa grande |
| `alerta` | gesto de alto con la palma al frente, cejas preocupadas |
| `archivos` | abraza una carpeta con una hoja que tiene un dibujo vectorial |
| `cortando` | lentes de seguridad verdes, mira concentrado hacia abajo un punto de luz azul sobre una tabla de madera |
| `encuadrando` | lentes de seguridad, sigue con el dedo una cruz roja proyectada sobre madera |
| `extintor` | sostiene un extintor pequeño, serio pero tranquilo |
| `pieza` | muestra orgulloso un llavero de madera recién cortado con un kiwi grabado |

## Tarjeta del catálogo
`web/img/laser-s1.webp`, 1120 × 700: la xTool S1 en felpa (gris oscuro, tapa de acrílico verde tintado), con Kiwi sentado junto a ella. Prompt: *«La cortadora láser de escritorio de la foto convertida en peluche de felpa, mismas proporciones y colores, sin logotipos, con el kiwi de felpa de la referencia sentado a su lado. Fondo gris claro liso.»* Cuando exista, va en la tarjeta del láser de `web/index.html`, como la Cubiko.
