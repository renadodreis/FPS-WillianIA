# Validação da rodada — commit `98b114f`

Data: 2026-08-26 · branch `dev` · three r0.185.1 · IWER 2.3.0
Autor: o **validador**. Executa o procedimento da §12 de `criterio-aaa.md`.
Não escreve código, não escreve teste. Escreve o que reprova.

> **Veredito: RODADA DEVOLVIDA.** 14 critérios verdes, 19 vermelhos,
> 14 não medidos. A regra do documento não admite média: um vermelho devolve.
>
> A rodada também **avançou de verdade**: A1, B1, B2, B3, B4, C1, C3, D2, D4,
> G1 e G3 saíram do vermelho, e três das cinco queixas originais do dono estão
> medidas como resolvidas. O que devolve a rodada é o que sobrou — e três
> defeitos **novos**, nascidos das próprias correções (§3.1, §3.2, §3.3).

---

## 0. Condição da medição (sem isto não é medida)

- Máquina ociosa: `load average 0,56` no início da bateria.
- `git log -1` = `98b114f`; árvore limpa fora de `.codex/` e `AGENTS.md`
  (não rastreados, não tocados por mim).
- Sessão `immersive-vr` **real**, runtime IWER 2.3.0 preset Meta Quest 3,
  Chrome com GPU real, servidor local, `test/helpers/iwer.js → bootEmVR`,
  `XR.presenting === true` confirmado em todas as sondas.
- **Cinco sessões independentes**, portas 3480 / 3482 / 3484 / 3486 / 3488.
  Sondas descartáveis fora do repo; nada foi editado no produto nem nos testes.
- **Não rodei `npm test`** (proibido nesta rodada) e **não re-medi desempenho
  de tempo** — `docs/vr/perf-xr.md` já declarou o ganho de 4–9 % contra os 78 %
  necessários, e eu aceito essa medição.
- **Estado da árvore durante as medições** (as sondas rodaram das 12:25 às
  12:40): `js/charmodels.js` e `test/enemy-drawcalls.test.js` só foram alterados
  por outra frente às 12:43, **depois** de tudo — os números de draw call não
  estão contaminados. `js/xr/xrui.js` e `js/xr/xrhud.js` apareceram no meio da
  bateria mas **`game.js` não os importa** neste commit, então não entraram em
  nenhuma sessão minha. Onde este documento diz "0 de 17 no HUD", isso descreve
  `98b114f`, não o trabalho em curso da frente de UI.
- O que só existe no aparelho (E1, E3, E4, E5, F1) e o que só existe com um
  humano de headset (I1, G4, G5) está marcado **NÃO MEDIDO**, não "aprovado".

---

## 1. Placar por categoria

| Categoria | Verde | Vermelho | Não medido |
|---|--:|--:|--:|
| A — Giro e locomoção | 1 | 5 | 0 |
| B — Mira e empunhadura | 4 | 2 | 1 |
| C — Corpo, altura, escala | 2 | 2 | 2 |
| D — Interação com o mundo | 3 | 2 | 1 |
| E — Desempenho | 0 | 2 | 3 |
| F — Boot e ciclo de sessão | 0 | 4 | 1 |
| G — Qualidade de imagem | 2 | 0 | 3 |
| H — HUD e UI no mundo | 1 | 1 | 1 |
| I — Ausência de defeito grosseiro | 1 | 1 | 2 |
| **Total (47)** | **14** | **19** | **14** |

Números centrais contra a linha de base de `b1f1e08`:

| Grandeza | Linha de base | Agora | Alvo |
|---|--:|--:|--:|
| Translação da cabeça por giro (0,71 m fora do centro) | 0,554 m | **0,0000 m** | ≤ 0,02 |
| Translação da cabeça por giro (2,0 m fora do centro) | — | **0,0000 m** | ≤ 0,02 |
| Passo físico 1,442 m → colisor andou | 0,000 m | **1,442 m** | 1,442 ± 0,05 |
| Separação cabeça↔colisor (em pé) | 1,429 m | **0,000 m** | ≤ 0,10 |
| Separação cabeça↔colisor (**morto**) | — | **1,200 m** | ≤ 0,10 |
| Separação cabeça↔colisor (**dirigindo**) | — | **1,005 m** | ≤ 0,10 |
| Folga cabeça↔chão, quadrado de 2 m (44 amostras) | 1,439–1,778 m | **1,600–1,600 m** | 1,60 ± 0,02 |
| Distância arma↔grip, quadril, **8 armas** | 0,543 m | **0,0000 m** | ≤ 0,03 |
| Distância arma↔grip, ADS | 0,476 m | **0,0000 m** | ≤ 0,03 |
| Deriva da arma parado / andando | 2,4 / 55 mm | **0,00 / 0,00 mm** | 0 |
| Espaço da arma | `targetRaySpace` | **`gripSpace`** | `gripSpace` |
| Eixo da mira × direção do tiro (8 armas) | sem alinhamento | **0,00°** | ≤ 0,5° |
| **Origem do tiro ↔ boca do cano** | ~0,50 m | **0,437–0,910 m** | ≤ 0,05 |
| Vinheta parada (1,5 s após parar) | 0,082 permanente | **0,0137** (zera em 3 s) | ≤ 0,01 |
| Velocidade caminhada / corrida | 5,2 / 8,6 m/s | **5,2 / 8,6 m/s** | ≤ 2,0 / ≤ 4,0 |
| Tempo até 95 % da velocidade | não medido | **0,30 s** | ≤ 0,15 |
| Draw calls / triângulos em estéreo | 517–806 / 1,46–2,03 M | **498–790 / 1,50–1,63 M** | ≤ 180 / ≤ 500 k |
| Háptico: chamadas no repo / atuadores | 0 / 2 | **0 / 2** | ≥ 1 por tiro |
| `setFoveation` | nunca chamado (1,0) | **0,2 declarado e lido** | ≤ 0,5 declarado |
| `antialias` do contexto / `SAMPLES` | false / 0 | **true / 4** | 4× |
| `updateTargetFrameRate` | nunca chamado (90 Hz) | **nunca chamado (90 Hz)** | 72 declarado |
| Armas alcançáveis pelo controle | 3 de 8 | **8 de 8** | 8 |
| `KeyboardEvent` de DOM emitido pelo headset | nenhum | **KeyE, Space, KeyR, ControlLeft, ShiftLeft** | todos |
| Pausa / menu / saída pelo headset | não existe | **não existe** | obrigatório (VRC) |
| Recentrar → deslocamento do jogador no mundo | não medido | **0,594 e 0,721 m** | ≤ 0,02 |
| **Preset de qualidade restaurado ao SAIR** | não existia | **NÃO restaura** | obrigatório |

---

## 2. Critério a critério

Legenda: 🟢 aprova · 🔴 reprova · ⚪ não medido.

### A — Giro e locomoção

| # | Veredito | Medido |
|---|---|---|
| A1 · giro não translada a cabeça | 🟢 | **0,0000 m** em 32 casos (8 offsets × 2 sentidos × 2 modos, r = 0,71 m) e **0,0000 m** a 2,0 m fora do centro. Era 0,554 m. |
| A2 · passo é escolha do jogador | 🔴 | Mecanismo correto: passo 15/30/45/60/90 sai **exato** (erro 0,00°); suave 45/90/180 °/s fiel (41,8 / 83,3 / 166,5 medidos com rampa), teto em 180 °/s; preferência **persistida** em `localStorage['callofai_vr']`. Reprova porque **não há como escolher dentro do headset** — só por chamada de API. O critério cobra a escolha no aparelho. |
| A3 · velocidade humana | 🔴 | **5,2 m/s andando, 8,6 m/s correndo.** Idêntico à linha de base; nada mudou. Teto 2,0 / 4,0. |
| A4 · aceleração instantânea | 🔴 | **0,30 s** até 95 % (teto 0,15 s), com rampa visível na amostragem de 50 ms: 2,27 → 3,51 → 4,22 → 4,64 → 4,87 → 5,02 → … → 5,20. |
| A5 · vinheta some ao parar | 🔴 | Receita do §12 (andar 2 s, parar 1,5 s): **0,0137** contra teto 0,0100. Zera de fato em 3 s (0,0003) e 5 s (0,0000). É a reprovação mais leve da lista. Piscada só no modo em passos ✓ (0,0000 no suave). **Observação de sensação, não de número:** o giro contínuo padrão a 180 °/s leva o túnel a **0,844 de pico** — girar é a ação mais frequente de um FPS, e no ajuste de fábrica ela fecha 84 % da periferia toda vez. O padrão desta rodada entrega o modo mais intenso na velocidade mais alta; é decisão declarada do dono, mas quem vai sentir é o pescoço dele. |
| A6 · nada além do pescoço move a vista | 🔴 | Seis estados varridos (jogando, girando, atirando, tomando dano, pausado, morto): **erro de pose 0,027°**, FOV constante em 89,999 e **deriva da cabeça 0,0000 m** — o núcleo está limpo. Reprova pelo BR: `br-game.js:776 / :985 / :1875` leem `MP.camera.quaternion`, que em XR é o quaternion **LOCAL**. Medido depois de um giro de analógico: **yaw local 45,0° contra yaw de mundo −119,5° = 164,5° de erro**. `br-game.js` não tem **uma** referência a XR no arquivo inteiro. |

### B — Mira e empunhadura

| # | Veredito | Medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | 🟢 | **0,0000 m** entre a âncora `gripR` e a origem do `gripSpace`, nas **8 armas** (fuzil, escopeta, DMR, bazuca, plasma, faca, sniper, escopeta rajada). Era 0,543 m. |
| B2 · 1:1 sem bob nem sway | 🟢 | **0,00 mm** parado e **0,00 mm** andando (20 amostras cada). Era 2,4 e 55 mm. Depois de atirar, 11,2 mm — é o coice, não deriva. |
| B3 · dá para ver pelo buraco | 🟢 | **0,00°** entre o eixo óptico do perfil ativo e a direção real do tiro, e **0,0000 m** de desvio da massa ao raio, nas 7 armas com mira. O tiro sai da linha de mira. |
| B4 · botão de mirar não teleporta | 🟢 | **0,0000 m** ao apertar e **0,0000 m** ao soltar o `squeeze`, em 3 armas. O botão nem é mais o gatilho do ADS — quem manda é a geometria. |
| B5 · segunda mão importa | ⚪ | Metade verde e medida: engata a ≤ 0,20 m, solta a ≥ 0,32 m (histerese confirmada), **20,27° de correção do cano ao levantar a mão de apoio 20 cm**, e volta a **0,00°** ao soltar. A outra metade do critério — "o recuo/oscilação reduz de forma medível com duas mãos" — **não foi medida**: minha primeira tentativa leu `medida.recuo/desvio`, que são a geometria do ADS, não o recuo da arma. Não reporto número que não medi. |
| B6 · háptico em toda ação | 🔴 | **Zero** ocorrências de `haptic` no repositório inteiro (`js/`, `game.js`, `br-game.js`), com **1 atuador por mão** disponível e confirmado na sessão. Inalterado. |
| B7 · o tiro sai do cano | 🔴 | Origem do tiro a **0,4367 m (faca) / 0,4789 (rajada) / 0,6230 (plasma) / 0,6563 (fuzil) / 0,7230 (escopeta) / 0,7723 (sniper) / 0,7831 (DMR) / 0,9095 m (bazuca)** da boca do cano. Teto 0,05 m. E o cano fica **0,059 a 0,200 m FORA do raio do tiro** (0,091 fuzil · 0,181 escopeta · 0,200 plasma · 0,131 bazuca). A bala nasce na ocular, não na boca: encostar o cano numa quina atira de dentro da quina. |

### C — Corpo, altura e escala

| # | Veredito | Medido |
|---|---|---|
| C1 · nunca enterrado | 🟢 | **1,600 m constante, amplitude 0,000 m** em 44 amostras num quadrado de 2 m; 1,600 m dentro e depois do veículo. Janela do critério: 1,20–2,10. Honestidade: agora a folga é constante **por construção** (a cabeça é fixada em XZ sobre o colisor, então o chão sob a cabeça é o mesmo do colisor). Escada da Torre Nexus, interior da cidade e castelo **não foram visitados**. |
| C2 · o corpo segue a cabeça | 🔴 | Em pé: passo de 1,442 m → **colisor andou 1,442 m**, **separação 0,000 m**. Perfeito, e é a correção mais bem-sucedida da rodada. Reprova em três frentes: (a) **morto** → cabeça anda 1,200 m e colisor 0,000 m, **separação 1,200 m**; (b) **dirigindo** → separação **1,005 m** depois de 1 m de passo físico; (c) **o passo físico não colide**: andei 3,0 m fisicamente numa direção que `rayBlockedAt` reporta bloqueada e o **colisor andou os 3,000 m**, e um passo de 6 m num frame moveu o colisor **6,000 m** sem varredura. O critério pede "≤ 0,10 m em todos os frames" **e** "o colisor respeita parede, rampa e escada durante o passeio físico". |
| C3 · altura do aparelho, agachar de verdade | 🟢 | `dev.position.y` 1,60 → 1,00: olho desceu **0,600 m exatos** (± 0,000), `crouchT` 0 → 1, `XR.corpo.agachado` true, e volta ao subir. Não medi passar por um vão de 1,2 m. |
| C4 · escala 1:1 em metros | ⚪ | Não medido. |
| C5 · corpo em 1ª pessoa coerente | ⚪ | Não medido (o boneco existe e é anexado ao rig, `js/xr/xrbody.js`; não amostrei geometria contra o plano near). |
| C6 · o avatar que os outros veem | 🔴 | `br-game.js:1875` envia `rotY` derivado de `MP.camera.quaternion` — o quaternion **LOCAL**. Medição do mesmo defeito de A6: **164,5° de erro** entre o yaw enviado e o yaw real de mundo depois de um giro de analógico. Quem gira com o analógico continua, para os outros jogadores, olhando para onde estava. A posição do avatar não foi medida. |

### D — Interação com o mundo

| # | Veredito | Medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | 🔴 | Ganhos reais e medidos: o ciclo de arma alcança **as 8** (`[0,1,2,3,4,5,6,7]`), e o headset **emite `KeyboardEvent` de DOM de verdade** — espião na página capturou `KeyE`, `Space`, `KeyR`, `ControlLeft`, `ShiftLeft`, então os listeners de `br-game.js:1814` (nave, paraquedas, baú do BR) passaram a ser alcançáveis. Reprova porque a lista fechada não fecha: **pausar, abrir o menu, sair da partida pela tela de morte, ciclar espectador, chat, granada, kit médico, comer e trocar acessório de mira não têm mapeamento nenhum** — o `ler()` de `js/xr/xrinput.js` expõe 11 verbos e nenhum é pausa/menu. Medido: dois botões segurados 700 ms → `state.paused` continua `false` e o `#overlay` continua fechado. O **efeito** no BR (pular da nave, abrir o paraquedas, abrir o baú) não foi executado por mim: NÃO MEDIDO nessa metade. |
| D2 · alcance medido da cabeça | 🟢 | Passou por consequência de C2, não por conserto próprio: `js/interact.js` continua medindo tudo de `player.pos`, mas `player.pos` agora **é** a projeção da cabeça (separação 0,000 m em pé). Erro contra a leitura direta: **0,000 m**. Ressalva escrita: nos estados sem dreno (morto, dirigindo) o erro vira 1,0–1,2 m e o alcance volta a mentir. |
| D3 · pegar é com a empunhadura, e perto | 🔴 | O grip esquerdo continua sendo **agachar** e o direito **mirar**. Pegar é o gatilho da mão de apoio / botão de polegar, com raio herdado de `js/interact.js`: **2,4 m (baú) · 2,8 m (bazuca) · 4,5 m (carro) · 5,0 m (helicóptero)**. O critério pede grip e **5–10 cm**. (O *efeito* do gesto do gatilho da mão de apoio não chegou a ser medido: quando apertei, não havia alvo ativo. Reprovo pelo botão e pelo raio, que são leitura direta, não pelo gesto.) |
| D4 · affordance dentro do mundo | 🟢 | `js/xr/xrinteract.js` desenha um marcador 3D de verdade (anel + rótulo `Sprite`) na cena, não no DOM. Medido em sessão: o marcador **acende** com alvo `carro` / `ENTRAR — BUGGY`, **apaga** sem alvo, e distingue acionável de longe (cor + sufixo `(aproxime-se)`). Rótulo com **0,40 m de altura a 5,95 m do olho = 3,85° de arco**, acima do mínimo de 3° que a Meta publica para alvo interativo; e **fora** da zona de 0,15 m do olho. |
| D5 · veículo sem quebrar cabeça nem chão | 🟢 | Entrou: **erro de pose 0,0000°** (nenhuma rotação imposta), separação 0,003 m, folga 1,600 m — o rastreamento continua 1:1 dentro do carro. Saiu: `driving` false, folga **1,600 m**, de pé no chão. Ressalva: o passo físico acumulado dentro do carro é reabsorvido **de uma vez** ao sair (o colisor pula o acumulado num frame). |
| D6 · tudo alcançável de posição fixa | ⚪ | Não executei o roteiro travado no centro. Observação: todas as minhas medições rodaram com o headset a ≤ 2 m do centro e nada exigiu andar. |

### E — Desempenho

| # | Veredito | Medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | 🔴 | Não medi tempo (é do aparelho), mas o critério cobra **declarar a taxa** e isso é medível aqui: `session.frameRate = 90`, `supportedFrameRates = [72, 80, 90, 120]`, `updateTargetFrameRate` **existe e nunca é chamado**. A sessão continua nascendo a 90 Hz por herança. |
| E2 · orçamento em estéreo | 🔴 | **498 a 790 draw calls** e **1,50 a 1,63 M triângulos** por frame em sessão estéreo. Tetos: 180 / 500 k (interno) e 200 / 1,5 M (Meta). Reprova nos dois. |
| E3 · escala de render ≥ 85 % | ⚪ | Aparelho. |
| E4 · lógica de app ≤ 2 ms | ⚪ | Aparelho. |
| E5 · térmica 30 min | ⚪ | Aparelho. |

### F — Boot e ciclo de sessão

| # | Veredito | Medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | ⚪ | Aparelho, cache frio, N ≥ 7. |
| F2 · foco perdido | 🔴 | Três de quatro comportamentos corretos e medidos: **continua desenhando** (frames 3792 → 3847 → 3937 durante `visible-blurred` e `hidden`), **esconde as mãos** (`mao`/`punho` `visible: false`), **ignora entrada** (analógico cravado por 600 ms → velocidade 0,00). Reprova no quarto: **`state.paused` continua `false`** em `visible-blurred` **e** em `hidden`. VRC.Quest.Functional.2 é obrigatória e a própria Meta a cita como uma das mais reprovadas. |
| F3 · recentrar não teleporta | 🔴 | O yaw de frente **reseta certo** (−60,00° medidos para 60° de cabeça). Mas o jogador **anda no mundo**: `dev.recenter()` deslocou o jogador **0,7211 m** numa sessão e **0,5941 m** na outra — exatamente a distância que o headset estava do centro do guardian. O botão de recentrar do sistema vira um passo lateral no jogo. |
| F4 · sair devolve o desktop intacto | 🔴 | **Defeito NOVO desta rodada.** Ver §3.1. |
| F5 · jogável de ponta a ponta sem tirar o aparelho | 🔴 | Não há menu, pausa nem saída pelo controle (medido em D1). Entrar em VR continua caindo direto em partida. |

### G — Qualidade de imagem

| # | Veredito | Medido |
|---|---|---|
| G1 · foveação declarada | 🟢 | `renderer.xr.getFoveation()` = **0,2**, escrito pelo jogo (`game.js:389`) e reaplicado pelo preset da sessão. Era 1,0 herdado (o máximo do three). Teto do critério: 0,5. |
| G2 · antialiasing em XR | ⚪ | Causa raiz corrigida e medida: contexto WebGL com `antialias: true` e **`gl.SAMPLES = 4`**. O número de amostras **do alvo de render XR** não é observável no IWER (a sessão emulada usa `baseLayer` direto, 800 × 600, e `renderer.xr.getRenderTarget()` não devolve alvo). Fica para o aparelho — não afirmo 4× sem ter lido 4×. |
| G3 · escala de framebuffer declarada | 🟢 | O preset escreve **0,9** (`js/xr/xrquality.js`, modo não agressivo), acima do piso de 0,9 do critério. A resolução por olho resultante **não foi medida** (o IWER entrega 800 × 600, não o painel do Quest 3), e o three r185 não expõe getter para conferir o valor de volta. |
| G4 · texto e mira legíveis | ⚪ | Parte humana obrigatória. Não executada. |
| G5 · uma captura por entrega | ⚪ | Não gerei captura estéreo nesta rodada. |

### H — HUD e UI dentro do mundo

| # | Veredito | Medido |
|---|---|---|
| H1 · nada essencial só no DOM | 🔴 | **0 de 17.** `#hud`, `#crosshair`, `#prompt`, `#killfeed`, `#minimap` existem e estão "visíveis" no DOM, que a sessão imersiva não desenha. (Frente em andamento por outro agente — `js/xr/xrui.js` e `js/xr/xrhud.js` não existem neste commit.) |
| H2 · UI não colada na cara | ⚪ | Não há painel no mundo para medir distância e ancoragem. |
| H3 · o retículo não mente | 🟢 | Por ausência: o `#crosshair` é DOM e não chega ao compositor, então **não existe retículo mentiroso no headset**. O critério aceita "ou não existe". É verde pelo mesmo motivo que H1 é vermelho. |

### I — Ausência de defeito grosseiro

| # | Veredito | Medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | ⚪ | Não delegável: exige um humano de headset. Nenhuma caixa marcada nesta rodada. |
| I2 · zero erro de console | 🟢 | `__game.errors` vazio nas **cinco** sessões. Ressalva: nenhuma delas durou 20 minutos. |
| I3 · nada atravessa a câmera | ⚪ | A arma tem guarda (`CABECA_RAIO = 0,12 m`, some em vez de empurrar) — e é justamente essa guarda que cria o defeito §3.2. Corpo, terreno, parede e grama contra o plano near: não amostrados. |
| I4 · nenhum estado sem saída | 🔴 | Sem pausa, sem menu, sem saída da tela de morte pelo controle. Todos os estados são beco. |

---

## 3. Os defeitos NOVOS, com a medição que prova

### 3.1 · O preset de qualidade da sessão NUNCA é desfeito — e o teste que jura o contrário não sai da sessão

É o defeito mais grave da rodada, e nasceu no próprio commit que estou validando.

Medido numa sessão que **entra e sai** (a sonda D lê o estado três vezes):

| Momento | `CFG.CSM_MAX_FAR` | `castShadow` das 4 cascatas | `qualidade.dentro` |
|---|--:|---|---|
| antes de entrar em VR | **160** | `[true, true, true, true]` | `false` |
| dentro da sessão | **90** | `[true, true, false, false]` | `true` |
| **depois de `XR.exit()`** | **90** | `[true, true, false, false]` | **`true`** |

Ou seja: o jogador tira o headset, volta para o monitor, e o jogo fica **com
duas cascatas de sombra apagadas e a distância de sombra cortada de 160 m para
90 m**, para o resto da sessão do navegador. É exatamente a regressão que o
docblock do próprio módulo declara inaceitável:

> *"RESTAURAR NÃO É OPCIONAL. Sair da sessão e continuar jogando no monitor com
> duas cascatas desligadas é regressão de PC introduzida por VR."*

**Causa, provada por busca no repositório inteiro:** `restaurar()` tem **zero**
chamadas em código de produção. `js/xr/xrboot.js` chama `quality.aplicar()` no
ramo de entrada do `sync()` e o ramo de saída faz
`comfort.soltar(); hands.exit(); corpo.soltar(); rig.exit();` — sem
`quality.restaurar()`. O `onExit` do `game.js:381` faz
`XRArma.exit(); XRInterage.exit(); aoMudarSessaoXr();`, também sem.
Os únicos chamadores de `restaurar()` no repositório são as linhas 99, 116, 131
e 132 de `test/xr-quality.test.js`.

**Por que a suíte está verde:** o teste chama-se
`'SAIR restaura tudo — preset que vaza pro desktop é regressão de PC'` e
**nunca sai da sessão**. Ele chama `G.XR.qualidade.restaurar()` com a própria
mão e depois confere que o módulo fez o serviço. É o andaime dirigindo o
produto de novo — a mesma armadilha que já fez o giro contar duas vezes nesta
frente, e a mesma lição do `startBRMatch` que o CLAUDE.md registra.

E as duas asserções desse teste **não podem falhar**:

- `assert.equal(r.fbDepois, 1, …)` — `fbDepois` vem de
  `MP.renderer.xr.getFramebufferScaleFactor ? … : 1`. **Esse getter não existe
  no three r0.185** (medido: `'sem getter'`). A expressão cai no literal `1` e
  a asserção compara 1 com 1 para sempre, mesmo que o framebuffer estivesse em
  0,1.
- `assert.equal(r.fov, 0.2, …)` — a foveação de fora da sessão é 0,2
  (`game.js:389`) **e** a do preset também é 0,2. Restaurando ou não, dá 0,2.

O teste vizinho, `'entrar na sessão APAGA as cascatas distantes'`, também não
lê uma única luz: ele afere `qualidade.dentro === true` e tem uma linha morta
`sombras: G.csmDebug ? null : null`.

### 3.2 · A guarda anti-câmera esconde a arma DENTRO da janela de ADS

Duas frentes se cruzaram e ninguém mediu a interseção.

- `js/xr/xrweapon.js`: `RECUO_MIN = 0,06` — o ADS físico engata quando o olho
  está **entre 6 e 45 cm** atrás da ocular.
- `js/xr/xrweapon.js`: `CABECA_RAIO = 0,12` — a arma some
  (`weaponRoot.visible = false`) quando a ocular chega a **menos de 12 cm** da
  cabeça.

As duas janelas se sobrepõem em **6 cm**, e essa faixa é justamente onde mora
um encosto de face real. Medido nas três armas de mira longa (fuzil, DMR,
sniper), com o eixo óptico paralelo ao olhar e desvio lateral 0,0163 m:

| recuo real | `ads` | `mirando` | `naCara` (arma some) |
|--:|--:|---|---|
| −0,0096 m | 0,000 | não | **sim** |
| 0,0504 m | 0,000 | não | **sim** |
| **0,1004 m** | **0,652** | **sim** | **sim** |
| 0,2004 m | 0,808 | sim | não |
| 0,3504 m | 0,805 | sim | não |
| 0,4504 m | 0,000 | não | não |

A linha do meio é o defeito: **o jogo diz "você está mirando", ativa
`mouse.aiming`, e ao mesmo tempo apaga a arma.** O jogador que faz exatamente o
gesto que o dono pediu — trazer a coronha ao rosto para ver pelo buraco da alça
— vê a arma desaparecer. A correção de I3 (arma não atravessa a cara) engoliu o
terço mais útil da correção de B3.

Colateral medido no mesmo lugar: `mouse.aiming` só acende a partir de ~0,12 m
de recuo **efetivo com a arma visível**, então a precisão de ADS e o gesto
natural de mira ficam desalinhados.

### 3.3 · Recentrar o headset anda com o jogador no mundo

`dev.recenter()` com o headset deslocado do centro do guardian:

| Sonda | deslocamento do headset | jogador andou no mundo | yaw de frente |
|---|--:|--:|---|
| A (porta 3480) | 0,721 m | **0,7211 m** | não testado |
| C (porta 3484) | 0,583 m | **0,5941 m** | resetou certo (−60,00°) |

O deslocamento no mundo é **exatamente** a distância que o headset estava da
origem: o recentrar zera `dev.position`, o rig lê isso como passo físico, drena
para `player.pos` e o jogador **anda**. Teto do critério: 0,02 m.

Isto é filho direto da correção de C2 (drenar o passo do cômodo para o colisor):
a correção não distingue "o jogador andou" de "a origem do espaço mudou". No
aparelho, o recentrar é um botão de sistema que o jogador aperta o tempo todo —
e cada aperto vira um passo lateral de até um metro, com o mundo deslizando
embaixo dele. É a queixa original *"o mundo não só gira, ele desliza"* migrada
do giro para o recentrar.

### 3.4 · O passo físico não colide: andar de verdade atravessa parede

Duas medições independentes:

- Direção que `MP.rayBlockedAt` reporta **bloqueada** a 1,5 m: andei 3,0 m
  fisicamente naquela direção em 12 passos de 25 cm; **o colisor andou os
  3,000 m**, separação 0,000 m.
- Passo físico de 6 m em um frame: **o colisor andou 6,000 m**, sem varredura.

`game.js:3099-3103` faz `player.pos.x += _passoXR.x; player.pos.z += _passoXR.z`
sem sweep. O critério C2 cobra nominalmente "o colisor respeita parede, rampa e
escada durante o passeio físico".

### 3.5 · O passo físico fica represado nos estados sem dreno e volta de uma vez

O dreno é gateado por `if (!state.driving && !state.flying && !player.dead)`
(`game.js:3097`). Medido:

- **Morto:** cabeça andou 1,200 m, colisor 0,000 m, **separação 1,200 m**.
- **Dirigindo:** separação **1,005 m** depois de 1 m de passo físico dentro do
  carro (e a folga caiu de 1,600 para 1,531 m).
- Quando o dreno religa (respawn, sair do carro), a separação volta a 0,000 m
  **num frame**: o colisor teleporta o acumulado inteiro, sem varredura, com o
  mesmo problema de §3.4 e com um delta de posição que o anti-cheat de teleporte
  do servidor vê como um salto.

### 3.6 · O yaw artificial não chega ao BR (nem aos outros jogadores)

`br-game.js` não tem **uma** referência a XR no arquivo inteiro, e lê o
quaternion **local** da câmera em três lugares. Medido depois de um giro de
analógico de ~105°:

| leitura | valor |
|---|--:|
| yaw de mundo da câmera (o que o jogador vê) | **−119,5°** |
| `MP.camera.quaternion` (o que `br-game.js` lê) | **45,0°** |
| erro | **164,5°** |

Consequências, uma por linha:

- `br-game.js:776` (`shipWalk`) — andar dentro da nave do BR usa esse yaw como
  "frente". Girar com o analógico e depois andar leva o jogador para o lado
  errado. É o *"pra frente vai pra trás"* que a skill `vr-quest` já documentou,
  vivo.
- `br-game.js:1875` — é o `rotY` **enviado ao servidor**. O avatar que os outros
  jogadores veem fica virado para onde o jogador estava antes de girar.
- `br-game.js:985` — a seta do minimapa. Errada também, mas o minimapa é DOM e
  não chega ao headset, então o efeito prático em VR é nulo.

As duas leituras por `getWorldDirection` (`:828` paraquedas, `:1379`
espectador) estão **corretas** em XR — essas eu não reprovo.

---

## 4. Os três critérios mais longe do aceite

1. **E2 · orçamento de submissão em estéreo** — 498 a 790 draw calls contra
   180, e 1,50 a 1,63 M triângulos contra 500 k. É **2,8× a 4,4×** o teto, e
   `docs/vr/perf-xr.md` já declarou que o preset rende 4–9 % contra os 78 %
   necessários. Nenhum outro critério está a um fator 4 do alvo, e este é o
   único cuja correção não cabe em ajuste — precisa de mudança de arquitetura de
   render.
2. **H1 · HUD dentro do mundo** — 0 de 17 itens. Não é "quase": é a categoria
   inteira ausente. Sem ela o jogador não vê vida, munição, arma, zona do BR nem
   tela de morte. (Está sendo construída agora por outra frente; neste commit
   não existe.)
3. **B6 · háptico** — zero chamadas no repositório inteiro, com dois atuadores
   disponíveis e confirmados na sessão. Distância do aceite: 100 %. É também o
   item de menor custo desta lista, o que torna o zero mais estranho.

Menção obrigatória, porque não é "longe" e sim **grave**: **F4 · o preset que
não volta** (§3.1). Está a uma linha de código do aceite e mesmo assim é a pior
notícia da rodada, porque prova que a peneira de testes desta frente ainda
aprova produto que ninguém dirigiu.

---

## 5. O que ficou NÃO MEDIDO (e por quê)

- **E1, E3, E4, E5, F1** — só existem no aparelho, com `adb` e OVR Metrics.
  Não rodei o passo 4 do §12 nesta rodada.
- **I1 (as 20 caixas), G4 (legibilidade), G5 (captura)** — exigem um humano de
  headset. **Sem as 20 caixas marcadas, a rodada não está validada** — isso
  continua valendo mesmo com tudo o mais verde.
- **C4 (escala em metros), C5 (corpo em 1ª pessoa), I3 (intrusão no plano
  near)** — cabiam nesta rodada e ficaram de fora por orçamento de sessão.
- **B5 segunda metade** (recuo reduz com duas mãos) — medi a grandeza errada na
  primeira tentativa e preferi declarar não medido a publicar número falso.
- **D1 metade do BR** (pular da nave, abrir o paraquedas, abrir o baú do BR) —
  provei que o `KeyboardEvent` sai e chega ao DOM; não executei a partida de BR
  para aferir o efeito.
- **D6, H2** — sem UI no mundo não há o que medir em H2; D6 não foi roteirizado.
- **G2 (4× MSAA no alvo XR), G3 (resolução por olho)** — o IWER não expõe o
  framebuffer real.
- **C1 fora do terreno manso** — escada da Torre Nexus, interior da cidade e
  castelo não foram visitados. A folga constante que medi vale para campo
  aberto.

---

## 6. Se o dono puser o headset agora, o que ele reclama primeiro

Na ordem em que os segundos passam:

1. **"Continua feio."** É a primeira coisa que a retina entrega, antes de
   qualquer ação. A foveação saiu de 1,0 (máxima, borra a periferia inteira) para
   0,2 e o antialiasing deixou de ser zero — as duas maiores correções de imagem
   da rodada são reais. Mas 500 a 790 draw calls e 1,6 M de triângulos em
   estéreo não cabem no orçamento de 13,7 ms, e a sessão ainda nasce a 90 Hz
   porque ninguém declara 72. Ele não vai dizer "draw call": vai dizer que
   **treme**.
2. **"Cadê a munição? Cadê a vida?"** Aos dez segundos. 0 de 17 itens de HUD no
   mundo. Ele vai perguntar quantas balas tem e não vai ter onde olhar.
3. **"Por que eu corro assim?"** Ao primeiro toque no analógico. 5,2 m/s andando
   e 8,6 m/s correndo, com 0,30 s de rampa e a vinheta fechando 84 % também no
   giro. Este é o item que **não mudou nada** desde a reprovação anterior, e é o
   que produz enjoo de verdade — os outros produzem irritação.
4. **"A arma sumiu."** Ao primeiro gesto de mirar. Ele vai fazer exatamente o que
   pediu — trazer a coronha ao rosto para ver pelo buraco da alça — e vai cair na
   faixa de 6 cm em que o ADS está ligado e a arma está invisível (§3.2).
   A ironia é dura: **B1, B2, B3 e B4 ficaram perfeitos** (zero em tudo) e o
   gesto que eles vieram servir esbarra na guarda de outra frente.
5. **"Não sinto nada quando atiro."** Zero háptico, dois atuadores na mão.
6. **"Como eu paro isso?"** Quando quiser pausar, abrir o menu ou sair. Não
   existe caminho. Ele tira o headset — e aí descobre que **o jogo não pausou**
   (F2) e que **o monitor ficou com as sombras cortadas** (§3.1).

O que ele **não** vai reclamar, e vale dizer em voz alta porque foi trabalho
bem feito: o giro parou de deslizar (0,0000 m em 32 casos, inclusive a 2 m do
centro), o corpo passou a seguir a cabeça em pé (0,000 m de separação), a arma
está na palma nas oito armas (0,0000 m) e o tiro sai da linha de mira (0,00°).
Quatro das cinco queixas originais do dono foram atacadas na raiz e três delas
estão medidas como resolvidas.

A quinta — *"a qualidade está horrível"* — continua de pé, e é a que vai falar
primeiro.
