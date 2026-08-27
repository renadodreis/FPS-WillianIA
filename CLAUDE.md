# FPS-WillianIA — Battle Royale multiplayer (Node + socket.io + three.js)

Cliente three.js (`game.js`, `br-game.js`, ES modules em `js/`), servidor
socket.io (`server.js`). Leia os invariantes abaixo ANTES de mexer — cada um já
quebrou o jogo antes.

## Invariantes (quebram o jogo se ignorados)

- **A ordem de consumo do `Math.random` seedado é um contrato.** A geração do mundo
  (`js/terrain.js`, `js/grass.js`, `js/structures.js`, baús) consome `rand` numa
  ordem fixa a partir do seed. Inserir, remover ou reordenar consumo muda o layout
  do mundo E quebra a reconstrução do terreno feita por bots/servidor a partir do
  mesmo seed. Ao mexer em worldgen, preserve a ordem — ou difira a geração pro fim
  (ex.: acumular clareiras e recriar a grama depois).
- **A destruição da cidade é mecânica INTENCIONAL do servidor** (mísseis, causa
  `city`, `city-destruction-protocol.js`). Nunca tratar como bug de colisão/dano;
  correções não podem bloquear os projéteis nem a cinemática.
- **Modelo client-authoritative com anti-cheat no servidor.** `server.js` valida
  dano/acertos (budget de dano, limite de flood, range, crédito de kill via
  `hitBy`). Ao mexer em combate no servidor, não reabra vetores — há
  `test/security-regression.test.js` cobrindo isso. Detalhes sensíveis de exploit
  ficam FORA do repo.
- **A fonte do castelo nunca é asset público.** Os GLBs autorais
  `castelo_reconstruido_escala_real.glb` e
  `assets/models/boss-castle.v1.glb` são locais/ignorados e o servidor bloqueia
  a v1. O runtime é `boss-castle.v2.optimized.glb`, reconstruído por
  `npm run build:castle`. Como recebe cache imutável, qualquer mudança de bytes
  exige uma v3 e a atualização conjunta do loader e dos testes.

- **O tiro tem TRÊS caminhos, e consertar um não alcança os outros.** `fire()`
  do `game.js` sai por hitscan, por `window.__BR_ballistics` (armas com
  `projSpeed`, que é o caminho do BR) e pelo ramo do foguete. Uma correção de
  mira feita só no hitscan deixou o BR errando 9,10 cm no fuzil e 20,00 cm no
  plasma, constante em toda distância — e erro de ORIGEM em projétil não fecha em
  distância nenhuma, então nem dá para compensar mirando mais alto. Ao mexer em
  mira, meça os três.
- **`Box3.setFromObject` num `SkinnedMesh` devolve caixa CONGELADA.** O
  `computeBoundingBox` do three É ciente da pose (passa por `applyBoneTransform`),
  mas o resultado é gravado em `mesh.boundingBox` e **nunca invalidado** — a
  caixa fica presa na pose em que alguém a pediu pela primeira vez.
  `js/fpbody.js` envenena esse cache no boot, de propósito, para calcular a
  escala. Consequência: **medir pose animada por caixa mede a RAIZ**. Meça por
  OSSO (`bone.getWorldPosition`) ou por vértice skinado (`getVertexPosition`).
  Três arquivos de teste desta base mediram a raiz achando que mediam os pés.
- **O servidor e os processos filhos dele só têm `dependencies`.** O Dockerfile
  roda `npm ci --omit=dev`. Qualquer coisa em `js/` que o `server.js` ou um filho
  dele importe arrasta as dependências junto — `js/terrain.js` importa `three`, e
  com `three` em devDependencies **os bots rodaram em produção sem terreno**:
  lista de baús vazia e altura fixa 4 em vez do relevo. A falha virava
  `console.warn` que o `stdio: 'ignore'` do spawn descartava. **Falha silenciosa
  por construção é pior que falha barulhenta** — ao spawnar filho, decida
  conscientemente se o stderr dele pode sumir.

- **VR/WebXR: o jogo NÃO move a cabeça do jogador.** Em XR o three sobrescreve a
  pose da câmera todo frame relativa ao PAI — o grafo é `scene > xrRig > camera`,
  o jogo move o RIG (nos pés) e o headset move a câmera. `camera.position` deixa
  de ser coordenada de mundo. O rig NASCE PREGUIÇOSO porque todo `Object3D`
  consome 4 números do `Math.random` seedado no UUID, e criá-lo no boot
  deslocaria o worldgen de todos. Recoil, screen shake e passeio de câmera do
  menu continuam sendo calculados, mas não chegam na câmera: arrastar a vista de
  quem está de headset é enjoo, não game feel. Detalhes e armadilhas de
  ferramenta na skill `vr-quest` (`.claude/skills/vr-quest/`), que é para ser
  mantida atualizada.

## Regra permanente do porte VR (definida pelo dono do projeto)

**O desenvolvimento do VR não para até o dono mandar parar. Só ele pode
encerrar.** Enquanto não houver essa ordem, o estado padrão é: continuar
consertando o jogo.

- **Qualidade acima de tudo, e o critério é o dono.** "Passou nos testes" não é
  entrega; entrega é o jogo estar plenamente jogável no headset. Se ele disser
  que está ruim, está ruim — e o trabalho recomeça, sem discussão sobre escopo.
- **Nada de gambiarra.** Estudar a documentação e como os jogos de VR existentes
  resolvem o problema ANTES de codar. Trazer a experiência do que já funciona no
  gênero em vez de inventar.
- **Ciclo obrigatório a cada entrega: deploy → suíte completa → redeploy.**
  Deploy manual primeiro quando ele quiser testar na hora; a suíte roda depois e
  o redeploy fecha.
- **Testes primários primeiro.** Testar o dublê em vez da plataforma já deixou
  passar cinco rodadas de "os controles não funcionam" com a suíte verde. Ver a
  skill `vr-quest`: o kit emulado é a base, e o teste mede a coisa (direção,
  ângulo, posição), nunca um proxy conveniente (distância, contagem).
- **Se acabarem os tokens, o dono manda `continue` e o desenvolvimento segue
  exatamente de onde parou.**

## Frente VR — como ela é tocada, e o que já custou caro

**O arranjo que funciona:** dois construtores em **git worktrees isoladas**
(`.claude/worktrees/`), com **posse de arquivo disjunta** e **faixas de porta
separadas**, mais um validador independente medindo a **árvore principal**.

- **Worktree não é capricho.** Um laudo registrou que outra frente editou a régua
  e o código enquanto o validador media, e a rodada inteira virou lixo. Enquanto
  o validador mede, a árvore principal não muda — nem para integrar entrega
  pronta. A fila espera.
- **Worktree isola ARQUIVO, não PORTA.** Agente e suíte usam as mesmas portas
  fixas por arquivo de teste. Não dispare agente enquanto `npm test` roda.
- **Posse disjunta não evita conflito SEMÂNTICO.** Duas entregas certas sozinhas
  quebraram juntas: uma moveu `correr` para o batente do analógico (para liberar
  a empunhadura ao agarrar) e a outra tinha testes que dirigiam o batente para
  medir *andar*. Os números denunciaram — "andar deu 2,800", que é a velocidade
  de corrida. Ao integrar duas frentes, rode os testes de UMA contra o código da
  OUTRA.
- **A fiação no `game.js` é do orquestrador.** Construtor entrega o trecho pronto
  para colar no relatório; quem cola é quem integra. Evita que dois agentes
  disputem o arquivo mais quente do repo.
- **Refutar é entrega boa.** Uma suspeita medida e derrubada com número vale
  tanto quanto um conserto. Briefing que só premia conserto produz conserto
  inventado.

### Onde mora o registro (não duplique número aqui — ele envelhece)

- `docs/vr/criterio-aaa.md` — **a régua**, 47 critérios. Oito deles só fecham com
  o aparelho ligado ou com um humano de headset, então o denominador honesto de
  qualquer placar é **39**. Quem constrói **não edita a régua**; argumenta no
  relatório.
- `docs/vr/validacao-<commit>.md` — um laudo por rodada de validação
  independente, com o placar, os defeitos novos medidos, e quantos deles
  nasceram de uma correção (esse último número é o melhor termômetro que a
  frente tem).
- `docs/vr/referencia-*.md` — a base de referência por assunto (locomoção, corpo,
  mira, interação, UI), com **fonte e citação literal**, e uma seção do que NÃO
  foi encontrado. Decisão de ergonomia sem lastro entra marcada como tal.
- `npm run vr:sessao` — o roteiro de sessão humana que destrava os oito
  critérios travados. Fala cada item em voz alta, colhe telemetria sozinho e
  escreve `aguardando humano`/`aguardando aparelho` onde não mediu.
- `.claude/skills/vr-quest/` — armadilhas de ferramenta do kit emulado. **Manter
  atualizada** é parte da entrega.

### O que a régua já cobrou, e que vale saber antes de mexer

- **A mira é geometria, não gosto.** A alça deste jogo fica **6 a 20 cm acima do
  cano** (é *sight height over bore*, aqui exagerada — um fuzil real tem ~4 cm).
  Com origem no cano e alvo na alça, os dois só concordam numa distância. A
  solução é separar o que se VÊ do que ACERTA: traçante e clarão saem da boca
  (sempre saíram), o raio balístico nasce **sobre a linha de mira**. Zeragem
  dinâmica (convergir para o primeiro obstáculo) é proibida: ela faz o ponto de
  impacto **andar entre um tiro e o outro**, e aí não há como compensar na mão.
  **Exceção medida:** projétil VISÍVEL (o foguete) nasce na BOCA e voa paralelo à
  alça — origem deslocada num foguete detona perto de quem atirou (medido: 42 de
  dano em si mesmo).
- **Os limiares de conforto da parede são geometria.** Colisor do jogador
  r = 0,42 m e plano de corte da câmera em 0,08 m: **o outro lado do mundo
  aparece com 0,34 m de separação cabeça↔corpo**. Qualquer cortina que feche
  depois disso mostra o que não devia. E a outra ponta é obrigatória: em jogo
  normal a faixa negada tem ~1,3 cm, então cortina que dispara em encosto de
  parede troca um defeito por outro pior.
- **Debruçar e enfiar a cabeça na parede ocupam a MESMA faixa de separação**
  (0,3–0,6 m contra 0,3–1,0 m). Nenhum limiar de distância separa os dois — o que
  separa é o mundo. A saída é consultar o sólido na cabeça (é o gatilho primário
  do fade no Godot XR Tools; esta base tinha só o batente).
- **IK escala com a raiz.** Comprimento de osso medido no carregamento vale para
  raiz em escala 1; em VR a raiz do corpo vale ~0,89. Sem multiplicar, o solver
  pede um membro ~12 % mais longo do que existe — e o erro resultante é MAIOR que
  o excesso, porque a clavícula para de estender exatamente fora do alcance
  verdadeiro. Aconteceu na perna e no braço.
- **`XR.foraDoCorpo` tem teto e é lido fora do conforto.** É a separação que o
  mundo RECUSOU, limitada, com o excedente virando dívida paga na volta
  (descartar deixaria quem entra 3 m e sai 3 m dois metros fora do mundo).
  `js/interact.js` usa esse número como régua de alcance — mudar a semântica dele
  muda o alcance de interação.
- **`js/xr/` não pode ser a fronteira do porte.** Os defeitos que mais
  sobreviveram são os que moram FORA de `js/xr/`, porque toda posse de arquivo
  ficava dentro dela: `city-destruction-client.js` escreve `camera.fov`,
  `.position` e `.quaternion` direto (e `grep presenting` nele devolve zero), e
  `br-game.js` pilota queda livre por `camera.getWorldDirection`. Em XR
  `camera.quaternion` é a pose da cabeça **relativa ao rig** — ler direto dá erro
  de até 180°, e já custou movimento invertido e o `rotY` errado mandado ao
  servidor. A fonte única certa é `vistaMundo()` / `yawDaVista()`.

## Fluxo de trabalho (git flow)

`dev` → `hom` → `prod`. Trabalho novo sai de `dev`; `hom` é o que está em
homologação; `prod` é o que está no ar. Nada entra em `hom` sem `npm test`
verde, e nada entra em `prod` sem ter passado por `hom`.

**`origin` é o repositório do WILL (`wewewe21`), `fork` é o do Renato
(`renadodreis`).** Empurrar vai para o `fork`. Mandar coisa para o `origin` é
mexer no repositório de outra pessoa — só com pedido explícito.

## Testes

- **Suíte completa:** `npm test` (`scripts/run-tests.js` já roda sequencial com
  `--test-concurrency=1`; ~15–30 min conforme a carga gráfica).
- **Um arquivo:** `node --test test/<arquivo>.test.js`.
- **Vários arquivos à mão:** SEMPRE `--test-concurrency=1` — testes de browser usam
  portas fixas por arquivo que colidem em paralelo. (Testes de socket usam portas
  dinâmicas altas 21000+/26000+/31000+, sem colisão.)
- **Flake ≠ bug.** Testes de browser (puppeteer-core + Chrome/swiftshader) têm
  portas fixas e o boot da página pode passar de 60 s sob carga. Antes de chamar
  uma falha de regressão: re-rode SÓ aquele arquivo isolado 2–3×. O runner exige
  duas passagens isoladas consecutivas para classificar flake; se continuar
  falhando, é regressão real.
- **Não matar a porta 3000** — costuma ser o servidor ao vivo do dev.
- **e2e:** `npm run test:e2e` (Python, precisa de ambiente/Chrome).
- **TDD:** teste primeiro (RED), implementa (GREEN). `npm run lint` limpo (eslint,
  `no-unused-vars` é erro).

## Commits

- Não expor IP, DNS ou detalhes de infraestrutura/deploy em commits nem em docs.

## Lições de método (custaram caro, valem para o repo inteiro)

- **Uma medição só não é baseline, e medição sem condição declarada não é
  medida.** Um número de boot publicado com poucas execuções virou critério de
  aprovação, foi "refutado" por uma medição feita com a máquina carregada, e a
  refutação estava errada. Só com N=14 e condição escrita (máquina ociosa, cache
  frio) o assunto fechou. Sinal de máquina carregada no próprio artefato: o
  `html` levando ~1 s em vez de ~200–450 ms.
- **Teste verde não prova tela certa.** Cinco arquivos de teste de rig de roda
  passavam enquanto o carro aparecia com as rodas na altura da janela na PRIMEIRA
  tela que todo jogador vê — porque todos bootavam já em jogo, e o menu não tinha
  teste. O buraco não era de cobertura de código, era de cobertura de ESTADO.
- **Auditoria de quem escreveu não é auditoria.** Nesta base, sete defeitos reais
  só apareceram em revisão independente — inclusive defeitos introduzidos por
  correções de outros defeitos. Cada rodada de "está pronto" tinha algo atrás.
- **Cuidado com o que mede o harness em vez do produto.** `startBRMatch` pula a
  fase da nave DE PROPÓSITO; uma sonda que lê a fase logo depois "prova" que o
  jogo não começa da nave — e não prova nada.
- **Não dispare agente enquanto `npm test` roda.** A suíte usa portas fixas por
  arquivo, e o agente roda os testes DELE nas mesmas portas: a suíte lê um
  arquivo pela metade ou não consegue subir o servidor, e o resultado vira
  "regressão real" que não existe. Aconteceu duas vezes: `xr-haptics` (carga) e
  `xr-body` (porta 3422 tomada pelo agente que tinha aquele arquivo). Ordem
  certa: agentes terminam, árvore fica limpa, ENTÃO a suíte roda.
- **Triagem de flake feita sob carga NÃO é triagem.** O runner re-roda o arquivo
  isolado até 3× e chama de REGRESSÃO REAL o que não passar duas vezes
  seguidas. Isso pressupõe máquina ociosa — e com agentes rodando testes em
  paralelo o isolamento é só de porta, não de CPU. Aconteceu: `xr-haptics` foi
  classificado como regressão real com 3 falhas isoladas consecutivas, passou
  4× isolado logo depois, e a suíte inteira em máquina limpa (load 1,23) passou
  sem tocá-lo. **Antes de investigar uma "regressão real", confira a carga** —
  é a mesma lição da medição de boot, que só fechou com condição declarada.
- **`git add -A` com agente trabalhando na árvore commita o trabalho dele pela
  metade — inclusive MUTANTE de teste.** Aconteceu: um agente estava numa rodada
  de reinjeção de defeito (para provar que os testes pegam), e um `git add -A`
  de outra frente varreu o arquivo no meio disso. Foi commitado, e DEPLOYADO,
  `loBlade.scale(0.35, 1, 1)` — lâmina de grama 35% mais estreita, ou seja,
  **wallhack contra quem está deitado no mato**, no desktop e no celular. O
  guarda de wallhack não pegou porque o teste dele estava sendo mutado no mesmo
  instante. Com agente ativo: `git add` só dos arquivos que são SEUS, conferidos
  um a um com `git diff --cached`.
- **Suíte interrompida deixa servidor órfão segurando porta fixa, e isso lê
  como regressão.** Testes de browser sobem `server.js` numa porta fixa por
  arquivo; matar a suíte no meio (Ctrl+C, task cancelada) deixa esse processo
  vivo, reparentado pro init. A próxima execução do MESMO arquivo falha com
  `test did not finish before its parent and was cancelled` — que parece defeito
  de código e é porta ocupada. Já custou uma investigação inteira. `npm run
  test:vr` limpa órfão PROVADO (processo do `server.js` deste repo com pai
  morto) antes de rodar, e nunca encosta na porta 3000.
- **Monitor com `pgrep` casa com a própria linha de comando.** `until ! pgrep -f
  "run-tests"` nunca termina, porque o shell que o executa contém `run-tests`.

- **"Teste que passa por acidente" já apareceu NOVE vezes nesta base, e é a
  família de defeito mais cara que ela tem.** Não é falta de cobertura: é teste
  verde sobre produto quebrado. Os formatos vistos até agora, todos reais:
  1. **Asserção que não pode falhar** — `|dir| ≈ 1` depois de `.normalize()`;
     `getFramebufferScaleFactor() === 1` num getter que não existe; tabela de
     prioridade comparada consigo mesma.
  2. **Comparar uma reta com ela mesma** — o teste da mira lia `miraDoTiro()`, e
     o código faz `_rayDir.copy(_miraDirDoTiro)`: distância zero por álgebra. Com
     o eixo óptico girado 6° (≈105 cm de erro a 10 m) o teste calculava 1,86e-15 m.
  3. **Medir o eixo em que o defeito não aparece** — o caso do alinhamento media
     a componente AO LONGO do cano; a que decide é a perpendicular. Uma arma com
     o cano cinco metros para o lado passava.
  4. **O teste dirigir o produto em vez de observá-lo** — `xr-hud.test.js`
     montava o próprio condutor: arrancando `XRHud.update()` do loop do jogo, os
     NOVE casos continuavam verdes.
  5. **Ler `visible` sem perguntar se está no grafo da cena** — objeto com
     `visible: true` e sem pai não é desenhado por ninguém. Comentando uma linha,
     `xr-radial.test.js` ficava 11 de 12 verde.
  6. **Outro guarda segurando o caso** — o caso do baú através da parede passava
     com o desconto arrancado, porque quem o segurava era o teto de 0,35 m. A
     afirmação escrita nele era falsa.
  7. **`||` com um termo que se satisfaz sozinho** — "vida subiu OU kits caíram",
     e a vida deste jogo sobe sozinha.
  8. **Dublê bom demais** — o dublê de parede era um clamp perfeito, e o teste
     passava com o defeito reinjetado. Trocado por bloco com espessura, e
     acrescentada a medida da CAUSA (quanto o dreno ofereceu ao colisor), que é
     imune a dublê.
  9. **Cenário que não exercita o limiar** — com a sonda ligada, "encostar de
     leve" nunca chegava a testar o limiar, porque a porta fechava antes.

  **A defesa que funciona é uma só: reinjete o defeito e veja o teste ficar
  vermelho, com número.** Se não muda de cor, não testa nada. E ancore a medida
  em algo INDEPENDENTE do código sob teste — o cano é geometria do modelo
  desenhado, então serve de âncora para a mira; a linha de mira não serve, porque
  é ela que gera o raio.

- **Congele no instante do evento o que você vai comparar.** Ler o cano depois do
  disparo mede o RECUO: numa automática são 0,88° (15 cm a 10 m) e na bazuca,
  que tem o coice mais pesado do arsenal, foram 42 cm de "defeito" inexistente.
  O mesmo vale para a linha de mira. Em XR some a isso o fato de a pose da câmera
  ser escrita pelo three DENTRO do `render()`: amostre com
  `setFromMatrixPosition(camera.matrixWorld)` DEPOIS do render, nunca
  `getWorldPosition()` — um sampler que ignorou isso compunha `rig(N) × pose(N−1)`
  e os dois erros se cancelavam exatamente.

- **Auditoria de quem escreveu não é auditoria — e isso vale para o
  orquestrador.** Em duas rodadas seguidas os piores defeitos foram escritos por
  quem coordenava, e foi a revisão independente que os achou: a mira que valia só
  metade do jogo, e o teste que devia prová-la e não podia falhar.

- **Régua não se afrouxa para desbloquear a própria frente.** Quando B7 (origem a
  ≤ 5 cm do cano) e B3 (tiro na linha de mira) se mostraram geometricamente
  incompatíveis, o teto do TESTE foi afrouxado com o motivo escrito no arquivo, e
  o texto do CRITÉRIO ficou intocado esperando decisão do dono. Critério que a
  implementação reescreve para si mesma deixa de ser critério.
