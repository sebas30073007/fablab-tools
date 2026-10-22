"""Saca de control.tsv las órdenes GM de Creality Scan, cada una con el selector
por el que leyó la respuesta, y las guarda en secuencia.json por fases."""
import json, sys

FASES = {  # segundos relativos de la captura
    "antes_video": (311.40, 311.640),
    "con_video": (311.646, 316.47),
    "parar": (358.70, 359.40),
}
ordenes, pendiente, ultima = [], None, None
for linea in open(sys.argv[1], encoding="utf-8-sig"):
    c = (linea.rstrip("\n").split("\t") + [""] * 10)[:10]
    _, t, _, etapa, bm, breq, wval, widx, datos, resp = c
    if not t:
        continue
    t = float(t)
    if etapa == "0":
        pendiente = (bm, breq, wval, widx)
        if bm == "0x21" and widx == "1024" and datos.startswith("474d"):
            ultima = {"t": t, "orden": datos, "sel": None, "resp": None}
            ordenes.append(ultima)
    elif pendiente and pendiente[:2] == ("0xa1", "129") and pendiente[3] == "1024":
        if ultima and ultima["sel"] is None:
            ultima["sel"] = int(pendiente[2], 16) >> 8
            ultima["resp"] = resp[:64] or None
        pendiente = None

salida = {}
for fase, (a, b) in FASES.items():
    sel = [o for o in ordenes if a <= o["t"] <= b]
    salida[fase] = [{"orden": o["orden"][:128], "sel": o["sel"] or 2, "resp": o["resp"]} for o in sel]
    print(fase, len(sel), "órdenes")
json.dump(salida, open(sys.argv[2], "w"), indent=1)
