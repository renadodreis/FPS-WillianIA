# Validação do porte para CELULAR — commit `2224bf5`

Quarta rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62). Autor: o **validador** — não escreveu
código de produto nem teste do repo. Nada foi commitado.

**A régua mudou antes de medir, e quem a mudou fui eu**, com as decisões do dono
de 2026-09-28/29 escritas no próprio texto: **C10** (*"já entra dirigindo"*),
**P3** (os bots também não acertam quem está no helicóptero), critério NOVO
**V1** (*"carro pode segurar tiro, mas não pra sempre"*) e **B7** reescrito
(*o principal: "bots atirando através de parede"* — todas as coberturas e o
avesso). Sem mudança de régua: agachado no mato pode aparecer; P1 segue como
está. Total **70**, denominador honesto **63**. Uma frase de V1(d) foi ajustada
antes de qualquer medição (o servidor deste jogo não confere linha de visada em
dano nenhum; V1 passou a cobrar paridade com o dano em jogador) — o motivo está
no critério.

---

## 0. Condições

- **Árvore:** `dev` em `2224bf5` (o deployado). `git status` antes e depois: só
  a régua (`M docs/mobile/criterio-aaa.md`, edição minha) e ESTE arquivo (não
  rastreado). Mutantes numa **cópia** fora do repo, restaurados por `sha256`.
- **Carga:** 1 min entre **2,3 e 4,5** em 12 núcleos durante as medições (o
  começo da rodada encontrou a máquina saindo de 9,1 em 15 min e esperou cair);
  `ps` sem `run-tests`/`node --test`/`server.js` alheio antes de cada uma.
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360 (a classe do S22 do dono), V3 844×390;
  `hasTouch`, `isMobile`, DPR 2, `?mobile=1`. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`) com o laço no
  rAF para C10, M7, C11, P1, P3, E15 e V1; bots pelo processo de verdade
  (`server.js` + `scripts/bots.js` pela flag do anfitrião, 16–24 bots, 4
  humanos-dublê a 10 Hz) em quatro arenas, **341 engajamentos**.
- **Portas:** 3980–3999. Exceção declarada: os testes DO CONSTRUTOR rodados
  contra mutantes na cópia usam as portas fixas deles (4032, 4120–4129 e as
  dinâmicas 50100+), com `ps` vazio.
- **Correção de sonda, e de uma afirmação minha em `070502f`.** A sonda de toque
  soltava o dedo ERRADO em multitoque: o `touchEnd` do DevTools leva o ponto que
  SAI, e ela mandava os que ficavam. Medido pelos `pointerup` (o do polegar saía
  quando o dedo do USAR subia). Consequência em `070502f`: a parte de C10 "sair
  do carro com o polegar no analógico — na página crua (E15)" não mediu nada (a
  parte medida pela outra sonda, com `PointerEvent`, valia). Corrigido nesta
  rodada e remedido (C10, E15).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  as anteriores (`bateria-r4.sh`) e as novas `r4-b7pares.js`, `r4-tela-diag.js`,
  `arena-r4.js` (coberturas, veículo trazido, veículo destruído, isca, heli),
  `r4-ancora.js` (âncora do cliente, depois da arena), `r4-c10.js`,
  `r4-c10b.js`, `r4-c10c.js`, `r4-v1.js`, `r4-v1-hitscan.js`, `r4-nexus.js`.

---

## 1. Placar

> **44 aprovados · 6 reprovados · 13 não medidos, em 63** (44/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `070502f` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | **2** (C1, C11) | 1 (C3) | 8 · 3 · 1 |
| B — bots (13) | 7 | **1** (B14) | 5 (B3, B4, B5, **B7**, B9) | 6 · 3 · 4 |
| P — PvE (4) | 3 | **1** (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1, nova) | 0 | 0 | 1 (V1) | — |
| D — desempenho (5) | 3 | **1** (D6) | 1 (D2) | 3 · 1 · 1 |
| E — estados (13) | 8 | **1** (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

Nos 62 critérios que já existiam em `070502f`: **44 · 6 · 12** (antes 42 · 9 ·
11). **Passaram a aprovar: C12, B2**; **B7 saiu de reprovado para não medido
completo** (0 violações em tudo que foi medido, N curto no caminho real — §2);
seguem reprovando C1, C11, B14, P1, D6, E9.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✗, E10 ✓, E11 ◌.

**Defeitos que reprovam e nasceram de correção desta rodada: 0.** Dois defeitos
de SEGURANÇA fora da régua nasceram de correções desta rodada (§4, itens 1 e 2;
detalhe fora do repo). Em `070502f`: 1. Em `6aeda6c`: 0.

`test/security-regression.test.js`: **28/28**. O furo do loot de morte segue
fechado.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente
(terreno + `Structures.rayHit` com veículos + obstáculos registrados) — não a
`clearSight` do bot. E, à parte, o que a TELA desenha (`Oclusao.tampa`, triângulos
da cena, sem grama).

### 2a. Caminho real (arenas)

O humano parado e calado ATRÁS da cobertura, bot armado a 8–40 m que o veria sem
ela; 12 s; cada disparo do bot contra ele classificado pela âncora do cliente no
instante do disparo (origem = `fromPos` do próprio disparo). "Válido" = cabeça E
tronco tampados para o cliente no t0.

| tipo | engajamentos | válidos | disparos com ele tampado | acertos/dano tampado | viradas p/ ele tampado e sem tê-lo visto |
|---|--:|--:|--:|--:|--:|
| (3) pedra | 12 | 12 | **0** | 0 / 0 | 0 |
| (4) árvore | 28 | 17 | **0** | 0 / 0 | 0 |
| (7) veículo inteiro (parado e TRAZIDO até o bot) | 29 | 29 | **0** | 0 / 0 | 0 |
| (5) cacto | 26 | 4 | **0** | 0 / 0 | 0 |
| (6) POI (tenda, mercado, refúgio, barril) | 8 | 4 | **0** | 0 / 0 | 0 |
| (1) cabana, torre, base, ruína | 9 | 9 | **0** | 0 / 0 | 0 |
| (1) prédio da cidade | 2 | 2 | **0** | 0 / 0 | 0 |
| (1) castelo | 0 | — | — | — | — |
| (2) Torre Nexus por dentro | 0 | — | — | — | — |
| (9) veículo DESTRUÍDO (avesso) | 2 | 2 | — | — | (bot a 51–80 m: sem controle) |

**0 disparos, 0 acertos e 0 viradas contra humano tampado em 77 engajamentos
válidos** (116 montados). Os disparos que houve (42) foram todos com o humano visível para o
cliente — o bot contornou a cobertura. As "viradas" contam só a transição
para o rumo do humano (≤ 10°) com ele tampado e sem ter sido visto antes; bot
que já estava de frente no t0 não conta. **N ≥ 10 foi atingido em pedra, árvore
e veículo; não em cacto, POI, prédio, castelo, Torre por dentro e no avesso** —
os bots quase nunca estão perto dessas coberturas (a isca que tenta trazê-los
até um prédio só funcionou 2 vezes em 12).

Por que cacto/POI têm poucos válidos: o cliente NÃO vê o cacto em 54 % dos
casos em que o bot vê (§2c) — o humano "escondido pelo bot" está visível para o
cliente, e o caso não entra.

### 2b. Pares geométricos (15 199 pares, semente 424242)

| tipo (sorteio dirigido) | pares | cliente tampa | **bot vê o tampado** | cliente vê | bot cego onde o cliente vê |
|---|--:|--:|--:|--:|--:|
| aleatório no mapa | 6 571 | 1 770 | **0** | 4 801 | 63 |
| pedra | 300 | 300 | **0** | 0 | 0 |
| árvore | 556 | 351 | **0** | 205 | 205 |
| cacto | 1 156 | 533 | **0** | 623 | 623 |
| tenda / mercado / barril | 90 | 77 | **0** | 13 | 13 |
| paredes (cabana, torre, base, ruína) | 272 | 268 | **0** | 4 | 0 |
| prédio da cidade | 164 | 138 | **0** | 26 | 0 |
| castelo | 85 | 69 | **0** | 16 | 0 |
| Torre Nexus por dentro | 6 000 | 3 824 (laje 3 460, pilar 286, **degrau 60**) | **0** | 2 176 | 0 |
| veículo (buggy, esportivo, caminhão, heli) | 346 | 236 | **0** | 110 | 0 |

**(8) guarda-corpo `noBullet`:** 39 pares cujo caminho cruza o guarda-corpo do
poço e que o cliente vê — o bot vê **39 de 39** (o avesso passa: a grade não
esconde de ninguém).

### 2c. O que a tela desenha e a bala não conhece (fora da letra de B7)

Pares em que a TELA tampa cabeça e tronco, a bala do cliente PASSA e o bot vê
(o bot atira, e a vítima aceita, porque ela usa a mesma bala do cliente). Malha
identificada pelo `Raycaster` do three:

- **castelo, 6 de 85:** a reta passa por CIMA de `castelo/foundation-back`
  (topo 10,58) e por BAIXO de `castelo/wall-back` (fundo 10,42), atravessando o
  piso do pátio desenhado entre as duas caixas (`RB_CourtyardFloor`,
  `RB_Wall_Left`). Caso rasante — humano embaixo, do lado de fora, bot no pátio;
- **adereços urbanos sem colisor** (`cityTrimMesh`, `cityProps` — floreira,
  hidrante, lixeira, postes): 4 de 208 perto dos esportivos;
- um adereço vermelho (cilindro) de uma atração do mapa, o mercado desenhado
  maior que o colisor, a parte baixa de uma pedra;
- **copa de árvore** (folhagem acima de 2,2 m): ocultação, não cobertura — a
  bala passa em qualquer jogo;
- guarda-corpo da Torre (as barras): de propósito (`noBullet`);
- a lataria desenhada do buggy 3–9 cm acima da caixa de bala.

E o avesso, que não é B7 mas é a mesma assimetria: **a bala do JOGADOR atravessa
cacto e árvore fina.** O `rayBlockedAt` do cliente marcha de 1,6 em 1,6 m; o
cacto tem 0,31 m de raio efetivo — a marcha pula por cima. Em 621 de 623 pares
em que o cliente "vê" através de um cacto, **a tela mostra o cacto na frente**.
O bot usa a consulta contínua e não atira ali; o jogador atira, e a vítima
aceita.

### 2d. Veredito de B7

**◌ — nenhuma violação em nada que foi medido** (0 de 77 engajamentos válidos no
caminho real; 0 de 7 571 pares tampados), e o que `070502f` reprovou (pedra: 33
de 41 pares) está fechado (**0 de 300**). Não fecha pela letra porque falta N no
caminho real para cacto, POI, prédio, castelo, Torre por dentro e o avesso — os
pares cobrem todos eles, mas a régua pede o processo de verdade.

---

## 3. Veredito por critério (com a comparação com `070502f`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 cm / 0,00 px a 10, 25 e 50 m nos 192 casos de arma de fogo**. Bazuca (régua do dono): origem a **0,00 cm da boca** lida no instante do `Rockets.fire`; afastamento constante (25,88–26,03 cm quadril, 13,08–13,09 cm mira) = boca↔eixo; paralelismo 0,000°. |
| **M2** | ✓ | ✓ | Fuzil 720 m/s → 0,139 s e 7,2 cm a 100 m; DMR 800 → 0,125 s, 4,8 cm; sniper 845 → 0,118 s, 4,8 cm. |
| **M3** | ✓ | ✓ | 0,18333 °/px; 200/100 = 1,99999; 30/60/120 Hz iguais a 5e-6; soltar 3e-17 rad. |
| **M4** | ✓ | ✓ | R(ADS)/R(quadril) = 1,0000–1,0003. |
| **M5** | ✓ | ✓ | razão 0,6002; diagonal 0,011°. |
| **M6** | ✓ | ✓ | Voando: 3 tiros a 0,00 cm a 10/25/50 m; nave/queda/paraquedas: opacidade 0. |
| **M7** | ✓ | ✓ | Toque real, laço no rAF: 0 % → 55,004° lento e rápido; 100 % → ganho 1,000 lento, 2,000 rápido; o mesmo arrasto (mesmos carimbos do evento) a 61 e a 43 quadros/s (e a 20, à parte): diferença 0,00–0,01 %; slider 30–250 %. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse e caneta: 0 quadros com o núcleo agindo; morto, pausa, nave, cinemática, espectador: 0 chamadas; controle 4,71°. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 disparos do automático**. |
| **A3** | ✓ | ✓ | Efeito até 2,8° da borda (quadril), 2,0° (ADS). |
| **A4** | ✓ | ✓ | ρ ≤ 0,300; cruzamentos com = sem; alvo parado: pull 0. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (20 m: 3,52° × 4,34°); (d) segue em conflito com A2. |
| **A6** | ✓ | ✓ | Faca e bazuca 0; DMR/sniper 1,70° × fuzil 4,71°. |
| **A7** | ✓ | ✓ | Tiro com a assistência agindo: 0 px; `security-regression` 28/28. |
| **A8** | ✓ | ✓ | Campo de tiro: 0 disparos; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | (e) três dedos em 0,5 s: **1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | ≥ 44 px em menu, ajustes (21), lobby (29), jogo, cheio, inventário (V1, V3). |
| **C3** | ◌ | ◌ | 0 px² em jogo, cheio e inventário; morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque; chat "escreva · toque 💬 para enviar". |
| **C5** | ✓ | ✓ | Grade real 280 pontos: 0 disparos (os 3 contados são troca de arma — a mesma leitura de `070502f`); dublê 4 455 pontos: 0. |
| **C6** | ✓ | ✓ | 0,198° em 16 direções; zona morta 0,1225. |
| **C7** | ✓ | ✓ | 1 toque nos 56 pares. |
| **C8** | ✓ | ✓ | Sem itens, escondidos; com itens, 1 quadro; 0 botões mudam de lugar. |
| **C9** | ✓ | ✓ | Restaurar padrão; 9 ajustes. |
| **C10** | ✓ | ✓ | **Régua nova ("já entra dirigindo"), toque real:** entrar no carro com o polegar no talo e outro dedo segurando o ATIRAR → o carro anda **5,18 m no 1º segundo** (12,1 m/s depois), **0 disparos** depois de entrar (pente 28 → 28), `shooting`/`aiming` falsos; helicóptero com o ⇧ apertado → **translada 6,45 m** pelo polegar e **não sobe** pelo ⇧ (0,50 m fixos desde o 1º quadro, a decolagem do pouso). Sair com o polegar ainda na tela: 0 m e nada preso. `pointercancel`, blur, aba, pausa, chat, morte: nada preso. **Reinjeção** (soltar tudo ao entrar): o carro anda 0,20 m e o helicóptero 0 → vermelho. |
| **C11** | ✗ | ✗ | (a) 4,943/5,189 = 95,3 %; (b) 0,5 → 54 %; **(c) a corrida liga a 0,824 do curso do dedo** (0,80 depois da zona morta); (d) ✓. Decisão do dono pendente. |
| **C12** | ✓ | ✗ | **Visitante: vermelha no 1º quadro** (25/25 px, motivo `inimigo`); jogador remoto a 20/40/50 m, lobo, esqueleto, zumbi, cabeça do golem: 1º quadro; branca no cervo, no disco, a 70 m e com 0 px; apaga em 6 quadros. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1** | ✓ | ✓ | Novo: 23, 1º disparo mín **2,35 s**; 1ª re-exposição: 55, mín **1,44 s**. |
| **B2** | ✓ | ✗ | **0 violações** em 22 novos e 55 re-exposições (e na 1ª re-exposição de 1 espiada de escopeta: 2,911 s ≥ 2,77). O caso de `070502f` (espiada de fuzil, 71 ms abaixo) não se repetiu — só 4 espiadas de fuzil nesta rodada, nenhuma com dano. |
| **B3** | ◌ | ◌ | DMR parado a 24 m: mediana 14,3 s; escopeta a 15 m: 7,3 s. Fuzil a 30 m, (b), (c): não medidos. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ✓ | ✓ | Relevo: **0 de 12 164** pares; perseguição: **24 de 24** mais perto da última posição vista (0–47,6 m) que da atual (30–61 m); 0 disparos na fuga. |
| **B7** | ◌ | ✗ | §2: **0 violações** em 77 engajamentos válidos e em 7 571 pares tampados (pedra 0/300, era 33/41); guarda-corpo `noBullet`: o bot vê 39/39. N curto no caminho real para cacto, POI, prédio, castelo, Torre e o avesso. |
| **B8** | ✓ | ✓ | (a) 23 humanos a 7 m nas costas: 0 disparos em 22; o 23º entrou no cone quando o bot virou patrulhando (63,6° < 78,4° a 11,1 m) e só então levou tiro. (b) cone a 45 m: viraram 4 de 12 em 1,8–2,2 s. (c) tiro visto a 50 m: **12 de 12** viraram em 1,0–1,1 s; de costas: **0 de 12**. |
| **B9** | ◌ | ◌ | Não medido. |
| **B10** | ✓ | ✓ | Agachado: intervalo mínimo 2,90 s (escopeta) e 3,20 s (DMR) × em pé 1,40 e 1,60 → **2,07× e 2,00×**; 22 de 24 agachados levaram dano (nunca some); `security-regression` 28/28. |
| **B11** | ✓ | ✓ | 95,8 % (228/238) rentes ao rosto; 0 abaixo de 0,42 m. |
| **B12** | ✓ | ✓ | O processo dos bots carrega terreno + paredes + obstáculos + a regra de veículo só com módulos puros (`js/obstaculos.js` e `js/veiculo-vida.js` importam só `js/paredes.js`); stderr herdado. |
| **B14** | ✗ | ✗ | **Fuzil a 24 m: 4 espiadores, 4 imunes** (0 de dano em 12 ciclos; 0 de 4 com dano entre a 3ª e a 6ª exposição). N ≥ 30 não alcançado: os bots quase nunca têm fuzil (24 bots, 3 arenas). Declarados: DMR a 24 m, 13, TTK finito em 8 (22,1–37,4 s; parado 14,3 s — 2,1×), 3ª–6ª em 10 de 13; escopeta a 15 m, 33, TTK finito em 15, 3ª–6ª em 18 de 33. 1ª exposição: 0 de dano em 51. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Duelo real a 20 m, fuzil a 80 % no corpo (47 acertos em ~59 disparos, ≤ 60 ✓): o ET cai em **7,76–7,78 s**; o jogador soma 100 do ET em **7,48 / 7,52 / 7,56 s em 3 de 6** duelos (nos outros 3, 90–93 quando o ET cai). Antes: 4 de 4 perdidos por 0,4–2,4 s; agora 3 de 6 por 0,2–0,3 s. DMR: 13,6–14,1 s × jogador 7,6–9,6 s (6 de 6 perdidos, declarado). O dono vai olhar depois. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes da cidade, 45 s cada: **927 golpes, 0 sem atacante do mesmo tipo com linha livre** (controle: 351). **Torre Nexus, solo (o relato "os seguranças atiram pela parede"):** jogador em 10 pontos da escada (lances A e B, andares 0–8), 40 s cada, os 8 executivos vivos: **562 acertos, 0 sem um inimigo com linha livre do cliente** — medido com os pontos do próprio tiro do inimigo (cano a 1,45 m; peito 1,5 m ou olho 1,62 m do jogador). (Uma 1ª versão da sonda, com o peito a 1,1 m, acusou 4 — era a sonda.) |
| **P3** | ✓ | ✓ | PvE: voando a 13,1 m, 45 s, bichos a 1,9–15 m: **0 golpes**; pousado com o motor ligado: 0; a pé: 716. **Bots (régua nova): 27 humanos com `heli` a 12 m do chão, bot armado a 25 m, 12 s: 0 disparos neles** (controle de frente, a pé, na mesma arena: 23 de 26 levaram tiro). |
| **P4** | ✓ | ✓ | 0 travessias em 57 corridas contra paredes finas (normal e CPU 6×); vãos: os mesmos de `070502f` (degraus da rampa do castelo, telhados de cabana), nada flutua na tela; o piso novo do saguão da Torre tem um canto 0,13 m acima do chão, dentro da casca. |

### V — Veículo *(nova)*

| | agora | medido |
|---|---|---|
| **V1** | ◌ | **(a)** alvo (avatar do anfitrião) atrás do caminhão, 0 px na tela: **fuzil 0 acertos no alvo e 13 na lataria**; DMR 0 e 4; **bazuca: estilhaço na lataria (`vehicleBlast`), 0 no alvo**; **hitscan (solo): soldado atrás do caminhão, 0 de dano, o caminhão perde 364**; controles ao lado: acertam (2 `shotHit`; soldado morto, 104). **(b)** bala de bot: 29 engajamentos com o humano atrás de veículo inteiro: 0 acertos. **(c)** vítima atrás do caminhão, o anfitrião reporta 2 acertos: **0 de dano**; do lado aberto (linha livre conferida no cliente): 52. **(d)** servidor: 100 `vehicleHit` no mesmo instante → vida 1 760 → 1 448 (**12 acertos/s × 26**); `fromPos` a 30 m do atirador: 0; atirador a 400 m: 0; `dmg: 999` ×10 → 260 (**teto de 26 por bala de fuzil**). **(e)** buggy zerado pelo anfitrião: a bala do jogador passa pelo buggy **no mesmo quadro** em que a página o vê queimando (0 ms); **explosão 5,01–5,09 s** depois da queima (6 veículos); a vítima atrás do caminhão já destruído levou 52. **Não medidos:** o bot voltar a atirar através do veículo que queima (a carcaça ficou longe dos bots nas 3 tentativas) e a morte de quem está dentro. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **230 draw calls p50** (222–253). Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: 0 `Object3D`. |
| **D4** | ✓ | ✓ | Retrato do mundo idêntico desktop × `?mobile=1`. |
| **D5** | ✓ | ✓ | 16–24 bots + 4 humanos, 4 arenas: p50 100 ms, **p99 102–105 ms**, 99,93–99,97 % ≤ 150 ms (≈ 165 000 amostras em 3 arenas). |
| **D6** | ✗ | ✗ | 4G emulado: **16,91 MB** (antes 16,84; limite 15,03); JS 2,71 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave (⇧ no mesmo quadro), queda (0,00°, 5,2 m), pouso. |
| **E4** | ◌ | ◌ | Frente pelo toque: 8,27 m/s; guinada e ré não medidas limpas. |
| **E5** | ◌ | ◌ | Chegar ao helicóptero só pelo toque: não percorrido (entrar/sair: C10). |
| **E6**–**E8** | ✓ | ✓ | Solo: JOGAR DE NOVO / VOLTAR AO MENU; espectador "botão ⇧ troca", ≡ 48 px → lobby; fim → lobby em 8,5 s → nova partida. |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). |
| **E10** | ✓ | ✓ | Retrato dirigindo com o polegar: pausa, nada preso. |
| **E11** | ◌ | ◌ | Não percorrido. |
| **E12** | ◌ | ◌ | 0 `pageerror` em E1–E3, E6–E8, E10, E15 (V1, V2, V3); E4/E5/E11 não percorridos. |
| **E15** | ✓ | ✓ | V2 e V1, da nave: pouso a 0,0–0,1 m do baú; 1º toque no USAR abre e **o item entra**; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque, 23 m, sai no 1º toque, e — **agora medido de verdade** — com o polegar ainda empurrando depois de sair, o boneco não anda (0 m) e nada fica preso. |

---

## 4. Defeitos NOVOS, com reprodução mínima

**[NC]** = nasceu de uma correção desta rodada.

1. **[NC] Um estado que o cliente declara, e o servidor não confere, tira o
   jogador do alcance dos bots.** Medido em arena local (30 casos, 0 disparos em
   quem deveria levar). Nasceu numa correção de bots desta rodada. Nenhum
   critério da régua cobre esse vetor. **Detalhe e reprodução fora do repo**
   (passados ao coordenador).
2. **[NC] A pose de um veículo no servidor pode ser movida por quem não está
   perto dele** — e o bot passa a tratá-lo como cobertura onde ele foi parar.
   Nasceu numa correção de veículo desta rodada. Detalhe fora do repo.
3. **Desenho sólido que a bala não conhece (§2c).** Castelo: 6 de 85 pares
   atravessam o pátio entre `castelo/foundation-back` e `castelo/wall-back`
   (rasante: humano embaixo, bot no pátio); adereços urbanos e de atração sem
   colisor; mercado desenhado maior que o colisor. O bot atira e a vítima aceita,
   porque os dois usam a bala do cliente. (O commit `2224bf5` registra a regra
   "desenho sólido barra bala".)
4. **A bala do JOGADOR atravessa cacto e árvore fina.** O `rayBlockedAt` marcha
   de 1,6 m em 1,6 m e pula o cilindro fino (cacto: 0,31 m de raio efetivo). Em
   621 de 623 pares em que o cliente vê através do cacto, a tela mostra o cacto
   na frente. O bot (consulta contínua) não atira ali; o jogador atira, e a
   vítima aceita. Pré-existente; ficou assimétrico quando o bot ganhou a consulta
   contínua (`876fa5b`).
5. Inalterados: **P1** (3 de 6), **B14** (fuzil 4 de 4 imunes), **C11(c)**,
   **C1(e)**, **D6**, **E9**.

**Observações sem veredito:** (a) a assistência na copa vista de cima: 17 de 22
alvos visíveis sem ajuda (era 10 de 20); (b) na
arena, a isca que tenta levar um bot até um prédio só funcionou 2 vezes em 12 —
os bots não perseguem quem aparece por 1,8 s.

**Contagem:** 6 critérios reprovados; **0 nasceram de correção desta rodada**;
2 defeitos de segurança fora da régua nasceram de correções (itens 1 e 2).

---

## 5. Testes que passam por acidente — e os mutantes

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| bot sem a consulta de obstáculos | pares: **270/351 árvore, 236/300 pedra, 321/533 cacto, 59/77 POI** vistos tampados | `bots-obstaculos` vermelho (5) |
| bot sem veículo na visada | pares: **151/218 veículos** | `veiculo-vida-bots` vermelho |
| guarda-corpo `noBullet` barrando a visada do bot | pares: bot cego em **39/39** | `torre-bala-escada` vermelho |
| bot volta a alvejar quem tem `heli` | (arena não repetida) | `bots-heli` 3 vermelhos |
| veículo sem vida continua barrando | (V1(e) não repetido) | `veiculo-vida-puro` vermelho |
| soltar tudo ao entrar no veículo | carro **0,20 m**, heli **0 m** → vermelho | `veiculo-toque` 2 vermelhos |

Sem mutante, os 9 arquivos do construtor: **90/90**.

- **Nenhum teste do construtor passou com o mutante.** O que falta é cobertura
  de ESTADO, não asserção fraca: nenhum teste cobre o cliente que mente sobre o
  estado que tira do alcance do bot (§4 item 1); `obstaculos-paridade.test.js` compara cliente e Node pelo mesmo módulo, e
  por isso não vê que a BALA do cliente pula o cacto (item 4).
- **A minha sonda errou nesta rodada, e o erro está no §0:** o `touchEnd` com os
  pontos que ficavam soltava o polegar no lugar do dedo do USAR. Pareceu "o carro
  não anda com o polegar" (0,69 m) até os `pointerup` mostrarem o dedo errado
  saindo. Com a convenção certa: 5,18 m.
- **A minha sonda de P3 (PvE)** continua não pegando o portão arrancado no BR
  (declarado em `070502f`); o teste do construtor pega.

---

## 6. Prioridade

1. **§4 itens 1 e 2 — segurança** (detalhe fora do repo). Nasceram nesta rodada.
2. **B7** — sem violação medida; o que falta é N: bots perto de prédio, castelo,
   Torre, cacto e POI no caminho real, e o avesso (bot voltando a atirar pelo
   veículo que queima). Junto, **§4 itens 3 e 4**: desenho sólido que a bala não
   conhece e a bala do jogador pulando cacto/árvore fina — é o "atirando através
   de parede" que o jogador VÊ.
3. **P1** — o ET ainda ganha 3 de 6 duelos por 0,2–0,3 s (o dono vai olhar).
4. **B14** — fuzil a 24 m: 4 de 4 espiadores imunes; e os bots quase nunca têm
   fuzil, então nem o N se alcança.
5. **V1** — falta o bot parar de respeitar o veículo que queima, medido no
   processo de verdade, e a morte de quem está dentro.
6. **C11(c)** (0,824 × 0,80: decisão do dono), **C1(e)**, **D6**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5, E11,
   E12.
