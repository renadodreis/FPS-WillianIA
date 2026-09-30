# Validação do porte para CELULAR — commit `d381d29`

Quinta rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63). Autor:
o **validador** — não escreveu código de produto nem teste do repo. Nada foi
commitado. **A régua não mudou nesta rodada**; a redação nova que proponho para
a "virada" de B7 (§2e) fica para o dono decidir.

Medido aqui o que entrou desde `2224bf5`: posse de carro e helicóptero pela pose
que o servidor conhece (`26f682c`); bala contínua contra obstáculo e colisor de
árvore = tronco desenhado (`cfa39d1`); acabamento urbano e piso do pátio do
castelo como colisor de bala, e a poda por blocos do `rayHit` (`6b6bd58`);
pedra pela malha desenhada (`e66d277`); cacto pela malha, barril e tenda até o
topo desenhado (`d381d29`); portas de teste (`fb300b1`).

---

## 0. Condições

- **Árvore:** `dev` em `d381d29` (= `hom` = `prod`). `git status` antes e
  depois: só ESTE arquivo (não rastreado). `npm run lint` limpo. Mutantes numa
  **cópia** fora do repo, restaurados por `sha256`; um instantâneo de `2224bf5`
  (`git archive`) só para comparar custo.
- **Carga — a pior condição de todas as rodadas, e não era minha.** A máquina
  teve, a intervalos, um trabalho de vídeo (`ffmpeg`, até ~10 núcleos), uma
  transcrição e a suíte `vitest` de outro repositório. Amostrada a cada 20 s das
  16h32 às 21h55 (968 amostras): carga de 1 min **mediana 4,2, p90 15,0, máximo
  23,8** em 12 núcleos. Cada artefato traz a carga do seu início; onde ela pode
  ter mexido num número, está dito na linha. `ps` sem
  `run-tests`/`node --test`/`server.js` alheio antes de cada medição.
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360 (a classe do S22 do dono), V3 844×390;
  `hasTouch`, `isMobile`, DPR 2, `?mobile=1`. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF)
  para C10, M7, C11, E15, V1 e os defeitos novos; bots pelo processo de verdade
  (`server.js` + `scripts/bots.js` pela flag do anfitrião, mais um processo de 16
  bots; 1 a 4 humanos-dublê a 10 Hz) em **nove arenas** (A–I), **736
  engajamentos**.
- **Portas:** 3980–3999. Exceção declarada: os testes DO CONSTRUTOR contra
  mutantes na cópia usam as portas deles (4150–4154 e dinâmicas).
- **Quatro correções das MINHAS sondas nesta rodada — todas medidas:**
  1. **A âncora de TELA das rodadas 4 e 5 via menos mundo do que o jogo
     desenha.** O harness tica sem renderizar: o que chega depois do último
     render (mercado, barris, veículos que assentaram) ficava com a
     `matrixWorld` velha, e o `Raycaster` e a `Oclusao` o liam na origem; e as
     árvores só são modelo cheio a < 70 m do JOGADOR (`rebucketTrees`), que na
     sonda fica onde nasceu. Nos mesmos 25 raios, a âncora velha não achou nada
     desenhado em 20 (árvore, mercado, barril, caminhão, buggy); a corrigida
     acha em todos. Corrigido: espera dos GLB, `updateMatrixWorld`, e o jogador
     levado — 300 m acima, para o corpo dele não tampar nada — para perto de cada
     trecho. **Consequência:** o que o laudo `2224bf5` escreveu a partir da TELA
     (§2c: "mercado desenhado maior que o colisor"; "cacto: o cliente não vê em
     54 %"; POI com poucos válidos) foi lido com a âncora cega e não vale. **As
     contas que decidem B7 nunca usaram a tela** — usam a bala do cliente, que
     não depende de render.
  2. **Um esconderijo que a arena escolhia era inalcançável:** o oco da fundação
     do castelo (entre o terreno e a laje, sob o pátio). 19 de 59 engajamentos de
     castelo caíram lá e estão fora da conta; a arena E passou a pôr o dublê NO
     pátio.
  3. **O dublê que chega correndo e agacha era repassado EM PÉ** por até 0,5 s —
     a regra do servidor (B10), correta. Nas arenas A–F o bot o via em pé e
     virava para ele com o rumo exato. A arena G espera 0,7 s parada antes de
     subir; os engajamentos agachados de A–F em que a cabeça em pé era visível
     para o bot estão fora da conta.
  4. **Na arena B o mesmo bot foi escolhido por dois dublês ao mesmo tempo em 47
     de 55 espiadas** (a trava de 14 s valia só na largada): o bot alternava
     alvos. B14 da arena B foi descartado; da arena C em diante o bot fica travado
     no engajamento inteiro (0 de 44 compartilhados).
  E uma sonda antiga que não corrigi e declaro: `r3-toque.js` solta o dedo com
  `touchEnd` VAZIO (a convenção errada que a rodada 4 corrigiu nas outras). A 61
  quadros/s não pesa; no laço estrangulado a 11–18 quadros/s o toque fica preso e
  os números do "estrangulado" saem lixo (ex.: 101° e −0,8° no mesmo arrasto
  linear). M7(c) foi medido pela `r3-m7c.js`, que solta certo.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `bateria-r5.sh` (as de sempre) e as novas `r5-invis.js` + `lib-tela.js`
  (pares, âncora de tela corrigida, parede invisível), `arena-r5*.js` (trilha de
  som, engajamento CALADO, registro de todos os tiros, bot travado, posse do
  helicóptero), `r4-ancora.js` (`TELA2`), `r5-b7-final.js` (agregação com os
  filtros e a isca de controle), `r5-dentro.js`, `r5-pedra-dentro.js`,
  `r5-pedra-cliente.js`, `r5-carro.js`, `r5-seg.js`, `r5-poda.js`,
  `r5-custo.js`, `r5-cs-custo.js`, `mutantes-r5.sh`.

---

## 1. Placar

> **43 aprovados · 7 reprovados · 13 não medidos, em 63** (43/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `2224bf5` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 6 | **2** (**B2**, B14) | 5 (B3, B4, B5, **B7**, B9) | 7 · 1 · 5 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 0 | 0 | 1 (V1) | 0 · 0 · 1 |
| D — desempenho (5) | 3 | 1 (D6) | 1 (D2) | 3 · 1 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Mudou de cor: B2 (✓ → ✗).** Não é regressão de código — `scripts/bots.js` é
byte a byte o de `2224bf5` —: é a primeira rodada com espiadores de fuzil em
número (44, arena C) e um deles levou dano 0,12 s antes do limite (§3, B2).
**B14 melhorou muito e reprova só pelo mesmo caso** ((b) e (c) passam).
**B7: 0 disparos e 0 de dano contra humano tampado em 276 engajamentos
válidos, N ≥ 10 em todos os sete tipos** — segue ◌ por dois motivos escritos no
§2e (a virada como está escrita conta rumo de caminhada; o avesso (9) sem N).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✗, E10 ✓, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Três defeitos NOVOS fora da letra da régua nasceram de correções desta rodada**
(§4, [NC] 1–3): dois dão ao jogador um lugar onde ele **não leva tiro e atira**
(detalhe fora do repo), um trava o carro. Em `2224bf5`: 2 (segurança). Em
`070502f`: 1.

`test/security-regression.test.js`: **32/32**. Os dois furos de segurança de
`2224bf5` estão fechados (§4, item 7; detalhe fora do repo), com um resíduo.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente
(terreno + `Structures.rayHit` com veículos + obstáculos registrados) — não a
`clearSight` do bot. E, à parte, o que a TELA desenha (`Oclusao.tampa` e
`Raycaster` do three, âncora corrigida — §0).

### 2a. Caminho real (arenas A–G)

Humano atrás/dentro da cobertura, bot armado que o veria sem ela; cada disparo
do bot contra ele classificado pela âncora do cliente no instante do disparo
(origem = `fromPos` do próprio disparo). Válido = não contaminado (nenhum outro
dublê a ≤ 12 m no mesmo tempo), cabeça E tronco tampados para o cliente no t0,
fora do oco da fundação do castelo e — agachado, arenas A–F — sem a cabeça em
pé visível ao bot nos primeiros 0,7 s. Três modos: **cob** (calado desde o
início), **som** (o dublê atira de isca para trazer o bot — válido para disparo
e dano, não para virada, porque o bot OUVIU) e **calada** (uma trilha de tiros
subterrâneos leva o bot até a área e o dublê surge CALADO, longe do último
som).

| tipo | engajamentos | **válidos** | com o bot a 8–40 m | … calados | disparos / acertos / dano com ele tampado |
|---|--:|--:|--:|--:|--:|
| (1) prédio da cidade | 48 | **48** | **38** | 24 | **0 / 0 / 0** |
| (1) castelo | 59 | **37** | **27** | 17 | **0 / 0 / 0** |
| (2) Torre Nexus por dentro | 33 | **33** | **30** | 19 | **0 / 0 / 0** |
| (3) pedra | 39 | **27** | **22** | 22 | **0 / 0 / 0** |
| (4) árvore | 55 | **51** | **45** | 39 | **0 / 0 / 0** |
| (5) cacto | 51 | **46** | **41** | 30 | **0 / 0 / 0** |
| (6) POI (mercado, refúgio, tenda, barril) | 48 | **34** | **33** | 18 | **0 / 0 / 0** |
| (7) veículo inteiro | — | — | — | — | (`2224bf5`: 29 válidos, 0 — nem `scripts/bots.js` nem `js/veiculo*.js` mudaram) |
| (9) veículo DESTRUÍDO (avesso) | 0 | — | — | — | não medido |

**0 disparos, 0 acertos e 0 de dano contra humano tampado em 276 engajamentos
válidos; N ≥ 10 com o bot a 8–40 m em todos os sete tipos (1)–(6)** — o que
faltou em `2224bf5` (prédio 2, castelo 0, Torre 0, cacto 4, POI 4). Os 521
disparos que houve foram todos com o humano visível para o cliente — o bot
contornou a cobertura.

**Viradas** (transição do rumo do bot para ≤ 10° do humano, com ele tampado e
nunca visto), só nos engajamentos calados: **12 em 184**. Das 12, **3** estão
alinhadas com um tiro ouvido (arenas F e G, que registram todos os tiros do
servidor); as outras **9**, sem som alinhado, são 8 bots **caminhando** (o rumo
é a direção do passo) e 1 parado a 50 m, fora da faixa. **Controle:** o mesmo
contador apontado para ISCAS — o ponto do humano girado ±25°, ±30° e ±40° em
torno do bot, mesma distância, mesma janela — dá **0,048 por engajamento × isca**
(53 em 1 104); para o humano, **0,065** (12/184), e sem as 3 do som, **0,049**
(9/184). A virada residual é do acaso do rumo de caminhada, não de visão através
da cobertura.
As 4 viradas "exatas" de bots PARADOS (rumo ao humano com 3 casas de precisão)
foram todas o repasse em pé do §0.3: com a espera de 0,7 s (arena G) não houve
nenhuma.

### 2b. Pares geométricos (16 114 pares, semente 424242, âncora de tela corrigida)

| tipo (sorteio dirigido) | pares | cliente tampa | **bot vê o tampado** | cliente vê | bot cego onde o cliente vê | tela tampa, bala passa, bot vê |
|---|--:|--:|--:|--:|--:|--:|
| aleatório no mapa | 6 544 | 1 798 | **0** | 4 746 | 26 (0,5 %) | 97 |
| árvore | 528 | 501 | **0** | 27 | 1 | 9 |
| pedra | 192 | 72 | **0** | 120 | 0 | 0 |
| cacto | 950 | 950 | **0** | 0 | 0 | 0 |
| tenda / mercado / barril | 74 | 45 | **0** | 29 | 0 | 0 |
| paredes (cabana, torre, base, ruína) | 274 | 270 | **0** | 4 | 0 | 0 |
| prédio da cidade | 163 | 137 | **0** | 26 | 0 | 0 |
| acabamento urbano no chão (postes, praça, pódio, Torre) | 1 010 | 967 | **0** | 43 | 0 | 14 |
| castelo | 78 | 66 | **0** | 12 | 0 | 3 |
| Torre Nexus (casca e por dentro) | 6 005 | 3 824 | **0** | 2 181 | 0 | 8 |
| veículo (buggy, esportivo, caminhão, heli) | 296 | 197 | **0** | 99 | 0 | 1 |

**0 de 8 827 pares tampados vistos pelo bot.** (8) guarda-corpo `noBullet`: 37
pares cruzam a grade e o cliente vê — o bot vê **37 de 37**. Avesso nos pares:
o bot é cego onde o cliente vê em **≤ 3,7 %** por tipo (limite 5 %). O que era
205 de 205 (árvore) e 623 de 623 (cacto) em `2224bf5` virou **1 de 27** e **0**
(o cliente agora tampa os 950 pares de cacto) — a bala contínua do cliente
(`cfa39d1`) fechou o avesso.

### 2c. O que a TELA desenha sólido e a bala não conhece (âncora corrigida)

É a sensação de *wallhack* que o jogador VÊ: o bot atira em quem a tela mostra
escondido, e a vítima aceita, porque ela usa a mesma bala do cliente.

- **O painel do campo de tiro** (`js/maptoys.js`, caixa de **9 × 3,4 m** sem
  colisor de bala): **no caminho real, 19 disparos, 10 acertos, 140 de dano** num
  humano que a tela escondia atrás dele (arena C, engajamento de árvore perto da
  atração). É a pior parede desta lista.
- **O vulcão:** 69 dos 97 pares aleatórios em que a tela tampa e a bala passa são
  a malha do vulcão (`USDRoot<Sketchfab_model`) acima do relevo que a bala e o
  bot consultam (`heightAt`).
- **Copa de árvore:** 16 aleatórios + 9 dirigidos — ocultação, não cobertura (a
  bala passa em qualquer jogo).
- **Postes da cidade:** 14 de 910 pares agachados atrás de poste — a caixa de
  bala do poste é inscrita no cilindro desenhado, de propósito (`6b6bd58`).
- **Guarda-corpo da Torre:** 8 (as barras) — de propósito (`noBullet`).
- **Castelo:** 3 de 78, todos com o OLHO do atirador dentro da base desenhada
  (`RB_Base`, material de um lado só): a tela real não desenha a face de trás, a
  `Oclusao` desenha — ver §4, observação (c).
- O resto dos 97 aleatórios: 5 malhas soltas (entre elas o painel acima), 2 do
  canhão vermelho de uma atração, 2 da malha global `estruturas`; e 1 par de
  veículo atrás do interior desenhado da Torre.

**O que a rodada 4 listou e não se sustenta com a âncora corrigida:** "mercado
desenhado maior que o colisor" e "cacto: 621 de 623 com a tela mostrando o cacto
na frente" (§0.1). O último, de todo modo, fechou com `cfa39d1`.

### 2d. O avesso da tela: a bala para onde a tela não desenha nada

"Parede invisível": a bala do cliente para ≥ 0,3 m ANTES do primeiro triângulo
desenhado na mesma reta. Tirando o relevo (o `rayBlockedAt` marcha de 1,6 m e
para até 0,8 m antes da crista, por construção — B6):

- **Tenda:** 16 de 18 pontos, **1,1 m** antes da lona — o cilindro de bala
  (r 1,3 m) é reto e a lona afunila; `d381d29` cortou a altura, não o afunilado.
- **Castelo:** 28 de 133 pontos, mediana 0,9 m (até 9,4 m): as caixas da
  fundação descem até o ponto mais baixo do terreno, e debaixo da borda da base
  desenhada há ar.
- **Árvore:** 59 de 1 020, mediana 1,1 m (parte é a marcha do relevo rotulada
  pelo obstáculo mais perto); pedra, cacto, mercado e barril: ≤ 18 cada, a mesma
  marcha do relevo.
- Veículos: não conclusivo — a sonda tica a física com passos de 0,5 s para
  mover o LOD das árvores, e a caixa de bala e a malha desenhada podem se
  descolar nesse passo. Fica sem número.

### 2e. Veredito de B7

**◌ — nenhuma violação de disparo ou dano em nada que foi medido, com N em
todos os tipos (1)–(6).** Não fecha pela letra por dois motivos:

1. **A "virada" como está escrita conta rumo de caminhada.** Um bot andando
   cujo rumo passa pelo humano conta, mesmo sem saber dele; a taxa medida é a
   mesma das iscas (§2a). **Proposta de redação para o dono** (não aplicada):
   *"viradas em excesso sobre o controle: a taxa de viradas para o humano
   tampado não passa da taxa para iscas no mesmo raio (±25–40°), e 0 viradas de
   bot PARADO"*. Medida por essa redação, B7 passaria.
2. **O avesso (9), veículo destruído, segue sem N no caminho real** (nenhuma
   carcaça ficou ao alcance de bot armado nesta rodada).

---

## 3. Veredito por critério (com a comparação com `2224bf5`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 px / 0,00 cm a 10, 25 e 50 m nos 192 casos de arma de fogo**. Bazuca (régua do dono): origem a **0,00 cm da boca**; afastamento 25,89–26,35 cm (quadril), 13,07–13,09 cm (mira); paralelismo 0,000°. O caso "quadril + arrasto" não disparou (sem amostra). |
| **M2** | ✓ | ✓ | Fuzil 720 m/s → 7,4 cm de queda a 100 m; DMR 800 → 4,8 cm; sniper 850 → 5,0 cm; velocidade medida = tabela. |
| **M3** | ✓ | ✓ | 0,18333 °/px; 200/100 = 1,99999; 30/60/120 Hz iguais a 5e-6; soltar 6e-22 rad. |
| **M4** | ✓ | ✓ | R(ADS)/R(quadril) = 1,0000–1,0002. |
| **M5** | ✓ | ✓ | Razão 0,6002; diagonal 0,011°. |
| **M6** | ✓ | ✓ | Nave/queda/paraquedas/espectador: opacidade 0; voando: tiros ok. |
| **M7** | ✓ | ✓ | Toque real, laço no rAF (`r3-toque` só-M7, carga 2,8): 0 % → 55,004° lento e rápido; 100 % → ganho **1,000** lento, **2,000** rápido. (c) o mesmo arrasto a 61 e a 30 quadros/s (`r3-m7c`): diferença **0,000** nos três ritmos. Slider 30–250 %. (Os números "estrangulados" da `r3-toque` são lixo da própria sonda — §0.) |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse e caneta: 0 quadros com o núcleo agindo; morto, sem entrada: 0; controle de toque 4,71°. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 disparos do automático**; controle positivo 93. (Falso negativo, sem veredito: copa vista de cima, 6 de 11 alvos visíveis sem ajuda.) |
| **A3** | ✓ | ✓ | Efeito até 2,8° da borda. |
| **A4** | ✓ | ✓ | ρ ≤ 0,300; cruzamentos com = sem; alvo parado: pull 0. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (20 m: 3,64° × 4,34°); (d) segue em conflito com A2. |
| **A6** | ✓ | ✓ | Faca e bazuca 0; DMR/sniper 1,63° × fuzil 4,71°. |
| **A7** | ✓ | ✓ | Tiro com a assistência agindo: 0 px; `security-regression` 32/32. |
| **A8** | ✓ | ✓ | Padrão desligado; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | (e) três dedos em 0,5 s: **1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | ≥ 44 px em menu, ajustes, lobby, jogo, cheio, inventário (V1, V3). |
| **C3** | ◌ | ◌ | 0 px² em jogo, cheio e inventário; morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque (E1–E10). |
| **C5** | ✓ | ✓ | Grade real 280 pontos: os mesmos 3 "tiros" de troca de arma de `2224bf5`; dublê 4 455 pontos: 0. |
| **C6** | ✓ | ✓ | 0,199° em 16 direções; zona morta 0,1225. |
| **C7** | ✓ | ✓ | 1 toque nas 8 armas. |
| **C8** | ✓ | ✓ | Sem itens, escondidos; com itens, 1 quadro; 0 botões mudam de lugar. |
| **C9** | ✓ | ✓ | Na pausa, tocável, persiste. |
| **C10** | ✓ | ✓ | Toque real: entrar com o polegar no talo e o ATIRAR seguro → o carro anda **5,18 m no 1º segundo**, pente 28 → 28; helicóptero com o ⇧ → **translada 6,45 m**, não sobe; sair com o polegar na tela: 0 m, nada preso. A posse nova (`26f682c`) não mudou nada disso de perto — mas ver §4 [NC] 2. |
| **C11** | ✗ | ✗ | (a) 4,944/5,192 = 95,2 %; (b) 0,5 → 54 %; (c) a corrida liga entre 0,81 e 0,85 do curso. Decisão do dono pendente. |
| **C12** | ✓ | ✓ | Vermelha no 1º quadro sobre jogador remoto a 20/40/50 m, Visitante, lobo, esqueleto, zumbi, golem; branca no cervo, no disco e a 70 m; apaga em 6 quadros. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1** | ✓ | ✓ | 1ª re-exposição (arena H, bot travado): 24, 1º disparo mín. **1,46 s**; engajamento novo (espiadas, 1ª exposição): 0 de dano em 44; cone a 45 m: 1º disparo ≥ 2,73 s. |
| **B2** | **✗** | ✓ | Re-exposição limpa (arena H): 24, **0 violações** (menor folga: escopeta a 14,6 m, 2,92 s ≥ 2,76). **Espiada de fuzil (arena C): 1 de 44 primeiras re-exposições com dano em 2,92 s, limite 1,3 + 1,0 + 0,0315 × 23,55 = 3,04 s** — 0,12 s cedo, medido do instante em que o dublê subiu (o servidor o soube ≥ 0 ms depois, então o erro real é ≥ 0,12 s). Em `2224bf5` só havia 4 espiadas de fuzil. `scripts/bots.js` não mudou. |
| **B3** | ◌ | ◌ | Fuzil PARADO a 24 m (arena C, bot travado): mediana **10,62 s** (9). Fuzil a 30 m, (b), (c): não medidos. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ✓ | ✓ | Relevo: **0 de 12 164** pares; o cliente e o bot concordam (0 de 12 164). Perseguição: não remedida (bots.js igual). |
| **B7** | ◌ | ◌ | §2: 0 disparos/dano em 276 válidos, N ≥ 10 nos sete tipos; pares 0 de 8 827; guarda-corpo 37/37. Virada: a redação conta rumo de caminhada (taxa = isca); avesso (9) sem N. |
| **B8** | ✓ | ✓ | Arena H. (a) 18 humanos a 7 m nas costas: 0 disparos em 17; o 18º entrou no cone quando o bot virou patrulhando (5,01 s) e só então levou tiro (7,58 s). (b) cone a 45 m: viraram 14 de 20 em **1,61–3,80 s**; fora da conta, declarados: 1 bot já de frente no t0 (7,9°) e **1 que virou em 0,80 s — estava em combate com outro bot 1,4 s antes** (`NOTICE_COMBAT_MULT`; nenhum tiro ouvido a ≤ 70 m em 15 s). (c) tiro visto a 50 m: **26 de 26** viraram em 1,00–1,11 s (3 outros bots estavam atirando em terceiros na janela — contaminados); tiro fora da tela: **0 de 13**. |
| **B9** | ◌ | ◌ | Não medido. |
| **B10** | ✓ | ✓ | Agachado: intervalo mínimo 2,90 s (escopeta) e 3,21 s (DMR) × em pé 1,40 e 1,50 → **2,07× e 2,14×**; 30 de 31 agachados levaram dano (nunca some). |
| **B11** | ✓ | ✓ | Erros do bot engajado: **98,3 % (290/295)** rentes ao rosto; **0 abaixo de 0,42 m**. (A sonda antiga contava erro de qualquer bot: 1 a 0,22 m era de um bot a 4,9 m atirando em outro alvo a 32 m.) |
| **B12** | ✓ | ✓ | `js/obstaculos.js` e `js/veiculo-vida.js` importam só `js/paredes.js`; `three` em `dependencies`; stderr herdado. |
| **B14** | ✗ | ✗ | **Fuzil a 23,6 m, arena C, 44 espiadores, bot travado:** (b) TTK finito em **40 de 44**; mediana **23,24 s = 2,19 × o parado** (10,62 s) ✓; (c) dano entre a 3ª e a 6ª exposição em **42 de 44 (95 %)** ✓; imunes: 2. **(a) reprova pelo caso de B2** (1 de 44). Em `2224bf5`: 4 de 4 imunes. Declarados: DMR 5 e escopeta 7 espiadores, TTK 18–27 s. Harness: os 16 bots extras nascem com fuzil (IA intocada), porque os bots quase nunca o acham. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido (`js/alien.js` e o duelo em campo aberto não passam pelo que mudou). Em `2224bf5`: o ET ganha 3 de 6 por 0,2–0,3 s. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes, 45 s cada: **904 golpes, 0 através** (controle 356). Torre Nexus, 10 pontos da escada: **656 acertos, 0 sem linha livre do cliente**. |
| **P3** | ✓ | ✓ | PvE: voando a 13,3 m: **0 golpes**; pousado: 0; a pé: 714. **Bots, com a posse ARBITRADA (`26f682c`)** (arena I): o dublê toma o helicóptero de perto e voa a ~12 m, bot armado a ~24,5 m, 29 engajamentos: **0 disparos nele, 0 de dano** (3 disparos de um bot em outro alvo, a 4,6–10,9 m dele). Controle (arena H, a posse recusada pelo anti-teleporte do próprio servidor): 4 de 5 levaram tiro, 114 de dano. |
| **P4** | ✓ | ✓ | (a) 0 travessias em 53 corridas contra 19 paredes; (b) vãos: os mesmos de `2224bf5` (telhados de cabana, degraus da rampa do castelo), 11 de 101 casos com vão visível (era 12). |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ◌ | ◌ | Igual a `2224bf5` no que foi remedido: (a) atrás do caminhão, 0 px: fuzil 0 acertos no alvo e 13 na lataria, DMR 0 e 4, bazuca estilhaço na lataria; hitscan: soldado 0, caminhão −364; controles acertam. (c) a vítima atrás recusa (100) e do lado aberto leva (48). (d) 100 acertos no mesmo instante → 1 760 → 1 448; origem longe: 0; a 400 m: 0; `dmg: 999` → teto. (e) livre no mesmo quadro da queima; explosão a **5,05 s**. **Não medidos:** o bot voltar a atirar pelo veículo que queima e a morte de quem está dentro. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **232 draw calls p50** (224–256, mundo de 23 s). Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: 0 `Object3D`. |
| **D4** | ✓ | ✓ | Retrato do mundo idêntico desktop × `?mobile=1`. |
| **D5** | ✓ | ✓ | Nove arenas, ~580 000 intervalos: p50 100 ms, **p99 103 ms com carga ≤ 4** (até 121 ms com carga 11), **99,85–99,97 % ≤ 150 ms**. Custo da visada do bot: 1,6 µs por chamada (era 1,0–1,2 µs em `2224bf5`: +45–60 % com o dobro de paredes e as fatias de tronco). |
| **D6** | ✗ | ✗ | 4G emulado: **16,94 MB** (antes 16,91; limite 15,03); JS 2,75 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave (olhar e pular), queda (erro 0°), pouso. |
| **E4**, **E5** | ◌ | ◌ | Chegar ao carro/helicóptero só pelo toque: não completado (11,9 m / 9,5 m do alvo). |
| **E6**–**E8** | ✓ | ✓ | Solo: JOGAR DE NOVO / VOLTAR AO MENU; espectador "botão ⇧ troca" → lobby; fim → lobby em 8,5 s → nova partida, nada preso. |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). |
| **E10** | ✓ | ✓ | Retrato na pausa, nada preso. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; 0 `pageerror` no que foi percorrido. |
| **E15** | ✓ | ✓ | V2 e V1: pouso a 0,1–0,2 m do baú; 1º toque no USAR abre e o item entra; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque (a posse nova aceita a 0,8 m), anda 23 m, sai no 1º toque, 0 m depois de sair, nada preso. |

---

## 4. Defeitos NOVOS, com reprodução mínima

**[NC]** = nasceu de uma correção desta rodada.

1. **[NC — `6b6bd58`] Dentro da casa de máquinas / caixa d'água do telhado, o
   jogador não leva tiro e atira.** As peças de acabamento do telhado são
   `noCollide` (o corpo entra) e barram bala — mas `Structures.rayHit` ignora a
   caixa que CONTÉM a origem da reta. Medido no cliente, pelo toque: o jogador
   entra andando em **4 de 4** caixas testadas (16 candidatas); o anfitrião, de
   fora, com a bala parando na caixa, reporta 2 acertos → **vida 100** (do lado
   de fora, no mesmo telhado: **48**); de dentro, ele acerta o anfitrião em 3 de
   4. O bot também não o vê. Reinjeção: sem o acabamento, a sonda não acha a
   caixa (não há o que entrar). Coordenadas e passo a passo **fora do repo**.
2. **[NC — `26f682c`] O carro que rola depois que o motorista sai fica
   inalcançável.** O servidor guarda a pose do veículo pelo último estado do
   dono; depois que ele sai, ninguém a atualiza, e o carro continua rolando no
   cliente. Medido pelo toque: esportivo a **117,9 km/h**, sai, o carro rola
   **53,65 m**; o jogador anda até ele (3,05 m) e toca USAR → **recusado para
   sempre, com a mensagem "Veículo ocupado!"** (errada). Buggy a 59,5 km/h: rola
   13,7 m, entra. Caminhão a 39,4 km/h: 0,36 m, entra. O helicóptero paira e não
   tem o problema. (O descompasso de onde os outros clientes veem o carro é
   anterior; a recusa é nova.)
3. **[NC — `e66d277`] Agachado contra certas pedras, o jogador fica DENTRO da
   pedra desenhada: não leva tiro, não aparece e atira.** O corpo é o círculo de
   sempre; a bala é a malha desenhada, que em parte das pedras passa do círculo
   + 0,42 m. Geometria (Node, a malha do jogo): **21 de 105 pedras** põem cabeça
   E tronco agachados dentro da malha em **190 de 6 720** posições de encosto (6
   pedras também em pé). No cliente, pelo toque (polegar + ⤓): em **2 de 4**
   pedras o jogador chega andando, o anfitrião de fora reporta 2 acertos →
   **vida 100** (1,5 m mais para fora: **48**), a tela do anfitrião o esconde, e
   de dentro ele acerta o anfitrião; na 3ª, parcial (76); na 4ª não entra. O
   mesmo vale para o cacto em pé, só com a cabeça (134 posições, tronco fora —
   parcial). Detalhe **fora do repo**.
4. **B2 / B14(a): uma 1ª re-exposição de fuzil levou dano 0,12 s antes do
   limite** (1 de 44). Não nasceu nesta rodada (`scripts/bots.js` igual); foi a
   primeira medição com N.
5. **O painel do campo de tiro (9 × 3,4 m) não segura bala** — no caminho real,
   19 disparos e 10 acertos (140 de dano) num humano escondido atrás dele (§2c).
   Anterior. E o **vulcão** desenhado acima do relevo da bala (§2c).
6. **A tenda tem parede invisível** no alto (1,1 m antes da lona afunilada) e
   o **castelo**, debaixo da borda da base (§2d). Anteriores.
7. **Segurança — os dois furos de `2224bf5` fecharam** (medido em servidor local
   por socket; o mutante que tira a checagem reabre e o `security-regression`
   avermelha). **Resta um resíduo do mesmo vetor**, detalhe fora do repo.
8. Inalterados: **P1**, **C11(c)**, **C1(e)**, **D6**, **E9**.

**Observações sem veredito:**
(a) **Os bots andam por dentro da fundação do castelo** (eles andam no relevo e
não colidem com parede — anterior): foi assim que o oco do §0.2 apareceu com bot
e dublê lá dentro. Um bot com o olho sob a laje não acerta ninguém no pátio (a
laje barra), mas fica desenhado dentro da base.
(b) **Custo** (desktop, carga 10–11 nas quatro medições, intercaladas): o
`rayBlockedAt` do cliente passou de 6,2–6,5 µs para 8,1–11,9 µs por chamada (a
bala contínua contra obstáculo); o `rayHit` das paredes CAIU de 4,4–4,9 para
2,5–3,7 µs com o dobro de caixas (a poda funciona). Poda correta:
**0 diferenças em 36 000 retas** contra a força bruta (cidade de pé, destruída,
restaurada).
(c) **A `Oclusao` conta face de TRÁS de malha de um lado só.** Com o olho dentro
da base do castelo, ela diz "tampado" onde a tela real não desenha nada. É o lado
seguro para a assistência (ela deixa de agir), mas é uma diferença entre a
âncora e a tela.

**Contagem:** 7 critérios reprovados; **0 nasceram de correção desta rodada**;
**3 defeitos fora da régua nasceram de correções** (itens 1–3).

---

## 5. Testes que passam por acidente — e os mutantes

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| bala do cliente sem obstáculo (`obstaculoNaReta` → ∞) | pares: bot cego onde o cliente vê **416/527 árvore, 787/950 cacto, 34 pedra** | `arvores/pedras/cacto-colisor` **6 vermelhos** |
| malha tratada como cilindro | pares: **27** pedras + 20 aleatórios com o bot vendo o tampado | `pedras/cacto-colisor` 2 vermelhos |
| círculo da pedra barrando bala | pares: **120/192** pedras | `pedras/cacto-colisor` 2 vermelhos |
| sem o acabamento urbano | pares: tela tampa e bala passa em **618** postes (era 14) | `acabamento-bala` vermelho |
| sem a laje do pátio (nos módulos puros) | pares: **2** castelo com o bot vendo o tampado (o cliente ainda a tem por `js/castle.js`) | `castelo-piso-bala` vermelho |
| **poda: a caixa do bloco sem a última parede** | `r5-poda`: **4 / 13 / 22 retas erradas** em 12 000 | **`acabamento-bala` + `paredes-puro`: 14/14 VERDES** |
| posse sem a checagem de distância | `r5-seg`: pedido de longe → `ok: true` | `security-regression` vermelho |

Sem mutante, os 8 arquivos do construtor: **116/116**.

- **A poda por blocos não tem teste que a pegue.** O commit diz "mesmo resultado
  por construção"; com a união do bloco perdendo uma parede, 22 retas em 12 000
  atravessam uma parede real (depois de destruir e restaurar a cidade) e a suíte
  segue verde. Formato 3 da lista do CLAUDE.md (medir o eixo em que o defeito não
  aparece): nenhum teste compara `rayHit` com a força bruta.
- **Nenhum teste cobre "estar DENTRO" do sólido que barra bala** (NC 1 e 3): os
  testes novos atiram de fora para fora. É cobertura de ESTADO.
- **Minhas sondas erraram, e está no §0**: a âncora de tela (render e LOD), o
  esconderijo inalcançável, o repasse em pé e o bot compartilhado. Cada uma foi
  pega por um número que não fechava (tela sem nada desenhado atrás de um
  caminhão; bots virando com três casas de precisão; 47 de 55 espiadas com o
  mesmo bot).

---

## 6. Prioridade

1. **§4 [NC] 1 e 3 — lugares onde o jogador não leva tiro e atira** (telhado,
   pedra). Nasceram nesta rodada; detalhe fora do repo. A mesma família: o sólido
   que barra bala não barra a reta que COMEÇA dentro dele.
2. **§4 item 7 — o resíduo de segurança** (fora do repo).
3. **§4 [NC] 2 — o carro que rola fica inalcançável** ("Veículo ocupado!").
4. **B7** — o que o dono chamou de principal está **sem violação de disparo ou
   dano em 276 engajamentos**. Para fechar pela letra: a decisão sobre a virada
   (§2e) e o avesso (9) no caminho real. Junto: **o painel do campo de tiro e o
   vulcão** (§2c), que são "atirando através de parede" do ponto de vista de quem
   joga.
5. **B2 / B14(a)** — a 1ª re-exposição de fuzil 0,12 s cedo (1 de 44).
6. **P1**, **C11(c)** (decisão do dono), **C1(e)**, **D6**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12, V1 (o bot e o veículo que queima; a morte de quem está dentro).
