// alturas.js - mapa de alturas de la placa (autoleveling).
//
// Se sondea una malla sobre el área del trabajo y luego cada corte se ajusta en Z
// con interpolación bilineal. Los valores son Z de trabajo en el punto de contacto:
// con Z0 bien puesto, el punto donde se calibró vale ~0 y el resto es la desviación.
//
// Formato .map compatible con Candle:
//   x;y;ancho;alto
//   nx;ny;zInferior;zSuperior
//   0;20;20
//   fila y0: z;z;z…   (ny filas de nx valores)

export class MapaAlturas {
  constructor({ x, y, ancho, alto, nx, ny }) {
    Object.assign(this, { x, y, ancho, alto, nx: Math.max(2, nx), ny: Math.max(2, ny) });
    this.z = this.z.bind(this);
    this.valores = Array.from({ length: this.ny }, () => Array(this.nx).fill(null));
  }

  punto(i, j) {
    return { x: this.x + (this.ancho * i) / (this.nx - 1), y: this.y + (this.alto * j) / (this.ny - 1) };
  }

  // Orden en serpentina para viajar poco
  *recorrido() {
    for (let j = 0; j < this.ny; j++)
      for (let k = 0; k < this.nx; k++) {
        const i = j % 2 ? this.nx - 1 - k : k;
        yield { i, j, ...this.punto(i, j) };
      }
  }

  get completo() { return this.valores.every((f) => f.every((v) => v !== null)); }
  get rango() {
    const v = this.valores.flat().filter((x) => x !== null);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
  }

  z(x, y) {
    const fx = Math.min(this.nx - 1, Math.max(0, ((x - this.x) / this.ancho) * (this.nx - 1)));
    const fy = Math.min(this.ny - 1, Math.max(0, ((y - this.y) / this.alto) * (this.ny - 1)));
    const i = Math.min(this.nx - 2, Math.floor(fx)), j = Math.min(this.ny - 2, Math.floor(fy));
    const u = fx - i, v = fy - j, V = this.valores;
    const g = (a, b) => V[b][a] ?? 0;
    return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
  }

  aMap() {
    const f = (n) => n.toFixed(2);
    const r = this.rango || { min: -1, max: 1 };
    return [
      `${f(this.x)};${f(this.y)};${f(this.ancho)};${f(this.alto)}`,
      `${this.nx};${this.ny};${f(Math.min(-1, r.min))};${f(Math.max(1, r.max))}`,
      "0;20;20",
      ...this.valores.map((fila) => fila.map((v) => (v ?? 0).toFixed(3)).join(";")),
    ].join("\n");
  }

  static deMap(texto) {
    const l = texto.trim().split(/\r?\n/).map((s) => s.split(";").map(Number));
    const [x, y, ancho, alto] = l[0];
    const [nx, ny] = l[1];
    const m = new MapaAlturas({ x, y, ancho, alto, nx, ny });
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) m.valores[j][i] = l[3 + j]?.[i] ?? 0;
    return m;
  }
}
