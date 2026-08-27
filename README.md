# vera-vegetacao
VERA - Vegetação em Rede Ativa - Energisa Tocantins

---

## Identificação de T1 e T2

Metodologia para processar os KML originais do Daimon/GIS e definir as zonas
T1 e T2 de um alimentador, que é o que alimenta o traçado que o técnico vê no
mapa. Guardado aqui para não se perder entre uma rota e outra — as seções
abaixo abrem clicando.

<details>
<summary><b>Prompt mestre — Identificar T1 e T2 em KML</b> (texto original, não editar)</summary>

```text
Preciso processar arquivos KML de uma rede de distribuição elétrica (exportação 
do sistema Daimon/GIS de uma concessionária) para um plano de manutenção/poda de 
árvores. Siga exatamente a metodologia abaixo.

## CONTEXTO DOS DADOS

Cada subestação (SE) tem uma pasta com:
- Um arquivo "mestre" (ex: SE-XXXX.kml) que é só um índice, usando <NetworkLink> 
  para apontar para arquivos de cada alimentador/circuito. Ele também tem uma 
  pasta "SE_XXXX" com o Placemark do ponto da subestação.
- Um arquivo por alimentador (ex: SE-XXXX_Circ-ALxxxxxxxxx.kml ou 
  SE-XXXX_Circ-LDxxxxxxxxx.kml), cada um >1MB, contendo várias pastas: 
  Capacitor, CapacitorSerie, Chave, EP, ET, Gerador, Reator, Regulador, 
  Transformador, Trecho, RedeBT. SÓ as pastas "Chave" e "Trecho" interessam.
- Às vezes um arquivo .kmz com um polígono do perímetro urbano (Placemark com 
  <Polygon><outerBoundaryIs><LinearRing><coordinates>).

Dentro de "Chave": Placemarks de Point, um por chave/equipamento de manobra. 
O nome é um código numérico de 10 dígitos (ex: 8800937001) — os 2 primeiros 
dígitos indicam o TIPO de equipamento. Existe sempre uma chave especial chamada 
"DJ_<CIRCUITO>_FICT" representando a saída do disjuntor na SE (ponto fictício, 
não fica exatamente sobre a linha).

Dentro de "Trecho": Placemarks de LineString com 2 pontos cada, representando 
um vão de rede MT. Para CADA chave existe um trecho irmão chamado exatamente 
"Suporte Chave <NOME_DA_CHAVE>" — é o conector/linha de chumbada que liga a 
chave à rede (às vezes é um trecho real com vários metros, às vezes é só um 
conector residual de poucos metros).

## REGRAS DE PREFIXO (código da chave)

- Prefixo 79 → religador/equipamento especial → cor VERDE
- Prefixo 88 → cor AZUL
- Prefixo 03 ou 33 → chave de manobra (fusível/seccionamento) → cor AMARELA
- Demais prefixos → cor BRANCA
- Prefixos 90, 31, 68 → equipamentos a serem DELETADOS (ver abaixo)
- Prefixos 02, 03, 33 → marcam o limite de "trecho a jusante a ser apagado"

## PIPELINE, POR ARQUIVO DE CIRCUITO

Para cada arquivo SE-XXXX_Circ-XXXXXXXXXXX.kml, gerar um arquivo de saída 
SE-XXXX_Circ-XXXXXXXXXXX_chave_trecho.kml fazendo, NESTA ORDEM:

1. **Extrair só Chave e Trecho.** Ler todos os Placemarks dessas duas pastas 
   (nome, coordenadas). Cada Trecho real (LineString) tem 2 pontos; cada Chave 
   (Point) tem 1 ponto.

2. **Colorir as chaves** pelo prefixo do nome (regra acima), trocando o 
   styleUrl de cada Placemark de Chave para um de 4 estilos novos (criar 
   Style/StyleMap próprios: mapDaimonCorVerde, mapDaimonCorAzul, 
   mapDaimonCorAmarelo, mapDaimonCorBranco — ícone paddle circle, cores hex 
   ff00ff00 / ffff0000 / ff00ffff / ffffffff respectivamente).

3. **Determinar a raiz da rede (SE):** achar a chave "DJ_<CIRCUITO>_FICT", 
   achar o trecho "Suporte Chave DJ_<CIRCUITO>_FICT", e usar como raiz a 
   PONTA desse trecho que fica MAIS LONGE da coordenada da própria chave DJ 
   (a outra ponta é só o ponto fictício de rótulo, não faz parte da malha real).

4. **Construir o grafo** (nós = coordenadas arredondadas a 6 casas decimais, 
   arestas = cada Trecho ligando suas 2 coordenadas) e rodar Dijkstra a partir 
   da raiz. IMPORTANTE: dar peso altíssimo (ex: 10000) às arestas 
   "Suporte Chave X" cujo X comece com 02, 68, 90 ou 31 — isso evita que o 
   caminho mais curto passe por um desvio/bypass de uma chave NA (normalmente 
   aberta) que fica em paralelo com um religador, o que distorceria a ordem 
   real da rede (descobri esse problema na prática: um religador e uma chave 
   NA ficam lado a lado formando um pequeno laço geométrico que não é o 
   caminho elétrico real).

5. **Classificar trechos "a jusante" de chave 02/03/33:** Para cada chave com 
   prefixo 02, 03 ou 33, marcar a aresta "Suporte Chave <nome>" como gatilho. 
   Percorrer a árvore de Dijkstra a partir da raiz em ordem crescente de 
   distância; cada aresta herda a zona do nó pai, EXCETO que ao SAIR de um nó 
   que é alvo de uma aresta-gatilho, a zona vira "AMARELO" dali pra frente 
   (propaga para toda a subárvore). 
   CUIDADO: a propagação deve ser feita por ARESTA específica (a própria 
   "Suporte Chave X"), nunca por "todo nó" — descobri que uma chave pode estar 
   posicionada exatamente sobre um nó de passagem do tronco principal (uma 
   simples derivação lateral that side-taps ali), e se você propagar para 
   todos os vizinhos daquele nó, contamina o tronco inteiro incorretamente. 
   Só a aresta que sai pelo conector da PRÓPRIA chave deve ser pintada.
   Arestas que não entraram na árvore (redundantes/loops) herdam a zona de 
   qualquer um dos seus 2 extremos já resolvidos.

6. **Deletar chaves com prefixo 90, 31, 68** e seus respectivos trechos 
   "Suporte Chave X".

7. **Deletar todos os trechos marcados AMARELO** no passo 5 (a jusante de 
   qualquer chave 02/03/33).

8. **Deletar as próprias chaves com prefixo 02, 03 ou 33** (os pontos, não só 
   os trechos).

9. Salvar o resultado preservando: o Style de cor de trecho original do 
   circuito (geralmente algo como styleDaimonCIRCUITOxxxTRECHO, varia por 
   circuito — NÃO alterar a cor do trecho, manter a original), os 4 Style/
   StyleMap de cor de chave criados no passo 2, dentro de uma estrutura 
   <Folder><name>Circ_XXXXXXXXX</name><Folder><name>Chave</name>...</Folder>
   <Folder><name>Trecho</name>...</Folder></Folder>.

## CORTE MANUAL OPCIONAL (só se o usuário fornecer pontos específicos)

Se o usuário indicar "apagar circuito após o ativo X", localizar o nó dessa 
chave (por nome OU por coordenada — alguns conectores "Suporte Chave X" podem 
não entrar na árvore de Dijkstra por serem redundantes geometricamente; nesse 
caso, dar snap à coordenada da chave no nó mais próximo, tolerância ~0.0006 
graus ~66m) e remover TODA a subárvore a partir desse nó (em todas as 
direções, diferente da regra de derivação do passo 5 — aqui é um corte de 
escopo deliberado, não uma chave de tap lateral).

## FILTRO POR POLÍGONO (perímetro urbano), se houver um .kmz na pasta

1. Extrair o .kmz (é um .zip; no Windows, `Expand-Archive` não aceita a 
   extensão .kmz diretamente — usar 
   `[System.IO.Compression.ZipFile]::ExtractToDirectory`).
2. Ler o polígono (lista de coordenadas lon,lat do primeiro <Polygon>).
3. Point-in-polygon por ray casting padrão.
4. Chave: manter se o ponto está dentro do polígono.
5. Trecho: manter se PELO MENOS UMA das 2 pontas está dentro (evita cortar no 
   meio de um vão que cruza a borda).
6. Se duas SEs ficarem na mesma cidade e só uma pasta tiver o .kmz, 
   PERGUNTAR ao usuário antes de reaproveitar o mesmo polígono para a outra 
   — não presumir isso silenciosamente.

## ATENÇÃO COM REPROCESSAMENTO

Se o usuário (ou o Google Earth Pro) já abriu/salvou os arquivos gerados, eles 
podem ter sido reformatados (indentação, tags <name>/<atom:link> adicionadas). 
Use parsing XML de verdade (ElementTree em Python, ou equivalente) para 
qualquer filtro/edição POSTERIOR ao primeiro processamento — não confie em 
regex linha-a-linha assumindo "1 Placemark por linha", que só vale para os 
arquivos originais não tocados.

## CONSOLIDAÇÃO FINAL

Gerar um único arquivo SE-XXXX_consolidado.kml por subestação, contendo:
- Os 4 Style/StyleMap de cor de chave (uma única vez, deduplicados)
- Um Style de trecho por circuito (todos, ids diferentes, sem conflito)
- Uma pasta "SE_XXXX" com o ponto da subestação (extraído do arquivo mestre)
- Uma pasta por alimentador, cada uma com suas subpastas Chave/Trecho já 
  processadas

## VALIDAÇÃO E RELATÓRIO FINAL

Depois de cada etapa: validar que o XML resultante é bem formado (parse sem 
erro) e que a contagem de Placemarks bate com o esperado (ex: chaves_finais + 
chaves_deletadas = chaves_originais). 

No final, apresentar uma tabela por alimentador com: nº de chaves, nº de 
trechos, e extensão em km (soma da distância haversine entre os 2 pontos de 
cada Trecho restante — coordenadas são lon,lat em graus decimais, raio da 
Terra 6371000m). Somar tudo numa linha de TOTAL.

Se algum alimentador ficar com 0 trechos após o filtro de polígono, avisar 
explicitamente (não foi erro, só significa que ele fica inteiramente fora da 
área urbana).

Sempre fazer uma rodada de validação cruzada antes de aplicar em lote: rodar 
o pipeline completo em UM circuito já conhecido/conferido manualmente antes 
de aplicar nos demais, para garantir que o script bate com o resultado 
esperado.

Apague os scripts/arquivos temporários de trabalho ao final, mantendo só os 
arquivos de entrega.
```

</details>

<details>
<summary><b>Notas das rodadas reais</b> (armadilhas encontradas em campo, depois do prompt)</summary>

Coisas que só apareceram rodando o pipeline de verdade. Não substituem o prompt
acima — são acréscimos para não repetir o mesmo erro.

### O recorte urbano sobrescreve o arquivo de cabos do alimentador

`cabos/<POLO>/<ALIMENTADOR>.json` guarda **um** traçado por alimentador. Quando
uma rota é recortada num perímetro urbano e gravada por cima, a rede que ficou
de fora **desaparece do arquivo** — e com ela a rede de qualquer outro município
que aquele alimentador atendia.

Aconteceu com `LD02022033` e `LD03022033`: recortados para Colméia, levaram junto
Pequizeiro e Goianorte. Foi preciso recuperar as versões pré-recorte do histórico
do git (`git show <commit>^:cabos/NORTE/LD02022033.json`).

**Antes de gravar um recorte, confira se aquele alimentador atende mais de um
município.** Se atender, grave o recorte num código próprio (ver abaixo) em vez
de sobrescrever o original.

### Códigos internos para rotas que dividem alimentador

Cabos e postes são resolvidos só por código de alimentador, sem escopo por rota.
Duas rotas não podem dividir o mesmo alimentador com traçados diferentes — quem
carregar por último vence.

A saída é dar à segunda rota um código próprio com sufixo (`AL02065015BJ`,
`LD02022033PQ`, `LD02022033GN`, `AL01024113CM`) e criar para ele os três
arquivos: `cabos/<polo>/<cod>.json`, `dados/<polo>/<cod>.json` e a entrada em
`dados/indice.json`. Faltando um dos três, a rota quebra no aparelho do técnico.

O código interno não vaza para o relatório: o ponto salvo guarda `poste` (id real
do poste na base da Energisa) e `projeto` (nome da rota), nunca o alimentador.

### A semente do perímetro urbano é a sede, não a célula mais densa

O perímetro é detectado por densidade de postes (grade 0,002° ≈ 220 m, limiar 8
postes por célula, dilatação 1, flood-fill). Semear na **célula mais densa** erra
quando existe um povoado rural grande ou um distrito industrial: em Couto
Magalhães a semente caiu num povoado ribeirinho e o recorte devolveu 50 trechos
que não encostavam na cidade.

Semeie na **célula densa mais próxima da sede oficial do município**. Corrigiu
Couto Magalhães de 50 para 189 trechos. Pequizeiro e Goianorte já estavam certos
e não mudaram.

### Densidade não separa cidades conurbadas

Em Pedro Afonso o flood-fill atravessou o rio Sono e engoliu a sede de Bom Jesus
do Tocantins — 76 trechos, 4,56 km, 22% do traçado. Não foi erro de
geocodificação: Pedro Afonso forma conurbação com Bom Jesus do Tocantins e
Tupirama, as três sedes a ~1,7 km uma da outra.

**Recorte pela malha municipal oficial do IBGE**, não só pela mancha de
densidade. Um trecho entra se mais de 50% do comprimento dele cai dentro do
município, medido por amostragem a cada 20 m ao longo do traçado — classificar
pelo ponto médio erra nos trechos que cruzam a divisa.

Malhas em `https://servicodados.ibge.gov.br/api/v3/malhas/municipios/<cod>?formato=application/vnd.geo+json&qualidade=maxima`,
códigos em `https://servicodados.ibge.gov.br/api/v1/localidades/estados/TO/municipios`.

### O campo `municipio` do índice é o da subestação

`dados/indice.json` guarda o município da **SE**, não o lugar onde a rede corre.
Procurar um município por esse campo dá falso negativo: Brasilândia, Pequizeiro,
Goianorte e Couto Magalhães não apareciam, mas todos tinham rede — dentro de
alimentadores rotulados como Colinas, Colméia e Bernardo Sayão.

Para achar a rede de um município, varra os postes de todos os alimentadores
contra a malha do IBGE, não o campo `municipio`.

### Poste sem cabo desenhado

Em Brasilândia do Tocantins os postes da cidade estão todos na base (2.068 no
município, 584 a menos de 3 km da sede), mas **não existe nenhum trecho de cabo
dentro do perímetro urbano** — nem no arquivo atual nem em versão anterior
nenhuma. Sem rede desenhada não dá para montar rota: sobrariam 1,67 km de linha
rural com a cidade inteira sem cobertura.

Antes de publicar, renderize o traçado sobre imagem de satélite e confira que ele
cobre a malha de ruas. Traçado magro demais para o tamanho da cidade é sinal de
dado faltando, não de cidade pequena.

### Verificações que valem a pena antes de publicar

- O traçado recortado é **uma única componente conexa** (fragmentou = recorte
  errado).
- A ordem das coordenadas nos arquivos de cabos é `[lon, lat]`, igual às rotas
  que já funcionam.
- Postes que aparecem = cruzamento poste↔cabo a 18 m.
- Conferência visual sobre satélite, com o limite municipal desenhado por cima.

</details>
