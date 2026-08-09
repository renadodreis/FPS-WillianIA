# Validação medida da rodada de celular

Data: 2026-08-08. Branch: `refatoracao`. Base de comparação: `HEAD` = 13b3552.

Este documento é do **validador**. Ele não conserta nada: mede, e separa o que
foi medido do que é inferência. Onde não deu para medir, está escrito
**NÃO MEDIDO** com o motivo.

## Aviso sobre o que este ambiente pode e não pode medir

Todas as medições de render rodaram em Chrome headless com
`--use-angle=swiftshader`, ou seja, **rasterizador de software**.

- **FPS medido aqui NÃO prevê FPS de celular.** O frame p50 observado ficou
  entre 640 ms e 860 ms (≈1,2–1,6 FPS em swiftshader). Esse número é
  propriedade do rasterizador de software da máquina de teste e **não é
  transferível para GPU móvel**. Ele não aparece em nenhuma conclusão abaixo.
- **O que É transferível e foi medido:** draw calls, triângulos, passes de
  pós-processamento, estado da sombra, substeps de física, CPU de simulação
  (`perf.simMs`, que exclui `composer.render()` e `csm.update()`), bytes e
  requisições de rede, e VRAM de textura dos GLB.
- Draw calls foram lidos com a **mesma técnica do `js/perfhud.js`**
  (`renderer.info.autoReset = false` + `info.reset()` no começo do frame). Uma
  leitura ingênua com `EffectComposer` descreve só o último passe e mente. Os
  números da amostragem batem com o texto do próprio overlay.
- **Ruído de execução única:** repetindo o mesmo cenário, `sim p90` variou até
  ±44 % e draw calls até ±8 %. Neste relatório, **diferença abaixo de ~10 % em
  uma única execução é tratada como ruído**, não como sinal.

---

## 1. Veredito

> **Sim, com ressalva grande.** A camada de toque e o preset de celular estão
> ligados, corretos e o desktop não regrediu — mas **o corte feito nesta rodada
> não é o que decide 60 FPS em Adreno 6xx / Mali-G57**. Os dois maiores custos
> estruturais continuam intactos: **169 draw calls de grama** (inalterados) e
> **198,6 MB de textura RGBA8** sem compressão de GPU, sendo **108 MB de uma
> única arma**. Jogável: provavelmente sim. 60 FPS travados: **não com o estado
> atual**.

---

## 2. Suíte de testes

`npm run lint` → **limpo** (saída vazia, exit 0).

`npm test` (`scripts/run-tests.js`, sequencial, `--test-concurrency=1`):
**92 arquivos, 219 suítes de topo, 8 arquivos falharam** no passe principal.

### Contaminação declarada

O passe principal rodou enquanto **outros agents da mesma sessão executavam
Chrome e `node server.js` no mesmo repositório** (o scratchpad é compartilhado:
`tests1.log` com `collision.test.js` às 08:51, `worldfp.js` subindo servidor na
porta 3290 às 08:55), e eu mesmo rodei um smoke de medição às 08:48. Os testes
de browser usam **portas fixas**. Portanto **as falhas do passe principal não
são evidência de regressão** — só a re-rodada isolada vale, que é exatamente o
protocolo do `CLAUDE.md`.

Além disso a suíte **travou** em `br-flags-novas.test.js` por ~15 min sem
consumir CPU (ver bug B3 na seção 6); destravei matando **só aquele PID filho**
(3419458, confirmado `ppid = 3416318`, o meu próprio runner). O processo do
runner foi encerrado mais tarde durante a triagem, então **completei à mão a
triagem dos 3 arquivos que faltavam, com a máquina ociosa**, usando o mesmo
protocolo (2 passes isolados consecutivos = FLAKE).

### Triagem, arquivo por arquivo

| Arquivo | Erro no passe principal | Rodadas isoladas | Veredito |
|---|---|---|---|
| `br-death-cause.test.js` | `Waiting failed: 3000ms exceeded` | passou, passou | **FLAKE** |
| `br-flags-novas.test.js` | `Waiting failed: 30000ms exceeded` (hook) | passou, passou | **FLAKE** |
| `br-late-join-flags.test.js` | `Navigation timeout of 30000 ms exceeded` | passou, passou | **FLAKE** |
| `car-terrain-traversal.test.js` | `Waiting failed: 90000ms exceeded` (hook) | passou, passou | **FLAKE** |
| `castle-layout.test.js` | `Waiting failed: 90000ms` + `decoração visível atravessa o castelo` | falhou, passou, passou | **FLAKE** (ver nota) |
| `collision.test.js` | `Waiting failed: 90000ms exceeded` | passou, passou | **FLAKE** |
| `latency.test.js` | `dano nunca chegou com 240ms de RTT` | falhou, passou, passou | **FLAKE** |
| `city-destruction-client.test.js` | `cinemática solo nunca ligou` | **falhou, falhou, falhou** | **FALHA REAL — mas PRÉ-EXISTENTE** |

Saída da triagem que eu mesmo executei, com a máquina ociosa:

```
  -> city-destruction-client (isolado, rodada 1) ... FALHOU
  -> city-destruction-client (isolado, rodada 2) ... FALHOU
  -> city-destruction-client (isolado, rodada 3) ... FALHOU
  REGRESSAO REAL: city-destruction-client.test.js
  -> collision (isolado, rodada 1) ... PASSOU
  -> collision (isolado, rodada 2) ... PASSOU
  FLAKE: collision.test.js
  -> latency (isolado, rodada 1) ... FALHOU
  -> latency (isolado, rodada 2) ... PASSOU
  -> latency (isolado, rodada 3) ... PASSOU
  FLAKE: latency.test.js
```

As 5 primeiras linhas de veredito vieram do próprio runner:

```
  FLAKE: br-death-cause.test.js
  FLAKE: br-flags-novas.test.js
  FLAKE: br-late-join-flags.test.js
  FLAKE: car-terrain-traversal.test.js
  FLAKE: castle-layout.test.js
```

### A única falha determinística NÃO é desta rodada

`city-destruction-client.test.js` falha **3 de 3** vezes isolado, sempre com a
mesma mensagem:

```
not ok 1 - dado o jogo solo, então o evento local roda a cinemática e destrói a cidade
  error: 'cinemática solo nunca ligou'
  expected: true / actual: false
  location: test/city-destruction-client.test.js:341:3
```

Rodei **o mesmo arquivo no worktree de `HEAD`** (13b3552, sem nenhuma mudança
desta rodada):

```
EXIT HEAD rodada1 = 1
      error: 'cinemática solo nunca ligou'
not ok 4 - Modo solo — evento local de destruição sem servidor
```

**Falha idêntica em `HEAD`.** Logo é uma quebra pré-existente do branch, **não
uma regressão introduzida pela rodada de celular**. Continua sendo um bug real
que precisa de dono.

Nota sobre `castle-layout`: ele falhou **uma vez também isolado**, antes de
passar duas seguidas — é um flake mais frágil que os outros. A asserção
"decoração visível atravessa o castelo" foi **cascata** do subteste anterior,
que estourou 90 s de espera e deixou a página em estado sujo; não é divergência
de worldgen.

### Raio de impacto do `test/helpers/harness.js` (o risco de regressão em massa)

Verificado mecanicamente, não por leitura:

```
arquivos de teste que usam bootGame:  54
chamadas totais de bootGame:          66
que passam query: ou viewport:         1   (test/touch-controls.test.js:79)
```

Os 65 outros pontos de chamada recebem `query = ''` e `viewport = null`, e com
`query = ''` a URL `` `http://localhost:${port}/${query}` `` é byte a byte a
mesma de antes. A mudança é **provadamente aditiva**.

---

## 3. Medições A / B / C / D

Preset `mobile` = `{ res: 1, shadow: 0, bloom: 0, aa: 0 }` + `MOBILE_CFG`
(`VIEW_DIST` 200, `GRASS_LOD_RING` 1) + `PHYSICS_MAX_STEPS` 2.
Viewport de celular = 844×390 @ DPR 2 (iPhone 14 deitado). CPU sob
`Emulation.setCPUThrottlingRate: 4`.

### A) Desktop vs preset mobile

Rodei **dois** cenários de mobile de propósito: um no **mesmo viewport** do
desktop (isola o efeito do preset) e um no **viewport real de celular** (isola o
efeito do frustum). A diferença entre os dois é o achado mais importante da
seção.

| Métrica (cpu 4×) | A1 desktop `tier=alto` | A2 desktop auto | A3 mobile, viewport de desktop | A4 mobile, viewport de celular |
|---|---|---|---|---|
| tier aplicado | `alto` | `baixo` | `mobile` | `mobile` |
| sombra | ligada | ligada | **desligada** | **desligada** |
| passes de pós ativos | Render, **UnrealBloom**, **SMAA**, Output | Render, Output | Render, Output | Render, Output |
| `VIEW_DIST` / névoa fecha | 420 / 210 m | 420 / 210 m | 200 / **100 m** | 200 / **100 m** |
| **draw calls (p50)** | 312 | **309** | **265** (−14,2 %) | **331 (+7,1 %)** |
| **triângulos (p50)** | 894 253 | **900 105** | **582 589** (−35,3 %) | **629 957 (−30,0 %)** |
| **CPU sim p50** | 15,4 ms | **14,5 ms** | **8,2 ms** (−43,4 %) | **8,1 ms (−44,1 %)** |
| CPU sim p90 | 19,7 ms | 18,8 ms | 13,2 ms (−29,8 %) | 16,0 ms (−14,9 %) |
| substeps de física | 3 | 3 | **2** | **2** |
| draw calls de grama | **169** | **169** | **169** | **169** |
| triângulos de grama | 1 005 000 | 1 005 000 | **715 560** (−28,8 %) | **715 560** (−28,8 %) |

**O preset mobile NÃO reduz draw calls num celular de verdade — ele aumenta.**
No viewport de desktop (4:3) o corte tira 14 % de draw calls; no viewport real
de celular deitado (844×390, proporção 2,16:1) o resultado é **+7,1 % contra o
desktop** (309 → 331). O frustum de paisagem larga descarta menos objetos
lateralmente do que o `VIEW_DIST` 200 corta em profundidade. Quem olhar só para
o número do viewport de desktop conclui o contrário do que acontece no aparelho.

Três ressalvas de honestidade:
1. Os −44 % de CPU de simulação **incluem** a queda de 3 para 2 substeps de
   física. Parte do ganho é "fazer menos física por frame", não "mundo mais
   barato". Num aparelho real a 60 FPS os dois rodariam 1 substep e essa parcela
   do ganho desaparece.
2. `res: 1,5` do tier `alto` **nunca mordeu** nesta medição: o headless tem
   `devicePixelRatio = 1`, então `pixelRatioCeiling()` devolveu 1 nos quatro
   cenários. O `res: 1` do preset mobile é, ainda assim, a maior economia real
   de celular (num aparelho DPR 3 ele corta a contagem de pixels em 9×) —
   **inferência, não medição**, porque este ambiente não tem DPR > 1.
3. `A2` (auto) caiu em `tier=baixo` porque o swiftshader é classificado como
   "rasterizador de software". Por isso medi `A1` com `?tier=alto` à força: é o
   único cenário com bloom e SMAA ativos, e serve de baseline do preset real de
   desktop.

### B) `VIEW_DIST` 200 vs 300 — a decisão do dono

Patch cirúrgico em `js/config.js`, medido, e arquivo devolvido. Restauração
verificada por sha256, não por confiança:

```
sha original:   d6cbd4942bd2f976168b768b082fcda0aad948aa2477f59af5978c42f845fd1f
sha restaurado: d6cbd4942bd2f976168b768b082fcda0aad948aa2477f59af5978c42f845fd1f
RESTAURADO IDENTICO
```

| Métrica (preset mobile, viewport de celular) | `VIEW_DIST` 200 | `VIEW_DIST` 300 | delta |
|---|---|---|---|
| névoa fecha em | **100 m** | **150 m** | +50 % de alcance visual |
| draw calls p50 (cpu 1×) | 316 | 320 | +1,3 % |
| draw calls p50 (cpu 4×) | 325 | 310 | −4,6 % |
| triângulos p50 (cpu 4×) | 628 733 | 624 881 | −0,6 % |
| CPU sim p50 (cpu 1×) | 2,5 ms | 2,5 ms | 0,0 % |
| CPU sim p50 (cpu 4×) | 7,8 ms | 9,6 ms | +23,1 % |
| CPU sim p90 (cpu 4×) | 14,9 ms | 15,5 ms | +4,0 % |

**Leitura para a decisão: subir para 300 é praticamente de graça.** Draw calls e
triângulos não se movem (as duas medidas de draw call têm sinais opostos, e os
triângulos caem 0,6 % — tudo dentro do ruído). O único número que se mexeu foi
`sim p50` sob throttle 4× (+23 %), e ele **se contradiz**: no mesmo cenário sem
throttle o delta é 0,0 % e o p90 sobe só 4 %. Se o custo fosse real, apareceria
nas duas taxas.

Motivo estrutural do resultado: `VIEW_DIST` só alimenta `scene.fog`,
`camera.far` e o corte de LOD de árvore (`game.js:705,721`). O mapa tem 1100 m
de lado e o raio da grama é independente — por isso esticar de 200 para 300 quase
não muda o que entra no frustum.

**Recomendação medida:** `VIEW_DIST` 200 fecha a névoa em 100 m enquanto sniper
e DMR têm alcance validado no servidor bem acima disso. O preço medido de
desfazer essa desvantagem competitiva é ~0. Se o dono quiser 300, o número não
se opõe. *(Uma execução por configuração; para fechar questão, repetir 3×.)*

### C) Peso de boot em rede

| | valor |
|---|---|
| **Bytes totais até tudo carregar** | **19,43 MB** |
| **Requisições** | **191** |
| **Só GLB** | **23 arquivos, 17,83 MB — 92 % do total** |
| Script (JS) | 1,53 MB |
| CSS + HTML | 0,07 MB |
| Tempo até o mundo montar (menu jogável), 4G 9 Mbps/40 ms | **9,6 s** |
| Piso teórico de transferência a 9 Mbps | **18,1 s** |

Maiores arquivos: `wooden_barrel.glb` 2691 KB, `low-poly_Arma_do_Alien.glb`
1862 KB, `low_poly_tree_log_and_stump.glb` 1348 KB, `low_poly_tree_house.glb`
1292 KB, `alien.optimized.glb` 1206 KB, `low-poly_Sniper_lenta_forte.glb`
1130 KB.

**O preset mobile não muda nada disto**: numa execução anterior, desktop e
mobile pediram exatamente as mesmas 157 requisições / 8,10 MB no mesmo instante
de corte. Celular baixa os mesmos 19,43 MB que o desktop.

*Precisão declarada:* o instante exato de "tudo carregado" **não foi medido**. O
socket.io mantém um WebSocket permanentemente em voo, então a condição "zero
requisições pendentes" nunca fica verdadeira e o detector bateu no teto de 300 s.
Os 19,43 MB / 191 requisições são contagem completa e confiável
(`Network.loadingFinished.encodedDataLength`, bytes de fio com cabeçalho); o
tempo total é **limitado por baixo** em 18,1 s pela banda.

### D) Os dois modos

- **Mundo aberto (`game.js`)**: medido em todos os cenários acima.
- **Battle royale (`br-game.js`)**: **NÃO MEDIDO.** A medição foi disparada com
  `startBRMatch` do `test/helpers/harness.js`, mas não terminou dentro do
  orçamento de tempo desta sessão (cada cenário BR exige boot completo + bot-host
  + espera de plano de partida, sobre um render de swiftshader a ~650 ms/frame).
  O que dá para dizer com o que foi medido: o BR compartilha `game.js`, o mesmo
  mundo, a mesma grama (169 chunks) e o mesmo preset; o BR **acrescenta** por
  cima disso avatares remotos, baús, zona e nave. Portanto os números da tabela A
  são **piso** para o BR, nunca teto.

---

## 4. Não-regressão do desktop

### 4.1. Computed style — reproduzido, não aceito de graça

O agent de HUD afirmou ter comparado computed style contra `HEAD` em 3
resoluções. Reproduzi de forma independente com um probe **só de DOM + CSS**
(sem WebGL, sem worldgen), servindo `index.html` + `style.css` das **duas
árvores** e comparando **todas** as propriedades de `getComputedStyle` mais o
`getBoundingClientRect` de **cada** elemento.

Detalhe que precisou de correção: a primeira rodada acusou 14 propriedades e 90
retângulos diferentes — era **animação de entrada do menu** amostrada em quadros
diferentes. Congelando com `prefers-reduced-motion: reduce` (bloco que já existe
nas duas árvores), o resultado ficou determinístico:

| ponteiro | resolução | elementos HEAD → agora | propriedades diferentes | retângulos diferentes |
|---|---|---|---|---|
| `fine` (mouse) | 1920×1080 | 213 → 239 | **0** | **0** |
| `fine` (mouse) | 1366×768 | 213 → 239 | **0** | **0** |
| `fine` (mouse) | 2560×1440 | 213 → 239 | **0** | **0** |
| `coarse` (tela de toque) | 1920×1080 | 213 → 239 | **66** | **72** |
| `coarse` (tela de toque) | 1366×768 | 213 → 239 | **83** | **74** |
| `coarse` (tela de toque) | 2560×1440 | 213 → 239 | **66** | **72** |

**Com mouse, a afirmação do agent de HUD confere: zero diferença nas três
resoluções.** Os 26 elementos novos são `#touchUI` (com `#tcLook`, `#tcMove`,
`#tcMoveKnob`, `#tcBtns` e os 11 botões) e `#rotateGate`, todos nascendo
`display: none`.

**Mas o critério 3 do `docs/2026-08-08-mobile.md` — "nenhum seletor CSS novo
valendo sem `html.mobile`" — é falso como está escrito.** Num aparelho cujo
ponteiro primário é grosso (all-in-one / notebook com tela de toque), em
resolução de desktop e **sem** a classe `.mobile`, o layout muda. Os elementos
atingidos:

```
#minimapWrap, #minimap, #mission, #invPanel, #banner, #deathTitle,
#btnSettings, #btnCtl, #btnBack, #setVol, #setRes, #setShadow,
#setBloom, #setAA, #setAutoRes, #setPing  (+ #panel/#menuBtns/#ctlBox por refluxo)
```

A atribuição é exata, não estatística — os valores batem casa decimal com as
regras novas de `@media (pointer: coarse)`:

- `#invPanel max-height: 799,2px` = `74vh` de 1080 ✔
- `#banner max-width: 660px` = `min(92vw, 660px)` ✔
- `#banner line-height: 47,04px` = `1.12 × 42px` ✔
- `.mbtn.sec min-height: 48px`, `padding-block: 16px` (botão 47px → 49px) ✔

Isso é **comportamento deliberado e documentado no próprio CSS** ("rede de
segurança caso o JS não rode"). Não é bug — é o **critério de aceite que está
errado**, e deve ser corrigido no documento em vez de fingir que o bloco não
existe.

### 4.2. Perf do desktop: worktree de `HEAD` vs árvore de trabalho

Worktree criado com `git worktree add ... HEAD --detach` (sem `stash`, sem
commit, sem descartar trabalho; `git status` conferido antes e depois).

| Métrica (cpu 4×, desktop, sem `?mobile=1`) | HEAD | agora | delta |
|---|---|---|---|
| draw calls p50 (auto/`baixo`) | 297 | 309 | +4,0 % *(ruído)* |
| triângulos p50 (auto/`baixo`) | 900 073 | 900 105 | **+0,0 %** |
| CPU sim p50 (auto/`baixo`) | 14,5 ms | 14,5 ms | **0,0 %** |
| CPU sim p90 (auto/`baixo`) | 19,4 ms | 18,8 ms | −3,1 % |
| draw calls p50 (`tier=alto`) | 322 | 312 | −3,1 % *(ruído)* |
| triângulos p50 (`tier=alto`) | 876 105 | 894 253 | +2,1 % *(ruído)* |
| CPU sim p50 (`tier=alto`) | 14,9 ms | 15,4 ms | +3,4 % *(ruído)* |

E, o que é mais forte que os tempos, **os invariantes de cena saíram idênticos**:

| | HEAD | agora |
|---|---|---|
| `VIEW_DIST` | 420 | 420 |
| sombra | ligada | ligada |
| triângulos de grama | 1 005 000 | 1 005 000 |
| draw calls de grama | 169 | 169 |
| substeps de física | 3 | 3 |
| tier resolvido | `baixo` / `alto` | `baixo` / `alto` |

**Veredito: nenhuma regressão de desktop detectável.** Os deltas de tempo têm
sinais alternados e ficam dentro do ruído de execução única (que medi em até
±44 % no p90); os números estruturais, que não têm ruído, são iguais.

---

## 5. O alvo de 60 FPS em Adreno 6xx / Mali-G57

**Veredito: implausível com o estado atual.** Separando com clareza:

### O que é MEDIÇÃO

1. Numa tela de celular deitado, o preset mobile entrega **331 draw calls**, que
   é **mais** que os 309 do desktop.
2. **169 dessas draw calls são grama**, um `InstancedMesh` por chunk, e o preset
   mobile **não mexeu nisso** — 169 antes, 169 depois. É **51 % de todas as draw
   calls do frame**.
3. A cena tem **~630 mil triângulos** no preset mobile, dos quais **715 560 de
   grama** no total do patch (a diferença é frustum culling).
4. O `GRASS_LOD_RING` cortou **28,8 %** dos triângulos de grama (1 005 000 →
   715 560) e **0 %** das draw calls dela.
5. Os GLB carregados trazem **68 imagens embutidas, 8,12 MB comprimidas, que
   viram 198,63 MB de RGBA8** (264,85 MB com mipmap). **Nenhum KTX2/Basis/Draco
   no repositório inteiro** (`grep` sem nenhum resultado).
6. **`bazooka.optimized.glb` sozinho: 768 KB no fio, 27 texturas de 1024×1024,
   todas referenciadas pelos seus 9 materiais → 108 MB de RGBA8 (144 MB com
   mipmap).** Verificado percorrendo os materiais do glTF, não estimado.
7. Boot: **19,43 MB / 191 requisições**, 92 % em GLB.
8. Sombra sai (0 passes de sombra) e o pós fica em Render + Output no preset
   mobile — isso está correto e é o que o documento prometeu.

### O que é INFERÊNCIA

- 331 draw calls por frame é **viável** em Adreno 6xx / Mali-G57 a 60 FPS: o
  gargalo dessas GPUs raramente é contagem de draw call nessa ordem de grandeza.
- **~630 mil triângulos a 60 Hz = ~38 milhões de triângulos/s.** Isso é
  agressivo, mas não impossível, para geometria sem textura. O problema é que a
  grama é *alpha/vertex-shader pesado* e roda em arquitetura tile-based.
- **O bloqueio provável não é geometria, é MEMÓRIA.** 198 MB de textura RGBA8
  (265 MB com mipmap) num aparelho de gama média com RAM compartilhada é onde eu
  esperaria perda de contexto WebGL, thrashing ou engasgo brutal de upload — e o
  pico de 144 MB do lançador de foguetes acontece **no primeiro frame em que a
  arma aparece**, não diluído.
- **Nada disto foi confirmado em aparelho real**, porque este ambiente é
  swiftshader. É a inferência mais carregada do documento e deveria ser a
  primeira coisa a checar num telefone de verdade.

**Conclusão:** o corte desta rodada é correto no que fez (sombra, pós, `res: 1`,
substeps, LOD de lâmina) e não chega perto de ser suficiente para 60 FPS
travados. O degrau "30 FPS bonito" citado no plano é, hoje, o alvo realista.

---

## 6. Próximos gargalos, em ordem de custo medido

| # | Gargalo | Número medido | Por que é o próximo |
|---|---|---|---|
| 1 | **Textura sem compressão de GPU** | 68 imagens → **198,63 MB RGBA8** (264,85 MB com mipmap); 0 arquivos KTX2/Basis no repo | Maior número do relatório por uma ordem de grandeza. KTX2/ETC2/ASTC cortaria isso em 4–8×. |
| 2 | **`bazooka.optimized.glb`** | **27 × 1024² = 108 MB RGBA8**, num arquivo de 768 KB | Um item isolado é 54 % do total. "optimized" comprimiu o fio, não a VRAM. Atlas ou redução para 256² resolve sozinho metade do problema. |
| 3 | **169 draw calls de grama** | 169 de 331 = **51 % do frame**; inalterado pela rodada | O `GRASS_LOD_RING` cortou triângulo e **nenhuma** draw call. Fundir chunks distantes num só `InstancedMesh` é o corte que falta. |
| 4 | **19,43 MB de boot, 92 % GLB, 8 armas em paralelo** | 191 requisições; piso de 18,1 s a 9 Mbps | Em 4G o jogador espera ~20 s sem barra de progresso real. Carregar a arma equipada primeiro e o resto sob demanda é a maior vitória por esforço. |
| 5 | **715 560 triângulos de grama** | 28,8 % já cortados; ainda ~68 % do total da cena | Depois de 1–3, é o que sobra. Preso pelo contrato do PRNG seedado — só dá para mexer em geometria, não em quantidade. |

---

## 7. Bugs e inconsistências encontrados

**B1 — `MAX_PIXEL_RATIO` é chave morta.** `js/config.js:28` define
`MAX_PIXEL_RATIO: 2` e **nada no repositório lê** (`grep -rn MAX_PIXEL_RATIO`
devolve só a definição). O `docs/2026-08-08-mobile.md:126` lista
`MAX_PIXEL_RATIO` entre os "knobs de mundo" do corte de celular — o documento
promete um controle que não existe. Quem limita o pixel ratio de verdade é
`SETTINGS.res` via `pixelRatioCeiling()` (`game.js:316-322`).

**B2 — critério de aceite 3 do plano é falso.** Ver §4.1: o bloco
`@media (pointer: coarse)` de `style.css:859-874` altera 66–83 propriedades
computadas em resolução de desktop **sem** `html.mobile`. Cenário concreto:
all-in-one com tela de toque, 1920×1080, mouse não usado → `#btnSettings` sai de
47 px para 49 px, `#banner` ganha `max-width: 660px` e `#invPanel` ganha
`overflow: hidden` com `max-height: 799,2px`. É intencional segundo o comentário
do CSS; o texto do plano é que precisa mudar.

**B3 — `startWithFlags` vaza socket e trava a suíte inteira.**
`test/br-flags-novas.test.js:18` cria `bot = io(...)`; a linha 26 faz
`h.page.waitForFunction(..., { timeout: 30000 })`. Não há `try/finally`. Quando
essa espera estoura (o que acontece sob carga), a função lança **antes** de
devolver `bot`, então o `after` das linhas 42/67/101 vê `bot === undefined` e nunca
chama `bot.close()`. O `socket.io-client` fica com reconexão ligada, o event loop
do processo filho **nunca drena**, e `node --test` fica pendurado
indefinidamente. Observado: processo 3419458 vivo por 15 min com 0,2 % de CPU,
estado `Sl`, sem processos filhos, depois de já ter reportado os 3 describes.
Efeito: um flake de timeout vira **suíte travada para sempre** em vez de falha.
Comparar com `test/helpers/harness.js:startBRMatch`, que faz exatamente o
`try/catch { bot.close() }` que falta aqui.

**B4 — `#invPanel` no celular não recebe toque.** `index.html:48` coloca
`#invPanel` dentro de `#hud`, e `style.css:29` define `#hud { pointer-events:
none }`. Medido no aparelho emulado: `getComputedStyle(#invPanel).pointerEvents
=== "none"`. O CSS novo (`style.css:781`) reposiciona o painel para a esquerda
com `z-index: 70`, ou seja, ele **cobre** os controles de toque mas **não aceita
o dedo**. Cenário: jogador abre o inventário pelo botão `INV`, tenta tocar uma
linha do inventário → o toque atravessa o painel. Além disso o título continua
escrito `INVENTÁRIO [TAB]` (`index.html:48`), tecla que não existe no celular —
o mesmo tipo de texto que foi corrigido para o velocímetro em `game.js:1185`,
mas não aqui.

**B5 (NÃO CONFIRMADO — precisa de aparelho real).** Hipótese: toque na área nua
do canvas dispara a arma. O caminho existe no código —
`game.js:1123-1127` escuta `mousedown` na `window` e só checa
`!state.started || state.paused`, sem olhar tipo de ponteiro; e quem chama
`preventDefault()` no `pointerdown` é apenas `#tcLook` (metade **direita**),
`#tcMove` e `#tcBtns` (`js/touchcontrols.js`). Navegador móvel emite `mousedown`
de compatibilidade em todo toque não prevenido.
**Medido e confirmado:** com o lobby dispensado, **47,1 % da tela de 844×390 é
canvas nu** (`elementFromPoint` numa grade de 8 px: 2424 pontos em `canvas#game`,
2024 em `#tcLook`, 524 em botões, 173 em `#tcMove`) — inclui o HUD inteiro, que é
`pointer-events: none`.
**NÃO confirmado:** não consegui gerar um único evento de mouse de
compatibilidade neste ambiente, nem com `Input.dispatchTouchEvent` nem com
`Input.synthesizeTapGesture` (espião em `window` registrou `[]` nas três
posições, e a munição ficou em 30/30). Chrome headless não roda o
reconhecedor de gesto que produz esses eventos. **Ausência de sinal aqui não é
prova de ausência do bug** — checar em telefone real tocando a metade esquerda
da tela em partida e olhando se a munição cai.

---

## 8. O que ficou NÃO MEDIDO, e por quê

1. **Battle royale (`br-game.js`)** — cenário disparado, não concluído dentro do
   tempo da sessão (boot + bot-host + plano de partida sobre render de software a
   ~650 ms/frame). Os números da tabela A são piso, não teto, para o BR.
2. **FPS real em GPU móvel** — impossível neste ambiente por definição
   (swiftshader). Nenhuma conclusão do documento depende de FPS.
3. **Ganho do `res: 1` em tela HiDPI** — `devicePixelRatio` do headless é 1,
   então o teto de pixel ratio nunca mordeu. O ganho de 9× num aparelho DPR 3 é
   inferência aritmética, não medição.
4. **Instante exato de "tudo carregado" em 4G** — o WebSocket do socket.io fica
   permanentemente em voo e o detector de rede parada nunca fecha. Bytes e
   requisições são exatos; o tempo total está limitado por baixo em 18,1 s.
5. **B5 (toque no canvas dispara arma)** — ver §7: o ambiente não gera eventos de
   mouse de compatibilidade.
6. **Piso adaptativo de 0,5 em ação** — `MOBILE_RES_FLOOR` está corretamente
   ligado (`createResolutionScaler` aceita `floor` via `{...DEFAULTS,
   ...options}`, verificado em `js/adaptivequality.js:38-46`), mas o scaler só
   desce quando o gargalo é **render**, e em swiftshader o render domina de um
   jeito que não representa celular. Não exercitei a descida.
7. **Uma execução por configuração.** Nada aqui é média de repetições. Onde o
   número era pequeno em relação ao ruído medido (±10 %), está marcado como
   ruído em vez de virar conclusão.

---
---

# Medição final (pós-correções)

Data: 2026-08-08, sessão da tarde. Branch: `refatoracao`, árvore de trabalho
(mesmo `HEAD` = 13b3552 como base de comparação). Máquina **ociosa** — nenhum
outro agent rodando, nenhuma porta fixa disputada, um cenário por vez.

Tudo abaixo é execução nova. Onde o número contradiz a medição da manhã, o
motivo está escrito. **Mesmo ambiente de software (`--use-angle=swiftshader`),
mesmas ressalvas do topo do documento: FPS daqui continua não sendo
transferível e não aparece em nenhuma conclusão.**

## F0. Achado que muda como se lê TODO este documento

**A contagem de draw calls deste jogo depende fortemente de há quanto tempo o
mundo está simulando** — mais do que de qualquer opção de qualidade medida nas
duas rodadas.

Mesma configuração, mesmo viewport, mesma seed, **mesmo censo de entidades**;
só muda quanto tempo o mundo rodou antes de amostrar:

| Cenário (preset mobile, viewport de celular) | idade do mundo | draw calls p50 | inimigos vivos | meshes visíveis |
|---|---|---|---|---|
| `Q1` mundo novo | ~20 s | **775** | 28 | 1880 |
| `Q2` mundo assentado | 240 s | **336** | 28 | 1878 |

```
Q1 censo: {"tod":0.33006458333333333,"nightK":0,"inimigos":28,"inimigosVivos":28,
           "esqueletos":7,"animais":13,"meshesVisiveis":1880,"started":true}
Q2 censo: {"tod":0.33006458333333333,"nightK":0,"inimigos":28,"inimigosVivos":28,
           "esqueletos":7,"animais":13,"meshesVisiveis":1878,"started":true}
```

**2,3× de diferença com o mesmo número de entidades vivas e a mesma hora do
dia** (`Env.tod` é fixado em `GAME_TOD` no `game.js:2752`, então não é
ciclo dia/noite). A causa é **espacial**: os ~28 inimigos nascem perto do ponto
onde o jogador também nasce e, com o jogo rodando por baixo do menu, se
espalham pelo mapa. Depois de 4 minutos parados eles saíram do frustum.

Consequência prática, e é a parte incômoda:

- **Os números "assentados" (309–336) são o mundo depois de 4 minutos de
  ociosidade — não é o estado em que um jogador começa a jogar.** Um jogador
  real abre a página, fica alguns segundos no menu e aperta jogar: ele vê o
  estado de ~775.
- A rodada da manhã mediu no teto do detector de rede (300 s) e a desta tarde
  no de 240 s. **Por isso as duas rodadas são comparáveis entre si** (ambas
  assentadas), e por isso as duas subestimam o custo real do primeiro minuto.
- Foi descoberto por acidente: um cenário caiu num teto de espera diferente e
  devolveu 812 em vez de 389. Em vez de descartar, virou medição controlada
  (`Q1`/`Q2`, e depois o par `F1`/`F2`).

Daqui pra frente as tabelas dizem sempre **em que idade de mundo** o número
foi tirado.

## F1. Textura — o corte foi medido e é real

`npm run assets:report` na árvore de trabalho, e **o mesmo script rodado sobre
os 25 GLB extraídos de `HEAD`** (`git show HEAD:<arquivo>`), pra o "antes" e o
"depois" saírem do mesmo código:

| Métrica (25 GLB versionados) | ANTES (`HEAD`) | DEPOIS | delta |
|---|---|---|---|
| **VRAM RGBA8** | **194,6 MB** | **54,0 MB** | **−72,3 %** |
| **RGBA8 + mipmap** | **259,5 MB** | **72,0 MB** | **−72,3 %** |
| imagens únicas | 67 | 67 | 0 |
| bytes de imagem comprimida | 7,80 MB | 3,68 MB | −52,8 % |
| disco | 18,28 MB | 13,83 MB | −24,3 % |
| **triângulos** | **231 437** | **231 437** | **0,0 %** |
| **`bazooka.optimized.glb`** | **108,0 MB** | **10,1 MB** | **−90,6 %** |

```
$ npm run assets:report
TOTAL (25 arquivos)                               13.83               67     3.68   54.0  72.0 231437
$ node scripts/build-model-textures.js --check
VRAM RGBA8 dos modelos servidos: 54.0 MB → 54.0 MB (72.0 → 72.0 MB com mipmap)
orçamento de textura: OK
```

Nota de conciliação: a rodada da manhã publicou **198,63 / 264,85 MB em 68
imagens**; o inventário por arquivo versionado dá **194,6 / 259,5 em 67**. A
diferença (≈4 MB = uma imagem de 1024²) é uma textura que a sonda de runtime
enxergava e que não está em `assets/models` versionado. **Os dois lados da
tabela acima vêm do mesmo script**, então o delta é limpo.

Confirmação independente, dentro da página (`renderer.info.memory` + soma das
imagens únicas alcançáveis pela cena e pelo arsenal):

```
R5b: three.info.memory {"geometries":1149,"textures":146} | 66 imagens únicas = 44,8 MB RGBA8
D1 : three.info.memory {"geometries":874,"textures":150}  | 67 imagens únicas = 44,9 MB RGBA8
```

**Como o corte foi feito, e o que isso limita:** por *redução de resolução* +
reencode em WebP, não por compressão de GPU. A bazuca saiu de 27 × 1024² PNG
para uma mistura de 512²/256²/128² WebP. **Continua zero KTX2/Basis/ETC2/ASTC
no repositório** — as 67 imagens (37 webp, 27 png, 3 jpeg) viram RGBA8 na GPU
do mesmo jeito. O caminho de mais 4× ainda está aberto e não foi tomado.
(`test/asset-models.test.js:200` proíbe só Draco e meshopt; KTX2 não está
barrado.) `test/asset-texture-budget.test.js` virou a trava de regressão
(`MAX_RGBA8_MB = 58`, `MAX_PER_FILE_MB = 11`).

## F2. Draw calls no viewport real de celular — o sinal inverteu, mas o motivo é outro

Viewport de celular = 844×390, `deviceScaleFactor: 2`, `hasTouch`, `isMobile`.

**Correção metodológica que precisa vir antes do número.** A rodada da manhã
comparou "mobile no viewport de celular" (331) contra "desktop no viewport de
**desktop**" (309) e concluiu **+7,1 %**. Isso mistura duas coisas: o preset e o
frustum. O controle que faltava é o **preset de desktop no viewport de
celular** — e ele não sai com `?perf=1`, porque o viewport com `hasTouch` faz a
detecção do `js/mobile.js` **acertar sozinha** e ligar o preset móvel (o que é,
por si, uma validação da detecção). O controle correto exige `?mobile=0`.

### Mundo assentado (240 s) — comparável com a rodada da manhã

| Cenário | draw p50 (cpu 4×) | triângulos p50 | sombra | `VIEW_DIST` |
|---|---|---|---|---|
| `R1` preset desktop, viewport desktop 800×600 | 312 | 864 665 | ligada | 420 |
| `R5a` preset desktop, **viewport de celular** | **389** | 1 026 925 | ligada | 420 |
| `R5b` preset **mobile**, viewport de celular | **309** | 639 253 | desligada | 300 |
| `R4` preset mobile, viewport de celular *(repetição independente)* | **310** | 634 061 | desligada | 300 |
| `R3` preset mobile, viewport desktop 800×600 | 255 | 575 365 | desligada | 300 |

Reprodutibilidade: `R4` e `R5b` são a mesma configuração medida em execuções
separadas — **309 vs 310 (0,3 %)**. O ruído de draw call desta rodada é muito
menor que os ±8 % da manhã.

Com isso dá pra separar as duas causas, que a rodada da manhã tinha somado:

- **O frustum de paisagem custa +24,7 %**: 312 → 389 (mesmo preset, só o
  viewport muda). FOV horizontal vai de 91° para 118° com FOV vertical fixo.
- **O preset mobile paga −20,6 %**: 389 → 309 (mesmo viewport, só o preset).
- Resultado líquido contra o desktop no viewport de desktop: 312 → 309,
  **−1,0 %**, ou seja, empate.

| | ANTES (manhã) | DEPOIS | leitura |
|---|---|---|---|
| mobile @ celular vs desktop @ desktop | 309 → **331 (+7,1 %)** | 312 → **309 (−1,0 %)** | empate, não mais penalidade |
| mobile @ celular vs **desktop @ celular** | *não medido* | 389 → **309 (−20,6 %)** | **o preset sempre ajudou; faltava o controle** |
| triângulos, mobile @ celular | 629 957 | 639 253 | +1,5 % *(ruído)* |

**Resposta direta: sim, o sinal inverteu** — mas a maior parte da inversão vem
de **corrigir o experimento**, não do código. O que o código mudou de fato
(`VIEW_DIST` 200 → 300) levou o mobile @ celular de 331 para 309–310, e mesmo
esse delta está contaminado pela idade do mundo (300 s antes, 240 s agora).
**Honestamente: `VIEW_DIST` 300 saiu de graça, como a medição da manhã previa —
não melhorou nem piorou draw call.**

### Mundo novo (20 s) — o estado em que o jogador realmente começa

| Cenário (viewport de celular, mundo novo) | draw p50 (cpu 4×) | triângulos p50 | sim p50 | substeps |
|---|---|---|---|---|
| `F1` preset desktop | **827** | 1 044 836 | 13,2 ms | 3 |
| `F2` preset **mobile** | **782** | 733 944 | 8,5 ms | 2 |
| delta | **−5,4 %** | **−29,8 %** | −35,6 % | |

**No estado que importa, o preset mobile corta 5,4 % das draw calls, não 20,6 %.**
O que ele tira (sombra: 58 draw calls) é pequeno perto do que ele não toca: os
personagens e veículos aglomerados perto do spawn.

## F3. Decomposição das draw calls — a grama nunca foi 169

Medida **exata**, interceptando `renderer.renderBufferDirect` (que é onde o
three incrementa `info.render.calls`): a soma das categorias bate com o
contador do perfhud por construção, não por estimativa. Passe de sombra é
reconhecível porque a `WebGLShadowMap` chama com `scene = null`; quad de pós é
objeto sem parent.

Conferência em **todos** os doze cenários (soma das categorias vs
`info.render.calls` amostrado no mesmo regime): 318/315, 304/299, 250/248,
310/311, 398/390, 311/311, 789/794, 338/334, 520/509, 675/675, 835/825,
787/785. Desvio máximo 2,2 %, e ele é do intervalo entre as duas amostragens
(a grama recicla chunks), não do método.

**A correção mais importante desta rodada:**

| | ANTES (manhã) | DEPOIS (medido) |
|---|---|---|
| grama, **no grafo de cena** | 169 InstancedMesh | 169 InstancedMesh *(inalterado — contrato)* |
| grama, **draw calls por frame** | reportado como **169** | **86–89** no viewport de celular, **73–76** em 800×600 |
| fatia do frame | reportado como **51 %** | **28 %** assentado, **11 %** mundo novo, **13 %** no BR |

**O "169 draw calls de grama" da rodada da manhã era a contagem do grafo de
cena, não do frame.** Cada chunk é um `InstancedMesh` com
`frustumCulled = true` e bounding sphere própria (`js/grass.js:271-273`), então
**metade dos chunks é descartada todo frame**. A conclusão "51 % do frame é
grama" estava errada por um fator de ~2.

### Quem realmente domina o frame (`F2` — mobile, celular, mundo novo, total 787)

| categoria | draw calls | fatia |
|---|---|---|
| **peças de corpo de NPC** (`SphereGeometry` 107 + `CapsuleGeometry` 82 + `RoundedBoxGeometry` 80) | **269** | **34 %** |
| **veículos** (`CarBody` 42 + `Wheel_FR/FL/RR/RL` 22 cada) | **130** | **17 %** |
| grama | 87 | 11 % |
| `CylinderGeometry` (props de cidade, postes, troncos) | 61 | 8 % |
| resto (céu, cidade destruída, segredos, castelo, pós) | ~240 | 30 % |

**NPCs + veículos = 399 draw calls = 51 % do frame.** É exatamente a fatia que
a rodada da manhã atribuiu à grama.

Origem confirmada no código: `js/enemies.js` monta **cada** inimigo com 29
chamadas distintas de `new THREE.Mesh(...)` (linhas 30–115; braços e pernas
ainda entram em laço de 2, então o total por inimigo é maior), **sem nenhuma
fusão de geometria e sem instanciamento**. No grafo: 660 `RoundedBoxGeometry` +
554 `SphereGeometry` + 349 `CapsuleGeometry` com `MeshStandardMaterial`.

## F4. Boot

| Métrica | ANTES | DEPOIS | delta |
|---|---|---|---|
| **requisições** | **191** | **191** | 0 |
| **bytes totais** | **19,42 MB** | **15,03 MB** | **−22,6 %** |
| **GLB** | 23 arq / **17,83 MB** | 23 arq / **13,41 MB** | **−24,8 %** |
| Script (JS) | 1,53 MB | 1,54 MB | +0,7 % |
| CSS + HTML | 0,07 MB | 0,07 MB | 0 |

O corte de rede é o mesmo corte de textura: nenhum arquivo saiu do boot, todos
emagreceram.

### Fila priorizada de armas — mediu, e ela paga

Marcas tiradas com `WeaponModels.status()` amostrado a cada 100 ms, com
bytes/requisições no instante de cada arma ficar pronta. Rede 4G emulada
(9 Mbps / 40 ms):

| | desktop (`C1`) | **mobile (`C2`)** |
|---|---|---|
| **arma equipada (idx 0) pronta em** | 12,0 s | **9,6 s** |
| **bytes até ela ficar pronta** | 9,20 MB (139 req) | **5,25 MB (127 req)** |
| todas as 7 armas prontas | 20,6 s | 17,8 s |
| bytes até todas | 15,03 MB | 15,03 MB |

```
C2 (4G, mobile):
   idx 0 destrancada   9649 ms   127 req   5.25 MB  ready  low_poly_m4_rifle.glb
   idx 1 destrancada   9751 ms   129 req   5.25 MB  ready  shotgun_Shotgun_lenta_forte.glb
   idx 3 TRANCADA     16469 ms   183 req  12.14 MB  ready  bazooka.optimized.glb
   idx 2 destrancada  17539 ms   184 req  14.48 MB  ready  low-poly_Sniper_lenta_forte.glb
   idx 4 TRANCADA     17640 ms   191 req  14.84 MB  ready  low-poly_Arma_do_Alien.glb
   idx 6 TRANCADA     17640 ms   191 req  14.84 MB  ready  low-poly_sniper_Rápida_Fraca.glb
   idx 7 TRANCADA     17842 ms   191 req  15.03 MB  ready  low-poly_Shotgun_rápida_fraca.glb
```

**A arma na mão fica pronta com 5,25 MB baixados em vez de esperar os
15,03 MB** — 35 % do download, 54 % do tempo. É a mudança com melhor relação
ganho/esforço da rodada.

*Precisão declarada:* o instante de "tudo carregado" continua **não medido** com
precisão, mas agora se sabe **por quê**: `/js/minimap-worker.js` é carregado
como Worker e o CDP **nunca emite `loadingFinished`** pra ele, então "zero
requisições em voo" jamais fica verdadeiro. Os bytes e requisições são exatos.

## F5. CPU de simulação sob `Emulation.setCPUThrottlingRate: 4`

`perf.simMs` exclui `composer.render()` e `csm.update()` — é a parte
transferível.

| Cenário (viewport de celular) | idade | sim p50 | sim p90 | substeps |
|---|---|---|---|---|
| `R5a` preset desktop | 240 s | 13,2 ms | 16,5 ms | 3 |
| `R5b` preset **mobile** | 240 s | **7,7 ms** | **14,6 ms** | 2 |
| `F1` preset desktop | 20 s | 13,2 ms | 16,2 ms | 3 |
| `F2` preset **mobile** | 20 s | **8,5 ms** | **12,6 ms** | 2 |

| | ANTES | DEPOIS |
|---|---|---|
| desktop sim p50 / p90 | 14,5 / 18,8 ms | 13,2 / 16,5 ms |
| mobile @ celular sim p50 / p90 | 8,1 / 16,0 ms | 7,7 / 14,6 ms |
| corte do preset | −44,1 % | **−41,7 %** |

Reproduz a manhã dentro do ruído. **A ressalva continua valendo**: parte do
ganho é a queda de 3 para 2 substeps de física, e não "mundo mais barato".

## F6. Battle royale — NÃO MEDIDO virou MEDIDO

A rodada da manhã marcou o BR como não medido por falta de tempo. Com a
máquina ociosa, os dois cenários rodaram até o fim via `startBRMatch` do
`test/helpers/harness.js` (bot-host, `claimHost`, `requestStart`, fase `PLAY`).

| Cenário BR | draw p50 | triângulos p50 | grama (draw) |
|---|---|---|---|
| `D1` desktop, viewport desktop 800×600 | **548** | 950 582 | 74 |
| `D2` **mobile, viewport de celular** | **671** | 717 449 | 87 |

Decomposição do `D2` (total 675):

| categoria | draw calls | fatia |
|---|---|---|
| **veículos** (`CarBody` 52 + 4 × `Wheel_*` 24) | **148** | **22 %** |
| grama | 87 | 13 % |
| `CylinderGeometry` | 67 | 10 % |
| `BufferGeometry`/`MeshStandardMaterial` (avatares remotos, baús) | 62 | 9 % |
| `cidadeDestruida` | 51 | 8 % |

**O BR custa 2,2× o solo assentado no mesmo viewport (309 → 671)** e é o modo
mais pesado que existe no jogo. A previsão da manhã ("os números do solo são
piso, nunca teto, pro BR") **confere e o fator é 2,2×**.

*Ressalva honesta:* só o regime `cpu 1×` do BR é confiável. Nas amostras com
throttle 4× a partida **muda de estado durante a medição** (zona fecha, jogador
morre) e a faixa de draw calls estoura — `D1` [96–687], `D2` [47–664]. Esses
p50 (513 e 452) **não** entram em nenhuma conclusão.

## F7. Veredito final sobre 60 FPS em Adreno 6xx / Mali-G57

> **Continua implausível — mas o motivo mudou de dono.** A memória de textura
> deixou de ser o teto (194,6 → 54,0 MB é um corte real e suficiente). O que
> bloqueia agora é **contagem de draw call no estado em que o jogador
> realmente joga**: 782 no mundo aberto recém-começado e 671 no battle
> royale, contra as 309 que as duas rodadas vinham reportando do mundo
> ocioso. E **a grama não é mais o próximo alvo** — ela nunca foi 169 draw
> calls, é 87.

### O que é MEDIÇÃO

1. Textura: **194,6 → 54,0 MB RGBA8** (259,5 → 72,0 com mipmap), triângulos
   idênticos. Bazuca: **108,0 → 10,1 MB**. Zero KTX2/Basis no repo.
2. Draw calls no viewport de celular, preset mobile: **309** (mundo assentado
   240 s), **782** (mundo novo 20 s), **671** (battle royale).
3. Contra o controle correto — preset desktop no **mesmo** viewport — o preset
   mobile corta **20,6 %** assentado e **5,4 %** no mundo novo.
4. Grama: **86–89 draw calls** por frame no celular (169 no grafo), **11 %** do
   frame novo, 28 % do assentado, 13 % do BR.
5. NPCs + veículos: **399 de 787 draw calls (51 %)** no mundo novo; **148 de
   675 (22 %)** só de veículos no BR.
6. Boot: **19,42 → 15,03 MB**, 191 requisições nas duas pontas. Arma equipada
   pronta com **5,25 MB** em 4G no celular.
7. CPU de simulação sob throttle 4×: **7,7 ms p50 / 14,6 ms p90** no preset
   mobile, contra 13,2 / 16,5 do desktop.
8. Idade do mundo muda draw calls em **2,3×** com o mesmo censo de entidades.

### O que é INFERÊNCIA

- **782 draw calls a 60 Hz = ~47 000 draw calls por segundo.** Adreno 6xx e
  Mali-G57 não sustentam isso com folga: a faixa prática dessas peças fica na
  ordem de 100–300 draw calls por frame antes de o custo de driver/binning
  dominar. É a inferência que sustenta o veredito, e **não** foi confirmada em
  aparelho.
- **734 mil triângulos a 60 Hz = ~44 M tri/s** em arquitetura tile-based, com a
  grama sendo alpha/vertex-shader pesada. Agressivo.
- **A memória deixou de ser o teto.** 72 MB com mipmap cabe numa aba de aparelho
  de gama média com folga. A hipótese mais carregada da rodada da manhã (perda
  de contexto WebGL / thrashing por 265 MB) **está retirada** — o corte de
  textura resolveu.
- O ganho do `res: 1` em tela DPR 3 continua **não medido** (o headless tem
  `devicePixelRatio = 1`) e continua sendo aritmética, não medição. Num aparelho
  real ele é provavelmente a maior economia isolada que já está no código.

### Respostas diretas às duas perguntas do pedido

**1. O corte de textura muda o veredito? A memória era o teto real?**
Muda **metade** dele. A memória **era** um teto plausível e **deixou de ser**:
54 MB (72 com mipmap) não derruba um aparelho de gama média, e o pico de 144 MB
que a bazuca criava no primeiro frame em que a arma aparecia acabou (agora
13,5 MB). Mas o alvo de 60 FPS **não** era decidido só por memória — e o que
sobrou (draw calls no estado real de jogo) não foi tocado por esta rodada.

**2. As 169 draw calls de grama seguem sendo o maior item? Juntar chunks mexe
no contrato do PRNG?**

*Não seguem, e nunca foram 169.* São **86–89 draw calls** por frame — o maior
item **isolado** no mundo assentado, mas apenas **11 %** do frame no mundo novo,
onde NPCs + veículos somam 51 %.

*Sobre o contrato:* **juntar chunks num `InstancedMesh` maior NÃO mexe no
contrato do PRNG.** Prova no código:

- o stream seedado global é consumido **exclusivamente** por
  `legacyConsume(cx, cz)` (`js/grass.js:184`), chamada uma vez por chunk dentro
  de `makeChunk` (`js/grass.js:275`), no laço fixo da grade
  (`js/grass.js:283-285`);
- o **conteúdo** vem de `chunkRng(cx, cz)` (`js/grass.js:18`), um mulberry32
  **local** que não consome nenhum `rand` global;
- logo, enquanto `legacyConsume` continuar sendo chamada 13×13 = 169 vezes com
  `PER_CHUNK = 1005` iterações na mesma ordem, **o layout do mundo é idêntico
  byte a byte**, independente de quantas malhas o renderer acabar criando.

O que a fusão custaria (e por que ela **não** é o próximo passo):

1. **Compra menos do que se pensava.** São 86 draw calls, não 169. Fundir em 4
   super-chunks salva ~82 draw calls = **10 % de um frame novo**.
2. **Troca draw call por trabalho de vértice.** Hoje a bounding sphere por chunk
   descarta metade deles todo frame (169 no grafo → 86 desenhados). Uma malha
   grande submete as ~170 mil lâminas sempre — e binning é exatamente o que
   dói em GPU tile-based.
3. **Quebra o LOD por chunk.** `aplicarLod` (`js/grass.js:298`) troca atributos
   de vértice na geometria **de cada chunk**; malha fundida tem uma geometria
   só, então o LOD vira uniforme por grupo — precisaria de 2 malhas por grupo
   (cheia/reduzida), cortando o ganho pela metade.
4. **Amplifica upload.** `fillChunk` e `stampTrack` marcam `needsUpdate` em
   buffers de ~64 KB por chunk; fundido, cada refill/trilha re-sobe o buffer do
   super-chunk inteiro, a menos que se use `updateRanges`.
5. **Custa QA.** `debugSample`/`debugChunkBytes`/`debugLod` são usados ~15× em
   `test/grass-decor.test.js` e em `test/castle-layout.test.js:741`, todos
   indexando malhas por chunk.

## F8. Próximos gargalos, reordenados pelo que foi medido

| # | Gargalo | Número medido | Por que está nesta posição |
|---|---|---|---|
| 1 | **Personagens montados peça por peça** (`js/enemies.js:30-115`) | **269 de 787 draw calls (34 %)** no mundo novo; 29 `new THREE.Mesh` por inimigo, sem fusão nem instanciamento | Maior item isolado do frame real. Fundir cada personagem numa geometria só (o repo já importa `BufferGeometryUtils` em `game.js:473`) levaria ~269 → ~28. Nenhuma restrição de PRNG: são objetos de runtime. |
| 2 | **Veículos** (`CarBody` + 4 rodas por carro) | **130 de 787 (17 %)** no solo; **148 de 675 (22 %)** no BR | Segundo maior, e no BR é o **maior de todos**, acima da grama. Mesma correção do item 1. |
| 3 | **Draw calls no primeiro minuto** | **775 vs 336** com o mesmo censo | Não é código a consertar, é *medição a corrigir*: qualquer perfilagem feita depois de ociosidade longa subestima o custo em 2,3×. Precisa virar protocolo. |
| 4 | **Textura sem compressão de GPU** | 54,0 MB RGBA8 de 67 imagens; **0 KTX2/Basis** | Já não é emergência (era 194,6). KTX2/ETC2/ASTC ainda cortaria 4× — de 54 para ~13 MB. Barato e sem risco de gameplay. |
| 5 | **86 draw calls de grama** | 11 % do frame novo, 28 % do assentado | Desceu de 1º para 5º ao ser medido direito. Ver F7 pra o custo real de mexer. |

## F9. Observações e um achado de código

**O1 — `js/weaponmodels.js:239-248` fura o limite de 2 downloads em voo.** O
comentário do bloco (`js/weaponmodels.js:186-201`) diz "2 em voo", e `pump()`
(`js/weaponmodels.js:226-227`) respeita `IN_FLIGHT = 2`. Mas o laço de
promoção no começo de `update()` chama `start(def)` **direto**, sem consultar
`inFlight.size`, para toda arma cujo `gun.locked` seja falso. No boot o arsenal
tem **três** armas destrancadas (idx 0 `FUZIL`, idx 1 `ESCOPETA`, idx 2 `DMR`),
então no primeiro frame começam **3** downloads, não 2. Cenário concreto:
jogador em 4G abre o jogo → 3 GLB disputam banda em vez de 2. **Severidade
baixa** — a ordem de prioridade continua correta e a arma equipada continua
sendo a primeira; é o comentário que descreve algo que o código não faz.

**O2 — `/js/minimap-worker.js` nunca emite `loadingFinished` no CDP.** Por ser
carregado como Worker, o detector "rede parada" jamais fecha e queima o teto de
espera inteiro (foram ~4 min por cenário nesta rodada e ~5 min na anterior).
Não é bug do jogo; é armadilha pra quem medir. Quem for medir de novo:
ignore requisições de Worker, ou use um assentamento fixo.

**O3 — a detecção de celular acerta sozinha no viewport emulado.** Com
`hasTouch` + `isMobile` + 844×390, `?perf=1` **sem nenhuma query de mobile**
caiu em `tier: mobile`, `isMobile: true`, `VIEW_DIST 300`, sombra desligada.
Isso valida a regra 4 do `js/mobile.js` (toque + ponteiro grosso + tela
pequena) num caminho que os testes unitários não exercitam.

## F10. O que ficou NÃO MEDIDO nesta rodada, e por quê

1. **FPS real em GPU móvel** — impossível por definição neste ambiente
   (swiftshader). Nenhuma conclusão depende de FPS.
2. **Ganho do `res: 1` em tela HiDPI** — `devicePixelRatio` do headless é 1
   mesmo com `deviceScaleFactor: 2` no viewport (`pixelRatio` medido = 1 nos
   sete cenários). Continua sendo aritmética, não medição.
3. **BR sob throttle de CPU 4×** — o estado da partida muda durante a
   amostragem e a faixa de draw calls estoura. Só o regime `cpu 1×` do BR foi
   usado.
4. **A causa exata da dispersão dos NPCs** — está medido *que* acontece e *que*
   o censo não muda; *qual* rotina os espalha não foi rastreada.
5. **Piso adaptativo de 0,5 em ação** — mesma razão da rodada da manhã: o
   scaler só desce quando o gargalo é render, e render em swiftshader não
   representa celular.
6. **Uma execução por configuração**, com uma exceção deliberada: `R4` e `R5b`
   são a mesma configuração em execuções separadas e bateram em 0,3 %, o que dá
   uma noção do ruído desta rodada (bem menor que os ±8 % da manhã).

---
---

# Medição pós-rodada de draw call

Data: 2026-08-08, sessão da noite. **ANTES = `11dde4d`** (o commit que fechou a
seção anterior deste documento), medido num `git worktree` fora do repositório;
**DEPOIS = `HEAD` = `091d5a7`**. Os quatro commits sob medição são `7f4ed3e`
(veículos), `d06609f` (personagens), `fe3870a` (animais) e `091d5a7` (acertos da
auditoria). Máquina ociosa, um cenário por vez, nunca em paralelo.

O motor de medição é o mesmo das seções `F*`: servidor com `WORLD_SEED=424242`,
Chrome `--use-angle=swiftshader`, viewport de celular 844×390 `deviceScaleFactor
2` + `hasTouch` + `isMobile`, `?perf=1&mobile=1`, e a técnica do `js/perfhud.js`
(`autoReset = false` + `beginFrame`/`endFrame`) — sem ela o composer zera
`renderer.info` por passe e a leitura mente. A decomposição é **por dono**:
`renderBufferDirect` interceptado, subindo a cadeia de parents até uma etiqueta
posta por identidade de objeto (`Enemies.list[i].group`, `Car.vehicles[i].group`,
…), nunca por heurística de nome.

**Nenhuma conclusão desta seção usa FPS.** Swiftshader é rasterizador de
software: draw calls, triângulos e geometria são fiéis; milissegundos de frame
não são transferíveis para celular. FPS não foi medido de propósito.

## G0. Correção de método: o "mundo novo (20 s)" de `F1`/`F2`/`Q1` era de ~92 s

Antes de qualquer número novo, um erro da rodada anterior que precisa ser
registrado porque muda a leitura das tabelas `F`.

O cenário `F2` está rotulado "mundo novo (20 s)". Ele não era. O código de
medição espera "rede parada" **antes** de aplicar o assentamento de 20 s, e o
detector de rede parada **nunca fecha** por causa de `/js/minimap-worker.js`
(armadilha `O2`, já registrada). Resultado: o teto de espera é consumido
inteiro e o assentamento de 20 s vira um `while` que já nasce satisfeito.

Idade real do mundo no instante do `forceStart`, medida agora e gravada em cada
execução:

```
dcf-antes-solo-1.json  {"worldMs":8542,"idleMs":98680,"idleOk":false,"idadeMundoMs":91698}
dcf-antes-solo-2.json  {"worldMs":8927,"idleMs":99055,"idleOk":false,"idadeMundoMs":91697}
dcf-depois-br-1.json   {"worldMs":9352,"idleMs":99500,"idleOk":false,"idadeMundoMs":100947}
```

**`idleOk: false` em 10 de 10 execuções** com o filtro antigo. Ou seja: `F1`,
`F2` e `Q1` mediram um mundo de **~90 s**, não de 20 s. Com o Worker também
ignorado no detector, a rede fecha de verdade (`emVooNoStart: 0`) e dá pra
assentar em 20 s de propósito.

E os dois regimes são **muito** diferentes, porque a câmera do menu gira
enquanto o jogador espera — a direção em que o `forceStart` deixa o olhar é
função da idade do mundo:

| idade do mundo no `forceStart` | `camDir` | draw p50 (ANTES) |
|---|---|---|
| 22 s | `[-0.719, -0.278, -0.637]` | **314** |
| 92 s | `[-0.863, -0.281, -0.420]` | **761** |

Não é dispersão de inimigo: é **enquadramento**. Aos 92 s a câmera aponta para
a Torre Nexus e os 8 Executivos procedurais entram no frustum; aos 22 s eles
estão fora. Por isso esta rodada mede **três** regimes e diz sempre qual é.

## G1. Draw calls no solo — ANTES × DEPOIS, três regimes

Cada configuração rodou **duas vezes** (o regime controlado, quatro).

### G1a. Estado em que o jogador realmente entra — mundo de 20 s, rede parada

`emVooNoStart: 0` nas quatro execuções, e `meshPorInimigo` já é `[10,2]` no
DEPOIS / `[38,2]` no ANTES: os GLB já substituíram o corpo procedural antes da
contagem (armadilha do GLB tardio fechada).

| | ANTES (`11dde4d`) | DEPOIS (`HEAD`) | delta |
|---|---|---|---|
| **draw calls p50** | **314 / 315** | **284 / 268** | **−12,2 %** |
| soma da decomposição | 318 / 319 | 289 / 271 | |
| triângulos p50 | 654 957 / 658 977 | 654 973 / 631 581 | ~0 |
| malhas visíveis | 1 879 / 1 880 | 1 442 / 1 440 | −23,4 % |
| malhas na cena | 3 091 | 2 103 | −32,0 % |
| geometrias vivas (`info.memory`) | 563 | 250 / 246 | −55,9 % |

### G1b. Mundo de ~92 s — o regime que `F1`/`F2`/`Q1` mediram de fato

Protocolo idêntico ao de `F2` (inclusive o detector de rede antigo), para
comparar com o **782** publicado.

| | ANTES (`11dde4d`) | DEPOIS (`HEAD`) | delta |
|---|---|---|---|
| **draw calls p50** | **761 / 780** | **460 / 440** | **−41,6 %** |
| soma da decomposição | 772 / 792 | 479 / 442 | |
| triângulos p50 | 705 932 / 729 332 | 727 488 / 705 916 | ~0 |
| malhas visíveis | 1 881 / 1 880 | 1 439 / 1 439 | −23,5 % |
| geometrias vivas | 904 | 310 / 309 | −65,8 % |

O ANTES (761/780) reproduz o `F2` da tarde (**782**) dentro de 1,5 % — é a
prova de que o motor de medição é o mesmo.

### G1c. Cenário CONTROLADO — o A/B reprodutível

O enquadramento natural depende da idade do mundo (§G0), então o número que
mede *o que a rodada comprou* sai de um cenário fixo: jogador teleportado para
`(60, 60)`, câmera com **yaw 0** (olhando −Z), `Enemies.update`,
`Animals.update`, `Car.update` e `Skeletons.update` transformados em no-op, e
**os 28 inimigos + 13 animais + 6 veículos** postos numa grade fixa a 10–52 m à
frente. Todos visíveis, nos dois builds, sempre.

| | ANTES | DEPOIS | delta |
|---|---|---|---|
| **frame inteiro** | **971 / 958 / 964 / 970** | **561 / 561 / 575 / 565** | **−41,5 %** |
| inimigos (28) | 296 | 112 | −62,2 % |
| animais (13) | 146 | 42 | −71,2 % |
| veículos (6) | 155 | 50 | −67,7 % |
| grama | 129 | 129 | 0 |

Os 112 do DEPOIS batem com a aritmética dos commits: 20 soldados com o GLB do
Guardião × 2 + 8 Executivos procedurais × 9 = 40 + 72 = 112. No ANTES,
20 × 2 + 8 × 32 = 296.

## G2. Battle royale (`startBRMatch` do `test/helpers/harness.js`)

| Cenário BR | ANTES | DEPOIS | delta |
|---|---|---|---|
| **entrada (mundo de 20 s → 29–30 s reais)** | **505 / 505** | **440 / 440** | **−12,9 %** |
| **mundo de ~101 s** (protocolo do `D2`, que deu 671) | **660 / 669 / 659** | **539 / 514 / 512** | **−21,3 %** |
| triângulos p50 (entrada) | 672 851 / 672 867 | 672 899 / 672 899 | **+0,007 %** |
| malhas visíveis | 2 454 / 2 456 | 2 016 / 2 017 | −17,9 % |
| geometrias vivas | 724 / 725 | 378 / 378 | −47,8 % |

Decomposição do BR (entrada, total 504 → 439): **veículos 66 → 31**,
**animais 44 → 12**, grama 83 → 83, resto 293 → 295. No mundo de ~101 s os
veículos vão de **148 → 43** (−70,9 %) e os animais de 56–59 → 16–20.

No BR os 28 inimigos do modo solo estão mortos (`inimigosVivos: 0`), então o
corte de personagens não aparece: **o ganho do BR é inteiramente de veículos e
animais.**

## G3. Dispersão — o número vale?

| Cenário | execuções | spread |
|---|---|---|
| BR entrada, ANTES | 505 / 505 | **0,0 %** |
| BR entrada, DEPOIS | 440 / 440 | **0,0 %** |
| solo 20 s, ANTES | 314 / 315 | 0,3 % |
| solo ~92 s, ANTES | 761 / 780 | 2,5 % |
| controlado, DEPOIS | 561 / 561 / 575 / 565 | 2,5 % |
| solo 20 s, DEPOIS | 284 / 268 | **5,8 %** |
| BR ~101 s, DEPOIS | 539 / 514 / 512 | 5,2 % |

O maior espalhamento (5,8 %) é menor que o menor delta reportado (12,2 %), então
**todos os deltas desta seção sobrevivem à dispersão**. Duas ressalvas honestas:
o BR com mundo de ~101 s tem uma execução (`539`) cujo `camDir` divergiu das
outras duas (`[-0.963,-0.081,0.256]` contra `[-0.867,-0.281,-0.411]`) e por isso
também acusou 916 945 triângulos contra 706 449 — **triângulo de BR com mundo
velho não é número confiável**; draw call é. O regime de entrada do BR, ao
contrário, é bit a bit reprodutível.

## G4. Decomposição por dono no frame (não no grafo de cena)

Solo, mundo de ~92 s (o pior enquadramento natural), soma conferida contra
`info.render.calls` no mesmo regime (479 vs 476; 442 vs 439 — 0,6 %):

| dono | ANTES | DEPOIS | delta |
|---|---|---|---|
| inimigos | **296** | **112** | −62,2 % |
| veículos | **130** | **25** | −80,8 % |
| animais | **44** | **12** | −72,7 % |
| grama | 86 | 86 / 87 | 0 |
| esqueletos | 4 / 20 | 4 / 16 | ruído |
| arma em primeira pessoa | 5 | 5 | 0 |
| resto (cenário, cidade, castelo, ambiente, pós) | 207 / 211 | 198 / 222 | 0 |
| **total** | **772 / 792** | **479 / 442** | **−41,6 %** |

**As três categorias que a rodada tocou caíram 470 → 149 draw calls (−68,3 %);
nada mais mudou**, o que é exatamente o esperado de quatro commits que só mexem
em `js/enemies.js`, `js/animals.js`, `js/car.js`, `js/carwheels.js`,
`js/meshutils.js`, `js/night.js` e `js/prewarm.js`.

## G5. Veredito sobre 60 FPS travados em Adreno 6xx / Mali-G57

> **O teto de draw call desabou, mas o alvo não foi alcançado: continua
> implausível no battle royale e em combate cheio, e passou a ser plausível só
> no solo com enquadramento de entrada.** O pico do jogo saiu de ~970 para
> ~565 draw calls e o estado de entrada de 315 para 276 (solo) e 505 para 440
> (BR). Com textura já em 54,0 MB e draw call cortado, **o próximo teto medido é
> a grama — e agora ela é o maior item nos dois eixos ao mesmo tempo.**

### O que é MEDIÇÃO

1. Solo, estado de entrada (mundo de 20 s): **314/315 → 284/268 draw calls**
   (−12,2 %).
2. Solo, mundo de ~92 s (o regime que `F2` publicava como 782):
   **761/780 → 460/440** (−41,6 %).
3. Solo, cenário controlado com tudo visível: **971/958/964/970 → 561/561/575/565**
   (−41,5 %).
4. BR, entrada: **505/505 → 440/440** (−12,9 %). BR, ~101 s:
   **660/669/659 → 539/514/512** (−21,3 %).
5. Por dono, no frame: inimigos **296 → 112**, veículos **130 → 25**,
   animais **146 → 42** (controlado) / **44 → 12** (natural).
6. **Triângulos não mudaram**: 672 851/672 867 → 672 899/672 899 no BR
   (+0,007 %), e iguais dentro do ruído de enquadramento no solo.
7. Malhas visíveis **1 880 → 1 440** no solo (−23,4 %) e **2 455 → 2 016** no BR
   (−17,9 %); malhas na cena **3 091 → 2 103**; geometrias vivas **904 → 309**
   (−65,8 %).
8. Triângulos do frame por dono (HEAD, solo, 20 s; soma das categorias
   625 585 contra `info.render.triangles` 643 261 — 97,2 %):
   **grama 379 108 tri (59 %) em 85,6 draw calls**; terreno + borboletas
   (`PlaneGeometry`) 98 636; GLB de cenário 76 328; inimigos 17 053;
   veículos 10 428; animais 2 691.

### O que é INFERÊNCIA

- A faixa prática de **100–300 draw calls por frame** em Adreno 6xx / Mali-G57
  antes de o custo de driver/binning dominar é a mesma inferência da rodada
  anterior, e **continua não confirmada em aparelho**. É ela que sustenta o
  veredito.
- Contra essa faixa: **276 (solo, entrada)** encosta no topo dela;
  **440 (BR, entrada)** está ~50 % acima; **565 (combate cheio)** está ~90 %
  acima. Antes da rodada os mesmos três eram 315, 505 e 966.
- **643 mil triângulos a 60 Hz ≈ 39 M tri/s** em arquitetura tile-based, com
  59 % disso sendo grama alpha/vertex-shader. Esse número **a rodada não
  tocou** — e por construção não podia, já que fusão de malha preserva
  triângulo.
- A memória de textura (54,0 MB RGBA8 / 72,0 com mipmap, §F1) **não foi
  remedida**: nenhum dos quatro commits toca `assets/`, então o número de F1
  continua valendo por construção.

## G6. Próximo gargalo, reordenado pelo que foi medido agora

| # | Gargalo | Número medido | Por que está nesta posição |
|---|---|---|---|
| 1 | **Grama** | **85,6 draw calls e 379 108 triângulos por frame — 32,5 % das draw calls do frame de entrada e 59 % dos triângulos** | Subiu de 5º para 1º sem mudar de tamanho: os itens à frente dela sumiram. É o único item que lidera os **dois** eixos. O custo de mexer está medido em §F7 (LOD por chunk, `updateRanges`, QA) e **não** envolve o contrato do PRNG. |
| 2 | **Os 8 Executivos procedurais da Torre Nexus** | **72 dos 112 draw calls de inimigo** (9 cada, contra 2 do soldado com GLB) | É o que faz o frame saltar de 271 para 442 quando a câmera vira pra torre. Já caiu 32 → 9; se eles chegassem aos 2 do soldado com GLB, os 72 virariam 16 e o pior caso de combate cairia de 565 para ~509. |
| 3 | **Borboletas e pássaros de `js/amb.js`** | bloco `PlaneGeometry`+`MeshBasicMaterial` de **24 draw calls no solo e 82 no BR**; 22 borboletas × 2 asas, **cada borboleta com material próprio** (`js/amb.js:14`), mais 15 pássaros (`js/amb.js:31-38`) | Custo puramente decorativo e quase sem triângulo: o bloco `PlaneGeometry` inteiro soma 98 636 tri, dos quais **96 800 são o terreno** (`TERRAIN_SEGS 220` → 220² × 2, `js/config.js:13`), sobrando ~1 800 para bicho. Um `InstancedMesh` por espécie levaria as 44+15 malhas a 2. O excedente do BR (82 − 59) **não foi rastreado**. |
| 4 | **GLB de cenário (raiz `Sketchfab_Scene`)** | **25–65 draw calls e 76 328 triângulos**, constantes em todos os cenários | Custo fixo do frame, independente de onde o jogador olhe. Não foi investigado se é castelo, nave ou ruína — só que é GLB e que é constante. |
| 5 | **Veículos** | 7–50 draw calls (eram 66–155) | Saiu da lista de emergência: no BR, onde era o maior item de todos (148), agora é 31–43. |

## G7. O que ficou NÃO MEDIDO nesta rodada, e por quê

1. **FPS em GPU móvel** — impossível no ambiente (swiftshader), e nenhuma
   conclusão depende dele. Deliberado.
2. **Memória de textura** — não remedida; os quatro commits não tocam
   `assets/`, então §F1 vale por construção.
3. **CPU de simulação sob throttle** — fora do escopo desta rodada; a fusão de
   malha não muda física, e o custo de `Skeleton.update()` já foi medido em
   `091d5a7` (0,018 ms/frame para 28 esqueletos).
4. **Quem é o GLB de raiz `Sketchfab_Scene`** e **o excedente de
   `PlaneGeometry`+`MeshBasicMaterial` no BR** — identificados como blocos, não
   como donos nominais.
5. **Triângulos por dono no BR e no ANTES** — a medição por dono de triângulo
   rodou uma vez, só no `HEAD` e só no solo.
6. **Enquadramento único por regime** — o cenário controlado é reprodutível por
   construção, mas os regimes naturais dependem da idade do mundo (§G0); os
   números naturais só valem com a idade declarada ao lado.
