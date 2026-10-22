# Modelo 3D del Creality Pika y sus accesorios

Archivo: `web/escaner/js/pika-modelo.js` · escena: `web/escaner/js/escena.js` · página: `web/escaner/index.html` (con `python servir.py`, http://localhost:8767/escaner/?equipo=pika). La página es la guía de Creality Scan (`js/guia.js`); cada paso mueve el gemelo. Para revisar el modelo solo: `?solo&captura&vista=escaner`.

No hay CAD público del Pika. El 21 oct 2026 no apareció nada en Printables, MakerWorld, Thingiverse ni GrabCAD. Por eso se armó con primitivas de three.js, igual que la Cubiko y la S1. No lleva el logotipo ni la palabra de la marca.

## Fuentes
- **Ficha oficial** (creality.com/products/creality-pika): 100 × 60 × 35 mm, 260 g, pantalla táctil de 3", Wi-Fi 6, USB-C 3.0, 4 luces blancas/azules y 4 infrarrojas. Láser azul de 7 líneas paralelas (160–400 mm) y luz estructurada NIR (hasta 1000 mm; 764 × 670 mm de campo a 1000 mm).
- **Reseña de CNX Software** (jul 2026), sobre la distribución de los componentes:
  - Cada cámara 3D lleva 2 luces blancas/azules y 2 infrarrojas.
  - Al centro van el proyector DOE, el láser azul y la cámara RGB.
  - Un costado tiene el USB-C con seguro; el otro, el interruptor USB/WLAN y la tapa de la batería.
- **Fotos del Pika del laboratorio** (inventario 128254, 21 oct 2026): las cotas se midieron en la foto de frente, que es casi ortogonal (20.5 px/mm).
- **Tornamesa:** Creality Manual Turntable S200, Ø203 × 14 mm (B&H, 3DJake).

## Marco
- Unidades: mm. X a la derecha mirando el frente, Y arriba, Z hacia donde miran las lentes. La pantalla queda en −Z.
- El origen está en el centro de la cara de abajo, en la rosca de 1/4". Así el escáner se cuelga directo de `tripie.cima`.

## API
```js
import { construirPika, construirTripie, construirTornamesa, construirTorre } from "./js/pika-modelo.js";
const p = construirPika();      // p.raiz, p.cuerpo, p.pantalla, p.haces (7 líneas), p.nir (abanico)
p.modo("laser");                // "apagado" | "listo" | "laser" | "nir": LEDs, haces y pantalla
p.pantalla.userData.dibujar("listo");
const t = construirTripie();    // t.rotula gira desde el centro de la bola; t.cima.add(p.raiz)
t.abrir(0);                     // 0 = patas cerradas como mango, 1 = abiertas
const m = construirTornamesa(); // m.plato gira
const k = construirTorre({ anillos: 5 });   // domo + anillos apilables
```

## Cotas medidas en las fotos
| Pieza | Cota |
|---|---|
| Discos de cámara | Ø26.5, centros a 15 mm de cada costado y a 17.5 mm bajo el techo; anillo que sobresale ~2 mm |
| Dentro de cada disco | lente Ø8.4; luces blancas de 3.1 × 4.2 a ±8 mm en horizontal; LED IR Ø3.8 a ±7.7 mm en vertical |
| Píldora central | 39.5 × 19, centrada, a la altura de los discos |
| Dentro de la píldora | proyector DOE cuadrado de 6 mm en x −13.3; láser Ø12.2 con ventana de 3.2 × 6.8 en x −1.1; cámara RGB Ø7.7 en x +15.7; sensor de luz bajo el DOE |
| Techo | encendido en x +25, disparo en x −25 (Ø9.5); rejilla de 26 × 10 al centro |
| Costado +X | panel USB/WLAN de 24 × 19 arriba; tapa de batería de 26 × 21 abajo con su seguro |
| Costado −X | USB-C vertical en un hueco con la rosca del seguro del cable; ojal del cordón abajo, hacia el frente |
| Atrás | escalón de la tapa trasera; cristal de 80 × 49 (1 mm bajo el centro); pantalla de 64 × 40 |
| Esquinas | r 5.5 vistas de frente; cantos de frente y atrás redondeados a 3 mm |

## Estimaciones
- **Profundidad:** la tapa trasera y el cristal miden ~2 mm, el casco ~29.5 mm, la placa del frente ~1.6 mm y los anillos ~2 mm, para sumar los 35 de la ficha.
- **Tripié:** las proporciones salen de las fotos y no se midieron. La bisagra de las patas está a 109 mm, las patas miden 122 mm y la placa queda a ~170 mm de la mesa.
- **Torre de marcadores:**
  - Domo de ~85 mm de base y 50 mm de alto, con 13 marcadores: 1 arriba, 4 en diagonal y 8 alrededor, más 4 valles sin marcador.
  - Anillos octagonales de 9 mm, apilables.
  - Las caras salen de cortar con planos (`cara()`), así que basta con mover un plano para ajustar la forma.
- **Abanicos:** el de las 7 líneas y el NIR son ilustrativos, no la óptica real.

## Qué mejorar
- Medir el Pika con calibrador: la profundidad de cada capa, la altura de los anillos y la posición de la rejilla.
- Las patas del tripié no tienen la forma de mango real; son cápsulas aplanadas.
- Al tapón del USB-C, el cordón y las etiquetas les falta detalle.
