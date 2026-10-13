// s1.js - enlace con la xTool S1 por Web Serial (o con su simulador).
//
// Camino A (docs/xtool-s1.md): el G-code va en streaming línea por línea, como lo hace LightBurn
// por USB. Cada línea espera su `ok`. Las consultas son códigos M que contestan con el mismo
// código al frente (M222 S3, M303 X.. Y.. Z..); esas respuestas se leen aunque lleguen solas.
// Pausa, reanudar y cancelar van fuera de la cola: deben llegar aunque el búfer esté lleno.
//
// Coordenadas de la S1: origen atrás a la izquierda, X a la derecha, Y hacia el frente, mm.
// No hay coordenadas de trabajo: la posición es la de la máquina.
// Eventos: `log`, `cambio`, `alarma` {codigo, t}, `error` {codigo, linea}, `lista`.

import { Serie } from "../../shared/js/serie.js";
import { PERFIL, ESTADOS } from "./perfil-s1.js";
import { S1Sim } from "./s1-sim.js";
import { bloqueada } from "./bloqueo.js";

const num = (l, k) => { const m = l.match(new RegExp(`${k}\\s*(-?\\d+(?:\\.\\d+)?)`)); return m ? +m[1] : null; };

export class S1 extends Serie {
  constructor(perfil = PERFIL) {
    super({ baud: perfil.baud, rx: perfil.rx, otros: "xTool Studio, LightBurn" });
    this.perfil = perfil;
    this.est = {
      estado: "Desconectado", codigo: null, tipo: "off",
      pos: { x: 0, y: 0, z: 0 }, laser: { on: false, s: 0 }, aire: 0,
      area: { ...perfil.area }, info: null,
    };
    this.respuestas = 0;          // líneas que ha contestado la máquina (para saber si habla)
    this._tragar = 0;             // `ok` de órdenes que salieron fuera de la cola
    this._reloj = null;
  }

  // Lo que la app de la CNC llama mpos/wpos aquí es lo mismo: la S1 no tiene cero de trabajo
  get pos() { return this.est.pos; }
  get alarma() { return this.est.tipo === "alarma"; }
  get trabajando() { return ["ocupada", "pausa"].includes(this.est.tipo) || this.corriendo; }

  // ---------------- Conexión ----------------
  async conectar({ baud = this.perfil.baud } = {}) {
    if (!(await super.conectar({ baud }))) return false;
    this.log(`Puerto abierto a ${baud} baud. Preguntando a la S1…`, "sys");
    this._estado("Conectando…", null, "espera");
    this._arrancar();
    return true;
  }

  conectarSim() {
    super.conectarSim(new S1Sim((l) => this._recibir(l), this.perfil));
    this.log("Simulador iniciado: una S1 emulada, sin hardware.", "sys");
    this._estado("Conectando…", null, "espera");
    this._arrancar();
    return true;
  }

  // Al abrir: se pregunta quién es. La primera respuesta la marca como lista.
  _arrancar() {
    this.respuestas = 0; this._tragar = 0;
    const c = this.perfil.consultas;
    setTimeout(async () => {
      for (const q of [c.info, c.area, c.estado, c.posicion, c.aire]) await this.enviar(q, { callado: true, origen: "auto" });
      if (!this.listo && this.conectado) {
        this.log(`La S1 no contestó a ${this.puerto ? "esta velocidad" : "la simulación"}. Revisa el cable, que esté encendida y que xTool Studio esté cerrado.`, "sys err");
      }
    }, this.sim ? 200 : 600);
    clearInterval(this._reloj);
    this._reloj = setInterval(() => this._tic(), this.perfil.sondeo);
  }

  _alCerrar() {
    clearInterval(this._reloj);
    this._estado("Desconectado", null, "off");
  }

  _marcarLista() {
    if (this.listo) return;
    this.listo = true;
    this.log("La S1 respondió.", "sys");
    this._emitir("lista");
    this._cambio();
  }

  // Cada medio segundo: consultas perdidas y, con la máquina quieta, estado y posición
  _tic() {
    if (!this.conectado) return;
    const v = this._vuelo[0];
    if (v && v.origen === "auto" && performance.now() - v.t > this.perfil.esperaOk) {
      // Sin `ok`: se suelta para no trabar la cola (el diagnóstico lo reporta)
      this._vuelo.shift();
      v.resolve({ ok: false, error: "sin respuesta", lineas: v.respuestas });
      this._bombear();
    }
    if (this.listo && !this.corriendo && !this.ocupado) {
      const c = this.perfil.consultas;
      this.enviar(c.estado, { callado: true, origen: "auto" });
      this.enviar(c.posicion, { callado: true, origen: "auto" });
    }
  }

  // ---------------- Envío ----------------
  _cabe(sig, enUso) {
    if (enUso + sig.len > this.rx) return false;
    sig.t = performance.now();
    return true;
  }

  // Lo que escribe la persona en la consola pasa por el bloqueo
  enviar(linea, opts = {}) {
    const motivo = bloqueada(linea);
    if (motivo) {
      this.log(`${String(linea).trim()}  ← no se manda: ${motivo}`, "err");
      return Promise.resolve({ ok: false, error: "bloqueada" });
    }
    return super.enviar(linea, opts);
  }

  _fueraDeCola(cmd) {
    if (!this.conectado) return;
    this.log(cmd, "tx");
    this._tragar++;
    this._crudo(cmd + "\n");
  }

  // ---------------- Recepción ----------------
  _recibir(l) {
    this.respuestas++;
    if (l === "ok" || l.startsWith("error:")) {
      this._marcarLista();
      // El `ok` de una pausa o cancelación (fuera de la cola) no cierra ninguna línea en vuelo.
      // Si había líneas en vuelo no se sabe de cuál es; las cuentas cuadran al vaciarse la cola.
      if (l === "ok" && this._tragar > 0 && !this._vuelo.length) { this._tragar--; return; }
      this._confirmar(l);
      return;
    }
    const m = l.match(/^M(\d+)\b\s*(.*)$/);
    if (m) {
      this._marcarLista();
      this._codigo(+m[1], m[2], l);
    } else if (/^\{/.test(l)) {
      try { this.est.info = JSON.parse(l); this._marcarLista(); } catch (_) {}
    }
    this._informativa(l);
  }

  // Respuesta a una consulta (o aviso que llega solo)
  _codigo(n, resto, l) {
    const e = this.est;
    if (n === 222) {
      const c = num(resto, "S");
      if (c != null) this._ponerCodigo(c);
    } else if (n === 303 || n === 105 || n === 27) {
      const x = num(resto, "X"), y = num(resto, "Y"), z = num(resto, "Z");
      if (x != null && y != null) { e.pos = { x, y, z: z ?? e.pos.z }; this._cambio(); }
    } else if (n === 223) {
      const x = num(resto, "X"), y = num(resto, "Y");
      if (x > 0 && y > 0) { e.area = { x, y }; this._cambio(); }
    } else if (n === 15) {
      const s = num(resto, "S");
      if (s != null) { e.aire = s; this._cambio(); }
    } else if (n === 2003) {
      const j = l.indexOf("{");
      if (j >= 0) try { e.info = JSON.parse(l.slice(j)); } catch (_) {}
    }
  }

  _ponerCodigo(c) {
    const e = this.est, antes = e.codigo;
    const d = ESTADOS[c] || { t: `Estado ${c}`, tipo: "quieta" };
    this._estado(d.t, c, d.tipo);
    if (d.tipo === "alarma" && antes !== c) {
      this._emitir("alarma", { codigo: c, t: d.t, pasos: d.pasos || [] });
      // La S1 cancela el trabajo (tapa abierta, flama): lo que está en cola ya no se ejecuta
      if (this.corriendo) { this._abortarCola("alarma"); this._programa?.abortar("alarma"); }
    }
  }

  _estado(t, codigo, tipo) {
    const e = this.est;
    e.estado = t; e.codigo = codigo; e.tipo = tipo;
    this._cambio();
  }

  // ---------------- Órdenes ----------------
  async casa(eje = "xy") {
    const r = await this.enviar(this.perfil.casa[eje]);
    if (r.ok) await this.esperarQuieto(60000);
    await this.enviar(this.perfil.consultas.posicion, { callado: true, origen: "auto" });
    return r.ok;
  }

  // Mueve a (x, y) en absoluto, dentro del área
  async mover(x, y, f = this.perfil.rapido) {
    const a = this.est.area;
    x = Math.min(a.x, Math.max(0, x)); y = Math.min(a.y, Math.max(0, y));
    return this.enviarVarias(this.perfil.mover(x, y, f));
  }

  // Jog: relativo a la última posición conocida (la S1 no tiene $J). dz sube o baja el módulo.
  jog(dx = 0, dy = 0, dz = 0, f = 3000) {
    const p = this.est.pos;
    if (dz) return this.enviarVarias(["M110 X1 Y1 Z1", "G90", `G0 Z${Math.max(0, p.z + dz).toFixed(2)} F${Math.round(f / 4)}`]);
    const r = this.mover(p.x + dx, p.y + dy, f);
    // Se adelanta la posición para que varios toques seguidos se sumen
    const a = this.est.area;
    this.est.pos = { ...p, x: Math.min(a.x, Math.max(0, p.x + dx)), y: Math.min(a.y, Math.max(0, p.y + dy)) };
    return r;
  }

  aire(nivel) { return this.enviar(`M15 S${nivel}`); }

  pausar() { this._fueraDeCola(this.perfil.pausar); }
  reanudar() { this._fueraDeCola(this.perfil.reanudar); }
  // Cancelar: la S1 se detiene y apaga el láser; lo que estaba en cola se descarta
  async parar() {
    this._programa?.abortar("paro");
    this._abortarCola("paro");
    this._fueraDeCola(this.perfil.cancelar);
  }

  // Termina cuando M222 deja de decir que trabaja y el cabezal deja de moverse (la máquina aún tiene
  // movimientos en su búfer cuando ya contestó la última línea; sin láser, M222 puede decir «lista»
  // mientras se mueve, por ejemplo al encuadrar)
  async esperarQuieto(timeout = 600000) {
    const t0 = performance.now();
    let quietas = 0, antes = null;
    while (performance.now() - t0 < timeout && this.conectado) {
      await new Promise((r) => setTimeout(r, 400));
      const r = await this.enviar(this.perfil.consultas.estado, { callado: true, origen: "auto" });
      if (!r.ok && r.error !== "sin respuesta") return false;
      await this.enviar(this.perfil.consultas.posicion, { callado: true, origen: "auto" });
      if (this.alarma) return false;
      const t = this.est.tipo, p = this.est.pos;
      const quieto = antes && Math.abs(p.x - antes.x) < 0.01 && Math.abs(p.y - antes.y) < 0.01;
      antes = { ...p };
      quietas = (t === "quieta" || t === "fin") && quieto ? quietas + 1 : 0;
      if (quietas >= 2) return true;
      // Sin estado conocido (firmware que no contesta M222): se da por terminado tras unos segundos
      if (this.est.codigo == null && performance.now() - t0 > 5000) return true;
    }
    return false;
  }
}
