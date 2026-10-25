/* ============ moves.js (Kanto) — movimientos de Gen I en tiempo real ============
 * Los datos canónicos (tipo, potencia, precisión, PP, efecto) vienen de
 * G.GEN1_MOVES; aquí se les da forma de ataque en tiempo real (`kind` de
 * systems/combat.js) sin crear una copia por Pokémon:
 *
 *   - Si PokéSurvivor ya tiene ese movimiento (mismo id) con una forma que
 *     sirve aquí, se usan su forma y su VFX.
 *   - Si no, una forma genérica que funciona (placeholder): los físicos,
 *     golpe en arco; los especiales, proyectil del color de su tipo; los de
 *     estado, potenciador / debilitador / aturdimiento según su efecto.
 *     El jugador no ve la diferencia (placeholder sólo es un dato).
 *
 * El daño NO es el `dmg` de PokéSurvivor: es la potencia canónica (por la
 * parte que toca a cada golpe de esa forma, G.KCFG.KIND_HIT_SHARE) y lo
 * termina js/kanto/damage.js con el ataque y la defensa de cada uno.
 */
G.KMoves = (() => {
  const C = () => G.KCFG;
  const cache = {};

  // Golpes de potencia "rara" en Gen I (daño fijo, KO directo...): una potencia
  // equivalente para el tiempo real. La canónica se guarda igual.
  const FIXED_POWER = { SPECIAL_DAMAGE_EFFECT: 40, OHKO_EFFECT: 110, SUPER_FANG_EFFECT: 60, BIDE_EFFECT: 50 };

  // Efectos de estado -> lo que hacen aquí.
  const BUFF = {
    ATTACK_UP1_EFFECT: ['patk', 1], ATTACK_UP2_EFFECT: ['patk', 2], DEFENSE_UP1_EFFECT: ['def', 1], DEFENSE_UP2_EFFECT: ['def', 2],
    SPEED_UP2_EFFECT: ['spd', 2], SPECIAL_UP1_EFFECT: ['satk', 1], SPECIAL_UP2_EFFECT: ['satk', 2], EVASION_UP1_EFFECT: ['spd', 1],
    LIGHT_SCREEN_EFFECT: ['def', 2], REFLECT_EFFECT: ['def', 2], SUBSTITUTE_EFFECT: ['def', 2], MIST_EFFECT: ['def', 1],
    FOCUS_ENERGY_EFFECT: ['patk', 1], RAGE_EFFECT: ['patk', 1]
  };
  const BUFF_AMOUNT = { patk: 0.12, satk: 0.12, def: 0.08, spd: 0.1 };
  const DEBUFF = new Set(['ATTACK_DOWN1_EFFECT', 'DEFENSE_DOWN1_EFFECT', 'DEFENSE_DOWN2_EFFECT', 'SPEED_DOWN1_EFFECT',
                          'ACCURACY_DOWN1_EFFECT', 'HAZE_EFFECT', 'DISABLE_EFFECT']);
  const STUN = { SLEEP_EFFECT: 2.6, PARALYZE_EFFECT: 1.6, CONFUSION_EFFECT: 1.2 };
  // Efectos secundarios de los que hacen daño.
  const SIDE = {
    BURN_SIDE_EFFECT1: { burn: 1 }, BURN_SIDE_EFFECT2: { burn: 2 },
    POISON_SIDE_EFFECT1: { poison: 1 }, POISON_SIDE_EFFECT2: { poison: 2 }, TWINEEDLE_EFFECT: { poison: 1 },
    PARALYZE_SIDE_EFFECT1: { slow: 0.25 }, PARALYZE_SIDE_EFFECT2: { slow: 0.4 }, FREEZE_SIDE_EFFECT1: { slow: 0.45 },
    SPEED_DOWN_SIDE_EFFECT: { slow: 0.3 }, ATTACK_DOWN_SIDE_EFFECT: { slow: 0.15 }, DEFENSE_DOWN_SIDE_EFFECT: { slow: 0.15 },
    SPECIAL_DOWN_SIDE_EFFECT: { slow: 0.15 }, CONFUSION_SIDE_EFFECT: { slow: 0.2 },
    FLINCH_SIDE_EFFECT1: { knock: 90 }, FLINCH_SIDE_EFFECT2: { knock: 120 }
  };
  const HITS = { TWO_TO_FIVE_ATTACKS_EFFECT: 3, ATTACK_TWICE_EFFECT: 2, TWINEEDLE_EFFECT: 2 };

  /** Forma genérica de un movimiento (cuando PokéSurvivor no tiene uno igual). */
  function placeholderShape(meta) {
    const e = meta.effect;
    if (meta.category === 'status') {
      if (BUFF[e]) return { kind: 'buff', stat: BUFF[e][0], amount: BUFF_AMOUNT[BUFF[e][0]] * BUFF[e][1], dur: 8, stacks: 4 };
      if (e === 'HEAL_EFFECT') return { kind: 'buff', stat: null, heal: 0.5 };
      if (STUN[e]) return { kind: 'stun', radius: 46, stun: STUN[e] };
      if (e === 'POISON_EFFECT' || e === 'LEECH_SEED_EFFECT') return { kind: 'shove', radius: 70, poison: 2, knock: 0 };
      if (DEBUFF.has(e)) return { kind: 'shove', radius: 80, slow: 0.35, knock: 40 };
      if (e === 'SWITCH_AND_TELEPORT_EFFECT') return { kind: 'shove', radius: 90, knock: 320 };
      return { kind: 'buff', stat: null };      // Salpicadura, Metrónomo, Transformación...: sólo se ve
    }
    if (e === 'CHARGE_EFFECT' || e === 'HYPER_BEAM_EFFECT' || e === 'FLY_EFFECT') return { kind: 'charge', radius: 230, width: 28, charge: 0.7 };
    if (e === 'EXPLODE_EFFECT') return { kind: 'shove', radius: 110, knock: 260 };
    const hits = HITS[e] || 1;
    if (meta.category === 'physical') return { kind: 'melee', radius: 58, arc: 1.7, knock: 60, hits };
    return { kind: 'projectile', speed: 330, count: hits, spread: hits > 1 ? 0.18 : 0.1, pierce: 0, life: 1.5, size: 7 };
  }

  /** Definición en tiempo real de un movimiento (una por id, compartida). */
  function def(id) {
    if (cache[id]) return cache[id];
    const meta = G.GEN1_MOVES.BY[id];
    if (!meta) return null;
    const sv = G.Moves && G.Moves.BY_ID[id];
    const reuse = sv && !C().KIND_BLOCKED.includes(sv.kind) && (meta.category === 'status') === (sv.kind === 'buff' || !(sv.dmg > 0));
    let shape;
    if (reuse) {
      shape = Object.assign({}, sv);
      for (const k of ['def', 'ups', 'maxLvl', 'dmg', 'cd', 'cat', 'name', 'desc', 'type', 'evo']) delete shape[k];
    } else shape = placeholderShape(meta);
    const power = meta.power > 1 ? meta.power : meta.power === 1 ? FIXED_POWER[meta.effect] || 40 : 0;
    const share = C().KIND_HIT_SHARE[shape.kind] || 1;
    const cfg = C().COOLDOWN;
    const d = Object.assign({}, shape, SIDE[meta.effect] || {}, {
      id, name: meta.name, type: meta.type, cat: meta.category === 'status' ? null : meta.category,
      canonicalPower: meta.power, canonicalPP: meta.pp, canonicalAccuracy: meta.accuracy, effect: meta.effect,
      realtimePower: power,
      // (Varios golpes: el proyectil lanza `count`; el golpe en arco suma los golpes en uno.)
      dmg: power * share * (shape.kind === 'melee' ? shape.hits || 1 : 1),
      cd: meta.category === 'status' ? cfg.status : G.U.clamp(cfg.base + power / cfg.div, cfg.min, cfg.max),
      drain: meta.effect === 'DRAIN_HP_EFFECT' || meta.effect === 'DREAM_EATER_EFFECT' ? 0.5 : 0,
      placeholder: !reuse
    });
    // Proyectiles que necesitan número y abanico (como en data/moves.js).
    if (['projectile', 'homing', 'bounce'].includes(d.kind)) {
      if (d.count == null) d.count = 1;
      if (d.spread == null) d.spread = 0.12;
      if (d.speed == null) d.speed = 330;
      if (d.life == null) d.life = 1.5;
      if (d.size == null) d.size = 7;
    }
    delete d.hits;
    cache[id] = d;
    return d;
  }

  /** Movimiento listo para combat.js: la definición + su recarga y sus PP (los de la instancia). */
  function instance(slot) {
    const d = def(slot.id);
    return Object.assign({}, d, { def: d, lvl: 1, t: 0, slot });
  }

  /** Canonical + runtime PP de un hueco (para la interfaz). */
  function ppText(slot) { return slot.currentPP + '/' + slot.runtimeMaxPP; }

  /** ¿Cuántos movimientos usan forma genérica? (lista para el informe). */
  function placeholders() { return G.GEN1_MOVES.filter(m => def(m.id).placeholder).map(m => m.id); }

  return { def, instance, ppText, placeholders, meta: id => G.GEN1_MOVES.BY[id] };
})();
