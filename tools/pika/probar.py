"""Prueba a ojo un subconjunto de las escrituras de Creality.

  python probar.py --lista          muestra las escrituras numeradas
  python probar.py 0-39             manda esas (p. ej. "0-9,15,20-22") 5 s y para
  python probar.py 0-39 --sin-video lo mismo sin arrancar el video
"""
import os, struct, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from recortar import ESCRITURAS, Banco, Camara, describir


def candidatos(sec):
    c = [("antes", o) for o in sec["antes_video"]] + [("con", o) for o in sec["con_video"]]
    return [x for x in c if struct.unpack_from("<H", bytes.fromhex(x[1]["orden"]), 4)[0] in ESCRITURAS]


def rango(texto):
    r = set()
    for p in texto.split(","):
        a, _, b = p.partition("-")
        r.update(range(int(a), int(b or a) + 1))
    return r


banco = Banco()
cand = candidatos(banco.sec)
if "--lista" in sys.argv:
    for i, (f, o) in enumerate(cand):
        print(f"{i:2d} [{f:5s}] {describir(o)}")
    sys.exit()

elegidas = rango(sys.argv[1])
sub = [c for i, c in enumerate(cand) if i in elegidas]
banco.parar()
banco.mandar([o for f, o in sub if f == "antes"])
cam = None if "--sin-video" in sys.argv else Camara()
try:
    banco.mandar([o for f, o in sub if f == "con"])
    print(f"{len(sub)} órdenes mandadas; mira el láser 5 s")
    time.sleep(5)
finally:
    if cam:
        cam.cerrar()
    banco.parar()
    print("parado")
