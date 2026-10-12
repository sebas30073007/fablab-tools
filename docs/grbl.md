# GRBL 1.1 en corto

Lo que usa `web/cnc/js/grbl.js`. Referencia completa: wiki de gnea/grbl (Interface, Commands, Alarm and error codes).

## Líneas
- Cada línea de G-code termina en `\n` y GRBL responde `ok` o `error:n`.
- **Streaming por conteo de caracteres**: el búfer de recepción es de 128 bytes. Se mandan líneas mientras la suma de las que esperan respuesta quepa en 127; cada `ok` libera la más antigua.
- Los comandos `$` (ajustes, `$H`, `$X`) van solos, sin otras líneas en vuelo.
- `G4 P0` sirve para esperar a que el planificador se vacíe.

## Tiempo real (un byte, sin `\n`)
| | |
|---|---|
| `?` | reporte de estado (la app lo pide cada 100 ms) |
| `!` | pausa con desaceleración (no pierde pasos) |
| `~` | reanudar |
| `0x18` | reset suave. Con los ejes en marcha → ALARM:3. Por eso PARO hace `!` y luego reset |
| `0x85` | cancelar jog |

## Estado
`<Idle|MPos:-60.000,-50.000,-30.000|Bf:15,128|FS:0,0|Pn:P|WCO:-60.000,-50.000,-36.400|Ov:100,100,100>`

- Estados: Idle, Run, Hold:n, Jog, Alarm, Door:n, Check, Home, Sleep.
- `WPos = MPos − WCO`. WCO no llega en todos los reportes: se guarda el último.
- `Pn:` pines activos: `P` sonda, `X Y Z` límites, `D` puerta. Sin `Pn` = nada activo.

## Comandos que usa la app
| | |
|---|---|
| `$H` | homing |
| `$X` | quitar alarma sin homing |
| `$J=G21G91X1F600` | jog relativo |
| `G10 L20 P1 X0 Y0` | la posición actual pasa a ser X0 Y0 (G54) |
| `G38.2 Z-15 F100` | bajar hasta tocar. Éxito: `[PRB:x,y,z:1]` y `ok`. Sin contacto: ALARM:5 |
| `G53 G0 Z-1` | subir en coordenadas de máquina (cambio de herramienta) |

GRBL **no** tiene ciclos de taladrado (G81/G83): el CAM los escribe como G0/G1.
