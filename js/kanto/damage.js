/* ============ damage.js — daño del modo Kanto (una sola fórmula) ============
 * Como en los juegos, pero en tiempo real y sin fallos al azar (si el ataque
 * toca, toca):
 *
 *   daño = ESCALA × (2·nivel/5 + 2) × potencia × A / D / 50 × STAB × tipos × crítico
 *
 *   A/D: Ataque contra Defensa (físicos) o Ataque Esp. contra Defensa Esp.
 *   (especiales), de los stats de cada uno (js/kanto/pokemon.js).
 *
 * Se separa en dos mitades porque el ataque sale en un momento y llega en
 * otro (proyectiles, zonas con aviso): offense() la pone quien ataca (la
 * multiplica combat.js por la potencia) y la defensa la pone G.Stats.taken
 * (1 / D) al recibirlo, junto con la tabla de tipos. compute() es todo junto
 * (pruebas, interfaz). Sin el "+2" del juego original: así las dos mitades
 * se pueden multiplicar por separado.
 */
G.KDamage = (() => {
  const C = () => G.KCFG;

  function stab(types, moveType) { return types && types.includes(moveType) ? C().STAB : 1; }

  /** Lo que pone el atacante (sin la potencia del movimiento). */
  function offense(level, atk, stabK = 1) {
    return C().REALTIME_DAMAGE_SCALE * (2 * level / 5 + 2) * atk * stabK / 50;
  }

  /** Lo que pone el defensor: × 1 / su defensa. */
  function defense(def) { return 1 / Math.max(1, def); }

  /** Daño completo de un golpe. */
  function compute({ level, power, atk, def, stab: s = 1, typeEff = 1, crit = false }) {
    if (!(power > 0) || typeEff <= 0) return 0;
    return Math.max(1, offense(level, atk, s) * power * defense(def) * typeEff * (crit ? C().CRIT_MULT : 1));
  }

  /** El Ataque o Ataque Esp. que toca según la categoría. */
  const atkStat = (stats, cat) => (cat === 'special' ? stats.specialAttack : stats.attack);
  const defStat = (stats, cat) => (cat === 'special' ? stats.specialDefense : stats.defense);

  return { stab, offense, defense, compute, atkStat, defStat };
})();
