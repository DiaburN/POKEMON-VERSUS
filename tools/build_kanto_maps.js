#!/usr/bin/env node
/* ============ build_kanto_maps.js — mapas de partida de las zonas de Kanto ============
 * Crea un mapa jugable por zona (tools/data/kanto-maps/<zona>.json) con el
 * mismo formato que guarda el editor (tools/map-editor.html), y los junta en
 * js/data/kanto-maps.js para el juego.
 *
 *   node tools/build_kanto_maps.js            # crea los que falten y empaqueta
 *   node tools/build_kanto_maps.js --force    # vuelve a generarlos todos
 *   node tools/build_kanto_maps.js --bundle   # sólo empaqueta (tras editar a mano)
 *
 * Un mapa editado a mano no se pisa (sin --force): el generador sólo da el
 * primer borrador determinista de cada zona.
 *
 * Formato:
 *   { id, zoneId, w, h, theme,
 *     rows: ["####....~~", ...]          '.' suelo, '#' pared, '~' líquido
 *     props: [{ type, tx, ty, kind? }]    tree | rock | chest | grass | spring | bigchest | trap
 *     markers: { spawn: [{tx,ty}], exits: [{tx,ty,r}], wild: [{x,y,w,h,maxAlive}],
 *                boss: [{tx,ty}], chest: [{tx,ty,big?}], safe: [{x,y,w,h}] } }
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const zonesFile = path.join(root, 'tools/data/KANTO_ZONES_V1.json');
const outDir = path.join(root, 'tools/data/kanto-maps');
const bundle = path.join(root, 'js/data/kanto-maps.js');

// Líquidos que hacen daño en su paleta (lava, veneno, descarga): poquitos.
const HARSH = new Set(['fire', 'poison', 'electric']);
const THEME = {
  grass:    { wall: 0.30, steps: 4, ponds: 4, pond: [2, 4], tree: 0.05, rock: 0.006, grass: 0.55 },
  bug:      { wall: 0.34, steps: 4, ponds: 3, pond: [2, 3], tree: 0.08, rock: 0.004, grass: 0.6 },
  normal:   { wall: 0.30, steps: 4, ponds: 5, pond: [2, 5], tree: 0.03, rock: 0.008, grass: 0.4 },
  rock:     { wall: 0.44, steps: 5, ponds: 2, pond: [1, 3], tree: 0.0, rock: 0.03, grass: 0.1 },
  ground:   { wall: 0.42, steps: 5, ponds: 2, pond: [1, 3], tree: 0.0, rock: 0.025, grass: 0.12 },
  ghost:    { wall: 0.40, steps: 5, ponds: 2, pond: [1, 3], tree: 0.01, rock: 0.015, grass: 0.15 },
  psychic:  { wall: 0.40, steps: 5, ponds: 3, pond: [1, 3], tree: 0.0, rock: 0.02, grass: 0.12 },
  poison:   { wall: 0.32, steps: 4, ponds: 4, pond: [1, 2], tree: 0.03, rock: 0.008, grass: 0.45 },
  electric: { wall: 0.40, steps: 5, ponds: 2, pond: [1, 2], tree: 0.0, rock: 0.02, grass: 0.05 },
  water:    { wall: 0.26, steps: 4, ponds: 9, pond: [3, 6], tree: 0.01, rock: 0.01, grass: 0.25 },
  ice:      { wall: 0.36, steps: 5, ponds: 6, pond: [2, 4], tree: 0.0, rock: 0.02, grass: 0.05 },
  fire:     { wall: 0.38, steps: 5, ponds: 3, pond: [1, 2], tree: 0.0, rock: 0.02, grass: 0.05 }
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function generate(zone, index) {
  const league = !zone.wild.length;
  const W = league ? 40 : 72, H = league ? 30 : 52;
  const th = THEME[zone.theme] || THEME.normal;
  const R = rng(9173 * (index + 1));
  const F = 0, X = 1, L = 2;
  const t = new Uint8Array(W * H);
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? X : t[y * W + x]);
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < W && y < H) t[y * W + x] = v; };
  const border = (x, y) => x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
  const spawn = { tx: 6, ty: H >> 1 };
  const safeR = 5;
  const inSafe = (x, y) => Math.hypot(x - spawn.tx, y - spawn.ty) <= safeR;

  // 1) Paredes: relleno al azar + autómata celular (cuevas / claros).
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t[y * W + x] = border(x, y) || (!league && R() < th.wall) ? X : F;
  for (let s = 0; s < th.steps; s++) {
    const n = t.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (border(x, y)) continue;
      let c = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if ((a || b) && at(x + a, y + b) === X) c++;
      n[y * W + x] = c >= 5 ? X : c <= 3 ? F : t[y * W + x];
    }
    t.set(n);
  }
  if (league) {
    // Arena redonda: columnas para cubrirse.
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const dx = (x - W / 2) / (W / 2 - 2), dy = (y - H / 2) / (H / 2 - 2);
      if (dx * dx + dy * dy > 1) set(x, y, X);
    }
    for (const [x, y] of [[14, 10], [26, 10], [14, 19], [26, 19]]) for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) set(x + a, y + b, X);
    spawn.tx = 8; spawn.ty = H >> 1;
  }
  // 2) Charcos.
  if (!league) {
    const n = th.ponds;
    for (let i = 0; i < n; i++) {
      const cx = 16 + Math.floor(R() * (W - 22)), cy = 4 + Math.floor(R() * (H - 8));
      const r = th.pond[0] + R() * (th.pond[1] - th.pond[0]);
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (!border(x, y) && Math.hypot(x - cx, (y - cy) * 1.2) <= r + (R() - 0.5) * 0.8) set(x, y, L);
      }
    }
  }
  // 3) Claro de entrada (seguro) y un pasillo hacia el este para que el mapa no quede partido.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!border(x, y) && Math.hypot(x - spawn.tx, y - spawn.ty) <= safeR + 1) set(x, y, F);
  let cy = spawn.ty;
  for (let x = spawn.tx; x < W - 4; x++) {
    if (R() < 0.3) cy = Math.max(4, Math.min(H - 5, cy + (R() < 0.5 ? -1 : 1)));
    for (let b = -1; b <= 1; b++) if (at(x, cy + b) === X && !border(x, cy + b)) set(x, cy + b, F);
  }
  // 4) Lo que no se alcanza desde la entrada (con líquidos dañinos como pared) se vuelve pared.
  const harsh = HARSH.has(zone.theme);
  const reach = new Uint8Array(W * H);
  const q = [spawn.tx + spawn.ty * W]; reach[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i / W) | 0;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + a, ny = y + b, v = at(nx, ny), j = nx + ny * W;
      if (v === X || reach[j] || (harsh && v === L)) continue;
      reach[j] = 1; q.push(j);
    }
  }
  for (let i = 0; i < W * H; i++) if (!reach[i] && t[i] === F) t[i] = X;
  const floor = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === F && reach[x + y * W]) floor.push([x, y]);
  const open = (x, y, r) => { for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) if (at(x + a, y + b) !== F) return false; return true; };
  const pickFloor = (test, tries = 400) => { for (let i = 0; i < tries; i++) { const p = floor[Math.floor(R() * floor.length)]; if (test(p[0], p[1])) return p; } return null; };

  // 5) Marcadores.
  const markers = { spawn: [spawn], exits: [{ tx: 3, ty: spawn.ty, r: 1.5 }], wild: [], boss: [], chest: [],
                    safe: [{ x: spawn.tx - safeR, y: spawn.ty - safeR, w: safeR * 2 + 1, h: safeR * 2 + 1 }] };
  for (let b = -1; b <= 1; b++) for (let a = 2; a <= 4; a++) set(a, spawn.ty + b, F);
  if (!league) {
    const cols = 4, x0 = 13, span = W - 2 - x0;
    const total = Math.max(6, Math.min(12, Math.round(zone.wild.length * 1.3) + 4));
    for (let c = 0; c < cols; c++) {
      markers.wild.push({ x: x0 + Math.floor(span * c / cols), y: 2, w: Math.floor(span / cols), h: H - 4, maxAlive: Math.ceil(total / cols) });
    }
    const far = pickFloor((x, y) => x > W - 16 && open(x, y, 2), 4000) || floor[floor.length - 1];
    markers.boss.push({ tx: far[0], ty: far[1] });
    for (let i = 0; i < 7; i++) {
      const p = pickFloor((x, y) => !inSafe(x, y) && x > 12 && open(x, y, 1) && !markers.chest.some(c => Math.hypot(c.tx - x, c.ty - y) < 8));
      if (p) markers.chest.push({ tx: p[0], ty: p[1], big: i === 0 });
    }
  } else markers.boss.push({ tx: W - 10, ty: H >> 1 });

  // 6) Objetos fijos (los cofres salen al entrar, en los marcadores de cofre).
  const props = [];
  const used = new Set();
  const markerTile = (x, y) => markers.chest.some(c => c.tx === x && c.ty === y) || markers.boss.some(c => Math.hypot(c.tx - x, c.ty - y) < 3);
  for (const [x, y] of floor) {
    if (inSafe(x, y) || markerTile(x, y) || x <= 4) continue;
    const r = R();
    // Sólidos sólo en zonas abiertas (5×5 de suelo) y separados: nunca cierran un pasillo.
    if (r < th.tree + th.rock && open(x, y, 2) && ![...used].some(k => { const [a, b] = k.split(',').map(Number); return Math.abs(a - x) < 3 && Math.abs(b - y) < 3; })) {
      props.push({ type: r < th.tree ? 'tree' : 'rock', tx: x, ty: y });
      used.add(x + ',' + y);
    }
  }
  // Hierba alta en manchas.
  const seeds = Array.from({ length: 10 }, () => pickFloor((x, y) => !inSafe(x, y))).filter(Boolean);
  for (const [sx, sy] of seeds) {
    const r = 2 + R() * 3;
    for (let y = Math.floor(sy - r); y <= sy + r; y++) for (let x = Math.floor(sx - r); x <= sx + r; x++) {
      if (at(x, y) !== F || inSafe(x, y) || used.has(x + ',' + y) || markerTile(x, y)) continue;
      if (Math.hypot(x - sx, y - sy) <= r && R() < th.grass + 0.25) { props.push({ type: 'grass', tx: x, ty: y }); used.add(x + ',' + y); }
    }
  }
  if (!league) {
    const sp = pickFloor((x, y) => x > W / 2 && open(x, y, 1) && !used.has(x + ',' + y) && !markerTile(x, y));
    if (sp) props.push({ type: 'spring', tx: sp[0], ty: sp[1] });
  }

  const C = ['.', '#', '~'];
  const rows = [];
  for (let y = 0; y < H; y++) { let s = ''; for (let x = 0; x < W; x++) s += C[at(x, y)]; rows.push(s); }
  return { id: zone.id, zoneId: zone.id, w: W, h: H, theme: zone.theme, rows, props, markers };
}

function main() {
  const force = process.argv.includes('--force'), only = process.argv.includes('--bundle');
  const seed = JSON.parse(fs.readFileSync(zonesFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const maps = {};
  seed.zones.forEach((z, i) => {
    const f = path.join(outDir, z.id + '.json');
    if (!only && (force || !fs.existsSync(f))) fs.writeFileSync(f, JSON.stringify(generate(z, i)) + '\n');
    if (fs.existsSync(f)) maps[z.id] = JSON.parse(fs.readFileSync(f, 'utf8'));
  });
  const head = '/* Generado por tools/build_kanto_maps.js (mapas en tools/data/kanto-maps/, editables con tools/map-editor.html). No editar a mano. */\n';
  fs.writeFileSync(bundle, head + 'G.KANTO_MAPS = ' + JSON.stringify(maps) + ';\n');
  console.log(Object.keys(maps).length + ' mapas -> ' + path.relative(root, bundle));
}

if (require.main === module) main();
module.exports = { generate };
