"""Decodifica los comandos GM (protocolo de vendedor Orbbec) de xu_set.tsv."""
import collections, struct, sys

ruta = sys.argv[1]
filas = []
for linea in open(ruta, encoding="utf-8-sig"):
    c = linea.rstrip("\n").split("\t")
    if len(c) < 4 or not c[3]:
        continue
    b = bytes.fromhex(c[3].replace(":", ""))
    magia, palabras, op, seq = struct.unpack_from("<HHHH", b)
    if magia != 0x4D47:
        continue
    datos = b[8:8 + palabras * 2]
    filas.append((float(c[1]), op, seq, datos))

print("opcodes:", collections.Counter(f[1] for f in filas))
print("\nopcode 1/2 por propiedad (lecturas / escrituras):")
cuenta = collections.Counter((f[1], struct.unpack_from("<I", f[3])[0]) for f in filas if f[1] in (1, 2) and len(f[3]) >= 4)
for (op, prop), n in sorted(cuenta.items(), key=lambda x: (x[0][1], x[0][0])):
    print(f"  op{op} prop {prop:#06x} ({prop:3d}) x{n}")

print("\nescrituras (op 2) en orden:")
for t, op, seq, d in filas:
    if op == 2:
        prop, val = struct.unpack_from("<Ii", d.ljust(8, b"\0"))
        print(f"  {t:8.2f}s seq {seq:5d}  prop {prop:#06x} ({prop:3d}) = {val}")

print("\notros opcodes distintos de 1/2 (primeros de cada tipo):")
vistos = collections.Counter()
for t, op, seq, d in filas:
    if op in (1, 2):
        continue
    clave = (op, d[:4])
    vistos[clave] += 1
    if vistos[clave] == 1:
        print(f"  {t:8.2f}s op {op:#06x} datos {d.hex()}")
for (op, k), n in sorted(vistos.items()):
    print(f"  op {op:#06x} {k.hex()} x{n}")
