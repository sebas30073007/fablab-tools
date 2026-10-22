"""¿Abrir la cámara RGB apaga las líneas en la gris?"""
import os, subprocess, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import numpy as np
from recortar import Banco, Camara


def medir(cam, nombre):
    time.sleep(1.5)
    c = cam.cuadro
    print(f"{nombre:24s} mediana {np.median(c):5.1f}  p99.9 {np.percentile(c, 99.9):5.1f}")


banco = Banco()
banco.parar()
cam = Camara()
rgb = None
try:
    banco.pika.laser(True)
    medir(cam, "líneas, sin RGB")
    rgb = subprocess.Popen(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "dshow", "-vcodec", "mjpeg",
                            "-video_size", "1280x960", "-i", "video=Creality Pika RGB Camera",
                            "-f", "null", "-"])
    medir(cam, "líneas, con RGB")
    medir(cam, "líneas, con RGB (otra)")
    rgb.kill(); rgb = None
    medir(cam, "líneas, RGB cerrada")
    banco.pika.laser(False); banco.pika.laser(True)
    medir(cam, "líneas re-prendidas")
finally:
    if rgb:
        rgb.kill()
    cam.cerrar()
    banco.parar()
