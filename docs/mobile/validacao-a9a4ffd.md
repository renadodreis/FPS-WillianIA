# Validação do porte para CELULAR — commit `a9a4ffd`

Sétima rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63). Autor: o
**validador** — não escreveu código de produto nem teste do repo. Nada foi
commitado. **A régua não mudou.**

Medido aqui o que entrou em `a9a4ffd`: o carro que rola vai DENTRO do `state` do
ex-motorista e volta DENTRO do `playerUpdate` (e os bots leem o mesmo campo); a
vítima aceita o dano se o tronco OU a cabeça estão alcançáveis, o empurrão da
malha (pedra/cacto) cobre o tronco, e debaixo do 1º lance da escada da Torre há
bloqueio só de corpo; quem sai do carro debaixo da rocha do vulcão sobe; o painel
do campo de tiro ganhou corpo CANNON; o servidor conhece o sólido da coluna
(helicóptero pilotado e carro solto).

---

## 0. Condições

- **Árvore:** `dev` em `a9a4ffd` (`git log -1` no início e no fim). `git status`
  antes e depois: só ESTE arquivo (não rastreado). `npm run lint` limpo.
  Mutantes numa **cópia** (`copia-r7`, rsync da árvore), restaurados por
  `sha256` e conferidos contra a árvore principal antes de cada um; duas cópias
  dedicadas: `copia-r7bot` (só `scripts/bots.js` mutado, para as arenas) e
  `copia-r7dbg` (servidor com log em cada ramo de recusa do carro solto —
  diagnóstico, não mutante).
- **Carga:** amostrada a cada 20 s das 04h47 às 07h29 (UTC−3;
  488 amostras): carga de 1 min **mediana 3,2, p90
  4,0, máximo 5,8** em 12 núcleos (até três arenas, a bateria
  e sondas de navegador correram juntas em parte do tempo — está na carga; a
  suíte completa correu SOZINHA no fim). Cada artefato traz a carga do seu
  início. Os `server.js` que aparecem como "alheios" nos artefatos são os das
  minhas próprias sondas (pelo caminho do repo); nenhum processo de teste de
  outra frente apareceu.
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360 (a classe do S22 do dono), V3 844×390;
  `hasTouch`, `isMobile`, DPR 2, `?mobile=1`. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF)
  para tudo o que é do jogador; **dois navegadores de verdade** no mesmo servidor
  para o carro solto; bots pelo processo de verdade (`server.js` +
  `scripts/bots.js` pela flag do anfitrião, mais um processo de 16 bots com fuzil
  e a IA intocada; 4 humanos-dublê a 10 Hz que mandam o `solto` DENTRO do
  `state`, como o `br-game.js` de `a9a4ffd`) em **dez arenas**: sete na árvore
  (duas delas, as da carcaça, interrompidas sem N), duas com o mutante dos bots
  e uma de diagnóstico.
- **Portas:** 3962–3998 (nunca a 3000).
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **O mutante do painel era um no-op**: `for (const w of [] &&
     paredesDasAtracoes(...))` — `[] && X` devolve X. Refeito com `(void X, [])`
     (o buggy cruza o painel). O resultado inválido foi descartado.
  2. **O painel a 58–61 km/h não distingue nada**: sob carga a aceleração em
     tempo de relógio cai, e nessa velocidade o carro para no painel com e sem o
     corpo. Refeito com o buggy saindo a 20,3 m/s (72,9–74,1 km/h, a de r6).
  3. **A contagem de `playerUpdate.solto` da arena vem do 1º dublê, que não
     recebe o PRÓPRIO `playerUpdate`**: os 8 rolados "com 0 `solto` ouvido" eram
     todos dele. O servidor instrumentado rodou a mesma arena: **0 recusas em 18
     rolados** (2 dublês).
  4. **O `vdest` (o avesso (9) de B7) nunca conseguia o carro desde a posse
     arbitrada (`26f682c`)**: pedia o carro de longe. É o "(9) sem N" de r5 e r6.
     Corrigido (vai até o carro antes de pedir); nesta rodada ainda assim não
     saiu N: dois dublês disputavam a mesma frota e o ponto "que a carcaça
     esconderia" não existia da posição nova do bot. Fica sem N (§2).
  5. **A biblioteca das sondas deixava navegador e servidor órfãos** quando o
     boot estourava 90 s sob carga (1 caso — o mutante `SOLTOevento`, refeito);
     corrigida (fecha no erro; 150 s para o 2º navegador). Matei só os processos
     daquele caso, por PID.
  6. **As sondas de P3 e de segurança perdiam a posse do helicóptero no
     caminho** (voavam através de prédio e morro — o heli de verdade não passa, e
     o `chaoMaisAlto` novo recusa): refeitas com voo que nunca desce do chão do
     servidor + 3 m (`r7-p3.js`) e mantendo a posse até a plataforma
     (`r7-seg2.js`). A do carro contra a parede usava passo grande demais — o 1º
     pacote já caía na distância; refeita com 4 m.
  7. **`r7-salto.js`, saídas 8–12**: a sonda acumulou a punição do
     anti-teleporte (`QA.reset` + teleporte do chassi a cada saída — o CLAUDE.md
     avisa) e o servidor parou de aceitar o motorista; descartadas.
  8. **O anfitrião da sonda do vulcão era escolhido só pelo relevo** (a rocha
     tampava o jogador; vida 100 legítima); `r7-vulcao-carro.js` o escolhe pela
     TELA (`Oclusao` e bala livres até cabeça e tronco).
  9. **V1(c)/(e) em `r7-v1.js` foi contaminado** por um esqueleto (12 de dano a
     cada 1,15 s — o `MELEE_DMG` de `js/skeletons.js`) e por uma geometria sem
     controle (a reta seguia tampada com o carro destruído). Refeito em
     `r7-v1e.js`: a geometria só vale se a bala do cliente passa com o carro
     IGNORADO, e o dano é separado por causa (`lastDamageCause`). As duas
     leituras "vida 88" de `r7-vitima.js` são o mesmo esqueleto (os tiros foram
     recusados).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `bateria-r7.sh` (as de sempre) e as novas `r7-carro.js`, `r7-salto.js`,
  `arena7.js`/`arena-r7.js` (rolado, rolado com o tiro que revela, cabeça de
  fora atrás de carro e atrás de crista, carcaça, espiadas), `r7-ancora.js`
  (âncora do cliente + a regra da vítima), `r7-invis.js`, `r7-vitima.js`,
  `r7-pedra-tronco.js`, `r7-pedra-cliente.js`, `r7-escada.js`, `r7-vulcao.js`,
  `r7-vulcao-carro.js`, `r7-painel.js`, `r7-v1.js`, `r7-v1e.js`, `r7-v1d.js`,
  `r7-p3.js`, `r7-p3b.js`, `solo7.js` + `r7-solo.js`, `r7-seg.js` e `r7-seg2.js`
  (privadas), `mut7.py`, `cadeia-mut7*.sh`, `mut7-testes.sh`.

---

## 1. Placar

> **44 aprovados · 6 reprovados · 13 não medidos, em 63** (44/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `afb1ae8` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, **B6**, **B7**, B9) | 8 · 1 · 4 |
| P — PvE (4) | 2 | 2 (P1, **P3**) | 0 | 3 · 1 · 0 |
| V — veículo (1) | **1** | 0 | 0 | 0 · 0 · 1 |
| D — desempenho (5) | 3 | 1 (D6) | 1 (D2) | 3 · 1 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Mudaram de cor: B7 (✗ → ◌), V1 (◌ → ✓), P3 (✓ → ✗) e B6 (✓ → ◌).**
- **B7**: o carro que rola **deixou de ser coberto atravessado** — 0 disparos,
  0 acertos e 0 de dano com o humano tampado em **52 engajamentos válidos** (34
  calados, com 0 viradas, + 18 com o tiro que revela); com o mutante que tira o
  `solto` dos bots, **376 disparos e 231 acertos através do carro em 39 de 39**.
  Não volta a ✓: fica no ◌ de `d381d29` — a redação da "virada" segue com o dono
  e o avesso (9) segue sem N (§2).
- **V1**: pela primeira vez as cinco partes têm número (a bala do bot contra o
  carro inteiro, a queima e a morte de quem está dentro faltavam) — §3.
- **P3**: o sólido da coluna tira o `heli` do piloto LEGÍTIMO pairando a 3 m
  debaixo de peça de acabamento `noCollide` (que o heli do cliente
  atravessa): **4 de 4** pontos debaixo de uma cobertura, no servidor de
  verdade; 54 de 17 161 pontos da grade da cidade (0,3 %). O portão dos bots
  (`playerUpdate.heli`) cai — é o mesmo portão que r6 mediu por socket para
  manter P3 ✓ (§4, [NC] 1).
- **B6**: pela letra — 1 disparo (erro, 0 de dano) 0,1–0,2 s depois de o BOT
  andar para trás de uma crista, com o humano visível até ali; é a janela de
  percepção de 0,6 s do bot. Mesma família da "virada" de B7; proposta de
  redação para o dono (§3).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✗, E10 ✓, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 1** (P3,
`a9a4ffd`). **Defeitos NOVOS nascidos das correções desta leva: 3** (§4, [NC]
1–3). Em `afb1ae8`: 4; em `d381d29`: 3; em `2224bf5`: 2. **Duas correções não
fecharam tudo o que prometiam** — os dois casos de segurança de r6 fecharam no
que foi medido e seguem abertos em vizinhos (detalhe fora do repo).

`test/security-regression.test.js`: **34/34**. Suíte completa: **verde** pelo runner — 2 589 testes, 2 544 passaram, **0 falharam**, 42 cancelados e 3 pulados; 6 arquivos (`enemy-drawcalls`, `xr-andar-analogico`, `xr-criterio-i4-estados`, `xr-heli-piloto`, `xr-mao-controle`, `xr-spect-passo`) cancelaram na corrida e passaram 2× isolados (flake). 67 min, SOZINHA na máquina (carga mediana 3,3, máx. 5,8 — a própria suíte).

---

## A. Os cinco itens do briefing, um por um

1. **Carro solto dentro do `state` / `playerUpdate`.**
   *(a) O ex-motorista segue com `playerUpdate` durante o rolar: SIM.* Esportivo
   a **117,9 km/h** pelo toque, três execuções em servidor novo: o carro rola
   **53,6 m**, e o anfitrião-socket recebe **24–25 `playerUpdate` do
   ex-motorista nos 2,49–2,51 s do rolar, maior buraco 0,19–0,20 s** (r6: 0
   `playerUpdate`, buracos de 2,0–2,65 s). A 27,7 km/h: 9 em 0,95 s; no buggy a
   59,4 km/h: 19 em 1,92 s, maior buraco 0,20 s. O cliente põe o `solto` em 25
   `state`s e o servidor repassa 24 — o 1º se perde porque sai no MESMO tique
   do `leaveCar` (normal) e o `state` é volátil: o mecanismo de `afb1ae8` segue
   lá, mas agora custa 100 ms (observação).
   *(b) O OUTRO navegador vê o carro onde ele parou e entra: SIM.* Parado, o
   segundo navegador desenha o carro a **0,28 m** da física do motorista
   (0,10–0,42 m nas 6 execuções; durante o rolar fica 4,5–5,2 m atrás — a
   latência a 33 m/s), anda pelo polegar até ele e **entra no 1º toque em 3 de 3
   a 117,9 km/h** e em 1 de 1 a 27,7 km/h. (Em 2 execuções o carro parou na
   baixada alagada e o andar da MINHA sonda não chegou a < 3,2 m dele — não é
   medida do produto; descartadas.) Mutantes: o servidor ignorar o `solto` → o
   outro desenha o carro a **54,51 m** (0 de 25 repassados); o cliente voltar
   ao `carSolto` à parte → **0 `playerUpdate` em 2,49 s (buraco 2,59 s), carro a
   54,09 m e "Veículo ocupado!"** — exatamente o NC-1 de r6.
   *(c) B7 do carro rolado: o tipo PASSA, N = 52.* §2a.
   *O teto de 3 m e o carro legítimo:* `r7-salto.js`, 7 saídas a 40–119 km/h em
   pontos sorteados do campo: o carro pulou até **7,7 m** acima do chão do
   cliente e o servidor recusou **2–7 pacotes em 4 das 7 saídas** (o carro fica
   parado para os outros durante o salto); em 7 de 7 o servidor voltou a aceitar
   ao pousar (fim a 0,03–0,36 m da física) — §4, [NC] 2.
2. **Vítima por tronco OU cabeça.**
   *Pedra em pé: FECHOU.* Em Node, replicando o laço do `game.js` por quadros
   (semente 424242): ponto da vítima (pé + 1,0) dentro da malha **0 de 53 760
   posições (em pé e agachado), olho dentro 0**, 1 204 empurrões (até 1,10 m) —
   com o empurrão só do olho (o de `afb1ae8`) a mesma conta dá **577 em pé / 148
   agachado em 23 pedras** (r6 mediu 575/125). Cacto: 0 de 68 096. **No
   cliente, pelo toque**, nas pedras que reprovaram em r6: em pé **3 de 3 com o
   ponto da vítima fora da malha e vida 48** (r6: vida 100 em 2 de 3, atirando);
   agachado, 1 com vida 48 e 2 com vida 100 **com a tela do anfitrião tampando
   tudo** (cobertura legítima; ele também não acerta para fora).
   *Escada da Torre: FECHOU, e continua subível.* Pelo polegar, do meio do
   saguão para os seis pontos debaixo dos lances (os de r6 e dois novos), o
   jogador **para a 1,33–2,12 m** deles, fora de todo degrau (r6: chegava a
   0,08 m com o tronco dentro do degrau, vida 100). Subir pelo polegar do saguão
   ao patamar e pelo lance B até o 1º andar: **chega (y 6,92) pelo meio e pela
   borda do lance, 0 quadros parado** — o bloqueio só de corpo não esbarra em
   quem sobe.
   *O avesso — "a tela tampa e o dano entra":* 18 941 pares (olho 1,5 m → os
   pontos da vítima, tronco 1,0 e cabeça 1,62/1,04; tela = `Oclusao` do
   desenho): **a tela tampa cabeça E tronco e a vítima ACEITA em 85 pares (eram
   32 com a regra antiga) — +53, 0,28 %.** O que tampa na tela nos 53 novos: o
   TERRENO desenhado numa crista que a marcha de 1,6 m da bala não pega (28),
   copa (12), o interior desenhado da Torre (5), o modelo do vulcão (4), a
   carroceria do buggy com a vítima agachada (2), outros (2) — §4, [NC] 3. E o
   outro lado: **"a tela mostra e a vítima recusa" caiu de 636 para 70**.
   No cliente, pelo toque, atrás de muros de ruína de 1,31–1,42 m e do esportivo
   parado: em pé com a cabeça de fora (bala do cliente: tronco tampado, cabeça
   livre; **a tela do anfitrião mostra a cabeça e não o tronco**) → **vida 48 em
   6 de 6**; agachado (tudo tampado na tela) → **100 em 8 de 8**. Com a regra
   antiga (mutante `VITIMA1`) → **100 em 7 de 7 com a cabeça na tela**. Atrás de
   muros de 1,70–1,82 m, em pé: a tela mostra o topo da cabeça (a esfera de
   acerto vai a 1,94 m) e a vítima recusa (o ponto 1,62 fica atrás do muro) —
   **5 casos, vida 100** (resíduo da regra de dois pontos, observação; em 1
   deles a tela mostra também o centro da cabeça: caixa de bala da ruína maior
   que o desenho).
   *O bot contra quem está só com a cabeça de fora* (o bot vê cabeça OU tronco,
   sem saber qual, e o dano é o do tronco): atrás de carro, **13 engajamentos,
   5 disparos em 3, 0 acertos** — todos com a cabeça livre e o tronco tampado
   para o cliente, e a regra nova da vítima ACEITARIA cada um (a antiga
   recusaria). Atrás de crista (107 engajamentos, o bot se mexendo): **0
   disparos em "só a cabeça"** — os 125 disparos e 88 acertos foram com cabeça
   e tronco à vista; 1 disparo com tudo tampado (B6, §3). Ou seja: o bot atira
   em quem só mostra a cabeça (régua B7/V1 permitem — "cabeça E tronco
   tampados"), e agora o dano dele ENTRA; com N = 13 não sai taxa de acerto
   contra "só a cabeça" — observação, sem número de acerto.
3. **Vulcão: quem sai do carro debaixo da rocha sobe: FECHOU.** Buggy posto
   (dirigindo) no relevo **1,6–2,6 m abaixo da rocha desenhada**, saída pelo
   USAR: **pé a 0,00 m do desenho em 3 de 3** (olho 1,5 m acima), igual 1 s
   depois (r6: pé 5,0 m enterrado). Com um anfitrião que a tela vê: **vida 48
   em 2 de 2**, e o bot o vê (cabeça e tronco). Mutante sem o "sobe" → **pé
   11,69 m abaixo do desenho**. As 8 radiais a pé: 0 quadros com pé ou olho
   enterrado fora da calota; 5 de 8 seguem parando na beira da saia (a muralha,
   observação de r6). O carro em si continua no relevo, DENTRO da rocha,
   enquanto alguém dirige (o resíduo declarado em `afb1ae8`: quem dirige ali é
   invisível e imune, mas não atira). Só um trecho da saia (perto de
   (404; −437)) segura o carro debaixo da rocha: os 3 casos são ali.
4. **O painel com corpo CANNON: FECHOU.** Buggy a **72,9 e 73,1 km/h** contra o
   painel pelos dois lados: **para com o nariz no painel (centro do chassi a
   1,3–1,4 m da face), 0 de 2 cruzam** (r6: cruzava nos dois sentidos a
   72,8/73,6). Mutante sem o corpo → **cruza a
   74,05 km/h** (vai a z −175,9 atravessando x −58,8). Corpo do jogador: para a
   0,42 m em 4 de 4; paridade das atrações 0 m (página × página × bot); pares
   atrás do painel: 0 de 397 tampados vistos pelo bot.
5. **Segurança (detalhe fora do repo).** *Piloto a pé (r6, caso 1): fechou no
   que foi medido* — telhado e andares da Torre, telhado de prédio e rocha do
   vulcão dão `heli = false` no servidor de verdade (mutante: `true` de novo).
   *Carro solto (r6, caso 2): subir pelo ar e atravessar parede fecharam* — 0 de
   20 pacotes subindo (era o carro a 94 m; mutante: 20 de 20) e o carro para na
   parede do prédio. **Seguem abertos quatro vizinhos do mesmo vetor** (um do
   helicóptero, três do carro solto), medidos no servidor real. Detalhe **fora
   do repo**.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente
(terreno + `Structures.rayHit` com veículos e rocha do vulcão + obstáculos),
com rocha e painel conferidos como carregados (`solido`, `modelo`, `painel` =
verdadeiros), e o carro posto na pose em que PAROU — não a `clearSight` do bot.
À parte, a TELA (`Oclusao`).

### 2a. Caminho real

O dublê dirige um carro até perto do bot (posse arbitrada), sai (`leaveCar`) e
manda o `solto` DENTRO do `state` ao longo de até 22 m, de lado para o bot —
como o `br-game.js` de `a9a4ffd` faz; o servidor confere e repassa DENTRO do
`playerUpdate`. Depois o humano sobe atrás do carro **onde ele parou**: calado,
ou dando um tiro para o alto 0,3 s depois de subir (o tiro que REVELA: os bots
a ≤ 70 m ficam alertados, sem cone — só a visada decide).

| tipo (7) — veículo inteiro que ROLOU | engajamentos | **válidos** | disparos / acertos / dano com ele tampado | viradas tampado |
|---|--:|--:|--:|--:|
| calado — árvore | 35 | **34** | **0 / 0 / 0** | **0** |
| com o tiro que revela — árvore | 20 | **18** | **0 / 0 / 0** | (som: não conta) |
| calado — mutante `BOTsolto` (os bots não leem o `solto`) | 53 | 52 | 0 / 0 / 0 | 67 quadros em 2 eng. |
| com o tiro que revela — mutante `BOTsolto` | 41 | 39 | **376 / 231 / 3 498, em 39 de 39** | (som) |
| painel, vulcão (r6) e (1)–(6), (7) parado (r5) | — | — | não remedidos (0 em 48 e em 276 válidos) | — |

Na árvore, os 102 disparos que houve nos rolados (8 calados, 94 com o tiro que
revela — o bot vem investigar e contorna o carro) foram todos com cabeça e
tronco à vista do cliente. No mutante com o tiro que revela, o bot começa a
atirar 0,8–2,5 s depois de o humano subir, em 39 de 39 — pela pose da SAÍDA, a
até 22 m de onde o carro está. A arena calada é pouco sensível a este defeito
(mutante: 0 disparos em 52; r6: 2 de 37 com disparo) — por isso o modo com o
tiro que revela.

**O avesso (9), veículo destruído, segue sem N** (correção 4 do §0: o `vdest`
da minha arena nunca conseguia o carro desde `26f682c`; corrigido, ainda não
saiu ponto válido nesta rodada). A queima em si foi medida pelo lado do jogador
e da vítima (V1, §3).

### 2b. Pares geométricos (18 941 pares, semente 424242)

Iguais aos de r6 em todo tipo (a bala de `a9a4ffd` só ganhou as 11 caixas
`noBullet` do vão da escada, que não param bala): **0 de 10 285 tampados vistos
pelo bot**, fora o mesmo par de caminhão de r6 (determinístico; lá, refeito numa
página nova com a mesma pose, não reproduziu). Bot cego onde o cliente vê: 27 de
8 656 (0,3 %; aleatório 0,5 %, árvore 1 de 27, vulcão 2 de 1 376). Guarda-corpo
`noBullet` no caminho: 40, o bot vê 40.

### 2c. A tela e a regra nova da vítima

Item A.2: com a regra de dois pontos, "a tela tampa cabeça e tronco e a vítima
aceita" sobe de 32 para 85 pares, e "a tela mostra e a vítima recusa" cai de
636 para 70.

### 2d. Veredito de B7

**◌ — o tipo que reprovou em r6 passa: 0 disparos/acertos/dano com o humano
tampado em 52 válidos (N ≥ 10; 0 viradas nos 34 calados), e o mutante mostra que a arena pega o
defeito (376 disparos em 39 de 39).** Não fecha pela letra pelos dois motivos de
`d381d29`: a "virada" como está escrita conta rumo de caminhada nos tipos
(1)–(6) (proposta de redação com o dono) e o avesso (9) segue sem N no caminho
real.

---

## 3. Veredito por critério (com a comparação com `afb1ae8`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 px / 0,00 cm a 10, 25 e 50 m em 96 casos × 128 tiros** (armas de fogo). Bazuca: origem a **0,00 cm da boca**; afastamento 25,89/26,46 cm (quadril), 13,07–13,09 cm (mira); paralelismo 0,000°. |
| **M2** | ✓ | ✓ | Fuzil 711,5 m/s medidos → 8,5 cm a 100 m; DMR 790 → 5,3 cm; sniper 840 → 5,2 cm. |
| **M3** | ✓ | ✓ | 0,18333 °/px; 200/100 = 1,99999; 30/60/120 Hz: 22,0005/22,0006/22,0006°; 1 × 100 eventos idêntico; soltar 5,9e-22 rad. |
| **M4** | ✓ | ✓ | R(ADS)/R(quadril) = 1,0000–1,0003 em 8 miras. |
| **M5** | ✓ | ✓ | Razão 0,6002; diagonal ≤ 0,011°. |
| **M6** | ✓ | ✓ | Nave/queda/paraquedas/espectador: opacidade 0; voando: 3 tiros a 0 cm. |
| **M7** | ✓ | ✓ | Toque real (`SO_M7`, carga 3,0): 0 % → 55,004° lento e rápido; 100 % → ganho **1,000** lento, **2,000** rápido. (c) `r3-m7c`: diferença **0,000/−0,01/0,000** entre 61 e 29 quadros/s. Slider 30–250 %. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse e caneta: 0 quadros com o núcleo agindo; controle de toque 4,71°. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 do automático**; controle positivo 78. |
| **A3** | ✓ | ✓ | Efeito até 2,8° da borda. |
| **A4** | ✓ | ✓ | ρ ≤ 0,300; cruzamentos com = sem. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (20 m: 3,90° × 4,34°); (d) segue em conflito com A2. |
| **A6** | ✓ | ✓ | Faca e bazuca 0; DMR 1,70° × fuzil 4,71°. |
| **A7** | ✓ | ✓ | Tiro com a assistência agindo: 0 px; `security-regression` **34/34**. |
| **A8** | ✓ | ✓ | Padrão desligado; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | (e) três dedos em 0,5 s: **1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | ≥ 44 px em menu, ajustes, lobby e jogo (V1, V3). |
| **C3** | ◌ | ◌ | Igual: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque. |
| **C5** | ✓ | ✓ | Grade real 280 pontos: os mesmos 3 "tiros" de troca de arma; giro 0. |
| **C6** | ✓ | ✓ | ≤ 0,201° em 16 direções. |
| **C7**–**C9** | ✓ | ✓ | Não remedidos fora do percurso (código intocado). |
| **C10** | ✓ | ✓ | Toque real: carro anda **5,18 m no 1º s**, pente 28 → 28; helicóptero com o ⇧ translada 6,45 m; sair: 0 m, nada preso. |
| **C11** | ✗ | ✗ | (a) 4,942/5,192 = **95,2 %** (r6: 93,7 % — o `W` medido variou 5,19–5,27 entre rodadas); (c) a corrida liga entre **0,81 e 0,85** (> 0,80). |
| **C12** | ✓ | ✓ | Vermelha no 1º quadro a 20/40/50 m, no Visitante, lobo, esqueleto e zumbi; branca a 70 m e nos neutros; apaga em 6 quadros. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1** | ✓ | ✓ | Espiadas (61): 1º disparo na 1ª re-exposição mín. **1,408 s**; na 1ª exposição mín. **2,32 s**. |
| **B2** | ✓ | ✓ | **0 de 61** primeiras re-exposições com dano e 0 de 61 primeiras exposições (fuzil 42 a 23,55 m, escopeta 11 a 14,55 m, DMR 6, bazuca 1, sniper 1). |
| **B3** | ◌ | ◌ | Fuzil PARADO a 24 m: mediana **9,63 s** (14 de 15 chegaram a 100). (a) a 30 m, (b), (c): não medidos. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | **◌** | ✓ | Pares (r6): 0 de 12 164. **Pela letra, 1 disparo** com olho→cabeça e olho→tronco bloqueados pelo relevo: um erro (0 de dano) **0,1–0,2 s depois de o BOT andar para trás de uma crista**, com o humano visível e engajado até ali (arena "cabeça atrás de crista", 107 engajamentos; o modelo do próprio bot também não o via naquele instante) — é a janela de 0,6 s de percepção do bot (`a.hist`). E 38 quadros de "virada" com ele tampado (bot andando). Proposta de redação para o dono (a mesma família de B7): *"não contam os disparos dentro da janela de reação depois de o bot PERDER a linha; 0 depois dela"*. |
| **B7** | **◌** | ✗ | §2: carro que rolou — **0 / 0 / 0 / 0 em 52 válidos** (mutante: 376 disparos, 231 acertos em 39 de 39). Pares 0 de 10 285 (o par de caminhão de r6). Virada pela letra e avesso (9) sem N (§2d). |
| **B8** | ✓ | ✓ | Não remedido (cone e notar intocados). |
| **B9** | ◌ | ◌ | Não medido. |
| **B10** | ✓ | ✓ | Não remedido. |
| **B11** | ✓ | ✓ | Não remedido (`buildMissShot` intocado). |
| **B12** | ✓ | ✓ | `three` em `dependencies`; nada mudou no carregamento do bot. |
| **B14** | ✓ | ✓ | Fuzil a 23,55 m, **42 espiadores**, bot travado: (a) **0 de 42** primeiras re-exposições com dano antes do limite; (b) TTK finito em **38 de 42**, mediana **22,11 s = 2,30 × o parado** (9,63 s) ✓; (c) dano entre a 3ª e a 6ª exposição em **39 de 42 (93 %)** ✓; imunes: 4. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes, 45 s cada: **1 087 golpes, 0 através** (controle em céu aberto 313). Torre Nexus, 10 pontos da escada: **487 acertos, 0 através**. |
| **P3** | **✗** | ✓ | PvE: voando a 13,1 m **0 golpes**, pousado 0; a pé 728. **Bots: o portão (`playerUpdate.heli`) cai para o piloto LEGÍTIMO** pairando a 3 m do chão do cliente debaixo da cobertura `noCollide` do lote#5 (laje de acabamento a 7,98–8,26 m que o heli atravessa): **`heli = false` em 4 de 4 pontos** no servidor de verdade; por cima da cobertura (a 11,3 m) `true`, e `true` de novo ao sair (4 de 4). Na grade de 2 m da cidade, 54 de 17 161 pontos a 3 m (0,3 %; 45 sobre acabamento de lote, 6 sobre poste, 3 na Torre) e 152 a 0,55 m. No resto, `true`: heliponto a 0,55 m, voando a 12 m, pousado a 0,55, rasante de 150 m, vulcão, 4 telhados a 0,55, rasante a 3 m pela cidade (0 de 88 com `false`). A arena de P3 não foi refeita — o veredito sai do portão, como em r6 (§4, [NC] 1). |
| **P4** | ✓ | ✓ | (a) 0 travessias em 53 corridas contra 19 paredes; (b) os mesmos 11 de 101 vãos. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | **✓** | ◌ | **(a)** atrás do caminhão: fuzil, DMR e bazuca dão 0 px no alvo e 0 `shotHit` nele (vão para `vehicleHit`/`vehicleBlast`); hitscan (solo): soldado 0 de dano, caminhão 1 760 → 1 396; controles acertam (130, morre). **(b)** a bala do BOT contra humano atrás de carro inteiro (rolado): **0 acertos em 52 válidos** (§2a). **(c)** vítima atrás do caminhão e agachada atrás do esportivo: vida **100**; controle 48; em pé com a cabeça por cima do esportivo: 48 (a régua cobra cabeça E tronco). **(d)** 100 `vehicleHit` de DMR em 1,03 s → 9 aceitos, **648** tirados (≤ 520/s por janela); origem a 10 m: 0; arma falsa: 0; dano 9 999 → 26; a 420 m: 0; ocupante no próprio: 0; `security-regression` 34/34. **(e)** a reta da vítima fica LIVRE **≤ 148 ms** depois do `vehicleBurning` (amostra de 200 ms; `r4-v1`: no mesmo quadro), e o 1º tiro depois da queima entra (26); queima → explosão **5,01–5,09 s** (5 medidas); quem está DENTRO morre na explosão, com o crédito para quem destruiu (`VEÍCULO`). |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **233 draw calls p50** (225–258, mundo de 22,6 s). Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: 0 `Object3D`. |
| **D4** | ✓ | ✓ | Retrato do mundo idêntico desktop × `?mobile=1`. |
| **D5** | ✓ | ✓ | Cinco arenas na árvore, 256 881 intervalos: p50 100 ms, **p99 102–103 ms**, **99,88–99,99 % ≤ 150 ms** (máx. 453 ms; carga 2,2–4,0). Poda da visada: **0 diferenças em 36 000 retas** (de pé, destruída, restaurada); `rayBlockedAt` cidade 8,9 µs, campo 7,6–7,9 µs (r6 8,5/7,1). |
| **D6** | ✗ | ✗ | 4G emulado: **16,97 MB** (16 966 422 B; r6 16 961 818; limite 15,03); JS 2,77 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave (olhar e pular em 0 quadros), queda em 8 direções (erro 0), pouso. |
| **E4**, **E5** | ◌ | ◌ | Igual: chegar ao carro/helicóptero só pelo toque, a partir da nave, não completado. |
| **E6**–**E8** | ✓ | ✓ | Solo: JOGAR DE NOVO / VOLTAR AO MENU; espectador "botão ⇧ troca" → lobby; fim → lobby em 9,4 s → nova partida, nada preso. |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). |
| **E10** | ✓ | ✓ | Retrato na pausa, nada preso. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; 0 `pageerror` no que foi percorrido. |
| **E15** | ✓ | ✓ | V2 e V1: pouso a 0,1–0,2 m do baú; 1º toque abre e o item entra; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque, anda 23 m, sai no 1º toque, nada preso. |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta rodada (`a9a4ffd`).

1. **[NC — `a9a4ffd`, reprova P3] O sólido da coluna tira o `heli` do piloto
   LEGÍTIMO.** O `chaoMaisAlto` conta toda caixa da coluna, inclusive as de
   acabamento `noCollide` que o helicóptero do cliente atravessa (o
   `Structures.collide` ignora `noCollide` e o `groundAt` do heli não as tem).
   Reprodução: tomar o heli no heliponto, voar até a cobertura `noCollide` do
   lote#5 (x −384,4..−371,7, z 168,0..180,1, a 7,98–8,26 m) — por cima dela
   `heli = true` — e descer pairando por baixo dela a 3 m do chão do cliente
   (x −384/−382, z 168/180) → **`playerUpdate.heli = false` em 4 de 4**; o
   servidor solta a posse e os bots passam a mirar nele (P3). Na grade da
   cidade: 54 de 17 161 pontos a 3 m, 152 a 0,55 m (sobre caixa d'água, casa de
   máquinas, poste, cobertura). Antes de `a9a4ffd`, `true` em todos.
2. **[NC — `a9a4ffd`, baixa] O teto de 3 m do carro solto recusa o carro
   legítimo que pula.** 7 saídas a 40–119 km/h: o chassi passou de 2,6 m acima
   do chão do cliente em 5 delas (até **7,7 m**), e o servidor recusou 2–7
   pacotes em 4 delas (o carro some parado no ar para os outros e para os bots
   enquanto pula); em 7 de 7 voltou ao pousar (fim a ≤ 0,36 m). Um salto de
   mais de ~24 m na horizontal (o teto por pacote com `dt` limitado a 0,5 s)
   deixaria a pose do servidor para trás até a janela acabar — não medido.
3. **[NC — `a9a4ffd`, baixa] Dano que entra sem nada na tela do atirador** (o
   avesso pedido): com a cabeça como 2º ponto, +53 de 18 941 pares (0,28 %) em
   que a tela tampa cabeça e tronco e a vítima aceita — crista desenhada que a
   marcha de 1,6 m da bala não pega (28), copa (12), interior da Torre (5),
   vulcão (4), carroceria do buggy com a vítima agachada (2). Todos da família
   "a tela tampa e a bala passa" que já existia; o que é novo é a vítima não
   recusar mais ali. Em troca, "a tela mostra e a vítima recusa" caiu de 636
   para 70 — o saldo é a favor da regra nova.
4. **Segurança — os dois casos de r6 fecharam no medido e seguem abertos em
   vizinhos do mesmo vetor** (quatro: um do helicóptero, três do carro solto).
   Exige cliente modificado. Detalhe **fora do repo**.
5. **B6 pela letra** (anterior, achado por cenário novo): o bot dispara (erro,
   0 de dano) até 0,6 s depois de PERDER a linha andando — a janela de
   percepção. 1 em 107 engajamentos. Proposta de redação em §3.
6. **O 1º `state` depois do `leaveCar` se perde** (o `leaveCar` normal e o
   `state` volátil no mesmo tique — o mesmo mecanismo de `afb1ae8`, agora 100
   ms por saída; 6 de 6). Observação.
7. **Atrás de muro de 1,62–1,94 m, a tela mostra o topo da cabeça e a vítima
   recusa** (5 casos em pé, ruínas). Resíduo da regra de dois pontos —
   anterior e menor que antes. Observação.
8. Inalterados: **P1**, **C11**, **C1(e)**, **D6**, **E9**.

**Observações sem veredito:**
(a) **A beira da saia do vulcão segue muralha** em 5 de 8 radiais, e pela rocha
se sobe rampa de até ~60° (a checagem de degrau é por quadro).
(b) **A pilha de caixas dos fogos e o canhão vermelho** seguem desenhados
sólidos sem colisor de bala (anterior; os mesmos pares).
(c) **O carro segue no relevo dentro da rocha do vulcão** enquanto alguém
dirige (invisível e imune, não atira); só sair foi consertado.
(d) **Custo:** `rayBlockedAt` do cliente 8,9 µs (cidade) e 7,6–7,9 µs (campo)
contra 8,5/7,1 em r6, com a carga desta rodada maior; poda por blocos 0
diferenças.

**Contagem:** 6 critérios reprovados; **1 nasceu de correção desta rodada**
(P3); **3 defeitos novos nasceram de correções** (itens 1–3; nenhum de
segurança); **2 correções não fecharam tudo** (item 4).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| cliente volta ao `carSolto` à parte (`SOLTOevento`) | `r7-carro`: **0 `playerUpdate`** em 2,49 s, carro a **54,09 m**, "Veículo ocupado!" | `carro-solto` + `veiculo-vida-bots`: 1 vermelho em 11 |
| servidor ignora o `solto` (`SOLTOsrv`) | `r7-carro`: 0 de 25 repassados, carro a **54,51 m** | idem: 2 vermelhos em 11 |
| bots não leem o `solto` (`BOTsolto`) | arena com o tiro que revela: **376 disparos, 231 acertos em 39 de 39** (árvore 0 em 18); calada: 0 disparos, 67 quadros virados | `veiculo-vida-bots`: 1 vermelho em 8 |
| vítima volta a um ponto (`VITIMA1`) | `r7-vitima`: **vida 100 em 7 de 7** com a cabeça na tela (árvore 48 em 6 de 6) | `vitima-cobertura`: 1 vermelho em 3 |
| empurrão só do olho (`PEDRAolho`) | `r7-pedra-cliente`: ponto da vítima **dentro da malha em 5 de 6** (a vida segue 48 pela cabeça) | `cabeca-no-solido` + `vitima-cobertura`: 1 vermelho em 7 |
| os dois juntos (`PEDRAolho+VITIMA1`, o estado de `afb1ae8`) | **vida 100 em 2 de 3 em pé, com a cabeça na tela, e ele acerta o anfitrião** (o defeito de r6) | — |
| sem o bloqueio debaixo do lance (`VAO`) | `r7-escada`: chega a **0,08–0,15 m** de 5 dos 6 pontos (árvore: para a 1,33–2,12 m), tronco dentro do degrau (1) e olho dentro do degrau (1) | `vitima-cobertura` + `paredes-puro`: 2 vermelhos em 13 |
| sem o "sobe" do vulcão (`VULCsobe`) | `r7-vulcao-carro`: pé **11,69 m** abaixo do desenho | `vulcao-corpo`: 1 vermelho em 4 |
| painel sem corpo CANNON (`PAINELcannon`, corrigido) | buggy a 74,05 km/h **cruza** (árvore: 0 de 2 a 72,9/73,1) | `painel-galeria`: 1 vermelho em 5 |
| `heliNoAr` volta ao relevo (`SOLOheli`) | `r7-seg`: a pé no telhado `heli = true` (2 de 2) | `veiculo-vida-servidor` + `security-regression`: 1 vermelho em 43 |
| carro solto sem chão/parede (`SOLOcarro`) | `r7-seg`: **20 de 20** subindo (carro a 94 e 184 m) | idem: 1 vermelho em 43 |

**Todo mutante desta rodada avermelha algum teste do construtor e alguma sonda
minha.** O que os testes não medem, e que esta rodada achou:

- **O piloto LEGÍTIMO debaixo de acabamento** ([NC] 1): `veiculo-vida-servidor`
  testa o piloto a pé num telhado e no relevo; ninguém testa o heli pairando
  onde o servidor vê uma peça que o cliente atravessa. É o formato 8 do CLAUDE.md
  ao contrário: o "dublê" do servidor (o sólido da coluna) é mais sólido que o
  mundo que o cliente pisa.
- **O carro que pula** ([NC] 2): os testes do carro solto rolam no plano.
- **O avesso na tela** ([NC] 3): `vitima-cobertura` mede a mureta e a escada
  pela bala; nenhum teste olha a tela do atirador.
- **As minhas sondas erraram, e está no §0**: o mutante do painel que não mutava
  nada, a velocidade do painel que não distinguia, a contagem do `solto` pelo
  dublê que não se ouve, o `vdest` sem posse desde `26f682c`, a perda de posse
  do helicóptero nas sondas de P3/segurança, a punição do anti-teleporte no
  `r7-salto`, o anfitrião do vulcão pelo relevo e o esqueleto no V1.

---

## 6. Prioridade

1. **[NC] 1 — P3: o piloto legítimo perde o `heli` debaixo de acabamento**
   (reprova P3; nasceu desta leva). O sólido da coluna para o heli precisa ser
   o que o heli do CLIENTE não atravessa.
2. **§4 item 4 — segurança** (fora do repo): os vizinhos dos dois casos de r6.
3. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real (a sonda está
   corrigida).
4. **[NC] 2 — o teto de 3 m contra o carro que pula.**
5. **[NC] 3** — o avesso da tela (0,28 % dos pares).
6. **P1**, **C11** (decisão do dono), **C1(e)**, **D6**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
