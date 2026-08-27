# O corpo em primeira pessoa dentro do headset — fontes e decisões

Companheiro de `docs/vr/referencia-locomocao.md`, escrito na rodada 10 para
fechar as duas queixas do dono do projeto que são a mesma geometria vista de
dois ângulos:

> "O BONECO PARECE ÀS VEZES ENTERRADO NO CHÃO"
> "O CORPO ONDE SEGURA A ARMA PARECE DESLOCADO DO CENTRO"

Tudo aqui tem fonte ou número medido. Onde não há, está escrito **não
encontrado**.

---

## 1. O que foi medido antes de mexer (sessão imersiva IWER, corpo lido OSSO A OSSO)

Headset a 1,70 m, modelo do `js/fpbody.js` (altura fixa de 2,10 m com o olho a
1,90 m), amostra tirada **depois** do rig ser posto no lugar do frame
(`rig.matrixWorld × cameras[0].matrix`):

| situação | ombro em relação ao olho | topo do boneco acima do olho | pés |
|---|--:|--:|--:|
| em pé, 1,70 m | **−0,349 m** ✔ | 0,179 m (é o alto da cabeça) | 0,0035 m acima do chão ✔ |
| agachado, 1,15 m | **+0,185 m** ✘ | **0,709 m** ✘ | −0,0165 m |
| depois de um pico de rastreio de 2,05 m por 0,4 s | +0,190 m ✘ | **1,096 m** ✘ | −0,0165 m |

E o pico deixava rastro: `alturaDePe` travava em 2,05 m, o boneco ficava **21 %
maior** (escala 1,0787) e o jogador **de pé** passava o resto da sessão com
`agachado: true` e `crouchT: 1` — colisor menor e velocidade de agachado.

Traduzindo: baixar a cabeça punha a vista do jogador saindo do meio do **tórax**
do boneco. É o "deslocado do centro", e é também o "enterrado" — quem está com
o próprio peito na altura dos olhos vê o corpo subindo por cima da vista.

---

## 2. As fontes

### 2.1 O jogo mais aclamado do gênero não tem corpo

**Half-Life: Alyx** mostra só as mãos. O argumento da Valve, citado no §C5 do
critério: *"sabemos onde estão suas mãos e sua cabeça, mas há uma variação
enorme entre humanos nos comprimentos e movimentos entre esses pontos… se você
errar, salta enormemente aos olhos."*
[PC Gamer, os dois lados](https://www.pcgamer.com/keep-alyx-armless/)

**Consequência para este jogo:** corpo em 1ª pessoa é opcional por decisão —
mas corpo **errado** não é aceito por nenhum critério. Como aqui o corpo já
existe (e serve ao multijogador, porque é o que o jogador vê de si), a saída é
consertar a âncora, não remover o corpo.

### 2.2 Quando há corpo, o padrão é VRIK — e ele nomeia este trade-off

O `VRIK` do Final IK foi criado para *Dead and Buried*, da Oculus Studios, e é
a referência de fato. Dois campos importam aqui:

| campo | default | o que faz |
|---|--:|---|
| `maxRootAngle` | **25°** | o quadril só acompanha a cabeça depois dessa folga de pescoço |
| `minHeadHeight` | — | "minimum height of the head from the root of the character" |
| `plantFeet` | — | prende os pés no chão — **e o próprio manual avisa que isso "can cause the camera to exit the head"** |

[Final IK / VRIK](http://www.root-motion.com/finalikdox/html/page16.html)

Essa última linha é exatamente o defeito medido no §1: a versão anterior deste
módulo dava prioridade aos PÉS (`Math.max(alturaCabeca, olho − AFUNDA_MAX)`) e
a câmera saía da cabeça do boneco.

### 2.3 O headset não fica no centro da cabeça

Patches de **Population: ONE**: *"Set height at center of head instead of
headset"* (10/12/2020) e *"Camera: Eye position is now lower & better matches
eye height on characters"* (06/12/2023).
[wiki](https://population-one-vr.fandom.com/wiki/Settings)

São os dois defeitos que este corpo tinha: âncora na pose do visor (peito
empurrado para dentro do campo de visão) e altura do olho do modelo maior que a
do jogador (boneco grande demais).

### 2.4 Altura é entrada de gameplay, e calibrar é normal

- **Onward**: *"The game wants to know your height so it can determine if
  you're crouching, standing or prone in real life"*.
  [guia](https://www.uploadvr.com/onward-guide-tips-strategies/)
- **Contractors**: *"a tight body calibration mechanism to make sure player
  dont look strange in multiplayer games"*.
  [fórum oficial](https://steamcommunity.com/app/963930/discussions/0/2806204039996788436/)
- **Pavlov** não travou, e o guia competitivo diz o quiet part out loud:
  *"make yourself as short as possible without losing the ability to run"*.
- **WebXR** garante y = 0 no chão em `local-floor`, mas o valor "MUST be
  estimated" e "rounded to the nearest 1cm is suggested" quando o piso não é
  conhecido — ou seja, **altura de chão em WebXR tem erro embutido por
  desenho**. [W3C WebXR Device API](https://www.w3.org/TR/webxr/)

Nenhuma das fontes usa "a maior leitura que já vi" como altura em pé. Todas
calibram — uma vez, ou continuamente com um mecanismo declarado.

---

## 3. O que ficou decidido aqui

### 3.1 A cabeça manda; os pés se viram (`js/xr/xrbody.js`)

A origem do corpo é **a altura da cabeça do jogador**, com um piso que é
exatamente até onde a perna do modelo dobra (`js/fpbody.js`, §4):

```
piso     = olho − pernaDobra × escala − AFUNDA_MAX
corpo.y  = max(alturaCabeca, piso)
encurtar = olho − corpo.y            → escrito em bodyRoot.userData
```

**O pé fica no chão POR CONSTRUÇÃO:** ele mora `olho − encurtar` abaixo da
origem, e a origem está `olho − encurtar` acima do piso. Enquanto a perna dá
conta, o corpo desce com a cabeça; quem agacha mais fundo do que um joelho
humano dobra vê o corpo **parar de descer** alguns centímetros — e não vê o
próprio pé furar o chão.

Medido depois da mudança, agachado a 1,15 m: ombro **−0,121 m** (abaixo do
olho) e topo do boneco **+0,183 m** — era +0,190 m e +0,709 m. Números
completos no §4.6.

### 3.2 A altura "em pé" exige SUSTENTAÇÃO, não é o máximo histórico

`alturaDePe` só sobe quando a leitura alta se mantém por **0,75 s** (o
candidato guarda o *menor* valor da janela, então um pico dentro dela não puxa
a referência junto). Um pico de 0,4 s deixa de travar a referência; levantar de
verdade continua recalibrando.

Limite conhecido e declarado: a referência **não desce sozinha**. Quem ficar
com o headset erguido por mais de 0,75 s calibra alto e precisa do
**RECENTRAR** do painel para desfazer — `calibrar()` já existe no módulo e a
linha que o liga ao recentrar está no relatório da rodada. Descer sozinha seria
pior: o jogador que joga agachado atrás de cobertura veria o próprio boneco
encolher.

### 3.3 O que continua valendo das rodadas anteriores

- corpo pendurado no **rig**, não na câmera (a câmera é a cabeça; só a cabeça
  herda a pose dela);
- boneco **dimensionado pelo jogador** (`escala = alturaDePe / olhoModelo`),
  travada em [0,70 · 1,15];
- **folga de pescoço de 25°** antes de o quadril virar (VRIK `maxRootAngle`);
- **recuo** da âncora para o centro da cabeça, e mais um tanto ao agachar
  (VRIK `moveBodyBackWhenCrouching`);
- agachar físico vira a **mesma tecla** que o teclado escreveria.

---

## 4. A PERNA QUE ENCURTA — o que destravou o C5

O §3.1 acima descrevia um empate: a cabeça mandava até certo ponto e o pé
furava o piso no agachamento fundo. A causa raiz não estava em
`js/xr/xrbody.js` e sim no rig: **`js/fpbody.js` não encurtava a perna.**

### 4.1 O que estava errado, medido

| medida (sessão IWER, headset 1,70 m) | antes |
|---|--:|
| osso do pé, com `crouchT` de 0 a 1 e a **cabeça parada** | **0,0559 m** |
| comprimento efetivo da perna (quadril→pé), no mesmo teste | **0,0884 m** de 0,58 m |
| ângulo do joelho no mesmo teste | 169,1° → **112°** (dobrava!) |

O joelho dobrava 57° e não adiantava nada: a bacia girava 40° no sentido
contrário e devolvia o pé ao mesmo lugar. Por isso ancorar na cabeça
enterrava o pé exatamente o tanto do agachamento, e ancorar no pé punha o
peito do boneco na altura do olho. **Um cobertor curto: os dois defeitos
eram a MESMA perna rígida.**

### 4.2 Por que IK analítico de 2 ossos, e não o `CCDIKSolver` do three

O `CCDIKSolver` existe nos addons (`three/addons/animation/CCDIKSolver.js`,
three 0.185.1). Lendo a fonte — que é o documento primário:

- *"This class solves the Inverse Kinematics Problem with a CCD Algorithm"*;
- *"`CCDIKSolver` is designed to work with instances of `SkinnedMesh`"*;
- no laço de solução: `const effector = bones[ ik.effector ]; const target =
  bones[ ik.target ];` — **o alvo tem de ser um OSSO do próprio esqueleto**,
  indexado em `mesh.skeleton.bones`;
- `const iteration = ik.iteration !== undefined ? ik.iteration : 1;`

Duas consequências decidem a escolha:

1. **O alvo do pé aqui é um PONTO do mundo, não um osso.** Usar o
   `CCDIKSolver` exigiria acrescentar ossos-alvo ao rig — e todo `Object3D`
   novo consome 4 números do `Math.random` seedado no UUID, o que desloca o
   worldgen de todos os jogadores (invariante do `CLAUDE.md`, com
   `test/carregamento-determinismo.test.js` de rede).
2. **CCD é aproximação iterativa.** A Wikipédia separa as duas famílias:
   *"An analytic solution to an inverse kinematics problem is a closed-form
   expression that takes the end-effector pose as input and gives joint
   positions as output"*, enquanto os heurísticos *"perform simple, iterative
   operations to gradually lead to an approximation of the solution"* e *"The
   most popular heuristic algorithms are cyclic coordinate descent (CCD) and
   forward and backward reaching inverse kinematics (FABRIK)"*.
   [Inverse kinematics](https://en.wikipedia.org/wiki/Inverse_kinematics)

   **Ressalva honesta, porque a fonte não diz o que seria cômodo dizer:** a
   Wikipédia NÃO compara CCD com analítico. O *"can be significantly faster
   than numerical solvers"* dela é contra métodos numéricos (jacobianos), que
   ela distingue dos heurísticos; e diz que os heurísticos também têm *"low
   computational cost"*. A palavra "determinístico" não aparece no artigo. O
   que dá para sustentar é a diferença de **exatidão**: forma fechada resolve
   exato numa passada; CCD converge para uma aproximação. **A escolha por
   forma fechada aqui é síntese deste documento**, apoiada nessa distinção e
   no item 1, que sozinho já bastaria.

A fórmula é a lei dos cossenos para membro de dois ossos, derivada em
[Alan Zucconi, *Inverse Kinematics for 2-bone limbs*](https://www.alanzucconi.com/2018/05/02/ik-2/).
Essa página **só** deriva a fórmula — não fala de CCD nem de determinismo, e
não está sendo citada para isso.

### 4.3 O teto é anatômico, não arbitrário

`pernaDobra` é quanto a perna encurta até o joelho chegar no limite humano.
A Wikipédia dá a amplitude do joelho como **"Flexion 120–150°"**
([Knee](https://en.wikipedia.org/wiki/Knee)), com a ressalva de que *"The
total range of motion is dependent on several parameters such as soft-tissue
restraints, active insufficiency, and hamstring tightness."* Adotado o topo
da faixa, 150° de flexão = **30° de ângulo interno** entre coxa e canela.

Medido neste rig: coxa 0,4278 m, canela 0,3782 m, perna em repouso 0,8024 m
→ **`pernaDobra` = 0,5884 m** (na escala da raiz; em VR multiplica pela
escala do avatar). Quem agacha mais fundo do que isso não vê o pé furar o
chão: vê o corpo **parar de descer** os últimos centímetros.

### 4.4 O quadril vai para trás — e por que isso NÃO é enfeite

Na pose de descanso deste rig o tornozelo nasce **0,107 m ATRÁS do quadril**.
Com o quadril preso debaixo da cabeça e o pé atrás dele, **não existe solução
de IK com o joelho para a frente E para cima**: a direção perpendicular mais
"para cima" que existe aponta para trás. Medido, com esse deslocamento em
zero: **joelho a 0,047 m do chão, 0,084 m ABAIXO do próprio tornozelo**, e a
malha da perna 0,373 m enterrada — com o tornozelo certinho no lugar.

A saída é a mesma que o VRIK nomeia por `moveBodyBackWhenCrouching`, vista do
outro lado do osso: como aqui quem está preso é o quadril, quem anda é o pé,
para a frente (`TUNE.footFwd = 0,22 m` no agachamento cheio). Depois disso o
joelho fica a 0,327 m do chão, **0,196 m acima do tornozelo** — que é um
agachamento.

### 4.5 Dois defeitos de INSTRUMENTO achados no caminho

Estes valem para qualquer teste desta base que meça o boneco:

- **`Box3.setFromObject` num `SkinnedMesh` devolve a caixa da PRIMEIRA pose.**
  O three calcula a caixa deformada uma vez e guarda em `mesh.boundingBox`; a
  própria doc do método avisa: *"If the skinned mesh is animated, the bounding
  box should be recomputed per frame in order to reflect the current animation
  state"* (`SkinnedMesh.computeBoundingBox`, three 0.185.1). Sem recalcular,
  "o pé do boneco" era a pose de bind **arrastada pela raiz** — a medida
  seguia a RAIZ, não o PÉ. Com a perna rígida dava no mesmo número; com a
  perna que dobra, não. `test/xr-body.test.js` e `test/xr-corpo-ancora.test.js`
  mediam assim.
- **Em VR o topo da caixa é o DEDO, não a cabeça.** Os controles emulados não
  descem junto com o agachamento; os braços do boneco sobem atrás deles e o
  topo da caixa vai para **+0,41 m acima do olho** enquanto a cabeça do boneco
  está a −0,111 m. "Topo do boneco" passa a sair da raiz + `eyeDrop`, que é a
  régua do número 0,709 m publicado no laudo anterior.

### 4.6 O resultado, com número

Sessão IWER, headset 1,70 m → 1,15 m (queda de 0,55 m):

| medida | antes | depois |
|---|--:|--:|
| ombro direito vs olho, agachado | **+0,1905 m** (acima) | **−0,1212 m** (abaixo) |
| ombro esquerdo vs olho, agachado | +0,3078 m | −0,0991 m |
| topo da cabeça do boneco vs olho, agachado | **+0,7089 m** | **+0,1826 m** |
| pé vs chão, agachado | −0,0165 m | −0,0165 m |
| pé vs chão, em pé | +0,0035 m | +0,0035 m |
| ombro direito vs olho, em pé | −0,3510 m | −0,3510 m |
| osso do pé com `crouchT` 0→1 (no espaço da raiz) | **0,0000 m** | **0,5800 m** |
| perna (quadril→pé) no mesmo teste | 0,0884 m | **0,5579 m** |
| ângulo do joelho no mesmo teste | 169,1° → 112° | 169,1° → **34,6°** |

O −0,0165 m do pé agachado é a tolerância declarada `AFUNDA_MAX` (0,02 m), e
é ela que compra os últimos centímetros de acompanhamento da cabeça: o erro
de âncora no agachamento de 0,60 m fica em **0,038 m**, dentro dos 0,05 m que
o critério C5 pede.

### 4.7 A capa

A capa vai até o tornozelo (bainha a 0,089 m do chão em pé) e pendura no
peito. Com o corpo passando a DESCER de verdade, a bainha ia **0,373 m para
dentro do chão** — pé no lugar certo e casaco atravessando o piso. São 3
tiras de 4 ossos; o ângulo entra por **raiz quadrada** da dobra porque a
bainha sobe com o cosseno (quadrático perto de zero) enquanto o corpo desce
linear — proporcional deixava 0,045 m de bainha enterrada no meio do
movimento.

### 4.8 O que continua SEM fonte

- **Diretriz da Meta sobre altura de olho / escala de avatar:** *não
  encontrado nesta rodada.* A URL de melhores práticas de design devolveu 404
  e o orçamento de busca da sessão estava esgotado. A decisão de escalar o
  AVATAR (e não o mundo) continua apoiada só no patch de Population: ONE
  citado no §2.3.
- **Como Boneworks/Bonelab, Into the Radius, Blade & Sorcery e Ghosts of
  Tabor tratam agachamento físico com corpo completo:** *não encontrado nesta
  rodada.* Nenhuma decisão deste documento depende disso; serve para
  comparar, e fica em aberto.
- **A citação da spec WebXR sobre `local-floor`** no §2.4 é herdada da rodada
  anterior e **não foi re-verificada** aqui (a página veio truncada).

---

## 5. O BRAÇO QUE O IK PEDIA — o mesmo defeito de escala, do outro lado do corpo

Quem consertou a perna (§4) registrou o risco em vez de mexer nele: *"`armLen`
tem o mesmo defeito de escala que eu consertei na perna"*. Esta seção mede a
suspeita, confirma e fecha.

### 5.1 O defeito, medido dentro da sessão

Sessão IWER, headset a 1,70 m, fuzil na mão. Ossos lidos no MUNDO por
`bone.getWorldPosition` num gancho no `FpBody.update`, **depois** do solver do
frame — nunca por `Box3` (armadilha do §4.5).

| medida (escala da raiz do boneco = 0,89455) | antes |
|---|--:|
| braço+antebraço que os ossos vencem no mundo | 0,5881 m |
| braço+antebraço alimentado na lei dos cossenos | **0,6574 m (+11,79 %)** |
| raiz do braço → empunhadura, já com a clavícula estendida | **0,6245 m** |
| mão do boneco → empunhadura (direita) | **0,0639 m** |
| ângulo do cotovelo direito | 145,51° |

A terceira linha é a que não fecha: a raiz do braço parou a **0,6245 m** da
empunhadura e o braço vence **0,5881 m**. Sobram 0,0365 m que nenhuma dobra de
cotovelo resolve — **o alvo estava fora de alcance por construção.**

**O CONTROLE que fecha o diagnóstico.** Mesmo código, mesma arma, no desktop,
com a raiz em escala 1: pedido = real = 0,6574 m e a mão a **0,0000 m** da
empunhadura, nas duas mãos. Não é o IK; é a escala.

### 5.2 Por que a clavícula piora em vez de salvar

`solveArm` estende a clavícula até a raiz do braço ficar a
`alcance × reachBend` do alvo (0,95). Com o alcance FALSO ela mira 0,6245 m e
**para de estender ali** — exatamente fora do alcance verdadeiro. É por isso
que o erro medido (0,0639 m) é maior que o excesso de alcance (0,0365 m): o
solver ainda gasta parte do que resta dobrando o cotovelo com um triângulo
inconsistente. A assinatura é estável e não depende da pose: em duas
empunhaduras diferentes a raiz parou no MESMO 0,6245 m, porque esse número é
`alcance pedido × reachBend` e nada mais.

### 5.3 O conserto, e por que é o mesmo da perna

Uma linha de geometria, não de calibração: `armLen` é medido no carregamento
com a raiz em escala 1, o solver trabalha em METROS DE MUNDO, e em VR a raiz
carrega a escala do avatar (`js/xr/xrbody.js`, §3.3). Então o comprimento entra
no solver multiplicado pela escala DAQUELE frame — que é o que
`resolverPernas` já fazia com a coxa e a canela desde o §4.

### 5.4 O resultado

| medida (headset 1,70 m, escala 0,89455) | antes | depois |
|---|--:|--:|
| comprimento alimentado no solver | 0,6574 m | **0,5881 m** (= o osso) |
| raiz do braço → empunhadura | 0,6245 m | **0,5587 m** (= 0,95 × alcance real) |
| **mão direita → empunhadura** | **0,0639 m** | **0,0000 m** |
| ângulo do cotovelo direito | 145,51° | **143,07°** |
| ombro direito → olho do jogador | 0,3775 m | 0,3989 m |
| âncora da empunhadura no mundo | (0,5100; 4,1577; 3,4118) | (0,5100; 4,1580; 3,4121) |

Duas leituras dessa tabela valem mais que as outras:

- **A ARMA NÃO SE MEXEU.** A âncora da empunhadura está no mesmo ponto do
  mundo, a menos de 0,3 mm (jitter da suavização). Quem andou foi a MÃO DO
  BONECO, até a arma. Era o risco óbvio do conserto — puxar a arma para o
  corpo em vez de levar o corpo até a arma — e não aconteceu.
- **O cotovelo de VR virou o cotovelo do desktop.** 143,07° é exatamente o
  número que o desktop dá na mesma situação (clavícula estendida, mão no limite
  de `reachBend`). A pose de VR passou a ser uma cópia em escala da pose que
  foi calibrada por screenshot — que é a definição de "a escala agora está
  certa".

O conserto não é calibrado para uma altura só: com o headset a 2,05 m
(escala 1,079, do OUTRO lado de 1, onde o defeito antigo pedia um braço mais
CURTO do que existe) o pedido continua batendo com o osso e a mão continua na
empunhadura. Está no `test/xr-braco-alcance.test.js`.

### 5.5 `reachBend` e `clavMax`: um não precisou de nada, o outro foi medido

- **`reachBend` = 0,95 não mudou, e a prova é o cotovelo.** É uma RAZÃO, então
  atravessa uma mudança de escala sem recalibração. O ângulo do cotovelo em VR
  saiu de 145,51° e foi para os 143,07° do desktop: o ângulo estava diferente
  porque o triângulo estava inconsistente, não porque a calibração pedisse
  outro valor.
- **`clavMax` = 0,45 m fica em metros de MUNDO, fora da escala do avatar — e
  isso foi medido, não presumido.** Escalá-la junto com o boneco (0,4025 m em
  VR) não muda NADA no braço direito, que nunca encosta nesse teto, e afasta a
  mão ESQUERDA da âncora em mais 0,048 m: 0,2992 → 0,3472 m numa empunhadura e
  0,4428 → 0,4914 m na outra. O braço esquerdo já é o que não alcança (§5.6);
  encurtar o único recurso que compra alcance só piora o que está no limite.

### 5.6 O que este conserto NÃO resolve: o braço ESQUERDO

Medido, e fica registrado como está: a mão esquerda do boneco continua a
**0,2992 m** da âncora de apoio (0,4428 m na empunhadura mais esticada), o
mesmo número de antes do conserto. A causa é outra e é aritmética simples: a
âncora `supportHand` do fuzil fica **0,5508 m** à frente da empunhadura (é o
vão entre as duas mãos no modelo da arma), o que a deixa a **0,89–1,03 m** do
ombro esquerdo do boneco, contra **0,5881 m** de braço mais **0,45 m** de
clavícula. A clavícula esquerda trabalha NO TETO e o cotovelo fica a 175,8° —
braço reto e ainda curto.

**Ressalva honesta sobre este número:** não consegui manter a arma NIVELADA no
kit emulado durante a amostra — o cano lia (0; 0; −1) no instante em que o
controle era posto e (0,086; 0,707; −0,702) dentro do `FpBody.update` do mesmo
frame, e pousar a mão esquerda sobre a âncora engata a mira de duas mãos, que
move a âncora de novo (laço). Com a arma apontada 45° para cima a âncora de
apoio sobe junto, então **0,2992 m é o que dá para medir hoje, não um veredito
sobre a pose real de tiro.** O que NÃO depende da orientação é a aritmética
acima: 0,5508 m de vão de arma + o ombro esquerdo do lado errado do corpo não
cabem em 0,5881 m de braço.

E há um ponto de desenho por trás disso, que não é deste módulo: **em VR a mão
esquerda do boneco mira a âncora da ARMA, não o CONTROLE ESQUERDO do jogador.**
Enquanto o jogador segura o guarda-mão os dois coincidem; assim que ele solta,
a mão do boneco continua agarrada a um ponto onde a mão dele não está.
`js/xr/xrweapon.js` já sabe se o apoio está engatado (`APOIO_PEGA` /
`APOIO_SOLTA`, com histerese) — é a informação que falta chegar em
`js/fpbody.js`.

### 5.7 Fontes desta seção

- **Lei dos cossenos para membro de dois ossos:**
  [Alan Zucconi, *Inverse Kinematics for 2-bone limbs*](https://www.alanzucconi.com/2018/05/02/ik-2/)
  — `cos(α) = (b² + c² − a²) / (2bc)`, com `b` = distância até o alvo. **A
  página NÃO trata alvo fora de alcance nem `d < |a−b|`**: os dois clamps de
  `dobrar2Ossos` são deste repositório, e o segundo veio da perna (§4).
- **Analítico vs. heurístico:** [Inverse kinematics
  (Wikipédia)](https://en.wikipedia.org/wiki/Inverse_kinematics) — *"An
  analytic solution … is a closed-form expression that takes the end-effector
  pose as input and gives joint positions as output"*, e *"Analytical inverse
  kinematics solvers can be significantly faster than numerical solvers and
  provide more than one solution, but only a finite number of solutions, for a
  given end-effector pose."* **O artigo não discute alvo inalcançável nem o
  volume de trabalho do membro** — a ressalva do §4.2 continua valendo.
- **A caixa de um `SkinnedMesh` não reflete a pose:** fonte do three 0.185.1,
  `SkinnedMesh.computeBoundingBox` — *"If the skinned mesh is animated, the
  bounding box should be recomputed per frame in order to reflect the current
  animation state."* É por isso que todo número desta seção sai de osso.
- **Proporção de braço humano:** [Body proportions
  (Wikipédia)](https://en.wikipedia.org/wiki/Body_proportions) — *"An average
  person is generally 7-and-a-half heads tall (including the head)"*, *"arms
  measure to about three heads long"*, *"hands are as long as the face"*. Serve
  só como faixa de plausibilidade: o braço do rig mede 0,313 da altura do
  boneco (ombro→punho), e a referência, lida em cabeças, dá algo entre 0,27
  (ombro→punho) e 0,40 (ombro→ponta do dedo). **Está dentro da faixa** — ou
  seja, o osso não é o problema, o número que entrava no solver é que era.
- **Diretriz da Meta sobre comprimento de braço / IK de avatar em primeira
  pessoa:** *não encontrado nesta rodada.* As URLs de design de mãos
  (`developers.meta.com/horizon/design/hands-design-intro/`,
  `.../hands-hand-tracking`) e a de visão geral dos Meta Avatars devolveram 404
  ou não tratam do assunto, e o orçamento de busca da sessão estava esgotado.
  Nenhuma decisão desta seção depende disso: o critério usado é geométrico
  (o comprimento que entra no solver tem de ser o comprimento que os ossos
  vencem), não ergonômico.

---

## 6. O que este documento NÃO fecha

- **C4 (escala 1:1 do MUNDO)**: medido nesta rodada e **fora da posse desta
  frente**. Em metros, dentro da sessão: carro **3,586 m** de comprimento
  (referência do critério: ≈ 4,3 m → **−17 %**), esqueleto **2,25 m** de altura
  (referência: humano ≈ 1,75 m → **+29 %**), helicóptero 6,34 × 4,99 m. Mexer
  nisso é `js/car.js`, `js/charmodels.js` e worldgen — game design, não corpo.
- **Interruptor de pernas** para não atrapalhar loot (Ghosts of Tabor tem
  `Full Body IK` vs `Arms Only`): não implementado, anotado.
- **Travar altura se o corpo virar hitbox de rede** (Contractors): hoje a
  altura do headset não muda hitbox, então não é vetor de trapaça — vira, se um
  dia o corpo em VR for o que os outros enxergam.
- **O braço ESQUERDO alcançar o guarda-mão** (§5.6): medido, explicado e NÃO
  resolvido. Depende de o `js/fpbody.js` saber o que o `js/xr/xrweapon.js` já
  sabe (se a mão de apoio está engatada) — e disso ele só fica sabendo por
  fiação no `game.js`, que é de outra posse.
- **A ORDEM DENTRO DO FRAME em XR:** `FpBody.update` roda dentro do
  `applyFpsCamera` (game.js:2113), e o `XRArma.aplicar` que reposiciona a arma
  no controle roda DEPOIS (game.js:3769). Ou seja, em XR os braços do boneco
  são resolvidos contra a pose da arma do frame ANTERIOR. Parado o erro é zero
  (medido: 0,0000 m), então não é o defeito do §5 — mas com a arma em
  movimento é um frame de atraso da mão em relação à arma. Consertar é mover
  uma chamada no `game.js`; medir antes, porque a ordem tem contrato escrito
  logo acima dela.

---

## 7. NADA ENTRA NO OLHO (I3) — e por que nenhuma calibração resolvia

Esta seção fecha o item que a validação `da3987c` mediu pela primeira vez em
oito rodadas e reprovou: **a geometria do corpo entre 0,0092 m e 0,0829 m do
olho**, contra um teto de 0,15 m. Ela existe porque a resposta certa aqui é
CONTRA-INTUITIVA: não é calibração, é geometria — e três tentativas de
calibração pioraram o número antes de o mecanismo ficar claro.

### 7.1 O que estava lá, medido vértice a vértice

Sonda própria (`test/xr-olho-limpo.test.js`), malha SKINADA, dez poses, dois
olhos. Os culpados têm nome:

| pose | mais perto do olho | osso de maior peso |
|---|--:|---|
| arma no quadril | 0,0959 m | `Chest` |
| arma no olho | 0,0261 m | `Sholder.L` |
| braço para cima | 0,0326 m | `Sholder.L` |
| olhando 60° à esquerda | 0,0890 m | `Sholder.L` |

E, na pose de descanso, um piso permanente de **0,082 m** em ~670 vértices com
peso de `Head`.

### 7.2 As quatro causas, e o conserto de cada uma

**(a) A cabeça invisível continuava sendo geometria.** `B.head.scale = 0.0001`
some com a cabeça na TELA e empilha os vértices dela no ponto do osso — que
mora a 0,0972 no espaço da raiz, isto é, a 8,2 cm do olho. O critério mede a
MALHA. **Conserto:** os triângulos da cabeça saem do índice e os vértices saem
do atributo (`apagarOsso`). 846 vértices e um objeto inteiro (`Object_11`, 288
triângulos) a menos — o que também devolve uma draw call por olho.

**(b) O modelo é ESTILIZADO e não tem pescoço.** Do topo do crânio ao alto do
ombro ele tem 0,223 m; gente tem ~0,36 m. Com o olho no lugar certo, o ombro
fica a **0,053 m** abaixo da câmera. **Nenhum valor de `eyeDrop` resolve**: o
que aproxima a câmera dos olhos do modelo aproxima o ombro junto, e o que
afasta o ombro enfia a câmera no peito. Medido, com `eyeDrop` variando de 0,20
a 0,05, o alto do ombro sai de 0,053 m para 0,173 m — mas o boneco encolhe 7 %
e o braço, que já não alcança (§5.6), encolhe junto. **Conserto:** o que cai
dentro da bolha do olho **sai da malha** (`recortarOlho`, raio 0,30 no espaço
da raiz). É a saída intermediária entre as duas que o critério C5 aceita: a
Valve não desenhou corpo nenhum em Alyx, aqui o corpo fica e o que estaria
dentro do olho não é desenhado porque não existe mais.

**(c) A clavícula elástica levava a gola para dentro da cara.** `clavMax` é
0,45 m e a clavícula os usava INTEIROS: medido, ela saía de (0; −0,386; +0,070)
e parava em (0,225; −0,195; −0,337) — **subia 0,171 m e cruzava 0,201 m para o
lado direito do esterno**, à frente do queixo, carregando a gola. **Conserto:**
limite de junta em `clavUp`/`clavCross`, os dois em ZERO. O avanço para a
frente, que é o que compra alcance (§5.5), continua livre.

**Cortar `clavMax` foi tentado e é PIOR, e isso vale registro** porque é o
conserto que qualquer um tentaria primeiro: com 0,06 m (valor anatômico do
acrômio), o IK precisa GIRAR o úmero muito mais para alcançar a mesma âncora e
o braço esquerdo passa a varrer o rosto — a malha do `Arm_1.L` foi de 0,1277 m
para **0,0158 m** do olho. O que precisava de limite era a DIREÇÃO da
translação, não o tamanho dela.

**(d) O cotovelo abria no referencial da CABEÇA.** `_poloA` saía de
`camera.getWorldQuaternion`. No desktop dá no mesmo (o corpo é filho da
câmera), mas em VR a cabeça gira livre e o quadril só a segue depois de 25° de
folga de pescoço: olhar 60° para o lado girava a direção do cotovelo junto com
o OLHAR e varria o úmero pela frente do peito. **Conserto:** o polo passa a
sair de `bodyRoot.getWorldQuaternion`. Cotovelo é junta do tronco.

### 7.2b O que o DESKTOP pagou por isso: zero, e está medido

O recorte apaga malha de verdade, e a malha é a mesma nos dois modos — então
a pergunta obrigatória é o que o jogador de monitor deixou de ver. A resposta
tinha de ser uma FOTO e não pôde ser: o `page.screenshot` do harness devolve o
DOM sobre um canvas WebGL preto (três capturas nesta rodada, nenhuma com
mundo). Então virou número.

No desktop o corpo é FILHO DA CÂMERA, a raiz está em (0,0,0) e em escala 1 —
ou seja, cada vértice apagado já está em coordenadas de câmera. Basta o teste
de frustum.

| grandeza | valor |
|---|--:|
| vértices apagados da malha (cabeça + bolha) | **1 010** |
| caixa do recorte, em coord. de câmera (min) | (−0,198; −0,255; −0,160) |
| caixa do recorte, em coord. de câmera (max) | (+0,198; −0,059; +0,130) |
| `fov` / `aspect` / `near` do desktop | 75° / 1,333 / 0,08 |
| **apagados DENTRO do frustum do monitor** | **0** |

Zero. O que saiu estava atrás do plano near, atrás da câmera ou abaixo da
borda do cone. O invariante "a versão de mouse não pode regredir em nada"
continua valendo, e agora com medida em vez de fé — a assertiva está em
`test/xr-olho-limpo.test.js`, terceira suíte, e ela quebra se alguém aumentar
`eyeCut` até morder o que o monitor enxerga.

### 7.3 A última guarda, e por que ela é servo e não correção

Sobrava, depois de tudo isso, **0,1446 m numa pose** (cabeça girada 60°, úmero
esquerdo cruzando à frente do peito) — 5,4 mm abaixo do teto. Isso não é
geometria estática: é a POSE trazendo malha para dentro, e nenhum corte de
carregamento alcança.

A guarda é a que o gênero usa quando a câmera encosta no avatar: **o corpo
recua o tanto que falta**, com teto de 0,015 m — que cabe nos 0,05 m de erro de
âncora que C5 aceita e fica abaixo dos 0,02 m de tolerância da mão na
empunhadura. Três detalhes que custaram uma rodada cada:

1. **Vigiar "os vértices da borda do recorte" não funciona.** Quem chega perto
   do olho na pose real é o ÚMERO, que na pose de descanso está pendurado ao
   lado do corpo. 128 sentinelas escolhidas por proximidade de descanso
   dispararam ZERO vez com a malha a 0,1446 m. O que funciona é varredura
   rolante do corpo inteiro (512 vértices por frame) + lista curta de
   suspeitos conferida sempre.
2. **Escrever `bodyRoot.position` no `FpBody.update` não chega ao frame.**
   `js/xr/xrbody.js` reescreve a posição da raiz DEPOIS, no mesmo frame. O
   recuo vai pelo mesmo canal de `userData` que `pernaDobra` e `encurtar` já
   usam. E, como a medição do frame já enxerga o recuo do frame anterior, o
   valor é **acumulado** — substituir criaria o laço empurra/solta.
3. **O raio não é 0,15 m, é 0,19 m.** Aqui só existe a câmera do JOGO, que em
   XR fica no CENTRO da cabeça, e o critério mede de CADA OLHO — meia distância
   interpupilar de diferença (medido: 0,0315 m). A guarda via 0,26 m onde a
   sonda via 0,14 m e nunca disparava.

### 7.4 O resultado

| pose | antes | depois |
|---|--:|--:|
| arma no quadril | 0,0959 | **0,1857** |
| arma pronta | 0,0632 | **0,1833** |
| arma no olho | 0,0261 | **0,1836** |
| braço estendido | 0,0397 | **0,1810** |
| braço para cima | 0,0326 | **0,1759** |
| colado no peito | 0,0663 | **0,1844** |
| olhando para baixo (−70°) | 0,0443 | **0,1603** |
| olhando 60° à esquerda | 0,0890 | **0,1558** |
| olhando 60° à direita | 0,0936 | **0,1811** |
| agachado (cabeça a 1,10 m) | 0,0440 | **0,1704** |

Teto do critério: 0,15 m. **Dez de dez.**

---

## 8. A CABEÇA MANDA ATÉ O FIM (C5) — e o preço, com número

O `piso` de `js/xr/xrbody.js` era `max(alturaCabeca, olho − dobraMax −
AFUNDA_MAX)`: enquanto a perna dobrava, o corpo descia com a cabeça; passado
esse ponto o corpo PARAVA e a cabeça continuava. Medido pela validação
independente: com a cabeça a 0,95 m — o jogador **sentado no chão**, que a
VRC.Quest.Tracking.1 aceita como modo válido — o ombro ficava **+0,0521 m ACIMA
do olho**.

**O que mudou:** `alturaCorpo = alturaCabeca`, sempre.

| ombro vs olho | antes | depois |
|---|--:|--:|
| de pé (1,70 m) | −0,349 | **−0,385 (R) / −0,353 (L)** |
| sentado (0,95 m) | **+0,0521** | **−0,389 (R) / −0,359 (L)** |

**O preço é o pé abaixo do chão**, e ele é declarado em vez de escondido: o que
a perna não dobra, o pé afunda. O VRIK nomeia esse trade-off pelo nome e a
escolha padrão dele é a mesma (`plantFeet = false`, "can cause the camera to
exit the head" é o que acontece do outro lado). Para reduzir o preço, o joelho
passou do limite ATIVO (150°) para o PASSIVO (158° — a flexão "heel to buttock"
que a fonte já citada no §4.3 descreve), o que faz a perna encurtar 0,60 m em
vez de 0,542 m e cobre o agachamento normal do jogo inteiro.

Quem está DENTRO do corpo não vê o próprio pé furar o chão; vê o próprio ombro
na frente do olho.
