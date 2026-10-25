/* ============ worldgen.js — el mundo abierto de Kanto, generado de los datos ============
 * Convierte G.KANTO_WORLD (js/data/kanto-world.js) en un único mundo continuo
 * que avanza hacia el norte (y negativa) y se lo da a G.World (setGen):
 * terreno y objetos se calculan por casilla cuando hace falta (por chunks),
 * así el mundo puede medir lo que haga falta sin un mapa enorme en disco.
 *
 * Cada tramo (zona):
 *   - largo = minutos × velocidad de referencia a su nivel ÷ 32 px ÷ sinuosidad
 *     (la sinuosidad se mide sobre el camino generado: el tiempo es el de
 *     andar por él, no en línea recta)
 *   - un camino central que tuerce; claros de combate a lo largo; el ancho
 *     del tramo pasa al del siguiente poco a poco (transition.width)
 *   - al empezar, un checkpoint: claro seguro con un manantial
 *   - el estilo (styles) decide cómo se tallan los mismos tiles: cinturón de
 *     árboles, paredes de roca, agua con islas, bloques de ruinas...
 *
 * Determinista: el mismo mundo para todos y en cada partida (SEED).
 * Coordenadas en tiles; el sur del primer tramo está en ty = 0.
 */
G.KWorld = (() => {
  const D = () => G.KANTO_WORLD;
  const SEED = 1996;
  const F = 0, X = 1, L = 2, BELT = 3;
  const BUCKET = 16;                            // tiles por cubo de búsqueda (claros por altura)
  const HARSH = new Set(['lava', 'poison', 'spark']);
  // Tiles del tema que pinta el objeto "tree" (G.Tiles: tree / crystal / dead).
  let w = null;                                 // el mundo construido

  const hash = (x, y, s) => G.U.hash(x, y, SEED + s);
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }

  // ---------------- escala ----------------

  /** px/s de un Pokémon de Velocidad base refBaseSpeed a ese nivel (la fórmula del juego). */
  function refSpeed(level) {
    const stat = G.KMon.calcStat('speed', D().refBaseSpeed, Math.max(1, Math.round(level)), G.KCFG.IV_DEFAULT, 0);
    return G.KMon.pokemonSpeedToWorldSpeed(stat);
  }
  const minutesOf = z => z.minutes || D().minutes[z.size];
  const widthOf = z => z.width || D().width[z.size];

  // ---------------- construcción ----------------

  /**
   * Camino de un tramo: puntos de control de sur a norte que tuercen a un lado
   * y a otro. Devuelve los puntos (x relativa al centro del mundo) y su sinuosidad.
   */
  function spineOf(z, i, len) {
    const st = D().styles[z.style], R = rng(7919 * (i + 1));
    const half = widthOf(z) / 2, amp = st.bend * widthOf(z) * ((z.features || {}).lanes ? 0.5 : 1);
    const n = Math.max(1, Math.round(len / st.every));
    const pts = [];
    let side = R() < 0.5 ? -1 : 1;
    for (let k = 1; k <= n; k++) {
      let x = 0;
      if (k < n) { x = side * (0.4 + R() * 0.6) * amp; if (R() < 0.75) side = -side; }
      else x = (R() - 0.5) * 0.08 * widthOf(z);
      pts.push({ dy: len * k / n, x: G.U.clamp(x, -half + 8, half - 8) });
    }
    // Sinuosidad: largo del camino ÷ largo en línea recta.
    let path = 0, px = 0, py = 0;
    for (const p of pts) {
      const steps = Math.max(8, Math.ceil(p.dy - py)), ease = k => (1 - Math.cos(k * Math.PI)) / 2;
      for (let s = 1; s <= steps; s++) path += Math.hypot((p.x - px) * (ease(s / steps) - ease((s - 1) / steps)), (p.dy - py) / steps);
      px = p.x; py = p.dy;
    }
    return { pts, winding: path / len };
  }

  function build(opts = {}) {
    const cfg = D(), W = cfg.worldWidth, mid = W / 2;
    const zones = [];
    let y = 0;
    cfg.zones.forEach((z, i) => {
      const lvl = (z.level[0] + z.level[1]) / 2;
      const speed = refSpeed(lvl);
      const pathTiles = minutesOf(z) * 60 * speed / G.World.TS;
      // El largo hacia el norte se ajusta hasta que el camino (con sus curvas) mida lo que toca.
      let len = Math.round(pathTiles / 1.1), sp = null;
      for (let it = 0; it < 4; it++) { sp = spineOf(z, i, len); len = Math.max(24, Math.round(pathTiles / sp.winding)); }
      sp = spineOf(z, i, len);
      zones.push({ z, i, yS: y, yN: y - len, len, width: widthOf(z), speed, winding: sp.winding,
                   minutes: minutesOf(z), pathTiles: Math.round(len * sp.winding), spine: sp.pts });
      y -= len;
    });
    // Camino global: puntos (y, x) de sur a norte.
    const ctrl = [{ y: 2, x: mid }];
    for (const zz of zones) for (const p of zz.spine) ctrl.push({ y: zz.yS - p.dy, x: mid + p.x });
    w = { zones, ctrl, W, mid, top: y, leagueOpen: !!opts.leagueOpen, pockets: [], buckets: new Map(), checkpoints: [], bosses: [] };

    // Checkpoints al empezar cada tramo.
    const cp = cfg.transition.checkpoint;
    for (const zz of zones) {
      const ty = zz.yS - cp - 1;
      zz.checkpoint = { zoneId: zz.z.id, tx: Math.round(cx(ty)), ty, r: cp };
      w.checkpoints.push(zz.checkpoint);
    }
    // Claros de combate (y lo que llevan dentro: charcas, rocas, bosquecillos, islas).
    for (const zz of zones) {
      const z = zz.z, st = cfg.styles[z.style], f = z.features || {}, R = rng(104729 * (zz.i + 1));
      const rand = (a, b) => a + R() * (b - a);
      const theme = themeInfo(z.theme);
      if (z.style === 'plaza') {
        const py = Math.round((zz.yS + zz.yN) / 2);
        addPocket({ zi: zz.i, x: cx(py), y: py, rx: st.clearing[0][0] * zz.width / 2, ry: st.clearing[1][0], plaza: true });
        zz.arena = { tx: Math.round(cx(py)), ty: py - 2 };
        continue;
      }
      const from = zz.yS - cp * 2 - 8, to = zz.yN + 10;
      for (let py = from; py > to; py -= st.gap + rand(-3, 3)) {
        const rx = Math.max(4, rand(st.clearing[0][0], st.clearing[0][1]) * zz.width / 2 * (f.wide || 1));
        const ry = rand(st.clearing[1][0], st.clearing[1][1]);
        const half = halfAt(py);
        const x = G.U.clamp(cx(py) + rand(-0.4, 0.4) * rx, mid - half + rx + 3, mid + half - rx - 3);
        const p = addPocket({ zi: zz.i, x, y: py, rx, ry });
        // Claro lateral, unido por un paso estrecho: para explorar a los lados (y para los jefes).
        if (R() < (st.sides || 0)) {
          const dir = x < mid ? 1 : -1, srx = rand(4, 7), sry = rand(4, 6.5), gap = rand(4, 8);
          const sx = G.U.clamp(x + dir * (rx + gap + srx), mid - half + srx + 3, mid + half - srx - 3);
          if (Math.abs(sx - x) > rx + srx) {
            const sy = py + rand(-0.3, 0.3) * ry;
            addPocket({ zi: zz.i, x: sx, y: sy, rx: srx, ry: sry, side: true });
            addPocket({ zi: zz.i, x: (x + sx) / 2, y: (py + sy) / 2, rx: Math.abs(sx - x) / 2, ry: 1.7, passage: true });
          }
        }
        // Lo de dentro, siempre a un lado del camino.
        const blob = (kind, r) => {
          const dir = x > cx(py) ? 1 : -1;
          const bx = cx(py) + dir * rand(r + 3, Math.max(r + 3.5, rx * 0.8)), by = py + rand(-0.4, 0.4) * ry;
          p.blobs.push({ kind, x: bx, y: by, r });
        };
        if (z.style === 'sea') { p.island = true; if (R() < (f.islands || 0)) addPocket({ zi: zz.i, x: G.U.clamp(cx(py) + (R() < 0.5 ? -1 : 1) * rand(14, 26), mid - half + 8, mid + half - 8), y: py + rand(-8, 8), rx: rand(3, 5), ry: rand(3, 5), island: true }); }
        if (R() < (f.ponds || 0)) blob(HARSH.has(theme.liquid) ? 'pool' : 'pond', rand(1.6, 3));
        if (R() < (f.outcrops || 0)) blob('outcrop', rand(0.9, 2));
        if (R() < (f.groves || 0)) blob('grove', rand(3, 5.5));
      }
      // Río de lado a lado a mitad de tramo (con vado en el camino).
      if (f.river) zz.river = Math.round((zz.yS + zz.yN) / 2);
      // Jefes: en los claros laterales de la mitad norte del tramo (fuera del camino, se va a por ellos);
      // si no hay, en los claros más al norte.
      const mine = w.pockets.filter(p => p.zi === zz.i && !p.island && !p.passage);
      const north = (zz.yS + zz.yN) / 2;
      const sides = mine.filter(p => p.side && p.y < north).sort((a, b) => a.y - b.y);
      const own = sides.length >= (z.bosses || []).length ? sides : mine.sort((a, b) => a.y - b.y);
      (z.bosses || []).forEach((b, k) => {
        const p = own[k] || own[0];
        if (!p) return;
        const spot = { zoneId: z.id, dex: b.dex, level: b.level, kind: b.kind, tx: Math.round(p.x), ty: Math.round(p.y) };
        p.blobs = p.blobs.filter(o => Math.hypot(o.x - spot.tx, o.y - spot.ty) > o.r + 3);
        w.bosses.push(spot);
      });
    }
    return w;
  }

  function addPocket(p) {
    p.blobs = p.blobs || [];
    w.pockets.push(p);
    const r = Math.max(p.ry, 8) + 6;
    for (let b = Math.floor((p.y - r) / BUCKET); b <= Math.floor((p.y + r) / BUCKET); b++) {
      if (!w.buckets.has(b)) w.buckets.set(b, []);
      w.buckets.get(b).push(p);
    }
    return p;
  }

  function themeInfo(theme) {
    const bi = G.KZones.paletteOf(theme);
    const B = G.Tiles.BIOMES[bi];
    return { prop: B.prop, liquid: B.liquid };
  }

  // ---------------- consultas de forma ----------------

  /** Índice del tramo de esta fila (y en tiles). */
  function zoneIndexAt(ty) {
    const zs = w.zones;
    if (ty > zs[0].yN) return 0;
    let lo = 0, hi = zs.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ty > zs[m].yN) hi = m; else lo = m + 1;
    }
    return lo;
  }

  /** x del camino central (en tiles) a esta altura. */
  function cx(y) {
    const c = w.ctrl;
    if (y >= c[0].y) return c[0].x;
    let lo = 0, hi = c.length - 1;
    if (y <= c[hi].y) return c[hi].x;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m].y >= y) lo = m; else hi = m; }
    const a = c[lo], b = c[hi], k = (a.y - y) / (a.y - b.y), e = (1 - Math.cos(k * Math.PI)) / 2;
    return a.x + (b.x - a.x) * e;
  }

  /** Medio ancho del tramo a esta altura, pasando de uno a otro en transition.width tiles. */
  function halfAt(ty) {
    const i = zoneIndexAt(ty), zz = w.zones[i], T = D().transition.width;
    const here = zz.width / 2;
    const prev = w.zones[i - 1], next = w.zones[i + 1];
    if (prev && ty > zz.yS - T / 2) {
      const k = (ty - (zz.yS - T / 2)) / T;                       // 0 dentro, 0.5 en la frontera
      return here + (prev.width / 2 - here) * Math.min(0.5, k);
    }
    if (next && ty < zz.yN + T / 2) {
      const k = ((zz.yN + T / 2) - ty) / T;
      return here + (next.width / 2 - here) * Math.min(0.5, k);
    }
    return here;
  }

  const ell = (p, x, y) => Math.sqrt(((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2);

  /** Checkpoint cercano en el que está la casilla (o null). */
  function checkpointAt(tx, ty) {
    for (const c of w.checkpoints) {
      if (Math.abs(ty - c.ty) > c.r + 1) continue;
      if (Math.hypot(tx - c.tx, ty - c.ty) <= c.r + 0.5) return c;
    }
    return null;
  }

  /**
   * Terreno de una casilla: F suelo, X pared, L líquido, BELT suelo con
   * árbol posible del cinturón (para el terreno, suelo).
   */
  function cell(tx, ty) {
    if (!w) return X;
    if (tx < 2 || tx >= w.W - 2 || ty > -2 || ty < w.top + 2) return X;
    const i = zoneIndexAt(ty), zz = w.zones[i], z = zz.z;
    const st = D().styles[z.style], f = z.features || {};
    // Cierre de la Liga: hasta vencerla, una pared de lado a lado al norte de su tramo.
    if (z.gauntlet && !w.leagueOpen && ty <= zz.yN + 2) return X;
    const half = halfAt(ty);
    const dx = Math.abs(tx - w.mid);
    if (dx > half) return X;
    const c = cx(ty);
    // Checkpoints y el camino hasta ellos: siempre suelo.
    if (checkpointAt(tx, ty)) return F;
    const onSpine = Math.abs(tx - c) <= 1;
    const n = vnoise(tx / 3, ty / 3, i * 7 + 3) - 0.5;
    const hw = st.hw * (f.narrow || 1) + n * (z.style === 'canyon' ? 2.2 : 1.6);
    let d = Math.abs(tx - c) - hw;                                     // < 0 dentro del camino
    let pocket = null;
    for (const p of w.buckets.get(Math.floor(ty / BUCKET)) || []) {
      const e = (ell(p, tx, ty) - 1) * Math.min(p.rx, p.ry) - n * (z.style === 'canyon' ? 3 : 2);
      if (e < d) { d = e; pocket = p; }
      for (const b of p.blobs) {
        const bd = Math.hypot(tx - b.x, (ty - b.y) * 1.15) - b.r - n * 1.2;
        if (bd <= 0 && !onSpine) {
          if (b.kind === 'pond' || b.kind === 'pool') return L;
          if (b.kind === 'outcrop') return X;
        }
      }
    }
    for (const b of w.bosses) if (Math.abs(ty - b.ty) <= 2 && Math.abs(tx - b.tx) <= 2) return F;
    if (z.style === 'sea') {
      // Agua en todo el tramo; la barra de arena del camino (a ratos cortada) y las islas.
      const ford = ((ty % 23) + 23) % 23 < 3 && hash(0, Math.floor(ty / 23), 41) < 0.4;
      if (onSpine && !ford) return F;
      if (pocket && pocket.island && d <= 0) return F;
      return dx > half - 1.5 ? X : L;
    }
    if (z.style === 'open') {
      if (dx <= half - 3) return F;
      return dx <= half - 1 ? BELT : X;
    }
    if (z.style === 'plaza') {
      const p = pocket && pocket.plaza ? pocket : null;
      if (onSpine || d <= 0) {
        if (p) for (const [ox, oy] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) if (Math.abs(tx - (p.x + ox)) <= 0.6 && Math.abs(ty - (p.y + oy)) <= 0.6) return X;
        return F;
      }
      return X;
    }
    if (d > 0 && !onSpine) return st.belt && d <= st.belt ? BELT : X;
    // Dentro: lo del estilo.
    if (zz.river != null && Math.abs(ty - zz.river) <= 1 && Math.abs(tx - c) > 2) return L;
    if (!onSpine && Math.abs(tx - c) > 2.5) {
      if (f.pillars && d < -2 && hash(tx, ty, 61) < f.pillars) return X;
      if (f.blocks && tx % 3 === 0 && ((ty % 3) + 3) % 3 === 0 && hash(tx, ty, 62) < f.blocks * 9) return X;
    }
    return F;
  }

  // ---------------- objetos ----------------

  /**
   * Objetos de un chunk (lo llama G.World al crear sus datos).
   * @param at  terreno global cacheado (G.World.terrainAt)
   */
  function props(cx0, cy0, N, at) {
    const out = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx0 * N + i, ty = cy0 * N + j;
      if (at(tx, ty) !== F) continue;
      const k = cell(tx, ty);
      const zz = w.zones[zoneIndexAt(ty)], z = zz.z, f = z.features || {};
      const cp = checkpointAt(tx, ty);
      if (cp) {
        // Manantial en cada checkpoint (cura), a un lado del camino.
        if (tx === cp.tx + 3 && ty === cp.ty) out.push({ type: 'spring', tx, ty });
        continue;
      }
      if (k === BELT) {
        const edge = cell(tx + 1, ty) === X || cell(tx - 1, ty) === X || cell(tx, ty + 1) === X || cell(tx, ty - 1) === X;
        if (edge || hash(tx, ty, 71) < (f.trees || 0.6)) { out.push({ type: 'tree', tx, ty }); continue; }
      }
      const c = cx(ty);
      if (Math.abs(tx - c) <= 1.5) continue;                                   // el camino, despejado
      if (w.bosses.some(b => Math.abs(b.tx - tx) <= 2 && Math.abs(b.ty - ty) <= 2)) continue;
      // Bosquecillos (Safari).
      let grove = false;
      for (const p of w.buckets.get(Math.floor(ty / BUCKET)) || []) for (const b of p.blobs) if (b.kind === 'grove' && Math.hypot(tx - b.x, ty - b.y) <= b.r) grove = true;
      if (grove && hash(tx, ty, 72) < 0.5) { out.push({ type: 'tree', tx, ty }); continue; }
      // Obstáculos sueltos: como mucho uno por bloque de 3×3, con suelo alrededor.
      const theme = themeInfo(z.theme);
      const pTree = theme.prop === 'tree' ? (f.scatterTrees || 0) : 0, pCrys = theme.prop === 'crystal' ? (f.crystals || 0) : 0;
      const pSolid = (pTree + pCrys + (f.rocks || 0)) * 9;
      const bx = Math.floor(tx / 3), by = Math.floor(ty / 3);
      const pick = Math.floor(hash(bx, by, 73) * 9);
      if (pSolid > 0 && tx - bx * 3 === pick % 3 && ty - by * 3 === Math.floor(pick / 3)) {
        const r = hash(bx, by, 74);
        let ok = r < pSolid;
        for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (at(tx + a, ty + b) !== F) { ok = false; break; }
        if (ok) { out.push({ type: r < (pTree + pCrys) * 9 ? 'tree' : 'rock', tx, ty }); continue; }
      }
      // Cofres: raros, fuera del camino.
      const hc = hash(tx, ty, 75);
      if (hc < 0.0016 && !z.gauntlet) { out.push({ type: hc < 0.00025 ? 'bigchest' : 'chest', tx, ty }); continue; }
      // Hierba alta en manchas.
      const g = vnoise(tx / 4.5, ty / 4.5, 76);
      if (g > 1 - (f.grass || 0.1) * 0.75 && hash(tx, ty, 77) < 0.8) out.push({ type: 'grass', tx, ty });
    }
    return out;
  }

  // ---------------- API ----------------

  const TS = () => G.World.TS;
  const zoneAtY = y => w.zones[zoneIndexAt(Math.floor(y / TS()))];

  /** El tramo de una posición del mundo (px), o null. */
  function zoneAt(y) { return w ? zoneAtY(y).z : null; }

  /** Fracción de mezcla con el tramo vecino (fauna): { other, k } con k = prob. de usar el vecino. */
  function faunaBlend(y) {
    const ty = Math.floor(y / TS()), i = zoneIndexAt(ty), zz = w.zones[i], T = D().transition.fauna;
    const dS = zz.yS - ty, dN = ty - zz.yN;
    if (i > 0 && dS < T) return { other: w.zones[i - 1].z, k: 0.5 * (1 - dS / T) };
    if (i < w.zones.length - 1 && dN < T && !w.zones[i + 1].z.gauntlet && !zz.z.gauntlet) return { other: w.zones[i + 1].z, k: 0.5 * (1 - dN / T) };
    return { other: null, k: 0 };
  }

  /** Centro (px) de una casilla. */
  const center = (tx, ty) => ({ x: tx * TS() + TS() / 2, y: ty * TS() + TS() - 4 });

  return {
    F, X, L, SEED, build, cell, props, zoneAt, faunaBlend, cx, halfAt, refSpeed, checkpointAt, center,
    terrain(tx, ty) { const k = cell(tx, ty); return k === BELT ? F : k; },
    /** ¿Está este punto (px) dentro de un checkpoint? Devuelve el checkpoint. */
    safeAt(x, y) { return w ? checkpointAt(Math.floor(x / TS()), Math.floor(y / TS())) : null; },
    checkpointOf(zoneId) { return w && (w.zones.find(zz => zz.z.id === zoneId) || {}).checkpoint || null; },
    zoneInfo(zoneId) { return w && w.zones.find(zz => zz.z.id === zoneId) || null; },
    setLeagueOpen(v) { if (w) w.leagueOpen = !!v; },
    get built() { return w; }, get bosses() { return w ? w.bosses : []; }, get zones() { return w ? w.zones : []; }
  };
})();
