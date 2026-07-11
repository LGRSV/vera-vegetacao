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


def main():
    os.makedirs(os.path.join(RAIZ, 'exportacoes'), exist_ok=True)
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
