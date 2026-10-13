# Modelo 3D de la xTool S1 (40 W, versión negra)

Archivo: `web/laser/js/s1-modelo.js` · vista previa: `web/laser/modelo.html` (con `python servir.py`, http://localhost:8767/laser/modelo.html).

No hay CAD público de la S1. El modelo se arma con primitivas de three.js, igual que `web/cnc/js/cubiko.js`. Ninguna imagen de referencia se copió al repositorio; tampoco lleva el logotipo ni la palabra de la marca.

## Marco de coordenadas

- Unidades: mm. Ejes de three: X a la derecha, Y hacia arriba, Z hacia el usuario (frente de la máquina).
- El origen de trabajo (X0 Y0 de máquina) es la esquina **trasera izquierda** del área. +X de máquina va a la derecha y +Y de máquina hacia el frente. El punto (x, y) de la cama está en `(x, yCama, y)` de three.
- `yPiso = 0` es la mesa donde se apoya la máquina; `yCama = 34` es la cara superior del panal.
- Origen dentro de la caja: 128 mm desde la cara exterior izquierda y 172 mm desde la cara exterior trasera (`medidas.origenEnCaja`). La caja va de x −128 a 637 y de z −172 a 389.
- Bisagra de la tapa: y = 183 y z = 43 (215 mm desde la cara trasera).

## API

```js
import { construirS1, AREA, ALTURA_UTIL } from "./js/s1-modelo.js";
const m = construirS1({ sombra: true });
scene.add(m.fijo, m.porticoY);
m.porticoY.position.z = y;      // Y de máquina (0…319)
m.carroX.position.x = x;        // X de máquina (0…498)
m.modZ.position.y = dz;         // subida del módulo (0 = enfocado sobre la cara del panal)
m.tapa.userData.abrir(f);       // 0 cerrada … 1 abierta (75°); equivale a tapa.rotation.x = −ángulo
m.cruz.visible = true;          // cruz roja, desplazada (−21.5, −0.5) mm del foco
m.luz.material.emissive.setHex(0x3b82f6);   // indicador anular del botón
m.boquilla                      // Object3D en el foco: allí se cuelgan el rayo y el punto
```

- `fijo`: la caja, la tapa (hija de `fijo`), el panal, las guías Y, el motor Y, los puertos, el paro de emergencia, la salida de humo y el botón.
- `porticoY`: la viga X con sus carros de extremo. `carroX` es hijo de `porticoY`; `modZ` es hijo de `carroX`; `cabezal` es hijo de `modZ`; `boquilla` es hijo de `cabezal`.
- `cruz` es hija de `carroX`, así que sigue a X e Y pero se queda sobre la cama aunque el módulo suba.
- `medidas`: `exterior {x:765, y:561, z:183}` (ancho, fondo y alto, como en la ficha), `yCama`, `yPiso`, `centro` (Vector3 del centro del área), `origenEnCaja {x:128, z:172}`, `caja {x0, x1, z0, z1, y1}` y `bisagra {y, z}`.

## Cotas y de dónde salen

| Cota | Valor | Fuente |
|---|---|---|
| Exterior (sin elevador) | 765 × 561 × 183 mm | Ficha oficial (support.xtool.com/article/1106) |
| Área de trabajo con el módulo de 40 W | 498 × 319 mm | Ficha oficial |
| Altura máxima de material | 42 mm | Ficha oficial; se exporta como `ALTURA_UTIL` |
| Sección trasera opaca | ~215 mm de fondo (≈ 38 % del total) | Vista superior del render «Max. 118″» y renders de 3/4 de la tienda |
| Frente bajo (tina) | 75 mm de alto (≈ 41 %) | Promedio de la vista frontal de «List of items» (≈ 33 %) y del render de 3/4 de la página de soporte (≈ 47 %) |
| Bajada de la tapa al frente | 108 mm, retornos de 40 mm en las esquinas | Renders con la tapa abierta de la Quick Start Guide (págs. 1–3) y foto de la carcasa en article/1268 |
| Paredes laterales | 55 mm de grueso | Render de la Quick Start Guide con la tapa abierta (la «U» se ve gruesa en el frente) |
| Pared trasera / frente | 20 / 30 mm | Estimación |
| Espesor del acrílico | 4 mm | Estimación |
| Placa base | cara superior a 12 mm de la mesa (patas de 4 mm) | Estimación |
| Panal | 22 mm de alto, el área más 25 mm por lado, celda hexagonal con lado de 3 mm | Estimación (accesorio; no viene con la máquina básica) |
| Origen dentro de la caja | x 128, z 172 desde la esquina trasera izquierda | Deducido: medio módulo cabe a la izquierda; a la derecha van el sensor y el husillo Z; detrás de Y0 caben la viga (44 mm), el eje del motor Y y la pared |
| Viga X | 44 × 44 mm, de pared a pared, a 78–122 mm sobre la cama | Foto de article/1268 con la carcasa quitada; la altura es una estimación |
| Módulo de 40 W | 96 × 75 × 76 mm, champán, rejilla arriba, zócalo ventilado | Fotos de producto (comparación de los cuatro módulos); medida estimada |
| Boquilla | punta 10 mm sobre el foco, en el frente derecho del módulo | Fotos «Hands-Free Accuracy» y «Pin-point Positioning»; la distancia es una estimación |
| Sensor de distancia y husillo Z | a la derecha del módulo | Recorte «Distance sensor» de la Quick Start Guide y foto del autoenfoque |
| Cruz roja | (−21.5, −0.5) mm del foco | Desfase que reportan usuarios de LightBurn |
| Botón con indicador anular | 57 mm desde el borde derecho, 34 mm sobre la panza | Quick Start Guide (pág. 1) y vista frontal |
| Paro de emergencia | costado derecho, 62 mm desde atrás, 32 mm bajo el techo | Renders de 3/4 de la tienda |
| Salida de humo | costado **izquierdo**, junto al fondo, brida de 110 mm y tubo de Ø 92 | Quick Start Guide, pág. 5 (vista trasera) |
| Panel de puertos | cara trasera, hacia la derecha | Quick Start Guide, pág. 2 |
| Bisagra | tira de aluminio de 12 mm al frente de la sección trasera | Renders de la tienda |

## Decisiones respecto al encargo

- **Color del acrílico**: según la Quick Start Guide, la versión negra es «black-green». Se usa un verde oscuro translúcido (opacidad 0.35), que es más fiel que un gris humo.
- **Color del módulo**: el módulo de 40 W real es champán, no negro. Se dejó champán.
- **Salida de humo**: no está en la cara trasera. Va en el costado izquierdo junto al fondo, con un ventilador cuadrado. Se modeló con el tubo de humo puesto: brida cuadrada y collar redondo.
- **Luz de estado**: la S1 no tiene una tira de LED de estado. Su indicador es el anillo del botón del frente, así que `luz` es ese anillo. Las barras de luz blanca del interior (bajo la bisagra y en la cara interna del frente) son fijas.
- **Altura útil**: los 42 mm de la ficha se miden sin elevador. El modelo los toma desde la cara del panal, para que `modZ` pueda subir hasta 42 sin chocar. En la máquina real, con el panal puesto, el espacio libre es menor.

## Aproximaciones y qué mejorar

- Las cotas internas (viga, guías, motor Y, placa) salen de una foto con la carcasa quitada y de renders, no de medidas. Conviene medir una máquina real: la altura de la viga, la del frente bajo y la del origen dentro de la caja.
- La cadena portacables (en X sobre la viga y en Y a la izquierda) no está modelada.
- Faltan las correas, las poleas y las ruedas de los carros; las guías son barras simples.
- El panel de puertos traseros, la llave y los racores son simbólicos.
- Las caras de la caja no tienen el degradado ni el anodizado de los renders: el color es plano.
- No hay elevador (riser), alimentador ni rotativo.
- Detalles del frente que se omitieron: el puerto de extensión interior y la puerta de paso (*passthrough*), que está en otra versión.
- Para comparar, abre `modelo.html` con el botón «3/4» o «Frente» y ponlo junto a los renders de la tienda (ángulos parecidos).
