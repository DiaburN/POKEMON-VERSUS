/* ============ pokemon.js — Pokémon individuales del modo Kanto ============
 * Cada Pokémon capturado es una INSTANCIA propia (puede haber varios de la
 * misma especie, cada uno con su nivel, movimientos y entrenamiento):
 *
 *   { id, dex, regionId, shiny, level, totalXp,
 *     moves: [{ id, currentPP, runtimeMaxPP }],      // como mucho 4
 *     training: { hp, attack, defense, specialAttack, specialDefense, speed },
 *     heldItemId, caught: { zoneId, level, timestamp } }
 *
 * Todo sale de los datos de Gen I (G.GEN1): stats base, curva de experiencia,
 * movimientos por nivel y evoluciones. Nada de código por especie.
 *
 * Los stats se calculan SIEMPRE desde base + nivel + entrenamiento (nunca se
 * guardan): fórmula moderna con IV fijo y naturaleza neutra en V1.
 */
G.KMon = (() => {
  const C = () => G.KCFG;
  const STATS = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'];
  const species = dex => G.GEN1.BY[dex];
  const growth = dex => G.GEN1.growth[species(dex).growthRate];

  // ---------------- experiencia ----------------

  /** EXP total para estar en `level`. */
  function expAt(dex, level) { return growth(dex)[G.U.clamp(level, 1, C().MAX_LEVEL)]; }

  /** Nivel que corresponde a una EXP total. */
  function levelForXp(dex, xp) {
    const t = growth(dex);
    let lv = 1;
    while (lv < C().MAX_LEVEL && xp >= t[lv + 1]) lv++;
    return lv;
  }

  /** EXP que da vencer a `dex` de nivel `level` (Gen I: exp. base × nivel / 7). */
  function xpYield(dex, level, boss = false) {
    return Math.max(1, Math.floor(species(dex).baseExp * level / C().XP_DIVISOR * C().XP_MULT * (boss ? C().BOSS_XP_MULT : 1)));
  }

  /** × a la EXP según lo que pasa tu Pokémon ACTIVO del máximo recomendado de la zona. */
  function overlevelMult(activeLevel, zoneMax) {
    const over = activeLevel - zoneMax;
    if (over <= 0) return 1;
    for (const r of C().XP_OVERLEVEL) if (over <= r.above) return r.k;
    return C().XP_OVERLEVEL[C().XP_OVERLEVEL.length - 1].k;
  }

  // ---------------- stats ----------------

  function calcStat(stat, base, level, iv = C().IV_DEFAULT, ev = 0, nature = C().NATURE_DEFAULT) {
    const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100);
    if (stat === 'hp') return core + level + 10;
    return Math.floor((core + 5) * nature);
  }

  /** Los seis stats de una instancia (o de { dex, level, training }). */
  function calcStats(inst) {
    const b = species(inst.dex).baseStats, tr = inst.training || {}, out = {};
    for (const s of STATS) out[s] = calcStat(s, b[s], inst.level, C().IV_DEFAULT, tr[s] || 0);
    return out;
  }

  /** Speed del Pokémon -> velocidad en el mundo (px/s), suave y con topes. */
  function pokemonSpeedToWorldSpeed(stat) {
    const w = C().WORLD_SPEED;
    return G.U.clamp(w.base + w.k * Math.sqrt(Math.max(0, stat)), w.min, w.max);
  }

  // ---------------- movimientos ----------------

  /** Todo lo que aprende hasta `level` (iniciales + por nivel), en orden y sin repetir. */
  function learnedUpTo(dex, level) {
    const sp = species(dex), out = [];
    for (const id of sp.initialMoves) if (!out.includes(id)) out.push(id);
    for (const l of sp.learnset) if (l.level <= level && !out.includes(l.move)) out.push(l.move);
    return out;
  }

  /** Los 4 más recientes que habría aprendido a ese nivel (salvajes y capturas). */
  function movesAtLevel(dex, level) { return learnedUpTo(dex, level).slice(-C().MAX_MOVES); }

  /** Los que aprende justo al llegar a `level`. */
  function learnsAt(dex, level) { return species(dex).learnset.filter(l => l.level === level).map(l => l.move); }

  /** Próximo movimiento por nivel: { level, move } o null. */
  function nextMove(dex, level) { return species(dex).learnset.find(l => l.level > level) || null; }

  function moveSlot(id) {
    const max = G.GEN1_MOVES.BY[id].pp * C().PP_RUNTIME_MULTIPLIER;
    return { id, currentPP: max, runtimeMaxPP: max };
  }

  function knows(inst, id) { return inst.moves.some(m => m.id === id); }

  /**
   * Aprende `id`: si hay hueco, sin más; si no, olvidando el de `forget`
   * (índice). forget = null -> no lo aprende. Devuelve true si lo aprendió.
   */
  function learn(inst, id, forget = undefined) {
    if (!G.GEN1_MOVES.BY[id] || knows(inst, id)) return false;
    if (inst.moves.length < C().MAX_MOVES) { inst.moves.push(moveSlot(id)); return true; }
    if (forget == null || !inst.moves[forget]) return false;
    inst.moves[forget] = moveSlot(id);
    return true;
  }

  // ---------------- evolución ----------------

  function evolutions(dex) { return species(dex).evolution || []; }

  /** Especie a la que evoluciona por nivel al estar en `level`, o null. */
  function levelEvolution(dex, level) {
    const e = evolutions(dex).find(x => x.method === 'level' && level >= x.level);
    return e ? e.to : null;
  }
  function stoneEvolution(dex, item) {
    const e = evolutions(dex).find(x => x.method === 'item' && x.item === item);
    return e ? e.to : null;
  }
  function tradeEvolution(dex) {
    const e = evolutions(dex).find(x => x.method === 'trade');
    return e ? e.to : null;
  }
  /** Lo próximo que hace para evolucionar (para la ficha): [{ method, level?, item?, to }] */
  function nextEvolutions(dex) { return evolutions(dex); }

  /**
   * Evoluciona: cambia la especie y conserva todo lo demás (nivel, EXP,
   * movimientos, entrenamiento, objeto). Devuelve los PS nuevos si se pasa
   * la fracción de vida que tenía (se mantiene el porcentaje).
   */
  function evolve(inst, to, hpFrac = null) {
    if (!species(to)) return null;
    inst.dex = to;
    if (hpFrac == null) return null;
    return Math.max(1, Math.round(calcStats(inst).hp * hpFrac));
  }

  // ---------------- crear ----------------

  function uid() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** Instancia nueva con los movimientos y la EXP de su nivel. */
  function create({ dex, level = 5, shiny = false, zoneId = null, from = 'wild' }) {
    level = G.U.clamp(level | 0, 1, C().MAX_LEVEL);
    return {
      id: uid(), dex, regionId: C().REGION, shiny: !!shiny, level, totalXp: expAt(dex, level),
      moves: movesAtLevel(dex, level).map(moveSlot),
      training: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
      heldItemId: null,
      caught: { zoneId, level, timestamp: Date.now(), from }
    };
  }

  // ---------------- entrenamiento ----------------

  function trainingTotal(inst) { return STATS.reduce((a, s) => a + (inst.training[s] || 0), 0); }

  /** Suma entrenamiento a un stat respetando los topes. Devuelve lo que se ha sumado. */
  function addTraining(inst, stat, amount) {
    if (!STATS.includes(stat)) return 0;
    const room = Math.min(C().EV_MAX_STAT - (inst.training[stat] || 0), C().EV_MAX_TOTAL - trainingTotal(inst));
    const add = Math.max(0, Math.min(amount, room));
    inst.training[stat] = (inst.training[stat] || 0) + add;
    return add;
  }

  // ---------------- subir de nivel (después de la zona) ----------------

  /**
   * Suma EXP y procesa EN ORDEN cada nivel que suba: stats, movimientos de
   * ese nivel y evolución por nivel. No pregunta nada: lo que necesita una
   * decisión (aprender con 4 movimientos) sale como evento 'learnChoice' y la
   * resuelve la interfaz con learn(). Devuelve la lista de eventos:
   *   { type: 'level', level, before: stats, after: stats }
   *   { type: 'learn', move }                  aprendido (había hueco)
   *   { type: 'learnChoice', move }            hay que elegir cuál olvidar
   *   { type: 'evolve', from, to, level }
   */
  function gainXp(inst, xp) {
    const events = [];
    if (!(xp > 0)) return events;
    inst.totalXp = Math.min(inst.totalXp + Math.floor(xp), expAt(inst.dex, C().MAX_LEVEL));
    while (inst.level < C().MAX_LEVEL && inst.totalXp >= expAt(inst.dex, inst.level + 1)) {
      levelUp(inst, events);
    }
    return events;
  }

  /** Un nivel (también el Caramelo Raro). */
  function levelUp(inst, events = []) {
    if (inst.level >= C().MAX_LEVEL) return events;
    const before = calcStats(inst);
    inst.level++;
    inst.totalXp = Math.max(inst.totalXp, expAt(inst.dex, inst.level));
    events.push({ type: 'level', level: inst.level, before, after: calcStats(inst) });
    for (const id of learnsAt(inst.dex, inst.level)) {
      if (knows(inst, id)) continue;
      if (inst.moves.length < C().MAX_MOVES) { learn(inst, id); events.push({ type: 'learn', move: id }); }
      else events.push({ type: 'learnChoice', move: id });
    }
    const to = levelEvolution(inst.dex, inst.level);
    if (to) {
      const from = inst.dex;
      evolve(inst, to);
      events.push({ type: 'evolve', from, to, level: inst.level });
      // Gen I: lo que la forma nueva aprende a este mismo nivel también.
      for (const id of learnsAt(to, inst.level)) {
        if (knows(inst, id)) continue;
        if (inst.moves.length < C().MAX_MOVES) { learn(inst, id); events.push({ type: 'learn', move: id }); }
        else events.push({ type: 'learnChoice', move: id });
      }
    }
    return events;
  }

  /** Progreso al siguiente nivel: { into, need, frac } */
  function xpProgress(inst) {
    if (inst.level >= C().MAX_LEVEL) return { into: 0, need: 0, frac: 1 };
    const a = expAt(inst.dex, inst.level), b = expAt(inst.dex, inst.level + 1);
    return { into: inst.totalXp - a, need: b - a, frac: G.U.clamp((inst.totalXp - a) / Math.max(1, b - a), 0, 1) };
  }

  return { STATS, species, expAt, levelForXp, xpYield, overlevelMult, calcStat, calcStats, pokemonSpeedToWorldSpeed,
           learnedUpTo, movesAtLevel, learnsAt, nextMove, moveSlot, knows, learn,
           levelEvolution, stoneEvolution, tradeEvolution, nextEvolutions, evolve,
           create, trainingTotal, addTraining, gainXp, levelUp, xpProgress };
})();
