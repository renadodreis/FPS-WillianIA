# Menu único, morte sem reload — contrato

Data: 2026-08-09. Branch: `refatoracao`.

O dono relata "os menus de entrada estão completamente bugados, hoje temos dois,
quero apenas um coeso que não trave o jogo, e a tela de morte também".

O recon confirmou: são dois sistemas de tela cheia disputando o mesmo espaço, e
o "trava" tem causas concretas, listadas abaixo.

## Decisões do dono (fechadas)

| Assunto | Decisão |
|---|---|
| Menu | **Um só.** SOLO / MULTIJOGADOR / CONFIGURAÇÕES / CONTROLES. O lobby do BR vira painel DENTRO dele, como CONFIGURAÇÕES já é |
| Morte | **Sem recarregar a página.** JOGAR DE NOVO e VOLTAR AO MENU |
| Escopo | Fluxo + visual coeso + deploy (deploy só com aprovação explícita) |
| 60 FPS | Objetivo futuro, **fora** desta rodada |

## O que está quebrado hoje (medido, com file:line)

1. **Trava total sem erro visível.** `multiplayer-client.js:10-12` injeta
   `<script src="br-game.js">` sem `onerror`, e o poll de `window.__BR_game`
   (`:14-24`) não tem timeout nem backoff. Falhou o arquivo? O poll gira para
   sempre, `boot()` nunca roda, o lobby nunca aparece, e `#btnNew` fica
   `.disabled` com "SALA ONLINE — ABRINDO LOBBY..." eternamente.
2. **Zero tratamento de queda de socket.** Não existe `socket.on('disconnect')`
   em `game.js`, `multiplayer-client.js` nem `br-game.js`. `#btnNew` é
   desabilitado uma vez no boot (`game.js:2818-2820`) com base em `__mpSocket`
   naquele instante, e nada reverte.
3. **Menu visível sem handler.** Do fim do parse do HTML até `game.js` terminar
   (handshake do socket em `:69-115` + worldgen até `:2769-2824`), o menu
   renderiza e faz hover por CSS puro, mas nenhum listener existe. Clique não faz
   nada, e nada avisa.
4. **`brTick()` não respeita pausa.** `br-game.js:1918-2199` só sai com
   `!window.__BR_active` (`:1937`); não checa `MP.state.paused` em lugar nenhum.
   Com o menu aberto no BR continuam rodando: dano de zona (`:2132-2153`),
   corpo-a-corpo (`:2111-2121`) e o GOLEM (`:1306/1322/1328`).
5. **Morte cobre o menu.** `#deathScreen` (`style.css:439`, z-index 200) não
   declara `pointer-events` e cobre `#overlay` (z-index 100). Morrer com o menu
   aberto deixa o menu interativo, invisível e inalcançável atrás.
6. **Morte solo só sai por reload.** `.show` do `#deathScreen` é removido em UM
   lugar no repo inteiro (`br-game.js:1356-1357`, fluxo BR). No solo, o único
   reset é `location.reload()` (`game.js:2122`) — e é a única das quatro chamadas
   de reload do projeto **sem hook**, logo inalcançável por teste.
7. **Gates divergentes pós-morte.** Três listas quase iguais que não concordam:
   `reloadBlocked()` (`game.js:1753`) e o gate de tiro (`:2049`) checam
   `player.dead`; o gate de `playerUpdate` (`:2671`) **não**. O jogador anda,
   pula e olha por 3,6 s com "VOCÊ MORREU" na tela. Nada solta o pointer lock na
   morte.
8. **`#settings` é um nó compartilhado, movido fisicamente** entre `#panel` e
   `#brCfgHolder` (`multiplayer-client.js:476-492`). A proteção é convenção:
   `rescueSettings()` (`:498-505`) precisa ser chamada antes de QUALQUER
   `lobby.innerHTML =`. Um caminho novo que esqueça destrói o painel de
   configurações do jogo inteiro, sem erro no console.
9. **`#btnBack` acumula dois listeners permanentes**, nunca removidos
   (`game.js:2823` e `multiplayer-client.js:484-490`).
10. **`nextMatch` recarrega a página inteira** (`br-game.js:1797`).

## A máquina de estados alvo

Um dono de tela por vez. `#overlay` é a ÚNICA superfície de menu em tela cheia;
o lobby do BR renderiza DENTRO de `#panel`.

```
BOOT ──► MENU ──┬─► MENU_MP ──► (servidor) ──► JOGANDO
                └─► JOGANDO (solo)
JOGANDO ──► PAUSA ──┬─► JOGANDO
                    └─► MENU
JOGANDO ──► MORTO ──┬─► JOGANDO   (JOGAR DE NOVO)
                    └─► MENU      (VOLTAR AO MENU)
```

- **BOOT** — o menu aparece, mas os botões nascem desabilitados com motivo
  visível ("carregando o mundo..."), e só habilitam quando os handlers existem.
  Fecha o item 3.
- **MENU_MP** — lobby dentro de `#panel`. `#settings` deixa de ser movido: o
  painel de configurações é alcançável do menu e do lobby sem reparent. Fecha 8.
- **PAUSA no BR não congela o mundo, e isso passa a ser explícito.** A partida é
  autoritativa no servidor: parar o `brTick()` local daria imunidade e
  dessincronizaria. Em vez de fingir que pausa, o painel de pausa em BR diz **"A
  PARTIDA CONTINUA"** e não cobre a tela inteira. Fecha 4 sem reabrir o vetor que
  `game.js:2078` protege ("pausar NÃO pode dar imunidade").
- **MORTO e PAUSA são mutuamente exclusivos.** Entrar em MORTO fecha o menu antes
  de mostrar a tela de morte. Fecha 5.
- **JOGAR DE NOVO reinicia a PARTIDA, não o MUNDO.** Reseta jogador, pontos,
  abates, inventário e inimigos; **não** re-executa worldgen. Hoje o reload com o
  mesmo seed reconstrói o mesmo mundo, então o jogador vê a mesma coisa — e assim
  a ordem de consumo do `Math.random` seedado não é tocada, que é contrato do
  `CLAUDE.md`. Fecha 6.

## Invariantes que a refatoração precisa impor (não só respeitar)

1. **`state.paused` tem um único escritor: `setPaused`.** Hoje é convenção; passa
   a ser imposto (os próprios testes escrevem `MP.state.paused` cru —
   `test/gameplay.test.js:653/660/675/690`).
2. **Ordem de consumo do `Math.random` seedado é contrato.** Nada de regenerar o
   mundo.
3. **Client-authoritative com anti-cheat no servidor.** `server.js` valida
   dano/acerto; pausar não pode dar imunidade; reiniciar a partida solo não pode
   virar caminho de reset de estado em BR.
4. **Destruição da cidade é mecânica intencional.** O menu novo não pode
   bloquear projétil nem cinemática.
5. **O modo celular não pode regredir.** `js/touchcontrols.js` já injeta
   `setPaused` e depende de `Touch.setPlaying` ser chamado de dentro dele
   (`game.js:1222`). Em celular NÃO existe ESC: o único jeito de pausar é o botão
   de toque, que some quando `html.playing` é falso — qualquer dessincronia entre
   `state.paused` e `setPlaying` deixa o jogador sem saída.

## Lacunas de teste que a rodada precisa fechar

- Nenhum teste mocka `location.reload()` em nenhum dos 4 call sites.
- O harness força `window.__MP_active = window.__BR_active = true`
  (`test/helpers/harness.js:176-179`), o que torna a branch de morte solo
  (`game.js:2122`) **matematicamente inalcançável em CI**.
- Nada cobre `br-game.js` falhando ao carregar, nem queda de socket.
- Nada assere `#deathScreen` sobre `#overlay`, nem `playerUpdate` continuando
  depois de `player.dead`.
