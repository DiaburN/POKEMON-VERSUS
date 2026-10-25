/* ============ kanto-world.js — el mundo abierto de Kanto (datos) ============
 * Fuente: KANTO_WORLD_SPEC.md + decisiones del 25-10-2026:
 *   - un único mundo continuo: se avanza siempre hacia el NORTE (y negativa)
 *   - las zonas son TRAMOS del mismo mundo; cambian los tiles, la decoración
 *     y los Pokémon. No hay ciudades, interiores ni cuevas aparte: «Cueva
 *     Diglett» o «Torre Pokémon» sólo nombran el tema de un tramo
 *   - el LARGO de cada tramo sale de un tiempo de recorrido (minutos andando
 *     hacia el norte sin pelear) y de la velocidad real del Pokémon; el ANCHO
 *     es aparte, el sitio para explorar a los lados
 *
 * Todo lo ajustable vive aquí; el generador (js/kanto/world.js) no se toca
 * para cambiar tamaños, transiciones, densidades o fauna.
 */
G.KANTO_WORLD = {
  // ---------------- escala ----------------
  // Velocidad de referencia: la de un Pokémon de Velocidad base `refBaseSpeed`
  // al nivel medio recomendado del tramo (misma fórmula que el juego:
  // G.KMon.pokemonSpeedToWorldSpeed). Nv.5 ≈ 97 px/s, Nv.30 ≈ 112, Nv.60 ≈ 125.
  refBaseSpeed: 65,
  // Minutos de recorrido hacia el norte por clase de tamaño (sin pelear).
  // El largo en tiles = minutos × velocidad ÷ 32 px ÷ sinuosidad del camino.
  minutes: { SHORT: 1, MEDIUM: 2, 'MEDIUM-LONG': 2.75, LONG: 3.5, 'VERY LONG': 4.5, OPEN: 5.5, SEA: 5.5, PLAZA: 0.5 },
  // Ancho (tiles) del espacio jugable de cada clase: una pantalla son 24 tiles.
  width: { SHORT: 40, MEDIUM: 56, 'MEDIUM-LONG': 60, LONG: 64, 'VERY LONG': 68, OPEN: 112, SEA: 96, PLAZA: 48 },
  // Cambio de un tramo al siguiente:
  //   checkpoint  radio (tiles) del claro seguro al empezar cada tramo
  //   fauna       tiles a cada lado de la frontera donde se mezclan los salvajes de los dos tramos
  //   width       tiles en los que el ancho pasa de un tramo al otro
  transition: { checkpoint: 6, fauna: 30, width: 40 },
  // Ancho total del mundo (tiles); fuera del tramo, pared.
  worldWidth: 128,
  // Ventana donde se mide la densidad de salvajes: pantalla y media.
  densityWindow: { w: 36, h: 20 },

  // ---------------- estilos de tramo ----------------
  // Cómo se tallan los mismos tiles (js/world/tiles.js) según el tipo de tramo.
  //   hw        medio ancho del camino entre claros (tiles)
  //   bend      cuánto tuerce el camino (× ancho del tramo)
  //   every     tiles entre puntos de giro del camino
  //   gap       tiles entre claros de combate
  //   clearing  tamaño de los claros: [ancho min, max] × ancho del tramo, [alto min, max] en tiles
  //   belt      tiles de cinturón de árboles en el borde (0 = pared de roca)
  //   sides     probabilidad por claro de un claro lateral (exploración fuera del camino; los jefes van ahí)
  styles: {
    meadow: { hw: 3.6, bend: 0.24, every: 28, gap: 20, clearing: [[0.4, 0.65], [7, 10]], belt: 2, sides: 0.5 },
    forest: { hw: 2.8, bend: 0.28, every: 22, gap: 16, clearing: [[0.3, 0.5], [5, 8]], belt: 3, sides: 0.5 },
    canyon: { hw: 2.4, bend: 0.3, every: 24, gap: 18, clearing: [[0.35, 0.55], [6, 9]], belt: 0, sides: 0.6 },
    ruins:  { hw: 3.2, bend: 0.2, every: 26, gap: 17, clearing: [[0.5, 0.75], [7, 9]], belt: 0, sides: 0.3 },
    open:   { hw: 3, bend: 0.22, every: 30, gap: 20, clearing: [[0.25, 0.4], [9, 12]], belt: 2, sides: 0 },
    sea:    { hw: 1.4, bend: 0.3, every: 26, gap: 18, clearing: [[0.15, 0.25], [4, 7]], belt: 0, sides: 0 },
    plaza:  { hw: 4, bend: 0, every: 40, gap: 99, clearing: [[0.6, 0.6], [11, 11]], belt: 0, sides: 0 }
  },

  // Escalones de fauna -> rareza del juego (G.KCFG.RARITY_WEIGHT) y nivel dentro
  // del rango del tramo [a, b]: from/to como fracción de b - a (más `plus` niveles).
  tiers: {
    common:   { rarity: 'common', from: 0, to: 0.6 },
    uncommon: { rarity: 'uncommon', from: 0.25, to: 0.8 },
    rare:     { rarity: 'rare', from: 0.45, to: 1 },
    elite:    { rarity: 'very_rare', from: 1, to: 1, minus: 1, plus: 2 },
    veryRare: { rarity: 'very_rare', from: 1, to: 1, minus: 1, plus: 2, weight: 1.5 }
  },

  // Pokémon de adquisición especial: nunca fauna normal (iniciales, Eevee,
  // Dojo, Lapras, Porygon, intercambios, fósiles, legendarios, Mew).
  specialAcquisition: [1, 2, 3, 4, 5, 6, 7, 8, 9, 133, 134, 135, 136, 106, 107, 131, 137, 83, 122, 124,
                       138, 139, 140, 141, 142, 144, 145, 146, 150, 151],

  // ---------------- tramos, de sur a norte ----------------
  // size     clase (minutes / width); `minutes` o `width` en un tramo lo sobrescriben
  // theme    paleta de tiles.js: las de tipo (normal, grass, rock...) o forest/crystal/ash
  // style    forma del tramo (styles)
  // features (todas opcionales)
  //   trees        densidad del cinturón de árboles (0..1)
  //   scatterTrees, rocks, crystals, pillars, blocks   probabilidad por tile de un obstáculo suelto
  //   grass        cuánta hierba alta (0..1)
  //   ponds, outcrops, groves, islands                 probabilidad por claro de una charca / roca / bosquecillo / isla
  //   river        un río de lado a lado a mitad de tramo, con vado en el camino
  //   narrow       × ancho del camino
  // density  salvajes a la vista [min, max] (densityWindow)
  // fauna    escalón -> [dex]; bosses: [{ dex, level, kind }]
  zones: [
    { id: 'kanto_01_pallet_route1', name: 'Pueblo Paleta / Ruta 1', ref: 'Pallet Town + Route 1', level: [1, 5], size: 'MEDIUM',
      theme: 'normal', style: 'meadow', features: { trees: 0.55, scatterTrees: 0.012, grass: 0.35, ponds: 0.2 },
      density: [6, 8], fauna: { common: [16, 19], rare: [17, 20], elite: [18] }, notes: 'Sin fauna de agua.' },
    { id: 'kanto_02_viridian_route2', name: 'Afueras de Viridian / Ruta 2', ref: 'Route 2', level: [3, 7], size: 'MEDIUM',
      theme: 'normal', style: 'meadow', features: { trees: 0.75, scatterTrees: 0.03, grass: 0.4, ponds: 0.15 },
      density: [6, 9], fauna: { common: [16, 19, 10, 13], uncommon: [11, 14], rare: [17, 20] },
      notes: 'La familia Nidoran queda reservada para el Safari.' },
    { id: 'kanto_03_viridian_forest', name: 'Bosque Verde', ref: 'Viridian Forest', level: [4, 10], size: 'MEDIUM-LONG',
      theme: 'forest', style: 'forest', features: { trees: 0.9, scatterTrees: 0.06, grass: 0.55, narrow: 0.85 },
      density: [7, 9], fauna: { common: [10, 13, 11, 14], rare: [25], elite: [12, 15] } },
    { id: 'kanto_04_pewter_route3', name: 'Altos de Plateada / Ruta 3', ref: 'Route 3', level: [6, 12], size: 'MEDIUM',
      theme: 'rock', style: 'meadow', features: { trees: 0.25, scatterTrees: 0.004, rocks: 0.03, outcrops: 0.6, grass: 0.15 },
      density: [6, 8], fauna: { common: [16, 21, 39], rare: [17, 22], elite: [40], veryRare: [18] } },
    { id: 'kanto_05_mt_moon', name: 'Mt. Moon', ref: 'Mt. Moon 1F + B1F + B2F', level: [8, 15], size: 'LONG',
      theme: 'crystal', style: 'canyon', features: { pillars: 0.03, rocks: 0.03, crystals: 0.02 },
      density: [8, 11], fauna: { common: [41, 74, 46, 35], rare: [42, 75, 47], elite: [36, 76] },
      notes: 'Fósiles: progresión aparte, nunca salvajes.' },
    { id: 'kanto_06_route4', name: 'Ruta 4 / Camino a Celeste', ref: 'Route 4', level: [10, 16], size: 'MEDIUM',
      theme: 'normal', style: 'meadow', features: { trees: 0.45, scatterTrees: 0.01, rocks: 0.012, outcrops: 0.3, grass: 0.3, ponds: 0.15 },
      density: [6, 8], fauna: { common: [19, 21, 23, 27], rare: [20, 22], elite: [24, 28] } },
    { id: 'kanto_07_routes_24_25', name: 'Norte de Celeste / Rutas 24–25', ref: 'Route 24 + Route 25 (Puente Pepita)', level: [12, 18], size: 'LONG',
      theme: 'grass', style: 'meadow', features: { trees: 0.7, scatterTrees: 0.02, grass: 0.4, ponds: 0.15, river: true },
      density: [8, 11], fauna: { common: [43, 69, 63, 16], uncommon: [44, 70, 64, 17], elite: [45, 71, 65], veryRare: [18] } },
    { id: 'kanto_08_routes_5_6', name: 'Sur de Celeste / Rutas 5–6', ref: 'Route 5 + Route 6', level: [14, 20], size: 'LONG',
      theme: 'normal', style: 'meadow', features: { trees: 0.6, scatterTrees: 0.025, grass: 0.45, ponds: 0.15, wide: 1.15 },
      density: [8, 10], fauna: { common: [43, 69, 56, 52], uncommon: [44, 70], rare: [57, 53], elite: [45, 71] } },
    { id: 'kanto_09_route11', name: 'Este de Carmín / Ruta 11', ref: 'Route 11', level: [16, 22], size: 'MEDIUM',
      theme: 'fighting', style: 'meadow', features: { trees: 0.35, scatterTrees: 0.006, rocks: 0.02, outcrops: 0.3, grass: 0.2, wide: 1.2 },
      density: [6, 8], fauna: { common: [23, 27, 21, 96], rare: [24, 28, 22, 97] } },
    { id: 'kanto_10_digletts_cave', name: 'Cueva Diglett', ref: "Diglett's Cave", level: [18, 26], size: 'SHORT',
      theme: 'ground', style: 'canyon', features: { pillars: 0.02, rocks: 0.04, narrow: 0.8 },
      density: [4, 6], fauna: { common: [50, 27, 74], uncommon: [51, 28], rare: [75], elite: [76] },
      notes: 'Tramo pequeño: menos salvajes a la vista a propósito.' },
    { id: 'kanto_11_routes_9_10', name: 'Rutas rocosas / Rutas 9–10', ref: 'Route 9 + Route 10', level: [20, 27], size: 'LONG',
      theme: 'rock', style: 'meadow', features: { trees: 0.2, scatterTrees: 0.004, rocks: 0.035, outcrops: 0.8, grass: 0.15, narrow: 0.85 },
      density: [8, 11], fauna: { common: [19, 21, 23, 27, 100], rare: [20, 22, 24, 28], elite: [101] } },
    { id: 'kanto_12_rock_tunnel', name: 'Túnel Roca', ref: 'Rock Tunnel 1F + B1F', level: [22, 29], size: 'LONG',
      theme: 'dark', style: 'canyon', features: { pillars: 0.035, rocks: 0.03, narrow: 0.85 },
      density: [8, 11], fauna: { common: [41, 74, 66, 95], rare: [42, 75, 67], elite: [76, 68] } },
    { id: 'kanto_13_routes_7_8', name: 'Rutas de Azulona y Lavanda / Rutas 7–8', ref: 'Route 7 + Route 8', level: [24, 31], size: 'LONG',
      theme: 'fighting', style: 'meadow', features: { trees: 0.55, scatterTrees: 0.012, rocks: 0.008, grass: 0.25, ponds: 0.15 },
      density: [8, 10], fauna: { common: [58, 37, 52, 56], rare: [53, 57], elite: [59, 38] } },
    { id: 'kanto_14_pokemon_tower', name: 'Torre Pokémon', ref: 'Pokémon Tower 1F–7F', level: [26, 33], size: 'MEDIUM',
      theme: 'ghost', style: 'ruins', features: { blocks: 0.06 },
      density: [6, 8], fauna: { common: [92, 104], rare: [93], elite: [105] },
      bosses: [{ dex: 94, level: 35, kind: 'semiboss' }],
      notes: 'Sin arte nuevo de fantasmas: paleta y obstáculos de siempre.' },
    { id: 'kanto_15_routes_12_15', name: 'Sur de Kanto / Rutas 12–15', ref: 'Route 12 + 13 + 14 + 15', level: [28, 36], size: 'VERY LONG',
      theme: 'bug', style: 'meadow', features: { trees: 0.6, scatterTrees: 0.015, grass: 0.8, ponds: 0.3 },
      density: [10, 13], fauna: { common: [48, 43, 69, 132], uncommon: [44, 70], rare: [49], elite: [45, 71] },
      bosses: [{ dex: 143, level: 30, kind: 'special' }] },
    { id: 'kanto_16_routes_16_18', name: 'Ruta Bici / Rutas 16–18', ref: 'Route 16 + 17 + 18', level: [30, 38], size: 'VERY LONG',
      theme: 'ground', style: 'meadow', features: { trees: 0.25, scatterTrees: 0.004, rocks: 0.02, outcrops: 0.5, grass: 0.15, lanes: true },
      density: [10, 12], fauna: { common: [84, 21, 19], rare: [85, 22, 20] },
      bosses: [{ dex: 143, level: 32, kind: 'special' }] },
    { id: 'kanto_17_safari', name: 'Zona Safari', ref: 'Safari Zone (Centro, Este, Norte, Oeste)', level: [32, 40], size: 'OPEN',
      theme: 'grass', style: 'open', pvpMode: 'none', features: { trees: 0.8, groves: 0.5, outcrops: 0.4, grass: 0.3, ponds: 0.35 },
      density: [11, 14],
      fauna: { common: [29, 32, 111, 48, 46, 102, 84], uncommon: [30, 33, 115, 128, 113, 123, 127],
               rare: [47, 49, 85, 112], elite: [34, 31, 103] },
      notes: 'A propósito, uno de los tramos más variados.' },
    { id: 'kanto_18_sea_routes', name: 'Rutas marinas de Kanto', ref: 'Route 19 + 20 + 21', level: [35, 43], size: 'SEA',
      theme: 'water', style: 'sea', features: { islands: 0.7, rocks: 0.01 },
      density: [11, 14],
      fauna: { common: [72, 116, 90, 120, 98, 118, 129], rare: [73, 117, 99, 119], elite: [91, 121, 130], veryRare: [147, 148] },
      notes: 'Sustituye a la pesca repartida por tramos de tierra.' },
    { id: 'kanto_19_seafoam', name: 'Islas Espuma', ref: 'Seafoam Islands 1F–B4F', level: [38, 46], size: 'LONG',
      theme: 'ice', style: 'canyon', features: { pillars: 0.025, rocks: 0.015, crystals: 0.015, ponds: 0.5 },
      density: [8, 11], fauna: { common: [86, 90, 79, 116], rare: [87, 80, 117], elite: [91] },
      bosses: [{ dex: 144, level: 50, kind: 'legendary' }] },
    { id: 'kanto_20_power_plant', name: 'Central de Energía', ref: 'Power Plant', level: [38, 46], size: 'MEDIUM-LONG',
      theme: 'electric', style: 'ruins', features: { blocks: 0.06 },
      density: [7, 9], fauna: { common: [100, 81, 25], rare: [82, 26, 125], elite: [101] },
      bosses: [{ dex: 145, level: 50, kind: 'legendary' }] },
    { id: 'kanto_21_pokemon_mansion', name: 'Isla Canela / Mansión Pokémon', ref: 'Pokémon Mansion 1F–3F + B1F', level: [40, 49], size: 'LONG',
      theme: 'ash', style: 'ruins', features: { blocks: 0.05, rocks: 0.01 },
      density: [8, 11], fauna: { common: [109, 88, 77, 126], rare: [110, 89], elite: [78], veryRare: [58, 37] } },
    { id: 'kanto_22_route23', name: 'Camino a Meseta Añil / Ruta 23', ref: 'Route 23', level: [42, 51], size: 'LONG',
      theme: 'forest', style: 'meadow', features: { trees: 0.5, scatterTrees: 0.008, rocks: 0.02, outcrops: 0.6, grass: 0.25, narrow: 0.9 },
      density: [8, 10], fauna: { common: [132, 21, 23, 27], rare: [22, 24, 28] } },
    { id: 'kanto_23_victory_road', name: 'Calle Victoria', ref: 'Victory Road 1F–3F', level: [45, 55], size: 'LONG',
      theme: 'judgment', style: 'canyon', features: { pillars: 0.035, rocks: 0.035 },
      density: [8, 11], fauna: { common: [67, 75, 42, 95, 105, 49], elite: [68, 76] },
      bosses: [{ dex: 146, level: 50, kind: 'legendary' }] },
    { id: 'kanto_league', name: 'Liga Pokémon / Meseta Añil', ref: 'Indigo Plateau', level: [55, 65], size: 'PLAZA',
      theme: 'steel', style: 'plaza', pvpMode: 'none', gauntlet: 'elite_four_and_champion', fauna: {},
      notes: 'Sin fauna salvaje: Alto Mando y Campeón. Hasta vencerlos, el paso al norte está cerrado.' },
    { id: 'kanto_24_cerulean_cave', name: 'Cueva Celeste', ref: 'Cerulean Cave 1F + 2F + B1F', level: [55, 70], size: 'LONG',
      theme: 'dragon', style: 'canyon', requires: 'league', features: { pillars: 0.03, rocks: 0.02, crystals: 0.03 },
      density: [10, 14],
      fauna: { common: [42, 97, 82, 85, 49, 64, 47, 112, 132, 26, 101, 113, 40, 24, 28], elite: [65] },
      bosses: [{ dex: 150, level: 70, kind: 'legendary' }], notes: 'Endgame: se abre al vencer a la Liga.' }
  ]
};
