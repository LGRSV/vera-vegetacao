#!/usr/bin/env python3
"""Gera exportacoes/painel.json — os dados dos painéis do técnico e do admin.

O celular de campo baixa UM arquivo pequeno em vez de 20 arquivos de cabo: a
quilometragem, o município e a produção diária saem prontos daqui.

Definições (a mesma para os dois painéis, para os números baterem):
  km             comprimento do traçado T1+T2 da rota (cabos/<polo>/<cod>.json)
  percorrido     fração do traçado com ponto registrado a menos de 120 m
  km_mapeado     km, se a rota está concluída; km x percorrido, se não
                 (uma rota em andamento não pode contar 49 km no 2º dia)
  status         concluida | andamento | fila — o mesmo do painel admin
"""
import collections, glob, json, math, os, re, sys, datetime

RAIZ = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, 'exportacoes', 'painel.json')

# Rotas de julho, anteriores ao cadastro de traçado no rotas.json. Os
# alimentadores vêm do histórico do rotas.json; o traçado atual desses arquivos
# é idêntico ao da época (conferido), então a quilometragem é a da rota.
LEGADO = {
    'Porto Nacional':    ('CENTRO', ['AL01072001', 'AL02072001', 'AL03072001', 'AL04072001', 'AL05072001',
                                     'AL06072001', 'LD01072001', 'LD02072001', 'LD03072001']),
    'SE Paraíso I':      ('CENTRO', ['AL01062013', 'AL02062013', 'AL03062013', 'AL04062013', 'AL05062013',
                                     'LD01062013', 'LD02062013', 'LD03062013', 'LD04062013', 'LD05062013']),
    'Rota Paraíso SE 2': ('CENTRO', ['LD01004013', 'LD02004013']),
    'Rota Guaraí':       ('NORTE',  ['AL01037009', 'AL02037009', 'AL03037009', 'AL01038009', 'LD01038009',
                                     'LD02038009', 'LD03038009', 'LD04038009']),
}
# O campo municipio do índice é o da SUBESTAÇÃO, não o da rota. Onde os dois
# divergem, vale o conferido ponto a ponto contra a malha do IBGE.
MUNICIPIO = {
    'Porto Nacional': 'Porto Nacional',
    'SE Paraíso I': 'Paraíso do Tocantins',
    'Rota Paraíso SE 2': 'Paraíso do Tocantins',
    'Rota Guaraí': 'Guaraí',
    'Rota SE Colinas': 'Colinas do Tocantins',
}
RAIO_M, PASSO_KM, GRADE = 120.0, 0.025, 0.0015


def km(la1, lo1, la2, lo2):
    return math.hypot((la1 - la2) * 111.32, (lo1 - lo2) * 111.32 * math.cos(math.radians(la1)))


def ler(p, padrao=None):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return padrao


def municipio_da_rota(nome, polo, cods, indice):
    if nome in MUNICIPIO:
        return MUNICIPIO[nome]
    for c in cods:                     # código sintético (AL02109039AG) → o índice
        if re.search(r'[A-Z]{2}$', c):  # guarda a cidade real, gravada no recorte
            m = (indice.get(polo, {}).get(c) or {}).get('municipio')
            if m:
                return m
    return re.sub(r'^Rota\s+', '', nome)


def data_iso(txt):
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})', str(txt or ''))
    return f'{m.group(3)}-{m.group(2)}-{m.group(1)}' if m else None


def main():
    est = ler(os.path.join(RAIZ, 'estado-equipes.json'), {})
    status = {k: v for k, v in (est.get('statusRotas') or {}).items()}
    ativas = {}
    for eq, v in (est.get('equipes') or {}).items():
        pa = v.get('projetoAtivo') or {}
        if pa.get('rotaId'):
            ativas[str(pa['rotaId'])] = eq
    indice = ler(os.path.join(RAIZ, 'dados', 'indice.json'), {})

    # catálogo de rotas: rotas.json + as de julho que só existem no statusRotas
    rotas = []
    vistos = set()
    for r in (ler(os.path.join(RAIZ, 'rotas.json'), {}) or {}).get('rotas', []):
        rotas.append((str(r['id']), r.get('nomeProjeto', ''), r.get('equipe', ''),
                      r.get('polo', ''), list(r.get('alimentadores') or [])))
        vistos.add(str(r['id']))
    for rid, v in status.items():
        if rid in vistos:
            continue
        nome = v.get('nomeProjeto') or ''
        polo, cods = LEGADO.get(nome, ('', []))
        rotas.append((rid, nome, v.get('equipe') or 'Enecol Centro', polo, cods))

    # pontos de campo, agrupados pelo nome do projeto
    pontos = collections.defaultdict(list)
    for arq in glob.glob(os.path.join(RAIZ, 'dados', '*', '*.json')):
        if os.path.basename(arq) == 'indice.json':
            continue
        d = ler(arq)
        if not isinstance(d, dict) or not d.get('id'):
            continue
        dia = data_iso(d.get('data'))
        if not dia:
            continue
        try:
            la, lo = float(d['lat']), float(d['lon'])
        except Exception:
            la = lo = None
        pontos[(d.get('projeto') or '').strip()].append({
            'dia': dia, 'equipe': d.get('usuario') or '', 'lat': la, 'lon': lo,
            'fotos': len(d.get('fotos_github') or []),
        })

    saida_rotas, diario = [], collections.Counter()
    for rid, nome, equipe, polo, cods in rotas:
        segs = []
        for c in cods:
            cab = ler(os.path.join(RAIZ, 'cabos', polo, c + '.json'), {}) or {}
            segs += (cab.get('t1') or []) + (cab.get('t2') or [])
        ext = sum(km(s[i][1], s[i][0], s[i + 1][1], s[i + 1][0]) for s in segs for i in range(len(s) - 1))

        P = pontos.get(nome, [])
        # percorrido: fração do traçado com ponto a menos de 120 m
        perc = None
        if segs and P:
            grade = collections.defaultdict(list)
            for p in P:
                if p['lat'] is not None:
                    grade[(int(p['lon'] / GRADE), int(p['lat'] / GRADE))].append((p['lat'], p['lon']))
            tot = cob = 0.0
            for s in segs:
                for i in range(len(s) - 1):
                    (lo1, la1), (lo2, la2) = s[i][:2], s[i + 1][:2]
                    d = km(la1, lo1, la2, lo2)
                    if d <= 0:
                        continue
                    n = max(1, int(d / PASSO_KM))
                    for k in range(n):
                        t = (k + 0.5) / n
                        lo, la = lo1 + (lo2 - lo1) * t, la1 + (la2 - la1) * t
                        tot += d / n
                        gx, gy = int(lo / GRADE), int(la / GRADE)
                        ok = any(km(la, lo, a, b) * 1000 <= RAIO_M
                                 for ax in (-1, 0, 1) for ay in (-1, 0, 1)
                                 for a, b in grade.get((gx + ax, gy + ay), ()))
                        if ok:
                            cob += d / n
            perc = cob / tot if tot else None

        st = 'concluida' if (status.get(rid) or {}).get('status') == 'concluido' \
            else ('andamento' if rid in ativas else 'fila')
        km_map = ext if st == 'concluida' else (ext * perc if perc is not None else 0.0)
        dias = sorted({p['dia'] for p in P})
        for p in P:
            diario[(nome, p['dia'], p['equipe'])] += 1
        saida_rotas.append({
            'id': rid, 'nome': nome, 'municipio': municipio_da_rota(nome, polo, cods, indice),
            'equipe': equipe, 'status': st,
            'km': round(ext, 2), 'km_mapeado': round(km_map, 2),
            'percorrido': round(perc, 3) if perc is not None else None,
            'pontos': len(P), 'fotos': sum(p['fotos'] for p in P),
            'de': dias[0] if dias else None, 'ate': dias[-1] if dias else None,
            'concluida_em': ((status.get(rid) or {}).get('concluidoEm') or '')[:10] or None,
        })

    doc = {
        'gerado': datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z',
        'rotas': saida_rotas,
        'diario': [{'rota': r, 'dia': d, 'equipe': e, 'arvores': n}
                   for (r, d, e), n in sorted(diario.items(), key=lambda x: (x[0][1], x[0][0]))],
    }
    # sem mudança nos dados, o arquivo fica como está: senão o carimbo de
    # hora geraria um commit a cada execução do workflow
    try:
        antigo = json.load(open(SAIDA, encoding='utf-8'))
        if antigo.get('rotas') == doc['rotas'] and antigo.get('diario') == doc['diario']:
            print(f'{SAIDA}: sem mudancas')
            return
    except (OSError, ValueError):
        pass
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'{SAIDA}: {len(saida_rotas)} rotas, {len(doc["diario"])} linhas diarias, '
          f'{os.path.getsize(SAIDA) / 1024:.1f} KB')


if __name__ == '__main__':
    main()
