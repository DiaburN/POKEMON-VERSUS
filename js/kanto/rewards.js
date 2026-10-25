/* ============ rewards.js — lo que se gana en una zona (y cuándo se aplica) ============
 * Durante la zona NADA sube de nivel: todo se apunta en la sesión
 * (pendingXp, monedas e items sin guardar) y se aplica al salir, morir o
 * terminar, en la pantalla de resultados (regla 5-7 de la especificación).
 *
 * Excepción: una captura se guarda en el acto (captura protegida): nunca se
 * pierde, ni muriendo.
 *
 *   sesión = { zoneId, instId, xp, coins, items: { id: n }, kills, defeated: { dex: n },
 *              captures: [instId], failed: [dex], used: { id: n }, dropped, how }
 */
G.KRewards = (() => {
  const C = () => G.KCFG;
  const S = () => G.KSave;

  function newSession(zone, inst) {
    return { zoneId: zone.id, instId: inst.id, startLevel: inst.level, xp: 0, coins: 0, items: {}, kills: 0,
             defeated: {}, captures: [], failed: [], used: {}, dropped: null, how: null, t0: Date.now() };
  }

  function addItem(sess, id, n = 1) { if (G.KItems.BY[id] && n > 0) sess.items[id] = (sess.items[id] || 0) + n; }

  /**
   * Salvaje vencido: EXP (con la penalización por nivel), monedas siempre y
   * quizás un objeto, todo a la sesión. `mul`: { xp, coins } del objeto
   * equipado (Huevo Suerte, Moneda Amuleto). Devuelve { xp, coins, items }.
   */
  function onDefeat(sess, zone, w, activeLevel, rnd = Math.random, mul = {}) {
    const xp = Math.floor(G.KMon.xpYield(w.dex, w.level, !!w.boss) * G.KMon.overlevelMult(activeLevel, zone.recommendedLevel[1]) * (mul.xp || 1));
    const coins = Math.round(G.Loot.wildCoins(w.level, w.rarity, !!w.boss, rnd) * (mul.coins || 1));
    const drop = G.Loot.roll(w.boss ? 'boss' : 'wild', zone, rnd);
    sess.xp += xp;
    sess.coins += coins + drop.coins;
    for (const id of drop.items) addItem(sess, id);
    sess.kills++;
    sess.defeated[w.dex] = (sess.defeated[w.dex] || 0) + 1;
    S().seen(w.dex);
    return { xp, coins: coins + drop.coins, items: drop.items };
  }

  // ---------------- captura post-KO ----------------

  /** Probabilidad del único intento con esa Ball. */
  function captureChance(dex, ballId) {
    const ball = G.KItems.BY[ballId];
    if (!ball || ball.cat !== 'ball') return 0;
    if (ball.master) return 1;
    const n = G.U.clamp(G.GEN1.BY[dex].catchRate / 255, 0, 1);
    return 1 - Math.pow(1 - n, C().ONE_SHOT_CAPTURE_BOOST * ball.catch);
  }

  /**
   * El intento (uno solo) tras vencer a `w`. Sin Ball en el cinturón (o sin
   * existencias): null, no se intenta. Si no: gasta UNA Ball y tira una vez.
   * Devuelve { ball, chance, success, inst? }.
   */
  function tryCapture(sess, zone, w, rnd = Math.random) {
    const ball = S().belt('ball');
    if (!ball || S().count(ball) <= 0 || w.trainer) return null;
    S().take(ball, 1);
    sess.used[ball] = (sess.used[ball] || 0) + 1;
    const chance = captureChance(w.dex, ball);
    const success = rnd() < chance;
    const out = { ball, chance, success };
    if (success) {
      const inst = G.KMon.create({ dex: w.dex, level: w.level, shiny: !!w.shiny, zoneId: zone.id, from: 'capture' });
      S().addPokemon(inst);
      sess.captures.push(inst.id);
      out.inst = inst;
    } else sess.failed.push(w.dex);
    S().commit();
    return out;
  }

  // ---------------- muerte ----------------

  /**
   * Al caer: una parte (DEATH_LOOT_DROP_RATE) de lo ganado en la zona se
   * pierde. Nunca: Pokémon, capturas, el objeto equipado ni la EXP.
   */
  function deathDrop(sess, rnd = Math.random) {
    const k = C().DEATH_LOOT_DROP_RATE;
    const lost = { coins: Math.floor(sess.coins * k), items: {} };
    sess.coins -= lost.coins;
    for (const [id, n] of Object.entries(sess.items)) {
      let d = Math.floor(n * k);
      if (rnd() < n * k - d) d++;              // la parte fraccionaria, a suertes (1 Poción: 30 %)
      if (d > 0) { lost.items[id] = d; sess.items[id] -= d; if (!sess.items[id]) delete sess.items[id]; }
    }
    sess.dropped = lost;
    return lost;
  }

  // ---------------- al salir ----------------

  /**
   * Cierra la sesión: guarda monedas y objetos, aplica la EXP (por orden,
   * varios niveles si toca) y apunta las estadísticas de la zona.
   * @param how 'exit' | 'rope' | 'death' | 'quit' | 'league'
   * @returns resultados para la pantalla: { ..., events } (ver G.KMon.gainXp)
   */
  function finish(sess, how, rnd = Math.random) {
    if (sess.how) return sess.result;
    sess.how = how;
    if (how === 'death') deathDrop(sess, rnd);
    S().addCoins(sess.coins);
    for (const [id, n] of Object.entries(sess.items)) S().add(id, n);
    const inst = S().get(sess.instId);
    const before = inst ? { dex: inst.dex, level: inst.level, totalXp: inst.totalXp } : null;
    const events = inst ? G.KMon.gainXp(inst, sess.xp) : [];
    const zs = S().region().zoneStats;
    const st = zs[sess.zoneId] = zs[sess.zoneId] || { visits: 0, kills: 0, captures: 0, deaths: 0 };
    st.visits++; st.kills += sess.kills; st.captures += sess.captures.length;
    if (how === 'death') st.deaths++;
    S().commit();
    sess.result = { how, zoneId: sess.zoneId, instId: sess.instId, before, xp: sess.xp, coins: sess.coins, items: Object.assign({}, sess.items),
                    kills: sess.kills, defeated: Object.assign({}, sess.defeated), captures: sess.captures.slice(),
                    failed: sess.failed.slice(), used: Object.assign({}, sess.used), dropped: sess.dropped, events };
    return sess.result;
  }

  return { newSession, addItem, onDefeat, captureChance, tryCapture, deathDrop, finish };
})();
