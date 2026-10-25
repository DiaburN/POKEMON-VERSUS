/* ============ zones.js — tramos de Kanto (datos + validación) ============
 * Convierte cada tramo de G.KANTO_WORLD (js/data/kanto-world.js) en Zone:
 *
 *   { id, order, regionId, name, ref, recommendedLevel: [min, max], size, style, theme, type,
 *     pvpMode, density: [min, max], entries: [{ dex, minLevel, maxLevel, rarity, tier, weight }],
 *     staticBosses: [{ dex, level, kind, respawnClass }], gauntlet, requires }
 *
 * Los niveles de la fauna salen del rango del tramo y del escalón (tiers):
 * los comunes abajo, los raros arriba, los élite por encima del máximo. Una
 * forma que evoluciona por nivel nunca sale a ese nivel o más (Caterpie,
 * siempre por debajo de Nv.7): se queda en los niveles justo anteriores.
 *
 * Dónde está cada tramo en el mundo lo sabe G.KWorld (js/kanto/worldgen.js).
 */
G.KZones = (() => {
  const C = () => G.KCFG;
  const D = () => G.KANTO_WORLD;
  const RARITIES = ['common', 'uncommon', 'rare', 'very_rare'];
  let list = null, by = null;

  // Temas que tienen paleta: las de G.Tiles.ARENA_THEMES más los biomas base.
  const BASE = { forest: 0, crystal: 1, ash: 2 };
  const THEMES = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying',
                  'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy', 'judgment', ...Object.keys(BASE)];
  // Tipo que representa cada tema (icono y color en la lista de tramos).
  const TYPE_OF = { forest: 'grass', crystal: 'rock', ash: 'fire', judgment: 'fighting' };

  /** Índice de bioma (G.Tiles.BIOMES) de un tema. */
  function paletteOf(theme) { return theme in BASE ? BASE[theme] : G.Tiles.arenaBiome(theme); }

  /** El nivel más bajo al que esa especie evoluciona por nivel (o Infinity). */
  function levelEvoCap(dex) {
    const ev = (G.GEN1.BY[dex] || {}).evolution || [];
    return Math.min(Infinity, ...ev.filter(e => e.method === 'level').map(e => e.level));
  }

  /** Fauna del tramo con sus niveles. */
  function entriesOf(z) {
    const [a, b] = z.level, r = b - a, out = [];
    for (const [tier, dexes] of Object.entries(z.fauna || {})) {
      const T = D().tiers[tier] || { rarity: tier };
      for (const dex of dexes) {
        if (C().NEVER_WILD.includes(dex)) continue;
        let lo = Math.round(a + r * (T.from || 0)) - (T.minus || 0), hi = Math.round(a + r * (T.to == null ? 1 : T.to)) + (T.plus || 0);
        const cap = levelEvoCap(dex);
        if (hi >= cap) { hi = cap - 1; lo = Math.min(lo, hi - 2); }
        lo = Math.max(1, Math.min(lo, hi)); hi = Math.min(C().MAX_LEVEL, hi);
        out.push({ dex, minLevel: lo, maxLevel: hi, rarity: T.rarity, tier,
                   weight: T.weight || C().RARITY_WEIGHT[T.rarity] || 1 });
      }
    }
    return out;
  }

  function build(z, i) {
    return {
      id: z.id, order: i + 1, regionId: C().REGION, name: z.name, ref: z.ref || '',
      recommendedLevel: z.level.slice(), size: z.size, style: z.style, theme: z.theme, type: TYPE_OF[z.theme] || z.theme,
      pvpMode: z.pvpMode || 'duel_opt_in', density: (z.density || [0, 0]).slice(),
      entries: entriesOf(z),
      staticBosses: (z.bosses || []).map(b => ({ dex: b.dex, level: b.level, kind: b.kind,
        respawnClass: b.kind === 'legendary' ? (b.dex === 150 ? 'mythic' : 'legendary') : 'event' })),
      tiers: Object.keys(z.fauna || {}), gauntlet: z.gauntlet || null, requires: z.requires || null, notes: z.notes || ''
    };
  }

  function load() {
    list = D().zones.map(build);
    by = {};
    for (const z of list) by[z.id] = z;
    return list;
  }

  const all = () => list || load();
  const get = id => (by || (load(), by))[id] || null;
  const next = z => all()[z.order] || null;
  const prev = z => all()[z.order - 2] || null;

  /** Especies que pueden salir en un tramo (para la ficha). */
  function species(z) { return [...new Set(z.entries.map(e => e.dex))]; }

  // ---------------- validación ----------------

  /** Lista de errores de un tramo ([] = válido). */
  function validate(z) {
    const err = [];
    if (!THEMES.includes(z.theme)) err.push(z.id + ': tema desconocido ' + z.theme);
    if (!D().styles[z.style]) err.push(z.id + ': estilo desconocido ' + z.style);
    const raw = D().zones.find(o => o.id === z.id) || {};
    if (!(raw.minutes || D().minutes[z.size]) || !(raw.width || D().width[z.size])) err.push(z.id + ': clase de tamaño sin minutos o ancho: ' + z.size);
    if (!['duel_opt_in', 'none', 'open'].includes(z.pvpMode)) err.push(z.id + ': pvpMode desconocido ' + z.pvpMode);
    const [a, b] = z.recommendedLevel;
    if (!(a >= 1 && b <= C().MAX_LEVEL && a <= b)) err.push(z.id + ': nivel recomendado incorrecto');
    for (const tier of z.tiers || []) if (!D().tiers[tier]) err.push(z.id + ': escalón desconocido ' + tier);
    for (const e of z.entries) {
      const tag = z.id + ' #' + e.dex;
      if (!G.GEN1.BY[e.dex]) { err.push(tag + ': especie desconocida'); continue; }
      if (D().specialAcquisition.includes(e.dex)) err.push(tag + ': es de adquisición especial');
      if (!(e.minLevel <= e.maxLevel)) err.push(tag + ': nivel mínimo > máximo');
      if (D().tiers[e.tier] && !RARITIES.includes(e.rarity)) err.push(tag + ': rareza desconocida ' + e.rarity);
      if (e.maxLevel >= levelEvoCap(e.dex)) err.push(tag + ': sale a Nv.' + e.maxLevel + ' pero evoluciona a Nv.' + levelEvoCap(e.dex));
    }
    for (const s of z.staticBosses) {
      if (!G.GEN1.BY[s.dex]) err.push(z.id + ' jefe #' + s.dex + ' desconocido');
      if (!Number.isInteger(s.level) || s.level < 1 || s.level > C().MAX_LEVEL) err.push(z.id + ' jefe #' + s.dex + ': nivel incorrecto');
    }
    if (!z.gauntlet && !z.entries.length) err.push(z.id + ': sin fauna');
    return err;
  }

  function validateAll() {
    const ids = new Set(), err = [];
    for (const z of all()) { if (ids.has(z.id)) err.push('id repetido ' + z.id); ids.add(z.id); err.push(...validate(z)); }
    return err;
  }

  return { all, get, next, prev, load, build, entriesOf, species, levelEvoCap, validate, validateAll, paletteOf, THEMES, TYPE_OF };
})();
