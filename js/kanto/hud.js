/* ============ hud.js (Kanto) — interfaz dentro de una zona ============
 * Como el HUD de PokéSurvivor (mismo estilo, mismas barras), con lo de Kanto:
 *   arriba a la izquierda   tu Pokémon, nivel, vida y la EXP pendiente
 *   arriba en el centro     zona, nivel recomendado, Pokémonedas y derrotados
 *   arriba a la derecha     el salvaje al que apuntas: nombre, nivel y vida
 *   abajo                   4 ataques (PP y recarga) y el cinturón (teclas 5-8)
 * En el móvil, tocar un ataque lo lanza y tocar un hueco del cinturón lo usa.
 */
G.KHUD = (() => {
  const F = (w, s) => `${w} ${s}px Pixelify,"Segoe UI",system-ui,sans-serif`;
  const rr = (...a) => G.HUD.roundRect(...a);
  const bar = (...a) => G.HUD.bar(...a);
  // Teclas 5-8 -> hueco del cinturón (la Ball no se usa a mano: va sola al vencer).
  const BELT_KEYS = ['heal', 'pp', 'revive', 'utility'];

  function text(ctx, s, x, y, font, col, align = 'left') {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align;
    G.I18n.rawCanvas(ctx, 'fillText', s, x, y);      // (en español, como los menús de Kanto)
  }

  function draw(ctx, w, h, pl, st) {
    const z = G.KZone.zone, sess = G.KZone.session;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    G.Touch.clearButtons();
    const touch = G.Touch.active, sa = G.Touch.safeArea();

    // ---------- tu Pokémon ----------
    const px = 16 + sa.left, py = 20 + sa.top;
    text(ctx, G.T(pl.mon.name), px, py + 10, F(800, 13), '#eaf2ff');
    text(ctx, 'Nv.' + ' ' + pl.level, px, py + 26, F(700, 11), '#ffcb3d');
    bar(ctx, px + 48, py + 17, 168, 11, pl.hp / pl.maxHp, pl.hp / pl.maxHp < 0.25 ? '#ff5f6d' : pl.hp / pl.maxHp < 0.5 ? '#ffcb3d' : '#5fe08a');
    text(ctx, Math.ceil(pl.hp) + ' / ' + Math.round(pl.maxHp), px + 132, py + 26, F(700, 10), 'rgba(255,255,255,.95)', 'center');
    const prog = G.KMon.xpProgress(pl.inst);
    bar(ctx, px + 48, py + 32, 168, 5, prog.frac, '#4fd1ff');
    if (sess && sess.xp > 0) text(ctx, '+' + sess.xp + ' ' + 'EXP pendiente', px + 48, py + 50, F(700, 10), '#7fe0ff');

    // ---------- zona ----------
    if (z) {
      text(ctx, z.name, w / 2, 28 + sa.top, F(800, 15), 'rgba(255,255,255,.95)', 'center');
      const rec = z.recommendedLevel;
      const over = pl.level > rec[1];
      text(ctx, 'Recomendado' + ' Nv.' + rec[0] + '–' + rec[1] + (over ? '  ·  ' + 'EXP reducida' : ''), w / 2, 44 + sa.top, F(600, 10), over ? '#ffb36b' : '#8fa3c4', 'center');
      if (sess) text(ctx, sess.coins + ' ₽  ·  ' + sess.kills + ' ' + 'derrotados' + (sess.captures.length ? '  ·  ' + sess.captures.length + ' ' + 'capturas' : ''), w / 2, 58 + sa.top, F(700, 10), '#ffd23f', 'center');
    }

    // ---------- objetivo ----------
    const t = G.KZone.target();
    if (t) {
      const tw = 190, tx = w - tw - 16 - sa.right - (touch ? 52 : 0), ty = 14 + sa.top;
      rr(ctx, tx, ty, tw, 40, 9); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill();
      text(ctx, G.T(t.name), tx + 10, ty + 15, F(800, 11), t.boss ? '#ffcb3d' : '#eaf2ff');
      text(ctx, 'Nv.' + t.level, tx + tw - 10, ty + 15, F(700, 10), '#ffcb3d', 'right');
      bar(ctx, tx + 10, ty + 23, tw - 20, 8, t.hp / t.maxHp, t.boss ? '#ffcb3d' : '#ff6b6b');
    }

    // ---------- cartel ----------
    const ban = G.Spawner.banner();
    if (ban) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, ban.t * 1.6);
      ctx.lineWidth = 4; ctx.strokeStyle = '#20160a';
      ctx.font = F(800, 22); ctx.textAlign = 'center';
      G.I18n.rawCanvas(ctx, 'strokeText', ban.text, w / 2, h * 0.3);
      ctx.fillStyle = '#ffcb3d'; G.I18n.rawCanvas(ctx, 'fillText', ban.text, w / 2, h * 0.3);
      ctx.restore();
    }

    // ---------- caído: ventana para Revivir ----------
    if (pl.dead && z) {
      const rev = G.KSave.belt('revive'), n = rev ? G.KSave.count(rev) : 0;
      const left = Math.max(0, Math.ceil(G.KCFG.REVIVE_WINDOW - G.KZone.downT));
      const msg = n > 0 ? '¡Debilitado! Usa ' + G.KItems.name(rev) + ' (tecla 7) · ' + left + ' s' : '¡Debilitado!';
      text(ctx, msg, w / 2, h * 0.42, F(800, 18), '#ff8a96', 'center');
    }

    // ---------- ataques ----------
    const S = 54, GAP = 9, BS = 44, BGAP = 6;
    const nb = G.KItems.BELT.length;
    const beltW = nb * BS + (nb - 1) * BGAP;
    const totalW = 4 * S + 3 * GAP + 22 + beltW;
    const sx = Math.max(8, (w - totalW) / 2);
    const sy = h - S - 18 - (touch ? Math.min(28, sa.bottom) : 0);
    for (let i = 0; i < 4; i++) {
      const m = pl.moves[i];
      const on = i === pl.active;
      const x = sx + i * (S + GAP), y = on ? sy - 6 : sy;
      if (m) G.Touch.addButton(x, y, S, S, () => { if (G.Game.state === 'playing') pl.tapMove(i); }, GAP / 2 + 3);
      const col = m ? G.U.TYPE_COLOR[m.type] : '#4a5468';
      rr(ctx, x, y, S, S, 12);
      ctx.fillStyle = on ? 'rgba(20,30,50,.95)' : 'rgba(10,16,28,.8)'; ctx.fill();
      ctx.lineWidth = on ? 2.5 : 1.2;
      ctx.strokeStyle = on ? col : 'rgba(140,170,210,.22)'; ctx.stroke();
      if (!m) continue;
      const cd = G.U.clamp(m.t / (m.cd * pl.cdMul), 0, 1), empty = m.slot.currentPP <= 0;
      G.Icons.draw(ctx, 'move:' + m.id, x + (S - 32) / 2, y + (S - 32) / 2 - 4, 32);
      if (cd > 0 || empty) {
        ctx.save(); rr(ctx, x, y, S, S, 12); ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x, y, S, empty ? S : S * cd);
        ctx.restore();
      }
      text(ctx, m.slot.currentPP + '/' + m.slot.runtimeMaxPP, x + S / 2, y + S - 4, F(700, 9), empty ? '#ff8a96' : 'rgba(220,230,250,.85)', 'center');
      text(ctx, String(i + 1), x + 3, y + 10, F(800, 9), on ? col : 'rgba(180,200,230,.6)');
      if (m.placeholder) text(ctx, '•', x + S - 8, y + 10, F(800, 10), '#8fa3c4');
      if (on) text(ctx, m.name, x + S / 2, y - 7, F(700, 10), col, 'center');
    }

    // ---------- cinturón ----------
    const bx0 = sx + 4 * S + 3 * GAP + 22, by = sy + S - BS;
    G.KItems.BELT.forEach((b, i) => {
      const id = G.KSave.belt(b.id), it = id && G.KItems.BY[id], n = id ? G.KSave.count(id) : 0;
      const x = bx0 + i * (BS + BGAP);
      const key = BELT_KEYS.indexOf(b.id);
      if (key >= 0) G.Touch.addButton(x, by, BS, BS, () => { if (G.Game.state === 'playing') G.KZone.useBelt(b.id); }, BGAP / 2 + 2);
      rr(ctx, x, by, BS, BS, 10);
      ctx.fillStyle = it ? 'rgba(30,24,10,.88)' : 'rgba(10,16,28,.55)'; ctx.fill();
      ctx.lineWidth = 1.4; ctx.strokeStyle = b.id === 'ball' ? (it ? '#ff6b6b' : 'rgba(255,107,107,.35)') : it ? '#ffd23f' : 'rgba(140,170,210,.18)'; ctx.stroke();
      if (it) {
        G.Icons.draw(ctx, it.icon, x + (BS - 26) / 2, by + (BS - 26) / 2 - 3, 26);
        text(ctx, '×' + n, x + BS - 4, by + BS - 4, F(800, 9), n ? '#fff' : '#ff8a96', 'right');
        if ((pl.itemCd || 0) > 0 && key >= 0) {
          ctx.save(); rr(ctx, x, by, BS, BS, 10); ctx.clip();
          ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x, by, BS, BS * pl.itemCd / G.KCFG.ITEM_SHARED_CD);
          ctx.restore();
        }
      } else text(ctx, b.name, x + BS / 2, by + BS / 2 + 3, F(700, 8), 'rgba(180,200,230,.5)', 'center');
      if (key >= 0 && !touch) text(ctx, String(key + 5), x + 3, by + 10, F(800, 9), 'rgba(180,200,230,.7)');
      if (b.id === 'ball') text(ctx, it ? 'Captura' : 'Sin Ball', x + BS / 2, by - 5, F(700, 9), it ? '#ff9a9a' : '#8fa3c4', 'center');
    });

    // ---------- pausa (táctil) ----------
    if (touch) {
      const bs = 40, bx = w - 52 - Math.min(44, sa.right), byy = 12 + Math.min(20, sa.top);
      rr(ctx, bx, byy, bs, bs, 10);
      ctx.fillStyle = 'rgba(10,16,28,.7)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(244,248,255,.8)'; ctx.stroke();
      ctx.fillStyle = '#f4f8ff';
      ctx.fillRect(bx + 13, byy + 11, 5, 18); ctx.fillRect(bx + 22, byy + 11, 5, 18);
      G.Touch.addButton(bx, byy, bs, bs, () => G.Game.togglePause(), 8);
    }

    // ---------- pista ----------
    if (st.time < 10 && !touch) {
      text(ctx, 'Clic / Espacio: atacar · 1-4: ataque · 5-8: cinturón · Quédate en la SALIDA para volver', w / 2, sy - 30, F(600, 10), 'rgba(200,215,240,.75)', 'center');
    }
    ctx.restore();
  }

  return { draw, BELT_KEYS };
})();
