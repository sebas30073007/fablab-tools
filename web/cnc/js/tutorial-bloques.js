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
const enPasoMapa = () => hojaAbierta() && document.querySelector(".hoja .asis__tit")?.textContent === "Mapa de alturas";

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
      texto: "Vamos a fabricar una placa en simulación: nada se mueve de verdad. Sales cuando quieras con Salir o Esc." },
    { tipo: "info", masc: "explica", titulo: "¿Qué es una CNC?", img: fig("fresar"),
      texto: "Mueve una <b>fresa</b> que gira siguiendo coordenadas. En una PCB quita el cobre alrededor de cada pista: es el fresado de aislamiento." },
    { tipo: "señala", objetivo: '[data-tour="visor"]', lado: "dentro", titulo: "El gemelo 3D",
      texto: "Es la Cubiko tal como está ahora. Abajo cambias la vista: <b>Arriba</b> para las trayectorias, <b>Frente</b> para la altura de la fresa." },
    { tipo: "señala", objetivo: '[data-tour="ahora"]', antes: irInicio, titulo: "Los 6 pasos",
      texto: "En qué paso vas y el botón de lo que sigue. El <b>PARO</b> rojo (o Esc) detiene todo." },
  ] },

  // ------------------------------------------------------------------
  { id: "maquina", paso: 1, titulo: "Máquina", pasos: [
    { tipo: "info", masc: "explica", video: "encender", titulo: "Con la Cubiko real",
      texto: "Aquí lo hacemos en simulación; con la máquina real se enciende así." },
    { tipo: "pulsa", objetivo: ahora("sim"), antes: irInicio, hasta: (app) => app.grbl.conectado,
      titulo: "Conecta en simulación", texto: "Con la Cubiko real pulsarías Conectar y elegirías su puerto USB.", pista: "Pulsa Simulación",
      hazlo: (app) => app.acc.conectar("sim") },
    { tipo: "espera", breve: true, hasta: conectada, titulo: "Conectando…", texto: "Un momento." },
    { tipo: "señala", objetivo: '[data-tour="coords"]', titulo: "X, Y, Z",
      texto: "Dónde está la punta de la fresa, en milímetros. En la Cubiko, Y mueve la cama, no la fresa." },
    { tipo: "pulsa", objetivo: ahora("homing"), antes: irInicio, hasta: (app) => app.S.homed,
      video: "homing", titulo: "Homing", texto: "Al encender no sabe dónde está. El homing busca sus topes: su origen de máquina.", pista: "Pulsa Homing",
      hazlo: (app) => app.acc.homing() },
  ] },

  // ------------------------------------------------------------------
  { id: "archivos", paso: 2, titulo: "Archivos", si: conectada, pasos: [
    { tipo: "info", masc: "archivos", img: fig("exportar"), titulo: "Lo que necesitas de KiCad",
      texto: "<b>F.Cu</b> (cobre), <b>Edge.Cuts</b> (contorno) y el <b>.drl</b> (taladros). Puedes abrir la carpeta completa: lo que no sirve se ignora." },
    { tipo: "pulsa", objetivo: ahora("ejemplo"), antes: irInicio, hasta: (app) => !!app.S.pcb || app.S.trabajos.length > 0,
      titulo: "Abre la placa de ejemplo", texto: "La del curso básico de KiCad. Con la tuya pulsarías Abrir archivos.", pista: "Pulsa Ejemplo",
      hazlo: (app) => app.acc.cargarEjemplo() },
  ] },

  // ------------------------------------------------------------------
  { id: "tray", paso: 3, titulo: "Trayectorias", si: conectada, pasos: [
    { tipo: "pulsa", objetivo: '[data-tour="w-placa"]', antes: irInicio, si: (app) => !!app.S.pcb && !app.S.trabajos.length, hasta: (app) => app.vistaActual === "placa",
      titulo: "Abre el archivo", texto: "Aquí están el material, las herramientas y la imagen de la placa.", pista: "Pulsa Archivo",
      hazlo: (app) => app.irA("placa") },
    { tipo: "señala", objetivo: '[data-tour="material"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "Material",
      texto: "Escribe su ancho y alto. Mide el grosor con vernier, con el cobre: de él sale cuánto bajan hoyos y contorno." },
    { tipo: "señala", objetivo: '[data-tour="config"]', luego: true, si: (app) => app.vistaActual === "placa", titulo: "Configuraciones de CNC",
      texto: "Debe decir <b>Valores de la Cubiko</b>: ya funcionan. Si algo se sale de rango, se pone en rojo y no deja generar." },
    { tipo: "pulsa", objetivo: '[data-tour="config"]', luego: true, si: (app) => app.vistaActual === "placa", hasta: (app) => app.vistaActual === "config",
      titulo: "Mira cómo corta", texto: "Cada herramienta, dibujada con sus valores.", pista: "Pulsa Configuraciones de CNC", hazlo: (app) => app.irA("config") },
    { tipo: "señala", objetivo: '[data-tour="herr-pistas"]', luego: true, si: (app) => app.vistaActual === "config", masc: "lupa", titulo: "Profundidad de las pistas",
      texto: "La V entra <b>0.1 mm</b>: lo justo para atravesar el cobre. Más hondo, abre un surco ancho y se come las pistas." },
    { tipo: "señala", objetivo: '[data-tour="imagen"]', luego: true, si: (app) => !!app.S.pcb && ["placa", "config"].includes(app.vistaActual),
      antes: (app) => { if (app.vistaActual !== "placa" && !hojaAbierta()) app.irA("placa", { foco: false }); }, titulo: "Imagen en blanco y negro",
      texto: "Así lee la app tu diseño: lo blanco es cobre que se queda. Si dos pistas se ven unidas aquí, saldrán unidas." },
    { tipo: "pulsa", objetivo: ['.pag [data-acc="generar"]', ...ahora("generar")], hasta: (app) => app.S.trabajos.length > 0 && !app.S.generando,
      titulo: "Genera las trayectorias", texto: "La app calcula por dónde pasa la fresa.", pista: "Pulsa Generar",
      hazlo: (app) => app.acc.generar() },
    // Al generar se abre la vista previa: se mira y se cierra antes de seguir
    { tipo: "espera", luego: true, si: () => dialogoAbierto(), hasta: () => !dialogoAbierto(), titulo: "Vista previa",
      texto: "Así quedará la placa. Ciérrala con la ✕ para seguir." },
    { tipo: "info", masc: "explica", video: "herramientas", luego: true, si: (app) => app.S.trabajos.length > 0,
      antes: (app) => { irInicio(app); document.querySelector('[data-vista="arriba"]')?.click(); }, titulo: "Un trabajo por herramienta",
      texto: "Pistas con la V, hoyos con la broca y contorno con la de maíz. Fíjate en la punta para saber cuál está puesta." },
  ] },

  // ------------------------------------------------------------------
  { id: "xy", paso: 4, titulo: "X0 Y0", si: (app) => conectada(app) && app.S.trabajos.length > 0, pasos: [
    { tipo: "info", masc: "explica", video: "sujetador", titulo: "La placa, sujeta",
      texto: "Al centro de la cama, con los dos sujetadores apretados con la llave Allen de 3 mm." },
    { tipo: "info", masc: "explica", video: "xy", si: (app) => !app.S.xyListo, titulo: "Cero de trabajo",
      texto: "El homing dice dónde está la máquina; tú dices dónde está tu placa. X0 Y0 va en su esquina de adelante a la izquierda." },
    { tipo: "pulsa", objetivo: ahora("mover"), antes: irInicio, si: (app) => !app.S.xyListo, hasta: (app) => app.vistaActual === "mover",
      titulo: "Ve a Mover", texto: "Aquí mueves la fresa a mano.", pista: "Pulsa Mover", hazlo: (app) => app.irA("mover") },
    { tipo: "espera", si: (app) => !app.S.xyListo, hasta: cabeLaPlaca,
      titulo: "Lleva la fresa a la esquina", texto: "Hacia adelante y a la izquierda. Pasos de 10 mm para llegar y de 0.1 mm para afinar.", pista: "Usa X− y Y−",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 X-125 Y-102"]), hazloTexto: "Llévala por mí" },
    { tipo: "pulsa", objetivo: '[data-acc="fijar"]', si: (app) => app.vistaActual === "mover", luego: true, hasta: (app) => app.S.xyListo,
      titulo: "Fija X0 Y0", texto: "Desde aquí se miden todos los trabajos: las trayectorias se acomodan sobre la placa.", pista: "Pulsa Fijar X0 Y0 aquí",
      hazlo: (app) => app.acc.fijarXY() },
  ] },

  // ------------------------------------------------------------------
  { id: "z", paso: 5, titulo: "Z0", si: (app) => conectada(app) && app.S.xyListo, pasos: [
    { tipo: "info", masc: "sonda", video: "sonda", si: (app) => !app.S.zListo, titulo: "Z0 con la sonda",
      texto: "Al tocar el cobre se cierra el circuito y Z0 queda justo en la superficie." },
    { tipo: "pulsa", objetivo: ahora("paso"), antes: irInicio, si: (app) => !app.S.zListo, hasta: (app) => hojaAbierta() || app.S.zListo,
      titulo: "Calibra Z", texto: "Se abre un asistente.", pista: "Pulsa Empezar",
      hazlo: (app) => app.acc.asistenteZ(app.acc.siguienteTrabajo()) },
    { tipo: "espera", masc: "sonda", hasta: (app) => app.S.zListo || enPasoMapa(),
      titulo: "Sigue el asistente", texto: "Baja a unos 5 mm de la placa y pulsa <b>Bajar y tocar</b>. En simulación, mantén <b>Mantén para simular el toque</b>.",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 Z-31"]), hazloTexto: "Acércala por mí",
      hazloSi: (app) => hojaAbierta() && app.grbl.est.estado === "Idle" && app.grbl.est.mpos.z > -30 },
    { tipo: "espera", masc: "lupa", luego: true, si: () => enPasoMapa(), hasta: (app) => app.S.zListo || !!app.S.mapa?.completo,
      video: "mapa", titulo: "Mapa de alturas", texto: "Deja el caimán puesto y pulsa <b>Medir</b>. La app corrige Z mientras fresa.",
      hazlo: () => document.querySelector('.hoja [data-sig]')?.click(), hazloTexto: "Mídelo por mí",
      hazloSi: (app) => enPasoMapa() && !app.S.midiendo && !app.S.mapa?.completo },
    { tipo: "espera", masc: "sonda", luego: true, si: (app) => !app.S.zListo, hasta: (app) => app.S.zListo,
      video: "quitarCaiman", titulo: "Quita la sonda", texto: "Antes de fresar. Luego pulsa Siguiente y Listo para cerrar el asistente." },
  ] },

  // ------------------------------------------------------------------
  { id: "fresar", paso: 6, titulo: "Fresar", si: (app) => conectada(app) && app.S.zListo, pasos: [
    { tipo: "info", masc: "explica", video: "ponerTapa", titulo: "Pon la tapa",
      texto: "Tiene un sensor: sin la tapa el husillo no enciende." },
    { tipo: "pulsa", objetivo: ahora("aire"), antes: irInicio, hasta: (app) => hojaAbierta() || !!app.S.corriendo,
      titulo: "Prueba en aire", texto: "El mismo trabajo, 5 mm más arriba: ves el recorrido completo sin tocar la placa. Siempre antes de cortar.", pista: "Pulsa Prueba en aire",
      hazlo: (app) => app.acc.correrTrabajo(app.acc.siguienteTrabajo(), { aire: true }) },
    { tipo: "espera", hasta: (app) => !!app.S.corriendo, titulo: "Confirma", texto: "Revisa lo que dice la hoja.", pista: "Pulsa Probar" },
    { tipo: "señala", objetivo: '[data-tour="ahora"]', masc: "fresando", luego: true, si: (app) => !!app.S.corriendo, titulo: "En curso",
      texto: "Cuánto lleva, cuánto falta y qué sigue. En el 3D la fresa recorre las pistas." },
    { tipo: "pulsa", objetivo: '[data-tour="paro"]', luego: true, si: (app) => !!app.S.corriendo, hasta: (app) => !app.S.corriendo,
      video: "paro", titulo: "Practica el PARO", texto: "Párala ahora para saber dónde está. La posición se conserva.", pista: "Pulsa PARO",
      hazlo: (app) => app.acc.paro() },
    { tipo: "info", masc: "explica", video: "cambiar", titulo: "Con una placa real",
      texto: "Con una placa real, después de las pistas la app te pide la broca y calibrar Z otra vez." },
  ] },

  // ------------------------------------------------------------------
  // El pitido del final de carrera: qué es y cómo salir (en simulación se practica con un movimiento fuera del área)
  { id: "alarma", titulo: "Alarmas", si: (app) => conectada(app) && !app.S.corriendo, pasos: [
    { tipo: "info", masc: "alerta", titulo: "El pitido del tope",
      texto: "Si un eje llega a su tope (el final de carrera), suena un pitido y la máquina se bloquea." },
    { tipo: "espera", antes: irInicio, hasta: (app) => app.grbl.est.estado === "Alarm",
      titulo: "Provoca una alarma", texto: "En simulación, pide un movimiento fuera del área. Con la real, no lo hagas a propósito.",
      hazlo: (app) => app.grbl.enviarVarias(["G90", "G53 G0 X10"]), hazloTexto: "Provócala" },
    { tipo: "pulsa", objetivo: ahora("desbloquear"), antes: irInicio, luego: true, hasta: (app) => app.grbl.est.estado !== "Alarm",
      titulo: "Lee y desbloquea", texto: "Arriba dice qué pasó. Desbloquea, aleja el eje 1 mm y haz Homing; luego revisa X0 Y0.", pista: "Pulsa Desbloquear",
      hazlo: (app) => app.acc.desbloquear() },
  ] },

  // ------------------------------------------------------------------
  { id: "mas", titulo: "Extras", pasos: [
    { tipo: "señala", objetivo: '[data-tour="mapa"]', antes: (app) => { if (app.vistaActual !== "origen" && !hojaAbierta()) app.irA("origen", { foco: false }); }, masc: "lupa", titulo: "Mapa de alturas",
      texto: "Se mide al calibrar Z. Para repetirlo, está aquí en Origen." },
    { tipo: "señala", objetivo: '[data-tour="fina"]', masc: "lupa", titulo: "Calibración fina (opcional)",
      texto: "Corrige el giro si la placa quedó chueca." },
    { tipo: "señala", objetivo: '[data-tour="tutorial"]', titulo: "Cuando quieras",
      texto: "Aquí vuelves al tutorial, al manual y al examen." },
  ] },

  // ------------------------------------------------------------------
  { id: "fin", titulo: "Final", pasos: [
    { tipo: "info", masc: "celebra", titulo: "¡Lo lograste!", fin: true,
      texto: "Ya conoces los 6 pasos. Para tu certificado, responde el examen: 15 preguntas, apruebas con 80 %." },
  ] },
];
