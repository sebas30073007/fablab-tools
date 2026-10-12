// manual.js - el manual de uso: fabricar una PCB en la Cubiko, con sus checks.
// Es solo contenido. Cambiar un paso = editar su entrada; la imagen va en web/img/manual/<img>.webp.
//
// Los 6 pasos son los mismos de Pasos en Inicio (mismos ids y nombres que pasos() en
// vistas.js) y los mismos capítulos del recorrido guiado. Si cambia uno, cambian los tres.
// «antes» y «despues» es lo que pasa fuera de la app.

const img = (id) => `../img/manual/${id}.webp`;

export const MANUAL = {
  titulo: "Manual de uso",
  sub: "Fabricar una PCB en la Cubiko",
  antes: [
    { id: "exportar", img: img("exportar"), t: "Exporta desde KiCad",
      d: "Gerber de F.Cu y Edge.Cuts, y el .drl en milímetros, en una carpeta.",
      checks: ["Separación entre pistas de 0.3 mm o más", "Contorno cerrado en Edge.Cuts", "Taladros con el mismo origen que los Gerber"] },
    { id: "placa", img: img("placa"), t: "Fija la placa",
      d: "Cinta doble cara sobre el MDF de sacrificio, con el cobre arriba.",
      checks: ["Cobre limpio con alcohol", "Plana: sin burbujas ni esquinas levantadas", "MDF de sacrificio debajo"] },
  ],
  pasos: [
    { id: "maquina", img: img("maquina"), t: "Máquina",
      d: "Conecta por USB y haz homing: la máquina busca sus topes y sabe dónde está.",
      checks: ["Ninguna otra app usa el puerto", "Homing sin alarmas", "Fresa de pistas apretada en la pinza ER11"] },
    { id: "archivos", img: img("generar"), t: "Archivos",
      d: "Abre la carpeta de KiCad en la app. Lo que no sirve se ignora.",
      checks: ["Aparecen el cobre, el contorno y los taladros", "La placa se ve completa en la imagen", "Medidas de la placa como en KiCad"] },
    { id: "tray", img: img("aire"), t: "Trayectorias",
      d: "Revisa la imagen en blanco y negro y los parámetros; luego Generar.",
      checks: ["Todas las pistas se ven separadas en la imagen", "Sin aviso de fresa más ancha que la separación", "Tres trabajos: pistas, hoyos y contorno"] },
    { id: "xy", img: img("xy"), t: "X0 Y0",
      d: "En Mover, lleva la fresa a la esquina inferior izquierda de la placa y fija X0 Y0.",
      checks: ["Empieza con pasos de 10 mm y afina con 0.1 mm", "La fresa sobre la esquina, sin tocar el cobre", "Recorrer el área: no sale de la placa"] },
    { id: "z", img: img("ceros"), t: "Z0",
      d: "Caimán en la fresa y cable en el cobre; el asistente baja hasta el contacto.",
      checks: ["La app marca «Contacto» al tocar la placa", "Caimán quitado al terminar", "Z de nuevo después de cada cambio de fresa"] },
    { id: "fresar", img: img("fresar"), t: "Fresar",
      d: "Primero la prueba en aire (5 mm arriba), luego pistas, hoyos y contorno.",
      checks: ["Prueba en aire: el recorrido queda dentro de la placa", "Gafas puestas, tapa cerrada y mano cerca del PARO", "Pistas: fresa fina · hoyos: broca 1 mm · contorno: fresa 1 mm"] },
  ],
  despues: [
    { id: "acabado", img: img("acabado"), t: "Acaba y revisa",
      d: "Lija las rebabas, limpia y prueba con el multímetro.",
      checks: ["Sin cobre que una pistas (revisa con lupa)", "Continuidad en cada red, sin cortos", "Hoyos limpios para los componentes"] },
  ],
  // Al pie: lo que no es un paso pero se olvida
  pie: [["PARO", "botón rojo o Esc"], ["Alarma", "la app dice qué pasó y cómo salir"], ["Fresas", "se rompen fácil: nunca bajes Z con paso de 10 mm cerca de la placa"]],
};
