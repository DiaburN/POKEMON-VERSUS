/* ============ zones.js — zonas de Kanto (datos + validación) ============
 * Junta la semilla de zonas (KANTO_ZONES_V1.json -> js/data/kanto-zones.js)
 * con su mapa (js/data/kanto-maps.js) y la convierte en Zone:
 *
 *   { id, regionId, name, recommendedLevel: [min, max], theme, pvpMode,
 *     map, exits, playerSpawns, safe, wildSpawnGroups, chestSpawns,
 *     destructibles, staticBosses, gauntlet, special }
 *
 * validate() comprueba todo lo que la especificación pide (apartado 34) y,
 * sobre todo, que ningún salvaje que evoluciona por nivel salga a su nivel de
 * evolución o más (Caterpie nunca a Nv.7+). En desarrollo, una zona inválida
 * avisa en la consola al cargar; las pruebas (tests/kanto.test.cjs) fallan.
 */
G.KZones = (() => {
  const C = () => G.KCFG;
  const RARITIES = ['common', 'uncommon', 'rare', 'very_rare'];
  let list = null, by = null;

  function rectOf(m) { return { x: m.x, y: m.y, w: m.w, h: m.h }; }

  function build(seed, map) {
    const mk = (map && map.markers) || {};
    const entries = seed.wild.filter(w => !C().NEVER_WILD.includes(w.dex)).map(w => ({
      dex: w.dex, minLevel: w.level[0], maxLevel: w.level[1], rarity: w.rarity,
      weight: C().RARITY_WEIGHT[w.rarity] || 1
    }));
    const statics = (seed.staticBoss || []).concat((C().EXTRA_STATICS[seed.id] || []))
      .map((s, i) => Object.assign({ tx: ((mk.boss || [])[i] || (mk.boss || [])[0] || {}).tx, ty: ((mk.boss || [])[i] || (mk.boss || [])[0] || {}).ty }, s));
    return {
      id: seed.id, regionId: seed.region || C().REGION, name: seed.name, ref: seed.originalReference || '',
      recommendedLevel: seed.recommendedLevel.slice(), theme: seed.theme, pvpMode: seed.pvpMode,
      map: map || null,
      exits: (mk.exits || []).slice(), playerSpawns: (mk.spawn || []).slice(), safe: (mk.safe || []).map(rectOf),
      wildSpawnGroups: entries.length ? (mk.wild || []).map((g, i) => ({
        id: seed.id + ':g' + i, rect: rectOf(g), maxAlive: g.maxAlive || C().MAX_ALIVE_DEFAULT,
        entries, respawn: C().RESPAWN
      })) : [],
      chestSpawns: (mk.chest || []).slice(),
      destructibles: map ? map.props.filter(p => p.type !== 'tree' && p.type !== 'spring').length : 0,
      staticBosses: statics,
      gauntlet: seed.gauntlet || null,
      special: seed.special || []
    };
  }

  function load() {
    const seed = G.KANTO_ZONES_SEED, maps = G.KANTO_MAPS || {};
    list = seed.zones.map(z => build(z, maps[z.id]));
    by = {};
    for (const z of list) by[z.id] = z;
    return list;
  }

  const all = () => list || load();
  const get = id => (by || (load(), by))[id] || null;

  /** Especies que pueden salir en una zona (para la ficha). */
  function species(z) {
    const s = new Set();
    for (const g of z.wildSpawnGroups) for (const e of g.entries) s.add(e.dex);
    return [...s];
  }

  /** El nivel más bajo al que esa especie evoluciona por nivel (o Infinity). */
  function levelEvoCap(dex) {
    const ev = (G.GEN1.BY[dex] || {}).evolution || [];
    return Math.min(Infinity, ...ev.filter(e => e.method === 'level').map(e => e.level));
  }

  // ---------------- validación ----------------

  function validateMap(m) {
    const err = [];
    if (!m) return ['sin mapa'];
    if (!(m.w > 0 && m.h > 0) || !Array.isArray(m.rows) || m.rows.length !== m.h) err.push('tamaño o filas incorrectos');
    if (m.rows && m.rows.some(r => r.length !== m.w)) err.push('alguna fila no mide ' + m.w);
    if (m.rows && m.rows.some(r => /[^.#~]/.test(r))) err.push('letras de terreno desconocidas');
    const tile = (x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? '#' : m.rows[y][x]);
    const inside = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h;
    const PROPS = ['tree', 'rock', 'chest', 'grass', 'spring', 'bigchest', 'trap'];
    for (const p of m.props || []) {
      if (!PROPS.includes(p.type)) err.push('objeto desconocido ' + p.type);
      if (!inside(p.tx, p.ty) || tile(p.tx, p.ty) !== '.') err.push(p.type + ' fuera del suelo en ' + p.tx + ',' + p.ty);
    }
    const mk = m.markers || {};
    if (!(mk.spawn || []).length) err.push('sin punto de entrada');
    if (!(mk.exits || []).length) err.push('sin salida');
    for (const key of ['spawn', 'exits', 'boss', 'chest']) {
      for (const p of mk[key] || []) {
        if (!inside(p.tx, p.ty)) err.push(key + ' fuera del mapa en ' + p.tx + ',' + p.ty);
        else if (tile(p.tx, p.ty) !== '.') err.push(key + ' en pared o líquido en ' + p.tx + ',' + p.ty);
      }
    }
    for (const r of [...(mk.wild || []), ...(mk.safe || [])]) {
      if (!(r.w > 0 && r.h > 0) || r.x < 0 || r.y < 0 || r.x + r.w > m.w || r.y + r.h > m.h) err.push('zona fuera del mapa');
    }
    for (const r of mk.wild || []) {
      let ok = false;
      for (let y = r.y; y < r.y + r.h && !ok; y++) for (let x = r.x; x < r.x + r.w; x++) if (tile(x, y) === '.') { ok = true; break; }
      if (!ok) err.push('zona de salvajes sin suelo en ' + r.x + ',' + r.y);
    }
    return err;
  }

  /** Lista de errores de una zona ([] = válida). */
  function validate(z) {
    const err = [];
    if (!THEMES.includes(z.theme)) err.push('tema desconocido: ' + z.theme);
    if (!['duel_opt_in', 'none', 'open'].includes(z.pvpMode)) err.push('pvpMode desconocido: ' + z.pvpMode);
    const [a, b] = z.recommendedLevel;
    if (!(a >= 1 && b <= C().MAX_LEVEL && a <= b)) err.push('nivel recomendado incorrecto');
    for (const g of z.wildSpawnGroups) for (const e of g.entries) {
      const tag = z.id + ' #' + e.dex;
      if (!G.GEN1.BY[e.dex]) { err.push(tag + ': especie desconocida'); continue; }
      if (!(e.minLevel <= e.maxLevel)) err.push(tag + ': nivel mínimo > máximo');
      if (e.minLevel < 1 || e.maxLevel > C().MAX_LEVEL) err.push(tag + ': nivel fuera de 1..100');
      if (!RARITIES.includes(e.rarity)) err.push(tag + ': rareza desconocida ' + e.rarity);
      const cap = levelEvoCap(e.dex);
      if (e.maxLevel >= cap) err.push(tag + ': sale a Nv.' + e.maxLevel + ' pero evoluciona a Nv.' + cap);
      if (C().NEVER_WILD.includes(e.dex)) err.push(tag + ': legendario como salvaje normal');
    }
    for (const s of z.staticBosses) {
      if (!G.GEN1.BY[s.dex]) err.push(z.id + ' estático #' + s.dex + ' desconocido');
      if (!Number.isInteger(s.level) || s.level < 1 || s.level > C().MAX_LEVEL) err.push(z.id + ' estático #' + s.dex + ': nivel fijo incorrecto');
      if (s.tx == null) err.push(z.id + ' estático #' + s.dex + ': sin marcador en el mapa');
    }
    if (!z.wildSpawnGroups.length && !z.gauntlet && species(z).length) err.push(z.id + ': salvajes sin zona de aparición');
    for (const e of validateMap(z.map)) err.push(z.id + ' mapa: ' + e);
    return err;
  }

  function validateAll() { return all().flatMap(validate); }

  // Temas que tienen paleta (las de G.Tiles.ARENA_THEMES; aquí también para las pruebas sin tiles.js).
  const THEMES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying',
                  'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];

  /** ¿Está (x, y) en mundo dentro de la zona segura de la entrada? */
  function inSafe(z, x, y) {
    const TS = G.World.TS;
    return z.safe.some(r => x >= r.x * TS && y >= r.y * TS && x < (r.x + r.w) * TS && y < (r.y + r.h) * TS);
  }

  return { all, get, load, build, species, levelEvoCap, validate, validateMap, validateAll, inSafe, THEMES };
})();
