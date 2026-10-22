// manual.js - el manual de uso: fabricar una PCB en la Cubiko, con sus checks.
// Es solo contenido. Cambiar un paso = editar su entrada; la imagen va en web/img/manual/<img>.webp.
//
// Los 6 pasos son los mismos de Pasos en Inicio (mismos ids y nombres que pasos() en
// vistas.js) y los mismos capítulos del recorrido guiado. Si cambia uno, cambian los tres.
// «antes» y «despues» es lo que pasa fuera de la app.
// «clips»: los videos de ese paso (ids de web/demo/manos/clips.js, con su nombre).

const img = (id) => `../img/manual/${id}.webp`;
const clip = (id, nombre) => ({ id, nombre });

export const MANUAL = {
  titulo: "User manual",
  sub: "Make a PCB on the Cubiko",
  antes: [
    { id: "exportar", img: img("exportar"), t: "Export from KiCad",
      d: "Gerbers for F.Cu and Edge.Cuts, and the .drl in millimeters, in one folder.",
      checks: ["Trace clearance of 0.3 mm or more", "Closed outline on Edge.Cuts", "Drill file with the same origin as the Gerbers"] },
    { id: "placa", img: img("placa"), t: "Secure the board",
      d: "Lid off, centered on the bed with the copper up, held by the two aluminum clamps.",
      checks: ["Copper cleaned with alcohol", "Flat: no bubbles or lifted corners", "Clamps tightened with the 3 mm Allen key"],
      clips: [clip("quitarTapa", "Remove the lid"), clip("ponerPlaca", "Place the board"), clip("sujetador", "Clamp the board")] },
  ],
  pasos: [
    { id: "maquina", img: img("maquina"), t: "Machine",
      d: "Connect over USB and run homing: the machine finds its limits and knows where it is.",
      checks: ["No other app is using the port", "Homing with no alarms", "Traces bit tight in the ER11 collet"],
      clips: [clip("encender", "Turn on"), clip("usb", "USB"), clip("herramientas", "The tools"), clip("cambiar", "Change the bit"), clip("homing", "Homing")] },
    { id: "archivos", img: img("generar"), t: "Files",
      d: "Open the KiCad folder in the app. Anything it can’t use is ignored.",
      checks: ["Copper, outline and holes show up", "The whole board shows in the image", "Board size matches KiCad"] },
    { id: "tray", img: img("aire"), t: "Toolpaths",
      d: "Enter the stock size, check the black-and-white image and press Generate.",
      checks: ["Thickness measured with calipers, copper included", "CNC settings on “Cubiko defaults”: don’t change them", "All traces look separate in the image", "Three jobs: traces, holes and outline"] },
    { id: "xy", img: img("xy"), t: "X0 Y0",
      d: "In Jog, move the bit to the bottom-left corner of the board and set X0 Y0.",
      checks: ["Start with 10 mm steps and fine-tune with 0.1 mm", "Bit over the corner, not touching the copper", "Trace the area: it stays on the board"],
      clips: [clip("xy", "X0 Y0")] },
    { id: "z", img: img("ceros"), t: "Z0",
      d: "Alligator clip on the bit and cable on the copper; the wizard lowers until contact and then measures the height map.",
      checks: ["The app shows “Contact” when it touches the board", "Height map measured, with the alligator clip on until the end", "Probe disconnected and removed when done", "Z again after every bit change"],
      clips: [clip("sonda", "Connect the probe"), clip("tocar", "Touch the board"), clip("mapa", "Height map"), clip("quitarCaiman", "Remove the probe")] },
    { id: "fresar", img: img("fresar"), t: "Mill",
      d: "First the air test (5 mm up), then traces, holes and outline.",
      checks: ["Air test: the path stays inside the board", "Safety glasses on, lid closed and hand near STOP", "Traces: V-bit · holes: 1 mm drill bit · outline: 1 mm corncob bit"],
      clips: [clip("ponerTapa", "Close the lid"), clip("fresar", "Air test and mill"), clip("paro", "Stop")] },
  ],
  despues: [
    { id: "acabado", img: img("acabado"), t: "Finish and check",
      d: "Sand the burrs, clean and test with the multimeter.",
      checks: ["No copper bridging traces (check with a magnifier)", "Continuity on every net, no shorts", "Clean holes for the components"],
      clips: [clip("limpiar", "Vacuum"), clip("sacarPlaca", "Remove the board"), clip("apagar", "Turn off")] },
  ],
  // Al pie: lo que no es un paso pero se olvida
  pie: [["STOP", "red button or Esc"], ["Limit beep", "Unlock, move the axis 1 mm away and run Homing; then check X0 Y0"], ["Alarm", "the app says what happened and how to get out"], ["Bits", "break easily: never lower Z with a 10 mm step near the board"]],
};
