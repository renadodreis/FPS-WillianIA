# Mira no toque — como os FPS/BR móveis AAA resolvem, e o que isso cobra deste jogo

Pesquisa feita antes de mexer nos controles de toque, a partir da queixa do
dono: *"a mira no celular segue ruim, longe do AAA"*. Nenhum código foi
alterado nesta rodada. Pesquisa de 2026-09-27, sobre o commit `8f414c3`.

**Formato.** Cada assunto segue: afirmação → FONTE (URL) → CITAÇÃO LITERAL em
inglês. Números concretos sempre que a fonte os dá. Onde a fonte é código, a
citação é a linha do código. No fim: o que **não** foi encontrado, e a
recomendação para este jogo, com cada item marcado:

- **[LASTRO]** — a fonte diz isso (e é citada acima);
- **[INFERÊNCIA]** — conta minha, adaptação ou número de partida a calibrar.

**Peso das fontes**, do mais forte ao mais fraco:
`[OFICIAL]` (site, blog, patch note ou central de ajuda do estúdio) ·
`[CÓDIGO]` (fonte pública de engine de estúdio AAA) ·
`[PALESTRA]` (GDC; transcrição automática do áudio — ver nota em §1.3) ·
`[ACADÊMICO]` · `[DATAMINE]` (arquivo de configuração publicado pelo próprio
jogo, rastreado por terceiros) · `[SECUNDÁRIA]` (imprensa/guia; só onde não
achei primária, e marcado).

---

## 0. O ponto de partida (leitura do código, sem rodar)

| Aspecto | Hoje | Onde |
|---|---|---|
| Analógico de andar | flutuante, raio 58 px CSS, zona morta radial 0,12, correr acima de 0,85 | `js/touchcontrols.js:48,52,56` |
| Olhar | arrasto na metade direita; **0,0032 rad/px CSS = 0,1833°/px**, linear, sem curva, sem opção | `js/touchcontrols.js:68`, `game.js:1963-1966` |
| Eixo vertical | **o mesmo fator do horizontal** (razão Y/X = 1,00) | `game.js:1965-1966` |
| Quanto gira um arrasto | 422 px (metade direita de uma tela 844×390) = **77,4°**; 844 px (tela inteira) = 154,7°; 1000 px = 183,3° | conta [INFERÊNCIA] |
| Em unidade física | supondo ~160 px CSS por polegada (valor típico de celular): 1,15°/mm, **~31 cm de arrasto por volta** | conta [INFERÊNCIA] |
| Sensibilidade no ADS | `pointerSpeed = lerp(1, adsFov < 40 ? 0.36 : 0.75, ads)` — dois degraus só | `game.js:2207` |
| Atirar | botão 2×2 dentro de um cluster 6×3 no canto inferior direito; o polegar SAI da área de olhar para atirar | `style.css:926-931` |
| Tamanho do cluster | botão com piso de 48 px; numa tela 844×390 o cluster ocupa **318×156 px**, ~75 % da largura da metade direita | `style.css:850-857` |
| Assistência de mira | **nenhuma** | — |

Duas contas que voltam no §3.3: a base de FOV vertical é 75° (`game.js:377`),
e as miras vão de 62° a 26° (`js/weaponrig.js:19-79`, `js/weapons.js:262-288`).

---

## 1. Assistência de mira

### 1.1 Vocabulário — o que cada técnica faz

**A taxonomia usada na literatura tem cinco técnicas**, e ela vale
explicitamente para toque. `[ACADÊMICO]`
Schneider et al., CHI 2023 —
<https://equis.cs.queensu.ca/~equis/pubs/2023/schneider-chi-2023.pdf>

> "we refer to the action of a player performing the selection part of aiming
> as "clicking," even though these techniques can apply, for example, to
> touch-based interfaces."

> "Bullet Magnetism Projectiles veer toward nearby targets, as though drawn by
> a magnet. If the target is close enough, a projectile that would have missed
> on a straight path will instead score a hit"

> "Sticky Targets Once a player has successfully aimed their cursor at or near
> a target, Sticky Targets will slow the cursor if it begins to move away"

> "Target Gravity When the player moves their cursor, Target Gravity steers
> the cursor toward nearby targets, as though attracted by a gravitational
> force [...] It can also be called Reticule/Reticle Magnetism"

> "Target Lock The player's cursor snaps directly to a target [...] Because of
> its power to make aiming easier, Target Lock is rare in shooter games"

Mapa para os nomes da indústria (Call of Duty, Apex, Halo): *slowdown* /
*friction* = Sticky Targets; *rotational* / *magnetism* / *pull* = Target
Gravity; *auto-hit* / *bullet magnetism* = Bullet Magnetism; *zoom snapping* /
*snap no ADS* = um Target Lock de curta duração.

**Em FPS 3D, as duas que mexem só no cursor (sticky e gravity) funcionaram
mal por overshoot; a que entorta a bala e a de cursor largo funcionaram; o
lock funcionou mas é óbvio demais.** `[ACADÊMICO]`
Vicencio-Moreira et al., "Does Helping Hurt?", CHI PLAY 2016 (resumindo o
estudo CHI 2014 dos mesmos autores) —
<https://rodrigov.ca/wp-content/uploads/2016/11/assisted-learning-v25.pdf>

> "Solutions that increase target width include Sticky Targets, which reduces
> the Control-to-Display ratio of the cursor when it is over the target [39],
> and Target Gravity, which attracts the cursor to targets using simulated
> gravity [9]. Both techniques have been tested in FPS games, but neither
> performed well due to overshooting [35]."

> "In FPS games, Target Lock (i.e., snapping to a target) has been shown to be
> effective, but is seen as too obvious for player balancing [35]."

E, contra o medo de que assistência atrapalhe o aprendizado:

> "Our study found no significant differences in performance or player
> experience to suggest that aim assistance causes a detrimental "guidance
> effect" in FPS games."

### 1.2 A implementação de referência com números publicados — Lyra (Epic)

O Lyra é o jogo de exemplo da Epic para Unreal 5, e carrega o mesmo modelo de
assistência do Fortnite (os nomes dos parâmetros são os mesmos que aparecem no
datamine do Fortnite, abaixo). Código lido de um espelho público do Lyra
(cabeçalho `// Copyright Epic Games, Inc.`), commit `b8474915c5`. `[CÓDIGO]`
<https://github.com/readyplayerme/Lyra-Sample/blob/master/Plugins/GameFeatures/ShooterCore/Source/ShooterCoreRuntime/Private/Input/AimAssistInputModifier.cpp>
e o `.h` correspondente em `Public/Input/`.

**Os valores padrão, no construtor (`.cpp` l. 111-135):**

| Parâmetro | Quadril (hip) | Mira (ADS) | O que é (comentário do `.h`) |
|---|---|---|---|
| `Pull…Inner` | **0,6** | **0,7** | "How much target and player movement contributes to the aim assist pull when target is under the inner reticle. (0 = None, 1 = Max)" |
| `Pull…Outer` | **0,5** | **0,4** | idem, "under the outer reticle" |
| `Slow…Inner` | **0,6** | **0,7** | "Amount of aim assist slow applied to desired turn rate when target is under the inner reticle. (0 = None, 1 = Max)" |
| `Slow…Outer` | **0,5** | **0,4** | idem, "outer reticle" |
| `PullLerpInRate` / `OutRate` | 60 / 4 por s | 60 / 4 | "Exponential interpolation rate used to ramp up the pull strength" |
| `AssistInnerReticle` | 20×20 | — | "Width of aim assist inner reticle in world space." |
| `AssistOuterReticle` | 80×80 | — | idem, outer |
| `ReticleDepth` | 3000 | — | profundidade onde a caixa é medida |
| `TargetingReticle` | 1200×675 | — | janela de coleta de alvos |
| `TargetRange` | 10000 (UU = cm → 100 m) | — | "This is scaled using the field of view in order to limit targets by their screen size." |
| `MaxNumberOfTargets` | 6 | — | |

Em ângulo **[INFERÊNCIA — conta minha]**: caixa de 20 a 3000 = meia-abertura de
**0,19°**; de 80 = **0,76°**; janela de coleta = ±11,3° × ±6,4°. A caixa é
testada contra a **caixa do alvo projetada na tela** (`AimAssistTargetManagerComponent.cpp`
l. 236-237: `AssistInnerReticleBounds.Intersect(TargetScreenBounds)`), então o
raio efetivo é "silhueta do alvo + 0,19°/0,76°". A profundidade e o alcance
são divididos pelo fator de FOV (l. 111-114), ou seja **no zoom a caixa
encolhe em ângulo junto com a imagem**.

**Quatro comportamentos que o código deixa explícitos:**

1. *Pull* não puxa para o centro do alvo: ele devolve uma **fração do giro
   necessário para acompanhar o MOVIMENTO relativo** (alvo + jogador).
   (`.cpp` l. 675)
   > "// The amount of pull is a percentage of the rotation needed to stay on target."

2. **Só age com o jogador mexendo.** `bRequireInput = true` por padrão
   (`.cpp` l. 138). O *slow* exige entrada de OLHAR; o *pull* aceita olhar
   OU andar, mas andando sem olhar ele é escalado pelo quanto o jogador está
   de lado (*strafe*). (`.h` l. 297; `.cpp` l. 680-681)
   > "/** Whether or not we require input for aim assist to be applied */"

   > "// Scale pull strength by amount of player strafe if the player isn't
   > actively looking around. // This helps prevent view yanks when running
   > forward past targets."

3. **O slow não pode travar quem está indo PARA o alvo** (`bUseDynamicSlow`):
   a parte do giro que já aponta na direção do alvo é devolvida
   (`.cpp` l. 714-727), e o slow nunca deixa mais rápido que o normal
   (l. 741-743). Há um teto opcional no pull contra puxão de vista (l. 688):
   > "// Clamp the maximum amount of pull rotation to prevent it from yanking the player's view too much."

4. **É um modificador de controle, não de mouse.** (`.h` l. 323)
   > "An input modifier to help gamepad players have better targeting."

E o mesmo arquivo fixa o **pitch em 60 % do yaw** (`.cpp` l. 421):
`GamepadUserOptions_PitchLookRateBase = (GamepadUserOptions_YawLookRateBase * 0.6f);`
com mistura radial "This keeps diagonals accurate." (l. 443).

**Quanto disso vai para a produção: o Fortnite rodou metade.** `[DATAMINE]`
Hotfix do Fortnite capturado em 2020-08-13 (cliente Mac), commit `ca53ae57e8`
do rastreador público de hotfixes —
<https://github.com/pirica/HotfixTracker/blob/master/Fortnite/MacClient_Game.ini>

> "+CurveTable=/Game/Input/InputData;RowUpdate;Gamepad.AimAssist.PullInnerStrengthHip;0;0.3"
> "+CurveTable=/Game/Input/InputData;RowUpdate;Gamepad.AimAssist.PullOuterStrengthHip;0;0.25"
> "+CurveTable=/Game/Input/InputData;RowUpdate;Gamepad.AimAssist.PullInnerStrengthAds;0;0.35"
> "+CurveTable=/Game/Input/InputData;RowUpdate;Gamepad.AimAssist.PullOuterStrengthAds;0;0.2"

Ou seja: pull hip 0,30/0,25 e ADS 0,35/0,20 — exatamente a metade dos padrões
do Lyra, num cliente de PC. É um retrato de 2020, não o valor de hoje.

### 1.3 A palestra de referência — GDC 2013, Insomniac (Resistance 3)

"Techniques for Building Aim Assist in Console Shooters", Nick Weihs. `[PALESTRA]`
Página oficial: <https://www.gdcvault.com/play/1017942/Techniques-for-Building-Aim-Assist>
· áudio público: <https://archive.org/details/GDC2013Weihs>

> **Nota de método:** as citações abaixo vêm de transcrição automática
> (faster-whisper) do áudio do Internet Archive, feita nesta máquina, com o
> minuto:segundo ao lado. Os trechos com números foram re-transcritos com o
> modelo grande. Onde as duas transcrições divergiram, está dito.

**Por que assistir: o tempo de reação humano.** (02:02)
> "The average overall response time was 320 milliseconds, and the average of
> the best response time for each test was 250 milliseconds."

> (03:05) "So if something happens in an interval of less than 250 to 320
> milliseconds we want to slow that down so the player has more time to react."

**Vertical mais lento que horizontal, por anatomia — 1/3.** (06:17, 07:06)
> "The muscles that control horizontal aiming are in your arm and they're
> actually bigger and stronger than the ones that control vertical aiming."

> "So our top horizontal turn speed was 210 degrees per second and top
> vertical turn speed was one-third of that at 70 degrees per second."

**Alvo: caixa interna e externa, escaladas pelo tamanho na tela, com piso.** (09:33)
> "The box size is scaled with the screen space area that the target took up.
> We also maintained a certain minimum size so that faraway targets had a
> reasonable amount of target area."

> "inside the inner box, the value was 1. Outside the outer box, the value 0,
> and we ramp up in between."

E histerese: "We also increased the value for the previous target's frame so
that if another target passes through the center of your reticule it doesn't
steal aim assist away from you." (10:09)

**Magnetismo = interpolar a entrada do jogador rumo à entrada que rastrearia o
alvo perfeitamente.** (10:29)
> "we do this is by taking or calculating the input that would give perfect
> tracking on the target and interpolating between the player's input and that
> target input."

**Centering só quando o jogador anda de lado.** (11:32)
> "we only applied this factor if the player was actually moving perpendicular
> to the direction they were facing and turning towards the center of the
> target"

**Friction (slowdown puro) foi ABANDONADO — não alcança alvo rápido.** (12:53)
> "friction has a fundamental flaw that if a target is moving pretty close to
> your maximum turn speed. It can actually slow you to the point where you'll
> never catch up to it and thus defeating the whole point of aim assist to
> begin with."

**Auto-hit (bullet magnetism) com números, e desligado para projétil lento.** (13:37)
> "If the difference in arc between the center axis and that position is less
> than a threshold amount, then whenever we fire, we fire directly at that
> point for a guaranteed hit. And this doesn't work for lob weapons or
> slow-moving projectiles, so we disabled it for that."

> "our baseline auto-hit threshold up here is between 1.1 and 0.2 degrees, and
> for the level on the boat up there, it's actually between 5.0 and 2.8 degrees."

Em distância **[INFERÊNCIA]**: 1,1° = 19 cm a 10 m; 0,2° = 3,5 cm a 10 m.

**Mais assistência atirando (para o recuo), menos no zoom forte.** (15:24, 16:59)
> "whenever the player was firing a fully automatic weapon, we just made it so
> that magnetism never went under 0.6."

> "we basically just reduced the FOV by about 15% and reduced your turn speed
> by about 50%. [...] for our sniper rifle, which had a 6x scope and an 80%
> slowdown, we ended up reducing magnetism by 50% and also turned off centering."

"Forgiveness" (14:36) — reforço quando o jogador já rastreia quase certo, até
t = 0,7. **Os limiares divergiram entre as transcrições** (7→30 °/s numa,
70→30 °/s na outra); não use esse número sem ouvir o áudio.

**Menos assistência: muitos alvos, alvo grande/perto, alvo imprevisível,
multiplayer.** (17:53, 18:08, 18:40, 19:58)
> "we end up reducing aim assist over half a second to zero so that you can
> easily pass through all those targets. If you pass through an arc of more
> than 40 degrees without hitting anything, then aim assist resets"

> "For targets that are up close, we end up tapering off aim assist to zero as
> you get under 15 meters away from it."

> "We ended up implementing a baseline decrease in magnetism by 15% and gave a
> small boost to centering." (multiplayer)

**Sem entrada, sem assistência.** (28:16)
> "I think on Resistance 3 we disabled aim assist if you weren't touching the
> sticks at all. If you were moving, however, aim assist would engage and you
> would get a little bit of pull."

**Como calibrar: com quem nunca jogou.** (21:03)
> "if you want to actually test if your changes are having a positive or
> negative impact on the user experience you have to play test with noobs."

### 1.4 "Só quando o jogador está mirando" virou regra explícita no CoD

**Black Ops 7 / Warzone: força total do rotational só com o analógico direito
RASTREANDO o alvo; sem isso, piso reduzido — 35 % a menos no lançamento,
ajustado para 25 %.** `[OFICIAL]`
<https://www.callofduty.com/patchnotes/2025/11/call-of-duty-black-ops-7-preseason-patch-notes>

> "With this update, the player's right stick movement must be tracking an
> enemy target for Rotational Aim Assist to activate at full strength. If the
> conditions are not met, Rotational Aim Assist strength will be reduced. For
> example, if only the left stick is being controlled during an engagement,
> Rotational Aim Assist strength will be reduced."

> "At launch, the minimum Rotational Aim Assist was a 35% reduction from the
> Beta."

> "Minimum Rotational Aim Assist penalty reduced from 35% to 25%."

E a força varia com a distância, medida em dados de partida:

> "we found that controller is slightly favored to win at close ranges and KBM
> is favored at long ranges. [...] In Black Ops 6, we updated Rotational Aim
> Assist strength at close range to scale over a short distance. In Black Ops
> 7, we are increasing the range before full Rotational Aim Assist strength is
> achieved."

(A mesma regra foi herdada pelo Warzone na Season 01 —
<https://www.callofduty.com/patchnotes/2025/12/call-of-duty-bo7-warzone-season-01-patch-notes>:
"Warzone will be inheriting these same changes with the launch of Season 01.")

### 1.5 Por dispositivo: toque tem, mouse não tem, giroscópio desliga

**Critical Ops (FPS móvel competitivo): assistência no toque em valor
padrão, DESLIGADA no mouse, maior no controle — e o toque é a régua.** `[OFICIAL]`
<https://criticalopsgame.com/news/input-method-feature-announcement/> (2023-06-26)

> "To ensure balanced gameplay between all control schemes, we have disabled
> aim assist when playing with a mouse and keyboard and increased the aim
> assist when playing with a controller. Touch controls remain the same. All
> adjustments will be made to mimic the performance of touch controls."

Central de ajuda — <https://critical-force.theymes.com/hc/en/critical-ops/articles/aim-assist-98>
> "Mouse and Keyboard: Aim assist is disabled when using a mouse and keyboard."
> "Touch Input: Aim Assist settings for touch input remain at their standard values."

**Fortnite: giroscópio ativo desliga a assistência.** `[OFICIAL]`
<https://www.fortnite.com/news/gyro-aiming-and-flick-stick-come-to-fortnite-in-v19-30-more-controller-options>
(lido via Internet Archive, captura de 2025-08-06)
> "Having Gyro Aiming on disables aim assist whenever gyro is active."

**E o autor do gyro do Fortnite diz o porquê.** `[OFICIAL — blog do especialista]`
<http://gyrowiki.jibbsmart.com/blog:good-gyro-controls-part-1:the-gyro-is-a-mouse>
> "Don't have aim assist. You don't have aim assist with a mouse, so don't do
> it with gyro."

**Halo: magnetismo só no controle.** `[SECUNDÁRIA — wiki]`
<https://www.halopedia.org/Magnetism>
> "It is only enabled for players using controllers - those on mouse and
> keyboard are not affected."

**Apex: assistência nunca sai, mas foi cortada 25 % no controle de PC.** `[OFICIAL]`
<https://www.ea.com/en/games/apex-legends/apex-legends/news/shockwave-patch-notes> (Season 22, 2024)
> "Controller on PC: Aim Assist strength reduced 25%"
> "Aim assist will never be removed as it's a critical accessibility feature."

Os valores internos 0,6 (console) e 0,4 (controle no PC) circulam só pela
imprensa. `[SECUNDÁRIA]` <https://tittlepress.com/tech/1260072/> (reproduz a
Dot Esports):
> "Console players have internal aim assist set to "0.6" in the game files, a
> value that defines the strength of the reticle's sticky effect."

A Respawn confirmou o episódio, sem dar número: *"Well, we goofed. With the
launch of Escape, aim assist on console was unintentionally set to PC values.
It's back to normal now."* (via
<https://uk.turtlebeach.com/blog/aim-assist-being-fixed-in-apex-legends-after-accidental-nerf>).
**0,6 → 0,3 depois da S22 não tem fonte primária** (ver §5).

**PUBG Mobile: assistência existe e é DESLIGADA no competitivo profissional.** `[OFICIAL]`
<https://esports.pubgmobile.com/Documents/Competition%20Rulebook%20PUBGM.pdf> (v1.5.0, 2024)
> "Aim Assist is disabled at Pro League or higher level of competition."

**Standoff 2 é a exceção declarada: sem assistência e sem tiro automático.** `[SECUNDÁRIA]`
<https://en.wikipedia.org/wiki/Standoff_2> (citando um guia do games.mail.ru)
> "Unlike most mobile shooters, in Standoff 2 there is no auto-shooting and
> aiming assistance"

### 1.6 Por arma, por zoom e por distância

**Destiny 2: cone de assistência em GRAUS, e 0,05° se sente.** `[OFICIAL]`
TWAB de 2021-04-29, <https://www.bungie.net/en/Explore/Detail/News/50287>
(lido pelo espelho <https://destiny.bungie.org/forum/index.php?mode=thread&id=175257>)
> "Hand Cannon aim assist cone angle is 2.5 degrees at 0 AA, to 3 degrees at
> 100 AA, and you can feel the difference between a 90 AA hand cannon and a
> 100 AA hand cannon (a 0.05-degree increase), so a small difference can be
> significant."

TWAB de 2022-04-21, <https://www.bungie.net/en/Explore/Detail/News/51250>
(espelho <https://destiny.bungie.org/bwu/409>):
> "Headshot aim assistance: 0 at 0 stat, 1 degree at 100-stat on Primary
> weapons, Slug Shotguns, Linear Fusion Rifles and Machine Guns, 0.5 degrees on
> Sniper Rifles."

Em distância **[INFERÊNCIA]**: 2,5° = 44 cm a 10 m; 3,0° = 52 cm a 10 m.

**The Finals: snap de zoom com teto de velocidade e tirado de sniper e escopeta;
magnetismo de 50 % para 35 %.** `[OFICIAL]`
<https://www.reachthefinals.com/patchnotes/141>
> "Zoom Snapping Angular Velocity now has a max cap, preventing unintended
> rapid 90-degree turns."
> "Camera Magnetism will be reduced to 35% from 50%, making player aim less
> sticky and lowering controller accuracy."
> "Zoom Snapping Time will be reduced to 0.25s from 0.3s."
> "Zoom Snapping will be removed from the SR-84 Sniper Rifle, Revolver, LH1,
> and all Shotguns, as it buffs them more than other weapons."
> "Aim assist will ignore invisible players, fixing a bug with the existing system."

**Free Fire: assistência regulada ARMA A ARMA e com prioridade de alvo.** `[OFICIAL]`
OB50 — <https://ff.garena.com/en/article/1511/>
> "As the only SMG with strong aim assist, Bizon's large spread limits its effectiveness."
> "VSK94 (Adjustment): Aim-Assist Removed, Range +10%."

OB52 — <https://ff.garena.com/en/article/1595/>
> "we're also adding aim assist to the Heal Pistol to make it easier to use."

OB54 — <https://ff.garena.com/en/article/1673/>
> "Improved aim assist logic. When a downed enemy and a standing enemy overlap,
> aim assist now prioritizes the standing enemy."

**Blood Strike: coeficiente POR ARMA e diferente entre celular e PC.** `[OFICIAL]`
Version Update Announcement 2026/04/16 — <https://www.blood-strike.com/news/update/20260415/39377_1296268.html>
> "We've noticed that the QBZ-95 and M1887 perform very well on PC, but are
> harder to use on mobile. Therefore, we've decided to increase the Aim Assist
> coefficient for these two weapons on mobile"

**Farlight 84: assistência também andando, e mais forte no ADS.** `[SECUNDÁRIA — wiki que transcreve as notas]`
<https://farlight-84.fandom.com/wiki/Patch_Notes/v14.2> (2022-12-22) ·
<https://farlight-84.fandom.com/wiki/Patch_Notes/v14.2.6> (2023-01-12)
> "Aim Assist now has automatic adsorption while moving."
> "Increased the aim assist coefficient when aiming down a scope."

**Critical Ops: há armas SEM assistência de propósito.** `[OFICIAL]`
<https://criticalopsgame.com/news/patch-1-32-0-notes/> (2022-03-20)
> "SCAR-H has no Aim Assist, just like the AR-15"

**Halo: raio menor no zoom e com a distância.** `[SECUNDÁRIA — wiki]`
<https://www.halopedia.org/Magnetism> — o raio varia com arma, zoom e
distância, e cessa além de um limite por arma (paráfrase do resumo; a página
cita só material de marketing do Halo 5).

### 1.7 Os jogos móveis pedidos — o que cada um documenta

| Jogo | Tem assistência no toque? | O que a fonte primária diz | Fonte |
|---|---|---|---|
| **CoD: Mobile** | sim, chave liga/desliga, **age no ADS** | "Aim Assist – Turning this on will aid in aiming a weapon at an enemy when aiming down sights." | `[OFICIAL]` blog Activision 2019 (§2.1) |
| **Warzone Mobile** | sim, chave liga/desliga; **contorno do inimigo perto da mira**; virar para quem atirou | ver citações abaixo | `[OFICIAL]` callofduty.com 2024 |
| **PUBG Mobile** | sim; desligada no Pro League | rulebook (§1.5) | `[OFICIAL]` |
| **Fortnite (toque)** | tiro automático; gyro desliga a assistência | §2.4, §1.5 | `[OFICIAL]` |
| **Apex Legends Mobile** | havia chave (jogo encerrado em 2023) | só guias | `[SECUNDÁRIA]` — ver §5 |
| **Free Fire** | sim, por arma, com prioridade de alvo | §1.6 | `[OFICIAL]` |
| **Blood Strike** | sim, coeficiente por arma e por plataforma | §1.6 | `[OFICIAL]` |
| **Farlight 84** | sim, andando e mais forte no ADS | §1.6 | `[SECUNDÁRIA]` |
| **Standoff 2** | **não** (nem tiro automático) | §1.5 | `[SECUNDÁRIA]` |
| **Critical Ops** | sim no toque, **não no mouse**, com armas sem assistência | §1.5, §1.6 | `[OFICIAL]` |

Warzone Mobile — <https://www.callofduty.com/blog/2024/03/call-of-duty-warzone-mobile-complete-control-plus-customization-controller-options> `[OFICIAL]`
> "Enemy Outlines: Obviously, no enemies are visible through walls; the outline
> of foes appear when they are close to your aiming reticle, helping you aim
> during the chaos of both Battle Royale and Multiplayer modes."

> "Turn to Damage Assist: Whether you automatically turn in-game to the source
> of enemy fire once it hits you."

> "Other Options: You can choose whether loot is auto picked up, how you mantle
> over scenery, your parachute deployment, how you climb stairs, crouch, if you
> have auto-assist while turning at corners, and how you equip Armor."

---

## 2. Botão de atirar que também mira

### 2.1 Call of Duty: Mobile — o botão de tiro FLUTUA até o dedo por padrão

`[OFICIAL]` "Getting a Grip on the Call of Duty: Mobile Controls", James Mattone, 2019-10-09 —
<https://blog.activision.com/content/atvi/activision/atvi-touchui/web/en/blog/call-of-duty/2019-10/Getting-a-Grip-on-the-Call-of-Duty-Mobile-Controls.html>

**A opção que existe é para TRAVAR o botão — ou seja, por padrão ele se move
para onde o dedo aperta:**
> "Fixed R-Fire Button – When enabled, this locks the Fire button on the right
> side of the screen to one location, rather than having it move based on
> where your finger presses the screen."

**Olhar = arrastar no lado direito:**
> "Aiming and looking around the map is done by simply dragging a finger around
> the right side of your screen."

**Dois modos de tiro; o Simples atira sozinho (com alcance limitável); no
Avançado o botão pode mirar antes de atirar, por arma:**
> "The Controls submenu is also where you can switch between Simple and
> Advanced Fire modes [...] Other options include limiting auto hip fire range
> for the Simple Fire Mode, and individual controls for 1-tap ADS or Hip Fire by
> weapon when pressing the Fire button in Advanced Mode."

> "12. Fire: While in Advanced Fire mode, or when using a Launcher, pressing
> this button will fire your weapon. If applicable to the specific type of
> weapon being fired, your soldier will also aim down sight before firing."

> "3. Hip Fire Button (if applicable): When using the Advanced Mode for firing
> weapons, a secondary fire button will appear here."

**Tiro à esquerda é suportado:**
> "How about placing the joystick on the right side of the screen and the fire
> button on the left, which may be more comfortable for those Southpaw players?"

### 2.2 PUBG Mobile — tiro nos DOIS lados por padrão; mira e espiada giram a câmera

`[OFICIAL — editorial do Google Play]`
<https://play.google.com/store/apps/editorial?id=mc_editorial_evergreen_post_install_pubg_mobile_improve_your_controls_gamehub_fcp&hl=en>
> "The default control scheme includes a button for shooting on both sides of
> the screen, so if you're more comfortable pressing the shoot button with your
> left thumb, you'll be able to do so."

`[OFICIAL]` Patch Notes 0.19.0 (2020-07) —
<https://www.pubgmobile.com/webplat/info/news_version3/35372/60662/60663/60724/60725/60726/m22521/202007/862637.shtml>
> "Added on/off settings for Scope and Peek buttons to rotate the camera."

`[OFICIAL]` Central de ajuda — <https://pubgmobile.helpshift.com/hc/en/3-pubg-mobile/faq/37-what-are-the-controls/>
> "Drag anywhere, up, down, left and right, on your screen where there are no
> icons to adjust your viewing angles."

`[SECUNDÁRIA]` <https://gurugamer.com/mobile-games/must-know-tips-to-move-while-shooting-to-get-chicken-dinner-in-pubg-mobile-10886>
(o segundo "can" é erro de digitação da fonte; o sentido é "cannot"):
> "Keep in mind that you can drag the right shooting button to move the camera
> angle but you can move the camera angle when dragging the left-shooting button."

### 2.3 Critical Ops — o "joystick de tiro", com sensibilidade própria

`[OFICIAL]` Patch 1.19.0 (2020-08-24) — <https://criticalopsgame.com/news/patch-1-19-0-notes/>
> "we developed the joystick fire button feature."
> "Now you will be able to see the icon of the joystick move along with your
> finger with a directional line indicating the movement direction. This is
> meant to visualize the old shoot button aim functionality."
> "we have removed the settings toggle for "DISABLE SHOOT BUTTON AIM" and
> replaced it with a new slider called "FIRE BUTTON AIM SENSITIVITY"."
> "Together with the "SCOPED IN SENSITIVITY" slider this makes it possible to
> create custom sensitivities for both shoot and aim joystick buttons. To
> disable the feature you can slide the values to 0 to turn off the button aim
> feature."

**Sniper: segurar a mira para mirar, SOLTAR para atirar — padrão para novatos:**
> "Now you will be able to use "RELEASE SCOPE BUTTON TO SHOOT" and "HOLD SCOPE
> BUTTON TO AIM" to customize the way shooting with sniper works."
> "The default settings for new players will be based on release to shoot and
> Hold to aim methods."

Patch 1.32.0 (2022-03-20) — <https://criticalopsgame.com/news/patch-1-32-0-notes/>
> "Aim-joystick automatically uses touch-to-hold interaction: Active touch =
> Scoped in, Release touch = Back to hip fire"
> "You can now add a secondary shoot button to your touch controls HUD"

### 2.4 Fortnite — três modos; o automático é o recomendado para quem chega

`[OFICIAL]` "Getting Started - Fortnite For Mobile" —
<https://www.fortnite.com/news/getting-started---fortnite-for-mobile>
(lido via Internet Archive, captura de 2025-12-04; o site devolve 403 a robô;
nas listas, os itens da página foram unidos por " / ")
> "On mobile, Fortnite offers three ways to fire your weapon: Auto Fire, Tap
> Anywhere, or Dedicated Button."
> "The Auto Fire selection is recommended for anyone that's new to Fortnite on
> mobile. Auto Fire allows the player to look at a target and have the selected
> weapon fire."
> "Auto Fire works great on the following weapon types: Assault Rifles /
> Shotguns / Sub machine guns / Pistols / Chargeable weapons (Mini Gun)"
> "Auto Fire does not fire with the following weapon types. You will need to
> use the Fire/Pickaxe buttons for the following: Melee Weapons / Pickaxe /
> Sniper Rifles and Bows / Launcher Weapons (RPGs, Bandage Bazooka) /
> Throwables (Grenades)"
> "Tap Anywhere allows you to fire your weapon by just tapping anywhere on your screen!"
> "When the Dedicated Button is selected the player's weapon will fire only
> when they press and hold the fire button."

### 2.5 Warzone Mobile — o padrão É o automático, e o botão de quadril nem existe

`[OFICIAL]` <https://www.callofduty.com/blog/2024/03/call-of-duty-warzone-mobile-complete-control-plus-customization-controller-options>
> "your right thumb enables you to look and turn, as well as automatically fire
> at any foe that enters your crosshairs. By default, there is no hip-fire
> button; if you've positioned your crosshairs on an enemy, you'll shoot at them."
> "Main Screen: This shows the Control Set you are currently using ("Default Auto")."
> "Weapon Trigger: This allows you to Auto Fire all your weapons, customize the
> firing of each weapon type (e.g., allowing for different actions for Shotguns
> compared to LMGs), or choose Manual Fire to shoot using onscreen buttons."
> "Choose how automatic your weapon trigger is, how you fire on vehicles,
> whether your weapons fire only at targets within the weapon's range"
> "Snap ADS fire can be set to a finger touch, you can choose how your ADS
> functions (via toggling or holding)"
> "Change how the virtual stick behaves [...] and how much camera control you
> have when performing a variety of functions, like firing, mounting, or aiming
> down sights."

---

## 3. Sensibilidade de toque

### 3.1 Curva: linear é o padrão; aceleração no toque só achei no Critical Ops

**Critical Ops tem aceleração de mira NO TOQUE, pequena, e já teve o defeito de
depender do framerate.** `[OFICIAL]`
Patch 1.70.0 (2026-05-04) — <https://criticalopsgame.com/news/patch-1-70-0-notes/>
> "Adjusted default touch aim sensitivity."
> "X axis changed to 3.0 from 4.2."
> "Y axis changed to 1.2 from 1.7."
> "X and Y aim acceleration changed to 3% from 5%."
> "Existing player settings are not affected."
> "Fixed aim acceleration being dependent on framerate."

(Unidade de "3.0" e de "3 %" não é declarada. A RAZÃO é o que se aproveita:
Y/X = 1,2/3,0 = **0,40**; antes 1,7/4,2 = 0,405.)

No controle, o mesmo jogo oferece as duas curvas — patch 1.42.0 (2023-10-02),
<https://criticalopsgame.com/news/patch-1-42-0-notes/>:
> "Linear aim response does not have any acceleration when aiming."
> "Standard aim response curve provides gradual acceleration when aiming. As
> you deflect the stick, your character starts to rotate faster and faster."

**Na palestra da Insomniac, aceleração só na subida, freada instantânea.** `[PALESTRA]` (08:15)
> "we apply some acceleration to the camera. This only applies if the camera
> speed is increasing, so any camera deceleration is instantaneous."
> "In our 30 FPS game, you reach the maximum turn speed over the course of four frames."

**No gyro do Fortnite, aceleração 2X é o padrão, e 1,0 = giro real.** `[OFICIAL]` (§1.5, mesma página)
> "When set to the default 1.0, the camera will move the same amount as the
> controller. "Acceleration" (set to 2X by default) increases your sensitivity
> when you turn the controller quickly."

E a definição que o autor usa — <http://gyrowiki.jibbsmart.com/blog:good-gyro-controls-part-1:the-gyro-is-a-mouse>:
> "your effective sensitivity changes according to your velocity *that instant*"

### 3.2 Vertical mais lento que horizontal — três fontes, três números

| Fonte | Razão vertical/horizontal | Tipo |
|---|---|---|
| Insomniac, Resistance 3 (210 °/s vs 70 °/s) | **0,33** | `[PALESTRA]` §1.3 |
| Critical Ops, padrão de TOQUE em 2026 (3,0 vs 1,2) | **0,40** | `[OFICIAL]` §3.1 |
| Lyra (Epic), pitch = yaw × 0,6 | **0,60** | `[CÓDIGO]` §1.2 |
| **Este jogo** | **1,00** | §0 |

E os eixos separados são opção comum: Warzone Mobile — "with separate sliders
for both horizontal and vertical movement" `[OFICIAL]`; Critical Ops 1.32 —
"Sensitivity options now allow adjustment of horizontal (x-axis) and vertical
(y-axis) values" `[OFICIAL]`.

### 3.3 Sensibilidade no ADS: por zoom, e a conta "certa" é a razão das tangentes

**O Lyra escala por `tan(FOV/2)` para CONTROLE E TOQUE, e diz que é o jeito
certo.** `[CÓDIGO]` `AimAssistTargetManagerComponent.cpp` l. 358-370
> "case ECommonInputType::Gamepad:
> case ECommonInputType::Touch:"
> "// This is the proper way to scale based off FOV changes."
> "// Ideally mouse would use this too but changing it now will cause
> sensitivity to change for existing players."
> `FovScale = (TanHalfFOV / BaseTanHalfFOV);`

**Fortnite fez o mesmo no gyro: um slider só, escalado pelo zoom.** `[OFICIAL]`
> "the main sensitivity slider is now scaled by zoom level. However, players can
> disable zoom scaling in the Advanced Gyro Options"

**Warzone Mobile: ADS global + por faixa de luneta + QUANDO a troca acontece.** `[OFICIAL]`
> "Further adjustments can be made to your ADS, both at a global level
> (customizing the camera sensitivity while aiming down sights) and by
> adjusting the sensitivity for any of your optic attachments (Low, 2x–3x,
> 4x–5x, 6x–7x, 8x, and High). You can then apply a timing (instant, gradual,
> or after zoom) during the transition of your ADS"

Outros com ADS por classe/mira: Critical Ops 1.32 "Adjust Aim Down Sights
sensitivities individually for, Sniper Riffles and Scoped Assault Rifles";
PUBG Mobile 1.1 "Added Win94 sight sensitivity settings to the settings
interface" (<https://www.pubgmobile.com/webplat/info/news_version3/35372/60662/60663/60724/60725/60726/m22521/202011/874641.shtml>).
CoD Mobile: "Choose from a few preset sensitivity options here or play with
several sliders" (§2.1).

**Este jogo contra a razão das tangentes** (base 75° vertical;
`ideal = tan(fov/2) / tan(37,5°)`) — **[INFERÊNCIA — conta minha]**:

| Mira (FOV) | Ideal | Hoje (`game.js:2207`) | Hoje ÷ ideal |
|---|---|---|---|
| lâmina/escopeta (62°) | 0,783 | 0,75 | 0,96 |
| holográfica/plasma (58°) | 0,722 | 0,75 | 1,04 |
| alça de ferro/fuzil (55°) | 0,678 | 0,75 | 1,11 |
| **red dot (48°)** | **0,580** | 0,75 | **1,29** |
| **luneta 2x (36°)** | **0,423** | 0,36 | **0,85** |
| luneta do sniper (30°) | 0,349 | 0,36 | 1,03 |
| **luneta do DMR (26°)** | **0,301** | 0,36 | **1,20** |

Leitura: no red dot o mesmo arrasto anda **29 % mais na tela** do que no
quadril; no DMR, 20 % mais; na 2x, 15 % menos. O degrau em 40° faz a
sensação mudar de arma para arma sem o jogador mudar nada.

### 3.4 Giroscópio — opcional em todos, e o padrão é "só na mira"

**CoD Mobile.** `[OFICIAL]` (§2.1)
> "Gyroscope – When turned on, all aiming and look controls will be defined by
> how you move your phone. Turning this on While ADS will only enable Gyroscope
> controls when aiming down sights."

**Warzone Mobile: desligado por padrão, com multiplicador por zoom.** `[OFICIAL]`
> "Turned off by default, this can be used to add some additional movement to
> your main controls, and there's a slightly higher learning curve."
> "offers an ADS sensitivity multiplier, including for every type of zoom
> (Low, 2x–3x, 4x–5x, 6x–7x, 8x, and High)."

**Fortnite: com o padrão, gyro só ao mirar; no Android, tocar a área de olhar
pode ligar/desligar o gyro.** `[OFICIAL]`
> "With gyro enabled and other settings at default, gyro is only active when
> aiming. This way, it simply adds onto traditional stick aiming, giving you a
> chance to get used to what gyro's best at: fine aiming adjustments."
> "On Android, a simple way to make sure you can control when gyro is active is
> by using the "Touch Effect" option. This lets you either enable or disable
> gyro while you are touching the look region of the screen."

**PUBG Mobile: teto de sensibilidade 400 %, gyro também em granada.** `[OFICIAL]`
1.1 — "Increased the max sensitivity of the gyroscope to 400." ·
<https://www.pubgmobile.com/en-US/m/news_detail/webplat/info/news_version3/35372/35373/35374/35386/35387/m20497/202009/868877.shtml>
— "Gyroscope is now also applied when using throwables."

**Unidade de sensibilidade de gyro que o autor defende: 1 = giro real.** `[OFICIAL — blog]`
> "a sensitivity of 1 should mean that if you turn the controller 37.5° to the
> left, your camera or aimer should turn 37.5° to the left."

**Na web o sensor existe, mas o iOS pede permissão num gesto e exige HTTPS.** `[OFICIAL — MDN]`
<https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/rotationRate>
> "returns the rate at which the device is rotating around each of its axes in
> degrees per second."

<https://developer.mozilla.org/en-US/docs/Web/API/DeviceMotionEvent/requestPermission_static>
> "Transient user activation is required. The user has to interact with the
> page or a UI element in order for this feature to work."
> "This feature is available only in secure contexts (HTTPS), in some or all
> supporting browsers."

### 3.5 Presets e códigos de compartilhamento

PUBG Mobile 1.1 — "A code for a player's control and sensitivity settings can
be generated and shared, enabling other players to replicate them." `[OFICIAL]`
· Free Fire OB52 — "Pro player HUD presets and share codes now include both HUD
and sensitivity settings." `[OFICIAL]`

---

## 4. Layout do HUD

### 4.1 CoD Mobile — muitos elementos, mas contextuais e com ARMA COMO ÍCONE

`[OFICIAL]` Mesma página do §2.1. A lista oficial do HUD de multiplayer tem 23
itens; o que importa é **como** eles se comportam:

**Armas são ícones tocáveis (não há botão "trocar arma"):**
> "6. Weapons: Two icons show your current weapon (leftmost weapon) and your
> stowed weapon (rightmost weapon). [...] Tapping the stowed weapon will take it
> out and make it the current weapon."

**Botões que só aparecem quando servem para algo:**
> "2. Grenade Cancel Button: After pulling out a grenade, this button will appear."
> "7. Weapon Swap: When passing over a weapon on the ground, this button will pop-up."
> "15. Knife/Throw Back Grenade: When an enemy gets within striking distance, a
> big knife icon will appear here."
> (BR) "5. Revive Teammate: When above a downed teammate, pressing this button
> will start the revival process." · "6. Open Door: When in front of a door,
> pressing this button will open it or close it." · "7. Get in Vehicle"

**Cura num botão só, com seta para ciclar; mochila num botão:**
> "4. Healing Items: Tap this button to use a healing item [...] A small upwards
> arrow will appear when you have more than one type of healing item, which will
> help you cycle through items."
> "3. Loadout: Tapping this button shows everything you are carrying on your soldier."

**Postura num botão só — toque, segurar, e deslizar correndo:**
> "11. Crouch/Prone/Stand/Slide: Tapping this button will bring your soldier to
> a crouched stance [...] Holding it will make a soldier go prone [...] Tapping
> it while sprinting will make your soldier slide to a crouch."

**Correr: botão de corrida automática OU analógico para a frente:**
> "18. Auto-Run: Tapping this button will make your soldier sprint forwards
> automatically. (Alternatively, you can sprint by tilting the Control Stick forward)"
> "Joystick Sprint – Enabling this will allow you to sprint forward by keeping
> the on-screen Joystick in the forward position"

**Automações e editor:**
> "Auto Loot – Toggle this on to have your soldier automatically loot
> recommended gear while playing in Battle Royale matches."
> "Auto Open Doors – When turned on, doors will automatically open when close
> to them in Battle Royale."
> "tapping the Custom Layout will bring you to a mock HUD where you can drag,
> drop, and change the size and opacity of everything on-screen."

### 4.2 Warzone Mobile — 8 presets, corrida travada acima do analógico, automações

`[OFICIAL]` (§1.7)
> "Look through the eight preset HUD displays to find the one that presents all
> the onscreen button locations that suit your play style. Each comes with a
> description — such as whether you hold a button to ADS (Aim Down Sights) or
> your sprint is auto-locked"
> "Automations: The game has most of your combat maneuvers auto-enabled to
> assist you while you learn how to play using touchscreen controls"
> "Some additional helpful settings allow you to lock Auto Sprint to a button
> above the virtual stick and provide flexibility when changing stance (either
> tapping Stance to Crouch and holding to go prone, or adding a button to split
> this stance change into two). [...] and even whether the virtual stick snaps
> to your finger"
> "Want to drag your firing buttons to the top-right corner because you hold
> your mobile device using the "claw" method? Then feel free!"

### 4.3 PUBG Mobile — correr é arrastar o analógico até a "posição de corrida"

`[OFICIAL]` Central de ajuda (§2.2):
> "Tap the "Running" icon on the bottom left corner or drag the "Cross" icon
> and hold in running mode."

Patch de 2020-09 (§3.4): "Use of Med Kits only end when the control is pushed
into the sprint position." · Patch 1.5 (2021-07,
<https://www.pubgmobile.com/webplat/info/news_version3/35372/60662/60663/60724/60725/60765/m22521/202107/894225.shtml>):
"If the ammo of a firearm has been used up (including spare ammo), and there is
another weapon that still has ammo, the character will automatically switch to
using this weapon." · Editorial do Google Play (§2.2): "Even actions like
carrying downed teammates, entering and exiting vehicles, and opening supply
drops can be placed anywhere on the screen you desire."

### 4.4 Fortnite — presets que "minimizam ícones" e interação por ícone grande

`[OFICIAL]` (§2.4)
> "Combat Pro is a slight adjustment to the Old School default HUD. This preset
> is a great layout for players who want to focus on combat and minimize icons
> taking up screen space."
> "Take total control of how Fortnite plays on your phone or tablet with the HUD
> Layout Tool. Simply move or resize buttons with ease or take more advanced
> steps and add/remove buttons to the HUD."
> (Easy Interact, o padrão de toque) "The goal of this mode was to improve the
> way players interact with items on Fortnite by creating larger and clearer
> icons for easier interaction."

### 4.5 Critical Ops — botão de pegar item que só aparece quando dá para pegar

`[OFICIAL]` Patch 1.70.0 (§3.1):
> "Added a new touch button and input for picking up items."
> "The touch button appears when you can pick up an item."

### 4.6 Tamanho mínimo de alvo de toque

Apple HIG — <https://developer.apple.com/design/human-interface-guidelines/buttons> `[OFICIAL]`
> "As a general rule, a button needs a hit region of at least 44x44 pt"

W3C WCAG 2.2, 2.5.5 (AAA) — <https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html> `[OFICIAL]`
> "The size of the target for pointer inputs is at least 44 by 44 CSS pixels"

W3C WCAG 2.2, 2.5.8 (AA) — <https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html>
> "The size of the target for pointer inputs is at least 24 by 24 CSS pixels"

O piso de 48 px deste jogo passa nos três; o problema do cluster não é
tamanho, é **quantidade fixa na zona do polegar** (§0: 318×156 px de 422 px de
largura).

---

## 5. O que NÃO foi encontrado

Procurei e não achei com fonte verificável — não usar como fato:

1. **Parâmetros numéricos da assistência de TOQUE em nenhum jogo móvel** (CoD
   Mobile, PUBG Mobile, Warzone Mobile, Apex Mobile, Free Fire, Blood Strike,
   Farlight 84). As fontes oficiais dão só: existe/não existe, chave
   liga/desliga, "coeficiente" por arma sem valor. Todo número de força e raio
   deste documento vem de console/controle (Lyra, Fortnite datamine, Insomniac,
   Destiny, The Finals, CoD console). Guias que afirmam "slowdown de X %" no CoD
   Mobile não citam fonte.
2. **Sensibilidade padrão de toque em unidade física** (°/px, °/cm, cm/360°)
   em qualquer AAA móvel. Os únicos padrões publicados são os do Critical Ops
   (3,0 / 1,2, sem unidade). Os "valores padrão 100 %" de CoD/PUBG são escalas
   internas sem conversão publicada.
3. **Curva de aceleração no toque** em CoD Mobile, PUBG Mobile, Warzone Mobile
   ou Fortnite. Só o Critical Ops documenta (3 %), sem publicar a fórmula.
4. **Documento oficial dizendo que ARRASTAR o botão de tiro gira a câmera no
   CoD Mobile.** O oficial só diz que o botão "move based on where your finger
   presses the screen"; que ele também gira a câmera ao arrastar é deduzido.
   No PUBG, a afirmação sobre o botão direito é de fonte secundária (§2.2); o
   oficial cobre só mira e espiada.
5. **Apex Legends Mobile**: jogo encerrado em 2023; não achei página oficial
   sobrevivente sobre assistência, HUD ou tiro. Só guias.
6. **Força da assistência de toque do Fortnite.** As páginas de ajuda da Epic
   sobre assistência devolveram 403 (inclusive via Internet Archive, que estava
   fora do ar). A afirmação de guia de que "Auto Fire tem assistência mais
   forte" não foi conferida.
7. **Valores 0,6 / 0,4 / 0,3 do Apex em fonte primária.** Respawn confirma o
   episódio sem número; o −25 % da S22 é oficial; 0,4 → 0,3 é conta de imprensa.
8. **Free Fire "Aim Precision" (Default / Precise on Scope / Full Control)**:
   só em guias; a página que o descrevia estava fora do ar para conferência.
9. **Standoff 2** declarando pessoalmente a ausência de assistência: só a
   Wikipedia, citando um guia russo.
10. **Limiar do "sprint lock"** (a que fração do raio do analógico a corrida
    trava) em qualquer jogo. O CoD fala em "forward position", o PUBG em
    "running mode"/"sprint position", sem número.
11. **Palestra GDC específica de assistência em TOQUE.** A Lightspeed (PUBG
    Mobile) apresentou "Exploring the Skill System Design in Shooting Games"
    na GDC 2024, mas o conteúdo não está acessível.
12. **Dado de alcance do polegar em paisagem** (zonas de conforto para
    cluster de botões em jogo) — não pesquisado a fundo; nada citável.

---

## 6. Recomendação para este jogo (priorizada)

Critério de prioridade: o que mais explica "mira ruim" no relato do dono,
pesando custo. Cada item diz o que tem **[LASTRO]** e o que é **[INFERÊNCIA]**.

### P0-1 — O botão ATIRAR também gira a câmera

**O defeito:** hoje o polegar direito escolhe entre mirar e atirar — nunca os
dois. Todo AAA de toque resolve isso de pelo menos uma de três formas.

- **[LASTRO]** Botão de tiro que segue o dedo e gira a câmera ao ser arrastado,
  com sensibilidade PRÓPRIA (Critical Ops 1.19: "FIRE BUTTON AIM
  SENSITIVITY"; ícone que "move along with your finger"). CoD Mobile: botão
  que se move para onde o dedo aperta, com opção de travar. PUBG Mobile:
  opção de os botões de mira e espiada girarem a câmera.
- **[LASTRO]** Segundo botão de tiro à ESQUERDA (padrão do PUBG Mobile; CoD
  Mobile e Critical Ops permitem), para quem quer mirar com o direito e atirar
  com o esquerdo.
- **[INFERÊNCIA]** Implementação: o `pointerdown` no ATIRAR captura o ponteiro
  e os deltas do `pointermove` desse mesmo ponteiro entram no mesmo
  `takeLook()` do olhar (multiplicados por um fator próprio, padrão 1,0 da
  sensibilidade de olhar). Nada muda no caminho do tiro.
- **Medida:** arrastar N px com o ATIRAR pressionado gira `N × 0,1833° × fator`
  em yaw E dispara no mesmo intervalo; reinjetar "o botão de tiro ignora
  pointermove" tem de deixar o teste vermelho com o ângulo medido.

### P0-2 — Assistência de mira só no toque, do lado da CÂMERA

- **[LASTRO]** Modelo: *slow* (reduz a velocidade de giro sobre o alvo) +
  *pull* que devolve uma fração do giro necessário para ACOMPANHAR o movimento
  relativo (Lyra). Não é "puxar para o centro" nem lock.
- **[LASTRO]** Só com o jogador mexendo: *slow* exige arrasto de olhar; *pull*
  aceita olhar ou andar, e andando sem olhar é escalado pelo strafe (Lyra
  `bRequireInput`, Insomniac 28:16, CoD BO7 com piso de −25 %).
- **[LASTRO]** Duas zonas (interna/externa) medidas contra a silhueta do alvo na
  tela, com tamanho mínimo para alvo longe (Insomniac 09:39; Lyra). Mais forte
  no ADS na zona interna (Lyra 0,7 vs 0,6). Histerese para o alvo anterior
  (Insomniac 10:09). Zona encolhe junto com o zoom (Lyra).
- **[LASTRO]** Menos assistência: varrendo vários alvos (decai em 0,5 s, zera
  após 40° sem acerto), alvo a menos de ~15 m (rampa a zero), luneta forte
  (−50 % de magnetismo na 6x), multiplayer (−15 %) (Insomniac). Nunca slow
  sem compensação — friction pura não alcança alvo rápido (Insomniac 12:53).
- **[LASTRO]** Desliga no mouse (Critical Ops, Halo, Lyra = só gamepad), no
  gyro (Fortnite, Jibb Smart) e — **[INFERÊNCIA]** — em XR.
- **[LASTRO]** Não assiste em quem o jogador não pode ver: "Aim assist will
  ignore invisible players" (The Finals); "no enemies are visible through
  walls" (WZM); o Lyra exige `bIsVisible`. **[INFERÊNCIA — crítica neste
  repo]** A assistência "grudar" em alguém deitado no mato ou atrás de parede
  é informação vazada — é a mesma classe do wallhack de grama que já foi
  deployado aqui. O teste de visibilidade tem de ser o mesmo que decide o que
  a tela mostra, e o caso "alvo escondido não freia a mira" precisa de teste
  com o defeito reinjetado.
- **[INFERÊNCIA]** Por que do lado da câmera e não entortando o projétil: o tiro
  tem TRÊS caminhos (hitscan, `__BR_ballistics`, foguete) e o anti-cheat do
  servidor valida os acertos. Mexer na orientação da câmera alcança os três de
  uma vez e não muda nada no protocolo. *Bullet magnetism* exigiria mexer nos
  três caminhos e na validação — e a Insomniac o desligava para projétil lento,
  que é o caso do BR (projéteis com velocidade). Fica fora da primeira versão.
- **[INFERÊNCIA]** Ponto de partida de força: a metade dos padrões do Lyra, que
  é o que o Fortnite rodou em produção em 2020 (pull 0,30/0,25 no quadril,
  0,35/0,20 no ADS); slow na mesma ordem. Sem assistência na bazuca e na faca
  (o Fortnite nem dispara automático com lançador e corpo a corpo); sniper/DMR
  com força reduzida. **Número a calibrar com jogador novato** (Insomniac 21:03),
  não com quem desenvolve.
- **[INFERÊNCIA]** Não pode criar `Object3D` no boot (o UUID consome o
  `Math.random` seedado e desloca o mundo) — usar vetores soltos.
- **Medida:** tempo até o alvo e erro angular médio rastreando um alvo que
  anda de lado, com e sem assistência, em graus; e o caso complementar "mouse
  não recebe assistência" com o mesmo cenário.

### P0-3 — Tiro automático como opção de toque

- **[LASTRO]** Warzone Mobile vem com "Default Auto" e sem botão de quadril;
  o Fortnite recomenda o Auto Fire a quem chega; o CoD Mobile tem o modo
  Simples com alcance limitável. Lista de exclusão do Fortnite: corpo a
  corpo, sniper, lançador, arremessável. WZM: "fire only at targets within the
  weapon's range".
- **[INFERÊNCIA]** Para as armas daqui: automático no fuzil, escopetas e plasma;
  manual em DMR, sniper, bazuca, faca, granada. Mesmo teste de visibilidade do
  P0-2 (não disparar em quem não aparece na tela).
- **Decisão do dono:** ligado por padrão para o celular (como WZM/Fortnite) ou
  desligado. O Standoff 2 é o exemplo de quem recusou — e declara isso.

### P1-4 — ADS escalado pela razão das tangentes

- **[LASTRO]** Lyra (toque e controle) e Fortnite (gyro) escalam pelo zoom com
  `tan(FOV/2)/tan(FOVbase/2)`; o comentário do Lyra chama de "the proper way".
- **[INFERÊNCIA]** Trocar o degrau `0,36/0,75` pela razão contínua corrige o red
  dot (+29 %), o DMR (+20 %) e a 2x (−15 %) da tabela do §3.3. Vale para mouse
  também, mas mudar o mouse muda a mão de quem já joga (o próprio Lyra recusou
  por isso) — decisão do dono; no toque não há hábito a preservar.
- **[LASTRO]** Opcional depois: multiplicador por faixa de luneta e o momento da
  troca (instantâneo / gradual / depois do zoom), como o WZM.

### P1-5 — Vertical mais lento que horizontal

- **[LASTRO]** 0,33 (Insomniac), 0,40 (Critical Ops no toque), 0,60 (Lyra).
  Este jogo: 1,00.
- **[INFERÊNCIA]** Padrão 0,5–0,6 e slider separado de X e Y. O arrasto
  diagonal fica curvado para a horizontal — medir o ângulo pedido vs o andado
  para não repetir o defeito de diagonal que o VR já teve.

### P1-6 — Menu de sensibilidade do toque

- **[LASTRO]** Todos os AAA oferecem: sensibilidade de olhar (X/Y), ADS por
  mira, sensibilidade do botão de tiro que gira (Critical Ops), liga/desliga de
  assistência, modo de tiro; CoD Mobile tem presets; PUBG e Free Fire
  compartilham por código.
- **[INFERÊNCIA]** Mínimo viável: olhar, razão Y/X, ADS, botão-de-tiro-mira,
  assistência liga/desliga, modo de tiro. Guardar em `localStorage` com
  try/catch (preferência por jogador).

### P2-7 — HUD: menos botão fixo na zona do polegar

- **[LASTRO]** Botões contextuais que só aparecem quando servem (CoD Mobile:
  trocar arma do chão, faca, reviver, porta, veículo; Critical Ops: pegar
  item). Armas como ícones tocáveis (CoD Mobile). Cura num botão só com
  ciclo (CoD Mobile BR). Postura num botão: toque agacha, segura deita,
  toque correndo desliza (CoD Mobile, WZM). Editor de HUD com arrastar,
  tamanho e opacidade, e presets (CoD Mobile, WZM com 8, Fortnite, PUBG).
- **[INFERÊNCIA]** Candidatos a sair da zona do polegar ou virar contextuais:
  USAR (só perto de algo usável), COMER (só com comida), CHAT, PAUSA,
  INVENTÁRIO (para a borda), TROCAR ARMA (vira os ícones das armas). O ATIRAR
  sobe para a área de olhar e passa a arrastar (P0-1). Isso devolve área de
  olhar ao polegar direito.
- **[LASTRO]** Corrida travável: além de "segurar acima de 0,85", uma trava ao
  arrastar até uma posição acima do analógico (PUBG "running mode"; WZM "lock
  Auto Sprint to a button above the virtual stick").

### P2-8 — Modos de ADS

- **[LASTRO]** Segurar vs alternar (WZM); no sniper/DMR, "segurar a mira para
  mirar, soltar para atirar" como padrão de novato (Critical Ops); ADS
  automático ao atirar por arma (CoD Mobile "1-tap ADS or Hip Fire by weapon").

### P3-9 — Giroscópio opcional

- **[LASTRO]** Desligado por padrão (WZM), só na mira quando ligado (Fortnite,
  CoD Mobile "While ADS"), 1,0 = giro real (Jibb Smart), e desliga a
  assistência (Fortnite). Na web: `DeviceMotionEvent.rotationRate` em °/s; no
  iOS `requestPermission()` num toque do usuário e só em HTTPS (MDN).

### P3-10 — Aceleração de olhar: não por padrão

- **[LASTRO fraco para toque]** Só o Critical Ops documenta aceleração no toque
  (3 %), e já teve o defeito "dependent on framerate". A Insomniac acelera só
  na subida e freia instantâneo.
- **[INFERÊNCIA]** Se entrar, entra como opção, independente de dt, e depois
  dos itens acima — ela muda a relação px→grau que o P1-4 e o P1-5 fixam.

### Ordem sugerida

P0-1 e P1-4 são baratos e não dependem de nada. P0-2 é o maior e o que mais
muda a sensação; precisa do teste de visibilidade antes de qualquer força.
P0-3 depende do mesmo teste de visibilidade do P0-2. P2-7 depende do P0-1
(o ATIRAR sai do cluster).
