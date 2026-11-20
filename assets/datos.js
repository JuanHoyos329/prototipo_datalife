/* DataLife · datos simulados precargados (no hay base de datos).
   Se generan al primer ingreso, relativos a la fecha actual, y se guardan
   en el navegador. "Restablecer datos" vuelve a este punto de partida. */
(function () {
  'use strict';

  var RECURSOS = [
    { codigo: 'agua', nombre: 'Agua potable', tipo: 'Vital', unidad: 'L', consumo: 3, vital: true },
    { codigo: 'alimentos', nombre: 'Raciones de alimento', tipo: 'Vital', unidad: 'raciones', consumo: 3, vital: true },
    { codigo: 'medicamentos', nombre: 'Kits de medicamentos', tipo: 'Vital', unidad: 'kits', consumo: 0.1, vital: true },
    { codigo: 'cobijas', nombre: 'Cobijas', tipo: 'Abrigo', unidad: 'unid.', consumo: 0.05, vital: false },
    { codigo: 'higiene', nombre: 'Kits de higiene', tipo: 'Complementario', unidad: 'kits', consumo: 0.2, vital: false }
  ];

  var ALBERGUES = [
    { id: 1, nombre: 'Albergue Piloto 01', direccion: 'Cali · Comuna 20', capacidad: 120,
      stock: { agua: 540, alimentos: 1050, medicamentos: 85, cobijas: 60, higiene: 140 } },
    { id: 2, nombre: 'Coliseo El Pueblo', direccion: 'Cali · Cra. 50 con Calle 9', capacidad: 200,
      stock: { agua: 1265, alimentos: 2450, medicamentos: 110, cobijas: 70, higiene: 165 } },
    { id: 3, nombre: 'Colegio Santa Librada', direccion: 'Cali · Calle 7 # 14-00', capacidad: 80,
      stock: { agua: 328, alimentos: 702, medicamentos: 40, cobijas: 30, higiene: 60 } }
  ];

  /* Perfiles de usuario del sistema (no son los cargos del equipo que lo desarrolla). */
  var PERFILES = [
    { id: 'coordinador', nombre: 'Jorge Iván Restrepo', rol: 'coordinador', rolNombre: 'Coordinador', albergue: 1,
      resumen: 'Ve toda la red de albergues, controla alertas y registra ingresos de recursos.' },
    { id: 'voluntario-piloto', nombre: 'Valentina Cárdenas', rol: 'voluntario', rolNombre: 'Voluntario', albergue: 1,
      resumen: 'Registra familias, cupos, necesidades y entregas en el Albergue Piloto 01.' },
    { id: 'voluntario-coliseo', nombre: 'Carlos Andrés Ríos', rol: 'voluntario', rolNombre: 'Voluntario', albergue: 2,
      resumen: 'Registra familias, cupos, necesidades y entregas en el Coliseo El Pueblo.' },
    { id: 'voluntario-librada', nombre: 'Mariana Ospina', rol: 'voluntario', rolNombre: 'Voluntario', albergue: 3,
      resumen: 'Registra familias, cupos, necesidades y entregas en el Colegio Santa Librada.' }
  ];

  var H = 3600 * 1000, D = 24 * H;

  function semilla() {
    var ahora = Date.now();
    var familias = [], necesidades = [], entregas = [], seq = { familia: 0, necesidad: 0, entrega: 0 };

    function crearFamilias(aid, alojadas, pendientes, dias) {
      var todas = alojadas.concat(pendientes), ids = [];
      todas.forEach(function (n, i) {
        var aloj = i < alojadas.length;
        var t = ahora - (dias - Math.floor((i * dias) / Math.max(todas.length, 1))) * D - (i % 7) * H;
        var id = ++seq.familia;
        familias.push({ id: id, albergue: aid, codigo: 'FAM-' + String(i + 1).padStart(3, '0'), integrantes: n,
          estado: aloj ? 'alojada' : 'pendiente', registrada: t, alojada: aloj ? t + 40 * 60 * 1000 : null, salida: null });
        ids.push(id);
      });
      return ids;
    }
    function necesidad(fid, recurso, prioridad, estado, t) {
      necesidades.push({ id: ++seq.necesidad, familia: fid, recurso: recurso, prioridad: prioridad,
        estado: estado || 'pendiente', registrada: t, atendida: estado === 'atendida' ? t + 2 * H : null });
    }

    // Albergue Piloto 01: 96 personas de 120 (14 familias alojadas, FAM-015 en espera)
    var p = crearFamilias(1, [6, 8, 5, 7, 9, 4, 8, 6, 7, 5, 10, 6, 8, 7], [6], 4);
    [[1, 'medicamentos', 'alta', 'pendiente'], [4, 'agua', 'alta', 'pendiente'], [10, 'alimentos', 'alta', 'pendiente'],
     [8, 'cobijas', 'media', 'pendiente'], [14, 'medicamentos', 'media', 'pendiente'], [12, 'higiene', 'baja', 'pendiente'],
     [0, 'agua', 'media', 'atendida'], [3, 'cobijas', 'baja', 'atendida'], [6, 'alimentos', 'alta', 'atendida']
    ].forEach(function (x, i) { necesidad(p[x[0]], x[1], x[2], x[3], ahora - (5 + i * 3) * H); });
    [[6, 'alimentos', 24, 1], [3, 'cobijas', 4, 1], [0, 'agua', 30, 0], [11, 'higiene', 2, 0]].forEach(function (x, i) {
      var id = ++seq.entrega;
      entregas.push({ id: id, codigo: 'ENT-' + String(id).padStart(4, '0'), albergue: 1, familia: p[x[0]], recurso: x[1],
        cantidad: x[2], fecha: ahora - x[3] * D - (3 - i) * H, por: 'voluntario-piloto' });
    });

    // Coliseo El Pueblo: 136 personas de 200
    var col = [5, 4, 6, 3, 5, 7, 4, 5, 6, 4, 3, 5, 6, 4, 5, 7, 4, 3, 5, 6, 4, 5, 3, 4, 6, 5, 3];
    col.push(136 - col.reduce(function (a, b) { return a + b; }, 0));
    var cf = crearFamilias(2, col, [], 3);
    [[2, 'medicamentos', 'alta'], [9, 'cobijas', 'media'], [16, 'higiene', 'media'], [20, 'alimentos', 'alta'], [24, 'agua', 'baja']]
      .forEach(function (x, i) { necesidad(cf[x[0]], x[1], x[2], 'pendiente', ahora - (2 + i * 2) * H); });

    // Colegio Santa Librada: 78 de 80 y una familia de 7 que no cabe
    var sl = [6, 5, 7, 4, 6, 5, 8, 4, 6, 5, 7, 5, 4, 6];
    sl[sl.length - 1] += 78 - sl.reduce(function (a, b) { return a + b; }, 0);
    var sf = crearFamilias(3, sl, [7], 2);
    [[1, 'agua', 'alta'], [5, 'medicamentos', 'alta'], [8, 'alimentos', 'alta'], [11, 'cobijas', 'media']]
      .forEach(function (x, i) { necesidad(sf[x[0]], x[1], x[2], 'pendiente', ahora - (3 + i * 2) * H); });

    var inventario = {};
    ALBERGUES.forEach(function (a) { inventario[a.id] = Object.assign({}, a.stock); });

    return { version: 2, creado: ahora, familias: familias, necesidades: necesidades, entregas: entregas,
      inventario: inventario, seq: seq, bitacora: [{ t: ahora, por: null, texto: 'Datos de demostración cargados' }] };
  }

  window.DATALIFE = {
    RECURSOS: RECURSOS,
    ALBERGUES: ALBERGUES.map(function (a) { return { id: a.id, nombre: a.nombre, direccion: a.direccion, capacidad: a.capacidad }; }),
    PERFILES: PERFILES,
    semilla: semilla
  };
})();
