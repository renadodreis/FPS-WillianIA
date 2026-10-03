# Validação do porte para CELULAR — commit `af4eb8f`

Décima terceira rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63), `validacao-3d7d47a.md` (46/63),
`validacao-a03c122.md` (46/63), `validacao-b92a932.md` (46/63). Autor: o
**validador** — não escreveu código de produto nem teste do repo. Nada foi
commitado. **A régua não mudou** (`git diff b92a932 af4eb8f --
docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `b92a932`: `ef2e9b0` (só o laudo 12),
`98e79b9` e `af4eb8f` (só testes). `98e79b9`: as bibliotecas do cliente (three
0.184.0 e os addons pelo alias `three-cliente`, cannon-es 0.20.0) saem do
próprio servidor em `/vendor/<pacote>@<versão>/` com cache imutável, e o
`index.html` ganhou um **vigia** (erro de importação ou 60 s sem o módulo rodar
→ o botão diz "NÃO CARREGOU" e recarrega no toque); mercado e refúgio batem no
corpo até o topo do modelo (`corpoAte`) e todo obstáculo só deixa de bater
**1,7 m acima do topo**; a argola mirada é a de menor distância à mira; o puxão
do canhão confere o **círculo de corpo dos carros** a cada quadro da carga.
**O `server.js` mudou** — 22 linhas, só o bloco de `/vendor/` e o cabeçalho de
cache (a lógica de jogo, o anti-cheat e o carro solto são byte a byte os de
`b92a932`); o bot, a geometria de bala e o `br-game.js` não mudaram.

---

## 0. Condições

- **Árvore:** `dev` em `af4eb8f` (`git log -1` no início, 11h49, e no fim,
  14h15). `git status` antes e depois: limpo, e no fim só ESTE arquivo (não
  rastreado). `npm run lint` limpo. sha256 do índice e dos 514 arquivos
  rastreados em `out/r13/arvore-af4eb8f.sha256`, conferido no fim: **idêntico**.
  Mutantes em **cópias** (`copia-r13` para as minhas sondas, `copia-r13c` para
  os testes do construtor — as de r12 renomeadas e sincronizadas por `rsync`
  com a árvore, **inclusive o `node_modules` novo** com `three-cliente` e
  `cannon-es`; disco a 100 %, 4,7 GB livres); restauradas por sha256 antes de
  cada mutante e conferidas no fim. O **"antes"** é o mutante `ANTES`:
  `game.js`, `js/cannon.js` e `js/obstaculos.js` de `b92a932` (`git show`) na
  cópia, **mais a linha `window.__gameModulo = true`** (declarado: sem ela o
  vigia do `index.html` novo dispararia aos 60 s; o `index.html` e o
  `server.js` da cópia são os da árvore, das bibliotecas locais).
- **Carga:** amostrada a cada 20 s das 11h49 às 14h15 (UTC−3; 437 amostras) em
  12 núcleos. Suíte: **mediana 3,50, p90 4,45, máx. 5,27** (três picos de ~1 min
  a 5,1–5,3, às 12h19, 12h28 e 12h37 — rajadas de outro projeto). Sondas de
  boot 2,70–4,23; vigia 2,11–3,08; sondas, mutantes e testes 2,18–3,81. A sonda
  de C4 do boot (§A.1.6) pegou uma rajada no fim (2,8 → 7,7): os tempos dela
  são indicativos e ditos assim; o que ela conclui não depende de tempo.
- **Ordem:** a **suíte rodou PRIMEIRO** (11h49–12h50), com a árvore limpa e nada
  meu ao lado além de dois amostradores leves (carga; `ps`/memória/disco). Depois,
  as sondas, uma por vez.
- **GPU:** Chrome headless, o backend do harness. Tempo de frame não medido.
- **Viewports:** V2 800×360, `hasTouch`, `isMobile`, DPR 2, `?mobile=1`; V1 e V3
  no aviso do vigia; XR: IWER (`metaQuest3`). Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF) —
  mira por arrasto no `#tcLook` (100 px = 18,335°, ida e volta 0,000°), disparo e
  helicóptero pelo USAR, analógico pelo `#tcMove`, pulo pelo ⇧, o aviso do vigia
  tocado no `#btnNew`.
- **O servidor medido é o de verdade:** `srv11.js` (o `server.js` da árvore,
  sha256 `0915f2c8…`, carregado em processo com uma linha que expõe
  `players`/`server`). Solo, boot e D6: `node server.js` puro.
- **Instrumento novo, declarado — `proxy-br.js`:** um proxy reverso que comprime
  em brotli (qualidade 4) o JS/CSS/HTML que a origem manda cru, como a borda da
  produção faz, e repassa o resto (os `.glb` em gzip da origem). **Calibrado
  contra a produção:** nas 122 requisições até o módulo do jogo rodar, **1 464 720 B
  pelo proxy × 1 475 289 B na produção** (−0,7 %); só `/vendor/`: 589 463 × 590 324.
  Serve para dizer o que o jogador em produção baixa; o veredito de D6 NÃO depende
  dele (§3, D6).
- **Dublês declarados**, todos de COLOCAÇÃO ou TRAJETÓRIA: o chassi do carro posto
  no lugar e levado por uma reta durante a carga; o grupo do helicóptero posto no
  chão entre o jogador e o canhão (§A.3); o helicóptero levado sobre o
  mercado/refúgio. As requisições bloqueadas/corrompidas/penduradas do vigia são
  feitas pelo DevTools (`Fetch`), não no servidor.
- **Portas:** 3984, 3986, 3989 (+4089 do proxy), 3990 (+3991), 3993, 3994, 3995,
  3997 (+4097), 4086; os testes do construtor na cópia, nas portas deles. Nunca a
  3000. Antes de cada bloco, `ps` sem `run-tests`/`node --test`/`server.js` alheio.
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **`r13-vigia`, 1ª versão:** esperava o `goto` até o `DOMContentLoaded` — que,
     com `<script type=module>`, só sai DEPOIS que o grafo do módulo chega e roda.
     A sonda ficava cega exatamente no intervalo do vigia (no boot de 0,4 Mbps viu
     o aviso "aos 105 s", junto com o módulo; na requisição pendurada não viu
     nada). Refeita sem esperar o `goto`; a 1ª versão está em `out/r13/vigia-v1/`.
  2. **`r13-corpo` (E), 1ª execução:** rodou na mesma página de (D), e o buggy em
     chamas de (D) seguia no mesmo lugar — o "sem puxão" era o buggy, não o
     helicóptero. Refeita só com (E) (árvore, `ANTES` e o mutante).
  3. **`proxy-br.js`:** a 1ª calibração correu antes de a origem subir
     (`style.css` com 502) e a 1ª versão tirava o `Accept-Encoding` (os `.glb`
     viriam crus). Refeitas: a calibração acima é a da 2ª.
  4. **`r13-c4-boot`, 1ª execução:** os três casos no mesmo navegador (o 2º usava o
     cache do 1º). Refeita com um navegador novo por caso.
  5. **`r13-aviso-tela`:** a 1ª foto saiu preta (tirada no fade do menu). Refeita
     com fotos a 0,5 / 3 / 8 s.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `r13-bootdiag.js`, `r13-vigia.js`, `r13-vendor-bytes.js`, `r13-aviso-tela.js`,
  `r13-aviso-tela2.js`, `r13-c4-boot.js`, `r13-argolas.js`, `r13-corpo.js`,
  `r12-recarga.js` (sem mudança), `desemp.js`, `boot4g13.js`, `proxy-br.js`,
  `srv11.js`, `mut13.py`, `cadeia-r13.sh`, `vigia-proxy13.sh`, `d6-13.sh`,
  `mut13-testes.sh`, `carga13.sh`, `recursos13.sh`. Saídas em `out/r13/`.

---

## 1. Placar

> **45 aprovados · 5 reprovados · 13 não medidos, em 63** (45/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `b92a932` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 8 | **3** (C1, **C4**, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Mudou de cor: C4 (✓ → ✗) — por um achado ANTIGO, não por esta leva.** O item 1
do briefing me levou ao estado que nenhuma rodada tinha visitado: o carregamento.
No celular, enquanto o módulo do jogo não roda, o menu mostra a linha
`ESC pausa o jogo · ↑ ↓ e ENTER navegam o menu` — a classe `html.mobile` que a
esconde (`style.css`, `font-size: 0`) só é posta pelo `js/touchcontrols.js`,
de dentro do módulo. Medido (§A.1.6): visível por **~4,4 s** em todo boot no
4G como em produção, **~11,6 s** a 1,6 Mbps, e **para sempre** na tela de falha
do vigia (embaixo de "TOQUE PARA TENTAR DE NOVO"). `ESC` e `ENTER` estão na lista
de C4, e C4 vale "em todo estado" ao longo de E1–E11, que começa "a partir do
carregamento". O texto e o mecanismo são os mesmos em `b92a932` (`index.html`
nessa linha e `js/touchcontrols.js` intocados) — C4 estava verde porque o
estado não era visitado, exatamente o buraco que o critério descreve ("texto novo
em estado não visitado passa"). As outras cores não mudaram; o que a leva toca na
régua — os bytes do boot (D6), o mundo da semente (D4), as alocações e draw calls
(D2, D3), o aviso como alvo de toque (C2), os erros de página (E12) — foi remedido.
O resto é **não remedido** (o código não mudou; vale o número de `b92a932`).

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista sete.

**Regressões obrigatórias (§8):** M1 ✓ (não remedido), M2 ✓ (não remedido),
**C4 ✗ (achado antigo, §A.1.6)**, D2 ◌ (a parte medida passa), D6 ✓ (§3),
E10 ✓ (não remedido), E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0** (o de
C4 é anterior a esta leva).
**Defeitos NOVOS nascidos das correções desta leva: 2** (§4, [NC] 1–2; os dois
baixos; **um deles é de segurança/robustez, latente — detalhe fora do repo**).
Em `b92a932`: 3; em `a03c122`: 4; em `3d7d47a`: 2; em `f672d81`: 2; em
`4433c4d`: 2; em `a9a4ffd`: 3; em `afb1ae8`: 4.
**Os 3 [NC] de r12 e as duas correções que não fecharam (§4.4 e o boot) FECHARAM**
no caso que r12 mediu; o resíduo do recorde (§4.5 de r12) não foi mexido e segue
como medida (§A.4).

`test/security-regression.test.js`: **38/38** (na suíte).

**Suíte completa** (`npm test`, 11h49–12h50, sem sonda minha ao lado, carga
mediana 3,50, p90 4,45, máx. 5,27): **2 635 testes, 2 632 passaram, 0 falharam,
0 cancelados, 3 pulados** (61,4 min). Nenhum arquivo foi à triagem; `ps` vazio de
`run-tests` antes de ler o placar; a linha final é a do próprio runner (TAP).
**A janela de boot > 90 s sumiu nesta suíte:** 0 cancelamentos, contra **60
cancelados em 9 arquivos** em `b92a932` (r12) e 1 na suíte do orquestrador em
`98e79b9`. N = 1 suíte (declarado); a causa que r12 isolou (o CDN) deixou de
existir no boot (§A.1.1: 0 requisições para fora em 60 boots).

---

## A. Os quatro itens do briefing, um por um

### 1. O boot sem o CDN — FECHOU; o vigia funciona; dois avessos (cache do erro, alarme em link de 2G)

**1.1 Ninguém vai para fora, nada trava** (`r13-bootdiag`: o boot do harness — o
mesmo `server.js`, os mesmos argumentos do Chrome, `?tier=baixo`, as bandeiras
antes do 1º script —, perfil NOVO a cada boot, DevTools anotando cada
requisição; carga 2,7–4,4):

| | 30 boots XR (IWER) | 30 boots `?mobile=1` | r12 (CDN) |
|---|--:|--:|--:|
| boots que chegaram a `__game && __MP` | **30** | **30** | 28 de 30 XR, 30 de 30 |
| tempo do boot (mín · p50 · máx) | 1,90 · **1,97** · 2,20 s | 1,87 · **1,94** · 2,04 s | p50 2,20 / 2,04 s; 2 presos 90 s |
| o módulo do jogo rodou em | 0,17–0,21 s | 0,17–0,19 s | — |
| requisições a host que não é o servidor local | **0** | **0** | 26 por boot |
| requisições falhadas · pendentes no travamento | 0 · — | 0 · — | 2 boots com `net::ERR_FAILED` |
| `/vendor/` por boot · status · `immutable` | 26 · 200 · 26 de 26 | 26 · 200 · 26 de 26 | — |
| a mais lenta de `/vendor/` | 74 ms | 74 ms | — |
| `THREE.REVISION` na página (`import('three')`) | **'184'** (30/30) | **'184'** (30/30) | 184 |
| aviso do vigia · `pageerror` · `console.error` | 0 · 0 · 0 | 0 · 0 · 0 | — |

Mais 3 boots esperando 65 s depois da navegação (o relógio do vigia é 60 s): o
botão segue "▶ JOGAR SOLO" — o vigia se cala.

**1.2 A versão não mudou — byte a byte** (`r13-vendor-bytes`, âncora: o arquivo
publicado no jsDelivr, o que o importmap de `b92a932` pedia). O fecho transitivo
das importações (as entradas do importmap + os 14 addons que o cliente importa)
dá os **mesmos 26 arquivos** que r12 contou no CDN; o sha256 do disco
(`node_modules/three-cliente`, `cannon-es`) é **igual ao do CDN em 26 de 26 e ao
da produção (decodificado) em 26 de 26**; `REVISION = '184'` no disco e na
página. **Produção, só cabeçalhos/GET de arquivo público:** os 26 com 200,
`Cache-Control: public, max-age=31536000, immutable`, `Content-Encoding: br`,
`cf-cache-status` HIT/MISS. Bytes que o jogador baixa desses 26: **590 324 B**
(brotli da borda) contra **581 204 B** do CDN — **+9 120 B (+1,6 %)**; crus,
2 770 038 B.

**1.3 O vigia contra cada falha** (`r13-vigia`: como o jogador — `?mobile=1`, V2,
toque, perfil novo com cache ligado, sem as bandeiras do harness; a falha feita
pelo DevTools; ao ver o aviso a sonda LIBERA a requisição e TOCA o botão):

| falha | aviso apareceu em | o toque | menu jogável |
|---|--:|---|--:|
| `three.core.js` abortado (`net::ERR_FAILED`, o caso de r12) | **0,23 s** | recarrega | 2,18 s |
| `/js/terrain.js` abortado (módulo do próprio jogo) | 0,12 s | recarrega | 2,08 s |
| `Sky.js` com 404 | 0,12 s | recarrega | 2,06 s |
| `Sky.js` CORROMPIDO (200 com erro de sintaxe) | **60,13 s** | recarrega | 62,06 s |
| `cannon-es.js` PENDURADO (nunca responde) | **60,12 s** | recarrega | 62,01 s |

Erro de REDE em qualquer módulo é avisado na hora (o `onerror` do `<script
type=module>`); erro de SINTAXE não dispara o `onerror` (é erro de avaliação, não
de busca) e fica para o relógio de 60 s — dentro do que o commit promete ("erro
de importação, ou 60 s"). A tela do aviso: o botão vira o principal (dourado),
**620–715 × 62 px** em V1/V2/V3, texto inteiro (`scrollWidth = clientWidth`), o
centro dele é ele mesmo (C2 vale no estado novo).

**1.4 O avesso — o vigia num boot LENTO legítimo.** Duas medidas, porque o
servidor local manda o JS cru e a borda da produção comprime (§0):

| rede (DevTools) | servidor local, JS cru: módulo · aviso | como em produção (proxy brotli): módulo · aviso · menu |
|---|---|---|
| 9 Mbps / 40 ms (o 4G da régua) | 4,80 s · nenhum (N = 3) | **1,77 s** · nenhum · 2,92 s |
| 1,6 Mbps / 150 ms | 26,4 s · nenhum | 8,8 s · nenhum · 10,6 s |
| 0,4 Mbps / 400 ms | **105,3 s · aviso aos 67,4 s** | 33,7 s · nenhum · 36,2 s |
| 0,4 Mbps / 2 000 ms ("3G lento") | — | 54,2 s · nenhum · 58,4 s |
| 0,2 Mbps / 400 ms | — | 65,5 s · nenhum · 68,0 s |

O relógio do vigia começa quando o script dele roda, depois do `style.css` e do
`socket.io.js` do `<head>` (7,4 s a 0,4 Mbps cru) — por isso o 0,2 Mbps de
produção (módulo aos 65,5 s) ainda escapa. **Onde ele dispara de mentira** (local
cru a 0,4 Mbps, o equivalente a ~0,1 Mbps em produção): o botão diz "⚠ O JOGO NÃO
CARREGOU — TOQUE PARA TENTAR DE NOVO" por **38 s** enquanto o download segue; sem
toque, o menu volta sozinho (o `paintMenu` repinta "CARREGANDO..." quando o
módulo roda, 107,8 s); com toque aos 67,4 s, a página recarrega e o módulo chega
aos **110,9 s (+5,6 s)** — o que já tinha chegado vem do cache. Observação (h),
não defeito: só abaixo de ~0,2 Mbps de produção (2G/EDGE), e se desfaz sozinho.

**1.5 Cache imutável servindo arquivo velho:** hoje não — o caminho leva a versão,
e a versão é a mesma do CDN (1.2). Mas **o ERRO também sai imutável** ([NC] 2,
§4): um 404 em `/vendor/` leva `max-age` de um ano e a borda o guarda (medido).
Versão instalada diferente da do caminho: o servidor grita no log
(`[VENDOR] three-cliente instalado 0.184.1 ≠ 0.184.0 … o cliente vai quebrar`,
mutante na cópia) e **continua servindo** sob o caminho antigo — barulhento só
no log do contêiner (detalhe fora do repo).

**1.6 O que o jogador vê no carregamento — C4** (`r13-c4-boot`: V2 `?mobile=1`,
navegador novo por caso, texto VISÍVEL = caixa > 0 e fonte > 0, amostrado a cada
100 ms; rede pelo proxy de produção):

| caso | `ESC`/`ENTER` visíveis de … até | o módulo rodou | `html.mobile` posto |
|---|---|--:|--:|
| 4G (9 Mbps / 40 ms) | 0,17 → **4,56 s** | 1,76 s | 4,92 s |
| 1,6 Mbps / 150 ms | 0,28 → **11,9 s** | 8,96 s | 12,3 s |
| falha (three.core abortado) | 0,14 s → **sempre** (47 de 47 amostras) | nunca | nunca |

Controle da âncora: depois do `html.mobile` a mesma sonda lê 0 (fonte 0 px). A
classe sai ~3 s depois de o módulo rodar (o `touchcontrols` arma no fim do boot).
Carga 2,8 → 7,7 nesta sonda (rajada alheia no fim): os segundos são indicativos;
a presença do texto não depende deles.

### 2. Corpo × obstáculo — FECHOU o mercado/refúgio e a tenda; o avesso é bloqueio a mais, e o telhado segue sem pouso

Solo de verdade, `?mobile=1`, V2, toque (USAR, analógico, ⇧). Âncoras: a malha
desenhada (troncos instanciados, GLB do mercado/refúgio, tenda, barril), a reta de
cima no GLB para o telhado; "antes" = `b92a932` na cópia.

| caso | agora | antes (`b92a932`) |
|---|---|---|
| saída do helicóptero sobre o centro / a 2,5 m / a 3,4 m do mercado | **0 quadros** dentro do círculo com o tronco sob o telhado desenhado; empurrado 1,95 / 0,94 / 3,75 m num quadro com o pé **2,24 / 2,41 / 1,98 m ACIMA do telhado desenhado** (8,5–8,7 m do chão) | **4, 4, 5 quadros (67–83 ms) DENTRO**, pé 3,4–5,3 m, o mesmo salto 3,1–3,5 m abaixo do telhado |
| idem sobre o refúgio | **0 quadros** dentro; empurrado 1,51 / 0,50 / 3,31 m com o pé **2,63 / — / 1,56 m acima** do telhado desenhado (14,5 m do chão) | **7, 0, 8 quadros (117–133 ms)**, pé 4,1–11,5 m |
| pulo na tenda, andando / correndo | **não atravessa; 0,06 / 0,14 m por quadro** (a velocidade de andar/correr) | atravessava correndo; **1,03 / 1,28 m num quadro** |
| pulo no barril (1,05 m), andando / correndo | **não atravessa**, pé até 1,62 / 1,63 m, 0,06 / 0,14 m por quadro | atravessava (0,42 m num quadro) |
| 18 árvores, 28 080 posições (13 raios × 24 rumos × chão e pulo 0,4–1,6 m) | corpo no TRONCO modelado: **0**; em galho/raiz: 63 (as mesmas) | 0; 63 |

- **O telhado (o avesso que o briefing pediu):** não há pouso no telhado do
  mercado/refúgio (nunca houve) — o círculo de corpo empurra para a borda. Agora
  o empurrão acontece **1,6–2,6 m acima do telhado desenhado**: `corpoAte` é a
  altura da CAIXA do GLB (7 / 13 m) e o telhado desenhado no centro está a
  **6,53 / 10,52 m** (reta de cima), e a margem do pulo soma 1,7 m. Parede
  invisível acima do telhado, salto de até 3,75 m no ar. Em `a03c122` o mesmo
  empurrão acontecia a QUALQUER altura (no quadro da saída); em `b92a932`, dentro
  do prédio. Resíduo, não defeito novo (§4.3).
- **Tronco inclinado (a beira):** a margem devolve, na faixa do pulo, quase o
  bloqueio de `a03c122` — a regra nova deixa **21 427** posições, a de `b92a932`
  21 967, a de `a03c122` 21 405. **540 (1,9 %)** que `b92a932` deixava passam a
  ser recusadas; em **nenhuma** a madeira desenhada na altura do corpo está a
  < 30 cm (86 entre 30–60 cm, 216 além de 60 cm, 238 fora da faixa em que a âncora
  sabe o que é madeira) — é a fatia de BAIXO (mais larga ou deslocada) segurando
  quem pula. Bloqueio a mais, não avesso. Posta ali à força, o produto empurra até
  **0,55 m** num quadro; numa trajetória contínua o círculo segura desde o chão e
  essa posição não é alcançada (leitura, não medido com pulo real junto a tronco).
- **Pedra baixa:** do chão, nada alcançável muda (o círculo de corpo de pedra e
  cacto vai a chão + 3,4 m, e o pulo chega a 1,6 m — já não se pulava pedra baixa).
  Mas a faixa agora sobe a **5,1 m**: em 1 de 45 voos do canhão (o que sai da beira
  com carro no caminho, e2), o voo levou **3,2 cm** de empurrão a 4,4 m do chão,
  junto de uma pedra desenhada com 0,9 m. Observação.
- **Voo do canhão:** 45 voos no BR, **0 saltos laterais** nos voos puxados (o
  resto: o carro do dublê batendo no jogador, §A.3, e a pedra acima).
- **Mutantes:** `SEMcorpoAte` → o refúgio volta a **6–7 quadros (100–117 ms)
  dentro**, o mercado 1; `SEMmargem` → a tenda volta a **1,03 / 1,28 m** num
  quadro e o barril é atravessado; e o empurrão no telhado cai para 0–0,95 m
  acima dele (é a margem que o leva a 1,6–2,6 m).

### 3. Canhão — a argola mirada e o puxão contra carro FECHARAM; o puxão agora atravessa o HELICÓPTERO

Partida BR `?mobile=1`, V2, toque, servidor de verdade (salvo o solo de D/E).
Âncoras: as 5 argolas DESENHADAS, a caixa desenhada do carro, a malha desenhada
do helicóptero, o `strikes` do servidor.

| caso (jogador a 4,5 m do centro) | agora | antes (`b92a932`) |
|---|---|---|
| (e1) buggy parado ENTRE, mirando a 3ª | sem puxão; voo a **−9,26°** (o rumo da 3ª vista da beira), passa as argolas 2–4 | voo a −23,79° — **a 1ª**, 1 de 5 ([NC] 3 de r12) |
| (e1) mirando a 1ª / a 5ª | −23,78° (a 1ª) / −5,69° (a 5ª) | −23,78° / −23,79° (sempre a 1ª) |
| (e2) buggy que ENTRA no caminho na carga (4 tempos, 10–12 m/s) | **o puxão para**: joelho/tronco na caixa desenhada **0**; lança de 3,09–4,60 m; 9–17 de 29 quadros a ≤ 0,19 m dentro do círculo de corpo — o atraso de um quadro do empurrão de um carro em movimento, não o puxão | puxava: tronco na caixa em até **2** quadros, até 0,42 m num quadro, lança do centro |
| (e4) buggy ENTRE no toque, tirado do caminho 120 / 250 ms depois | sem puxão (a decisão é do toque e só desliga), voo da beira para a 3ª | igual (voo para a 1ª) |
| (e3) buggy AO LADO, fora da linha | puxa, lança do centro, **5 de 5** | igual |
| (D, solo) buggy EM CHAMAS entre | **sem puxão**: 0 de 30 quadros no círculo, lança a 4,5 m | **28 de 29** no círculo, tronco na caixa em 2 |
| **(E, solo) HELICÓPTERO pousado entre** | **puxa através**: **7 de 30** quadros com o corpo DENTRO da malha desenhada (e das caixas do produto), **1,75 m num quadro**, lança do centro | **sem puxão**: 0 quadros, lança a 4,5 m |

- **O helicóptero ([NC] 1):** o `caminhoLivre` trocou a consulta da FROTA
  (`Veiculos.segmento`, que inclui o helicóptero) pelo círculo de corpo só dos
  `Car.vehicles`. O helicóptero empurra o corpo (`empurrarDaFuselagem`) e agora o
  puxão briga com ele: o corpo fica 3 quadros encostado na fuselagem, entra, e é
  cuspido 1,75 m. Mutante `CAMINHObala` (o `caminhoLivre` de `b92a932`): o
  helicóptero volta a barrar (0) — e o carro em chamas volta a ser atravessado
  (29 quadros, tronco na caixa em 2). Os testes do construtor ficam **verdes**
  com esse mutante: nenhum mede o carro em chamas nem o helicóptero.
- **A JANELA da mira na argola** (contra a argola desenhada): igual a r12 — do
  centro, ±22° ainda voa o curso (a silhueta da 1ª é ±15,5°), +26° voa para onde
  mira; da beira de 4 m, +18° voa o curso, +22° não. Dos 35 voos sem carro, os
  **29** com a mira dentro da janela: **5 de 5** em todos (e o e3, com o carro ao
  lado: 5 de 5); os 6 fora dela voam para onde miram, como em r12. **0 strikes**
  em 45 voos (detalhe fora do repo).
- O (e2) a 10 m/s: o carro do dublê segue andando e bate no jogador no
  lançamento — rumo inicial −67°, 2 de 5. É o carro atropelando quem está no
  canhão, não o puxão. Observação.
- **Mutantes:** `CAMINHOsoNoToque` (sem a conferência a cada quadro) → e2 volta a
  puxar através (tronco na caixa em até 2, lança do centro); `PRIMEIRAargola` (a
  1ª ao longo da mira, `b92a932`) → e1 volta à 1ª (−23,79°) nos 3 casos.

### 4. O recorde × a taxa de quadros — NÃO mexido; segue, e é medida (resolução de um quadro), não o voo

Solo, `?mobile=1`, toque no USAR, página recarregada no mesmo navegador
(`r12-recarga.js`, sem mudança; carga 2,7–3,2).

| sessão | tempo cru da volta (q/s) | "RECORDE" |
|---|---|--:|
| 1 — 6 voltas, 60 q/s | 1,7499–1,7500 (59,5–60,2) | 1 (a 1ª, o primeiro tempo) |
| 2 — recarregada, 4 voltas | 1,7499–1,7500 | **0** |
| 3 — CPU ×4 | **1,7571** (35,4) · 1,7589 (54,9) · 1,7542 (56,2) | **0** (r12: 1 — 1,7436 a 34,7 q/s) |
| 4 — recarregada, 3 voltas | 1,7499–1,7500 | 0 |

O tempo é o do QUADRO em que a próxima argola muda (`js/maptoys.js`: `startT = t`
no quadro da 1ª, `t − startT` no da 5ª), não o do instante da travessia: a
resolução é um quadro em cada ponta (17 ms a 60 q/s, 28 ms a 35 q/s) contra os
10 ms que a tela compara. A ~35 q/s a MESMA volta deu 1,7436 (r12) e 1,7571
(agora) — ±1 quadro em volta de 1,75; o "recorde por queda de quadro" depende da
fase (r12: 1 de 3; agora: 0 de 3). **Não é defeito novo nem do voo** (os
intervalos entre argolas batem com os de 60 q/s dentro de um quadro); é a medida
quantizada pelo quadro. Muito baixa. A mensagem segue em décimos ("💫 1.8s ·
recorde 1.8s").

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Não remedido.** O bot (`scripts/bots.js`), o servidor de jogo e a geometria de
bala (`js/paredes.js`, `js/maptoys-core.js`) não mudaram; em `js/obstaculos.js` a
leva só acrescenta `corpoAte` ao mercado/refúgio (só CORPO — a bala segue a regra
de sempre, chão + 3,4 m; o bot lê os `solidos` para a visada e ignora o campo
novo). Valem os números de r10: pares geométricos **1 de 10 312** tampados vistos
(o par de caminhão de sempre), **cego 0 de 8 629**; atrações 0 e 0; a arena de r7
(0 / 0 / 0 / 0 em 52 válidos); "a tela não mostra e a vítima aceita" **38** (16
atrás de poste). **Veredito: ◌ — igual a r10**, pelas duas razões de `d381d29`.

---

## 3. Veredito por critério (com a comparação com `b92a932`)

"Não remedido" = o código que o critério mede não mudou nesta leva (o diff é o
boot — `index.html`, `server.js` de `/vendor/`, `package.json` —, o canhão e o
empurrão de corpo no `game.js`/`js/cannon.js`/`js/obstaculos.js`); vale o número
de `b92a932` (que remete a r10).

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | Não remedido: 0,00 px / 0,00 cm a 10, 25 e 50 m em V2/V3 (r10). O three servido é byte a byte o do CDN (§A.1.2). |
| **M2** | ✓ | ✓ | Não remedido: fuzil 720 m/s → 7,9 cm a 100 m; DMR 5,3; sniper 5,2 (r10). |
| **M3**–**M6** | ✓ | ✓ | Não remedidos (r10). |
| **M7** | ✓ | ✓ | Não remedido (r10). O arrasto desta rodada: 100 px = **18,335°**, ida e volta 0,000°. |

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
| **C2** | ✓ | ✓ | Remedido no estado NOVO (o aviso do vigia): o botão tem **620–715 × 62 px** em V1/V2/V3 e o centro dele é ele. O resto não remedido (r10). |
| **C3** | ◌ | ◌ | Não remedido: morte, espectador e carro não medidos. |
| **C4** | **✗** | ✓ | **Achado antigo, estado agora visitado (§A.1.6):** no carregamento do celular a linha **"ESC pausa o jogo · ↑ ↓ e ENTER navegam o menu"** fica visível até o `html.mobile` — **0,17 → 4,56 s** no 4G como em produção, 0,28 → 11,9 s a 1,6 Mbps, e **sempre** na tela de falha do vigia. O que a leva escreveu: "⚠ O JOGO NÃO CARREGOU — TOQUE PARA TENTAR DE NOVO" — 0 nomes de tecla; os textos do canhão: 0 (como r12). |
| **C5**, **C6** | ✓ | ✓ | Não remedidos (r10). |
| **C7**–**C9** | ✓ | ✓ | Não remedidos. |
| **C10** | ✓ | ✓ | Não remedido (r12: polegar no talo do toque ao pouso, soltar → 0,004 m/s). O puxão que agora para no meio da carga zera a velocidade igual (leitura de `update()`). |
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
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos. B12 (terreno em produção): `three` do servidor segue em `dependencies`; `cannon-es` passou a `dependencies` (a produção serve os 26 arquivos, §A.1.2). |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2**–**P4** | ✓ | ✓ | Não remedidos (r10). P4 mede parede de CONSTRUÇÃO (`Structures.collide`, intocado); o mercado/refúgio são POI. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | Não remedido (r10). O puxão contra veículo é corpo do jogador, não bala (a bala segue `Veiculos.segmento`, intocado). |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **233 draw calls p50** (mín. 222, máx. 256, mundo de 22,6 s; r12: 230) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 634: **0 `Object3D`** (ATIRAR arrastando: 12, os mesmos de r10–r12). |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais**; o retrato do desktop contra r12: **0 diferenças** (o `corpoAte` é campo novo do obstáculo, sem consumo de sorteio). |
| **D5** | ✓ | ✓ | Não remedido. |
| **D6** | ✓ | ✓ | **Remedido, N = 5, carga 2,1–2,7** (`boot4g13`: 9 Mbps / 40 ms, V3, cache desligado, servidor novo a cada vez). A grandeza das rodadas anteriores — os bytes como o jogador os recebe: até r12 os 26 arquivos do three/cannon-es vinham do CDN em brotli; agora o servidor LOCAL os manda crus (**2,779 MB**) e a borda da produção em brotli (**0,590 MB**, medido). Com a parte de `/vendor/` como o jogador a recebe: menu **3,11–3,69 MB**, arma pronta **3,25–3,69 MB**, total **11,15 MB** (220 req.) — o mutante `CDN` na mesma sessão: 3,11 / 3,25 / 11,15 MB; r10: 3,10 / 3,24 / 11,14. Limiar 15,03 / 5,25. **Lido cru no servidor local, o número sobe para menu 5,30–5,87, arma pronta 5,44–5,87 MB (acima de 5,25), total 13,34 MB** — é o ambiente local sem compressão de JS (que sempre existiu para o `game.js`), não bytes que o jogador baixa; declarado, e quem usar o número local como portão vai ler vermelho. Como em produção (proxy brotli calibrado, N = 3): menu 1,71–2,11, arma 1,85–2,28, total 9,75 MB. A leva soma **+2 973 B** crus aos arquivos do jogo (`game.js` +1 152, `js/cannon.js` +480, `js/obstaculos.js` +339, `index.html` +1 002). |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1** | ✓ | ✓ | Não remedido no caminho de r10; o boot normal termina em "▶ JOGAR SOLO" (60/60) e o vigia acrescenta, na falha, um caminho por toque de volta ao menu (§A.1.3). |
| **E2**, **E3** | ✓ | ✓ | Não remedidos. |
| **E4**, **E5** | ◌ | ◌ | Não remedidos. |
| **E6**–**E8** | ✓ | ✓ | Não remedidos. |
| **E9** | ✗ | ✗ | Não remedido (sem "sair da partida" no BR; decisão do dono). |
| **E10** | ✓ | ✓ | Não remedido. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; **0 `pageerror` e 0 `console.error`** nos 63 boots do `bootdiag` e em todas as páginas das sondas desta rodada (a não ser o módulo corrompido DE PROPÓSITO no vigia: "Unexpected token ';'"). A falha de módulo agora é DITA (o aviso), não calada. |
| **E15** | ✓ | ✓ | Não remedido (r10). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `98e79b9`, baixa] O puxão do canhão atravessa o HELICÓPTERO pousado no
   caminho.** O `caminhoLivre` novo olha só o círculo de corpo de `Car.vehicles`;
   o de `b92a932` consultava a frota inteira (`Veiculos.segmento`), helicóptero
   incluso. Reprodução (solo): helicóptero no chão a 2,3 m do centro do canhão, de
   través; jogador a 4,5 m do centro, do mesmo lado; USAR. **7 de 30 quadros da
   carga com o corpo dentro da malha desenhada do helicóptero** (e das caixas de
   bala do produto), **1,75 m num quadro**, lança do centro. Antes: sem puxão, 0
   quadros. Raro (alguém tem de pousar a ≤ ~6 m do canhão, no meio). Os testes do
   construtor não cobrem (o mutante que devolve a consulta antiga fica verde neles —
   e o carro em chamas também não tem teste).
2. **[NC — `98e79b9`, baixa, latente] O ERRO de `/vendor/` sai com cache imutável
   de um ano, e a borda o guarda.** O cabeçalho vale para todo caminho que começa
   com `/vendor/` — 404 e 301 inclusive; na produção um 404 de `/vendor/` passa de
   `MISS` a `HIT` (medido). Pesa na próxima troca de versão do three/cannon-es.
   Hoje nenhum caminho do boot dá 404. Consequência, cenário e detalhe **fora do
   repo**.
3. **Resíduo — o telhado do mercado/refúgio é parede invisível.** Fechou o "dentro
   do prédio" de r12 ([NC] 1 de r12: 0 quadros agora). Mas não há pouso no telhado,
   e o empurrão acontece **1,6–2,6 m ACIMA do telhado desenhado** (a altura da
   caixa do GLB, 7 / 13 m, contra o telhado de 6,5 / 10,5 m, mais a margem de
   1,7 m), com o salto de sempre (até 3,75 m num quadro). Em `a03c122` era a
   qualquer altura. Baixa.
4. **Achado antigo — C4 no carregamento** (§A.1.6): no celular, "ESC pausa o
   jogo · ↑ ↓ e ENTER navegam o menu" visível até o módulo armar o toque (~4,4 s
   no 4G de produção; sempre, na tela de falha). Anterior a esta leva; reprova C4.
5. **Achado antigo, não mexido — o recorde por queda de quadro** (§A.4): o tempo
   da volta tem a resolução do quadro; muito baixa.
6. **Achados antigos, sem mudança:** o bot anda através de tronco, pedra e POI; o
   corpo do jogador passa por galho/raiz desenhados (63 posições nas 18 árvores, as
   mesmas de r12).
7. **Segurança — carro solto** (os resíduos de r10; o carro DIRIGIDO sem
   conferência de chão): não remedidos (a lógica de jogo do servidor não mudou).
   Detalhe **fora do repo**.
8. Inalterados (código intocado): **o canhão mostra o que a bala atravessa** (cano
   141, aro dourado 10, faixa da borda ≤ 11,2 cm — r10), **faixa de 0,45 m acima
   de peça de corpo**, **agachado atrás de poste** (16), **P1**, **C11**,
   **C1(e)**, **E9**.

**Observações sem veredito:** (a) a beira da saia do vulcão segue muralha; (c) o
carro segue no relevo dentro da rocha do vulcão enquanto alguém dirige; B6 pela
letra — **não remedidas** (`js/vulcao-solido.js`, `js/volcano.js`,
`scripts/bots.js`: diff vazio); (e) o gzip quase não reduz a bazuca (−4 %), D6
esperando o dono; (f) P4(b): o canhão sobre a encosta aparece como base suspensa;
(g) **o texto novo do `CLAUDE.md`** confere com o medido (26 requisições, versão
no caminho, vigia de erro de importação ou 60 s; `corpoAte`; a margem de 1,7 m),
menos "o topo DESENHADO" do mercado/refúgio — é a caixa do GLB, 0,5–2,5 m acima
do telhado (§4.3); (h) **o vigia em link de 2G** (§A.1.4): abaixo de ~0,2 Mbps de
produção o aviso diz "NÃO CARREGOU" enquanto o download segue (38 s no caso
medido), e se desfaz sozinho; (i) **o barril de 1,05 m já não se pula** (o pulo
chega a 1,6 m; a margem é conservadora de propósito); (j) a margem estende a faixa
de corpo de pedra/cacto até 5,1 m (3,2 cm de empurrão num voo, §A.2); (k) o
`[VENDOR]` grita só no log e o servidor segue servindo (fora do repo); (l) o carro
que SAI do caminho não religa o puxão (o voo sai da beira) — é o desenho.

**Contagem:** 5 critérios reprovados (os 4 de r10–r12 e C4, por achado antigo);
**0 nasceu de correção desta rodada**; **2 defeitos novos nasceram de correções**
(itens 1–2, baixos; o 2 é latente e de cache); **nenhuma correção da leva deixou o
caso de r12 aberto** (o puxão com carro que entra e em chamas, a argola errada, o
corpo no mercado/refúgio, a tenda, o boot pelo CDN — todos fecharam); 1 resíduo
(item 3).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| mercado/refúgio sem `corpoAte` (`SEMcorpoAte`) | refúgio **6–7 quadros (100–117 ms) dentro** do prédio, mercado 1 (árvore 0) | `maptoys`: **1 vermelho** ("a 6 m … ficou DENTRO do mercado") |
| sem a margem de 1,7 m (`SEMmargem`) | tenda **1,03 / 1,28 m** num quadro; barril atravessado (árvore: 0,06/0,14) | `maptoys`: **1 vermelho** ("1 m acima da cumeeira a tenda não bateu") |
| o caminho só no toque (`CAMINHOsoNoToque`) | e2: puxa através, tronco na caixa em até 2, lança do centro (árvore: 0, para) | `maptoys`: **1 vermelho** ("o carro entrou no caminho e o puxão seguiu: 0,12 m") |
| o caminho pela consulta de bala de `b92a932` (`CAMINHObala`) | carro em chamas: **29 quadros** no círculo, tronco na caixa em 2 (árvore 0); helicóptero: 0 (árvore **7**) | `maptoys`: **0 vermelhos** |
| a 1ª argola ao longo da mira (`PRIMEIRAargola`) | e1 → a 1ª (−23,79°) nos 3 casos (árvore: −9,26 / −23,78 / −5,69°) | `maptoys`: **1 vermelho** ("saiu a 14,1° dela") |
| o `game.js` sem `__gameModulo` (`SEMmarca`) | boot normal pronto e, aos **60,5 s**, o botão diz "NÃO CARREGOU" (2 de 2) | `boot-sem-cdn`: **2 vermelhos** |
| sem o `onerror` do módulo (`SEMonerror`) | aviso aos **60,1 s** em vez de 0,23 s | `boot-sem-cdn`: **1 vermelho** |
| o importmap de volta ao CDN (`CDN`) | **26 requisições para fora** por boot (árvore 0) | `boot-sem-cdn`: **2 vermelhos** |
| a versão instalada ≠ a do caminho (`node_modules` da cópia) | `[VENDOR] … o cliente vai quebrar` no stderr; segue servindo | — |
| o cliente de `b92a932` (`ANTES`) | a coluna "antes" de §A | `maptoys`: **2 vermelhos**; `boot-sem-cdn`: 0 (o `index.html` da cópia é o novo — declarado) |

Controle (cópia = árvore): `maptoys` 18/18, `boot-sem-cdn` 4/4.

**Todo mutante avermelha alguma sonda minha; todo mutante, menos `CAMINHObala`,
avermelha algum teste do construtor.** O que os testes não medem, e que esta
rodada achou: o helicóptero no caminho e o carro em chamas (o mutante que os
devolve passa); o erro de `/vendor/` com cache imutável (o teste (c) só olha os
200); o vigia num boot lento legítimo e o erro de sintaxe (só o relógio pega); a
linha de teclas no carregamento do celular (C4); o telhado como parede invisível
(o teste mede um ponto a 6 m, dentro da caixa).

**As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): os resíduos de r10 — a lógica de
   jogo do servidor não mudou, eles seguem, sem teste.
2. **O cache do erro em `/vendor/`** ([NC] 2, fora do repo): antes da próxima troca
   de versão do three/cannon-es.
3. **C4 no carregamento** (§A.1.6): a linha de teclas do `#loadingMsg` no celular
   antes do módulo (e na tela de falha) — reprova C4, que é regressão obrigatória.
4. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
5. **O puxão contra o helicóptero** ([NC] 1) — e um teste para ele e para o carro
   em chamas.
6. **O telhado do mercado/refúgio** (§4.3): pouso ou o topo do empurrão no telhado
   desenhado.
7. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
8. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
