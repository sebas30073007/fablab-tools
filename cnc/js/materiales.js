// materiales.js - qué se corta. Cada material llena los valores que ya existen en Configuración
// (profundidad, bajadas, avance, sentido de corte…); después todo sigue siendo editable.
//
// La placa de cobre reproduce exactamente los valores de siempre (cam.DEF), así que con PCB nada
// cambia. Los demás son valores de arranque para una fresa de maíz de 1 a 3 mm en la Cubiko:
// conviene confirmarlos con un corte de prueba.
//
//   margen   cuánto baja de más el contorno bajo el grosor (entra en el MDF de sacrificio)
//   pasoZ    lo más que baja la fresa en cada pasada
//   resto    lo que dejan los puentes de material
//   climb    sentido de corte. Concordancia (true): la fresa gira a favor del avance; el filo entra
//            grueso y sale fino, se calienta menos y deja mejor borde en cobre y acrílico (que se
//            funde si roza). Convencional (false): en madera y MDF, una máquina ligera no deja que
//            la fresa «jale» hacia el material.
//   acabado  lo que deja el desbaste junto a la pieza para una última vuelta fina a toda profundidad
//   conduce  si la sonda puede tocar el material directamente (si no: placa de contacto o papel)

export const MATERIALES = {
  cobre:    { t: "Copper-clad board", corto: "FR4",      grosor: 1.6, conduce: true,  margen: 0.25, pasoZ: 0.5,  resto: 0.7, f: 120, fz: 60, rpm: 10000, climb: true,  acabado: 0 },
  acrilico: { t: "Acrylic",       corto: "Acrylic", grosor: 3,   conduce: false, margen: 0.3,  pasoZ: 0.5,  resto: 0.8, f: 300, fz: 50, rpm: 10000, climb: true,  acabado: 0.15 },
  mdf:      { t: "MDF",            corto: "MDF",      grosor: 3,   conduce: false, margen: 0.3,  pasoZ: 0.75, resto: 1,   f: 400, fz: 80, rpm: 10000, climb: false, acabado: 0.1 },
  madera:   { t: "Wood or plywood", corto: "Wood", grosor: 3,   conduce: false, margen: 0.3,  pasoZ: 0.75, resto: 1,   f: 400, fz: 80, rpm: 10000, climb: false, acabado: 0.1 },
  otro:     { t: "Other",           corto: "Material", conduce: false },
};

export const material = (tipo) => MATERIALES[tipo] || MATERIALES.cobre;

// Valores que dependen del grosor. Con «todo», también los propios del material (avance, rpm, sentido…).
export function derivar(P, grosor, tipo, todo = false) {
  const m = MATERIALES[tipo];
  if (!m || tipo === "otro") return P;
  const r2 = (v) => Math.round(v * 100) / 100;
  P.contorno.prof = r2(grosor + m.margen);
  P.contorno.pasadas = Math.max(1, Math.ceil(P.contorno.prof / m.pasoZ - 1e-9));
  P.contorno.zPuente = -r2(Math.max(0.2, grosor - m.resto));
  P.hoyos.prof = r2(grosor + 0.2);
  if (P.vaciado) P.vaciado.pasadas = Math.max(1, Math.ceil(P.vaciado.prof / m.pasoZ - 1e-9));
  if (todo) {
    Object.assign(P.contorno, { f: m.f, fz: m.fz, acabado: m.acabado });
    if (P.vaciado) Object.assign(P.vaciado, { f: m.f, fz: m.fz });
    Object.assign(P.comun, { rpm: m.rpm, climb: m.climb });
  }
  return P;
}
