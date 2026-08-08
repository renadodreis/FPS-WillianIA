# Auditoria QA / Produto / Engenharia — 2026-08-07

Rodada completa sobre a branch `refatoracao` @ `4cb1026` (a onda de integração
das 6 streams: perf, menu, level design, áudio, game feel, conteúdo).

Método por bug: **REPRODUÇÃO → CAUSA RAIZ → CORREÇÃO → TESTE → REGRESSÃO →
VALIDAÇÃO**. Todo bug corrigido tem teste que falha ANTES e passa DEPOIS,
provado com A/B (`git stash` do fonte, teste rodando nos dois lados).

---

## Partida completa (cliente real)

Driver de QA dirigindo o Chrome headless como ANFITRIÃO, com 8 bots entrando
pela regra da sala, em tempo real (rAF do jogo, sem tick manual). Fluxo coberto
de ponta a ponta e observado funcionando:

```
lobby → código do anfitrião → regras da sala → COMEÇAR PARTIDA → contagem
      → SHIP → pulo → FALL (paraquedas) → PLAY (pousou) → combate → morte
      → SPECT → matchEnd → placar → nextMatch → reload → lobby da 2ª partida
```

Placar observado na tela ao fim da partida:
`🏆 FIM DE PARTIDA · PARTIDA #1 · vencedor: Trovao · 3 kills · #1..#9`,
8 mortes registradas, destruição da cidade percorrendo `intact → cinematic →
destroyed`.

A **segunda partida** só passou a fechar o ciclo depois da correção da queda
(P1 abaixo). Antes dela, em duas rodadas seguidas e sem contenção de CPU, o
jogador nunca pousava. Com 8 bots nos dois lados da medição:

| | FALL → PLAY | 2ª partida |
|---|---|---|
| antes | nunca pousou (>120 s) | abortava na queda |
| depois | 57 s | completa: ~3 min de jogo, matchEnd, placar, 10 mortes |

---

## Bugs corrigidos

### P1 — FOV do passeio do menu vazava para a partida inteira
`js/menuscene.js` escreve `camera.fov` direto, mas o dono do FOV em jogo é
`fovCur` (`game.js`), e `applyFpsCamera` só reescreve a câmera quando o alvo se
AFASTA de `fovCur`. No spawn os dois valem 75, a diferença é zero e a atribuição
nunca acontecia: **toda partida começava a ~48° (visão de túnel)** e só corrigia
no primeiro ADS/sprint, com o FOV saltando num frame.
`startGame()` já devolvia relógio (`Env.tod`) e clima que o menu travava —
passa a devolver o FOV também (com `csmDirty`, porque as cascatas de sombra são
dimensionadas pelo frustum). Teste: `test/gameplay.test.js` (o primeiro do
arquivo de propósito — qualquer cenário de mira rodando antes mascara a falha).

### P1 — Paraquedas em câmera lenta: máquina fraca era eliminada NO AR
O laço do BR calcula `dt = Math.min((nowMs - lastT)/1000, 0.1)` e alimentava a
queda com ele. O cap de 100 ms está certo para o resto do laço (um engasgo não
pode teleportar a simulação), mas a descida é cinemática pura e **precisa durar
o mesmo tanto que dura no relógio do SERVIDOR**, que é quem abre o gás e arma o
backstop da zona. A ~1,5 fps a queda roda a ~15% do tempo real: medido numa
partida de QA, **112 s de FALL para uma descida de ~17 s**. O jogador ainda está
de paraquedas quando o gás abre e é eliminado no ar — no log do servidor sai
`[ZONA] servidor eliminou X (gás=true voando=true)`.

O watchdog de 500 ms não cobria: ele só age com o rAF **morto** (`starved`,
>1,5 s sem quadro — aba oculta), não com o rAF vivo e lento. A queda passa a
andar por `dtQueda = min(bruto, 0.5)`, com teto de 0,5 s porque acima disso o
watchdog assume. É a mesma fragilidade que a onda de integração agravou ao
somar custo de render (menu, interiores, torres, segredos, POIs, áudio 3D).

### P3 — Tiro recusado pelo portão de predição ficava invisível e mudo
`flushHits` fazia `if (!verdict.ok) continue;`. Sem `shotHit` o servidor não
replica `playerFired` — e é dele que sai o muzzle/tracer dos outros. Como o
`game.js` já tinha marcado o disparo como "acertou" (`remoteHit = true`), ele
também não mandava o `shotFired` de erro. Resultado: atirar em quem está de
paraquedas (imune) ou no limite do alcance **apagava o próprio disparo** da tela
e do ouvido de todo mundo; a vítima levava rajada sem nenhuma pista audiovisual.
O caminho recusado passa a replicar o disparo como o que ele de fato é: um tiro
que não entrou.

### P4 — Estouro de foguete remoto caía na partida seguinte
`scheduleRemoteBlast` agenda o estouro por até 6 s e só checava
`window.__BR_active`, que continua `true` entre partidas. Clarão, estrondo e
screenshake caíam na câmera lenta da vitória, na tabela de resultado ou já no
lobby seguinte, nas coordenadas da partida velha. Agora exige a mesma partida e
fase de jogo/espectador.

### P1 — Térreo oco da cidade ejetava o jogador pela fachada
O pé-direito do térreo oco era o mesmo do caminho maciço (`min(3.4, h·0.33)`),
mas o volume maciço acima é registrado como AABB cobrindo **todo** o footprint.
Quem encosta a cabeça nele fica dentro dele em XZ e cai no ramo "dentro da
parede" de `Structures.collide`, que empurra para a face mais próxima — a de
fora. Jogador (1,7) + ápice do pulo (1,604) = 3,304 m deixavam 9,6 cm de folga,
e o terreno dentro da sala varia até 0,76 m; do balcão (1,1 m) a folga é
negativa. **Medido: ejeção de 4,75–5,11 m nos 4 lotes, pulando do balcão.**
`js/cityinterior.js` passa a ter pé-direito próprio para lote oco
(`GF_H_HOLLOW = 4.6` contra `GF_H_SOLID = 3.4`), que é sala e precisa caber
cobertura + jogador + pulo. O telhado não se move e **nenhuma chamada de
`Math.random` é criada ou reordenada** — a ordem de consumo seedada do worldgen
fica intacta (invariante do CLAUDE.md). Depois da correção: 0 m de ejeção.

### P1 — Reconexão no lobby deixava a sala sem anfitrião
O caminho de "adotar o `init` em vez de recarregar" reapresenta o `hello` mas
não re-reivindica o posto; o servidor libera `hostId` no disconnect do socket
antigo, e quem re-reivindica pelo código salvo é o **boot**, que não roda de
novo nesse caminho. Resultado: botão vira "SEM ANFITRIÃO — use o código abaixo"
para todos e ninguém consegue iniciar partida. `savedHostCode()` extraída e
usada pelos dois caminhos. Teste novo: `test/lobby-reconnect-host.test.js`.

### P2 — Mísseis davam a MESMA colocação para todas as vítimas
O laço de mortes por míssil lia `match.aliveCount` sem descontar as mortes que
ele mesmo causava: com 5 vivos e 3 vítimas o placar saía `#5 #5 #5 #2 #1`. Não
dá para chamar `checkVictory()` por vítima como faz o laço da zona — as mortes
são **simultâneas** e encerrar no meio do laço coroaria alguém que também está
no raio. As vítimas passam a ser coletadas primeiro e a ocupar a faixa de baixo
em bloco (`[3,4,5]`), preservando a simultaneidade.

### P2 — Trocar "bots na sala" no meio da partida encerrava a partida
`syncBots()` mata o processo filho dos bots; cada disconnect roda
`checkVictory()`. Com os bots sendo a oposição restante, a partida **encerrava
na hora com vencedor arbitrário**, e os bots novos reconectavam durante o
`PLAYING` virando espectadores parados. Todas as outras regras já são
congeladas em `match.plan.flags` no início da partida; esta passava por fora.
Agora `syncBots()` só roda em `LOBBY`; fora dele a troca fica em
`match.botsPending` e é aplicada quando a sala volta ao lobby.

### P3 — Rodas de carro remoto giravam de ré na velocidade máxima
A dica visual das rodas era derivada do passo POR QUADRO da posição
**interpolada**. Essa interpolação é translação pura no sentido do ALVO, não do
nariz do carro: em qualquer buraco de rede (perda de pacote, re-ancoragem do
anti-cheat, entrar num carro longe do avatar) ela virava velocidade reversa no
teto do clamp. O portão antigo (`passo < 8 m`) não pegava, porque o passo é
`k·buraco` com `k ≈ 0,18` — só reagia a buracos acima de ~44 m.

Gatear pelo tamanho do buraco **não** resolve: em regime permanente o lerp fica
atrasado exatamente `velocidade/12`, então buraco e velocidade são a mesma
grandeza escalada e o portão recusaria direção legítima rápida junto. A dica
passa a ser medida na **pose de rede** (`targetPos`/`targetYaw`), que é a que o
servidor validou: enquanto ela não muda não houve deslocamento nenhum, só o
avatar alcançando. Como bônus a conta deixa de depender do dt do quadro.

*Segunda camada, no teste:* o heartbeat do bot-host adicionado ao harness em
`4cb1026` publica o bot no spawn ANTES de o teste dirigir, então o primeiro
quadro medido virou um teleporte de 390 m — o teste passou a medir convergência
em vez de direção. Essa é a causa da regressão de `car-remote-wheels` na suíte.
O teste passa a assentar o remoto no carro antes de medir (o que um jogador de
verdade faz: anda até o carro).

### P3 — Cofre dos segredos sobrevivia à destruição da cidade
O cofre é urbano em tudo (colisor `city: true` + corpo CANNON registrados), mas
o **visual** morava no grupo `secrets`, solto na cena e fora de `cityVisual`.
Depois dos mísseis sobrava uma caixa de aço com cadeado pulsando de pé no meio
dos escombros: atravessável e ainda aceitando tiro. Mesma família do bug já
registrado ("visual da laje vaza pro mesh global"). Criada a porta de entrada
`Structures.city.registerVisual(obj)` para visual urbano nascido depois do
worldgen; o alvo do cadeado passa a refletir a visibilidade do grupo.

### P4 — Nota silenciosa do xilofone contava para a melodia
`xyl.last` era escrito FORA do portão `player.onGround` que toca a nota, e é ele
que o rastreador da melodia lê (`lastPlate`). Passar por cima de uma placa no ar
não tocava nota nenhuma e mesmo assim registrava — o progresso do segredo zerava
por algo que o jogador nunca ouviu. Agora o que se OUVE é o que o quebra-cabeça
CONTA.

---

## Documentação corrigida nesta rodada

- `QA-REPORT.md` #20: reconexão **não** recarrega mais sempre — no lobby, com a
  mesma seed, o cliente adota o `init` novo (`multiplayer-client.js`).
- `QA-REPORT.md` #40: os esqueletos **não** estão mais congelados no BR
  (`game.js:2536` atualiza durante a fase `PLAY`).
- `docs/2026-07-18-backlog.md`: `br-rank.json` está VERSIONADO no repo (com
  nicks e pontuação reais) e não está no `.gitignore` — o texto afirmava o
  contrário.
- `docs/2026-07-24-entretenimento-mapa.md` itens 5 e "armas órfãs": fechados por
  `js/sfx3d.js` (som posicional) e pelos 3 segredos (armas 5-7 no solo).

---

## Aberto — não corrigido nesta rodada (com justificativa)

- **Melodia `[2,0,4,1,6]` não é tocável andando em linha reta.** A fileira de
  placas é contígua: ir de 2 a 0 obriga a pisar na 1. Ela É solucionável hoje
  saindo da fileira em z e voltando (`song.prevPlate` é atualizado todo frame,
  inclusive com `-1`), mas nada na tábua comunica isso. É lacuna de comunicação
  de level design, não defeito de código — mudar a melodia ou o formato da
  fileira é decisão de produto.
- **Balcão do térreo oco pode ficar inalcançável.** Toda a mobília da sala é
  ancorada em `gy` (altura do CENTRO da cidade), mas o piso é o terreno, que
  varia até 0,76 m dentro do footprint. Onde o terreno está bem abaixo de `gy`,
  o balcão flutua e o pulo não alcança (medido num dos 4 lotes na seed 424242).
  Corrigir bem exige ancorar a mobília no terreno local ou achatar o footprint —
  os dois mexem em geometria/placement e pedem rodada própria.
- **Reconexão no meio da partida elimina o jogador.** Uma queda de transporte
  durante o `PLAYING` recarrega a página; o disconnect do socket antigo roda
  `checkVictory()` e o jogador volta como espectador. É o desenho documentado
  ("em partida o mundo já divergiu"), mas na prática um soluço de rede custa a
  partida. Resolver é implementar reentrada em partida — feature, não correção.
- **Com `gás: desligada` a partida pode não terminar.** Não existe fim por
  relógio; sem zona, só o backstop de inatividade e o de "nunca pousou"
  eliminam. Uma sala de jogadores escondidos e ativos não acaba.
- **Teclas de arma não batem com o que é anunciado.** `index.html` anuncia
  "1–5", o lobby anuncia "1-6", e o binding real é Digit1–3 em `game.js` (os
  dois modos) mais Digit4–8 só no BR (`br-game.js`). O arsenal tem 8 armas.

---

## Falhas intermitentes (não são regressões)

Verificadas pelo protocolo do CLAUDE.md (re-rodar isolado com máquina ociosa):

- `br-late-join-flags.test.js` — 3 passes isoladas consecutivas. A triagem da
  suíte tinha rodado sob carga de 3 agentes de revisão.
- `char-lobby.test.js` — classificado FLAKE pela própria triagem do runner.
- `collision.test.js` — timeout de boot de 90 s; 2 passes isoladas consecutivas.
- `city-destruction-client.test.js` → "cinemática solo nunca ligou" —
  **pré-existente**: com TODAS as mudanças desta rodada no stash, o código
  original falha 2 de 3 rodadas. É a 4ª instância de Chrome do mesmo processo,
  com janela de 8 s. Um repro isolado com uma única instância passa sempre.
