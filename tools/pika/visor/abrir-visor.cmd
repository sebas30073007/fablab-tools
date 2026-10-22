@echo off
rem Visor local del Pika en http://127.0.0.1:8805 (cierra Creality Scan antes).
start "" http://127.0.0.1:8805
python -I "%~dp0servidor.py"
