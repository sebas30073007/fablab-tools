// diagnostico.js - prueba la conexión USB con la S1 y guarda todo lo que contesta.
//
// No usa s1.js a propósito: aquí se ve el puerto crudo, sin suponer nada del protocolo.
// Lo que se aprende (velocidad, si hay `ok`, formato de las respuestas, escala de S, búfer) se
// pasa a perfil-s1.js. Todo se registra con tiempo y se descarga como .json.

import { PERFIL } from "./perfil-s1.js";
import { bloqueada } from "./bloqueo.js";

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const reg = { inicio: new Date().toISOString(), navegador: navigator.userAgent, perfil: { baud: PERFIL.baud, sMax: PERFIL.sMax, rx: PERFIL.rx }, puerto: null, pruebas: [] };
let puerto = null, escritor = null, lector = null, buf = "", lineas = [], baud = null;
const t0 = performance.now();
const ms = () => Math.round(performance.now() - t0);

function log(txt, clase = "") {
  const d = document.createElement("div"); d.className = clase; d.textContent = txt;
  $("#log").appendChild(d); $("#log").scrollTop = $("#log").scrollHeight;
}
const dormir = (t) => new Promise((r) => setTimeout(r, t));

async function abrir(b) {
  await puerto.open({ baudRate: b });
  escritor = puerto.writable.getWriter();
  const dec = new TextDecoderStream();
  puerto.readable.pipeTo(dec.writable).catch(() => {});
  lector = dec.readable.getReader();
  (async () => {
    try {
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const l = buf.slice(0, i).replace(/\r$/, ""); buf = buf.slice(i + 1);
          if (l) { lineas.push({ t: ms(), l }); log(l, l === "ok" ? "rx ok" : "rx"); }
        }
      }
    } catch (_) {}
  })();
}
async function cerrar() {
  try { await lector?.cancel(); } catch (_) {}
  try { escritor?.releaseLock(); } catch (_) {}
  try { await puerto?.close(); } catch (_) {}
  lector = escritor = null; buf = "";
}
async function mandar(l) {
  const m = bloqueada(l);
  if (m) { log(`${l} ← no se manda: ${m}`, "err"); return; }
  log(l, "tx");
  await escritor.write(enc.encode(l + "\n"));
}

// Manda una línea y junta lo que llega en `espera` ms (o hasta el ok)
async function preguntar(l, espera = 1500) {
  const desde = lineas.length, t = ms();
  await mandar(l);
  const fin = performance.now() + espera;
  while (performance.now() < fin) {
    await dormir(40);
    if (lineas.slice(desde).some((x) => x.l === "ok" || x.l.startsWith("error"))) break;
  }
  const r = lineas.slice(desde);
  const p = { orden: l, baud, enviada: t, respuestas: r, ok: r.some((x) => x.l === "ok"), ms: r.length ? r[r.length - 1].t - t : null };
  reg.pruebas.push(p);
  return p;
}

// ---------------- 1. Velocidad ----------------
$("#b-puerto").onclick = async () => {
  if (!("serial" in navigator)) { log("Este navegador no tiene Web Serial: usa Chrome o Edge.", "sys err"); return; }
  try { puerto = await navigator.serial.requestPort(); } catch (_) { return; }
  const info = puerto.getInfo();
  reg.puerto = { usbVendorId: info.usbVendorId?.toString(16), usbProductId: info.usbProductId?.toString(16) };
  log(`Puerto USB ${reg.puerto.usbVendorId || "?"}:${reg.puerto.usbProductId || "?"}`, "sys");
  baud = null;
  for (const b of PERFIL.bauds) {
    try { await abrir(b); } catch (e) { log(`No se abrió a ${b}: ${e.message}`, "sys err"); await cerrar(); continue; }
    log(`— ${b} baud —`, "sys");
    await dormir(800);    // algunos controladores mandan algo al abrir
    const a = await preguntar("M2003"), c = await preguntar("M222");
    const legible = [...a.respuestas, ...c.respuestas].some((x) => /^[\x20-\x7e{}"]+$/.test(x.l));
    if (legible && !baud) baud = b;
    await cerrar();
    if (baud) break;
  }
  reg.baud = baud;
  $("#r-baud").textContent = baud ? `Contesta a ${baud} baud` : "No contestó a ninguna velocidad";
  if (baud) { await abrir(baud); ["#b-preguntas", "#b-cancelar"].forEach((s) => ($(s).disabled = false)); revisar(); }
};

// ---------------- 2. Preguntas ----------------
$("#b-preguntas").onclick = async () => {
  for (const q of ["M2003", "M2002", "M99", "M100", "M310", "M116", "M222", "M303", "M105", "M27", "M223", "M15", "M340", "M7", "M2008 A1", "M25", "M345"]) await preguntar(q);
  // Una línea de G-code inofensiva: ¿contesta ok?
  await preguntar("G90");
  log("Preguntas terminadas.", "sys");
};

// ---------------- 3. Movimiento ----------------
function revisar() {
  $("#b-mover").disabled = !baud || !$("#c-mov").checked;
  $("#b-cuadro").disabled = !baud || ![...document.querySelectorAll("[data-c4]")].every((c) => c.checked);
}
$("#c-mov").onchange = revisar;
document.querySelectorAll("[data-c4]").forEach((c) => (c.onchange = revisar));

async function hastaQuieta(max = 60000) {
  const fin = performance.now() + max;
  let antes = null;
  while (performance.now() < fin) {
    await dormir(500);
    const e = await preguntar("M222", 1000), p = await preguntar("M303", 1000);
    const pos = p.respuestas.map((x) => x.l).find((l) => /X/.test(l));
    const est = e.respuestas.map((x) => x.l).find((l) => /^M222/.test(l));
    if (pos && pos === antes && (!est || /S(1|3|19)\b/.test(est))) return true;
    antes = pos;
  }
  return false;
}

$("#b-mover").onclick = async () => {
  await preguntar("M111 S3", 30000);
  await hastaQuieta();
  for (const l of PERFIL.mover(50, 50, 3000)) await preguntar(l);
  await hastaQuieta();
  log("Movimiento terminado: ¿quedó el cabezal a 50 mm de la esquina de atrás a la izquierda?", "sys");
};

// ---------------- 4. Cuadrado ----------------
$("#b-cuadro").onclick = async () => {
  const prog = [...PERFIL.encabezado({ ancho: 40, alto: 40 }), "M3", "M15 S0", "G0 X20 Y20 S0", "G1 X40 Y20 S50 F1200", "G1 X40 Y40", "G1 X20 Y40", "G1 X20 Y20", "M5", ...PERFIL.pie()];
  const t = ms();
  for (const l of prog) await preguntar(l, 5000);
  await hastaQuieta();
  reg.cuadrado = { ms: ms() - t, lineas: prog.length };
  log("Cuadrado terminado: ¿se ve una marca tenue de 20 × 20 mm? Anótalo en el registro.", "sys");
};
$("#b-cancelar").onclick = () => mandar(PERFIL.cancelar);

// ---------------- Registro ----------------
$("#b-bajar").onclick = () => {
  reg.fin = new Date().toISOString();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(reg, null, 1)], { type: "application/json" }));
  a.download = `diagnostico-s1-${reg.inicio.slice(0, 10)}.json`; a.click();
};
log("Conecta la S1 y empieza por el paso 1.", "sys");
