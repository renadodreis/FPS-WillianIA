# Critério de aceite triplo A — porte para CELULAR (toque, BR multiplayer)

Data: 2026-09-27 · branch `dev` · base lida: `c585806`
Autor deste documento: o **validador**. Não escreve código, não escreve teste.
Escreve o que reprova.

> **A árvore andou enquanto esta régua era escrita.** A leitura começou em
> `2a070b0` e terminou em `c585806`: nesse meio entraram os bots (`6b03524`,
> `37b5ca5`, `5254ce4`) e o toque (`19ca181`, `cd362af`, `c585806`). A régua
> **não foi ajustada a eles** — os limiares vêm das fontes. O que esses commits
> dizem ter medido aparece aqui como **"alegado, não verificado"**. Nada foi
> executado para escrever este documento (os construtores ocupavam as portas):
> toda "linha de base" abaixo é LEITURA de código ou CONTA, e está marcada assim.

> **Revisão 2026-09-28 — decisões do dono, escritas pelo validador (autor da
> régua).** Duas mudanças, e só elas: (1) em **M1**, a grandeza da BAZUCA foi
> trocada — o limiar antigo era inalcançável por construção no quadril e media o
> asset, não defeito; (2) critério NOVO **B14** ("quem espia não é imune"), com o
> escopo de **B1/B2** delimitado para não contradizê-lo. Nenhum outro limiar foi
> tocado. O motivo está escrito em cada critério. Denominador: **54** (61 no total).

> **Revisão 2026-09-28 (tarde) — relato do dono jogando no celular, virou régua.**
> Seis frases, escritas aqui como ele disse, e os critérios que as medem:
> (1) *"a sensibilidade ali na movimentação deve ser melhorada"* → **M7**, **C11**;
> (2) *"o ET está muito forte pra matar ele"* → **P1**;
> (3) *"a mira não fica vermelha quando apontada aos inimigos"* → **C12**;
> (4) *"precisa ver nos prédios, se temos bugs, como os bichos te matarem através
> da parede"* → **P2**, **P4** (e B7, que já existia);
> (5) *"eles não deveriam conseguir te pegar ou te dar dano se você está no
> helicóptero"* → **P3**;
> (6) *"os baús não estavam abrindo no celular e nem estavam conseguindo entrar e
> sair do carro"* → **E15** (e E4, que já existia).
> Nenhum limiar antigo foi tocado. Denominador: **62** (69 no total).

---

## 0. As regras que governam este documento

A queixa do dono, que é a razão de esta régua existir, jogando **no celular**:

> *"jogabilidade do celular não está boa, os bots estão apelões, a mira segue
> ruim, longe do triplo AAA"*

Regras, herdadas da régua do VR (`docs/vr/criterio-aaa.md`) sem margem:

1. **Um critério reprovado reprova a entrega inteira.** Não existe "passou em
   61 de 62", não existe "esse é menor", não existe média.
2. **Teste verde não prova tela certa.** Todo critério traz o campo **"por que a
   suíte atual não pega"**. Critério que não sabe responder isso não entra.
3. **Todo critério traz o defeito a reinjetar.** Se a sonda ou o teste não fica
   vermelho com o mutante, com número, ele não mede nada (CLAUDE.md: "teste que
   passa por acidente" já apareceu dez vezes nesta base).
4. **Âncora independente do código sob teste.** A retícula é o centro do
   canvas (projeção do three), não a função que gera o raio; o que a tela mostra
   são pixels, não o `rayBlockedAt` que o produto também usa; o que o bot fez é o
   que o SERVIDOR entregou ao humano, não o pacote que o bot montou.
5. **Medição sem condição declarada não é medida** (máquina ociosa, seed,
   viewport, idade do mundo — CLAUDE.md, "Lições de método").
6. **Fonte em todo número.** `[LASTRO]` = a referência diz; `[INFERÊNCIA]` =
   conta ou número de partida do validador, aceito contra-argumento **com
   medida**; **decisão do dono** = produto, com o número provisório escrito.
7. **Quem constrói não edita a régua.** Argumenta no relatório.
8. **"Não medido" = não aprovado.** Critério automatizável que a rodada não
   mediu conta como vermelho.

### O diagnóstico da suíte, em uma frase

**Ela nunca tira o dedo do lugar.** Todo teste de toque boota direto em partida,
no chão, num viewport só (844×390), com o lobby ESCONDIDO pelo helper
`semLobby` para o hit test funcionar; nenhum passa pela nave (o
`startBRMatch` pula a nave de propósito — CLAUDE.md); os números de olhar e de
tiro-que-arrasta são conferidos contra `Touch.lookSens`/`pointerSpeed` lidos do
próprio produto; os casos de "alvo escondido" da assistência usam como âncora o
MESMO `rayBlockedAt` que o produto usa; e o combate dos bots é medido num dublê
de servidor, não no processo real contra o `server.js` real. É o buraco de
**cobertura de ESTADO** que CLAUDE.md registrou no rig de rodas, e o de
**dublê em vez da plataforma** que custou cinco rodadas no VR.

### Formato de cada critério

- **Mede** — a grandeza física e a unidade.
- **Limiar** — aprova/reprova, e a **Fonte** do número.
- **Como** — cenário, viewport, âncora independente.
- **Por que a suíte atual não pega.**
- **Reinjetar** — o mutante que TEM de avermelhar, e o número esperado.
- **Hoje** — leitura ou alegação, sempre marcada; nunca "medido" sem medida.

### Condições comuns a toda medição automatizada

- **Viewports** (escolha do validador: as duas menores alturas em uso, que é
  onde o `style.css` documenta invasões, mais o da suíte, o maior celular e um
  tablet), todos com `hasTouch`, `isMobile`, DPR 2:
  **V1** 667×375 (iPhone SE) · **V2** 800×360 (Android 360 dp) · **V3** 844×390
  (iPhone 14, o da suíte) · **V4** 932×430 (iPhone Pro Max) · **V5** 1180×820
  (iPad Air) · **VR** 390×844 retrato liberado por JOGAR ASSIM.
- Toque: `PointerEvent` com `pointerType: 'touch'` despachado nos elementos —
  nunca `KeyboardEvent` escrito pelo teste, nunca escrita direta em `keys`/`mouse`.
- Seed 424242; idade do mundo declarada (validação 2026-08-08 §G0: o mesmo
  cenário dá 314 ou 761 draw calls conforme a idade).
- Máquina ociosa: load 1 min < 1,5 e `ps -eo pid,etime,cmd | grep run-tests`
  vazio, conferido ANTES de rodar (CLAUDE.md, placar de agente com processo vivo).

---

## 1. Linha de base — leitura e alegação, não medida

| Grandeza | Antes desta frente (leitura/conta, `2a070b0`) | Alegado pela entrega (não verificado) | Onde precisa estar |
|---|--:|--:|--:|
| Giro por px de arrasto | 0,1833 °/px, linear | "100 px no ATIRAR = 18,335°" (`cd362af`) | = valor do menu ± 1 %, igual a 30/60/120 Hz (M3) |
| Razão vertical/horizontal | **1,00** | 0,60 (`cd362af`) | [0,33; 0,60] (M5) |
| ADS: tela andada por px, relativo ao quadril — red dot / DMR / luneta 2x | **1,29 / 1,20 / 0,85** | "tangente a 4 casas" (`cd362af`) | 1,00 ± 3 % (M4) |
| ATIRAR gira a câmera | não | sim (`cd362af`) | C1 |
| Assistência de mira | nenhuma | slow + pull; rastreio 1,281° → 0,797° (`c585806`) | A1–A8 |
| Assistência com MOUSE sob `?mobile=1` | — | **portão é `Touch.enabled`; `pointerType` não é lido** (leitura de `applyTouchLook`) | 0 (A1-b) |
| Assistência na nave / queda / espectador | — | **portão exclui XR, carro, voo e `player.dead`** — e `enterSpectator()` devolve `player.dead = false` (leitura) | 0 (A1-e) |
| Visibilidade usada pela assistência | — | `rayBlockedAt` + regra de altura da grama 1,33 m (leitura de `js/aimassist.js`) | 0 px na tela ⇒ 0 efeito (A2) |
| Toque em canvas nu → `mousedown` de compatibilidade | **dispara** (47,1 % da tela é canvas nu, medido em 2026-08-08; `game.js` escuta `mousedown` na `window` sem olhar o tipo de ponteiro) | inalterado em `c585806` (leitura) | 0 disparos (C5) |
| Toques para trocar para a arma *j* (BR, 8 armas) | **até 7** (`style.css` registra) | inalterado | 1 (C7) |
| Botões sempre na tela | 14 (13 fora do BR) | + 2º ATIRAR opcional | contextuais (C8) |
| Bot: 1º disparo depois de entrar no alcance | **≤ 0,1 s** (`lastShot = -Infinity`, tick de 100 ms) | 1º DANO mín. 4,90 s a 30 m — **num dublê** (`37b5ca5`) | disparo ≥ 1,3 s; dano ≥ 3,25 s a 30 m — **no caminho real** (B1, B2) |
| TTK de 1 bot, humano parado sem colete | ~4,6 s (conta da referência) | 10,65 s — dublê | ≥ 6,0 s (B3, decisão do dono) |
| Bots acertando o mesmo humano na mesma janela de 1 s | 4 | 1 — dublê | ≤ 1 (B4) |
| Humano atrás de morro | 204 acertos (alegado) | 0 — dublê, morro gaussiano analítico | 0 no relevo REAL (B6) |
| Humano atrás de prédio | bot vê | **bot vê** — "P3 fora desta entrega" (`37b5ca5`) | 0 (B7) |
| Postura do humano chega ao bot | não | **não** (P3) | fator ×2 (B10) |
| Processo dos bots | `stdio: 'ignore'` | stderr herdado (`5254ce4`) | B12 |
| Draw calls, BR entrada, viewport de celular | 440 (medido em `091d5a7`) | não medido | ≤ 466 (D2) |
| Tempo de frame em aparelho | **nunca medido** | nunca medido | p50 ≤ 16,7 ms (D1) |

---

## 2. M — Mira e tiro

### M1 · A bala passa pela retícula no celular — toda arma, todo caminho de tiro, com o dedo em movimento *(REGRESSÃO)*
- **Mede:** distância (cm) e desvio (px de tela) entre o ponto por onde a bala
  passa e o centro da retícula, a 10, 25 e 50 m, congelados no instante do
  disparo.
- **Limiar:** ≤ 1 cm e ≤ 1 px no hitscan (modo solo) e no projétil do BR.
  Reprova: qualquer arma, postura ou distância acima.
- **Limiar da BAZUCA (reescrito em 2026-09-28, decisão do dono).** Contrato do
  CLAUDE.md: projétil VISÍVEL nasce na BOCA e voa PARALELO à linha de mira;
  zeragem pelo primeiro obstáculo é proibida. Então o foguete NÃO passa pelo
  centro da retícula — passa a uma distância constante dele, igual ao
  deslocamento da boca, e é isso que se cobra. Com a mesma âncora de M1 (câmera
  do quadro do disparo) e a boca CONGELADA no instante do tiro
  (`canoPosDoTiro()`), em quadril e em ADS, nas mesmas posturas e movimentos:
  - **(a) origem na boca:** distância da origem do foguete à boca congelada
    ≤ 1 cm;
  - **(b) paralelo à linha de mira:** o afastamento entre a reta do foguete e o
    eixo da mira (a câmera no quadril; a linha da mira ativa em ADS) varia
    **≤ 1 cm entre 10, 25 e 50 m** (máx − mín) — equivale a ≤ 0,015° entre as
    duas retas;
  - **(c) o afastamento é o da própria boca:** esse afastamento difere
    ≤ 1 cm da distância perpendicular da boca congelada ao eixo da mira NO MESMO
    quadro (medido: ~26 cm no quadril, ~13 cm na mira — é geometria do modelo,
    não entra como número fixo).
  **Por que mudou:** o limiar antigo ("≤ altura de alça da mira ativa + 1 cm")
  é inalcançável no quadril — lá não há alça, e o foguete paralelo passa a
  ~26 cm do centro por construção. Media o ASSET (o deslocamento da arma) e
  chamava de comportamento; nenhuma mudança em `fire()` o fechava (a mesma lição
  do B7 do VR no CLAUDE.md). A grandeza nova descreve o defeito que existiu
  (convergência e deriva) e não afrouxa nada do contrato.
- **Fonte:** geometria (CLAUDE.md, "A mira é geometria, não gosto"); regressão
  do defeito de 29–31 cm no quadril corrigido em `2ed48e7`.
- **Como:** V2 e V3 com `?mobile=1`; as 8 armas × {quadril, ADS pelo botão
  MIRA} × {parado, andando pelo analógico, correndo no talo, **com o polegar
  arrastando o ATIRAR** (C1), **com a assistência agindo** (A7)}; nos dois modos
  (solo = hitscan de `fire()`; BR = `__BR_ballistics`) e a bazuca. Espalhamento
  zerado só durante a medida. Âncora: `camera.matrixWorld` amostrado DEPOIS do
  render do frame do disparo (CLAUDE.md, "congele no instante do evento"),
  projetado para pixels, contra o centro do canvas; na bazuca, a âncora `muzzle`
  congelada (`canoPosDoTiro`).
- **Por que a suíte não pega:** `test/br-mira-projetil.test.js` boota viewport de
  desktop sem `?mobile=1`, mede só as 4 armas de projétil do BR, só parado, e
  nunca o hitscan do solo nem o tiro com o dedo em movimento. O celular em
  paisagem 2,16:1 leva o FOV horizontal de 91° a 118° (validação 2026-08-08
  §F2) e muda o deslocamento da arma na tela — é justamente o viewport que o
  teste não usa.
- **Reinjetar:** (1) em `fire()`, passar `_v3` (a boca) em vez de `_rayOrig` a
  `__BR_ballistics` → 29–31 cm no quadril (número de `2ed48e7`). (2) Aplicar o
  giro do toque DEPOIS de `fire()` no frame → erro proporcional ao arrasto
  daquele frame; o caso "dedo em movimento" tem de avermelhar e os casos parados
  não. **Bazuca:** (3) ZERAGEM de volta (direção = ponto de 120 m ou primeiro
  obstáculo na linha de mira − boca) → o afastamento converge (medido em
  `7515734`: 23,7 → 20,4 → 15,0 cm a 10/25/50 m no quadril) → vermelho em (b);
  (4) foguete nascendo no OLHO (`_rayOrig`) → afastamento ~0 contra ~26 cm da
  boca → vermelho em (a) e (c) — e é o caso que detonou a 0,39 m da cabeça
  (42 de dano, CLAUDE.md); (5) direção pelo CANO em vez da linha de mira → deriva
  com o recuo → vermelho em (b).
- **Hoje (bazuca, medido em `6aeda6c`, laudo §2):** 25,85 cm no quadril e
  13,09 cm em ADS, constantes nas três distâncias.

### M2 · Velocidade da bala medida no VOO, não na tabela *(REGRESSÃO)*
- **Mede:** tempo (s) do projétil simulado até 100 m e queda (cm) a 100 m, lidos
  da trajetória que `br-game.js` integra.
- **Limiar:** fuzil, DMR e sniper leve: ≤ 0,15 s e ≤ 10 cm. O plasma fica de
  fora (arma de energia, lenta por desenho — decisão registrada em `6578884`).
- **Fonte:** Apex R-301 736 m/s, PUBG M416 ~880 m/s, fuzis do Fortnite hitscan
  (citados em `test/br-mira-projetil.test.js`); conta: 0,15 s a 100 m ≡ ≥ 667 m/s.
- **Como:** partida BR, disparo real contra uma parede sólida posta a 100 m; tempo
  entre o disparo e o `FX.burst` do impacto, e altura do impacto contra a reta de
  lançamento. Alternativa: amostrar a posição da bala por frame.
- **Por que a suíte não pega:** o segundo caso de `br-mira-projetil.test.js` lê
  `gun.projSpeed` do objeto ENTREGUE e calcula `100 / v` e `0,5·g·t²` no próprio
  teste — mede a tabela. Se `__BR_ballistics` ignorar `gun.projSpeed` (constante,
  teto, `dt` errado na integração), o teste continua verde.
- **Reinjetar:** em `__BR_ballistics`, `v: dir.clone().multiplyScalar(200)` →
  previsão: o teste atual fica **verde**; este critério vai a 0,50 s e 81 cm.

### M3 · Olhar por toque: ângulo proporcional ao arrasto, igual a qualquer taxa de quadros
- **Mede:** Δyaw e Δpitch (graus) da câmera por px CSS de arrasto no `#tcLook`.
- **Limiar:** (a) Δyaw = N × s ± 1 %, com *s* = o valor que o MENU mostra ao
  jogador, convertido em °/px; (b) o mesmo arrasto dá o mesmo ângulo ± 1 % com o
  laço a 30, 60 e 120 Hz; (c) 120 px entregues em 1 evento ou em 120 eventos de
  1 px dão o mesmo ângulo ± 0,1 %; (d) soltar o dedo não gira nada no frame
  seguinte (≤ 1e-9 rad); (e) curva linear no padrão.
- **Fonte:** Critical Ops 1.70, *"Fixed aim acceleration being dependent on
  framerate"* — um AAA de toque publicou exatamente este defeito; linear por
  padrão: `referencia-mira-toque.md` §3.1 (aceleração no toque só documentada no
  Critical Ops, 3 %).
- **Como:** V3; âncora = yaw/pitch extraídos de `camera.matrixWorld`; *s* lido do
  controle do menu (C9), nunca de `Touch.lookSens`; variar o `dt` do laço.
- **Por que a suíte não pega:** os casos de olhar e de ATIRAR de
  `touch-controls.test.js` calculam o esperado com `sens` lido de
  `G.Touch.lookSens` — o produto comparado com o próprio produto (formato 2 do
  CLAUDE.md): se o menu mostrar 100 % e o jogo aplicar 200 %, passa. E rodam num
  `dt` só: um fator `dt·60` escondido passa.
- **Reinjetar:** multiplicar o delta por `dt*60` em `applyTouchLook` → suíte
  verde (dt fixo), (b) vermelho com ±100 % entre 30 e 60 Hz.

### M4 · Mira (ADS): o mesmo arrasto anda a mesma distância NA TELA em toda luneta
- **Mede:** razão R = (px de tela que um ponto perto do centro anda) / (px de
  arrasto), no quadril e em cada mira/acessório, com o FOV assentado.
- **Limiar:** R(mira) = R(quadril) × m_ADS ± 3 %, com m_ADS = multiplicador global
  de ADS do menu (padrão 1,00). É o mesmo que escalar pela razão das tangentes
  `tan(fov/2)/tan(fov_base/2)`. Sprint (85°) e volante (72°): medir e declarar no
  laudo, sem portão (decisão do dono).
- **Fonte:** Lyra (Epic) escala TOQUE e controle por `TanHalfFOV / BaseTanHalfFOV`
  — *"This is the proper way to scale based off FOV changes"*; Fortnite gyro
  *"scaled by zoom level"* (`referencia-mira-toque.md` §3.3).
- **Como:** V3; ponto fixo do mundo a 30 m, a ~2° do centro; arrasto de 20 px;
  projeção pelo `camera.projectionMatrix` do frame — a âncora é a projeção do
  three, não o multiplicador do jogo; esperar o FOV assentar (damp 11/s →
  0,6 s = 99,8 %).
- **Por que a suíte não pega:** o caso (f) de `touch-controls.test.js` mede o
  giro em RADIANOS contra `tan(gun.adsFov)` e `Touch.lookSens` do produto — prova
  a fórmula, não a tela. Se a luneta desenhar com outro FOV (overlay, câmera de
  escopo) a tela anda diferente e o caso continua verde.
- **Reinjetar:** voltar o degrau `lerp(1, adsFov < 40 ? 0.36 : 0.75, ads)` no toque
  → red dot 1,29, DMR 1,20, 2x 0,85 (tabela da referência §3.3).

### M5 · Eixo vertical mais lento que o horizontal, e diagonal sem torção
- **Mede:** (a) razão Δpitch/Δyaw para arrastos de mesmo comprimento em Y e em X;
  (b) direção angular produzida contra a pedida, em 16 direções de arrasto.
- **Limiar:** (a) padrão em **[0,33; 0,60]**, ajustável num controle separado do
  X; (b) direção produzida = atan(r·tan θ) ± 0,5° nas 16 direções, inclusive
  22,5° fora dos eixos, longe do clamp de pitch.
- **Fonte:** Insomniac 210/70 °/s = 0,33; Critical Ops toque 1,2/3,0 = 0,40;
  Lyra pitch = yaw × 0,6 (referência §3.2); eixos separados: WZM, Critical Ops
  1.32. (b): lição do VR no CLAUDE.md — zona morta por eixo torceu a diagonal
  9,79° e o teste de eixo puro não via.
- **Como:** V3, pitch inicial 0, arrastos de 60 px; âncora `camera.matrixWorld`.
- **Por que a suíte não pega:** o caso antigo de olhar só exige pitch "subir mais
  que 0,1" e travar em 1,55; o novo mede a diagonal "ao milésimo" contra a razão
  lida do produto — não contra o que o menu mostra.
- **Reinjetar:** razão 1,00 → (a) vermelho; quantizar o arrasto em 8 direções →
  (b) vermelho com 22,5°.

### M6 · A retícula só aparece quando diz a verdade — em todo estado
- **Mede:** em cada estado em que `#crosshair` tem opacidade > 0: se o tiro é
  possível, e a distância do impacto ao centro da retícula.
- **Limiar:** retícula visível ⇒ tiro possível E impacto a menos que o raio da
  menor esfera de acerto de um avatar remoto (a cabeça, lida de `hitSpheres()`)
  em 10/25/50 m. Retícula visível sem tiro possível, ou que erra uma cabeça
  centrada nela: reprova.
- **Estados:** correndo, agachado, na luneta, dirigindo (hoje escondida),
  **voando** (`js/heli.js`: *"dá pra atirar da porta do helicóptero"*; a origem
  vai para o helicóptero e a câmera é de perseguição 10,5 m atrás), na nave, em
  queda, de paraquedas, espectador.
- **Fonte:** régua do VR, H3 (*Borderlands 2 VR*: retícula desalinhada é defeito
  nomeado); âncora = geometria do ALVO, não o código do tiro.
- **Por que a suíte não pega:** nenhum teste de mira sai de "a pé"; `game.js`
  esconde a retícula só com `state.driving`, e ninguém mediu o tiro do
  helicóptero contra ela.
- **Reinjetar:** tirar o deslocamento da origem para o helicóptero (o tiro sai
  da câmera de perseguição) → vermelho voando.

### M7 · O dedo DE VERDADE gira o que o menu promete — e a aceleração, se ligada, não depende do quadro *(novo, 2026-09-28)*
- **Relato do dono:** *"a sensibilidade ali na movimentação deve ser melhorada"*.
  M3 mede o olhar com `PointerEvent` sintético e tique manual; o dono joga com o
  pipeline do navegador (eventos agrupados, 120–240 Hz de amostragem no
  aparelho) e o laço no rAF. Este critério mede ESSE caminho.
- **Mede:** Δyaw (graus) por px de arrasto no `#tcLook` feito pelo toque do
  DevTools (`Input.dispatchTouchEvent`), com o jogo rodando no próprio rAF (sem
  tique manual); com a "Aceleração do olhar" do menu em 0 % e em 100 %.
- **Limiar:** (a) aceleração 0 % (o padrão): 300 px arrastados em 0,15 s e em
  1,5 s dão o mesmo giro ± 2 %, igual a 300 × s ± 2 % (s = o valor do menu, M3);
  (b) aceleração 100 %: arrasto lento (≤ 300 px/s) com ganho 1 ± 5 %; arrasto
  rápido (≥ 1 500 px/s) com ganho entre 1,5 e 2,0; (c) o mesmo arrasto no mesmo
  tempo dá o mesmo giro ± 5 % com o laço a ~30 e a ~60 quadros/s (CPU
  estrangulada pelo DevTools); (d) a faixa do slider de olhar vai de ≤ 0,5× a
  ≥ 2× o padrão.
- **Fonte:** relato do dono (2026-09-28); Critical Ops 1.70, *"Fixed aim
  acceleration being dependent on framerate"* (referência de mira de toque §3.1);
  linear no padrão (M3e). Os números 300/1 500 px/s e o teto 2,0 são os de
  `LOOK_ACCEL` (libpointing, Casiez et al. — citados pelo construtor em
  `8506731`, **não conferidos pelo validador**); ± 2 % no toque real é
  **[INFERÊNCIA]** (arredondamento de coordenada do evento).
- **Por que a suíte não pega:** M3 e o teste de toque usam `PointerEvent`
  sintético e tique manual — o agrupamento de eventos e o relógio do evento
  nunca passam.
- **Reinjetar:** medir a velocidade do dedo pelo `dt` do QUADRO em vez do relógio
  do evento → (c) vermelho; ganho fixo 2 → (b) vermelho no lento.

---

## 3. A — Assistência de mira e tiro automático

Toda assistência "ausente" passa por construção em "nunca assiste o invisível".
Por isso **todo caso negativo desta seção tem um controle positivo**: o mesmo
cenário, com o alvo visível e o dedo mexendo, tem de mostrar efeito ≠ 0 — senão
o caso não exercita nada (formato 1 do CLAUDE.md).

**Efeito da assistência** = quaternion da câmera com a assistência LIGADA menos o
quaternion com ela DESLIGADA pelo menu, mesmo cenário, mesmo seed, mesma entrada.

### A1 · Assistência só para o dedo, e só com o dedo mexendo
- **Mede:** efeito da assistência (rad).
- **Limiar:** **0 bit a bit** em: (a) desktop com mouse; (b) `?mobile=1` com
  `pointerType: 'mouse'` ou `'pen'` arrastando `#tcLook`/ATIRAR; (c) sessão XR;
  (d) toque SEM entrada nenhuma por 3 s com alvo cruzando a retícula; (e) nave,
  queda, paraquedas, carro, helicóptero, morto, **espectador**, pausa, menu,
  cinemática da cidade. Controle positivo: o mesmo (b) com `pointerType:
  'touch'` dá ≠ 0.
- **Fonte:** Critical Ops *"disabled aim assist when playing with a mouse and
  keyboard"*; Halo, magnetismo só no controle; Lyra: modificador de gamepad/toque
  com `bRequireInput = true`; Insomniac 28:16 *"disabled aim assist if you weren't
  touching the sticks"*; Fortnite *"Gyro Aiming on disables aim assist"*
  (referência §1.2–§1.5).
- **Âncora:** o `pointerType` do evento e a câmera.
- **Por que a suíte não pega:** `test/aim-assist.test.js` cobre o desktop com
  mouse; não cobre mouse sob `?mobile=1`, XR, nem nenhum estado do BR (nave,
  queda, espectador) — o helper de toque dos testes só despacha
  `pointerType: 'touch'`.
- **Reinjetar:** tirar `bRequireInput` → (d) vermelho.
- **Hoje (leitura de `c585806`):** (b) provável vermelho — o portão é
  `Touch.enabled`, e `onLookDown` aceita qualquer ponteiro: desktop com
  `?mobile=1` arrastando com o MOUSE ganha assistência com precisão de mouse.
  (e) provável vermelho no espectador (`enterSpectator()` faz `P.dead = false`)
  e na nave/queda (nada no portão olha a fase do BR).

### A2 · Nunca assiste quem a TELA não mostra
- **Mede:** efeito da assistência (rad) quando o alvo tem **0 px visíveis** no
  frame desenhado.
- **Limiar:** 0 px ⇒ efeito 0 bit a bit. Controle positivo: o mesmo alvo, 1 m ao
  lado e visível, recebe efeito ≠ 0.
- **Cenários:** atrás de parede da cidade; atrás de crista do terreno; **deitado
  e agachado no mato denso**; **atrás de veículo parado**; **atrás de copa de
  árvore/folhagem**; além do fim da névoa do preset celular (150 m); fora do
  frustum; `visible = false`; corpo morto.
- **Âncora (independente do teste de visibilidade do produto):** renderizar o
  MESMO frame duas vezes, com o alvo e com o alvo oculto, tempo congelado
  (o congelamento de `test/world-drawcalls.test.js`, vento da grama parado), e
  contar os pixels que mudam dentro da caixa projetada do alvo.
- **Fonte:** The Finals *"Aim assist will ignore invisible players"*; WZM *"no
  enemies are visible through walls"*; Lyra `bIsVisible`; CLAUDE.md: a lâmina de
  grama 35 % mais estreita foi WALLHACK deployado contra quem está deitado no
  mato — assistência que gruda em quem o mato esconde é a mesma classe de
  vazamento.
- **Por que a suíte não pega:** os casos "(c) alvo escondido" de
  `aim-assist.test.js` decidem o que está escondido com `MP.rayBlockedAt` — o
  MESMO raio que o produto injeta na assistência. O produto é medido com a régua
  do produto: tudo que `rayBlockedAt` não conhece (veículo? folhagem? — a medir)
  é invisível para o teste e para a assistência ao mesmo tempo. A grama só tem
  caso no núcleo (`aim-assist-core.test.js`), e o núcleo decide "escondido no
  mato" por uma regra de ALTURA (parte a ≥ 1,33 m do chão = vista), sem saber
  se ali há mato nem o que a tela desenha.
- **Reinjetar:** (1) visibilidade = `true` → vermelho em todos; (2) tirar a regra
  da grama e deixar só o raio → vermelho SÓ no caso do mato — prova que esse caso
  não é segurado por outro guarda (formato 6).

### A3 · Janela angular pequena, e que encolhe com o zoom
- **Mede:** maior distância angular (graus) entre o centro da retícula e a BORDA da
  silhueta projetada do alvo em que o efeito ainda é ≠ 0.
- **Limiar:** ≤ 3,0° no quadril; em ADS ≤ 3,0° × tan(fov_ADS/2)/tan(fov_base/2).
- **Fonte:** Destiny 2, o cone mais largo publicado para arma primária, *"3
  degrees at 100 AA"*; Lyra, caixa externa ≈ 0,76° além da silhueta e alcance
  *"scaled using the field of view"* (referência §1.2, §1.6). Acima do teto
  publicado é tranca de mira, que a literatura chama de *"too obvious"*
  (Vicencio-Moreira).
- **Como:** alvo parado; o arrasto passa a 0,5/1/2/3/4/6° da silhueta; efeito
  contra a assistência desligada.
- **Por que a suíte não pega:** o núcleo testa a rampa das zonas contra as
  constantes do próprio núcleo (`OUTER_DEG`); nenhum teste mede a janela na tela
  e no zoom.
- **Reinjetar:** margem fixa em GRAUS sem escalar pelo FOV → vermelho na luneta
  da DMR (26°), onde 3° ocupam ~3× mais tela.

### A4 · O puxão é fração do giro necessário: nunca passa do alvo, nunca arranca a vista
- **Mede:** por frame, ρ = (giro aplicado pela assistência) / (giro que manteria o
  alvo na mesma posição de tela); cruzamentos do centro do alvo causados pela
  assistência.
- **Limiar:** 0 ≤ ρ < 1 em todo frame; **0 cruzamentos** em 600 frames de rastreio
  com alvo a 5, 30 e 60 °/s; alvo PARADO não puxa (ρ = 0 com o jogador parado).
- **Fonte:** Lyra *"The amount of pull is a percentage of the rotation needed to
  stay on target"* e *"Clamp the maximum amount of pull rotation to prevent it from
  yanking the player's view"*; The Finals *"Zoom Snapping Angular Velocity now has
  a max cap, preventing unintended rapid 90-degree turns"*.
- **Por que a suíte não pega:** não há caso de cruzamento nem de ρ por frame no
  jogo real.
- **Reinjetar:** puxar para o CENTRO do alvo (ímã) → cruzamentos > 0 e ρ ≥ 1.

### A5 · Nunca atrapalha, e ajuda de verdade
- **Mede:** erro angular médio de rastreio (graus) e tempo até a retícula entrar na
  silhueta (s), com e sem assistência, mesmo roteiro de arrasto.
- **Limiar:** (a) arrastando EM DIREÇÃO ao alvo, giro com assistência ≥ sem; (b)
  alvo cruzando a 60 °/s (8,6 m/s a 8 m): tempo até alcançar com ≤ sem; (c) alvo a
  30 °/s, roteiro de arrasto de um jogador que atrasa 150 ms: erro médio com
  **estritamente menor** que sem (uma assistência que não faz nada reprova aqui);
  (d) histerese: rastreando A, um alvo B que cruza entre a retícula e A não rouba
  o efeito.
- **Fonte:** Lyra `bUseDynamicSlow` (o slow não freia quem vai para o alvo, e nunca
  acelera); Insomniac 12:53 — friction pura *"you'll never catch up to it"*;
  Insomniac 10:09 — histerese do alvo anterior.
- **Por que a suíte não pega:** o caso (b) de `aim-assist.test.js` cobre só (c)
  num cenário (20 m, alvo de lado).
- **Reinjetar:** slow puro sem compensação → (a)/(b) vermelhos; assistência no-op →
  (c) vermelho; histerese zerada → (d) vermelho.

### A6 · Chave liga/desliga, desligada é zero, e armas sem assistência escritas
- **Mede:** efeito com a chave desligada; persistência; efeito por arma.
- **Limiar:** desligada ⇒ quaternion idêntico bit a bit ao da build sem assistência
  por 600 frames do roteiro de A5; a escolha sobrevive a recarregar a página;
  `localStorage` que LANÇA (aba privada) não derruba boot nem menu; as armas
  listadas "sem assistência" medem 0. **A lista é decisão do dono** (a referência
  propõe faca e bazuca sem, DMR/sniper com metade — `[INFERÊNCIA]`); reprova a
  lista não estar escrita, ou uma arma dela receber efeito.
- **Fonte:** CoD Mobile e WZM (chave liga/desliga); Critical Ops *"SCAR-H has no
  Aim Assist, just like the AR-15"*; Free Fire *"VSK94: Aim-Assist Removed"*.
- **Por que a suíte não pega:** o reload do ajuste é testado; o `localStorage` que
  lança e o zero bit a bit, não.
- **Reinjetar:** a chave desligar só o indicador e não o cálculo → vermelho.

### A7 · A assistência mexe na câmera, e só nela
- **Mede:** (a) M1 com a assistência agindo sobre alvo em movimento; (b) tipos e
  campos das mensagens cliente→servidor em 60 s de combate assistido; (c)
  `test/security-regression.test.js`.
- **Limiar:** (a) ≤ 1 px no instante do disparo; (b) nenhum evento novo, nenhum
  campo novo em `shotHit`/`shotFired`/`state`; (c) verde.
- **Fonte:** referência P0-2 (por que do lado da câmera: os TRÊS caminhos de
  `fire()` e a validação do servidor) `[INFERÊNCIA]`; CLAUDE.md, invariante do
  anti-cheat.
- **Por que a suíte não pega:** `security-regression` não sabe que a assistência
  existe; M1 nunca rodou com outro sistema girando a câmera no frame do disparo.
- **Reinjetar:** aplicar a assistência DEPOIS de `fire()` no frame → (a) vermelho
  com o giro daquele frame, em px.

### A8 · Tiro automático — opção, padrão DESLIGADO até decisão do dono
- **Mede:** disparos automáticos por cenário.
- **Limiar:** (a) padrão desligado — mudar exige a linha do dono no laudo; ligado:
  (b) 0 disparos em alvo com 0 px visíveis (âncora de A2); (c) 0 disparos além do
  alcance útil da arma; (d) 0 com faca, bazuca, DMR, sniper e granada; (e) 0 com
  a retícula sobre algo que não é jogador/bot/inimigo PvE; (f) controle positivo:
  dispara em ≤ 1 período de cadência quando a retícula entra na silhueta de um
  inimigo visível e ao alcance.
- **Fonte:** Fortnite, *"Auto Fire does not fire with ... Melee Weapons ...
  Sniper Rifles and Bows / Launcher Weapons ... Throwables"*; WZM *"fire only at
  targets within the weapon's range"*; Standoff 2, a recusa declarada (referência
  §1.5, §2.4, §2.5). Padrão: decisão pendente do dono (briefing desta rodada).
- **Por que a suíte não pega:** o caso "alvo atrás da parede" de
  `aim-assist.test.js` monta um bloco em `Structures.walls` — exatamente o que o
  `rayBlockedAt` do produto consulta (mesma objeção de A2); mato, veículo e
  folhagem não têm caso.
- **Reinjetar:** visibilidade do automático = `true` → vermelho em (b).

### A9 · (HUMANO) Calibração com quem nunca jogou
- **Mede:** taxa de acerto contra alvo que anda de lado, com e sem assistência, em
  ordem cega; e duas perguntas.
- **Limiar:** ≥ 3 pessoas que nunca jogaram; taxa com ≥ sem em TODAS; ninguém
  responde "a mira anda sozinha" ou "puxou para quem eu não via".
- **Fonte:** Insomniac 21:03, *"you have to play test with noobs"*; a força não tem
  número publicado para toque em nenhum AAA móvel (referência §5.1).
- **Por que só humano:** a força "certa" não tem fonte; só o teste com novato fecha.

---

## 4. C — Controles e HUD de toque

### C1 · Mirar e atirar ao mesmo tempo com o polegar direito
- **Mede:** giro (graus) por px arrastado com o dedo que apertou o ATIRAR;
  disparos durante o arrasto.
- **Limiar:** (a) N px a partir do ATIRAR giram N × s × k_tiro ± 1 %, k_tiro = 1 no
  padrão, pelo MESMO tubo do olhar (M4/M5 valem: mesmo arrasto no `#tcLook` e no
  ATIRAR com k = 1 dá o mesmo ângulo ± 0,1 %); (b) automática dispara durante todo
  o arrasto, à cadência ± 1 disparo; **semi-automática dá UM disparo por toque — o
  arrasto não gera disparo extra**; (c) o dedo que sai da área do botão continua
  girando linearmente (arrasto de 300 px medido inteiro ± 1 %); (d) k_tiro = 0
  desliga o giro e mantém o tiro; (e) **três dedos** — analógico no talo + ATIRAR
  arrastando + ⇧ — produzem os três efeitos no mesmo 0,5 s (andou ≥ 2 m, girou ≥
  0,1 rad, subiu, disparou), e soltar um não solta os outros; (f) o 2º ATIRAR à
  esquerda, se ligado, cumpre (a)–(d).
- **Fonte:** Critical Ops 1.19, *"joystick fire button"* e *"FIRE BUTTON AIM
  SENSITIVITY"* (0 desliga); CoD Mobile, botão de tiro que segue o dedo; PUBG,
  *"Scope and Peek buttons to rotate the camera"*; PUBG, tiro dos dois lados por
  padrão (referência §2).
- **Âncora:** `camera.matrixWorld`; `gun.mag`; `shotFired` no socket (BR).
- **Por que a suíte não pega:** o caso (a) de `touch-controls.test.js` arrasta
  100 px com FUZIL (automática) e confere contra `Touch.lookSens`; não há caso de
  semi-automática com arrasto, de 300 px fora do botão, nem de três dedos.
- **Reinjetar:** reimpor `mouse.clicked` a cada `pointermove` do ATIRAR → (b)
  vermelho na DMR com disparos extras; ATIRAR ignorar `pointermove` → (a) 0°.

### C2 · Todo alvo de toque tem ≥ 44 × 44 px CSS, em todo estado e todo viewport
- **Mede:** para cada elemento interativo visível, o maior quadrado contido na
  região em que `elementFromPoint` devolve o elemento (ou um filho dele), numa
  grade de 2 px.
- **Limiar:** ≥ 44 × 44 px CSS. Exceções do WCAG 2.5.5 (link dentro de texto;
  controle equivalente que cumpre) declaradas uma a uma no laudo.
- **Onde:** estados E1–E11 × V1–V5 e VR: menu, ajustes e a seção "Controles de
  toque" (a trilha de cada slider), lobby BR (nick, cores, código, flags,
  iniciar), cluster, analógico, 2º ATIRAR, tela de morte, barra do espectador,
  fim de partida, `#rgPlay`.
- **Fonte:** Apple HIG *"at least 44x44 pt"*; WCAG 2.2 2.5.5 (AAA) *"at least 44 by
  44 CSS pixels"* (referência §4.6).
- **Por que a suíte não pega:** só o ATIRAR é medido (`fireLado >= 44`), em V3, em
  partida; menu e lobby nunca foram tocados pelo teste.
- **Reinjetar:** piso de `--tcb` em 40 px → vermelho em V2.

### C3 · Nenhum controle cobre informação essencial, e nada cobre um controle
- **Mede:** área de interseção (px²) entre retângulos de controles e de HUD
  essencial; o elemento sob o centro de cada controle.
- **Limiar:** 0 px², e `elementFromPoint(centro do controle)` = o controle, em todo
  estado de E1–E11 × V1–V5 e VR. HUD essencial: vida, colete, munição, arma ativa
  (`#slots`), zona e gás (`#brTop`, `#brZoneMap`), minimapa, `#prompt`, `#brHint`,
  barra do espectador, contagem, a entrada MAIS NOVA do killfeed e do chat.
- **Fonte:** geometria; CLAUDE.md, "teste verde não prova tela certa" (as rodas na
  altura da janela no menu, com cinco arquivos verdes). As alturas de 360 e 375 px
  são onde o próprio `style.css` registra que o HUD já invadiu ("em 360px de
  altura só cabem ~2"; inventário que "invade o analógico por 44px").
- **Âncora:** `getBoundingClientRect` + `elementFromPoint` — DOM, nunca as
  variáveis CSS do produto (`--stickT`, `--clusterT`).
- **Recorte (notch):** se o Chrome da medição permitir override de
  `safe-area-inset`, medir também com 47 px na lateral; senão, a linha vai para o
  roteiro E14 e o laudo declara.
- **Por que a suíte não pega:** só inventário e arsenal são checados contra o
  cluster, só em V3, só a pé.
- **Reinjetar:** tirar o `max-height` de `#killfeed` → vermelho em V2.

### C4 · O HUD nunca cita tecla que o celular não tem — em todo estado *(REGRESSÃO)*
- **Mede:** tokens de teclado em TODO texto visível, inclusive `centerMsg`,
  toasts, banners, dicas, prompts, lobby, morte, fim de partida, evento da
  cidade, cofre e atrações do circo.
- **Limiar:** 0 ocorrências de `[E]`, `[F]`, `[G]`, `[Q]`, `[R]`, `[T]`, `[TAB]`,
  `ESPAÇO`, `ESPACO`, `SPACE`, `WASD`, `SHIFT`, `CTRL`, `ENTER`, `ESC`, `<b>X</b>`
  de uma letra só, "clique", "mouse", "botão direito".
- **Fonte:** regressão de `205b0c3` (nave, espectador, paraquedas, helicóptero,
  cofre, contadores, lobby).
- **Como:** `MutationObserver` + `innerText` do documento visível ao longo do
  percurso real de E1–E11.
- **Por que a suíte não pega:** confere strings específicas em estados
  específicos (a dica da nave é testada forçando `S.phase = 'SHIP'` à mão por 3
  ticks); texto novo em estado não visitado passa.
- **Reinjetar:** voltar "[ESPAÇO]" na barra do espectador → vermelho.

### C5 · Toque fora dos controles não atira; o toque que tira da pausa não atira nem gira
- **Mede:** disparos e giro produzidos pelos eventos de mouse de COMPATIBILIDADE
  que o navegador móvel emite depois de um toque não cancelado.
- **Limiar:** 0 disparos (pente intacto, 0 `shotFired`) e 0,000° de giro para (a)
  toque em qualquer ponto de canvas nu (grade de 8 px sobre a tela em partida) e
  (b) o toque que tira da pausa.
- **Como (dublê declarado):** o Chrome headless não gera esses eventos (validação
  2026-08-08, B5). Dublê: `MouseEvent('mousedown'|'mouseup'|'click', { button: 0,
  sourceCapabilities: new InputDeviceCapabilities({ firesTouchEvents: true }) })`
  na ordem e no ponto em que o Chrome Android os despacha — e SÓ quando o
  `pointerdown` daquele toque não foi cancelado (`defaultPrevented === false`),
  que é a regra do Pointer Events. Dublê que despacha sempre é bom demais
  (formato 8) e reprova até o que está certo. Por ser dublê, E14 tem a mesma
  linha no aparelho.
- **Fonte:** medido em 2026-08-08: 47,1 % da tela em partida é canvas nu.
- **Por que a suíte não pega:** todo teste despacha `PointerEvent` direto nos
  controles; o caminho do mouse de compatibilidade nunca roda.
- **Reinjetar:** tirar o `preventDefault()` de `onBtnDown` → o caso dos botões
  avermelha (disparo em dobro).
- **Hoje (leitura de `c585806`):** aberto — `window.addEventListener('mousedown')`
  em `game.js` checa só `!state.started || state.paused`.

### C6 · Analógico a pé é analógico: direção exata, velocidade proporcional
- **Mede:** erro angular (graus) entre a direção pedida no analógico e a andada,
  relativa à vista; velocidade contra deflexão.
- **Limiar:** ≤ 0,5° em 16 direções (inclusive 22,5° fora dos eixos), a meio curso
  e no talo; velocidade monotônica com ≥ 5 patamares distintos entre a zona morta
  e o limiar de corrida; zona morta efetiva = declarada (0,12) ± 0,005.
- **Fonte:** CLAUDE.md, lição do VR: analógico traduzido em tecla deu 22,50° de
  erro, uma velocidade só e zona morta efetiva de 0,2805 contra 0,18; radial dá
  0,00°. (Veículo e helicóptero ficam de fora: lá a tecla é o contrato de
  `js/car.js`/`js/heli.js`.)
- **Âncora:** `player.pos` integrado; direção da vista de `camera.matrixWorld`.
- **Por que a suíte não pega:** `touch-controls.test.js` aceita `cos > 0.9` —
  25,8° de tolerância; quantização em 8 direções (máx. 22,5°) passa.
- **Reinjetar:** quantizar o analógico a pé em WASD → suíte verde; este vermelho
  com 22,50°.

### C7 · Qualquer arma em um toque
- **Mede:** toques para ir da arma *i* à arma *j* destrancada, máximo sobre os pares,
  no BR com as 8.
- **Limiar:** ≤ 1.
- **Fonte:** CoD Mobile, *"Tapping the stowed weapon will take it out and make it
  the current weapon"* (referência §4.1).
- **Por que a suíte não pega:** o caso da troca confere só que o ciclo pula as
  trancadas.
- **Hoje (leitura):** ⇄ só anda para a frente — o `style.css` registra "ciclar às
  cegas custa até 7 toques"; `#slots` vive em `#hud` (`pointer-events: none`).
- **Reinjetar:** o próprio estado atual (7).

### C8 · O botão aparece quando serve
- **Mede:** visibilidade de USAR, COMER, KIT e GRANADA contra a condição de jogo.
- **Limiar:** USAR visível ⇔ existe interação ao alcance (a mesma condição que
  acende o `#prompt`); COMER ⇔ carne > 0; KIT ⇔ kits > 0; GRANADA ⇔ granadas > 0;
  transição em ≤ 1 frame; os botões que ficam não mudam de lugar
  (`[INFERÊNCIA]`: memória do polegar).
- **Fonte:** CoD Mobile (troca de arma do chão, faca, porta, veículo aparecem
  quando servem); Critical Ops 1.70, *"The touch button appears when you can pick
  up an item"*.
- **Por que a suíte não pega:** `touch-controls.test.js` EXIGE os 14 botões sempre
  presentes (`r.btns.length === 14`) — congela o defeito como requisito, como o
  "passo de 45° fixo" da régua do VR (A2).

### C9 · Ajustes de toque: existem, são obedecidos, persistem
- **Mede:** presença de cada controle; efeito medido de cada valor; persistência.
- **Limiar:** alcançável por toque na pausa e no menu principal, inteiro em 360 px de
  altura (rolagem por toque vale); contém olhar, razão Y/X (M5), multiplicador de
  ADS (M4), ATIRAR que gira (C1), assistência (A6), tiro automático (A8); cada
  valor produz o giro medido ± 1 % (M3); persiste ao recarregar; `localStorage`
  que lança não derruba nada; "restaurar padrão" existe. A FAIXA de cada slider é
  decisão do dono (não há unidade física publicada — referência §5.2).
- **Fonte:** referência §3 (WZM com eixos separados e ADS por luneta; Critical Ops;
  CoD Mobile com presets; PUBG/Free Fire com código de compartilhar).
- **Por que a suíte não pega:** o caso (e) confere que o ajuste "vale na hora e
  sobrevive ao reload" pelo valor do produto; não mede o giro produzido por cada
  valor contra o valor mostrado, nem 360 px de altura.
- **Reinjetar:** o slider gravar o valor e o jogo ler a constante → vermelho.

### C10 · Nada fica preso — em nenhuma transição
- **Mede:** depois de cada transição, com o dedo PRESSIONADO no instante dela:
  `keys` (W/A/S/D/Space/ControlLeft/Tab/E), `mouse.shooting`, `mouse.aiming`,
  classe `.on`, velocidade do jogador 0,5 s depois.
- **Limiar:** tudo falso/zero e velocidade < 0,5 m/s, para: `pointercancel`, `blur`,
  aba escondida, virar para retrato, pausa, morte, entrar/sair do carro,
  entrar/sair do helicóptero, início/fim da cinemática, fim de partida, abrir o chat.
- **Fonte:** regra de ouro de `js/touchcontrols.js` — *"todo keydown tem keyup
  casado"*; *"dedo que ficou apertado = tiro infinito"*.
- **Por que a suíte não pega:** cobre `pointercancel`, `blur` e pausa; o caso do
  carro solta o analógico ANTES de sair, e entra/sai por `teleportToCar` e
  `tryToggleCar`, não pelo botão USAR.
- **Reinjetar:** não emitir o `keyup` do volante ao sair do veículo → KeyW preso.

### C11 · O analógico anda o que o teclado anda, e corre onde o polegar chega *(novo, 2026-09-28)*
- **Relato do dono:** *"a sensibilidade ali na movimentação deve ser melhorada"*.
- **Mede:** velocidade estável a pé (m/s) pelo toque do DevTools no analógico,
  com o laço no rAF, contra a do `W` do teclado (`Input.dispatchKeyEvent`) na
  MESMA partida e no mesmo chão; deflexão em que a corrida liga; raio de curso.
- **Limiar:** (a) no topo da faixa de andar (logo abaixo do limiar de corrida) a
  velocidade é a do `W` ± 5 %; (b) em meio curso (0,5) ≥ 50 % da do `W`, e
  monotônica (C6); (c) a corrida liga com deflexão ≤ 0,80; (d) o "Curso do
  analógico" do menu muda o raio medido (px de dedo até o talo) na proporção
  mostrada ± 2 px.
- **Fonte:** relato do dono; 0,80 = Apple WWDC26 *"Make your game great with
  touch"* (`if magnitude > 0.8`) — citado pelo construtor em `8506731`, **não
  conferido pelo validador**; paridade com o teclado **[INFERÊNCIA]**: o mesmo
  boneco, o mesmo mundo, e o celular não pode ser o controle mais lento.
- **Por que a suíte não pega:** C6 mede direção e forma da curva, não a
  velocidade contra o teclado nem o toque real.
- **Reinjetar:** voltar o vetor de andar = deflexão → (a) vermelho (85 % do `W`,
  número de `8506731`); limiar de corrida 0,85 → (c) vermelho.

### C12 · A retícula fica vermelha sobre o inimigo que a tela mostra, no alcance — e só nele *(novo, 2026-09-28)*
- **Relato do dono:** *"a mira não fica vermelha quando apontada aos inimigos"*.
- **Mede:** cor da `#crosshair` (estilo computado) quadro a quadro, com o centro
  da tela entrando e saindo da silhueta de cada tipo de alvo.
- **Limiar:** (a) no quadril, vermelha no MESMO quadro (≤ 1) em que o centro
  entra na silhueta de um inimigo **visível** (âncora de pixels de A2) dentro do
  alcance da arma: jogador remoto, bot, lobo, zumbi, esqueleto, Visitante,
  golem; (b) branca sobre o que não é inimigo (disco do campo de tiro, cadeado
  do cofre, cervo), sobre inimigo com **0 px** na tela (parede, veículo, copa,
  crista) e além do alcance da arma; (c) volta a branca em ≤ 0,1 s depois de
  sair; (d) em ADS com alça ou luneta a retícula some (M6) — pintar a mira 3D
  da arma é **decisão do dono**, declarada no laudo, sem portão.
- **Fonte:** relato do dono; `docs/mobile/referencia-reticula.md` — Halo
  (*"the reticle will change to red if moved over an enemy"*, e só no alcance),
  Destiny 2, CoD (`cg_crosshairEnemyColor "1"`), Quake III (traço parado por
  sólido e fade de saída). O alcance por arma é **[INFERÊNCIA]** da referência.
- **Por que a suíte não pega:** a oclusão é conferida com a régua do produto
  (`rayBlockedAt` + `js/oclusao.js`), não com pixels.
- **Reinjetar:** vermelho sem checar visibilidade → (b) vermelho atrás da parede;
  sem checar a categoria → (b) vermelho no disco.

---

## 5. B — Bots

**O caminho que conta é o real:** `server.js` + o processo `scripts/bots.js`
(spawnado pela flag do anfitrião) + terreno reconstruído da seed + o cliente da
vítima (checagem de cobertura em `youWereHit`, `br-game.js`). O humano é um
socket dublê que manda `state` no ritmo do `br-game.js` — ou o próprio jogo em
headless. O `Math.random` do processo dos bots pode ser semeado pela sonda.

Por que não basta o dublê de `test/bots-combate.test.js` (CLAUDE.md, "Testes
primários primeiro"): lá o servidor é trocado por `run()`, que trata `shotHit`
como dano sem validação, sem `combatImmune`, sem a cobertura do cliente, chama
`tickBots` com *t* exato (no processo real *t* vem de `Date.now()` e o estado dos
humanos chega `volatile`), e conta a rajada como um tiro só. O dublê é bom — é a
melhor rede de bots que esta base já teve — mas ele mede o laço, não a partida.

**Perfil único:** o bot não sabe se o humano está no celular. Os limiares valem
para TODO humano até o dono decidir se o desktop merece bot mais duro (§9).

N ≥ 30 engajamentos por caso (≥ 500 disparos nos casos de taxa), seeds declaradas.

### B1 · Reação: o primeiro disparo leva ≥ 1,3 s
- **Mede:** t(primeiro `playerFired` do bot contra o humano, recebido pelo humano)
  − t0, onde t0 = o humano sai de trás de uma cobertura para a frente do bot (≤ 10°
  do `rotY` que o bot difunde), com linha livre pelo `rayBlockedAt` do CLIENTE.
- **Escopo (2026-09-28, decisão do dono — ver B14):** vale no engajamento NOVO e
  na PRIMEIRA re-exposição (o humano volta depois de ≤ 3 s escondido). Da 2ª
  re-exposição seguida em diante quem manda é B14 — a proteção se esgota ali por
  decisão, e B1 não pode proibir isso. Nada muda no limiar.
- **Limiar:** mínimo ≥ 1,3 s.
- **Fonte:** CS2 Easy, `ReactionTime 0.60` + `AttackDelay .70` = 1,30 s — o mais
  brando dos perfis Easy publicados (CS 1.6 Easy: 2,0 s); Booth, *"Substantial
  additional delay before opening fire"*; PUBG 12.1, *"Bots now engage less
  quickly after acquiring their target"* (referência §1.2, §2.1).
- **Por que a suíte não pega:** o dublê mede 1,2 s de "virar" e ≥ 0,95 s de
  "virar → atirar", em *t* exato; nada roda o processo real contra o servidor real.
- **Reinjetar:** `REACTION_S = 0` e `ATTACK_DELAY_* = 0` → ≤ 0,1 s.

### B2 · Os primeiros tiros erram: primeiro dano ≥ 1,3 s + missTime(d)
- **Mede:** t(primeiro dano de bot APLICADO no humano, depois da checagem de
  cobertura do cliente) − t0.
- **Escopo (2026-09-28, decisão do dono — ver B14):** o mesmo de B1 — engajamento
  NOVO e PRIMEIRA re-exposição. Da 2ª re-exposição seguida em diante, B14.
- **Limiar:** ≥ 1,3 + 1,0 + 0,0315·d s (d em m): **≥ 3,25 s a 30 m, ≥ 4,82 s a
  80 m**. DMR/sniper: os 2 primeiros disparos num alvo novo além de 12,7 m não
  acertam.
- **Fonte:** CoD4 `_gameskill.gsc`, `missTime` Easy (1,0 s + 0,8/1000 por unidade;
  1 un. = 2,54 cm é `[INFERÊNCIA]` da referência) e a regra da sniper; Lidén,
  *"intentionally missing the player the first time"*.
- **Por que a suíte não pega:** o dublê tem caso próprio da janela; o de primeiro
  dano exige só "≥ 1,5 s" a 30 m, enquanto o commit alega 4,90 s — a asserção é
  3× mais frouxa que o produto e não avermelha se a janela sumir (o próprio
  commit admite: "só avermelham com P0 e P1 caindo juntos").
- **Reinjetar:** `MISS_BASE_S = 0`, `MISS_PER_M_S = 0` → abaixo de 3,25 s a 30 m.

### B3 · Tempo para matar
- **Mede:** TTK mediano (s) de 100 HP sem colete, humano parado em pé ao ar livre:
  (a) 1 bot de fuzil a 30 m; (b) o mesmo a 80 m; (c) 4 bots em arco a 30 m com o
  humano revidando.
- **Limiar:** (a) e (c) ≥ **6,0 s**, também com o `Math.random` do processo
  semeado para dar a pontaria MÁXIMA; (b) > (a).
- **Fonte:** **decisão do dono, provisória** — 6 s é o número de partida da
  referência (P0.3, *"a meta vem do dono"*); vale até ele escrever outro.
- **Por que a suíte não pega:** dublê; o caso (c) do dublê roda com `humanHp:
  Infinity` e calcula a morte somando dano — no caminho real, a cobertura do
  cliente recusa dano e quem decide a morte é o cliente e o servidor.
- **Reinjetar:** `HIT_GAP_S = 0` → (c) cai para a soma de 4 bots.
- **Hoje:** alegado 10,65 s (a) e 8,40 s (c), no dublê.

### B4 · Um bot por vez acerta o mesmo humano
- **Mede:** bots distintos com dano aplicado no mesmo humano em qualquer janela
  deslizante de 1,0 s; intervalo entre EVENTOS de dano de bot consecutivos no
  mesmo humano (os `youWereHit` de UM bot a ≤ 150 ms entre si contam como um
  evento — é a rajada).
- **Limiar:** ≤ 1 bot por janela; intervalo ≥ 0,5 s; quem não tem a vez CONTINUA
  atirando e errando perto (≥ 1 erro por período de cadência) — bot parado
  "esperando a vez" também reprova.
- **Fonte:** Game AI Pro 3 cap. 33 (*"shots can only actually hit the player if the
  shooter has a token"*; *"avoids multiple hits occurring on the same frame"*; e a
  crítica ao token que trava o disparo); Half-Life (2 vagas), TLOU (1) — o "1" é
  `[INFERÊNCIA]` dentro de 1–2; CoD4 `invulTime_onShield` Normal 0,5 s (adaptação
  da referência P2.2).
- **Por que a suíte não pega:** dublê; e o dublê agrupa "rajada = 1 tiro" por
  construção, enquanto o servidor real emite um `youWereHit` por `shotHit`.
- **Reinjetar:** diretor de acerto sem trava (`HIT_GAP_S = 0`) → 4 bots por janela.

### B5 · O humano não é ímã
- **Mede:** fração dos primeiros engajamentos de um bot dirigidos ao humano, com
  um bot mais perto e visível.
- **Limiar:** ≤ 50 % (bot rival a 6–15 m, humano ≥ 15 m mais longe, ninguém
  atirando no bot); controle: quando o humano ACERTA o bot, o bot passa a
  engajá-lo em ≤ reação + 0,1 s.
- **Fonte:** CoD Threat Bias (soma de fatores, −150 por atacante a mais,
  `threatbias` do jogador menor no fácil; *"damaged player = 1000"*).
- **Por que a suíte não pega:** dublê (alega 0 %). O caso antigo de
  `bots-behavior.test.js` EXIGIA o defeito e foi reescrito em `37b5ca5`.
- **Reinjetar:** `return nearestHuman || nearestBot` → 100 %.

### B6 · Visão não atravessa o RELEVO REAL; a perseguição vai à última posição vista
- **Mede:** disparos, acertos e viradas do bot contra humano atrás de crista do
  terreno REAL da seed; posição do bot 8 s depois de o humano sumir.
- **Limiar:** 0 `playerFired` contra o humano, 0 dano e 0 virada para ele enquanto
  olho(1,5 m)→tronco(1,0 m) e olho→cabeça(1,6 m) estiverem bloqueados; depois de o
  humano andar ≥ 30 m escondido, o bot está mais perto da ÚLTIMA POSIÇÃO VISTA que
  da atual; controle: sem crista, a 20 m ao lado, ele engaja.
- **Âncora:** `rayBlockedAt` do CLIENTE (terreno + estruturas) na página do jogo
  com a mesma seed — não a `lineOfSight` do bot (marcha de 2 m no heightmap).
- **Fonte:** Halo 3, *"must be able to actually see their targets"*; van Waveren,
  *"should not be able to always know where it's opponents are"*; memória: TLOU e
  Halo (referência §3).
- **Por que a suíte não pega:** o morro do dublê é uma gaussiana analítica de
  10–12 m; o relevo real tem cristas baixas, e as duas pontas (bot e cliente)
  reconstroem o terreno por caminhos diferentes — só a seed real mostra se
  concordam.
- **Reinjetar:** `lineOfSight` → `true` → vermelho.

### B7 · Visão não atravessa prédio, rocha nem castelo
- **Mede:** o mesmo de B6, com o humano dentro/atrás de prédio da cidade, do
  castelo ou de rocha, sem linha livre pelo `rayBlockedAt` do cliente.
- **Limiar:** 0 disparos contra ele e 0 viradas por 10 s; perseguição para a
  última posição vista.
- **Fonte:** B6; PUBG 12.1 — os jogadores acusaram os bots de *wallhack*
  (referência §1.2). O dano não passa (a vítima recusa por cobertura), mas o bot
  que persegue e metralha a parede É a sensação de wallhack.
- **Por que a suíte não pega:** o bot não tem paredes; nenhum teste põe prédio
  entre bot e humano.
- **Hoje (leitura):** **reprova** — `lineOfSight` só conhece o heightmap;
  `37b5ca5`: "Fora desta entrega: ... P3 (postura, paredes, grama)".

### B8 · Cone de visão, tempo para notar, e o tiro que revela
- **Mede:** viradas e disparos contra o humano conforme a posição dele no cone do
  bot (âncora: o `rotY` que o bot difunde — é o que o humano VÊ do bot).
- **Limiar:** (a) humano parado e calado fora do cone (> 90° do `rotY` a ≤ 8 m,
  > 45° além de 20 m): 0 viradas e 0 disparos enquanto estiver fora; (b) humano
  parado dentro do cone a 30–60 m: o bot vira ≥ 1,0 s depois; (c) humano que atira a
  ≤ 60 m, com o bot na tela dele: o bot reage; fora da tela do humano, audição pela
  metade.
- **Fonte:** TLOU (cone inverso à distância; medidor ~1–2 s); UT3 Novice ±45,6°;
  Quake III (360° quando atirado); Splinter Cell (metade fora da tela). 60 m =
  ponta baixa da faixa `[INFERÊNCIA]` 60–80 m da referência.
- **Por que a suíte não pega:** dublê — é o mais bem coberto por ele; aqui se cobra
  no processo real.
- **Reinjetar:** cone de 360° → (a) vermelho.

### B9 · O acerto responde ao que o humano faz
- **Mede:** taxa de acerto por disparo, em pares de cenário, ≥ 500 disparos por lado,
  no servidor real.
- **Limiar:** (a) bot andando ≤ 0,5 × bot parado; (b) humano que INVERTE a direção:
  taxa nos 0,5 s seguintes ≤ 0,7 × a de linha reta; (c) humano correndo < parado,
  diferença > 2 desvios-padrão; (d) humano de costas para o bot (> 170° entre a vista
  dele e o bot): intervalo mínimo entre acertos ≥ 2 × o de frente; (e) 60 m < 30 m.
- **Fonte:** CoD4 `run_accuracy = 0.5`; Quake III `aim_accuracy *= 0.7f` ao mudar de
  direção; DOOM (qualitativo); Game AI Pro 3 (> 170° dobra o atraso); CS 1.6 erro ∝
  distância.
- **Por que a suíte não pega:** (b) não tem caso no dublê — há "alvo andando",
  não "inverteu".
- **Reinjetar:** `TARGET_TURN_MULT = 1` → (b) vermelho; previsão: o dublê fica verde.

### B10 · Postura conta — e mentir postura não vira invisibilidade
- **Mede:** intervalo mínimo entre acertos e tempo para notar, humano em pé ×
  agachado × deitado; efeito de um cliente que manda "deitado" sempre.
- **Limiar:** agachado/deitado: intervalo mínimo entre acertos ≥ 2 × em pé; o
  cliente mentiroso ganha no máximo esse fator — nunca some do bot; o campo novo
  passa pela mesma validação de tipo dos outros; `security-regression` verde.
- **Fonte:** Game AI Pro 3, *"double it if they are crouching"*; tabela de notar do
  CS (parado e agachado, 5 % por 0,25 s longe); referência P3: o atalho de o
  cliente avisar "estou atrás da parede" é vetor novo.
- **Por que a suíte não pega:** não existe o campo.
- **Hoje (leitura):** **reprova** — a postura não chega ao bot (o `state` do
  cliente não a tem; P3 fora da entrega).

### B11 · O erro que o jogador vê passa rente ao rosto
- **Mede:** para cada erro de bot, a menor distância (m) entre o segmento que o
  CLIENTE do humano desenha (`FX.spawnTracer`, depois do corte por `rayBlockedAt`)
  e o olho do humano (pé + 1,6 m); a altura desse ponto de maior aproximação.
- **Limiar:** ≥ 80 % dos erros com distância em [0,42; 1,5] m e altura em [1,2;
  2,0] m acima do pé; 0 erros a < 0,42 m.
- **Fonte:** Game AI Pro 3, *"whiz tracers right past the player's face at eye
  level"*; Lidén; 0,42 m = raio do colisor (CLAUDE.md); 1,5 m e 80 % são
  `[INFERÊNCIA]` da faixa de partida da referência.
- **Âncora:** o que o cliente desenha, não o `buildMissShot`.
- **Por que a suíte não pega:** os testes conferem o PACOTE (`toPos` com o "−1 m"
  porque o cliente soma 1 m); a convenção mora no `br-game.js`, e um teste do
  pacote não vê o desenho.
- **Reinjetar:** tirar o `- 1` do `toPos` em `buildMissShot` → o traçante passa 1 m
  acima → vermelho na altura.

### B12 · O processo dos bots falha alto e tem terreno em produção
- **Limiar:** (a) exceção não tratada no processo dos bots aparece no log do
  servidor, e saída ≠ 0 é registrada; (b) numa instalação `npm ci --omit=dev`,
  `createBotTerrain(seed)` devolve terreno e a lista de baús tem 34 posições; (c)
  sem terreno, o bot não fica onisciente EM SILÊNCIO: o aviso aparece no log, e o
  comportamento nesse caso está escrito e testado.
- **Fonte:** CLAUDE.md — os bots rodaram em produção sem terreno e o
  `console.warn` sumia no `stdio: 'ignore'`; "falha silenciosa por construção é
  pior que falha barulhenta".
- **Por que a suíte não pega:** (a) coberto desde `5254ce4` (`server.test.js`);
  (b) `deployment-context.test.js` confere `package.json` e `.dockerignore`, não
  roda o import numa árvore sem devDependencies; (c) nenhum — hoje
  `lineOfSight(null)` devolve `true` (vê através de tudo) e o dublê usa `terrain:
  null` como "chão plano".
- **Reinjetar:** mover `three` para devDependencies → (b) vermelho.

### B13 · (HUMANO) O dono joga e decide
- **Roteiro:** 3 partidas completas de BR no celular, com 8 bots. Por partida o dono
  responde: "morri para bot antes de conseguir reagir?", "algum bot me viu através
  de parede ou morro?", "os bots estão apelões?". A sonda colhe, em cada morte por
  bot, o tempo entre o primeiro traçante visível e o primeiro dano.
- **Aprova:** "não" nas três perguntas, nas três partidas.
- **Fonte:** CLAUDE.md — "o critério é o dono"; o PUBG 12.1 só foi pego por
  jogador.

### B14 · Quem espia não é imune — a proteção da re-exposição se esgota *(novo, 2026-09-28)*
- **Decisão do dono (2026-09-28): "proteção que se esgota".** A PRIMEIRA volta de
  trás da cobertura continua protegida exatamente como B1/B2 mandam; espiar de
  novo em seguida vai perdendo a proteção. Motivo, medido em `6aeda6c` (laudo
  `validacao-6aeda6c.md` §5): quem espia 3 s exposto / 2 s escondido ficou
  imune — cada volta pagava de novo reação + reaquisição + janela de erro
  (~3,1–3,4 s a 24 m, mais que os 3 s expostos).
- **Definições.** *Exposição* = o humano à vista do bot (linha livre pelo
  `rayBlockedAt` do cliente e dentro do cone); a 1ª é o engajamento novo, a 2ª é
  a **1ª re-exposição**. *Seguida* = escondido ≤ 3 s entre uma exposição e a
  próxima (acima disso é engajamento NOVO e paga tudo de novo — `REACQUIRE_S`,
  CS `seenRecentTime`). *TTK do espiador* = tempo de RELÓGIO desde o começo da
  1ª exposição até somar 100 de dano APLICADO (conta o tempo escondido).
- **Mede:** por espiador, dano de bot em cada exposição e o TTK do espiador; e,
  na mesma rodada, o TTK do mesmo perfil de bot/arma/distância com o humano
  PARADO e exposto o tempo todo (B3).
- **Cenário:** caminho real (`server.js` + `scripts/bots.js` pela flag do
  anfitrião), humano parado em pé de frente para o bot, sem colete e sem revidar,
  **3 s exposto / 2 s escondido**, até **12 ciclos** (60 s), **fuzil a ~24 m**;
  N ≥ 30 espiadores. Cobertura que o bot também respeite (hoje só relevo — B7).
  DMR a 24 m e escopeta a 15 m: medir e declarar, sem portão.
- **Limiar:**
  - **(a) a 1ª re-exposição continua protegida:** B1 e B2 medidos NELA
    (1º disparo ≥ 1,3 s e 1º dano ≥ 1,3 + missTime(d), contados da volta) —
    B14 não afrouxa a primeira volta;
  - **(b) a proteção se esgota:** o TTK mediano do espiador (fuzil, 24 m) é
    **finito dentro de 12 ciclos (60 s)** e **≤ 3 × o TTK mediano parado** da
    mesma rodada;
  - **(c) pelo menos UMA re-exposição é protegida, e não todas:** em ≥ 80 % dos
    espiadores que chegam à 6ª exposição, há dano de bot em alguma exposição
    entre a 3ª e a 6ª.
- **Fonte:** decisão do dono (2026-09-28). Lastro do "se esgota": CoD4
  `_gameskill.gsc` — a janela de erro só rearma depois de uns segundos sem
  atirar, *"we can only start missing again if it's been a few seconds since
  we last shot"*, `missTimeDebounce = gettime() + 3000` (referência de bots
  §2.2). **[INFERÊNCIA]** no k = 3 e nos 12 ciclos, pela conta: exposto 60 % do
  tempo e pagando só reação + reaquisição (~1,3–1,6 s) em cada volta sobra
  ~47 % do tempo de fogo — TTK ≈ 2,1 × o parado; 3 × dá folga para a variância
  da mira e ainda reprova a imunidade. O dono pode trocar k.
- **Por que a suíte não pega:** o dublê de `test/bots-combate.test.js` não tem
  ciclo de espiada; B1/B2 medem só a primeira volta.
- **Reinjetar:** (1) rearmar janela de erro e atraso de reaquisição em TODA
  volta, sem esgotar (o estado de `6aeda6c`) → 0 mortes → vermelho em (b) e (c);
  (2) não rearmar nem na 1ª volta (o estado de `7515734`) → 1º dano a 0,41 s na
  escopeta → vermelho em (a).
- **Hoje (medido em `6aeda6c`):** 47 espiadores, 282 exposições, **0 mortes**;
  fuzil a 24 m: 6 espiadores × 6 exposições, **0 de dano**; DMR a 24 m: 2 de 90
  exposições com dano; escopeta a 15 m: 3 de 156. **Reprova (b) e (c).**

---

## 5b. P — PvE: bichos, zumbis, o Visitante (ET) *(nova, 2026-09-28)*

Tudo aqui vem do relato do dono jogando no celular. O caminho que conta é o
jogo rodando no rAF (sem tique manual), com o PvE vivo no mundo da seed; no BR,
com as flags da sala (animais, zumbis, Visitante, golem).

### P1 · O Visitante (ET) morre antes de matar quem o enfrenta
- **Relato do dono:** *"o ET está muito forte pra matar ele"*.
- **Mede:** disparos e tempo (s, com recargas) para matar o Visitante com o
  fuzil a 20 m acertando 80 % no corpo; o mesmo com a DMR; e o tempo em que ele
  mata um jogador parado, de frente, na mesma distância (sem colete).
- **Limiar:** (a) TTK do Visitante pelo fuzil < TTK do jogador pelo Visitante,
  no mesmo cenário; (b) ≤ 2 pentes do fuzil (60 disparos).
- **Fonte:** relato do dono. (a) é a tradução do relato em grandeza
  **[INFERÊNCIA]**; (b) é **decisão do dono, provisória** — o número de
  `2b377ed` ("fuzil a 80 %: 6,6 s, dois pentes"); o dono pode trocar.
- **Reinjetar:** vida 1900 (a de antes) → (b) vermelho (93 disparos, número de
  `2b377ed`).

### P2 · Bicho não fere através de parede nem de prédio
- **Relato do dono:** *"os bichos te matarem através da parede"*.
- **Mede:** dano de PvE no jogador (`playerDamage` com a causa) em 60 s, com o
  jogador parado dentro de uma construção ou atrás de uma parede e o PvE ativo
  do outro lado — lobo, zumbi, esqueleto, fantasma, Visitante (orbe), golem; no
  solo também soldado, Executivo e Guardião; e o controle: o mesmo PvE com o
  jogador em céu aberto.
- **Limiar:** 0 de dano com parede entre os dois (âncora: o `rayBlockedAt` do
  cliente bloqueado do PvE ao corpo do jogador); controle > 0.
- **Fonte:** relato do dono; a bala do jogador para na parede (`rayBlockedAt`) —
  o golpe do bicho não pode ter regra mais frouxa **[INFERÊNCIA]**.
- **Reinjetar:** golpe/tiro de PvE sem checar obstáculo → vermelho.

### P3 · No helicóptero, nenhum bicho alcança
- **Relato do dono:** *"eles não deveriam conseguir te pegar ou te dar dano se
  você está no helicóptero"*.
- **Mede:** dano de PvE em 60 s com o jogador VOANDO (≥ 3 m acima do chão) e PvE
  ativo a ≤ 20 m; o controle: o mesmo PvE com o jogador a pé.
- **Limiar:** 0 de dano de PvE voando; controle > 0. Dano de BOT e de jogador no
  helicóptero é PvP (servidor) e fica fora — medido e declarado.
- **Fonte:** relato do dono.
- **Reinjetar:** tirar o portão do voo do dano de PvE → vermelho.

### P4 · Prédio é sólido para o jogador e está no chão
- **Relato do dono:** *"precisa ver nos prédios, se temos bugs"*.
- **Mede:** (a) andando pelo analógico contra cada parede externa de construção
  num raio de 60 m da cidade, em 8 rumos, se o jogador passa para o outro lado;
  (b) o vão (m) entre a base de cada construção e o terreno nos cantos.
- **Limiar:** (a) 0 travessias; (b) vão ≤ 0,10 m em todo canto (nada flutua).
- **Fonte:** relato do dono; a tradução em (a)/(b) é **[INFERÊNCIA]** — "bugs nos
  prédios" é amplo, e estas são as duas classes que o próprio histórico da base
  registra (`702079d`: construções flutuando; colisão de parede).
- **Reinjetar:** tirar a colisão de uma parede → (a) vermelho.

---

## 6. D — Desempenho e invariantes

### D1 · (APARELHO) 60 fps no celular
- **Mede:** tempo de frame p50 e p99 (ms), pelo `js/perfhud.js`, na rota do BR:
  nave, queda, pouso e loot (60 s), tiroteio com 8 bots (60 s), círculo final.
- **Limiar:** p50 ≤ 16,7 ms e p99 ≤ 33,3 ms em cada trecho, N ≥ 3 partidas, num
  Adreno 6xx ou Mali-G57 E no celular do dono; condição declarada (bateria ≥ 50 %,
  sem economia de energia, temperatura ambiente, brilho fixo).
- **Fonte:** **decisão do dono, fechada** em `docs/2026-08-08-mobile.md` ("60 FPS
  com corte agressivo (Adreno 6xx / Mali-G57)"); p99 = 33,3 ms é o degrau "30 FPS
  bonito" que o mesmo plano aceita como piso.
- **Por que só aparelho:** swiftshader — ms de frame não se transferem (validação
  2026-08-08, aviso do topo); "nada foi testado em aparelho real".
- **Hoje:** veredito anterior "implausível no BR" (440 draw calls na entrada contra
  a faixa inferida de 100–300).

### D2 · Draw calls não pioram *(REGRESSÃO)*
- **Mede:** draw calls p50 pela técnica do `perfhud` (`autoReset = false` + reset
  por frame), V3, `?perf=1&mobile=1`, seed 424242, idade do mundo declarada.
- **Limiar:** BR entrada ≤ 466; solo entrada (mundo de 20 s, rede parada) ≤ 301;
  combate controlado (28 inimigos + 13 animais + 6 veículos a 10–52 m) ≤ 610.
- **Fonte:** valores medidos em `091d5a7` + 6 %, a maior dispersão medida
  (validação 2026-08-08 §G1–G3).
- **Por que a suíte não pega:** as travas de draw call são por dono (inimigo,
  carro, animal, borboleta, mundo do Quest); nenhuma é do frame inteiro do BR no
  viewport do celular — e o que esta frente acrescenta (indicador, botões,
  contorno, se vier) é frame inteiro.
- **Reinjetar:** um contorno de alvo como malha por inimigo → + N draw calls.

### D3 · O caminho quente do toque não aloca nem cria objeto do three
- **Mede:** construções de `THREE.Object3D` (e subclasses), `Vector3`, `Quaternion`,
  `Euler`, `Matrix4` e `Raycaster` durante 600 frames de combate assistido com o
  dedo arrastando o ATIRAR (construtores embrulhados na página depois do boot).
- **Limiar:** 0 `Object3D` criados pelo olhar, assistência, tiro automático ou
  botões depois do boot; 0 dos demais por frame nesse caminho.
- **Fonte:** `js/touchcontrols.js` — *"alocar por evento/frame no caminho quente
  paga GC exatamente no tiroteio"*; CLAUDE.md — todo `Object3D` consome 4 números do
  `Math.random` seedado no UUID.
- **Por que a suíte não pega:** o núcleo confere que `getMove`/`takeLook` devolvem o
  mesmo objeto; a assistência e o ATIRAR-que-arrasta são caminho novo.
- **Reinjetar:** `new THREE.Vector3()` por frame na fiação da assistência → 600.

### D4 · O mundo do celular é o mesmo mundo, byte a byte
- **Mede:** o retrato de `test/carregamento-determinismo.test.js` (castelo,
  sítios, clareiras, vagas, inimigos, boss, alien, altura), seed 424242.
- **Limiar:** idêntico entre desktop e `?mobile=1` em V3; entre o commit anterior e
  o da entrega; e depois de 60 s de jogo com assistência e ATIRAR-que-arrasta
  ativos.
- **Fonte:** CLAUDE.md, invariante 1 — a ordem de consumo do `Math.random` seedado é
  contrato; bots e servidor reconstroem o mundo pela seed.
- **Por que a suíte não pega:** o teste de determinismo boota desktop; nenhum teste
  compara o mundo do celular — e o preset móvel muda `VIEW_DIST` e
  `GRASS_LOD_RING` no boot sem ninguém ter conferido o consumo.
- **Reinjetar:** criar um `Object3D` no boot só quando `isMobile` → difere só no celular.

### D5 · O laço dos bots cabe no passo
- **Mede:** duração do `tickBots` (ms) e intervalo real entre ticks, no processo real,
  com 16 bots + 4 humanos em combate.
- **Limiar:** p99 da duração < 100 ms; 99 % dos intervalos ≤ 150 ms.
- **Fonte:** conta — o passo é 100 ms (10 Hz, `g_flBotFullThinkInterval` do CS);
  tick mais longo que o passo desloca a fila de reação (6 amostras) e muda B1/B2
  sem mudar código.
- **Por que a suíte não pega:** o dublê chama `tickBots` com *t* exato e não mede
  tempo de parede.

### D6 · Boot em 4G não piora *(REGRESSÃO)*
- **Mede:** bytes até o menu jogável e até a arma equipada pronta (9 Mbps / 40 ms,
  viewport de celular).
- **Limiar:** ≤ 15,03 MB e ≤ 5,25 MB; asset novo desta frente entra só declarado com
  o custo.
- **Fonte:** validação 2026-08-08 §F4.
- **Por que a suíte não pega:** a trava de textura (`asset-texture-budget`) mede
  VRAM, não bytes de boot.

### D7 · (APARELHO) Uma partida inteira sem esquentar a ponto de cair
- **Mede:** p50 do tempo de frame nos 2 primeiros e nos 2 últimos minutos de uma
  partida completa; estado térmico (`adb shell dumpsys thermalservice`).
- **Limiar:** queda ≤ 10 % — **decisão do dono** (número proposto; não achei fonte de
  indústria para celular).

### D8 · (APARELHO) O teto de resolução morde de verdade
- **Mede:** `renderer.getPixelRatio()` e tamanho do drawing buffer num aparelho
  DPR 3; descida da resolução adaptativa sob carga.
- **Limiar:** buffer = tamanho CSS × `SETTINGS.res` do preset (1); a adaptativa desce
  até o piso 0,5 quando o gargalo é render.
- **Fonte:** validação 2026-08-08: o ganho do `res: 1` em DPR 3 "continua não
  medido" e é "provavelmente a maior economia isolada que já está no código".
- **Por que só aparelho:** o headless tem `devicePixelRatio = 1` mesmo com
  `deviceScaleFactor: 2`.

---

## 7. E — Estados: jogável no celular do menu ao fim da partida

O estado "no chão, em combate" é o de M, A e C. Esta seção cobre o RESTO.

**O harness de E1–E12 não pode usar atalho que pule estado:** nada de
`forceStart`, `startBRMatch` (pula a nave de propósito — CLAUDE.md), `QA.reset`,
`teleportToCar`, `tryToggleCar`, nem esconder o lobby. Entrada só por toque nos
elementos, e `Input.insertText` num campo focado (é o que o teclado virtual faz).
V2 e V3; BR com o servidor real e 4 bots. Em cada estado valem também C2, C3, C4
e C10.

### E1 · Menu e lobby por toque
- **Limiar:** a partir do carregamento: (a) começar o solo; (b) no BR, escrever o
  nick, escolher cor, colar o código do anfitrião, ligar os bots, iniciar; (c) todo
  elemento alcançável por rolagem por toque em 360 px de altura; (d) nada exige
  hover, clique direito ou tecla; (e) em retrato, o `#rotateGate` cobre o lobby.
- **Por que a suíte não pega:** todo teste de toque boota em partida e esconde o
  `.brPanel`.
- **Reinjetar:** `pointer-events: none` no botão de iniciar do lobby no celular.

### E2 · Nave: olhar e pular
- **Limiar:** arrasto gira a vista (M3, no referencial da nave); ⇧ leva SHIP → FALL
  no primeiro frame depois do toque; a dica cita ⇧ (C4).
- **Por que a suíte não pega:** o caso da dica força `S.phase = 'SHIP'` à mão por 3
  ticks — mede o texto, não a nave; nenhum teste de toque voa na nave.
- **Reinjetar:** tirar `jump` do `KEY_OF` → a nave vira beco.

### E3 · Queda e paraquedas
- **Limiar:** analógico → direção horizontal da queda = pedida, relativa à vista,
  ± 1° em 8 direções; abrir o paraquedas por ⇧ (se manual) e planar pelo analógico;
  o pouso devolve os controles a pé em ≤ 1 frame; nenhum botão gasta munição na
  fase imune.
- **Fonte:** `br-game.js` pilota a queda por `camera.getWorldDirection` (CLAUDE.md);
  C6.
- **Reinjetar:** pilotar a queda pelo `camera.quaternion` sem descontar o pitch →
  erro de direção com a vista inclinada.

### E4 · Carro
- **Limiar:** USAR entra (1 toque, dentro do alcance de interação); analógico para
  frente/trás/lados → sinal da velocidade e da guinada corretos, medidos no CARRO
  (não na tecla); USAR sai; depois de sair, C10 e C6 valem.
- **Por que a suíte não pega:** o caso do veículo entra por `teleportToCar` e
  `tryToggleCar` e confere `keys.KeyW`/`KeyD` — mede a tecla, não o carro andando.
- **Reinjetar:** inverter `KeyA`/`KeyD` no `frame()` → o carro vira para o lado errado
  com a tecla "certa".

### E5 · Helicóptero
- **Limiar:** USAR entra; ⇧ sobe e ⇩ desce (altitude medida); analógico translada;
  USAR sai; depois de sair, sem `Space`/`ControlLeft` presos; a mensagem cita os
  botões (C4); M6 vale voando.
- **Por que a suíte não pega:** nenhum teste de toque voa.

### E6 · Morte
- **Limiar:** solo: JOGAR DE NOVO e VOLTAR AO MENU tocáveis (C2) e funcionando; BR:
  a tela de morte aparece e leva ao espectador; morto não dispara (pente intacto,
  0 `shotFired`) nem recebe assistência (A1).
- **Por que a suíte não pega:** morte só é testada fora do toque.

### E7 · Espectador
- **Limiar:** trocar o espectado por toque (o alvo da câmera muda); caminho por toque
  até o menu/lobby; a dica cita botão (C4); nenhuma assistência nem tiro automático
  (A1-e) — atenção: `enterSpectator()` faz `player.dead = false`.
- **Por que a suíte não pega:** nenhum teste de toque espectador.

### E8 · Fim de partida e a próxima
- **Limiar:** do ENDED ao lobby e a uma nova partida só por toque; na nova partida,
  nenhum resíduo (C10) e o ADS desligado.
- **Por que a suíte não pega:** nenhum teste encadeia duas partidas no celular.

### E9 · Pausa e ajustes
- **Limiar:** ≡ pausa; ajustes alcançáveis (C9); sair da partida alcançável; o toque
  que retoma não dispara nem gira (C5-b).
- **Por que a suíte não pega:** o caso da pausa confere pausar e retomar, não o que o
  toque de retomar faz no mundo.

### E10 · Retrato — bloqueado e liberado *(REGRESSÃO)*
- **Limiar:** retrato com a rotação do sistema travada: aviso + JOGAR ASSIM (já
  testado); virar para retrato no meio da partida pausa e solta tudo (C10) —
  inclusive DIRIGINDO; com o retrato liberado, C2 e C3 valem em 390×844.
- **Por que a suíte não pega:** a geometria em retrato liberado nunca foi medida;
  virar dirigindo, nunca.

### E11 · Cinemática da destruição da cidade *(REGRESSÃO)*
- **Limiar:** arrasto durante a cinemática não chicoteia a câmera no fim (existe);
  dedo no gatilho volta a atirar depois (existe); nenhum botão age durante ela e
  nada fica preso (C10). A cinemática e os mísseis não são bloqueados (CLAUDE.md:
  mecânica INTENCIONAL).
- **Por que a suíte não pega:** os dois casos existentes cobrem o olhar e o gatilho;
  não o tiro automático nem o ATIRAR-que-arrasta durante ela.

### E12 · Zero erro de página no percurso inteiro
- **Limiar:** 0 `pageerror` e 0 `console.error` ao longo de E1–E11 em V2 e V3.
- **Fonte:** régua do VR, I2.

### E13 · (APARELHO) Teclado virtual — nick e chat
- **Limiar:** com o teclado do sistema aberto em paisagem, o campo em edição fica
  visível; ao fechar, o layout volta e nada fica preso (C10).
- **Por que só aparelho:** a emulação não abre teclado virtual.

### E14 · (HUMANO + APARELHO) Uma partida inteira no celular do dono
Roteiro, na ordem, com resposta binária por linha. Sem as caixas marcadas por um
humano, a rodada não está validada.

1. Abro pelo link no celular (rede declarada). Em quantos segundos o menu responde? (anotar) ☐
2. Em pé, com o giro do sistema TRAVADO: vejo o aviso e o JOGAR ASSIM? ☐
3. Deito o celular. Todo botão do menu é tocável sem zoom? ☐
4. No lobby, escrevo o nick com o teclado virtual. Vejo o que escrevo? ☐
5. Na nave, olho em volta arrastando e pulo com ⇧? ☐
6. Na queda, direciono pelo analógico e abro o paraquedas? ☐
7. No chão, ando, corro com o analógico no talo e paro. O boneco para quando solto? ☐
8. Toco em área vazia do lado esquerdo, sem controle. A arma NÃO dispara? ☐
9. Abro um baú com USAR, pego a arma e troco para ela em um toque? ☐
10. Arrasto o ATIRAR: a vista gira E a arma atira ao mesmo tempo? ☐
11. Com a DMR na luneta, o mesmo arrasto parece mover a imagem igual ao quadril? ☐
12. Contra um bot andando de lado, a mira ajuda sem puxar? Puxou para alguém que eu não via? ☐
13. Um bot me vê pela primeira vez: tenho tempo de reagir antes do primeiro dano? ☐
14. Escondido num prédio, algum bot continua atirando em mim pela parede? ☐
15. Entro no carro, dirijo, saio. O boneco não anda sozinho depois? ☐
16. Helicóptero: subo, desço, saio? ☐
17. Pauso, mudo a sensibilidade, volto. Voltar não atirou nem girou? ☐
18. Viro o celular em pé no meio da partida: pausou? Deito e retomo? ☐
19. Morro. Tela de morte, espectador, troco o espectado? ☐
20. Fim de partida: volto ao lobby e começo outra só com o dedo? ☐
21. Nada cobre vida, munição, gás ou minimapa — inclusive junto ao notch? ☐
22. Depois da partida inteira, o celular não esquentou a ponto de travar? (anotar) ☐

**Aprova:** 22 de 22. **Reprova:** 21.

### E15 · Baú e carro pelo toque, no BR *(novo, 2026-09-28)*
- **Relato do dono:** *"os baús não estavam abrindo no celular e nem estavam
  conseguindo entrar e sair do carro"*.
- **Limiar:** a partir da nave, só por toque (a regra de E: nada de
  `QA.reset`/`teleportToCar`/`tryToggleCar`): (a) cair perto de um baú, chegar a
  ele e abri-lo por USAR ou pelo aviso tocável — o item entra no inventário;
  (b) nenhum baú que não abre visível no BR (o baú de enfeite do solo);
  (c) chegar a um carro, entrar, andar e sair por USAR ou pelo aviso — e depois
  de sair, C10; (d) a ação sai no PRIMEIRO toque dentro do alcance.
- **Fonte:** relato do dono.
- **Por que a suíte não pega:** o teste de toque do baú/carro sai de perto do
  alvo por atalho de posição.

---

## 8. Placar — o que entra no denominador

| Área | Critérios | Automatizáveis | Só aparelho / humano |
|---|---|--:|---|
| M — Mira e tiro | M1–M7 | 7 | — |
| A — Assistência | A1–A9 | 8 | A9 (humano) |
| C — Controles e HUD | C1–C12 | 12 | — |
| B — Bots | B1–B14 | 13 | B13 (humano) |
| P — PvE | P1–P4 | 4 | — |
| D — Desempenho | D1–D8 | 5 | D1, D7, D8 (aparelho) |
| E — Estados | E1–E15 | 13 | E13 (aparelho), E14 (humano + aparelho) |
| **Total** | **69** | **62** | **7** |

**Denominador honesto: 62** (53 → 54 com B14 e → 62 com M7, C11, C12, P1–P4 e E15, revisões de 2026-09-28). Os 7 da última coluna só fecham com o aparelho ligado
ou com um humano, e nenhum placar pode contá-los como verdes sem isso. **A entrega
só está aprovada com 69 de 69** — os 62 automatizáveis verdes são condição
necessária, não suficiente.

Sete critérios são **regressão** do que já foi corrigido e têm de continuar
verdes em toda rodada: M1, M2, C4, D2, D6, E10 e E11.

---

## 9. O que NÃO virou critério medível, e por quê

1. **A sensibilidade padrão "confortável".** Nenhum AAA móvel publica
   sensibilidade de toque em unidade física (referência §5.2). O que se cobra é o
   menu existir e ser obedecido (C9, M3); o número padrão é do dono.
2. **Quanto da metade direita da tela tem de ser área de olhar.** Não há dado
   citável de alcance do polegar em paisagem (referência §5.12). C1 cobra o
   efeito (mirar e atirar juntos), não a área.
3. **A força "certa" da assistência.** Nenhum jogo móvel publica os parâmetros de
   toque (referência §5.1). Os números do Lyra/Fortnite são de controle. Só A9,
   com novato, fecha.
4. **Espalhamento do tiro de quadril no celular.** O fuzil tem cone de até 0,80°
   (35 cm a 25 m) e no celular se atira do quadril. Não achei fonte de espalhamento
   de quadril para toque; se o dono achar ruim, é decisão de balanceamento.
5. **Giroscópio.** Opcional em toda referência (P3-9) e fora desta rodada. Se
   entrar: desligado por padrão, só na mira, e desliga a assistência (Fortnite).
6. **Vibração/háptico.** Não pesquisado; o Safari do iOS não tem Vibration API, então
   não haveria comportamento comum aos dois aparelhos para medir.
7. **Bot por plataforma.** O bot não sabe se o humano está no celular. Se o
   desktop merece bot mais duro, e se a assistência do celular é justa contra o
   desktop no mesmo BR (o PUBG a desliga no competitivo), é decisão do dono.
8. **Dano bot→humano ×0,6 (P2.1).** A referência o põe como último recurso, depois
   de P0/P1; não é portão.
9. **Grama como esconderijo contra os bots.** Não há fonte primária de modelo de
   ocultação por vegetação (referência §6); B10 cobre só a postura. O humano
   deitado no mato continua visível para o bot — está registrado aqui, não esquecido.
10. **Legibilidade do texto do HUD.** Há textos de 9–10,5 px no celular (`style.css`:
    `#healthLabel` e `#weaponName` 9 px, `.slot` 10 px, killfeed 10,5 px). Não
    transformei em critério porque não verifiquei nesta rodada uma fonte de tamanho
    mínimo (o HIG da Apple tem uma tabela de tipografia; o número precisa ser lido
    e citado antes de virar portão).
11. **Latência do toque até o fóton, no aparelho.** Exige câmera de alta
    velocidade; a parte medível no emulador (≤ 1 frame) já está em M3.
12. **Segundos de boot em 4G real.** D6 trava os bytes; os segundos dependem da rede
    do dia e só entram como anotação em E14.

---

## 10. Procedimento de validação (reexecutar a cada rodada)

Ordem fixa. Para no primeiro vermelho e devolve a rodada com o número e a condição.

### Passo 0 — condição (senão não é medida)
```
uptime                                         # load 1 min < 1,5
ps -eo pid,etime,cmd | grep -v grep | grep -E "run-tests|server.js"   # vazio nas portas do validador
git -C /home/reis/repos/FPS-WillianIA log --oneline -1
git -C /home/reis/repos/FPS-WillianIA status --short
```
A árvore não muda e nenhuma outra frente roda teste enquanto o validador mede —
nem para integrar entrega pronta (CLAUDE.md). Portas do validador combinadas com
o orquestrador no começo da rodada; nunca a 3000.

### Passo 1 — leitura estática (pega os abertos em segundos)
```
cd /home/reis/repos/FPS-WillianIA
grep -n "addEventListener('mousedown'" -A4 game.js      # C5: olha o tipo de ponteiro?
grep -n "Touch.enabled\|pointerType" game.js js/touchcontrols.js   # A1-b
grep -n "player.dead\|__BR_espectador\|S.phase" game.js | grep -i assist   # A1-e
grep -n "function lineOfSight" -A3 scripts/bots.js      # B7, B12-c
grep -n "btns.length, 14" test/touch-controls.test.js   # C8 congelado
```

### Passo 2 — sondas automatizadas (arquivos fora do repo, nunca commitados)
Por área, na ordem M → A → C → E → D → B, cada sonda com o **mutante** de §2–§7
aplicado e desfeito (restauração conferida por sha256), provando que ela avermelha:
- **M:** projeção da bala no centro do canvas (M1, M6); impacto a 100 m (M2);
  giro por px a 30/60/120 Hz (M3); tela andada por px em cada luneta (M4);
  razão e diagonal (M5).
- **A:** par de builds (assistência ligada/desligada pelo menu) com o mesmo roteiro;
  **dois renders por frame** para a âncora de pixels de A2/A8.
- **C:** grade de `elementFromPoint` nos 6 viewports × estados (C2, C3); varredura
  de texto (C4); dublê de mouse de compatibilidade (C5); 16 direções (C6).
- **E:** o percurso inteiro por toque, do carregamento à segunda partida.
- **D:** perfhud com idade declarada (D2); embrulho de construtores (D3); retrato
  do mundo desktop × celular (D4); boot com rede limitada (D6).
- **B:** `node server.js` + bots pela flag do anfitrião + humano dublê por socket;
  `Math.random` do processo dos bots semeado; dano contado no cliente da vítima;
  o ciclo de espiada de B14 (3 s exposto / 2 s escondido, até 12 ciclos).

### Passo 3 — a peneira do repo
```
npm run lint
npm test
```
Verde não aprova nada; só libera o passo 4. Vermelho: re-rodar só o arquivo,
isolado, 2–3× com a máquina ociosa, antes de chamar de regressão (CLAUDE.md).

### Passo 4 — o aparelho (única fonte de TEMPO)
D1, D7, D8 e E13, com o celular por depuração remota e a condição escrita no laudo.

### Passo 5 — a parte humana (não delegável)
E14 no celular do dono, A9 com três novatos, B13 com o dono. A folha preenchida é
arquivada no laudo da rodada.

### Passo 6 — veredito
Uma linha por critério (M1…E14), verde/vermelho/não medido, com o número medido e a
condição ao lado. Laudo em `docs/mobile/validacao-<commit>.md`, com o placar sobre
**62**, os defeitos novos medidos e quantos deles nasceram de uma correção.
Sem "quase", sem "só falta", sem média.
