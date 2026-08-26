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

## Medir sem ninguém dentro do headset

`npm run vr:baseline -- --target=quest --immersive=1` faz o ciclo inteiro.
As três fontes, e o que cada uma vale:

| Fonte | Mede | Vale para |
|---|---|---|
| `npm run vr:emulado` | sessão imersiva REAL no PC (IWER), 2 olhos | draw calls e triângulos em estéreo, grafo do rig, caminho de render, lógica de entrada |
| `adb logcat -s VrApi` | FPS real, tempo de app, GPU%, CPU%, térmica | **tempo** — só o aparelho mede tempo |
| `npm run vr:censo` | de quem são os draw calls, por subtração | escolher o que cortar |

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
  analógico, 4 e 5 os botões da mão.
- **A intenção vira as MESMAS teclas do teclado.** Colisão, rampa, escada,
  veículo e arma continuam sendo o código já testado. Controle novo não pode
  virar física nova.

### Conforto é contrato, não gosto

- **Giro em PASSOS de 45°, um por inclinada.** Girar o mundo suave debaixo de
  quem está fisicamente parado é a causa mais conhecida de enjoo — o olho vê
  rotação que o ouvido interno não sente. Segurar pro lado não pode girar em
  rajada: o analógico precisa voltar ao centro.
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
