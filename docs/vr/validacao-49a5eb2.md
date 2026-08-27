# Validação do porte VR — commit `49a5eb2`

Nona rodada de validação. Autor: o **validador**. Procedimento: §12 de
`criterio-aaa.md`, reexecutado inteiro. A régua não foi tocada.

**Condição declarada** (sem isto não é medida): commit `49a5eb2` na `dev`.
Durante toda a validação a árvore de CÓDIGO ficou byte a byte idêntica ao commit
sob julgamento — `git diff --stat 49a5eb2..HEAD` devolveu **um arquivo só,
`CLAUDE.md`, 165 linhas, só adição** (commit `981cde5`, documentação), e md5 dos
cinco arquivos que eu mutei conferido antes e depois de cada mutação
(`js/xr/xrinteract.js`, `js/interact.js`, `js/xr/xrrig.js`, `game.js`,
`js/xr/xrcomfort.js` — todos idênticos no fim). Máquina com **dois construtores
ativos em worktrees**, `load average` de 1 min entre **0,30 e 3,92** conforme a
sonda (o teto do §12 é 1,5 — declaro cada leitura no lugar onde ela importa, e
digo abaixo quais medidas isso pode e não pode contaminar). Chrome com GPU real;
IWER 2.3.0 preset Meta Quest 3; seed 424242; sessão `immersive-vr` real via
`test/helpers/iwer.js` → `bootEmVR`; **portas 3590–3599**, nenhuma outra, nunca a
3000. **Nove sessões imersivas**, com três ciclos de sair-e-voltar dentro de
uma delas, e uma passada de `vr-emulado`. `npm run lint` limpo.
`node --test test/security-regression.test.js` → **9/9**.

**Sobre a carga.** Todas as medidas deste laudo são **geométricas ou de
contagem** (posição, ângulo, distância, presença no grafo, draw calls) — elas não
dependem de relógio e não mudam com a máquina carregada; conferi isso na prática:
A1 deu **exatamente** o mesmo número (0,0301 m nos 16 casos) com load 2,00 e com
load 3,92. As únicas leituras sensíveis a carga são a **triagem de teste**, e é
por isso que ela está tratada como triagem e não como veredito (§7).

**Placar: 27 verdes · 7 vermelhos · 5 não medidos, em 39.**
Progressão de verdes: 14 → 19 → 22 → 22 → 23 → 25 → 26 → 25 → **27**.

**É o melhor placar das nove rodadas, e desta vez o motivo é simples: as quatro
correções que eu pedi fecharam, e nenhuma delas abriu um vermelho novo.**

- **+3 verdes:** **D4 volta a verde** (o disco e o marcador estão no grafo da
  cena em três sessões seguidas — medido varrendo a cena, não perguntando ao
  módulo); **H1 volta com ele**; e **A5 e C1, que eu vinha herdando, foram
  MEDIDOS** nesta rodada porque `xrcomfort.js` e `xrrig.js` mudaram — os dois
  passam com folga, e A1 também (0,0181 m no centro do visor, contra teto de
  0,02).
- **A bazuca fechou:** origem 0,9087 → **0,0000 m** da âncora do cano, e
  **0 de dano em si mesmo** em quatro cenários com o tubo atravessando parede,
  onde antes eram 42.
- **A parede fechou pelo lado certo:** com a cabeça entrando num sólido de
  verdade, a cortina **fecha um frame ANTES** do olho cruzar a face —
  **0 frames de vazamento real**, com a cabeça chegando a 0,589 m dentro da
  parede e a tela preta.
- **O braço direito fechou:** **0,0000 m** da empunhadura em 9 das 10 poses,
  contra 0,3886–0,4165 m na rodada passada.

**E o que não fechou continua exatamente onde estava:** A6 (quinta rodada),
H2 (idêntico ao número da rodada 12), E2 (piorou 2 draw calls por olho), I3, e
B7 nas SETE armas que não são a bazuca.

**Sobre o denominador.** Os 47 critérios contêm **8 que nenhuma máquina fecha**
(E1, E3, E4, E5, F1, G4, G5 e I1): dependem do aparelho ou de um humano de
headset. O denominador honesto do que **eu posso** validar é **39**, e é nele que
este laudo pontua.

---

## 0. Os instrumentos que mentiram — inclusive dois meus, nesta rodada

Escrevo isto primeiro porque **duas medições minhas estavam erradas antes de eu
publicá-las**, e as duas são armadilhas reaproveitáveis:

1. **Medir a "boca do cano" na malha do modelo sem filtrar `visible` mede a
   geometria PROCEDURAL, que está escondida.** `js/weaponmodels.js:141` faz
   `gun.group.traverse(o => { if (o.isMesh && !keep.has(o)) o.visible = false; })`
   e pendura o GLB por cima. Minha primeira varredura de vértices "provou" que a
   âncora do fuzil estava **0,4475 m atrás da boca desenhada** — e o que ela
   media era o cano procedural de `js/weapons.js`, invisível desde o boot.
   Filtrando por visibilidade, a âncora está a **0,000–0,085 m** da boca real em
   todas as oito armas. **A calibração de `def.muzzle` está certa**, e o número
   que eu quase publiquei estava errado por 45 cm. Fica registrado porque é a
   mesma família do `Box3` congelado: um dado velho que ninguém invalida.
2. **Em XR, "a posição de mundo da câmera" tem TRÊS respostas, e duas delas não
   são A1.** `renderer.xr.getCamera()` devolve uma `ArrayCamera`; medi o passo de
   giro em três pontos e deu **0,0301 m na `matrix` da ArrayCamera**, **0,0301 m
   no olho esquerdo** e **0,0181 m no ponto médio dos dois olhos**. Os dois
   primeiros carregam meia IPD (0,0315 m) girando junto com o rig — geometria de
   estéreo, que acontece igual na cabeça de um humano e não é conflito
   vestibular nenhum. O número de A1 é o do **centro do visor**: 0,0181 m.
   Publicar 0,0301 teria reprovado A1 por causa da distância entre os olhos.
3. **`sep > raio − near` é PROXY de vazamento, e ele mente quando a cabeça não
   entrou em sólido nenhum.** Minha primeira sonda de parede escolheu, pela
   receita canônica do repo (`y1 − y0 ≥ 2`), um sólido cuja base está **2,99 m
   ACIMA do olho** — o corpo era parado por outra coisa. O proxy acusou
   **33 frames de vazamento** que não existem: nada estava do outro lado porque a
   cabeça nunca esteve dentro de nada. Refiz medindo **a coisa** — a folga
   assinada entre o olho e a caixa de cada sólido —, e com uma parede que a
   cabeça entra de verdade o vazamento real é **0 frames**.
4. **Trocar de arma pelo botão do headset alcança só 3 das 8.** Para medir as
   oito eu ciclo o `b-button` até `gunIndex` bater, com teto de voltas — e
   confiro que bateu. Sonda que só aperta o botão mede a mesma arma três vezes.
5. **`XR.foraDoCorpo` do rig e do boot são coisas diferentes**:
   `js/xr/xrrig.js:465` devolve `{x, z}`, `js/xr/xrboot.js:103` devolve o módulo.
   O jogo usa o do boot e está certo; quem escrever sonda contra o rig vai
   comparar um objeto com um número e receber `false` para sempre.
6. **`fora` NÃO zera entre cenários de sonda.** Teleportar `player.pos` não mexe
   no rig: minha primeira bateria de "a outra ponta" deu cortina 1,0000 em campo
   aberto, e o que estava acontecendo era o `fora` do cenário ANTERIOR preso no
   teto. O reset que vale é `XR.exit()` + `XR.enter()`, que é o único caminho que
   zera `passoX/foraX/exX`. Com reset, campo aberto dá **0,0000**.

---

## 1. Veredito, um por critério

### A — Giro e locomoção

| # | veredito | medido |
|---|---|---|
| A1 · giro não translada a cabeça | **APROVA — medido, não herdado** | `js/xr/xrrig.js` mudou nesta rodada, então re-medi. Passo de 45°, cabeça a 0,70 m do pivô, **8 direções × 2 sentidos = 16 casos**: deslocamento do **centro do visor** = **0,0181 m** em todos (teto 0,02). Por olho dá 0,0301 m, que é meia IPD (0,0315 m) girando — ver §0.2. Ângulo do passo: **45,00°** exatos nos 16. Linha de base: 0,554 m. |
| A2 · passo é escolha do jogador | **APROVA** | Herdado (`js/xr/xrturn.js` fora do diff). Reconfirmei que `preferir({modo:'passos', passo:45})` produz 45,00° medidos. |
| A3 · velocidade humana | **APROVA** | Herdado (`xrlocomotion.js` intocado). |
| A4 · aceleração instantânea | **APROVA** | Herdado, com a exceção declarada de `paridade`. |
| A5 · vinheta some ao parar | **APROVA — medido, não herdado** | `js/xr/xrcomfort.js` mudou 270 linhas. Andando: túnel **1,00000**; 1,5 s depois de parar: **0,00000**; 3,0 s: **0,00000**. Girando: **0,84991**; 1,5 s depois: **0,00000**. Zero exato, não resíduo pequeno. |
| A6 · nada além do pescoço move a vista | **REPROVA — as duas causas intactas, QUINTA rodada, e agora há uma terceira** | `city-destruction-client.js:154,155,156,175,177,179,180` continua salvando e escrevendo `MP.camera.fov`, `.position`, `.quaternion` e escondendo `camera.children` **por índice**; `grep presenting` nesse arquivo devolve **0**. `br-game.js:829` e `:1379` continuam pilotando queda livre e paraquedas por `MP.camera.getWorldDirection`. **Nenhuma linha mudou.** A terceira causa é nova e está declarada como exceção: o teto de `fora` congela a vista a 1,00 m de separação — e a premissa escrita da exceção não vale em todo cenário (§2.4). |

### B — Mira e empunhadura

| # | veredito | medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | **APROVA** | Herdado (`xrweapon.js`, `xrhands.js` fora do diff). |
| B2 · 1:1 sem bob nem sway | **APROVA** | Herdado. |
| B3 · dá para ver pelo buraco | **APROVA** | Reconfirmado com tiro real do gatilho: ângulo entre a direção do tiro e o **cano** (referência independente do código de mira) = **0,0000°** nas sete armas de fogo, e **0,0000°** contra a linha de mira. |
| B4 · botão de mirar não teleporta | **APROVA** | Herdado. |
| B5 · segunda mão importa | **NÃO MEDIDO** | Não existe conceito de segunda mão. **Nona rodada.** |
| B7 · o tiro sai do cano | **REPROVA — a BAZUCA fechou, as outras SETE não** | `\|origem − âncora do cano\|`, tiro real, uma arma por vez: **BAZUCA 0,0000** (era **0,9087**) · AGULHA 0,0589 · FALCÃO 0,0700 · FUZIL 0,0910 · RAJADA 0,0920 · TROVÃO 0,1810 · PLASMA 0,2000 · **FACA 0,4367**. Teto do critério: **0,05 m**. A âncora está a 0,000–0,085 m da boca DESENHADA (medido em espaço local, só malha visível), então o número contra o modelo é praticamente o mesmo. §2.1. |
| B6 · háptico em toda ação | **APROVA** | Herdado. |

### C — Corpo, altura e escala

| # | veredito | medido |
|---|---|---|
| C1 · nunca enterrado | **APROVA — medido, não herdado** | `xrrig.js` mudou. Quadrado de 2 m em clareira, passo físico de 2 cm, **420 frames**: folga cabeça↔chão **1,6966 – 1,6997 m**, amplitude **3,1 mm** (janela 1,20–2,10). Era 10,3 mm na rodada 12. |
| C2 · o corpo segue a cabeça | **REPROVA — 0,9888 m, mas o teto FUNCIONA** | Passeio canônico em campo aberto: separação máxima **0,0753 m** ✔ (o teto de C2 é 0,10 e ele é cumprido em jogo normal). Contra sólido, 10 m de caminhada física: vista **1,7600 m**, colisor **0,7800 m**, separação máxima **0,9888–1,0088 m**, `fora` **1,0000 m** — o teto de 1,00 m está valendo (era **9,2200 m** na rodada 12). §2.4. |
| C3 · altura do aparelho, agachar | **APROVA** | Herdado; reconfirmado de lado na pose "agachado 1,10 m" da bateria de corpo. |
| C4 · escala 1:1 em metros | **NÃO MEDIDO** | **Nona rodada.** |
| C5 · corpo em 1ª pessoa coerente | **REPROVA — a mão direita fechou, a esquerda e a malha não** | Ossos + malha skinada (4 `SkinnedMesh`, **3641 vértices por amostra**), 10 poses. **Mão DIREITA → empunhadura: 0,0000 m em 9 de 10 poses** (a décima é braço estendido fora do alcance anatômico, 0,0784 m com o cotovelo a 175,2°) — era **0,3886–0,4165 m**. `pedido/real` do braço: **0,5881/0,5881, erro 0,00 %**, com a raiz em escala **0,89455**. **Mão ESQUERDA: 0,1742 – 0,6440 m** — não fechou. Malha do corpo a **0,0314 – 0,0864 m** do olho (teto 0,15). §2.3. |
| C6 · o avatar que os OUTROS veem | **APROVA** | Herdado; ressalva de C2 permanece. |

### D — Interação com o mundo

| # | veredito | medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | **APROVA** | Herdado da rodada 11 (medido pelo efeito). |
| D2 · alcance medido da cabeça | **APROVA — e a guarda dele reprova de verdade** | Re-atacado por MUTAÇÃO: arrancar o desconto (`js/interact.js:65` → `Math.min(m, TETO_FORA)`) deixa **4 casos vermelhos** em `test/xr-alcance.test.js`, inclusive o caso novo que isola o desconto abaixo do teto. §5.2. |
| D3 · pegar é com a EMPUNHADURA, e perto | **APROVA** | Herdado. |
| D4 · affordance dentro do mundo | **APROVA — regressão da rodada 12 corrigida e verificada** | **Três sessões seguidas** (entrar, sair, entrar, sair, entrar): disco e marcador **presentes no grafo da cena** em todas — medido varrendo `scene.traverse` e checando `parent`, não perguntando ao módulo. §2.2. |
| D5 · veículo sem quebrar cabeça nem chão | **APROVA** | Herdado; nona rodada com a ressalva de não ter re-isolado o salto de saída. |
| D6 · tudo alcançável de posição fixa | **NÃO MEDIDO** | **Nona rodada.** |

### E — Desempenho

| # | veredito | medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | **`aguardando aparelho`** | — |
| E2 · orçamento em estéreo | **REPROVA — e piorou no castelo** | `node scripts/vr-emulado.js --port=3591`: menu **344 / 997 234**, spawn **360 / 1 013 616**, cidade **368 / 833 300**, castelo **401 / 1 169 824**. **Por olho:** 172 / 180 / 184 / **200,5** calls e 498,6 k / **506,8 k** / 416,7 k / **584,9 k** triângulos. Tetos 180 / 500 k. Contra a rodada 12 (198,5 calls e 573,2 k no castelo): **+2 calls e +11,7 k triângulos por olho**. |
| E3 · escala de render ≥ 85 % | **`aguardando aparelho`** | — |
| E4 · lógica de app ≤ 2 ms | **`aguardando aparelho`** | — |
| E5 · térmica 30 min | **`aguardando aparelho`** | — |

### F — Boot e ciclo de sessão

| # | veredito | medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | **`aguardando aparelho`** | — |
| F2 · foco perdido | **APROVA** | Herdado (`xrsession.js` fora do diff). |
| F3 · recentrar não teleporta nem enterra | **APROVA** | Herdado; `rebasear()` não foi tocado pelo diff de `xrrig.js` (a mudança é `devolverPasso`/`place`/dívida). |
| F4 · sair devolve o desktop intacto | **APROVA — e a ressalva da rodada 12 CAIU** | `exit()` continua tirando disco e marcador da cena (nada flutua no monitor) e agora eles **voltam** na próxima entrada. Era este o custo que eu tinha cobrado em D4/H1. |
| F5 · jogável de ponta a ponta | **APROVA** | Herdado. |

### G — Qualidade de imagem

| # | veredito | medido |
|---|---|---|
| G1 · foveação declarada | **APROVA** | Herdado — `game.js:434` chama `setFoveation(0.2)`. |
| G2 · antialiasing em XR | **NÃO MEDIDO** | O IWER não expõe `samples` do alvo XR. `antialias: true` em `game.js:333`. **Nona rodada.** |
| G3 · escala de framebuffer declarada | **APROVA** | Herdado. |
| G4 · texto e mira legíveis | **`aguardando humano`** | — |
| G5 · uma captura por entrega | **`aguardando humano`** | `output/vr/` continua com um único PNG, o `baseline-quest.png` de **25/08**. **Nona rodada sem captura estéreo.** |

### H — HUD e UI dentro do mundo

| # | veredito | medido |
|---|---|---|
| H1 · nada essencial só no DOM | **APROVA — o prompt voltou** | O item que derrubava a lista na rodada 12 (o prompt de interação, ausente a partir da 2ª sessão) está presente nas três sessões que eu medi. Os outros 16 são herdados da rodada 11. |
| H2 · UI não é colada na cara | **REPROVA — idêntico, dígito por dígito** | Re-medido: mapa **0,3777 m**, pulso **0,3956 m**, arma **0,5520 m**, disco do radial **0,4667 m**. Os quatro números batem com os da rodada 12. A régua pede ≥ 0,45 m e nada mais perto que 0,75 m para leitura demorada. |
| H3 · o retículo não mente | **APROVA** | Por ausência declarada. |

### I — Ausência de defeito grosseiro

| # | veredito | medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | **`aguardando humano`** | **Zero caixas em nove rodadas.** O único artefato de sessão em `output/vr/` continua sendo o **ENSAIO** de 27/08 00:55, que diz em negrito que nenhuma medição foi feita: `teclado do operador: NÃO`, `amostras de VrApi: 0`. |
| I2 · zero erro de console | **APROVA** | `pageErrors` e `consoleErrors` **vazios nas nove sessões imersivas**, inclusive nas que saíram e voltaram três vezes. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | **REPROVA — melhorou o pior caso e continua fora** | Malha skinada, 10 poses (inclusive pitch −70° e yaw ±60°): geometria do corpo entre **0,0314 m** e **0,0864 m** do olho. Teto: 0,15 m. O pior caso da rodada 12 (0,0092 m, braço para cima) subiu para **0,0314 m** — provavelmente efeito do braço que agora dobra certo. Nenhuma das dez poses passa. |
| I4 · nenhum estado sem saída | **NÃO MEDIDO** | Faltam nave, queda livre, paraquedas, dirigindo, espectador e fim de partida. |

---

## 2. O que mudou, auditado

### 2.1 · A bazuca — a regressão morreu, e a medição do repo é tautológica

**A regressão fechou, e eu confirmo pelos dois lados que o briefing pediu.**

| grandeza | rodada 12 | **agora** |
|---|--:|--:|
| origem do foguete → âncora do cano | **0,9087 m** | **0,0000 m** |
| ângulo do voo × cano | — | **0,0000°** (tiro), 0,3419° (medido pelo foguete em voo) |
| ângulo do voo × linha de mira | — | **0,0000°** |
| dano em si mesmo, tubo atravessando parede | **42** | **0,0 · 0,0 · 0,0 · 0,0** |

A auto-detonação foi medida com a cabeça a **0,60 · 0,40 · 0,25 · 0,12 m** da
face de um sólido, com a mão e a cabeça apontadas PARA a parede e a boca do cano
confirmada do outro lado da face (`x = −308,06`, face em `−308,50`) em todos os
quatro. **Dano em si mesmo: zero nos quatro.** O foguete morre a 12,7–12,8 m do
olho, ou seja, dentro do prédio e longe do jogador.

**E agora a parte que você precisa saber, porque ela some no verde.** A medida
que o repo publica — `|origemDoTiro() − canoPosDoTiro()|` — é **zero por
álgebra** para a bazuca: `game.js:2428` faz `const origemFoguete = _v3` e `_v3`
veio de `muzzle.getWorldPosition(_v3)` (linha 2379); `marcarCanoQA()` faz
`muzzle.getWorldPosition(_canoPosDoTiro)` no mesmo frame, sem transform nenhum no
meio. É o **mesmo nó, a mesma chamada**. O comentário de `direcaoDoCano` em
`game.js:4533` avisa exatamente contra isso para a DIREÇÃO — *"comparar o raio
com ela é comparar uma reta consigo mesma"* — e a mesma armadilha entrou pela
POSIÇÃO no mesmo commit.

Isso **não invalida o conserto**: a mutação que reverte (`origemFoguete =
_rayOrig`) devolve os 0,46–0,91 m e mata o assert. Mas invalida o número como
prova de "o foguete sai da boca": qualquer origem amarrada a
`muzzle.getWorldPosition()` passa com 0,0000 sem que ninguém tenha olhado onde a
boca está. A medida independente é a **âncora contra a geometria desenhada**, e
essa eu fiz (§0.1): a âncora da bazuca está **0,085 m atrás** da ponta do cone do
GLB, e a das outras sete entre **0,000 e 0,053 m**. Ou seja, a calibração está
boa — mas quem provou isso foi esta sonda, não o teste.

**A FACA, que o briefing pediu em particular.** Ela é outra ordem de grandeza
porque é outro defeito:

```
origem do golpe → âncora (ponta da lâmina) ...... 0,4367 m
origem do golpe → ponta DESENHADA da lâmina ..... 0,6598 m
ângulo do golpe × eixo da lâmina ................ 8,330°
ângulo do golpe × âncora ........................ 10,086°
alcance do golpe (br-game.js:571) ............... 2,60 m A PARTIR DA ORIGEM
→ alcance invisível além da ponta da lâmina ..... 1,9402 m
```

Não é altura de alça: a faca **não tem alça**. O golpe nasce no nó de mira (a
mão), 44 cm atrás da lâmina, **e a 8,3° do eixo dela** — a lâmina aponta para um
lado e o corte acontece noutro. E o segmento de 2,60 m de `__BR_melee` é medido
da origem, então **o jogador acerta coisas a quase 2 m além da ponta da faca**.
Em VR, onde ele vê a lâmina na mão e a estende para tocar o alvo, isso é o
oposto do que a mão dele diz. **Concordo com sua suspeita: é defeito próprio, e
não é B7 — é B3 e D3 na arma branca.** A correção não é mover a origem: é
registrar mira e golpe separados e medir o alcance da PONTA.

### 2.2 · O disco e o marcador — corrigido, verificado em três sessões

Entrei e saí do VR **duas vezes** (três sessões no total), com um alvo de
interação em alcance a cada uma:

| | sessão 1 | sessão 2 | sessão 3 |
|---|---|---|---|
| marcador: objeto na cena | **sim** | **sim** | **sim** |
| marcador: tem pai | **sim** | **sim** | **sim** |
| disco: no grafo (`scene.traverse`) | **sim** | **sim** | **sim** |
| disco: `naCena` da API | **sim** | **sim** | **sim** |

Era `parent` nulo e ausente do `traverse` a partir da segunda. **Fechado.**

**Mas a correção das duas APIs de estado ficou pela metade, e isso é defeito
novo.** Arranquei os objetos da cena deixando `visible = true` e perguntei às
duas APIs:

```
MARCADOR: estado diz visível = TRUE   · na cena de verdade = false
          a API expõe `marcadorNaCena`? NÃO
RADIAL:   estado diz visível = false  · naCena = false · na cena de verdade = false
```

`js/xr/xrinteract.js:773` continua `marcadorVisivel: !!(grupo && grupo.visible)`.
As duas APIs que eu nomeei na rodada 12 eram `estado().radial.visivel` **e**
`estado().marcadorVisivel`; o commit consertou a primeira (e a de
`js/xr/xrhud.js`, que eu não tinha pedido) e **deixou a segunda exatamente como
estava**. Hoje o caminho normal não alcança o estado mentiroso, porque `exit()`
zera `visible` antes de remover — mas a API que mentia continua com a forma que
mentia, ao lado da irmã corrigida. Um `&& grupo.parent` e um campo `naCena`
fecham.

Menor, da mesma família: `js/xr/xrinteract.js:793` ainda faz
`pos: radial && radial.visible ? radial.position.toArray() : null` — devolveu
coordenada com `visivel: false` e `naCena: false` na minha medição.

**E o giro com o radial aberto fechou:** com o menu aberto e o analógico de giro
empurrado por 2 s, **o rig girou 0,00°** e o disco ficou parado a 36,74° do eixo
da vista, antes e depois. Era 65,90° de rig e o disco a 101,05°.

### 2.3 · O braço — a mão direita fechou; a esquerda é outra história

**A causa que eu apontei estava certa e o conserto é o certo.** Medindo o número
que ENTRA no solver contra o que os ossos vencem, no mesmo frame:

```
escala da raiz do boneco em VR .......... 0,89455
pedido no solver / real dos ossos ....... 0,5881 / 0,5881   → erro 0,00 %
cotovelo ................................ 143,1° (o número do desktop)
```

Era 0,6574 / 0,5881, **+11,79 %**. E o efeito:

| pose | mão DIREITA → empunhadura (rodada 12 → agora) | mão ESQUERDA (agora) | malha → olho |
|---|--:|--:|--:|
| quadril | 0,4009 → **0,0000** | 0,2391 | 0,0846 |
| pronto | 0,4024 → **0,0000** | 0,2955 | 0,0669 |
| no olho | 0,4165 → **0,0000** | 0,3023 | 0,0534 |
| braço estendido | 0,3886 → **0,0784** | 0,6440 | 0,0645 |
| para cima | 0,4131 → **0,0000** | 0,4998 | 0,0314 |
| colado no peito | 0,4078 → **0,0000** | 0,1742 | 0,0452 |
| olhando −70° | 0,4041 → **0,0000** | 0,2921 | 0,0683 |
| olhando +60° | 0,3980 → **0,0000** | 0,3067 | 0,0864 |
| olhando −60° | 0,3989 → **0,0000** | 0,2150 | 0,0864 |
| agachado 1,10 m | — | 0,2536 | 0,0509 |

**Ressalva honesta sobre a coluna de comparação:** a sonda da rodada 12 não
existe mais em disco, então os deslocamentos de controle que eu usei agora são
**reconstruídos pelos mesmos nomes de pose**, não byte a byte os mesmos números.
A comparação que vale é de ORDEM DE GRANDEZA — 40 cm para 0 — e essa é
inequívoca. A coluna da esquerda **não** é comparável caso a caso pelo mesmo
motivo, e por isso eu **não** afirmo que ela piorou.

O único caso da mão direita fora de zero é "braço estendido" (0,0784 m), com o
cotovelo a **175,2°**: o braço está esticado no limite e o alvo está além dele. É
anatomia, não defeito.

**A mão esquerda continua a 0,17–0,64 m do guarda-mão**, e o commit já sabe
disso: `js/fpbody.js` documenta que a âncora esquerda fica a 0,89–1,03 m do ombro
contra 0,59 m de braço. Ou seja: em VR o jogador levanta o fuzil e vê **uma mão
na arma e outra flutuando ao lado dela**. É metade do defeito que o dono
descreveu, e é o que ele vai ver primeiro (§8).

**A malha do corpo continua entrando no olho:** 0,0314–0,0864 m nas dez poses,
teto 0,15. Melhorou o pior caso (0,0092 → 0,0314) e **nenhuma das dez passa**.

### 2.4 · A parede — fechou pelo lado certo, e a premissa da exceção não vale sempre

**A ponta que importa fechou, e eu ataquei ela com a medida que não é proxy.**
Cenário: parede escolhida por a faixa de Y dela **conter a altura do olho** (não
pelo tamanho), 400 degraus físicos de 2 cm, olho lido como vai para a tela
(rig do frame × pose do frame), e "vazou" definido como **o olho a menos de
`near` da face de um sólido ou dentro dele, com a tela aberta**:

```
sonda de sólido acende ... separação 0,1504 m (olho a 0,2715 m da face)
cortina acende ........... separação 0,1900 m
cortina FECHA (≥ 0,98) ... separação 0,3293 m
o olho ENTRA no sólido ... separação 0,3493 m
VAZAMENTO REAL ........... 0 frames · atraso entre entrar e fechar: −1 frame
profundidade máxima ...... 0,5885 m DENTRO da parede, com a tela preta
separação máxima ......... 1,0088 m (teto 1,00 m valendo)
```

**A cortina fecha um frame ANTES do olho cruzar a face.** Era vista limpa até
1,10 m de separação com 0,222 s de atraso. Fechado, e fechado pela geometria,
como o commit diz.

**A outra ponta também passa**, com o `fora` zerado por reset de sessão entre
cenários (§0.6):

| cenário | cortina máx | separação máx |
|---|--:|--:|
| campo aberto, quadrado de 2 m | **0,0000** | **0,0753 m** |
| encosto de leve (13 cm além do batente) | **0,0000** | 0,3094 m |
| debruçar sobre parapeito | 1,0000 (havia sólido no olho) | 0,9888 m |

Encostar de leve **não escurece nada**. É o que eu pedi.

**Agora o vermelho, e ele é meu achado desta rodada.** Existe uma família de
cenário em que a premissa escrita da exceção de C2 **não acontece**. Andando 10 m
fisicamente contra um sólido que segura o CORPO mas em que a CABEÇA nunca entra:

```
sonda de sólido .......... 0,0000 m em 0 de 524 frames
cortina acende ........... separação 0,8688 m
cortina fecha ............ separação 0,9888 m
separação máxima ......... 0,9888 m · `fora` 1,0000 m
```

A cortina só acendeu porque o segundo termo de `alvoDaCortina`
(`js/xr/xrcomfort.js:370`, a rampa do teto) entrou; o termo de proximidade ficou
**multiplicado por `porta = 0`** o caminho inteiro, porque a consulta de sólido
na cabeça não viu nada. E o texto da exceção, em `js/xr/xrcomfort.js:187-192`,
afirma: *"a tela está preta desde 0,32 m, três vezes antes do teto"*. **Medido:
neste cenário a tela só começa a escurecer em 0,87 m.** Nada vazou (a cabeça não
estava dentro de nada), então o dano não é ver o outro lado — é que **a
justificativa escrita de trocar A6 por C2 se apoia num fato que não vale em todo
cenário**, e a amarra em código (`vale`) confere isso contra **constantes
declaradas**, não contra o comportamento com o `porta` no caminho. A amarra não
tem como cair.

**A dívida:** entrei 5 m e voltei 5 m. `fora` terminou em **0,0000 m** — a dívida
foi paga, não descartada, e isso é o que o commit se propôs a fazer. Mas a
cabeça **não** voltou ao lugar: erro da vista na volta **0,1320 m**, e o colisor
com o **mesmo** 0,1320 m (ou seja, a vista seguiu o corpo corretamente; quem não
voltou foi o corpo, empurrado pela parede). O commit publica 0,0000 m para essa
ida-e-volta; com a parede realmente segurando o colisor eu meço 0,1320 m.

### 2.5 · Anti-cheat — não reaberto

`node --test test/security-regression.test.js` → **9/9**, com a régua de alcance,
a cortina e o teto de `fora` todos mexidos nesta rodada. Sem regressão.

### 2.6 · O `Box3` e a documentação — item 6 do briefing, fechado

`js/skeletons.js:320-336` agora explica o mecanismo **certo**
(`SkinnedMesh.computeBoundingBox` É ciente da pose; quem congela é o cache de
`Box3.expandByObject`, que nunca é invalidado) e diz o que fazer
(`mesh.boundingBox = null` ou medir por osso). `js/fpbody.js:141-160` idem, e
declara que ali o congelamento é proposital. **Os dois comentários errados
morreram.**

---

## 3. O defeito vivo em produção — severidade, e quem mais corre o risco

**Severidade: ALTA para o produto ao vivo, ZERO para o VR.** Não é um risco
teórico; é um comportamento que todo jogador via.

**O que estava quebrado, com a linha:**

- `Dockerfile:7` → `npm ci --omit=dev`; `three` estava em `devDependencies`.
- `scripts/bots.js:134` → `await import('.../js/terrain.js')`, e
  `js/terrain.js:5-6` importa `three` e `three/addons/math/SimplexNoise.js`.
- `scripts/bots.js:252` → `.catch(err => { console.warn(...); return null; })`.
- `server.js:1094` → `spawn(..., { stdio: 'ignore' })` — **o aviso ia para um
  descritor descartado**. Nenhum log, nenhuma métrica, nenhum sintoma no
  servidor.

**O que os bots faziam sem terreno**, e isto é o que o jogador via:

- `scripts/bots.js:335` → `const groundY = terrain ? terrain.heightAt(...) : 4`:
  a queda parava em **y = 4 fixo**;
- `scripts/bots.js:393` → `if (terrain) b.y = terrain.heightAt(...)`: sem
  terreno o Y **nunca mais era atualizado**. Os bots andavam o mapa inteiro na
  **cota 4**. Nas minhas sondas o chão desta seed vai de 3,27 a 8,54 m em
  centenas de metros — ou seja, bot voando sobre o vale e enterrado no morro,
  em toda partida;
- `scripts/bots.js:167` → `createBotChestSpots` devolve `[]` sem terreno, e
  `:356` só procura baú dentro dessa lista: **os bots nunca abriam baú**, logo
  nunca trocavam a FACA nem repunham munição.

**A correção está certa e é completa para este consumidor.** `three` está em
`dependencies` no `package.json` e no `package-lock.json` (o `"dev": true` do
lock foi removido), `npm ls three --omit=dev` resolve, e
`require.resolve('three/addons/math/SimplexNoise.js')` cai dentro do pacote
`three` (`examples/jsm/`), então o `addons` também sobe com a dependência de
produção.

**Há outros consumidores de `js/` no servidor? NÃO — um só.** Varri o repo:
`scripts/bots.js` é o **único** arquivo Node fora de `test/` que importa de
`js/`. `server.js` importa apenas `city-destruction-protocol.js`,
`ship-protocol.js` e `brcolors.js`, todos na raiz e sem `three`. Os outros
`await import()` do repo (`scripts/build-castle-model.js`,
`scripts/asset-report.js`, `scripts/build-model-textures.js`) puxam
`@gltf-transform/*` e `sharp`, que **continuam** em `devDependencies` — e isso
está certo: são ferramentas de build, nunca rodam no contêiner. **Nenhum outro
caminho de produção tem o mesmo problema.**

**O que continua em pé, e é a raiz real:** `stdio: 'ignore'` no spawn dos bots.
Foi ele que transformou um `import` falhando em silêncio de meses. Trocar por
`stdio: ['ignore', 'inherit', 'inherit']` custa uma linha e devolve o sintoma.

---

## 4. B7 — a régua continua com a decisão pendente, e agora há um agravante

Registro de novo, porque continua sem decisão do dono: **B7 está estruturalmente
irreconciliável com o desenho atual das armas**. A alça deste jogo fica de 6 a
20 cm acima do cano; o tiro nasce sobre a linha de mira; logo a distância
origem↔boca **é** a altura da alça, por construção. Cobrar 0,05 m é cobrar que
alça e cano sejam colineares, o que nenhuma arma do arsenal é.

**Minha recomendação da rodada 11 continua de pé, palavra por palavra:** trocar o
texto de B7 por **"origem sobre a linha de mira ≤ 0,002 m + afastamento ≤ altura
de alça declarada por arma"**. Isso mede o defeito real (bala nascendo fora da
arma) e não reprova geometria correta. **A decisão é do dono e não foi tomada.**

**O agravante desta rodada, e ele é sério.** `test/xr-weapon.test.js` tem dois
casos cujo **título anuncia 5 cm** e cuja asserção não cobra 5 cm:

| caso (linha) | o que o título diz | o que o assert cobra |
|---|---|--:|
| `:429` "a origem do tiro fica na boca do cano (**≤ 5 cm**)" | 5 cm | `r.d < 1.0` → **1,00 m** |
| `:447` "a origem REAL do raio fica a **≤ 5 cm** da boca do cano" | 5 cm | `r.d <= 0.25` → **0,25 m** |

Os dois passam, e a saída do runner imprime, em verde, *"a origem do tiro fica na
boca do cano (≤ 5 cm)"* — enquanto o número real do arsenal vai de **5,89 cm a
43,67 cm**. Quem lê o verde conclui que B7 está fechado. **O corpo do arquivo é
honesto** (o comentário de `:466-486` declara a troca de teto, o motivo, e
escreve *"PENDENTE DO DONO: o texto do B7 ainda cobra 0,05 m. Não editei a
régua"*) — a desonestidade está só no título, que é a única parte que aparece no
resultado. **Isto é anterior a esta rodada** (`0bccf4f`), mas é a primeira vez
que alguém mede; e enquanto o título disser 5 cm, o afrouxamento declarado
funciona como afrouxamento escondido.

---

## 5. A caça ao teste que passa por acidente — achei a NONA, e ela guarda a funcionalidade nova desta rodada

Reapliquei as duas mutações que o briefing pediu e mais quatro. **Todas rodadas
de verdade, com o teste vermelho ou verde na tela — nada aqui é leitura de
código.** Árvore conferida por md5 antes e depois de cada uma.

### 5.1 · A NONA · a sonda de sólido não tem cobertura da FIAÇÃO

**Mutação:** `game.js:3639`
`XR.conforto.intrusao(dt, XR.foraDoCorpo, sondaDeSolidoXR());`
→ `XR.conforto.intrusao(dt, XR.foraDoCorpo);`

**Resultado: `test/xr-parede.test.js` fica 25 de 25 VERDE.**

Inclusive — e este é o ponto — o caso chamado **"DEBRUÇAR SOBRE UM PARAPEITO NÃO
APAGA A TELA — é gesto legítimo de VR"**, que é *literalmente* o comportamento
que a sonda foi criada nesta rodada para fornecer. Ele fica verde com a sonda
arrancada do produto, porque ele **fabrica o próprio objeto de sonda** na
bancada e chama `intrusao` direto. Rodei também `test/xr-conforto.test.js` e
`test/xr-body.test.js` sob a mesma mutação: **38 de 38 verde**. E
`sondaDeSolidoXR` **não aparece em nenhum arquivo de `test/`**.

O arquivo **conta** a fiação — `test/xr-parede.test.js:742` incrementa
`comSonda`, `:777` devolve em `fiacaoComSonda`, `:785` **imprime no console** — e
**nunca a asserta**. O único assert de fiação é `:788`, `fiacaoDoJogo > 100`, que
só cobra que `intrusao` é chamada.

Duas linhas acima desse assert está escrito, em maiúsculas: *"A FIAÇÃO É DO JOGO,
E ISSO É COBRADO. A rodada passada embrulhou `intrusao` e, se o jogo não
chamasse, o TESTE chamava — e aprovava. Foi a quinta ocorrência histórica, e o
laudo pegou."* **Metade da fiação ficou de fora do assert, na rodada seguinte
àquela em que essa lição foi escrita.** É a nona ocorrência do padrão e a
primeira em que o furo é a fiação de uma funcionalidade que nasceu nesta rodada.

### 5.2 · As duas mutações que o briefing pediu — as duas guardas funcionam, com um asterisco

**`test/xr-radial.test.js` — a mutação de UMA linha deixou de reproduzir o
defeito.**

| mutação | resultado |
|---|---|
| comentar só `js/xr/xrinteract.js:479` (`scene.add(radial)` na criação) | **14 de 14 VERDE** |
| arrancar **as duas** (`:465` reanexar + `:479` criar) | **5 de 14 VERMELHO** ✔ |

O commit afirma "a mutação mata 5 casos" e **isso está certo** — para a mutação
de duas linhas. Com a de uma linha, o próprio conserto idempotente
(`if (radial) { if (!radial.parent) scene.add(radial); return; }`) **cura o
mutante um frame depois**: `montarRadial()` é chamada todo frame em que o menu
abre. Não é defeito do teste; é uma propriedade do conserto que muda qual
mutação é a válida, e quem for reinjetar defeito aí precisa saber disso ou vai
concluir que a guarda não vale nada.

**`test/xr-alcance.test.js` — a guarda nova funciona.**

Mutação: `js/interact.js:65`
`const usa = Math.min(Math.max(0, m - f), TETO_FORA);` → `Math.min(m, TETO_FORA);`

**4 de 14 VERMELHO**, e entre eles o caso novo **"ABAIXO do teto, quem segura a
régua é o DESCONTO — não o teto"**. Era este o buraco que eu apontei e ele está
fechado. (O commit diz 5; eu conto 4 folhas vermelhas mais os `describe` pais —
diferença de contagem, não de resultado.)

**Mas o caso que eu apontei na rodada 12 continua com a prosa falsa, e agora
provada falsa por mutação.** Com o desconto arrancado,
`test/xr-alcance.test.js:412` — *"NÃO SE ABRE BAÚ ATRAVÉS DA PAREDE"* — ficou
**VERDE**, e o comentário dele continua afirmando, palavra por palavra, que é o
caso que fica vermelho quando alguém trocar a régua pela cabeça sem desconto.
**Não fica.** Quem ficou vermelho foi o caso vizinho ("o baú a 2,55 m continua
fora de alcance") e os três de unidade.

### 5.3 · A décima · o caso "sem salto" não pega o defeito que ele nomeia

**Mutação:** `js/xr/xrrig.js:328` `const ESCOA_FORA = 0.006;` → `1.0`.
Isso despeja o `fora` inteiro no passo de uma vez — 0,15 m por frame a 72 Hz são
**10,8 m/s**, mais rápido que a corrida do jogo, e é exatamente o "teleporte de
colisor" que o comentário do caso diz pegar.

**Resultado: 3 de 25 vermelho — e o caso "quando o obstáculo SOME, o colisor
caminha até debaixo da cabeça — SEM SALTO" ficou VERDE.**

Ele mede `maiorSalto = |consumirPasso(alvo)|` contra `0,155`, mas
`consumirPasso` (`js/xr/xrrig.js:339,358`) **já clampa a própria saída** em
`PASSO_MAX = 0.15`. A asserção é `0,15 ≤ 0,155` para **qualquer** estado interno:
ela não pode falhar. A outra metade do caso (`player.x > cabeca − 0.1`) funciona
e pega `ESCOA_FORA = 0`. O arquivo no conjunto pega a mutação; **o caso que
carrega o nome do defeito, não.**

### 5.4 · Suspeitos que eu não consegui provar

- **`test/xr-parede.test.js:475`** (*"A VISTA SÓ PARA DE RESPONDER COM A TELA JÁ
  PRETA"*): o comentário diz que ele falha se alguém subir `FORA_MAX` acima do
  teto ou baixar o teto. Não achei mutação de uma linha nas quatro constantes
  nomeadas que o deixe vermelho, porque nos frames que ele examina (separação =
  1,00 m) quem vale 1,0 é o termo `teto` de `alvoDaCortina`, sozinho. **Suspeito,
  não provado por execução** — não rodei essa mutação por tempo.
- **`test/xr-alcance.test.js:238`**: o limite superior do teto virou `< 0.60`,
  um número solto (era `< 0.50`, amarrado ao `FORA_MAX` do conforto). Como
  `FORA_MAX` desceu para 0,32 nesta rodada, a amarra deixou de existir dos dois
  lados. **Não rodei a mutação `TETO_FORA = 0.59`.**
- **`js/interact.js:46`**: o comentário afirma que o teto fica *"abaixo do ponto
  em que a tela já está preta (`FORA_MAX = 0,50`)"*. `FORA_MAX` agora é **0,32**,
  então `TETO_FORA = 0,35` está **acima** desse ponto e a propriedade declarada
  está **invertida**. Isso é leitura de código, não medição — mas é uma linha e é
  verificável.
- **`test/xr-mira.test.js:239-247`**: o mesmo parágrafo de comentário aparece
  **duas vezes seguidas**, quase palavra por palavra. Sobra de edição.

---

## 6. Defeitos NOVOS, com medição — e quantos nasceram de uma correção

O termômetro: 5 → 3 → 2 → 1 → 4 → 4 → **5**.

| # | defeito | medido | nasceu de? |
|---|---|---|:--:|
| 1 | **A fiação da sonda de sólido não é cobrada por teste nenhum**: arrancar o 3º argumento de `game.js:3639` deixa `xr-parede` 25/25, `xr-conforto`+`xr-body` 38/38, e devolve ao produto o defeito que a sonda nasceu para consertar | mutação rodada, verde em 63 casos | **da funcionalidade nova** |
| 2 | **`estado().marcadorVisivel` continua sem `parent` e sem `naCena`** — uma das duas APIs que eu nomeei ficou de fora do conserto | com o objeto fora da cena e `visible: true`, a API diz **`true`** | **da correção, pela metade** |
| 3 | **O caso "sem salto" de `xr-parede` não pode falhar**: `maiorSalto ≤ 0,155` contra um `consumirPasso` que clampa em 0,15 | `ESCOA_FORA` de 0,006 → 1,0 (167×): o caso fica **VERDE** | **do teste novo** |
| 4 | **A premissa escrita da exceção de C2 não vale em todo cenário** | *"a tela está preta desde 0,32 m"*; medido, com a cabeça fora de sólido, a cortina só acende em **0,8688 m** de separação | **da correção da parede** |
| 5 | **`js/interact.js:46` afirma `FORA_MAX = 0,50`**, e o commit baixou para 0,32 — o teto de alcance (0,35 m) passou a ficar ACIMA do ponto de tela preta, invertendo a propriedade declarada | leitura direta das duas constantes | **da correção da parede** |

**Os cinco nasceram desta rodada.** Nenhum é de gravidade de jogo — nenhum deles
o dono vê no headset. Todos são de **guarda**: quatro deles fazem uma afirmação
escrita que o código não sustenta, e o primeiro deixa uma funcionalidade nova
sem rede.

**Dois achados que NÃO são novos, e é importante dizer:** os títulos de
`xr-weapon` anunciando 5 cm (§4) e a prosa falsa de `xr-alcance:412` (§5.2)
são **anteriores** a este commit — o segundo eu já tinha apontado na rodada 12 e
ele não foi corrigido.

**O que melhorou de verdade, e merece o mesmo peso:**

1. **A bazuca fechou, e fechou pelo lado certo.** Zero dano em si mesmo em quatro
   cenários onde eram 42. E a decisão de projeto (nascer na boca e voar paralelo
   à alça) é a correta para projétil visível.
2. **A parede fechou.** Cortina fechando **um frame antes** do olho cruzar a
   face, 0 frames de vazamento real, cabeça 0,589 m dentro da parede com a tela
   preta — e encostar de leve continua **sem escurecer nada**. As duas pontas.
3. **O braço direito fechou.** 40 cm para 0,0000 em nove poses, com o erro do
   solver em 0,00 %, e o cotovelo caindo exatamente no número do desktop.
4. **O disco e o marcador voltaram**, e eu verifiquei em três sessões varrendo o
   grafo.
5. **O defeito de produção dos bots está fechado no manifesto e na resolução**,
   e é o único consumidor de `js/` no servidor.
6. **A6 e C2 ganharam exceção declarada em código, com amarra.** A amarra tem um
   furo (item 4), mas a prática — escrever o motivo, o custo e a condição no
   próprio código — é a certa e é a que eu vinha pedindo há cinco rodadas.

---

## 7. A peneira de testes — e por que a falha não é regressão

`npm run lint` → **limpo**.
`npm run test:vr` → **628 testes · 614 passes · 3 falhas · 11 cancelados**, em
635 s, com `load average` entre 1,6 e 2,5 (dois construtores ativos).

Dois arquivos falharam:

| arquivo | sintoma | isolado |
|---|---|---|
| `test/xr-haptics.test.js` | 3 casos de atuador | **29/29 · 29/29** |
| `test/xr-weapon.test.js` | `hookFailed` no `before`: `Cannot read properties of null (reading 'updateWorldMatrix')` → 11 cancelados | **16/16 · 16/16** |

**Os dois passam duas vezes isolados consecutivos → FLAKE pela regra do próprio
repo.** E são exatamente os dois casos que o `CLAUDE.md` já nomeia: `xr-haptics`
por carga, e o `hookFailed` de boot que aparece quando a página não termina de
subir em 60 s sob carga. Rodei a triagem com a máquina ainda carregada, o que é
o pior caso — e mesmo assim ela passou duas vezes cada.

`node --test test/security-regression.test.js` → **9/9**.

---

## 8. O que o dono reclama primeiro

**Uma mão na arma e a outra flutuando.** Ele levanta o fuzil: a mão **direita**
agora está na empunhadura, exata, em toda pose — essa parte foi consertada e é a
melhor coisa desta rodada. Mas a **esquerda** está a **17 a 30 cm** do guarda-mão
em pose normal, e a **50–64 cm** com o braço esticado. Em VR isso é pior do que
as duas erradas: quando as duas erram junto, o cérebro lê "o boneco é assim";
quando uma acerta e a outra não, ele lê **braço quebrado**. É o item 7 do roteiro
I1 (*"Ela está na minha mão, no ângulo da minha mão?"*), e a resposta agora é
"metade".

**Em segundo, na mesma pose: alguma coisa encostada no olho.** A malha do corpo
fica a **3,1–8,6 cm** do olho em todas as dez poses que eu medi. Melhorou (era
0,92 cm no pior caso) e continua muito dentro do plano near: ele vê o interior da
própria gola ou do braço atravessar a vista.

**Em terceiro, e é o que ele vai chamar de "borrado": os painéis colados na
cara.** Mapa a **0,3777 m** e pulso a **0,3956 m**. A Oculus BP põe o foco
confortável entre 0,75 e 3,5 m e diz que abaixo de 0,75 m **a lente desfoca**.
Ele não vai dizer "H2"; vai dizer que o mapa está embaçado — e vai estar certo,
porque é óptica, não gosto. Este número é **idêntico ao da rodada 12, dígito por
dígito**.

**E a faca.** Se ele pegar a FACA — que é a arma inicial do BR, ou seja, a
primeira arma que ele segura em toda partida —, o golpe sai **44 cm atrás da
lâmina, 8,3° fora do eixo dela, e alcança 1,94 m além da ponta**. Ele vai bater
em coisas que a faca não tocou e errar coisas que ela tocou.

**O que ele NÃO vai mais reclamar, e merece ser dito com o mesmo peso:**

- **A bazuca não explode mais na cara dele.** Quatro cenários com o tubo
  atravessando parede: zero dano.
- **O menu radial e o destaque dos baús não somem mais** quando ele tira e põe o
  headset. Era o defeito mais fácil de reproduzir do laudo anterior.
- **A parede não mostra mais o outro lado.** A tela fecha antes, e — o que
  importa tanto quanto — **não** fecha quando ele só encosta num muro.
- **A mira continua certa** (0,0000° em sete armas), e o giro com o menu aberto
  não empurra mais o disco para fora do campo de visão.

---

## 9. Quanto falta para "ausência de defeito"

Pela regra do §0 da régua — um vermelho reprova a entrega inteira — **a rodada
está devolvida**, com 7 vermelhos. É o menor número das nove rodadas.

O saldo honesto: **27 verdes de 39, 7 vermelhos, 5 medições não feitas** (B5, C4,
D6, G2, I4), mais **8 critérios que só o aparelho ou um humano fecham** (E1, E3,
E4, E5, F1, G4, G5, I1).

**Uma linha cada (faça estes primeiro):**
- **`marcadorVisivel: !!(grupo && grupo.visible && grupo.parent)` + `marcadorNaCena`**
  em `js/xr/xrinteract.js:773` — fecha o defeito novo nº 2;
- **`pos:` do radial olhando para `parent` também** (`:793`);
- **`stdio: ['ignore', 'inherit', 'inherit']`** em `server.js:1094` — devolve o
  sintoma que escondeu o defeito dos bots por meses;
- **os dois títulos de `test/xr-weapon.test.js:429,447`**, que anunciam 5 cm e
  cobram 1,00 m e 0,25 m;
- **o comentário de `js/interact.js:46`** (`FORA_MAX = 0,50` → 0,32) e a prosa
  falsa de `test/xr-alcance.test.js:412`, que sobreviveu à rodada 12.

**Pequeno (um arquivo, meia tarde):**
- **um assert em `fiacaoComSonda`** — o número já está calculado e impresso;
  falta a linha que o cobra. Sem ela a funcionalidade nova desta rodada não tem
  guarda nenhuma;
- **o caso "sem salto"** precisa medir o passo **antes** do clamp de
  `consumirPasso`, ou medir a velocidade do escoamento direto;
- **a FACA**: registro de mira e golpe separados, e alcance medido da PONTA. Hoje
  são 1,94 m de alcance invisível na arma inicial do BR.

**Médio (uma decisão + código):**
- **A6** — quinta rodada com as duas causas paradas:
  `city-destruction-client.js` precisa de gate de `presenting`, e os dois
  `camera.getWorldDirection` de `br-game.js` precisam da fonte única
  (`yawDaVista()`) que já consertou os três irmãos deles;
- **A amarra da exceção de C2** precisa conferir o comportamento com o `porta`
  no caminho, não só as constantes;
- **H2** — mapa e pulso precisam sair de 0,3777/0,3956 m. Três rodadas no mesmo
  número;
- **E2** — 200,5 calls e 584,9 k triângulos por olho no castelo, contra 180 e
  500 k. **Piorou 2 calls e 11,7 k triângulos** nesta rodada;
- **B7** — a decisão do texto do critério, que é sua e está pendente há três
  rodadas (§4).

**Grande (sistema):**
- **C5** na parte da malha no olho e no **braço esquerdo** (a âncora do
  guarda-mão está fora do alcance anatômico do boneco — ou o boneco cresce, ou a
  âncora vem para perto, ou se assume o caminho da Valve e não se desenha corpo);
- **B5** (a segunda mão), **C2** de verdade, e a trava de distância de baú no
  servidor.

**Só o dono fecha:** as 20 caixas de I1, a legibilidade de G4, a captura de G5 e
os quatro números do aparelho (E1, E3, E4, E5, F1). **O kit está pronto há duas
rodadas — o que falta é a sessão.**

---

## 10. Onde eu acho que você errou — com todas as letras

Foi pedido. Nesta rodada a lista é curta, e é a mais curta das quatro últimas.

1. **A sonda de sólido entrou sem guarda de fiação, na rodada seguinte àquela em
   que você escreveu a lição contra isso.** O arquivo conta `fiacaoComSonda`,
   imprime `fiacaoComSonda`, e não asserta `fiacaoComSonda` — e duas linhas
   acima está escrito, em maiúsculas, que a fiação é do jogo e isso é cobrado.
   Arrancar o terceiro argumento deixa 63 casos verdes em três arquivos. Foi
   você quem catalogou os nove formatos do "teste que passa por acidente"; este
   é o formato "medir e não cobrar", e ele entrou no mesmo commit.
2. **Você consertou uma das duas APIs que eu nomeei e a outra não.** O laudo da
   rodada 12 diz, com os dois nomes: *"`estado().radial.visivel` e
   `estado().marcadorVisivel` reportam `true` com o objeto fora da cena"*.
   `radial.visivel` ganhou `&& parent` e `naCena`; `marcadorVisivel` ficou
   idêntico. Consertar metade de um par nomeado é pior que não consertar
   nenhuma: agora a assimetria parece intencional.
3. **O caso "sem salto" mede depois do clamp.** `consumirPasso` limita a própria
   saída a 0,15 e o assert cobra 0,155. Multipliquei `ESCOA_FORA` por 167 e o
   caso ficou verde. É o mesmo padrão do `|dir| ≈ 1` de `xr-weapon` que já foi
   apontado: assertar uma propriedade que a implementação garante.
4. **Você publicou "origem 0,0000 m do cano" para a bazuca sem notar que os dois
   lados da conta são a mesma chamada.** `origemFoguete = _v3 =
   muzzle.getWorldPosition(_v3)` e `_canoPosDoTiro = muzzle.getWorldPosition()`,
   mesmo frame, sem transform no meio. O conserto está certo e a mutação de
   reversão morre — mas o número não prova o que o texto diz que prova, e você
   escreveu o aviso contra exatamente isso, para a direção, quatro páginas antes
   no mesmo arquivo.
5. **O commit publica "ida-e-volta de 5 m devolve a cabeça com erro 0,0000 m".**
   Com a parede realmente segurando o colisor eu meço **0,1320 m**, na vista e no
   colisor igualmente. Não é grave — o corpo foi empurrado, e isso é física
   correta — mas 0,0000 m não é o número deste cenário, e "erro zero" é o tipo de
   afirmação que ninguém re-mede depois.
6. **`FORA_MAX` desceu de 0,50 para 0,32 e o comentário de `js/interact.js:46`
   ficou para trás**, afirmando uma relação de ordem que hoje está invertida. É a
   mesma classe do `Box3` que você acabou de corrigir em dois arquivos: o texto
   que a próxima pessoa vai ler.

**E o que você acertou, com o mesmo peso — porque desta vez é a maior parte.**
As quatro correções que eu pedi **fecharam as quatro**, e eu ataquei cada uma
pelo lado que eu escolhi, não pelo que você me ofereceu: a bazuca com o foguete
que aparece na cena e com quatro cenários de auto-detonação; a parede com a
folga assinada até a face do sólido, e pelas duas pontas; o braço nas dez poses,
na malha skinada; o disco em três sessões, varrendo o grafo. **Nenhuma delas
tinha algo atrás.** Isso não aconteceu nas oito rodadas anteriores.

E a decisão de projeto da bazuca — inverter a sua própria escolha da rodada
anterior porque projétil VISÍVEL não aceita origem deslocada, e escrever o
porquê no código — é a coisa mais madura deste porte inteiro. Foi você quem
mediu que a primeira tentativa ainda dava 0,46–0,91 m e quem decidiu não
publicar aquilo como pronto.

---

E uma frase para fechar, porque o padrão desta rodada é diferente das oito
anteriores. **Pela primeira vez, tudo o que a rodada se propôs a consertar
fechou, e o que eu achei de novo não está no jogo — está nas guardas.** Os cinco
defeitos novos são todos afirmações escritas que o código não sustenta: um teste
que conta e não cobra, uma API consertada pela metade, um assert que não pode
falhar, uma premissa de exceção que não vale em todo cenário, e um comentário com
a constante velha.

Isso é progresso real e é um risco novo. As oito rodadas anteriores tinham
defeito de JOGO escondido atrás de teste verde; esta tem teste verde escondendo
**a ausência de rede** para o que acabou de entrar. O jogo está melhor do que a
suíte sabe provar — e é exatamente essa a distância que a rodada 10 vai pagar, se
alguém mexer na parede sem saber que a sonda não tem guarda.
