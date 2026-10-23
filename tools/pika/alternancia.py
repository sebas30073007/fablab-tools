"""¿El video gris alterna dos cámaras? Lee cuadros consecutivos con las líneas
prendidas y compara dónde caen las líneas y la primera fila (¿marca de cuadro?)."""
import os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from pika_laser import Video
from recortar import Banco

banco = Banco()
banco.parar()
video = Video()
try:
    for _ in range(15):  # deja que arranque
        video.read()
    banco.pika.laser(True)
    for _ in range(20):
        video.read()
    cuadros = [video.read()[1] for _ in range(40)]
finally:
    video.release()
    banco.parar()

def vista(c):
    """'A' o 'B' según dónde caen las líneas en la fila 480 (solo para este diagnóstico)."""
    fila = c[480].astype(int)
    picos = np.where(fila > fila.mean() + 25)[0]
    return "A" if (picos > 700).sum() > (picos < 700).sum() else "B"


tipos = [vista(c) for c in cuadros]
print("secuencia:", "".join(tipos))
# ¿alguna fila o columna del borde distingue las vistas?
for nombre, corte in (("fila 0", lambda c: c[0]), ("fila 959", lambda c: c[-1]),
                      ("col 0", lambda c: c[:, 0]), ("col 1279", lambda c: c[:, -1])):
    a = np.mean([corte(c) for c, t in zip(cuadros, tipos) if t == "A"], axis=0)
    b = np.mean([corte(c) for c, t in zip(cuadros, tipos) if t == "B"], axis=0)
    d = np.abs(a - b)
    print(f"{nombre:9s} dif máx {d.max():5.1f} en {int(d.argmax())}  (A {a[d.argmax()]:.0f} / B {b[d.argmax()]:.0f})")
fila = [cv2.resize(cv2.normalize(c, None, 0, 255, cv2.NORM_MINMAX), (320, 240)) for c in cuadros[:4]]
cv2.imwrite(os.path.join(AQUI, "alternancia.jpg"), cv2.hconcat(fila))
