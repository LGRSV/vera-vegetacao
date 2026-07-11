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


def esc_xml(t):
    return (str(t or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


def exporta_projetos(pontos):
    """Gera exportacoes/projetos/<slug>/pontos.csv e pontos.kml por projeto."""
    por_projeto = {}
    for d in pontos:
        nome = (d.get('projeto') or 'sem-projeto').strip() or 'sem-projeto'
        por_projeto.setdefault(nome, []).append(d)

    for nome, regs in sorted(por_projeto.items()):
        pasta = os.path.join(RAIZ, 'exportacoes', 'projetos', slug(nome))
        os.makedirs(pasta, exist_ok=True)

        with open(os.path.join(pasta, 'pontos.csv'), 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(COLUNAS)
            w.writerows(linha(d) for d in regs)

        pm = []
        for d in regs:
            lat, lon = d.get('lat'), d.get('lon')
            if lat in (None, '') or lon in (None, ''):
                continue
            fotos = d.get('fotos_github') or []
            desc = ('Espécie: %s<br/>Poste: %s<br/>Área: %s<br/>Altura: %s m · DAP: %s cm<br/>'
                    'Dist. BT/MT/AT: %s/%s/%s cm<br/>Equipe: %s · %s%s') % (
                esc_xml(d.get('especie')), esc_xml(d.get('poste')), esc_xml(d.get('area')),
                esc_xml(d.get('altura')), esc_xml(d.get('dap')), esc_xml(d.get('dtbt')),
                esc_xml(d.get('dtmt')), esc_xml(d.get('dtat')), esc_xml(d.get('usuario')),
                esc_xml(d.get('data')),
                ('<br/><a href="%s%s">Foto</a>' % (RAW, esc_xml(fotos[0]))) if fotos else '')
            pm.append('<Placemark><name>%s — %s</name><description><![CDATA[%s]]></description>'
                      '<Point><coordinates>%s,%s,0</coordinates></Point></Placemark>'
                      % (esc_xml(d.get('id')), esc_xml(d.get('especie')), desc, lon, lat))
        kml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>%s — pontos VERA</name>\n'
               '%s\n</Document></kml>\n') % (esc_xml(nome), '\n'.join(pm))
        with open(os.path.join(pasta, 'pontos.kml'), 'w', encoding='utf-8') as fh:
            fh.write(kml)
        print(f'{pasta}: {len(regs)} pontos (csv+kml)')


def main():
    os.makedirs(os.path.join(RAIZ, 'exportacoes'), exist_ok=True)
    exporta_status_rotas()
    todos_pontos = []
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
                todos_pontos.append(d)
        if not registros:
            continue
        destino = os.path.join(RAIZ, 'exportacoes', slug(os.path.basename(pasta)) + '.csv')
        with open(destino, 'w', newline='', encoding='utf-8') as fh:
            w = csv.writer(fh)
            w.writerow(COLUNAS)
            w.writerows(registros)
        print(f'{destino}: {len(registros)} pontos')

    exporta_projetos(todos_pontos)


if __name__ == '__main__':
    main()
