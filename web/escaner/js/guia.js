// guia.js - la guía de Creality Scan para cada escáner, paso a paso, y las recetas de ajustes.
// Fuentes: ficha y wiki de Creality (tutorial del Otter, 2026), reseña del Pika de CNX Software
// (jul 2026) y lo que se probó en el laboratorio con el búho. Cada paso mueve el gemelo:
//   gemelo: { vista, modo, girar }
// Los textos van cortos arriba; el detalle va en «puntos».

const comunes = {
  preparar: {
    id: "preparar", t: "Preparar", titulo: "Prepara la pieza",
    texto: "Que se quede quieta y se vea bien. Lo negro o brillante no lo lee el escáner.",
    puntos: [
      "Ponla al centro de la tornamesa, sobre algo que no se mueva.",
      "Si es negra, brillante o transparente: una capa fina de talco o de spray para escanear.",
      "Luz pareja y sin sol directo si quieres el color.",
      "Pon la torre de marcadores (o marcadores pegados) cerca de la pieza: ayudan a no perderse.",
    ],
    gemelo: { vista: "tornamesa", modo: "apagado", girar: false },
  },
  voltear: {
    id: "voltear", t: "La base", titulo: "Escanea la base",
    texto: "Lo que tocaba la tornamesa no se ve. Voltea la pieza y haz otro escaneo en el mismo proyecto.",
    puntos: [
      "En Creality Scan: Nuevo escaneo (dentro del mismo proyecto).",
      "Acuesta o voltea la pieza y escanea otra vez, dejando partes que ya se vieron.",
      "Después: Alineación → automática, o manual marcando 3 puntos iguales en cada escaneo.",
      "Si solo la vas a ver por arriba, sáltate este paso: luego cierras la base en el Visor 3D con un corte plano.",
    ],
    gemelo: { vista: "tornamesa", modo: "apagado", girar: false },
  },
  procesar: {
    id: "procesar", t: "Procesar", titulo: "Procesa en Creality Scan",
    texto: "Fusión → Malla → Mapeo de color. Un clic (One-click) sirve, pero a mano sale mejor.",
    puntos: [
      "Fusión de nube de puntos: resolución 0.1 a 0.15 mm para piezas de menos de 25 cm.",
      "Edita la nube antes de la malla: borra la mesa, la tornamesa y lo que sobre (lazo, borrar).",
      "Malla: sube los triángulos para más detalle; activa rellenar huecos y hermética si es para imprimir.",
      "Mapeo de color (Procesar malla → Mapeo de color): solo si activaste el color antes de escanear.",
    ],
    gemelo: { vista: "mesa", modo: "apagado", girar: false },
  },
  exportar: {
    id: "exportar", t: "Exportar", titulo: "Exporta y ábrelo aquí",
    texto: "Exporta «3mf (Textura)»: un solo archivo con color. Ábrelo en el Visor 3D para limpiarlo y convertirlo.",
    puntos: [
      "Exportar → 3mf (Textura). Si lo quieres más nítido para Blender o la web: obj (Mapeo de colores).",
      "En el Visor 3D: elige la cara de abajo, quita lo que sobra, revisa los huecos.",
      "De ahí sale a STL o 3MF para imprimir, GLB para la web, FBX para Unity o cortes para el láser.",
    ],
    gemelo: { vista: "escaner", modo: "apagado", girar: false },
    visor: true,
  },
};

export const GUIAS = {
  pika: [
    comunes.preparar,
    {
      id: "encender", t: "Encender", titulo: "Carga y enciende el Pika",
      texto: "Mete una batería y deja presionado el botón de encendido (arriba, del lado derecho).",
      puntos: [
        "Trae dos baterías de 3350 mAh: cerca de 70 min cada una, se cambian sin apagar el proyecto.",
        "Si la pantalla no pasa del idioma, la batería está muy baja: cárgala por USB-C.",
        "Arriba también está el botón de disparo (▷): empieza y pausa el escaneo.",
      ],
      gemelo: { vista: "arriba", modo: "apagado", girar: false },
    },
    {
      id: "conectar", t: "Conectar", titulo: "Conecta con la compu",
      texto: "En el lab: cable USB-C a la compu, con el interruptor del costado en USB.",
      puntos: [
        "Interruptor USB / WLAN en el costado derecho. USB = cable a la compu (más rápido: hasta 110 cuadros por segundo).",
        "WLAN: el Pika crea su propia red Wi-Fi; conéctate desde el celular (app Creality Scan) o desde la compu.",
        "En la compu: Creality Scan 4 (versión 4.3 o más nueva). No hay versión para Linux.",
        "Un celular lento (menos de 8 GB de RAM) no da: el láser azul no captura.",
      ],
      gemelo: { vista: "lado", modo: "apagado", girar: false },
    },
    {
      id: "calibrar", t: "Calibrar", titulo: "Calibra (solo por USB)",
      texto: "Con la placa de vidrio y siguiendo las posiciones que pide la pantalla.",
      puntos: [
        "La calibración no funciona por Wi-Fi: pon el interruptor en USB.",
        "Si la app pide actualizar el firmware, hazlo antes.",
        "Si insiste en «ajusta la posición», gira el escáner 180° (el USB-C hacia el borde de abajo de la placa).",
        "Para máxima precisión, déjalo encendido 30 min antes de calibrar.",
      ],
      gemelo: { vista: "frente", modo: "apagado", girar: false },
    },
    {
      id: "modo", t: "Modo", titulo: "Elige el modo",
      texto: "Láser azul para detalle fino; infrarrojo (NIR) para piezas grandes o si no tienes marcadores.",
      puntos: [
        "Láser azul: de 16 a 40 cm de distancia, hasta 0.03 mm. Necesita marcadores (la torre o pegados).",
        "NIR: de 20 cm a 1 m, hasta 0.1 mm. Sigue la forma (Geometría) o el dibujo (Textura), sin marcadores.",
        "Activa el color antes de empezar si lo quieres: después ya no se puede.",
        "Tamaño: pequeño para piezas de mano; mediano o grande para lo demás.",
      ],
      gemelo: { vista: "escaner", modo: "laser", girar: false },
    },
    {
      id: "escanear", t: "Escanear", titulo: "Escanea despacio",
      texto: "Que la barra de distancia esté en verde y gira la tornamesa poco a poco.",
      puntos: [
        "Empieza con el botón ▷ (arriba) o desde la app. Pausa con el mismo botón.",
        "Una vuelta completa despacio; luego súbelo o bájalo un poco para ver arriba y abajo.",
        "El mapa de calidad debe quedar verde; lo rojo falta escanearlo otra vez.",
        "Si pierde el seguimiento: regresa a una parte ya escaneada y espera a que se ubique.",
      ],
      gemelo: { vista: "mesa", modo: "laser", girar: true },
    },
    comunes.voltear, comunes.procesar, comunes.exportar,
  ],
  otter: [
    comunes.preparar,
    {
      id: "conectar", t: "Conectar", titulo: "Conecta los dos cables",
      texto: "USB 3.0 a un puerto azul de la compu y el cable de apoyo al puerto de en medio.",
      puntos: [
        "El Otter no tiene batería: el cable USB 2.0 de apoyo va del conector de en medio del cable a otro puerto o a un cargador de 5 V.",
        "El cable sale por el extremo izquierdo de atrás.",
        "En la compu: Creality Scan (Windows 10/11 de 64 bits o macOS).",
      ],
      gemelo: { vista: "atras", modo: "apagado", girar: false },
    },
    {
      id: "calibrar", t: "Calibrar", titulo: "Calibra con la placa de puntos",
      texto: "Escanea el QR del reverso de la placa para vincularla y sigue las posiciones de la pantalla.",
      puntos: [
        "La placa va sobre su tapete negro, en una mesa firme.",
        "Hazlo si el escáner se golpeó o si hace mucho que no se calibra.",
        "Para máxima precisión: 30 min encendido antes de calibrar.",
      ],
      gemelo: { vista: "placa", modo: "luz", girar: false },
    },
    {
      id: "modo", t: "Modo", titulo: "Elige cómo sigue la pieza",
      texto: "Geometría si tiene relieve; Textura si es lisa pero con dibujo; Marcadores si es lisa y simple.",
      puntos: [
        "Geometría: figuras, juguetes, piezas mecánicas, caras.",
        "Textura: piezas con poco relieve pero con dibujo; pon marcadores en la mesa si es chica.",
        "Marcadores: tazas, cajas, cilindros. Pega marcadores de 3 mm (piezas chicas) o de 6 mm (grandes).",
        "Calidad Alta si la compu tiene tarjeta de video; Rápido para piezas grandes o compus lentas.",
      ],
      gemelo: { vista: "escaner", modo: "nir", girar: false },
    },
    {
      id: "escanear", t: "Escanear", titulo: "Escanea con los botones",
      texto: "▷ empieza y pausa; manténlo 3 s para terminar. La luz del escáner te dice la distancia.",
      puntos: [
        "Luz verde: a buena distancia (de 11 cm a 1 m). Naranja o roja: muy cerca. Azul: muy lejos.",
        "+ y − suben o bajan la exposición del infrarrojo. En piezas chicas conviene ajustarla a mano.",
        "Gira la tornamesa despacio, una vuelta, y luego súbelo o bájalo para ver arriba y abajo.",
        "Lo rojo del mapa de calidad falta escanearlo otra vez.",
      ],
      gemelo: { vista: "mesa", modo: "nir", girar: true },
    },
    comunes.voltear, comunes.procesar, comunes.exportar,
  ],
};

// Recetas de ajustes (wiki de Creality, casos de escaneo). modo del Pika entre paréntesis.
export const RECETAS = [
  { que: "Pieza diminuta (audífonos, < 5 cm)", ajustes: "Marcadores · Pequeño · Alta · 0.1 mm", pika: "Láser azul + marcadores de 3 mm" },
  { que: "Figura o juguete (5 a 25 cm)", ajustes: "Geometría · Pequeño · Alta · 0.15 mm", pika: "Láser azul con la torre, o NIR + Geometría" },
  { que: "Pieza mecánica", ajustes: "Geometría · Pequeño · Alta · 0.15 mm", pika: "Láser azul + marcadores" },
  { que: "Pieza mediana (jarrón, 30 a 50 cm)", ajustes: "Textura o Geometría · Mediano · Alta · 0.2 a 0.3 mm", pika: "NIR" },
  { que: "Cara", ajustes: "Geometría · Cara · Alta · 0.2 mm", pika: "NIR + Geometría" },
  { que: "Cuerpo completo", ajustes: "Cuerpo · Geometría · Rápido · Color · 1 mm", pika: "NIR" },
  { que: "Coche o pieza enorme", ajustes: "Marcadores · Grande · Alta · 1 mm", pika: "NIR + marcadores globales" },
];

export const PROBLEMAS = [
  { p: "Salen huecos en lo negro o brillante", s: "Talco o spray para escanear. Subir la exposición ayuda poco y mete ruido." },
  { p: "Pierde el seguimiento", s: "Más despacio, regresa a lo ya escaneado. Agrega marcadores o usa la torre." },
  { p: "El color sale disparejo", s: "Luz pareja y la pieza quieta. No repitas pasadas de más." },
  { p: "No calibra por Wi-Fi (Pika)", s: "La calibración solo funciona por USB: pon el interruptor en USB." },
  { p: "El modelo sale inclinado o de cabeza", s: "Normal: el escáner estaba ladeado. En el Visor 3D: Elegir la cara de abajo y toca la tornamesa." },
];
