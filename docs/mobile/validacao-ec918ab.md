# Validação do porte para CELULAR — commit `ec918ab`

Décima quarta rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63), `validacao-3d7d47a.md` (46/63),
`validacao-a03c122.md` (46/63), `validacao-b92a932.md` (46/63),
`validacao-af4eb8f.md` (45/63). Autor: o **validador** — não escreveu código de
produto nem teste do repo. Nada foi commitado. **A régua não mudou** (`git diff
af4eb8f ec918ab -- docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `af4eb8f`: `a822f5f` (só o laudo 13) e
`ec918ab`. Em `ec918ab`: (1) a classe `mobile` é posta por um **script clássico
no `<head>`**, cópia da regra de `js/mobile.js` (paridade em
`test/mobile-cedo`); (2) em `/vendor/` o cache imutável vale **só no sucesso**
(erro `no-store`, pasta sem redirecionamento) e as bibliotecas saem **em gzip**
pelo mesmo mecanismo dos modelos, agora `servirComprimido`; (3) o puxão do
canhão confere o **helicóptero pousado** (`Heli.corpoNaFuselagem`, as caixas do
empurrão) além dos carros. Arquivos de produto: `index.html`, `server.js` (só o
bloco de `/vendor/` e dos modelos — a lógica de jogo é byte a byte a de
`af4eb8f`), `game.js` (só o `caminhoLivre`), `js/heli.js`. Diff vazio em
`js/obstaculos.js`, `js/maptoys*.js`, `js/cannon.js`, `js/touchcontrols.js`,
`js/mobile.js`, `style.css`, `br-game.js`, `scripts/bots.js`, `js/paredes.js`,
`js/vulcao-solido.js`, `js/volcano.js`, `js/veiculos.js`, `js/car.js`.

---

## 0. Condições

- **Árvore:** `dev` em `ec918ab` (`git log -1` no início, 15h35, e no fim,
  17h22). `git status` antes e depois: limpo (no fim só ESTE arquivo, não
  rastreado). `npm run lint` limpo. sha256 do índice e dos 517 arquivos
  rastreados em `out/r14/arvore-ec918ab.sha256`, conferido no fim:
  **idêntico**. Mutantes em **cópias** (`copia-r14` para as minhas sondas,
  `copia-r14c` para os testes do construtor — as de r13 renomeadas e
  sincronizadas por `rsync` com a árvore; o `node_modules` de r13 serve, o
  `package.json` não mudou e o `three-cliente` é idêntico por sha256),
  restauradas por sha256 antes de cada mutante e conferidas no fim. O
  **"antes"** é o mutante `ANTES`: `game.js`, `index.html`, `js/heli.js` e
  `server.js` de `af4eb8f` (`git show`) na cópia — par consistente, sem
  remendo.
- **Carga** (12 núcleos; amostrada a cada 20 s, 15h35–17h22, 312 amostras):
  - **suíte** (15h36–16h37): mediana **3,35**, p90 4,39, máx. 7,40 (picos de
    ~4 min às 15h38 e de ~1 min às 15h50). Declarado: nos primeiros minutos
    da suíte corri o `rsync` das duas cópias (I/O, ~1,9 GB, coincide com o
    pico das 15h38) e, às 15h47, a sonda da produção (`curl`, rede); nenhum
    navegador nem servidor meu ao lado.
  - **sondas** (16h38–17h22): mediana 3,37, mas **7–14 durante as sondas de
    C4** — é o PRÓPRIO Chrome por software delas (o processo de GPU do
    swiftshader a ~1 000 % de CPU, medido com `top` numa execução de
    controle), não outro projeto. O que C4 conclui (texto, classe) não
    depende de tempo; os segundos daquelas sondas são indicativos e ditos
    assim. D6 (3,3–5,2), puxão (2,2–3,1), D2–D4 (2,6–3,0), BR do canhão
    (2,8–3,0), testes do construtor (2,6–4,1).
- **Processo alheio (declarado):** o amostrador de `ps` viu, das 16h42m53 às
  16h46m35, um `node --test` e um `server.js` que NÃO eram meus. A 1ª execução
  da sonda de C4 caiu nessa janela e foi **descartada e refeita** às
  16h50–16h54 com o `ps` limpo; os números de C4 abaixo são os da refeita.
  Nenhuma outra sonda minha coincidiu com processo alheio.
- **Ordem:** a **suíte rodou PRIMEIRO** (15h36–16h37); depois as sondas, uma por
  vez.
- **GPU:** Chrome headless (swiftshader nas sondas de tela; GL no D6, como em
  r13). Tempo de frame não medido.
- **Viewports:** V1–V5 e retrato 390×844 com `hasTouch`, `isMobile`, DPR 2;
  notebook/desktop 1366×768 sem `isMobile`. Semente 424242 (e 35, 72, 78, 80 no
  §A.3.4).
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`) — o JOGAR
  SOLO e o VOLTAR do lobby; o celular de verdade sem `?mobile=1` (UA Android
  pelo `Emulation.setUserAgentOverride`, com `platform`) além do `?mobile=1`;
  o disparo do canhão no solo pelo `Cannon.fire()` (o mesmo do prompt do USAR;
  o toque no USAR foi medido em r13 — declarado: a grade pede 40+ disparos).
- **Rede como em produção:** `proxy-br.js` de r13 (brotli q4 no que a origem
  manda cru; o que a origem já manda comprimido — agora `/vendor/` em gzip —
  passa como chega).
- **Dublês declarados:** de AMBIENTE — o `(pointer: coarse)` dos perfis de
  notebook/iPad/Android genérico trocado por `evaluateOnNewDocument` (o Chrome
  emulado dá `coarse` a todo toque); o `maxTouchPoints` por
  `Emulation.setTouchEmulationEnabled`. De COLOCAÇÃO — o grupo do helicóptero
  posto no chão/pairando entre o jogador e o centro (§A.3); o jogador posto
  atrás do obstáculo (§A.3.4). As requisições abortadas do vigia, pelo
  DevTools (`Fetch`).
- **Portas:** 3984, 3986 (+3987), 3989 (+4089), 3990, 3993, 3995, 3997 (+4097);
  os testes do construtor na cópia, nas portas deles. Nunca a 3000.
- **Correções das MINHAS sondas nesta rodada — medidas e declaradas:**
  1. **`r14-c4-boot`, 1ª versão:** tocava o JOGAR SOLO assim que ele destravava
     — e o lobby do BR abre sozinho ~1,5 s depois (sala no ar), por cima: o
     toque caía no `.brCard` (eventos registrados por `r14-dbg-toque.js`) e o
     jogo não começava. Refeita pelo caminho do jogador: espera, VOLTAR do
     lobby se aberto, JOGAR SOLO.
  2. **`r14-c4-boot`, "pulo de layout":** a 1ª conta misturava a troca de
     rótulo do botão ("CARREGANDO…" → "▶ JOGAR SOLO") e a abertura do lobby com
     pulo de classe. Refeita só na janela de carregamento e com as amostras
     cruas guardadas.
  3. **`r14-puxao`, âncora de altura:** a 1ª versão olhava o eixo do corpo a
     0,5 e 1,0 m — e o rabo do helicóptero fica a 1,15–1,85 m. Refeita com 0,5 /
     1,0 / 1,4 / 1,65 m (a 1ª está em `out/r14/puxao-arvore.json`).
  4. **Laudo 13 corrigido:** (a) a sonda de C4 de r13 olhava só o `#loadingMsg`;
     na tela de falha de `af4eb8f` em V5 e no retrato aparecem também as teclas
     do `#ctlBox` ("Clique", ESC, SHIFT, ESPAÇO, CTRL — §A.1.4); (b) a "rajada
     alheia" que r13 atribuiu à sonda de C4 era, muito provavelmente, o próprio
     Chrome por software (ver Carga).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `r14-mobile-fuzz.js`, `r14-c4-boot.js`, `r14-falha-c2.js`,
  `r14-dbg-toque.js`, `r14-gzip.js`, `r14-prod.js`, `r14-puxao.js`,
  `r14-puxao-obst.js`, `r14-seeds-node.js`, `analisa-c4*.py`, `boot4g13.js` +
  `boot4g14.sh`, `r13-corpo.js` (casos D e E, sem mudança), `r13-argolas.js`
  (caso e, sem mudança), `desemp.js`, `proxy-br.js`, `mut14.py`,
  `testemut14.py`, `cadeia-r14.sh`, `mut14-testes.sh`, `carga14.sh`,
  `recursos14.sh`. Saídas em `out/r14/`.

---

## 1. Placar

> **45 aprovados · 5 reprovados · 13 não medidos, em 63** (45/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `af4eb8f` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | **9** | 2 (C1, C11) | 1 (C3) | 8 · 3 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | **7** | 2 (E9, **E10**) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Mudaram de cor dois critérios, e o número não mudou:**
- **C4: ✗ → ✓.** Do 1º quadro até o jogo, no 4G como em produção, a 1,6 Mbps, no
  lobby que abre sozinho, nos primeiros segundos do solo e na tela de falha do
  vigia (V1–V5 e retrato): **0 tokens de teclado** em texto com área na tela;
  a classe `mobile` está posta **já no 1º quadro** e não muda até o fim (§A.1).
- **E10: ✓ → ✗ — nasceu desta correção ([NC] 1, baixa).** Com a classe posta
  antes do módulo, o aviso de orientação (`#rotateGate`, CSS) passa a cobrir a
  tela em retrato desde o 1º quadro; a saída "JOGAR ASSIM" só aparece quando o
  MÓDULO roda (`html.rgstuck`, `js/touchcontrols.js`). Na **tela de falha do
  vigia, em retrato**, o módulo nunca roda: o aviso cobre o "TOQUE PARA TENTAR
  DE NOVO" (o maior quadrado tocável do botão vai de **90 px a 0**) e o JOGAR
  ASSIM **nunca** aparece. Quem tem a rotação do sistema travada não alcança o
  único controle da tela; a saída é a que o texto do aviso dá (destravar a
  rotação) ou recarregar pelo navegador. E10 cobra "retrato com a rotação do
  sistema travada: aviso + JOGAR ASSIM" — pela letra, reprova. Em `af4eb8f`, nesse
  mesmo estado, não havia aviso nenhum (também fora da letra, mas o botão era
  alcançável). Raro (falha de boot + retrato + rotação travada).

O que a leva toca na régua — os bytes do boot (D6), o que se vê no
carregamento (C4, C2, E1, E10, E12), o mundo da semente (D4), as alocações e draw
calls (D2, D3) — foi remedido. O resto é **não remedido** (o código não mudou;
vale o número de `af4eb8f`, que remete a r10).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista sete.

**Regressões obrigatórias (§8):** M1 ✓ (não remedido; o three servido segue
byte a byte o do CDN — §A.2), M2 ✓ (não remedido), **C4 ✓ (remedido, §A.1)**,
D2 ◌ (a parte medida passa: 232), **D6 ✓ (remedido, §3)**, **E10 ✗ ([NC] 1)**,
E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 1** (E10).
**Defeitos NOVOS nascidos das correções desta leva: 1 de produto** ([NC] 1,
baixa) **+ 1 de TESTE** (o teste novo do helicóptero passa sem o conserto — §5).
Em `af4eb8f`: 2; em `b92a932`: 3; em `a03c122`: 4; em `3d7d47a`: 2; em
`f672d81`: 2; em `4433c4d`: 2; em `a9a4ffd`: 3; em `afb1ae8`: 4.
**Os 2 [NC] de r13 FECHARAM** (o puxão contra o helicóptero e o erro imutável de
`/vendor/`), e **C4 fechou** (achado antigo de r13).

`test/security-regression.test.js`: **38/38** (na suíte).

**Suíte completa** (`npm test`, 15h36–16h37, carga mediana 3,35, p90 4,39, máx.
7,40): **2 641 testes, 2 638 passaram, 0 falharam, 0 cancelados, 3 pulados**
(61,7 min). Nenhum arquivo foi à triagem; `ps` vazio de `run-tests` antes de ler
o placar; a linha final é a do próprio runner (TAP). Confere com o que o
orquestrador relatou (2 638 / 0 / 0).

---

## A. Os quatro itens do briefing, um por um

### 1. C4 no carregamento — FECHOU; o avesso (classe que pula) não existe; o retrato da tela de falha ficou sem saída

**1.1 A cópia do `<head>` decide igual ao jogo** (`r14-mobile-fuzz`, Node, sem a
tabela do construtor). O texto do script sai do `index.html`, roda num sandbox
com um ambiente SORTEADO; o jogo roda `mobileEnv(nav, win)` (o wrapper real)
sobre o MESMO objeto. 200 000 ambientes: 22 UAs reais (Android Chrome/Samsung/
Firefox, iPhone Safari/CriOS, iPad, Mac, Windows/Edge, Linux, ChromeOS, Quest 2 e
3, Silk, KaiOS, Instagram embutido, Windows Phone, Opera Mini, lixo), 13
`platform`, 14 `maxTouchPoints` (com lixo), 29 lados de tela (rentes a 600/900,
0, negativo, NaN, string), `matchMedia` ausente/que explode/que devolve `null`/
`'sim'`, 20 formas de `location.search` (`?MOBILE=1`, `?mobile=1&mobile=0`,
`#?mobile=1`, `?mobile=%31`…):

| | celulares pelo jogo | pela cópia | divergências | o script lançou |
|---|--:|--:|--:|--:|
| árvore | 134 512 | 134 512 | **0** | 0 |
| mutante `CEDOsemGrosso` (regra 4 sem o ponteiro grosso) | 134 512 | 141 931 | **7 419** | 0 |
| mutante `SEMcedo` (sem o script; N = 20 000) | 13 468 | 0 | 13 468 | — |

O script está no `<head>`, antes de qualquer outro `<script>` (lido).

**1.2 Do 1º quadro até o jogo** (`r14-c4-boot`: um navegador NOVO por caso; a
amostragem roda DENTRO da página desde o 1º `requestAnimationFrame` — 0,20 s
depois da navegação — a cada ≥ 100 ms; texto = nó com retângulo > 1×1 px dentro
da viewport, `visibility` visível, opacidade acumulada > 0,05, fonte > 0; e,
à parte, se está NO TOPO por `elementFromPoint`; tokens = a lista de C4 + `<b>`/
`<kbd>` de uma letra; rede do proxy de produção; caminho do jogador: o lobby do
BR abre sozinho → VOLTAR → JOGAR SOLO, por toque):

| caso | amostras | tokens com área | `html.mobile` na 1ª amostra / trocas | módulo · menu · jogo | antes (`af4eb8f`) |
|---|--:|--:|---|---|---|
| 4G, Android (UA, sem `?mobile`) | 32 | **0** | sim / **0** | 1,72 · 7,34 · 17,1 s | **ESC 0,93 → 4,63 s**; classe aos **4,99 s** |
| 4G, `?mobile=1` | 34 | **0** | sim / 0 | 1,80 · 7,43 · 17,2 s | (r13: 0,17 → 4,56 s) |
| 1,6 Mbps, Android | 134 | **0** (21 s de jogo inclusos) | sim / 0 | 8,86 · 14,8 · 23,3 s | (r13: 0,28 → 11,9 s) |
| Android genérico (sem token no UA; toque + grosso + 360 px) | 31 | **0** | sim / 0 | 1,76 · 7,41 · 18,2 s | — |
| iPad (`MacIntel` + 5 toques, 1180×820) | 28 | **0** (menu e lobby) | sim / 0 | 1,78 · 9,40 s · — | — |
| **falha** (three.core abortado), Android paisagem | 69 | **0** | sim / 0 | nunca | **ESC sempre** (64 de 68, desde 1,17 s) |
| **falha**, Android **retrato** 390×844 | 67 | **0** | sim / 0 | nunca | **ESC sempre** + as teclas do `#ctlBox` |

Carga 3,8 → 10,8 nesta sonda (o próprio Chrome por software); os segundos são
indicativos. Os tokens são lidos por amostra, não dependem do tempo.

**1.3 O AVESSO — layout pulando, classe cedo ≠ classe do jogo.** Nos 11 perfis
(os 7 acima, mais 4G em retrato, notebook com toque e ponteiro FINO 1366×768,
notebook com toque e ponteiro GROSSO, desktop sem toque):
- a classe `mobile` **nunca troca** entre o 1º quadro e o fim, em nenhum perfil;
- ela é **igual à decisão do jogo** (`mobileEnv()` importado na página no fim) em
  todos: os celulares/iPad com classe e jogo "celular"; o notebook de ponteiro
  fino e o desktop sem classe e jogo "desktop" (eles veem as dicas de teclado —
  é o certo); o notebook com ponteiro GROSSO e tela de 600 px (a tela do Chrome
  emulado) com classe e jogo "celular" — a regra 4, igual nos dois lados;
- **o pulo do layout no carregamento sumiu:** em `af4eb8f` a classe chegava aos
  4,99 s e o botão saltava de 652×45 para 622×54 px (30 px) e o painel 11 px (no
  retrato, o painel encolhia 90 px por baixo do aviso); agora o maior movimento
  de botão/painel/título no carregamento é 16–23 px aos 0,5–1,2 s — a entrada
  animada do menu, igual no desktop (na falha, a troca do rótulo para a
  mensagem longa mexe o painel em até 38 px, igual em `af4eb8f`).
- **Mutante `CEDOsemGrosso`:** o notebook de ponteiro fino ganha `mobile` no 1º
  quadro, o jogo diz "desktop", e a classe **fica até o fim** (ninguém a
  tira) — HUD de celular sem controles de toque. A sonda pega; e é o que a
  paridade impede.

**1.4 A tela de falha agora** (`r14-falha-c2`: falha pelo DevTools, Android sem e
com `?mobile=1`, V1–V5 e retrato; C2 pelo método da régua — o maior quadrado em
que `elementFromPoint` devolve o botão, grade de 2 px):

| viewport | botão · maior quadrado | texto inteiro | tokens | por cima do botão | antes (`af4eb8f`) |
|---|---|---|--:|---|---|
| V1 667×375 | 627×63 · **64 px** | sim | 0 | o botão | 627×63 · 64 · `ESC` |
| V2 / V3 / V4 | 720×63 · **64 px** | sim | 0 | o botão | 720×63 · 64 · `ESC` |
| V5 1180×820 | 660×73 · **74 px** | sim | 0 | o botão | 660×73 · 74 · `ESC` + **"Clique", ESC, SHIFT, ESPAÇO, CTRL** do `#ctlBox` |
| **retrato 390×844** | 366×89 · **0 px** | sim | 0 | **o `#rotateGate`**; JOGAR ASSIM **ausente** | 366×89 · 90 · `ESC` + as teclas do `#ctlBox` |

O retrato ([NC] 1): o aviso cobre o botão desde 0,21 s e o JOGAR ASSIM não
aparece em 8 s (nem aparecerá: `html.rgstuck` só é escrito em
`js/touchcontrols.js`, dentro do módulo que falhou — lido). No boot NORMAL em
retrato o aviso entra aos 0,20 s e o JOGAR ASSIM aos **6,44 s** (quando o
`createOrientationGate` do módulo roda; antes: aviso 4,89 s, JOGAR ASSIM 6,75 s)
— durante o carregamento o menu está travado de qualquer jeito, então só a tela
de falha fica sem saída.

### 2. `/vendor/` — FECHOU o erro imutável e o gzip; a produção segue servindo o que a borda já tinha

**2.1 `servirComprimido` "do meu jeito"** (`r14-gzip`, servidor novo, âncora nos
bytes do disco, cabeçalhos crus):

| | árvore | `ANTES` (`af4eb8f`) |
|---|---|---|
| modelos: 27 `.glb` — gzip decodifica = disco · cru sem `Accept-Encoding` = disco · HEAD · `If-None-Match` → 304 · `Range` → 206 cru | **27 · 27 · 27 · 27 · 27**; `Vary` 27; ETag `W/"gz-…"` 27; `max-age=86400`; fonte v1 do castelo **404** (com e sem gzip) | igual (o mecanismo é o mesmo, só refatorado) |
| `/vendor/` inteiro: 437 arquivos (427 `.js`) — `.js` em gzip = disco · não-`.js` cru = disco · imutável no 200 | **427 · 10 · 437**; `Vary` 437; `application/javascript` 427 | **0 `.js` em gzip** (tudo cru) |
| os 26 do boot — HEAD · 304 (imutável) · `Range` 206 cru (imutável) · sem gzip cru (imutável) · 304 do cru | **26 · 26 · 26 · 26 · 26** | — |
| erros: 29 grafias × (com/sem gzip) + POST = 59 | 200 só em `build//three.core.js` e `?x=1` (legítimos); **55 × 404, 0 × 3xx, todo erro `no-store`** | **4 × 301**; **53 erros com um ano de cache** |
| bytes dos 26 do boot no fio | **595 847 B** (disco 2 770 038) | 2 770 038 (cru) |
| custo: 1º pedido dos 26 em série / paralelo (quente) | 113,5 / 70 ms (15 / 22 ms) | — |

As grafias de traversal de r13 seguem todas 404 (detalhe fora do repo). Pedir
TODO `.js` das rotas faz a origem comprimir e guardar cada um uma vez — custo
limitado e de uma vez (fora do repo; observação).

**2.2 O `modelos-gzip` do construtor e os meus mutantes:** `VENDORsemGzip`,
`VENDORimutavelSempre`, `VENDORredirect` e `ANTES` avermelham a minha sonda e o
`boot-sem-cdn` (§5); o `modelos-gzip` fica verde em todos (é dos modelos — o
mecanismo dele segue igual, 27/27 acima).

**2.3 Produção, só por cabeçalhos/GET de arquivo público** (`r14-prod`):
- o `index.html`, o `game.js` e o `js/heli.js` servidos são os da árvore (sha256) —
  `ec918ab` está no ar;
- os 26 do boot: **`HIT`, brotli, 589 757 B** (r13: 590 324), decodificado = disco
  em 26 de 26 — e com **idade de 3,9 a 5,2 h**: são as cópias que a borda guardou
  ANTES de `ec918ab` existir. O gzip da origem nova ainda não chega a quem joga
  (e, quando chegar, só gzip dá 595 675 B, +1 %);
- um 404 novo de `/vendor/`: **`no-store`, e a borda NÃO o guarda** (2 pedidos, 3 s
  entre eles); pasta sem barra: 404 `no-store`, sem 301;
- **os dois 404 de QA que eu deixei na borda em r13 seguem lá** (`HIT`, um ano de
  cache imutável, idade ~3,8 h) — a regra nova não os desfaz; são caminhos sem
  sentido, inofensivos; saem com purga da borda (detalhe fora do repo).

### 3. O puxão × helicóptero — FECHOU; procurado outro objeto: PEDRA, ÁRVORE e CACTO são atravessados (achado antigo)

**3.1 A grade do helicóptero** (`r14-puxao`, solo, `?mobile=1`, V2; o grupo do
helicóptero posto com o centro a 1,5 / 2,3 / 3,2 m do centro do canhão na reta do
jogador, 0 / 1 / 2 / 3 m para o lado, girado 0 / 45 / 90° — 36 colocações — mais
pairando a 1,0 e 2,3 m e em chamas; jogador a 4,5 m. Âncora: a malha DESENHADA do
helicóptero, o eixo do corpo a 0,5 / 1,0 / 1,4 / 1,65 m; "tampado" = o corpo
(raio 0,42) tocaria o desenho em algum ponto da reta, medido na malha, sem
consultar o produto):

| | árvore | `ANTES` (`af4eb8f`) |
|---|---|---|
| colocações em que o desenho tampa a reta | 19 | 19 |
| … e o puxão atravessou | **0** (lança da beira) | **19** (lança do centro) |
| colocações com o eixo do corpo DENTRO da malha · quadros | **0 · 0** | **15 · 62** |
| maior salto num quadro | 0,72 m (abaixo) | **1,96 m** |
| reta livre pelo desenho (17): puxou até o centro · não puxou · parou no meio | 9 · 3 · 5 | 17 · 0 · 0 |
| pairando a 1,0 m (tampa) · a 2,3 m (não tampa) | para aos 3,52 m · puxa | atravessa (5 quadros, 1,75 m) · puxa |
| em chamas (2 giros) | não puxa | atravessa (7 e 3 quadros) |
| o caso E de r13 (`r13-corpo.js`, sem mudança) | **0 de 29** quadros na malha, salto 0, lança a 4,51 m | r13: 7 de 30, 1,75 m |

- **"Não puxou" com a reta livre pelo desenho (3):** o rabo do helicóptero a
  1,65–1,85 m (o topo da cabeça do corpo do produto, 1,7 m, acima da minha
  âncora mais alta) — bloqueio conservador, não avesso.
- **"Parou no meio" (5 — observação, não defeito):** o `caminhoLivre` confere a
  reta inteira na altura do pé ATUAL. Nesta encosta o pé de partida está 0,5–1,1 m
  abaixo do helicóptero: o rabo parece acima da cabeça, o puxão começa, o pé sobe
  com o chão e o rabo entra na faixa — o puxão para na borda da caixa inflada,
  e em 3 casos o empurrão da fuselagem devolve o corpo 0,62–0,72 m num quadro
  (1–2 quadros com a malha a < 0,42 m do eixo, nunca dentro). Lança de onde parou,
  como o carro que entra no caminho em r13.
- **Carros (BR, `r13-argolas.js` caso e, servidor de verdade):** iguais a r13 —
  e1 sem puxão (rumos −9,26 / −23,78 / −5,69°), e3 5 de 5, e2 para (0 quadros na
  caixa desenhada), e4 sem puxão; **0 strikes**. Carro em chamas (solo, caso D de
  r13): 0 de 30 no círculo, lança a 4,5 m.

**3.2 Outro objeto que o puxão atravesse?** Quem tem corpo para o jogador
(`playerUpdate`: obstáculos com corpo, `Structures.collide`, carros; a fuselagem
no `js/heli.js`; os únicos que escrevem `player.pos` — grep): **outro jogador e
bicho não têm colisão de corpo com o jogador** (andando também se atravessa —
nada a cobrar do puxão). Totem e painel: o planejador põe as outras atrações a
≥ 40 m do canhão (medido: ≥ 117 m em 201 sementes). Varredura por semente
(`r14-seeds-node`, 424242 e 1–200, a montagem do bot): obstáculo/parede de corpo
cujo círculo/caixa inflado pelo corpo entra no disco de 4,6 m do USAR:

| o mais perto, em 201 sementes | borda (m) |
|---|--:|
| **pedra** (semente 78) · **árvore** (80) · **cacto** (35) | **1,23 · 1,78 · 1,89** |
| tenda · barril · mercado/refúgio · parede de construção (nos dois estados da cidade) · atrações | 16,9 · 118 · 121/138 · 113 · ≥ 117 |
| sementes com algo no disco | **10 de 201** (a 424242: nenhuma) |

**3.3 E atravessa** (`r14-puxao-obst`: solo na semente, o jogador ATRÁS do
obstáculo na reta para o centro, ≤ 4,5 m; controle: a mesma distância girada 90°):

| semente · obstáculo | eixo do corpo, menor distância ao centro do obstáculo | maior salto | terminou do outro lado | controle 90° |
|---|--:|--:|---|---|
| 78 · pedra (r 1,01) | **0,06 m** (1 quadro dentro da malha desenhada) | 0,67 m | sim, lança do centro | 2,66 m, não toca |
| 80 · árvore | **0,12 m** | **1,80 m** | sim | 2,90 m |
| 35 · cacto | **0,08 m** | 1,31 m | sim | 2,67 m |
| 72 · árvore | **0,03 m** (2 quadros dentro da malha) | 1,45 m | sim | 3,88 m |

O `caminhoLivre` nunca consultou obstáculo (desde que o puxão entrou, `a03c122`); o
empurrão de círculo segura o corpo na borda e, no fim da carga, o passo do puxão
o leva para o outro lado. **Achado antigo, não desta leva; baixa** (uma semente em
20 tem o obstáculo no disco, e é preciso estar atrás dele). r12 tinha olhado 25
sementes e achado só um cacto a 5,55 m (fora do alcance) — a amostra era pequena.

### 4. Os resíduos de r13 que o construtor não mexeu — declarados, não remedidos

`js/obstaculos.js`, `js/maptoys.js` e as linhas de corpo × obstáculo do `game.js`:
diff vazio. Valem os números de r13:
- **o telhado do mercado/refúgio é parede invisível** — empurrão 1,6–2,6 m ACIMA do
  telhado desenhado (a caixa do GLB + a margem do pulo de 1,7 m), salto de até
  3,75 m num quadro; não há pouso no telhado. Baixa.
- **o barril de 1,05 m não se pula** (o pulo chega a 1,6 m; a margem é de propósito).
  Observação.
- **o recorde do curso × a taxa de quadros** — o tempo é o do QUADRO em que a argola
  muda; resolução de um quadro (17 ms a 60 q/s, 28 ms a 35 q/s) contra os 10 ms que
  a tela compara. Muito baixa.
- **Segurança** — o carro solto (resíduos de r10) e o carro DIRIGIDO sem conferência
  de chão: a lógica de jogo do servidor não mudou; seguem, sem teste. Detalhe **fora
  do repo**.
- Inalterados (código intocado): o aro dourado, o cano, o poste, a faixa de 0,45 m.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Não remedido.** O bot (`scripts/bots.js`), o servidor de jogo e a geometria de
bala (`js/paredes.js`, `js/obstaculos.js`, `js/maptoys-core.js`) não mudaram.
Valem os números de r10: pares geométricos **1 de 10 312** tampados vistos (o par
de caminhão de sempre), **cego 0 de 8 629**; atrações 0 e 0; a arena de r7 (0 / 0 /
0 / 0 em 52 válidos); "a tela não mostra e a vítima aceita" **38** (16 atrás de
poste). **Veredito: ◌ — igual a r10**, pelas duas razões de `d381d29`.

---

## 3. Veredito por critério (com a comparação com `af4eb8f`)

"Não remedido" = o código que o critério mede não mudou nesta leva; vale o número
de `af4eb8f` (que remete a r10).

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | Não remedido: 0,00 px / 0,00 cm a 10, 25 e 50 m em V2/V3 (r10). O three servido em gzip decodifica nos bytes do disco, que são os do CDN (§A.2.1; r13 §A.1.2). |
| **M2** | ✓ | ✓ | Não remedido: fuzil 720 m/s → 7,9 cm a 100 m; DMR 5,3; sniper 5,2 (r10). |
| **M3**–**M7** | ✓ | ✓ | Não remedidos (r10). |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1**–**A4** | ✓ | ✓ | Não remedidos (r10). |
| **A5** | ◌ | ◌ | Não remedido: (a)–(c) ✓, (d) em conflito com A2 (r10). |
| **A6**, **A7** | ✓ | ✓ | Não remedidos; `security-regression` **38/38**. |
| **A8** | ✓ | ✓ | Não remedido (r10). |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | Não remedido: (e) três dedos em 0,5 s, 1,82 m < 2 m. |
| **C2** | ✓ | ✓ | Remedido na tela de falha, agora com `html.mobile`: o botão 627–720 × 63 px (V1–V4) e 660×73 (V5), maior quadrado **64 / 74 px**, texto inteiro. Em retrato o aviso de orientação o cobre — é o estado de E1(e); o problema é a falta de saída, contado em E10. O resto não remedido (r10). |
| **C3** | ◌ | ◌ | Não remedido: morte, espectador e carro não medidos. |
| **C4** | **✓** | ✗ | **Remedido (§A.1):** 0 tokens com área do 1º quadro ao jogo no 4G, a 1,6 Mbps, no lobby do BR, nos primeiros segundos do solo (21 s a 1,6 Mbps) e na tela de falha em V1–V5 e retrato; Android pelo UA, `?mobile=1`, Android genérico e iPad. Mutantes `SEMcedo` e `ANTES`: a linha de teclas volta (0,93–1,03 → 4,4–4,6 s no 4G; sempre na falha). O resto (estados de jogo) não remedido (r10). |
| **C5**–**C9** | ✓ | ✓ | Não remedidos (r10). |
| **C10** | ✓ | ✓ | Não remedido (r12: polegar no talo ao pouso, soltar → 0,004 m/s). O puxão que para pelo helicóptero zera a velocidade como o do carro (leitura de `update()`). |
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
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos. B12: `three`, `three-cliente` e `cannon-es` seguem em `dependencies`; `package.json` sem mudança. |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2**–**P4** | ✓ | ✓ | Não remedidos (r10). P4 mede parede de CONSTRUÇÃO (intocada); o puxão através de pedra/árvore/cacto (§A.3.3) não é prédio. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | Não remedido (r10). O puxão × helicóptero é corpo do jogador, não bala (a bala segue `Veiculos.segmento`, intocado). |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **232 draw calls p50** (mín. 222, máx. 256, mundo de 22,5 s; r13: 233) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 632: **0 `Object3D`** (ATIRAR arrastando: 12, os mesmos de r10–r13). |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais**; o retrato do desktop contra r13: **0 diferenças** (o script cedo não toca o sorteio; `corpoNaFuselagem` não cria objeto). |
| **D5** | ✓ | ✓ | Não remedido. |
| **D6** | ✓ | ✓ | **Remedido, N = 5, carga 3,7–5,2** (`boot4g13.js`: 9 Mbps / 40 ms, V3, cache desligado, servidor novo a cada vez). **Servidor local, agora com `/vendor/` em gzip:** menu **3,13–3,53 MB**, arma pronta **3,27–3,70 MB**, total **11,17 MB** (220 req.; `/vendor/` 0,606 MB) — limiar 5,25 / 15,03. Em r13 o número local lia vermelho (arma 5,44–5,87, o three cru); o mutante `VENDORsemGzip` (N = 2) devolve **5,88 / 5,88 / 13,34 MB**. Como em produção (proxy, N = 3): menu 1,71–2,12, arma 1,85–2,29, total 9,75 MB (r13: 1,71–2,11 / 1,85–2,28 / 9,75). **Produção:** os 26 do boot seguem os 589 757 B em brotli que a borda já tinha (§A.2.3). A leva soma **+2 610 B** crus aos arquivos do jogo (`index.html` +1 502, o script cedo; `js/heli.js` +764; `game.js` +344). |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1** | ✓ | ✓ | Remedido no caminho do boot: por toque, o lobby do BR que abre sozinho → VOLTAR → JOGAR SOLO → jogo, em 4 perfis de celular (§A.1.2). O resto não remedido (r10). |
| **E2**, **E3** | ✓ | ✓ | Não remedidos. |
| **E4**, **E5** | ◌ | ◌ | Não remedidos. |
| **E6**–**E8** | ✓ | ✓ | Não remedidos. |
| **E9** | ✗ | ✗ | Não remedido (sem "sair da partida" no BR; decisão do dono). |
| **E10** | **✗** | ✓ | **[NC] 1 (§A.1.4):** na tela de falha do vigia em retrato, o aviso cobre o "TENTAR DE NOVO" (maior quadrado 0 px) e o JOGAR ASSIM nunca aparece (depende do módulo). Boot normal em retrato: aviso desde 0,20 s, JOGAR ASSIM aos 6,44 s (antes 4,89 / 6,75 s). O resto (virar no meio da partida, dirigindo; C2/C3 em 390×844 liberado) não remedido. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; **0 `pageerror` e 0 `console.error`** em todas as páginas das sondas desta rodada (a não ser o `net::ERR_FAILED` da requisição abortada DE PROPÓSITO nos casos de falha). |
| **E15** | ✓ | ✓ | Não remedido (r10). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `ec918ab`, baixa] Tela de falha do vigia em retrato sem saída.** A
   classe `mobile` cedo liga o `#rotateGate` (CSS) antes do módulo; a saída dele
   (`html.rgstuck` → JOGAR ASSIM) é escrita só pelo módulo. Reprodução: celular em
   retrato (390×844), `three.core.js` falhando (DevTools → `Fetch.failRequest`);
   aos 0,8 s o botão diz "⚠ O JOGO NÃO CARREGOU — TOQUE PARA TENTAR DE NOVO" —
   e o `elementFromPoint` no centro dele devolve o `#rotateGate`; o `#rgPlay` fica
   `display: none`. Com a rotação do sistema travada, o jogador só sai destravando
   a rotação (o texto do aviso diz como) ou recarregando pelo navegador. Antes:
   sem aviso nesse estado, o botão alcançável (com a linha de teclas). Reprova
   E10 pela letra. Raro.
2. **[TESTE — `ec918ab`] o teste novo do helicóptero (`test/maptoys.test.js`,
   "o puxão do canhão não atravessa o HELICÓPTERO") passa sem o conserto.** (a) O
   caso anterior ("carro EM CHAMAS") deixa o carro parado **no mesmo ponto** em que
   o caso do helicóptero o põe (0,00 m), e é o CARRO que segura o puxão — com o
   laço do helicóptero arrancado do `caminhoLivre` (`SEMheli`) o arquivo fica 20/20
   verde; tirando o carro do lugar (variante do teste, na cópia), **28 de 31**
   quadros dentro, vermelho. Formato 6 ("outro guarda segurando o caso"). (b) A
   medida é a própria `Heli.corpoNaFuselagem`: com ela cega (`HELIcego`) e o carro
   tirado, o corpo é puxado até o centro e o teste lê "dentro 0" — formato 2
   ("comparar a reta com ela mesma"). Produto certo, teste que não mede.
3. **Achado antigo, agora medido — o puxão atravessa PEDRA, ÁRVORE e CACTO**
   (§A.3.2–3.3): em 10 de 201 sementes há um no disco do USAR; de trás dele o
   corpo passa a 3–12 cm do centro do obstáculo, 0,67–1,8 m num quadro. Desde o
   puxão (`a03c122`). Baixa.
4. **Observação — o puxão para tarde em encosta** (§A.3.1): o `caminhoLivre` usa a
   altura do pé atual para a reta inteira; com o pé subindo, para na borda da
   caixa e o empurrão devolve 0,62–0,72 m num quadro. Nenhum quadro dentro da
   malha.
5. **Resíduos de r13, não mexidos** (§A.4): telhado do mercado/refúgio como parede
   invisível (baixa); barril que não se pula (observação); recorde × taxa de
   quadros (muito baixa).
6. **Segurança** — o carro solto (resíduos de r10) e o carro DIRIGIDO sem
   conferência de chão: não remedidos. **Os dois 404 de QA de r13 seguem
   guardados na borda** até purga. O custo de memória/CPU de comprimir `/vendor/`
   sob pedido: observação. Detalhes **fora do repo**.
7. Inalterados (código intocado): **o canhão mostra o que a bala atravessa** (cano
   141, aro dourado 10, faixa da borda ≤ 11,2 cm — r10), **faixa de 0,45 m acima
   de peça de corpo**, **agachado atrás de poste** (16), **P1**, **C11**,
   **C1(e)**, **E9**.

**Observações sem veredito:** (a) a beira da saia do vulcão segue muralha; (c) o
carro segue no relevo dentro da rocha do vulcão enquanto alguém dirige; B6 pela
letra — **não remedidas** (diff vazio); (e) o gzip quase não reduz a bazuca
(−4 %), D6 dos modelos esperando o dono; (f) P4(b): o canhão sobre a encosta
aparece como base suspensa; (g) **o texto novo do `CLAUDE.md`** confere com o
medido (erro sem cache, gzip das bibliotecas, a classe no `<head>`, "texto com
área") — e não diz que a SAÍDA do aviso de orientação (JOGAR ASSIM) continua
dependendo do módulo; (h) o vigia em link de 2G (r13 §A.1.4): não remedido;
(i) **a resposta nova de `/vendor/` ainda não chegou à produção** — a borda serve
as cópias guardadas antes do deploy (§A.2.3); (j) o notebook com toque e ponteiro
GROSSO (modo tablet) com tela < 900 px é tratado como celular — é a regra 4 de
`js/mobile.js`, igual nos dois lados, não desta leva.

**Contagem:** 5 critérios reprovados (C1, C11, P1, E9 e **E10**); **1 nasceu de
correção desta rodada** (E10); **1 defeito novo de produto e 1 de teste** nasceram
das correções; **as três correções da leva fecharam o caso que r13 mediu** (C4 no
carregamento e na falha; o erro imutável de `/vendor/` e o three cru no local; o
puxão contra o helicóptero).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| sem o script cedo (`SEMcedo`) | 4G: ESC visível 1,03 → 4,37 s, classe aos 4,73 s (pulo de 30 px); falha: ESC sempre (64 de 68); fuzz: 13 468 divergências em 20 000 | `boot-sem-cdn` **1 vermelho** ((d)); `mobile-cedo` **vermelho** (2 cancelados) |
| a cópia diverge: regra 4 sem o ponteiro grosso (`CEDOsemGrosso`) | fuzz **7 419** divergências; notebook de ponteiro fino com `mobile` do 1º quadro ao fim, jogo "desktop" | `mobile-cedo` **1 vermelho**; `boot-sem-cdn` 0 |
| `/vendor/` sem gzip (`VENDORsemGzip`) | 427 `.js` crus; D6 local arma **5,88 MB** (> 5,25) | `boot-sem-cdn` **1 vermelho** ((c2)); `modelos-gzip` 0 |
| erro de `/vendor/` imutável de novo (`VENDORimutavelSempre`) | **53** erros com um ano de cache | `boot-sem-cdn` **1 vermelho** ((c)) |
| pasta volta a redirecionar (`VENDORredirect`) | **4 × 301** | `boot-sem-cdn` **1 vermelho** ((c)) |
| sem o laço do helicóptero no `caminhoLivre` (`SEMheli`) | **19 de 19** tampados atravessados; 14 colocações com o corpo na malha (62 quadros), 1,96 m num quadro | `maptoys` **0 vermelhos** — o carro do caso anterior segura; tirado o carro (variante do teste na cópia): **1 vermelho** (28 de 31) |
| `corpoNaFuselagem` cega (`HELIcego`) | 19 de 19 atravessados; 14 colocações, 57 quadros | `maptoys` **0 vermelhos**, e 0 também com o carro tirado (mede com a própria função) |
| o caminho amostrado a cada 1,5 m (`PASSOlargo`) | **sobrevive**: 0 atravessados (a grade não tem peça mais fina que o passo; muda só onde para — 7 paradas no meio contra 5) | `maptoys` 0 |
| `af4eb8f` inteiro (`ANTES`) | C4: ESC 0,93 → 4,63 s, falha sempre, + teclas do `#ctlBox` em V5/retrato; `/vendor/` cru, 301, erro imutável; puxão: 19 de 19 através | `maptoys` **2 vermelhos** (um é `TypeError` — a função não existe —, o outro em cascata); `boot-sem-cdn` **3**; `mobile-cedo` **vermelho**; `modelos-gzip` 0 |

Controle (cópia = árvore): `maptoys` 20/20, `boot-sem-cdn` 6/6, `mobile-cedo` 2/2,
`modelos-gzip` 5/5.

**Todo mutante, menos `PASSOlargo`, avermelha alguma sonda minha; dois
mutantes que devolvem o defeito do helicóptero (`SEMheli`, `HELIcego`) passam
VERDES nos testes do construtor** — o teste do helicóptero passa por acidente
(§4.2). O que mais os testes não medem e esta rodada achou: a tela de falha em
retrato sem saída (E10); o puxão através de pedra/árvore/cacto; a classe cedo
sem par no fim (o `mobile-cedo` cobre a paridade, não a página).

**As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): os resíduos de r10 — a lógica de
   jogo do servidor não mudou, eles seguem, sem teste.
2. **E10 — a tela de falha em retrato** ([NC] 1): a saída do aviso de orientação
   depende do módulo que falhou; reprova regressão obrigatória.
3. **O teste do helicóptero** (§4.2): hoje o carro do caso anterior segura o
   caso, e a medida é a própria função do produto — o conserto do helicóptero
   está sem teste que o defenda.
4. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
5. **O puxão através de pedra/árvore/cacto** (§A.3.3, achado antigo) — 1 semente
   em 20.
6. **O telhado do mercado/refúgio** (§A.4): pouso ou o topo do empurrão no telhado
   desenhado. **Os dois 404 de QA na borda**: purga (fora do repo).
7. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
8. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
