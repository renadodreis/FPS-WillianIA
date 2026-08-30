<title>Referência de interação em VR</title>

# Referência de interação em VR — agarrar e verbos sem botão

Data: 2026-08-27 · base `dev` @ `fa9ed86` · three r0.185.1 · IWER 2.3.0
Alvo: Meta Quest 3, WebXR, controles `meta-quest-touch-plus`.

Este documento é a base de referência do desenho de interação. Ele existe
porque duas decisões deste porte não podem ser inventadas: **qual botão pega**
(critério D3) e **onde moram os quatro verbos que sobraram sem botão**
(critério D1). Cada decisão abaixo tem fonte, e cada fonte foi lida — não é
lembrança.

---

## 1. Quantos botões o Touch REALMENTE entrega ao WebXR

O registro oficial de perfis de input do W3C descreve o `meta-quest-touch-plus`
assim (índices do `Gamepad`, iguais nas duas mãos salvo onde indicado):

| Componente | Tipo | `buttons[]` | `axes[]` |
|---|---|---|---|
| `xr-standard-trigger` | trigger | **0** | — |
| `xr-standard-squeeze` | squeeze (empunhadura) | **1** | — |
| *(reservado)* | — | 2 (`null`) | 0 e 1 (`null`) |
| `xr-standard-thumbstick` | thumbstick | **3** (clique) | **2** (x), **3** (y) |
| `x-button` / `a-button` | button | **4** | — |
| `y-button` / `b-button` | button | **5** | — |
| `thumbrest` | button | 6 | — |
| `menu` (só na mão esquerda) | button | 7 | — |

Fonte: [`webxr-input-profiles`, perfil `meta/meta-quest-touch-plus.json`](https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/main/packages/registry/profiles/meta/meta-quest-touch-plus.json)

**Duas armadilhas que o registro sozinho esconde:**

1. **O índice 7 (`menu`) não pode ser usado.** A especificação de gamepads do
   WebXR é literal: *"Buttons reserved by the UA or platform MUST NOT be exposed
   on the Gamepad."* O botão de menu é do sistema — contar com ele é desenhar um
   verbo que nunca dispara no aparelho.
   Fonte: [W3C, WebXR Gamepads Module — Level 1](https://www.w3.org/TR/webxr-gamepads-module-1/)
2. **O índice 6 (`thumbrest`) é capacitivo.** Ele reporta *toque*, não
   *pressão* — o polegar descansando ali já o "aperta". Não serve de verbo.

**Conclusão operacional: são 5 botões pressionáveis por mão — 0, 1, 3, 4, 5 —
e 10 no total.** Esse é o orçamento fechado dentro do qual todo o resto tem de
caber. É por isso que D1 é desenho, e não conserto: **não há botão sobrando.**

Os eixos 0/1 são do touchpad, que o Touch não tem; ler 0/1 dá analógico morto no
aparelho. Isso já está documentado no cabeçalho de `js/xr/xrinput.js` e continua
valendo.

---

## 2. Qual botão pega: a resposta é a EMPUNHADURA, e não é opinião

### 2.1 A regra da loja

> *"When picking up objects within the app, use the Touch controller's grip
> button rather than the trigger button."*

É a **VRC.Quest.Input.2**. Status: era obrigatória e virou **recomendada** em
2022‑03‑01 — recomendada, mas é a linha explícita da plataforma sobre o assunto,
e o critério `docs/vr/criterio-aaa.md` a adota como régua.
Fonte: [Meta, VRC.Quest.Input.2](https://developers.meta.com/horizon/resources/vrc-quest-input-2/)

### 2.2 O SDK WebXR da própria Meta faz isso

O *Immersive Web SDK* é o SDK WebXR que a Meta publica. O sistema de agarre
roteia o evento pelo canal **`squeeze`** — a empunhadura — e não pelo `select`
(gatilho):

```ts
this.input.xr.multiPointers[handedness].routeDown('squeeze', 'grab', …)
```

Fonte: [`facebook/immersive-web-sdk`, `packages/core/src/grab/grab-system.ts`](https://raw.githubusercontent.com/facebook/immersive-web-sdk/main/packages/core/src/grab/grab-system.ts)

### 2.3 Os kits de VR de produção fazem isso

- **SteamVR Unity Plugin (Valve).** `Hand.cs` define dois `GrabTypes` (`Pinch` e
  `Grip`), e **`Grip` é o padrão** quando nenhum tipo é pedido explicitamente
  (linhas 990–1004).
  Fonte: [`ValveSoftware/steamvr_unity_plugin`, `Hand.cs`](https://raw.githubusercontent.com/ValveSoftware/steamvr_unity_plugin/master/Assets/SteamVR/InteractionSystem/Core/Scripts/Hand.cs)
- **Godot XR Tools.** `function_pickup.gd` tem `pickup_axis_action`, com valor
  padrão **`"grip"`**.
  Fonte: [`GodotVR/godot-xr-tools`, `function_pickup.gd`](https://raw.githubusercontent.com/GodotVR/godot-xr-tools/master/addons/godot-xr-tools/functions/function_pickup.gd)

Três fontes independentes, um resultado só. **O verbo de agarrar é o grip.**

---

## 3. A que distância se agarra

### 3.1 Os números que os kits usam

| Kit | Constante | Valor |
|---|---|---|
| SteamVR (Valve) | `hoverSphereRadius` | **0,05 m** |
| SteamVR (Valve) | `controllerHoverRadius` | **0,075 m** |
| SteamVR (Valve) | `fingerJointHoverRadius` | 0,025 m |
| Godot XR Tools | `grab_distance` (grab direto) | 0,30 m |
| Godot XR Tools | `ranged_distance` (agarre à distância) | **5,0 m** |
| Godot XR Tools | `ranged_angle` (cone do agarre à distância) | **5°** |

Fontes: `Hand.cs` (linhas 73/76/79) e `function_pickup.gd`, links acima.

O critério D3 pede **5 a 10 cm**. O `controllerHoverRadius = 0,075` da Valve
está no meio dessa faixa e é o valor para *controle na mão* (o 0,05 é da esfera
de hover da mão rastreada; o 0,025 é por articulação de dedo). **Adotado:
0,075 m.**

### 3.2 A distância é até a CASCA, não até o centro

Este é o detalhe que separa "passa no teste" de "funciona no headset". Os kits
medem contra **colisores**: no Godot são duas geometrias distintas (uma esfera
para o grab direto, um cilindro para o agarre à distância); no SteamVR o hover é
uma esfera testada contra os colisores do objeto.

Se o jogo medisse do centro do objeto, **nada com volume seria agarrável**: a
mão nunca chega a 7,5 cm do centro de um carro. Cada alvo declara então um raio
de casca — o equivalente barato do colisor — e a conta é
`distância(mão, centro) − raioCasca ≤ 0,075 m`.

### 3.3 Agarre à distância é OUTRO verbo, não um raio maior

A Meta trata `Distance Grab` como modo **separado** do grab direto, com três
métodos próprios (*Interactable to Hand*, *Anchor at Hand*, *Hand to
Interactable*), e recomenda explicitamente:

> *"Implement magnetism to make targeting simpler and more satisfying."*
> *"Use visual affordances such as a cursor and/or object-specific hover states."*

Fonte: [Meta Design, Hands — Interaction types](https://developers.meta.com/horizon/design/hands-interaction-types/)

E o motivo de existir é ergonômico, não preguiça:

> *"For objects out of a user's reach, raycasting comes in very handy when
> selecting objects. Distance Grab is also another great way to make it easy for
> users to interact with the object, **without needing to walk up to it or reach
> out to it**."*
> *"make sure the user can remain in a neutral body position as much as
> possible."*

Fonte: [Meta, Interaction SDK — building intuitive VR experiences](https://developers.meta.com/horizon/blog/interaction-sdk-building-intuitive-vr-experiences-tools-resources/)

Isso amarra com o critério **D6** (tudo alcançável de uma posição fixa): sem
agarre à distância, entrar no carro exigiria passo físico.

### 3.4 O gesto do agarre à distância: o flick de Half‑Life: Alyx

Alyx é a referência do gênero e o critério D3 a cita. As *gravity gloves*
funcionam por **apontar e dar um puxão de pulso**:

> *"executing a simple flick of the wrist to summon an object to your hand with
> a well-timed catch"*

Fonte: [UploadVR, análise de Half‑Life: Alyx](https://www.uploadvr.com/half-life-alyx-review/)

O flick é o que dá a sensação; **mas ele não pode ser a única via.** Um jogador
sentado, com braço apoiado, ou com mobilidade reduzida, pode não produzir a
aceleração — e a diretriz de acessibilidade da Meta manda não exigir amplitude
de movimento. Por isso o agarre à distância aceita **duas confirmações do mesmo
verbo**: o **flick** (rápido, satisfatório) ou **manter o grip apontado** por um
tempo curto (garantido). É a mesma dupla "quick pull / hold pull" que os FPS de
VR oferecem para pegar arma do chão.

---

## 4. Onde moram os quatro verbos que sobraram (D1)

### 4.1 O orçamento não fecha, e isso é fato aritmético

Com os 10 botões reais da §1, o mapa antes desta rodada era: gatilho direito
(atirar), grip direito (mirar), A (pular), B (trocar arma), gatilho esquerdo
(interagir), grip esquerdo (agachar), X (usar), Y (recarregar), clique do
analógico esquerdo (correr), **clique do analógico direito (pausa)**.

Dez botões, dez donos. **Zero livres.** Faltam quatro verbos: granada (`KeyG`),
kit médico (`KeyQ`), comer (`KeyF`), acessório de mira (`KeyT`). Não existe
mapeamento 1:1 possível — a saída é um **seletor**.

O botão para o seletor não foi encontrado: foi **fabricado** pela correção de
D3. Ao mover o agarrar do gatilho para a empunhadura, o gatilho esquerdo ficou
vago; agachar desceu para o clique do analógico esquerdo, e correr foi para o
batente do analógico, que não custa botão.

### 4.2 Dois palpites óbvios, os dois medidos e os dois errados

**"Usa o clique do analógico direito."** É o palpite natural — parece livre.
Não é: `js/xr/xrui.js` (`BOTAO_MENU = 3`) abre ali o painel de pausa, que a loja
exige (**VRC.Quest.Functional.2**). Foi testado em sessão imersiva real: apertar
esse botão abre a pausa, o tick do mundo para, e o verbo do radial **nem chega a
ser despachado**. O defeito mascara o próprio sintoma — um teste de efeito passa
verde com o radial quebrado. Quem o pega é o teste unitário, que lê a intenção
antes de o jogo pausar.

**"A fatia sai do analógico direito."** Também não: esse é o analógico do giro
em passos. Empurrar para o lado para alcançar a fatia da direita dá um passo de
**45° (0,785 rad)** na cara do jogador no meio do menu. E o giro que vale é lido
por `js/xr/xrturn.js` direto das fontes, num caminho que a camada de entrada não
controla — não dá para suspendê-lo de dentro.

**Resultado: botão e fatia ficam os dois na mão de apoio.** O analógico do giro
não é tocado, e o problema deixa de existir em vez de ser contornado.

### 4.3 Por que um radial, e por que quatro fatias

O que a pesquisa em ergonomia de MR diz sobre menus rápidos:

> *"**Keep the number of buttons small.** Because of the close distance between a
> hand-locked menu and the eyes, and the tendency for users to focus on a
> relatively small visual area at any time (the attentional cone of vision is
> roughly 10 degrees), we recommend keeping the number of buttons small. Based on
> our exploration, one column with three buttons works well."*
>
> *"**Use hand menu for quick action.** Raising an arm and maintaining the
> position could easily cause arm fatigue. Use a hand-locked method for the menu
> requiring a short interaction."*

Fonte: [Microsoft Learn, Hand menu — Mixed Reality](https://learn.microsoft.com/en-us/windows/mixed-reality/design/hand-menu)

Três consequências diretas:

1. **Poucas fatias.** Quatro é o teto — e quatro é exatamente o que falta. As
   quatro direções cardeais do analógico são discrimináveis sem olhar.
2. **Interação curta.** Abre, escolhe, fecha. Nada de navegar submenu segurando
   o braço no ar.
3. **Sem levantar o braço.** O polegar já está no analógico. Nenhum gesto novo,
   nenhuma pose mantida, nenhuma mão levada ao pulso oposto.

### 4.4 O desenho

**Segurar o gatilho da mão de apoio abre o radial. O analógico da mesma mão
escolhe a fatia. Soltar confirma.** Soltar com o analógico no centro cancela.

| Direção | Verbo | Tecla |
|---|---|---|
| Cima | Lançar granada | `KeyG` |
| Direita | Usar kit médico | `KeyQ` |
| Baixo | Comer | `KeyF` |
| Esquerda | Trocar acessório de mira | `KeyT` |

Histerese: entra na fatia acima de 0,5 de inclinação, larga a fatia abaixo de
0,3 — pelo mesmo motivo da zona morta do andar (o analógico do Touch descansa em
±0,1 e a fatia não pode piscar sozinha entre dois verbos).

Confirmação **só no soltar**. Confirmar enquanto o polegar está na fatia foi
medido em sessão real: **55 disparos em 0,9 s** — o jogador esvaziaria o
inventário só de olhar o menu.

### 4.5 O analógico é o mesmo de andar, e isso cobrou dois consertos

Os dois só apareceram em sessão imersiva real; nenhum foi previsto no papel.

1. **A fatia É o batente, e o batente é a corrida.** Alcançar uma fatia empurra
   o analógico até o fim — exatamente o que liga o correr. Escolher qualquer
   verbo mandava um `ShiftLeft` junto: o jogador confirmava o item já em
   disparada. Correr entrou na mesma suspensão do andar.
2. **Soltar com o polegar ainda na direção fazia sair andando.** O jogador
   confirma "granada" com o polegar para cima; no frame seguinte o radial já
   fechou e o analógico continua no batente — e ele dispara para a frente sem
   ter pedido. A correção é um **rearme da locomoção**, igual ao do giro em
   passos: o analógico precisa passar pelo centro para voltar a valer como
   pernas.

**Custo assumido, dito na cara:** o gatilho da mão de apoio deixa de estar livre
para qualquer verbo futuro — era o último slot do Touch. Qualquer ação nova daqui
em diante entra como fatia do radial, não como botão. E enquanto o menu está
aberto o jogador não anda: é o comportamento desejado num menu de ação rápida,
mas é uma parada, e ela existe.

---

## 5. O mapa de botões depois desta rodada

| Botão | Mão esquerda | Mão direita |
|---|---|---|
| 0 · gatilho | **abrir o radial** *(era interagir)* | atirar |
| 1 · empunhadura | **agarrar** *(era agachar)* | mirar |
| 3 · clique do analógico | **agachar** *(era correr)* | pausa *(inalterado)* |
| 4 · X / A | usar (`KeyE`) | pular |
| 5 · Y / B | recarregar | trocar de arma |
| eixos 2/3 | andar · **correr no batente** · **fatia do radial** | girar |

**Correr passou do clique do analógico para o batente do analógico**
(inclinação ≥ 0,92). É a convenção do gênero — empurrar até o fim para correr —
e é o que libera o clique para o agachar, que por sua vez libera a empunhadura
para o verbo que a plataforma manda pôr nela. Agachar continua tendo a via
física (`XR.corpo.agachado`, na ponte do `game.js`), então quem agacha de verdade
não depende de botão nenhum.

**O analógico direito não mudou em nada.** Giro em passos e pausa continuam
exatamente onde estavam. Foi condição de projeto, não coincidência.

## 6. O que NÃO foi adotado, e por quê

- **Inventário corporal (ombro/cintura), como em Alyx e Onward.** É o padrão mais
  imersivo e seria o próximo passo natural. Foi descartado nesta rodada porque
  depende da pose do corpo (`js/xr/xrbody.js`), que é de outra frente, e porque
  a Meta é explícita quanto a *"avoid forcing users to reach out to objects
  outside of the tracking volume"* — um slot de cintura mal calibrado fica fora
  do volume rastreado num jogador sentado. Um radial não tem esse risco.
- **Botão `menu` (índice 7) como quinto verbo.** Proibido pela especificação
  (§1). Teria passado em qualquer teste de dublê e morrido no aparelho.
- **Radial no clique do analógico direito.** É a pausa (§4.2), medido em sessão
  real. Teria "funcionado" em todo teste de efeito, porque a pausa que ele abre
  congela o jogo antes de o verbo sair.
- **Cone de 5° para o agarre à distância, como o Godot XR Tools.** Cinco graus
  é apertado demais sem um raio visível saindo da mão. Mantido o cone de 35° já
  existente, que é a forma de "magnetismo" que a Meta recomenda para tornar a
  mira mais simples e satisfatória.
- **Agarre à distância com alcance próprio (5 m, como o Godot).** O alcance do
  agarre à distância aqui é o **alcance de gameplay que o jogo já tem** — nem um
  centímetro a mais. Ampliar seria abrir vetor de trapaça
  (`test/security-regression.test.js`), e o critério D2 cobra a mesma coisa do
  outro lado.

---

# Parte II — o radial que se VÊ, e de onde se mede o alcance

Data desta parte: 2026-08-27 · base `dev` @ `2d55610`.

A Parte I decidiu **qual botão** e **quais verbos**. Ela deixou dois buracos, e
os dois viraram defeito medido:

1. **O radial não tem nada visível.** A máquina de estado ficou pronta e testada
   (`criarRadialXR`, `js/xr/xrinput.js`), e o jogador aperta o gatilho e não vê
   menu nenhum: não sabe quais fatias existem, qual está selecionada, nem que
   soltar no centro cancela. O critério **D4** cobra affordance DENTRO do
   mundo — dentro de uma sessão `immersive-vr` sem `dom-overlay` o DOM não
   chega ao compositor.
2. **O alcance é medido do CORPO, e o corpo agora para na parede.** Até
   `2d55610` o colisor seguia a cabeça sempre; agora ele PARA quando o jogador
   anda fisicamente contra um sólido, e a separação cabeça↔corpo deixou de ser
   transitória.

---

## 7. Onde o radial aparece — e por que NÃO é no pulso

### 7.1 A fonte que mudou o desenho

O palpite natural — "prende o menu no pulso da mão que abriu" — é
**desaconselhado pela própria Meta**, com as duas metades ditas na mesma
página:

> *"**Avoid anchoring menus to an active, moving wrist**"* — o motivo dado é
> *"missed inputs and accidental triggers"*.
>
> *"**Spawning a menu from the wrist … is fine, as long as the menu is static
> once it appears and is positioned in world space rather than following the
> wrist.**"*

Fonte: [Meta Horizon Design — Hands UI best
practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/)

Ou seja, a regra não é "cabeça ou pulso". São TRÊS coisas separadas:

| | segue a cabeça? | segue o pulso? | fica parado? |
|---|---|---|---|
| HUD preso na cara | sim | — | não |
| menu preso no pulso | — | sim | não |
| **o que a Meta pede** | **não** | **não** | **sim, depois de nascer** |

E o outro lado da mesma regra, que já estava na régua:

> *"**Avoid locking HUD style content to the user's head movements.**"* — e a
> alternativa oferecida na mesma página é *"Anchor information and digital
> content to a space, or loosely follow the user using smoothing animation."*

Fonte: [Meta Horizon Design — MR design
guidelines](https://developers.meta.com/horizon/design/mr-design-guideline)

### 7.2 A que distância

A Meta dá três números, e eles não são o mesmo número:

> *"Position UI **between 42cm and 46cm** from the user when you want to
> encourage touch."* · *"Ray casting or indirect interaction is comfortable
> from roughly **0.46m to 3m**."*
> — [Hands UI best practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/)

> *"objects that the user will be fixating their eyes on for an extended period
> of time should be rendered **at least 0.5 meters** away"* · *"Many have found
> that **1 meter** is a comfortable distance for menus and GUIs that users may
> focus on for extended periods of time."*
> — [Meta Horizon Design — Display](https://developers.meta.com/horizon/design/display)

A causa raiz do desconforto de proximidade está dita na mesma página do
display: *"Fully immersive experiences create an unusual situation that
decouples accommodative and vergence demands, where accommodative demand is
fixed but vergence demand can change."*

**O radial não é leitura prolongada — é ação rápida** (§4.3: *"Use hand menu for
quick action"*). Então o número que vale é o de perto, **0,42 m**, e não o de
menu de leitura (0,5–1 m): mais longe que isso e o disco deixa de estar onde a
mão está, que é o que anuncia de quem ele é.

### 7.3 O desenho, item por item

**O disco nasce na DIREÇÃO da mão que abriu, a 0,42 m do olho no mínimo, e
congela ali enquanto o radial estiver aberto.**

- **Nasce da mão** — é o *"spawning a menu from the wrist"* que a Meta permite.
  A direção é a do olho para a mão; quem abriu o menu está dito pela geometria,
  sem seta nem legenda.
- **Congela** — é o *"static once it appears"*. Tremor de pulso não sacode o
  texto, e o polegar pode empurrar o analógico sem arrastar o alvo de leitura
  junto.
- **Não segue a cabeça** — virar o pescoço não move o disco. É o
  *"avoid locking HUD style content to the user's head movements"*.
- **Congela contra o CORPO, não contra o mundo absoluto.** O ponto guardado é o
  deslocamento até `player.pos`. Num veículo, ou num jogador que anda
  fisicamente durante a escolha, o disco viaja junto em vez de ficar plantado no
  chão — é o *"loosely follow the user"* da mesma página da Meta, e é o mínimo
  para um menu que existe por menos de um segundo.
- **Piso duro de 0,15 m do olho (I3).** Congelado, o disco não persegue o
  jogador — mas o jogador pode avançar a cabeça para cima dele. Quando a cabeça
  chega a menos de **0,30 m**, o disco é empurrado de volta para 0,30 m ao
  longo do eixo olho→disco. É guarda de segurança, não comportamento normal: a
  distância de nascimento é 0,42 m, então ele só age se o jogador avançar 12 cm
  com o menu aberto.

### 7.4 O tamanho do texto é medido em GRAUS

O padrão desta base (`js/xr/xrhud.js`) é **0,7° de altura de maiúscula** como
alvo e 0,35–0,4° como piso. A Meta não publica um número angular para corpo de
texto — o mais próximo que ela publica é para alvo de toque:

> *"Comfortably-sized hit targets should be a minimum of 22mm x 22mm / 48dp x
> 48dp / **3˚FOV at 0.42m**."*
> — [Meta Horizon Design — Accessibility](https://developers.meta.com/horizon/design/accessibility)

Duas consequências:

1. **A fatia inteira é um alvo**, e cada fatia deste disco mede bem mais de 3°
   de FOV a 0,42 m — o disco todo tem 0,15 m de diâmetro, que dá 20,4° a essa
   distância, e cada uma das quatro fatias fica com um quadrante disso.
2. **O glifo é dimensionado pelo ângulo**, não pelo canvas: a mesma conta do
   `js/xr/xrhud.js` (`2·atan((h/2)/d)`), medida na distância real da sessão.

Contraste segue WCAG 2.1, que é o que a mesma página de acessibilidade adota:
*"Normal text: 4.5:1 contrast ratio minimum"*.

### 7.5 O que a pesquisa NÃO conseguiu confirmar

Registrado de propósito, para ninguém tratar lembrança como fonte:

- **Onde exatamente Half-Life: Alyx, Into the Radius, Boneworks/Bonelab e
  The Walking Dead: Saints & Sinners ancoram o inventário.** Nenhuma fonte
  citável foi acessível na rodada de pesquisa (Fandom 402, PCGamingWiki 403,
  Valve Developer Wiki 403, GDC Vault com login). O conhecimento geral —
  "pistola no quadril, espingarda no ombro, munição na mochila" — **não entrou
  nesta decisão**, porque não foi verificado.
- **Como esses jogos destacam a fatia selecionada e como cancelam.** Sem fonte.
- A única coisa citável do Alyx é a mecânica de puxar a distância: *"Like the
  gravity gun from Half-Life 2, the gravity gloves allow players to pick up
  objects from a distance."*
  ([Wikipedia](https://en.wikipedia.org/wiki/Half-Life:_Alyx)) — já usada na
  §3.4, e não diz nada sobre menu.

A decisão da §7.3 se apoia **inteira** em documentação oficial da Meta, que é
mais forte do que a imitação de um jogo: a mesma página que proíbe o pulso em
movimento é a que autoriza nascer dele.

---

## 8. De onde se mede o alcance quando a cabeça e o corpo se separam

### 8.1 O que mudou, em número

Até `2d55610` o colisor seguia a cabeça 1:1 e a separação era ruído: **0,0131 m
no pior frame de 1799** de sessão normal (laudo de `fa9ed86`). É por isso que o
critério **D2** está VERDE hoje com `js/interact.js` medindo de `player.pos` —
medir do corpo e medir da cabeça davam o mesmo número.

`2d55610` mudou a física do caso-limite, e mudou por um motivo que não se
discute: o passo recusado voltava para o colisor e ele **atravessava 10,9623 m
num pedido de 10 m**. Agora a parede segura o corpo e a cabeça segue — e o
"fora do mundo" é DESENHADO (`js/xr/xrcomfort.js`), como o `head_behavior_mode:
Fade` do Godot XR Tools.

A Meta descreve os dois lados desse problema:

> *"If a user walks into a virtual wall, the camera stops, but the user's
> physical world movement continues, creating a disorienting experience."*
>
> *"**Disable rendering in invalid spaces:** If the camera moves into an invalid
> area, such as inside a wall, the display could show a blank screen or visual
> effects to guide the user back."*
> — [Meta Horizon Design — Locomotion in virtual
> environments](https://developers.meta.com/horizon/design/locomotion-virtual-environments/)

### 8.2 A identidade que decide tudo

Lendo `place()` (`js/xr/xrrig.js`), a posição de mundo da cabeça é, literalmente:

```
cabeça = player.pos + passoPendente + fora
```

- `passoPendente` é o passo físico que o jogo ainda não absorveu. Ele é drenado
  todo frame ANTES da física (`game.js:3478`), com teto de 0,15 m por frame — a
  72 Hz uma caminhada rápida gasta ~2 cm por frame, então isto fica perto de
  zero o tempo todo.
- `fora` é **exatamente o que o mundo RECUSOU**: só cresce em
  `devolverPasso()`, e `devolverPasso()` só é chamado com a componente do passo
  que a colisão do jogo desfez (`game.js:3647`).

Logo: **a diferença entre "medir da cabeça" e "medir do corpo" É, ponto por
ponto, o que a parede negou ao corpo do jogador.** Não é uma escolha de gosto
entre duas réguas; é uma escolha entre devolver ou não devolver ao jogador o
alcance que o mundo acabou de recusar.

### 8.3 A régua escolhida

**O alcance é medido da CABEÇA, descontado o que o mundo recusou:**

```
ref.xz = cabeça.xz − fora   (ao longo do eixo corpo→cabeça)
ref.y  = player.pos.y
```

com um **teto absoluto** de 0,35 m de afastamento do corpo como segunda trava.

Por que cada pedaço:

- **Mede da cabeça** — é o que o D2 cobra ao pé da letra (*"Reprova: decisão a
  partir de `player.pos`"*), e é o que corresponde ao mundo real do usuário
  (VRC.Quest.Input.3).
- **Desconta o recusado** — sem isso a régua entrega alcance por parede. Não é
  hipótese: a separação medida na parede chega a **2,5 m** num teste de 3 m de
  caminhada (`test/xr-parede.test.js`), e o servidor **não valida distância de
  baú** (`server.js`, `openChest`: valida vivo, fase, repetição e um limite de
  300 ms entre baús — distância, nenhuma). A régua do cliente é a única trava
  que existe nesse caminho.
- **Só X/Z** — `fora` só existe no plano horizontal (o rig só recusa passo
  horizontal). Levar o Y da cabeça para a conta mudaria em ~1,6 m a esfera de
  5 m do helicóptero e a banda de 3,5 m da bazuca — retoque de gameplay que
  ninguém pediu, disfarçado de correção de VR.
- **Teto de 0,35 m** — fica acima do pico de encosto de parede medido
  (0,133 m) e abaixo do ponto em que a tela já está preta (`FORA_MAX = 0,50 m`
  em `js/xr/xrcomfort.js`). É a trava que sobrevive se um dia aparecer
  separação que o `fora` não explique.

### 8.4 Quanto isso custa ao jogador — a conta honesta

A objeção legítima contra descontar é: *"o jogador vê um baú ao alcance do
braço e o jogo nega"*. A conta:

- o raio do baú é **2,4 m** — muito maior que qualquer parede do jogo;
- para o desconto NEGAR alguma coisa, o baú tem de estar entre 2,4 m e
  2,4 m + separação, medido do corpo;
- e a separação só passa de 0,20 m com a **tela já escurecendo**
  (`FORA_MIN = 0,20`), chegando a preto em 0,50 m.

Ou seja: a faixa negada existe apenas enquanto o jogador está com a cabeça
dentro de um sólido e a vista apagando. **Em jogo normal a faixa negada tem
1,3 cm de largura** — a separação medida no pior frame de 1799.

### 8.5 O que NÃO foi adotado

- **Medir da cabeça sem desconto.** Entrega ao jogador exatamente o alcance que
  a parede negou. Com baú sem validação de distância no servidor, é vetor de
  trapaça, não conforto.
- **O menor dos dois (cabeça ou corpo).** É estritamente mais permissivo que
  qualquer um dos dois isolados — abre o mesmo vetor por outro nome.
- **Exigir linha de visão (raycast sem sólido no meio).** Seria a trava certa se
  o desconto não existisse; com o desconto, o ganho por parede já é **zero por
  construção**, e um raycast de cena por frame não cabe num orçamento que está
  4,3× acima do teto de draw calls (`docs/vr/perf-xr.md`). Fica registrado como
  a saída caso o modelo de `fora` mude.
- **Mexer nos raios (2,4 / 2,8 / 4,5 / 5 m).** Nenhum número de gameplay muda
  nesta rodada. Ampliar alcance é o que `test/security-regression.test.js`
  existe para pegar.

---

## 9. O que a medição devolveu

Tudo abaixo saiu de sessão `immersive-vr` de verdade (IWER + Chrome), pelo loop
do próprio `game.js` — nenhum condutor de teste dirigindo o módulo. Arquivos:
`test/xr-radial.test.js` (porta 3580) e `test/xr-alcance.test.js` (porta 3582).

### 9.1 O radial

| O que | Medido | Se estivesse errado |
|---|---|---|
| Nasce na direção da mão | **0,00°** de desvio, a **0,471 m** do olho | preso na cara: 57,90° |
| Segue o pulso? | mão andou 0,528 m, disco andou **0,0000 m** | pendurado no pulso: 0,5281 m |
| Segue a cabeça? | pescoço girou 40°, disco andou **0,0163 m** | preso na cara: 0,322 m |
| Fatia escolhida acende | luma **176** contra **12,3** das outras | sem destaque: 12,3 contra 12,3 |
| Miolo acende ao cancelar | luma **148,9** contra 12,3 | miolo apagado: 12,5 contra 12,3 |
| Menor maiúscula | **0,92°** a 0,471 m (**0,79°** no teto de 0,55 m) | fonte de 14 px: 0,43° |
| Disco inteiro | **21,6°** de FOV; cada fatia ≈ 10,8° | a Meta pede ≥ 3° para alvo |
| I3, abrindo com a mão na cara | nasce a **0,420 m** | — |
| I3, cabeça avançando 0,80 m | para em **0,300 m** | sem o guarda: **0,054 m** |
| Custo | **1 draw call por olho** (2 no estéreo, mediana de 15, 3 rodadas) | invisível: mediana 0 |

O `0,0163 m` da virada de pescoço não é folga do guarda: é a câmera de UNIÃO
do three andando meia distância interpupilar ao girar (0,0315 m de meia-IPD,
2·0,0315·sen 20° ≈ 0,022 m), e o corpo seguindo esse deslocamento como passo
físico. É o disco ancorado no CORPO fazendo exatamente o que devia.

### 9.2 O alcance

| Cenário | Separação cabeça↔corpo |
|---|---|
| Caminhada livre de 1,2 m (corpo andou 1,200 m) | **0,0000 m** |
| 1,8 m contra estrutura (corpo andou 0,680 m) | **1,1200 m** |
| Cenário completo do baú, acumulado | **2,6100 m** |

E a régua da instância do jogo, lida em 36 amostras durante a caminhada contra
a parede (`Interact.alcance()`):

- **sem a fiação de VR** (estado deste commit): saiu **0,0000 m** do corpo;
- **com a fiação ligada** (verificada nesta worktree e revertida): saiu
  **0,0060 m** do corpo, com 1,490 m de separação no ar — ou seja, seguiu a
  cabeça só até onde o mundo aceitou o passo, e nem um centímetro além;
- nas duas, **nunca passou da cabeça** (folga de 0,090–0,106 m).

Alcance normal, ponta a ponta, nas duas fiações: baú a **2,30 m abre**, baú a
**2,55 m não abre** — o raio de 2,4 m intacto.

E a prova de que a rede pega o defeito certo: com a régua trocada pela **cabeça
crua** (a "correção óbvia" do D2), o baú a **3,705 m do corpo** e 1,095 m da
cabeça — do outro lado da parede — **abre**, e a régua chega a 1,490 m do corpo.
Quatro casos da régua pura, o guarda da instância do jogo e o caso do baú
através da parede ficam vermelhos juntos.

---

# Parte III — para onde vão os quatro verbos, agora que o gatilho virou ADS

Data desta parte: 2026-08-29 · base `dev` @ `144e24b`.

**O que mudou desde a Parte I.** O pedido do dono, verbatim ("o ADS em VR
agora deve ser acionado por botão enquanto estiver pressionado e desligado
ao soltar"), revogou a decisão da §4.4 só na parte do BOTÃO: o gatilho
esquerdo, que a Parte I deu ao radial, foi realocado para ADS
(`js/xr/xrinput.js`, Rodada 16, `42ebcc8`). A máquina do radial
(`criarRadialXR`) continua existindo e testada — só ficou **sem botão que a
acione** (`ler(null)` sempre). Isto é PESQUISA para a próxima decisão, sem
código: nada em `js/xr/` ou `test/` muda nesta rodada.

## 10. O orçamento de botões não tem mais folga nenhuma

Recontando a tabela da §1 com o estado pós-Rodada 16:

| Botão | Mão esquerda | Mão direita |
|---|---|---|
| 0 · gatilho | **ADS** *(era abrir radial)* | atirar |
| 1 · empunhadura | agarrar (contextual: apoio/pente/mundo por distância) | mira assistida |
| 3 · clique do analógico | agachar | pausa |
| 4 · X / A | usar | pular |
| 5 · Y / B | recarregar | trocar de arma |
| eixos 2/3 | andar · correr no batente | girar |

**Dez de dez ocupados, de novo — e desta vez não sobrou nem o gatilho da mão
de apoio.** Qualquer solução por BOTÃO discreto exige tirar um verbo já
comprovado de algum lugar, repetindo o mesmo problema que a Parte I já
resolveu uma vez. A saída, então, não pode ser "achar outro botão" — tem
que ser **gesto ou proximidade espacial**, que não competem pelo mesmo
evento de input que atirar/ADS competiam.

## 11. O que a pesquisa desta rodada encontrou

### 11.1 Meta reafirma: gesto de invocação é aceito, botão dedicado não é o padrão do gênero

Já citado na Parte I (§7.1), e continua sendo o achado mais forte:

> *"Spawning a menu from the wrist … is fine, as long as the menu is static
> once it appears and is positioned in world space rather than following
> the wrist."*
— [Meta Horizon Design — Hands UI best practices](https://developers.meta.com/horizon/design/hands-ui-best-practices/)
(reconfirmado por fetch direto nesta rodada, texto idêntico)

Ou seja: a Meta distingue **invocar por gesto/pose** (olhar para o próprio
pulso ou palma, aproximar a mão do corpo) de **manter um menu grudado no
pulso em movimento** (proibido, §7.1). A primeira categoria não usa evento
de botão nenhum — é leitura de POSIÇÃO relativa entre mão e corpo, o mesmo
tipo de sinal que `js/xr/xrinteract.js` já usa para decidir apoio vs pente
vs agarrar-mundo por distância (Parte I, nota de rodapé da Rodada 16 no
commit `42ebcc8`: "grip esquerdo já é contextual... por distância").

### 11.2 Diretriz nova (não citada na Parte I): proximidade ao corpo para uso frequente

> *"Interactions should minimize muscle effort... When arranging information
> in virtual space, the features a user will interact with most often
> should be placed closer to their body, with less important features
> farther away."*
— [Meta Horizon Design — Key considerations](https://developers.meta.com/horizon/design/mr-design-guideline/)
(paráfrase de busca, NÃO fetch direto — marcado como fonte mais fraca que
uma citação literal; a página não foi buscada palavra-por-palavra nesta
rodada por limite de tempo. Reconfirmar com fetch direto antes de basear
uma decisão só nisto.)

### 11.3 Precedente de engine: Godot XR Tools tem "Snap Zone" oficial, container genérico

> *"Snap zones can hold Pickable objects, and the player can pull items out
> of them, and put items into them."* — a distância de ativação é
> `Grab Distance`, documentada como *"Radius of snap zone sensitivity to
> objects being dropped"*.
— [Godot XR Tools — Snap Zone](https://godotvr.github.io/godot-xr-tools/docs/snap_zone/)
(fetch direto)

É um contêiner posicionável em qualquer lugar da CENA (não necessariamente
no corpo) — a peça de baixo nível que um holster corporal usaria, mas o
Snap Zone em si não define semântica de corpo nenhuma.

### 11.4 Holster corporal existe só como PROPOSTA DE COMUNIDADE, não oficial

> Issue "Virtual Holster Object For Testing / Feedback" (`teddybear082`,
> `GodotVR/godot-xr-tools#127`): um objeto colocável em qualquer ponto da
> cena, com botão configurável por mão para guardar/sacar, e o autor aponta
> a aplicação como "holsteres corporais" ou, aninhado, "inventário tipo
> mochila".
— [`GodotVR/godot-xr-tools`, issue #127](https://github.com/GodotVR/godot-xr-tools/issues/127)
(fetch direto)

**Isto NÃO é feature oficial do godot-xr-tools** — é uma proposta aberta,
sem merge confirmado no repositório principal. Citada porque é a única
fonte concreta encontrada de "holster corporal" com código associado, mas
marcada como comunitária/não adotada, para não repetir o erro que a régua
deste repo já proíbe (tratar achado de fórum como documentação oficial).
Note também que o desenho dela é **por botão**, não por gesto — ou seja,
não resolve sozinho o problema do orçamento zerado da §10.

### 11.5 O que continua SEM confirmação (igual à Parte I, §7.5)

Onde exatamente Half-Life: Alyx, Into the Radius, Boneworks/Bonelab e The
Walking Dead: Saints & Sinners ancoram granada/kit médico/etc no corpo —
**ainda sem fonte citável** nesta rodada de pesquisa. As páginas relevantes
continuam bloqueadas ou o conteúdo indexado não descreve a mecânica com
precisão suficiente para citar. Não é lembrança confiável o bastante para
entrar como base de decisão — fica registrado como pista popular, não como
fonte.

## 12. Recomendação desta rodada (pesquisa, não implementação)

**Caminho recomendado: DUAS zonas de proximidade no CORPO, lidas pelo MESMO
verbo "agarrar" que a empunhadura esquerda já despacha por contexto — sem
botão novo, sem gesto de invocar menu nenhum.**

- Granada perto do OMBRO, kit médico perto do QUADRIL — os dois pontos de
  origem que `js/xr/xrbody.js` já publica sem precisar de consulta a osso
  nova: o módulo expõe `corpo.position` (raiz, já com correção de
  agachamento/afundamento aplicada) e `guinada` (yaw do corpo); um ombro ou
  quadril aproximado é um offset local fixo rodado por `guinada` — não
  precisa reabrir a lição cara de medir por osso vs. por caixa
  (`skeleton-rig-eixos` / `CLAUDE.md`, "Box3.setFromObject num SkinnedMesh
  devolve caixa CONGELADA").
- **Por que reaproveitar `agarrar` em vez de inventar um verbo novo**: o
  grip esquerdo já resolve "o que a mão quis pegar" por PROXIMIDADE espacial
  (apoio da arma vs. pente vs. objeto do mundo) — as duas zonas de corpo
  são só mais duas entradas nessa MESMA árvore de decisão por distância, não
  um quinto significado competindo pelo mesmo frame de botão (a distinção
  que o commit `42ebcc8` já fez ao recusar empilhar ADS ali).
- **Por que não veio da fonte de holster comunitária (§11.4)**: ela desenha
  por BOTÃO dedicado por mão, que é exatamente o recurso que a §10 mostra
  esgotado. A ideia aproveitada dela é só a SEMÂNTICA (zona no corpo = item),
  não o mecanismo de ativação.
- **Comer e troca de acessório de mira ficam DE FORA desta recomendação.**
  Nenhuma fonte encontrada aponta um lugar corporal natural para eles (ombro
  e quadril têm precedente de gênero para arma/cura; "comer" e "trocar
  mira" não), e forçar um terceiro/quarto ponto no corpo só para preencher
  a lista seria inventar sem lastro — exatamente o que a régua deste
  documento proíbe. Ficam candidatos a uma via SEPARADA (ex.: os dois únicos
  botões que sobram são os de baixo prioridade de uso — `usar`/`pular` na
  mão esquerda vs. direita — MAS estão ocupados; ou os dois continuam presos
  a tecla de desktop só, sem equivalente VR, registrado como debt explícito)
  — decisão a tomar quando alguém for implementar, não agora.

**Marcado como decisão de ergonomia SEM lastro forte** (nenhuma fonte
confirma a distância exata ombro/quadril para VR — os números viriam por
medição própria em sessão, do mesmo jeito que a Parte I mediu 0,42 m para o
radial): a distância de ativação das duas zonas precisa ser MEDIDA em
sessão real antes de virar constante, não copiada de um número de outro
jogo (que, aliás, não foi encontrado — §11.5).

### Próximo passo (implementação, rodada seguinte)

TDD com IWER real: sessão imersiva, mão de apoio posicionada perto do
ombro/quadril do `corpo` (não um dublê de coordenada arbitrária — ler
`corpo.position`/`guinada` de dentro da sessão), grip pressionado, medir
que o verbo certo dispara e que apoio/pente/mundo continuam funcionando
fora dessas duas zonas (não regredir a árvore de decisão existente).
