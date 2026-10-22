# Visor 3D

`web/visor3d/`, en fablab.sebs.mx/visor3d. Abre, revisa, limpia y convierte modelos 3D en el navegador, sin instalar nada y sin servidor. Sirve sobre todo para lo que sale de los escáneres (Creality Pika y CR-Scan Otter); también abre cualquier STL, OBJ o GLB.

## Qué hace
- **Abrir:**
  - 3MF (con color por vértice o textura), PLY (ASCII o binario, con color o con textura por cara), STL, OBJ con MTL y PNG, GLB/glTF, y .zip.
  - Se arrastran varios archivos a la vez (modelo, imagen y MTL).
- **Revisar:**
  - Triángulos, medidas, huecos, piezas sueltas, aristas raras, área y volumen (si está cerrada).
  - Un semáforo para tres usos: imprimir, limpio y web.
- **Editar** (todo se puede deshacer, 8 pasos):
  - Acomodar: medidas y escala (también «el archivo venía en cm, m o pulgadas»), girar y apoyar, «elegir la cara de abajo».
  - Recortar: plano de corte con tapa, caja de recorte y borrar con lazo.
  - Limpiar: quitar piezas sueltas (tocando la que se queda), rellenar huecos, reparar y suavizar.
  - Aligerar: simplificar con meshoptimizer.
  - Color: pasar la textura a color por vértice, o quitar el color.
- **Exportar:**
  - Formatos: STL, 3MF, OBJ (.zip con MTL y PNG), PLY, GLB, FBX y ASC.
  - Cortes en SVG y DXF para el láser y la CNC: rebanadas para apilar, que se abren directo en esas apps.
  - STEP aparece como «Próximamente».
- **Recordar:** el último modelo se guarda en IndexedDB del navegador; al volver, «Seguir con este».

## Archivos
| Archivo | Qué hace |
|---|---|
| `index.html`, `visor3d.css` | Cascarón (el mismo de la CNC y el láser) y los estilos propios |
| `js/main.js` | Estado, worker, archivos, deshacer, exportar, acciones rápidas |
| `js/vistas.js` | Páginas del panel: Modelo, Revisión, Editar, Exportar, Formatos de Creality, Cortes |
| `js/herramientas.js` | Una hoja por herramienta, con vista previa en el 3D |
| `js/visor.js` | El 3D: la malla, modos, rejilla, medir, sección, recorte, lazo, elegir cara |
| `js/datos.js` | Qué guarda cada formato y qué exportar en Creality Scan (lo usan también las páginas de los escáneres) |
| `js/trabajador.js` | Worker: tiene el modelo y el historial; lee, edita y escribe |
| `js/nucleo/` | Malla y conversión de datos por esquina a datos por vértice (código puro) |
| `js/formatos/` | Lectores y escritores (3MF por streaming, PLY, STL, OBJ; GLB y FBX en `web.js`) |
| `js/ops/` | Topología (huecos, piezas), ediciones, cortes en rebanadas, horneado de textura |
| `ejemplos/buho.3mf` | El búho del laboratorio: 90 mil triángulos, cerrado, con color (2 MB) |

Lo de `js/nucleo`, `js/formatos` (salvo `web.js`) y `js/ops` es código puro y corre igual en Node. Así se probó con los escaneos reales:
- **Lectura:** el 3MF de 70 MB se lee en 1.7 s y el PLY con textura en 0.6 s.
- **Ida y vuelta:** escribir cada formato y volver a leerlo da las mismas medidas.

## Decisiones
- **Convención:** la malla interna va en mm con **Z arriba**, como en impresión 3D.
  - OBJ, GLB y FBX se escriben con Y arriba.
  - GLB va en metros; FBX en centímetros, que es lo que declara assimp: con metros salía 100 veces chico en Blender.
- **3MF «Textura» de Creality:** no trae imagen.
  - El color va por esquina de triángulo contra un `m:colorgroup` de 59 825 colores.
  - Se promedia por vértice; no se nota.
- **Textura:** los vértices se parten en las costuras de UV.
  - Para contar huecos y piezas, la topología usa la posición (`representantes()` en `ops/topologia.js`).
  - Si no, cada costura contaba como hueco: salían 499 huecos y 271 piezas.
- **Normales:** el volumen con signo se mide **desde el centro del modelo**. En los escaneos el origen es la cámara, a 40 cm; medido desde ahí el signo sale al revés y las caras se volteaban mal.
- **Orientación:** los escaneos salen inclinados (la cámara estaba ladeada), así que ningún giro de 90° los endereza.
  - «Elegir la cara de abajo»: se toca la base o la tornamesa, esa cara queda horizontal, y si la mayor parte del modelo queda debajo, se voltea 180°.
- **Piezas sueltas:** «Todo menos la mayor» falla con los escaneos, porque la pieza mayor suelen ser las torres de marcadores pegadas a la tornamesa.
  - Lo útil es «Tocar las que se quedan».
- **Rellenar huecos:** con anillos hacia un vértice central, en vez de corte de orejas.
  - Cada arista del borde recibe un solo triángulo, así que la malla queda cerrada sin aristas raras aunque el hueco no sea plano.
  - El corte de orejas se usa solo para tapar cortes planos.
- **FBX:** sale del fork de assimpjs de repalash con exportador FBX (`web/shared/vendor/assimpjs`, 4 MB). Se carga solo la primera vez que se pide un FBX.
- **Envíos entre apps:** `web/shared/js/envios.js` guarda el archivo en IndexedDB y abre `../laser/?abrir=visor3d` o `../cnc/?abrir=visor3d`.

## Pruebas
- Para probar con escaneos grandes en local, ponlos en `web/_prueba/` (está en `.gitignore`) y ábrelos desde la consola:

  ```js
  const f = async (n) => new File([await fetch('/_prueba/' + n).then(r => r.blob())], n);
  await __visor3d.acc.abrirArchivos([await f('buho.3mf')]);
  ```

- `?ejemplo` abre el búho al cargar.

## Pendiente
- STEP: necesita OpenCascade en WASM (unos 30 MB) o un servidor.
- Rellenar huecos grandes con forma (Poisson o remallado): hoy queda un parche cónico.
- Abrir nubes de puntos (ASC) como puntos.
