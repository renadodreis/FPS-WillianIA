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

A origem do corpo passa a ser **a altura da cabeça do jogador**, com um piso
que ainda protege o pé enquanto o joelho dobrado do modelo dá conta
(`js/fpbody.js` dobra a perna por `player.crouchT`, que o agachamento físico
alimenta):

```
corpo.position.y = max(alturaCabeca, olho − AFUNDA_MAX − DOBRA_JOELHO × agacharFrac)
```

No agachamento raso o pé fica no chão; no fundo a âncora vence, e o preço é o
pé furar o piso — que **quem está dentro do corpo não vê**. O preço da escolha
anterior era o peito na altura dos olhos, que todo mundo vê.

Medido depois da mudança, agachado a 1,15 m: ombro **abaixo** do olho e topo do
boneco **≤ 0,30 m** acima do olho (era +0,185 m e 0,709 m).

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

## 4. O que este documento NÃO fecha

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
