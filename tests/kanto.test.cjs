// Modo Kanto: datos de Gen I, zonas, Pokémon, captura, objetos y partida
// (apartados 34-37 de la especificación). node --test tests/*.test.cjs
const { test } = require('node:test');
const strict = require('node:assert/strict');
// Los objetos del vm son de otro "realm": se comparan por valor.
const plain = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const assert = Object.assign((...a) => strict(...a), strict, {
  deepEqual: (a, b, m) => strict.deepEqual(plain(a), plain(b), m),
  deepStrictEqual: (a, b, m) => strict.deepEqual(plain(a), plain(b), m),
});
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = f => fs.readFileSync(path.join(root, f), 'utf8');

/** El juego sin navegador: los datos y la lógica de Kanto, con una partida en memoria. */
function boot() {
  const ctx = { console, crypto: require('node:crypto').webcrypto };
  ctx.window = ctx;
  vm.createContext(ctx);
  const load = f => vm.runInContext(source(f), ctx, { filename: f });
  ['js/core/util.js', 'js/data/pokedex.js', 'js/data/moves.js', 'js/data/items.js',
   'js/data/gen1-progression.js', 'js/data/gen1-moves-meta.js', 'js/data/kanto-config.js', 'js/data/kanto-items.js',
   'js/data/loot-tables.js', 'js/data/kanto-zones.js', 'js/data/kanto-maps.js',
   'js/kanto/pokemon.js', 'js/kanto/moves.js', 'js/kanto/damage.js', 'js/kanto/save.js', 'js/kanto/zones.js',
   'js/kanto/loot.js', 'js/kanto/rewards.js', 'js/kanto/use.js'].forEach(load);
  const G = ctx.G;
  const save = { kanto: G.KSave.blank() };
  G.DB = { save, commits: 0, commit() { this.commits++; } };
  return { G, save, load };
}
/** Tiradas fijas: rnd(0) siempre acierta, rnd(0.9999) siempre falla. */
const fixed = v => () => v;

// ---------------- DATOS ----------------

test('datos Gen I: 151 especies completas y 165 movimientos válidos', () => {
  const { G } = boot();
  assert.equal(G.GEN1.species.length, 151);
  const moves = G.GEN1_MOVES.BY;
  assert.equal(G.GEN1_MOVES.length, 165);
  const RATES = Object.keys(G.GEN1.growth);
  for (const s of G.GEN1.species) {
    const tag = '#' + s.dex;
    assert.ok(G.DEX_BY[s.dex], tag + ' en la Pokédex del juego');
    for (const st of G.KMon.STATS) assert.ok(s.baseStats[st] > 0, tag + ' ' + st);
    assert.ok(RATES.includes(s.growthRate), tag + ' curva');
    assert.ok(s.initialMoves.length >= 1 && s.initialMoves.every(m => moves[m]), tag + ' movimientos iniciales');
    assert.ok(s.learnset.every(l => moves[l.move] && l.level >= 1 && l.level <= 100), tag + ' aprendizaje');
    for (const e of s.evolution) {
      assert.ok(G.GEN1.BY[e.to], tag + ' evoluciona a algo que existe');
      assert.ok(e.method !== 'level' || (e.level >= 2 && e.level <= 100), tag + ' nivel de evolución');
      assert.ok(e.method !== 'item' || G.KItems.BY[e.item], tag + ' piedra ' + e.item);
    }
    assert.ok(Number.isInteger(s.catchRate) && s.catchRate >= 1 && s.catchRate <= 255, tag + ' ratio de captura');
  }
  const TYPES = Object.keys(G.U.TYPE_COLOR);
  for (const m of G.GEN1_MOVES) {
    assert.ok(m.pp >= 1 && m.pp <= 40, m.id + ' PP');
    assert.ok(m.power >= 0 && m.power <= 250, m.id + ' potencia');
    assert.ok(TYPES.includes(m.type), m.id + ' tipo');
    assert.ok(typeof m.effect === 'string' && m.effect, m.id + ' efecto');
    assert.ok(['physical', 'special', 'status'].includes(m.category), m.id + ' categoría');
  }
  // Curvas exactas (Gen I): nivel 100.
  const at100 = { fast: 800000, medium_fast: 1000000, medium_slow: 1059860, slow: 1250000 };
  for (const [r, v] of Object.entries(at100)) assert.equal(G.GEN1.growth[r][100], v, r);
});

test('todos los movimientos existen y se pueden usar (los que faltan, con efecto provisional)', () => {
  const { G } = boot();
  for (const m of G.GEN1_MOVES) {
    const d = G.KMoves.def(m.id);
    assert.ok(d && d.kind, m.id);
    assert.ok(!G.KCFG.KIND_BLOCKED.includes(d.kind), m.id + ' forma permitida');
    assert.ok(d.cd > 0, m.id + ' recarga');
    if (m.category !== 'status') assert.ok(d.dmg > 0, m.id + ' daño');
  }
});

// ---------------- ZONAS ----------------

test('zonas: las 19 de KANTO_ZONES_V1 son válidas (especies, niveles, temas, mapas, estáticos)', () => {
  const { G } = boot();
  assert.equal(G.KZones.all().length, 19);
  assert.deepEqual(G.KZones.validateAll(), []);
  const statics = G.KZones.all().flatMap(z => z.staticBosses.map(s => [s.dex, s.level]));
  for (const [dex, lv] of [[145, 50], [144, 50], [146, 50], [150, 70], [143, 30]]) {
    assert.ok(statics.some(([d, l]) => d === dex && l === lv), 'estático #' + dex + ' Nv.' + lv);
  }
  const league = G.KZones.get('kanto_18_indigo_league');
  assert.ok(league.gauntlet && !league.wildSpawnGroups.length);
  assert.ok(G.GEN1.league.find(t => t.id === 'champion').teams.flat().every(([, l]) => l >= 53 && l <= 65));
  assert.equal(G.KZones.get('kanto_11_safari_zone').pvpMode, 'none');
  assert.ok(G.KZones.all().filter(z => z.pvpMode !== 'none').every(z => z.pvpMode === 'duel_opt_in'), 'nada de PvP libre');
});

test('validador de evolución por nivel (apartado 37)', () => {
  const { G } = boot();
  const caps = { 10: 7, 11: 10, 41: 22, 74: 25, 50: 26, 72: 30, 86: 34 };
  for (const [dex, lv] of Object.entries(caps)) assert.equal(G.KZones.levelEvoCap(+dex), lv, '#' + dex);
  const z = G.KZones.get('kanto_02_viridian_forest');
  const bad = JSON.parse(JSON.stringify(G.KANTO_ZONES_SEED.zones.find(x => x.id === z.id)));
  bad.wild.find(w => w.dex === 10).level = [3, 7];
  const errs = G.KZones.validate(G.KZones.build(bad, z.map));
  assert.ok(errs.some(e => /#10: sale a Nv\.7 pero evoluciona a Nv\.7/.test(e)), errs.join('\n'));
  // Otros errores de datos y de mapa.
  bad.wild[0].level = [9, 4];
  bad.wild.push({ dex: 999, level: [3, 4], rarity: 'common' });
  const map = JSON.parse(JSON.stringify(z.map));
  map.markers.spawn = [{ tx: 0, ty: 0 }];
  map.markers.exits = [{ tx: 500, ty: 3, r: 1 }];
  const errs2 = G.KZones.validate(G.KZones.build(bad, map));
  for (const re of [/mínimo > máximo/, /#999: especie desconocida/, /spawn en pared/, /exits fuera del mapa/]) assert.ok(errs2.some(e => re.test(e)), re + '\n' + errs2.join('\n'));
});

// ---------------- POKÉMON ----------------

for (const [starter, mid, last, l1, l2] of [[1, 2, 3, 16, 32], [4, 5, 6, 16, 36], [7, 8, 9, 16, 36]]) {
  test(`línea de #${starter} (sin código por especie): stats, curva, movimientos, evoluciones`, () => {
    const { G } = boot();
    const sp = G.GEN1.BY[starter];
    const p = G.KMon.create({ dex: starter, level: 5, from: 'starter' });
    assert.equal(sp.growthRate, 'medium_slow');
    assert.equal(p.totalXp, G.KMon.expAt(starter, 5));
    assert.deepEqual(p.moves.map(m => m.id), sp.initialMoves.concat(sp.learnset.filter(l => l.level <= 5).map(l => l.move)).slice(-4));
    // Stats: base + nivel (fórmula moderna, IV 31, sin entrenamiento).
    const st = G.KMon.calcStats(p);
    assert.equal(st.hp, Math.floor((2 * sp.baseStats.hp + 31) * 5 / 100) + 5 + 10);
    assert.equal(st.attack, Math.floor((2 * sp.baseStats.attack + 31) * 5 / 100) + 5);
    // Objeto y entrenamiento: se conservan al evolucionar.
    p.heldItemId = 'leftovers';
    G.KMon.addTraining(p, 'attack', 30);
    p.moves[0].currentPP = 3;
    const pp0 = p.moves[0].id;
    // EXP de golpe: varios niveles y las dos evoluciones en orden.
    const ev = G.KMon.gainXp(p, G.KMon.expAt(starter, l2) - p.totalXp);
    assert.equal(p.level, l2);
    assert.equal(p.dex, last);
    const evos = ev.filter(e => e.type === 'evolve');
    assert.deepEqual(evos.map(e => [e.from, e.to, e.level]), [[starter, mid, l1], [mid, last, l2]]);
    assert.equal(ev.filter(e => e.type === 'level').length, l2 - 5);
    assert.ok(p.moves.length <= 4);
    assert.equal(p.heldItemId, 'leftovers');
    assert.equal(p.training.attack, 30);
    assert.equal(p.totalXp, G.KMon.expAt(last, l2));
    const kept = p.moves.find(m => m.id === pp0);
    if (kept) assert.equal(kept.currentPP, 3, 'los PP no se rellenan solos');
    // Lo que no cabía sale como decisión (aprender / olvidar), nunca se aprende solo.
    for (const e of ev.filter(e => e.type === 'learnChoice')) assert.ok(!G.KMon.knows(p, e.move) || p.moves.length < 4);
  });
}

test('aprender con 4 movimientos: olvidar uno, o no aprenderlo', () => {
  const { G } = boot();
  const p = G.KMon.create({ dex: 1, level: 20 });
  assert.equal(p.moves.length, 4);
  const before = p.moves.map(m => m.id);
  assert.equal(G.KMon.learn(p, 'razor-leaf'), false, 'sin decir cuál olvida no aprende');
  assert.equal(G.KMon.learn(p, 'razor-leaf', null), false);
  assert.deepEqual(p.moves.map(m => m.id), before);
  assert.equal(G.KMon.learn(p, 'razor-leaf', 1), true);
  assert.equal(p.moves[1].id, 'razor-leaf');
  assert.equal(p.moves.length, 4);
  assert.equal(G.KMon.learn(p, 'razor-leaf', 0), false, 'no aprende lo que ya sabe');
});

test('EXP: varios niveles de golpe, tope Nv.100 y penalización por nivel', () => {
  const { G } = boot();
  const p = G.KMon.create({ dex: 16, level: 3 });
  const ev = G.KMon.gainXp(p, 1e9);
  assert.equal(p.level, 100);
  assert.equal(p.totalXp, G.KMon.expAt(p.dex, 100));
  assert.equal(ev.filter(e => e.type === 'level').length, 97);
  assert.equal(G.KMon.gainXp(p, 500).length, 0);
  assert.equal(G.KMon.overlevelMult(7, 7), 1);
  assert.equal(G.KMon.overlevelMult(30, 7), 0.1);
  assert.equal(G.KMon.overlevelMult(10, 7), 0.5);
  assert.equal(G.KMon.overlevelMult(15, 7), 0.25);
});

test('evolución por piedra y por Cable Conector: conserva todo y el % de vida', () => {
  const { G } = boot();
  const S = G.KSave;
  const p = S.addPokemon(G.KMon.create({ dex: 25, level: 20 }));
  p.heldItemId = 'quickclaw';
  const moves = JSON.stringify(p.moves);
  S.add('thunder-stone', 1);
  const r = G.KUse.onPokemon('thunder-stone', p);
  assert.ok(r.ok);
  assert.equal(p.dex, 26);
  assert.equal(S.count('thunder-stone'), 0);
  assert.equal(JSON.stringify(p.moves), moves);
  assert.equal(p.heldItemId, 'quickclaw');
  assert.equal(p.level, 20);
  assert.equal(G.KUse.onPokemon('thunder-stone', p).ok, false, 'sin piedras no hace nada');
  const k = S.addPokemon(G.KMon.create({ dex: 64, level: 30 }));
  S.add('link-cable', 1);
  assert.ok(G.KUse.onPokemon('link-cable', k).ok);
  assert.equal(k.dex, 65);
  // El % de vida se mantiene al evolucionar.
  const b = G.KMon.create({ dex: 1, level: 16 });
  const hp = G.KMon.evolve(b, 2, 0.5);
  assert.equal(hp, Math.round(G.KMon.calcStats(b).hp * 0.5));
});

// ---------------- CAPTURA ----------------

function zoneRun(G, zoneId = 'kanto_01_route_green') {
  const zone = G.KZones.get(zoneId);
  const inst = G.KSave.addPokemon(G.KMon.create({ dex: 4, level: 5, from: 'starter' }));
  return { zone, inst, sess: G.KRewards.newSession(zone, inst) };
}

test('captura: sin Ball no hay intento; una Ball, un intento; Master Ball 100 %', () => {
  const { G } = boot();
  const S = G.KSave;
  const { zone, sess } = zoneRun(G);
  const w = { dex: 16, level: 3, rarity: 'common' };
  S.setBelt('ball', null);
  const balls = S.count('poke-ball');
  assert.equal(G.KRewards.tryCapture(sess, zone, w, fixed(0)), null);
  assert.equal(S.count('poke-ball'), balls, 'no gasta Ball');
  S.setBelt('ball', 'poke-ball');
  const n = S.list().length;
  const ok = G.KRewards.tryCapture(sess, zone, w, fixed(0));
  assert.ok(ok.success);
  assert.equal(S.count('poke-ball'), balls - 1, 'exactamente una Ball');
  assert.equal(S.list().length, n + 1);
  assert.equal(ok.inst.level, 3, 'al nivel del salvaje');
  assert.equal(ok.inst.dex, 16);
  assert.deepEqual(ok.inst.moves.map(m => m.id), G.KMon.movesAtLevel(16, 3));
  assert.ok(S.get(ok.inst.id), 'guardada al momento (captura protegida)');
  // Fallo: gasta la Ball y nada más (el salvaje ya no está).
  const bad = G.KRewards.tryCapture(sess, zone, { dex: 150, level: 70 }, fixed(0.9999));
  assert.equal(bad.success, false);
  assert.equal(S.count('poke-ball'), balls - 2);
  assert.equal(S.list().length, n + 1);
  assert.deepEqual(sess.failed, [150]);
  // Probabilidades.
  assert.ok(Math.abs(G.KRewards.captureChance(150, 'poke-ball') - (1 - Math.pow(1 - 3 / 255, 3))) < 1e-9);
  assert.ok(G.KRewards.captureChance(150, 'ultra-ball') > G.KRewards.captureChance(150, 'great-ball'));
  assert.equal(G.KRewards.captureChance(150, 'master-ball'), 1);
  S.add('master-ball', 1); S.setBelt('ball', 'master-ball');
  assert.ok(G.KRewards.tryCapture(sess, zone, { dex: 150, level: 70 }, fixed(0.9999)).success);
  // Liga: nunca se captura.
  assert.equal(G.KRewards.tryCapture(sess, zone, { dex: 9, level: 65, trainer: true }, fixed(0)), null);
});

test('zona: EXP pendiente y monedas; se aplica al salir; penalización con Nv.30', () => {
  const { G } = boot();
  const S = G.KSave;
  const { zone, inst, sess } = zoneRun(G);
  const coins0 = S.coins();
  const got = G.KRewards.onDefeat(sess, zone, { dex: 16, level: 4, rarity: 'common' }, inst.level, fixed(0.5));
  assert.equal(got.xp, G.KMon.xpYield(16, 4, false));
  assert.ok(got.coins > 0);
  assert.equal(inst.totalXp, G.KMon.expAt(4, 5), 'nada sube durante la zona');
  assert.equal(S.coins(), coins0, 'las monedas aún no están guardadas');
  const res = G.KRewards.finish(sess, 'exit');
  assert.equal(inst.totalXp, G.KMon.expAt(4, 5) + got.xp);
  assert.equal(S.coins(), coins0 + sess.coins);
  assert.equal(res.kills, 1);
  assert.equal(G.KRewards.finish(sess, 'death'), res, 'sólo se cierra una vez');
  // Con un Pokémon de Nv.30 la misma zona da mucha menos EXP (y sigue abierta).
  const big = S.addPokemon(G.KMon.create({ dex: 6, level: 30 }));
  const s2 = G.KRewards.newSession(zone, big);
  const g2 = G.KRewards.onDefeat(s2, zone, { dex: 16, level: 4, rarity: 'common' }, big.level, fixed(0.5));
  assert.equal(g2.xp, Math.floor(G.KMon.xpYield(16, 4, false) * G.KMon.overlevelMult(30, zone.recommendedLevel[1])));
  assert.ok(g2.xp < got.xp / 2, "Nv.30 en zona de Nv.2-5: EXP muy reducida");
});

test('muerte: se pierde un 30 % de lo ganado en la zona; nunca la EXP ni las capturas', () => {
  const { G } = boot();
  const S = G.KSave;
  const { zone, inst, sess } = zoneRun(G);
  sess.coins = 100; sess.items = { potion: 10 }; sess.xp = 40;
  S.setBelt('ball', 'poke-ball');
  const cap = G.KRewards.tryCapture(sess, zone, { dex: 19, level: 3 }, fixed(0));
  const coins0 = S.coins(), pot0 = S.count('potion');
  const res = G.KRewards.finish(sess, 'death', fixed(0.99));
  assert.equal(res.dropped.coins, 30);
  assert.equal(res.dropped.items.potion, 3);
  assert.equal(S.coins(), coins0 + 70);
  assert.equal(S.count('potion'), pot0 + 7);
  assert.equal(inst.totalXp, G.KMon.expAt(4, 5) + 40);
  assert.ok(S.get(cap.inst.id));
});

// ---------------- OBJETOS ----------------

function fakePl(G, inst) {
  return { inst, hp: 10, maxHp: 40, dead: false, active: 0, itemCd: 0, slowT: 0, inCombat: false,
           heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }, revive(f) { this.dead = false; this.hp = this.maxHp * f; } };
}

test('cinturón: gasta de la bolsa, nunca en negativo, espera compartida', () => {
  const { G } = boot();
  const S = G.KSave;
  const inst = S.addPokemon(G.KMon.create({ dex: 7, level: 10 }));
  const pl = fakePl(G, inst);
  S.setBelt('heal', 'potion');
  const n = S.count('potion');
  assert.ok(G.KUse.inZone('heal', pl).ok);
  assert.equal(pl.hp, 30);
  assert.equal(S.count('potion'), n - 1);
  const r = G.KUse.inZone('heal', pl);
  assert.equal(r.ok, false); assert.ok(r.cd, 'espera compartida');
  pl.itemCd = 0;
  while (S.count('potion') > 0) { pl.hp = 1; pl.itemCd = 0; G.KUse.inZone('heal', pl); }
  pl.hp = 1; pl.itemCd = 0;
  assert.equal(G.KUse.inZone('heal', pl).ok, false);
  assert.equal(S.count('potion'), 0);
  assert.equal(S.take('potion', 1), false);
  assert.equal(S.data().bag.potion, undefined, 'sin pilas en negativo ni a 0');
  assert.equal(S.setBelt('heal', 'poke-ball'), false, 'cada hueco, su categoría');
});

test('Éter: no se pasa del máximo; Revivir sólo tras caer; Cuerda Huida no en combate ni con jefe', () => {
  const { G } = boot();
  const S = G.KSave;
  const inst = S.addPokemon(G.KMon.create({ dex: 7, level: 10 }));
  const pl = fakePl(G, inst);
  const m = inst.moves[0];
  S.add('ether', 2); S.setBelt('pp', 'ether');
  assert.equal(G.KUse.inZone('pp', pl).ok, false, 'PP llenos');
  m.currentPP = m.runtimeMaxPP - 4;
  assert.ok(G.KUse.inZone('pp', pl).ok);
  assert.equal(m.currentPP, m.runtimeMaxPP);
  S.add('revive', 1); S.setBelt('revive', 'revive');
  pl.itemCd = 0;
  assert.equal(G.KUse.inZone('revive', pl).ok, false);
  pl.dead = true; pl.hp = 0;
  assert.ok(G.KUse.inZone('revive', pl).ok);
  assert.equal(pl.dead, false); assert.equal(pl.hp, 20);
  S.add('escape-rope', 1); S.setBelt('utility', 'escape-rope');
  pl.itemCd = 0; pl.inCombat = true;
  assert.equal(G.KUse.inZone('utility', pl).ok, false);
  pl.inCombat = false;
  assert.equal(G.KUse.inZone('utility', pl, { boss: true }).ok, false);
  const r = G.KUse.inZone('utility', pl);
  assert.ok(r.ok && r.channel);
  assert.equal(S.count('escape-rope'), 1, 'se gasta al terminar de canalizar');
});

// ---------------- PARTIDA ----------------

test('partida: una vieja (v3) recibe el bloque Kanto sin tocar lo demás; recargar conserva Pokémon y bolsa', () => {
  const { G } = boot();
  const db = source('js/core/db.js');
  assert.match(db, /const VERSION = 4;/);
  assert.match(db, /G\.KSave\.migrate\(s\)/);
  assert.match(db, /G\.KSave\.sanitize\(s\)/);
  assert.match(db, /G\.KSave\.merge\(r, older\)/);
  const old = { v: 3, coins: 1234, owned: { 25: 1 }, bag: { mint: 2 } };
  G.KSave.migrate(old);
  G.KSave.sanitize(old);
  assert.equal(old.coins, 1234); assert.deepEqual(old.owned, { 25: 1 }); assert.deepEqual(old.bag, { mint: 2 });
  assert.equal(old.kanto.schemaVersion, 1);
  assert.equal(old.kanto.currencies.pokecoins, G.KCFG.START_POKECOINS);
  // Ida y vuelta (guardar / cargar) con instancias y bolsa.
  G.DB.save = old;
  const p = G.KSave.addPokemon(G.KMon.create({ dex: 1, level: 12 }));
  p.moves[0].currentPP = 7;
  G.KSave.add('ultra-ball', 3);
  const back = JSON.parse(JSON.stringify(old));
  G.KSave.migrate(back); G.KSave.sanitize(back);
  assert.deepEqual(back.kanto.pokemonInstances[p.id], JSON.parse(JSON.stringify(p)));
  assert.equal(back.kanto.bag['ultra-ball'], 3);
  assert.equal(back.kanto.pokemonInstances[p.id].moves[0].currentPP, 7);
  // Lo imposible se quita.
  back.kanto.bag.potion = -5;
  back.kanto.pokemonInstances[p.id].moves[0].currentPP = 9999;
  back.kanto.pokemonInstances[p.id].level = 400;
  G.KSave.sanitize(back);
  assert.equal(back.kanto.bag.potion, undefined);
  assert.equal(back.kanto.pokemonInstances[p.id].moves[0].currentPP, back.kanto.pokemonInstances[p.id].moves[0].runtimeMaxPP);
  assert.equal(back.kanto.pokemonInstances[p.id].level, 100);
  // Fusión de dos copias: nunca se pierde un Pokémon.
  const other = JSON.parse(JSON.stringify(old));
  const q = G.KMon.create({ dex: 7, level: 5 });
  other.kanto.pokemonInstances[q.id] = q;
  G.KSave.merge(back, other);
  assert.ok(back.kanto.pokemonInstances[q.id] && back.kanto.pokemonInstances[p.id]);
});

test('mapas: el editor y el juego usan el mismo formato; el generador es determinista', () => {
  const { G } = boot();
  const { generate } = require('../tools/build_kanto_maps.js');
  const seed = JSON.parse(source('tools/data/KANTO_ZONES_V1.json'));
  const a = generate(seed.zones[0], 0), b = generate(seed.zones[0], 0);
  assert.deepEqual(a, b);
  assert.deepEqual(G.KZones.validateMap(a), []);
  for (const z of seed.zones) assert.deepEqual(JSON.parse(source('tools/data/kanto-maps/' + z.id + '.json')), G.KANTO_MAPS[z.id], z.id + ' empaquetado');
  assert.ok(fs.existsSync(path.join(root, 'tools/map-editor.html')) && fs.existsSync(path.join(root, 'tools/map-editor.js')));
});
