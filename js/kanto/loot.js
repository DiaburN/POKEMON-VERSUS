/* ============ loot.js — tiradas de botín del modo Kanto ============
 * Las tablas están en js/data/loot-tables.js y las monedas de los salvajes
 * en G.KCFG.COINS; aquí sólo se tira. `rnd` se puede pasar (pruebas,
 * servidor en el futuro); por defecto Math.random.
 */
G.Loot = (() => {
  const T = () => G.KLoot;

  /** Tramo de la zona (1..4) según su nivel recomendado máximo. */
  function tier(zone) {
    const top = zone.recommendedLevel[1];
    return T().TIERS.find(t => top <= t.upTo).tier;
  }

  function entriesFor(tableId, zone) {
    const tb = T().TABLES[tableId];
    const extra = ((T().ZONE_EXTRA[zone.id] || {})[tableId]) || [];
    const ti = tier(zone);
    return tb.entries.concat(extra).filter(e => (e.minTier || 1) <= ti && ti <= (e.maxTier || 9) && G.KItems.BY[e.item]);
  }

  /** { coins, items: [ids] } de una tabla. */
  function roll(tableId, zone, rnd = Math.random) {
    const tb = T().TABLES[tableId];
    const out = { coins: 0, items: [] };
    if (!tb) return out;
    if (tb.coins && rnd() < (tb.coinChance == null ? 1 : tb.coinChance)) {
      const [a, b] = tb.coins;
      out.coins = Math.round((a + rnd() * (b - a)) * T().COIN_TIER_MULT[tier(zone)]);
    }
    const pool = entriesFor(tableId, zone);
    const total = pool.reduce((s, e) => s + e.w, 0);
    for (let i = 0; i < (tb.rolls || 1) && total > 0; i++) {
      if (rnd() >= tb.chance) continue;
      let r = rnd() * total;
      const e = pool.find(x => (r -= x.w) < 0) || pool[pool.length - 1];
      out.items.push(e.item);
    }
    return out;
  }

  /** Pokémonedas de un salvaje vencido (siempre algunas). */
  function wildCoins(level, rarity, boss = false, rnd = Math.random) {
    const c = G.KCFG.COINS;
    const k = boss ? c.rarity.boss : (c.rarity[rarity] || 1);
    return Math.max(1, Math.round((c.base + level * c.perLevel) * k * (0.8 + rnd() * 0.4)));
  }

  return { tier, roll, wildCoins, entriesFor };
})();
