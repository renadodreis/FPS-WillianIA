# FPS-WillianIA — Battle Royale multiplayer (Node + socket.io + three.js)

Cliente three.js (`game.js`, `br-game.js`, ES modules em `js/`), servidor
socket.io (`server.js`). Leia os invariantes abaixo ANTES de mexer — cada um já
quebrou o jogo antes.

## Invariantes (quebram o jogo se ignorados)

- **A ordem de consumo do `Math.random` seedado é um contrato.** (Desde
  2026-09-28 construções e vegetação têm sorteio PRÓPRIO — js/paredes.js,
  js/obstaculos.js — e não consomem mais o stream; o que vem depois delas,
  inimigos, bichos e alien, continua sendo contrato.) A geração do mundo
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
  mira, meça os três. **E meça nos DOIS modos:** o conserto do BR entrou atrás
  de `XR.presenting` com o comentário "fora de XR nada muda" — e fora de XR a
  bala seguia saindo da boca. Desktop e celular erraram 29–31 cm no quadril por
  um mês (mirar na cabeça passava entre a cabeça e o ombro).
  `test/br-mira-projetil.test.js` mede em pixel de tela contra o centro do
  canvas.
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
- **Ciclo obrigatório a cada entrega: deploy → suíte completa → fix → redeploy,
  NESSA ORDEM.** Deploy é SEMPRE o primeiro passo, por padrão, sem precisar de
  aprovação por instância — confirmado pelo dono em 2026-08-30 depois de ver o
  fluxo invertido (suíte antes do deploy) numa rodada e pedir a correção
  explicitamente. `dev` → `hom` → `prod` (merge fast-forward, push pro `fork`)
  seguido do deploy mecânico de verdade no servidor (skill `deploy` +
  `deploy.env`) vêm ANTES de rodar `npm test`. Só depois disso a suíte roda; se
  ela achar erro, conserta a causa raiz e reempurra + redeploy — não é rodar a
  suíte e decidir se deploya, é deployar e usar a suíte pra confirmar (ou
  corrigir o que ela apontar).
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
- **E a fila que espera pelo validador tem de esperar pela PORTA, não só pelo
  arquivo.** Um validador registrou ter encontrado `server.js` de duas outras
  worktrees vivos durante a rodada dele, um deles segurando a porta de um
  arquivo central da medição. Ele não descartou o laudo: mostrou 30 min de
  separação no relógio, ocupou uma porta própria para medir o que acontece
  (`FALHOU ALTO — servidor de QA encerrou antes do boot`, ou seja porta ocupada
  dá falha barulhenta, não número errado) e apontou que todo mutante mexeu o
  número na direção prevista e todo restore o trouxe de volta — o que um
  servidor estranho não faria. **Não colidiu por sorte de relógio.** Ao segurar
  a árvore para o validador, segure também as portas: nenhuma outra frente roda
  teste enquanto ele mede.
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

- **Traduzir analógico em TECLA custa três coisas, e todas se medem.** O
  headset entregava o polegar como `KeyW/KeyA/KeyS/KeyD`: dava OITO direções
  (erro de 22,50° com o polegar a 22,5° do eixo, trocando de sinal a cada
  octante), UMA velocidade só (meio analógico e talo davam os mesmos
  1,693 m/s) e zona morta efetiva de 0,2805 contra os 0,18 declarados. O
  canal analógico já existia pronto em `js/xr/xrinput.js` e era descartado.
  Ao consertar: o canal **substitui** as teclas a pé e as MANTÉM escritas —
  `js/car.js` e `js/heli.js` dirigem por tecla e emudecem sem elas.
- **Zona morta por EIXO torce a diagonal.** Descontando a zona morta de cada
  eixo em separado, os dois encolhem o mesmo tanto em valor absoluto: a razão
  entre eles muda e o ângulo andado sai do pedido (medido: 9,79°). Radial —
  descontar da magnitude e preservar o versor — dá 0,00°. Nos eixos e nas
  diagonais exatas as duas contas coincidem, que é por que o teste de unidade
  não via diferença.
- **Em XR o corpo resolve DEPOIS da arma, e isso virou contrato de frame.**
  `FpBody.update` morava dentro do `applyFpsCamera`; `XRArma.aplicar` roda
  ~1 700 linhas depois. O IK do braço resolvia contra a pose de DESKTOP da
  arma, e a arma ia para o controle em seguida: 0,4805 m de mão fora da
  empunhadura na tela — e 0,0000 m se medida lá dentro, que é a mesma reta
  comparada consigo mesma. Hoje o desktop resolve onde sempre resolveu e o XR
  resolve depois do `XRArma.aplicar`.
- **O `gripSpace` do WebXR É a mão do jogador**, não um lugar perto dela
  ("the centroid — the center of mass — of the user's fist", MDN). O braço do
  boneco mira o controle; a ARMA é que se acomoda às mãos. Mirando a âncora
  `supportHand` da arma, o alvo ficava a 0,94–1,07 m do ombro contra 0,5881 m
  de braço — fora de alcance por construção, com o cotovelo travado em 176°.
- **O giro artificial não pode ser removido**, por mais que ele incomode:
  VRC.Quest.Tracking.1 é requisito obrigatório de loja (sentado não pode
  exigir pivô > 90°) e o XAUR do W3C o trata como acessibilidade. O que se
  faz é oferecer DESLIGAR — é o que o Half-Life: Alyx fez. E ao desligar,
  a saída tem de vir ANTES dos dois ramos: cortar só o contínuo devolve o
  giro de graça a quem escolheu passos (medido: −45,000°).
- **Em VR não existe botão de ADS.** Oito de oito FPS de VR de referência
  medem a mira pelo gesto de trazer a arma ao olho. O botão pode ganhar
  trabalho VISÍVEL (empunhar, coldrear); o que não pode é ligar uma bandeira
  que muda espalhamento e não muda a tela — o jogador aperta e não vê nada,
  e foi exatamente esse o relato do dono.

- **A mira é geometria, não gosto.** A alça deste jogo fica **6 a 20 cm acima do
  cano** (é *sight height over bore*, aqui exagerada — um fuzil real tem ~4 cm).
  Com origem no cano e alvo na alça, os dois só concordam numa distância. A
  solução é separar o que se VÊ do que ACERTA: clarão sai da boca, e o raio
  balístico nasce **sobre a linha de mira**. **Correção de 2026-08-29:** a
  afirmação de que "traçante e clarão saem da boca (sempre saíram)" era falsa
  para o caminho do BR — `br-game.js` desenha o traçante a partir da ORIGEM
  BALÍSTICA, 6 a 20 cm acima da boca, que é o modo em que o dono joga. Vale
  para o hitscan e para o clarão, não para o BR. Zeragem
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

## Frente celular (toque)

O dono joga no CELULAR. Registro em `docs/mobile/`: `referencia-mira-toque.md`
e `referencia-bots.md` (fonte + citação literal), `criterio-aaa.md` (a régua,
escrita pelo validador — quem constrói não edita).

- **A assistência de mira NUNCA assiste quem o jogador não vê.** Parte do alvo
  só conta se está desenhada (no grafo da cena), no frustum/alcance da névoa,
  com o MESMO `rayBlockedAt` do tiro livre, e acima do topo da grama. Assistir
  alguém atrás da parede ou no mato é a mesma família do wallhack de grama.
  Mouse, XR, veículo e morte ficam sem assistência. Ela age na CÂMERA (alcança
  os três caminhos do tiro sem mexer no protocolo), nunca no projétil.
  O `rayBlockedAt` NÃO basta: ele não conhece veículo, copa, tenda nem o alvo
  do estande — atrás do caminhão militar a assistência agia em 22 de 26
  esconderijos com 0 px na tela. `js/oclusao.js` testa o que está DESENHADO.
  **Escolha o esconderijo de teste pela TELA (pixels), nunca pela linha de
  visada do produto** — senão o teste compara a reta consigo mesma.
- **Ordem do quadro fora de XR e fora do carro (a pé, voando e na volta da
  câmera): olhar, vista e veículo ANTES do tiro.** O tiro saía pela câmera do
  quadro ANTERIOR: 0,73° (64 cm a 50 m) arrastando o ATIRAR, 8,9 cm andando de
  lado, 72 cm no 1º tiro do helicóptero. Voando, a bala nasce onde a linha de
  mira passa pelo helicóptero (a câmera de perseguição fica 10 m atrás). XR
  mantém a ordem antiga (contrato de frame do corpo/arma); dirigindo também
  (física, e não se atira dirigindo).
- **Bot sem terreno é CEGO** (ouve e investiga, não atira) e grita no stderr.
  Antes, `lineOfSight(null)` via através de tudo.
- **Agachar é replicado** (`state.crouch` 0..1 → `playerUpdate.crouch`) e o
  servidor LIMITA: fora do chão vale 0, e quem percorre > 3,38 m/s em 0,5 s é
  repassado em pé (caminho somado, não deslocamento). O boneco remoto agacha e
  as esferas de acerto descem junto. **A grama cobre parte do agachado, não o
  esconde** (32,7 % visível contra 56,2 % em pé a 30 m — lâmina de 0,62 a
  1,33 m). Não existe postura deitada.
- **Teste que teleporta o jogador acumula punição do anti-teleporte e é
  EXPULSO ao passar de 120** — a partir daí o quadro desenha outra coisa e o
  teste mede lixo. Devolva o jogador à posição que o servidor aceitou.
- **Bots (`scripts/bots.js`) pensam em funções puras (`tickBots`) que o laço
  real chama** — o teste mede o código que roda. As constantes ficam no objeto
  `AI`, cada uma com a fonte. A queixa "apelão" era onisciência + prioridade ao
  humano + reação zero; o PUBG 12.1 cometeu o mesmo erro e reverteu por hotfix.
  O stderr dos bots agora chega no log do servidor.
  **Re-espiada (decisão do dono, B14):** reação e reaquisição valem em TODA
  volta; a janela de erro só rearma na 1ª volta seguida (escondido ≤ 3 s) do
  engajamento. O relógio literal do CoD4 (3 s desde o último disparo) devolve a
  imunidade no ciclo 3 s/2 s — medido. Quem se esconde > 3 s vira engajamento
  novo a cada volta e continua imune (consequência da régua B2).
  **Bots conhecem os prédios** (B7): `js/paredes.js` reconstrói em Node, pela
  semente, as mesmas caixas do cliente (paridade testada). Terreno e paredes
  carregam JUNTOS — se um falhar o bot fica cego e grita no stderr (terreno sem
  paredes seria wallhack silencioso). A cidade troca de paredes no evento
  `cityDestruction` (`destroyed`; a cinemática ainda conta como de pé). O som
  atravessa parede. **Bots conhecem pedra, árvore, cacto, tenda e POIs**
  (`js/obstaculos.js`, sorteios próprios da semente; paridade com o
  `obstaclesNear` em `test/obstaculos-paridade.test.js`). A regra é a do
  `rayBlockedAt` (r·√0,8 até 3,4 m do chão; fatia de tronco na faixa
  absoluta dela), CONTÍNUA dos dois lados — amostrada a cada 1,6 m, a bala do
  jogador passava por 899 de 1 855 obstáculos que barram o bot. Quem está no
  helicóptero não é alvo de bot (decisão do dono).
- **Árvore é o MODELO desenhado, não o pivô.** De perto cada árvore é um GLB
  cujo tronco não fica no centro (retorcida a ~1 m, bosquete com 3 troncos em
  fila); o colisor era um círculo no pivô — de 175 troncos vistos da
  retorcida, 159 sem colisor, e pilar invisível ao lado. Hoje o colisor é
  espelho medido dos GLBs em `js/obstaculos.js` (`ARVORE.TRONCOS`, fatias de
  0,3 m porque o tronco afina e deita), o modelo é dado da árvore (não do
  `game.js` depois do GLB), a exclusão vale para os troncos, e muda (folha)
  não barra nada. **Âncora de teste é a malha desenhada** (`Raycaster` na
  InstancedMesh, `test/arvores-colisor.test.js`), medindo silhueta (centro e
  largura), não contagem de retas. **Armadilha do three:** o raycast da
  InstancedMesh testa a `boundingSphere` CACHEADA — depois do LOD repartir as
  instâncias ela é de outro lugar e o raio sai cedo (chame
  `computeBoundingSphere()` antes de medir).
- **Pedra: a bala usa a MALHA desenhada** (80 triângulos reconstruídos sem
  three em `js/obstaculos.js` — mesma deformação pelo simplex do terreno,
  mesma matriz —, Möller–Trumbore), e o corpo segue o círculo de sempre
  (`corpo: false` / `bala: false` no obstáculo). O círculo de 0,8·s deixava a
  borda visível sem colisão E parava bala no ar por cima de pedra baixa (58 e
  124 de 197 silhuetas). **Fatia em altura não serve para domo** (perto do
  topo o contorno encolhe e a fatia sai minúscula) e **casco convexo tapa a
  reentrância** (bala parando no ar até 25 cm fora) — só a malha deu 0 e 0.
  **Cacto idem** (os mesmos cilindros e esfera do `game.js`, gerados no
  layout de vértices do three em `formaDoCacto`), e **barril e tenda param
  no topo desenhado** — todo cilindro de obstáculo subia até 3,4 m e parava
  bala no ar por cima de coisa baixa (`test/cacto-colisor.test.js`).
- **Veículo segura bala, mas não para sempre** (decisão do dono, 2026-09-28):
  vida AUTORITATIVA no servidor (`vehicleHit`/`vehicleBlast`, mesmas travas e
  orçamento do tiro em jogador), regra única em `js/veiculo-vida.js`. Inteiro,
  barra bala nos três caminhos, na vítima e na visada do bot (o ponto único é a
  composição de `Structures.rayHit/segBlocked` no game.js). Vida zero: para de
  proteger na hora, queima 5 s, explode e some; quem está dentro morre.
  O servidor passou a carregar `three` + terreno no boot (dependencies).
  **O carro SOLTO é do último motorista até parar**: a pose vai DENTRO do
  `state` dele (`solto`) e volta DENTRO do `playerUpdate` (servidor confere
  posse, janela, velocidade, chão e parede; o bot lê o mesmo `solto`). Antes
  o servidor e os outros ficavam com a pose da SAÍDA, a até 53 m de onde o
  carro parou. **Dois voláteis seguidos para o mesmo destino: o socket.io
  descarta o segundo** — um `carSolto` à parte no tique do `state` sumia com
  o ex-motorista por 2–2,65 s, e o `carRola` antes do `playerUpdate` fazia o
  mesmo no servidor (0 updates em 4 s, medido). Dado novo vai DENTRO do
  pacote que já existe.
  Teste disso em tempo de relógio: o laço do renderer segue rodando no
  harness, e `QA.tick` por cima faz o jogo andar MAIS RÁPIDO que o relógio
  (medido: 47 m/s aparentes a 105 km/h) — regra de servidor que mede
  velocidade por relógio recusa o que é legítimo. Use `sleep`, não tick.
- **Marca `noBullet` em parede** (js/paredes.js): segura o CORPO mas deixa a
  bala passar — guarda-corpo vazado da escada da Torre Nexus (como o
  `playerclip` do Source). Antes barrava bala: 90 quadros de fuzil, 120 → 120
  de vida no segurança visto entre as barras. E o contrário também existia:
  degrau desenhado maciço sem colisão de bala (16/16 tiros atravessavam).
  **Desenho sólido tem de barrar bala; desenho vazado não.**
- **Acabamento da cidade é DADO em `js/paredes.js` (`acabamentoDaCidade`), e o
  `structures.js` desenha a partir dele.** Parapeito de todo telhado, pódio,
  cornija, porta, pilastras, casa de máquinas, caixa d'água, ar-condicionado,
  antena, bancos, floreira, hidrante, lixeira, postes e o acabamento de fora e
  do topo da Torre eram só desenho: a bala atravessava 318 de 329 retas que
  batiam neles (`test/acabamento-bala.test.js`, âncora na malha). Viraram
  lajes `city` `noCollide` (barram bala e visada, não mudam o andar). O
  sorteio do detalhe (LCG de semente constante 0xB111D5) mora lá, na mesma
  ordem: o desenho saiu IDÊNTICO (soma de vértices e cores das 4 malhas).
  **Peça nova que parece sólida entra no dado, não num `trimBox` solto.** O
  piso do pátio do castelo também (`foundation-slab`): 715 de 3 957 retas
  que furavam o piso passavam. **Caixa de bala MAIOR que o desenho é bala
  parando no ar:** o quadrado de lado 1,8·r no poste sobrava 2–4 cm na
  diagonal e a retícula ficou branca com o inimigo à vista; cilindro vira 5
  caixas DENTRO do círculo (`caixasDeBala`), e o teste mede a sobra com reta
  RENTE (2 cm fora da superfície), não só a 0,3 m. **A lista de paredes
  dobrou (586 → 1 133)** e `rayHit` varre linear: blocos de 16 paredes
  consecutivas com caixa-união podam a varredura (3,45 µs por reta contra
  5,25 com a metade das paredes) — no cliente e na consulta dos bots.
- **Canhão e atrações saem da SEMENTE** (`planejarAtracoes` em
  `js/maptoys-core.js`, via `construirObstaculos().atracoes`): antes cada
  módulo lia `Structures.sites` AO VIVO, que ganha o mercado e o refúgio
  depois do `await` do GLB deles — onde as atrações nasciam dependia da rede,
  e o bot não sabia do painel do campo de tiro. O painel (9 × 3,4 m) é PAREDE
  (corpo e bala) no cliente e no bot (`paredesDasAtracoes`), assentado como as
  construções; antes o bot deu 10 acertos num humano que a tela escondia atrás
  dele. **Teste de bala contra um sólido descarta a reta que outro sólido
  corta antes** (relevo rente, tronco) — senão acusa "parou cedo" onde a tela
  também para.
- **O vulcão desenhado segura bala** (`js/vulcao-solido.js`: o GLB lido sem
  three, na MESMA transformação do `js/volcano.js`, grade XZ de 2 m +
  Möller–Trumbore). O relevo é uma grade 56 × 56 de 8 bits do modelo e a
  rocha desenhada passa dele em 45 % da superfície (até 6,7 m na saia; a
  calota de lava cobre o poço da cratera): 417 de 513 retas atravessavam a
  rocha. Entra na composição única de `Structures.rayHit/segBlocked` e no
  `lineOfSight` do bot (que lê o GLB do disco). **O corpo pisa na rocha
  desenhada** (`chaoDoVulcao`: plataforma `superficie(x, z)` no `groundAt`,
  parede onde ela sobe mais que o degrau de 0,65 m; o bot anda no maior dos
  dois) — **menos a calota de lava** que cobre o poço da cratera: pisar nela
  é afundar na lava (cai no poço do relevo e queima pela regra de sempre).
  Carro ainda roda no heightfield do relevo — e quem SAI dele debaixo da
  rocha sobe para a superfície (corpo dentro da rocha, venha de onde vier,
  sobe); o painel do campo de tiro tem corpo CANNON próprio (nasce depois do
  laço de boot). **No QA o `composer.render` é no-op: nada atualiza a
  `matrixWorld` de modelo carregado depois do boot** — teste que lê vértice
  ou faz raycast nele chama `updateWorldMatrix(true, true)` antes.
- **A vítima aceita o dano se o TRONCO OU a CABEÇA estão alcançáveis**
  (`youWereHit`, br-game.js). Com um ponto só (pé + 1 m), em pé atrás de
  mureta na cintura o jogador ficava IMUNE com a cabeça de fora (vida 100 com
  o tiro do anfitrião), e com esse ponto dentro de um sólido (pedra em pé na
  encosta, degrau da escada) recusava tudo e atirava. O empurrão da malha
  (pedra/cacto) cobre tronco e olho, e debaixo dos degraus baixos da escada
  da Torre há bloqueio só de corpo (`vao`, o `playerclip` do Source).
  **Os pontos são os que o atirador VÊ**: centros das esferas de acerto do
  boneco remoto (`esferasDoCorpo`, a mesma conta, com o avanço da
  inclinação agachado) e o alto do capacete. Com o OLHO (1,62 m) no lugar da
  cabeça, atrás de muro de 1,62–1,94 m a tela mostrava o alto da cabeça e a
  vítima recusava.
- **O relevo da bala é EXATO** (`retaNoRelevo`, js/terrain.js): a grade é
  plano por triângulo, então entre dois cruzamentos de aresta (x, z e a
  diagonal b–d) a reta menos o chão é linear — sinal nas pontas e
  interpolação. A marcha de 1,6 m furava crista desenhada (85 de 160 retas
  que raspam por baixo) e segmento mais curto que o passo nem olhava o chão
  (o quadro da balística). `rayBlockedAt` e a visão dos inimigos PvE usam a
  mesma função; origem enterrada (granada no chão) tem 1 m para sair do chão.
  Âncora do teste: os triângulos do `terrainMesh` (`test/relevo-bala`).
- **Posse de veículo (`enterCar`/`leaveCar`) sai DEPOIS do `state` do
  tique**: antes, o evento normal ocupava o transporte e o `state` volátil
  sumia a cada entrada e saída (volátil emitido logo depois de outro envio
  no mesmo tique se perde).
- **O servidor conhece o chão que SUSTENTA** (`soloDaSemente` +
  `superficieSob`): relevo, piso das paredes da semente (nos dois estados da
  cidade, e as atrações), as superfícies do castelo e das torres de vigia e a
  rocha do vulcão — o que está ABAIXO da pose, não o mais alto da coluna. O
  castelo sai de `castleGeometry` (js/castle.js, pura: a MESMA conta que o
  `createCastle` materializa), as torres de `towerPlatforms`. **Acabamento
  `noCollide` não sustenta**: o helicóptero do cliente atravessa caixa
  d'água, poste e cobertura, e contá-los tirava o piloto legítimo que
  pairava por baixo (laudo a9a4ffd, P3). Para o CORPO do carro solto as
  lajes contam (só o acabamento fica de fora). Piloto precisa de 0,4 m sobre
  esse chão; carro solto no ar segue a parábola da decolagem e não atravessa
  parede; a janela do carro solto só abre para quem DIRIGIU.
  **O que o cliente PISA o servidor tem de conhecer, peça por peça**: os
  degraus da escada da Torre são caixas de bala com topo no meio do degrau,
  e no começo de cada um a rampa que o cliente anda ficava sem chão debaixo
  (o lance do andar de baixo, 3,3 m) — as plataformas do interior da Torre
  entram no estado "de pé" (somem com a cidade destruída). Carro solto: a
  parábola é um TETO, não a trajetória — subida pela velocidade horizontal
  (o deslocamento medido subestimava com o jitter), e lançada do MAIOR
  instante possível entre o último pacote no chão e meio segundo depois
  (nascendo só no pacote do chão, a descida chegava antes do carro). A
  janela é ancorada no último pacote ACEITO: ancorada em "agora", cada
  recusa a renovava e o pairar a 2,8 m voltou a 20 de 40. O QUIQUE entre
  dois pacotes reinicia a parábola com ≤ 70 % da velocidade que a energia do
  teto permite (o ápice cai à metade a cada quique). A parede se testa pelos
  CANTOS do casco (`VV.TIPOS`), não pela reta do centro; a saída vem DENTRO
  do `state` (`largar`), e o `carFree` sai depois do `playerUpdate` volátil.
- **Modelo 3D vai em gzip no fio** (server.js, `modeloGz`): a borda comprime
  o JS mas passa `model/gltf-binary` cru — medido em produção, o fuzil chegava
  com os mesmos 557 KB do disco, e os modelos são 14 dos 17 MB do boot em 4G.
  Cada .glb é comprimido UMA vez (threadpool do zlib, em memória; em produção
  pré-aquecido depois do boot) — comprimir por pedido disputaria a única vCPU
  com a partida. 13,83 → 7,94 MB. `Vary: Accept-Encoding`, ETag próprio, e a
  fonte v1 do castelo segue 404 (`test/modelos-gzip`, âncora nos bytes do
  disco).
- **Inimigo de POSTO (Executivos da torre, guardas) não renasce à vista:** só
  com o jogador a > 75 m e sem ver o posto nem o corpo (Left 4 Dead, Valve
  2009). O corpo cai no piso do andar em que morreu, não no terreno.
- **Construção se ASSENTA no terreno** (`js/paredes.js`): fundação até o ponto
  mais baixo da pegada, muro de base em trechos que descem a encosta, caixote
  no chão debaixo dele, portão e rampa do castelo com aterro. Antes, peça
  montada na altura do centro flutuava até 8,2 m na encosta e bicho, jogador e
  bala passavam por baixo. **Teste que escolhe parede pela altura da CAIXA
  erra** (caixote com fundação tem caixa de 2,1 m): use altura acima do chão.

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
  altas 21000+/23000+/26000+ — ou `PORT=0`, com a porta lida do log "Servidor BR
  no ar em http://localhost:N".) **Porta fixa ≥ 32768 é bomba:** é a faixa
  efêmera do Linux (32768–60999), e qualquer conexão de saída da máquina pode
  estar nela — `security-regression` (33000+) virou "regressão real" com
  `EADDRINUSE`. Servidor de teste novo: `PORT=0`.
- **Teste longo com partida BR tem a destruição da cidade aos 90 s de relógio
  de PAREDE** (flag `cidade`, ligada por padrão), e a cinemática toma a câmera.
  Onde ela cai depende de quanto o setup demorou: `aim-visibilidade` passava ou
  não conforme a cinemática pegasse a varredura (61 de 130 casos com a câmera
  a 200 m de altura). Se o teste não é sobre o evento, `flags: { cidade: false }`.
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
- **Placar de suíte relatado por agente não vale sem o processo MORTO.** Em
  2026-09-03 um agente de QA devolveu "168 pass / 0 fail" em 10,7 min — e o
  `scripts/run-tests.js` dele ainda estava vivo 31 min depois (o segundo
  agente o encontrou em `xr-mao-controle`). Ele leu o log pela metade e
  chamou de resultado. Enquanto isso o orquestrador rodou cinco arquivos
  "isolados" nas mesmas portas, achando a máquina livre. Antes de aceitar um
  placar: `ps -eo pid,etime,cmd | grep run-tests` tem de estar VAZIO, e o
  número tem de vir da linha final do próprio runner, não de contagem de
  `ok`. E antes de rodar QUALQUER teste: o mesmo `ps` — inclusive para os
  seus próprios.

- **"Teste que passa por acidente" já apareceu DEZ vezes nesta base, e é a
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

  10. **A condição que valida o caso é a que esconde o defeito** — o teste de
     "a cabeça manda no jogo" precisa do giro artificial em ZERO para que
     régua e leitura vivam no mesmo espaço; e com o rig em zero
     `camera.quaternion` **é** a pose de mundo, então o mutante que troca
     `yawDaVista()` por `camera.quaternion` passa verde nos seis ângulos. A
     saída não foi enfraquecer o caso: foi ACRESCENTAR o complementar, com
     giro artificial diferente de zero e régua independente (transformada do
     rig + ângulo comandado). Ele pega o mesmo mutante a 156,29°.

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

- **Mas régua que mede a coisa errada se REESCREVE — com pesquisa e com o
  motivo no arquivo.** B7 cobrava "origem do tiro a ≤ 5 cm da boca" e reprovava
  sete das oito armas com os mesmos dígitos por cinco rodadas. Os sete números
  saem de `js/weaponrig.js` com uma calculadora, sem o jogo rodando: são a
  altura de alça de cada perfil ao quarto decimal. **O critério media o ASSET e
  chamava de comportamento**, e nenhuma mudança em `fire()` mexia nele. A
  distinção que vale: afrouxar é baixar o teto para caber; reescrever é trocar a
  grandeza porque a antiga não descrevia defeito. O novo B7 tem cinco asserções
  que podem reprovar contra uma que era inalcançável por construção. **Quem
  constrói continua sem editar a régua** — isso é decisão de produto.
- **Régua não se afrouxa para desbloquear a própria frente.** Quando B7 (origem a
  ≤ 5 cm do cano) e B3 (tiro na linha de mira) se mostraram geometricamente
  incompatíveis, o teto do TESTE foi afrouxado com o motivo escrito no arquivo, e
  o texto do CRITÉRIO ficou intocado esperando decisão do dono. Critério que a
  implementação reescreve para si mesma deixa de ser critério.
