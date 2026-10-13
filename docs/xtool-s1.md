# xTool S1 40 W

La cortadora láser del Fab Lab y lo que sabemos de cómo habla. El modelo 3D tiene su propia nota: `xtool-s1-modelo.md`.

## La máquina
- Láser de diodo de 40 W, encerrado, con tapa de acrílico tintado.
- **Área:** 498 × 319 mm con el módulo de 40 W (los de 10 y 20 W llegan a 498 × 330).
- **Material bajo el módulo:** 42 mm sin la base elevadora y 133.5 mm con ella.
- **Exterior:** 765 × 561 × 183 mm, 20 kg.
- **Origen:** atrás a la izquierda. X crece a la derecha y Y hacia el frente.
- **Protecciones del firmware:** la tapa abierta cancela el trabajo, hay alarma de flama, y un paro si la máquina se mueve. La app nunca las desactiva (ver Bloqueo).
- **Software oficial:** xTool Studio (antes XCS). LightBurn la maneja por USB desde la versión 1.7.

## De dónde sale lo que sabemos
- **xTool Studio 1.9.11, instalado en `E:\Xtool\xTool Studio`.** Es una app Electron; la lógica de cada modelo es un módulo de JavaScript dentro de `resources\exts.zip`. El de la S1 está en `S1/index.js`, internamente «D2», código MD2. `resources\ext.json` dice cómo se conecta:
  - USB: `channelType: serial`
  - WiFi: `socket`, con `M303` como latido
- **[ha-xtool](https://github.com/thecodingdad/ha-xtool)**, integración de Home Assistant probada en una S1. Su `docs/PROTOCOL.md` documenta el protocolo por WiFi.
- **Foro de LightBurn y la guía de xTool para LightBurn.** Por USB la S1 acepta G-code en streaming:
  - perfil `xTOOL_S1_V2.lbdev`, modo «Buffered», firmware mayor a 004
  - `$L` al inicio del trabajo
  - `M802 S0/S1` enciende o apaga el sensor de la tapa

## Protocolo

### Canales
- **USB (camino A):** puerto serie. LightBurn manda el G-code línea por línea. xTool Studio sube el archivo completo con un protocolo enmarcado llamado `f3f4` (`device.uploadFile({ protocolType: "f3f4" })`, código en `app.asar`, sin revisar todavía).
- **WiFi:**
  - WebSocket en 8081: una línea de texto por mensaje; la máquina avisa sola de los cambios.
  - HTTP en 8080: `POST /cmd` y `POST /upload?filename=tmp.gcode` (texto plano), luego `M323 S1`.
  - Descubrimiento por UDP 20000.
  - Sin contraseña. xTool Studio desconecta a los demás clientes del WebSocket.

### Órdenes que usa la app
| Orden | Qué hace |
|---|---|
| `M2003` | Información del equipo en JSON |
| `M222` | Estado de trabajo (`M222 S<n>`, tabla abajo) |
| `M303`, `M105` | Posición del cabezal |
| `M223` | Área (sin argumentos) o tamaño del trabajo (con X Y, en el encabezado) |
| `M111 S3` / `S2` / `S7` | Casa XY / Z / todo |
| `M110 X1 Y1 Z1` + `G90` + `G0 X Y F` | Mover (así lo hace xTool Studio) |
| `M22 S1` / `M22 S0` | Pausa / reanudar |
| `M108` | Cancelar |
| `M15 S<0-4>` | Asistencia de aire |
| `M7 S1` / `S0` | Extractor |
| `M3` / `M4` / `M5` | Láser constante (vectores) / dinámico (imágenes) / apagado |

### Estados (`M222 S<n>`)
Sacados de la tabla de la extensión de la S1. El 1 y el 3 vienen de ha-xtool.

| n | Estado | n | Estado |
|---|---|---|---|
| 0 | Iniciando | 14 | Cortando |
| 1, 3 | Lista | 15 | En pausa |
| 2 | Configurando WiFi | 16 | Actualizando firmware |
| 4 | **Alarma:** la máquina se movió | 17 | Dormida |
| 7 | **Alarma:** tapa abierta | 18 | Cancelando |
| 9 | **Alarma:** flama | 19 | Terminado |
| 10, 24 | Midiendo | 20 | **Alarma:** fuera del área |
| 11, 12 | Encuadre | 21 | **Alarma:** WiFi |
| 13 | Lista para cortar (espera el botón) | 22 | **Alarma:** láser |

### Encabezado del G-code
Es el `gCodeHead` de xTool Studio para la S1, sin lo de accesorios ni el eje U:

```
M110 X1 Y1 Z1
M109 S1
M223 X<ancho> Y<alto>
M7 S1
M96 S0
G90
G0 Z0
G0 F9600
G1 F1000
```

- **Vectores:** `M3`, `M15 S<aire>`, y luego cada trazo con `G0` hasta su inicio y `G1 … S<potencia>`.
- **Imágenes:** `M4`; el trabajo termina con `M5`, `G90`, `M6`.
- **Potencia:** xTool Studio calcula `powerFactor = potencia / 1000`, así que la escala probable es S0–1000. **Por confirmar.**

### Bloqueo
`web/laser/js/bloqueo.js`. Ni la consola ni un archivo pueden mandar estas órdenes:

| Orden | Por qué |
|---|---|
| `M802 S1` | Apaga el sensor de la tapa |
| `M341` | Borra el WiFi |
| `M9006` | Reinicio forzado |
| `M22 S3` / `S4` | Modo de actualización de firmware o de medición |
| `M807` | Cargador de arranque |
| `M2810`, `M120` | Órdenes de fábrica |
| `M9097` | Corta la conexión |
| `M340 S2` | Apaga la alarma de flama |
| `M318 N0` | Quita el paro al moverse la máquina |
| `M36` | Láser fijo sin moverse |
| `$…` | Ajustes de firmware (se permite `$L`) |

## Caminos
- **A, en curso:** USB + Web Serial con G-code en streaming. Funciona desde fablab.sebs.mx (https) sin instalar nada, igual que la CNC.
- **B, siguiente:** subir el archivo completo por USB con `f3f4`, como xTool Studio. Es más robusto para grabados grandes, porque la máquina no depende del ritmo del navegador. Toca leer `app.asar` o capturar el USB mientras xTool Studio manda un trabajo.
- **WiFi:** solo con un puente local (PC o Raspberry Pi junto a la máquina). Una página https no puede hablar con `http://` ni con `ws://` de la red local.

## Por confirmar con la máquina
Lo concentra `web/laser/js/perfil-s1.js`; `web/laser/diagnostico.html` lo prueba y descarga un `.json`.

1. **Velocidad del puerto.** El diagnóstico prueba 115200, 230400 y 921600.
2. **Respuestas.**
   - ¿Contesta `ok` por línea?
   - ¿Las consultas traen su código al frente (`M222 S3`)?
   - ¿Avisa sola de los cambios por USB?
3. **Escala de S.** El cuadrado de 20 mm a S50 debe verse muy tenue si la escala es 0–1000.
4. **Búfer.** Cuántos bytes acepta en vuelo (`rx` en el perfil). Si un grabado se traba, se baja o se adelanta el camino B.
5. **Enfoque.**
   - En streaming no hay medición automática; ¿qué hace `G0 Z0` del encabezado?
   - ¿Hace falta mandar Z según el grosor?
6. **Botón.** ¿Un trabajo por streaming espera el botón de la máquina (estado 13), como al subirlo por WiFi?

## Cómo probar en la máquina real
1. **Antes de empezar.** Cerrar xTool Studio y LightBurn. Material de prueba en la esquina de atrás a la izquierda.
2. **Diagnóstico.** Abrir `fablab.sebs.mx/laser/diagnostico.html` (o `python servir.py laser/diagnostico.html`) y seguir los pasos 1 a 4. Descargar el `.json`.
3. **Ajustar el perfil.** Pasar lo aprendido a `perfil-s1.js`.
4. **Probar la app.** Conectar, mandar a casa, abrir el ejemplo, elegir cartón, encuadrar y cortar con alguien junto a la máquina.
5. **Congelar el firmware.** Anotar su versión y desactivar las actualizaciones automáticas en xTool Studio: una actualización puede cambiar el protocolo.
