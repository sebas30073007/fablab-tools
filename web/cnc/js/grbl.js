// grbl.js - enlace con GRBL 1.1 por Web Serial (o con el emulador).
//
// Protocolo (docs/grbl.md):
//   · líneas ASCII terminadas en \n a 115200 baud; cada línea responde `ok` o `error:n`
//   · streaming por conteo de caracteres: se mandan líneas mientras quepan en
//     el búfer de recepción de 128 bytes de GRBL (dejamos 127)
//   · comandos en tiempo real, un byte, sin \n:  ?  estado · !  pausa · ~  reanudar
//     0x18 reset · 0x85 cancelar jog
//   · el estado llega como <Idle|MPos:x,y,z|Bf:15,128|FS:0,0|Pn:P|WCO:x,y,z|Ov:100,100,100>
//
// La app no habla con el puerto directamente: usa enviar(), tiempoReal() y los eventos
// `log`, `estado`, `cambio`, `alarma`, `sonda`, `reset`.

import { GrblSim } from "./grbl-sim.js";

const RX = 127;
const enc = new TextEncoder();

export const RT = { estado: "?", pausa: "!", reanudar: "~", reset: "\x18", cancelarJog: "\x85" };

export class Grbl extends EventTarget {
  constructor() {
    super();
    this.puerto = null; this.escritor = null; this.lector = null; this.sim = null;
    this.conectado = false; this.listo = false;
    this.est = {
      estado: "Desconectado", sub: null,
      mpos: { x: 0, y: 0, z: 0 }, wco: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 },
      feed: 0, rpm: 0, pines: "", ov: [100, 100, 100], bf: null,
    };
    this.version = ""; this.grblVer = ""; this.opciones = ""; this.ajustes = {}; this.ultimaSonda = null;
    this._buffer = ""; this._cola = []; this._vuelo = []; this._sondeo = null;
    this._programa = null;
  }

  get hayWebSerial() { return "serial" in navigator; }
  get pos() { return this.est.wpos; }
  get contacto() { return this.est.pines.includes("P"); }
  get ocupado() { return this._vuelo.length > 0 || this._cola.length > 0; }

  _emitir(tipo, detail) { this.dispatchEvent(new CustomEvent(tipo, { detail })); }
  log(texto, clase = "") { this._emitir("log", { texto, clase }); }

  // ---------------- Conexión ----------------
  async conectar() {
    if (!this.hayWebSerial) { this.log("Este navegador no tiene Web Serial: usa Chrome o Edge.", "sys err"); return false; }
    try {
      this.puerto = await navigator.serial.requestPort();
      await this.puerto.open({ baudRate: 115200 });
    } catch (e) {
      if (e.name === "NotFoundError") return false;           // cerró el selector
      const ocupado = /access denied|failed to open|acceso denegado/i.test(e.message) || e.name === "NetworkError";
      this.log(ocupado
        ? "El puerto está ocupado: cierra Candle, la app de Genmitsu u otra pestaña que lo tenga abierto."
        : "No se abrió el puerto: " + e.message, "sys err");
      this.puerto = null;
      return false;
    }
    this.conectado = true;
    this.escritor = this.puerto.writable.getWriter();
    this._leer();
    this.log("Puerto abierto. Esperando a GRBL…", "sys");
    navigator.serial.addEventListener("disconnect", () => {
      if (this.conectado && !this.sim) { this.log("Se desconectó el cable USB.", "sys err"); this.desconectar(); }
    }, { once: true });
    // Algunos controladores no se reinician al abrir el puerto: pedimos un reset suave.
    setTimeout(() => { if (this.conectado && !this.listo) this.tiempoReal(RT.reset); }, 1500);
    this._cambio();
    return true;
  }

  conectarSim() {
    this.sim = new GrblSim((l) => this._recibir(l));
    this.conectado = true;
    this.log("Simulador iniciado: GRBL emulado, sin hardware.", "sys");
    this.sim.arrancar();
    this._cambio();
    return true;
  }

  async desconectar() {
    clearInterval(this._sondeo);
    this._abortarCola("desconectado");
    if (this.sim) { this.sim.cerrar(); this.sim = null; }
    else {
      try { if (this.lector) await this.lector.cancel(); } catch (_) {}
      try { if (this.escritor) this.escritor.releaseLock(); } catch (_) {}
      try { await this.puerto?.close(); } catch (_) {}
    }
    this.puerto = this.escritor = this.lector = null;
    this.conectado = this.listo = false;
    this.est.estado = "Desconectado"; this.est.pines = "";
    this.log("Desconectado.", "sys");
    this._cambio();
  }

  async _leer() {
    const dec = new TextDecoderStream();
    this.puerto.readable.pipeTo(dec.writable).catch(() => {});
    this.lector = dec.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await this.lector.read();
        if (done) break;
        this._buffer += value;
        let i;
        while ((i = this._buffer.indexOf("\n")) >= 0) {
          const l = this._buffer.slice(0, i).replace(/\r$/, "");
          this._buffer = this._buffer.slice(i + 1);
          if (l) this._recibir(l);
        }
      }
    } catch (_) { /* cancelado al desconectar */ }
  }

  _crudo(txt) {
    if (this.sim) { this.sim.recibir(txt); return; }
    if (this.escritor) this.escritor.write(enc.encode(txt)).catch(() => {});
  }

  // ---------------- Envío ----------------
  tiempoReal(c) {
    if (!this.conectado) return;
    this._crudo(c);
    if (c === RT.reset) this._abortarCola("reset");
  }

  // Encola una línea. Resuelve con {ok, error, lineas} cuando GRBL responde.
  enviar(linea, { callado = false, origen = "usuario" } = {}) {
    linea = String(linea).trim();
    if (!this.conectado) return Promise.resolve({ ok: false, error: "sin conexión" });
    return new Promise((resolve) => {
      this._cola.push({ linea, callado, origen, resolve, respuestas: [] });
      this._bombear();
    });
  }

  // Varias líneas en orden; se detiene en el primer error.
  async enviarVarias(lineas, opts) {
    for (const l of lineas) {
      const r = await this.enviar(l, opts);
      if (!r.ok) return r;
    }
    return { ok: true };
  }

  _bombear() {
    while (this._cola.length) {
      const sig = this._cola[0];
      const len = sig.linea.length + 1;
      const enUso = this._vuelo.reduce((a, b) => a + b.len, 0);
      // Los $ (ajustes, homing, desbloqueo) van solos: GRBL escribe EEPROM o cambia de estado.
      const solo = /^\$(?!J=)/.test(sig.linea);
      if (solo && this._vuelo.length) break;
      if (this._vuelo.length && this._vuelo[this._vuelo.length - 1].solo) break;
      if (enUso + len > RX) break;
      this._cola.shift();
      sig.len = len; sig.solo = solo;
      this._vuelo.push(sig);
      if (!sig.callado) this.log(sig.linea, "tx");
      this._crudo(sig.linea + "\n");
    }
  }

  _abortarCola(motivo) {
    for (const c of [...this._vuelo, ...this._cola]) c.resolve({ ok: false, error: motivo, lineas: c.respuestas });
    this._vuelo = []; this._cola = [];
  }

  // ---------------- Recepción ----------------
  _recibir(l) {
    if (l.startsWith("<")) { this._estado(l); return; }

    if (l === "ok" || l.startsWith("error:")) {
      const c = this._vuelo.shift();
      if (l !== "ok") {
        const n = +l.slice(6);
        this.log(`${l}${c ? "  ← " + c.linea : ""}`, "err");
        this._emitir("error", { codigo: n, linea: c?.linea });
      } else if (c && !c.callado && c.origen === "usuario") this.log("ok", "rx ok");
      c?.resolve({ ok: l === "ok", error: l === "ok" ? null : +l.slice(6), lineas: c.respuestas });
      this._bombear();
      this._programa?.alAvanzar();
      return;
    }

    if (/^Grbl /i.test(l)) {
      this.log(l, "rx");
      this.grblVer = l.match(/Grbl\s+(\S+)/i)?.[1] || "";
      this.version ||= this.grblVer;
      this._abortarCola("reset");
      this._programa?.abortar("reset");
      this._emitir("reset", { texto: l });
      if (!this.listo) this._marcarListo();
      return;
    }

    if (l.startsWith("ALARM:")) {
      const n = +l.slice(6);
      this.log(l, "err");
      this.est.estado = "Alarm";
      // Lo que estaba en vuelo ya no se ejecuta: se libera para no esperar un ok que quizá no llegue
      this._abortarCola("alarma");
      this._emitir("alarma", { codigo: n });
      this._programa?.abortar("alarma");
      this._cambio();
      return;
    }

    if (l.startsWith("[PRB:")) {
      const m = l.match(/\[PRB:([-\d.]+),([-\d.]+),([-\d.]+):(\d)\]/);
      if (m) {
        this.ultimaSonda = { x: +m[1], y: +m[2], z: +m[3], ok: m[4] === "1" };
        this._emitir("sonda", this.ultimaSonda);
      }
      this.log(l, "rx");
      return;
    }
    if (l.startsWith("[VER:")) this.version = l.slice(5, -1).replace(/:$/, "") || this.version;
    if (l.startsWith("[OPT:")) this.opciones = l.slice(5, -1);
    const aj = l.match(/^\$(\d+)=([-\d.]+)/);
    if (aj) this.ajustes[+aj[1]] = +aj[2];

    // Respuestas informativas: pertenecen a la línea en vuelo más antigua
    if (this._vuelo[0]) this._vuelo[0].respuestas.push(l);
    if (!(this._vuelo[0]?.callado)) this.log(l, "rx");
  }

  _estado(l) {
    this._nEstado = (this._nEstado || 0) + 1;
    const partes = l.slice(1, -1).split("|");
    const [estado, sub] = partes[0].split(":");
    const e = this.est;
    e.estado = estado; e.sub = sub ?? null;
    let traePines = false;
    for (const p of partes.slice(1)) {
      const [k, v] = p.split(":");
      const n = v?.split(",").map(Number);
      if (k === "MPos") e.mpos = { x: n[0], y: n[1], z: n[2] };
      else if (k === "WPos") { e.wpos = { x: n[0], y: n[1], z: n[2] }; e.mpos = { x: n[0] + e.wco.x, y: n[1] + e.wco.y, z: n[2] + e.wco.z }; }
      else if (k === "WCO") e.wco = { x: n[0], y: n[1], z: n[2] };
      else if (k === "FS") { e.feed = n[0]; e.rpm = n[1]; }
      else if (k === "F") e.feed = n[0];
      else if (k === "Pn") { e.pines = v; traePines = true; }
      else if (k === "Ov") e.ov = n;
      else if (k === "Bf") e.bf = n;
    }
    if (!traePines) e.pines = "";
    e.wpos = { x: e.mpos.x - e.wco.x, y: e.mpos.y - e.wco.y, z: e.mpos.z - e.wco.z };
    if (!this.listo) this._marcarListo();
    this._cambio();
  }

  _marcarListo() {
    this.listo = true;
    this.log("GRBL respondió.", "sys");
    clearInterval(this._sondeo);
    this._sondeo = setInterval(() => { if (this.conectado) this._crudo(RT.estado); }, 100);
    // Datos de la máquina, sin ensuciar la consola
    setTimeout(async () => {
      await this.enviar("$I", { callado: true, origen: "auto" });
      await this.enviar("$$", { callado: true, origen: "auto" });
      this._cambio();
    }, 200);
    this._cambio();
  }

  _cambio() { this._emitir("cambio", this.est); }

  // ---------------- Utilidades de alto nivel ----------------
  // Espera a que el planificador se vacíe (G4 P0) y la máquina quede en Idle.
  async esperarQuieto(timeout = 600000) {
    const r = await this.enviar("G4 P0", { callado: true, origen: "auto" });
    if (!r.ok) return false;
    // Solo cuenta un reporte de estado posterior al ok (el anterior puede decir Idle de antes)
    const n0 = this._nEstado || 0;
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if ((this._nEstado || 0) > n0 + 1 && this.est.estado === "Idle") return true;
      if (this.est.estado === "Alarm" || !this.conectado) return false;
      await new Promise((r) => setTimeout(r, 60));
    }
    return false;
  }

  // Sondeo: resuelve con la posición de contacto (coordenadas de máquina) o null si falla.
  sondear(cmd) {
    return new Promise((resolve) => {
      const fin = (v) => { this.removeEventListener("sonda", alSonda); this.removeEventListener("alarma", alAlarma); resolve(v); };
      const alSonda = (e) => fin(e.detail.ok ? e.detail : null);
      const alAlarma = () => fin(null);
      this.addEventListener("sonda", alSonda);
      this.addEventListener("alarma", alAlarma);
      this.enviar(cmd).then((r) => { if (!r.ok) fin(null); });
    });
  }

  jog(dx, dy, dz, f) {
    const p = [dx && `X${dx}`, dy && `Y${dy}`, dz && `Z${dz}`].filter(Boolean).join("");
    if (!p) return;
    return this.enviar(`$J=G21G91${p}F${f}`);
  }

  // ---------------- Programa ----------------
  // Manda un programa completo respetando el búfer. alProgreso(hechas, total).
  correr(lineas, { alProgreso } = {}) {
    if (this._programa) return Promise.resolve({ ok: false, error: "ya hay un programa" });
    const limpias = lineas.map((l) => l.replace(/\(.*?\)|;.*$/g, "").trim()).filter(Boolean);
    let hechas = 0, enviadas = 0;
    return new Promise((resolve) => {
      const prog = (this._programa = {
        total: limpias.length,
        pausado: false,
        alAvanzar: () => {},
        abortar: (motivo) => { this._programa = null; resolve({ ok: false, error: motivo, hechas }); },
      });
      const alimentar = () => {
        while (enviadas < limpias.length && this._cola.length < 4 && this._programa === prog) {
          const n = enviadas++;
          this.enviar(limpias[n], { callado: true, origen: "programa" }).then((r) => {
            if (this._programa !== prog) return;
            if (!r.ok && r.error !== "reset") { this._programa = null; resolve({ ok: false, error: r.error, linea: limpias[n], hechas }); return; }
            hechas++;
            alProgreso?.(hechas, limpias.length);
            if (hechas === limpias.length) {
              this.esperarQuieto().then(() => { this._programa = null; resolve({ ok: true, hechas }); });
            }
          });
        }
      };
      prog.alAvanzar = alimentar;
      alimentar();
    });
  }

  get corriendo() { return !!this._programa; }
  pausar() { this.tiempoReal(RT.pausa); }
  reanudar() { this.tiempoReal(RT.reanudar); }
  // Paro: pausa (desacelera sin perder pasos) y luego reset; así GRBL conserva la posición.
  async parar() {
    this.tiempoReal(RT.pausa);
    await new Promise((r) => setTimeout(r, 250));
    this._programa?.abortar("paro");
    this.tiempoReal(RT.reset);
  }
}
