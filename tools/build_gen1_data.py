#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera los datos de Kanto (Gen I) que usa el modo Kanto. Se ejecuta una vez
(o al cambiar las fuentes); el juego NO consulta nada en internet.

    python tools/build_gen1_data.py [--pokered vendor/pokered] [--pokeapi vendor/pokeapi]

Fuentes (no van al repositorio, ver .gitignore):
  vendor/pokered   desensamblado de Pokémon Rojo/Azul:
                     git clone --depth 1 https://github.com/pret/pokered vendor/pokered
  vendor/pokeapi   CSV de PokeAPI (seis stats modernos y nombres en español):
                     for f in pokemon_stats moves move_names; do
                       curl -sSo vendor/pokeapi/$f.csv \
                         https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/$f.csv
                     done

Escribe:
  js/data/gen1-progression.js   151 especies: stats base (6 modernos + 5 Gen I), crecimiento,
                                ratio de captura, exp. base, movimientos iniciales,
                                aprendizaje por nivel y evoluciones; tablas de EXP 1..100
  js/data/gen1-moves-meta.js    165 movimientos Gen I: tipo, potencia, precisión, PP, efecto
  js/data/kanto-zones.js        tools/data/KANTO_ZONES_V1.json tal cual (semilla de zonas)
"""
import argparse
import csv
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GROWTH_IDS = {
    'GROWTH_MEDIUM_FAST': 'medium_fast', 'GROWTH_SLIGHTLY_FAST': 'slightly_fast',
    'GROWTH_SLIGHTLY_SLOW': 'slightly_slow', 'GROWTH_MEDIUM_SLOW': 'medium_slow',
    'GROWTH_FAST': 'fast', 'GROWTH_SLOW': 'slow',
}
GROWTH_ORDER = ['medium_fast', 'slightly_fast', 'slightly_slow', 'medium_slow', 'fast', 'slow']
TYPE_IDS = {'PSYCHIC_TYPE': 'psychic', 'BIRD': 'flying'}
# Stats de PokeAPI (stat_id) -> nombre en el juego.
STAT_IDS = {1: 'hp', 2: 'attack', 3: 'defense', 4: 'specialAttack', 5: 'specialDefense', 6: 'speed'}
DAMAGE_CLASS = {1: 'status', 2: 'physical', 3: 'special'}
# Gen I: la categoría la decide el tipo (sólo se guarda como dato).
GEN1_SPECIAL_TYPES = {'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon'}


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def strip_comment(line):
    return line.split(';', 1)[0].strip()


def consts(path):
    """Lista de constantes en orden (const_def / const NOMBRE)."""
    out = []
    for line in read(path).splitlines():
        if re.match(r'\s*const_skip\b', line):
            out.append(None)            # hueco (MissingNo y similares)
            continue
        m = re.match(r'\s*const\s+(\w+)', line)
        if m:
            out.append(m.group(1))
    return out


def item_id(const):
    return const.lower().replace('_', '-')


def type_id(const):
    return TYPE_IDS.get(const, const.lower())


def parse_moves(pokered, pokeapi):
    move_consts = consts(os.path.join(pokered, 'constants/move_constants.asm'))
    # NO_MOVE es el 0; el resto va en orden y coincide con el número nacional de PokeAPI.
    num_of = {c: i for i, c in enumerate(move_consts) if c}
    api = {}
    with io.open(os.path.join(pokeapi, 'moves.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            api[int(r['id'])] = r
    names = {}
    with io.open(os.path.join(pokeapi, 'move_names.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            if r['local_language_id'] in ('7', '9'):
                names.setdefault(int(r['move_id']), {})[r['local_language_id']] = r['name']
    moves = []
    for line in read(os.path.join(pokered, 'data/moves/moves.asm')).splitlines():
        m = re.match(r'\s*move\s+(.+)', strip_comment(line))
        if not m:
            continue
        const, effect, power, typ, acc, pp = [x.strip() for x in m.group(1).split(',')]
        num = num_of[const]
        a = api[num]
        t = type_id(typ)
        power = int(power)
        cat = DAMAGE_CLASS[int(a['damage_class_id'])] if power > 0 else 'status'
        if power > 0 and cat == 'status':
            cat = 'special' if t in GEN1_SPECIAL_TYPES else 'physical'
        moves.append({
            'id': a['identifier'], 'num': num, 'const': const,
            'name': names.get(num, {}).get('7') or names.get(num, {}).get('9') or a['identifier'],
            'nameEn': names.get(num, {}).get('9') or a['identifier'],
            'type': t, 'power': power, 'accuracy': int(acc), 'pp': int(pp), 'effect': effect,
            'category': cat,
            'gen1Category': 'status' if power == 0 else ('special' if t in GEN1_SPECIAL_TYPES else 'physical'),
        })
    by_const = {m['const']: m['id'] for m in moves}
    return moves, by_const


def parse_base_stats(pokered, move_id):
    out = {}
    folder = os.path.join(pokered, 'data/pokemon/base_stats')
    for fn in sorted(os.listdir(folder)):
        lines = [strip_comment(l) for l in read(os.path.join(folder, fn)).splitlines()]
        lines = [l for l in lines if l.startswith('db ')]
        dex_const = lines[0][3:].strip()
        stats = [int(x) for x in lines[1][3:].split(',')]
        types = [type_id(x.strip()) for x in lines[2][3:].split(',')]
        catch = int(lines[3][3:])
        base_exp = int(lines[4][3:])
        initial = [x.strip() for x in lines[5][3:].split(',') if x.strip() != 'NO_MOVE']
        growth = GROWTH_IDS[lines[6][3:].strip()]
        out[dex_const] = {
            'gen1Stats': dict(zip(['hp', 'atk', 'def', 'spd', 'spc'], stats)),
            'gen1Types': sorted(set(types), key=types.index),
            'catchRate': catch, 'baseExp': base_exp,
            'initialMoves': [move_id[c] for c in initial],
            'growthRate': growth,
        }
    return out


def parse_evos_moves(pokered, move_id):
    """{ especie (constante) -> { evolution: [...], learnset: [...] } }"""
    species = consts(os.path.join(pokered, 'constants/pokemon_constants.asm'))
    text = read(os.path.join(pokered, 'data/pokemon/evos_moves.asm'))
    table = re.search(r'EvosMovesPointerTable:(.*?)assert_table_length', text, re.S).group(1)
    labels = re.findall(r'dw\s+(\w+)', table)
    label_species = {lab: species[i + 1] for i, lab in enumerate(labels)}
    blocks = {}
    cur = None
    for line in text.splitlines():
        m = re.match(r'^(\w+EvosMoves):', line)
        if m:
            cur = m.group(1)
            blocks[cur] = []
            continue
        if cur:
            l = strip_comment(line)
            if l.startswith('db '):
                blocks[cur].append([x.strip() for x in l[3:].split(',')])
    out = {}
    for lab, rows in blocks.items():
        sp = label_species.get(lab)
        if not sp:
            continue
        evos, learn, part = [], [], 'evo'
        for r in rows:
            if r == ['0']:
                part = 'learn' if part == 'evo' else 'done'
                continue
            if part == 'evo':
                if r[0] == 'EVOLVE_LEVEL':
                    evos.append({'method': 'level', 'level': int(r[1]), 'to': r[2]})
                elif r[0] == 'EVOLVE_ITEM':
                    evos.append({'method': 'item', 'item': item_id(r[1]), 'level': int(r[2]), 'to': r[3]})
                elif r[0] == 'EVOLVE_TRADE':
                    evos.append({'method': 'trade', 'level': int(r[1]), 'to': r[2]})
                else:
                    raise ValueError(f'{lab}: evolución desconocida {r}')
            elif part == 'learn':
                learn.append({'level': int(r[0]), 'move': move_id[r[1]]})
        out[sp] = {'evolution': evos, 'learnset': learn}
    return out


def parse_six_stats(pokeapi):
    six = {}
    with io.open(os.path.join(pokeapi, 'pokemon_stats.csv'), encoding='utf-8') as f:
        for r in csv.DictReader(f):
            pid = int(r['pokemon_id'])
            if pid <= 151:
                six.setdefault(pid, {})[STAT_IDS[int(r['stat_id'])]] = int(r['base_stat'])
    return six


def parse_prices(pokered):
    items = consts(os.path.join(pokered, 'constants/item_constants.asm'))
    prices = re.findall(r'bcd3\s+(\d+)\s*;\s*(\w+)', read(os.path.join(pokered, 'data/items/prices.asm')))
    known = set(i for i in items if i)
    return {item_id(c): int(p) for p, c in prices if c in known and int(p) > 0}


LEAGUE = [('lorelei', 'LoreleiData'), ('bruno', 'BrunoData'), ('agatha', 'AgathaData'),
          ('lance', 'LanceData'), ('champion', 'Rival3Data')]


def parse_league(pokered, dex_of):
    """Equipos de la Liga (parties.asm). El campeón tiene una variante por inicial."""
    text = read(os.path.join(pokered, 'data/trainers/parties.asm'))
    out = []
    for key, label in LEAGUE:
        block = re.search(label + r':\n(.*?)(?:\n\n|\Z)', text, re.S).group(1)
        teams = []
        for line in block.splitlines():
            l = strip_comment(line)
            if not l.startswith('db $FF'):
                continue
            vals = [x.strip() for x in l[3:].split(',')][1:-1]
            teams.append([[dex_of[vals[i + 1]], int(vals[i])] for i in range(0, len(vals), 2)])
        out.append({'id': key, 'teams': teams})
    return out


def growth_table(rate):
    """EXP total para cada nivel 1..100 (índice = nivel; [0] sin usar)."""
    a, b, c, d, e = {
        'medium_fast': (1, 1, 0, 0, 0), 'slightly_fast': (3, 4, 10, 0, 30),
        'slightly_slow': (3, 4, 20, 0, 70), 'medium_slow': (6, 5, -15, 100, 140),
        'fast': (4, 5, 0, 0, 0), 'slow': (5, 4, 0, 0, 0),
    }[rate]
    t = [0, 0]
    for n in range(2, 101):
        t.append(max(0, a * n ** 3 // b + c * n * n + d * n - e))
    return t


def js_header(title, lines):
    return '\n'.join([f'/* ============ {title} — GENERADO, no editar a mano ============'] +
                     [' * ' + l if l else ' *' for l in lines] + [' */'])


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('  ' + os.path.relpath(path, ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pokered', default=os.path.join(ROOT, 'vendor', 'pokered'))
    ap.add_argument('--pokeapi', default=os.path.join(ROOT, 'vendor', 'pokeapi'))
    ap.add_argument('--zones', default=os.path.join(ROOT, 'tools', 'data', 'KANTO_ZONES_V1.json'))
    args = ap.parse_args()
    for p in (args.pokered, args.pokeapi):
        if not os.path.isdir(p):
            sys.exit(f'Falta {p}: mira el comentario al principio de este archivo para descargarlo.')

    moves, move_id = parse_moves(args.pokered, args.pokeapi)
    base = parse_base_stats(args.pokered, move_id)
    evos = parse_evos_moves(args.pokered, move_id)
    six = parse_six_stats(args.pokeapi)
    dex_consts = consts(os.path.join(args.pokered, 'constants/pokedex_constants.asm'))
    dex_of = {c[4:]: i + 1 for i, c in enumerate(dex_consts)}     # DEX_BULBASAUR -> BULBASAUR: 1

    species = []
    for name, dex in sorted(dex_of.items(), key=lambda kv: kv[1]):
        b = base['DEX_' + name]
        ev = evos[name]
        species.append({
            'dex': dex, 'const': name,
            'baseStats': six[dex], 'gen1Stats': b['gen1Stats'], 'gen1Types': b['gen1Types'],
            'growthRate': b['growthRate'], 'catchRate': b['catchRate'], 'baseExp': b['baseExp'],
            'initialMoves': b['initialMoves'],
            'learnset': ev['learnset'],
            'evolution': [dict(e, to=dex_of[e['to']]) for e in ev['evolution']],
        })
    pre = {}
    for s in species:
        for e in s['evolution']:
            pre[e['to']] = s['dex']
    for s in species:
        if s['dex'] in pre:
            s['evolvesFrom'] = pre[s['dex']]
    assert len(species) == 151, len(species)

    growth = {r: growth_table(r) for r in GROWTH_ORDER}
    prices = parse_prices(args.pokered)
    league = parse_league(args.pokered, dex_of)

    print('Escribiendo:')
    rows = ',\n'.join('  ' + json.dumps(s, ensure_ascii=False, separators=(',', ':')) for s in species)
    write(os.path.join(ROOT, 'js', 'data', 'gen1-progression.js'), js_header('gen1-progression.js', [
        'Lo produce tools/build_gen1_data.py desde pret/pokered (Gen I) y PokeAPI (seis stats).',
        '',
        'baseStats   hp, attack, defense, specialAttack, specialDefense, speed (modernos, los que usa el juego)',
        'gen1Stats   hp, atk, def, spd, spc de Rojo/Azul (sólo dato)',
        'learnset    [{ level, move }] por nivel, de evos_moves.asm · initialMoves: los del nivel 1',
        'evolution   [{ method: level|item|trade, level, item?, to }]',
        'growth      EXP total por nivel (índice = nivel, 1..100) de cada curva de growth_rates.asm',
        'prices      precios de prices.asm · league: equipos [[dex, nivel]] de parties.asm',
        '            (champion: una variante por inicial del rival, en el orden del juego)',
    ]) + '\nG.GEN1 = {\n  growth: ' + json.dumps(growth, separators=(',', ':')) +
          ',\n  league: ' + json.dumps(league, separators=(',', ':')) +
          ',\n  prices: ' + json.dumps(prices, separators=(',', ':')) +
          ',\n  species: [\n' + rows + '\n  ]\n};\nG.GEN1.BY = {};\nfor (const s of G.GEN1.species) G.GEN1.BY[s.dex] = s;\n')

    mrows = ',\n'.join('  ' + json.dumps({k: v for k, v in m.items() if k != 'const'}, ensure_ascii=False, separators=(',', ':')) for m in moves)
    write(os.path.join(ROOT, 'js', 'data', 'gen1-moves-meta.js'), js_header('gen1-moves-meta.js', [
        'Lo produce tools/build_gen1_data.py desde pret/pokered/data/moves/moves.asm.',
        'Tipo, potencia, precisión, PP y efecto de Gen I. category: físico/especial/estado',
        '(el de PokeAPI, porque el juego usa los seis stats modernos); gen1Category: el de Gen I.',
        'id = el de PokeAPI (el mismo que usan los movimientos de js/data/moves.js).',
    ]) + '\nG.GEN1_MOVES = [\n' + mrows + '\n];\nG.GEN1_MOVES.BY = {};\nfor (const m of G.GEN1_MOVES) G.GEN1_MOVES.BY[m.id] = m;\n')

    with io.open(args.zones, encoding='utf-8') as f:
        zones = json.load(f)
    write(os.path.join(ROOT, 'js', 'data', 'kanto-zones.js'), js_header('kanto-zones.js', [
        'Lo produce tools/build_gen1_data.py desde tools/data/KANTO_ZONES_V1.json (semilla de las 19 zonas).',
        'Se valida contra las evoluciones de Gen I al cargar (js/kanto/zones.js) y en tests/kanto.test.cjs.',
    ]) + '\nG.KANTO_ZONES_SEED = ' + json.dumps(zones, ensure_ascii=False, indent=1) + ';\n')
    print(f'{len(species)} especies, {len(moves)} movimientos, {len(zones["zones"])} zonas')


if __name__ == '__main__':
    main()
