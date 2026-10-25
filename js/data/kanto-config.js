/* ============ kanto-config.js — ajustes del modo Kanto (V1) ============
 * Todo lo que es BALANCE vive aquí, no en los sistemas: se puede reajustar sin
 * tocar código. Los datos canónicos (stats base, aprendizaje, evoluciones,
 * potencia/PP de los movimientos, ratios de captura) vienen de Gen I y están
 * en js/data/gen1-progression.js y gen1-moves-meta.js (generados).
 */
G.KCFG = {
  REGION: 'kanto',
  MAX_LEVEL: 100,
  MAX_MOVES: 4,

  // ---- stats (fórmula moderna, ver js/kanto/pokemon.js) ----
  IV_DEFAULT: 31,                 // iguales para todos en V1: dos Pokémon iguales sin entrenar son comparables
  NATURE_DEFAULT: 1.0,
  EV_MAX_STAT: 252,
  EV_MAX_TOTAL: 510,
  VITAMIN_EV: 10,                 // lo que sube cada vitamina (Más PS, Proteína...)
  // Speed (stat) -> px/s en el mundo: base + k·√speed, entre min y max.
  WORLD_SPEED: { base: 82, k: 4.4, min: 92, max: 168 },

  // ---- experiencia ----
  XP_DIVISOR: 7,                  // Gen I: exp. base × nivel del vencido / 7
  XP_MULT: 1,
  BOSS_XP_MULT: 1.5,              // líderes, Liga y estáticos (como los entrenadores de Gen I)
  // Pokémon activo por encima del máximo recomendado de la zona.
  XP_OVERLEVEL: [
    { above: 0, k: 1 },           // dentro del rango (o por debajo): 100 %
    { above: 5, k: 0.5 },         // 1-5 niveles por encima
    { above: 10, k: 0.25 },       // 6-10
    { above: Infinity, k: 0.1 }   // más de 10
  ],

  // ---- movimientos ----
  PP_RUNTIME_MULTIPLIER: 3,
  // Recarga según la potencia: base + potencia / div, entre min y max (s).
  COOLDOWN: { base: 0.42, div: 115, min: 0.45, max: 2.2, status: 1.6 },
  // Parte de la potencia que hace cada golpe según la forma del ataque: los que
  // lanzan muchos proyectiles o golpean varias veces reparten el daño.
  KIND_HIT_SHARE: { projectile: 1, homing: 1, bounce: 0.8, melee: 1, beam: 1, charge: 1.15, dash: 1, chain: 0.85,
                    cone: 0.3, nova: 0.45, aura: 0.6, boomerang: 0.6, meteor: 0.7, quake: 0.45, spin: 0.4,
                    vortex: 0.35, shove: 0.8, stun: 0.7 },
  // Formas que NO se usan aquí (se quedan puestas o duran toda la run en PokéSurvivor).
  KIND_BLOCKED: ['orbit', 'trail', 'turret', 'mine'],

  // ---- daño (ver js/kanto/damage.js) ----
  REALTIME_DAMAGE_SCALE: 1.6,
  STAB: 1.5,
  CRIT_CHANCE: 1 / 16,
  CRIT_MULT: 1.5,
  WILD_CONTACT_POWER: 14,         // tocar a un salvaje enfadado
  // Los salvajes pegan algo menos que tú con el mismo ataque: en tiempo real
  // atacan sin esperar turno y tú tienes que acercarte y apuntar.
  WILD_DAMAGE_MULT: 0.45,
  OUT_OF_COMBAT_REGEN: 0.02,      // × vida máxima por segundo, tras COMBAT_STATE_TIMEOUT sin pelear

  // ---- salvajes ----
  WILD: {
    aggroRadius: 150,             // se enfadan si te acercas tanto
    callRadius: 160,              // y avisan a los de su especie cercanos
    leashRadius: 460,             // no te persiguen más lejos de su zona
    calmAfter: 6,                 // s sin verte para volver a pasear
    moveCdMul: 2.2,               // atacan más despacio que tú
    windup: 0.45,                 // aviso antes de cada ataque
    wanderSpeed: 0.45             // × su velocidad al pasear
  },
  RESPAWN: {                      // s, por rareza
    common: [8, 15], uncommon: [15, 30], rare: [30, 60], very_rare: [60, 180]
  },
  RARITY_WEIGHT: { common: 100, uncommon: 45, rare: 14, very_rare: 4 },
  MAX_ALIVE_DEFAULT: 7,
  SPAWN_MIN_DIST: 220,            // nunca encima del jugador
  STATIC_BOSS_COOLDOWN_H: 20,     // horas hasta poder repetir un estático (legendario) tras vencerlo o fallarlo

  // ---- monedas y botín (ver js/data/loot-tables.js) ----
  COINS: { base: 3, perLevel: 0.9, rarity: { common: 1, uncommon: 1.35, rare: 2, very_rare: 3, boss: 8 } },

  // ---- captura ----
  ONE_SHOT_CAPTURE_BOOST: 3.0,
  CAPTURE_ANIM: 1.1,              // s de la animación de la Ball

  // ---- objetos ----
  ITEM_SHARED_CD: 3,
  REVIVE_WINDOW: 6,               // s para usar Revivir tras caer
  COMBAT_STATE_TIMEOUT: 10,
  ESCAPE_CHANNEL: 3,

  // ---- muerte ----
  DEATH_LOOT_DROP_RATE: 0.30,

  // ---- economía ----
  START_POKECOINS: 3000,
  START_BAG: { 'poke-ball': 5, potion: 3 },
  STARTERS: [1, 4, 7],
  // Rival de la Liga: variante de su equipo según tu inicial (orden de parties.asm).
  CHAMPION_VARIANT: { 4: 0, 7: 1, 1: 2 },
  FOSSIL_LEVEL: 30,
  FOSSIL_LAB_ZONE: 'kanto_15_cinnabar',      // donde se revive un fósil (hay que haberla descubierto)
  GIFT_LEVEL_DEFAULT: 25,

  // ---- adquisiciones especiales (apéndice B de la especificación) ----
  // Regalos: se reciben en la ficha de la zona tras vencer `needKills` salvajes allí.
  // `choice`: eliges uno; `after`: sólo cuando ya tienes ese regalo (el segundo del Dojo).
  GIFTS: [
    { id: 'celadon-eevee', zoneId: 'kanto_09_celadon_saffron', dex: [133], level: 25, needKills: 15 },
    { id: 'dojo-1', zoneId: 'kanto_09_celadon_saffron', dex: [106, 107], choice: true, level: 30, needKills: 40 },
    { id: 'dojo-2', zoneId: 'kanto_09_celadon_saffron', dex: [106, 107], choice: true, other: 'dojo-1', level: 30, needKills: 150, after: 'dojo-1' },
    { id: 'porygon', zoneId: 'kanto_12_power_plant', dex: [137], level: 26, needKills: 25 }
  ],
  // Estáticos que no están en KANTO_ZONES_V1.json como staticBoss (eventos).
  EXTRA_STATICS: { kanto_10_fuchsia_routes: [{ dex: 143, level: 30, respawnClass: 'event' }] },
  // Nunca salen como salvajes normales (sólo estáticos o eventos).
  NEVER_WILD: [144, 145, 146, 150, 151],

  // ---- Liga (zona sin salvajes: equipos de Alto Mando y Campeón de Gen I, js/data/gen1-progression.js) ----
  LEAGUE: { zoneId: 'kanto_18_indigo_league', order: ['lorelei', 'bruno', 'agatha', 'lance', 'champion'],
            names: { lorelei: 'Lorelei', bruno: 'Bruno', agatha: 'Agatha', lance: 'Lance', champion: 'Campeón' },
            pause: 4, healBetween: 0.25 }
};
