// videos.js - los videos de las manos (web/videos/manos, se hacen con tools/grabar_clips.py).
// Se usan en el manual (botón por paso), en el recorrido guiado (`video` en un paso) y en el examen.

import { esc } from "./ui.js";

const RUTA = "../videos/manos/";

// Video corto que se repite solo, sin sonido (para tarjetas y preguntas)
export const htmlVideo = (id, clase = "") =>
  `<video class="vid ${clase}" src="${RUTA}${id}.mp4" poster="${RUTA}${id}.jpg" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>`;

// Video grande encima de todo, con controles; se cierra con Esc, con la ✕ o tocando afuera
export function verVideo(id, nombre = "") {
  const capa = document.createElement("div");
  capa.className = "vid-capa";
  capa.innerHTML = `<figure class="vid-capa__caja" role="dialog" aria-modal="true" aria-label="${esc(nombre)}">
      <video src="${RUTA}${id}.mp4" poster="${RUTA}${id}.jpg" autoplay controls playsinline></video>
      <figcaption>${esc(nombre)}<button type="button" class="btn-texto" data-cerrar aria-label="Cerrar">✕</button></figcaption>
    </figure>`;
  const cerrar = () => { capa.remove(); removeEventListener("keydown", tecla, true); };
  const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
  capa.addEventListener("click", (e) => { if (e.target === capa || e.target.closest("[data-cerrar]")) cerrar(); });
  addEventListener("keydown", tecla, true);
  document.body.append(capa);
  capa.querySelector("[data-cerrar]").focus();
}
