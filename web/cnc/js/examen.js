// examen.js - el examen del Curso básico de CNC y su certificado.
//
// 39 preguntas sobre lo que enseña el recorrido guiado (7 con un video de las manos: lo que se hace con la máquina); cada intento toma 15 al azar y en
// orden aleatorio (también las opciones). Se aprueba con 80 % (12 de 15) y se puede repetir
// sin límite. Al aprobar, el estudiante escribe su nombre y descarga el certificado en PDF.
//
// El PDF se arma aquí mismo, sin librerías: el certificado se dibuja en un canvas, se exporta
// como JPEG y se mete en una página A4 horizontal (objeto de imagen DCTDecode).

import { esc, dialogo, ls } from "./ui.js";
import { htmlVideo } from "./videos.js";

const N_PREGUNTAS = 15, APRUEBA = 0.8;
const CURSO = "Curso básico de CNC";
const MAQUINA = "Genmitsu Cubiko";

// { q, ok: respuesta correcta, no: distractores, por: por qué (se muestra al revisar), video?: id de web/videos/manos }
export const PREGUNTAS = [
  // ----- Con video: lo que se hace con las manos -----
  { video: "quitarTapa", q: "Quitaste la tapa, como en el video. ¿Qué hace la máquina mientras está quitada?",
    ok: "Se mueve y hace homing, pero el husillo no enciende",
    no: ["No hace nada hasta que pongas la tapa", "Funciona igual, la tapa solo detiene el polvo", "Enciende el husillo pero a menor velocidad"],
    por: "La tapa pisa un final de carrera: sin ella se puede mover y calibrar, pero no fresar." },
  { video: "homing", q: "En el video la máquina hace homing. ¿En qué orden?",
    ok: "Primero Z hacia arriba; luego X y Y juntos. Cada eje toca dos veces, la segunda más despacio",
    no: ["X, luego Y, luego Z, una vez cada uno", "Los tres ejes a la vez, una sola vez", "Primero baja Z hasta tocar la placa"],
    por: "Z sube primero para no chocar; el segundo toque, lento, da la posición exacta." },
  { video: "sujetador", q: "¿Cómo se sujeta la placa a la cama?",
    ok: "Con los dos sujetadores de aluminio, la lengüeta sobre la orilla, apretados con la llave Allen de 3 mm",
    no: ["Con cinta doble cara bajo el cobre", "Con los sujetadores tocando el centro de la placa", "Basta con apoyarla: la fresa no la mueve"],
    por: "La lengüeta pisa solo la orilla; firme, sin forzar, para que la placa no se mueva." },
  { video: "herramientas", q: "Fíjate en las puntas del video. ¿Cuál corta el contorno de la placa?",
    ok: "La de maíz: cilindro con rombos y punta plana",
    no: ["La punta en V", "La broca delgada con anillo de color", "Cualquiera de las tres"],
    por: "V para pistas, broca para hoyos, maíz para el contorno." },
  { video: "cambiar", q: "¿Cómo se afloja la tuerca de la pinza para cambiar la fresa?",
    ok: "Con dos llaves de 13 mm: una sostiene la pinza por sus caras planas y la otra gira la tuerca",
    no: ["Con una sola llave, girando todo el husillo", "Con la llave Allen de 3 mm", "A mano, sin llaves"],
    por: "Una llave sostiene y la otra gira; y al aflojar, sostén la fresa para que no caiga." },
  { video: "sonda", q: "¿Dónde va cada punta del cable de la sonda?",
    ok: "Conector en «Leveling», horquilla bajo el sujetador que pisa el cobre y caimán en la fresa",
    no: ["Caimán en el cobre y horquilla en la fresa", "Conector en el USB de atrás", "Caimán en la tuerca de la pinza"],
    por: "El circuito se cierra cuando la fresa toca el cobre: por eso una punta va a cada uno." },
  { video: "quitarCaiman", q: "Terminó el mapa de alturas. ¿Qué haces con la sonda antes de fresar?",
    ok: "Quitar el caimán, sacar la horquilla y desconectar el cable de «Leveling»",
    no: ["Dejarla puesta: así la app sigue corrigiendo Z", "Solo quitar el caimán y dejar el cable sobre la cama", "Desconectarla hasta terminar todos los trabajos"],
    por: "Nada de la sonda debe quedar sobre la cama: el cable se enreda y el caimán gira con la fresa." },
  // ----- Del recorrido -----
  { q: "Enciendes la Cubiko y la app dice que está bloqueada. ¿Por qué?",
    ok: "Todavía no sabe dónde está: hasta hacer homing no conoce su posición",
    no: ["Falta calibrar Z antes de poder moverla", "Está en simulación y hay que conectar el USB", "Falta abrir los archivos de la placa"],
    por: "Al encender no conoce su posición; el homing busca los topes y fija el origen de máquina." },
  { q: "¿Cuál es la diferencia entre el origen de máquina y el cero de trabajo?",
    ok: "El origen lo encuentra el homing con los topes; el cero de trabajo lo eliges tú sobre la placa",
    no: ["El cero de trabajo lo encuentra el homing; el origen lo eliges tú", "Son lo mismo con dos nombres distintos", "El cero de trabajo lo calcula la app a partir del Gerber"],
    por: "El homing dice dónde está la máquina; tú dices dónde está tu placa." },
  { q: "En la imagen en blanco y negro, dos pistas se ven unidas. ¿Qué va a pasar?",
    ok: "Saldrán unidas en la placa: la fresa no tiene por dónde pasar entre ellas",
    no: ["La app las separa sola al generar las trayectorias", "Solo es un efecto de la vista previa", "Se corrige haciendo la prueba en aire"],
    por: "La imagen es exactamente lo que la app va a fresar." },
  { q: "Aparece el aviso «la fresa es más ancha que la separación mínima del diseño». ¿Qué ataca la causa?",
    ok: "Usar una fresa más fina o separar más esas pistas en KiCad",
    no: ["Subir el avance F", "Hacer más pasadas", "Reducir la profundidad de corte"],
    por: "Si la fresa no cabe entre dos pistas, ninguna velocidad o profundidad lo arregla." },
  { q: "¿Por qué una placa se fresa en tres trabajos y no en uno?",
    ok: "Cada trabajo usa otra herramienta: fresa fina, broca de 1 mm y fresa de contorno",
    no: ["Para que el husillo descanse entre trabajos", "Porque GRBL no acepta archivos grandes", "Porque cada trabajo usa una profundidad distinta con la misma fresa"],
    por: "Pistas, hoyos y contorno: un trabajo por herramienta." },
  { q: "Terminaste las pistas y cambiaste a la broca. ¿Qué tienes que volver a calibrar?",
    ok: "Z0, porque la broca sobresale distinto de la pinza",
    no: ["X0 Y0, porque la broca está en otro lugar", "El homing, porque se perdió la posición", "Nada: la app compensa la longitud de la broca"],
    por: "Todas las herramientas giran en el mismo eje (X y Y no cambian), pero cada una sobresale distinto." },
  { q: "¿Por qué X0 Y0 sigue siendo válido después de cambiar de herramienta?",
    ok: "Todas las herramientas giran en el mismo eje; solo cambia cuánto sobresalen",
    no: ["Porque la app vuelve a hacer homing sola", "Porque la sonda también mide X y Y", "No es válido: se fija de nuevo en cada trabajo"],
    por: "La posición en el plano no cambia; la altura de la punta sí." },
  { q: "¿Cómo sabe la máquina que la fresa tocó el cobre al calibrar Z?",
    ok: "Al tocarse, fresa y cobre cierran el circuito entre el caimán y el cable",
    no: ["El motor de Z detecta más esfuerzo", "El gemelo 3D calcula el contacto", "Por la medida de la placa que pusiste en KiCad"],
    por: "La sonda es un circuito: caimán en la fresa, cable en el cobre." },
  { q: "Calibraste Z y empiezas a fresar con el caimán todavía puesto. ¿Cuál es el riesgo?",
    ok: "El cable se puede enredar con la fresa que gira",
    no: ["Ninguno: el caimán solo actúa durante la calibración", "La máquina pierde el homing", "Las pistas salen más anchas"],
    por: "Por eso el manual pide quitar el caimán al terminar Z0." },
  { q: "¿Qué compruebas con la prueba en aire?",
    ok: "Que el recorrido completo quede dentro de la placa y no pase sobre pinzas ni tornillos",
    no: ["Que la profundidad de corte quite todo el cobre", "Que la sonda funcione", "Que la fresa esté bien afilada"],
    por: "Es el mismo trabajo 5 mm arriba: se ve el recorrido sin cortar." },
  { q: "¿Qué NO puede mostrarte la prueba en aire?",
    ok: "Si la profundidad de corte alcanza para quitar el cobre",
    no: ["Si el recorrido se sale de la placa", "Si la fresa pasa sobre un tornillo", "Cuánto tarda el trabajo"],
    por: "Va 5 mm arriba: nunca toca el cobre, así que no dice nada de la profundidad." },
  { q: "Pulsas PARO a la mitad de un trabajo. ¿Qué pasa con la posición?",
    ok: "Se conserva: la máquina sigue sabiendo dónde está",
    no: ["Se pierde y hay que repetir todo desde Máquina", "Vuelve sola al origen de máquina", "Se borra el cero de trabajo"],
    por: "PARO detiene todo al instante sin perder la posición; úsalo sin miedo." },
  { q: "En la Cubiko, al mover el eje Y, ¿qué se mueve físicamente?",
    ok: "La cama, hacia adelante y hacia atrás",
    no: ["El husillo, hacia el fondo", "La torre completa", "La fresa, hacia arriba y abajo"],
    por: "X mueve el carro a los lados, Y mueve la cama y Z sube y baja la fresa." },
  { q: "¿Dónde se fija X0 Y0 en este flujo?",
    ok: "En la esquina inferior izquierda de la placa",
    no: ["En el centro de la placa", "En la esquina superior derecha", "Donde terminó el homing"],
    por: "Desde ahí se miden todos los trabajos." },
  { q: "Llevas la fresa a mano hasta la esquina de la placa. ¿Qué estrategia de paso es la correcta?",
    ok: "10 mm para acercarte y 0.1 mm para afinar",
    no: ["0.1 mm todo el camino, para no fallar", "10 mm todo el camino, para ahorrar tiempo", "Primero bajar Z con 10 mm y luego mover X y Y"],
    por: "Pasos grandes lejos, pasos finos cerca." },
  { q: "¿Por qué nunca se baja Z con paso de 10 mm cerca de la placa?",
    ok: "Un solo toque puede clavar la fresa en la placa y romperla",
    no: ["Porque GRBL no acepta pasos grandes en Z", "Porque se pierde el homing", "Porque la sonda deja de funcionar"],
    por: "Las fresas de PCB son muy finas y se rompen fácil." },
  { q: "¿Qué archivos de KiCad necesita la app para una placa de una cara?",
    ok: "El Gerber de F.Cu, el de Edge.Cuts y el .drl",
    no: ["B.Cu, F.Silkscreen y el .drl", "F.Mask, F.Paste y Edge.Cuts", "Solo el .kicad_pcb"],
    por: "Cobre, contorno y taladros." },
  { q: "Abres la carpeta de KiCad completa, con muchos archivos de más. ¿Qué hace la app?",
    ok: "Usa los que sirven y deja fuera el resto",
    no: ["Marca error y pide solo tres archivos", "Fresa una capa por cada archivo", "Combina todas las capas en una imagen"],
    por: "Puedes abrir la carpeta completa: lo que no sirve se ignora." },
  { q: "Exportaste los taladros con un origen distinto al de los Gerber. ¿Qué vas a notar?",
    ok: "Los hoyos quedan desplazados respecto a los pads",
    no: ["Los hoyos salen más grandes", "El contorno sale girado", "Nada: la app los alinea con el homing"],
    por: "Taladros y Gerber deben compartir origen para coincidir." },
  { q: "En la imagen en blanco y negro de la placa, ¿qué significa lo blanco?",
    ok: "Cobre que se queda",
    no: ["Cobre que se quita", "Los hoyos", "El contorno de la placa"],
    por: "La fresa trabaja alrededor de lo blanco." },
  { q: "En los parámetros, ¿qué es F?",
    ok: "El avance: qué tan rápido se desplaza la fresa al cortar, en mm/min",
    no: ["Las revoluciones del husillo", "La profundidad de cada pasada", "El diámetro de la fresa"],
    por: "F es el avance, en milímetros por minuto." },
  { q: "¿Qué es el fresado de aislamiento?",
    ok: "Recorrer el borde de cada pista quitando el cobre de alrededor para aislarla",
    no: ["Cubrir las pistas con una capa aislante", "Taladrar a lo largo de las pistas", "Cortar la placa en dos capas"],
    por: "Las pistas quedan separadas del resto del cobre por un canal." },
  { q: "¿Cuándo se mide el mapa de alturas?",
    ok: "En cada placa de cobre, al calibrar Z antes de las pistas, con el caimán todavía puesto",
    no: ["Solo si la placa se ve chueca", "Después de fresar, para revisar", "Antes del homing, para que la máquina sepa dónde está"],
    por: "La placa nunca está del todo plana: la sonda mide una rejilla de puntos y la app ajusta Z en cada zona." },
  { q: "Las pistas salieron anchas y se comieron unas a otras. ¿Qué es lo más probable?",
    ok: "Se cambió la profundidad de pistas: la V entra más y abre un surco más ancho",
    no: ["Faltó la prueba en aire", "La broca de los hoyos era muy grande", "El avance F era muy lento"],
    por: "Con la fresa en V, el ancho del corte crece con la profundidad. Los valores de la Cubiko (0.1 mm) ya funcionan." },
  { q: "Suena un pitido y la máquina se bloquea con «Final de carrera tocado». ¿Qué haces?",
    ok: "Desbloquear, alejar el eje 1 mm del extremo y hacer homing; luego revisar X0 Y0",
    no: ["Apagar y prender la máquina y seguir fresando", "Hacer homing sin desbloquear", "Seguir: el pitido solo avisa"],
    por: "La fresa llegó al interruptor del extremo del eje; la posición ya no es confiable hasta el homing." },
  { q: "La placa quedó un poco levantada en una esquina y no usas mapa de alturas. ¿Qué esperas?",
    ok: "Donde la placa está más alta corta de más, y donde está más baja no llega a quitar el cobre",
    no: ["Todo sale igual: Z0 ya se calibró", "Solo cambia el tiempo del trabajo", "La máquina se detiene con una alarma"],
    por: "Z0 se mide en un punto; si la superficie no es plana, la profundidad real cambia." },
  { q: "¿Cuál es el orden de los 6 pasos de tu placa?",
    ok: "Máquina, Archivos, Trayectorias, X0 Y0, Z0, Fresar",
    no: ["Archivos, Máquina, X0 Y0, Trayectorias, Fresar, Z0", "Máquina, Z0, X0 Y0, Archivos, Trayectorias, Fresar", "Archivos, Trayectorias, Fresar, Máquina, X0 Y0, Z0"],
    por: "Es el mismo orden del manual, del tutorial y de los pasos en Inicio." },
  { q: "¿Para qué va un MDF de sacrificio debajo de la placa?",
    ok: "Para que hoyos y contorno atraviesen la placa sin dañar la cama",
    no: ["Para que la sonda haga contacto", "Para absorber la vibración del husillo", "Para subir la placa y que la fresa alcance"],
    por: "La broca y la fresa de contorno salen por abajo de la placa." },
  { q: "Te perdiste a la mitad del proceso. ¿Dónde ves qué sigue?",
    ok: "En Ahora: dice el siguiente paso y trae su botón",
    no: ["En la Consola", "En las acciones rápidas (+)", "En el gemelo 3D"],
    por: "Ahora siempre trae el siguiente paso." },
  { q: "¿Qué cambia en el modo Simulación respecto a la Cubiko real?",
    ok: "La interfaz funciona igual, pero la máquina es emulada y nada se mueve",
    no: ["Se saltan el homing y los ceros", "Solo muestra el 3D, sin botones", "Fresa más rápido para ahorrar tiempo"],
    por: "Sirve para practicar el flujo completo sin riesgo." },
  { q: "Terminaron las pistas y sigue Hoyos. ¿Cuál es la secuencia correcta?",
    ok: "Poner la broca, calibrar Z de nuevo y luego fresar los hoyos",
    no: ["Hacer homing, fijar X0 Y0 de nuevo y fresar", "Fresar directo: Z ya está calibrado", "Poner la broca y fresar sin calibrar"],
    por: "Cada cambio de herramienta pide Z de nuevo; X0 Y0 se conserva." },
  { q: "Al revisar la placa con el multímetro, ¿qué buscas?",
    ok: "Continuidad en cada red y que no haya cortos entre redes vecinas",
    no: ["Que todas las pistas tengan el mismo voltaje", "Que el cobre tenga el mismo grosor en toda la placa", "Que los hoyos conduzcan entre sí"],
    por: "Lo que debe estar unido, unido; lo que no, separado." },
];

const barajar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ======================================================================
// Ventana del examen
// ======================================================================
export function abrirExamen(app) {
  dialogo({ titulo: "Examen", clase: "dlg--angosta", contenido: (c, d) => portada(c, d, app) });
}

function portada(c, d, app) {
  const prev = ls.get("examenAprobado", null);
  d.titulo("Examen"); d.meta(""); d.atras(null); d.extra.innerHTML = "";
  c.innerHTML = `<div class="ex-portada">
    <img class="ex-masc" src="${app.MASC.lupa}" alt="" onerror="this.remove()">
    <div>
      <h3>${CURSO}</h3>
      <p>${N_PREGUNTAS} preguntas al azar sobre lo que viste en el tutorial. Apruebas con ${Math.round(APRUEBA * 100)} % (${Math.ceil(N_PREGUNTAS * APRUEBA)} de ${N_PREGUNTAS}) y obtienes tu certificado.</p>
      <p class="muted">Piensa cada respuesta: hay opciones que suenan bien pero no lo son. Si no apruebas, puedes intentarlo otra vez; cada intento trae otras preguntas.</p>
    </div>
  </div>
  <div class="ex-pie">
    ${prev ? `<button type="button" class="btn-pill btn-pill--suave" data-cert>Descargar mi certificado</button>` : ""}
    <span style="flex:1"></span>
    <button type="button" class="btn-pill btn-pill--main" data-empezar>Empezar</button>
  </div>`;
  c.querySelector("[data-empezar]").onclick = () => preguntar(c, d, app, barajar(PREGUNTAS).slice(0, N_PREGUNTAS).map((p) => ({ ...p, ops: barajar([p.ok, ...p.no]) })), 0, []);
  if (prev) c.querySelector("[data-cert]").onclick = () => certificado(c, d, app, prev);
  d.enfocar();
}

function preguntar(c, d, app, lista, i, resp) {
  const p = lista[i];
  d.titulo(`Pregunta ${i + 1} de ${lista.length}`); d.meta("");
  d.atras(null);
  c.innerHTML = `<div class="ex-prog" aria-hidden="true">${lista.map((_, k) => `<i class="${k < i ? "on" : k === i ? "actual" : ""}"></i>`).join("")}</div>
    <div class="${p.video ? "ex-con-video" : ""}">${p.video ? `<div class="ex-video">${htmlVideo(p.video)}</div>` : ""}
    <fieldset class="ex-preg">
      <legend>${esc(p.q)}</legend>
      ${p.ops.map((o, k) => `<label class="ex-op"><input type="radio" name="ex-op" value="${k}"><span>${esc(o)}</span></label>`).join("")}
    </fieldset></div>
    <div class="ex-pie">
      <button type="button" class="btn-texto" data-salir>Salir del examen</button>
      <span style="flex:1"></span>
      <button type="button" class="btn-pill btn-pill--main" data-sig disabled>${i + 1 < lista.length ? "Siguiente" : "Ver resultado"}</button>
    </div>`;
  const sig = c.querySelector("[data-sig]");
  c.querySelectorAll('input[name="ex-op"]').forEach((r) => (r.onchange = () => (sig.disabled = false)));
  c.querySelector("[data-salir]").onclick = () => portada(c, d, app);
  sig.onclick = () => {
    const k = +c.querySelector('input[name="ex-op"]:checked').value;
    const r = resp.concat([{ p, elegida: p.ops[k] }]);
    if (i + 1 < lista.length) preguntar(c, d, app, lista, i + 1, r);
    else resultado(c, d, app, r);
  };
  c.scrollTop = 0;
  d.enfocar();
}

function resultado(c, d, app, resp) {
  const bien = resp.filter((r) => r.elegida === r.p.ok).length, n = resp.length;
  const aprobado = bien / n >= APRUEBA;
  const mal = resp.filter((r) => r.elegida !== r.p.ok);
  d.titulo(aprobado ? "¡Aprobaste!" : "Casi"); d.meta(`${bien} de ${n}`);
  if (aprobado) {
    const prev = ls.get("examenAprobado", null);
    // El certificado guarda el mejor intento
    if (!prev || bien > prev.aciertos) ls.set("examenAprobado", { aciertos: bien, total: n, fecha: new Date().toISOString(), folio: prev?.folio || folioNuevo(), nombre: prev?.nombre || "" });
  }
  c.innerHTML = `<div class="ex-portada">
      <img class="ex-masc" src="${aprobado ? app.MASC.celebra : app.MASC.explica}" alt="" onerror="this.remove()">
      <div>
        <p class="ex-cifra">${Math.round((bien / n) * 100)}<small>%</small></p>
        <p>${aprobado ? `Respondiste bien ${bien} de ${n}. Ya puedes descargar tu certificado.` : `Respondiste bien ${bien} de ${n}; necesitas ${Math.ceil(n * APRUEBA)}. Repasa lo que falló e inténtalo otra vez.`}</p>
      </div>
    </div>
    ${mal.length ? `<h4 class="ex-sub">${aprobado ? "Para repasar" : "Lo que falló"}</h4>
      <ol class="ex-repaso">${mal.map((r) => `<li><b>${esc(r.p.q)}</b><span>Tu respuesta: ${esc(r.elegida)}</span><span>${esc(r.p.por)}</span></li>`).join("")}</ol>` : ""}
    <div class="ex-pie">
      <button type="button" class="btn-pill btn-pill--suave" data-otra>${aprobado ? "Repetir" : "Intentar otra vez"}</button>
      <span style="flex:1"></span>
      ${aprobado ? `<button type="button" class="btn-pill btn-pill--main" data-cert>Mi certificado</button>` : ""}
    </div>`;
  c.querySelector("[data-otra]").onclick = () => portada(c, d, app);
  if (aprobado) c.querySelector("[data-cert]").onclick = () => certificado(c, d, app, ls.get("examenAprobado", null));
  c.scrollTop = 0;
  d.enfocar();
}

const folioNuevo = () => "CNC-" + new Date().getFullYear() + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();

// ======================================================================
// Certificado
// ======================================================================
function certificado(c, d, app, dat) {
  d.titulo("Tu certificado"); d.meta("");
  d.atras(() => portada(c, d, app));
  c.innerHTML = `<label class="ex-nombre"><span>Tu nombre, como quieres que aparezca</span>
      <input type="text" maxlength="60" autocomplete="name" value="${esc(dat.nombre || "")}" placeholder="Nombre y apellidos" data-nombre></label>
    <div class="ex-cert"><canvas data-lienzo></canvas></div>
    <div class="ex-pie">
      <span class="muted" data-aviso></span>
      <span style="flex:1"></span>
      <button type="button" class="btn-pill btn-pill--main" data-pdf disabled>Descargar PDF</button>
    </div>`;
  const inp = c.querySelector("[data-nombre]"), cv = c.querySelector("[data-lienzo]"), pdf = c.querySelector("[data-pdf]");
  const pintar = async () => {
    const nombre = inp.value.trim().replace(/\s+/g, " ");
    pdf.disabled = nombre.length < 3;
    await dibujarCertificado(cv, app, { ...dat, nombre: nombre || "Tu nombre" });
  };
  inp.oninput = pintar;
  pdf.onclick = async () => {
    const nombre = inp.value.trim().replace(/\s+/g, " ");
    ls.set("examenAprobado", { ...ls.get("examenAprobado", dat), nombre });
    pdf.disabled = true;
    await dibujarCertificado(cv, app, { ...dat, nombre });
    const blob = await new Promise((r) => cv.toBlob(r, "image/jpeg", 0.92));
    const doc = pdfDeJPEG(new Uint8Array(await blob.arrayBuffer()), cv.width, cv.height);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([doc], { type: "application/pdf" }));
    a.download = `Certificado CNC - ${nombre}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    pdf.disabled = false;
  };
  pintar();
  inp.focus();
}

const cargar = (src) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => r(null); im.src = src; });

// A4 horizontal a 200 ppp: 2339 × 1654
async function dibujarCertificado(cv, app, { nombre, aciertos, total, fecha, folio }) {
  const W = 2339, H = 1654;
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  try { await Promise.all(["800 120px Manrope", "600 40px Manrope", "500 30px 'IBM Plex Mono'"].map((f) => document.fonts.load(f))); } catch (_) {}
  const [simbolo, masc] = await Promise.all([cargar("../img/simbolo.png"), cargar(app.MASC.celebra)]);
  const sans = (peso, px) => `${peso} ${px}px Manrope, system-ui, sans-serif`;
  const mono = (px) => `500 ${px}px 'IBM Plex Mono', ui-monospace, monospace`;
  const COBRE = "#C8572B", TINTA = "#111317", GRIS = "#6B6F76";

  // Papel y marco
  g.fillStyle = "#FBFAF7"; g.fillRect(0, 0, W, H);
  g.strokeStyle = COBRE; g.lineWidth = 6; g.strokeRect(70, 70, W - 140, H - 140);
  g.strokeStyle = "rgba(200,87,43,.35)"; g.lineWidth = 2; g.strokeRect(96, 96, W - 192, H - 192);
  // Pistas de PCB de adorno, en las esquinas
  g.strokeStyle = "rgba(200,87,43,.22)"; g.lineWidth = 7; g.lineCap = "round"; g.lineJoin = "round";
  const pista = (pts, pad) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); if (pad) { const [x, y] = pts[pts.length - 1]; g.beginPath(); g.arc(x, y, 16, 0, 7); g.stroke(); } };
  for (const s of [1, -1]) {
    const X = (x) => (s === 1 ? x : W - x), Y = (y) => (s === 1 ? y : H - y);
    pista([[X(96), Y(260)], [X(200), Y(260)], [X(260), Y(200)], [X(420), Y(200)]], true);
    pista([[X(96), Y(330)], [X(240), Y(330)], [X(300), Y(270)], [X(330), Y(270)]], true);
    pista([[X(260), Y(96)], [X(260), Y(150)], [X(320), Y(150)]], true);
  }

  // Encabezado
  if (simbolo) g.drawImage(simbolo, 170, 165, 110, 110);
  g.fillStyle = TINTA; g.textBaseline = "alphabetic"; g.textAlign = "left";
  g.font = sans(800, 44); g.fillText("Fab Lab", 305, 218);
  g.fillStyle = GRIS; g.font = sans(600, 30); g.fillText("Herramientas · CNC", 305, 262);

  g.textAlign = "center";
  const cx = W / 2 - 120;
  g.fillStyle = COBRE; g.font = sans(800, 34);
  g.letterSpacing = "10px"; g.fillText("CERTIFICADO DE FINALIZACIÓN", cx, 470); g.letterSpacing = "0px";
  g.fillStyle = GRIS; g.font = sans(600, 40); g.fillText("Se otorga a", cx, 590);

  // Nombre, ajustado al ancho
  g.fillStyle = TINTA;
  let px = 128; do { g.font = sans(800, px); px -= 4; } while (g.measureText(nombre).width > 1500 && px > 60);
  g.fillText(nombre, cx, 750);
  g.strokeStyle = TINTA; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 700, 800); g.lineTo(cx + 700, 800); g.stroke();

  g.fillStyle = TINTA; g.font = sans(600, 44);
  g.fillText(`por completar el ${CURSO} · ${MAQUINA}`, cx, 900);
  g.fillStyle = GRIS; g.font = sans(500, 34);
  g.fillText("Fabricación de PCB por fresado de aislamiento: máquina, archivos,", cx, 975);
  g.fillText("trayectorias, cero de trabajo X0 Y0, Z0 con sonda y fresado.", cx, 1025);

  // Datos al pie
  const f = new Date(fecha || Date.now());
  const fechaTxt = f.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
  const datos = [["Fecha", fechaTxt], ["Examen", `${aciertos} de ${total} · ${Math.round((aciertos / total) * 100)} %`], ["Folio", folio]];
  datos.forEach(([k, v], i) => {
    const x = cx - 560 + i * 560;
    g.fillStyle = GRIS; g.font = sans(600, 28); g.fillText(k.toUpperCase(), x, 1250);
    g.fillStyle = TINTA; g.font = i === 2 ? mono(38) : sans(700, 40); g.fillText(v, x, 1310);
  });
  g.strokeStyle = "rgba(17,19,23,.15)"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - 840, 1190); g.lineTo(cx + 840, 1190); g.stroke();

  // Fresa celebrando, abajo a la derecha
  if (masc) { const h = 560, w = (masc.width / masc.height) * h; g.drawImage(masc, W - 150 - w, H - 120 - h, w, h); }
}

// Un PDF de una página A4 horizontal con la imagen JPEG a página completa
function pdfDeJPEG(jpg, w, h) {
  const enc = new TextEncoder(), partes = [], offs = [];
  let largo = 0;
  const pon = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; partes.push(b); largo += b.length; };
  const obj = (n, cuerpo) => { offs[n] = largo; pon(`${n} 0 obj\n`); cuerpo(); pon("\nendobj\n"); };
  const PW = 842, PH = 595, cont = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  pon("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, () => pon("<< /Type /Catalog /Pages 2 0 R >>"));
  obj(2, () => pon("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  obj(3, () => pon(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { pon(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); pon(jpg); pon("\nendstream"); });
  obj(5, () => pon(`<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`));
  const xref = largo;
  pon(`xref\n0 6\n0000000000 65535 f \n${offs.slice(1).map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`);
  pon(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(largo); let p = 0;
  for (const b of partes) { out.set(b, p); p += b.length; }
  return out;
}
