# UI e HUD dentro do headset — o que a documentação e o gênero dizem

Levantamento feito ANTES de escrever `js/xr/xrui.js` e `js/xr/xrhud.js`, pela
mesma regra do resto do porte: estudar como o gênero resolve o problema em vez
de levar solução de PC para dentro do headset. Tudo aqui tem link. Onde não
achei número, está escrito **não encontrado** — chute com cara de fato é pior
que lacuna declarada, e esta rodada tem cinco lacunas declaradas (§8).

O problema que motivou a pesquisa está medido no `criterio-aaa.md`:

- **H1 — objetos de HUD dentro do mundo: 0 de 17.** Vida, armadura, munição,
  arma, inventário, prompt, retículo, minimapa, zona e tempo do BR, vivos, feed
  de abates, chat, placar, tela de morte, menu, pausa e lobby vivem todos em
  `#hud` (index.html). Dentro de uma sessão `immersive-vr` sem `dom-overlay` o
  DOM **não chega ao compositor**: está tudo correto no `innerHTML` e tudo
  invisível no aparelho.
- **F5 / I4 — não existia caminho para pausar nem para sair.** Entrar em VR
  chamava `startGame(false)` porque não havia outro estado alcançável.
- **A2 — a preferência de giro existia em API e não tinha tela.**
  `XR.giro.preferir({ modo, velocidade, passo })` só era alcançável pelo
  console.

---

## 1. Distância: onde o painel pode ficar

### 1.1 As três distâncias da Meta

A diretriz de design da Meta separa o conteúdo por **como se interage com ele**,
e cada modo tem uma distância. Literal:

> "place the window at around **45 cm** away from the user for optimal direct
> hand interaction experience"
> "display it around **70 cm** from the user and provide a manipulation UI that
> allows the user to grab, move, and place the window" *(mão + controle)*
> "the window can be placed around **1 meter** from the user" *(telas maiores,
> interação indireta)*
> "we recommend placing objects at a roughly **1 meter** distance **slightly
> below the user's line of sight**"

— [Meta · Key considerations (MR design guideline)](https://developers.meta.com/horizon/design/mr-design-guideline/)

### 1.2 O piso e o teto do foco confortável

O *Oculus Best Practices* (PDF oficial, 310-30000-02) dá a faixa e a razão
óptica:

> "The optics of the Rift make it most comfortable to view objects that fall
> within a range of **0.75 to 3.5 meters** from the user's eyes."
> "**2.5 meters** should be a comfortable distance, making it a safe,
> future-proof distance for fixed items on which users will have to focus for
> an extended time, like menus or GUIs."
> "the proximity necessary to prevent problems will most likely bring the
> interface closer than the recommended **minimum comfortable distance, 75 cm**."

— [Oculus Best Practices (PDF)](https://static.oculus.com/documentation/pdfs/intro-vr/latest/bp.pdf)

A versão viva do mesmo texto na Meta **afrouxou** os números e passou a dar o
número exato que interessa aqui:

> "objects that the user will be fixating their eyes on for an extended period
> of time … should be rendered **at least 0.5 meters** away."
> "Many have found that **1 meter is a comfortable distance for menus and GUIs**
> that users may focus on for extended periods of time."

— [Meta · Display](https://developers.meta.com/horizon/design/display/)

O Android XR, por outro caminho, chega ao mesmo lugar: profundidade mínima
**0,75 m**, máxima **5 m**, painel nasce a **1,75 m** da linha de visão, e "the
size stays consistent between 0.75 meters and 1.75 meters".

— [Android XR · Spatial UI](https://developer.android.com/design/ui/xr/guides/spatial-ui)

### 1.3 O ângulo vertical

A Meta diz "slightly below the user's line of sight" e **não dá o ângulo**.
Quem dá é o Android XR:

> "Place the panel's vertical center **5° below** a user's eye level to maximize
> comfort, as users tend to look downward."

— [Android XR · Spatial UI](https://developer.android.com/design/ui/xr/guides/spatial-ui)

### 1.4 O que isso decidiu aqui

O painel de sessão é **leitura demorada com raio da mão**: `DIST = 1,0 m`, com
`QUEDA = 0,09 m` (5,1° abaixo do olho). Satisfaz a faixa da Meta para painel
grande, o "1 meter is a comfortable distance for menus and GUIs" da página
viva, e fica acima do piso de 0,75 m do BP. **Medido em sessão: 1,004 m.**

O HUD é o caso oposto — é diegético, mora na arma e no pulso, e a distância é a
que o braço do jogador escolher. Medido: **0,55 m** (painel da arma, arma no
quadril) e **0,32 m** (painel do pulso levantado). Os dois somem se chegarem a
menos de **0,22 m** do olho, que é a margem sobre os 0,15 m que o critério I3
proíbe.

---

## 2. Ancoragem: por que menu head-locked é defeito

O texto literal vigente da Meta:

> "**Avoid locking HUD style content to the user's head movements.**"
> "Display content and text within the users' field-of-view and prevent the
> users from having to turn their head."

— [Meta · Key considerations](https://developers.meta.com/horizon/design/mr-design-guideline/)

E a Virtual Reality Check correspondente, literal:

> **VRC.Quest.Functional.10** *(recomendado)*: "Headlocked menus and UI elements
> are generally uncomfortable for the user and should be avoided."
> **VRC.Quest.Functional.2** *(obrigatório)*: "Single player apps must pause
> when the Horizon OS requests the app to pause."
> **VRC.Quest.Input.4** *(obrigatório)*: "Apps must be focus-aware. They must
> continue rendering when they lose focus, hide any user hands or controllers,
> and ignore all input."

— [Meta · Quest VRC requirements](https://developers.meta.com/horizon/resources/publish-quest-req/)

Duas consequências que valem para o wiring, não só para a UI:

1. A pausa tem que ser acionável por **evento externo** (o `onVisibility` de
   `js/xr/xrsession.js`), não só pelo botão do jogador. A redação nova da
   Functional.2 é genérica de propósito: "quando o Horizon OS pedir".
2. Esconder mãos e ignorar entrada (Input.4) é da camada de entrada
   (`js/xr/xrhands.js`, `js/xr/xrinput.js`), **não** desta.

O motivo físico do head-lock é simples: conteúdo colado na cabeça **não pode
ser olhado**. O olho se move para lê-lo, o painel se move junto, e o alvo nunca
é alcançado.

### 2.1 As três ancoragens que sobram

| Ancoragem | Comportamento | Bom para |
|---|---|---|
| Mundo (world-locked) | fica onde nasceu | painel fixo de cena |
| Corpo (body-locked, com amortecimento) | segue o CORPO, não a cabeça | menu, inventário |
| Pulso / mão | pendurado na mão | HUD de consulta |

### 2.2 O que isso decidiu aqui

O painel de sessão é **mundo com amortecimento** — a terceira opção que o
critério H2 autoriza, e a única que fecha o beco do I4:

- enquanto a cabeça fica dentro de **35°** do painel, ele NÃO SE MEXE. Medido:
  girar a cabeça 20° moveu o painel **0,0 mm** (colado na cara moveria ~347 mm);
- passando de 35°, ele volta à frente com constante de tempo de 0,22 s e para
  de novo aos 8°. Medido: girar 150° trouxe o painel de volta a **7,7°** da
  vista, **a 1,00 m**;
- a reprojeção sobre o arco existe porque a interpolação linear é uma **corda**:
  sem ela o painel cortava caminho por dentro e parava a **0,70 m**, abaixo do
  piso de leitura. Foi defeito medido, não hipótese;
- a ROTAÇÃO segue a POSIÇÃO do olho (`lookAt` no ponto onde o olho está), nunca
  a orientação da cabeça. Girar a cabeça não move o olho, então girar a cabeça
  não gira o painel.

---

## 3. Tamanho: quanto o painel ocupa e quando o texto vira borrão

### 3.1 O número do aparelho

> "an upgraded **25 PPD** 4K+ Infinite Display with a resolution of
> **2064x2208 per eye**" · "An angular measurement, PPD measures the number of
> pixels that are packed within **1°** of the field of view" ·
> "**110° horizontally**"

— [Meta · VR display optics, pancake lenses e PPD](https://www.meta.com/blog/vr-display-optics-pancake-lenses-ppd/)
· [Meta Newsroom · Quest 3](https://about.fb.com/news/2023/09/meet-meta-quest-3-mixed-reality-headset/)

Isso é o teto de detalhe: **nenhuma resolução de textura melhora o que o
aparelho não resolve**, e textura acima de ~25 texels por grau é memória e
banda jogadas fora num Snapdragon.

### 3.2 Quanto do campo de visão a UI pode ocupar

> "Don't require the user to swivel their eyes in their sockets to see the UI.
> Ideally, your UI should fit inside the **middle 1/3rd** of the user's viewing
> area."
> "People will typically move their heads/bodies if they have to shift their
> gaze and hold it on a point farther than **15-20° of visual angle** away from
> where they are currently looking."

— [Oculus Best Practices (PDF)](https://static.oculus.com/documentation/pdfs/intro-vr/latest/bp.pdf)

> "For optimal comfort, place content in the **center 41°** of a user's field of
> view."

— [Android XR · Spatial UI](https://developer.android.com/design/ui/xr/guides/spatial-ui)

Com os 110° horizontais do Quest 3, "o terço central" é **~36,7°**. As duas
fontes concordam na ordem de grandeza.

### 3.3 Altura angular mínima de texto

**A Meta não publica altura angular mínima de glifo** (procurado em
`/design/fonts-icons/`, `/design/panels/`, `/design/display/`): **não
encontrado**. O que ela publica é em `dp` — painel padrão 1024dp × 640dp,
mínimo 384dp × 500dp; type ramp Headline1 32/36dp, Body1 14/20dp.

— [Meta · Panels](https://developers.meta.com/horizon/design/panels/)
· [Meta · Fonts and icons](https://developers.meta.com/horizon/design/fonts-icons/)

Quem publica o número **angular** com pesquisa de usuário é a Microsoft:

> "the recommended minimum viewing angle and the font height for legibility are
> around **0.35°-0.4° / 12.21-13.97 mm**" *(a 2 m)*
> "For the near interaction at 0.45 m, the minimum legible font's viewing angle
> and the height are **0.4°-0.5° / 3.14–3.9 mm**"
> confortavelmente legível: **0.65°-0.8°** a 45 cm; **0.6°-0.75°** a 2 m

— [Microsoft · Typography (Mixed Reality)](https://learn.microsoft.com/en-us/windows/mixed-reality/design/typography)

O Android XR chega ao mesmo número por outro caminho: fonte recomendada
**≥ 14dp** com conversão **0,868 dp→dmm** ⇒ 12,15 mm a 1 m ⇒ **≈ 0,70°**.
(`dmm` = *distance-independent millimeter*, 1 mm a 1 m — é uma medida de
ângulo disfarçada de comprimento, e é conceito do **Google**, não da Meta.)

— [Android XR · Visual design](https://developer.android.com/design/ui/xr/guides/visual-design)

**Duas casas independentes convergem em ~0,7° como alvo, com piso absoluto em
0,35–0,4°.** É esse o limiar usado nos testes deste porte.

Tabela de projeto (h = 2·d·tan(θ/2)):

| ângulo | glifo a 0,32 m | glifo a 0,55 m | glifo a 1,0 m | px no Quest 3 |
|---|--:|--:|--:|--:|
| 0,35° (piso) | 2,0 mm | 3,4 mm | 6,1 mm | 8,8 px |
| **0,70° (alvo)** | **3,9 mm** | **6,7 mm** | **12,2 mm** | **17,5 px** |
| 1,00° | 5,6 mm | 9,6 mm | 17,5 mm | 25 px |

### 3.4 O que isso decidiu aqui — todos os números medidos em sessão

| Superfície | Distância | Ângulo ocupado | Altura angular do texto | Textura |
|---|--:|--:|--:|---|
| Painel de sessão | 1,004 m | **34,3° × 26,1°** | **1,29°** (linha 3,82°) | 1024 × 768 |
| HUD da arma | 0,55 m | **16,5° × 8,3°** | **2,52°** | 512 × 256 |
| HUD do pulso | 0,32 m | **24,9° × 18,8°** | **1,57°** | 512 × 384 |

Os 34,3° do painel de sessão entram no terço central (36,7°) e no "center 41°"
do Android XR. A textura de 1024 px para 34,3° dá ~30 texels/grau contra os 25
PPD do aparelho: logo acima do 1:1 (que pediria ~855 px), sem desperdício.
Os três textos passam do alvo de 0,7° com folga larga.

### 3.5 Curvatura

**Não encontrado**: a Meta **não publica** recomendação de painel curvo nem
raio (nem em `/design/panels/`, nem em `/design/mr-design-guideline/`, nem em
`/design/display/`). O que existe de concreto é a restrição do compositor
cilíndrico — "the arc angle must be smaller than 180 degrees", com
`radius = scale.z` —
([Meta · OVROverlay](https://developers.meta.com/horizon/documentation/unity/unity-ovroverlay/)),
o Oculus BP admitindo as três formas ("drawn onto a floating flat polygon,
cylinder or sphere") e o Android XR mostrando "curved row layout" com painéis
**planos** dispostos em arco.

Aqui o painel é **plano**, e a conta é minha: a 1,0 m e 34,3° de largura, a
diferença de distância entre o centro e a borda é `1/cos(17,1°) − 1 = 4,6 cm`,
ou seja **menos de 5 %** — abaixo do que a acomodação nota, e um plano custa 2
triângulos contra dezenas de uma malha curva. Curvatura entra se o painel
crescer.

---

## 4. Como o gênero resolve HUD

A recomendação escrita, que veio antes dos jogos, é do próprio Oculus BP:

> "Strive to integrate your interface elements as intuitive and immersive parts
> of the 3D world. For example, **ammo count might be visible on the user's
> weapon rather than in a floating HUD**."
> "**Foregoing the HUD and integrating information into the environment is
> ideal.**"
> "Close-up weapons and tools can lead to eyestrain; make them a part of the
> avatar that **drops out of view when not in use**."

E o motivo ÓPTICO de HUD flutuante ser ruim, que é mais forte que o argumento
de imersão:

> "if a scene element comes closer to the user than the depth plane of the HUD:
> based on occlusion, the HUD is perceived as closer than the scene element
> because it covers everything behind it, yet binocular disparity indicates that
> the HUD is farther away… This can lead to difficulty and/or discomfort when
> trying to fuse the images."

— [Oculus Best Practices (PDF)](https://static.oculus.com/documentation/pdfs/intro-vr/latest/bp.pdf)

| Jogo | Munição | Vida | Menu | Retículo | Fonte |
|---|---|---|---|---|---|
| **Half-Life: Alyx** | **"an LED ammo counter on the grip"** e um carregador com **"a ring-shaped light at the bottom that slowly depletes when being fired"** | seringas guardadas no corpo — **"two in her wrist pockets"** | não encontrado | **não tem retículo flutuante**: "glowing iron sights by default", com reflex e laser como upgrade | [Combine OverWiki · Pistol](https://combineoverwiki.net/wiki/Pistol_(Half-Life:_Alyx)) · [Health Pen](https://combineoverwiki.net/wiki/Health_Pen) |
| **Onward** | **nenhum contador** — o jogador tira o carregador e olha | não encontrado | não encontrado | **oficialmente nenhum**: "With limited respawns, **no HUDs, and no crosshairs**" | [Downpour Interactive](https://www.downpourinteractive.com/) · [UploadVR](https://www.uploadvr.com/onward-oculus-quest-review/) |
| **Pavlov** | não encontrado | não encontrado | não encontrado | não encontrado | [Steam](https://store.steampowered.com/app/555160/Pavlov/) |
| **Population: ONE** | não encontrado | **objeto físico consumível** ("shield power-ups, bananas and soda cans for health") | não encontrado | não encontrado | [UploadVR](https://www.uploadvr.com/population-one-review-vr/) |
| **Contractors** | **carregador físico no cinto** ("grab a new one from your belt pouch") | ligada ao **colete** escolhido | não encontrado | tem marcadores de HUD, mas **ancorados no mundo** (pontos de controle) | [UploadVR · review](https://www.uploadvr.com/contractors-vr-quest-review/) · [guia](https://www.uploadvr.com/contractors-vr-beginners-guide-tips/) |

O denominador comum dos que resolveram bem, e que é a decisão de projeto:
**o que decide o tiro seguinte fica onde a mão já está; o que se consulta fica
num objeto que o jogador pega ou levanta.**

O contra-exemplo, que o próprio `criterio-aaa.md` cita: *Skyrim VR* — *"a parte
ruim foi o HUD, que não foi modificado do original feito para um Dualshock"*;
*Fallout 4 VR* — o Pip-Boy *"infla para o dobro do tamanho… é distrativo e
quebra a imersão"*; *Borderlands 2 VR* — *"as armas todas têm um retículo
flutuante grande que você não pode desligar e que nem parece alinhado com as
miras de ferro."*

### 4.1 O que isso decidiu aqui

- **Na arma** (`weaponRoot`): pente, reserva, nome da arma, barra de vida e
  barra de armadura — literalmente o "ammo count … on the user's weapon" do BP.
  E some no ADS, que é o "drops out of view when not in use" do mesmo texto.
- **No pulso esquerdo** (`gripSpace`, a palma — não o raio de mira): fase,
  vivos, zona e tempo do BR, granadas, kits e as últimas linhas do feed de
  abates. Medido: **9,9 cm da palma**.
- **Retículo: não existe.** O critério H3 aprova duas saídas — projetado no
  ponto de impacto REAL, ou nenhum. O BP explica por que o meio-termo é
  proibido: "draw any crosshair, reticle, or cursor at the **same depth as the
  object it is targeting**; otherwise, it can appear as a **doubled image**".
  Projetar no impacto real custaria um raycast de cena por frame num orçamento
  já 4× estourado (`perf-xr.md`). A mira deste jogo é física: as miras de ferro
  da arma (`js/xr/xrweapon.js`), como no Alyx e no Onward.

---

## 5. Custo, que em XR é critério e não detalhe

O orçamento é **180 draw calls por olho** e a medição atual é **775 no castelo**
(`perf-xr.md`). Qualquer UI nova precisa declarar o que gasta.

| Superfície | Objetos | Draw calls (estéreo, medido) | Quando |
|---|--:|--:|---|
| Painel de sessão + raio da mão | 2 | **4** | só com o painel ABERTO; fechado, `visible=false` e o three nem visita |
| HUD da arma + HUD do pulso | 2 | **4** | em partida |

Estéreo = 2 olhos, então 2 objetos custam 4. Medir isso deu trabalho e rendeu
um achado: a cena está viva (grama, animais, tracer do tiro anterior) e a
contagem oscila ±4 entre frames, então **comparar "com" e "sem" em janelas
separadas por segundos não mede nada** — a mesma UI marcou 0, 6, 8 e 10 em
execuções seguidas. O que mede é a **diferença pareada**: as duas leituras a
~150 ms uma da outra, e a mediana das diferenças.

### 5.1 O achado: material transparente `DoubleSide` custa o DOBRO

Com a medição pareada estabilizada, o custo ficou teimosamente em **8** para
dois painéis. A causa está no three r0.185
(`WebGLRenderer.js`, `renderObject`):

```js
if ( material.transparent === true && material.side === DoubleSide
     && material.forceSinglePass === false ) {
  material.side = BackSide;  material.needsUpdate = true;  renderBufferDirect(...)
  material.side = FrontSide; material.needsUpdate = true;  renderBufferDirect(...)
  material.side = DoubleSide;
}
```

Material **transparente** com `side: DoubleSide` é desenhado em **dois passes**,
com `needsUpdate = true` entre eles — dobra a draw call **e** força uma
verificação de programa por frame. Trocar para `FrontSide` derrubou o custo de
**8 para 4** em estéreo. Os painéis sempre encaram o olho, então a face de trás
nunca seria vista: era custo puro.

Três disciplinas que mantêm isso baixo:

1. **Um canvas por superfície.** Fundo, título, linhas, destaque e valores são
   pintados na MESMA textura: um painel inteiro é uma draw call, não uma por
   texto.
2. **Repintar só quando o texto muda.** Cada painel guarda uma assinatura do
   conteúdo; o número da munição muda uma vez por tiro, não 90 vezes por
   segundo. Repintar 1024 × 768 a cada frame num Snapdragon é queimar o quadro.
3. **Nada é criado no boot.** Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID, e a ordem de consumo é contrato do worldgen: as malhas
   nascem na primeira abertura / no primeiro frame DENTRO da sessão.

---

## 6. O botão que faltava

O mapa do Touch em `js/xr/xrinput.js` estava cheio:

| | esquerda | direita |
|---|---|---|
| analógico | andar | girar |
| clique do analógico (3) | correr | **— livre** |
| gatilho (0) | interagir (`js/xr/xrinteract.js`) | atirar |
| empunhadura (1) | agachar | mirar |
| botão de baixo (4) | usar | pular |
| botão de cima (5) | recarregar | trocar de arma |

O **clique do analógico DIREITO (índice 3)** era o único livre, e é o que abre e
fecha o painel. Guarda contra acidente: só conta com o analógico a menos de 0,5
do centro nos dois eixos — clicar enquanto se gira é acidente, não intenção.

O botão de menu do próprio Quest **não serve**: o runtime o reserva e ele não
aparece em `gamepad.buttons` da sessão WebXR.

Selecionar é o **gatilho da mão que estiver apontando para o painel**, que é o
`select` canônico da plataforma — e só enquanto o painel está aberto, com a
tradução de entrada de jogo desligada nesse intervalo (`capturando`).

---

## 7. O que ficou de fora, e por quê

- **Curvatura do painel** — a distorção a 34,3° é < 5 % (§3.5); entra se o
  painel crescer.
- **Retículo de mundo** — decisão declarada com fonte, não esquecimento (§4.1).
- **Chat, placar e lobby do BR** — dos 17 itens da lista fechada do H1, estes
  três continuam só no DOM. São texto longo e interação de teclado, e o caminho
  honesto é o painel de sessão ganhar abas — não um quarto objeto.
- **Háptico** (B6) — não é UI, é da camada de arma, e continua em zero chamadas
  no repositório.
- **Esconder mãos e ignorar entrada sem foco** (VRC.Quest.Input.4) — é de
  `js/xr/xrhands.js` e `js/xr/xrinput.js`; daqui sai só a pausa.

---

## 8. Lacunas declaradas desta rodada

1. A frase que circula como "*Avoid attaching HUD-style content…*" **não existe
   nessa forma** nos docs vigentes da Meta. O verbo publicado é **locking**.
2. Os números ±30° confortável / 55° máximo de rotação de cabeça, e os limites
   verticais +20°/−12°, **não estão em documentação Meta/Oculus**. Circulam em
   fonte secundária citando Alex Chu (Samsung); o material original de Mike
   Alger saiu do ar. Não foram usados aqui — os limites vieram do "terço
   central" do BP e do "center 41°" do Android XR, que são primários.
3. **Altura angular mínima de texto pela Meta: não encontrada.** O alvo de 0,7°
   veio da Microsoft e do Android XR.
4. **Raio de curvatura recomendado pela Meta: não encontrado.**
5. Munição/vida/menu de **Pavlov** e **Population: ONE**, vida e menu do
   **Alyx** e do **Onward**: **não encontrados** em fonte citável — os wikis de
   jogo estavam atrás de Cloudflare/captcha nesta rodada.
