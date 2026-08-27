# O MENU PRINCIPAL dentro do headset — o que a documentação e o gênero dizem

Levantamento feito ANTES de escrever `js/xr/xrmenu.js`, pela mesma regra do
resto do porte: estudar como o gênero resolve o problema em vez de levar
solução de PC para dentro do headset. Tudo aqui tem link. Onde não achei
número, está escrito **não encontrado** — chute com cara de fato é pior que
lacuna declarada, e esta rodada tem quatro lacunas declaradas (§7).

Este documento é irmão de `referencia-ui.md`, que cobriu o painel de SESSÃO
(pausa, conforto, chat, placar, sala). Aqui é o que vem **antes da partida**.

## 0. O problema, medido

- **`game.js:3234`** — `if (xrOn && !state.started && !XRUI.aberto) startGame(false);`
  com o comentário dizendo por quê: *"O menu é DOM, e DOM não é renderizado
  dentro de uma sessão imersiva… Sai quando existir menu dentro do mundo
  (Fase 5)."* A segunda ocorrência é o `forceStart()` do hook de QA
  (`game.js:4241`), que é do harness e continua onde está.
- Consequência: **o jogador não escolhe nada.** Não escolhe solo nem
  multijogador, não vê o lobby antes de entrar, não configura conforto, e o
  passeio de câmera do menu (a vitrine do mapa) não roda em VR de propósito.
- É o **F5** do `criterio-aaa.md` (*"a partir de dentro do headset, o jogador
  chega ao menu, escolhe modo, entra em partida, joga, morre, volta ao menu e
  sai — sem tirar o aparelho"*) e o **I4** (*"nenhum estado sem saída"*), os
  dois hoje reprovados com a causa escrita: *"entrar em VR chama
  `startGame(false)` porque não há menu no mundo; e não existe caminho de
  volta."*

---

## 1. O que a Meta EXIGE da primeira tela

### 1.1 As VRCs que tocam neste assunto (texto literal)

> **VRC.Quest.Performance.3** *(obrigatório)*: "The app must either display
> head-tracked graphics in the headset within 4 seconds of launch or provide a
> loading indicator in VR."
> **VRC.Quest.Functional.2** *(obrigatório)*: "Single player apps must pause
> when the Horizon OS requests the app to pause."
> **VRC.Quest.Functional.10** *(recomendado)*: "Headlocked menus and UI
> elements are generally uncomfortable for the user and should be avoided."
> **VRC.Quest.Input.1** *(recomendado)*: "In-game menus should be activated
> with the menu button on the gamepad controller or the menu button on the left
> Touch controller."
> **VRC.Quest.Input.4** *(obrigatório)*: apps devem ser focus-aware — "continue
> rendering when they lose focus, hide any user hands or controllers, and
> ignore all input."

— [Meta · Quest VRC requirements](https://developers.meta.com/horizon/resources/publish-quest-req/)

**Não existe VRC que exija literalmente "botão de sair" ou "voltar ao menu"**
(procurado na mesma página): **não encontrado**. O que existe é a
Performance.3, a Functional.2 e a regra do dono do projeto ("plenamente
jogável dentro do headset"), que é mais dura que a loja.

**A Input.1 não tem como ser cumprida em WebXR, e isso é da plataforma.** O
botão de menu do Quest é reservado pelo runtime e **não aparece em
`gamepad.buttons`** dentro da sessão (medido na rodada do painel de sessão —
ver `referencia-ui.md` §6). O substituto é o **clique do analógico direito**,
que era o único botão livre do mapa do Touch. O menu principal herda esse
botão — com uma diferença cravada em teste: **ele não FECHA o menu principal**,
porque antes da partida não existe jogo para onde voltar e fechar seria o beco
do I4.

### 1.2 O tempo até a primeira tela

> "The OS displays the system splash screen while the app is loading and before
> it's able to provide rendered frames for display."
> "The app has no direct control on how long the system splash screen is shown,
> as it disappears as soon as the app starts rendering."
> "A startup scene doesn't appear instantly. It usually takes several seconds
> to initialize the app's rendering engine."
> "Implement a fade-in animation during the app load instead of abruptly
> displaying the app's interface."

— [Meta · Splash screen best practices](https://developers.meta.com/horizon/resources/mr-splash-screen-bp)

E a diretriz de design é explícita sobre não gastar o tempo do jogador na
entrada:

> "it's crucial to quickly engage users and meet their expectations. Ensure
> gameplay aligns with promotional materials, **avoid lengthy non-interactive
> cinematics**"

— [Meta · Key considerations](https://developers.meta.com/horizon/design/mr-design-guideline/)

**O que isso decidiu aqui:** o menu principal é **a primeira coisa
interativa** dentro da sessão — nasce junto com o primeiro frame imersivo, sem
cinemática, sem passeio de câmera, sem tela de carregamento própria. E o custo
de boot dele é ZERO: a malha é a mesma do painel de sessão, que só existe a
partir da primeira abertura (nada é criado no boot — todo `Object3D` gasta 4
números do `Math.random` seedado e a ordem de consumo é contrato do worldgen).

---

## 2. Onde o menu fica, e por que não é colado na cara

> "**Avoid locking HUD style content to the user's head movements.** Anchor
> information and digital content to a space, **or loosely follow the user
> using smoothing animation.**"

— [Meta · Key considerations](https://developers.meta.com/horizon/design/mr-design-guideline/)

Essa frase autoriza, palavra por palavra, a ancoragem que o painel de sessão já
usa: **mundo com amortecimento** (não se mexe dentro de um cone de 35°, volta à
frente com constante de tempo de 0,22 s, para aos 8°). O menu principal é o
MESMO objeto, então herda a ancoragem medida e testada em
`referencia-ui.md` §2.

E o Oculus Best Practices, que é o texto que fecha o assunto para MENU
especificamente:

> "**The display should respond to the user's movements at all times, without
> exception. Even in menus, when the game is paused, or during cut scenes,
> users should be able to look around.**"
> "UIs should be a 3D part of the virtual world and sit approximately **2-3
> meters** away from the viewer—even if it's simply drawn onto a floating flat
> polygon, cylinder or sphere that floats in front of the user."
> "objects at which users will look for extended periods of time (such as
> **menus** and avatars) should fall in that range [**0.75 to 3.5 meters**]"
> "Don't require the user to swivel their eyes in their sockets to see the UI.
> Ideally, your UI should fit inside the **middle 1/3rd** of the user's viewing
> area."

— [Oculus Best Practices (PDF)](https://static.oculus.com/documentation/pdfs/intro-vr/latest/bp.pdf)

### 2.1 A divergência de distância, declarada

O BP antigo diz **2–3 m**; a página viva da Meta diz que **1 m** é confortável
para menus (*"Many have found that 1 meter is a comfortable distance for menus
and GUIs that users may focus on for extended periods of time"* —
[Meta · Display](https://developers.meta.com/horizon/design/display/)), e a
diretriz de MR dá **~1 m** para "tela grande com interação indireta". O menu
fica a **1,004 m medidos em sessão**: dentro da faixa de foco confortável
(0,75–3,5 m) e no número da página viva, **abaixo** do "approximately 2-3
meters" do BP. A divergência é da própria Meta entre dois documentos dela; foi
adotado o mais recente e o que casa com o raio da mão, e fica registrado que o
BP pede mais longe.

### 2.2 A vitrine do mapa: por que o passeio de câmera NÃO roda em VR

Fora de VR o menu é um passeio cinematográfico pelo mapa (`MenuCam`,
`MENU_SHOTS`, `game.js:3390`). Dentro do headset esse passeio está desligado —
e a frase acima do BP é a razão escrita: **em menu o jogador tem que poder
olhar em volta**, e mover a câmera de quem está com o aparelho na cara é o
conflito visual-vestibular que a skill `vr-quest` já registra como enjoo.

O que sobra no lugar é melhor: o jogador fica **de pé no spawn, com o mundo
vivo em volta** (`XR.place(player.pos…)`, o `else` da mesma linha). A **sala de
espera diegética sai de graça** — e "não vê o mapa" deixa de ser verdade
virando a cabeça, que é como se vê mapa em VR.

---

## 3. Como se aponta e o que se aponta

> "if using this method for selecting items in a menu, elements should react to
> contact with the targeting reticle/cursor **in a salient, visible way** (e.g.,
> animation, highlighting)."
> "targeting with head movements has limits on precision. In the case of menus,
> **items should be large and well-spaced enough for users to accurately target
> them**."

— [Oculus Best Practices (PDF)](https://static.oculus.com/documentation/pdfs/intro-vr/latest/bp.pdf)

> "The minimum hit target size for direct touch is **48dp x 48dp**."

— [Meta · Buttons](https://developers.meta.com/horizon/design/buttons)

> "The default panel size is **1024dp × 640dp**." · "The minimum panel size is
> **384dp × 500dp**."

— [Meta · Panels](https://developers.meta.com/horizon/design/panels)

**O que isso decidiu aqui.** O menu tem **8 linhas** e a conta é essa: a faixa
de abas ocupa 104 px dos 768 do canvas, sobram 664 px, 8 linhas dão **83 px por
linha** = **2,87° de alvo angular a 1,004 m** (medido em sessão). O teste cobra
`grausLinha >= 2,0°` e a prova de que a asserção é viva está feita: com 12
linhas o alvo cai para 1,92° e o caso morre. Ou seja, **o número de linhas do
menu é um limite testado, não um gosto** — a próxima opção que entrar tem que
sair de alguma outra, ou virar submenu.

Realce sob o raio: a faixa `rgba(92,226,122,0.16)` que o painel já pinta é o
"salient, visible way" do BP, e já é medida em pixels por
`test/xr-social.test.js`.

---

## 4. Como o gênero faz o menu principal

Aqui a honestidade custa: **esta rodada ficou sem orçamento de busca na web**,
então só entrou o que deu para verificar em página que respondeu. O que
**não** foi confirmado está marcado, e nenhuma linha foi preenchida de memória.

| Jogo | Menu principal | Fonte |
|---|---|---|
| **Half-Life: Alyx** | **não encontrado** — o artigo consultado não descreve o menu principal, o hub nem a volta ao menu | [Combine OverWiki · Half-Life: Alyx](https://combineoverwiki.net/wiki/Half-Life:_Alyx) |
| **Onward** | **estande de tiro jogável** enquanto se espera: *"At one point when I was practicing my sniping at the shooting range, I leaned over the edge of my real life couch since it was the same height as the in-game sand bags"*. E um aviso contra texto pequeno na tela de antes da partida: *"unless someone squints and reads the **blurry text before loading into a lobby**, it's not very clear what the objective is for each mode"* | [UploadVR · Onward Quest review](https://www.uploadvr.com/onward-oculus-quest-review/) |
| **Pavlov**, **Population: ONE**, **Contractors** | **não encontrado** nesta rodada | — |

Duas coisas úteis saem daí, e as duas viraram decisão:

1. **A sala de espera do gênero é um lugar, não uma tela.** O jogador de Onward
   espera dentro de um estande de tiro. Aqui o equivalente sem custo nenhum é
   ficar de pé no spawn, no mundo já carregado (§2.2).
2. **Texto borrado na tela de antes da partida é queixa publicada de review.**
   É a mesma coisa que o alvo de 0,7° de altura angular protege; o menu mede
   **1,29°** (medido em sessão), com folga de 1,8×.

---

## 5. O que isso decidiu, linha por linha

| Decisão | Fonte |
|---|---|
| O menu é um **MODO do painel de sessão**, não um segundo objeto | orçamento: 180 draw calls por olho contra 374 medidos (`perf-xr.md`); um painel novo custa +2 por olho |
| **Ancorado no mundo com amortecimento**, nunca na cabeça | Functional.10 + "Anchor … or loosely follow the user using smoothing animation" |
| **1,0 m** de distância | Meta Display ("1 meter … for menus and GUIs"); divergência com o BP declarada em §2.1 |
| **8 linhas, 83 px, 2,87°** | "items should be large and well-spaced enough" (BP) + limite testado (§3) |
| **SOLO / MULTIJOGADOR** como as duas primeiras linhas | é a escolha que o jogador de PC faz no `#btnNew` / `#btnMulti`; sem elas, entrar em VR era escolher por ele |
| **MULTIJOGADOR leva à aba SALA**, o lobby que já existe | `referencia-ui.md` §7 já tinha decidido que sala/chat/placar seriam abas deste painel, "não um quarto objeto" |
| **As opções de conforto são as MESMAS da pausa**, e valem antes da partida | A2 do `criterio-aaa` (a preferência de giro precisa ter tela); duas listas divergiriam no primeiro ajuste |
| **Nada de botão morto**: sem sala no ar, MULTIJOGADOR vira NOTA de estado | regra desta base — a tela de morte já ofereceu "JOGAR DE NOVO" online e a ação recusava no console |
| **O clique do analógico não fecha** o menu principal | I4: fechar antes da partida deixa o jogador de pé no mundo sem tela nenhuma |
| **SAIR DO VR** é uma linha do menu | F5: o ciclo tem que fechar dentro do headset — menu → partida → morte → menu → sair |
| O passeio de câmera continua **desligado** em VR | "Even in menus … users should be able to look around" (BP) |

---

## 6. Custo

**Zero draw call a mais.** O menu não cria `Object3D` nenhum: ele devolve
linhas para o canvas que o painel de sessão já pinta. Medido em sessão
imersiva, diferença pareada com o instrumento calibrado
(`test/xr-menu.test.js`):

| Item | Draw calls (estéreo) |
|---|--:|
| Malha do painel (a mesma da pausa) | **2** |
| Raio da mão | **2** (não desligável de fora: o `update()` do painel reescreve `visible` todo frame) |
| **O menu em si** | **0** |
| Objetos novos na cena | **0** — o censo da cena só encontra `xrUiPainel` e `xrUiRaio` |

E zero consumo de `Math.random`: criar o módulo inteiro gasta **0 números** do
fluxo seedado (medido), o que é obrigatório porque a ordem de consumo é
contrato do worldgen.

---

## 7. Lacunas declaradas desta rodada

1. **Não existe VRC exigindo "botão de sair" / "voltar ao menu"** na página de
   requisitos da Horizon Store: **não encontrado**. A exigência que existe é
   pausar (Functional.2) e ser focus-aware (Input.4); o resto é regra do dono
   do projeto.
2. **A Meta não publica número de rotação confortável de cabeça.** Procurado em
   `/design/head` e `/design/head-best-practices/`: só há texto qualitativo
   ("positioned at a comfortable height … reducing neck strain"). O cone de
   35°/8° do painel veio do "terço central" do BP, que é primário — a mesma
   lacuna que `referencia-ui.md` §8.2 já registrava.
3. **Menu principal de Alyx, Pavlov, Population: ONE e Contractors: não
   encontrado** nesta rodada (sem orçamento de busca; as páginas consultadas
   não descrevem menu). O único dado de gênero verificado é o de Onward.
4. **A Meta e o Oculus BP divergem sobre a distância de menu** (1 m contra
   2–3 m). Adotado 1 m, com a divergência escrita em §2.1 em vez de escondida.
