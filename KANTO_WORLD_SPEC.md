# KANTO WORLD SPEC

## Purpose
This file is the implementation reference for the Kanto world in POKEMON-VERSUS.

The project uses the existing PokéSurvivor engine and repository assets. Kanto/Red+Blue are the ecological and progression reference, but gameplay is adapted for a realtime multiplayer/survivor-style game.

## Core implementation rules

1. Reuse the existing repository renderer, tiles, autotiles, decorations, collisions and world-generation systems.
2. DO NOT invent, generate or replace visual assets for the world. Inspect the repository and select the existing tiles that best fit each biome.
3. Do not create one renderer per biome. All zones use the existing world/tile system.
4. Keep zone definitions data-driven and separate from rendering/gameplay code.
5. Do not use a fixed map size for every zone. Use the current game map as the scale reference.
6. Zone length depends on what the zone represents:
   - SHORT: small cave or compact area.
   - MEDIUM: one normal route.
   - LONG: important area or two joined routes.
   - VERY LONG: several joined routes, Safari, sea route, or major endgame area.
7. General progression moves forward/north, but zones must not be straight corridors. Use bends, narrower passages, open combat clearings, rocks, trees, bridges, cave chambers and changes in width using existing assets.
8. Keep enough free space for realtime combat.
9. Red/Blue encounter data defines the ecological base, but we are not copying encounter tables literally.
10. If an evolutionary family belongs in a zone, later evolutions may also appear there with progressively lower frequency and greater strength.
11. If an original zone has too little fauna for realtime gameplay, add a small number of habitat-compatible Pokémon. Do not add unrelated species just to fill space.
12. Water Pokémon are mainly concentrated in a real sea/water zone instead of appearing as fishing encounters inside terrestrial zones.
13. Rare/evolved encounters replace normal spawn slots; they should not create extra hordes.
14. Small zones may intentionally have fewer active enemies than large zones.
15. Old zones remain accessible for backtracking and training newly caught low-level Pokémon.

## Relative spawn density target

- SMALL area: roughly 4–6 visible enemies around active combat space.
- NORMAL area: roughly 6–9.
- LARGE area: roughly 8–12.
- SAFARI / SEA / ENDGAME: roughly 10–14 distributed across a wider map.

These are design targets, not hardcoded global constants. Reuse the existing spawn system and adapt it per zone.

---

# ZONE CATALOG

## 1. PALLET TOWN / ROUTE 1
Recommended level: 1–5
Length: MEDIUM
Tiles: existing light grass, dirt path, trees, flowers/route decoration.
Fauna:
- Common: Pidgey, Rattata
- Rare: Pidgeotto, Raticate
- Elite/very rare: Pidgeot
Notes: no water fauna here.

## 2. VIRIDIAN OUTSKIRTS / ROUTE 2
Recommended level: 3–7
Length: MEDIUM
Tiles: grass, dirt, light forest, denser trees than Route 1.
Fauna:
- Common: Pidgey, Rattata, Caterpie, Weedle
- Uncommon: Metapod, Kakuna
- Rare: Pidgeotto, Raticate
Notes: reserve the Nidoran family for Safari.

## 3. VIRIDIAN FOREST
Recommended level: 4–10
Length: MEDIUM-LONG
Tiles: existing forest floor/grass, dense trees, bushes, narrow passages, small clearings.
Fauna:
- Common: Caterpie, Weedle, Metapod, Kakuna
- Rare: Pikachu
- Elite: Butterfree, Beedrill

## 4. PEWTER HIGHLANDS / ROUTE 3
Recommended level: 6–12
Length: MEDIUM
Tiles: dry dirt, sparse grass, rocks, light elevation feel using existing obstacles.
Fauna:
- Common: Pidgey, Spearow, Jigglypuff
- Rare: Pidgeotto, Fearow
- Elite: Wigglytuff, very rare Pidgeot

## 5. MT. MOON
Recommended level: 8–15
Length: LONG
Tiles: existing grey cave/rock floor, dark walls, cave obstacles, crystals if repository already contains suitable assets.
Fauna:
- Common: Zubat, Geodude, Paras, Clefairy
- Rare: Golbat, Graveler, Parasect
- Elite: Clefable, Golem
Special: fossil progression later; fossils are not normal wild spawns.

## 6. ROUTE 4 / CERULEAN APPROACH
Recommended level: 10–16
Length: MEDIUM
Tiles: grass, dirt path, pale rock, route vegetation.
Fauna:
- Common: Rattata, Spearow, Ekans, Sandshrew
- Rare: Raticate, Fearow
- Elite: Arbok, Sandslash

## 7. NORTHERN CERULEAN / ROUTES 24–25
Recommended level: 12–18
Length: LONG
Tiles: green grass, paths, trees, flowers, bridges where existing assets allow it.
Fauna:
- Common: Oddish, Bellsprout, Abra, Pidgey
- Uncommon: Gloom, Weepinbell, Kadabra, Pidgeotto
- Elite: Vileplume, Victreebel, Alakazam, very rare Pidgeot

## 8. CERULEAN SOUTH / ROUTES 5–6
Recommended level: 14–20
Length: LONG
Tiles: meadow/grass, broad routes, bushes and scattered trees.
Fauna:
- Common: Oddish, Bellsprout, Mankey, Meowth
- Uncommon: Gloom, Weepinbell
- Rare: Primeape, Persian
- Elite: Vileplume, Victreebel

## 9. VERMILION EAST / ROUTE 11
Recommended level: 16–22
Length: MEDIUM
Tiles: drier grass, dirt, rocks, more open route layout.
Fauna:
- Common: Ekans, Sandshrew, Spearow, Drowzee
- Rare/elite: Arbok, Sandslash, Fearow, Hypno

## 10. DIGLETT'S CAVE
Recommended level: 18–26
Length: SHORT
Tiles: existing brown cave dirt, rock, narrow tunnels, darker pockets. Use repository assets only.
Fauna:
- Common: Diglett, Sandshrew, Geodude
- Uncommon: Dugtrio, Sandslash
- Rare: Graveler
- Elite: Golem
Notes: this zone intentionally has fewer visible enemies than large routes.

## 11. ROCKY ROUTES / ROUTES 9–10
Recommended level: 20–27
Length: LONG
Tiles: rocky dirt, cliffs/rocks, sparse grass, narrow mountain passages.
Fauna:
- Common: Rattata, Spearow, Ekans, Sandshrew, Voltorb
- Rare: Raticate, Fearow, Arbok, Sandslash
- Elite: Electrode

## 12. ROCK TUNNEL
Recommended level: 22–29
Length: LONG
Tiles: existing dark rock/cave set, cave chambers, narrow connectors, rock obstacles.
Fauna:
- Common: Zubat, Geodude, Machop, Onix
- Rare: Golbat, Graveler, Machoke
- Elite: Golem, Machamp

## 13. CELADON–LAVENDER ROUTES / ROUTES 7–8
Recommended level: 24–31
Length: LONG
Tiles: grass/dirt with a slightly more developed/urban-edge feel using existing assets.
Fauna:
- Common: Growlithe, Vulpix, Meowth, Mankey
- Rare: Persian, Primeape
- Elite: Arcanine, Ninetales

## 14. POKÉMON TOWER
Recommended level: 26–33
Length: MEDIUM
Tiles: existing dark interior/stone/wood assets, tomb-like obstacles, subdued layout. Do not generate new ghost art.
Fauna:
- Common: Gastly, Cubone
- Rare: Haunter
- Elite: Marowak
- Semiboss: Gengar

## 15. SOUTHERN KANTO / ROUTES 12–15
Recommended level: 28–36
Length: VERY LONG
Tiles: tall-grass feel using existing grass/vegetation, dirt, reeds/obstacles if available.
Fauna:
- Common: Venonat, Oddish, Bellsprout, Ditto
- Uncommon: Gloom, Weepinbell
- Rare: Venomoth
- Elite: Vileplume, Victreebel
- Special: Snorlax

## 16. CYCLING ROAD / ROUTES 16–18
Recommended level: 30–38
Length: VERY LONG
Tiles: dry path, sparse grass, rock, long slopes/lanes represented with existing route assets.
Fauna:
- Common: Doduo, Spearow, Rattata
- Rare: Dodrio, Fearow, Raticate
- Special: Snorlax

## 17. SAFARI WILDS
Recommended level: 32–40
Length: VERY LONG / OPEN
Tiles: existing grass/savanna-like combinations, yellow dirt, forest pockets, rock sections and decorative wet areas if available.
Fauna:
- Common/uncommon pool: Nidoran♀, Nidoran♂, Nidorina, Nidorino, Rhyhorn, Venonat, Paras, Exeggcute, Doduo, Chansey, Kangaskhan, Tauros, Scyther, Pinsir
- Rare: Parasect, Venomoth, Dodrio, Rhydon
- Elite: Nidoking, Nidoqueen, Exeggutor
Notes: this is intentionally one of the most varied zones.

## 18. KANTO SEA ROUTES
Recommended level: 35–43
Length: VERY LONG
Tiles: existing water as primary traversable/visual surface, sand, rocks, small islands, coast/reef-like decorations if present in repository.
Fauna:
- Common: Tentacool, Horsea, Shellder, Staryu, Krabby, Goldeen, Magikarp
- Rare: Tentacruel, Seadra, Kingler, Seaking
- Elite: Cloyster, Starmie, Gyarados
- Very rare: Dratini, Dragonair
Notes: this replaces the need to scatter fishing encounters through terrestrial zones.

## 19. SEAFOAM ISLANDS
Recommended level: 38–46
Length: LONG
Tiles: existing ice/water/blue cave/rock assets.
Fauna:
- Common: Seel, Shellder, Slowpoke, Horsea
- Rare: Dewgong, Slowbro, Seadra
- Elite: Cloyster
- Boss: Articuno

## 20. POWER PLANT
Recommended level: 38–46
Length: MEDIUM-LONG
Tiles: existing industrial/interior/metal/concrete assets, machines/cables only if already present.
Fauna:
- Common: Voltorb, Magnemite, Pikachu
- Rare: Magneton, Raichu, Electabuzz
- Elite: Electrode
- Boss: Zapdos

## 21. CINNABAR / POKÉMON MANSION
Recommended level: 40–49
Length: LONG
Tiles: existing ruined interior, stone/tile floor, burned/damaged-looking assets where available, laboratory/interior pieces already in repository.
Fauna:
- Common: Koffing, Grimer, Ponyta, Magmar
- Rare: Weezing, Muk
- Elite: Rapidash
- Optional very rare if additional variety is needed: Growlithe, Vulpix

## 22. INDIGO APPROACH / ROUTE 23
Recommended level: 42–51
Length: LONG
Tiles: darker grass, mountain rock, elevated route feel using existing assets.
Fauna:
- Common: Ditto, Spearow, Ekans, Sandshrew
- Strong/rare: Fearow, Arbok, Sandslash

## 23. VICTORY ROAD
Recommended level: 45–55
Length: LONG
Tiles: large dark cave, rock, cliffs/obstacles, optional water/lava-looking decoration only if existing assets already support it.
Fauna:
- Main: Machoke, Graveler, Golbat, Onix, Marowak, Venomoth
- Rare/elite: Machamp, Golem
- Boss: Moltres

## POKÉMON LEAGUE / INDIGO PLATEAU
Target level: roughly 55–65
Normal wild fauna: NONE
Purpose: trainer/boss progression, not a normal spawn zone.

## 24. CERULEAN CAVE / UNKNOWN DUNGEON
Recommended level: 55–70
Length: LONG / ENDGAME
Tiles: existing blue/dark cave, rock, crystals or luminous cave decorations only when present in repository assets.
Fauna:
- Strong pool: Golbat, Hypno, Magneton, Dodrio, Venomoth, Kadabra, Parasect, Rhydon, Ditto, Raichu, Electrode, Chansey, Wigglytuff, Arbok, Sandslash
- Elite: Alakazam
- Final boss: Mewtwo

---

# SPECIAL ACQUISITION POKÉMON

Do not use these as ordinary fauna unless a later design decision explicitly changes it:

- Bulbasaur, Charmander, Squirtle: starter system
- Ivysaur, Venusaur, Charmeleon, Charizard, Wartortle, Blastoise: evolution progression
- Eevee: Celadon-related quest/special acquisition
- Vaporeon, Jolteon, Flareon: evolution
- Hitmonlee, Hitmonchan: Saffron Fighting Dojo
- Lapras: Silph/Saffron-related special acquisition
- Porygon: Celadon-related special system
- Farfetch'd: quest/trade-style acquisition
- Mr. Mime: quest/trade-style acquisition
- Jynx: quest/trade-style acquisition
- Omanyte, Kabuto, Aerodactyl: fossil revival
- Omastar, Kabutops: evolution
- Articuno: Seafoam boss
- Zapdos: Power Plant boss
- Moltres: Victory Road boss
- Mewtwo: final Cerulean Cave boss
- Mew: event/special only

Dragonite may eventually exist as an extraordinarily rare wild elite in a suitable advanced Dratini-related area, but it must feel exceptional.

---

# WORLD SHAPE AND CONNECTION RULES

- The complete game world is composed of connected zones.
- General progression should feel like moving forward through Kanto, but each zone can bend, widen and narrow internally.
- Do not make every zone the same dimensions.
- When two or more original routes are merged into one gameplay zone, increase traversal length accordingly.
- A short cave can be much smaller than an outdoor multi-route zone.
- Use open combat pockets separated by natural obstacles rather than an endless straight corridor.
- Connections must be obvious and safe enough that players are not immediately trapped by enemy spawns when entering a new zone.
- Each visited zone should have a safe checkpoint/start position compatible with the persistent visited-zone system.

## Relative length summary

1. Pallet / Route 1 — MEDIUM
2. Viridian Outskirts / Route 2 — MEDIUM
3. Viridian Forest — MEDIUM-LONG
4. Route 3 — MEDIUM
5. Mt. Moon — LONG
6. Route 4 / Cerulean Approach — MEDIUM
7. Routes 24–25 — LONG
8. Routes 5–6 — LONG
9. Route 11 — MEDIUM
10. Diglett's Cave — SHORT
11. Routes 9–10 — LONG
12. Rock Tunnel — LONG
13. Routes 7–8 — LONG
14. Pokémon Tower — MEDIUM
15. Routes 12–15 — VERY LONG
16. Routes 16–18 — VERY LONG
17. Safari — VERY LONG / OPEN
18. Sea Routes — VERY LONG
19. Seafoam — LONG
20. Power Plant — MEDIUM-LONG
21. Pokémon Mansion — LONG
22. Route 23 — LONG
23. Victory Road — LONG
24. Cerulean Cave — LONG / ENDGAME

---

# IMPLEMENTATION PRIORITY

When implementing this specification:

1. First inspect PROJECT_STRUCTURE.md and the existing world/tile/map code and its direct dependencies only.
2. Inspect the real tile/autotile resources already present in the repository.
3. Reuse existing rendering and collision behavior.
4. Create/extend a clean data-driven zone catalog containing zone order, name, recommended level, relative size, tile theme references, checkpoint/connections and fauna tiers.
5. Build zones using existing assets only.
6. Preserve backtracking, visited-zone persistence and selectable starting checkpoints.
7. Do not redesign unrelated combat, UI, capture, economy or player systems while implementing the world foundation.
8. Keep changes focused and avoid unnecessary documentation, temporary files, duplicate files or generated asset replacements.
