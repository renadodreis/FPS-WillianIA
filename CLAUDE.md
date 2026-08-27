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
