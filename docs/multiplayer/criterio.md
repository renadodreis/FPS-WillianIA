# Critério — o MULTIPLAYER funcional (Battle Royale online)

Data: 2026-10-16 · árvore lida: `338d153` (produto idêntico ao `d2d6433`, no ar)
Autor: o **auditor independente** do multiplayer. Não escreve código de produto
nem teste do repo. Escreve o que reprova.

> Pedido do dono (2026-10-16): *"preciso que dê uma atenção no modo multiplayer
> também, para que ele esteja funcional"*. Ele joga no **celular** (Galaxy S22,
> paisagem ~780×360 CSS) e às vezes no desktop. "Multiplayer" aqui é o caminho
> inteiro: menu → 🌐 MULTIJOGADOR → lobby → anfitrião inicia → contagem → nave →
> queda → combate → fim → lobby → a próxima partida.

> **Três mudanças feitas pelo autor durante a rodada 1, antes do laudo, com o
> motivo:** (1) **S5** — o alvo de toque era 48 px (Android); passou a 44 px
> para não abrir uma segunda régua de alvo contra o C2 já decidido em
> `docs/mobile/criterio-aaa.md`; (2) **P13 (b)** — acrescentada a velocidade
> desenhada quadro a quadro, com o piso de ruído medido na própria corrida
> (1,1 % da simulação local fora de ±50 %); (3) **S2** — o limiar dizia só
> "mensagem visível"; passou a repetir o que o *Mede* já pedia ("a tela diz por
> quê"), depois que a medida mostrou uma mensagem visível e falsa. Nenhum outro
> limiar mudou depois de medir.

---

## 0. Regras deste documento

Herdadas das réguas do celular e do VR (`docs/mobile/criterio-aaa.md`,
`docs/vr/criterio-aaa.md`), sem margem:

1. **Um critério FUNCIONAL reprovado reprova a entrega.** Não existe média.
   Critério de QUALIDADE reprovado não bloqueia "funcional", mas entra no placar.
2. **Teste verde não prova sala certa.** Todo critério diz **por que a suíte
   atual não pega**. A suíte de hoje inicia partida por um *bot-host* de socket
   (`startBRMatch`, que pula a nave de propósito), neutraliza o reload
   (`__MP_reload = () => {}`), tira o ouvinte de reconexão e sobe o servidor
   com `pingTimeout` de **10 min** (`server.js:159`, só com `QA_BOOT_TOKEN`).
   Nenhum teste põe dois navegadores na mesma sala pelo lobby.
3. **Todo critério traz o defeito a reinjetar** (mutante): se a sonda não fica
   vermelha com ele, com número, ela não mede nada.
4. **Âncora independente.** O que o servidor fez é o que o **espião** do
   processo lê (estado do `players`, motivo de cada `disconnect`), não o que o
   cliente diz; o que um jogador vê de outro é a posição **desenhada** do boneco
   remoto comparada com a que o outro cliente **simulou**, no mesmo relógio de
   parede (todos os processos na mesma máquina: o erro de relógio verdadeiro é 0).
5. **Medição sem condição declarada não é medida**: carga de 1 min, rede
   (proxy/DevTools), CPU emulada, viewport, regras da sala.
6. **Fonte em todo número.** `[LASTRO]` = a referência diz (citação literal,
   no idioma original); `[INFERÊNCIA]` = conta ou escolha do auditor, aceita
   contra-argumento **com medida**; `[DECISÃO DO DONO]` = produto — o auditor
   mede o efeito e escreve o número provisório.
7. **Quem constrói não edita a régua.** Argumenta no relatório.
8. **"Não medido" = não aprovado.** Item que só fecha com o aparelho ou com um
   humano entra como `◌ aguardando aparelho/humano`, fora do denominador.

### 0.1 Condições comuns a toda medição

- **Servidor real**: `node server.js` com `PORT=0` (porta lida do log
  "Servidor BR no ar em http://localhost:N"), `HOST_CODE` próprio, **sem**
  `QA_BOOT_TOKEN` — portanto com o `pingInterval` 25 s / `pingTimeout` 20 s de
  produção (padrões do socket.io 4.8.3). `NODE_ENV=production`. Nunca a
  produção (cada conexão vira um "Recruta" numa sala de jogadores reais).
- **Clientes reais**: um Chrome por jogador (`puppeteer-core`), entrando pelo
  **menu** (toque/clique em MULTIJOGADOR) e pelo **lobby** (o anfitrião digita o
  código e toca COMEÇAR). Pelo menos um em **modo celular** (`?mobile=1`,
  800×360, `hasTouch`, toque por `Input.dispatchTouchEvent`). O reload do
  `nextMatch` e a reconexão rodam como em produção (nada de `__MP_reload`).
- **Segundo plano real**: o puppeteer liga por padrão
  `--disable-background-timer-throttling`, `--disable-renderer-backgrounding` e
  `--disable-backgrounding-occluded-windows`; as sondas os **retiram**. "Oculto"
  = janela minimizada (`visibilityState = hidden`, rAF parado, timers
  estrangulados como no Chrome de verdade); "congelado" =
  `Page.setWebLifecycleState frozen`.
- **Rede**: proxy TCP por cliente (latência e jitter por sentido; *segurar* =
  a rede para de entregar e solta em rajada; *cortar* = troca de rede) e/ou
  `Network.emulateNetworkConditions` do DevTools (o DevTools 99+ estrangula
  WebSocket).
- **Espião do servidor** (`node -r espiao.js server.js`, fora do repo): só lê —
  `strikes`, `rejects`, `lastState`, `zoneHp`, chegada de cada `state`, motivo
  de cada desconexão. Nenhuma linha do `server.js` muda.

### 0.2 Formato

`ID · título` — **FUNCIONAL** (quebra o jogo) ou **QUALIDADE** (o jogo anda, mas
mal) · **Mede** · **Limiar** · **Fonte** · **Por que a suíte não pega** ·
**Mutante** (o defeito que a sonda tem de pegar).

---

## 1. S — Sala (entrada e lobby)

### S1 · Do link ao lobby, e todo mundo vê todo mundo — FUNCIONAL
- **Mede:** (a) do toque em MULTIJOGADOR até a lista NA SALA com o próprio nick;
  (b) a lista de nicks é a MESMA em todos os clientes; (c) nick e cor trocados no
  lobby chegam aos outros; (d) do link ao botão MULTIJOGADOR aceso, com a rede
  "Slow 4G" do DevTools e cache frio.
- **Limiar:** (a) ≤ 3 s; (b) idêntica em todos ≤ 1 s depois do último `hello`;
  (c) ≤ 1 s; (d) ≤ 60 s.
- **Fonte:** (a)–(c) `[INFERÊNCIA]` (o `hello` tem debounce de 250 ms,
  `multiplayer-client.js:484`; 1 s é 4 vezes isso). (d) o **próprio produto**
  chama de falha o módulo que não roda em 60 s (o vigia do `index.html`,
  CLAUDE.md "As bibliotecas do cliente saem do PRÓPRIO servidor"). Preset
  "Slow 4G": `1.6 * 1000 * 1000 / 8 * .9` down, `750 * 1000 / 8 * .9` up,
  `slow4GTargetLatency * 3.75` com alvo 150 [LASTRO: `devtools-frontend`,
  `NetworkManager.ts`].
- **Por que a suíte não pega:** `char-lobby` e `lobby-reconnect-host` usam UMA
  página; o roster de dois navegadores nunca é comparado.
- **Mutante:** `sendHello` sem o `setTimeout` final (o hello nunca sai) → (c)
  vermelho.

### S2 · Anfitrião pelo código — FUNCIONAL
- **Mede:** código certo → a coroa 👑 aparece para todos e o botão COMEÇAR
  acende só para ele; código errado → nunca promove e a tela diz por quê;
  5 erros em 30 s → esfriamento; o anfitrião que recarrega (`nextMatch`) volta
  anfitrião sem redigitar.
- **Limiar:** promoção ≤ 1 s; 0 promoções com código errado; mensagem visível
  que diz o motivo verdadeiro (o "por quê" do *Mede*); anfitrião restaurado
  depois do reload em 100 % das rodadas.
- **Fonte:** `[DECISÃO DO DONO]` "SÓ quem digitar o código vira host (nada de
  host aleatório)" (`server.js:268`). O esfriamento é **por IP**
  (`server.js:1197`): todos os aparelhos atrás do mesmo roteador dividem as 5
  tentativas — efeito medido no laudo, decisão do dono.
- **Por que a suíte não pega:** `server.test.js` cobre código certo/errado por
  socket; ninguém mede o efeito do esfriamento sobre OUTRO jogador da mesma
  casa, nem o anfitrião atravessando várias rodadas.
- **Mutante:** `claimHost` aceitando `ok` antes de checar o esfriamento.

### S3 · A sala sem anfitrião — [DECISÃO DO DONO]
- **Mede:** com ninguém de código na sala (o dono não entrou, ou saiu), o que os
  outros veem e podem fazer, e por quanto tempo.
- **Limiar provisório (auditor):** a sala não pode ficar parada **sem dizer
  como sair**: o texto tem de dizer que só quem tem o código inicia. Se o dono
  quiser que a sala ande sem ele, a referência é a do Steam:
  > "There always one lobby owner - if the current owner leaves, another user in
  > the lobby will become the owner automatically." [LASTRO: Steamworks,
  > ISteamMatchmaking]
- **Por que a suíte não pega:** `server.test.js` ("dado que o host caiu, então
  ninguém herda o posto") confere a regra, não o que o jogador vive.

### S4 · As regras da sala valem para todos e PERSISTEM — FUNCIONAL
- **Mede:** o anfitrião muda gás/tempo/bots/cidade/animais/alien; os outros
  veem a mudança; na rodada seguinte (depois do `nextMatch`) as regras são as
  que ele escolheu.
- **Limiar:** propagação ≤ 1 s; **na rodada seguinte, 100 % das regras iguais
  às escolhidas** (a menos que o anfitrião as mude).
- **Fonte:** `[INFERÊNCIA]` — regra que volta ao padrão sem ninguém mexer é
  regra que o jogo desobedece. O `server.js` já congela as regras no plano
  "no início da partida" (`server.js:498`) justamente para elas não mudarem por
  fora.
- **Por que a suíte não pega:** `br-flags-novas` e `br-late-join-flags` olham
  UMA partida; nenhum teste atravessa um `nextMatch` com só humanos na sala.
- **Mutante:** zerar `match.flags` dentro do `endTimer`.

### S5 · O lobby no celular mostra o essencial sem rolar — QUALIDADE
- **Mede:** a 800×360 (paisagem do dono), sem rolar: quem está na sala, o
  estado do anfitrião (AGUARDANDO / SEM ANFITRIÃO / COMEÇAR) e a contagem; e o
  tamanho de todo alvo de toque do lobby.
- **Limiar:** os três visíveis no primeiro quadro do lobby; alvos ≥ 44 × 44 px
  CSS (o mesmo C2 da régua do celular — não se abre uma segunda régua de alvo).
- **Fonte:** alvo: o C2 de `docs/mobile/criterio-aaa.md` ("Todo alvo de toque
  tem ≥ 44 × 44 px CSS") e "iOS, iPadOS | 44x44 pt" [LASTRO: Apple HIG,
  Accessibility]; o Android recomenda mais ("Consider making touch targets at
  least 48x48dp" [LASTRO: Google, Android Accessibility Help]) — fica registrado,
  sem virar limiar novo. Sem rolar: `[INFERÊNCIA]` — é a única informação que
  o lobby tem de dar a quem está esperando.
- **Por que a suíte não pega:** `menu-visual` mede o menu, não o lobby com
  gente dentro.
- **Mutante:** mover `#brLobbyList` para o fim do card.

### S6 · Teclado virtual sobre o nick e o código — ◌ aguardando aparelho
- **Mede:** com o teclado do sistema aberto em paisagem, o campo em edição
  (nick, código do anfitrião, chat) fica visível.
- **Fonte:** "As of Chrome 108, Chrome on Android will adjust its viewport resize
  behavior to no longer resize the Layout Viewport when the on-screen keyboard
  is shown." e "If you don't include interactive-widget in the viewport meta
  tag, Chrome will use the default behavior, which is resizes-visual."
  [LASTRO: developer.chrome.com, "Prepare for viewport resize behavior changes
  coming to Chrome on Android", 2022-10-28]. É o mesmo E13 da régua do celular.
- **Por que só aparelho:** a emulação não abre teclado.

---

## 2. P — Partida (do COMEÇAR ao fim)

### P1 · Ninguém vira fantasma — FUNCIONAL
- **Mede:** todo jogador que o servidor põe **vivo na nave** no `matchStart`
  está, no cliente dele, **na nave** — inclusive quem ainda carregava o mundo
  (primeira entrada ou recarga do `nextMatch`) quando o anfitrião tocou
  COMEÇAR, e quem conectou durante a contagem.
- **Limiar:** 0 jogadores vivos no servidor com o cliente fora da partida, 3 s
  depois do `matchStart`. Quem não ficou pronto a tempo vira espectador da
  rodada (e o anfitrião vê isso) ou a partida o espera — nunca vivo invisível.
- **Fonte:** `[INFERÊNCIA]` + referência de política: "Join in Progress — Spawn
  on Next Round, Spawn, Spectate, Pick a team number — Determines how a player
  joining mid-game will be treated." [LASTRO: Epic, UEFN Island Settings]. Um
  fantasma conta na colocação e no "vivos" de todos e decide quem vence.
- **Por que a suíte não pega:** o harness **espera de propósito** o br-game
  publicar o ouvinte antes de começar (`waitForBRClientReady`,
  `test/helpers/harness.js` — "caso contrário o evento se perde"): o caso é
  conhecido e contornado no teste, não no produto.
- **Mutante:** nenhum necessário — o defeito existe na árvore (laudo §P1).
  Controle negativo: anfitrião esperando o lobby do outro acender → 0 fantasmas.

### P2 · Contagem, relógio e nave iguais para todos — FUNCIONAL
- **Mede:** instante em que cada cliente vê a contagem e o `matchStart`; erro do
  relógio de partida de cada cliente (`S.now() − Date.now()`, mesma máquina);
  posição da nave desenhada × a do protocolo no mesmo instante; os outros
  jogadores na cabine.
- **Limiar:** contagem e `matchStart` ≤ 0,5 s entre o primeiro e o último
  cliente; erro de relógio ≤ 50 ms; nave ≤ 1 m; todos veem todos na cabine.
- **Fonte:** `[INFERÊNCIA]`; para a ordem de grandeza do que um jogador percebe:
  "skilled players were able to accurately identify small changes (~10ms) to
  peekers advantage. Differences of 20ms felt very impactful to these players."
  [LASTRO: Riot, "Peeking into VALORANT's Netcode", 2020].
- **Por que a suíte não pega:** `ship.test.js` usa uma página e um bot-socket.
- **Mutante:** `S.clockOffset` calculado sem o `halfRtt` com 300 ms de latência.

### P3 · Salto, paraquedas e pouso sem punição — FUNCIONAL
- **Mede:** pular pelo ⇧ (toque) e pelo ESPAÇO; pouso; o que o servidor aceita
  (`landed`) e quantos `strikes` do anti-teleporte isso custa a quem joga limpo.
- **Limiar:** 0 strikes do `matchStart` ao pouso; pouso aceito ≤ 1 s depois de
  o cliente pousar.
- **Fonte:** `[INFERÊNCIA]` — strike é marca de trapaça (`server.js:1361`);
  jogo honesto não pode acumulá-la.
- **Por que a suíte não pega:** `startBRMatch` põe a página no chão por
  teleporte e espera o servidor **aceitar** (`waitServerSawLanding`) — mede o
  harness, não o salto.
- **Mutante:** o `state` sair antes de `shipLocalPos` existir (é o que acontece
  hoje no primeiro tique; laudo §P3).

### P4 · Tiro entre humanos, nos três caminhos — FUNCIONAL
- **Mede:** hitscan (escopeta), projétil `projSpeed` (fuzil) e foguete
  (bazuca), atirando do desktop e do celular: o dano aceito chega na vítima; a
  morte credita a kill ao atirador; o killfeed sai igual nos três clientes.
- **Limiar:** dano na tela da vítima ≤ RTT + 150 ms do disparo (projétil: + o
  voo); kill creditada em 100 %; killfeed idêntico em todos.
- **Fonte:** `[INFERÊNCIA]` (150 ms = um quadro de envio de 100 ms + folga);
  o modelo client-authoritative com validação no servidor é decisão da base
  (CLAUDE.md, invariantes).
- **Por que a suíte não pega:** `server.test.js` emite `shotHit` cru por socket;
  os testes de mira (`br-mira-projetil`) acertam boneco local.
- **Mutante:** `queueHit` sem o `queueMicrotask(flushHits)` → (dano) vermelho.

### P5 · A morte é confirmada na hora — QUALIDADE
- **Mede:** do golpe letal até (a) o killfeed nos outros clientes, (b) o
  hitmarker/som de kill do atirador, (c) o boneco da vítima cair na tela dos
  outros.
- **Limiar:** ≤ 500 ms.
- **Fonte:** `[INFERÊNCIA]` — o próprio código chama o hitmarker de kill de "o
  ÚNICO hitmarker do jogo que não é predição: quem confirma a morte é o
  servidor, e ele acabou de confirmar" (`br-game.js:1984`); confirmação que
  chega segundos depois deixa o atirador descarregando num corpo.
- **Por que a suíte não pega:** `br-death-cause` espera o evento; não mede quando.
- **Mutante:** subir o `setTimeout(…, 3600)` do `game.js:3302` para 6000.

### P6 · Espectador — FUNCIONAL
- **Mede:** quem morre vê o recap e vira espectador assistindo um vivo; quem
  entra com a partida rodando vira espectador, vê a partida e entra na próxima.
- **Limiar:** espectador em ≤ 10 s da morte; quem entra no meio: espectador
  (servidor `spectator=true`) com os vivos na tela; na próxima rodada, jogador.
- **Fonte:** "When a player is eliminated and cannot respawn, some games allow
  the player to spectate (remain in the game to watch the gameplay)." [LASTRO:
  Epic, UEFN Island Settings].
- **Por que a suíte não pega:** `br-late-join-flags` usa socket para o "atrasado".
- **Mutante:** `beginMatch(true)` trocado por `LOBBY.show()` no `INIT.phase === 'PLAYING'`.

### P7 · Baús e loot de morte iguais para todos — FUNCIONAL
- **Mede:** baú aberto por um aparece aberto para os outros; ninguém abre o
  mesmo baú duas vezes; drop de morte aparece e some para todos.
- **Limiar:** ≤ 1 s; 0 duplicações.
- **Fonte:** `[INFERÊNCIA]`; o servidor já é dono do loot ("primeiro a abrir
  leva", `server.js:1640`).
- **Por que a suíte não pega:** `br-crates` e `br-drops` usam uma página.
- **Mutante:** `socket.broadcast.emit('chestOpened')` removido.

### P8 · O gás é o mesmo para todos — FUNCIONAL
- **Mede:** centro e raio da zona em dois clientes no mesmo instante de parede.
- **Limiar:** ≤ 1 m.
- **Fonte:** `[INFERÊNCIA]`; o servidor tem um backstop que mata pela zona dele
  (`server.js:727`) — cliente com outra zona morre "sem estar no gás".
- **Por que a suíte não pega:** `zone-modes` testa a função pura.
- **Mutante:** `S.now()` sem o `clockOffset`.

### P9 · Veículo: quem dirige é visto dirigindo — FUNCIONAL
- **Mede:** um jogador entra num carro e dirige; o outro cliente o vê **no
  carro** (pose desenhada × simulada); um segundo jogador não entra no carro
  ocupado.
- **Limiar:** atraso ≤ o de P13; 0 segundos motoristas.
- **Fonte:** `[INFERÊNCIA]`; posse arbitrada no servidor (`server.js:1244`).
- **Por que a suíte não pega:** `carro-solto` usa bot-socket como o "outro".
- **Mutante:** `rp.car` sempre −1 no `playerUpdate`.

### P10 · Chat ida e volta — FUNCIONAL
- **Mede:** celular escreve pelo 💬 (toque) e envia pelo 💬; desktop pelo Enter.
- **Limiar:** a mensagem aparece no outro ≤ 1 s.
- **Fonte:** `[INFERÊNCIA]`.
- **Por que a suíte não pega:** nenhum teste de chat entre dois navegadores.
- **Mutante:** `closeChat(true)` sem o `socket.emit('chat')`.

### P11 · O fim é o mesmo para todos — FUNCIONAL
- **Mede:** último vivo → `matchEnd` em todos; vencedor e ranking iguais;
  VITÓRIA só para o vencedor.
- **Limiar:** ≤ 1 s entre clientes; ranking idêntico.
- **Fonte:** `[INFERÊNCIA]`.
- **Por que a suíte não pega:** `server.test.js` lê o evento no socket.
- **Mutante:** `endMatch` chamado antes do `playerKilled` do último.

### P12 · Entrar na nave sem travar a tela — QUALIDADE
- **Mede:** maior intervalo entre quadros nos 5 s depois do `matchStart`
  (rAF, em cada cliente).
- **Limiar:** ≤ 250 ms.
- **Fonte:** `[INFERÊNCIA]` (o próprio `br-game.js:1719` já trata de
  "pré-aquecer" para não travar "justamente AO ENTRAR no mapa"). No aparelho,
  D1 da régua do celular.
- **Por que a suíte não pega:** o QA troca o `composer.render` por no-op.
- **Mutante:** remover o `renderer.compile` do baú no `beginMatch`.

### P13 · Os outros jogadores na tela: atraso e degrau — QUALIDADE
- **Mede:** (a) atraso (ms) e erro (m) da posição desenhada do boneco remoto em
  relação à que o dono dele simulou, a pé, correndo, no carro; sem e com
  latência; (b) a velocidade DESENHADA quadro a quadro com o outro correndo em
  linha reta, contra a velocidade que ele simulou.
- **Limiar:** (a) atraso ≤ max(100 ms, 2 ÷ taxa de envio) + latência de ida;
  com a taxa de 10 Hz do jogo (`br-game.js:2146`), **≤ 200 ms + latência de
  ida**. (b) a velocidade desenhada dentro de ±50 % da simulada em **≥ 95 %
  dos quadros**.
- **Fonte:** (a) "Source defaults to an interpolation period ('lerp') of
  100-milliseconds (cl_interp 0.1)" e "interpolation period = max( cl_interp,
  cl_interp_ratio / cl_updaterate )" [LASTRO: Valve Developer Community,
  "Source Multiplayer Networking"]. Para perda: "the interpolation buffer should
  have enough delay so that I can lose two packets in a row and still have
  something to interpolate towards" [LASTRO: Glenn Fiedler, "Snapshot
  Interpolation", 2014]. (b) a interpolação entre dois snapshots do Source
  desenha velocidade constante entre um pacote e o outro; o piso de ruído da
  medida é a própria simulação local, que tem **1,1 %** dos quadros fora de
  ±50 % (medido na mesma corrida, E1b) — `[INFERÊNCIA]` calibrada pela
  medida, declarado.
- **Por que a suíte não pega:** `postura-avatar` confere a postura do boneco,
  não o tempo nem a velocidade.
- **Mutante:** o `k = 1 − exp(−12·dt)` do `brTick` trocado por `−3·dt` (a);
  trocado por `1` (b: o boneco salta de pacote em pacote).

### P14 · Eventos do servidor iguais para todos: GOLEM e cidade — FUNCIONAL
- **Mede:** vida do GOLEM e a destruição da cidade (mecânica INTENCIONAL — não
  é bug; CLAUDE.md) chegam iguais a todos; quem está no raio morre com a causa
  `city` em todos os killfeeds.
- **Limiar:** ≤ 1 s entre clientes.
- **Fonte:** `[INFERÊNCIA]`.
- **Por que a suíte não pega:** `city-destruction-server` usa socket; o
  `bossHp` sai volátil (`server.js:1716`) e nenhum teste o lê em dois clientes.
- **Mutante:** `cityBroadcast()` removido no impacto (`server.js:690`).

---

## 3. T — Troca de rodada e sessão longa

### T1 · Do fim à próxima partida, todos dentro — FUNCIONAL
- **Mede:** `matchEnd` → ranking → `nextMatch` → lobby → o anfitrião começa →
  **todos** na nave da partida nova, sem ninguém tocar em nada além do
  anfitrião; repetido em N partidas seguidas.
- **Limiar:** lobby de volta ≤ 30 s depois do `matchEnd` em todos; 100 % dos
  jogadores na partida seguinte (P1); N ≥ 3 partidas sem perder o anfitrião.
- **Fonte:** `[INFERÊNCIA]`; "Team Up…the new team will be redirected to the
  game lobby screen after 5 seconds" [LASTRO: PUBG Update 8.1, 2020].
- **Por que a suíte não pega:** o reload é neutralizado no harness; o
  `nextMatch` só é testado por socket (`server.test.js`).
- **Mutante:** o `io.emit('nextMatch')` do `endTimer` removido (ninguém volta).

### T2 · Trocar de rodada sem recarregar a página — QUALIDADE
- **Mede:** o cliente sobrevive ao `nextMatch` sem `location.reload()` (mesmo
  socket, mesmo áudio destravado, mesma tela cheia).
- **Limiar:** 0 recargas.
- **Fonte:** "It is recommended that Unreal Engine multiplayer games use
  seamless travel when possible… and will avoid any issues that can occur
  during the reconnection process." e "When a client executes a non-seamless
  travel, the client will disconnect from the server and then re-connect to the
  same server…" [LASTRO: Epic, "Travelling in Multiplayer"]. O mundo é gerado
  pela semente no boot e a ordem do `Math.random` é contrato (CLAUDE.md): é por
  isso que o jogo recarrega — e o laudo mede o que a recarga custa.
- **Por que a suíte não pega:** os testes põem `NEXT_IN_S` alto (120–300 s)
  para nunca chegar ao `nextMatch`, que recarregaria a página do teste.

---

## 4. R — Robustez

### R1 · Engasgo curto de rede não elimina nem pune — FUNCIONAL
- **Mede:** a rede do celular para de entregar por 5 s (e solta em rajada) com
  o jogador andando; e por 30 s.
- **Limiar:** 5 s: o jogador segue na partida (mesmo socket, vivo se ninguém o
  matou) e **0 strikes**; 30 s: ver R2.
- **Fonte:** "Now, when a network delay/issue occurs for more than 10 seconds,
  an error message will notify you with the option to attempt reconnection or
  to leave the current match." [LASTRO: PUBG Update 17.2, 2022] — abaixo de
  10 s, o jogo segue. O transporte aguenta: `pingTimeout` "Default value:
  20000" [LASTRO: socket.io, Server options].
- **Por que a suíte não pega:** nenhum teste derruba a rede de um navegador.
- **Mutante:** `pingTimeout: 3000` no servidor.

### R2 · Caiu, voltou: volta para a MESMA partida — FUNCIONAL
- **Mede:** troca de rede (conexão cortada) e queda de 30 s em PLAY; o que
  acontece com o personagem enquanto isso e quando o cliente reconecta.
- **Limiar:** reconexão em ≤ 30 s devolve o jogador ao **mesmo personagem**,
  vivo se ninguém o matou; enquanto isso o personagem fica no mundo e pode
  morrer.
- **Fonte:** "The game will automatically attempt to reconnect you if the match
  is still valid…" e "Disconnected players' characters remain in the state they
  were in while the player was connected. … Player characters can be knocked
  out and eliminated while the player is disconnected." [LASTRO: Apex Legends,
  Season 5 patch notes]; "Players may now re-enter games if they have been
  disconnected mid-game" [LASTRO: PUBG, Early Access Month 4, 2017-08-01];
  "Players that experience a client crash on their device will be able to
  reconnect to their match within 4 minutes." [LASTRO: Call of Duty Warzone 2,
  Season 04 patch notes]. O socket.io tem o mecanismo, desligado por padrão
  ("Connection state recovery", `maxDisconnectionDuration` 2 min no código
  4.8.3), com o aviso: "please be aware that the recovery will not always be
  successful" [LASTRO: socket.io docs].
- **Por que a suíte não pega:** `br-reconnect-init` neutraliza o reload; a
  política "quem sai PERDE" está escrita no `game.js:5171` e nunca foi medida
  contra uma queda que o jogador não pediu.

### R3 · Celular em segundo plano por até 60 s, em qualquer fase — FUNCIONAL
- **Mede:** o app é trocado (aba oculta) no lobby, na contagem, na nave, na
  queda, em combate e no fim; o que o servidor faz e em que estado o jogador
  volta.
- **Limiar:** ao voltar, o cliente está **na fase que o servidor tem** para ele
  (≤ 2 s); 0 strikes; 0 eliminações pelo servidor que não sejam o gás/tiro que
  qualquer jogador parado tomaria.
- **Fonte:** o navegador segue rodando a aba oculta, estrangulada: "Most
  browsers stop sending requestAnimationFrame() callbacks to background tabs"
  e "In Chrome, this value is 10 seconds." [LASTRO: MDN, Page Visibility API];
  "The browser will check timers in this group once per second." [LASTRO:
  Chrome, "Heavy throttling of chained JS timers beginning in Chrome 88"]. Os
  60 s são `[INFERÊNCIA]`: abaixo do backstop de inatividade do próprio
  servidor (45 s sem `state` + a drenagem, `server.js:281`).
- **Por que a suíte não pega:** o puppeteer desliga o estrangulamento; o QA
  "pausa" com `setPaused`, não com a aba oculta.
- **Mutante:** o envio do `state` passar a depender do rAF.

### R4 · Segundo plano longo (aba congelada) — FUNCIONAL
- **Mede:** a aba é congelada (o que o Chrome faz com aba de fundo há mais de
  5 min) por 40 s em combate.
- **Limiar:** vale R2 — o servidor trata como queda e a volta devolve o jogador
  à partida; nunca "vivo" no servidor e fora da partida no cliente.
- **Fonte:** "All freezable task queues of a page that has been backgrounded for
  5 minutes will be frozen simultaneously, if the page is "freezable"." e "This
  feature has already shipped on mobile." [LASTRO: blink-dev, "Intent to
  Implement and Ship: Freeze task queues in background (desktop)", 2019];
  "In the frozen state the browser suspends execution of freezable tasks…"
  [LASTRO: Chrome, Page Lifecycle API].
- **Por que a suíte não pega:** nenhum teste congela a aba, e o servidor de QA
  tem `pingTimeout` de 10 min.

### R5 · Latência alta (150 e 300 ms por sentido) — FUNCIONAL
- **Mede:** com o celular a 150 ms e 300 ms por sentido (+ jitter): o ping
  mostrado, o atraso do boneco dele na tela dos outros, o tiro que ele leva, os
  strikes.
- **Limiar:** dano chega ≤ RTT + 150 ms; P13 com a latência somada; 0 strikes.
- **Fonte:** "A common conception among game players is that network latencies
  below 100 milliseconds are required for unimpaired game play" e a tabela
  "First Person | FPS, Racing | High | 100 milliseconds" [LASTRO: Claypool &
  Claypool, CACM 49(11), 2006]; "UT2003 feels sluggish when latencies are 150
  ms and higher." [LASTRO: Beigbeder et al., 2004]. 300 ms por sentido é o
  "Slow 4G" do DevTools (562,5 ms aplicados) arredondado para baixo.
- **Por que a suíte não pega:** nenhum teste estrangula a rede.
- **Mutante:** `S.halfRtt` ignorado no `S.now()` (o relógio fica meio RTT atrás).

### R6 · O anti-trapaça não pune quem joga limpo — FUNCIONAL
- **Mede:** `strikes` (e expulsões) de jogadores honestos ao longo de partidas
  inteiras: nave, segundo plano, carro com rede instável, engasgos.
- **Limiar:** **0 expulsões** em jogo honesto; **0 strikes** fora de movimento
  realmente impossível (o servidor expulsa acima de 120, `server.js:1404`, e os
  strikes nunca zeram dentro do socket).
- **Fonte:** o padrão do gênero é CORRIGIR a posição, não punir: "If the
  client's moves get dropped due to connection problems or if the client submits
  bad data, however, the two will end in different locations, necessitating a
  correction." [LASTRO: Epic, "Understanding Networked Movement in the Character
  Movement Component"]; "Increasing this number may reduce the amount of
  rubber-banding on the server but could potentially be abused by players as
  well." [LASTRO: SpigotMC, spigot.yml `moved-wrongly-threshold`].
- **Por que a suíte não pega:** `security-regression` prova que o trapaceiro é
  pego; nenhum teste prova que o honesto não é.
- **Mutante:** reduzir o teto de expulsão para 20.

### R7 · Anfitrião sai — [DECISÃO DO DONO]
- **Mede:** o anfitrião fecha a aba no lobby e no meio da partida.
- **Limiar provisório (auditor):** a partida em curso termina normalmente; no
  lobby seguinte a tela diz quem pode iniciar (S3).

### R8 · Menu aberto no BR — QUALIDADE + [DECISÃO DO DONO]
- **Mede:** o jogador abre o menu (≡ / ESC) no meio da partida e não volta.
- **Limiar provisório (auditor):** o painel diz a verdade inteira — ele já diz
  "A partida é do servidor: o gás, os tiros e o GOLEM não param" (`game.js:208`);
  se o servidor remove por inatividade, o painel diz quando.
- **Fonte:** `[INFERÊNCIA]`.
- **Por que a suíte não pega:** nenhum teste deixa o menu aberto 45 s numa
  partida com o servidor de produção.

---

## 5. M — Celular (o aparelho do dono), além de S5/S6

### M1 · Os controles de toque funcionam na partida ONLINE — FUNCIONAL
- **Mede:** pelo toque de verdade: pular da nave (⇧), andar (analógico),
  atirar (◉), chat (💬), pausa (≡) — numa partida com outros humanos.
- **Limiar:** 100 % dos comandos fazem efeito visto pelo servidor ou pelos outros.
- **Fonte:** régua do celular, C1–C11 (que mede o toque no solo e com
  bot-socket).
- **Por que a suíte não pega:** nenhum teste toca o ⇧ da nave numa partida de
  verdade, nem o 💬 com outro navegador do outro lado.
- **Mutante:** o ⇧ deixar de emitir `Space` (o celular nunca pula da nave).

### M2 · Tela cheia e paisagem na partida online — QUALIDADE
- **Mede:** `document.fullscreenElement` e a orientação travada quando a
  partida começa pelo anfitrião (não pelo toque do próprio jogador) e depois da
  recarga do `nextMatch`.
- **Limiar:** tela cheia na partida online, como no solo.
- **Fonte:** o próprio produto pede tela cheia + trava de paisagem no COMEÇAR
  do solo (`game.js:4875`, "Travar em paisagem aqui é o que impede o aparelho
  de auto-rotacionar no meio do tiroteio") — `[INFERÊNCIA]` de paridade.
- **Por que a suíte não pega:** nenhum teste lê `fullscreenElement` numa
  partida online.

### M3 · (HUMANO + APARELHO) Uma noite de partidas no celular do dono — ◌
- **Mede:** o dono joga 3 partidas seguidas no S22 contra 1–2 humanos, com a
  troca para outro app no meio de uma delas.
- **Limiar:** o dono diz que está jogável.

---

## 6. Placar e denominador

| Bloco | FUNCIONAL | QUALIDADE | decisão do dono | ◌ aparelho/humano |
|---|---|---|---|---|
| S — Sala | S1, S2, S4 | S5 | S3 | S6 |
| P — Partida | P1, P2, P3, P4, P6, P7, P8, P9, P10, P11, P14 | P5, P12, P13 | — | — |
| T — Rodada | T1 | T2 | — | — |
| R — Robustez | R1, R2, R3, R4, R5, R6 | R8 | R7 (e R8) | — |
| M — Celular | M1 | M2 | — | M3 |

**Denominador:** 22 FUNCIONAIS + 7 de QUALIDADE = **29** medidos pela máquina;
S3 e R7 são decisões do dono (efeito medido, fora do placar); S6 e M3 aguardam
aparelho/humano.
