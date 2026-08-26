# Tato e ciclo de sessão — o que a spec, a Meta e o gênero dizem

Data: 2026-08-26 · base `dev` @ `bbe6b48` · three r0.185.1 · IWER 2.3.0
Escopo: **B6 (háptico)**, **E1 (taxa de quadros declarada)** e o resto da
**categoria F (ciclo de sessão)** de `docs/vr/criterio-aaa.md`.

Este documento é o "estudei antes de codar" que a skill `vr-quest` exige. Cada
número que entrou em `js/xr/xrhaptics.js` e `js/xr/xrframerate.js` tem aqui a
fonte ou a derivação — e o que **não** tem fonte está marcado como derivação,
não como citação.

---

## 0. O ponto de partida, medido

`docs/vr/validacao-98b114f.md` (validação independente do commit `98b114f`):

| grandeza | medido | onde precisa estar |
|---|--:|--:|
| chamadas de háptico no repositório inteiro | **0** (2 atuadores disponíveis) | ≥ 1 por tiro |
| `updateTargetFrameRate` | **nunca chamado**; `session.frameRate = 90` | 72 declarado |
| `supportedFrameRates` da sessão | `[72, 80, 90, 120]` | — |
| F2 · pausar ao perder foco | 3 de 4 comportamentos certos; `state.paused` continua `false` | os 4 |

Reconferido nesta rodada, no HEAD `bbe6b48`:

```
$ grep -rnE "hapticActuator|\.pulse\(|vibrationActuator|updateTargetFrameRate" \
      --include="*.js" . | grep -v node_modules
(nada)
```

Zero. O que se segue é a construção do vocabulário que ocupa esse zero.

---

## 1. Háptico: a API, e o que ela promete de verdade

### 1.1 Onde o atuador mora

A spec do **WebXR Gamepads Module** não fala em háptico em lugar nenhum — ela
só diz de onde vem o `Gamepad`:

> "Button, trigger, thumbstick, and touchpad data is reported though a Gamepad
> object exposed on the XRInputSource it is associated with."
> — <https://immersive-web.github.io/webxr-gamepads-module/>

E deixa claro que esse `Gamepad` **não** aparece no caminho normal:

> "Gamepad instances returned by an XRInputSource's gamepad attribute MUST NOT
> be included in the array returned by navigator.getGamepads()."

Ou seja: o háptico do controle de VR chega pela **Gamepad API comum**, montada
em cima de um objeto que só existe dentro da sessão XR. O caminho é
`XRInputSource.gamepad.hapticActuators[0]` — que é exatamente o que o critério
B6 cobra e o que a validação confirmou existir (2 atuadores, um por controle).

**Consequência de projeto, e ela é grande:** não existe nada "de WebXR" que
avise quando o háptico não está disponível. Fonte de entrada sem `gamepad`,
`gamepad` sem `hapticActuators`, array vazio, `pulse` ausente — os quatro casos
acontecem e nenhum deles lança. Quem não degrada explicitamente, quebra.

### 1.2 `pulse(value, duration)` — os números

> **`value`**: "A double representing the intensity of the pulse. This can vary
> depending on the hardware type, but generally takes a value between 0.0 (no
> intensity) and 1.0 (full intensity)."
> **`duration`**: "A double representing the duration of the pulse, in
> milliseconds."
> **Retorno**: "A promise that resolves with a value of `true` when the pulse
> has successfully completed."
> — MDN, <https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/pulse>

E a frase que governa toda a política deste módulo:

> "Repeated calls to `pulse()` override the previous calls if they are still
> ongoing." — MDN, idem

A spec do W3C diz o mesmo em uma linha:

> "`pulse()` applies a value to the actuator for duration milliseconds. […]
> Repeated calls to `pulse()` override the previous values."
> — <https://w3c.github.io/gamepad/extensions.html>

**Três consequências diretas, e cada uma virou linha de código:**

1. **Não existe mixagem.** Dois eventos no mesmo instante não somam: o segundo
   *corta* o primeiro. Um pulso de tiro de 27 ms interrompido aos 3 ms por um
   tique de UI não é "tiro + UI", é **nenhum dos dois**. Por isso o módulo tem
   uma tabela de **prioridade** e um pulso em voo só é interrompido por evento
   de prioridade igual ou maior.
2. **O retorno é uma Promise, e Promise rejeitada sem `catch` é erro de
   console.** O critério I2 é "zero erro de console durante a sessão inteira".
   Todo `pulse()` sai com `.catch()`.
3. **Duração maior que o intervalo entre eventos vira zumbido contínuo.** Vale
   principalmente para arma automática — ver §1.4.

### 1.3 O que a Meta manda (e o que ela não publica)

A Meta **não documenta háptico de WebXR**. As páginas de WebXR do developer
center cobrem frame rate, performance e realidade mista; não há página de
háptico para o navegador. O que existe é a orientação de **design**, que vale
para qualquer runtime:

> "Design and integrate haptic feedback to complement visual and auditory cues."
> "Synchronize haptics with audio and visual feedback with minimal delay."
> Evitar: "Long or overlapping haptic effects that can be overwhelming";
> "Excessive or continuous haptic effects"; háptico sem contexto visual/sonoro.
> E: os usuários devem "be able to mute haptics if desired, and the app should
> remain enjoyable without them."
> — <https://developers.meta.com/horizon/design/haptics-best-practices/>

Do lado do hardware, o que dá para citar do Quest 3:

> Quest 3 usa atuadores "Wideband VCM", com "Frequency and amplitude control:
> sharp and precise clicks, complex signals", operando "across a range of
> frequencies up to 500 Hz".
> — <https://developers.meta.com/horizon/design/haptics-technology/>

**Derivação (não é citação):** um VCM que trabalha até 500 Hz precisa de alguns
ciclos para o dedo registrar o evento como toque em vez de estalo elétrico. Dois
a cinco ciclos em 100–250 Hz (a faixa em que um VCM de controle entrega mais
amplitude) dão de **8 a 50 ms**. Daí o piso de **8 ms** do módulo: abaixo disso
não se promete sensação nenhuma, e prometer seria inventar. O teto de **250 ms**
sai direto do "avoid long or overlapping effects" — acima disso o pulso deixa de
ser evento e vira estado.

Quatro requisitos de loja que tocam esta frente, citados por extenso porque três
deles definem QUANDO o háptico não pode disparar:

- **VRC.Quest.Input.4** (obrigatório) — app focus-aware: "continue rendering
  when they lose focus", "hide any user hands or controllers", "ignore all hand
  or controller input".
  <https://developers.meta.com/horizon/resources/vrc-quest-input-4/>
  → **Sem foco, sem háptico.** Um controle que vibra na mão de quem está no
  Universal Menu é o app furando o foco do sistema.
- **VRC.Quest.Functional.2** (obrigatório) — "Single player apps must pause when
  the Horizon OS requests the app to pause." Vale para o headset tirado, o
  Universal Menu e o passthrough. E a ressalva que importa aqui: *"this
  requirement does not apply to multiplayer apps."*
  <https://developers.meta.com/horizon/resources/vrc-quest-functional-2/>
  → Este jogo é os dois. A pausa é obrigatória no SOLO e proibida no BR online
  (pausar no meio de um tiroteio é exploit, e `playerDamage` já trata `paused`
  como imunidade — com `__BR_active` como exceção explícita).
- **VRC.Quest.Performance.1** (obrigatório) — §2.
- Meta haptics best practices — háptico tem que poder ser **mudo**, e o jogo
  tem que continuar bom sem ele.

### 1.4 O vocabulário: de onde sai cada número

O erro fácil aqui seria inventar oito constantes bonitas. Não precisa: **o peso
por arma já existe nesta base, já é testado e já resolve o problema de
saturação**. `shotTrauma(gun)` (`js/hitfeel-core.js`) devolve o "peso do tiro"
com um teto que **escala com a cadência**:

```js
const heft = 0.05 + kick * 1.3 + (g.pellets > 1 ? 0.04 : 0);
const ceil = (SUSTAIN_CEIL * TRAUMA_DECAY) / rps;      // 0.578 / (rpm/60)
return clamp(Math.min(heft, ceil), TRAUMA_MIN, TRAUMA_MAX);
```

O comentário no arquivo diz por que o teto existe: *"fogo sustentado não pode
passar de SUSTAIN_CEIL de trauma acumulado, porque o decaimento é linear e uma
automática rápida PINAVA o shake no talo"*. É **o mesmo problema** que a Meta
descreve como "excessive or continuous haptic effects", resolvido no domínio
visual há tempo nesta base. Reaproveitar é mais honesto que reinventar — e
mantém arma pesada pesada nos dois sentidos.

Vocabulário do tiro:

```
intensidade = clamp(0.25 + peso * 1.25, 0.25, 1)
duração(ms) = clamp(round(18 + peso * 170), 18, min(90, intervalo_ms * 0.60))
```

O `0.25` de piso é o que separa "senti" de "achei que senti" num VCM;
o `intervalo_ms * 0.60` é a trava anti-zumbido — **o pulso nunca ocupa mais de
60 % do intervalo entre dois tiros**, então mesmo a arma mais rápida entrega
toques separados em vez de vibração contínua. Resultado, com o arsenal real
(`js/weapons.js`):

| arma | rpm | intervalo | peso (`shotTrauma`) | intensidade | ms | ciclo de trabalho |
|---|--:|--:|--:|--:|--:|--:|
| FUZIL "VAGALUME" | 690 | 87,0 ms | 0,050 | 0,31 | **27** | 31 % |
| PLASMA "VISITANTE" | 430 | 139,5 ms | 0,081 | 0,35 | **32** | 23 % |
| FACA "AURORA" | 130 | 461,5 ms | 0,070 | 0,34 | **30** | 7 % |
| SNIPER "AGULHA" | 235 | 255,3 ms | 0,148 | 0,43 | **43** | 17 % |
| DMR "FALCÃO" | 150 | 400,0 ms | 0,193 | 0,49 | **51** | 13 % |
| ESCOPETA "RAJADA" | 175 | 342,9 ms | 0,198 | 0,50 | **52** | 15 % |
| ESCOPETA "TROVÃO" | 78 | 769,2 ms | 0,285 | 0,61 | **66** | 9 % |
| BAZUCA "TROVOADA" | 30 | 2000 ms | 0,440 | 0,80 | **90** | 5 % |

Fuzil e bazuca separados por **3,3× em duração e 2,6× em intensidade**: é essa
razão que faz a mão saber qual arma está segurando de olhos fechados.

Os outros eventos, com a razão de cada escolha:

| evento | mão | intensidade | ms | por quê |
|---|---|--:|--:|---|
| `tiro` | a que segura a arma | tabela acima | tabela acima | o coice é da arma, e a arma está em UMA mão |
| `acerto` (hit) | a mesma | 0,35 | 22 | confirmação é *clique*, não coice — e mais curta que o hitmarker visual (110 ms) |
| `acerto` (head) | a mesma | 0,60 | 34 | o sabor sobe junto com o visual (170 ms) |
| `acerto` (kill) | a mesma | 0,85 | 55 | idem (260 ms) |
| `recarga` | a mão de APOIO | 0,40 | 45 | é a mão que puxa e leva o carregador |
| `recarga-pronta` | a que segura a arma | 0,75 | 30 | ferrolho/clack: **forte e curto**, que é o que "encaixou" parece |
| `dano` | **as DUAS** | 0,35 + dano·0,006 (0,35–0,90) | 60 + dano (60–180) | dano é no corpo, não na mão; duas mãos é o único jeito de dizer "isto é você, não sua arma" |
| `dano` letal | as duas | 1,00 | 200 | o golpe que quase mata bate diferente (o mesmo que `HitFeel.tookHit` já faz na tela) |
| `pegar` | a que pegou | 0,45 | 40 | confirmação de que o item entrou |
| `ui-foco` | a que aponta | 0,15 | 10 | o tique mais leve que ainda registra: passar por cima de uma linha |
| `ui-toque` | a que aponta | 0,50 | 18 | o clique da escolha |

Os sabores de `acerto` são os mesmos três de `hitmarkerFlavor` — o tato conta a
MESMA história que a tela, que é o "complement visual and auditory cues" da
Meta, e não uma segunda história.

**Prioridade** (quem interrompe quem, ver §1.2.1):

```
dano (40) > acerto (30) > tiro (20) > recarga-pronta (16)
          > recarga (12) > pegar (10) > ui-toque (6) > ui-foco (2)
```

Regra: um pulso em voo só é interrompido por prioridade **≥**. Isso resolve o
caso concreto que aparece toda partida — o tiro do fuzil (27 ms) e o hitmarker
que chega 2 ms depois: o `acerto` (30) manda no `tiro` (20), o jogador sente a
confirmação, e não os dois pela metade. E resolve o inverso: o `ui-foco` (2) não
pode cortar nada.

### 1.5 O que o gênero faz

Não há número publicado por Alyx, Onward, Pavlov ou Contractors — nenhum deles
documenta a curva de háptico. O que dá para afirmar com fonte é o **acordo de
projeto**, e ele é unânime nas três direções que este módulo segue:

- **Háptico é confirmação, não espetáculo.** É o "subtle and supportive rather
  than dominant" da Meta. Nenhum FPS de VR vibra continuamente enquanto se
  atira; todos batem por disparo.
- **Háptico segue a mão, não o corpo** — exceto o dano. É a consequência direta
  de **VRC.Quest.Input.3** (obrigatório): *"As mãos e controles dentro da
  aplicação devem coincidir com os equivalentes do mundo real do usuário"*
  (citada em `criterio-aaa.md` §3/B1). Uma arma que está na direita não pode
  fazer a esquerda vibrar.
- **Háptico é desligável.** Meta best practices, literal.

---

## 2. Taxa de quadros: por que 72, e por que declarar

### 2.1 A API

Spec do W3C (<https://www.w3.org/TR/webxr/>):

> "The `supportedFrameRates` attribute returns a list of supported target frame
> rate values. This attribute is optional and MUST NOT be present for inline
> sessions."
> "The `frameRate` attribute reflects the internal nominal framerate. If the
> XRSession has no internal nominal framerate, return null."
> "The nominal frame rate: the rate at which the XRSystem is asking the
> experience to render frames to maintain nominal performance."
> "If rate is not in `supportedFrameRates`, reject promise with a `TypeError`."
> `updateTargetFrameRate` rejeita com `InvalidStateError` se "the session has no
> internal nominal framerate" ou se a sessão terminou.
> "If XRSession's nominal frame rate is changed **for any reason**, it MUST
> apply the nominal frame rate with the new nominal frame rate […]" (evento
> `frameratechange`).

Três coisas que essa leitura obriga, e que o módulo implementa:

1. **`supportedFrameRates` é um `Float32Array`, não um `Array`.** `Array.isArray`
   devolve **false** nele. É a MESMA armadilha do `inputSources` que já custou
   cinco relatos de "os controles não funcionam" nesta base (skill `vr-quest`).
   Guardar a lista com `Array.isArray` = nunca declarar taxa nenhuma, em
   silêncio.
2. **Pedir uma taxa fora da lista REJEITA.** Não é no-op: é Promise rejeitada, e
   sem `catch` vira erro de console (critério I2).
3. **A taxa pode mudar por fora.** O sistema pode baixar sozinho; o app tem que
   ler o `frameratechange`, não presumir que o valor pedido é o valor em vigor.

### 2.2 O que a Meta diz

> "A WebXR session on the Browser runs by default at 90 frames per second on
> Meta Quest 2 and 72 frames per second on Meta Quest headsets."
> APIs disponíveis a partir do **Browser 16.4+**:
> ```js
> if ( session.supportedFrameRates !== undefined) {
>     let framerateList = session.supportedFrameRates;
>     session.updateTargetFrameRate( framerateList[0] ).then(
>         () => console.log( "frame rate was applied" ) );
> }
> ```
> E o critério de escolha: monitorar o tempo entre frames; se ele passa do
> orçamento do alvo ("e.g., 11ms for 90Hz"), "you should set a lower rate".
> — <https://developers.meta.com/horizon/documentation/web/webxr-frames/>

**Reparar no que essa frase da Meta significa aqui:** o padrão do navegador
**não é 72**. Na sessão emulada preset Quest 3 (IWER 2.3.0,
`internalNominalFrameRate: 90`) e na medição do validador no commit `98b114f`, a
sessão nasce a **90**. Ou seja, o padrão herdado é o mais caro dos dois, e a
única forma de ficar em 72 é **pedir**.

Requisito de loja:

> Apps interativos devem usar "72 Hz, 80 Hz, 90 Hz, 96 Hz, 100 Hz or 120 Hz"
> (96/100/120 não em todos os aparelhos) e "must maintain a rendering rate of at
> least 60 fps"; testado rodando o app por até 45 minutos e lendo o gráfico de
> FPS do OVR Metrics Tool.
> — VRC.Quest.Performance.1,
> <https://developers.meta.com/horizon/resources/vrc-quest-performance-1/>

### 2.3 A justificativa MEDIDA — a única parte que decide

Orçamento por frame:

| taxa | ms por frame | contra 90 Hz |
|---|--:|--:|
| 120 Hz | 8,33 ms | −25 % |
| 90 Hz | 11,11 ms | — |
| 80 Hz | 12,50 ms | +12,5 % |
| **72 Hz** | **13,89 ms** | **+25,0 %** |

E o que o jogo pede hoje, de `docs/vr/perf-xr.md` (sessão imersiva real, IWER
preset Quest 3, estéreo, **com** o preset de qualidade aplicado):

| pose | draw calls | triângulos |
|---|--:|--:|
| spawn | 495 | 1,66 M |
| cidade | 515 | 1,34 M |
| **castelo** | **775** | **1,88 M** |

Teto interno: **180 draw calls e 500 k triângulos**. Teto publicado pela Meta
para Quest 3: < 200 draw calls e < 1,5 M triângulos. A pose de castelo está a
**4,3×** do teto interno de draw calls, e a conclusão escrita do próprio
`perf-xr.md` é: *"É preciso cortar 78 %, e o preset entrega 4–9 %."*

**A decisão, então, é aritmética e não gosto:** um quadro que está a 4,3× do
orçamento não cabe em 11,11 ms. 72 Hz devolve **2,78 ms por frame — 25 % a mais
de orçamento — de graça, numa linha**, e é a única alavanca desta frente que
paga dois dígitos sem tocar em conteúdo, em `Math.random` seedado ou em
arquitetura de render. Os 78 % que faltam continuam sendo dos itens 1–5 do
`perf-xr.md`; declarar 72 não os substitui, e este documento não finge que
substitui.

**Por que não 80 Hz:** 12,50 ms é +12,5 %, metade do ganho, e a frase da própria
Meta é "if it exceeds your target frame time […] you should set a lower rate".
Com 4,3× de excesso medido, escolher o degrau do meio é otimismo sem dado.
**Por que não 120 Hz:** 8,33 ms — cortar orçamento em 25 % num quadro que já não
cabe é escolher engasgo. O alvo declarado do projeto é 72, e o dado sustenta.

**Quando revisar:** quando `npm run vr:censo` mostrar a pose de castelo dentro
de 180 draw calls E o `adb logcat -s VrApi` mostrar App < 13,89 ms com margem em
30 minutos, 80 Hz volta à mesa. Antes disso, não.

---

## 3. O resto do ciclo de sessão (categoria F)

O que já existe no HEAD, e o que a leitura das VRCs diz que falta:

| item | estado no `bbe6b48` | fonte |
|---|---|---|
| continua desenhando sem foco | ✅ medido pelo validador (frames 3792 → 3847 → 3937) | Input.4 |
| esconde as mãos sem foco | ✅ `mao`/`punho` em `visible:false` | Input.4 |
| ignora entrada sem foco | ✅ analógico cravado 600 ms → velocidade 0,00 | Input.4 |
| **pausa** sem foco | ⚠️ `game.js` abre o painel `'pausa'` quando `XR.visibility !== 'visible'` — mas isso é UI; `state.paused` é outra coisa, e o BR online **não pode** pausar | Functional.2 |
| **háptico** sem foco | ❌ inexistente hoje; nasce **já com o portão** | Input.4 |
| sair da sessão devolve o desktop intacto | ✅ `quality.restaurar()` no `XR.sync` | F4 |
| taxa declarada | ❌ nunca | Performance.1 |

O portão de foco do háptico é o item novo desta frente: `emitir()` consulta a
visibilidade **antes** de tocar no atuador, e `visible-blurred`/`hidden` viram
no-op silencioso. Sem isso, o app fura o foco do sistema pelo único canal que
não é gráfico.

---

## 4. O que o emulado prova e o que só o aparelho confirma

O IWER **emula háptico**, e melhor do que se esperava. Descoberta desta rodada,
lida no código do runtime (não suposta):

```js
// node_modules/iwer/lib/gamepad/Gamepad.js
export class GamepadHapticActuator {
  pulse(value, duration) {
    this[P_GAMEPAD].lastPulse = { value, duration, startTime: performance.now() };
    return Promise.resolve(true);
  }
}
```

- O perfil `meta-quest-touch-plus` (Quest 3) declara `numHapticActuators: 1`
  **por mão** — os "2 atuadores" que a validação contou.
- O runtime **guarda o último pulso** (`value`, `duration`, `startTime`), e o
  símbolo `P_GAMEPAD` é exportado pelo pacote (`export * from './private.js'`,
  presente no bundle UMD). Ou seja: dá para ler do lado de fora **o registro que
  o próprio runtime fez**, sem instrumentar nada do produto.
- `updateTargetFrameRate` é implementado de verdade: valida contra
  `supportedFrameRates`, muda `session.frameRate` e dispara `frameratechange`.

E o limite, escrito pelos próprios autores do runtime:

```js
// node_modules/iwer/lib/session/XRSession.js
// the nominal frame rate updates are emulated, no actual update to the
// display frame rate of the device will be executed
```

| pergunta | quem responde |
|---|---|
| o pulso saiu, na mão certa, com valor e duração certos? | **emulado** (`lastPulse` do runtime) |
| a prioridade impede pulso fraco de cortar pulso forte? | **emulado** |
| sem foco, nenhum pulso sai? | **emulado** (`dev.updateVisibilityState`) |
| a sessão passou a declarar 72 em vez de 90? | **emulado** (`session.frameRate`) |
| pedir taxa fora da lista rejeita sem derrubar nada? | **emulado** |
| **o VCM do controle vibra, e o jogador SENTE?** | **só o aparelho** |
| **a curva de intensidade separa fuzil de bazuca no dedo?** | **só o aparelho** (e um humano) |
| **o compositor passou a rodar a 72 Hz?** | **só o aparelho** (`adb logcat -s VrApi`, campo `FPS=x/72`) |
| **72 Hz travados por 20 min sem degradar?** | **só o aparelho** (E1/E5) |

Nada aqui afirma sensação. O emulado prova **o comando**; o dedo prova **o
efeito**.

---

## 5. Fontes

- MDN, `GamepadHapticActuator.pulse()` —
  <https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator/pulse>
- MDN, `GamepadHapticActuator` —
  <https://developer.mozilla.org/en-US/docs/Web/API/GamepadHapticActuator>
- W3C, Gamepad Extensions —
  <https://w3c.github.io/gamepad/extensions.html>
- W3C, WebXR Device API (frame rate, nominal frame rate, `frameratechange`) —
  <https://www.w3.org/TR/webxr/>
- W3C/Immersive Web, WebXR Gamepads Module —
  <https://immersive-web.github.io/webxr-gamepads-module/>
- Meta, WebXR App Framerate Control —
  <https://developers.meta.com/horizon/documentation/web/webxr-frames/>
- Meta, VRC.Quest.Performance.1 —
  <https://developers.meta.com/horizon/resources/vrc-quest-performance-1/>
- Meta, VRC.Quest.Input.4 (focus-aware) —
  <https://developers.meta.com/horizon/resources/vrc-quest-input-4/>
- Meta, VRC.Quest.Functional.2 (pausa) —
  <https://developers.meta.com/horizon/resources/vrc-quest-functional-2/>
- Meta, Haptics best practices —
  <https://developers.meta.com/horizon/design/haptics-best-practices/>
- Meta, Haptics technology (VCM, até 500 Hz) —
  <https://developers.meta.com/horizon/design/haptics-technology/>
- IWER 2.3.0 (runtime de emulação publicado pela Meta), lido em
  `node_modules/iwer/lib/gamepad/Gamepad.js`,
  `node_modules/iwer/lib/session/XRSession.js`,
  `node_modules/iwer/lib/device/configs/controller/meta.js` e
  `node_modules/iwer/lib/device/configs/headset/meta.js`
- Neste repo: `docs/vr/criterio-aaa.md` (B6, E1, F2–F5),
  `docs/vr/validacao-98b114f.md`, `docs/vr/perf-xr.md`,
  `js/hitfeel-core.js` (`shotTrauma`, `hitmarkerFlavor`), `js/weapons.js`
