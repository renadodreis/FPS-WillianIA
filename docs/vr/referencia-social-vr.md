# Conversa dentro do headset — o que a plataforma, a literatura e o gênero dizem

Rodada de 2026-08-26. Este documento existe porque `js/xr/xrsocial.js` precisa
decidir **como o jogador diz alguma coisa aos outros dentro de uma sessão
`immersive-vr`**, e a decisão anterior estava escrita como contrato com uma
premissa errada. Todas as datas de acesso: **2026-08-26**.

Convenção: **[P]** = fonte primária (spec do W3C, doc do fornecedor, artigo
publicado, código-fonte). **[S]** = secundária (blog, wiki, repositório de
terceiro). Onde não achei, está escrito **NÃO ENCONTRADO** — isso é resposta,
não lacuna a ser preenchida por palpite.

---

## 0. A correção que abre o assunto

O cabeçalho de `js/xr/xrsocial.js` afirmava, como contrato:

> "NÃO EXISTE TECLADO, E ISSO NÃO É PREGUIÇA — É O ESTADO DA PLATAFORMA. Uma
> página em sessão `immersive-vr` não tem como chamar o teclado do sistema do
> Horizon OS."

**Isso é falso.** O teclado do sistema existe para WebXR, está documentado pela
Meta, e está no ar desde janeiro de 2024. A frase foi corrigida.

A **conclusão de design** (mensagem pré-definida durante a partida) continua
certa — mas pelo motivo oposto do que estava escrito: não é que o teclado não
possa ser chamado; é que **chamá-lo congela o jogador**. Ver §1.3.

Premissa errada com conclusão certa é a pior combinação para um documento de
referência: a próxima pessoa a mexer aqui reabriria o assunto pelo lado errado.

---

## 1. O que a plataforma permite

### 1.1 `dom-overlay` — INVIÁVEL em `immersive-vr` (a doc anterior acertou)

A spec **não** proíbe; ela até prevê headset:

> "This module introduces the string `dom-overlay` as a new valid feature
> descriptor for use in the `requiredFeatures` or `optionalFeatures` sequences
> for **immersive sessions**." […] "NOTE: Implementation choices include a
> fullscreen overlay on a handheld AR device, or **a floating rectangle in
> space for a VR or AR headset**."
> — [W3C WebXR DOM Overlays Module, Editor's Draft, 24 set 2024, §3.1](https://immersive-web.github.io/dom-overlays/) **[P]**

Quem proíbe é a implementação. O Chromium — base do Meta Quest Browser —
rejeita o recurso fora do modo AR:

```cpp
case device::mojom::XRSessionFeature::DOM_OVERLAY:
  if (mode != device::mojom::blink::XRSessionMode::kImmersiveAr)
    return false;
```
— [`third_party/blink/renderer/modules/xr/xr_system.cc`, l. 175-177](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/xr/xr_system.cc) **[P]**

**Consequência para este jogo:** o `<input>` do chat (`br-game.js`, `openChat`),
o `#brRoster` e o lobby inteiro continuam invisíveis dentro da sessão. É por
isso que `js/xr/xrsocial.js` existe.

### 1.2 `XR_META_virtual_keyboard` / `OVRVirtualKeyboard` — INVIÁVEL para web

É extensão **OpenXR nativa** (nº 220 do registro Khronos, `supported="openxr"`)
— [OpenXR-SDK, `specification/registry/xr.xml`](https://raw.githubusercontent.com/KhronosGroup/OpenXR-SDK/main/specification/registry/xr.xml) **[P]** — e do lado
Unity foi aposentada:

> "Virtual Keyboard as a feature has been deprecated in favor of the system
> keyboard overlay in Unity."
> — [Meta, *Virtual Keyboard Overview (Deprecated)*](https://developers.meta.com/horizon/documentation/unity/VK-unity-overview/) **[P]**

### 1.3 `XRSession.isSystemKeyboardSupported` — VIÁVEL, e é o caminho que faltava

A spec define, e **não** restringe por modo de sessão:

> "The `isSystemKeyboardSupported` attribute indicates that the XRSystem has the
> ability to display the system keyboard while the XRSession is active. If
> `isSystemKeyboardSupported` is `true`, Web APIs that would trigger the overlay
> keyboard (such as `focus`) will show the system keyboard. **The XRSession MUST
> set the visibility state of the XRSession to `"visible-blurred"` while the
> keyboard is shown.**"
> — [W3C WebXR Device API, Candidate Recommendation Draft, 9 jun 2026, §4.1](https://www.w3.org/TR/2026/CRD-webxr-20260609/) **[P]**

A Meta documenta especificamente para WebXR:

> "Browser version 26.1 or later" […] "You can check the
> `isSystemKeyboardSupported` attribute of `XRSession` to see if the system
> keyboard is supported by the UA." […] "It can be used with **any HTML text
> input element**." […] "Then call `focus()` on it to trigger the system
> keyboard."
> — [Meta, *System Keyboard in WebXR*](https://developers.meta.com/horizon/documentation/web/webxr-keyboard/) **[P]**

E lista **Web** entre as plataformas do teclado virtual — [Meta, *Virtual
keyboard: Implementation*](https://developers.meta.com/horizon/design/virtual-keyboard_implementation/) **[P]**.
O exemplo oficial linkado por essa página abre `immersive-vr` (não AR) e chama
`textField.focus()` no `select` — [`emmanueljl/webxr-samples/system-keyboard.html`](https://github.com/emmanueljl/webxr-samples/blob/main/system-keyboard.html) **[P/S]**
(autor é o engenheiro da Meta que implementou o recurso).

Disponibilidade, do MDN browser-compat-data **[P]**: Quest Browser (`oculus`)
**31.2**, lançado **2024-01-15**. Versão atual do Quest Browser: 42.x (2026).

**Por que funciona apesar de o DOM não ser desenhado:** quem desenha o teclado é
o **sistema operacional**, não a página, e o teclado tem leitura própria do que
está sendo digitado:

> "Readout is a text preview provided to the user as they type on the virtual
> keyboard."
> — [Meta, *Virtual keyboard* (design)](https://developers.meta.com/horizon/design/virtual-keyboard/) **[P]**

Ou seja: o `<input>` invisível não atrapalha — o jogador lê no readout do
próprio teclado. Vêm de graça readout, sugestão, emoji, múltiplos idiomas e
**ditado por microfone**.

#### O que mata o teclado do sistema DURANTE a partida

Enquanto o teclado está de pé, a sessão vai para `visible-blurred`, e a spec é
literal:

> "A state of `visible-blurred` indicates that imagery rendered by the XRSession
> may be seen by the user, but is not the primary focus.
> `requestAnimationFrame()` callbacks **MAY be throttled**. **Input is not
> processed by the XRSession.**" […] "If session's `visibilityState` is
> `"visible-blurred"` … **set pose to null**"
> — [W3C WebXR, CRD 9 jun 2026, §4.1 e §5.1](https://www.w3.org/TR/2026/CRD-webxr-20260609/) **[P]**

Foi desenhado assim, e o editor da spec (Meta) escreveu o porquê:

> "While the keyboard is up, the system renders the controllers and a keyboard
> and **no controller poses are sent to the experience**."
> — [cabanier, immersive-web/webxr#1179](https://github.com/immersive-web/webxr/issues/1179) **[P]**

**Tradução para um battle royale: enquanto digita, o jogador está parado, sem
entrada e sem poses de mão.** Ele continua sendo alvo. E, neste jogo, ainda
tropeça na guarda de pausa: `js/xr/xrsession.js` sinaliza foco e o `tick` do
game.js abre a pausa quando a visibilidade não é `visible` — ou seja, digitar
abriria o painel de pausa por cima do próprio teclado.

Três limitações declaradas pela Meta que também pesam **[P]**, todas da doc de
*System Keyboard in WebXR*:

- "Any key press first **overwrites the entire existing value**" — cada abertura
  é uma sessão de edição nova;
- "there are **no explicit system keyboard key-press events** to be
  intercepted" — só dá para ler `value`;
- "When appended to an off-screen location, like outside the underlying
  viewport, **the web page scrolls to the text field**" — o `<input>` tem que
  ficar DENTRO do viewport (1×1 px, `opacity:0`), não em `left:-1000vw`.

E o posicionamento do teclado **não é controlável**: a issue que pedia isso foi
aberta pelo próprio engenheiro da Meta e fechada em 2024-10-23 sem resolução —
[immersive-web/webxr#1321](https://github.com/immersive-web/webxr/issues/1321) **[P]**.

---

## 2. Quanto custa digitar em RV — os números

Todos com N e desvio, das publicações originais.

| Técnica | pal/min | erro | N | fonte |
|---|--:|--:|--:|---|
| Controlador apontado (raio) | **15,44 ± 2,68** | 0,97 % | 24 | Speicher, CHI 2018 **[P]** |
| Controlador batendo tecla | 12,69 ± 2,27 | 1,94 % | 24 | idem |
| Cabeça apontando | 10,20 ± 1,91 | 1,15 % | 24 | idem |
| Mão livre no ar | 9,77 ± 4,78 | 7,57 % | 24 | idem |
| Teclado "bateria" (baquetas) | 24,61 | 7,2 % | 17 | Boletsis 2019 **[P]** |
| Teclado FÍSICO usado dentro da RV | 26,3 ± 15,7 | 2,1 % | 24 | Grubert, IEEE VR 2018 **[P]** |
| **Celular, fora da RV** | **36,17 ± 13,22** | 2,34 % | 37 370 | Palin, MobileHCI 2019 **[P]** |
| **Teclado físico, fora da RV** | **51,56 ± 20,2** | 1,17 % | 168 960 | Dhakal, CHI 2018 **[P]** |
| Ditado por voz (celular) | 153 | 1,30 % | 48 | Ruan, arXiv 1608.07323 **[P]** |

Citações verificadas nos PDFs:
"WPM ranged between 5.31 (SD = 1.05) for DC and 15.44 (SD = 2.68) for CP"
([Speicher et al.](http://web.archive.org/web/20190427190302id_/https://research.aalto.fi/files/27028829/ELEC_speicher_et_al_Selection_based_Text_Entry_in_Virtual_Reality.pdf));
"The average typing speed was 36.2 WPM with 2.3% uncorrected errors"
([Palin et al.](https://userinterfaces.aalto.fi/typing37k/resources/Mobile_typing_study.pdf));
"The average WPM value for participants is 51.56 (SD = 20.2)"
([Dhakal et al.](https://userinterfaces.aalto.fi/136Mkeystrokes/resources/chi-18-analysis.pdf)).

**Correção de um número que circulava aqui.** O cabeçalho antigo do módulo dizia
"em torno de 10 palavras por minuto — um terço do que a mesma pessoa faz no
celular". O certo é **15,4 contra 36,2 pal/min, ou seja 43 %** — menos da
metade, não um terço. A conclusão não muda; o número, sim.

**A voz é rápida e cara em outra moeda.** O único estudo recente que mede
ditado *dentro* da RV (preprint, venue não confirmado) registra 154,75 pal/min
**e** a pior nota de imersão de todos os métodos testados:

> "a distinct anomaly emerged with Voice Input: despite being the fastest
> method, it received the **lowest score for Flow (2.19)**. Interviews revealed
> that users felt dictation was **passive and disconnected from the virtual
> environment, breaking their sense of immersion**."
> — [*Beyond Ray-Casting*, arXiv 2603.18435, 19 mar 2026](https://arxiv.org/abs/2603.18435) **[P, preprint]**

---

## 3. Voz por conta própria (Web Speech API) — não conte com ela

- MDN browser-compat-data marca `SpeechRecognition` no Quest Browser como
  `mirror` — ou seja, **inferido** do Chrome Android, **não testado**. Não é
  evidência. **[P]**
- No Chromium o reconhecimento em rede depende de um serviço do Google:
  `const char kWebServiceBaseUrl[] = "https://www.google.com/speech-api/full-duplex/v1";`
  — [`content/browser/speech/network_speech_recognition_engine_impl.cc`](https://raw.githubusercontent.com/chromium/chromium/main/content/browser/speech/network_speech_recognition_engine_impl.cc) **[P]**.
  Fork de Chromium é exatamente onde esse tipo de dependência costuma não vir.
- Diálogo de permissão de microfone **não aparece dentro de sessão imersiva**:
  quem quiser voz tem que pedir `getUserMedia()` ANTES de entrar em XR. **[S]**

**Se um dia se quiser voz aqui, o caminho barato é o ditado que já vem dentro do
teclado do sistema** (§1.3), não a Web Speech API. Duas ressalvas da Meta, e as
duas doem num projeto brasileiro:

> "**Online dictation: Only available to users in the United States.**"
> "**On-device dictation: An opt-in feature available globally**"
> — [Meta, *Learn about Voice Dictation on Meta Quest*](https://www.meta.com/help/quest/463323051789865/) **[P]**

---

## 4. Como o gênero resolve — e por que o modelo do Apex NÃO serve aqui

### 4.1 As duas famílias, e só uma é permitida neste jogo

| família | o que transmite | aqui |
|---|---|---|
| **ping de LUGAR** | uma coordenada de mundo, muitas vezes através de parede | **PROIBIDO** |
| **quick chat / grito** | um item de uma lista fechada, preso a quem falou | liberado |

O `server.js` retira posição do `roster` de propósito —
`roster(withPos)`: *"pos só no init — broadcast viraria wallhack"*. Uma roda de
ping recriaria exatamente o canal que o anti-cheat fecha. Não é escopo: é
invariante.

E é o que os BRs de RV fazem: **Population: ONE** tem roda de ping **100 %
posicional** (*"Waypoint Marker: Greatly increased ping distance and limited the
loot ping distance"*, [patch 2021-03-11](https://store.steampowered.com/news/app/691260/view/4058279008610062979) **[P]**), e **Breachers** tem drone que
**pinga inimigos automaticamente** ([patch v32.0](https://store.steampowered.com/news/app/1922010/view/1813041031375348) **[P]**).

Para **Contractors Showdown, Ghosts of Tabor, Pavlov, Onward e Gorilla Tag**:
**NÃO ENCONTRADO** nenhum quick chat nem ping — negativa obtida varrendo 749
anúncios oficiais pela API do Steam. Esses jogos resolvem **só com voz**.
Ou seja: **não há precedente de BR em RV para copiar aqui.** O precedente bom é
de tela plana.

### 4.2 O que o `server.js` DECIDE sobre o vocabulário

Duas medições no código, e elas mudam a lista de mensagens:

1. `grep -Ei "\bteam\b|\bsquad\b|equipe|\bduo\b|\btrio\b" server.js` → **vazio**.
   Não existe time. É todos contra todos.
2. `socket.on('chat')` termina em `io.emit('chat', { nick, msg })` → o chat é
   **global**, vai para todo mundo.

Logo, o vocabulário de esquadrão do Apex (`PRECISO DE AJUDA!`, `INIMIGO POR
PERTO!`, `VAMOS!`, `ESPERA AÍ`) **não tem a quem se dirigir**: não há aliado
para socorrer, e avisar "inimigo por perto" num canal global é avisar o próprio
inimigo. O precedente certo é o **quick chat do Rocket League**, que também é
global e também atravessa lados:

> "filtered by categories, \"Information, Compliments, Reactions,\" and
> \"Apologies\"" — [Psyonix, 2016-05-18](https://www.rocketleague.com/en/news/we-re-expanding-your-quick-chat-options) **[P]**

> "you will still see tactical Quick Chats when they are used by players on the
> opposing team" — [Rocket League, patch v2.22, 2022-11-01](https://www.rocketleague.com/en/news/patch-notes-v2-22) **[P]**

É por isso que `RAPIDAS` foi trocada para reação / elogio / cortesia:
`OI, PESSOAL!`, `BORA COMEÇAR!`, `QUE TIRO!`, `ESSA DOEU`, `QUASE!`, `VALEU!`,
`FOI MAL`, `BOM JOGO`.

### 4.3 O aval de projeto

O sistema de ping do Apex existe declaradamente para dispensar teclado e
microfone:

> "Apex Legends has an efficient ping system that lets you share important
> information quickly **without needing to type or use a microphone**."
> — [EA Help](https://help.ea.com/en/help/apex-legends/apex-legends/how-to-play-apex-legends/) **[P]**

E a GDC 2019 usa o Apex como o exemplo do teto dessa abordagem — junto com o
preço dela:

> "we can see promises of this kind of option in Apex Legends. Its ping system
> is so robust that you could build an entire game around it, **disabling
> linguistic communication entirely**" […] "The sacrifice here is the
> communication channel that allows relationships to build."
> — [Alex Jaffe, *Cursed Problems in Game Design*, GDC 2019](https://media.gdcvault.com/gdc2019/presentations/Jaffe_Alex_Cursed_Problems_In.pdf) **[P]**

Do lado da Meta, o argumento é de acessibilidade e de moderação:

- **VRC.Quest.Accessibility.1** (recomendado): *"Application should be playable
  in its entirety without the use of audio…"* — fala é um dos cinco grupos que a
  Meta nomeia. [**[P]**](https://developers.meta.com/horizon/resources/vrc-quest-accessibility-1/)
- *"You should incorporate simple communication gestures and shortcuts…"* —
  [Meta, *Social design*](https://developers.meta.com/horizon/design/social-design/) **[P]**
- A Meta embaralha voz de estranhos por padrão, e contas geridas por responsável
  em Population: ONE **não têm voz nenhuma**: *"For Parent-Managed Meta Accounts,
  voice chat is not available in POPULATION: ONE."* — [BigBox VR](https://support.bigboxvr.com/hc/en-us/articles/19213579696020) **[P]**

**Deep Rock Galactic** dá o padrão de entrada que separa as duas famílias num
botão só (toque = grito social, segurar = apontador posicional), e confirma que
o grito é mecanicamente inerte: *"While shouting \"Rock And Stone\" in the
computer game doesn't actually affect gameplay…"* — [Ghost Ship Games](https://store.steampowered.com/news/app/548430/view/3938951840883524755) **[P]**

---

## 5. A decisão

**Três canais, cada um no seu momento. Nenhum deles é um teclado desenhado por
nós.**

1. **DURANTE a partida: roda de mensagens rápidas** (é o que está implementado).
   Lista fechada, sem lugar, pelo evento `chat` que já existe e que o servidor
   já limita a uma a cada 1200 ms e corta em 120 caracteres. Motivo com fonte:
   teclado apontado custa 15,4 pal/min (§2) e o teclado do sistema **tira a
   entrada do jogador** (§1.3). Vocabulário de FFA global (§4.2).
2. **FORA da partida (apelido, lobby, tela de morte): teclado do sistema.**
   `session.isSystemKeyboardSupported`, `<input>` 1×1 `opacity:0` **dentro do
   viewport**, `.focus()` na borda de subida do gatilho (gesto do usuário), ler
   `value` no `oninput`, remover ao sair da sessão. Traz readout, autocorreção,
   emoji, idiomas e ditado de graça. Zero draw call, zero `Math.random`, zero
   canal novo no servidor. **NÃO foi implementado nesta rodada** — ver §6.
3. **Não implementar Web Speech API** (§3), e **não implementar ping de lugar**
   (§4.1).

### Por que o item 2 ficou de fora desta rodada

Porque não dá para verificá-lo aqui. O runtime emulado (IWER) não implementa
`isSystemKeyboardSupported`, o Chrome do PC devolve `false`, e a única prova
possível é **vestir o Quest**. Código que nenhum teste alcança, num arquivo que
já tem contrato escrito, é a receita do defeito que a rodada seguinte gasta o
dia consertando. O caminho está documentado acima com a receita completa; a
próxima rodada com aparelho na mão fecha em uma tarde.

---

## 6. Lacunas declaradas

1. **Pal/min do teclado do sistema do Quest: NÃO ENCONTRADO.** Nenhum estudo
   publicado mede o teclado que a Meta realmente entrega — todos os números da
   literatura são de teclados de pesquisa. Só se resolve medindo no aparelho.
2. **Se pt-BR está entre os idiomas do teclado, e se o ditado no aparelho tem
   pacote pt-BR: NÃO ENCONTRADO.** A Meta não publica a lista. Dois minutos no
   headset resolvem.
3. **Se o botão de microfone aparece no teclado levantado de dentro de
   `immersive-vr`:** provável (é o mesmo teclado do sistema), **não provado** —
   a doc de WebXR da Meta não menciona ditado. Verificação obrigatória antes de
   prometer ditado a alguém.
4. **Web Speech API no Quest Browser: NÃO VERIFICADO.** O MDN só espelha o
   Chrome. A única fonte direta localizada (uma thread do r/WebXR) devolveu 403
   em todas as rotas — só o título foi lido, e título não é fonte.
5. **Palestra de GDC sobre o sistema de ping do Apex: NÃO EXISTE.** Busca
   restrita ao domínio voltou vazia. Se alguém citar, está citando de memória.
6. **Enumeração oficial da roda de ping de Population: ONE e do binding padrão
   do quick chat do Rocket League: NÃO ENCONTRADO** — as duas fontes (Fandom e
   `support.rocketleague.com`) respondem 403.
