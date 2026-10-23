"""Calibra el plano de cada línea láser con capturas de una pared lisa.

  python calibrar_planos.py capturar 1      Pika quieto frente a la pared (posición 1, 2, 3…)
  python calibrar_planos.py ajustar         ajusta los planos con todas las capturas

Sin cinta: un domo con marcadores pegado a la pared hace de regla. Los marcadores
se emparejan sin ambigüedad y dan su distancia; la pared queda ~2 cm detrás.
Capturar promedia varios pares rectificados (líneas + luz azul tenue para los
marcadores) y los guarda en planos/pared_<n>_{izq,der}.png. Ajustar empareja las
líneas de cada captura tomando esa distancia como referencia, se queda con los
puntos de la pared, numera las líneas de izquierda a derecha y prueba cómo se
alinean los números entre capturas: la alineación correcta deja todos los planos
pasando por un eje común (el emisor). Guarda planos/planos.json.
"""
import itertools, json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cv2
import numpy as np
from estereo import Rectificador, Separador
from lineas3d import disparidad_marcadores, marcadores, picos, segmentos, triangular

CARPETA = os.path.join(AQUI, "planos")
SEPARACION = 40  # px en la imagen izquierda entre líneas distintas
DETRAS_MM = 20   # la pared queda ~2 cm detrás de los marcadores del domo


def distancia_pared(ri, rd, rect):
    marc = disparidad_marcadores(marcadores(ri), marcadores(rd))
    if not marc:
        raise SystemExit("No veo marcadores en las dos vistas: acerca el domo a la pared y que salga en la imagen.")
    return float(np.median([rect.f * rect.base / d for _, _, d in marc])) + DETRAS_MM, len(marc)


def capturar(n):
    from pika_laser import Video
    from recortar import Banco
    rect = Rectificador()
    banco = Banco()
    banco.parar()
    video = Video()
    izqs, ders = [], []
    try:
        for _ in range(10):
            video.read()
        banco.pika.relleno(True, brillo=5)
        banco.pika.laser(True)
        for _ in range(20):
            video.read()
        sep = Separador(rect)  # con la luz ya estable
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
    a, b = np.uint8(np.mean(izqs, 0)), np.uint8(np.mean(ders, 0))
    ri, rd = rect.rectificar(a, b)
    # el lado correcto es el que da disparidad positiva en los marcadores
    if not disparidad_marcadores(marcadores(ri), marcadores(rd)):
        ri2, rd2 = rect.rectificar(b, a)
        if disparidad_marcadores(marcadores(ri2), marcadores(rd2)):
            ri, rd = ri2, rd2
            print("  (vistas intercambiadas)")
    os.makedirs(CARPETA, exist_ok=True)
    cv2.imwrite(os.path.join(CARPETA, f"pared_{n}_izq.png"), ri)
    cv2.imwrite(os.path.join(CARPETA, f"pared_{n}_der.png"), rd)
    xyz, _ = puntos_pared(ri, rd, rect)
    print(f"posición {n}: {len(xyz)} puntos de pared, Z mediana {np.median(xyz[:, 2]):.0f} mm")


def puntos_pared(ri, rd, rect):
    """Puntos 3D de la pared (sin el domo) y su posición (y, x, d) en la imagen izquierda.

    Las líneas son periódicas: cada emparejamiento da una pared posible (separadas
    ~108 px de disparidad). Se toma la hipótesis más cercana a la que indican los
    marcadores y, como la pared es plana, la disparidad se ajusta como plano en la
    imagen (d = a·x + b·y + c) re-emparejando con tolerancia estrecha."""
    zp, nm = distancia_pared(ri, rd, rect)
    pi = picos(ri)
    pd = {}
    for y, x in picos(rd):
        pd.setdefault(y, []).append(x)
    pd = {y: np.array(v) for y, v in pd.items()}
    todas = np.concatenate([x - pd[y] for y, x in pi if y in pd])
    todas = todas[todas > 0]
    hist, bordes = np.histogram(todas, bins=np.arange(0, 1400, 4))
    picos_h = [i for i in range(1, len(hist) - 1)
               if hist[i] >= hist[i - 1] and hist[i] >= hist[i + 1] and hist[i] > 0.3 * hist.max()]
    d_prev = rect.f * rect.base / zp
    d0 = min((bordes[i] + 2 for i in picos_h), key=lambda d: abs(d - d_prev))
    coef = np.array([0.0, 0.0, d0])
    tol = 20.0
    for _ in range(4):
        pts = []
        for y, x in pi:
            if y not in pd:
                continue
            esperado = coef @ (x, y, 1)
            c = x - pd[y]
            j = np.argmin(np.abs(c - esperado))
            if abs(c[j] - esperado) < tol:
                pts.append((y, x, float(c[j])))
        A = np.array([(x, y, 1) for y, x, _ in pts])
        coef, *_ = np.linalg.lstsq(A, np.array([d for _, _, d in pts]), rcond=None)
        tol = 6.0
    xyz = triangular(pts, rect.Q)
    print(f"  {nm} marcadores a ~{zp - DETRAS_MM:.0f} mm; pared elegida d ~{d0:.0f} px "
          f"(Z ~{rect.f * rect.base / d0:.0f} mm); {len(pts)} puntos")
    return xyz, pts


def lineas_de(rect, n):
    """Puntos 3D de cada línea de una captura, ordenadas de izquierda a derecha."""
    ri = cv2.imread(os.path.join(CARPETA, f"pared_{n}_izq.png"), 0)
    rd = cv2.imread(os.path.join(CARPETA, f"pared_{n}_der.png"), 0)
    xyz, pts = puntos_pared(ri, rd, rect)
    # tramos continuos fila a fila; en la pared cada línea es casi recta en la imagen,
    # así que los tramos se unen por su recta x = p·y + q evaluada en la fila central
    indice = {(y, round(x, 3)): k for k, (y, x, _) in enumerate(pts)}
    segs = segmentos([(y, x) for y, x, _ in pts])
    largos = [np.polyfit(sorted(s), [s[y] for y in sorted(s)], 1)[0] for s in segs if len(s) > 100]
    pendiente = float(np.median(largos)) if largos else 0.0  # las líneas son casi paralelas
    tramos = []
    for s in segs:
        filas = np.array(sorted(s))
        xs = np.array([s[y] for y in filas])
        tramos.append((float(np.median(xs - pendiente * (filas - 480))),
                       [indice[(y, round(s[y], 3))] for y in filas]))
    tramos.sort()
    lineas, actual, x_ant = [], [], None
    for x480, idx in tramos:
        if x_ant is not None and x480 - x_ant > SEPARACION:
            lineas.append(actual)
            actual = []
        actual += idx
        x_ant = x480
    lineas.append(actual)
    return [xyz[g] for g in lineas if len(g) > 30]


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
        print(f"posición {mm}: {len(ls)} líneas, Z medianas {[round(float(np.median(l[:, 2]))) for l in ls]}")
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
