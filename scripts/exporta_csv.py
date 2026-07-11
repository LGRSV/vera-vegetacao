#!/usr/bin/env python3
"""Gera exportacoes/<equipe>.csv a partir de dados/<Equipe>/*.json.

Roda no GitHub Actions a cada sync dos tecnicos (push em dados/**), de modo
que as planilhas do Google Drive que importam esses CSVs fiquem sempre em dia.
"""
import csv
import glob
import json
import os
import re
import unicodedata

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main/'

COLUNAS = ['Ponto', 'Projeto', 'Equipe', 'Data/hora', 'Espécie', 'Poste', 'Área',
           'Altura (m)', 'DAP (cm)', 'Acesso', 'Dist. BT (cm)', 'Dist. MT (cm)',
           'Dist. AT (cm)', 'Latitude', 'Longitude', 'Qtd fotos', 'Foto (link)',
           'Sincronizado']


def slug(nome):
    s = unicodedata.normalize('NFKD', nome).encode('ascii', 'ignore').decode()
    return re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()


def linha(d):
    fotos = d.get('fotos_github') or []
    return [
        d.get('id', ''), d.get('projeto', ''), d.get('usuario', ''), d.get('data', ''),
        d.get('especie', ''), d.get('poste', ''), d.get('area', ''), d.get('altura', ''),
        d.get('dap', ''), d.get('acesso', ''), d.get('dtbt', ''), d.get('dtmt', ''),
        d.get('dtat', ''), d.get('lat', ''), d.get('lon', ''), d.get('fotos_count', ''),
        (RAW + fotos[0]) if fotos else '', 'Sim' if d.get('synced') else 'Não',
    ]


def exporta_status_rotas():
    """Gera exportacoes/rotas-status.csv com a situacao de cada rota."""
    try:
        with open(os.path.join(RAIZ, 'rotas.json'), encoding='utf-8') as fh:
            rotas = {str(r.get('id')): r for r in json.load(fh).get('rotas', [])}
    except Exception:
        rotas = {}
    try:
        with open(os.path.join(RAIZ, 'estado-equipes.json'), encoding='utf-8') as fh:
            estado = json.load(fh)
    except Exception:
        estado = {}
    status = estado.get('statusRotas') or {}
    ativos = {str(v.get('projetoAtivo', {}).get('rotaId')): k
              for k, v in (estado.get('equipes') or {}).items() if v.get('projetoAtivo')}
    destino = os.path.join(RAIZ, 'exportacoes', 'rotas-status.csv')
    with open(destino, 'w', newline='', encoding='utf-8') as fh:
        w = csv.writer(fh)
        w.writerow(['Rota (id)', 'Projeto', 'Equipe', 'Situação', 'Concluída em', 'Concluída por'])
        vistos = set()
        for rid, meta in status.items():
            r = rotas.get(rid, {})
            w.writerow([rid, meta.get('nomeProjeto') or r.get('nomeProjeto', ''),
                        meta.get('equipe') or r.get('equipe', ''),
                        'Concluída' if meta.get('status') == 'concluido' else meta.get('status', ''),
                        meta.get('concluidoEm', ''), meta.get('concluidoPor', '')])
            vistos.add(rid)
        for rid, r in rotas.items():
            if rid in vistos:
                continue
            situacao = 'Em andamento' if rid in ativos else 'Não iniciada'
            w.writerow([rid, r.get('nomeProjeto', ''), r.get('equipe', ''), situacao, '', ''])
    print(f'{destino}: {len(status)} concluída(s) de {len(rotas)} rota(s)')


def main():
    os.makedirs(os.path.join(RAIZ, 'exportacoes'), exist_ok=True)
    exporta_status_rotas()
    pastas = sorted(glob.glob(os.path.join(RAIZ, 'dados', '*')))
    for pasta in pastas:
        arquivos = sorted(glob.glob(os.path.join(pasta, '*.json')))
        registros = []
        for arq in arquivos:
            if os.path.basename(arq) == 'indice.json':
                continue
            try:
                with open(arq, encoding='utf-8') as fh:
                    d = json.load(fh)
            except Exception:
                continue
            if isinstance(d, dict) and d.get('id'):
                registros.append(linha(d))
        if not registros:
            continue
        destino = os.path.join(RAIZ, 'exportacoes', slug(os.path.basename(pasta)) + '.csv')
        with open(destino, 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(COLUNAS)
            w.writerows(registros)
        print(f'{destino}: {len(registros)} pontos')


if __name__ == '__main__':
    main()
