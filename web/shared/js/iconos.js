// iconos.js - un solo set de íconos para las apps del Fab Lab: trazo 1.8, caja 24, lineal.
// Los rellenos solo marcan selección. Al importarlo, el sprite se agrega al documento y
// ico("casa") de ui.js lo usa con <use href="#i-casa">.

const SIMBOLOS = {
  casa: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
  "casa-on": '<path d="M12 3.2 3.2 11h2.3v9.5h13V11h2.3z" fill="currentColor" stroke="none"/>',
  mover: '<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  consola: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m7 10 3 2-3 2M12.5 15H17"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  atras: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alerta: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2v.1"/>',
  play: '<path d="M7.5 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
  pausa: '<path d="M8.5 5v14M15.5 5v14"/>',
  abrir: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  bajar: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  candado: '<rect x="5" y="11" width="14" height="9.5" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.6-1.7"/>',
  mira: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/>',
  subir: '<path d="M12 20V6M6.5 11.5 12 6l5.5 5.5M5 3.5h14"/>',
  aire: '<path d="M3.5 9h11a3 3 0 1 0-3-3M3.5 15h14a3 3 0 1 1-3 3"/>',
  ruta: '<rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="3 2.5"/><circle cx="4" cy="4" r="1.6" fill="currentColor"/>',
  capas: '<path d="m12 4 9 4.5-9 4.5-9-4.5z"/><path d="m3 13 9 4.5 9-4.5"/>',
  usb: '<path d="M8.5 3v5M15.5 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3"/>',
  sim: '<rect x="3" y="4" width="18" height="12" rx="2.5"/><path d="M8 20h8M12 16v4"/>',
  agrandar: '<path d="M14 4h6v6M20 4l-6 6M10 20H4v-6M4 20l6-6"/>',
  achicar: '<path d="M20 10h-6V4M14 10l6-6M4 14h6v6M10 14l-6 6"/>',
  libro: '<path d="M12 6.5C10.2 5 7.6 4.5 4 4.5v13c3.6 0 6.2.5 8 2 1.8-1.5 4.4-2 8-2v-13c-3.6 0-6.2.5-8 2zM12 6.5v13"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>',
  clic: '<path d="M9 9.5 12.2 21l1.9-4.6 4.6-1.9z"/><path d="M9 2.8v2.4M4.3 4.3 6 6M2.8 9h2.4M13.7 4.3 12 6"/>',
  interfaz: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 9v11"/>',
  sonda: '<path d="M12 3v10M9 13h6l-3 5z"/><path d="M5 21h14"/>',
  // láser
  laser: '<path d="M8 3h8v7l-2 3h-4l-2-3z"/><path d="M12 13v5M9.5 21h5M12 18l-2.5 3M12 18l2.5 3"/>',
  llama: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.3 3.6-8.3 1.9 1.2 2.6 3 2.6 4.6 1-.6 1.6-1.8 1.7-3.2 2.4 1.7 5.1 4.2 5.1 7.2 0 3.4-2.7 5.9-6.5 5.9z"/>',
  tapa: '<path d="M3.5 20h17M5 20v-7h14v7"/><path d="M5 13 9 5.5h10"/>',
  imagen: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5.5-5 4 3.5L17 13l3 3"/>',
  vector: '<path d="M5 19 19 5"/><rect x="2.5" y="16.5" width="5" height="5" rx="1"/><rect x="16.5" y="2.5" width="5" height="5" rx="1"/><path d="M5 16.5C5 9 9 5 16.5 5"/>',
  material: '<path d="m3 8.5 9-4 9 4-9 4z"/><path d="M3 8.5V15l9 4.5 9-4.5V8.5M12 12.5v7"/>',
  foco: '<path d="M12 3v6M8.5 6.5 12 10l3.5-3.5"/><path d="M4 14h16M7 17.5h10M10 21h4"/>',
  // visor 3D
  cubo: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  tijeras: '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8 20 18M8.6 16 20 6"/>',
  escoba: '<path d="M14.5 3.5 10 12"/><path d="M6.5 11.5 13.5 14l-1.5 6.5c-3-.5-6.5-2.5-8-5.5z"/><path d="M8 15.5 6.5 19"/>',
  regla: '<path d="m3.5 15.5 12-12 5 5-12 12z"/><path d="m7.5 11.5 2 2M10.5 8.5l2 2M13.5 5.5l2 2"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  rehacer: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  girar: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4.5h-4.5"/>',
  caja: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  lazo: '<path d="M12 4c4.4 0 8 2.2 8 5s-3.6 5-8 5-8-2.2-8-5 3.6-5 8-5z"/><path d="M6.5 13c-1 1.5-1 3.5 1 4.5l1.5.5-1 3"/>',
  plano: '<path d="m3 15 6-6h12l-6 6z"/><path d="M12 3v18"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  camara: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  escaner: '<rect x="3" y="7" width="18" height="10" rx="3"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/>',
};

const svg = `<svg xmlns="http://www.w3.org/2000/svg" hidden aria-hidden="true">${Object.entries(SIMBOLOS)
  .map(([id, d]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${d}</symbol>`).join("")}</svg>`;
document.body.insertAdjacentHTML("afterbegin", svg);
