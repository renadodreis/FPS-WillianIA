# Validação do porte para CELULAR — commit `070502f`

Terceira rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53) e `validacao-6aeda6c.md`
(32/53). Autor: o **validador** — não escreveu código de produto nem teste do
repo. Nada foi commitado.

**A régua mudou nesta rodada, e quem a mudou fui eu** (autor da régua, a pedido
do coordenador): o relato do dono de 2026-09-28 virou oito critérios novos —
**M7, C11, C12, P1–P4, E15** — com a fonte (a frase dele) e as inferências
marcadas no próprio texto. Somados a B14 e à reescrita de M1 (decisões do dono,
`5b4dde7`), o total vai a **69**, e o denominador honesto a **62**. Nenhum
limiar antigo foi tocado. A edição da régua está no diff não commitado de
`docs/mobile/criterio-aaa.md`.

---

## 0. Condições

- **Árvore:** `dev` em `070502f` (produto idêntico ao de `ba5c881`). `git status`
  antes e depois: só a régua (`M docs/mobile/criterio-aaa.md`, edição minha) e
  ESTE arquivo (não rastreado). Mutantes aplicados numa **cópia** da árvore fora
  do repo e restaurados por `sha256` contra a árvore principal depois de cada um.
- **Carga:** 1 min entre **1,9 e 4,5** em 12 núcleos (acima de 3 só enquanto a
  bateria de regressões e os mutantes da cópia rodavam juntos — nunca acima do
  teto de 6). Antes de cada medição, `ps` sem `run-tests`/`node --test`/`server.js`
  alheio (o campo `psAlheio` de cada saída ficou vazio, salvo os meus próprios
  testes de unidade de PvE, sem porta, durante a sonda da assistência).
- **GPU:** Chrome headless, ANGLE sobre NVIDIA GeForce RTX 3050. Tempo de frame
  NÃO medido (D1/D7/D8 são de aparelho).
- **Viewports:** V1 667×375, V2 800×360 (a classe do S22 do dono), V3 844×390,
  VR 390×844; `hasTouch`, `isMobile`, DPR 2, `?mobile=1`.
- **Caminho:** o que o relato cobra foi medido pelo **toque do DevTools**
  (`Input.dispatchTouchEvent`, com os eventos agrupados do Chrome) e com o **laço
  do jogo no próprio rAF** (sem `QA.tick`): M7, C11, P1, P2, P3, P4 e E15. E15
  saiu da **nave** (sem `startBRMatch`, que pula a nave de propósito), sem
  `QA.reset`/`teleportToCar`/`tryToggleCar`.
- **Portas:** 3980–3999. Exceções, declaradas: um diagnóstico de 20 s na 3979
  (C5, com a bateria ocupando a faixa) e os testes DO CONSTRUTOR rodados contra
  mutantes na cópia, nas portas fixas deles (4072, 4080, 4082, 4090), com `ps` vazio.
- **Bots:** duas rodadas no caminho real (`server.js` + `scripts/bots.js` pela
  flag do anfitrião + um 2º processo = 16 bots, 4 humanos-dublê a 10 Hz),
  2026-09-28, 99 + 106 engajamentos (§3-B). Cobertura = o relevo (o dublê espera
  8 m abaixo do chão e sobe na frente do bot).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  as das rodadas anteriores (bateria `bateria-r3.sh`) e as novas `r3-toque.js`,
  `r3-m7c.js`, `r3-retic.js`, `r3-golem.js`, `r3-et.js` (duelo), `r3-heli.js`,
  `r3-helidiag.js`, `r3-parede.js`, `r3-predio.js`, `r3-vao.js`, `r3-foto.js`,
  `r3-e15.js`, `r3-bazuca.js`, `r3-b7pares.js`, `r3-c5diag.js`.

---

## 1. Placar

> **42 aprovados · 9 reprovados · 11 não medidos, em 62** (42/69).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `6aeda6c` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 5 · 1 · 0 (de 6) |
| A — assistência (8) | 7 | 0 | 1 (A5) | 5 · 2 · 1 |
| C — controles/HUD (12) | 8 | **3** (C1, C11, C12) | 1 (C3) | 7 · 2 · 1 (de 10) |
| B — bots (13) | 6 | **3** (B2, B7, B14) | 4 (B3, B4, B5, B9) | 6 · 2 · 4 (de 12) |
| P — PvE (4) | 3 | **1** (P1) | 0 | — (nova) |
| D — desempenho (5) | 3 | **1** (D6) | 1 (D2) | 3 · 1 · 1 |
| E — estados (13) | 8 | **1** (E9) | 4 (E4, E5, E11, E12) | 6 · 1 · 5 (de 12) |

Nos 53 critérios que já existiam em `6aeda6c`: **37 aprovados · 5 reprovados ·
11 não medidos** (antes 32 · 9 · 12). Seguem reprovando: C1, B7, D6, E9;
**passou a reprovar: B2** (1 caso na 1ª re-exposição); **passaram a aprovar: M6,
A2, A8, C10, B10, E10**. Nos 9 novos (M7, C11, C12, B14, P1–P4, E15): **5
aprovados, 4 reprovados** (C11, C12, B14, P1).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando aparelho / humano.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✗, E10 ✓ (era ◌), E11 ◌.

**Defeitos que reprovam e nasceram de correção desta rodada: 1** (C12 — a
retícula nova nunca avermelha sobre o Visitante; §4 item 2). Em `6aeda6c`: 0.
Em `7515734`: 4.

**O furo do loot de morte segue fechado** (e `7305536` acrescentou teto por
arma) — medido só em servidor local; o detalhe fica fora do repo.
`test/security-regression.test.js`: **18/18**.

---

## 2. O relato do dono — os seis itens

| # | frase do dono | critério | veredito | o número |
|---|---|---|---|---|
| 1 | *"a sensibilidade ali na movimentação deve ser melhorada"* | M7, C11 | M7 ✓ · C11 ✗ | Olhar pelo toque real: padrão linear (55,004° por 300 px em 0,06 s **e** em 1,5 s); aceleração 100 %: lento ×1,000, rápido ×2,000; o MESMO arrasto a 61 e a 20 quadros/s dá o MESMO giro (0,00 %). Analógico: topo da faixa de andar = **95,2 %** do `W` do teclado (o construtor mediu 85 % antes de `8506731`), meio curso = 54 %. **A corrida liga com 0,824 do curso do dedo**, não 0,80 (os 0,80 do código são DEPOIS da zona morta) — 1,4 px de 58. |
| 2 | *"o ET está muito forte pra matar ele"* | P1 | **✗** | Duelo real a 20 m, fuzil com 80 % no corpo: o ET morre em **7,74–7,84 s (58–60 disparos)**; o jogador parado morre em **5,41–7,32 s** — **o jogador morre primeiro em 4 de 4** duelos limpos. (b) cabe no teto por 0–2 disparos. DMR: 13,6–14,6 s. |
| 3 | *"a mira não fica vermelha quando apontada aos inimigos"* | C12 | **✗** | Vermelha no 1º quadro sobre jogador remoto/bot (20, 40 e 50 m), lobo, esqueleto, zumbi, cabeça do golem; branca no cervo, no disco, a 70 m e com 0 px; apaga em 6 quadros (0,1 s). **Sobre o Visitante, NUNCA**: 25 de 25 px dele sob a cruz a 20 m, motivo `oculto` — o ET que o dono citou na mesma lista. |
| 4 | *"os bichos te matarem através da parede"* / *"ver nos prédios, se temos bugs"* | P2, P4 (B7) | P2 ✓ · P4 ✓ · B7 ✗ | 1 526 golpes de PvE em 6 cenários de prédio (3 térreos por dentro, 3 paredes), 60 s cada: **0 sem um atacante do mesmo tipo com linha livre** (controle em céu aberto: 432). Prédio: 57 corridas contra paredes finas (normal e CPU 6×): **0 travessias**; vão de base: nenhum visível. Bots: **0 de 1 542** pares escondidos por parede que o bot enxerga — mas **33 de 41** escondidos por **rocha**, sim. |
| 5 | *"eles não deveriam conseguir te pegar ou te dar dano se você está no helicóptero"* | P3 | ✓ (PvE) | Voando a 13,1 m, 60 s, PvE a 1,9–15 m: **0 golpes** (a pé, o mesmo: 921 golpes); pousado com o motor ligado: 0. **Bots — fora de P3 por decisão da régua — acertam quem está no helicóptero:** dublê com o estado `heli` a 12 m do chão, de frente para o bot a 25 m: **19 de 20 bots atiraram e acertaram**, 38–128 de dano em 14 s. |
| 6 | *"os baús não estavam abrindo no celular e nem estavam conseguindo entrar e sair do carro"* | E15 | ✓ | Da nave, só toque: pulou a 83 m do alvo, pilotou a queda e pousou **a 0,0–0,2 m** do baú; **1º toque** no USAR (V2) e na dica "USAR — ABRIR BAÚ" (V1) abre e **o item entra no inventário**; **0 baús de enfeite** entre 19 desenhados; caminhão: entra no 1º toque, anda 23 m, sai no 1º toque, e o polegar que fica no analógico **não anda** (0 m). |

---

## 3. Veredito por critério (com a comparação com `6aeda6c`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2, 8 armas × quadril/ADS × {parado, dedo no ATIRAR a 4 e 10 px/quadro, lado, frente, lado + dedo} × {projétil do BR, hitscan}: **0,00 cm / 0,00 px a 10, 25 e 50 m nos 192 casos de arma de fogo**. **Bazuca pela régua nova (decisão do dono):** (a) origem do foguete a **0,00 cm da boca** lida no MESMO instante do `Rockets.fire` (5 disparos); (b) afastamento **constante** nas três distâncias (25,85 cm no quadril, 13,09 cm na mira; variação 0,00 cm; 0,000° de paralelismo); (c) afastamento = boca↔eixo da mira (25,89 = 25,89; 13,09 = 13,09). |
| **M2** | ✓ | ✓ | No voo: fuzil 720 m/s → 0,139 s e 7,3 cm a 100 m; DMR 800 → 0,125 s, 4,7 cm; sniper 850 → 0,118 s, 4,6 cm. |
| **M3** | ✓ | ✓ | 0,18333 °/px a 100 %; 200/100 = 1,99999; 30/60/120 Hz iguais a 5e-6; soltar 3e-17 rad. |
| **M4** | ✓ | ✓ | R(ADS)/R(quadril) = 1,0000–1,0003 em 8 miras. |
| **M5** | ✓ | ✓ | razão 0,6002 (menu 60 %); diagonal: erro máx 0,011°. |
| **M6** | ✓ | ✗ | **Voando: 3 tiros a 0,00 cm do ponto da retícula a 10/25/50 m** (antes 72/55/26 cm), retícula visível; nave, queda e paraquedas: opacidade 0. |
| **M7** *(novo)* | ✓ | — | Toque real, V2, laço no rAF. (a) aceleração 0 %: 300 px em 0,06 s e em 1,5 s → **55,004° e 55,004°** (= 300 × 0,18335); (b) aceleração 100 %: lento (91–200 px/s) ganho **1,000**; rápido (~5 000 px/s) **2,000**; (c) o mesmo arrasto com os mesmos carimbos de tempo do evento a **61 e a 20 quadros/s**: 110,008° = 110,008°, 80,324° = 80,324°, 55,004° = 55,004° (0,00 %); (d) slider 30–250 %. **Reinjeção** (ganho fixo 2): lento vai a 2,000 → (b) vermelho; `toque-sensibilidade` também fica vermelho. |

### A — Assistência de mira

| | agora | antes | medido / âncora |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse, caneta e mouse no ATIRAR: núcleo agiu em 0 quadros; morto, pausa, nave/queda, cinemática, espectador, menu: 0 chamadas ao núcleo. Controle: 4,71°. |
| **A2** | ✓ | ✗ | Âncora de pixels: **236 casos** (105 aleatórios, 96 atrás de veículo em pé e agachado, 25 sob copa vista de cima, 10 além da névoa): **0 com 0 px e a assistência agindo, 0 disparos do automático** (antes 1 em 33, a crista). |
| **A3** | ✓ | ✓ | Efeito até 2,8° da borda (10 m, quadril), 0 além. |
| **A4** | ✓ | ✓ | ρ ∈ [0,22; 0,300]; cruzamentos com = sem (4 = 4) a 5, 30 e 60 °/s; alvo parado: pull 0. |
| **A5** | ◌ | ◌ | (a) ✓, (b) ✓ 0,233 s = 0,233 s, (c) ✓ 3,64° × 4,34° a 20 m (−16 %). (d) segue em conflito com A2 (ver `6aeda6c`). |
| **A6** | ✓ | ✓ | Faca e bazuca 0; DMR e sniper 1,70° × fuzil 4,71°; desligar grava 0. |
| **A7** | ✓ | ✓ | Tiro com a assistência agindo: 0 px; `security-regression` **18/18**. |
| **A8** | ✓ | ✗ | **(e) automático ligado sobre os discos do campo de tiro: 0 disparos** (antes 10); (a)–(d), (f) como antes (fuzil a 20 m: 3 tiros, 1º em 0,217 s; 0 a 75 m; faca/bazuca/DMR/sniper 0). |

### C — Controles e HUD

| | agora | antes | medido / âncora |
|---|---|---|---|
| **C1** | ✗ | ✗ | (a)–(d), (f) ✓; **(e) três dedos em 0,5 s: 1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | ≥ 44 px em menu, ajustes (21), lobby (29), jogo, jogo cheio, inventário, em V1 e V3; nenhum < 44. |
| **C3** | ◌ | ◌ | 0 px² entre controles e HUD essencial em jogo, jogo cheio e inventário (V1, V3); morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque (nave "botão ⇧", espectador "botão ⇧ troca", chat "escreva · toque 💬 para enviar", dica do baú "USAR — ABRIR BAÚ"). |
| **C5** | ✓ | ✓ | Grade de 280 pontos pelo pipeline real: **0 disparos** — a sonda contou 3, e o diagnóstico mostrou que eram TROCAS DE ARMA (a barra de armas e o ⇄ trocam o pente, 0 `shotFired`); dublê de 4 455 pontos: 0 tiros, 0°. |
| **C6** | ✓ | ✓ | 0,198° em 16 direções; zona morta efetiva 0,1225; patamares monotônicos. |
| **C7** | ✓ | ✓ | 1 toque nos 56 pares das 8 armas; trancada não troca. |
| **C8** | ✓ | ✓ | Sem itens, USAR/COMER/KIT/GRANADA escondidos; com itens, 1 quadro; 0 botões mudam de lugar. |
| **C9** | ✓ | ✓ | Restaurar padrão funciona; agora 9 ajustes (entraram aceleração do olhar e curso do analógico). |
| **C10** | ✓ | ✗ | **Sair do carro pelo USAR com o polegar no analógico: 0 m** (antes 3,66 m) — na página crua (E15) e na sonda; **sair do helicóptero com o ⇧ apertado: nada preso, 0 m** (antes `Space` preso, 2,15 m); pointercancel, blur, aba, pausa, chat, morte: nada preso. Cinemática: a régua se contradiz com E11; não conto. |
| **C11** *(novo)* | **✗** | — | Toque real contra o `W` real, mesma partida: (a) topo da faixa de andar **4,943 / 5,194 m/s = 95,2 %** ✓; (b) meio curso 2,805 m/s = 54 % ✓, monotônico; **(c) a corrida liga com 0,824 do curso do dedo, não com ≤ 0,80** — o `SPRINT_MAG = 0,8` do código é medido DEPOIS da zona morta (0,12 + 0,88 × 0,8); (d) curso 150 %: 60 px andam (4,204 m/s); 100 %: os mesmos 60 px correm ✓. A diferença é 1,4 px num raio de 58; se o dono quiser o limiar pós-zona-morta (o que o produto e, ao que parece, o `GameController` da Apple fazem), é reescrita da régua — decisão dele. |
| **C12** *(novo)* | **✗** | — | Cor computada da `#crosshair`, âncora de pixels. (a) ✓ jogador remoto a 20/40/50 m, lobo, esqueleto, zumbi, cabeça do golem: **vermelha no 1º quadro**; **✗ Visitante: 25/25 px sob a cruz a 20 m e a cruz BRANCA, motivo `oculto`** — o objeto do Visitante (e o do Colosso) não tem `group`/`mesh`, e `isRendered(undefined)` devolve falso. Golem: tronco branco quando a grama cobre o centro (conferido por pixel: esconder a grama muda o centro); 1 caso em 19 com o centro no golem e sem grama e a cruz branca — borda de lâmina, não conto. (b) ✓ cervo, disco, 70 m com 5 px visíveis (fora do alcance do fuzil), 0 px; (c) ✓ apaga em 6 quadros; (d) decisão do dono. **Reinjeção** (sem checar a categoria): disco e cervo ficam vermelhos. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1** | ✓ | ✓ | **Engajamento novo: 11, 1º disparo mín 2,225 s** (mediana 2,73). **1ª re-exposição (some 2 s e volta): 12, mín 1,49 s**. |
| **B2** | **✗** | ✓ | Cenários próprios: 0 violações em 11 engajamentos novos (folga mín 1,25 s) e em 8 re-exposições com dano (1º dano 3,01–5,06 s contra 2,76–3,23 s). **Mas no cenário de espiada, 1ª re-exposição, fuzil a 23,5 m: 1º dano a 2,969 s da volta, contra o piso de 1,3 + 1,0 + 0,0315·23,5 = 3,04 s** — 71 ms abaixo (e o servidor soube da volta até 100 ms DEPOIS do relógio da sonda, então a folga real é ainda menor). Nessa espiada o bot não disparou nenhuma vez na 1ª exposição. 1 caso entre 21 primeiros danos medidos na janela de B2 (11 novos, 8 re-exposições do cenário próprio, 2 re-exposições de espiada); escopeta a 15 m na mesma situação: 2,951 s ≥ 2,77 ✓. |
| **B3** | ◌ | ◌ | Fuzil parado a 24 m (não 30): 10,63 e 12,21 s; DMR a 24 m: mediana 11,35 s (9); escopeta a 15 m: 7,44 s (17). (a) a 30 m, (b) e (c) não medidos. |
| **B4** | ◌ | ◌ | Não medido. |
| **B5** | ◌ | ◌ | Não medido. |
| **B6** | ✓ | ✓ | Relevo: **0 de 12 164 pares** que o terreno do cliente esconde (0 de 12 303 pela marcha fina). Perseguição: **5 de 5** mais perto da última posição vista (0–25,5 m) que da atual (30–39 m); 0 disparos durante a fuga. |
| **B7** | **✗** | ✗ | Pares bot→humano contra o `rayBlockedAt` do cliente (seed 424242): **prédios e muralhas 0 de 1 542**, relevo 0 de 1 836 — **rocha 33 de 41** (e árvore 21 de 23, fora de B7). No caminho real, 3 humanos atrás de parede de prédio: 0 disparos e 0 viradas em 12 s. O construtor declara rochas e árvores fora do alcance do Node (`scripts/bots.js`). |
| **B8** | ✓ | ✓ | (a) 7 humanos parados a 7 m nas costas: **0 disparos** (1 bot passou o rumo pelo humano aos 5,3 s patrulhando, sem atirar; 1 caso descartado: o bot já o encarava no t0). (b) no cone a 45 m (35° fora da frente): virou em **1,2–1,91 s** (4 DMR; escopetas fora do alcance não viraram). (c) tiro com o bot na tela do humano a 50 m: virou em **1,0 s** (6), 2,6 s e 5,0 s — 8 de 9 (o 9º estava atirando em outro alvo); de costas, a 50 m (> 30 m da audição pela metade): **0 de 8** (1 descartado: o bot disputava outro dublê no mesmo intervalo). |
| **B9** | ◌ | ◌ | Não medido. |
| **B10** | ✓ | ✗ | **Agachado: intervalo mínimo entre acertos 2,90 s (escopeta, 18) e 3,21 s (DMR, 7); em pé: 1,40 s e 1,60 s → 2,07× e 2,00×**. O agachado nunca some: 22 de 25 levaram dano (1º acerto na mediana em 4,3 s × 4,3 s em pé). O servidor sanitiza e limita a postura pela velocidade (`crouchFromState`); `security-regression` **18/18**. |
| **B11** | ✓ | ✓ | **97,8 %** (315/322) dos erros rentes ao rosto; 0 abaixo de 0,42 m (1 descartado: cenário de fuga, o humano já não estava no ponto). |
| **B12** | ✓ | ✓ | O import novo dos bots (`js/paredes.js` → `citylayout`, `cityinterior`, `secrets-core`) não tem dependência externa nenhuma; `createBotSolids` roda no Node puro (seed 424242); stderr do filho herdado. |
| **B14** *(novo)* | **✗** | — | Caminho real, 3 s exposto / 2 s escondido, 12 ciclos. **Só 3 espiadores de fuzil a 24 m** (o sorteio de baús deu poucos fuzis aos bots; N ≥ 30 não alcançado) — e os três já reprovam: (a) a 1ª re-exposição de um deles tomou dano a 2,969 s (B2 acima); (b) TTK do espiador **18,3 s, 38,6 s e ∞** (0 de dano em 12 ciclos; o bot atirou 5 vezes em 60 s) contra 3 × o parado (fuzil parado a 24 m: 10,63 e 12,21 s, mediana 11,4 s → 34,3 s): mediana 38,6 s > 34,3 s; (c) dano entre a 3ª e a 6ª exposição em **2 de 3**. Declarados, sem portão: DMR a 24 m, 9 espiadores, TTK finito em 6 (21,9–42,3 s), 3ª–6ª em 7 de 9; escopeta a 15 m, 16, TTK finito em 7 (21,9–42,6 s), 3ª–6ª em 9 de 16. **Nenhum** dano na 1ª exposição (28 espiadores). |

### P — PvE *(nova)*

| | agora | antes | medido / âncora |
|---|---|---|---|
| **P1** | **✗** | — | Duelo no BR, jogo no rAF, dedo no ATIRAR, a sonda trava a mira no corpo e erra 1 de cada 5 disparos 3 m ao lado (80 % medidos: 0,78–0,81). Jogador sem colete, 100 de vida; a morte é CONTADA (dano acumulado − regeneração ≥ 100; a vida é reposta para o duelo continuar). Fuzil, 4 duelos só com o ET: **ET morre em 7,74–7,84 s (58–60 disparos); jogador "morre" em 5,41 / 6,94 / 5,41 / 7,32 s** → (a) ✗ em 4 de 4; (b) ✓ por pouco (58–60 ≤ 60). Com 100 % de acerto: 6,66–6,68 s (47 disparos). ET contra jogador parado sem revidar: 6,69–8,79 s. DMR a 80 %: 13,6–14,6 s (21–23 disparos). A causa do (a): o orbe tira 17–21 por acerto e sai de 3 em 3 a cada 1,6 s. **Reinjeção** (vida 1 900): o teste do construtor fica vermelho. |
| **P2** | ✓ | — | Térreo oco de 3 prédios (jogador dentro, bichos fora) e 3 paredes altas da cidade (bichos do outro lado), 60 s cada, lobo, zumbi, fantasma, esqueleto e o orbe do Visitante repostos a cada 3 s: **1 526 golpes, 0 sem atacante do mesmo tipo com linha livre (`rayBlockedAt` do cliente, peito a peito) no quadro do golpe**; controle em céu aberto: 432 golpes. Os golpes dentro do prédio vêm de quem entrou pela porta. **Reinjeção** (mordida sem `meleeBlocked`): a sonda acusa 2 golpes de fantasma (14 de dano) — sensível, mas fraca (a régua do "mesmo tipo" é leniente); o teste do construtor também fica vermelho. |
| **P3** | ✓ | — | Voando a 13,1 m (13,3 médios), 60 s, 3 lobos, 3 esqueletos, 4 zumbis, 2 fantasmas e o Visitante repostos a ≤ 20 m (os mais perto a 1,9–3,5 m): **0 golpes**; pousado com o motor ligado: 0; a pé no mesmo ponto: **921 golpes**. Zumbi segurado a 0,5 m do corpo no helicóptero por 5 s: 0. **Limite da sonda, declarado:** com o portão do voo arrancado, ela também dá 0 (no BR o bicho não chega perto do corpo dentro do helicóptero); quem avermelha com esse mutante é o `pve-heli-jogo` do construtor (4 de 4 casos vermelhos). Bots e golem: fora (PvP/servidor), ver §2 item 5. |
| **P4** | ✓ | — | (a) paredes finas (≤ 1 m) e altas a ≤ 60 m do centro da cidade (14 com o laço normal, 5 com CPU 6×), rumo perpendicular e ±30° pelos dois lados, analógico no talo por 1,6 s, partida fora de qualquer pegada, trajetória amostrada a cada quadro (travessia = cruzar o plano da parede DENTRO do vão dela; contornar a ponta não conta): **0 travessias em 57 corridas**. (A 1ª versão da sonda acusou 6 "travessias" — partida dentro da pegada de um prédio, o `QA.reset` punha o jogador no telhado; corrigido e declarado.) **Reinjeção** (colisão das paredes altas desligada): 6+ travessias → vermelho. (b) Colisores: 198 caixas de base, 9 com canto > 0,10 m (degraus da rampa do castelo, 0,15–0,53 m; duas paredes urbanas, 0,21 m); raio DESENHADO de cada canto para baixo e foto: os degraus assentam na malha da rampa (foto sem fresta), as caixas "soltas" são telhados de cabana com beiral. **Nada flutua na tela.** |

### D — Desempenho e invariantes

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **226 draw calls p50** (219–251) com o mundo a 22,5 s (antes 259). Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: **0 `Object3D`**. |
| **D4** | ✓ | ✓ | Retrato do mundo idêntico entre desktop e `?mobile=1`. |
| **D5** | ✓ | ✓ | 16 bots + 4 humanos, duas rodadas de 17–18 min: p50 100 ms, **p99 102 ms**, 99,94 % ≤ 150 ms (55 228 + 42 077 amostras). |
| **D6** | ✗ | ✗ | 4G emulado: **16,84 MB** (antes 16,71; limite 15,03); JS 2,64 MB (+0,13). |

### E — Estados (percurso por toque, página crua)

| | agora | antes | medido |
|---|---|---|---|
| **E1** | ✓ | ✓ | Menu, lobby, retrato com JOGAR ASSIM, nick, cor, anfitrião, bots, iniciar — tudo por toque. |
| **E2** | ✓ | ✓ | 100 px giram −18,33° na nave; ⇧ leva SHIP → FALL no mesmo quadro; "botão ⇧". |
| **E3** | ✓ | ✓ | Analógico na queda: 0,00° em 8 direções, 5,2 m em 0,4 s; pouso devolve o controle. |
| **E4** | ◌ | ◌ | **Agora chega ao carro pelo toque** (E15): USAR entra no 1º toque, analógico à frente = **8,27 m/s para a frente da vista**, USAR sai, C10 ✓. Guinada e ré não medidas limpas (o caminhão bateu no relevo da base e as velocidades caíram a < 1 m/s). |
| **E5** | ◌ | ◌ | Chegar ao helicóptero só por toque: não percorrido. Sair com o ⇧ apertado: C10 ✓. |
| **E6** | ✓ | ✓ | Solo: JOGAR DE NOVO e VOLTAR AO MENU; BR: espectador. |
| **E7** | ✓ | ✓ | "ESPECTANDO … botão ⇧ troca"; ≡ → MULTIJOGADOR → lobby. |
| **E8** | ✓ | ✓ | ENDED → lobby em 8,7 s → nova partida só por toque; nada preso. |
| **E9** | ✗ | ✗ | Inalterado: a pausa do BR não tem "sair da partida" (decisão do dono). |
| **E10** | ✓ | ◌ | **Virar para retrato DIRIGINDO, com o polegar no analógico: pausa e nada preso** (`keys` vazio); C2/C3 em retrato já medidos. |
| **E11** | ◌ | ◌ | Não percorrido. |
| **E12** | ◌ | ◌ | 0 `pageerror` nos percursos E1–E3, E6–E8, E10, E15 (V1, V2, V3); E4/E5/E11 não percorridos. |
| **E15** *(novo)* | ✓ | — | V2 e V1 (e V3 com E4): da nave, o ⇧ pula a 82,9 m do baú-alvo, o analógico pilota a queda, **pouso a 0,0–0,2 m**; (a) **1º toque** no USAR (V2) / na dica "USAR — ABRIR BAÚ" (V1): baú aberto **e o item entrou** (arsenal/inventário mudaram); (b) **19 baús desenhados, 0 de enfeite** (todos são baús do BR); (c) caminhão militar: entra no 1º toque, **23 m em 2,5 s**, USAR visível dirigindo, sai no 1º toque; (d) toda ação no 1º toque. O 2º baú (a 31 m, fora do caminho) o andador não alcançou — limite da sonda. |

---

## 4. Defeitos NOVOS, com reprodução mínima

**[NC]** = nasceu de uma correção desta rodada.

1. **O ET mata antes de morrer (P1).** Duelo a 20 m, fuzil, 80 % no corpo: o
   jogador soma 100 de dano em 5,4–7,3 s; o ET cai em 7,74–7,84 s. A vida caiu de
   1 900 para 1 200 (`2b377ed`) e o dano do orbe ficou igual — o próprio commit
   deixou "o dano dele" como decisão a confirmar. Não é regressão: é o relato do
   dono ainda aberto.
2. **[NC] A retícula nunca avermelha sobre o Visitante (C12).** BR com o
   Visitante, cruz no corpo dele a 20 m: 25/25 px dele no centro, cruz branca,
   `Reticula.last.motivo = 'oculto'`. `createReticula` pergunta
   `isRendered(b.t.group || b.t.mesh, root)`, e o objeto que `js/alien.js` (e
   `js/boss.js`, o Colosso) põe em `Bosses` não tem nem `group` nem `mesh`.
   Nasceu com a retícula (`ca0a891`).
3. **A assistência de mira nunca age sobre o Visitante nem o Colosso.** Mesma
   causa, na coleta da assistência (`isRendered(t.group || t.mesh, root)`),
   desde `19ca181`. Nenhum critério A cobra alvo PvE, mas é exatamente o
   inimigo que o dono diz ser "muito forte pra matar" — no celular ele é o único
   alvo sem ajuda.
4. **Bots acertam quem está no helicóptero.** Dublê com o estado `heli` a 12 m do chão, bot a 25 m: 19 de 20 atiram e acertam (38–128 de dano em 14 s); `scripts/bots.js` não
   tem a palavra "heli". Fora de P3 por decisão da régua (PvP); se o "eles" do
   dono inclui os bots, está aberto.
5. **Bot vê através de rocha (B7).** 33 de 41 pares escondidos por rocha são
   vistos pelo bot (e 21 de 23 por árvore, que B7 não cobra). Declarado pelo
   construtor em `scripts/bots.js` ("FORA DO ALCANCE DO NODE: árvores e
   rochas"); a vítima ainda recusa o dano por cobertura.
6. **Limiar de corrida a 0,824 do curso (C11-c).** 1,4 px além do escrito na
   régua; ver C11.
7. Inalterados: **C1(e)** (1,82 m), **D6** (16,84 MB), **E9** (sair da partida —
   decisão do dono).

**Observações sem veredito:** (a) com a assistência ligada, a copa vista de cima
ainda tira a ajuda de 10 de 20 alvos visíveis (era 19 de 22 — o [NC] de
`6aeda6c`, melhorado, fora da régua); (b) tocar o chip da arma ATIVA na barra
de armas troca para a faca — design, mas faz "sumir" o pente para quem conta
munição; (c) no BR os golpes dentro do térreo oco vêm de bicho que entra pela
porta (não há porta que feche).

**Contagem:** 9 critérios reprovados; **1 nasceu de correção desta
rodada** (C12, `ca0a891`). O caso de B2 pode ter nascido de `31788e3` (a
proteção que se esgota mexeu na re-exposição), mas não isolei — não conto. Em `6aeda6c`: 0. Em `7515734`: 4.

---

## 5. Testes que passam por acidente — e os mutantes

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| retícula sem checar a categoria | disco e cervo vermelhos ✓ | `reticula-tela` vermelho ✓ |
| aceleração com ganho fixo 2 (M7) | lento ×2,000 ✓ | `toque-sensibilidade` vermelho ✓ |
| andar = deflexão (C11) | — | `toque-sensibilidade` vermelho ✓ |
| vida do ET 1 900 (P1) | (P1 já reprova) | `pve-visitante-ttk` vermelho ✓ |
| mordida sem `meleeBlocked` (P2) | 2 golpes acusados (fraca) | `pve-parede` vermelho ✓ |
| portão do voo arrancado (P3) | **0 — a sonda não pega** | `pve-heli` 16 vermelhos, `pve-heli-jogo` 4 de 4 ✓ |
| colisão das paredes altas desligada (P4) | 6+ travessias ✓ | — |

Sem mutante, os três arquivos de navegador do construtor: 24/24 verdes.

- **`test/reticula-tela.test.js` passa com o defeito 2 do §4 presente.** Não é
  asserção fraca: é cobertura de ESTADO. Todos os casos usam o avatar remoto
  (e disco/cervo como neutros); o Visitante, que o dono citou na mesma frase do
  relato, não entra em nenhum. O HEAD é o mutante.
- **`test/pve-visitante-ttk.test.js` mede o eixo em que o defeito não
  aparece** (família 3 do CLAUDE.md). Ele prova "fuzil a 80 % derruba em 5–8 s"
  contra o `damage()` puro, e passa (6,6 s no modelo, 7,7 s no duelo real); o
  que o relato cobra é o ET morrer ANTES de matar, e esse número o teste não
  tem. Verde com o jogador morrendo primeiro em 4 de 4 duelos.
- **A minha sonda de P3 não pega o portão arrancado** (declarado em P3): no BR o
  corpo do jogador dentro do helicóptero já fica fora do alcance do bicho; o
  critério fica verde pelo número da sonda E pelo teste do construtor, que
  avermelha.

---

## 6. Prioridade do que reprovou

1. **C12 / defeito 3** — o Visitante sem retícula e sem assistência: uma linha
   de causa, dois efeitos, e é o alvo do relato. [NC]
2. **P1** — o ET ainda mata antes de morrer (o dano do orbe ou a cadência, a
   decisão que `2b377ed` deixou para o dono).
3. **B14 e B2** — com fuzil a 24 m quem espia ainda escapa (1 imune em 12 ciclos, mediana acima de 3 × o parado), e a 1ª re-exposição de um espiador tomou dano 71 ms antes do piso. N de fuzil = 3: a próxima rodada precisa de bots com fuzil garantido.
4. **B7 (rocha)** — o bot vê através de rocha; a queixa "me vê pela parede" está
   atendida nos prédios (0 de 1 542).
5. **C11(c)** — 0,824 × 0,80: decidir se a régua mede antes ou depois da zona
   morta (decisão do dono; eu não reescrevo sozinho um critério que reprova).
6. **C1(e), D6, E9** — de rodadas anteriores (limiar de 2 m sem fonte, bytes de
   boot, sair da partida = decisão do dono).
7. **Os não medidos** — A5 (conflito com A2), C3 (morte/espectador/carro), B3,
   B4, B5, B9, D2 (solo e combate), E4 (guinada e ré), E5, E11, E12.
