---
name: vr-quest
description: Use ao desenvolver, medir ou depurar o porte VR deste jogo no Meta Quest 3 (WebXR) — subir o jogo no headset, medir FPS e draw calls sem ninguém usando o aparelho, rodar sessão imersiva no PC sem headset, e as armadilhas de adb/navegador/three que já custaram horas. Também ao mexer em js/xr/, no rig de câmera, no loop de render ou na entrada dos controles Touch.
---

# Desenvolver VR neste jogo (Meta Quest 3, WebXR)

**Mantenha esta skill atualizada.** Toda armadilha nova que custar mais de
30 minutos entra aqui, com o sintoma e a medição. Ela existe porque quase todo
item abaixo foi descoberto do jeito caro.

## Regra permanente: isto não acaba até o dono mandar parar

O porte VR está em **loop de correção contínua por decisão do dono do projeto**.
Só ele encerra. Sem ordem dele, o estado padrão é continuar consertando.

O critério de pronto é **dele**, não da suíte: "os testes passam" não é entrega;
entrega é o jogo estar plenamente jogável dentro do headset. Cada entrega fecha
o ciclo **deploy → suíte completa → redeploy**.

E a regra que já foi quebrada caro: **estudar a documentação e como os FPS de VR
existentes resolvem o problema ANTES de codar**. Levar solução de PC pro VR sem
revisão é o erro que gerou quase todos os defeitos desta frente.

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

## O ciclo curto: `npm run test:vr`

A suíte completa leva ~16 min, e ciclo inviável vira gente pulando teste.
`npm run test:vr` roda em ~2,5 min:

- **todo** `test/xr-*.test.js` — casado por padrão, não por lista, pra não
  esquecer arquivo novo que um agente acrescentar;
- os testes de PC que a mudança de VR alcança (arma, mira, rig, balística,
  toque), porque a fonte da mira e o cálculo de direção são os MESMOS: quebrar
  VR quebra PC;
- a regressão de segurança, que é invariante do projeto.

**Não substitui `npm test`.** O ciclo declarado pelo dono é deploy → suíte
completa → redeploy; isto é a peneira de antes.

Ele também limpa **servidor órfão** antes de rodar. Motivo: teste de browser
sobe `server.js` em porta FIXA por arquivo, e suíte interrompida deixa esse
processo vivo. A execução seguinte do mesmo arquivo falha com `test did not
finish before its parent and was cancelled` — que lê como regressão e é porta
ocupada. Só encerra órfão PROVADO (processo deste repo com o pai já morto) e
nunca encosta na porta 3000, que é o servidor ao vivo do dev.

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

## A armadilha que mais se repete: ANDAIME QUE VIRA PRODUTO

**Já aconteceu SEIS vezes nesta frente.** O padrão é sempre o mesmo, e é uma
consequência inevitável de o agente que escreve o módulo não poder editar o
`game.js`:

1. O módulo novo existe, mas ninguém o chama — sem fiação, não há o que medir.
2. O teste instala um condutor próprio (chama `update()` por frame, ou cria a
   própria instância do módulo) para haver comportamento.
3. A fiação entra no `game.js`.
4. Agora **duas coisas** conduzem o mesmo produto, e o teste mede a briga.

O que isso já produziu, medido:

| onde | sintoma |
|---|---|
| giro | 60 °/s por um segundo virou **117,9°** — contava duas vezes |
| painel | o clique em "GIRO" alternava o valor **duas vezes e voltava** ao original |
| taxa de quadros | teste cobrava "a sessão nasce a 90" depois de a fiação já declarar 72 |
| háptico | duas instâncias escrevendo no MESMO atuador; o pulso do jogo aparecia no lugar do pulso do teste |

**A regra:** no momento em que a fiação entra, o andaime tem que virar
observador. Use a instância do jogo (`window.__game.XRUI`, `G.XRTato`), não uma
cópia; conte frames por `renderer.info.render.frame`, não por uma cadeia de
`requestAnimationFrame` própria; e não chame a função que o `game.js` chama.

E o corolário: **quando a fiação entra, o teste do agente muda de significado.**
Um caso que cobrava "a sessão nasce a 90 Hz" passa a cobrar que a correção NÃO
exista. Reler os testes do agente depois de aplicar o wiring é parte de aplicar
o wiring.

## Teste que passa POR ACIDENTE — o irmão silencioso do teste que não falha

Pior que o teste que não pode falhar é o que passa por um motivo diferente do
que está escrito nele. Dois casos medidos nesta frente:

- `xr-bootstrap` exigia `rig.position == player.pos` — o desenho de ANTES de o
  giro pivotar na cabeça. Depois do pivô o rig fica em `pés − cabeça` de
  propósito, para a CABEÇA cair sobre os pés. Ele continuou verde porque a
  sentinela do teste saltava a câmera 8 m num tick, e esse salto virava "passo
  físico" que somava de volta exatamente o que a compensação subtraía. Duas
  mudanças erradas se cancelando.
- `xr-quality` tinha `sombras: G.csmDebug ? null : null` e asseverava a mesma
  coisa duas vezes: o título prometia cascata de sombra e nada media cascata.

**Como pegar:** quando um caso continuar verde depois de uma mudança que
deveria tê-lo afetado, desconfie ANTES de comemorar. E quando um teste
sobreviver a um refactor de desenho, releia o que ele assere — não o nome.

## A ordem em que o runtime entrega as coisas NÃO é garantida

Escrevi no código, como se fosse fato, que o evento `reset` do espaço de
referência chega ANTES da pose nova. É o contrário: o runtime escreve a pose de
forma **síncrona** e só **enfileira** o evento. A correção que dependia dessa
ordem (carência de frames) defendia o lado errado, e o defeito continuou.

**A lição maior:** quando a correção depende de ordem de entrega entre dois
sinais do navegador, ela é frágil por construção. Prefira um critério que não
precise saber a ordem. Aqui virou um limiar do que é **fisicamente possível**:
35 cm num frame seriam 25 m/s, então não é caminhada — é recentrar, piso
redefinido ou rastreio perdido, e nos três casos a resposta é a mesma.

## Teste que não pode falhar não é teste

Aconteceu aqui, e passou despercebido até uma auditoria independente: um caso
asseverava `renderer.xr.getFramebufferScaleFactor() === 1`. Esse getter **não
existe** no three r185 — a expressão caía num literal e a asserção passava
sempre, enquanto em produção a função que ela deveria proteger tinha **zero
chamadas** e o preset de sessão vazava para o monitor.

Antes de escrever cada asserção, diga qual mudança de produção a faria falhar. E
prove: reinjete o defeito e veja o teste morrer. Guarda de constante (`X > Y`
onde X e Y são literais do próprio módulo) e tautologia geométrica (ângulo
depois de um `lookAt`) são as duas famílias mais comuns de teste inútil.

Comparação de tempo também engana: três `emitir` no mesmo turno síncrono podem
compartilhar o mesmo `performance.now()`, e `startTime >` falha sem nada estar
errado. Compare o CONTEÚDO.

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

- **Worktree de agente pode nascer num commit VELHO.** Aconteceu com QUATRO
  agentes seguidos nesta frente, todos no mesmo commit pré-porte (`a3aeb33`):
  a worktree não tinha `js/xr/` nem `docs/vr/`, e o agente ia estudar um jogo
  que não existe mais. Sintoma: o briefing cita arquivos que o `ls` não acha.
  Conferir `git log --oneline -1` na worktree ANTES de ler código; se estiver
  atrás, `git reset --hard <dev>` na branch isolada dela (que é descartável).
  `node_modules` também não vem — e **não está no `.gitignore` deste repo**, o
  que torna um `git add -A` com worktree suja um acidente pronto.
- **Sonda de mão: `dev.controllers[mao].position` e `.quaternion` são
  escrevíveis**, e é assim que se põe a mão do jogador onde um humano poria.
  Os ids de botão do kit são os do config oficial da Meta (`trigger`,
  `squeeze`, `thumbstick`, `x-button`/`y-button` à esquerda, `a-button`/
  `b-button` à direita), e batem com os índices `xr-standard` 0/1/3/4/5.
- **Amostrar no RENDER é embrulhar `renderer.render`,** e só funciona dentro
  de XR: fora da sessão o jogo chama `composer.render` e o embrulho nunca
  dispara (medido: 0 chamadas contra 78). Um bloco de controle "desktop" que
  amostre por ali mede `null` e passa achando que mediu.
- **Sonda que escreve campo INEXISTENTE mente sem erro.** Uma sonda desta
  frente escrevia `gun.ammo` para "gastar bala"; o campo é `gun.mag` (e
  `gun.magSize` é a capacidade). O pente continuava cheio, `startReload`
  recusava com razão, e a leitura quase virou o laudo "a recarga não
  funciona". Antes de publicar defeito, confira que a sonda mexeu no campo
  que o produto lê.
- **Perseguir uma janela exige mirar DENTRO dela.** Ao caçar o ADS físico,
  mirei 0,08 m à frente do olho: é abaixo de `RECUO_MIN` (0,14) e dentro do
  `CABECA_RAIO` (0,12) que faz a arma sumir de propósito. Resultado: ads
  0,000 e a conclusão errada de que a mira não funciona. Com o alvo no meio
  da janela (0,22 m), ads 1,000 no mesmo produto.
- **Teleportar `dev.position` entre casos NÃO zera o acumulado do rig.** O salto
  passa de `PASSO_HUMANO_MAX` e é DESCARTADO, mas o caso seguinte herda metros
  de passo pendente — medido: `fora máx 0,5590 m` num caso que nunca encostou
  em parede. Para reposicionar a cabeça entre casos, ela tem de voltar
  **andando**, a pé e em campo aberto.
- **`brTick` roda por `requestAnimationFrame` mesmo em partida SOLO**, e a fase
  `SPECT` escreve `MP.player.pos` todo frame. Numa bancada que mata o jogador
  duas vezes, isso teleportou o colisor **3873,7723 m num frame**. Blinde o
  teste conferindo a fase e pondo guarda de salto por frame.
- **`bootEmVR` já começa a partida** (`emJogo: true` por padrão). Quem mede o
  MENU passa `emJogo: false`. Uma sonda que esquece isso mede o jogo; uma que
  assume o contrário mede o menu e acha que o tiro não funciona.
- **Os controles emulados NÃO descem com o headset.** Baixar `dev.position`
  para simular agachamento deixa `dev.controllers[*].position` onde estava: o
  braço do boneco sobe atrás deles e **o vértice mais alto do corpo passa a ser
  o DEDO** — medido, +0,3372 m acima do olho com o corpo inteiro correto.
  Qualquer régua de "topo do boneco" tem de filtrar por osso (fora
  `Sholder|Arm_|Hand|Finger`) ou descer os controles junto.
- **`updateWorldMatrix(true, false)` não desce a árvore.** Mover
  `bodyRoot.position` e atualizar só para CIMA deixa os ossos com a matriz do
  frame anterior; uma busca que leia `osso.matrixWorld` mede a raiz na posição
  ANTIGA. Custou uma bissecção inteira convergindo para ZERO em silêncio, com o
  resultado parecendo "a correção não faz nada" — e o que ficava no lugar era
  justamente o defeito que ela existia para evitar. Depois de mover a raiz:
  `(true, true)`.
- **Coordenada LOCAL medida na BIND não vale no frame.** `osso.worldToLocal(P)`
  de um ponto parado MUDA quando o osso gira — e neste corpo o peito já carrega
  a inclinação de agachamento. Guardar o ponto na bind e usá-lo com o osso
  girado conta a inclinação DUAS vezes: medido, 0,0929 m de erro de âncora,
  **constante em toda a faixa**. Offset constante é a assinatura desse engano;
  erro de ÂNGULO varia com a profundidade.
- **`FpBody.olhoMin` é varredura ROLANTE** (256 vértices por frame de 2 631):
  uma amostra solta pode devolver número grande só porque a fatia daquele frame
  não visitou o vértice mais perto. Serve para ACUSAR (número pequeno é
  verdadeiro), nunca para absolver. Teste que precisa do mínimo real varre a
  malha ele mesmo — é o mesmo laço que ele já faz para achar o vértice mais
  baixo.
- **Réguas que a DOBRA DO TRONCO contamina, e as três já foram tentadas.** Com
  o tronco dobrado, nada acima da cintura guarda relação fixa com o olho:
  osso da cabeça contra o olho anda 0,1825 m, distância olho↔ombro anda 0,15 m
  (o corpo é posto `recuo` ATRÁS do visor de propósito, e esse vetor é de MUNDO
  enquanto o ombro gira), topo da malha do peito anda 0,27 m — tudo isso com a
  âncora PERFEITA. A régua que sobrevive é o CENTRO DA CABEÇA do boneco, com as
  referências colhidas numa pose já agachada mas antes do engate da coluna.

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

### `gripSpace` e `targetRaySpace` NÃO são intercambiáveis

A spec do WebXR define dois espaços por controle:

- **`targetRaySpace`** (`renderer.xr.getController(i)`) — "para onde aponta".
- **`gripSpace`** (`renderer.xr.getControllerGrip(i)`) — a palma: *"if the user was
  holding a straight rod in their hand, the origin rests at their palm"*. O **-Z
  do grip é a direção do POLEGAR**, não do cano.

A spec e o MDN mandam usar o **grip** para posicionar o modelo que está na mão
(*"The gripSpace should be used instead to place the renderable model of a
tracked-pointer"*), e a doc do three repete a divisão. Medido aqui contra a
`gripOffsetMatrix` oficial da Meta para o Touch: os dois espaços divergem
**45,4° e 5,2 cm**. Pendurar a arma no raio de mira dá punho torto e cano fora
de lugar — e é indistinguível de "a mira está horrível" para quem está jogando.

**Objeto de grip criado depois do `setSession` só recebe pose no frame
seguinte.** Ler `visible` na mesma chamada dá falso negativo.

### A mira sai da ARMA, não do controle

Hierarquia: linha de mira da arma (a ocular do perfil, onde o jogador põe o
olho) → punho → raio do controle → câmera. E a pose da arma tem que ser escrita
**depois** do `applyFpsCamera`: a pose de desktop (offset de quadril, bob de
caminhada, sway do mouse) é escrita lá, e aplicar a mão antes faz o desktop
sobrescrever a mão de volta.

**ADS em VR é físico.** Não é FOV animado por botão: mede-se o recuo da arma em
direção ao olho e o desvio lateral. É por isso que existe a indústria de
gunstock. Arma enfiada na cara **some** em vez de ser empurrada — empurrar
desgruda a arma da mão, que é exatamente o defeito que se veio consertar.

**Duas mãos:** a direção sai da linha entre as mãos, com histerese no engate
(0,20 / 0,32 m). Sem amortecer, a mira SALTA no momento do engate, porque a
linha entre as mãos e a direção de cada mão divergem.

### `__BR_active` do harness esconde meia interação

`test/helpers/harness.js` nasce com `online: true`, logo `__BR_active = true` —
e isso esconde a branch de baú/bazuca de `js/interact.js`. Teste de interação
solo que não desliga a bandeira mede o vazio.

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

## Orçamento por frame — E A RÉGUA É POR OLHO, declarada

Esta tabela dizia "por olho" no título e mostrava o medido **em estéreo** na
coluna ao lado. Comparar as duas colunas era comparar maçã com laranja, e a
ambiguidade sobreviveu rodadas: uma frente declarou o teto de triângulo
alcançado medindo por olho, enquanto o documento de critérios aplicava o mesmo
número ao valor estéreo — que é duas vezes mais duro.

**A régua oficial deste projeto é POR OLHO**, e o motivo é que é assim que se
compara com qualquer outro jogo: cena, orçamento e as diretrizes publicadas
falam do que UMA câmera desenha. **Toda medição estéreo tem que ser dividida
por dois antes de ser comparada com o teto.** Onde a coluna disser "estéreo",
o número NÃO pode ser lido contra o teto sem essa conta.

| Item | Alvo (por olho) | Teto (por olho) | Partida (estéreo) | Hoje (por olho, castelo) |
|---|--:|--:|--:|--:|
| Draw calls | 120 | 180 | **823** castelo | **173** ✔ (sem sombra) · 190 com as 2 cascatas |
| Triângulos | 350 k | 500 k | **2,05 M** | **457 k** ✔ |
| Materiais únicos | 40 | 60 | 434 (**176 aparências**) | — |
| Luzes com sombra | 1 | 1 | 4 (cascatas CSM) | 2 no preset de sessão |
| Boot até gráfico | 3 s | 4 s (loja) | 2,28 s no desktop | — |

**Os dois tetos de contagem foram alcançados** — draw call com 7 de folga (e
estourando se a sombra entrar na conta), triângulo com 43 k. Sete frentes
levaram o castelo de 823 para 173 por olho: culling dos inimigos, fusão de GLB
cru, feixes de findability em duas malhas, `far` na distância da névoa, terceiro
degrau de LOD da grama, pulo dos chunks que o shader já apaga, e atlas de
textura nos esqueletos.

**Nenhum desses números é fps.** O critério real é tempo de frame, e tempo só o
aparelho mede (`adb logcat -s VrApi`). Contagem é proxy — um proxy que agora
passa, o que autoriza medir tempo, não substitui a medida.

E a ressalva que impede o otimismo: **o three não usa multiview aqui**, então o
segundo olho custa de verdade. Um teto "por olho" só é honesto porque é a régua
de comparação com o gênero — o que a GPU paga é o dobro, e é por isso que o
critério real é o tempo de frame, não a contagem. Contagem é proxy.

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
