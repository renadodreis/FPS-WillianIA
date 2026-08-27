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
