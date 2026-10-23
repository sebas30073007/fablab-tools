"""Rectifica un par izquierda/derecha con luz azul y líneas; guarda rect.jpg con guías horizontales."""
import os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from estereo import Rectificador, Separador
from pika_laser import Video
from recortar import Banco

rect = Rectificador()
print(f"f rectificada {rect.f:.1f} px, base {rect.base:.2f} mm")
sep = Separador(rect)
banco = Banco()
banco.parar()
video = Video()
try:
    for _ in range(10):
        video.read()
    banco.pika.relleno(True, brillo=5)
    banco.pika.laser(True)
    for _ in range(10):
        video.read()
    par = None
    for _ in range(30):
        par = sep.agregar(video.read()[1]) or par
finally:
    video.release()
    banco.parar()

izq, der = par
print("izquierda = vista", sep.izq_es)
ri, rd = rect.rectificar(izq, der)
lado = cv2.cvtColor(cv2.hconcat([ri, rd]), cv2.COLOR_GRAY2BGR)
lado = cv2.normalize(lado, None, 0, 255, cv2.NORM_MINMAX)
for y in range(0, 960, 40):
    cv2.line(lado, (0, y), (2559, y), (0, 200, 255), 1)
cv2.imwrite(os.path.join(AQUI, "rect.jpg"), cv2.resize(lado, (1600, 600)))
cv2.imwrite(os.path.join(AQUI, "rect_izq.png"), ri)
cv2.imwrite(os.path.join(AQUI, "rect_der.png"), rd)
