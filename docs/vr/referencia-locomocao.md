# Locomoção, altura e corpo em FPS de VR — o que os jogos e a documentação dizem

Levantamento feito antes de escrever código, porque a regra do porte é essa:
estudar como o gênero resolve o problema em vez de levar solução de PC para o
headset. Tudo aqui tem link. Onde não achei número, está escrito **não
encontrado** — chute com cara de fato é pior que lacuna declarada.

O que esta pesquisa mudou no jogo está em `js/xr/xrturn.js`, `js/xr/xrbody.js`,
`js/xr/xrrig.js` e `js/xr/xrcomfort.js`.

---

## 1. Giro

### 1.1 A pergunta que motivou tudo

O dono jogou e reprovou: *"viro com o controle e move igual PC, movimento
estático, uns 30 graus de uma vez, esse movimento não existe em VR"*. A hipótese
de trabalho era "os FPS de VR usam giro contínuo por padrão e a Meta manda deixar
escolher". A pesquisa **confirmou a segunda metade e refutou a primeira**.

### 1.2 CONFIRMADO — todo mundo oferece os dois, com ajuste

| Jogo | O que oferece | Fonte |
|---|---|---|
| **Half-Life: Alyx** | Lançou **sem** giro contínuo; o Update 1.1, dois dias depois, adicionou: *"Added 'Continuous Turn', and associated turning speed options"* / *"Renamed 'Quick turn' to 'Snap Turn'"* / *"Added option to disable controller turning"*. Snap com ângulos **15/30/45/60/75/90°**; contínuo com velocidade em escala de UI 1–100 (conversão para °/s **não encontrada**). | [patch notes Valve](https://store.steampowered.com/news/app/546560/view/2100307193365928744) · [guia de acessibilidade](https://www.gamespot.com/articles/half-life-alyx-accessibility-options-full-guide/1100-6475045/) |
| **Pavlov VR** | `Enable Artificial Turn`, `Smooth Artificial Turn : 45 - 360`, `Movement Vignette : 0% - 100%`. As chaves do ini: `bSmoothTurn`, `bSnapTurnEnabled`, `PlayerCrouchHeight`. | [wiki oficial](https://pavlovwiki.com/index.php/Game_Settings) |
| **Onward** | Três estados: sem giro / snap / smooth, com velocidade ajustável. O snap depende do modo de sala — a wiki diz que o analógico faz *"snap-turning **if Front Facing is enabled**"*, ou seja, em roomscale o snap sai. Valores: **não encontrado**. | [wiki (arquivo)](http://web.archive.org/web/20220810232443/https://wiki.onwardhq.com/index.php/Gameplay) |
| **Population: ONE** | O menu mais completo achado: `Turning Style: Snap (Degrees) | Smooth (Ease In, Analog Control, Degrees Per Second)`, mais um `Comfort Level Preset` em lote. Defaults: **não encontrado**. | [wiki](https://population-one-vr.fandom.com/wiki/Settings) |
| **Contractors** | Locomoção contínua **apenas** (sem teleporte), com vinheta de FOV e snap. Comfort rating da loja: **"intense"**. | [UploadVR](https://www.uploadvr.com/contractors-vr-quest-review/) |
| **Resident Evil 4 VR** | Snap e smooth, teleporte e contínuo, sentado/em pé, mão dominante, tunneling. Números: **não encontrado**. | [UploadVR](https://www.uploadvr.com/resident-evil-4-remake-vr-review/) · [blog Meta](https://www.meta.com/blog/resident-evil-4-gets-even-better-in-vr-with-usability-and-gameplay-enhancements/) |

### 1.3 REFUTADO — o padrão de fábrica recomendado é SNAP, não suave

A Meta é explícita nos dois sentidos, na mesma página:

> "**It's important to let users choose between these two options**" (giro: snap
> vs smooth)
> "**Default to comfort-friendly options (teleport, snap turn) and let users opt
> into more intense options (slide, smooth turn).**"
> Snap turn: "Users have strong preferences regarding how much they want to
> turn, so we recommend providing the following options: **30, 45, or 90
> degrees**."
> Smooth turn: "**It is recommended to allow users to adjust the speed of the
> rotation.**"

— [Locomotion user preferences](https://developers.meta.com/horizon/design/locomotion-user-preferences/)

> "**Offer smooth turning as an opt-in feature, tuning speed and acceleration
> carefully.**" / "Keep acceleration events brief and infrequent."

— [Locomotion best practices](https://developers.meta.com/horizon/design/locomotion-best-practices/)

O **Immersive Web SDK** (o SDK WebXR que a própria Meta publica) nasce em snap:

```ts
turningMethod: { type: Types.Int8, default: TurningMethod.SnapTurn },
turningAngle:  { type: Types.Float32, default: 45 },   // graus por passo
turningSpeed:  { type: Types.Float32, default: 180 },  // graus por segundo
```
— [`packages/core/src/locomotion/turn.ts`](https://github.com/facebook/immersive-web-sdk/blob/main/packages/core/src/locomotion/turn.ts)

E a doc dele resume a política em uma linha que virou o desenho daqui:

> Snap Turn — "**Best default for comfort.**"
> Smooth Turn — "Configure degrees/second to tune sensitivity. **Preferred by
> experienced users**."
> UX Notes — "**Provide both options and let the user choose; persist the
> preference.**"

— [`docs/concepts/locomotion/turn.md`](https://github.com/facebook/immersive-web-sdk/blob/main/docs/concepts/locomotion/turn.md)

### 1.4 Números de engine (as únicas fontes com default publicado)

| Engine/SDK | Snap | Contínuo | Fonte |
|---|---|---|---|
| Unity XR Interaction Toolkit | `m_TurnAmount = 45f` | `m_TurnSpeed = 60f` °/s | [SnapTurnProvider.cs](https://github.com/needle-mirror/com.unity.xr.interaction.toolkit/blob/master/Runtime/Locomotion/Turning/SnapTurnProvider.cs) · [ContinuousTurnProvider.cs](https://github.com/needle-mirror/com.unity.xr.interaction.toolkit/blob/master/Runtime/Locomotion/Turning/ContinuousTurnProvider.cs) |
| Godot XR Tools | `step_turn_angle = 20.0°` | `smooth_turn_speed = 2.0 rad/s` (≈114,6 °/s) | [movement_turn.gd](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/functions/movement_turn.gd) |
| Immersive Web SDK (Meta) | 45° | **180 °/s** | acima |
| Pavlov (teto do jogador) | — | 45 a 360 | acima |

**Faixa real do mercado: 60 a 360 °/s.**

### 1.5 Snap com escurecimento tem nome e propósito

O Unity XRI documenta o `delayTime` do snap exatamente para isso:

> "This delay can be used, for example, **as time to set a tunneling vignette
> effect as a VR comfort option**."

E o vinhetador dele nasce em `apertureSizeDefault = 0.7`, `featheringEffectDefault
= 0.2`, `easeInTime/easeOutTime = 0.3 s`.
— [TunnelingVignetteController.cs](https://github.com/needle-mirror/com.unity.xr.interaction.toolkit/blob/master/Runtime/Locomotion/Comfort/TunnelingVignetteController.cs)

O Interaction SDK da Meta tem o equivalente, e com um detalhe que vale copiar:

> "The vignette shader is **directly defined in degrees**, ensuring that the user
> will always experience the desired amount of occlusion regardless of the
> headset's real field-of-view."

e a vinheta reage a **três** eventos separados: **Rotation**, **Movement** e
**Acceleration**.
— [Locomotion comfort](https://developers.meta.com/horizon/documentation/unity/unity-isdk-locomotion-comfort/)

Sobre exagerar na dose:

> "a diminished field of view can potentially be **disorienting or
> claustrophobic**"
— [Reduce optic flow](https://developers.meta.com/horizon/resources/locomotion-design-reduce-optic-flow/)

### 1.6 Consenso competitivo — o ponto mais fraco desta pesquisa

Não achei fonte primária (enquete, regra de torneio, estatística). O que há:

- Guia competitivo de Pavlov na Steam: *"and **smooth turn as well, if you can
  handle it**"*, e locomoção pelo **head vector** porque *"it makes movement much
  more consistent"*.
  [link](https://steamcommunity.com/sharedfiles/filedetails/?id=1940951250)
- Pavlov permitir **360 °/s** só faz sentido para público que quer virar rápido.
- Review de Contractors recomenda **girar o corpo fisicamente** como mitigação
  principal, por ser Quest sem fio.

**Veredito honesto:** a inclinação competitiva é para giro contínuo rápido, mas
sustentada por guia de comunidade, não por fonte primária.

### 1.7 O que ficou decidido aqui, e por quê diverge do default da Meta

`js/xr/xrturn.js` nasce em **suave, 180 °/s** (o número do IWSDK), com **passos
de 45°** disponíveis e ângulo ajustável, preferência **persistida**
(`callofai_vr` no localStorage), zona morta descontada e rampa de aceleração
(0,12 s subindo, 0,05 s parando).

Diverge do "default to snap" da Meta de propósito, e o motivo é escrito:
o critério de pronto deste porte é o dono do projeto, que jogou e reprovou o
snap; e o jogo é um battle royale, onde girar aos pulos custa mira. O que a
recomendação da Meta protege — quem enjoa — continua a um toque: o modo em
passos não foi removido.

---

## 2. Altura, agachar e o pivô do giro

### 2.1 O pivô: girar não pode deslizar

Nenhuma das fontes descreve giro artificial como rotação em torno da origem do
espaço de jogo; todas giram em torno do jogador. O IWSDK gira `this.player` (o
rig), não a câmera:

```ts
this.player.rotateY(-turnAxis * turningSpeedRadian * delta)
```

e o Unity diz o mesmo do XR Origin: *"The XR Origin doesn't move on its own.
However, you can move the XR Origin with a script"*
([doc](https://docs.unity3d.com/Packages/com.unity.xr.core-utils@2.5/manual/xr-origin.html)).

**Medido neste jogo, antes do conserto:** com a cabeça 0,71 m fora do centro do
espaço de jogo, um passo de 45° teleportava a vista **0,544 m** de lado, e um
giro contínuo de ~90° arrastava **1,388 m** (números do
`test/xr-turn.test.js` com o pivô antigo reinjetado). É rotação somada a
translação — o mundo gira **e** escorrega. Consertado em `js/xr/xrrig.js`.

### 2.2 Agachar: físico sempre, botão por cima

- **Alyx** tem quatro modos de `Height Adjust`: *Crouch* ("Crouch action only"),
  *Stand*, *Crouch And Stand* ("two separate inputs") e *Hybrid* ("**single
  input for both**... **click** to lower, **press and hold** to raise").
  O agachar físico nunca é desligado — é o headset.
  [guia](https://www.gamespot.com/articles/half-life-alyx-accessibility-options-full-guide/1100-6475045/)
- **Onward** trata altura como **entrada de gameplay**: *"The game wants to know
  your height so it can determine if you're **crouching, standing or prone in
  real life**"*, e o volume dos passos cai conforme o stance.
  [guia](https://www.uploadvr.com/onward-guide-tips-strategies/)
- **Population: ONE**: *"You can sit in the game, if you set while standing. When
  you sit down the sound of movement is reduced and it is easier to hide."*
- **Meta**: crouch/stand "allows users to **lower their viewpoint**... the stand
  feature returns the user to a normal upright position", com transições
  "smooth and responsive".

**O botão desloca a origem; ninguém escala o jogador.** O Interaction SDK da
Meta expõe um *"**Height Offset** parameter"* que baixa o piso virtual; o Unity
tem o GameObject **"Camera Floor Offset"** entre a origem e a câmera
(`k_DefaultCameraYOffset = 1.1176f` quando o modo é Device).
Escalar o mundo é anti-padrão declarado: muda o tamanho de armas e objetos junto.
[Unity XR Origin](https://docs.unity3d.com/Packages/com.unity.xr.core-utils@2.5/manual/xr-origin-reference.html)

### 2.3 Altura vira vetor de trapaça quando existe corpo

- **Contractors** implementou *"a **tight body calibration mechanism** to make
  sure player dont look strange in multiplayer games"*, e os devs sabiam de
  jogadores explorando alturas irreais.
  [fórum oficial](https://steamcommunity.com/app/963930/discussions/0/2806204039996788436/)
- **Pavlov** não travou, e o guia competitivo diz o quiet part out loud: *"make
  yourself **as short as possible** without losing the ability to run, which just
  makes you a smaller target."*

Aqui isso ainda **não** é problema (a altura do headset não muda hitbox de rede),
mas vira, se um dia o corpo em VR for o que os outros jogadores enxergam.

### 2.4 Contra câmera enterrada, rampa e degrau

A receita das fontes é a mesma em toda parte:

> "**Player Collider** — A capsule (0.5 m radius) with **floating spring-damper**
> keeps you **slightly above ground** while respecting slopes and steps."
> Comfort checklist: "**Avoid sudden camera height changes; use the floating
> stand-off and gentle step handling.**"
> "Input systems decide 'what the user wants to do'; the locomotor decides 'how
> to move safely' (gravity, grounding, collisions)."
— [IWSDK, docs/concepts/locomotion](https://github.com/facebook/immersive-web-sdk/blob/main/docs/concepts/locomotion/index.md)

E, do lado do rig de personagem, o VRIK expõe `spine.minHeadHeight` — *"minimum
height of the head from the root of the character"* — com o aviso de que
`plantFeet` *"can cause the camera to exit the head"*.
[Final IK / VRIK](http://www.root-motion.com/finalikdox/html/page16.html)

### 2.5 O que a spec do WebXR garante — e o que não garante

> "Passing a type of **local-floor** creates an XRReferenceSpace... **The Y axis
> equals 0 at floor level**... **If the floor level isn't known it MUST be
> estimated**... MUST be rounded sufficiently to prevent fingerprinting."
> "Note: ... **rounded to the nearest 1cm is suggested**."
> "Devices that support 'local' reference spaces MUST support 'local-floor'...
> through emulation if necessary."
— [W3C WebXR Device API, §XRReferenceSpace](https://www.w3.org/TR/webxr/)

Ou seja: y=0 no chão é garantido **como intenção**, mas o valor pode ser
**estimado e arredondado de propósito**. Altura de chão em WebXR tem erro
embutido por desenho — mais uma razão para o jogo nunca depender de a cabeça
estar exatamente onde ele acha que está.

---

## 3. Corpo virtual em primeira pessoa

### 3.1 O jogo mais aclamado do gênero não tem corpo

**Half-Life: Alyx** mostra só as mãos: sem braços, sem torso, sem pernas. O
argumento é que VR não sabe onde está o cotovelo nem o peito, e corpo
desalinhado quebra mais a imersão do que a ausência dele.
[PC Gamer, os dois lados](https://www.pcgamer.com/keep-alyx-armless/)

**Ghosts of Tabor** transformou em opção (`Full Body IK` vs `Arms Only`), e a
comunidade explica o custo concreto: *"turning off full-body makes looting
waaay easier... **when trying to quickly pick stuff up from the floor those legs
can get in the way**"*. [xrsource](https://xrsource.net/5970/)

**Consequência para este jogo:** há loot no chão (baús, drops). Se o corpo
atrapalhar pegar item, a saída conhecida é um interruptor de pernas — não está
implementado, fica anotado.

### 3.2 Quando há corpo, o padrão é VRIK — e ele tem números

O `VRIK` do Final IK foi criado **para "Dead and Buried", da Oculus Studios**, e
é a referência de fato. Defaults da classe `IKSolverVR.Spine`
([referência](http://www.root-motion.com/finalikdox/html/class_root_motion_1_1_final_i_k_1_1_i_k_solver_v_r_1_1_spine.html)):

| Parâmetro | Default | O que faz |
|---|--:|---|
| `maxRootAngle` | **25°** | "Will automatically rotate the root of the character if the head target has turned past this angle." |
| `bodyPosStiffness` | 0,55 | quanto o corpo segue a **posição** da cabeça |
| `bodyRotStiffness` | 0,10 | quanto o corpo segue a **rotação** da cabeça |
| `moveBodyBackWhenCrouching` | 0,50 | recua o corpo horizontalmente ao agachar |
| `chestClampWeight` | — | "Value of 0.5 allows 90 degrees of rotation for the chest relative to the head" |

Leitura prática: **o tronco segue a posição da cabeça com força e a rotação
quase nada**; o quadril só começa a virar depois de **25° de folga de pescoço**;
e agachar não é só descer — o corpo recua, senão o joelho entra no peito.

Do blog da Meta sobre o mesmo jogo:

> "the HMD plays the lead role in spine calculations, but the hand controllers
> have an **equally important duty in modifying the chest rotation**"
> "...**clamping their rotation** to make sure they stay within a valid range"
— [Character animation in Dead and Buried](https://developers.meta.com/horizon/blog/developer-perspectives-character-animation-in-dead-and-buried/)

### 3.3 O headset não fica no centro da cabeça

Patch de Population: ONE, 10/12/2020: *"**Set height at center of head instead of
headset**"*; e em 06/12/2023: *"Camera: **Eye position is now lower & better
matches eye height on characters**"*.
[wiki](https://population-one-vr.fandom.com/wiki/Settings)

São exatamente os dois defeitos que o corpo deste jogo tinha em VR: âncora na
pose do visor (peito empurrado para dentro do campo de visão) e altura do olho
do modelo maior que a do jogador (boneco enterrado).

---

## 4. Como isso virou código aqui

| Achado | Onde |
|---|---|
| Giro contínuo com velocidade do jogador, snap como opção, preferência persistida | `js/xr/xrturn.js` |
| Rampa de aceleração breve (Meta: "keep acceleration events brief") | `js/xr/xrturn.js` |
| Vinheta reage a movimento **e** rotação, com piso de 45 °/s para não piscar na mira | `js/xr/xrcomfort.js` |
| Giro pivota na cabeça | `js/xr/xrrig.js` |
| Passo físico absorvido pela posição de jogo (colisor debaixo da cabeça, terreno amostrado onde ele está) | `js/xr/xrrig.js` + fiação |
| Boneco dimensionado pelo jogador, pés presos no chão, tronco em pé | `js/xr/xrbody.js` |
| Âncora no centro da cabeça e recuo ao agachar | `js/xr/xrbody.js` |
| Folga de pescoço de 25° antes de o quadril virar (VRIK `maxRootAngle`) | `js/xr/xrbody.js` |
| Agachar físico vira a mesma tecla do teclado | `js/xr/xrbody.js` + fiação |

Não implementado, com fonte para quando for a hora: modo sentado com
deslocamento de piso (Alyx *Stand*, Meta *Height Offset*), interruptor de pernas
para não atrapalhar loot (Ghosts of Tabor), e travar altura se o corpo virar
hitbox de rede (Contractors).

---

## 5. Aceleração: instantânea ou gradual? (o que decidiu A4)

Levantamento feito na rodada 10, quando a decisão sobre o perfil `paridade`
voltou à mesa. A pergunta era exatamente esta: **rampa de 273 ms é conforto ou
é lag?**

### 5.1 A documentação oficial, verbatim

> "This method involves setting fixed movement speeds (e.g., stopped, walking,
> running) and **switching between them instantly**."
> "**By keeping accelerations brief and infrequent**, the likelihood of
> discomfort is reduced."
> "This **reduces the duration of perceived acceleration**, minimizing the
> mismatch between what users see and feel."
> "When the camera collides with virtual objects, opt for a **soft collision**
> approach where the camera slows down before stopping, rather than an abrupt
> halt."
— Meta, [Locomotion Comfort and Usability](https://developers.meta.com/horizon/resources/locomotion-comfort-usability/)

> "**Limit acceleration duration and frequency** to reduce sensory mismatch."
> "Keep acceleration events **brief and infrequent**."
> "Use stepped translations, restrict movement axes, control camera elevation,
> and **implement soft camera collisions**."
> "Offer smooth turning as an opt-in feature, tuning speed and acceleration
> carefully."
— Meta, [Locomotion Best Practices](https://developers.meta.com/horizon/design/locomotion-best-practices/)

> "The average human being walks at a rate of about three miles per hour
> (1.4 meters per second) and runs at about twice that speed."
> "Vignettes, sometimes referred to as Tunnel Vision, darken or completely
> occlude the edges of the screen when movement occurs... They serve to limit
> the amount of visible optic flow, which can help reduce vection **during
> acceleration**."
> "The tradeoff with vignettes is that a diminished field of view can
> potentially be **disorienting or claustrophobic** for the user."
— Meta, [Reduce Optic Flow](https://developers.meta.com/horizon/resources/locomotion-design-reduce-optic-flow/)

> Comfort checklist: "Keep slide speeds **moderate (4–6 m/s)** and add a
> vignette with a quick ease in/out." · "**Avoid sudden camera height
> changes**; use the floating stand-off and gentle step handling."
> Player Collider: "A capsule (0.5 m radius) with **floating spring-damper**
> keeps you slightly above ground while respecting slopes and steps."
— Meta, [Immersive Web SDK, docs/concepts/locomotion](https://github.com/facebook/immersive-web-sdk/blob/main/docs/concepts/locomotion/index.md)

### 5.2 O que isso responde, e o que NÃO responde

**Responde:** a direção é encurtar a aceleração, não alongá-la. "Velocidade
quantizada" — trocar de velocidade **instantaneamente** — é apresentada como
técnica de conforto, não como o oposto dele. Uma rampa de 273 ms é o estímulo
que as duas páginas mandam encurtar.

**Não responde:** nada disso fala de **equilíbrio competitivo entre um jogador
de headset e um de monitor na mesma partida**, que é o argumento que sustenta o
perfil `paridade` deste jogo. As diretrizes tratam do conforto de um jogador
sozinho; o custo de dar ao headset um arranque melhor que o do monitor não é
assunto delas.

### 5.3 O que ficou decidido aqui

Os perfis `conforto` e `alcance` (o padrão e o do meio) aceleram em **50 ms**
medidos — bem dentro do teto de 150 ms de A4, e é a leitura literal da
recomendação. O perfil `paridade` (linha `IGUAL AO PC`) mantém a rampa do
monitor por **decisão de projeto, declarada como exceção** em
`js/xr/xrcomfort.js`, com motivo e custo escritos e com uma amarra que agora é
**código**: a exceção só alcança um plano que prove ser paridade inteira —
escala 1 **e** os quatro números de velocidade **e** a rampa, todos idênticos
aos do PC (`eParidadeInteira`). Antes da rodada 10 a amarra conferia uma das
cinco condições, e um perfil forjado (`andar: 12, correr: 25, aceleraSolo: 4`)
saía aprovado com t95 de 0,75 s — cinco vezes o teto.

---

## 6. A cabeça do jogador entra na parede — o que o gênero faz

O jogador anda no quarto dele; a parede do jogo não existe lá. As três saídas
conhecidas e o que cada uma custa:

| saída | quem usa | custo |
|---|---|---|
| **Empurrar o corpo/rig** ("push away") | Godot XR Tools (opção), corpos físicos tipo Boneworks | move a vista sem o pescoço do jogador — proibido por A6 e pelo Oculus BP |
| **Fade para preto** | **Godot XR Tools (DEFAULT)** | cega o jogador enquanto ele está fora do mundo |
| **Deixar atravessar sem nada** | (o que este jogo fazia) | ver e atirar do outro lado da parede: espiar-parede de escala de sala |

Godot XR Tools, [`addons/godot-xr-tools/player/player_body.gd`](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/player/player_body.gd):

```gdscript
## Behaviour mode when players head collides, or moves beyond
## [member max_head_distance].
## Push away, pushes the player body away.
## Fade, fades view to black.
@export_enum("Push away", "Fade", "Disabled") var head_behavior_mode = 1

## Maximum distance the head may move away from the player body
@export_range(0.0, 2.0, 0.01) var max_head_distance = 1.0
```

O default é **1 = Fade**, o fade sobe e desce a `delta * 3.0` (≈ 1/3 de segundo
do claro ao preto) e o gatilho é duplo: **colisão da cabeça** OU **distância
cabeça↔corpo** acima de `max_head_distance`.

Do lado da Meta, a recomendação de "soft camera collisions" trata do movimento
**comandado** (o colisor desacelera antes de parar), não do passo físico — e o
passo físico não pode ser desacelerado por ninguém: *"The display should
respond to the user's movements at all times, without exception"* (Oculus BP,
citado no §A6 de `docs/vr/criterio-aaa.md`).

### 6.1 O que ficou decidido aqui, e por quê

**Fade**, com o passo recusado virando separação em vez de empurrão:

1. A cabeça atravessa — a vista responde ao corpo do jogador, sempre (A6).
2. O que a parede recusa **nunca volta para o colisor** (`foraX/foraZ` em
   `js/xr/xrrig.js`, separado do passo drenável). Antes, o recusado voltava ao
   mesmo acumulado que alimenta o colisor e ele atravessava: **10 m de
   caminhada física pedidos, colisor andou 10,9623 m** (validação de `fa9ed86`).
3. A separação vira **escurecimento progressivo** (`intrusao()` em
   `js/xr/xrcomfort.js`): nada até 0,20 m, preto total em 0,50 m, rampa linear
   de 1/3 de segundo — os números do Godot, com o limiar calibrado pela
   medição desta base (separação de 0,0131 m no pior frame de uso normal;
   0,133 m no encosto de parede).
4. Quando o obstáculo some, a separação **escoa** de volta para o passo a
   0,006 m por frame (≈ 0,43 m/s): o colisor alcança a cabeça andando, nunca
   saltando — salto de colisor é o que o anti-cheat de teleporte do servidor lê
   como trapaça.

O escurecimento **não** é preferência do jogador: desligar a vinheta de
conforto no painel não o desliga. Vinheta é conforto; ver do outro lado da
parede é integridade do mundo.

---

## 7. A CORTINA — quando ela fecha, quanto ela atrasa, e o que ela explica

O §6 escolheu **Fade**. A validação de `2d55610` mediu o Fade escolhido e
achou três coisas que a escolha não resolvia sozinha, e que são o assunto
desta seção:

| medido em `2d55610` | número |
|---|--:|
| a vista fica limpa até | **1,10 m** de separação cabeça↔colisor |
| atraso da cortina | **0,33 s** (frame 40: `fora` 0,225 e `escuro` 0,000; frame 60: `fora` 1,058 e `escuro` 1,000) |
| separação máxima com o jogador insistindo | **8,4140 m** (sem teto) |
| o dono, lendo isso | *"a tela fica preta quando encosto na parede e nada explica por quê"* |

### 7.1 A conta que ninguém tinha feito: QUANDO o outro lado aparece

`FORA_MIN = 0,20` e `FORA_MAX = 0,50` eram números de conforto, calibrados
pela separação medida em uso normal. **Nenhum dos dois tem relação com o
instante em que o mundo vaza.** Esse instante é geometria, e a geometria deste
jogo é:

- **colisor do jogador: raio `0,42 m`** (`game.js`, `player.radius`), e
  `Structures.collide` para o CENTRO do colisor a exatamente um raio da face
  do sólido. Ou seja: com o corpo preso na parede, a cabeça cruza a FACE
  quando a separação passa de **0,42 m**;
- **plano near da câmera: `0,08 m`** (`PerspectiveCamera(75, …, 0.08, 1000)`).
  Geometria mais perto que isso é recortada. Como as paredes são caixas de
  material `FrontSide`, recortar a face da frente é ver o que está do outro
  lado dela.

Logo: **o vazamento começa em `0,42 − 0,08 = 0,34 m` de separação**, e não em
0,50. A cortina de `2d55610` só ficava preta em 1,10 m — **0,76 m de
caminhada com a vista vazando**, que é o defeito com nome e número.

Daí os limiares desta rodada: **`FORA_MIN = 0,16` · `FORA_MAX = 0,32`**. O topo
é o vazamento com 2 cm de folga; a base fica acima do pico de encosto medido
(0,133 m em `fa9ed86`) e MUITO acima do uso normal (0,0131 m no pior de 1799
frames; 0,0083 m nos 3840 frames de `2d55610`).

### 7.2 O atraso não é conforto, é resíduo de implementação

A rampa era `FORA_K · dt` (3/s) **nos dois sentidos**: 1/3 de segundo do claro
ao preto. A 1,44 m/s de caminhada isso é 0,48 m percorridos ENQUANTO a tela
ainda abre.

O número 3/s é do Godot XR Tools, e lá ele existe porque **o gatilho de lá é
binário**: o shape cast da cabeça bate ou não bate, e a rampa é o que dá
gradualidade. Aqui o sinal é CONTÍNUO (a separação, em metros), então a
gradualidade já vem da geometria: 0,16 → 0,32 m a 1,44 m/s são 0,11 s de
fechamento progressivo, sem rampa temporal nenhuma.

**Decisão: fechar acompanha a geometria no mesmo frame; abrir mantém freio.**
Fechar de repente é a técnica de *blink* (o próprio `PISCADA_S = 0,08` deste
projeto), confortável e usada em todo snap turn do gênero. Abrir de repente é
um flash de luz na cara de quem está no escuro — esse continua a `3/s`, que é
exatamente a taxa de descida do Godot (`_fade_value -= delta * 3.0`).

Fonte da taxa, verbatim
([`player_body.gd`](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/player/player_body.gd)):

```gdscript
if fade:
    _fade_value = max(_fade_value + delta * 3.0, 0.0)
elif _fade and _fade_value > 0.0:
    _fade_value = max(_fade_value - delta * 3.0, 0.0)
```

### 7.3 O gatilho que faltava — e o parapeito

**O gatilho do Godot NÃO é a distância.** Foi assim que este repositório o
citou até aqui, e é meia verdade. O código, verbatim:

```gdscript
var safe := min(_head_shape_cast.get_closest_collision_safe_fraction(),
                max_head_distance / target_move_distance)
if safe < 1.0:
    if head_behavior_mode == 0:
        var push_back_by = body_movement * (1.0 - safe)
        global_position += push_back_by
    else:
        fade = true
```

São **dois** gatilhos, e o primeiro é uma **consulta de física na cabeça** —
um shape cast que pergunta ao mundo se a cabeça vai bater. `max_head_distance`
(`@export_range(0.0, 2.0, 0.01) var max_head_distance = 1.0`) é só o
**batente**. A implementação daqui tinha o batente e **não tinha a consulta**.

Isso importa porque **a separação não distingue dois gestos opostos**:

| gesto | separação típica | o que deve acontecer |
|---|--:|---|
| enfiar a cabeça na parede | 0,3 – 1,0 m | escurecer |
| **debruçar sobre um parapeito** (sacada, muretinha, capô, janela) | 0,3 – 0,6 m | **não escurecer** — é gesto legítimo de VR |

Os dois moram na MESMA faixa de separação. Nenhum limiar de distância os
separa: as duas pontas se sobrepõem. **O que os separa é o mundo:** no
primeiro a cabeça está DENTRO de sólido, no segundo está no AR. É exatamente a
pergunta que o shape cast do Godot faz.

**Decisão: a cortina passa a ser vetada por uma sonda de sólido na cabeça.**
`Structures.collide` já é essa consulta — é o mesmo empurrão que o corpo do
jogador usa, com um raio menor e uma fatia de altura na cabeça:

- raio da sonda **0,25 m** (cabeça e ombros; dá 0,17 m de margem sobre o
  `near` de 0,08 — a "antecipação" que o shape cast do Godot tem por ser um
  CAST e não um teste de ponto);
- fatia de altura **0,24 m** centrada no olho, que é o que faz `collide`
  IGNORAR um parapeito cujo topo está abaixo da cabeça (`pos.y >= by1 - 0.12`
  é a linha dele que faz isso);
- o empurrão devolvido é `raio − distância até a face`, ou seja **a
  proximidade**, e a direção dele é a direção da parede. Sai de graça na mesma
  chamada.

Sem a sonda (fiação ausente, ou geometria que `Structures` não conhece — carro,
helicóptero) a cortina cai no comportamento por separação do §7.1. É o padrão
seguro: erra para o lado de escurecer.

### 7.4 O teto de `fora`, e o preço dele em A6

`devolverPasso` somava sem clamp: 8,4140 m medidos numa caminhada só. O teto é
**1,00 m** — o `max_head_distance` do Godot, o mesmo número e o mesmo papel.

O que o teto custa: **acima dele a vista para de responder ao passo físico**,
que é a letra de A6. O que o defende: **a cortina está em 1,0000 desde
0,32 m**, ou seja três vezes antes. Não existe display deixando de responder;
existe display preto. E o excedente **não é jogado fora** — vira dívida
(`excedente`), e o passo de volta paga a dívida ANTES de mexer na vista, senão
entrar 3 m e sair 3 m deixaria o jogador 2 m fora do lugar para sempre.

Isso é **exceção declarada**, com amarra em código (`EXCECOES` em
`js/xr/xrcomfort.js`): ela só vale enquanto a cortina fechar ESTRITAMENTE antes
do teto. Se alguém subir `FORA_MAX` acima do teto, a exceção deixa de valer
sozinha e a auditoria fica vermelha.

### 7.5 O que a cortina EXPLICA — e por que uma grade

Preto liso não explica nada: a leitura de quem está de headset é *"apagou"*.
O que o jogador de Quest já sabe ler sem manual é a **grade do Guardian** — o
próprio sistema desenha uma parede quadriculada quando ele chega no limite da
área. Copiar essa gramática é usar um vocabulário que ele já tem.

Duas peças, as duas no mesmo shader que já existia:

1. **a cortina FECHA PELO LADO DA PAREDE.** A direção vem de graça da sonda
   (§7.3). O escuro nasce onde o sólido está e varre até fechar tudo — quem
   está lá dentro vê de que lado veio o problema, e para onde voltar;
2. **grade sobre o escuro**, ciano fraco, no estilo da grade de limite. Ela
   distingue "o jogo colocou uma barreira aqui" de "a tela apagou". O alpha
   continua 1 (o mundo continua ocluso — integridade não muda); só a COR deixa
   de ser preto liso.

**Fonte:** a grade do Guardian é do sistema Meta Quest e todo jogador a
conhece; **não encontrei documento primário da Meta prescrevendo grade
in-app** — as páginas de conforto que consegui abrir
([locomotion-best-practices](https://developers.meta.com/horizon/design/locomotion-best-practices/),
[locomotion-comfort-usability](https://developers.meta.com/horizon/resources/locomotion-comfort-usability/),
[reduce-optic-flow](https://developers.meta.com/horizon/resources/locomotion-design-reduce-optic-flow/))
falam de vinheta e de *soft camera collisions* e nada de cabeça dentro de
sólido. O que elas dão, verbatim:

> "When the camera collides with virtual objects, opt for a soft collision
> approach where the camera slows down before stopping, rather than an abrupt
> halt."

> "use vignettes to darken or completely occlude the edges of the screen when
> movement occurs" … "a diminished field of view can potentially be
> disorienting or claustrophobic"

E o SDK WebXR da própria Meta, sobre a taxa da vinheta:

> "Keep slide speeds moderate (4–6 m/s) and add a vignette with a **quick ease
> in/out**."
> ([immersive-web-sdk, docs/concepts/locomotion](https://github.com/facebook/immersive-web-sdk/blob/main/docs/concepts/locomotion/index.md))

**"quick ease in/out"** é o mais perto de lastro que achei para fechar rápido;
o resto do número (fechar no mesmo frame) é decisão daqui, derivada da conta do
§7.1 e não de fonte.

### 7.6 O que ficou SEM lastro de fonte primária, e é honesto dizer

- **Half-Life: Alyx, Boneworks, Into the Radius** — `developer.valvesoftware.com`
  responde **403** a busca automatizada e as páginas de loja não descrevem o
  comportamento de cabeça-em-geometria. **Não encontrado.** O que se afirma
  sobre esses jogos aqui é só o que já estava no §6 (Boneworks empurra o corpo
  porque tem corpo físico), e continua sem citação primária. A decisão que fica
  sem lastro por causa disso: **nada** — o desenho inteiro desta seção se apoia
  no Godot XR Tools, que é fonte primária aberta e legível.
- **Números de vinheta da Meta** (quanto escurecer, em quantos segundos):
  **não encontrado** — as três páginas de conforto não trazem número nenhum.
  Unity XR Interaction Toolkit publica defaults de *ease in/out* do Tunneling
  Vignette, mas as cinco URLs de manual que tentei responderam 404.
  Decisão sem lastro por causa disso: **a taxa de ABERTURA** — fica em 3/s
  porque é a do Godot, não porque a Meta a recomende.
- **Raio da sonda (0,25 m) e fatia de altura (0,24 m):** derivados da geometria
  DESTA base (raio 0,42, near 0,08, caminhada 1,44 m/s), não de fonte. O Godot
  usa um shape cast cujo tamanho não consegui ler no `.tscn` (o arquivo não
  declara as shapes).
