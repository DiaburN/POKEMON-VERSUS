/* ============ save.js (Kanto) — lo persistente del modo Kanto ============
 * Va dentro de la partida de siempre (G.DB.save.kanto), así se guarda, se
 * sube a la nube y se fusiona igual que lo demás. No toca nada de
 * PokéSurvivor (colección owned, monedas, mochila de la Tienda Kecleon...).
 *
 *   kanto = {
 *     schemaVersion,
 *     pokemonInstances: { id: PokemonInstance },   // ver js/kanto/pokemon.js
 *     activePokemonId, party: [ids]                // party: preparada para el futuro (V1 = 1 activo)
 *     bag: { itemId: cantidad },                   // objetos del modo Kanto (js/data/kanto-items.js)
 *     beltLoadout: { heal, pp, revive, ball, utility },   // ids de objeto de la bolsa (o null)
 *     currencies: { pokecoins },
 *     dex: { seen: { dex: t }, caught: { dex: t } },
 *     regionProgress: { kanto: { starter, discoveredZones: { id: t }, leagueCleared,
 *                                statics: { "zona:dex": t }, gifts: { id: t }, zoneStats: { id: {...} } } }
 *   }
 *
 * Migración: G.DB (v3 -> v4) llama a migrate(); una partida sin Kanto recibe
 * un bloque nuevo y nada de lo que ya tenía cambia. Desde aquí, cada cambio de
 * forma sube schemaVersion y se migra en migrate().
 */
G.KSave = (() => {
  const SCHEMA = 1;
  const C = () => G.KCFG;
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const int = (v, max = 1e9) => (Number.isFinite(+v) && +v > 0 ? Math.min(max, Math.floor(+v)) : 0);

  function blank() {
    return {
      schemaVersion: SCHEMA,
      pokemonInstances: {},
      activePokemonId: null,
      party: [],
      bag: Object.assign({}, C().START_BAG),
      beltLoadout: { heal: null, pp: null, revive: null, ball: null, utility: null },
      currencies: { pokecoins: C().START_POKECOINS },
      dex: { seen: {}, caught: {} },
      regionProgress: { kanto: blankRegion() }
    };
  }
  function blankRegion() {
    return { starter: null, discoveredZones: {}, leagueCleared: false, statics: {}, gifts: {}, zoneStats: {} };
  }

  /** Rellena / convierte el bloque Kanto de una partida (cualquier versión). */
  function migrate(s) {
    if (!isObj(s.kanto)) s.kanto = blank();
    const k = s.kanto, b = blank();
    for (const key in b) if (k[key] == null) k[key] = b[key];
    for (const key in b.beltLoadout) if (!(key in k.beltLoadout)) k.beltLoadout[key] = null;
    if (!isObj(k.regionProgress)) k.regionProgress = {};
    const r = k.regionProgress.kanto = Object.assign(blankRegion(), k.regionProgress.kanto);
    for (const key of ['discoveredZones', 'statics', 'gifts', 'zoneStats']) if (!isObj(r[key])) r[key] = {};
    // (schemaVersion 1 es la primera; aquí irán las conversiones de las siguientes.)
    k.schemaVersion = SCHEMA;
    return s;
  }

  /** Quita lo imposible (partida editada a mano): sin negativos, sin ids que no existen. */
  function sanitize(s) {
    const k = s.kanto;
    if (!isObj(k)) return;
    if (!isObj(k.bag)) k.bag = {};
    for (const id of Object.keys(k.bag)) {
      k.bag[id] = int(k.bag[id], 999);
      if (!k.bag[id] || !G.KItems.BY[id]) delete k.bag[id];
    }
    if (!isObj(k.currencies)) k.currencies = {};
    k.currencies.pokecoins = int(k.currencies.pokecoins, 99999999);
    if (!isObj(k.pokemonInstances)) k.pokemonInstances = {};
    for (const [id, p] of Object.entries(k.pokemonInstances)) {
      if (!isObj(p) || !G.GEN1.BY[p.dex] || p.id !== id) { delete k.pokemonInstances[id]; continue; }
      p.regionId = p.regionId || C().REGION;
      p.level = G.U.clamp(int(p.level) || 1, 1, C().MAX_LEVEL);
      p.totalXp = Math.max(G.KMon.expAt(p.dex, p.level), int(p.totalXp));
      p.shiny = !!p.shiny;
      p.moves = (Array.isArray(p.moves) ? p.moves : []).filter(m => isObj(m) && G.GEN1_MOVES.BY[m.id])
        .filter((m, i, a) => a.findIndex(o => o.id === m.id) === i).slice(0, C().MAX_MOVES)
        .map(m => {
          const max = G.GEN1_MOVES.BY[m.id].pp * C().PP_RUNTIME_MULTIPLIER;
          return { id: m.id, currentPP: Math.min(max, int(m.currentPP)), runtimeMaxPP: max };
        });
      if (!p.moves.length) p.moves = G.KMon.movesAtLevel(p.dex, p.level).map(G.KMon.moveSlot);
      const tr = isObj(p.training) ? p.training : {};
      p.training = {};
      let total = 0;
      for (const st of G.KMon.STATS) {
        const v = Math.min(C().EV_MAX_STAT, int(tr[st]), C().EV_MAX_TOTAL - total);
        p.training[st] = v; total += v;
      }
      if (p.heldItemId && !(G.KItems.BY[p.heldItemId] && G.KItems.BY[p.heldItemId].cat === 'held')) p.heldItemId = null;
      if (!isObj(p.caught)) p.caught = { zoneId: null, level: p.level, timestamp: 0 };
    }
    if (!k.pokemonInstances[k.activePokemonId]) k.activePokemonId = Object.keys(k.pokemonInstances)[0] || null;
    k.party = (Array.isArray(k.party) ? k.party : []).filter(id => k.pokemonInstances[id]).slice(0, 6);
    for (const slot of G.KItems.BELT) {
      const id = k.beltLoadout[slot.id];
      if (id != null && !(G.KItems.BY[id] && G.KItems.BY[id].cat === slot.cat)) k.beltLoadout[slot.id] = null;
    }
  }

  /** Fusión de dos copias (nube / navegador): `r` es la más reciente; nunca se pierde un Pokémon. */
  function merge(r, older) {
    if (!older || !isObj(older.kanto)) return;
    if (!isObj(r.kanto)) { r.kanto = JSON.parse(JSON.stringify(older.kanto)); return; }
    const a = r.kanto, b = older.kanto;
    a.pokemonInstances = a.pokemonInstances || {};
    for (const id in b.pokemonInstances || {}) if (!a.pokemonInstances[id]) a.pokemonInstances[id] = b.pokemonInstances[id];
    const ra = (a.regionProgress = a.regionProgress || {}).kanto = a.regionProgress.kanto || blankRegion();
    const rb = (b.regionProgress || {}).kanto || {};
    for (const key of ['discoveredZones', 'gifts', 'statics']) {
      ra[key] = ra[key] || {};
      for (const z in rb[key] || {}) if (!ra[key][z]) ra[key][z] = rb[key][z];
    }
    ra.leagueCleared = !!(ra.leagueCleared || rb.leagueCleared);
    if (ra.starter == null) ra.starter = rb.starter;
    a.dex = a.dex || { seen: {}, caught: {} };
    for (const key of ['seen', 'caught']) {
      a.dex[key] = a.dex[key] || {};
      for (const d in (b.dex || {})[key] || {}) if (!a.dex[key][d]) a.dex[key][d] = b.dex[key][d];
    }
  }

  // ---------------- acceso ----------------

  const data = () => (G.DB.save ? G.DB.save.kanto : null);
  const region = () => data().regionProgress.kanto;
  function commit() { G.DB.commit(); }

  // Bolsa: nunca en negativo.
  function count(id) { return (data().bag[id] | 0); }
  function add(id, n = 1) {
    if (!G.KItems.BY[id] || !(n > 0)) return 0;
    const bag = data().bag;
    const before = bag[id] | 0;
    bag[id] = Math.min(999, before + Math.floor(n));
    return bag[id] - before;
  }
  function take(id, n = 1) {
    const bag = data().bag;
    if ((bag[id] | 0) < n || !(n > 0)) return false;
    bag[id] -= n;
    if (!bag[id]) delete bag[id];
    return true;
  }

  const coins = () => data().currencies.pokecoins | 0;
  function addCoins(n) { data().currencies.pokecoins = Math.max(0, coins() + Math.floor(n)); }
  function spend(n) { if (coins() < n || !(n >= 0)) return false; data().currencies.pokecoins -= n; return true; }

  // Pokémon.
  const list = () => Object.values(data().pokemonInstances);
  const get = id => data().pokemonInstances[id] || null;
  const active = () => get(data().activePokemonId);
  function addPokemon(inst) {
    data().pokemonInstances[inst.id] = inst;
    data().dex.caught[inst.dex] = data().dex.caught[inst.dex] || Date.now();
    if (!data().activePokemonId) data().activePokemonId = inst.id;
    return inst;
  }
  function setActive(id) { if (get(id)) data().activePokemonId = id; }
  function seen(dex) { data().dex.seen[dex] = data().dex.seen[dex] || Date.now(); }

  // Cinturón.
  function belt(slot) { return data().beltLoadout[slot] || null; }
  function setBelt(slot, id) {
    const def = G.KItems.BELT.find(b => b.id === slot);
    if (!def || (id != null && !(G.KItems.BY[id] && G.KItems.BY[id].cat === def.cat))) return false;
    data().beltLoadout[slot] = id;
    return true;
  }

  // Zonas.
  function discover(zoneId) { if (!region().discoveredZones[zoneId]) region().discoveredZones[zoneId] = Date.now(); }
  const discovered = zoneId => !!region().discoveredZones[zoneId];

  return { SCHEMA, blank, migrate, sanitize, merge, data, region, commit,
           count, add, take, coins, addCoins, spend, list, get, active, addPokemon, setActive, seen,
           belt, setBelt, discover, discovered };
})();
