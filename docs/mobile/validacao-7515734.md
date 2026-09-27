# Validação do porte para CELULAR — commit `7515734`

Primeira rodada de validação independente contra `docs/mobile/criterio-aaa.md`
(60 critérios, denominador honesto 53). Autor: o **validador** — não escreveu
código de produto nem teste do repo, não editou a régua. Árvore principal
congelada durante toda a medição; nada foi commitado.

> **Aviso de procedimento.** A régua (§10) manda parar no primeiro vermelho.
> O orquestrador pediu o placar inteiro, então segui medindo depois do primeiro
> vermelho; cada vermelho abaixo continua sendo, sozinho, reprovação da entrega.

---

## 0. Condições

- **Árvore:** `dev` em `7515734`, `git status --short` vazio e `git diff` vazio
  antes e depois (a única diferença ao final é ESTE arquivo, não rastreado).
  Mutantes foram aplicados numa **cópia** (`rsync` da árvore, fora do repo) e
  restaurados por `sha256` contra a árvore principal depois de cada um.
- **Máquina:** 12 núcleos; carga de 1 min entre **2,0 e 3,3** durante todas as
  medições (acima do "< 1,5" da régua §0, abaixo do teto de 6 do briefing — não
  houve espera). Nenhum `run-tests`/`node --test`/`server.js` alheio vivo antes
  de cada medição (`ps` registrado por sonda). Existe um Chrome pessoal aberto
  há dias e um `scrcpy` de um Galaxy S22 — não foram tocados.
- **GPU:** Chrome headless com ANGLE sobre **NVIDIA GeForce RTX 3050**
  (OpenGL 4.5), `tier=baixo` fixo pelo harness. Tempo de frame NÃO foi medido
  (não transfere para aparelho — D1/D7/D8 continuam de aparelho).
- **Viewports:** V1 667×375, V2 800×360, V3 844×390, V4 932×430, V5 1180×820,
  VR 390×844; todos `hasTouch`, `isMobile`, DPR 2, `?mobile=1`.
- **Seed:** 424242 em todas as sondas.
- **Portas:** 3980–3997 (validador). As duas execuções de testes EXISTENTES do
  repo (`br-mira-projetil`, `touch-controls`, `security-regression`) usaram as
  portas fixas deles, com a máquina sem nenhuma outra suíte.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `mira.js` (M1–M5, C1, C6), `assist.js` (A1–A8, âncora de pixels),
  `hud.js` (C2–C4, C7–C10), `c5real.js` (C5 pelo pipeline real de toque),
  `estados.js` (percurso por toque sem atalho), `arena-b.js` + `analyze-b.js`
  (bots no caminho real), `b6-relevo.js`, `desemp.js` (D2–D4), `boot4g.js` (D6),
  `m6.js`, `ls-throw.js`, `mut.py` (mutantes na cópia). Resultados brutos em
  `out/` na mesma pasta.

### Achado de ferramenta que muda a régua (C5)

A régua diz que "o Chrome headless não gera" os eventos de mouse de
compatibilidade e por isso exige dublê. **Nesta versão do Chrome ele gera**:
`page.touchscreen.tap` (Input.dispatchTouchEvent) produz
`pointerdown → touchstart → pointerup → touchend → mousedown → mouseup → click`,
todos com `sourceCapabilities.firesTouchEvents = true`; com o `pointerdown`
cancelado, somem `mousedown`/`mouseup` e **o `click` continua saindo**.
C5 foi medido pelos dois caminhos (pipeline real e dublê declarado).

---

## 1. Placar

> **12 aprovados · 23 reprovados · 18 não medidos, em 53** (12/60).
> A entrega **não** está aprovada.

| área | aprovados | reprovados | não medidos |
|---|--:|--:|--:|
| M — mira e tiro (6) | 4 (M2, M3, M4, M5) | **2** (M1, M6) | 0 |
| A — assistência (8) | 2 (A3, A4) | **5** (A2, A5, A6, A7, A8) | 1 (A1) |
| C — controles e HUD (10) | 2 (C5, C6) | **7** (C1, C2, C4, C7, C8, C9, C10) | 1 (C3) |
| B — bots (12) | 1 (B11) | **6** (B1, B2, B6, B7, B10, B12) | 5 (B3, B4, B5, B8, B9) |
| D — desempenho (5) | 2 (D4, D5) | **1** (D6) | 2 (D2, D3) |
| E — estados (12) | 1 (E2) | **2** (E3, E10) | 9 |

Os 7 de aparelho/humano (A9, B13, D1, D7, D8, E13, E14): **aguardando aparelho
/ aguardando humano** — nada nesta rodada os tocou.

**Regressões obrigatórias (§8):** M1 ✗, M2 ✓, C4 ✗, D2 não medido, D6 ✗,
E10 ✗, E11 não medido.

**Defeitos que reprovam e nasceram de uma correção desta rodada: 4**
(A2, A5(c), A7(a), E3-dica) — ver §3. É o termômetro: a assistência de mira,
nova nesta rodada, trouxe três deles sozinha.

---

## 2. Veredito por critério

Legenda: ✓ aprovado · ✗ reprovado · ◌ não medido (conta como não aprovado).
"Reinjeção" = mutante aplicado na cópia e a sonda ficou vermelha, com número.

### M — Mira e tiro

| | veredito | medido | âncora / como |
|---|---|---|---|
| **M1** | ✗ | **Dedo arrastando o ATIRAR: a bala sai pela retícula do quadro ANTERIOR.** A 4 px/quadro (≈ 44 °/s): 0,733° = **3,25 px** (V3) / 3,00 px (V2) = **12,8 cm a 10 m, 64 cm a 50 m**; a 10 px/quadro: 1,833° = 8,1 px = **160 cm a 50 m**. Em ADS: fuzil 0,50° (43 cm a 50 m), DMR 0,22° (19 cm). Igual no hitscan (solo) e no projétil do BR, nas 7 armas de fogo. **Andando de lado no talo: 8,7–9,7 cm constantes** (quadril; 5,8–6,1 cm em ADS) = 2,3 px a 10 m. **Bazuca:** converge (23,7 → 20,4 → 15,0 cm a 10/25/50 m no quadril; 12,0 → 7,6 em ADS) em vez de voar paralela. Parado: ≤ 0,11 px / ≤ 0,42 cm no 1º tiro (o resto é o recuo do 2º tiro em diante). | `camera.matrixWorld` do quadro do disparo, recalculada depois do tick, projetada no canvas; `Math.random` fixo e `recoilP = 0` só no quadro do tiro (espalhamento e recuo zerados). `angRaioVsCamAntes = 0,0000°` em todos os tiros: o raio É a câmera do quadro anterior. Causa: `shootUpdate` (game.js:4090) roda antes de `applyTouchLook` (game.js:4162), e a posição da câmera só é escrita em `applyFpsCamera` (game.js:2111) — origem e direção atrasam um quadro. |
| **M2** | ✓ | Medido no VOO (trilha da bala no `brTick`): fuzil **720 m/s → 0,139 s, 7,6 cm**; DMR **800 → 0,125 s, 4,7 cm**; sniper **850 → 0,118 s, 5,0 cm** a 100 m. | posição da bala amostrada por quadro do rAF (sonda troca `MP.rayBlockedAt` por um gravador sem obstáculo). **Reinjeção** (`multiplyScalar(200)`): 200 m/s, 0,50 s, 84 cm → vermelho. |
| **M3** | ✓ | 100 % no menu = **0,18335 °/px**; 200 %/100 % = **2,00001**, 50 %/100 % = 0,50000; 120 px a 30/60/120 Hz = **22,0016°** nos três (diferença < 1e-13); 1 evento × 120 eventos: idênticos; soltar: 7e-21 rad; 10 px × 100 px: razão **10,000**. | valor lido do `<output>` do menu, ângulo de `camera.quaternion`. **Reinjeção** (`× dt·60`): 44,0° / 22,0° / 11,0° → vermelho. |
| **M4** | ✓ | R(ADS)/R(quadril) = **1,0000–1,0003** em 9 miras de 6 armas (alça, red dot, luneta 2x, lunetas DMR/sniper, holográfica, abertas). Correndo (85°): 0,837 (declarado, sem portão). | ponto do mundo a 30 m e 2° do centro, projeção do three antes/depois de 20 px. **Reinjeção** (degrau 0,75/0,36): red dot 1,29, DMR 1,20, 2x 0,85 → vermelho (bate com a tabela da referência). |
| **M5** | ✓ | razão vertical/horizontal **0,6000** (menu 60 %), controle separado existe; 16 direções: erro máx **1,1e-13°**. | `camera.quaternion`. **Reinjeção** (razão 1): 1,00 → vermelho. |
| **M6** | ✗ | **Na nave, retícula com opacidade 1 e `#hud` visível, com `__BR_freeze = true`** (o `shootUpdate` retorna antes de qualquer tiro). Retícula visível sem tiro possível. Demais estados (voando, queda, espectador) não medidos. | estilo computado de `#crosshair` e `#hud` em `startBRMatchInShip` (`m6.js`). |

### A — Assistência de mira

Efeito = câmera com a assistência LIGADA menos DESLIGADA pelo menu. Como a
câmera também recebe recuo residual entre rodadas, o efeito foi **atribuído**
embrulhando `AimAssist.step`: conta-se o quadro em que o núcleo devolveu giro
diferente da entrada (ou `fire`).

| | veredito | medido | âncora / como |
|---|---|---|---|
| **A1** | ◌ | (b) mouse e caneta no `#tcLook` e mouse no ATIRAR: **0 quadros** em que o núcleo agiu; (d) 3 s sem entrada com alvo cruzando: **0**; (e) morto, pausa, nave/queda, cinemática, espectador, menu, carro, helicóptero: **núcleo nem chamado**. Controle positivo (dedo): 0,463°, 82 de 92 quadros. **(c) sessão XR não medida.** | alvo = avatar remoto real (`BotHost`); atribuição no `step`. |
| **A2** | ✗ | **Atrás do CAMINHÃO MILITAR parado: 20 de 30 casos com 0 px visíveis em que a assistência age — e o tiro automático dispararia** (11/16 em pé, 9/14 com o atirador agachado); **sob copa vista de cima: 1 de 1** caso com 0 px; varredura aleatória no mapa: **3 de 32** casos com 0 px (a 10,8, 44,9 e 51,7 m). Controle positivo: 88 casos com > 50 px e assistência agindo. | **dois renders do mesmo quadro** (com e sem o alvo, tempo parado), pixels que mudam na caixa projetada das esferas; veredito do núcleo real com o `los` real do jogo. Causa: o `los` da assistência é o `rayBlockedAt`, que conhece terreno, paredes e troncos — não veículo, não copa. Mato: **não exercitável** — nenhum alvo do jogo agacha/deita (B10). |
| **A3** | ✓ | Quadril, 10 e 30 m: efeito até **2,8°** da borda, nenhum a **3,0°**; ADS do fuzil (55°, teto 3,0 × 0,678 = 2,03°): efeito até **2,0°**, nenhum a 2,5°. (60 m sem controle positivo: o relevo escondia o alvo.) | cruz posta X° fora da borda angular da silhueta (busca binária), arrasto afastando. **Reinjeção** (margem sem escala de FOV): ADS vai a **2,8°** → vermelho. |
| **A4** | ✓ | ρ ∈ **[0,00; 0,300]** em todo quadro; cruzamentos com = sem (**4 = 4**) a 5, 30 e 60 °/s; alvo parado: pull **0**. | rastreio de 600 quadros, vai-e-volta a cada 2 s. Sem reinjeção do "ímã" (ressalva). |
| **A5** | ✗ | (c) alvo a 30 °/s, dedo = cópia do movimento do alvo atrasada 150 ms: **a 20 m o erro médio PIORA com a assistência — 4,64° com × 4,34° sem (+7 %)**; a 10 m melhora (3,96° × 4,34°). (a) arrasto rumo ao alvo: giro igual (0,0304 rad nos dois) ✓; (b) 60 °/s a 8 m: 0,233 s nos dois ✓; (d) um boneco a 15 m cruzando na frente do alvo a 30 m tomou a assistência por 10 quadros e ficou com ela — cenário ambíguo (ele cobre o alvo), não conto. | erro angular cruz × centro do alvo, quadro a quadro. |
| **A6** | ✗ | **`localStorage.setItem` que lança derruba o BOOT**: `QuotaExceededError` não tratado e `window.__game` nunca aparece (90 s). Causa: `persistSettings()` sem `try` no primeiro boot (game.js:347, commit `560d599` — anterior a esta rodada). Resto ✓: chave desligada = núcleo com **0 chamadas**; desligar grava `touchAssist: 0`; faca e bazuca **0**; DMR/sniper 0,274° contra 0,463° do fuzil. A lista de armas está escrita em `js/aimassist.js` (`WEAPON_ASSIST`). | `ls-throw.js`: `getItem → null`, `setItem → throw` (Safari privado antigo / cota cheia). |
| **A7** | ✗ | (a) **Com a assistência agindo, a bala sai 0,26° fora da retícula do quadro do disparo — 1,16 px** (e 0,87 px), exatamente o giro daquele quadro (dedo + pull). (b) ✓ 5 s com × 5 s sem, laço real: mesmos eventos e campos (`state`, `shotFired`, `pingx`). (c) ✓ `security-regression` 9/9. | igual M1; (b) embrulhando `socket.emit` no rAF real. |
| **A8** | ✗ | (a) ✓ padrão **Desligado** (select `0`, `cfg.autoFire false`); (b) **✗ dispararia nos 20 casos do caminhão e no da copa (0 px)**; (c) ✓ 0 tiros a 75 m; (d) ✓ faca, bazuca, DMR, sniper: 0; (f) ✓ fuzil a 20 m: 3 tiros, 1º a 0,217 s (≈ 2 quadros depois de a cruz entrar na silhueta). | âncora de pixels de A2. |

### C — Controles e HUD

| | veredito | medido | âncora / como |
|---|---|---|---|
| **C1** | ✗ | (a) ✓ ATIRAR × `#tcLook`, mesmo arrasto: diferença **0,0017 %** (recuo lateral descontado por controle sem arrasto); (b) ✓ fuzil 5/5, DMR 1/1 com 60 quadros de arrasto; (c) ✓ 300 px saindo do botão: 0,40 %; (d) ✓ k = 0: giro líquido −5,5e-6 rad, 5 tiros; (f) ✓ 2º ATIRAR: 0,0019 %. **(e) três dedos em 0,5 s: andou 1,82 m < 2 m** (girou 0,29 rad, subiu 1,66 m, 5 tiros, soltar ⇧ não soltou os outros). O limiar de 2 m não tem fonte na régua; o tiro corta a corrida (`!mouse.shooting`) e o ⇧ põe o boneco no ar. Vermelho na letra, prioridade baixa. | `camera.quaternion`, `gun.mag`, `player.pos`. |
| **C2** | ✗ | **12 botões do cluster com quadrado útil de 40 px** (48×48 com `border-radius: 14px` — os cantos não recebem toque) em V1, V2, V3, V4; **8 com 42 px** em retrato liberado; V5 ✓ (66 px). Lobby: presets de cor **22 px**, cores **34 px**, checkboxes de regra **20 px**. Ajustes ✓ (18 controles ≥ 44 depois de rolar). | grade de 2 px de `elementFromPoint`, maior quadrado contido; tudo rolado para a vista antes de medir. |
| **C3** | ◌ | Em partida a pé — vazia, cheia (5 entradas de killfeed, 7 de chat, dica, `#prompt`, `centerMsg`) e com inventário aberto: **0 px²** e nenhum controle tampado em V1–V5 e retrato. Nave, queda, morte, espectador, carro, helicóptero: não medidos. | `getBoundingClientRect` + `elementFromPoint`. |
| **C4** | ✗ | **Chat aberto no celular: placeholder "Enter envia · Esc fecha" visível** (V1, V2, V3, retrato). Lobby, ajustes, partida, dica da nave ("botão ⇧"): 0 ocorrências. | varredura de nós de texto com retângulo visível + atributo `placeholder` do campo focado. Escapou da correção `205b0c3`. |
| **C5** | ✓ | **Pipeline real** (`touchscreen.tap`, 271 pontos de canvas nu a cada 32 px, DMR): **0 tiros, 0,000° de giro**; o `mousedown` é engolido em captura (só `click` chega). **Dublê declarado** (4 343 pontos a cada 8 px, variantes "Chrome" e "Safari"): 0 tiros, 0 giro. Toque na área vazia do overlay de pausa: retomou, **0 tiros, 0 giro**. Segurando o ATIRAR e tocando o canvas a cada 100 ms: 10 tiros com e sem os toques extras. | **Reinjeção** (sem o `engolirCompat`): **146 tiros em 271 toques** → vermelho. |
| **C6** | ✓ | erro máx **0,216°** em 16 direções × meia/total deflexão; velocidade monotônica em 8 patamares até 0,84 (0,177 → 4,254 m/s), corrida 7,62/8,60; zona morta efetiva ∈ **(0,1200; 0,1225]**. | `player.pos` num ponto sem obstáculo; vista em yaw 0. **Reinjeção** (quantização por `Math.round`): 22,5° a 22,5° → vermelho. |
| **C7** | ✗ | **7 toques** no ⇄ no pior par das 8 armas; tocar a arma em `#slots` cai no **canvas** (`#game`) — não troca. | `gunIndex`. |
| **C8** | ✗ | **14 botões sempre na tela**; USAR, COMER, KIT e GRANADA visíveis com 0 carne, 0 kit, 0 granada e nada ao alcance. | estilo computado. |
| **C9** | ✗ | **Não existe "restaurar padrão"** na seção de toque; e o `localStorage` que lança derruba o boot (A6). ✓ alcançável na pausa (`btnSettings` tocável), 7 controles presentes, obedecidos (M3/M4/M5/C1 pelo menu), gravados; rola por toque no `#overlay` em 360–390 px. | DOM. |
| **C10** | ✗ | **Abrir o chat com os dedos no analógico, ATIRAR e ⇩: nada é solto** — `ControlLeft`, `shooting`, `aiming` seguem ligados e o boneco **anda 1,275 m em 0,5 s**. **Morte:** `ControlLeft`/`shooting`/`aiming` seguem ligados. **pointercancel de todos os dedos:** a MIRA (alternada) segue ligada. ✓ blur, aba escondida, pausa, entrar/sair do carro **pelo USAR** com o analógico no talo (nada preso), virar para retrato. Fim da cinemática com o dedo ainda no gatilho volta a atirar — é o que E11 exige; a régua se contradiz aí, não conto. | `keys`, `mouse`, `.on`, deslocamento em 30 quadros. |

### B — Bots (caminho real: `server.js` + `scripts/bots.js` pela flag do anfitrião)

**Arena:** 4 humanos-dublê por socket (estado a 10 Hz, como o `br-game.js`),
8 bots pela flag + 8 de um 2º processo do MESMO `scripts/bots.js` (20 jogadores
na sala), gás desligado, golem/animais/zumbis/alien desligados. **A cobertura é o
relevo:** o humano espera 8 m abaixo do chão (bot e cliente não veem através do
terreno) e sobe para a frente do bot — **t0 = o estado de superfície enviado**.
Disparo "contra o humano" = acerto com `targetId` dele, ou erro cuja reta passa a
< 2 m do rosto e termina ~12 m depois (assinatura do `buildMissShot`). Dano
contado no socket da vítima (`youWereHit`). Duas rodadas (3 + 12 min) e uma de
re-exposição (6 min), 2026-09-27 18:56–19:35 (UTC).

| | veredito | medido |
|---|---|---|
| **B1** | ✗ | **Engajamento novo ✓**: 57 engajamentos, 1º disparo mín **1,365 s**, mediana 2,74 s (um caso a 0,178 s descartado: o bot atirava num alvo que passava rente ao humano e se afastou dele, sem dano). **Re-exposição ✗: o humano some 2 s no relevo e reaparece no mesmo ponto → 25 de 34 com 1º disparo < 1,3 s (mín 0,41 s, mediana 0,72 s).** Causa (leitura): `updateEngagement` só reinicia o atraso de ataque se o alvo sumiu há mais de `REACQUIRE_S = 3` s. Reinjeção (reação 0, atraso 0): 17 de 19 abaixo de 1,3 s → vermelho. |
| **B2** | ✗ | **Novo ✓**: 51 engajamentos, 0 violações, folga mín 1,27 s. **Re-exposição ✗: 19 de 29 com 1º dano antes do limite** — escopeta a 14,5 m acerta em **0,41–0,53 s** (limite 2,76 s); DMR/sniper a 29,6 m em **1,91–2,67 s** (limite 3,23 s). Causa: a janela de erro só rearma após `MISS_DEBOUNCE_S = 3` s sem atirar. Reinjeção (janela 0): 4 violações → vermelho. |
| **B3** | ◌ | (a) fuzil a 30 m: **11,23 s e 11,57 s** (2 mortes; 2 engajamentos sem morte em 14 s) — acima de 6,0 s; DMR a 30 m 9,4–13,7 s; escopeta a 15 m mediana 7,48 s. (b) 80 m, (c) 4 bots em arco e pontaria máxima semeada: não medidos. |
| **B4** | ◌ | 1 cenário de grupo formado (2 bots), 0 acertos. Não medido. |
| **B5** | ◌ | Nenhum par rival a 6–15 m formado na rodada. Não medido. |
| **B6** | ✗ | **Relevo real da seed 424242: dos 12 164 pares humano/bot que o terreno do CLIENTE esconde (cabeça e tronco), o bot enxerga 54 (0,44 %)**; contra marcha fina de 5 cm, 149 de 12 303 (1,21 %) — a marcha de 2 m do bot pula cristas finas. `lineOfSight` exportado × terreno do `rayBlockedAt` do cliente, mesmo `heightAt`. **Perseguição ✓**: 23 de 23 fugas terminaram mais perto da última posição vista (0 m) que da atual (30 m). |
| **B7** | ✗ | `lineOfSight(terrain, from, to)` **não recebe geometria nenhuma além do heightmap** — prédio, rocha e castelo são transparentes para o bot (o `37b5ca5` declara "P3 fora desta entrega"). Não medido ao vivo. |
| **B8** | ◌ | (a) ✓ humano parado e calado a 7 m nas costas: **0 disparos em 35 engajamentos** enquanto fora do cone (3 entraram no cone por patrulha); reinjeção (cone 360°) → 17 de 20 atiraram (0,51–0,91 s). (b) e (c) não medidos. |
| **B9** | ◌ | Não medido (≥ 500 disparos por lado). |
| **B10** | ✗ | O `state` do cliente não tem postura (br-game.js:1944) — o bot não sabe se o humano está agachado/deitado. |
| **B11** | ✓ | Erros mirados no humano: **129 na rodada longa, 88,4 % (114) na faixa** e 40 de 41 na curta — a reta desenhada a 0,42–1,5 m do olho e o ponto de maior aproximação a 1,2–2,0 m do pé; **0 abaixo de 0,42 m**. Âncora: o que o cliente desenha (`toPos + 1 m`, br-game.js:1705). Reinjeção (sem o `− 1`): **11,7 %** → vermelho. |
| **B12** | ✗ | (a) ✓ com o `scripts/bots.js` real e sem `three`, o log do servidor mostra `[bots] terreno indisponível: Cannot find package 'three'…`; (b) ✓ numa `node_modules` só com o fecho de `dependencies` (104 pacotes, reconstruída do `npm ls --omit=dev`; o `npm ci --offline` falhou por cache): terreno de pé, `h(0,0) = 2,530`, **34 baús**; tirar o `three` faz `createBotTerrain` rejeitar. **(c) ✗**: sem terreno o bot enxerga através de tudo (`lineOfSight(null) → true`) e isso não está escrito nem testado em lugar nenhum — o único teste com `terrain: null` o usa como "chão plano". |

### D — Desempenho e invariantes

| | veredito | medido |
|---|---|---|
| **D2** | ◌ | 174 draw calls p50 (167–257) na entrada do BR em V3 — **com mundo de 6,7 s**, não os 20 s do protocolo de `091d5a7`; não comparável. Solo e combate controlado não medidos. |
| **D3** | ◌ | 600 quadros de olhar + assistência: **0 `Object3D` criados**; 600 arrastando o ATIRAR: 12 (FX do tiro). **A assistência não agiu na sonda** (formato 9 do CLAUDE.md) e `Vector3`/`Quaternion`/… não foram contados. |
| **D4** | ✓ | Retrato do mundo (castelo, 21 sítios, clareiras, vagas, inimigos, boss, alien, 5 alturas) **idêntico entre desktop e `?mobile=1` V3, e igual ao retrato pré-fatiamento de `test/carregamento-determinismo`**. Reinjeção (`Math.random()` extra só no celular antes das estruturas): castelo 250,03 → 365,72 → vermelho. "Depois de 60 s de jogo" não medido. |
| **D5** | ✓ | 16 bots + 4 humanos, 12,5 min: intervalo entre estados de bot **p50 100 ms, p99 102 ms, 99,93 % ≤ 150 ms** (35 299 amostras). A duração do `tickBots` foi inferida (um tick ≥ 100 ms apareceria como intervalo > 100 ms), não instrumentada. |
| **D6** | ✗ | 4G emulado (9 Mbps / 40 ms), V3: **16,62 MB totais** (213 requisições) **> 15,03 MB**; arma equipada pronta com **4,10 MB** ✓ (≤ 5,25). JS 2,44 MB (era 1,54), GLB 14,06 (era 13,41). Esta rodada acrescenta ~35 kB de JS; o resto veio de rodadas anteriores. |

### E — Estados (percurso por toque, sem `forceStart`/`startBRMatch`/`QA.reset`)

Página crua (sem as bandeiras do harness), servidor real, 4 bots, V3; botões DOM
por `page.touchscreen` (pipeline real), controles de jogo por `PointerEvent`,
texto por `Input.insertText` + Backspace (teclado virtual). O `<select>` de bots
e de gás recebeu `value` + `change` (o seletor nativo não abre no headless) —
declarado.

| | veredito | medido |
|---|---|---|
| **E1** | ◌ | (b) ✓ MULTIJOGADOR → lobby → nick "Validador" digitado → preset de cor → código do anfitrião → bots 4 → INICIAR, tudo por toque; sala com os bots; partida começou na nave. (a) solo, (c) 360 px, (e) retrato no lobby: não percorridos. |
| **E2** | ✓ | Na nave: 100 px de arrasto giram **−18,33°**; ⇧ leva SHIP → FALL **no mesmo quadro** (0 quadros); a dica cita "botão ⇧". Reinjeção (sem `jump` no `KEY_OF`): fica em SHIP 30 quadros → vermelho. |
| **E3** | ✗ | **Na queda e no paraquedas, o analógico no talo em 8 direções move o jogador 0,00 m** (0,4 s por direção). `fallStep` (br-game.js:871) lê só `KeyW/A/S/D`; o analógico a pé não emite tecla (só dirigindo). **A dica do paraquedas diz "analógico pra planar"** (texto trocado por `205b0c3`). Pouso ✓: controles a pé voltam (2,08 m em 0,7 s). |
| **E4**, **E5**, **E8**, **E11** | ◌ | Não percorridos. (Entrar/sair do carro pelo USAR foi medido em C10, sem o carro andando.) |
| **E6**, **E7** | ◌ | A morte foi induzida por dano direto (`playerDamage`); a tela que apareceu foi a do SOLO ("reiniciando… JOGAR DE NOVO / VOLTAR AO MENU") junto do cartão "VOCÊ FOI ELIMINADO", e em 5 s o espectador não abriu. Como a causa foi injetada, não afirmo defeito — fica para morte real. |
| **E9** | ◌ | ≡ pausa ✓; ajustes alcançáveis ✓; toque na área vazia retoma sem tiro nem giro ✓ (C5). "Sair da partida": o menu de pausa do BR mostra só MULTIJOGADOR e CONFIGURAÇÕES — não verificado. |
| **E10** | ✗ | Virar para retrato com o dedo no analógico: pausa, aviso visível, nada preso ✓. **Retrato liberado: C2 falha (8 botões com 42 px).** Dirigindo: não medido. |
| **E12** | ◌ | 0 `pageerror` e 0 `console.error` no trecho percorrido (E1–E3, E9, E10); percurso incompleto. |

---

## 3. Defeitos novos, com reprodução mínima

Ordem = impacto na queixa do dono ("bots apelões, mira ruim, jogabilidade do
celular longe do AAA"). **[NASCEU DE CORREÇÃO]** = introduzido por um commit
desta rodada.

1. **Bot que já te viu atira e acerta na hora quando você reaparece (B1/B2).**
   Esconda-se ≤ 3 s e volte ao mesmo ponto: 1º disparo em 0,41–0,79 s, 1º dano
   da escopeta em 0,41 s a 14,5 m. O ciclo "sai da cobertura, atira, volta" é o
   tiroteio normal de BR — é onde o jogador sente o bot apelão. As proteções
   novas (`REACTION_S`, atraso de ataque, janela de erro) só valem no PRIMEIRO
   contato; `REACQUIRE_S = 3` e `MISS_DEBOUNCE_S = 3` as desligam por 3 s.
   *Não nasceu de correção (antes era instantâneo sempre); é a correção
   incompleta.*
2. **A bala sai pela retícula do quadro anterior quando o dedo mexe (M1, A7).**
   Arraste o ATIRAR a 44 °/s: 0,73° de erro = 64 cm a 50 m, o mesmo que errar a
   cabeça por uma cabeça e meia. O ATIRAR que gira (`cd362af`) e a assistência
   (`c585806`) giram a câmera exatamente no quadro do disparo, e `applyTouchLook`
   roda depois de `shootUpdate`. **[NASCEU DE CORREÇÃO: a parte da assistência,
   A7(a) — código novo de `c585806` posto depois do tiro]**. Mesma família:
   andando de lado, a origem atrasa 8,7–9,7 cm (posição da câmera escrita só em
   `applyFpsCamera`).
3. **Não dá para dirigir a queda nem o paraquedas no celular (E3).** 0,00 m em
   8 direções. **[NASCEU DE CORREÇÃO: a dica "analógico pra planar" veio de
   `205b0c3` e promete uma ação que não existe]** — o defeito de fundo é de
   `7e17fd8`.
4. **Assistência e tiro automático agem em quem está escondido atrás do
   caminhão militar e sob copa (A2, A8).** 20 de 30 posições atrás do caminhão
   com 0 px visíveis: a cruz é puxada e o automático (se ligado) atira. O `los`
   da assistência é o `rayBlockedAt`, que não conhece veículo nem folhagem.
   **[NASCEU DE CORREÇÃO: `19ca181`/`c585806`]**
5. **A assistência piora o rastreio a 20 m (A5).** Jogador que segue o alvo com
   150 ms de atraso: 4,64° com × 4,34° sem. **[NASCEU DE CORREÇÃO: `19ca181`]**
6. **Bots enxergam através de prédios (B7)** e, em 0,44 % das geometrias de
   crista, através do relevo (B6).
7. **Trocar de arma custa até 7 toques; 14 botões sempre na tela (C7, C8).**
8. **Botões do cluster com 40 px úteis (C2)** — 48 px com cantos de 14 px de raio;
   lobby com alvos de 20–34 px.
9. **Abrir o chat não solta nada (C10):** o boneco segue andando (1,275 m em
   0,5 s), atirando e agachado enquanto o jogador digita.
10. **"Enter envia · Esc fecha" no chat do celular (C4).**
11. **`localStorage.setItem` que lança derruba o boot (A6/C9)** — `game.js:347`,
    anterior a esta rodada; sem "restaurar padrão" nos ajustes de toque.
12. **Retícula visível na nave, sem tiro possível (M6).**
13. **Bazuca converge (M1)** — 23,7 → 15,0 cm entre 10 e 50 m no quadril: zeragem
    pelo primeiro obstáculo, que o CLAUDE.md chama de proibida.
14. **Boot passou de 15,03 MB para 16,62 MB (D6)** — quase tudo de rodadas
    anteriores.
15. **B12(c):** o comportamento "sem terreno o bot vê através de tudo" não está
    escrito nem testado.

**Fora da régua, observado e não investigado:** um `new THREE.Object3D()` logo
após `const __mobile` (game.js:312), só no celular, **não** deslocou o mundo — o
invariante do CLAUDE.md ("todo `Object3D` consome 4 números do `Math.random`
seedado") não vale nesse ponto do boot (o `Math.random()` explícito antes das
estruturas desloca). Registrar antes que alguém confie nele.

**Contagem:** 15 defeitos que reprovam; **4 nasceram de uma correção desta
rodada** (itens 2-parte A7, 3-dica, 4, 5).

---

## 4. Testes existentes que passam por acidente (com o mutante que prova)

1. **`test/br-mira-projetil.test.js` — velocidade.** Com `__BR_ballistics`
   lançando a **200 m/s** (a velocidade medida no voo cai para 200 m/s, 0,50 s e
   84 cm a 100 m), o arquivo passa **2/2**. O caso lê `gun.projSpeed` da tabela
   e faz a conta no teste (formato 2: o produto medido com a régua do produto).
2. **`test/touch-controls.test.js` — taxa de quadros.** Com o delta do olhar
   multiplicado por `dt·60`, o arquivo passa **45/45**; a sonda mostra 44°/22°/11°
   a 30/60/120 Hz. Todos os casos rodam num `dt` só.
3. **`test/br-mira-projetil.test.js` — alinhamento.** Verde hoje com o erro de
   0,73° do dedo em movimento: congela a câmera ANTES do tick do disparo e mira
   parada (formato 9: o cenário não exercita o defeito).
4. **`test/aim-assist.test.js` — "alvo escondido".** Verde hoje com a assistência
   agindo em 20 alvos invisíveis atrás do caminhão: o esconderijo do teste é um
   bloco em `Structures.walls`, que é justamente o que o `rayBlockedAt` do produto
   conhece.

Para contraste: o mutante de quantização do analógico (C6) **foi** pego pela
suíte — pelo caso de meio curso ("ANDA sem correr"), não pelo de direção.

---

## 5. Prioridade do que reprovou

1. **B1/B2 re-exposição** — é o "bot apelão" do tiroteio real.
2. **M1/A7** — ordem do quadro: girar a câmera pelo toque ANTES do disparo.
3. **E3** — dirigir a queda pelo analógico (e a dica que mente).
4. **A2/A8/A5** — visibilidade da assistência (veículo, folhagem) e o efeito
   negativo a 20 m; o tiro automático não pode ser ligado enquanto A2 falhar.
5. **B7** — paredes na visão do bot.
6. **C7/C8/C2** — troca de arma em um toque, botões contextuais, alvo útil ≥ 44 px.
7. **C10/C4** — chat que solta os dedos e placeholder sem tecla.
8. **A6/C9** — boot à prova de `localStorage`; "restaurar padrão".
9. **M6, bazuca, strafe de 9 cm, B6, B10, B12(c), D6, C1(e)**.

E os **18 não medidos** — em especial A1(c) XR, B3(b)(c), B4, B5, B9, D2, D3,
E4–E8, E11 — precisam de rodada própria antes de qualquer placar de aprovação.
