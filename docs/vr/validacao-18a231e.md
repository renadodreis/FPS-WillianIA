# Validação do porte VR — commit `18a231e`

Décima rodada de validação. Autor: o **validador**. Procedimento: §12 de
`criterio-aaa.md`. **A régua não foi tocada** (`docs/vr/criterio-aaa.md` está
byte a byte como estava).

**Condição declarada** (sem isto não é medida): commit `18a231e` na `dev`.
Máquina **ociosa o tempo inteiro** — `load average` de 1 min entre **0,16 e
0,87** em todas as leituras (declarado por medida onde importa). Chrome com GPU
real; IWER 2.3.0 preset Meta Quest 3; seed 424242; sessão `immersive-vr` real
via `test/helpers/iwer.js` → `bootEmVR`; **portas 3700–3712**, nenhuma outra,
nunca a 3000. Doze sessões imersivas próprias, mais as sessões dos arquivos de
teste do repo nas portas deles.

**A árvore de código voltou pristina.** Mutei nove arquivos ao longo da rodada
(`game.js`, `js/xr/xrrig.js`, `js/xr/xrweapon.js`, `js/xr/xrhud.js`,
`js/fpbody.js`, `js/xr/xrinput.js`, `js/xr/xrbody.js`, `js/xr/xrhaptics.js`,
`js/xr/xrinteract.js`) e mais `test/helpers/iwer.js`; **md5 conferido antes e
depois de cada mutação, todos idênticos no fim**, e `git status` fecha com os
mesmos dois não-rastreados do começo (`.codex/`, `AGENTS.md`). `npm run lint`
limpo. `node --test test/security-regression.test.js` → **9/9**. Nada foi
commitado.

---

## Placar

> **31 verdes · 4 vermelhos · 4 não medidos, em 39.**

Progressão de verdes: 14 → 19 → 22 → 22 → 23 → 25 → 26 → 25 → 27 → **31**.

**É o melhor placar das dez rodadas, e por larga margem.** Quatro vermelhos
antigos caíram — **A6 na causa que sobreviveu cinco rodadas** (a cinemática da
cidade), **C5** (a mão esquerda, que estava a 0,17–0,64 m do guarda-mão),
**I3** (a malha do corpo dentro do olho, dez de dez poses fora) e **H2** (os
painéis colados na cara). **B5**, que estava "NÃO MEDIDO" há nove rodadas
porque não existia segunda mão, foi medido e **passa com 1,15° de erro** contra
teto de 2°.

**Defeitos que reprovam e que nasceram de uma correção desta rodada: 0.**
Nenhum dos quatro vermelhos foi criado por uma correção. Mas — e isto é o
achado central do laudo — **uma AFIRMAÇÃO desta rodada é falsa na metade que
importa, e o teste escrito para prová-la não pode falhar** (§4.2). E há mais
**sete casos de teste desta rodada que passam por acidente**, seis deles
provados com o defeito reinjetado e o número na mão (§5).

| categoria | verdes | vermelhos | não medidos |
|---|--:|--:|--:|
| A · giro e locomoção | 5 | **1** (A6) | 0 |
| B · mira e empunhadura | 6 | **1** (B7) | 0 |
| C · corpo e escala | 4 | **1** (C2) | 1 (C4) |
| D · interação | 5 | 0 | 1 (D6) |
| E · desempenho | 0 | **1** (E2) | 0 |
| F · boot e sessão | 4 | 0 | 0 |
| G · imagem | 2 | 0 | 1 (G2) |
| H · HUD no mundo | 3 | 0 | 0 |
| I · defeito grosseiro | 2 | 0 | 1 (I4) |

Fora do denominador, os **8 que nenhuma máquina fecha** (E1, E3, E4, E5, F1,
G4, G5, I1) continuam `aguardando aparelho`/`aguardando humano`. **G5 está na
décima rodada sem captura estéreo**: `output/vr/` continua com o único PNG
`baseline-quest.png`, de 25/08, e o único artefato de sessão humana continua
sendo o **ENSAIO** de 27/08 que diz em negrito que nada foi medido.

---

## 1. Veredito, um por critério

### A — Giro e locomoção

| # | veredito | medido |
|---|---|---|
| A1 · giro não translada a cabeça | **APROVA — medido** | Passo de 45°, cabeça a 0,70 m do pivô, **8 direções × 2 sentidos = 16 casos**: deslocamento do **centro do visor** = **0,018082 m** em todos (teto 0,02), amostrado com `matrixWorld` da `ArrayCamera` **depois do render**. Por olho: 0,030136 m — meia IPD girando, como na rodada 9. Ângulo do passo: **45,000°** exatos nos 16. |
| A2 · passo é escolha do jogador | **APROVA — medido, não herdado** | `xrturn.js` mudou 52 linhas. Passos pedidos × medidos: **30/30,000 · 45/45,000 · 60/60,000 · 90/90,000 · 15/15,000 · 10/10,000**; 120 trava em 90 (limite declarado). Suave pedido × medido: **30/29,994 · 60/59,988 · 180/180,000 · 360/360,503 °/s**; 500 trava em 360. Todos dentro de ±0,5. O painel existe no mundo a **0,9805 m** do olho, filho da `Scene`. |
| A3 · velocidade humana | **APROVA — medido** | Caminhada **1,6930 m/s** (teto 2,0), corrida **2,8000 m/s** (teto 4,0). |
| A4 · aceleração instantânea | **APROVA — herdado** | `js/xr/xrlocomotion.js` e `js/xr/xrcomfort.js` **intocados** desde `49a5eb2` (`git diff` vazio). Exceção declarada de `paridade` inalterada. |
| A5 · vinheta some ao parar | **APROVA — herdado** | `xrcomfort.js` intocado (`git diff` vazio). |
| A6 · nada além do pescoço move a vista | **REPROVA — mas as causas de cinco rodadas MORRERAM** | Ver §2.1 e §2.2. |

**A6, detalhado.** As três causas que o critério nomeia foram medidas e
**passam**:

| estado (cabeça PARADA, 2 s, 120 frames) | desloc. de mundo | giro | FOV |
|---|--:|--:|--:|
| jogando | **0,00000 m** | **0,0000°** | 89,9968 constante |
| atirando | **0,00000 m** | **0,0000°** | 89,9968 constante |
| tomando dano | **0,00000 m** | **0,0000°** | 89,9968 constante |
| pausado | **0,00000 m** | **0,0000°** | 89,9968 constante |
| morto | **0,00000 m** | **0,0000°** | 89,9968 constante |
| **cinemática da cidade, rodando de verdade** (180 frames) | **0,00000 m** | **0,0000°** | 89,9968 constante |
| **1 s depois da cinemática sair** (90 frames) | **0,00000 m** | **0,0000°** | 89,9968 constante |
| dirigindo | 2,5600 m — **e o carro andou 2,5789 m** | 0,0000° | constante |

A cinemática **aconteceu** (`Structures.city.getState() === 'destroyed'`,
`state.cinematic` voltou a `false`), e `camera.children` durante ela é
`['xrComfort:true']` — a vinheta **não** foi escondida por índice. Dirigindo, a
câmera anda porque o **carro** anda: separação vista↔colisor de **0,0357 m** ao
fim de 2,5 m de rolagem. Isso é locomoção comandada, não empurrão de câmera.

**O que ainda reprova A6 está em §2.2:** ao fechar o painel de pausa (ou ao a
bandeira `cinematic` cair) depois de 1 m de passo físico, **a vista salta
1,000 m num frame** com a cabeça parada.

### B — Mira e empunhadura

| # | veredito | medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | **APROVA — medido, não herdado** | `\|empunhadura do modelo (`gun.parts.handR`) − `gripSpace`\|` em **8 poses × 8 armas = 64 medidas**: **0,00000 m** em todas (teto 0,03). |
| B2 · 1:1 sem bob nem sway | **APROVA — medido, não herdado** | Deriva da pose da arma **no referencial do `gripSpace`**, 20 amostras: parado **0,000000 m**, andando no batente **0,000000 m** (teto 0,001). Era 2,4 mm e 55 mm na linha de base. |
| B3 · dá para ver pelo buraco | **APROVA — com a ressalva de sempre** | Tiro real do gatilho: ângulo entre a direção do tiro e o **cano** (âncora independente: o nó `muzzle` do modelo) = **0,0000°** nas 8 armas. O ângulo contra a linha de mira também dá 0,0000° e **não vale** — é a tautologia que o CLAUDE.md documenta (`_rayDir.copy(_miraDirDoTiro)`). |
| B4 · botão de mirar não teleporta | **APROVA — medido, e o relato do dono fechou** | Apertar o grip: salto da arma no referencial do grip = **0,00000 m**. `mouse.aiming` = **false** nos quatro instantes (antes, segurando, soltando, depois do 2º clique); `XRArma.ads()` = **0,0000** nos quatro. A bandeira invisível morreu. O trabalho VISÍVEL existe e é o coldre: **0,64592 m** de movimento, só no coldrear deliberado. |
| B5 · segunda mão importa | **APROVA — PRIMEIRA MEDIÇÃO EM DEZ RODADAS** | Ver §2.3. Erro ≤ **1,15°** em 8 medições, teto 2°. |
| B6 · háptico em toda ação | **APROVA — herdado** | `test/xr-haptics.test.js` verde na linha de base (parte dos 70/70 de §4.1); `xrhaptics.js` mudou 36 linhas e o arquivo de teste dele acompanha. Não re-medi por sonda própria. |
| B7 · o tiro sai do cano | **REPROVA — idêntico, dígito por dígito, à rodada 9** | Ver §2.5. |

### C — Corpo, altura e escala

| # | veredito | medido |
|---|---|---|
| C1 · nunca enterrado | **APROVA na régua oficial — medido** | Régua do critério (`cabeçaY − chãoSólidoSob(cabeçaXZ)`), caminhando 24 s em campo aberto nas quatro direções, **262 amostras**: folga **1,6052 – 1,6082 m**, amplitude **3,0 mm**, **0 frames fora da janela 1,20–2,10**. Sobre o BONECO (que é a queixa do dono), ver §2.6: contra o plano do rig ele fica em **0,00000 m** na faixa 1,15–1,70 m; contra o TERRENO chega a **+0,0416 m enterrado** numa encosta de 31,9°. |
| C2 · o corpo segue a cabeça | **REPROVA — 1,0236 m com o painel aberto** | Passeio físico canônico (quadrado de 2 m, 192 amostras, 8,5 s): separação máxima **0,0236 m** ✔ com folga de 4× no teto de 0,10 (era 0,0753 na rodada 9). **Mas com o painel de pausa aberto ou a cinemática rodando, 1 m de passo físico dá separação de 1,0236 m e o colisor anda 0,0000 m.** §2.2. |
| C3 · altura do aparelho, agachar | **APROVA — medido** | Folga da cabeça ao piso contra `dev.position.y` em 11 alturas de 0,75 a 2,00 m: a folga acompanha o aparelho com erro **constante de 0,003 m** (teto 0,02). |
| C4 · escala 1:1 em metros | **NÃO MEDIDO** | **Décima rodada.** |
| C5 · corpo em 1ª pessoa coerente | **APROVA — o vermelho mais antigo do bloco caiu** | Ver §2.3. Mão direita → empunhadura **5,3e-8 a 4,7e-3 m**; **mão esquerda → `gripSpace` 8,7e-8 a 2,4e-7 m em 8 de 10 poses** (era 0,1742–0,6440 m). As duas exceções são anatômicas e declaradas. Malha → olho **0,18068 m** no pior caso (teto 0,15). |
| C6 · o avatar que os OUTROS veem | **APROVA — herdado** | Com a ressalva de C2 nos dois estados de §2.2. |

### D — Interação com o mundo

| # | veredito | medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | **APROVA — herdado** | |
| D2 · alcance medido da cabeça | **APROVA — herdado** | `js/interact.js` mudou 10 linhas (a porta do agarre, §2.4); a régua de alcance não mudou de semântica. |
| D3 · pegar é com a EMPUNHADURA, e perto | **APROVA — medido, não herdado** | Três cenários, com a mão do jogador posta pela geometria do MODELO: mão no guarda-mão → modo **`apoio`**, `duasMaos` true, `gripOcupado` true (não agarra o mundo); mão a 0,55 m da arma e longe do peito → modo **`agarrar`**; mão a 0,2119 m do peito com pente vazio e reserva cheia → modo **`pente`**, estado **`aguardando-pente`**, pente na mão. §2.4. |
| D4 · affordance dentro do mundo | **APROVA — medido** | O disco do radial aparece no grafo da cena ao abrir (gatilho esquerdo), a **0,5415 m** do olho, filho da `Scene` — varrido por `scene.traverse` com a cadeia de pais inteira checada, não perguntando ao módulo. |
| D5 · veículo sem quebrar cabeça nem chão | **APROVA — medido** | Entrou e saiu do carro dentro da sessão; dirigindo, a vista acompanha o carro com **0,0357 m** de separação vista↔colisor, e nenhum frame de A6 fora. |
| D6 · tudo alcançável de posição fixa | **NÃO MEDIDO** | **Décima rodada.** |

### E — Desempenho

| # | veredito | medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | **`aguardando aparelho`** | — |
| E2 · orçamento em estéreo | **REPROVA — e é o vermelho mais teimoso do laudo** | Ver §2.7. |
| E3 · escala de render ≥ 85 % | **`aguardando aparelho`** | — |
| E4 · lógica de app ≤ 2 ms | **`aguardando aparelho`** | — |
| E5 · térmica 30 min | **`aguardando aparelho`** | — |

### F — Boot e ciclo de sessão

| # | veredito | medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | **`aguardando aparelho`** | — |
| F2 · foco perdido | **APROVA — herdado** | `js/xr/xrsession.js` intocado desde `49a5eb2`. |
| F3 · recentrar não teleporta nem enterra | **APROVA — herdado, com ressalva viva** | `js/xr/xrrig.js` intocado desde `49a5eb2`. A ressalva: o guarda de `PASSO_HUMANO_MAX` que o F3 protege é exatamente quem produz o salto de 1,000 m de §2.2 — ali ele recebe um pulo FALSO, fabricado por outro estado do jogo. O guarda está certo; quem o alimenta errado não é ele. |
| F4 · sair devolve o desktop intacto | **APROVA — herdado** | |
| F5 · jogável de ponta a ponta | **APROVA — herdado** | |

### G — Qualidade de imagem

| # | veredito | medido |
|---|---|---|
| G1 · foveação declarada | **APROVA — herdado** | `js/xr/xrquality.js` intocado. |
| G2 · antialiasing em XR | **NÃO MEDIDO** | O IWER não expõe `samples` do alvo XR. **Décima rodada.** |
| G3 · escala de framebuffer declarada | **APROVA — herdado** | |
| G4 · texto e mira legíveis | **`aguardando humano`** | — |
| G5 · uma captura por entrega | **`aguardando humano`** | `output/vr/` continua com **um** PNG, `baseline-quest.png`, de 25/08. **Décima rodada sem captura estéreo.** |

### H — HUD e UI dentro do mundo

| # | veredito | medido |
|---|---|---|
| H1 · nada essencial só no DOM | **APROVA — medido, e com uma ressalva GRAVE de teste** | O aviso central vira objeto no grafo da cena a **1,0284 m** do olho depois de `centerMsg`, filho do `xrRig` — varrido por `scene.traverse` procurando o nome, sem perguntar ao módulo. **Mas o teste que protege isso não protege nada: §5.1.** |
| H2 · UI não é colada na cara | **APROVA — o vermelho de três rodadas caiu** | Ver §2.8. Nenhum painel ancorado na cabeça. |
| H3 · o retículo não mente | **APROVA** | Por ausência declarada. |

### I — Ausência de defeito grosseiro

| # | veredito | medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | **`aguardando humano`** | **Zero caixas em dez rodadas.** |
| I2 · zero erro de console | **APROVA — medido** | `pageErrors` e `consoleErrors` vazios nas **doze sessões imersivas** desta rodada, inclusive na que rodou a cinemática inteira da cidade. Ressalva de sempre: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | **APROVA — o vermelho caiu, e caiu com folga** | Ver §2.3. **0,18068 – 0,34488 m** em dez poses, contra teto de 0,15. Era 0,0314–0,0864 e **nenhuma** das dez passava. |
| I4 · nenhum estado sem saída | **NÃO MEDIDO** | Faltam nave, queda livre, paraquedas, espectador e fim de partida. |

---

## 2. O que mudou, auditado

### 2.1 · A cinemática da cidade — o vermelho de cinco rodadas morreu, e eu conferi pelos dois lados

`city-destruction-client.js` mudou 88 linhas e `br-game.js` mudou 30. **A
leitura estática fecha:** `grep` por `camera.quaternion` / `camera.fov` /
`camera.getWorldDirection` / `MP.camera.position` em todo o código de produção
fora de `js/xr/` e de `test/` devolve **cinco linhas em dois arquivos**, e
todas as cinco estão atrás de uma porta de XR (`if (!emXR())`, ou o ramo `else`
de `if (rigXR)`). As três causas nominais do critério — `br-game.js:776`,
`:985` e `:1875` lendo `MP.camera.quaternion` — **não existem mais**.

**E a medição concorda com a leitura.** Rodei a cinemática de verdade (`sync`
com `cinematicStartedAt`/`impactAt` curtos, esperei `state.cinematic === true`)
com a cabeça parada, gravando a pose de mundo do visor **depois do render**:

```
durante a cinemática (180 frames) ... deslocamento 0,00000 m · giro 0,0000° · FOV 89,9968 fixo
1 s depois de ela sair (90 frames) .. deslocamento 0,00000 m · giro 0,0000° · FOV 89,9968 fixo
camera.children durante ............ ['xrComfort:true']   (a vinheta NÃO foi escondida)
a cidade ........................... 'destroyed'
```

O evento continua acontecendo — que é o invariante do projeto — e o
enquadramento saiu. **Fechado.**

### 2.2 · O painel aberto congela o corpo, e fechá-lo TELEPORTA a vista 1,000 m

Este é o meu achado desta rodada, e ele reprova **A6 e C2** ao mesmo tempo.

A entrega 4 (`b252b27`) afirma "**passo físico 1:1 nos três estados**". Medi os
três com uma régua independente do produto: o passo é `dev.position`, que sou eu
quem escreve; a vista é o centro do visor lido de `matrixWorld` depois do
render; e o corpo é `player.pos`, que nenhum dos dois toca.

| estado | passo da cabeça | **vista** | **colisor** |
|---|--:|--:|--:|
| a pé | 0,500 m | **0,5000 m** | **0,5000 m** ✔ |
| cinemática | 0,500 m | **0,5000 m** | **0,0000 m** ✘ |
| painel de pausa | 0,500 m | **0,5000 m** | **0,0000 m** ✘ |

**A afirmação é verdadeira para a VISTA e falsa para o CORPO em dois dos três
estados.** E a consequência é pior que a separação. Repeti com 1,0 m de
caminhada e medi o que acontece ao FECHAR:

```
cenário: painel de pausa aberto, jogador anda 1,0 m fisicamente
  vista andou com o painel aberto ....... 1,0000 m   (certo: rastreio nunca pode parar)
  colisor andou com o painel aberto ..... 0,0000 m
  separação cabeça↔corpo ................ 1,0236 m   (teto de C2: 0,10 m)
  >>> SALTO DA VISTA AO FECHAR .......... 1,0000 m  EM UM FRAME, cabeça parada
  colisor andou ao fechar ............... 0,0000 m
  separação depois ...................... 0,0236 m
  XR.foraDoCorpo ........................ 0,0000 m  (o rig não sabe que esteve fora)
  cortina de conforto ................... não acendeu (é alimentada por foraDoCorpo)

cenário: bandeira `cinematic` — números IDÊNTICOS, dígito por dígito.
cenário de controle: em jogo normal, separação 0,0236 m e salto 0,0000 m.
```

**O mecanismo.** Com `state.paused` ou `state.cinematic`, `applyFpsCamera` não
roda (`game.js:3920` desvia para `Touch.takeLook()`; o ramo de pausa retorna
antes), então `XR.place()` não é chamado e `atualizarPose()` para de correr. A
câmera continua sendo escrita pelo three — certo, e obrigatório. Quando o painel
fecha, `place()` volta e recebe **o metro inteiro de uma vez**. Isso estoura
`PASSO_HUMANO_MAX` (0,35 m), o guarda classifica como recentrar/rebase — o que é
a decisão certa para o sinal que ele recebe — e **descarta**. Resultado: o rig
reposiciona a cabeça sobre o corpo e **o mundo desliza 1 m debaixo de um jogador
parado**.

Não há cortina no caminho (`foraDoCorpo` = 0), então isso chega inteiro nos
olhos. Em VR, 1 m de mundo deslizando num frame com o ouvido interno em silêncio
é o estímulo que o Oculus BP proíbe nominalmente.

**Atribuição honesta:** o congelamento em si é **anterior** a esta rodada —
`XRUI.abrir('pausa')` e o desvio de `state.cinematic` já existiam em `49a5eb2`
(conferi no `git show`). O que é **novo desta rodada** é a **afirmação** de que
o passo físico chega 1:1 nos três estados, e o **teste escrito para prová-la,
que não pode falhar** (§5.2). Ou seja: nenhum vermelho nasceu de uma correção,
mas uma correção declarou fechado um buraco que continua aberto, e trouxe uma
régua cega junto.

**O caminho de reprodução** está em
`/tmp/.../probe/pH-final.test.js`, caso `C2 · o que acontece ao FECHAR o painel`.

### 2.3 · O corpo — três vermelhos caíram de uma vez, e este é o melhor conserto da rodada

**A mão esquerda fechou.** Ela era, nas palavras da rodada 9, "metade do defeito
que o dono descreveu, e o que ele vai ver primeiro". Punho do boneco contra o
`gripSpace` do controle, dez poses, medido por **osso** (`bone.matrixWorld`),
nunca por `Box3`:

| pose | mão DIREITA → grip | mão ESQUERDA → grip (rodada 9 → agora) |
|---|--:|--:|
| quadril | 5,3e-8 | 0,2391 → **1,07e-7** |
| pronto | 7,4e-8 | 0,2955 → **1,04e-7** |
| no olho (duas mãos) | 4,7e-3 | 0,3023 → **1,37e-7** |
| estendido | 1,6e-7 | 0,6440 → **0,0119** |
| para cima | 1,8e-7 | 0,4998 → **2,44e-7** |
| no peito | 8,9e-8 | 0,1742 → **9,27e-8** |
| lado esquerdo | 5,9e-8 | — → **1,65e-7** |
| lado direito | 1,5e-7 | — → **8,66e-8** |
| atrás | 1,2e-7 | — → **1,71e-7** |
| baixo (0,60 m) | 7,8e-8 | — → **0,2123** |

As duas exceções são **anatomia, não defeito**, e as duas conferem: em
"estendido" o alvo está a 0,628 m de um braço de 0,588 m (déficit 0,040, resíduo
0,012); em "baixo" o alvo está a ~0,89 m do ombro, ou seja **0,30 m fora do
alcance**, e o resíduo de 0,212 m é menor que o déficit. `FpBody.punhoLivre`
sai 1,0000 na mão livre e 8,1e-5 com a arma apoiada — a máquina troca de dono
como declarado.

**I3 fechou, e fechou com folga.** Varredura de **todos os 2 631 vértices
skinados** (3 `SkinnedMesh` visíveis: 728 + 175 + 1 728), por
`getVertexPosition` + `localToWorld`, com o olho lido depois do render:

| pose | mín. malha↔olho (rodada 9 → agora) |
|---|--:|
| de pé | 0,0846 → **0,33495** |
| olhando −70° | 0,0683 → **0,31126** |
| olhando +60° | 0,0864 → **0,33430** |
| yaw +60° | 0,0864 → **0,32481** |
| yaw −60° | — → **0,32378** |
| agachado 1,10 | 0,0509 → **0,28185** |
| agachado 0,90, −50° | — → **0,18068** ← pior caso |
| alto 1,95 | — → **0,34488** |
| inclinado de lado | — → **0,32423** |
| braços para cima | 0,0314 → **0,19484** |

Teto 0,15. **Dez de dez passam**, contra zero de dez na rodada 9.

**Aviso de instrumento, para quem repetir:** `FpBody.olhoMin` (a API do produto)
discorda da varredura em até 0,26 m — é a varredura ROLANTE de 256 vértices por
frame que a skill documenta. Ela serve para ACUSAR, nunca para absolver. Os
números acima são varredura completa minha.

### 2.4 · A mão de apoio parou de abrir baú — e o mecanismo tem prioridade declarada

Medido pelo efeito, com a mão do jogador posta pela geometria do **modelo** (a
âncora `supportHand` do perfil, levada ao mundo por `gun.group.localToWorld`, e
o `gripSpace` iterado até chegar nela):

```
mão no guarda-mão + grip .... modo 'apoio'   · duasMaos true  · gripOcupado true
mão a 0,55 m da arma ........ modo 'agarrar' · duasMaos false · gripOcupado false
mão a 0,2119 m do peito,
  pente 0/30, reserva 60 .... modo 'pente'   · estado 'aguardando-pente' · pente na mão
```

E o desempate está certo: com o **pente cheio**, a mão no peito devolve
`agarrar`, não `pente` — porque `temTrabalho` (`mag < magSize && reserve > 0`) é
a mesma pergunta que o `startReload` faz. Levar a mão ao peito com a arma cheia
não pode travar o agarre, e não trava. **Entrega 6 confirmada.**

**Recarga por gesto, cinco estados, medida no diário de frames:**
`ociosa → pente-fora → aguardando-pente → encaixando → ociosa`, com
`mag 0 → 30` e `reserve 60 → 30`. **Entrega 5 confirmada.**

**Escopeta cartucho a cartucho:** com a recarga em curso, `porCartucho: true` e
estado `cartucho-relogio`; o pente foi de 2 para 6 (teto `magSize`) e a reserva
de 30 para 24. **Entrega 7 confirmada na existência**; o ramo por **gesto** (que
é o que a entrega vende) eu só alcancei parcialmente — declaro em §6.

### 2.5 · B7 — sete de oito, com os MESMOS números da rodada 9

Tiro real do gatilho, uma arma por vez, `|origemDoTiro − canoPosDoTiro|`
congelado no instante do disparo:

| arma | origem → cano | teto |
|---|--:|--:|
| BAZUCA "TROVOADA" | **0,0000** ✔ | 0,05 |
| SNIPER "AGULHA" | 0,0589 ✘ | 0,05 |
| DMR "FALCÃO" | 0,0700 ✘ | 0,05 |
| FUZIL "VAGALUME" | 0,0910 ✘ | 0,05 |
| ESCOPETA "RAJADA" | 0,0920 ✘ | 0,05 |
| ESCOPETA "TROVÃO" | 0,1810 ✘ | 0,05 |
| PLASMA "VISITANTE" | 0,2000 ✘ | 0,05 |
| FACA "AURORA" | 0,4367 ✘ | 0,05 |

**São os oito números da rodada 9, dígito por dígito.** Nada mudou, e nada
deveria ter mudado: **B7 e B3 são geometricamente incompatíveis** enquanto a
alça deste jogo ficar 6 a 20 cm acima do cano, e a decisão está com o dono há
**cinco rodadas**. O teto do TESTE foi afrouxado na época com o motivo escrito
no arquivo; o texto do CRITÉRIO continua intocado, como deve. **Eu continuo
marcando B7 como vermelho, e continuo não tendo autoridade para mudar isso.**

A FACA não é B7 e continua não sendo: 0,4367 m de origem, com o golpe nascendo
no nó de mira 44 cm atrás da lâmina. É B3 e D3 na arma branca, e continua aberta
desde a rodada 9.

### 2.6 · O boneco e o chão — a régua oficial passa; o boneco em ENCOSTA não

A régua de C1 é a folga da CABEÇA, e ela passa com folga (§1). A queixa do dono
é o BONECO, e a entrega 3 afirma "pior caso −0,005 m". Medi o vértice skinado
mais baixo contra **duas** referências, porque elas divergem e a diferença é o
achado:

Em terreno plano (declive 1,4° no ponto, 6,9–10,7° sob o pé):

| altura da cabeça | contra o **plano do rig** | contra o **terreno** |
|--:|--:|--:|
| 2,00 | −0,39942 (flutua 40 cm) | −0,38114 |
| 1,85 | +0,00067 | +0,02158 |
| 1,70 | **0,00000** | −0,00576 |
| 1,55 | **0,00000** | −0,01131 |
| 1,40 | **0,00000** | −0,01837 |
| 1,25 | **0,00000** | −0,02405 |
| 1,15 | **0,00000** | −0,02797 |
| 1,05 | **0,00000** | −0,03083 |
| 0,95 | **0,00000** | −0,02405 |
| 0,85 | +0,02139 | +0,03034 |
| 0,75 | +0,01760 | +0,04157 |

(positivo = ABAIXO do chão)

Em encosta de 27–32°:

| altura da cabeça | contra o rig | contra o terreno | declive sob o pé |
|--:|--:|--:|--:|
| 1,85 | +0,00067 | +0,01662 | 27,2° |
| 1,70 | +0,01016 | −0,01197 | 27,2° |
| 1,40 | 0,00000 | **+0,02708** | 31,9° |
| 1,15 | 0,00000 | +0,01711 | 31,9° |

E caminhando pela encosta, 40 amostras: **pior enterro +0,03989 m**.

**Leitura.** Contra o plano do rig — que é o que `test/xr-corpo-piso.test.js`
mede — o conserto é excelente: **0,00000 m em sete alturas seguidas** na faixa
1,15–1,70. Contra o TERRENO, que é o que o jogador vê, sobra a diferença entre
um piso plano de sala e um relevo: até **4,2 cm** de pé enterrado em encosta e
até **3,0 cm** de pé flutuando. **Não reprovo C1 por isso** — a régua do
critério é a folga da cabeça e ela passa —, mas registro que a queixa "o boneco
parece às vezes enterrado no chão" tem um resíduo medido de ±4 cm que a suíte
não vê, **porque a régua do teste é um plano e o mundo é um relevo**.

Um caso separado, e este eu considero defeito de verdade embora fora da janela
do critério: com a cabeça a **2,00 m** o boneco **flutua 0,399 m**. A causa está
em `js/xr/xrbody.js:229-238`: `alturaDePe` é "a maior altura SUSTENTADA" e só
sobe depois de `SUSTENTA`; enquanto ela não sobe, `escala` fica presa na altura
antiga e `alturaCorpo = alturaCabeca` levanta a raiz inteira. Um jogador de
2,13 m de estatura, ou qualquer um que erga o headset acima da cabeça, vê o
próprio corpo desgrudar do chão por até 40 cm. A janela de C1 vai até 2,10 m, e
2,00 m está dentro dela.

### 2.7 · E2 — mediu, não passou, e mal se mexeu

`node scripts/vr-emulado.js --port=3707` (load 0,82 no minuto — irrelevante:
são contagens, não tempo):

| pose | estéreo (calls / tris) | **por olho** | teto |
|---|---|---|---|
| menu | 344 / 996 334 | **172,0 / 498,2 k** ✔ / ✔ | 180 / 500 k |
| spawn | 358 / 1 012 712 | **179,0 / 506,4 k** ✔ / **✘** | 180 / 500 k |
| cidade | 370 / 844 108 | **185,0 / 422,1 k** **✘** / ✔ | 180 / 500 k |
| castelo | 399 / 1 145 560 | **199,5 / 572,8 k** **✘** / **✘** | 180 / 500 k |

Contra a rodada 9 (172 / 180 / 184 / **200,5** calls e 498,6 k / 506,8 k /
416,7 k / **584,9 k**): o castelo devolveu **1 draw call e 12,1 k triângulos por
olho**, e a cidade **piorou 1 call**. Nenhuma pose entra no teto de 200/1,5 M da
Meta, mas o teto interno de 180/500 k — que o próprio critério manda usar por
ser o mais apertado — reprova em **duas** poses de quatro nos draw calls e em
**duas** nos triângulos.

**E o teste que dizia contar isso não conta:** §5.6.

### 2.8 · H2 — o vermelho caiu, e caiu porque os painéis andaram para trás

Varredura da cena procurando tudo que começa com `xr`, com `visible` conferido
em toda a cadeia de pais e a distância lida contra o centro do visor
pós-render:

| painel | rodada 9 | **agora** | pai (cadeia) |
|---|--:|--:|---|
| mapa | 0,3777 ✘ | **0,7621** ✔ | Group → xrRig → Scene |
| pulso | 0,3956 ✘ | **0,7024** ✔ | Group → xrRig → Scene |
| munição/arma | 0,5520 | **0,4773** ✔ | Group → Group → xrRig → Scene |
| disco do radial | 0,4667 | **0,5415** ✔ | **Scene** (ancorado no mundo) |
| painel de menu/pausa | — | **0,9805** ✔ | **Scene** |
| vinheta de conforto | — | 0,0236 | **PerspectiveCamera** — filha da câmera **de propósito** |

Aplico a **mesma leitura da rodada 9** ("a régua pede ≥ 0,45 m"): os quatro que
reprovavam por estar abaixo de 0,45 agora estão acima, e **nenhum painel está
ancorado na cabeça**. A única filha da câmera é a vinheta de conforto, e ela
tem de ser — a skill documenta que presa a outro pai ela escorrega quando o
jogador vira a cabeça, o que é pior que não ter vinheta. **APROVA.**

Declaro a leitura para quem discordar: o contador de munição a **0,4773 m** fica
abaixo do "nada mais perto que 0,75 m para leitura demorada". Considerei-o
**olhada**, não leitura demorada, e por isso na faixa de 45 cm da diretriz da
Meta. Se o dono ler diferente, H2 volta a vermelho com esse único número — e a
decisão é dele, não minha.

### 2.9 · A locomoção analógica e o giro — as duas entregas que eu tentei derrubar e não consegui

**Entrega 1 (`8dcd9da`), direção.** 16 ângulos de polegar (de 0° a 337,5° de
22,5 em 22,5), inclinada 0,60, contra régua **independente do produto** (o vetor
pedido reconstruído do yaw do rig que eu comando e do quaternion da cabeça que
eu comando):

```
erro máximo em 16 ângulos ......... 1,21e-6 °
```

E o complementar, que é o que pega o mutante `camera.quaternion`: com o rig
girado 0/90/180/−75° e a cabeça girada +35°/−50° por cima:

```
erro máximo em 6 combinações ...... 7,34e-6 °   (deslocamento real 0,730–0,734 m em todos)
```

**Velocidade e zona morta**, varredura fina (`player.vel` em regime, média de 10
amostras por ponto):

| inclinada | 0,10–0,18 | 0,20 | 0,25 | 0,30 | 0,40 | 0,60 | 0,80 | 0,85 | 0,90 | 0,95 | 1,00 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| m/s | **0,000** | 0,0505 | 0,1769 | 0,3032 | 0,5559 | 1,0613 | 1,5667 | **1,6930** | 1,6930 | **2,8000** | 2,8000 |

Reta perfeita de 0,20 a 0,85 (coeficiente 2,527 m/s por unidade de curso),
**intercepto em 0,1800** — a zona morta declarada, medida. A caminhada chega ao
cheio em 0,85 (`ANDAR_CHEIO`) e a corrida entra em 0,92 (`CORRER_TILT`), **sem
banda morta entre as duas**. As três queixas que a entrega listou — oito
direções, uma velocidade só, zona morta efetiva de 0,2805 — estão as três
mortas.

**Entrega 2 (`6149920`), giro desligável.** O modo `desligado` foi atacado pelos
dois ramos, que é onde a lição do repo diz que se erra:

```
vindo de 'suave',  analógico no talo 1,5 s para cada lado ... giro 0,000° · rig 0,000°
vindo de 'passos', mesmo roteiro ............................ giro 0,000° · rig 0,000°
```

**E a refutação do relato do dono confere.** Com o giro DESLIGADO, girando só a
cabeça em 7 ângulos (0, 30, 90, 150, −60, −135, 180°) e andando para a frente:

```
erro máximo do RUMO ANDADO contra a cabeça ....... 7,24e-6 °
erro máximo do yaw da vista ...................... 7,24e-6 °
erro máximo do minimapa .......................... 7,24e-6 °
```

O corpo sempre seguiu a cabeça. **Refutação confirmada, com o rumo andado —
que é medida física — e não só com a leitura do yaw.**

---

## 3. Anti-cheat — não reaberto

`node --test test/security-regression.test.js` → **9/9**, com a régua de alcance
(`js/interact.js`), a arma e a origem do tiro todas mexidas nesta rodada. Sem
regressão.

---

## 4. O ITEM 9 — as três réguas mexidas ainda reprovam produto quebrado?

**Veredito: SIM. As três continuam armadas. Foi conserto de régua, não
afrouxamento.** Reinjetei o defeito que cada uma deveria pegar e publico o par
de números.

### 4.1 · A linha de base

```
node --test --test-concurrency=1 test/xr-aviso.test.js \
    test/xr-controle-anda.test.js test/xr-haptics.test.js
→ 70 testes · 70 passam · 0 falham · 88,9 s   (load 1 min: 0,26)
```

Nenhum dos três é lento, nenhum precisou de re-rodada, e a triagem foi feita com
a máquina ociosa — que é a condição que a lição do CLAUDE.md exige e que estava
faltando quando o runner os promoveu a "regressão real".

### 4.2 · `xr-aviso.test.js` (`f29853a`) — a espera por CONDIÇÃO

**A asserção não mudou:** `assert.ok(r.updates > 10, ...)`. O que mudou é que a
contagem é sondada até 12 s em vez de lida uma vez depois de 600 ms fixos.

**Reinjeção:** `game.js:3960`, `if (xrOn) XRHud.update({...})` →
`if (false && xrOn) XRHud.update({...})` (a fiação viva morre).

```
produto intacto ..... 9 de 9 verdes
defeito reinjetado .. 1 verde, 8 VERMELHOS
                      erro literal: "em 12 s o game.js chamou XRHud.update
                                     só 0 vezes — sem fiação viva não há o que medir"
```

**Não foi afrouxada.** Máquina lenta demora mais; fiação morta continua
reprovando, e reprova com o número.

### 4.3 · `xr-controle-anda.test.js` (`7147f04`) e `bootEmVR` (`18a231e`) — a espera pelas fontes

**A asserção não mudou:** `assert.equal(r.length, 2, ...)`, `deepEqual(['left',
'right'])`, perfil `meta-quest-touch-plus`.

A pergunta que importa é a que o commit se propôs: **a espera OBSERVA ou
FABRICA?** Reinjetei uma sessão que nunca entrega controle —
`test/helpers/iwer.js`, `dev.primaryInputMode = 'controller'` → `'hand'`:

```
produto intacto ......... 32 de 32 verdes
sessão sem controle ..... 15 subtests VERMELHOS em 5 describes
   "analógico no batente por 1 s moveu 0.000 m: a entrada não chega no jogo"
   "andou 0.00 m numa direção com alinhamento 0.00 com a vista"
   "segurou o gatilho e saíram 0 balas de uma automática"
   "girar a mão 60° moveu a mira só 0.0°"
   "correndo e a periferia só fechou 0%"
   (o arquivo inteiro levou 67 s — o teto de 20 s do bootEmVR disparou e o
    teste falhou na PRÓPRIA asserção dele, com o número dele)
```

**A espera não fabrica nada.** Ela custa tempo quando a condição não vem, e o
teste morre na régua dele.

**E a divergência documentada continua exatamente onde estava** — testei porque
é o guarda que mais importa neste arquivo. Reinjetei o defeito histórico
(`js/xr/xrinput.js`, `comoLista` → `Array.isArray(v) ? v : []`, que descarta os
dois controles todo frame no aparelho):

```
xr-controle-anda + xr-andar-analogico ... 35 de 35 VERDES  (não pegam — o IWER
                                          declara `class XRInputSourceArray
                                          extends Array`, e subclasse passa em
                                          Array.isArray)
xr-input.test.js ....................... 45 verdes, 4 VERMELHOS  (pega)
```

Isto **não** é regressão: é a limitação do kit emulado que a skill `vr-quest` já
documenta, e o caso de forma NATIVA continua sendo o único guarda e continua
armado. Registro porque o arquivo NOVO desta rodada (`xr-andar-analogico`) herda
a mesma cegueira, e quem o ler pode achar que ele cobre a entrada crua.

### 4.4 · `xr-haptics.test.js` (`18a231e`) — a espera pelos atuadores

**A asserção não mudou:** `assert.equal(r.atuadores.length, 2, ...)`, mais
`a.n === 1` por mão e o conteúdo do pulso (`{v: 0.42, d: 33}`).

A condição esperada é a **mesma propriedade de runtime** de §4.3 —
`session.inputSources` com dois `gamepad` —, e o experimento de §4.3 já a cobre:
com `primaryInputMode: 'hand'` a sessão não entrega atuador nenhum e o arquivo
reprova na asserção dele. A espera é local ao caso (100 × 100 ms) e é
redundante com a de `bootEmVR`, mas redundância não é afrouxamento.

### 4.5 · O veredito do item 9, com a farpa

**As três réguas foram consertadas honestamente.** A asserção de cada uma está
intacta, cada uma continua reprovando o produto quebrado, e a espera
transferida para `bootEmVR` é o lugar certo — é lá que a promessa "a sessão está
pronta para ser medida" é feita. Não achei afrouxamento disfarçado em nenhuma
das três.

**A farpa é esta:** as réguas que foram consertadas não eram o problema. As
réguas que foram **escritas** nesta rodada são. **Sete casos novos passam por
acidente, seis deles provados com o defeito reinjetado**, e um deles deixa o
critério H1 inteiro desprotegido. Está tudo em §5.

---

## 5. Testes que passam por acidente — sete achados, seis com o número

Varri os quinze arquivos novos procurando os dez formatos catalogados. Para cada
suspeita, **reinjetei o defeito e rodei**. Ordem de gravidade.

### 5.1 · `xr-aviso.test.js` — o teste ENTREGA ao produto os argumentos sem os quais ele não funciona (formato 4). **O pior achado do laudo.**

`test/xr-aviso.test.js:103` embrulha `XRHud.update` e faz:

```js
return uOrig(Object.assign({}, o, { rig: suprimir ? null : G.XR.rig, camera: MP.camera }));
```

O cabeçalho do arquivo afirma que o andaime foi removido e que "o único embrulho
aqui é um OBSERVADOR que conta as chamadas". **Não é.** Ele repõe `rig` e
`camera`, e é `atualizarAviso` — que retorna cedo sem os dois — quem faz
`rig.add(aviso.obj)`.

**Reinjeção:** `game.js:3965`, `rig: XR.rig, camera, dt,` → `dt,`.

```
                              TESTE                    PRODUTO (sonda minha, sem embrulho)
produto intacto ......... 9 de 9 VERDES        painel no grafo: SIM · pai xrRig · 1,0284 m do olho
fiação removida ......... 9 de 9 VERDES  ✘✘✘   painel no grafo: NÃO · pai null · naCena false
```

**O aviso de mísseis pode sumir de dentro do headset com o arquivo inteiro
verde.** É H1 — o critério que já derrubou a lista uma vez —, e o teste que
existe para protegê-lo não protege. A sonda que mede a verdade está em
`/tmp/.../probe/pD-aviso.test.js` e varre a cena pelo nome do objeto
(`xrHudAviso`), sem perguntar ao módulo.

**Conserto:** o embrulho tem de **conferir** que `o.rig` e `o.camera` chegaram do
jogo (`assert`), nunca preenchê-los; e `suprimir` precisa apagar o painel por
outra via que não seja fabricar um argumento do produto.

### 5.2 · `xr-passo-vista.test.js` — dois dos três estados medem `|R·v| = |v|` (formatos 1 e 10)

A câmera é filha do rig. Se o rig não muda no intervalo, o deslocamento de mundo
é a rotação do deslocamento local, e a rotação **preserva a norma** — que é
exatamente o que a razão `vista/passoPose` mede. Nos dois estados "outros" o rig
não muda, porque `place()` não é chamado (é o mecanismo de §2.2). **Razão ≡ 1
para qualquer produto.**

**Reinjeção:** `js/xr/xrrig.js:176`, primeira linha de `place()` → `if (true)
return;` (o posicionamento do rig some por inteiro).

```
produto intacto ..... 6 de 6 verdes
place() arrancado ... 5 VERDES, 1 vermelho
   o único vermelho: "a vista seguiu 0.5000 m de um salto de 0.5000 m num frame"
   → A PÉ, CINEMÁTICA, PAINEL e ASSIMETRIA passam com o rig nunca posicionado
```

E a régua independente **já está sendo colhida e só é impressa**: o
deslocamento do colisor. É ele que denuncia o produto — os meus números de §2.2
(`colisor 0,0000 m` em dois dos três estados) saem exatamente dessa grandeza.
Cobrar `colisor` nos três casos transforma o arquivo de tautologia em medida, e
teria pego o defeito de §2.2 antes de mim.

Nota de escopo: o caso da cinemática escreve `state.cinematic = true` sem rodar
`startCinematic`, então o código de `city-destruction-client.js` — o invariante
do CLAUDE.md — **não é exercitado**. É a lição do `startBRMatch`: a bandeira sem
o dono não é o estado.

### 5.3 · `xr-corpo-coluna.test.js` — o caso de I3 passa com o servo do olho DESLIGADO (formatos 6 e 9)

`assert.ok(m.olhoMinTronco > 0.15)`. O produto persegue `TUNE.olhoLivre = 0,19`
com um servo cuja autoridade máxima é `TUNE.recuoMax = 0,015`. O teto do teste
está **40 mm abaixo** do alvo do produto e o mecanismo só move **15 mm**: a
janela em que o caso pode ficar vermelho tem 15 mm de largura e nunca é
visitada.

**Reinjeção:** `js/fpbody.js:188`, `recuoMax: 0.015,` → `recuoMax: 0,`.

```
produto intacto ......... 6 de 6 verdes
servo do olho desligado . 6 de 6 VERDES  ✘
```

Confirmo pelo produto que o servo **está** trabalhando e saturado nas poses
apertadas (`FpBody.recuoOlho` = 0,015 em "agachado 0,90 −50°" e 0,0132 em
"braços para cima"), ou seja: ele existe, faz falta, e o teste não o vê.

### 5.4 · `xr-punho-rotacao.test.js` — "os dedos CRUZAM o cano" é 0,00° por álgebra (formatos 1 e 2)

`alignHand` gira a mão até o eixo dos dedos apontar para `dirL`, e o teste
computa o eixo dos dedos pelo **mesmo somatório de falanges**. A leitura é zero
por construção — o próprio cabeçalho do arquivo admite ("dá 0,00° por álgebra")
— e mesmo assim o número é asserido contra teto de 8°. O segundo assert compara
`TUNE.fingersL` com o −Z do modelo: dois literais.

**Reinjeção:** `js/fpbody.js:27`, `rollL: -1.6` → `rollL: 0` (a palma esquerda
gira **91,67°** e deixa de abraçar o guarda-mão por baixo — que é literalmente a
frase da mensagem de erro do caso).

```
produto intacto ........ 5 de 5 verdes
palma girada 91,67° .... 5 de 5 VERDES  ✘
```

Os outros quatro casos do arquivo são bons — em especial o que compara
`q_gripR⁻¹·q_ossoR` com `FpBody.punhoOffset.r`, que é régua e leitura de canetas
diferentes, com o mutante já medido no comentário. O defeito é de um caso, não
do arquivo.

### 5.5 · `xr-mao-controle.test.js` — "vale para as três armas longas" mede a MESMA arma três vezes (formato 9)

O caso troca de arma por `justPressed.add('Digit1'|'Digit2'|'Digit3')` e **nunca
assere que a arma trocou**; `m.arma` só aparece na string de erro. Os três vãos
de mão declarados no comentário (0,5508 / 0,6015 / 0,6412 m) nunca são lidos.

**Reinjeção:** `game.js:2716-2717`, `switchWeapon(1)` e `switchWeapon(2)` →
`switchWeapon(0)`.

```
produto intacto ............. 7 de 7 verdes
as três viram a mesma arma .. 7 de 7 VERDES  ✘
```

Os outros seis casos do arquivo são sólidos e a âncora deles é boa
(`gun.parts.handR` vem de `js/weaponrig.js`, o osso vem do solver de
`js/fpbody.js`, e o `gripSpace` vem do IWER — três subsistemas).

### 5.6 · `xr-arma-janela.test.js` — o caso que diz contar draw calls (E2) não conta nenhum (formatos 1 e 7)

As três asserções são aritmética do próprio ajudante: `vistas() >= 1` (a função
termina em `|| 1`), `objs(naBorda) <= 2` (soma de dois booleanos) e
`custo <= 2 * vistas` (que é `objs × vistas ≤ 2 × vistas`).

**Reinjeção:** três anéis de 30 cm de raio pendurados no `guiaAro`
(`js/xr/xrweapon.js`, dentro de `criarGuia`) — **+3 draw calls por olho** e um
alvo vermelho de 60 cm na cara do jogador.

```
produto intacto ...... 5 de 5 verdes
+3 draw calls/olho ... 5 de 5 VERDES  ✘
```

Isso importa mais que os outros porque **E2 é vermelho** (§2.7) e este é o único
caso da rodada que se apresenta como guarda de orçamento.

### 5.7 · `xr-empunhadura-grip.test.js` — o caso do APOIO é segurado pelo termo VELHO do `||` (formatos 6 e 7)

`game.js:3904` passa `apoiando: XRArma.duasMaos() || XRArma.gripOcupado()`. No
caso do apoio a mão é levada ao guarda-mão, então `duasMaos()` **sozinho** já
fecha a porta do agarre — a máquina de prioridade nova (`gripOcupado`) não
participa.

**Reinjeção:** `js/xr/xrweapon.js:1143`, `gripOcupado: () => ...` → `() => false`.

```
produto intacto ................ 6 de 6 verdes
gripOcupado desligado .......... 4 verdes, 2 VERMELHOS
   vermelho: caso do PENTE  ("a porta chegou FECHADA em 0.0% dos 36 frames")
   vermelho: caso da TRAVA  ("...FECHADA em 28.6% dos 56 frames")
   VERDE:    caso do APOIO  ← nunca mediu o conserto
```

O arquivo **pega** a mutação; o caso do apoio, não. Conserto de uma linha:
`assert.equal(r.durante.duasMaos, false)` nos casos de porta fechada, para
atribuir a medida ao termo certo.

### 5.8 · Menor, sem reinjeção separada: `xr-corpo-piso.test.js`, o caso do `afundou`

`const mentindo = varredura.filter(m => m.folga < -ENTERRO_MAX && m.afundou < 0.01)`
— o antecedente é **exatamente a negação do caso 2** do mesmo arquivo. Com o
produto certo o filtro é vazio por construção; com o produto errado quem falha
primeiro é o caso 2.

**Reinjeção:** `js/fpbody.js:1575`, `afundou = Math.max(0, piso - baixo);` →
`afundou = 0;` (a telemetria mente em todos os degraus).

```
produto intacto .......... 7 de 7 verdes
afundou cravado em zero .. 7 de 7 VERDES  ✘
```

Os casos 2 e 7 do mesmo arquivo são **sólidos** (vértice skinado com
`getVertexPosition`, `updateWorldMatrix(true,true)` antes, medido dentro do
`render`) e são o coração do conserto de §2.6. É uma asserção fraca dentro de um
arquivo bom.

### 5.9 · O que eu varri e NÃO acusei

Registro para o placar não parecer pior do que é:

- **`xr-andar-analogico.test.js` é o arquivo mais limpo da rodada.** Os três
  casos morrem com a mutação certa: apagar `game.js:1766` (o canal analógico)
  leva o erro de direção a 22,50° e a razão de velocidade a 1,000; a zona morta
  por EIXO leva o erro a 9,79°; mexer em `DEADZONE` derruba o terceiro caso
  **dos dois lados**.
- **`xr-prefs-giro.test.js`** aciona o painel pelo caminho do JOGADOR (pose da
  mão + gatilho), não por `XRUI.acionar()` — evita o formato 4 — e usa
  `emJogo: false` para cobrir o buraco de ESTADO do menu.
- **`xr-arma-cartucho.test.js`** tem o melhor caso da rodada: "mão PARADA
  carrega UM" isola o rearme por histerese e nenhum outro guarda o segura
  (arrancar `portaArmada` deixa entrar ~5 cartuchos e `1 !== 5` estoura).
- **`xr-apoio-agarre.test.js`** cola cada bloqueio ao complementar, e o caso do
  "relógio que não acumula" tem mutação cirúrgica de uma linha.
- **Formato 8 (dublê à mão) está ausente dos quinze arquivos** — todos sobem o
  IWER de verdade. A única exceção é `xr-apoio-agarre`, que é módulo puro e
  declara a escolha.

---

## 6. O que eu NÃO consegui medir, e por quê

1. **C4 (escala 1:1) e D6 (alcance de posição fixa)** — décima rodada. Nunca
   priorizei contra os vermelhos abertos; assumo a dívida.
2. **G2 (antialiasing em XR)** — o IWER não expõe `samples` do alvo XR. Décima
   rodada, mesma causa.
3. **I4 (nenhum estado sem saída)** e os estados de BR de **A6** — nave, queda
   livre, paraquedas, espectador e fim de partida exigem `startBRMatch` com
   segundo cliente, e a lição do CLAUDE.md avisa que `startBRMatch` **pula a
   fase da nave de propósito**: uma sonda que leia a fase logo depois não prova
   nada. Preferi não publicar número ruim. **A leitura estática de `br-game.js`
   fecha** (nenhum leitor direto de `camera.quaternion` sobrou; o único
   `getWorldDirection` está no ramo `else` de `if (rigXR)`), mas leitura não é
   medição e não conto como verde.
4. **B5, segunda metade** — "o recuo/oscilação da arma reduz de forma medível
   com duas mãos" não foi medido. Só medi o alinhamento, que é o teto de 2°.
5. **Escopeta por GESTO (entrega 7)** — confirmei `porCartucho: true` e o estado
   `cartucho-relogio` com a recarga aberta pelo BOTÃO. O ramo `origem: 'gesto'`
   exige a recarga aberta pelo gesto do peito **e** a mão chegando à porta de
   carregamento dentro de 0,14 m; não fechei o roteiro a tempo. O arquivo do
   repo (`xr-arma-cartucho.test.js`) cobre esse ramo e foi auditado como o mais
   sólido do conjunto (§5.9).
6. **B6 (háptico)** — não escrevi sonda própria. Aceito pelo arquivo do repo,
   que está verde na linha de base de §4.1.
7. **A parte humana e a do aparelho** (E1, E3, E4, E5, F1, G4, G5, I1) —
   inalcançáveis daqui. **G5 e I1 estão na décima rodada sem um único artefato
   novo**, e isso já não é falta de ferramenta: `npm run vr:sessao` existe.
8. **Uma armadilha minha, declarada.** Minha primeira medição de B5 deu erro de
   **8,78 a 11,87°** e eu quase publiquei "B5 reprova". Estava errada: eu punha
   a mão na âncora `supportHand`, e essa âncora **não está sobre a reta
   gripR→muzzle** por desenho (a mão de apoio segura por BAIXO do cano). O viés
   geométrico é de 9,33° no fuzil, calculável direto dos números do perfil.
   Refeita como medida **diferencial** — quanto o cano gira por metro de mão,
   contra `atan(perpendicular/separação)` — o erro cai para ≤ 1,15° em oito
   casos. **A régua tem de ser diferencial quando a âncora tem offset
   declarado**, e essa lição vale para a próxima rodada.

---

## 7. O que eu cobro da próxima rodada, em ordem

1. **Consertar `xr-aviso.test.js` (§5.1) antes de qualquer coisa.** H1 está
   verde e desprotegido. O embrulho tem de conferir os argumentos, não
   fabricá-los.
2. **Fechar o salto de 1,000 m de §2.2.** O passo físico acumulado durante
   painel/cinemática tem de ser **absorvido** (drenado por frame, ou consumido
   em parcelas abaixo de `PASSO_HUMANO_MAX` ao retomar), nunca descartado. E o
   corpo tem de seguir a cabeça nos três estados, não só a vista — que é o que a
   entrega 4 afirmou e não entregou.
3. **Cobrar `colisor` nos três casos de `xr-passo-vista.test.js` (§5.2).** A
   grandeza já é colhida; só falta asserir. Isso fecha a régua e o item 2 de uma
   vez.
4. **E2.** Duas poses de quatro fora do teto de draw call, duas fora do de
   triângulo, e o único teste que se apresenta como guarda de orçamento não
   conta draw call nenhum (§5.6).
5. **B7 × B3 — decisão do dono, sexta rodada de espera.** Os dois são
   geometricamente incompatíveis. Eu não afrouxo a régua e não escolho por ele.
6. **Os quatro casos de §5.3 a §5.8**, cada um com a mutação já escrita aqui.
7. **G5 e I1.** Uma captura estéreo e uma sessão humana de 20 minutos destravam
   dois dos oito travados, e as duas ferramentas já existem.
