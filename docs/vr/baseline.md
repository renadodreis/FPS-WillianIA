# VR — Baseline (Fase 0)

Data: 2026-08-25 · branch `refatoracao` · three r0.185.1 · Node 20.20

> **Medido no aparelho em 2026-08-25.** Quest 3 (`eureka`, Android 14), Adreno
> 740, OculusBrowser 150 / Chrome 150, por `adb reverse` + CDP. Falta uma única
> medição: frame time dentro de **sessão imersiva** — ver "O teto de 30 Hz"
> abaixo, que é o motivo de o número de FPS do painel 2D não servir.

## Como regerar estes números

```
npm run vr:baseline -- --target=local  --seconds=32     # esta máquina (GPU real)
npm run vr:baseline -- --target=quest  --seconds=90     # Quest 3 por adb + CDP
node scripts/perf-probe.js 3269 saida.json              # throughput de GPU, poses fixas
```

`scripts/vr-baseline.js` **não toca no runtime**: liga o overlay de perf que já
existe (`js/perfhud.js`, que assume `renderer.info.autoReset = false` — sem isso
o contador de draw calls descreve só o último passe do pós), lê `renderer.info`
uma vez por frame num `requestAnimationFrame` que entra na mesma fila do loop do
jogo, e passeia por quatro poses fixas (spawn, cidade, castelo, canhão) via
`window.__game`. Zero consumo de `rand`, zero mudança de worldgen.

O modo `--target=quest` faz sozinho: `adb reverse` da porta do servidor (o
aparelho enxerga `http://localhost:<porta>` — **contexto seguro sem HTTPS**, que
é o que o WebXR vai exigir da Fase 1 em diante), descobre o socket de DevTools do
navegador do Quest em `/proc/net/unix`, faz `adb forward tcp:9222`, abre a URL
por intent e anexa o puppeteer. `adb` 34.0.4 e a regra udev do fornecedor 2833 já
estão instalados nesta máquina.

## Medido NO QUEST 3 (navegador, painel 2D)

`npm run vr:baseline -- --target=quest --seconds=60`, seed 424242, servidor
desta máquina alcançado por `adb reverse` (o aparelho vê `http://localhost`,
que é **contexto seguro sem HTTPS** — é assim que o WebXR fica disponível sem
publicar nada).

| Item | Medido no Quest 3 | Alvo VR | Teto VR |
|---|--:|--:|--:|
| GPU | Adreno 740 | — | — |
| Buffer de render | **750×562** (dpr 0,8 · escala adaptativa em 0,75) | — | — |
| Draw calls (mediana / pior) | **413 / 805** | 120 | 180 |
| Triângulos (mediana / pior) | **813 k / 1,51 M** | 350 k | 500 k |
| Materiais únicos | **499** | 40 | 60 |
| Luzes com sombra | **4** | 1 | 1 |
| Programas de shader | 97 | — | — |
| Texturas na GPU | 151 | — | — |
| **Boot até o 1º frame** | **7,79 s** (cache QUENTE: 0,02 MB baixados) | 3 s | **4 s** |
| Núcleos expostos ao navegador | **3** | — | — |
| `navigator.xr` | **true** | — | — |

Por pose (1727 frames, ~60 s):

| Pose | fps | p50 | p1% | draw calls | triângulos |
|---|--:|--:|--:|--:|--:|
| spawn | 29,9 | 33,4 ms | 56,3 ms | 235 | 800 k |
| cidade | 29,9 | 33,4 ms | 67,5 ms | 270 | 788 k |
| castelo | 30,0 | **33,3 ms** | 59,9 ms | **632** | **1,19 M** |
| canhão | 29,9 | 33,4 ms | 38,9 ms | 419 | 917 k |

### O teto de 30 Hz — por que o FPS acima não mede nada

Olhe a coluna `p50`: **33,3–33,4 ms nas quatro poses**. O castelo tem **2,7× mais
draw calls** que o spawn (632 contra 235) e 1,5× mais triângulo, e a mediana não
se move um décimo. Carga 2,7× maior com mediana idêntica não é saturação — é
**teto**: o navegador do Quest limita a página em painel 2D a 30 Hz.

Consequência prática: o `29,9 fps` descreve a política de composição do painel,
não a capacidade do aparelho — exatamente o mesmo erro que o `60 fps` do desktop
(vsync). **Frame time só vale medido dentro de sessão imersiva**, onde quem
agenda o frame é `session.requestAnimationFrame` na cadência do headset. Para
isso existe `npm run vr:baseline -- --target=quest --immersive=1`, que entra em
VR pelo botão do menu (o clique do puppeteer é evento confiável, então vale como
gesto do usuário) e lê a estatística do `js/perfhud.js` — que mede dentro do
`tick`, e em XR o `tick` é chamado pela sessão.

O que o painel 2D ainda entrega de útil, e é bastante:

1. **Boot de 7,79 s até o primeiro frame, com cache quente.** O requisito de loja
   é **4 s até gráfico head-tracked**. É quase o dobro, no melhor caso possível —
   0,02 MB baixados, tudo servido do cache, sem rede no caminho. Cold boot é
   pior. Este é o item que reprova o app no review sem ter nada a ver com FPS, e
   a causa é conhecida: `game.js` monta o mundo inteiro de forma síncrona no
   escopo do módulo.
2. **A conta bruta bate com o desktop** (413 vs 463 draw calls, 499 materiais
   iguais). Confirma o que o plano assume: draw calls, triângulos e materiais
   **não dependem do aparelho**, então cortar esse orçamento pode ser feito e
   verificado aqui, sem headset na mão.
3. **~21× mais pixel esperando.** O painel desenha 750×562 = 421 mil pixels, já
   com a escala adaptativa recuando de 0,80 para 0,75 sozinha. Em estéreo o
   Quest 3 pede ~2064×2208 por olho, os dois olhos: ~9,1 milhões de pixels.
4. **Três núcleos** expostos ao navegador, e o JS do jogo roda num só.

## Medido — complexidade da cena (desktop, para comparação)

Servidor local, seed 424242, Chrome 151 com GPU real (RTX 3050), viewport
1280×720, tier `alto` (o que a máquina escolhe sozinha: res 1.5, sombra, bloom,
SMAA). Duas execuções, variação < 0,3 %.

| Item | Medido | Alvo VR | Teto VR | Situação |
|---|--:|--:|--:|---|
| Draw calls (mediana) | **463** | 120 | 180 | **2,6× acima do teto** |
| Draw calls (pior pose: castelo) | **740** | 120 | 180 | **4,1× acima do teto** |
| Triângulos (mediana) | **956 k** | 350 k | 500 k | **1,9× acima do teto** |
| Triângulos (pior pose: castelo) | **1,26 M** | 350 k | 500 k | **2,5× acima do teto** |
| Materiais únicos na cena | **499** | 40 | 60 | **8,3× acima do teto** |
| Luzes dinâmicas com sombra | **4** (cascatas CSM) | 1 | 1 | 4× |
| Programas de shader linkados | 108 | — | — | — |
| Texturas na GPU | 171 | — | — | — |
| Payload de boot | **10,57 MB** em 146 requisições | — | — | cabe folgado no APK |
| Boot até 1º frame | **2,38 s** (desktop, servidor local) | 3 s | 4 s | sem folga pro Quest |

Por pose (mediana de ~8 s cada):

| Pose | draw calls | triângulos |
|---|--:|--:|
| spawn (mato aberto) | 281 | 839 k |
| cidade (Torre Nexus) | 274 | 791 k |
| **castelo** | **740** | **1,26 M** |
| canhão | 471 | 968 k |

Censo da cena (o que existe, não o que passa no culling):

```
1541 meshes · 185 InstancedMesh (174 005 instâncias) · 334 SkinnedMesh
1506 geometrias únicas · 499 materiais únicos · 4 luzes com sombra
```

Throughput de GPU isolado (`scripts/perf-probe.js`, 800×600, mono, composer
no-op, tier `baixo`): **4,5 ms** por frame de mediana, 550 draw calls e 845 k
triângulos no pior caso. Numa RTX 3050 sobra folga; o número que viaja pro Quest
é a **conta bruta**, não o tempo.

### O que estes números NÃO dizem

- **FPS aqui é inútil.** O Chrome desta máquina trava em 60 (vsync): p50 = 16,7 ms
  em todas as poses. Não mede capacidade, mede o monitor.
- **É mono.** Em estéreo, tudo que é por-visão (draw calls, vértice, pós) paga
  duas vezes. Ver "Multiview" abaixo: não há atalho nesta versão do three.
- **É desktop.** Um núcleo do Snapdragon XR2 Gen 2 roda JS a algo entre 1/3 e 1/5
  de um núcleo desktop. O boot de 2,38 s — que é **worldgen síncrono** — é o
  número mais assustador da tabela, e é CPU pura.

## Leitura do gargalo dominante

**O gargalo dominante é a CONTA DE SUBMISSÃO POR FRAME, não a GPU.**

463 draw calls medianos e 499 materiais únicos numa cena que precisa caber em 120
e 40, renderizada duas vezes (um olho cada), num navegador, dentro de 11 ms. O
custo de submissão em WebGL é dominado por troca de estado — e 499 materiais
únicos com 1506 geometrias únicas é o retrato de uma cena montada objeto a
objeto, cada módulo `createX()` criando o próprio `MeshStandardMaterial`. Os 185
`InstancedMesh` (174 mil instâncias) mostram que a parte já resolvida — grama,
árvores, flores — está certa; o problema é a **cauda**: 1541 meshes soltos e 334
`SkinnedMesh`.

Em segundo lugar, empatados:

1. **334 SkinnedMesh.** É a mesma raiz já medida na frente de celular ("29 meshes
   por inimigo"): cada personagem é uma dezena de meshes rígidos num esqueleto em
   vez de um mesh só. Cada um é draw call + upload de matriz de osso. Esta é a
   maior fonte isolada de draw call e a que mais cresce com jogadores na sala.
2. **CSM com 4 cascatas de 1024².** São 4 passes de sombra por frame, e em
   estéreo o mapa é compartilhado mas o custo de preencher não. O orçamento
   manda 1 sombra direcional. O `js/perfhud.js` já mostra que a cadência das
   cascatas é escalonada (uma por frame), o que ajuda — mas ainda são 4 mapas.
3. **Pós-processamento (Bloom + SMAA + Output).** Três passes em resolução cheia.
   Em estéreo custam o dobro, e o `EffectComposer` **não funciona** com o
   framebuffer do WebXR de qualquer jeito. Sai inteiro em XR (decisão já tomada
   no plano; aqui só confirmo que é obrigatório, não opcional).
4. **Boot de 2,38 s em desktop.** `game.js` monta o mundo inteiro de forma
   síncrona no escopo do módulo (grade de altura, estruturas, inimigos, grama,
   GLBs). No Quest isso vira facilmente 6–10 s, contra um requisito de loja de
   **4 s até gráfico head-tracked**. Este é o item que pode reprovar o app no
   review sem nenhuma relação com FPS.

## Achados que MUDAM o plano

### 1. Multiview não existe no renderer que o jogo usa — não vamos usar

O plano manda habilitar `OCULUS_multiview` e medir. Verificado no código do
three r0.185.1 instalado:

- `src/renderers/webxr/WebXRManager.js` (o do `WebGLRenderer`, que é o que o jogo
  usa): **zero** ocorrência de multiview.
- `src/renderers/common/XRManager.js` (o do `WebGPURenderer`, stack nova):
  suporta `OVR_multiview2` via `WebGLBackend`.

Ou seja, multiview exigiria migrar de `WebGLRenderer` para `WebGPURenderer`
(`three/webgpu`). Isso quebraria, de uma vez: o addon `CSM` (injeta shader por
`onBeforeCompile`), todo o `EffectComposer`, o addon `Sky` com o uniform `uGlare`
customizado, e a injeção de shader da grama. É reescrever a camada de renderização
inteira.

**Decisão: não usar multiview.** O ganho típico (20–40 % do custo de submissão)
sai mais barato e com menos risco cortando 463 → 120 draw calls, que ajuda os
dois olhos e também o desktop. Registrado aqui para não ser reaberto sem motivo
novo.

### 2. A câmera vira filha de um rig — e `camera.position` deixa de ser mundo

Confirmado lendo `WebXRManager.updateUserCamera`: em XR o three **sobrescreve**
`camera.position`/`quaternion`/`fov` a cada frame, calculando a pose da cabeça
**relativa ao `camera.parent`**. Isso define a arquitetura da Fase 1 sem margem
para escolha:

```
scene
 └── xrRig (Group)   ← o JOGO move isto (posição e giro do jogador)
      └── camera     ← o HEADSET move isto (o three reescreve todo frame)
```

Consequências medidas: **~85 referências a `camera.` no código** (45 em
`game.js`, 8 em `city-destruction-client.js`, 7 em `js/fpbody.js`, 5 em
`js/weaponrig.js` e `br-game.js`, 4 em `js/menuscene.js` e `js/env.js`). Toda
escrita (`applyFpsCamera`, o passeio do menu, a cinemática da cidade) precisa
migrar para o rig; toda leitura de `camera.position` como **posição de mundo**
precisa virar `camera.getWorldPosition()`, porque com pai a posição local não é
mais a do mundo.

### 3. A arma é filha da câmera

`weaponRoot` pendura na câmera. Em VR isso gruda a arma na cara. Na Fase 1 ela
some em XR; na Fase 4 ela passa a ser filha do grip do controle.

### 4. HUD é DOM puro

99 elementos com `id` no `index.html`, 30 `getElementById` só no
`multiplayer-client.js`. Nada disso aparece dentro do headset. É exatamente o
tamanho da Fase 5, e é bom saber agora que não existe nenhum HUD in-world para
reaproveitar.

## O que ainda falta medir no aparelho

Uma coisa só: **frame time dentro de sessão imersiva**, que é o que fecha o
portão da Fase 1 (72 fps travados).

```
npm run vr:baseline -- --target=quest --immersive=1 --seconds=60
```

A corrida chegou a entrar em VR e amostrar, mas o relatório morreu na faxina
(`adb forward --remove` de um encaminhamento já removido derrubava o processo
DEPOIS do dado colhido). Corrigido — faxina nunca derruba medição. Falta só
rodar de novo com o aparelho conectado.

### Armadilhas do aparelho, aprendidas com ele na mão

Custaram três corridas de 60 s e estão todas cobertas no script agora:

1. **O socket de DevTools só existe com o navegador NO AR.** Procurar antes de
   abrir o navegador não acha nada.
2. **`adb shell` come `?` e `&` da URL.** O intent com query chegava mutilado; o
   intent agora só ACORDA o navegador, e quem navega é o CDP.
3. **`Page.captureScreenshot` trava no navegador do Quest.** Captura virou
   opcional: perder 60 s de medição por causa de um PNG é burrice.
4. **Aba escondida não desenha.** Com o headset fora da cabeça ou o painel fora
   de vista, o `requestAnimationFrame` não dispara e a medição sai com zero
   frame. O script espera a visibilidade e, se não vier, diz isso em vez de
   estourar. **Isto não é detalhe de teste**: é exatamente o comportamento que a
   Fase 6 tem que tratar como *focus-aware* (requisito de loja) quando o jogador
   tirar o headset no meio da partida.
5. **O headset dorme e acorda no diálogo do Guardian**, que fica por cima de
   tudo; app suspenso não expõe socket nem desenha. Para automação existe
   `adb shell am broadcast -a com.oculus.vrpowermanager.prox_close` (desliga o
   sensor de presença; `automation_disable` restaura) — mas confirmar limite de
   segurança continua sendo tarefa humana, dentro do headset.

## Estimativa de esforço por fase

Unidade: sessão de trabalho focada (≈ meio dia). Confiança é minha, e cai quanto
mais a fase depende de gente de fora (testador humano, review da Meta).

| Fase | Sessões | Confiança | O que domina o custo |
|---|--:|---|---|
| 0 — Baseline | 1 (feito) + 0,5 | alta | falta só rodar no aparelho |
| 1 — Bootstrap XR | 3–4 | alta | rig de câmera + as ~85 referências; `setAnimationLoop`; camada `js/xr/` testável sem headset |
| 2 — Triagem de perf | **8–12** | **baixa** | 463→120 draw calls e 499→40 materiais. É a fase que decide o projeto. Merge por chunk, atlas de material, colapsar os 334 SkinnedMesh, KTX2, LOD, sombra única |
| 3 — Input e locomoção | 3–4 | média | mecânica é simples; o custo é calibrar conforto com humano de verdade |
| 4 — Combate em VR | 5–7 | média | duas mãos, mira física, recarga, háptico, e não regredir o arsenal do desktop |
| 5 — UI diegética | 5–6 | média | 99 elementos de DOM viram mundo; menu, lobby, inventário, morte |
| 6 — Multiplayer e ciclo XR | 3–4 | média | focus-aware e reconexão já têm base; o risco é o handshake versionado |
| 7 — Áudio e arte | 4–5 | média | espacialização tem base (`js/sfx3d.js`); iluminação assada é trabalho de arte, não de código |
| 8 — Empacotamento PWA | 2–3 | média | manifest + service worker + Bubblewrap + keystore. Depende de hospedagem HTTPS e do Application ID |
| 9 — Prontidão de loja | 2–3 | **baixa** | IARC, Data Use Checkup, política de privacidade, payout — burocracia com prazo de terceiro |
| 10 — Beta e submissão | 2–3 + espera | **baixa** | 5 testadores reais + 2 semanas de review da Meta, no mínimo |

**Total de código: ~38–52 sessões.** Mais o calendário de terceiros (review,
testadores, verificação fiscal), que não se comprime com esforço.

O item de maior risco do projeto inteiro é a **Fase 2**, e ele não é opinião: são
463 draw calls medindo contra um teto de 180, em estéreo, num navegador, num
telefone com visor. Se a Fase 2 não fechar o orçamento, nenhuma fase depois dela
salva o projeto — e é melhor descobrir isso na sessão 5 do que na 40.

## Risco a levantar em paralelo ao código (não é código)

Conta de desenvolvedor verificada + dados fiscais para payout costumam ser o
gargalo real de uma publicação, e não dependem de nenhuma linha deste repo.
Começar isso agora, em paralelo, é o que evita ter APK pronto e não poder vender.
