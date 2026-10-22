// main.js - la página de los escáneres: el gemelo a la izquierda y la guía de Creality Scan en el panel.
//   Guía      los pasos, uno a la vez; cada paso mueve el gemelo (vista, luces, tornamesa)
//   Ajustes   recetas por tipo de pieza y problemas comunes
//   Exportar  qué opción elegir al exportar y el paso al Visor 3D
// ?equipo=pika|otter · ?captura (sin mandos) · ?solo (el escáner solo) · ?vista=… · ?modo=…

import "../../shared/js/iconos.js";
import { crearNavegacion } from "../../shared/js/navegacion.js";
import { $, $$, esc, ico, crearLs } from "../../shared/js/ui.js";
import { crearEscena } from "./escena.js";
import { GUIAS, RECETAS, PROBLEMAS } from "./guia.js";
import { CREALITY } from "../../visor3d/js/datos.js";

const q = new URLSearchParams(location.search);
const ls = crearLs("fablab.escaner.");
const equipo = q.get("equipo") === "otter" ? "otter" : q.get("equipo") === "pika" ? "pika" : ls.get("equipo", "pika");
ls.set("equipo", equipo);
const otter = equipo === "otter";
const NOMBRE = otter ? "CR-Scan Otter" : "Pika";
document.title = `Escáner 3D · ${NOMBRE} · Fab Lab`;
$(`[data-equipo="${equipo}"]`).setAttribute("aria-current", "page");
if (q.has("captura")) document.body.classList.add("captura");
// El Otter no tiene láser: su luz es blanca (para el color) e infrarroja
if (otter) $("#m-luz").textContent = "Luz blanca";

const escena = crearEscena($("#visor"), { otter, solo: q.has("solo") });
const PASOS = GUIAS[equipo];
const S = { paso: Math.min(ls.get(`paso.${equipo}`, 0), PASOS.length - 1) };

function modo(m) {
  if (otter && m === "laser") m = "luz";
  escena.modo(m);
  $$("#modos [data-modo]").forEach((b) => b.setAttribute("aria-checked", b.dataset.modo === m || (m === "luz" && b.dataset.modo === "laser")));
}
$$("#modos [data-modo]").forEach((b) => (b.onclick = () => modo(b.dataset.modo)));
$$(".flota-der [data-vista]").forEach((b) => (b.onclick = () => escena.vista(b.dataset.vista)));
$("#btn-visor").onclick = (e) => { const on = !$(".app").classList.contains("visor-grande"); $(".app").classList.toggle("visor-grande", on); e.currentTarget.setAttribute("aria-pressed", on); };

// Cada paso pone el gemelo como lo describe
function aplicarGemelo(p) {
  escena.vista(p.gemelo.vista);
  modo(p.gemelo.modo);
  escena.girar(p.gemelo.girar);
}
function irPaso(i) {
  S.paso = Math.max(0, Math.min(PASOS.length - 1, i));
  ls.set(`paso.${equipo}`, S.paso);
  aplicarGemelo(PASOS[S.paso]);
  refrescar();
  $("#vista").scrollTop = 0;
}

// ======================================================================
// Vistas del panel
// ======================================================================
const chev = ico("chev");
function guia(pag) {
  const p = PASOS[S.paso], n = PASOS.length, ultimo = S.paso === n - 1;
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">${esc(NOMBRE)}</h2></header>
    <section class="w w-guia" aria-label="Paso actual">
      <span class="w-cab"><span>Paso ${S.paso + 1} de ${n} · ${esc(p.t)}</span></span>
      <span class="rayitas" aria-hidden="true">${PASOS.map((_, i) => `<i class="${i < S.paso ? "on" : i === S.paso ? "ahora" : ""}"></i>`).join("")}</span>
      <span class="w-texto">${esc(p.titulo)}</span>
      <span class="w-sub w-sub--grande">${esc(p.texto)}</span>
      <ul class="lista-txt">${p.puntos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <span class="w-acc">
        ${S.paso ? `<button type="button" class="btn-pill" data-a="atras">${ico("atras")}Atrás</button>` : ""}
        ${ultimo ? `<a class="btn-pill btn-pill--main" href="../visor3d/">${ico("cubo")}Abrir el Visor 3D</a>` : `<button type="button" class="btn-pill btn-pill--main" data-a="sig">Siguiente${ico("chev")}</button>`}
      </span>
    </section>
    <section class="w">
      <span class="w-cab"><span>Todos los pasos</span></span>
      <div class="filas">${PASOS.map((x, i) => `<button type="button" class="fila" data-p="${i}" ${i === S.paso ? 'aria-current="step"' : ""}>
        <span class="marca-paso" data-s="${i < S.paso ? "hecho" : i === S.paso ? "ahora" : ""}">${i < S.paso ? ico("ok") : ""}</span>
        <span class="fila__nom">${esc(x.titulo)}</span><span></span>${chev}</button>`).join("")}</div>
    </section>
    <a class="w w--enlace" href="?equipo=${otter ? "pika" : "otter"}">
      <span class="w-cab"><span>¿Usas el ${otter ? "Pika" : "Otter"}?</span>${chev}</span>
      <span class="w-sub">${otter ? "Portátil, con pantalla y batería; láser azul o infrarrojo." : "Cuatro cámaras, por cable; de 1 cm a 2 m."}</span>
    </a>`;
  pag.querySelector('[data-a="sig"]')?.addEventListener("click", () => irPaso(S.paso + 1));
  pag.querySelector('[data-a="atras"]')?.addEventListener("click", () => irPaso(S.paso - 1));
  pag.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => irPaso(+b.dataset.p)));
}

function ajustes(pag) {
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">Ajustes</h2></header>
    <section class="w">
      <span class="w-cab"><span>Según lo que vas a escanear</span></span>
      <span class="w-sub">Seguimiento · tamaño · calidad · resolución de la fusión. Recetas de Creality probadas con el ${otter ? "Otter" : "Otter; en el Pika, el modo que conviene"}.</span>
      <div class="filas">${RECETAS.map((r) => `<div class="fila fila--receta"><span class="fila__nom">${esc(r.que)}<small>${esc(r.ajustes)}${!otter ? ` · <b>${esc(r.pika)}</b>` : ""}</small></span></div>`).join("")}</div>
    </section>
    <section class="w">
      <span class="w-cab"><span>Si algo sale mal</span></span>
      <div class="filas">${PROBLEMAS.filter((x) => otter ? !/Pika/.test(x.p) : true).map((x) => `<div class="fila fila--receta"><span class="fila__nom">${esc(x.p)}<small>${esc(x.s)}</small></span></div>`).join("")}</div>
    </section>`;
}

function exportar(pag) {
  pag.innerHTML = `
    <header class="cab0"><h2 tabindex="-1">Exportar</h2></header>
    <section class="w">
      <span class="w-cab"><span>En Creality Scan: Exportar</span></span>
      <span class="w-sub">Esto trae cada opción de la lista.</span>
      <div class="filas">${CREALITY.map((c) => `<div class="fila fila--txt">
        <span class="fmt fmt--chico">${esc(c.op.split(" ")[0])}</span>
        <span class="fila__nom">${esc(c.op)}${c.rec ? `<em class="rec">Empieza aquí</em>` : ""}<small>${esc(c.que)} ${esc(c.para)}</small></span></div>`).join("")}</div>
    </section>
    <section class="w">
      <span class="w-cab"><span>Después</span></span>
      <span class="w-texto">Ábrelo en el Visor 3D</span>
      <span class="w-sub">Ahí lo enderezas, quitas la tornamesa y lo que sobra, cierras los huecos y lo conviertes a STL, 3MF, GLB, FBX o cortes para el láser.</span>
      <span class="w-acc"><a class="btn-pill btn-pill--main" href="../visor3d/">${ico("cubo")}Abrir el Visor 3D</a><a class="btn-pill" href="../visor3d/?ejemplo">Probar con el búho</a></span>
    </section>`;
}

const { irA, refrescar } = crearNavegacion({ vistas: { inicio: guia, ajustes, exportar }, tabs: ["inicio", "ajustes", "exportar"], app: () => ({}) });
irA("inicio");
// El gemelo arranca en el paso guardado, salvo que la URL pida otra cosa (para capturas)
if (q.has("vista") || q.has("modo")) { if (q.get("vista")) escena.vista(q.get("vista"), { suave: false }); if (q.get("modo")) modo(q.get("modo")); }
else aplicarGemelo(PASOS[S.paso]);
window.__escaner = { escena, irPaso, S };
