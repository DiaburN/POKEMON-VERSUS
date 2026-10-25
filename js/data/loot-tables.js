/* ============ loot-tables.js — botín del modo Kanto ============
 * Cada tabla: { chance, rolls, entries }. Se tira `rolls` veces; cada vez,
 * con probabilidad `chance`, sale una entrada (por peso w) cuyo tramo
 * [minTier, maxTier] incluye el de la zona. Las monedas van aparte (coins:
 * [min, max] × el multiplicador del tramo). Lo usa js/kanto/loot.js.
 *
 * Tramo de la zona (tier): según su nivel recomendado máximo, ver TIERS.
 * Los extras de zona (Piedra Lunar en Mt. Moon...) están en ZONE_EXTRA.
 */
G.KLoot = {
  // Nivel recomendado máximo de la zona -> tramo 1..4
  TIERS: [{ upTo: 15, tier: 1 }, { upTo: 32, tier: 2 }, { upTo: 50, tier: 3 }, { upTo: Infinity, tier: 4 }],
  COIN_TIER_MULT: [0, 1, 1.8, 3, 4.5],

  TABLES: {
    // Salvaje vencido (además de las monedas que da siempre, ver G.KCFG.COINS).
    wild: { chance: 0.1, rolls: 1, entries: [
      { item: 'potion', w: 40, maxTier: 2 },
      { item: 'super-potion', w: 30, minTier: 2 },
      { item: 'hyper-potion', w: 18, minTier: 3 },
      { item: 'poke-ball', w: 30, maxTier: 2 },
      { item: 'great-ball', w: 18, minTier: 2 },
      { item: 'ultra-ball', w: 10, minTier: 3 },
      { item: 'ether', w: 10 },
      { item: 'escape-rope', w: 4 },
      { item: 'revive', w: 3, minTier: 2 }
    ] },
    grass: { coins: [1, 2], coinChance: 0.08, chance: 0.025, rolls: 1, entries: [
      { item: 'potion', w: 3 }, { item: 'poke-ball', w: 2 }
    ] },
    rock: { coins: [2, 5], coinChance: 0.5, chance: 0.12, rolls: 1, entries: [
      { item: 'potion', w: 20, maxTier: 2 }, { item: 'super-potion', w: 14, minTier: 2 },
      { item: 'ether', w: 8 }, { item: 'poke-ball', w: 10 },
      { item: 'protein', w: 1, minTier: 2 }, { item: 'iron', w: 1, minTier: 2 }, { item: 'carbos', w: 1, minTier: 2 },
      { item: 'calcium', w: 1, minTier: 2 }, { item: 'zinc', w: 1, minTier: 2 }, { item: 'hp-up', w: 1, minTier: 2 }
    ] },
    chest: { coins: [8, 16], coinChance: 1, chance: 0.85, rolls: 2, entries: [
      { item: 'potion', w: 24, maxTier: 2 }, { item: 'super-potion', w: 20, minTier: 2 }, { item: 'hyper-potion', w: 10, minTier: 3 },
      { item: 'poke-ball', w: 22, maxTier: 2 }, { item: 'great-ball', w: 16, minTier: 2 }, { item: 'ultra-ball', w: 8, minTier: 3 },
      { item: 'ether', w: 12 }, { item: 'elixir', w: 3, minTier: 2 }, { item: 'revive', w: 5 },
      { item: 'escape-rope', w: 6 },
      { item: 'luckyegg', w: 1 }, { item: 'quickclaw', w: 1 }, { item: 'leftovers', w: 1, minTier: 2 }
    ] },
    bigchest: { coins: [30, 60], coinChance: 1, chance: 1, rolls: 3, entries: [
      { item: 'great-ball', w: 14, maxTier: 2 }, { item: 'ultra-ball', w: 14, minTier: 2 },
      { item: 'hyper-potion', w: 10, minTier: 2 }, { item: 'super-potion', w: 10, maxTier: 2 },
      { item: 'max-ether', w: 6 }, { item: 'elixir', w: 6 }, { item: 'max-elixir', w: 2, minTier: 3 },
      { item: 'revive', w: 8 }, { item: 'max-revive', w: 2, minTier: 3 }, { item: 'rare-candy', w: 5 },
      { item: 'fire-stone', w: 2 }, { item: 'water-stone', w: 2 }, { item: 'thunder-stone', w: 2 }, { item: 'leaf-stone', w: 2 },
      { item: 'moon-stone', w: 1 },
      { item: 'hp-up', w: 2 }, { item: 'protein', w: 2 }, { item: 'iron', w: 2 }, { item: 'calcium', w: 2 }, { item: 'zinc', w: 2 }, { item: 'carbos', w: 2 },
      { item: 'leftovers', w: 2 }, { item: 'choiceband', w: 1 }, { item: 'choicescarf', w: 1 }, { item: 'focussash', w: 1 },
      { item: 'shellbell', w: 1 }, { item: 'amuletcoin', w: 1 }, { item: 'lifeorb', w: 1, minTier: 2 },
      { item: 'rockyhelmet', w: 1 }, { item: 'assaultvest', w: 1, minTier: 2 }
    ] },
    // Jefes (estáticos, Liga): botín garantizado de tramo superior.
    boss: { coins: [60, 120], coinChance: 1, chance: 1, rolls: 3, entries: [
      { item: 'ultra-ball', w: 14 }, { item: 'hyper-potion', w: 10 }, { item: 'max-potion', w: 4 }, { item: 'full-restore', w: 3 },
      { item: 'max-ether', w: 6 }, { item: 'max-elixir', w: 3 }, { item: 'max-revive', w: 4 }, { item: 'rare-candy', w: 8 },
      { item: 'leftovers', w: 2 }, { item: 'choiceband', w: 2 }, { item: 'choicescarf', w: 2 }, { item: 'lifeorb', w: 2 },
      { item: 'assaultvest', w: 2 }, { item: 'focussash', w: 2 }, { item: 'luckyegg', w: 2 }, { item: 'amuletcoin', w: 2 }
    ] }
  },

  // Extras por zona: se añaden a la tabla indicada (lo especial de cada sitio).
  ZONE_EXTRA: {
    kanto_05_mt_moon:       { rock: [{ item: 'moon-stone', w: 4 }], chest: [{ item: 'moon-stone', w: 6 }],
                               bigchest: [{ item: 'helix-fossil', w: 8 }, { item: 'dome-fossil', w: 8 }] },
    kanto_13_routes_7_8: { bigchest: [{ item: 'link-cable', w: 4 }] },
    kanto_20_power_plant: { chest: [{ item: 'thunder-stone', w: 5 }] },
    kanto_21_pokemon_mansion: { chest: [{ item: 'fire-stone', w: 5 }], bigchest: [{ item: 'old-amber', w: 4 }] },
    kanto_18_sea_routes: { chest: [{ item: 'water-stone', w: 5 }] },
    kanto_06_route4: { chest: [{ item: 'leaf-stone', w: 3 }] }
  }
};
