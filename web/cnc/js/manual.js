// manual.js - el manual de uso: fabricar una PCB en la Cubiko, con sus checks.
// Es solo contenido. Cambiar un paso = editar su entrada; la imagen va en web/img/manual/<img>.webp.
//
// Los 6 pasos son los mismos de Pasos en Inicio (mismos ids y nombres que pasos() en
// vistas.js) y los mismos capítulos del recorrido guiado. Si cambia uno, cambian los tres.
// «antes» y «despues» es lo que pasa fuera de la app.
// «clips»: los videos de ese paso (ids de web/demo/manos/clips.js, con su nombre).

const img = (id) => `../img/manual/${id}.webp`;
const clip = (id, nombre) => ({ id, nombre });

export const MANUAL = {
  titulo: "Manual de uso",
  sub: "Fabricar una PCB en la Cubiko",
  antes: [
    { id: "exportar", img: img("exportar"), t: "Exporta desde KiCad",
      d: "Gerber de F.Cu y Edge.Cuts, y el .drl en milímetros, en una carpeta.",
      checks: ["Separación entre pistas de 0.3 mm o más", "Contorno cerrado en Edge.Cuts", "Taladros con el mismo origen que los Gerber"] },
    { id: "placa", img: img("placa"), t: "Fija la placa",
      d: "Sin tapa, al centro de la cama con el cobre arriba, sujeta con los dos sujetadores de aluminio.",
      checks: ["Cobre limpio con alcohol", "Plana: sin burbujas ni esquinas levantadas", "Sujetadores firmes con la llave Allen de 3 mm"],
      clips: [clip("quitarTapa", "Quita la tapa"), clip("ponerPlaca", "Pon la placa"), clip("sujetador", "Sujeta la placa")] },
  ],
  pasos: [
    { id: "maquina", img: img("maquina"), t: "Máquina",
      d: "Conecta por USB y haz homing: la máquina busca sus topes y sabe dónde está.",
      checks: ["Ninguna otra app usa el puerto", "Homing sin alarmas", "Fresa de pistas apretada en la pinza ER11"],
      clips: [clip("encender", "Enciende"), clip("usb", "USB"), clip("herramientas", "Las herramientas"), clip("cambiar", "Cambia la fresa"), clip("homing", "Homing")] },
    { id: "archivos", img: img("generar"), t: "Archivos",
      d: "Abre la carpeta de KiCad en la app. Lo que no sirve se ignora.",
      checks: ["Aparecen el cobre, el contorno y los taladros", "La placa se ve completa en la imagen", "Medidas de la placa como en KiCad"] },
    { id: "tray", img: img("aire"), t: "Trayectorias",
      d: "Escribe las medidas del material, revisa la imagen en blanco y negro y pulsa Generar.",
      checks: ["Grosor medido con vernier, con el cobre", "Configuración en «Valores de la Cubiko»: no la cambies", "Todas las pistas se ven separadas en la imagen", "Tres trabajos: pistas, hoyos y contorno"] },
    { id: "xy", img: img("xy"), t: "X0 Y0",
      d: "En Mover, lleva la fresa a la esquina inferior izquierda de la placa y fija X0 Y0.",
      checks: ["Empieza con pasos de 10 mm y afina con 0.1 mm", "La fresa sobre la esquina, sin tocar el cobre", "Recorrer el área: no sale de la placa"],
      clips: [clip("xy", "X0 Y0")] },
    { id: "z", img: img("ceros"), t: "Z0",
      d: "Caimán en la fresa y cable en el cobre; el asistente baja hasta el contacto y luego mide el mapa de alturas.",
      checks: ["La app marca «Contacto» al tocar la placa", "Mapa de alturas medido, con el caimán puesto hasta el final", "Caimán quitado al terminar", "Z de nuevo después de cada cambio de fresa"],
      clips: [clip("sonda", "Conecta la sonda"), clip("tocar", "Toca la placa"), clip("mapa", "Mapa de alturas"), clip("quitarCaiman", "Quita el caimán")] },
    { id: "fresar", img: img("fresar"), t: "Fresar",
      d: "Primero la prueba en aire (5 mm arriba), luego pistas, hoyos y contorno.",
      checks: ["Prueba en aire: el recorrido queda dentro de la placa", "Gafas puestas, tapa cerrada y mano cerca del PARO", "Pistas: fresa en V · hoyos: broca 1 mm · contorno: fresa de maíz 1 mm"],
      clips: [clip("ponerTapa", "Pon la tapa"), clip("fresar", "Prueba en aire y fresa"), clip("paro", "Paro")] },
  ],
  despues: [
    { id: "acabado", img: img("acabado"), t: "Acaba y revisa",
      d: "Lija las rebabas, limpia y prueba con el multímetro.",
      checks: ["Sin cobre que una pistas (revisa con lupa)", "Continuidad en cada red, sin cortos", "Hoyos limpios para los componentes"],
      clips: [clip("limpiar", "Aspira"), clip("sacarPlaca", "Saca la placa"), clip("apagar", "Apaga")] },
  ],
  // Al pie: lo que no es un paso pero se olvida
  pie: [["PARO", "botón rojo o Esc"], ["Pitido del tope", "Desbloquear, aleja el eje 1 mm y haz Homing; luego revisa X0 Y0"], ["Alarma", "la app dice qué pasó y cómo salir"], ["Fresas", "se rompen fácil: nunca bajes Z con paso de 10 mm cerca de la placa"]],
};
