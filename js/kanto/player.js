/* ============ player.js (Kanto) — tu Pokémon activo dentro de una zona ============
 * El mismo jugador de PokéSurvivor (movimiento, colisiones, animaciones,
 * objeto equipado...) con los números de su instancia:
 *   - stats por nivel (js/kanto/pokemon.js) y daño de js/kanto/damage.js
 *   - 4 movimientos de Gen I con PP y recarga; sólo ataca cuando TÚ quieres
 *     (clic / Espacio / stick derecho; en el móvil, tocando el ataque)
 *   - la EXP de la zona NO le sube de nivel aquí: se aplica al salir
 */
G.KantoPlayer = class KantoPlayer extends G.Player {
  constructor(inst) {
    const stats = G.KMon.calcStats(inst);
    // Sus defensas para G.Stats.taken (y el resto de datos de la especie, como tipos y nombre).
    const mon = Object.assign(Object.create(G.DEX_BY[inst.dex]), { kstats: stats });
    super(mon, {}, inst.shiny);
    this.kanto = true;
    this.inst = inst;
    this.kstats = stats;
    this.level = inst.level;
    this.maxHp = stats.hp; this.hp = stats.hp;
    this.baseSpd = G.KMon.pokemonSpeedToWorldSpeed(stats.speed);
    this.baseAtk = 1;
    this.critChance = G.KCFG.CRIT_CHANCE;
    this.moves = inst.moves.map(s => G.KMoves.instance(s));
    this.slots = this.moves.map(m => [m]);
    this.active = 0;
    if (inst.heldItemId && G.Items.BY[inst.heldItemId]) this.equip(inst.heldItemId);
    this.fireT = 0;               // móvil: dispara un momento tras tocar el ataque
    this.lastCombat = -99;        // para la Cuerda Huida (G.KCFG.COMBAT_STATE_TIMEOUT)
    this.clock = 0;
  }

  get inCombat() { return this.clock - this.lastCombat < G.KCFG.COMBAT_STATE_TIMEOUT; }
  markCombat() { this.lastCombat = this.clock; }

  // ---- daño: la mitad del atacante (ver js/kanto/damage.js) ----
  atkFor(m) {
    if (!m || !m.cat) return 0;
    const b = m.cat === 'physical' ? this.buffs.patk : this.buffs.satk;
    const atk = G.KDamage.atkStat(this.kstats, m.cat) * (1 + b.n * b.amount) * (1 + this.buffs.atk.n * this.buffs.atk.amount);
    return G.KDamage.offense(this.level, atk, G.KDamage.stab(this.mon.types, m.type)) * this.atkMul;
  }

  // ---- movimientos: sólo el activo, con PP y si estás atacando ----
  activeMove() { return (this.slots[this.active] || [])[0]; }
  activeGroup() {
    const m = this.activeMove();
    if (!m || this.dead || !this.firing || m.t > 0 || m.slot.currentPP <= 0) return [];
    return [m];
  }
  setActive(i) {
    super.setActive(i);
    const m = this.activeMove();
    if (m && m.slot.currentPP <= 0) G.FX.dmgText(this.x, this.y - this.bodyH - 8, G.T('¡Sin PP!'), '#ff8a96');
  }
  cast(m) {
    if (m.slot && m.slot.currentPP > 0) m.slot.currentPP--;
    super.cast(m);
    if (m.heal) this.heal(this.maxHp * m.heal);
    this.markCombat();
  }

  get firing() {
    if (this.fireT > 0) return true;
    if (G.Touch.active) return false;
    if (G.Pad.aim()) return true;
    return G.Input.held('space') || (G.Input.mouse().down && !G.UI.isOpen('scr-pause'));
  }
  /** Móvil: tocar un ataque lo elige y lo lanza (un momento). */
  tapMove(i) { this.setActive(i); this.fireT = 0.35; }

  hurt(amount, type = null, pure = false, cat = null) {
    if (this.invuln <= 0 && !this.dead) this.markCombat();
    super.hurt(amount, type, pure, cat);
  }
  onDealt(dmg) {
    super.onDealt(dmg);
    this.markCombat();
    const m = this.activeMove();
    if (m && m.drain && dmg > 0) this.heal(dmg * m.drain);
  }

  update(dt) {
    this.clock += dt;
    if (this.fireT > 0) this.fireT -= dt;
    // Las recargas corren todas a la vez (combat.js sólo mira la del activo).
    for (const m of this.moves) if (m.t > 0) m.t -= dt;
    // Fuera de combate se recupera poco a poco (sin números flotando).
    if (!this.dead && !this.inCombat && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * G.KCFG.OUT_OF_COMBAT_REGEN * dt);
    super.update(dt);
  }

  /**
   * Aquí se apunta siempre a mano en PC (ratón o stick derecho), sin tener que
   * activarlo en Ajustes; en el móvil, el autoapuntado de PokéSurvivor.
   */
  handAim() {
    if (G.Settings.touch || G.Touch.active) return null;
    const st = G.Pad.aim();
    if (st) return Math.atan2(st[1], st[0]);
    if (!G.Input.mouseMovedAt || G.Input.mouseMovedAt < G.Pad.aimAt) return null;
    const w = G.Input.mouseWorld();
    const dx = w.x - this.x, dy = w.y - (this.y - G.LIFT * 0.5);
    return Math.hypot(dx, dy) < 4 ? null : Math.atan2(dy, dx);
  }

  /** Lo que se guarda al salir: los PP gastados (los de la instancia ya son los mismos objetos). */
  ppState() { return this.inst.moves.map(s => s.currentPP); }
};
