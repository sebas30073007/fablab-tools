@echo off
rem Captura USB del Pika (USBPcap2) como administrador. Ctrl+C para terminar.
net session >nul 2>&1 || (powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'" & exit /b)
cd /d "%~dp0"
echo Capturando USBPcap2 en "%~dp0creality.pcap"
echo Abre Creality Scan, conecta, enciende el laser y escanea ~20 s.
echo Luego cierra Creality Scan y aqui pulsa Ctrl+C.
"E:\USBPcap\USBPcapCMD.exe" -d "\\.\USBPcap2" -A -s 400 -b 8388608 -o "%~dp0creality.pcap"
echo Listo. Ya puedes cerrar esta ventana.
pause
