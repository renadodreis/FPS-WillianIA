# Validação da rodada — commit `3cc8eea`

Data: 2026-08-26 · branch `dev` · three r0.185.1 · IWER 2.3.0
Autor: o **validador**. Executa o procedimento da §12 de `criterio-aaa.md`.
Não escreve código, não escreve teste. Escreve o que reprova.

> **Veredito: RODADA DEVOLVIDA.** 22 critérios verdes, 10 vermelhos, 15 não
> medidos. A regra do documento não admite média: um vermelho devolve.
>
> **É a melhor rodada até aqui, e é também a que mais quebrou coisa que
> funcionava.** Quatro critérios saíram do vermelho (**A3, A4, A5, F4**) e um
> quinto (E1) teve a metade que dá para medir aqui resolvida. Cinco dos seis
> defeitos que devolvi na rodada passada estão **medidos como resolvidos**
> (§4).
>
> O que devolve, além dos oito vermelhos herdados:
>
> 1. **`F3` piorou 5,2× a 9,4×.** Apertar o botão de recentrar do sistema agora
>    **desloca o jogador no mundo pela distância inteira** entre a cabeça dele e
>    o centro do guardian — medido 0,7778 m e 1,4142 m, contra 0,150 m na
>    rodada passada. O teto de `PASSO_MAX` existia para separar "recentrar" de
>    "andar"; ao devolver o excedente ao acumulado, a rodada **desfez a
>    correção que a rodada anterior tinha feito**.
> 2. **`C2` regrediu de verde para vermelho.** Morto ou voando, a separação
>    cabeça↔colisor voltou a ser **ilimitada** — medi 5,000 m. Em `bbe6b48` era
>    0,000 m nos dois estados.
> 3. **A terceira geração do defeito do passo existe e está medida.** O teto
>    novo do acumulado (`RESIDUO_MAX = 2,0`) descarta tudo o que passa disso
>    **num único frame**, e como a cabeça vai para `(x,z) + passo`, o descarte é
>    um **teleporte de vista**: 2,5 m → 0,350 m · 3,0 m → 0,850 m · 5,0 m →
>    2,850 m.
> 4. **`XRAndar.proximo()`, `preferir()`, `ORDEM` e `ROTULOS` não têm um único
>    chamador em produção.** Os três perfis de velocidade existem, funcionam, e
>    **o jogador de headset não tem como escolher nenhum**: o painel tem seis
>    linhas e nenhuma é velocidade. É a quarta vez neste porte que encontro
>    código pronto sem fiação.

---

## 0. Condição da medição (sem isto não é medida)

- **Árvore isolada por cópia.** Duas outras frentes estão editando o repo agora
  (social do BR em `js/xr/xrsocial.js` e `js/xr/xrui.js`; desempenho). Para que
  a medição não pudesse ser contaminada no meio, extraí `git archive 3cc8eea` e
  `git archive bbe6b48` para o scratchpad e **medi nas cópias**, com
  `md5sum` conferido contra `git show` para `game.js`, `js/xr/xrrig.js` e
  `js/xr/xrlocomotion.js`. Nada foi editado no produto nem nos testes.
- **Carga da máquina: `load average` 2,65–2,97** — acima do 1,5 que o §12 pede.
  Declaro e explico por que as medições valem assim mesmo: nenhum número deste
  documento é tempo de frame. Contagem (draw calls, triângulos) não depende de
  carga; distância e velocidade são integradas por `damp`, que é independente
  de framerate — e a prova está no próprio artefato: o PC deu **5,2000 e
  8,6000 m/s nos dois commits**, e as sessões desenharam 191–192 frames em
  3,2 s (≈ 60 fps), sem sinal de sessão travada. **O que eu não posso medir com
  a máquina assim é tempo, e tempo já estava fora do meu alcance por ser do
  aparelho.**
- Sessão `immersive-vr` **real**, runtime IWER 2.3.0 preset Meta Quest 3,
  Chrome com GPU real (`QA_GPU=gpu`), servidor local, seed 424242,
  `test/helpers/iwer.js → bootEmVR`, `XR.presenting === true` confirmado em
  todas as sondas.
- **Onze sessões independentes**, portas **3480 a 3489** (faixa combinada com as
  outras duas frentes). Sondas descartáveis no scratchpad.
- **Não rodei `npm test`** (proibido nesta rodada) — a afirmação "1540/1540"
  fica **não verificada por mim**. Rodei `npm run lint`: **limpo**.
- `npm run vr:emulado` (E2) rodou na cópia de `3cc8eea`, porta 3485.
- O que só existe no aparelho (E1 tempo, E3, E4, E5, F1) e o que só existe com
  um humano de headset (I1, G4, G5) está marcado **NÃO MEDIDO**, não "aprovado".

---

## 1. Placar por categoria

| Categoria | Verde | Vermelho | Não medido | Antes (bbe6b48) |
|---|--:|--:|--:|---|
| A — Giro e locomoção | 5 | 1 | 0 | 2 / 4 / 0 |
| B — Mira e empunhadura | 4 | 2 | 1 | 4 / 2 / 1 |
| C — Corpo, altura, escala | 3 | 1 | 2 | 4 / 0 / 2 |
| D — Interação com o mundo | 3 | 2 | 1 | 3 / 2 / 1 |
| E — Desempenho | 0 | 1 | 4 | 0 / 2 / 3 |
| F — Boot e ciclo de sessão | 2 | 2 | 1 | 1 / 3 / 1 |
| G — Qualidade de imagem | 2 | 0 | 3 | 2 / 0 / 3 |
| H — HUD e UI no mundo | 2 | 1 | 0 | 2 / 1 / 0 |
| I — Ausência de defeito grosseiro | 1 | 0 | 3 | 1 / 0 / 3 |
| **Total (47)** | **22** | **10** | **15** | **19 / 14 / 14** |

**Virou verde:** A3 · A4 · A5 · F4.
**Saiu do vermelho para NÃO MEDIDO:** E1 — a metade medível aqui (**declarar a
taxa**) está resolvida; o FPS real continua sendo do aparelho.
**REGREDIU (verde → vermelho):** **C2**.
**Continua vermelho:** A6 · B6 · B7 · D1 · D3 · E2 · F3 · F5 · H1 — sendo que
**A6 mudou de causa pela terceira rodada seguida**, **B6 saiu de "zero" para
"falta um evento"**, e **F3 piorou 5,2× a 9,4×**.

Números centrais:

| Grandeza | bbe6b48 | Agora (3cc8eea) | Alvo |
|---|--:|--:|---|
| Velocidade de caminhada em VR | 5,200 m/s | **1,693 m/s** | ≤ 2,0 |
| Velocidade de corrida em VR | 8,600 m/s | **2,800 m/s** | ≤ 4,0 |
| Tempo até 95 % da velocidade | 302 ms | **49,6 ms** (andar) · **45,7** (correr) | ≤ 150 |
| Velocidade no MONITOR (medida, não lida) | 5,200 / 8,600 | **5,200 / 8,600** | igual |
| Rampa no monitor | 271 ms | **283,5 ms** | igual |
| Vinheta 1,5 s depois de parar | 0,01372 | **0,00697** | ≤ 0,0100 |
| `session.frameRate` dentro da sessão | 90 | **72** | 72 |
| Pulsos hápticos por evento de arma | 0 de 6 | **5 de 6** | 6 de 6 |
| Cabeça anda no mundo, MORTO (passo de 0,80 m) | **0,000 m** | **0,800 m** | 0,800 |
| Separação cabeça↔colisor, MORTO (passo de 5 m) | 0,000 m | **5,000 m** | ≤ 0,10 |
| Salto de vista ao reviver depois de 3 m morto | 0,000 m | **0,850 m** | 0 |
| `dev.recenter()` a 0,78 m → jogador deslocado | 0,150 m | **0,7778 m** | ≤ 0,02 |
| `dev.recenter()` a 1,41 m → jogador deslocado | 0,150 m | **1,4142 m** | ≤ 0,02 |
| Pausa + andar 1 m + retomar → salto da vista | 0,850 m | **0,020 m** | 0 |
| Salto de rastreio de 1,442 m → vista arrastada depois | 1,292 m | **0,00001 m** | 0 |
| Painel de VR sobra no desktop ao sair | **sim** | **não** (desmontado) | não |
| Zona e tempo do BR no HUD do pulso | `''` / `''` | **`00:26` · `⭘ zona fecha em 2:48`** | preenchidos |
| `JOGAR DE NOVO` na morte online | existe e é morto | **não existe** | não existe |
| Pular da nave · paraquedas · baú do BR pelo controle | não executado | **os três funcionam** | funcionam |
| Armas alcançáveis pelo ciclo do controle | 3 de 8 | **8 de 8** | 8 |
| Draw calls / triângulos em estéreo | 437–730 / 1,32–1,87 M | **418–558 / 1,34–1,89 M** | ≤ 180 / ≤ 500 k |
| Draw calls no MONITOR (spawn/cidade/castelo) | 204 / 97 / 224 | **189 / 95 / 196** | — |
| Perfis de velocidade alcançáveis no headset | — | **0 de 3** | 3 |

---

## 2. Critério a critério

Legenda: 🟢 aprova · 🔴 reprova · ⚪ não medido.

### A — Giro e locomoção

| # | Veredito | Medido |
|---|---|---|
| A1 · giro não translada a cabeça | 🟢 | **0,0000 m em 8 casos** (2 modos × 4 deslocamentos: 0,71 · 1,0 · 1,4 · 1,22 m fora do centro). Yaw aplicado −45,000° em passos e −68,5 a −69,2° em contínuo. O pivô na cabeça sobreviveu às duas rodadas. |
| A2 · passo é escolha do jogador | 🟢 | Herdado. `js/xr/xrturn.js` intocado desde `bbe6b48`; o painel medido nesta rodada tem as linhas **GIRO**, **VELOCIDADE DO GIRO** e (no modo em passos) **ÂNGULO DO PASSO**. Ângulos não re-medidos — código idêntico. |
| A3 · velocidade humana | 🟢 | **VIROU VERDE.** Em sessão, 192 frames por medição: **andar 1,6930 m/s** (regime = máximo, teto 2,0) e **correr 2,8000 m/s** (teto 4,0). Perfil `conforto`, padrão de fábrica, aplicado por `onEnter`. Ressalva grave que **não** reprova A3 mas reprova D1 e cria um problema de partida: a "velocidade de PC disponível como opção" existe no módulo (`paridade`, medida em **8,6000 m/s** dentro da sessão) e **não tem linha no painel** — ver §3.4. |
| A4 · aceleração instantânea | 🟢 | **VIROU VERDE.** **49,6 ms** até 95 % andando e **45,7 ms** correndo (teto 150). Amostrado por frame de sessão. Contraprova na mesma bateria: com o perfil `paridade` a rampa volta a **282,6 ms**, e no monitor deu **283,5 ms** — ou seja, o número mede a política, não o instrumento. |
| A5 · vinheta some ao parar | 🟢 | **VIROU VERDE.** Receita literal do §12 (andar 2 s, parar 1,5 s): **0,00697** contra teto 0,0100. Continua caindo: 3 s → 0,000151; 5 s → 0,0000009. Pico andando 0,3081. Segunda metade do critério já estava: a vinheta é desligável no painel. **Honestidade sobre a causa:** ela não foi consertada, ela **caiu junto com a velocidade** — o pico ficou menor porque o jogador anda menos. Girar continuamente ainda leva o túnel a **0,8456**. |
| A6 · nada além do pescoço move a vista | 🔴 | **A causa antiga morreu; nasceram três.** O congelamento no estado MORTO — a regressão que eu chamei de pior notícia da rodada passada — **está resolvido**: passo físico de 0,80 m → cabeça andou **0,800 m morto**, e 5,00 m → **5,000 m**. Reprova por: **(a)** `dev.recenter()` **teleporta a vista 0,7778 m e 1,4142 m num único frame** (§3.1); **(b)** passo acumulado acima de 2,15 m em estado sem dreno vira **salto de vista de até 2,850 m num frame** (§3.2); **(c)** andar fisicamente contra um sólido **congela a vista**: 3,0 m de passo físico contra um carro moveram a cabeça **0,560 m** — o jogo comeu 2,44 m de rastreamento sem avisar (§3.3, e este é **anterior** a esta rodada). |

### B — Mira e empunhadura

| # | Veredito | Medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | 🟢 | Herdado. `js/xr/xrweapon.js` e `js/xr/xrhands.js` **não aparecem no diff** `bbe6b48..3cc8eea`. |
| B2 · 1:1 sem bob nem sway | 🟢 | Herdado, mesmo motivo. |
| B3 · dá para ver pelo buraco | 🟢 | Herdado, mesmo motivo. |
| B4 · botão de mirar não teleporta | 🟢 | Herdado, mesmo motivo. |
| B5 · segunda mão importa | ⚪ | A metade "o recuo reduz de forma medível com duas mãos" continua sem medida. |
| B6 · háptico em toda ação | 🔴 | **De 0 para 5 dos 6 eventos da lista — e reprova pelo sexto.** Medido no registro do próprio runtime (`IWER.P_GAMEPAD.lastPulse`), pelo caminho REAL: **tiro** com o gatilho → `0,31 / 27 ms` na mão direita, com bala saindo; **dano** por `playerDamage` → `0,46 / 78 ms` nas **duas** mãos, valores iguais; **recarga** pelo botão Y → `0,40 / 45 ms` na **esquerda** (o carregador sai da mão de apoio) e `0,75 / 30 ms` na **direita** no fim (ferrolho); **acerto** → `0,35 / 22 ms`. O que falta é **pegar item**: `planoDePulso` tem `case 'pegar'` e `PRIORIDADE.pegar = 10`, e `grep XRTato.emitir` no repo inteiro devolve oito sítios — **nenhum é `'pegar'`**. Plano pronto, sem emissor. |
| B7 · o tiro sai do cano | 🔴 | Código intocado desde `98b114f`: origem do tiro a **0,437 m (faca) a 0,910 m (bazuca)** da boca do cano, teto 0,05 m. |

### C — Corpo, altura e escala

| # | Veredito | Medido |
|---|---|---|
| C1 · nunca enterrado | 🟢 | Quadrado de 2 m, 9 amostras, três lugares: **1,6000 m constante, amplitude 0,0000 m** no spawn, na cidade (`heliSpot`) e no castelo (`FORT_POS`). Janela 1,20–2,10. **Ressalva nova, e ela encolheu a margem:** num estado sem dreno (morto), depois de 1,8 m de passo físico em terreno inclinado perto do castelo, a folga caiu para **1,2514 m** — ainda dentro da janela, mas com 5 cm de sobra onde antes havia 40. É consequência direta de C2. |
| C2 · o corpo segue a cabeça | 🔴 | **REGREDIU DE VERDE PARA VERMELHO.** Pela receita literal do §12 (quadrado de 2 m, 440 frames) o número é ótimo: separação **máxima 0,040 m, final 0,000 m**. Reprova pela cláusula "≤ 0,10 m **em todos os frames**", que foi exatamente o critério com que esta linha ficou verde na rodada passada: morto, a separação é **ilimitada** — medi **0,800 m** com 0,80 m de passo e **5,000 m** com 5,00 m; voando, **0,800 m**. Em `bbe6b48` os dois estados davam **0,000 m**. Registro os dois números para ninguém ser enganado pela escolha de régua: **na receita, verde; no texto do critério, vermelho.** Mudar a régua entre rodadas para preservar um verde seria exatamente o que eu cobro dos outros. |
| C3 · altura do aparelho, agachar de verdade | 🟢 | Herdado (`js/xr/xrbody.js` intocado). |
| C4 · escala 1:1 em metros | ⚪ | Não medido. |
| C5 · corpo em 1ª pessoa coerente | ⚪ | Não medido. |
| C6 · o avatar que os OUTROS veem | 🟢 | Herdado no yaw (erro 0,000°). **Ressalva nova:** com a separação de C2 solta nos estados sem dreno, a POSIÇÃO do avatar remoto passa a divergir da cabeça nesses estados. Não medi em dois clientes; registro a implicação. |

### D — Interação com o mundo

| # | Veredito | Medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | 🔴 | **O BR inteiro fechou, e eu executei.** Em partida de verdade (`startBRMatchInShip`, bot host): **pular da nave** com o botão A → fase `SHIP` → `FALL`; **abrir o paraquedas** com o mesmo botão → `chuteOpen` `false` → `true`; **abrir o baú do BR** com o botão X → `opened` `false` → `true` (65 baús na partida); **armas 4–8** → o ciclo do botão B percorre os índices `3,4,5,6,7,0,1,2` (**8 de 8**, era 3 de 8). O mecanismo que destravou tudo é `teclaXR` despachando `KeyboardEvent` de DOM de verdade — o caminho que o celular já usava. Reprova por **cinco ações sem mapeamento nenhum**: **lançar granada** (`KeyG`), **usar kit médico** (`KeyQ`), **comer** (`KeyF`), **trocar acessório de mira** (`KeyT`) e **chat** (`Enter`) — nenhum dos 11 verbos de `ler()` corresponde a eles. E por uma sexta que nasceu nesta rodada: **escolher o perfil de velocidade** (§3.4). Ciclar espectador passou a ser alcançável pelo mesmo `Space` do pulo — mecanismo verificado no listener, efeito não executado. |
| D2 · alcance medido da cabeça | 🟢 | Vivo, a separação é 0,000–0,040 m em todos os frames medidos, e a interação só existe vivo. |
| D3 · pegar é com a EMPUNHADURA, e perto | 🔴 | `js/xr/xrinput.js` e `js/xr/xrinteract.js` intocados: grip esquerdo = agachar, direito = mirar; pegar continua no botão de polegar com raio de metros. |
| D4 · affordance dentro do mundo | 🟢 | Herdado (`xrinteract.js` intocado). |
| D5 · veículo sem quebrar cabeça nem chão | 🟢 | Entrou e saiu do buggy em sessão (`driving: true` confirmado por frame). Dentro do carro **nenhum salto imposto**: maior deslocamento de vista num frame = **0,0066 m**. O rastreamento responde parcialmente (0,521 m de vista para 0,800 m de passo, com o carro se movendo junto — não isolei as duas contribuições). Salto ao SAIR: **2,5955 m**, mesma ressalva da rodada passada — não separei quanto é o ponto de desembarque do jogo, que existe no desktop também, e **não reprovo por número que não separei**. |
| D6 · tudo alcançável de posição fixa | ⚪ | Não roteirizado. |

### E — Desempenho

| # | Veredito | Medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | ⚪ | **Saiu do vermelho.** A metade que dá para medir aqui está feita e verificada em sessão: `session.frameRate` = **72**, `supportedFrameRates` = `[72, 80, 90, 120]`, `XRTaxa.mudancas` = `[72]` (um pedido só), orçamento **13,889 ms**. A sessão nascia a 90 por herança. O resto — mediana, nada abaixo de 60, stale frames — é do aparelho. |
| E2 · orçamento em estéreo | 🔴 | `scripts/vr-emulado.js`, sessão estéreo: **menu 420 · spawn 418 · cidade 466 · castelo 558** draw calls; **1,66 M · 1,66 M · 1,34 M · 1,89 M** triângulos. Tetos 180 / 500 k → reprova por **2,3× a 3,1×** em calls e **2,7× a 3,8×** em triângulos. Melhora real e concentrada: **castelo 730 → 558 (−23,6 %)**; menu 437→420, spawn 439→418, cidade 464→466 (+0,4 %). O "−28 %" que a rodada anuncia é do **subtotal do bloco de mundo** (702→508), não do quadro. |
| E3 · escala de render ≥ 85 % | ⚪ | Aparelho. |
| E4 · lógica de app ≤ 2 ms | ⚪ | Aparelho. |
| E5 · térmica 30 min | ⚪ | Aparelho. |

### F — Boot e ciclo de sessão

| # | Veredito | Medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | ⚪ | Aparelho, cache frio, N ≥ 7. |
| F2 · foco perdido | 🟢 | Herdado; e reconfirmado de lado pelo teste de háptico, que exercita `visible-blurred` pelo caminho de produção. |
| F3 · recentrar não teleporta | 🔴 | **REGREDIU 5,2× a 9,4×.** A/B nos dois commits, mesma sonda, mesma máquina: headset a **0,7778 m** do centro → jogador deslocado **0,150 m** em `bbe6b48` e **0,7778 m** em `3cc8eea`; a **1,4142 m** → **0,150 m** contra **1,4142 m**. Teto 0,02 m: agora **38,9× e 70,7×**. O salto de vista num frame continua sendo o offset inteiro (0,7778 / 1,4142 m). Ver §3.1. |
| F4 · sair devolve o desktop intacto | 🟢 | **VIROU VERDE.** Depois de `XR.exit()` com o painel ABERTO — o caminho que vazava: `XRUI.aberto` **false**, painel **desmontado** (`estado().montado === false`), **nenhum** objeto de XR sobrando na cena, `XR.qualidade.dentro` **false**, câmera de volta como filha da `Scene`. A velocidade também volta inteira: plano `pc`, `5,2 / 8,6 / 2,6 / 3,4`, `aceleraSolo 11` — e medida no monitor depois de ter usado o headset dá **5,2000 e 8,6000 m/s**. Observação, não reprovação: o jogo fica **pausado** depois de sair, o que é recuperável com um clique no monitor. |
| F5 · jogável de ponta a ponta sem tirar o aparelho | 🔴 | `game.js:3174` continua `if (xrOn && !state.started && !XRUI.aberto) startGame(false)`. Não existe menu principal nem lobby no mundo; escolher modo e entrar em partida ainda exige o mouse. |

### G — Qualidade de imagem

| # | Veredito | Medido |
|---|---|---|
| G1 · foveação declarada | 🟢 | Herdado (0,2 escrito, e devolvida ao sair). |
| G2 · antialiasing em XR | ⚪ | `antialias: true`; o número de amostras do alvo de render XR continua não observável no IWER. |
| G3 · escala de framebuffer declarada | 🟢 | Herdado (0,9 pelo preset). |
| G4 · texto e mira legíveis | ⚪ | Parte humana obrigatória. |
| G5 · uma captura por entrega | ⚪ | Não gerei captura estéreo. |

### H — HUD e UI dentro do mundo

| # | Veredito | Medido |
|---|---|---|
| H1 · nada essencial só no DOM | 🔴 | **De ≈11 para ≈13 de 17.** Os dois campos **cabeados e cegos** da rodada passada estão vivos, medidos em partida de BR real: `tempo` `00:01` → `00:26` (relógio correndo) e `zona` `⭘ zona fecha em 3:13` → `2:48`. Reprova por cinco: **minimapa · chat · placar · menu principal · lobby**. |
| H2 · UI não é colada na cara | 🟢 | Painel de pausa em sessão: **1,0040 m** do olho, **34,32° × 26,08°**, seis linhas. Idêntico à rodada passada. |
| H3 · o retículo não mente | 🟢 | Por ausência declarada, que é a saída que o critério autoriza. |

### I — Ausência de defeito grosseiro

| # | Veredito | Medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | ⚪ | Exige um humano de headset. Nenhuma caixa marcada. |
| I2 · zero erro de console | 🟢 | `__game.errors` **vazio nas onze sessões**, incluindo a partida de BR completa (nave → queda → paraquedas → pouso → baú → troca de armas → morte). Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | ⚪ | Não amostrado nesta rodada. |
| I4 · nenhum estado sem saída | ⚪ | Continua sem roteiro completo. Ganho verificado: com o `KeyboardEvent` real, **nave, queda e espectador** deixaram de ser becos por falta de tecla. |

---

## 3. Os defeitos NOVOS, com a medição que prova

### 3.1 · Recentrar voltou a arrastar o jogador — e agora arrasta o dobro

É o pior defeito da rodada, e ele é a **desfeita de uma correção anterior**.

`js/xr/xrrig.js` deixou de descartar o excedente do passo:

```
const k = limite / m;
out.x = passoX * k; out.z = passoZ * k;
passoX -= out.x; passoZ -= out.z;      // ← o resto CONTINUA no acumulado
```

O docblock que está três linhas acima, e que ninguém apagou, explica exatamente
por que isso não pode ser assim:

> *"**Recentrar não é andar.** `recenter()` muda a ORIGEM, não move ninguém — e
> o jogador era deslocado no mundo pela distância dele ao centro (medido:
> 0,72 m e 0,59 m). O rig não distingue os dois; **o teto distingue**."*

O teto parou de distinguir. Ele agora só espalha o deslocamento por alguns
frames — e entrega **tudo**.

A/B na mesma sonda, mesma máquina, mesma sessão emulada:

| Headset a | jogador deslocado em `bbe6b48` | em `3cc8eea` | teto |
|---|--:|--:|--:|
| 0,7778 m do centro | 0,150 m | **0,7778 m** | 0,02 m |
| 1,4142 m do centro | 0,150 m | **1,4142 m** | 0,02 m |

E o salto de vista num único frame continua sendo o offset inteiro
(**0,7778 m** e **1,4142 m**).

**Por que isso importa mais do que o número sugere:** recentrar é o primeiro
gesto de quem põe o headset — é como o jogador alinha a frente do jogo com a
frente da cadeira dele. No Quest é um botão do sistema, fora do alcance do
jogo. Quem se senta 1,4 m fora do centro do guardian e aperta esse botão é
**teleportado 1,4 m dentro do mapa**, do lado de fora ou de dentro de uma
parede, sem ter dado um passo.

### 3.2 · A terceira geração do defeito do passo: o teto do ACUMULADO teleporta a vista

`consumirPasso` já teve duas versões erradas (represava; depois descartava por
frame). A terceira tem um teto novo, no acumulado:

```
const r = Math.hypot(passoX, passoZ);
if (r > RESIDUO_MAX) { const kr = RESIDUO_MAX / r; passoX *= kr; passoZ *= kr; }
```

`RESIDUO_MAX = 2,0`. Esse corte acontece **de uma vez, num frame**, e como
`place()` põe a cabeça em `(x,z) + passo`, cortar o acumulado é **mover a
cabeça**.

Varredura em sessão — o jogador anda X metros fisicamente enquanto está morto
(estado sem dreno) e depois volta a viver:

| Passo físico acumulado | Salto de vista num frame ao voltar |
|--:|--:|
| 1,0 m | 0,00001 m |
| 2,0 m | 0,00001 m |
| 2,5 m | **0,3500 m** |
| 3,0 m | **0,8501 m** |
| 5,0 m | **2,8501 m** |

A fórmula é exata: `X − 2,15`. E o mesmo A/B mostra que **isto é novo**: em
`bbe6b48`, 3,0 m morto davam **0,000 m** de salto.

Os estados que acumulam sem dreno são **morto**, **dirigindo** e **voando** —
os três em que o jogador fica parado por muito tempo e naturalmente se mexe na
cadeira ou no cômodo. O acumulado é deslocamento LÍQUIDO, então o teto de
verdade é a diagonal da área de jogo: numa sala de 2 × 2 m (o mínimo da loja) o
salto máximo é 0,68 m; numa de 3 × 3 m, **2,05 m**.

**O que estava certo e virou errado:** a intenção da mudança — parar de
descartar para não arrastar a vista — está **medida como correta e é uma
conquista real**. Os dois defeitos §3.2 e §3.3 da rodada passada morreram:

| Evento | bbe6b48 | Agora |
|---|--:|--:|
| Cabeça anda no mundo, MORTO, passo de 0,80 m | 0,000 m | **0,800 m** ✔ |
| Salto de rastreio de 1,442 m → vista arrastada depois | 1,292 m | **0,00001 m** ✔ |
| Pausa → andar 1 m → retomar → salto da vista | 0,850 m | **0,020 m** ✔ |

O erro foi **guardar o mesmo remédio (cortar de uma vez) num lugar novo**.

### 3.3 · Andar fisicamente contra um sólido congela a vista (defeito ANTERIOR, medido pela primeira vez)

Isto fecha a pendência que eu mesmo abri e retratei na rodada passada
("o passo físico atravessa parede" — retratado por método inválido). Refiz com
um obstáculo que eu mesmo coloco e verifico.

Jogador andando **3,0 m fisicamente** (2 cm por frame) na direção de um carro
parado a 2,6 m:

| | Medido |
|---|--:|
| Passo físico pedido | 3,000 m |
| **Cabeça andou no mundo** | **0,560 m** |
| Colisor andou | 0,560 m |
| Mesmo trecho pelo ANALÓGICO | 0,560 m |

Duas conclusões, as duas úteis:

1. **A parede vale para o passo físico** — o passo é barrado exatamente onde a
   locomoção normal é barrada (0,560 m nos dois). Minha retratação estava
   certa: não há wallhack. A cláusula de parede de C2 fica **medida e
   aprovada**.
2. **E o preço é a vista.** O jogador andou 2,44 m no quarto dele e o mundo não
   acompanhou. É nominalmente o que o Oculus BPG e a lista da Meta proíbem
   (*"ignorar ou sobrescrever o movimento da cabeça"*) e o que a
   VRC.Quest.Functional.5 cobra. **Não é novo desta rodada** — a cabeça sempre
   foi fixada sobre o colisor. É novo que esteja medido. O gênero resolve isso
   com escurecimento da vista quando o corpo real entra em geometria virtual;
   aqui não há nada.

### 3.4 · Os três perfis de velocidade não têm como ser escolhidos pelo jogador

`js/xr/xrlocomotion.js` exporta `ORDEM`, `ROTULOS` e `proximo()` com um
comentário explícito sobre para quem eles servem:

> *"Ordem em que o painel do headset cicla... **Exportada para o painel
> (js/xr/xrui.js) não repetir a lista**: painel com um perfil a mais ou a menos
> que o módulo é controle que não faz nada."*

`grep` no repo inteiro:

| Símbolo | Chamadores em produção |
|---|--:|
| `XRAndar.proximo` | **0** |
| `XRAndar.preferir` | **0** |
| `ORDEM` / `ROTULOS` fora do módulo | **0** |

E o painel, medido em sessão, tem exatamente seis linhas: `RETOMAR`, `GIRO`,
`VELOCIDADE DO GIRO`, `VINHETA DE CONFORTO`, `RECENTRAR A VISTA`, `SAIR DA
PARTIDA`. **Nenhuma é velocidade.**

Como `preferir()` é o único escritor da preferência no `localStorage`, o perfil
fica **travado em `conforto` para sempre**, em toda sessão, para todo jogador.

Isso não é só uma opção faltando. O próprio cabeçalho do módulo diz por que
`paridade` existe:

> *"Aqui headset e monitor jogam a MESMA partida. Escala humana em VR é
> desvantagem MEDÍVEL: o gás da fase 1 fecha a 5,50 m/s e o da fase 2 a
> 4,38 m/s (`buildPlan`, server.js), acima da corrida de qualquer perfil
> confortável. **Por isso `paridade` existe.**"*

Conferi o `buildPlan`: raios `[560, 340, 200, 110, 55, 24]`, encolhimentos
`[40, 32, 26, 22, 18]` s → **5,50 · 4,38 · 3,46 · 2,50 · 1,72 m/s**. A corrida
do perfil travado é **2,800 m/s**. Nas **três primeiras fases** o gás fecha mais
rápido do que o jogador de headset consegue correr. A rodada entregou o
conforto e trancou a saída de emergência do lado de fora.

É a **quarta** vez neste porte que encontro código pronto sem fiação —
`setFramebufferScaleFactor` (rodada 1), `XRUI.exit()`/`XRHud.exit()` (rodada 2),
e agora `XRAndar.proximo()` e `planoDePulso('pegar')`.

### 3.5 · `'pegar'` é um plano de háptico sem emissor

`js/xr/xrhaptics.js` define `case 'pegar': return [pulso(mao, 0.45, 40,
'pegar')]` e `PRIORIDADE.pegar = 10`. Os oito `XRTato.emitir` do repo inteiro
são: `acerto`, `recarga`, `recarga-pronta` (×2), `tiro`, `dano`, `ui-foco`,
`ui-toque`. **Nenhum é `pegar`.**

A lista do critério B6 é fechada e inclui "pegar item". Com cinco dos seis
eventos vibrando, o silêncio no sexto é pior do que se nada vibrasse: o jogador
já aprendeu que a mão responde, e vai ler a ausência como "não peguei".

---

## 4. O que EU tinha reprovado e está resolvido, com o número

| Defeito da rodada passada | Estado | Medido agora |
|---|---|---|
| §3.1 painel e HUD de VR ficam no DESKTOP depois de sair | **RESOLVIDO** | Saindo com o painel ABERTO: `XRUI.aberto false`, painel **desmontado**, zero objetos de XR na cena, `qualidade.dentro false`, câmera filha da `Scene`. `onExit` passou a chamar `XRUI.exit()` e `XRHud.exit()`. |
| §3.2 rastreamento posicional CONGELA quando o jogador morre | **RESOLVIDO** | Passo físico de 0,80 m morto → cabeça andou **0,800 m** (era 0,000). Com 5,00 m → **5,000 m**. O dreno voltou a ser condicional e o acumulado protege a cabeça. |
| §3.3 teto de 0,15 m paga em TELEPORTE DA VISTA | **RESOLVIDO nos dois casos que eu medi, e ressuscitado num terceiro** | Salto de rastreio de 1,442 m: a vista salta o 1,442 (que é o movimento real da cabeça) e depois **não é arrastada**: 0,00001 m por frame durante os 10 frames de escoamento (era 1,292 m de arrasto). Pausa → andar 1 m → retomar: **0,020 m** (era 0,850). **Mas** o mesmo remédio, aplicado ao acumulado, criou §3.2 acima — e ao sumir com o descarte, quebrou F3 (§3.1). |
| §3.4 `JOGAR DE NOVO` é botão morto em partida online | **RESOLVIDO** | Em partida de BR real com `__BR_active` ligado, o painel de morte oferece **só `sair`**. `podeReaparecer: () => !window.__BR_active`. |
| §3.5 zona e tempo do BR chegam como string vazia | **RESOLVIDO** | Medido em partida: `tempo` `00:01` → `00:26`, `zona` `⭘ zona fecha em 3:13` → `⭘ zona fecha em 2:48`. |

**E o que a rodada fez além do que eu tinha pedido, verificado
independentemente:**

- **A fusão de GLB não regrediu o PC.** A/B no monitor, mesma sonda:
  spawn **204 → 189** calls (735 360 → 735 384 triângulos), cidade 97 → 95
  (324 900 → 336 990, **+3,7 % de triângulo** — merge custa culling por peça),
  castelo **224 → 196** (625 052 → 604 966). Os seis barris: **20 malhas → 1**,
  **4535 triângulos idênticos**, caixa de mundo batendo em ~4 cm (o desvio é da
  minha amostragem de 60 vértices). Mercado inalterado. Pássaros: **uma
  `InstancedMesh` de 15** e continuam voando (6,18 a 17,75 m de deslocamento em
  60 ticks). **Zero erro de console** nos dois commits.
- **A troca de perfil não deixa resíduo.** Ciclando `conforto → alcance →
  paridade` dentro da sessão e saindo: no monitor o plano volta a `pc` com
  `5,2 / 8,6 / 2,6 / 3,4` e `aceleraSolo 11`, e a velocidade **medida** no
  monitor depois disso é **5,2000 e 8,6000 m/s**. O perfil `alcance` entrega
  **6,000 m/s** de corrida, como projetado.
- **A regressão que a própria rodada declara ter introduzido e corrigido
  (`accelK = 0`, "o jogador não andava nem no monitor") não existe mais**:
  medida no monitor, sem nunca entrar em XR, nos dois commits — 5,2000 / 8,6000
  m/s, rampa 283,5 ms (`3cc8eea`) contra 271,0 ms (`bbe6b48`).

---

## 5. Testes que não podem falhar, e um que cobra o defeito

Auditei os oito arquivos que o pedido nomeia. Os de háptico e de locomoção são
**os melhores testes desta frente até hoje** — `xr-haptics` aperta o gatilho de
verdade e lê o registro do runtime sem embrulhar nada, e `xr-locomotion` mede
m/s em sessão com `renderer.info.render.frame` no registro para não poder
passar com a sessão parada. As cinco asserções que a rodada diz ter refeito
foram refeitas na direção certa (as constantes do próprio módulo saíram do lado
direito da comparação).

O que achei mesmo assim:

- **`test/xr-rig.test.js` · "o acumulado tem teto próprio: a cabeça não se
  perde do corpo"** — o caso novo desta rodada **exige o defeito da §3.2**:
  ele injeta um erro de rastreio de 40 m e cobra `passoPendente <= 2,01`. Ou
  seja, cobra que o excedente seja **descartado de uma vez**, que é exatamente
  o que teleporta a vista. E mede `passoPendente`, nunca a posição de mundo da
  câmera — **não existe medição de vista neste arquivo**, então o teste não tem
  como perceber o que ele está protegendo. É o irmão exato do antigo *"o passo
  é de 45 graus"*, que congelava a ausência de opção como requisito.
- **`test/xr-locomotion.test.js` · "ORDEM e ROTULOS cobrem exatamente os
  perfis que existem"** — a asserção é boa, a justificativa escrita nela é
  **falsa em produção**: *"o painel do headset cicla pela ORDEM"*. O painel não
  cicla por nada (§3.4). O teste passa e esconde que `ORDEM` e `ROTULOS` são
  código morto hoje.
- **`test/xr-locomotion.test.js` · "trocar para IGUAL AO PC devolve 8,60 m/s"**
  — o caso chama `XRAndar` direto. Prova que o módulo funciona; **nada** no
  repo prova que o jogador alcança isso. É o caso que deveria ter falhado por
  fiação faltando e não falha porque o teste é o único chamador.
- **`test/xr-quality.test.js` · "o modo agressivo corta mais"** e **"o
  framebuffer não desce ao ponto de matar a legibilidade"** — guardas de
  constante (`a.framebuffer <= n.framebuffer`, `>= 0.8`): travam decisão, não
  pegam defeito de fiação. Valem, mas não são o que anunciam.
- **`test/xr-turn.test.js` · "girar não anda com o jogador nem arrasta a cabeça
  dele"** (`cabecaMexeu < 1e-4`) — com o headset na origem do rig, rotação pura
  é tautologia. Fica redundante porque dois casos adiante fazem o mesmo fora do
  centro, que é onde a asserção tem conteúdo.
- **`test/xr-hud.test.js`** — os três que apontei na rodada passada
  (`grausTexto >= 0.7`, `anguloEncara <= 12`, "abre a ~1,0 m") continuam lá,
  intocados.

E o buraco de cobertura que esta rodada abriu: **nenhum teste mede a posição de
mundo da câmera durante o escoamento do acumulado, e nenhum teste executa
`dev.recenter()`.** `recenter` não aparece em nenhum arquivo de teste do repo.
Os dois defeitos mais graves da rodada moram exatamente onde a suíte não olha —
e o `xr-ui.test.js:346`, que afere `andou < 0.02` para o **botão RECENTRAR do
painel**, continua parecendo cobrir F3 sem cobrir (são duas coisas com o mesmo
nome; a que reprova é a do botão do sistema).

---

## 6. Interação entre frentes — o que eu procurei e o que achei

| Suspeita | Medido |
|---|---|
| O painel captura entrada e come o giro/tiro | Sem defeito: com o painel aberto o giro recebe eixo 0 e as teclas de XR são soltas. Painel a 1,0040 m, 34,32°. |
| A velocidade nova mexe na vinheta | Mexe, e para melhor: o teto passou a ser `XRAndar.correr`, o pico andando caiu para 0,3081 e A5 virou verde. **Efeito colateral não coberto:** se o jogador pudesse escolher `paridade`, o teto voltaria a 8,6 e A5 voltaria a reprovar — só que ele não pode escolher (§3.4), então o critério está verde por causa do defeito. |
| O preset mexe em sombra | Sem vazamento: `qualidade.dentro false` depois de sair, e o desktop volta com os mesmos draw calls de antes de entrar. |
| O HUD é filho da arma e o painel abre por cima | Sem colisão medida: o HUD tem `oculto` quando `state.paused`, que é o estado em que o painel abre. |
| A fusão de GLB quebra colisor de prop | Não quebra: `fuseBody` roda **depois** do `size` que vira colisor, e as caixas de mundo dos barris batem com `bbe6b48`. |
| A velocidade nova quebra o bob/anti-cheat | Bob usa `XRAndar.correr` e satura mais cedo em VR (irrelevante: em XR a arma é do rig). Anti-cheat de teleporte (`hSpd > 90 m/s`) não é tocado — a velocidade só desce. |

---

## 7. Os três critérios mais longe do aceite

1. **E2 · orçamento de submissão em estéreo** — 418 a 558 draw calls contra
   180, 1,34 a 1,89 M triângulos contra 500 k. Continua sendo o único item a um
   fator 3 do alvo e o único cuja correção não cabe em ajuste: mesmo o corte
   mais agressivo desta rodada (−194 calls no bloco de mundo do castelo) deixa
   o quadro a 3,1× do teto. É o item que não fecha sem mudar como o mundo é
   montado.
2. **F5 · jogável de ponta a ponta sem tirar o aparelho** — `startGame(false)`
   continua sendo a única entrada, e não existe menu principal nem lobby no
   mundo. Isso arrasta H1 (5 dos 17 itens que faltam são menu, lobby, placar,
   chat e minimapa) e I4. É uma fase inteira que ainda não começou, e é a
   diferença entre "dá para jogar" e "dá para usar".
3. **A6 · nada além do pescoço move a vista** — três violações medidas, e é o
   critério que mudou de causa nas três rodadas seguidas. Duas das três nasceram
   nesta rodada; a terceira (parede que congela a vista) é antiga e agora está
   medida.

Menção obrigatória, porque não é "longe" e sim **grave e novo**: **F3, o
recentrar**, que ficou 5,2× a 9,4× pior do que estava, e **§3.4, os perfis sem
painel**, que é o único defeito desta rodada com consequência de PARTIDA — o
jogador de headset não corre mais rápido que o gás nas três primeiras fases e
não tem como pedir que corra.

---

## 8. O que ficou NÃO MEDIDO (e por quê)

- **E1 (tempo), E3, E4, E5, F1** — só existem no aparelho. Não rodei o passo 4.
- **I1 (as 20 caixas), G4, G5** — exigem um humano de headset. **Sem as 20
  caixas marcadas, a rodada não está validada**, mesmo com tudo o mais verde.
- **C4 (escala em metros), C5 (corpo em 1ª pessoa), I3 (intrusão no plano
  near), D6** — cabiam e ficaram de fora por orçamento de sessão.
- **B5 segunda metade** (recuo reduz com duas mãos) — continua sem medida.
- **D1: ciclar espectador** — mecanismo verificado no listener (`Space` →
  `SPECT`), efeito não executado.
- **C6, posição do avatar** — só o yaw foi medido; a implicação de C2 está
  registrada, não medida em dois clientes.
- **G2 (4× MSAA no alvo XR)** — o IWER não expõe o framebuffer real.
- **B1/B2/B3/B4, C3, D4, F2, G1/G3, A2** — não re-medidos; os módulos
  (`xrweapon`, `xrhands`, `xrbody`, `xrinteract`, `xrinput`, `xrturn`,
  `xrcomfort`, `xrquality`, `xrsession`) **não aparecem no diff**
  `bbe6b48..3cc8eea`. Está escrito em cada linha.
- **`npm test`** — proibido nesta rodada. O "1540/1540" é declaração da rodada,
  não medição minha. `npm run lint` está limpo.

---

## 9. Se o dono puser o headset agora, o que ele reclama primeiro

Na ordem em que os segundos passam:

1. **"Agora sim."** Nos três primeiros segundos, no primeiro toque no
   analógico. **1,69 m/s andando e 2,80 m/s correndo, com 50 ms de rampa e a
   vinheta abrindo por completo quando ele para.** A queixa que não tinha mudado
   uma casa decimal em três rodadas — e que era a única que produzia enjoo em
   vez de irritação — acabou. Ele vai sentir também o **tato**: o controle
   vibra ao atirar, ao levar dano e ao recarregar, com peso diferente por arma.
   Isto merece ser dito antes de tudo, porque é a maior virada desta frente.
2. **"Por que eu andei sozinho?"** No gesto seguinte, e é o primeiro defeito
   que ele encontra. Toda pessoa que põe o headset aperta o recentrar do
   sistema para alinhar a frente. Sentado 1 m fora do centro do guardian, ele é
   **teleportado 1,41 m dentro do mapa** — e a vista dá o mesmo tranco num
   frame. Era 0,15 m na rodada passada.
3. **"Não consigo fugir do gás."** Na primeira partida de BR. O gás fecha a
   5,50 / 4,38 / 3,46 m/s nas três primeiras fases e ele corre a 2,80. O jogo
   tem o perfil `IGUAL AO PC` pronto, testado e medido — e **não há linha no
   painel para escolhê-lo**.
4. **"Encostei na parede e o mundo parou."** Quando andar fisicamente contra
   qualquer coisa sólida: 3 m de passo no quarto viram 0,56 m no jogo, sem
   aviso e sem escurecimento.
5. **"Morri, andei um pouco esperando, e quando voltei o mundo pulou."** Em BR
   a morte é longa e ele vai se mexer. Passo líquido acima de 2,15 m → salto de
   vista de `X − 2,15` num frame. Numa sala de 3 × 3 m isso chega a 2 m.
6. **"Peguei o item? Não senti nada."** Cinco dos seis eventos vibram; pegar
   item é o único mudo, e o silêncio agora significa "falhou".
7. **"Continua tremendo"** (418–558 draw calls, 1,34–1,89 M triângulos) e
   **"cadê o menu?"** (entrar em VR ainda cai direto em partida, sem menu nem
   lobby no mundo).

O que ele **não** vai reclamar, e vale registrar porque foi trabalho difícil e
bem feito: **ele pula da nave, abre o paraquedas, abre baú do BR e alcança as
oito armas só com os Touch**; **vê a zona e o relógio da partida no pulso**;
**não encontra mais um botão morto na tela de morte**; **não morre com o mundo
congelado**; **não encontra mais o painel de VR grudado no monitor** quando tira
o aparelho; **pausa, ajusta conforto e sai da partida** sem tirar o headset; e
**o monitor continua exatamente como estava** — 5,2 e 8,6 m/s, sombras
inteiras, nenhum objeto de VR sobrando.

---

## 10. Quanto do caminho até "ausência de defeito" já foi andado

A pergunta ficou sem resposta na rodada passada. Respondo com número e com
honestidade sobre o que o número não diz.

**A trajetória, em critérios verdes de 47:**

| Rodada | Verde | Vermelho | Não medido |
|---|--:|--:|--:|
| `98b114f` | 14 | 19 | 14 |
| `bbe6b48` | 19 | 14 | 14 |
| **`3cc8eea`** | **22** | **10** | **15** |

Vermelhos caindo 19 → 14 → 10; verdes subindo 14 → 19 → 22.

**Mas o denominador honesto não é 47.** Oito critérios **não podem ser
certificados por mim em nenhuma rodada**: E1 (tempo), E3, E4, E5 e F1 exigem o
aparelho; I1, G4 e G5 exigem um humano de headset. O teto do que este assento
consegue provar é **39**. Dos 39, **22 estão verdes (56 %)**, 10 vermelhos e 7
mediveis que eu ainda não medi (B5, C4, C5, D6, G2, I3, I4).

**Do que ainda falta, por natureza do trabalho** — e esta é a parte que o
percentual esconde:

- **Quatro vermelhos são fio solto: uma linha ou um `if`.**
  `B6` (um `XRTato.emitir('pegar')`), `§3.4` (uma linha no painel chamando
  `XRAndar.proximo()`), `F3` + `§3.2` (distinguir recentrar de andar, e escoar
  o excedente do acumulado em vez de cortar) e `C2` (drenar o passo também
  morto e voando, ou aceitar a separação e documentá-la). São horas, não
  semanas — e as quatro estão **medidas com o número que prova**.
- **Três vermelhos são desenho que ainda não foi feito.** `D3` (verbo de
  agarrar no grip), `B7` (origem do tiro na boca do cano) e metade de `D1`
  (cinco verbos sem botão num mapa que já não tem botão sobrando — o Touch
  acabou, e resolver isso é decidir um menu radial ou gesto, não mapear tecla).
- **Dois vermelhos são fase inteira.** `F5` + `H1` (menu, lobby, placar, chat,
  minimapa dentro do mundo) e `E2` (cortar 3× o quadro). O `E2` é o único que
  não sabemos ainda se **cabe**: nenhuma das medições até hoje mostrou um
  caminho de 558 para 180 sem mexer em como o mundo é montado.
- **A6 é a soma de tudo isso**, e por isso muda de causa toda rodada.

**E o dado que mais importa para a pergunta "quanto falta", que não é um
percentual:** **as três rodadas introduziram defeito nova cada uma, e todas as
três vezes o defeito novo nasceu de uma correção.** `bbe6b48` trouxe cinco;
`3cc8eea` trouxe três, sendo **dois deles a desfeita de correções da rodada
anterior** (o recentrar e o descarte). A taxa está caindo — cinco, depois três —
mas não chegou a zero, e enquanto ela não chegar a zero **o número de verdes não
é uma previsão de quando acaba**, porque cada rodada come parte do que a
anterior ganhou.

O que faria essa taxa cair para zero é visível nos dados desta rodada: os dois
defeitos mais graves (§3.1 e §3.2) estão **exatamente onde a suíte não olha** —
nenhum teste do repo chama `dev.recenter()`, e nenhum teste mede a posição de
mundo da câmera durante o escoamento do passo. A rodada que fechar esse buraco
de instrumento é a rodada em que "está pronto" passa a valer alguma coisa.

**Resumo em uma frase:** andou-se mais da metade do caminho que dá para medir
daqui (22 de 39), a metade que falta é um terço de fio solto e dois terços de
coisa que ainda não foi desenhada — e nenhuma delas fecha enquanto a suíte não
souber medir a cabeça do jogador nos dois lugares onde ela hoje pula.
