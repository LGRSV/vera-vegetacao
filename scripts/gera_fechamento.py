# -*- coding: utf-8 -*-
"""Fechamento VERA setembro/outubro 2026 (+ acumulado do ano) em xlsx."""
import json, glob, os, sys, datetime, collections
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

REPO = sys.argv[1]
SAIDA = sys.argv[2]
RAW = 'https://raw.githubusercontent.com/LGRSV/vera-vegetacao/main/'
MESES = {7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro'}
SEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

painel = json.load(open(f'{REPO}/exportacoes/painel.json', encoding='utf-8'))
rotas = {r['nome']: r for r in painel['rotas']}
estado = json.load(open(f'{REPO}/estado-equipes.json', encoding='utf-8'))
rj = json.load(open(f'{REPO}/rotas.json', encoding='utf-8'))['rotas']
indice = json.load(open(f'{REPO}/dados/indice.json', encoding='utf-8'))
se_rota = {}
for r in rj:
    ses = []
    for a in r.get('alimentadores', []):
        s = (indice.get(r.get('polo'), {}).get(a) or {}).get('se')
        if s and s not in ses: ses.append(s)
    se_rota[r['nomeProjeto']] = ', '.join(ses)
# rotas legadas (julho) sem traçado próprio no rotas.json
se_rota.setdefault('Porto Nacional', 'SE Porto Nacional')
se_rota.setdefault('SE Paraíso I', 'SE Paraíso I')

# ---------- pontos ----------
pts = []
for f in glob.glob(f'{REPO}/dados/*/*.json'):
    pasta = os.path.basename(os.path.dirname(f))
    if pasta in ('NORTE', 'CENTRO', 'SUL') or f.endswith('indice.json'): continue
    d = json.load(open(f, encoding='utf-8'))
    for p in (d if isinstance(d, list) else [d]):
        nome = (p.get('projeto') or '').strip()
        if nome not in rotas: continue          # pontos de teste (jun) ficam fora
        try: dt = datetime.datetime.strptime(str(p['data']), '%d/%m/%Y, %H:%M:%S')
        except Exception: continue
        fotos = [g for g in (p.get('fotos_github') or []) if isinstance(g, str)]
        pts.append({'p': p, 'dt': dt, 'rota': nome, 'mun': rotas[nome]['municipio'],
                    'fotos': fotos, 'nf': len(fotos)})
pts.sort(key=lambda x: x['dt'])

def num(v):
    try: return float(str(v).replace(',', '.'))
    except Exception: return None

# km alocado por ponto: a extensão da rota dividida pelos pontos dela
pts_rota = collections.Counter(x['rota'] for x in pts)
for x in pts:
    r = rotas[x['rota']]
    n = pts_rota[x['rota']]
    x['km_rede'] = r['km'] / n
    x['km_perc'] = r['km'] * (r['percorrido'] if r['percorrido'] is not None else 1) / n

concl = {}
for k, v in estado['statusRotas'].items():
    if v.get('status') == 'concluido' and v.get('nomeProjeto'):
        concl[v['nomeProjeto']] = v.get('concluidoEm', '')[:10]
for r in painel['rotas']:
    if r['status'] == 'concluida' and r['nome'] not in concl and r.get('concluida_em'):
        concl[r['nome']] = r['concluida_em']

# ---------- estilo ----------
VERDE = PatternFill('solid', fgColor='1A2E1A')
VERDE2 = PatternFill('solid', fgColor='E8F5E9')
CINZA = PatternFill('solid', fgColor='F3F5F2')
AMAR = PatternFill('solid', fgColor='FFF3E0')
B = Side(style='thin', color='C8DBC4')
BORDA = Border(left=B, right=B, top=B, bottom=B)
H = Font(bold=True, color='FFFFFF')
NEG = Font(bold=True)
TIT = Font(bold=True, size=14, color='1A2E1A')
SUB = Font(italic=True, size=9, color='5A7A55')

def cabecalho(ws, linha, cols, larguras=None):
    for i, c in enumerate(cols, 1):
        cel = ws.cell(row=linha, column=i, value=c)
        cel.font = H; cel.fill = VERDE; cel.border = BORDA
        cel.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    ws.row_dimensions[linha].height = 42
    if larguras:
        for i, w in enumerate(larguras, 1): ws.column_dimensions[get_column_letter(i)].width = w

def linha(ws, r, vals, fmt=None, fill=None, font=None):
    for i, v in enumerate(vals, 1):
        c = ws.cell(row=r, column=i, value=v); c.border = BORDA
        if fmt and fmt[i - 1]: c.number_format = fmt[i - 1]
        if fill: c.fill = fill
        if font: c.font = font

def titulo(ws, t, s):
    ws['A1'] = t; ws['A1'].font = TIT
    ws['A2'] = s; ws['A2'].font = SUB

wb = Workbook()
gerado = datetime.datetime.strptime(painel['gerado'][:19], '%Y-%m-%dT%H:%M:%S') - datetime.timedelta(hours=3)

# ---------- 1. Resumo ----------
ws = wb.active; ws.title = 'Resumo'
titulo(ws, 'VERA — Fechamento Setembro/Outubro 2026',
       f'Equipe Enecol Centro · produtividade em km percorrido · dados do repositório até {gerado:%d/%m/%Y %H:%M} · Energisa Tocantins — Vegetação em Rede Ativa')
cols = ['Indicador', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Set + Out', 'Total 2026']
cabecalho(ws, 4, cols, [44, 13, 13, 13, 13, 14, 14])
grupos = {m: [x for x in pts if x['dt'].month == m] for m in MESES}
grupos['so'] = grupos[9] + grupos[10]
grupos['ano'] = pts
chaves = [7, 8, 9, 10, 'so', 'ano']
def conc_no(m):
    alvo = {7: ['07'], 8: ['08'], 9: ['09'], 10: ['10'], 'so': ['09', '10'], 'ano': ['07', '08', '09', '10', '11']}[m]
    return sum(1 for d in concl.values() if d[5:7] in alvo)
ind = [
    ('Rotas com coleta no período', lambda g, m: len({x['rota'] for x in g}), '0'),
    ('Municípios atendidos', lambda g, m: len({x['mun'] for x in g}), '0'),
    ('Rotas concluídas (data da conclusão no painel)', lambda g, m: conc_no(m), '0'),
    ('Dias de campo', lambda g, m: len({x['dt'].date() for x in g}), '0'),
    ('Árvores cadastradas (pontos)', lambda g, m: len(g), '#,##0'),
    ('Fotos enviadas', lambda g, m: sum(x['nf'] for x in g), '#,##0'),
    ('Média de árvores por dia de campo', lambda g, m: (len(g) / len({x['dt'].date() for x in g})) if g else 0, '0.0'),
    ('Km percorrido — produtividade', lambda g, m: sum(x['km_perc'] for x in g), '#,##0.0'),
    ('Km percorrido por dia de campo', lambda g, m: (sum(x['km_perc'] for x in g) / len({x['dt'].date() for x in g})) if g else 0, '0.0'),
    ('Km de rede das rotas trabalhadas (referência)', lambda g, m: sum(x['km_rede'] for x in g), '#,##0.0'),
]
r = 5
for nome, fn, fmt in ind:
    vals = [nome] + [fn(grupos[k], k) for k in chaves]
    destaque = nome.startswith('Km percorrido')
    linha(ws, r, vals, [None] + [fmt] * 6, fill=(AMAR if destaque else (VERDE2 if r % 2 else None)))
    for c in (6, 7): ws.cell(row=r, column=c).font = NEG
    ws.cell(row=r, column=1).font = NEG
    r += 1
r += 1
notas = [
    'Como ler:',
    '• Árvores = pontos de vegetação cadastrados pelo técnico (cada ponto tem até 3 fotos).',
    '• Km percorrido (produtividade) = parte do traçado T1+T2 que tem árvore registrada a até 120 m — o trecho efetivamente vistoriado. É a mesma medida do gráfico de produtividade do painel admin (v2.6.57).',
    '• Km de rede (referência) = extensão total do traçado das rotas trabalhadas. Em rotas fechadas com parte do traçado sem vistoria ela supera o percorrido (ex.: outubro, 90,6 km de rede x 38,7 km percorridos em 3 dias de campo).',
    '• O km de cada rota é rateado pelos dias de coleta proporcionalmente às árvores do dia.',
    '• Rotas concluídas contam no mês da conclusão no painel: Tocantinópolis e Augustinópolis tiveram coleta em outubro e foram concluídas em 01/11 (entram só no Total 2026).',
    '• Junho (8 pontos de teste do app) não entra no fechamento.',
    '• Formoso do Araguaia e Alvorada foram cadastradas em 19/10 e ainda não tiveram coleta.',
]
for t in notas:
    ws.cell(row=r, column=1, value=t).font = (NEG if t == 'Como ler:' else SUB); r += 1
ws.freeze_panes = 'B5'

# ---------- 2. Rotas Set-Out ----------
ws = wb.create_sheet('Rotas Set-Out')
titulo(ws, 'Rotas trabalhadas em setembro e outubro', 'Uma linha por rota com coleta em setembro ou outubro de 2026')
cols = ['Rota', 'Município', 'Subestação', 'Mês da coleta', 'Início coleta', 'Fim coleta', 'Dias de campo',
        'Árvores', 'Fotos', 'Km percorrido', '% do traçado percorrido', 'Km de rede', 'Status', 'Concluída em']
cabecalho(ws, 4, cols, [30, 24, 22, 14, 12, 12, 10, 10, 10, 12, 13, 11, 12, 13])
so = grupos['so']
por = collections.OrderedDict()
for x in so: por.setdefault(x['rota'], []).append(x)
r = 5; tot = collections.Counter()
for nome, lst in sorted(por.items(), key=lambda kv: kv[1][0]['dt']):
    R = rotas[nome]; dias = sorted({x['dt'].date() for x in lst})
    meses = sorted({x['dt'].month for x in lst})
    perc = R['percorrido']
    c = concl.get(nome)
    vals = [nome, R['municipio'], se_rota.get(nome, ''), ' / '.join(MESES[m] for m in meses), dias[0], dias[-1], len(dias),
            len(lst), sum(x['nf'] for x in lst), R['km'] * (perc or 1), perc, R['km'],
            'Concluída' if R['status'] == 'concluida' else 'Em aberto',
            datetime.datetime.strptime(c, '%Y-%m-%d').date() if c else None]
    linha(ws, r, vals, [None, None, None, None, 'dd/mm/yyyy', 'dd/mm/yyyy', '0', '#,##0', '#,##0', '0.0', '0%', '0.0', None, 'dd/mm/yyyy'],
          fill=(VERDE2 if r % 2 else None))
    tot['dias'] += len(dias); tot['arv'] += len(lst); tot['fotos'] += vals[8]; tot['km'] += R['km']; tot['kmp'] += vals[9]
    r += 1
linha(ws, r, ['TOTAL', f'{len(por)} municípios', '', '', None, None, tot['dias'], tot['arv'], tot['fotos'], tot['kmp'],
              (tot['kmp'] / tot['km']) if tot['km'] else None, tot['km'], '', None],
      [None] * 6 + ['0', '#,##0', '#,##0', '0.0', '0%', '0.0', None, None], fill=CINZA, font=NEG)
ws.freeze_panes = 'B5'; ws.auto_filter.ref = f'A4:{get_column_letter(len(cols))}{r - 1}'

# ---------- 3. Diário Set-Out ----------
ws = wb.create_sheet('Diário Set-Out')
titulo(ws, 'Produção diária — setembro e outubro', 'Dias com coleta; km percorrido e km de rede rateados pelas árvores do dia')
cols = ['Data', 'Dia', 'Mês', 'Município(s)', 'Rota(s)', 'Árvores', 'Fotos', 'Km percorrido', 'Km de rede', 'Primeiro ponto', 'Último ponto']
cabecalho(ws, 4, cols, [12, 7, 11, 34, 40, 10, 10, 11, 12, 12, 12])
pd = collections.OrderedDict()
for x in so: pd.setdefault(x['dt'].date(), []).append(x)
r = 5
for d, lst in pd.items():
    muns = list(dict.fromkeys(x['mun'] for x in lst)); rs = list(dict.fromkeys(x['rota'] for x in lst))
    vals = [d, SEM[d.weekday()], MESES[d.month], ', '.join(muns), ', '.join(rs), len(lst), sum(x['nf'] for x in lst),
            sum(x['km_perc'] for x in lst), sum(x['km_rede'] for x in lst),
            min(x['dt'] for x in lst).time(), max(x['dt'] for x in lst).time()]
    linha(ws, r, vals, ['dd/mm/yyyy', None, None, None, None, '#,##0', '#,##0', '0.0', '0.0', 'hh:mm', 'hh:mm'],
          fill=(VERDE2 if r % 2 else None))
    r += 1
linha(ws, r, ['TOTAL', '', '', f'{len(pd)} dias de campo', '', len(so), sum(x['nf'] for x in so),
              sum(x['km_perc'] for x in so), sum(x['km_rede'] for x in so), None, None],
      [None] * 5 + ['#,##0', '#,##0', '0.0', '0.0', None, None], fill=CINZA, font=NEG)
ws.freeze_panes = 'B5'; ws.auto_filter.ref = f'A4:K{r - 1}'

# ---------- 4. Espécies ----------
ws = wb.create_sheet('Espécies Set-Out')
titulo(ws, 'Espécies cadastradas — setembro e outubro', 'Quantidade de árvores por espécie informada pelo técnico')
cols = ['Espécie', 'Setembro', 'Outubro', 'Set + Out', '% do total']
cabecalho(ws, 4, cols, [24, 12, 12, 12, 12])
ce = collections.defaultdict(collections.Counter)
for x in so: ce[(x['p'].get('especie') or '(sem espécie)').strip()][x['dt'].month] += 1
r = 5
for esp, c in sorted(ce.items(), key=lambda kv: -sum(kv[1].values())):
    t = c[9] + c[10]
    linha(ws, r, [esp, c[9], c[10], t, t / len(so)], [None, '0', '0', '0', '0.0%'], fill=(VERDE2 if r % 2 else None)); r += 1
linha(ws, r, ['TOTAL', len(grupos[9]), len(grupos[10]), len(so), 1], [None, '0', '0', '0', '0%'], fill=CINZA, font=NEG)
ws.freeze_panes = 'A5'

# ---------- 5/6. Pontos por mês ----------
def aba_pontos(nome_aba, mes):
    ws = wb.create_sheet(nome_aba)
    lst = grupos[mes]
    titulo(ws, f'Pontos cadastrados — {MESES[mes]} 2026', f'{len(lst)} árvores · links das fotos no repositório do VERA')
    cols = ['ID', 'Data', 'Hora', 'Rota', 'Município', 'Poste', 'Espécie', 'Altura (m)', 'DAP (cm)',
            'Dist. BT', 'Dist. MT', 'Dist. AT', 'Área', 'Acesso', 'Latitude', 'Longitude', 'Nº fotos', 'Foto 1', 'Foto 2', 'Foto 3']
    cabecalho(ws, 4, cols, [26, 11, 9, 28, 22, 11, 16, 9, 9, 9, 9, 9, 10, 8, 11, 11, 8, 9, 9, 9])
    r = 5
    for x in lst:
        p = x['p']
        vals = [p.get('remote_id') or p.get('id'), x['dt'].date(), x['dt'].time(), x['rota'], x['mun'], p.get('poste'),
                p.get('especie'), num(p.get('altura')), num(p.get('dap')), num(p.get('dtbt')), num(p.get('dtmt')),
                num(p.get('dtat')), (p.get('area') or '').capitalize(), p.get('acesso'),
                round(p['lat'], 6), round(p['lon'], 6), x['nf'], None, None, None]
        linha(ws, r, vals, [None, 'dd/mm/yyyy', 'hh:mm', None, None, '@', None, '0.0', '0', '0', '0', '0', None, None,
                            '0.000000', '0.000000', '0', None, None, None])
        for i, g in enumerate(x['fotos'][:3]):
            c = ws.cell(row=r, column=18 + i, value=f'Foto {i + 1}')
            c.hyperlink = RAW + g.lstrip('./'); c.font = Font(color='1565C0', underline='single')
        r += 1
    ws.freeze_panes = 'B5'; ws.auto_filter.ref = f'A4:T{r - 1}'
aba_pontos('Pontos Setembro', 9)
aba_pontos('Pontos Outubro', 10)

# ---------- 7. Rotas 2026 ----------
ws = wb.create_sheet('Rotas 2026')
titulo(ws, 'Todas as rotas do VERA em 2026', 'Situação de cada rota no fechamento do ano')
cols = ['Rota', 'Município', 'Subestação', 'Início coleta', 'Fim coleta', 'Árvores', 'Fotos', 'Km percorrido',
        '% percorrido', 'Km de rede', 'Status', 'Concluída em']
cabecalho(ws, 4, cols, [30, 24, 22, 12, 12, 10, 10, 11, 12, 12, 12, 13])
r = 5; t = collections.Counter()
for R in sorted(painel['rotas'], key=lambda x: (x['de'] or '9999', x['nome'])):
    arv = pts_rota.get(R['nome'], 0); ft = sum(x['nf'] for x in pts if x['rota'] == R['nome'])
    perc = R['percorrido']; c = concl.get(R['nome'])
    st = 'Concluída' if R['status'] == 'concluida' else ('Não iniciada' if not arv else 'Em aberto')
    kmp = R['km'] * perc if perc is not None else (0 if not arv else R['km'])
    vals = [R['nome'], R['municipio'], se_rota.get(R['nome'], ''),
            datetime.date.fromisoformat(R['de']) if R['de'] else None, datetime.date.fromisoformat(R['ate']) if R['ate'] else None,
            arv, ft, kmp, perc, R['km'], st, datetime.date.fromisoformat(c) if c else None]
    linha(ws, r, vals, [None, None, None, 'dd/mm/yyyy', 'dd/mm/yyyy', '#,##0', '#,##0', '0.0', '0%', '0.0', None, 'dd/mm/yyyy'],
          fill=(AMAR if st != 'Concluída' else (VERDE2 if r % 2 else None)))
    t['arv'] += arv; t['ft'] += ft; t['km'] += R['km']; t['kmp'] += kmp; t['c'] += st == 'Concluída'
    if st == 'Concluída': t['kmc'] += R['km']
    r += 1
linha(ws, r, ['TOTAL', f"{len(painel['rotas'])} rotas · {t['c']} concluídas", '', None, None, t['arv'], t['ft'], t['kmp'],
              (t['kmp'] / t['km']) if t['km'] else None, t['km'], '', None], [None] * 5 + ['#,##0', '#,##0', '0.0', '0%', '0.0', None, None], fill=CINZA, font=NEG)
ws.cell(row=r + 2, column=1, value=f"Km percorrido no ano: {t['kmp']:.1f} km (produtividade). Km de rede das rotas concluídas: {t['kmc']:.1f} km (o quadro de municípios do site mostra este como 'km mapeados').").font = SUB
ws.cell(row=r + 3, column=1, value='Linhas em laranja: rotas ainda não concluídas.').font = SUB
ws.freeze_panes = 'B5'; ws.auto_filter.ref = f'A4:L{r - 1}'

for w in wb.worksheets:
    w.sheet_view.showGridLines = False
    w.page_setup.orientation = 'landscape'; w.sheet_properties.pageSetUpPr.fitToPage = True
    w.page_setup.fitToWidth = 1; w.page_setup.fitToHeight = 0
wb.save(SAIDA)

print('pontos ano', len(pts), '| set', len(grupos[9]), '| out', len(grupos[10]))
for k in chaves:
    g = grupos[k]
    print(k, 'rotas', len({x['rota'] for x in g}), 'arv', len(g), 'fotos', sum(x['nf'] for x in g),
          'dias', len({x['dt'].date() for x in g}), 'km', round(sum(x['km_rede'] for x in g), 1),
          'kmperc', round(sum(x['km_perc'] for x in g), 1), 'concl', conc_no(k))
print('salvo', SAIDA)
