// grbl-sim.js - GRBL 1.1 emulado para el modo Simulación.
//
// Contesta lo mismo que la Cubiko (ok/error, <estado>, ALARM, [PRB], $$, $I, $#, $G)
// para que la app no distinga entre simulación y máquina real. Convención de GRBL
// con homing: el área de trabajo es negativa (X -145…0, Y -110…0, Z -40…0) y $23 dice hacia
// dónde busca cada eje sus topes. En la Cubiko real ($23=3) X va a la izquierda y la cama hacia
// atrás (la fresa queda al frente de la cama): tras $H queda en X -143 Y -108 Z -2 (con $27=2).
//
// Hay una placa virtual (MDF 2 mm + FR4 1.6 mm, ligeramente inclinada y ondulada) para
// que la sonda y el mapa de alturas den números creíbles.

const AJUSTES = {
  0: 10, 1: 25, 2: 0, 3: 1, 4: 0, 5: 0, 6: 0, 10: 1, 11: 0.010, 12: 0.002, 13: 0,
  20: 1, 21: 0, 22: 1, 23: 3, 24: 100, 25: 1000, 26: 250, 27: 2, 30: 10000, 31: 0, 32: 0,
  100: 800, 101: 800, 102: 800, 110: 2000, 111: 2000, 112: 1000,
  120: 100, 121: 100, 122: 100, 130: 145, 131: 110, 132: 40,
};
const PLANIFICADOR = 15;
const CLAVE = "fablab.cnc.sim";

// Superficie del cobre en coordenadas de máquina (la placa ocupa casi toda la cama).
// SUPERFICIE.z sigue al grosor del material que se puso en la app (MDF de 2 mm + material).
export const SUPERFICIE = { z: -36.4 };
export function superficieSim(x, y) {
  return SUPERFICIE.z + 0.0012 * (x + 72) - 0.0009 * (y + 55) + 0.03 * Math.sin(x / 17) * Math.cos(y / 23);
}

export class GrblSim {
  constructor(responder) {
    this.responder = responder;
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(CLAVE) || "{}"); } catch (_) {}
    this.aj = { ...AJUSTES, ...(guardado.aj || {}) };
    this.g54 = guardado.g54 || { x: 0, y: 0, z: 0 };
    this.g92 = { x: 0, y: 0, z: 0 };
    // Al conectar la simulación la máquina está al centro, como la muestra el gemelo antes de conectar;
    // el homing sale de ahí (no se guarda dónde quedó la vez anterior)
    this.pos = { x: -this.aj[130] / 2, y: -this.aj[131] / 2, z: -5 };
    this.reiniciarModal();
    this.rx = "";
    this.lineas = [];           // búfer de recepción (líneas completas aún sin procesar)
    this.plan = [];             // movimientos aceptados
    this.estado = "Idle"; this.hold = false; this.contactoManual = false;
    this.velocidad = 1;          // multiplicador de tiempo (solo para ver trabajos largos)
    this.prb = { x: 0, y: 0, z: 0, ok: 0 };
    this.rastro = [];           // posiciones recorridas desde la última lectura (para dibujar el surco)
    this._t = null;
  }

  reiniciarModal() {
    this.abs = true; this.mm = true; this.f = 0; this.s = 0; this.husillo = false; this.modo = 0;
    this.fin = { ...this.pos };   // posición al final de lo ya planificado
  }

  arrancar() {
    this._t = setInterval(() => this._paso(0.01), 10);
    // Encendido: con homing activo ($22=1) GRBL arranca en alarma hasta $H o $X
    if (this.aj[22]) this.estado = "Alarm";
    setTimeout(() => this._bienvenida(false), 300);
  }
  cerrar() { clearInterval(this._t); this._guardar(); }
  _guardar() { try { localStorage.setItem(CLAVE, JSON.stringify({ aj: this.aj, g54: this.g54 })); } catch (_) {} }
  _enviar(l) { setTimeout(() => this.responder(l), 1); }

  _bienvenida(perdida) {
    this._enviar("Grbl 1.1f ['$' for help]");
    if (perdida) this._enviar("ALARM:3");
    else if (this.estado === "Alarm") this._enviar("[MSG:'$H'|'$X' to unlock]");
  }

  get contacto() {
    return this.contactoManual || this.pos.z <= superficieSim(this.pos.x, this.pos.y) + 1e-4;
  }

  // ---------------- Entrada serie ----------------
  recibir(txt) {
    for (const c of txt) {
      if (c === "?") { this._reporte(); continue; }
      if (c === "!") { if (this.plan.length && this.estado !== "Alarm") { this.hold = true; this.estado = "Hold"; } continue; }
      if (c === "~") { if (this.hold) { this.hold = false; this.estado = this.plan.length ? "Run" : "Idle"; } continue; }
      if (c === "\x18") { this._reset(); continue; }
      if (c === "\x85") { if (this.plan[0]?.jog) { this.plan = this.plan.filter((m) => !m.jog); this.fin = { ...this.pos }; } continue; }
      if (c === "\n") { const l = this.rx.trim(); this.rx = ""; if (l) this.lineas.push(l); continue; }
      if (c !== "\r") this.rx += c;
    }
    this._procesar();
  }

  _reset() {
    // Reset con los ejes en marcha (sin pausa antes) = pasos perdidos → ALARM:3
    const perdida = this.plan.length > 0 && !this.hold && this.estado !== "Alarm";
    this.plan = []; this.lineas = []; this.rx = ""; this.hold = false; this._esperandoFin = false;
    this.reiniciarModal();
    if (perdida) this.estado = "Alarm";
    else if (this.estado !== "Alarm") this.estado = "Idle";
    setTimeout(() => this._bienvenida(perdida), 50);
  }

  _reporte() {
    const p = this.pos, w = { x: this.g54.x + this.g92.x, y: this.g54.y + this.g92.y, z: this.g54.z + this.g92.z };
    const f3 = (v) => v.toFixed(3);
    const est = this.estado === "Hold" ? "Hold:0" : this.estado;
    const pines = this.contacto ? "|Pn:P" : "";
    const m = this.plan[0];
    const f = m && !this.hold ? m.f : 0;
    this._enviar(`<${est}|MPos:${f3(p.x)},${f3(p.y)},${f3(p.z)}|Bf:${PLANIFICADOR - this.plan.length},${127 - this.lineas.join("\n").length}|FS:${Math.round(f)},${this.husillo ? this.s : 0}${pines}|WCO:${f3(w.x)},${f3(w.y)},${f3(w.z)}|Ov:100,100,100>`);
  }

  // ---------------- Intérprete ----------------
  _procesar() {
    while (this.lineas.length && this.plan.length < PLANIFICADOR) {
      if (this._esperandoFin) return;           // $H o G38 en curso: GRBL bloquea
      const l = this.lineas.shift();
      const r = this._linea(l.toUpperCase().replace(/\s+/g, "").replace(/\(.*?\)|;.*$/g, ""));
      if (r !== null) this._enviar(r);
    }
  }

  _linea(l) {
    if (!l) return "ok";
    if (l[0] === "$") return this._dolar(l);
    if (this.estado === "Alarm") return "error:9";
    return this._gcode(l);
  }

  _dolar(l) {
    if (l === "$$") {
      Object.entries(this.aj).forEach(([k, v]) => this._enviar(`$${k}=${Number.isInteger(v) ? v : v.toFixed(3)}`));
      return "ok";
    }
    if (l === "$I") { this._enviar("[VER:1.1f.20170801:CUBIKO-SIM]"); this._enviar("[OPT:VL,15,128]"); return "ok"; }
    if (l === "$#") {
      const f = (o) => `${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)}`;
      ["G54", "G55", "G56", "G57", "G58", "G59"].forEach((g, i) => this._enviar(`[${g}:${i ? "0.000,0.000,0.000" : f(this.g54)}]`));
      this._enviar("[G28:0.000,0.000,0.000]"); this._enviar("[G30:0.000,0.000,0.000]");
      this._enviar(`[G92:${f(this.g92)}]`); this._enviar("[TLO:0.000]");
      this._enviar(`[PRB:${f(this.prb)}:${this.prb.ok}]`);
      return "ok";
    }
    if (l === "$G") { this._enviar(`[GC:G${this.modo} G54 G17 ${this.mm ? "G21" : "G20"} ${this.abs ? "G90" : "G91"} G94 M${this.husillo ? 3 : 5} M9 T0 F${this.f} S${this.s}]`); return "ok"; }
    if (l === "$X") {
      if (this.estado === "Alarm") { this.estado = "Idle"; this._enviar("[MSG:Caution: Unlocked]"); }
      return "ok";
    }
    if (l === "$H") {
      if (!this.aj[22]) return "error:5";
      this.estado = "Home"; this._esperandoFin = true;
      const c = this._casa();   // como GRBL: primero Z, luego X e Y juntos
      this.plan.push({ hasta: { ...this.pos, z: c.z }, f: this.aj[25], homing: true });
      this.plan.push({ hasta: c, f: this.aj[25], homing: true, alFinal: () => {
        this.homed = true; this.estado = "Idle"; this._esperandoFin = false; this.fin = { ...this.pos };
        this._enviar("ok"); this._procesar();
      } });
      return null;
    }
    if (l.startsWith("$J=")) {
      if (this.estado === "Alarm") return "error:9";
      const w = this._palabras(l.slice(3));
      if (w.F === undefined) return "error:22";
      const rel = w.G?.includes(91);
      const maq = w.G?.includes(53);
      const base = rel ? this.fin : null;
      const o = this._offset();
      const t = { ...this.fin };
      for (const e of ["X", "Y", "Z"]) if (w[e] !== undefined) {
        const k = e.toLowerCase();
        t[k] = rel ? base[k] + w[e] : maq ? w[e] : w[e] + o[k];
      }
      if (this._fuera(t)) return "error:15";
      this.plan.push({ hasta: t, f: w.F, jog: true });
      this.fin = t;
      if (!this.hold) this.estado = "Jog";
      return "ok";
    }
    const m = l.match(/^\$(\d+)=([-\d.]+)$/);
    if (m) { this.aj[+m[1]] = +m[2]; this._guardar(); return "ok"; }
    return "error:3";
  }

  _palabras(l) {
    const w = { G: [], M: [] };
    for (const [, k, v] of l.matchAll(/([A-Z])([-+]?\d*\.?\d+)/g)) {
      if (k === "G" || k === "M") w[k].push(+v); else w[k] = +v;
    }
    return w;
  }
  // Dónde queda cada eje tras el homing (limits.c de GRBL 1.1): con su bit de $23, en el tope
  // negativo más el retroceso $27; sin él, en el positivo menos el retroceso.
  _casa() {
    const r = this.aj[27], c = {};
    ["x", "y", "z"].forEach((e, i) => { c[e] = this.aj[23] & (1 << i) ? -this.aj[130 + i] + r : -r; });
    return c;
  }
  _offset() { return { x: this.g54.x + this.g92.x, y: this.g54.y + this.g92.y, z: this.g54.z + this.g92.z }; }
  _fuera(t) {
    if (!this.aj[20]) return false;
    const e = 0.001;
    return t.x > e || t.y > e || t.z > e || t.x < -this.aj[130] - e || t.y < -this.aj[131] - e || t.z < -this.aj[132] - e;
  }

  _gcode(l) {
    const w = this._palabras(l);
    if (/[^A-Z0-9.+-]/.test(l)) return "error:1";
    const esc = this.mm ? 1 : 25.4;
    let maquina = false, probar = null, movio = false;
    for (const g of w.G) {
      if (g === 20) this.mm = false;
      else if (g === 21) this.mm = true;
      else if (g === 90) this.abs = true;
      else if (g === 91) this.abs = false;
      else if (g === 53) maquina = true;
      else if ([0, 1, 2, 3].includes(g)) this.modo = g;
      else if (g === 38.2 || g === 38.3) probar = g;
      else if (g === 4) {
        // G4 sincroniza: GRBL espera a vaciar el planificador, cuenta la pausa y luego responde
        this._esperandoFin = true;
        this.plan.push({ espera: w.P ?? 0, f: 0, alFinal: () => { this._esperandoFin = false; this._enviar("ok"); } });
        return null;
      } else if (g === 10) {
        const L = w.L, o = this._offset();
        const k = (e) => e.toLowerCase();
        for (const e of ["X", "Y", "Z"]) if (w[e] !== undefined) {
          if (L === 20) this.g54[k(e)] = this.fin[k(e)] - w[e] * esc - this.g92[k(e)];
          else if (L === 2) this.g54[k(e)] = w[e] * esc;
        }
        void o; this._guardar();
        return "ok";
      } else if (g === 92) {
        for (const e of ["X", "Y", "Z"]) if (w[e] !== undefined) {
          const k = e.toLowerCase(); this.g92[k] = this.fin[k] - this.g54[k] - w[e] * esc;
        }
        return "ok";
      } else if (g === 92.1) { this.g92 = { x: 0, y: 0, z: 0 }; return "ok"; }
      else if ([17, 40, 49, 54, 80, 94, 61].includes(g)) { /* sin efecto en la simulación */ }
      else return "error:20";
    }
    if (w.F !== undefined) this.f = w.F * esc;
    if (w.S !== undefined) this.s = w.S;
    for (const m of w.M) {
      if (m === 3 || m === 4) this.husillo = true;
      else if (m === 5) this.husillo = false;
      else if (m === 2 || m === 30) { this.husillo = false; this.reiniciarModal(); this.fin = { ...this.pos }; }
    }

    const hayEje = ["X", "Y", "Z"].some((e) => w[e] !== undefined);
    if (!hayEje) return "ok";
    const o = this._offset();
    const t = { ...this.fin };
    for (const e of ["X", "Y", "Z"]) if (w[e] !== undefined) {
      const k = e.toLowerCase(), v = w[e] * esc;
      t[k] = !this.abs && !maquina ? this.fin[k] + v : maquina ? v : v + o[k];
    }
    if (probar) {
      if (!this.f) return "error:22";
      this._esperandoFin = true;
      this.plan.push({ hasta: t, f: this.f, sonda: probar });
      this.fin = t;
      this.estado = "Run";
      return null;     // el ok llega al terminar el sondeo
    }
    if (this._fuera(t)) { this._alarma(2); return null; }
    const f = this.modo === 0 ? this.aj[110] : this.f;
    if (this.modo !== 0 && !f) return "error:22";
    if (this.modo === 2 || this.modo === 3) {
      const c = { x: this.fin.x + (w.I ?? 0) * esc, y: this.fin.y + (w.J ?? 0) * esc };
      const a0 = Math.atan2(this.fin.y - c.y, this.fin.x - c.x), a1 = Math.atan2(t.y - c.y, t.x - c.x);
      const r = Math.hypot(this.fin.x - c.x, this.fin.y - c.y);
      let da = a1 - a0;
      if (this.modo === 2 && da >= 0) da -= 2 * Math.PI;
      if (this.modo === 3 && da <= 0) da += 2 * Math.PI;
      const n = Math.max(2, Math.ceil(Math.abs(da) * r / 0.5));
      const z0 = this.fin.z;
      for (let i = 1; i <= n; i++) {
        const a = a0 + (da * i) / n;
        this.plan.push({ hasta: { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), z: z0 + ((t.z - z0) * i) / n }, f });
      }
    } else this.plan.push({ hasta: t, f });
    this.fin = t; movio = true;
    if (movio && !this.hold && this.estado !== "Alarm") this.estado = "Run";
    return "ok";
  }

  _alarma(n) {
    this.plan = []; this.lineas = []; this.hold = false; this._esperandoFin = false;
    this.estado = "Alarm"; this.fin = { ...this.pos };
    this._enviar(`ALARM:${n}`);
  }

  // ---------------- Movimiento ----------------
  _paso(dt) {
    dt *= this.velocidad;
    this._moviendo = false;
    if (this.hold || this.estado === "Alarm") return;
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
      const v = Math.min(m.f, m.homing ? 1e9 : this.aj[110]) / 60;   // mm/s
      const avance = v * tiempo;
      if (m.sonda) {
        // Avanza en pasitos para no atravesar la placa
        const paso = Math.min(avance, L, 0.01);
        if (L > 1e-6) { this.pos.x += (d.x / L) * paso; this.pos.y += (d.y / L) * paso; this.pos.z += (d.z / L) * paso; }
        tiempo -= paso / v;
        this._moviendo = true;
        if (this.contacto) {
          this.plan.shift(); this._finSonda(true, m.sonda); return;
        }
        if (L - paso <= 1e-6) { this.plan.shift(); this._finSonda(false, m.sonda); return; }
        continue;
      }
      this._moviendo = true;
      if (avance >= L) {
        this.pos = { ...m.hasta }; tiempo -= L / v; this.plan.shift(); m.alFinal?.();
      } else {
        this.pos.x += (d.x / L) * avance; this.pos.y += (d.y / L) * avance; this.pos.z += (d.z / L) * avance; tiempo = 0;
      }
      this.rastro.push({ ...this.pos });
      if (this.rastro.length > 60000) this.rastro.splice(0, 10000);
    }
    if (!this.plan.length && ["Run", "Jog"].includes(this.estado)) { this.estado = "Idle"; this.fin = { ...this.pos }; this._guardar(); }
    if (this.lineas.length) this._procesar();
  }

  _finSonda(ok, tipo) {
    this.prb = { ...this.pos, ok: ok ? 1 : 0 };
    this._enviar(`[PRB:${this.pos.x.toFixed(3)},${this.pos.y.toFixed(3)},${this.pos.z.toFixed(3)}:${ok ? 1 : 0}]`);
    this._esperandoFin = false;
    this.fin = { ...this.pos };
    if (!ok && tipo === 38.2) { this._alarma(5); return; }
    this.estado = this.plan.length ? "Run" : "Idle";
    this._enviar("ok");
    this._procesar();
  }

  // Lo recorrido desde la última vez, con todas las esquinas aunque la simulación vaya acelerada
  tomarRastro() {
    const r = this.rastro;
    this.rastro = [];
    return r;
  }

  // El usuario "toca" la fresa con el caimán (asistente de sonda)
  tocar(on) { this.contactoManual = on; }
}
