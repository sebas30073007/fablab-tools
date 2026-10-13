// serie.js - enlace por Web Serial con una máquina que habla en líneas (o con su simulador).
//
// Lo común a GRBL (CNC) y al firmware de la xTool S1 (láser):
//   · líneas ASCII terminadas en \n; cada línea se confirma con una respuesta final (`ok`, `error:n`)
//   · streaming: se mandan líneas mientras quepan en el búfer de la máquina (cabe())
//   · lo que llega entre una línea y su `ok` se guarda como respuestas de esa línea
//
// Cada protocolo extiende la clase y cambia lo que haga falta: _recibir() para mensajes propios
// (estado, alarmas), _cabe() para su regla de búfer, esperarQuieto() para saber cuándo terminó.
// Eventos: `log` {texto, clase}, `cambio`, `error` {codigo, linea}.

const enc = new TextEncoder();

export class Serie extends EventTarget {
  // baud: velocidad del puerto · rx: bytes que caben en el búfer de recepción de la máquina
  // otros: programas que suelen tener el puerto abierto (para el mensaje de «puerto ocupado»)
  constructor({ baud = 115200, rx = 127, otros = "otra pestaña" } = {}) {
    super();
    this.baud = baud; this.rx = rx; this.otros = otros;
    this.puerto = null; this.escritor = null; this.lector = null; this.sim = null;
    this.conectado = false; this.listo = false;
    this._buffer = ""; this._cola = []; this._vuelo = [];
    this._programa = null;
  }

  get hayWebSerial() { return "serial" in navigator; }
  get ocupado() { return this._vuelo.length > 0 || this._cola.length > 0; }

  _emitir(tipo, detail) { this.dispatchEvent(new CustomEvent(tipo, { detail })); }
  log(texto, clase = "") { this._emitir("log", { texto, clase }); }
  _cambio() { this._emitir("cambio", this.est); }

  // ---------------- Conexión ----------------
  // Abre el selector de puertos. Devuelve true si quedó abierto.
  async conectar({ baud = this.baud } = {}) {
    if (!this.hayWebSerial) { this.log("Este navegador no tiene Web Serial: usa Chrome o Edge.", "sys err"); return false; }
    try {
      this.puerto = await navigator.serial.requestPort();
      await this.puerto.open({ baudRate: baud });
    } catch (e) {
      if (e.name === "NotFoundError") return false;           // cerró el selector
      const ocupado = /access denied|failed to open|acceso denegado/i.test(e.message) || e.name === "NetworkError";
      this.log(ocupado
        ? `El puerto está ocupado: cierra ${this.otros} u otra pestaña que lo tenga abierto.`
        : "No se abrió el puerto: " + e.message, "sys err");
      this.puerto = null;
      return false;
    }
    this.conectado = true;
    this.escritor = this.puerto.writable.getWriter();
    this._leer();
    navigator.serial.addEventListener("disconnect", () => {
      if (this.conectado && !this.sim) { this.log("Se desconectó el cable USB.", "sys err"); this.desconectar(); }
    }, { once: true });
    return true;
  }

  // sim: objeto con recibir(texto), arrancar() y cerrar(); contesta llamando a this._recibir(línea)
  conectarSim(sim) {
    this.sim = sim;
    this.conectado = true;
    this.sim.arrancar();
    return true;
  }

  async desconectar() {
    this._alCerrar();
    this._abortarCola("desconectado");
    this._programa?.abortar("desconectado");
    if (this.sim) { this.sim.cerrar(); this.sim = null; }
    else {
      try { if (this.lector) await this.lector.cancel(); } catch (_) {}
      try { if (this.escritor) this.escritor.releaseLock(); } catch (_) {}
      try { await this.puerto?.close(); } catch (_) {}
    }
    this.puerto = this.escritor = this.lector = null;
    this.conectado = this.listo = false;
    this.log("Desconectado.", "sys");
    this._cambio();
  }
  // Para que cada protocolo detenga sus temporizadores y limpie su estado
  _alCerrar() {}

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
  // Encola una línea. Resuelve con {ok, error, lineas} cuando la máquina responde.
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

  // ¿Puede salir ya `sig`? enUso: bytes en vuelo. Por defecto, mientras quepa en el búfer.
  _cabe(sig, enUso) { return enUso + sig.len <= this.rx; }

  _bombear() {
    while (this._cola.length) {
      const sig = this._cola[0];
      sig.len = sig.linea.length + 1;
      const enUso = this._vuelo.reduce((a, b) => a + b.len, 0);
      if (!this._cabe(sig, enUso)) break;
      this._cola.shift();
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
  // `ok` o `error:n` cierran la línea en vuelo más antigua; lo demás es respuesta informativa.
  _recibir(l) {
    if (l === "ok" || l.startsWith("error:")) { this._confirmar(l); return; }
    this._informativa(l);
  }

  _confirmar(l) {
    const c = this._vuelo.shift();
    const ok = l === "ok";
    if (!ok) {
      const n = +l.slice(6);
      this.log(`${l}${c ? "  ← " + c.linea : ""}`, "err");
      this._emitir("error", { codigo: n, linea: c?.linea });
    } else if (c && !c.callado && c.origen === "usuario") this.log("ok", "rx ok");
    c?.resolve({ ok, error: ok ? null : +l.slice(6), lineas: c.respuestas });
    this._bombear();
    this._programa?.alAvanzar();
  }

  _informativa(l) {
    if (this._vuelo[0]) this._vuelo[0].respuestas.push(l);
    if (!(this._vuelo[0]?.callado)) this.log(l, "rx");
  }

  // ---------------- Programa ----------------
  // Cómo se limpia cada línea antes de mandarla (comentarios fuera). Cada protocolo puede cambiarla.
  _limpiar(l) {
    // Comentarios: «;» hasta el fin y «(» hasta el primer «)». Lo que sobre de un paréntesis mal
    // cerrado no se manda: la máquina lo rechazaría y el trabajo quedaría a medias.
    return l.replace(/;.*$/, "").replace(/\([^)]*\)/g, "").replace(/\(.*$/, "").replace(/\)/g, "").trim();
  }

  // Termina cuando la máquina dice que acabó de moverse (cada protocolo lo sabe a su manera)
  async esperarQuieto() { return true; }

  // Manda un programa completo respetando el búfer. alProgreso(hechas, total).
  correr(lineas, { alProgreso } = {}) {
    if (this._programa) return Promise.resolve({ ok: false, error: "ya hay un programa" });
    const limpias = lineas.map((l) => this._limpiar(l)).filter(Boolean);
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
}
