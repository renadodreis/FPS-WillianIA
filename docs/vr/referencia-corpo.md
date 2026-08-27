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

## 5. O que este documento NÃO fecha

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
