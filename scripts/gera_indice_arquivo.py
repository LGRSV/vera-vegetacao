#!/usr/bin/env python3
"""Gera exportacoes/indice-arquivo.json — o manifesto do arquivo de fotos.

O visualizador (arquivo-fotos.js) monta as URLs das fotos por derivação do id
do ponto, então não precisa de um índice por foto; precisa apenas saber quais
projetos existem, de que tamanho e em que pasta. Este manifesto tem ~3 KB e é
o único arquivo extra que o arquivo de fotos custa ao repositório.

Entram só os projetos já encerrados: o que está ativo para alguma equipe
continua sendo visto pela aba normal de registros, não pelo arquivo.
"""
import collections
import glob
import json
import os
import re
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def slug(nome):
    s = unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()


def data_br(iso):
    """'2026-08-24T13:02:11.000Z' ou '24/08/2026 13:02' -> '24/08/2026'."""
    t = str(iso or '')
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', t)
    if m:
        return '%s/%s/%s' % (m.group(3), m.group(2), m.group(1))
    m = re.match(r'(\d{2}/\d{2}/\d{4})', t)
    return m.group(1) if m else ''


def chave_data(br):
    d, m, a = br.split('/')
    return (a, m, d)


def main():
    estado = json.load(open(os.path.join(RAIZ, 'estado-equipes.json'), encoding='utf-8'))
    ativos = set()
    for eq in (estado.get('equipes') or {}).values():
        pa = eq.get('projetoAtivo') or {}
        if pa.get('nomeProjeto'):
            ativos.add(pa['nomeProjeto'].strip())

    projs = collections.defaultdict(lambda: {
        'pontos': 0, 'fotos': 0, 'ausentes': 0, 'datas': [],
        'especies': collections.Counter(), 'equipe': '', 'pasta': ''})

    for arq in sorted(glob.glob(os.path.join(RAIZ, 'dados', '*', '*.json'))):
        if os.path.basename(arq) == 'indice.json':
            continue
        try:
            d = json.load(open(arq, encoding='utf-8'))
        except Exception:
            continue
        if not isinstance(d, dict) or not d.get('id'):
            continue
        nome = (d.get('projeto') or '').strip()
        if not nome or nome in ativos:
            continue
        p = projs[nome]
        p['pontos'] += 1
        p['equipe'] = p['equipe'] or (d.get('usuario') or '')
        dt = data_br(d.get('data'))
        if dt:
            p['datas'].append(dt)
        if d.get('especie'):
            p['especies'][d['especie']] += 1
        for f in (d.get('fotos_github') or []):
            p['pasta'] = p['pasta'] or f.split('/')[1]
            # 'fotos' conta o que existe mesmo no repositório: é o número que o
            # visualizador consegue abrir. O que o aparelho registrou mas nunca
            # sincronizou vai em 'fotos_ausentes' (Porto Nacional, 806).
            if os.path.exists(os.path.join(RAIZ, f)):
                p['fotos'] += 1
            else:
                p['ausentes'] += 1

    saida = []
    for nome, p in sorted(projs.items(), key=lambda kv: -kv[1]['pontos']):
        datas = sorted(p['datas'], key=chave_data)
        saida.append({
            'nome': nome,
            'slug': slug(nome),
            'equipe': p['equipe'],
            'pasta_fotos': p['pasta'],
            'pontos': p['pontos'],
            'fotos': p['fotos'],
            'fotos_ausentes': p['ausentes'],
            'de': datas[0] if datas else '',
            'ate': datas[-1] if datas else '',
            'especie_top': p['especies'].most_common(1)[0][0] if p['especies'] else '',
        })

    hoje = __import__('datetime').date.today().strftime('%d/%m/%Y')
    doc = {
        'gerado': hoje,
        'total_pontos': sum(p['pontos'] for p in saida),
        'total_fotos': sum(p['fotos'] for p in saida),
        'projetos': saida,
    }
    destino = os.path.join(RAIZ, 'exportacoes', 'indice-arquivo.json')
    with open(destino, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print('%s: %d projeto(s), %d pontos, %d fotos'
          % (destino, len(saida), doc['total_pontos'], doc['total_fotos']))


if __name__ == '__main__':
    main()
