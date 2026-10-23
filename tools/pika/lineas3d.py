"""Profundidad a partir de las líneas láser en un par rectificado izquierda/derecha.

1. En cada fila, el centro subpíxel de cada línea (pico fino; los anchos son marcadores).
2. Las líneas se agrupan en segmentos por continuidad entre filas.
3. Los marcadores (manchas) se emparejan por fila y dan disparidad sin ambigüedad.
4. Cada segmento izquierdo se empareja con el derecho cuya disparidad queda más
   cerca de la referencia local (marcador más cercano o distancia aproximada).
5. Z = f·B / d, y X, Y con la cámara rectificada.

  python lineas3d.py rect_izq.png rect_der.png [distancia_mm]
"""
import os, sys

import cv2
import numpy as np

UMBRAL = 20        # sobre el fondo
ANCHO_MAX = 10     # px a media altura; más ancho = marcador
SALTO_MAX = 4      # px entre filas para seguir el mismo segmento
FILAS_MIN = 15     # segmentos más cortos se descartan


def picos(img):
    """Lista de (fila, x subpíxel) de líneas finas."""
    f = cv2.GaussianBlur(img.astype(np.float32), (1, 5), 0)
    fondo = cv2.blur(f, (41, 1))
    alto = f - fondo
    salida = []
    h, w = f.shape
    for y in range(h):
        r = alto[y]
        cand = np.where((r[1:-1] > UMBRAL) & (r[1:-1] >= r[:-2]) & (r[1:-1] > r[2:]))[0] + 1
        for x in cand:
            mitad = r[x] / 2
            i = x
            while i > 0 and r[i] > mitad:
                i -= 1
            j = x
            while j < w - 1 and r[j] > mitad:
                j += 1
            if j - i > ANCHO_MAX:
                continue
            a, b, c = r[x - 1], r[x], r[x + 1]
            denom = a - 2 * b + c
            salida.append((y, x + (0.5 * (a - c) / denom if denom else 0.0)))
    return salida


def segmentos(pk):
    """Agrupa picos en segmentos verticales: lista de dict fila -> x."""
    por_fila = {}
    for y, x in pk:
        por_fila.setdefault(y, []).append(x)
    abiertos, cerrados = [], []
    for y in sorted(por_fila):
        nuevos = []
        usados = set()
        for x in sorted(por_fila[y]):
            mejor = None
            for k, s in enumerate(abiertos):
                if k in usados or s["ultima"] != y - 1:
                    continue
                dx = abs(s["x"][y - 1] - x)
                if dx <= SALTO_MAX and (mejor is None or dx < mejor[0]):
                    mejor = (dx, k)
            if mejor:
                s = abiertos[mejor[1]]
                usados.add(mejor[1])
            else:
                s = {"x": {}}
            s["x"][y], s["ultima"] = x, y
            nuevos.append(s)
        cerrados += [s for k, s in enumerate(abiertos) if k not in usados]
        abiertos = nuevos
    return [s["x"] for s in cerrados + abiertos if len(s["x"]) >= FILAS_MIN]


def marcadores(img):
    """Centros (x, y) y áreas de manchas brillantes redondeadas."""
    _, b = cv2.threshold(img, int(np.median(img)) + 60, 255, cv2.THRESH_BINARY)
    n, _, st, cen = cv2.connectedComponentsWithStats(b)
    m = []
    for i in range(1, n):
        x, y, w, h, area = st[i]
        if area >= 60 and 0.4 < w / h < 2.5 and area > 0.5 * w * h:
            m.append((cen[i][0], cen[i][1], area))
    return m


def disparidad_marcadores(mi, md):
    """Pares de marcadores en la misma fila; devuelve lista de (x, y, d)."""
    pares = []
    for xi, yi, ai in mi:
        cand = [(abs(yd - yi), xi - xd) for xd, yd, ad in md
                if abs(yd - yi) < 3 and xi - xd > 0 and 0.5 < ad / ai < 2]
        if len(cand) == 1 or (cand and sorted(cand)[0][0] < 1.5 and
                              (len(cand) < 2 or sorted(cand)[1][0] > 2.5)):
            pares.append((xi, yi, min(cand)[1]))
    return pares


def emparejar(seg_i, seg_d, ref):
    """Para cada segmento izquierdo, el derecho cuya disparidad mediana se acerca más
    a ref(x, y). Devuelve lista de (y, x_izq, d)."""
    puntos = []
    for si in seg_i:
        filas = np.array(sorted(si))
        xm, ym = np.median([si[y] for y in filas]), np.median(filas)
        d_ref = ref(xm, ym)
        mejor = None
        for sd in seg_d:
            comunes = [y for y in filas if y in sd]
            if len(comunes) < FILAS_MIN // 2:
                continue
            d = np.median([si[y] - sd[y] for y in comunes])
            if d <= 0:
                continue
            if mejor is None or abs(d - d_ref) < abs(mejor[0] - d_ref):
                mejor = (d, sd, comunes)
        if mejor and abs(mejor[0] - d_ref) < 0.25 * d_ref:
            d, sd, comunes = mejor
            puntos += [(y, si[y], si[y] - sd[y]) for y in comunes]
    return puntos


def propagar(seg_i, picos_d, semillas, d_def):
    """Empareja fila por fila, propagando la disparidad desde las semillas.

    seg_i: segmentos izquierdos (fila -> x); picos_d: fila -> array de x derechas;
    semillas: lista de (x, y, d) confiables (marcadores). Las líneas se resuelven
    de la más cercana a una referencia a la más lejana, y cada línea resuelta
    se vuelve referencia de sus vecinas. Devuelve lista de (y, x_izq, d)."""
    resueltos = [(x, y, d) for x, y, d in semillas]
    pendientes = list(seg_i)
    puntos = []

    def referencia(s):
        filas = np.array(sorted(s))
        xm, ym = np.median([s[y] for y in filas]), np.median(filas)
        if not resueltos:
            return d_def, 0.0
        arr = np.array(resueltos)
        # pesa más la distancia vertical: una línea vecina en las mismas filas es mejor guía
        dist = np.hypot(arr[:, 0] - xm, 3 * (arr[:, 1] - ym))
        k = np.argmin(dist)
        return arr[k, 2], dist[k]

    while pendientes:
        refs = [referencia(s) for s in pendientes]
        k = int(np.argmin([r[1] for r in refs]))
        s, (d_ref, _) = pendientes.pop(k), refs[k]
        # disparidad inicial: la candidata más cercana a la referencia, por voto de filas
        votos = []
        for y in s:
            xd = picos_d.get(y)
            if xd is not None and len(xd):
                c = s[y] - xd
                c = c[c > 0]
                if len(c):
                    votos.append(c[np.argmin(np.abs(c - d_ref))])
        if not votos:
            continue
        d_actual = float(np.median(votos))
        if abs(d_actual - d_ref) > 0.3 * d_ref:
            continue
        propios = []
        for y in sorted(s):
            xd = picos_d.get(y)
            if xd is None or not len(xd):
                continue
            c = s[y] - xd
            j = np.argmin(np.abs(c - d_actual))
            if abs(c[j] - d_actual) < 3:
                d_actual = float(c[j])
                propios.append((y, s[y], d_actual))
        if len(propios) >= FILAS_MIN // 2:
            puntos += propios
            paso = max(1, len(propios) // 8)
            resueltos += [(x, y, d) for y, x, d in propios[::paso]]
    return puntos


class Abanico:
    """Planos láser: todos giran alrededor del eje del emisor con un paso angular fijo
    (calibrar_planos.py). Se ajusta θ = θ0 + i·paso con los planos calibrados y se
    generan los de todas las líneas. Coordenadas: cámara izquierda rectificada, mm."""

    def __init__(self, ruta=None, extra=12):
        import json
        ruta = ruta or os.path.join(os.path.dirname(os.path.abspath(__file__)), "planos", "planos.json")
        j = json.load(open(ruta))
        a = np.array(j["eje"]["direccion"])
        p = np.array(j["eje"]["punto"])
        u = np.cross(a, [0, 0, 1.0])
        u /= np.linalg.norm(u)
        v = np.cross(a, u)
        th = []
        for pl in j["planos"]:
            n = np.array(pl["n"])
            n = n if n @ u > 0 else -n
            th.append(np.arctan2(n @ v, n @ u))
        i = np.arange(len(th))
        self.paso, th0 = np.polyfit(i, np.unwrap(th), 1)
        ks = np.arange(-extra, len(th) + extra)
        ang = th0 + ks * self.paso
        self.normales = np.outer(np.cos(ang), u) + np.outer(np.sin(ang), v)
        self.d = self.normales @ p
        self.indices = ks

    def profundidades(self, rayo):
        """Z de cada plano para un rayo (x', y', 1) de la cámara izquierda rectificada."""
        den = self.normales @ rayo
        with np.errstate(divide="ignore"):
            return np.where(np.abs(den) > 1e-6, self.d / den, np.nan)


def profundidad_planos(izq, der, rect, abanico, z_min=120, z_max=900, tol=2.5):
    """Profundidad con los planos: por cada línea izquierda, el plano cuyo punto
    predicho en la derecha coincide con una línea real en más filas. Devuelve
    (xyz, puntos (y, x, d), plano elegido por punto)."""
    cx, cy, f = rect.P1[0, 2], rect.P1[1, 2], rect.f
    fb = rect.f * rect.base
    picos_d = {}
    for y, x in picos(der):
        picos_d.setdefault(y, []).append(x)
    picos_d = {y: np.array(v) for y, v in picos_d.items()}
    puntos, planos = [], []
    for s in segmentos(picos(izq)):
        votos = {}
        por_fila = {}
        for y, x in s.items():
            xd = picos_d.get(y)
            if xd is None:
                continue
            zs = abanico.profundidades(np.array([(x - cx) / f, (y - cy) / f, 1.0]))
            for k, z in enumerate(zs):
                if not z_min < z < z_max:
                    continue
                pred = x - fb / z
                j = np.argmin(np.abs(xd - pred))
                if abs(xd[j] - pred) < tol:
                    votos[k] = votos.get(k, 0) + 1
                    por_fila.setdefault(k, []).append((y, x, x - xd[j]))
        if not votos:
            continue
        k = max(votos, key=votos.get)
        if votos[k] < max(FILAS_MIN // 2, 0.3 * len(s)):
            continue
        puntos += por_fila[k]
        planos += [int(abanico.indices[k])] * len(por_fila[k])
    return triangular(puntos, rect.Q), puntos, planos


def triangular(puntos, Q):
    if not puntos:
        return np.zeros((0, 3))
    p = np.array([[x, y, d] for y, x, d in puntos], np.float32).reshape(-1, 1, 3)
    return cv2.perspectiveTransform(p, Q).reshape(-1, 3)


def profundidad(izq, der, rect, distancia_mm=300.0, semillas=True):
    """Devuelve (puntos 3D en mm, puntos (y, x, d), marcadores emparejados).
    Con semillas=False los marcadores no guían el emparejamiento (solo distancia_mm)."""
    seg_i = segmentos(picos(izq))
    picos_d = {}
    for y, x in picos(der):
        picos_d.setdefault(y, []).append(x)
    picos_d = {y: np.array(v) for y, v in picos_d.items()}
    marc = disparidad_marcadores(marcadores(izq), marcadores(der))
    pts = propagar(seg_i, picos_d, marc if semillas else [], rect.f * rect.base / distancia_mm)
    return triangular(pts, rect.Q), pts, marc


def guardar_ply(ruta, xyz):
    with open(ruta, "w") as f:
        f.write(f"ply\nformat ascii 1.0\nelement vertex {len(xyz)}\n"
                "property float x\nproperty float y\nproperty float z\nend_header\n")
        for x, y, z in xyz:
            f.write(f"{x:.2f} {y:.2f} {z:.2f}\n")


def dibujar(izq, pts, marc, xyz):
    """Imagen izquierda con cada punto coloreado por Z."""
    img = cv2.cvtColor(cv2.normalize(izq, None, 0, 160, cv2.NORM_MINMAX), cv2.COLOR_GRAY2BGR)
    if len(xyz):
        z = xyz[:, 2]
        lo, hi = np.percentile(z, (2, 98))
        col = cv2.applyColorMap(np.uint8(np.clip((z - lo) / max(hi - lo, 1) * 255, 0, 255)).reshape(-1, 1),
                                cv2.COLORMAP_TURBO).reshape(-1, 3)
        for (y, x, _), c in zip(pts, col):
            cv2.circle(img, (int(round(x)), int(y)), 1, tuple(int(v) for v in c), -1)
        cv2.putText(img, f"Z {lo:.0f}-{hi:.0f} mm", (12, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
    for x, y, d in marc:
        cv2.circle(img, (int(x), int(y)), 14, (255, 255, 255), 2)
    return img


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from estereo import Rectificador
    izq = cv2.imread(sys.argv[1], 0)
    der = cv2.imread(sys.argv[2], 0)
    rect = Rectificador()
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "planos", "planos.json")):
        xyz, pts, _ = profundidad_planos(izq, der, rect, Abanico())
        marc = disparidad_marcadores(marcadores(izq), marcadores(der))
        print("con planos láser")
    else:
        xyz, pts, marc = profundidad(izq, der, rect, float(sys.argv[3]) if len(sys.argv) > 3 else 300.0)
    print(f"{len(pts)} puntos, {len(marc)} marcadores emparejados")
    if marc:
        print("marcadores Z (mm):", [round(rect.f * rect.base / d) for _, _, d in marc])
    if len(xyz):
        print(f"Z: mediana {np.median(xyz[:, 2]):.0f} mm, rango {xyz[:, 2].min():.0f}-{xyz[:, 2].max():.0f}")
    base = os.path.splitext(sys.argv[1])[0]
    guardar_ply(base + ".ply", xyz)
    cv2.imwrite(base + "_z.jpg", cv2.resize(dibujar(izq, pts, marc, xyz), (960, 720)))
