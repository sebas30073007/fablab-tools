"""Toma fotos RGB y gris (con video) para varias combinaciones de propiedades.

Las líneas láser salen con prop 3 = 1 (lo manda Creality al iniciar el escaneo);
158 es la luz azul de relleno y 161 su brillo.
"""
import os, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
from foto_rgb import foto
from recortar import Banco, Camara

CASOS = [
    ("3", [(3, 1)]),
    ("158+3", [(158, 1), (3, 1)]),
    ("158+3 161=3 exp3000", [(158, 1), (3, 1), (161, 3), (2026, 3000)]),
]

banco = Banco()
filas = []
for nombre, props in CASOS:
    banco.parar()
    cam = Camara()
    try:
        estados = [banco.pika.escribir(p, v) for p, v in props]
        time.sleep(1.5)
        gris = cv2.normalize(cam.cuadro, None, 0, 255, cv2.NORM_MINMAX)
        rgb = cv2.imread(foto(f"caso_{len(filas)}.jpg"))
        print(f"{nombre:22s} estados {estados}  gris máx {cam.cuadro.max()}")
        par = [cv2.resize(rgb, (400, 300)), cv2.resize(cv2.cvtColor(gris, cv2.COLOR_GRAY2BGR), (400, 300))]
        cv2.putText(par[0], nombre, (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        filas.append(cv2.hconcat(par))
    finally:
        banco.pika.escribir(161, 20)
        banco.pika.escribir(2026, 1500)
        cam.cerrar()
banco.parar()
cv2.imwrite(os.path.join(AQUI, "casos.jpg"), cv2.vconcat(filas))
