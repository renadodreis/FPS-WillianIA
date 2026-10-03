# Validação do porte para CELULAR — commit `b92a932`

Décima segunda rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63), `validacao-3d7d47a.md` (46/63),
`validacao-a03c122.md` (46/63). Autor: o **validador** — não escreveu código de
produto nem teste do repo. Nada foi commitado. **A régua não mudou**
(`git diff a03c122 b92a932 -- docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `a03c122`: `a301808` (só o laudo 11) e
`b92a932` — só cliente (`js/cannon.js`, `js/maptoys.js`, `game.js`), testes
(`test/maptoys.test.js`, `test/xr-canhao-mira.test.js` novo) e o `CLAUDE.md`:
o curso reinicia com o pé no chão por 0,25 s; a 1ª argola volta a acender; a
mira que cruza uma argola (até 4 m) voa para ela; o puxão não acontece com
veículo no caminho; o tempo do curso em centésimos antes de comparar; a mira do
canhão pela `vistaMundo()`; e o empurrão de corpo de tronco/pedra só na faixa
de altura. **O `server.js` não mudou** (sha256 `45fa3121…`, o mesmo de
`a03c122`), nem o bot, nem a geometria de bala.

---

## 0. Condições

- **Árvore:** `dev` em `b92a932` (`git log -1` no início, 07h51, e no fim,
  10h09). `git status` antes e depois: limpo, e no fim só ESTE arquivo (não
  rastreado). `npm run lint` limpo. sha256 do índice e dos 512 arquivos
  rastreados em `out/r12/arvore-b92a932.sha256`, conferido no fim: **idêntico**.
  Mutantes em **cópias** (`copia-r12` para as minhas sondas, `copia-r12c` para
  os testes do construtor) — as cópias de r11 renomeadas e sincronizadas por
  `rsync` com a árvore (sem `.git` e sem `.claude/worktrees`; disco a 100 %,
  5,2 GB livres); restauradas por sha256 antes de cada mutante e conferidas no
  fim (`game.js`, `server.js`, `br-game.js`, `js/cannon.js`, `js/maptoys.js`,
  `js/maptoys-core.js`, `js/cannon-core.js`, `js/paredes.js`,
  `js/obstaculos.js`, `scripts/bots.js` e os quatro testes = árvore). O
  **"antes"** é o mutante `ANTES`: `js/cannon.js`, `js/maptoys.js` e `game.js`
  de `a03c122` (`git show`) na cópia, o resto igual à árvore.
- **Carga:** amostrada a cada 20 s das 07h51 às 10h09 (UTC−3; 416 amostras):
  carga de 1 min **mediana 3,1, p90 3,9, máximo 7,9** (às 08h42, dentro da
  suíte, um pico de ~1,5 min) em 12 núcleos. As sondas rodaram uma por vez,
  com a carga entre **2,6 e 3,5** no início e no fim de cada uma (mutantes até
  3,9; testes do construtor até 4,1), sempre declarada no artefato.
- **Ordem:** a **suíte rodou PRIMEIRO** (07h54–09h20), com a árvore limpa e
  nada meu ao lado além de três amostradores leves (carga; `ps`/memória/disco;
  um `curl` ao CDN a cada 10 s — §1). Depois, as sondas.
- **GPU:** Chrome headless, o backend do harness. Tempo de frame não medido.
- **Viewports:** V2 800×360, `hasTouch`, `isMobile`, DPR 2, `?mobile=1` (BR e
  solo); XR: IWER (`metaQuest3`) na janela do harness. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no
  rAF) — mira por arrasto no `#tcLook`, disparo pelo botão USAR, helicóptero
  pelo USAR, analógico pelo `#tcMove`, pulo pelo ⇧, agachar pelo ⇩; recarga da
  página no mesmo navegador (mesmo `localStorage`).
- **O servidor medido é o servidor de verdade.** `srv11.js` (de r11, sem
  mudança): o `server.js` da árvore byte a byte (sha256 `45fa3121…`) carregado
  em processo com UMA linha no fim que expõe `players`/`server`; ele serve a
  página e dá o `strikes` do anti-teleporte. Solo, XR e `desemp`: o
  `node server.js` que o harness sobe.
- **Instrumentação declarada:** a de r11 — os teleportes da SONDA somam
  strikes; a sonda espera a re-ancoragem e ZERA os strikes do próprio jogador
  antes de cada toque. Detalhe fora do repo. Dublês declarados, todos de
  COLOCAÇÃO ou TRAJETÓRIA (nunca da regra medida): o chassi do carro posto no
  lugar; o carro levado por uma reta durante a carga (um rAF depois do quadro do
  jogo); o helicóptero levado sobre o mercado/refúgio e pelas argolas.
- **Portas:** 3990 (+3991, o servidor que o harness sobe e não é usado), 3993,
  3994, 3995, 3996, 3984; os testes do construtor na cópia, nas portas deles
  (3261, 3882). Nunca a 3000. Antes de cada bloco, `ps` sem `run-tests`/
  `node --test`/`server.js` alheio; nada meu rodou durante a suíte.
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **`r12-corpo` (A), 1ª execução:** comparei a posição do produto DEPOIS do
     `QA.reset`, que já roda 2 quadros (o empurrão acontecia ali): 787 de 4 048
     "discordâncias" eram artefato. Refeito devolvendo o pé à amostra depois do
     reset: **4 038 de 4 048** concordam (10 na borda do círculo).
  2. **`r12-corpo` (C), 1ª execução:** pus o helicóptero na altura do heliponto
     sobre o chão (o heliponto é elevado) — fora do alcance do USAR, "não
     entrou" × 6. Refeito com ele no chão.
  3. **`r12-corpo` (B), 1ª execução:** o primeiro barril fica em encosta com
     obstáculo no caminho — o pulo não aconteceu (pé no máximo −0,31 m). Refeito
     com o barril e o rumo mais livres e planos (pulo conferido pela `vel.y`).
  4. **A âncora de malha (B, C):** o `Raycaster` do three respeita o lado do
     material; as malhas do alvo ganharam CÓPIAS de material em dupla face (o
     render do QA é no-op). Mesmo assim a reta não registrou a tenda (planos):
     o veredito da tenda vem do deslocamento num quadro, não da âncora.
  5. **`r12-argolas` (b):** a receita de r11 para um voo PARCIAL (mirar 3,3–4,5°
     fora para perder só a 5ª) não produz mais voo parcial — a mira na argola
     puxa esses desvios para o curso (§A.1.3). Os voos parciais agora vêm da
     saída do helicóptero e do carro no caminho.
  6. **`r12-argolas` (e2), 1º tempo:** o carro chegava depois de o jogador
     passar; acrescentei três tempos.
  7. **`recursos12.sh`:** a coluna "renderers" usa um filtro que nunca casa
     (o processo do renderer não leva `--headless`) — inútil; as contagens de
     Chrome/`server.js` valem.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `r12-argolas.js` (seções a–g, s), `r12-recarga.js`, `r12-xr.js`,
  `r12-corpo.js` (A–D), `r12-faixa-node.js`, `r12-canhao-seeds-node.js`,
  `r12-bootdiag.js`, `r12-boottempo.js`, `desemp.js`, `srv11.js`, `mut12.py`,
  `cadeia-r12.sh`, `mut12-testes.sh`, `carga12.sh`, `recursos12.sh`,
  `cdn12.sh`. Saídas em `out/r12/`.

---

## 1. Placar

> **46 aprovados · 4 reprovados · 13 não medidos, em 63** (46/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `a03c122` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Nenhum critério mudou de cor.** Nenhum dos 63 mede o curso de argolas, o
canhão nem o corpo contra árvore/pedra/POI; o que a leva toca na régua — o
texto do HUD (C4), nada preso depois do voo (C10), o mundo da semente (D4), as
alocações e as draw calls (D2, D3), os bytes do boot (D6), os erros de página
(E12) — foi remedido e segue com a mesma cor. O resto é **não remedido**: o
código de cada um não mudou nesta leva, e o veredito de `a03c122` vale com o
número de lá.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista
sete.

**Regressões obrigatórias (§8):** M1 ✓ (não remedido), M2 ✓ (não remedido),
C4 ✓, D2 ◌ (a parte medida passa), D6 ✓ (conta), E10 ✓ (não remedido), E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Defeitos NOVOS nascidos das correções desta leva: 3** (§4, [NC] 1–3; os três
baixos, **nenhum de segurança**). Em `a03c122`: 4; em `3d7d47a`: 2; em
`f672d81`: 2; em `4433c4d`: 2; em `a9a4ffd`: 3; em `afb1ae8`: 4.
**Os 4 [NC] de r11 e os §4.5–4.7 de r11 fecharam** no caso que r11 mediu; **duas
correções não fecharam tudo** (§4.4 e §4.5: o puxão com carro que ENTRA no
caminho ou EM CHAMAS; o "RECORDE" por queda de quadro).

`test/security-regression.test.js`: **38/38** (na suíte).

**Suíte completa** (`npm test`, 07h54–09h20, sem sonda minha ao lado, carga
mediana 3,2, p90 4,0, máx. 7,9): **2 630 testes, 2 567 passaram, 0 falharam,
60 cancelados, 3 pulados**. O runner re-rodou **9 arquivos** isolados, todos com
o MESMO sintoma (o `before` não termina: o `bootGame` esperou 90 s por
`window.__game && window.__MP`): `hud-contexto` (**não é XR**) e oito de XR —
`xr-arma-recarga`, `xr-body`, `xr-conforto`, `xr-dicas-controles`,
`xr-mao-controle`, `xr-painel-corpo`, `xr-prefs-giro`, `xr-weapon`. Os 9 →
**FLAKE**; três deles (`xr-arma-recarga`, `xr-dicas-controles`,
`xr-painel-corpo`) falharam DE NOVO na 1ª rodada isolada e passaram nas duas
seguintes. Linha final do runner: "só flakes — suíte VERDE"; `ps` vazio de
`run-tests` antes de ler o placar.

**A janela de boot > 90 s (observação (h) de r11 — o pedido do orquestrador:
"carga" × "algo crescendo"): não é carga e não é o código crescendo — é o CDN.**
- *Não é carga:* `hud-contexto` estourou com a carga em **2,5–2,7**; a página
  parada não gastava CPU (a carga não subiu na janela de 90 s).
- *O boot de XR fora da suíte não cresceu:* harness `bootEmVR`, N = 5
  alternado com o cliente de `a03c122`, carga 3,2–3,4: árvore **3,58–3,96 s** ×
  **3,44–3,86 s** (r11: 3,75–3,90 × 3,61–3,95). 0 falhas.
- *A causa, reproduzida fora da suíte* (`r12-bootdiag`: o boot do harness —
  mesmo `server.js`, mesmos argumentos do Chrome, `?tier=baixo`, as mesmas
  bandeiras — com o DevTools anotando cada requisição; 30 boots XR + 30
  `?mobile=1`, carga 2,7–3,4): **2 de 30 boots XR pararam 90 s em "CARREGANDO
  O MUNDO..."** (sem fase nenhuma — o módulo do jogo nem começou), com **0
  requisições pendentes** e uma requisição ao **cdn.jsdelivr.net falhada com
  `net::ERR_FAILED` em 2–3 ms** (`three.core.js`; `OutputShader.js` +
  `LuminosityHighPassShader.js`). Os outros 58 bootaram em 2,0–2,4 s (p50
  2,20 s XR, 2,04 s celular). O `importmap` do `index.html` aponta `three`,
  `three/addons/` e `cannon-es` para o CDN: **26 requisições ao CDN por boot**,
  e cada arquivo de teste abre um Chrome de perfil NOVO (sem cache). Uma falha
  derruba o grafo de módulos inteiro — o `game.js` nunca roda.
- *Por que "cresce":* ~228 boots de página por suíte (164 arquivos), 26
  requisições ao CDN cada (≈ 5 900); a taxa de boots com falha medida na sonda
  (2 de 60, 3,3 %) dá ~7–8 por suíte — r10: 1, r11: 5, o orquestrador em
  `b92a932`: 7, esta: 9.
  Acompanha o número de boots (os arquivos de XR cresceram) e a sorte da rede.
  Durante a suíte, o `curl` ao CDN a cada 10 s (410 amostras): todas 200, uma
  com DNS de 5,1 s — o `curl` (TCP/h2) não vê a falha que o Chrome viu (o Chrome
  misturou h2 e h3 no mesmo boot).
- **O jogador também depende disso** (observação, não é desta leva): a mesma
  falha no 4G deixa o menu em "CARREGANDO O MUNDO..." para sempre, sem aviso e
  sem nova tentativa (no 1º acesso; depois o cache do navegador cobre).
  Sugestão (não é do validador): o harness servir `three`/`cannon-es` locais
  na MESMA versão do importmap (o `node_modules` tem `three` 0.185.1, não
  0.184.0) por interceptação de requisição; e o produto ter um aviso/recarga
  quando o módulo não carrega.

---

## A. Os quatro itens do briefing, um por um

Partida BR `?mobile=1`, V2 (800 × 360), toque do DevTools, servidor de verdade
(salvo onde diz solo). **A mira é sempre pelo TOQUE:** arrasto no `#tcLook`
calibrado pela `camera.matrixWorld` (100 px = 18,335°), até o rumo da vista
ficar a ≤ 0,003° do alvo; o disparo é o toque no USAR ("USAR · SER DISPARADO
🎪"). **Âncoras:** as 5 argolas DESENHADAS (as `TorusGeometry` r 2,6 da cena,
centro e normal pela `matrixWorld`) e a travessia pela MINHA conta sobre
`player.pos` gravado a cada quadro num rAF depois do quadro do jogo (o produto
ao lado); o brilho desenhado (`emissiveIntensity`) de cada argola; o relógio de
parede; o `strikes` do servidor de verdade; a caixa DESENHADA do carro (a união
das caixas das malhas no referencial do grupo); a malha desenhada do tronco
(`treeVariantMeshes`) e do GLB do mercado/refúgio. **"Antes"** = o MESMO
roteiro com o cliente de `a03c122` na cópia.

### 1. Os [NC] 1–4 de r11

**1.1 O curso reinicia com o pé no chão por 0,25 s — FECHOU.**
- *Saída do helicóptero pelo USAR depois da 2ª argola* (a trajetória do
  helicóptero é dublê declarado; a saída é o toque): o jogador sai a y = 20,1 m
  com o `onGround` velho do helicóptero por 1 quadro e **o curso NÃO reinicia
  no ar** (`next` fica 2 durante a queda); reinicia **234 ms depois do pouso**,
  e a 1ª argola acende. Antes: `next` 2 → 0 no quadro da saída, **a 17,7 m do
  chão**. Mutante `SEMchaoT` (reinício no 1º quadro "no chão"): reinicia no ar a
  17,6 m — a sonda avermelha.
- *O curso inteiro pelo helicóptero:* 5 de 5, "💫 3.3s", sem reinício no meio
  (o `!state.flying` segura).
- *No voo do canhão:* em **51 voos** no BR: **0 quadros "no chão" no ar, 0
  reinícios no meio do voo, 0 strikes**.

**1.2 A 1ª argola volta a acender — FECHOU.** Depois de **51 de 51** voos
(BR, árvore) a 1ª argola desenhada está acesa (0,9) e as outras não (0,3);
depois do voo parcial (a saída do helicóptero), idem. Antes: 0,3 nas cinco em
**26 de 26**. Mutante `SEMacende`: 0,3 × 5.

**1.3 Mirando uma argola, o voo vai para ela — FECHOU o caso de r10/r11.**

| de onde (do centro) | mira (pelo toque) | agora | antes | a 1ª argola passa a (agora × antes) |
|---|---|--:|--:|---|
| centro | 3ª | 5 | 5 | 0,05 × 0,05 m |
| borda de r10 (1,2; 1,2 nos eixos) | 1ª | 5 | 5 | 0,07 × 0,37 m |
| lado, 1,7 m | 1ª | **5** | 2 | 0,05 × 1,13 m |
| lado, 1,7 m | 3ª / 5ª | 5 / 5 | 5 / 5 | 0,05 × 0,07 / 0,05 × 0,20 m |
| lado, 4 m | **1ª** | **5** | 1 | **0,05** × 2,57 m |
| lado, 4 m | 3ª / 5ª | 5 / 5 | 5 / 5 | 0,05 × 0,12 / 0,06 × 0,45 m |
| lado, 4,5 m | **1ª** | **5** | 0 | **0,05** × 2,87 m |
| lado, 4,5 m | 3ª / 5ª | 5 / 5 | 5 / 5 | 0,06 × 0,12 / 0,05 × 0,51 m |
| outro lado, 4 m | 1ª | **5** | 1 | 0,04 × 2,58 m |
| diagonal de trás, 4 m | 1ª | **5** | 2 | 0,08 × 1,37 m |
| atrás, 4,5 m | 1ª / 3ª | 5 / 5 | 5 / 5 | 0,09 × 0,05 / 0,09 × 0,09 m |
| frente, 4 m | 3ª | 5 | 5 | 0,01 × 0,01 m |

Para trás: o voo sai 172° do curso, para onde o jogador olha (0 argolas). Para
cima (80°): igual ao horizontal (5 de 5). Mutante `SEMargola` (sem a mira na
argola): lado 4 m → 1ª **1 de 5** (2,57 m), 4,5 m → **0 de 5** (2,87 m) — os
números de r11.

*A JANELA da mira na argola, contra a argola DESENHADA* (mira desviada da 1ª
argola pelo toque):

| de onde | silhueta desenhada da 1ª (raio externo 2,78 m) | desvio que ainda voa o curso (5 de 5) | desvio que voa para onde mira |
|---|---|---|---|
| centro | ±15,5° | 0, ±10, ±14, ±18, **±22°** | +26°, +30° (0 argolas) |
| lado, 4 m | −14,9° / +12,3° | 0, +10, +14, ±18° | +22°, +26°, +30° (0); −22° → 7,8°, 2 de 5 |

A mira que passa **até ~6,5° FORA** da argola desenhada (do centro) ainda voa o
curso: é a tolerância de 4 m do centro da argola que o commit declara (1,4 m
além do raio). Observação, não defeito: quem quiser voar ~20° fora do curso
para cair noutro lugar ganha o curso; e o cano, parado, aponta para onde o
jogador olha — só gira para o curso durante a carga (leitura de `update()`).

**1.4 O puxão não atravessa veículo — FECHOU para o carro INTEIRO PARADO;
segue com o carro que ENTRA no caminho e com o carro EM CHAMAS** (§4.4).

| caso (jogador a 4,5 m do centro, mira na 3ª) | agora | antes |
|---|---|---|
| (e1) buggy inteiro parado ENTRE o jogador e o centro | **sem puxão**: lança a 4,50 m; **0 de 30** quadros da carga no círculo de corpo do carro (2,04 m); o voo passa a ≥ 1,13 m da caixa desenhada; **1 de 5** (§4.3) | puxão através: **28 de 29** quadros no círculo, a **0,12 m** do centro do chassi, tronco na caixa desenhada em 2 quadros, 41 m/s aparentes; 5 de 5 |
| (e3) buggy parado AO LADO, fora da linha | puxa, lança do centro, **5 de 5**, 0 quadros no círculo | igual |
| (e2) buggy que ENTRA na linha durante os 0,5 s da carga (4 tempos) | puxa (decidido no toque): **10–17 de 29** quadros no círculo, tronco na caixa desenhada em 0–2, até **25,4 m/s** aparentes (0,42 m num quadro); 5 de 5 | igual (10–17; 13–26 m/s) |
| (D, solo) buggy EM CHAMAS (vida zero, 30 tiros) parado entre | puxa: **28 de 29** quadros no círculo, a **0,12 m** do centro do chassi, tronco na caixa em 2 | igual (28 de 29; 0,14 m) |

Servidor: **0 strikes** em todos (BR). "Não quebra o curso quando há carro":
com o carro ao lado, 5 de 5; com o carro no caminho, o voo sai da beira e o
curso não completa (1 de 5 — e vai para a argola errada, §4.3). Mutante
`SEMcaminho` (o estado de `a03c122`): e1 volta a **28 de 30** quadros no
círculo, a 0,13 m do centro.
*Outra coisa que o puxão possa atravessar:* no canhão da semente 424242, nada
com corpo a ≤ 6,1 m (o alcance do `fire()`); em **25 sementes** (424242 e
1–24), **uma** tem um obstáculo de corpo ao alcance (semente 5: um cacto com a
borda a 5,55 m do centro) e **nenhuma** tem parede de corpo — o puxão não
consulta obstáculo, mas o caso é raro. Jogador contra jogador não tem colisão
neste jogo (nada novo).

**C10 no canhão:** polegar no talo do toque ao pouso — lança do centro, 5 de 5,
depois do pouso anda (8,6 m/s); soltar → **0,004 m/s**, nenhuma tecla presa,
`shooting`/`aiming` falsos.

### 2. O tempo do curso em centésimos — FECHOU a recarga e as voltas iguais em quadro estável; RESÍDUO por queda de quadro

Solo de verdade, `?mobile=1`, toque no USAR, voo do centro, a página
RECARREGADA no mesmo navegador. Âncoras: o texto da tela (`#centerMsg`), o
`localStorage`, e o tempo CRU da volta (o `t` que o jogo passa ao MapToys nos
quadros em que a próxima argola muda — o `update` embrulhado só para ler).

| sessão (voltas) | agora | antes (`a03c122`) |
|---|---|---|
| 1 — 6 voltas, 60 q/s | 1 "RECORDE" (a 1ª, o primeiro tempo) + 5 × "💫 1.8s · recorde 1.8s"; crus **1,7499–1,7501 s** → gravado **"1.75"** | **3** "RECORDE" (a 1ª + 2 por ruído: 1,7999 < 1,8) |
| 2 — recarregada, 4 voltas | **0** "RECORDE" | **1** (a 1ª depois de recarregar: 1,7998 < "1.8") |
| 3 — CPU ×4 pelo DevTools (34,7 → 56 q/s), 3 voltas | **1** "RECORDE": a 1ª volta a 34,7 q/s mede 1,7436 → **1,74** < 1,75 ("💫 CURSO COMPLETO 1.7s — RECORDE!") | 1 (1,7924 → "1.79") |
| 4 — recarregada, 3 voltas | 0 | 0 |

Em quadro estável: **0 de 12** voltas iguais anunciadas "RECORDE" (antes 3 de
12). **Resíduo:** o tempo da MESMA volta depende do quadro — 1,74 s a ~35 q/s,
1,75 a 60, 1,76 a 56 —, então quem cai de quadro "bate" o recorde por 0,01 s
(1 de 3 voltas estranguladas; antes também 1 de 3). E a tela compara
centésimos mas mostra décimos: "💫 1.8s · recorde 1.7s" (1,75 contra 1,74).
Mutante `SEMcentesimo`: a 1ª volta depois de recarregar volta a sair
"RECORDE" (1,7499 < "1.75"), nas sessões 2 e 3.

### 3. A mira do canhão em XR pela `vistaMundo()` — FECHOU

Sessão `immersive-vr` (IWER). Régua: o giro do rig (`XR.rig.rotation.y`, do
módulo de giro) + o ângulo que EU escrevo na cabeça do dispositivo; ao lado, a
`camera.matrixWorld`. A cabeça aponta para o curso, curso + 60° e curso − 120°
(sem argola na mira: a mira na argola puxaria para o curso e esconderia erro de
até ~22°).

| rig | voo × cabeça no mundo (curso / +60° / −120°) | cano parado mirando | cano travado no voo | antes (voo) |
|---|---|---|---|---|
| 0° | 0,00 / −0,04 / +0,04° | 0,00° | = o voo | −0,04…0,04° |
| −83,7…−86,6° | 0,00 / −0,01 / +0,01° | ≤ 0,01° | = o voo | **83,7–84,2°** |
| −173,2…−173,7° | 0,00 / +0,04 / −0,04° | ≤ 0,01° | = o voo | **173,7–174,9°** |

O CANO desenhado (o eixo +Z do grupo que inclina o cano, na `matrixWorld`)
acompanha a mira parado e trava no rumo do voo. Antes, o cano errava o mesmo
giro inteiro (83,7°, 173,7°). Mutante `MIRAcamera`: 83,8–174,2° no voo e no
cano. O teste novo do construtor: controle 0,00° a −69,2° de rig; mutante
**91,67°** — vermelho.

### 4. O corpo bate em tronco e pedra só na faixa de altura deles — o voo FECHOU; o AVESSO aparece no mercado, no refúgio e na tenda

- **O voo do canhão passa reto:** em **51 voos** no BR, **0 saltos laterais**
  (antes: **147** saltos em 20 de 26 voos, até 0,20 m por quadro — o tronco a
  20 m de altura). Mutante `SEMfaixa`: 4 saltos (até 0,197 m) no voo do centro
  e a 4ª argola a 0,76 m do centro (árvore 0,05).
- **Tronco — 0 de avesso.** 18 árvores (4 gigantes, 8 retorcidas, 6
  bosquetes; inclinação 0,04–0,45), **28 080 amostras** de pé em volta de cada
  tronco (13 raios × 24 rumos × 5 alturas: no chão de verdade e no pulo, 0,4 /
  0,8 / 1,2 / 1,6 m — o ápice do pulo é 8,4²/(2·22) = 1,60 m). Âncora: a malha
  instanciada desenhada, na faixa só-madeira do modelo; o corpo a 0,3 / 1,0 /
  1,62 / 1,75 m do pé, "dentro" = paridade ou < 10 cm da madeira. A regra nova
  deixa 21 967 posições (a antiga 21 405). **Corpo no TRONCO desenhado: 0** —
  com a regra nova e com a antiga. Corpo em OUTRA madeira desenhada (galho,
  raiz — que nunca teve colisor): 63, **as mesmas 63 com a regra antiga**: a
  faixa não abriu nenhuma. O PRODUTO (um quadro de verdade do `playerUpdate`
  por amostra, 4 048 amostras): concorda com a regra escrita em 4 038; 67 corpos
  terminam perto de galho, **0** perto de tronco, **0** em posição que só a
  regra nova deixa. Agachado: a regra não olha a postura (1,7 m sempre — mais
  conservador).
- **Pedra, cacto, encosta, vulcão — nada alcançável muda.** Nas 105 pedras da
  semente o topo desenhado vai até **1,64 m** (a faixa da regra é chão + 3,4 m;
  do chão, o pé chega a 1,6 m e a cabeça a 3,3 m); 0 pedras/cactos em que o chão
  na borda do círculo de corpo fica acima do topo da regra (encosta); 0
  obstáculos sob a rocha do vulcão. Dos 133 cactos, 29 são desenhados mais altos
  que 3,4 m (até 3,82 m) — só se chega lá caindo.
- **Barril e tenda — o pulo agora passa por cima** (andar/correr pelo
  analógico + ⇧, de verdade): o barril (1,05 m) — pé a 1,63/2,01 m, atravessa,
  nunca a < 0,3 m da malha desenhada, 0,42 m num quadro ao andar (0,14
  correndo); a **tenda** (cumeeira 1,16 m) — pé a 1,46 m, e ao cair DENTRO do
  círculo de corpo (1,72 m) o corpo é jogado **1,03 m** (andando, para trás) e
  **1,28 m** (correndo, para a frente) **num quadro só**. Antes: os dois
  seguravam a qualquer altura (0,06/0,14 m por quadro, ninguém atravessa).
  [NC] 2.
- **Mercado e refúgio — o corpo entra no desenho entre 3,4 m e o topo.** O
  círculo de corpo deles não tem faixa própria: vale a da BALA, chão + 3,4 m,
  mas o mercado tem **6,5 m** desenhados e o refúgio ~**10,5 m**. Saindo do
  helicóptero (pelo USAR) em cima deles e caindo: **4–9 quadros (67–150 ms)
  DENTRO do círculo com o tronco SOB o topo desenhado**, o pé entre 3,4 e
  11,7 m, e então jogado **1,5–3,75 m num quadro** para a borda. Antes: **0
  quadros** dentro (o círculo empurrava a qualquer altura, no quadro da saída —
  o mesmo salto, 0,9–3,8 m). Mutante `SEMfaixa`: 0 quadros. [NC] 1. (Ficar SOB
  o telhado na borda do círculo — a pegada desenhada é maior que o círculo,
  72 % × 90 % — já existia: 160 quadros no centro do mercado, antes e agora.)
- **Bot e inimigo:** o bot (`scripts/bots.js`) não tem colisão de corpo com
  obstáculo nenhum — anda em reta até o ponto (`b.x += …`), por tronco, pedra e
  POI; não é desta leva (o próprio código registra o bot "entrando andando" em
  parede/pedra). Os inimigos de PvE (soldado, esqueleto, bicho) empurram por
  TODA fatia de tronco a qualquer altura — bloqueio a mais, não avesso;
  intocados.
- O mutante `SOpe` (a faixa sem a cabeça: só bate a fatia que contém o pé) **não
  avermelha nada** — nem a minha varredura nem o teste do construtor: nos
  troncos desta base as fatias de baixo cobrem a madeira das de cima (o
  deslocamento entre fatias é ≤ 0,2·s contra um círculo de corpo ≥ 0,6 m). É um
  mutante equivalente para estes modelos — declarado.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Não remedido.** O bot (`scripts/bots.js`), o servidor e a geometria de bala
(`js/paredes.js`, `js/obstaculos.js`, `js/maptoys-core.js`) não mudaram nesta
leva; a faixa nova é só do CORPO do jogador no cliente. Valem os números de
r10: pares geométricos **1 de 10 312** tampados vistos (o par de caminhão de
sempre), **cego 0 de 8 629**; atrações 0 e 0; a arena de r7 (0 / 0 / 0 / 0 em
52 válidos) como a medida do caminho real; "a tela não mostra e a vítima
aceita" **38** (16 atrás de poste). **Veredito: ◌ — igual a r10**, pelas duas
razões de `d381d29` (a "virada" pela letra, com o dono; o avesso (9) sem N no
caminho real).

---

## 3. Veredito por critério (com a comparação com `a03c122`)

"Não remedido" = o código que o critério mede não mudou nesta leva (o diff é
`js/cannon.js` + `js/maptoys.js` + o canhão e o empurrão de corpo no
`game.js`); vale o número de `a03c122` (que remete a r10).

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | Não remedido: 0,00 px / 0,00 cm a 10, 25 e 50 m em V2/V3 (r10). |
| **M2** | ✓ | ✓ | Não remedido: fuzil 720 m/s → 7,9 cm a 100 m; DMR 5,3; sniper 5,2 (r10). |
| **M3**–**M5** | ✓ | ✓ | Não remedidos (r10). |
| **M6** | ✓ | ✓ | Não remedido (r10). |
| **M7** | ✓ | ✓ | Não remedido (r10). O arrasto de olhar desta rodada (calibração da mira): 100 px = **18,335°**, ida e volta 0,000°. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Não remedido (r10). |
| **A2** | ✓ | ✓ | Não remedido: 236 casos, 0 com 0 px e a assistência agindo (r10). |
| **A3**, **A4** | ✓ | ✓ | Não remedidos (r10). |
| **A5** | ◌ | ◌ | Não remedido: (a)–(c) ✓, (d) em conflito com A2 (r10). |
| **A6**, **A7** | ✓ | ✓ | Não remedidos; `security-regression` **38/38**. |
| **A8** | ✓ | ✓ | Não remedido (r10). |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | Não remedido: (e) três dedos em 0,5 s, 1,82 m < 2 m. |
| **C2** | ✓ | ✓ | Não remedido (r10). |
| **C3** | ◌ | ◌ | Não remedido: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | Remedido no que a leva toca: **17 textos distintos** na tela ao longo de 51 voos no BR, 4 sessões no solo e o helicóptero ("USAR · SER DISPARADO 🎪", "🎪 atravesse as argolas!", "💫 CURSO COMPLETO 1.7s — RECORDE!", "💫 1.8s · recorde 1.7s", "💫 3.3s · recorde 1.8s", "🎪 VOOU 55 m — NOVO RECORDE!", "USAR · PILOTAR HELICÓPTERO", "⇧ sobe · ⇩ desce · analógico voa", …) — **0 nomes de tecla**. O resto não remedido (r10). |
| **C5**, **C6** | ✓ | ✓ | Não remedidos (r10). |
| **C7**–**C9** | ✓ | ✓ | Não remedidos. |
| **C10** | ✓ | ✓ | Remedido no canhão: polegar no talo do toque ao pouso — soltar → **0,004 m/s**, nada preso. A saída do helicóptero no meio do curso: nada preso (o curso também não, §A.1.1). O carro: não remedido (r10: 5,18 m no 1º s; sair, nada preso). |
| **C11** | ✗ | ✗ | Não remedido. |
| **C12** | ✓ | ✓ | Não remedido (r10). |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1**, **B2** | ✓ | ✓ | Não remedidos (bot e servidor intocados). |
| **B3** | ◌ | ◌ | Não remedido. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ◌ | ◌ | Não remedido (r10: 1 de 10 312; cego 0). |
| **B7** | ◌ | ◌ | §2. |
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos. |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | Não remedido (r10: 962 golpes, 0 através; Torre 547, 0). O empurrão de PvE contra tronco não mudou. |
| **P3** | ✓ | ✓ | Não remedido (r10). |
| **P4** | ✓ | ✓ | Não remedido (r10). A faixa nova é de obstáculo (árvore, pedra, POI), não de parede de construção (`Structures.collide`, intocado). |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | Não remedido (r10). O carro em chamas atravessado pelo puxão (§4.4) é corpo do jogador, não bala. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **230 draw calls p50** (mín. 221, máx. 254, mundo de 22,4 s; r11: 232) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 633: **0 `Object3D`** (ATIRAR arrastando: 12, os mesmos de r10/r11, descontados os da sonda). O empurrão novo chama `heightAt` por obstáculo sem faixa — sem alocação. |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais**; o retrato do desktop contra r11: **0 diferenças**. |
| **D5** | ✓ | ✓ | Não remedido. |
| **D6** | ✓ | ✓ | Por CONTA, não remedido: a leva soma **+2 866 B** crus (`js/cannon.js` 10 576 → 11 963; `js/maptoys.js` 20 924 → 21 671; `game.js` 299 117 → 299 849) aos ~11,14 MB de r10 — limiar 15,03 / 5,25 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Não remedidos. |
| **E4**, **E5** | ◌ | ◌ | Não remedidos (chegar ao carro/helicóptero pelo toque, da nave). |
| **E6**–**E8** | ✓ | ✓ | Não remedidos. |
| **E9** | ✗ | ✗ | Não remedido (sem "sair da partida" no BR; decisão do dono). |
| **E10** | ✓ | ✓ | Não remedido. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; **0 `pageerror`** em todas as páginas desta rodada (BR do canhão × 3 execuções na árvore, solo recarregado × 3, XR, solo do corpo × 3, `desemp`). A falha de módulo do CDN (§1) não vira `pageerror`: a página fica em "CARREGANDO O MUNDO..." calada. |
| **E15** | ✓ | ✓ | Não remedido (r10). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `b92a932`, baixa] O corpo entra no mercado e no refúgio entre 3,4 m
   e o topo desenhado.** A linha nova do empurrão (`topo = y1 ?? chão + 3,4`)
   vale para TODO obstáculo de corpo, não só tronco e pedra: o mercado (6,5 m
   desenhados) e o refúgio (~10,5 m) não têm `y1` e ganharam o teto da BALA.
   Reprodução: sair do helicóptero pelo USAR sobre o centro (ou a 3,4 m dele) e
   cair — **4–9 quadros (67–150 ms) dentro do círculo de corpo com o tronco sob o
   telhado desenhado**, o pé de 3,4 a 11,7 m, depois **1,5–3,75 m num quadro**
   para a borda. Antes: 0 quadros (empurrava no quadro da saída). Transitório e
   visual; nada no servidor (fora do repo). O texto novo do `CLAUDE.md` fala
   em "tronco e pedra", mas a linha cobre também mercado, refúgio, cacto,
   barril e tenda.
2. **[NC — `b92a932`, baixa] O pulo sobre a tenda termina num teleporte de
   1,0–1,3 m.** A faixa da tenda (do chão do acampamento até a cumeeira, 1,16 m
   sobre o chão dela) deixa o pé de quem pula (até 1,60 m) passar por cima; a
   tenda não tem chão em cima, o corpo cai dentro do círculo de 1,72 m e é
   empurrado de uma vez: **1,03 m** (andando, de volta) e **1,28 m** (correndo,
   para a frente) num quadro. Antes: o círculo segurava a qualquer altura (0,06–
   0,14 m por quadro). O barril (1,05 m) é atravessado por cima sem tocar a
   malha desenhada (0,42 m num quadro ao andar) — aceitável.
3. **[NC — `b92a932`, muito baixa] Com carro no caminho, mirando a 3ª argola o
   voo vai para a 1ª.** Sem puxão, o voo sai da beira para a argola escolhida;
   a escolha é "a mais próxima ao longo da mira, a ≤ 4 m": da beira (4,5 m),
   a mira na 3ª passa a **2,87 m** do centro da 1ª (FORA da argola desenhada,
   raio 2,6) e a 1ª ganha — rumo **23,8°** (a 3ª ficava a 9,3°), **1 de 5**.
   Com puxão não importa (as argolas são colineares a partir do centro).
4. **Correção que não fechou tudo — o puxão atravessa carro ([NC] 4 de r11).**
   Fechou o carro inteiro parado (0 de 30 quadros no círculo; antes 28 de 29).
   Segue: (a) **o carro que ENTRA no caminho durante a carga** — o caminho só é
   consultado no toque: 10–17 de 29 quadros no círculo de corpo, tronco na caixa
   desenhada em até 2, até 25,4 m/s aparentes; (b) **o carro EM CHAMAS** (vida
   zero, os 5 s antes de explodir) — `caminhoLivre` usa a consulta da bala, que
   ignora veículo que não está inteiro, mas o corpo do carro ainda empurra:
   **28 de 29** quadros no círculo, a 0,12 m do centro do chassi (o caso de r11
   inteiro). Os dois com 0 strikes. Baixa (raro).
5. **Correção que não fechou tudo — o "RECORDE" por queda de quadro (§4.5 de
   r11).** Em quadro estável fechou (0 de 12; antes 3 de 12, inclusive o de
   recarregar). Mas a MESMA volta mede 1,74 s a ~35 q/s e 1,75–1,76 s a
   56–60 q/s: quem cai de quadro "bate" o recorde por 0,01 s (1 de 3 voltas
   estranguladas). E a mensagem mostra décimos ("💫 1.8s · recorde 1.7s").
   Muito baixa.
6. **Achado antigo — o boot depende do CDN e cala a falha** (§1): uma das 26
   requisições ao `cdn.jsdelivr.net` falhando (`net::ERR_FAILED`, 2 de 30 boots
   de XR nesta máquina) deixa a página em "CARREGANDO O MUNDO..." para sempre,
   sem aviso nem nova tentativa. É a "janela de boot > 90 s" da suíte (9
   arquivos nesta rodada) — e é o que um jogador no 4G veria no 1º acesso.
   Média para a suíte (vira REGRESSÃO REAL falsa e esconde regressão
   verdadeira de boot); baixa para o jogador (recarregar resolve). Desde que o
   importmap aponta para o CDN.
7. **Achados antigos, sem mudança:** o bot anda através de tronco, pedra e POI
   (não tem colisão de corpo com obstáculo); o corpo do jogador passa por
   galho/raiz desenhados (63 posições nas 18 árvores, todas fora do tronco
   modelado, iguais com a regra antiga).
8. **Segurança — carro solto** (o vizinho do [NC] 1 de r9 e o resíduo da
   grade; o carro DIRIGIDO sem conferência de chão): não remedidos (o servidor
   não mudou). Detalhe **fora do repo**.
9. Inalterados (código intocado): **o canhão mostra o que a bala atravessa**
   (cano 141, aro dourado 10, faixa da borda ≤ 11,2 cm — r10), **faixa de
   0,45 m acima de peça de corpo**, **agachado atrás de poste** (16), **P1**,
   **C11**, **C1(e)**, **E9**.

**Observações sem veredito, não remedidas** (código intocado): (a) a beira da
saia do vulcão segue muralha; (c) o carro segue no relevo dentro da rocha do
vulcão enquanto alguém dirige; B6 pela letra (redação com o dono); (e) o gzip
quase não reduz a bazuca (−4 %), D6 esperando o dono; (f) P4(b): o canhão sobre
a encosta aparece como base suspensa; (g) **o texto novo do `CLAUDE.md`** sobre
o canhão confere com o medido (a mira na argola, o reinício de 0,25 s, os
centésimos, a vista de mundo), menos "o puxão — se nenhum veículo estiver no
caminho" (vale no toque; §4.4) e "o corpo bate em tronco e pedra só na faixa"
(a linha vale para todo obstáculo de corpo; §4.1); (h) **a janela de boot**:
explicada (§1, §4.6); (i) a JANELA da mira na argola vai ~6,5° além da argola
desenhada (§A.1.3), e o cano parado não mostra o curso até a carga.

**Contagem:** 4 critérios reprovados (os mesmos de r10/r11); **0 nasceu de
correção desta rodada**; **3 defeitos novos nasceram de correções** (itens 1–3,
todos baixos, nenhum de segurança); **2 correções não fecharam tudo** (itens
4–5); **1 achado antigo de peso** (item 6, o CDN).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| reinício no 1º quadro "no chão" (`SEMchaoT`) | a saída do helicóptero reinicia o curso **no ar, a 17,6 m** (árvore: 234 ms depois do pouso) | `maptoys`: **1 vermelho** ("o curso é UM voo") |
| a 1ª argola não reacende (`SEMacende`) | brilho **0,3 × 5** depois dos voos (árvore 0,9 na 1ª) | `maptoys`: **1 vermelho** (o mesmo caso) |
| sem a mira na argola (`SEMargola`) | lado 4 m → 1ª **1 de 5**; 4,5 m → **0 de 5** (árvore 5, 5) | `maptoys`: **1 vermelho** (beira 4,5 m, 1ª) |
| o puxão ignora o caminho (`SEMcaminho`) | carro parado entre: **28 de 30** quadros no círculo, 0,13 m do centro, 130 m/s aparentes (árvore 0, sem puxão) | `maptoys`: **1 vermelho** (carro encostado) |
| tempo em precisão cheia (`SEMcentesimo`) | "RECORDE" na 1ª volta depois de recarregar (1,7499 < "1.75"), sessões 2 e 3 (árvore 0) | `maptoys`: **1 vermelho** (pela asserção "tempo fora de centésimos") |
| a mira pela `camera.quaternion` (`MIRAcamera`) | voo e cano **83,8–174,2°** fora (árvore ≤ 0,04°) | `xr-canhao-mira`: **1 vermelho** (91,67°) |
| sem a faixa (`SEMfaixa`, o estado de `a03c122`) | 4 saltos laterais no voo do centro, 4ª argola a 0,76 m; mercado/refúgio 0 quadros dentro (árvore 0 saltos; 4–9 quadros) | `maptoys`: **1 vermelho** (o voo a 20 m) |
| a faixa sem a cabeça (`SOpe`) | **0 diferença** (equivalente nestes troncos, §A.4) | `maptoys`: **0 vermelhos** |
| o cliente de `a03c122` (`ANTES`) | a coluna "antes" de §A | `maptoys`: **5 vermelhos**; `xr-canhao-mira`: **1 vermelho** |

Controle (cópia = árvore): `maptoys` 17/17, `xr-canhao-mira` 2/2.

**Todo mutante não-equivalente avermelha alguma sonda minha e algum teste do
construtor.** O que os testes não medem, e que esta rodada achou: o carro que
entra no caminho durante a carga e o carro em chamas (§4.4); o "RECORDE" por
queda de quadro (§4.5; o teste roda em quadro estável); o corpo no mercado/
refúgio e o teleporte da tenda (§4.1–4.2; o teste mede um tronco a 0 m e a
20 m); a argola errada com carro no caminho (§4.3); a janela da mira na argola
contra a argola desenhada; o cano em XR (o teste mede o voo).

**As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): os resíduos de r10 — o servidor
   não mudou, eles seguem, sem teste.
2. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
3. **O boot pelo CDN** (§1, §4.6): é a origem da janela de 90 s que a suíte
   chama de REGRESSÃO REAL (9 arquivos nesta rodada) e trava o 1º acesso de quem
   está no 4G — servir `three`/`cannon-es` locais no harness (mesma versão) e
   avisar/recarregar quando o módulo não chega.
4. **O puxão** (§4.4): reconferir o caminho durante a carga e tratar o veículo
   em chamas como corpo (ou só carregar com o caminho livre o tempo todo).
5. **A faixa de corpo dos POIs** (§4.1–4.2): o mercado e o refúgio com a altura
   DESENHADA (como o barril), e o pouso dentro da tenda.
6. **O curso** (§4.3, §4.5): escolher a argola que a mira cruza (não a mais
   próxima a 4 m); o recorde contra o quadro — muito baixos.
7. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
8. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
