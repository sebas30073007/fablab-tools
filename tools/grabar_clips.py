"""Graba los clips de las manos (web/demo/manos) como videos MP4 para el tutorial.

    python tools/grabar_clips.py              (todos)
    python tools/grabar_clips.py usb,sonda    (solo esos)

Abre la página en Edge sin ventana con ?grabar: la página dibuja cada clip cuadro por cuadro (30 por segundo, en
tiempo exacto) y manda cada cuadro aquí por POST. Con ffmpeg se arma un MP4 (H.264, 1080 × 1080) y un póster JPEG por
clip en web/videos/manos/, y la lista en web/videos/manos/clips.json (la usa el tutorial).
"""
import functools
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse

RAIZ = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
SALIDA = os.path.join(RAIZ, "videos", "manos")
PUERTO = 8768
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"

tmp = tempfile.mkdtemp(prefix="clips-")
fin = threading.Event()
estado = {"error": None, "clips": [], "cuadros": 0}


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".glb": "model/gltf-binary", ".css": "text/css", ".json": "application/json"}

    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        cuerpo = self.rfile.read(int(self.headers.get("Content-Length", 0) or 0))
        if u.path == "/cuadro":
            d = os.path.join(tmp, q["clip"])
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, f"{int(q['n']):05d}.jpg"), "wb") as f:
                f.write(cuerpo)
            estado["cuadros"] += 1
            if estado["cuadros"] % 60 == 0:
                print(f"  {q['clip']}: cuadro {q['n']}", flush=True)
        elif u.path == "/clip":
            estado["clips"].append(q)
            threading.Thread(target=armar, args=(q,), daemon=False).start()
        elif u.path == "/fin":
            estado["error"] = q.get("error")
            fin.set()
        self.send_response(204)
        self.end_headers()


hilos = []


def armar(q):
    """Une los cuadros de un clip en MP4 + póster."""
    clip, fps = q["clip"], q["fps"]
    d = os.path.join(tmp, clip)
    os.makedirs(SALIDA, exist_ok=True)
    mp4 = os.path.join(SALIDA, f"{clip}.mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-framerate", fps, "-i", os.path.join(d, "%05d.jpg"),
                    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    mp4], check=True)
    cuadros = sorted(os.listdir(d))
    shutil.copy(os.path.join(d, cuadros[int(len(cuadros) * 0.55)]), os.path.join(SALIDA, f"{clip}.jpg"))
    print(f"listo {clip}: {os.path.getsize(mp4) // 1024} KB", flush=True)


def main():
    ids = sys.argv[1] if len(sys.argv) > 1 else "todos"
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", PUERTO), functools.partial(Manejador, directory=RAIZ))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    perfil = os.path.join(tmp, "perfil")
    url = f"http://localhost:{PUERTO}/demo/manos/?grabar={ids}"
    edge = subprocess.Popen([EDGE, "--headless=new", "--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist",
                             "--window-size=1100,1300", f"--user-data-dir={perfil}", "--disable-background-timer-throttling",
                             "--disable-renderer-backgrounding", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    t0 = time.time()
    fin.wait()
    edge.kill()
    # esperar a que ffmpeg termine todos
    for h in threading.enumerate():
        if h is not threading.current_thread() and not h.daemon:
            h.join()
    srv.shutdown()
    if estado["error"]:
        print("error en la página:", estado["error"])
    # lista para el tutorial (se mezcla con la que ya hubiera)
    lista_p = os.path.join(SALIDA, "clips.json")
    lista = {}
    if os.path.exists(lista_p):
        lista = {c["id"]: c for c in json.load(open(lista_p, encoding="utf-8"))}
    for q in estado["clips"]:
        lista[q["clip"]] = {"id": q["clip"], "nombre": q["nombre"], "paso": q["paso"], "duracion": float(q["duracion"])}
    json.dump(list(lista.values()), open(lista_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(estado['clips'])} clips en {time.time() - t0:.0f} s -> {SALIDA}")
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
