// materiales.js - biblioteca de materiales para la S1 de 40 W.
//
// Tres operaciones por material:
//   corte    atraviesa el material (vector, M3, aire fuerte)
//   marcado  línea en la superficie (vector, M3)
//   grabado  rellena áreas o imágenes renglón por renglón (raster, M4)
// Potencia en %, velocidad en mm/s (como en xTool Studio), pasadas, aire 0–4.
//
// POR VALIDAR: son valores de partida, cerca de los que sugiere xTool para la S1 de 40 W. Cada
// material del laboratorio se prueba con una matriz de prueba y aquí se anota lo que funcionó
// (validado: "2026-10-xx · quién").

export const OPERACIONES = {
  corte: { t: "Corte", color: "#7C3AED", tipo: "vector" },
  marcado: { t: "Marcado", color: "#2563EB", tipo: "vector" },
  grabado: { t: "Grabado", color: "#0F766E", tipo: "raster" },
};

const m = (id, t, grosor, ops, extra = {}) => ({ id, t, grosor, ops, validado: null, ...extra });

export const MATERIALES = [
  m("triplay3", "Triplay de 3 mm", 3, {
    corte: { potencia: 100, velocidad: 12, pasadas: 1, aire: 4 },
    marcado: { potencia: 20, velocidad: 100, pasadas: 1, aire: 1 },
    grabado: { potencia: 30, velocidad: 300, pasadas: 1, aire: 1, densidad: 10 },
  }, { tono: "#D9B98B" }),
  m("mdf3", "MDF de 3 mm", 3, {
    corte: { potencia: 100, velocidad: 8, pasadas: 1, aire: 4 },
    marcado: { potencia: 20, velocidad: 100, pasadas: 1, aire: 1 },
    grabado: { potencia: 35, velocidad: 300, pasadas: 1, aire: 1, densidad: 10 },
  }, { tono: "#B98F62" }),
  m("acrilicoNegro3", "Acrílico negro de 3 mm", 3, {
    corte: { potencia: 100, velocidad: 4, pasadas: 2, aire: 4 },
    marcado: { potencia: 40, velocidad: 60, pasadas: 1, aire: 1 },
    grabado: { potencia: 40, velocidad: 200, pasadas: 1, aire: 1, densidad: 10 },
  }, { tono: "#202226", nota: "Solo acrílico negro u opaco oscuro: el láser de diodo no corta acrílico transparente ni azul." }),
  m("carton2", "Cartón de 2 mm", 2, {
    corte: { potencia: 60, velocidad: 30, pasadas: 1, aire: 4 },
    marcado: { potencia: 10, velocidad: 150, pasadas: 1, aire: 1 },
    grabado: { potencia: 15, velocidad: 400, pasadas: 1, aire: 1, densidad: 8 },
  }, { tono: "#C9A876" }),
  m("cartulina", "Cartulina o papel", 0.3, {
    corte: { potencia: 25, velocidad: 100, pasadas: 1, aire: 2 },
    marcado: { potencia: 6, velocidad: 200, pasadas: 1, aire: 0 },
    grabado: { potencia: 10, velocidad: 400, pasadas: 1, aire: 0, densidad: 8 },
  }, { tono: "#F2EEE6" }),
  m("piel2", "Piel de 2 mm", 2, {
    corte: { potencia: 100, velocidad: 10, pasadas: 1, aire: 4 },
    marcado: { potencia: 15, velocidad: 120, pasadas: 1, aire: 1 },
    grabado: { potencia: 20, velocidad: 300, pasadas: 1, aire: 1, densidad: 10 },
  }, { tono: "#8C5A3C", nota: "Solo piel natural. La piel sintética puede tener PVC: no se corta." }),
  m("inox", "Acero inoxidable (solo grabado)", 1, {
    marcado: { potencia: 100, velocidad: 30, pasadas: 2, aire: 0 },
    grabado: { potencia: 100, velocidad: 50, pasadas: 1, aire: 0, densidad: 15 },
  }, { tono: "#B8BEC6", noCorta: true }),
];

// Lo que nunca entra a la láser: humo tóxico o corrosivo, o fuego
export const PROHIBIDOS = [
  "PVC y vinil (cloro: humo tóxico y corrosivo)",
  "Piel sintética o con PVC",
  "Policarbonato y ABS (se funden y arden)",
  "Fibra de vidrio y fibra de carbono",
  "Espuma de poliestireno (unicel) y espumas",
  "Teflón (PTFE)",
];

export const porId = (id) => MATERIALES.find((x) => x.id === id) || MATERIALES[0];

// Valores de una operación para un material, con los que la persona haya cambiado encima
export function ajustes(material, op, propios = {}) {
  const base = material.ops[op];
  if (!base) return null;
  return { ...base, ...(propios[material.id]?.[op] || {}) };
}
