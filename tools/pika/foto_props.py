"""Prende una por una las propiedades booleanas (con video) y toma una foto RGB de cada una.

  python foto_props.py 3 81 156 183 158
"""
import os, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
from foto_rgb import foto
from recortar import Banco, Camara

props = [int(x) for x in sys.argv[1:]] or [3, 81, 156, 183, 158]
banco = Banco()
fotos = []
for prop in [None] + props:
    banco.parar()
    cam = Camara()
    try:
        estado = banco.pika.escribir(prop, 1) if prop else None
        time.sleep(1)
        ruta = foto(f"prop_{prop}.jpg")
        print(f"prop {prop} = 1 -> estado {estado}")
        img = cv2.resize(cv2.imread(ruta), (320, 240))
        cv2.putText(img, f"prop {prop}", (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 255), 2)
        fotos.append(img)
    finally:
        if prop:
            banco.pika.escribir(prop, 0)
        cam.cerrar()
banco.parar()
cv2.imwrite(os.path.join(AQUI, "props.jpg"), cv2.hconcat(fotos))
