/* ============ kanto-items.js — objetos del modo Kanto ============
 * Cada objeto tiene una categoría (cat) que decide dónde se usa:
 *   ball      Poké Balls: hueco de captura del cinturón (catch = multiplicador, master = 100 %)
 *   heal      pociones (hp = PS que cura, full = todo, cure = quita estados)
 *   pp        éteres (pp = PP, full = todos; all = a los cuatro movimientos)
 *   revive    revivir tras caer (frac = parte de la vida)
 *   utility   cuerda huida (escape)
 *   stone     piedras evolutivas (fuera de combate, desde la mochila)
 *   vitamin   entrenamiento: stat que sube (ver G.KCFG.VITAMIN_EV)
 *   candy     Caramelo Raro: +1 nivel fuera de combate
 *   link      Cable Conector: evoluciones por intercambio (Gen I) en V1
 *   held      objeto equipado del Pokémon (efecto en js/data/items.js, mismo id)
 *   fossil    se revive en Cinnabar (revives = especie)
 * price: precio en el Poké Mart (Pokémonedas); sin price no se vende.
 * Los precios salen de Rojo/Azul (data/items/prices.asm) cuando existen.
 */
G.KItems = (() => {
  const LIST = [
    { id: 'poke-ball', name: 'Poké Ball', cat: 'ball', catch: 1.0, price: 200, icon: 'ball' },
    { id: 'great-ball', name: 'Super Ball', cat: 'ball', catch: 1.5, price: 600, icon: 'ball2' },
    { id: 'ultra-ball', name: 'Ultra Ball', cat: 'ball', catch: 2.0, price: 1200, icon: 'ball3' },
    { id: 'master-ball', name: 'Master Ball', cat: 'ball', master: true, icon: 'ball4' },

    { id: 'potion', name: 'Poción', cat: 'heal', hp: 20, price: 300, icon: 'berry' },
    { id: 'super-potion', name: 'Superpoción', cat: 'heal', hp: 50, price: 700, icon: 'berry' },
    { id: 'hyper-potion', name: 'Hiperpoción', cat: 'heal', hp: 200, price: 1500, icon: 'berry' },
    { id: 'max-potion', name: 'Poción Máxima', cat: 'heal', full: true, price: 2500, icon: 'heart' },
    { id: 'full-restore', name: 'Restaurar Todo', cat: 'heal', full: true, cure: true, price: 3000, icon: 'heart' },

    { id: 'ether', name: 'Éter', cat: 'pp', pp: 10, icon: 'up' },
    { id: 'max-ether', name: 'Éter Máximo', cat: 'pp', full: true, icon: 'up' },
    { id: 'elixir', name: 'Elixir', cat: 'pp', pp: 10, all: true, icon: 'up' },
    { id: 'max-elixir', name: 'Elixir Máximo', cat: 'pp', full: true, all: true, icon: 'up' },

    { id: 'revive', name: 'Revivir', cat: 'revive', frac: 0.5, price: 1500, icon: 'sprout' },
    { id: 'max-revive', name: 'Revivir Máximo', cat: 'revive', frac: 1, icon: 'sprout' },

    { id: 'escape-rope', name: 'Cuerda Huida', cat: 'utility', escape: true, price: 550, icon: 'boot' },

    { id: 'moon-stone', name: 'Piedra Lunar', cat: 'stone', icon: 'star' },
    { id: 'fire-stone', name: 'Piedra Fuego', cat: 'stone', price: 2100, icon: 'star' },
    { id: 'water-stone', name: 'Piedra Agua', cat: 'stone', price: 2100, icon: 'star' },
    { id: 'thunder-stone', name: 'Piedra Trueno', cat: 'stone', price: 2100, icon: 'star' },
    { id: 'leaf-stone', name: 'Piedra Hoja', cat: 'stone', price: 2100, icon: 'star' },

    { id: 'hp-up', name: 'Más PS', cat: 'vitamin', stat: 'hp', price: 9800, icon: 'up' },
    { id: 'protein', name: 'Proteína', cat: 'vitamin', stat: 'attack', price: 9800, icon: 'up' },
    { id: 'iron', name: 'Hierro', cat: 'vitamin', stat: 'defense', price: 9800, icon: 'up' },
    { id: 'calcium', name: 'Calcio', cat: 'vitamin', stat: 'specialAttack', price: 9800, icon: 'up' },
    { id: 'zinc', name: 'Zinc', cat: 'vitamin', stat: 'specialDefense', price: 9800, icon: 'up' },
    { id: 'carbos', name: 'Carburante', cat: 'vitamin', stat: 'speed', price: 9800, icon: 'up' },
    { id: 'rare-candy', name: 'Caramelo Raro', cat: 'candy', icon: 'star' },

    { id: 'link-cable', name: 'Cable Conector', cat: 'link', price: 5000, icon: 'bond' },

    { id: 'helix-fossil', name: 'Fósil Hélix', cat: 'fossil', revives: 138, icon: 'rock' },
    { id: 'dome-fossil', name: 'Fósil Domo', cat: 'fossil', revives: 140, icon: 'rock' },
    { id: 'old-amber', name: 'Ámbar Viejo', cat: 'fossil', revives: 142, icon: 'rock' }
  ];
  // Objetos equipados: los de PokéSurvivor (data/items.js), con el mismo id y efecto.
  for (const id of ['leftovers', 'choiceband', 'quickclaw', 'focussash', 'shellbell', 'amuletcoin',
                    'luckyegg', 'lifeorb', 'choicescarf', 'rockyhelmet', 'assaultvest']) {
    LIST.push({ id, cat: 'held', icon: id, get name() { return G.Items.BY[id].name; } });
  }
  const BY = {};
  for (const it of LIST) BY[it.id] = it;

  // Huecos del cinturón: qué categoría admite cada uno.
  const BELT = [
    { id: 'heal', name: 'Curación', cat: 'heal' },
    { id: 'pp', name: 'PP', cat: 'pp' },
    { id: 'revive', name: 'Revivir', cat: 'revive' },
    { id: 'ball', name: 'Captura', cat: 'ball' },
    { id: 'utility', name: 'Utilidad', cat: 'utility' }
  ];

  const name = id => (BY[id] ? BY[id].name : id);
  const shop = () => LIST.filter(it => it.price > 0);

  return { LIST, BY, BELT, name, shop };
})();
