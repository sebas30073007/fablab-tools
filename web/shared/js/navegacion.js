// navegacion.js - el panel como la app de un teléfono (arquitectura de OPI, docs/laboratorio-ui.md):
//   nivel 0  las pestañas de la barra inferior (tabs)
//   nivel 2  el detalle de cada widget, con flecha a Inicio
//   nivel 3  lo que se abre desde un detalle (padre[id] dice a cuál regresa)
// Cada vista es vistas[id](pag, app) y puede devolver { vivo } para actualizarse sin repintar.

import { $, $$ } from "./ui.js";

export function crearNavegacion({ vistas, tabs, padre = {}, app }) {
  const nav = { actual: null, vivo: null };
  const nivel = (v) => (tabs.includes(v) ? 0 : padre[v] ? 3 : 2);

  function irA(id, { dir = null, foco = true } = {}) {
    const antes = nav.actual;
    if (!dir) dir = !antes ? "ninguna" : nivel(id) > nivel(antes) ? "der" : nivel(id) < nivel(antes) ? "izq" : "funde";
    nav.actual = id;
    const cont = $("#vista");
    const pag = document.createElement("div");
    pag.className = "pag" + ({ der: " pag--entra-der", izq: " pag--entra-izq", funde: " pag--funde" }[dir] || "");
    const r = vistas[id](pag, app()) || {};
    nav.vivo = r.vivo || null;
    cont.replaceChildren(pag);
    cont.scrollTop = 0;
    // Barra inferior: en el nivel 2 sigue encendida la primera pestaña (Inicio)
    const tab = tabs.includes(id) ? id : tabs[0];
    $$(".navinf__pildora [data-tab]").forEach((b) => {
      const on = b.dataset.tab === tab;
      if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      if (b.dataset.tab === "inicio") b.querySelector("use").setAttribute("href", on ? "#i-casa-on" : "#i-casa");
    });
    if (foco && antes && dir !== "ninguna") pag.querySelector("h2")?.focus({ preventScroll: true });
    nav.vivo?.();
  }
  function regresar() { irA(padre[nav.actual] || tabs[0], { dir: "izq" }); }
  // Vuelve a pintar la página actual, sin animación y sin perder el scroll
  function refrescar() {
    if (!nav.actual) return;
    const st = $("#vista").scrollTop;
    // El campo que se estaba editando sigue enfocado tras repintar (p. ej. al regenerar con Tab al siguiente)
    const f = document.activeElement, attr = f && ["data-p", "data-m"].find((k) => f.hasAttribute?.(k));
    const sel = attr ? `[${attr}="${f.getAttribute(attr)}"]` : null;
    irA(nav.actual, { dir: "ninguna", foco: false });
    if (sel) $("#vista").querySelector(sel)?.focus({ preventScroll: true });
    $("#vista").scrollTop = st;
  }
  $$(".navinf__pildora [data-tab]").forEach((b) => (b.onclick = () => irA(b.dataset.tab)));
  return { nav, irA, regresar, refrescar };
}
