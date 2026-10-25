/* ============ wild.js — Pokémon salvajes de las zonas de Kanto ============
 * Un salvaje tiene nivel FIJO (el de su zona, nunca el tuyo), sus stats de
 * ese nivel, los 4 movimientos más recientes que habría aprendido y sus PP.
 *
 * IA sencilla:
 *   pasea por su zona de aparición  ->  se enfada si te acercas o le pegas
 *   (y avisa a los suyos cercanos)  ->  elige un movimiento que pueda usar,
 *   avisa en el suelo y lo lanza, guardando la distancia que le va a ese
 *   ataque  ->  si te alejas demasiado de su zona o te pierde de vista un
 *   rato, vuelve a casa y se cura (no persigue para siempre).
 *
 * Reutiliza el enemigo de PokéSurvivor (sprites, estados, golpes, dibujo);
 * sólo cambian cómo piensa, cuánto pega y qué pasa al caer (js/kanto/zone.js).
 */
(() => {
  const C = () => G.KCFG;
  const W = () => G.KCFG.WILD;
  // Formas de ataque -> qué hace un salvaje con ellas.
  const RANGED = new Set(['projectile', 'homing', 'bounce', 'cone', 'nova', 'chain', 'boomerang']);
  const LINE = new Set(['beam', 'charge']);
  const AREA = new Set(['meteor', 'quake', 'vortex', 'stun']);
  const SELF_AREA = new Set(['melee', 'dash', 'spin', 'shove', 'aura']);

  class WildMon extends G.Enemy {
    /**
     * @param o { dex, level, x, y, group?, rarity?, boss?, trainer?, staticKey? }
     */
    constructor(o) {
      const sp = G.DEX_BY[o.dex];
      super({ dex: o.dex, name: sp ? sp.name : '', hp: 1, spd: 1, dmg: 1, xp: 0, behavior: 'wild' }, o.x, o.y, { hp: 1, spd: 1, dmg: 1 }, !!o.boss);
      this.wild = true;
      this.level = o.level;
      this.group = o.group || null;
      this.rarity = o.rarity || 'common';
      this.trainer = !!o.trainer;
      this.staticKey = o.staticKey || null;
      this.kstats = G.KMon.calcStats({ dex: o.dex, level: o.level });
      this.mon = Object.assign(Object.create(sp), { kstats: this.kstats });
      this.cat = G.Stats.sideOf(sp);
      this.maxHp = this.hp = this.kstats.hp;
      this.spd = G.KMon.pokemonSpeedToWorldSpeed(this.kstats.speed) * (o.boss ? 0.95 : 0.85);
      // Golpe al tocarte (sólo enfadado): ver combat.js (contacto).
      this.dmg = G.KDamage.offense(o.level, G.KDamage.atkStat(this.kstats, this.cat), 1) * C().WILD_CONTACT_POWER;
      this.kmoves = G.KMon.movesAtLevel(o.dex, o.level).map(id => G.KMoves.instance(G.KMon.moveSlot(id)));
      for (const m of this.kmoves) m.t = G.U.rand(0.5, 2);
      this.home = { x: o.x, y: o.y };
      this.aggro = !!o.boss && !!o.trainer;
      this.calmT = 0;
      this.goal = null; this.goalT = 0;
      this.cast = null;
      this.boost = 1;                         // potenciadores propios (Danza Espada...)
      this.dotT = 0;
    }

    /** Se enfada (y avisa a los de su grupo que estén cerca). */
    provoke(spread = true) {
      if (this.dead) return;
      if (!this.aggro) G.FX.dmgText(this.x, this.y - this.bodyH - 14, '!', '#ff6b6b', true);
      this.aggro = true; this.calmT = 0;
      if (!spread) return;
      for (const e of G.EnemyMgr.queryCircle(this.x, this.y, W().callRadius)) {
        if (e !== this && e.wild && !e.aggro && e.dex === this.dex) e.provoke(false);
      }
    }

    hurt(amount, color, dirX, dirY, knock, eff) {
      if (this.dead) return;
      this.provoke();
      if (!(amount > 0)) { this.flash = 0.05; return; }       // movimientos de estado: sin número
      super.hurt(amount, color, dirX, dirY, knock, eff);
    }

    // Estados con daño: 1/16 de la vida por segundo y por nivel de estado (como en los juegos).
    tickDots(dt) {
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slow = 0; }
      if (this.burnT > 0) this.burnT -= dt; else this.burn = 0;
      if (this.poisonT > 0) this.poisonT -= dt; else this.poison = 0;
      if (!(this.burn > 0 || this.poison > 0)) return;
      this.dotT -= dt;
      if (this.dotT > 0) return;
      this.dotT = 1;
      if (this.burn > 0) super.hurt(Math.max(1, this.maxHp / 16 * Math.min(2, this.burn)), '#ff9a4d');
      if (this.poison > 0 && !this.dead) super.hurt(Math.max(1, this.maxHp / 16 * Math.min(2, this.poison)), '#d47cf0');
    }

    die() {
      if (this.dead) return;
      this.dead = true;
      this.fade = 0.9;
      this.anim.play('Faint', { hold: true });
      const col = this.boss ? '#ffd95e' : '#ffffff';
      G.FX.burst(this.x, this.y - this.bodyH * 0.5, col, this.boss ? 34 : 9, this.boss ? 260 : 120);
      G.FX.ring(this.x, this.y, this.r, this.r * (this.boss ? 6 : 2.6), col, this.boss ? 0.6 : 0.3, this.boss ? 6 : 3);
      if (this.boss) G.Camera.kick(0.9);
      G.Audio.sfx(this.boss ? 'bossDown' : 'faint');
      if (G.KZone) G.KZone.onWildDown(this);
    }

    update(dt, pl) {
      const seen = G.Camera.sees(this.x, this.y, 120);
      if (seen || this.dead) this.anim.update(dt);
      if (this.flash > 0) this.flash -= dt;
      if (this.dead) { this.fade -= dt; return; }
      this.bob += dt * 6;
      if (this.shiny && seen && (this.sparkT -= dt) <= 0) {
        this.sparkT = 0.22;
        G.FX.twinkle(this.x + G.U.rand(-this.r, this.r) * 1.2, this.y - G.U.rand(4, this.bodyH * 1.1));
      }
      for (const m of this.kmoves) if (m.t > 0) m.t -= dt;
      this.tickDots(dt);
      if (this.dead) return;
      if (this.sleepT > 0) { this.sleepT -= dt; this.anim.loop('Idle'); this.touchCd = 0.3; return; }
      if (this.stunT > 0) { this.stunT -= dt; this.anim.loop('Idle'); this.touchCd = 0.3; return; }

      const dist = G.U.dist(this.x, this.y, pl.x, pl.y);
      const fromHome = G.U.dist(this.x, this.y, this.home.x, this.home.y);
      let vx = 0, vy = 0, anim = 'Walk';

      if (this.aggro && (pl.dead || fromHome > W().leashRadius || (this.calmT += dt * (dist > 420 ? 1 : 0)) > W().calmAfter)) {
        // Se ha alejado demasiado de casa o te ha perdido: vuelve y se cura (no se le puede "tirar" del mapa).
        if (!this.trainer) { this.aggro = false; this.cast = null; this.goal = { x: this.home.x, y: this.home.y }; this.goalT = 8; this.healHome = true; }
      }
      if (!this.aggro && !pl.dead && dist < W().aggroRadius * (this.boss ? 1.4 : 1) && !(G.KZone && G.KZone.safeAt(pl.x, pl.y))) this.provoke();

      if (this.cast) {
        [vx, vy, anim] = this.castTick(dt, pl);
      } else if (this.aggro) {
        this.touchCd = Math.max(this.touchCd - dt, 0);
        const m = this.pickMove(dist);
        const keep = m ? this.rangeOf(m) * 0.75 : 40;
        const [dx, dy] = G.U.norm(pl.x - this.x, pl.y - this.y);
        if (m && dist <= this.rangeOf(m)) this.startCast(m, pl);
        else if (dist > keep) { vx = dx * this.spd; vy = dy * this.spd; }
        else if (dist < keep * 0.6 && RANGED.has(m && m.kind)) { vx = -dx * this.spd * 0.7; vy = -dy * this.spd * 0.7; }
        else anim = 'Idle';
      } else {
        this.touchCd = 0.5;                       // tranquilo: tocarlo no hace daño
        if (this.healHome && fromHome < 30) { this.healHome = false; this.hp = this.maxHp; }
        if ((this.goalT -= dt) <= 0 || !this.goal) {
          this.goalT = G.U.rand(2, 5);
          this.goal = Math.random() < 0.35 ? null : (G.KZone ? G.KZone.wanderPoint(this) : null);
        }
        if (this.goal && G.U.dist2(this.x, this.y, this.goal.x, this.goal.y) > 64) {
          const [dx, dy] = G.U.norm(this.goal.x - this.x, this.goal.y - this.y);
          const k = this.healHome ? 1 : W().wanderSpeed;
          vx = dx * this.spd * k; vy = dy * this.spd * k;
        } else anim = 'Idle';
      }

      // Integración con choques (también los que flotan: no salen del mapa).
      const sp = (1 - this.slow);
      const ox = this.x, oy = this.y;
      this.x += (vx * sp + this.kx) * dt; this.y += (vy * sp + this.ky) * dt;
      this.kx *= Math.pow(0.0015, dt); this.ky *= Math.pow(0.0015, dt);
      if (G.World.collide(this) && Math.hypot(vx, vy) > 1 && Math.hypot(this.x - ox, this.y - oy) < Math.hypot(vx, vy) * dt * 0.3) {
        this.goalT = 0;                          // atascado: otro destino
        if (this.aggro) { const a = Math.atan2(vy, vx) + (Math.random() < 0.5 ? 1.3 : -1.3); this.x += Math.cos(a) * this.spd * dt; this.y += Math.sin(a) * this.spd * dt; G.World.collide(this); }
      }
      const moving = Math.abs(vx) + Math.abs(vy) > 2;
      const face = this.aggro ? Math.atan2(pl.y - this.y, pl.x - this.x) : Math.atan2(vy, vx);
      if (moving || this.aggro) this.anim.dir = G.Sprites.dirFromAngle(face);
      if (!this.anim.busy()) this.anim.loop(moving ? anim : 'Idle', moving ? Math.max(0.6, this.spd / 70) : 1);
    }

    // ---------------- ataques ----------------

    rangeOf(m) {
      if (RANGED.has(m.kind)) return 250;
      if (LINE.has(m.kind)) return 230;
      if (AREA.has(m.kind)) return 230;
      if (m.kind === 'buff') return 400;
      return (m.radius || 50) + 18;
    }

    /** Un movimiento que pueda usar ahora (con PP y sin recarga); prefiere los que hacen daño. */
    pickMove(dist) {
      const ok = this.kmoves.filter(m => m.t <= 0 && m.slot.currentPP > 0);
      if (!ok.length) return this.kmoves.find(m => m.slot.currentPP > 0 && m.dmg > 0) || null;
      const dmg = ok.filter(m => m.dmg > 0 && dist <= this.rangeOf(m));
      if (dmg.length && Math.random() < 0.8) return G.U.pick(dmg);
      return G.U.pick(ok);
    }

    startCast(m, pl) {
      if (m.t > 0 || m.slot.currentPP <= 0) return;
      const w = W().windup * (this.boss ? 0.8 : 1);
      this.cast = { m, t: 0, wind: w, ang: Math.atan2(pl.y - this.y, pl.x - this.x), tx: pl.x, ty: pl.y };
      m.slot.currentPP--;
      m.t = m.cd * W().moveCdMul * (this.boss ? 0.75 : 1);
      const col = G.U.TYPE_COLOR[m.type] || '#ff7a9e';
      const dmg = this.hitDmg(m);
      // Aviso en el suelo para lo que no es un disparo.
      if (LINE.has(m.kind)) this.hazard({ kind: 'beam', x: this.x, y: this.y, angle: this.cast.ang, len: (m.radius || 230) + 40, w: m.width || 26, delay: w + 0.15, dmg, type: m.type, color: col, cat: m.cat });
      else if (AREA.has(m.kind)) this.hazard({ kind: 'zone', x: pl.x, y: pl.y, r: Math.max(44, Math.min(90, m.radius || 60)), delay: w + 0.25, dmg, type: m.type, color: col, cat: m.cat });
      else if (SELF_AREA.has(m.kind) && m.dmg > 0) this.hazard({ kind: 'zone', x: this.x + Math.cos(this.cast.ang) * 18, y: this.y + Math.sin(this.cast.ang) * 18,
                                                                  r: Math.max(46, Math.min(80, m.radius || 56)), delay: w, dmg, type: m.type, color: col, cat: m.cat });
      this.anim.play('Charge', { speed: 1.4 });
      G.FX.ring(this.x, this.y, this.r, this.r * 2.2, col, w, 2);
    }

    hitDmg(m) {
      if (!m.cat) return 0;
      return G.KDamage.offense(this.level, G.KDamage.atkStat(this.kstats, m.cat) * this.boost, G.KDamage.stab(this.types, m.type)) * m.realtimePower * C().WILD_DAMAGE_MULT;
    }

    castTick(dt, pl) {
      const c = this.cast;
      c.t += dt;
      if (c.t < c.wind) return [0, 0, 'Idle'];
      const m = c.m;
      this.cast = null;
      const col = G.U.TYPE_COLOR[m.type] || '#ff7a9e';
      if (RANGED.has(m.kind) && m.dmg > 0) {
        const a = Math.atan2(pl.y - this.y, pl.x - this.x);
        const n = m.kind === 'cone' || m.kind === 'nova' ? 3 : 1;
        for (let i = 0; i < n; i++) {
          const ai = a + (n === 1 ? 0 : (i - 1) * 0.22);
          G.Projectiles.spawn({ x: this.x, y: this.y, vx: Math.cos(ai) * 220, vy: Math.sin(ai) * 220, dmg: this.hitDmg(m) / n * (n > 1 ? 1.6 : 1), r: 7, life: 2,
                                friendly: false, color: col, mtype: m.type, cat: m.cat, vis: G.VFX.forType(m.type) });
        }
        this.anim.play('Shoot');
      } else if (m.kind === 'buff' || !(m.dmg > 0)) {
        this.statusMove(m, pl, col);
      } else {
        this.anim.play('Attack', { speed: 1.4 });
        if (m.kind === 'dash' || m.kind === 'melee') { const [dx, dy] = G.U.norm(pl.x - this.x, pl.y - this.y); this.kx += dx * 160; this.ky += dy * 160; }
      }
      return [0, 0, 'Idle'];
    }

    /** Movimientos sin daño: potencia al salvaje o frena / aturde un poco al jugador. */
    statusMove(m, pl, col) {
      this.anim.play('Charge');
      if (m.heal) { this.hp = Math.min(this.maxHp, this.hp + this.maxHp * m.heal * 0.6); G.FX.ring(this.x, this.y, this.r, this.r * 2.5, '#5fe08a', 0.4, 3); return; }
      if (m.kind === 'buff') {
        if (m.stat === 'patk' || m.stat === 'satk') this.boost = Math.min(1.6, this.boost + 0.12);
        G.FX.ring(this.x, this.y, this.r * 2, this.r, col, 0.35, 2.5);
        return;
      }
      if (!pl.dead && G.U.dist(this.x, this.y, pl.x, pl.y) < 260) {
        pl.slowT = Math.max(pl.slowT || 0, m.stun ? 1.6 : 1);
        G.FX.ring(pl.x, pl.y, 6, 40, col, 0.4, 3);
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 10, m.name, col);
      }
    }

    draw(ctx) {
      super.draw(ctx);
      if (this.dead) return;
      // Nombre y nivel (siempre los jefes; los demás, enfadados o cerca).
      const pl = G.Game.player;
      if (!(this.boss || this.aggro || (pl && G.U.dist2(pl.x, pl.y, this.x, this.y) < 200 * 200))) return;
      ctx.save();
      ctx.font = '700 7px Pixelify,"Segoe UI",sans-serif';
      ctx.textAlign = 'center';
      const y = this.y - this.bodyH - (this.hp < this.maxHp || this.boss ? 15 : 8);
      const txt = this.name + ' ' + G.I18n.f('Nv.{x}', this.level);
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,.75)';
      G.I18n.rawCanvas(ctx, 'strokeText', txt, this.x, y);
      ctx.fillStyle = this.aggro ? '#ffb3b3' : '#eaf2ff';
      G.I18n.rawCanvas(ctx, 'fillText', txt, this.x, y);
      ctx.restore();
    }
  }

  G.WildMon = WildMon;
})();
