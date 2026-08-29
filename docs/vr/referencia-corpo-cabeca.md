# Cabeça, corpo e analógico — quem vira o personagem em VR

Pesquisa de referência aberta pelo pedido do dono do projeto, **verbatim**:

> "o botao de virar o personagem nao se faz necessario, pois ao movimentar a
> cabeça o corpo deveria acompanhar, eu ja consigo olhar ao redor sem enjoo ver
> os lados, o problema eh q o boneco esta travado e precisa virar ele com a
> alavanca manual, acho q a alavanca poderia mover ele pra frente pra tras e
> pros lados, nao virar, talvez a outra alavanca do lado esquerdo ficasse com
> essa funcao, agora esse movimento precisa parecer natural"

Traduzido em requisito, sem inventar o que ele não disse:

| # | Requisito | Situação (medida no código, ver §4.0) |
|---|---|---|
| a | O giro artificial deixa de ser **a forma** de virar o personagem | parcialmente já é assim |
| b | A orientação do CORPO acompanha para onde a cabeça olha | **já acontece** em três lugares; a §4.0 mostra onde |
| c | O analógico translada (frente/trás/lados) | já translada — mas em **oito direções e uma velocidade só** |
| d | O resultado precisa parecer NATURAL | **é aqui que está o defeito medível** |

**Este documento não edita `docs/vr/criterio-aaa.md` (a régua), nem
`referencia-locomocao.md`, nem `referencia-corpo.md`.** Onde o assunto já está
coberto por eles, este aponta em vez de repetir. Onde diverge, diz que diverge.

Regra da casa que vale aqui: **afirmação sem citação literal não entra como
fato.** O que não tem fonte está na §3, marcado.

---

## 1. O que a plataforma manda

### 1.1 Em VR de verdade, o que orienta o corpo do avatar?

**A resposta dos dois kits de referência é a mesma, e é literal no código deles:
o corpo aponta para onde a CABEÇA olha, projetado no plano do chão.**

#### Godot XR Tools — o corpo é reorientado TODO FRAME, sem zona morta

`XRToolsPlayerBody` recoloca o corpo debaixo da câmera a cada frame de física e
o faz olhar para a frente estimada:

```gdscript
	# The camera/eyes are towards the front of the body, so move the body back slightly
	var forward_dir := _estimate_body_forward_dir()
	if forward_dir.length() > 0.01:
		target_transform = target_transform.looking_at(target_transform.origin + forward_dir, up_player)
		target_transform.origin -= forward_dir.normalized() * eye_forward_offset * adj_player_radius
```

E a estimativa da frente é a da cabeça, com tratamento do zênite/nadir e uma
mistura opcional com a direção das mãos:

```gdscript
# Estimate body forward direction
func _estimate_body_forward_dir() -> Vector3:
	var camera_elevation := camera_forward.dot(up_player)
	if camera_elevation > 0.75:
		# User is looking up
		forward = -camera_basis.y.slide(up_player).normalized()
	elif camera_elevation < -0.75:
		# User is looking down
		forward = camera_basis.y.slide(up_player).normalized()
	else:
		forward = camera_forward.slide(up_player).normalized()
	...
		# Rotate our forward towards our hand direction but not more than 60 degrees
		var angle = clamp(acos(dot) * body_forward_mix, 0.0, 0.33 * PI)
		forward = forward.rotated(cross, angle)
```

com os padrões declarados no mesmo arquivo:

```gdscript
## Eyes forward offset from center of body in player_radius units
@export_range(0.0, 1.0) var eye_forward_offset : float = 0.5

## Mix factor for body orientation
@export_range(0.0, 1.0) var body_forward_mix : float = 0.75
```

— [`addons/godot-xr-tools/player/player_body.gd`](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/player/player_body.gd)

**Leitura, e é o achado central desta pesquisa:** no kit de locomoção mais usado
do Godot **não existe zona morta de guinada e não existe constante de tempo**
para o corpo seguir a cabeça. O corpo é reposicionado e reorientado toda
iteração de física, colado no olhar. O único "atraso" é geométrico
(`eye_forward_offset`, o corpo fica meio raio atrás dos olhos) e a única folga
angular é a que a MÃO introduz, limitada a **60°** (`0.33 * PI`).

A documentação do mesmo nó publica isso como propriedade de usuário:
`Body Forward Mix` — *"Mix factor for body orientation"* —
[Player Body](https://godotvr.github.io/godot-xr-tools/docs/player_body/).

#### VRIK (Final IK) — a folga existe, mas ela é da MALHA, não do personagem

O `VRIK` foi escrito para *Dead and Buried*, da Oculus Studios, e é a referência
de fato quando existe corpo visível. Ele separa três coisas que este projeto
precisa não confundir:

> "VRIK.solver.spine.bodyRotStiffness - determines how much the body will follow
> the rotation of the head."
> "VRIK.solver.spine.neckStiffness - determines how much the chest will rotate to
> the rotation of the head."
> "VRIK.solver.spine.maxRootAngle - will automatically rotate the root of the
> character if the head target has turned past this angle."
> "VRIK.solver.spine.rootHeadingOffset - angular offset for root heading. Adjust
> this value to turn the root relative to the HMD around the vertical axis.
> Usefulf for fighting or shooting games where you would sometimes want the
> avatar to stand at an angled stance."

— [RootMotion, Final IK — VRIK](http://www.root-motion.com/finalikdox/html/page16.html)
(o default `maxRootAngle = 25°` já está registrado em
`docs/vr/referencia-locomocao.md` §3.2; não repito a tabela aqui)

**A distinção que decide o projeto:** `maxRootAngle` é a folga de **pescoço da
MALHA** — ela existe para o tronco não colar na cabeça e torcer o ombro. Ela
**não** é a orientação do personagem no jogo; essa, no Godot XR Tools, é o olhar
direto, sem folga. São dois "corpos" diferentes, e o pedido do dono fala do
segundo.

#### O terceiro corpo: o que os outros jogadores veem

Sem fonte externa nova; a régua deste projeto já cobra isso em **C6 · O avatar
que os OUTROS veem bate com o headset**, com teto de **0,05 m e 5°**
(`docs/vr/criterio-aaa.md`). Fica registrado aqui só para a §4 poder tratar os
três corpos separadamente.

---

### 1.2 Referencial da locomoção por analógico: cabeça, mão ou corpo?

**Existe diretriz oficial, e ela é dupla: a Meta define QUATRO mapeamentos e
manda deixar o jogador escolher — mas o SDK WebXR que ela mesma publica nasce em
cabeça e recomenda cabeça.**

#### A diretriz de design — quatro opções, sem vencedor

> **Head-relative:** "Movement is based on the direction the user's head is
> facing. The input 'forward' will cause movement in the direction the head
> points, and turning the head changes the movement direction accordingly."
>
> **Initial head-relative:** "The movement starts in the direction in which the
> head is facing when the 'forwards' input is triggered. Turning the head after
> this won't alter the movement direction."
>
> **Hand-relative:** "Movement follows the direction the hand/controller is
> pointing, regardless of head orientation. This method allows steering by
> moving the hand/controllers."
>
> **Initial hand-relative:** "Similar to hand-relative, but the movement
> direction is fixed at the initial point of movement and doesn't change even if
> the hand/controller is turned afterwards."
>
> "**There is no definitive answer, as it depends on user preference. Therefore,
> it's crucial to allow users to choose their preferred mapping style** for
> comfort and to prevent motion sickness."

— Meta, [Locomotion user preferences](https://developers.meta.com/horizon/design/locomotion-user-preferences/)

Note o que a definição de **head-relative** custa e o que **hand-relative**
compra, nas palavras da própria página: com cabeça, *"turning the head changes
the movement direction accordingly"* — ou seja, **não dá para olhar para o lado
enquanto anda em linha reta**; com mão, *"regardless of head orientation"* — dá.
É exatamente o problema de FPS que o briefing levantou, e a fonte o descreve nos
dois sentidos sem eleger um.

#### A implementação de referência da Meta para ESTE stack (WebXR + three.js)

O **Immersive Web SDK** é o framework WebXR que a Meta publica, e ele roda sobre
three.js — é o vizinho mais próximo que este porte tem. O que ele faz:

> "Slide provides continuous locomotion driven by the `locomotion.move` action.
> **Motion is computed relative to the headset in XR** or `world.camera` outside
> XR, preserving orientation while keeping vertical motion under engine control
> (gravity, steps, slopes)."
>
> "The bound input produces a 2D vector (x, y). **IWSDK rotates this by the
> movement reference orientation** to get a world-space direction."
>
> Best practices: "**Use viewer-relative direction; avoid rotating input by
> controller grip to reduce unintended strafing.**"

— [`docs/concepts/locomotion/slide.md`](https://github.com/facebook/immersive-web-sdk/blob/main/docs/concepts/locomotion/slide.md)

E o código, que é mais literal ainda:

```ts
/**
 * Analog stick sliding locomotion with optional comfort vignette and jump.
 *
 * @remarks
 * - Reads left controller thumbstick for planar movement relative to head yaw.
 */
```
```ts
  getMovementReferenceQuaternion(out: Quaternion): Quaternion {
    if (this.world.session) {
      this.world.player.head.getWorldQuaternion(out);
    } else {
      this.world.camera.getWorldQuaternion(out);
    }
    return out;
  }
```
— [`packages/core/src/locomotion/slide.ts`](https://github.com/facebook/immersive-web-sdk/blob/main/packages/core/src/locomotion/slide.ts)
· [`locomotion-input-provider.ts`](https://github.com/facebook/immersive-web-sdk/blob/main/packages/core/src/locomotion/locomotion-input-provider.ts)

`player.head.getWorldQuaternion()` **é linha por linha o `vistaMundo()` deste
projeto** (`game.js:1719`). O SDK da Meta e este jogo já concordam.

#### Unity XRI — mesmo padrão, com o desvio nomeado

> "The **Forward Source** can be used to define which direction the XR Origin
> should move when, for example, pushing forward on a thumbstick. **By default,
> it will use the Camera Object, meaning the user will move forward in the
> direction they are facing.**"
>
> "An example of how this property can be used is to set it to a Transform that
> tracks the pose of a motion controller to allow the user to move forward in
> the direction they are holding the controller."

— Unity, [Continuous movement, XR Interaction Toolkit 3.0](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/continuous-movement.html)
· API: `forwardSource` — *"The source Transform that defines the forward
direction."*
([ContinuousMoveProvider](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/api/UnityEngine.XR.Interaction.Toolkit.Locomotion.Movement.ContinuousMoveProvider.html))

#### Godot XR Tools — cabeça, e o motivo escrito

> "The main issue with direct movement is that it can easily result in dizzyness
> on the part of the player. **Especially rotating the player leads to many
> players getting nauseated.** We combat this in three ways:
> - **direction of movement is always in relation to the direction the player is
>   looking.**"

— [wiki oficial, DirectMovement](https://github.com/GodotVR/godot-xr-tools/wiki/DirectMovement)

E no código, o vetor do analógico é aplicado na base da CÂMERA, achatada pela
gravidade:

```gdscript
		var camera_transform := camera_node.global_transform
		var dir_forward := camera_transform.basis.z.slide(up_gravity).normalized()
		var dir_right := camera_transform.basis.x.slide(up_gravity).normalized()
		control_velocity = (
				dir_forward * -ground_control_velocity.y +
				dir_right * ground_control_velocity.x
		) * XRServer.world_scale
```
— [`player_body.gd`, `_apply_velocity_and_control`](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/player/player_body.gd)

**Veredito da §1.2:** o padrão de fato é **head-relative**, e é o que este jogo
já faz. `hand-relative` existe, é oferecido por jogos do gênero, e a Meta manda
oferecer como escolha — mas **como opção, não como troca de padrão**.

---

### 1.3 Dá para largar o giro artificial por completo?

**Não. Ele tem de continuar existindo — e a fonte é requisito de loja, não
opinião de conforto. Mas nada nas fontes diz que ele precisa ser o jeito
PRINCIPAL de virar; o que dizem é o contrário.**

#### É requisito de publicação (obrigatório)

> "When configuring the submission metadata for your app, it must meet the
> requirements for either sitting, standing, or roomscale play modes."
>
> Sitting: "**no action requires you to stand or reach down to the ground or
> pivot greater than 90 degrees left or right.**"
>
> Standing: "You are able to interact with all game elements while standing,
> turning around, or reaching."

— Meta, [VRC.Quest.Tracking.1](https://developers.meta.com/horizon/resources/vrc-quest-tracking-1/) (obrigatório)

Um battle royale sem giro artificial exige pivotar 360° para conferir o próprio
flanco. Isso é incompatível com o modo **sentado**, que é o único em que o Quest
3 é jogado numa cadeira fixa, preso a um cabo ou numa mesa.

#### É recomendação de acessibilidade (a Meta nomeia o público)

> "**When a user is standing, they will most likely turn physically.** However,
> this feature is particularly beneficial for users who are **seated in
> non-rotating chairs, use wheelchairs, are tethered to a PC, or simply prefer
> not to physically turn around.**"

— Meta, [Locomotion user preferences](https://developers.meta.com/horizon/design/locomotion-user-preferences/)

Repare na primeira metade: **a Meta assume que quem está em pé vira o corpo.**
O giro artificial é a assistência, não o mecanismo primário. Isso é literalmente
o que o dono pediu.

#### É requisito de acessibilidade do W3C

> **REQ 2a:** "Allow the user performing an action in the environment, in a
> device independent way, **without having to do so physically**."
>
> "VR Headsets need the user to be a physical position to play. **The user should
> not have to be in a particular physical position such as standing or sitting**
> to play a game or perform some action."
>
> **REQ 13a:** "Ensure the user can **reset and calibrate their orientation/view
> in a device independent way**."

— W3C, [XR Accessibility User Requirements](https://www.w3.org/TR/xaur/) (Nota do
Grupo de Trabalho, 2021)

#### O precedente do gênero: vira OPÇÃO, não some

Half-Life: Alyx, Update 1.1 — *"Added option to disable controller turning"* —
já registrado com link em `docs/vr/referencia-locomocao.md` §1.2. Ou seja: quem
joga em pé, com espaço, **desliga**; o desenvolvedor não remove.

**Veredito da §1.3, e é a resposta exata que o briefing pediu:** *tem de
continuar existindo, mas não pode ser o jeito principal de virar* — com lastro
em VRC.Quest.Tracking.1 (obrigatório), na página de preferências da Meta, no
XAUR do W3C e no precedente de Alyx.

---

### 1.4 Naturalidade da translação

#### Aceleração — as fontes convergem, e o assunto já está fechado aqui

Já levantado com verbatim e link em `docs/vr/referencia-locomocao.md` §5.1
("quantized velocity", "keep acceleration events brief and infrequent",
"limit acceleration duration and frequency"), e já implementado
(`ACEL_XR_SOLO = 60`, t95 ≈ 50 ms, `js/xr/xrlocomotion.js`). **Não repito e não
contradigo.**

#### Velocidade humana e teto de escorregamento

> "Set avatar walking and running speeds to match real-world rates (walking
> ~3 mph/1.4 m/s, running ~6 mph/2.8 m/s) to avoid excessive optic flow."

— Meta, [Locomotion comfort and usability](https://developers.meta.com/horizon/design/locomotion-comfort-usability/)

> "Keep `maxSpeed` reasonable (**4–6 m/s**) to minimize discomfort."

— Meta, [IWSDK, slide.md](https://github.com/facebook/immersive-web-sdk/blob/main/docs/concepts/locomotion/slide.md)
(default do código: `maxSpeed: { type: Types.Float32, default: 5 }`)

#### Zona morta — os dois kits DESCONTAM, não cortam, e usam valores diferentes por eixo

```gdscript
## Y-axis deadzone for controller joysticks
@export var y_axis_dead_zone := 0.1

## X-axis deadzone for controller joysticks
@export var x_axis_dead_zone := 0.2
```
```gdscript
	if abs(original_vector.y) > y_axis_dead_zone:
		vector.y = remap(abs(original_vector.y), y_axis_dead_zone, 1, 0, 1)
```
— [`user_settings.gd`](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/user_settings/user_settings.gd)

O `remap` é o mesmo `semZonaMorta()` de `js/xr/xrinput.js`: **0 no limiar, 1 no
batente.** A técnica deste projeto está certa. O valor (0,18 nos dois eixos) fica
entre o 0,1 e o 0,2 da referência.

#### A magnitude do analógico VIRA velocidade — nos dois kits, no código

```ts
        this.movementVector
          .normalize()
          .multiplyScalar(inputValue * (this.config.maxSpeed.value as number));
```
— Meta, [IWSDK `slide.ts`](https://github.com/facebook/immersive-web-sdk/blob/main/packages/core/src/locomotion/slide.ts)

```gdscript
	player_body.ground_control_velocity.y += dz_input_action.y * max_speed
	if strafe:
		player_body.ground_control_velocity.x += dz_input_action.x * max_speed
```
— [`movement_direct.gd`](https://github.com/GodotVR/godot-xr-tools/blob/master/addons/godot-xr-tools/functions/movement_direct.gd)

**E aqui há uma tensão real que este documento não vai esconder:** a página de
design da Meta recomenda **velocidade quantizada** — *"setting fixed movement
speeds (for example, stopped, walking, running) and switching between them
instantly"* — enquanto o **código do SDK da própria Meta** multiplica a
magnitude analógica pela velocidade máxima, o que dá um contínuo. As duas coisas
convivem porque tratam de coisas diferentes: a recomendação é sobre a
ACELERAÇÃO entre patamares (que deve ser instantânea); o código é sobre o
patamar ALVO (que é analógico). Uma implementação pode ter as duas: alvo
analógico + rampa de 50 ms até ele. É o que a §4 recomenda.

#### Strafe

Godot XR Tools nasce **sem** strafe: `@export var strafe := false`, e a
descrição é *"Enables left/right control of strafing"*
([Direct Movement](https://godotvr.github.io/godot-xr-tools/docs/direct/)). O
IWSDK nasce **com** (o vetor é 2D e o eixo x entra na conta). Battle royale
precisa de strafe; a referência aqui é o IWSDK, e é a que o jogo já segue.

---

### 1.5 Mapeamento de botão

**O padrão de fato é explícito e escrito: esquerda anda, direita gira.**

> "the **left thumbstick for movement and right for view direction control**."
>
> "**Move the thumbstick in any direction to move in that direction.**"
>
> "Users can turn by pushing the thumbstick sideways, based on their preference
> they either snap or smooth turn."

— Meta, [Locomotion input maps](https://developers.meta.com/horizon/design/locomotion-input-maps/)

No SDK WebXR da Meta é o mesmo, em código: *"Reads **left** controller thumbstick
for planar movement"* (`slide.ts`) e o `TurnSystem` lê o direito
([Locomotion Turn](https://developers.meta.com/horizon/documentation/web/iwsdk-concept-locomotion-turn/),
`turningMethod: TurningMethod.SnapTurn`, *"Best default for comfort."*).

**A favor de PERMITIR a troca** (que é o que o dono sugeriu) existe fonte, e ela
é explícita:

> "Note that **we recommend adding the ability to your game for the user to
> select whether the left hand or right hand controller is used**. You can simple
> re-parent the direct movement function to the correct controller."

— Godot XR Tools, [wiki DirectMovement](https://github.com/GodotVR/godot-xr-tools/wiki/DirectMovement)

E Pavlov VR expõe isso como opção de jogador (`Swap Locomotion Hand`,
`Input Vector: head / dominant / non-dominant hand`) — **fonte não verificada**,
ver §3.

**Contra INVERTER O PADRÃO** (não contra oferecer a opção) há, além da diretriz
da Meta, três colisões medidas dentro deste repo e escritas em
`js/xr/xrinput.js`:

1. o **clique do analógico direito já é a PAUSA** (`BOTAO_MENU = 3`,
   `js/xr/xrui.js`), que a loja exige;
2. **empurrar o analógico direito para o lado dispara o giro em passos** — um
   radial ali giraria a vista 45° ao abrir;
3. o **radial dos quatro verbos** (granada, kit, comer, mira) mora no gatilho +
   analógico ESQUERDOS, e `correr` mora no batente do analógico esquerdo.

Trocar só os eixos, sem o resto, quebra os três. Trocar o pacote inteiro é
possível — e é isso que "opção" significa aqui.

---

## 2. Como os jogos do gênero resolvem

| Jogo / kit | Referencial da locomoção | Como o corpo vira | Giro artificial existe? |
|---|---|---|---|
| **Immersive Web SDK** (Meta, WebXR+three.js) | **cabeça** — `player.head.getWorldQuaternion()`; *"relative to head yaw"* | não há corpo no SDK; o rig é o corpo, e ele não gira com a cabeça | **sim**, analógico direito, `SnapTurn` por padrão ("Best default for comfort") |
| **Unity XR Interaction Toolkit** | **cabeça** por padrão (`forwardSource` vazio ⇒ Camera Object); mão é desvio documentado | idem — não há corpo no toolkit | sim (`SnapTurnProvider` 45°, `ContinuousTurnProvider` 60 °/s) |
| **Godot XR Tools** | **cabeça** — base da câmera achatada pela gravidade; *"always in relation to the direction the player is looking"* | **cola no olhar, todo frame, sem zona morta**; mistura opcional com as mãos, teto de 60° (`body_forward_mix = 0.75`) | sim (`movement_turn.gd`), e recomenda deixar escolher a mão |
| **VRIK / Final IK** (*Dead and Buried*, Oculus Studios) | — (não é kit de locomoção) | tronco segue POSIÇÃO com força e ROTAÇÃO quase nada; a raiz só vira passado `maxRootAngle` (**25°**); `rootHeadingOffset` para postura angulada de tiro | — |
| **Half-Life: Alyx** | **as duas**, como escolha do jogador: `Continuous` (cabeça) e `Continuous Hand` (mão) — texto do menu **não verificado**, ver §3 | **não tem corpo** (só mãos) — decisão declarada da Valve, já citada em `referencia-corpo.md` §2.1 | sim; e o Update 1.1 adicionou *"option to disable controller turning"* |
| **Onward** | **as duas** — nasceu mão (`off-hand`), ganhou modo cabeça por hotfix | corpo presente, altura do headset é entrada de gameplay | sim, e some no modo de sala (`Front Facing`) — ver `referencia-locomocao.md` §1.2 |
| **Pavlov VR** | `Input Vector: head / dominant / non-dominant` — **não verificado**, ver §3 | — | sim (`Artificial Turn` + `Smooth Turn`, 45–360 °/s) |
| **Population: ONE** | não encontrado | corpo presente; patches corrigiram âncora no centro da cabeça e altura do olho | sim (`Turning Style`, `Ease In`, `Degrees Per Second`) |

**O que a tabela mostra e vale mais que qualquer linha isolada:** nenhum kit e
nenhum jogo do gênero **removeu** o giro artificial. Todos o rebaixaram a
opção — e todos, sem exceção, tiram a direção de andar da **cabeça** por padrão.

---

## 3. O QUE NÃO FOI ENCONTRADO

Seção obrigatória. O que está aqui **não** pode ser usado como fonte, e decisão
apoiada nisso entra marcada como *escolha de ergonomia sem fonte*.

1. **Texto literal do menu de Half-Life: Alyx** para `Continuous` vs
   `Continuous Hand`. A página de acessibilidade da GameSpot (a fonte que
   `referencia-locomocao.md` já cita) devolveu **HTTP 403** nesta rodada, e o
   `web.archive.org` está bloqueado para a ferramenta de busca deste ambiente. O
   conteúdo aparece em resumo de busca, mas **resumo de busca não é citação**.
   O que a §2 afirma sobre Alyx no eixo cabeça/mão é, portanto, **não
   verificado**.
2. **`Input Vector` e `Swap Locomotion Hand` do Pavlov.** A wiki oficial
   (`wiki.pavlov-vr.com`) devolveu **"Database error — Cannot access the
   database"** nas duas tentativas, e o domínio alternativo citado em
   `referencia-locomocao.md` não foi reconferido. **Não verificado.**
3. **Menu de Population: ONE.** `population-one-vr.fandom.com` devolveu **HTTP
   402**. Os itens da §2 vêm de `referencia-locomocao.md` §1.2, que os coletou
   numa rodada anterior; **não reconferidos nesta**.
4. **Nenhum número oficial para "zona morta de guinada do corpo".** Nenhuma
   documentação de plataforma (Meta, Unity, Unreal, W3C, MDN) define quantos
   graus a cabeça pode girar antes de o CORPO acompanhar. Os dois números que
   existem no mercado são de kit de terceiro: `maxRootAngle = 25°` (VRIK,
   malha) e **zero** (Godot XR Tools, corpo de física). **Qualquer valor
   escolhido aqui é escolha de ergonomia com lastro parcial.**
5. **Nenhuma evidência de que cabeça enjoe menos que mão.** A literatura
   comparou os dois e não elegeu vencedor; o que os estudos encontram com
   consistência é que **os dois** enjoam mais que teletransporte
   ([Clifton & Palmisano, *Virtual Reality*, 2019](https://link.springer.com/article/10.1007/s10055-019-00407-8)).
   A própria Meta escreve *"There is no definitive answer"*. **A escolha do
   padrão head-relative aqui se apoia em CONVENÇÃO DE PLATAFORMA, não em
   evidência de conforto.**
6. **Nenhuma diretriz oficial sobre inverter os analógicos.** Nada na Meta, na
   Unity ou no W3C diz o que acontece com conforto ou acessibilidade se
   locomoção for para o polegar direito. O único lastro a favor de oferecer a
   troca é a recomendação do Godot XR Tools (§1.5), e ela fala de **oferecer a
   escolha**, não de trocar o padrão. **Inverter o padrão seria escolha sem
   fonte.**
7. **Ângulo confortável de guinada de cabeça: fonte fraca.** Os números que
   circulam (30° confortável / 55° máximo) vêm da apresentação de Alex Chu
   (Samsung) *"VR Design: Transitioning from a 2D to a 3D Design Paradigm"*, que
   só foi encontrada em **citação de terceiro**
   ([dummies.com](https://www.dummies.com/article/technology/programming-web-design/general-programming-web-design/virtual-reality-design-principles-starting-up-user-attention-and-comfort-zones-256440/)),
   não no material original. Amplitude anatômica de rotação cervical (~80–90°
   por lado) tem literatura, mas **conforto sustentado não é amplitude
   máxima**. Tratar como **indicativo**, não como número de projeto.
8. **Nada sobre vantagem competitiva de girar a cabeça em multiplayer.** Não
   achei uma linha, em fonte primária ou secundária, sobre o avatar remoto
   acompanhar o HMD criar ou remover vantagem de espiada. O teto de 5° de C6 é
   decisão deste projeto, não de fonte.

---

## 4. Recomendação para ESTE jogo

### 4.0 Antes da recomendação: metade do pedido JÁ ESTÁ FEITA — e refutar vale

**Refutação medida, com arquivo e linha.** O pedido "ao movimentar a cabeça o
corpo deveria acompanhar" já vale em **três** dos quatro corpos deste jogo:

| O que acompanha a cabeça hoje | Onde | Como |
|---|---|---|
| **A direção de andar** | `game.js:1748`, dentro de `playerUpdate` | `vistaMundo()` → base do vetor `fwd/str`. É head-relative, idêntico ao IWSDK |
| **O `rotY` mandado ao servidor** (o avatar que os outros veem) | `br-game.js:1902` | `G.yawDaVista()` |
| **O minimapa** | `game.js:3251` | `vistaMundo()` |
| **O corpo em primeira pessoa** | `js/xr/xrbody.js`, `update()` | quadril segue com folga de 25° (`PESCOCO`) e k = 8 |

Ou seja: **virar a cabeça já vira o personagem para o jogo, para o servidor e
para os outros jogadores.** O "boneco travado" não é o vetor de andar.

**O defeito que sobra é o (d) — "esse movimento precisa parecer natural" — e ele
é medível.** Em XR o analógico esquerdo é convertido em **quatro booleanos**:

```js
      teclaXR('KeyW', cmd.andar.y > 0.15);
      teclaXR('KeyS', cmd.andar.y < -0.15);
      teclaXR('KeyD', cmd.andar.x > 0.15);
      teclaXR('KeyA', cmd.andar.x < -0.15);
```
— `game.js:3657–3660`

Três consequências, todas com número:

1. **Oito direções.** `_v3` sai de `fwd/str` inteiros: frente, trás, lados e
   quatro diagonais exatas de 45°. Empurrar o polegar a 20° do eixo dá 0° ou 45°,
   nunca 20°.
2. **Uma velocidade só.** Toda a curva analógica calculada com cuidado em
   `js/xr/xrinput.js` (`semZonaMorta`, `ANDAR_CHEIO`, o fator `k`) é **jogada
   fora** no limiar booleano. Ou parado, ou `XRAndar.andar` inteiro.
3. **Zona morta efetiva de ≈ 0,28, não 0,18.** O limiar de 0,15 é aplicado
   DEPOIS do desconto de `DEADZONE = 0,18` e do ganho `k ≈ 1,22`: resolvendo,
   o analógico só produz movimento acima de **≈ 0,28 de inclinada crua** — 56 %
   acima da zona morta declarada.

E a comparação que fecha o caso: **o CELULAR deste mesmo jogo tem locomoção mais
fina que o headset.** O canal de toque entrega vetor analógico —
`if (tMove.active) { fwd += tMove.y; str += tMove.x; }` (`game.js:1732`) —
enquanto o headset entrega quatro liga/desliga.

### 4.1 As seis recomendações, concretas o bastante para virar tarefa

#### R1 · O analógico esquerdo continua sendo o de ANDAR. Não inverter.

Lastro: Meta *Locomotion input maps* (*"the left thumbstick for movement and
right for view direction control"*), IWSDK (`slide.ts` lê o esquerdo, `turn.ts`
o direito), e as três colisões medidas de `js/xr/xrinput.js` (§1.5).

**O que fazer com o pedido do dono:** oferecer a troca como **preferência do
jogador** (`callofai_vr.maoLocomocao: 'esquerda' | 'direita'`), com lastro em
Godot XR Tools (*"we recommend adding the ability to your game for the user to
select whether the left hand or right hand controller is used"*). A troca move o
**pacote inteiro**: andar + correr(batente) + agachar(clique) + radial(gatilho)
vão juntos para a outra mão, e giro + tiro + mira + pular + pausa vêm para cá.
Trocar só os eixos quebra pausa, radial e giro — está medido e escrito em
`js/xr/xrinput.js`.

**Padrão continua `esquerda`.** Inverter o padrão seria escolha sem fonte (§3.6).

#### R2 · A translação vira ANALÓGICA. É o conserto do "parecer natural".

Substituir os quatro `teclaXR` de direção por um canal analógico — **o mesmo que
o toque já usa**, sem física nova:

```js
// game.js, playerUpdate — o canal do toque já existe; some o do headset
const xrMove = XR.andarAnalogico();          // { x, y, active } — 0 fora da sessão
if (xrMove.active) { fwd += xrMove.y; str += xrMove.x; }
```

e em `game.js`, no bloco `if (xrOn)`, parar de escrever `KeyW/KeyA/KeyS/KeyD` e
publicar `cmd.andar` nesse canal. **`cmd.andar` já sai pronto de
`js/xr/xrinput.js`** — a curva, a zona morta descontada, o `ANDAR_CHEIO` e o
fator `k` estão todos lá e hoje são descartados.

Números que passam a valer:
- **zona morta efetiva 0,18** (a declarada), contra ≈ 0,28 hoje;
- **direção contínua**, contra 8 setores;
- **velocidade proporcional** de 0 a `XRAndar.andar`, e `XRAndar.correr` no
  batente (`CORRER_TILT = 0,92`), que já existe;
- **rampa inalterada:** `ACEL_XR_SOLO = 60` → t95 ≈ 50 ms. É a combinação que a
  §1.4 defende: alvo analógico (o que os dois kits fazem em código) + aceleração
  curta (o que a Meta recomenda em design).

**O que NÃO fazer:** não mexer em `WALK_SPEED`/`RUN_SPEED` nem nos perfis de
`js/xr/xrlocomotion.js`. Este item é de FORMA do vetor, não de magnitude, e a
magnitude já tem A3/A4 e uma pesquisa própria.

#### R3 · O referencial de andar continua sendo a CABEÇA (`vistaMundo()`).

Nenhuma mudança. É o padrão do IWSDK, do Unity XRI e do Godot XR Tools, e é o
que o código já faz. **Não trocar por mão** — a Meta escreve *"There is no
definitive answer"* e a literatura não elege vencedor (§3.5).

**Adicionar como OPÇÃO** (`callofai_vr.referencial: 'cabeca' | 'mao'`), porque
a mesma página da Meta manda deixar escolher: *"it's crucial to allow users to
choose their preferred mapping style"*. Com `'mao'`, a base do vetor passa a ser
a guinada de mundo do **punho da mão que anda** (`XR.punho(mao)`), projetada em
XZ — nunca `camera.quaternion` cru, que em XR é pose relativa ao rig.
Prioridade baixa: é conforto de um perfil de jogador que este porte ainda não
tem evidência de ter.

#### R4 · Os três corpos ficam separados, com constantes diferentes e declaradas.

| Corpo | Segue a cabeça com | Valor | Por quê |
|---|---|---|---|
| **Heading de jogo** (vetor de andar, colisor, `rotY` do servidor, minimapa) | **zero folga, zero suavização** | — | é o que Godot XR Tools faz (`looking_at` todo frame); e qualquer atraso aqui é diferença entre o que o jogador vê e o que o inimigo vê |
| **Corpo em 1ª pessoa** (`js/xr/xrbody.js`) | folga `PESCOCO` + convergência `QUADRIL` | **25°**, k = 8 (t63 = 125 ms, t95 = 375 ms) | `maxRootAngle` do VRIK; a folga existe para o ombro não torcer junto com o olhar |
| **Avatar remoto** (o que os outros veem) | segue `rotY`, sem folga | teto de **5°** | C6 da régua |

**Nada a mudar por padrão.** Se o dono reclamar de "o corpo demora a virar", o
botão é `PESCOCO` e ele tem faixa com fonte: **0°** (Godot XR Tools, corpo colado
no olhar) a **25°** (VRIK). O meio-termo com lastro indicativo é ~30°
confortável de guinada de cabeça (Chu, §3.7) — mas isso é **indicativo**, e
mexer nele é escolha de ergonomia com lastro parcial, que tem de entrar marcada
como tal.

#### R5 · O giro artificial FICA, e ganha um terceiro modo: `desligado`.

Não pode ser removido — VRC.Quest.Tracking.1 (obrigatório), a página de
preferências da Meta e o XAUR do W3C são explícitos (§1.3). O que muda:

- `js/xr/xrturn.js` passa a aceitar `modo: 'suave' | 'passos' | 'desligado'`.
  Em `'desligado'`, `atualizar()` devolve `{ delta: 0, passo: false,
  velocidade: 0, girando: false }` e o eixo direito não move o rig.
- **Continua no analógico DIREITO.** Precedente: Alyx não moveu o giro de botão,
  ofereceu desligar (*"Added option to disable controller turning"*).
- **Padrão continua ligado** (`'suave'`, 180 °/s — a decisão já registrada em
  `referencia-locomocao.md` §1.7). Quem joga em pé com espaço desliga em um
  toque, no painel que A2 já exige.

Isso entrega exatamente o pedido — *"o botão de virar não se faz necessário"* —
sem quebrar o requisito de loja e sem tirar o recurso de quem joga sentado.

#### R6 · Nada disso pode mexer no `rotY` nem no que os outros veem.

`rotY` continua sendo `G.yawDaVista()` (`br-game.js:1902`) — **não** o corpo
suavizado de `XR.corpo.guinada`, e **não** `camera.quaternion`. Consequência
concreta a preservar: quem está de headset e vira só a cabeça **já** aparece
virado para os outros, sem atraso. Se alguém trocar essa fonte pelo corpo
suavizado, o avatar remoto passa a mentir por até 375 ms — e o anti-cheat de
teleporte do servidor não pega isso, porque ele olha posição, não guinada.

---

## 5. Como MEDIR cada item no kit emulado (IWER)

Instrumentos que já existem: `window.__A.stick(mao, x, y)`,
`window.__A.botao(mao, id, v)`, `window.__A.solta()`, `window.__A.espera(ms)`
(`test/helpers/iwer.js`) e `window.__xrEmulado.position` / `.quaternion` para a
pose da cabeça (usado em `test/xr-cabeca.test.js:256` e
`test/xr-corpo-ancora.test.js:136`).

**Regra que vale para as seis medidas abaixo, e é a defesa contra as nove
famílias de "teste que passa por acidente":** a régua é sempre
`window.__xrEmulado` (o DISPOSITIVO, que o jogo não escreve) e a leitura é
sempre `player.vel` / `XR.rig.rotation.y` / `XR.corpo.guinada` (o PRODUTO).
Entrada e saída nunca saem do mesmo cálculo.

### M1 · A translação é analógica (R2)

- **Grandeza:** `|player.vel|` em m/s, no regime permanente.
- **Instante:** depois de `5/ACEL_XR_SOLO` ≈ 84 ms de analógico parado no valor;
  amostrar em 600 ms para folga.
- **Como:** `__A.stick('left', 0, -y)` para
  `y ∈ {0,20 · 0,30 · 0,45 · 0,60 · 0,80 · 0,90}` — seis pontos que **atravessam
  a zona morta (0,18) e param antes do batente de corrida (0,92)**.
- **Aprova:** a série é **estritamente crescente** e tem **≥ 5 valores distintos**
  separados por > 0,05 m/s; e `y = 0,20` já produz `|vel| > 0`.
- **Defeito reinjetado que fica VERMELHO:** devolver os quatro `teclaXR`
  booleanos. A série colapsa em `{0, 0, andar, andar, andar, andar}` — 2 valores
  distintos contra 5, e `y = 0,20` dá 0,000 m/s. O teste imprime os seis números.
- **Por que não é acidente:** não é a família 1 (a asserção é uma
  desigualdade entre seis medidas independentes, e o produto atual a reprova);
  não é a 3 (mede a MAGNITUDE, que é exatamente o eixo onde o defeito mora — o
  eixo direção continua certo hoje e por isso não denunciaria nada); não é a 4
  (o teste empurra o analógico e espera frames reais da sessão, não chama
  `tick`); não é a 6 (o único outro guarda no caminho é a zona morta, e cinco
  dos seis pontos estão acima dela); não é a 7 (não há `||`); não é a 9 (os
  pontos foram escolhidos para cercar os dois limiares).

### M2 · A zona morta é 0,18 e não 0,28 (R2)

- **Grandeza:** `|player.vel|` após 1,0 s.
- **Como:** `__A.stick('left', 0, -y)` para `y ∈ {0,10 · 0,17 · 0,19 · 0,25}`.
- **Aprova:** 0,000 m/s em 0,10 e 0,17; **> 0** em 0,19 e 0,25.
- **Reinjetado:** o limiar de 0,15 pós-desconto de volta → 0,19 e 0,25 dão
  0,000, vermelho com número. Zona morta removida → 0,10 anda, vermelho.
- **Por que não é acidente:** mede os DOIS lados do limiar. Uma asserção só de
  "não anda abaixo de 0,18" seria da família 1 (satisfeita por um jogo que não
  anda nunca).

### M3 · A cabeça é o referencial do vetor de andar (R3)

- **Grandeza:** **ângulo**, em graus, entre a direção de `player.vel` no plano
  XZ e a guinada de referência.
- **Instante:** 600 ms com o analógico no talo à frente, com a pose da cabeça
  fixada ANTES.
- **Como, caso 1 (giro artificial zerado):** `XR.giro.zerar()`;
  `__xrEmulado.quaternion` = guinada θ para
  `θ ∈ {0 · 45 · 90 · 135 · 180 · −90 · −135}`; `__A.stick('left', 0, -1)`.
  Referência = **θ**, lida do dispositivo.
- **Como, caso 2 (com giro artificial):** aplicar um giro conhecido φ pelo
  analógico direito, ler `φ = XR.rig.rotation.y`, repetir com referência
  **θ + φ**.
- **Aprova:** |erro| ≤ **2°** nos 14 casos.
- **Reinjetado:** trocar `vistaMundo()` por `camera.quaternion` em
  `playerUpdate`. O caso 1 continua VERDE (com o rig sem giro os dois são o
  mesmo objeto) e o caso 2 fica vermelho com erro igual a φ — **por isso os dois
  casos existem**. Com φ = 180° o erro medido é 180,0°.
- **Por que não é acidente:** a referência é `__xrEmulado.quaternion` +
  `XR.rig.rotation.y`, **nenhum dos dois calculado por `vistaMundo()`** — não é a
  família 2 (comparar uma reta com ela mesma, o defeito do teste da mira). Mede
  ângulo, não distância percorrida — não é a família 3. E o caso 2 existe
  justamente porque o caso 1 sozinho seria a família 9 (cenário que não
  exercita o limiar).

### M4 · O corpo em 1ª pessoa segue a cabeça com 25° de folga (R4)

- **Grandeza:** `XR.corpo.guinada` (rad) contra a guinada do dispositivo, em
  graus, amostrado por frame.
- **Como:** `XR.giro.zerar()` primeiro — `guinadaDaCabeca()` lê
  `camera.quaternion`, que é pose RELATIVA AO RIG, e o corpo é filho do rig; com
  giro artificial ≠ 0 a régua e a leitura ficariam em espaços diferentes e o
  teste mediria a diferença dos dois em vez da folga do pescoço. Depois: partir
  de θ = 0 estabilizado; saltar a cabeça para θ = 20° e esperar 1 s; depois para
  θ = 90° e amostrar a cada frame por 1 s.
- **Aprova:** em θ = 20°, `|Δguinada| < 0,5°` (dentro da folga, o corpo **não**
  se mexe). Em θ = 90°, a guinada converge para **90° − 25° = 65°** dentro de
  1°, com t63 entre 100 e 160 ms (k = 8 ⇒ 125 ms).
- **Reinjetado:** `PESCOCO = 0` → o corpo se mexe já em 20°, vermelho com o
  número. `QUADRIL = 0` → nunca converge, o valor final fica em 0,0° contra
  65°, vermelho.
- **Por que não é acidente:** duas asserções de sinal OPOSTO (uma exige que NÃO
  mexa, outra que mexa até um alvo exato) — nenhuma passa por vacuidade, o que
  descarta a família 1. A leitura de `XR.corpo.guinada` é o ângulo do OSSO/raiz
  do corpo publicado pelo módulo, **não** uma `Box3` (a armadilha do
  `SkinnedMesh` congelado, registrada no CLAUDE.md).

### M5 · O avatar remoto acompanha a cabeça, sem folga (R6, e é C6)

- **Grandeza:** diferença angular, em graus, entre `rp.targetYaw` no cliente do
  outro jogador e a guinada de mundo real da cabeça.
- **Como:** dois clientes; **aplicar giro artificial φ ≠ 0 no cliente de VR**;
  varrer θ ∈ {0 · 90 · 180 · −90}; esperar dois ciclos de envio (200 ms).
- **Aprova:** ≤ **5°** (o número de C6).
- **Reinjetado:** trocar `G.yawDaVista()` por `camera.quaternion` em
  `br-game.js:1902` → erro = φ. Trocar por `XR.corpo.guinada` → erro ≈ 25° em
  regime e até 65° durante a transição.
- **Por que não é acidente:** **φ ≠ 0 é obrigatório no cenário**, e a razão está
  escrita no teste — com φ = 0 as três fontes coincidem e a reinjeção passa
  verde. É a família 9 nomeada e evitada. E mede ângulo entregue ao OUTRO
  cliente, não "a função foi chamada" (família 4).

### M6 · O giro artificial existe, obedece e pode ser desligado (R5)

- **Grandeza:** `XR.rig.rotation.y` em graus, e `|player.vel|` em m/s.
- **Como, três cenários, todos com 2,0 s de analógico no talo:**
  1. `modo: 'suave'`, `velocidade: 180` — direito para o lado.
     **Aprova:** |Δyaw| = 360° ± 5 %; `|player.vel|` = 0.
  2. `modo: 'desligado'` — direito para o lado.
     **Aprova:** |Δyaw| < **0,1°**; `|player.vel|` = 0.
  3. **Cruzado** — esquerdo para o lado.
     **Aprova:** `|player.vel|` > 0 **e** |Δyaw| < 0,1°; e a direção do
     `player.vel` é perpendicular ao olhar (strafe), 90° ± 2°.
- **Reinjetado:** preferência que não chega ao módulo → o cenário 2 gira 360°,
  vermelho. Alguém mover `correr` ou `andar` para o eixo do giro (o conflito
  semântico que já aconteceu nesta base) → o cenário 3 acusa yaw ≠ 0 **ou**
  velocidade de corrida onde se esperava caminhada.
- **Por que não é acidente:** o cenário 3 é **o teste de uma frente rodado
  contra o código da outra**, que é a lição escrita no CLAUDE.md; e nenhuma das
  asserções lê preferência de volta do armazém (isso seria a família 1 — ler o
  que você acabou de escrever).

---

## 6. Resumo em uma frase

Metade do pedido do dono já está no código e a pesquisa **refuta** a outra
metade da queixa: virar a cabeça já vira o personagem para o jogo, para o
servidor e para os outros jogadores; o que não parece natural é o analógico
esquerdo virar **quatro booleanos** em `game.js:3657`, com oito direções, uma
velocidade e zona morta efetiva de 0,28 — e o giro artificial **não pode** ser
removido (VRC.Quest.Tracking.1), só rebaixado a opção desligável.
