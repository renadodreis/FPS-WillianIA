# Critério de aceite triplo A — porte VR (Meta Quest 3, WebXR)

Data: 2026-08-26 · branch `refatoracao` · three r0.185.1 · IWER 2.3.0
Autor deste documento: o **validador**. Não escreve código, não escreve teste.
Escreve o que reprova.

---

## 0. A regra que governa este documento

O dono do projeto definiu: **triplo A = ausência de defeito.** Aqui isso vira
uma regra operacional sem margem:

> **Um critério reprovado reprova a entrega inteira.** Não existe "passou em 46
> de 47". Não existe "esse é menor". Não existe média. Se um item da lista
> abaixo está vermelho, a rodada volta.

E a segunda regra, que é a lição mais cara deste repo:

> **Teste verde não prova tela certa.** A entrega anterior passava em 1359
> testes automatizados e foi reprovada em dois minutos de headset. Todo critério
> aqui traz o campo **"por que a suíte atual não pega"** — se um critério novo
> não souber responder isso, ele não vale nada e não entra.

O diagnóstico da suíte atual, em uma frase: **ela nunca move a cabeça e nunca
move a mão.** Nenhum dos 8 arquivos `test/xr-*.test.js` escreve
`dev.position` (a translação do headset), e só dois escrevem um quaternion.
Todo teste de VR roda com o jogador parado, exatamente na origem do rig, com os
dois controles na pose de fábrica. É o buraco de **cobertura de ESTADO** que
CLAUDE.md já documentou uma vez (o rig de rodas) repetido inteiro na frente de
VR: os defeitos que o dono viu são, quase todos, **matematicamente invisíveis
com a cabeça na origem**.

---

## 1. O que foi medido hoje (linha de base contra a qual os critérios são cobrados)

**Condição declarada** (sem isso não é medida): sessão `immersive-vr` REAL,
runtime IWER 2.3.0 preset Meta Quest 3, Chrome com GPU real nesta máquina,
servidor local, seed 424242, `test/helpers/iwer.js` → `bootEmVR`, jogo já em
partida. Reprodução no fim do documento (§12).

**Instantâneo do commit `b1f1e08`, 2026-08-26.** Esta tabela é a linha de base
contra a qual a PRÓXIMA entrega é cobrada — não é o estado permanente do jogo.
Cada rodada de validação regera a coluna "medido" pelo §12 e a compara com a
coluna "onde precisa estar", que é a única parte fixa.

| Grandeza | Medido hoje | Onde precisa estar |
|---|--:|--:|
| Translação da cabeça por passo de giro (jogador 0,71 m fora do centro) | **0,554 m** | ≤ 0,02 m |
| Ângulo do passo de giro | 45,00° | 45°, **e configurável** |
| Passo físico de 1,442 m → quanto o colisor andou | **0,000 m** | 1,442 m ± 0,05 |
| Separação cabeça↔colisor após o passo | **1,429 m** | ≤ 0,10 m |
| Folga cabeça↔chão sob a cabeça, num quadrado de 2 m | **1,439 – 1,778 m** | 1,60 ± 0,02 m |
| Distância arma ↔ controle (quadril) | **0,543 m** | ≤ 0,03 m |
| Distância arma ↔ controle (ADS) | **0,476 m** | ≤ 0,03 m |
| Deriva da arma com o controle PARADO | 2,4 mm | 0 |
| Deriva da arma andando (bob/sway) | **55 mm** vertical | 0 |
| Espaço em que a arma está pendurada | `targetRaySpace` | `gripSpace` |
| Divergência grip↔targetRay no Touch Plus (config oficial da Meta) | **45,00° e 5,2 cm** | — |
| Piscada do giro (pico / duração) | 0,794 / 84 ms | ≥ 0,95 / 60–100 ms |
| Vinheta de túnel parado (deveria sumir) | 0,082 | ≤ 0,01 |
| Velocidade de caminhada / corrida | **5,2 / 8,6 m/s** | ~1,4 / ~2,8 m/s |
| Draw calls em estéreo (menu → castelo) | **517 – 806** | ≤ 180 |
| Triângulos em estéreo | **1,46 M – 2,03 M** | ≤ 500 k |
| Objetos de HUD dentro do mundo | **0** | tudo o que é essencial |
| Chamadas de háptico no código inteiro | **0** (2 atuadores disponíveis) | ≥ 1 por tiro |
| `setFoveation` no código | **nunca chamado** (three usa 1.0 = MÁXIMO) | declarado e medido |
| MSAA no alvo de render XR | **0 amostras** (`antialias:false`) | 4× |
| `updateTargetFrameRate` | **nunca chamado** (sessão nasceu a 90 Hz) | 72 declarado |
| Ações do BR alcançáveis pelo controle | **pulo da nave, paraquedas, baú do BR e armas 4–8: NENHUMA** | todas |
| Caminho para pausar / sair pelo headset | **não existe** | obrigatório (VRC) |

As três leituras que explicam três queixas do dono, sem interpretação:

1. `cabecaAndouM: 0.554` — um passo de giro **teleporta a cabeça 55 cm de lado**
   quando o jogador não está exatamente no centro do guardian. É a corda de um
   arco: `2·r·sen(θ/2)` com `r = 0,71 m` e `θ = 45°`. **"esse movimento não
   existe em VR"** é literalmente isso: o mundo não só gira, ele desliza.
2. `colisorAndouM: 0.000` contra `cabecaAndouM: 1.442` — o corpo simulado
   **não segue a cabeça**. Depois de um passo, o jogador está 1,43 m fora do
   próprio corpo. **"o corpo onde segura a arma parece deslocado do centro."**
3. `folga` variando de 1,439 a 1,778 m com o olho fixo em 1,600 m — andando
   dentro de um quadrado de 2 m no terreno mais manso do mapa, o jogador já
   fica **16 cm abaixo do chão que está sob a cabeça dele**. **"o boneco parece
   às vezes enterrado no chão."** Em rampa, escada ou cidade, isso vira metros.

---

## 2. Categoria A — Giro e locomoção

### A1 · O giro não pode transladar a cabeça
- **Mede:** deslocamento horizontal da posição de MUNDO da câmera entre o frame
  antes e o frame depois de um passo de giro, com o headset deslocado
  fisicamente da origem do rig.
- **Como (automatizável, IWER):** em sessão, `dev.position.x = 0.5;
  dev.position.z = 0.5`; ler `camera.getWorldPosition()`; `__A.stick('right',
  1, 0)`; soltar; ler de novo. Repetir para 8 offsets ao redor de um círculo de
  0,7 m e para os dois sentidos de giro.
- **Aprova:** ≤ **0,02 m** em todos os 16 casos. **Reprova:** qualquer caso
  acima. **Hoje: 0,554 m.**
- **Fonte:** o giro artificial tem que pivotar no ponto de vista do jogador —
  qualquer outro pivô injeta translação lateral que o ouvido interno não sente,
  que é a definição de conflito visual-vestibular do guia da Meta ("minimize a
  duração e a frequência desses conflitos"; "evite sacudir a câmera"). Nenhum
  FPS de VR do gênero pivota em outro lugar.
- **Queixa que fecha:** *"viro com o controle e move igual PC, movimento
  estático, uns 30 graus de uma vez, esse movimento não existe em VR."*
- **Por que a suíte não pega:** `xr-controle-anda.test.js` testa o passo de 45°
  com o headset em `dev.position = (0,0,0)`. Com a cabeça EM CIMA do pivô,
  rotação pura e rotação com translação dão o mesmo resultado. O teste está
  certo e o jogo está errado ao mesmo tempo.

### A2 · O passo de giro é escolha do jogador, não do programador
- **Mede:** existência e efeito de uma opção de giro, dentro do headset.
- **Como:** abrir o painel de opções EM VR e conferir que oferece pelo menos
  **30°, 45°, 60°** de passo e **giro suave com velocidade ajustável**; para
  cada valor, medir o yaw aplicado por inclinada (leitura de `XR.rig.rotation.y`).
- **Aprova:** cada incremento oferecido bate com o medido em **± 0,5°**, e o
  giro suave existe como **opt-in**. **Reprova:** valor fixo em código, ou
  opção que não existe dentro do headset.
- **Fonte:** Meta, *Locomotion comfort and usability*, lista os incrementos
  aceitos como **"15, 30, 45, 90 ou 180 graus"** e manda oferecer giro suave
  como opt-in com velocidade e aceleração ajustáveis. VRC.Quest.Accessibility.8
  (recomendado) pede múltiplos estilos de locomoção; Accessibility.7 pede a
  opção de girar a vista sem mexer o pescoço. Half-Life: Alyx oferece de 15° a
  90°; Resident Evil 4 VR oferece 30/45/90.
- **Queixa:** *"uns 30 graus de uma vez"* — 30° é um incremento legítimo da
  lista da Meta. O jogo entrega 45° fixo e não deixa ele escolher. **O conserto
  não é discutir o número, é devolver a escolha.**
- **Por que a suíte não pega:** o teste `'o passo é de 45 graus'` CONGELA o
  valor errado — ele transforma a ausência de opção em requisito.

### A3 · Velocidade de locomoção com escala humana
- **Mede:** velocidade horizontal máxima de caminhada e de corrida, em m/s,
  lida de `player.vel` em sessão.
- **Como:** `__A.stick('left', 0, -1)` por 3 s, ler `Math.hypot(vel.x, vel.z)`;
  repetir com o clique do analógico (correr).
- **Aprova:** caminhada **≤ 2,0 m/s** e corrida **≤ 4,0 m/s** por padrão em VR,
  com a velocidade de PC disponível como opção declarada. **Reprova:** acima
  disso. **Hoje: 5,2 e 8,6 m/s** — 3,7× a caminhada humana e 3× o trote.
- **Fonte:** guia da Meta e o *Best Practices Guide* da Oculus, que dão os
  números humanos: **1,4 m/s** andando e **~2,8–3 m/s** correndo, e mandam usar
  **velocidade quantizada** (parado / andando / correndo, trocada
  instantaneamente, sem rampa) porque o sistema vestibular sente aceleração,
  não velocidade constante. Fluxo óptico a 8,6 m/s com o corpo parado é a
  receita de enjoo mais forte que existe.
- **Queixa:** *"a qualidade está horrível"* na parte que é sensação, não pixel.
- **Por que a suíte não pega:** `WALK_SPEED`/`RUN_SPEED` são constantes de PC
  que ninguém nunca questionou, e todo teste de movimento em VR mede
  **direção** (o que está certo) e nunca **magnitude**.

### A4 · Aceleração de locomoção instantânea ou quase
- **Mede:** tempo entre inclinar o analógico e atingir 95 % da velocidade alvo.
- **Como:** amostrar `player.vel` a cada frame após `__A.stick`.
- **Aprova:** ≤ **0,15 s**, sem rampa perceptível; e a parada também ≤ 0,15 s.
  **Reprova:** rampa longa.
- **Fonte:** Oculus BP: *"acelerações instantâneas são mais confortáveis que
  acelerações graduais, com o desconforto crescendo em função da frequência,
  tamanho e duração da aceleração."*
- **EXCEÇÃO DECLARADA — o perfil `paridade` (linha `IGUAL AO PC` do painel).**
  Este perfil responde por A3 e A5 como qualquer outro, e **não** responde pelo
  teto de rampa de A4. Motivo, que não é de conforto e sim de projeto: aqui
  headset e monitor jogam a **mesma partida**, e o invariante do jogo é que
  quem está de headset não fique **nem mais rápido nem mais lento** que quem
  está no monitor. Dar rampa instantânea (50 ms) junto com a velocidade do PC
  (5,2 / 8,6 m/s) deixaria o jogador de headset **estritamente melhor** que o
  de monitor: nos ~273 ms em que o PC ainda sobe, o headset já está a 95 %, e
  duelo de canto é ganho por quem chega ao topo primeiro. Vantagem de headset
  não é conforto, é defeito de projeto. A exceção tem três amarras: (1) só
  alcança perfil **opt-in**, nunca o padrão; (2) só vale enquanto o perfil for
  paridade **inteira** — escala 1 e os quatro números do PC bit por bit; um
  perfil "rápido mas diferente do PC" não tem este argumento e volta a
  responder por A4; (3) está escrita em código, com motivo e custo, em
  `EXCECOES` de `js/xr/xrcomfort.js`, e `test/xr-conforto.test.js` reprova
  qualquer perfil que passe do teto sem exceção declarada. **Custo assumido:**
  t95 ≈ 273 ms neste perfil, contra 150 do teto; os outros dois, inclusive o
  padrão, ficam em ~50 ms. É a mesma cláusula de padrão que A3 já tem — A4 não
  a tinha, e essa assimetria é o que fez o critério reprovar em `c070737` uma
  decisão que já estava tomada e não estava escrita. *(Cláusula proposta na
  rodada seguinte a `c070737` pela frente de conforto; o dono do projeto e o
  validador riscam esta lista em uma linha se discordarem.)*
- **Por que a suíte não pega:** não existe teste nenhum de perfil de
  velocidade em VR. *(Passou a existir: `test/xr-locomotion.test.js` mede a
  rampa por frame de sessão, e `test/xr-conforto.test.js` audita **todo**
  perfil de `ORDEM` contra este teto — perfil novo que estoure a rampa sem
  exceção declarada nasce vermelho.)*

### A5 · Vinheta de túnel some quando o jogador para
- **Mede:** `XR.conforto.tunel` em regime, parado e andando.
- **Como:** andar 2 s, parar 1,5 s, ler.
- **Aprova:** ≤ **0,01** parado (a periferia volta inteira), e a vinheta é
  desligável nas opções. **Reprova:** resíduo permanente. **Hoje: 0,082
  parado** — o jogador nunca recupera a visão periférica cheia.
- **Fonte:** Meta recomenda vinheta *durante o movimento*; a literatura (ACM
  SAP) mostra que vinheta aplicada fora de hora chega a **aumentar** o enjoo.
  Pavlov expõe a força da vinheta como slider de 0–100 %; Contractors a deixa
  ligada por padrão e desligável.
- **Sem exceção, para nenhum perfil.** O jogador não escolheu ficar com a
  periferia fechada — ele só parou de andar. A5 é o único teto deste bloco que
  vale igual para todo mundo, e é por isso que ele foi fechado pela raiz e não
  pelo pico: a abertura da vinheta TERMINA (chega a zero exato em ≤ 1 s do
  túnel cheio, seja qual for o pico), então a velocidade do perfil deixou de
  poder reabrir este critério. Ver `passoTunel` em `js/xr/xrcomfort.js`.
- **Por que a suíte não pega:** o teste de conforto existente afere que a
  vinheta ABRE e FECHA, não que ela chega a zero. *(Passou a pegar:
  `test/xr-conforto.test.js` cobra `=== 0` — na receita literal deste §, em
  todo perfil de `ORDEM`, e também ao parar de GIRAR, que a receita não cobre
  e que no ajuste de fábrica deixava 0,01805 de resíduo.)*

### A6 · Nada além do pescoço do jogador move a vista — em TODOS os estados
- **Mede:** para cada estado do jogo, a diferença entre a rotação de mundo da
  câmera e (yaw do rig ∘ quaternion do headset). Tem que ser identidade.
- **Como:** varrer os estados **menu, jogando, tomando dano, atirando, dirigindo,
  voando, na nave do BR, em queda livre, de paraquedas, MORTO, durante a
  cinemática de destruição da cidade, pausado, espectador e fim de partida**;
  em cada um, com o headset parado, medir 120 frames.
- **Aprova:** erro angular ≤ **0,001 rad** em todos os frames de todos os
  estados, e a posição de mundo da câmera só muda por `dev.position` ou por
  locomoção comandada. **Reprova:** qualquer estado que empurre a câmera.
- **Fonte:** Oculus BP, literal: *"Não use nenhum head-bob ou mudança de
  orientação ou posição da câmera que não tenha sido iniciada pelo movimento
  real da cabeça do usuário"*; *"Evite sacudir a câmera, como quando o usuário
  é atingido ou baleado"*; *"O display deve responder aos movimentos do usuário
  o tempo todo, sem exceção. Mesmo em menus, com o jogo pausado, ou durante
  cutscenes."* A lista de "coisas ruins" do blog de desenvolvedor da Meta
  inclui, nominalmente, *"mudar a orientação da cabeça sem entrada do usuário"*,
  *"mudar o campo de visão"* e *"ignorar ou sobrescrever o movimento da cabeça,
  como congelar a vista durante cinemáticas ou menus"*. VRC.Quest.Functional.5
  (obrigatório) exige resposta ao rastreamento posicional **e** de orientação.
- **Por que a suíte não pega:** os testes que existem cobrem **menu** e
  **jogando**, e nada mais. `game.js` gateia recoil/shake/morte com
  `if (XR.presenting)` — mas os outros donos de câmera **não têm gate nenhum**
  e nunca entraram numa sessão XR em teste:
  - `city-destruction-client.js:175-180` escreve `camera.fov`,
    `camera.position` e `camera.quaternion` na cinemática — e `:154-156`
    **esconde e restaura `camera.children` por índice**, sendo que em XR a
    vinheta de conforto É um filho da câmera; salvar e restaurar por índice com
    a lista mudando é vinheta presa ligada ou presa desligada.
  - `br-game.js:776`, `:985` e `:1875` leem `MP.camera.quaternion` — o
    quaternion **LOCAL**, que em XR é a cabeça relativa ao rig e não o mundo.
    É exatamente a armadilha que a skill `vr-quest` já documentou como o
    relato "pra frente vai pra trás", ainda viva em três lugares do BR.
  - `br-game.js:828` e `:1379` dirigem a queda/paraquedas por
    `camera.getWorldDirection` — em VR isso é **pilotar com o rosto**.

  É a mesma armadilha do "startBRMatch pula a fase da nave de propósito"
  registrada em CLAUDE.md: o harness nunca visita o estado onde o defeito mora.

---

## 3. Categoria B — Mira e empunhadura

### B1 · A arma nasce na MÃO, no espaço da empunhadura
- **Mede:** distância entre o ponto de empunhadura do modelo da arma e a origem
  do **`gripSpace`** do controle, e o erro angular entre o eixo do cano e o
  −Z do `gripSpace` (corrigido pelo offset autoral da arma).
- **Como:** em sessão, mover `dev.controllers.right.position/quaternion` para
  8 poses distintas; a cada pose ler a matriz de mundo do nó de empunhadura da
  arma e a pose de `gripSpace` (via `renderer.xr.getControllerGrip(i)`).
- **Aprova:** ≤ **0,03 m** e ≤ **5°** em todas as poses, em todas as armas do
  arsenal, e nos estados quadril / ADS / recarga / corrida / dentro do veículo.
  **Reprova:** qualquer pose acima. **Hoje: 0,543 m no quadril e 0,476 m no
  ADS**, com a arma pendurada em `targetRaySpace`.
- **Fonte:** **VRC.Quest.Input.3 (OBRIGATÓRIO):** *"As mãos e controles dentro
  da aplicação devem coincidir com os equivalentes do mundo real do usuário."*
  A especificação WebXR separa os dois espaços de propósito: `gripSpace` tem a
  origem na palma e o −Z apontando "como se o usuário segurasse uma haste reta"
  — é o espaço para pendurar objeto segurado; `targetRaySpace` é o raio de
  mira. No Quest 3 os dois **divergem 45,00° e 5,2 cm** — número lido do
  `gripOffsetMatrix` do perfil `meta-quest-touch-plus` no config oficial da
  Meta (`iwer/lib/device/configs/controller/meta.js`).
- **Queixa:** *"o corpo onde segura a arma parece deslocado do centro"* e *"a
  mira e a forma de mirar estão horríveis ao segurar a arma."*
- **Por que a suíte não pega:** `xr-controle-anda.test.js` prova que a arma
  **não é filha da câmera** e que **girar a mão move a mira** — as duas coisas
  certas. Nenhum teste mede a DISTÂNCIA entre a arma e a mão. Um objeto meio
  metro à frente do controle passa nos dois testes com folga.

### B2 · 1:1 sem suavização, sem bob, sem sway
- **Mede:** deriva da pose local da arma em relação ao pai enquanto o controle
  está imóvel, e enquanto o jogador anda.
- **Como:** 20 amostras de `armaLocal` com o controle parado; 20 andando.
- **Aprova:** amplitude ≤ **1 mm** nos dois casos. **Reprova:** qualquer
  oscilação. **Hoje: 2,4 mm parado e 55 mm andando** (respiração + bob + sway
  + pose de sprint, todos escritos todo frame por `shootUpdate`).
- **Fonte:** o gênero trata qualquer descasamento mão↔arma como **bug a
  corrigir com slider**, nunca como game feel: Gun Club VR expõe "Grip Angle
  offset", Borderlands 2 VR expõe "Player Gun Pitch Offset". A crítica de porte
  preguiçoso é explícita — *Borderlands 2 VR*: *"o ponto de pivô foi colocado
  no pulso em vez da mão, então você sempre sente que está segurando uma mão
  que está segurando uma arma"*; *Doom 3 VR*: *"a metralhadora fica muito mais
  alta do que você a está segurando na vida real."* Nenhuma fonte encontrou UM
  jogo do gênero que aplique amortecimento deliberado na arma.
- **Por que a suíte não pega:** os testes de arma (`weapon-rig`, `weapon-ads`)
  rodam **fora de XR**, onde bob e sway são exatamente o que se quer.

### B3 · Alinhamento de miras: dá para ver pelo buraco
- **Mede:** colinearidade entre (a) a reta olho→alça→massa de mira do modelo e
  (b) a direção real do tiro (`__game.mira().direcao`).
- **Como:** posicionar `dev.position`/`dev.quaternion` e a pose do controle na
  geometria de tiro do jogador (arma trazida ao olho); calcular os centros da
  alça e da massa a partir dos nós do modelo (`js/weaponrig.js` já conhece os
  perfis de mira); medir o ângulo entre as duas retas e a distância lateral do
  cano ao centro da massa.
- **Aprova:** ângulo ≤ **0,5°** e o eixo do cano passando dentro do círculo da
  massa de mira. **Reprova:** acima. **Hoje: a direção do tiro sai do raio de
  mira do controle e o modelo está a meio metro dele — não há alinhamento
  possível.**
- **Fonte:** Alyx **não tem ADS assistido**: a mira é alinhada fisicamente toda
  vez, o que só funciona porque arma e mão são o mesmo corpo rígido. RE4 VR e
  Onward idem. É a definição do gênero, e é exatamente o que o dono descreveu
  querer.
- **Queixa:** *"eu não consigo ter o movimento de mira centralizado, ver o
  buraco da mira da arma, de forma real."*
- **Por que a suíte não pega:** `weapon-ads.test.js` valida a pose de ADS
  **relativa à câmera** — o modelo de PC, em que o jogo teleporta a arma para o
  olho. Em VR essa pose é aplicada no referencial do CONTROLE e produz
  `(0, −0,124, −0,46)`, ou seja, a arma é jogada para um ponto arbitrário na
  frente da mão. O teste continua verde porque mede a fórmula, não a tela.

### B4 · Botão de mirar não teleporta a arma
- **Mede:** variação da pose da arma **relativa ao grip** ao apertar e soltar o
  botão de mira.
- **Como:** `__A.botao('right','squeeze',1)`, esperar 700 ms, medir; soltar,
  medir.
- **Aprova:** ≤ **0,01 m** e ≤ **1°** de variação. **Reprova:** qualquer salto.
  **Hoje: a arma salta de `(0,26; −0,18; −0,44)` para `(0; −0,12; −0,46)`** —
  6,7 cm de teleporte, e o eixo X zera (a arma "centraliza" num referencial que
  não é o do olho).
- **Fonte:** em VR mirar é aproximar a arma do olho com o braço. Snap-to-eye
  não existe no gênero (Alyx explicitamente não tem).
- **Por que a suíte não pega:** o botão de mira em VR só é testado quanto a
  "acende `mouse.aiming`".

### B5 · Segunda mão importa (apoio / punho dianteiro)
- **Mede:** com as duas empunhaduras seguradas, o eixo do cano contra o vetor
  mão-traseira → mão-dianteira.
- **Como:** posicionar os dois controles a 40 cm um do outro, segurar os dois
  `squeeze`, ler o eixo do cano.
- **Aprova:** ≤ **2°** de erro; e o recuo/oscilação da arma reduz de forma
  medível com duas mãos. **Reprova:** a segunda mão não faz diferença nenhuma.
  **Hoje: não existe conceito de segunda mão — a esquerda é agachar.**
- **Fonte:** Onward tem "Virtual Gunstock Mode" nomeado nas opções; Contractors
  tem virtual stock e physical gunstock mode; toda a indústria de coronhas
  físicas (Wield VR, Sanlaki) existe por causa disso. Uma arma longa segurada
  com uma mão só é a assinatura visual do porte preguiçoso.
- **Por que a suíte não pega:** o mapa de botões atual não tem espaço para
  segunda mão, e nenhum teste questiona o mapa — só verifica que ele faz o que
  está escrito.

### B6 · Háptico em toda ação de arma
- **Mede:** chamadas a `inputSource.gamepad.hapticActuators[0].pulse(...)` por
  evento.
- **Como:** instrumentar por espião na página (`pulse` embrulhado) e disparar
  tiro, recarga, encaixe de carregador, ferrolho, acerto, pegar item.
- **Aprova:** ≥ 1 pulso por evento, na mão certa, com duração declarada.
  **Reprova:** zero. **Hoje: zero chamadas no repositório inteiro**, com **2
  atuadores disponíveis** (um por controle, confirmado na sessão).
- **Fonte:** Meta publica um SDK de háptica inteiro e o Touch Plus suporta
  frequência variável. Atirar sem retorno tátil é o defeito que a crítica cita
  em todo porte de tela plana.
- **Por que a suíte não pega:** não há um único teste de háptico.

### B7 · O tiro sai do cano
- **Mede:** distância entre a origem do raio de tiro (`__game.mira().origem`) e
  a boca do cano do modelo.
- **Aprova:** ≤ **0,05 m**. **Reprova:** acima. **Hoje: a origem é o
  `targetRaySpace`, ~50 cm atrás e 45° fora do cano.**
- **Fonte:** consequência direta de B1/B3; e o anti-cheat do servidor valida
  **range** a partir dessa origem — uma origem errada é também risco de
  regressão de segurança (`test/security-regression.test.js`).
- **Por que a suíte não pega:** os testes checam a DIREÇÃO da mira, nunca a
  origem contra a geometria da arma.

---

## 4. Categoria C — Corpo, altura e escala

### C1 · O jogador nunca fica enterrado — nenhum frame, nenhum estado
- **Mede:** `cabeçaY − chãoSólidoSob(cabeçaXZ)`, todo frame.
- **Como:** roteiro de 3 minutos em sessão passando por: campo aberto, encosta,
  escada da Torre Nexus, interior da cidade, castelo, dentro do carro, saindo
  do carro, no helicóptero, na nave do BR, em queda, de paraquedas, morto, e
  pisando na cama elástica. Em cada frame, `groundAt(cabeça.x, cabeça.z)`.
- **Aprova:** folga entre **1,20 m e 2,10 m** em 100 % dos frames (janela que
  cobre agachado a esticado). **Reprova:** um frame fora. **Hoje: 1,439 a
  1,778 m parado num quadrado de 2 m no terreno mais plano do jogo** — já 16 cm
  enterrado sem sair do lugar.
- **Fonte:** WebXR `local-floor` garante **y = 0 no chão**; se o jogo respeita
  isso, a folga é a altura do olho e é constante. Variação de folga é prova de
  que o piso do rig e o chão sob a cabeça são coisas diferentes.
- **Queixa:** *"o boneco parece às vezes enterrado no chão."*
- **Por que a suíte não pega:** `xr-rig.test.js` testa `place()` com uma câmera
  falsa e o headset na origem; `xr-bootstrap` confere que o rig segue os pés.
  **Nenhum teste amostra o chão sob a CABEÇA**, que é o único lugar onde o
  defeito aparece.

### C2 · O corpo segue a cabeça (movimento de sala vale)
- **Mede:** distância horizontal entre a posição de mundo da câmera e o centro
  do colisor do jogador.
- **Como:** `dev.position` percorrendo os quatro cantos de um quadrado de
  **2,0 m × 2,0 m** (o mínimo que a loja exige), 0,5 m/s, 30 s.
- **Aprova:** ≤ **0,10 m** em todos os frames, e o colisor respeita parede,
  rampa e escada durante o passeio físico. **Reprova:** acima, ou o jogador
  atravessando parede a pé. **Hoje: 1,429 m de separação e colisão nenhuma —
  andando fisicamente o jogador atravessa qualquer coisa.**
- **Fonte:** **VRC.Quest.Tracking.1 (OBRIGATÓRIO)** — o app tem que ser
  *"completamente utilizável numa área de jogo de 6,5' × 6,5'"* (≈ 1,98 m ×
  1,98 m) em pé ou room-scale, ou completamente jogável sentado.
  VRC.Quest.Functional.5 (obrigatório) exige responder ao rastreamento
  **posicional**, não só de orientação.
- **Queixa:** *"o corpo onde segura a arma parece deslocado do centro."*
- **Por que a suíte não pega:** nenhum teste escreve `dev.position`. Zero.

### C3 · Altura do olho é do aparelho, e agachar de verdade agacha
- **Mede:** altura do olho contra `dev.position.y`; e o estado de agachamento
  do jogador quando o headset baixa fisicamente.
- **Como:** `dev.position.y` de 1,60 → 1,00 m; ler `player.crouchT`, a altura
  do colisor, e tentar passar por baixo de um vão de 1,2 m.
- **Aprova:** o olho acompanha em **± 0,02 m**; agachar fisicamente reduz o
  colisor e libera o vão; espiar por cima de cobertura funciona. **Reprova:**
  altura calculada pelo jogo, ou agachar físico que não muda nada.
- **Fonte:** `local-floor` entrega a altura real; VRC.Quest.Accessibility.9
  (recomendado) pede que tudo seja acessível de uma posição fixa, o que exige
  que o jogo saiba a altura real.
- **Por que a suíte não pega:** a altura só é testada com a câmera falsa fora
  de sessão.

### C4 · Escala 1:1 com o mundo real
- **Mede:** dimensões medidas em metros, dentro da sessão, de cinco referências:
  altura da porta da cidade, comprimento do carro, altura de um inimigo,
  largura do degrau da escada, altura do baú.
- **Como:** `Box3.setFromObject` nos nós, comparado com a referência real
  (porta ≈ 2,0–2,1 m; carro ≈ 4,3 m; humano ≈ 1,75 m; degrau ≈ 0,18 m).
- **Aprova:** ≤ **5 %** de erro em todas. **Reprova:** acima.
- **Fonte:** escala errada é citada como um dos bugs mais severos e específicos
  de VR ("mismatches nas dimensões do mundo podem causar enjoo e tontura"), e é
  a queixa nominal contra *Doom 3 VR* (*"os NPCs parecem minúsculos"*). Fora do
  headset ninguém percebe; dentro, é a primeira coisa.
- **Queixa:** *"a qualidade está horrível, muito ruim"* — a parte que não é
  pixel.
- **Por que a suíte não pega:** o jogo foi construído em unidades de gosto, não
  de metro, e nada nunca cobrou metro.

### C5 · Corpo em primeira pessoa coerente (ou ausente por decisão)
- **Mede:** interseção de qualquer parte do corpo com o plano near da câmera; e
  a distância entre o ombro renderizado e a posição do headset.
- **Como:** olhar para baixo (headset pitch −70°) e amostrar; girar a cabeça
  ±60° e amostrar.
- **Aprova:** nenhuma geometria dentro de **0,15 m** do olho; o corpo ancorado
  na cabeça com erro ≤ **0,05 m**; **ou** a decisão explícita e documentada de
  não renderizar corpo. **Reprova:** corpo que escorrega, cabeça vista por
  dentro, braço nascendo no ar.
- **Fonte:** Valve escolheu **não renderizar corpo nenhum** em Alyx e explicou
  por quê: *"sabemos onde estão suas mãos e sua cabeça, mas há uma variação
  enorme entre humanos nos comprimentos e movimentos entre esses pontos… se
  você errar, salta enormemente aos olhos."* Contractors oferece o toggle entre
  mãos flutuantes e IK de corpo inteiro. As duas saídas são aceitas; corpo
  errado não é.
- **Por que a suíte não pega:** `js/fpbody.js` não tem uma linha de XR e nenhum
  teste dele entra em sessão.

### C6 · O avatar que os OUTROS veem bate com o headset
- **Mede:** no cliente de outro jogador, distância entre a cabeça do avatar e a
  pose real do headset do jogador em VR.
- **Como:** dois clientes na mesma sala (um em sessão XR emulada), mover
  `dev.position`/`quaternion`, ler a pose do avatar remoto.
- **Aprova:** ≤ **0,05 m** e ≤ **5°**. **Reprova:** avatar plantado enquanto o
  jogador se mexe (o outro lado do defeito C2).
- **Fonte:** consequência de C2 no multiplayer; e o anti-cheat de teleporte do
  servidor (`hSpd > 90 m/s`) precisa continuar aceitando o estado enviado.
- **Por que a suíte não pega:** os testes de multiplayer nunca entram em XR.

---

## 5. Categoria D — Interação com o mundo

### D1 · Toda ação do jogo é alcançável pelo controle — inventário fechado
- **Mede:** para CADA ação da lista fechada abaixo, se ela dispara em sessão XR
  usando só os dois Touch.
- **Lista fechada (nenhuma pode faltar):** entrar/sair do carro · pilotar/sair
  do helicóptero · usar baú do solo · **abrir baú do BR** · pegar bazuca ·
  canhão de circo e as 5 atrações · segredos · **pular da nave** · **abrir o
  paraquedas** · trocar para as armas **4, 5, 6, 7 e 8** · usar kit médico ·
  lançar granada · comer · trocar acessório de mira · **pausar** · **abrir o
  menu** · **sair da partida a partir da tela de morte** · ciclar espectador ·
  chat.
- **Como:** roteiro em sessão que executa cada uma e afere o EFEITO (entrou no
  carro? o baú abriu? a arma trocou?), nunca a tecla.
- **Aprova:** 100 % da lista. **Reprova:** uma que seja.
- **Hoje reprovado, com causa provada:** `br-game.js:1814` instala um
  `window.addEventListener('keydown', …)` que trata `Space` (pular da nave,
  abrir paraquedas, ciclar espectador), `KeyE` (`tryOpenCrate`, o baú do BR) e
  `Digit4`–`Digit8` (as cinco armas do BR). A entrada de VR (`game.js:3010‑3057`)
  escreve em `keys[]`/`justPressed` e **nunca dispara um `KeyboardEvent` de
  DOM** — então nenhum desses listeners roda no headset. O caminho do celular
  (`js/touchcontrols.js:358‑376`) resolveu exatamente isto despachando
  `KeyboardEvent` sintético; a frente de VR não reaproveitou. E a troca de arma
  em VR (`game.js:3038`) só cicla `alvo < 3`: **das 8 armas, 5 são
  inalcançáveis.** Pausa e menu não têm mapeamento nenhum.
- **Fonte:** VRC.Quest.Functional.2 (obrigatório) exige pausa; a crítica de
  porte preguiçoso é unânime nesse ponto — *Skyrim VR*: *"você não consegue
  pegar itens, ainda é feito com telecinese"*; *Fallout 4 VR*: *"em vez de
  vasculhar armários com mãos virtuais… temos a mesma interface de menu da
  versão de console e PC."*
- **Queixa:** *"não consigo pegar o carro, abrir os baús."*
- **Por que a suíte não pega:** os testes de entrada de VR param em
  `criarEntradaXR().ler()` — provam que a INTENÇÃO sai correta do módulo puro.
  Ninguém segue a intenção até o EFEITO no mundo, e `br-game.js` não aparece em
  nenhum teste de XR.

### D2 · Alcance medido da cabeça e da mão, nunca do avatar simulado
- **Mede:** distância usada na decisão de "está perto o bastante", contra a
  posição de mundo da cabeça e da mão.
- **Como:** com `dev.position` deslocado 1,2 m em direção a um baú, verificar
  que a interação fica disponível quando a CABEÇA chega perto, e indisponível
  quando ela se afasta.
- **Aprova:** a decisão usa cabeça/mão; erro ≤ **0,10 m** contra a leitura
  direta. **Reprova:** decisão a partir de `player.pos`.
- **Hoje reprovado:** `js/interact.js` mede tudo de `player.pos` — baú 2,4 m,
  bazuca 2,8 m, carro 4,5 m, helicóptero 5 m. Com a separação medida de 1,43 m
  (C2), o jogador de pé encostado no baú pode estar fora do raio, e um baú a
  3,8 m pode estar "no alcance".
- **Fonte:** VRC.Quest.Input.3 (obrigatório) — o que está na aplicação tem que
  coincidir com o mundo real do usuário.
- **Por que a suíte não pega:** o alcance é testado fora de XR, onde
  `player.pos` e a câmera são a mesma coisa por construção.

### D3 · Pegar é com a EMPUNHADURA, e perto
- **Mede:** qual botão pega, e a partir de que distância.
- **Aprova:** o **grip** pega; raio de agarre direto entre **5 e 10 cm** da
  mão; se houver agarre à distância, ele é um verbo separado e explícito.
  **Reprova:** pegar no gatilho, ou "pegar" que é na verdade um comando de
  proximidade do corpo.
- **Fonte:** **VRC.Quest.Input.2 (recomendado):** usar o botão de empunhadura,
  não o gatilho, para pegar objetos. Referência de raio: o *SteamVR Unity
  Plugin* da Valve usa `hoverSphereRadius = 0.05` (5 cm) e
  `controllerHoverRadius = 0.075` (7,5 cm). Pavlov e Onward: agarre direto no
  grip, com brilho de proximidade. Alyx: grip perto + luvas gravitacionais para
  longe, um verbo cada.
- **Hoje:** o grip esquerdo é agachar e o direito é mirar; pegar é um botão de
  polegar com raio de 2,4–5 m medido do avatar.
- **Por que a suíte não pega:** o mapa de botões é testado contra si mesmo.

### D4 · Affordance existe DENTRO do mundo
- **Mede:** presença de destaque/rótulo em espaço de mundo para o interagível
  mais próximo dentro do alcance.
- **Como:** aproximar de cada tipo de interagível e conferir um objeto de cena
  (não DOM) visível a partir da câmera.
- **Aprova:** todo interagível no alcance tem destaque visível no headset, e o
  destaque some quando sai do alcance. **Reprova:** zero. **Hoje: `ui.prompt`
  é uma `<div>`; dentro da sessão imersiva o DOM não é desenhado. Objetos de
  HUD dentro do rig: 0.**
- **Fonte:** Alyx acende o objeto em laranja quando mirado; Pavlov faz a arma
  do chão brilhar quando a mão chega perto; Blade & Sorcery põe um ícone na
  parte agarrável. VRC.Quest.Functional.10 (recomendado) manda evitar UI
  presa à cabeça.
- **Queixa:** *"não consigo pegar o carro, abrir os baús"* — mesmo que a ação
  funcione, sem prompt no headset o jogador não sabe onde nem quando.
- **Por que a suíte não pega:** os testes de prompt leem `ui.prompt.innerHTML`
  — que continua correto e continua invisível.

### D5 · Entrar e sair de veículo sem quebrar a cabeça nem o chão
- **Mede:** ao entrar: a origem do rig passa a acompanhar o veículo, a cabeça
  fica no lugar do motorista, o rastreamento continua 1:1 e nada gira a vista.
  Ao sair: o jogador aparece de pé sobre o chão, com a folga de C1.
- **Aprova:** rastreamento posicional preservado dentro do veículo;
  0 rad de rotação imposta; folga de C1 respeitada dentro e depois.
  **Reprova:** câmera colada no assento sem rastreamento, ou saída enterrada.
- **Fonte:** Oculus BP: *"o display deve responder aos movimentos do usuário o
  tempo todo, sem exceção"* — inclusive sentado num veículo. Rest frame
  (cabine visível) é recomendado por reduzir o conflito.
- **Por que a suíte não pega:** dirigir nunca entrou numa sessão XR.

### D6 · Tudo alcançável de uma posição fixa
- **Mede:** o roteiro inteiro de D1 executado com `dev.position` travado no
  centro (jogador sentado, sem passo físico).
- **Aprova:** 100 % das ações continuam possíveis. **Reprova:** ação que exige
  andar fisicamente.
- **Fonte:** VRC.Quest.Accessibility.9 (recomendado) e VRC.Quest.Tracking.1
  (obrigatório, opção "sentado").

---

## 6. Categoria E — Desempenho

### E1 · 72 fps travado, medido no aparelho
- **Mede:** FPS do runtime dentro de sessão imersiva, ao longo de **20 minutos
  contínuos** de partida real (não de pose parada).
- **Como:** `adb logcat -s VrApi:V` (mesma fonte do OVR Metrics Tool) durante
  `npm run vr:baseline -- --target=quest --immersive=1`, com o sensor de
  presença enganado (`prox_close`) e **restaurado no fim**.
- **Aprova:** taxa declarada = **72 Hz** (via `session.updateTargetFrameRate`),
  **mediana 72**, **nenhuma janela de 1 s abaixo de 72**, e **zero amostras
  abaixo de 60**. Stale frames = 0 e swap interval = 1. **Reprova:** qualquer
  janela sustentada abaixo de 60. **Hoje: nunca medido dentro de sessão; a
  sessão nasce a 90 Hz porque o jogo nunca declara taxa.**
- **Fonte:** **VRC.Quest.Performance.1 (obrigatório)** — o app declara uma taxa
  entre 72/80/90/96/100/120 Hz e não pode ter *períodos prolongados* abaixo de
  60 fps; testado com OVR Metrics Tool em até 45 min. 72 fps = **13,7 ms** de
  orçamento por frame (doc de performance WebXR da Meta). Swap interval 2 é
  descrito pela própria Meta como "desconfortável".
- **Por que a suíte não pega:** o painel 2D do navegador do Quest trava em
  30 Hz — o baseline já provou (p50 = 33,3 ms em quatro poses com 2,7× de
  diferença de carga). Qualquer FPS medido fora de sessão imersiva **não mede
  nada**.

### E2 · Orçamento de submissão por frame, em ESTÉREO
- **Mede:** draw calls e triângulos por frame na sessão imersiva, mediana e
  pior pose.
- **Como:** `npm run vr:emulado` (conta é igual no aparelho — o baseline já
  cruzou 413 no Quest contra 463 no desktop).
- **Aprova:** draw calls ≤ **180** e triângulos ≤ **500 k** (teto interno), e
  em nenhuma pose acima de **200 / 1,5 M** (número publicado pela Meta para
  Quest 3). **Reprova:** acima. **Hoje: 517–806 draw calls e 1,46–2,03 M
  triângulos.**
- **Fonte:** Meta, *Device-specific optimization*: Quest 3 **< 200 draw calls**
  e **< 1,5 M triângulos/frame**; a tabela de *Testing and performance
  analysis* dá 200–300 para cena "busy". O teto interno de 180/500 k já está no
  baseline deste repo e é o mais apertado dos dois — vale o mais apertado.
- **Por que a suíte não pega:** nenhum teste tem orçamento; o baseline é
  relatório, não portão.

### E3 · Escala de render ≥ 85 %
- **Mede:** "Render Scale Percent" do OVR Metrics Tool ao longo da sessão.
- **Aprova:** ≥ **85 %** na maior parte da experiência; quedas isoladas e não
  consecutivas toleradas se recuperam. **Reprova:** abaixo de forma sustentada.
- **Fonte:** **VRC.Quest.Performance.4** (recomendado, apps imersivos).

### E4 · Tempo de lógica de aplicação ≤ 2 ms
- **Mede:** tempo de JS por frame dentro da sessão.
- **Aprova:** ≤ **2 ms** de mediana. **Reprova:** acima.
- **Fonte:** doc de performance WebXR da Meta: *"qualquer lógica de app que leve
  mais de dois milissegundos deve ser considerada para otimização."*
- **Por que a suíte não pega:** o `perfhud` mede frame time, não o recorte de
  JS.

### E5 · Térmica: 30 minutos sem degradar
- **Mede:** GPU%, temperatura e nível de clock ao longo de 30 min.
- **Aprova:** GPU% mediano ≤ **90 %**, sem entrada em Power Save, sem queda de
  FPS ao longo do tempo. **Reprova:** curva descendente.
- **Fonte:** a VRC de térmica (Performance.2) foi **aposentada em 16/10/2024** —
  o comportamento térmico passou a ser julgado dentro do gráfico de FPS da
  Performance.1. Ou seja: não há teste separado, mas a queda continua
  reprovando. Gatilhos de clock publicados pela Meta: GPU sobe de nível em
  ≥ 87 % e desce em ≤ 81 % no Quest 3.

---

## 7. Categoria F — Boot e ciclo de sessão

### F1 · 4 segundos até gráfico rastreado pela cabeça
- **Mede:** tempo entre o lançamento e o primeiro frame **head-tracked** dentro
  do headset, com **cache frio**.
- **Como:** `npm run vr:baseline -- --target=quest --immersive=1`, N ≥ 7,
  cache limpo, aparelho ocioso.
- **Aprova:** mediana ≤ **3,0 s** e **nenhuma execução acima de 4,0 s**; ou um
  indicador de carregamento **dentro do VR** desde o primeiro segundo.
  **Reprova:** tela preta, splash 2D, ou acima de 4 s sem indicador.
  **Hoje: 7,79 s até o primeiro frame no Quest com cache QUENTE** (0,02 MB
  baixados) — quase o dobro do limite, no melhor caso possível.
- **Fonte:** **VRC.Quest.Performance.3 (obrigatório):** *"O app deve exibir
  gráficos rastreados pela cabeça no headset em até 4 segundos após o
  lançamento, ou fornecer um indicador de carregamento em VR."* Vale igual para
  PWA: a Meta afirma que *"PWAs precisam aderir às mesmas políticas e Virtual
  Reality Checks que os outros apps da Horizon Store."*
- **Por que a suíte não pega:** a barra de boot que existe é do **desktop**
  (mediana ≤ 2,50 s, N ≥ 7) e mede a página, não a sessão imersiva no
  aparelho.

### F2 · Foco perdido: continua desenhando, esconde as mãos, ignora entrada, pausa
- **Mede:** comportamento com `visibilityState` em `visible-blurred` e `hidden`.
- **Como (automatizável):** `dev.updateVisibilityState('visible-blurred')` e
  `('hidden')`; conferir que os frames continuam, que os objetos de mão ficam
  invisíveis, que nenhuma entrada é consumida, e que o jogo solo pausa.
- **Aprova:** os quatro comportamentos. **Reprova:** qualquer um. **Hoje:
  `onVisibility` existe na camada de sessão e o game.js NÃO o consome** —
  ninguém esconde mão, ninguém ignora entrada, ninguém pausa.
- **Fonte:** **VRC.Quest.Input.4 (obrigatório):** o app deve ser focus-aware —
  *"continuar renderizando quando perde o foco, esconder quaisquer mãos ou
  controles do usuário, e ignorar toda entrada."* **VRC.Quest.Functional.2
  (obrigatório):** *"Apps single player devem pausar quando o usuário remove o
  headset ou abre o Universal Menu"* — a própria Meta cita esta como uma das
  VRCs mais reprovadas.
- **Por que a suíte não pega:** `xr-session.test.js` testa que o CALLBACK é
  chamado; ninguém testa o que o jogo faz com ele.

### F3 · Recentrar não teleporta nem enterra
- **Mede:** estado do jogador antes e depois de `dev.recenter()`.
- **Aprova:** o yaw de frente reseta, a posição do jogador no mundo **não
  muda** (≤ 0,02 m), a folga de C1 continua válida. **Reprova:** salto de
  posição ou enterro.
- **Fonte:** **VRC.Quest.Functional.9 (obrigatório):** em espaço de rastreio
  Local, o usuário precisa poder resetar a orientação de frente.
- **Por que a suíte não pega:** `recenter` não aparece em nenhum teste.

### F4 · Sair da sessão devolve o desktop intacto
- **Aprova:** a câmera volta ao pai anterior com a pose salva, o rig sai do
  caminho, o composer volta, a partida em andamento não reinicia.
  **Reprova:** qualquer diferença. *(Este já está coberto por
  `xr-bootstrap.test.js` e `xr-entrar-joga.test.js` — mantido na lista porque
  regressão aqui é fatal.)*

### F5 · Entrar em VR não exige nenhum toque em DOM depois do primeiro clique
- **Aprova:** a partir de dentro do headset, o jogador chega ao menu, escolhe
  modo, entra em partida, joga, morre, volta ao menu e sai — **sem tirar o
  aparelho**. **Reprova:** qualquer beco que só o mouse resolve. **Hoje: entrar
  em VR chama `startGame(false)` porque não há menu no mundo; e não existe
  caminho de volta.**
- **Fonte:** VRC.Quest.Functional.2 e a regra do dono ("plenamente jogável
  dentro do headset").

---

## 8. Categoria G — Qualidade de imagem

### G1 · Foveação declarada, não herdada
- **Mede:** valor efetivo de foveação na sessão.
- **Como:** `renderer.xr.getFoveation()` na página; no aparelho, o campo
  "foveation level" (0–4) do OVR Metrics Tool.
- **Aprova:** valor **escrito explicitamente pelo jogo**, ≤ **0,5**, com a
  medida de FPS que justifica a escolha registrada. **Reprova:** valor herdado.
  **Hoje: o jogo nunca chama `setFoveation`, e o three r0.185 tem
  `let foveation = 1.0; // Set default foveation to maximum.`** — ou seja, o
  jogo roda com **foveação MÁXIMA**, que borra toda a periferia por padrão.
- **Fonte:** WebXR expõe `fixedFoveation` de 0 a 1 (0 = resolução cheia); o
  navegador do Quest também aceita `no-/low-/medium-/high-fixed-foveation-level`
  em `optionalFeatures`. A Meta **não publica um padrão** — logo o padrão vem
  da biblioteca, e a da three é o máximo.
- **Queixa:** *"a qualidade está horrível, muito ruim."* Este é o item mais
  barato de consertar e um dos maiores em efeito visível.
- **Por que a suíte não pega:** ninguém nunca leu esse número.

### G2 · Antialiasing existe em XR
- **Mede:** número de amostras do alvo de render da sessão.
- **Como:** `renderer.xr.getRenderTarget().samples` dentro da sessão; e
  comparação visual de capturas antes/depois.
- **Aprova:** **4×** MSAA. **Reprova:** 0. **Hoje: 0.** O renderer é criado com
  `antialias: false` (`game.js:317`) e o `WebXRManager` do three faz
  `samples: attributes.antialias ? 4 : 0`. Em XR o `EffectComposer` — que é
  quem carrega o SMAA — **sai do caminho por obrigação**. Resultado: o headset
  recebe imagem sem nenhum antialiasing.
- **Fonte:** Meta, *Multisample Anti-Aliasing Analysis for Meta Quest*:
  *"Você deve quase sempre usar MSAA nos seus apps para dispositivos Quest"*,
  e *"não deve passar de 4× MSAA"*. Custo medido pela Meta: **+0,5 a +1,5 ms**
  por frame — que é caro, e por isso este critério é cobrado JUNTO com E1: se
  4× MSAA derruba os 72 fps, o que reprova é o orçamento de E2, não o MSAA.
- **Queixa:** *"a qualidade está horrível, muito ruim."*
- **Por que a suíte não pega:** o flag `antialias:false` é uma decisão de
  desktop (onde o SMAA do composer resolve) que ninguém revisou ao portar.

### G3 · Escala do framebuffer declarada e medida
- **Mede:** `framebufferScaleFactor` efetivo e a resolução resultante por olho.
- **Aprova:** valor escolhido por medição, com a resolução por olho registrada
  contra o painel do Quest 3 (**2064 × 2208 por olho**), e ≥ 0,9 salvo
  justificativa medida. **Reprova:** valor nunca escrito.
  **Hoje: nunca chamado** (padrão 1.0 da three).
- **Fonte:** especificação WebXR (padrão 1.0, `getNativeFramebufferScaleFactor`
  informa o 1:1 real); a Meta cita **0,8–0,9** como recurso de último caso
  quando o app está GPU-bound.

### G4 · Texto e mira legíveis no aparelho
- **Mede:** tamanho angular do menor glifo de UI e do menor detalhe de mira
  (o vão da alça), em graus, na resolução real da sessão.
- **Como:** captura dentro da sessão + cálculo do ângulo subentendido; leitura
  humana de confirmação no headset.
- **Aprova:** alvo interativo ≥ **22 mm × 22 mm** com **12 mm** de espaçamento
  à distância de uso (equivalente da Meta: **3° de FOV a 0,42 m**); texto
  legível sem aproximar a cabeça. **Reprova:** qualquer painel ilegível.
- **Fonte:** Meta, *Hands Interaction Types* (22 mm/12 mm) e *Typography*
  (nunca menor que 14 px, confortável a partir de 18 px em painel 2D).
- **Nota honesta:** a Meta **não publica** um mínimo angular de texto para
  UI in-world; o número acima é o de alvo interativo, que é o que existe
  publicado. Por isso este critério tem uma parte humana obrigatória.

### G5 · Uma captura dentro da sessão por entrega
- **Mede:** o próprio quadro.
- **Como:** captura estéreo dentro da sessão imersiva emulada, arquivada em
  `output/vr/` por rodada, comparada com a rodada anterior.
- **Aprova:** um humano olha e não vê defeito grosseiro. **Reprova:** o
  contrário. Existe porque **contagem não é imagem**, e todo número deste
  documento pode estar verde com a tela feia.

---

## 9. Categoria H — HUD e UI dentro do mundo

### H1 · Nenhuma informação essencial vive só no DOM
- **Mede:** para cada item da lista, existência de representação em espaço de
  mundo visível na sessão.
- **Lista fechada:** vida · armadura · munição e pente · arma atual ·
  inventário · prompt de interação · retículo · minimapa · zona e tempo do BR ·
  contagem de vivos · feed de abates · chat · placar · tela de morte · menu ·
  pausa · lobby.
- **Aprova:** 100 %. **Reprova:** um item. **Hoje: 0 de 17.** Medido: objetos
  de HUD dentro do rig = 0; `#crosshair`, `#hud` e `#prompt` existem e estão
  "visíveis" — no DOM, que a sessão imersiva não desenha.
- **Fonte:** dentro de uma sessão `immersive-vr` sem `dom-overlay` o DOM
  simplesmente não chega ao compositor. E a crítica de porte preguiçoso ataca
  exatamente isto: *Skyrim VR* — *"a parte ruim foi o HUD, que não foi
  modificado do original feito para um Dualshock"*; *Fallout 4 VR* — o Pip-Boy
  *"infla para o dobro do tamanho… é distrativo e quebra a imersão."*
- **Queixa:** *"não consigo pegar o carro, abrir os baús"* (sem prompt) e *"a
  qualidade está horrível"*.
- **Por que a suíte não pega:** todos os testes de HUD leem `innerHTML` e
  `style.opacity` — que continuam corretos e continuam invisíveis. É o exemplo
  mais puro de teste que mede o dublê em vez do produto.

### H2 · UI não é colada na cara
- **Mede:** distância e ancoragem de cada painel.
- **Aprova:** painéis entre **0,45 m** (interação direta com a mão), **0,70 m**
  (mão + controle) e **1,0 m** (painel grande, interação indireta); ancoragem
  em mundo, corpo (com amortecimento) ou pulso — **nunca na cabeça**; nada mais
  perto que **0,75 m** para leitura demorada. **Reprova:** painel head-locked.
- **Fonte:** Meta, *MR design guideline*: 45 cm / 70 cm / 1 m, e literal:
  *"Evite prender conteúdo estilo HUD aos movimentos da cabeça do usuário"*.
  Oculus BP: foco confortável entre **0,75 e 3,5 m**, com **2,5 m** como
  distância segura; abaixo de 0,75 m as lentes desfocam. VRC.Quest.Functional.10
  (recomendado) manda evitar menus head-locked.

### H3 · O retículo não mente
- **Mede:** se existe retículo, ele coincide com o ponto de impacto real.
- **Aprova:** o retículo é **do mundo** (projetado no ponto de impacto do raio
  de tiro) ou não existe. **Reprova:** retículo fixo no centro da vista.
- **Fonte:** *Borderlands 2 VR* é o exemplo nomeado do defeito: *"as armas
  todas têm um retículo flutuante grande que você não pode desligar e que nem
  parece alinhado com as miras de ferro."*

---

## 10. Categoria I — Ausência de defeito grosseiro (a parte humana, roteirizada)

Estes quatro não viram número. Viram **roteiro**, executado no headset, com
resposta binária por linha. Roteiro sem resposta escrita não conta como
executado.

### I1 · Vinte minutos de partida real, sem tirar o aparelho
Roteiro, na ordem, com uma caixa por linha:

1. Abrir o jogo pelo atalho. Vejo gráfico rastreado em ≤ 4 s? ☐
2. Estou de pé, com os pés no chão, sem parte do corpo dentro da cabeça? ☐
3. Ando fisicamente 1,5 m nas quatro direções. O corpo veio junto? ☐
4. Encosto numa parede andando fisicamente. Ela me para? ☐
5. Giro quatro passos completos. A cabeça só girou, não deslizou? ☐
6. Ando com o analógico. A vinheta fecha e **abre por completo** ao parar? ☐
7. Levanto a arma. Ela está na minha mão, no ângulo da minha mão? ☐
8. Trago a arma ao olho. **Vejo pelo buraco da alça e a massa está no meio?** ☐
9. Atiro. Sinto o háptico na mão certa? ☐
10. Acerto o que estava alinhado na mira? ☐
11. Recarrego. Troco de arma. Chego nas 8 armas? ☐
12. Vejo vida, munição e o resto — dentro do mundo? ☐
13. Chego num baú. Vejo o destaque? Abro? ☐
14. Chego no carro. Entro? Dirijo com a cabeça livre? Saio de pé no chão? ☐
15. Entro numa partida de BR. Pulo da nave? Abro o paraquedas? ☐
16. Abro um baú do BR? ☐
17. Morro. Vejo a tela de morte dentro do mundo? Saio dela? ☐
18. Pauso. Volto. Abro o menu. Saio da partida. Tudo sem tirar o aparelho? ☐
19. Tiro o aparelho da cabeça por 10 s e volto. O jogo pausou e voltou? ☐
20. Vinte minutos depois: continua a 72 fps, sem esquentar a ponto de cair? ☐

**Aprova:** 20 de 20. **Reprova:** 19.

### I2 · Zero erro de console durante a sessão inteira
- **Como:** coletar `pageErrors`/`consoleErrors` do harness na sessão de 20 min.
- **Aprova:** zero. **Reprova:** um.

### I3 · Nada atravessa a câmera
- **Como:** amostrar, a cada frame do roteiro, a distância do olho a qualquer
  geometria renderizada.
- **Aprova:** nada dentro de **0,15 m** do olho, exceto a vinheta de conforto
  (que é intencional e é a única exceção declarada). **Reprova:** qualquer
  intrusão — arma, corpo, terreno, parede, grama.

### I4 · Nenhum estado sem saída
- **Como:** partindo de cada estado (menu, lobby, nave, queda, jogando,
  dirigindo, morto, espectador, pausado, fim de partida), tentar chegar ao
  menu usando só os controles.
- **Aprova:** todos alcançam. **Reprova:** um beco. **Hoje: quase todos são
  beco** — a sessão entra direto em partida e não há caminho de volta.

---

## 11. O que este documento NÃO afirma

Honestidade sobre as fontes, porque critério com número inventado é pior que
critério nenhum:

- **A duração da piscada do giro não tem padrão de indústria.** A pesquisa não
  encontrou UM jogo do gênero que publique um número de fade em ms; o padrão
  observado é **corte instantâneo, sem fade**. Por isso A1 cobra a **translação**
  (que tem física por trás) e a piscada aparece só como refinamento, não como
  portão.
- **Não existe uma velocidade angular "enjoativa" única.** A literatura vai de
  ~2°/s (limiar de percepção vestibular) a ~90°/s (teto de projeto citado por
  blogs de indústria). Por isso o critério de giro é **passo discreto +
  ausência de translação**, não um °/s.
- **Não existe constante pública da Meta para o offset olho→pescoço.** Os
  campos existem no SDK; os valores não estão publicados. Por isso C5 aceita
  "sem corpo" como resposta legítima — que é o que a Valve escolheu, e disse
  por quê.
- **A Meta não publica mínimo angular de texto in-world.** G4 usa o número de
  alvo interativo (22 mm/12 mm ≡ 3° a 0,42 m), que é o que existe, e mantém
  uma confirmação humana.
- **Os números de draw call/triângulo da Meta divergem entre três páginas
  oficiais.** Adotado o mais apertado, e o teto interno do repo (180/500 k) é
  ainda mais apertado que ele.
- **A taxa padrão do WebXR no Quest 3 precisa ser confirmada no aparelho.** A
  doc da Meta diz 90 fps no Quest 2 e 72 nos "outros"; a sessão emulada aqui
  nasceu a 90. Por isso E1 exige **declarar** a taxa em vez de confiar no
  padrão.

---

## 12. Meu procedimento de validação (reexecutar a cada rodada)

Ordem fixa. Para na primeira reprovação e devolve a rodada — não segue para
"ver se o resto passa".

### Passo 0 — condição da máquina (senão não é medida)
```
uptime                       # load de 1 min < 1,5, senão espera
git -C /home/reis/repos/FPS-WillianIA log --oneline -1
git -C /home/reis/repos/FPS-WillianIA status --short
```

### Passo 1 — leitura estática (30 s, pega 6 dos defeitos de hoje)
```
cd /home/reis/repos/FPS-WillianIA
grep -rn "setFoveation\|setFramebufferScaleFactor\|updateTargetFrameRate" js/ game.js
grep -n  "antialias" game.js
grep -rn "hapticActuators" js/ game.js br-game.js
grep -rn "getControllerGrip" js/ game.js
grep -n  "addEventListener('keydown'" br-game.js game.js
grep -rn "player.pos" js/interact.js
grep -c  "dev.position" test/xr-*.test.js
```
Reprova na hora se: foveação/escala/taxa continuam sem chamada · `antialias:
false` sem MSAA declarado em XR · zero háptico · a arma continua em
`targetRaySpace` · `br-game.js` continua com listener de DOM para ação de jogo ·
`interact.js` continua medindo de `player.pos` · **nenhum teste escreve
`dev.position`** (se a suíte nova não move a cabeça, ela não pode ter provado
nada dos critérios A1, C1, C2, C3 e D2).

### Passo 2 — sessão imersiva emulada: as medições numéricas
```
node scripts/vr-emulado.js --port=3411 --seconds=12
```
→ colhe draw calls e triângulos em estéreo (E2).

E as sondas de defeito (arquivo temporário fora do repo, nunca commitado —
usa `test/helpers/iwer.js` → `bootEmVR`, portas 3417/3419/3421/3423):

- **giro:** `dev.position = (0,5; 0,5)` → snap → deslocamento da cabeça (A1)
- **corpo:** passo físico de 1,44 m → deslocamento do colisor e separação (C2)
- **altura:** 5 pontos num quadrado de 2 m → folga cabeça↔chão (C1)
- **arma:** distância arma↔grip no quadril, no ADS, e deriva parado/andando
  (B1, B2, B4)
- **conforto:** pico e duração da piscada; túnel parado e andando (A5)
- **HUD:** objetos de HUD dentro do rig; itens essenciais só no DOM (H1)
- **foco:** `updateVisibilityState('visible-blurred'|'hidden')` (F2)
- **recentrar:** `dev.recenter()` (F3)
- **interação:** roteiro de D1 executado por controle, aferindo EFEITO (D1, D2)

### Passo 3 — a peneira de testes do repo
```
npm run lint
npm run test:vr
```
Verde não aprova nada — apenas libera o passo 4. Falha vermelha, re-rodar só o
arquivo isolado 2–3× antes de chamar de regressão (regra do repo).

### Passo 4 — o aparelho (única fonte de TEMPO)
```
adb devices && adb reverse --list
adb shell am broadcast -a com.oculus.vrpowermanager.prox_close
npm run vr:baseline -- --target=quest --immersive=1 --seconds=1200
adb logcat -s VrApi:V -v brief | tee output/vr/vrapi-$(date +%s).log
adb shell am broadcast -a com.oculus.vrpowermanager.automation_disable   # SEMPRE
```
→ E1 (72 travado, nada abaixo de 60), E3, E4, E5, F1 (4 s com cache frio, N ≥ 7).
Antes de qualquer conclusão: **uma aba só** (`curl -s
http://127.0.0.1:9222/json/list | grep '"url"'`) e `XR.presenting === true`
confirmado na página — sonda sem esse portão já mentiu cinco vezes seguidas
neste projeto.

### Passo 5 — a parte humana (não delegável)
Executar o roteiro I1 no headset, marcando as 20 caixas, e arquivar a folha
preenchida na rodada. **Sem as 20 caixas marcadas por um humano, a rodada não
está validada** — independentemente de quantos testes ficaram verdes.

### Passo 6 — veredito
Uma linha por critério (A1…I4), verde ou vermelho, com o número medido ao lado.
Um vermelho = rodada devolvida, com o número e a condição da medição escritos.
Sem "quase", sem "só falta", sem média.
