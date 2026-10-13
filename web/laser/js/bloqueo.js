// bloqueo.js - órdenes que la app nunca manda a la S1, ni desde la consola ni dentro de un archivo.
//
// Salen de la extensión de xTool Studio, de ha-xtool y del foro de LightBurn: apagan una protección,
// cambian el modo de la máquina o la dejan sin responder. La consola las rechaza con el motivo;
// un archivo que las trae no se corre.

const REGLAS = [
  { re: /^M802(?!\d)\s*S?1\b/, t: "desactiva el sensor de la tapa" },
  { re: /^M341\b/, t: "borra la configuración de WiFi" },
  { re: /^M9006\b/, t: "reinicia la máquina a la fuerza" },
  { re: /^M22(?!\d)\s*S?[34]\b/, t: "entra a modo de actualización de firmware o de medición" },
  { re: /^M807\b/, t: "entra o sale del cargador de arranque" },
  { re: /^M2810\b/, t: "orden de fábrica" },
  { re: /^M120\b/, t: "orden de fábrica" },
  { re: /^M9097\b/, t: "corta la conexión" },
  { re: /^M340(?!\d)\s*S?2\b/, t: "apaga la alarma de flama" },
  { re: /^M318(?!\d)\s*N?0\b/, t: "quita el paro al moverse la máquina" },
  { re: /^M36\b/, t: "enciende el láser fijo, sin moverse" },
  { re: /^M109(?!\d)\s*S?1\b.*M36/, t: "enciende el láser fijo, sin moverse" },
  { re: /^\$(?!L$)/, t: "ajuste de firmware: se cambia solo con xTool Studio" },
];

const normal = (l) => String(l).replace(/;.*$/, "").replace(/\([^)]*\)/g, "").trim().toUpperCase();

// null si se puede mandar; si no, el motivo
export function bloqueada(linea) {
  const l = normal(linea);
  if (!l) return null;
  for (const r of REGLAS) if (r.re.test(l)) return r.t;
  return null;
}

// Revisa un programa completo: [{n, linea, motivo}] con lo que no se puede mandar
export function revisar(lineas) {
  const malas = [];
  lineas.forEach((l, n) => { const m = bloqueada(l); if (m) malas.push({ n: n + 1, linea: String(l).trim(), motivo: m }); });
  return malas;
}
