# Validação do porte para CELULAR — commit `afb1ae8`

Sexta rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63). Autor: o **validador** — não escreveu código de
produto nem teste do repo. Nada foi commitado. **A régua não mudou.**

Medido aqui o que entrou desde `d381d29`: o olho não entra no sólido que segura
bala (`41d1711`); o carro solto segue o último motorista até parar, e o piloto
com o pé no chão deixa de ser piloto (`adb0a99`); o painel do campo de tiro é
parede e as atrações saem da semente (`6cd95c9`); a rocha desenhada do vulcão
segura bala e tampa a visada do bot (`88f3204`); o corpo pisa na rocha
desenhada e a calota de lava não é chão (`afb1ae8`).

---

## 0. Condições

- **Árvore:** `dev` em `afb1ae8` (`git log -1` no início e no fim). `git status`
  antes e depois: só ESTE arquivo (não rastreado). `npm run lint` limpo.
  Mutantes numa **cópia** (`copia-r6`, rsync da árvore), restaurados por
  `sha256` e conferidos contra a árvore principal depois de cada um; um
  instantâneo de `d381d29` (`git archive`) para comparar custo e a paridade das
  atrações.
- **Carga — a melhor condição de todas as rodadas.** Amostrada a cada 20 s das
  18h26 às 22h58 (816 amostras): carga de 1 min **mediana 2,9, p90 4,7,
  máximo 7,7** em 12 núcleos (arenas e sondas de navegador correram juntas em
  parte do tempo — está na carga). Cada artefato traz a carga do seu início.
  `ps` sem `run-tests`/`node --test`/`server.js` alheio antes de cada medição.
  Nenhum processo de teste alheio apareceu durante a rodada.
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360 (a classe do S22 do dono), V3 844×390;
  `hasTouch`, `isMobile`, DPR 2, `?mobile=1`. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF)
  para tudo o que é do jogador; **dois navegadores de verdade** no mesmo
  servidor para o carro solto e para a paridade das atrações; bots pelo
  processo de verdade (`server.js` + `scripts/bots.js` pela flag do anfitrião,
  mais um processo de 16 bots com fuzil e a IA intocada; 2–4 humanos-dublê a
  10 Hz) em **quatro arenas**, **191 engajamentos**.
- **Portas:** 3980–3996. Exceção declarada: os testes DO CONSTRUTOR contra
  mutantes na cópia usam as portas deles.
- **Correções das MINHAS sondas nesta rodada — todas medidas:**
  1. **A sonda do NC-1 do laudo 5 passaria por construção.** `r5-dentro.js`
     escolhia as caixas do telhado por `noCollide`; desde `41d1711` elas são
     maciças e a sonda acharia **0** caixas. `r6-dentro.js` escolhe pelo
     acabamento e pelo tamanho (as mesmas 16 candidatas).
  2. **A régua do NC-3 que eu usei no laudo 5 olhava o ponto errado.** Eu
     cobrava "cabeça (1,02) E tronco (0,55) dentro da malha"; a vítima testa a
     cobertura até o **pé + 1,0 m** (`br-game.js`, `youWereHit`). A imunidade é
     esse ponto dentro da malha — com o olho fora ou dentro. Remedido pelo
     ponto certo (§4, item 5).
  3. **A poda por blocos "falhou" em 280 de 36 000 retas — falso.** `88f3204`
     compôs a rocha do vulcão no `Structures.rayHit`; `r5-poda.js` comparava
     com a força bruta só nas caixas. `r6-poda.js` põe a rocha na força bruta:
     **0 diferenças em 36 000 retas** (cidade de pé, destruída e restaurada).
  4. **Os pares (`r5-invis.js`) punham os pontos no RELEVO**, que no vulcão fica
     até 47 m abaixo da rocha desenhada: os dois lados nasciam dentro da rocha.
     `r6-invis.js` usa o chão do corpo (`chaoDoBot`: relevo ou rocha) e rotula a
     rocha (`vulcao`).
  5. **A arena não conseguia trazer carro** desde a posse arbitrada (`26f682c`):
     o dublê pedia o carro de longe. E, no caminho, um salto de 450 m/s (o
     anti-teleporte recusa e a pose do carro ficava para trás). Corrigido: o
     dublê vai por baixo até o carro e anda até o destino antes de subir.
  6. **Âncora de chão do vulcão:** "pé flutuando" contra a malha da rocha só
     acusava onde o TERRENO desenhado fica acima dela (38 % da pegada; medido:
     o primeiro triângulo de cima é o terreno em 40 de 40 desses pontos).
     A âncora passou a ser o mais alto entre rocha e terreno desenhados.
  7. **A paridade das atrações com o GLB do mercado atrasado não tem poder
     demonstrado:** no instantâneo `d381d29` os dois navegadores também deram
     0 m. O que fica é a paridade com o **bot** (0 m) e a leitura do código.
  8. Declarado como no laudo 5: a `r3-toque.js` completa gera lixo na
     aceleração 100 % (o dedo preso pelo `touchEnd` vazio); M7 foi medido com
     `SO_M7=1`, e M7(c) pela `r3-m7c.js`.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `bateria-r6.sh` (as de sempre) e as novas `r6-lib.js` (partida BR + segundo
  navegador), `r6-dentro.js`, `r6-scan.js`, `r6-escada.js`,
  `r6-pedra-tronco.js`, `r6-pedra-cliente.js`, `r6-carro.js`, `r6-painel.js`,
  `r6-vulcao.js`, `r6-vulcao-node.js`, `r6-invis.js`, `r6-poda.js`,
  `arena-r6.js` (painel, vulcão, carro rolado, espiada com rastro do bot),
  `r6-ancora.js`, `r6-b7-final.js`, `r6-b14.py`, `r6-rolado-check.js`,
  `r6-p3.js`, `r6-seg.js` (privada), `mut6.py`, `mut6-sondas*.sh`,
  `mut6-testes.sh`.

---

## 1. Placar

> **45 aprovados · 6 reprovados · 12 não medidos, em 63** (45/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `d381d29` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 8 | **1** (**B7**) | 4 (B3, B4, B5, B9) | 6 · 2 · 5 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 0 | 0 | 1 (V1) | 0 · 0 · 1 |
| D — desempenho (5) | 3 | 1 (D6) | 1 (D2) | 3 · 1 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Mudaram de cor: B2 (✗ → ✓), B14 (✗ → ✓) e B7 (◌ → ✗).**
- B2 e B14: o caso de `d381d29` (1 de 44 primeiras re-exposições de fuzil com
  dano 0,12 s cedo) **não reproduziu em 88** (59 espiadas com `ESPIA_N=12` +
  29 re-exposições de 6 s), e o log instrumentado mostra a cadeia certa em
  todas as 25 espiadas em que havia log (§3, B2).
- B7: **é a primeira medição de cobertura por carro que ROLOU depois que o
  motorista saiu**, e o bot atirou através dele — 14 disparos, 8 acertos, com o
  humano tampado para o cliente, em 2 de 37 engajamentos válidos; os 22
  eventos batem com a pose de SAÍDA do carro e nenhum com a pose real (§2a). Não é
  regressão de código: `scripts/bots.js` não lê o `carRola` novo, e nunca
  seguiu o carro solto. Painel e vulcão, os dois alvos desta leva: **0**.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✗, E10 ✓, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Quatro defeitos NOVOS fora da letra da régua nasceram de correções desta
rodada** (§4, [NC] 1–4) — um deles de segurança (detalhe fora do repo). Em
`d381d29`: 3. Em `2224bf5`: 2. **E duas correções não fecharam o que
prometiam** (§4, [NC] 1 e item 5): o carro solto segue "Veículo ocupado!"
para os OUTROS jogadores, e o NC-3 do laudo 5 segue aberto em pé.

`test/security-regression.test.js`: **33/33**. Suíte completa: **verde** pelo runner — 2 581 testes, 2 567 passaram, **0 falharam**, 11 cancelados e 3 pulados; 1 arquivo (`xr-weapon`) falhou na corrida e passou 2× isolado (flake). 61 min, carga 3–7. (A corrida do construtor neste mesmo commit acusou 4 "regressões reais" de XR — `xr-controle-anda`, `xr-locomotion`, `xr-mapa`, `xr-punho-rotacao`; aqui as quatro passaram de primeira.)

---

## A. Os cinco itens do briefing, um por um

1. **`41d1711` — o olho não entra no sólido que segura bala.**
   *Telhado (NC-1): fechou.* As 16 caixas de telhado do laudo 5 agora seguram o
   corpo; pelo toque, em 4 de 4 o jogador para a 0,42 m da face e não entra.
   Mutante `macica → p` (peças voltam a laje): entra em 4 de 4, vida **100**
   dentro contra 48 fora, e acerta o anfitrião de dentro em 3 de 4.
   Varredura no cliente de TODA caixa que segura bala e não segura corpo
   (419) mais as que viraram maciças (374), em 126 464 posições de equilíbrio:
   olho ou ponto da vítima dentro de caixa só em dois lugares — **a escada da
   Torre Nexus** (§4, item 6, anterior) e o oco da fundação do castelo
   (inalcançável, laudo 5 §0.2).
   *Pedra (NC-3): fechou AGACHADO, não fechou EM PÉ.* Agachado, com o critério
   do laudo 5, o olho não fica mais dentro da pedra em 0 de 4 (mutante sem o
   empurrão: 3 de 4, vida 100/100/88 contra 48/48/36, e atira). Mas a vítima
   testa o **pé + 1,0 m**, não o olho: depois do empurrão, esse ponto fica
   dentro da malha com o olho FORA em **575 posições em pé e 125 agachadas, em
   23 das 105 pedras** (Node, semente 424242); no cliente, pelo toque, em pé:
   **2 de 3 pedras — vida 100 (a 1,5 m dali, 48) e ele acerta o anfitrião**,
   com a CABEÇA aparecendo na tela do anfitrião (§4, item 5). Cacto: 0 em
   68 096 posições.
2. **`adb0a99` — carro solto e piloto a pé.**
   *O próprio motorista: fechou.* Esportivo a **117,9 km/h** pelo toque, sai,
   o carro rola **53,6 m**; ele anda até o carro e entra no 1º toque — 4 de 4
   tentativas (esportivo a 117,9/46,3/8,1 km/h e buggy a 59,4).
   *O OUTRO jogador: não fechou — e nasceu um defeito.* No segundo navegador o
   carro fica onde o motorista saiu: **55,2 m** de onde ele está (117,9 km/h),
   11,9 m (46,3), 14,0 m (buggy). O outro anda até o carro que vê, toca USAR e
   recebe **"Veículo ocupado!"** — o mesmo sintoma do NC-2. A causa (§4, [NC]
   1): enquanto manda `carSolto`, o `state` do ex-motorista é DESCARTADO —
   **0 `playerUpdate` dele** durante todo o rolar (2,0–2,65 s nas 4
   tentativas). Mutante de diagnóstico (o `state` deixa de ser volátil):
   20–30 `playerUpdate` no mesmo intervalo, o outro desenha o carro a
   **0,27 m** e entra.
   *O bot: não segue o carro solto* (não lê `carRola`) — é o B7 ✗ (§2a).
   *Piloto a pé:* o caso medido no laudo 5 fechou; um caso vizinho do mesmo
   vetor segue aberto (detalhe **fora do repo**). O piloto legítimo continua
   piloto (P3): voando a 12 m, pousado a 0,55 m, rasante de 150 m e pousado na
   rocha — `heli = true` em todos.
3. **`6cd95c9` — painel do campo de tiro e atrações pela semente.**
   *Caminho real: 30 engajamentos válidos, o bot a 8–40 m em 29 (20 calados):
   0 disparos, 0 acertos, 0 de dano com o humano tampado* (190 disparos quando
   ele estava à vista). Em `d381d29`: 19 disparos, 10 acertos, 140 de dano.
   Pares atrás do painel: 0 de 397 tampados vistos pelo bot (mutante sem o
   painel no bot: **266 de 397**). Corpo: para a 0,42 m em 4 de 4 (mutante sem
   o painel no cliente: atravessa 4 de 4). Paridade: canhão, cama, galeria,
   fogos e xilofone a **0 m** entre um navegador que recebeu o mercado antes e
   outro com o GLB do mercado atrasado 9 s, e **0 m** contra o bot; a caixa de
   parede = a caixa desenhada = a do bot. (A sonda de tempo de rede não
   reproduziu a dependência antiga no `d381d29` — §0.7.) **O carro atravessa
   o painel** (§4, [NC] 4).
4. **`88f3204` + `afb1ae8` — vulcão.**
   *§2c refeito:* nos 2 500 pares pelo vulcão, **0 de 1 124 tampados vistos pelo
   bot**, **0 "a tela tampa e a bala passa"**, e o bot cego onde o cliente vê
   em 2 de 1 376 (0,1 %). Nos aleatórios, "a tela tampa e a bala passa" caiu de
   **97 para 26** — nenhum é o vulcão (os 69 de `d381d29` sumiram).
   *O avesso:* a rocha nunca para a bala antes do triângulo desenhado (o rótulo
   `vulcao` não aparece entre as paradas ≥ 0,3 m antes do desenho); o
   Raycaster do three na malha desenhada dá a MESMA altura do sólido em 32 de
   32 pontos.
   *Corpo:* andando pelo polegar, 365 quadros sobre a rocha, **0 com o pé
   enterrado, 0 com o olho, 0 flutuando** (mutante sem a superfície: 371
   quadros enterrados, até 2,22 m). 5 das 8 radiais param na beira da saia:
   onde a rocha sobe mais de 0,65 m do relevo ela é parede (observação).
   *Bot no caminho real:* 18 engajamentos válidos atrás da rocha (16 a 8–40 m,
   11 calados): **0 disparos, 0 de dano**. Bot dentro da rocha: das posições
   que o servidor difundiu, 2 452 sobre o vulcão (1 069 onde a rocha fica
   acima do relevo) — **0 com o pé abaixo do desenho, 0 flutuando**.
   *Carro (resíduo declarado):* o carro roda no relevo, por baixo da rocha — e
   **quem sai dele fica enterrado: pé 5,0 m abaixo da rocha desenhada, imune
   (vida 100), invisível na tela e para o bot, andando por dentro da rocha**
   (§4, [NC] 3).
5. **B2 / B14(a).** **Não reproduziu: 0 em 88.** Espiadas (3 s / 2 s, 12
   ciclos, bot travado): 59 espiadores (50 de fuzil a 23,5–24 m); dano na 1ª
   re-exposição em 1 (escopeta a 14,6 m, 2,912 s contra 2,758 → +0,154 s);
   nenhuma 1ª exposição com dano. Re-exposição de 6 s (arena B7): 29 (22 de
   fuzil, 7 de DMR, a 29–30 m) — 1º disparo mínimo **1,46 s**, 1º dano mínimo
   **4,06 s contra 3,23 (+0,83 s)**. O que o log mostra (a instrumentação
   `B2LOG` do construtor reaplicada em `afb1ae8` nos 16 bots extras): nas 25
   espiadas com log, **25 vezes `novo → janela → volta(1) → janela`**. O caso
   de `d381d29` fica sem explicação; com 0 em 59 espiadas, a taxa de violação é
   ≤ 5 % a 95 % — B2 volta a ✓ pela medida desta rodada, com a ressalva escrita.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente
(terreno + `Structures.rayHit` com veículos e rocha do vulcão + obstáculos), com
a rocha e o painel conferidos como carregados na página da âncora (`solido`,
`modelo`, `painel` = verdadeiros) — não a `clearSight` do bot. À parte, a TELA
(`Oclusao` e `Raycaster` do three, âncora corrigida no laudo 5).

### 2a. Caminho real (arenas desta rodada)

Os mesmos filtros do laudo 5: não contaminado, tampado para o cliente no t0,
fora do oco da fundação e, agachado em modo `cob`, sem a cabeça em pé visível
ao bot nos primeiros 0,7 s. Modos **som** (isca: o bot ouviu — vale para
disparo e dano, não para virada) e **calada** (trilha de tiros subterrâneos
leva o bot; o dublê surge calado) e **cob** (calado desde o início).

| tipo | engajamentos | **válidos** | bot a 8–40 m | … calados | disparos / acertos / dano com ele tampado |
|---|--:|--:|--:|--:|--:|
| painel do campo de tiro (novo, `6cd95c9`) | 30 | **30** | **29** | 20 | **0 / 0 / 0** |
| rocha do vulcão (nova, `88f3204`) | 18 | **18** | **16** | 11 | **0 / 0 / 0** |
| (7) veículo inteiro que ROLOU depois da saída (`adb0a99`) | 42 | **37** | **37** | 37 | **14 / 8 / 112** (2 engajamentos) |
| tipos (1)–(6) e (7) parado | — | — | — | — | não remedidos (laudo 5: 0/0/0 em 276 válidos) |

**O carro que rolou.** O dublê dirige um carro até perto do bot, sai (`leaveCar`)
e manda `carSolto` ao longo de até 22 m, como o `br-game.js` faz; o servidor
repassa `carRola`. Depois sobe calado atrás do carro **onde ele parou**.
Em 2 dos 37 válidos o bot atirou: **14 disparos, todos com o humano tampado
para o cliente, 8 acertos, 112 de dano no servidor** (a vítima recusa por
cobertura — o dano não pesa, mas é o bot metralhando o carro). Os **22 eventos
de 22** (disparos e acertos) batem com a visada do bot calculada com o carro na
pose da SAÍDA, e **0 de 22** com a pose onde ele parou: o processo dos bots só atualiza veículo por `playerUpdate` de
quem está dentro (`observeVehicleFromUpdate`), e não escuta `carRola`.
Viradas nos calados: transições para ≤ 10° do humano tampado — painel 0,
vulcão 0, carro 2 (bot caminhando); controle das iscas (±25–40°):
humano 2 em 69 engajamentos × isca 9 em 414 — a taxa do humano não passa da
isca.

### 2b. Pares geométricos (18 941 pares, semente 424242)

| tipo | pares | cliente tampa | **bot vê o tampado** | cliente vê | bot cego onde o cliente vê | tela tampa, bala passa, bot vê |
|---|--:|--:|--:|--:|--:|--:|
| aleatório no mapa | 6 544 | 1 819 | **0** | 4 725 | 24 (0,5 %) | 26 |
| vulcão (novo) | 2 500 | 1 124 | **0** | 1 376 | 2 (0,1 %) | **0** |
| painel (novo) | 297 | 296 | **0** | 1 | 0 | 0 |
| árvore | 528 | 501 | **0** | 27 | 1 (3,7 %) | 9 |
| pedra | 192 | 72 | **0** | 120 | 0 | 0 |
| cacto | 950 | 950 | **0** | 0 | 0 | 0 |
| tenda / mercado / barril | 74 | 45 | **0** | 29 | 0 | 0 |
| paredes (cabana, torre, base, ruína) | 274 | 270 | **0** | 4 | 0 | 0 |
| prédio da cidade | 163 | 137 | **0** | 26 | 0 | 0 |
| acabamento urbano no chão | 1 010 | 967 | **0** | 43 | 0 | 14 |
| castelo | 78 | 66 | **0** | 12 | 0 | 3 |
| Torre Nexus (casca e por dentro) | 6 005 | 3 824 | **0** | 2 181 | 0 | 8 |
| veículo (buggy, esportivo, caminhão, heli) | 326 | 214 | **1** | 112 | 0 | 0 |

O 1 par de caminhão **não reproduziu**: refeito numa página nova com a mesma
pose do caminhão (que não mudou entre a leitura e a medida), o bot não vê.
Sem ele: **0 de 10 285 pares tampados vistos pelo bot.** Guarda-corpo
`noBullet`: 37 pares, o bot vê 37 de 37. Mutantes: tirar a rocha do bot →
**228 de 1 124** pares do vulcão vistos através da rocha; tirar a rocha do
cliente → o cliente tampa 887 em vez de 1 124 e o bot fica cego em 239 de
1 613 (15 %); tirar o painel do bot → **266 de 397**.

### 2c. O que a TELA desenha sólido e a bala não conhece

Nos aleatórios, **26** (eram 97, dos quais 69 o vulcão): 16 copas de árvore
(ocultação, a bala passa em qualquer jogo), 3 a base do castelo com o olho
dentro dela (a `Oclusao` conta a face de trás — laudo 5 §4c), 2 a malha
global `estruturas`, 3 malhas soltas (uma delas a **pilha de caixas dos fogos
de artifício**) e 2 o **canhão vermelho das atrações** (desenho sólido sem
colisor de bala — anterior). Postes 14 (inscritos de propósito), Torre 8 (as barras
do guarda-corpo, de propósito). **Vulcão e painel: 0.**

### 2d. O avesso da tela: a bala para onde a tela não desenha nada

Igual a `d381d29` no que não mudou: a marcha de 1,6 m do relevo (rotulada às
vezes pelo obstáculo mais perto), a **tenda** (16 de 18, 1,1 m antes da lona)
e a **base do castelo** (28 de 133, até 9,4 m). **A rocha do vulcão e o painel
nunca aparecem** como o que parou a bala antes do desenho. Veículos seguem
inconclusivos (passos de física de 0,5 s da sonda).

### 2e. Veredito de B7

**✗ — o bot atira através de veículo inteiro que rolou depois de o motorista
sair: 14 disparos com o humano tampado, em 2 de 37 engajamentos válidos.**
Painel e vulcão, os dois tipos desta leva: 0 em 48 válidos, 0 nos pares.
Os outros tipos não foram remedidos (laudo 5: 0 em 276), e a proposta de
redação da virada (laudo 5 §2e) segue com o dono; o avesso (9) segue sem N.

---

## 3. Veredito por critério (com a comparação com `d381d29`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 px / 0,00 cm a 10, 25 e 50 m em 96 casos × 128 tiros** (armas de fogo). Bazuca: origem a **0,00 cm da boca**; afastamento 25,77/24,35 cm (quadril), 13,09 cm (mira); paralelismo 0,000°. |
| **M2** | ✓ | ✓ | Fuzil 720 m/s → 7,7 cm a 100 m; DMR 795 → 5,4 cm; sniper 845 → 5,2 cm. |
| **M3** | ✓ | ✓ | 0,18333 °/px; 200/100 = 1,99999; 30/60/120 Hz iguais a 5e-5°; 1 × 120 eventos idêntico; soltar 6,8e-22 rad. |
| **M4** | ✓ | ✓ | R(ADS)/R(quadril) = 1,0000–1,0003 em 8 miras. |
| **M5** | ✓ | ✓ | Razão 0,6002; diagonal ≤ 0,011°. |
| **M6** | ✓ | ✓ | Nave/queda/paraquedas/espectador: opacidade 0; voando: 3 tiros a 0 cm. |
| **M7** | ✓ | ✓ | Toque real (`SO_M7`, carga 3,1): 0 % → 55,004° lento e rápido; 100 % → ganho **1,000** lento, **2,000** rápido. (c) `r3-m7c`: diferença **0,000/−0,01/0,000** entre 61 e 28 quadros/s. Slider 30–250 %. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse e caneta: 0 quadros com o núcleo agindo; morto e sem entrada: 0; controle de toque 4,71°. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 do automático**; controle positivo 92. |
| **A3** | ✓ | ✓ | Efeito até 2,8° da borda. |
| **A4** | ✓ | ✓ | ρ ≤ 0,300; cruzamentos com = sem. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (20 m: 3,52° × 4,34°); (d) segue em conflito com A2. |
| **A6** | ✓ | ✓ | Faca e bazuca 0; DMR 1,70° × fuzil 4,71°. |
| **A7** | ✓ | ✓ | Tiro com a assistência agindo: 0 px; `security-regression` **33/33**. |
| **A8** | ✓ | ✓ | Padrão desligado; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | (e) três dedos em 0,5 s: **1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | ≥ 44 px em menu, ajustes, lobby (V1, V3). |
| **C3** | ◌ | ◌ | Igual: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque. |
| **C5** | ✓ | ✓ | Grade real 280 pontos: os mesmos 3 "tiros" de troca de arma; giro 0. |
| **C6** | ✓ | ✓ | 0,200° em 16 direções; zona morta 0,1225. |
| **C7**–**C9** | ✓ | ✓ | Não remedidos fora do percurso (código intocado). |
| **C10** | ✓ | ✓ | Toque real: carro anda **5,36 m no 1º s** com o polegar no talo, pente 28 → 28; helicóptero com o ⇧ translada 6,45 m (os mesmos 0,5 m de altura de `d381d29`); sair: 0 m, nada preso. |
| **C11** | ✗ | ✗ | (a) 4,939/5,270 = **93,7 %** (era 95,2 %); a corrida liga entre 0,81 e 0,85. |
| **C12** | ✓ | ✓ | Vermelha no 1º quadro a 20/40/50 m e no Visitante; branca a 70 m; apaga em 6 quadros. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1** | ✓ | ✓ | 1ª re-exposição: espiadas (59) 1º disparo mín. **1,408 s**; re-exposição de 6 s (29) mín. **1,46 s**. Engajamento novo (1ª exposição das espiadas): 1 disparo a 0,81 s fora da conta — outro jogador estava a 0,8 m do humano e o tiro seguinte do bot declarou o id dele. |
| **B2** | **✓** | ✗ | **0 violações em 88 primeiras re-exposições** (59 espiadas + 29 de 6 s). Menor folga: +0,154 s (escopeta, 14,6 m); fuzil/DMR a 29–30 m: 1º dano ≥ 4,06 s contra 3,23. Log `B2LOG`: 25 de 25 `novo → janela → volta(1) → janela`. Ressalva: o caso de `d381d29` (2,92 s contra 3,04) não tem explicação; `scripts/bots.js` só mudou na visada do vulcão, no chão do bot e nas paredes do painel. |
| **B3** | ◌ | ◌ | Fuzil PARADO a 24 m (bot travado): mediana **9,34 s** (10 chegaram a 100; 1 não). (a) a 30 m, (b), (c): não medidos. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ✓ | ✓ | Relevo: **0 de 12 164** pares escondidos pelo cliente vistos pelo bot. |
| **B7** | **✗** | ◌ | §2: carro que rolou — 14 disparos e 8 acertos com o humano tampado (2 de 37 válidos), todos pela pose de saída. Painel 0 (30), vulcão 0 (18); pares 0 de 10 285 (o 1 de caminhão não reproduziu). |
| **B8** | ✓ | ✓ | Não remedido (cone e notar intocados). |
| **B9** | ◌ | ◌ | Não medido. |
| **B10** | ✓ | ✓ | Não remedido. |
| **B11** | ✓ | ✓ | Não remedido (`buildMissShot` intocado). |
| **B12** | ✓ | ✓ | `three` em `dependencies`; o bot lê o GLB do vulcão do disco e, sem ele, grita no stderr (herdado); `js/vulcao-solido.js` é puro. |
| **B14** | **✓** | ✗ | Fuzil a 23,5–24 m, 50 espiadores, bot travado: (a) 0 de 50 primeiras re-exposições com dano antes do limite; (b) TTK finito em **44 de 50**, mediana **22,01 s = 2,36 × o parado** (9,34 s) ✓; (c) dano entre a 3ª e a 6ª exposição em **46 de 50 (92 %)** ✓; imunes: 6. Declarados: escopeta 6, DMR 2, sniper 1. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes, 45 s cada: **903 golpes, 0 através** (controle em céu aberto 353). Torre Nexus, 10 pontos da escada: **449 acertos, 0 sem linha livre do cliente**. |
| **P3** | ✓ | ✓ | PvE: voando a 13,2 m **0 golpes**, pousado 0; a pé 698. Bots: o portão (`playerUpdate.heli`) segue verdadeiro para o piloto legítimo com `heliNoAr` novo — voando a 12 m, pousado a 0,55 m, rasante de 150 m e pousado na rocha do vulcão (sonda por socket; a arena de P3 não foi refeita). Resíduo de segurança: fora do repo. |
| **P4** | ✓ | ✓ | (a) 0 travessias em 53 corridas contra 19 paredes; (b) os mesmos 11 de 101 vãos. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ◌ | ◌ | Igual no que foi remedido: atrás do caminhão, vida **100**; controle **48**; hitscan: soldado 0, caminhão 1 760 → 1 396; controle do lado acerta (104, morre). Não medidos: o bot e o veículo que queima; a morte de quem está dentro. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **229 draw calls p50** (222–253, mundo de 22,7 s). Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: 0 `Object3D`. |
| **D4** | ✓ | ✓ | Retrato do mundo idêntico desktop × `?mobile=1` (as atrações saem da semente agora — continua igual). |
| **D5** | ✓ | ✓ | Quatro arenas, 187 536 intervalos: p50 100 ms, **p99 102–103 ms**, **99,96–99,98 % ≤ 150 ms** (carga 2,2–4,8). Visada do bot: 1,8 µs (cidade), 1,6 µs (campo), **4,5 µs perto do vulcão** (era 2,4 µs). |
| **D6** | ✗ | ✗ | 4G emulado: **16,96 MB** (antes 16,94; limite 15,03); JS 2,77 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave (olhar e pular), queda, pouso. |
| **E4**, **E5** | ◌ | ◌ | Igual: chegar ao carro/helicóptero só pelo toque, a partir da nave, não completado. |
| **E6**–**E8** | ✓ | ✓ | Solo: JOGAR DE NOVO / VOLTAR AO MENU; espectador "botão ⇧ troca" → lobby; fim → lobby em 8,7 s → nova partida, nada preso. |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). |
| **E10** | ✓ | ✓ | Retrato na pausa, nada preso. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; 0 `pageerror` no que foi percorrido. |
| **E15** | ✓ | ✓ | V2 e V1: pouso a 0,1 m do baú; 1º toque abre e o item entra; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque, anda 23 m, sai no 1º toque, nada preso. |

---

## 4. Defeitos NOVOS, com reprodução mínima

**[NC]** = nasceu de uma correção desta rodada.

1. **[NC — `adb0a99`] Enquanto o carro rola, o ex-motorista SOME para o
   servidor e para todos — e o carro fica preso onde ele saiu para os outros.**
   O `br-game.js` emite `carSolto` (normal) e, no mesmo tique, o `state`
   VOLÁTIL; o socket.io descarta o volátil quando o transporte acabou de ser
   ocupado. Medido com dois navegadores, pelo toque: **0 `playerUpdate` do
   ex-motorista durante o rolar inteiro** (buracos de 2,06, 2,26, 2,65 e 1,10 s
   nas quatro tentativas; o cliente manda `carSolto` por até 10 s). Nesse tempo
   o OUTRO cliente o vê ainda "dirigindo", e prende o carro na mão dele, no
   ponto de saída — e depois o `carRola` já acabou: **o carro fica a 55,2 m de
   onde está** (esportivo a 117,9 km/h), 14,0 m (buggy a 59,4), 11,9 m (46,3).
   O outro jogador anda até o carro que ele vê e toca USAR: **"Veículo
   ocupado!"** em 4 de 4 execuções a 118 km/h — o sintoma do NC-2, agora para
   todo mundo menos o motorista. Prova da causa: com o `state` não volátil
   (mutante de diagnóstico), 20–30 `playerUpdate` chegam durante o rolar, o
   maior buraco cai para 0,2 s, o outro desenha o carro a **0,27 m / 0,18 m** e
   entra. O teste do construtor (`carro-solto`, "observador") passa porque o
   ex-motorista dele é um socket que manda UM `state` firme antes dos
   `carSolto` — o dublê não reproduz o tique do cliente (§5).
2. **[NC — `adb0a99`, segurança] O `carSolto` dá ao ex-motorista, por 12 s,
   um poder sobre o carro que ele não tinha dirigindo**, com efeito sobre os
   outros jogadores. Exige cliente modificado. Detalhe **fora do repo**.
3. **[NC — `afb1ae8` + `88f3204`] Sair do carro sob a rocha do vulcão enterra o
   jogador: imune, invisível, e anda por dentro da rocha.** O carro roda no
   relevo (o resíduo declarado), que em **21 % da pegada do vulcão fica mais
   de 1 m abaixo da rocha desenhada** (7 390 m²; 12 % mais de 1,62 m). Quem sai
   pelo USAR nasce no relevo (`tryToggleCar` usa `heightAt`), e o `groundAt`
   não o sobe (degrau de 0,65 m), nem a "parede" de `afb1ae8` o empurra (ela só
   barra quem ENTRA na rocha vindo de fora). Pelo toque, com o carro posto no
   relevo debaixo da rocha: **pé 5,0 m e olho 3,4 m abaixo do desenho; 2
   acertos do anfitrião → vida 100; o bot não o vê; a tela do anfitrião não o
   mostra; ele não acerta para fora; anda 14 m e segue enterrado em 20 de 20
   quadros.** Antes de `88f3204` a bala atravessava a rocha (ele tomaria tiro);
   antes de `afb1ae8`, todo mundo pisava no relevo. É esconderijo, não arma —
   mas o gás e a lava são o que o tiram dali.
4. **[NC — `6cd95c9`] O carro atravessa o painel do campo de tiro.** O painel
   entra em `Structures.walls` no `createMapToys`, DEPOIS do laço que dá corpo
   CANNON às paredes no boot — o mesmo erro que o próprio `game.js` documenta
   no `addStaticBox` dos segredos. Pelo toque, o buggy a 73 km/h cruza o painel
   desenhado nos dois sentidos. O corpo do jogador e a bala param nele.
5. **O NC-3 do laudo 5 não fechou em pé** (origem `e66d277`; `41d1711` empurra
   o OLHO, a vítima testa o PÉ + 1,0 m). Em encosta, do lado de baixo de 23
   pedras, o ponto da vítima fica dentro da malha com o olho fora (575 posições
   em pé, 125 agachadas). Pelo toque, em pé: **vida 100 (48 a 1,5 m dali) e ele
   acerta o anfitrião, com a cabeça visível na tela do anfitrião** — em 2 de 3
   pedras. Coordenadas **fora do repo** (no mesmo arquivo).
6. **Escada da Torre Nexus: debaixo do 1º lance o jogador fica com o tronco
   dentro de um degrau** (os degraus seguram bala e não corpo, e o lance passa
   a ~1 m do piso do saguão). Pelo toque: o anfitrião no saguão não o vê na
   tela, reporta 2 acertos → **vida 100**, e ele **acerta o anfitrião**.
   Anterior (a escada é de antes desta frente); achado pela varredura nova.
7. **O bot não segue o carro solto** (não escuta `carRola`): é o B7 ✗ (§2a).
   Anterior, mas `adb0a99` declarava resolver "o servidor e os outros".
8. **Piloto a pé:** o resíduo de segurança do laudo 5 fechou no caso medido
   lá; segue aberto num caso vizinho do mesmo vetor. **Fora do repo.**
9. Inalterados: **P1**, **C11**, **C1(e)**, **D6**, **E9**.

**Observações sem veredito:**
(a) **A beira da saia do vulcão virou muralha**: onde a rocha desenhada começa
mais de 0,65 m acima do relevo ela é parede (`afb1ae8`); 5 de 8 radiais a pé
param ali (a 87–115 m do centro). É coerente com o desenho; o vulcão passou a
ser subível só por alguns lados.
(b) **A pilha de caixas dos fogos e o canhão vermelho** das atrações seguem
desenhados sólidos sem colisor de bala (3 pares "a tela tampa e a bala passa":
2 do canhão, 1 dos fogos). Anterior.
(c) **Custo:** o `rayBlockedAt` do cliente ficou igual (cidade 8,5 µs × 8,4–8,5;
campo 7,1 × 6,8 µs); a visada do bot perto do vulcão dobrou (4,5 × 2,4 µs), sem
efeito no passo dos bots (D5).

**Contagem:** 6 critérios reprovados; **0 nasceram de correção desta rodada**;
**4 defeitos fora da régua nasceram de correções** (itens 1–4, um de
segurança); **2 correções não fecharam o que prometiam** (itens 1 e 5).

---

## 5. Testes que passam por acidente — e os mutantes

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| peças do telhado voltam a laje (`macica → p`) | `r6-dentro`: entra **4/4**, vida 100, acerta 3/4 | `cabeca-no-solido` + `paredes-paridade`: 1 vermelho em 32 |
| sem o empurrão do olho (pedra/cacto) | pedra agachado: olho dentro **3/4**, vida 100/100/88, acerta | `cabeca-no-solido`: 2 vermelhos em 4 |
| servidor ignora `carSolto` | `r6-carro`: `carRola` **0** (era 25–26) | `carro-solto` + `veiculo-vida-servidor`: 4 vermelhos em 11 |
| `heliNoAr` sempre verdadeiro | `r6-seg`: no relevo `heli = true` | `veiculo-vida-servidor` + `security-regression`: 1 vermelho em 41 |
| painel fora das paredes do cliente | corpo atravessa **4/4**; pares: cliente tampa 131 (era 397), bot cego 266 | `painel-galeria`: 3 vermelhos em 4 |
| painel fora das paredes do bot | pares: bot vê **266/397** tampados | `atracoes-painel` + `bots-paredes`: 3 vermelhos em 21 |
| rocha fora da bala do cliente | pares do vulcão: tampa 887 (era 1 124), bot cego **239** | `vulcao-bala`: 1 vermelho em 3 |
| rocha fora da visada do bot | pares do vulcão: bot vê **228/1 124** | `vulcao-solido` + `bots-visada`: 1 vermelho em 13 |
| corpo de volta ao relevo | radiais: **371** quadros enterrados (até 2,22 m) | `vulcao-corpo`: 1 vermelho em 3 |
| (diagnóstico) `state` não volátil | `r6-carro`: o outro desenha o carro a 0,27 m e entra | — |

Sem mutante, a suíte inteira passa (abaixo). **Todo teste novo do construtor avermelha com o mutante do seu conserto** — o que eles não pegam é o que eles não medem:

- **O teste do observador do carro solto passa com o defeito no ar** ([NC] 1).
  `test/carro-solto.test.js` põe um SOCKET como ex-motorista, que manda um
  `state` firme e só depois os `carSolto`; o cliente de verdade manda os dois
  no mesmo tique e o `state` volátil cai. Formato 8 do CLAUDE.md (dublê bom
  demais) e o "testes primários primeiro": o observador é uma página, mas o
  ex-motorista não é.
- **Nenhum teste cobre o ponto que a VÍTIMA testa** (pé + 1 m) contra a malha
  da pedra: `cabeca-no-solido` mede o olho — que é o que `41d1711` conserta —
  e por isso não vê o item 5.
- **Nenhum teste sai do carro debaixo da rocha** ([NC] 3): `vulcao-corpo`
  sobe a pé por 12 radiais, que é o caminho em que a "parede" funciona.
- **As minhas sondas erraram, e está no §0**: o filtro `noCollide` que passaria
  por construção, o ponto de imunidade errado no NC-3, a poda contra a força
  bruta sem a rocha, os pares no relevo debaixo da rocha, a arena que não
  conseguia trazer carro e a âncora de chão do vulcão sem o terreno.

---

## 6. Prioridade

1. **§4 itens 5 e 6 — lugares onde o jogador não leva tiro e atira** (pedra em
   pé, escada da Torre). A mesma família do laudo 5: o sólido que barra bala
   contém o ponto que a VÍTIMA testa. Detalhe fora do repo.
2. **§4 [NC] 1 — o `state` do ex-motorista some enquanto o carro rola**: o
   carro solto continua "Veículo ocupado!" para os outros, e quem sai de um
   carro rápido fica parado para todos por até 10 s.
3. **B7 ✗ — o bot não segue o carro solto** (§2a). Mesmo conserto de fundo: o
   bot escutar a pose do carro solto.
4. **§4 [NC] 3 — sair do carro enterra o jogador na rocha do vulcão.**
5. **§4 [NC] 2 e item 8 — segurança** (fora do repo).
6. **§4 [NC] 4** — o carro atravessa o painel.
7. **P1**, **C11** (decisão do dono), **C1(e)**, **D6**, **E9**.
8. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12, V1.
