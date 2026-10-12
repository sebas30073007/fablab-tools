"""Servidor local de las herramientas del Fab Lab.

    pythonw servir.py        (o python servir.py para ver errores)

Sirve la carpeta web/ en http://localhost:8767 y abre Chrome. Web Serial y los
módulos de three.js necesitan http://localhost (con file:// no funcionan).
En producción la misma carpeta web/ se publica tal cual en GitHub Pages (https).
Si el servidor ya está corriendo, solo abre el navegador.
"""
import functools
import http.server
import os
import socket
import sys
import webbrowser

PUERTO = 8767
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
RUTA = next((a for a in sys.argv[1:] if not a.startswith("--")), "")
URL = f"http://localhost:{PUERTO}/{RUTA}"
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]


class Manejador(http.server.SimpleHTTPRequestHandler):
    # Windows puede tener .js registrado como text/plain y los módulos no cargan.
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript",
                      ".glb": "model/gltf-binary", ".css": "text/css", ".svg": "image/svg+xml",
                      ".gbr": "text/plain", ".drl": "text/plain", ".gbrjob": "application/json",
                      ".nc": "text/plain", ".map": "text/plain"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def abrir():
    for exe in CHROME:
        if os.path.exists(exe):
            webbrowser.register("chromium", None, webbrowser.BackgroundBrowser(exe))
            webbrowser.get("chromium").open(URL)
            return
    webbrowser.open(URL)


def ocupado():
    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", PUERTO)) == 0


if __name__ == "__main__":
    if ocupado():
        abrir()
    else:
        servidor = http.server.ThreadingHTTPServer(
            ("127.0.0.1", PUERTO), functools.partial(Manejador, directory=RAIZ))
        if "--sin-navegador" not in sys.argv:
            abrir()
        servidor.serve_forever()
