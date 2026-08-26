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
