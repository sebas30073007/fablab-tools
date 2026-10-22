// envios.js - pasar un archivo de una app del Fab Lab a otra (el Visor 3D manda cortes al láser y a
// la CNC). Se guarda en IndexedDB y la app que lo recibe lo abre con ?abrir=<origen> en la URL.

const BD = "fablab-envios";

function tienda(modo, f) {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("envios");
    r.onerror = () => mal(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction("envios", modo), q = f(tx.objectStore("envios"));
      tx.oncomplete = () => { r.result.close(); ok(q?.result); };
      tx.onerror = () => { r.result.close(); mal(tx.error); };
    };
  });
}

// archivo: { nombre, texto }. Abre la app destino ("laser", "cnc").
export async function enviar(destino, archivo, origen = "visor3d") {
  await tienda("readwrite", (st) => st.put({ ...archivo, origen, fecha: Date.now() }, destino));
  location.href = `../${destino}/?abrir=${origen}`;
}

// En la app que recibe: el archivo pendiente (como File) o null. Se borra al leerlo.
export async function recibir(destino) {
  if (!new URLSearchParams(location.search).has("abrir")) return null;
  try {
    const e = await tienda("readonly", (st) => st.get(destino));
    await tienda("readwrite", (st) => st.delete(destino));
    history.replaceState(null, "", location.pathname);
    if (!e || Date.now() - e.fecha > 10 * 60 * 1000) return null;   // de hace más de 10 min: se ignora
    return new File([e.texto], e.nombre, { type: "text/plain" });
  } catch (_) { return null; }
}
