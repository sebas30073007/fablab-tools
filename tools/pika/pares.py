"""Empareja cada orden GM con su respuesta RB a partir de control.tsv (tshark)."""
import sys

t0, t1 = float(sys.argv[2]), float(sys.argv[3])
pendiente = None
for linea in open(sys.argv[1], encoding="utf-8-sig"):
    c = (linea.rstrip("\n").split("\t") + [""] * 10)[:10]
    num, t, dirn, etapa, bm, breq, wval, widx, datos, resp = c
    if not t:
        continue
    t = float(t)
    if etapa == "0":
        pendiente = (t, bm, breq, wval, widx)
        if bm == "0x21" and widx == "1024" and datos.startswith("474d") and t0 <= t <= t1:
            print(f"{t:8.3f} >> {datos[:48]}")
        elif bm == "0x21" and t0 <= t <= t1:
            print(f"{t:8.3f} >> UVC SET req{breq} sel{wval} idx{widx} {datos[:60]}")
    elif pendiente and pendiente[1] == "0xa1" and pendiente[2] == "129" and t0 <= t <= t1:
        if pendiente[4] == "1024" and resp:
            print(f"{t:8.3f} << sel{pendiente[3]} {resp[:48]}")
        else:
            print(f"{t:8.3f} << UVC GET sel{pendiente[3]} idx{pendiente[4]} {resp[:60]}")
        pendiente = None
