# Validação do porte para CELULAR — commit `6aeda6c`

Segunda rodada de validação independente contra `docs/mobile/criterio-aaa.md`
(60 critérios, denominador honesto 53). Laudo anterior: `validacao-7515734.md`
(12/53). Autor: o **validador** — não escreveu código de produto nem teste do
repo, não editou a régua. Nada foi commitado.

---

## 0. Condições

- **Árvore:** `dev` em `6aeda6c`, `git status --short` vazio e `git diff` vazio
  antes e depois (a única diferença é ESTE arquivo, não rastreado). Mutantes
  aplicados numa **cópia** da árvore fora do repo e restaurados por `sha256`
  contra a árvore principal depois de cada um.
- **Carga:** 1 min entre **2,0 e 3,5** em 12 núcleos durante toda a rodada (acima
  do "< 1,5" da régua §0; abaixo do teto de 6 do briefing — sem espera). Antes de
  cada medição, `ps` sem `run-tests`/`node --test`/`server.js` alheio.
- **GPU:** Chrome headless, ANGLE sobre NVIDIA GeForce RTX 3050, `tier=baixo`.
  Tempo de frame NÃO medido (D1/D7/D8 são de aparelho).
- **Viewports:** V1 667×375, V2 800×360, V3 844×390, V4 932×430, V5 1180×820,
  VR 390×844; `hasTouch`, `isMobile`, DPR 2, `?mobile=1`. Seed 424242.
- **Portas:** 3980–3998 (validador). Testes EXISTENTES rodados isolados com as
  portas deles e a máquina sem outra suíte: `security-regression`,
  `mira-quadro`, `br-mira-projetil`, `touch-controls(+core)` (os três últimos só
  contra mutantes, na cópia).
- **Bots:** três rodadas no caminho real (`server.js` + `scripts/bots.js` pela
  flag do anfitrião + um 2º processo do mesmo `scripts/bots.js` = 16 bots,
  4 humanos-dublê a 10 Hz), 2026-09-27 22:17–23:07 UTC, 278 engajamentos.
  Cobertura = o relevo (o humano espera 8 m abaixo do chão e sobe na frente do
  bot; t0 = estado de superfície enviado). Engajamentos em que dois humanos da
  sonda ficaram a < 10 m um do outro no mesmo intervalo foram **descartados**
  (o disparo contra um contaminava o do outro — foi a causa dos dois "tiros
  rápidos" que apareceram crus, 0,18 s e 0,65 s).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  as da rodada anterior, mais `m6b.js`, `estados-e7.js`, `estados-e8.js`,
  `e6solo.js`, `c3estados.js`, `a1xr.js` (sessão WebXR emulada pelo IWER sob
  `?mobile=1`), `a8e.js`, `d3heap.js` (amostragem de heap do CDP),
  `lobbycover.js`, e os cenários novos da arena (`repeek`, `espia`, `ttk30`,
  `ttk80`, `cone45`, `tiroVisto`, `tiroCostas`, `isca`).

---

## 1. Placar

> **32 aprovados · 9 reprovados · 12 não medidos, em 53** (32/60).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `7515734` |
|---|--:|--:|--:|---|
| M — mira (6) | 5 | **1** (M6) | 0 | 4 · 2 · 0 |
| A — assistência (8) | 5 | **2** (A2, A8) | 1 (A5) | 2 · 5 · 1 |
| C — controles/HUD (10) | 7 | **2** (C1, C10) | 1 (C3) | 2 · 7 · 1 |
| B — bots (12) | 6 | **2** (B7, B10) | 4 (B3, B4, B5, B9) | 1 · 6 · 5 |
| D — desempenho (5) | 3 | **1** (D6) | 1 (D2) | 2 · 1 · 2 |
| E — estados (12) | 6 | **1** (E9) | 5 (E4, E5, E10, E11, E12) | 1 · 2 · 9 |

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando aparelho / humano.

**Regressões obrigatórias (§8):** M1 ✓ (era ✗), M2 ✓, C4 ✓ (era ✗), D2 ◌ (a
parte medida passa), D6 ✗, E10 ◌, E11 ◌.

**Defeitos que reprovam e nasceram de correção desta rodada: 0.** Um defeito
novo FORA da régua nasceu de correção (a oclusão da assistência, §3 item 5).
Em `7515734` eram 4.

**O furo do loot de morte (be4bd38) fechou** — medido só em servidor local; o
detalhe fica fora do repo.

---

## 2. Veredito por critério (com a comparação com `7515734`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✗ | V3 e V2, 7 armas de fogo × quadril/ADS × {parado, dedo no ATIRAR a 4 e 10 px/quadro, lado no talo, frente no talo, lado + dedo} × {projétil do BR, hitscan}: **0,00 px / 0,00 cm a 10, 25 e 50 m em todos os 144 casos de arma de fogo (96 em V3, 48 em V2)**, inclusive o 2º tiro da rajada (antes 0,73° = 64 cm a 50 m com o dedo; 8,7–9,7 cm andando de lado). **Bazuca paralela:** 25,85 cm constantes no quadril, 13,09 cm na mira, nas três distâncias (= o afastamento da boca à linha de mira; antes convergia 23,7 → 15,0). Âncora: `camera.matrixWorld` do quadro do disparo. **Reinjeção** (`vistaAntesDoTiro = false`): 3,25 px / 64 cm e 9,65 cm de novo; `test/mira-quadro.test.js` fica 6 de 7 vermelho. |
| **M2** | ✓ | ✓ | No voo: fuzil **715,7 m/s → 0,140 s, 7,2 cm**; DMR 795,3 → 0,126 s, 4,6 cm; sniper 850 → 0,118 s, 4,4 cm a 100 m. **Reinjeção** (200 m/s): o `br-mira-projetil` agora **pega** (antes passava por acidente). |
| **M3** | ✓ | ✓ | 0,18333 °/px a 100 %; 200/100 = 2,00001; 30/60/120 Hz iguais a 1e-5; soltar 7e-22 rad. **Reinjeção** (`dt·60`): o `touch-controls` agora **pega** (antes passava). |
| **M4** | ✓ | ✓ | R(ADS)/R(quadril) = 1,0000–1,0003 em 9 miras. |
| **M5** | ✓ | ✓ | razão 0,6002 (menu 60 %); diagonal: erro máx 0,011°. |
| **M6** | ✗ | ✗ | Nave, queda, paraquedas e morto: retícula com **opacidade 0** ✓ (antes 1 na nave); espectador não medido à parte (morto já zera). **Voando: retícula visível, e o 1º tiro 0,5 s depois de entrar no helicóptero passa a 72 / 55 / 26 cm do ponto que a retícula indica a 10 / 25 / 50 m** (raio × eixo da câmera 0,676°) — acima do raio da cabeça (28 cm). Tiros com a câmera de perseguição parada: 15–16 cm. O helicóptero ficou de fora da ordem nova do quadro ("veículo, helicóptero … ficam na ordem antiga", game.js): a câmera de perseguição anda depois do tiro. |

### A — Assistência de mira

Efeito = câmera com a assistência LIGADA menos DESLIGADA pelo menu; atribuído
embrulhando `AimAssist.step`. Alvo = avatar remoto real do anfitrião.

| | agora | antes | medido / âncora |
|---|---|---|---|
| **A1** | ✓ | ◌ | Mouse e caneta no `#tcLook` e mouse no ATIRAR: 0 quadros em que o núcleo agiu; 3 s sem entrada: 0; morto, pausa, nave/queda, cinemática, espectador, menu, carro, helicóptero: núcleo nem chamado; **(c) sessão WebXR (IWER) aberta sob `?mobile=1`, dedo arrastando 60 quadros: 0 chamadas ao núcleo.** Controle positivo: 4,71°. **Reinjeção** (tirar `Touch.lookIsTouch` do portão): mouse e caneta vão a 4,71° → vermelho. |
| **A2** | ✗ | ✗ | Âncora de pixels (dois renders do mesmo quadro). **Atrás do caminhão: 0 de 30** casos com 0 px e a assistência agindo (antes 20/30); **sob copa vista de cima: 0 de 1** (antes 1/1); **varredura aleatória: 1 de 33** (antes 3/32): alvo a 37,5 m atrás de uma crista, com a **esfera de acerto da cabeça** (centro 1,66 m, r 0,28) de linha livre — o raio exato do three não acha nada — e **0 px do modelo** na caixa projetada. A esfera é maior que a cabeça desenhada; o automático não dispararia nesse caso. Mato: não exercitável (nenhum alvo agacha/deita — B10). |
| **A3** | ✓ | ✓ | Efeito até 2,8° da borda no quadril (10 e 30 m), até 2,0° no ADS de 55° (teto 2,03°). |
| **A4** | ✓ | ✓ | ρ ∈ [0,00; 0,300]; cruzamentos com = sem (4 = 4) a 5, 30 e 60 °/s; alvo parado: pull 0. |
| **A5** | ◌ | ✗ | (a) ✓ giro igual rumo ao alvo; (b) ✓ 0,233 s com e sem; **(c) ✓ a 20 m 3,42° com × 4,34° sem (−21 %)**, a 10 m 4,14° × 4,34° (antes piorava +7 %). (d) a histerese, como escrita, conflita com A2: o B que "cruza entre a cruz e A" passa NA FRENTE de A e o tampa — trocar de alvo é o certo. Sem cenário que distinga as duas leituras, não conto. |
| **A6** | ✓ | ✗ | `localStorage` com `getItem` E `setItem` lançando: **boot, ajustes e lobby (nick, cores) sem nenhum `pageerror`**; desligar grava `touchAssist: 0`; faca e bazuca 0; DMR/sniper 1,70° × fuzil 4,71°. **Reinjeção** (`persistSettings` sem `try`): `QuotaExceededError` e o boot não termina → vermelho. |
| **A7** | ✓ | ✗ | (a) tiro com a assistência agindo: **0 px** (giro do quadro 0,22° e 0,15°); (b) mesmos eventos e campos com e sem (5 s no laço real); (c) `security-regression` **12/12**. |
| **A8** | ✗ | ✗ | (a) ✓ padrão desligado; (b) ✓ nenhum disparo em alvo de 0 px (os 30 do caminhão, a copa, o caso da crista); (c) ✓ 0 a 75 m; (d) ✓ faca, bazuca, DMR, sniper: 0; (f) ✓ 3 tiros, 1º a 0,217 s. **(e) ✗ ligado, com a retícula nos discos do CAMPO DE TIRO do mapa (js/maptoys.js), o automático disparou 10 vezes** — o disco entra em `extraTargets` durante o minijogo e a assistência percorre essa lista. Disco não é jogador, bot nem inimigo PvE. (Se o dono quiser o automático no minijogo, é decisão dele — a régua diz 0.) |

### C — Controles e HUD

| | agora | antes | medido / âncora |
|---|---|---|---|
| **C1** | ✗ | ✗ | (a) 0,0020 %, (b) 5/5 e 1/1, (c) 0,49 %, (d) giro líquido −7e-6 rad, (f) 0,0020 % — todos ✓. **(e) três dedos em 0,5 s: andou 1,82 m < 2 m** (igual). O tiro corta a corrida e o ⇧ tira o boneco do chão; o limiar de 2 m não tem fonte. Prioridade baixa. |
| **C2** | ✓ | ✗ | Todo elemento interativo rolado para a vista e medido por `elementFromPoint` (grade de 2 px): menu, ajustes (19) e lobby (29) **≥ 44 px em V1–V5 e retrato**; em partida (vazia, cheia, inventário, barra de armas com tudo destrancado) **44 px em V1–V4 e retrato, 66 px em V5**; nave, queda, helicóptero (V1, V2) ≥ 44; fim de partida: nenhum < 44; botões da morte solo 235×54 e 200×48. Carro e espectador usam o mesmo cluster medido. |
| **C3** | ◌ | ◌ | 0 px² entre controles e HUD essencial e nenhum controle tampado: partida (vazia, cheia — 5 do killfeed, 7 do chat, dica, `#prompt`, `centerMsg` —, inventário, barra de armas) em V1–V5 e retrato; nave, queda e helicóptero em V1 e V2. **Morte, espectador e carro não medidos.** |
| **C4** | ✓ | ✗ | 0 ocorrências de tecla no percurso por toque (lobby, nave — "botão ⇧" —, queda, paraquedas, pouso, pausa, retrato, morte, espectador — "botão ⇧ troca" —, fim de partida) e em partida cheia; **chat aberto no celular: "escreva · toque 💬 para enviar"** (antes "Enter envia · Esc fecha"). Carro, helicóptero e cofre: por leitura (strings do celular em `js/heli.js`, `js/secrets.js`, `js/interact.js`). |
| **C5** | ✓ | ✓ | Pipeline real 271 pontos e dublê 4 455 pontos: 0 tiros, 0,000°. |
| **C6** | ✓ | ✓ | 0,198° em 16 direções; zona morta efetiva (0,12; 0,1225]; 8 patamares monotônicos. |
| **C7** | ✓ | ✗ | Barra de armas: **1 toque nos 56 pares** das 8 armas; arma trancada não troca. **Reinjeção** (troca desligada): nenhum par troca → vermelho. |
| **C8** | ✓ | ✗ | Com 0 carne, 0 kit e 0 granada e nada ao alcance: USAR, COMER, KIT e GRANADA **escondidos**; com itens, aparecem em **1 quadro**; USAR perto do carro aparece 1 quadro depois do `#prompt`; **nenhum botão muda de lugar**. **Reinjeção** (COMER sempre disponível): aparece com 0 carne → vermelho. |
| **C9** | ✓ | ✗ | "Restaurar padrão" existe e funciona (olhar 200 % → 100 %, assistência desligada → ligada); alcançável na pausa; 7 ajustes; o painel rola inteiro em 360 px; armazenamento que lança não derruba nada (A6). |
| **C10** | ✗ | ✗ | ✓ `pointercancel` (agora solta a MIRA), blur, aba escondida, pausa, **chat e morte** (antes o boneco andava 1,275 m), fim de partida, retrato. **✗ Sair do carro pelo USAR com o polegar ainda no analógico: o boneco anda 3,66 m em 0,5 s; sair do helicóptero com o ⇧ ainda apertado: `Space` segue ligado e anda 2,15 m.** (A régua pede tudo solto com o dedo pressionado no instante da transição; a rodada anterior media soltando o dedo antes — agora medido na letra.) Cinemática: a régua se contradiz com E11; não conto. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1** | ✓ | ✗ | **Engajamento novo: 41, 1º disparo mín 2,41 s** (mediana 2,79). **Re-exposição (some 2 s no relevo e volta ao mesmo ponto): 46, mín 1,506 s** (mediana 1,62; antes 25 de 34 abaixo de 1,3 s, mín 0,41 s). |
| **B2** | ✓ | ✗ | **0 violações em 87** (41 novos + 46 re-exposições); na re-exposição a escopeta a 14,5 m acerta pela 1ª vez em 2,92–3,14 s (limite 2,76 s; antes 0,41 s). |
| **B3** | ◌ | ◌ | (a) a 30 m: DMR 9,4–10,3 s (mediana 9,9), sniper 23,5 s; **fuzil: 3 de 3 sem matar em 14 s**. (b) 80 m: DMR 13,4–28,7 s (+1 sem matar em 30 s), sniper 21,2 s — maior que (a) ✓. (c) 4 bots em arco com revide e a pontaria máxima semeada: não medidos. |
| **B4** | ◌ | ◌ | 3 iscas com 2 bots perto: em cada uma só 1 bot acertou; amostra pequena demais. |
| **B5** | ◌ | ◌ | Nas iscas, 1 de 5 primeiros engajamentos foi no humano (20 %) — só 1 caso dentro da condição da régua (rival a 6–15 m). Indicativo, N insuficiente. |
| **B6** | ✓ | ✗ | Relevo real: **0 de 12 164 pares** que o terreno do cliente esconde (antes 54) e **0 de 12 303** pela marcha fina (antes 149). Perseguição: **12 de 12** mais perto da última posição vista (10 chegaram a 0 m) que da atual (30 m); 0 disparos no humano escondido. |
| **B7** | ✗ | ✗ | Inalterado: a visada do bot só conhece o relevo — prédio, rocha e castelo não existem para ele. |
| **B8** | ✓ | ◌ | (a) 0 disparos em 11 humanos parados a 7 m nas costas; (b) humano parado no cone a 45 m (35° fora da frente): quem virou, virou em **1,80–3,01 s** (6 de 15; os outros não viraram em 8 s); (c) tiro com o bot na tela do humano a 50 m: **virou em 1,00–1,10 s (14/14)**; tiro com o humano de costas (bot fora da tela, audição pela metade = 35 m) a 50 m: **0 de 14 reagiram**. |
| **B9** | ◌ | ◌ | Não medido (≥ 500 disparos por lado). |
| **B10** | ✗ | ✗ | Inalterado: o `state` não leva postura. |
| **B11** | ✓ | ✓ | 94,7 % (108/114) dos erros rentes ao rosto; 0 abaixo de 0,42 m. |
| **B12** | ✓ | ✗ | (b) só com o fecho de `dependencies`: terreno de pé, `losGrid` da mesma malha do cliente, **34 baús** (o `import` novo de `js/config.js` funciona no Node); (c) `lineOfSight(null) → false` e está escrito e testado (`test/bots-visada.test.js`); (a) da rodada anterior. |

### D — Desempenho e invariantes

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | **BR entrada: 259 draw calls p50** (253–282) com o mundo a 20,1 s no início da partida — abaixo de 466 ✓. Solo entrada e combate controlado: não medidos. |
| **D3** | ✓ | ◌ | 600 quadros de olhar com a assistência AGINDO em 370: **0 `Object3D` criados**; amostragem de heap do CDP (inclui o que o GC recolheu): **0 bytes de construtor do three** (`Vector3`, `Quaternion`, `Euler`, `Matrix4`, `Raycaster`, `Object3D`…) atribuídos a função do caminho do toque. **Reinjeção** (`new THREE.Vector3()` na fiação): 20 KB atribuídos a "Vector3 ← applyTouchLook" → vermelho. Observação fora do critério: `Oclusao.atualizar` aloca ~2,4–3,4 MB a cada 600 quadros (Map e vetores). |
| **D4** | ✓ | ✓ | Retrato do mundo idêntico entre desktop e `?mobile=1`. |
| **D5** | ✓ | ✓ | 16 bots + 4 humanos, 12,5 min: intervalo p50 100 ms, **p99 102 ms**, 99,94 % ≤ 150 ms (41 307 amostras). |
| **D6** | ✗ | ✗ | 4G emulado: **16,71 MB** totais (> 15,03); arma equipada com 4,19 MB ✓. JS 2,51 MB (+0,07 MB na rodada). |

### E — Estados (percurso por toque, página crua, sem atalho de estado)

| | agora | antes | medido |
|---|---|---|---|
| **E1** | ✓ | ◌ | (a) JOGAR SOLO pelo toque real começa a partida; (b) lobby por toque (nick digitado, cor, código, bots, iniciar); (c) tudo alcançável rolando em 360 px (C2 em V2); (d) nada exige hover/clique direito/tecla; (e) **retrato com o lobby aberto: o aviso cobre o centro e oferece JOGAR ASSIM**. |
| **E2** | ✓ | ✓ | 100 px giram −18,33° na nave; ⇧ leva SHIP → FALL no mesmo quadro; dica "botão ⇧". |
| **E3** | ✓ | ✗ | **Analógico na queda: erro 0,00° nas 8 direções, 5,2 m em 0,4 s** (antes 0,00 m); paraquedas; o pouso devolve o controle a pé (2,08 m em 0,7 s). |
| **E4**, **E5** | ◌ | ◌ | Ir até o veículo só pelo toque não chegou: o carro mais perto está a y −0,1 e o boneco encalhou a 12 m dele; no caminho do helicóptero os bots mataram o jogador. Entrar/sair pelo USAR foi medido em C10 (com atalho de posição). |
| **E6** | ✓ | ◌ | Solo: JOGAR DE NOVO e VOLTAR AO MENU tocáveis e funcionando; BR: tela de morte e **espectador em ~1 s**; morto não atira (portão do tiro) nem recebe assistência (A1). |
| **E7** | ✓ | ◌ | "ESPECTANDO … botão ⇧ troca"; ⇧ troca o espectado (a vista pula 450 m); **≡ (48 px) → MULTIJOGADOR → lobby** pelo toque. |
| **E8** | ✓ | ◌ | ENDED → lobby em 8,7 s → nova partida só por toque (código + COMEÇAR); na nova, nada preso e a MIRA desligada. |
| **E9** | ✗ | ◌ | ≡ pausa ✓, ajustes ✓, o toque que retoma não atira nem gira ✓ (C5). **Não há como sair da partida:** a pausa do BR mostra só MULTIJOGADOR e CONFIGURAÇÕES, e MULTIJOGADOR abre o lobby com COMEÇAR PARTIDA/VOLTAR. O código recusa sair do BR em andamento de propósito ("RECUSAR EM PARTIDA", game.js) — **conflito entre a régua e uma decisão de produto: decisão do dono**. |
| **E10** | ◌ | ✗ | Virar para retrato com o dedo no analógico: pausa, aviso, nada preso ✓; retrato liberado: C2 44 px e C3 0 px² ✓. Virar dirigindo: não medido (sem chegar ao carro pelo toque). |
| **E11** | ◌ | ◌ | Não percorrido. |
| **E12** | ◌ | ◌ | 0 `pageerror` e 0 `console.error` nos percursos E1–E3 e E6–E9 (V3); V2 e E4/E5/E11 não percorridos. |

---

## 3. Defeitos NOVOS, com reprodução mínima

**[NC]** = nasceu de uma correção desta rodada.

1. **O automático atira no campo de tiro (A8-e).** Ligue o tiro automático, puxe a
   alavanca do campo de tiro (`MapToys.startGallery`), ponha a retícula num disco
   a 15 m: 10 disparos. Os discos entram em `extraTargets` e a assistência
   percorre `extraTargets` (game.js, `_aaLists[1]`). Existe desde o automático
   (`19ca181`); só foi medido agora.
2. **Tiro do helicóptero sai pela câmera do quadro anterior (M6).** Entre no
   helicóptero e atire 0,5 s depois: 72 cm fora da retícula a 10 m. A ordem nova
   do quadro (`9a17c3a`) deixou veículos de fora de propósito; o defeito é o
   mesmo de M1 antes da correção, agora só no ar.
3. **Sair do veículo com o polegar no analógico: o boneco sai andando (C10).**
   Carro: 3,66 m em 0,5 s; helicóptero: `Space` segue ligado, 2,15 m. O chat e a
   morte passaram a chamar `soltarEntrada()`; a saída do veículo não.
4. **Esfera de acerto da cabeça acima do modelo (A2).** Alvo atrás de crista a
   37,5 m: a esfera tem linha livre e o modelo tem 0 px — a assistência age.
   (Consequência, fora do critério: dá para acertar quem não aparece.)
5. **[NC] A assistência parou de ajudar quem aparece entre a folhagem.** Alvo sob
   copa, visto 7 m acima a 14 m: **19 de 22 alvos visíveis (> 50 px) sem
   assistência** — a oclusão nova (`140644e`) trata a copa como sólida (as
   folhas com recorte por textura contam como triângulos inteiros). Não reprova
   critério (A2 só proíbe o contrário), mas tira a ajuda justamente no mato.
6. Inalterados: **B7** (bot vê através de prédio), **B10** (postura não chega ao
   bot), **D6** (16,71 MB), **C1(e)** (1,82 m), **E9** (sair da partida —
   decisão do dono).

**Observações sem veredito:** (a) na tela de fim de partida o cluster de toque
continua visível por cima; (b) o lobby aberto pela pausa durante a partida mostra
"▶ COMEÇAR PARTIDA" ao anfitrião (o servidor ignora fora do LOBBY); (c) o carro
mais perto do pouso estava a y −0,1 e não foi alcançável a pé.

**Contagem:** 9 critérios reprovados; **0 nasceram de correção desta rodada**;
1 defeito novo fora da régua nasceu de correção (item 5). Em `7515734`: 4.

---

## 4. Testes que passam por acidente

- **Nenhum novo encontrado.** Os dois da rodada anterior que passavam com o
  defeito agora avermelham com o mesmo mutante: `br-mira-projetil` (bala a
  200 m/s: 5 pass / 1 fail) e `touch-controls` (olhar × `dt·60`: 1 fail).
- `test/mira-quadro.test.js` pega a ordem antiga do quadro (6 de 7 vermelhos).
- Não reinjetei contra `aim-visibilidade`/`aim-oclusao-core` o caso do item 4
  (esfera maior que o modelo): nenhum deles usa âncora de pixels, e o caso só
  aparece com ela.

---

## 5. O trade-off da espiada curta — medido

Pergunta que vai ao dono: *"quem espia curto (≤ 3 s exposto, 2 s escondido) fica
imune"*. Cenário: humano parado na frente do bot, **3 s exposto / 2 s escondido,
6 ciclos**, caminho real.

| arma do bot | distância | espiadores | exposições | exposições com dano | dano total | mortes |
|---|--:|--:|--:|--:|--:|--:|
| **fuzil** | 23,5–24 m | 6 | 36 | **0** | **0** | **0** |
| DMR | 23,5–24 m | 15 | 90 | 2 | 96 | 0 |
| escopeta | 14,5–15 m | 26 | 156 | 3 | 114 | 0 |

**Confirmado:** 47 espiadores, 282 exposições, 0 mortes; com fuzil a 24 m,
nenhuma bala. A conta explica: na volta o bot paga a reação (0,6 s), a
reaquisição (0,7–1,0 s) e a janela de erro rearmada (1,0 + 0,0315·d ≈ 1,76 s a
24 m) — ~3,1–3,4 s antes do primeiro acerto possível, mais que os 3 s de
exposição. É o preço de B1/B2 na re-exposição; se o dono achar que espiar não pode
ser de graça, o botão é a janela de erro rearmada (ou encurtá-la só a partir da
2ª volta), não a reação.

---

## 6. Prioridade do que reprovou

1. **A8(e)** — automático em alvo que não é inimigo (o padrão é desligado, mas quem
   liga atira no campo de tiro).
2. **M6** — tiro voando pela câmera do quadro anterior.
3. **C10** — sair do veículo com o polegar no analógico.
4. **A2** — esfera da cabeça contra o modelo desenhado (1 caso em 33).
5. **B7 / B10** — paredes e postura na visão do bot: a queixa "bots apelões" no
   tiroteio aberto está atendida (B1/B2/B6/B8 verdes), a de "me vê pela parede"
   não.
6. **E9, C1(e), D6** — decisão do dono (sair da partida; limiar de 2 m) e bytes de
   boot de rodadas anteriores.
7. **Os 12 não medidos** — em especial B3(c), B4, B5 (precisam de cenário com
   vários bots juntos), B9, D2 (solo e combate), E4/E5/E10/E11 (chegar ao veículo
   e à cinemática só pelo toque).
