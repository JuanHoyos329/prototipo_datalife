/* DataLife · prototipo estático: Cupos, Recursos y Alertas.
   Toda la lógica corre en el navegador sobre datos simulados. */
(function () {
  'use strict';

  var DL = window.DATALIFE;
  var RECURSOS = DL.RECURSOS, ALBERGUES = DL.ALBERGUES, PERFILES = DL.PERFILES;
  var REC = {}; RECURSOS.forEach(function (r) { REC[r.codigo] = r; });
  var PRIO = { alta: ['Alta', 't-crit'], media: ['Media', 't-warn'], baja: ['Baja', 't-ok'] };
  var CLAVE = 'dl-prototipo-v2';
  var app = document.getElementById('app');

  /* ------------------------------------------------------------------ */
  /* Almacenamiento (si el navegador lo bloquea, funciona solo en memoria) */
  /* ------------------------------------------------------------------ */
  var memoria = {};
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return memoria[k] || null; } }
  function escribir(k, v) { try { localStorage.setItem(k, v); } catch (e) { memoria[k] = v; } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) { delete memoria[k]; } }

  var S;
  function cargar() {
    try { S = JSON.parse(leer(CLAVE)); } catch (e) { S = null; }
    if (!S || S.version !== 2) { S = DL.semilla(); guardar(); }
  }
  function guardar() { escribir(CLAVE, JSON.stringify(S)); }

  /* ------------------------------------------------------------------ */
  /* Formato es-CO                                                       */
  /* ------------------------------------------------------------------ */
  var fmtCache = {};
  function n(v, dec) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    dec = dec || 0;
    var f = fmtCache[dec] || (fmtCache[dec] = new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
    return f.format(v);
  }
  function ncorto(v) { // hasta 2 decimales, sin ceros sobrantes
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(v);
  }
  var fFecha = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' });
  var fHora = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  function fecha(t, conHora) {
    if (!t) return '—';
    var d = new Date(t);
    return fFecha.format(d) + (conHora === false ? '' : ' ' + fHora.format(d));
  }
  function diaBogota(t) { return fFecha.format(new Date(t)); }
  function pct(occ) { return Math.round(occ * 100); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ------------------------------------------------------------------ */
  /* Cálculos (equivalen a las vistas SQL del sistema)                   */
  /* ------------------------------------------------------------------ */
  function albergue(id) { return ALBERGUES.filter(function (a) { return a.id === id; })[0]; }
  function familia(id) { return S.familias.filter(function (f) { return f.id === id; })[0]; }

  function ocupacion(a) {
    var ocupados = 0, espera = 0, famEspera = 0;
    S.familias.forEach(function (f) {
      if (f.albergue !== a.id) return;
      if (f.estado === 'alojada') ocupados += f.integrantes;
      if (f.estado === 'pendiente') { espera += f.integrantes; famEspera++; }
    });
    return { id: a.id, nombre: a.nombre, capacidad: a.capacidad, ocupados: ocupados,
      disponibles: Math.max(a.capacidad - ocupados, 0), personasEspera: espera, familiasEspera: famEspera,
      ocupacion: ocupados / a.capacidad };
  }
  function nivelOcupacion(occ) { return occ >= 1 ? 'crit' : occ >= 0.9 ? 'warn' : 'ok'; }
  var ETIQ_OCUP = { crit: 'Lleno', warn: 'Alta', ok: 'Normal' };
  function nivelDias(d) { return d === null ? 'ok' : d < 2 ? 'crit' : d < 4 ? 'warn' : 'ok'; }
  var ETIQ_DIAS = { crit: 'Crítico', warn: 'Bajo', ok: 'Suficiente' };
  function tag(lv) { return lv === 'crit' ? 't-crit' : lv === 'warn' ? 't-warn' : 't-ok'; }

  function inventario(a) {
    var o = ocupacion(a);
    return RECURSOS.map(function (r) {
      var ex = S.inventario[a.id][r.codigo] || 0, consumo = o.ocupados * r.consumo;
      return { codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, unidad: r.unidad, vital: r.vital, consumoPP: r.consumo,
        existencias: ex, consumo: consumo, dias: consumo > 0 ? Math.round((ex / consumo) * 10) / 10 : null };
    });
  }

  function alertas(a) {
    var o = ocupacion(a), lista = [];
    if (o.ocupacion >= 1) lista.push({ nivel: 'critica', titulo: 'Sobreocupación: albergue lleno',
      detalle: 'Se usan los ' + n(o.capacidad) + ' cupos. El sistema bloquea nuevas asignaciones; coordinar remisión a otro albergue.' });
    else if (o.ocupacion >= 0.9) lista.push({ nivel: 'atencion', titulo: 'Ocupación alta (' + pct(o.ocupacion) + ' %)',
      detalle: 'Quedan ' + n(o.disponibles) + ' cupos. Preparar plan de contingencia para nuevos ingresos.' });
    S.familias.forEach(function (f) {
      if (f.albergue === a.id && f.estado === 'pendiente' && f.integrantes > o.disponibles)
        lista.push({ nivel: 'critica', titulo: f.codigo + ' no cabe en el albergue',
          detalle: 'Necesita ' + f.integrantes + ' cupos y quedan ' + n(o.disponibles) + '. Requiere remisión.' });
    });
    inventario(a).forEach(function (r) {
      if (r.dias !== null && r.dias < 4) {
        var c = r.dias < 2;
        lista.push({ nivel: c ? 'critica' : 'atencion',
          titulo: (c ? 'Escasez de ' : 'Inventario bajo: ') + r.nombre.toLowerCase(),
          detalle: 'Quedan ' + ncorto(r.existencias) + ' ' + r.unidad + ', alcanza para ' + n(r.dias, 1) + ' días al consumo actual.' });
      }
    });
    S.necesidades.forEach(function (x) {
      var f = familia(x.familia);
      if (f && f.albergue === a.id && f.estado !== 'salida' && x.estado === 'pendiente' && x.prioridad === 'alta')
        lista.push({ nivel: 'atencion', titulo: 'Necesidad alta sin atender: ' + f.codigo,
          detalle: REC[x.recurso].nombre + ' · registrada el ' + fecha(x.registrada) });
    });
    lista.forEach(function (x) { x.albergue = a.nombre; x.albergueId = a.id; });
    return lista;
  }

  function siguienteCodigo(aid) {
    var max = 0;
    S.familias.forEach(function (f) {
      if (f.albergue !== aid) return;
      var m = /(\d+)$/.exec(f.codigo); if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return 'FAM-' + String(max + 1).padStart(3, '0');
  }

  /* ------------------------------------------------------------------ */
  /* Sesión y navegación                                                 */
  /* ------------------------------------------------------------------ */
  var flash = [];
  function aviso(msg, tipo) { flash.push({ msg: msg, tipo: tipo || 'ok' }); }
  function perfil() { var id = leer('dl-perfil'); return PERFILES.filter(function (p) { return p.id === id; })[0] || null; }
  function esCoord(u) { return u && u.rol === 'coordinador'; }
  function albergueActual(u) {
    if (!esCoord(u)) return albergue(u.albergue);
    var id = parseInt(leer('dl-albergue'), 10);
    return albergue(id) || albergue(u.albergue);
  }
  function bitacora(texto) { S.bitacora.unshift({ t: Date.now(), por: (perfil() || {}).id || null, texto: texto }); S.bitacora = S.bitacora.slice(0, 60); }

  function ruta() {
    var h = (location.hash || '').replace(/^#\/?/, '');
    var partes = h.split('/');
    return { seccion: partes[0] || '', extra: partes[1] || '' };
  }
  function ir(h) { if (location.hash === h) render(); else location.hash = h; }

  /* ------------------------------------------------------------------ */
  /* Iconos                                                              */
  /* ------------------------------------------------------------------ */
  var ICON = {
    bed: '<path d="M3 18V7"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    crit: '<path d="M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3Z"/><path d="M12 8v5"/><path d="M12 16v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8v.01"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    logo: '<path d="M6 4.5h5.2a7.5 7.5 0 0 1 0 15H6Z" stroke-width="2.2"/><path d="M8.6 12h2l1.3-3 2.2 6 1.3-3h1.9" stroke-width="1.9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  };
  function ic(name, s, cls) {
    s = s || 20;
    return '<svg class="ic ' + (cls || '') + '" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICON[name] || '') + '</svg>';
  }
  function iniciales(nombre) { return nombre.split(' ').slice(0, 2).map(function (x) { return x[0]; }).join('').toUpperCase(); }
  var BTN_TEMA = function () { return '<button type="button" class="theme" data-accion="tema" aria-pressed="' + (document.documentElement.dataset.theme === 'light') + '" aria-label="Cambiar entre tema oscuro y claro" title="Cambiar tema">' + ic('moon', 18, 'i-moon') + ic('sun', 18, 'i-sun') + '</button>'; };

  function htmlFlash() {
    var h = flash.map(function (f) {
      return '<div class="banner ' + (f.tipo === 'error' ? 'b-crit' : 'b-ok') + ' flash" role="status">' + ic(f.tipo === 'error' ? 'crit' : 'ok') + '<div>' + esc(f.msg) + '</div></div>';
    }).join('');
    flash = [];
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Pantalla de ingreso: perfiles precargados                           */
  /* ------------------------------------------------------------------ */
  function vistaIngreso() {
    document.title = 'Ingresar · DataLife';
    var tarjetas = PERFILES.map(function (p) {
      return '<button type="button" class="perfil" data-accion="ingresar" data-perfil="' + p.id + '">' +
        '<span class="avatar" aria-hidden="true">' + iniciales(p.nombre) + '</span>' +
        '<span class="pinfo"><b>' + esc(p.nombre) + '</b><span class="prol"><span class="tag ' + (p.rol === 'coordinador' ? 't-neu' : 't-ok') + '">' + p.rolNombre + '</span>' +
        esc(p.rol === 'coordinador' ? 'Todos los albergues' : albergue(p.albergue).nombre) + '</span><small>' + esc(p.resumen) + '</small></span>' +
        ic('arrow', 20, 'parrow') + '</button>';
    }).join('');
    app.innerHTML =
      '<div class="auth">' +
      '<aside class="auth-side"><div class="brand"><span class="mark">' + ic('logo', 24) + '</span><span><h1>Data<span>Life</span></h1></span></div>' +
      '<div class="auth-hero"><span class="kicker"><i></i>Red de albergues · sismo del 10 de agosto</span>' +
      '<h2>Que nadie se quede <em>sin un lugar seguro.</em></h2>' +
      '<p>Cupos, comida, agua y medicinas de cada albergue temporal de Cali, al día. Voluntarios y brigadistas registran en el momento y los coordinadores ven toda la red para decidir a tiempo.</p></div>' +
      '<ul class="facts"><li><span class="fi">' + ic('bed', 18) + '</span><b>Cupos al día</b><span>Quién llega, quién espera</span></li>' +
      '<li><span class="fi">' + ic('box', 18) + '</span><b>Recursos</b><span>Cuántos días alcanza</span></li>' +
      '<li><span class="fi">' + ic('alert', 18) + '</span><b>Alertas</b><span>Antes de que falte algo</span></li></ul>' +
      '<p class="auth-foot">Prototipo con datos simulados. Tus datos se tratan según la Ley 1581 de 2012.</p></aside>' +
      '<main class="auth-main" id="contenido"><div class="auth-card">' +
      '<div class="auth-top">' + BTN_TEMA() + '</div>' + htmlFlash() +
      '<h3 style="margin-top:4px">Elige un perfil</h3>' +
      '<p class="sub">Perfiles de demostración ya cargados: entra con un clic, sin clave.</p>' +
      '<div class="perfiles">' + tarjetas + '</div>' +
      '<div class="demo"><b>Prototipo.</b> Los registros que hagas se guardan solo en este navegador. ' +
      '<button type="button" class="linkbtn" data-accion="restablecer">Restablecer datos de demostración</button></div>' +
      '</div></main></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Marco con menú                                                      */
  /* ------------------------------------------------------------------ */
  var SECCIONES = [['cupos', 'bed', 'Cupos'], ['recursos', 'box', 'Recursos'], ['alertas', 'alert', 'Alertas']];

  function marco(u, seccion, contenido, nAlertas) {
    var links = SECCIONES.map(function (s) {
      var badge = s[0] === 'alertas' && nAlertas ? '<span class="badge" aria-label="' + nAlertas + ' alertas">' + nAlertas + '</span>' : '';
      return '<a class="navlink ' + (seccion === s[0] ? 'on' : '') + '" href="#/' + s[0] + '"' + (seccion === s[0] ? ' aria-current="page"' : '') + '>' + ic(s[1], 19) + s[2] + badge + '</a>';
    }).join('');
    var movil = SECCIONES.map(function (s) {
      return '<a class="' + (seccion === s[0] ? 'on' : '') + '" href="#/' + s[0] + '"' + (seccion === s[0] ? ' aria-current="page"' : '') + '>' + ic(s[1], 22) + s[2] + '</a>';
    }).join('');
    var rolTxt = u.rolNombre + ' · ' + (esCoord(u) ? 'Todos los albergues' : albergue(u.albergue).nombre);
    return '<div class="shell">' +
      '<aside class="side" aria-label="Menú"><div class="brand"><a href="#/cupos" aria-label="DataLife, inicio"><span class="mark">' + ic('logo', 22) + '</span><span><h1>Data<span>Life</span></h1></span></a></div>' +
      '<nav aria-label="Secciones"><div class="navgroup"><span class="navlbl">Albergues</span>' + links + '</div></nav>' +
      '<div class="side-foot"><div class="me"><span class="avatar" aria-hidden="true">' + iniciales(u.nombre) + '</span><span class="who"><b>' + esc(u.nombre) + '</b><span>' + esc(rolTxt) + '</span></span></div>' +
      '<div class="side-actions"><button type="button" class="btn btn-s btn-sm" style="width:100%" data-accion="salir">' + ic('out', 18) + 'Cambiar perfil</button>' + BTN_TEMA() + '</div></div></aside>' +
      '<div class="content"><header class="topbar"><div class="brand"><a href="#/cupos" aria-label="DataLife, inicio"><span class="mark">' + ic('logo', 20) + '</span><span><h1>Data<span>Life</span></h1></span></a></div>' +
      '<div class="tb-r">' + BTN_TEMA() + '<button type="button" class="btn btn-s btn-sm" data-accion="salir" aria-label="Cambiar perfil (' + esc(u.nombre) + ')">' + ic('out', 18) + 'Perfil</button></div></header>' +
      '<main class="wrap" id="contenido">' + htmlFlash() + contenido + '</main></div></div>' +
      '<nav class="bottomnav" aria-label="Secciones">' + movil + '</nav>';
  }

  function selector(u, alb, titulo, lead) {
    var control;
    if (esCoord(u)) {
      control = '<div><label class="lbl" for="selA">Albergue</label><select id="selA" class="field sm" data-accion="albergue">' +
        ALBERGUES.map(function (x) { return '<option value="' + x.id + '"' + (x.id === alb.id ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('') +
        '</select></div>';
    } else {
      control = '<div><span class="lbl">Tu albergue</span><span class="fijo">' + ic('lock', 16) + esc(alb.nombre) + '</span></div>';
    }
    return '<div class="albsel"><div><h2 class="h2">' + titulo + '</h2><p class="lead" style="margin-bottom:0">' + lead + '</p></div>' + control + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Cupos                                                               */
  /* ------------------------------------------------------------------ */
  function vistaCupos(u, alb) {
    var o = ocupacion(alb), nivel = nivelOcupacion(o.ocupacion), hoy = diaBogota(Date.now());
    var pendientes = S.familias.filter(function (f) { return f.albergue === alb.id && f.estado === 'pendiente'; })
      .sort(function (a, b) { return a.registrada - b.registrada; });
    var alojadas = S.familias.filter(function (f) { return f.albergue === alb.id && f.estado === 'alojada'; })
      .sort(function (a, b) { return a.codigo < b.codigo ? -1 : 1; });
    var entradas = 0, salidas = 0;
    S.familias.forEach(function (f) {
      if (f.albergue !== alb.id) return;
      if (f.alojada && diaBogota(f.alojada) === hoy) entradas += f.integrantes;
      if (f.salida && diaBogota(f.salida) === hoy) salidas += f.integrantes;
    });
    var ciudad = ALBERGUES.map(ocupacion).sort(function (a, b) { return b.ocupacion - a.ocupacion; });
    var remisiones = [];
    pendientes.forEach(function (f) {
      if (f.integrantes <= o.disponibles) return;
      var mejor = ciudad.filter(function (c) { return c.id !== alb.id; }).sort(function (a, b) { return b.disponibles - a.disponibles; })[0];
      if (mejor && mejor.disponibles >= f.integrantes) remisiones.push({ f: f, d: mejor });
    });
    var w = Math.max(3, Math.round(o.ocupacion * 1000) / 10);

    var h = selector(u, alb, 'Disponibilidad de cupos', 'Ocupación del albergue, familias en espera y salidas. Se actualiza con cada registro.');
    h += '<div class="kpis">' +
      '<div class="kpi"><div class="k">Cupos disponibles<span class="tag ' + tag(nivel) + '">' + ETIQ_OCUP[nivel] + '</span></div>' +
      '<div class="v num">' + n(o.disponibles) + '<small>/ ' + n(o.capacidad) + '</small></div>' +
      '<div class="meter ' + nivel + '"><i style="width:' + Math.min(w, 100) + '%"></i></div>' +
      '<div class="sub num">' + n(o.ocupados) + ' personas alojadas</div><div class="f">Capacidad − personas alojadas</div></div>' +
      '<div class="kpi"><div class="k">Tasa de ocupación</div><div class="v num">' + pct(o.ocupacion) + '<small>%</small></div>' +
      '<div class="sub">Alerta desde 90 %</div><div class="f">Cupos ocupados ÷ cupos totales</div></div>' +
      '<div class="kpi"><div class="k">En espera de cupo' + (pendientes.length ? '<span class="tag t-warn">' + pendientes.length + '</span>' : '') + '</div>' +
      '<div class="v num">' + n(o.personasEspera) + '<small>personas</small></div>' +
      '<div class="sub num">' + o.familiasEspera + (o.familiasEspera === 1 ? ' familia registrada' : ' familias registradas') + ' sin cupo</div><div class="f">Registro rápido o formulario</div></div>' +
      '<div class="kpi"><div class="k">Flujo de hoy<span class="tag t-neu">Neto ' + (entradas - salidas) + '</span></div>' +
      '<div class="flow num"><div><b>' + entradas + '</b><span>Ingresos</span></div><div style="color:var(--line2);font-size:24px">vs</div><div><b>' + salidas + '</b><span>Salidas</span></div></div>' +
      '<div class="f">Se reinicia a medianoche (hora de Colombia)</div></div></div>';

    remisiones.forEach(function (r) {
      h += '<div class="alert a-warn" style="margin-bottom:10px"><span class="ai">' + ic('arrow', 22) + '</span><div style="flex:1">' +
        '<div class="at"><span class="tag t-warn">Remisión sugerida</span>' + esc(r.f.codigo) + ' (' + r.f.integrantes + ' personas) → ' + esc(r.d.nombre) + '</div>' +
        '<p>Aquí quedan ' + n(o.disponibles) + ' cupos; ' + esc(r.d.nombre) + ' tiene ' + n(r.d.disponibles) + ' libres.</p>' +
        '<button type="button" class="btn btn-s btn-sm" style="margin-top:8px" data-accion="remitir" data-familia="' + r.f.id + '" data-destino="' + r.d.id + '">Remitir a ' + esc(r.d.nombre) + '</button></div></div>';
    });

    h += '<div class="cols" style="margin-top:8px"><div class="stack">' +
      '<form class="card" data-form="familia"><h3>Registrar familia</h3>' +
      '<p class="hint">Registro rápido: un identificador y cuántas personas llegan. Queda en espera hasta asignarle cupo.</p>' +
      '<div class="f2"><div><label class="lbl" for="fc">Identificador</label><input id="fc" name="codigo" class="field sm num" value="' + siguienteCodigo(alb.id) + '" required></div>' +
      '<div><label class="lbl" for="fn">Integrantes</label><input id="fn" name="integrantes" type="number" min="1" max="20" value="4" class="field sm num" required></div></div>' +
      '<button class="btn btn-p" style="margin-top:14px">Registrar familia</button></form>' +
      '<div class="card"><h3>Familias en espera de cupo</h3><p class="hint">El sistema bloquea la asignación si no hay cupos suficientes.</p><div class="list">' +
      (pendientes.length ? pendientes.map(function (f) {
        var no = f.integrantes > o.disponibles;
        return '<div class="row"><div class="l"><b class="num">' + esc(f.codigo) + '</b><small>' + f.integrantes + ' personas · registrada ' + fecha(f.registrada) + '</small></div>' +
          '<button type="button" class="btn btn-p btn-xs" data-accion="asignar" data-familia="' + f.id + '"' + (no ? ' disabled' : '') + '>' + (no ? 'Sin cupos' : 'Asignar cupo') + '</button></div>';
      }).join('') : '<p class="empty">No hay familias en espera.</p>') + '</div></div></div>' +
      '<div class="card"><h3>Familias alojadas <span class="count">' + alojadas.length + '</span></h3><p class="hint">Al registrar la salida, sus cupos quedan libres.</p>' +
      '<div class="list" style="max-height:520px;overflow:auto">' +
      (alojadas.length ? alojadas.map(function (f) {
        return '<div class="row"><div class="l"><b class="num">' + esc(f.codigo) + '</b><small>' + f.integrantes + ' personas · ingreso ' + fecha(f.alojada) + '</small></div>' +
          '<button type="button" class="btn btn-s btn-xs" data-accion="salida" data-familia="' + f.id + '">Registrar salida</button></div>';
      }).join('') : '<p class="empty">Aún no hay familias alojadas.</p>') + '</div></div></div>';

    h += '<div class="sec"><h3>Cupos en la ciudad</h3><small>Todos los albergues activos' + (esCoord(u) ? ' · toca uno para verlo' : '') + '</small></div><div class="shgrid">';
    ciudad.forEach(function (c) {
      var lv = nivelOcupacion(c.ocupacion), al = alertas(albergue(c.id));
      var crit = al.filter(function (x) { return x.nivel === 'critica'; }).length;
      var cw = Math.min(100, Math.max(3, Math.round(c.ocupacion * 1000) / 10));
      var tagName = esCoord(u) ? 'button type="button" data-accion="ver-albergue" data-albergue="' + c.id + '"' : 'div';
      h += '<' + tagName + ' class="card shcard"' + (c.id === alb.id ? ' style="border-color:var(--navy)"' : '') + '>' +
        '<span class="shh"><b>' + esc(c.nombre) + '</b><span class="tag ' + tag(lv) + '">Ocupación ' + ETIQ_OCUP[lv].toLowerCase() + '</span></span>' +
        '<span><span class="cap"><span class="lbl" style="margin:0">Ocupación</span><span class="big num">' + pct(c.ocupacion) + '%</span></span>' +
        '<span class="meter ' + lv + '" style="display:block"><i style="width:' + cw + '%"></i></span></span>' +
        '<span class="mini num"><span><b>' + n(c.disponibles) + '</b>cupos libres de ' + n(c.capacidad) + '</span><span><b>' + n(c.personasEspera) + '</b>personas en espera</span></span>' +
        '<span class="shalert ' + (crit ? 'c' : 'o') + '">' + ic(crit ? 'crit' : 'ok', 15) + (crit ? crit + (crit === 1 ? ' alerta crítica' : ' alertas críticas') : 'Sin alertas críticas') + '</span>' +
        '</' + (esCoord(u) ? 'button' : 'div') + '>';
    });
    h += '</div>';
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Recursos                                                            */
  /* ------------------------------------------------------------------ */
  function vistaRecursos(u, alb) {
    var o = ocupacion(alb), inv = inventario(alb);
    var vitales = inv.filter(function (r) { return r.vital && r.dias !== null; }).sort(function (a, b) { return a.dias - b.dias; });
    var peor = vitales[0] || null;
    var activas = S.familias.filter(function (f) { return f.albergue === alb.id && f.estado !== 'salida'; });
    var idsActivas = {}; activas.forEach(function (f) { idsActivas[f.id] = f; });
    var orden = { alta: 0, media: 1, baja: 2 };
    var nec = S.necesidades.filter(function (x) { return x.estado === 'pendiente' && idsActivas[x.familia]; })
      .sort(function (a, b) { return orden[a.prioridad] - orden[b.prioridad] || a.registrada - b.registrada; });
    var conPend = {}; nec.forEach(function (x) { conPend[x.familia] = 1; });
    var nConPend = Object.keys(conPend).length;
    var cobertura = activas.length ? (activas.length - nConPend) / activas.length : 1;
    var entregas = S.entregas.filter(function (e) { return e.albergue === alb.id; }).sort(function (a, b) { return b.id - a.id; }).slice(0, 12);
    var cuenta = function (p) { return nec.filter(function (x) { return x.prioridad === p; }).length; };
    var lvP = peor ? nivelDias(peor.dias) : 'ok';
    var lc = cobertura < 0.5 ? 'crit' : cobertura < 0.8 ? 'warn' : 'ok';
    var famOpts = activas.slice().sort(function (a, b) { return a.codigo < b.codigo ? -1 : 1; }).map(function (f) {
      return '<option value="' + f.id + '">' + esc(f.codigo) + ' · ' + f.integrantes + ' personas' + (f.estado === 'pendiente' ? ' · en espera' : '') + '</option>';
    }).join('');
    var recOpts = function (conUnidad) { return RECURSOS.map(function (r) { return '<option value="' + r.codigo + '">' + r.nombre + (conUnidad ? ' (' + r.unidad + ')' : '') + '</option>'; }).join(''); };

    var h = selector(u, alb, 'Recursos del albergue', 'Inventario con días restantes al consumo actual, necesidades pendientes y entregas.');
    h += '<div class="kpis k3">' +
      '<div class="kpi"><div class="k">Proyección de inventario<span class="tag ' + tag(lvP) + '">' + ETIQ_DIAS[lvP] + '</span></div>' +
      '<div class="v num">' + (peor ? n(peor.dias, 1) : '—') + '<small>días</small></div>' +
      '<div class="sub">' + (peor ? esc(peor.nombre) + ' es el recurso vital más crítico' : 'Sin consumo') + '</div>' +
      '<div class="f">Existencias ÷ (personas alojadas × consumo diario por persona)</div></div>' +
      '<div class="kpi"><div class="k">Nivel de cobertura<span class="tag ' + tag(lc) + '">' + (lc !== 'ok' ? 'Bajo' : 'Bueno') + '</span></div>' +
      '<div class="v num">' + pct(cobertura) + '<small>%</small></div>' +
      '<div class="meter ' + lc + '"><i style="width:' + Math.max(3, cobertura * 100) + '%"></i></div>' +
      '<div class="sub num">' + (activas.length - nConPend) + ' de ' + activas.length + ' familias sin necesidades pendientes</div>' +
      '<div class="f">Familias con necesidades cubiertas ÷ familias registradas</div></div>' +
      '<div class="kpi"><div class="k">Necesidades pendientes</div><div class="pcount num">' +
      '<div class="t-crit"><b>' + cuenta('alta') + '</b><span> Alta</span></div><div class="t-warn"><b>' + cuenta('media') + '</b><span> Media</span></div><div class="t-ok"><b>' + cuenta('baja') + '</b><span> Baja</span></div></div>' +
      '<div class="f">Se cubren al registrar una entrega del mismo recurso</div></div></div>';

    h += '<div class="sec"><h3>Inventario de recursos</h3><small>Consumo estimado con ' + n(o.ocupados) + ' personas alojadas</small></div>' +
      '<div class="tblwrap"><table class="dtable"><thead><tr><th>Recurso</th><th class="r">Disponible</th><th class="r">Consumo / día</th><th>Días restantes</th><th>Estado</th></tr></thead><tbody>' +
      inv.map(function (r) {
        var lv = nivelDias(r.dias), w = Math.max(3, Math.min(100, ((r.dias === null ? 14 : r.dias) / 14) * 100));
        return '<tr><td><b>' + r.nombre + '</b><small>' + r.tipo + ' · ' + n(r.consumoPP, 2) + ' ' + r.unidad + '/persona/día</small></td>' +
          '<td class="r num">' + ncorto(r.existencias) + ' ' + r.unidad + '</td><td class="r num">' + n(r.consumo, 1) + ' ' + r.unidad + '</td>' +
          '<td class="num" style="min-width:160px"><b>' + (r.dias === null ? '—' : n(r.dias, 1) + ' días') + '</b><span class="meter ' + lv + '" style="display:block;margin-top:6px"><i style="width:' + w + '%"></i></span></td>' +
          '<td><span class="tag ' + tag(lv) + '">' + ETIQ_DIAS[lv] + '</span></td></tr>';
      }).join('') + '</tbody></table></div>';

    h += '<div class="cols" style="margin-top:22px">' +
      '<form class="card" data-form="entrega"><h3>Registrar entrega</h3><p class="hint">Descuenta del inventario y deja trazabilidad: qué, cuánto, a quién y cuándo.</p><div class="stack">' +
      '<div class="f2"><div><label class="lbl" for="er">Recurso</label><select id="er" name="recurso" class="field sm">' + recOpts(true) + '</select></div>' +
      '<div><label class="lbl" for="ec">Cantidad</label><input id="ec" name="cantidad" type="number" min="1" step="any" value="10" class="field sm num" required></div></div>' +
      '<div><label class="lbl" for="ef">Familia</label><select id="ef" name="familia" class="field sm" required>' + famOpts + '</select></div>' +
      '<button class="btn btn-p">Registrar entrega</button></div></form>' +
      '<div class="stack"><form class="card" data-form="necesidad"><h3>Registrar necesidad</h3><p class="hint">Familia, tipo y prioridad.</p><div class="stack">' +
      '<div class="f2"><div><label class="lbl" for="nf">Familia</label><select id="nf" name="familia" class="field sm">' + famOpts + '</select></div>' +
      '<div><label class="lbl" for="nr">Tipo</label><select id="nr" name="recurso" class="field sm">' + recOpts(false) + '</select></div></div>' +
      '<div><span class="lbl">Prioridad</span><div class="rowf">' + Object.keys(PRIO).map(function (k) {
        return '<label class="chk"><input type="radio" name="prioridad" value="' + k + '"' + (k === 'alta' ? ' checked' : '') + '><span>' + PRIO[k][0] + '</span></label>';
      }).join('') + '</div></div><button class="btn btn-s">Registrar necesidad</button></div></form>';
    if (esCoord(u)) {
      h += '<form class="card" data-form="ingreso"><h3>Ingreso de donación o compra</h3><p class="hint">Recursos recibidos: se suman al inventario del albergue.</p>' +
        '<div class="f2"><div><label class="lbl" for="ir">Recurso</label><select id="ir" name="recurso" class="field sm">' + recOpts(false) + '</select></div>' +
        '<div><label class="lbl" for="ic">Cantidad</label><input id="ic" name="cantidad" type="number" min="1" step="any" class="field sm num" required></div></div>' +
        '<button class="btn btn-s" style="margin-top:12px">Sumar al inventario</button></form>';
    } else {
      h += '<div class="card"><h3>Ingreso de donaciones</h3><p class="hint" style="margin-bottom:0">' + ic('lock', 16) + ' Lo registra el coordinador. Si llega una donación, avísale para que quede en el inventario.</p></div>';
    }
    h += '</div></div>';

    h += '<div class="two" style="margin-top:22px"><div class="card"><h3>Necesidades pendientes</h3><p class="hint">Ordenadas por prioridad.</p><div class="list">' +
      (nec.length ? nec.map(function (x) {
        return '<div class="row"><div class="l"><b>' + REC[x.recurso].nombre + '</b><small class="num">' + esc(idsActivas[x.familia].codigo) + ' · ' + fecha(x.registrada) + '</small></div><span class="tag ' + PRIO[x.prioridad][1] + '">' + PRIO[x.prioridad][0] + '</span></div>';
      }).join('') : '<p class="empty">No hay necesidades pendientes.</p>') + '</div></div>' +
      '<div class="card"><h3>Últimas entregas</h3><p class="hint">Trazabilidad: qué se entregó, a quién y cuándo.</p><div class="list">' +
      (entregas.length ? entregas.map(function (e) {
        var f = familia(e.familia), r = REC[e.recurso];
        return '<div class="row"><div class="l"><b>' + ncorto(e.cantidad) + ' ' + r.unidad + ' · ' + r.nombre + '</b><small class="num">' + esc(f ? f.codigo : '—') + ' · ' + fecha(e.fecha, false) + '</small></div><span class="tag t-neu num">' + e.codigo + '</span></div>';
      }).join('') : '<p class="empty">Aún no hay entregas.</p>') + '</div></div></div>';
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Alertas                                                             */
  /* ------------------------------------------------------------------ */
  function vistaAlertas(u, alb, todas) {
    todas = todas && esCoord(u);
    var filas = todas ? ALBERGUES.reduce(function (acc, a) { return acc.concat(alertas(a)); }, []) : alertas(alb);
    var crit = filas.filter(function (x) { return x.nivel === 'critica'; });
    var aten = filas.filter(function (x) { return x.nivel !== 'critica'; });
    var h = selector(u, alb, 'Alertas activas', 'Sobreocupación, familias que no caben, escasez de recursos y necesidades de prioridad alta. Se recalculan con cada registro.');

    if (esCoord(u)) {
      h += '<nav class="asum" aria-label="Alertas por albergue">' + ALBERGUES.map(function (a) {
        var al = alertas(a), c = al.filter(function (x) { return x.nivel === 'critica'; }).length, w = al.length - c;
        return '<a class="' + (a.id === alb.id && !todas ? 'on' : '') + '" href="#/alertas" data-accion="ver-albergue" data-albergue="' + a.id + '">' + esc(a.nombre) +
          '<span class="cnt num">' + (c ? '<span class="c">' + c + '</span>' : '') + (w ? '<span class="w">' + w + '</span>' : '') + (!c && !w ? '<span class="o">0</span>' : '') + '</span></a>';
      }).join('') + '</nav>' +
        '<div class="segl" role="group" aria-label="Qué alertas ver"><a class="' + (!todas ? 'on' : '') + '" href="#/alertas"' + (!todas ? ' aria-current="true"' : '') + '>' + esc(alb.nombre) + '</a>' +
        '<a class="' + (todas ? 'on' : '') + '" href="#/alertas/todas"' + (todas ? ' aria-current="true"' : '') + '>Todos los albergues</a></div>';
    }

    if (filas.length) {
      h += '<div class="alist">';
      [['Críticas', crit, 'c', 'crit'], ['De atención', aten, 'w', 'alert']].forEach(function (g) {
        if (!g[1].length) return;
        h += '<h4>' + g[0] + ' <span class="tag ' + (g[2] === 'c' ? 't-crit' : 't-warn') + ' num">' + g[1].length + '</span></h4>';
        g[1].forEach(function (a) {
          h += '<div class="ai-row ' + g[2] + '"' + (g[2] === 'c' ? ' role="alert"' : '') + '><span class="dot">' + ic(g[3], 16) + '</span>' +
            '<div><b>' + esc(a.titulo) + '</b><small>' + esc(a.detalle) + '</small></div>' + (todas ? '<span class="where">' + esc(a.albergue) + '</span>' : '') + '</div>';
        });
      });
      h += '</div>';
    } else {
      h += '<div class="banner b-ok">' + ic('ok') + '<div><b>Sin alertas activas</b>Ocupación e inventario dentro de los rangos esperados.</div></div>';
    }
    h += '<p class="note" style="margin-top:18px">Reglas: ocupación ≥ 100 % crítica y ≥ 90 % atención · recurso con menos de 2 días crítico y menos de 4 días atención · familia en espera que no cabe: crítica · necesidad alta sin atender: atención.</p>';

    var reg = S.bitacora.slice(0, 8);
    h += '<div class="sec"><h3>Actividad reciente</h3><small>Quién registró qué y cuándo</small></div><div class="card"><div class="list">' +
      reg.map(function (b) {
        var p = PERFILES.filter(function (x) { return x.id === b.por; })[0];
        return '<div class="row"><div class="l"><b>' + esc(b.texto) + '</b><small class="num">' + fecha(b.t) + (p ? ' · ' + esc(p.nombre) + ' (' + p.rolNombre.toLowerCase() + ')' : ' · sistema') + '</small></div></div>';
      }).join('') + '</div></div>';
    return h;
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  function render() {
    var u = perfil(), r = ruta();
    if (!u) { if (r.seccion) { history.replaceState(null, '', location.pathname + location.search); } vistaIngreso(); return; }
    var alb = albergueActual(u), seccion = ['cupos', 'recursos', 'alertas'].indexOf(r.seccion) >= 0 ? r.seccion : 'cupos';
    var cuerpo = seccion === 'recursos' ? vistaRecursos(u, alb) : seccion === 'alertas' ? vistaAlertas(u, alb, r.extra === 'todas') : vistaCupos(u, alb);
    var titulos = { cupos: 'Cupos', recursos: 'Recursos', alertas: 'Alertas' };
    document.title = titulos[seccion] + ' · ' + alb.nombre + ' · DataLife';
    app.innerHTML = marco(u, seccion, cuerpo, alertas(alb).length);
    var m = document.getElementById('contenido');
    if (m && m.querySelector('.flash')) window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */
  var confirmarReset = 0;
  app.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-accion]');
    if (!b || b.tagName === 'SELECT') return;
    var acc = b.dataset.accion, u = perfil();
    if (acc === 'tema') {
      var t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = t; escribir('dl-tema', t);
      document.querySelectorAll('[data-accion=tema]').forEach(function (x) { x.setAttribute('aria-pressed', t === 'light'); });
      var mt = document.querySelector('meta[name=theme-color]'); if (mt) mt.content = t === 'light' ? '#F6F5F2' : '#050506';
      return;
    }
    if (acc === 'ingresar') {
      escribir('dl-perfil', b.dataset.perfil); borrar('dl-albergue');
      var p = perfil(); aviso('Ingresaste como ' + p.nombre + ' (' + p.rolNombre.toLowerCase() + ').');
      ir('#/cupos'); return;
    }
    if (acc === 'salir') { borrar('dl-perfil'); location.hash = ''; render(); return; }
    if (acc === 'restablecer') {
      if (Date.now() - confirmarReset > 4000) { confirmarReset = Date.now(); b.textContent = '¿Seguro? Toca otra vez para borrar tus cambios'; return; }
      S = DL.semilla(); guardar(); aviso('Datos de demostración restablecidos.'); render(); return;
    }
    if (!u) return;
    if (acc === 'ver-albergue') { ev.preventDefault(); if (esCoord(u)) { escribir('dl-albergue', b.dataset.albergue); if (location.hash === '#/alertas/todas') location.hash = '#/alertas'; else render(); } return; }
    var alb = albergueActual(u), f = familia(parseInt(b.dataset.familia, 10));
    if (acc === 'asignar' && f) {
      var libres = ocupacion(albergue(f.albergue)).disponibles;
      if (f.estado !== 'pendiente') aviso('La familia ya no está en espera.', 'error');
      else if (f.integrantes > libres) aviso('No hay cupos suficientes para ' + f.codigo + ': necesita ' + f.integrantes + ' y quedan ' + libres + '.', 'error');
      else { f.estado = 'alojada'; f.alojada = Date.now(); bitacora('Cupo asignado a ' + f.codigo + ' (' + f.integrantes + ' personas) en ' + alb.nombre); aviso('Cupo asignado a ' + f.codigo + '.'); }
    } else if (acc === 'salida' && f && f.estado === 'alojada') {
      f.estado = 'salida'; f.salida = Date.now(); bitacora('Salida de ' + f.codigo + ' en ' + alb.nombre);
      aviso('Salida de ' + f.codigo + ' registrada. Se liberaron ' + f.integrantes + ' cupos.');
    } else if (acc === 'remitir' && f) {
      var d = albergue(parseInt(b.dataset.destino, 10)), od = d && ocupacion(d);
      if (f.estado !== 'pendiente' || !od || od.disponibles < f.integrantes) aviso('No se pudo remitir: el albergue destino ya no tiene cupos suficientes.', 'error');
      else {
        var viejo = f.codigo, nuevo = siguienteCodigo(d.id);
        f.albergue = d.id; f.codigo = nuevo; f.registrada = Date.now();
        bitacora('Remisión de ' + viejo + ' (' + alb.nombre + ') a ' + d.nombre + ' como ' + nuevo);
        aviso(viejo + ' remitida a ' + d.nombre + ' (queda como ' + nuevo + ', en espera de cupo).');
      }
    } else return;
    guardar(); render();
  });

  app.addEventListener('change', function (ev) {
    var s = ev.target.closest('[data-accion=albergue]');
    if (!s) return;
    escribir('dl-albergue', s.value);
    if (location.hash === '#/alertas/todas') location.hash = '#/alertas'; else render();
  });

  function cantidad(v) { var x = parseFloat(String(v || '').replace(',', '.')); return isNaN(x) ? 0 : x; }

  app.addEventListener('submit', function (ev) {
    var form = ev.target.closest('form[data-form]');
    if (!form) return;
    ev.preventDefault();
    var u = perfil(); if (!u) return;
    var alb = albergueActual(u), fd = new FormData(form), tipo = form.dataset.form;
    if (tipo === 'familia') {
      var codigo = String(fd.get('codigo') || '').trim().toUpperCase(), k = parseInt(fd.get('integrantes'), 10) || 0;
      if (!codigo || k < 1 || k > 20) aviso('Escribe un identificador y entre 1 y 20 integrantes.', 'error');
      else if (S.familias.some(function (f) { return f.albergue === alb.id && f.codigo === codigo; })) aviso('El identificador ' + codigo + ' ya existe en este albergue.', 'error');
      else {
        S.familias.push({ id: ++S.seq.familia, albergue: alb.id, codigo: codigo, integrantes: k, estado: 'pendiente', registrada: Date.now(), alojada: null, salida: null });
        bitacora('Registro de ' + codigo + ' (' + k + ' integrantes) en ' + alb.nombre);
        aviso(codigo + ' registrada. Queda en espera de cupo.');
      }
    } else if (tipo === 'entrega') {
      var rec = fd.get('recurso'), cant = cantidad(fd.get('cantidad')), fam = familia(parseInt(fd.get('familia'), 10));
      var stock = S.inventario[alb.id][rec];
      if (!fam || fam.albergue !== alb.id || fam.estado === 'salida' || stock === undefined) aviso('Elige la familia y el recurso.', 'error');
      else if (cant <= 0 || cant > stock) aviso('Cantidad no válida: hay ' + ncorto(stock) + ' ' + REC[rec].unidad + ' disponibles.', 'error');
      else {
        S.inventario[alb.id][rec] = Math.round((stock - cant) * 100) / 100;
        var id = ++S.seq.entrega, cod = 'ENT-' + String(id).padStart(4, '0');
        S.entregas.push({ id: id, codigo: cod, albergue: alb.id, familia: fam.id, recurso: rec, cantidad: cant, fecha: Date.now(), por: u.id });
        var cubiertas = 0;
        S.necesidades.forEach(function (x) { if (x.familia === fam.id && x.recurso === rec && x.estado === 'pendiente') { x.estado = 'atendida'; x.atendida = Date.now(); cubiertas++; } });
        bitacora(cod + ': ' + ncorto(cant) + ' ' + REC[rec].unidad + ' de ' + REC[rec].nombre.toLowerCase() + ' a ' + fam.codigo);
        aviso(cod + ' registrada.' + (cubiertas ? ' Necesidad marcada como cubierta.' : ''));
      }
    } else if (tipo === 'necesidad') {
      var fn = familia(parseInt(fd.get('familia'), 10)), rn = fd.get('recurso'), pr = fd.get('prioridad');
      if (!fn || fn.albergue !== alb.id || !PRIO[pr] || !REC[rn]) aviso('Elige familia, tipo y prioridad.', 'error');
      else {
        S.necesidades.push({ id: ++S.seq.necesidad, familia: fn.id, recurso: rn, prioridad: pr, estado: 'pendiente', registrada: Date.now(), atendida: null });
        bitacora('Necesidad de ' + REC[rn].nombre.toLowerCase() + ' (' + PRIO[pr][0].toLowerCase() + ') para ' + fn.codigo);
        aviso('Necesidad registrada para ' + fn.codigo + '.');
      }
    } else if (tipo === 'ingreso' && esCoord(u)) {
      var ri = fd.get('recurso'), ci = cantidad(fd.get('cantidad'));
      if (ci <= 0 || !REC[ri]) aviso('Escribe una cantidad mayor que cero.', 'error');
      else {
        S.inventario[alb.id][ri] = Math.round(((S.inventario[alb.id][ri] || 0) + ci) * 100) / 100;
        bitacora('Ingreso de ' + ncorto(ci) + ' ' + REC[ri].unidad + ' de ' + REC[ri].nombre.toLowerCase() + ' en ' + alb.nombre);
        aviso('Ingreso de inventario registrado.');
      }
    } else return;
    guardar(); render();
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('storage', function (e) { if (e.key === CLAVE) { cargar(); render(); } });
  cargar();
  render();
})();
