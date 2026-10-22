// hornear.js - textura → color por vértice (para los formatos que no guardan imagen: PLY de color,
// 3MF de color, ASC). Se lee el píxel de la textura en la coordenada UV de cada vértice.
// Necesita createImageBitmap y OffscreenCanvas (navegador o worker).

export async function hornear(m) {
  if (!m.uv || !m.textura) return m;
  const bmp = await createImageBitmap(new Blob([m.textura.datos], { type: m.textura.tipo }));
  const lienzo = new OffscreenCanvas(bmp.width, bmp.height), g = lienzo.getContext("2d");
  g.drawImage(bmp, 0, 0);
  const { data, width: W, height: H } = g.getImageData(0, 0, bmp.width, bmp.height);
  const nv = m.pos.length / 3, col = new Uint8Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    let u = m.uv[v * 2] % 1, w = m.uv[v * 2 + 1] % 1;
    if (u < 0) u += 1; if (w < 0) w += 1;
    const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(H - 1, Math.floor((1 - w) * H)), o = (y * W + x) * 4;
    col[v * 4] = data[o]; col[v * 4 + 1] = data[o + 1]; col[v * 4 + 2] = data[o + 2]; col[v * 4 + 3] = 255;
  }
  bmp.close?.();
  return { ...m, col };
}
