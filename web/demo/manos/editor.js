// editor.js - editor de las manos de los clips (?editar).
//
// Cada clip tiene una pista por mano (derecha / izquierda) con sus cuadros clave. Aquí se eligen las manos,
// se agregan, mueven y borran cuadros, y en cada cuadro se coloca la mano con la flecha (mover / girar) y se
// doblan los dedos con las barras. Un cuadro editado queda «manual»: se reproduce tal cual, sin el ajuste
// automático de contacto. Puede seguir a un objeto (la tapa, la placa, el caimán…) para moverse con él.
//
// Los cambios se guardan solos en este navegador (borrador). «Guardar archivo» descarga poses.json con
// todos los clips editados: ese archivo, junto a index.html, los deja fijos para todos.

import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

const DEDOS = [
  ["pulgar", "Pulgar", [[-60, 60], [-30, 70], [0, 90], [-20, 90], [-90, 90]], ["gira", "abre", "base", "punta", "rueda"]],
  ["indice", "Índice"], ["medio", "Medio"], ["anular", "Anular"], ["menique", "Meñique"],
];
const FLEX = [[-20, 110], [-20, 110], [-20, 110]], NFLEX = ["base", "medio", "punta"];
const sinGuion = (k, v) => (k.startsWith("_") ? undefined : v);
const copiaPose = (p) => ({ abrir: p.abrir ?? 0, ...Object.fromEntries(DEDOS.map(([d]) => [d, [...(p[d] ?? [])]])) });
const r1 = (v) => Math.round(v * 10) / 10;

export function iniciarEditor(api) {
  const { manos, OBJ, POSES, escena, camara, renderer, orbita, BORRADOR } = api;
  let sel = null;          // { lado, k }
  let activa = "der";

  // ---------------- Flecha (gizmo) ----------------
  const tc = new TransformControls(camara, renderer.domElement);
  tc.setSpace("local"); tc.setSize(0.8);
  escena.add(tc.getHelper());
  // La flecha va en el centro de la palma (la raíz de la mano está en la muñeca, muchas veces fuera de cuadro):
  // se mueve un asa y la mano la sigue con el mismo desplazamiento
  const asa = new THREE.Object3D(); escena.add(asa);
  const rel = new THREE.Matrix4(), _m = new THREE.Matrix4();
  let arrastrando = false;
  function ponerAsa() {
    const r = manos[sel.lado].raiz; r.updateMatrixWorld(true);
    manos[sel.lado].huesos["middle-finger-metacarpal"].getWorldPosition(asa.position);
    asa.quaternion.copy(r.quaternion); asa.updateMatrixWorld(true);
    rel.copy(asa.matrixWorld).invert().multiply(r.matrixWorld);
  }
  tc.addEventListener("dragging-changed", (e) => { arrastrando = e.value; orbita.enabled = !e.value; if (!e.value) guardar(); });
  tc.addEventListener("objectChange", () => {
    if (!sel) return;
    hacerManual(sel);
    const r = manos[sel.lado].raiz;
    asa.updateMatrixWorld(true); _m.multiplyMatrices(asa.matrixWorld, rel).decompose(r.position, r.quaternion, new THREE.Vector3());
    r.updateMatrixWorld(true);
    escribirTransform(sel);
  });

  // ---------------- Panel ----------------
  const css = document.createElement("style");
  css.textContent = `
  #editor { position: absolute; top: 12px; right: 12px; bottom: 12px; width: 290px; overflow: auto; background: rgba(255,255,255,.96);
    border-radius: 14px; box-shadow: 0 6px 24px rgba(17,19,23,.14); padding: 12px; font-size: 13px; display: grid; gap: 10px; align-content: start; z-index: 5; }
  #editor h2 { margin: 0; font-size: 14px; font-weight: 800; display: flex; justify-content: space-between; align-items: center; }
  #editor .fila { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  #editor button, #editor select, #editor input[type=number] { font: inherit; font-size: 12.5px; font-weight: 700; border: 1px solid var(--linea); background: #fff; color: var(--texto);
    border-radius: 999px; padding: 5px 10px; cursor: pointer; }
  #editor input[type=number] { width: 70px; border-radius: 8px; font-weight: 600; }
  #editor select { border-radius: 8px; }
  #editor button[aria-pressed=true] { background: var(--texto); color: #fff; border-color: var(--texto); }
  #editor button:disabled, #editor .apagado { opacity: .4; pointer-events: none; }
  #editor .grupo { display: grid; grid-template-columns: 54px 1fr 34px; gap: 2px 6px; align-items: center; }
  #editor .grupo b { grid-column: 1 / -1; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--suave); margin-top: 4px; }
  #editor .grupo span { color: var(--suave); font-size: 11.5px; }
  #editor .grupo output { font-family: "IBM Plex Mono", monospace; font-size: 11.5px; text-align: right; }
  #editor input[type=range] { width: 100%; accent-color: var(--acento); }
  #editor .nota { color: var(--suave); font-size: 11.5px; line-height: 1.35; }
  #pistas { display: grid; gap: 4px; }
  #pistas .pista { position: relative; height: 18px; border-radius: 6px; background: #f1f2f4; cursor: pointer; }
  #pistas .pista em { position: absolute; left: 6px; top: 1px; font-style: normal; font-size: 11px; font-weight: 800; color: var(--suave); pointer-events: none; }
  #pistas .kf { position: absolute; top: 3px; width: 12px; height: 12px; margin-left: -6px; border-radius: 3px; transform: rotate(45deg); background: #8e939b; border: 0; padding: 0; }
  #pistas .kf.manual { background: var(--texto); }
  #pistas .kf.sel { background: var(--acento); }
  #pistas .cursor { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--acento); pointer-events: none; }
  @media (max-width: 720px) { #editor { top: auto; left: 8px; right: 8px; height: 46%; width: auto; } }`;
  document.head.append(css);

  const panel = document.createElement("div"); panel.id = "editor";
  panel.innerHTML = `
    <h2>Editor de manos <button data-a="camara" title="Volver a la cámara del clip">Cámara del clip</button></h2>
    <div class="fila"><button data-mano="der">Derecha</button><button data-mano="izq">Izquierda</button><button data-a="quitarMano">Quitar mano</button></div>
    <div class="fila"><button data-a="previo" title="Cuadro anterior (←)">◀</button><button data-a="agregar" title="Agregar cuadro aquí (K)">+ Cuadro aquí</button>
      <button data-a="siguiente" title="Cuadro siguiente (→)">▶</button><button data-a="borrar" title="Borrar cuadro (Supr)">Borrar</button></div>
    <div class="fila" data-zona="cuadro"><label>Tiempo <input type="number" step="0.1" min="0" data-c="t"></label>
      <label>Sigue a <select data-c="sigue"></select></label></div>
    <div class="fila" data-zona="cuadro"><button data-modo="translate" title="W">Mover</button><button data-modo="rotate" title="E">Girar</button>
      <label>Pose <select data-c="pose"><option value="">—</option>${Object.keys(POSES).map((n) => `<option>${n}</option>`).join("")}</select></label></div>
    <div data-zona="cuadro" data-dedos></div>
    <div class="fila"><button data-a="archivo">Guardar archivo</button><button data-a="copiar">Copiar</button><button data-a="descartar">Descartar este clip</button></div>
    <p class="nota" data-estado>Elige un cuadro en las pistas de abajo o agrega uno.</p>`;
  document.getElementById("lienzo").append(panel);
  const $ = (s) => panel.querySelector(s);

  // Barras de los dedos
  const dedosEl = $("[data-dedos]");
  for (const [d, nombre, rangos = FLEX, nombres = NFLEX] of DEDOS) {
    const g = document.createElement("div"); g.className = "grupo"; g.innerHTML = `<b>${nombre}</b>`;
    rangos.forEach(([a, b], i) => {
      g.insertAdjacentHTML("beforeend", `<span>${nombres[i]}</span><input type="range" min="${a}" max="${b}" step="1" data-d="${d}" data-i="${i}"><output></output>`);
    });
    dedosEl.append(g);
  }
  dedosEl.insertAdjacentHTML("beforeend", `<div class="grupo"><b>Separación</b><span>abrir</span><input type="range" min="-10" max="20" step="0.5" data-d="abrir"><output></output></div>`);
  dedosEl.addEventListener("input", (e) => {
    const el = e.target; if (!sel || el.type !== "range") return;
    hacerManual(sel);
    const v = Number(el.value), pose = sel.k.pose;
    if (el.dataset.d === "abrir") pose.abrir = v; else pose[el.dataset.d][Number(el.dataset.i)] = v;
    el.nextElementSibling.value = v;
    $("[data-c=pose]").value = "";
  });
  dedosEl.addEventListener("change", guardar);

  // Pistas (bajo la barra de tiempo)
  const pistas = document.createElement("div"); pistas.id = "pistas";
  document.querySelector(".controles").append(pistas);

  // Seguir a un objeto
  $("[data-c=sigue]").innerHTML = `<option value="">nada (fijo)</option>${Object.keys(OBJ).map((n) => `<option>${n}</option>`).join("")}`;

  // ---------------- Cuadros ----------------
  const pista = (lado, c = api.clip()) => c.manos.find((p) => p.lado === lado);
  const ordenar = (p) => p.kf.sort((a, b) => a.t - b.t);
  const siguiendo = (k) => k.en ?? k.agarra ?? null;

  // Convierte un cuadro (libre o de agarre) a cuadro del editor, con la mano donde está ahora
  function hacerManual(s) {
    const k = s.k; if (k.manual) return;
    const m = manos[s.lado];
    const pose = copiaPose(m.pose);
    const sigue = siguiendo(k);
    for (const x of ["agarra", "palma", "aleja", "cierre", "ancla", "empuja"]) delete k[x];
    Object.assign(k, { manual: true, raiz: true, pose, en: sigue ?? undefined });
    if (!sigue) delete k.en;
    escribirTransform(s);
    (k._horno ??= {})[s.lado] = { pose, off: new THREE.Vector3() };
  }
  // Guarda en el cuadro dónde está la raíz de la mano (en el marco del objeto que sigue, si sigue a uno)
  function escribirTransform(s) {
    const k = s.k, r = manos[s.lado].raiz;
    let pos = r.position.clone(), q = r.quaternion.clone();
    if (k.en) {
      const o = OBJ[k.en].o; o.updateMatrixWorld(true);
      pos = o.worldToLocal(pos);
      q = o.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q);
    }
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    k.pos = pos.toArray().map(r1);
    k.rot = [e.x, e.y, e.z].map((v) => r1(THREE.MathUtils.radToDeg(v)));
    if (k._horno?.[s.lado]) k._horno[s.lado].pose = k.pose;
  }

  function elegir(lado, k) {
    sel = k ? { lado, k } : null; activa = lado ?? activa;
    if (k) { api.pausar(); api.ir(k.t); }
    pintar();
  }
  function agregar() {
    const c = api.clip(), t = api.t();
    let p = pista(activa);
    const m = manos[activa];
    if (!p) { p = { lado: activa, kf: [] }; c.manos.push(p); }
    const cerca = p.kf.find((k) => Math.abs(k.t - t) < 0.05);
    if (cerca) return elegir(activa, cerca);
    let k;
    if (m.raiz.visible && p.kf.length) {
      k = { t: r1(t), manual: true, raiz: true, pose: copiaPose(m.pose), pos: [0, 0, 0], rot: [0, 0, 0] };
      p.kf.push(k); escribirTransform({ lado: activa, k });
    } else {
      // mano nueva: frente al objetivo de la cámara, del lado que le toca
      const s = activa === "der" ? 1 : -1, o = orbita.target;
      k = { t: r1(t), manual: true, raiz: true, pose: copiaPose(POSES.relajada), pos: [r1(o.x + 90 * s), r1(o.y + 70), r1(o.z + 110)], rot: [-30, 0, 0] };
      p.kf.push(k);
    }
    delete p.desde; delete p.hasta;
    ordenar(p); api.rehornear(c); guardar(); elegir(activa, k);
  }
  function borrar() {
    if (!sel) return;
    const c = api.clip(), p = pista(sel.lado);
    p.kf.splice(p.kf.indexOf(sel.k), 1);
    if (!p.kf.length) c.manos.splice(c.manos.indexOf(p), 1);
    api.rehornear(c); guardar(); elegir(sel.lado, null);
  }
  function saltar(dir) {
    const p = pista(activa); if (!p) return;
    const t = api.t(), lista = dir > 0 ? p.kf.filter((k) => k.t > t + 0.01) : p.kf.filter((k) => k.t < t - 0.01).reverse();
    if (lista[0]) elegir(activa, lista[0]);
  }

  // ---------------- Guardar ----------------
  const leerBorrador = () => { try { return JSON.parse(localStorage.getItem(BORRADOR) || "{}"); } catch { return {}; } };
  const serial = (c) => JSON.parse(JSON.stringify(c.manos, sinGuion));
  function guardar() {
    const b = leerBorrador(); b[api.clip().id] = serial(api.clip());
    try { localStorage.setItem(BORRADOR, JSON.stringify(b)); estado("Guardado en este navegador. «Guardar archivo» para dejarlo fijo."); }
    catch { estado("No se pudo guardar el borrador en este navegador."); }
  }
  async function todo() {
    let base = {};
    try { const r = await fetch("poses.json", { cache: "no-store" }); if (r.ok) base = await r.json(); } catch {}
    const ids = new Set([...Object.keys(base), ...Object.keys(leerBorrador())]);
    return Object.fromEntries(api.CLIPS.filter((c) => ids.has(c.id)).map((c) => [c.id, serial(c)]));
  }
  const estado = (txt) => { $("[data-estado]").textContent = txt; };

  // ---------------- Eventos ----------------
  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.mano) {
      activa = b.dataset.mano;
      if (!pista(activa)) agregar(); else elegir(activa, null);
    }
    if (b.dataset.modo) { tc.setMode(b.dataset.modo); pintar(); }
    const a = b.dataset.a;
    if (a === "camara") api.camaraClip();
    if (a === "quitarMano") {
      const c = api.clip(), p = pista(activa);
      if (p) { c.manos.splice(c.manos.indexOf(p), 1); api.rehornear(c); guardar(); elegir(activa, null); }
    }
    if (a === "agregar") agregar();
    if (a === "borrar") borrar();
    if (a === "previo") saltar(-1);
    if (a === "siguiente") saltar(1);
    if (a === "archivo") {
      const blob = new Blob([JSON.stringify(await todo(), null, 1)], { type: "application/json" });
      const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = "poses.json"; el.click();
      estado("Descargado poses.json: pásamelo (o ponlo junto a index.html) para dejarlo fijo.");
    }
    if (a === "copiar") { await navigator.clipboard.writeText(JSON.stringify(await todo(), null, 1)); estado("Copiado."); }
    if (a === "descartar") {
      const b2 = leerBorrador(); delete b2[api.clip().id];
      localStorage.setItem(BORRADOR, JSON.stringify(b2)); location.reload();
    }
  });
  $("[data-c=t]").addEventListener("change", (e) => {
    if (!sel) return;
    sel.k.t = Math.max(0, Math.min(api.clip().duracion, Number(e.target.value)));
    ordenar(pista(sel.lado)); api.rehornear(api.clip()); guardar(); elegir(sel.lado, sel.k);
  });
  $("[data-c=sigue]").addEventListener("change", (e) => {
    if (!sel) return;
    hacerManual(sel);
    if (e.target.value) sel.k.en = e.target.value; else delete sel.k.en;
    escribirTransform(sel); guardar(); pintar();
  });
  $("[data-c=pose]").addEventListener("change", (e) => {
    if (!sel || !e.target.value) return;
    hacerManual(sel);
    const p = copiaPose(POSES[e.target.value]);
    Object.assign(sel.k.pose, p);
    guardar(); pintar();
  });
  pistas.addEventListener("click", (e) => {
    const kf = e.target.closest(".kf"), fila = e.target.closest(".pista"); if (!fila) return;
    const lado = fila.dataset.lado, p = pista(lado);
    if (kf) return elegir(lado, p.kf[Number(kf.dataset.i)]);
    // clic en la pista vacía: lleva el tiempo ahí
    const r = fila.getBoundingClientRect();
    activa = lado; elegir(lado, null); api.ir(((e.clientX - r.left) / r.width) * api.clip().duracion);
  });
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, select")) return;
    if (e.key === "w" || e.key === "W") { tc.setMode("translate"); pintar(); }
    if (e.key === "e" || e.key === "E") { tc.setMode("rotate"); pintar(); }
    if (e.key === "k" || e.key === "K") agregar();
    if (e.key === "Delete") borrar();
    if (e.key === "ArrowRight") { e.preventDefault(); saltar(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); saltar(-1); }
  });
  // Al cambiar de clip con los botones de abajo, se suelta la selección
  document.getElementById("clips").addEventListener("click", () => setTimeout(() => elegir(activa, null), 0));

  // ---------------- Pintar ----------------
  let firma = "";
  const firmaDe = (c) => `${c.id}|${c.manos.map((p) => p.lado + p.kf.length).join()}`;
  function pintar() {
    const c = api.clip();
    for (const b of panel.querySelectorAll("[data-mano]")) b.setAttribute("aria-pressed", b.dataset.mano === activa);
    for (const b of panel.querySelectorAll("[data-mano]")) b.textContent = `${b.dataset.mano === "der" ? "Derecha" : "Izquierda"}${pista(b.dataset.mano) ? "" : " +"}`;
    $("[data-a=quitarMano]").disabled = !pista(activa);
    $("[data-a=borrar]").disabled = !sel;
    for (const z of panel.querySelectorAll("[data-zona=cuadro]")) z.classList.toggle("apagado", !sel);
    for (const b of panel.querySelectorAll("[data-modo]")) b.setAttribute("aria-pressed", tc.mode === b.dataset.modo);
    if (sel) {
      $("[data-c=t]").value = sel.k.t;
      $("[data-c=sigue]").value = siguiendo(sel.k) ?? "";
      const pose = sel.k.manual ? sel.k.pose : copiaPose(manos[sel.lado].pose);
      for (const el of dedosEl.querySelectorAll("input")) {
        const v = el.dataset.d === "abrir" ? pose.abrir : pose[el.dataset.d]?.[Number(el.dataset.i)] ?? 0;
        el.value = v; el.nextElementSibling.value = Math.round(v);
      }
      $("[data-c=pose]").value = typeof sel.k.pose === "string" ? sel.k.pose : "";
      estado(sel.k.manual ? "Cuadro editado: se reproduce tal cual." : "Cuadro automático: al moverlo o doblar un dedo pasa a ser tuyo.");
    }
    // pistas
    const filas = ["der", "izq"].map((lado) => {
      const p = pista(lado);
      const kfs = p ? p.kf.map((k, i) => `<button class="kf${k.manual ? " manual" : ""}${sel?.k === k ? " sel" : ""}" data-i="${i}" style="left:${(k.t / c.duracion) * 100}%" title="${k.t.toFixed(1)} s"></button>`).join("") : "";
      return `<div class="pista" data-lado="${lado}"><em>${lado === "der" ? "Der" : "Izq"}</em>${kfs}<i class="cursor"></i></div>`;
    }).join("");
    pistas.innerHTML = filas;
    firma = firmaDe(c);
  }

  // Cada cuadro: el cursor de las pistas y la flecha sobre la mano (solo si el tiempo está en el cuadro elegido)
  (function bucle() {
    const c = api.clip(), t = api.t();
    for (const cur of pistas.querySelectorAll(".cursor")) cur.style.left = `${(t / c.duracion) * 100}%`;
    if (firmaDe(c) !== firma) pintar();
    const enCuadro = sel && Math.abs(t - sel.k.t) < 1e-3 && manos[sel.lado].raiz.visible;
    if (enCuadro && !arrastrando) ponerAsa();
    if (enCuadro && tc.object !== asa) tc.attach(asa);
    if (!enCuadro && tc.object) tc.detach();
    requestAnimationFrame(bucle);
  })();
  pintar();
}
