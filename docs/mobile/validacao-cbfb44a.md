# Validação do porte para CELULAR — commit `cbfb44a`

Décima quinta rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63), `validacao-3d7d47a.md` (46/63),
`validacao-a03c122.md` (46/63), `validacao-b92a932.md` (46/63),
`validacao-af4eb8f.md` (45/63), `validacao-ec918ab.md` (45/63). Autor: o
**validador** — não escreveu código de produto nem teste do repo. Nada foi
commitado. **A régua não mudou** (`git diff ec918ab cbfb44a -- docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `ec918ab`: `181c343` (só o laudo 14) e
`cbfb44a`. Em `cbfb44a`: (1) o vigia do boot marca `html.bootfalhou` e o CSS
tira o aviso de rotação da frente (`html.bootfalhou #rotateGate { display: none !important }`);
(2) o `caminhoLivre` do puxão do canhão confere também os obstáculos de corpo do
`obstaclesNear` (o círculo e a faixa de altura do empurrão do corpo);
(3) `test/maptoys` — o caso do helicóptero tira os carros a < 12 m e mede pelas
caixas do casco na conta do teste; caso novo com um obstáculo plantado
(`addObstacle` entrou no `window.__game`); `test/boot-sem-cdn` (e). Arquivos de
produto: `index.html` (+294 B), `style.css` (+207 B), `game.js` (+794 B). Diff
vazio em `server.js`, `br-game.js`, `scripts/bots.js`, `package.json`, `js/`
inteiro (`obstaculos.js`, `maptoys*.js`, `cannon.js`, `touchcontrols.js`,
`mobile.js`, `heli.js`, `veiculo-vida.js`, `paredes.js`).

---

## 0. Condições

- **Árvore:** `dev` em `cbfb44a` (`git log -1` no início, 18h42, e no fim,
  20h47). `git status` antes e depois: limpo (no fim só ESTE arquivo, não
  rastreado). sha256 do índice e dos 517 arquivos rastreados em
  `out/r15/arvore-cbfb44a.sha256`, conferido no fim: **idêntico**. Mutantes em
  **cópias** (`copia-r15` para as minhas sondas, `copia-r15c` para os testes do
  construtor — as de r14 renomeadas e sincronizadas por `rsync`; 515 de 515
  arquivos rastreados fora de `.claude/` iguais por `cmp`; `package.json`,
  `package-lock.json` e `node_modules/.package-lock.json` iguais por sha256, o
  `node_modules` de r14 serve), restauradas por sha256 antes de cada mutante e no
  fim. O **"antes"** é o mutante `ANTES`: `game.js`, `index.html` e `style.css` de
  `ec918ab` (`git show`) na cópia — o resto é byte a byte igual.
- **Carga** (12 núcleos; amostrada a cada 20 s, 18h43–20h44):
  - **suíte** (18h43–19h45, 185 amostras): mediana **3,42**, p90 4,12, máx. 5,33.
    Declarado: às 18h50, a sonda da produção (`curl`, rede, 14 s).
  - **sondas** (19h45–20h44): mediana 3,58, mas **10–14 durante as sondas de
    tela de falha e de E10** — o PRÓPRIO Chrome por software delas (r14 mediu o
    processo de GPU do swiftshader a ~1 000 %), não outro projeto. O que elas
    concluem (quem está no topo, classe, aviso, pausado/jogando) não depende de
    tempo; os relógios que importam (os 60 s do vigia, os 63 s da requisição
    segurada, a vazão emulada) são de parede e da rede emulada, e saíram iguais na
    árvore e no `ANTES` (alarme 60,35 × 60,35 s; 70,34 × 70,32 s). O puxão contra
    obstáculo (frame a frame) **foi refeito com a carga baixa** (`arvore3`,
    2,4 → 3,4): mesmas decisões, caso a caso, que a 1ª passada (`arvore2`, que
    começou a 13,3). `ANTES` e mutantes do puxão: 2,6–3,1. Testes do construtor:
    2,6–4,8.
- **Processo alheio:** amostrador de `ps` a cada 20 s (`out/r15/ps.log`): na
  suíte, 251 processos `node --test`/`server.js`, todos descendentes do
  `run-tests` dela — **0 alheios**; nas sondas, 0 em toda fase (`cadeia.log`).
- **Ordem:** a **suíte rodou PRIMEIRO** (18h43–19h45); depois as sondas, uma por
  vez; por fim os testes do construtor contra os mutantes, na cópia.
- **GPU:** Chrome headless (swiftshader). Tempo de frame não medido.
- **Viewports:** V1–V5 e retrato 390×844 com `hasTouch`, `isMobile`, DPR 2.
  Semente 424242 (tela, E10, D2–D4, helicóptero) e as 10 sementes com obstáculo no
  disco do USAR (35, 69, 70, 72, 78, 80, 124, 138, 143, 164).
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`) no centro do
  que está NO TOPO — o "tentar de novo", o JOGAR ASSIM, o VOLTAR do lobby, o JOGAR
  SOLO e o toque que retoma; o celular pelo UA Android (`setUserAgentOverride`,
  com `platform`) e por `?mobile=1`; o disparo do canhão pelo `Cannon.fire()` (o
  mesmo do prompt do USAR — declarado, como em r14).
- **Rede:** 9 Mbps / 40 ms nas sondas de E10; o caso `alarme-rede` a **0,12 Mbps /
  400 ms** pelo `proxy-br.js` de r13 (a compressão da borda), sem dublê de
  requisição.
- **Dublês declarados:** de REDE — o `three.core.js` abortado (tela de falha) ou
  **segurado 63 s e depois liberado** (o módulo roda DEPOIS do vigia, que é o
  que o link lento faz — o caso `alarme-rede` confirma sem dublê); de COLOCAÇÃO —
  o jogador posto (`QA.reset`) na partida do puxão; o grupo do helicóptero posto
  (grade de r14).
- **Portas:** 3993, 3995, 3997 (+4097), 3984; os testes do construtor na cópia,
  nas portas deles, depois de toda sonda. Nunca a 3000.
- **Correções das MINHAS sondas nesta rodada — medidas e declaradas:**
  1. **`r15-puxao-obst`, 1ª versão:** separava tronco de folha pela COR do vértice
     atingido. Só a árvore gigante (variante 0) tem material de tronco
     (`tree_wood`); as outras três saem do GLB com um material só e o bake as
     pinta de UMA cor (`FALLBACK`, verde) — todo tronco virava "folha", e
     "caminho tampado"/"corpo dentro" liam 0 nas árvores. Corrigido (nas variantes
     1–3 todo o desenho conta como sólido — a folhagem delas fica acima da faixa
     do corpo; declarado) e refeito duas vezes (`arvore2`, `arvore3`); a 1ª passada
     está em `out/r15/puxao-obst-arvore.json` e não entra em número nenhum.
  2. **`r15-e10`, "toque para retomar":** tocava o centro do JOGAR SOLO (travado
     na pausa de partida, cai no `#menuBtns`). Quem retoma é o toque no `#overlay`
     FORA dos controles (`game.js`). O "voltou à paisagem → retoma" não foi
     medido — não é de E10 (é C5).
  3. **O "tampado pelo desenho" do puxão olha só as malhas a < r + 4 m do
     obstáculo sob teste:** o controle 90° da árvore da semente 78 passa a 0,14 m
     da PEDRA da mesma semente (geometria em Node, `r15-geo78.js`) — o produto
     recusa certo e a minha sonda dizia "livre". Contado à parte (§A.2).
  4. Em r14 o "atravessou" era a troca de lado na reta do centro; com retas
     deslocadas (`off` > 0) a troca de lado é passar AO LADO. Aqui o critério de
     atravessar é: reta tampada pelo desenho E puxado até o centro; e o eixo do
     corpo dentro da malha desenhada.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `r15-falha.js`, `r15-e10.js`, `r15-puxao-obst.js`, `r15-geo78.js`,
  `r15-prod.js`, `analisa15-puxao.js`, `r14-seeds-node.js` e `r14-puxao.js` (sem
  mudança), `desemp.js`, `proxy-br.js`, `mut15.py`, `mut15-testes.sh`,
  `cadeia-r15.sh`, `tudo-r15.sh`, `carga15.sh`, `recursos15.sh`. Saídas em
  `out/r15/`.

---

## 1. Placar

> **45 aprovados · 5 reprovados · 13 não medidos, em 63** (45/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `ec918ab` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 7 | 2 (E9, **E10**) | 4 (E4, E5, E11, E12) | 7 · 2 · 4 |

**Nenhum critério mudou de cor — mas E10 segue vermelho por OUTRO defeito:**
- **O defeito de r14 fechou:** na tela de falha do vigia em retrato o "TOQUE PARA
  TENTAR DE NOVO" está no topo (maior quadrado **0 → 90 px**) e o toque de
  verdade recarrega a página (§A.1.1).
- **E10: ✗ — [NC] 1, nascido desta correção (baixa).** O vigia dispara aos 60 s
  quando o MÓDULO ainda não rodou — e num link lento o módulo roda DEPOIS (r13
  §A.1.4: abaixo de ~0,15–0,2 Mbps de produção). Até `ec918ab` o alarme falso "se
  desfazia sozinho"; agora a classe `bootfalhou` **fica para a sessão inteira**:
  o aviso de rotação e o JOGAR ASSIM **nunca mais aparecem**, e em retrato o
  jogo **recusa sair da pausa** (`setPaused` com `Orient.blocking()`). Medido no
  caminho real, sem dublê de requisição (0,12 Mbps / 400 ms, compressão da borda):
  alarme aos 70,3 s, módulo aos 108,7 s, **0 de 36** amostras em retrato com o
  aviso depois do módulo (em `ec918ab`: 36 de 36, JOGAR ASSIM aos 115,0 s). Com
  a rotação do sistema travada o jogador fica num menu PAUSADO sem explicação e
  sem saída (três toques, nenhum retoma — §A.1.3). E10 cobra "retrato com a
  rotação travada: aviso + JOGAR ASSIM" — pela letra, reprova. Raro (link de 2G/EDGE
  + retrato), mas é a mesma população que r14 contou.

O que a leva toca na régua — a tela de falha (C2, C4, E10), o aviso de
orientação no boot e na partida (E1, E10), o puxão do canhão (C10, P4, V1), o
mundo da semente e o caminho quente (D2, D3, D4), os bytes (D6) — foi remedido ou
conferido por leitura. O resto é **não remedido** (o código não mudou; vale o
número de `ec918ab`, que remete a r10).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista sete.

**Regressões obrigatórias (§8):** M1 ✓ (não remedido), M2 ✓ (não remedido),
**C4 ✓ (remedido na tela de falha)**, D2 ◌ (a parte medida passa: 231), D6 ✓
(por conta: +1 295 B), **E10 ✗ ([NC] 1)**, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 1** (E10, [NC] 1).
**Defeitos NOVOS nascidos das correções desta leva: 2 de produto** ([NC] 1,
baixa; [NC] 2, muito baixa) **+ 0 de teste**. Em `ec918ab`: 1 + 1 de teste; em
`af4eb8f`: 2; em `b92a932`: 3; em `a03c122`: 4; em `3d7d47a`: 2; em `f672d81`: 2;
em `4433c4d`: 2; em `a9a4ffd`: 3; em `afb1ae8`: 4.
**Fecharam os três achados de r14 que a leva atacou:** a tela de falha em
retrato ([NC] 1 de r14), o teste do helicóptero que passava por acidente ([TESTE]
de r14) e o puxão através de pedra/árvore/cacto (achado antigo).

`test/security-regression.test.js`: verde (na suíte).

**Suíte completa** (`npm test`, 18h43–19h45, carga mediana 3,42, p90 4,12, máx.
5,33): **2 643 testes, 2 640 passaram, 0 falharam, 0 cancelados, 3 pulados**
(61,6 min). Nenhum arquivo foi à triagem; `ps` vazio de `run-tests` antes de ler
o placar; a linha final é a do próprio runner (TAP). O orquestrador relatou
2 639 / 0 / 0 com 1 flake triado (`br-bot-visual`); aqui não houve flake (+2
testes contra r14: o (e) do `boot-sem-cdn` e o caso do obstáculo plantado).

---

## A. Os quatro itens do briefing, um por um

### 1. E10 — a tela de falha FECHOU; o avesso existe: o alarme FALSO do vigia apaga o aviso para a sessão inteira

**1.1 A tela de falha** (`r15-falha`: `three.core.js` abortado pelo DevTools,
Android pelo UA e `?mobile=1`, V1–V5 e retrato — 12 casos; C2 pelo método da
régua para TODO interativo com área; e o toque de verdade no centro do botão):

| viewport | botão · maior quadrado | no topo | toque real | `ANTES` (`ec918ab`) |
|---|---|---|---|---|
| V1 667×375 | 627×63 · **64 px** | o botão | **recarrega** | igual |
| V2 / V3 / V4 | 720×63 · **64 px** | o botão | **recarrega** | igual |
| V5 1180×820 | 660×73 · **74 px** | o botão | **recarrega** | igual |
| **retrato 390×844** | 366×89 · **90 px** | **o botão** (`html.bootfalhou`; aviso e JOGAR ASSIM fora) | **recarrega** | 366×89 · **0 px** · o `#rotateGate` · **não recarrega** |

Nos 12 casos: texto inteiro no botão, **0 tokens de teclado** com área, 0 px de
estouro horizontal, 0 sobreposição entre interativos. MULTIJOGADOR e
CONFIGURAÇÕES aparecem desabilitados (`aria-disabled`, sem `pointer-events`):
0 px, iguais em `ANTES` — não são alvo de toque nesse estado (exceção declarada
de C2). Em retrato a tela inteira é o menu de paisagem empilhado (título,
subtítulo, três botões), nada fora da tela.

Mutantes: `SEMbootfalhouJS` (o vigia não marca a classe) e `SEMbootfalhouCSS` (a
regra fora) — retrato **0 px, o aviso no topo, o toque não recarrega**; a
paisagem segue 64 px (V2). O `boot-sem-cdn` (e) do construtor fica **vermelho**
com os dois e com `ANTES`.

**1.2 O avesso no boot que NÃO falhou** (`r15-e10`, Android pelo UA, 9 Mbps):

| caso | árvore | `ANTES` |
|---|---|---|
| boot normal em retrato: aviso · JOGAR ASSIM · `bootfalhou` | **0,24 s · 6,77 s · nunca**; aviso em 21 de 21 amostras em retrato antes do JOGAR ASSIM; toque nele → `portraitok` → VOLTAR → JOGAR SOLO → **jogando em retrato** (iniciado, não pausado) | 0,24 s · 6,64 s · — ; 21 de 21; igual |
| partida em paisagem (V2), vira para 390×844 | em ≤ 0,9 s: **pausou, aviso no topo, JOGAR ASSIM** (`rgstuck`); 12 de 12 amostras em retrato com o aviso | igual (11 de 11) |
| mutante `GATEnunca` (o aviso nunca) | aviso **0 de 98** amostras em retrato; JOGAR SOLO em retrato → fica pausado; na partida, vira → sem aviso | — |
| mutante `BOOTFALHOUsempre` (a classe já na montagem do vigia) | aviso **0 de 97**; idem | — |

Os dois mutantes do avesso deixam o `touch-controls` do construtor **2 vermelhos**
("dado retrato, então o aviso cobre a tela E a partida NÃO roda por baixo dele";
"dado o travamento REJEITADO, então o aviso oferece saída") — o avesso
"sempre" está coberto. O que nenhum teste cobre é o caso a seguir.

**1.3 O alarme FALSO — [NC] 1.** O vigia (`index.html`) dispara aos 60 s se
`__gameModulo` não existe; `falhou()` agora marca `html.bootfalhou`, e **nada a
desmarca** (`grep`: a classe só é escrita ali). Quando o módulo roda depois, o
jogo segue normal — mas com o aviso de rotação morto pelo `!important`. E o
`setPaused` recusa sair da pausa em retrato (`if (!p && Orient.blocking()) p = true`),
contando que o aviso estaria na frente com o JOGAR ASSIM.

| caso (retrato salvo indicação) | vigia · módulo | depois do módulo, em retrato: aviso · JOGAR ASSIM · `bootfalhou` | o caminho do jogador | `ANTES` |
|---|---|---|---|---|
| `alarme-retrato` (three.core segurado 63 s) | 60,35 · 64,06 s | **0 de 72** · nunca · sim | lobby aparece em retrato SEM aviso; VOLTAR → JOGAR SOLO → partida **começa PAUSADA**; o botão de novo e o toque no centro do `#overlay` (o gesto de retomar): **segue pausado** (3 de 3) | aviso 173 de 173; JOGAR ASSIM aos 68,8 s |
| `alarme-vira` (paisagem; joga; vira) | 60,22 · 64,05 s | **0 de 10** · nunca · sim | joga em paisagem; vira → **pausa sem aviso e sem JOGAR ASSIM** (menu "PAUSADO") | aviso 13 de 13, JOGAR ASSIM em 0,3 s |
| `alarme-rede` (**0,12 Mbps / 400 ms**, proxy da borda, sem dublê) | **70,34 · 108,68 s** | **0 de 36** · nunca · sim | — | aviso 36 de 36, JOGAR ASSIM aos 115,0 s |

Capturas: `out/r15/e10-alarme-retrato-solo.png`, `e10-alarme-vira-retrato.png`
(o menu "PAUSADO" em pé, JOGAR SOLO travado, nada dizendo para girar). Em
`ANTES`, na janela entre o alarme e o módulo (60,35–64,06 s; 70,3–108,7 s no
caso de rede), o aviso cobria o "tentar de novo" (o [NC] de r14) — essa janela
agora está certa; o defeito novo é o que vem DEPOIS dela. Quem tem a rotação
livre sai girando o aparelho (nada o diz); quem tem a rotação travada só sai
recarregando pelo navegador. **Baixa**: precisa de link abaixo de ~0,15–0,2 Mbps
de produção (r13: a 0,2 Mbps / 400 ms o módulo chega aos 65,5 s e o vigia, que
começa depois do `style.css` e do `socket.io.js`, não dispara) e de retrato.

### 2. O puxão × pedra/árvore/cacto — FECHOU; avesso: encostado no obstáculo, o puxão para LONGE dele é recusado

**2.1 O varrido** (`r14-seeds-node`, sem mudança, 424242 e 1–200): idêntico a r14
— **10 de 201** sementes com obstáculo de corpo no disco de 4,6 m do USAR (35,
69, 70, 72, 78, 80, 124, 138, 143, 164; a 424242 não tem); o mais perto: pedra
1,23 m (78), árvore 1,78 (80), cacto 1,89 (35); tenda 16,9 m, o resto ≥ 113 m.
`js/obstaculos.js` não mudou.

**2.2 As 10 sementes, no produto** (`r15-puxao-obst`: solo na semente, `?mobile=1`,
V2, laço no rAF; até 2 obstáculos distintos por semente — 11 —, 8 retas cada: o
centro do obstáculo a 0 / 0,5 / 0,9 / 1,1 / 1,5 × R da reta (R = r + 0,42, o
corpo), o controle 90°, e o jogador ENCOSTADO no círculo do lado do centro (o
obstáculo fica atrás; o puxão o afasta) ou com 5 cm de folga. Âncora: a MALHA
DESENHADA das instâncias perto do obstáculo, como malhas simples — o caminho
tampado (o corpo, raio 0,42, a 0,5/1,0/1,4/1,65 m do chão do relevo, tocaria o
desenho?) e o eixo do corpo DENTRO dela (paridade); o produto só é lido no que
faz — de onde lançou):

| 88 retas | árvore (`arvore3`, carga 2,4–3,4) | `ANTES` (`ec918ab`) |
|---|---|---|
| tampadas pelo desenho | 27 | 27 |
| … e puxado até o centro através dele | **0** | **22** |
| eixo do corpo dentro da malha na CARGA | **0 quadros** | **30 quadros** (6 retas) |
| maior salto num quadro na carga | **0,16 m** | **2,27 m** |
| livres pelo desenho | 61 | 61 |
| … puxou até o centro · não puxou | **48 · 13** | 61 · 0 |
| ENCOSTADO (obstáculo atrás) · folga de 5 cm: recusados | **6 de 11** · **0 de 11** | 0 · 0 |

A 1ª passada com a carga alta (`arvore2`, 13,3 → 3,4) deu as MESMAS 88 decisões.
Os 13 "livres e não puxou":
- **10 com o corpo encostado no círculo** (os 6 ENCOSTADOS e 4 partidas que o
  empurrão pôs na borda): o `caminhoLivre` mede o ponto da reta mais perto do
  obstáculo; com o obstáculo ATRÁS ele é a própria partida, a exatamente R depois
  do empurrão — e `< o.r + player.radius` decide pelo arredondamento (6 de 11
  recusados encostados, 0 de 11 com 5 cm). **[NC] 2 (muito baixa):** o puxão que
  só AFASTA do obstáculo é recusado; o jogador é lançado da beira (o curso de
  argolas não completa). Precisa estar em contato com um obstáculo no disco (1
  semente em 20).
- **2 pela PEDRA** (70 e 78, reta a 0,9 R): o círculo de corpo da pedra é maior
  que o desenho nessa altura — é a regra de ANDAR (o corpo também bate ali);
  `ANTES` puxava fazendo o corpo deslizar no círculo (0 quadros na malha).
  Observação, não defeito: "o mesmo círculo do corpo" é o que o commit promete.
- **1 por outro obstáculo:** o controle 90° da árvore da semente 78 passa a 0,14 m
  da pedra (§0, correção 3) — recusa certa.

**O voo de quem não foi puxado** sai da beira na direção da mira; com o obstáculo
na frente, o corpo é segurado no círculo (menor distância = R em todos os
lançamentos da beira contra árvore/pedra) e empurrado de lado — num caso (pedra
78, reta direta) **1,01 m num quadro** na `arvore3` (0,45 m na `arvore2`; o passo
normal do voo é 0,39–0,48 m). O eixo passa 1–4 quadros pelo DESENHO de árvore
(galho/copa das variantes de uma cor só) — o mesmo acontece no voo puxado ao centro
(47 quadros na árvore, 63 em `ANTES`). Observação.

**2.3 Mutantes do puxão** (4 sementes — 35, 72, 78, 80 —, 40 retas; árvore: 0 de 17
atravessadas, 20 de 23 livres puxadas):

| mutante (na cópia) | minha sonda | teste do construtor (`maptoys`) |
|---|---|---|
| `ANTES` (sem o laço dos obstáculos) | **15 de 17** atravessadas, 15 quadros na malha, salto 2,05 m | **1 vermelho** (`TypeError`: `addObstacle` não existe) |
| `SEMobst` (só o laço fora) | (= `ANTES` no `game.js`) | **1 vermelho** ("0,12 m do centro, raio de corpo 1,02") |
| `OBSTqualquer` (todo obstáculo da vizinhança barra) | **0 de 23** livres puxadas — o avesso avermelha | **2 vermelhos** (os casos PRODUTO da beira, 4 e 4,5 m) |
| `OBSTsemFaixa` (sem a faixa de altura) | **sobrevive**: as mesmas 40 decisões (nenhuma fatia acima da cabeça no disco do USAR) | 0 |
| `OBSTsemCorpo` (só `o.r`, sem o raio do corpo) | 8 de 17 tampadas passam AO LADO (o corpo desliza no círculo; 0 quadros na malha, salto 0,29) — menos conservador, não defeito | 0 |

A grade do **helicóptero** de r14 (`r14-puxao`, 36 colocações) na árvore: 19
tampadas, **0** atravessadas, 0 quadros na malha, maior salto 0,72 m, livres 9 · 3
· 5 — idêntica a r14 (o laço novo vem depois do do helicóptero).

### 3. Os testes do construtor — o do helicóptero agora AVERMELHA; a âncora é o mesmo DADO do produto

(`mut15-testes.sh`, cópia `copia-r15c`; controle cópia = árvore: `maptoys` 21/21,
`boot-sem-cdn` 7/7, `touch-controls` 53/53.)
- **Helicóptero:** `SEMheli` (o laço do helicóptero fora do `caminhoLivre`) →
  **vermelho, "5 de 31 quadros dentro da fuselagem"**; `HELIcego`
  (`corpoNaFuselagem` sempre falso) → **vermelho, 5 de 31**. Em r14 os dois ficavam
  verdes. O teste tira os carros a < 12 m (o do caso anterior incluído) e mede
  pela conta dele (ponto do eixo do corpo nas caixas giradas pelo grupo) — o
  formato 6 e o formato 2 de r14 **fecharam**.
- **O que sobra:** a conta é do teste, mas as caixas são `VV.TIPOS.heli.caixas` —
  o MESMO dado que o produto usa no empurrão, no puxão e na bala. Mutante
  `HELIcaixaEncolhida` (as duas caixas reduzidas a 0,4 × 0,2 m): `maptoys`,
  `veiculo-vida-jogo` e `veiculo-vida-cliente` **verdes**; a minha grade contra o
  DESENHO: **10 de 19** tampadas atravessadas, 7 colocações com o eixo na malha
  (82 quadros). Nenhum teste ancora as caixas do helicóptero no modelo desenhado
  (`veiculo-vida-jogo` mede as caixas dos carros contra o desenho e PULA o
  helicóptero, "a caixa sai das medidas de js/heli.js"). Lacuna antiga que o teste
  novo herda — não nasceu desta leva.
- **Obstáculo plantado:** `SEMobst` → vermelho com número (0,12 m contra 1,02);
  `OBSTqualquer` → os casos de produto da beira avermelham (o avesso "barra tudo"
  está coberto); `OBSTsemFaixa` e `OBSTsemCorpo` verdes (a reta do caso passa pelo
  centro; nenhum dos dois é defeito que a tela mostre).
- **`boot-sem-cdn` (e):** vermelho com `SEMbootfalhouJS`, `SEMbootfalhouCSS` e
  `ANTES`; mede o elemento sob o dedo no centro do botão (âncora no DOM, não na
  classe).
- **Sem teste:** o alarme falso com o módulo chegando depois ([NC] 1) e o puxão
  recusado encostado ([NC] 2).

### 4. Os resíduos de r13/r14 que o construtor não mexeu — declarados, não remedidos

`js/obstaculos.js`, `js/maptoys*.js`, `js/cannon.js` e as linhas de corpo ×
obstáculo do `game.js` (`updatePlayer`): diff vazio. Valem os números de r13:
- **o telhado do mercado/refúgio é parede invisível** — empurrão 1,6–2,6 m ACIMA
  do telhado desenhado, salto de até 3,75 m num quadro; não há pouso no telhado.
  Baixa.
- **o barril de 1,05 m não se pula** (o pulo chega a 1,6 m; a margem é de
  propósito). Observação.
- **o recorde do curso × a taxa de quadros** — resolução de um quadro (17–28 ms)
  contra os 10 ms que a tela compara. Muito baixa.
- **Segurança** — o carro solto (resíduos de r10) e o carro DIRIGIDO sem
  conferência de chão: `server.js` sem diff; seguem, sem teste. Detalhe **fora do
  repo**.
- **A cópia velha das 26 bibliotecas na borda da produção** (`r15-prod`, só GET de
  arquivo público, 18h50): `cbfb44a` está no ar (`index.html`, `game.js`,
  `style.css` servidos = os da árvore por sha256); os 26 do boot seguem **`HIT`,
  brotli, 590 342 B, idade 7,0–8,3 h** — guardados antes de `ec918ab` existir. O
  gzip da origem não chega ao jogador (≤ +1 % quando chegar). **Os dois 404 de QA
  de r13 seguem guardados**; o de r14 e o desta rodada saíram `no-store`/`BYPASS`.
  Saem com purga da borda (detalhe fora do repo).
- Inalterados (código intocado): o aro dourado, o cano, o poste, a faixa de 0,45 m.
- D6 dos modelos (gzip): esperando o dono.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Não remedido.** O bot (`scripts/bots.js`), o servidor de jogo e a geometria de
bala (`js/paredes.js`, `js/obstaculos.js`, `js/maptoys-core.js`) não mudaram.
Valem os números de r10: pares geométricos **1 de 10 312** tampados vistos (o par
de caminhão de sempre), **cego 0 de 8 629**; atrações 0 e 0; a arena de r7 (0 / 0 /
0 / 0 em 52 válidos); "a tela não mostra e a vítima aceita" **38** (16 atrás de
poste). **Veredito: ◌ — igual a r10**, pelas duas razões de `d381d29`.

---

## 3. Veredito por critério (com a comparação com `ec918ab`)

"Não remedido" = o código que o critério mede não mudou nesta leva; vale o número
de `ec918ab` (que remete a r10).

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | Não remedido: 0,00 px / 0,00 cm a 10, 25 e 50 m em V2/V3 (r10). |
| **M2** | ✓ | ✓ | Não remedido: fuzil 720 m/s → 7,9 cm a 100 m; DMR 5,3; sniper 5,2 (r10). |
| **M3**–**M7** | ✓ | ✓ | Não remedidos (r10). |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1**–**A4** | ✓ | ✓ | Não remedidos (r10). |
| **A5** | ◌ | ◌ | Não remedido: (a)–(c) ✓, (d) em conflito com A2 (r10). |
| **A6**, **A7** | ✓ | ✓ | Não remedidos; `security-regression` verde na suíte. |
| **A8** | ✓ | ✓ | Não remedido (r10). |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | Não remedido: (e) três dedos em 0,5 s, 1,82 m < 2 m. |
| **C2** | ✓ | ✓ | **Remedido na tela de falha (§A.1.1):** V1–V4 64 px, V5 74 px e **retrato 90 px** (era 0), o botão no topo e o toque recarrega em 12 de 12; os desabilitados (0 px) são exceção declarada, iguais a `ec918ab`. O resto não remedido (r10). |
| **C3** | ◌ | ◌ | Não remedido: morte, espectador e carro não medidos. Na tela de falha: 0 sobreposição entre interativos (12 casos). |
| **C4** | ✓ | ✓ | **Remedido na tela de falha:** 0 tokens com área em V1–V5 e retrato, UA e `?mobile=1` (agora também o menu inteiro em retrato, que o aviso cobria). O resto não remedido (r14 do 1º quadro ao jogo; r10 nos estados). |
| **C5**–**C9** | ✓ | ✓ | Não remedidos (r10). |
| **C10** | ✓ | ✓ | Não remedido (r12). O puxão recusado pelo obstáculo zera a velocidade como o do carro (`cannon.js` sem diff: `vel.x = vel.z = 0` em todo quadro de carga). |
| **C11** | ✗ | ✗ | Não remedido. |
| **C12** | ✓ | ✓ | Não remedido (r10). |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1**, **B2** | ✓ | ✓ | Não remedidos (bot e servidor de jogo intocados). |
| **B3** | ◌ | ◌ | Não remedido. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ◌ | ◌ | Não remedido (r10: 1 de 10 312; cego 0). |
| **B7** | ◌ | ◌ | §2. |
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos. B12: `package.json` sem diff. |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2**–**P4** | ✓ | ✓ | Não remedidos (r10). P4 mede parede de CONSTRUÇÃO (intocada); o puxão contra obstáculo (§A.2) não é prédio. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | Não remedido (r10). A bala segue `Veiculos.segmento` (intocado); a grade do helicóptero contra o puxão é igual a r14. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **231 draw calls p50** (mín. 222, máx. 257, mundo de 22,5 s; r14: 232) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 633: **0 `Object3D`** (ATIRAR arrastando: 12, os mesmos de r10–r14). |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais**, e os dois retratos iguais aos de r14 byte a byte (o laço novo e o `addObstacle` no `__game` não criam objeto nem consomem sorteio). |
| **D5** | ✓ | ✓ | Não remedido. |
| **D6** | ✓ | ✓ | **Por conta, não remedido:** a leva soma **+1 295 B** crus (`index.html` +294, `style.css` +207, `game.js` +794) aos 3,27–3,70 MB da arma pronta medidos em r14 (limiar 5,25). Produção: os 26 do boot seguem os 590 342 B em brotli que a borda já tinha (§A.4). |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1** | ✓ | ✓ | Remedido no boot normal em retrato (aviso → JOGAR ASSIM → VOLTAR → JOGAR SOLO → jogando) e em paisagem (VOLTAR → JOGAR SOLO), por toque. **(e) falha no estado do alarme falso** — o lobby em retrato sem o aviso (§A.1.3): o mesmo defeito, contado em E10. O resto não remedido (r10). |
| **E2**, **E3** | ✓ | ✓ | Não remedidos. |
| **E4**, **E5** | ◌ | ◌ | Não remedidos. |
| **E6**–**E8** | ✓ | ✓ | Não remedidos. |
| **E9** | ✗ | ✗ | Não remedido (sem "sair da partida" no BR; decisão do dono). |
| **E10** | **✗** | ✗ | **O defeito de r14 fechou** (tela de falha em retrato: o botão no topo, 90 px, recarrega). **[NC] 1 (§A.1.3):** depois de um alarme falso do vigia (link lento; medido a 0,12 Mbps sem dublê), o aviso e o JOGAR ASSIM somem para a sessão inteira e o jogo recusa sair da pausa em retrato. Boot normal em retrato e virar no meio da partida: ✓ (§A.1.2). O resto (dirigindo; C2/C3 em 390×844 liberado) não remedido. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; **0 `pageerror` e 0 `console.error`** em todas as páginas das sondas desta rodada (a não ser o `net::ERR_FAILED` da requisição abortada DE PROPÓSITO na tela de falha). |
| **E15** | ✓ | ✓ | Não remedido (r10). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `cbfb44a`, baixa] O alarme falso do vigia apaga o aviso de rotação
   para a sessão inteira.** `falhou()` (`index.html`) marca `html.bootfalhou`
   quando, aos 60 s, o módulo ainda não rodou; nada desmarca. Reprodução: celular
   em retrato (390×844, UA Android), `three.core.js` segurado ~63 s (ou a rede a
   0,12 Mbps / 400 ms); o botão diz "NÃO CARREGOU" aos 60 s, o módulo roda aos
   64 s e o menu volta a "JOGAR SOLO" — sem aviso de rotação, sem JOGAR ASSIM; VOLTAR
   → JOGAR SOLO → a partida começa PAUSADA e nenhum toque retoma (`setPaused`
   recusa com `Orient.blocking()`); numa partida em paisagem, virar o aparelho
   pausa sem aviso. Antes: o alarme falso "se desfazia sozinho" (r13 obs. h) — o
   aviso voltava a valer quando o módulo rodava. Reprova E10 pela letra. Raro.
2. **[NC — `cbfb44a`, muito baixa] Encostado num obstáculo, o puxão para LONGE dele
   é recusado.** O `caminhoLivre` mede a distância do obstáculo ao ponto mais perto
   da reta; com o obstáculo atrás, esse ponto é a partida, a exatamente R depois do
   empurrão do corpo — e o `<` decide pelo arredondamento: **6 de 11** recusados
   encostados, **0 de 11** com 5 cm de folga (sementes 69, 70, 72, 124, 138, 143
   recusam; 35, 78 ×2, 80, 164 puxam). O jogador é lançado da beira; o curso não
   completa. `ANTES`: 11 de 11 puxados (sem atravessar nada).
3. **Lacuna de teste herdada (não nasceu desta leva):** o teste novo do
   helicóptero mede com `VV.TIPOS.heli.caixas`, o mesmo dado do produto, e nenhum
   teste ancora essas caixas no helicóptero desenhado (`veiculo-vida-jogo` pula o
   helicóptero). `HELIcaixaEncolhida` passa verde em três arquivos e atravessa 10
   de 19 colocações tampadas na minha grade (§A.3).
4. **Observações do puxão** (§A.2): o círculo de corpo da pedra recusa duas retas
   que o desenho deixa livres (a regra de ANDAR); o voo que sai da beira contra
   um obstáculo é empurrado de lado até 1,01 m num quadro.
5. **Resíduos de r13, não mexidos** (§A.4): telhado do mercado/refúgio como parede
   invisível (baixa); barril que não se pula (observação); recorde × taxa de
   quadros (muito baixa).
6. **Segurança** — o carro solto (resíduos de r10) e o carro DIRIGIDO sem
   conferência de chão: não remedidos. **A borda da produção segue com as 26
   bibliotecas de antes de `ec918ab` e com os dois 404 de QA de r13.** Detalhes
   **fora do repo**.
7. Inalterados (código intocado): **o canhão mostra o que a bala atravessa** (cano
   141, aro dourado 10, faixa da borda ≤ 11,2 cm — r10), **faixa de 0,45 m acima
   de peça de corpo**, **agachado atrás de poste** (16), **P1**, **C11**,
   **C1(e)**, **E9**.

**Fecharam nesta leva:** o [NC] 1 de r14 (tela de falha em retrato sem saída), o
[TESTE] de r14 (o teste do helicóptero que passava por acidente) e o achado antigo
do puxão através de pedra/árvore/cacto (22 de 27 → 0 de 27; 30 → 0 quadros na
malha; 2,27 → 0,16 m num quadro).

**Observações sem veredito:** (a) a beira da saia do vulcão segue muralha; (c) o
carro segue no relevo dentro da rocha do vulcão enquanto alguém dirige; B6 pela
letra — **não remedidas** (diff vazio); (e) o gzip quase não reduz a bazuca
(−4 %), D6 dos modelos esperando o dono; (f) P4(b): o canhão sobre a encosta
aparece como base suspensa; (g) **o texto novo do `CLAUDE.md`** confere com o
medido na tela de falha, mas diz "se o módulo do jogo não roda (… ou 60 s)" sem
dizer que, se ele rodar DEPOIS, a classe fica — e o trecho do canhão ("a CARGA
puxa o jogador … se nenhum veículo estiver no caminho") não cita os obstáculos;
(h) o vigia em link de 2G: agora com consequência ([NC] 1); (i) a borda serve as
cópias de antes do deploy (§A.4); (j) o notebook com toque e ponteiro GROSSO com
tela < 900 px é tratado como celular — regra 4 de `js/mobile.js`, não desta leva.

**Contagem:** 5 critérios reprovados (C1, C11, P1, E9 e **E10**); **1 reprova por
defeito nascido de correção desta rodada** (E10, [NC] 1); **2 defeitos novos de
produto e 0 de teste** nasceram das correções; **as três correções da leva fecharam
o caso que r14 mediu**.

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| o vigia não marca a classe (`SEMbootfalhouJS`) | retrato: 0 px, aviso no topo, toque não recarrega | `boot-sem-cdn` **1 vermelho** ((e)) |
| a regra do CSS fora (`SEMbootfalhouCSS`) | idem | `boot-sem-cdn` **1 vermelho** ((e)) |
| o aviso nunca (`GATEnunca`) | boot normal em retrato: aviso 0 de 98, partida pausada; vira na partida: sem aviso | `touch-controls` **2 vermelhos**; `boot-sem-cdn` 0 |
| a classe já na montagem do vigia (`BOOTFALHOUsempre`) | aviso 0 de 97; idem | `touch-controls` **2 vermelhos**; `boot-sem-cdn` 0 |
| `ec918ab` (`ANTES`) | falha em retrato 0 px; puxão: 22 de 27 através, 30 quadros na malha, 2,27 m | `boot-sem-cdn` **1**; `maptoys` **1** (`TypeError`) |
| sem o laço dos obstáculos (`SEMobst`) | (= `ANTES` no puxão) | `maptoys` **1 vermelho** (0,12 m contra 1,02) |
| todo obstáculo da vizinhança barra (`OBSTqualquer`) | 0 de 23 livres puxadas | `maptoys` **2 vermelhos** |
| sem a faixa de altura (`OBSTsemFaixa`) | **sobrevive** (nada no disco a exercita) | 0 |
| sem o raio do corpo (`OBSTsemCorpo`) | passa AO LADO em 8 de 17, 0 na malha — não é defeito | 0 |
| sem o laço do helicóptero (`SEMheli`) | (r14: 19 de 19 através) | `maptoys` **1 vermelho** (5 de 31) — era 0 em r14 |
| `corpoNaFuselagem` cega (`HELIcego`) | (r14: 19 de 19) | `maptoys` **1 vermelho** (5 de 31) — era 0 em r14 |
| o DADO das caixas do helicóptero encolhido (`HELIcaixaEncolhida`) | **10 de 19** através, 82 quadros na malha | `maptoys`, `veiculo-vida-jogo`, `veiculo-vida-cliente` **0** |

Controle (cópia = árvore): `maptoys` 21/21, `boot-sem-cdn` 7/7, `touch-controls` 53/53.

**Todo mutante de defeito avermelha alguma sonda minha** (`OBSTsemFaixa` sobrevive
porque nada no disco do USAR exercita a faixa; `OBSTsemCorpo` não é defeito). **Os
testes do construtor agora pegam todos os de função** — inclusive os dois do
helicóptero que r14 viu verdes. Não pegam: o DADO das caixas do helicóptero (§A.3),
o alarme falso com o módulo chegando depois ([NC] 1) e o puxão recusado encostado
([NC] 2).

**As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): os resíduos de r10 — a lógica de
   jogo do servidor não mudou, eles seguem, sem teste.
2. **E10 — o alarme falso** ([NC] 1): o aviso de rotação morre para a sessão
   inteira quando o módulo chega depois dos 60 s; reprova regressão obrigatória.
   O avesso a medir junto: o mesmo alarme em paisagem e no BR (a partida que
   começa sozinha).
3. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
4. **O puxão encostado** ([NC] 2) — muito baixa.
5. **As caixas do helicóptero sem âncora no desenho** (§A.3) — o teste do puxão,
   o do empurrão e o da bala herdam a lacuna.
6. **O telhado do mercado/refúgio** (§A.4): pouso ou o topo do empurrão no telhado
   desenhado. **A borda**: purga das 26 bibliotecas e dos dois 404 de QA (fora do
   repo).
7. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
8. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
