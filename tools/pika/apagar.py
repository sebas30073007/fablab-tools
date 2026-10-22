"""Prende con 158 = 1 (con video), a los 4 s manda solo 158 = 0 y espera otros 4 s."""
import os, sys, time

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from recortar import Banco, Camara

banco = Banco()
banco.parar()
cam = Camara()
try:
    print(banco.pika.orden("474d040002000000" "9e000000" "01000000")[1])
    time.sleep(4)
    print(banco.pika.orden("474d040002000000" "9e000000" "00000000")[1])
    time.sleep(4)
finally:
    cam.cerrar()
    banco.parar()
