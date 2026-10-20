# Clips con manos 3D (muestra)

Pedido del 20 oct 2026: el tutorial sigue sin ser intuitivo, así que se probaron clips cortos donde una mano 3D hace lo que
hay que hacer fuera de la app (prender la máquina, conectar el USB, poner el caimán). Muestra en `web/demo/manos/`
(fablab.sebs.mx/demo/manos/, no está enlazada desde la app).

## Modelo elegido

**Perfil `generic-hand` de WebXR Input Profiles** (`@webxr-input-profiles/assets` 1.0.19, MIT). Es la mano que usan los
navegadores de realidad virtual: 25 articulaciones con nombre, ligera (~95 KB por mano) y ya en glTF, así que three.js la
carga sin conversión. Copia en `web/shared/vendor/manos/` con su licencia.

Descartados:
- **Mixamo** (Adobe): cuerpos completos gratis, pero requiere cuenta, su licencia no deja redistribuir el modelo suelto y
  para mostrar acciones solo hace falta la mano.
- **Modelos de mano en TurboSquid/CGTrader/Superhive**: casi todos de pago o con licencia poco clara.
- **Rig de mano de Blender (CC-BY)**: pide crédito y hay que exportarlo y reajustarlo.

## Cómo funciona

- `web/shared/js/manos.js`: carga la mano, encadena sus huesos (en el .glb vienen sueltos) y la pone en un marco simple
  (palma abajo, dedos hacia el fondo, mm). Poses con nombre (`abierta`, `apuntar`, `presionar`, `pinza`, `apretar`, `puno`…).
  En las poses que sostienen algo, el pulgar se resuelve solo para quedar a la distancia del objeto. Una manga tapa el corte
  de la muñeca.
- `web/demo/manos/clips.js`: cada clip tiene cámara, cuadros clave de la mano (posición de la punta del dedo o de la pinza,
  giro y pose), accesorios (clavija USB, caimán, cables), un aro cobre que marca dónde actuar y subtítulos.
- **Grabar** reproduce el clip y descarga un `.webm` con el subtítulo dentro, para usarlo como video en el manual.
- Depuración: `?clip=usb&t=3.2` congela un cuadro; `?poses=1` muestra todas las poses; `&cam=x,y,z&mira=x,y,z` fija la cámara.

## Pendiente

- **Panel trasero inventado**: el interruptor, el jack y el USB-B se pusieron atrás a la derecha sin confirmarlo. Revisar la
  Cubiko real (o una foto) y moverlos (`P` en `clips.js`).
- Si gustan: convertir cada paso del manual (`manual.js`) en un clip y ponerlo en lugar de la imagen o junto a ella.
