"""Diagnóstico: cuadros crudos consecutivos con líneas + luz azul tenue.
Por cuadro: dónde caen las líneas en la fila 300, cuántos marcadores y la diferencia con el anterior."""
import os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from lineas3d import marcadores
from pika_laser import Video
from recortar import Banco

banco = Banco()
banco.parar()
video = Video()
try:
    for _ in range(10):
        video.read()
    banco.pika.relleno(True, brillo=5)
    banco.pika.laser(True)
    for _ in range(20):
        video.read()
    cuadros = [video.read()[1] for _ in range(16)]
finally:
    video.release()
    banco.parar()

previo = None
for i, c in enumerate(cuadros):
    fila = c[300].astype(int)
    picos = [x for x in range(1, 1279) if fila[x] > fila.mean() + 40 and fila[x] >= fila[x - 1] and fila[x] > fila[x + 1]]
    dif = np.abs(c.astype(int) - previo.astype(int)).mean() if previo is not None else 0
    print(f"{i:2d} dif {dif:5.1f}  marcadores {len(marcadores(c)):2d}  líneas fila 300: {picos[:9]}")
    previo = c
cv2.imwrite(os.path.join(AQUI, "revisar.jpg"),
            cv2.resize(cv2.hconcat(cuadros[:4]), (1600, 300)))
