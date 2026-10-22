"""¿Por qué no se ven las líneas láser? Prende el láser con video y barre
exposición y ganancia, midiendo el brillo de la imagen gris en cada paso.

  python lineas.py --leer            solo lee las propiedades candidatas
  python lineas.py                   barrido (guarda lineas_*.png)
"""
import os, struct, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from recortar import Banco, Camara

# propiedades que leyó Creality o que suenan a exposición, ganancia o láser
CANDIDATAS = [5, 62, 81, 110, 154, 155, 156, 158, 159, 161, 164, 183, 192, 220, 240,
              2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]


def leer(pika, prop):
    return pika.leer(prop)


def escribir(pika, prop, valor):
    return pika.escribir(prop, valor)


def brillo(cam, segundos=1.0):
    medias, maximos, mejor, t = [], [], None, time.time()
    while time.time() - t < segundos:
        c = cam.cuadro
        medias.append(c.mean())
        maximos.append(int(np.percentile(c, 99.9)))
        if mejor is None or maximos[-1] >= max(maximos[:-1] or [0]):
            mejor = c
        time.sleep(0.04)
    return f"media {np.mean(medias):5.1f}  p99.9 {min(maximos):3d}..{max(maximos):3d}", mejor


banco = Banco()
pika = banco.pika
banco.parar()
for p in CANDIDATAS:
    estado, v = leer(pika, p)
    print(f"prop {p:5d}: " + (f"actual {v[0]} máx {v[1]} mín {v[2]} paso {v[3]} defecto {v[4]}" if v else f"estado {estado}"))
if "--leer" in sys.argv:
    sys.exit()

cam = Camara()
try:
    escribir(pika, 158, 1)
    time.sleep(1)
    pasos = [("inicio", None, None)]
    est, v = leer(pika, 2026)
    if v:
        pasos += [("exp IR", 2026, x) for x in (v[2], v[0], v[1])]  # mín, actual, máx
    pasos += [("ganancia IR", 2027, x) for x in (4000, 16000)]
    pasos += [("ganancia IR", 2027, 1000), ("exp IR", 2026, 1500), ("auto exp IR", 2025, 1)]
    for nombre, prop, valor in pasos:
        if prop:
            e = escribir(pika, prop, valor)
            time.sleep(0.8)
            nombre = f"{nombre} {prop}={valor} (estado {e})"
        texto, cuadro = brillo(cam)
        print(f"{nombre:34s} {texto}")
        cv2.imwrite(os.path.join(AQUI, f"lineas_{len(nombre)}_{prop}_{valor}.png"), cuadro)
finally:
    cam.cerrar()
    banco.parar()
