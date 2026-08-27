# Validação da rodada — commit `c070737`

Autor: o **validador**. Quarta passagem pelo §12 de `docs/vr/criterio-aaa.md`.
Rodadas anteriores: `validacao-98b114f.md` (14 verdes), `validacao-bbe6b48.md`
(19), `validacao-3cc8eea.md` (22).

---

## 0. Condição da medição (sem isto não é medida)

| | |
|---|---|
| Commit medido | `c070737` — *perf(vr): céu noturno de volta e far na névoa* |
| Branch | `dev` (HEAD = `c070737` no início e no fim da janela) |
| **Onde medi** | **cópia isolada**, `git archive c070737` extraído no scratchpad, `node_modules` por symlink |
| Conferência da cópia | md5 de `js/xr/xrsession.js`, `xrlocomotion.js`, `xrui.js`, `xrsocial.js`, `farbeacon.js`, `game.js` — **iguais** ao `git show c070737:<arquivo>` |
| Por que isolada | outras frentes mexem na árvore durante a minha janela; foi a decisão certa na rodada passada e continua sendo |
| Portas | 3480–3487 (uma por sonda, sequenciais) |
| Runtime | IWER 2.3.0, preset Meta Quest 3, Chrome com GPU real, `test/helpers/iwer.js` → `bootEmVR` |
| Seed | 424242 (padrão do harness) |
| Carga da máquina | `load average` 1,66 no início (12 núcleos, 30 GB) — sondas sequenciais, nunca duas ao mesmo tempo |
| `npm run lint` | **limpo** (rodado na cópia isolada) |
| `npm test` | **não rodei** — proibido nesta rodada. O "verde com dois flakes" é declaração da rodada, não medição minha |
| Aparelho | não rodei o passo 4 (E1-tempo, E3, E4, E5, F1 continuam do aparelho) |
| Humano de headset | nenhuma das 20 caixas de I1 marcada |

Seis sessões imersivas, ~40 medições. `__game.errors`, `pageErrors` e
`consoleErrors` **vazios em todas**.

**A cópia isolada se justificou sozinha.** Ao fim da janela, `git status` na
árvore de trabalho mostrava `game.js`, `js/grass.js`, `js/xr/xrquality.js`,
`js/xr/xrui.js` e `test/xr-quality.test.js` **modificados**, mais
`js/xr/xrmenu.js` e `test/xr-menu.test.js` **novos** — outra frente trabalhando
em cima de `c070737` enquanto eu media. **Nada disso entrou em nenhum número
deste documento:** tudo aqui saiu do `git archive` conferido por md5. Se a
próxima rodada trouxer um menu em VR, ele ainda não foi visto por mim.

---

## 1. Placar

| Rodada | 🟢 Verde | 🔴 Vermelho | ⚪ Não medido |
|---|--:|--:|--:|
| `98b114f` | 14 | 19 | 14 |
| `bbe6b48` | 19 | 14 | 14 |
| `3cc8eea` | 22 | 10 | 15 |
| **`c070737`** | **22** | **10** | **15** |

**O placar não andou, e a razão é a notícia da rodada.** Duas linhas fecharam
(**F3** e **B6**) e duas abriram (**A4** e **A5**) — e as duas que abriram são
consequência direta da correção do meu defeito nº 4. Eu escrevi isto na rodada
passada, em `validacao-3cc8eea.md` §6:

> *"Efeito colateral não coberto: se o jogador pudesse escolher `paridade`, o
> teto voltaria a 8,6 e A5 voltaria a reprovar — só que ele não pode escolher
> (§3.4), então o critério está verde por causa do defeito."*

Ele agora escolhe. A5 reprovou. **O 22 da rodada passada tinha dois verdes
comprados com um defeito;** este 22 é o primeiro que não tem. Empate no número,
não empate no valor.

---

## 2. Critério a critério

### A — Giro e locomoção

| Critério | | Medido |
|---|:-:|---|
| A1 · giro não translada a cabeça | 🟢 | **0,00000 m em 24 casos** (2 modos × 3 raios 0,71 / 1,0 / 1,4 m × 4 direções). Passo **−45,000°** cravado; contínuo −119,55 a −120,08°. O rig mexeu nesta rodada e o pivô na cabeça sobreviveu. |
| A2 · passo é escolha do jogador | 🟢 | Herdado — `js/xr/xrturn.js` não aparece no diff `3cc8eea..c070737`. Painel medido em sessão: `giroModo`, `velocidade`, e `ÂNGULO DO PASSO` no modo em passos. |
| A3 · velocidade humana | 🟢 | Padrão de fábrica `conforto`: **andar 1,6930 m/s medido** (teto 2,0), correr alvo **2,800** (teto 4,0). E a metade que faltava — *"com a velocidade de PC disponível como opção declarada"* — **existe e é alcançável**: `IGUAL AO PC` = 5,200 / 8,600, medida pelo caminho do jogador (§3.1). |
| A4 · aceleração instantânea | 🔴 | **REGREDIU, e por uma porta que a rodada abriu de propósito.** `conforto` **48,0 ms**, `alcance` **45,3 ms** — e **`paridade` 281,1 ms**, contra teto de 150. Os três perfis estão a **dois cliques** no painel. Na rodada passada `paridade` media os mesmos 282,6 ms e A4 ficava verde porque **ninguém alcançava o perfil**. O critério não tem cláusula "só no padrão" (A3 tem, A4 não). |
| A5 · vinheta some ao parar | 🔴 | **REGREDIU pela mesma porta.** Receita literal do §12 (andar 2 s, parar 1,5 s), teto **0,0100**: `conforto` **0,00702** ✔ · `alcance` **0,01148** ✘ · `paridade` **0,01361** ✘. A causa é aritmética e determinística: o pico andando sobe de 0,3081 para 0,5058 e 0,5405, e a taxa de decaimento é a mesma (resíduo/pico = 0,0228 · 0,0227 · 0,0252). Aos 3 s todos caem para ≤ 0,0003. Girando continuamente: pico **0,8500**, resíduo **0,01896** após 1,5 s. |
| A6 · nada além do pescoço move a vista | 🔴 | **Duas das três causas da rodada passada morreram. Sobrou uma, mais uma nova, e uma antiga.** Mortas: o corte do acumulado (§3.2 da rodada passada) e o recentrar que arrastava o jogador (§3.1). Reprova por: **(a)** o recentrar do sistema **teleporta a VISTA por exatamente um frame** — 0,7778 m a 0,78 m do centro e 1,4142 m a 1,41 m, com a trilha quadro a quadro que prova o mecanismo (§3.2); **(b)** num estado sem dreno, o mesmo recentrar dá um pulo de **5,996 m** num frame e deixa a vista **2,998 m** deslocada para sempre (§3.3); **(c)** andar fisicamente contra um sólido continua congelando a vista (defeito anterior, medido em `3cc8eea`, não re-medido aqui — o código do colisor não mudou). |

### B — Mira e empunhadura

| Critério | | Medido |
|---|:-:|---|
| B1 · arma na mão, no `gripSpace` | 🟢 | Herdado. `js/xr/xrweapon.js` e `js/xr/xrhands.js` **não aparecem no diff**. |
| B2 · 1:1 sem bob nem sway | 🟢 | Herdado, mesmo motivo. |
| B3 · dá para ver pelo buraco | 🟢 | Herdado, mesmo motivo. |
| B4 · botão de mirar não teleporta | 🟢 | Herdado, mesmo motivo. |
| B5 · segunda mão importa | ⚪ | A metade *"o recuo reduz de forma medível com duas mãos"* continua sem medida. |
| B6 · háptico em toda ação | 🟢 | **VIROU VERDE.** O sexto evento vibra. Espião no `pulse` do próprio atuador (o ponto de saída, não um registro secundário): `MP.SFX.pickup()` → **`right`, 0,450 / 40 ms**. **Calibração no mesmo instante**, porque um zero só vale se o instrumento enxerga um custo conhecido: `emitir('tiro')` → **`right`, 0,310 / 27 ms**, o mesmo par da rodada passada. 2 atuadores presentes. A decoração (`game.js:401`) está no objeto `SFX` que `js/interact.js`, `js/pickups.js` e `br-game.js:1115` compartilham. |
| B7 · o tiro sai do cano | 🔴 | Herdado do vermelho: código intocado desde `98b114f`, origem a **0,437 m (faca) a 0,910 m (bazuca)** da boca, teto 0,05 m. |

### C — Corpo, altura e escala

| Critério | | Medido |
|---|:-:|---|
| C1 · nunca enterrado | 🟢 | Receita do §12 (quadrado de 2 m a **0,5 m/s**, 1177 frames): folga **1,6986 – 1,7011 m**, amplitude 2,5 mm, janela 1,20–2,10. Ressalva que continua encolhendo a margem: em estado sem dreno, com 7,07 m de passo físico, a folga cai para **1,2440 m** perto do castelo e **1,2425 m** na cidade — dentro, com 4 cm de sobra. Era 1,2514 m na rodada passada. |
| C2 · o corpo segue a cabeça | 🔴 | **Mesma régua da rodada passada, de propósito.** Pela receita: separação **máxima 0,016 m** em 1177 frames (era 0,040). Pela cláusula *"≤ 0,10 m **em todos os frames**"*: morto, voando e pausado a separação é **3,000 m** com 3 m de passo — e agora **ilimitada**, porque `RESIDUO_MAX = 2.0` saiu do código. Registro os dois lados: **na receita, verde; no texto do critério, vermelho.** E digo o que a troca comprou: o teto que segurava a separação era exatamente o que teleportava a vista. Trocar "separação ilimitada" por "vista que teleporta" seria piorar. |
| C3 · altura do aparelho, agachar de verdade | 🟢 | Herdado (`js/xr/xrbody.js` intocado). |
| C4 · escala 1:1 em metros | ⚪ | Não medido. Quarta rodada. |
| C5 · corpo em 1ª pessoa coerente | ⚪ | Não medido. |
| C6 · o avatar que os OUTROS veem | 🟢 | Herdado no yaw. Ressalva de C2 permanece e piorou de grau: nos estados sem dreno a posição do avatar remoto diverge da cabeça sem teto. Não medi em dois clientes. |

### D — Interação com o mundo

| Critério | | Medido |
|---|:-:|---|
| D1 · toda ação alcançável pelo controle | 🔴 | **Duas das seis pendências fecharam, e eu executei as duas.** **Escolher o perfil de velocidade**: apontei o raio na linha `VELOCIDADE` e apertei o gatilho quatro vezes — `CONFORTO → ALCANCE → IGUAL AO PC → CONFORTO`, com `ultimoAcionado: 'andarPerfil'` a cada clique (§3.1). **Chat**: virou a aba `CONVERSA`, lista fechada de 8 mensagens rápidas, com teste que faz a mensagem dar a volta no servidor. Continuam sem mapeamento nenhum: **lançar granada** (`KeyG`), **usar kit médico** (`KeyQ`), **comer** (`KeyF`) e **trocar acessório de mira** (`KeyT`) — quatro da lista fechada. |
| D2 · alcance medido da cabeça | 🟢 | Vivo, a separação é **0,016 m** no pior frame da receita, e a interação só existe vivo. `js/interact.js` continua medindo de `player.pos`, e continua não custando nada por isso. |
| D3 · pegar é com a EMPUNHADURA, e perto | 🔴 | Herdado: `xrinput.js` e `xrinteract.js` intocados. Grip esquerdo = agachar, direito = mirar; pegar continua no botão de polegar com raio de metros. |
| D4 · affordance dentro do mundo | 🟢 | Herdado (`xrinteract.js` intocado). |
| D5 · veículo sem quebrar cabeça nem chão | 🟢 | Re-medida a metade que o rig novo podia ter quebrado: dentro do carro, **nenhum salto imposto** — maior deslocamento de vista num frame **0,0000 m** durante o escoamento de 3 m de passo acumulado, e 0,0432 m enquanto eu andava (que é o meu próprio passo de sonda). Não re-isolei o salto de saída, mesma ressalva das duas rodadas anteriores. |
| D6 · tudo alcançável de posição fixa | ⚪ | Não roteirizado. Quarta rodada. |

### E — Desempenho

| Critério | | Medido |
|---|:-:|---|
| E1 · 72 fps travado no aparelho | ⚪ | A metade daqui está feita: `session.frameRate` **72**, `supportedFrameRates` `[72, 80, 90, 120]`, `XRTaxa.mudancas` `[72]` (um pedido só). O resto é do aparelho. |
| E2 · orçamento em estéreo | 🔴 | `scripts/vr-emulado.js`, sessão estéreo, 12 s por pose: **menu 388 · spawn 392 · cidade 392 · castelo 430** draw calls; **1,629 M · 1,629 M · 1,289 M · 1,717 M** triângulos. Tetos 180 / 500 k → **2,2× a 2,4×** em calls e **2,6× a 3,4×** em triângulos. Melhora real: castelo **558 → 430 (−22,9 %)**, cidade 466 → 392 (−15,9 %), spawn 418 → 392, menu 420 → 388. **O "castelo 500 → 374" anunciado não reproduz nesta bancada** — ver §3.5. |
| E3 · escala de render ≥ 85 % | ⚪ | Aparelho. |
| E4 · lógica de app ≤ 2 ms | ⚪ | Aparelho. |
| E5 · térmica 30 min | ⚪ | Aparelho. |

### F — Boot e ciclo de sessão

| Critério | | Medido |
|---|:-:|---|
| F1 · 4 s até gráfico rastreado | ⚪ | Aparelho, cache frio, N ≥ 7. |
| F2 · foco perdido | 🟢 | Herdado (`xrsession.js` intocado). |
| F3 · recentrar não teleporta nem enterra | 🟢 | **VIROU VERDE, e é a maior correção da rodada.** `dev.recenter()` com o headset a **0,7778 m** do centro: jogador deslocado **0,0000 m**. A **1,4142 m**: **0,0000 m**. Teto 0,02. Era 0,7778 e 1,4142 em `3cc8eea` (38,9× e 70,7× o teto). Folga de C1 preservada (1,70 m antes e depois). **Ressalva grave, que não reprova F3 e reprova A6:** a VISTA ainda dá um pulo de um frame do tamanho do deslocamento — §3.2. |
| F4 · sair devolve o desktop intacto | 🟢 | Herdado. |
| F5 · jogável de ponta a ponta sem tirar o aparelho | 🔴 | `game.js:3234` continua `if (xrOn && !state.started && !XRUI.aberto) startGame(false)`. A aba `SALA` fechou o lobby (COMEÇAR PARTIDA para o anfitrião, lista de quem está na sala) — mas o **menu principal**, onde se escolhe SOLO × multiplayer, continua só no DOM, e `sair` do painel encerra a sessão de propósito. |

### G — Qualidade de imagem

| Critério | | Medido |
|---|:-:|---|
| G1 · foveação declarada | 🟢 | `renderer.xr.getFoveation()` = **0,2** dentro da sessão. |
| G2 · antialiasing em XR | ⚪ | `antialias: true` confirmado nos atributos do contexto; o número de amostras do alvo de render XR continua não observável no IWER. |
| G3 · escala de framebuffer declarada | 🟢 | Herdado (0,9 pelo preset). |
| G4 · texto e mira legíveis | ⚪ | Parte humana obrigatória. Texto do painel medido em **1,29°** de altura angular a 1,0040 m. |
| G5 · uma captura por entrega | ⚪ | **Nenhuma captura nova em `output/vr/` nesta rodada.** É o critério que existe justamente porque contagem não é imagem — e esta rodada mexeu no que se VÊ (far, céu, feixes) mais do que qualquer outra. |

### H — HUD e UI dentro do mundo

| Critério | | Medido |
|---|:-:|---|
| H1 · nada essencial só no DOM | 🔴 | **De ≈13 para 15 de 17.** Entraram **chat**, **placar** e **lobby**, como abas do mesmo painel (`ABAS = pausa · CONVERSA · PLACAR · SALA`), com custo medido de **zero draw call** — e o teste que mede isso tem calibração (a malha do painel some e volta, e a diferença tem que aparecer), que é o que separa um zero de uma medida cega. Faltam **minimapa** e **menu principal**. |
| H2 · UI não é colada na cara | 🟢 | **1,0040 m** do olho, **34,32°** de largura, texto **1,29°**. Idêntico às duas rodadas anteriores. |
| H3 · o retículo não mente | 🟢 | Por ausência declarada, que é a saída que o critério autoriza. |

### I — Ausência de defeito grosseiro

| Critério | | Medido |
|---|:-:|---|
| I1 · vinte minutos, 20 caixas | ⚪ | Exige um humano de headset. **Nenhuma caixa marcada. Sem elas a rodada não está validada**, independente do resto. |
| I2 · zero erro de console | 🟢 | `__game.errors`, `pageErrors` e `consoleErrors` **vazios nas seis sessões**. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | ⚪ | Não amostrado. Terceira rodada. |
| I4 · nenhum estado sem saída | ⚪ | Sem roteiro completo. Ganho verificado: a aba `SALA` e a linha `VELOCIDADE` tiraram dois becos; o menu principal continua fora. |

---

## 3. Os defeitos, com a medição que prova

### 3.1 · O que EU pedi e foi entregue certo (três, com o número)

Começo por aqui porque três das quatro correções pedidas estão medidas e boas,
e misturá-las com o que sobrou seria injusto com o trabalho.

**a) `pegar` ganhou emissor E ELE DISPARA.** Espião no `pulse` do atuador:

| Evento | Mão | Intensidade / duração |
|---|---|---|
| `tiro` (calibração) | direita | 0,310 / 27 ms |
| `emitir('pegar')` direto | direita | 0,450 / 40 ms |
| **`MP.SFX.pickup()`** (caminho de produção) | **direita** | **0,450 / 40 ms** |

Registro um erro meu: a primeira sonda leu `P_GAMEPAD.lastPulse` **sem
calibrar** e devolveu `null` nos dois lados. Eu quase reprovei B6 com um
instrumento cego — exatamente o que cobro dos outros. A leitura válida é a de
cima, com o custo conhecido visível no mesmo instante.

**b) A linha `VELOCIDADE` funciona pelo caminho do jogador.** Raio apontado na
linha + gatilho, quatro vezes, com o painel confirmando quem estava sob o
ponteiro a cada clique:

| Clique | Linha mostra | `XRAndar.plano.perfil` | andar / correr (m/s) | sob o ponteiro | `ultimoAcionado` |
|--:|---|---|--:|---|---|
| 1 | CONFORTO | `conforto` | 1,693 / 2,800 | `andarPerfil` | `andarPerfil` |
| 2 | ALCANCE | `alcance` | 3,628 / 6,000 | `andarPerfil` | `andarPerfil` |
| 3 | IGUAL AO PC | `paridade` | 5,200 / 8,600 | `andarPerfil` | `andarPerfil` |
| 4 | CONFORTO | `conforto` | 1,693 / 2,800 | `andarPerfil` | `andarPerfil` |

E persiste: `localStorage.callofai_vr` = `{"velocidade":"paridade"}`.

**A consequência de partida que eu cobrei está resolvida:** o gás fecha a
**5,50 / 4,38 / 3,46 m/s** nas três primeiras fases (`buildPlan`, `server.js`,
raios `[560, 340, 200, 110, 55, 24]`), e o jogador de headset agora alcança
**6,00 m/s** em `ALCANCE` e **8,60 m/s** em `IGUAL AO PC`. Ele consegue fugir.

**c) O passo físico, quarta versão: correto em todos os regimes.** A fórmula
`X − 2,15` sumiu. Medido com leitura de volta das bandeiras a cada regime:

| Regime | passo pedido | cabeça andou | colisor andou | acumulado | **maior salto de vista num frame, andando** | **no escoamento** |
|---|--:|--:|--:|--:|--:|--:|
| em pé (vivo) | 1,0 m | 1,000 | 0,980 | 0,020 | 0,0200 | **0,0000** |
| morto | 3,0 m | 3,000 | 0,000 | 3,000 | 0,0200 | **0,0000** |
| voando (heli) | 3,0 m | 3,000 | 0,000 | 3,000 | 0,0200 | **0,0000** |
| pausado | 3,0 m | 3,000 | 0,000 | 3,000 | 0,0200 | **0,0000** |
| dirigindo | 3,0 m | 3,429 | 6,469¹ | 3,044 | 0,0432 | **0,0000** |
| salto de rastreio | 1,442 m | 1,442 | 1,442 | 0,000 | — | **0,0000** |

¹ o carro anda sozinho; o número não isola as duas contribuições.

Os 0,0200 m de "salto andando" são **o meu próprio passo de sonda** (2 cm por
etapa), não o jogo. Na receita do §12 (0,5 m/s) o maior salto por frame é
**0,0080 m**. Comparação com a rodada passada, mesmo estado:

| | `3cc8eea` | `c070737` |
|---|--:|--:|
| Salto de vista, morto, 3 m de passo acumulado | **0,8501 m** | **0,0000 m** |
| Salto de vista, morto, 5 m | **2,8501 m** | **0,0000 m** |

O teto passou a proteger só o colisor. **Este trecho, na quarta versão, está
certo.**

---

### 3.2 · O recentrar ainda teleporta a VISTA por um frame — e a carência de três frames defende a ordem errada

O jogador não é mais movido no mundo (F3 virou verde). **A vista é**, por
exatamente um frame. A trilha quadro a quadro, com o headset a 0,78 m do
centro:

| Frame | cabeça no MUNDO | colisor | câmera (local ao rig) | rig |
|---|---|---|---|---|
| antes | (0,5500 · 3,4736) | (0,5500 · 3,4736) | (0,550 · −0,526) | (0,000 · 4,000) |
| f1 | (0,5500 · 3,4736) | (0,5500 · 3,4736) | (0,550 · −0,526) | (0,000 · 4,000) |
| **f2** | **(0,0000 · 4,0236)** | (0,5500 · 3,4736) | (0,000 · 0,024) | (0,000 · 4,000) |
| f3 | (0,5500 · 3,4736) | (0,5500 · 3,4736) | (0,000 · 0,024) | (0,550 · 3,450) |

**Deslocamento da vista no frame f2: 0,7778 m — o offset inteiro.** A 1,41 m do
centro: **1,4142 m**. Depois volta. O jogador não sai do lugar; o mundo pula e
volta.

O mecanismo está inteiro nessa tabela. Em f2 a pose nova **já chegou** na
câmera (0,000 · 0,024) e o rig **ainda não foi rebaseado** (0,000 · 4,000). O
`place()` desse frame rodou com a base velha, mediu `dx = −0,55`, `dz = +0,55`
e **contabilizou a mudança de origem como passo físico**. Só em f3 o
`pedidoRebase` foi consumido.

**A carência de três frames defende a ordem oposta à que o runtime entrega.**
O comentário em `js/xr/xrrig.js:112` afirma:

> *"O evento `reset` chega ANTES de a pose nova alcançar a câmera."*

O código do IWER 2.3.0 diz o contrário, e é literal:

```js
recenter() {
  ...
  this.position.add(deltaVec);            // a pose muda AQUI, síncrono
  ...
  this[P_DEVICE].pendingReferenceSpaceReset = true;   // o evento fica PENDENTE
}
```
(`node_modules/iwer/build/iwer.js:10579-10597`) — e o `reset` só é despachado
mais tarde, dentro de `onFrameStart` (`:10258-10269`).

Ou seja: a pose nova chega primeiro, o evento depois. A carência cobre a
latência do evento — mas o estrago já entrou pela pose. **Nenhuma quantidade
de frames de carência conserta isso**, porque o problema não é *quando* o
rebase acontece, é que o frame anterior já somou a mudança de origem no
acumulado. O que seria independente de ordem é um limite de sanidade no delta
de **um** frame dentro do `place()` (a 72 Hz, ninguém move a cabeça 78 cm em
14 ms).

**Ressalva honesta:** medido no IWER, não no aparelho. No Quest a ordem pode
ser outra — e é exatamente por isso que depender dela é o defeito.

---

### 3.3 · Rebasear joga fora o acumulado, e num estado sem dreno isso desloca a vista para sempre

Mesma sonda, com o jogador **morto** (estado sem dreno) e 3,00 m de passo
físico acumulado:

| Frame | cabeça no MUNDO | colisor |
|---|---|---|
| antes | (3,6700 · 0,3536) | (1,5500 · 2,4736) |
| f1 | (3,6700 · 0,3536) | (1,5500 · 2,4736) |
| **f2** | **(−0,5700 · 4,5936)** | (1,5500 · 2,4736) |
| f3 | (1,5500 · 2,4736) | (1,5500 · 2,4736) |
| fim | (1,5500 · 2,4736) | (1,5500 · 2,4736) |

- salto f1 → f2: **5,9963 m num frame**
- salto f2 → f3: **2,9983 m num frame**
- **deslocamento líquido da vista: 2,9981 m, permanente**

A causa é uma linha:

```js
if (pedidoRebase > 0) { pedidoRebase--; temBase = false; passoX = 0; passoZ = 0; }
```

Zerar `passoX/passoZ` é a **versão 2 do defeito do passo** ressuscitada em
lugar novo — "descartar o excedente → a cabeça é ARRASTADA de volta", que o
próprio comentário do arquivo lista como errada 40 linhas abaixo. E o
comentário do `rebasear()` justifica assim:

> *"depois de um reset o acumulado descreve um mundo que não existe mais"*

Isso não procede. O acumulado é a posição da cabeça **em relação ao colisor**,
já rodada para o mundo pelo yaw (`passoX += dx*c + dz*s`). Mudar a ORIGEM do
espaço de referência não muda onde a cabeça está em relação ao corpo. Quem
precisa de reset é a **base** (`cabecaX/cabecaZ`), não o acumulado.

Vivo, o acumulado é ~0 e nada aparece — que é por que o teste novo não vê.

---

### 3.4 · A velocidade escolhível derrubou A4 e A5

Este é o defeito que a rodada **criou por consertar outro**, e ele estava
previsto por escrito na validação anterior.

| Perfil | andar / correr | **tempo até 95 %** (teto 150 ms) | pico do túnel andando | **túnel 1,5 s depois de parar** (teto 0,0100) |
|---|--:|--:|--:|--:|
| `conforto` (padrão) | 1,693 / 2,800 | **48,0 ms** ✔ | 0,3081 | **0,00702** ✔ |
| `alcance` | 3,628 / 6,000 | **45,3 ms** ✔ | 0,5058 | **0,01148** ✘ |
| `paridade` | 5,200 / 8,600 | **281,1 ms** ✘ | 0,5405 | **0,01361** ✘ |

Duas leituras, e as duas importam:

1. **É determinístico, não é ruído.** A razão resíduo/pico é 0,0228 · 0,0227 ·
   0,0252 nos três perfis: a vinheta decai à mesma taxa, e sobe mais alto
   porque o jogador anda mais rápido. Aos 3 s todos os perfis caem para
   ≤ 0,0003.
2. **A ultrapassagem é pequena e a reprovação é literal.** 0,0136 contra
   0,0100 é 36 % acima do teto; a periferia volta inteira em ~3 s em vez de
   1,5 s. Não vou mover a régua para preservar um verde — foi o que cobrei da
   rodada passada e vale para mim.

O `paridade` existe por um motivo bom e medido (o gás), e ele traz junto a
rampa do PC (281 ms) e o fluxo óptico do PC. **Não é um erro de implementação;
é um custo que a rodada aceitou sem registrar.** O caminho que fecharia os
três ao mesmo tempo — velocidade alta *e* rampa curta *e* vinheta que zera —
é quantizar a velocidade também no perfil rápido (a receita da própria Oculus
BP citada em A4) e escalar a vinheta pela razão, não pela velocidade absoluta.

---

### 3.5 · O corte do `far`: o que ele custa é o horizonte visto de cima, e o número anunciado não reproduz

Era a mudança de maior risco da rodada. Fui atrás de todos os itens da lista.

**Draw calls (o que a mudança comprou).** `scripts/vr-emulado.js`, mesma
máquina, mesmo script, mesma seed, contra a MINHA medição de `3cc8eea`:

| Pose | `3cc8eea` | `c070737` | Δ |
|---|--:|--:|--:|
| menu | 420 | **388** | −32 |
| spawn | 418 | **392** | −26 |
| cidade | 466 | **392** | −74 |
| **castelo** | **558** | **430** | **−128 (−22,9 %)** |

**O "castelo 500 → 374" do commit não reproduz nesta bancada.** O **delta**
reproduz quase exato (−126 anunciado, −128 medido); o **absoluto** não (500 e
374 contra 558 e 430). Isso é a lição de método do repo aplicada:
número sem condição declarada não é medida. O delta é a parte defensável.

**O que sumiu da tela.** Comparei o quadro renderizado com `far = 420` contra
`far = 1020`, pixel a pixel, em seis poses:

| Pose | pixels que mudam | % do quadro | delta médio |
|---|--:|--:|--:|
| **nave do BR (250 m), olhando 35° pra baixo** | **62 897** | **13,10 %** | 30,6 |
| nave do BR (250 m), no horizonte | 43 282 | 9,02 % | 30,9 |
| **paraquedas a 120 m** | 20 945 | **4,36 %** | 31,6 |
| castelo (topo, +30 m) | 13 080 | 2,73 % | 32,4 |
| helicóptero a 60 m | 9 646 | 2,01 % | 31,2 |
| chão do spawn, no horizonte | 154 | **0,03 %** | 8,9 |

E a cor diz exatamente o que aconteceu. Na faixa onde a diferença se concentra
(y ≈ 314–375 de 600, ou seja ~30° abaixo do horizonte, onde o chão está a
~490 m de distância inclinada):

| | RGB médio dos pixels que mudam |
|---|---|
| `far = 1020` (antes) | **(185, 208, 225)** — que é o `FOG_COLOR` `#b9d1e4` = (185, 209, 228) |
| `far = 420` (agora) | **(218, 219, 219)** — céu |

Então: a afirmação do commit *"esse relevo é 100 % cor de névoa"* está
**certa** — eu confirmei que o pixel antigo era literalmente a cor da névoa. O
que o commit **não** diz é o que entra no lugar: **o céu**, 33 níveis mais
claro no vermelho e menos azul, com uma **borda dura** exatamente em 420 m,
porque a névoa satura e o recorte acontecem na mesma distância.

Consequências, na ordem em que o dono as encontra:

- **No chão, é invisível** (0,03 % do quadro). Aqui o commit está certo.
- **Do ar, não é.** Na nave do BR — a primeira tela de toda partida de BR —
  **13 % do quadro** troca parede-de-névoa por céu, e a paisagem distante
  deixa de existir como silhueta. De paraquedas, 4,4 %. Do alto do castelo,
  2,7 %.
- **Nenhuma informação de jogo se perde**: o que sumiu já era 100 % névoa, e
  o mapa inteiro tem 1100 m contra os 337 m de raio de chão que a nave enxerga
  com far 420 — mas ela já enxergava só isso com utilidade antes.

**O que NÃO quebrou** (procurei item por item):

| Suspeita | Medido |
|---|---|
| Feixes de findability somem | Não somem. `test/world-drawcalls.test.js:504` renderiza a 600 m e conta pixels — teste de verdade, com o guarda `dist > far`. Os dois faróis custam ≤ 2 draw calls mono. |
| Céu some | Não. `sky.scale.setScalar(45000)` com o addon `Sky`, que prende `gl_Position.z = gl_Position.w`: imune ao far. |
| Z-fighting novo | **Melhorou.** A razão `far/near` caiu de **12 750** para **5 250**; sem `logarithmicDepthBuffer`, menos alcance = mais precisão. |
| Outro escritor de `camera.far` | Nenhum. `grep camera.far` no repo: só o construtor. O `resize` não toca. |
| Celular | `applyMobileCfg` roda antes (`game.js:305`), então `VIEW_DIST = 300` vira far **e** fog far: a relação se mantém. |
| Sombra (CSM) | Independente: `maxFar` é 90/60 por preset, não deriva do far da câmera. |
| Contrato do `Math.random` seedado | **Intacto.** `criarFarol` é chamado de dentro do `noSeed` nas duas casas (`js/maptoys.js:286`, `js/secrets.js:85`), como o cabeçalho do módulo manda. Verifiquei os dois sítios. |
| Marcadores / projéteis / cinemática da cidade / alvo do canhão | Todos dentro dos 420 m nas poses de jogo. A varredura da cena por esfera envolvente na pose de castelo achou 392 malhas além do far — todas anônimas de terreno/cenário distante, nenhuma com `farbeacon`. |

---

### 3.6 · As estrelas a 300 m: melhora grande, medida, e sem estrela atravessando nada

A/B na mesma sessão, mesma câmera, mesmo horário forçado (opacidade 0,9),
contando **pixels de estrela pintados** (com o domo visível menos sem ele):

| Pose | **hoje** (300 m, far 420) | **antes** (1500 m, far 1020) | hoje sem `depthTest` | antes sem `depthTest` |
|---|--:|--:|--:|--:|
| spawn, +40° | **684** | 6 | 1065 | 20 |
| spawn, +15° | **314** | 8 | 601 | 8 |
| spawn, +5° | **226** | 9 | 506 | 17 |
| castelo, +25° | **89** | 0 | 870 | 0 |
| nave do BR (250 m), +20° | **721** | 9 | 721 | 9 |

O céu noturno estava mesmo praticamente apagado, e voltou. Os números exatos
do commit (46 contra 1082) não são os meus (6 contra 684 no melhor caso), mas
a ordem de grandeza e a direção são as mesmas.

Fui atrás dos dois riscos que o corte poderia ter criado:

- **Estrela atravessando geometria: impossível.** `depthWrite: false` com
  `depthTest: true` — a estrela nunca desenha na frente do que está mais perto.
- **Estrela sumindo atrás de relevo: acontece, e é geometricamente certo, e
  não é novo.** No spawn a 40°, 684 de 1065 pixels (36 % oclusos, e o que
  oclui a 40° de elevação são as árvores do acampamento). No castelo, 89 de
  870 (90 %, e quem oclui é a própria torre). **Na configuração antiga a
  oclusão era a mesma proporção** (6 de 20 = 70 %) — o que mudou não foi a
  oclusão, foi o recorte.
- **Do ar não há oclusão nenhuma**: 721 = 721 na nave do BR.
- Raio real do domo: **300 a 324 m** (o `randomDirection()` deixa de ser
  unitário depois do `if (v.y < 0.06) v.y = Math.abs(v.y) + 0.08`). Cabe nos
  420 com folga. Nenhuma das 520 estrelas abaixo do horizonte.

**Um defeito de VR que o corte NÃO criou mas que agora fica exposto**, e que
registro porque a próxima rodada vai encostar nele: `js/env.js:133` faz
`stars.position.copy(camera.position)`. **Em XR `camera.position` é a pose da
cabeça RELATIVA AO RIG, não a posição de mundo** — é a armadilha nominal do
CLAUDE.md, a mesma que já custou o "pra frente vai pra trás" no `br-game.js`.
Dentro da sessão o domo é plantado a um ou dois metros da **origem do mundo**,
não em volta do jogador. Com raio 1500 e far 1020 isso não aparecia porque
nada aparecia; com raio 300 o domo passa a ser um objeto real no mundo, e a
partir de umas centenas de metros da origem ele sai do campo. Não medi o
efeito em sessão — registro o mecanismo, com o arquivo e a linha.

---

## 4. O que EU tinha reprovado e está resolvido, com o número

| Defeito da rodada passada | Estado | Medido agora |
|---|---|---|
| §3.1 recentrar arrasta o jogador (0,7778 / 1,4142 m) | **RESOLVIDO na metade que o critério cobra** | Jogador deslocado **0,0000 m** nos dois casos. A vista ainda pula um frame (§3.2). |
| §3.2 o teto do acumulado teleporta a vista (`X − 2,15`) | **RESOLVIDO** | Morto com 3 m: **0,0000 m** (era 0,8501). Com 5 m: **0,0000 m** (era 2,8501). Em todos os cinco regimes. |
| §3.4 os três perfis de velocidade sem como escolher | **RESOLVIDO** | Linha `VELOCIDADE` no painel, ciclada pelo raio + gatilho, `ultimoAcionado: 'andarPerfil'`, persistida. `ALCANCE` 6,00 m/s > gás de 5,50. **E cobrou A4 e A5 (§3.4).** |
| §3.5 `'pegar'` é plano de háptico sem emissor | **RESOLVIDO** | `MP.SFX.pickup()` → `right 0,450 / 40 ms`, com calibração no mesmo instante. |
| §3.3 andar contra sólido congela a vista | **NÃO TOCADO** | Código do colisor intocado; não re-medi. |

Quatro de cinco, e todas com número. É a melhor taxa de fechamento das quatro
rodadas.

---

## 5. Testes que não podem falhar (os quatro arquivos que o pedido nomeou)

Auditei `xr-social`, `xr-ui`, `world-drawcalls` e `xr-locomotion`, mais os dois
que mudaram (`xr-rig`, `xr-body`).

**Primeiro o elogio, porque ele é técnico:** `test/xr-social.test.js` é o
**melhor arquivo de teste desta frente até hoje**. Ele calibra antes de
afirmar ("a malha do painel some e volta, e a diferença tem que aparecer";
"a zona não estava realçada quando a mão apontava — a medida está cega"), lê o
efeito por um caminho independente do que ele aciona (`estadoUi().ultimoAcionado`
contra `soc.aba`), aciona com raio e gatilho de verdade, e cobre o
anti-cheat (posição não vaza para o placar). É o padrão que o resto da frente
devia copiar. E `test/xr-body.test.js` finalmente **chama `dev.recenter()`** —
o buraco de instrumento que eu abri na rodada passada foi fechado.

O que achei mesmo assim, em ordem de gravidade:

1. **`test/xr-rig.test.js` · "REBASEAR (recentrar) não gera passo nenhum"** —
   **este teste encoda a suposição errada e por isso não pode pegar o defeito
   que sobrou.** Ele faz `xr.rebasear()` e **só depois** move a câmera para a
   pose nova: é a ordem *evento antes da pose*. O runtime entrega a ordem
   oposta (§3.2), e nessa ordem o teste passaria igual. O defeito mora
   exatamente no frame que este teste não simula.

2. **`test/xr-body.test.js` · os dois casos de `recenter`** — medem
   `MP.player.pos` e mais nada. **Não existe uma leitura da posição de mundo da
   câmera neste arquivo.** É o mesmo diagnóstico que fiz de `xr-rig.test.js` na
   rodada passada ("mede `passoPendente`, nunca a posição de mundo da câmera"),
   agora em arquivo novo: o teste protege metade do que o nome dele promete, e
   a metade que falta é a que reprova A6.

3. **`test/xr-locomotion.test.js:577` · "acionar a linha CICLA o perfil"** —
   a linha é `G.XRUI.acionarPorId ? G.XRUI.acionarPorId('andarPerfil') :
   G.XRAndar.proximo()`. **`acionarPorId` não existe em lugar nenhum do repo**
   (`grep` devolve só esta linha). O ramo que roda é SEMPRE o `else`, que chama
   o módulo direto. O teste nunca encosta no painel: apagar
   `if (l.id === 'andarPerfil') { … andar.proximo() }` de `js/xr/xrui.js:545` e
   a suíte continua verde. É o irmão exato do *"trocar para IGUAL AO PC devolve
   8,60 m/s"* que apontei na rodada passada — o teste é o único chamador. **A
   fiação funciona (eu medi, §3.1), mas quem prova isso sou eu, não a suíte.**

4. **`test/world-drawcalls.test.js` · "todas as estrelas ficam DENTRO do
   alcance da câmera"** (`maxR < far`) e **"ficam FORA da névoa mais densa"**
   (`far <= fogFar + 1`) — comparam duas constantes do próprio repo. Travam
   decisão, não pegam defeito; e nenhum dos dois olha um pixel, que é onde a
   mudança das estrelas vive. O teste de pixel que faltaria é o A/B que eu fiz
   em §3.6.

5. **Nada, em nenhum arquivo, mede o horizonte.** A mudança de maior risco da
   rodada (§3.5) — 13 % do quadro na pose que todo jogador de BR vê primeiro —
   entrou sem uma linha de cobertura. `test/world-drawcalls.test.js:504` prova
   que o **feixe** sobrevive ao far curto; ninguém prova o que acontece com o
   **chão**.

6. Continuam de pé, das rodadas anteriores: `xr-hud.test.js` (`grausTexto >=
   0.7`, `anguloEncara <= 12`), `xr-quality.test.js` (guardas de constante),
   `xr-turn.test.js` ("girar não arrasta a cabeça" com o headset na origem,
   que é tautologia), e a confusão de nomes entre o **botão RECENTRAR do
   painel** (`xr-ui.test.js:314`, que passa e está certo — o botão só zera o
   yaw e replanta o rig) e o **recentrar do sistema**, que é o que reprova.

---

## 6. Interação entre frentes — o que procurei e o que achei

| Suspeita | Medido |
|---|---|
| O corte do far quebra o worldgen (`Math.random` seedado) | **Não quebra.** `criarFarol` roda dentro do `noSeed` nas duas casas; verifiquei `js/maptoys.js:286` e `js/secrets.js:85`. As estrelas trocam só o multiplicador — mesmo laço, mesmo `randomDirection()`. |
| As abas sociais comem o clique do painel de pausa | **Não comem, e há teste com calibração.** Na aba `pausa` o corpo é do painel; na aba social o corpo inteiro é do módulo (senão `RETOMAR`/`SAIR` ficariam acionáveis por baixo do placar). Morrer com o placar aberto devolve a aba `PAUSA`. |
| As abas custam draw call | **Zero**, medido por diferença pareada com custo conhecido no mesmo instante. O painel inteiro continua custando 2–4. |
| Os alimentadores de chat/placar não chegam a ser ligados | **Chegam.** `__mpSocket` é atribuído em `game.js:226` com `await` de topo de módulo, antes do `if (__mpSocket)` de `game.js:2911`. |
| O placar vaza posição (wallhack) | Não vaza: lista branca em `sanear`, e há teste cravando. |
| A velocidade nova mexe na vinheta | **Mexe, e para pior** — é o §3.4. |
| O far novo muda a sombra | Não: `csm.maxFar` é 90/60 por preset, independente. |
| O far novo muda o celular | Muda junto e coerente: `VIEW_DIST` 300 vira far **e** fog far. |
| Regressão de PC pelo far/estrelas | **No chão, 0,03 % do quadro** (invisível). O céu noturno **melhora** no monitor tanto quanto no headset. A precisão do z **melhora** (razão far/near 12 750 → 5 250). |

---

## 7. Comentários que agora mentem (e neste repo isso é dívida, não estética)

Três, e os três estão em arquivos cujo próprio cabeçalho diz que a versão
anterior custou caro:

1. **`js/xr/xrrig.js:145-157`** — o docblock de `PASSO_MAX` ainda diz *"por que
   DESCARTAR o excedente em vez de represá-lo"* e *"Descartar o excedente é a
   escolha certa"*. O código 10 linhas abaixo **não descarta mais** (subtrai só
   o entregue) e o comentário DELE lista "descartar" como a versão 2 errada. O
   mesmo parágrafo ainda diz *"Recentrar não é andar… o teto distingue"* —
   quem distingue agora é `rebasear()`.
2. **`js/xr/xrrig.js:112`** — *"O evento `reset` chega ANTES de a pose nova
   alcançar a câmera"*. Medido: chega depois (§3.2).
3. **`js/amb.js:150`** — *"Como o `camera.far` é VIEW_DIST + 600, elas
   continuam sendo desenhadas do outro lado do mapa"*. Não é mais.

---

## 8. Os três critérios mais longe do aceite

1. **E2 · orçamento de submissão em estéreo** — 388 a 430 draw calls contra
   180; 1,29 a 1,72 M triângulos contra 500 k. Continua sendo o único a um
   fator ~2,4× em calls e ~3,4× em triângulos, e o único cuja correção não cabe
   em ajuste. Esta rodada tirou 128 calls do castelo com a maior alavanca
   disponível (o far), e ainda faltam **250**. É o item que não fecha sem mudar
   como o mundo é montado.
2. **F5 · jogável de ponta a ponta sem tirar o aparelho** — o lobby entrou
   (aba `SALA`), o chat entrou, o placar entrou. Falta o **menu principal**, e
   com ele H1 (2 dos 17) e I4. `startGame(false)` continua sendo a única
   entrada. Encolheu de "fase inteira" para "uma tela".
3. **A6 · nada além do pescoço move a vista** — quarta rodada, quarta causa
   diferente. As duas de agora (§3.2 e §3.3) são a **mesma linha de código**, e
   é uma linha, não um projeto.

Menção obrigatória porque é novo e tem consequência de jogo: **A4 e A5**, que
caíram por causa de uma correção pedida por mim. Não é motivo para desfazer a
correção — é motivo para a próxima rodada tratar o perfil rápido como um
perfil de **conforto diferente**, não como o perfil de PC transplantado.

---

## 9. O que ficou NÃO MEDIDO (e por quê)

- **E1 (tempo), E3, E4, E5, F1** — só existem no aparelho. Não rodei o passo 4.
- **I1 (as 20 caixas), G4** — exigem um humano de headset. **Sem as 20 caixas
  a rodada não está validada**, mesmo com tudo o mais verde.
- **G5** — nenhuma captura estéreo gerada nesta rodada, por ninguém. É a
  quarta rodada sem, e é a rodada que mais mexeu no que se vê.
- **C4 (escala em metros), C5 (corpo em 1ª pessoa), D6, I3** — cabiam e
  ficaram de fora por orçamento de sessão. Quarta rodada para C4/C5/D6.
- **B5 segunda metade** (recuo reduz com duas mãos) — continua sem medida.
- **G2 (4× MSAA no alvo XR)** — o IWER não expõe o framebuffer real.
- **B1/B2/B3/B4, C3, D3, D4, F2, F4, G3, A2** — não re-medidos; os módulos
  (`xrweapon`, `xrhands`, `xrbody`, `xrinteract`, `xrinput`, `xrturn`,
  `xrcomfort`, `xrquality`, `xrsession`) **não aparecem no diff**
  `3cc8eea..c070737`. Está escrito em cada linha.
- **A6 (c)**, a parede que congela a vista — não re-medida; código intocado.
- **`npm test`** — proibido. `npm run lint` limpo, rodado.

---

## 10. Se o dono puser o headset agora, o que ele reclama primeiro

1. **"Agora dá pra correr."** No primeiro menu de pausa. A linha `VELOCIDADE`
   está lá, cicla nos três perfis com o gatilho, e o `IGUAL AO PC` devolve 8,60
   m/s. A queixa nº 3 da rodada passada — não conseguir fugir do gás — acabou.
   E ele **sente o item entrar na mão**: `pegar` vibra.
2. **"O mundo deu um tranco."** Quando ele apertar o recentrar do sistema, que
   é o primeiro gesto de quem põe o aparelho. Ele **não é mais teleportado**
   (essa era a queixa nº 2 e ela morreu), mas a vista pisca 0,78 a 1,41 m e
   volta, num frame. Se ele estiver morto ou pausado e tiver andado pelo
   quarto, o tranco é de **6 m** e a vista fica **3 m fora do lugar**.
3. **"Cadê o chão lá longe?"** Assim que a nave do BR abrir. Do alto, **13 % do
   quadro** trocou a parede de névoa por céu, com uma borda dura a 420 m. Não
   perde informação nenhuma — perde a paisagem.
4. **"Voltou a ter estrela."** À noite. Esta é boa e é grande: **6 → 684**
   pixels de estrela no spawn olhando pra cima.
5. **"Encostei na parede e o mundo parou."** Andando fisicamente contra
   qualquer sólido: 3 m no quarto viram 0,56 m no jogo, sem aviso. Não mexeram
   nisso e eu avisei na rodada passada.
6. **"Por que a vinheta demora a abrir agora?"** Só se ele escolher `ALCANCE`
   ou `IGUAL AO PC` — que é justamente o que ele vai escolher para fugir do
   gás. 0,0115 e 0,0136 contra 0,0100, aberta por completo só aos 3 s.
7. **"Continua tremendo"** (388–430 draw calls, 1,29–1,72 M triângulos) e
   **"cadê o menu?"** (entrar em VR ainda cai direto em partida; o lobby existe,
   o menu principal não).

O que ele **não** vai reclamar, e vale registrar: **não morre com o mundo
congelado**, **não é arrastado ao recentrar**, **conversa, vê o placar e entra
na sala sem tirar o aparelho**, **pula da nave, abre o paraquedas, abre baú e
alcança as oito armas**, e **o monitor continua intacto** — e agora com o céu
noturno de volta lá também.

---

## 11. Quanto falta para "ausência de defeito"

**O denominador honesto continua sendo 39, não 47.** Oito critérios não podem
ser certificados deste assento em nenhuma rodada: E1 (tempo), E3, E4, E5 e F1
exigem o aparelho; I1, G4 e G5 exigem um humano de headset. Dos 39,
**22 estão verdes (56 %)**, 10 vermelhos e **7 mediveis que eu ainda não medi**
(B5, C4, C5, D6, G2, I3, I4).

**A trajetória, com a leitura que o número sozinho esconde:**

| Rodada | 🟢 | 🔴 | defeitos NOVOS introduzidos | quantos nasceram de uma correção |
|---|--:|--:|--:|--:|
| `98b114f` | 14 | 19 | — | — |
| `bbe6b48` | 19 | 14 | 5 | ? |
| `3cc8eea` | 22 | 10 | 3 | 2 |
| **`c070737`** | **22** | **10** | **2** | **2** |

A taxa de defeito novo caiu 5 → 3 → **2**. Mas **os dois desta rodada nasceram
de correções**, e essa é a quarta vez seguida. A diferença desta rodada é que
**eu tinha previsto os dois por escrito**, o que é a primeira vez que isso
acontece — e é o sinal de que o modelo do sistema finalmente está fechando.

**Do que ainda falta, por natureza do trabalho:**

- **Três vermelhos são UMA LINHA cada, e as três estão medidas.**
  **A6/§3.3**: apagar `passoX = 0; passoZ = 0;` do `pedidoRebase` — o
  acumulado é a posição da cabeça em relação ao corpo e um reset de origem não
  o invalida. **A6/§3.2**: um limite de sanidade no delta de um frame dentro do
  `place()`, que é independente da ordem de entrega (a carência não é). **A4 +
  A5**: quantizar a velocidade no perfil rápido e escalar a vinheta pela razão
  velocidade/corrida em vez do absoluto. **Horas, não semanas.**
- **Três vermelhos são desenho que ainda não foi feito.** `D3` (verbo de
  agarrar no grip), `B7` (origem do tiro na boca do cano) e metade de `D1`
  (quatro verbos sem botão num Touch que acabou — é decidir um menu radial ou
  um gesto, não mapear tecla).
- **Dois vermelhos são fase.** `F5` + `H1` encolheram de cinco telas para
  **duas** (menu principal e minimapa) — é a única frente que andou de verdade
  em três rodadas seguidas. `E2` continua sendo o único que não sabemos se
  **cabe**: mesmo a maior alavanca disponível (o far) rendeu −128 de 250 que
  faltam.
- **`C2` é uma decisão, não um conserto.** Ou o critério ganha a cláusula "nos
  estados em que o colisor pode seguir", ou o jogo aceita mover o corpo do
  morto. Reprovar sem dizer isso seria esconder que a alternativa é pior.

**E o dado que mais importa para "quanto falta", que não é percentual:** os
dois defeitos que sobraram moram, de novo, **exatamente onde a suíte não
olha** — nenhum teste do repo lê a posição de mundo da câmera durante um
`recenter`, e o teste que existe simula a ordem de eventos oposta à real. A
rodada passada fechou o buraco de *chamar* `recenter()`. A próxima precisa
fechar o de *medir a vista*.

**Resumo em uma frase:** o placar empatou em 22 de 39, mas o 22 de agora é
honesto e o de antes não era — quatro dos cinco defeitos que eu apontei
fecharam com número, os dois que sobraram são uma linha de código cada, e o
que separa esta frente de "ausência de defeito" deixou de ser uma lista de
bugs e passou a ser **uma tela (o menu), um orçamento (E2) e um instrumento
(a vista durante o recentrar)**.

---

*Reprodução: cópia isolada por `git archive c070737`, `node scripts/vr-emulado.js
--port=3480 --seconds=12`, e sondas em `test/helpers/iwer.js` → `bootEmVR` nas
portas 3481–3487. Nenhum arquivo do repo foi alterado além deste.*
