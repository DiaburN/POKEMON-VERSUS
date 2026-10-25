/* ============ map-editor.js — editor de mapas de zona (modo Kanto) ============
 * Abre tools/map-editor.html con un servidor local (python -m http.server) y
 * edita el mapa de una zona con los mismos tiles del juego (G.Tiles).
 *
 * Guarda sólo datos semánticos (nunca imágenes):
 *   rows    terreno por letras: '.' suelo, '#' pared, '~' líquido
 *   props   objetos: tree, rock, chest, grass, spring, bigchest, trap
 *   markers spawn, exits, wild (zonas de salvajes), boss, chest (cofres al entrar), safe
 * Es el mismo formato que lee el juego (G.World.loadMap, js/kanto/zones.js).
 */
(() => {
  const $ = id => document.getElementById(id);
  const T = G.Tiles.T;                 // px de arte por tile
  const N = 16;                        // tiles por trozo pintado
  const KIND = { '.': 'floor', '#': 'wall', '~': 'liquid' };
  const PROPS = ['tree', 'rock', 'chest', 'grass', 'spring', 'bigchest', 'trap'];
  const TOOLS = [
    ['floor', 'Suelo'], ['wall', 'Pared'], ['liquid', 'Líquido'],
    ...PROPS.map(p => ['prop:' + p, { tree: 'Árbol', rock: 'Roca', chest: 'Cofre', grass: 'Hierba', spring: 'Manantial', bigchest: 'Cofre grande', trap: 'Trampa' }[p]]),
    ['spawn', 'Entrada'], ['exit', 'Salida'], ['wild', 'Zona salvajes'], ['boss', 'Jefe'], ['chestm', 'Cofre (marca)'], ['safe', 'Zona segura'],
    ['erase', 'Goma']
  ];
  const TILE_OF = { floor: '.', wall: '#', liquid: '~' };
  const cv = $('cv'), ctx = cv.getContext('2d');

  let map = null, grid = null;         // grid: array de filas (arrays de letras)
  let tool = 'floor', zoom = 1, camX = 0, camY = 0;
  let chunks = new Map();              // "cx,cy" -> canvas
  const undo = [], redo = [];
  let drag = null, panning = false, spaceDown = false, last = null, hover = null;

  // ---------------- datos ----------------

  function blankMap(w, h, theme) {
    const rows = [];
    for (let y = 0; y < h; y++) {
      let s = '';
      for (let x = 0; x < w; x++) s += x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ? '#' : '.';
      rows.push(s);
    }
    const sy = h >> 1;
    return { id: 'nuevo', zoneId: '', w, h, theme, rows, props: [],
             markers: { spawn: [{ tx: 6, ty: sy }], exits: [{ tx: 3, ty: sy, r: 1.5 }], wild: [], boss: [], chest: [], safe: [{ x: 1, y: sy - 5, w: 11, h: 11 }] } };
  }

  function setMap(m) {
    map = JSON.parse(JSON.stringify(m));
    map.props = map.props || [];
    map.markers = Object.assign({ spawn: [], exits: [], wild: [], boss: [], chest: [], safe: [] }, map.markers || {});
    grid = map.rows.map(r => r.split(''));
    $('w').value = map.w; $('h').value = map.h; $('theme').value = map.theme;
    chunks.clear();
    zoom = Math.min(cv.clientWidth / (map.w * T), cv.clientHeight / (map.h * T)) || 1;
    camX = 0; camY = 0;
    undo.length = 0; redo.length = 0;
    draw();
  }

  function snapshot() { return JSON.stringify({ rows: grid.map(r => r.join('')), props: map.props, markers: map.markers }); }
  function restore(s) {
    const o = JSON.parse(s);
    grid = o.rows.map(r => r.split('')); map.props = o.props; map.markers = o.markers;
    chunks.clear(); draw();
  }
  function push() { undo.push(snapshot()); if (undo.length > 80) undo.shift(); redo.length = 0; }

  function exportMap() {
    map.rows = grid.map(r => r.join(''));
    map.theme = $('theme').value;
    return map;
  }

  // ---------------- pintar el terreno con los tiles del juego ----------------

  const biome = () => G.Tiles.arenaBiome($('theme').value);
  const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h ? 'wall' : KIND[grid[ty][tx]] || 'wall');
  const flat = () => 0.5;

  function chunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = chunks.get(k);
    if (!c) { c = G.Tiles.paintChunk(cx, cy, N, at, flat, biome(), 7); chunks.set(k, c); }
    return c;
  }
  /** Olvida los trozos que tocan esa casilla (el autotile mira a los vecinos). */
  function dirty(tx, ty) {
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) chunks.delete(Math.floor((tx + a) / N) + ',' + Math.floor((ty + b) / N));
  }

  function draw() {
    const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, W, H);
    if (!map) return;
    const s = zoom, px = T * s;
    ctx.save();
    ctx.translate(-camX, -camY);
    for (let cy = 0; cy * N < map.h; cy++) for (let cx = 0; cx * N < map.w; cx++) {
      const x = cx * N * px, y = cy * N * px;
      if (x > camX + W || y > camY + H || x + N * px < camX || y + N * px < camY) continue;
      ctx.drawImage(chunk(cx, cy), x, y, N * px + 1, N * px + 1);
    }
    // Objetos, por Y.
    const bi = biome();
    for (const p of map.props.slice().sort((a, b) => a.ty - b.ty)) {
      const img = G.Tiles.propSprite(bi, p.type, 0);
      const w = img.width * s, h = img.height * s;
      const fx = (p.tx + 0.5) * px, fy = (p.ty + 1) * px;
      ctx.drawImage(img, fx - w / 2, p.type === 'spring' || p.type === 'trap' ? fy - px / 2 - h / 2 : fy - h, w, h);
    }
    // Marcadores.
    const mk = map.markers;
    const rect = (r, col, label) => {
      ctx.fillStyle = col + '33'; ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.fillRect(r.x * px, r.y * px, r.w * px, r.h * px); ctx.strokeRect(r.x * px, r.y * px, r.w * px, r.h * px);
      tag(label, r.x * px + 4, r.y * px + 14, col);
    };
    const dot = (p, col, label) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc((p.tx + 0.5) * px, (p.ty + 0.5) * px, Math.max(4, px * 0.35), 0, 6.28); ctx.fill();
      tag(label, (p.tx + 0.5) * px + 8, (p.ty + 0.5) * px - 6, col);
    };
    mk.safe.forEach(r => rect(r, '#5fe08a', 'segura'));
    mk.wild.forEach((r, i) => rect(r, '#ff9a3d', 'salvajes ' + (i + 1) + ' · máx ' + (r.maxAlive || 7)));
    mk.spawn.forEach(p => dot(p, '#4fd1ff', 'entrada'));
    mk.exits.forEach(p => { ctx.strokeStyle = '#d6f6ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc((p.tx + 0.5) * px, (p.ty + 0.5) * px, (p.r || 1.5) * px, 0, 6.28); ctx.stroke(); dot(p, '#d6f6ff', 'salida'); });
    mk.boss.forEach(p => dot(p, '#ff5f6d', 'jefe'));
    mk.chest.forEach(p => dot(p, '#ffd23f', p.big ? 'cofre grande' : 'cofre'));
    if (drag && drag.rect) rect(norm(drag.rect), '#ffffff', '');
    if (hover) {
      const r = brushR();
      ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
      ctx.strokeRect((hover.tx - r) * px, (hover.ty - r) * px, (2 * r + 1) * px, (2 * r + 1) * px);
    }
    ctx.restore();
    $('status').textContent = (hover ? hover.tx + ', ' + hover.ty + ' · ' : '') + map.w + '×' + map.h + ' · zoom ' + zoom.toFixed(2) + ' · ' + map.props.length + ' objetos';
  }
  function tag(t, x, y, col) {
    ctx.font = '700 12px system-ui'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(t, x, y);
    ctx.fillStyle = col; ctx.fillText(t, x, y);
  }

  // ---------------- herramientas ----------------

  const brushR = () => ((+$('brush').value) - 1) >> 1;
  function tileAt(e) {
    const r = cv.getBoundingClientRect(), px = T * zoom;
    return { tx: Math.floor((e.clientX - r.left + camX) / px), ty: Math.floor((e.clientY - r.top + camY) / px) };
  }
  const inside = (tx, ty) => tx >= 0 && ty >= 0 && tx < map.w && ty < map.h;
  const norm = r => ({ x: Math.min(r.x0, r.x1), y: Math.min(r.y0, r.y1), w: Math.abs(r.x1 - r.x0) + 1, h: Math.abs(r.y1 - r.y0) + 1 });
  const near = (list, tx, ty) => list.findIndex(p => p.tx === tx && p.ty === ty);

  function apply(tx, ty) {
    if (!inside(tx, ty)) return;
    const r = brushR();
    if (TILE_OF[tool]) {
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (!inside(x, y) || grid[y][x] === TILE_OF[tool]) continue;
        grid[y][x] = TILE_OF[tool];
        if (tool !== 'floor') map.props = map.props.filter(p => !(p.tx === x && p.ty === y));
        dirty(x, y);
      }
      return;
    }
    if (tool.startsWith('prop:')) {
      const type = tool.slice(5);
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        if (!inside(x, y) || grid[y][x] !== '.' || map.props.some(p => p.tx === x && p.ty === y)) continue;
        map.props.push({ type, tx: x, ty: y });
      }
      return;
    }
    if (tool === 'erase') {
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        map.props = map.props.filter(p => !(p.tx === x && p.ty === y));
        for (const k of ['spawn', 'exits', 'boss', 'chest']) map.markers[k] = map.markers[k].filter(p => !(p.tx === x && p.ty === y));
        for (const k of ['wild', 'safe']) map.markers[k] = map.markers[k].filter(q => !(x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.h));
      }
    }
  }

  function point(tx, ty) {
    const mk = map.markers;
    if (tool === 'spawn') mk.spawn = [{ tx, ty }];
    else if (tool === 'exit') { if (near(mk.exits, tx, ty) < 0) mk.exits.push({ tx, ty, r: 1.5 }); }
    else if (tool === 'boss') { if (near(mk.boss, tx, ty) < 0) mk.boss.push({ tx, ty }); }
    else if (tool === 'chestm') {
      const i = near(mk.chest, tx, ty);
      if (i < 0) mk.chest.push({ tx, ty, big: false });
      else if (!mk.chest[i].big) mk.chest[i].big = true;       // segundo clic: con candado
      else mk.chest.splice(i, 1);
    }
  }

  // ---------------- ratón y teclado ----------------

  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    if (!map) return;
    cv.setPointerCapture(e.pointerId);
    last = { x: e.clientX, y: e.clientY };
    if (e.button === 2 || e.button === 1 || spaceDown) { panning = true; return; }
    const { tx, ty } = tileAt(e);
    push();
    if (tool === 'wild' || tool === 'safe') { drag = { rect: { x0: tx, y0: ty, x1: tx, y1: ty } }; return; }
    if (['spawn', 'exit', 'boss', 'chestm'].includes(tool)) { if (inside(tx, ty)) point(tx, ty); draw(); return; }
    drag = { paint: true };
    apply(tx, ty); draw();
  });
  cv.addEventListener('pointermove', e => {
    if (!map) return;
    hover = tileAt(e);
    if (panning) { camX -= e.clientX - last.x; camY -= e.clientY - last.y; last = { x: e.clientX, y: e.clientY }; }
    else if (drag && drag.rect) { drag.rect.x1 = G.U.clamp(hover.tx, 0, map.w - 1); drag.rect.y1 = G.U.clamp(hover.ty, 0, map.h - 1); }
    else if (drag && drag.paint) apply(hover.tx, hover.ty);
    draw();
  });
  cv.addEventListener('pointerup', () => {
    if (drag && drag.rect) {
      const r = norm(drag.rect);
      if (tool === 'wild') map.markers.wild.push(Object.assign(r, { maxAlive: 3 }));
      else map.markers.safe.push(r);
    }
    drag = null; panning = false; draw();
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = e.deltaY < 0 ? 1.15 : 1 / 1.15, z = G.U.clamp(zoom * k, 0.15, 6);
    camX = (camX + mx) * z / zoom - mx; camY = (camY + my) * z / zoom - my; zoom = z;
    draw();
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.code === 'Space') { spaceDown = true; e.preventDefault(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); doRedo(); }
  });
  addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });
  addEventListener('resize', draw);

  function doUndo() { if (undo.length) { redo.push(snapshot()); restore(undo.pop()); } }
  function doRedo() { if (redo.length) { undo.push(snapshot()); restore(redo.pop()); } }

  // ---------------- panel ----------------

  function validate() {
    const m = exportMap();
    const errs = G.KZones.validateMap(m);
    const seed = G.KANTO_ZONES_SEED.zones.find(z => z.id === m.zoneId);
    if (seed) for (const e of G.KZones.validate(G.KZones.build(seed, m))) if (!errs.includes(e)) errs.push(e);
    $('errors').innerHTML = errs.length ? errs.map(e => `<li>${e.replace(/[<>&]/g, '')}</li>`).join('') : '<li class="ok">Mapa válido ✔</li>';
    return errs;
  }

  function init() {
    for (const [id, label] of TOOLS) {
      const b = document.createElement('button');
      b.textContent = label; b.dataset.tool = id;
      b.onclick = () => { tool = id; document.querySelectorAll('#tools button').forEach(x => x.classList.toggle('on', x === b)); };
      $('tools').appendChild(b);
    }
    $('tools').firstChild.classList.add('on');
    $('theme').innerHTML = G.KZones.THEMES.map(t => `<option>${t}</option>`).join('');
    $('zone').innerHTML = G.KANTO_ZONES_SEED.zones.map(z => `<option value="${z.id}">${z.name}</option>`).join('');
    $('theme').onchange = () => { if (map) { map.theme = $('theme').value; chunks.clear(); draw(); } };
    $('brush').oninput = () => { $('brush-n').textContent = $('brush').value; };
    $('b-load-zone').onclick = () => {
      const m = (G.KANTO_MAPS || {})[$('zone').value];
      const seed = G.KANTO_ZONES_SEED.zones.find(z => z.id === $('zone').value);
      setMap(m || Object.assign(blankMap(72, 52, seed.theme), { id: seed.id, zoneId: seed.id }));
    };
    $('b-new').onclick = () => {
      const seed = G.KANTO_ZONES_SEED.zones.find(z => z.id === $('zone').value);
      setMap(Object.assign(blankMap(G.U.clamp(+$('w').value, 16, 400), G.U.clamp(+$('h').value, 16, 400), $('theme').value), { id: seed.id, zoneId: seed.id }));
    };
    $('b-undo').onclick = doUndo; $('b-redo').onclick = doRedo;
    $('b-validate').onclick = validate;
    $('b-export').onclick = () => {
      validate();
      const blob = new Blob([JSON.stringify(exportMap()) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (map.zoneId || map.id || 'mapa') + '.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('f-import').onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      try { setMap(JSON.parse(await f.text())); validate(); }
      catch (err) { $('errors').innerHTML = '<li>No es un mapa válido: ' + String(err.message).replace(/[<>&]/g, '') + '</li>'; }
      e.target.value = '';
    };
    $('b-load-zone').click();
  }

  init();
  // (Para las pruebas en el navegador.)
  G.MapEditor = { get map() { return exportMap(); }, setMap, validate, setTool(t) { tool = t; } };
})();
