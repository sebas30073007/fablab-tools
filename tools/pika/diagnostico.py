"""Secuencia completa y estadísticas de cada cuadro: ¿se ve el láser en la imagen?"""
import os, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from recortar import Banco, Camara

banco = Banco()
sec = banco.sec
banco.parar()
banco.mandar(sec["antes_video"])
cam = Camara()
vistos = []


def muestrear(etiqueta, segundos):
    t, ultimo = time.time(), None
    while time.time() - t < segundos:
        c = cam.cuadro
        if c is not ultimo:
            ultimo = c
            vistos.append(c)
            print(f"{etiqueta} {time.time() - t:5.2f}s media {c.mean():6.1f} p99.9 {np.percentile(c, 99.9):5.0f} max {c.max():3d}")
        time.sleep(0.03)


try:
    muestrear("antes", 1.5)
    cv2.imwrite(os.path.join(AQUI, "diag_antes.png"), cam.cuadro)
    banco.mandar(sec["con_video"])
    muestrear("despues", 4)
    brillante = max(vistos[-60:], key=lambda c: int(np.percentile(c, 99.9)))
    cv2.imwrite(os.path.join(AQUI, "diag_despues.png"), cam.cuadro)
    cv2.imwrite(os.path.join(AQUI, "diag_brillante.png"), brillante)
finally:
    cam.cerrar()
    banco.parar()
