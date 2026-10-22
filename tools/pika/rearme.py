"""¿Las líneas (prop 3) vuelven a prender tras apagarlas, o hace falta reiniciar el video?

Guarda rearme.jpg con un cuadro por paso (normalizado) y su brillo de fondo.
"""
import os, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from recortar import Banco, Camara

banco = Banco()
p = banco.pika
cuadros = []


def tomar(cam, nombre):
    time.sleep(1.2)
    c = cam.cuadro
    print(f"{nombre:28s} mediana {np.median(c):5.1f}  p99.9 {np.percentile(c, 99.9):5.1f}")
    img = cv2.resize(cv2.normalize(c, None, 0, 255, cv2.NORM_MINMAX), (320, 240))
    cv2.putText(img, nombre, (6, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, 255, 1)
    cuadros.append(img)


banco.parar()
cam = Camara()
try:
    tomar(cam, "video, sin lineas")
    p.laser(True); tomar(cam, "3=1 (primera)")
    p.laser(False); tomar(cam, "3=0")
    p.laser(True); tomar(cam, "3=1 (segunda)")
    p.laser(False); p.escribir(158, 1); p.escribir(158, 0); p.laser(True); tomar(cam, "3=1 tras 158 on/off")
finally:
    cam.cerrar()
banco.parar()
cam = Camara()
try:
    p.laser(True); tomar(cam, "3=1 tras reiniciar video")
finally:
    cam.cerrar()
    banco.parar()
cv2.imwrite(os.path.join(AQUI, "rearme.jpg"), cv2.hconcat(cuadros))
