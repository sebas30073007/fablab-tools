// perfil-s1.js - todo lo que sabemos (y lo que falta confirmar) de la xTool S1 40 W por USB.
//
// De dónde sale (docs/xtool-s1.md):
//   · la extensión de la S1 dentro de xTool Studio 1.9.11 (resources/exts.zip → S1/index.js):
//     encabezado del G-code, códigos de estado M222, consultas y órdenes
//   · ha-xtool (Home Assistant, probado en una S1): respuestas por WebSocket
//   · foro de LightBurn: la S1 por USB con G-code en streaming, `$L` al inicio, M802 = sensor de tapa
//
// Lo marcado «por confirmar» se ajusta aquí con lo que diga diagnostico.html en la máquina real.

export const PERFIL = {
  nombre: "xTool S1 40 W",
  // ---- puerto ----
  baud: 115200,                 // por confirmar (diagnóstico prueba 115200, 230400 y 921600)
  bauds: [115200, 230400, 921600],
  rx: 120,                      // bytes en vuelo; por confirmar (LightBurn usa modo «Buffered»)
  esperaOk: 4000,               // ms sin `ok` para dar por perdida una consulta automática
  sondeo: 500,                  // ms entre consultas de estado con la máquina quieta
  // ---- área ----
  area: { x: 498, y: 319 },     // 40 W; M223 la reporta al conectar
  alturaUtil: 42,               // mm bajo el módulo sin base elevadora
  // ---- potencia y velocidad ----
  sMax: 1000,                   // por confirmar: escala de S (xTool Studio calcula powerFactor = potencia / 1000)
  rapido: 9600,                 // mm/min de los G0 (xTool Studio pone G0 F9600)
  velMax: 36000,                // mm/min del catálogo (600 mm/s)
  // ---- G-code ----
  // Encabezado de xTool Studio (gCodeHead del S1), sin lo de accesorios ni eje U
  encabezado: ({ ancho, alto, extractor = true }) => [
    "M110 X1 Y1 Z1",              // sistema de coordenadas de la S1
    "M109 S1",                    // sin la cruz roja: el láser real
    `M223 X${ancho} Y${alto}`,    // tamaño del trabajo
    extractor ? "M7 S1" : "M7 S0",
    "M96 S0",
    "G90",
    "G0 Z0",
    "G0 F9600",
    "G1 F1000",
  ],
  pie: () => ["M5", "G90", "M6"],
  // Antes de mover con la cruz roja (encuadre): xTool Studio manda M110 X1 Y1 Z1 + G90 + G0
  mover: (x, y, f = 9600) => ["M110 X1 Y1 Z1", "G90", `G0 X${x.toFixed(2)} Y${y.toFixed(2)} F${Math.round(f)}`],
  // ---- consultas ----
  consultas: { info: "M2003", estado: "M222", posicion: "M303", area: "M223", aire: "M15", flama: "M340" },
  // Pausa, reanudar y cancelar van fuera de la cola (la máquina debe recibirlas aunque el búfer esté lleno)
  pausar: "M22 S1", reanudar: "M22 S0", cancelar: "M108",
  casa: { xy: "M111 S3", z: "M111 S2", todo: "M111 S7" },
};

// M222 S<n>: estado de trabajo. tipo: quieta | ocupada | pausa | alarma | fin
export const ESTADOS = {
  0: { t: "Iniciando", tipo: "ocupada" },
  1: { t: "Lista", tipo: "quieta" },
  2: { t: "Configurando WiFi", tipo: "ocupada" },
  3: { t: "Lista", tipo: "quieta" },
  4: { t: "La máquina se movió", tipo: "alarma", pasos: ["Ponla en una superficie firme", "Revisa que nada la haya golpeado", "Vuelve a conectar"] },
  7: { t: "Tapa abierta", tipo: "alarma", pasos: ["Cierra la tapa", "El trabajo se canceló: vuelve a empezar"] },
  9: { t: "Flama detectada", tipo: "alarma", pasos: ["No abras la tapa de golpe", "Si sigue la flama, usa el extintor", "Revisa el material y la potencia antes de seguir"] },
  10: { t: "Midiendo", tipo: "ocupada" },
  11: { t: "Encuadre listo", tipo: "ocupada" },
  12: { t: "Encuadrando", tipo: "ocupada" },
  13: { t: "Lista para cortar", tipo: "ocupada" },
  14: { t: "Cortando", tipo: "ocupada" },
  15: { t: "En pausa", tipo: "pausa" },
  16: { t: "Actualizando firmware", tipo: "ocupada" },
  17: { t: "Dormida", tipo: "quieta" },
  18: { t: "Cancelando", tipo: "ocupada" },
  19: { t: "Terminado", tipo: "fin" },
  20: { t: "Fuera del área", tipo: "alarma", pasos: ["El diseño se sale del área de trabajo", "Muévelo o achícalo y vuelve a empezar"] },
  21: { t: "Error de WiFi", tipo: "alarma", pasos: ["Apaga y enciende la máquina"] },
  22: { t: "Error del láser", tipo: "alarma", pasos: ["Apaga la máquina", "Revisa que el módulo láser esté bien puesto", "Si sigue, avisa al responsable del laboratorio"] },
  24: { t: "Midiendo el área", tipo: "ocupada" },
};

// Aire: M15 S<0-4> (marchas del compresor)
export const AIRE = ["Apagado", "1", "2", "3", "4"];
