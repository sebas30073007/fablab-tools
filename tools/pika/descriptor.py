"""Lee el descriptor de configuración del Pika pidiéndoselo al hub (como USBView)
y muestra las Extension Units de UVC con su GUID."""
import ctypes, struct, uuid
from ctypes import wintypes

HUB = r"\\?\USB#ROOT_HUB30#7&1b3e6982&0&0#{f18a0e88-c30c-11d0-8815-00a0c906bed8}"
PUERTO = 3
IOCTL_DESC = 0x220410  # IOCTL_USB_GET_DESCRIPTOR_FROM_NODE_CONNECTION

k32 = ctypes.WinDLL("kernel32", use_last_error=True)
k32.CreateFileW.restype = wintypes.HANDLE
h = k32.CreateFileW(HUB, 0x40000000, 2, None, 3, 0, None)
if h == wintypes.HANDLE(-1).value:
    raise SystemExit(f"no abre el hub: {ctypes.get_last_error()}")

def pedir(tipo, largo):
    # USB_DESCRIPTOR_REQUEST: ConnectionIndex(4) + SetupPacket(8) + datos
    buf = ctypes.create_string_buffer(12 + largo)
    struct.pack_into("<IBBHHH", buf, 0, PUERTO, 0x80, 6, (tipo << 8) | 0, 0, largo)
    n = wintypes.DWORD()
    if not k32.DeviceIoControl(h, IOCTL_DESC, buf, len(buf), buf, len(buf), ctypes.byref(n), None):
        raise SystemExit(f"IOCTL falló: {ctypes.get_last_error()}")
    return buf.raw[12:n.value]

cab = pedir(2, 9)
total = struct.unpack_from("<H", cab, 2)[0]
d = pedir(2, total)
print("descriptor de configuración:", len(d), "bytes")
i, interfaz = 0, None
while i < len(d):
    largo, tipo = d[i], d[i + 1]
    if largo == 0:
        break
    if tipo == 4:
        interfaz = d[i + 2]
    if tipo == 0x24 and d[i + 2] == 6 and interfaz is not None:
        uid = d[i + 3]
        guid = uuid.UUID(bytes_le=bytes(d[i + 4:i + 20]))
        ncontroles = d[i + 20]
        p = d[i + 21]
        tam = d[i + 22 + p]
        mapa = d[i + 23 + p:i + 23 + p + tam]
        print(f"XU interfaz {interfaz} unidad {uid} GUID {{{guid}}} controles {ncontroles} mapa {mapa.hex()}")
    i += largo
