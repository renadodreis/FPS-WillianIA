# Validação do porte VR — commit `da3987c`

Oitava rodada de validação. Autor: o **validador**. Procedimento: §12 de
`criterio-aaa.md`, reexecutado inteiro. A régua não foi tocada.

**Condição declarada** (sem isto não é medida): commit `da3987c` na `dev`, árvore
**byte a byte idêntica ao HEAD** (`git diff --stat` vazio antes, entre e depois de
todas as mutações — conferido três vezes, com md5 dos quatro arquivos mutados);
máquina ociosa, `load average` de 1 min entre **0,40 e 0,66** durante todas as
sondas (teto do §12: 1,5), 12 núcleos; Chrome com GPU real; IWER 2.3.0 preset
Meta Quest 3; seed 424242; sessão `immersive-vr` real via `test/helpers/iwer.js`
→ `bootEmVR`; **portas 3590–3599**, nenhuma outra, nunca a 3000. **Treze sessões
imersivas, duas sessões de monitor e uma passada de `vr-emulado`.** `npm run
lint` limpo. `node --test test/security-regression.test.js` → **9/9**.

**Placar: 25 verdes · 9 vermelhos · 5 não medidos, em 39.**
Progressão de verdes: 14 → 19 → 22 → 22 → 23 → 25 → 26 → **25**.

O placar caiu um, e a leitura honesta não é "o jogo piorou um". É isto:

- **+2 verdes reais:** **B3 fecha pela primeira vez em oito rodadas** (o tiro
  passa onde a alça aponta em todas as armas, nos três caminhos) e **D2 fecha**
  (ataquei a régua de alcance com 9,2 m de separação e ela não entregou um
  centímetro).
- **−3 vermelhos:** **D4 volta a vermelho por regressão medida** (o disco e o
  marcador nunca mais entram na cena a partir da segunda sessão), **H1 cai
  junto** (o prompt de interação é um dos 17), e **I3 sai de "não medido" para
  vermelho** — não é regressão, é a primeira vez que alguém mede.

**Sobre o denominador.** Os 47 critérios contêm **8 que nenhuma máquina fecha**
(E1, E3, E4, E5, F1, G4, I1 e G5): dependem do aparelho ou de um humano de
headset. O denominador honesto do que **eu posso** validar é **39**, e é nele que
este laudo pontua.

---

## 0. Como estas medidas foram feitas — e os três instrumentos que mentiram

Escrevo isto primeiro porque cada um destes custou uma medição errada, e os três
são reaproveitáveis:

1. **`Box3.setFromObject` num `SkinnedMesh` devolve a caixa da PRIMEIRA POSE — e
   o mecanismo NÃO é o que foi escrito no commit.** O efeito que o construtor
   descreveu está certo; a explicação, não, e isso importa porque é o que um
   leitor futuro vai usar para decidir. `SkinnedMesh.computeBoundingBox`
   (`three.core.js:23885‑23902`) **é ciente da pose** — ela vai por
   `getVertexPosition` → `applyBoneTransform` → `bones[].matrixWorld`. O defeito
   é **congelamento de cache**: `Box3.expandByObject` (`:16056‑16068`) usa
   `object.boundingBox` quando ela já existe, só computa se for `null`, e **o
   valor fica para sempre**. Ou seja: a caixa não é "crua", ela é **velha**.
   Consequência prática oposta à do texto do commit — o conserto não é abandonar
   a caixa, é **recomputá-la por frame**, que é exatamente o que os três
   arquivos corrigidos fazem. Eu, ainda assim, não usei caixa nenhuma para
   julgar o corpo: medi **vértice por vértice com `SkinnedMesh.getVertexPosition`**,
   3641 vértices por amostra. É a leitura que não depende de cache nenhum, e é o
   que sustenta os números de C5 e I3 deste laudo.
2. **`groundAt(x, z, 999)` devolve o TETO.** Voltou a me morder: plantei o
   jogador no telhado e a bazuca disparou por cima de tudo — quatro cenários
   inteiros de "SEM BOOM" que não mediam nada. O uso canônico é
   `groundAt(x, z, pos.y)`. É a terceira rodada seguida em que esta armadilha
   aparece; ela agora está consertada no kit (§4), mas continua viva em quem
   escrever sonda nova.
3. **Trocar a escala do corpo e esperar um frame não prova nada.** `js/xr/xrbody.js:280`
   reescreve `corpo.scale` TODO FRAME. Minha primeira prova de causalidade do
   braço deu "não muda nada" porque a escala voltava antes da leitura. A prova
   que vale é **síncrona**: trocar a escala e chamar `FpBody.update()` na mesma
   linha do tempo, antes de qualquer RAF.

E uma quarta, que é do produto e não da sonda: **`R.info.render.calls` lido fora
do laço XR não vê o sprite.** Minhas 12 amostras pareadas do disco do radial
deram mediana **0**, com um **−4** e um **+2** no meio. É o mesmo furo que o
laudo anterior apontou; ele continua ali, e por isso a conta de draw call do
radial continua **não provada por medição direta**.

E uma quinta, que não me atingiu mas atinge quem escrever sonda nova:
**`game.js:1974` chama `XR.place` e `game.js:2113` chama `FpBody.update`, na
mesma passada** — então qualquer amostrador pendurado em `XR.place` (é o que
`test/xr-corpo-ancora.test.js` faz) lê o corpo do frame **N−1**. Em regime
permanente é inócuo, e por isso os números daquele arquivo valem; para qualquer
teste de TRANSIENTE é fatal, e é o mesmo vício que já custou uma rodada em
`fa9ed86`. **As minhas sondas não usam esse gancho**: elas esperam a estabilizar
e leem as matrizes vivas.

---

## 1. Veredito, um por critério

### A — Giro e locomoção

| # | veredito | medido |
|---|---|---|
| A1 · giro não translada a cabeça | **APROVA** | Herdado — `js/xr/xrturn.js` e `js/xr/xrrig.js` fora do diff `2d55610..da3987c`. |
| A2 · passo é escolha do jogador | **APROVA** | Herdado, mesmo motivo. |
| A3 · velocidade humana | **APROVA** | Herdado (`xrlocomotion.js`/`xrcomfort.js` intocados). |
| A4 · aceleração instantânea | **APROVA** | Herdado, com a exceção declarada de `paridade`. |
| A5 · vinheta some ao parar | **APROVA** | Herdado. Re-conferido de lado: `escuro` volta a **0,0000** ao sair da parede. |
| A6 · nada além do pescoço move a vista | **REPROVA — as duas causas intactas, quarta rodada** | `city-destruction-client.js:154/175/179/180` continua escrevendo `MP.camera.fov`, `.position` e `.quaternion` na cinemática, e `grep presenting` nesse arquivo devolve **0**. `br-game.js:829` e `:1379` continuam pilotando queda livre e paraquedas por `MP.camera.getWorldDirection`. Nenhuma linha mudou nesta rodada. |

### B — Mira e empunhadura

| # | veredito | medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | **APROVA** | Herdado (`xrweapon.js`, `xrhands.js` fora do diff). |
| B2 · 1:1 sem bob nem sway | **APROVA** | Herdado. |
| B3 · dá para ver pelo buraco | **APROVA — primeira vez em oito rodadas** | **8 armas × 6 distâncias, nos três caminhos: 0,0000 m.** Ângulo tiro↔cano **0,0000°** nas sete armas de fogo. Projétil de BR: `naLinha` ≤ **4,3e−14 cm**, erro **0,0000 cm** a 2/10/100 m nas seis. Bazuca em quatro pitches: **0,0000° em todos**, amplitude de zeragem **0,0000°**. §2.1. |
| B4 · botão de mirar não teleporta | **APROVA** | Herdado. |
| B5 · segunda mão importa | **NÃO MEDIDO** | Não existe conceito de segunda mão. **Oitava rodada.** |
| B6 · háptico em toda ação | **APROVA** | Herdado. |
| B7 · o tiro sai do cano | **REPROVA — e a BAZUCA regrediu de 0,0000 m para 0,9087 m** | Por arma, `\|origem − cano\|`: AGULHA 0,0587 · FALCÃO 0,0697 · RAJADA 0,0917 · FUZIL 0,1056 · TROVÃO 0,1806 · PLASMA 0,2026 · FACA 0,4365 · **BAZUCA 0,9087**. Teto do critério: 0,05 m; teto do teste: 0,25 m. §2.2. |

### C — Corpo, altura e escala

| # | veredito | medido |
|---|---|---|
| C1 · nunca enterrado | **APROVA** | Re-medido porque o `xrbody` mudou. **400 frames**, quadrado de 2 m, passo físico de 2 cm: folga **1,5949 – 1,6051 m**, amplitude **10,3 mm**, `fora` 0, `escuro` 0 (janela 1,20–2,10). |
| C2 · o corpo segue a cabeça | **REPROVA — 9,2200 m** | Caminhada livre de 1,2 m: separação máxima **0,0200 m** ✔ (um passo físico). Contra estrutura, 10 m de caminhada física: vista **10,0000 m**, colisor **0,7800 m**, separação máxima **9,2200 m**, `fora` máximo **9,1999 m** — continua sem teto. §2.4. |
| C3 · altura do aparelho, agachar | **APROVA** | `crouchT` acompanha: 0 a 1,62 m de cabeça → 1,000 a 1,10 m → 0 de volta a 1,62 m, sem travar. |
| C4 · escala 1:1 em metros | **NÃO MEDIDO** | **Oitava rodada.** |
| C5 · corpo em 1ª pessoa coerente | **REPROVA — melhorou muito e continua fora do aceite** | Medido na malha SKINADA (3641 vértices), 10 poses: **geometria do corpo entre 0,0092 m e 0,0829 m do olho** (teto 0,15 m). Mão do boneco a **0,3886–0,4165 m** (direita) e **0,2256–0,4504 m** (esquerda) da empunhadura da arma — no monitor o mesmo número é **0,0000 m**. Ombro volta a subir acima do olho a partir de 0,95 m de cabeça (**+0,0521 m**). §2.3 e §3.B. |
| C6 · o avatar que os OUTROS veem | **APROVA** | Herdado; ressalva de C2 permanece. |

### D — Interação com o mundo

| # | veredito | medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | **APROVA** | Herdado da rodada 11 (medido pelo efeito). |
| D2 · alcance medido da cabeça | **APROVA — ataquei com força e ela aguentou** | Caminhada livre: régua **0,0000 m** da cabeça (é a cabeça). Contra parede, com **9,214 m** de separação real: régua nunca passou **0,0200 m** à frente do corpo, **nunca entrou no sólido** (máximo −0,3999 m), e o baú a **1,095 m da CABEÇA** (3,705 m do corpo) **não acendeu o aviso**. Baú a 2,30 m do corpo abre; a 2,55 m não. O marcador de XR concorda (`acionavel: false`). §2.5. |
| D3 · pegar é com a EMPUNHADURA, e perto | **APROVA** | Herdado. |
| D4 · affordance dentro do mundo | **REPROVA — regressão medida** | Na **primeira** sessão o disco funciona e é bom: nasce a **0,4380 m** do olho, **0,0000°** fora da direção da mão; a mão andou **0,6465 m** e o disco **0,0000 m**; o pescoço girou **40°** e o disco andou **0,0163 m**. **Na segunda sessão o disco E o marcador não estão na cena** (`parent` nulo, ausentes de `scene.traverse`) enquanto as duas APIs de estado reportam `visivel: true`. §2.6. |
| D5 · veículo sem quebrar cabeça nem chão | **APROVA** | Herdado; oitava rodada com a ressalva de não ter re-isolado o salto de saída. |
| D6 · tudo alcançável de posição fixa | **NÃO MEDIDO** | **Oitava rodada.** |

### E — Desempenho

| # | veredito | medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | **`aguardando aparelho`** | — |
| E2 · orçamento em estéreo | **REPROVA** | `node scripts/vr-emulado.js --port=3598`: menu **346 / 997 250**, spawn **360 / 1 013 616**, cidade **370 / 844 996**, castelo **397 / 1 146 432**. **Por olho:** 173 / 180 / 185 / **198,5** calls e 498,6 k / **506,8 k** / 422,5 k / **573,2 k** triângulos. Tetos 180 / 500 k. Contra a rodada 11 (346/356/370/401): **praticamente plano**, castelo −2 calls por olho. |
| E3 · escala de render ≥ 85 % | **`aguardando aparelho`** | — |
| E4 · lógica de app ≤ 2 ms | **`aguardando aparelho`** | — |
| E5 · térmica 30 min | **`aguardando aparelho`** | — |

### F — Boot e ciclo de sessão

| # | veredito | medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | **`aguardando aparelho`** | — |
| F2 · foco perdido | **APROVA** | Herdado (`xrsession.js` fora do diff). |
| F3 · recentrar não teleporta nem enterra | **APROVA** | Herdado (`xrrig.js` fora do diff). |
| F4 · sair devolve o desktop intacto | **APROVA — com ressalva medida** | O desktop volta limpo: `exit()` tira disco e marcador da cena, e nada fica flutuando no monitor. **A ressalva é que ele os tira para sempre** — o custo aparece na volta, e está cobrado em D4/H1. |
| F5 · jogável de ponta a ponta | **APROVA** | Herdado. |

### G — Qualidade de imagem

| # | veredito | medido |
|---|---|---|
| G1 · foveação declarada | **APROVA** | Herdado. |
| G2 · antialiasing em XR | **NÃO MEDIDO** | O IWER não expõe `samples` do alvo XR. `antialias: true` em `game.js:333`. |
| G3 · escala de framebuffer declarada | **APROVA** | Herdado. |
| G4 · texto e mira legíveis | **`aguardando humano`** | — |
| G5 · uma captura por entrega | **`aguardando humano`** | `output/vr/` continua com um único PNG, o `baseline-quest.png` de 25/08. **Oitava rodada sem captura estéreo** — e esta rodada pôs um disco novo no campo de visão do jogador. |

### H — HUD e UI dentro do mundo

| # | veredito | medido |
|---|---|---|
| H1 · nada essencial só no DOM | **REPROVA — 16 de 17 a partir da segunda sessão** | Na primeira sessão os 17 estão lá. Na segunda, o **prompt de interação** não existe: o marcador não está na cena (§2.6). Um item reprova a lista inteira, por regra do próprio critério. |
| H2 · UI não é colada na cara | **REPROVA — inalterado** | Re-medido: mapa **0,3777 m**, pulso **0,3956 m**, arma **0,5520 m**. A régua pede ≥ 0,45 m e nada mais perto que 0,75 m para leitura demorada. O disco novo nasce entre **0,42 e 0,55 m** (medi 0,4380 e 0,4667): o piso da faixa dele fica abaixo de 0,45 m, mas é ação rápida e cita a fonte certa da Meta — não é ele que reprova H2, são os dois de sempre. |
| H3 · o retículo não mente | **APROVA** | Por ausência declarada. |

### I — Ausência de defeito grosseiro

| # | veredito | medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | **`aguardando humano`** | **Zero caixas em oito rodadas.** O único artefato em `output/vr/` é um **ENSAIO** que diz, em negrito, que nenhuma medição foi feita — honestidade do kit, não validação. §4. |
| I2 · zero erro de console | **APROVA** | `pageErrors` e `consoleErrors` **vazios nas treze sessões imersivas**, inclusive nas duas que saíram e voltaram da sessão. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | **REPROVA — primeira medição em oito rodadas** | Malha skinada, 10 poses de controle e de cabeça (inclusive a receita literal do critério: pitch −70° e yaw ±60°): a geometria do corpo fica entre **0,0092 m** e **0,0829 m** do olho. Teto: 0,15 m. O pior caso é o braço levantado, com o vértice a **9,2 mm** do olho. §2.3. |
| I4 · nenhum estado sem saída | **NÃO MEDIDO** | Faltam nave, queda livre, paraquedas, dirigindo, espectador e fim de partida. |

---

## 2. O que mudou, auditado

### 2.1 · A mira — os dois caminhos que faltavam morreram, e eu confirmo

Esta é a melhor correção deste porte, e ela agora está completa. Medi disparo
real (gatilho do Touch), com o spread **de verdade** zerado (`spread`,
`spreadHip`, `spreadAds` e `pellets` — zerar só `gun.spread` não zera nada), nas
oito posições do arsenal, e reconstruí o raio pelo gancho de ponto final.

**Caminho hitscan e projétil do BR, em XR:**

```
FUZIL, TROVÃO, FALCÃO, PLASMA, AGULHA, RAJADA
  ângulo tiro↔CANO (referência independente do código de mira): 0,0000°
  erro contra a linha de mira a 2 / 5 / 10 / 25 / 50 / 100 m: 0,00000 m
  projétil do BR: naLinha ≤ 4,3e-14 cm · erro 0,0000 cm em TODAS as distâncias
```

Era 9,10 cm no fuzil, 7,00 no DMR, 20,00 no plasma e 5,89 no sniper — constantes
em toda distância, no modo que o dono joga. **Morreram.**

**A bazuca, em quatro pitches diferentes (−0,15 / −0,50 / −0,75 / −1,10 rad):**

```
ângulo foguete↔cano: 0,0000°  0,0000°  0,0000°  0,0000°
amplitude entre os quatro: 0,0000°     (era 0,0630° a 2,4172°)
zeragem: não existe mais em XR         (variava de 5,60 m a 120,00 m entre tiros)
```

**Fora de XR nada mudou, e isto eu medi em vez de deduzir do `if`:**

```
monitor, bazuca:  ângulo tiro↔cano 0,9312° · 4,8318° · 4,8537° · 4,8751°
                  (a zeragem por rayBlockedAt continua viva, variando com o pitch)
monitor, projétil de BR: nasce no CANO, naLinha 28,99 a 31,55 cm, constante
```

Nenhuma regressão no monitor. Confirmado.

**E a separação `marcarMiraQA`/`marcarTiroQA` funciona — com número.** No monitor,
a bazuca registra `erroRegistrado` de **135 a 816 cm a 100 m**: os dois registros
divergem. Sob o clobber anterior aquele número seria **zero por construção**. A
tautologia do segundo lugar morreu.

**Duas ressalvas honestas, nenhuma delas reprova B3:**

- **A FACA continua imensurável.** O ramo melee (`game.js:2345‑2346`) chama
  `marcarMiraQA(_rayOrig, _rayDir)` e `marcarTiroQA(_rayOrig, _rayDir)` com **o
  mesmo par**: a mira e o tiro voltam a ser a mesma reta, e a distância dá zero
  por álgebra. Medi `grausDoCano = 10,0859°` na faca — mas ali o "cano" é o
  `muzzleAnchor` de uma lâmina, não um cano; o número não significa nada. A faca
  é o único slot em que B3 não tem instrumento.
- **`canoDoTiro()` é âncora de ÂNGULO, não de posição.** Medi `grausMiraCano =
  0,0000°` em todas as armas de fogo: a linha de mira e o cano são **paralelos**
  neste jogo. Então o cano pega eixo óptico torto (foi o que a mutação provou) e
  **não** pega deslocamento lateral. Para deslocamento a referência que vale é a
  massa de mira do modelo, que `test/xr-weapon.test.js` já usa.

### 2.2 · A bazuca — a correção da mira abriu um buraco de 0,91 m, e ele dói

`|origem − cano|` da bazuca foi de **0,0000 m** (rodada 11) para **0,9087 m**.

A causa é uma linha que não foi escrita. No hitscan, `game.js:2464‑2468` avança
`_rayOrig` ao longo da linha de mira pela **projeção longitudinal do cano** —
por isso `|origem − cano|` do fuzil é a altura da alça (0,1056 m) e não o
comprimento da arma. O ramo do foguete recebeu a origem na linha de mira **sem
esse avanço**: o foguete passa a nascer na OCULAR, que fica 0,91 m atrás da boca
do tubo.

O comentário que sobrou em `game.js` diz, ainda hoje: *"Parede colada na boca
continua sendo atingida — a colisão parte do muzzle."* Em XR isso deixou de ser
verdade: `js/rockets.js:50‑72` varre o segmento a partir do `from` que recebe.

**Medido, com a bazuca apontada para uma parede de 0,45 m de espessura, com o
tubo atravessando-a (a pose de enfiar o cano pela quina, que em VR é instintiva
porque a arma não colide com nada):**

| recuo do jogador | origem do foguete | detonação até a cabeça | dano em si mesmo |
|---|---|--:|--:|
| 0,30 m | **ocular (hoje)** | **0,390 m** | **42** |
| 0,30 m | cano (como era) | 35,481 m | 0 |
| 0,45 m | **ocular (hoje)** | **0,419 m** | **42** |
| 0,45 m | cano (como era) | 35,478 m | 0 |
| 0,60 m | **ocular (hoje)** | **0,567 m** | **41** |
| 0,60 m | cano (como era) | 35,438 m | 0 |
| 1,20 m | ocular | 1,184 m | 39 |
| 1,20 m | cano | 1,182 m | 39 |

Mesma pose, mesmo gatilho: **0 de dano antes, 42 de dano agora** — 42 % da vida
do jogador, três vezes seguidas. A partir de 1,20 m os dois caminhos convergem,
que é como tem de ser.

**O conserto é uma linha:** aplicar ao ramo do foguete o mesmo `avanco` que o
hitscan já calcula. `|origem − cano|` cai para a altura de alça da bazuca —
**0,132 m**, extrapolada da própria trilha do traçante — e a detonação volta a
partir do tubo.

**Nenhum teste pega isto.** O único caso que cobra `aoCano` (`xr-mira`, caso 2)
mede **a arma que estiver na mão naquele instante**, e a bazuca nunca está. O
caso de `xr-weapon` que cobra ≤ 0,25 m também não a visita. E o comentário desse
caso diz, literal, que 25 cm *"reprova qualquer volta dos 44–91 cm"* — a bazuca
está em **90,9 cm** e nada reprovou.

### 2.3 · O corpo — a perna dobra de verdade, e o braço não segura a arma

**Confirmo os números do construtor, e a direção está certa.** Medindo os OSSOS:

| grandeza | rodada 11 | **agora** |
|---|--:|--:|
| joelho, em pé | — | **169,1°** |
| joelho, agachado a 1,10 m de cabeça | 169,1° | **33,7°** |
| ombro direito vs olho, agachado a 1,10 m | +0,1905 | **−0,0971** |
| malha abaixo do chão, agachado | — | **0,0184 m** |

A perna encurta, o joelho absorve, o pé fica no chão (2 cm de malha abaixo do
piso no agachamento cheio). É trabalho bom.

**Mas C5 continua reprovado, por duas coisas medidas na malha skinada.**

**(a) A geometria do corpo entra no olho.** Dez poses, incluindo a receita
literal do critério:

| pose | geometria mais perto do olho |
|---|--:|
| arma no quadril | 0,0820 m |
| arma pronta | 0,0687 m |
| arma no olho | 0,0399 m |
| braço estendido | 0,0719 m |
| **braço para cima** | **0,0092 m** |
| colado no peito | 0,0484 m |
| olhando para baixo (−70°) | 0,0716 m |
| olhando 60° para os lados | 0,0820 / 0,0824 m |

Teto de C5 e de I3: **0,15 m**. **Nenhuma das dez poses passa.** Conferi que não
é artefato do crânio encolhido: o vértice mais perto está a **0,1055 m do osso da
cabeça**, e o número não muda com a cabeça em tamanho normal. É malha de gola e
de braço, e ela é desenhada — `bodyRoot.visible` acompanha `weaponRoot.visible`,
que em XR está sempre ligado.

**(b) A mão do boneco não segura a arma.** Ver §3.B — é o item B do briefing, e é
defeito, não folga.

**(c) Onde a nova âncora deixa de valer.** O corpo desce com a cabeça enquanto a
perna dá conta. A partir de **0,95 m de altura de cabeça** ela não dá mais, e o
ombro volta a subir acima do olho (**+0,0521 m**). É o limite anatômico que o
próprio código declara, e é honesto — mas 0,95 m de olho é um jogador **sentado
no chão**, e VRC.Quest.Tracking.1 aceita sessão sentada como modo válido.

### 2.4 · A parede — item C do briefing, re-medida

Receita canônica: 10 m de caminhada física em degraus de 2 cm contra o sólido
grande mais próximo, 500 amostras.

| grandeza | `2d55610` | **`da3987c`** |
|---|--:|--:|
| a VISTA andou | 10,0061 m | **10,0000 m** |
| o COLISOR andou | 1,6435 m | **0,7800 m** |
| separação máxima cabeça↔colisor | 8,4140 m | **9,2200 m** |
| `fora` máximo | (sem teto) | **9,1999 m** (sem teto) |
| escurecimento máximo | 1,0000 | **1,0000** |
| na volta: `fora` / separação / `escuro` | 0 / 0,0417 / — | **0 / 0,0000 / 0,0000** |

**Nenhuma linha deste caminho mudou nesta rodada**, e eu confirmo item por item:

1. **`fora` continua sem teto.** Medi 9,20 m acumulados numa caminhada só.
   `devolverPasso` (`js/xr/xrrig.js:349`) segue `foraX += dx` sem clamp.
   **Igual.** Conserto: um `FORA_MAX`, uma linha.
2. **A cortina continua atrasando por rampa linear** (`FORA_K·dt`) —
   **igual**. Mas o efeito é muito menor do que o laudo anterior registrou, e
   digo por quê com número: `fora` passa de 0,05 m no degrau **42**, `escuro`
   passa de 0,5 no degrau **60**, e **no primeiro frame escuro a cabeça está
   0,0200 m dentro do sólido**, com `fora` já em 0,4200 m. A janela de "vista
   limpa dentro do sólido" foi de **1 frame, a ~0 m de profundidade**, contra os
   0,27–1,10 m do laudo anterior. **Isso não é correção — é a parede.** O `fora`
   começa a crescer enquanto a cabeça ainda está ~0,4 m fora da face (o colisor
   é uma cápsula com raio), e essa dianteira depende da geometria do sólido que
   a sonda encontrou. Registro os dois números com a condição de cada um; o
   mecanismo é o mesmo e continua sendo rampa.
3. **A separação cabeça↔colisor** é o que C2 cobra e continua **92× acima do
   teto**. A troca A6-sobre-C2 continua **sem exceção declarada em código**,
   quinta rodada. A4 tem `EXCECOES` com motivo e custo; esta tem prosa.

**Tamanho do conserto de C, honestamente:** o teto de `fora` é **uma linha**. A
rampa da cortina é **um número** (ou uma curva que responda a `fora` em vez de a
`dt`). A exceção declarada em código é **meia hora**. O que **não** é pequeno é
fazer C2 ficar verde de verdade — isso exige guardian/limite de jogo, e é
projeto, não ajuste.

### 2.5 · A régua de alcance — atacada com força, e ela aguentou

O briefing pediu ataque. Ataquei.

**Uso normal (1,2 m de caminhada física, 60 amostras):**

```
separação cabeça↔corpo máxima : 0,0200 m   (um passo físico)
régua adiante do corpo, máx    : 0,0200 m
régua até a CABEÇA, máx        : 0,0000 m   ← a régua É a cabeça
fora                           : 0
```

D2 pede erro ≤ 0,10 m contra a leitura direta da cabeça. Medi **0,0000 m**.

**Ataque, com separação sete vezes maior que a do construtor:**

```
separação real cabeça↔corpo    : 9,2140 m   (o construtor testou com 2,610 m)
régua adiante do corpo, máx    : 0,0200 m   em 500 amostras
régua dentro do sólido, máx    : -0,3999 m  ← nunca entrou na parede
baú a 2,30 m do CORPO          : aviso ACESO   ✔
baú a 2,55 m do CORPO          : aviso APAGADO ✔ (o raio de 2,4 m não cresceu)
baú a 1,095 m da CABEÇA        : aviso APAGADO ✔ (8,125 m do corpo)
marcador de XR no mesmo instante: acionavel = false  ← as duas réguas concordam
```

**A régua está certa e o contrato entre os dois módulos vale.** Reproduzi as duas
pontas que o construtor declarou e elas batem.

**Uma ressalva que só apareceu mutando (§5.2):** quem segura o caso extremo não é
o desconto, é o **teto de 0,35 m**. Com o desconto arrancado, a régua vira a
cabeça crua e o teto ainda a segura em 0,35 m — e o baú do outro lado da parede
continua fechado. São dois guardas independentes, o que é bom projeto; mas é
importante saber qual está trabalhando.

### 2.6 · O radial — bom na primeira sessão, ausente na segunda

**Na primeira sessão o disco é a melhor peça de interface deste porte, e eu
confirmo os números do construtor:**

| grandeza | construtor | **eu** |
|---|--:|--:|
| ângulo (disco−olho) vs (mão−olho) | — | **0,0000°** |
| distância ao olho ao nascer | 0,42–0,55 m | **0,4380 m** e **0,4667 m** (duas poses) |
| a mão andou / o disco andou | 0,528 / 0,0000 | **0,6465 / 0,0000 m** |
| pescoço 40° / o disco andou | 0,0163 m | **0,0163 m** (ao milímetro) |
| passo físico 0,504 m / o disco andou | — | 0,504 m (ancorado no CORPO, por projeto) |

**E então sai da sessão e volta.** Medido, com o mesmo baú ao alcance e o mesmo
gesto nas duas sessões:

| | sessão 1 | **sessão 2** |
|---|:--:|:--:|
| disco na cena (`scene.traverse`) | **sim** | **NÃO** |
| disco tem pai | **sim** | **NÃO** |
| `estado().radial.visivel` | true | **true** ← mente |
| marcador de interação na cena | **sim** | **NÃO** |
| `estado().marcadorVisivel` | true | **true** ← mente |
| alvo detectado | baú | baú |

A causa é de duas linhas. `exit()` remove os dois da cena
(`js/xr/xrinteract.js:748‑752`), e `montarRadial()` e `montar()` abrem com
`if (radial) return;` / `if (grupo) return;` — o objeto continua existindo, a
função sai cedo, e **`scene.add` nunca mais roda**. O `montado = false` do
`exit()` também não ajuda, porque `montar()` não olha para ele.

**O marcador é defeito pré-existente**; o disco é **desta rodada**. Os dois
juntos deixam a segunda sessão **sem nenhuma affordance no mundo** — que é o
critério D4 inteiro, e o item "prompt de interação" de H1.

**E as duas APIs de estado reportam `visivel: true` com o objeto fora da cena.**
Isso não é detalhe: é o que faz o arquivo de teste inteiro passar por acidente
(§5.1).

**Um segundo achado, menor, do mesmo bloco.** Com o radial ABERTO, empurrei o
analógico direito: o rig girou **65,90°**, o disco (congelado, corretamente)
andou **0,0000 m**, e terminou a **101,05°** do eixo da vista — fora do campo de
visão do Quest 3, com o menu ainda aberto e ainda armado. O gate existe em
`js/xr/xrinput.js:280‑285` (`if (out.radial.aberto) girarArmado = false`), mas
**o jogo não usa `cmd.girar`**: `game.js:3557` gira por
`XR.giro.atualizar(dt, eixoDeGiro(fontes))`, que lê o analógico direto da fonte.
`grep "cmd.girar" game.js` devolve **zero**. O autor do teste sabia e escreveu
isso no arquivo (`test/xr-input.test.js:361‑369`, "defesa em profundidade") — a
honestidade está registrada. O que mudou é que agora existe uma coisa para
perder de vista.

### 2.7 · Anti-cheat — não reaberto

`node --test test/security-regression.test.js` → **9 tests, 9 pass, 0 fail**.

Auditei os três vetores desta rodada:

- **A régua de alcance** só desconta; ela nunca põe o ponto de medida à frente da
  cabeça (medi: máximo 0,0200 m adiante do corpo em 500 amostras contra parede,
  e −0,3999 m de folga até a face do sólido). O teto absoluto de 0,35 m é a
  segunda trava. **Não abre alcance.**
- **O radial** não toca posição, dano nem rede.
- **A IK da perna** roda no cliente, em ossos de render; não alimenta colisor,
  hitbox nem estado enviado.

**Um vetor que continua aberto e que NÃO é desta rodada:** o servidor não valida
distância de baú. §3.D.

---

## 3. Os quatro achados que o briefing pediu

### A · `Box3` em pose animada — varri a base inteira

*(Varredura estática executada por sub-agente de leitura, sob meu roteiro e com
os pontos decisivos reconferidos por mim.)*

**Resposta direta ao que foi perguntado: sobrou ZERO na classe defeituosa, e a
premissa do briefing estava errada no mecanismo.** Ver §0, item 1: a caixa não é
"crua", é **cacheada e velha**; `SkinnedMesh.computeBoundingBox` É ciente da
pose. Isso muda o conserto (recomputar por frame, e não abandonar a caixa) e é
por isso que registro aqui.

**(c) Rig skinado esperando refletir a POSE ANIMADA — 3, e as três estão
corrigidas em `da3987c`:** `test/xr-body.test.js:168`,
`test/xr-corpo-ancora.test.js:95`, e `test/xr-agachar-perna.test.js:87/297`, que
já nasceu correto. As três fazem
`raiz.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); })` **antes**
do `setFromObject`, citando a doc do three. `xr-corpo-ancora` vai além e troca o
topo por uma **régua rígida** (`raiz.position.y + eyeDrop*escala`), explicando
que em VR o topo da caixa é o DEDO. **São honestas.**

**(b) Rig skinado em repouso, de propósito — e com dois problemas de
documentação que valem conserto:**

- **`js/fpbody.js:124` é a origem material do bug.** É ela que mede a altura do
  GLB no carregamento — e, ao fazê-lo, **envenena o cache** `boundingBox` do
  corpo de primeira pessoa com a pose de bind. Não há uma linha de comentário
  dizendo isso. Quem for mexer ali precisa saber que aquela chamada tem efeito
  colateral permanente sobre toda medição de caixa do boneco.
- **`js/skeletons.js:320‑323` documenta o MECANISMO ERRADO.** O comentário diz
  que `Box3.setFromObject` *"lê a posição CRUA dos vértices (não a skinada)"* —
  **falso em r185**, e ele contradiz frontalmente o comentário do
  `test/xr-agachar-perna.test.js:79‑85`, que está certo. A decisão do arquivo
  (medir antes de fundir o atlas) continua válida; a justificativa escrita, não.
- Documentados e corretos: `js/skeletons.js:333‑334` (2,1× sobre um mínimo
  medido de 1,968×), `js/meshutils.js:163‑186/214` e `:507‑508` (1,5× sobre um
  pior caso de 1,33×), `js/xr/xrbody.js:117‑119` (geometria crua, 1×).
- **Padrão-ouro da base, para quem for consertar:** `js/charmodels.js:22‑37`
  (`poseBox()`) e `:160‑200` (`boundsDaAnimacao()`, que varre todos os clips).

**(a) Objeto estático** — o resto (lista longa em `car.js`, `carwheels.js`,
`castle.js`, `scenery.js`, `volcano.js`, `weaponmodels.js`, `grass.js`,
`structures.js`, `xr/xrui.js`, scripts e ~15 arquivos de teste). Irrelevante.

**Em `server.js`, `br-game.js` e `game.js`: zero ocorrências.**

**Confirmei por mutação que a correção vale:** com `enc = 0` em
`resolverPernas` (a perna volta a não encurtar), `test/xr-agachar-perna.test.js`
fica **6 de 8 vermelho**. É exatamente o mutante que passava impune antes.

**Dois agravantes LATENTES do cache congelado, que não mordem hoje:**
`SkinnedMesh.copy` (`:23947‑23948`) **clona a caixa velha** para o novo objeto, e
`SkinnedMesh.raycast` (`:23976‑23980`) a usa como corte precoce. O segundo é
inofensivo só porque não há `Raycaster` em produção — hitbox e colisão desta base
são **esferas analíticas** (`enemies.js:194‑201`, `animals.js:123‑129`,
`skeletons.js:277‑281`, `boss.js:134‑142`, `alien.js:114‑120`), não dependem de
caixa nem de pose. O culling depende, e está sustentado por três fatores de folga
que **têm teste de varredura de vértice**. Nada a fazer hoje; tudo a lembrar no
dia em que alguém puser um raycast.

**(3) Proxies da mesma família fora de `Box3` — nenhum defeito novo, dois
fracos:** `test/entities.test.js:28/33/36` julga a raiz do personagem contra o
terreno com tolerância de −0,8 a +1,5 m (vira defeito no dia em que alguém
apertar a margem para "provar pé no chão"), e `test/br-drops.test.js:94` tem
título falando em "de pé" com asserção que só mede `visible`.

**E um proxy do mesmo vício que É defeito, e é desta rodada:** as duas APIs de
estado do `xrinteract` (`estado().radial.visivel` e `estado().marcadorVisivel`)
reportam a intenção do módulo, não o que vai para o compositor. Elas reportam
`true` com o objeto **fora da cena** — medido, §2.6. É o cache congelado do
`Box3` reencenado em outro eixo: o número existe, está atualizado, e não fala do
produto.

### B · `armLen` medido com a raiz em escala 1 — **é defeito, não folga**

O construtor não mexeu porque o braço é compartilhado com três frentes de arma.
Medi o efeito real, dentro da sessão, e ele é grande.

**A causa, com número:** `armLen` é medido no carregamento
(`js/fpbody.js:181‑184`), com `bodyRoot.scale = 1`. Em VR o `js/xr/xrbody.js:280`
escreve a escala do jogador todo frame — **0,8419 a 0,8525** nas minhas sessões.
O solver recebe `armLen` em unidades de mundo sem reescalar:

```
alcance que o solver ACHA que tem : 0,6574 m   (constante, medido a escala 1)
alcance que o braço REALMENTE tem : 0,5535 m   (mesmo braço, escala 0,842)
excesso pedido                    : 18,8 %
```

**O efeito, medido em 10 poses de controle** (distância entre o osso `Hand.R` e a
âncora `gun.parts.handR` que o próprio solver está mirando):

| pose | mão direita | mão esquerda |
|---|--:|--:|
| quadril | 0,4009 | 0,4279 |
| pronto | 0,4024 | 0,3654 |
| no olho | 0,4165 | 0,3506 |
| braço estendido | 0,3886 | 0,4448 |
| para cima | 0,4131 | 0,2256 |
| colado no peito | 0,4078 | 0,4504 |
| olhando para baixo −70° | 0,4041 | 0,3738 |
| olhando ±60° | 0,3980 / 0,3989 | 0,3902 / 0,3660 |

**E a prova de causalidade, em três leituras do MESMO frame:**

| condição | escala da raiz | mão↔âncora (direita) |
|---|--:|--:|
| como o jogo está, em VR | 0,842 | **0,3974 m** |
| raiz forçada a 1, `FpBody.update` chamado na mesma linha | 1,000 | **0,0000 m** |
| escala devolvida, um frame do jogo depois | 0,842 | **0,3973 m** |
| **no monitor, onde a raiz JÁ é 1** | 1,000 | **0,0000 m** |

No monitor a mão cai **exatamente** na empunhadura. Em VR ela erra por **40 cm**,
em toda pose que testei. Como `bodyRoot.visible` acompanha `weaponRoot.visible`,
isso é desenhado no headset: **os braços do boneco não seguram a arma.** É
literalmente o que C5 lista como reprovação ("braço nascendo no ar").

**Veredito: defeito, e dos caros.** O conserto é o mesmo padrão que a perna já
usa (`_lenP.a = legLen[lado].a * escala`): multiplicar `armLen` pela escala da
raiz do frame antes de entrar em `dobrar2Ossos`. Uma linha por braço. O risco
para as três frentes de arma é real e precisa de medição depois — mas o estado
atual **já** está errado, e errado só em VR.

### C · A parede — igual, com um número melhor por acidente de geometria

Respondido em §2.4 com todos os números. Resumo do que o briefing pediu:

| item | rodada 11 | **agora** | mudou? |
|---|---|---|---|
| cortina atrasando | 0,33 s de rampa | mesma rampa; **1 frame de vista limpa, a ~0 m de profundidade** | **mecanismo igual**; o efeito medido é menor por causa da parede que a sonda achou |
| vista limpa de 0,27 a 1,10 m dentro do sólido | sim | **0,00–0,02 m** | idem acima |
| `fora` sem teto | sim | **sim — 9,1999 m medidos** | **igual, e o número cresceu** |
| separação cabeça↔colisor | 8,4140 m | **9,2200 m** | **igual em natureza, pior em número** |

**Tamanho do conserto:** teto de `fora` = **1 linha**. Cortina que responda a
`fora` em vez de a `dt` = **1 função pequena**. Exceção declarada em código, no
molde de `EXCECOES` do A4 = **meia hora**. Fazer C2 ficar VERDE = **projeto**,
não ajuste.

### D · O servidor não valida distância de baú — severidade e tamanho

*(Auditoria estática do servidor executada por sub-agente de leitura, sob meu
roteiro; reconferi os pontos que decidem. **Sem detalhe de exploit, por regra do
CLAUDE.md** — abaixo vai a classe do problema e o caminho, não a receita.)*

**Classe do problema:** abertura de baú é **client-authoritative sem amarra
geométrica no servidor**. `openChest` (`server.js:953‑977`) valida estar vivo e
não espectador, a fase `PLAYING`, repetição por conjunto global, uma janela de
300 ms, e um pré-requisito de estado para uma única chave especial. **Distância:
nenhuma.** E a falta é maior do que só a distância: o servidor **também não
amarra a identidade do baú a nenhum baú que exista no mundo** — as duas faltas
são da mesma família e se fecham pelo mesmo caminho. Ele não conhece a posição de
baú nenhum: os únicos `require` de mundo em `server.js:15‑17` são os três
protocolos puros, e `createStructures` nunca roda headless.

**O que mais pesa: o padrão certo já existe no mesmo arquivo.** `takeDrop`
(`server.js:1007‑1018`) valida **12 m em XZ**, com comparação quadrada sem
`sqrt`. É a mesma classe de ação — pegar loot — e ela já é travada por distância.
**`openChest` é o único ponto de loot fora do padrão da própria base.** E isso já
estava escrito no repositório antes de mim: `js/interact.js:29‑31` e
`docs/vr/referencia-interacao.md:534‑536` dizem, em texto, que a régua do cliente
é a única trava desse caminho.

**Severidade: alta em partida online; irrelevante no solo.** Não porque a régua
ficou frouxa — medi que ela não ficou (§2.5) —, mas porque o valor dela subiu:
hoje ela é a única coisa entre o loot do BR e quem não estiver rodando o cliente
do jogo. Registro como **dívida arquitetural, não como defeito desta rodada**:
nada nesta rodada abriu o vetor, e a régua nova é mais restritiva que a anterior.

**Tamanho do trabalho, por família de baú — e ele é muito desigual:**

| família | quantos | custo de reconstruir no servidor |
|---|--:|---|
| `c*` (mapa aberto) | 34 | **BAIXO** — dependem só de `slopeAt`/`heightAt`/`WATER_LEVEL`, e **já estão reconstruídos em Node** hoje, em `scripts/bots.js:164‑183` |
| `s*` (POI) | vários | **ALTO** — exige `createStructures` headless, que importa three + BufferGeometryUtils e chama `document.createElement('canvas')` |
| torre | 1 | ponto fixo por seed — publicar a coordenada sai mais barato que reconstruir |
| boss | 1 | nasce onde o GOLEM morreu, e `bossHit` não guarda coordenada: exige estado novo |

**O caminho que eu recomendo não é reconstruir — é inverter a autoridade.** O
servidor **gera** a lista `c*` em `buildPlan` e a publica em `match.plan`, que já
viaja inteiro em `matchStart` e em `init.plan`; o cliente passa a **consumir** em
vez de sortear. Isso: (1) remove o acoplamento com o `Math.random` seedado para
essa família, que é o invariante mais caro do repositório; (2) alinha com o que
**nave e zona já fazem**; (3) toca ~5‑6 arquivos em vez de ~14. As outras três
famílias ficam para depois, cada uma com o seu custo declarado — e `s*` é a que
justifica, sozinha, a extração de worldgen puro que o Tier 1 de anti-cheat já
precisava.

**Concordo com o construtor em não ter construído nada.** Trava errada aqui
quebra o jogo ao vivo, e uma trava que erre para o lado restritivo prende o
jogador legítimo em rampa, em escada e dentro de veículo.

**Um efeito colateral do estado atual que vale registrar:** os testes de servidor
de hoje **dependem** de o baú não ser conferido contra o mundo
(`test/server.test.js:721‑726`). Qualquer trava que entre vai reprovar esses
casos — o que é bom sinal, e precisa estar no plano desde o começo.

---

### D-bis · Um achado FORA do escopo de VR, que pode ser defeito ao vivo

A auditoria tropeçou nisto e eu conferi os quatro fatos, um a um:

```
package.json  : three está em devDependencies (^0.185.1); dependencies tem só
                express, socket.io e socket.io-client
Dockerfile:8  : RUN npm ci --omit=dev
js/terrain.js:5 : import * as THREE from 'three'
scripts/bots.js:134 : await import(.../js/terrain.js)  — e server.js:1093 sobe
                      scripts/bots.js como processo filho
```

Em produção, portanto, **o servidor não tem `three`**, e o import do terreno pelo
processo de bots falha. **Não é crash:** `scripts/bots.js:252` tem `.catch` que
loga `[bots] terreno indisponível` e devolve `null`. O que se perde é o terreno
dos bots — e com ele `createBotChestSpots`, ou seja, **os bots deixam de ter
baús e de conhecer a altura do chão**.

**Não confirmei na imagem de produção** — não é meu escopo e eu não tenho o
container. É `aguardando verificação em produção`: um `docker exec` procurando
`[bots] terreno indisponível` no log fecha a questão em um minuto. Registro aqui
porque é barato de conferir e porque, se for verdade, está no ar.

---

## 4. O kit `npm run vr:sessao` — **sim, dá para soltar**

**Os dois furos que eu apontei estão fechados, e eu conferi os dois.**

| furo | estado |
|---|---|
| `vereditoE1` saía VERDE com `abaixoDaTaxa`/`staleMax` ausentes | **fechado.** `scripts/vr-sessao.js:642‑651` filtra `abaixoDe60`, `abaixoDaTaxa`, `staleMax` e `staleSoma` por `typeof === 'number' && isFinite`, e devolve `aguardando aparelho` — não devolve verde e não imprime `undefined` dentro de texto verde. |
| `groundAt(cabeca.x, cabeca.z, 999)` media o TETO | **fechado.** `:490` passa `G.player.pos.y`, com o comentário explicando que o terceiro argumento é janela de 0,65 m e não máximo. |

`node --test test/vr-sessao-vereditos.test.js` → **9/9**, e os casos novos cobrem
nominalmente "campo AUSENTE não é campo zerado" e "sem amostra, aguarda o
aparelho".

**E o kit foi rodado em branco, e se comportou.** `output/vr/sessao-2026-08-27T03-55/`
traz um relatório que abre com, em negrito: *"ENSAIO — NENHUMA MEDIÇÃO FOI FEITA"*,
com `aguardando aparelho` em todo número e `teclado do operador: NÃO — sem TTY,
nenhuma caixa pôde ser marcada`. **Zero verde inventado com zero amostra.** É o
teste mais duro que um kit desses pode passar, e ele passou sozinho.

**Veredito: solte o kit numa sessão com o dono.** Ele não mente mais nos casos
que eu sabia atacar.

**Três coisas que continuam sem caixa — leve a folha sabendo delas:**

1. **I3 continua sem evidência própria.** Aparece só como `crit` do bloco de soak
   (`:259`), sem sonda de distância olho↔geometria. E agora eu **medi** I3 e ele
   está vermelho em 0,0092 m: o kit vai imprimir "I3" numa linha de soak sem ter
   olhado para o número que reprova.
2. **Quatro caixas (15, 16, 17 e o soak) dependem de o humano conseguir entrar
   numa partida de BR**, e o kit continua só *pedindo* isso (`:225`, `:232‑235`),
   sem pôr o jogo em BR nem oferecer fallback.
3. **A caixa 3 continua aprovando com C2 vermelho.** `:120‑125` lista
   `crit: ['I1#3','C2','C1']` e pergunta "se o corpo do jogo veio junto",
   aprovando com *"o mundo se move na medida do seu passo e a arma continua no
   lugar em relação a você"* — as duas cláusulas são satisfeitas por rastreamento
   puro, com o colisor 9,22 m atrás.

**Uma que melhorou:** a caixa 4 ("a parede te para?") tinha resposta honesta NÃO
na rodada passada. Hoje o colisor para (0,78 m de 10 m pedidos) e a tela apaga
com **2 cm** de penetração. A resposta honesta virou "sim, e apagando a tela" —
o que o dono vai achar estranho, mas não é mais um "não".

---

## 5. A caça ao teste que passa por acidente — achei a OITAVA, e é um arquivo inteiro

### 5.1 · `test/xr-radial.test.js` — 11 de 12 verdes com o disco FORA da cena

**Mutação:** `js/xr/xrinteract.js`, `scene.add(radial)` comentado. O disco é
criado, posicionado, pintado — e **nunca entra na cena**. É a mesma coisa que
não existir para o compositor.

**Resultado: `tests 12 · pass 11 · fail 1`.**

Passam, com o disco invisível:

```
ok  abrir o gatilho ACENDE um objeto de MUNDO, e soltar apaga (D4)
ok  o disco NASCE na direção da MÃO que abriu, e não na frente do rosto
ok  NÃO segue o pulso: mexer a mão com o menu aberto não arrasta o disco
ok  NÃO segue a cabeça: girar o pescoço 40° não move o disco
ok  a FATIA escolhida é a destacada — medido nos pixels da textura
ok  SOLTAR NO CENTRO CANCELA, e o centro se acende para dizer isso
ok  o texto tem altura ANGULAR de leitura
ok  nada entra no olho: com a mão no rosto o disco para em 0,15 m (I3)
ok  sair do VR limpa o disco da cena  ← passa porque ele NUNCA esteve nela
```

O único vermelho é *"custa no máximo 1 draw call por olho"* — e ele cai pelo
lado errado, pelo instrumento que já sabíamos quebrado (§0).

**A causa é a mesma família de sempre, num objeto novo.** Todos os casos leem
`radial.position`, `radial.visible` e os pixels do canvas — **propriedades de um
objeto órfão**. O cabeçalho do arquivo diz, literal: *"dentro de uma sessão
`immersive-vr` sem `dom-overlay` o DOM não chega ao compositor, então qualquer
`<div>` continuaria correta e continuaria invisível"*. O arquivo reproduziu esse
defeito exato trocando a `<div>` por um `Sprite`.

**E não é hipotético: o jogo entregue está nesse estado desde a segunda sessão**
(§2.6), e o arquivo está verde.

**O que conserta:** um caso que confirme que o objeto está no grafo que é
renderizado — `scene.traverse` procurando o objeto, ou `radial.parent`. Duas
linhas. E não usar `estado().radial.visivel` como prova de nada: ele reporta a
intenção.

### 5.2 · `test/xr-alcance.test.js` — o caso principal não pode reprovar o defeito que ele nomeia

O caso se chama **"NÃO SE ABRE BAÚ ATRAVÉS DA PAREDE, com separação de verdade no
ar"** e o comentário diz: *"Este é o caso que fica VERMELHO no dia em que alguém
'consertar' o D2 trocando a régua pela cabeça sem desconto."*

Fiz exatamente isso.

| mutação em `js/interact.js` | o caso |
|---|---|
| desconto arrancado (`const f = 0`) — a régua vira a cabeça crua | **VERDE** |
| desconto arrancado **e** teto solto (`TETO_FORA = 99`) | **VERMELHO** |

Com 2,610 m de separação e o baú a 3,705 m do corpo, o **teto de 0,35 m** segura
sozinho: a régua avança 0,35 m e o baú continua a 3,355 m, fora dos 2,4 m. **O
caso mede o teto, não o desconto** — e a afirmação escrita nele está errada.

**Não é um arquivo inútil:** os casos unitários da régua pegam a mutação
(*"o que o mundo RECUSOU não vira alcance"* devolveu `0,60 m de cabeça, 0,60 m
recusado, e a régua andou 0.3500 m`, e *"o baú a 2,55 m continua fora de
alcance"* também caiu). É o caso de integração — o que carrega o nome do defeito
— que não pode falhar por ele.

### 5.3 · `test/xr-mira.test.js` — melhorou, e três casos continuam sem poder falhar

**Reapliquei a mutação de 6°** do laudo anterior (`js/xr/xrweapon.js:195`, eixo
óptico girado 6° em relação às miras físicas do modelo — ~105 cm de erro a 10 m).

| arquivo | rodada 11 | **agora** |
|---|---|---|
| `test/xr-mira.test.js` | 3 pass · 0 fail (**não podia falhar**) | **3 pass · 3 fail** |
| `test/xr-weapon.test.js` (caso reescrito) | verde | **vermelho** |

**A âncora no cano funciona, e o número do construtor está certo:** o caso da
bazuca acusou **6,0000°** nos três tiros, e os casos "projétil do BR" e "paralelo
ao cano" caíram junto. `test/xr-weapon.test.js` foi de 16 para 13/3, com o caso
reescrito e o caso pré-existente da massa de mira vermelhos.

**Mas os três casos que eu apontei continuam lá, e continuam incapazes:** casos 1
("o raio disparado passa pelo ponto que a alça indica"), 2 ("a origem está SOBRE
a linha de mira") e 6 ("o alinhamento se mantém em qualquer direção") ficaram
**verdes** com 6° de erro. A álgebra é a mesma de antes: `_rayDir.copy(_miraDirDoTiro)`
e `_rayOrig` avançado AO LONGO de `_rayDir` — reta comparada consigo mesma.

E o comentário que o laudo anterior chamou de invertido **continua no arquivo,
palavra por palavra**: *"Quem mata aquele mutante é o caso 1, que cobra erro
~zero em CINCO distâncias ao mesmo tempo — e nenhuma zeragem consegue isso, por
construção."* O caso 1 **não mata mutante nenhum de eixo óptico**. Ele mata
mutante de **zeragem** (aí sim `_rayDir` deixa de ser a linha de mira) — a frase
está certa para a zeragem e errada como escrita. Corrigir o texto é grátis.

O mesmo vale para o `perp` do caso reescrito de `xr-weapon`: ele continua
tautológico; quem salva o caso é o `graus` novo, ao lado.

### 5.4 · Suspeitos não provados, que valem uma olhada

- **`xr-parede`, a fiação instalada pelo teste** — continua lá
  (`if (doJogo === 0) intrusaoOrig(dt, sep)`), com `fiacaoDoJogo` indo para o
  `console.log` e nunca para um assert. Hoje a linha do jogo **existe**
  (`game.js:3582`), então o caso está medindo o produto; mas o escape continua
  armado para o dia em que a linha sumir.
- **`xr-mira`, o laço só visita `min(destravadas, 4)`** — e a FACA nunca é
  visitada, porque nasce trancada e `switchWeapon` recusa arma trancada. Duas
  consequências: B3 da faca nunca é medido, e o caso "paralelo ao cano" nunca
  bate no 10,0859° que eu medi nela (o que seria um vermelho falso).
- **`xr-mira`, o guarda `saiu`** — inalterado: `origemDoTiro() !== antes ||
  O.lengthSq() > 0` fica sempre verdadeiro depois do primeiro tiro da sessão.
- **`test/xr-input.test.js:361`, "o analógico do GIRO nem é tocado pelo radial"**
  — não é falso, e o autor **escreveu** que o giro que vale mora noutro módulo.
  Mas o arquivo prova uma saída (`cmd.girar`) que `grep` mostra que **o jogo
  nunca lê**. É teste de código morto, honestamente rotulado.

---

## 6. Defeitos NOVOS, com medição — e quantos nasceram de uma correção

O termômetro: 5 → 3 → 2 → 1 → 4 → **4**.

| # | defeito | medido | nasceu de? |
|---|---|---|:--:|
| 1 | **A origem balística da BAZUCA foi de 0,0000 m para 0,9087 m do cano**, e o foguete passa a detonar antes do tubo | 42 de dano em si mesmo em três cenários onde antes era 0 | **da correção da mira** |
| 2 | **O disco do radial nunca mais entra na cena a partir da 2ª sessão** (`montarRadial` sai cedo, `exit()` já o removeu) | `parent` nulo e ausente de `scene.traverse`, 2ª sessão | **da funcionalidade nova** |
| 3 | **`estado().radial.visivel` e `estado().marcadorVisivel` reportam `true` com o objeto fora da cena** | medido nas duas sessões | **da funcionalidade nova** (metade) e pré-existente (marcador) |
| 4 | **Girar com o radial aberto tira o menu do campo de visão** — o gate existe no módulo e o jogo não usa a saída dele | rig girou 65,90°, disco a 101,05° do eixo da vista | **tornado visível** pela funcionalidade nova; causa pré-existente |

**Três desses quatro nasceram de correção desta rodada.**

E, fora dessa contagem, **dois testes falsos novos** (§5): `xr-radial` inteiro,
que não vê o disco fora da cena, e o caso principal de `xr-alcance`, que não pode
reprovar o defeito que carrega no nome.

**Dois achados que NÃO são novos, e é importante dizer:** o braço a 40 cm da
empunhadura (§3.B) e a geometria do corpo a 9 mm do olho (§2.3) **já existiam** —
esta é a primeira rodada em que alguém mediu. Entram como vermelho porque C5 e I3
os cobram, não como defeito plantado.

**O que melhorou de verdade, e merece a mesma clareza:**

1. **A mira fechou.** Oito rodadas depois, B3 está verde nos três caminhos, com
   0,0000 m em 8 armas × 6 distâncias, e sem regressão no monitor — que eu medi,
   não deduzi. É a melhor correção deste porte inteiro.
2. **A perna dobra.** Joelho de 169,1° para 33,7°, pé no chão, ombro abaixo do
   olho até 1,10 m de cabeça. E o teste que a guarda **reprova de verdade**:
   6 de 8 vermelho com a mutação.
3. **A régua de alcance está certa**, e aguentou um ataque com 9,2 m de
   separação — 3,5× o que o construtor testou.
4. **`Box3` em pose animada foi varrido e fechado**: zero ocorrências restantes
   na classe defeituosa.
5. **O kit de sessão parou de mentir** nos dois furos que eu apontei, e provou
   isso rodando em branco sem imprimir um verde.

---

## 7. Os três mais longe do aceite

1. **B5 · segunda mão** — não existe conceito de segunda mão no jogo. **Oitava
   rodada, trabalho nunca começado.** É sistema, não ajuste, e o grip esquerdo
   (o botão natural do apoio) já foi dado ao agarre. Fazer B5 exige decidir esse
   conflito antes de codar.
2. **I1 · vinte minutos, vinte caixas** — **zero caixas em oito rodadas.** O kit
   agora está pronto (§4) e rodou em branco sem mentir. **A partir desta rodada
   o que falta não é ferramenta: é o dono pôr o aparelho.**
3. **C5 · corpo em primeira pessoa** — melhorou muito e continua o único vermelho
   cuja correção não cabe num arquivo. Faltam duas coisas independentes: a
   geometria que entra no olho (0,0092–0,0829 m contra teto de 0,15) e o braço
   que não alcança a arma (0,39–0,45 m contra 0,0000 no monitor). O braço é uma
   linha por lado; a geometria no olho é decisão de projeto (encolher a gola,
   esconder a malha por proximidade, ou assumir o caminho da Valve e não
   desenhar corpo).

---

## 8. O que o dono reclama primeiro

**Os braços que não seguram a arma.** Ele levanta o fuzil, olha para as próprias
mãos — e elas estão **40 cm** longe da empunhadura, em toda pose que eu testei,
em todas as armas. É a primeira coisa que se olha em VR, é o item 7 do roteiro
I1 (*"Levanto a arma. Ela está na minha mão, no ângulo da minha mão?"*), e no
monitor o mesmo código acerta em cheio (0,0000 m). Ele não vai chamar isso de
"escala de raiz"; vai dizer que o boneco está quebrado.

**Em segundo, na mesma pose: alguma coisa encostada no olho.** Com o braço
levantado há malha do corpo a **9,2 mm** do olho. Isso não é "quase no plano
near", é dentro dele: o jogador vê o interior da própria gola ou do próprio
braço atravessar a vista.

**Em terceiro, e é o que vai parecer bug de verdade: a bazuca explodindo na
cara.** Ele vai encostar o tubo numa quina — em VR isso é reflexo, porque a arma
não colide com nada — e vai levar **42 de dano** por atirar. Três vezes, no mesmo
lugar, com a mesma pose. Antes desta rodada, zero.

**E, se ele sair do VR e voltar** (para ajeitar a correia, para mexer no PC, para
qualquer coisa): **o menu radial e o destaque dos baús somem para o resto da
sessão.** Ele vai apertar o gatilho e não ver nada, e vai chegar perto de um baú
e não ver o marcador. É o defeito mais fácil de reproduzir deste laudo e o mais
difícil de diagnosticar de dentro do headset.

O que ele **não** vai reclamar, e merece ser dito: **a mira.** Se ele pegar o
headset e atirar, no solo ou no BR, a bala vai onde a alça aponta — em toda arma,
em toda distância. Isso estava errado nas oito rodadas anteriores.

---

## 9. Quanto falta para "ausência de defeito"

Pela regra do §0 da régua — um vermelho reprova a entrega inteira — **a rodada
está devolvida**, com 9 vermelhos.

O saldo honesto: **25 verdes de 39, 9 vermelhos, 5 medições não feitas** (B5, C4,
D6, G2, I4), mais **8 critérios que só o aparelho ou um humano fecham** (E1, E3,
E4, E5, F1, G4, G5, I1).

Traduzindo em distância, com o tamanho de cada coisa:

**Uma linha cada (faça estes primeiro — três deles são vermelhos inteiros):**
- **`armLen * escala`** antes de entrar em `dobrar2Ossos`, como a perna já faz.
  Fecha metade de C5 e o que o dono vê primeiro;
- **o `avanco` longitudinal no ramo do foguete**, o mesmo que o hitscan já
  calcula. Fecha a regressão da bazuca e devolve B7 da bazuca a ~0,132 m;
- **`montarRadial()` e `montar()` olhando para o pai, não para a existência**
  (`if (radial && radial.parent) return;`). Fecha D4 e devolve H1;
- **um teto para `fora`**, que hoje cresce sem limite (medi 9,20 m).

**Pequeno (um arquivo, meia tarde):**
- **os dois testes falsos** — `xr-radial` precisa de um caso que confirme o
  objeto no grafo renderizado, e o caso principal de `xr-alcance` precisa medir o
  desconto sem o teto no caminho. **Este é o item que eu poria antes de tudo**,
  porque enquanto eles estiverem verdes ninguém sabe o que mais está quebrado;
- **o comentário invertido de `xr-mira`** e os três casos que não podem falhar;
- **a faca**, que precisa de registro separado de mira e tiro para ser medível;
- **os dois comentários errados de `Box3`**: `js/skeletons.js:320‑323` afirma um
  mecanismo falso em r185, e `js/fpbody.js:124` envenena o cache do boneco sem
  uma linha dizendo isso. Custo: dois parágrafos, e evitam a próxima rodada de
  medição enganada.

**Médio (uma decisão + código):**
- **A6** — as duas causas estão paradas há quatro rodadas:
  `city-destruction-client.js` precisa de gate de `presenting`, e os dois
  `camera.getWorldDirection` de `br-game.js` precisam da mesma fonte única que
  já consertou o irmão deles;
- **H2** — mapa e pulso precisam sair de 0,378/0,396 m;
- **E2** — 198,5 calls e 573,2 k triângulos por olho no castelo, contra 180 e
  500 k. Ficou plano nesta rodada;
- **a exceção declarada em código para a troca A6-sobre-C2**, quinta rodada
  pedindo.

**Grande (sistema):**
- **C5** na parte da geometria no olho, **B5** (a segunda mão), **C2** de
  verdade, e a **trava de distância de baú no servidor** (§3.D), que carrega
  junto a extração de worldgen puro que o Tier 1 de anti-cheat já precisava.

**Fora do escopo de VR, e barato de conferir:** o `three` em `devDependencies`
com `npm ci --omit=dev` no Dockerfile (§3.D-bis). Um `docker exec` e um `grep` no
log fecham.

**Só o dono fecha:** as 20 caixas de I1, a legibilidade de G4, a captura de G5 e
os quatro números do aparelho. **O kit está pronto — o que falta é a sessão.**

---

---

## 10. Onde eu acho que você errou — com todas as letras

Foi pedido. Vai sem rodeio, e na ordem em que pesa.

1. **A bazuca.** Você moveu a origem do foguete para a linha de mira e **não
   aplicou o avanço longitudinal** que o hitscan, três blocos acima, já calcula.
   O resultado é 0,91 m entre a origem e o cano, e 42 de dano em si mesmo numa
   pose que em VR é instintiva. O comentário do `game.js` que diz *"a colisão
   parte do muzzle"* virou mentira no mesmo commit, e continua no arquivo. Isso
   não era caso de julgamento: era a mesma linha, do lado.
2. **`test/xr-radial.test.js`.** Você escreveu doze casos para provar que existe
   affordance DENTRO DO MUNDO, e onze deles ficam verdes com o objeto **fora da
   cena**. O cabeçalho do arquivo nomeia esse defeito com precisão — *"qualquer
   `<div>` continuaria correta e continuaria invisível"* — e o arquivo o
   reencena com um `Sprite`. É a oitava ocorrência, e a terceira seguida em que
   o guarda novo pergunta *"o objeto diz que está visível?"* em vez de *"o
   objeto está no grafo que é desenhado?"*.
3. **O comentário do caso principal de `test/xr-alcance.test.js`.** Ele afirma
   ser o caso que fica vermelho quando alguém trocar a régua pela cabeça sem
   desconto. Eu fiz exatamente isso e ele ficou **verde** — quem segura o
   cenário é o teto de 0,35 m, não o desconto. Afirmação escrita e não testada.
4. **`test/xr-mira.test.js`.** Você consertou o arquivo pelo lado certo (o cano
   é a âncora, e ela funciona: 6,0000° com o mutante), mas **deixou os três
   casos que não podem falhar exatamente onde estavam**, e deixou no arquivo,
   palavra por palavra, o comentário que o laudo anterior já apontou como
   invertido (*"quem mata aquele mutante é o caso 1"*). Um caso que não pode
   falhar não é neutro: ele conta como cobertura na hora de decidir se algo está
   guardado.
5. **A explicação do `Box3` no commit.** *"Devolve a caixa da primeira pose e
   depois só translada pela raiz"* — o efeito está certo, o porquê não.
   `computeBoundingBox` do `SkinnedMesh` **é** ciente da pose; o defeito é cache
   congelado. Você acertou o conserto por instinto e errou o texto, e o texto é
   o que a próxima pessoa vai ler. Pior: `js/skeletons.js:320‑323` já carregava
   a versão errada e agora **contradiz** o comentário certo que você escreveu em
   `test/xr-agachar-perna.test.js`.
6. **O `armLen`.** Você mediu o defeito, escreveu que existe, e não mexeu por
   causa das três frentes de arma. Eu entendo o cuidado — mas o estado atual
   **já está errado**, e errado em 40 cm, na primeira coisa que o dono olha. Não
   mexer não era o estado neutro; era escolher o defeito.

**E três coisas em que você acertou e eu quero registrar com o mesmo peso:** o
`canoDoTiro()` congelado no instante do tiro (a decisão certa, e o motivo que
você deu — o recuo — é real); a régua de alcance, que aguentou um ataque 3,5×
maior que o seu e cujo raciocínio da identidade `cabeça = pos + passo + fora`
está correto ponto por ponto; e ter medido e publicado o próprio defeito do
`armLen` e do topo-da-caixa-é-o-dedo em vez de escondê-los. As três rodadas
anteriores mostraram que isso não é o padrão da indústria — é o que faz esta
frente andar.

---

E uma frase para fechar, porque o padrão desta rodada é novo. **Pela primeira vez
em oito rodadas, a correção grande fechou o critério que se propôs a fechar.** B3
está verde, medido nos três caminhos e nas oito armas, sem regressão no monitor.
D2 aguentou um ataque três vezes maior que o do construtor. A perna dobra e o
teste dela reprova de verdade.

O que continua igual é o outro lado, e ele está mais concentrado do que nunca:
**a funcionalidade nova desta rodada — o disco — está invisível a partir da
segunda sessão, e o arquivo de teste escrito para guardá-la fica 11 de 12 verde
com o disco fora da cena.** Oitava ocorrência, e a terceira seguida em que o
guarda novo mede a intenção do módulo em vez do que chega ao compositor.
Enquanto a pergunta do teste for *"o objeto diz que está visível?"* em vez de
*"o objeto está no grafo que é desenhado?"*, cada rodada verde vai continuar
tendo algo atrás.
