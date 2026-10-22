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
const CURSO = "Basic CNC Course";
const MAQUINA = "Genmitsu Cubiko";

// { q, ok: respuesta correcta, no: distractores, por: por qué (se muestra al revisar), video?: id de web/videos/manos }
export const PREGUNTAS = [
  // ----- Con video: lo que se hace con las manos -----
  { video: "quitarTapa", q: "You took the cover off, as in the video. What does the machine do while it is off?",
    ok: "It moves and homes, but the spindle won’t turn on",
    no: ["Nothing until you put the cover back", "It works the same; the cover only stops dust", "It turns on the spindle, but at a lower speed"],
    por: "The cover presses a limit switch: without it you can jog and probe, but not mill." },
  { video: "homing", q: "In the video the machine homes. In what order?",
    ok: "First Z goes up; then X and Y together. Each axis touches twice, the second time slower",
    no: ["X, then Y, then Z, once each", "All three axes at once, a single time", "First Z goes down until it touches the board"],
    por: "Z goes up first to avoid crashing; the second, slow touch gives the exact position." },
  { video: "sujetador", q: "How is the board held to the bed?",
    ok: "With the two aluminum clamps, the lip on the edge, tightened with the 3 mm Allen key",
    no: ["With double-sided tape under the copper", "With the clamps touching the center of the board", "Just set it down: the bit won’t move it"],
    por: "The lip presses only the edge; firm, without forcing, so the board doesn’t move." },
  { video: "herramientas", q: "Look at the bits in the video. Which one cuts the board outline?",
    ok: "The corncob bit: a cylinder with diamonds and a flat tip",
    no: ["The V-bit", "The thin drill bit with a colored ring", "Any of the three"],
    por: "V-bit for traces, drill bit for holes, corncob bit for the outline." },
  { video: "cambiar", q: "How do you loosen the collet nut to change the bit?",
    ok: "With two 13 mm wrenches: one holds the collet by its flat sides and the other turns the nut",
    no: ["With a single wrench, turning the whole spindle", "With the 3 mm Allen key", "By hand, without wrenches"],
    por: "One wrench holds and the other turns; and as you loosen it, hold the bit so it doesn’t fall." },
  { video: "sonda", q: "Where does each end of the probe cable go?",
    ok: "Connector in “Leveling”, fork terminal under the clamp on the copper, and alligator clip on the bit",
    no: ["Alligator clip on the copper and fork terminal on the bit", "Connector in the USB port on the back", "Alligator clip on the collet nut"],
    por: "The circuit closes when the bit touches the copper: that’s why one end goes to each." },
  { video: "quitarCaiman", q: "The height map is done. What do you do with the probe before milling?",
    ok: "Remove the alligator clip, pull out the fork terminal and unplug the cable from “Leveling”",
    no: ["Leave it on: that way the app keeps correcting Z", "Only remove the alligator clip and leave the cable on the bed", "Disconnect it after all the jobs are done"],
    por: "Nothing from the probe should stay on the bed: the cable gets tangled and the clip spins with the bit." },
  // ----- Del recorrido -----
  { q: "You turn on the Cubiko and the app says it is locked. Why?",
    ok: "It doesn’t know where it is yet: until it homes it doesn’t know its position",
    no: ["Z must be probed before it can move", "It is in simulation and you need to connect the USB", "The board files haven’t been opened"],
    por: "At power-on it doesn’t know its position; homing finds the end stops and sets the machine origin." },
  { q: "What is the difference between the machine origin and the work zero?",
    ok: "Homing finds the origin with the end stops; you choose the work zero on the board",
    no: ["Homing finds the work zero; you choose the origin", "They are the same thing with two names", "The app calculates the work zero from the Gerber"],
    por: "Homing says where the machine is; you say where your board is." },
  { q: "In the black-and-white image, two traces look joined. What will happen?",
    ok: "They will come out joined on the board: the bit has no room to pass between them",
    no: ["The app separates them on its own when generating toolpaths", "It’s just a preview effect", "Doing the air test fixes it"],
    por: "The image is exactly what the app will mill." },
  { q: "The warning “the bit is wider than the design’s minimum clearance” appears. What fixes the cause?",
    ok: "Use a finer bit or space those traces further apart in KiCad",
    no: ["Raise the feed rate F", "Do more passes", "Reduce the cut depth"],
    por: "If the bit doesn’t fit between two traces, no speed or depth will fix it." },
  { q: "Why is a board milled in three jobs and not one?",
    ok: "Each job uses a different tool: fine bit, 1 mm drill bit and outline bit",
    no: ["So the spindle can rest between jobs", "Because GRBL doesn’t accept large files", "Because each job uses a different depth with the same bit"],
    por: "Traces, holes and outline: one job per tool." },
  { q: "You finished the traces and switched to the drill bit. What do you need to set again?",
    ok: "Z0, because the drill bit sticks out of the collet a different length",
    no: ["X0 Y0, because the drill bit is in another place", "Homing, because the position was lost", "Nothing: the app makes up for the drill bit’s length"],
    por: "All tools spin on the same axis (X and Y don’t change), but each one sticks out a different amount." },
  { q: "Why is X0 Y0 still valid after changing tools?",
    ok: "All tools spin on the same axis; only how far they stick out changes",
    no: ["Because the app homes again on its own", "Because the probe also measures X and Y", "It isn’t valid: it is set again for each job"],
    por: "The position in the plane doesn’t change; the tip height does." },
  { q: "How does the machine know the bit touched the copper when probing Z?",
    ok: "When they touch, bit and copper close the circuit between the alligator clip and the cable",
    no: ["The Z motor detects more load", "The 3D twin calculates the contact", "From the board size you set in KiCad"],
    por: "The probe is a circuit: alligator clip on the bit, cable on the copper." },
  { q: "You probed Z and start milling with the alligator clip still on. What is the risk?",
    ok: "The cable can get tangled with the spinning bit",
    no: ["None: the alligator clip only matters while probing", "The machine loses its homing", "The traces come out wider"],
    por: "That’s why the manual says to remove the clip after Z0." },
  { q: "What do you check with the air test?",
    ok: "That the whole path stays inside the board and doesn’t pass over clamps or screws",
    no: ["That the cut depth removes all the copper", "That the probe works", "That the bit is sharp"],
    por: "It’s the same job 5 mm higher: you see the path without cutting." },
  { q: "What can the air test NOT show you?",
    ok: "Whether the cut depth is enough to remove the copper",
    no: ["Whether the path goes off the board", "Whether the bit passes over a screw", "How long the job takes"],
    por: "It runs 5 mm higher: it never touches the copper, so it tells you nothing about depth." },
  { q: "You press STOP in the middle of a job. What happens to the position?",
    ok: "It is kept: the machine still knows where it is",
    no: ["It is lost and you must redo everything from Machine", "It returns to the machine origin on its own", "The work zero is erased"],
    por: "STOP halts everything instantly without losing the position; use it without fear." },
  { q: "On the Cubiko, when you move the Y axis, what physically moves?",
    ok: "The bed, forward and back",
    no: ["The spindle, toward the back", "The whole tower", "The bit, up and down"],
    por: "X moves the carriage side to side, Y moves the bed and Z raises and lowers the bit." },
  { q: "Where is X0 Y0 set in this workflow?",
    ok: "At the bottom-left corner of the board",
    no: ["At the center of the board", "At the top-right corner", "Where homing ended"],
    por: "All jobs are measured from there." },
  { q: "You jog the bit by hand to the board corner. Which step strategy is right?",
    ok: "10 mm to get close and 0.1 mm to fine-tune",
    no: ["0.1 mm all the way, to be safe", "10 mm all the way, to save time", "First lower Z with 10 mm, then move X and Y"],
    por: "Big steps far away, fine steps up close." },
  { q: "Why do you never lower Z in 10 mm steps near the board?",
    ok: "A single click can drive the bit into the board and break it",
    no: ["Because GRBL doesn’t accept large Z steps", "Because homing is lost", "Because the probe stops working"],
    por: "PCB bits are very fine and break easily." },
  { q: "Which KiCad files does the app need for a single-sided board?",
    ok: "The F.Cu Gerber, the Edge.Cuts one and the .drl",
    no: ["B.Cu, F.Silkscreen and the .drl", "F.Mask, F.Paste and Edge.Cuts", "Only the .kicad_pcb"],
    por: "Copper, outline and drills." },
  { q: "You open the whole KiCad folder, with lots of extra files. What does the app do?",
    ok: "It uses the useful ones and leaves out the rest",
    no: ["It shows an error and asks for only three files", "It mills one layer per file", "It combines all layers into one image"],
    por: "You can open the whole folder: what isn’t needed is ignored." },
  { q: "You exported the drill file with a different origin than the Gerbers. What will you notice?",
    ok: "The holes are offset from the pads",
    no: ["The holes come out bigger", "The outline comes out rotated", "Nothing: the app aligns them with homing"],
    por: "Drills and Gerbers must share an origin to line up." },
  { q: "In the black-and-white image of the board, what does white mean?",
    ok: "Copper that stays",
    no: ["Copper that is removed", "The holes", "The board outline"],
    por: "The bit works around the white." },
  { q: "In the parameters, what is F?",
    ok: "The feed rate: how fast the bit moves while cutting, in mm/min",
    no: ["The spindle RPM", "The depth of each pass", "The bit diameter"],
    por: "F is the feed rate, in millimeters per minute." },
  { q: "What is isolation milling?",
    ok: "Following the edge of each trace, removing the copper around it to isolate it",
    no: ["Covering the traces with an insulating layer", "Drilling along the traces", "Cutting the board into two layers"],
    por: "The traces end up separated from the rest of the copper by a channel." },
  { q: "When is the height map measured?",
    ok: "On every copper-clad board, when probing Z before the traces, with the alligator clip still on",
    no: ["Only if the board looks warped", "After milling, to check", "Before homing, so the machine knows where it is"],
    por: "The board is never perfectly flat: the probe measures a grid of points and the app adjusts Z in each area." },
  { q: "The traces came out wide and ate into each other. What is most likely?",
    ok: "The trace depth was changed: the V goes deeper and opens a wider groove",
    no: ["The air test was skipped", "The drill bit for the holes was too big", "The feed rate F was too slow"],
    por: "With a V-bit, the cut width grows with depth. The Cubiko defaults (0.1 mm) already work." },
  { q: "It beeps and the machine locks with “Limit switch hit”. What do you do?",
    ok: "Unlock, move the axis 1 mm away from the end and home; then check X0 Y0",
    no: ["Turn the machine off and on and keep milling", "Home without unlocking", "Keep going: the beep is only a warning"],
    por: "The bit reached the switch at the end of the axis; the position isn’t reliable until you home." },
  { q: "The board is slightly raised at one corner and you don’t use a height map. What do you expect?",
    ok: "Where the board is higher it cuts too deep, and where it is lower it doesn’t remove the copper",
    no: ["Everything comes out the same: Z0 was already probed", "Only the job time changes", "The machine stops with an alarm"],
    por: "Z0 is measured at one point; if the surface isn’t flat, the real depth changes." },
  { q: "What is the order of the 6 steps for your board?",
    ok: "Machine, Files, Toolpaths, X0 Y0, Z0, Mill",
    no: ["Files, Machine, X0 Y0, Toolpaths, Mill, Z0", "Machine, Z0, X0 Y0, Files, Toolpaths, Mill", "Files, Toolpaths, Mill, Machine, X0 Y0, Z0"],
    por: "It’s the same order as the manual, the tutorial and the steps on Home." },
  { q: "What is the spoilboard (MDF) under the board for?",
    ok: "So holes and outline can go through the board without damaging the bed",
    no: ["So the probe makes contact", "To absorb spindle vibration", "To raise the board so the bit can reach it"],
    por: "The drill bit and the outline bit come out the bottom of the board." },
  { q: "You got lost halfway through. Where do you see what’s next?",
    ok: "In Now: it shows the next step with its button",
    no: ["In the Console", "In the quick actions (+)", "In the 3D twin"],
    por: "Now always shows the next step." },
  { q: "What changes in Simulation mode compared to the real Cubiko?",
    ok: "The interface works the same, but the machine is emulated and nothing moves",
    no: ["Homing and zeros are skipped", "It only shows the 3D view, without buttons", "It mills faster to save time"],
    por: "It lets you practice the whole workflow with no risk." },
  { q: "The traces are done and Holes is next. What is the right sequence?",
    ok: "Put in the drill bit, probe Z again and then drill the holes",
    no: ["Home, set X0 Y0 again and mill", "Mill right away: Z is already probed", "Put in the drill bit and mill without probing"],
    por: "Every tool change needs Z again; X0 Y0 is kept." },
  { q: "When you check the board with the multimeter, what are you looking for?",
    ok: "Continuity in each net and no shorts between neighboring nets",
    no: ["That all traces have the same voltage", "That the copper is the same thickness across the board", "That the holes conduct between each other"],
    por: "What should be connected, connected; what shouldn’t, separate." },
];

const barajar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ======================================================================
// Ventana del examen
// ======================================================================
export function abrirExamen(app) {
  dialogo({ titulo: "Exam", clase: "dlg--angosta", contenido: (c, d) => portada(c, d, app) });
}

function portada(c, d, app) {
  const prev = ls.get("examenAprobado", null);
  d.titulo("Exam"); d.meta(""); d.atras(null); d.extra.innerHTML = "";
  c.innerHTML = `<div class="ex-portada">
    <img class="ex-masc" src="${app.MASC.lupa}" alt="" onerror="this.remove()">
    <div>
      <h3>${CURSO}</h3>
      <p>${N_PREGUNTAS} random questions on what you saw in the tutorial. You pass with ${Math.round(APRUEBA * 100)} % (${Math.ceil(N_PREGUNTAS * APRUEBA)} of ${N_PREGUNTAS}) and get your certificate.</p>
      <p class="muted">Think through each answer: some options sound right but aren’t. If you don’t pass, you can try again; each attempt brings different questions.</p>
    </div>
  </div>
  <div class="ex-pie">
    ${prev ? `<button type="button" class="btn-pill btn-pill--suave" data-cert>Download my certificate</button>` : ""}
    <span style="flex:1"></span>
    <button type="button" class="btn-pill btn-pill--main" data-empezar>Start</button>
  </div>`;
  c.querySelector("[data-empezar]").onclick = () => preguntar(c, d, app, barajar(PREGUNTAS).slice(0, N_PREGUNTAS).map((p) => ({ ...p, ops: barajar([p.ok, ...p.no]) })), 0, []);
  if (prev) c.querySelector("[data-cert]").onclick = () => certificado(c, d, app, prev);
  d.enfocar();
}

function preguntar(c, d, app, lista, i, resp) {
  const p = lista[i];
  d.titulo(`Question ${i + 1} of ${lista.length}`); d.meta("");
  d.atras(null);
  c.innerHTML = `<div class="ex-prog" aria-hidden="true">${lista.map((_, k) => `<i class="${k < i ? "on" : k === i ? "actual" : ""}"></i>`).join("")}</div>
    <div class="${p.video ? "ex-con-video" : ""}">${p.video ? `<div class="ex-video">${htmlVideo(p.video)}</div>` : ""}
    <fieldset class="ex-preg">
      <legend>${esc(p.q)}</legend>
      ${p.ops.map((o, k) => `<label class="ex-op"><input type="radio" name="ex-op" value="${k}"><span>${esc(o)}</span></label>`).join("")}
    </fieldset></div>
    <div class="ex-pie">
      <button type="button" class="btn-texto" data-salir>Exit exam</button>
      <span style="flex:1"></span>
      <button type="button" class="btn-pill btn-pill--main" data-sig disabled>${i + 1 < lista.length ? "Next" : "See result"}</button>
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
  d.titulo(aprobado ? "You passed!" : "Almost"); d.meta(`${bien} of ${n}`);
  if (aprobado) {
    const prev = ls.get("examenAprobado", null);
    // El certificado guarda el mejor intento
    if (!prev || bien > prev.aciertos) ls.set("examenAprobado", { aciertos: bien, total: n, fecha: new Date().toISOString(), folio: prev?.folio || folioNuevo(), nombre: prev?.nombre || "" });
  }
  c.innerHTML = `<div class="ex-portada">
      <img class="ex-masc" src="${aprobado ? app.MASC.celebra : app.MASC.explica}" alt="" onerror="this.remove()">
      <div>
        <p class="ex-cifra">${Math.round((bien / n) * 100)}<small>%</small></p>
        <p>${aprobado ? `Correct answers: ${bien} of ${n}. You can now download your certificate.` : `Correct answers: ${bien} of ${n}; you need ${Math.ceil(n * APRUEBA)}. Review what you missed and try again.`}</p>
      </div>
    </div>
    ${mal.length ? `<h4 class="ex-sub">${aprobado ? "To review" : "What you missed"}</h4>
      <ol class="ex-repaso">${mal.map((r) => `<li><b>${esc(r.p.q)}</b><span>Your answer: ${esc(r.elegida)}</span><span>${esc(r.p.por)}</span></li>`).join("")}</ol>` : ""}
    <div class="ex-pie">
      <button type="button" class="btn-pill btn-pill--suave" data-otra>${aprobado ? "Retake" : "Try again"}</button>
      <span style="flex:1"></span>
      ${aprobado ? `<button type="button" class="btn-pill btn-pill--main" data-cert>My certificate</button>` : ""}
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
  d.titulo("Your certificate"); d.meta("");
  d.atras(() => portada(c, d, app));
  c.innerHTML = `<label class="ex-nombre"><span>Your name, as you want it to appear</span>
      <input type="text" maxlength="60" autocomplete="name" value="${esc(dat.nombre || "")}" placeholder="Full name" data-nombre></label>
    <div class="ex-cert"><canvas data-lienzo></canvas></div>
    <div class="ex-pie">
      <span class="muted" data-aviso></span>
      <span style="flex:1"></span>
      <button type="button" class="btn-pill btn-pill--main" data-pdf disabled>Download PDF</button>
    </div>`;
  const inp = c.querySelector("[data-nombre]"), cv = c.querySelector("[data-lienzo]"), pdf = c.querySelector("[data-pdf]");
  const pintar = async () => {
    const nombre = inp.value.trim().replace(/\s+/g, " ");
    pdf.disabled = nombre.length < 3;
    await dibujarCertificado(cv, app, { ...dat, nombre: nombre || "Your name" });
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
    a.download = `CNC Certificate - ${nombre}.pdf`;
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
  g.fillStyle = GRIS; g.font = sans(600, 30); g.fillText("Tools · CNC", 305, 262);

  g.textAlign = "center";
  const cx = W / 2 - 120;
  g.fillStyle = COBRE; g.font = sans(800, 34);
  g.letterSpacing = "10px"; g.fillText("CERTIFICATE OF COMPLETION", cx, 470); g.letterSpacing = "0px";
  g.fillStyle = GRIS; g.font = sans(600, 40); g.fillText("Awarded to", cx, 590);

  // Nombre, ajustado al ancho
  g.fillStyle = TINTA;
  let px = 128; do { g.font = sans(800, px); px -= 4; } while (g.measureText(nombre).width > 1500 && px > 60);
  g.fillText(nombre, cx, 750);
  g.strokeStyle = TINTA; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 700, 800); g.lineTo(cx + 700, 800); g.stroke();

  g.fillStyle = TINTA; g.font = sans(600, 44);
  g.fillText(`for completing the ${CURSO} · ${MAQUINA}`, cx, 900);
  g.fillStyle = GRIS; g.font = sans(500, 34);
  g.fillText("PCB fabrication by isolation milling: machine, files,", cx, 975);
  g.fillText("toolpaths, X0 Y0 work zero, Z0 with the probe, and milling.", cx, 1025);

  // Datos al pie
  const f = new Date(fecha || Date.now());
  const fechaTxt = f.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
  const datos = [["Date", fechaTxt], ["Exam", `${aciertos} of ${total} · ${Math.round((aciertos / total) * 100)} %`], ["ID", folio]];
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
