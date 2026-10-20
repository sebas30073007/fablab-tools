# Clips con manos 3D (muestra)

Pedido del 20 oct 2026: el tutorial sigue sin ser intuitivo, así que se probaron clips cortos donde una mano 3D hace lo que
hay que hacer fuera de la app. Muestra en `web/demo/manos/` (fablab.sebs.mx/demo/manos/, no está enlazada desde la app).

## Clips

1. **Enciende**: ON/OFF en el costado derecho de la base; señala también el E-STOP. Al prender se iluminan la franja, la
   pantalla, el símbolo del botón y la barra LED.
2. **Conecta el USB**: USB-B atrás en el costado derecho, debajo de la corriente.
3. **Quita la tapa** y 4. **Pon la tapa**: con las dos manos, de los costados, hacia arriba; se deja a un lado. Sin tapa
   la máquina se mueve y hace homing, pero el husillo no enciende (la tapa pisa un final de carrera).
5. **Sujeta la placa**: acercamiento sin mano: la lengüeta del sujetador sobre la orilla de la placa y la llave Allen
   apretando el tornillo.
6. **Las herramientas**: punta en V, maíz y broca, una tras otra en la pinza y al final en fila con su nombre.
7. **Conecta la sonda**: el conector blanco en «Leveling» (pared derecha, por dentro, arriba), el caimán negro en la
   orilla de la placa y el rojo en la fresa.

## La máquina (`web/cnc/js/cubiko.js`)

Afinada con 15 fotos de la Cubiko del Fab Lab (20 oct 2026):
- Costado derecho de la base: E-STOP rojo al frente y ON/OFF con símbolo iluminado detrás; corriente (clavija en ángulo)
  y USB-B casi en la esquina de atrás.
- Pared derecha por dentro, arriba y cerca del frente: Upgrade Interface (ranura), 4th axis y Leveling, rotulados en
  vertical. Del techo cuelga un conector blanco suelto (el del láser).
- Eje X: varillas con soportes redondos, husillo con cople negro a la derecha y tuerca antijuego a la izquierda, barra
  LED entre la varilla de abajo y el husillo (ilumina la cama) y un final de carrera en cada pared.
- Cama 186 × 136: rejilla de 6 × 5 roscas (paso 32 × 27), cuatro roscas extra entre la 1.ª y la 2.ª columna de cada
  orilla y un perno de latón atrás a la derecha. Las ranuras de la base quedan cerca de las orillas de la cama.
- `crearSujetador()`: sujetador de aluminio (pie, barra con ranura, lengüeta) con tornillo Allen de cabeza plana y arandela.
- `construirHerramienta(tipo)` / `ponerHerramienta(tipo)`: `v`, `maiz`, `broca`. El visor usa la V.

Por confirmar en la máquina: medidas exactas de la cama y del sujetador, la medida del tornillo (¿M4 o M5?) y dónde está
el sensor de la tapa (se puso en el hueco del frente de la base, que se ve en la foto de arriba).

## Modelo de mano

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
  giro y pose), accesorios (clavija USB, caimanes, conector de la sonda, llave Allen, cables), un aro cobre que marca dónde
  actuar y subtítulos. `escenaBase()` deja la máquina prendida, con tapa y sin accesorios antes de cada cuadro.
- **Grabar** reproduce el clip y descarga un `.webm` con el subtítulo dentro, para usarlo como video en el manual.
- Depuración: `?clip=usb&t=3.2` congela un cuadro; `?poses=1` muestra todas las poses; `&cam=x,y,z&mira=x,y,z` fija la cámara.

## Pendiente

- Los dedos atraviesan cables, caimanes y la tapa (no hay colisiones).
- Sujetadores en el visor de la app (tendrían que seguir el tamaño de la placa).
- Si gustan: convertir cada paso del manual (`manual.js`) en un clip y ponerlo en lugar de la imagen o junto a ella.
