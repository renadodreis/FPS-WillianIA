# Validação do porte para CELULAR — commit `1ae1a81`

Décima sexta rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63), `validacao-3d7d47a.md` (46/63),
`validacao-a03c122.md` (46/63), `validacao-b92a932.md` (46/63),
`validacao-af4eb8f.md` (45/63), `validacao-ec918ab.md` (45/63),
`validacao-cbfb44a.md` (45/63). Autor: o **validador** — não escreveu código de
produto nem teste do repo. Nada foi commitado. **A régua não mudou**
(`git diff cbfb44a 1ae1a81 -- docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `cbfb44a`: `f5637a4` (só o laudo 15) e
`1ae1a81`. Em `1ae1a81`, um arquivo de produto só, `game.js` (+711 B):
(1) a 1ª linha do módulo depois das importações tira `html.bootfalhou` — o alarme
do vigia se desfaz quando o jogo chega depois dos 60 s; (2) o `caminhoLivre` do
puxão do canhão: um círculo (carro, pedra, árvore, cacto, barril, tenda) só barra
se o caminho chega mais perto dele do que o raio − 1 mm **e** do que o jogador já
está − 1 mm; o helicóptero só barra se o caminho ENTRA na fuselagem depois de ter
saído (a amostra de partida não conta). Testes: `boot-sem-cdn` (f) e um caso novo
em `maptoys` (a pedra encostada nas costas, apertada 1 cm). Diff vazio em
`server.js`, `br-game.js`, `scripts/`, `package.json`, `index.html`, `style.css`
e `js/` inteiro.

---

## 0. Condições

- **Árvore:** `dev` em `1ae1a81` (`git log -1` no início, 21h58, e no fim,
  01h17). `git status` antes e depois: limpo (no fim só ESTE arquivo, não
  rastreado). sha256 do índice e dos 516 arquivos rastreados fora de `.claude/` em
  `out/r16/arvore-1ae1a81.sha256`, conferido no fim: **idêntico**. Mutantes em
  **cópias** (`copia-r16` para as minhas sondas, `copia-r16c` para os testes do
  construtor — as de r15 renomeadas e sincronizadas por `rsync`; 516 de 516
  arquivos rastreados iguais por `cmp`; `package.json`, `package-lock.json` e
  `node_modules/.package-lock.json` iguais por sha256), restauradas por sha256
  antes de cada mutante e no fim. O **"antes"** é o mutante `ANTES`: o `game.js` de
  `cbfb44a` (`git show`) na cópia — o resto é byte a byte igual.
- **Carga** (12 núcleos; amostrada a cada 20 s, `out/r16/carga.log`):
  - **suíte** (21h59–23h00, 185 amostras): mediana **3,60**, p90 5,23, máx. 6,80.
  - **sondas** (23h01–01h17, 409 amostras): mediana **8,56**, p90 19,3, máx. 28,3.
    Por isso toda fase começou com a carga de 1 min < 4,5 (a cadeia ESPEROU —
    `espera_carga` — antes de cada uma; carga no início e no fim de cada fase em
    `out/r16/cadeia.log`). Durante as fases de navegador com tela de menu (E10, ≡) a
    carga subiu a **13–28**: o PRÓPRIO Chrome por software (swiftshader),
    como em r14/r15; e às 23h24 e 23h54 **outro projeto da máquina** (vitest +
    postgres de `finances-c1`) rodou rajadas — CPU, não porta (0 processo alheio
    nas portas). O que as sondas concluem (classe, aviso, quem está no topo,
    pausado/jogando, de onde o canhão lançou) não depende de tempo; os relógios que
    importam (os 60 s do vigia, os 63 s da requisição segurada, a vazão emulada)
    são de parede e da rede emulada e saíram iguais na árvore e no `ANTES` (alarme
    60,22–60,43 s; 70,30–70,48 s; módulo 64,00–64,38 s; 108,63–108,64 s). As fases
    que dependem do quadro — o puxão contra obstáculo e contra o helicóptero —
    começaram com **2,9–4,5** e terminaram com 3,2–5,0 (a do `ANTES` dos obstáculos
    e a dos 30 giros terminaram a 13–16: rajada no fim), quadro de **16,6 ms**
    (mediana; 15,8–17,1); o `ANTES` repete r15 no encosto (os mesmos 6 de 11
    recusados).
- **Processo alheio:** amostrador de `ps` a cada 20 s (`out/r16/ps.log`): na
  suíte, 261 processos `node --test`/`server.js`, todos descendentes do
  `run-tests` dela — **0 alheios**; nas sondas, 0 em toda fase.
- **Ordem:** a **suíte rodou PRIMEIRO** (21h59–23h00), depois `npm run lint`;
  depois as sondas, uma por vez; por fim os testes do construtor contra os
  mutantes, na cópia, e as fases extras (o ≡ com toque de 80 ms, o helicóptero em
  30 giros).
- **GPU:** Chrome headless (swiftshader). Tempo de frame não medido.
- **Viewports:** V1–V5 e retrato 390×844 com `hasTouch`, `isMobile`, DPR 2.
  Semente 424242 (tela, E10, ≡, D2–D4, helicóptero) e as 10 sementes com
  obstáculo no disco do USAR (35, 69, 70, 72, 78, 80, 124, 138, 143, 164).
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`) no centro do
  que está NO TOPO — o JOGAR ASSIM, o VOLTAR do lobby, o JOGAR SOLO, o ≡, o botão
  do menu na pausa e o `#overlay` livre (o gesto de retomar) — o ≡ também com o
  toque de 80 ms pelo relógio do gesto (§0, correção 4); o celular pelo UA
  Android (`setUserAgentOverride`, com `platform`); o disparo do canhão pelo
  `Cannon.fire()` (o mesmo do prompt do USAR — declarado, como em r14/r15).
- **Rede:** 9 Mbps / 40 ms; os casos `alarme-rede*` a **0,12 Mbps / 400 ms** pelo
  `proxy-br.js` de r13 (a compressão da borda), sem dublê de requisição.
- **Dublês declarados:** de REDE — o `three.core.js` **segurado 63 s e depois
  liberado** (o módulo roda DEPOIS do vigia; os casos `alarme-rede*` confirmam sem
  dublê); de COLOCAÇÃO — o jogador posto (`QA.reset`) na partida do puxão; o grupo
  do helicóptero posto no chão (centro, rumo, giro), como a grade de r14, e o
  jogador posto 3 cm DENTRO da caixa inflada para o EMPURRÃO DO PRODUTO o pôr na
  face (a conta de onde fica a face usa o dado das caixas — só para colocar; a
  âncora é a malha desenhada).
- **Portas:** 3997 (+4097), 3995, 3993, 3984; os testes do construtor na cópia,
  nas portas deles, depois de toda sonda. Nunca a 3000.
- **Correções das MINHAS sondas nesta rodada — medidas e declaradas:**
  1. **`r16-e10`, 1ª passada:** o registro de eventos (classe do `<html>`, texto do
     botão) era montado no `evaluateOnNewDocument`, quando o `<html>` ainda não
     existe — **um `pageerror` da MINHA sonda** em toda página e o registro vazio.
     Corrigido (espera o `<html>`) e refeito (`e10-arvore2`); as amostras da 1ª
     passada (que não dependem do registro) deram a mesma conclusão — aviso em todas
     as amostras em retrato depois do módulo (28/28, 21/21, 41/41) —, mas não entram
     em número nenhum nem em E12.
  2. **O ≡ nas minhas rodadas anteriores era `PointerEvent` despachado no botão**
     (`VQ.tap` — `estados*.js`, `c5real.js`): sem o `click` que o navegador gera
     depois do toque. Foi assim que r10 escreveu "a pausa em si: ✓". Aqui o ≡ é
     tocado pelo `Input.dispatchTouchEvent` — e o resultado muda (§A.5). É o
     formato 4/8 do CLAUDE.md, na MINHA sonda.
  3. **"Atravessou" no puxão contra obstáculo:** o analisador de r15 contava
     "tampado pelo desenho E puxado" — no encosto com o obstáculo ATRÁS o corpo já
     toca o desenho NA PARTIDA (tampado a 0 m) e o puxão o afasta. Em r16 a travessia
     é: o eixo do corpo dentro da malha desenhada na carga, ou o lançamento do outro
     lado; "tampado a 0 m" no encosto é listado à parte.
  4. **O ≡ da 1ª varredura** saiu com o dedo pousado 640–1 540 ms (a página demora a
     desenhar a pausa com a carga do próprio Chrome); refeito com o **toque de 80 ms
     pelo relógio do gesto** (as duas pontas com carimbo de tempo) — §A.5.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `r16-e10.js`, `r16-puxao-obst.js`, `r16-puxao-heli.js`, `r16-heli-modelo.js`,
  `r16-heli-caixas.js`, `r16-prod.js`, `analisa16-puxao.js`, `r14-seeds-node.js`
  (sem mudança), `desemp.js`, `proxy-br.js`, `mut16.py`, `mut16-testes.sh`,
  `cadeia-r16.sh`, `cadeia-r16b.sh`, `tudo-r16.sh`, `carga16.sh`,
  `recursos16.sh`. Saídas em `out/r16/`.

---

## 1. Placar

> **45 aprovados · 5 reprovados · 13 não medidos, em 63** (45/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `cbfb44a` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 8 | 3 (C1, **C9**, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 7 · 2 · 4 |

**Dois critérios mudaram de cor, e o número fica igual:**
- **E10: ✗ → ✓ — o [NC] 1 de r15 FECHOU.** Depois do alarme falso do vigia, o
  aviso de rotação volta assim que o módulo roda: **25 de 25, 15 de 15 e 42 de 42**
  amostras em retrato com o aviso (em `cbfb44a`: **0 de 457, 0 de 24**; r15: 0 de
  72, 0 de 10, 0 de 36), o JOGAR ASSIM aparece (67,1 s; 114,9 s a 0,12 Mbps — sem
  dublê) e o caminho por toque chega a **jogando em retrato**, inclusive a partida
  que virou para retrato no meio (§A.1). O toque no botão do menu com o módulo
  rodando **não recarrega** em nenhum dos 5 toques que chegaram ao botão.
- **C9: ✓ → ✗ — ACHADO, não nasceu desta leva (§A.5).** O ≡ tocado de verdade
  (`Input.dispatchTouchEvent`, não `PointerEvent` despachado) **não segura a
  pausa em V3, V4, V5 e no retrato liberado**: a pausa entra na descida do dedo e o
  `click` do MESMO toque cai no `#overlay` que acabou de aparecer, que retoma o
  jogo. Os ajustes deixam de ser "alcançáveis por toque na pausa" nesses quatro
  viewports (pelo menu principal seguem). Em `cbfb44a`: igual (V3 e retrato
  medidos). Minhas rodadas anteriores pausavam por `PointerEvent` — sem `click` —
  e r10 escreveu "a pausa em si: ✓" (§0, correção 2). O mesmo defeito reforça E9,
  que já reprovava por outro motivo.

O que a leva toca na régua — o aviso de orientação no boot e na partida (E1, E10),
o botão do menu depois do alarme (C2, C4, E1, E12), o puxão do canhão (C10, P4, V1),
o mundo da semente e o caminho quente (D2, D3, D4), os bytes (D6) — foi remedido ou
conferido por leitura. O resto é **não remedido** (o código não mudou; vale o número
de `cbfb44a`, que remete a r10).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista sete.

**Regressões obrigatórias (§8):** M1 ✓ (não remedido), M2 ✓ (não remedido),
C4 ✓, D2 ◌ (a parte medida passa: 232), D6 ✓ (por conta: +711 B), **E10 ✓**
(remedido), E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Defeitos NOVOS nascidos das correções desta leva: 1 de produto** ([NC] 1, o
puxão ATRAVÉS do helicóptero encostado na frente — baixa) **+ 0 de teste**. Em
`cbfb44a`: 2 + 0; em `ec918ab`: 1 + 1 de teste; em `af4eb8f`: 2; em `b92a932`: 3;
em `a03c122`: 4; em `3d7d47a`: 2; em `f672d81`: 2; em `4433c4d`: 2; em `a9a4ffd`:
3; em `afb1ae8`: 4.
**Fecharam os dois achados de r15 que a leva atacou:** o alarme falso que prendia
o retrato ([NC] 1 de r15) e o puxão recusado encostado num obstáculo atrás ([NC] 2
de r15: 6 de 11 recusados → 0 de 11).
**Achado antigo, de maior peso que os da leva:** o ≡ (§A.5).

`test/security-regression.test.js`: verde (na suíte).

**Suíte completa** (`npm test`, 21h59–23h00, carga mediana 3,60, p90 5,23, máx.
6,80): **2 645 testes, 2 642 passaram, 0 falharam, 0 cancelados, 3 pulados**
(61,5 min). Nenhum arquivo foi à triagem; `ps` vazio de `run-tests` antes de ler
o placar; a linha final é a do próprio runner (TAP). O orquestrador relatou
2 642 / 0 / 0 sem triagem — igual (+2 testes contra r15: o (f) do `boot-sem-cdn`
e o caso da pedra encostada do `maptoys`). `npm run lint`: limpo.

---

## A. Os quatro itens do briefing, um por um (e um achado)

### 1. E10 — o alarme falso do vigia agora se desfaz: o aviso volta, o JOGAR ASSIM volta, o retrato joga

**1.1 O caminho real** (`r16-e10`, Android pelo UA, retrato 390×844 salvo
indicação; relógio da PÁGINA pelos eventos do `<html>` e do botão; o `ANTES` é o
`game.js` de `cbfb44a` na cópia, mesma sonda):

| caso | alarme · alarme desfeito (módulo) | depois do módulo, em retrato sem JOGAR ASSIM: amostras com o aviso | JOGAR ASSIM | o caminho do jogador, por toque | `ANTES` (`cbfb44a`) |
|---|---|---|---|---|---|
| `alarme-retrato` (`three.core.js` segurado 63 s) | 60,22 · **64,00 s** | **25 de 25** | 67,09 s | o toque no VOLTAR antes do JOGAR ASSIM cai no aviso (nada muda); JOGAR ASSIM → JOGAR SOLO → **jogando em retrato** (iniciado, não pausado) | **0 de 457** (`bootfalhou` em 457 de 457); JOGAR ASSIM nunca; JOGAR SOLO → partida **PAUSADA**; o toque no `#overlay` → **segue pausada** |
| `alarme-vira` (paisagem; joga; vira) | 60,24 · **64,05 s** | **15 de 15** | 0,9 s depois de virar | joga em paisagem; vira → **pausa com aviso e JOGAR ASSIM**; JOGAR ASSIM → toque no `#overlay` livre → **jogando em retrato**; volta a paisagem → segue jogando | **0 de 24**: pausa sem aviso e sem JOGAR ASSIM; o toque no `#overlay` → segue pausada |
| `alarme-rede` (**0,12 Mbps / 400 ms**, proxy da borda, sem dublê) | 70,31 · **108,63 s** | **42 de 42** | 114,95 s | JOGAR ASSIM → JOGAR SOLO → **jogando em retrato** | (r15, mesma rede: 0 de 36) |
| `alarme-rede-paisagem` (a mesma rede, V2) | 70,31 · **108,64 s** | — | — | o botão na janela entre o módulo e o menu: §1.2; JOGAR SOLO aos 113,68 s → toque → **joga, sem recarga** | o mesmo, com `bootfalhou` em 62 de 62 amostras |

Em todos: **0 `pageerror`, 0 `console.error`** (segunda passada; §0, correção 1) — e em todas as 84 páginas/conjuntos das
sondas desta rodada, salvo as 5 da 1ª passada de E10, cujo erro era da MINHA sonda.
Os relógios da árvore e do `ANTES` batem (alarme 60,2–60,4 s / 70,3 s; módulo
64,0–64,4 s / 108,6 s).

**1.2 O avesso — o botão do menu depois do alarme desfeito.**
- **Texto:** o vigia escreveu "⚠ O JOGO NÃO CARREGOU — TOQUE PARA TENTAR DE NOVO" e
  tirou o `disabled`; o módulo só repinta o botão no 1º `bootFase` — depois do
  `await` do `init` do socket (até 3 s) e do terreno. Janela medida: **2,27 s**
  (64,00 → 66,27 s) com o dublê, **4,90 s** e **4,17 s** a 0,12 Mbps (108,63 →
  113,53 s; 108,64 → 112,81 s) com o botão dizendo "TOQUE PARA TENTAR DE NOVO" e o
  jogo já carregando. Depois: "CARREGANDO O MUNDO… (fase)" → "▶ JOGAR SOLO".
- **Toque nessa janela** (`alarme-rede-paisagem`, a 0,5 s do módulo, o botão NO
  TOPO): **não recarrega** (marca na página intacta, 0 navegação no DevTools) — e
  **não faz nada** (a guarda do vigia recusa a recarga; o ouvinte do jogo ainda
  não existe). Em `ANTES` a janela é a mesma (108,64 → 112,36 s) e o toque também
  não recarrega: **resíduo do vigia, não desta leva — muito baixa** (≤ 5 s de
  texto que pede um toque que não faz nada, só no link de 2G).
- **Toque no JOGAR SOLO depois do alarme** (os 4 casos): o ouvinte do vigia roda e
  **não recarrega**; a partida começa. Com o jogo rodando o botão fica
  `disabled` (o toque cai no `#menuBtns`): 0 recarga.
- **Mutante `RELOADsempre`** (a guarda do vigia fora): o JOGAR SOLO depois do
  alarme **recarrega a página** (a partida nunca começa; 1 navegação a mais) e o
  toque na janela **recarrega** — a sonda pega.

**1.3 A partida em retrato pausada que nenhum toque retomava** (r15, §A.1.3):
fechou — o aviso volta por cima e o JOGAR ASSIM existe (§1.1); depois dele, o toque
no `#overlay` livre retoma (alarme-vira: pausado → jogando em retrato). O que NÃO
retoma é outra coisa: o ≡ não segura a pausa em retrato (§A.5) — a pausa é que
some, não a retomada.

**1.4 Mutantes do item 1** (cópia): `ANTES` (= `SEMremove` no boot) — os números
da coluna `ANTES` acima; `REMOVEtarde` (o alarme desfeito só quando o menu fica
do jogo, no fim do módulo): **4 de 23** amostras em retrato depois do módulo sem o
aviso (os ~3 s entre o módulo e o menu) — a sonda acusa, fraco; `RELOADsempre`:
acima. Testes do construtor: §5.

### 2. O puxão — os círculos FECHAM e o avesso deles passa; o helicóptero ganhou um avesso: [NC] 1

**2.1 Os círculos** (`r16-puxao-obst`: as 10 sementes com obstáculo de corpo no
disco do USAR, `?mobile=1`, V2, laço no rAF; 11 obstáculos; as retas de r15 — o
centro do obstáculo a 0 / 0,5 / 0,9 / 1,1 / 1,5 × R da reta e o controle 90° — e
o jogador ENCOSTADO no círculo de corpo em θ = 0° (o obstáculo ATRÁS, o puxão o
afasta — as "11 posições" de r15), 45°, 90°, 135° e 180° (o obstáculo NA FRENTE,
entre o jogador e o centro: o avesso pedido), 10 cm para dentro (o empurrão do
produto o põe na borda) e 5 cm de folga em θ = 0. Âncora: a MALHA DESENHADA das
instâncias perto do obstáculo — o caminho tampado e o eixo do corpo DENTRO dela;
o produto só é lido em de onde lançou. Carga 4,2 → 3,8; `ANTES` 2,9 → 15,6 — subiu no fim, rajada alheia; as decisões
são por quadro, e o `ANTES` repete r15 no encosto, obstáculo por obstáculo):

| | árvore (`1ae1a81`) | `ANTES` (`cbfb44a`) |
|---|---|---|
| **encostado, obstáculo ATRÁS (θ = 0), 11** | **11 puxados**; 0 quadros com o eixo na malha; salto ≤ 0,24 m | **5 puxados** — recusam 69, 70, 72, 124, 138, 143 (os 6 de r15) |
| folga de 5 cm (θ = 0), 11 | 11 puxados | 11 puxados |
| θ = 45°, 11 | 11 puxados (0 na malha) | 7 puxados |
| θ = 90°, 11 | 1 puxado; recusados: 3 tampados pelo desenho + 7 livres pelo desenho (o círculo de corpo é maior que o desenho nessa altura — a regra de ANDAR) | idêntico |
| θ = 135°, 11 | 0 puxados (8 tampados, 3 livres recusados) | idêntico |
| **encostado, obstáculo NA FRENTE (θ = 180°), 10** | **0 puxados — 10 de 10 tampados pelo desenho, todos recusados**; 0 quadros na malha | idêntico |
| retas off/controle, 66 | tampadas 23: **0 através** (1 "puxada" com o corpo tocando o desenho só NA PARTIDA — o cacto da 143, que fica atrás); livres 43: **39 puxadas** — recusam 2 pela pedra (círculo > desenho, como r15), 1 pela pedra vizinha (78, controle — r15 §0.3) e 1 árvore (124, 0,9 R: o empurrão a pôs na borda e a reta vai para o centro dela) | r15 nesta mesma sonda: 0 através; 35 de 43 livres puxadas |

O avesso dos círculos **não existe por construção**: começando dentro do raio,
todo caminho que se aproxima do centro do obstáculo tem `dMin` < a distância da
partida e é barrado — medido: 10 de 10 na frente, 0 de 11 em 135°, 0 travessias
nas 66 retas e nos 65 encostos.

**2.2 Mutantes dos círculos:**
- `BARRAsemInicio` (a regra de `cbfb44a`, mas COM a folga de 1 mm): **sobrevive na
  minha sonda** — 11 de 11 encostados puxados. O empurrão do produto deixa o corpo
  EXATAMENTE no círculo, e a folga de 1 mm sozinha já tira o empate; a condição
  "mais perto do que já está" só age com o corpo > 1 mm DENTRO do círculo, que
  nenhum caminho de produto que medi produz (o teste do construtor o aperta 1 cm à
  mão). Não é defeito; é a outra metade da correção fazendo o trabalho.
- `BARRAsoInicio` (só a condição nova, sem o raio): **0 de 15** retas livres
  puxadas, 0 de 4 encostados — o avesso "barra tudo" avermelha.

**2.3 O helicóptero — [NC] 1 (nasceu de `1ae1a81`, baixa): encostado na lataria
com o helicóptero NA FRENTE, o puxão o leva ATRAVÉS da fuselagem.**

Mecanismo, lido e medido: o empurrão (`empurrarDaFuselagem`) põe o corpo
exatamente na face (`lx = x0`), no referencial girado; a ida e a volta pela rotação
arredondam essa coordenada — às vezes para DENTRO (`lx > x0` por 1 ulp). A regra
nova diz "encostado no começo: só barra se o caminho ENTRAR de novo depois de
sair". Mas o caminho para o centro que atravessa a fuselagem INTEIRA não sai e
entra: ele começa "dentro", segue dentro e sai do outro lado — e passa. A cada
quadro da carga o canhão o leva para dentro, o empurrão o devolve à face, e a
consulta repete; quando o arredondamento cai para dentro em TODO quadro (nesta
semente, giro de 90° e de 270°), a carga termina com `k = 1` e o corpo salta para
o centro, do outro lado; quando muda de quadro para quadro, uma amostra "fora"
basta para barrar.

Medido no produto (`r16-puxao-heli`: semente 424242, solo, V2, laço no rAF, quadro
de 16,6 ms; o helicóptero no chão com o centro a 2,0 e 2,8 m do centro do canhão,
dois rumos, três deslocamentos laterais, 8 giros; o jogador posto 3 cm dentro da
caixa inflada e o EMPURRÃO DO PRODUTO o pondo na face; só conta quem fica a ≤
4,6 m do centro, o prompt do USAR). Âncora: a malha desenhada do helicóptero, sem o
rotor (paridade POR MALHA — fuselagem e cabine se sobrepõem):

| | árvore (`1ae1a81`) | `ANTES` (`cbfb44a`) | `HELIsaiuSempre` (a partida não conta como "dentro") |
|---|---|---|---|
| **NA FRENTE** (o helicóptero entre o jogador e o centro), 75 colocações; o eixo do corpo cruza o desenho no caminho reto em 75 | **24 puxados ATRAVÉS** (lançados do centro, do outro lado); **131 quadros com o eixo do corpo DENTRO da malha desenhada**; maior salto num quadro **1,82 m** | **0** | **0** |
| … por giro | 90°: **12 de 12**; 270°: **12 de 12**; 0°, 23°, 67°, 151°, 180°, 247°: 0 de 51 | 0 | 0 |
| ATRÁS (o helicóptero atrás; o puxão o afasta), 96 | livres pelo desenho: **59 de 63 puxados**; o corpo toca o desenho no caminho sem o eixo cruzá-lo: **24 de 30**; **0 travessias** (as 3 retas que cruzam o desenho: 0 puxadas) | 45 de 63; 4 de 30; 0 | — |

O lado ATRÁS melhorou como o dos círculos (o equivalente do [NC] 2 de r15 no
helicóptero: 34 decisões mudaram, todas de "recusado" para "puxado", nenhuma
atravessando). O lado da FRENTE regrediu: era 0 de 75.

Frequência em jogo: precisa do helicóptero pousado a ~3 m do centro do canhão e do
jogador encostado do lado de fora tocando o USAR. O modelo em Node (`r16-heli-
modelo.js`, a mesma aritmética, 4 000 colocações por linha — não é âncora, escolheu
onde medir) dá **2,5 %** das colocações alcançáveis a 60 qps e **6 %** a 30 qps
com giro QUALQUER, e 41 % com giro múltiplo de 90°. No produto, com 30 giros
sorteados (`heli-giros`, 91 colocações alcançáveis, quadro de 16,6 ms): **2 de 91
atravessaram** (78,9° e 228,6°; 32 quadros com o eixo na malha; salto de até 1,88 m)
— **2,2 %**, como o modelo previu. O helicóptero que nunca girou (0°, o do heliponto) dá 0 de 7.
**Baixa**: raro, sem efeito no servidor (o maior salto, 1,88 m num quadro, dá ≤
~38 m/s na janela do `state` — abaixo do "suspeito" do anti-teleporte; detalhe fora
do repo) — mas é exatamente a classe que a leva fechou para os obstáculos
(atravessar o desenho), reaberta no helicóptero, e **nenhum teste a cobre**:
`HELIsaiuSempre` e `HELIvelho` deixam o `maptoys` **verde** (22 de 22, §5).

### 3. As caixas do helicóptero × o desenho — defeito pequeno de geometria, além da cobertura

Medido em `r16-heli-caixas` (as caixas são `VV.TIPOS.heli.caixas`, a bala é a
consulta do produto `Veiculos.raio`; a âncora é o desenho):

**(A) A régua que o próprio repo aplica aos CARROS** (`veiculo-vida-jogo`,
"calibragem": vértices do desenho no referencial do grupo, percentis 0,5–99,5 % em
planta e 99,5 % no teto, tolerância ±8 cm), aplicada por caixa:
- **fuselagem + cabine × caixa 1:** x −1,35…2,05 (= desenho), z ±0,80 (= desenho),
  teto 1,90 (= desenho), piso 0,40 contra 0,426 desenhado (2 %): **passa**;
- **cone da cauda + leme × caixa 2:** z ±0,30 contra ±0,24 (passa); **teto 1,85
  contra 2,25 desenhado — 40 cm do leme sem caixa; comprimento −3,55 contra −3,65 —
  10 cm**: **reprova** a régua dos carros;
- fora das duas caixas: o **mastro** (y 1,80–2,30: 40 cm acima da caixa 1), os
  **esquis** e os **suportes** (y 0,13–0,87, abaixo do piso de 0,40 e até 6 cm para
  fora em z). O rotor e o rotor de cauda ficam fora por decisão escrita ("o rotor
  não segura bala").

**(B) A bala de verdade** (1,39 milhão de retas paralelas, grade de 3 cm, 12 rumos
horizontais e 12 de cima a −30°), por vista, em média:

| | helicóptero | buggy (caixa calibrada pela régua do repo; grade de 4 cm) |
|---|---|---|
| desenho E caixa | 5,07 m² | 2,90 m² |
| **desenho sem caixa — a bala atravessa o desenho** | **0,41 m²** (esqui 57 %, leme 27 %, mastro 10 %, suporte 6 %) | 0,06 m² |
| caixa sem desenho — a bala para no ar | 1,68 m²; a reta a p50 12 cm / p90 24 cm / máx. 45 cm da silhueta | 1,18 m²; p50 16,5 / p90 41 / máx. 57 cm |

**Veredito do item 3: defeito (muito baixo) E lacuna de cobertura — não nasceu
desta leva** (as caixas vieram com a vida dos veículos). O lado "para no ar" está
dentro do padrão aceito nos carros (mais justo que o buggy); o lado "atravessa o
desenho" não: peças desenhadas sólidas — o topo do leme (0,5 × 0,4 m), o mastro, os
esquis — deixam a bala passar, 6,5 × a área do buggy calibrado ("desenho sólido
tem de barrar bala"). Ninguém se esconde atrás de um esqui; o leme fica acima da
cabeça. Nenhum teste compara as caixas do helicóptero com o desenho
(`veiculo-vida-jogo` pula o helicóptero): um teste com a régua dos carros pegaria a
caixa da cauda hoje.

### 4. Os resíduos de r13–r15 que a leva não mexeu — declarados, não remedidos

`js/obstaculos.js`, `js/maptoys*.js`, `js/cannon.js`, `server.js` e as linhas de
corpo × obstáculo do `game.js` (`updatePlayer`): diff vazio. Valem os números de
r13:
- **o telhado do mercado/refúgio é parede invisível** — empurrão 1,6–2,6 m ACIMA
  do telhado desenhado, salto de até 3,75 m num quadro; não há pouso. Baixa.
- **o barril de 1,05 m não se pula** (o pulo chega a 1,6 m; a margem é de
  propósito). Observação.
- **o recorde do curso × a taxa de quadros** — resolução de um quadro (17–28 ms)
  contra os 10 ms que a tela compara. Muito baixa.
- **Segurança** — o carro solto (resíduos de r10) e o carro DIRIGIDO sem
  conferência de chão: `server.js` sem diff; seguem, sem teste. Detalhe **fora do
  repo**.
- **A borda da produção** (`r16-prod`, só GET de arquivo público, 22h14): **`1ae1a81`
  está no ar** (`index.html`, `game.js` — com a 1ª linha que desfaz o alarme —,
  `style.css`, `js/heli.js` = os da árvore por sha256); os 26 do boot seguem
  **`HIT`, brotli, 589 661 B, idade 10,4–11,7 h** — a mesma cópia de antes de
  `ec918ab` que r15 viu. **Os dois 404 de QA de r13 seguem guardados**; os de
  r14, r15 e desta rodada saíram `no-store`/`BYPASS`. Saem com purga (fora do repo).
- Inalterados (código intocado): o aro dourado, o cano, o poste, a faixa de 0,45 m.
- D6 dos modelos (gzip): esperando o dono.
- Observações do laudo 8: a saia do vulcão como muralha; o carro no relevo dentro
  da rocha do vulcão enquanto alguém dirige; B6 pela letra — **não remedidas**
  (diff vazio nos arquivos delas).

### 5. ACHADO (antigo, não desta leva): o ≡ não segura a pausa em V3, V4, V5 e no retrato liberado

Medido com o toque de verdade (`Input.dispatchTouchEvent`) no centro do ≡, com a
partida rodando (solo, Android pelo UA; em retrato depois do JOGAR ASSIM), duas
vezes: o toque da sonda (o dedo ficou 0,6–1,5 s na página — ela demora a desenhar
a pausa) e o **toque de 80 ms pelo relógio do gesto** (0,003–0,007 s entre
`pointerdown` e `pointerup` na página). Registro de eventos na fase de captura:
alvo do `pointerdown`/`pointerup`/`click` e cada troca do `#overlay`.

| viewport | ≡: canto (x, y) · lado, CSS px | toque longo: o `click` cai em · 1,5 s depois | toque de 80 ms: o `click` cai em · a pausa durou | `ANTES` (`cbfb44a`, 80 ms) |
|---|---|---|---|---|
| V1 667×375 | 388,210 · 48 | o botão CONFIGURAÇÕES (`#btnSettings`) · **pausado** (no centro da tela, o `#menuBtns`) | `#btnSettings` · fica | — |
| V2 800×360 (a classe do S22 do dono) | 518,195 · 48 | `#menuBtns` · **pausado** | `#menuBtns` · fica | — |
| V3 844×390 (o da suíte) | 561,225 · 48 | `#loadingMsg` · **jogando** | `#loadingMsg` · **4 ms** | `#loadingMsg` · 7 ms |
| V4 932×430 | 646,263 · 48 | `#loadingMsg` · **jogando** | `#loadingMsg` · **11 ms** | — |
| V5 1180×820 | 736,554 · 74 | `#overlay` · **jogando** | `#overlay` · **6 ms** | — |
| retrato 390×844 liberado | 216,546 · 51 | `#overlay` · **jogando** | `#overlay` · **8 ms** | `#overlay` · 4 ms |

**Mecanismo:** o ≡ age na DESCIDA do dedo (`onBtnDown` → `setPaused(true)`, e o
`#overlay` aparece no mesmo quadro); o `preventDefault()` do `pointerdown` corta o
mouse de compatibilidade, mas **não o `click`** do toque, que o navegador manda
depois do `pointerup` para o que estiver NO TOPO naquele ponto — já o `#overlay`.
O ouvinte de `click` do `#overlay` retoma quando o alvo não é botão do menu
(`#menuBtns, #settings, #ctlBox, #mpPanel, .mbtn`): em V1 e V2 o ponto do ≡ cai num
botão do menu (que o ouvinte ignora) e a pausa fica; em V3/V4 cai no texto
`#loadingMsg` e em V5/retrato no fundo do `#overlay` — retoma.
**Prova:** o mutante `PAUSAsemClickDoMesmoToque` (o `#overlay` ignora o `click`
nos 3 s depois de pausar) — **V3, V5 e retrato ficam pausados**. `ANTES` igual à
árvore: **não nasceu desta leva** (as linhas envolvidas — `touchcontrols.js`,
`setPaused`, o ouvinte do `#overlay` — não mudaram). As minhas rodadas anteriores
tocavam o ≡ com `PointerEvent` despachado, que não gera `click` — o "a pausa em si:
✓" de r10 foi medido assim (§0, correção 2). A suíte idem: `touch-controls`, "dado
o botão de pausa, então pausa e o toque na tela retoma", toca o ≡ por
`PointerEvent` e chama `overlay.click()` À PARTE para retomar — o `click` que o
navegador gera junto com o toque do ≡ nunca aparece (formato 4: o teste dirige o
produto).

**Consequência na régua:** C9 ("alcançável por toque na pausa") **reprova** em V3,
V4, V5 e no retrato liberado; E9 ("≡ pausa") reprova também por isto. **Média**: no
viewport do iPhone 14 (V3) e nos maiores, e em quem joga em retrato, não há como
pausar nem abrir os ajustes no meio da partida; no V2 do S22 do dono o ≡ funciona.
Confirmação no aparelho: E14 (o toque do DevTools passa pelo mesmo reconhecedor de
gesto do Chrome — o `click` sai dele —, mas é emulação).

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Não remedido.** O bot (`scripts/bots.js`), o servidor de jogo e a geometria de
bala (`js/paredes.js`, `js/obstaculos.js`, `js/maptoys-core.js`) não mudaram.
Valem os números de r10: pares geométricos **1 de 10 312** tampados vistos (o par
de caminhão de sempre), **cego 0 de 8 629**; atrações 0 e 0; a arena de r7 (0 / 0 /
0 / 0 em 52 válidos); "a tela não mostra e a vítima aceita" **38** (16 atrás de
poste). **Veredito: ◌ — igual a r10**, pelas duas razões de `d381d29`.

O que toca a TELA nesta rodada: o desenho do helicóptero que não segura bala
(§A.3: esquis, mastro, topo do leme — 0,41 m² por vista) vale para todo tiro que
use as caixas do veículo; nenhum caso de bot medido.

---

## 3. Veredito por critério (com a comparação com `cbfb44a`)

"Não remedido" = o código que o critério mede não mudou nesta leva; vale o número
de `cbfb44a` (que remete a r10).

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
| **C2** | ✓ | ✓ | Não remedido (HTML/CSS sem diff). No estado novo — o botão do menu na janela entre o módulo e o menu — o botão está NO TOPO e recebe o toque (§A.1.2). |
| **C3** | ◌ | ◌ | Não remedido: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | Não remedido. Os textos do botão nas páginas do item 1 ("⚠ O JOGO NÃO CARREGOU — TOQUE PARA TENTAR DE NOVO", "CARREGANDO O MUNDO… (fase)", "▶ JOGAR SOLO"): 0 tokens de teclado. |
| **C5**–**C8** | ✓ | ✓ | Não remedidos (r10). C5(b) — o toque que retoma não atira nem gira — não é o que o ≡ quebra (§A.5: o problema é a pausa não ficar). |
| **C9** | **✗** | ✓ | **Achado (§A.5), não desta leva:** "alcançável por toque na pausa" — em V3, V4, V5 e no retrato liberado o ≡ não segura a pausa (o `click` do mesmo toque retoma no `#overlay`); os ajustes da pausa ficam inalcançáveis por toque nesses viewports. Em V1 o mesmo `click` cai no botão CONFIGURAÇÕES e em V2 no `#menuBtns` — a pausa fica. Pelo menu principal: alcançáveis. O resto de C9 não remedido. |
| **C10** | ✓ | ✓ | Não remedido (r12). O puxão recusado zera a velocidade como antes (`cannon.js` sem diff). |
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
| **P2**–**P4** | ✓ | ✓ | Não remedidos (r10). P4 mede parede de CONSTRUÇÃO (intocada); o puxão contra obstáculo e helicóptero (§A.2) não é prédio. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | Não remedido (r10). §A.3: no helicóptero, 0,41 m² de desenho por vista deixam a bala passar (esquis, mastro, topo do leme) — nenhuma dessas peças tampa cabeça e tronco de quem está atrás (o leme fica acima da cabeça), que é o que V1(a) cobra; observação, não reprova. O puxão através do helicóptero ([NC] 1) é corpo, não bala. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **232 draw calls p50** (mín. 223, máx. 257, mundo de 23,1 s; r15: 231) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 631: **0 `Object3D`** (ATIRAR arrastando: 12, os mesmos de r10–r15). |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais**, e os dois retratos iguais aos de r15 byte a byte (a linha nova do boot não cria objeto nem consome sorteio). |
| **D5** | ✓ | ✓ | Não remedido. |
| **D6** | ✓ | ✓ | **Por conta, não remedido:** a leva soma **+711 B** crus ao `game.js` (+314 B em gzip −9) aos 3,27–3,70 MB da arma pronta medidos em r14 (limiar 5,25). Produção: os 26 do boot seguem os 589 661 B em brotli que a borda já tinha (§A.4). |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1** | ✓ | ✓ | (e) **remedido no estado do alarme falso**: o aviso cobre o lobby em retrato (o que está no topo no JOGAR SOLO é o `#rotateGate`, e o toque no VOLTAR não muda nada; em r15 falhava neste estado, contado em E10). Boot normal em retrato: aviso desde 0,26 s, JOGAR ASSIM aos 6,88 s → JOGAR SOLO → jogando. O resto não remedido (r10). |
| **E2**, **E3** | ✓ | ✓ | Não remedidos. |
| **E4**, **E5** | ◌ | ◌ | Não remedidos. |
| **E6**–**E8** | ✓ | ✓ | Não remedidos. |
| **E9** | ✗ | ✗ | Não remedido (sem "sair da partida" no BR; decisão do dono). **E "≡ pausa" também reprova** (achado, §A.5): em V3, V4, V5 e no retrato liberado a pausa não fica. |
| **E10** | **✓** | ✗ | **O [NC] 1 de r15 fechou (§A.1):** depois do alarme falso o aviso volta (25/25, 15/15, 42/42), o JOGAR ASSIM aparece, o retrato joga, a partida que vira pausa com aviso e retoma depois do JOGAR ASSIM. Boot normal em retrato: ✓. O resto (dirigindo; C2/C3 em 390×844 liberado) não remedido. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; **0 `pageerror` e 0 `console.error`** em todas as páginas das sondas desta rodada depois da correção 1 do §0 (o `pageerror` da 1ª passada era da MINHA sonda). |
| **E15** | ✓ | ✓ | Não remedido (r10). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `1ae1a81`, baixa] Encostado no helicóptero, com ele NA FRENTE, o puxão
   do canhão leva o jogador ATRAVÉS da fuselagem.** O laço novo do `caminhoLivre`
   ignora as amostras do começo enquanto o corpo está "dentro" e só barra se o
   caminho ENTRAR de novo depois de sair; o empurrão deixa o corpo exatamente na
   face, e a volta pela rotação arredonda para dentro em parte das poses — o caminho
   que atravessa a fuselagem inteira nunca "entra de novo". Reprodução: semente
   424242, solo; o helicóptero no chão com o centro a 2,0 m do centro do canhão, no
   rumo 30°, girado 90°; o jogador encostado na lataria do lado de FORA (empurrado
   para a face) e USAR: o corpo passa pela malha desenhada em 4–7 quadros e é
   lançado do centro, do outro lado (salto de até 1,82 m num quadro). Medido: **24
   de 75** colocações com giro de 90°/270° (12 de 12 cada), **2 de 91** com giro
   sorteado (2,2 %); `cbfb44a`: **0 de 75**. Sem teste (o `maptoys` fica verde com
   `HELIsaiuSempre` e `HELIvelho`). É a classe que a leva fechou nos obstáculos
   (atravessar o desenho), reaberta no helicóptero.
2. **[ACHADO — antigo, não desta leva, média] O ≡ não segura a pausa em V3, V4, V5
   e no retrato liberado** (§A.5). Reprodução: V3 844×390, Android, JOGAR SOLO,
   tocar o ≡ (toque de verdade): o `#overlay` aparece e some em 4 ms — o `click` do
   mesmo toque cai no `#loadingMsg`/`#overlay` e retoma. Em V1/V2 cai num botão do
   menu e a pausa fica. Reprova **C9** (cor nova) e reforça **E9**. Prova:
   `PAUSAsemClickDoMesmoToque` deixa V3, V5 e retrato pausados.
3. **[Item 3 — antigo, muito baixa] As caixas do helicóptero × o desenho** (§A.3):
   pela régua que o repo aplica aos carros, a caixa da cauda deixa 40 cm do leme sem
   bala (teto 1,85 × 2,25) e é 10 cm curta; mastro, esquis e suportes fora de caixa;
   0,41 m² de desenho por vista deixa a bala passar (o buggy calibrado: 0,06). O
   "para no ar" está no padrão dos carros. E nenhum teste compara as caixas com o
   desenho.
4. **[Resíduo do vigia — antigo, muito baixa]** Depois do alarme falso o botão segue
   dizendo "⚠ O JOGO NÃO CARREGOU — TOQUE PARA TENTAR DE NOVO" por **2,3–4,9 s** com
   o jogo já carregando, e o toque nele **não faz nada** (nem recarrega, nem começa)
   — o módulo só repinta o botão depois do `init` do socket e do terreno (§A.1.2).
   Igual em `cbfb44a`.
5. **Lacunas de teste:** o lado do helicóptero da correção (e o [NC] 1) — nenhum
   teste; a guarda do vigia contra recarga com o jogo rodando — `RELOADsempre`
   verde no `boot-sem-cdn`; o ≡ por toque de verdade — a suíte despacha
   `PointerEvent` (sem `click`). **Observação sobre o teste novo da pedra:** ele
   aperta o corpo 1 cm DENTRO do círculo à mão; em todos os caminhos de produto que
   medi o empurrão deixa o corpo EXATAMENTE no círculo, e a folga de 1 mm sozinha já
   resolve o encosto (`BARRAsemInicio` passa os 11 de 11 na minha sonda) — o teste
   mede um estado que eu não reproduzi no produto. Não é defeito.
6. **Resíduos de r13, não mexidos** (§A.4): telhado do mercado/refúgio como parede
   invisível (baixa); barril que não se pula (observação); recorde × taxa de quadros
   (muito baixa).
7. **Segurança** — o carro solto (resíduos de r10) e o carro DIRIGIDO sem
   conferência de chão: não remedidos. **A borda da produção segue com as 26
   bibliotecas de antes de `ec918ab` e com os dois 404 de QA de r13.** Detalhes
   **fora do repo**.
8. Inalterados (código intocado): **o canhão mostra o que a bala atravessa** (cano
   141, aro dourado 10, faixa da borda ≤ 11,2 cm — r10), **faixa de 0,45 m acima
   de peça de corpo**, **agachado atrás de poste** (16), **P1**, **C11**,
   **C1(e)**, **E9** (sair da partida).

**Fecharam nesta leva:** o [NC] 1 de r15 (o alarme falso apagava o aviso de
rotação para a sessão inteira: 0 de 457 → 25 de 25 / 15 de 15 / 42 de 42) e o [NC]
2 de r15 (encostado num obstáculo atrás, o puxão recusado: 6 de 11 → 0 de 11; e no
helicóptero, o mesmo lado: 45 → 59 de 63 livres puxados).

**Observações sem veredito:** (a) a beira da saia do vulcão segue muralha; (c) o
carro segue no relevo dentro da rocha do vulcão enquanto alguém dirige; B6 pela
letra — **não remedidas** (diff vazio); (e) o gzip quase não reduz a bazuca
(−4 %), D6 dos modelos esperando o dono; (f) P4(b): o canhão sobre a encosta
aparece como base suspensa; (g) **o texto novo do `CLAUDE.md`** ("se o módulo
chegar DEPOIS do alarme (link lento), a 1ª linha do game.js desfaz o alarme")
confere com o medido; o trecho do canhão ("a CARGA puxa o jogador … se nenhum
veículo estiver no caminho") segue sem citar os obstáculos nem a regra nova do
encosto; (h) a borda serve as cópias de antes do deploy (§A.4); (i) o notebook com
toque e ponteiro GROSSO com tela < 900 px é tratado como celular — regra 4 de
`js/mobile.js`, não desta leva; (j) **não medido:** se o mesmo `click` atravessa
outros botões que abrem algo por cima na DESCIDA do dedo (inventário, chat).

**Contagem:** 5 critérios reprovados (C1, **C9**, C11, P1 e E9); **0 reprovam por
defeito nascido de correção desta rodada**; **1 defeito novo de produto e 0 de
teste** nasceram das correções ([NC] 1, baixa); **as duas correções da leva
fecharam o que r15 mediu**; **1 achado antigo de peso médio** (o ≡) muda C9 de cor.

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| `cbfb44a` (`ANTES`) | E10: aviso **0 de 457** e **0 de 24** depois do módulo, JOGAR ASSIM nunca, partida em retrato presa; puxão: encostado atrás **5 de 11**; helicóptero na frente **0 de 75** | `boot-sem-cdn` **1 vermelho** ((f)); `maptoys` **1 vermelho** (pedra encostada) |
| a 1ª linha fora (`SEMremove`) | (= `ANTES` no boot) | `boot-sem-cdn` **1 vermelho** ((f)); `touch-controls` 0 |
| o alarme desfeito só no fim do módulo (`REMOVEtarde`) | **4 de 23** amostras sem o aviso depois do módulo — fraco | `boot-sem-cdn` **1 vermelho** ((f)) |
| a guarda do vigia fora (`RELOADsempre`) | JOGAR SOLO depois do alarme **recarrega** (a partida não começa); o toque na janela **recarrega** | `boot-sem-cdn` **0** — sem teste |
| o círculo sem "mais perto do que já está" (`BARRAsemInicio`, com a folga de 1 mm) | **sobrevive** — 11 de 11 encostados puxados (a folga basta no produto) | `maptoys` **1 vermelho** (a pedra apertada 1 cm) |
| só "mais perto do que já está" (`BARRAsoInicio`) | **0 de 15** livres puxadas, 0 de 4 encostados | `maptoys` **3 vermelhos** |
| o helicóptero ignora o começo dentro (`HELIsaiuSempre`) | na frente: **0 de 75** (a travessia some) | `maptoys` **0** |
| o laço do helicóptero de `cbfb44a` (`HELIvelho`) | (= `ANTES` no helicóptero: 0 de 75) | `maptoys` **0** |
| o `#overlay` ignora o `click` nos 3 s depois da pausa (`PAUSAsemClickDoMesmoToque`, prova do achado) | V3, V5 e retrato **ficam pausados** (eram 4–8 ms) | — |

Controle (cópia = árvore): `maptoys` 22/22, `boot-sem-cdn` 8/8, `touch-controls`
53/53.

**Todo mutante de defeito avermelha alguma sonda minha**; `BARRAsemInicio`
sobrevive porque não é defeito nos caminhos de produto medidos (§A.2.2). **Os
testes do construtor pegam** a linha do boot (inclusive tardia) e a regra dos
círculos nos dois sentidos. **Não pegam:** o lado do helicóptero da correção — nem
a travessia que ela abriu ([NC] 1) —, a guarda do vigia contra recarga, e o ≡ por
toque de verdade.

**As minhas sondas erraram, e está no §0** (o `pageerror` da 1ª passada de E10; o
≡ por `PointerEvent` nas rodadas anteriores; o "atravessou" que contava o encosto
na partida).

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): os resíduos de r10 — a lógica de
   jogo do servidor não mudou, eles seguem, sem teste.
2. **O ≡ que não segura a pausa** (achado, §A.5) — reprova C9 e E9; média; V3/V4/V5
   e o retrato. O mecanismo está medido (o `click` do mesmo toque); o remédio é do
   construtor. O avesso a medir junto: V1/V2 (onde hoje fica) e o toque que retoma.
3. **[NC] 1 — o puxão através do helicóptero encostado na frente** — baixa; e um
   teste que o pegue (o atual não cobre o lado do helicóptero).
4. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
5. **As caixas do helicóptero × o desenho** (§A.3): a caixa da cauda pela régua
   dos carros, as peças finas, e o teste que falta.
6. **O telhado do mercado/refúgio** (§A.4): pouso ou o topo do empurrão no telhado
   desenhado. **A borda**: purga das 26 bibliotecas e dos dois 404 de QA (fora do
   repo). O texto do botão do vigia na janela (§4.4) — muito baixa.
7. **P1**, **C11** (decisão do dono), **C1(e)**, **E9** (sair da partida).
8. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
