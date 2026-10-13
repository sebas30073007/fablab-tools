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

import { Serie } from "../../shared/js/serie.js";
import { GrblSim } from "./grbl-sim.js";

const RX = 127;

export const RT = { estado: "?", pausa: "!", reanudar: "~", reset: "\x18", cancelarJog: "\x85" };

export class Grbl extends Serie {
  constructor() {
    super({ baud: 115200, rx: RX, otros: "Candle, la app de Genmitsu" });
    this.est = {
      estado: "Desconectado", sub: null,
      mpos: { x: 0, y: 0, z: 0 }, wco: { x: 0, y: 0, z: 0 }, wpos: { x: 0, y: 0, z: 0 },
      feed: 0, rpm: 0, pines: "", ov: [100, 100, 100], bf: null,
    };
    this.version = ""; this.grblVer = ""; this.opciones = ""; this.ajustes = {}; this.ultimaSonda = null;
    this._sondeo = null;
  }

  get pos() { return this.est.wpos; }
  get contacto() { return this.est.pines.includes("P"); }

  // ---------------- Conexión ----------------
  async conectar() {
    if (!(await super.conectar())) return false;
    this.log("Puerto abierto. Esperando a GRBL…", "sys");
    // Algunos controladores no se reinician al abrir el puerto: pedimos un reset suave.
    setTimeout(() => { if (this.conectado && !this.listo) this.tiempoReal(RT.reset); }, 1500);
    this._cambio();
    return true;
  }

  conectarSim() {
    super.conectarSim(new GrblSim((l) => this._recibir(l)));
    this.log("Simulador iniciado: GRBL emulado, sin hardware.", "sys");
    this._cambio();
    return true;
  }

  _alCerrar() {
    clearInterval(this._sondeo);
    this.est.estado = "Desconectado"; this.est.pines = "";
  }

  // ---------------- Envío ----------------
  tiempoReal(c) {
    if (!this.conectado) return;
    this._crudo(c);
    if (c === RT.reset) this._abortarCola("reset");
  }

  // Los $ (ajustes, homing, desbloqueo) van solos: GRBL escribe EEPROM o cambia de estado.
  _cabe(sig, enUso) {
    const solo = /^\$(?!J=)/.test(sig.linea);
    if (solo && this._vuelo.length) return false;
    if (this._vuelo.length && this._vuelo[this._vuelo.length - 1].solo) return false;
    if (enUso + sig.len > RX) return false;
    sig.solo = solo;
    return true;
  }

  // ---------------- Recepción ----------------
  _recibir(l) {
    if (l.startsWith("<")) { this._estado(l); return; }
    if (l === "ok" || l.startsWith("error:")) { this._confirmar(l); return; }
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
      // Tolerante: hay firmwares que mandan más de tres ejes ([PRB:x,y,z,a:1]) o espacios.
      // Si no se leyera, el sondeo se quedaría esperando para siempre.
      const m = l.match(/^\[PRB:\s*([^:\]]+):\s*(\d)\s*\]/);
      const n = m ? m[1].split(",").map(Number) : [];
      if (n.length >= 3 && n.slice(0, 3).every(Number.isFinite)) {
        this.ultimaSonda = { x: n[0], y: n[1], z: n[2], ok: m[2] === "1" };
        this._emitir("sonda", this.ultimaSonda);
      }
      this.log(l, "rx");
      return;
    }
    if (l.startsWith("[VER:")) this.version = l.slice(5, -1).replace(/:$/, "") || this.version;
    if (l.startsWith("[OPT:")) this.opciones = l.slice(5, -1);
    const aj = l.match(/^\$(\d+)=([-\d.]+)/);
    if (aj) this.ajustes[+aj[1]] = +aj[2];

    this._informativa(l);
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
  // G38.2 contesta [PRB:…:1] y luego ok; sin contacto, ALARM:5. Si llega el ok sin un [PRB] legible,
  // el contacto sí ocurrió (si no, habría alarma): se toma la posición del siguiente reporte con la
  // máquina quieta, en vez de quedarse esperando.
  sondear(cmd) {
    return new Promise((resolve) => {
      let listo = false;
      const fin = (v) => {
        if (listo) return; listo = true;
        this.removeEventListener("sonda", alSonda); this.removeEventListener("alarma", alAlarma); resolve(v);
      };
      const alSonda = (e) => fin(e.detail.ok ? e.detail : null);
      const alAlarma = () => fin(null);
      this.addEventListener("sonda", alSonda);
      this.addEventListener("alarma", alAlarma);
      this.enviar(cmd).then(async (r) => {
        if (!r.ok) return fin(null);
        await new Promise((ok) => setTimeout(ok, 400));
        if (listo) return;
        this.log("Sondeo terminado sin [PRB] legible: se usa la posición actual", "err");
        const quieto = await this.esperarQuieto();
        fin(quieto && this.est.estado !== "Alarm" ? { ...this.est.mpos, ok: true } : null);
      });
    });
  }

  jog(dx, dy, dz, f) {
    const p = [dx && `X${dx}`, dy && `Y${dy}`, dz && `Z${dz}`].filter(Boolean).join("");
    if (!p) return;
    return this.enviar(`$J=G21G91${p}F${f}`);
  }

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
