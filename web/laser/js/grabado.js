// grabado.js - imagen → renglones de G-code para grabar (raster).
//
//   tramar(gris, W, H, modo, umbral) → Uint8Array de 0..255 (0 = quema al máximo, 255 = no quema)
//   gcodeGrabado(img, op, lugar)      → líneas de G-code
//
// La imagen se remuestrea a la densidad del grabado (líneas por mm, igual en X y en Y). Cada renglón
// va de ida y de vuelta (bidireccional), con sobrebarrido a los lados para que el cabezal llegue a
// velocidad antes de quemar. Con M4 (potencia dinámica, como hace xTool Studio con las imágenes) la
// potencia sigue a la velocidad: en las curvas de aceleración no se quema de más.

// ---------------- Imagen ----------------
// fuente: <img>, <canvas> o ImageBitmap. Devuelve el gris (0 negro … 255 blanco) a W × H píxeles.
export function aGris(fuente, W, H, { invertir = false, brillo = 0, contraste = 0 } = {}) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);       // lo transparente no se graba
  x.imageSmoothingQuality = "high";
  x.drawImage(fuente, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H);
  const k = (259 * (contraste + 255)) / (255 * (259 - contraste));
  for (let i = 0; i < W * H; i++) {
    let v = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    v = k * (v - 128) + 128 + brillo;
    if (invertir) v = 255 - v;
    g[i] = Math.max(0, Math.min(255, v));
  }
  return g;
}

// Difusión de error: lo que se redondea en un píxel se reparte a los vecinos
const NUCLEOS = {
  floyd: { div: 16, k: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  jarvis: { div: 48, k: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]] },
};

// modo: "umbral" | "floyd" | "jarvis" | "gris" (gris = potencia proporcional, sin tramar)
export function tramar(gris, W, H, modo = "jarvis", umbral = 128) {
  const out = new Uint8Array(W * H);
  if (modo === "gris") { for (let i = 0; i < out.length; i++) out[i] = gris[i]; return out; }
  if (modo === "umbral") { for (let i = 0; i < out.length; i++) out[i] = gris[i] < umbral ? 0 : 255; return out; }
  const g = Float32Array.from(gris), N = NUCLEOS[modo] || NUCLEOS.jarvis;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, v = g[i] < umbral ? 0 : 255, e = g[i] - v;
    out[i] = v;
    for (const [dx, dy, w] of N.k) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < W && yy < H) g[yy * W + xx] += (e * w) / N.div;
    }
  }
  return out;
}

// Vista previa: la imagen tramada como la verá la máquina (para el panel y el gemelo)
export function aLienzo(px, W, H) {
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const x = cv.getContext("2d"), im = x.createImageData(W, H);
  for (let i = 0; i < W * H; i++) { const v = px[i]; im.data.set([v, v, v, 255], i * 4); }
  x.putImageData(im, 0, 0);
  return cv;
}

// ---------------- G-code ----------------
const f2 = (v) => (Math.abs(v) < 5e-3 ? 0 : v).toFixed(2).replace(/\.?0+$/, "");

// img: { px, W, H } ya tramada a la densidad del grabado
// op: { potencia (%), potenciaMin (%), velocidad (mm/min), sobrebarrido (mm), bidireccional }
// lugar: { x, y, ancho, alto, limiteX } en mm de la máquina (esquina de arriba a la izquierda del diseño;
// limiteX: hasta dónde puede llegar el sobrebarrido)
// sMax: la S que corresponde al 100 %
export function gcodeGrabado(img, op, lugar, sMax = 1000) {
  const { px, W, H } = img;
  const dx = lugar.ancho / W, dy = lugar.alto / H;
  const sMaxOp = Math.round((op.potencia / 100) * sMax), sMinOp = Math.round(((op.potenciaMin ?? 0) / 100) * sMax);
  const sDe = (v) => (v >= 255 ? 0 : Math.round(sMinOp + ((255 - v) / 255) * (sMaxOp - sMinOp)));
  const ob = op.sobrebarrido ?? 2;
  const L = [`G1 F${Math.round(op.velocidad)}`];
  let ida = true;
  for (let j = 0; j < H; j++) {
    const y = lugar.y + (j + 0.5) * dy;
    // Tramos de igual potencia en este renglón
    const tramos = [];
    let i = 0;
    while (i < W) {
      const s = sDe(px[j * W + i]);
      let k = i + 1;
      while (k < W && sDe(px[j * W + k]) === s) k++;
      tramos.push({ a: i, b: k, s });
      i = k;
    }
    // Sin nada que quemar: el renglón se salta
    const conQuema = tramos.filter((t) => t.s > 0);
    if (!conQuema.length) continue;
    const ini = conQuema[0].a, fin = conQuema[conQuema.length - 1].b;
    const xa = lugar.x + ini * dx, xb = lugar.x + fin * dx;
    const orden = tramos.filter((t) => t.b > ini && t.a < fin);
    if (!(op.bidireccional ?? true)) ida = true;
    if (ida) {
      L.push(`G0 X${f2(Math.max(0, xa - ob))} Y${f2(y)} S0`);
      L.push(`G1 X${f2(xa)} S0`);
      for (const t of orden) L.push(`G1 X${f2(lugar.x + Math.min(t.b, fin) * dx)} S${t.s}`);
      L.push(`G1 X${f2(Math.min(lugar.limiteX ?? Infinity, xb + ob))} S0`);
    } else {
      L.push(`G0 X${f2(Math.min(lugar.limiteX ?? Infinity, xb + ob))} Y${f2(y)} S0`);
      L.push(`G1 X${f2(xb)} S0`);
      for (const t of orden.slice().reverse()) L.push(`G1 X${f2(lugar.x + Math.max(t.a, ini) * dx)} S${t.s}`);
      L.push(`G1 X${f2(Math.max(0, xa - ob))} S0`);
    }
    ida = !ida;
  }
  return L;
}
