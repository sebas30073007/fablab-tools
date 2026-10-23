"""Suma de instantáneas: ubica el Pika con los marcadores y acumula las líneas.

Cada par rectificado da marcadores en 3D (sin ambigüedad) y puntos de las líneas.
La pose del Pika respecto al mapa de marcadores se busca primero con la pose
anterior como predicción (vecino más cercano) y, si falla, por tríos de marcadores
con las mismas distancias (RANSAC). La transformación rígida sale por Kabsch.
Las líneas se pasan al marco del mapa y se suman en una rejilla de 0.5 mm.
"""
import itertools
import threading

import numpy as np

from lineas3d import disparidad_marcadores, marcadores, triangular

TOL_DIST = 1.5    # mm, para comparar distancias entre marcadores
TOL_INLIER = 2.5  # mm, marcador transformado vs. mapa
MIN_MARC = 3
VOXEL = 0.5       # mm


def kabsch(a, b):
    """R, t que llevan los puntos a sobre b (mínimos cuadrados)."""
    ca, cb = a.mean(0), b.mean(0)
    u, _, vt = np.linalg.svd((a - ca).T @ (b - cb))
    s = np.eye(3)
    s[2, 2] = np.sign(np.linalg.det(vt.T @ u.T))
    R = vt.T @ s @ u.T
    return R, cb - R @ ca


def aplicar(R, t, p):
    return p @ R.T + t


class Escaneo:
    def __init__(self, rect):
        self.rect = rect
        self.candado = threading.Lock()  # la nube se lee desde otro hilo
        self.borrar()

    def borrar(self):
        self.mapa = np.zeros((0, 3))      # marcadores en el marco global
        self.vistos = np.zeros(0)         # cuántas veces se vio cada uno (promedio)
        self.R, self.t = np.eye(3), np.zeros(3)
        with self.candado:
            self.celdas = {}              # rejilla -> (suma xyz, n)
        self.estado = "esperando marcadores"
        self.marc_actual = 0
        self.cuadros = 0

    # --- marcadores -------------------------------------------------------
    def marcadores_3d(self, ri, rd):
        pares = disparidad_marcadores(marcadores(ri), marcadores(rd))
        return triangular([(y, x, d) for x, y, d in pares], self.rect.Q)

    def _inliers(self, R, t, cur):
        g = aplicar(R, t, cur)
        dist = np.linalg.norm(g[:, None] - self.mapa[None], axis=2)
        j = dist.argmin(1)
        ok = dist[np.arange(len(cur)), j] < TOL_INLIER
        return ok, j

    def _por_prediccion(self, cur):
        ok, j = self._inliers(self.R, self.t, cur)
        if ok.sum() < MIN_MARC:
            # tolerancia amplia para un movimiento mayor entre cuadros
            g = aplicar(self.R, self.t, cur)
            dist = np.linalg.norm(g[:, None] - self.mapa[None], axis=2)
            j = dist.argmin(1)
            ok = dist[np.arange(len(cur)), j] < 15
            if ok.sum() < MIN_MARC:
                return None
        R, t = kabsch(cur[ok], self.mapa[j[ok]])
        ok2, j2 = self._inliers(R, t, cur)
        if ok2.sum() < MIN_MARC:
            return None
        return kabsch(cur[ok2], self.mapa[j2[ok2]])

    def _por_distancias(self, cur):
        dc = np.linalg.norm(cur[:, None] - cur[None], axis=2)
        dm = np.linalg.norm(self.mapa[:, None] - self.mapa[None], axis=2)
        mejor, mejor_n = None, MIN_MARC - 1
        for i, j, k in itertools.combinations(range(len(cur)), 3):
            if min(dc[i, j], dc[i, k], dc[j, k]) < 8:
                continue
            A, B = np.where(np.abs(dm - dc[i, j]) < TOL_DIST)
            for a, b in zip(A, B):
                C = np.where((np.abs(dm[a] - dc[i, k]) < TOL_DIST) & (np.abs(dm[b] - dc[j, k]) < TOL_DIST))[0]
                for c in C:
                    R, t = kabsch(cur[[i, j, k]], self.mapa[[a, b, c]])
                    ok, _ = self._inliers(R, t, cur)
                    if ok.sum() > mejor_n:
                        mejor, mejor_n = (R, t), ok.sum()
            if mejor_n >= min(len(cur), 6):
                break
        if mejor is None:
            return None
        ok, j = self._inliers(*mejor, cur)
        return kabsch(cur[ok], self.mapa[j[ok]])

    def _actualizar_mapa(self, cur):
        g = aplicar(self.R, self.t, cur)
        if not len(self.mapa):
            self.mapa, self.vistos = g, np.ones(len(g))
            return
        dist = np.linalg.norm(g[:, None] - self.mapa[None], axis=2)
        j = dist.argmin(1)
        cerca = dist[np.arange(len(g)), j] < TOL_INLIER
        for p, jj in zip(g[cerca], j[cerca]):  # promedio corrido de los ya conocidos
            n = self.vistos[jj]
            self.mapa[jj] = (self.mapa[jj] * n + p) / (n + 1)
            self.vistos[jj] = n + 1
        nuevos = g[~cerca]
        if len(nuevos):
            self.mapa = np.vstack([self.mapa, nuevos])
            self.vistos = np.concatenate([self.vistos, np.ones(len(nuevos))])

    # --- suma ------------------------------------------------------------------
    def procesar(self, ri, rd, xyz):
        """Ubica el par y suma sus líneas. Devuelve True si se sumó."""
        cur = self.marcadores_3d(ri, rd)
        self.marc_actual = len(cur)
        if len(cur) < MIN_MARC:
            self.estado = "perdido: faltan marcadores a la vista"
            return False
        if not len(self.mapa):
            self.R, self.t = np.eye(3), np.zeros(3)
        else:
            pose = self._por_prediccion(cur) or self._por_distancias(cur)
            if pose is None:
                self.estado = "perdido: no reconozco los marcadores"
                return False
            self.R, self.t = pose
        self._actualizar_mapa(cur)
        if len(xyz):
            g = aplicar(self.R, self.t, xyz)
            claves = np.floor(g / VOXEL).astype(np.int64)
            with self.candado:
                for k, p in zip(map(tuple, claves), g):
                    s = self.celdas.get(k)
                    self.celdas[k] = (p, 1) if s is None else (s[0] + p, s[1] + 1)
        self.cuadros += 1
        self.estado = "siguiendo"
        return True

    def nube(self):
        with self.candado:
            valores = list(self.celdas.values())
        if not valores:
            return np.zeros((0, 3))
        return np.array([s / n for s, n in valores])
