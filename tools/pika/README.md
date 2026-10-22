# Pika: control sin Creality Scan

Control propio del escáner Creality Pika (USB `2BC5:0C0B`, cámara Orbbec) desde Python.

## Láser

- Con la **cámara gris transmitiendo**, la propiedad **158 = 1** prende el láser y **158 = 0** lo apaga. Sin video no prende.
- Las órdenes van por la Extension Unit de UVC: GUID `{a55751a1-f3c5-4a5e-8d5a-6854b8fa2716}`, unidad 4, interfaz 0 (nodo KS 3). Se mandan con `IKsControl` de DirectShow y no hace falta ser administrador.
- Protocolo de vendedor de Orbbec: la orden es `47 4d` («GM») + tamaño en palabras + opcode + seq + datos, por SET_CUR en el selector 2 (64 B). La respuesta es `52 42` («RB») + tamaño + opcode + seq + estado, por GET_CUR en el selector 2 (o en el 3/1 si es larga). Opcode 1 = leer propiedad, 2 = escribir (id u32 + valor).
- El HID solo manda un latido; no controla nada.

## Archivos

| Archivo | Para qué |
|---|---|
| `pika_laser.py` | Núcleo: encuentra la cámara, la XU y manda órdenes GM; si se corre solo, repite la secuencia completa de Creality con video |
| `probar.py` | Manda un subconjunto de las escrituras de Creality (`--lista`, `0-39`, `--sin-video`) |
| `apagar.py` | Prende con 158 = 1 y apaga con 158 = 0 |
| `secuencia.json` | Lo que mandó Creality Scan, por fases (antes del video, con video, parar) |
| `capturar-pika.cmd` | Captura USB con USBPcap (pide admin; Wireshark en `E:\Wireshark`, USBPcap en `E:\USBPcap`) |
| `decodificar.py`, `pares.py`, `extraer_secuencia.py` | Análisis de la captura (tshark → TSV → órdenes) |
| `descriptor.py` | Lee el descriptor USB pidiéndolo al hub (la ruta del hub y el puerto están fijos) |
| `recortar.py`, `diagnostico.py` | Intento de medir el láser en la imagen |

Video: ffmpeg por DirectShow, `-pixel_format gray -video_size 1280x960`. OpenCV no abre la cámara por índice.
