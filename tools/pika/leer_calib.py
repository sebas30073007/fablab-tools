"""Descarga del Pika los bloques que Creality lee al conectar (¿calibración?).

Dos familias de lectura «abrir / leer por trozos / cerrar»:
  0x1d id -> tamaño;  0x1e id, desplazamiento, largo -> datos (sel 3);  0x1f id
  0x11 id -> tamaño;  0x12 id, desplazamiento, largo -> datos (sel 3);  0x13 id
Guarda cada bloque en calib/<id>.bin y muestra encabezado de respuesta y floats.
"""
import os, struct, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from pika_laser import Pika, XU, buscar_camara, encontrar_nodo

SALIDA = os.path.join(AQUI, "calib")
TROZO = 0x300


def gm(op, *u32):
    datos = b"".join(struct.pack("<I", x) for x in u32)
    return (struct.pack("<HHHH", 0x4D47, len(datos) // 2, op, 0) + datos).hex()


def leer_bloque(pika, ident, abrir, leer, cerrar, mostrar):
    ok, estado, r = pika.orden(gm(abrir, ident))
    if not ok or estado:
        print(f"{ident}: abrir -> estado {estado} {r[:16].hex()}")
        return None
    # 0x1d responde estado, bandera u16, tamaño u32; 0x11 responde estado, tamaño u32
    palabras = struct.unpack_from("<H", r, 2)[0]
    tam = struct.unpack_from("<I", r, 12 if palabras >= 4 else 10)[0]
    datos = b""
    while len(datos) < tam:
        n = min(TROZO, tam - len(datos))
        ok, estado, r = pika.orden(gm(leer, ident, len(datos), n), 3)
        if mostrar and not datos:
            print(f"  respuesta cruda: {r[:24].hex()} ... ({len(r)} B)")
        datos += r[10:10 + n]
    pika.orden(gm(cerrar, ident))
    return datos


def main():
    _, filtro = buscar_camara()
    xu = XU(filtro)
    pika = Pika(xu)
    encontrar_nodo(xu, pika)
    os.makedirs(SALIDA, exist_ok=True)
    bloques = [(i, 0x1D, 0x1E, 0x1F) for i in (4027, 4026, 4024, 4034, 4035)] + [(4036, 0x11, 0x12, 0x13)]
    for ident, a, l, c in bloques:
        datos = leer_bloque(pika, ident, a, l, c, mostrar=ident in (4027, 4036))
        if datos is None:
            continue
        open(os.path.join(SALIDA, f"{ident}.bin"), "wb").write(datos)
        floats = struct.unpack_from(f"<{min(len(datos) // 4, 24)}f", datos)
        print(f"{ident}: {len(datos)} B  {datos[:32].hex()}")
        print("   floats:", " ".join(f"{x:.4g}" for x in floats))


if __name__ == "__main__":
    main()
