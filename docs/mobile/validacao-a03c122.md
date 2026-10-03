# Validação do porte para CELULAR — commit `a03c122`

Décima primeira rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63), `validacao-3d7d47a.md` (46/63). Autor: o
**validador** — não escreveu código de produto nem teste do repo. Nada foi
commitado. **A régua não mudou** (`git diff 3d7d47a a03c122 --
docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `3d7d47a`: `aeb5600` (só o laudo 10) e
`a03c122` — só cliente (`js/cannon.js`, `js/maptoys.js`) e testes: o recorde do
curso de argolas gravado com centésimos; o curso é UM voo (de volta ao chão,
reinicia); a carga do canhão (0,5 s) PUXA o jogador para o centro e o voo vai
para o ponto a 30 m à frente de onde ele apertou. **O `server.js` não mudou**
(sha256 igual ao de `3d7d47a`), nem o bot, nem a geometria de bala.

---

## 0. Condições

- **Árvore:** `dev` em `a03c122` (`git log -1` no início, 04h23, e no fim,
  06h11). `git status` antes e depois: limpo, e no fim só ESTE arquivo (não
  rastreado). `npm run lint` limpo. sha256 do índice e dos 510 arquivos
  rastreados em `out/r11/arvore-a03c122.sha256`, conferido no fim: **idêntico**.
  Mutantes em **cópias** (`copia-r11` para as minhas sondas, `copia-r11c` para os
  testes do construtor) — as cópias de r10 renomeadas e sincronizadas por
  `rsync` com a árvore (o disco estava a 100 %, 2,4 GB livres: tirei das MINHAS
  cópias o `.claude/worktrees`, 1,2 GB cada); restauradas por sha256 antes de
  cada mutante e conferidas no fim (`server.js`, `game.js`, `br-game.js`,
  `js/cannon.js`, `js/maptoys.js`, `js/maptoys-core.js`, `js/cannon-core.js`,
  `js/paredes.js`, `scripts/bots.js` e os dois testes = árvore). O **"antes"** é o
  mutante `ANTES`: `js/cannon.js` e `js/maptoys.js` de `3d7d47a` (`git show`) na
  cópia, o resto igual à árvore.
- **Carga:** amostrada a cada 20 s das 04h23 às 06h11 (UTC−3; 323 amostras):
  carga de 1 min **mediana 3,2, p90 4,0, máximo 6,1** (às 05h39, dentro da
  suíte) em 12 núcleos. O outro projeto da máquina não fez rajada nesta janela.
  Cada artefato traz a carga do seu início e do seu fim: as sondas de canhão
  rodaram entre **2,0 e 3,5** (árvore e mutantes, sempre uma por vez); a suíte
  correu sem nenhuma sonda minha ao lado (2,4 → 2,3).
- **GPU:** Chrome headless, o backend do harness. Tempo de frame não medido.
- **Viewports:** V2 800×360, `hasTouch`, `isMobile`, DPR 2, `?mobile=1` (BR e
  solo); XR: IWER (`metaQuest3`) na janela do harness. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no
  rAF) — mira por arrasto no `#tcLook`, disparo pelo botão USAR, carro e
  helicóptero pelo USAR, analógico pelo `#tcMove`; recarga da página no mesmo
  navegador (mesmo `localStorage`).
- **O servidor medido é o servidor de verdade.** `srv11.js`: o `server.js` da
  árvore byte a byte (sha256 `45fa3121…`, o MESMO de `3d7d47a`) carregado em
  processo com UMA linha no fim que expõe `players`/`server`; ele serve a página
  e dá o `strikes` do anti-teleporte. Solo, XR e `desemp`: o `node server.js`
  que o harness sobe.
- **Instrumentação declarada:** os teleportes da SONDA (para cada posição de
  disparo) somam 1–12 strikes cada (o servidor recusa até re-ancorar); a sonda
  espera a re-ancoragem e ZERA os strikes do próprio jogador antes de cada
  toque, para medir só o puxão + voo e não ser expulsa acima de 120. Detalhe
  fora do repo.
- **Portas:** 3990 (+3991, o servidor que o harness sobe e não é usado), 3994,
  3995, 3996, 3984; os testes do construtor na cópia, nas portas deles (4162,
  3261). Nunca a 3000. Antes de cada bloco, `ps` sem `run-tests`/`node --test`/
  `server.js` alheio; nada meu rodou durante a suíte.
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **`r11-argolas` (f), 1ª execução:** lia o getter `MapToys.rings` UMA vez —
     ele devolve um retrato novo a cada leitura — e a contagem do helicóptero
     ficou congelada em 0 (a mensagem "CURSO COMPLETO 3.3s" desmentia). Refeito
     lendo a cada quadro.
  2. **(e), 1ª execução:** o carro não andou (velocidade escrita sem o polegar no
     acelerador, e o nariz do chassi com a conta errada — os veículos olham +X);
     ficou a 13,56 m e o caso não exercitou nada. Refeito com o polegar no talo:
     parou a 2,47 m do centro.
  3. **(f), saída do helicóptero, 1ª versão:** chamava `Heli.exit()` num rAF
     DEPOIS do quadro — uma ordem que o jogo não tem (o USAR roda no `Interact`,
     antes do `MapToys`) — e não via o [NC] 1. Refeito pelo toque no USAR.
  4. **A 1ª execução na árvore** não gravava o brilho das argolas no boot
     (acrescentado; a 2ª execução, idêntica nas argolas, tem).
  5. **A minha captura do código de saída da suíte** pegou o do `date`, não o do
     runner — vale a linha final do runner (§1).
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `srv11.js`, `r11-argolas.js` (seções a–g), `r11-recarga.js`, `r11-xr.js`,
  `r11-boottempo.js`, `desemp.js`, `mut11.py`, `cadeia-mut11.sh`,
  `mut11-testes.sh`, `carga11.sh`. Saídas em `out/r11/`.

---

## 1. Placar

> **46 aprovados · 4 reprovados · 13 não medidos, em 63** (46/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `3d7d47a` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Nenhum critério mudou de cor.** Nenhum dos 63 critérios mede o curso de
argolas nem o canhão; o que esta leva toca na régua — o texto do HUD (C4), nada
preso depois do voo (C10), o mundo da semente (D4), as alocações e as draw
calls (D2, D3), os bytes do boot (D6) e os erros de página (E12) — foi remedido
e segue com a mesma cor. O resto é **não remedido**: o código de cada um não
mudou nesta leva (o diff é `js/cannon.js` + `js/maptoys.js`), e o veredito de
`3d7d47a` vale com o número de lá.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista
sete.

**Regressões obrigatórias (§8):** M1 ✓ (não remedido), M2 ✓ (não remedido),
C4 ✓, D2 ◌ (a parte medida passa), D6 ✓ (conta), E10 ✓ (não remedido), E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Defeitos NOVOS nascidos das correções desta leva: 4** (§4, [NC] 1–4; os
quatro baixos, os quatro do canhão/curso, **nenhum de segurança**). Em
`3d7d47a`: 2; em `f672d81`: 2; em `4433c4d`: 2; em `a9a4ffd`: 3; em `afb1ae8`: 4.
E **uma correção não fechou o que prometia** (§4.5: o "RECORDE" da 1ª volta
depois de recarregar continua, 2 de 2 sessões, igual a antes).

`test/security-regression.test.js`: **38/38** (na suíte).

**Suíte completa:** (`npm test`, sem sonda minha ao lado, carga 2,4 → 2,3,
66,5 min): **2 624 testes, 2 588 passaram, 0 falharam, 33 cancelados, 3
pulados**. O runner re-rodou 5 arquivos isolados — os cinco de XR, com o MESMO
sintoma (o `before` não termina: o `bootGame` esperou 90 s por `window.__game &&
window.__MP`): `xr-controle-anda`, `xr-dicas-controles`, `xr-framerate` e
`xr-mao-controle` → **flake** (2 passes seguidos); `xr-painel-corpo` →
**"REGRESSÃO REAL"** (3 isolados sem dois passes seguidos). Linha final do
runner: "1 regressão(ões) real(is): xr-painel-corpo.test.js"; `ps` vazio de
`run-tests` antes de ler o placar.
**Re-triagem (minha):** logo em seguida (06h08–06h10, carga 2,2–2,8),
`xr-painel-corpo` isolado: **8/8 três vezes seguidas** (36 s cada). Boot em VR
(`bootEmVR`) alternado com o cliente de `3d7d47a`, N = 5 cada, carga 2,7–3,9:
árvore **3,75–3,90 s** × **3,61–3,95 s**. O caminho de VR não mudou nesta leva
(o diff é `js/cannon.js` + `js/maptoys.js`, que o boot só importa — e o XR boota
igual). **Veredito: flake de boot** (uma janela de ~25 min, das 05h40 até a triagem
do runner, ~06h07, em que o boot de XR passou de 90 s em 5 arquivos; começou
logo depois do pico de carga de 6,1 às 05h39 e seguiu com a carga em 2,5–4,0),
não regressão — mas o runner disse
REGRESSÃO REAL, e isso fica escrito. É a 2ª rodada seguida com essa janela (r10:
1 arquivo; agora 5) — observação (h).

---

## A. Os quatro itens do briefing, um por um

Partida BR `?mobile=1`, V2 (800 × 360), toque do DevTools (`Input.dispatchTouchEvent`,
laço no rAF), servidor de verdade. **A mira é sempre pelo TOQUE:** arrasto no
`#tcLook` calibrado pela `camera.matrixWorld` (100 px = 18,335°), até o rumo da
vista ficar a ≤ 0,003° da argola escolhida; o disparo é o toque no botão USAR
(o aviso mostrava "USAR · SER DISPARADO 🎪" em todos). **Âncoras:** as 5
argolas DESENHADAS (as `TorusGeometry` r 2,6 da cena, centro e normal pela
`matrixWorld`) e a travessia contada pela MINHA conta sobre `player.pos`
gravado a cada quadro num rAF depois do quadro do jogo (o produto ao lado:
`rings.next`/`completos`); o relógio de parede para o puxão; o `strikes` do
servidor de verdade. **"Antes"** = o MESMO roteiro com o cliente de `3d7d47a`
(`js/cannon.js` + `js/maptoys.js` de lá, numa cópia — o resto da árvore igual).
Duas execuções na árvore (N = 2): **idênticas** em argolas e rumos.

1. **O recorde com centésimos — o VALOR fechou; o anúncio "RECORDE" não.**
   Solo de verdade, a página RECARREGADA no mesmo navegador (mesmo
   `localStorage`), três sessões, voo do centro:
   - Gravado **"1.8"** (antes: **"2"**); outro voo (da borda, 1,7665 s) gravou
     **"1.77"**. Depois de recarregar, o recorde carregado é **1,8** (antes: 2) —
     o "recorde 1.8s" da mensagem é um tempo que alguém fez. ✓
   - **A 1ª volta de cada sessão continua anunciada "💫 CURSO COMPLETO 1.8s —
     RECORDE!": 2 de 2 sessões** (antes: 2 de 2). O mecanismo mudou de nome mas
     não de efeito: a volta do centro dura 108 quadros, que o relógio do jogo
     soma em **1,79980–1,79999 s**; a gravação arredonda **para cima** ("1.8") e a
     comparação é em precisão cheia (`time < best`) — a mesma volta, depois de
     recarregar, "bate" o recorde por 0,0001 s. Correção que não fechou: §4.5.
   - Na MESMA sessão, voltas iguais também saem "RECORDE" por ruído de relógio:
     **2 de 12** voltas completas depois da 1ª em cada execução com ganho de
     **0,1 ms** (antes: 1 de 5). Já existia desde que o curso completa
     (`3d7d47a`).
   - O teste do construtor confere só a gravação (`|gravado − best| < 0,006`) —
     não a comparação depois de recarregar.
2. **O curso é UM voo — FECHOU.** Do centro, mirando 3,3° fora do curso pelo
   toque: **4 de 5** (a 5ª passa a 2,61 m do centro, raio 2,6); de volta ao chão,
   `next = 0`, `running = false`. O voo completo seguinte: **"💫 1.8s"**, as 5
   argolas contadas (antes: **"💫 8.0s"**, o tempo somado dos dois voos, contando
   só a 5ª; com o mutante `SEMreinicio`: **8,1 s** e `next = 4` depois do voo
   parcial). Em **44 voos** do canhão no BR: **0 quadros "no chão" no ar** e **0
   reinícios no meio do voo**.
   **O avesso:**
   - *Helicóptero pelas argolas* (trajetória do helicóptero como dublê
     declarado, a regra do produto de verdade): **completa 5 de 5 (3,3 s)**, sem
     reinício no meio — o `player.onGround` fica VELHO (`true`) o voo inteiro,
     e quem segura é o `!state.flying`.
   - *Sair do helicóptero no meio do curso, pelo USAR* (o caminho real do
     `Interact`): **o curso reinicia NO AR, no quadro da saída** — o jogador a
     y = 20,0 m (~17 m acima do chão), `next` 2 → 0 com o `onGround` ainda
     velho do helicóptero; no quadro seguinte ele já está "no ar". Quem pula do
     helicóptero através das argolas não continua o curso. [NC] 1.
   - *Cama elástica:* fica a 286 m de lado do curso — não se combina; e o
     quique mantém `onGround = false` (leitura de `game.js`, `tryBounce`).
   - *Pouso num telhado / no meio do caminho:* nada com corpo a ≤ 7,5 m do canhão
     (0 obstáculos, 0 paredes de corpo; veículo mais perto a 204 m) e 0 quadros
     no chão no ar em 44 voos.
   - *Carro pelas argolas:* elas ficam a 11,4–23,7 m acima da base do canhão —
     carro não passa (geometria).
   - *A argola acesa:* no boot a 1ª brilha (0,9) e as outras não (0,3). **Depois
     de QUALQUER voo, nenhuma fica acesa** (0,3 × 5, em 44 de 44 voos do BR e 4
     de 4 do solo). Antes: depois de um voo parcial a argola que faltava ficava acesa
     (e depois de um curso completo também nenhuma — isso já existia). [NC] 2.
3. **O puxão — fecha a beira mirando o meio ou o fim do curso; NÃO fecha o caso
   que r10 mediu (mirando a 1ª argola, a acesa).**
   - *O puxão em si:* 0,48–0,50 s, pico de **3,4–3,6 m/s** (1,7 m), **8,1–9,2 m/s**
     (4 m), **9,2–10,3 m/s** (4,5 m), **11,5 m/s** com o analógico no talo
     contra; o lançamento sai **no centro (0,000 m)** em todos os 44 voos do BR (antes:
     da posição do toque, 1,70/4,00/4,50 m). **Servidor: 0 strikes, 0 rejeições**
     em todos os 44 (detalhe fora do repo); espelho pelos pacotes emitidos: ≤ 24,2 m/s.
   - *Argolas na ordem, pela minha conta — agora × antes* (as duas execuções
     iguais):

     | de onde (do centro) | mira (pelo toque) | agora | antes | a argola mirada passa a (agora × antes) |
     |---|---|--:|--:|---|
     | centro | 3ª | 5 | 5 | 0,05 × 0,05 m |
     | borda de r10 (1,2; 1,2 nos eixos) | 1ª | **5** | 4 | 0,37 × 0,79 m |
     | lado, 1,7 m | 1ª | 2 | 2 | 1,13 × 0,15 m |
     | lado, 1,7 m | 3ª | **5** | 4 | 0,14 × 0,28 m |
     | lado, 1,7 m | 5ª | 5 | 5 | 0,91 × 0,46 m |
     | lado, 4 m | **1ª** | **1** | 1 | **2,58** × 0,03 m |
     | lado, 4 m | 3ª | **5** | 0 | 0,29 × 0,70 m |
     | lado, 4 m | 5ª | **5** | 0 | 1,52 × 1,05 m |
     | lado, 4,5 m | **1ª** | **0** | 1 | **2,87** × 0,03 m |
     | lado, 4,5 m | 3ª | **5** | 0 | 0,31 × 0,80 m |
     | lado, 4,5 m | 5ª | **5** | 0 | 1,88 × 1,42 m |
     | outro lado, 4 m | 1ª | 1 | 1 | 2,58 × 0,87 m |
     | diagonal de trás, 4 m | 1ª | 2 | 2 | 1,37 × 1,39 m |
     | atrás, 4,5 m | 1ª | **5** | 3 | 0,05 × 2,40 m |
     | atrás, 4,5 m | 3ª | **5** | 3 | 0,09 × 1,43 m |
     | frente, 4 m | 3ª | **5** | 0 | 0,05 × 0,22 m |

     O voo vai para o ponto a 30 m à frente de onde o jogador apertou — e é para
     onde ele vai: o ponto a 30 m fica a **0,00 m** da linha do voo quando a mira
     é a 1ª argola. Só que a 1ª argola está a ~10 m: mirando-a de lado, o voo sai
     14,4° (4 m) e 15,9° (4,5 m) fora do curso e passa **ao lado da argola que o
     jogador mirava** — a 4 m raspando (2,58 m do centro, raio 2,6), a 4,5 m
     **fora (2,87 m)**; antes passava pelo centro dela (0,03 m). **O caso que r10
     mediu ("a 4 m do centro, mirando a 1ª argola: 1 de 5") segue 1 de 5**; o teste
     do construtor e o texto novo do CLAUDE.md ("da beira, voar na direção da
     câmera saía paralelo e passava 1 de 5") miram a 3ª. A 1ª é a que o jogo
     acende como "a próxima". [NC] 3.
   - *Para trás:* o voo sai 172° do curso, para onde o jogador olhava (0
     argolas, 0 strikes). *Para cima (80°):* igual ao horizontal (5 de 5) — só o
     rumo conta.
   - *O puxão atravessando algo:* no canhão da semente 424242 não há o que
     atravessar (acima); jogador contra jogador não tem colisão neste jogo
     (leitura: `updatePlayer` não empurra jogador remoto) — nada novo. **Um carro
     estacionado atravessa:** o buggy levado pelo USAR até encostar no canhão
     (2,47 m do centro), o jogador 4,5 m atrás dele: o puxão o leva ATRAVÉS do
     carro — **29 quadros da carga dentro do círculo de corpo do carro** (2,04 m),
     a **0,72 m do centro do chassi**; o empurrão do carro briga com o puxão e o
     corpo salta até **1,96 m num quadro**; lança do centro, 5 de 5, 0 strikes.
     [NC] 4.
   - *Analógico no talo do toque ao pouso (C10):* lança do centro, 5 de 5; depois
     do pouso anda; soltar → **0,004 m/s**, nenhuma tecla presa, nem tiro nem mira.
   - *XR — a mira do canhão lê `camera.quaternion`:* sessão `immersive-vr`
     (IWER), a cabeça apontando para o curso NO MUNDO. Rig em 0°: o voo sai
     **−0,02°** do pedido, 5 de 5. **Rig girado −84,35° (giro artificial): o voo
     sai 84,41° fora; rig −173,98°: 173,98° fora — 0 argolas** (a régua: rig do
     módulo de giro + o ângulo que eu escrevo na cabeça do dispositivo; a
     `camera.matrixWorld` concorda). É a pose da cabeça RELATIVA ao rig — o erro
     é o giro artificial inteiro. **Não nasceu nesta leva:** o cliente de
     `3d7d47a` dá 83,64° e 173,67° (o `aimDir` é de `7ae1f67`, a criação do
     canhão, 2026-07-24); o `alvoDoTiro` novo o herda. §4.6.
   - *O voo é empurrado de lado por árvore e pedra a 20 m de altura* (achado da
     âncora, não desta leva): o empurrão de corpo de tronco/pedra do
     `updatePlayer` não olha altura — o voo do centro passa 21 m acima de um
     tronco a 32 m e anda **0,68 m de lado em 4 quadros** (em outros voos, uma pedra a 46 m).
     É o que põe a 4ª e a 5ª argola a 0,68 m do centro no voo do centro. §4.7.
4. **Os testes novos avermelham — todos os mutantes, inclusive o `UMAfatia` que
   r10 não pegava.** Cópia `copia-r11c`, controle (cópia = árvore):
   `atracoes-bala` 11/11, `maptoys` 13/13, `cannon-core` 12/12.

   | mutante (na cópia) | teste do construtor | minha sonda |
   |---|---|---|
   | `UMAfatia` (a carreta numa fatia só; r10: 0 vermelho) | `atracoes-bala`: **1 vermelho** — "12 cm para dentro da borda": **2 de 65** retas atravessam | (r10: a faixa vai a 25,5 cm) |
   | `CIRCULO` (os fatores de círculo) | `atracoes-bala`: **1 vermelho** (rente) | (r10) |
   | `SEMpedestal` | `atracoes-bala`: **1 vermelho** (a fresta) | (r10) |
   | `ARGOLASideal` | `maptoys`: **2 vermelhos** (curso; beira); `cannon-core`: 0 | (r10: 3 de 5) |
   | `SAVEinteiro` (o recorde volta ao `saveNum` inteiro) | `maptoys`: **1 vermelho** (recorde gravado) | gravado **"2"** (árvore "1.8") |
   | `SEMreinicio` (o curso só reinicia a > 140 m) | `maptoys`: **1 vermelho** (UM voo) | voo seguinte **"8.1s"** e `next = 4` depois do parcial (árvore 1,8 s, `next = 0`) |
   | `SEMpuxao` (sem o puxão; o ponto a 30 m fica) | `maptoys`: **1 vermelho** (beira) | lado 4 m → 3ª: **0 de 5**, lança a 4,0 m (árvore 5, 0,0 m) |
   | `MIRAcamera` (o puxão fica; o voo pela câmera) | `maptoys`: **1 vermelho** (beira) | lado 4 m → 3ª: **1 de 5** (árvore 5) |
   | `ANTES` (o cliente de `3d7d47a`) | `maptoys`: **3 vermelhos** | a tabela do item 3 |

   A margem do `UMAfatia` é fina: 2 de 65 retas, e o teste mede 12 cm por dentro
   contra uma faixa que a árvore deixa até 11,2 cm (r10) — 0,8 cm de folga. O que
   os testes NÃO medem: a mira na 1ª argola (a acesa); o "RECORDE" depois de
   recarregar (só a gravação); a argola acesa; a saída do helicóptero; o carro
   atravessado; o XR.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Não remedido.** O bot (`scripts/bots.js`), o servidor e a geometria de bala
(`js/paredes.js`, `js/obstaculos.js`, `js/maptoys-core.js`) não mudaram nesta
leva — o canhão e o totem de bala são os de `3d7d47a`. Valem os números de
r10: pares geométricos **1 de 10 312** tampados vistos (o par de caminhão de
sempre), **cego 0 de 8 629**; atrações 0 e 0; a arena de r7 (0 / 0 / 0 / 0 em
52 válidos) como a medida do caminho real; "a tela não mostra e a vítima
aceita" **38** (16 atrás de poste). **Veredito: ◌ — igual a r10**, pelas duas
razões de `d381d29` (a "virada" pela letra, com o dono; o avesso (9) sem N no
caminho real).

---

## 3. Veredito por critério (com a comparação com `3d7d47a`)

"Não remedido" = o código que o critério mede não mudou nesta leva (o diff é
`js/cannon.js` + `js/maptoys.js`); vale o número de `3d7d47a`.

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | Não remedido: 0,00 px / 0,00 cm a 10, 25 e 50 m em V2/V3 (r10). |
| **M2** | ✓ | ✓ | Não remedido: fuzil 720 m/s → 7,9 cm a 100 m; DMR 5,3; sniper 5,2 (r10). |
| **M3**–**M5** | ✓ | ✓ | Não remedidos (r10). |
| **M6** | ✓ | ✓ | Não remedido (r10). |
| **M7** | ✓ | ✓ | Não remedido (r10). O arrasto de olhar desta rodada (calibração da mira do canhão): 100 px = **18,335°**, ida e volta 0,000° — o valor de sempre. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Não remedido (r10). |
| **A2** | ✓ | ✓ | Não remedido: 236 casos, 0 com 0 px e a assistência agindo (r10). |
| **A3**, **A4** | ✓ | ✓ | Não remedidos (r10). |
| **A5** | ◌ | ◌ | Não remedido: (a)–(c) ✓, (d) em conflito com A2 (r10). |
| **A6**, **A7** | ✓ | ✓ | Não remedidos; `security-regression` **38/38**. |
| **A8** | ✓ | ✓ | Não remedido (r10). |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | Não remedido: (e) três dedos em 0,5 s, 1,82 m < 2 m. |
| **C2** | ✓ | ✓ | Não remedido (r10). |
| **C3** | ◌ | ◌ | Não remedido: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | Remedido no que a leva toca: o aviso "USAR · SER DISPARADO 🎪" e as mensagens do canhão e do curso ("🎪 atravesse as argolas!", "💫 CURSO COMPLETO 1.8s — RECORDE!", "💫 1.8s · recorde 1.8s", "🎪 VOOU 54 m · recorde 55 m"), em 48 voos (44 no BR, 4 no solo) e no helicóptero ("⇧ sobe · ⇩ desce · analógico voa") — 0 nomes de tecla. O resto não remedido (r10: 0 no percurso por toque). |
| **C5**, **C6** | ✓ | ✓ | Não remedidos (r10). |
| **C7**–**C9** | ✓ | ✓ | Não remedidos. |
| **C10** | ✓ | ✓ | Remedido no canhão: polegar no talo do toque ao pouso — lança do centro, depois do pouso anda; soltar → **0,004 m/s**, nenhuma tecla presa, `shooting`/`aiming` falsos. O carro e a saída: não remedidos (r10: 5,18 m no 1º s; sair, nada preso). |
| **C11** | ✗ | ✗ | Não remedido. |
| **C12** | ✓ | ✓ | Não remedido (r10). |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1**, **B2** | ✓ | ✓ | Não remedidos (bot e servidor intocados). |
| **B3** | ◌ | ◌ | Não remedido. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ◌ | ◌ | Não remedido (r10: 1 de 10 312; cego 0). |
| **B7** | ◌ | ◌ | §2. |
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos. |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido. |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | Não remedido (r10: 962 golpes, 0 através; Torre 547, 0). |
| **P3** | ✓ | ✓ | Não remedido (r10). O piloto que SAI do helicóptero no curso (§A.2) não muda P3. |
| **P4** | ✓ | ✓ | Não remedido (r10). |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | Não remedido (r10). |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **232 draw calls p50** (mín. 222, máx. 256, mundo de 23 s) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 631: **0 `Object3D`** (o mesmo de r10 no ATIRAR arrastando: 12, descontados os da sonda). |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais**; contra r10, 0 diferenças fora da idade do mundo, do mínimo de draw calls (222 × 224) e da contagem de quadros da assistência. |
| **D5** | ✓ | ✓ | Não remedido. |
| **D6** | ✓ | ✓ | Por CONTA, não remedido: a leva soma **+1 879 B** crus (`js/cannon.js` 9 470 → 10 576; `js/maptoys.js` 20 151 → 20 924) aos 11,14 MB de r10 — limiar 15,03 / 5,25 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Não remedidos. |
| **E4**, **E5** | ◌ | ◌ | Não remedidos (chegar ao carro/helicóptero pelo toque, da nave). |
| **E6**–**E8** | ✓ | ✓ | Não remedidos. |
| **E9** | ✗ | ✗ | Não remedido (sem "sair da partida" no BR; decisão do dono). |
| **E10** | ✓ | ✓ | Não remedido. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; **0 `pageerror`** em todas as páginas desta rodada (BR do canhão ×4, solo recarregado ×2, XR ×2, `desemp`). |
| **E15** | ✓ | ✓ | Não remedido (r10). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `a03c122`, baixa] Sair do helicóptero no meio do curso reinicia o
   curso NO AR.** O reinício lê `player.onGround && !state.flying &&
   !state.driving`; no quadro em que o USAR tira o jogador do helicóptero
   (`Interact` roda antes do `MapToys`), `onGround` ainda é o do helicóptero
   (`true` o voo inteiro — o helicóptero assenta `player.pos` no chão a cada
   quadro) e o curso volta a 0 com o jogador a y = 20,0 m. Reprodução: pilotar
   pela 1ª e 2ª argola, USAR → `rings.next` 2 → 0 no mesmo quadro, antes de ele
   cair. Quem salta do helicóptero através das argolas não completa o curso
   (antes: completava).
2. **[NC — `a03c122`, baixa] Depois do 1º voo nenhuma argola fica acesa.** O
   reinício novo apaga a argola que faltava (`ringGlow(ring.next, false)`) e não
   acende a 1ª; o fim de curso (antigo) também não. Medido: brilho 0,9 na 1ª só
   no boot; 0,3 nas cinco depois de 48 de 48 voos. Antes, depois de um voo
   parcial a argola que faltava seguia acesa. O sinal "comece aqui" some depois
   do primeiro voo de cada sessão.
3. **[NC — `a03c122`, baixa] Mirando a argola acesa (a 1ª) da beira, o voo vai
   para o ponto a 30 m, não para a argola.** Do lado, a 4 m: passa a 2,58 m do
   centro da argola mirada (raio 2,6), 1 de 5; a 4,5 m (dentro do alcance do
   USAR): **2,87 m, fora — 0 de 5** (antes: pelo centro dela, 0,03 m, 1 de 5). O
   caso que r10 mediu (observação d: 4 m, mirando a 1ª, 1 de 5) **não mudou**; o
   conserto vale para mira a ≥ ~27 m (3ª e 5ª argolas: 5 de 5 de toda a beira).
4. **[NC — `a03c122`, baixa] O puxão atravessa um carro estacionado.** Buggy
   encostado no canhão (2,47 m do centro), o jogador atrás dele a 4,5 m: 29
   quadros da carga dentro do círculo de corpo do carro (2,04 m), a 0,72 m do
   centro do chassi; o empurrão do carro briga com o puxão e o corpo salta até
   1,96 m num quadro. Sem efeito no servidor (0 strikes; fora do repo).
5. **Correção que não fechou: o "RECORDE" da 1ª volta depois de recarregar
   ([NC] 1 de r10).** O valor fechou ("1.8", não "2"); o anúncio não: **2 de 2
   sessões** (antes: 2 de 2) — a volta do centro soma 1,79980–1,79999 s no
   relógio do jogo e o gravado é arredondado para cima ("1.8"); comparar na
   precisão gravada (ou gravar a precisão cheia) é o que fecha. Junto, na mesma
   sessão: voltas iguais anunciadas "RECORDE" por **0,1 ms** de ruído (2 de 12
   por execução; antes 1 de 5) — existe desde `3d7d47a`.
6. **Achado antigo — XR: o canhão mira pela pose da cabeça RELATIVA ao rig**
   (`aimDir` lê `camera.quaternion`; CLAUDE.md: "a fonte única certa é
   `vistaMundo()`/`yawDaVista()`"). Com giro artificial, o voo sai pelo giro
   inteiro de erro: **84,41°** e **173,98°** (0 argolas); `3d7d47a`: 83,64° e
   173,67°. Desde `7ae1f67` (2026-07-24). O cano também gira por `aimDir`.
   **Média para quem joga de headset com giro** — fora desta régua (celular),
   registrado para a frente VR. Não conta como [NC].
7. **Achado antigo — o corpo bate em tronco e pedra a QUALQUER altura.** O laço de
   empurrão de `obstaclesNear` no `updatePlayer` não confere `y0/y1` nem a altura
   do jogador: o voo do canhão, 21 m acima de um tronco, é empurrado 0,68 m de
   lado (4 quadros de 0,13–0,20 m); uma pedra (r 1,41) a 46 m, de novo. Existe
   desde o primeiro commit (`8dd7625`); o tronco em fatias de 0,3 m só o
   multiplicou. Baixa (qualquer voo, queda ou telhado ao lado de árvore).
8. **Segurança — carro solto** (o vizinho do [NC] 1 de r9 e o resíduo da grade):
   não remedidos (o servidor não mudou). Detalhe **fora do repo**.
9. Inalterados (código intocado): **o canhão mostra o que a bala atravessa**
   (cano 141, aro dourado 10, faixa da borda ≤ 11,2 cm — r10), **faixa de 0,45 m
   acima de peça de corpo**, **agachado atrás de poste** (16), **P1**, **C11**,
   **C1(e)**, **E9**.

**Observações sem veredito, não remedidas** (código intocado): (a) a beira da
saia do vulcão segue muralha; (c) o carro segue no relevo dentro da rocha do
vulcão enquanto alguém dirige; B6 pela letra (redação com o dono); (e) o gzip
quase não reduz a bazuca (−4 %), D6 esperando o dono; (f) P4(b): o canhão sobre
a encosta aparece como base suspensa; (g) **o texto novo do CLAUDE.md** sobre o
canhão ("da beira, voar na direção da câmera saía paralelo e passava 1 de 5")
descreve a mira na 3ª argola; mirando a 1ª, que é o caso de onde veio o "1 de
5", ainda é 1 de 5 (§4.3); (h) **a janela de boot de XR acima de 90 s dentro da
suíte** voltou (5 arquivos, §1) — o runner a chama de REGRESSÃO REAL; o boot
medido fora dela é igual ao de antes.

**Contagem:** 4 critérios reprovados (os mesmos de r10); **0 nasceu de correção
desta rodada**; **4 defeitos novos nasceram de correções** (itens 1–4, todos
baixos, nenhum de segurança); **1 correção não fechou o que prometia** (item 5);
**2 defeitos antigos achados nesta rodada** (itens 6–7).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| o recorde gravado inteiro (`SAVEinteiro`) | gravado **"2"** (árvore "1.8") | `maptoys`: **1 vermelho** (recorde com centésimos) |
| o curso só reinicia longe (`SEMreinicio`) | depois do voo de 4: `next = 4`, `running`; o seguinte **"8.1s"** (árvore: 0, falso, "1.8s") | `maptoys`: **1 vermelho** (UM voo) |
| sem o puxão (`SEMpuxao`) | lado 4 m → 3ª **0 de 5**, lança a 4,0 m; 4,5 m → 0 (árvore 5, 5; 0,0 m) | `maptoys`: **1 vermelho** (beira) |
| o voo pela câmera, com puxão (`MIRAcamera`) | lado 4 m → 3ª **1 de 5**; 4,5 m → 1; 1,7 m → 4 (árvore 5, 5, 5) | `maptoys`: **1 vermelho** (beira) |
| o cliente de `3d7d47a` (`ANTES`) | a coluna "antes" de §A.3; o voo seguinte ao parcial "8.0s"; recarga: "2" | `maptoys`: **3 vermelhos** |
| a carreta numa fatia só (`UMAfatia`) | (r10: a faixa vai a 25,5 cm) | `atracoes-bala`: **1 vermelho** (r10: **0**) |
| os fatores de círculo (`CIRCULO`) | (r10) | `atracoes-bala`: **1 vermelho** |
| sem o pedestal (`SEMpedestal`) | (r10) | `atracoes-bala`: **1 vermelho** |
| as argolas pela balística ideal (`ARGOLASideal`) | (r10: 3 de 5) | `maptoys`: **2 vermelhos**; `cannon-core`: 0 |

Controle (cópia = árvore): `atracoes-bala` 11/11, `maptoys` 13/13,
`cannon-core` 12/12.

**Todo mutante avermelha alguma sonda minha e algum teste do construtor** — o
buraco de r10 (`UMAfatia`) fechou. O que os testes não medem, e que esta rodada
achou: a mira na argola ACESA (§4.3); o anúncio "RECORDE" depois de recarregar
(§4.5; o teste confere a gravação, não a comparação); o brilho da argola
(§4.2); a saída do helicóptero (§4.1); o carro atravessado (§4.4); o XR (§4.6).

**As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): os dois resíduos de r10 — o
   servidor não mudou, eles seguem, os dois sem teste.
2. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
3. **XR do canhão** (§4.6): `vistaMundo()`/`yawDaVista()` no `aimDir` — média
   para quem joga de headset, barata.
4. **O curso de argolas** (§4.1–4.5): o "RECORDE" depois de recarregar (comparar
   na precisão gravada), a mira na argola acesa (o ponto mirado a 30 m não é o
   que o jogador mira quando mira a 1ª), a argola acesa que some, a saída do
   helicóptero, o carro atravessado — todos baixos.
5. **O empurrão de tronco/pedra sem altura** (§4.7) e **[NC] 2 de r8** (poste).
6. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
