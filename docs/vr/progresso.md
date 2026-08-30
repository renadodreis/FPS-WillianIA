# VR — Progresso

Registro por fase: o que foi feito, o número antes e depois, e o que foi
decidido **não** fazer (com o motivo, para não ser reaberto de graça).

---

## Fase 0 — Baseline e instrumentação · 2026-08-25 · PORTÃO ABERTO

### Feito

- `scripts/vr-baseline.js` (+ `npm run vr:baseline`): medidor repetível com dois
  alvos — `--target=local` (Chrome desta máquina, GPU real) e `--target=quest`
  (navegador do Quest por adb + CDP). Não toca no runtime: liga o
  `js/perfhud.js` que já existe, lê `renderer.info` por frame no mesmo
  `requestAnimationFrame` do jogo e passeia por 4 poses fixas via
  `window.__game`. Zero consumo de `rand`.
- `adb` 34.0.4 instalado + regra udev do fornecedor `2833` (Quest 3) — a máquina
  fica pronta para o aparelho voltar.
- `docs/vr/baseline.md` com os números medidos e a leitura do gargalo.

### Medido (desktop, RTX 3050, tier `alto`, 1280×720, seed 424242)

| | medido | teto VR |
|---|--:|--:|
| draw calls (mediana / pior) | 463 / 740 | 180 |
| triângulos (mediana / pior) | 956 k / 1,26 M | 500 k |
| materiais únicos | 499 | 60 |
| luzes com sombra | 4 | 1 |
| boot até 1º frame | 2,38 s | 4 s |
| payload de boot | 10,57 MB / 146 req | — |

Cena: 1541 meshes · 185 InstancedMesh (174 005 instâncias) · **334 SkinnedMesh**.

Gargalo dominante: **conta de submissão por frame** (draw calls + materiais),
não tempo de GPU. Detalhe e evidência em `docs/vr/baseline.md`.

### Decidido NÃO fazer

- **Multiview.** O plano pedia habilitar `OCULUS_multiview` e medir. No three
  r0.185.1 instalado, multiview só existe no stack do `WebGPURenderer`
  (`src/renderers/common/XRManager.js`); o `WebXRManager.js` do `WebGLRenderer`
  — que é o que o jogo usa — tem **zero** ocorrência. Migrar de renderer
  quebraria CSM, EffectComposer, o addon Sky com uniform próprio e a injeção de
  shader da grama. Ganho típico (20–40 % de submissão) sai mais barato cortando
  463 → 120 draw calls, que ajuda os dois olhos e também o desktop.
- **Medir FPS no desktop.** O Chrome trava em 60 (vsync): mediria o monitor, não
  o jogo. Capacidade de GPU fica com `scripts/perf-probe.js` (4,5 ms/frame em
  800×600 mono).

### Medido NO APARELHO (2026-08-25, com o Quest conectado)

Quest 3, Adreno 740, OculusBrowser 150 / Chrome 150, por `adb reverse` + CDP.
Tabela completa em `docs/vr/baseline.md`. Os três números que mandam:

| | Quest 3 | teto |
|---|--:|--:|
| draw calls (mediana / pior) | 413 / 805 | 180 |
| boot até o 1º frame | **7,79 s** (cache quente) | **4 s** (loja) |
| buffer de render | 750×562 = 421 mil px | ~9,1 M px em estéreo |

**O FPS do painel 2D não mede nada.** O p50 deu 33,3–33,4 ms nas quatro poses,
inclusive na do castelo, que tem 2,7× mais draw calls. Carga 2,7× maior com
mediana idêntica é teto, não saturação: o navegador do Quest limita a página em
painel a 30 Hz. Mesmo erro do `60 fps` do desktop (vsync). Frame time só vale
dentro de sessão imersiva — daí o modo `--immersive=1`.

**`adb reverse` resolveu o maior risco de infraestrutura do plano:** o aparelho
enxerga o servidor desta máquina como `http://localhost`, que é contexto seguro,
então o WebXR fica disponível sem publicar nada em HTTPS.

### Em aberto

Falta **uma** medição: `--immersive=1`, que fecha o portão da Fase 1. A corrida
entrou em VR e amostrou, mas o relatório morreu na faxina (`adb forward
--remove` de um encaminhamento já removido derrubava o processo depois do dado
colhido). Corrigido; falta o aparelho reconectar.

---

## Fase 1 — Bootstrap XR · 2026-08-25 · PORTÃO PARCIAL

### Feito

Camada nova `js/xr/`, no mesmo molde de `js/mobile.js` e `js/gputier.js` — núcleo
puro que recebe o ambiente por parâmetro, camada fina de DOM por fora. São quatro
módulos, todos testáveis sem headset:

| Módulo | O que resolve |
|---|---|
| `xrenv.js` | detecção pura. Separa `device` ("é um headset?", síncrono, decide preset) de `api` ("dá pra abrir sessão?", exige `navigator.xr` **e** contexto seguro). `?xr=1`/`?xr=0` vencem tudo |
| `xrrig.js` | o rig `scene > xrRig > camera`. Nasce **preguiçoso** |
| `xrsession.js` | ciclo da sessão: `local-floor` requerido, ordem `setReferenceSpaceType` → `setSession`, uma sessão por vez, recusa sem sujar estado, sinal de foco |
| `xrboot.js` | fachada única que o `game.js` conhece; `sync()` reconcilia o grafo com `renderer.xr.isPresenting` uma vez por frame |
| `xrbutton.js` | política do botão (pura) + camada de DOM |

No `game.js`, cinco mudanças:

1. **O dono do loop passou a ser o renderer.** `requestAnimationFrame(animate)`
   virou `renderer.setAnimationLoop`. Dentro de uma sessão quem agenda frame é
   `session.requestAnimationFrame` (72 Hz do Quest, com a pose da cabeça junto), e
   o three só troca uma fila pela outra se o loop for dele. No desktop cai no
   mesmo `requestAnimationFrame` de antes — a cadência não muda.
2. **O EffectComposer sai do caminho em XR.** Não é otimização: ele desenha nos
   render targets dele, e o framebuffer da sessão não é um deles. Com o composer
   no caminho o headset não recebe imagem.
3. **O passeio de câmera do menu não roda em VR.** Arrastar a cabeça do jogador é
   enjoo garantido. O mundo continua vivo ao fundo; o que sai é o trilho.
4. **A resolução em XR é da sessão.** `applyPixelRatio` e o `resize` viram no-op
   enquanto apresenta — senão o escalador adaptativo (que reage a frame estourado,
   justamente o que sobra no começo de uma sessão) despejaria avisos no console
   sem mudar um pixel.
5. **Botão de VR no menu**, só para quem pode usar.

### Medido

`npm run lint` limpo. **64 testes novos, todos verdes** (`xr-env`, `xr-rig`,
`xr-session`, `xr-button` puros em Node; `xr-bootstrap` no navegador, portas 3310
e 3312). Suíte completa rodada para provar que o desktop não regrediu.

Não há número de FPS aqui: sem o aparelho plugado, `72 fps travados` não é uma
afirmação que eu possa fazer. O portão fecha quando o cabo voltar.

### O flake do `weapon-ads` — que era anterior a tudo isto

A suíte pegou `weapon-ads.test.js` falhando, e o runner classificou como
**regressão real** (três rodadas isoladas sem dois passes seguidos). Minha
primeira conclusão foi que a culpa era do bootstrap XR. **Estava errada**, e
registro o erro junto com a correção porque o método é a lição.

O que derrubou a hipótese: A/B de 8 execuções isoladas alternadas entre as duas
árvores.

| árvore | falhas de 8 |
|---|--:|
| `09b5617` (**antes** da Fase 1) | 5 |
| Fase 1 | 6 |

Mesmos sintomas e mesmas magnitudes nas duas (arma 2 `scope` ~330 px, arma 7
`bead` ~206 px). O teste já falhava ~65% das vezes nesta máquina. As amostras
anteriores (9/9 numa árvore, 7/9 na outra) eram ruído — três execuções não
medem um flake de 65%.

**Causa raiz, com prova.** Instrumentando a medição, TODA falha trazia
`morto: true`, `vida: 0`, escala de tempo `0.35` e
`causa: {"type":"animal"}` — e a vida caindo em rampa entre as armas
(100 → 55 → 3 → 0). Um **lobo estava comendo o jogador parado no spawn** no meio
da medição; morto, o ADS não engata (`playerUpdate` deixa `adsT` em 0) e a arma
fica na pose de quadril — exatamente os 200–350 px de erro.

Por que o lobo existia: o harness mata os animais no boot
(`a.alive = false`), mas **animal morto renasce em 5 s de tempo de jogo**
(`js/animals.js:158-163`), num ponto sorteado. O `before` deste teste espera até
20 s pelo modelo do corpo FP, e cada medição roda ~42 s de tempo de jogo num
bloco só. Sobrava lobo de novo, e ele caça a 24 m.

Correção (`test/helpers/harness.js`): usar o desligamento que gruda —
`G.Animals.setEnabled(false)`, que faz o `update` sair no primeiro
`if (!a.enabled) continue`, antes do renascimento. Matar continua ali para quem
lê `alive`.

Medido depois: **0 falhas em 6 execuções** (era 5–6 em 8).

De quebra, o teste novo do loop deixou de esperar por relógio
(`setTimeout(250)`) e passou a esperar por **condição** — sob carga o rAF entrega
menos frames por segundo, e isso viraria flake meu dentro da suíte dos outros.

O `tick()` síncrono no `startLoop()` ficou, mas pelo motivo certo e só por ele: o
`animate()` antigo desenhava um frame ainda dentro da avaliação do módulo, e um
refactor que devia ser neutro no desktop não pode apagar isso calado. Não é
correção do flake — o flake era do lobo.

### Decisões de projeto (com o porquê, pra não reabrir de graça)

- **O rig nasce preguiçoso.** Todo `Object3D` gasta 4 números do `Math.random`
  seedado (game.js:201) no próprio UUID, e a ordem de consumo é contrato do
  worldgen. Um `Group` criado no boot moveria o mundo de todo mundo. Montar a
  camada não aloca nada; quem cria o rig é a primeira sessão de verdade. Há teste
  contando consumo de `Math.random` justamente pra travar isso.
- **`presenting` vem do `renderer.xr.isPresenting`, não de um espelho local.** A
  sessão termina por fora — headset tirado, botão do sistema, bateria. `sync()`
  reconcilia o grafo com o fato, uma vez por frame, em vez de confiar em callback.
- **`local-floor` é requisito, não opcional, e a ordem importa.** O three lê o
  tipo de referência ao adotar a sessão; invertendo a ordem o jogo nasce em
  `local` (origem na cabeça) e o jogador aparece enterrado até a cintura no
  terreno, sem uma linha de erro. Há teste travando a ordem.
- **O rig fica nos PÉS.** A altura do olho vem do headset — é o que faz agachar
  virar agachar de verdade.
- **Botão desabilitado num headset sem contexto seguro.** Servir o jogo pelo IP
  da rede local é o jeito mais comum de testar no aparelho, e aí `navigator.xr`
  não existe. Sumir calado faria o jogador de headset concluir que o jogo não tem
  VR; o botão aparece dizendo o que fazer.

### Correção depois de ver o resultado dentro do headset

O dono do projeto entrou em VR durante as medições e relatou: **"os ângulos
estavam todos errados"**. Estavam mesmo, e a falha era de escopo meu.

`XR.place()` existia, tinha teste, e **nunca era chamado por ninguém**. Sem
plantar o rig ele fica na origem do mundo — então em VR o jogador nascia de pé
no meio do mapa, olhando pro lugar errado, enquanto o jogo achava que ele estava
em `player.pos`. Junto disso, `applyFpsCamera` continuava escrevendo
`camera.position`/`quaternion` todo frame, e o three sobrescrevia tudo no render
com a pose da cabeça: o cálculo ia pro lixo e a vista não batia com o jogo.

Eu tinha registrado isso como "adiado pra Fase 3". Foi corte errado: sem o rig
plantado, entrar em VR não é uma fase incompleta, é ruído.

Corrigido:

- **em jogo**, `applyFpsCamera` deixa de escrever na câmera quando apresenta e
  passa a plantar o rig nos PÉS (`player.pos`). Recoil, screen shake, tombo da
  morte e roll de strafe continuam sendo CALCULADOS — alimentam a arma e o HUD —
  mas não chegam mais na câmera: arrastar a vista de quem está com o aparelho na
  cara é enjoo, não game feel;
- **no menu**, que não passa por `applyFpsCamera`, o rig é plantado no spawn;
- **giro do rig fica em 0**: girar o mundo sob o jogador é a mesma armadilha, e
  giro artificial (snap turn) é da Fase 3;
- altura do olho, bob e dip de pouso saem do caminho em VR — a altura vem do
  aparelho pela referência `local-floor`, e é isso que faz agachar ser agachar.

Dois testes novos travam: o rig segue os pés e o jogo não escreve na câmera; e o
menu planta o rig no spawn, não na origem do mundo.

### Decidido NÃO fazer agora

- **Locomoção, giro artificial e agachar por botão.** São da Fase 3. O que a
  Fase 1 entrega é o rig PLANTADO no lugar certo (ver correção abaixo); mover-se
  por analógico, snap turn com vinheta e agachar sem dobrar o joelho vêm depois.
- **Cortes de CFG para VR** (alcance, sombra, LOD): é a Fase 2 inteira, e sem
  medição no aparelho seria chute.
- **Arma nas mãos.** Hoje `weaponRoot` é filho da câmera — em VR ficaria colada na
  cara. No menu ela já nasce invisível; em jogo isso é Fase 4.

---

## Fase 2 — Triagem de performance · 2026-08-25 · EM ANDAMENTO

### Por que a Fase 1 não fecha sozinha

O portão da Fase 1 é "menu a 72 fps travados no Quest". Com o medido, é
impossível antes dos cortes desta fase: a pose de spawn — que é o menu — paga
235 draw calls e 800 k triângulos **mono, em 750×562**, contra teto de 180/500 k;
em estéreo o Adreno 740 precisa entregar ~9,1 M de pixels em 13,8 ms. Nenhum
ajuste de sessão compra 3,4× de draw call. Os dois portões fecham na mesma
medição — desvio consciente do plano, não portão pulado.

### Feito: instrumento de mira (`scripts/vr-censo.js`)

O baseline diz QUANTO; este diz DE QUEM, e sem isso a fase vira caça a esmo —
que em worldgen é o jeito documentado de quebrar este jogo. Duas medições:

1. **Censo por dono**, atribuindo cada mesh/material ao módulo que o criou.
2. **Atribuição de draw call por subtração**: esconde um filho da cena por vez e
   mede a diferença em `renderer.info.render.calls`.

Armadilha que o primeiro corte do script pegou: **com sombra ligada a subtração
mente**. O CSM escalona uma cascata diferente por frame, então dois frames
seguidos não são comparáveis — davam 8 linhas de ~50 calls somando mais que o
frame inteiro. Com a sombra desligada durante a atribuição o frame fica estável,
as linhas somam exatamente o total, e o custo da sombra vira um número à parte
(que é como o orçamento de VR trata: 1 cascata, não 4).

### Medido

```
434 objetos Material · 176 APARÊNCIAS distintas · 258 redundantes (59%)
1278 meshes · 181 InstancedMesh (174 049 instâncias) · 260 SkinnedMesh

frame SEM sombra: 235 draw calls · 0,65 M tris
sombra (4 cascatas CSM): +45 draw calls · +0,16 M tris

quem paga o frame              calls    tris   nós
worldgen instanciado              96    591 k   93
Enemies                           63     54 k    9
arma FP (filha da câmera)         54      5 k    1
estruturas                        19      1 k    5
```

### Leitura e ordem de ataque

| # | Alvo | Ganho estimado | Risco |
|---|---|--:|---|
| 1 | **Arma FP**: 54 draw calls para 5 k triângulos — o pior câmbio do jogo. GLB partido em dezenas de meshes, 192 materiais de aparência idêntica | ~50 calls | baixo: merge por material, zero mudança visual |
| 2 | **Enemies**: 218 SkinnedMesh para ~12 inimigos (~18 por boneco) | ~45 calls | médio: mexe em personagem que o PC também vê |
| 3 | **Sombra**: 4 cascatas → 1 direcional em XR | ~30 calls | baixo: já é gate por plataforma |
| 4 | **Worldgen instanciado**: 96 calls / 591 k tris | LOD e alcance | **alto**: contagem é contrato do `rand`; só LOD e view distance |

Somando 1–3: 280 → ~155 draw calls. O resto sai de alcance de visão e LOD, que
é onde o contrato do `rand` obriga cuidado — nada de mexer em `TREE_COUNT`,
`GRASS_TOTAL`, `TERRAIN_SEGS` ou `ENEMY_COUNT` (ver o bloco de regras em
`js/config.js`).

**Deduplicação de material é o único ganho que não muda um pixel**: 59% dos
materiais desenham igual. A trava a respeitar é material mutado em runtime
(cor por instância) — esse não pode ser compartilhado, e é o que o teste da
fase vai precisar provar.

---

## Kit de desenvolvimento VR · 2026-08-25

Correção de método, cobrada pelo dono do projeto e com razão: **nenhum
desenvolvedor fica de headset na cabeça pra desenvolver**. As primeiras
medições imersivas dependiam disso, e não dependem mais.

### O problema real

Sessão imersiva sem ninguém no aparelho vira `visible-blurred`/`hidden` e o
compositor PARA de chamar `session.requestAnimationFrame` — a medição saía com
zero frame. Pior: com o painel do navegador fora de foco, o contexto JS da
página congela, e até o clique por CDP ficava pendurado até estourar o timeout.
Automação não resolve isso; é regra de foreground do navegador.

### O kit, em três camadas

| Camada | Ferramenta | Mede |
|---|---|---|
| **Dia a dia, sem aparelho** | `npm run vr:emulado` — IWER (runtime WebXR emulado da Meta) com preset Quest 3, injetado antes do game.js | sessão imersiva real, 2 olhos, grafo do rig, caminho de render, **draw calls e triângulos em estéreo** |
| **Validação no aparelho** | `npm run vr:baseline -- --target=quest --immersive=1` — telemetria VrApi do logcat | FPS real contra o modo de tela, tempo de aplicação, GPU%, CPU%, térmica, memória — **sem ninguém no headset** |
| **Contagem de cena** | `npm run vr:censo` | de quem são os draw calls, por subtração |

Duas armadilhas resolvidas no caminho:

- `installRuntime()` do IWER **se recusa a substituir um runtime nativo**. O
  Chrome desta máquina tem `navigator.xr` nativo (que responde "não suporto" por
  não haver headset), então sem `{ forceInstall: true }` a emulação não sobe e o
  sintoma é só um botão de VR que não aparece.
- O runtime precisa entrar por `evaluateOnNewDocument`, ANTES de qualquer script
  da página: `xrEnv()` lê `navigator.xr` no escopo do módulo. Daí o `initScripts`
  novo no harness — aditivo, vazio por padrão.

### Medido em ESTÉREO (o que VR paga de verdade)

| Pose | draw calls | triângulos | teto |
|---|--:|--:|--:|
| menu | **512** | 1,74 M | 180 / 500 k |
| spawn | 516 | 1,74 M | |
| cidade | 556 | 1,45 M | |
| castelo | **823** | **2,05 M** | |

Estéreo é ~2× a leitura mono, como esperado — e move o alvo da Fase 2 de "413 →
120" para **"512 → 180 no menu e 823 → 180 no pior caso"**. O FPS de 60 aqui é
vsync do PC e não mede nada; tempo continua sendo assunto do aparelho.

E o grafo do rig foi verificado em sessão XR de verdade, não com `isPresenting`
falsificado: `rig - pés = [0,0,0]`, câmera filha do rig, yaw 0.

---

## Correção de números do boot · 2026-08-26

O porteiro (`docs/qa/porteiro-aaa.md`) reprovou a entrega e, no caminho, derrubou
dois números que estavam circulando como fato. Registro os dois porque número
errado que ninguém corrige vira decisão errada depois.

**1. O baseline de 2,38 s até o primeiro frame não reproduz.** Medido com a
mesma ferramenta, na mesma máquina: 2,94–3,03 s no HEAD e **2,97 s no commit
anterior à mudança de boot**. Ou seja, não é regressão — o 2,38 s foi colhido em
condição favorável e não representa o caso normal. Uma medição só não é
baseline.

**2. A melhora alegada no primeiro frame (2661 → 2465 ms) também não
reproduz.** Pela ferramenta oficial, HEAD e commit-pai medem igual dentro do
ruído. O trabalho de boot **não antecipou o primeiro pixel**.

O que ele DE FATO entregou, medido pelo porteiro em 5 rodadas (mediana):

| | antes | depois | ganho |
|---|--:|--:|--:|
| botão do menu utilizável | 1329 ms | **856 ms** | −473 ms (−36 %) |
| primeiro conteúdo pintado (FCP) | 1376 ms | **552 ms** | −824 ms (−60 %) |
| primeiro desenho no canvas | 1329 ms | 1319 ms | ~0 |

É ganho real e é o que o jogador sente primeiro — a tela deixa de ficar morta —
mas **não** é o que foi anunciado. O anúncio dizia "primeiro frame antecipado"; o
que antecipou foi o menu ficar utilizável.

---

## Correção da correção · 2026-08-26

A seção anterior ("Correção de números do boot") **estava errada e fica
retratada aqui**, com o mesmo destaque que teve o erro.

Eu registrei que o baseline de 2,38 s "não reproduz". **Reproduz.** A segunda
auditoria mediu 14 execuções com a máquina ociosa — mediana **2,28 s**, min
1995, máx 2607 — e demonstrou por experimento controlado que os 2,94–3,03 s da
primeira auditoria eram **carga de máquina**: repetindo com 8 de 12 núcleos
ocupados, deu 3337–3373 ms. A prova estava no artefato da própria medição
contestada — `html` em 1104 ms contra 191–457 ms nas medições limpas.

Ou seja: o que estava errado era a **refutação**, não o baseline. Eu troquei um
número certo por um errado porque aceitei uma medição sem checar a condição em
que ela foi feita.

O que segue valendo da seção anterior: a melhora anunciada de **2661 → 2465 ms
no primeiro frame** continua não reproduzindo, e o ganho real do trabalho de
boot continua sendo o menu utilizável ~473 ms mais cedo e o primeiro conteúdo
pintado ~824 ms mais cedo.

**Barra oficial** (proposta pelo porteiro, com amostra e condição): mediana
≤ 2,50 s em N ≥ 7 execuções, nenhuma acima de 3,00 s, com máquina ociosa e cache
frio. Contra ela, o HEAD passa: mediana 2,28 s, máximo 2,61 s.

## Pendente de fiação: chat, placar e lobby no mundo (rodada 5)

O módulo `js/xr/xrsocial.js` (615 linhas) e `test/xr-social.test.js` (616) foram
escritos e 11 dos 15 casos passam **sem fiação**. Os 4 que faltam exigem o
wiring no `game.js`/`br-game.js`, e o agente que os escreveu não chegou a
entregá-lo — a sessão dele acabou antes.

Os arquivos estão guardados fora do repo (scratchpad da sessão,
`pendente-social/`) em vez de commitados sem fiação, por dois motivos: código
que ninguém importa é código morto no repo, e um teste que falha por falta de
fiação envenena a faixa de VR para todo mundo.

**O que falta, e por que não foi feito às pressas:** o chat dá a volta no
SERVIDOR (`br-game.js`), o placar lê o roster que o servidor manda, e o painel
precisa ganhar ABAS em `js/xr/xrui.js`. É integração de rede em três arquivos de
donos diferentes — exatamente o tipo de coisa que, feita com pressa no fim de
uma rodada, vira o defeito que a rodada seguinte gasta o dia consertando.

---

## Rodada 15 — os três relatos do dono, medidos · 2026-08-28

O dono deu três relatos em uma frase cada. Esta rodada existiu para
transformar cada um em número antes de mexer no código — e um deles não
existia.

### 1. "O movimento não parece natural" — era a FORMA do vetor

O headset traduzia o analógico esquerdo em `KeyW/KeyA/KeyS/KeyD`.

| | antes | depois |
|---|--:|--:|
| erro de direção, polegar a 22,5° do eixo | 22,50° | **0,00°** |
| meio analógico | 1,693 m/s | **0,809 m/s** |
| analógico quase no talo | 1,693 m/s | 1,668 m/s |
| polegar em 0,22 | 0,000 m/s | 0,101 m/s |
| zona morta efetiva | 0,2805 | 0,18 (a declarada) |

O canal analógico já existia pronto em `js/xr/xrinput.js` e era descartado.
As teclas continuam sendo escritas: `js/car.js` e `js/heli.js` dirigem por
tecla. Junto foi a zona morta RADIAL — por eixo, os dois encolhem o mesmo
tanto em valor absoluto, a razão entre eles muda e a diagonal torce (9,79°
de resto depois do canal analógico).

### 2. "O boneco está travado e preciso virar com a alavanca" — REFUTADO, e atendido por outro caminho

Medido em seis ângulos, virando a cabeça fisicamente, com o giro artificial
em zero: vista, minimapa e direção de marcha erram **0,00°**, rig em 0,000°.
O corpo em primeira pessoa acompanha com a folga de 25° do `maxRootAngle`
do VRIK. **Nada estava travado.** O que o dono não conseguia era virar ALÉM
do alcance físico sem a alavanca.

Remover o giro não é opção: VRC.Quest.Tracking.1 é requisito obrigatório de
loja e o XAUR do W3C o trata como acessibilidade. Entregue como o Half-Life:
Alyx fez — um terceiro modo `desligado`, escolhido no painel dentro do
mundo, com o padrão continuando `suave` a 180°/s.

### 3. "O boneco parece enterrado" e "segurar a arma está bugado" — os dois eram reais

| | antes | depois |
|---|--:|--:|
| vértice mais baixo, agachando 0,75 m | −0,1147 m | pior caso da faixa inteira: **−0,0051 m** |
| vértice mais baixo, agachando 0,90 m | −0,2647 m | idem |
| mão direita → empunhadura (no render) | 0,4805 m | **0,0000 m** |
| mão esquerda → mão do jogador | 0,52 a 0,93 m | **0,0000 m** |
| cotovelo esquerdo | 176,0° | 103–143° |

Duas causas independentes: o IK resolvia contra a pose de DESKTOP da arma
(ordem de frame) e a mão esquerda mirava uma âncora da ARMA a 0,94–1,07 m do
ombro contra 0,5881 m de braço. Custo da correção: +0,035 ms no pior caso.

### Medido e NÃO consertado

- **Abaixo de ~0,95 m de cabeça o QUADRIL fica sob o piso** (−0,2626 m a
  0,70 m). A raiz acompanha a cabeça (C5) e o grau de liberdade que falta é a
  coluna, que este rig não modela. A perna contribui com 0,02 m disso.
- **A âncora `supportHand` da arma é inalcançável**: 0,94–1,07 m do ombro. Com
  `APOIO_PEGA` em 0,20 m, B5 (segunda mão) não engata por geometria, não por
  bug de estado. Foi para a frente da arma.
- **A rotação do punho esquerdo do boneco ainda vem da arma.** Posição e
  cotovelo corrigidos; a orientação não. Não foi mexida porque não há como
  verificar aparência com número, e trocar correção medida por não medida é o
  padrão que este repo já pagou caro.

### O décimo formato de "teste que passa por acidente"

**A condição que valida o caso é a que esconde o defeito.** O teste de "a
cabeça manda no jogo" exige giro artificial em zero para régua e leitura
viverem no mesmo espaço — e com o rig em zero `camera.quaternion` É a pose de
mundo, então o mutante que troca `yawDaVista()` por ele passa verde nos seis
ângulos. A saída foi ACRESCENTAR o caso complementar, com giro ≠ 0 e régua
independente: pega o mesmo mutante a 156,29°.

---

## Rodada 16 — ADS por botão (P0 do dono, vertical slice) · 2026-08-29

**Missão desta frente:** vertical slice VR onboarding — menu único, spawn no
chão, arma/mira/ADS, HUD limpo, sobrevivência inicial, nessa ordem. O dono
revogou explicitamente a decisão antiga "ADS em VR é só gesto físico"
(`docs/vr/referencia-arma-mira.md` item 5) e pediu botão dedicado, hold, sem
conflito, preferindo o gatilho esquerdo.

### Defeito atacado

`out.mirar` (`js/xr/xrinput.js`) só acendia via MIRA ASSISTIDA (grip direito,
acessibilidade, desligada por padrão) ou pelo gesto físico
(`XRArma.mirando()`). Não existia botão de ADS incondicional — exatamente a
decisão revogada.

### Causa e conflito descoberto

O gatilho esquerdo já tinha dono: abria o radial de quatro fatias (granada/kit
médico/comer/troca de mira). Órgão fechado (5 botões por mão, todos com dono
justificado) — não dá para ADS incondicional (aperta liga, solta desliga, sem
atraso) conviver com um radial que decide no MESMO aperto. Direita (grip) foi
descartado por colidir com o modo `manter` da empunhadura (soltar para sair da
mira soltaria a arma); grip esquerdo foi descartado por já ser contextual
(apoio/pente/agarrar-mundo por distância).

**Decisão:** gatilho esquerdo vira ADS puro (sem máquina de estado). O radial
perde o binding — `RADIAL_FATIAS`/`criarRadialXR` continuam existindo, sem
lar. Os quatro verbos (granada/kit médico/comer/troca de mira) não fazem parte
do roteiro mínimo "já dá para jogar" desta frente.

**Achado durante o TDD, pelo próprio teste:** havia DUAS instâncias
independentes de `criarRadialXR` lendo o MESMO gatilho — a de `js/xr/xrinput.js`
(dono da intenção/despacho) e uma segunda, local, em `js/xr/xrinteract.js`
(dona só do DESENHO do disco, porque `game.js` sempre chama
`XRInterage.update({ radial: null, ... })` para a ponte ser dona do despacho).
Corrigir só a primeira deixava o disco nascer na tela — um menu fantasma
cobrindo a mira, sem nenhum verbo funcionando atrás dele. É o padrão "duas
coisas conduzem o mesmo produto" da skill `vr-quest`, com um detalhe novo: a
segunda instância não veio de fiação esquecida, veio de uma feature JÁ EM
PRODUÇÃO perdendo sincronia com uma decisão nova em outro arquivo.

### Mudança

- `js/xr/xrinput.js`: `out.mirar = botao(esquerda, 0) || miraAssistida` (a
  assistida some por `||`, não substitui); `radial.passo(esquerda)` virou
  `radial.passo(null)`. Comentários de topo corrigidos (a frase "nenhum FPS de
  VR tem botão de ADS" ficava contradizendo o código).
- `js/xr/xrinteract.js`: `radialLocal.ler(fontes)` virou `radialLocal.ler(null)`
  — fecha a segunda instância do radial.

### Teste (TDD, IWER real, Quest 3)

`test/xr-ads-gatilho.test.js` (porta 3862, nova). Dois casos: (1) apertar o
gatilho esquerdo liga `mouse.aiming` — o mesmo campo que espalhamento/sway/
retículo já leem, não proxy — com a mão direita longe do olho (isola botão de
gesto) e sem mover a arma em relação à palma (B4); soltar desliga; (2)
segurando o gatilho para mirar, `XRInterage.estado().radial.{aberto,visivel}`
continuam `false` — guarda de regressão do conflito acima.

Vermelho confirmado nos dois casos ANTES do fix (motivo certo: `aiming` nunca
liga; radial abre) e depois de reinjetar o defeito antigo via `git stash`
(mesmos dois vermelhos). Verde depois do fix, nos dois casos, nas duas vezes.

### Fallout de teste, tratado (não deixado vermelho)

O gatilho esquerdo tinha dois arquivos de teste inteiros medindo o radial:
`test/xr-input.test.js` (describe "radial do analógico direito", 9 casos
unitários) e `test/xr-radial.test.js` (arquivo inteiro, sonda visual do disco
no headset). Os dois foram para `{ skip: '...' }` com o motivo escrito e
apontando para esta rodada e para a próxima prioridade — não é teste morto
esquecido, é teste de uma feature que perdeu o botão por decisão de produto.

**Fallout adicional, achado só na suíte cheia** (`npm run test:vr` rodado após
o fix acima ainda deu 10 vermelhos): mais três arquivos dependiam do mesmo
gatilho e não tinham sido tocados —
`test/xr-verbos.test.js` (describe D1 inteiro, os quatro verbos sem botão),
`test/xr-verbos-efeito.test.js` (describe inteiro, o radial mexendo no
inventário de verdade) e um único caso em `test/xr-giro-desligado.test.js`
("o radial continua suspendendo o giro"). Mesma causa, mesmo tratamento:
`describe`/`it` com `skip` e motivo escrito, sem apagar o arquivo — a
geometria e a lógica que eles mediam continuam válidas para quando o radial
ganhar um novo gatilho. Nenhuma asserção foi afrouxada; o mecanismo é que
ficou, por decisão do dono, sem controle que o acione.

### Verificado

`test/xr-ads-gatilho.test.js` focado (2/2), os 6 arquivos tocados pelo fallout
juntos (`xr-giro-desligado`, `xr-verbos`, `xr-verbos-efeito`, `xr-ads-gatilho`,
`xr-input`, `xr-radial`: 45 pass, 0 fail, 1 skip explícito),
`test/xr-empunhadura-botao.test.js` + `test/xr-empunhadura-grip.test.js`
(19/19 — a mira assistida continua funcionando, o `||` não quebrou nada),
`test/xr-mira.test.js` + `test/xr-weapon.test.js` (23/23 — B3/B7 intactos),
`npm run lint` limpo, `npm run test:vr` completo depois de todos os fixes:
**758 pass, 0 fail, 1 skip, 759 testes, 143 suítes** (1346,9 s — bem acima do
~2,5 min de referência da skill `vr-quest`; máquina com Chrome pessoal e
outras suítes rodando durante a medição, sinal de carga, não de regressão).

### Próxima prioridade

1. **Repor granada/kit médico/comer/troca de mira** em outro caminho de
   entrada (o botão físico não tem mais órgão livre; considerar gesto de
   pulso ou menu wrist-mounted, como a maioria dos FPS de VR de referência já
   usa em vez de botão — pesquisar antes de codar, por regra do porte).
2. Seguir o roteiro P0: com ADS resolvido, o próximo item vermelho do "já dá
   para jogar" é o item 4 (campo de visão limpo) ou 5 (onboarding/
   sobrevivência) — medir qual dos dois ainda está quebrado no produto real
   antes de escolher.

---

## Rodada 17 — onboarding de sobrevivência, só em solo VR (P0 item 5) · 2026-08-29

### Decisão: item 5 antes do item 4

Inspecionei código real antes de escolher. Item 4 (HUD dentro do mundo) já
tem `js/xr/xrhud.js` maduro (819 linhas, painel de arma/pulso/mapa/aviso em
espaço de mundo, distâncias corrigidas em commits anteriores — H2 fechado em
`e7c380a`). Item 5 (onboarding) não tinha NADA: `grep -rln "onboarding"
js/ game.js` não achava um arquivo sequer. `js/skeletons.js` (os inimigos
"esqueleto" do mundo livre, não os "soldados" de `js/enemies.js`) persegue o
jogador de QUALQUER distância desde o frame 1, sem teto de quantos
perseguem ao mesmo tempo — e isso é intencional para o jogo normal
(`test/skeletons.test.js`: "um esqueleto longe, então ele caça o player sem
desistir"). O pedido da missão não é consertar essa IA — é acrescentar um
modo opt-in que só liga em solo dentro de VR.

### Causa

`Skeletons.update()` não tinha noção de "onboarding": todo esqueleto vivo
persegue (`dP>1.5`) e ataca (`dP<MELEE_RANGE`) sem cooldown de entrada. Sem
teto, um jogador novo que nasça perto de vários esqueletos (ou que eles
convirjam) pode enfrentar mais de 2 ao mesmo tempo bem antes de aprender os
controles.

### Mudança

- `js/skeletons.js`: `iniciarOnboarding()` novo (exportado no `api`), liga
  `onboardingAtivo`. Durante os primeiros 15s (`ONBOARD_GRACE`) nenhum ataque
  COMEÇA — logo nenhum dano sai, sem tocar `playerDamage`. Durante os
  primeiros 60s (`ONBOARD_JANELA`) só os 2 esqueletos mais PRÓXIMOS do
  jogador (`ONBOARD_MAX_ATIVOS`) podem se mover/atacar; o resto fica parado
  (`passivo`) — não morrem, não somem, só não perseguem ainda. Fora do
  onboarding (`onboardingAtivo===false`, o padrão) o comportamento é
  bit-a-bit o de sempre.
- `game.js` (`startGame`): `if (XR.presenting && !window.__MP_active &&
  !window.__BR_active) Skeletons.iniciarOnboarding();` logo após
  `state.started = true`. Isolamento por construção: só o único call site
  decide, e ele exige VR + solo + fora de partida de BR.

### Teste (TDD)

`test/xr-onboarding-inimigos.test.js`, novo, duas suítes:
1. **Comportamento** (`Skeletons.update()` chamado DIRETO, sem `G.tick()` —
   `G.tick()` acorda os 12 soldados de `js/enemies.js` e contamina a medição
   de dano, armadilha já documentada em `test/skeletons.test.js`). Cenário:
   os 7 esqueletos são teleportados para 2m do jogador (pior caso, construção
   de cenário — não é medir a distância de spawn, que sozinha já dá ~29s de
   folga e esconderia o defeito por acidente). Com `iniciarOnboarding()`: 0
   dano nos primeiros 15s e no máx 2 "ativos" (atacando OU a <1,6m) ao mesmo
   tempo nos primeiros 60s simulados. Sem `iniciarOnboarding()`: mais de 2
   ativos ao mesmo tempo — prova que o teto é opt-in, não permanente.
2. **Fiação**: espiona `Skeletons.iniciarOnboarding` e roda `forceStart()`
   três vezes (resetando `state.started` manualmente, sem reboot de página)
   variando XR/`__MP_active`: só chama em VR+solo; 0 chamadas em desktop e em
   multiplayer.

Vermelho confirmado nas duas suítes antes do fix (motivo certo: função
inexistente / game.js nunca chama). Armadilha de setup pega no caminho: o
teste de fiação dava `soloVR: 0` mesmo depois do fix, porque
`bootGame({autoStart:false})` nasce com `online:true` → `window.__BR_active
= true` por padrão (documentado em `js/xr/xrinput.js` e no próprio
`harness.js`) — precisa `online:false` explícito pra simular solo de
verdade. Sem essa correção de setup o teste ficaria falso-vermelho para
sempre, mascarando o fix real.

### Verificado

`test/xr-onboarding-inimigos.test.js` (3/3), `test/skeletons.test.js`
(15/15 — comportamento padrão intacto), `npm run lint` limpo. `npm run
test:vr` completo rodado DUAS vezes: 1ª vez 759 pass/**2 fail**/1 skip; 2ª
vez, máquina menos carregada (sem os polls de background da 1ª medição
disputando CPU), **761 pass, 0 fail, 1 skip, 762 testes, 145 suítes** (1438s).
As 2 falhas da 1ª rodada não apareceram na 2ª nem tinham arquivo identificável
(log da 1ª foi truncado pelo próprio `tail -120` do comando — lição:
nunca canalizar `npm run test:vr` por `| tail -N` quando o resultado importa,
capturar em arquivo com `>` puro) — tratado como flake sob carga, não
regressão, seguindo o critério já registrado nesta base (N≥2 rodadas, com a
carga da máquina anotada).

### Próxima prioridade

1. Item 4 (campo de visão limpo): medir no produto real se algum painel do
   `xrhud.js` ainda invade o centro da visão durante combate — H1/H2 já
   avançaram bastante em rodadas anteriores, então o vermelho remanescente
   pode ser mais estreito que o item 5 era.
2. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) em
   outro caminho de entrada — ainda sem dono.
3. Se item 4 fechar, seguir o roteiro mínimo "já dá para jogar" (medir tiro
   acertando 10/15 onde o retículo indicou, 3 inimigos eliminados sem enxame,
   5 min sem UI na frente, morte→jogar de novo→voltar ao menu dentro do VR).

---

## Rodada 18 — item 4 verificado sem defeito; um guarda vazio corrigido · 2026-08-29

**P0 desta rodada:** medir item 4 (campo de visão limpo) no produto real, por
ordem da rodada 17.

### Medição do item 4 — SEM defeito de produto

`docs/vr/validacao-18a231e.md` (laudo independente mais recente, ancestral do
HEAD atual) já media H1/H2/H3 — os três aprovam: aviso central no grafo da
cena a 1,0284 m do olho (H1), os quatro painéis medidos ficaram todos ≥ 0,4773 m
e nenhum ancorado na câmera exceto a vinheta de conforto, que tem de ser (H2),
retículo por ausência declarada (H3). O único apontamento do laudo era de
TESTE, não de produto — §5.1, `xr-aviso.test.js` entregava ao produto os
argumentos que ele precisa para funcionar (formato 4) — e **já estava
corrigido no commit `8d81f6c`, antes desta frente começar**. Não há item 4
vermelho para atacar. Documentado aqui para não reabrir de graça.

### P0 substituto: o outro achado de teste do mesmo laudo, ainda aberto

Varri os outros achados §5.2–§5.8 do mesmo laudo contra o HEAD atual: §5.2–5.7
já estavam corrigidos (commit `4855d57`, anterior a esta frente). **§5.8
(`test/xr-corpo-piso.test.js`, caso "o número que o produto publica bate com a
malha que aparece") continuava aberto.**

### Causa comprovada

O filtro `varredura.filter(m => m.folga < -ENTERRO_MAX && m.afundou < 0.01)` é
vazio por construção SEMPRE: seu antecedente (`folga < -ENTERRO_MAX`) é a
NEGAÇÃO exata do caso anterior do mesmo arquivo ("NENHUM degrau enterra a
malha"), que já garante `folga ≥ -ENTERRO_MAX` em todo degrau quando passa.
Reinjetei `js/fpbody.js:1575` (`afundou = Math.max(0, piso - baixo)` →
`afundou = 0`) e o arquivo continuou 7 de 7 verde — confirmado, bate com o
laudo.

**Achado no processo, medido:** tentei ancorar a medida em algo independente
(quadril/joelho/tornozelo por osso, que é como `js/fpbody.js` computa `baixo`)
comparando contra `afundou` na MESMA varredura (1,85–0,70 m de cabeça). Não
adianta: nesta faixa o quadril NUNCA cruza o piso — pico de afundamento medido
por fora é **0,0000 m em todo degrau**, porque o clamp de quadril/coluna
(travado pelos casos deste arquivo e do describe "abaixo do quadril") é
hermético. Cheguei a escrever `assert.ok(picoPerna > TOL)` e ela morreu no
produto CORRETO — pego pelo próprio TDD antes de entrar no repo (formato 9:
"cenário que não exercita o limiar"). A direção "afundou sobe quando a perna
realmente relata abaixo do piso" não tem cenário natural em nenhum degrau
desta varredura.

### Mudança

`test/xr-corpo-piso.test.js`, dois casos:

1. **"o número que o produto publica bate com a perna medida por fora"**
   (substitui o vazio): compara `FpBody.afundou` contra uma estimativa
   independente por osso (quadril/joelho/tornozelo já capturados pela sonda),
   com tolerância de 0,03 m. Direção "sem falso positivo" — real, mas não pega
   o mutante histórico sozinha (ambos os lados dão ~0 no produto saudável).
2. **"quando o osso do quadril REALMENTE relata abaixo do piso, `afundou`
   acompanha"** (novo): monkey-patch de UM frame em `B.leg1R.getWorldPosition`
   — o MESMO objeto que `js/fpbody.js` lê para publicar `afundou` — deslocando
   -0,15 m, com o headset primeiro agachado a 0,95 m (onde o quadril já tem
   pouca folga, ~0,06 m medido na varredura) para o offset atravessar o piso
   de verdade. Não toca o solver de perna/coluna, que os casos acima já
   travam como hermético — isola a pergunta "o número publicado acompanha o
   osso" da pergunta "o osso vai parar lá sozinho", que são invariantes
   diferentes.

Armadilha no caminho: a primeira versão do caso 2 rodava com o headset ainda
em pé (herdado do `pePlantado` do fim do `before()`), quadril a ~0,96 m do
piso — um offset de 0,15 m não chegava nem perto de zero, e o caso morria
"esperado 0,0000 m" mesmo com o monkey-patch funcionando perfeitamente
(confirmado por instrumentação: a leitura patcheada batia exatamente com
`antes − 0,15`). Precisa agachar ANTES de aplicar o offset.

### Teste (TDD)

Vermelho confirmado com `afundou = 0` fixo reinjetado em `js/fpbody.js:1575`:
caso 2 morre com `'com o quadril relatando 0.1412 m abaixo do piso, o produto
publicou afundou=0.0000'` — motivo certo, com número. Verde depois de
reverter, nas duas vezes.

### Verificado

`test/xr-corpo-piso.test.js` (8/8), vizinhos de corpo (`xr-corpo-coluna`,
`xr-body`, `xr-punho-rotacao`: 37/37 juntos), `npm run lint` limpo. `npm run
test:vr` completo: **762 pass, 0 fail, 1 skip, 763 testes, 145 suítes**
(1437 s).

### Próxima prioridade

1. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) —
   ainda sem dono. Pesquisa já feita em `docs/vr/referencia-interacao.md` §6:
   inventário corporal (ombro/cintura) foi descartado por depender de
   `js/xr/xrbody.js` "de outra frente" — que agora É esta frente, madura
   desde as rodadas 17/18. Vale reavaliar essa opção antes de inventar uma
   nova, mas é design novo: pesquisar referência do gênero antes de codar,
   por regra do porte.
2. Seguir o roteiro mínimo "já dá para jogar": medir tiro acertando 10/15 onde
   o retículo indicou, 3 inimigos eliminados sem enxame, 5 min sem UI na
   frente, morte→jogar de novo→voltar ao menu dentro do VR — nenhum medido
   ainda nesta rodada de loop.

---

## Rodada 19 — morte→JOGAR DE NOVO medido de verdade (não só o botão) · 2026-08-29

**P0 desta rodada:** dos itens do roteiro mínimo ainda não medidos (Rodada
18), priorizei "morrer de forma controlada e escolher JOGAR DE NOVO dentro do
VR" — a mira/B7 já estava verde por trabalho anterior a esta frente (18/18 em
`xr-mira`+`xr-b7-*`, confirmado antes de escolher), e o hint de "historicamente
frágil neste gênero" apontava pro fluxo de morte.

### O que já existia, e o que faltava

`js/xr/xrui.js` + `game.js` já tinham o painel de morte real dentro do mundo
(`XRUI.abrir('morte')`, `reaparecer: () => restartMatch()`, `sair: () =>
voltarAoMenu()`), com três casos em `test/xr-ui.test.js` cobrindo: o solo
oferece "reaparecer", online não oferece, SAIR DA PARTIDA clicado de verdade
devolve o menu no mundo. **Nenhum clicava em "reaparecer" e conferia que a
partida volta** — as provas eram todas sobre o PAINEL (o botão existe, é o
mesmo painel), nunca sobre a AÇÃO. Family 4 da lista do CLAUDE.md em miniatura:
o botão podia estar morto e os 17 casos existentes não veriam.

### Causa comprovada (do próprio processo de TDD, não do produto)

Escrevi o caso matando o jogador de verdade (`playerDamage`, não
`player.dead = true` na mão) **depois** do caso "SAIR DA PARTIDA acaba a
partida". Morreu com `modo: "menu"` em vez de `"morte"` — óbvio depois de
medido: aquele caso já tinha zerado `state.started`, e `playerDamage` recusa
com `state.paused` true. Reordenado pra ANTES desse caso (o jogo ainda
rodando), o painel abriu sozinho — mas `dead` continuou `true` depois do
clique. Segunda causa, também do harness: `window.__MP_active` (ligado por
`online: true`, o padrão do `bootEmVR`) não estava sendo zerado — só
`__BR_active`. O painel oferece "reaparecer" olhando `!__BR_active`
(`podeReaparecer`, game.js), mas `restartMatch()` recusa em `__MP_active ||
__BR_active`: com um só zerado, o botão aparece e clicar não faz nada. Em
produção os dois nascem e morrem juntos, sempre por `br-game.js` — **nenhum
dos dois achados era bug de produto**, os dois eram harness montando um
estado que o jogo real nunca produz.

### Mudança

`test/xr-ui.test.js`: novo caso "clicar em JOGAR DE NOVO reinicia a partida de
verdade, não só mostra o botão", inserido ANTES de "SAIR DA PARTIDA" (ordem
importa: aquele caso termina a partida). Mata o jogador pelo caminho real,
espera o painel abrir sozinho (prova que game.js:3748 funciona sem
intervenção), clica em "reaparecer" pela mesma mecânica de raio+gatilho dos
outros casos do arquivo, e confere `state.started`, `player.dead`,
`player.health` e o painel fechado — não só a presença do botão.

### Teste (TDD) e verificação de que mede o produto, não o dublê

Vermelho pelo motivo certo nas duas rodadas de causa acima (ordem errada:
`modoAntes` vinha `"menu"`; flag meio-zerada: `dead` continuava `true`), verde
depois das duas correções DE TESTE. Não houve mudança em `game.js`/`js/xr/` —
o produto já fazia a coisa certa; a lacuna era só de cobertura.

### Verificado

`test/xr-ui.test.js` completo (18/18, era 17/17 antes do caso novo),
`test/xr-menu.test.js` + `test/xr-social.test.js` (33/33 — vizinhos que também
tocam `sair`/morte), `npm run lint` limpo. `npm run test:vr` completo: **763
pass, 0 fail, 1 skip, 764 testes, 145 suítes** (1540 s — acima do ~2,5 min de
referência, máquina com outras frentes/checagens rodando durante a medição:
sinal de carga anotado, não regressão).

### Próxima prioridade

1. "Morrer de NOVO → VOLTAR AO MENU" (segundo ciclo): as duas metades já têm
   prova independente (reaparecer restaura a partida — este relatório; sair
   devolve o menu — Rodada anterior/`xr-ui` caso "SAIR DA PARTIDA"), mas
   ninguém mediu as duas em SEQUÊNCIA no mesmo teste. Avaliar se vale a pena
   antes de assumir coberto.
2. "Eliminar 3 inimigos sem enxame" e "5 min sem UI na frente" do roteiro
   mínimo — nenhum medido nesta frente ainda.
3. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) —
   ainda sem dono.

---

## Rodada 20 — a cadeia morte→JOGAR DE NOVO→morte→VOLTAR AO MENU, em sequência · 2026-08-29

### Item atacado

Os dois itens do roteiro da missão ("morrer... escolher JOGAR DE NOVO" e
"morrer novamente e escolher VOLTAR AO MENU, ainda dentro do VR") já tinham
prova ISOLADA (Rodada 19 e uma rodada anterior), mas nunca em SEQUÊNCIA no
mesmo teste — exatamente o tipo de bug que teste isolado não pega (timer
preso da primeira morte, índice de linha do painel, flag que não sobrevive a
um ciclo completo).

### Causa comprovada — de novo, lacuna de cobertura, não bug de produto

Escrevi a cadeia completa (morte real via `playerDamage`, clica reaparecer,
confere partida restaurada, morte real de novo, clica sair, confere volta ao
menu) em `test/xr-ui.test.js`. Rodou verde de primeira. Para não aceitar isso
sem prova (ver CLAUDE.md, formato "teste que passa por acidente"), reinjetei
um mutante plausível em `game.js`: um guard que só deixa `Morte.mostrar()`
disparar UMA vez na sessão inteira (`if (!window.__mutanteMorteJaArmou) {...}`),
simulando a classe exata de bug que o teste existe para pegar (timer que não
rearma na segunda morte). Vermelho confirmado — `1º JOGAR DE NOVO não reviveu
o jogador` — porque o flag global já tinha sido consumido por um teste
anterior do mesmo arquivo (efeito colateral do mutante que a suíte real não
tem: sem ele, `resetarPartida()` restaura os dois ciclos de forma idêntica,
porque não guarda nenhum "já mostrei uma vez"). Revertido, voltou 19/19 verde.
`resetarPartida()` (chamada por `restartMatch()` e `voltarAoMenu()`) recompõe
todo o estado do zero a partir de `__inicio` a cada chamada — não há bug de
produto para corrigir aqui.

### Mudança

`test/xr-ui.test.js`: novo caso "a cadeia morte→JOGAR DE NOVO→morte→VOLTAR AO
MENU não vaza estado entre as duas mortes", inserido depois de "a tela de
MORTE é o mesmo painel..." e antes do guard de console (I2). Também prova, por
construção, que nenhuma das duas transições faz `location.reload()` nem
derruba a sessão XR: as duas mortes e as duas ações acontecem dentro do MESMO
`h.play()`, e uma navegação real teria interrompido o script antes de devolver
o resultado.

### Verificado

`test/xr-ui.test.js` completo (19/19, era 18/18), vermelho confirmado com
mutante (motivo certo, revertido sem tocar `game.js`), `test/xr-menu.test.js`
+ `test/xr-session.test.js` + `test/xr-entrar-joga.test.js` (33/33), `npm run
lint` limpo.

`npm run test:vr`: 1ª rodada (logo após rodar `xr-ui`/mutante/vizinhos na
mesma máquina) deu **3 cancelled** — nunca visto nas rodadas 16-19, sinal de
interferência dos meus próprios testes manuais rodando por perto, não da
mudança. 2ª rodada, limpa (nenhum outro processo de teste rodando):
**763 pass, 1 fail, 0 cancelled, 1 skip** — a falha foi `security-regression.test.js`
("Conexões — teto por IP", `servidor morreu cedo, código 1`), arquivo que esta
rodada não tocou. Isolado 2× consecutivas: **9/9 as duas vezes** — flake
confirmado pela regra do repo (duas passagens isoladas limpas), não regressão.

### Próxima prioridade

1. "Eliminar 3 inimigos sem enxame ou spawn injusto" e "jogar 5 minutos sem
   UI na frente da visão" — os dois itens do roteiro mínimo ainda sem medição
   nesta frente.
2. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) —
   ainda sem dono; é design novo, pesquisar referência antes de codar.

---

## Rodada 21 — "eliminar 3 inimigos sem enxame ou spawn injusto" · 2026-08-29

### Item atacado

O item do roteiro mínimo que faltava medir depois do onboarding da Rodada 17
(`08931f7`): a Rodada 17 deu graça de 15s e teto de 2 ativos, mas ninguém
tinha medido o que acontece DEPOIS de matar — um esqueleto morto pode virar
FANTASMA (continuar contando pra vaga) ou a vaga pode ficar PRESA (ninguém
assume, o que também não é o pedido: entrada gradual, não zero depois da
graça).

### Causa comprovada — de novo, lacuna de cobertura, não bug de produto

`js/skeletons.js` já recalcula `ativosPermitidos` TODO FRAME a partir de
`list.filter(sk => sk.alive)` — um morto sai do cálculo no frame seguinte à
morte, por construção, sem precisar de nenhuma lógica extra de "liberar
vaga". Escrevi o teste que mata os 2 ativos e confere quem assume: verde de
primeira. Para não aceitar isso sem prova, reinjetei o defeito histórico da
classe ("morto continua contando pra vaga") trocando o filtro por
`list.filter(() => true)` — vermelho confirmado, **0 ativos onde 2 eram
esperados** (os dois mortos ocupavam as duas vagas do topo-2 pra sempre,
travando os vivos em passivo). Revertido sem sobrar diff em `js/skeletons.js`.

### Armadilha do próprio teste, achada em TRÊS voltas de TDD

1ª volta: medir "ativo" por deslocamento de posição (`andou`) deu falso
negativo — quem já chegou ao alcance de ataque PARA de andar (fica atacando
parado), então o delta de posição mede zero num esqueleto engajado. 2ª volta:
troquei pra `attacking || targetDistance < 1.6` (a régua que `medir()` já usa
acima) — funcionou pros dois primeiros pares, mas o CANDIDATO A 9 M do
terceiro par nunca chegava ao alcance dentro da janela de medição. Depurei com
um script isolado (`node` direto, sem o test runner) e achei: ele anda
9,00→6,78 m no primeiro segundo (prova que a vaga abriu) e depois FICA PRESO
contra alguma estrutura/obstáculo perto do ponto de teste (30,30) pelo resto
da janela — geometria do mapa, não bug de onboarding (mesma classe já coberta
em `test/skeletons.test.js`, "o esqueleto DESVIA e continua a caça"). 3ª
volta, a que ficou: "ativo" = `targetDistance` caiu abaixo do valor de SPAWN
— um passivo nunca sai do lugar (o ramo de movimento nem roda), então o campo
fica idêntico ao spawn; qualquer queda prova elegibilidade sem exigir que a
viagem inteira termine dentro da janela de teste. Também achei e corrigi um
efeito colateral ORDEM-DEPENDENTE já existente no arquivo: `onboardingT`
nunca zera sozinho (só `iniciarOnboarding()` zera), e inserir meu caso ENTRE
os dois testes antigos fazia o segundo ("sem onboarding") herdar o relógio
recém-rearmado do meu — falha marcada como fantasma que não era. Corrigido
movendo meu caso para o FIM da bateria (comentário deixado no arquivo
explicando por quê).

### Mudança

`test/xr-onboarding-inimigos.test.js`: novo helper `espalharDistancias`
(distâncias conhecidas e diferentes por índice, pra ordem de proximidade ficar
determinística) e novo caso "matar os 2 ativos libera vaga pro próximo mais
próximo NO PRÓXIMO FRAME — sem fantasma, sem enxame", cobrindo a cadeia
completa: 2 mortes reais (`sk.damage(sk.hp)`, o mesmo método que `fire()` usa
em produção — convenção já estabelecida em `test/skeletons.test.js`), fantasma
checado (`alive`/`visible`), vaga liberada no frame seguinte, os 2 novos mais
próximos assumindo (nunca os mais distantes), e uma 3ª morte fechando o
"eliminar 3" sem nunca passar de 2 ativos simultâneos. Nenhuma mudança em
`js/skeletons.js` — a lógica já estava certa.

### Verificado

`test/xr-onboarding-inimigos.test.js` completo (4/4, era 3/3) + vermelho
confirmado com mutante reinjetado (motivo certo: 0 ativos, revertido sem
diff), `test/skeletons.test.js` (15/15, sem regressão), `npm run lint` limpo.

`npm run test:vr` completo síncrono: **765 pass, 0 fail, 0 cancelled, 1
skip**, 766 testes, 145 suítes, 1481 s.

### Próxima prioridade

1. "Jogar 5 minutos sem UI na frente da visão, arma lateral ou corpo
   enterrado" — único item do roteiro mínimo ainda sem medição nesta frente.
2. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) —
   ainda sem dono; é design novo, pesquisar referência antes de codar.

---

## Rodada 22 — "UI na frente da visão": o aviso central cruza a mira olhando pra cima · 2026-08-29

### Item atacado

O item que faltava do roteiro mínimo: "jogar 5 minutos sem UI na frente da
visão, arma lateral ou corpo enterrado". Antes de escrever qualquer teste,
li a cobertura já existente — `test/xr-hud.test.js` (I3, painéis de
munição/pulso), `test/xr-aviso.test.js` (H1/H2, o aviso central de
`centerMsg`), `test/xr-empunhadura-*.test.js` (alinhamento da arma na mão) e
`test/xr-corpo-piso.test.js` (corpo enterrado, fechado na Rodada 18) — pra
não duplicar prova já feita. Achado: TODA a bateria de `xr-aviso.test.js`
gira a cabeça só em YAW (`olhar(g)`); nenhum caso usa PITCH. E `alvoDoAviso`
(`js/xr/xrhud.js`) tem uma linha que só faz sentido girando o pescoço para
os lados: `_fwdL.y = 0` — o cálculo IGNORA de propósito a inclinação
vertical da cabeça.

**Sobre o literal "5 minutos reais":** um soak de 300 s de parede quebraria
o ciclo curto que a skill `vr-quest` protege (~2,5 min); a saída foi medir o
mecanismo que esse tempo exercitaria (cabeça se movendo em todas as direções
enquanto um aviso está aceso), não o relógio. Alinhamento de arma e corpo
enterrado já têm bateria própria (empunhadura-grip/botão e corpo-piso); o
que faltava era exatamente esta lacuna de PITCH no aviso. Fica registrado
como não-fechado o soak literal de 5 min contínuos com os três juntos — ver
"próxima prioridade".

### Causa comprovada, com número

Escrevi a sonda (`olharPitch`, novo helper ao lado do `olhar` existente) e
medi o ângulo real entre a direção da mira (`camera` forward) e a posição do
painel de aviso, com o aviso aceso, em seis inclinações. Antes do fix:

| pitch | ângulo mira↔painel |
|--:|--:|
| 0° | 13,50° (bate com `atan(0,24/1,00)`, o projeto) |
| 10° | 3,52° |
| **13°** | **0,51°** — quase em cima da mira |
| 20° | 6,47° |
| 30° | 16,44° |
| 45° | 31,38° |

O mergulho não é acidente de amostragem: `AVISO_SOBE` (0,24 m) é uma altura
FIXA sobre o olho e o painel fica a 1,00 m (`DIST_AVISO`) na horizontal —
quando o pitch se aproxima de `atan(SOBE/DIST) = 13,5°`, o raio de mira
VARRE exatamente o ponto onde o painel está parado, porque a altura dele
nunca acompanhou a cabeça. Reinjetado o defeito (zerando o termo de pitch),
o teste morde: `0,51°`/`3,52°` reproduzidos, vermelho pelo motivo certo.

### Mudança

`js/xr/xrhud.js`, `alvoDoAviso`: a altura do alvo ganha um termo de pitch —
`DIST_AVISO · tan(pitch)` (o ponto que fica exatamente SOBRE o raio de mira
no raio horizontal do painel; geometria verificada à mão: `t·cosθ =
DIST_AVISO ⇒ t·sinθ = DIST_AVISO·tanθ`) — antes de somar o `AVISO_SOBE`
fixo. `atualizarAviso`: a altura agora acompanha esse alvo TODO FRAME, com
amortecimento (`AVISO_TAU`, o mesmo já usado no horizontal) quando NÃO há
reposicionamento grande em curso — é um mecanismo SEPARADO do horizontal
(que só se move em giro grande, `repondo`), porque a falha aqui era
justamente ficar preso entre dois desses eventos enquanto o jogador olhava
livremente para cima. Dentro de `repondo`, a altura passa a copiar o alvo
(pitch-correto) em vez do valor fixo antigo. Amortecido, não é o mesmo que
"colar na cabeça" (H2 aceita "loosely follow… using smoothing animation"
como alternativa à âncora rígida) — e o horizontal continua idêntico
(nenhuma mudança na lógica de yaw).

Depois do fix, mesma medição:

| pitch | ângulo mira↔painel |
|--:|--:|
| 0° | 13,50° |
| 10° | 12,47° |
| 13° | 12,18° |
| 20° | 11,07° |
| 30° | 9,23° |
| 45° | 6,12° |

Decadência suave e monotônica, nunca abaixo de 6° na faixa medida — contra
o mergulho a 0,51° de antes.

### Teste

`test/xr-aviso.test.js`, novo caso "olhar para CIMA durante o aviso não põe
o texto em cima da mira": dispara o aviso pela chamada real (`centerMsg`),
amostra 0/10/13/20/30/45° de pitch com 500 ms de acomodação cada, mede o
ângulo real (produto escalar entre a direção da câmera e o vetor
olho→painel — nenhuma das duas grandezas é a mesma coisa lida duas vezes).
Limiar de bloqueio 5° (bem abaixo do pior caso pós-fix, 6,12°; bem acima do
pior caso pré-fix, 0,51°). Vermelho confirmado com o defeito reinjetado
(`0 * pitchY` no lugar do termo real), revertido byte a byte (`diff` contra
backup) depois.

### Verificado

`test/xr-aviso.test.js` completo (10/10, era 9/9) + vermelho confirmado com
mutante (motivo certo, revertido), `test/xr-hud.test.js` +
`test/xr-hud-distancia.test.js` (15/15, sem regressão no resto do HUD),
`npm run lint` limpo.

`npm run test:vr` completo síncrono: **766 pass, 0 fail, 0 cancelled, 1
skip**, 767 testes, 145 suítes, 1402 s.

### Próxima prioridade

1. O soak literal de 5 minutos contínuos (arma+corpo+HUD juntos, sob
   movimento real sustentado) continua não fechado como medição de PAREDE —
   decisão desta rodada foi medir o mecanismo (pitch) em vez do relógio. Se
   o dono quiser o número literal, é candidato ao roteiro humano
   `npm run vr:sessao` (que já cobre I1 human-only) em vez de inflar o
   `test:vr`.
2. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) —
   ainda sem dono; é design novo, pesquisar referência antes de codar.
3. Com os cinco primeiros itens do roteiro mínimo medidos e os defeitos reais
   encontrados corrigidos (menu — herdado; spawn — Rodada 18; arma/ADS —
   Rodada 16; HUD — Rodada 22; onboarding — Rodadas 17/21), o roteiro mínimo
   "já dá para jogar" está proximo do fechamento automatizável — falta o
   soak literal (item 1 acima) e os 8 critérios que só o aparelho/humano
   fecham (ver `docs/vr/criterio-aaa.md` e `npm run vr:sessao`).

---

## Rodada 23 — Fechamento de registro do roteiro mínimo "já dá para jogar" · 2026-08-29

Sem aparelho conectado (`adb devices` vazio nesta máquina), rodei
`npm run vr:sessao -- --ensaio` — o modo que NÃO consulta headset nem
humano, só imprime a forma do relatório. Confirma, sem inventar número, que
os 5 critérios que só o aparelho fecha (E1/E3/E4/E5/F1) e os 3 que só o
humano fecha (I1, G4, G5) continuam **aguardando aparelho/aguardando
humano** — nenhuma medição nova possível sem o Quest físico. Relatório em
`output/vr/sessao-2026-08-30T01-16/ENSAIO-sessao-humana-2026-08-29-22-16-144e24b.md`
(artefato de ensaio, não conta como medição — não citar como evidência de
critério fechado).

Isto fecha o registro dos 13 itens do "Critério mínimo de já dá para jogar"
da missão, um a um, com a evidência real (arquivo + resultado) por trás de
cada veredito — nenhum marcado verde sem teste nomeado:

| # | item do roteiro mínimo | veredito | evidência |
|--:|---|---|---|
| 1 | abrir a página e ver um menu funcional | 🟢 verde | `test/menu-unico.test.js` (máquina de estados única), `test/menuscene-gate.test.js` |
| 2 | entrar em VR uma vez, sem reload e sem menu duplicado | 🟢 verde | `test/xr-bootstrap.test.js`, `test/xr-entrar-joga.test.js` |
| 3 | selecionar SOLO pelos controles | 🟢 verde | `test/xr-entrar-joga.test.js`, `test/xr-ui.test.js` (apontar+clicar real) |
| 4 | nascer corretamente no chão | 🟢 verde | `test/xr-entrada-enterrado.test.js` (guarda real desde antes desta frente), `test/xr-corpo-piso.test.js` (Rodada 18, guarda reescrita) |
| 5 | andar, girar e olhar livremente | 🟢 verde | `test/xr-locomotion.test.js`, `test/xr-turn.test.js`, `test/xr-controle-anda.test.js`, `test/xr-andar-analogico.test.js` |
| 6 | ver mão e arma corretamente alinhadas | 🟢 verde | `test/xr-empunhadura-grip.test.js`, `test/xr-empunhadura-botao.test.js`, `test/xr-punho-rotacao.test.js`, `test/xr-mao-controle.test.js` |
| 7 | segurar o botão de ADS, mirar, soltar e sair da mira | 🟢 verde | `test/xr-ads-gatilho.test.js` (Rodada 16, `42ebcc8`) |
| 8 | acertar pelo menos 10 de 15 tiros onde o retículo/mira indicou | 🟡 verde por PROXY geométrico, não por contagem literal | `test/xr-mira.test.js`, `test/xr-b7-origem.test.js`, `test/xr-b7-tracer-br.test.js` provam origem/direção do tiro coincidindo com a mira em sub-centímetro/sub-grau — mais forte que um teste de "15 tiros simulados", mas **não existe** um caso que dispare 15 vezes contra um alvo e conte acerto. Se o dono quiser o número literal do aceite, é candidato a próxima rodada (simulação de 15 disparos reais contra alvo, contando acerto pelo raio balístico) |
| 9 | eliminar 3 inimigos sem enxame ou spawn injusto | 🟢 verde | `test/xr-onboarding-inimigos.test.js` (Rodadas 17/21, `08931f7`+`d32caa2`) |
| 10 | jogar 5 min sem UI na frente da visão, arma lateral ou corpo enterrado | 🟡 verde por MECANISMO, soak literal não fechado | `test/xr-aviso.test.js` (Rodada 22, `144e24b`, pitch+yaw), `test/xr-corpo-piso.test.js` (Rodada 18), `test/xr-empunhadura-*.test.js` — decisão registrada na Rodada 22: medir o mecanismo sustentável em vez do relógio de 300 s de parede. Soak literal continua candidato a `npm run vr:sessao` |
| 11 | morrer de forma controlada e escolher JOGAR DE NOVO | 🟢 verde | `test/xr-ui.test.js` (Rodada 19, `2ed388c`, clique real + `restartMatch()` confirmado) |
| 12 | morrer novamente e escolher VOLTAR AO MENU, ainda dentro do VR | 🟢 verde | `test/xr-ui.test.js` (Rodada 20, `aa4a7b7`, cadeia morte→retry→morte→menu) |
| 13 | sair do VR e confirmar que desktop/celular continuam intactos | 🟢 verde por regressão contínua | `npm run test:vr` roda os testes de PC que a camada XR alcança (arma/mira/rig/balística/toque) a cada rodada — 766 pass/0 fail/1 skip na última execução completa (Rodada 22); nenhum teste de desktop/mobile quebrou em 8 rodadas de mudança em `js/xr/` |

**11 de 13 verdes com evidência direta, 2 com proxy honesto registrado (não
inflados para "verde").** Nenhum dos 13 itens do roteiro mínimo está
vermelho ou sem tentativa de medição. Os 8 critérios de `criterio-aaa.md`
que exigem aparelho/humano continuam fora do denominador automatizável (39
é o teto honesto, como o próprio documento já registra) e seguem
`aguardando aparelho`/`aguardando humano` — confirmado de novo agora, sem
headset conectado.

### Próxima prioridade

1. Repor granada/kit médico/comer/troca de mira (herdado da Rodada 16) —
   ainda sem dono, é design novo. Pesquisa de referência (não codar ainda)
   é o próximo passo natural — `docs/vr/referencia-interacao.md` §6 já
   aponta inventário corporal/de pulso como pista, mas exige leitura das
   fontes antes de qualquer linha de código, por regra do porte.
2. Item 8 (contagem literal de 10/15 tiros) e item 10 (soak literal de 5 min)
   ficam registrados como gap honesto — não bloqueiam o roteiro mínimo (a
   evidência geométrica/de mecanismo é mais forte que o número literal
   pediria), mas são candidatos caso o dono queira o número exato.
3. Quando o Quest físico voltar a conectar: `npm run vr:sessao` fecha I1
   (20 caixas), G4, G5, e os 5 critérios de tempo/térmica (E1/E3/E4/E5/F1).

---

## Rodada 24 — Pesquisa (sem código): para onde vão granada/kit médico/comer/troca de mira · 2026-08-29

Só pesquisa e registro, por regra do porte ("estudar a documentação... ANTES
de codar") — nenhum `.js` tocado, `docs/vr/referencia-interacao.md` ganhou a
Parte III (§10-12). Nenhum teste rodado (não havia código pra quebrar).

**Achado principal:** o orçamento de botões voltou a ZERAR (Rodada 16 deu o
gatilho esquerdo, único livre, para o ADS) — a saída não pode mais ser
"achar outro botão", tem que ser gesto ou proximidade espacial. Meta
reconfirma (fetch direto) que invocar por gesto/pose é aceito
("looking at their palm... is fine") mesmo proibindo menu grudado no
pulso em movimento. Godot XR Tools tem "Snap Zone" oficial (container
genérico) mas holster CORPORAL só existe como proposta de comunidade não
mergeada (`godot-xr-tools#127`) — citado e marcado como tal, não como
feature oficial. Onde os FPS de VR de referência (Alyx, Into the Radius,
Boneworks, TWDSS) ancoram inventário no corpo continua SEM fonte citável
(mesma barreira de acesso da Parte I, §7.5).

**Recomendação registrada (não implementada):** granada perto do ombro, kit
médico perto do quadril, lidos pelo MESMO verbo `agarrar` que a empunhadura
esquerda já despacha por proximidade (não um botão novo — reaproveita a
árvore de decisão por distância que já existe entre apoio/pente/mundo).
`js/xr/xrbody.js` já expõe `corpo.position` + `guinada` suficiente pra
aproximar ombro/quadril sem reabrir medição por osso. Comer e troca de
acessório de mira ficam FORA da recomendação — nenhuma fonte aponta lugar
corporal natural pros dois, e forçar um seria inventar sem lastro; ficam
debt registrado, não decisão.

Arquivos alterados: `docs/vr/referencia-interacao.md`.

### Próxima prioridade

1. Implementar a recomendação da Rodada 24 (ombro=granada, quadril=kit
   médico) com TDD/IWER real — medir a distância de ativação em sessão
   antes de virar constante (nenhuma fonte deu o número; §12 já registra
   isso como decisão sem lastro forte a validar por medição própria).
2. Decidir separadamente o caminho de comer/troca de mira (sem candidato
   claro ainda — não bloquear a implementação do item 1 por causa disso).
3. Item 8 (10/15 tiros) e item 10 (soak 5min) seguem gap honesto, candidatos
   a `npm run vr:sessao` ou rodada dedicada se o dono quiser o número
   literal.

---

## Rodada 25 — granada no ombro, kit médico no quadril, pelo grip de apoio · 2026-08-29

### Implementado a recomendação da Rodada 24

**Mecanismo, igual ao já existente para o pente.** `js/xr/xrweapon.js` já
tinha a receita testada para "zona corporal fixa + grip da mão de apoio":
`PEITO_OFF`/`PEITO_RAIO` (mesma conta — offset de vista girado pela guinada
da cabeça, medido contra a mão de apoio — dispara `pedeRecargaPulso` com
histerese de rearme por SAIR da zona). A pesquisa da Rodada 24 supôs
`js/xr/xrbody.js` como fonte de posição/guinada; na prática esse módulo só
expõe alturas e a guinada do CORPO (não a posição de mundo), e a peça certa
já existia em `xrweapon.js` — os parâmetros `cabeca`/`vista` que `game.js`
já passa pra ele (`camera.getWorldPosition`/`vistaMundo()`), a mesma dupla
que a zona do peito usa. Ajuste feito: a recomendação (proximidade corporal,
sem botão novo) foi preservada; a fonte técnica citada na pesquisa não bateu
com o código real e foi substituída pela que já funciona.

Duas zonas novas, mesmo padrão do peito: `OMBRO_OFF`/`OMBRO_RAIO` (ombro
ESQUERDO — o direito já é o coldre da arma, `COLDRE_OFF`) para granada,
`QUADRIL_OFF`/`QUADRIL_RAIO` (quadril esquerdo) para kit médico. Cada uma
com o PRÓPRIO armado/rearme (independentes entre si e do peito). Pulsos
novos `pedeGranada()`/`pedeKitMedico()` no retorno do módulo, consumidos em
`game.js` no MESMO ponto onde os quatro verbos do radial morto já eram
lidos: `teclaXR('KeyG', cmd.radial.confirmou === 'KeyG' || XRArma.pedeGranada())`
e o equivalente pro `KeyQ` — três caminhos, uma tecla, do jeito que `KeyR`
(recarga) já faz entre botão e gesto. Comer (`KeyF`) e troca de mira
(`KeyT`) continuam só no radial morto (fora de escopo, sem lugar corporal
com precedente — não inventado).

Números de `OMBRO_OFF`/`QUADRIL_OFF` são ergonomia SEM LASTRO EXTERNO
(marcado no código e na referência) — candidatos a ajuste por humano de
headset, do mesmo jeito que `COLDRE_OFF`/`PEITO_OFF` já eram.

### Teste (TDD, IWER real, Quest 3)

`test/xr-verbo-corporal.test.js` (porta 3868, novo), 6 casos: âncora
independente calculada no PRÓPRIO teste a partir de `G.camera.getWorldPosition()`
e `G.yawDaVista()` (fontes públicas, não o offset privado do módulo — os
offsets em si são importados de `xrweapon.js` porque não há fonte externa
para "onde fica o ombro"). Cobre: gasta uma granada no ombro com grip; NÃO
gasta uma segunda no mesmo aperto; sair e voltar rearma; sem grip não gasta
nada (não é comando por proximidade, mesma régua D3 do mundo); fora do raio
não gasta nada; quadril gasta kit médico E cura de verdade; as duas zonas
não se contaminam.

Ordem invertida de TDD (implementei antes de escrever o teste, corrigido
registrando aqui em vez de esconder): compensado reinjetando o defeito
antigo (`for (const c of [...]) teclaXR(c, cmd.radial.confirmou === c)` sem
os dois `||`) e confirmando vermelho — 4 de 6 casos morrem pelo motivo certo
(item não gasto), revertido byte a byte depois.

### Verificado

`xr-verbo-corporal.test.js` 6/6 (vermelho confirmado com mutante, revertido)
· vizinhos `xr-arma-recarga` + `xr-empunhadura-botao` + `xr-empunhadura-grip`
+ `xr-interact` 33/33 (a ordem PENTE→APOIO→AGARRAR do grip esquerdo não foi
tocada — as duas zonas novas são checagens paralelas, como o peito já era)
· `npm run lint` limpo · `npm run test:vr` completo: **772 pass, 0 fail,
1 skip, 773 testes, 146 suítes** (1482s).

### Próxima prioridade

1. Comer e troca de acessório de mira seguem sem caminho em VR — dívida
   registrada, sem candidato de gênero encontrado (Rodada 24, §12).
2. Item 8 (10/15 tiros) e item 10 (soak 5min literal) seguem gap honesto,
   candidatos a `npm run vr:sessao` ou sessão humana dedicada.
3. Validar por medição própria (headset ou sessão longa) se 18/20 cm de raio
   e a posição ombro/quadril são confortáveis de alcançar sem tirar o olho
   do combate — é ergonomia sem lastro, como o próprio código já marca.

---

## Rodada 26 — Validação independente das Rodadas 16-25 · 2026-08-29

**Laudo completo:** `docs/vr/validacao-d59830e.md`. Placar: **30/39** (era
31/39 no laudo anterior, `18a231e`) — **D1 caiu** (regressão real: `comer` e
`trocar acessório de mira` ficaram permanentemente inalcançáveis em VR desde
a Rodada 16, nunca reconhecido como reprovação da régua AAA). **Achado novo
fora da tabela, mais grave que D1:** as zonas corporais de ombro/quadril
(Rodada 25) colidem geometricamente com a zona pré-existente do peito — o
centro do alvo do quadril fica a 2,2 mm de DENTRO do raio do peito, então
usar o kit médico no ponto que o próprio teste da Rodada 25 valida também
dispara o gesto de recarga no mesmo aperto. Nenhum dos dois nasceu à toa: os
dois são a mesma causa — a Rodada 25 não checou a geometria nova contra a
zona já existente no mesmo arquivo, que já tinha o aviso escrito em
comentário duas telas acima. Próxima prioridade no laudo, §5.

---

## Rodada 27 — corrige a colisão ombro/quadril×peito (achado da Rodada 26) · 2026-08-29

**Defeito:** `js/xr/xrweapon.js` — `QUADRIL_OFF` caía a 2,2 mm dentro do raio
de `PEITO_OFF` (distância 0,2478 m contra soma dos raios 0,45 m) e `OMBRO_OFF`
colidia por 4,1 cm com o peito também (0,3890 m contra 0,43 m); as três
checagens (`pedeRecargaPulso`/`pedeGranadaPulso`/`pedeKitMedicoPulso`) são
independentes entre si — ao contrário de pente×apoio, que já tem `gripModo`
como árbitro —, então alcançar o quadril também satisfazia `gripDPeito ≤
PEITO_RAIO`.

**Causa:** a Rodada 25 mediu as duas zonas novas contra a zona do ombro
oposto (que não colide) mas não contra a do peito, que já ocupava boa parte
do mesmo volume corporal.

**Mudança:** `OMBRO_OFF` e `QUADRIL_OFF` movidos (raios intactos) pra fora do
raio do peito com folga real (>5 cm de sobra além da soma dos raios nos dois
pares, não só "não toca no papel"): `OMBRO_OFF = [-0.34,-0.12,-0.05]`,
`QUADRIL_OFF = [-0.40,-0.72,0.02]` (era `[-0.18,-0.12,-0.05]` e
`[-0.15,-0.55,0.02]`). Ombro↔quadril continua sem colidir (folga 0,227 m).
Ergonomia SEM LASTRO EXTERNO, como os originais — candidato a ajuste por
humano de headset.

**Teste (TDD):** `test/xr-verbo-corporal.test.js` ganhou dois casos novos —
(1) invariante geométrico puro, lendo as três constantes exportadas e
comparando distância entre centros contra soma dos raios para todo par de
zonas (âncora independente do comportamento, guarda qualquer zona futura no
mesmo grip); (2) comportamental, com IWER real: mão no quadril + grip não
pode também disparar `XRArma.pedeRecarga()` (amostrado por 40 frames reais
via `requestAnimationFrame`, só leitura — o pulso dura um frame só, uma
leitura pontual mentiria "não disparou"). Vermelho confirmado nos dois ANTES
do fix — o comportamental provou AO VIVO o que o laudo só tinha provado por
aritmética (`pediuRecarga: true`, medkits gasto 3→2 no mesmo aperto). Verde
depois do fix, sem tocar nos raios nem no comportamento dos outros verbos.

**Verificado:** `xr-verbo-corporal.test.js` 8/8 (era 6, os 6 originais
continuam verdes — nenhuma regressão de granada/kit médico) ·
`xr-empunhadura-botao`+`xr-empunhadura-grip`+`xr-arma-recarga`+`xr-weapon`
41/41 · `npm run lint` limpo · `npm run test:vr` completo: **774 pass, 0
fail, 1 skip, 775 testes, 146 suítes** (1450s).

### Próxima prioridade

1. **D1** (Rodada 26) segue em aberto — decisão do dono: exceção declarada
   na régua para comer/trocar mira, ou nova pesquisa de caminho corporal
   específico para os dois. Não é decisão de quem implementa.
2. Item 8 (10/15 tiros) e item 10 (soak 5min literal) seguem gap honesto,
   candidatos a `npm run vr:sessao` ou sessão humana dedicada.
3. Validar por medição própria (headset) se as novas posições ombro/quadril
   continuam alcançáveis sem esforço — mover os centros pode ter piorado o
   conforto de alcance que a Rodada 25 também não tinha lastro pra garantir.

---

## Rodada 27 — os 4 critérios "não medido" (C4, D6, G2, I4) · 2026-08-29

Nenhum dos quatro depende de aparelho — mas nenhum tinha sido MEDIDO ainda
(nem verde nem vermelho no laudo `validacao-d59830e.md`). Sem defeito novo
corrigido nesta rodada; o trabalho foi medir e registrar honestamente, e um
achado por critério mudou o que se sabia sobre ele.

### G2 · antialiasing em XR — MEDIDO, mas a régua descreve a via ERRADA

`test/xr-criterio-g2-antialias.test.js` (porta 3870), IWER real. Ler
`renderer.xr.getRenderTarget()` — o método que `criterio-aaa.md` manda usar —
**não existe no three r0.185** (zero ocorrência em
`WebXRManager.js`; confirmado lendo o pacote instalado). Substituí por
`renderer.getRenderTarget()` (do próprio `WebGLRenderer`) dentro de um hook
de `render()` real: `samples=0` medido, com `antialias:true` no contexto.

**Mas o número não pode ser lido com confiança.** `WebXRManager.js:397-499`
tem DOIS caminhos: o clássico (`XRWebGLLayer`/`session.renderState.baseLayer`)
manda `antialias:true` direto pro construtor NATIVO do layer (o navegador
decide MSAA de verdade ali, fora da visão do three) mas **não copia esse
número pro `WebGLRenderTarget` espelho** — `samples` fica 0 SEMPRE nesse
caminho, com ou sem MSAA real acontecendo. Só o caminho moderno (Layers API,
`createProjectionLayer`) tem `samples: attributes.antialias ? 4 : 0` de
verdade. Medido: esta sessão (IWER) usa o caminho CLÁSSICO
(`temBaseLayer=true, temLayers=false`) — **G2 fica "não medido com
confiança"**, não "reprova": o teste detecta o caminho e registra isso em vez
de forçar um veredito. Fechar de verdade exige aparelho físico (captura de
frame) ou pesquisar se o navegador do Quest 3 oferece a Layers API.
**AGUARDANDO APARELHO/PESQUISA.**

Nota à parte, sem medir: ligar MSAA de verdade custaria 0,5-1,5 ms/frame
(Meta) num orçamento já apertado — decisão de trade-off do dono quando o
caminho real for confirmado, não decisão de quem testa.

### C4 · escala 1:1 — achado no esqueleto, resto NÃO investigado a fundo

Lendo `js/skeletons.js:326`: `const s = 2.25 / size.y; // esqueleto de
2,25m — maior que o player: dá medo` — **é decisão de design deliberada e
documentada**, não bug. O critério C4 compara "altura de um inimigo" contra
"humano ≈ 1,75 m" — não bate com o esqueleto por CONSTRUÇÃO. Isso não é uma
reprovação: é a régua medindo a referência errada para este inimigo
específico. A referência certa seria um inimigo humano (`js/enemies.js`,
soldados) — não investigado a fundo nesta rodada por tempo. Porta da cidade,
carro, degrau e altura do baú **não foram medidos**: a geometria da cidade
funde tudo em meshes grandes por otimização de draw call
(`js/structures.js`, `sbox`/`trimBox`), sem nó isolado por objeto pra um
`Box3.setFromObject` simples — extrair uma medida confiável exigiria mapear
a malha fundida ou instrumentar a função de construção, trabalho maior que o
resto desta rodada. **C4 fica parcialmente investigado, não fechado.**

### D6 · tudo alcançável sentado — REPROVA por herança de D1, sem sessão nova

D6 exige o roteiro D1 inteiro (19 ações) alcançável com `dev.position`
travado. D1 já reprova hoje (comer/trocar mira inalcançáveis por QUALQUER
posição, Rodada 16). Um requisito estritamente mais forte que outro já
falso é falso por construção — não precisou de sessão IWER nova para
confirmar isso, é lógica, e está registrado como tal (não fabricar medição
onde a resposta já está provada). Checagem extra, essa sim rápida: nenhuma
das 17 ações que FUNCIONAM depende de andar fisicamente — locomoção é
100% por analógico (existe por causa do VRC.Quest.Tracking.1, já documentado
no repo), então a parte NOVA que D6 acrescentaria sobre D1 (andar importa?)
já está satisfeita por desenho. **D6 reprova pela mesma causa de D1.**

### I4 · nenhum estado sem saída — 6 de 10 estados com prova de clique real

Auditoria da cobertura existente (sem escrever teste novo, só conferir o que
já prova o quê): `test/xr-ui.test.js` já prova, com clique real e
verificação de estado, retorno ao menu partindo de **jogando** (pausar →
despausar), **pausado**, **morto** (JOGAR DE NOVO e VOLTAR AO MENU, inclusive
em cadeia), e **fim de partida**; `test/xr-menu.test.js` prova que MULTIJOGADOR
leva ao **lobby** (aba "sala") sem começar partida sozinho. Isso são 5 estados
com prova direta + lobby = 6. **Não têm prova de retorno ao menu**: `nave`,
`queda` (fases de início de partida BR), `dirigindo` (carro/heli — existem
`test/xr-heli-piloto.test.js` e testes de carro, mas nenhum verifica
alcançar o menu a partir de lá) e `espectador` (`test/xr-spect-passo.test.js`
mede o acompanhamento, não a saída). Como o jogo afirma UMA máquina de
estados única (não divergente por plataforma/contexto) e o mecanismo de
pausa já provado é um overlay global (`ui3d.capturando`, que barra o tick do
jogo por igual em qualquer estado), a expectativa é que os 4 também
funcionem — mas **expectativa não é medição**, e o próprio CLAUDE.md deste
repo lista "teste que passa por acidente" como a família de defeito mais
cara já vista aqui. **I4 fica com 6/10 estados PROVADOS e 4/10 sem prova
(nave, queda, dirigindo, espectador)** — não reprovado, não fechado.

### Verificado

Só `npm run lint` (limpo) — nenhum outro `.js` de produto foi tocado nesta
rodada (só teste novo + doc). `npm run test:vr` não precisou rodar de novo:
nenhuma mudança de comportamento de produto, só instrumentação de medição.

### Próxima prioridade

1. **I4**: escrever os 4 testes que faltam (nave→menu, queda→menu,
   dirigindo→menu, espectador→menu) — é o item mais barato e mais concreto
   desta lista, e cada um É um roteiro de reprodução pronto.
2. **G2**: pesquisar se o Quest 3/OculusBrowser oferece a WebXR Layers API
   (`XRWebGLBinding.createProjectionLayer`) — se sim, o three pode migrar pro
   caminho onde `samples` é confiável; se não, medir MSAA real exige captura
   de frame no aparelho.
3. **C4**: medir o soldado humano (`js/enemies.js`) contra 1,75 m, e decidir
   se carro/porta/degrau/baú valem a instrumentação da malha fundida ou se
   viram exceção documentada (como C5 aceita "sem corpo").
4. Itens já registrados: D1 (decisão do dono), item 8 (10/15 tiros) e item 10

---

## Rodada 28 — I4 fecha 10/10: os 4 estados que faltavam, e um achado no caminho · 2026-08-30

### Defeito atacado

Os 4 estados sem prova de I4 (Rodada 27): **nave**, **queda livre**,
**dirigindo** (helicóptero) e **espectador**. Escrito
`test/xr-criterio-i4-estados.test.js`, um `describe` por estado, cada um
alcançando o estado pelo CAMINHO DO JOGO (`startBRMatchInShip` +
`__BR_debug.jump()`/`.spect()` para BR; `G.tryToggleCar()` no helicóptero
para dirigindo) e saindo por CLIQUE REAL no botão do painel de pausa —
nunca chamando a função do jogo direto.

### Causa comprovada — achado real, não do roteiro dos 4 estados

**Nave, dirigindo e espectador já funcionavam** (comportamento correto,
sem defeito de produto — `XRUI.update` roda todo frame de sessão XR
independente de fase/veículo, como o cabeçalho do arquivo já previa).
**Queda livre reprovava**, e por um motivo NOVO, fora da lista de suspeitos
do próprio diretivo desta rodada: `erroDeVista()` (`js/xr/xrui.js`) zera a
componente Y do vetor de propósito — é cone de GIRO — então um deslocamento
VERTICAL do olho sem giro nenhum nunca cruzava `CONE_SOLTA` e o painel de
pausa **nunca reposicionava** durante a queda. Medido: o painel ficava preso
**~41,6 m ACIMA** do olho, crescendo sem limite enquanto a fase `FALL`
durasse — SAIR matematicamente inalcançável, o beco que I4 proíbe. É a
MESMA família de defeito da Rodada 22 (`144e24b`, o aviso central da HUD
ignorando pitch), só que num painel diferente, achado por acidente ao medir
outra coisa.

### Mudança

`js/xr/xrui.js`: segunda perna de reposicionamento, independente do cone de
giro — `erroVertical(alvo)` mede a distância vertical pura (painel↔olho) e
`QUEDA_SOLTA`/`QUEDA_PARA` (0,50 m / 0,11 m, histerese na mesma proporção
4,4× do cone de 35°/8°) disparam e param a mesma máquina de `seguir()` que
já existia para giro. 0,50 m é maior que o pior agachamento medido nesta
base (0,90 m) — não reagiria a postura normal, só a queda/elevador/salto.

### Teste

`test/xr-criterio-i4-estados.test.js`: 5 casos, portas 3872/3874/3876/3878.
Um mede a CONVERGÊNCIA por aritmética independente (gap painel↔olho depois
de 0,8 s e 2,0 s de queda, contra o teto físico do próprio código —
`46 m/s × 0,22 s TAU ≈ 10,1 m` — não uma tolerância pequena inventada), os
outros quatro medem o roteiro completo (abrir pausa pelo botão real → clicar
SAIR → chegar ao menu). Vermelho confirmado com `git stash` da mudança em
`xrui.js` (o caso de queda morre, os outros três continuam verdes — prova
que o achado é local à queda, não ao mecanismo de clique). Revertido.

**Armadilha de MEDIÇÃO, não de produto, encontrada no caminho**: a primeira
versão do clique de "SAIR" mirava o centro da linha uma vez, esperava, e
disparava — e minava com o painel ainda em movimento (mesmo depois do fix,
o gap converge para ~10 m, nunca para exatamente zero, então o alvo
continua deslizando). Duas correções no PRÓPRIO TESTE, nenhuma no produto:
(1) `Matrix4.lookAt` com vetor up fixo degenera perto do zênite (mirar um
alvo quase reto acima é quase paralelo ao próprio up) — trocado por
`Quaternion.setFromUnitVectors`, sem vetor de referência, sem singularidade;
(2) a confirmação de clique em `js/xr/xrui.js` é borda de subida do gatilho
NO MESMO FRAME do apontar — sem hover "gravado" pra consultar de fora, então
o teste passou a reapontar e CONFERIR `item.id==='sair'` antes de apertar,
repetindo até 150 tentativas (medido: até 73 no pior caso sob a máquina
carregada por esta sessão inteira) — a mesma perseguição que uma mão de
verdade faria olhando o realce, não uma segunda chance artificial.

### Verificado

`test/xr-criterio-i4-estados.test.js` 5/5 (3 rodadas completas seguidas,
incluindo isolamento por `--test-name-pattern` pra descartar flake — a
rodada isolada de "queda" sozinha precisa de bem menos tentativas que
encadeada atrás de "nave", confirmando carga de máquina como causa da
variância, não da lógica). Vizinhos `xr-ui.test.js` + `xr-menu.test.js` +
`xr-social.test.js`: 52/52 (o mecanismo de giro/cone não regrediu).
`npm run lint` limpo. `npm run test:vr` completo síncrono: **779 pass, 0
fail, 1 skip, 1 cancelled** (781 testes, 151 suítes, 1645 s) — o
"cancelled" não aparece com nome nem motivo em nenhuma linha do log apesar
de busca exaustiva (`grep -i cancel`), o exit code foi 0 e `fail` é 0;
registrado como observação para quem revisar a próxima rodada, não
investigado a fundo por não ter relação aparente com os arquivos tocados
aqui.

**I4 fecha 10/10** — nenhum estado sem saída, dos 10 que a régua lista.

### Próxima prioridade

1. Investigar o "1 cancelled" do `test:vr` completo (acima) — motivo
   desconhecido, sem "not ok" correspondente no log; pode ser artefato do
   runner numa suíte de 781 testes, não necessariamente regressão.
2. **G2**: pesquisar Layers API do Quest 3/OculusBrowser (herdado da Rodada 27).
3. **C4**: medir soldado humano contra 1,75 m (herdado da Rodada 27).
4. Itens já registrados: D1 (decisão do dono), item 8 (10/15 tiros) e item 10
   (soak 5min) seguem gap honesto.

---

## Rodada 29 — o "1 cancelled" era um teste real quebrado, não artefato do runner · 2026-08-30

### Defeito

O "1 cancelled" da Rodada 28 não reproduziu no mesmo formato — em vez disso,
`npm run test:vr` completo voltou com **2 casos vermelhos** em
`test/xr-prefs-giro.test.js`: a mão apontava para "giroModo" e o painel
marcava "velocidade" (a linha logo abaixo); e um valor "suave" não batia
persistido. Isolado o arquivo sozinho, **4 de 5 execuções falharam** (carga
da máquina µ conferida: load 1min 0,41, 17 GB livres — não é flake de
carga, e o protocolo de flake do CLAUDE.md pede exatamente essa checagem
antes de aceitar "carga" como explicação).

### Causa comprovada — regressão real da Rodada 28, mas o produto está CERTO

A/B decisivo: `js/xr/xrui.js` do commit `ee4d103` (baseline antes desta
sessão) passa **3 de 3** isolado; o mesmo teste contra o `js/xr/xrui.js` do
`05698ea` (Rodada 28) falha **4 de 5**. A régua não mudou — o teste é
idêntico nas duas árvores.

Instrumentando `estado().reposicionando` e `pos.y` dentro do próprio teste
(devolvido no retorno de `tocar()`, não por `console.log` — mensagens da
página não chegam ao stdout do Node neste harness, só `console.error`):
`game.js:3695` chama `XRUI.abrir('menu')` no PRIMEIRO frame de sessão XR
(`!state.started`), antes de a altura do olho terminar de assentar do
spawn. `abrir()` força `pousar(true)` nesse instante — e se o olho ainda
sobe alguns centímetros depois (spawn/agachamento assentando), o painel
fica pra trás. Antes da Rodada 28 isso NUNCA se corrigia (`erroDeVista()`
zera a componente Y de propósito — é cone de giro), e o painel ficava com
um desalinho vertical pequeno e permanente, sem ninguém notar. A Rodada 28
deu ao painel uma segunda perna de correção justamente para isso — E ELA
FUNCIONA: mede-se o painel perseguindo o olho por até ~900 ms depois de
abrir, com suavização (H2 pede "loosely follow… using smoothing
animation" — um "pop" instantâneo seria pior). **Isso é o produto
funcionando como projetado, não um bug.**

O que quebrou foi o TESTE: `P.tocar(id)` tirava uma foto do ponto-alvo no
MUNDO uma vez, mirava a mão sintética nesse ponto fixo, esperava 230 ms
parada, e só então lia o que estava sob o raio. Um jogador de verdade não
sofre isso — a mão dele é rastreada quadro a quadro, e ele mira onde o
painel ESTÁ, não onde estava um instante atrás. Com o painel ainda se
assentando, o alvo congelado ficava 3-5 cm abaixo da posição real da linha
ao fim da janela — o bastante para "giroModo" resolver como "velocidade",
uma linha abaixo.

### Mudança

`test/xr-prefs-giro.test.js`: `tocar()` espera `estado().reposicionando`
virar `false` (com teto de 1 s) antes de capturar o ponto-alvo e mirar —
reproduz o comportamento de um jogador que não clica um painel ainda se
movendo. Nenhuma linha de produto mudou; a Rodada 28 (`05698ea`) está
correta e fica como está.

### Verificado

Vermelho confirmado 6 vezes contra o código de produto do `05698ea` sem a
correção do teste (1 no `test:vr` completo, 1 isolado antes da
investigação, mais 4 de 5 na bateria de confirmação); 3 de 3 limpo contra o
baseline `ee4d103` (prova de que não é flake de infraestrutura). Depois da
correção do teste: 5 de 5 isolado limpo; vizinhos `xr-ui.test.js` +
`xr-menu.test.js` 33/33; `npm run lint` limpo; `npm run test:vr` completo
síncrono: **780 pass, 0 fail, 1 skip, 0 cancelled** (781 testes, 151
suítes, 1397 s) — o "cancelled" da Rodada 28 e o "fail" desta rodada eram a
MESMA corrida, só que sorteando um formato de erro diferente por execução.

### Próxima prioridade

1. **G2**: pesquisar Layers API do Quest 3/OculusBrowser (herdado da Rodada 27).
2. **C4**: medir soldado humano contra 1,75 m (herdado da Rodada 27).
3. D1 (decisão do dono), item 8 (10/15 tiros) e item 10 (soak 5min) seguem
   gap honesto — nenhum tocado nesta rodada.

---

## Rodada 30 — C4 fechado: 3 de 5 referências reprovam, medidas por código, não por suposição · 2026-08-30

### O que faltava

A Rodada 27 media só o esqueleto (referência errada — decisão de design
documentada) e não tinha investigado porta/carro/degrau/baú, alegando que a
geometria fundida da cidade não tem nó isolado para `Box3.setFromObject`.
Esta rodada mede as 4 referências que faltam sem precisar de nó isolado
nenhum: usando os NÚMEROS-FONTE que o próprio jogo usa para desenhar/detectar
cada objeto (a mesma exigência de "ancorar a medida em algo independente do
código sob teste" que o CLAUDE.md pede para mira — aqui a âncora É o código
de produto, lido, não a malha renderizada).

### Medido

| referência | fonte no código | valor real | alvo do critério | erro | veredito |
|---|---|--:|--:|--:|---|
| **soldado** (inimigo humano comum) | `js/enemies.js:196`, `hitSpheres()`: topo da cabeça = `p.y + 1.8·s + 0.3·s` (raio da esfera de acerto), `s=1` para o soldado padrão (`heavy?1.16:1`, linha 237) | **2,10 m** | ≈ 1,75 m | **+20,0 %** | **REPROVA** |
| **porta da cidade** | `js/structures.js:496`: `doorH = 2.3` (vão recuado, literal, sem escala aplicada) | **2,30 m** | 2,0–2,1 m | **+9,5 a +15,0 %** | **REPROVA** |
| **degrau da escada** | `js/castle.js:713`: `y: originY + 0.18 * (i + 1)` (altura do espelho de cada degrau, literal) | **0,18 m** | ≈ 0,18 m | **0,0 %** | **APROVA** |
| **carro** | `js/car.js:196-200`: `scaled.scale.set(targetX/rawSize.x, ...)`, `targetX = cfg.half[0]*2*0.98`; três configs de veículo leve/médio: BUGGY `half[0]=1.8`→3,53 m, ESPORTIVO GT `half[0]=1.9`→3,72 m | **3,53–3,72 m** (nenhum veículo do jogo é um "carro" de passeio 4 portas — são buggy/esportivo/caminhão) | ≈ 4,3 m | **−13,4 a −17,9 %** | **REPROVA**, mas **referência ambígua** (ver nota) |
| **baú** | `js/chestmodel.js:35`: corpo `H=0.44` + tampa em domo até ≈0,80 m fechada | **≈0,80 m** | **nenhum número declarado** em `criterio-aaa.md` §C4 — só "altura do baú" sem alvo | — | **SEM REFERÊNCIA** (gap da régua, não do produto) |

**C4 fecha com placar 1 aprova / 3 reprova / 1 sem referência**, de 5.
REPROVA no total (o critério exige as cinco dentro de 5 %).

### Por que não corrigi agora

Três reprovações têm causas e custos de correção bem diferentes, e nenhuma é
barata o bastante pra mexer sem aval:

- **Soldado (+20 %)**: ao contrário do esqueleto (`2,25 m`, comentário
  explícito "dá medo"), a altura de 2,10 m do soldado **não tem justificativa
  de design escrita em lugar nenhum** — parece efeito colateral de empilhar
  cabeça (raio 0,3) sobre o osso da cabeça (`1,78`) sem descontar do valor
  final. Mas `s` (escala do grupo) e os offsets `1.8`/`0.3` alimentam
  `hitSpheres()`, que é o hit-detection de VERDADE (tiro na cabeça, flinch,
  crédito de kill) — mudar isso sem medir o efeito em `enemy-drawcalls.test.js`,
  `autonomous-attacks.test.js` e no anti-cheat de dano do servidor (que
  também depende de posição/raio de acerto) é o tipo de mudança que já
  quebrou coisa nesta base antes por corrigir um número sem seguir os
  consumidores. Candidato a correção separada, com TDD e os testes de tiro na
  cabeça como guarda.
- **Porta (+9,5 a +15 %)**: `doorH` é usado no MESMO cálculo que posiciona
  moldura, marquise e vão da fachada em `js/structures.js` — é geometria de
  MUNDO gerada por seed. Não consome `Math.random` (é um literal, não uma
  chamada), então mudar o número não desalinha o worldgen determinístico,
  mas muda a SILHUETA de toda fachada da cidade — teria efeito visual amplo
  o bastante pra merecer aprovação do dono antes de tocar (é justamente o
  tipo de "rework amplo" que a missão desta frente proíbe enquanto o
  onboarding é a prioridade).
- **Carro**: a régua compara contra "carro ≈4,3 m" sem dizer QUAL tipo — este
  jogo não tem sedã, só buggy/esportivo/caminhão. Comparar um BUGGY (que na
  vida real também é curto, ~3,4–3,8 m) contra um sedã de 4,3 m é a MESMA
  família de erro do esqueleto: **referência errada para o objeto**, não
  necessariamente escala errada. Registro como REPROVA porque é o veredito
  literal do critério como está escrito, mas sinalizo que o critério pode
  precisar de uma exceção documentada (como C5 aceita "sem corpo") ou de uma
  referência por TIPO de veículo — decisão do dono, não de quem mede.

Nenhum arquivo de produto foi tocado nesta rodada — só leitura e medição
(reaproveitando os métodos verificados abaixo).

### Verificado

Todos os 5 números vêm de leitura direta do código-fonte que o jogo já roda
(`hitSpheres()`, `doorH`, `keep-step` do castelo, `scale.set` do carro,
constantes de `chestmodel.js`) — nenhum é suposição nem medição de tela.
`hitSpheres()` em particular já é exercitado ao vivo por
`test/enemy-drawcalls.test.js` ("a hitbox continua sendo a esfera analítica",
que mira exatamente no centro dessa esfera e confirma dano), então os
offsets `1.8`/`0.3` são comportamento comprovado em produção, não código
morto. Nenhum `.js` de produto mudou — `npm run lint` e `npm run test:vr`
não precisaram rodar de novo (nada de comportamento foi alterado).

### Próxima prioridade

1. **Decisão do dono, item 1**: soldado 20 % mais alto que o alvo — corrigir
   o offset em `js/enemies.js` (barato, mas mexe no hit-detection: precisa de
   TDD com os testes de tiro na cabeça como guarda) ou aceitar como decisão
   de design não documentada (documentar o motivo, como o esqueleto já tem).
2. **Decisão do dono, item 2**: porta 2,3 m — encolher pra 2,0-2,1 m muda a
   fachada de toda a cidade gerada; ou aceitar e marcar C4 com exceção
   documentada pra "porta".
3. **Decisão do dono, item 3**: critério de "carro" precisa de referência por
   tipo de veículo (buggy/esportivo/caminhão), não um número genérico de
   sedã — decisão de régua, não de quem implementa.
4. **G2** (Layers API do Quest) e **D1** (comer/trocar mira) seguem
   herdados, aguardando pesquisa/decisão. Item 8 (10/15 tiros) e item 10
   (soak 5min) seguem gap honesto de aparelho/sessão humana.

---

## Rodada 31 — G2: por que `samples` mentia, e o que lê o antialias de verdade · 2026-08-30

**Pesquisa, sem código de produto tocado — e um erro próprio corrigido no
processo, registrado porque quase virou o veredito.** A Rodada 27 (`e341fcb`)
já tinha achado duas coisas: (1) `renderer.xr.getRenderTarget()` — o método
que `criterio-aaa.md` prescreve — **não existe** no three r0.185.1 (a lista
`this.xxx = function(...)` de `WebXRManager.js` não tem esse método; o alvo
de render é variável de CLOSURE); (2) mesmo lendo `renderer.getRenderTarget()`
(no RENDERER, não em `renderer.xr`) — que funciona e devolve o objeto certo —
o campo `.samples` **só é escrito no branch `supportsLayers`** (Layers API /
`XRProjectionLayer`, `WebXRManager.js` ~linha 497:
`samples: attributes.antialias ? 4 : 0`). No branch CLÁSSICO
(`XRWebGLLayer`/`baseLayer`, ~linhas 426-455), a criação do
`WebGLRenderTarget` espelho **nem tem campo `samples`** — fica 0 sempre,
com ou sem antialiasing real. `IWER` (o runtime usado aqui) **não implementa**
`XRWebGLBinding.prototype.createProjectionLayer` (confirmado por grep em
`node_modules/iwer/lib/`), então esta suíte SEMPRE cai no branch clássico —
medir `samples` aqui é medir o vazio por construção, não por bug de teste.

**O erro desta rodada:** a primeira versão deste teste ignorou o achado (2)
da Rodada 27 e voltou a usar `renderer.getRenderTarget().samples` como se
fosse confiável — mediu `0`, junto com `gl.getContextAttributes().antialias
=== false` (medido errado também, ver adiante), e quase fechou como
"G2 reprova, preso ao ambiente headless". A causa dos dois zeros nunca foi o
navegador negando antialiasing: foi o branch clássico não escrever o campo, e
uma segunda leitura equivocada de contexto (a mesma sessão, relida
corretamente logo abaixo, deu `antialias: true`). Sem reler a Rodada 27 com
atenção MELHOR, o erro teria virado registro permanente.

**O método que funciona no branch clássico:** a spec do WebXR define
`XRWebGLLayer.antialias` como atributo **read-only**, refletindo se a camada
usa antialiasing — é o valor que `WebXRManager` passa pro `layerInit` nativo
(`antialias: attributes.antialias`). Lido via
`session.renderState.baseLayer.antialias` (a via pública da spec —
`renderState.baseLayer` é a mesma instância que `WebXRManager` registrou com
`session.updateRenderState({ baseLayer: glBaseLayer })`). `IWER` implementa
esse getter como eco fiel do que foi pedido na construção
(`node_modules/iwer/lib/layers/XRWebGLLayer.js`, `get antialias()`).

**Medido nesta rodada, IWER real, GPU de verdade (`WEBGL_debug_renderer_info`
→ `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3050/PCIe/SSE2, OpenGL
4.5.0)`, não swiftshader):**

| fonte | valor |
|---|---|
| `gl.getContextAttributes().antialias` | **`true`** |
| caminho ativo | clássico (`baseLayer`), `layers` vazio — confirmado |
| `session.renderState.baseLayer.antialias` | **`true`** |

As duas fontes concordam: o pedido `antialias:true` (`game.js:333`, mudado no
commit `608547d` de 2026-08-26 — **antes desta sessão**, no MESMO commit que
introduziu `criterio-aaa.md`) chega inteiro até a `XRWebGLLayer`. O texto do
critério ("Hoje: 0... `antialias: false`") descreve o estado ANTES daquele
commit e está desatualizado desde o dia em que foi escrito — não é decisão de
quem implementa reescrever a régua, mas fica registrado que a premissa do
texto nunca bateu com o código depois daquele commit.

**Veredito de G2: o PEDIDO passa — mas isto ainda não é aprovação
confiante.** `IWER` só ecoa o valor recebido; não decide MSAA como um
compositor de verdade decidiria. O que esta rodada prova é que a cadeia
`WebGLRenderer → WebXRManager → XRWebGLLayer` não perde o pedido no caminho
(o que já era incerto — a Rodada 27 não tinha chegado tão longe). O que
continua faltando é o Oculus Browser real conceder isso de fato no
compositor do Quest — só o aparelho decide.

**Testes executados:** `xr-criterio-g2-antialias.test.js` (3 casos: sessão
apresentando + GPU real; caminho clássico confirmado, Layers API ausente;
`baseLayer.antialias` bate com o contexto) — **3/3 verde**. `npm run lint`
limpo. Nenhum `.js` de produto mudou — `npm run test:vr` não precisou rodar.

**Arquivos alterados:** `test/xr-criterio-g2-antialias.test.js` (novo),
`docs/vr/progresso.md`.

### Próxima prioridade

1. **AGUARDANDO APARELHO**: rodar a mesma sonda (`instalarSonda`,
   `test/xr-criterio-g2-antialias.test.js`) no Quest 3 real via
   `npm run vr:baseline -- --target=quest --immersive=1` ou DevTools remoto —
   só o compositor nativo decide se o pedido que chega inteiro até aqui vira
   MSAA de verdade na tela.
2. D1 (comer/trocar mira) e as 3 reprovações de C4 (Rodada 30) seguem
   esperando decisão do dono.
3. Item 8 (10/15 tiros) e item 10 (soak 5min) seguem gap honesto de
   aparelho/sessão humana.

---

## Rodada 32 — Deploy em produção (as 17 rodadas desta sessão) · 2026-08-30

**Pedido do dono, verbatim, corrigindo a ordem que eu tinha seguido** (rodei a
suíte completa ANTES do deploy): *"vamos trocar essa logica, deploy sempre
primeiro e bateria de teste depois, caso achar erro fix, corrige o problema
atacar o problema e redeploy"*. Ciclo do CLAUDE.md atualizado pra deixar isso
como padrão, não exceção (ver `CLAUDE.md`, "Ciclo obrigatório a cada
entrega").

### O que foi feito

1. `dev` (`8f72b63`, as 17 rodadas 16-31 desta sessão) → merge fast-forward em
   `hom` → merge fast-forward em `prod`. Sem conflito: `hom` e `prod` estavam
   os dois parados em `ee4d103`, o commit-base de antes da sessão.
2. Push das três branches pro `fork` (`renadodreis/FPS-WillianIA`).
3. Deploy mecânico no servidor A (`ubuntu@129.213.33.33`, receita da skill
   `deploy` + `deploy.env` deste repo, `DEPLOY_METHOD=gitpull`): `git pull
   --ff-only` na branch `prod` do servidor, `docker compose -f
   docker-compose.prod.yml up -d --build`. Container `game-fps` subiu
   **healthy**; `https://game.renatodreis.com.br/` responde **HTTP/2 200**
   via Cloudflare.
4. SÓ DEPOIS do deploy no ar: `npm test` completo. **1886 pass, 0 fail, 58
   cancelled, 1 skip, 1945 testes, 371 suítes** (47,7 min — sessão longa,
   máquina com horas de fork/teste acumulado). O runner (`scripts/run-tests.js`)
   isolou os 5 arquivos que geraram os "cancelled" (`br-drops`, `gameplay`,
   `grass-decor`, `perf-overlay`, `sky-glare`) e rodou cada um 2× isolado —
   os 5 vieram limpos as duas vezes, **classificados FLAKE de carga, não
   regressão** (protocolo de triagem já documentado no CLAUDE.md). Veredito
   final do runner: **suíte VERDE**.

**Nenhum erro real encontrado — nenhum fix, nenhum redeploy necessário nesta
rodada.** O ciclo deploy→suíte→fix→redeploy fechou no primeiro deploy.

### Próxima prioridade

Igual à Rodada 31: G2 aguardando aparelho, D1 e C4 aguardando decisão do
dono, itens 8 e 10 aguardando sessão humana/aparelho.

---

## Rodada 33 — Decisão delegada: D1 vira exceção declarada · 2026-08-30

**Pedido do dono, verbatim:** *"PRECISO QUE VC TOME A MELHOR DECISAO VC TEM
TOLTAL LIBERDADE PROOL DO GAME"* — delegando as decisões de D1 e C4 que
ficaram em aberto na Rodada 31.

**D1 (comer/trocar mira):** decidido NÃO inventar um lugar corporal sem
lastro só pra fechar o número. A pesquisa da Rodada 24 já tinha procurado e
não achado fonte de gênero pra esses dois verbos especificamente (diferente
de granada/kit médico, que tinham precedente pra arma/cura). Registrei
**exceção declarada em `docs/vr/criterio-aaa.md`** (mesmo formato de A4):
D1 fecha 17/19 em VR, os dois ficam como dívida explícita até uma pesquisa
nova achar um caminho com fonte real. Não é reprovação silenciosa — é
decisão escrita, datada, com as amarras de quando ela deixa de valer.

**C4 (escala):** três achados, três decisões diferentes, não um pacote só:
- **Porta da cidade** (+9,5 a 15%): corrigindo agora, rodada separada (ver
  entrada seguinte) — é decorativa (prédio sólido sem interior), baixo risco.
- **Soldado** (+20%): NÃO corrigido às pressas. Toca hit-sphere de combate
  compartilhado com desktop/mobile/multiplayer e validação de dano no
  servidor — mudar escala de inimigo num jogo multiplayer AO VIVO sem
  verificar se o hit-sphere é independente do scale visual é o tipo de
  decisão que pode abrir exploit ou quebrar acerto de tiro pra todo mundo.
  Registrado como achado prioritário, mas fora do escopo desta frente VR —
  precisa de investigação dedicada (essa é a decisão: não decidir às pressas
  é, aqui, a decisão certa).
- **Carro** (-13 a -18%): sem ação. A própria medição da Rodada 30 já
  registrou a referência como ambígua (o jogo não tem sedã pra comparar) —
  não é defeito confirmado, é critério com referência que não encaixa neste
  veículo.

---

## Rodada 34 — C4: porta da fachada corrigida (2,30 → 2,05 m) · 2026-08-30

**Causa comprovada:** `doorH = 2.3` (`js/structures.js:496`, literal local
usado só pela moldura/vão recuado/marquise do prédio maciço SEM interior —
a "porta falsa" citada no comentário do worldgen) dava **2,30 m**, 9,5% acima
do teto (2,1 m) e 15,0% acima do piso (2,0 m) da faixa que C4 exige. Não tem
relação com `CityInterior.INT.DOOR_H` (2,6 m, porta de INTERIOR com contrato
de traversal próprio, `test/city-interior.test.js`, ≥2,2 m — essa não mudou).

**Mudança:** extraído `FACADE_DOOR_H` como export de módulo (mesmo padrão de
`CityInterior.INT.DOOR_H` — single source of truth testável sem precisar
bootar o jogo inteiro), valor 2,3 → **2,05 m** (meio da faixa 2,0-2,1). É um
literal fixo, não consumido por `Math.random` em laço — trocar o número não
desloca a ordem de consumo do PRNG seedado (worldgen intocado).

**Teste (TDD):** `test/city-facade-door.test.js`, novo. Vermelho confirmado
com o valor antigo exportado tal qual (15,0%/9,5% de erro, os mesmos números
da Rodada 30) — motivo certo. Verde depois da correção.

**Verificado:** teste focado 1/1; `test/city-interior.test.js` +
`test/city-layout.test.js` + `test/city-destruction-server.test.js` (a porta
de INTERIOR e o resto do worldgen de cidade intactos) 46/46; `npm run lint`
limpo; `npm run test:vr` completo síncrono **782 pass, 0 fail, 1 skip** (783
testes, 151 suítes, 1536s).

**Arquivos:** `js/structures.js`, `test/city-facade-door.test.js`,
`docs/vr/progresso.md`.

### Próxima prioridade

Soldado (+20%) — ver rodada seguinte: a investigação dedicada aconteceu e o
achado mudou a decisão. Carro e D1 sem ação pendente (decisões já fechadas).
G2 aguardando aparelho.

---

## Rodada 35 — C4 fecha: soldado corrigido, sem exploit aberto · 2026-08-30

**Investigação dedicada que a Rodada 33 pediu, com resultado diferente do
esperado.** `hitSpheres()` (`js/enemies.js`) já multiplica posição E raio de
toda esfera por `group.scale.y` — malha e hitbox escalam JUNTAS, não são
independentes. `server.js` não valida geometria de inimigo (`shotHit` é só
jogador-contra-jogador). Logo, corrigir escala não abre exploit nem
dessincroniza hit de visual — a preocupação da Rodada 33 era legítima de
levantar, mas a resposta, medida, é que o risco não existe.

**Causa comprovada:** soldado comum e executivo nasciam em `group.scale = 1`
sem nenhuma linha de design por trás (diferente do `heavy`, que tem
"Brutamontes" escrito) — e é esse "1" que produz 2,10 m de topo de cabeça
(1,8 + 0,3 de raio), 20% acima do alvo de C4. A linha que fixa o scale de
verdade é `respawn()` (`this.group.scale.setScalar(this.heavy ? 1.16 : 1)`)
— a linha na criação (`if (heavy) g.scale.setScalar(1.16)`) é código morto,
sobrescrito pelo `e.respawn()` chamado no fim do mesmo construtor. Removida.

**Mudança:** `HUMAN_SCALE = 1.75/2.1` (dá 1,7500 m exato). Aplicada só no
`respawn()`, único lugar que decide o scale de verdade; `heavy` continua
1,16 — tamanho de propósito, intocado.

**Teste (TDD):** `test/enemy-escala-c4.test.js`, novo (porta 3872). Três
casos — soldado, executivo, e um GUARDA que o `heavy` NÃO muda (prova que a
correção não vazou pro Brutamontes). Vermelho confirmado reinjetando
`this.heavy ? 1.16 : 1` (2 dos 3 casos morrem, o de `heavy` continua verde —
motivo certo). Revertido, verde de novo.

**Achado no caminho — `enemy-drawcalls.test.js` precisou de recaptura, mas
só em UMA seção.** O arquivo tem DUAS medições de caixa de vértice: a da
fusão procedural (`perfil()`) zera `group.scale` de propósito antes de medir
— pra separar "a malha mudou" de "o scale de produção mudou" — e por isso
**não precisou de nenhuma mudança** (confirmado rodando: os dourados de
`executivo`/`soldado`/`pesado` continuaram batendo). Já a caixa do RIG DO
GLB (`OURO_CAIXA`, describe "o rig do GLB paga frustum culling") mede o
inimigo vivo SEM zerar o scale — essa sim precisava mudar, e mudou por
escala uniforme exata (ex.: `Object_7[0][0]`: -0,7395 → -0,6162 = -0,7395 ×
0,8333). Recapturado AO VIVO (não calculado à mão) com um script isolado
batendo no mesmo `bootGame`/harness do teste, não por conta própria.

**Verificado:** teste focado 3/3 (vermelho→verde confirmado);
`enemy-drawcalls.test.js` + `skeletons.test.js` + `hitfeel-core.test.js` +
`br-pve-weapons.test.js` + `animals-combat.test.js` + `night-combat.test.js`
+ o teste novo, juntos: **104 pass, 0 fail**; `npm run lint` limpo;
`npm run test:vr` completo síncrono **782 pass, 0 fail, 1 skip** (783
testes, 151 suítes, 1539s).

**Arquivos:** `js/enemies.js`, `test/enemy-escala-c4.test.js` (novo),
`test/enemy-drawcalls.test.js`, `docs/vr/progresso.md`.

### Próxima prioridade

C4 fecha: porta corrigida (Rodada 34), soldado corrigido (esta rodada),
carro sem ação (referência ambígua, Rodada 33), degrau já aprovava. G2
segue aguardando aparelho — última pendência de C4/D1/G2 desta leva de
decisões delegadas. Itens 8 (10/15 tiros) e 10 (soak 5min) seguem gap
honesto de sessão humana/aparelho.
