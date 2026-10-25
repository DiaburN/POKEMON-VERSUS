/* ============ use.js — usar objetos del modo Kanto ============
 * Los números de cada objeto están en js/data/kanto-items.js; aquí sólo qué
 * hacen. Todo gasta existencias reales de la bolsa (G.KSave), nunca baja de 0.
 *
 * En la zona (cinturón): inZone(). Un solo tiempo de espera compartido entre
 * objetos (G.KCFG.ITEM_SHARED_CD): nada de beberse tres pociones a la vez.
 * Fuera (menú Pokémon): onPokemon() para piedras, vitaminas, Caramelo Raro,
 * Cable Conector, Éteres y objetos equipables.
 *
 * Cada uno devuelve { ok, msg, ... }; msg es para la interfaz.
 */
G.KUse = (() => {
  const C = () => G.KCFG;
  const S = () => G.KSave;
  const I = id => G.KItems.BY[id];

  /** Cuántos PP de verdad devuelve (los PP de Gen I × el multiplicador de tiempo real). */
  const ppAmount = it => it.pp * C().PP_RUNTIME_MULTIPLIER;

  function ppRoom(slots, all, idx) {
    const list = all ? slots : [slots[idx]].filter(Boolean);
    return list.reduce((s, m) => s + (m.runtimeMaxPP - m.currentPP), 0);
  }
  function restorePP(slots, it, idx) {
    const list = it.all ? slots : [slots[idx]].filter(Boolean);
    let got = 0;
    for (const m of list) {
      const add = it.full ? m.runtimeMaxPP - m.currentPP : Math.min(ppAmount(it), m.runtimeMaxPP - m.currentPP);
      m.currentPP += add; got += add;
    }
    return got;
  }

  /**
   * Usar el objeto del hueco `slot` del cinturón en la zona.
   * @param pl  el Pokémon activo (G.KantoPlayer o algo con hp, maxHp, dead, inst, active, itemCd)
   * @param ctx { boss: hay un jefe/estático peleando, sess }
   */
  function inZone(slot, pl, ctx = {}) {
    const id = S().belt(slot);
    const it = id && I(id);
    if (!it) return { ok: false, msg: 'Hueco vacío' };
    if (S().count(id) <= 0) return { ok: false, msg: '¡No te quedan!' };
    if ((pl.itemCd || 0) > 0) return { ok: false, msg: 'Espera un momento', cd: true };
    let msg = it.name;
    if (it.cat === 'heal') {
      if (pl.dead) return { ok: false, msg: 'Está debilitado' };
      const hurtNow = pl.hp < pl.maxHp, cure = it.cure && pl.slowT > 0;
      if (!hurtNow && !cure) return { ok: false, msg: 'Ya tiene la vida llena' };
      if (it.full) pl.heal(pl.maxHp); else pl.heal(it.hp);
      if (it.cure) pl.slowT = 0;
    } else if (it.cat === 'pp') {
      if (pl.dead) return { ok: false, msg: 'Está debilitado' };
      if (ppRoom(pl.inst.moves, it.all, pl.active) <= 0) return { ok: false, msg: 'PP llenos' };
      msg += ' +' + restorePP(pl.inst.moves, it, pl.active) + ' PP';
    } else if (it.cat === 'revive') {
      if (!pl.dead) return { ok: false, msg: 'Sólo tras caer' };
      pl.revive(it.frac);
    } else if (it.cat === 'utility' && it.escape) {
      // No se gasta aún: se gasta al terminar de canalizar (js/kanto/zone.js).
      if (ctx.boss) return { ok: false, msg: 'No funciona contra un jefe' };
      if (pl.inCombat) return { ok: false, msg: 'No en pleno combate' };
      return { ok: true, channel: true, id, msg: it.name };
    } else if (it.cat === 'ball') {
      return { ok: false, msg: 'Se usa sola al vencer a un salvaje' };
    } else return { ok: false, msg: 'Aquí no se puede usar' };
    consume(id, ctx.sess);
    pl.itemCd = C().ITEM_SHARED_CD;
    return { ok: true, id, msg };
  }

  function consume(id, sess) {
    if (!S().take(id, 1)) return false;
    if (sess) sess.used[id] = (sess.used[id] || 0) + 1;
    return true;
  }

  /**
   * Fuera de la zona, sobre un Pokémon (menú Pokémon).
   * @returns { ok, msg, events? (como G.KMon.gainXp), evolved? }
   */
  function onPokemon(id, inst, moveIdx = 0) {
    const it = I(id);
    if (!it || S().count(id) <= 0) return { ok: false, msg: 'No tienes' };
    if (it.cat === 'stone') {
      const to = G.KMon.stoneEvolution(inst.dex, id);
      if (!to) return { ok: false, msg: 'No tiene efecto' };
      const from = inst.dex;
      G.KMon.evolve(inst, to);
      S().take(id, 1);
      return { ok: true, msg: '¡Evoluciona!', events: [{ type: 'evolve', from, to, level: inst.level }] };
    }
    if (it.cat === 'link') {
      const to = G.KMon.tradeEvolution(inst.dex);
      if (!to) return { ok: false, msg: 'No tiene efecto' };
      const from = inst.dex;
      G.KMon.evolve(inst, to);
      S().take(id, 1);
      return { ok: true, msg: '¡Evoluciona!', events: [{ type: 'evolve', from, to, level: inst.level }] };
    }
    if (it.cat === 'candy') {
      if (inst.level >= C().MAX_LEVEL) return { ok: false, msg: 'Ya está al nivel máximo' };
      S().take(id, 1);
      return { ok: true, msg: '¡Sube de nivel!', events: G.KMon.levelUp(inst, []) };
    }
    if (it.cat === 'vitamin') {
      const got = G.KMon.addTraining(inst, it.stat, C().VITAMIN_EV);
      if (got <= 0) return { ok: false, msg: 'No tiene efecto' };
      S().take(id, 1);
      return { ok: true, msg: '+' + got + ' de entrenamiento' };
    }
    if (it.cat === 'pp') {
      if (ppRoom(inst.moves, it.all, moveIdx) <= 0) return { ok: false, msg: 'PP llenos' };
      const got = restorePP(inst.moves, it, moveIdx);
      S().take(id, 1);
      return { ok: true, msg: '+' + got + ' PP' };
    }
    if (it.cat === 'held') {
      if (inst.heldItemId === id) return { ok: false, msg: 'Ya lo lleva' };
      S().take(id, 1);
      if (inst.heldItemId) S().add(inst.heldItemId, 1);
      inst.heldItemId = id;
      return { ok: true, msg: 'Lleva ' + it.name };
    }
    return { ok: false, msg: 'Aquí no se puede usar' };
  }

  /** Quitarle el objeto equipado (vuelve a la bolsa). */
  function unequip(inst) {
    if (!inst.heldItemId) return false;
    S().add(inst.heldItemId, 1);
    inst.heldItemId = null;
    return true;
  }

  /** Revivir un fósil (en el laboratorio de Cinnabar). Devuelve la instancia nueva. */
  function reviveFossil(id) {
    const it = I(id);
    if (!it || it.cat !== 'fossil' || S().count(id) <= 0) return null;
    if (!S().discovered(C().FOSSIL_LAB_ZONE)) return null;
    S().take(id, 1);
    return S().addPokemon(G.KMon.create({ dex: it.revives, level: C().FOSSIL_LEVEL, zoneId: C().FOSSIL_LAB_ZONE, from: 'fossil' }));
  }

  /** Centro Pokémon: PP al máximo de todos (gratis). */
  function heal() {
    for (const p of S().list()) for (const m of p.moves) m.currentPP = m.runtimeMaxPP;
  }

  /** Poké Mart. */
  function buy(id, n = 1) {
    const it = I(id);
    if (!it || !it.price || it.cat === 'ball' && it.master) return { ok: false, msg: 'No está a la venta' };
    if (!S().spend(it.price * n)) return { ok: false, msg: 'No tienes bastantes Pokémonedas' };
    S().add(id, n);
    return { ok: true, msg: it.name + ' ×' + n };
  }

  return { inZone, onPokemon, unequip, reviveFossil, heal, buy, consume, ppAmount };
})();
