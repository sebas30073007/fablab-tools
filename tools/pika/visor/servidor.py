"""Visor local del Creality Pika: http://127.0.0.1:8805

Un hilo es dueño de la cámara y de la Extension Unit (COM no se comparte entre
hilos); las peticiones HTTP le pasan trabajos por una cola. Sirve el video gris
y el RGB como MJPEG y una API para leer y escribir las propiedades permitidas.
"""
import json, os, queue, subprocess, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

AQUI = os.path.dirname(os.path.abspath(__file__))
PIKA = os.path.dirname(AQUI)
WEB = os.path.join(os.path.dirname(os.path.dirname(PIKA)), "web")
sys.path.insert(0, PIKA)
import cv2
import numpy as np
from estereo import Rectificador, Separador
from lineas3d import Abanico, dibujar, guardar_ply, profundidad_planos
from recortar import Banco, Camara

PUERTO = 8805
# propiedad -> nombre en la API
PROPS = {3: "lineas", 158: "relleno", 161: "brillo", 2026: "exposicion", 2027: "ganancia"}
FOTOS = os.path.join(PIKA, "fotos")


class Estereo:
    """Separa el video gris en izquierda/derecha y calcula la profundidad con los
    planos láser en un hilo aparte (no toca la COM)."""

    def __init__(self):
        self.rect = Rectificador()
        self.abanico = Abanico() if os.path.exists(os.path.join(PIKA, "planos", "planos.json")) else None
        self.candado = threading.Lock()
        self.activo = False
        self.izq = self.par = None
        self.xyz, self.jpeg = np.zeros((0, 3)), None
        self.reiniciar()
        threading.Thread(target=self._calcular, daemon=True).start()

    def reiniciar(self):
        """Tras cambiar luz o líneas cambia el aspecto de las vistas: se vuelven a separar."""
        with self.candado:
            self.sep, self.confirmado, self.par = Separador(self.rect), False, None

    def al_cuadro(self, c):
        with self.candado:
            par = self.sep.agregar(c)
            if par:
                self.par, self.izq = par, par[0]

    def _profundidad(self, izq, der):
        ri, rd = self.rect.rectificar(izq, der)
        xyz, pts, _ = profundidad_planos(ri, rd, self.rect, self.abanico)
        return ri, xyz, pts

    def _calcular(self):
        anterior = None
        while True:
            par = self.par
            if not (self.activo and self.abanico and lineas["prendidas"]) or par is None or par is anterior:
                time.sleep(0.05)
                continue
            anterior = par
            ri, xyz, pts = self._profundidad(*par)
            if not self.confirmado:
                # ¿qué vista es la izquierda? la que da más puntos con los planos
                _, xyz2, pts2 = self._profundidad(par[1], par[0])
                if len(pts2) > 1.5 * max(len(pts), 20):
                    with self.candado:
                        self.sep.izq_es = "b" if self.sep.izq_es == "a" else "a"
                    continue
                self.confirmado = len(pts) > 50
            self.xyz = xyz
            self.jpeg = cv2.imencode(".jpg", dibujar(ri, pts, [], xyz), [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()


class Control(threading.Thread):
    """Dueño único de la cámara gris y de la XU."""

    def __init__(self):
        super().__init__(daemon=True)
        self.trabajos, self.listo = queue.Queue(), threading.Event()
        self.cam, self.error = None, None

    def run(self):
        try:
            self.banco = Banco()
            self.banco.parar()
            self.cam = Camara(al_cuadro=estereo.al_cuadro)
        except BaseException as e:  # SystemExit incluido: lo reporta la página
            self.error = str(e)
        self.listo.set()
        while True:
            fn, resp = self.trabajos.get()
            try:
                resp.put((True, fn(self.banco.pika)))
            except Exception as e:
                resp.put((False, str(e)))

    def hacer(self, fn):
        if self.error:
            raise RuntimeError(self.error)
        resp = queue.Queue()
        self.trabajos.put((fn, resp))
        ok, valor = resp.get(timeout=10)
        if not ok:
            raise RuntimeError(valor)
        return valor

    def apagar(self):
        if self.error:
            return
        self.hacer(lambda p: (p.escribir(3, 0), p.escribir(158, 0)))
        self.cam.cerrar()


class RGB:
    """Cámara RGB por ffmpeg; reenvía sus JPEG tal cual. Arranca al primer cliente."""

    def __init__(self):
        self.jpeg, self.proc, self.candado = None, None, threading.Lock()

    def arrancar(self):
        with self.candado:
            if self.proc and self.proc.poll() is None:
                return
            self.proc = subprocess.Popen(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "dshow", "-vcodec", "mjpeg",
                 "-video_size", "1280x960", "-rtbufsize", "64M", "-i", "video=Creality Pika RGB Camera",
                 "-c:v", "copy", "-f", "mjpeg", "-"], stdout=subprocess.PIPE)
            threading.Thread(target=self._leer, daemon=True).start()

    def _leer(self):
        buf = b""
        while True:
            trozo = self.proc.stdout.read(65536)
            if not trozo:
                break
            buf += trozo
            while True:
                a = buf.find(b"\xff\xd8")
                b = buf.find(b"\xff\xd9", a + 2)
                if a < 0 or b < 0:
                    break
                self.jpeg, buf = buf[a:b + 2], buf[b + 2:]

    def cerrar(self):
        with self.candado:
            if self.proc:
                self.proc.kill()
                self.proc = None


realce = {"activo": True}
# El Pika apaga las líneas mientras la cámara RGB transmite: con líneas, la RGB se pausa.
lineas = {"prendidas": False}
estereo = Estereo()
control, rgb = Control(), RGB()


def jpeg_gris():
    # solo la cámara izquierda (el video crudo alterna las dos)
    c = estereo.izq if estereo.izq is not None else control.cam.cuadro
    if realce["activo"]:
        # estira el rango para que se vean las líneas aunque la imagen sea oscura
        bajo, alto = np.percentile(c, (1, 99.95))
        c = cv2.convertScaleAbs(c, alpha=255.0 / max(alto - bajo, 8), beta=-bajo * 255.0 / max(alto - bajo, 8))
    return cv2.imencode(".jpg", c, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()


def estado():
    def leer(p):
        props = {}
        for prop, nombre in PROPS.items():
            _, v = p.leer(prop)
            props[nombre] = {"valor": v[0], "max": v[1], "min": v[2]} if v else None
        return props
    props = control.hacer(leer)
    lineas["prendidas"] = bool(props["lineas"] and props["lineas"]["valor"])
    return {"props": props, "realce": realce["activo"]}


class Manejador(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def responder(self, codigo, cuerpo, tipo="application/json"):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def mjpeg(self, siguiente):
        self.send_response(200)
        self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=cuadro")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        anterior = None
        try:
            while True:
                datos = siguiente(anterior)
                if datos is None:
                    time.sleep(0.02)
                    continue
                anterior = datos[0]
                self.wfile.write(b"--cuadro\r\nContent-Type: image/jpeg\r\nContent-Length: "
                                 + str(len(datos[1])).encode() + b"\r\n\r\n" + datos[1] + b"\r\n")
                time.sleep(1 / 30)
        except (ConnectionError, OSError):
            pass

    def do_GET(self):
        ruta = self.path.split("?")[0]
        if ruta == "/":
            with open(os.path.join(AQUI, "index.html"), "rb") as f:
                return self.responder(200, f.read(), "text/html; charset=utf-8")
        if ruta.startswith("/css/"):
            archivo = os.path.join(WEB, "css", os.path.basename(ruta))
            if os.path.isfile(archivo):
                with open(archivo, "rb") as f:
                    return self.responder(200, f.read(), "text/css; charset=utf-8")
        if ruta == "/api/estado":
            try:
                return self.responder(200, estado())
            except Exception as e:
                return self.responder(503, {"error": str(e)})
        if ruta == "/gris.mjpg" and control.cam:
            fuente = lambda: estereo.izq if estereo.izq is not None else control.cam.cuadro
            return self.mjpeg(lambda ant: None if fuente() is ant else (fuente(), jpeg_gris()))
        if ruta == "/prof.mjpg":
            return self.mjpeg(lambda ant: None if estereo.jpeg is None or estereo.jpeg is ant
                              else (estereo.jpeg, estereo.jpeg))
        if ruta == "/api/nube":
            xyz = estereo.xyz
            if len(xyz) > 6000:
                xyz = xyz[np.random.default_rng(0).choice(len(xyz), 6000, replace=False)]
            return self.responder(200, {"puntos": np.round(xyz, 1).ravel().tolist(),
                                        "planos": estereo.abanico is not None})
        if ruta.startswith("/vendor/"):
            archivo = os.path.normpath(os.path.join(WEB, "shared", ruta.lstrip("/")))
            if archivo.startswith(os.path.join(WEB, "shared")) and os.path.isfile(archivo):
                with open(archivo, "rb") as f:
                    return self.responder(200, f.read(), "text/javascript; charset=utf-8")
        if ruta == "/rgb.mjpg":
            if not lineas["prendidas"]:
                rgb.arrancar()
            return self.mjpeg(lambda ant: None if rgb.jpeg is None or rgb.jpeg is ant
                              else (rgb.jpeg, rgb.jpeg))
        self.responder(404, {"error": "no existe"})

    def do_POST(self):
        largo = int(self.headers.get("Content-Length") or 0)
        datos = json.loads(self.rfile.read(largo) or b"{}")
        try:
            if self.path == "/api/prop":
                prop = {v: k for k, v in PROPS.items()}[datos["nombre"]]
                valor = int(datos["valor"])
                if prop == 3 and valor:
                    rgb.cerrar()  # si la RGB transmite, las líneas no salen
                e = control.hacer(lambda p: p.escribir(prop, valor))
                if prop == 3 and e == 0:
                    lineas["prendidas"] = bool(valor)
                estereo.reiniciar()  # cambió la luz: separar las vistas de nuevo
                return self.responder(200 if e == 0 else 409, {"estado": e})
            if self.path == "/api/profundidad":
                estereo.activo = bool(datos.get("activo"))
                return self.responder(200, {"activo": estereo.activo, "planos": estereo.abanico is not None})
            if self.path == "/api/guardar_nube":
                os.makedirs(FOTOS, exist_ok=True)
                nombre = time.strftime("%Y%m%d-%H%M%S") + "_nube.ply"
                guardar_ply(os.path.join(FOTOS, nombre), estereo.xyz)
                return self.responder(200, {"nube": nombre, "puntos": len(estereo.xyz)})
            if self.path == "/api/realce":
                realce["activo"] = bool(datos.get("activo"))
                return self.responder(200, {"realce": realce["activo"]})
            if self.path == "/api/foto":
                os.makedirs(FOTOS, exist_ok=True)
                sello = time.strftime("%Y%m%d-%H%M%S")
                nombres = [f"{sello}_gris.png"]
                cv2.imwrite(os.path.join(FOTOS, nombres[0]), control.cam.cuadro)
                if rgb.jpeg:
                    nombres.append(f"{sello}_rgb.jpg")
                    with open(os.path.join(FOTOS, nombres[1]), "wb") as f:
                        f.write(rgb.jpeg)
                return self.responder(200, {"fotos": nombres})
        except (KeyError, ValueError) as e:
            return self.responder(400, {"error": f"petición inválida: {e}"})
        except Exception as e:
            return self.responder(503, {"error": str(e)})
        self.responder(404, {"error": "no existe"})


def main():
    control.start()
    control.listo.wait()
    if control.error:
        print("Pika:", control.error)
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    servidor.daemon_threads = True  # los MJPEG abiertos no bloquean el cierre
    print(f"Visor del Pika en http://127.0.0.1:{PUERTO}  (Ctrl+C para cerrar)")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        control.apagar()
        rgb.cerrar()


if __name__ == "__main__":
    main()
