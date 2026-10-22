"""Con la cámara gris corriendo, toma fotos RGB y gris con el láser apagado y prendido.

  python foto_rgb.py          láser solo con 158
  python foto_rgb.py --modo   antes elige el modo «Laser Lines Scan» (escrituras 3 y 4)
"""
import os, struct, subprocess, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
from recortar import ESCRITURAS, Banco, Camara


def foto(nombre):
    ruta = os.path.join(AQUI, nombre)
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "dshow",
                    "-vcodec", "mjpeg", "-video_size", "1280x960", "-i",
                    "video=Creality Pika RGB Camera", "-frames:v", "1", "-ss", "1", ruta],
                   check=True, timeout=20)
    return ruta


def main():
    banco = Banco()
    banco.parar()
    sufijo = ""
    if "--modo" in sys.argv:
        escrituras = [o for o in banco.sec["antes_video"]
                      if struct.unpack_from("<H", bytes.fromhex(o["orden"]), 4)[0] in ESCRITURAS]
        banco.mandar(escrituras[3:5])  # op 0x1a y 0x1c sobre 0x413 = «Laser Lines Scan»
        sufijo = "_modo"
    cam = Camara()
    try:
        foto(f"rgb_apagado{sufijo}.jpg")
        banco.pika.laser(True)
        time.sleep(1)
        cv2.imwrite(os.path.join(AQUI, f"gris_prendido{sufijo}.png"), cam.cuadro)
        print("guardada", foto(f"rgb_prendido{sufijo}.jpg"))
    finally:
        cam.cerrar()
        banco.parar()


if __name__ == "__main__":
    main()
