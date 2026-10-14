// tutorial-bloques.js - el contenido del recorrido guiado, en bloques.
//
// Cada bloque es un capítulo que se puede rehacer solo, sin tocar los demás ni el motor
// (tutorial.js). Cuando la interfaz cambie, se ajusta el bloque que la explica.
// Los capítulos con `paso` son los 6 pasos de Inicio (Pasos) y del manual (manual.js), en el
// mismo orden y con el mismo nombre.
//
// Bloque: { id, titulo, paso?(1-6), si?(app), pasos: [Paso] }
// Paso:
//   tipo      "info"   tarjeta de concepto, centrada (ícono ⓘ)
//             "señala" tarjeta de interfaz junto al objetivo; avanza con «Siguiente». Lo
//                      resaltado se puede tocar para explorar
//             "pulsa"  tarjeta de acción (ícono de clic) junto al objetivo; avanza cuando el
//                      estudiante lo pulsa (y, si hay hasta(), cuando se cumple)
//             "espera" tarjeta de acción sin velo: el estudiante trabaja (una hoja, por ejemplo)
//                      y avanza con hasta()
//   objetivo  selector CSS, o lista de selectores (se usa el primero visible). Usa anclas
//             estables: [data-tour], [data-acc], [data-tab]; nunca clases de estilo.
//             Si el objetivo no aparece, la tarjeta sale centrada y el paso sigue funcionando.
//   titulo, texto (texto: cadena o lista de párrafos; admite <b>)
//   masc      pose de Fresa (claves de app.MASC); por defecto según el tipo
//   img       imagen dentro de la tarjeta (las del manual sirven para explicar conceptos)
//   lado      "izq" | "der" | "arriba" | "abajo" | "dentro"; si falta, se elige solo
//   antes(app)   prepara la pantalla (navegar a una vista…)
//   si(app)      false = se salta
//   luego        true si si() depende de un paso anterior del mismo capítulo (para contar
//                bien las tarjetas del capítulo al entrar)
//   breve        true = transición de un instante; no cuenta como tarjeta
//   hasta(app)   condición para avanzar. Un paso «pulsa»/«espera» cuyo hasta() ya se cumple
//                se salta solo: así el recorrido se adapta a lo que el estudiante ya hizo.
//   hazlo(app)   «Hazlo por mí»: lo mismo que pulsar el objetivo. hazloSi(app) decide si se ofrece.
//   pista     texto corto de qué pulsar (para «pulsa»/«espera»)

import { hojaAbierta } from "./ui.js";

const fig = (id) => `../img/manual/${id}.webp`;
// Un botón de «Ahora»; si desaparece mientras la máquina trabaja, se sigue señalando el widget
const ahora = (acc) => [`[data-tour="ahora"] [data-acc="${acc}"]`, '[data-tour="ahora"]'];
const conectada = (app) => app.grbl.listo;
const enInicio = (app) => app.vistaActual === "inicio";
const irInicio = (app) => { if (!enInicio(app) && !hojaAbierta()) app.irA("inicio", { foco: false }); };

// La placa cabe si, desde donde está la fresa, el trabajo no se sale del recorrido
// (tras el homing todo el recorrido de la Cubiko es negativo)
function cabeLaPlaca(app) {
  const c = app.acc.cajaTrabajos(); if (!c) return true;
  const m = app.grbl.est.mpos, aj = app.grbl.ajustes;
  const X = aj[130] || 145, Y = aj[131] || 110;
  return m.x + c.x + c.ancho < -1 && m.y + c.y + c.alto < -1 && m.x + c.x > -X && m.y + c.y > -Y;
}

export const BLOQUES = [
  // ------------------------------------------------------------------
  { id: "bienvenida", titulo: "Introducción", pasos: [
    { tipo: "info", masc: "hola", titulo: "Hola, soy Fresa",
      texto: ["Vamos a fabricar juntos una placa, en simulación: nada se mueve de verdad.",
        "Verás tres tipos de tarjeta: <b>Concepto</b> (ⓘ) explica una idea, <b>Interfaz</b> te muestra una parte de la pantalla y puedes tocarla para explorar, y <b>Tu turno</b> (clic) es una acción que haces tú.",
        "Sales cuando quieras con <b>Salir</b> o con Esc."] },
    { tipo: "info", masc: "explica", titulo: "¿Qué es una CNC?", img: fig("fresar"),
      texto: "Una máquina que mueve una herramienta que gira, la <b>fresa</b>, siguiendo coordenadas. En una PCB quita el cobre que sobra y deja tus pistas." },
    { tipo: "señala", objetivo: '[data-tour="visor"]', lado: "dentro", titulo: "El gemelo 3D",
      texto: ["Es la Cubiko tal como está ahora: la fresa, la placa y las trayectorias.", "Con los botones de abajo cambias el punto de vista: <b>Arriba</b> para ver las trayectorias, <b>Frente</b> para ver la altura de la fresa."] },
    { tipo: "señala", objetivo: '[data-tour="ahora"]', antes: irInicio, titulo: "Los 6 pasos",
      texto: ["Arriba dice en qué paso vas y abajo trae el botón de lo que sigue. Tocando «Paso 1 de 6» ves los seis: Máquina, Archivos, Trayectorias, X0 Y0, Z0 y Fresar.", "Este tutorial y el manual siguen esos mismos pasos. El <b>PARO</b> rojo (o Esc) detiene todo."] },
  ] },

  // ------------------------------------------------------------------
  { id: "maquina", paso: 1, titulo: "Máquina", pasos: [
    { tipo: "pulsa", objetivo: ahora("sim"), antes: irInicio, hasta: (app) => app.grbl.conectado,
      titulo: "Conecta en simulación", texto: "Con la Cubiko real pulsarías Conectar y elegirías su puerto USB.", pista: "Pulsa Simulación",
      hazlo: (app) => app.acc.conectar("sim") },
    { tipo: "espera", breve: true, hasta: conectada, titulo: "Conectando…", texto: "Un momento." },
    { tipo: "señala", objetivo: '[data-tour="coords"]', titulo: "X, Y, Z",
      texto: ["Dónde está la punta de la fresa, en milímetros.", "<b>X</b> izquierda y derecha · <b>Y</b> adelante y atrás (en la Cubiko se mueve la cama) · <b>Z</b> arriba y abajo."] },
    { tipo: "pulsa", objetivo: ahora("homing"), antes: irInicio, hasta: (app) => app.S.homed,
      titulo: "Homing", texto: ["Al encender, la máquina no sabe dónde está y arranca bloqueada.", "Con el homing busca sus topes y desde ahí lo sabe: es su <b>origen de máquina</b>. Se hace cada vez que la enciendes."], pista: "Pulsa Homing",
      hazlo: (app) => app.acc.homing() },
  ] },

  // ------------------------------------------------------------------
  { id: "archivos", paso: 2, titulo: "Archivos", si: conectada, pasos: [
    { tipo: "info", masc: "archivos", img: fig("exportar"), titulo: "Lo que necesitas de KiCad",
      texto: ["El Gerber del cobre (<b>F.Cu</b>), el del contorno (<b>Edge.Cuts</b>) y el archivo de taladros (<b>.drl</b>). Puedes abrir la carpeta completa: lo que no sirve se ignora.",
        "Con eso se hace el <b>fresado de aislamiento</b>: la fresa recorre el borde de cada pista y quita el cobre de alrededor."] },
    { tipo: "pulsa", objetivo: ahora("ejemplo"), antes: irInicio, hasta: (app) => !!app.S.pcb || app.S.trabajos.length > 0,
      titulo: "Abre la placa de ejemplo", texto: "Es la placa del curso básico de KiCad. Con la tuya pulsarías Abrir archivos.", pista: "Pulsa Ejemplo",
      hazlo: (app) => app.acc.cargarEjemplo() },
  ] },

  // ------------------------------------------------------------------
  { id: "tray", paso: 3, titulo: "Trayectorias", si: conectada, pasos: [
    { tipo: "pulsa", objetivo: '[data-tour="w-placa"]', antes: irInicio, si: (app) => !!app.S.pcb && !app.S.trabajos.length, hasta: (app) => app.vistaActual === "placa",
      titulo: "Abre la PCB", texto: "Adentro está el material, la configuración de las herramientas y la imagen de la placa.", pista: "Pulsa PCB",
      hazlo: (app) => app.irA("placa") },
    { tipo: "señala", objetivo: '[data-tour="material"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "Material",
      texto: ["La placa virgen que vas a pegar. Escribe su ancho (X) y su alto (Y), junto a su eje en el dibujo, y su grosor (Z).", "El diseño se dibuja encima a escala: si no cabe, se ve en rojo. Los offsets lo mueven desde la esquina."] },
    { tipo: "señala", objetivo: '[data-tour="config"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "Configuración",
      texto: ["La herramienta de cada trabajo: fresa en V para pistas, broca para hoyos y fresa de maíz para el contorno.", "Adentro, cada valor tiene un dibujo que cambia contigo. Los valores por defecto ya funcionan en la Cubiko."] },
    { tipo: "señala", objetivo: '[data-tour="imagen"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "Imagen en blanco y negro",
      texto: "Así lee la app tu diseño, a 1000 puntos por pulgada: lo blanco es cobre que se queda. Ábrela para revisar: si dos pistas se ven unidas aquí, saldrán unidas en la placa." },
    { tipo: "pulsa", objetivo: ['.pag [data-acc="generar"]', ...ahora("generar")], hasta: (app) => app.S.trabajos.length > 0 && !app.S.generando,
      titulo: "Genera las trayectorias", texto: "La app calcula por dónde pasa la fresa en cada trabajo.", pista: "Pulsa Generar",
      hazlo: (app) => app.acc.generar() },
    { tipo: "señala", objetivo: '[data-tour="trabajos"]', luego: true, si: (app) => app.S.trabajos.length > 0,
      antes: (app) => { irInicio(app); document.querySelector('[data-vista="arriba"]')?.click(); }, titulo: "Un trabajo por herramienta",
      texto: ["<b>Pistas</b> con la fresa fina, <b>Hoyos</b> con la broca de 1 mm y <b>Contorno</b> con la fresa de 1 mm. Cada uno con su tiempo.", "En el 3D, desde arriba, con los mismos colores: azul pistas, verde agua hoyos, violeta contorno."] },
  ] },

  // ------------------------------------------------------------------
  { id: "xy", paso: 4, titulo: "X0 Y0", si: (app) => conectada(app) && app.S.trabajos.length > 0, pasos: [
    { tipo: "info", masc: "explica", img: fig("xy"), si: (app) => !app.S.xyListo, titulo: "Cero de trabajo",
      texto: ["El homing dice dónde está la máquina. Tú dices dónde está tu placa: su <b>cero de trabajo</b>.", "X0 Y0 va en la esquina inferior izquierda de la placa; Z0, en la superficie del cobre."] },
    { tipo: "pulsa", objetivo: ahora("mover"), antes: irInicio, si: (app) => !app.S.xyListo, hasta: (app) => app.vistaActual === "mover",
      titulo: "Ve a Mover", texto: "Aquí se mueve la fresa a mano.", pista: "Pulsa Mover", hazlo: (app) => app.irA("mover") },
    { tipo: "espera", si: (app) => !app.S.xyListo, hasta: cabeLaPlaca,
      titulo: "Lleva la fresa a la esquina", texto: ["Hacia adelante y a la izquierda, sobre donde iría la esquina de la placa. Mira el 3D.", "Cada toque mueve lo que diga el paso: 10 mm para llegar, 0.1 mm para afinar. También con las flechas del teclado."], pista: "Usa X− y Y−",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 X-125 Y-102"]), hazloTexto: "Llévala por mí" },
    { tipo: "pulsa", objetivo: '[data-acc="fijar"]', si: (app) => app.vistaActual === "mover", luego: true, hasta: (app) => app.S.xyListo,
      titulo: "Fija X0 Y0", texto: "Desde aquí se miden todos los trabajos: las trayectorias del 3D se acomodan sobre la placa.", pista: "Pulsa Fijar X0 Y0 aquí",
      hazlo: (app) => app.acc.fijarXY() },
  ] },

  // ------------------------------------------------------------------
  { id: "z", paso: 5, titulo: "Z0", si: (app) => conectada(app) && app.S.xyListo, pasos: [
    { tipo: "info", masc: "sonda", img: fig("ceros"), si: (app) => !app.S.zListo, titulo: "Z0 con la sonda",
      texto: ["El caimán va en la fresa y el cable en el cobre. Cuando se tocan, se cierra el circuito y la máquina sabe que llegó.", "Así Z0 queda justo en la superficie, aunque la placa no mida exactamente lo mismo cada vez."] },
    { tipo: "pulsa", objetivo: ahora("paso"), antes: irInicio, si: (app) => !app.S.zListo, hasta: (app) => hojaAbierta() || app.S.zListo,
      titulo: "Calibra Z", texto: "Se abre un asistente paso a paso.", pista: "Pulsa Empezar",
      hazlo: (app) => app.acc.asistenteZ(app.acc.siguienteTrabajo()) },
    { tipo: "espera", masc: "sonda", hasta: (app) => app.S.zListo,
      titulo: "Sigue el asistente", texto: ["En simulación, mantén pulsado <b>Mantén para simular el toque</b> para probar la sonda.", "Luego baja la fresa con Z− hasta unos 5 mm de la placa."],
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 Z-31"]), hazloTexto: "Acércala por mí",
      hazloSi: (app) => hojaAbierta() && app.grbl.est.estado === "Idle" && app.grbl.est.mpos.z > -30 },
    { tipo: "señala", objetivo: ahora("mapa"), antes: irInicio, luego: true, masc: "lupa", si: (app) => !!document.querySelector('[data-tour="ahora"] [data-acc="mapa"]'),
      titulo: "Mapa de alturas", texto: ["Recomendado en cada placa: la sonda toca una rejilla de puntos y la app corrige Z mientras fresa.", "Sin él, donde la placa queda más baja las pistas no se aíslan. En la simulación también: la placa virtual no es plana. Míralo en la Vista previa de PCB."] },
  ] },

  // ------------------------------------------------------------------
  { id: "fresar", paso: 6, titulo: "Fresar", si: (app) => conectada(app) && app.S.zListo, pasos: [
    { tipo: "pulsa", objetivo: ahora("aire"), antes: irInicio, hasta: (app) => hojaAbierta() || !!app.S.corriendo,
      titulo: "Prueba en aire", texto: "Antes de cortar de verdad, siempre: el mismo trabajo, pero 5 mm más arriba. Así ves el recorrido completo sin tocar la placa.", pista: "Pulsa Prueba en aire",
      hazlo: (app) => app.acc.correrTrabajo(app.acc.siguienteTrabajo(), { aire: true }) },
    { tipo: "espera", hasta: (app) => !!app.S.corriendo, titulo: "Confirma", texto: "La hoja dice qué se va a hacer.", pista: "Pulsa Probar" },
    { tipo: "señala", objetivo: '[data-tour="ahora"]', masc: "fresando", luego: true, si: (app) => !!app.S.corriendo, titulo: "En curso",
      texto: "Cuánto lleva, cuánto falta y qué sigue. Mira el 3D: la fresa recorre las pistas." },
    { tipo: "pulsa", objetivo: '[data-tour="paro"]', luego: true, si: (app) => !!app.S.corriendo, hasta: (app) => !app.S.corriendo,
      titulo: "Practica el PARO", texto: "Párala ahora, para que sepas dónde está cuando lo necesites. La posición se conserva.", pista: "Pulsa PARO",
      hazlo: (app) => app.acc.paro() },
    { tipo: "info", masc: "explica", img: fig("fresar"), titulo: "Con una placa real",
      texto: ["Deja que la prueba termine y luego pulsa Fresar. Al acabar las pistas, la app te pide la broca y volver a calibrar Z; después, la fresa del contorno.", "Revisa los checks del manual antes de cada trabajo."] },
  ] },

  // ------------------------------------------------------------------
  { id: "mas", titulo: "Extras", pasos: [
    { tipo: "señala", objetivo: '[data-tour="mapa"]', antes: (app) => { if (app.vistaActual !== "origen" && !hojaAbierta()) app.irA("origen", { foco: false }); }, masc: "lupa", titulo: "Mapa de alturas",
      texto: "Está dentro de Z0, en Origen. Si la placa no está perfectamente plana, la sonda mide una rejilla de puntos y la app corrige Z mientras fresa." },
    { tipo: "señala", objetivo: '[data-tour="fina"]', masc: "lupa", titulo: "Calibración fina (opcional)",
      texto: "Si el material quedó chueco al pegarlo, o si lo moviste después de fresar los hoyos, aquí se corrige el giro." },
    { tipo: "señala", objetivo: '[data-tour="tutorial"]', titulo: "Cuando quieras",
      texto: ["Aquí vuelves al tutorial, al manual con los checks de cada paso y al examen.", "Las acciones rápidas (+) y la Consola están abajo del panel."] },
  ] },

  // ------------------------------------------------------------------
  { id: "fin", titulo: "Final", pasos: [
    { tipo: "info", masc: "celebra", titulo: "¡Lo lograste!", fin: true,
      texto: ["Ya conoces los 6 pasos: máquina, archivos, trayectorias, X0 Y0, Z0 y fresar.", "Para tu certificado del Curso básico de CNC, responde el examen: 15 preguntas, apruebas con 80 %."] },
  ] },
];
