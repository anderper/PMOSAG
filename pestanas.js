/* Intercambio de paneles sin recarga. Mejora progresiva pura: las pestañas
   de `.pestanas` en ficha.html/editar_proyecto.html son enlaces reales a la
   misma página con otro `?seccion=`. Si algo aquí falla, o el resultado no
   se ve como el fragmento que se esperaba, no se hace nada raro: se navega
   como si este script no existiera. Una pantalla muerta es mucho peor que
   una recarga. Sin dependencias, sin build. */
(function () {
  var barra = document.querySelector(".pestanas");
  if (!barra || !window.fetch || !window.history.pushState) return;

  var pestanas = barra.querySelectorAll(".pestana");
  if (!pestanas.length) return;

  // La ruta que comparten todas las pestañas (p.ej. `/proyecto/5/editar`).
  // Sirve para detectar cuándo la URL actual NO es una de las suyas — ver
  // el comentario en el manejador de click.
  var rutaPestanas = new URL(pestanas[0].href, location.href).pathname;

  // Hay más de un `.panel` cuando la ficha está en `?seccion=todas` (el modo
  // de impresión completa, ver ficha.html): ahí conviven las seis secciones
  // y no existe un único elemento que reemplazar sin duplicar contenido. En
  // ese caso no hay forma de cumplir la promesa, así que ni se intenta: las
  // pestañas se dejan como enlaces normales.
  function panelUnico() {
    var paneles = document.querySelectorAll(".panel");
    return paneles.length === 1 ? paneles[0] : null;
  }

  // Bajo `?parcial=1` la ruta puede devolver algo que NO es el fragmento:
  // un 403 (SinAcceso) devuelve `sin_acceso.html` completo, con `<!doctype>`
  // propio, y un 401 o un 404 devuelven JSON. Mirar solo `r.ok` no alcanza
  // —ambos casos podrían llegar a esta rama con cambios futuros en las
  // rutas— así que se exige además la firma con la que arrancan
  // `_panel.html` y `_panel_edicion.html`: un `<section class="panel" ...>`.
  function esFragmentoDePanel(html) {
    return /^\s*<section\b[^>]*\bclass="panel"/i.test(html);
  }

  // La sección que codifica una URL, o `null` si no trae `?seccion=`.
  function seccionDe(url) {
    return new URL(url, location.href).searchParams.get("seccion");
  }

  // Las secciones que de verdad ofrecen las pestañas, en el mismo orden en
  // que las renderiza el `{% for %}` del servidor.
  var seccionesValidas = Array.prototype.map.call(pestanas, function (a) {
    return seccionDe(a.href);
  });

  function marcarActiva(url) {
    // Espejo de `normalizar_seccion` en el servidor: si la sección de la URL
    // no está entre las válidas —falte el parámetro (p.ej. `/proyecto/5` tal
    // como la enlaza el tablero) o venga con un valor que ninguna pestaña
    // ofrece (un nombre viejo, vacío, inventado)— se cae a la PRIMERA, que es
    // la misma que el servidor sirve por defecto. Sin este espejo completo,
    // «Atrás» hasta una URL con una sección no reconocida apagaba las seis
    // pestañas aunque el panel mostrado fuera el correcto.
    var actual = seccionDe(url);
    if (seccionesValidas.indexOf(actual) === -1) actual = seccionesValidas[0];
    pestanas.forEach(function (a) {
      if (seccionDe(a.href) === actual) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  // `metodoHistoria` es "pushState", "replaceState" o nada (cuando la llama
  // el manejador de `popstate`, que no debe tocar el historial: el usuario
  // ya lo movió con el botón Atrás/Adelante).
  function cargar(url, destino, metodoHistoria) {
    var separador = url.indexOf("?") === -1 ? "?" : "&";
    return fetch(url + separador + "parcial=1", { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.text();
      })
      .then(function (html) {
        if (!esFragmentoDePanel(html)) throw new Error("no es un fragmento de panel");
        // El aviso de un guardado anterior (bloque `aviso` de
        // editar_proyecto.html) queda FUERA del parcial a propósito: hoy
        // llega ahí porque cada POST re-renderiza la página completa. Si no
        // se quita aquí, quedaría en pantalla un aviso viejo mientras el
        // usuario mira otra sección. En ficha.html no existe ese bloque, así
        // que esto no hace nada ahí.
        document.querySelectorAll(".aviso").forEach(function (el) { el.remove(); });
        destino.outerHTML = html;
        if (metodoHistoria) history[metodoHistoria](null, "", url);
        marcarActiva(url);
      });
  }

  barra.addEventListener("click", function (ev) {
    var enlace = ev.target.closest(".pestana");
    if (!enlace || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) {
      return;
    }
    var destino = panelUnico();
    if (!destino) return;
    ev.preventDefault();
    // Justo después de guardar algo en la edición, la URL vigente no es la
    // de las pestañas: cada POST re-renderiza `editar_proyecto.html` en su
    // propia URL (`/proyecto/{id}/hito`, `/equipo`, etc.), sin redirect —ver
    // el comentario de `editar_proyecto.html`. Esa entrada del historial
    // solo acepta POST; si se apilara sobre ella y el usuario después
    // presionara Atrás, este mismo script intentaría un GET sobre esa URL
    // (o el navegador reintentaría el POST). Por eso se REEMPLAZA en vez de
    // apilarse la primera vez que la URL actual no es una de las pestañas:
    // esa entrada desaparece del historial y Atrás cae en la página real
    // anterior. De ahí en adelante todas las entradas que deja este script
    // son URLs de pestañas, así que vuelve a apilar con normalidad.
    var metodo = location.pathname === rutaPestanas ? "pushState" : "replaceState";
    cargar(enlace.href, destino, metodo).catch(function () {
      location.href = enlace.href;
    });
  });

  window.addEventListener("popstate", function () {
    var destino = panelUnico();
    if (!destino) {
      location.reload();
      return;
    }
    cargar(location.href, destino, null).catch(function () {
      location.reload();
    });
  });
})();
