// clips.js - los clips del tutorial de la CNC, en el orden en que se usa la máquina.
//
// Cada clip: { id, nombre, paso, duracion, camara: [{ t, pos, mira }], senal: [{ pos, t0, t1, r }],
// subtitulos: [[t, texto]], manos: [pista], alTiempo(t) }. alTiempo pone la máquina y los accesorios
// (lo que no toca queda como en escenaBase). Pistas de mano (las anima reproductor.js):
//   { lado: "der" | "izq", ancla, kf: [cuadro] }
//   cuadro libre:  { t, pos, rot (grados, YXZ), pose, ancla?, en? }   «en»: pos/rot en el marco de OBJ[en]
//   cuadro agarre: { t, agarra: id de OBJ, palma: [x, y, z] (hacia dónde mira la palma, mundo), cierre?, pose?, aleja? }
//     el pulgar y el índice aprietan a lo largo del «eje» del agarre del objeto; el antebrazo sale del lado del pulgar
// Con rot [0,0,0] la palma mira abajo y los dedos al fondo; [0,90,0]: dedos hacia −X; [0,0,−90]: de canto.

import * as THREE from "three";
import {
  Z_FRESA, v3, cub, PUNTO, PLACA, SUJ, ROSCA_SUJ, suj, placa, rojo, terminal, conector, allen, llaves, clavija, aspiradora,
  muestrario, cero, puntosMapa, aroContacto, cables, herramienta, fresaSobre, encendida, pintarPlaca, ponerPolvo,
} from "./escena.js";
import { tramo } from "../../shared/js/manos.js";

const V = THREE.Vector3;
const ABAJO = [0, -1, 0], ARRIBA = [0, 1, 0];          // en los agarres: hacia dónde mira la palma (el antebrazo sale del lado del pulgar)
const ss = THREE.MathUtils.smoothstep;
const fr = (t, a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const suave = (t, a, b) => { const x = fr(t, a, b); return x * x * (3 - 2 * x); };
// Cuadros { t, p: [...] }: suave (con pausa en cada cuadro) o lineal (como se mueve la máquina)
const kfSuave = (kf, t) => { const [a, b, s] = tramo(kf, t); return a.p.map((v, k) => v + (b.p[k] - v) * s); };
const kfLineal = (kf, t) => {
  if (t <= kf[0].t) return kf[0].p.slice();
  for (let i = 1; i < kf.length; i++) if (t <= kf[i].t) { const a = kf[i - 1], b = kf[i], s = (t - a.t) / (b.t - a.t); return a.p.map((v, k) => v + (b.p[k] - v) * s); }
  return kf[kf.length - 1].p.slice();
};
const on = PUNTO.on, pa = PUNTO.paro, u = PUNTO.usb, lv = PUNTO.leveling, jk = PUNTO.jack;
// Un punto de la cama en el mundo con la cama al centro (como la deja escenaBase)
const camaBase = (bx, y, bz) => new V(bx, y, Z_FRESA + bz);
const sinTapa = () => { cub.tapa.visible = false; };
const sinPlaca = () => { placa.visible = false; suj.izq.grupo.visible = suj.der.grupo.visible = false; };

// ---------------- Caimán, horquilla y conector de la sonda ----------------
// Como en el manual: el caimán muerde la fresa de lado (viene de adelante a la derecha y abre en horizontal) y
// la horquilla va bajo el tornillo del sujetador de adelante, que pisa el cobre.
const NARIZ = new V(-1, 0, -0.45).normalize();
const ZC = NARIZ.clone().negate(), YC = new V().crossVectors(new V(0, 1, 0), ZC).normalize(), XC = new V().crossVectors(YC, ZC);
const Q_CAIMAN = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(XC, YC, ZC));
const REPOSO_CAIMAN = new V(98, -3.5, 128), REPOSO_HORQUILLA = new V(62, -12.6, 142);
const PALMA_CAIMAN = NARIZ.clone().multiplyScalar(0.95).add(new V(0, -0.3, 0)).normalize().toArray();   // en la fresa: de lado, la palma hacia la fresa y un poco abajo (arriba está el husillo)
const mordida = () => new V(cub.carroX.position.x, cub.husillo.position.y + 12.5, Z_FRESA);   // en el vástago, bajo la tuerca
function caimanEn(p, abre) { rojo.g.visible = true; rojo.g.quaternion.copy(Q_CAIMAN); rojo.g.position.copy(p).addScaledVector(ZC, -4); rojo.abrir(abre); }
const tornilloDer = () => { cub.mesa.updateMatrixWorld(true); return suj.der.tornillo.getWorldPosition(new V()); };
// La horquilla abre hacia −Z: entra por el frente y su ranura rodea el tornillo (centro de la ranura a 7 mm)
function horquillaEn(p) { terminal.g.visible = true; terminal.g.rotation.set(0, 0, 0); terminal.g.position.copy(p); }
const horquillaFin = () => { const s = tornilloDer(); return new V(s.x, 7.6, s.z + 7); };
const horquillaPuesta = () => { suj.der.tornillo.position.y = 0.8; horquillaEn(horquillaFin()); };
function conectorEn(p) { conector.g.visible = true; conector.g.rotation.set(0, 0, 0); conector.g.position.copy(p); }
const conectorPuesto = () => conectorEn(lv.clone().add(new V(3, 0, 0)));
function cablesSonda() {
  for (const o of [rojo.g, terminal.g, conector.g]) o.updateMatrixWorld(true);
  const de = conector.g.localToWorld(new V(-9, 0, 0));
  cables.caiman.malla.visible = cables.horquilla.malla.visible = true;
  // bajan juntos por la pared derecha hasta la base y de ahí se separan
  const via = [new V(lv.x - 10, lv.y - 45, lv.z + 6), new V(lv.x - 14, -2, lv.z + 40)];
  const bajaCaiman = new V(0, 0, -1).applyQuaternion(rojo.g.quaternion).multiplyScalar(0.35).add(new V(0, 0.65, 0)).normalize();   // llega desde abajo: no pasa por la mano
  cables.caiman(de, new V(-1, 0, 0), rojo.g.localToWorld(rojo.salida.clone()), { dirFin: bajaCaiman, caida: 10, via });
  cables.horquilla(de.clone().add(new V(0, -1.5, 0)), new V(-1, 0, 0), terminal.g.localToWorld(terminal.salida.clone()), { dirFin: new V(0, 0, -1).applyQuaternion(terminal.g.quaternion), caida: 6, via: via.map((p) => p.clone().add(new V(-2.5, 0, 2.5))) });
}
// Sonda puesta (Z0 y mapa): conector, horquilla bajo el sujetador y caimán en la fresa
function sondaPuesta(abre = 0.7) { conectorPuesto(); horquillaPuesta(); cub.husillo.updateMatrixWorld(true); caimanEn(mordida(), abre); cablesSonda(); }
// Después del mapa: el caimán queda en la base; la horquilla, en el sujetador
function sondaGuardada() { conectorPuesto(); horquillaPuesta(); caimanEn(REPOSO_CAIMAN, 0); cablesSonda(); }

// ---------------- Recorridos de la fresa ----------------
// Esquina de X0 Y0: adelante a la izquierda de la placa (en coordenadas de cama)
const ESQ = [PLACA.bx - PLACA.ancho / 2, PLACA.bz + PLACA.fondo / 2];
// Pistas de muestra (coordenadas de la placa): dos contornos de aislamiento
const LAZOS = [
  [[-36, 30], [-36, -14], [14, -14], [14, -30], [38, -30], [38, -4], [22, -4], [22, 10], [-20, 10], [-20, 30], [-36, 30]],
  [[-10, 18], [30, 18], [30, 30], [-10, 30], [-10, 18]],
];
const H_CORTE = PLACA.grosor - 0.1, H_SEGURA = 5;
const H_SONDA = 22;                 // fresa arriba mientras se pone o se quita el caimán (la mano cabe abajo)
// Cuadros lineales { t, p: [bx, bz, h] } de un trabajo: recorre los lazos a «vel» mm/s a la altura h, con
// subidas y bajadas entre lazos
function trabajo(t0, h, vel, lazos = LAZOS) {
  const kf = [], aCama = ([x, z]) => [x + PLACA.bx, z + PLACA.bz];
  let t = t0;
  for (const lazo of lazos) {
    const [x0, z0] = aCama(lazo[0]);
    if (kf.length) { const q = kf[kf.length - 1].p; kf.push({ t: (t += 0.25), p: [q[0], q[1], H_SEGURA + 3] }); kf.push({ t: (t += Math.hypot(x0 - q[0], z0 - q[1]) / 120 + 0.1), p: [x0, z0, H_SEGURA + 3] }); }
    else kf.push({ t, p: [x0, z0, H_SEGURA + 3] });
    kf.push({ t: (t += 0.35), p: [x0, z0, h] });
    for (let i = 1; i < lazo.length; i++) { const [x, z] = aCama(lazo[i]), q = kf[kf.length - 1].p; kf.push({ t: (t += Math.hypot(x - q[0], z - q[1]) / vel), p: [x, z, h] }); }
  }
  const q = kf[kf.length - 1].p; kf.push({ t: (t += 0.35), p: [q[0], q[1], H_SEGURA + 3] });
  return kf;
}
// Lo que ya cortó la fresa hasta t (segmentos en coordenadas de la placa)
function surco(kf, t) {
  const segs = [];
  for (let i = 1; i < kf.length; i++) {
    const a = kf[i - 1], b = kf[i];
    if (a.t > t) break;
    if (a.p[2] > H_CORTE + 0.01 || b.p[2] > H_CORTE + 0.01) continue;
    const s = Math.min(1, (t - a.t) / (b.t - a.t));
    segs.push([a.p[0] - PLACA.bx, a.p[1] - PLACA.bz, a.p[0] + (b.p[0] - a.p[0]) * s - PLACA.bx, a.p[1] + (b.p[1] - a.p[1]) * s - PLACA.bz]);
  }
  return segs;
}
const AIRE = trabajo(0.9, H_SEGURA, 110, LAZOS.slice(0, 1));
const CORTE = trabajo(4.4, H_CORTE, 42);
const T_FIN_CORTE = CORTE[CORTE.length - 1].t;
const SURCO_COMPLETO = surco(CORTE, 1e9);
const girar = (t) => { herramienta.rotation.y = t * 60; };

// Saltos del jog: de un punto a otro en pasos de «paso» mm por el eje dado (cada salto 0.1 s y una pausa)
function jog(kf, t0, de, a, paso, eje) {
  let t = t0; const p = de.slice();
  kf.push({ t, p: p.slice() });
  while (Math.abs(a[eje] - p[eje]) > 1e-6) {
    p[eje] += Math.sign(a[eje] - p[eje]) * Math.min(paso, Math.abs(a[eje] - p[eje]));
    kf.push({ t: (t += 0.1), p: p.slice() }); kf.push({ t: (t += 0.06), p: p.slice() });
  }
  return t;
}

// ---------------- Tapa ----------------
// Desplazamiento de la tapa (las manos van en su marco): se levanta derecho y se deja a la izquierda
// (primero sube y sale hacia el frente: la tapa no tiene fondo y así no barre el husillo)
const TAPA_KF = [{ t: 0, p: [0, 0, 0] }, { t: 2.0, p: [0, 0, 0] }, { t: 2.9, p: [0, 60, 0] }, { t: 3.8, p: [0, 90, 110] }, { t: 5.0, p: [-380, 90, 150] }, { t: 5.8, p: [-380, -55, 150] }, { t: 9, p: [-380, -55, 150] }];
const TAPA_D = 9;
const manoTapa = (lado) => {
  const s = lado === "der" ? 1 : -1, x = 159 * s, r = [0, 0, -90 * s];
  return {
    lado, ancla: "middle-finger-phalanx-proximal",
    kf: [
      { t: 0, pos: [300 * s, 120, 300], rot: [0, 0, -60 * s], pose: "relajada" },
      { t: 1.5, en: "tapa", pos: [x + 14 * s, 85, 75], rot: r, pose: "plana" },
      { t: 2.0, en: "tapa", pos: [x, 85, 75], rot: r, pose: "plana" },
      { t: 5.8, en: "tapa", pos: [x, 85, 75], rot: r, pose: "plana" },
      { t: 6.4, en: "tapa", pos: [x + 30 * s, 90, 90], rot: r, pose: "relajada" },
      { t: 7.4, pos: [-380 + 260 * s, 270, 250], rot: [0, 0, -60 * s], pose: "relajada" },
    ],
  };
};
const alReves = (kf, d) => kf.map((k) => ({ ...k, t: d - k.t })).reverse();

// Placa con las dos manos: las yemas de los dedos en las orillas de los costados, desde arriba e inclinadas 45°
// (nada queda debajo de la placa). plan() da los momentos: { t, agarra | suelta | lejos }.
const manosPlaca = (plan) => ["der", "izq"].map((lado) => {
  const s = lado === "der" ? 1 : -1, r = [-45, 60 * s, 0];
  return {
    lado, ancla: "middle-finger-tip",
    kf: plan().map((k) => k.agarra ? { t: k.t, en: "placa", pos: [53 * s, 7, 22], rot: r, pose: "pinzaAbierta" }
      : k.suelta ? { t: k.t, en: "placa", pos: [70 * s, 30, 30], rot: r, pose: "relajada" }
      : { t: k.t, pos: [230 * s, 170, 220], rot: [-30, 70 * s, 0], pose: "relajada" }),
  };
});

// Botón: el índice llega desde la derecha (dedos hacia −X, inclinado 35° hacia abajo para que la palma y los
// otros dedos no toquen la mesa), presiona en t0 y se va
const presionarBoton = (b, t0) => [
  { t: t0 - 2.0, pos: [b.x + 200, b.y + 110, b.z + 120], rot: [-20, 90, -10], pose: "relajada" },
  { t: t0 - 0.9, pos: [b.x + 24, b.y + 8, b.z], rot: [-35, 90, 0], pose: "apuntar", empuja: [1, 0.3, 0] },
  { t: t0 - 0.3, pos: [b.x + 1, b.y, b.z], rot: [-35, 90, 0], pose: "apuntar", empuja: [1, 0.3, 0] },
  { t: t0, pos: [b.x - 1, b.y, b.z], rot: [-35, 90, 0], pose: "presionar", empuja: [1, 0.3, 0] },
  { t: t0 + 0.5, pos: [b.x + 22, b.y + 8, b.z], rot: [-35, 90, 0], pose: "apuntar", empuja: [1, 0.3, 0] },
  { t: t0 + 1.9, pos: [b.x + 170, b.y + 100, b.z + 70], rot: [-20, 90, -10], pose: "relajada" },
];

// Llave Allen sobre el tornillo de un sujetador: baja al hexágono (t0), gira con él y sale (t2 → t3)
function allenSobre(s, t, t0, t2, t3) {
  const dentro = ss(t, t0, t0 + 0.6) * (1 - ss(t, t2, t3));
  allen.g.visible = t >= t0 && t <= t3;
  s.grupo.updateMatrixWorld(true);
  const top = s.tornillo.localToWorld(new V(0, s.tornillo.userData.tope - 0.5, 0));
  allen.g.position.set(top.x, top.y + (1 - dentro) * 30, top.z);
  allen.g.rotation.set(0, s.tornillo.rotation.y + s.grupo.rotation.y + Math.PI * 0.8, 0);
}
// …y además mueve el tornillo: gira «vueltas» (> 0 aprieta) entre t1 y t2; sube(g) da su altura
function allenEn(s, t, { t0, t1, t2, t3, vueltas, sube }) {
  const giro = fr(t, t1, t2);
  s.tornillo.position.y = sube(giro);
  s.tornillo.rotation.y = -giro * vueltas * Math.PI * 2;
  allenSobre(s, t, t0, t2, t3);
}

// ---------------- Clips ----------------
export const CLIPS = [
  // ===== Máquina =====
  {
    id: "encender", nombre: "Enciende", paso: "Máquina", duracion: 9.5,
    camara: [{ t: 0, pos: [jk.x + 300, jk.y + 130, jk.z - 40], mira: [jk.x, jk.y, jk.z] }, { t: 1.8, pos: [jk.x + 260, jk.y + 110, jk.z - 10], mira: [jk.x, jk.y, jk.z] },
             { t: 3.0, pos: [on.x + 360, on.y + 150, on.z + 330], mira: [on.x - 10, on.y + 10, on.z + 20] },
             { t: 5.4, pos: [on.x + 260, on.y + 90, on.z + 230], mira: [on.x - 10, on.y, on.z + 20] },
             { t: 6.8, pos: [520, 80, 420], mira: [20, -45, 120] }, { t: 9.0, pos: [260, 30, 560], mira: [-40, -45, 150] }],
    senal: [{ pos: jk, t0: 0.3, t1: 1.9, r: 0.8 }, { pos: on, t0: 2.6, t1: 4.6 }, { pos: pa, t0: 5.2, t1: 6.4, r: 0.8 }],
    subtitulos: [[0, "Revisa que la corriente esté conectada, atrás a la derecha"], [2.2, "El botón ON/OFF está en el costado derecho"], [3.6, "Presiónalo una vez"], [5.2, "El rojo es el paro de emergencia"], [7.0, "Al frente se encienden la franja y la pantalla"]],
    manos: [{ lado: "der", kf: presionarBoton(on, 4.5) }],
    alTiempo(t) { sinPlaca(); cub.botones.encendido.position.z = t >= 4.35 && t < 4.8 ? 1.4 : 2.4; encendida(t >= 4.5); },
  },
  {
    id: "usb", nombre: "Conecta el USB", paso: "Máquina", duracion: 7,
    camara: [{ t: 0, pos: [u.x + 360, u.y + 200, u.z - 330], mira: [u.x + 50, u.y + 10, u.z] }, { t: 7, pos: [u.x + 230, u.y + 110, u.z - 230], mira: [u.x + 15, u.y, u.z] }],
    senal: { pos: u, t0: 0.4, t1: 3.0 },
    subtitulos: [[0, "El USB entra atrás, en el costado derecho"], [1.8, "La clavija cuadrada entra en un solo sentido"], [3.8, "Empújala hasta el fondo"], [5.4, "Listo: ahora conéctate desde la app"]],
    clavija: [{ t: 0, p: [u.x + 130, u.y + 50, u.z + 40] }, { t: 2.2, p: [u.x + 30, u.y, u.z] }, { t: 3.2, p: [u.x + 9, u.y, u.z] }, { t: 4.2, p: [u.x - 8, u.y, u.z] }, { t: 7, p: [u.x - 8, u.y, u.z] }],
    manos: [{
      lado: "der",
      kf: [
        { t: 0, agarra: "clavija", palma: ABAJO }, { t: 4.2, agarra: "clavija", palma: ABAJO },
        { t: 4.8, agarra: "clavija", palma: ABAJO, cierre: 0, pose: "pinzaAbierta", aleja: 12 },
        { t: 6.4, pos: [u.x + 140, u.y + 170, u.z - 70], rot: [0, 90, -60], pose: "relajada" },
      ],
    }],
    alTiempo(t) {
      sinPlaca();
      clavija.g.visible = cables.usb.malla.visible = true;
      clavija.g.position.set(...kfSuave(this.clavija, t)); clavija.g.rotation.set(0, Math.PI / 2, 0);
      clavija.g.updateMatrixWorld(true);
      cables.usb(clavija.g.localToWorld(clavija.salida.clone()), new V(1, 0, 0), new V(560, -66, -260));
    },
  },
  {
    id: "quitarTapa", nombre: "Quita la tapa", paso: "Tapa", duracion: TAPA_D,
    camara: [{ t: 0, pos: [420, 320, 780], mira: [0, 40, 60] }, { t: 5.5, pos: [220, 420, 1050], mira: [-170, 20, 60] }, { t: TAPA_D, pos: [180, 330, 820], mira: [-40, -10, 80] }],
    senal: null,
    subtitulos: [[0, "Toma la tapa de los costados"], [2.0, "Levántala derecho hacia arriba"], [4.2, "Déjala a un lado, sobre la mesa"], [6.4, "Sin tapa la máquina se mueve y hace homing, pero el husillo no enciende"]],
    manos: [manoTapa("der"), manoTapa("izq")],
    alTiempo(t) { sinPlaca(); cub.tapa.position.set(...kfSuave(TAPA_KF, t)); },
  },
  // ===== Placa =====
  {
    id: "ponerPlaca", nombre: "Pon la placa", paso: "Placa", duracion: 7,
    camara: [{ t: 0, pos: [260, 260, 560], mira: [0, 10, 80] }, { t: 4, pos: [200, 210, 440], mira: [0, 0, 25] }, { t: 7, pos: [170, 200, 400], mira: [0, 0, 15] }],
    senal: { pos: camaBase(PLACA.bx, 2, PLACA.bz + 45), t0: 4.6, t1: 6.2, r: 1.4 },
    subtitulos: [[0, "Tómala de las orillas, con el cobre hacia arriba"], [2.0, "Ponla al centro de la cama"], [4.2, "Plana: que no quede nada debajo"]],
    placa: [{ t: 0, p: [0, 60, 240] }, { t: 2.2, p: [0, 36, 70] }, { t: 3.6, p: [0, 4, PLACA.bz] }, { t: 3.9, p: [0, 4, PLACA.bz] }, { t: 4.1, p: [0, 0, PLACA.bz] }],
    manos: manosPlaca((t) => [{ t: 0, agarra: true }, { t: 3.9, agarra: true }, { t: 4.4, suelta: true }, { t: 5.6, lejos: true }]),
    alTiempo(t) {
      sinTapa(); suj.izq.grupo.visible = suj.der.grupo.visible = false;
      fresaSobre(0, -45, 40);              // husillo arriba y cama adelante: hay lugar para las manos
      const [x, y, z] = kfSuave(this.placa, t); placa.position.set(x, y, 55 + z);
    },
  },
  {
    id: "sujetador", nombre: "Sujeta la placa", paso: "Placa", duracion: 11,
    camara: [{ t: 0, pos: [330, 280, -60], mira: [55, 0, 12] }, { t: 3.8, pos: [300, 250, -60], mira: [60, 0, 10] },
             { t: 4.4, pos: [66 + 75, 62, 9.75 + 80], mira: [66 - 4, 4, 9.75] }, { t: 8.6, pos: [66 + 60, 52, 9.75 + 66], mira: [66 - 4, 4, 9.75] },
             { t: 9.6, pos: [150, 230, 300], mira: [0, 0, -30] }, { t: 11, pos: [140, 240, 290], mira: [0, 0, -30] }],
    senal: { pos: camaBase(52, 3, 39.75), t0: 1.0, t1: 3.0, r: 0.6 },
    subtitulos: [[0, "El tornillo va flojo en su rosca"], [1.0, "Desliza el sujetador: la lengüeta sobre la orilla de la placa"], [4.4, "Aprieta con la llave Allen de 3 mm"], [6.8, "Firme, sin forzar: la placa no debe moverse"], [9.2, "Haz lo mismo con el otro sujetador"]],
    manos: [{
      lado: "der",
      kf: [
        { t: 0, pos: [180, 130, 160], rot: [-40, 0, -10], pose: "relajada" },
        { t: 0.8, agarra: "sujDer", palma: ABAJO, cierre: 0, pose: "pinzaAbierta", aleja: 20 },
        { t: 1.2, agarra: "sujDer", palma: ABAJO }, { t: 3.0, agarra: "sujDer", palma: ABAJO },
        { t: 3.4, agarra: "sujDer", palma: ABAJO, cierre: 0, pose: "pinzaAbierta", aleja: 18 },
        { t: 4.2, pos: [190, 140, 170], rot: [-40, 0, -10], pose: "relajada" },
      ],
    }],
    alTiempo(t) {
      sinTapa();
      // el tornillo se queda en su rosca: el sujetador desliza bajo él (la ranura deja 14 mm)
      const gx = SUJ.der.bx + 9 * (1 - suave(t, 1.2, 3.0));
      suj.der.grupo.position.x = gx;
      suj.der.tornillo.position.x = gx - ROSCA_SUJ.der[0];
      allenEn(suj.der, t, { t0: 4.6, t1: 5.4, t2: 8.2, t3: 8.9, vueltas: 2, sube: (g) => 3 * (1 - g) });
    },
  },
  // ===== Herramienta =====
  {
    id: "herramientas", nombre: "Las herramientas", paso: "Herramienta", duracion: 12,
    camara: [{ t: 0, pos: [70, 65, Z_FRESA + 95], mira: [0, 49, Z_FRESA] }, { t: 8.6, pos: [80, 63, Z_FRESA + 100], mira: [0, 49, Z_FRESA] },
             { t: 9.6, pos: [74, 58, Z_FRESA + 110], mira: [50, 37, Z_FRESA] }, { t: 12, pos: [66, 54, Z_FRESA + 100], mira: [52, 37, Z_FRESA] }],
    senal: null,
    subtitulos: [[0, "Punta en V: graba las pistas"], [3, "Maíz: corta el contorno de la placa"], [6, "Broca: hace los hoyos"], [9, "Fíjate en la punta para saber cuál está puesta"]],
    manos: [],
    alTiempo(t) {
      sinTapa();
      cub.husillo.position.y = 40;
      const i = Math.min(2, Math.floor(t / 3)), tipo = ["v", "maiz", "broca"][i], f = t - i * 3;
      if (herramienta.userData.tipo !== tipo) cub.ponerHerramienta(tipo);
      herramienta.position.y = -30 * ((1 - ss(f, 0, 0.6)) + (i < 2 ? ss(f, 2.4, 3) : 0));
      herramienta.visible = t < 9;
      muestrario.visible = t >= 9; muestrario.position.set(36, 28, Z_FRESA);
    },
  },
  {
    id: "cambiar", nombre: "Pon la fresa en V", paso: "Herramienta", duracion: 11,
    camara: [{ t: 0, pos: [95, 100, Z_FRESA + 125], mira: [0, 64, Z_FRESA] }, { t: 5, pos: [80, 92, Z_FRESA + 110], mira: [0, 60, Z_FRESA] }, { t: 11, pos: [90, 96, Z_FRESA + 120], mira: [0, 62, Z_FRESA] }],
    senal: null,
    subtitulos: [[0, "Cambio de herramienta: aquí, de la broca a la V"], [0.9, "Una llave de 13 sostiene la pinza por sus caras planas"], [1.9, "Con la otra, afloja la tuerca"], [3.5, "Termina a mano y sostén la fresa: al aflojar se cae"],
                 [5.0, "Mete la nueva: que asome lo mismo que la anterior"], [6.4, "Aprieta la tuerca a mano"], [7.3, "Y firme con las dos llaves"], [9.3, "Cambiaste la fresa: calibra Z otra vez"]],
    manos: [],
    alTiempo(t) {
      sinTapa();
      cub.husillo.position.y = 40;
      const yP = 40 + 32.3, yT = 40 + 21;
      // llaves: entran (fijas) a la pinza y a la tuerca; la de la tuerca gira. Una vez para aflojar y otra para apretar
      const dentro = Math.max(ss(t, 0.3, 1.1) * (1 - ss(t, 2.7, 3.3)), ss(t, 7.0, 7.6) * (1 - ss(t, 8.6, 9.2)));
      const angB = t < 5 ? -0.9 * suave(t, 1.6, 2.6) : 0.7 * suave(t, 7.8, 8.5);
      llaves[0].g.visible = llaves[1].g.visible = dentro > 0.001;
      llaves[0].g.position.set(-70 * (1 - dentro), yP, Z_FRESA); llaves[0].g.rotation.set(0, Math.PI - 0.26, 0);
      llaves[1].g.position.set(70 * (1 - dentro), yT, Z_FRESA); llaves[1].g.rotation.set(0, -0.26 + angB, 0);
      // tuerca: con la llave y luego a mano; baja 1.5 mm al aflojar y sube al apretar
      cub.tuerca.rotation.y = Math.PI / 6 - 0.9 * suave(t, 1.6, 2.6) - 4 * Math.PI * suave(t, 3.4, 4.4) + 4 * Math.PI * suave(t, 6.2, 7.0) + 0.7 * suave(t, 7.8, 8.5);
      cub.tuerca.position.y = 21 - 1.5 * suave(t, 3.4, 4.4) + 1.5 * suave(t, 6.2, 7.0);
      // sale la broca y entra la V
      if (t < 4.6) { if (herramienta.userData.tipo !== "broca") cub.ponerHerramienta("broca"); herramienta.position.y = -36 * suave(t, 4.0, 4.6); herramienta.visible = t < 4.55; }
      else { if (herramienta.userData.tipo !== "v") cub.ponerHerramienta("v"); herramienta.position.y = -36 * (1 - suave(t, 4.9, 6.0)); }
    },
  },
  // ===== Homing =====
  {
    id: "homing", nombre: "Homing", paso: "Máquina", duracion: 8,
    camara: [{ t: 0, pos: [430, 300, 620], mira: [0, 40, -40] }, { t: 8, pos: [320, 250, 540], mira: [10, 40, -40] }],
    senal: null,
    subtitulos: [[0, "En la app, pulsa Homing"], [0.9, "Primero sube Z"], [2.3, "Luego busca los topes de X y de Y"], [6.2, "Listo: ya sabe dónde está. Manos fuera mientras se mueve"]],
    manos: [],
    alTiempo(t) {
      sinTapa();
      cub.husillo.position.y = 12 + 28 * suave(t, 0.8, 2.2);
      cub.carroX.position.x = -25 + 97.5 * suave(t, 2.2, 4.2);
      cub.mesa.position.z = Z_FRESA - 70 + 70 * suave(t, 4.2, 6.0);
    },
  },
  // ===== X0 Y0 =====
  (() => {
    const kf = [], ini = [72.5, -55, 40], [ex, ez] = ESQ;
    let t = jog(kf, 0.8, ini, [ex + 2.5, ini[1], 40], 10, 0);
    t = jog(kf, t, kf[kf.length - 1].p, [ex + 2.5, ez - 2.5, 40], 10, 1);
    const tZ = t + 0.3;
    t = jog(kf, tZ, kf[kf.length - 1].p, [ex + 2.5, ez - 2.5, 10], 10, 2);
    t = jog(kf, t + 0.2, kf[kf.length - 1].p, [ex + 2.5, ez - 2.5, 2], 1, 2);
    t = jog(kf, t + 0.3, kf[kf.length - 1].p, [ex, ez - 2.5, 2], 1, 0);
    t = jog(kf, t, kf[kf.length - 1].p, [ex, ez, 2], 1, 1);
    const tFin = t, c = new V(ex, 2, Z_FRESA);
    return {
      id: "xy", nombre: "X0 Y0", paso: "X0 Y0", duracion: tFin + 2.4,
      camara: [{ t: 0, pos: [330, 260, 520], mira: [0, 20, -30] }, { t: 4.6, pos: [140, 200, 330], mira: [-30, 10, -30] },
               { t: tFin - 1.5, pos: [c.x - 90, 55, c.z + 85], mira: [c.x, 3, c.z] }, { t: tFin + 2.4, pos: [c.x - 75, 45, c.z + 70], mira: [c.x, 2, c.z] }],
      senal: { pos: c.clone().setY(1.7), t0: tFin + 0.2, t1: tFin + 1.6, r: 0.6 },
      subtitulos: [[0, "En Mover, lleva la fresa a la esquina de adelante a la izquierda"], [1.0, "Pasos de 10 mm para llegar"], [tZ, "Baja Z con cuidado: pasos de 1 mm cerca de la placa"], [tFin - 1.6, "Afina hasta que quede justo sobre la esquina, sin tocar"], [tFin + 0.2, "Pulsa Fijar X0 Y0"]],
      manos: [],
      alTiempo(tt) {
        sinTapa();
        const [bx, bz, h] = kfLineal(kf, tt); fresaSobre(bx, bz, h);
        cero.visible = tt >= tFin + 0.2; cero.position.set(ex, PLACA.grosor + 0.05, 55 + ez);
      },
    };
  })(),
  // ===== Z0 =====
  {
    id: "sonda", nombre: "Conecta la sonda", paso: "Z0", duracion: 15,
    camara: [{ t: 0, pos: [-150, 300, 420], mira: [lv.x - 25, lv.y - 15, lv.z + 30] }, { t: 3.4, pos: [-110, 260, 330], mira: [lv.x - 20, lv.y - 10, lv.z + 10] },
             { t: 4.2, pos: [66 + 85, 70, -32.75 + 75], mira: [66 - 2, 6, -32.75] }, { t: 9.0, pos: [66 + 70, 60, -32.75 + 62], mira: [66 - 2, 6, -32.75] },
             { t: 9.8, pos: [-160, 90, 110], mira: [-45, 30, -30] }, { t: 15, pos: [-140, 75, 95], mira: [-48, 32, -30] }],
    senal: [{ pos: lv, t0: 0.4, t1: 2.2, r: 0.7 }, { pos: new V(-50, H_SONDA + 12.5, Z_FRESA), t0: 10.2, t1: 11.8, r: 0.8 }],
    subtitulos: [[0, "El conector blanco va en «Leveling», arriba a la derecha por dentro"], [3.6, "La horquilla roja, bajo el tornillo del sujetador de adelante"], [5.8, "El sujetador toca el cobre: así la placa queda conectada"],
                 [9.4, "El caimán muerde la fresa, en el vástago"], [12.6, "Suéltalo con cuidado: la fresa es frágil"]],
    conector: [{ t: 0, p: [lv.x - 30, lv.y - 30, lv.z + 220] }, { t: 1.8, p: [lv.x - 20, lv.y, lv.z] }, { t: 2.4, p: [lv.x - 6, lv.y, lv.z] }, { t: 2.9, p: [lv.x + 3, lv.y, lv.z] }],
    manos: [{
      lado: "der",
      kf: [
        // el conector, con la palma arriba: así la mano queda abajo y hacia adentro (no toca la pared ni el techo)
        { t: 0, agarra: "conector", palma: ARRIBA }, { t: 2.9, agarra: "conector", palma: ARRIBA },
        { t: 3.4, agarra: "conector", palma: ARRIBA, cierre: 0, pose: "pinzaAbierta", aleja: 16 },
        { t: 4.2, pos: [60, 120, 260], rot: [0, 0, -160], pose: "relajada" },
        { t: 8.4, pos: [200, 150, 260], rot: [-30, 30, -20], pose: "relajada" },
        // el caimán: de su lugar en la base hasta la fresa
        { t: 9.0, agarra: "caiman", palma: ABAJO, cierre: 0, pose: "pinzaAbierta", aleja: 30 },
        { t: 9.5, agarra: "caiman", palma: ABAJO }, { t: 11.2, agarra: "caiman", palma: PALMA_CAIMAN }, { t: 12.0, agarra: "caiman", palma: PALMA_CAIMAN },
        { t: 12.6, agarra: "caiman", palma: PALMA_CAIMAN, cierre: 0, pose: "pinzaAbierta", aleja: 16 },
        { t: 14.0, pos: [120, 140, 160], rot: [-30, 0, -20], pose: "relajada" },
      ],
    }],
    alTiempo(t) {
      sinTapa();
      fresaSobre(ESQ[0], ESQ[1], H_SONDA);
      cub.husillo.updateMatrixWorld(true);
      conectorEn(v3(kfSuave(this.conector, t)));
      // horquilla: la llave afloja, la horquilla entra bajo la arandela y la llave aprieta
      const afloja = suave(t, 4.8, 5.6), aprieta = suave(t, 7.0, 7.9);
      suj.der.tornillo.position.y = 1.8 * afloja - 1.0 * aprieta;
      suj.der.tornillo.rotation.y = 2 * Math.PI * (afloja - 1.4 * aprieta);
      allenSobre(suj.der, t, 4.2, 7.9, 8.6);
      const fin = horquillaFin(), medio = fin.clone().add(new V(0, 0, 30)), k = suave(t, 5.6, 6.9);
      horquillaEn(t < 5.6 ? REPOSO_HORQUILLA : k < 0.5 ? REPOSO_HORQUILLA.clone().lerp(medio, k * 2) : medio.clone().lerp(fin, (k - 0.5) * 2));
      // caimán: en su lugar hasta que la mano lo toma; abre al llegar y muerde la fresa
      const q = suave(t, 9.5, 11.2), destino = mordida();
      const p = REPOSO_CAIMAN.clone().lerp(destino.clone().add(new V(40, 6, 18)), Math.min(1, q * 1.4)).lerp(destino, ss(q, 0.6, 1));
      caimanEn(p, suave(t, 10.4, 10.9) * (1 - 0.3 * suave(t, 11.6, 12.0)));
      cablesSonda();
    },
  },
  {
    id: "tocar", nombre: "Toca la placa", paso: "Z0", duracion: 8,
    camara: [{ t: 0, pos: [-160, 60, 50], mira: [-45, 20, Z_FRESA] }, { t: 4, pos: [-140, 34, 35], mira: [-45, 6, Z_FRESA] }, { t: 8, pos: [-130, 30, 30], mira: [-45, 5, Z_FRESA] }],
    senal: null,
    subtitulos: [[0, "En el asistente, pulsa Bajar y tocar"], [1.0, "La fresa baja despacio hasta el cobre…"], [4.0, "Contacto: la app lo marca y ahí queda Z0"], [6.0, "Sube un poco y queda lista para el mapa"]],
    manos: [],
    alTiempo(t) {
      sinTapa();
      const h = H_SONDA - (H_SONDA - PLACA.grosor) * fr(t, 0.8, 4.0) + 2.5 * suave(t, 5.2, 6.2);
      fresaSobre(ESQ[0] + 5, ESQ[1] - 5, h);
      sondaPuesta();
      aroContacto.visible = t >= 4.0 && t < 6.2; aroContacto.position.set(cub.carroX.position.x, PLACA.grosor + 0.3, Z_FRESA);
    },
  },
  (() => {
    // Rejilla de 4 × 3 sobre la placa; en cada punto: va a 4 mm, baja hasta tocar y sube
    const pts = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) pts.push([PLACA.bx - 42 + i * 28, PLACA.bz + 37 - j * 38]);
    const kf = [{ t: 0, p: [pts[0][0], pts[0][1], 4] }], toques = [];
    let t = 1.0;
    for (const [x, z] of pts) {
      const q = kf[kf.length - 1].p;
      kf.push({ t: (t += Math.hypot(x - q[0], z - q[1]) / 140 + 0.05), p: [x, z, 4] });
      kf.push({ t: (t += 0.28), p: [x, z, PLACA.grosor] }); toques.push(t);
      kf.push({ t: (t += 0.18), p: [x, z, 4] });
    }
    return {
      id: "mapa", nombre: "Mapa de alturas", paso: "Z0", duracion: t + 2.2,
      camara: [{ t: 0, pos: [-200, 170, 190], mira: [0, 0, -35] }, { t: t + 2.2, pos: [-170, 150, 170], mira: [0, 0, -35] }],
      senal: null,
      subtitulos: [[0, "Deja el caimán puesto"], [1.2, "La fresa toca cada punto de la rejilla"], [t - 2.5, "Con esos puntos la app corrige Z mientras fresa"], [t + 0.4, "Mapa listo"]],
      manos: [],
      alTiempo(tt) {
        sinTapa();
        const [bx, bz, h] = kfLineal(kf, tt); fresaSobre(bx, bz, h);
        sondaPuesta();
        const m = new THREE.Matrix4(); let n = 0;
        toques.forEach((tc, i) => { if (tt >= tc) { m.makeTranslation(pts[i][0], PLACA.grosor + 0.6, 55 + pts[i][1]); puntosMapa.setMatrixAt(n++, m); } });
        puntosMapa.count = n; puntosMapa.visible = n > 0; puntosMapa.instanceMatrix.needsUpdate = true;
      },
    };
  })(),
  {
    id: "quitarCaiman", nombre: "Quita el caimán", paso: "Z0", duracion: 7,
    camara: [{ t: 0, pos: [-210, 130, 160], mira: [-30, 25, -20] }, { t: 2.4, pos: [-260, 200, 300], mira: [20, 5, 40] }, { t: 7, pos: [-270, 220, 340], mira: [40, -5, 70] }],
    senal: { pos: new V(ESQ[0], H_SONDA + 12.5, Z_FRESA), t0: 0.2, t1: 1.6, r: 0.8 },
    subtitulos: [[0, "Mapa listo: quita el caimán antes de fresar"], [1.6, "Apriétalo, sácalo hacia ti y déjalo fuera de la cama"], [4.8, "La horquilla se queda en el sujetador"]],
    manos: [{
      lado: "der",
      kf: [
        { t: 0, pos: [120, 140, 160], rot: [-30, 0, -20], pose: "relajada" },
        { t: 1.2, agarra: "caiman", palma: PALMA_CAIMAN, cierre: 0, pose: "pinzaAbierta", aleja: 30 },
        { t: 1.6, agarra: "caiman", palma: PALMA_CAIMAN }, { t: 1.9, agarra: "caiman", palma: PALMA_CAIMAN }, { t: 4.4, agarra: "caiman", palma: ABAJO },
        { t: 4.9, agarra: "caiman", palma: ABAJO, cierre: 0, pose: "pinzaAbierta", aleja: 16 },
        { t: 6.2, pos: [230, 170, 60], rot: [-30, 60, -20], pose: "relajada" },
      ],
    }],
    alTiempo(t) {
      sinTapa();
      fresaSobre(ESQ[0], ESQ[1], H_SONDA);
      conectorPuesto(); horquillaPuesta();
      cub.husillo.updateMatrixWorld(true);
      const destino = mordida(), q = suave(t, 1.9, 4.4);
      const p = destino.clone().lerp(destino.clone().add(new V(40, 6, 18)), ss(q, 0, 0.4)).lerp(REPOSO_CAIMAN, ss(q, 0.3, 1));
      caimanEn(p, 0.7 + 0.3 * suave(t, 1.6, 2.0) - suave(t, 2.6, 3.0));
      cablesSonda();
    },
  },
  // ===== Fresar =====
  {
    id: "ponerTapa", nombre: "Pon la tapa", paso: "Tapa", duracion: TAPA_D,
    camara: [{ t: 0, pos: [180, 330, 820], mira: [-40, -10, 80] }, { t: 3.5, pos: [220, 420, 1050], mira: [-170, 20, 60] }, { t: TAPA_D, pos: [420, 300, 780], mira: [0, 30, 60] }],
    senal: null,
    subtitulos: [[0, "Toma la tapa de los costados"], [3.0, "Llévala sobre la máquina"], [4.6, "Bájala derecho hasta que asiente"], [6.4, "Con la tapa puesta, el husillo ya puede encender"]],
    manos: [manoTapa("der"), manoTapa("izq")].map((m) => ({ ...m, kf: alReves(m.kf, TAPA_D) })),
    alTiempo(t) { cub.tapa.position.set(...kfSuave(TAPA_KF, TAPA_D - t)); sondaGuardada(); },
  },
  {
    id: "fresar", nombre: "Prueba en aire y fresa", paso: "Fresar", duracion: T_FIN_CORTE + 2.6,
    camara: [{ t: 0, pos: [0, 170, 380], mira: [0, 10, -30] }, { t: 4.6, pos: [40, 150, 360], mira: [0, 5, -30] },
             { t: 5.4, pos: [470, 100, 300], mira: [100, -20, 30] }, { t: 8.6, pos: [450, 90, 290], mira: [100, -20, 30] },
             { t: 9.4, pos: [60, 70, 70], mira: [0, 5, -30] }, { t: T_FIN_CORTE + 2.6, pos: [70, 75, 85], mira: [0, 5, -30] }],
    senal: { pos: pa, t0: 5.8, t1: 7.4, r: 0.8 },
    subtitulos: [[0, "Con la tapa puesta, primero la prueba en aire"], [1.2, "El mismo recorrido 5 mm arriba: revisa que quede dentro de la placa"], [4.2, "Luego Fresar: la V corta el cobre"], [5.6, "Gafas puestas y la mano cerca del PARO"],
                 [9.4, "No abras la tapa mientras corta"], [T_FIN_CORTE + 0.2, "Al acabar las pistas, la app te pide la broca"]],
    manos: [{
      lado: "der",
      kf: [
        { t: 4.6, pos: [pa.x + 200, pa.y + 110, pa.z + 120], rot: [-20, 90, -10], pose: "relajada" },
        { t: 5.8, pos: [pa.x + 32, pa.y + 10, pa.z], rot: [-35, 90, 0], pose: "apuntar", empuja: [1, 0.3, 0] },
        { t: T_FIN_CORTE + 2.6, pos: [pa.x + 32, pa.y + 10, pa.z], rot: [-35, 90, 0], pose: "apuntar", empuja: [1, 0.3, 0] },
      ],
    }],
    alTiempo(t) {
      sondaGuardada();
      const enAire = t < 4.4;
      const [bx, bz, h] = enAire ? kfLineal(AIRE, t) : kfLineal(CORTE, t); fresaSobre(bx, bz, h);
      if (t > 0.6 && t < T_FIN_CORTE + 0.3) girar(t);
      pintarPlaca(surco(CORTE, t), 0.6 * fr(t, 4.4, T_FIN_CORTE));
      ponerPolvo(t, new V(cub.carroX.position.x, PLACA.grosor, Z_FRESA), !enAire && h <= H_CORTE + 0.01);
    },
  },
  {
    id: "paro", nombre: "Paro de emergencia", paso: "Fresar", duracion: 7,
    camara: [{ t: 0, pos: [470, 100, 300], mira: [100, -20, 30] }, { t: 7, pos: [440, 90, 280], mira: [100, -20, 30] }],
    senal: { pos: pa, t0: 0.3, t1: 1.6, r: 0.8 },
    subtitulos: [[0, "Si algo suena raro o se mueve la placa: PARO"], [1.8, "El botón rojo, o Esc en la app"], [3.2, "Se detienen la fresa y el movimiento"], [5.0, "Antes de seguir, revisa en la app qué pasó"]],
    manos: [{ lado: "der", kf: [{ t: 0, pos: [pa.x + 32, pa.y + 10, pa.z], rot: [-35, 90, 0], pose: "apuntar", empuja: [1, 0.3, 0] }, ...presionarBoton(pa, 2.0).slice(2)] }],
    alTiempo(t) {
      sondaGuardada();
      const tc = 7 + Math.min(t, 2.0);           // a la mitad del corte; al presionar, todo se queda quieto
      const [bx, bz, h] = kfLineal(CORTE, tc); fresaSobre(bx, bz, h);
      girar(t < 2.0 ? t : 2.0 + (1 - Math.exp(-(t - 2.0) * 2)) * 0.5);
      cub.botones.paro.position.z = t >= 1.85 && t < 2.35 ? 1.2 : 2.4;
      pintarPlaca(surco(CORTE, tc), 0.4);
      ponerPolvo(t, new V(cub.carroX.position.x, PLACA.grosor, Z_FRESA), t < 2.0);
    },
  },
  // ===== Al terminar =====
  {
    id: "limpiar", nombre: "Aspira el polvo", paso: "Al terminar", duracion: 9,
    camara: [{ t: 0, pos: [560, 330, 420], mira: [40, 50, 60] }, { t: 9, pos: [520, 300, 400], mira: [40, 50, 60] }],
    senal: null,
    subtitulos: [[0, "Al terminar, quita la tapa y aspira el polvo"], [2.0, "Pasa la boquilla cerca, sin tocar la placa"], [6.4, "Así ves bien las pistas y no respiras el polvo"]],
    // sobre la placa, con la cama adelante (su centro queda en z = 15)
    pasadas: [{ t: 0, p: [170, 130, 200] }, { t: 1.6, p: [-30, 14, -22] }, { t: 2.6, p: [45, 14, -22] }, { t: 3.4, p: [45, 14, 2] }, { t: 4.4, p: [-30, 14, 2] }, { t: 5.2, p: [-30, 14, 26] },
              { t: 6.2, p: [45, 14, 26] }, { t: 7.0, p: [45, 14, 50] }, { t: 8.0, p: [-30, 14, 50] }, { t: 9, p: [120, 130, 220] }],
    manos: [{ lado: "der", kf: [{ t: 0, agarra: "aspiradora", palma: ABAJO }, { t: 9, agarra: "aspiradora", palma: ABAJO }] }],
    alTiempo(t) {
      sinTapa(); fresaSobre(-72.5, -50, 40);          // husillo arriba y a la izquierda, cama adelante
      sondaGuardada();
      pintarPlaca(SURCO_COMPLETO, 1 - fr(t, 1.6, 8.0));
      aspiradora.g.visible = true;
      aspiradora.g.position.set(...kfSuave(this.pasadas, t));
      aspiradora.g.rotation.set(-0.85, 0, 0);
    },
  },
  {
    id: "sacarPlaca", nombre: "Saca la placa", paso: "Al terminar", duracion: 12,
    camara: [{ t: 0, pos: [66 + 80, 62, 54.75 + 82], mira: [62, 4, 54.75] }, { t: 3.0, pos: [66 + 70, 58, 54.75 + 72], mira: [62, 4, 54.75] },
             { t: 3.8, pos: [180, 210, 380], mira: [0, 0, 35] }, { t: 12, pos: [200, 230, 430], mira: [0, 10, 65] }],
    senal: null,
    subtitulos: [[0, "Afloja los dos sujetadores y saca la horquilla"], [3.6, "Retíralos de la orilla"], [5.0, "Desliza la placa un poco hacia ti"], [7.8, "Tómala de las orillas y sácala"]],
    placa: [{ t: 0, p: [0, 0, PLACA.bz] }, { t: 5.4, p: [0, 0, PLACA.bz] }, { t: 7.0, p: [0, 0, PLACA.bz + 12] }, { t: 8.8, p: [0, 0, PLACA.bz + 12] }, { t: 10.4, p: [0, 50, PLACA.bz + 180] }, { t: 12, p: [0, 70, PLACA.bz + 260] }],
    manos: (() => {
      // la derecha desliza la placa con el índice y luego, con la izquierda, la levanta de las orillas
      const [der, izq] = manosPlaca(() => [{ t: 7.9, suelta: true }, { t: 8.8, agarra: true }, { t: 12, agarra: true }]);
      der.kf = [
        { t: 3.8, pos: [120, 150, 220], rot: [-40, 0, -10], pose: "relajada", ancla: "index-finger-tip" },
        { t: 5.0, en: "placa", pos: [0, 14, 34], rot: [-45, 0, 0], pose: "apuntar", ancla: "index-finger-tip", empuja: [0, 1, 0.3] },
        { t: 5.4, en: "placa", pos: [0, 2.0, 34], rot: [-45, 0, 0], pose: "presionar", ancla: "index-finger-tip", empuja: [0, 1, 0.3] },
        { t: 7.0, en: "placa", pos: [0, 2.0, 34], rot: [-45, 0, 0], pose: "presionar", ancla: "index-finger-tip", empuja: [0, 1, 0.3] },
        { t: 7.4, en: "placa", pos: [0, 20, 44], rot: [-45, 0, 0], pose: "relajada", ancla: "index-finger-tip" },
        ...der.kf,
      ];
      izq.desde = 7.0; izq.kf.unshift({ t: 7.0, pos: [-230, 170, 220], rot: [-30, -70, 0], pose: "relajada" });
      return [der, izq];
    })(),
    alTiempo(t) {
      sinTapa();
      fresaSobre(0, -45, 40);              // husillo arriba y cama adelante: hay lugar para las manos
      pintarPlaca(SURCO_COMPLETO, 0);
      allenEn(suj.der, t, { t0: 0.2, t1: 0.8, t2: 2.6, t3: 3.2, vueltas: -1.5, sube: (g) => 0.8 + 1.4 * g });
      suj.izq.tornillo.position.y = 2.2 * suave(t, 0.8, 2.6);
      // la horquilla sale hacia el frente cuando el tornillo ya está flojo
      conectorPuesto(); caimanEn(REPOSO_CAIMAN, 0);
      const f = horquillaFin(); horquillaEn(f.clone().add(new V(25 * suave(t, 2.6, 3.4), -8 * suave(t, 2.6, 3.4), 40 * suave(t, 2.0, 3.2))));
      cablesSonda();
      // los sujetadores se hacen hacia afuera 9 mm (lo que deja su ranura)
      const sale = suave(t, 3.6, 4.6) * 9;
      suj.der.grupo.position.x = SUJ.der.bx + sale; suj.der.tornillo.position.x = SUJ.der.bx + sale - ROSCA_SUJ.der[0];
      suj.izq.grupo.position.x = SUJ.izq.bx - sale; suj.izq.tornillo.position.x = ROSCA_SUJ.izq[0] - SUJ.izq.bx + sale;
      const [x, y, z] = kfSuave(this.placa, t); placa.position.set(x, y, 55 + z);
    },
  },
  {
    id: "apagar", nombre: "Apaga", paso: "Al terminar", duracion: 6,
    camara: [{ t: 0, pos: [on.x + 330, on.y + 150, on.z + 320], mira: [on.x - 10, on.y + 10, on.z + 20] }, { t: 3.6, pos: [on.x + 260, on.y + 90, on.z + 230], mira: [on.x - 10, on.y, on.z + 20] },
             { t: 6, pos: [380, 60, 480], mira: [0, -45, 120] }],
    senal: { pos: on, t0: 0.4, t1: 2.0 },
    subtitulos: [[0, "Para apagar, el mismo botón ON/OFF"], [3.0, "Se apagan la franja, la pantalla y la luz"]],
    manos: [{ lado: "der", kf: presionarBoton(on, 2.4) }],
    alTiempo(t) { sinPlaca(); cub.botones.encendido.position.z = t >= 2.25 && t < 2.7 ? 1.4 : 2.4; encendida(t < 2.4); },
  },
];
