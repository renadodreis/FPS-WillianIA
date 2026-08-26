---
name: vr-quest
description: Use ao desenvolver, medir ou depurar o porte VR deste jogo no Meta Quest 3 (WebXR) — subir o jogo no headset, medir FPS e draw calls sem ninguém usando o aparelho, rodar sessão imersiva no PC sem headset, e as armadilhas de adb/navegador/three que já custaram horas. Também ao mexer em js/xr/, no rig de câmera, no loop de render ou na entrada dos controles Touch.
---

# Desenvolver VR neste jogo (Meta Quest 3, WebXR)

**Mantenha esta skill atualizada.** Toda armadilha nova que custar mais de
30 minutos entra aqui, com o sintoma e a medição. Ela existe porque quase todo
item abaixo foi descoberto do jeito caro.

## A regra que resume tudo

**Verificação de um instante não vale nada — o que vale é o que aguenta dez
minutos de uso.** Túnel cai, aba fica escondida, autorização expira. "Testei e
funcionou" já mandou o dono do projeto vestir o headset para encontrar tela
travada. Meça, e meça de novo depois.

## Como o jogo chega no headset

O WebXR só existe em **contexto seguro**. Servir por IP de rede local NÃO
funciona: `navigator.xr` simplesmente não aparece. Dois caminhos:

1. **`adb reverse`** (desenvolvimento): o aparelho enxerga `http://localhost:<porta>`
   como local, e isso conta como seguro.
   ```
   adb reverse tcp:3000 tcp:3000
   adb shell am start -n com.oculus.browser/.OculusLauncherActivity \
       -a android.intent.action.VIEW -d "http://localhost:3000/"
   ```
2. **HTTPS de verdade** (uso real): sem cabo, sem adb, sem autorização.

### O túnel cai e a tela congela

Quando o adb perde autorização, o `adb reverse` morre junto. A página fica na
tela com o menu na cara e **nada responde** — não é opção quebrada, é o servidor
sumindo do ponto de vista do aparelho. Sintoma idêntico a bug de UI.

Antes de culpar o jogo:
```
adb devices              # 'unauthorized' explica tudo
adb reverse --list       # vazio = túnel morto
```
Cabo instável derruba a autorização repetidamente. `adb tcpip 5555` +
`adb connect <ip>` tira o cabo do caminho (o IP sai de `adb shell ip route`).

### Abas duplicadas matam a interação

Abrir o jogo por intent várias vezes deixa abas empilhadas. As de trás ficam
`visibilityState: hidden`, **param de desenhar** e não respondem a clique — para
sempre. Quem estiver de headset clica numa tela morta.

**Deixe SEMPRE uma aba só.** Confira antes de pedir para alguém testar:
```
curl -s http://127.0.0.1:9222/json/list | grep '"url"'
```

## Quando alguém disser "os controles não funcionam"

`npm run vr:controles` (opcional `--entrar`, `--segundos=N`). Ele verifica NOVE
camadas em ordem e **para na primeira que falhar**, dizendo o que fazer:

    1 adb · 2 controles · 3 túnel · 4 navegador · 5 abas · 6 página
    7 SESSÃO IMERSIVA  ← o portão · 8 fontes de entrada · 9 sinal de verdade

**Regra do script, e a lição que o pariu:** nada da camada 7 pra baixo é
reportado sem `XR.presenting === true` confirmado NA PÁGINA. A sonda antiga não
tinha esse portão, lia uma aba que estava no menu da biblioteca do sistema e
afirmava "0 fontes de entrada" — com confiança, cinco vezes seguidas, enquanto o
dono do projeto repetia que os controles não funcionavam. **Sonda que mede a
coisa errada é pior que sonda nenhuma: produz afirmação confiante e falsa.**

Duas leituras da camada 2 que enganam:

- **`CONNECTED_INACTIVE` não é controle quebrado.** É controle parado na mesa:
  pareado, bateria cheia, sem mandar nada. Some com um botão apertado. Quem só
  olha "chegou entrada?" confunde isso com defeito de software.
- **`Hand tracking enabled: 0` + nenhum controle ativo = sessão sem entrada
  nenhuma**, e isso é o aparelho, não o jogo.

## Medir sem ninguém dentro do headset

`npm run vr:baseline -- --target=quest --immersive=1` faz o ciclo inteiro.
As três fontes, e o que cada uma vale:

| Fonte | Mede | Vale para |
|---|---|---|
| `npm run vr:emulado` | sessão imersiva REAL no PC (IWER), 2 olhos | draw calls e triângulos em estéreo, grafo do rig, caminho de render, lógica de entrada |
| `adb logcat -s VrApi` | FPS real, tempo de app, GPU%, CPU%, térmica | **tempo** — só o aparelho mede tempo |
| `npm run vr:censo` | de quem são os draw calls, por subtração | escolher o que cortar |
| `npm run vr:controles` | estado real dos controles, camada a camada | "os controles não funcionam" |

### Painel 2D do navegador trava em 30 Hz

FPS medido com o jogo numa aba comum **não mede nada**: o p50 dá 33,3 ms em
qualquer carga. Prova: a pose do castelo tem 2,7× mais draw calls que a do spawn
e a mediana não muda um décimo. É teto de composição do painel, não capacidade.
**Frame time só vale dentro de sessão imersiva.**

### Sessão imersiva sem ninguém no aparelho não desenha

Fora da cabeça, a sessão vira `visible-blurred`/`hidden` e o compositor **para de
chamar** `session.requestAnimationFrame`. A medição sai com zero frame.
Solução de automação (modo desenvolvedor):
```
adb shell am broadcast -a com.oculus.vrpowermanager.prox_close        # finge que está na cabeça
adb shell am broadcast -a com.oculus.vrpowermanager.automation_disable # RESTAURE ao terminar
```
Não restaurar = headset sem dormir, gastando bateria.

### VrApi: a telemetria que não precisa de humano

```
adb logcat -s VrApi:V -v brief
I/VrApi: FPS=58/90,...,App=11.36ms,CPU&GPU=16.88ms,GPU%=0.81,Temp=45.0C,Free=2988MB
```
Uma linha por segundo do runtime: FPS real contra o modo de tela, tempo de
aplicação, ocupação de GPU/CPU, térmica e memória. É a mesma fonte do OVR
Metrics Tool.

## O KIT É A BASE. Dublê escrito à mão é erro primário

**Teste de controle de VR se escreve acionando o runtime emulado, não inventando
objetos `{handedness, gamepad:{axes, buttons}}`.** Dublê à mão tem a forma que
quem escreveu IMAGINOU; o kit tem a forma que a plataforma entrega. Foi por
dublê à mão que a suíte ficou verde enquanto o jogo ignorava os dois controles
no aparelho — cinco relatos seguidos de "os controles não funcionam".

`test/helpers/iwer.js` instala o runtime e expõe `window.__A`:

```js
const { bootEmVR } = require('./helpers/iwer');
h = await bootEmVR(bootGame, { port: 3414 });   // sobe, clica no botão, entra em sessão

// dentro da página:
window.__A.stick('left', 0, -1);                // updateAxes('thumbstick', x, y)
window.__A.botao('right', 'trigger', 1);        // updateButtonValue(id, valor)
window.__A.solta();                             // zera tudo
```

Os **ids** vêm do config oficial da Meta (`iwer/lib/device/configs/controller/meta.js`,
extraído de `webxr-device-config` para Quest 1/2/Pro/3), não de chute:
`trigger`, `squeeze`, `thumbstick`, `x-button`/`y-button` (esquerda),
`a-button`/`b-button` (direita); eixos 0 e 1 **nulos**, 2 e 3 o analógico.

Três detalhes que só aparecem usando o kit de verdade:

- **O perfil do Quest 3 é `meta-quest-touch-plus`.** `oculus-touch-v3` é do
  Quest 2 e entra só como fallback. Quem casa o modelo de mão só com
  `oculus-touch-v3` deixa o Quest 3 sem controle na tela.
- **Não chame `tick` na mão dentro de uma sessão.** Quem chama o frame é a
  sessão; forçar `tick` volta a medir o harness. Espere TEMPO e leia o efeito.
- **`page.evaluate` com string ignora os argumentos.** Por isso o acionador é
  instalado na página (`window.__A`) e os testes são funções normais — costurar
  código por interpolação traz de volta a fragilidade que o kit veio eliminar.

### O que o emulado NÃO pega — medido, não suposto

O IWER declara `class XRInputSourceArray extends Array`, e **subclasse de Array
PASSA em `Array.isArray`**. O navegador nativo implementa a interface do WebIDL,
que não herda de Array e portanto **reprova**.

Experimento, com o defeito reintroduzido de propósito:

| suíte | com o bug `Array.isArray(inputSources) ? … : []` |
|---|---|
| `xr-controle-anda` (IWER, sessão real) | **12/12 passa** — não pega |
| `xr-input` (caso de forma nativa) | **3 falham** — pega |

Ou seja: o kit emulado é a base para tudo (sessão real, controles reais, mapa
oficial, locomoção, conforto, tiro), **e ainda assim é obrigatório ter um caso
com a forma NATIVA** para o que o emulador imita por conveniência. Há um teste
em `xr-controle-anda` que trava essa divergência: se o IWER um dia parar de
herdar de Array, ele falha e avisa que o caso separado virou redundante.

## Desenvolver sem aparelho: IWER

`npm run vr:emulado` injeta o **Immersive Web Emulation Runtime** (preset Quest 3)
e abre sessão imersiva de verdade no Chrome do PC.

Duas armadilhas, as duas custam a tarde:

1. **`installRuntime()` se RECUSA a substituir um runtime nativo.** O Chrome tem
   `navigator.xr` (que responde "não suporto" por não haver headset), então sem
   `{ forceInstall: true }` a emulação não sobe — e o sintoma é só um botão de VR
   que não aparece.
2. **O runtime precisa entrar por `evaluateOnNewDocument`**, antes de qualquer
   script da página: `xrEnv()` lê `navigator.xr` no escopo do módulo. É para isso
   que existe o `initScripts` do `test/helpers/harness.js`.

O que o emulado **não** mede: tempo de frame do Snapdragon. Contagem é igual;
tempo é do aparelho.

## Armadilhas de ferramenta (todas medidas aqui)

- **`adb shell` come `?` e `&` da URL.** Intent com query chega mutilado. Use o
  intent só para ACORDAR o navegador e navegue por CDP.
- **`Page.captureScreenshot` trava** no navegador do Quest. Deixe a captura
  opcional — perder 60 s de medição por causa de um PNG é burrice.
- **O socket de DevTools só existe com o navegador NO AR**, e o nome varia:
  procure em `/proc/net/unix` por `devtools_remote` (o prefixo `chrome_` faz
  parte do nome — grep sem ele não casa).
- **Faxina nunca pode derrubar medição.** `adb forward --remove` de algo já
  removido lança e mata o processo depois do dado colhido. Sempre em try/catch.
- **O headset acorda no diálogo do Guardian**, que fica por cima de tudo; app
  suspenso não expõe socket nem desenha. Confirmar limite de segurança é tarefa
  humana, dentro do headset.

## Contratos do código (js/xr/)

- **`scene > xrRig > camera`.** Em XR o three SOBRESCREVE `camera.position`,
  `quaternion` e `fov` todo frame, calculando a pose da cabeça relativa ao PAI.
  O jogo move o **rig**; o headset move a câmera. `camera.position` deixa de ser
  coordenada de mundo — use `getWorldPosition()`.
- **O rig fica nos PÉS**, não nos olhos. A referência é `local-floor`: a altura
  vem do aparelho, e é isso que faz agachar ser agachar.
- **O rig NASCE PREGUIÇOSO.** Todo `Object3D` gasta 4 números do `Math.random`
  seedado (game.js ~linha 201) no UUID, e a ordem de consumo é contrato do
  worldgen. Um Group criado no boot desloca o mundo de todos os jogadores.
  Há teste contando consumo de `Math.random` para travar isso.
- **`setReferenceSpaceType` ANTES de `setSession`.** Invertido, o jogo nasce em
  `local` (origem na cabeça) e o jogador aparece enterrado até a cintura, **sem
  nenhum erro no console**.
- **O EffectComposer sai do caminho em XR.** Não é otimização: ele desenha nos
  render targets dele, e o framebuffer da sessão não é um deles. Com o composer
  no caminho o headset não recebe imagem.
- **`presenting` vem de `renderer.xr.isPresenting`**, nunca de espelho local — a
  sessão termina por fora (headset tirado, botão do sistema, bateria).
- **A resolução em XR é da sessão.** `setPixelRatio`/`setSize` viram no-op com
  aviso; o botão equivalente é `xr.setFramebufferScaleFactor`.
- **O jogo não move a cabeça do jogador.** Recoil, screen shake, tombo de morte e
  passeio de câmera do menu continuam sendo calculados (alimentam arma e HUD) mas
  não chegam na câmera. Arrastar a vista de quem está com o aparelho na cara é
  enjoo, não game feel.

### Multiview não existe aqui

No three r0.185 o multiview só vive no stack do `WebGPURenderer`
(`src/renderers/common/XRManager.js`). O `WebXRManager.js` do `WebGLRenderer` —
que é o que este jogo usa — tem **zero** ocorrência. Usar exigiria migrar de
renderer e quebraria CSM, EffectComposer, o addon Sky e a injeção de shader da
grama. Decidido: não usar. Cortar draw calls paga melhor e ajuda os dois olhos.

## Controles Touch (js/xr/xrinput.js)

### `session.inputSources` NÃO é um Array — e essa foi a armadilha mais cara

`Array.isArray(session.inputSources)` devolve **`false`**. O tipo é
`XRInputSourceArray`: tem `length`, tem índices, é iterável — e não é `Array`.
O guarda defensivo mais natural do mundo,

```js
const lista = Array.isArray(fontes) ? fontes : [];   // descarta os DOIS controles
```

descartava os controles **todo frame, no aparelho, para sempre**. Sem erro, sem
console, sem exceção: só analógico morto. Aceite qualquer coisa iterável ou com
`length` (`Array.from` / `Array.prototype.slice.call`).

O mesmo vale, por precaução, para `gamepad.axes` e `gamepad.buttons`: são
`FrozenArray`, e não há promessa de que sigam sendo `Array` real.

**A lição de método é maior que o bug.** Vinte testes de unidade estavam verdes
e o dono do projeto relatou "os controles não funcionam" **cinco vezes**. Os
dublês dos testes eram arrays comuns — ou seja, testavam o dublê, não a
realidade. Guarda defensivo que engole entrada é pior que ausência de guarda:
falha em silêncio e ainda parece cuidado.

Por isso existe `test/xr-controle-anda.test.js`: teste de PRODUTO (entra em
sessão, injeta uma coleção com a forma real do navegador, cobra deslocamento do
jogador em metros). Removendo o `comoLista()` ele acusa `moveu 0.000 m` — o
sintoma exato do relato. **Todo dublê de API de navegador tem que ter a forma da
API, não a forma conveniente.**

- **Eixos: use os índices 2 e 3**, não 0 e 1. O par 0/1 é de touchpad, que o
  Touch não tem — ler 0/1 dá analógico morto no aparelho, e isso não se descobre
  sem um Quest na mão. Eixo 3 negativo é "pra frente".
- **Botões** (perfil xr-standard): 0 gatilho, 1 empunhadura, 3 clique do
  analógico, 4 e 5 os botões da mão. O mapa completo, e não sobra botão:

  | | esquerda | direita |
  |---|---|---|
  | analógico | andar | girar em passos |
  | clique do analógico (3) | correr | — |
  | gatilho (0) | — | atirar |
  | empunhadura (1) | agachar / deslizar | mirar |
  | botão de baixo (4) | usar | pular |
  | botão de cima (5) | recarregar | trocar de arma |

- **APERTAR não é SEGURAR, e a diferença mata arma.** No game.js,
  `const want = gun.auto ? mouse.shooting : mouse.clicked`: automática lê o
  estado contínuo, semi-automática lê o CLIQUE — e `mouse.clicked` é zerado a
  cada frame, então só a borda de subida pode escrevê-lo. Escrevendo só
  `mouse.shooting`, pistola, sniper e escopeta ficam **mudas em VR**, sem erro e
  sem console, enquanto o fuzil funciona — o que faz parecer bug de arma, não de
  entrada. Vale o mesmo para trocar de arma: ciclar em rajada nunca para na arma
  que o jogador quer.
- **Sem correr e sem trocar de arma não é FPS.** O Touch não tem fileira de
  números nem roda de mouse: sem mapear, o jogador atravessa o mapa de battle
  royale andando e com a arma inicial a partida inteira.
- **A intenção vira as MESMAS teclas do teclado.** Colisão, rampa, escada,
  veículo e arma continuam sendo o código já testado. Controle novo não pode
  virar física nova.

### A mão mira, a cabeça olha

Levar o desenho de FPS de mouse pra VR sem revisão produz a pior experiência
possível: a arma é filha da CÂMERA e `fire()` usa `camera.getWorldDirection`,
então o jogador precisa **apontar o rosto** para o inimigo. A recomendação da
Meta é ancorar a ação de entrada no controle. Em VR a cabeça olha; a mão mira.

Aqui isso é `js/xr/xrhands.js` + a fonte única `miraOrigem`/`miraDirecao` no
game.js, com fallback pra câmera quando não há mão na sessão (controle dormindo,
só um pareado) — pior experiência é melhor que arma sem direção.

Duas armadilhas, as duas silenciosas:

- **`getWorldDirection` devolve o +Z do objeto.** Só `Camera` sobrescreve para
  -Z. Usado direto no objeto do controle, o tiro sai **para trás da mão**.
  Extraia a direção do quaternion de mundo: `set(0,0,-1).applyQuaternion(q)`
  vale para os dois.
- **Os objetos de controle têm que existir ANTES de `setSession`.** O three
  associa entrada a controle dentro do `inputsourceschange`:

  ```js
  for ( let i = 0; i < controllers.length; i ++ ) { ... }   // WebXRManager.js
  ```

  Com `controllers` vazio (ninguém chamou `getController` ainda) o laço não
  roda, o índice fica -1 e a fonte de entrada é **DESCARTADA** — e o evento não
  se repete. Sintoma: mão em `visible:false`, pose identidade, para sempre, sem
  erro e sem console. Por isso `criar()` (antes de pedir a sessão) é separado de
  `anexar()` (depois, quando o rig existe).

### Direção é do MUNDO, nunca da câmera local

`camera.quaternion` em XR é a pose da CABEÇA RELATIVA AO RIG. Calcular "pra
frente" com ela ignora o giro do rig: um passo de snap turn, ou o jogador virado
de corpo, e andar pra frente o leva para o lado oposto do que ele enxerga.
Girado 180°, **exatamente invertido** — foi o relato "pra frente vai pra trás".
Use o quaternion de MUNDO (`getWorldQuaternion`), que inclui o rig.

**E teste DIREÇÃO, não distância.** O teste que existia media quantos metros o
jogador andou e ficava verde com o movimento apontando para trás. O que pega é
o produto escalar entre o deslocamento e a vista: 1 é pra frente, **-1 é o bug**.

### Conforto é contrato, não gosto

- **Giro em PASSOS de 45°, um por inclinada.** Girar o mundo suave debaixo de
  quem está fisicamente parado é a causa mais conhecida de enjoo — o olho vê
  rotação que o ouvido interno não sente. Segurar pro lado não pode girar em
  rajada: o analógico precisa voltar ao centro.
- **Vinheta de túnel ao andar e piscada no giro** (`js/xr/xrcomfort.js`).
  Reduzir o fluxo óptico PERIFÉRICO durante a locomoção é a recomendação da
  Meta: é a periferia da retina que alimenta a sensação de auto-movimento que o
  ouvido interno não confirma. E o passo de 45° instantâneo, sem piscada, lê
  como "a tela girou sozinha" — ~80 ms de escuro dão ao cérebro o tratamento de
  um piscar de olhos. A vinheta vive DENTRO da cena (em XR o EffectComposer está
  fora do caminho) e é filha da CÂMERA: presa a outro pai ela escorrega quando o
  jogador vira a cabeça, o que é pior que não ter vinheta.
- **Zona morta de 0,18, DESCONTADA e não cortada.** O analógico descansa em ±0,1
  sozinho; sem zona morta o jogador anda sem querer, e andar sem querer em VR é
  enjoo na veia.

## Orçamento por frame (Quest 3, por olho)

| Item | Alvo | Teto | Medido hoje (estéreo) |
|---|--:|--:|--:|
| Draw calls | 120 | 180 | **512** menu · **823** castelo |
| Triângulos | 350 k | 500 k | **1,74 M** · **2,05 M** |
| Materiais únicos | 40 | 60 | 434 (mas só **176 aparências** — 59% são cópias) |
| Luzes com sombra | 1 | 1 | 4 (cascatas CSM) |
| Boot até gráfico | 3 s | 4 s (loja) | 2,28 s no desktop |

Estéreo é ~2× a leitura mono. Medir em mono subestima pela metade.

## Medição: a lição mais cara desta frente

**Uma medição só não é baseline, e medição sem condição declarada não é medida.**
Um número publicado a partir de poucas execuções virou critério de aprovação; foi
"refutado" por uma medição feita com a máquina carregada; e a refutação estava
errada. Só a terceira rodada, com N=14 e condição escrita, fechou o assunto.

Barra oficial do boot: **mediana ≤ 2,50 s em N ≥ 7 execuções, nenhuma acima de
3,00 s**, com máquina ociosa (load 1 min < 1,5), cache do navegador frio,
servidor local, Chrome headless com GPU real, 1280×720, seed 424242.

Sinal de máquina carregada no próprio artefato: `html` levando ~1 s em vez de
~200–450 ms. Servidor local demorando 3–5× para devolver HTML estático é carga,
não regressão.
