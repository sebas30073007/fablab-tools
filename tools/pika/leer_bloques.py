"""Descarga las zonas de memoria que Creality lee con el opcode 0x19.

Orden 0x19: dirección u32 (bytes) + largo u16 (en palabras de 16 bits); la
respuesta llega por el selector 3. Guarda calib/zona_<inicio>.bin.
"""
import os, struct, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from pika_laser import Pika, XU, buscar_camara, encontrar_nodo

ZONAS = [(0x00400, 0x0C400), (0x14000, 0x18000), (0x1E000, 0x2A000)]
PASO = 0x300  # bytes por lectura (0x180 palabras), como Creality


def main():
    _, filtro = buscar_camara()
    xu = XU(filtro)
    pika = Pika(xu)
    encontrar_nodo(xu, pika)
    salida = os.path.join(AQUI, "calib")
    os.makedirs(salida, exist_ok=True)
    for inicio, fin in ZONAS:
        datos = b""
        for dir_ in range(inicio, fin, PASO):
            n = min(PASO, fin - dir_)
            orden = struct.pack("<HHHHIH", 0x4D47, 3, 0x19, 0, dir_, n // 2).hex()
            ok, estado, r = pika.orden(orden, 3)
            if dir_ == inicio:
                print(f"zona {inicio:#07x}: primera respuesta {r[:20].hex()} ({len(r)} B, estado {estado})")
            if not ok or estado:
                print(f"  {dir_:#07x}: estado {estado}; corto aquí")
                break
            datos += r[10:10 + n]
        ruta = os.path.join(salida, f"zona_{inicio:05x}.bin")
        open(ruta, "wb").write(datos)
        print(f"  {len(datos)} B -> {ruta}")


if __name__ == "__main__":
    main()
