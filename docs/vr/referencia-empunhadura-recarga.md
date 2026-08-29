# Empunhadura, mira por botão e recarga em VR — o que a plataforma manda, o que o gênero faz, e o projeto para este jogo

> **Pedido do dono, verbatim:** *"a mira e segurar a arma, isso precisa ser
> resolvido, precisamos de um botao, que segura e ele mira... isso nao funciona
> hoje, inclusive segurar a arma e recarregar e mirar, isso esta completamente
> bugado! precisa ser refeito"*
>
> Estudo feito ANTES de codar, pela regra do projeto. **Toda afirmação de fato
> tem fonte com link e citação literal entre aspas. O que não tem citação está
> na seção 3 (O QUE NÃO FOI ENCONTRADO) ou marcado como NÃO VERIFICADO.**
>
> Este documento **complementa** `docs/vr/referencia-arma-mira.md` (que cobre
> `gripSpace` × `targetRaySpace`, o offset de PC aplicado na mão, a linha de
> mira e o red dot colimado) e **não o substitui**. Onde discordo dele, a
> divergência está escrita em voz alta na seção 4.7.
>
> **Não edito `docs/vr/criterio-aaa.md`.** Onde a régua e a geometria brigam
> (B7 × B3), a seção 4.8 apenas REGISTRA — a decisão é do dono.

---

## 0. O estado de hoje, lido no código (não é opinião, é `grep`)

Antes de recomendar, medi o que existe. Quatro fatos verificados no HEAD
(`e7c380a`), que explicam por que o dono diz "completamente bugado":

**0.1 — Não existe botão que SEGURA a arma. A arma é solda.**
`game.js` reparenta `weaponRoot` na mão direita e `js/xr/xrweapon.js` reescreve
a pose todo frame (`aplicar()`, chamado incondicionalmente com `xrOn`). Não há
estado "empunhada / não empunhada", não há coldre, não há soltar. O verbo que o
dono pediu — *segurar* — não tem implementação nenhuma.

**0.2 — O botão de mirar existe, mas não faz nada que se veja.**
`js/xr/xrinput.js`: `out.mirar = botao(direita, 1)` (grip direito). Em
`game.js:3698`: `mouse.aiming = cmd.mirar || XRArma.mirando()`. Isso alimenta
`adsT` do desktop, que alimenta espalhamento, recuo e retículo — mas a POSE da
arma é sobrescrita logo depois por `XRArma.aplicar()` (game.js:3837, "DEPOIS do
applyFpsCamera, e isso é contrato"). Ou seja: **apertar o grip direito não muda
uma linha do que o jogador VÊ.** Ele aperta e nada acontece na tela. É
exatamente a queixa.

**0.3 — A recarga é invisível em VR, e a mão que recarrega é FALSA.**
A coreografia de recarga (`game.js:2009-2078`) escreve em três lugares:
`weaponRoot.quaternion` (o `tilt` da arma), `gun.parts.mag` (o pente caindo) e
`gun.parts.handL` (a mão esquerda perseguindo o pente). O `tilt` é
**sobrescrito** por `XRArma.aplicar()` — some. O pente e a `handL` são filhos de
`gun.group`, então **sobrevivem**. Resultado no headset: o pente cai e volta
sozinho e uma mão esquerda de mentira faz o gesto na arma — **enquanto a mão
esquerda real do jogador está em outro lugar, parada.**

**0.4 — O braço esquerdo do avatar nunca segue o controle esquerdo.**
`js/fpbody.js:1030` resolve a IK do braço esquerdo para
`gun.parts.handL.getWorldPosition(lp)` — a âncora do guarda-mão do MODELO. Não
há ramo de XR nessa cadeia (`js/xr/xrbody.js` cuida de altura/postura/escala e
não toca nos braços). Então em VR o braço esquerdo do boneco está sempre colado
na arma, aconteça o que acontecer com o controle esquerdo. **Somando 0.3 + 0.4:
a "segunda mão" que o jogador vê nunca é a dele.**

Esses quatro fatos são o diagnóstico. O resto do documento é o conserto.

---

## 1. O que a plataforma manda — por pergunta, com citação literal

### 1.1 Qual botão segura (e o que a spec garante que existe)

**Meta, VRC.Quest.Input.2** — requisito de publicação, não sugestão:

> "when picking up objects within the app, use the Touch Controller's grip
> button rather than the trigger button."
> — [Common VRC failures and best practices, Meta Horizon OS Developers](https://developers.meta.com/horizon/resources/publish-common-vrc-failures/)
> (o requisito também tem página própria em
> [VRC.Quest.Input.2](https://developers.meta.com/horizon/resources/vrc-quest-input-2/),
> que **não abriu** para mim — ver seção 3)

**Godot XR Tools**, a mesma escolha, com o nome da ação:

> "Pickup Axis Action: OpenXR Bool action to trigger gripping (usually the Grip axis)"
> — [Pickup Function | Godot XR Tools](https://godotvr.github.io/godot-xr-tools/docs/pickup/)

**W3C, WebXR Gamepads Module** — o mapa `xr-standard`, que é o contrato de que
este código depende (`js/xr/xrinput.js` lê índices crus):

| Buttons | xr-standard Mapping | Required |
|---|---|---|
| `buttons[0]` | Primary trigger | **Yes** |
| `buttons[1]` | Primary squeeze button | No |
| `buttons[2]` | Primary touchpad | No |
| `buttons[3]` | Primary thumbstick | No |

| Axes | xr-standard Mapping | Required |
|---|---|---|
| `axes[0]` | Primary touchpad X | No |
| `axes[1]` | Primary touchpad Y | No |
| `axes[2]` | Primary thumbstick X | No |
| `axes[3]` | Primary thumbstick Y | No |

> "Additional buttons or axes may be exposed after these reserved indices, and
> SHOULD appear in order of decreasing importance."
>
> "Devices that lack one of the optional inputs listed in the tables above MUST
> preserve their place in the buttons or axes array, reporting a placeholder
> button or placeholder axis, respectively."
>
> "In order to report a mapping of `"xr-standard"` the device MUST report a
> targetRayMode of `"tracked-pointer"` and MUST have a non-null gripSpace."
> — [WebXR Gamepads Module — §3.3](https://www.w3.org/TR/webxr-gamepads-module-1/)

E o que **não** pode ser usado, que é o que fecha o orçamento de botões:

> "User Agents SHOULD reserve at least one physical button, when possible, for
> performing unspoofable actions as part of a trusted UI. […] Buttons reserved
> by the UA or platform MUST NOT be exposed on the Gamepad."
> — [WebXR Gamepads Module — §3.4](https://www.w3.org/TR/webxr-gamepads-module-1/)

**Consequência dura:** no Touch sobram **cinco** botões pressionáveis por mão —
0 (gatilho), 1 (grip), 3 (clique do analógico), 4 e 5 (A/B, X/Y). O índice 2 é
placeholder (o Touch não tem touchpad) e o 7 (menu, só à esquerda) é reservado
pela plataforma. Qualquer projeto que precise de um sexto botão por mão está
errado por construção.

### 1.2 Hold, toggle ou sticky — o que os frameworks oferecem

**Unity XR Interaction Toolkit** é a única fonte que encontrei que **nomeia e
define os quatro modos**, e as definições são literais:

> "**Select Action Trigger** — Choose how Unity interprets the select input
> action from the controller. Controls between different input styles for
> determining if this Interactor can select, such as whether the button is
> currently pressed or just toggles the active state."
>
> "**State:** Unity will consider the input active while the button is pressed.
> A user can hold the button before the interaction is possible and still
> trigger the interaction when it is possible."
>
> "**State Change:** Unity will consider the input active only on the frame the
> button is pressed, and if successful remain engaged until the input is
> released. A user must press the button while the interaction is possible to
> trigger the interaction."
>
> "**Toggle:** The interaction starts on the frame the input is pressed and
> remains engaged until the second time the input is pressed."
>
> "**Sticky:** The interaction starts on the frame the input is pressed and
> remains engaged until the second time the input is released."
> — [XR Direct Interactor | XR Interaction Toolkit 2.4](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@2.4/manual/xr-direct-interactor.html)

**Nenhuma das quatro é o padrão normativo de plataforma.** O default do XRI é
`State` (hold), mas as outras três existem no mesmo dropdown, entregues pela
Unity, sem asterisco. Isto é o mais próximo de "o padrão da indústria" que
existe documentado: **o padrão é OFERECER OS DOIS.**

### 1.3 O que a acessibilidade manda sobre segurar botão

**Microsoft, Xbox Accessibility Guideline 107 (Input)** — a diretriz é
explícita sobre o custo de segurar:

> "**Duration:** The amount of time in which a player must hold down a control
> can also pose barriers to access, regardless of what that control is remapped
> to. For example, if a player must continuously activate an input to perform
> key game actions, like holding down RT to keep the car accelerating throughout
> a 3-minute race in a racing game, and become fatigued, re-assigning
> 'accelerate' to an input other than RT does not effectively eliminate the
> source of this barrier."
>
> "**Toggles and 'auto' holds:** For game controls that must typically be held
> down for longer periods of time like accelerating, sprinting, firing a weapon,
> repetitive jumping, etc. consider allowing players to toggle this action on
> permanently."
>
> "Avoid introducing mechanics where a key or button should be held down for an
> extended period before the input is registered."
> — [Xbox Accessibility Guideline 107](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107)

E, importante para o GATILHO (que não deve virar toggle), a mesma página abre a
exceção com o exemplo exato deste jogo:

> "There might be circumstances where activating the function on the down event
> is essential. If it's essential, the previous guidelines shouldn't be taken
> into consideration for that specific function. (Essential down-event functions
> can include experiences like a simulation of playing the piano or **shooting a
> gun**. The experience would become very unnatural if activation didn't occur
> until the up event)."
> — mesma fonte

**Game Accessibility Guidelines**, nível intermediário, categoria motora:

> "Avoid / provide alternatives to requiring buttons to be held down"
>
> "Holding a button down constantly can get painful."
> — [gameaccessibilityguidelines.com](https://gameaccessibilityguidelines.com/avoid-provide-alternatives-to-requiring-buttons-to-be-held-down/)

**Leitura para este jogo:** numa partida de battle royale a arma fica na mão
praticamente 100 % do tempo. Um `hold` obrigatório no grip é literalmente o caso
"Duration" da XAG 107, com 15–25 minutos de duração. **Sticky por padrão, hold
como opção** — e não o contrário.

### 1.4 Duas mãos na mesma arma

**Unity XRI** é a fonte que descreve o mecanismo de duas mãos como recurso de
primeira classe:

> "Set **Select Mode** to **Multiple** to allow simultaneous selections on the
> Interactable from multiple Interactors."
>
> "**Multiple Grab Transformers** — (Play mode only) The grab transformers used
> when there are multiple interactors selecting this object."
>
> "**Secondary Attach Transform** — A second attachment point to use on this
> Interactable for two-handed interaction. (Unity uses the second interactor's
> attach transform if you don't set this property)."
>
> "**Reinitialize Every Single Grab** — Re-initialize the dynamic attachment
> pose when changing from multiple grabs back to a single grab."
> — [XR Grab Interactable | XR Interaction Toolkit 3.0](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/xr-grab-interactable.html)

Três coisas que isso ensina e que valem como projeto: (a) a segunda mão é um
**ponto de fixação secundário nomeado**, não uma proximidade genérica; (b) existe
um transformador **específico** para o caso de duas mãos, distinto do de uma; e
(c) o retorno de duas para uma mão é um **evento explícito que precisa
reinicializar a pose** — se não reinicializar, a arma fica com a orientação que
tinha quando a segunda mão saiu, e isso é um salto de mira.

### 1.5 Háptico

**W3C / MDN, Gamepad API** — o caminho que este código já usa:

> "The **GamepadHapticActuator** interface of the Gamepad API represents
> hardware in the controller designed to provide haptic feedback to the user
> (if available), most commonly vibration hardware."
>
> "The `pulse()` method makes the hardware pulse at a certain intensity for a
> specified duration."
>
> ```js
> gamepad.hapticActuators[0].pulse(1.0, 200);
> ```
> — [MDN — GamepadHapticActuator](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator)

**Meta, Haptics: best practices** — as regras que decidem o desenho dos pulsos:

> "**DO design feedback holistically:** Design and integrate haptic feedback to
> complement visual and auditory cues."
>
> "**DO relate feedback to user action:** Ensure timely playback, to establish a
> clear causal connection between the user's action and the feedback they
> receive."
>
> "**DO synchronize multimodal feedback precisely:** Synchronize haptics with
> audio and visual feedback with minimal delay."
>
> "**DON'T overuse haptics:** Avoid long or overlapping haptic effects that can
> be overwhelming."
>
> "**DON'T play haptic feedback without related cues:** Standalone haptics
> without corresponding visual or audio elements can confuse users."
>
> "**DO give users a choice:** Make haptic feedback optional and adjustable."
> — [Haptics: Best practices | Meta Horizon OS Developers](https://developers.meta.com/horizon/design/haptics-best-practices/)

A última linha ("DON'T play haptic feedback without related cues") é a que
condena o desenho atual do grip: **o botão vibra ou não, mas não há nada visual
acontecendo junto.** Háptico sozinho confunde; háptico ausente num gesto que o
jogador acabou de fazer é pior ainda.

### 1.6 Marcação do alvo e retorno de agarrar

**Meta, Hands Interaction Types:**

> "Use visual and audio feedback to make up for lack of haptics."
>
> Implementar "visual and audio cues to indicate which object is currently
> targeted for distance grabbing" e "clear and consistent visual and audio
> feedback when an object is poked to confirm successful interaction."
> — [Hands Interaction Types | Meta Horizon OS Developers](https://developers.meta.com/horizon/design/hands-interaction-types/)

---

## 2. Como os FPS de VR resolvem — tabela e citações

| jogo | segurar | mira | segunda mão | recarga | háptico |
|---|---|---|---|---|---|
| **Half-Life: Alyx** | **grudada na mão** (sem hold; troca por menu) | ferro físico; laser opcional depois | livre (a outra mão faz gravity gloves) | pegar munição atrás do ombro | vibração como **confirmação de encaixe** (mod de coldre a usa como sinal) |
| **Onward** | **duas opções**: *Proximity* (encosta e cola) ou *Clicking* (aperta o grip) | ferro físico, sem assistência | obrigatória na prática ("massive accuracy" a uma mão) | gesto completo: mag release, sacar pente, câmara | não encontrado (ver §3) |
| **Pavlov** | hold (toggle **pedido** pela comunidade, não nativo à época) | ferro físico | engata por proximidade no guarda-mão; **não aponta** — queixa recorrente | gesto | não encontrado (ver §3) |
| **Contractors VR** | grip; a arma pode ser empunhada **pelo pente ou pelo guarda-mão**, com efeito diferente | ferro físico | escolha explícita de ponto de apoio | gesto, e **funciona com a arma coldreada** | não encontrado (ver §3) |
| **POPULATION: ONE** (o mais próximo deste jogo: BR em VR) | arma na mão; **grip da mão de apoio** engata as duas mãos | ferro físico **e só com duas mãos**; o retículo **some** ao mirar | reduz recuo e espalhamento | **DOIS APERTOS DE BOTÃO**, sem pente rastreado | não encontrado (ver §3) |
| **Resident Evil 4 VR** | arma na mão | ferro/laser | — | manual, com pente e ferrolho | — |
| **Firewall Ultra** | arma na mão | assistida (aim assist no modo padrão) | — | **UM botão**; manual só no "Ultra Mode" opcional | — |
| **Ghosts of Tabor** | grip | ferro | sim | gesto + *mag palming* (NÃO VERIFICADO, ver §3) | — |

### Citações que sustentam a tabela

**Onward — dois modos de empunhadura, nomeados:**

> "There are two grip options. Proximity and clicking. Proximity means that if
> your hand is close to the weapon, it snaps to it. Clicking means you have to
> click the grip button for the hands to grab hold."
>
> "You should always hold weapons with both hands. You lose massive accuracy one
> handing any weapon, including pistols."
>
> "Some weapons will have the magazine drop out from it when clicking down on
> the dominant hands trackpad/thumbstick. The other guns require you to use your
> free hand and, while clicking down on the dominant hands trackpad/thumbstick,
> grab the clip out of the gun by pulling the trigger."
>
> "The angle of your weapon can determine your speed… when you draw the gun up
> to your eyes you slow down."
> — [Onward Field Guide | UploadVR](https://www.uploadvr.com/onward-guide-tips-strategies/)

A última é ouro para este projeto: **no Onward, trazer a arma ao olho tem
consequência mecânica medível (a velocidade cai).** É a prova de que o "ADS
físico" pode ser detectado com confiança suficiente para amarrar regra de jogo
nele — que é exatamente o que `js/xr/xrweapon.js` já faz com `adsT`.

**POPULATION: ONE — o caso mais parecido com este jogo, e o mais instrutivo:**

> "Reach forward and use your grab button to two hand your gun. This will reduce
> recoil to give you more accurate shots."
>
> "Use a two handed grip and iron sights for the most accurate firing."
>
> "In POPULATION: ONE every gun has a two step reload process, but this can be
> tough while in the heat of battle."
>
> "use the right joystick to force eject the magazine to reload in between fights"
> — [Oculus Tips & Tricks: POPULATION: ONE | Meta Quest Blog](https://www.meta.com/blog/oculus-tips-tricks-population-one/)

**Half-Life: Alyx — a arma NÃO exige segurar o grip:**

> "store your weapons directly on your body instead of using the standard weapon
> selection menu"
>
> "With a weapon equipped in your primary hand, hold your grip button and move
> your hand to one of the seven holster slots on your body until you feel a
> vibration in your controller, then release the grip to holster."
> — [Body Holsters (Steam Workshop)](https://steamcommunity.com/sharedfiles/filedetails/?id=3144612716)

Duas leituras. Primeira: o mod existe **porque** o Alyx de fábrica prende a arma
na mão e troca por menu — ou seja, a arma do jogo mais elogiado do gênero é
**sticky, não hold**. Segunda: o gesto de coldre do mod (segurar grip → levar ao
slot → **vibrar** → soltar para guardar) é um padrão pronto, com o háptico no
papel de confirmação, exatamente como a Meta manda ("relate feedback to user
action").

**Contractors VR — recarga que não exige a arma na mão:**

> "If you're using a rifle, you can choose whether to grip it from the magazine
> or from the forestock."
>
> "Just slide your clip or magazine into the weapon while it's holstered and
> it'll fit snugly."
>
> "If you're holding a gun in your off-hand, you can reload it. Ambidextrous
> reloading also works if you're holding a gun by its forestock."
> — [Contractors VR: Beginner's Guide | UploadVR](https://www.uploadvr.com/contractors-vr-beginners-guide-tips/)

**Resident Evil 4 VR — recarga manual como decisão de porte:**

> "Weapons were redesigned as interactive objects you reload by hand."
> — [Rebuilding 'Resident Evil 4' | Meta Blog](https://www.meta.com/blog/rebuilding-resident-evil-4-what-it-took-to-bring-capcoms-classic-to-oculus-quest-2/)

**Firewall Ultra — o extremo oposto, e é um jogo comercial de peso:**

> "An 'Ultra mode' is coming post-launch with manual reloads, friendly fire and
> no aim assist for the hardcore players. This will be a separate mode than our
> main public matchmaking, it is for pro players and it will not replace our
> current auto reload. It will live alongside it for those that prefer that way
> to play."
> — CEO Hess Barber, citado em
> [Firewall Ultra Will Add 'Ultra Mode' Post-Launch With Manual Reloads | UploadVR](https://www.uploadvr.com/firewall-ultra-manual-reloading-update/)

**Pavlov — a armadilha da segunda mão, documentada pela reclamação:** o
`referencia-arma-mira.md` §2.2 já cita que em Pavlov a mão de apoio **não**
altera a direção, e que a divergência entre "para onde cada mão aponta" e "a
linha entre as mãos" faz a mira SALTAR no engate. É por isso que o engate deste
jogo é suave e com histerese (`js/xr/xrweapon.js`, `APOIO_PEGA`/`APOIO_SOLTA`).

### 2.1 A conclusão que a tabela obriga

**Não existe "botão de ADS" em nenhum FPS de VR de referência.** Em todos os
oito, mirar é **trazer a arma ao olho**. O que varia é o que o jogo faz por
você depois disso: Firewall Ultra dá aim assist, Onward dá zero, POPULATION:
ONE troca o retículo pelo ferro e reduz espalhamento com duas mãos.

**Mas o dono pediu um botão.** A leitura honesta do pedido dele, à luz da
tabela, é: *"não sei se estou segurando, não sei se estou mirando, e apertar o
que existe hoje não muda nada na tela"* — que é o item 0.2 desta pesquisa. O
conserto certo **não** é teleportar a arma para o olho num botão (isso é B4, e
o gênero inteiro recusa); é dar ao botão um trabalho **visível** e ao gesto de
mirar uma **consequência visível**. É o que a seção 4 faz.

---

## 3. O QUE NÃO FOI ENCONTRADO (obrigatório)

**Falhas de busca / acesso — declaradas, não disfarçadas:**

1. **`developers.meta.com/horizon/resources/vrc-quest-input-2/`** devolveu
   "Sorry, this content isn't available right now". O texto do requisito foi
   obtido da página irmã (`publish-common-vrc-failures/`), que abriu e traz a
   citação literal usada em §1.1. **A página dedicada ao VRC continua não
   conferida.**
2. **`wiki.onwardhq.com`** — falha de DNS (`getaddrinfo ENOTFOUND`). Toda a
   mecânica do Onward neste documento vem do guia da UploadVR, não do wiki
   oficial.
3. **`population-one-vr.fandom.com`** — HTTP 402 no acesso direto. As frases do
   wiki que apareceram em resumo de busca (recarga "press the side button on
   your non-dominant hand… and then again to cock it"; "If you look through your
   gun sights while in two hand mode, your red marker will turn to iron sights";
   "when you put the gun up to your face to aim down the sights, the red
   crosshair goes away") **estão marcadas NÃO VERIFICADAS.** Onde precisei de
   POPULATION: ONE como fato, usei o blog da própria Meta, que abriu.
4. **UnrealEngine.com (entrevista Armature/RE4 VR)** — HTTP 403. A citação de
   RE4 VR vem do blog da Meta.
5. ***Mag palming* do Ghosts of Tabor** — só encontrei vídeos curtos e TikTok.
   **NÃO VERIFICADO**; está na tabela apenas como existência de padrão, sem
   citação.

**Perguntas que continuam sem fonte (não invente resposta em cima delas):**

6. **Não existe documento normativo de plataforma (Meta, W3C, three.js) dizendo
   se o grip deve ser hold ou toggle.** A VRC.Quest.Input.2 diz QUAL botão, não
   QUAL modo. A única fonte que trata os modos como coisa nomeada é a Unity
   (§1.2), que é framework de terceiro, não a plataforma.
7. **Nenhum número publicado para fadiga de mão em VR** — nenhuma fonte diz
   "após N minutos de grip contínuo o jogador desiste". A XAG 107 argumenta por
   princípio ("become fatigued"), sem grandeza.
8. **Nenhuma documentação da Meta sobre RETÍCULO em VR.** Procurei; não achei
   página de design que trate de crosshair/retículo de arma. O critério H3 desta
   base ("o retículo não mente") tem lastro de gênero (POPULATION: ONE, NÃO
   VERIFICADO) e não tem lastro de plataforma.
9. **Nenhum jogo publicou o limiar de distância que usa** para engatar a mão de
   apoio. Os `APOIO_PEGA = 0,20 m` / `APOIO_SOLTA = 0,32 m` deste repo **não têm
   fonte externa** — são ergonomia sem lastro, e ficam marcados como tal.
10. **Nenhuma fonte descreve como os jogos resolvem o "cotovelo impossível"**
    quando a separação das mãos não bate com o comprimento da arma. O que
    encontrei foi o mecanismo do XRI (§1.4), que resolve a POSE do objeto, não a
    IK do braço. A solução da seção 4.4 é **projeto meu, sem lastro externo.**
11. **Nenhuma fonte de háptico específico dos FPS de VR** (Onward, Pavlov,
    Contractors, POPULATION: ONE). A coluna "háptico" da tabela é "não
    encontrado" em cinco das oito linhas, e está assim escrita.
12. **Nenhuma explicação dos desenvolvedores do Firewall Ultra** para a escolha
    de auto-reload como padrão — a UploadVR registra a decisão e a reação, não a
    razão.

---

## 4. Projeto de interação para ESTE jogo

### 4.1 As cinco decisões, e o porquê de cada uma

**D1 — O grip da mão da arma SEGURA a arma, e é STICKY por padrão.**
Botão: `buttons[1]` da mão direita (destro) — VRC.Quest.Input.2 (§1.1). Modo:
`Sticky` no sentido literal do XRI — "starts on the frame the input is pressed
and remains engaged until the second time the input is released" (§1.2). Porque
o Alyx prende a arma na mão sem hold (§2), porque a XAG 107 chama hold de longa
duração de barreira (§1.3), e porque numa partida de BR o hold duraria 20
minutos. **Opção "Empunhadura: apertar / manter"** no menu de VR, com `apertar`
como padrão — é o "provide alternatives" das duas fontes de acessibilidade.

**D2 — O grip da mão de apoio é HOLD, e é contextual.**
Botão: `buttons[1]` da mão esquerda. Hold porque a mão de apoio precisa entrar e
sair muitas vezes por minuto (apoiar, largar para abrir porta, largar para o
radial), e toggle nesse ritmo produz exatamente o "engatou sem querer" que a
histerese existe para evitar. Contextual porque esse botão já é o `agarrar` de
`js/xr/xrinteract.js` — a prioridade está em 4.3.

**D3 — Mirar continua sendo FÍSICO. O botão não move a arma. Nunca.**
Oito de oito jogos (§2). B4 da régua. E `js/xr/xrweapon.js` já mede isso
(`RECUO_MIN/MAX`, `PERP_MAX`). **O que muda é o que o jogador VÊ quando a mira
engata** — 4.5.

**D4 — O grip direito ganha um segundo trabalho visível: o COLDRE.**
Soltar a arma num BR não pode significar "cai no chão" (o jogador perde a arma
por erro de botão). Soltar significa **guardar**: a arma vai para o coldre das
costas com o gesto do Alyx/Body Holsters (§2) — háptico ao entrar na zona,
solta confirma. A mão fica livre, e é isso que destrava escalar, dirigir e
interagir com as duas mãos. **É o "segura" do pedido do dono virando algo que se
vê acontecer.**

**D5 — A recarga tem TRÊS caminhos, com o MESMO tempo.**
Gesto (padrão), botão (equivalente) e automática (acessibilidade). Os três
consomem `gun.reloadTime` idêntico. **Nenhum é mais rápido que o outro** — este
é um jogo multiplayer, e transformar acessibilidade em desvantagem competitiva é
o oposto do que a XAG 107 pede. É o arranjo do Firewall Ultra (auto-reload
convive com manual, §2), sem o pecado de o manual ser modo separado.

### 4.2 Mapeamento de botões proposto (destro; canhoto espelha)

| botão | índice | MÃO DIREITA (arma) | MÃO ESQUERDA (apoio) |
|---|---|---|---|
| gatilho | 0 | **ATIRAR** (borda p/ semi, estado p/ auto) — *inalterado* | **RADIAL** (granada / kit / comer / mira) — *inalterado* |
| grip | 1 | **SEGURAR A ARMA / COLDRE** (sticky) — **novo, era `mirar`** | **APOIO · PENTE · AGARRAR** (hold, contextual) — *estendido* |
| analógico (clique) | 3 | **PAUSA** — *inalterado* | **AGACHAR** — *inalterado* |
| A / X | 4 | **PULAR** — *inalterado* | **USAR** (`KeyE`) — *inalterado* |
| B / Y | 5 | **TROCAR ARMA** — *inalterado* | **RECARREGAR** (`KeyR`, via botão) — *inalterado* |
| analógico (eixos 2/3) | — | **GIRO EM PASSOS** — *inalterado* | **ANDAR / CORRER no batente** — *inalterado* |

**Muda exatamente UM botão: o grip direito.** Sai `mirar` (que hoje não produz
efeito visível — item 0.2) e entra `segurar/coldrear`. Todo o resto do mapa,
que foi conquistado a duras penas em `js/xr/xrinput.js`, fica intacto. O
orçamento de cinco botões por mão continua fechado, sem sexto botão.

**Sobre "sai `mirar`":** quem não consegue levantar o braço perde o ADS. Por
isso a opção **"Mira assistida" (padrão: desligada)**, que devolve `adsT = 1`
com o grip direito **mantido** por 0,3 s — sem mover a arma, só valendo o
espalhamento e o retículo. É a mesma coisa que o `mirar` faz hoje, só que
declarada como acessibilidade e desligada por padrão, em vez de ser o único
comportamento e não fazer nada visível.

### 4.3 O grip esquerdo é contextual — a prioridade, em ordem, sem empate

Avaliada **na borda de subida** do grip esquerdo, uma vez, e o modo escolhido
vale até soltar:

1. **`PENTE`** — se `gun.reloading` está em `AGUARDANDO_PENTE` **e** a mão está
   dentro da zona do carregador (esfera de 0,25 m centrada em
   `cabeça + (0, −0,45, −0,15)` no espaço do corpo — o peito). Pega o pente.
2. **`APOIO`** — senão, se a mão está a ≤ `APOIO_PEGA` (0,20 m) da âncora
   `supportHand` da arma. Engata a segunda mão.
3. **`AGARRAR`** — senão, o comportamento atual de `js/xr/xrinteract.js`
   (perto: direto; longe: flick ou retenção de `HOLD_LONGE`).

**Regra que evita o defeito clássico:** quando o modo escolhido é 1 ou 2, o
temporizador `gripSeguraT` do agarre à distância é **zerado e travado** enquanto
durar o aperto. Sem isso, apoiar a arma por 0,4 s dispara um agarre à distância
de um baú a 5 m — o botão faz duas coisas ao mesmo tempo, e o jogador nunca
descobre por quê.

### 4.4 Segurar, apoiar, e o cotovelo impossível

**Ao apertar o grip direito (segurar):**
`estado = EMPUNHADA`. A arma é posicionada com `gripR` sobre a palma
(`gripSpace`) — o que `js/xr/xrweapon.js` já faz. Háptico `pegar`
(0,45 / 40 ms, mão direita — tabela existente de `js/xr/xrhaptics.js`). Som de
empunhadura. A mão do avatar fecha.

**Ao apertar de novo (soltar):** se a mão está na zona do coldre (esfera de
0,22 m em `ombro direito + (0, −0,10, +0,18)` no espaço do corpo), a arma
**coldreia**: some da mão, aparece nas costas, háptico `pegar`. Se **não** está
na zona do coldre, a arma coldreia do mesmo jeito, com uma animação de 0,2 s
levando-a até lá. **A arma nunca cai no chão.** Este é um BR: perder a arma por
erro de botão é perder a partida, e não há fonte nenhuma que peça isso.

**A segunda mão entra (grip esquerdo, modo `APOIO`):** a direção do cano passa
a ser a linha entre as mãos com `SUAVIZA_MAOS` (já implementado). Ganho de
jogo, na mecânica que POPULATION: ONE publicou: **recuo e espalhamento
reduzidos** (§2) — concretamente, `spread *= 0.72` e `recoil *= 0.65` enquanto
`duasMaos`. Háptico curto nas duas mãos ao engatar (0,3 / 20 ms).

**A segunda mão sai:** por distância ≥ `APOIO_SOLTA` (0,32 m, histerese) ou por
soltar o botão. Na saída, a orientação da arma volta à mão direita **com o mesmo
`SUAVIZA_MAOS`**, nunca de um frame para o outro — é o `Reinitialize Every
Single Grab` do XRI (§1.4) traduzido: o retorno de duas para uma mão é um evento
que precisa reinicializar a pose, e reinicializar seco é um salto de mira.

**MÃO DE APOIO LONGE DEMAIS — o caso ruim, resolvido sem esticar nada:**
A arma **nunca muda de comprimento.** O ponto de apoio efetivo é a **projeção da
mão esquerda sobre o eixo do cano, limitada ao segmento `gripR → muzzle`**:

```
p = gripRMundo + eixo * clamp( dot(maoEsq − gripRMundo, eixo), 0, |muzzle − gripR| )
```

A arma é orientada por `gripR → p`, e a mão do avatar é desenhada em `p` — na
arma, sempre. O controle real pode estar fora; o boneco não. Se
`|maoEsq − p| ≥ APOIO_SOLTA`, o apoio **desengata**. Com isso:

- a arma nunca estica (o comprimento é o do modelo, e é uma grandeza medível —
  ver M5);
- o cotovelo nunca é impossível, porque o alvo da IK está sempre dentro do
  comprimento da arma a partir do punho, e o punho está na mão real;
- **e a IK precisa multiplicar o alcance do braço pela escala da raiz** — em VR
  a raiz do corpo vale ~0,89 e `armLen` foi medido em escala 1. Sem multiplicar,
  o solver pede um braço ~12 % mais longo do que existe e a clavícula para de
  estender **fora** do alcance verdadeiro (isto já aconteceu duas vezes nesta
  base, perna e braço — `CLAUDE.md`).

**E o defeito 0.4 tem de morrer junto:** enquanto `XR.presenting`, o alvo da IK
do braço esquerdo passa a ser **o controle esquerdo real** (`gripSpace` da mão
esquerda) quando não há apoio, e `p` quando há. Nunca mais `gun.parts.handL`.
`gun.parts.handL` continua existindo para o desktop.

### 4.5 O que muda VISUALMENTE ao mirar (e é aqui que o pedido do dono fecha)

Hoje o jogador aperta e nada acontece. A partir daqui, três coisas acontecem, e
nenhuma delas move a arma:

1. **O retículo do mundo SOME.** Com `adsT ≥ 0,6` o retículo deixa o grafo da
   cena. É o critério H3 ("o retículo é do mundo ou não existe") e é o
   comportamento de POPULATION: ONE (NÃO VERIFICADO, §3). É o sinal
   inconfundível de "a mira engatou" que falta hoje.
2. **O ponto vermelho acende colimado.** Já projetado em
   `referencia-arma-mira.md` §2.4: com a lente em `z = 0` do espaço da mira, o
   ponto é desenhado em `(olho.x, olho.y, 0)` daquele espaço — ângulo zero entre
   "olho → ponto" e o eixo do cano, para qualquer posição do olho.
3. **Espalhamento e recuo caem** por `adsT`, como já cai hoje.

E **nada** de FOV animado, nada de a arma andar para o centro, nada de zeragem
dinâmica (proibida — `CLAUDE.md`: ela faz o ponto de impacto andar entre um tiro
e o outro).

**Háptico ao engatar a mira: não.** Um pulso a cada vez que a mira entra e sai
da janela, num jogo em que isso acontece dezenas de vezes por minuto, é
literalmente o "avoid long or overlapping haptic effects" da Meta (§1.5). O
sinal de mira é visual, e visual basta.

### 4.6 A recarga — fluxo completo, estados e tempos

Cinco estados. `T = gun.reloadTime` da arma (já existe, por arma).

| estado | entra quando | dura | o que o jogador vê / sente |
|---|---|---|---|
| `OCIOSA` | padrão | — | — |
| `PENTE_FORA` | jogador inicia (ver abaixo) | 0,18 T | pente cai do poço; háptico `recarga` (0,40 / 45 ms) na **mão de apoio**; som |
| `AGUARDANDO_PENTE` | fim do anterior | até 0,70 T | **um pente-fantasma aparece no peito**, marcado com anel (Meta: "visual and audio cues to indicate which object is currently targeted", §1.6) |
| `ENCAIXANDO` | mão de apoio com pente chega ao `magwell` (≤ 0,12 m) **ou** o botão foi o caminho | resto até T | pente sobe até o poço; háptico `recarga-pronta` (0,75 / 30 ms) na mão da **arma** ao assentar |
| `PRONTA` | `t ≥ reloadEnd` | — | `mag` sobe, `reserve` desce, HUD atualiza |

**Os três caminhos de entrada, todos gastando o mesmo T:**

- **Gesto (padrão):** grip esquerdo apertado dentro da zona do peito com a arma
  sem munição cheia. Pega o pente-fantasma; leva ao `magwell`; solta. **Não
  existe objeto de pente rastreado com física** — o "pente" é um mesh preso à
  mão de apoio e a aceitação é por distância ao `magwell` da arma. É o
  meio-termo do gênero: POPULATION: ONE mima a manipulação sem exigir precisão
  (§2), e este projeto vai um passo além ao não exigir nem o objeto.
- **Botão:** `Y` esquerdo (`KeyR`, o caminho de hoje) executa `PENTE_FORA →
  ENCAIXANDO → PRONTA` no relógio, sem exigir a mão. É o Firewall Ultra (§2).
- **Automática (opção, padrão desligada):** ao esvaziar o pente, o caminho do
  botão dispara sozinho. "Toggles and 'auto' holds" da XAG 107 (§1.3).

**A escopeta (recarga por cartucho) mantém o modelo atual** — `reloadPerShell`,
cartucho a cartucho, cancelável a qualquer momento. O gesto para ela é levar a
mão de apoio à porta de carregamento, e cada chegada carrega um cartucho.

**Os casos ruins, decididos aqui:**

- **Soltar a arma no meio da recarga** (coldrear com `reloading`): a recarga
  **aborta**. `mag` volta ao valor de antes de começar e **`reserve` não é
  debitado** — o débito acontece só em `PRONTA`, nunca em `PENTE_FORA`. Nenhuma
  munição desaparece por causa de um botão. Ao empunhar de novo, a recarga
  precisa ser reiniciada (não retoma de onde parou; retomar esconde do jogador
  quanto falta).
- **Mirar enquanto recarrega:** permitido, e sem penalidade. A mira é geometria;
  ela não sabe que existe recarga. O que continua bloqueado é **atirar** com
  `mag === 0`. E, como hoje, **atirar cancela a recarga se `mag > 0`**
  (game.js:2682) — é a recarga tática, e é boa.
- **Atirar sem munição:** *dry fire*. Clique seco (som), háptico curtíssimo e
  fraco (0,20 / 12 ms — abaixo do pulso de tiro, para não ser confundido com
  tiro), ferrolho aberto visível no modelo, e o rótulo `RECARREGAR` no painel
  preso à arma. **Zero mensagens ao servidor**, zero `fire()`. Segurar o gatilho
  vazio não repete o clique: uma vez por borda.
- **Mão de apoio longe demais durante o gesto:** o pente-fantasma **acompanha a
  mão** (ele está preso a ela). Não há "longe demais" para o pente; há só
  "ainda não chegou ao poço". Se o jogador soltar o grip antes de chegar, o
  pente cai e o estado volta a `AGUARDANDO_PENTE` — o relógio de 0,70 T continua
  correndo, e se estourar, o caminho do botão assume sozinho (o jogador nunca
  fica preso num estado por incompetência de gesto).
- **Trocar de arma no meio da recarga:** já cancela hoje (`game.js:1386`).
  Mantido, com o mesmo estorno de `reserve`.

### 4.7 Onde este documento DISCORDA do `referencia-arma-mira.md`

Aquele documento, §4 item 6, diz: *"Quando a culatra chega perto demais da
cabeça, ela é empurrada para a frente ao longo do cano."* **O código faz o
contrário** e explica por quê no cabeçalho de `js/xr/xrweapon.js`: a arma
**some** (`weaponRoot.visible = false` dentro de `CABECA_RAIO = 0,12 m`), porque
empurrar desgruda a arma da mão — que é o defeito que o módulo veio consertar.
**O código está certo e o documento envelheceu.** Registro aqui em vez de
corrigir lá, porque não é meu arquivo e a regra da casa é não contradizer em
silêncio.

### 4.8 O conflito B7 × B3 — REGISTRO, sem decisão

`docs/vr/criterio-aaa.md` B7 pede a origem do tiro a ≤ 0,05 m da boca do cano.
B3 pede o tiro na linha de mira. A alça deste jogo fica **6 a 20 cm acima do
cano**; com a origem no cano e o alvo na alça os dois só concordam numa
distância. **São geometricamente incompatíveis, o teto do teste já foi
afrouxado com o motivo escrito no arquivo, e o texto do critério continua
intocado esperando o dono.** Nada nesta pesquisa mexe nisso. O que este
documento acrescenta é só o lembrete de que a exceção medida continua valendo:
**projétil VISÍVEL (o foguete) nasce na BOCA** — origem deslocada num foguete
detona perto de quem atirou (42 de dano em si mesmo, medido).

---

## 5. Como medir cada item no kit emulado (IWER)

O kit é o de `test/helpers/iwer.js`: `bootEmVR`, `window.__A.botao(mao, id, v)`
com os ids do config oficial da Meta (`trigger`, `squeeze`, `thumbstick`,
`x-button`/`y-button`, `a-button`/`b-button`), `__A.stick`, `__A.espera`, e as
poses por `window.__xrEmulado.controllers[mao].position/quaternion`.

**Duas regras que atravessam todas as medidas abaixo:**

- **Âncora independente.** A régua nunca pode ser gerada pelo código sob teste.
  Para mira, a âncora é o **CANO** (`__game.canoDoTiro()` / `canoPosDoTiro()`),
  que é geometria do modelo desenhado. Ler `miraDoTiro()` e comparar com o raio
  é comparar uma reta consigo mesma — `_rayDir.copy(_miraDirDoTiro)`, distância
  zero por álgebra (formato 2 do catálogo).
- **Congelar no instante do evento.** Ler o cano DEPOIS do disparo mede o
  **recuo**: 0,88° numa automática (15 cm a 10 m) e 42 cm na bazuca. Use as
  variantes congeladas (`canoDoTiro`, `canoPosDoTiro`, `origemDoTiro`). E, em
  XR, amostre pose de câmera com `setFromMatrixPosition(camera.matrixWorld)`
  **depois** do render — `getWorldPosition()` compõe `rig(N) × pose(N−1)` e os
  dois erros se cancelam exatamente.

### M1 · O botão SEGURA (e é sticky)

**Grandeza:** distância, em metros, entre a âncora `gripR` da arma no mundo e a
origem do `gripSpace` da mão direita (`renderer.xr.getControllerGrip(i)`), e a
posição da arma em relação ao **ombro** (para provar que coldreou).
**Roteiro:** `botao('right','squeeze',1)` → `0` (um clique completo) → esperar
250 ms → medir (deve ser ≤ **0,03 m**, empunhada). Repetir o clique → esperar →
medir (deve estar ≥ **0,25 m** da palma e ≤ **0,25 m** do ombro: coldreada).
**Duas fontes independentes:** a âncora vem do perfil/GLB (`WeaponRig.inspect`),
a palma vem do runtime.
**Defeito reinjetado que fica vermelho:** trocar `Sticky` por `State` (hold) —
o segundo clique não solta, a arma continua na palma, e a segunda medida dá
~0,02 m em vez de ≥ 0,25 m.
**Por que não é acidente:** não é formato 1 (a asserção pode falhar, e falha com
número); não é formato 5 (mede posição de mundo, não `visible` — e afirma
também que `weaponRoot` alcança a `scene` subindo por `.parent`).

### M2 · Mirar é FÍSICO — o botão não move a arma

**Grandeza (duas):** (a) `adsT` (`__game.XRArma.estado().ads`); (b) a pose LOCAL
da arma relativa ao `gripSpace` — posição em metros e ângulo em graus.
**Roteiro:** arma no quadril (controle a 0,45 m abaixo e à frente da cabeça).
Medir (a) e (b). `botao('right','squeeze',1)`, esperar 700 ms, medir de novo.
**Aprova:** `adsT` continua < **0,10**, e a pose local variou ≤ **0,001 m** e
≤ **1°**. Depois, sem tocar em botão nenhum, mover a cabeça para a janela de
mira e medir: `adsT` > **0,90**.
**Defeito reinjetado:** religar `mouse.aiming = cmd.mirar` no caminho que move a
arma — a parte (a) sobe para ~1,0 com o botão e a parte (b) salta (hoje, sem o
`XRArma.aplicar` por cima, seriam ~6,7 cm — o número que a régua registra em B4).
**Por que não é acidente:** as duas metades do teste testam limiares opostos
(botão sem gesto → 0; gesto sem botão → 1), então não é formato 9. E a segunda
metade prova que o mecanismo funciona, então a primeira não passa por o
mecanismo estar morto.

### M3 · A mira é a da ARMA, e o teste não compara reta com ela mesma

**Grandeza:** (i) distância **perpendicular** do raio de tiro ao centro da massa
de mira, em metros; (ii) ângulo entre o raio de tiro e o **eixo do cano**
congelado no disparo.
**Roteiro:** posicionar cabeça e controle na geometria de tiro, disparar UMA vez
(`botao('right','trigger',1)` → `0`), e ler `__game.miraDoTiro()`,
`__game.canoDoTiro()`, `__game.canoPosDoTiro()` e os nós de mira lidos das
**matrizes do modelo** (como `test/xr-weapon.test.js` já faz).
**Aprova:** (i) o raio passa dentro do círculo da massa; (ii) o ângulo é o que a
geometria da alça sobre o cano prevê (6–20 cm de *sight height over bore*), não
zero — e essa previsão sai do modelo, não do módulo de mira.
**Defeito reinjetado:** girar o eixo óptico 6° (≈105 cm de erro a 10 m). O teste
que lia `miraDoTiro()` contra si mesma calculava **1,86e-15 m** e continuava
verde; contra o cano, (ii) muda 6° e fica vermelho.
**Por que não é acidente:** formato 2 está explicitamente evitado (âncora no
cano, que é modelo desenhado); formato 3 também, porque a medida é a componente
**perpendicular**, não a componente ao longo do cano — uma arma com o cano cinco
metros para o lado passaria na paralela.
**E os TRÊS caminhos:** repetir M3 para hitscan, para `window.__BR_ballistics`
(`gun.projSpeed`) e para o foguete. Uma correção de mira feita só no hitscan já
deixou o BR errando 9,10 cm no fuzil e 20,00 cm no plasma, constante em toda
distância.

### M4 · A segunda mão realmente aponta a arma

**Grandeza:** variação, em graus, de `__game.direcaoDoCano()` quando a mão de
apoio se move lateralmente 0,20 m, com a mão da arma **imóvel**.
**Roteiro:** engatar o apoio (mão esquerda a 0,15 m da âncora `supportHand`,
grip esquerdo mantido), esperar a mistura estabilizar (≥ 400 ms com
`SUAVIZA_MAOS = 12`), ler a direção; mover a esquerda 0,20 m para o lado; ler de
novo. Depois **desengatar** (mão a 0,50 m) e repetir o mesmo deslocamento.
**Aprova:** engatado, a variação é `atan(0,20 / d)` ± 3°, onde `d` é a separação
das mãos medida das poses; desengatado, ≤ **0,5°**.
**Defeito reinjetado:** fixar `mistura = 0` — o caso engatado cai para ~0° e
fica vermelho com número.
**Por que não é acidente:** mede as duas pontas do limiar (formato 9 evitado); o
valor esperado vem da trigonometria das poses que o próprio teste impôs, não de
uma constante do módulo (formato 1 evitado).

### M5 · Mão de apoio longe demais — a arma não estica, o braço não quebra

**Grandeza (três):** (i) `|muzzleMundo − gripRMundo|` em metros; (ii)
`duasMaos`; (iii) distância do **osso** da mão esquerda ao **osso** do ombro
esquerdo, em metros, contra `armLen.l × escalaDaRaiz`.
**Roteiro:** engatar o apoio; afastar a mão esquerda para 0,50 m, 1,20 m e
2,00 m da âncora; medir os três a cada parada.
**Aprova:** (i) constante dentro de **1 mm** nas quatro medições; (ii) `false`
em todas acima de `APOIO_SOLTA`; (iii) sempre ≤ `armLen.l × escala`, e a escala
é lida de `XR.corpo.escala` (~0,89), não assumida 1.
**Defeito reinjetado:** remover o `clamp` da projeção sobre o eixo do cano — (i)
passa a crescer com a mão e estoura 1 mm imediatamente. Remover a multiplicação
pela escala — (iii) passa a pedir ~12 % a mais do que existe.
**Por que não é acidente:** mede por **OSSO** (`bone.getWorldPosition`), nunca
por `Box3.setFromObject` num `SkinnedMesh` — essa caixa é congelada na pose em
que alguém a pediu primeiro, e três arquivos de teste desta base já mediram a
RAIZ achando que mediam os pés.

### M6 · A recarga por gesto exige a mão no lugar certo

**Grandeza:** distância, em metros, entre a mão de apoio e a âncora `magwell` da
arma **no frame exato em que o estado muda para `ENCAIXANDO`**.
**Roteiro:** exportar `__game.recarga()` → `{ estado, mag, reserve, restanteMs }`
e um `__game.recargaEventos()` que **congela** a medição na transição (poll não
serve: a 72 Hz o frame da transição escapa). Iniciar por gesto com a mão a
1,00 m do `magwell` e esperar; depois repetir com a mão a 0,08 m.
**Aprova:** com a mão a 1,00 m, o estado **não** vai para `ENCAIXANDO` pelo
gesto (só pelo estouro dos 0,70 T, e aí o campo `via` diz `'tempo'`, não
`'gesto'`); com a mão a 0,08 m, vai, e a distância congelada é ≤ **0,12 m**.
**Defeito reinjetado:** aceitar o encaixe sem checar distância — a primeira
metade passa a encaixar com 1,00 m e o número denuncia.
**Por que não é acidente:** o teste **observa** o produto (lê o estado que o
jogo escreve), não dirige um condutor próprio — é o formato 4, que já deixou os
nove casos de `xr-hud.test.js` verdes com o `update()` arrancado do loop. Aqui a
recarga é dirigida pelos botões/poses reais e lida pelo estado real.

### M7 · Soltar no meio da recarga não come munição

**Grandeza:** `mag` e `reserve` antes, no meio e depois.
**Roteiro:** anotar `(mag0, reserve0)`; iniciar recarga; em `0,4 T` coldrear
(clique no grip direito); esperar 2 T; ler.
**Aprova:** `mag === mag0` e `reserve === reserve0`, exatamente.
**Defeito reinjetado:** debitar `reserve` em `PENTE_FORA` — `reserve` fica
`magSize` abaixo e o teste falha com o número da diferença.
**Por que não é acidente:** não é formato 7 (`||` com termo que se satisfaz
sozinho) — são duas igualdades ligadas por `&&`, e nenhuma das duas sobe
sozinha neste jogo (`reserve` só muda em recarga e em pickup, e o teste não
pega pickup nenhum).

### M8 · Atirar sem munição não vira tiro

**Grandeza (duas independentes):** (i) contagem de disparos efetivos
(`__game.tirosDados()` ou o espião de mensagens do socket, como
`test/security-regression.test.js` já faz); (ii) o plano de pulso emitido,
capturado pelo espião de `pulse` (o mesmo de `test/xr-haptics.test.js`).
**Roteiro:** zerar `mag`, dar 5 cliques de gatilho.
**Aprova:** (i) **zero** disparos e zero mensagens ao servidor; (ii) exatamente
**5** pulsos de `vazio`, com `ms` dentro de [8, 250] e intensidade < a do pulso
de `tiro` da mesma arma.
**Defeito reinjetado:** deixar `fire()` rodar com `mag === 0` — (i) vai a 5.
**Por que não é acidente:** (ii) sozinha seria fraca; (i) é a medida da CAUSA
(o servidor recebeu ou não), e é imune a qualquer dublê de front.

### M9 · O retículo não mente

**Grandeza:** o retículo do mundo está **no grafo da cena**? (subir `.parent`
até `scene`), e qual a opacidade efetiva.
**Roteiro:** medir com `adsT < 0,10` (arma no quadril) e com `adsT > 0,90`
(arma no olho).
**Aprova:** no quadril, no grafo **e** opacidade > 0,5; no olho, **fora do
grafo** (ou opacidade 0).
**Defeito reinjetado:** deixar o retículo sempre no grafo — o segundo caso fica
vermelho.
**Por que não é acidente:** formato 5 explicitamente evitado — objeto com
`visible: true` e sem pai não é desenhado por ninguém, e comentar uma linha já
deixou `xr-radial.test.js` 11 de 12 verde. Aqui a pergunta é a do grafo, não a
do campo.

### M10 · Háptico na mão certa, no evento certo

**Grandeza:** `(mao, intensidade, ms)` de cada `pulse`, capturados com carimbo
de tempo.
**Roteiro:** empunhar, engatar apoio, recarregar (gesto), assentar o pente,
atirar, atirar vazio.
**Aprova:** `pegar` na **direita**; `recarga` na **esquerda** (é ela que busca o
pente — a tabela de `js/xr/xrhaptics.js` já decide isso); `recarga-pronta` na
**direita**; nenhuma sobreposição de dois pulsos na mesma mão (Meta: "avoid long
or overlapping haptic effects"); todo `ms` em [8, 250].
**Defeito reinjetado:** trocar a mão do `recarga` para a direita — falha
nomeando a mão errada.
**Por que não é acidente:** a asserção da mão **pode** falhar (não é formato 1),
e a asserção de não-sobreposição compara pares de pulsos com tempos reais, não a
tabela consigo mesma (formato 1 na variante "tabela de prioridade comparada
consigo mesma", que já apareceu nesta base).

### O que NÃO dá para medir no IWER (declarado)

- **Fadiga de mão** — precisa de humano de headset. Vai para
  `npm run vr:sessao`, com pergunta em voz alta: *"depois de dez minutos, sua
  mão pediu para largar o grip?"*
- **Se o coldre "cai onde a mão espera"** — é ergonomia, não geometria. Humano.
- **Se o gesto de recarga é gostoso** — humano. O que a máquina mede é se ele
  **exige** a mão no lugar certo (M6), não se é agradável.

---

## Fontes

**Normativas / plataforma**
- [W3C — WebXR Gamepads Module (mapa `xr-standard`, §3.3 e §3.4)](https://www.w3.org/TR/webxr-gamepads-module-1/)
- [Meta — Common VRC failures and best practices (VRC.Quest.Input.2)](https://developers.meta.com/horizon/resources/publish-common-vrc-failures/)
- [Meta — VRC.Quest.Input.2 (página dedicada; NÃO ABRIU, ver §3)](https://developers.meta.com/horizon/resources/vrc-quest-input-2/)
- [Meta — Haptics: best practices](https://developers.meta.com/horizon/design/haptics-best-practices/)
- [Meta — Hands Interaction Types](https://developers.meta.com/horizon/design/hands-interaction-types/)
- [MDN — GamepadHapticActuator](https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator)

**Frameworks**
- [Unity — XR Direct Interactor (Select Action Trigger: State / State Change / Toggle / Sticky)](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@2.4/manual/xr-direct-interactor.html)
- [Unity — XR Grab Interactable (Select Mode, Multiple Grab Transformers, Secondary Attach Transform)](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/xr-grab-interactable.html)
- [Godot XR Tools — Pickup Function](https://godotvr.github.io/godot-xr-tools/docs/pickup/)
- [Godot XR Tools — Grab Points](https://godotvr.github.io/godot-xr-tools/docs/grab_point/)

**Acessibilidade**
- [Microsoft — Xbox Accessibility Guideline 107 (Input)](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/107)
- [Game Accessibility Guidelines — Avoid / provide alternatives to requiring buttons to be held down](https://gameaccessibilityguidelines.com/avoid-provide-alternatives-to-requiring-buttons-to-be-held-down/)

**Jogos do gênero**
- [UploadVR — Onward Field Guide (Proximity vs Clicking; duas mãos; recarga)](https://www.uploadvr.com/onward-guide-tips-strategies/)
- [Meta Quest Blog — Oculus Tips & Tricks: POPULATION: ONE](https://www.meta.com/blog/oculus-tips-tricks-population-one/)
- [POPULATION: ONE Wiki — Combat basics (HTTP 402; NÃO VERIFICADO)](https://population-one-vr.fandom.com/wiki/Combat_basics)
- [UploadVR — Contractors VR: Beginner's Guide](https://www.uploadvr.com/contractors-vr-beginners-guide-tips/)
- [Steam Workshop — Body Holsters (Half-Life: Alyx): o que o Alyx faz de fábrica e o gesto de coldre](https://steamcommunity.com/sharedfiles/filedetails/?id=3144612716)
- [Meta Blog — Rebuilding 'Resident Evil 4'](https://www.meta.com/blog/rebuilding-resident-evil-4-what-it-took-to-bring-capcoms-classic-to-oculus-quest-2/)
- [UploadVR — Firewall Ultra Will Add 'Ultra Mode' Post-Launch With Manual Reloads](https://www.uploadvr.com/firewall-ultra-manual-reloading-update/)
- [Steam — Pavlov VR, GRIP TOGGLE (pedido da comunidade)](https://steamcommunity.com/app/555160/discussions/0/2828702373010608612/)

**Deste repositório (não são fonte externa; são o estado do produto)**
- `docs/vr/referencia-arma-mira.md` — `gripSpace` × `targetRaySpace`, red dot
  colimado, o 45,4° medido do `gripOffsetMatrix`
- `docs/vr/criterio-aaa.md` — categoria B (B1–B7). **Não editado por esta
  pesquisa.**
- `js/xr/xrweapon.js`, `js/xr/xrinput.js`, `js/xr/xrinteract.js`,
  `js/xr/xrhaptics.js`, `js/fpbody.js`, `game.js`
