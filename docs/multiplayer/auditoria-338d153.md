# Auditoria do MULTIPLAYER — commit `338d153` (rodada 1)

Primeira auditoria independente do Battle Royale online contra
`docs/multiplayer/criterio.md` (escrito nesta mesma rodada; as três mudanças
que a régua sofreu durante as medições estão declaradas no topo dela).
Autor: o **auditor** — não escreveu código de produto nem teste do repo, não
commitou, não deployou. Produto medido = `d2d6433`, o que está no ar (o
`338d153` só troca a porta de um teste).

> **Resumo para o dono.** A partida em si **funciona** entre humanos de
> verdade pelo lobby: todos se veem, a contagem e a nave batem no milissegundo,
> o tiro nos três caminhos chega e credita a kill, baú, loot, gás, chat, cidade
> e fim de partida são iguais para todos, e a próxima partida começa — com uma
> recarga de página. O que **quebra o jogo de quem está no celular** é o que
> acontece em volta disso: (1) quem ainda está carregando quando o anfitrião
> toca COMEÇAR vira **fantasma** — o servidor o põe vivo na nave, o celular fica
> no lobby dizendo "AGUARDANDO O ANFITRIÃO..." e perde a partida inteira;
> (2) **qualquer queda de conexão elimina** — não existe voltar para a
> partida; (3) **trocar de app** durante a nave faz o servidor recusar a
> posição do jogador a cada segundo e o salto sair no lugar errado, e ~2 min
> fora do app eliminam por inatividade; (4) as **regras da sala** voltam ao
> padrão a cada rodada. Número e reprodução de cada um abaixo.

---

## 0. Condições

- **Árvore:** `dev` = `hom` = `prod` = `338d153` (`git rev-parse`), `git status`
  limpo antes e depois (no fim, só `docs/multiplayer/` não rastreado — os dois
  arquivos desta rodada). Nenhum arquivo do produto foi tocado.
- **Máquina:** 12 núcleos, GPU (`/dev/dri/renderD128`, Chrome com ANGLE/GL),
  Chrome 154.0.8037.57 headless, puppeteer-core 24.43.1, socket.io 4.8.3 (os
  dois lados), Node 20.20.0. **Horários dos logs das sondas em UTC.**
- **Servidor:** `node server.js` real, `PORT=0`, `HOST_CODE` próprio,
  `NODE_ENV=production`, **sem `QA_BOOT_TOKEN`** (logo `pingInterval` 25 s /
  `pingTimeout` 20 s, os de produção). Um *espião* carregado por `-r` (fora do
  repo) **só lê** o `Map players` e os eventos de socket: `strikes`, `rejects`,
  `lastState`, `zoneHp`, chegada de cada `state`, motivo de cada `disconnect`,
  causa de cada `died`. Nunca a produção.
- **Clientes:** um Chrome por jogador, entrando pelo **menu** (toque/clique em
  MULTIJOGADOR) e pelo **lobby** (o anfitrião digita o código e toca COMEÇAR).
  Desktop 1280×720; celular 800×360 `isMobile` + `hasTouch`, `?mobile=1`, toque
  por `Input.dispatchTouchEvent` (pular ⇧, analógico, ◉, 💬, ≡, USAR, campo do
  código). Todos com `?tier=baixo` (o preset que o harness fixa). O reload do
  `nextMatch` e a reconexão rodam como em produção.
- **Segundo plano real:** as bandeiras anti-estrangulamento que o puppeteer
  liga por padrão foram **retiradas**. "Oculto" = janela minimizada
  (`visibilityState = hidden`, rAF parado, timers a 1 Hz — conferido numa
  página vazia antes de medir); "congelado" = `Page.setWebLifecycleState frozen`
  (o que o Chrome faz com aba de fundo há mais de 5 min, blink-dev 2019).
- **Rede:** proxy TCP por cliente (latência e jitter por sentido; *segurar* = a
  rede para de entregar nos dois sentidos e solta em rajada; *cortar* = derruba
  as conexões, como uma troca Wi-Fi→4G). Presets do DevTools: "Slow 4G"
  (1,44 Mb/s ↓, 0,675 Mb/s ↑, 562,5 ms aplicados) e "Fast 4G" (8,1 / 1,35 Mb/s,
  165 ms), valores do `devtools-frontend`. O "offline" do DevTools **não
  derruba** um WebSocket aberto (segura os quadros e solta depois, conferido
  com 5 e 30 s) — por isso as quedas são do proxy.
- **O que é sintético, declarado:** arma entregue por script no cliente (o
  tiro passa pelas mesmas validações do servidor que o de quem a achou num baú
  — ver a nota privada); encontros armados movendo o jogador em passos de
  2,5 m a cada 100 ms (25 m/s, abaixo do "suspeito" de 55 m/s do servidor:
  0 strikes por isso, conferido); mira por `camera.lookAt`; esqueletos
  desligados por script em E14/E15 (PvE local, ver §3); **E10 e E12** usam
  clientes socket.io sintéticos (a regra do anti-teleporte e o `ping timeout`
  só olham o fio). Todo o resto é o cliente de verdade.
- **Carga** (load de 1 min, a cada 5 s, `out/*-carga.log`; 12 núcleos):

  | sonda | o quê | mediana | p90 | máx |
  |---|---|---|---|---|
  | E1 / E1b | lobby; código, tela cheia, entra no meio, suavidade, maior quadro | 5,9 / 2,6 | 6,1 / 3,1 | 6,4 / 3,3 |
  | E2a / E2b / E2c | partidas completas, 3 humanos | 5,5 / 12,0 / 10,6 | 6,0 / 13,5 / 12,6 | 6,1 / 14,6 / 13,2 |
  | E3a / E7 | corrida do boot; fantasma e janela cega | 5,5 / 3,1 | 6,4 / 3,8 | 8,2 / 4,2 |
  | E4a / E4b / E4c | segundo plano | 5,2 / 10,2 / 2,6 | 6,5 / 15,1 / 3,1 | 8,8 / 16,7 / 3,5 |
  | E5a / E5b / E9 | rede ruim, carro, cortes, engasgos | 10,8 / 7,8 / 4,0 | 12,5 / 9,3 / 4,5 | 13,5 / 10,2 / 4,8 |
  | E6 / E8 / E11 | bots, chat, entra no meio, menu; baú, granada, foguete, loot; cidade | 3,4 / 3,7 / 3,8 | 5,2 / 3,9 / 5,1 | 5,9 / 4,3 / 5,9 |
  | E13 / E14 | carro, esqueletos, retrato; morto oculto | 3,6 / 4,9 | 5,3 / 6,3 | 5,6 / 7,3 |
  | E10 / E12 / E15 | sintéticos (socket); GOLEM | 0,5–1,7 / 0,9–3,4 / 3,2–4,8 (início–fim) | | |

  **Contaminação declarada:** duas sondas minhas (E2a, E2b) caíram com exceção e
  deixaram **dois Chrome órfãos** rodando o jogo de 06:52/06:55 a 07:28 UTC —
  eles pesaram sobre E2c, E3a, E4a, E5a e o começo de E4b (o salto de carga
  para 10–16). Foram mortos por PID (conferidos pela linha de comando e pela
  hora de início: os de E2a e E2b), e a biblioteca das sondas passou a matar os
  seus navegadores na saída. **O que é sensível a CPU foi remedido sem eles**:
  a janela cega (E7, carga 1,6–3,1), o maior quadro na entrada da nave (E1b,
  2,9), a aba oculta em combate (E4c, 2,5). As conclusões de estado (vivo/morto,
  fase, strikes, quem está em que tela) não dependem de tempo de CPU.
- **PvE local:** esqueletos são simulados em cada cliente e não têm regra de
  sala; mataram jogadores parados ~50 s depois do pouso em E6, E8, E9, E4c e
  E11 e encerraram partidas antes de a sonda terminar. Toda medida que caiu
  nisso foi **refeita** em outra sonda (dito em cada item).

---

## 1. Placar

**FUNCIONAL: 12 ✓ · 10 ✗ (de 22). QUALIDADE: 0 ✓ · 7 ✗ (de 7).**
Decisões do dono (S3, R7) e aparelho/humano (S6, M3) fora do denominador.

| ID | tipo | veredito | número que decide |
|---|---|---|---|
| S1 | F | ✓ | lista idêntica nos 3; nick 296 ms, cor 278 ms; toque→lista 0,73–2,75 s; celular CPU 4× + Slow 4G, cache frio: lobby em 28,6 s (≤ 60) |
| S2 | F | **✗** | 5 erros num aparelho → o código **certo**, no aparelho do dono (mesmo IP), responde "✖ código errado" por **22,4 s** |
| S3 | dono | — | sem anfitrião: "SEM ANFITRIÃO — use o código abaixo" por 90 s medidos, para sempre por construção |
| S4 | F | **✗** | só humanos: **5 de 5 regras** voltaram ao padrão na rodada seguinte |
| S5 | Q | **✗** | 800×360: lista NA SALA em y 550–634, COMEÇAR em 646–706, código em 739–787 (tela de 360); alvos todos ≥ 44 px ✓ |
| P1 | F | **✗** | **fantasma**: vivo no servidor, lobby no celular por **86,5 s**, até a inatividade o matar |
| P2 | F | **✗** | quem está no lobby: contagem ≤ 13 ms e `matchStart` ≤ 2 ms entre clientes, relógio 0–20 ms, nave ≤ 0,45 m ✓; **quem entra no meio: relógio −2 168 ms, nave desenhada a 48,4 m** |
| P3 | F | **✗** | salto honesto com a nave fora de ±542 m: **7–9 strikes** e 4–6 pacotes recusados (56,5 % das partidas no salto automático); 1 strike no 1º tique |
| P4 | F | ✓ | dano 114–236 ms (escopeta e fuzil, do desktop e do celular), foguete 884 ms, granada 2,2 s (pavio); kill creditada; killfeed idêntico |
| P5 | Q | **✗** | killfeed e "kill" do atirador **3,50 s** depois do golpe letal (3 498–3 513 ms) |
| P6 | F | ✓ | morto → espectador; quem entra no meio: espectador em 6,9 s vendo os 6 vivos; jogador na rodada seguinte |
| P7 | F | ✓ | baú aberto aparece aberto no celular em **30 ms**; o 2º não leva nada; loot de morte aparece e some para os dois |
| P8 | F | ✓ | gás: centro e raio **iguais** (0,00 m) no mesmo instante |
| P9 | F | ✓ | o D1 desenha o D2 **no carro 4** (boneco oculto, carro na pose da rede, 0,00 m); atraso 130 ms (p90 180); o celular toca USAR no carro ocupado → "Veículo ocupado!", não entra |
| P10 | F | ✓ | chat celular→desktop 164 ms; desktop→celular 34 ms |
| P11 | F | ✓ | `matchEnd` no mesmo ms nos 3; ranking idêntico; VITÓRIA só no vencedor |
| P12 | Q | **✗** | maior quadro depois do `matchStart`: **342–502 ms** limpo (E1b), 1 202–1 243 ms com carga (E2c) |
| P13 | Q | **✗** | atraso 135–150 ms + latência de ida ✓; **velocidade desenhada fora de ±50 % em 19,9 % dos quadros** (a simulação: 1,1 %) |
| P14 | F | ✓ | cidade: cinemática nos 3 em 90,03–90,24 s e "☄ Celular morreu no ataque de mísseis à cidade" nos 3; GOLEM: a vida igual nos 3 depois de cada um dos 6 tiros (3600 → 3288) |
| T1 | F | **✗** | o celular lento **não entra** na partida seguinte (P1); volta ao lobby 14 s + 2,5–2,8 s (desktop) / + 18,7–19,2 s (celular lento) |
| T2 | Q | **✗** | a troca de rodada **recarrega a página** em todos |
| R1 | F | ✓ | rede parada 5 s com o celular andando: mesmo socket, vivo, 0 strikes; 10 e 20 s: 0 de 12 derrubados (E12) |
| R2 | F | **✗** | corte de rede em partida → **eliminado**; reconecta em 1,1 s como ESPECTADOR |
| R3 | F | **✗** | oculto desde o lobby: **49 strikes** (1/s), posição nunca aceita, salto atrasado; oculto no meio da nave: **+10 strikes e ~900 m de teleporte**; em combate ≤ 60 s ✓, mas **132 s → eliminado por inatividade** sem ninguém atacar |
| R4 | F | **✗** | aba congelada → `ping timeout` em **~23 s** → eliminado → volta espectador |
| R5 | F | ✓ | 150 e 300 ms por sentido: dano 236–556 ms; atraso do boneco 285–485 ms; 0 strikes |
| R6 | F | **✗** | 0 expulsões, mas strikes de honesto: 1 (1º tique), 7–9 (salto na borda), até 49 (nave oculta), **+75 em 60 s a 33 m/s com engasgos de 1,5 s** |
| R7 | dono | — | anfitrião sai no meio: a partida termina normal; o lobby seguinte fica sem anfitrião (S3) |
| R8 | Q | **✗** | menu (≡) aberto: o painel diz "a partida continua"; o servidor elimina por inatividade em **52,3 s**; killfeed "caiu em combate **environment**" |
| M1 | F | ✓ | ⇧, analógico, ◉, 💬, ≡ e o campo do código pelo toque fazem efeito visto pelos outros e pelo servidor |
| M2 | Q | **✗** | tela cheia: **sim** no SOLO (toque no JOGAR), **não** na partida online (iniciada pelo anfitrião) |

---

## 2. Defeitos FUNCIONAIS, em ordem de severidade

Severidade: **CRÍTICA** = em uso normal o jogador fica fora da partida (ou a
partida é decidida errado) sem saber por quê; **ALTA** = quebra a partida de
quem está no celular numa situação comum (rede, troca de app); **MÉDIA** = a
função não cumpre o prometido, com contorno; **BAIXA** = incômodo ou caso raro.

### MP-1 · Fantasma: quem ainda carrega quando a partida começa fica fora dela, mas conta como vivo — CRÍTICA (P1, T1)

**O que acontece.** O socket conecta no **começo** do módulo do jogo, antes de
gerar o mundo (`game.js:264`), e o servidor já põe o jogador na sala como
participante (`server.js:1143–1149`: só é espectador quem chega em
PLAYING/ENDED; em LOBBY e COUNTDOWN ele conta). O ouvinte do `matchStart` só
existe depois que o `br-game.js` boota, **depois** do mundo
(`br-game.js:1767`; `multiplayer-client.js:58–93`). O socket.io não guarda
evento sem ouvinte: o `matchStart` que chega nessa janela **some**. Quem conecta
durante a contagem ainda perde os `countdown` e, ao terminar de carregar, cai
no `LOBBY.show()` porque o `INIT.phase` é `COUNTDOWN` (`br-game.js:2642–2650`).
O servidor o põe **vivo na nave** (`server.js:531–542`); o cliente nunca manda
`state`; ele fica assim até o backstop de inatividade (45 s sem estado, que só
vale depois de `flyTime + 25 s`, drenando 25 por segundo — `server.js:740–742`).

**Reprodução (E7, sem dublê nenhum).** Partida 1 normal; no `nextMatch` os dois
recarregam; o anfitrião (desktop) toca COMEÇAR assim que o botão dele acende —
**1,9 s** depois do `nextMatch`, vendo só `["Dono 👑"]` na lista. O celular
(CPU 4×, "Slow 4G") reconecta **durante a contagem** (07:48:58.864) e o
servidor começa a partida "com 2 jogadores" (07:49:00.771). O celular termina
de carregar 5,4 s **depois** do `matchStart` e mostra o lobby com
"AGUARDANDO O ANFITRIÃO..." — enquanto o anfitrião vê "👥 2 vivos". Assim por
**86,5 s**, até `[ZONA] servidor eliminou Celular (gás=false voando=false
afk=true)` e `[MATCH 2] vencedor: Dono`. Quem está no celular perde a partida
sem ter visto a nave; o outro vence sem lutar. Reproduzido também em E3a
(cenário B: o celular conectou na contagem 4 s antes do `matchStart`).

**A janela cega** (E7, recarga com cache quente, mediana de 3, carga 1,6–3,1):

| CPU emulada | rede | recarga → socket conectado | conectado SEM ouvinte do `matchStart` | recarga → lobby |
|---|---|---|---|---|
| 1× | local | 0,14 s | **1,3 s** | 1,4 s |
| 2× | local | 0,18 s | **2,3 s** | 2,4 s |
| 4× | local | 0,37 s | **4,0 s** | 4,3 s |
| 4× | Fast 4G | 3,5 s | **4,3 s** | 7,9 s |
| 4× | Slow 4G | 13,7 s | **5,0 s** | 18,7 s |
| 6× | Slow 4G | 12,7 s | **6,6 s** | 19,2 s |

Vira fantasma quem conecta e recebe o `matchStart` dentro dessa janela: com a
contagem de 10 s, é o celular que conecta nos últimos 1,3–6,6 s da contagem
(ou no lobby, até 6,6 s antes do COMEÇAR). E se conecta **depois** do
`matchStart`, entra espectador — no Slow 4G o anfitrião que começa ~2 s depois
da recarga deixa o celular sempre num dos dois. O anfitrião **não tem como
saber**: antes de carregar, o celular aparece na lista como "Recruta" (o `hello`
com o nick só sai no boot do lobby). **Controle negativo** (E7): esperando o
nick "Celular" aparecer na lista, o celular estava na nave — 0 fantasmas.

**A suíte sabe e contorna no teste, não no produto:** o harness espera o
ouvinte antes de começar (`test/helpers/harness.js:336`,
`waitForBRClientReady` — "caso contrário o evento se perde") e existe um teste
**do harness** para isso (`test/harness-br-readiness.test.js`). É a família
"o teste dirigir o produto em vez de observá-lo" (CLAUDE.md, formato 4).

**Uma linha:** o servidor só contar como vivo quem avisou que está pronto (ou o
cliente pedir o estado da partida ao bootar).

### MP-2 · Toda queda de conexão em partida elimina — não existe voltar — ALTA (R2, R4)

**O que acontece.** No `disconnect` o servidor apaga o jogador
(`server.js:1730–1758`: `players.delete`, `alive = false`, `checkVictory`) —
sem `playerKilled` e sem colocação (ele some do ranking da partida). O cliente
reconecta sozinho, recebe um `init` em PLAYING e **recarrega a página**
(`multiplayer-client.js:726–744`); a conexão nova chega no meio da partida e
vira **espectador** (`server.js:1143`). O comentário do produto assume a
política — "quem sai PERDE" (`game.js:5171`) — pensando em quem **escolheu**
sair; a queda não é escolha.

**Reprodução.**
- **Troca de rede** (E5b, o proxy derruba a conexão do D2 dirigindo, em PLAY):
  `transport close` às 07:34:49.054, conexão nova em 1,1 s (07:34:50.161),
  recarga, e o D2 volta **espectador** ("👁 ESPECTANDO Dono"). Fora da partida
  por um soluço de rede.
- **Aba congelada** (E4b, `frozen` em PLAY com três jogadores): o servidor
  derruba por **`ping timeout` ~23 s** depois do congelamento (07:32:00.425),
  o boneco some da tela do D1 (`playerLeft`) sem nada no killfeed, e na volta o
  celular recarrega e entra espectador.
- **Rede parada** (E12, 12 clientes por duração, fases de ping espalhadas):
  10 s → 0 de 12 derrubados; 20 s → 0 de 12; **30 s → 5 de 12 (42 %)**;
  **45 s → 12 de 12** (`ping timeout`). Cada derrubado é eliminado como acima.
  Com o jogador andando, 5 s e 30 s sem cair: mesmo socket, 0 strikes (E9).
- No LOBBY e no ENDED a reconexão é boa (mesma semente → adota o `init`, o
  anfitrião re-reivindica pelo código guardado — E5/E5b ✓).

As referências do gênero (critério R2) mantêm o personagem no mundo e deixam
voltar: Apex ("Disconnected players' characters remain in the state they were
in"), PUBG desde 2017 ("Players may now re-enter games"), Warzone ("reconnect
to their match within 4 minutes"). No celular, sair do Wi-Fi para o 4G, passar
num túnel ou o Android congelar a aba é rotina.

**Uma linha:** guardar o jogador por um tempo (o socket.io já tem "Connection
state recovery", `maxDisconnectionDuration` 2 min) e devolver o personagem a
quem volta com a mesma identidade.

### MP-3 · Trocar de app durante a partida: posição recusada na nave, salto errado, e eliminação em ~2 min — ALTA (R3, R6, P3)

**O que acontece.** A aba oculta não roda rAF; o `shipLocalPos` só é criado no
`brTick` (`br-game.js:2327`, rAF), e o `state` só leva `shipLocal` se ele
existe (`br-game.js:2202–2203`). Sem ele o servidor converte a posição do mundo
(a do lobby) para a cabine, acha fora (`server.js:1379–1382`), soma **1 strike
por pacote** e recusa a posição. O salto automático é do *watchdog* em
`setInterval` (`br-game.js:2234–2244`), e o Chrome estrangula os timers da aba
oculta além de 1 Hz: **depois de ~20–60 s oculta eles param por dezenas de
segundos** (medido: 5, 27, 48 s sem nenhum `state`; MDN diz que aba com
WebSocket não é estrangulada — no Chrome 154 é). E o `jumpFromShip` salta da
posição de mundo que o jogador tinha quando a aba sumiu (`br-game.js:1082–1090`),
não de onde a nave está.

**Reprodução (E4a, E4b, E4c).**
- **Oculto desde o lobby** (trocou de app esperando o anfitrião; ele começa):
  o `matchStart` é processado (fase SHIP), mas **49 strikes** (1 por segundo,
  07:11:09→07:11:59 UTC), posição no servidor `[0,0,0]` a nave inteira (os
  outros não o veem na cabine), a fase SHIP dura até ele voltar (o salto
  automático dos 55 s não aconteceu) e ele cai no fim da rota — no canto do
  mapa, no gás. Repetido: 33 strikes (E4a, partida 3); 23 strikes e pouso no
  **centro do mapa** (0, 4), a posição do lobby (E4a, partida 2).
- **Visível 12 s, oculto 55 s no meio da nave** (E4b): 0 strikes oculto na
  cabine (o `shipLocal` já existia); no salto automático o cliente saltou de
  onde a aba sumiu, (297, 171), com o servidor em (−422, −327): **~900 m**;
  **+10 strikes**, 10 pacotes recusados, e pouso onde a nave estava 45 s antes.
- **Oculto no lobby 60 s:** ✓ (mesmo socket, lobby inteiro).
- **Oculto em combate, gás desligado, ninguém atacando** (E4c, carga 2,5):
  `state` a 1 Hz por ~70 s; depois só rajadas, com um buraco de ~21 s e outro
  de 49 s; aos **132 s** oculto: `[ZONA] servidor eliminou Celular (gás=false voando=false
  afk=true)`. Abaixo de 60 s (o limiar de R3) nada aconteceu.
- **Morto por outro com o app em segundo plano há 70 s** (E14, esqueletos
  desligados): ✓ — o `died` saiu, o killfeed apareceu nos outros em ~3,0 s
  ("Amigo ▸ Celular ESCOPETA") e a kill foi creditada (`myKills` 1). O
  estrangulamento não roubou a kill para a inatividade.

**Uma linha:** criar o `shipLocalPos` no `matchStart` (não no rAF) e saltar da
pose atual da nave quando o salto vier do watchdog.

### MP-4 · O anti-teleporte acumula strikes de quem joga limpo — MÉDIA (R6, P3)

Os `strikes` (`server.js:1361–1410`) nunca zeram dentro do socket e expulsam
acima de 120 **no próximo movimento > 90 m/s**. Fontes medidas em jogo honesto:

| fonte | strikes | onde |
|---|---|---|
| 1º `state` depois do `matchStart`, antes do 1º quadro (sem `shipLocal`) | **1** (E2b, D2) | `br-game.js:2202` |
| **salto com a nave fora de ±542 m**: a queda prende a posição no limite (`br-game.js:1063–1064`) e o servidor vê 78–230 m num pacote | **7–9**, com 4–6 pacotes recusados (E4a, partida 3: D1 visível e honesto, salto automático) | rota a 620 m ±150 (`server.js:394–396`) × limite da queda |
| nave com o app em segundo plano (MP-3) | até **49** | MP-3 |
| **carro a 33 m/s com engasgos de rede** de 1,5 s a cada 10 s | **+75 em 60 s** (E10); a 42 m/s, +60; a 25 m/s, 0; sem engasgo, 0 | `server.js:1409` (a rajada chega junta, o `dt` é preso em 0,05 s → 66 m/s > 55) |

Monte Carlo sobre o `buildPlan` real (2 000 sementes): o **salto automático**
acontece com a nave fora de ±542 m em **56,5 %** das partidas; e os primeiros
~1,5 s (mediana) do voo também — quem pula de cara leva o mesmo.

**Expulsão de honesto: 0 observada.** Para expulsar falta, depois de 120, um
pacote > 90 m/s; o único de jogo honesto encontrado é o próprio salto da
borda, que vem cedo. Nenhuma linha `[CHEAT]` apareceu nos logs (ela só sai no
ramo > 90 m/s). O que o defeito faz hoje: a métrica de trapaça não distingue o
honesto, e os pacotes recusados congelam o boneco para os outros.

**Uma linha:** a rota da nave dentro do quadrado da queda (ou a queda sem
prender) e o pacote que chega em rajada medido pelo relógio do cliente.

### MP-5 · As regras da sala voltam ao padrão a cada rodada — MÉDIA (S4, T1)

**O que acontece.** No `nextMatch` todos os navegadores recarregam
(`br-game.js:2072`) e desconectam juntos (E2c: 06:58:52.575 → .585, 10 ms);
com só humanos na sala o `players.size` chega a 0 e o servidor volta à
"fábrica" (`server.js:1745–1752`) — o anfitrião, que reconecta 250 ms depois,
encontra as regras padrão.

**Reprodução (E2c).** O anfitrião escolhe tempo `relampago`, gás `classica`,
animais, alien e cidade desligados; a partida 1 roda com eles; no lobby da
partida 2 os três clientes mostram `{"tempo":"normal","gas":"auto",
"animais":true,"alien":true,"cidade":true}` — **5 de 5 voltaram ao padrão**,
sem aviso. Com bots na sala (E6) as regras sobrevivem (os bots não recarregam e
a sala nunca esvazia): o defeito é de quem joga só com amigos.

**Uma linha:** não zerar as regras quando a sala esvazia **durante** a troca de
rodada.

### MP-6 · Quem entra no meio (ou volta de uma queda) tem o relógio da partida atrasado pelo tempo de carregar — BAIXA (P2)

`clockOffset` é calculado no `boot()` do lobby (`multiplayer-client.js:136`,
`INIT.serverNow - Date.now()`), **depois** de gerar o mundo, com o `serverNow`
do `init` recebido antes dele; só o `matchStart` o recalcula
(`br-game.js:1771`), e quem entra no meio não recebe `matchStart`. E1b (D3
abre o link na partida, desktop): **relógio −2 168 ms**, nave desenhada a
**48,4 m** de onde está; a zona, o clima e a cinemática da cidade andam com o
mesmo atraso na tela dele. Num celular lento o atraso é a janela cega inteira
(4–6,6 s). Afeta o espectador que entrou no meio e todo jogador que voltou de
uma queda (MP-2).

**Uma linha:** guardar o `Date.now()` da chegada do `init` e usar no offset.

### MP-7 · O esfriamento do código tranca o dono pelo erro de outro aparelho da casa — e diz "código errado" — BAIXA (S2)

5 erros em 30 s esfriam o **IP** (`server.js:1196–1199`), e durante o
esfriamento o servidor responde `{ ok: false }` também ao código **certo**; o
cliente traduz qualquer recusa em "✖ código errado" e **apaga o código salvo**
(`multiplayer-client.js:473–476`). E1b: o celular erra 5 vezes pelo toque
(cada uma "✖ código errado" ✓); em seguida o código certo no celular → "✖ código
errado"; no aparelho do dono (mesmo IP) → "✖ código errado", **22,4 s** até
conseguir. Leitura de código, não medida: como o código salvo é apagado, a
re-reivindicação silenciosa do `nextMatch` (`multiplayer-client.js:764`) que
cair no esfriamento deixa a sala sem anfitrião na rodada seguinte.

**Uma linha:** o servidor dizer `esfriando` (e o cliente não apagar o código
salvo nesse caso).

---

## 3. Defeitos de QUALIDADE

### MQ-1 · A morte só é confirmada 3,5 s depois — (P5)
O cliente da vítima só manda o `died` 3,6 s depois de zerar a vida
(`game.js:3302`, `setTimeout(… __MP_respawn, 3600)`); até lá o servidor e os
outros a têm viva. E2c (2 mortes por escopeta, lidas nos 3 clientes com
resolução de 25 ms): o killfeed aparece nos **três** **3 498–3 513 ms** depois
do golpe letal (E14, com a vítima em segundo plano: ~3,0 s), e o hitmarker de "kill" do atirador
junto (`br-game.js:1979–1987`); o boneco da vítima fica **em pé e parado**
esse tempo na tela de todos (o `state` dela para no instante da morte,
`br-game.js:2148`). Quem atirou não sabe se matou e segue descarregando.

### MQ-2 · A tela trava ao entrar na nave — (P12)
`beginMatch` monta zona, baús, GOLEM, nave e compila shader no mesmo quadro
(`br-game.js:1708–1745`). E1b (limpo, carga 2,9, desktop com GPU): maior quadro
**342 ms** (D1), **502 ms** (D2), **405 ms** (celular emulado) nos 0,3–0,7 s
depois do `matchStart`. Com a máquina carregada (E2c): 1 202–1 243 ms. No
aparelho é o D1 da régua do celular.

### MQ-3 · O lobby do celular esconde quem está na sala e o COMEÇAR — (S5)
A 800×360 o primeiro quadro do lobby mostra nick, cores, prévia e
"COMO FUNCIONA" (`out/e1-m1-lobby.png`, `out/e1b-m1-lobby.png`); a lista NA SALA
está em y 550–634, o botão COMEÇAR/AGUARDANDO em 646–706 e o campo do código em
739–787, numa tela de **360** — o card tem rolagem própria (969 px de conteúdo
em 300 px) e só a contagem aparece no topo. Alvos: os 26 do lobby têm ≥ 44 px
(✓ C2). Ordem do HTML em `multiplayer-client.js:325–435`.

### MQ-4 · A troca de rodada recarrega a página — (T2)
`nextMatch` → `location.reload()` (`br-game.js:2072`; `server.js:589`:
"browser recarrega"). Custo: 2,5–2,8 s (desktop) e 18,7–19,2 s (CPU 4–6× +
Slow 4G) do reload ao lobby. É a raiz de MP-1 (a janela cega reabre a cada
rodada) e de MP-5 (a sala esvazia) e tira a tela cheia (MQ-7). A recarga existe
porque a ordem do `Math.random` do mundo é contrato (CLAUDE.md) — trocar isso é
decisão do dono (§5).

### MQ-5 · Menu aberto ou celular em retrato: eliminado por inatividade sem aviso — (R8)
Com o menu aberto o cliente para de mandar `state` (`br-game.js:2147`); o
servidor, 45 s depois, drena 25 de vida por segundo (`server.js:740–742`). E6:
≡ tocado depois da janela de queda; o painel diz "— MENU ABERTO · A PARTIDA
CONTINUA —" e "A partida é do servidor: o gás, os tiros e o GOLEM não param
enquanto este menu está aberto."; **52,3 s** depois:
`[ZONA] servidor eliminou Celular (gás=false voando=false afk=true)`, e o
killfeed dos outros diz **"☠ Celular caiu em combate environment"**. O retrato
pausa pelo mesmo caminho (`game.js:1511`, `Orient.onBlock`): E13 — celular
virado para 360×800 depois da janela de queda, aviso de rotação na tela
(`paused: true`) e **52,6 s** depois o mesmo `afk=true`.

### MQ-6 · O boneco dos outros "pulsa" a 10 Hz — (P13 b)
A posição remota persegue o último pacote por `lerp` exponencial
(`br-game.js:2340`, `k = 1 − e^(−12·dt)`), e o pacote chega a 10 Hz
(`br-game.js:2146`): a cada pacote o boneco acelera e depois freia. E1b (D2
correndo reto a 8,5 m/s, D1 desenhando): velocidade desenhada entre **3,2 e
14,7 m/s**, **19,9 %** dos quadros fora de ±50 % da velocidade real (a
simulação do próprio D2, na mesma medida: 1,1 %). O atraso médio está bom
(135 ms) — o problema é o degrau.

### MQ-7 · Sem tela cheia na partida online — (M2)
O pedido de tela cheia + trava de paisagem só existe no início **com gesto**
(`game.js:4875`, `Orient.attempt(true)` só se `trusted`); a partida online
começa pelo `matchStart` → `G.forceStart()` → `startGame(false)`
(`br-game.js:1711`). E1b: SOLO tocado no celular → `fullscreenElement` **sim**;
celular na nave da partida online → **não**. E a recarga do `nextMatch` tiraria
de qualquer jeito (MQ-4).

### Observações fora da régua
- **O killfeed mostra o nome interno da causa** (`br-game.js:1964–1965` imprime
  `d.cause` cru): medido "caiu em combate **environment**", "caiu em combate
  **skeleton**" (E6, E11).
- **Esqueletos são locais de cada cliente** (`game.js:4602`,
  `Skeletons.update` por cliente): E13, no mesmo instante, os 7 esqueletos do
  D1 e os 7 do D2 estão a **35–431 m** uns dos outros — cada um caça o seu
  jogador na tela dele. O esqueleto que matou alguém não existe na tela dos
  outros; o killfeed diz "caiu em combate skeleton".
- **O `bossHp` sai volátil** (`server.js:1716`): com a máquina a 3–5 não se
  perdeu nenhum (E15, 6 de 6 iguais nos três).

---

## 4. O que passou, com número

- **S1** (E1, E1b, E3a, E6): os três clientes com a MESMA lista; nick novo no
  outro em 296 ms, cor nova em 278 ms; do toque em MULTIJOGADOR à lista: 0,73 s
  (desktop) a 2,75 s (celular); celular com CPU 4× e Slow 4G, cache frio: socket
  em 21,7 s e lobby em 28,6 s do link. Bots: 0 por padrão; 4 pedidos aparecem
  na lista em 203 ms.
- **S2, o que funciona**: o código certo promove na hora e a coroa aparece em
  todos; o anfitrião re-reivindica sozinho pelo código guardado em todas as
  recargas medidas (E2c, E4a ×2, E7 ×2) e no corte de rede no lobby (E5/E5b).
- **P2 para quem está no lobby** (E2b, E2c): a contagem "10" chega aos três
  236–293 ms depois do toque; o `matchStart` chega aos três com ≤ 2 ms de
  diferença e é processado em 15–27 ms; erro de relógio 0–20 ms; nave a
  0,01–0,45 m da do protocolo; cada um vê os outros dois na cabine.
- **P4** (E2c, E8): escopeta (hitscan) 163–232 ms do disparo à vida da vítima
  cair (inclusive o celular atirando pelo ◉); fuzil (`projSpeed`) 114–236 ms;
  foguete 884 ms (com o voo) matando de um tiro; granada 2,2 s (o pavio); kill
  creditada (`myKills` 1) e killfeed idêntico nos três.
- **P6** (E2c, E6): o morto vê o recap e vira espectador (~8 s); quem abre o
  link com a partida rodando vira espectador em 6,9 s vendo os 6 vivos
  (servidor `spectator=true`) e está na lista como jogador na rodada seguinte.
- **P7** (E8): baú aberto pelo D1 aparece aberto no celular em **30 ms**; o D2
  toca USAR no mesmo baú e não ganha nada; loot de morte aparece no mesmo ponto
  nos dois e some dos dois quando o celular o pega.
- **P8** (E6): gás com centro e raio iguais (0,00 m) no mesmo instante.
- **P9** (E13): o D2 entra num carro e dirige; o D1 o desenha **no carro 4**,
  com o boneco oculto e o carro na pose da rede (0,00 m); atraso 130 ms
  (p90 180); o celular chega no carro ocupado, toca USAR e lê "Veículo
  ocupado!" — não entra, e o D2 segue dirigindo.
- **P10** (E6): 💬 tocado no celular foca o campo; "oi do celular" chega ao
  desktop em 164 ms; "oi do desktop" ao celular em 34 ms.
- **P11** (E2c): `matchEnd` no mesmo milissegundo nos três; ranking igual;
  "🏆 VITÓRIA MAGISTRAL!" só no vencedor, "🏆 FIM DE PARTIDA" nos outros.
- **P13 (a)** (E1b, E2b, E2c, E5): atraso do boneco remoto **135–150 ms** sem
  latência, 285–290 ms com 150 ms por sentido, 320–325 ms com +60 de jitter,
  480–485 ms com 300 ± 100 ms; erro correndo a 6,2 m/s: 1,17 m. Agachado chega
  (E8: `crouch` 1 parado e andando).
- **P14, cidade** (E11, mecânica intencional): a cinemática começa nos três em
  90,03–90,24 s do início; o `[CIDADE] Celular morreu no ataque de mísseis`
  vira "☄ Celular morreu no ataque de mísseis à cidade" no killfeed dos três;
  a cidade fica destruída nos três (99,7–101,3 s; leitura a cada ~0,7 s).
- **P14, GOLEM** (E15): seis tiros do D2; a vida do GOLEM lida nos três depois
  de cada um é a mesma (3600 → 3548 → … → 3288).
- **R1** (E9): rede do celular parada 5 s com ele andando: mesmo socket, vivo,
  0 strikes; os outros o veem parado (0,46 m em 5 s) e depois em rajada.
- **R5** (E5/E5b): ping mostrado 302 ms com 150 ms por sentido, 648–667 ms com
  300 ± 100; o tiro chega 236–252 e 415–556 ms; 0 strikes.
- **M1**: pular pelo ⇧, andar pelo analógico, atirar pelo ◉ (matou nas partidas
  medidas), chat pelo 💬, pausa pelo ≡ e o campo do código — todos pelo toque.

---

## 5. Decisões que são do dono

1. **Sala sem anfitrião (S3, R7).** Hoje: sem quem tem o código a sala espera
   para sempre (90 s medidos com "SEM ANFITRIÃO — use o código abaixo"; por
   construção, `server.js:268`, `:1741`). Se o anfitrião sai no meio, a partida
   termina normal e o lobby seguinte trava igual. Opções: manter; passar o posto
   ao próximo (o Steam faz: "if the current owner leaves, another user in the
   lobby will become the owner automatically"); ou deixar qualquer um começar
   quando não há anfitrião.
2. **Esfriamento do código por IP (S2, MP-7).** Todos os aparelhos da mesma casa
   dividem as 5 tentativas; o dono fica 22 s trancado pelos erros de outro.
3. **Reconexão (R2, MP-2).** Hoje quem cai perde. As referências devolvem o
   personagem (Apex, PUBG; Warzone até 4 min). Decidir a janela.
4. **Inatividade (R8, MQ-5, MP-3).** 45 s sem `state` + drenagem: com o menu
   aberto, em retrato, ou ~2 min com o app em segundo plano, o jogador é
   eliminado. Decidir se o menu/retrato mantém o jogador "vivo" no servidor e o
   que o painel diz.
5. **Recarga entre rodadas (T2, MQ-4).** É o que mantém a semente do mundo como
   contrato simples; é também a raiz de MP-1 e MP-5. Trocar por "seamless
   travel" é obra grande — decidir se vale.
6. **PvE local.** Esqueletos (sem regra de sala) caçam cada jogador na tela
   dele (E13: 35–431 m de diferença entre dois clientes) e mataram jogadores
   parados ~50 s depois do pouso em cinco sondas. Se o dono quer que quem
   morreu para um esqueleto seja visto pelos outros — ou uma regra de sala para
   desligá-los —, é decisão de produto.

---

## 6. O que a suíte atual NÃO cobre

1. **Dois navegadores na mesma sala pelo lobby** — nenhum teste; os "outros
   jogadores" são sempre sockets do Node (`server.test.js`,
   `security-regression`, o *bot-host* do `startBRMatch`).
2. **O `matchStart` que chega antes do ouvinte** — contornado no harness
   (`waitForBRClientReady`) e testado como propriedade **do harness**
   (`harness-br-readiness.test.js`). MP-1 passa verde por construção.
3. **A nave de verdade** — `startBRMatch` pula a nave (`S.phase = 'PLAY'` +
   teleporte) e espera o servidor ACEITAR o pouso; nenhum teste vê os strikes do
   salto (MP-4) nem o salto do watchdog (MP-3).
4. **O `nextMatch` com recarga** — nunca alcançado num navegador: os testes
   põem `NEXT_IN_S` em 120–300 s (a recarga do `br-game.js:2072` derrubaria a
   página do teste), e a recarga da reconexão é neutralizada
   (`__MP_reload = () => {}`, `harness.js:209`); o `nextMatch` só é testado por
   socket em `server.test.js`. As regras que resetam (MP-5) e a janela cega a
   cada rodada (MP-1) ficam fora.
5. **Queda de conexão com o `pingTimeout` de produção** — o servidor de QA usa
   10 min (`server.js:159`); o ouvinte de reconexão é removido no harness.
6. **Segundo plano real** — o puppeteer liga `--disable-background-timer-
   throttling` por padrão; a "pausa" dos testes é `setPaused`, não a aba oculta.
7. **Strikes de jogador honesto** — `security-regression` prova que o
   trapaceiro é pego; nada prova que o honesto não é (MP-4).
8. **Quando a morte é confirmada** (MQ-1) e **o relógio de quem entra no meio**
   (MP-6) — os testes esperam o evento, não medem quando.
9. **O lobby do celular com gente dentro** (MQ-3) e a **tela cheia online**
   (MQ-7).
10. **Rede degradada** — nenhum teste estrangula rede nem segura bytes.

---

## 7. As sondas, uma a uma

Todas em `/home/reis/repos/FPS-WillianIA/.privado/mp1/`, executadas **uma por
vez** (`cadeia*.sh`), cada uma com servidor próprio em `PORT=0`.

| sonda | o que mediu | resultado principal |
|---|---|---|
| E1 `e1-lobby.js` | 3 clientes no lobby; tempos; lista; nick/cor; geometria no celular | S1 ✓; MQ-3 (o toque no código falhou por estar fora da tela — refeito em E1b) |
| E1b `e1b-sala.js` | código errado ×5 pelo toque e o dono no mesmo IP; tela cheia SOLO × online; quem entra no meio (relógio); maior quadro na nave; suavidade crua | MP-7, MQ-7, MP-6, MQ-2 (342–502 ms), MQ-6 (19,9 %) |
| E2a/b/c `e2-partida.js` | partidas completas com 3 humanos (2 seguidas em E2c): contagem, relógio, nave, salto, pouso, pose, 3 caminhos do tiro, kill, killfeed, fim, recarga | P2, P4, P11, P13 ✓; MQ-1 (3,5 s); MP-5 (regras) |
| E3a `e3-corrida.js` | o anfitrião começa enquanto o celular carrega (1ª entrada e troca de rodada) | 1ª entrada: entrou; troca de rodada: **fantasma** (MP-1) |
| E4a/b/c `e4*-fundo.js` | app em segundo plano no lobby, contagem, nave (inteira e no meio), combate (90 e 150 s), fim; aba congelada | MP-3 (49 / +10 strikes, 900 m), R3 132 s → inatividade, MP-2 (congelada) |
| E5a/b `e5*-rede.js` | latência 0/150/150+60/300+100 ms; corte em partida, no lobby (anfitrião) e na contagem | R5 ✓; R2 ✗; lobby ✓; contagem: recarregou e entrou a tempo (CPU 1×) |
| E6 `e6-sala.js` | bots; chat; gás igual; entra no meio; menu aberto até a inatividade; anfitrião sai no meio; sala sem anfitrião 90 s | P8, P10, P6 ✓; MQ-5 (52,3 s); S3/R7 |
| E7 `e7-fantasma.js` | janela cega por CPU e rede; a corrida real com o celular lento; controle | MP-1 (86,5 s de fantasma); janela 1,3–6,6 s |
| E8 `e8-extras.js` | baú; agachado; granada; foguete; loot de morte | P7, P4 ✓ |
| E9 `e9-engasgo.js` | rede parada 5 e 30 s com o celular andando | R1 ✓ (0 strikes) |
| E10 `e10-carro-rajada.js` | sintético: motorista a 25/33/42 m/s, com e sem engasgos de 1,5 s | MP-4 (+75 em 60 s a 33 m/s) |
| E11 `e11-cidade.js` | destruição da cidade nos três, morte no raio | P14 ✓ (cidade) |
| E12 `e12-ping.js` | sintético: rede parada 10/20/30/45 s × 12 clientes | 0 / 0 / 42 % / 100 % derrubados |
| E13 `e13-carro.js` | carro visto pelos outros e posse; esqueletos D1 × D2; retrato | P9 ✓; esqueletos locais; retrato → 52,6 s |
| E14 `e14-morto-oculto.js` | morto por outro com o app oculto há 70 s | kill creditada, killfeed em 3,0 s ✓ |
| E15 `e15-golem.js` | vida do GOLEM nos três depois de cada tiro | P14 ✓ (GOLEM) |

Medidas que não fecharam e por quê: o foguete atirado **do celular** em E2c
(partida 2) não acertou e o celular morreu logo depois por causa que o espião
ainda não registrava — o caminho do foguete foi medido do desktop (E8); o
GOLEM em E8 não foi acertado (refeito em E15); a pose no carro foi medida a
baixa velocidade (o carro encalhou: média 3,1 m/s em E13), então o erro em
metros do carro rápido não foi medido — o atraso (130 ms) é o mesmo mecanismo
de P13. **Não medidos nesta rodada** (ficam para a próxima): o boneco no
**helicóptero** visto pelos outros, o **carro solto** entre dois navegadores
(os testes do repo o cobrem com bot-socket), o retrato **liberado** (JOGAR
ASSIM) numa partida online, e 4 humanos jogando a mesma partida inteira (as
sondas usaram 2–3 jogando; 4 na sala em E1b, com o 4º espectador; 4 bots em
E6).

---

## 8. Arquivos

- Régua: `docs/multiplayer/criterio.md`. Este laudo:
  `docs/multiplayer/auditoria-338d153.md`.
- Sondas, saídas e logs (fora do git, `/home/reis/repos/FPS-WillianIA/.privado/mp1/`):
  `lib.js` (servidor, proxy, clientes, toque), `espiao.js` (leitura do
  servidor), `jogo.js` (ajudantes), `e1-lobby.js` … `e15-golem.js` (uma por
  experimento), `cadeia*.sh` (execução em fila, nunca em paralelo),
  `suavidade.py`, `carga.py`, e `out/` (logs `eN.log`, resultados
  `eN-res.json`, logs do servidor `server-*.log`, espião `espiao-*.jsonl`,
  carga `*-carga.log`, telas `*.png`).
- Vetores de trapaça observados de passagem (três) ficaram **só** em
  `.privado/mp1/exploit-notas.md`, fora do repo.
