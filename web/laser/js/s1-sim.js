// s1-sim.js - la xTool S1 emulada para el modo Simulación.
//
// Contesta como suponemos que contesta la S1 por USB (perfil-s1.js): `ok` por línea aceptada,
// las consultas con su código al frente (M222 S3, M303 X.. Y.. Z..) y avisos de estado que llegan
// solos cuando cambia (M222 S14 al cortar, S7 con la tapa abierta, S9 con flama).
// El intérprete y el movimiento son los de grbl-sim.js de la CNC, en el marco de la S1:
// origen atrás a la izquierda, X a la derecha, Y hacia el frente, todo positivo.
//
// Para practicar: abrirTapa(on) y flama() disparan las alarmas de la máquina real.

const PLANIFICADOR = 16;
const CLAVE = "fablab.laser.sim";

export class S1Sim {
  constructor(responder, perfil) {
    this.responder = responder;
    this.perfil = perfil;
    this.area = { ...perfil.area };
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch (_) {}
    // La S1 se enciende con el cabezal donde quedó; tras M111 va a la esquina de atrás a la izquierda
    this.pos = guardado.pos || { x: this.area.x / 2, y: this.area.y / 2, z: 0 };
    this.abs = true; this.f = 1000; this.s = 0; this.laser = false; this.modoLaser = 3; this.modo = 0;
    this.fin = { ...this.pos };
    this.rx = ""; this.lineas = []; this.plan = [];
    this.codigo = 3; this.pausa = false; this.tapa = false;
    this.aire = 0; this.extractor = false;
    this.velocidad = 1;
    this.rastro = [];           // {x, y, z, s, on} recorrido desde la última lectura (para el quemado)
    this.quemo = false;         // si el trabajo actual ya encendió el láser
    this._t = null;
  }

  arrancar() { this._t = setInterval(() => this._paso(0.01), 10); }
  cerrar() { clearInterval(this._t); this._guardar(); }
  _guardar() { try { localStorage.setItem(CLAVE, JSON.stringify({ pos: this.pos })); } catch (_) {} }
  _enviar(l) { setTimeout(() => this.responder(l), 1); }

  // Cambia el estado y lo avisa (como el aviso que la S1 manda sola)
  _codigo(c) {
    if (this.codigo === c) return;
    this.codigo = c;
    this._enviar(`M222 S${c}`);
  }

  // ---------------- Para practicar ----------------
  abrirTapa(on) {
    this.tapa = on;
    if (on && (this.plan.length || this.lineas.length)) this._cancelar(7);
    else if (on) this._codigo(7);
    else if (this.codigo === 7) this._codigo(3);
  }
  flama() { this._cancelar(9); }

  _cancelar(codigo) {
    this.plan = []; this.lineas = []; this.rx = ""; this.pausa = false;
    this.laser = false; this.fin = { ...this.pos };
    this._codigo(codigo);
  }

  // ---------------- Entrada serie ----------------
  recibir(txt) {
    for (const c of txt) {
      if (c === "\n") {
        const l = this.rx.trim(); this.rx = "";
        if (!l) continue;
        // Pausa, reanudar y cancelar se atienden al llegar, aunque haya cola
        const u = l.toUpperCase().replace(/\s+/g, "");
        if (u === "M22S1") { if (this.codigo === 14 || this.plan.length) { this.pausa = true; this._codigo(15); } this._enviar("ok"); continue; }
        if (u === "M22S0") { if (this.pausa) { this.pausa = false; this._codigo(this.plan.length ? 14 : 3); } this._enviar("ok"); continue; }
        if (u === "M108") { this._cancelar(18); setTimeout(() => this._codigo(3), 600); this._enviar("ok"); continue; }
        this.lineas.push(l);
        continue;
      }
      if (c !== "\r") this.rx += c;
    }
    this._procesar();
  }

  _procesar() {
    while (this.lineas.length && this.plan.length < PLANIFICADOR) {
      if (this._esperando) return;
      const l = this.lineas.shift();
      const r = this._linea(l.toUpperCase().replace(/\(.*?\)|;.*$/g, "").trim());
      if (r !== null) this._enviar(r);
    }
  }

  _palabras(l) {
    const w = { G: [], M: [] };
    for (const [, k, v] of l.matchAll(/([A-Z])\s*([-+]?\d*\.?\d+)/g)) {
      if (k === "G" || k === "M") w[k].push(+v); else w[k] = +v;
    }
    return w;
  }

  _linea(l) {
    if (!l) return "ok";
    if (l === "$L") return "ok";
    if (l.startsWith("$")) return "error:3";
    const w = this._palabras(l);
    // Alarmas que bloquean hasta cerrar la tapa o reconocerlas
    if ([7, 9, 20, 22].includes(this.codigo) && (w.G.length || w.M.some((m) => m === 3 || m === 4))) {
      if (this.codigo === 7 && this.tapa) return "error:7";
      if (this.codigo !== 7) this._codigo(3);
    }
    for (const m of w.M) {
      const r = this._m(m, w, l);
      if (r !== undefined) return r;
    }
    return this._g(w);
  }

  // Códigos M de la S1. Devuelve la respuesta si la línea ya terminó; undefined si sigue al G-code
  // (solo M3, M4 y M5, que pueden ir con un movimiento en la misma línea).
  _m(m, w) {
    const p = this.pos, f2 = (v) => v.toFixed(2);
    switch (m) {
      case 222: this._enviar(`M222 S${this.codigo}`); return "ok";
      case 303: this._enviar(`M303 X${f2(p.x)} Y${f2(p.y)} Z${f2(p.z)}`); return "ok";
      case 105: this._enviar(`M105 X${f2(p.x)}Y${f2(p.y)}Z${f2(p.z)}`); return "ok";
      case 223:
        if (w.X === undefined) { this._enviar(`M223 X${this.area.x} Y${this.area.y}`); return "ok"; }
        return "ok";         // tamaño del trabajo (encabezado): sin efecto
      case 2003:
        this._enviar(`M2003 ${JSON.stringify({ M310: "SIM-S1", M2099: "sim", M100: "S1 Simulación", M116: "X0Y40B1P1L3", M223: `X${this.area.x} Y${this.area.y}` })}`);
        return "ok";
      case 15:
        if (w.S === undefined && w.A === undefined) { this._enviar(`M15 A${this.aire ? 1 : 0} S${this.aire}`); return "ok"; }
        this.aire = Math.max(0, Math.min(4, w.S ?? 0)); return "ok";
      case 7: this.extractor = (w.S ?? w.N ?? 0) > 0; return "ok";
      case 111: {
        // Casa: XY a la esquina de atrás a la izquierda; Z arriba
        const c = { ...this.fin };
        if (w.S === 3 || w.S === 7) { c.x = 0; c.y = 0; }
        if (w.S === 2 || w.S === 7) c.z = 0;
        this._esperando = true;
        this._codigo(0);
        this.plan.push({ hasta: c, f: 6000, alFinal: () => { this._esperando = false; this._codigo(3); this._enviar("ok"); this._procesar(); } });
        this.fin = c;
        return null;
      }
      case 3: this.laser = true; this.modoLaser = 3; return undefined;
      case 4: this.laser = true; this.modoLaser = 4; return undefined;
      case 5: this.laser = false; return undefined;
      case 6: case 2: case 30: this.laser = false; return "ok";
      // M110, M109, M96, M340, M32, M323…: aceptados sin efecto visible. Sus X Y Z no son movimientos.
      default: return "ok";
    }
  }

  _g(w) {
    for (const g of w.G) {
      if (g === 90) this.abs = true;
      else if (g === 91) this.abs = false;
      else if ([0, 1, 2, 3].includes(g)) this.modo = g;
      else if (g === 4) {
        this._esperando = true;
        this.plan.push({ espera: w.P ?? 0, alFinal: () => { this._esperando = false; this._enviar("ok"); } });
        return null;
      } else if ([21, 17, 94, 54].includes(g)) { /* sin efecto */ }
      else if (g === 92) { return "ok"; }
      else return "error:20";
    }
    if (w.F !== undefined) this.f = w.F;
    if (w.S !== undefined) this.s = w.S;
    const hayEje = ["X", "Y", "Z"].some((e) => w[e] !== undefined);
    if (!hayEje) return "ok";
    const t = { ...this.fin };
    for (const e of ["X", "Y", "Z"]) if (w[e] !== undefined) {
      const k = e.toLowerCase();
      t[k] = this.abs ? w[e] : this.fin[k] + w[e];
    }
    const eps = 0.01;
    if (t.x < -eps || t.y < -eps || t.x > this.area.x + eps || t.y > this.area.y + eps) { this._cancelar(20); return "error:20"; }
    const f = this.modo === 0 ? (w.F ?? this.perfil.rapido) : this.f;
    const quema = this.laser && this.modo !== 0 && this.s > 0;
    const mov = (hasta) => this.plan.push({ hasta, f, s: quema ? this.s : 0, on: quema });
    if (this.modo === 2 || this.modo === 3) {
      const c = { x: this.fin.x + (w.I ?? 0), y: this.fin.y + (w.J ?? 0) };
      const a0 = Math.atan2(this.fin.y - c.y, this.fin.x - c.x), a1 = Math.atan2(t.y - c.y, t.x - c.x);
      const r = Math.hypot(this.fin.x - c.x, this.fin.y - c.y);
      let da = a1 - a0;
      if (this.modo === 2 && da >= 0) da -= 2 * Math.PI;
      if (this.modo === 3 && da <= 0) da += 2 * Math.PI;
      const n = Math.max(2, Math.ceil((Math.abs(da) * r) / 0.5));
      for (let i = 1; i <= n; i++) { const a = a0 + (da * i) / n; mov({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: t.z }); }
    } else mov(t);
    this.fin = t;
    if (quema) this.quemo = true;
    if (!this.pausa && this.codigo !== 14 && (quema || this.quemo)) this._codigo(14);
    return "ok";
  }

  // ---------------- Movimiento ----------------
  _paso(dt) {
    dt *= this.velocidad;
    if (this.pausa) return;
    let tiempo = dt;
    while (tiempo > 0 && this.plan.length) {
      const m = this.plan[0];
      if (m.espera !== undefined) {
        m.espera -= tiempo; tiempo = 0;
        if (m.espera <= 0) { this.plan.shift(); m.alFinal?.(); }
        break;
      }
      const d = { x: m.hasta.x - this.pos.x, y: m.hasta.y - this.pos.y, z: m.hasta.z - this.pos.z };
      const L = Math.hypot(d.x, d.y, d.z);
      const v = Math.min(m.f, this.perfil.velMax) / 60;
      const avance = v * tiempo;
      if (avance >= L) {
        this.pos = { ...m.hasta }; tiempo -= L / v; this.plan.shift(); m.alFinal?.();
      } else {
        this.pos.x += (d.x / L) * avance; this.pos.y += (d.y / L) * avance; this.pos.z += (d.z / L) * avance; tiempo = 0;
      }
      this.rastro.push({ ...this.pos, s: m.s || 0, on: !!m.on });
      if (this.rastro.length > 60000) this.rastro.splice(0, 10000);
    }
    // Sin movimientos pendientes por un momento: si hubo corte, terminó; luego vuelve a lista.
    // (El momento evita dar por terminado un trabajo cuando solo faltó una línea por llegar.)
    const vacio = !this.plan.length && !this.lineas.length && !this._esperando;
    this._vacio = vacio ? (this._vacio || 0) + dt / this.velocidad : 0;
    if (vacio && this._vacio > 0.6) {
      if (this.codigo === 14) {
        this._codigo(19); this.quemo = false; this._guardar();
        setTimeout(() => { if (this.codigo === 19) this._codigo(3); }, 2500);
      }
    }
    if (this.lineas.length) this._procesar();
  }

  // Lo recorrido desde la última vez, con todas las esquinas aunque la simulación vaya acelerada
  tomarRastro() {
    const r = this.rastro;
    this.rastro = [];
    return r;
  }
}
