/* ============ zone.js — una salida al mundo abierto de Kanto (en tiempo real) ============
 * El mundo es uno solo y continuo (js/kanto/worldgen.js): se empieza en un
 * checkpoint ya visitado y se anda hacia el norte (o se vuelve al sur) sin
 * cargas. Lo que pasa mientras juegas:
 *   - el tramo en el que estás decide la paleta (con fundido), la música,
 *     el nivel recomendado y la fauna
 *   - salvajes por densidad: se mantiene la de tu tramo en la ventana de
 *     pantalla y media a tu alrededor; salen fuera de la vista y los lejanos
 *     que no te persiguen se van. Junto a una frontera se mezclan los dos tramos
 *   - checkpoints: claro seguro con manantial al empezar cada tramo. Al
 *     llegar a uno queda visitado (se podrá empezar ahí) y es tu último checkpoint
 *   - jefes (legendarios, Snorlax, Gengar) en su sitio fijo; la Liga en su plaza
 *   - al vencer: EXP pendiente, monedas, botín y el único intento de captura
 *   - salida: quedarse un momento en la marca SALIR de un checkpoint,
 *     Cuerda Huida (canalizada), o caer
 *
 * Al terminar G.Game.endKanto() cierra la sesión (G.KRewards.finish) y
 * enseña los resultados. Nada de esto sube niveles hasta entonces.
 */
G.KZone = (() => {
  const C = () => G.KCFG;
  const S = () => G.KSave;
  const KW = () => G.KWorld;
  const TS = () => G.World.TS;
  const EXIT_HOLD = 1.1, EXIT_R = 1.5;
  const SPAWN_EVERY = 0.25;                 // s entre intentos de aparición
  // Música de PokéSurvivor según el tema del tramo.
  const MUSIC = { rock: 'cave', ground: 'cave', ghost: 'cave', psychic: 'cave', electric: 'cave', ice: 'cave', crystal: 'cave',
                  dark: 'cave', judgment: 'cave', dragon: 'cave', steel: 'cave', fire: 'volcano', ash: 'volcano', poison: 'volcano' };

  let zone = null, sess = null, pl = null;
  let statics = [], spawned = new Set(), league = null;
  let exitT = 0, exitAt = null, rope = null, downT = 0, endT = -1, endHow = null;
  let catches = [];               // animaciones de captura { x, y, t, ok, dex }
  let clock = 0, spawnT = 0;

  const rnd = () => Math.random();

  // ---------------- empezar ----------------

  /** Prepara el mundo y devuelve el jugador (lo usa G.Game.startKanto). */
  function begin(zoneId, inst) {
    KW().build({ leagueOpen: !!S().region().leagueCleared });
    G.World.setGen({ terrain: KW().terrain, props: KW().props }, KW().SEED);
    G.World.setPropHook(onProp);
    const start = G.KZones.get(zoneId) && KW().checkpointOf(zoneId) ? zoneId : G.KZones.all()[0].id;
    zone = G.KZones.get(start);
    G.World.setBiome(G.KZones.paletteOf(zone.theme), true);
    sess = G.KRewards.newSession(zone, inst);
    pl = new G.KantoPlayer(inst);
    const cp = KW().checkpointOf(start), p = KW().center(cp.tx, cp.ty);
    pl.x = p.x; pl.y = p.y;
    pl.itemCd = 0;
    statics = []; spawned = new Set(); league = null;
    exitT = 0; exitAt = null; rope = null; downT = 0; endT = -1; endHow = null; catches = []; clock = 0; spawnT = 0;
    reach(cp);
    for (let i = 0; i < 40 && wildsNear() < target(); i++) spawnOne();
    G.Spawner.say('— ' + zone.name + ' —', 3, true);
    return pl;
  }

  /** Has llegado a un checkpoint: visitado y último checkpoint. */
  function reach(cp) {
    const r = S().region(), first = !S().discovered(cp.zoneId);
    S().discover(cp.zoneId);
    r.lastCheckpoint = cp.zoneId;
    S().commit();
    if (first && clock > 0) {
      G.Spawner.say('Checkpoint: ' + G.KZones.get(cp.zoneId).name, 3, true);
      G.Audio.sfx('confirm');
    }
  }

  // ---------------- salvajes por densidad ----------------

  const win = () => { const d = G.KANTO_WORLD.densityWindow; return { w: d.w * TS(), h: d.h * TS() }; };
  const inWin = (e, k = 1) => { const v = win(); return Math.abs(e.x - pl.x) <= v.w / 2 * k && Math.abs(e.y - pl.y) <= v.h / 2 * k; };
  function wildsNear() { return G.EnemyMgr.all().filter(e => e.wild && !e.dead && !e.boss && !e.gone && inWin(e)).length; }

  /** Salvajes que tocan a la vista en este tramo (la media de su densidad). */
  function target() {
    if (!zone || zone.gauntlet) return 0;
    const [a, b] = zone.density;
    return Math.round((a + b) / 2);
  }

  function pickEntry(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = rnd() * total;
    return entries.find(e => (r -= e.weight) < 0) || entries[entries.length - 1];
  }

  const swims = dex => (G.DEX_BY[dex] || { types: [] }).types.includes('water');

  /** ¿Cabe aquí un salvaje de esa especie? Suelo (o agua si nada), libre y fuera de los checkpoints. */
  function fits(x, y, dex, r = 14) {
    const t = G.World.terrainAt(Math.floor(x / TS()), Math.floor(y / TS()));
    const water = t === G.World.LIQUID && swims(dex) && G.World.liquidKind() === 'water';
    if (t !== G.World.FLOOR && !water) return false;
    if (!G.World.isFree(x, y, r, water)) return false;
    return !KW().safeAt(x, y);
  }

  /** Uno nuevo en la ventana, fuera de la vista y lejos de ti. */
  function spawnOne() {
    const v = win();
    for (let i = 0; i < 24; i++) {
      const x = pl.x + (rnd() - 0.5) * v.w, y = pl.y + (rnd() - 0.5) * v.h;
      if (G.U.dist2(x, y, pl.x, pl.y) < C().SPAWN_MIN_DIST ** 2 || (clock > 0 && G.Camera.sees(x, y, 40))) continue;
      // La fauna es la del tramo de ese punto; cerca de la frontera, a veces la del vecino.
      let z = G.KZones.get((KW().zoneAt(y) || {}).id);
      const blend = KW().faunaBlend(y);
      if (blend.other && rnd() < blend.k) z = G.KZones.get(blend.other.id);
      if (!z || z.gauntlet || !z.entries.length) return null;
      const e = pickEntry(z.entries);
      if (!fits(x, y, e.dex)) continue;
      const level = e.minLevel + Math.floor(rnd() * (e.maxLevel - e.minLevel + 1));
      const w = new G.WildMon({ dex: e.dex, level, x, y, rarity: e.rarity });
      w.zone = z;
      G.EnemyMgr.add(w);
      G.Sprites.preload([e.dex], 4000);
      return w;
    }
    return null;
  }

  /** Mantiene la densidad: salen los que faltan, se van los lejanos que no te persiguen. */
  function population(dt) {
    if ((spawnT -= dt) > 0) return;
    spawnT = SPAWN_EVERY;
    for (const e of G.EnemyMgr.all()) {
      if (!e.wild || e.dead || e.boss || e.aggro || e.gone) continue;
      if (!inWin(e, 1.8) && !G.Camera.sees(e.x, e.y, 80)) e.gone = true;      // G.EnemyMgr lo quita
    }
    if (!pl.dead && wildsNear() < target()) spawnOne();
  }

  // ---------------- jefes y Liga ----------------

  // Jefes: uno por salida; tras vencerlo (o fallar la captura) espera STATIC_BOSS_COOLDOWN_H.
  const staticKey = b => b.zoneId + ':' + b.dex;
  function staticReady(b) {
    if (C().NEVER_WILD.includes(b.dex) && S().list().some(p => p.dex === b.dex)) return false;   // un legendario, una vez
    const t = S().region().statics[staticKey(b)];
    return !t || Date.now() - t > C().STATIC_BOSS_COOLDOWN_H * 3600e3;
  }
  function bossesTick() {
    for (const b of KW().bosses) {
      const k = staticKey(b);
      if (spawned.has(k)) continue;
      const p = KW().center(b.tx, b.ty);
      if (!inWin(p, 1.4)) continue;
      spawned.add(k);
      if (!staticReady(b)) continue;
      const w = new G.WildMon({ dex: b.dex, level: b.level, x: p.x, y: p.y, rarity: 'very_rare', boss: true, staticKey: k });
      w.zone = G.KZones.get(b.zoneId);
      G.EnemyMgr.add(w);
      statics.push(w);
      G.Sprites.preload([b.dex], 6000);
    }
  }

  // Liga: los equipos de Gen I, uno detrás de otro, sin capturas. Empieza al pisar su plaza.
  function leagueTick(dt) {
    const info = KW().zoneInfo(C().LEAGUE.zoneId);
    if (!info || !info.arena) return;
    const a = KW().center(info.arena.tx, info.arena.ty);
    if (!league) {
      if (S().region().leagueCleared || pl.dead || G.U.dist2(pl.x, pl.y, a.x, a.y) > (7 * TS()) ** 2) return;
      league = { stage: -1, queue: [], wait: 1.2, done: false, at: a };
      G.Spawner.say('Meseta Añil: ¡el Alto Mando te espera!', 3, true);
    }
    if (league.done || G.EnemyMgr.all().some(e => e.trainer && !e.dead)) return;
    if ((league.wait -= dt) > 0) return;
    if (league.queue.length) { nextLeagueMon(); return; }
    const L = C().LEAGUE;
    league.stage++;
    if (league.stage >= L.order.length) {
      league.done = true;
      S().region().leagueCleared = true;
      S().commit();
      // El paso al norte (Cueva Celeste) se abre.
      KW().setLeagueOpen(true);
      G.World.refreshRows(info.yN - 4, info.yN + 6);
      G.Spawner.say('¡Has vencido a la Liga Pokémon! El paso al norte está abierto', 5, true);
      G.Audio.sfx('legend');
      return;
    }
    const id = L.order[league.stage];
    const data = G.GEN1.league.find(t => t.id === id);
    const v = id === 'champion' ? (C().CHAMPION_VARIANT[S().region().starter] || 0) : 0;
    league.queue = (data.teams[v] || data.teams[0]).map(([dex, level]) => ({ dex, level }));
    league.trainer = L.names[id];
    if (league.stage > 0) pl.heal(pl.maxHp * L.healBetween);
    G.Spawner.say('¡' + league.trainer + ' te desafía!', 3, true);
    league.wait = 1.5;
  }
  function nextLeagueMon() {
    const n = league.queue.shift(), p = league.at;
    const w = new G.WildMon({ dex: n.dex, level: n.level, x: p.x, y: p.y - 3 * TS(), rarity: 'rare', boss: true, trainer: true });
    w.zone = G.KZones.get(C().LEAGUE.zoneId);
    G.EnemyMgr.add(w);
    G.Sprites.preload([n.dex], 4000);
  }

  /** Lo llama un salvaje al caer (js/kanto/wild.js). */
  function onWildDown(e) {
    if (!sess || sess.how) return;
    const z = e.zone || zone;
    const mul = { xp: pl.xpMul || 1, coins: pl.coinMul || 1 };
    const got = G.KRewards.onDefeat(sess, z, e, pl.level, rnd, mul);
    G.FX.dmgText(e.x, e.y - e.bodyH - 10, '+' + got.xp + ' EXP', '#7fe0ff', true);
    G.FX.dmgText(e.x + 18, e.y - e.bodyH + 4, '+' + got.coins, '#ffd23f');
    for (const id of got.items) itemText(e.x, e.y, id);
    if (e.staticKey) { S().region().statics[e.staticKey] = Date.now(); S().commit(); }
    if (e.trainer && league) { league.wait = league.queue.length ? 0.9 : C().LEAGUE.pause; return; }
    const cap = G.KRewards.tryCapture(sess, z, e, rnd);
    if (cap) {
      catches.push({ x: e.x, y: e.y, t: 0, ok: cap.success, dex: e.dex, name: e.name, level: e.level, ball: cap.ball });
      G.Audio.sfx('confirm');
    }
  }

  function itemText(x, y, id) {
    G.FX.dmgText(x, y - 40, G.T(G.KItems.name(id)), '#ffe14d', true);
    G.FX.ring(x, y, 6, 40, '#ffe14d', 0.4, 3);
  }

  /** Objeto roto: botín del tramo donde está, en lugar del de PokéSurvivor (world.js). */
  function onProp(p) {
    if (!sess || !['grass', 'rock', 'chest', 'bigchest'].includes(p.type)) return false;
    const z = G.KZones.get((KW().zoneAt(p.y) || {}).id) || zone;
    const B = G.Tiles.BIOMES[G.World.biome];
    const got = G.Loot.roll(p.type, z, rnd);
    if (p.type === 'grass') { G.Audio.sfx('grass'); G.FX.burst(p.x, p.y - 6, B.grass[1], 6, 70); }
    else if (p.type === 'rock') { G.Audio.sfx('break'); G.FX.burst(p.x, p.y - 10, B.rock[1], 14, 140); }
    else { G.Audio.sfx('chest'); G.FX.burst(p.x, p.y - 10, '#f2c443', p.type === 'bigchest' ? 34 : 22, 200); G.Camera.kick(0.3); }
    if (got.coins) { sess.coins += got.coins; G.FX.dmgText(p.x, p.y - 24, '+' + got.coins, '#ffd23f'); }
    got.items.forEach((id, i) => { G.KRewards.addItem(sess, id); itemText(p.x + i * 14, p.y - i * 12, id); });
    return true;
  }

  // ---------------- cada fotograma ----------------

  /** El tramo bajo tus pies: paleta (con fundido), aviso y sesión. */
  function zoneTick() {
    const z = G.KZones.get((KW().zoneAt(pl.y) || {}).id);
    if (!z || z === zone) return;
    zone = z;
    sess.zoneId = z.id;
    if (!sess.visited.includes(z.id)) sess.visited.push(z.id);
    G.World.setBiome(G.KZones.paletteOf(z.theme));
    G.Audio.sfx('biome');
    G.Spawner.say('— ' + z.name + ' —', 3, true);
  }

  function update(dt) {
    clock += dt;
    if (pl.itemCd > 0) pl.itemCd -= dt;
    zoneTick();
    const cp = KW().safeAt(pl.x, pl.y);
    if (cp && S().region().lastCheckpoint !== cp.zoneId) reach(cp);
    population(dt);
    bossesTick();
    leagueTick(dt);
    for (const c of catches) c.t += dt;
    catches = catches.filter(c => {
      if (c.t >= C().CAPTURE_ANIM && !c.said) {
        c.said = true;
        if (c.ok) { G.Spawner.say('¡' + c.name + ' Nv.' + c.level + ' capturado!', 3, true); G.Audio.sfx('shinyGet'); G.FX.ring(c.x, c.y, 6, 70, '#ffd23f', 0.5, 4); }
        else { G.Spawner.say('¡' + c.name + ' ha escapado!', 2.4, true); G.Audio.sfx('back'); G.FX.burst(c.x, c.y - 10, '#ffffff', 14, 120); }
      }
      return c.t < C().CAPTURE_ANIM + 0.6;
    });

    if (endT >= 0) { if ((endT -= dt) <= 0) finish(endHow); return; }

    // Caído: ventana para Revivir (si llevas uno); si no, se acaba.
    if (pl.dead) {
      downT += dt;
      rope = null;
      const rev = S().belt('revive');
      const can = rev && S().count(rev) > 0;
      if (downT > (can ? C().REVIVE_WINDOW : 1.4)) finish('death');
      return;
    }
    downT = 0;

    // Cuerda Huida: 3 s quieto sin pelear.
    if (rope) {
      if (pl.lastCombat > rope.start || pl.dead) { rope = null; G.Spawner.say('Cuerda Huida interrumpida', 2, true); }
      else if ((rope.t += dt) >= C().ESCAPE_CHANNEL) {
        G.KUse.consume(rope.id, sess);
        rope = null;
        finish('rope');
        return;
      }
    }

    // Salida: quedarse en la marca SALIR del checkpoint.
    exitAt = cp ? exitMark(cp) : null;
    const onExit = exitAt && G.U.dist2(exitAt.x, exitAt.y, pl.x, pl.y) < (EXIT_R * TS()) ** 2;
    exitT = onExit ? exitT + dt : 0;
    if (exitT >= EXIT_HOLD) finish('exit');
  }

  /** La marca SALIR de un checkpoint (al otro lado del manantial). */
  function exitMark(cp) { return KW().center(cp.tx - 3, cp.ty); }

  function finish(how) {
    if (!sess || sess.how) return;
    // Salir desde la pausa en pleno combate cuenta como caer (no se escapa así de una pelea).
    if (how === 'quit') how = pl && (pl.dead || pl.inCombat) ? 'death' : 'exit';
    const res = G.KRewards.finish(sess, how, rnd);
    G.Game.endKanto(res);
  }

  // ---------------- cinturón ----------------

  function bossEngaged() { return G.EnemyMgr.all().some(e => e.wild && e.boss && !e.dead && e.aggro); }

  function useBelt(slot) {
    if (!pl || !sess || sess.how) return;
    const r = G.KUse.inZone(slot, pl, { boss: bossEngaged(), sess });
    if (r.channel) {
      rope = { t: 0, start: pl.lastCombat, id: r.id };
      G.Spawner.say('Cuerda Huida: quieto ' + C().ESCAPE_CHANNEL + ' s…', 2, true);
      G.Audio.sfx('confirm');
      return;
    }
    G.FX.dmgText(pl.x, pl.y - pl.bodyH - 18, G.T(r.msg), r.ok ? '#9dffb8' : '#ff8a96');
    G.Audio.sfx(r.ok ? 'heal' : 'back');
    if (r.ok && slot === 'revive') downT = 0;
  }

  // ---------------- consultas (wild.js, HUD) ----------------

  function safeAt(x, y) { return !!KW().safeAt(x, y); }

  /** Un punto donde pasear: cerca de casa. */
  function wanderPoint(e) {
    for (let i = 0; i < 12; i++) {
      const x = e.home.x + (rnd() - 0.5) * 9 * TS(), y = e.home.y + (rnd() - 0.5) * 9 * TS();
      if (fits(x, y, e.dex, e.r)) return { x, y };
    }
    return null;
  }

  /** El salvaje al que apuntas (para el HUD): nombre, nivel, vida. */
  function target_() {
    if (!pl) return null;
    const t = pl.target && !pl.target.dead && pl.target.wild ? pl.target : null;
    if (t) return t;
    let best = null, bd = 260 * 260;
    for (const e of G.EnemyMgr.all()) {
      if (!e.wild || e.dead) continue;
      const d = G.U.dist2(e.x, e.y, pl.x, pl.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---------------- dibujo (en el mundo) ----------------

  function drawGround(ctx) {
    if (!zone || !pl) return;
    const cp = KW().safeAt(pl.x, pl.y) || nearCheckpoint();
    if (!cp) return;
    const p = exitMark(cp), R = EXIT_R * TS();
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(clock * 3) * 0.1;
    ctx.fillStyle = '#7fe0ff';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 6, R, R * 0.45, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2; ctx.strokeStyle = '#d6f6ff';
    ctx.beginPath(); ctx.ellipse(p.x, p.y - 6, R, R * 0.45, 0, 0, 6.2832); ctx.stroke();
    if (exitT > 0) {
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 6, R + 6, R * 0.45 + 4, 0, -Math.PI / 2, -Math.PI / 2 + 6.2832 * Math.min(1, exitT / EXIT_HOLD)); ctx.stroke();
    }
    ctx.font = '800 10px Pixelify, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#d6f6ff';
    G.I18n.rawCanvas(ctx, 'fillText', 'SALIR', p.x, p.y - R * 0.45 - 12);
    ctx.restore();
  }

  /** El checkpoint que tienes cerca (para ver la marca SALIR antes de pisarlo). */
  function nearCheckpoint() {
    const tx = Math.floor(pl.x / TS()), ty = Math.floor(pl.y / TS());
    return (KW().built ? KW().built.checkpoints : []).find(c => Math.abs(c.ty - ty) < 18 && Math.abs(c.tx - tx) < 24) || null;
  }

  function drawAir(ctx) {
    for (const c of catches) {
      const k = Math.min(1, c.t / C().CAPTURE_ANIM);
      const y = c.y - 18 - Math.sin(Math.min(1, k * 1.4) * Math.PI) * 26;
      const wob = k < 1 ? Math.sin(c.t * 18) * 0.35 * (1 - k) : 0;
      ctx.save();
      ctx.translate(c.x, y); ctx.rotate(wob);
      G.Icons.draw(ctx, (G.KItems.BY[c.ball] || {}).icon || 'ball', -10, -10, 20);
      ctx.restore();
      if (k >= 1 && c.ok) G.FX.twinkle(c.x + G.U.rand(-10, 10), y + G.U.rand(-8, 8));
    }
    if (rope && pl) {
      ctx.save();
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(pl.x, pl.y - pl.bodyH * 0.5, 30, -Math.PI / 2, -Math.PI / 2 + 6.2832 * rope.t / C().ESCAPE_CHANNEL); ctx.stroke();
      ctx.restore();
    }
  }

  function end() {
    zone = null; sess = null; pl = null; statics = []; spawned = new Set(); league = null; rope = null; catches = [];
    G.World.setPropHook(null);
  }

  return {
    begin, update, finish, end, useBelt, onWildDown, safeAt, wanderPoint, target: target_, drawGround, drawAir, bossEngaged,
    get zone() { return zone; }, get music() { return zone ? MUSIC[zone.theme] || 'forest' : null; }, get session() { return sess; }, get rope() { return rope; },
    get downT() { return downT; }, get exitT() { return exitT; }, get league() { return league; },
    /** Para pruebas: rellena la densidad sin mirar la cámara. */
    debugFill() { for (let i = 0; i < 60 && wildsNear() < target(); i++) spawnOne(); return wildsNear(); }
  };
})();
