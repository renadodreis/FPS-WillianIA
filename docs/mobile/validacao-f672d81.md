# Validação do porte para CELULAR — commit `f672d81`

Nona rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63). Autor: o
**validador** — não escreveu código de produto nem teste do repo. Nada foi
commitado. **A régua não mudou** (`git diff 4433c4d f672d81 -- docs/mobile/criterio-aaa.md`
vazio).

Medido aqui o que entrou depois de `4433c4d`: `5cbadcc` (o interior da Torre no
chão que SUSTENTA, por estado da cidade; o carro solto com o teto pela velocidade
horizontal, lançado do maior instante, o QUIQUE e a parede pelos CANTOS do casco;
`largar` dentro do `state` e o `carFree` depois do `playerUpdate`), `9e93f97`
(só teste: `modelos-gzip` sem `.git`) e `f672d81` (o totem de fogos e a carreta e
as rodas do canhão seguram bala; a lista única `paredesDasAtracoes`).

---

## 0. Condições

- **Árvore:** `dev` em `f672d81` (`git log -1` no início e no fim). `git status`
  antes e depois: limpo, e no fim só ESTE arquivo (não rastreado). `npm run lint` limpo.
  sha256 do índice e dos 510 arquivos rastreados em `out/r9/arvore-f672d81.sha256`.
  Mutantes em **cópias** (`copia-r9` para as minhas sondas, `copia-r9c` para os
  testes do construtor; rsync da árvore), restaurados por `sha256` antes de cada
  um e conferidos no fim (`server.js` e `js/maptoys-core.js` da cópia = árvore).
- **Carga:** amostrada a cada 20 s das 18h13 às 21h27 (UTC−3; 583 amostras): carga de 1 min
  **mediana 3,0, p90 3,8, máximo 5,3** em 12 núcleos. O outro projeto da
  máquina não fez rajada nesta janela; os picos são as minhas sondas em paralelo.
  Cada artefato traz a carga do seu início e do seu fim. **O que depende de tempo
  foi medido com a carga baixa e declarada:** salto do carro (1,9–2,8), posse
  (2,1), dois navegadores (2,3), carro solto no servidor (1,9–2,9), boot em
  4G (2,5–3,3). A suíte correu sem nenhuma sonda minha ao lado.
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360, V3 844×390; `hasTouch`, `isMobile`,
  DPR 2, `?mobile=1`. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF)
  para tudo o que é do jogador; **dois navegadores** no mesmo servidor para o
  carro solto (`r9-carro`); o servidor de verdade (`node server.js`) com
  clientes por socket para o helicóptero e o carro solto; o salto pelo carro de
  verdade da página; o bot pelo `clearSight` do `scripts/bots.js`, com a
  geometria que ele mesmo monta.
- **O servidor medido é o servidor de verdade.** `srv9.js` foi REFEITO a partir do
  `server.js` novo (o briefing pediu: `montarSolo` agora tem plataformas POR
  ESTADO da cidade; a parábola e a saída mudaram): o mesmo arquivo da árvore
  carregado em processo com UMA linha de exportação no fim (`heliNoAr`,
  `superficieSob`, `soloAtual`, `tetoDoAr`, `quiqueDoCarro`, `cantosDoCarro`).
  Paridade com o processo (`node server.js`, socket): **13 de 13 pontos**
  iguais; com o mutante `SEMtorre`, 13 de 13 de novo (4 deles virando juntos).
- **Portas:** 3982–3999 para as sondas; os testes do construtor rodaram só na
  cópia, nas portas deles (4156, 4162, 3260, 4066 e `PORT=0`). Nunca a 3000.
  Antes de cada bloco, `ps` sem `run-tests`/`node --test`/`server.js` alheio.
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **O rótulo do `r8-solo`** lia `solo.plataformas`, que passou a ser POR ESTADO
     (`deFe`/`destruida`). A decisão sempre foi do `heliNoAr` real; só o rótulo
     mudou. Corrigido em `r9-solo`.
  2. **`r9-seg` (segurança), um ensaio do carro solto, 1ª execução:** a sonda não
     atualizava a pose do carro entre dois ensaios e o `enterCar` falhou. Inválido;
     refeito (detalhe fora do repo).
  3. **`r9-atracoes` (c), entrar no canhão:** 1,4 s a meio polegar andava ~1 m e a
     sonda parou a 2,93 m do centro — parecia que o jogador não entrava. Refeita
     com o polegar no talo e laço até passar: passa a 0,16 m do centro.
  4. **`r9-atracoes` (f, g), 1ª execução:** estourou o `protocolTimeout` (Raycaster
     em toda `InstancedMesh`, a grama). Refeita em lotes, só malhas comuns a ≤ 60 m
     + o `terrainMesh`, e com o rótulo "a bala parou numa caixa de ATRAÇÃO" por um
     slab nas 17 caixas da lista — para não confundir com tronco/pedra instanciados,
     que essa âncora não desenha.
  5. **`r9-atracoes` (e), o carro contra a RODA do canhão:** o buggy bateu em outra
     coisa a 10 m do canhão (x −240) e nunca chegou à roda. Caso sem N; o totem e
     a carreta valem.
  6. **`r9-solo` com a cidade destruída:** 5 colunas rotuladas "relevo" são a
     tolerância de 5 cm do servidor (conta o topo do toco como chão a partir de
     y ≥ topo − 0,05): são tocos dos escombros, como as outras 266.
  7. **Mutante `SEMtotem` no `r9-atracoes`:** a 1ª execução quebrou na minha leitura
     da caixa (o mutante não tem parede de totem). Guarda acrescentada; refeita.
  8. **Um `until … pgrep -f` meu casou com a própria linha** (o CLAUDE.md avisa).
     Parado pelo id da tarefa; nenhum processo alheio tocado.
  9. **`r9-carro` (dois navegadores):** em 3 das 4 tentativas o andar da MINHA sonda
     pelo polegar não levou B até o carro (38, 18 e 307 m). Só a 1ª vale para
     "B entra" (como em r8).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `srv9.js` (o servidor em processo), `r9-escada-node.js`, `r9-seg.js` (privada),
  `r9-solo.js` (+ `DESTRUIDA=1`, `SO_ATR=1`), `r9-salto.js`, `r9-posse.js`,
  `r7-carro.js` (dois navegadores), `r9-atracoes.js`, `r9-invis.js`,
  `bateria-r9.sh` (as de sempre), `boot4g9.sh`, `mut9.py`, `cadeia-*.sh`,
  `mut9-testes.sh`. Saídas em `out/r9/` e `out/r9b/`.

---

## 1. Placar

> **46 aprovados · 4 reprovados · 13 não medidos, em 63** (46/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `4433c4d` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Nenhum critério mudou de cor.** As três correções desta leva fecharam o que o
laudo 8 pediu nos itens 3, 4 e 6 do §4 (o carro que quica, a porta da Torre e a
saída do carro) e a escada da Torre ([NC] 1 de r8) — nenhum desses reprovava
critério: eram defeito de segurança e de B7/P3 dentro de critérios já verdes ou
◌. P3 segue ✓ e agora também com a cidade destruída.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista
sete.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✓, E10 ✓, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Defeitos NOVOS nascidos das correções desta leva: 2** (§4, [NC] 1–2; um de
segurança). Em `4433c4d`: 2; em `a9a4ffd`: 3; em `afb1ae8`: 4. **Uma correção não
fechou tudo o que prometia:** o canhão ainda mostra o que a bala atravessa (o
cano, por decisão; o aro e a borda da carreta, não) — §4, item 3.

`test/security-regression.test.js`: **38/38** (36 + os 2 casos novos desta leva).
Suíte completa (`npm test`, sem sonda minha ao lado, carga 2,9 → 3,7, 63 min):
**2 613 testes, 2 599 passaram, 1 falhou, 10 cancelados, 3 pulados**; o runner
re-rodou 2 arquivos isolados e chamou os dois de **flake** (2 passes seguidos):
`collision` (o boot de 90 s do harness estourou — `waitForFunction`, não
asserção) e `xr-locomotion` (os 10 cancelados: o `before` não terminou). Linha final
do runner: "só flakes — suíte VERDE", `EXIT 0`; `ps` vazio de `run-tests` antes de
ler o placar. **Veredito: verde pela triagem do próprio runner.**

---

## A. Os cinco itens do briefing, um por um

1. **Segurança — o detalhe está fora do repo; aqui só o que fecha e o que nasceu.**
   *(a) A escada da Torre ([NC] 1 de r8): FECHOU.* Varredura de 1 cm × 5 x por
   lance (os 20 lances + a rampa da porta), `heliNoAr` real: **0 de 30 175**
   amostras em que o servidor não vê o chão de quem anda na rampa (r8: 4 795).
   Servidor de verdade, os 4 pontos da faixa de r8: **a pé em 4 de 4** (r8:
   "piloto" em 4 de 4). Toda plataforma pisável do cliente (127, 29 905 amostras):
   **0** (r8: 40, todas na escada). **Cidade destruída nos dois lados** (o
   `destroy()` do módulo no cliente — 127 → 52 plataformas — e o estado da partida
   no servidor): **0 de 10 358**. Mutante `SEMtorre`: **4 795** e "piloto" em 4 de 4
   de novo.
   *(b) Carro solto pelos cantos do casco.* **A porta da Torre FECHOU:** o centro na
   beira do vão (o caso de r8) não entra mais (0 pacotes dentro; r8: 3 de 3), e o
   carro centrado na porta entra; lajes: 0 de 4. Mutante `CENTRO`: entra de novo. **Os dois resíduos que o briefing não mexeu
   SEGUEM** (detalhe fora do repo). Um resíduo do método dos cantos (que a reta do
   centro de r8 também tinha) está fora do repo.
   *(c) A decolagem.* A janela **não** se renova por recusa (medido no servidor de
   verdade). **Nasceu um vizinho novo da correção do quique** — [NC] 1 desta
   rodada, segurança, detalhe fora do repo.
   *(P3, o piloto legítimo):* grade de 2 m na cidade de pé **3 / 0** legitimando
   (igual a r8); na cidade destruída **0 / 0**. A faixa de 0,45 m acima de peça de
   corpo (observação 7 de r8) ganhou uma instância: o **totem de fogos** (25
   colunas), que agora é corpo e piso; o painel da galeria (36 colunas) já existia
   e não tinha sido medido; na cidade destruída, 271 colunas sobre os tocos dos
   escombros (existe desde `1f6cc8b`, nunca tinha sido medido).
2. **O carro LEGÍTIMO que pula e quica: FECHOU.** `r9-salto`, os MESMOS 7 pontos e
   rumos de r7/r8 (semente 7), carga 1,9–2,8: **0 pacotes recusados em 221**
   (r8: 18 — 9 e 2 em duas saídas, e o do tique da saída em 7 de 7). O carro de
   118 km/h sai a 8,18 m do chão, quica 3 vezes (picos de 2,68, 2,51 e 2,18 m) e chega a 0,03 m da
   física; fim a 0,03–0,36 m nas 7. **Mas o que fechou foi a subida pela
   velocidade horizontal, não o quique:** com o quique arrancado (`SEMquique`) as 7
   saídas dão **0** recusa; com a parábola lançada só do último pacote no chão
   (`TETOt0`), **0**; com a subida pelo deslocamento do 1º pacote no ar (a regra de
   r8, `VYdesloc`), **29** (28 numa saída, 1 noutra). O quique e a janela de meio
   segundo não são exercitados por nenhuma das 7 saídas reais — e é da correção
   do quique que nasceu o [NC] 1 (fora do repo).
3. **A saída do carro: FECHOU.** `r9-posse`, 8 ciclos pelo toque (USAR + polegar,
   21–70 km/h): o `state` do tique da saída leva `largar` em **8 de 8**, chega ao
   servidor em 8 de 8, e o `solto` desse tique é **aceito em 8 de 8** (r8: recusado
   em 8 de 8); no anfitrião, o `playerUpdate` desse tique chega **antes** do
   `carFree` em 8 de 8; entrada 8 de 8; 662 de 672 `state` repassados (os 10 = o
   anti-teleporte do único `QA.reset`). Mutantes: `LARGARignorado` → o `solto` do
   tique **0 de 6**; `CARFREEantes` → o `playerUpdate` do tique da saída **perdido
   em 6 de 6**. **Dois navegadores** (`r9-carro`, carga 2,3): esportivo a 117,9 km/h,
   **25 de 25** `solto` aceitos (r8: 25 de 26), o outro navegador desenha o carro
   parado a **0,28 m** da física de quem dirigia, maior buraco de `playerUpdate`
   **0,12 s** (r8: 0,13), o 1º `car = −1` a 0,14 s, e **B entra no 1º toque** (1 de
   1). Nas outras 3 saídas (85 e 33 km/h, buggy a 59): **65 de 65** `solto` aceitos,
   B desenha o carro a 0,09–1,61 m; a minha sonda não levou B até o carro (§0, 9).
   A volta a entrar: 4 de 4.
4. **Atrações — o totem e a carreta FECHARAM; o canhão como um todo, não.**
   `r9-atracoes`, partida BR `?mobile=1`, toque; âncora = a MALHA desenhada.
   - *Paridade:* 17 caixas no cliente × 17 no bot, diferença 0, mesmas marcas.
   - *Pares "a tela tampa e a bala passa"* (olho de bot a 8–40 m → cabeça e tronco
     0,5–1,8 m atrás da peça, em pé e agachado, 600 por peça): **totem: a malha
     tampa 434, a bala do cliente passa em 0** (mutante `SEMtotem`: 433 de 434);
     **canhão: a malha tampa 364, a bala passa em 154** (mutante `SEMcanhao`: 361
     de 364). Dos 154: **141 com o CANO** numa das duas pontas (fica de fora de
     propósito: gira para mirar), 8 com o **aro dourado da roda** (fixo, fora da
     caixa da roda) e 5 com a **carreta** (3 nas duas pontas; em 2 a outra ponta está só atrás do
     feixe TRANSLÚCIDO do farol, opacidade 0,3, que a minha âncora conta como tampa e
     não devia — esses 2 não contam) — a
     carreta desenhada é um tronco de cone que alarga de r 1,55 no topo para 1,75
     na base, e as caixas são do r 1,55: a borda de baixo, até 20 cm, não segura.
   - *O bot:* vê **0** dos pares que o cliente tampa (totem 600, 483 pela peça;
     canhão 316, 238 pela peça) e não é cego em nenhum que o cliente vê (0 de 284).
   - *O avesso — bala parando no ar:* retas aleatórias rente às peças, a 1ª malha
     desenhada × onde a bala para (só as paradas numa caixa de atração): **totem
     71 de 6 009** param ≥ 2 cm antes do desenho, **todas abaixo da base
     desenhada** — a caixa assenta 0,44 m abaixo da base e o desenho fica 4,4 e
     14 cm acima do chão em 2 das 4 quinas; **canhão 12 de 3 668** (1 ≥ 5 cm), nas
     quinas das caixas que passam do polígono desenhado (topo da carreta de 20
     lados, roda de 16): até 2,2 cm perpendiculares pela geometria. [NC] 2.
   - *Corpo:* contra o totem, pelo polegar nos 4 lados, o jogador para a 0,42 m (o
     raio) em 4 de 4; posto dentro do totem, sai a 0,42 m e anda (não fica preso).
     O jogador **entra no canhão** pelo polegar (passa a 0,16 m do centro e sai do
     outro lado, 2 de 2; mutante `CANHAOcorpo`: para a 1,92–2,10 m).
   - *O disparo:* USAR no centro e na borda: voa **54,3 / 53,9 m** e passa **3 das 5
     argolas** — igual sem as caixas (`SEMcanhao`: 54,3 / 54,1 m, 3). O curso não
     completa pelo canhão (a 5ª argola fica a 55 m e o voo pousa a 54; o teste do
     construtor aceita ≥ 3): observação, não nasceu agora.
   - *O carro:* o buggy a 41 km/h contra o totem para sem cruzar (centro do chassi a
     2,16 m do centro do totem); a 61 km/h contra a carreta para encostado nela, inclinado
     (o chassi a 1,96 m do centro), sem cruzar. Sem as caixas, atravessa os dois (`SEMtotem`:
     segue 60 m; `SEMcanhao`: 26 m).
5. **Os dois mutantes do laudo 8 agora avermelham.** `ACABpiso` → `security-regression`
   **1 vermelho em 38** ("dado o piloto pairando logo ACIMA de acabamento que o
   helicóptero atravessa, então ele segue piloto"); `LAJEcorpo` →
   `veiculo-vida-servidor` **1 vermelho em 15** ("carro solto: a LAJE segura o casco
   — caindo de um andar para o de baixo através dela, recusa"). Controle (cópia =
   árvore): 38/38 e 15/15. As minhas sondas também: `LAJEcorpo` sobe pelas lajes em
   1 de 4 (árvore 0).

*O [NC] 2 de r8 (agachado atrás de poste), não consertado de propósito:* remedido
(`r9-invis`, os mesmos 18 941 pares): **16** pares de poste com a silhueta fora da
tela e a vítima aceitando — **igual a r8**; no total, 38 (r8: 39; o par que saiu
é aleatório, ver §2).

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente,
com a rocha, o modelo do vulcão e o painel conferidos como carregados e
`cidade: false`; à parte, a TELA (`Oclusao`) e a malha do relevo desenhado.

### 2a. Caminho real
**Não refeito.** O bot (`scripts/bots.js`) e o `solto` no `playerUpdate` não
mudaram; o que mudou para o bot é a geometria das atrações, medida em pares (§A.4
e 2b). A arena de r7 (0 / 0 / 0 / 0 em 52 válidos; mutante 376 disparos em 39 de
39) segue sendo a medida do caminho real.

### 2b. Pares geométricos
`r9-invis`, os mesmos 18 941 pares de r6–r8: **o cliente tampa 10 312, o bot vê 1**
(o mesmo par de caminhão de r6, determinístico); **bot cego onde o cliente vê: 0 de
8 629**; a malha do relevo barra e a bala passa: 0. Diferença para r8 em 13 de 672
números, todas de ±1 a ±3 (um par aleatório e um de caminhão mudaram de classe).
**Atrações** (§A.4, 1 200 pares dirigidos): o bot vê 0 dos tampados, cego 0.

### 2c. A tela e a regra da vítima
"A tela não mostra nada e a vítima aceita" (silhueta): **38** (r8: 39), dos quais
16 atrás de poste (o [NC] 2 de r8, igual).

### 2d. Veredito de B7
**◌ — igual a r8.** Os pares e as atrações passam, o tipo que reprovou em r6 segue
passando (arena de r7), e as duas razões de `d381d29` continuam: a "virada" pela
letra (redação com o dono) e o avesso (9) sem N no caminho real.

---

## 3. Veredito por critério (com a comparação com `4433c4d`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 px / 0,00 cm a 10, 25 e 50 m** em todos os casos, idêntico a r8 campo a campo (`cmp9`: 0 diferenças em M1). Bazuca: idêntica a r8. |
| **M2** | ✓ | ✓ | Fuzil 720 m/s medidos → 7,8 cm a 100 m; DMR 795 → 4,9 cm; sniper 850 → 4,9 cm (a velocidade medida no voo, ruído de ±5 m/s como em r7/r8). |
| **M3**–**M5** | ✓ | ✓ | `mira.js` V3: os mesmos números de r8 (0 diferenças fora do M2). |
| **M6** | ✓ | ✓ | `m6b`: idêntico a r8. |
| **M7** | ✓ | ✓ | `r3-toque`, `r3-m7c` (carga 2,7–3,6): iguais a r8 dentro do ruído; (c) diferença **0,00** entre ~32 e ~61 quadros/s. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse e caneta: 0; controle de toque 4,71°. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 do automático**; controle positivo 92 (r8: 90). O totem e a carreta agora barram o `rayBlockedAt` que a assistência consulta: só mais estrito. |
| **A3**, **A4** | ✓ | ✓ | `assist.js`: iguais a r8. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (c: erro com/sem **3,44°/4,34°** a 10 m e **3,64°/4,34°** a 20 m — iguais); (d) segue em conflito com A2. |
| **A6**, **A7** | ✓ | ✓ | Iguais a r8; `security-regression` **38/38** (36 + os 2 casos novos desta leva). |
| **A8** | ✓ | ✓ | Padrão desligado; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | (e) três dedos em 0,5 s: **1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | `hud.js` V1 e V3: idênticos a r8 (0 diferenças). |
| **C3** | ◌ | ◌ | Igual: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque. |
| **C5** | ✓ | ✓ | `c5real`: idêntico a r8 (0 diferenças). |
| **C6** | ✓ | ✓ | Idêntico a r8. |
| **C7**–**C9** | ✓ | ✓ | Não remedidos fora do percurso (código intocado). |
| **C10** | ✓ | ✓ | Toque real: carro anda **5,18 m no 1º s**, pente 28 → 28; helicóptero com o ⇧ translada 6,45 m; sair: 0 m, nada preso — com a saída agora DENTRO do `state` (§A.3). |
| **C11** | ✗ | ✗ | Não remedido (código intocado): (a) 95,2 %; (c) a corrida liga entre 0,81 e 0,85. |
| **C12** | ✓ | ✓ | `r3-retic`: igual a r8, menos o golem (que anda): na parte 2 a tela mostra 25 de 25 px e a cruz fica vermelha em 29 de 30 quadros (em r8, com a grama entre os dois, 0 — e a grama tampava). |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1**, **B2** | ✓ | ✓ | Não remedidos: o bot, o tiro do servidor e o caminho da arena não mudaram. |
| **B3** | ◌ | ◌ | Igual a r8. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ◌ | ◌ | Pares: **1 de 10 312** tampados vistos (o par de caminhão de sempre, veículo); **cego 0 de 8 629**. A arena do disparo dentro da janela de reação não foi refeita (bot intocado); segue a proposta de redação de r7. |
| **B7** | ◌ | ◌ | §2. Atrações: o bot vê 0 dos tampados, cego 0 (§A.4). |
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos (código do bot intocado). |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido (o mesmo de B1/B2). |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes, 45 s cada: **1 007 golpes, 0 através** (r8: 1 140). Torre Nexus, 10 pontos da escada: **504 golpes, 0 através** (r8: 447). |
| **P3** | ✓ | ✓ | §A.1: piloto LEGÍTIMO a ≥ 3 m (pose aceita pelo próprio cliente): **0 de 17 161** com `heli = false` na cidade de pé E na destruída, 0 no castelo, nas torres e no vulcão. PvE (`r3-heli`): voando **0** golpes, pousado dentro 0; a pé 721. A arena de bots de P3 não foi refeita — o veredito sai do portão (`playerUpdate.heli`). Resíduo: a faixa de 0,45 m acima de peça de corpo (observação), agora também no totem. |
| **P4** | ✓ | ✓ | (a) 0 travessias (`r3-parede`, `r3-predio`); (b) os mesmos 11 vãos de construção + **6 caixas do canhão** que a sonda passou a ver (são a CARRETA, que não é construção: o desenho do canhão, de antes, fica até 0,68 m acima do chão nas quinas da encosta, apoiado nas rodas). Observação, não reprovação: P4 é "prédio". |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | **(a)** atrás do caminhão: fuzil, DMR e bazuca dão 0 px no alvo e 0 `shotHit` nele (vão para `vehicleHit`/`vehicleBlast`); controle DMR 128 px e 2 `shotHit`; hitscan: controle 111 px, 130 de dano. **(b)** arena de r7, não refeita (bot intocado). **(c)** vítima atrás do caminhão: 100; controle 48. **(d)** igual: rajada de 100 em 0 s tira 312; origem longe e fora de alcance, 0; `security-regression` 38/38. **(e)** a reta fica livre no MESMO quadro da queima; queima 2,54 s depois dos 30 tiros; explosão **5,04 s** depois da queima. |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **235 draw calls p50** (224–257, mundo de 22,6 s) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: 0 `Object3D`. |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais** (21 × 21 sítios, os dois lidos antes do mercado/refúgio; o `d4b` de r8, que espera a lista assentar, deu 23 × 23). |
| **D5** | ✓ | ✓ | Não remedido (o laço dos bots não mudou; as atrações são +16 caixas na consulta: `r5-poda` 1 146 → 1 162 paredes). |
| **D6** | ✓ | ✓ | `boot4g` (9 Mbps / 40 ms, V3, cache desligado, servidor novo a cada vez), **N = 5**, carga 2,5–3,3: total **11,14 MB** (11 142 602–11 143 647 B, 220 req., 17,0–17,1 s); menu jogável **3,10 MB** (4,4 s); arma pronta **3,24 MB** (4,5 s). Limiar 15,03 / 5,25. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave (pular em 0 quadros), queda, pouso — iguais a r8. |
| **E4**, **E5** | ◌ | ◌ | Igual: chegar ao carro/helicóptero só pelo toque, a partir da nave, não completado (o roteiro chega a 11,8 m do carro). |
| **E6**–**E8** | ✓ | ✓ | Solo: JOGAR DE NOVO / VOLTAR AO MENU; espectador → lobby; fim → lobby em 9,5 s → nova partida. (`estados-e7` estourou os 25 min, como em r7/r8.) |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). A pausa em si: ✓. |
| **E10** | ✓ | ✓ | Retrato na pausa, nada preso. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; 0 `pageerror` no que foi percorrido (inclusive nas páginas das atrações, da posse e dos dois navegadores). |
| **E15** | ✓ | ✓ | V2 e V1: pouso a 0,1 m do baú; 1º toque abre e o item entra; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque, anda 20,7 / 23 m, sai no 1º toque, nada preso — com a saída dentro do `state` (§A.3). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `5cbadcc`, segurança, média-baixa] Um vizinho NOVO do carro solto,
   nascido do QUIQUE.** Com o quique arrancado (mutante `SEMquique`) ele não existe.
   Exige cliente modificado. Medido no servidor de verdade. Detalhe **fora do
   repo**. O teste do construtor que deveria pegá-lo passa por cenário (família 9 do
   CLAUDE.md, "cenário que não exercita o limiar").
2. **[NC — `f672d81`, baixa] Bala parando no ar rente às peças novas.** (a) Debaixo
   do totem: a caixa assenta 0,44 m abaixo da base desenhada, e a base fica 4,4 e
   14 cm acima do chão em duas quinas — 71 de 6 009 retas param na fresta antes de
   qualquer malha (CLAUDE.md: "caixa de bala MAIOR que o desenho é bala parando no
   ar"); o painel não tem isso porque o desenho dele É a caixa. (b) Nas quinas das
   caixas do canhão: os fatores do `CILINDRO` são de um CÍRCULO, e a carreta e a
   roda são polígonos de 20 e 16 lados — as quinas passam do desenho em até 2,2 cm
   (12 de 3 668 retas; a pior, rasante ao topo da roda). Reprodução: reta de
   (−333,57; 3,12; −201,40) a (−347,05; 4,21; −197,75) — para a 6,11 m, o relevo
   desenhado só a 6,91 m; e (−256,84; 6,07; 345,02) → (−243,62; 2,30; 347,68): para
   a 5,25 m, a 1ª malha (o cano) a 6,00 m. `test/atracoes-bala` mede retas
   horizontais entre 15 % e 86 % da altura de cada malha, pelos 4 eixos: não passa
   pela fresta nem pelas quinas oblíquas.
3. **O canhão ainda mostra o que a bala atravessa (correção que não fechou tudo).**
   154 de 364 pares que a malha do canhão tampa: o cano (141 — fica de fora por
   decisão declarada: gira), o aro dourado das rodas (8: é fixo, e fica fora da
   caixa da roda) e a borda de baixo da carreta (3, mais 2 que são erro da minha
   âncora: o feixe translúcido do farol; o tronco de cone alarga até r 1,75 e as
   caixas são do r 1,55). Antes: 361 de 364.
4. **Segurança — o carro solto** (os resíduos que o briefing declarou não mexidos
   seguem; um resíduo do método dos cantos). Detalhe **fora do repo**.
5. **Faixa de 0,45 m acima de peça de corpo** (observação 7 de r8): +25 colunas no
   totem de fogos (nasceu com o totem virando corpo e piso); 36 no painel e 271 nos
   tocos da cidade destruída já existiam e não tinham sido medidos.
6. **Atrás de muro de 1,70–1,82 m, o alto da cabeça** (r8, item 5) e **agachado
   atrás de poste** ([NC] 2 de r8): iguais a r8 nos pares de `r9-invis` ("a tela
   mostra a cabeça e a vítima recusa": 89; poste: 16).
7. Inalterados: **P1**, **C11**, **C1(e)**, **E9**.

**Observações sem veredito:** (a) **a beira da saia do vulcão segue muralha** e
(c) **o carro segue no relevo dentro da rocha do vulcão** enquanto alguém dirige —
não remedidos (código intocado); (b) dos laudos 5–8 (**a pilha dos fogos e o
canhão vermelho sem colisor de bala**) **sai**: o totem e a carreta seguram bala
(itens 2–3 acima para o que sobrou); (d) **o curso de argolas não completa pelo
canhão** (3 de 5; a 5ª a 55 m, o voo pousa a 54) — igual sem as caixas novas;
(e) **o gzip quase não reduz a bazuca** (9,2 MB, −4 %).

**Contagem:** 4 critérios reprovados (os mesmos de r8); **0 nasceu de correção
desta rodada**; **2 defeitos novos nasceram de correções** (itens 1–2; 1 de
segurança); **1 correção não fechou tudo** (item 3).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| só o acabamento volta a sustentar (`ACABpiso`, laudo 8) | não refeita nesta rodada (r8: 75 colunas "a pé" com pose legítima) | `security-regression`: **1 vermelho em 38** (r8: 0) |
| laje não é corpo do carro solto (`LAJEcorpo`, laudo 8) | `r9-seg`: subir pelas lajes **1 de 4** (árvore 0) | `veiculo-vida-servidor`: **1 vermelho em 15** (r8: 0) |
| sem o interior da Torre no chão (`SEMtorre`) | escada **4 795 de 30 175**; servidor: "piloto" em **4 de 4** na faixa (árvore 0; 0 de 4) | `security-regression`: 1 vermelho |
| sem o quique (`SEMquique`) | sonda de segurança: o [NC] 1 some (números fora do repo); `r9-salto`: **0** recusa (árvore 0) | `veiculo-vida-servidor`: 1 vermelho ("o pulo que QUICA") |
| parábola só do último pacote no chão (`TETOt0`) | `r9-salto`: **0** recusa (árvore 0) — não avermelha | **0 vermelhos** (15 + 3) |
| subida pelo deslocamento, a regra de r8 (`VYdesloc`) | `r9-salto`: **29 recusas** (árvore 0) | não rodado |
| parede pela reta do centro (`CENTRO`) | porta da Torre: o caso de r8 **entra de novo** (árvore: não entra) | `veiculo-vida-servidor`: 1 vermelho |
| `largar` ignorado (`LARGARignorado`) | `r9-posse`: `solto` do tique **0 de 6** (árvore 8 de 8) | `veiculo-vida-servidor`: 1 vermelho; `carro-solto`: 0 |
| `carFree` antes do `playerUpdate` (`CARFREEantes`) | `r9-posse`: `playerUpdate` do tique **perdido em 6 de 6** | `veiculo-vida-servidor`: 1; `carro-solto`: 1 vermelho |
| o totem só desenho (`SEMtotem`) | pares: a bala passa em **433 de 434** (árvore 0); o carro atravessa | `atracoes-bala`: 1 vermelho; `bots-paredes` e `paredes-paridade`: 0 |
| o canhão só desenho (`SEMcanhao`) | pares: **361 de 364** (árvore 154); o carro atravessa; o voo igual (54 m, 3) | `atracoes-bala`: 2 vermelhos; `bots-paredes`: 0 |
| as peças do canhão com corpo (`CANHAOcorpo`, o avesso) | o jogador para a **1,92–2,10 m** do centro (árvore: entra, 0,16 m) | `cannon`: 1 vermelho; `atracoes-bala`: 0 |

**Todo mutante avermelha alguma sonda minha, MENOS `TETOt0`; um não avermelha
nenhum teste do construtor (`TETOt0`).** O que os testes não medem, e que esta
rodada achou:

- **O vizinho novo do quique** ([NC] 1): o teste do construtor que trata do caso
  não o exercita (detalhe fora do repo).
- **A janela de meio segundo da decolagem** (`TETOt0`): nenhum teste e nenhuma das
  7 saídas reais dependem dela no servidor local (sem jitter de rede). Mecanismo
  sem prova de efeito.
- **A fresta sob o totem e as quinas do canhão** ([NC] 2): o teste mede retas
  horizontais no meio da altura, pelos 4 eixos.
- **O cano, o aro dourado e a borda da carreta** (item 3): o teste testa só as
  três malhas nomeadas, e a reta que "cruza o miolo" só vale se a 1ª malha é ela.
- **`bots-paredes`/`paredes-paridade` não pegam `SEMtotem`/`SEMcanhao`:** o mutante
  muda o módulo único, e cliente e bot continuam iguais entre si (é o que eles
  medem). A âncora é a malha (`atracoes-bala` e a minha).
- **As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **[NC] 1 — segurança** (fora do repo): nasceu desta leva, e o teste que devia
   pegá-lo não exercita o caso.
2. **§4 item 4 — segurança do carro solto** (fora do repo): os resíduos declarados.
3. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
4. **Item 3 — o canhão** (o aro e a borda da carreta são consertáveis; o cano é
   decisão) e **[NC] 2** (fresta sob o totem; fatores de polígono no `CILINDRO`).
5. **[NC] 2 de r8** — o avesso na tela (poste).
6. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
