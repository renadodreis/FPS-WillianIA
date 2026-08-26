# Validação da rodada — commit `bbe6b48`

Data: 2026-08-26 · branch `dev` · three r0.185.1 · IWER 2.3.0
Autor: o **validador**. Executa o procedimento da §12 de `criterio-aaa.md`.
Não escreve código, não escreve teste. Escreve o que reprova.

> **Veredito: RODADA DEVOLVIDA.** 19 critérios verdes, 14 vermelhos, 14 não
> medidos. A regra do documento não admite média: um vermelho devolve.
>
> A rodada é a de maior avanço até aqui — **cinco critérios saíram do vermelho**
> (A2, C2, C6, F2, H2) e nenhum verde caiu. Três dos seis defeitos que devolvi
> na rodada passada estão **medidos como resolvidos** (§3.1 preset, §3.2 arma
> some no ADS, §3.6 yaw do BR), e um quarto (§3.5 passo represado) também.
>
> O que devolve a rodada, além dos 14 vermelhos herdados, são **três defeitos
> novos nascidos das próprias correções** (§3.1, §3.2, §3.3 abaixo) — sendo um
> deles uma **regressão de comportamento**: o rastreamento posicional da cabeça,
> que funcionava, parou de funcionar no estado MORTO.
>
> E uma **retratação minha**: o defeito §3.4 da rodada passada ("andar de
> verdade atravessa parede") foi provado com um método que **não vale**. Ver §5.

---

## 0. Condição da medição (sem isto não é medida)

- Máquina ociosa: `load average 0,23` no início da bateria (14:01 → 1,40 no
  fim, com outras duas frentes rodando).
- `git log -1` = `bbe6b48`. **Árvore de arquivos rastreados intacta em
  `bbe6b48` durante toda a janela de medição (13:40 → 14:00).**
- **Contaminação por outras frentes: verificada e descartada.** As duas frentes
  paralelas criaram arquivos NÃO rastreados (`js/xr/xrhaptics.js` 14:00:29,
  `js/xr/xrframerate.js`, `test/xr-haptics.test.js`, `test/xr-framerate.test.js`,
  `test/world-drawcalls.test.js`, `docs/vr/referencia-tato-sessao.md`) e
  modificaram `js/scenery.js` (**14:00:39**) e `js/amb.js` (**14:00:59**) —
  **depois** de todas as medições deste documento. A medição de E2, a única que
  depende desses dois módulos, saiu às **13:50:47** (`output/vr/emulado.json`).
  `game.js` não importa nenhum dos arquivos novos neste commit.
- Sessão `immersive-vr` **real**, runtime IWER 2.3.0 preset Meta Quest 3,
  Chrome com GPU real, servidor local, `test/helpers/iwer.js → bootEmVR`,
  `XR.presenting === true` confirmado em todas as sondas.
- **Nove sessões independentes**, portas 3480 / 3481 / 3482 / 3483 / 3484 /
  3485 / 3486 / 3487 / 3488 / 3489 (faixa combinada com as outras frentes).
  Sondas descartáveis no scratchpad; **nada foi editado no produto nem nos
  testes**.
- **Não rodei `npm test`** (proibido nesta rodada). Rodei `npm run lint`:
  **limpo**.
- O que só existe no aparelho (E1 tempo, E3, E4, E5, F1) e o que só existe com
  um humano de headset (I1, G4, G5) está marcado **NÃO MEDIDO**, não "aprovado".

---

## 1. Placar por categoria

| Categoria | Verde | Vermelho | Não medido | Antes (98b114f) |
|---|--:|--:|--:|---|
| A — Giro e locomoção | 2 | 4 | 0 | 1 / 5 / 0 |
| B — Mira e empunhadura | 4 | 2 | 1 | 4 / 2 / 1 |
| C — Corpo, altura, escala | 4 | 0 | 2 | 2 / 2 / 2 |
| D — Interação com o mundo | 3 | 2 | 1 | 3 / 2 / 1 |
| E — Desempenho | 0 | 2 | 3 | 0 / 2 / 3 |
| F — Boot e ciclo de sessão | 1 | 3 | 1 | 0 / 4 / 1 |
| G — Qualidade de imagem | 2 | 0 | 3 | 2 / 0 / 3 |
| H — HUD e UI no mundo | 2 | 1 | 0 | 1 / 1 / 1 |
| I — Ausência de defeito grosseiro | 1 | 0 | 3 | 1 / 1 / 2 |
| **Total (47)** | **19** | **14** | **14** | **14 / 19 / 14** |

**Virou verde:** A2 · C2 · C6 · F2 · H2.
**Continua vermelho:** A3 · A4 · A5 · A6 · B6 · B7 · D1 · D3 · E1 · E2 · F3 ·
F4 · F5 · H1 — mas **A6 e F4 mudaram de CAUSA**: a causa antiga foi consertada
e uma nova nasceu no lugar (§3.1 e §3.2).
**Regrediu (comportamento, não placar):** o rastreamento posicional da cabeça no
estado MORTO. Ver §3.2 — é a pior notícia da rodada.

Números centrais:

| Grandeza | 98b114f | Agora (bbe6b48) | Alvo |
|---|--:|--:|---|
| Preset de qualidade ao SAIR da sessão | **não restaura** | cascatas `[t,t,t,t]`, maxFar **160**, `dentro=false` | restaura |
| Erro do yaw entregue ao BR | 164,5° | **0,000°** | ≤ 0,5° |
| Mirar (`mirando`) e arma sumir (`naCara`) coexistem? | **sim**, em 6 cm | **não** — `naCara` só abaixo de 0,12 m, ADS só acima de 0,14 m | nunca |
| Separação cabeça↔colisor, morto | 1,200 m | **0,000 m** | ≤ 0,10 |
| Separação cabeça↔colisor, dirigindo | 1,005 m | **0,008 m** | ≤ 0,10 |
| Separação andando 1,442 m (72 passos de 2 cm) | — | **máx 0,040 · final 0,000 m** | ≤ 0,10 |
| **Cabeça anda no mundo (MORTO), passo físico de 0,80 m** | **0,80 m** ✔ | **0,000 m** ✘ | 0,80 m |
| Recentrar → jogador deslocado | 0,594–0,721 m | **0,150 m** | ≤ 0,02 |
| Recentrar → salto da VISTA num frame | não medido | **0,630 m** | 0 |
| Pausa + andar 1 m + retomar → salto da VISTA | não medido | **0,850 m** | 0 |
| Pausa por perda de foco (`visible-blurred`/`hidden`) | `paused=false` | **`paused=true`** | true |
| Painel/menu dentro do headset | não existe | **existe**, 1,004 m, 34,3°×26,1° | existe |
| Itens de HUD no mundo (lista fechada de 17) | **0** | **≈ 11** | 17 |
| Escolha do giro DENTRO do headset | não existe | **existe e persiste**; 30/45/60/90 com erro 0,000° | existe |
| Draw calls / triângulos em estéreo | 498–790 / 1,50–1,63 M | **437–730 / 1,32–1,87 M** | ≤ 180 / ≤ 500 k |
| Custo dos 28 inimigos (estéreo, spawn) | ~78 | **12** draw calls | — |
| Háptico: chamadas no repositório | 0 | **0** | ≥ 1 por tiro |
| `updateTargetFrameRate` | nunca chamado | **nunca chamado** | 72 declarado |
| Velocidade caminhada / corrida | 5,2 / 8,6 m/s | **5,20 / 8,60 m/s** | ≤ 2,0 / ≤ 4,0 |
| Tempo até 95 % da velocidade | 0,30 s | **0,302 s** | ≤ 0,15 |
| Vinheta 1,5 s depois de parar | 0,0137 | **0,01372** | ≤ 0,0100 |
| **Painel de VR sobra no DESKTOP depois de sair** | não existia | **sim, desenhado por cima de tudo** | não |

---

## 2. Critério a critério

Legenda: 🟢 aprova · 🔴 reprova · ⚪ não medido.

### A — Giro e locomoção

| # | Veredito | Medido |
|---|---|---|
| A1 · giro não translada a cabeça | 🟢 | **0,0000 m** em 6 casos (2 modos × 3 deslocamentos: 0,71 m, 2,0 m, 1,4 m), com o teto novo de passo no caminho. Yaw aplicado −45,00° (passos) e −119,6° (suave). O pivô na cabeça sobreviveu à mudança do `consumirPasso`. |
| A2 · passo é escolha do jogador | 🟢 | **Virou verde.** O painel oferece GIRO (SUAVE/EM PASSOS), ÂNGULO DO PASSO (−/+ 5°) e VELOCIDADE DO GIRO (−/+ 15°/s), **dentro do headset**. Medido com o gatilho de verdade apontando o raio na zona "+": velocidade **195 → 210 °/s**; alternância de modo funciona; persiste em `localStorage`. Passo aplicado: **30 → 30,000° · 45 → 45,000° · 60 → 60,000° · 90 → 90,000°**, erro 0,000° (teto ± 0,5°). |
| A3 · velocidade humana | 🔴 | **5,200 m/s andando, 8,600 m/s correndo.** Idêntico às duas rodadas anteriores. Teto 2,0 / 4,0. Nada mudou. |
| A4 · aceleração instantânea | 🔴 | **302 ms** até 95 % (teto 150 ms), rampa visível: 2,25 → 3,49 → 4,22 → 4,63 → 4,87 → 5,01 → … → 5,19 m/s em amostras de 50 ms. Nada mudou. |
| A5 · vinheta some ao parar | 🔴 | Receita do §12 (andar 2 s, parar 1,5 s): **0,01372** contra teto 0,0100 — 1,37× o teto, idêntico à rodada passada. Zera em 3 s (0,00030) e 5 s (0,0000018). A **segunda metade do critério passou**: a vinheta agora é desligável no headset (medido: `prefs.vinheta` true → false pelo gatilho real, e o wiring chama `XR.conforto.soltar()`). O giro contínuo padrão a 180 °/s ainda leva o túnel a **0,8499 de pico**. |
| A6 · nada além do pescoço move a vista | 🔴 | **A causa antiga morreu; nasceu outra pior.** O yaw agora está certo: `G.yawDaVista()` bate com o yaw de mundo com **erro 0,000°** (a leitura local que estava no `br-game.js` daria **118,69°** de erro na mesma sessão), e `br-game.js` não tem **nenhuma** leitura de `camera.quaternion` sobrando. Reprova pelo novo: **no estado MORTO a vista CONGELA.** Passo físico de 0,80 m → cabeça andou **0,800 m vivo** e **0,000 m morto**, mesma sessão, mesmo método. Dirigindo: 0,242 m de 0,800 m (29 % de resposta). O Oculus BP e a lista da Meta proíbem nominalmente *"ignorar ou sobrescrever o movimento da cabeça"*, e a VRC.Quest.Functional.5 (obrigatória) exige resposta ao rastreamento **posicional**. Ver §3.2. |

### B — Mira e empunhadura

| # | Veredito | Medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | 🟢 | Não re-medido em milímetros nesta rodada (o diff de `xrweapon.js` mexe só em `RECUO_MIN` e acrescenta `JANELAS_SEPARADAS`). Evidência indireta forte da malha fechada do ADS: mover o controle para pedir recuo 0,145 / 0,160 / 0,190 / 0,250 / 0,350 / 0,450 devolveu **exatamente** 0,145 / 0,160 / 0,190 / 0,250 / 0,350 / 0,450 e desvio **0,0000** — a arma é rígida na mão. |
| B2 · 1:1 sem bob nem sway | 🟢 | Mesma evidência: recuo pedido = recuo medido em 4 casas decimais, sem suavização visível na convergência. |
| B3 · dá para ver pelo buraco | 🟢 | Mantido, e agora **utilizável**: com desvio 0,0000 o ADS acende a partir de 0,14 m e satura em 0,19 m com a **arma visível**. Era exatamente aqui que a rodada passada reprovava. |
| B4 · botão de mirar não teleporta | 🟢 | Inalterado no código; a geometria continua sendo quem manda. |
| B5 · segunda mão importa | ⚪ | Metade medida na rodada passada (histerese 0,20/0,32 m, correção de 20,27°); a metade "o recuo reduz de forma medível com duas mãos" continua **não medida**. Não reporto número que não medi. |
| B6 · háptico em toda ação | 🔴 | **Zero** ocorrências de `hapticActuators`/`pulse(` em `js/`, `game.js` e `br-game.js` neste commit (o único casamento do grep é `applyImpulse` em `js/grenades.js`). Dois atuadores disponíveis. Inalterado — há uma frente construindo `js/xr/xrhaptics.js` agora, **fora deste commit**. |
| B7 · o tiro sai do cano | 🔴 | Código intocado desde `98b114f`: origem do tiro a **0,437 m (faca) a 0,910 m (bazuca)** da boca do cano, teto 0,05 m. Encostar o cano numa quina continua atirando de dentro da quina. |

### C — Corpo, altura e escala

| # | Veredito | Medido |
|---|---|---|
| C1 · nunca enterrado | 🟢 | **Ampliado para onde faltava.** Quadrado de 2 m, 25 amostras: **1,600 m constante, amplitude 0,000 m** na CIDADE (`Structures.heliSpot`) e no CASTELO (`Structures.FORT_POS`) — os dois lugares que a rodada passada declarou não visitados. Janela do critério 1,20–2,10. Honestidade que se mantém: a folga é constante **por construção**, porque a cabeça é fixada em XZ sobre o colisor. |
| C2 · o corpo segue a cabeça | 🟢 | **Virou verde.** Passo realista (1,442 m em 72 incrementos de 2 cm, o que um humano faz): colisor andou **1,442 m**, cabeça **1,442 m**, separação **máxima 0,040 m**, média 0,026 m, final 0,000 m — teto 0,10 m. Morto: separação **0,000 m** (era 1,200 m). Dirigindo: **0,008 m** (era 1,005 m). O §3.5 da rodada passada (passo represado que volta de uma vez) está **resolvido**. **A cláusula da parede fica NÃO MEDIDA** — meu método da rodada passada não vale; ver §5. |
| C3 · altura do aparelho, agachar de verdade | 🟢 | Não re-medido (código intocado). Verde herdado de `98b114f`: 0,600 m exatos de descida do olho, `crouchT` 0→1. |
| C4 · escala 1:1 em metros | ⚪ | Não medido. |
| C5 · corpo em 1ª pessoa coerente | ⚪ | Não medido. |
| C6 · o avatar que os OUTROS veem | 🟢 | **Virou verde no yaw.** `br-game.js:1878` agora envia `rotY = G.yawDaVista()`, e `yawDaVista()` bate com o yaw de mundo com **erro 0,000°** depois de um giro de analógico de 118,7°. Era 164,5° de erro. **A posição do avatar continua não medida** — verde só na metade que medi. |

### D — Interação com o mundo

| # | Veredito | Medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | 🔴 | Três itens da lista fechada foram fechados e medidos: **pausar** (clique do analógico direito → painel + `state.paused=true`), **abrir o menu** (o mesmo painel) e **sair da partida a partir da tela de morte** (`VOLTAR AO MENU`, medido). Reprova porque **seis ações continuam sem mapeamento nenhum**: lançar granada · usar kit médico · comer · trocar acessório de mira · ciclar espectador · chat. O `ler()` de `js/xr/xrinput.js` expõe 11 verbos e nenhum deles é um desses seis; o painel tem 6 linhas e nenhuma é um desses seis. E o **efeito** no BR (pular da nave, paraquedas, baú do BR) continua **não executado por mim**. |
| D2 · alcance medido da cabeça | 🟢 | Passa com folga maior que antes: a separação cabeça↔colisor agora é 0,000–0,040 m **em todos os estados medidos**, inclusive morto e dirigindo, então a ressalva escrita na rodada passada ("nos estados sem dreno o alcance volta a mentir") **deixou de existir**. `js/interact.js` continua medindo de `player.pos`, e `player.pos` continua sendo a projeção da cabeça. |
| D3 · pegar é com a EMPUNHADURA, e perto | 🔴 | Código intocado: grip esquerdo = agachar, direito = mirar; pegar continua no gatilho da mão de apoio com raio de 2,4 a 5,0 m. O critério pede grip e 5–10 cm. |
| D4 · affordance dentro do mundo | 🟢 | Inalterado — marcador 3D de `js/xr/xrinteract.js`. Visto na captura da §3.1 ainda funcionando. |
| D5 · veículo sem quebrar cabeça nem chão | 🟢 | Entrou e saiu do buggy em sessão; separação dentro do carro **0,008 m**, saiu de pé. A ressalva da rodada passada (passo acumulado reabsorvido de uma vez ao sair) **acabou** — o passo não acumula mais. Nova ressalva: medi **2,60 m** de salto da vista ao SAIR do carro, mas não isolei quanto disso é o ponto de desembarque do jogo (que existe no desktop também) — **não reprovo por número que não separei**. |
| D6 · tudo alcançável de posição fixa | ⚪ | Não roteirizado. Observação: todas as minhas medições rodaram com o headset a ≤ 2 m do centro. |

### E — Desempenho

| # | Veredito | Medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | 🔴 | Tempo é do aparelho. A metade medível aqui — **declarar a taxa** — continua reprovada: `updateTargetFrameRate` **não aparece uma vez** em `js/` nem em `game.js`. A sessão nasce a 90 Hz por herança. (Há frente construindo `js/xr/xrframerate.js` **fora deste commit**.) |
| E2 · orçamento em estéreo | 🔴 | `scripts/vr-emulado.js`, sessão estéreo, 13:50: **menu 437 · spawn 439 · cidade 464 · castelo 730 draw calls**; **1,64 M · 1,64 M · 1,32 M · 1,87 M triângulos**. Tetos: 180 / 500 k. Reprova por **2,4× a 4,1×** em draw calls e **2,6× a 3,7×** em triângulos. O culling dos inimigos é real e medido (§4), mas o castelo **subiu** de ≤ 1,63 M para 1,87 M triângulos contra a rodada passada. |
| E3 · escala de render ≥ 85 % | ⚪ | Aparelho. |
| E4 · lógica de app ≤ 2 ms | ⚪ | Aparelho. |
| E5 · térmica 30 min | ⚪ | Aparelho. |

### F — Boot e ciclo de sessão

| # | Veredito | Medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | ⚪ | Aparelho, cache frio, N ≥ 7. |
| F2 · foco perdido | 🟢 | **Virou verde.** O quarto comportamento, o único que faltava, foi medido: `updateVisibilityState('visible-blurred')` → **`state.paused = true`**; `('hidden')` → **`state.paused = true`**. O painel abre sozinho em modo `pausa`. Os outros três (continua desenhando, esconde as mãos, ignora entrada) foram medidos em `98b114f` e o código deles não mudou. |
| F3 · recentrar não teleporta | 🔴 | Melhorou 4,8× e continua **7,5× acima do teto**. Headset a 0,78 m do centro do guardian → `dev.recenter()` deslocou o jogador **0,1500 m** no mundo (era 0,594–0,721 m); teto 0,02 m. E introduziu um custo que não existia: a **vista salta 0,630 m num único frame** durante a reconciliação. Ver §3.3. |
| F4 · sair devolve o desktop intacto | 🔴 | **A causa antiga foi consertada e uma nova nasceu.** O preset agora é desfeito de verdade: depois de `XR.exit()`, cascatas `[true,true,true,true]`, `csm.maxFar` **160**, `CFG.CSM_MAX_FAR` **160**, `qualidade.dentro=false` (dentro da sessão eram `[t,t,f,f]` / 90 / 90 / true). Reprova porque o **painel de VR e o HUD de VR ficam no desktop**, desenhados por cima de tudo, sem caminho de fechar. Provado em imagem. Ver §3.1. |
| F5 · jogável de ponta a ponta sem tirar o aparelho | 🔴 | Metade fechada: dentro da partida o jogador **pausa, ajusta conforto, recentra, morre e volta ao menu** só com os Touch. Reprova na outra metade: `game.js:3108` continua chamando `startGame(false)` ao entrar em VR porque **não existe menu principal nem lobby no mundo** — o próprio cabeçalho do `xrui.js` declara isso como "próxima rodada". Escolher modo e entrar em partida ainda exige o mouse. |

### G — Qualidade de imagem

| # | Veredito | Medido |
|---|---|---|
| G1 · foveação declarada | 🟢 | Inalterado (0,2 escrito por `game.js:391` e pelo preset). O preset agora também **devolve** a foveação salva ao sair. |
| G2 · antialiasing em XR | ⚪ | `antialias: true` e `gl.SAMPLES = 4` no contexto; o número de amostras do **alvo de render XR** continua não observável no IWER. Fica para o aparelho. |
| G3 · escala de framebuffer declarada | 🟢 | 0,9 escrito pelo preset. O módulo passou a guardar um **espelho local** (`fbAplicado`) porque o three r185 não tem getter — leitura honesta, e foi o que matou a asserção-enfeite do teste antigo. |
| G4 · texto e mira legíveis | ⚪ | Parte humana obrigatória. |
| G5 · uma captura por entrega | ⚪ | Não gerei captura estéreo (a captura da §3.1 é do desktop, e serve a outro fim). |

### H — HUD e UI dentro do mundo

| # | Veredito | Medido |
|---|---|---|
| H1 · nada essencial só no DOM | 🔴 | **De 0 para ≈ 11 de 17.** No mundo, medidos em sessão: vida · armadura · munição e pente · arma atual · inventário (granadas, kits) · prompt de interação (`xrinteract`) · abates · fase do BR · vivos · feed de abates (3 últimas linhas) · tela de morte · pausa. Reprova por seis: **minimapa · chat · placar · menu principal · lobby**, e **zona e tempo do BR**, que são o caso mais feio: `xrhud.js` **pinta** `br.zona` e `br.tempo`, mas `game.js:2815` alimenta os dois com **string vazia literal** (`tempo: '', zona: ''`). O painel tem os dois campos e eles nunca mostram nada. |
| H2 · UI não é colada na cara | 🟢 | **Virou verde.** Painel de pausa medido em sessão: **1,0040 m** do olho, **34,32° × 26,08°** (o Oculus BP pede caber no terço central, ~36,7° no Quest 3), texto **1,29°** de altura de maiúscula, linha 3,82°. Ancorado no MUNDO com histerese: com a cabeça parada a **deriva do painel foi 0,00000 m em 30 amostras** — não é head-locked. Ressalva honesta: os painéis do HUD medi a **0,231 m (arma)** e **0,396 m (pulso)** do olho, mas essa medida está **contaminada** — foi a minha sonda que colocou o controle ali. Não afirmo a distância de repouso. |
| H3 · o retículo não mente | 🟢 | Por ausência declarada, que é a saída que o critério autoriza. O `#crosshair` é DOM e não chega ao compositor; `xrhud.js` não desenha retículo. |

### I — Ausência de defeito grosseiro

| # | Veredito | Medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | ⚪ | Não delegável: exige um humano de headset. Nenhuma caixa marcada. |
| I2 · zero erro de console | 🟢 | `__game.errors` **vazio nas nove sessões**. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | ⚪ | A intrusão que EU introduziria medindo (os painéis novos) respeita o limite: `xrhud.js` esconde qualquer painel a menos de **0,22 m** do olho (teto do critério 0,15 m), e a guarda da arma ficou coerente (§3.2 da rodada passada resolvido). Corpo, terreno, parede e grama contra o plano near: **não amostrados**. |
| I4 · nenhum estado sem saída | ⚪ | Saiu de "quase todos são beco" para **quatro estados medidos com saída** (jogando, pausado, morto, dirigindo — todos alcançam o menu pelo clique do analógico direito → SAIR DA PARTIDA). Os outros seis da lista (menu, lobby, nave, queda, espectador, fim de partida) **não foram roteirizados**, e o critério cobra todos. Fica NÃO MEDIDO, não verde — mas com a ressalva de que os três piores becos fecharam. Ver a armadilha da §3.4. |

---

## 3. Os defeitos NOVOS, com a medição que prova

### 3.1 · O painel e o HUD de VR ficam no DESKTOP depois que a sessão acaba

É o defeito mais visível da rodada, e nasceu no commit que estou validando.

`game.js:383` (`onExit`) chama `XRArma.exit(); XRInterage.exit();
aoMudarSessaoXr();` — **e não chama `XRUI.exit()` nem `XRHud.exit()`**, que
existem e não têm um único chamador em código de produção. O `sync()` de
`xrboot.js` também não os conhece.

Medido numa sessão que abre o painel e **sai de verdade** (`XR.exit()`), duas
execuções independentes (portas 3480 e 3488):

| Depois de `XR.exit()` | Valor |
|---|---|
| `XR.presenting` | `false` |
| `XRUI.aberto` | **`true`** |
| painel na cena / visível | **`true` / `true`** |
| `material.depthTest` / `renderOrder` | **`false` / `9990`** |
| `xrHudArma` na cena / visível | **`true` / `true`** |
| `state.paused` | **`true`** |
| draw calls do desktop | 848 · 850 |

Traduzido: `depthTest: false` + `renderOrder: 9990` + `frustumCulled: false`
significa que o painel é desenhado **por cima de todo o resto, através de
paredes, do primeiro ao último frame**. E como `XRUI.update()` só roda dentro
de `if (xrOn)`, **não existe caminho para fechá-lo sem recarregar a página**.

A captura de tela do desktop, feita depois de sair da sessão e despausar,
mostra o painel "PAUSA / RETOMAR / GIRO SUAVE / VELOCIDADE DO GIRO 180°/s /
VINHETA DE CONFORTO LIGADA / RECENTRAR A VISTA / SAIR DA PARTIDA" plantado no
meio da tela, com o raio de mira do controle, enquanto o jogo roda normalmente
por baixo.

**O caminho que leva até lá é o que a própria rodada acabou de criar:** o F2
novo faz o painel **abrir sozinho** quando o headset é tirado
(`XR.visibility !== 'visible'` → `XRUI.abrir('pausa')`). Tirar o aparelho é
exatamente o gesto que antecede o fim da sessão. Quem tira o headset abre o
painel sem querer e depois encontra o monitor com um menu de VR colado nele.

O caminho de SAIR pelo painel **não** tem o defeito (`acionar('sair')` chama
`fechar()` antes), e é justamente esse o caminho que `test/xr-ui.test.js`
testa. O teste afere `XR.presenting === false` e **nunca olha para a cena**.

É a mesma família do defeito que devolvi na rodada passada: o preset que não
voltava. A diferença é que agora quem não volta é a malha.

### 3.2 · O rastreamento posicional da cabeça CONGELA quando o jogador morre — e isso é uma REGRESSÃO

`game.js:3159` passou a drenar o passo físico **sempre**, e a aplicá-lo só
quando o jogo aceita:

```
XR.consumirPasso(_passoXR);                       // dreno incondicional
if (!state.driving && !state.flying && !player.dead) {
  player.pos.x += _passoXR.x; player.pos.z += _passoXR.z;
}
```

Como `consumirPasso` **zera** o acumulado, o passo dos estados travados é
**jogado fora**, e o `place()` do frame seguinte fixa a cabeça sobre o colisor.
Consequência medida, mesma sessão, mesmo método, `dev.position` andando 0,80 m
em incrementos de 2 cm:

| Estado | Passo físico pedido | Cabeça andou no MUNDO |
|---|--:|--:|
| vivo | 0,80 m | **0,800 m** ✔ |
| **morto** | 0,80 m | **0,000 m** ✘ |
| dirigindo | 0,80 m | **0,242 m** (29 %) |

**Antes de `bbe6b48` isso funcionava.** Com o dreno gateado, morto o passo
ACUMULAVA e `place()` levava a cabeça para `x + passo` — foi exatamente assim
que a rodada passada mediu 1,200 m de separação. Ou seja: o jogador morto
**andava pela sala e a vista andava junto**, com o colisor atrasado. Agora a
vista não anda: o jogo **arrasta a cabeça de volta todo frame**.

O troco é ruim. Colisor atrasado é feio; vista congelada é enjoo. O próprio
docblock de `js/xr/xrrig.js` chama isso de "a coisa proibida" — *"o jogo
passaria a ARRASTAR a cabeça de volta"*. O Oculus BP e a lista de "coisas
ruins" da Meta citam nominalmente *"ignorar ou sobrescrever o movimento da
cabeça, como congelar a vista durante cinemáticas ou menus"*, e a
**VRC.Quest.Functional.5 é obrigatória** e exige resposta ao rastreamento
posicional. Morrer num FPS não é um estado raro.

Nota de contraste que prova que a solução existe: **pausado o comportamento
está CERTO** — durante a pausa o `place()` não roda, a cabeça é livre, e medi
**1,000 m** de movimento de vista para 1,00 m de passo físico. O gate errado é
`player.dead` / `state.driving`, não a pausa.

### 3.3 · O teto de 0,15 m paga o preço em TELEPORTE DA VISTA

`PASSO_MAX = 0,15` corta o passo do frame **e descarta o resto**. Como o
`place()` seguinte fixa a cabeça sobre o colisor, tudo o que foi descartado
vira um deslocamento instantâneo do mundo debaixo do jogador. Três medições:

| Evento | Cabeça salta num frame | Sobra no mundo |
|---|--:|--:|
| Salto de rastreio de 1,442 m (a receita literal do §12) | **1,292 m** | colisor andou 0,150 m dos 1,442 |
| `dev.recenter()` com o headset a 0,78 m do centro | **0,630 m** | jogador deslocado **0,150 m** |
| Pausa → andar 1,00 m pela sala → retomar | **0,850 m** | separação final 0,000 m |

O terceiro é o mais provável de acontecer de verdade, porque a pausa agora
dispara sozinha quando o headset é tirado (F2). O roteiro é: tirar o aparelho,
pousar na mesa a dois metros, voltar, colocar, retomar — e o mundo dá um
tranco de quase dois metros.

O teto não é errado; a **política de descarte** é. Descartar transforma
"colisor teleporta" (defeito de corpo) em "vista teleporta" (defeito de
cabeça), e em VR o segundo é a categoria pior. O recentrar em particular
continua reprovando F3 por **7,5×** o teto **e** ganhou um salto de vista que
antes não tinha.

Ainda no recentrar, uma observação de código que não medi em sessão: a linha
`RECENTRAR A VISTA` do painel faz `XR.giro.zerar(); xrYaw = 0`. Isso não alinha
a frente com para onde a cabeça está olhando (que é o que o botão de sistema do
Quest faz) — **zera o yaw artificial acumulado**. Com o giro medido chegando a
−119,6° com um toque de analógico, apertar esse botão gira o mundo 119,6° num
frame.

### 3.4 · "JOGAR DE NOVO" na tela de morte de VR é um botão morto em partida online

`js/xr/xrui.js` monta o modo `morte` com duas linhas **incondicionais**:
`JOGAR DE NOVO` e `VOLTAR AO MENU`. O desktop não faz isso: `Morte.mostrar()`
calcula `const solo = !(window.__MP_active || window.__BR_active)` e esconde os
botões (`ui.deathBtns.hidden = !solo`) porque, nas palavras do próprio código,
*"oferecer JOGAR DE NOVO ali seria reset de estado numa partida autoritativa"*.
E `restartMatch()` começa recusando:

```
if (window.__MP_active || window.__BR_active) {
  console.warn('[morte] JOGAR DE NOVO é do modo solo — em partida online o estado é do servidor');
  return false;
}
```

Medido em sessão online (`__BR_active` ligado, que é o padrão do jogo):

| | Valor |
|---|---|
| `Morte.naTela` / `Morte.temSaida` | `true` / `false` |
| botões do DOM escondidos | **`true`** |
| painel de VR aberto, modo | `true`, `morte` |
| linhas que o painel oferece | **`JOGAR DE NOVO`, `VOLTAR AO MENU`** |
| apontar + gatilho em JOGAR DE NOVO | acionou `reaparecer` |
| 1,5 s depois | painel `aberto`, modo `morte`, `Morte.naTela` `true` |
| 3,5 s depois | painel `aberto`, modo `morte`, `Morte.naTela` `true` |

O jogador de headset vê e aperta um botão que o jogador de monitor **não tem**,
ele não faz nada, e o painel se reabre sozinho no frame seguinte
(`game.js:3140` reabre enquanto `Morte.naTela` for verdade). A saída existe
(`VOLTAR AO MENU`), então não é beco — é pior de explicar: é um botão que
mente.

### 3.5 · Zona e tempo do BR chegam ao painel como string vazia

`js/xr/xrhud.js` desenha `br.zona` e `br.tempo` no painel do pulso. O que
`game.js:2815` entrega é:

```
br: (window.__BR_active && window.__BR_debug)
  ? { fase: …, vivos: …, tempo: '', zona: '' } : null,
```

Medido em sessão: `br: { fase: 'LOBBY', tempo: '', zona: '' }`. Dois dos
dezessete itens da lista fechada de H1 estão **cabeados mas cegos** — o pior
tipo de pendência, porque parece pronto no grafo e não mostra nada no olho.

---

## 4. O que EU tinha reprovado e está resolvido, com o número

| Defeito da rodada passada | Estado | Medido agora |
|---|---|---|
| §3.1 preset de qualidade vaza pro desktop | **RESOLVIDO** | Depois de `XR.exit()`: cascatas `[t,t,t,t]`, `maxFar 160`, `CFG.CSM_MAX_FAR 160`, `dentro=false`. Dentro eram `[t,t,f,f]`/90/90/true. E o teste foi reescrito para **sair da sessão de verdade** e ler `csmDebug` — **pode falhar**: se `quality.restaurar()` sumisse de novo do `sync()`, `r.fora.dentro` viria `true` e `r.fora.cfgFar` viria 90. O `fbDepois === 1` que comparava 1 com 1 morreu, substituído por um espelho local honesto. |
| §3.2 arma some dentro da janela de ADS | **RESOLVIDO** | `RECUO_MIN` 0,06 → **0,14**, acima de `CABECA_RAIO` 0,12. E é garantia matemática, não coincidência: `naCara` usa a distância euclidiana e `recuo` é a projeção dela no eixo, logo distância ≥ recuo ≥ 0,14 > 0,12. Varredura em malha fechada com desvio 0,0000: recuo 0,100 → `naCara=true, ads=0`; 0,120 → `naCara=false`; 0,145 → `ads=0,10`; **0,190 → `ads=1,00`, `mirando=true`, `naCara=false`, arma visível**. Mirar e sumir **nunca** coexistem. |
| §3.5 passo represado nos estados sem dreno | **RESOLVIDO** | Separação morto 1,200 → **0,000 m**; dirigindo 1,005 → **0,008 m**. Sem teleporte do colisor ao voltar. (O preço aparece na §3.2 acima.) |
| §3.6 yaw artificial não chega ao BR | **RESOLVIDO** | `G.yawDaVista()` = yaw de mundo, **erro 0,000°**; a leitura local daria 118,69° na mesma sessão. `grep camera.quaternion br-game.js` → **zero ocorrências**. Os três sítios (`:778` nave, `:986` minimapa, `:1878` `rotY` do servidor) usam a fonte única. |
| §3.3 recentrar anda com o jogador | **PARCIAL** | 0,594–0,721 m → **0,150 m**. Continua 7,5× acima do teto de 0,02 m, e ganhou um salto de vista de 0,630 m. Ver §3.3. |
| §3.4 passo físico atravessa parede | **RETRATADO** | Ver §5. |

**Culling dos inimigos, verificado independentemente:** com 28 inimigos na
lista, apagar todos em sessão estéreo mudou o quadro em **12 draw calls**
(312 → 300, mediana de 8 amostras). A frente reportou 14 no spawn; bate. O
trabalho é real e não vi sinal de inimigo sumindo — o teste de varredura de
pose (`fora === 0` em 800+ amostras, folga entre 1,05 e 1,35) é uma verificação
de verdade, não enfeite. Não confirmei em imagem que nenhum inimigo pisca no
desktop; isso pede olho humano.

---

## 5. Retratação: o meu §3.4 da rodada passada foi provado com um método que não vale

Eu escrevi, em `validacao-98b114f.md`:

> *"Direção que `MP.rayBlockedAt` reporta **bloqueada** a 1,5 m: andei 3,0 m
> fisicamente naquela direção…; o colisor andou os 3,000 m."*

Testei o método este ano e ele **não sustenta a conclusão**. Na mesma direção
que `rayBlockedAt` reportou bloqueada a 1,5 m do spawn, **empurrei o analógico
e o jogador andou 12,99 m** — a locomoção normal atravessa a mesma "parede".
Ou seja: `rayBlockedAt` verdadeiro **não** quer dizer que ali existe colisão de
locomoção, e o meu "3,000 m atravessando" media a ausência de parede, não a
ausência de varredura.

Tentei refazer o teste direito, procurando uma direção em que o **analógico**
fosse barrado (avanço < 1,5–2,0 m em 1,6–2,0 s de caminhada), varrendo o círculo
de 20° em 20° no spawn e de 20° em 20° na cidade (`Structures.heliSpot`). **Não
achei barreira em nenhum dos dois lugares** — os dois pontos são área aberta.

Portanto: **a cláusula "o colisor respeita parede, rampa e escada durante o
passeio físico" do C2 fica NÃO MEDIDA**, e o defeito §3.4 sai da lista até que
alguém o prove com um método que distinga parede de nada. O que continua sendo
verdade por leitura de código, e é o que motivou o teto, é que
`game.js:3161-3162` soma o passo em `player.pos` **sem varredura** — mas
"sem varredura" e "atravessa parede" são afirmações diferentes, e eu publiquei
a segunda com prova da primeira.

Registro isso aqui em vez de apagar porque é exatamente a lição do CLAUDE.md:
*"cuidado com o que mede o harness em vez do produto"*. Dessa vez fui eu.

---

## 6. Testes que não podem falhar (os irmãos do que achei na rodada passada)

O caso grave — `assert.equal(r.fbDepois, 1)` comparando 1 com 1 — **morreu**, e
morreu bem: o novo teste de F4 sai da sessão de verdade e lê o CSM. Procurei os
irmãos nos arquivos novos. Não achei nenhum tão grave, mas achei **guardas de
constante vendidas como testes de comportamento**:

- **`test/xr-hud.test.js` · "dá para LER" · `assert.ok(p.grausTexto >= 0.7)`.**
  `grausTexto` é função pura da distância, e os dois painéis penduram na MÃO.
  Para cair abaixo de 0,7° o painel da arma precisaria estar a **mais de 1,9 m
  do olho** — o que só acontece se o braço do jogador tiver dois metros. A
  asserção não pode falhar por nenhuma mudança plausível de código.
- **`test/xr-hud.test.js` · `assert.ok(p.anguloEncara <= 12)`.** O módulo faz
  `p.obj.lookAt(olho)` no mesmo frame, imediatamente antes. Medi **0,0009°**.
  É uma tautologia no caminho feliz.
- **`test/xr-ui.test.js` · "abre a ~1,0 m"** · as três asserções
  (`distancia ∈ [0,75; 1,25]`, `grausH ∈ [20; 36,7]`, `grausTexto ≥ 0,7`) são
  função apenas de `DIST` e `LARG`, e `seguir()` **reprojeta o painel no arco
  de `DIST` todo frame**. Elas travam duas constantes — o que tem valor — mas
  não podem pegar defeito de fiação. Vendidas como "o painel abre a 1 m", elas
  provam "a constante ainda é 1".

E o buraco de cobertura que o meu §3.1 encontrou: **nenhum teste olha a cena
depois que a sessão acaba.** `test/xr-ui.test.js` tem um caso chamado *"SAIR DA
PARTIDA existe, é acionável e encerra a sessão"* que afere
`XR.presenting === false` e para aí — e ele passa justamente pelo único caminho
de saída que **não** vaza. O caminho que vaza (headset tirado / sessão
encerrada por fora, com o painel aberto) não tem teste nenhum.

Um segundo buraco, mais sutil: `test/xr-ui.test.js:346` afere
`assert.ok(r.andou < 0.02)` para o **botão RECENTRAR do painel** — que de fato
não move o jogador. Lido de relance, parece cobrir F3. **Não cobre**: o F3 é
sobre `dev.recenter()`, o botão de sistema do Quest, e esse continua deslocando
**0,150 m**. Duas coisas com o mesmo nome.

---

## 7. Os três critérios mais longe do aceite

1. **E2 · orçamento de submissão em estéreo** — 437 a 730 draw calls contra
   180, 1,32 a 1,87 M triângulos contra 500 k. Continua sendo o único item a um
   fator 4 do alvo e o único cuja correção não cabe em ajuste. O culling dos
   inimigos (−12 draw calls medidos) é ganho real e é 1,6 % do problema.
2. **A3 + A4 · velocidade e aceleração** — 5,20 / 8,60 m/s com 302 ms de rampa,
   **exatamente os mesmos números de duas rodadas atrás**. É o único par que não
   se mexeu nenhuma vez desde a primeira reprovação, e é o que produz enjoo de
   verdade: os outros produzem irritação.
3. **B6 · háptico** — zero, com dois atuadores na mão. Está sendo construído
   agora por outra frente, fora deste commit.

Menção obrigatória, porque não é "longe" e sim **grave**: **A6 · a vista que
congela ao morrer** (§3.2). É regressão de comportamento, é VRC obrigatória, e
está a um `if` do conserto.

---

## 8. O que ficou NÃO MEDIDO (e por quê)

- **E1 (tempo), E3, E4, E5, F1** — só existem no aparelho. Não rodei o passo 4.
- **I1 (as 20 caixas), G4, G5** — exigem um humano de headset. **Sem as 20
  caixas marcadas, a rodada não está validada**, mesmo com tudo o mais verde.
- **C2, cláusula da parede** — meu método não vale (§5) e não achei parede.
- **C4 (escala em metros), C5 (corpo em 1ª pessoa), I3 (intrusão no plano
  near), D6** — cabiam e ficaram de fora por orçamento de sessão.
- **B5 segunda metade** (recuo reduz com duas mãos) — continua sem medida.
- **D1, metade do BR** (pular da nave, paraquedas, baú do BR) — não executei
  partida de BR para aferir efeito.
- **I4, seis estados** (menu, lobby, nave, queda, espectador, fim de partida).
- **C6, posição do avatar** — só o yaw foi medido.
- **G2 (4× MSAA no alvo XR)** — o IWER não expõe o framebuffer real.
- **B1/B2/B4, C3, F2 (três dos quatro comportamentos), G1/G3** — não
  re-medidos; código intocado desde `98b114f`, onde foram medidos. Está escrito
  em cada linha.

---

## 9. Se o dono puser o headset agora, o que ele reclama primeiro

Na ordem em que os segundos passam:

1. **"Por que eu corro assim?"** Ao primeiro toque no analógico. 5,20 m/s
   andando e 8,60 m/s correndo, 302 ms de rampa, e a vinheta fechando 85 % da
   periferia toda vez que ele gira no ajuste de fábrica. **Este é o item que
   não mudou uma casa decimal em três rodadas**, e é o único que produz enjoo
   em vez de irritação. Subiu para primeiro lugar porque tudo o que estava na
   frente dele foi consertado.
2. **"Continua tremendo."** 437 a 730 draw calls e até 1,87 M de triângulos em
   estéreo não cabem em 13,7 ms, e a sessão continua nascendo a 90 Hz porque
   ninguém declara 72. Ele não vai dizer "draw call".
3. **"Ficou muito melhor."** E isto merece ser dito em voz alta, porque é a
   primeira rodada em que a frase cabe: ele vai ver a **munição na arma**, a
   **vida**, os **vivos no pulso**, vai **pausar com o analógico**, vai
   **escolher se o giro é suave ou em passos e de quantos graus**, vai
   **desligar a vinheta**, e vai **sair da partida sem tirar o aparelho**.
   Cinco das seis queixas originais dele estão medidas como resolvidas.
4. **"Eu morri e o mundo travou."** Na primeira morte. Ele vai se mexer na sala
   e a imagem não vai acompanhar — 0,000 m de resposta para 0,80 m de passo. É
   a sensação mais desagradável que existe em VR e é nova nesta rodada.
5. **"Não sinto nada quando atiro."** Zero háptico, dois atuadores na mão.
6. **"Cadê a zona? Quanto tempo falta?"** No primeiro BR: os dois campos estão
   desenhados no pulso e permanentemente vazios.
7. **"Tem um menu grudado na minha tela."** Depois. No monitor, quando ele
   tirar o headset — e ele não vai conseguir tirar sem recarregar a página.

O que ele **não** vai reclamar, e vale registrar porque foi trabalho difícil e
bem feito: **a arma não some mais quando ele mira** (era a queixa nº 4 da
rodada passada, e o gesto que B1–B4 vieram servir finalmente funciona); **o
mundo não gira mais em torno de um ponto que não é a cabeça dele** (0,0000 m em
seis casos); **o corpo dele segue a cabeça em todos os estados** (0,000 a
0,040 m); **os outros jogadores veem o avatar dele virado para onde ele está
olhando** (0,000° contra 164,5°); e **o monitor não fica mais com as sombras
cortadas** quando ele tira o aparelho.
