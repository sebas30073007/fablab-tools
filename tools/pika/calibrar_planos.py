"""Calibra el plano de cada línea láser con capturas de una pared lisa.

  python calibrar_planos.py capturar 250    Pika quieto frente a la pared a 250 mm
  python calibrar_planos.py ajustar         ajusta los planos con todas las capturas

Capturar promedia varios pares rectificados (solo líneas, sin luz azul) y los
guarda en planos/pared_<mm>_{izq,der}.png. Ajustar empareja las líneas de cada
captura con la distancia medida como referencia (basta ±10 %), las numera de
izquierda a derecha y prueba cómo se alinean los números entre capturas: la
alineación correcta es la que deja todos los planos pasando por un eje común
(el emisor). Guarda planos/planos.json.
"""
import itertools, json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from estereo import Rectificador, Separador
from lineas3d import profundidad

CARPETA = os.path.join(AQUI, "planos")
SEPARACION = 40  # px en la imagen izquierda entre líneas distintas


def capturar(mm):
    from pika_laser import Video
    from recortar import Banco
    rect = Rectificador()
    sep = Separador(rect)
    banco = Banco()
    banco.parar()
    video = Video()
    izqs, ders = [], []
    try:
        for _ in range(10):
            video.read()
        banco.pika.laser(True)
        for _ in range(10):
            video.read()
        ultimo = None
        while len(izqs) < 10:
            par = sep.agregar(video.read()[1])
            if par and (ultimo is None or par[0] is not ultimo[0] and par[1] is not ultimo[1]):
                izqs.append(par[0].astype(np.float32))
                ders.append(par[1].astype(np.float32))
                ultimo = par
    finally:
        video.release()
        banco.parar()
    ri, rd = rect.rectificar(np.uint8(np.mean(izqs, 0)), np.uint8(np.mean(ders, 0)))
    os.makedirs(CARPETA, exist_ok=True)
    cv2.imwrite(os.path.join(CARPETA, f"pared_{mm}_izq.png"), ri)
    cv2.imwrite(os.path.join(CARPETA, f"pared_{mm}_der.png"), rd)
    xyz, pts, _ = profundidad(ri, rd, rect, float(mm))
    print(f"{mm} mm: {len(pts)} puntos, Z mediana {np.median(xyz[:, 2]):.0f} mm" if len(xyz) else "sin puntos")


def lineas_de(rect, mm):
    """Puntos 3D de cada línea de una captura, ordenadas de izquierda a derecha."""
    ri = cv2.imread(os.path.join(CARPETA, f"pared_{mm}_izq.png"), 0)
    rd = cv2.imread(os.path.join(CARPETA, f"pared_{mm}_der.png"), 0)
    xyz, pts, _ = profundidad(ri, rd, rect, float(mm))
    x_img = np.array([x for _, x, _ in pts])
    orden = np.argsort(x_img)
    grupos, actual = [], [orden[0]]
    for a, b in zip(orden, orden[1:]):
        if x_img[b] - x_img[a] > SEPARACION:
            grupos.append(actual)
            actual = []
        actual.append(b)
    grupos.append(actual)
    return [xyz[g] for g in grupos if len(g) > 30]


def plano(p):
    c = p.mean(0)
    _, s, vt = np.linalg.svd(p - c)
    n = vt[2]
    return n, n @ c, np.sqrt(s[2] ** 2 / len(p))


def eje_comun(planos):
    """Error de que todos los planos pasen por una misma recta, y su punto más cercano."""
    N = np.array([n for n, _, _ in planos])
    d = np.array([dd for _, dd, _ in planos])
    _, s, vt = np.linalg.svd(N)
    a = vt[2]  # dirección del eje: perpendicular a todas las normales
    p, *_ = np.linalg.lstsq(N, d, rcond=None)
    p -= a * (a @ p)  # punto del eje más cercano al origen (cámara izquierda)
    resid = np.sqrt(np.mean((N @ p - d) ** 2))
    return resid + 100 * s[2] / np.sqrt(len(planos)), p, a


def ajustar():
    rect = Rectificador()
    medidas = sorted(int(f.split("_")[1]) for f in os.listdir(CARPETA) if f.endswith("_izq.png"))
    if len(medidas) < 2:
        raise SystemExit("Hacen falta capturas a dos distancias o más.")
    capturas = {mm: lineas_de(rect, mm) for mm in medidas}
    for mm, ls in capturas.items():
        print(f"{mm} mm: {len(ls)} líneas, Z medianas {[round(float(np.median(l[:, 2]))) for l in ls]}")
    base = medidas[0]
    mejor = None
    # desplazamiento del índice de cada captura respecto a la primera
    for despl in itertools.product(range(-2, 3), repeat=len(medidas) - 1):
        offs = dict(zip(medidas, (0,) + despl))
        indices = set.intersection(*[set(range(-o, len(capturas[mm]) - o)) for mm, o in offs.items()])
        if len(indices) < 3:
            continue
        planos = {i: plano(np.vstack([capturas[mm][i + offs[mm]] for mm in medidas])) for i in sorted(indices)}
        error, p, a = eje_comun(list(planos.values()))
        error += np.mean([r for _, _, r in planos.values()])
        if mejor is None or error < mejor[0]:
            mejor = (error, offs, planos, p, a)
    error, offs, planos, p, a = mejor
    print(f"alineación {offs}, error {error:.3f}")
    print(f"eje del emisor: pasa por ({p[0]:.1f}, {p[1]:.1f}, {p[2]:.1f}) mm, dirección {np.round(a, 3).tolist()}")
    for i, (n, d, r) in planos.items():
        print(f"  línea {i:2d}: normal {np.round(n, 4).tolist()}  d {d:8.2f}  residuo {r:.2f} mm")
    json.dump({"planos": [{"n": n.tolist(), "d": float(d), "residuo": float(r)} for n, d, r in planos.values()],
               "eje": {"punto": p.tolist(), "direccion": a.tolist()}, "medidas": medidas},
              open(os.path.join(CARPETA, "planos.json"), "w"), indent=1)


if __name__ == "__main__":
    if sys.argv[1:2] == ["capturar"]:
        capturar(int(sys.argv[2]))
    elif sys.argv[1:2] == ["ajustar"]:
        ajustar()
    else:
        print(__doc__)
