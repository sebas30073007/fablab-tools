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
//   video     id de un video de las manos (web/videos/manos/<id>.mp4): lo que se hace con la máquina real
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

import { hojaAbierta, dialogoAbierto } from "./ui.js";

const fig = (id) => `../img/manual/${id}.webp`;
// Un botón de «Ahora»; si desaparece mientras la máquina trabaja, se sigue señalando el widget
const ahora = (acc) => [`[data-tour="ahora"] [data-acc="${acc}"]`, '[data-tour="ahora"]'];
const conectada = (app) => app.grbl.listo;
const enInicio = (app) => app.vistaActual === "inicio";
const irInicio = (app) => { if (!enInicio(app) && !hojaAbierta()) app.irA("inicio", { foco: false }); };
// El asistente de Calibrar Z va en su paso «Mapa de alturas»
const enPasoMapa = () => hojaAbierta() && document.querySelector(".hoja .asis__tit")?.textContent === "Height map";

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
  { id: "bienvenida", titulo: "Introduction", pasos: [
    { tipo: "info", masc: "hola", titulo: "Hi, I’m Fresa",
      texto: "We’re going to make a board in simulation: nothing really moves. Leave anytime with Exit or Esc." },
    { tipo: "info", masc: "explica", titulo: "What is a CNC?", img: fig("fresar"),
      texto: "It moves a spinning <b>bit</b> along coordinates. On a PCB it removes the copper around each trace: that’s isolation milling." },
    { tipo: "señala", objetivo: '[data-tour="visor"]', lado: "dentro", titulo: "The 3D twin",
      texto: "It’s the Cubiko exactly as it is now. Change the view below: <b>Top</b> for the toolpaths, <b>Front</b> for the bit height." },
    { tipo: "señala", objetivo: '[data-tour="ahora"]', antes: irInicio, titulo: "The 6 steps",
      texto: "Which step you’re on and the button for what’s next. The red <b>STOP</b> (or Esc) stops everything." },
  ] },

  // ------------------------------------------------------------------
  { id: "maquina", paso: 1, titulo: "Machine", pasos: [
    { tipo: "info", masc: "explica", video: "encender", titulo: "With the real Cubiko",
      texto: "Here we do it in simulation; this is how you turn on the real machine." },
    { tipo: "pulsa", objetivo: ahora("sim"), antes: irInicio, hasta: (app) => app.grbl.conectado,
      titulo: "Connect in simulation", texto: "With the real Cubiko you’d press Connect and pick its USB port.", pista: "Press Simulation",
      hazlo: (app) => app.acc.conectar("sim") },
    { tipo: "espera", breve: true, hasta: conectada, titulo: "Connecting…", texto: "One moment." },
    { tipo: "señala", objetivo: '[data-tour="coords"]', titulo: "X, Y, Z",
      texto: "Where the bit tip is, in millimeters. On the Cubiko, Y moves the bed, not the bit." },
    { tipo: "pulsa", objetivo: ahora("homing"), antes: irInicio, hasta: (app) => app.S.homed,
      video: "homing", titulo: "Homing", texto: "When it powers on it doesn’t know where it is. Homing finds its limits: its machine origin.", pista: "Press Homing",
      hazlo: (app) => app.acc.homing() },
  ] },

  // ------------------------------------------------------------------
  { id: "archivos", paso: 2, titulo: "Files", si: conectada, pasos: [
    { tipo: "info", masc: "archivos", img: fig("exportar"), titulo: "What you need from KiCad",
      texto: "<b>F.Cu</b> (copper), <b>Edge.Cuts</b> (outline) and the <b>.drl</b> (holes). You can open the whole folder: anything it can’t use is ignored." },
    { tipo: "pulsa", objetivo: ahora("ejemplo"), antes: irInicio, hasta: (app) => !!app.S.pcb || app.S.trabajos.length > 0,
      titulo: "Open the sample board", texto: "The one from the basic KiCad course. With yours you’d press Open files.", pista: "Press Example",
      hazlo: (app) => app.acc.cargarEjemplo() },
  ] },

  // ------------------------------------------------------------------
  { id: "tray", paso: 3, titulo: "Toolpaths", si: conectada, pasos: [
    { tipo: "pulsa", objetivo: '[data-tour="w-placa"]', antes: irInicio, si: (app) => !!app.S.pcb && !app.S.trabajos.length, hasta: (app) => app.vistaActual === "placa",
      titulo: "Open the file", texto: "Here are the stock, the tools and the board image.", pista: "Press File",
      hazlo: (app) => app.irA("placa") },
    { tipo: "señala", objetivo: '[data-tour="material"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "Material",
      texto: "Enter its width and height. Measure the thickness with calipers, copper included: it sets how deep the holes and outline go." },
    { tipo: "señala", objetivo: '[data-tour="config"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "CNC settings",
      texto: "It should say <b>Cubiko values</b>: they already work. If something is out of range, it turns red and won’t let you generate." },
    { tipo: "pulsa", objetivo: '[data-tour="config"]', luego: true, si: (app) => app.vistaActual === "placa", hasta: (app) => app.vistaActual === "config",
      titulo: "See how it cuts", texto: "Each tool, drawn with its values.", pista: "Press CNC settings", hazlo: (app) => app.irA("config") },
    { tipo: "señala", objetivo: '[data-tour="herr-pistas"]', luego: true, si: (app) => app.vistaActual === "config", masc: "lupa", titulo: "Traces depth",
      texto: "The V goes in <b>0.1 mm</b>: just enough to cut through the copper. Deeper, it opens a wide groove and eats the traces." },
    { tipo: "señala", objetivo: '[data-tour="imagen"]', luego: true, si: (app) => !!app.S.pcb && ["placa", "config"].includes(app.vistaActual),
      antes: (app) => { if (app.vistaActual !== "placa" && !hojaAbierta()) app.irA("placa", { foco: false }); }, titulo: "Black-and-white image",
      texto: "This is how the app reads your design: white is copper that stays. If two traces look joined here, they’ll come out joined." },
    { tipo: "pulsa", objetivo: ['.pag [data-acc="generar"]', ...ahora("generar")], hasta: (app) => app.S.trabajos.length > 0 && !app.S.generando,
      titulo: "Generate the toolpaths", texto: "The app works out where the bit goes.", pista: "Press Generate",
      hazlo: (app) => app.acc.generar() },
    // Al generar se abre la vista previa: se mira y se cierra antes de seguir
    { tipo: "espera", luego: true, si: () => dialogoAbierto(), hasta: () => !dialogoAbierto(), titulo: "Preview",
      texto: "This is how the board will look. Close it with the ✕ to continue." },
    { tipo: "info", masc: "explica", video: "herramientas", luego: true, si: (app) => app.S.trabajos.length > 0,
      antes: (app) => { irInicio(app); document.querySelector('[data-vista="arriba"]')?.click(); }, titulo: "One job per tool",
      texto: "Traces with the V, holes with the drill bit and outline with the corncob bit. Look at the tip to know which one is in." },
  ] },

  // ------------------------------------------------------------------
  { id: "xy", paso: 4, titulo: "X0 Y0", si: (app) => conectada(app) && app.S.trabajos.length > 0, pasos: [
    { tipo: "info", masc: "explica", video: "sujetador", titulo: "The board, clamped",
      texto: "Centered on the bed, with both clamps tightened with the 3 mm Allen key." },
    { tipo: "info", masc: "explica", video: "xy", si: (app) => !app.S.xyListo, titulo: "Work zero",
      texto: "Homing says where the machine is; you say where your board is. X0 Y0 goes at its front-left corner." },
    { tipo: "pulsa", objetivo: ahora("mover"), antes: irInicio, si: (app) => !app.S.xyListo, hasta: (app) => app.vistaActual === "mover",
      titulo: "Go to Jog", texto: "Here you move the bit by hand.", pista: "Press Jog", hazlo: (app) => app.irA("mover") },
    { tipo: "espera", si: (app) => !app.S.xyListo, hasta: cabeLaPlaca,
      titulo: "Move the bit to the corner", texto: "Toward the front and left. 10 mm steps to get there and 0.1 mm to fine-tune.", pista: "Use X− and Y−",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 X-125 Y-102"]), hazloTexto: "Move it for me" },
    { tipo: "pulsa", objetivo: '[data-acc="fijar"]', si: (app) => app.vistaActual === "mover", luego: true, hasta: (app) => app.S.xyListo,
      titulo: "Set X0 Y0", texto: "Every job is measured from here: the toolpaths line up on the board.", pista: "Press Set X0 Y0 here",
      hazlo: (app) => app.acc.fijarXY() },
  ] },

  // ------------------------------------------------------------------
  { id: "z", paso: 5, titulo: "Z0", si: (app) => conectada(app) && app.S.xyListo, pasos: [
    { tipo: "info", masc: "sonda", video: "sonda", si: (app) => !app.S.zListo, titulo: "Z0 with the probe",
      texto: "Touching the copper closes the circuit and Z0 lands right on the surface." },
    { tipo: "pulsa", objetivo: ahora("paso"), antes: irInicio, si: (app) => !app.S.zListo, hasta: (app) => hojaAbierta() || app.S.zListo,
      titulo: "Calibrate Z", texto: "A wizard opens.", pista: "Press Start",
      hazlo: (app) => app.acc.asistenteZ(app.acc.siguienteTrabajo()) },
    { tipo: "espera", masc: "sonda", hasta: (app) => app.S.zListo || enPasoMapa(),
      titulo: "Follow the wizard", texto: "Lower to about 5 mm above the board and press <b>Lower and touch</b>. In simulation, hold <b>Hold to simulate the touch</b>.",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 Z-31"]), hazloTexto: "Bring it closer for me",
      hazloSi: (app) => hojaAbierta() && app.grbl.est.estado === "Idle" && app.grbl.est.mpos.z > -30 },
    { tipo: "espera", masc: "lupa", luego: true, si: () => enPasoMapa(), hasta: (app) => app.S.zListo || !!app.S.mapa?.completo,
      video: "mapa", titulo: "Height map", texto: "Leave the alligator clip on and press <b>Measure</b>. The app corrects Z while it mills.",
      hazlo: () => document.querySelector('.hoja [data-sig]')?.click(), hazloTexto: "Measure it for me",
      hazloSi: (app) => enPasoMapa() && !app.S.midiendo && !app.S.mapa?.completo },
    { tipo: "espera", masc: "sonda", luego: true, si: (app) => !app.S.zListo, hasta: (app) => app.S.zListo,
      video: "quitarCaiman", titulo: "Remove the probe", texto: "Before milling. Then press Next and Done to close the wizard." },
  ] },

  // ------------------------------------------------------------------
  { id: "fresar", paso: 6, titulo: "Mill", si: (app) => conectada(app) && app.S.zListo, pasos: [
    { tipo: "info", masc: "explica", video: "ponerTapa", titulo: "Close the lid",
      texto: "It has a sensor: without the lid the spindle won’t turn on." },
    { tipo: "pulsa", objetivo: ahora("aire"), antes: irInicio, hasta: (app) => hojaAbierta() || !!app.S.corriendo,
      titulo: "Air test", texto: "The same job, 5 mm higher: you see the full path without touching the board. Always before cutting.", pista: "Press Air test",
      hazlo: (app) => app.acc.correrTrabajo(app.acc.siguienteTrabajo(), { aire: true }) },
    { tipo: "espera", hasta: (app) => !!app.S.corriendo, titulo: "Confirm", texto: "Check what the sheet says.", pista: "Press Test" },
    { tipo: "señala", objetivo: '[data-tour="ahora"]', masc: "fresando", luego: true, si: (app) => !!app.S.corriendo, titulo: "Running",
      texto: "How much is done, how much is left and what’s next. In the 3D view the bit follows the traces." },
    { tipo: "pulsa", objetivo: '[data-tour="paro"]', luego: true, si: (app) => !!app.S.corriendo, hasta: (app) => !app.S.corriendo,
      video: "paro", titulo: "Practice STOP", texto: "Stop it now so you know where it is. The position is kept.", pista: "Press STOP",
      hazlo: (app) => app.acc.paro() },
    { tipo: "info", masc: "explica", video: "cambiar", titulo: "With a real board",
      texto: "With a real board, after the traces the app asks for the drill bit and to calibrate Z again." },
  ] },

  // ------------------------------------------------------------------
  // El pitido del final de carrera: qué es y cómo salir (en simulación se practica con un movimiento fuera del área)
  { id: "alarma", titulo: "Alarms", si: (app) => conectada(app) && !app.S.corriendo, pasos: [
    { tipo: "info", masc: "alerta", titulo: "The limit beep",
      texto: "If an axis reaches its limit (the limit switch), it beeps and the machine locks." },
    { tipo: "espera", antes: irInicio, hasta: (app) => app.grbl.est.estado === "Alarm",
      titulo: "Trigger an alarm", texto: "In simulation, ask for a move outside the area. On the real one, don’t do it on purpose.",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 X10"]), hazloTexto: "Trigger it" },
    { tipo: "pulsa", objetivo: ahora("desbloquear"), antes: irInicio, luego: true, hasta: (app) => app.grbl.est.estado !== "Alarm",
      titulo: "Read and unlock", texto: "The top says what happened. Unlock, move the axis 1 mm away and run Homing; then check X0 Y0.", pista: "Press Unlock",
      hazlo: (app) => app.acc.desbloquear() },
  ] },

  // ------------------------------------------------------------------
  { id: "mas", titulo: "Extras", pasos: [
    { tipo: "señala", objetivo: '[data-tour="mapa"]', antes: (app) => { if (app.vistaActual !== "origen" && !hojaAbierta()) app.irA("origen", { foco: false }); }, masc: "lupa", titulo: "Height map",
      texto: "It’s measured when you calibrate Z. To redo it, it’s here in Origin." },
    { tipo: "señala", objetivo: '[data-tour="fina"]', masc: "lupa", titulo: "Fine calibration (optional)",
      texto: "Corrects the rotation if the board ended up crooked." },
    { tipo: "señala", objetivo: '[data-tour="tutorial"]', titulo: "Anytime",
      texto: "Come back here for the tutorial, the manual and the exam." },
  ] },

  // ------------------------------------------------------------------
  { id: "fin", titulo: "Final", pasos: [
    { tipo: "info", masc: "celebra", titulo: "You did it!", fin: true,
      texto: "Now you know the 6 steps. For your certificate, take the exam: 15 questions, pass with 80 %." },
  ] },
];
