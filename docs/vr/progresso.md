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
