// datos.js - qué hace cada formato y qué elegir en Creality Scan. Lo usan el Visor 3D y las
// páginas de los escáneres (la misma tabla en los dos lados).

// guarda: malla, color (por vértice), textura (imagen). ✔ = 2, a medias = 1, no = 0
export const FORMATOS = [
  { id: "stl", t: "STL", para: "Imprimir en un color", guarda: { color: 0, textura: 0 }, colores: [] },
  { id: "3mf", t: "3MF", para: "Imprimir a color (Bambu, Creality Print, Prusa)", guarda: { color: 2, textura: 2 }, colores: ["vertice", "textura", "ninguno"] },
  { id: "obj", t: "OBJ", para: "Blender, Maya, Rhino", guarda: { color: 2, textura: 2 }, colores: ["textura", "vertice", "ninguno"], zip: true },
  { id: "glb", t: "GLB", para: "Web, realidad aumentada, compartir", guarda: { color: 2, textura: 2 }, colores: ["textura", "vertice", "ninguno"] },
  { id: "fbx", t: "FBX", para: "Unity, Unreal, 3ds Max", guarda: { color: 2, textura: 2 }, colores: ["textura", "vertice", "ninguno"], pesado: true },
  { id: "ply", t: "PLY", para: "MeshLab, CloudCompare", guarda: { color: 2, textura: 2 }, colores: ["vertice", "textura", "ninguno"] },
  { id: "asc", t: "ASC", para: "Nube de puntos para ingeniería inversa", guarda: { color: 2, textura: 0 }, colores: ["vertice", "ninguno"], puntos: true },
  { id: "cortes", t: "Cortes SVG / DXF", para: "Rebanadas para cortar en láser o CNC y apilar", guarda: { color: 0, textura: 0 }, colores: [], ir: "cortes" },
  { id: "step", t: "STEP", para: "Inventor, SolidWorks, Fusion", guarda: { color: 0, textura: 0 }, colores: [], pronto: true },
];

export const COLOR_T = { textura: "Textura (imagen)", vertice: "Color por vértice", ninguno: "Sin color" };

// Para qué lo quieres → formatos recomendados
export const USOS = [
  { id: "imprimir", t: "Imprimir", rec: ["stl", "3mf"], nota: "STL si imprimes en un color; 3MF si tu impresora es multicolor." },
  { id: "web", t: "Web / AR", rec: ["glb"], nota: "GLB lleva todo en un archivo: se abre en el navegador, en Windows y en el celular." },
  { id: "animar", t: "Blender / Unity", rec: ["obj", "fbx", "glb"], nota: "OBJ con su textura para Blender; FBX para Unity y Unreal." },
  { id: "cad", t: "CAD", rec: ["stl", "step"], nota: "Inventor y Fusion importan STL o OBJ como malla. STEP llega pronto." },
  { id: "cortar", t: "Láser / CNC", rec: ["cortes"], nota: "Rebanadas del modelo del grosor de tu material, listas para cortar y apilar." },
];

// Las opciones de «Exportar» de Creality Scan, en su orden
export const CREALITY = [
  { op: "3mf (Textura)", que: "Malla con color por vértice. No trae imagen.", para: "Imprimir a color o abrir aquí con color. Es el más cómodo: un solo archivo.", rec: true },
  { op: "obj (Mapeo de colores)", que: "OBJ + MTL + imagen PNG de la textura.", para: "Blender y web: el color más nítido. Abre los 3 archivos juntos." },
  { op: "ply (Mapeo de colores)", que: "PLY + imagen PNG de la textura.", para: "MeshLab, o aquí: arrastra el PLY y el PNG juntos." },
  { op: "stl (Malla)", que: "Solo la forma.", para: "Imprimir en un color." },
  { op: "ply · 3mf · obj (Malla)", que: "Solo la forma, en otro formato.", para: "Cuando el programa que sigue no lee STL." },
  { op: "asc (Nube de puntos)", que: "Puntos sueltos, sin triángulos.", para: "Ingeniería inversa. No se puede imprimir así." },
  { op: "all", que: "Todos los anteriores.", para: "Si no sabes qué vas a necesitar." },
];
