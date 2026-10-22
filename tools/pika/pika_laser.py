"""Prende el láser del Creality Pika sin Creality Scan.

Repite la secuencia que mandó Creality Scan (secuencia.json) por la Extension
Unit de UVC (GUID a55751a1-..., unidad 4, interfaz 0) con el protocolo GM de
Orbbec, abre la cámara gris con OpenCV y la muestra en vivo.

Teclas en la ventana: q = parar y salir, s = guardar foto.
Uso: python pika_laser.py            (todo)
     python pika_laser.py --probar   (solo comprueba que la XU contesta)
"""
import ctypes, json, os, struct, sys, time
from ctypes import POINTER, byref, c_ulong, c_void_p, wintypes

import comtypes
from comtypes import COMMETHOD, GUID, HRESULT, IUnknown
from comtypes.persist import IPropertyBag

AQUI = os.path.dirname(os.path.abspath(__file__))
NOMBRE = "Creality Pika Depth Camera"
XU_GUID = GUID("{A55751A1-F3C5-4A5E-8D5A-6854B8FA2716}")
LARGO_SEL = {1: 512, 2: 64, 3: 1024}
KSPROPERTY_TYPE_GET, KSPROPERTY_TYPE_SET, KSPROPERTY_TYPE_TOPOLOGY = 1, 2, 0x10000000
KSNODETYPE_DEV_SPECIFIC = GUID("{941C7AC0-C559-11D0-8A2B-00A0C9255AC1}")


# --- interfaces COM mínimas de DirectShow y KS -------------------------------
class IMoniker(IUnknown):
    _iid_ = GUID("{0000000F-0000-0000-C000-000000000046}")
    _methods_ = [
        COMMETHOD([], HRESULT, "GetClassID", (["out"], POINTER(GUID))),
        COMMETHOD([], HRESULT, "IsDirty"),
        COMMETHOD([], HRESULT, "Load", (["in"], c_void_p)),
        COMMETHOD([], HRESULT, "Save", (["in"], c_void_p), (["in"], wintypes.BOOL)),
        COMMETHOD([], HRESULT, "GetSizeMax", (["in"], c_void_p)),
        COMMETHOD([], HRESULT, "BindToObject", (["in"], c_void_p), (["in"], c_void_p),
                  (["in"], POINTER(GUID)), (["out"], POINTER(POINTER(IUnknown)))),
        COMMETHOD([], HRESULT, "BindToStorage", (["in"], c_void_p), (["in"], c_void_p),
                  (["in"], POINTER(GUID)), (["out"], POINTER(POINTER(IUnknown)))),
    ]


class IEnumMoniker(IUnknown):
    _iid_ = GUID("{00000102-0000-0000-C000-000000000046}")
    _methods_ = [
        COMMETHOD([], HRESULT, "Next", (["in"], c_ulong), (["out"], POINTER(POINTER(IMoniker))),
                  (["out"], POINTER(c_ulong))),
    ]


class ICreateDevEnum(IUnknown):
    _iid_ = GUID("{29840822-5B84-11D0-BD3B-00A0C911CE86}")
    _methods_ = [
        COMMETHOD([], HRESULT, "CreateClassEnumerator", (["in"], POINTER(GUID)),
                  (["out"], POINTER(POINTER(IEnumMoniker))), (["in"], wintypes.DWORD)),
    ]


class IKsControl(IUnknown):
    _iid_ = GUID("{28F54685-06FD-11D2-B27A-00A0C9223196}")
    _methods_ = [
        COMMETHOD([], HRESULT, "KsProperty", (["in"], c_void_p), (["in"], c_ulong),
                  (["in"], c_void_p), (["in"], c_ulong), (["out"], POINTER(c_ulong))),
    ]


class IKsTopologyInfo(IUnknown):
    _iid_ = GUID("{720D4AC0-7533-11D0-A5D6-28DB04C10000}")
    _methods_ = [
        COMMETHOD([], HRESULT, "get_NumCategories", (["out"], POINTER(wintypes.DWORD))),
        COMMETHOD([], HRESULT, "get_Category", (["in"], wintypes.DWORD), (["out"], POINTER(GUID))),
        COMMETHOD([], HRESULT, "get_NumConnections", (["out"], POINTER(wintypes.DWORD))),
        COMMETHOD([], HRESULT, "get_ConnectionInfo", (["in"], wintypes.DWORD), (["in"], c_void_p)),
        COMMETHOD([], HRESULT, "get_NodeName", (["in"], wintypes.DWORD), (["in"], c_void_p),
                  (["in"], wintypes.DWORD), (["out"], POINTER(wintypes.DWORD))),
        COMMETHOD([], HRESULT, "get_NumNodes", (["out"], POINTER(wintypes.DWORD))),
        COMMETHOD([], HRESULT, "get_NodeType", (["in"], wintypes.DWORD), (["out"], POINTER(GUID))),
    ]


class KSP_NODE(ctypes.Structure):
    _fields_ = [("Set", GUID), ("Id", c_ulong), ("Flags", c_ulong),
                ("NodeId", c_ulong), ("Reserved", c_ulong)]


def buscar_camara():
    """Devuelve (índice DirectShow, filtro) de la cámara gris del Pika."""
    comtypes.CoInitialize()
    enum_dev = comtypes.CoCreateInstance(GUID("{62BE5D10-60EB-11D0-BD3B-00A0C911CE86}"),
                                         interface=ICreateDevEnum)
    monikers = enum_dev.CreateClassEnumerator(GUID("{860BB310-5D01-11D0-BD3B-00A0C911CE86}"), 0)
    indice = 0
    while True:
        try:
            mon, n = monikers.Next(1)
        except comtypes.COMError:
            break
        if not n:
            break
        bolsa = mon.BindToStorage(None, None, byref(IPropertyBag._iid_)).QueryInterface(IPropertyBag)
        nombre = bolsa.Read("FriendlyName", pErrorLog=None)
        if nombre == NOMBRE:
            return indice, mon.BindToObject(None, None, byref(IUnknown._iid_))
        indice += 1
    raise SystemExit(f"No encuentro «{NOMBRE}». ¿Está conectado el Pika?")


class XU:
    def __init__(self, filtro):
        self.ks = filtro.QueryInterface(IKsControl)
        topo = filtro.QueryInterface(IKsTopologyInfo)
        self.nodos = [i for i in range(topo.get_NumNodes())
                      if topo.get_NodeType(i) == KSNODETYPE_DEV_SPECIFIC]
        self.nodo = None

    def _prop(self, sel, flags, buf):
        p = KSP_NODE(XU_GUID, sel, flags | KSPROPERTY_TYPE_TOPOLOGY, self.nodo, 0)
        return self.ks.KsProperty(ctypes.addressof(p), ctypes.sizeof(p),
                                  ctypes.addressof(buf), len(buf))

    def set(self, sel, datos):
        buf = ctypes.create_string_buffer(bytes(datos), LARGO_SEL[sel])
        self._prop(sel, KSPROPERTY_TYPE_SET, buf)

    def get(self, sel):
        buf = ctypes.create_string_buffer(LARGO_SEL[sel])
        n = self._prop(sel, KSPROPERTY_TYPE_GET, buf)
        return buf.raw[:n]


class Pika:
    def __init__(self, xu):
        self.xu, self.seq = xu, 0x1000

    def orden(self, orden_hex, sel_resp=2):
        b = bytearray.fromhex(orden_hex)
        b[6:8] = struct.pack("<H", self.seq & 0xFFFF)
        self.xu.set(2, b)
        r = self.xu.get(sel_resp)
        ok_seq = r[:2] == b"RB" and r[6:8] == b[6:8]
        estado = struct.unpack_from("<H", r, 8)[0] if len(r) >= 10 else None
        self.seq += 1
        return ok_seq, estado, r

    def leer(self, prop):
        """Devuelve (estado, (actual, máx, mín, paso, defecto)) de una propiedad."""
        ok, estado, r = self.orden("474d020001000000" + struct.pack("<I", prop).hex())
        if not ok or estado or len(r) < 30:
            return estado, None
        return estado, struct.unpack_from("<5i", r, 10)

    def escribir(self, prop, valor):
        """Escribe una propiedad entera; devuelve el estado (0 = aceptada)."""
        return self.orden("474d040002000000" + struct.pack("<Ii", prop, valor).hex())[1]

    def laser(self, prendido):
        """Prende o apaga el láser (prop 158). Solo prende con el video corriendo."""
        return self.escribir(158, 1 if prendido else 0)

    def fase(self, ordenes, nombre):
        fallas = 0
        for o in ordenes:
            ok, estado, _ = self.orden(o["orden"], o["sel"])
            op, prop = struct.unpack_from("<H", bytes.fromhex(o["orden"]), 4)[0], o["orden"][16:24]
            if not ok or estado not in (0, None) and op in (1, 2):
                fallas += 1
                if op == 2:
                    print(f"   op {op} prop {int.from_bytes(bytes.fromhex(prop), 'little')} -> estado {estado}")
            time.sleep(0.002)
        print(f"{nombre}: {len(ordenes)} órdenes, {fallas} con estado distinto de 0")


class Video:
    """Cámara gris por ffmpeg/DirectShow (OpenCV no la abre por índice)."""
    ANCHO, ALTO = 1280, 960

    def __init__(self):
        import subprocess
        import numpy as np
        self.np = np
        self.proc = subprocess.Popen(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "dshow",
             "-pixel_format", "gray", "-video_size", f"{self.ANCHO}x{self.ALTO}",
             "-framerate", "30", "-rtbufsize", "64M", "-i", f"video={NOMBRE}",
             "-f", "rawvideo", "-pix_fmt", "gray", "-"],
            stdout=subprocess.PIPE, bufsize=self.ANCHO * self.ALTO * 2)

    def read(self):
        n = self.ANCHO * self.ALTO
        datos = self.proc.stdout.read(n)
        if len(datos) < n:
            return False, None
        return True, self.np.frombuffer(datos, self.np.uint8).reshape(self.ALTO, self.ANCHO)

    def release(self):
        self.proc.kill()


def encontrar_nodo(xu, pika):
    """Prueba cada nodo DEV_SPECIFIC con una lectura inofensiva (op 1, prop 0x59)."""
    for n in xu.nodos:
        xu.nodo = n
        try:
            ok, estado, r = pika.orden("474d0200010000005900000000000000")
        except comtypes.COMError:
            continue
        if ok:
            print(f"XU en el nodo {n}: respuesta {r[:16].hex()}")
            return
    raise SystemExit(f"Ningún nodo contestó (nodos DEV_SPECIFIC: {xu.nodos}). ¿Creality Scan sigue abierto?")


def main():
    secuencia = json.load(open(os.path.join(AQUI, "secuencia.json")))
    indice, filtro = buscar_camara()
    xu = XU(filtro)
    pika = Pika(xu)
    encontrar_nodo(xu, pika)
    if "--probar" in sys.argv:
        return

    import cv2
    pika.fase(secuencia["antes_video"], "antes del video")
    cam = Video()
    ok, foto = cam.read()
    if not ok:
        cam.release()
        raise SystemExit("No abre el video de la cámara gris.")
    print("video:", foto.shape)
    try:
        pika.fase(secuencia["con_video"], "arranque del escaneo")
        print("Listo: ¿se ve el láser? q = parar, s = guardar foto")
        while True:
            ok, foto = cam.read()
            if ok:
                cv2.imshow("Pika (q = parar)", cv2.resize(foto, (960, 720)))
            tecla = cv2.waitKey(1) & 0xFF
            if tecla == ord("q"):
                break
            if tecla == ord("s") and ok:
                ruta = os.path.join(AQUI, f"foto_{int(time.time())}.png")
                cv2.imwrite(ruta, foto)
                print("guardada", ruta)
    finally:
        pika.fase(secuencia["parar"], "parada")
        cam.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
