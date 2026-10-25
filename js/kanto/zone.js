/* ============ zone.js — una visita a una zona de Kanto (en tiempo real) ============
 * Lo que pasa mientras juegas una zona:
 *   - carga su mapa (G.World.loadMap) con su paleta y los cofres del día
 *   - salvajes por grupos de aparición, con su nivel fijo y su reaparición
 *     según la rareza; estáticos (legendarios) y la Liga, aparte
 *   - al vencer: EXP pendiente, monedas, botín y el único intento de captura
 *   - objetos rotos (hierba, rocas, cofres): botín de zona (js/kanto/loot.js)
 *   - cinturón, Cuerda Huida (canalizada), ventana para Revivir al caer
 *   - salida: quedarse un momento en el portal de la entrada
 *
 * Al terminar (salida, cuerda, caída...) G.Game.endKanto() cierra la sesión
 * (G.KRewards.finish) y enseña los resultados. Nada de esto sube niveles.
 */
G.KZone = (() => {
  const C = () => G.KCFG;
  const S = () => G.KSave;
  const TS = () => G.World.TS;
  const EXIT_HOLD = 1.1;
  // Música de PokéSurvivor según el tema de la zona.
  const MUSIC = { rock: 'cave', ground: 'cave', ghost: 'cave', psychic: 'cave', electric: 'cave', ice: 'cave', fire: 'volcano', poison: 'volcano' };

  let zone = null, sess = null, pl = null;
  let groups = [], statics = [], league = null;
  let exitT = 0, rope = null, downT = 0, endT = -1, endHow = null;
  let catches = [];               // animaciones de captura { x, y, t, ok, dex }
  let clock = 0;

  const tileCenter = (tx, ty) => ({ x: tx * TS() + TS() / 2, y: ty * TS() + TS() - 4 });
  const rnd = () => Math.random();

  // ---------------- empezar ----------------

  /** Prepara el mundo y devuelve el jugador (lo usa G.Game.startKanto). */
  function begin(zoneId, inst) {
    zone = G.KZones.get(zoneId);
    const m = zone.map;
    const props = m.props.slice();
    // Cofres de los marcadores (uno de ellos, con candado): sale cada uno con su probabilidad.
    for (const c of zone.chestSpawns) {
      if (c.big ? rnd() < 0.6 : rnd() < 0.7) props.push({ type: c.big ? 'bigchest' : 'chest', tx: c.tx, ty: c.ty });
    }
    G.World.loadMap(Object.assign({}, m, { props }), Math.floor(rnd() * 1e6));
    G.World.setBiome(G.Tiles.arenaBiome(zone.theme), true);
    G.World.setPropHook(onProp);
    sess = G.KRewards.newSession(zone, inst);
    pl = new G.KantoPlayer(inst);
    const sp = tileCenter(zone.playerSpawns[0].tx, zone.playerSpawns[0].ty);
    pl.x = sp.x; pl.y = sp.y;
    pl.itemCd = 0;
    groups = zone.wildSpawnGroups.map(g => ({ def: g, alive: 0, timers: [] }));
    for (const g of groups) for (let i = 0; i < g.def.maxAlive; i++) spawnIn(g);
    statics = [];
    for (const s of zone.staticBosses) if (staticReady(s)) spawnStatic(s);
    league = zone.gauntlet ? { stage: -1, queue: [], wait: 2, done: false } : null;
    exitT = 0; rope = null; downT = 0; endT = -1; endHow = null; catches = []; clock = 0;
    S().discover(zone.id);
    S().commit();
    G.Spawner.say('— ' + zone.name + ' —', 3, true);
    return pl;
  }

  // ---------------- salvajes ----------------

  function pickEntry(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = rnd() * total;
    return entries.find(e => (r -= e.weight) < 0) || entries[entries.length - 1];
  }

  /** Un sitio libre dentro del rectángulo (en tiles), lejos del jugador y fuera de la zona segura. */
  function freeSpot(rect, r = 14, nearPlayerOk = false) {
    for (let i = 0; i < 40; i++) {
      const tx = rect.x + Math.floor(rnd() * rect.w), ty = rect.y + Math.floor(rnd() * rect.h);
      const p = tileCenter(tx, ty);
      if (G.World.terrainAt(tx, ty) !== G.World.FLOOR || !G.World.isFree(p.x, p.y, r)) continue;
      if (G.KZones.inSafe(zone, p.x, p.y)) continue;
      if (!nearPlayerOk && pl && G.U.dist2(p.x, p.y, pl.x, pl.y) < C().SPAWN_MIN_DIST ** 2) continue;
      return p;
    }
    return null;
  }

  function spawnIn(g) {
    const e = pickEntry(g.def.entries);
    const p = freeSpot(g.def.rect);
    if (!p) { g.timers.push(3); return null; }
    const level = e.minLevel + Math.floor(rnd() * (e.maxLevel - e.minLevel + 1));
    const w = new G.WildMon({ dex: e.dex, level, x: p.x, y: p.y, group: g, rarity: e.rarity });
    G.EnemyMgr.add(w);
    g.alive++;
    G.Sprites.preload([e.dex], 4000);
    return w;
  }

  function respawnDelay(rarity) {
    const [a, b] = C().RESPAWN[rarity] || C().RESPAWN.common;
    return a + rnd() * (b - a);
  }

  // Estáticos: uno por visita; tras vencerlo (o fallar la captura) espera STATIC_BOSS_COOLDOWN_H.
  const staticKey = s => zone.id + ':' + s.dex;
  function staticReady(s) {
    if (C().NEVER_WILD.includes(s.dex) && S().list().some(p => p.dex === s.dex)) return false;   // un legendario, una vez
    const t = S().region().statics[staticKey(s)];
    return !t || Date.now() - t > C().STATIC_BOSS_COOLDOWN_H * 3600e3;
  }
  function spawnStatic(s) {
    const p = tileCenter(s.tx, s.ty);
    const w = new G.WildMon({ dex: s.dex, level: s.level, x: p.x, y: p.y, rarity: 'very_rare', boss: true, staticKey: staticKey(s) });
    G.EnemyMgr.add(w);
    statics.push(w);
    G.Sprites.preload([s.dex], 6000);
  }

  // Liga: los equipos de Gen I, uno detrás de otro, sin capturas.
  function leagueTick(dt) {
    if (!league || league.done || G.EnemyMgr.all().some(e => e.trainer && !e.dead)) return;
    if ((league.wait -= dt) > 0) return;
    if (league.queue.length) { nextLeagueMon(); return; }
    const L = C().LEAGUE;
    league.stage++;
    if (league.stage >= L.order.length) {
      league.done = true;
      S().region().leagueCleared = true;
      S().commit();
      G.Spawner.say('¡Has vencido a la Liga Pokémon!', 5, true);
      G.Audio.sfx('legend');
      endT = 4; endHow = 'league';
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
    const n = league.queue.shift();
    const b = zone.map.markers.boss[0];
    const p = tileCenter(b.tx, b.ty);
    G.EnemyMgr.add(new G.WildMon({ dex: n.dex, level: n.level, x: p.x, y: p.y, rarity: 'rare', boss: true, trainer: true }));
    G.Sprites.preload([n.dex], 4000);
  }

  /** Lo llama un salvaje al caer (js/kanto/wild.js). */
  function onWildDown(e) {
    if (!sess || sess.how) return;
    const mul = { xp: pl.xpMul || 1, coins: pl.coinMul || 1 };
    const got = G.KRewards.onDefeat(sess, zone, e, pl.level, rnd, mul);
    G.FX.dmgText(e.x, e.y - e.bodyH - 10, '+' + got.xp + ' EXP', '#7fe0ff', true);
    G.FX.dmgText(e.x + 18, e.y - e.bodyH + 4, '+' + got.coins, '#ffd23f');
    for (const id of got.items) itemText(e.x, e.y, id);
    if (e.group) { e.group.alive--; e.group.timers.push(respawnDelay(e.rarity)); }
    if (e.staticKey) { S().region().statics[e.staticKey] = Date.now(); S().commit(); }
    if (e.trainer && league) { league.wait = league.queue.length ? 0.9 : C().LEAGUE.pause; return; }
    const cap = G.KRewards.tryCapture(sess, zone, e, rnd);
    if (cap) {
      catches.push({ x: e.x, y: e.y, t: 0, ok: cap.success, dex: e.dex, name: e.name, level: e.level, ball: cap.ball });
      G.Audio.sfx('confirm');
    }
  }

  function itemText(x, y, id) {
    G.FX.dmgText(x, y - 40, G.T(G.KItems.name(id)), '#ffe14d', true);
    G.FX.ring(x, y, 6, 40, '#ffe14d', 0.4, 3);
  }

  /** Objeto roto: botín de zona en lugar del de PokéSurvivor (world.js). */
  function onProp(p) {
    if (!sess || !['grass', 'rock', 'chest', 'bigchest'].includes(p.type)) return false;
    const B = G.Tiles.BIOMES[G.World.biome];
    const got = G.Loot.roll(p.type, zone, rnd);
    if (p.type === 'grass') { G.Audio.sfx('grass'); G.FX.burst(p.x, p.y - 6, B.grass[1], 6, 70); }
    else if (p.type === 'rock') { G.Audio.sfx('break'); G.FX.burst(p.x, p.y - 10, B.rock[1], 14, 140); }
    else { G.Audio.sfx('chest'); G.FX.burst(p.x, p.y - 10, '#f2c443', p.type === 'bigchest' ? 34 : 22, 200); G.Camera.kick(0.3); }
    if (got.coins) { sess.coins += got.coins; G.FX.dmgText(p.x, p.y - 24, '+' + got.coins, '#ffd23f'); }
    got.items.forEach((id, i) => { G.KRewards.addItem(sess, id); itemText(p.x + i * 14, p.y - i * 12, id); });
    return true;
  }

  // ---------------- cada fotograma ----------------

  function update(dt) {
    clock += dt;
    if (pl.itemCd > 0) pl.itemCd -= dt;
    for (const g of groups) {
      for (let i = g.timers.length - 1; i >= 0; i--) {
        if ((g.timers[i] -= dt) > 0) continue;
        g.timers.splice(i, 1);
        if (g.alive < g.def.maxAlive) spawnIn(g);
      }
    }
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

    // Salida: quedarse en el portal.
    const onExit = zone.exits.some(x => { const p = tileCenter(x.tx, x.ty); return G.U.dist2(p.x, p.y, pl.x, pl.y) < (x.r * TS()) ** 2; });
    exitT = onExit ? exitT + dt : 0;
    if (exitT >= EXIT_HOLD) finish('exit');
  }

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

  function safeAt(x, y) { return !!zone && G.KZones.inSafe(zone, x, y); }

  /** Un punto donde pasear: dentro de su grupo (o cerca de casa). */
  function wanderPoint(e) {
    const rect = e.group ? e.group.def.rect
      : { x: Math.floor(e.home.x / TS()) - 4, y: Math.floor(e.home.y / TS()) - 4, w: 9, h: 9 };
    return freeSpot(rect, e.r, true);
  }

  /** El salvaje al que apuntas (para el HUD): nombre, nivel, vida. */
  function target() {
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
    if (!zone) return;
    const t = clock;
    for (const x of zone.exits) {
      const p = tileCenter(x.tx, x.ty), R = x.r * TS();
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(t * 3) * 0.1;
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
      G.I18n.rawCanvas(ctx, 'fillText', 'SALIDA', p.x, p.y - R * 0.45 - 12);
      ctx.restore();
    }
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
    zone = null; sess = null; pl = null; groups = []; statics = []; league = null; rope = null; catches = [];
    G.World.setPropHook(null);
  }

  return {
    begin, update, finish, end, useBelt, onWildDown, safeAt, wanderPoint, target, drawGround, drawAir, bossEngaged,
    get zone() { return zone; }, get music() { return zone ? MUSIC[zone.theme] || 'forest' : null; }, get session() { return sess; }, get rope() { return rope; },
    get downT() { return downT; }, get exitT() { return exitT; }, get league() { return league; }
  };
})();
