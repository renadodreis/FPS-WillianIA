Original prompt: eu adicionei uns projetos em 3d. local uns carros, quero substituir os carros do jogo por eles, mas com performante e teste, consegue? outra coisa acho que em cada partida reiniciada os baus nao estao resetando, cuidado pra nao criar bugs e faca os testes

## Estado atual

- Identificados três modelos-fonte na raiz: `gumball_car.glb`, `low-poly_truck_car_drifter.glb` e `mazda_rx7_stylised.glb`.
- Diagnóstico do reset: `match.openedChests` só é limpo em `startMatch()`. O evento `nextMatch` recarrega os clientes antes disso; o novo `init` do lobby ainda contém os baús abertos da partida encerrada.
- Perfil dos fontes: Gumball 6,52 MB / 456.052 vértices renderizados; caminhão 1,42 MB / 47.676; RX-7 409 KB / 17.199. O Gumball também usa cerca de 26 MB de texturas descomprimidas na GPU.
- Otimização experimental em `/tmp`: Gumball 1,15 MB / 137.041 vértices; caminhão 421 KB / 46.347; RX-7 80 KB / 14.616, todos sem decoder adicional em runtime (`KHR_mesh_quantization`).

## Próximos passos

- Criar e observar falhar o teste de regressão do baú entre partidas.
- Corrigir a limpeza na transição para o lobby e rodar o teste novamente.
- Gerar derivados otimizados em `assets/models/`, integrar um carregador com cache e fallback e manter as colisões/física existentes.
- Adicionar teste de carregamento/normalização/custo dos modelos e testar direção, colisões e screenshots no navegador.

## Ciclo concluído: reset dos baús

- RED confirmado: o novo teste recebeu `openedChests: ['c1']` no `init` após `nextMatch`.
- GREEN confirmado: `resetRoundState()` agora limpa baús, drops e posse de carros antes de publicar o lobby; o teste focado passou (1 teste, 0 falhas).

## Ciclo concluído: modelos dos carros

- RED confirmado: `test/car-models.test.js` falhou inicialmente porque `Car.ready` não existia.
- Três derivados gerados em `assets/models/` com `KHR_mesh_quantization`, sem decoder extra no navegador.
- O RX-7 foi gerado sem o nó `Floor`; o caminhão foi gerado sem 12 nós de fumaça e sem uma animação que o jogo não executava, permitindo consolidar as malhas.
- `js/car.js` agora carrega/cacheia cada fonte uma vez, clona geometria/material, normaliza X/Z ao collider, apoia o modelo no chão e mantém fallback barato.
- Rodas procedurais duplicadas foram substituídas por proxies `Object3D` invisíveis usados apenas pela física/poeira.
- GREEN confirmado: teste de modelos passou; lint completo passou sem erros.

## Playtest visual

- O cliente oficial de web game entrou numa partida real; `render_game_to_text` confirmou 6 veículos com `model: ready` e não produziu arquivo de erros de console.
- Screenshots individuais foram capturados e abertos para os três arquétipos.
- A inspeção encontrou o RX-7 preto sem contraste; foi aplicado material Standard nas variantes vermelha/azul e o teste passou de RED para GREEN.
- A inspeção também encontrou o RX-7 invertido no eixo de direção; `modelYaw: Math.PI` foi registrado em teste e confirmado visualmente com a dianteira em `+X`.

## Verificação final

- `RANK_FILE=/tmp/fps-final-verification-rank.json npm test`: 139 testes, 139 passaram, 0 falhas, 0 cancelados, 0 ignorados.
- `npm run lint`: concluído com código 0.
- Testes Chrome/WebGL agora rodam com `--test-concurrency=1`; em paralelo o SwiftShader perdia contextos e gerava falsos negativos.
- Assets finais: Gumball 1.147.872 bytes / 31.991 vértices únicos; RX-7 79.564 / 4.038; caminhão 354.612 / 14.303. Total: 1.582.048 bytes e 50.332 vértices únicos compartilhados.
- `br-rank.json` permaneceu fora do escopo; a verificação final redirecionou ranking para `/tmp`.

## Correções da 3ª rodada de QA (bugs #40–42 + lacunas da auditoria)

Os bugs #40–42 mapeados acima foram corrigidos e cobertos por testes
(`test/skeletons.test.js`, `test/br-golem.test.js`, `test/animals-combat.test.js`).
Na sequência, as lacunas da auditoria de combate foram fechadas:

- **Protocolo dedicado de explosivos (`explosionHit`)**: granada/bazuca não viajam
  mais por `shotHit` — o servidor valida o PONTO DE IMPACTO (não a arma equipada
  nem a posição do atirador). Granada com FACA equipada funciona; a cobertura da
  vítima parte do impacto; kill segue creditada ao atirador. Tipos fora de
  GRANADA/BAZUCA (ex.: `MÍSSEIS`) são rejeitados — o evento de destruição da
  cidade continua exclusivo do servidor (`byCity`, causa `city`, sem crédito de
  kill). Arquivos: `server.js`, `br-game.js`, `js/grenades.js`, `js/rockets.js`;
  testes: `test/br-explosion-protocol.test.js` (7 casos).
- **Criaturas da noite**: mordida do zumbi/fantasma agora exige linha de visada
  (parede, árvore, pedra, andar de cima/baixo) e o movimento tem guarda de NaN
  quando o jogador está exatamente acima/abaixo. `js/night.js` + `game.js`
  (injeção de `obstaclesNear`); testes: `test/night-combat.test.js`.
- **Loot de bots em morte ambiental**: `dropLootOnce` idempotente — bots mortos
  por gás, cidade ou AFK também soltam loot (antes só morte por tiro).
  `scripts/bots.js`; testes em `test/bots-behavior.test.js`.
- **Tiro humano que ERRA replicado**: `__BR_shotMiss` → `shotFired` (throttle de
  220ms), cobrindo hitscan e projéteis balísticos que morrem em parede/expiram.
  `game.js`, `br-game.js`; teste em `test/br-cover.test.js`.
- **Onda de choque no carro respeita cobertura** (`blastClear` também no impulso).
  `js/grenades.js`; teste em `test/explosives.test.js`. Para o teste unitário,
  `cannon-es@0.20.0` entrou como devDependency (no browser vem do importmap/CDN).
- **Testes desatualizados pelo anti-cheat novo**: arma inexistente (`HACK`) agora é
  descartada inteira (ganhou teste próprio); flag `ship` forjado fora da rota é
  rejeitado e vira INATIVIDADE (ganhou teste próprio); o teste da zona usa um
  jogador parado no gás sem flag forjado. Vazamento de estado entre testes de
  `br-pve-weapons` corrigido (esqueleto vivo na frente da câmera).

## Correções da rodada de playtest (2026-07-13, reports do Renato)

- **Loot lento / "baú sem nada"**: `rollChest` dava só munição em 38% dos baús
  (inútil pra quem nasce de faca). Agora ≥88% entregam ARMA (`server.js`;
  teste de taxa em `test/plan.test.js`).
- **Baú do heliponto vazio**: a caixa no telhado da TORRE NEXUS era decoração
  do modo solo. No BR virou baú de verdade (key `torre`) com recompensa fixa
  do servidor: BAZUCA + colete + kit (`server.js`, `br-game.js`; testes em
  `server.test.js` e `br-cover.test.js`).
- **Atirar do helicóptero**: o gate de tiro bloqueava `state.flying`. Liberado;
  a origem do disparo é o HELI (não a câmera de perseguição, que o servidor
  rejeitaria por ficar ~10m atrás da posição autoritativa) e o HUD de munição
  continua visível a bordo (`game.js`, `js/heli.js`; teste em
  `gameplay.test.js`). Granada segue bloqueada em voo.
- **Carros flutuando/enterrados**: fora da cidade o heightfield físico (grade
  de 4m) diverge do terreno visual; o modelo agora ancora no `heightAt` — na
  cidade mantém as rodas (asfalto acima do terreno). Resolveu também o flake
  do caminhão no `car-models.test.js` (`js/car.js`).
- **Física do carro**: teto de velocidade por veículo (buggy 72 / caminhão 84 /
  esportivo 118 km/h) e direção sensível à velocidade (esterço cheio parado,
  ~40% no talo) — sem isso o esportivo saturava o esterço e "não virava"
  (`js/car.js`).
- **Grama sob veículos**: clareiras de grama em todas as vagas de carro + o
  buggy do spawn (`js/grass.js`, `game.js`). ⚠️ Lição: a criação da Grass NÃO
  pode mudar de posição no init — ela consome o `rand` seedado e qualquer
  reordenação muda o layout do mundo inteiro pra mesma seed (3 testes de
  mundo quebraram). Solução: array de clareiras por referência +
  `Grass.refreshAll()` no FIM do init.
- **Modelo do carro re-ancora quando parado**: o chassi continua assentando
  depois do alinhamento inicial; parado e fora da cidade o modelo re-ancora
  no terreno visual continuamente (só aritmética, sem Box3) — `js/car.js`.

## Pendências (arquiteturais, mapeadas — sem correção nesta rodada)

- **Bots não conhecem paredes/árvores/LOS** (`scripts/bots.js`): reconstroem só
  terreno/baús; podem mirar através de cobertura. Exige colisores/nav
  determinísticos no processo dos bots ou autoridade de mundo no servidor.
- **Integridade client-authoritative** (`server.js`): o servidor ainda aceita o
  dano informado pelo atirador e killer/causa informados pela vítima. Mitigado
  por validações de alcance/orçamento/flood, mas sem histórico autoritativo.

---

# Atualização: assets 3D completos (armas, corpo FP, monstros, cenário)

Prompt original: integrar a pasta assets/models/ reorganizada (Armas/, Cenários/,
Personagens/, Veículos/) — trocar personagem principal (mãos rigadas em 1ª pessoa),
monstros, armas e cenário; conferir as melhorias pendentes; publicar no GitHub.

## Correções antes de tudo

- Carros estavam QUEBRADOS: a reorganização em subpastas invalidou os caminhos de
  js/car.js. Corrigidos código + teste; o servidor agora serve assets/models/
  inteiro via express.static restrito (a whitelist manual não escalava pra ~25
  arquivos novos).
- harness de teste acha o Chrome no Windows — a suíte inteira (inclusive
  Chrome/WebGL) roda agora na máquina do Willian igual rodava no cloud.

## Ciclo concluído: armas GLB em primeira pessoa (js/weaponmodels.js)

- 7 modelos integrados no padrão do car.js (cache, normalização por bounding box,
  fallback procedural): M4→FUZIL, shotgun pesada→TROVÃO, sniper pesada→DMR,
  bazooka(otimizada 9,2MB→0,8MB)→BAZUCA, arma do alien→PLASMA, e DUAS ARMAS NOVAS:
  SNIPER "AGULHA" (idx 6) e ESCOPETA "RAJADA" (idx 7), com loot/teclas 7-8/balística.
- Auto-orientação: o eixo mais comprido do modelo deita em Z; muzzleAnchor
  reposicionado pra ponta real (flash/tracer saem do cano do GLB).
- A AGULHA usa as animações EMBUTIDAS do GLB ("reload"/"bolt_slide") encaixadas na
  duração real de recarga/ciclo, e os nós mag_4/bolt_6 do modelo foram religados
  nas âncoras parts.mag/parts.bolt — a coreografia de recarga existente move
  geometria real do modelo.

## Ciclo concluído: corpo rigado em primeira pessoa (js/fpbody.js)

- O helldiver (51 ossos, dedos individuais) fica pendurado na câmera, ancorado por
  bounding box (pescoço no olho, cabeça escondida via scale 0 do osso).
- IK analítico de 2 ossos por braço mirando as MESMAS âncoras (gun.parts.handR/L)
  que a coreografia de recarga já anima — pente saindo, tapa, bombeada e sway
  continuam com o timing original, agora com braços e dedos de verdade.
- Punho por alinhamento geométrico: o eixo real dos dedos (medido do rig) alinha
  com a direção da empunhadura + uma rolagem calibrável por mão. Dedos com presets
  por arma (indicador no gatilho, pegada de bomba, faca) e afrouxam na recarga.
- Pernas caminham no ritmo da velocidade (visíveis ao olhar pra baixo), capa
  balança, respiração no peito. Na queda/paraquedas a arma some (mãos nas alças).
- Descobertas do caminho: GLTFLoader remove pontos dos nomes de ossos
  ("Arm_1.L"→"Arm_1L"); braços do modelo são curtos (escala 1.18 pra alcançar o
  grip); waitForFunction do puppeteer usa polling por rAF — com rAF congelado pra
  screenshot determinístico é preciso polling por intervalo.

## Ciclo concluído: monstros rigados (js/charmodels.js)

- Guardiao.glb (Punch/Shoot/Walk embutidas) substituiu o corpo procedural dos
  soldados (clone de esqueleto por instância): Walk com peso pela velocidade,
  Shoot a cada rajada, e SOCO novo quando o player cola (9 de dano, telegrafado,
  cooldown 2,4s). Flash religado no nó MuzzleFlash do próprio rig. Executivos
  (suit) continuam procedurais — são civis. FSM/hitbox/balanceamento intactos.
- Alien otimizado (5,5MB→1,2MB, rig+Take 001 preservados) substituiu o corpo do
  VISITANTE, com a animação embutida em loop. Morte/blink/orbes intactos.

## Ciclo concluído: cenário (js/scenery.js)

- Árvores GLB "assadas" em geometria única com vertex colors → continuam
  instanciadas (1 draw call por variante). Variantes: retorcida, bosquete de
  pinheiros, tocos (8%), e a "giant tree" — que na verdade é uma ILHA FLUTUANTE
  com bonsai — virou marco raro (1/40, só em floresta).
- Materiais texturizados (cor-base branca) recebem paleta de fallback no bake —
  sem isso os pinheiros saíam fantasmas.
- POIs novos com colisão (player+veículos) e baús automáticos do BR: MERCADO na
  beira da cidade, REFÚGIO NA ÁRVORE na floresta, barris espalhados.

## Melhorias da lista do Willian (auditoria)

- Já resolvidas em ciclos anteriores: ping no HUD, música/vento removidos, drop de
  munição ao matar, carro visível pros outros, save removido, dia 3x mais longo
  que a noite, salto automático da nave, opções de gráficos/áudio, código de
  anfitrião, cabine interna do OVNI.
- NOVO watchdog de aba oculta: quem alt-tabava na queda ficava pendurado no ar,
  imortal fora da zona, e a partida não terminava — agora um setInterval (roda em
  segundo plano) faz a queda grosseira e aplica o dano do gás quando o rAF morre.
- SFX: variação de pitch por disparo (rajada não vira metrônomo) e som próprio de
  facada (SFX.melee) no lugar do som de troca de arma.

## Verificação

- npm run lint: 0 erros. Suíte completa + test/asset-models.test.js novo (GLBs
  válidos com rig/animações + integração viva no Chrome).
- Playtest visual: output/fp/ (armas nas mãos, recarga, ADS, corpo em 3ª pessoa)
  e output/world/ (Guardião, Visitante, floresta nova, mercado, refúgio) — todos
  capturados sem erros de console.

## Verificação final

- `npm run lint`: 0 erros.
- Suíte completa: **149 testes, 149 passaram, 0 falhas** (Windows + Chrome
  headless/SwiftShader), incluindo os 7 novos de assets 3D.
- Consertos que a suíte puxou: spawn do Visitante (nascia enterrado usando a
  altura do disco), bounding box ciente de pose no charmodels, teste de loot
  atualizado pro arsenal de 8 armas, teste de engajamento da IA determinístico,
  e RNG próprio pros POIs/árvores (o rand() global em bloco assíncrono quebrava
  o mundo compartilhado entre clientes).

## Novo pedido: castelo GLB (2026-07-23)

Prompt adicional: "eu tenho um castelo, que fiz em .glb, quero adicionar ele no
lugar do castelo do jogo, mas ele precisa se encaixar perfeitamente, o robô que
atira precisa continuar ao redor protegendo o castelo, isso precisa ser muito bem
implantado e testado, para não quebrar ou corromper, encontre bugs".

- Plano TDD salvo em
  `docs/superpowers/plans/2026-07-23-castle-glb-integration.md`.

### Asset e implantação

- As fontes locais/ignoradas `castelo_reconstruido_escala_real.glb` e
  `assets/models/boss-castle.v1.glb` são cópias byte a byte: 1.716.420 bytes,
  SHA-256 `fd05cc2fa6aebcd73d16440280b90074624a67bd67e9fc385017ced525e18449`.
  O servidor bloqueia a v1; ela nunca é servida nem versionada.
- `npm run build:castle` gera deterministicamente
  `assets/models/boss-castle.v2.optimized.glb`: 930.236 bytes, SHA-256
  `6020def3614d8c32a91d8ccb1d2867c8fe62f07b4c34b89cc1a8ae2339c0b966`,
  10 meshes/primitivas, 24.488 triângulos, 10 materiais, bbox aproximada
  `38,360 × 20,100 × 38,181 m` e somente `KHR_mesh_quantization`.
- `js/castle.js` virou a fonte única de verdade: publica layout, fundação,
  portão, colliders, pisos, coberturas, rampa, clareiras e lifecycle antes do
  carregamento assíncrono. O GLB só substitui o proxy visual depois de validação
  semântica completa; download, parse ou modelo inválido mantêm fallback
  jogável.
- O forte antigo continua sendo construído oculto como
  `bossCastleLegacySource`, apenas para preservar geometrias, UUIDs e a ordem
  exata do RNG. Ele não publica colisores nem aparece como fallback.
- A rampa de entrada usa perfil C1 com 12 segmentos, a mesma função `heightAt`
  no terreno lógico/IA, uma malha visual e um único `CANNON.Trimesh`. A clareira
  visual/grama tem 28 m; obstáculos rígidos são removidos em 49 m para proteger
  o Golem na órbita de 30 m.
- O Colosso nasce/respawna no pátio, usa a superfície do castelo para andar,
  morrer e disparar, e retorna pelo portão em arco
  `rear/front-side → side-front → gate-side → gate → home`. O Golem BR continua
  completando voltas orientadas ao redor do castelo e mantendo ataques/pisão.

### Bugs encontrados e corrigidos

- Nove dos dez materiais autorais renderizavam brancos; o builder aplica paleta
  explícita antes da otimização.
- Fundação de 1,1 m deixava o terreno atravessar o pátio; o encaixe agora mede
  extremos do terreno e cria fundação/piso contínuos.
- Portas autorais deixavam 1,18 m e prendiam o Colosso de raio 1,5 m; as folhas
  foram removidas e o vão/colliders foram alinhados.
- Colliders antigos não correspondiam às torres/keep e criavam paredes
  atravessáveis e obstáculos invisíveis.
- A primeira rampa linear excedia 41,97° na seed 138 e lançava o carro; depois,
  caixas Cannon segmentadas criaram faces internas e o prenderam. O perfil C1,
  a rejeição de sites acima de 30° e o Trimesh único corrigiram ambos.
- `groundAt` ainda interpolava a rampa linearmente e divergia até 24,76 cm da
  malha/física curva; agora consulta `ramp.heightAt`.
- A seed 138 permitia base na órbita e a 150 permitia a cidade destruída sobre
  a rota. Reservas de 30 m para bases e 120 m para cidade corrigiram sem novas
  chamadas RNG; a assinatura completa da seed 424242 continua idêntica.
- Vegetação rígida, grama e chunks interiores podiam invadir fundação/rampa; a
  exclusão pós-amostragem preserva o consumo aleatório.
- O retorno lateral/traseiro usava cantos a 42,4 m e depois tolerância de 2 m no
  portão, penetrando a ombreira em até ~44 cm. A rota agora fica dentro do raio
  reservado, usa tolerância de 20 cm e deslocamento limitado sem depender do
  solver de colisão.
- O lifecycle retinha efeitos, materiais CSM e corpos lógicos; o descarte agora
  remove cada recurso uma vez, inclusive se ocorrer durante o loading.
- O teste HTTP de GLB aceitava 404 com `Cache-Control`; agora exige status, MIME
  e magic `glTF`, e a fonte v1 é negada.
- Readiness podia aceitar servidor antigo na mesma porta; um token por processo
  identifica o filho correto. Outro race iniciava a partida antes de
  `br-game.js` registrar `matchStart`; o harness agora espera prontidão e
  identidade do socket. Em QA, o ping timeout maior preserva a identidade
  durante ticks manuais longos; promessas de falha também são limpas.
- O capturador visual ainda esperava 900 ms fixos e abria o Chrome fora do
  lifecycle protegido: boot lento/porta ocupada podia validar um servidor velho
  e falha no `launch` deixava processo/rank temporário órfãos. Agora ele exige o
  token do filho atual, verifica HTML/status, encerra com TERM/KILL e limpa o
  rank mesmo quando o navegador não chega a abrir.
- Os testes continham falsos verdes em bases vazias, chunks de grama,
  publicação atômica, descarte agregado, registries CSM, visual da rampa,
  descarte assíncrono, volta do Golem e impacto do orbe. Todos foram endurecidos.

### Evidência recente

- Builder executado duas vezes com o mesmo tamanho e SHA-256.
- `castle-layout`: 8/8 em seis seeds; `castle-boss`: 6/6; lifecycle 3/3;
  fallback 3/3; veículos 2/2; Golem 6/6.
- Após corrigir os races do harness, `br-death-cause` passou 3× 4/4 e
  `br-drops` passou 3× 5/5. O teste determinístico que atrasa `br-game.js` por
  60 s também passou.
- O teste do capturador reproduziu RED e depois passou 3/3: rejeita processo
  antigo, aceita apenas o token correto e prova limpeza após falha do Chrome.
- `npm run lint` e `git diff --check`: limpos.
- `npm run quality` final terminou com código 0: **478 testes descobertos**,
  477 passaram na rodada principal e `castle-layout.test.js` perdeu o contexto
  do Chrome durante uma navegação. Não houve falha de contrato; o runner
  repetiu o arquivo isoladamente e só classificou como flake depois de
  **duas passagens consecutivas**.
- Capturas inspecionadas:
  `output/world/castelo-frente.png`, `castelo-patio.png`,
  `castelo-rampa-fundacao.png`, `castelo-keep-lateral.png`,
  `castelo-noite.png`, `castelo-fallback.png` e
  `output/castle/golem-patrulha-castelo-atual.png`; sem erros de
  página/console/rede. O capturador endurecido foi executado novamente na porta
  3318, confirmou GLB `ready` com 10 meshes e fallback jogável, e deixou a porta
  e o rank temporário limpos.

### Endurecimento da imagem de produção

- Um teste de contrato do contexto Docker reproduziu e bloqueou três falhas:
  `deploy.env`/`.env*` podiam entrar no `COPY . .`; diretórios de QA e agentes
  inchavam a imagem; e a regra que excluía `scripts/` também removia
  `scripts/bots.js`, embora o servidor o execute em produção.
- `.dockerignore` agora exclui configuração local, saídas e fontes pesadas,
  inclui somente o script de bots necessário e mantém o GLB v2 de runtime.
  `socket.io-client`, exigido pelos bots, passou a ser dependência de produção.
- Build Docker limpo, sem cache: concluído. O contrato interno confirmou o GLB
  v2 com SHA-256
  `6020def3614d8c32a91d8ccb1d2867c8fe62f07b4c34b89cc1a8ae2339c0b966`,
  fonte v1/configuração/QA ausentes, bot presente e carregamento de
  `socket.io-client` funcional.
- Smoke test do contêiner local: healthcheck saudável, `/` e Socket.IO em 200,
  GLB v2 em 200 com 930.236 bytes e SHA esperado, fonte v1 em 404 e nenhum
  cabeçalho de QA exposto.

## Sessão 2026-07-24 — entretenimento no mapa + refatoração de personagens

Cinco rodadas, todas mescladas em `refatoracao`, no fork `renadodreis`, e
DEPLOYADAS por gitpull no server A (`game.renatodreis.com.br`). Detalhe por
rodada em `docs/2026-07-24-*.md`.

- **Canhão de Circo** (commit da entrada em `feat/canhao-circo`, mesclado): atração
  física client-side num ponto vazio — mira virando o corpo, E lança num arco
  (38 m/s @52°, dentro do anti-cheat), recorde salvo. `js/cannon.js` +
  `js/cannon-core.js` (pickSpot determinístico, geometria em noSeed pós-worldgen),
  `player.launchT` + ramo balístico no `playerUpdate`. Testes cannon-core (12) +
  cannon (browser 3260).
- **+5 atrações do mapa** (`js/maptoys.js` + `js/maptoys-core.js`): cama elástica
  (tryBounce no pouso), campo de tiro (alvos extraTargets + recorde), totem de
  fogos, aros de acrobacia (passedRing + guarda de teleporte), xilofone. Espalhadas
  por `pickSpot` com `avoid`. Testes maptoys-core (12) + maptoys (browser 3261).
- **Fix dos baús** (commit `4dfda4f`): `js/chestmodel.js` (baú de verdade — tampa
  abaulada meio-cilindro, ferragem, fechadura + faixa dourada emissiva, geometria
  em cache/noSeed) compartilhado solo+BR; placement fora de parede via
  `Structures.collide` (POI usa openSpot; espalhados/solo empurrados só no visual,
  decisão+rng na posição crua p/ os bots seguirem espelhando `c*`). Teste
  `br-crates` (3262).
- **Personagens lote 1** (`43a6fb2`): crash de recarga (sniper idx6 sem `pos` em
  fallback de GLB derrubava a escopeta idx7 — guard + try/catch); recarga
  dirigindo/morto (`reloadBlocked`); splash −20% fantasma; faca sem headshot em
  remoto (1.75×); cor sem validação → avatar branco (`brcolors.js` = fonte única
  `sanitizeColors`, dual CJS/global); ressurreição deitada (reset deadT); bots
  coloridos. Testes br-colors (6 puros) + char-fixes (3263, bloqueia GLB da sniper).
- **Personagens lote 2** (`a7b0e44`): preview 3D no lobby (canvas reusando
  `buildVoxelBody` via `__BR_debug.buildBody`) + 6 presets + aleatório; re-tint ao
  vivo do avatar remoto (`retint`, guarda `colorsKey`); flash de dano cobre o visor
  com restauração; debounce ~250ms do `hello`. Teste char-lobby (3264); UI por
  `scripts/capture-lobby.js`.
- **Personagens lote 3** (`6bf449e`): feel de recarga — sniper cancel (borda de
  descida do reload no `weaponmodels` devolve mag_4/bolt_6 ao bind); mão esquerda
  em 3 ramos; recarga cancelável ao atirar; escopeta cartucho-a-cartucho
  (`updateReload`, cancel mantém o parcial). Teste reload-feel (3265);
  weapon-mechanisms 8/8.

Pesquisa profunda de personagem (workflow, 55 agentes, 34 bugs) com o roadmap
R6/R10-R15 pendente em `docs/2026-07-24-personagens-refatoracao.md`. Suíte final
verde (532 pass). **Lição de QA:** ao matar a suíte, `pkill` do runner NÃO mata os
`server.js` filhos → órfão segura porta fixa e vira falsa "regressão real"
(EADDRINUSE); sempre `pkill -f "FPS-WillianIA/server.js"` junto.

## Sessão 2026-07-25 — otimização segura do cliente

### Pedido atual

O jogo parece lento até em localhost; otimizar sem introduzir bugs nem quebrar
jogabilidade. O worktree já continha melhorias não commitadas em `br-game.js`,
`js/chestmodel.js` e `scripts/perf-probe.js`; elas devem ser preservadas.

### Diagnóstico antes de editar produção

- Rede/servidor não explica a lentidão local: 30 bots deram RTT p50 1,1 ms,
  p95 11,2 ms e zero falhas. O jogador local é simulado no navegador.
- Render bruto SwiftShader 800×600: 19,52 ms completo; 6,84 ms sem sombras;
  9,27 ms sem grama. A grama responde por ~916 mil triângulos visíveis.
- Cruzar uma célula diagonal enfileira 25 chunks de grama; o orçamento atual de
  seis refills/frame criou quatro frames de 14,5–16,2 ms.
- Sete esqueletos têm 28 meshes com sombra e culling desligado; apenas tirar
  suas sombras no A/B reduziu 17,03 → 13,01 ms.
- Os seis `RaycastVehicle` continuam ativos estacionados: callbacks 1,57 ms e
  broadphase 1,58 ms. `world.step` cresce de 2,42 ms @60 FPS para 5,54 ms @20.
- 65 baús somaram 240 draw calls no probe imediato. Compartilhar materiais e
  culling por distância — mudanças locais já existentes — atacam custo real.
- `game.js` limita o delta a 50 ms e usa esse valor também no HUD. Abaixo de
  20 FPS a simulação entra em slow-motion e o contador continua mostrando ~20;
  `timeScale=0.25` ainda faz 60 FPS reais parecerem ~240.

### Linha de base e plano

- `git diff --check`: limpo.
- `npm run analyze:lines`: 186.871 linhas JS; 409.838 no repositório.
- `npm run lint`: passou antes da suíte.
- Rodada principal de `npm test`: 535 testes, 529 passes, três falhas e três
  cancelamentos sob carga; cinco arquivos entraram na triagem isolada automática
  (`br-golem`, `br-late-join-flags`, `car-terrain-traversal`, `castle-layout` e
  `city-destruction-client`). Todos passaram duas vezes consecutivas isolados:
  somente flakes, suíte final verde (exit 0).
- Plano TDD salvo em
  `docs/superpowers/plans/2026-07-25-performance-optimization.md`.
- Nenhum arquivo de produção foi alterado nesta sessão até este ponto.

### Implementação TDD

- `game.js`: tempo real (`frameDt`) e tempo simulado foram separados sem mudar
  o clamp de 50 ms, `timeScale` ou os três substeps. O HUD não multiplica mais
  o FPS por slow-motion. `G.perf` reutiliza um único objeto e publica
  `frameMs`, `physicsSteps`, `physicsDroppedMs` e `simulationCoverage`; esta
  última inclui tanto descarte do Cannon quanto o clamp (100 ms reais com
  50 ms simulados agora resultam em cobertura ≈0,5).
- CSM: a cascata próxima continua automática a cada frame; uma das três
  distantes é atualizada em rodízio. Primeira renderização, resize, mudança de
  FOV/frustum e reativação de sombras invalidam as quatro. Teleporte >20 m,
  giro >30° ou salto da direção solar >2° também renovam as quatro no mesmo
  frame; o seguinte volta ao rodízio.
- `js/grass.js`: cada lâmina deixou de construir a classificação completa via
  `surfaceAt`; usa `heightAt + biomeAt` e os mesmos `smoothstep`. Uma
  caracterização de 4.096 pontos e comparação de buffers confirmou igualdade
  bit a bit. O shader também reutiliza `modelMatrix * instanceMatrix`.
- `js/car.js`: após 1,5 s estável, ≥3 rodas apoiadas e velocidade baixa, somente
  o `RaycastVehicle.preStepCallback` é suspenso. Body/collider continuam no
  mundo. `wakeup`, `setCur` e pose remota reinstalam o mesmo callback; a pose
  remota invalida o AABB antes de escrever posição/quaternion.
- `js/skeletons.js`: frustum culling foi reativado com esfera calculada uma vez
  no protótipo. A margem inicial de 1,5× foi REPROVADA por um teste de vértices:
  12/175 vértices da cimitarra saíam 40,7 cm no strike p=0,59. A margem medida
  final é 2,1× (mínimo observado 1,968×), deixando ~11,5 cm; o teste vivo agora
  encontra zero vértices fora.
- O culling/prewarm e os materiais compartilhados dos baús que já estavam no
  worktree foram preservados. A atualização de visibilidade foi extraída,
  aplicada no início, a cada 0,5 s e na criação do baú do golem. Carros remotos
  chamam `Car.wake` antes da pose direta.
- Destruir/restaurar a cidade agora acorda a frota antes de remover/reinserir
  lajes CANNON. Um teste RED reproduziu a ausência de wake sobre um carro
  hibernado; o GREEN exige suspensão e AABB ativos antes do próximo step.

### Medições depois das mudanças

- O probe final move câmera **e jogador**, drena o streaming da grama e mede
  lotes de nove caminhos controlados (`G.tick(0)` para frusta/escalonador +
  `WebGLRenderer.render`) após 32 updates de estabilização e seis warmups.
  Calls/triângulos de cada máscara repetiram exatamente nos três ciclos de
  cada pose. Os JSONs completos estão em `output/perf-probe-3271.json`,
  `3272.json` e `3273.json`.
- Em 800×600, ANGLE/SwiftShader, o cenário de produção marcou throughput
  `8,23 / 7,89 / 6,57 ms` (mediana entre processos 7,89 ms) e pior caso de
  `513 / 519 / 519` draw calls (mediana 519). Com todos os 65 baús forçados,
  foram `8,11 / 7,67 / 7,98 ms` (mediana 7,98 ms) e `755 / 748 / 764` calls
  (mediana 755). O culling deixou 2–16 baús visíveis e reduziu o pior número
  mediano de calls em 31,3%.
- O throughput de produção foi ligeiramente pior nas duas primeiras rodadas e
  melhor na terceira; portanto, este probe **não demonstra ganho causal de
  tempo/FPS** no SwiftShader. Os triângulos também não foram monotônicos e não
  sustentam alegação de redução.
  “Sem baús” e “sem feixes” foram mantidos como controles, mas seus tempos não
  são usados para atribuição. O baseline histórico de 19,52 ms usava protocolo
  diferente e fica apenas como indício, sem a antiga alegação de −71,4%.
- Refill de 169 chunks de grama: 216–236 ms → 96–104 ms, ganho aproximado de
  2,3× (o microbenchmark anterior não preservou os brutos), com
  matrizes, phase, tint, tracks e bounds byte-idênticos. O lote permaneceu em
  seis chunks/frame porque a remoção do classificador já atacou o pico sem
  alterar densidade nem fila.
- O probe é throughput relativo de `G.tick(0)` + `WebGLRenderer.render` +
  `gl.finish` em software; não é timer GPU nem representa FPS de uma placa
  real. A simulação não avança (`dt=0`) e o composer real é no-op, mas as
  rotinas de preparação do frame entram no lote. Um controle com quatro
  cascatas por frame foi descartado porque saturou a fila assíncrona do
  SwiftShader e deixou de ser uma comparação isolada.
- Todas as três rodadas válidas tiveram zero `pageerror`, erro de console e
  falha de request.

### Regressão funcional e visual

- Focados verdes: gameplay 35/35, grama 9/9, veículos/superfícies 24/24,
  esqueletos 15/15, baús 5/5, PvE BR 4/4, bot visual 8/8 e personagem 2/2.
- O cliente oficial de web game completou seis iterações e gerou seis estados/
  screenshots sem `console.error` ou `pageerror`.
- Rota Playwright no solo: entrada no buggy pela tecla real `E`, 8,84 m em 2 s
  e 35,5 km/h; saída e caminhada de 4,63 m em 1,5 s. Zero erros do jogo e zero
  requests 4xx/5xx. A inspeção registrou CSM `autoMask=1`, uma distante
  agendada (`mask=4`) e zero vértices fora do bound na pose extrema.
- Screenshots inspecionados manualmente em
  `output/playwright/perf-route/.playwright-cli/`: grama contínua, clearing
  intencional do acampamento, carro e trilha sem salto, baú íntegro, sombras
  próximas/distantes e esqueleto/cimitarra completos. O browser CLI headless
  roda o rAF a ~1 Hz; por isso seu FPS não foi usado como benchmark. A nova
  telemetria expôs corretamente cobertura ≈0,049 num frame automatizado de
  ~1 014 ms, em vez de mascarar o slow-motion.
- Cobertura final: os 68 arquivos de teste passaram em três blocos seriais,
  equivalentes a 547 testes no estado final (o teste urbano adicionado depois
  do primeiro bloco passou focado). `gameplay` fechou 35/35 e `car-settle`
  6/6 após os últimos deltas.
- `car-terrain-traversal` reproduziu uma vez o flake histórico do
  caso-controle (“nenhum contato rígido”), enquanto toda a travessia passou;
  em seguida o arquivo passou duas vezes consecutivas, 2/2 em cada processo.
- A execução monolítica pós-mudança foi encerrada por SIGTERM externo da célula
  após ~10 min, não pelo runner do repositório. Por isso não há alegação de
  `npm test` monolítico verde; a cobertura explícita dos 68 arquivos acima é a
  evidência final. O Chrome de QA deixado por esse corte foi identificado pelo
  perfil/PID e removido antes dos benchmarks válidos.
- Checagens finais: `npm run lint` e `git diff --check` com exit 0;
  `npm run analyze:lines` registrou 187.608 linhas JS e 415.339 no repositório.

## Sessão 2026-07-25 (parte 2) — travamento ≠ lentidão

### Pedido

Jogadores reclamam de travamento e lentidão em produção. O console que o
usuário capturou não explicava nada. Otimizar sem criar bug novo nem perder
qualidade.

### Triagem do console (7 de 8 mensagens não eram do jogo)

- `MaxListenersExceededWarning` (×2) e `ObjectMultiplex - orphaned data`
  (×4) vêm de `contentscript.js` — extensão do navegador (MetaMask), não do
  jogo. O "memory leak detected" é do EventEmitter da extensão.
- `GLTFLoader: Unknown extension "KHR_materials_pbrSpecularGlossiness"` (×2)
  é real e vem de dois assets carregados em runtime:
  `Armas/low-poly_Shotgun_rápida_fraca.glb` e
  `Cenários/low_poly__tree_assets.glb` (`Armas/ak-47_reddot.glb` também tem,
  mas não é carregado). Efeito é só visual — material cai no padrão. Custo de
  perf zero. Correção pendente: reexportar em metallic-roughness.

### Dois problemas distintos, separados pela primeira vez

- **Lentidão constante** = custo de fragment: pixel ratio, bloom, SMAA, grama.
- **Travamento (hitch)** = linkagem de programa WebGL no meio do frame. Já
  havia precedente disso no repo: o comentário em `br-game.js` sobre compilar
  o baú na cabine da nave descreve exatamente este bug, resolvido só pros baús.

A rodada anterior mediu em SwiftShader, cujo gargalo é oposto ao de GPU real —
por isso os ganhos dela (grama 2,3×, física, draw calls) não atacaram o que
trava a máquina do jogador.

### BUG encontrado: o seletor "Resolução" quase não fazia nada

`EffectComposer` congela `_pixelRatio` na construção e só o atualiza via
`setPixelRatio()`. O handler chamava apenas `renderer.setPixelRatio()`, então
os render targets do pós continuavam na razão do boot. Quem baixava pra
"Desempenho" fugindo do travamento seguia sombreando a mesma quantidade de
pixels. Consertado em `applyPixelRatio()` (renderer + composer juntos), com
teste vivo que compara `composer.renderTarget1.width` entre "Desempenho" e
"Qualidade" (prova física, não o campo interno).

### Implementação TDD

- `js/prewarm.js` (novo): linka programas e sobe texturas em janela segura.
  `warm/schedule/flush/invalidate/stats`. Nunca propaga erro (headless e
  contexto perdido são casos normais). Pula material já aquecido.
  Chamado no fim do boot, a 1 Hz no menu/lobby/pausa (`prewarmIfIdle`) e em
  `beginMatch` — a chamada síncrona do baú foi PRESERVADA, a nova é aditiva.
- `js/adaptivequality.js` (novo): controlador puro de escala de resolução.
  Sem three, sem DOM, 17 testes de unidade. Duas travas de qualidade:
  1. Nunca passa do teto do jogador.
  2. Só desce quando o p90 de `frame - simMs` acusa a GPU. Se o gargalo é
     CPU, baixar pixel deixaria feio sem acelerar nada — e não desce.
- Detecção de vsync: num monitor de 60 Hz nenhum frame desce de ~16,7 ms, bem
  acima de `upMs`. Sem enxergar isso, um pico isolado derrubaria a resolução e
  ela NUNCA mais voltaria — otimização virando perda permanente de qualidade.
  O sinal de folga é o frame colado no período do monitor (p10) com jitter
  < 2 ms; quem só atinge o vsync na média tem jitter alto e não sobe.
- Anti-oscilação: subir exige N janelas boas seguidas (começa em 2) e N dobra
  (até 16) toda vez que uma subida é seguida de descida.
- `SETTINGS.autores` (novo, padrão ligado) + seletor "Resolução adaptativa".
  `res` virou explicitamente o TETO. Escolha manual do jogador vale no frame
  (reset do controlador), não daqui a alguns degraus.
- `perf` publica `simMs`, `renderScale` e `renderScaleChanges`.
- Passo forçado (`tick(dt)` do QA) NÃO reescala: determinismo dos testes
  preservado, com asserção viva e estrutural.

### Medições

- `scripts/prewarm-probe.js` (novo): conta programas WebGL linkados DURANTE o
  render numa varredura de 8 poses pelo mapa. Cada um seria uma travada.
  Resultado: 461-465 materiais colapsam em ~60 programas distintos; o prewarm
  linka todos em 86-98 ms na janela segura. Varredura pós-warm linkou 0, 10 e
  0 programas em três corridas.
- A variação 0/10/0 é corrida com GLB ainda carregando, NÃO lacuna de sombra —
  o probe reporta o nome do programa novo e veio vazio nas corridas limpas. É
  exatamente o caso que `prewarmIfIdle` a 1 Hz no lobby cobre.
- Limite honesto e documentado no módulo: `renderer.compile` não prepara os
  materiais de profundidade do shadow map. Objeto que entra na cena depois
  ainda pode linkar o programa de sombra no primeiro frame em que projeta.
- Custo conhecido da escala adaptativa: cada mudança realoca os render targets
  do composer + bloom + SMAA. Por isso degrau de 0,25 e cooldown de 2,5 s —
  no pior caso 3 realocações em ~7,5 s e depois estabiliza.

### Endurecimento antes do deploy (3 falhas achadas relendo o código)

Cada uma nasceu de teste RED próprio, não de suposição:

1. **Rejeição não tratada.** O loop chama `prewarm.flush()` SEM await. Um
   `traverse` que explode (GLB meio carregado, nó já descartado) virava
   `unhandledrejection` no console do jogador — por causa de uma otimização.
   `collectNew` agora conta o erro em vez de propagar; os dois pontos de
   chamada (`game.js` e `br-game.js`) também têm `.catch()`.
2. **Escala NaN.** `SETTINGS.res` vem de localStorage: corrompido, `+"lixo"`
   é NaN, e `setPixelRatio(NaN)` zera o canvas (tela preta). O bug já existia
   no código original; a mudança só o levaria também pro composer. Sanitizado
   no controlador (`sane()`) e em `pixelRatioCeiling()`.
3. **Realocação dupla no resize.** `setCeiling` antes de `composer.setSize`
   realocava os render targets duas vezes por resize. Reordenado.

Descartado de propósito: `try/catch` especulativo no `applyPixelRatio`.
Engolir a falha faria `resScaler.scale` divergir do pixel ratio real e o
controlador desceria em cascata sem efeito — pior que o erro visível. O loop
já sobrevive porque `animate()` reagenda o rAF antes do `tick()`.

### Segurança

- `git diff --name-only` não toca `server.js` nem nenhum arquivo de protocolo.
  Zero mudança de superfície de anti-cheat.
- Módulos novos não têm `fetch`, `socket`, `eval`, `innerHTML`, `localStorage`
  nem `postMessage` — verificado por grep.
- `window.__game.prewarm` e `.renderQuality` são hooks de cliente, ao lado dos
  que já existiam (`forceStart`, `teleportToCar`, `player`). Não concedem
  autoridade de servidor: resolução é decisão local, o servidor valida dano,
  alcance e crédito de kill igual antes.
- Resolução menor não revela nada oculto — culling, LOD e frustum inalterados.
- `deploy.env` e `.env` conferidos por `git check-ignore -v`: os dois ignorados.

### Verificação

- `npm run lint` exit 0.
- Novos: `adaptive-quality` 19/19, `prewarm` 15/15, `render-quality` 10/10
  (porta 3281).
- Regressão focada verde: `gameplay`, `game-modules`, `br-crates`,
  `grass-decor`, `deployment-context`, `br-late-join-flags`, `plan`.

### Pendente (Tier 0 e Tier 2 do plano)

- Tier 0: overlay de perf + telemetria anônima de fim de partida (string da
  GPU, p50/p1% de frame, settings, contagem de hitches). Sem isso a otimização
  segue sendo feita no escuro — nenhuma medição local representa o parque de
  máquinas real.
- Tier 2: SMAA sem botão de desligar (3 passes fullscreen sempre ligados),
  bloom em meia resolução no tier baixo, densidade de grama por tier
  (170k lâminas fixas hoje), sombra 512/3 cascatas no tier baixo.
- Auto-tier no primeiro boot pela string da GPU (`WEBGL_debug_renderer_info`).

### Tier 2 — avaliado item a item, com medição antes de implementar

**Correções no diagnóstico anterior** (eu estava errado nos dois):
- Bloom JÁ é meia-resolução internamente (`resx = width / 2` no UnrealBloomPass).
- A grama NÃO entra no shadow map (sem `castShadow`, sem `csmMat`), então não é
  multiplicada por cascata.

**Item 1 — botão de antisserrilhado (FEITO).** SMAA são três passes em resolução
CHEIA (`_materialEdges`, `_materialWeights`, `_materialBlend`), o único efeito do
pós sem botão. A 1920×1080 com `res: 1.5` (buffer 2880×1620 = 4,67 Mpx) isso é
14,0 Mpx/frame — 3× o passe da cena inteira. `SETTINGS.aa`, padrão ligado.
Teste vivo prova que desligar não muda draw calls nem triângulos da cena: é só
pós, não abre vantagem competitiva.

**Item 2 — LOD de lâmina de grama (FEITO).** `bladeGeometry(segmentos)`: chunks
além do anel `GRASS_LOD_RING` usam 2 segmentos de altura em vez de 4. Medido:
**1.358.760 → 1.005.000 triângulos (−26,0%)**, 88 de 169 chunks reduzidos,
**169.845 lâminas mantidas**. `aplicarLod` troca só position/normal/uv/index
(compartilhados); matriz de instância, fase, tint, trilha e bounding sphere
ficam intactos — os 9 testes antigos de grama, incluindo igualdade byte a byte,
continuam verdes. `atualizarLods()` roda DEPOIS do refill: antes usaria
`ch.cx/ch.cz` velho e o chunk reciclado ficaria com o detalhe do lugar anterior.

**Item 3 — sombra 1024→512: MEDIDO E RECUSADO.** Cena sem sombra: 352 calls /
692.593 tri. Com 1 cascata (regime normal): 365 calls (+4%) / +74 mil tri. Com
as 4 (refresh cheio, só em teleporte/giro brusco/salto solar): 552 calls (+57%).
O rodízio de cascatas da sessão anterior já tirou o custo; baixar resolução
atacaria fragment de um passe depth-only barato. Risco sem ganho.

**Erro de ferramenta corrigido no meio:** o primeiro probe de sombra acusou
"+0 calls". Causa: `WebGLRenderer.render()` faz `info.reset()` (linha 17696) e o
`autoReset` interno zerava a contagem. Com `R.info.autoReset = false` os números
acima apareceram. Probe que mente é pior que probe nenhum.

### Regra de anti-trapaça agora tem teste

Configuração que reduz densidade, altura ou alcance da grama é **wallhack**:
adversário deitado no mato fica visível pra quem baixa a opção. Vale igual pra
distância de visão e névoa. Dois testes travam isso:

- `render-quality`: varre o bloco `<div id="settings">` do index.html e as chaves
  de `SETTINGS` procurando `grama|grass|view dist|fog|densidade` — falha se
  alguém expuser esses vetores no menu no futuro.
- `grass-decor`: prova que o LOD nunca muda a contagem de lâminas de nenhum
  chunk e que a lâmina reduzida mantém base, ponta e altura (silhueta e
  ocultamento idênticos).

`GRASS_LOD_RING` mora em `CFG` (constante de código), NUNCA em `SETTINGS` — o
jogador não pode mexer.

Ressalva registrada: o botão "Sombras: Desligadas" já existia e é um vetor menor
(sombra pode denunciar alguém atrás de quina). Não é mudança desta rodada e
remover quebraria a opção de perf de quem precisa.

## Sessão 2026-07-26 — sol vazando no horizonte

### Sintoma e reprodução

Reclamação: "o sol está vazando no horizonte, ficando com um blur, tudo
branco". Reproduzido em captura (`output/sol/`): olhando na direção do sol
com `tod = 0.72`, um borrão branco cobre ~40% da tela e engole o horizonte.

Isolamento por A/B na mesma pose: com bloom = borrão; **sem bloom = horizonte
limpo e legível**. O culpado é o bloom pegando o céu, não o céu em si.

**Pré-existente, não regressão.** A mesma captura em `ccfca46` (antes de todo
o trabalho desta rodada) mostra o mesmo borrão.

### Causa

A compressão soft-Reinhard do céu era `texColor / (1 + 0,55 * texColor)`, que
satura em 1/0,55 = 1,82. O limiar do bloom é 1,0, então TODA radiância bruta
de céu acima de 2,22 florescia.

No golden hour o `mieCoefficient` sobe de 0,0008 para 0,0078 (~10×) e o
`rayleigh` de 1,15 para 3,75. O halo de Mie vira uma área enorme acima de
2,22 — o horizonte inteiro passa do limiar. Fora do golden hour o sol é um
ponto pequeno e correto (verificado em `tod = 0.30`, sol a 18°).

### Correção

O fator de compressão virou uniform (`uGlare`) e acompanha o PRÓPRIO halo:

    haloK = clamp((mie - MIE_BASE) / MIE_HALO_SPAN, 0, 1)
    uGlare = lerp(GLARE_BASE 0,55, GLARE_MAX 0,85, haloK)

Com 0,85 o céu satura em 1,18 e só floresce acima de radiância bruta 6,67 —
antes 2,22. Barra 3× mais alta.

Propriedade de segurança: no mie base o valor é EXATAMENTE 0,55, então o dia
normal não muda um pixel. Medido no ciclo: `glare` = 0,55 em tod 0,30 / 0,50 /
0,76 e só 0,85 no pico de 0,72. Chuva também aperta (o clima sobe o mie).

Valor escolhido por varredura visual (0,55 / 0,75 / 0,85 / 0,95 / 1,10 em
`output/sol-fix/`), não por chute. 0,95 chega perto demais de matar o brilho
do sol (teto 1,05 contra limiar 1,0); 1,10 mataria por completo.

Teste `test/sky-glare.test.js` (porta 3295, 6 casos): uniform declarado E
usado no shader, sem o literal 0.55 sobrando, dia normal idêntico ao antigo,
golden hour no teto, faixa que floresce encolhe ≥2×, chuva aperta.

### Não foi mexido, de propósito

Subir `BLOOM_THRESHOLD` resolveria o horizonte, mas afeta TODA fonte de bloom —
janelas da cidade à noite (`emissiveIntensity` 1,6), tracer, explosão, flash de
tiro. A correção no céu é cirúrgica: só o céu muda, e só quando o halo cresce.

## Sessão 2026-08-07 — onda de integração das 6 streams + auditoria de QA

Duas coisas ficaram sem registro aqui e entram juntas: a onda que mesclou as 6
streams em `wave1/integration` (perf, menu, level design, áudio, game feel,
conteúdo) só existia em mensagem de commit, e a auditoria de QA que rodou em
cima dela.

O relatório completo — bug a bug, com causa raiz, correção, teste e o que ficou
aberto — está em `docs/2026-08-07-auditoria-qa.md`. Aqui fica só o que muda o
entendimento do sistema.

### O que a onda trouxe (resumo, para quem lê só o progress)

Menu cinematográfico com passeio de câmera (`js/menuscene.js`) e portão de
prewarm; som posicional com pool de vozes e oclusão (`js/sfx3d.js`); núcleo puro
de game feel com portão de predição de acerto (`js/hitfeel-core.js`); overlay de
perf e auto-tier de GPU (`js/perfhud.js`, `js/gputier.js`); SAP broadphase
(`js/sapbroadphase.js`); 6 torres de vigia subíveis (`js/watchtower.js`); térreo
oco navegável em 4 dos 12 prédios (`js/cityinterior.js`); 3 segredos que
destrancam as armas órfãs no solo (`js/secrets.js`); teto radial de 430 m para
os POIs.

### O que a auditoria mudou no entendimento

**O menu não devolvia o FOV.** `startGame()` sempre devolveu o relógio e a
agenda de clima que o passeio travava, e a partir de agora devolve o FOV também.
O passeio escreve `camera.fov` direto, mas o dono do FOV em jogo é `fovCur`, e
`applyFpsCamera` só reescreve a câmera quando o alvo se AFASTA dele — no spawn a
diferença é zero. Toda partida começava a ~48°.

**Térreo oco é SALA, e sala tem pé-direito próprio.** O pé-direito do lote oco
deixou de ser o mesmo do caminho maciço. O volume acima é um AABB que cobre todo
o footprint, e `collide` empurra para a face mais próxima quem estiver dentro
dele em XZ — pular no térreo teleportava o jogador para fora do prédio. A conta
que importa é `cobertura + jogador + ápice do pulo`, não a proporção da fachada.
`GF_H_SOLID` e `GF_H_HOLLOW` em `js/cityinterior.js` separam os dois casos.

**Dica de roda de carro remoto é derivada da POSE DE REDE.** Era derivada da
posição interpolada, e interpolação de recuperação é translação no sentido do
alvo, não do nariz do carro — virava marcha à ré no teto do clamp. Não adianta
gatear pelo tamanho do buraco: em regime permanente o lerp fica atrasado
exatamente `velocidade/12`, então buraco e velocidade são a mesma grandeza.

**Visual urbano nascido depois do worldgen precisa se registrar.**
`Structures.city.registerVisual(obj)` existe agora por causa do cofre dos
segredos, que tinha colisor urbano e visual solto na cena: sumia a colisão e
ficava a caixa de aço de pé nos escombros. É a mesma família do bug já
registrado ("visual da laje vaza pro mesh global") — a porta de entrada mora no
módulo da cidade justamente para não se repetir em cada módulo novo.

**Regra de sala que mexe em processo tem que respeitar o congelamento.** Todas
as flags são congeladas em `match.plan.flags` no início da partida; a de bots
passava por fora e `syncBots()` derruba o processo filho. Trocar o número de
bots no meio da partida encerrava a partida.
