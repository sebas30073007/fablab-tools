"""Recorta la secuencia de Creality al mínimo que prende el láser del Pika.

Cada prueba: para todo, manda un subconjunto de las escrituras, arranca el video
y mide las líneas láser en la imagen (píxeles que destacan > 40 sobre su
mediana local). Con eso aplica ddmin sobre las escrituras. Las lecturas no se
mandan. Guarda una miniatura por prueba en recorte/ y el resultado en minima.json.
Deja el Pika apuntando a una pared o mesa, quieto, a ~30-50 cm.
"""
import json, os, struct, sys, threading, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from pika_laser import Pika, Video, XU, buscar_camara, encontrar_nodo

ESCRITURAS = {0x02, 0x1A, 0x1B, 0x1C}
SALIDA = os.path.join(AQUI, "recorte")
os.makedirs(SALIDA, exist_ok=True)


def describir(o):
    b = bytes.fromhex(o["orden"])
    op = struct.unpack_from("<H", b, 4)[0]
    if op == 2:
        prop, val = struct.unpack_from("<Ii", b, 8)
        return f"prop {prop} = {val}"
    return f"op {op:#x} {b[8:12].hex()}"


class Camara:
    """Video en un hilo; guarda el último cuadro."""

    def __init__(self):
        self.video, self.cuadro, self.vivo = Video(), None, True
        threading.Thread(target=self._leer, daemon=True).start()
        t = time.time()
        while self.cuadro is None and time.time() - t < 8:
            time.sleep(0.05)
        if self.cuadro is None:
            raise RuntimeError("sin video")

    def _leer(self):
        while self.vivo:
            ok, c = self.video.read()
            if not ok:
                break
            self.cuadro = c

    def referencia(self, segundos=0.6):
        """Máximo por píxel de los cuadros sin láser, engordado para tolerar movimiento."""
        ref, t = self.cuadro.copy(), time.time()
        while time.time() - t < segundos:
            ref = np.maximum(ref, self.cuadro)
            time.sleep(0.05)
        self.ref = cv2.dilate(ref, np.ones((7, 7), np.uint8))

    def lineas(self, segundos=0.6):
        """Máximo de píxeles que se encienden (> 40 sobre la referencia)."""
        mejor, t = 0, time.time()
        while time.time() - t < segundos:
            c = self.cuadro
            # que se encienda y además sea un trazo fino (un cambio de exposición no lo es)
            fino = cv2.subtract(c, cv2.medianBlur(c, 15)) > 25
            n = int(np.count_nonzero((cv2.subtract(c, self.ref) > 40) & fino))
            mejor = max(mejor, n)
            time.sleep(0.05)
        return mejor

    def cerrar(self):
        self.vivo = False
        self.video.release()
        time.sleep(0.5)


class Banco:
    def __init__(self):
        self.sec = json.load(open(os.path.join(AQUI, "secuencia.json")))
        _, filtro = buscar_camara()
        xu = XU(filtro)
        self.pika = Pika(xu)
        encontrar_nodo(xu, self.pika)
        self.n = 0

    def mandar(self, ordenes):
        for o in ordenes:
            self.pika.orden(o["orden"], o["sel"])
            time.sleep(0.002)

    def parar(self):
        self.mandar(self.sec["parar"])

    def prueba(self, antes, con, nombre):
        """Devuelve (líneas sin láser, líneas tras las órdenes)."""
        self.n += 1
        self.parar()
        self.mandar(antes)
        cam = Camara()
        try:
            time.sleep(0.8)
            cam.referencia()
            base = cam.lineas()
            self.mandar(con)
            time.sleep(1.5)
            luego = cam.lineas()
            cv2.imwrite(os.path.join(SALIDA, f"{self.n:02d}_{nombre}.jpg"),
                        cv2.resize(cam.cuadro, (320, 240)))
        finally:
            cam.cerrar()
            self.parar()
        return base, luego


def main():
    banco = Banco()
    sec = banco.sec
    # candidatos: escrituras de las dos fases, con su fase
    cand = [("antes", o) for o in sec["antes_video"]] + [("con", o) for o in sec["con_video"]]
    cand = [c for c in cand if struct.unpack_from("<H", bytes.fromhex(c[1]["orden"]), 4)[0] in ESCRITURAS]
    print(len(cand), "escrituras candidatas")

    base, luego = banco.prueba(sec["antes_video"], sec["con_video"], "completa")
    print(f"secuencia completa: sin láser {base}, con láser {luego}")
    nada_b, nada_l = banco.prueba([], [], "nada")
    print(f"sin órdenes: {nada_b} -> {nada_l}")
    salto = luego - max(base, nada_l)
    if salto < 300:
        raise SystemExit("No distingo el láser en la imagen; apunta el Pika a una superficie cercana.")
    umbral = max(base, nada_l) + salto * 0.3
    print(f"umbral {umbral:.0f} píxeles")

    def prende(sub, nombre):
        b, l = banco.prueba([o for f, o in sub if f == "antes"], [o for f, o in sub if f == "con"], nombre)
        r = l > umbral
        print(f"  prueba {banco.n:2d} {nombre:12s} {len(sub):3d} órdenes: {b} -> {l}  {'LÁSER' if r else '-'}")
        return r

    if not prende(cand, "escrituras"):
        raise SystemExit("Solo con escrituras no prende: hace falta alguna lectura. Hay que afinar a mano.")

    # ddmin
    actual, n = cand, 2
    while len(actual) >= 2:
        trozo = len(actual) // n
        partes = [actual[i:i + trozo] for i in range(0, len(actual), trozo)]
        reducido = False
        for i, p in enumerate(partes):
            resto = [c for j, q in enumerate(partes) if j != i for c in q]
            if prende(p, f"solo{i}"):
                actual, n, reducido = p, 2, True
                break
            if n > 2 and prende(resto, f"sin{i}"):
                actual, n, reducido = resto, max(n - 1, 2), True
                break
        if not reducido:
            if n >= len(actual):
                break
            n = min(len(actual), n * 2)

    # ¿hace falta que el video esté corriendo antes de las órdenes?
    print("\nmínimo:")
    for f, o in actual:
        print(f"  [{f}] {describir(o)}   {o['orden'][:40]}")
    json.dump([{"fase": f, **o} for f, o in actual], open(os.path.join(AQUI, "minima.json"), "w"), indent=1)
    print("guardado minima.json; miniaturas en", SALIDA)


if __name__ == "__main__":
    main()
