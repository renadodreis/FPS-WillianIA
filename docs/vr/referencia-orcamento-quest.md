# Referência — orçamento de desempenho no Meta Quest 3

Pesquisa feita em 2026-08-29 para destravar o critério **E2** (`criterio-aaa.md`),
que reprovou seis rodadas seguidas. Este documento **não edita a régua**: ele
levanta o que a plataforma publica, com fonte e citação, e fecha com uma
recomendação de decisão para o dono.

> **Aviso de método, e ele importa.** As páginas foram lidas por um leitor
> automático que devolve trechos entre aspas. Onde a citação é **decisiva para
> uma decisão** (as tabelas de orçamento da seção 1 e a frase de multiview da
> seção 1.3), **reconfira palavra por palavra no link antes de usá-la como
> argumento contratual**. O que não foi encontrado está na seção 9, e nenhuma
> fonte foi inventada — quando a busca falhou, está escrito que falhou.

---

## 0. O número de hoje, na unidade em que a Meta publica

Da validação independente mais recente (`docs/vr/validacao-49a5eb2.md`, colhido
por `node scripts/vr-emulado.js`, que lê `renderer.info.render.calls` e
`.triangles` — o **frame estéreo inteiro**, e é a própria validação que divide
por 2 para chegar no "por olho"):

| pose | draw calls (frame estéreo) | triângulos (frame estéreo) | por olho (÷2) |
|---|--:|--:|---|
| menu | 344 | 997 234 | 172 · 498,6 k |
| spawn | 360 | 1 013 616 | 180 · 506,8 k |
| cidade | 368 | 833 300 | 184 · 416,7 k |
| **castelo** | **401** | **1 169 824** | **200,5 · 584,9 k** |

Guarde os dois números da linha do castelo — **401** e **1 169 824** —, porque é
com eles, e não com a metade deles, que a seção 1 vai comparar.

---

## 1. O que a Meta publica HOJE para Quest 3 (pergunta 1)

### 1.1 A tabela de alvo por dispositivo — é ESTA a fonte que o E2 cita

**Fonte:** Meta Horizon OS Developers, *Device-specific optimization (Quest 3 vs
Quest 2)* — <https://developers.meta.com/horizon/resources/device-optimization-comparison/>

Tabela, como está na página:

| Metric | Quest 3 | Quest 2 |
|---|---|---|
| Target frame rate | 72 Hz (90 Hz recommended) | 72 Hz |
| Frame budget | 13.8 ms (at 72 Hz) | 13.8 ms (at 72 Hz) |
| **Recommended draw calls** | **< 200** | < 100 |
| **Recommended triangles per frame** | **< 1.5M** | < 750K |

O rótulo da linha de triângulo é literalmente **"Recommended triangles **per
frame**"**. A página **não** diz "per eye" em lugar nenhum, e **não** menciona
multiview nem renderização estéreo na seção de alvos. Ela também registra que o
Quest 3 tem **"~2.5x Quest 2 GPU"** de throughput.

### 1.2 As faixas por carga de simulação — o número não é um teto, é uma faixa

**Fonte:** Meta Horizon OS Developers, *Testing and performance analysis* —
<https://developer.oculus.com/documentation/unity/unity-perf/> (mesma tabela na
versão Unreal: <https://developers.meta.com/horizon/documentation/unreal/unreal-debug-android/>)

Antes da tabela de draw call, a página escreve:

> "The following table provides example draw call ranges. Your results may vary
> based on the factors mentioned above."

| Platform | Draw Calls | Description |
|---|---|---|
| Quest 1 | 50-150 | Busy Simulation |
| Quest 1 | 150-250 | Medium Simulation |
| Quest 1 | 200-400 | Light Simulation |
| Quest 2, Quest Pro | 80-200 | Busy Simulation |
| Quest 2, Quest Pro | 200-300 | Medium Simulation |
| Quest 2, Quest Pro | 400-600 | Light Simulation |
| **Quest 3, Quest 3S** | **200-300** | **Busy Simulation** |
| **Quest 3, Quest 3S** | **400-600** | **Medium Simulation** |
| **Quest 3, Quest 3S** | **700-1000** | **Light Simulation** |

Antes da tabela de triângulo:

> "Triangle budgets are similar to draw call budgets, as they fluctuate based on
> frame-to-frame factors […] Triangle count budgets are even more fluid and
> depend on factors that can change from frame to frame."

> "Below are some internally-recommended ranges, but results may vary depending
> on the factors listed above."

| Platform | Triangle Count |
|---|---|
| Quest 1 | 350k-500k |
| Quest 2, Quest Pro | 750k-1m |
| **Quest 3, Quest 3S** | **1.3m-1.8m** |

E o alvo de taxa: **"Interactive applications must achieve a minimum of 72 FPS."**

**Leitura honesta desta tabela:** "Busy / Medium / Light Simulation" descreve
**quanto CPU a LÓGICA do app consome**, não quanto detalhe a cena tem. Um battle
royale com rede, física, bots e IA é "busy" ou "medium". Ou seja: o orçamento de
draw call que este jogo pode gastar é **função de quanto o JS dele já custa** —
não é um número fixo, e a própria Meta diz que "results may vary".

### 1.3 Por olho ou por frame? — a ressalva que muda TUDO neste projeto

**Fonte:** Meta Horizon OS Developers, *Enable Multiview* —
<https://developers.meta.com/horizon/documentation/unity/enable-multiview/>

> "On the CPU, the render thread will dispatch half as many draw calls, as each
> draw call will affect both left and right eye buffers."

**Fonte:** Meta Horizon OS Developers, *Multiview WebGL Rendering* —
<https://developers.meta.com/horizon/documentation/web/web-multiview/>

> "Often, a CPU usage reduction of 25% - 50% is possible."
> "Only CPU-bound experiences will benefit with multi-view."

**A consequência.** Os números da seção 1.1 e 1.2 são **por FRAME**, e o
baseline da Meta é Unity/Unreal com multiview ligado — que é o default
recomendado no Quest. Nesse baseline, "um frame" já cobre os dois olhos com UM
conjunto de chamadas. Este projeto **não tem multiview** (prova na seção 3), então
a render thread dele despacha **duas vezes**: uma por olho.

Portanto, a grandeza deste jogo que corresponde ao "per frame" da Meta é a coluna
ESTÉREO da seção 0 — **401 draw calls no castelo**, não 200,5.

E aí o placar honesto contra a fonte que o próprio E2 cita:

| grandeza | jogo hoje (castelo, por frame) | Meta Quest 3 | veredito |
|---|--:|--:|---|
| draw calls | **401** | < 200 | **REPROVA por 2,0×** |
| triângulos | **1 169 824** | < 1,5 M | **PASSA** (78 % do orçamento) |

E contra as faixas da 1.2: 401 calls cai no **piso da faixa "Medium Simulation"
(400–600)** do Quest 3; 1,17 M triângulos fica **abaixo do piso** da faixa de
triângulo do Quest 3 (1,3 M–1,8 M).

### 1.4 O que E2, como está escrito, faz com esses números

E2 aprova com **"draw calls ≤ 180 e triângulos ≤ 500 k"** e diz que a fonte é
"Meta, *Device-specific optimization*: Quest 3 < 200 draw calls e < 1,5 M
triângulos/frame". A validação aplica esses tetos **por olho**. Traduzindo os
tetos de E2 para a unidade da fonte:

| | E2 traduzido para "por frame" | Meta publica | E2 é… |
|---|--:|--:|---|
| draw calls | 180 × 2 = **360** | < 200 | **1,8× mais FROUXO** |
| triângulos | 500 k × 2 = **1,0 M** | < 1,5 M | **1,5× mais APERTADO** |

**É esse par de linhas que prova que E2 mede a coisa errada.** Não é que ele
seja severo demais: ele é frouxo demais numa grandeza e apertado demais na outra,
ao mesmo tempo, e pelo mesmo motivo — um par de números publicado **por frame**
foi aplicado **por olho**. O erro não é de rigor, é de **unidade**.

---

## 2. Contagem é o gargalo certo, ou o número que importa é tempo? (pergunta 5)

A Meta publica orientação explícita, e ela dá razão ao que este repo já tinha
registrado ("contagem é proxy — o critério real é o tempo de frame").

**Fonte:** Meta Horizon OS Developers, *WebXR performance optimization workflow* —
<https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/>

> "60 FPS = 16.6 milliseconds per frame"
> "72 FPS = 13.7 milliseconds per frame"
> "90 FPS = 11.1 milliseconds per frame"

> "Use the frame budget for your target frame rate when profiling and identifying
> areas for optimization."

> "If the app's framerate is not affected or affected very little when not
> rendering anything, the app is likely CPU bound. If performance improves
> significantly, the app is likely GPU bound."

> "Any app logic that takes longer than two milliseconds should be considered for
> optimization."

> "Submitting 1000 individual triangles as unique draw calls would likely cause
> your app to run at less than 72 frames per second."

**Fonte:** Meta Horizon OS Developers, *Testing and Performance Analysis (Unreal)* —
<https://developers.meta.com/horizon/documentation/unreal/unreal-debug-android/>

> "The application is likely GPU-bound if the total GPU time is close to or equal
> to the frame time. Otherwise, the bottleneck is the CPU."

**Fonte:** Meta Horizon OS Developers, *Draw Call Cost Analysis for Meta Quest* —
<https://developers.meta.com/horizon/documentation/unity/po-draw-call-analysis/>

Esta página **não publica teto de draw call nenhum**. Ela publica CUSTO RELATIVO:

> "a redraw of the same object is about 25% the cost of drawing a different
> object"

trocar material dá **"64% increase in draw call time"**, trocar shader aumenta
**"by 175%"**, e os gráficos são declarados úteis **"for relative comparisons,
and not the measured time"**. As recomendações são "Sort your objects", "Avoid
switching shader programs", "Avoid switching materials", "Avoid complex meshes".

**Conclusão da pergunta 5:** a Meta **não** trata contagem como portão. Ela
publica faixas com a ressalva escrita de que variam, e manda perseguir **tempo de
frame** com o orçamento da taxa declarada. O portão de verdade é **E1** (72 fps
travado, medido no aparelho) — que, segundo o próprio `criterio-aaa.md`, **nunca
foi medido dentro de sessão**. Seis rodadas travaram num proxy enquanto o
critério que decide nunca rodou.

---

## 3. Multiview — dado como impossível neste caminho, e NÃO é

Este é o achado que muda a recomendação, e ele é verificável nesta máquina.

### 3.1 O que está instalado

`node_modules/three/package.json` → **`"version": "0.185.1"`**.

| verificação | comando | resultado |
|---|---|---|
| `WebGLRenderer` (o renderer em uso) | `grep -c -i multiview build/three.module.js` | **0** |
| stack comum / WebGPU | `grep -ril multiview src/` | `renderers/common/XRManager.js`, `renderers/common/Renderer.js`, `renderers/webgpu/WebGPURenderer.js`, **`renderers/webgl-fallback/WebGLBackend.js`**, `renderers/webgl-fallback/nodes/GLSLNodeBuilder.js` |

Ou seja: a frase registrada até aqui — "multiview só existe no stack do
`WebGPURenderer`" — **está certa**. O que faltava dizer é o resto dela: **esse
stack tem um backend WebGL2**, e é justamente ele que implementa multiview.

Trechos do próprio `node_modules`:

- `webgl-fallback/WebGLBackend.js:267` — `this.extensions.get( 'OVR_multiview2' );`
- `webgl-fallback/WebGLBackend.js:2244` — `multiviewExt.framebufferTextureMultisampleMultiviewOVR( gl.FRAMEBUFFER, attachment, textureData.textureGPU, 0, samples, 0, 2 );`
- `webgl-fallback/nodes/GLSLNodeBuilder.js:1438-1443` — `enableMultiview()` emite `GL_OVR_multiview2` em vértice e fragmento e injeta `layout(num_views = 2) in`
- `webgl-fallback/WebGLBackend.js:1197` — o laço **por sub-câmera** é pulado quando `camera.isMultiViewCamera === true` (é aqui que as duas submissões viram uma)
- `common/XRManager.js:1270` — `if ( this._useMultiviewIfPossible && renderer.hasFeature( 'OVR_multiview2' ) )`
- `common/XRManager.js:797` — `'THREE.XRManager: WebGPU XR does not support multiview yet. Disabling multiview for this XR session.'`

Essa última linha é importante e é boa notícia para o Quest: multiview no three
r0.185 funciona **só no backend WebGL2**, que é exatamente o que o navegador do
Quest oferece. A forma documentada de ligar:

```js
new THREE.WebGPURenderer( { antialias: false, forceWebGL: true, multiview: true } )
```

**Fonte da forma de instanciar:** three.js PR #30920, *Multiview support for
webgpu renderer* (cabanier) —
<https://github.com/mrdoob/three.js/pull/30920>, e a doc do renderer
<https://threejs.org/docs/pages/WebGPURenderer.html> (`multiview` está descrito
no próprio `src/renderers/webgpu/WebGPURenderer.js:42` como *"If set to `true`,
the renderer will use multiview during WebXR rendering if supported"*).

### 3.2 O que ele valeria aqui, e o que ele custa

**Ganho esperado, com número publicado:** "the render thread will dispatch half
as many draw calls" (Meta) → castelo **401 → ~201 por frame**, que é **a linha
dos `< 200` da Meta**. Sem tocar em `far`, em asset, em `Math.random` seedado ou
em uma lâmina de grama. E "a CPU usage reduction of 25% - 50% is possible"
(Meta) para experiências CPU-bound.

**Risco, e ele é alto e citável:**

- three.js issue **#32538** — *"WebGPURenderer/WebGLBackend with multiview enabled
  is causing a projection issue with the right eye in WebXR."* — **ABERTA**,
  reportada em r181, sintoma "distorted 3D depth projection in the right eye
  view" no Quest. <https://github.com/mrdoob/three.js/issues/32538>
- three.js issue **#32151** — cintilação quando antialias e multiview são
  combinados (referenciada pela #32538).
- Trocar `WebGLRenderer` por `WebGPURenderer` é migração de renderer, não flag: o
  jogo tem shaders `onBeforeCompile`/GLSL à mão (grama, farol, `edgeFade`), CSM,
  e um contrato de frame em XR já registrado no `CLAUDE.md`.

**Portanto: multiview é o único lever que chega no número da Meta, e é uma
SPIKE atrás de flag, não um compromisso de rodada.**

---

## 4. Foveated rendering — quanto compra, e por que não compra AQUI (pergunta 4)

**Fonte:** Meta Horizon OS Developers, *Fixed foveated rendering (FFR)* —
<https://developers.meta.com/horizon/documentation/unity/os-fixed-foveated-rendering/>

> "FFR enables the edges of an application-generated frame to be rendered at a
> lower resolution than the center portion of the frame."

> "FFR can result in a 25% gain in performance with pixel-intensive applications"

> "applications with very simple shaders, which are not bound on GPU fill, will
> likely not see a significant improvement."

Exemplo publicado na mesma página: **"6.5% performance improvement from the low
setting, 11.5% improvement from medium setting, and a 21% improvement from the
high setting."** Níveis: Off, Low, Medium, High, High Top.

Custo de qualidade:

> "Applications using FFR should aim to place high-contrast items, such as text,
> in the center of the frame. Applications that encourage players to look at the
> edges of the screen […] will cause users to notice the degraded image quality."

**Fonte:** Meta Horizon OS Developers, *Save GPU with Eye Tracked Foveated
Rendering* — <https://developers.meta.com/horizon/blog/save-gpu-with-eye-tracked-foveated-rendering/>

ETFR "results in *fewer fragment shading executions* for a given render pass", e
a página é explícita sobre o limite:

> "the tool won't help much if your app is vertex bound"

(Números de ETFR relatados pela imprensa a partir da comunicação da Meta —
33–45 % na resolução padrão, 36–52 % a 1,5×, conforme
<https://www.uploadvr.com/quest-pro-foveated-rendering-performance/> — **ficam
registrados como imprensa, não como doc**, e valem para **Quest Pro com
eye-tracking**, não para o caminho WebXR deste jogo.)

**Fonte do lado WebXR:** Meta, *Fixed foveated rendering (WebXR)* —
<https://developers.meta.com/horizon/documentation/web/webxr-ffr/>. Liga-se por
`'high-fixed-foveation-level'` / `'medium-…'` / `'low-…'` em `optionalFeatures`
do `requestSession`, ou por `XRWebGLLayer.fixedFoveation` (0 a 1). A página **não
publica percentual**, diz que "can be a significant performance improvement" para
apps fragment-bound, avisa que "foveation can cause noticeable degradation in
visual quality. In particular, high-contrast or text-heavy scenes may make the
foveation artifacts more obvious", e registra o limite:

> "only applies when rendering to the final frame buffer"

**Conclusão da pergunta 4:** FFR compra **fill**, e o que reprova aqui é
**submissão** (draw calls). FFR não tira uma draw call nem um triângulo. Ele
continua valendo como conforto térmico (E5) e como margem para E1 — o preset de
sessão deste repo já mexe nele —, mas **é zero para E2**.

---

## 5. Application SpaceWarp em WebXR (pergunta 3)

**Existe.** E a doc é específica.

**Fonte:** Meta Horizon OS Developers, *WebXR Space Warp* —
<https://developers.meta.com/horizon/documentation/web/webxr-space-warp/>

> "On Meta Quest headsets, the underlying technology that powers WebXR Space Warp
> is called Application SpaceWarp."

Requisitos, conforme a página: **Browser version 24.2 or later**; pedir as
features `"layers"` e `"space-warp"` no `requestSession()`; usar
`XRProjectionLayer` com `textureType: "texture-array"`; e "any framework used
must support `XRProjectionLayer` from the WebXR Layers spec". Limites publicados:

> "Space Warp doesn't work with translucent objects in the scene"
> "Controller input latency is higher than normal because of the reduced frame rate"

A página **não publica percentual** para WebXR; diz apenas que permite que "apps
run at a reduced frame rate while still providing a smooth experience", liberando
"more compute budget to render scenes".

**Fonte da especificação:** W3C, *WebXR Layers API Level 1* —
<https://www.w3.org/TR/webxrlayers-1/>

> "The `motionVectorTexture` attribute returns the motion opaque texture for the
> `XRProjectionLayer`. If the `XRSession` was created without the space-warp
> feature descriptor or the layer is not a `XRProjectionLayer`, this attribute
> MUST return null."

> "If session was created with the "space-warp" feature descriptor, set
> recommendedDepthResolution to view's recommended motion vector texture
> resolution."

**Fonte do número de 70 %:** Meta, *Application SpaceWarp Developer Guide* —
<https://developers.meta.com/horizon/documentation/unity/unity-asw/> — "up to 70
percent additional compute", com a ressalva de que "any materials that have not
been modified to support AppSW will produce artifacts when running with AppSW" e
que "requires modifying your app's materials and render pipeline". Essa página é
**Unity/nativo**, não WebXR.

**Serve para comprar orçamento aqui? Não, e por três motivos:**

1. **O three.js não tem nada disso.** `grep -ril "space-warp\|spacewarp\|motionVector"`
   em `node_modules/three/src/` devolve **zero**. O `WebXRManager` já cria
   `XRProjectionLayer` (`WebXRManager.js:481`), mas não existe caminho para
   produzir a textura de motion vector — que o app é obrigado a RENDERIZAR.
2. **Ele não corta contagem.** ASW troca *quadros*, não *submissões*: o app roda
   a metade da taxa e o runtime extrapola. Draw calls e triângulos POR FRAME
   renderizado ficam exatamente onde estão — E2 não se move um dígito.
3. **O jogo é cheio de translúcido** (grama com fade, feixes de findability,
   água, mira, partículas, HUD), e a doc diz que "Space Warp doesn't work with
   translucent objects in the scene".

---

## 6. Grama e vegetação densa em Quest (pergunta 2)

Aqui a pesquisa rendeu **técnica**, mas **quase nenhum número publicado**, e isso
está dito na seção 9.

### 6.1 O que a Meta publica sobre geometria/vegetação

*Basic Optimization Workflow for Meta Quest Apps* —
<https://developers.meta.com/horizon/documentation/unity/po-perf-opt-mobile/>,
para o caso vertex-bound (que é o caso da grama):

> "Simplifying complex geometry and reducing draw calls will often fix these
> issues. You may want to look into an LOD system or batching draw calls,
> depending on the needs of your app."

*How to Optimize your Oculus Quest App w/ RenderDoc — Part 1* —
<https://developers.meta.com/horizon/blog/how-to-optimize-your-oculus-quest-app-w-renderdoc-walkthroughs-of-key-usage-scenarios-and-optimization-tips-part-1/>,
o único trecho da doc da Meta que fala de folhagem por nome:

> "In certain situations it might be worth having a depth prepass for foliage
> with expensive pixel shaders where you set the depth buffer for alpha != 0
> pixels, then follow that up with a color pass, setting depth test to equal."

Sobre a arquitetura do GPU (*Quest Hardware and Software Offerings* —
<https://developers.meta.com/horizon/blog/how-to-optimize-your-oculus-quest-app-w-renderdoc-quest-hardware-and-software-offerings/>):

> "geometry is all projected up front and assigned to a tile (a small subsection
> of the frame buffer) before any shading is started. After all geometry is
> processed, each tile is shaded and written to external memory one by one."

Isso é o que faz triângulo doer num Adreno: **toda a geometria é processada e
"binada" antes de qualquer sombreamento**. Grama densa paga o binning inteiro
mesmo quando a lâmina não pinta pixel — que é exatamente o defeito que o corte
do `edgeFade` deste repo já eliminou.

### 6.2 A técnica que o gênero usa: card / billboard com atlas

**Fonte:** Unity Manual, *Grass and other details* —
<https://docs.unity3d.com/Manual/terrain-Grass.html>

> Unity renderiza objetos de grama "using textured quads or full meshes,
> depending on the level of detail and performance you require". Com
> billboarding, "a quad mesh with a grass texture is oriented towards the camera",
> e "a texture that contains several grass blades gets condensed down into four
> vertices for the quad".

É literalmente a ideia de **grass card** já anotada em `perf-xr.md`: N lâminas
viram 1 quad (2 triângulos) com uma textura de touceira. Os dois parâmetros que
a Unity expõe para grama em plataforma móvel são **detail distance** e **detail
density** — e neste jogo **density é linha vermelha** (grama rala é wallhack
contra quem está deitado), o que deixa só a geometria por touceira.

**Fonte (referência AAA da técnica de lâmina procedural):** GDC 2021, Advanced
Graphics Summit, *Procedural Grass in 'Ghost of Tsushima'*, Eric Wohllaib
(Sucker Punch) — <https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass>.
É console, não Quest, e vale como referência de **técnica** (lâmina gerada na
GPU, clumping para naturalidade), **não** como número de orçamento.

**Catálogo de técnicas, com trade-off por técnica:** Daniel Ilett, *Six Grass
Rendering Techniques in Unity* —
<https://danielilett.com/2022-12-05-tut6-2-six-grass-techniques/>.

### 6.3 O que este jogo já fez, e onde ele está

Registrado em `perf-xr.md` (medição própria, sessão `immersive-vr`, mundo
congelado): a grama do headset no castelo caiu de **434 160 para 148 740
triângulos por olho** (−65,7 %) com três degraus de LOD de lâmina (8 / 4 / 2
triângulos) mais o corte dos chunks cujo `edgeFade` já é zero. Em draw call ela é
**58 por olho = 116 por frame** — 1 chamada por chunk no frustum.

Ou seja: a grama **já** aplicou o que a Meta manda fazer para caso vertex-bound
("an LOD system"), e o próximo degrau de verdade seria o card com atlas.

---

## 7. Cortar o `far` — prática aceita? (pergunta 6)

**Primeiro, o fato deste repo: o corte JÁ FOI FEITO.** `game.js:377` está em
`new THREE.PerspectiveCamera(75, …, 0.08, CFG.VIEW_DIST)` com
`CFG.VIEW_DIST = 420`. Os 401 draw calls do castelo da seção 0 são **com o far
já curto**. **Esta alavanca está gasta** — o que `perf-xr.md` descreve como
"decisão do dono" foi tomada e entregue.

Sobre a prática em si, o que se achou publicado:

**Fonte:** Game Developer, *Fake it til' you make it — faking extended draw
distance in mobile games* —
<https://www.gamedeveloper.com/production/fake-it-til-you-make-it-faking-extended-draw-distance-in-mobile-games>

> "using a mixture of shader trickery combined with our existing simple fog
> effect to provide useful but largely faked detail"

> "allows for quickly extending the effective draw distance using 'faked'
> silhouetted detail under serious performance constraints"

> "the distant silhouettes still provide useful gameplay information to players
> at minimal performance cost"

A técnica descrita ali é o inverso complementar do que este repo fez: em vez de
alongar o `far`, encurta-se o `far` e devolve-se **silhueta em cor de névoa** para
o que interessa ao jogo. É a mesma família do `js/farbeacon.js` deste repo (feixe
com z preso no far), e é a saída canônica caso o dono queira paisagem de volta na
fase da nave.

**Fonte:** Meta, *Basic Optimization Workflow* (link na 6.1) e a orientação de
culling por distância da própria Meta/Unreal citam distance culling e cull
distance volumes como ferramenta padrão — encurtar alcance de desenho e esconder
o corte com névoa é prática de plataforma, não gambiarra.

**O que NÃO se achou:** nenhum estudo publicado dizendo a que distância um
jogador de Quest **percebe** um corte de draw distance. Ver seção 9.

---

## 8. Teto realista para mundo aberto em Quest 3 (pergunta 7)

**A Meta publica orientação DIFERENTE para mundo aberto, e é a resposta direta
desta pergunta.**

**Fonte:** Meta Horizon OS Developers, *Open World Games and Asset Streaming* —
<https://developers.meta.com/horizon/documentation/unity/po-assetstreaming/>

> "From experience, we know that on the original Quest, using the GLES API, you
> should target less than 100 draw calls for the static geometry in your level,
> with around 200 draw calls in total, including all dynamic draw calls."

> "Large open-world levels should target 50% of the target triangle count. This is
> because those targets come from examining workloads rendering smaller, enclosed
> levels."

> "we only need to load the full fidelity of the game's assets when there is the
> potential for the player to interact with them. Conversely, this means that
> anything that is far enough away can be loaded at a lower fidelity, or not
> loaded at all."

**Ressalva obrigatória:** os números de draw call dessa página são declarados
**para o Quest ORIGINAL, com GLES**. O que se transporta para o Quest 3 é a
**regra dos 50 %**, não os 100/200.

Aplicando a regra dos 50 % ao alvo publicado do Quest 3 (< 1,5 M/frame):
**750 k triângulos por frame** para mundo aberto. Este jogo está em **1 169 824**
— **56 % acima**. Aplicando às faixas da 1.2 (1,3 M–1,8 M): 650 k–900 k, e o jogo
segue acima.

**Existência provada:** *Asgard's Wrath 2* (Sanzaru/Oculus Studios, dez/2023) é
um RPG **de mundo aberto** rodando em Quest 2 e Quest 3, com talk de GDC 2024
*"'Asgard's Wrath 2': How We Built VR's Largest Open-World RPG"* —
<https://gdcvault.com/play/1034698/-Asgards-Wrath-2-How> — e página de success
story em <https://developers.meta.com/horizon/discover/success-stories/asgards-wrath-2/>.
A página de success story **não publica número** de draw call, triângulo ou draw
distance (conferido); ela fala de "systematic processes", "compute constraints" e
de um ano iterando "visual fidelity and object counts". O talk está atrás do GDC
Vault e **não foi lido nesta pesquisa**.

**Resposta honesta da pergunta 7:** o teto realista para mundo aberto em Quest 3,
pelo único documento que a Meta escreveu sobre o assunto, é **metade do
orçamento de triângulo do dispositivo** — e o orçamento de draw call continua
sendo o do dispositivo, com a ressalva de que é função da carga de CPU do app.
Mundo aberto em Quest 3 é fato consumado (Asgard's Wrath 2), mas ninguém
publicou os números com que ele foi feito.

---

## 9. O QUE NÃO FOI ENCONTRADO

Seção obrigatória. Tudo aqui foi procurado e **não** achado; nada foi suprido por
estimativa apresentada como fonte.

1. **Nenhuma frase da Meta dizendo explicitamente "per eye" ou "per frame
   (both eyes)" na página de alvos do Quest 3.** O rótulo é "Recommended
   triangles per frame"; a interpretação "per frame = ambos os olhos, com
   multiview" é **inferência**, sustentada pela frase de *Enable Multiview*
   ("the render thread will dispatch half as many draw calls") e pelo fato de
   multiview ser o default recomendado no Quest. **É a peça mais frágil deste
   documento e a que mais merece reconferência humana.**
2. **Nenhum número publicado de FFR para o caminho WebXR.** A doc WebXR de FFR não
   traz percentual; os 25 % / 6,5 % / 11,5 % / 21 % vêm da página Unity/OS.
3. **Nenhum percentual publicado de WebXR Space Warp.** Os "70 %" são da página
   de Unity/nativo, não da de WebXR.
4. **Nenhum jogo de Quest publicou orçamento de grama** — nem triângulos por
   lâmina, nem draw calls de vegetação, nem distância de detalhe. Nem
   Asgard's Wrath 2, nem Behemoth, nem Green Hell VR, nem Grim. Procurado por
   nome, por "postmortem", por "devlog" e por GDC.
5. **Nenhum estudo publicado sobre percepção de draw distance em VR.** A
   literatura de estereopsia encontrada (JOV/ARVO) mede discriminação de
   profundidade, não "o jogador notou que o mundo termina a 420 m", e as faixas
   citadas variam de 20 m a mais de 1 km conforme as pistas disponíveis —
   **inconclusiva para esta decisão**. O melhor lastro que existe para esta
   pergunta continua sendo a **medição em pixel deste próprio repo** (0,03 % do
   quadro no chão, 13,10 % da nave).
6. **O talk de GDC do Asgard's Wrath 2 não foi lido** (GDC Vault, acesso
   restrito). Se o dono quiser o número de um mundo aberto real de Quest, é ali
   que ele provavelmente está.
7. **Nenhuma orientação da Meta sobre `renderer.info` do three.js**, nem sobre
   como um app WebXR sem multiview deve contar seu orçamento. Esse mapeamento é
   raciocínio deste documento, não citação.
8. **Nenhuma doc da Meta sobre custo de alpha test em folhagem no Adreno com
   número.** Só o conselho qualitativo do depth prepass.

---

## 10. Recomendação de decisão

**Escolha: (a) + parte de (d). Explicitamente NÃO (b) e NÃO (c).**

### (a) — Mudar o critério, porque ele mede a coisa errada. **Fazer.**

Não porque seja inconveniente: porque **a unidade está errada, e o erro anda
para os dois lados ao mesmo tempo**. E2 cita uma fonte que publica
`< 200 draw calls` e `< 1,5 M triângulos` **per frame**, e aplica esses tetos
**por olho**. Traduzido para a unidade da fonte, E2 exige 360 calls (1,8× mais
frouxo que a Meta) e 1,0 M triângulos (1,5× mais apertado que a Meta). Uma régua
que é frouxa demais numa grandeza e apertada demais na outra, pelo mesmo motivo,
não está sendo severa — está medindo errado.

O conserto **endurece** a régua, não a afrouxa:

| E2 hoje (por olho) | E2 na unidade da fonte (por frame) | jogo hoje (castelo) |
|---|---|---|
| ≤ 180 calls | **≤ 200 calls despachadas por frame** | **401 — reprova por 2,0×** |
| ≤ 500 k tris | **≤ 1,5 M triângulos por frame** | **1 169 824 — passa, 78 %** |

E acrescenta a nota que falta: **os números da Meta pressupõem multiview; esta
build não tem multiview, então despacha o dobro.** Sem essa frase o critério é
incomparável com a fonte que ele cita.

**Efeito imediato dessa correção:** o assunto **triângulo sai de pauta** (o jogo
já cumpre o número publicado da plataforma) e o assunto **draw call fica muito
pior do que se acreditava** (não faltam 19 calls; faltam 201). É o oposto de
afrouxar para desbloquear.

*Caveat honesto que deve entrar junto:* pela regra de mundo aberto da Meta
("50% of the target triangle count"), o alvo de triângulo cai para 750 k/frame e
o jogo volta a reprovar. Essa regra está numa página cujos números de draw call
são declaradamente do **Quest original**. Recomendo registrá-la em E2 como
**observação**, não como teto, até alguém achar a versão dela para Quest 3.

### (d) — Multiview: a única alavanca que chega no número, e é uma spike. **Investigar.**

Ganho esperado, com fonte: **401 → ~201 draw calls por frame** no castelo
("the render thread will dispatch half as many draw calls" — Meta, *Enable
Multiview*), mais 25–50 % de CPU se o app for CPU-bound (Meta, *Multiview WebGL
Rendering*). Zero mudança de conteúdo: nenhum asset, nenhum `far`, nenhuma
lâmina, nenhum sorteio do `Math.random` seedado.

Custo: existe em three r0.185 **apenas** no stack `WebGPURenderer` com backend
WebGL2 (`{ forceWebGL: true, multiview: true }`), com duas issues abertas
(#32538, projeção do olho direito; #32151, cintilação com AA). É **migração de
renderer**. Recomendação: **spike medida atrás de flag**, com A/B de draw call e
de pixel dentro da mesma sessão — não entrega de rodada.

### (b) — Cortar o `far`. **Não é opção: já foi feito.**

`game.js:377` já está em `CFG.VIEW_DIST` (420 m). Os 401 do castelo são **com o
corte aplicado**. Custo visual já declarado e medido: 0,03 % do quadro no chão,
2,73 % do castelo, 4,36 % de paraquedas, **13,10 % da nave do BR**. O que resta
dessa família é a ideia da fonte da seção 7 — devolver **silhueta em cor de
névoa** (ou `far` maior só na fase da nave), que é paisagem, não orçamento.

### (c) — Atacar a grama. **Não fazer agora, e o motivo é numérico.**

A grama **não é mais o que reprova**. Depois do LOD de três degraus e do corte
do `edgeFade`, ela custa **148 740 triângulos por olho** no castelo (de 434 160)
e **58 draw calls por olho**. E triângulo, na unidade da fonte, **já passa**.
Atacar a grama hoje é atacar 26 % da grandeza que passa, para não mexer na
grandeza que reprova por 2×. Se um dia for preciso, o caminho está na seção 11.

### O que fazer nesta rodada, em ordem

1. **Corrigir a unidade de E2** (decisão do dono — quem constrói não edita a
   régua; este documento é o argumento).
2. **Rodar E1.** É o portão de verdade, a Meta diz que é ("Use the frame budget
   for your target frame rate"), e ele **nunca foi medido dentro de sessão**.
   Seis rodadas travaram num proxy enquanto o critério que decide não rodou.
3. **Spike de multiview atrás de flag**, com número.
4. **Atlas do buggy** (−10 a −11 por olho = **−20 a −22 por frame**, medido em
   `perf-xr.md`): 401 → ~379. Não resolve sozinho, e a própria `perf-xr.md`
   avisa que é a primeira aplicação de atlas que **muda** a textura — medir em
   pixel antes.

**Número esperado, resumido:** com (a) o placar honesto vira 401/1,17 M contra
200/1,5 M — triângulo passa, draw call reprova por 2,0×. Com (d) bem-sucedido,
**~201 draw calls por frame**, dentro do publicado pela Meta, sem tocar em
conteúdo.

---

## 11. Se um dia a grama tiver de mudar — o caminho de menor risco

A ordem de consumo do `Math.random` seedado é contrato. **A boa notícia é que
`js/grass.js` já está desacoplado dela**, e isso muda o cálculo de risco:

- `js/grass.js:280-294` — `legacyConsume(cx, cz)` **replica o consumo antigo do
  fluxo global** (mesmas chamadas, mesmos branches, `PER_CHUNK` iterações) e
  **descarta os resultados**. O comentário no arquivo é explícito: *"Esta função
  replica o consumo antigo EXATAMENTE […] para o layout do mundo não mudar por
  seed. O conteúdo REAL dos chunks vem do RNG local determinístico."*
- O conteúdo real sai de `chunkRng(cx, cz)` — um `mulberry32` semeado por
  `worldSeed ^ hash(cx, cz)`, **fora** do fluxo global.
- `js/grass.js:77-80` já mostra o padrão para criar geometria sem gastar sorteio:
  troca `Math.random` por um LCG local enquanto constrói a `BufferGeometry`
  (todo `Object3D`/`BufferGeometry` do three gasta 4 números no UUID).

**As quatro regras para mexer na grama sem deslocar o mundo de ninguém:**

1. **Não encoste em `legacyConsume`.** Ele continua rodando `PER_CHUNK` vezes com
   exatamente as mesmas chamadas, aconteça o que acontecer com o desenho. Se o
   número de lâminas DESENHADAS mudar, introduza um `PER_CHUNK_DRAWN` separado e
   deixe `legacyConsume` com o `PER_CHUNK` de sempre.
2. **Não mexa em `CFG.GRASS_CHUNKS`, `CFG.GRASS_TOTAL` nem
   `CFG.GRASS_CHUNK_SIZE`.** Eles dimensionam `legacyConsume` e o tapete.
3. **Toda geometria nova nasce dentro do escudo** (o `try/finally` de
   `js/grass.js:77-80`, ou o `noSeed` usado por `fuseBody`/`fundirPorAtlas`).
4. **Toda aleatoriedade nova sai de `chunkRng`**, nunca do `rand`/`Math.random`
   global.

**A técnica, se for preciso: grass card com atlas** (Unity Manual, seção 6.2 —
"a texture that contains several grass blades gets condensed down into four
vertices for the quad"). Aplicada **só** onde hoje já está a lâmina mínima (anel
3+, além de ~25 m), 6–8 lâminas viram 1 quad de 2 triângulos:
`perf-xr.md` estima a grama do headset caindo de ~149 k para **~40–50 k por olho**
no castelo. Riscos, todos já nomeados: atlas novo (rebuild de asset, sRGB/linear),
alpha test com borda dura — **e o alpha test reabre a discussão de ocultamento,
que é a linha vermelha do anti-wallhack.** Nenhum card entra sem o mesmo guarda
de pixel que já existe (alvo do tamanho de um corpo deitado a 18/25/32 m, olho em
pé a 1,6 m).

**E a densidade continua fora de discussão**, em qualquer técnica: quantidade,
altura e alcance não mudam, e nada disso vira opção do jogador.

---

## 12. Como MEDIR o resultado, e o defeito reinjetado que deixa vermelho

### 12.1 A grandeza, e a âncora independente

`scripts/vr-emulado.js` já lê `renderer.info.render.calls` e `.triangles` dentro
da sessão — e no `WebGLRenderer` do three r0.185 o `info` é zerado **uma vez por
`render()`** (`WebGLRenderer.js:1702`, `if ( this.info.autoReset === true )
this.info.reset();`) enquanto `renderScene` roda **uma vez por sub-câmera**
(`WebGLRenderer.js:1747`). Logo `info.render.calls` **já é o total do frame
estéreo** — a grandeza que a Meta publica. A validação é que divide por 2.

**O problema de método:** comparar "por olho" com "estéreo/2" é comparar uma reta
com ela mesma (formato 2 da lista do `CLAUDE.md`). O teste precisa de âncora
**independente do código sob teste**.

**A âncora:** envelopar `drawElements`, `drawElementsInstanced`, `drawArrays` e
`drawArraysInstanced` do `WebGL2RenderingContext` da sessão e **contar chamadas
de GL de verdade** num frame. Isso não passa por `renderer.info` em ponto nenhum.

Três asserções que essa âncora habilita, e nenhuma delas é satisfeita por
construção:

1. `chamadasGL(frame) === renderer.info.render.calls` — prova que o número
   publicado é o número despachado.
2. `chamadasGL(frame) === 2 × (chunks de grama no frustum + …)` — prova que **não
   há multiview**: com multiview, o mesmo grafo daria metade. É o mesmo caso que
   vira **verde** no dia em que a spike da seção 10 funcionar, e por isso ele é
   o teste de aceitação da spike.
3. `chamadasGL(castelo) ≤ 200` — o portão de E2 na unidade da fonte.

### 12.2 Os defeitos reinjetados, com o número que muda de cor

| caso | defeito reinjetado | o que o teste tem de ver |
|---|---|---|
| a unidade é o frame, não o olho | trocar a leitura por `info.render.calls / 2` | asserção 1 morre: 200,5 ≠ 401 chamadas de GL contadas |
| o `far` continua curto | devolver `CFG.VIEW_DIST + 600` em `game.js:377` | castelo sobe ~+110 chamadas estéreo (medido em `perf-xr.md`: 482 → 372) |
| o corte do `edgeFade` está vivo | remover o `mesh.count = 0` do `onBeforeRender` | +24 a +28 draw calls estéreo e +24 120 a +28 140 triângulos por olho |
| multiview realmente ligou (quando houver) | `multiview: false` no construtor | asserção 2 muda de `N` para `2N` chamadas de GL no mesmo grafo |
| a grama não ralou | qualquer mudança de densidade | o guarda de pixel de `test/xr-quality.test.js`: alvo deitado a 18/25/32 m, olho em pé a 1,6 m, **92–94 px de 1 847** |

### 12.3 E o número que realmente decide

Nada acima é E1. A Meta é explícita: *"Use the frame budget for your target frame
rate when profiling"*, e *"The application is likely GPU-bound if the total GPU
time is close to or equal to the frame time. Otherwise, the bottleneck is the
CPU."* O teto de 72 Hz é **13,7 ms** (Meta, *WebXR performance optimization
workflow*).

Isso só se mede **no aparelho**, por `adb logcat -s VrApi`, dentro de sessão
imersiva — que é exatamente o que E1 manda fazer e o que, segundo o próprio
`criterio-aaa.md`, **nunca foi feito**. Enquanto E1 não rodar, E2 é a única coisa
que se sabe, e E2 é um proxy que a própria plataforma declara variável
("Your results may vary"; "budgets […] fluctuate based on frame-to-frame
factors").

---

## Índice de fontes

| # | título | URL |
|---|---|---|
| 1 | Device-specific optimization (Quest 3 vs Quest 2) | https://developers.meta.com/horizon/resources/device-optimization-comparison/ |
| 2 | Testing and performance analysis (Unity) | https://developer.oculus.com/documentation/unity/unity-perf/ |
| 3 | Testing and Performance Analysis (Unreal) | https://developers.meta.com/horizon/documentation/unreal/unreal-debug-android/ |
| 4 | Draw Call Cost Analysis for Meta Quest | https://developers.meta.com/horizon/documentation/unity/po-draw-call-analysis/ |
| 5 | Enable Multiview (Unity) | https://developers.meta.com/horizon/documentation/unity/enable-multiview/ |
| 6 | Multiview WebGL Rendering (WebXR) | https://developers.meta.com/horizon/documentation/web/web-multiview/ |
| 7 | WebXR performance optimization workflow | https://developers.meta.com/horizon/documentation/web/webxr-perf-workflow/ |
| 8 | WebXR Performance Optimization (índice) | https://developers.meta.com/horizon/documentation/web/webxr-perf/ |
| 9 | WebXR performance best practices | https://developers.meta.com/horizon/documentation/web/webxr-perf-bp/ |
| 10 | Fixed foveated rendering — WebXR | https://developers.meta.com/horizon/documentation/web/webxr-ffr/ |
| 11 | Fixed foveated rendering (FFR) — OS/Unity | https://developers.meta.com/horizon/documentation/unity/os-fixed-foveated-rendering/ |
| 12 | Save GPU with Eye Tracked Foveated Rendering | https://developers.meta.com/horizon/blog/save-gpu-with-eye-tracked-foveated-rendering/ |
| 13 | WebXR Space Warp | https://developers.meta.com/horizon/documentation/web/webxr-space-warp/ |
| 14 | Application SpaceWarp Developer Guide | https://developers.meta.com/horizon/documentation/unity/unity-asw/ |
| 15 | W3C — WebXR Layers API Level 1 | https://www.w3.org/TR/webxrlayers-1/ |
| 16 | Open World Games and Asset Streaming | https://developers.meta.com/horizon/documentation/unity/po-assetstreaming/ |
| 17 | Basic Optimization Workflow for Meta Quest Apps | https://developers.meta.com/horizon/documentation/unity/po-perf-opt-mobile/ |
| 18 | RenderDoc Part 1 — usage scenarios and optimization tips | https://developers.meta.com/horizon/blog/how-to-optimize-your-oculus-quest-app-w-renderdoc-walkthroughs-of-key-usage-scenarios-and-optimization-tips-part-1/ |
| 19 | RenderDoc — Quest Hardware and Software Offerings (tile-based) | https://developers.meta.com/horizon/blog/how-to-optimize-your-oculus-quest-app-w-renderdoc-quest-hardware-and-software-offerings/ |
| 20 | Unity Manual — Grass and other details | https://docs.unity3d.com/Manual/terrain-Grass.html |
| 21 | GDC 2021 — Procedural Grass in 'Ghost of Tsushima' | https://gdcvault.com/play/1027033/Advanced-Graphics-Summit-Procedural-Grass |
| 22 | Six Grass Rendering Techniques in Unity | https://danielilett.com/2022-12-05-tut6-2-six-grass-techniques/ |
| 23 | Game Developer — Faking extended draw distance in mobile games | https://www.gamedeveloper.com/production/fake-it-til-you-make-it-faking-extended-draw-distance-in-mobile-games |
| 24 | GDC 2024 — 'Asgard's Wrath 2': How We Built VR's Largest Open-World RPG | https://gdcvault.com/play/1034698/-Asgards-Wrath-2-How |
| 25 | Asgard's Wrath 2 — Horizon Success Story | https://developers.meta.com/horizon/discover/success-stories/asgards-wrath-2/ |
| 26 | three.js PR #30920 — Multiview support for webgpu renderer | https://github.com/mrdoob/three.js/pull/30920 |
| 27 | three.js issue #32538 — multiview quebra a projeção do olho direito | https://github.com/mrdoob/three.js/issues/32538 |
| 28 | MDN — OVR_multiview2 | https://developer.mozilla.org/en-US/docs/Web/API/OVR_multiview2 |
