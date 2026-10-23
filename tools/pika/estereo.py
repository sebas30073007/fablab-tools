"""Estéreo del Pika: calibración LAS_L_SCAN_CE, rectificación y separación L/R.

La «Depth Camera» alterna cuadros de dos cámaras IR separadas 67.76 mm. La
calibración vive en la memoria del Pika (zona 0x14000, ver leer_bloques.py):
  0x68 cámara izquierda, 0x9c derecha, 0xd0 RGB: fx fy cx cy, w h (u16), k1..k6 p1 p2
  0x104 R y 0x128 T de izquierda a derecha;  0x134 R y 0x158 T de izquierda a RGB
  0x164 E y 0x188 F
"""
import os, struct

import cv2
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
ZONA = os.path.join(AQUI, "calib", "zona_14000.bin")
TAM = (1280, 960)


def _camara(b, o):
    fx, fy, cx, cy = struct.unpack_from("<4f", b, o)
    k1, k2, k3, k4, k5, k6, p1, p2 = struct.unpack_from("<8f", b, o + 20)
    K = np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1]], float)
    D = np.array([k1, k2, p1, p2, k3, k4, k5, k6], float)  # orden de OpenCV
    return K, D


def leer_calibracion(ruta=ZONA):
    b = open(ruta, "rb").read()
    if b[0x4C:0x59] != b"LAS_L_SCAN_CE":
        raise ValueError("no es la zona LAS_L_SCAN_CE; corre leer_bloques.py")
    c = {}
    c["K1"], c["D1"] = _camara(b, 0x68)
    c["K2"], c["D2"] = _camara(b, 0x9C)
    c["K3"], c["D3"] = _camara(b, 0xD0)
    c["R"] = np.array(struct.unpack_from("<9f", b, 0x104), float).reshape(3, 3)
    c["T"] = np.array(struct.unpack_from("<3f", b, 0x128), float)
    c["R_rgb"] = np.array(struct.unpack_from("<9f", b, 0x134), float).reshape(3, 3)
    c["T_rgb"] = np.array(struct.unpack_from("<3f", b, 0x158), float)
    return c


class Rectificador:
    def __init__(self, c=None):
        c = c or leer_calibracion()
        self.c = c
        R1, R2, P1, P2, Q, _, _ = cv2.stereoRectify(c["K1"], c["D1"], c["K2"], c["D2"], TAM,
                                                    c["R"], c["T"], alpha=0)
        self.R1, self.P1, self.P2, self.Q = R1, P1, P2, Q
        self.f = P1[0, 0]
        self.base = -P2[0, 3] / P2[0, 0]  # mm
        self.mapa_l = cv2.initUndistortRectifyMap(c["K1"], c["D1"], R1, P1, TAM, cv2.CV_32FC1)
        self.mapa_r = cv2.initUndistortRectifyMap(c["K2"], c["D2"], R2, P2, TAM, cv2.CV_32FC1)

    def rectificar(self, izq, der):
        return (cv2.remap(izq, *self.mapa_l, cv2.INTER_LINEAR),
                cv2.remap(der, *self.mapa_r, cv2.INTER_LINEAR))


class Separador:
    """Reparte el video alterno en izquierda/derecha por parecido con el último
    cuadro de cada vista (las dos vistas difieren mucho; la misma, poco)."""

    def __init__(self, rect):
        self.rect, self.ultimo, self.izq_es = rect, {}, None

    @staticmethod
    def _huella(c):
        return cv2.GaussianBlur(cv2.resize(c, (160, 120), interpolation=cv2.INTER_AREA), (5, 5), 0).astype(np.float32)

    def _decidir_lados(self):
        """¿Cuál de las dos vistas es la izquierda? La que da disparidad positiva al rectificar."""
        a, b = self.ultimo["a"][1], self.ultimo["b"][1]
        ra, rb = self.rect.rectificar(a, b)
        (dx, _), _ = cv2.phaseCorrelate(np.float32(rb), np.float32(ra))
        self.izq_es = "a" if dx > 0 else "b"

    def agregar(self, c):
        """Devuelve (izquierda, derecha) cuando el cuadro completa un par nuevo, si no None."""
        h = self._huella(c)
        if len(self.ultimo) < 2:
            if not self.ultimo or np.abs(self.ultimo["a"][0] - h).mean() < 1.0:
                self.ultimo["a"] = (h, c)
                return None
            self.ultimo["b"] = (h, c)
        else:
            lado = min(self.ultimo, key=lambda k: np.abs(self.ultimo[k][0] - h).mean())
            self.ultimo[lado] = (h, c)
        if self.izq_es is None:
            self._decidir_lados()
        der_es = "b" if self.izq_es == "a" else "a"
        return self.ultimo[self.izq_es][1], self.ultimo[der_es][1]
