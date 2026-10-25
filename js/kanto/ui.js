/* ============ ui.js (Kanto) — menús del modo Kanto ============
 * Mismo estilo que el resto (cajas, botones, rejillas de PokéSurvivor). Todo
 * en una pantalla (#scr-kanto) con vistas, y una ventana (#scr-kmodal) para
 * lo que va por pasos al salir de una zona: subir de nivel, aprender (y
 * olvidar) movimientos y evolucionar.
 *
 *   inicio      elige Bulbasaur, Charmander o Squirtle (la primera vez)
 *   centro      tu Pokémon activo y los accesos: viajar, Pokémon, bolsa, tienda...
 *   zonas       nivel recomendado, tema, especies, PvP, regalos y viajar
 *   pokemon     tus Pokémon; la ficha con stats, movimientos, PP, objeto...
 *   bolsa       objetos y el cinturón (qué lleva cada hueco)
 *   tienda      Poké Mart (precios de Rojo)
 *   resultados  lo de la zona, con la barra de EXP; luego las ventanas
 */
G.KantoUI = (() => {
  const $ = id => document.getElementById(id);
  const S = () => G.KSave;
  const C = () => G.KCFG;
  // El modo Kanto (beta) va en español: sus pantallas llevan translate="no" (sólo se traducen los nombres de Pokémon).
  const T = s => s;
  const fmt = (s, x) => s.replace('{x}', x);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const STAT_NAME = { hp: 'PS', attack: 'Ataque', defense: 'Defensa', specialAttack: 'At. Esp.', specialDefense: 'Def. Esp.', speed: 'Velocidad' };
  const CAT_NAME = { physical: 'Físico', special: 'Especial', status: 'Estado' };
  const name = dex => G.T((G.DEX_BY[dex] || {}).name || '#' + dex);
  const itemName = id => T(G.KItems.name(id));
  let view = 'hub', arg = null;

  // ---------------- pantalla ----------------

  function open(v = null, a = null) {
    if (!G.DB.save) return;
    if (!S().region().starter && !S().list().length) v = 'starter';
    view = v || (view === 'starter' ? 'hub' : view || 'hub');
    if (v) arg = a;
    G.UI.chrome(true);
    G.UI.show('scr-kanto');
    render();
  }

  function go(v, a = null) { view = v; arg = a; render(); }

  function render() {
    const body = $('k-body');
    const html = { starter, hub, zones, zone: zoneView, pokemon: pokemonList, mon: monView, bag, mart }[view] || hub;
    body.innerHTML = html(arg);
    wire(body);
    $('k-coins').textContent = S().coins().toLocaleString(G.I18n.locale) + ' ₽';
    $('k-back').textContent = T(view === 'hub' || view === 'starter' ? 'Menú principal' : 'Volver');
    $('k-back').onclick = () => {
      if (view === 'hub' || view === 'starter') G.MenuUI.open();
      else go(view === 'mon' ? 'pokemon' : view === 'zone' ? 'zones' : 'hub');
    };
  }

  /** Pinta los sprites y conecta los [data-act] de la vista. */
  function wire(root) {
    root.querySelectorAll('canvas[data-dex]').forEach(cv => {
      G.UI.sprite(cv, +cv.dataset.dex, { scale: +cv.dataset.scale || 2, hero: true, lively: cv.dataset.lively === '1', shiny: cv.dataset.shiny === '1' });
    });
    root.querySelectorAll('[data-act]').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'onchange' : 'onclick';
      el[ev] = () => act(el.dataset.act, el.dataset.v, el);
    });
  }

  const sprite = (dex, w, h, scale = 2, shiny = false, lively = false) =>
    `<canvas class="stage" data-dex="${dex}" data-scale="${scale}" data-shiny="${shiny ? 1 : 0}" data-lively="${lively ? 1 : 0}" width="${w}" height="${h}"></canvas>`;
  const bar = (frac, col = 'var(--gold)') => `<div class="progress k-bar"><i style="width:${Math.round(G.U.clamp(frac, 0, 1) * 100)}%;background:${col}"></i></div>`;

  // ---------------- vistas ----------------

  function starter() {
    return `<h2>${T('Elige tu primer Pokémon')}</h2>
      <p class="sub">${T('Empiezas Kanto desde cero, con tu propio equipo: cada Pokémon sube de nivel, aprende sus movimientos de Rojo y Azul y evoluciona.')}</p>
      <div class="k-starters">${C().STARTERS.map(d => `<button class="cell" data-act="starter" data-v="${d}">${sprite(d, 120, 100, 3, false, true)}
        <b>${name(d)}</b>${G.UI.typeChips(G.DEX_BY[d].types)}</button>`).join('')}</div>`;
  }

  function hub() {
    const p = S().active();
    if (!p) return `<p class="sub">${T('No tienes ningún Pokémon.')}</p>`;
    const st = G.KMon.calcStats(p), pr = G.KMon.xpProgress(p);
    const fossils = G.KItems.LIST.filter(i => i.cat === 'fossil' && S().count(i.id) > 0);
    const lab = S().discovered(C().FOSSIL_LAB_ZONE);
    return `<div class="k-hub">
      <div class="k-active">${sprite(p.dex, 200, 160, 4, p.shiny, true)}
        <div class="nm">${name(p.dex)} <span class="gold">Nv.${p.level}</span></div>
        <div>${G.UI.typeChips(G.DEX_BY[p.dex].types)}</div>
        ${bar(pr.frac, '#4fd1ff')}<small class="sub">${p.level >= C().MAX_LEVEL ? T('Nivel máximo') : pr.into + ' / ' + pr.need + ' EXP'}</small>
        <div class="k-mini">${G.KMon.STATS.map(s => `<span>${T(STAT_NAME[s])} <b>${st[s]}</b></span>`).join('')}</div>
      </div>
      <div class="cards k-acts">
        <button class="card" data-act="go" data-v="zones"><div class="ico">${G.Icons.html('ball', 28)}</div><div class="txt"><div class="nm">Viajar</div><div class="ds">Zonas de Kanto</div></div></button>
        <button class="card" data-act="go" data-v="pokemon"><div class="ico">${G.Icons.html('book', 28)}</div><div class="txt"><div class="nm">Pokémon</div><div class="ds">${S().list().length} en tu equipo</div></div></button>
        <button class="card" data-act="go" data-v="bag"><div class="ico">${G.Icons.html('bag', 28)}</div><div class="txt"><div class="nm">Bolsa y cinturón</div><div class="ds">Lo que llevas a cada zona</div></div></button>
        <button class="card" data-act="go" data-v="mart"><div class="ico">${G.Icons.html('shop', 28)}</div><div class="txt"><div class="nm">Poké Mart</div><div class="ds">Balls, pociones y más</div></div></button>
        <button class="card" data-act="heal"><div class="ico">${G.Icons.html('heart', 28)}</div><div class="txt"><div class="nm">Centro Pokémon</div><div class="ds">Recupera los PP de todos (gratis)</div></div></button>
        ${fossils.length ? `<button class="card" data-act="fossil" ${lab ? '' : 'disabled'}><div class="ico">${G.Icons.html('rock', 28)}</div><div class="txt"><div class="nm">Laboratorio de Cinnabar</div><div class="ds">${lab ? 'Revive un fósil' : 'Descubre Cinnabar para revivir fósiles'}</div></div></button>` : ''}
      </div></div>
      <p class="note">${T('Modo Kanto (beta): la EXP, el botín y las capturas de una zona se aplican al salir de ella.')}</p>`;
  }

  function zoneOpen(i, list) { return i === 0 || S().discovered(list[i - 1].id) || S().discovered(list[i].id); }

  function zones() {
    const p = S().active(), list = G.KZones.all();
    return `<h2>${T('Zonas de Kanto')}</h2>
      <p class="sub">${T('Las zonas descubiertas siguen abiertas siempre. El nivel recomendado es para tu Pokémon activo')} (${name(p.dex)} Nv.${p.level}).</p>
      <div class="cards k-zones">${list.map((z, i) => {
        const ok = zoneOpen(i, list), [a, b] = z.recommendedLevel;
        const fit = p.level < a ? '#ff8a96' : p.level > b ? '#ffb36b' : '#5fe08a';
        return `<button class="card" data-act="zone" data-v="${z.id}" ${ok ? '' : 'disabled'}>
          <div class="ico" style="background:${G.U.TYPE_COLOR[z.theme] || '#556'}">${G.Icons.html('type:' + z.theme, 28)}</div>
          <div class="txt"><div class="nm">${esc(T(z.name))}</div>
          <div class="ds">${ok ? `<span style="color:${fit}">Nv.${a}–${b}</span> · ${S().discovered(z.id) ? T('Descubierta') : T('Nueva')}` : T('Descubre la zona anterior')}</div></div></button>`;
      }).join('')}</div>`;
  }

  function zoneView(id) {
    const z = G.KZones.get(id), p = S().active(), disc = S().discovered(id);
    const [a, b] = z.recommendedLevel;
    const over = G.KMon.overlevelMult(p.level, b);
    const sp = G.KZones.species(z);
    const gifts = C().GIFTS.filter(g => g.zoneId === id);
    const kills = ((S().region().zoneStats[id] || {}).kills) || 0;
    return `<h2>${esc(T(z.name))}</h2>
      <div class="sum-stats">
        <div><span>${T('Nivel recomendado')}</span><b>${a}–${b}</b></div>
        <div><span>${T('Tu Pokémon')}</span><b>${name(p.dex)} Nv.${p.level}</b></div>
        <div><span>${T('Tema')}</span><b>${G.UI.typeChips([z.theme])}</b></div>
        <div><span>${T('Combate entre jugadores')}</span><b>${z.pvpMode === 'none' ? T('No') : T('Sólo duelos aceptados')}</b></div>
        <div><span>${T('EXP')}</span><b>${over < 1 ? '×' + over + ' ' + T('(muy por encima)') : '×1'}</b></div>
        <div><span>${T('Derrotados aquí')}</span><b>${kills}</b></div>
      </div>
      ${z.gauntlet ? `<h3>${T('Alto Mando y Campeón')}</h3><p class="sub">${T('Cinco combates seguidos contra los equipos de Rojo y Azul. Sin capturas.')}${S().region().leagueCleared ? ' ✔ ' + T('Vencida') : ''}</p>` : ''}
      ${sp.length ? `<h3>${T('Pokémon salvajes')}</h3><div class="chips">${sp.map(d => `<span class="chip">${disc || S().data().dex.seen[d] ? name(d) : '???'}</span>`).join('')}</div>` : ''}
      ${z.staticBosses.length ? `<h3>${T('Encuentros especiales')}</h3><div class="chips">${z.staticBosses.map(s => `<span class="chip">${disc ? name(s.dex) : '???'} Nv.${s.level}</span>`).join('')}</div>` : ''}
      ${gifts.length ? `<h3>${T('Regalos')}</h3>${gifts.map(g => giftRow(g, kills)).join('')}` : ''}
      <div class="row" style="margin-top:14px"><button class="btn gold grow" data-act="travel" data-v="${id}">${T('Viajar')}</button></div>`;
  }

  function giftState(g, kills) {
    const got = S().region().gifts[g.id];
    if (got) return 'got';
    if (g.after && !S().region().gifts[g.after]) return 'locked';
    return kills >= g.needKills ? 'ready' : 'locked';
  }
  function giftOptions(g) {
    const prev = g.other && S().region().gifts[g.other];
    return g.dex.filter(d => !(prev && prev.dex === d));
  }
  function giftRow(g, kills) {
    const s = giftState(g, kills), opts = giftOptions(g);
    const what = opts.map(name).join(' / ');
    if (s === 'got') return `<p class="sub">✔ ${what}</p>`;
    if (s === 'locked') return `<p class="sub">${what}: ${T('vence')} ${g.needKills} ${T('salvajes aquí')} (${kills}/${g.needKills})</p>`;
    return `<div class="row">${opts.map(d => `<button class="btn small gold" data-act="gift" data-v="${g.id}:${d}">${T('Recibir')} ${name(d)}</button>`).join('')}</div>`;
  }

  function pokemonList() {
    const act = S().data().activePokemonId;
    return `<h2>${T('Tus Pokémon')}</h2><div class="grid">${S().list().map(p => `<button class="cell ${p.id === act ? 'on' : ''}" data-act="mon" data-v="${p.id}">
      ${sprite(p.dex, 92, 80, 2, p.shiny)}<b>${name(p.dex)}</b><small>Nv.${p.level}</small></button>`).join('')}</div>`;
  }

  function moveRow(m, i, p) {
    const meta = G.GEN1_MOVES.BY[m.id], d = G.KMoves.def(m.id);
    return `<tr><td>${G.Icons.html('move:' + m.id, 18)} ${esc(T(meta.name))}${d.placeholder ? ' <small class="sub">(' + T('efecto provisional') + ')</small>' : ''}</td>
      <td>${G.UI.typeChips([meta.type])}</td><td>${T(CAT_NAME[meta.category])}</td>
      <td class="num">${meta.power > 1 ? meta.power : '—'}</td><td class="num">${m.currentPP}/${m.runtimeMaxPP}</td>
      <td>${p ? `<button class="btn small ghost" data-act="ether" data-v="${p.id}:${i}">${T('Éter')}</button>` : ''}</td></tr>`;
  }

  function monView(id) {
    const p = S().get(id);
    if (!p) return pokemonList();
    const sp = G.GEN1.BY[p.dex], st = G.KMon.calcStats(p), pr = G.KMon.xpProgress(p);
    const act = S().data().activePokemonId === id;
    const nxt = G.KMon.nextMove(p.dex, p.level);
    const evo = G.KMon.nextEvolutions(p.dex).map(e => name(e.to) + ' (' + (e.method === 'level' ? 'Nv.' + e.level : e.method === 'item' ? itemName(e.item) : itemName('link-cable')) + ')').join(', ');
    const usable = G.KItems.LIST.filter(it => ['stone', 'vitamin', 'candy', 'link', 'held'].includes(it.cat) && S().count(it.id) > 0);
    const c = p.caught || {};
    const from = { starter: 'Pokémon inicial', capture: 'Capturado', gift: 'Regalo', fossil: 'Fósil revivido' }[c.from] || 'Capturado';
    return `<div class="k-mon">
      <div class="k-active">${sprite(p.dex, 200, 160, 4, p.shiny, true)}
        <div class="nm">${name(p.dex)} <span class="gold">Nv.${p.level}</span></div>
        <div>${G.UI.typeChips(G.DEX_BY[p.dex].types)}</div>
        ${bar(pr.frac, '#4fd1ff')}<small class="sub">${T('EXP total')} ${p.totalXp.toLocaleString(G.I18n.locale)}${p.level < C().MAX_LEVEL ? ' · ' + T('faltan') + ' ' + (pr.need - pr.into) : ''}</small>
        ${act ? `<p class="gold">${T('Pokémon activo')}</p>` : `<button class="btn gold" data-act="setactive" data-v="${id}">${T('Hacer activo')}</button>`}
      </div>
      <div class="grow">
        <h3>${T('Estadísticas')}</h3>
        <div class="sum-stats">${G.KMon.STATS.map(s => `<div><span>${T(STAT_NAME[s])} <small>(${sp.baseStats[s]})</small></span><b>${st[s]}${p.training[s] ? ' <small>+' + p.training[s] + ' ' + T('ent.') + '</small>' : ''}</b></div>`).join('')}</div>
        <h3>${T('Movimientos')}</h3>
        <table class="sum-moves k-moves"><tr><th></th><th></th><th></th><th class="num">${T('Pot.')}</th><th class="num">PP</th><th></th></tr>${p.moves.map((m, i) => moveRow(m, i, p)).join('')}</table>
        <div class="sum-stats">
          <div><span>${T('Objeto')}</span><b>${p.heldItemId ? itemName(p.heldItemId) + ` <button class="btn small ghost" data-act="unequip" data-v="${id}">${T('Quitar')}</button>` : T('Ninguno')}</b></div>
          <div><span>${T('Entrenamiento')}</span><b>${G.KMon.trainingTotal(p)} / ${C().EV_MAX_TOTAL}</b></div>
          <div><span>${T('Próximo movimiento')}</span><b>${nxt ? esc(T(G.GEN1_MOVES.BY[nxt.move].name)) + ' (Nv.' + nxt.level + ')' : '—'}</b></div>
          <div><span>${T('Evoluciona a')}</span><b>${evo || '—'}</b></div>
          <div><span>${T('Origen')}</span><b>${T(from)}${c.zoneId ? ' · ' + esc(T((G.KZones.get(c.zoneId) || {}).name || '')) : ''} · Nv.${c.level || '?'}</b></div>
          <div><span>${T('Crecimiento')}</span><b>${sp.growthRate.replace('_', ' ')}</b></div>
        </div>
        ${usable.length ? `<div class="row" style="margin-top:10px"><select class="field" id="k-use" style="width:auto">${usable.map(it => `<option value="${it.id}">${itemName(it.id)} ×${S().count(it.id)}</option>`).join('')}</select>
          <button class="btn small gold" data-act="use" data-v="${id}">${T('Usar')}</button></div>` : ''}
      </div></div>`;
  }

  function bag() {
    const cats = [['ball', 'Balls'], ['heal', 'Curación'], ['pp', 'PP'], ['revive', 'Revivir'], ['utility', 'Utilidad'],
                  ['stone', 'Piedras'], ['vitamin', 'Vitaminas'], ['candy', 'Caramelos'], ['link', 'Intercambio'], ['fossil', 'Fósiles'], ['held', 'Objetos para llevar']];
    const belt = G.KItems.BELT.map(b => {
      const opts = G.KItems.LIST.filter(it => it.cat === b.cat && S().count(it.id) > 0);
      const cur = S().belt(b.id);
      return `<div><span>${T(b.name)}${b.id === 'ball' ? ' <small>(' + T('captura al vencer') + ')</small>' : ''}</span>
        <select class="field" data-act="belt" data-v="${b.id}" style="width:auto"><option value="">${T('Nada')}</option>
        ${opts.map(it => `<option value="${it.id}" ${it.id === cur ? 'selected' : ''}>${itemName(it.id)} ×${S().count(it.id)}</option>`).join('')}
        ${cur && !opts.some(o => o.id === cur) ? `<option value="${cur}" selected>${itemName(cur)} ×0</option>` : ''}</select></div>`;
    }).join('');
    const rows = cats.map(([cat, t]) => {
      const its = G.KItems.LIST.filter(it => it.cat === cat && S().count(it.id) > 0);
      return its.length ? `<h3>${T(t)}</h3><div class="chips">${its.map(it => `<span class="chip">${G.Icons.html(it.icon, 16)} ${itemName(it.id)} ×${S().count(it.id)}</span>`).join('')}</div>` : '';
    }).join('');
    return `<h2>${T('Bolsa')}</h2>
      <h3>${T('Cinturón')}</h3><p class="sub">${T('Lo que puedes usar dentro de una zona (teclas 5-8 o tocándolo). Sin Ball en su hueco no se intenta capturar.')}</p>
      <div class="sum-stats k-belt">${belt}</div>${rows || '<p class="sub">' + T('La bolsa está vacía.') + '</p>'}`;
  }

  function mart() {
    return `<h2>${T('Poké Mart')}</h2><p class="sub">${T('Tienes')} ${S().coins().toLocaleString(G.I18n.locale)} ₽</p>
      <div class="cards">${G.KItems.shop().map(it => `<div class="card"><div class="ico">${G.Icons.html(it.icon, 28)}</div>
        <div class="txt"><div class="nm">${itemName(it.id)}</div><div class="ds">${it.price} ₽ · ${T('tienes')} ${S().count(it.id)}</div></div>
        <button class="btn small" data-act="buy" data-v="${it.id}:1">×1</button><button class="btn small gold" data-act="buy" data-v="${it.id}:5">×5</button></div>`).join('')}</div>`;
  }

  // ---------------- acciones ----------------

  function act(a, v, el) {
    if (a === 'go') return go(v);
    if (a === 'starter') {
      const inst = G.KMon.create({ dex: +v, level: 5, from: 'starter' });
      S().addPokemon(inst);
      S().setActive(inst.id);
      S().region().starter = +v;
      S().commit();
      G.Audio.sfx('confirm');
      return go('hub');
    }
    if (a === 'zone') return go('zone', v);
    if (a === 'travel') { G.Audio.sfx('confirm'); G.Game.startKanto(v); return; }
    if (a === 'mon') return go('mon', v);
    if (a === 'setactive') { S().setActive(v); S().commit(); return render(); }
    if (a === 'heal') { G.KUse.heal(); S().commit(); G.UI.toast(T('¡Tus Pokémon tienen todos sus PP!')); G.Audio.sfx('heal'); return; }
    if (a === 'unequip') { G.KUse.unequip(S().get(v)); S().commit(); return render(); }
    if (a === 'belt') { S().setBelt(v, el.value || null); S().commit(); return; }
    if (a === 'buy') {
      const [id, n] = v.split(':');
      const r = G.KUse.buy(id, +n);
      G.UI.toast(T(r.msg)); G.Audio.sfx(r.ok ? 'coin' : 'error');
      S().commit();
      return render();
    }
    if (a === 'ether') {
      const [id, i] = v.split(':'), p = S().get(id);
      const it = G.KItems.LIST.find(x => x.cat === 'pp' && S().count(x.id) > 0);
      if (!it) { G.UI.toast(T('No tienes Éteres ni Elixires')); return; }
      const r = G.KUse.onPokemon(it.id, p, +i);
      G.UI.toast(itemName(it.id) + ': ' + T(r.msg));
      S().commit();
      return render();
    }
    if (a === 'use') {
      const p = S().get(v), id = $('k-use').value;
      const r = G.KUse.onPokemon(id, p, 0);
      G.UI.toast(T(r.msg));
      G.Audio.sfx(r.ok ? 'confirm' : 'error');
      if (r.events) return runEvents(p, r.events, () => { S().commit(); open('mon', v); });
      S().commit();
      return render();
    }
    if (a === 'gift') {
      const [gid, d] = v.split(':');
      const g = C().GIFTS.find(x => x.id === gid);
      const kills = ((S().region().zoneStats[g.zoneId] || {}).kills) || 0;
      if (giftState(g, kills) !== 'ready' || !giftOptions(g).includes(+d)) return;
      const inst = S().addPokemon(G.KMon.create({ dex: +d, level: g.level || C().GIFT_LEVEL_DEFAULT, zoneId: g.zoneId, from: 'gift' }));
      S().region().gifts[gid] = { t: Date.now(), dex: +d, id: inst.id };
      S().commit();
      G.Audio.sfx('shinyGet');
      G.UI.toast(fmt('¡{x} se une a tu equipo!', name(+d)));
      return render();
    }
    if (a === 'fossil') {
      const f = G.KItems.LIST.find(i => i.cat === 'fossil' && S().count(i.id) > 0);
      const inst = f && G.KUse.reviveFossil(f.id);
      if (inst) { S().commit(); G.Audio.sfx('shinyGet'); G.UI.toast(fmt('¡{x} se une a tu equipo!', name(inst.dex))); }
      return render();
    }
  }

  // ---------------- resultados y ventanas ----------------

  const HOW = { exit: 'Has salido de la zona', rope: 'Cuerda Huida: a salvo', death: 'Tu Pokémon se ha debilitado', quit: 'Has salido de la zona', league: '¡Campeón de la Liga Pokémon!' };

  /** Resultados de una zona; al cerrar, las ventanas de nivel, movimientos y evolución, y `done`. */
  function results(res, done) {
    G.UI.chrome(false);
    G.UI.show('scr-kanto');
    const p = S().get(res.instId);
    const b = res.before || { level: p.level, totalXp: p.totalXp, dex: p.dex };
    const at = (dex, lv) => G.KMon.expAt(dex, lv);
    const f0 = p.level >= C().MAX_LEVEL ? 1 : (b.totalXp - at(b.dex, b.level)) / Math.max(1, at(b.dex, b.level + 1) - at(b.dex, b.level));
    const pr = G.KMon.xpProgress(p);
    const defeated = Object.entries(res.defeated).map(([d, n]) => `<span class="chip">${name(+d)} ×${n}</span>`).join('');
    const items = Object.entries(res.items).map(([id, n]) => `<span class="chip">${G.Icons.html(G.KItems.BY[id].icon, 14)} ${itemName(id)} ×${n}</span>`).join('');
    const caps = res.captures.map(id => { const c = S().get(id); return c ? `<span class="chip on">${name(c.dex)} Nv.${c.level}</span>` : ''; }).join('');
    const lost = res.dropped && (res.dropped.coins || Object.keys(res.dropped.items).length)
      ? `<p class="err">${T('Al caer has perdido')} ${res.dropped.coins} ₽${Object.entries(res.dropped.items).map(([id, n]) => ', ' + itemName(id) + ' ×' + n).join('')}</p>` : '';
    $('k-body').innerHTML = `<h2>${T(HOW[res.how] || HOW.exit)}</h2>
      <div class="k-res">${sprite(b.dex, 140, 110, 3, p.shiny, true)}
        <div class="grow"><div class="nm">${name(b.dex)} <span class="gold" id="k-res-lv">Nv.${b.level}</span></div>
        <div class="progress k-bar"><i id="k-res-xp" style="width:${Math.round(f0 * 100)}%;background:#4fd1ff"></i></div>
        <small class="sub">+${res.xp} EXP</small></div></div>
      <div class="stats">
        <div><span>${T('Derrotados')}</span><b>${res.kills}</b></div>
        <div><span>${T('Pokémonedas')}</span><b>+${res.coins}</b></div>
        <div><span>${T('Capturas')}</span><b>${res.captures.length}</b></div>
        <div><span>${T('Escapados')}</span><b>${res.failed.length}</b></div>
      </div>
      ${defeated ? `<h3>${T('Especies vencidas')}</h3><div class="chips">${defeated}</div>` : ''}
      ${items ? `<h3>${T('Objetos')}</h3><div class="chips">${items}</div>` : ''}
      ${caps ? `<h3>${T('Capturados')}</h3><div class="chips">${caps}</div>` : ''}
      ${lost}
      <div class="row" style="margin-top:14px"><button class="btn gold grow" id="k-res-ok">${T('Continuar')}</button></div>`;
    $('k-coins').textContent = S().coins().toLocaleString(G.I18n.locale) + ' ₽';
    $('k-back').textContent = '';
    $('k-back').onclick = null;
    wire($('k-body'));
    // La barra se llena (y da la vuelta tantas veces como niveles haya subido).
    const lv = p.level - b.level;
    const xp = $('k-res-xp');
    let step = 0;
    const tickBar = () => {
      if (!xp.isConnected) return;
      if (step < lv) { xp.style.width = '100%'; step++; setTimeout(() => { xp.style.transition = 'none'; xp.style.width = '0%'; $('k-res-lv').textContent = 'Nv.' + (b.level + step); void xp.offsetWidth; xp.style.transition = ''; tickBar(); }, 420); }
      else xp.style.width = Math.round(pr.frac * 100) + '%';
    };
    setTimeout(tickBar, 300);
    $('k-res-ok').onclick = () => runEvents(p, res.events, () => { S().commit(); done(); });
  }

  /** Las ventanas, una detrás de otra: nivel, aprender / olvidar, evolución. */
  function runEvents(p, events, done) {
    const q = events.slice();
    // El nombre que se ve es el de antes de evolucionar, hasta la ventana de evolución.
    let dex = (q.find(e => e.type === 'evolve') || { from: p.dex }).from;
    const next = () => {
      const e = q.shift();
      if (!e) { G.UI.hide('scr-kmodal'); done(); return; }
      if (e.type === 'level') return modal(`<h2>${fmt('¡{x} sube de nivel!', name(dex))} <span class="gold">Nv.${e.level}</span></h2>
        <div class="sum-stats">${G.KMon.STATS.map(s => `<div><span>${T(STAT_NAME[s])}</span><b>${e.after[s]} <small class="gold">+${e.after[s] - e.before[s]}</small></b></div>`).join('')}</div>`, [[T('Continuar'), next]]);
      if (e.type === 'learn') return modal(`<h2>${fmt('¡{x} ha aprendido', name(dex))} ${esc(T(G.GEN1_MOVES.BY[e.move].name))}!</h2>`, [[T('Continuar'), next]]);
      if (e.type === 'learnChoice') {
        const mv = G.GEN1_MOVES.BY[e.move];
        if (G.KMon.knows(p, e.move)) return next();
        if (p.moves.length < C().MAX_MOVES) { G.KMon.learn(p, e.move); return next(); }
        return modal(`<h2>${fmt('{x} quiere aprender', name(dex))} ${esc(T(mv.name))}</h2>
          <p class="sub">${G.UI.typeChips([mv.type])} ${T(CAT_NAME[mv.category])} · ${T('Pot.')} ${mv.power > 1 ? mv.power : '—'} · PP ${mv.pp}</p>
          <p>${T('Ya sabe 4 movimientos. ¿Cuál olvida?')}</p>`,
          p.moves.map((m, i) => [T(G.GEN1_MOVES.BY[m.id].name), () => { G.KMon.learn(p, e.move, i); G.Audio.sfx('confirm'); next(); }])
            .concat([[T('No aprenderlo'), next, 'ghost']]));
      }
      if (e.type === 'evolve') {
        G.Audio.sfx('legend');
        dex = e.to;
        return modal(`<h2>${fmt('¡{x} ha evolucionado', name(e.from))}!</h2>${sprite(e.to, 200, 160, 4, p.shiny, true)}
          <p class="center">${fmt('Ahora es {x}', name(e.to))}</p>`, [[T('Continuar'), next]]);
      }
      next();
    };
    next();
  }

  function modal(html, buttons) {
    const box = $('k-modal');
    box.innerHTML = html + `<div class="row" style="margin-top:14px">${buttons.map(([t, , cls], i) => `<button class="btn ${cls || 'gold'} grow" data-i="${i}">${esc(t)}</button>`).join('')}</div>`;
    wire(box);
    box.querySelectorAll('button[data-i]').forEach(b => { b.onclick = () => buttons[+b.dataset.i][1](); });
    $('scr-kmodal').classList.remove('hidden');
  }

  // ---------------- pausa ----------------

  function pauseSummary() {
    const pl = G.Game.player, sess = G.KZone.session;
    if (!pl || !pl.inst) return '';
    const st = pl.kstats;
    return `<div translate="no"><h3>${name(pl.inst.dex)} Nv.${pl.level}</h3>
      <table class="sum-moves">${pl.inst.moves.map(m => moveRow(m, 0, null)).join('')}</table>
      <div class="sum-stats">${G.KMon.STATS.map(s => `<div><span>${T(STAT_NAME[s])}</span><b>${s === 'hp' ? Math.ceil(pl.hp) + ' / ' : ''}${st[s]}</b></div>`).join('')}</div>
      ${sess ? `<h3>${T('En esta zona')}</h3><div class="sum-stats"><div><span>${T('EXP pendiente')}</span><b>${sess.xp}</b></div>
        <div><span>${T('Pokémonedas')}</span><b>${sess.coins}</b></div><div><span>${T('Derrotados')}</span><b>${sess.kills}</b></div>
        <div><span>${T('Capturas')}</span><b>${sess.captures.length}</b></div></div>` : ''}
      <p class="sub">${T('Salir desde aquí en pleno combate cuenta como debilitarse (pierdes parte del botín). Mejor: la SALIDA o una Cuerda Huida.')}</p></div>`;
  }

  return { open, go, results, runEvents, pauseSummary, get view() { return view; } };
})();
