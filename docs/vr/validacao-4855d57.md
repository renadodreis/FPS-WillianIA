# Validação do porte VR — commit `4855d57`

Décima primeira rodada de validação. Autor: o **validador independente**.
Procedimento: §12 de `criterio-aaa.md`. **A régua não foi tocada**
(`docs/vr/criterio-aaa.md` está byte a byte como estava, e os laudos anteriores
também).

**Condição declarada** (sem isto não é medida): commit `4855d57` na `dev`
(rodada 17 = `8d81f6c` + `4855d57`). Máquina **ociosa o tempo inteiro** —
`load average` de 1 min entre **0,13 e 0,91** em todas as leituras, e entre
**0,14 e 0,74** nas que importam. Chrome com GPU real; IWER preset Meta
Quest 3; sessão `immersive-vr` real via `test/helpers/iwer.js` → `bootEmVR`;
**portas 3760, 3762, 3766, 3768, 3770, 3772, 3774** para as minhas sondas, mais
as portas próprias dos arquivos de teste do repo e a **3275** (padrão do
`vr-emulado`). **A porta 3000 nunca foi tocada.**

**A árvore de código voltou pristina.** Mutei cinco arquivos de produção ao
longo da rodada (`game.js`, `js/xr/xrrig.js`, `js/xr/xrboot.js`,
`js/fpbody.js`, `js/xr/xrweapon.js`); **md5 conferido antes e depois de cada
mutação, todos idênticos no fim**, `git diff` vazio, e `git status` fecha com
os mesmos três não-rastreados do começo (`.codex/`, `AGENTS.md`,
`docs/vr/validacao-18a231e.md`). `npm run lint` limpo. Nada foi commitado.
**Nenhum arquivo de teste do repo foi editado.**

**Linha de base dos arquivos que a rodada 17 tocou** (os seis reescritos, o novo
e o `xr-aviso`): `node --test --test-concurrency=1` → **52 testes · 52 passam ·
0 falham · 194,3 s**, com `load` de 1 min em **0,15**.

---

## Placar

> **32 verdes · 3 vermelhos · 4 não medidos, em 39.**

Progressão de verdes: 14 → 19 → 22 → 22 → 23 → 25 → 26 → 25 → 27 → 31 → **32**.

**A6 caiu — o vermelho mais antigo do laudo, e ele caiu de verdade.** Medi os
nove estados que alcanço com a cabeça parada e a vista não se move em nenhum;
o salto de 1,000 m ao fechar o painel, que era o que mantinha A6 vermelho na
rodada 10, mede **0,0000 m/frame** agora.

**Defeitos que reprovam e que nasceram de uma correção desta rodada: 0.**
Nenhum dos três vermelhos foi criado pela rodada 17, e nenhum dos arquivos
adjacentes ao rig regrediu (246 testes em dois lotes, todos verdes).

**Os seis guardas consertados MORDEM, os seis.** Reinjetei as sete mutações do
laudo anterior e publico o par de números de cada uma (§4). Mas **a prova
escrita de um deles é falsa** (§4.2), e **um caso novo passa por acidente**
(§5.1).

| categoria | verdes | vermelhos | não medidos |
|---|--:|--:|--:|
| A · giro e locomoção | **6** | 0 | 0 |
| B · mira e empunhadura | 6 | **1** (B7) | 0 |
| C · corpo e escala | 4 | **1** (C2) | 1 (C4) |
| D · interação | 5 | 0 | 1 (D6) |
| E · desempenho | 0 | **1** (E2) | 0 |
| F · boot e sessão | 4 | 0 | 0 |
| G · imagem | 2 | 0 | 1 (G2) |
| H · HUD no mundo | 3 | 0 | 0 |
| I · defeito grosseiro | 2 | 0 | 1 (I4) |

Fora do denominador, os **8 que nenhuma máquina fecha** (E1, E3, E4, E5, F1,
G4, G5, I1) continuam `aguardando aparelho`/`aguardando humano`. **G5 e I1
estão na décima primeira rodada sem artefato novo.**

---

## 1. As quatro perguntas do briefing, respondidas de saída

1. **O vermelho §2.2 foi consertado?** **SIM, e conferido por sonda minha.**
   Com passo FÍSICO de 2 cm por frame, em **cinco** estados (a pé, painel de
   pausa, cinemática, `__BR_freeze`, menu): comando **0,9800 m** → vista
   **0,9800 m** → **colisor 0,9800 m**, separação **0,0000 m**, salto ao sair
   **0,0000 m/frame** nos dois eixos. §2.1.
2. **Os sete testes acidentais foram consertados?** **Seis de sete.** Os seis
   reescritos mordem, cada um com o par de números (§4). O sétimo (`xr-aviso`,
   consertado pelo orquestrador) **também morde: 8 de 9 vermelhos**. O caso
   §5.8 do laudo anterior (`xr-corpo-piso`), que não estava no escopo,
   **continua sem morder** (§5.3).
3. **As duas réguas novas ligaram alguma coisa?** **Não.** `XR.separacao` e
   `XR.saltoDescartado` têm **zero chamadores** em produção (`grep` em `js/`,
   `game.js`, `br-game.js`, `city-destruction-client.js`, `server.js`,
   `scripts/`). A cortina continua entrando por `foraDoCorpo`
   (`game.js:3795`), e `js/interact.js` e `js/xr/xrcomfort.js` **não foram
   tocados** pela rodada 17 (`git diff --stat 18a231e..4855d57` vazio nos
   dois). §2.3.
4. **O caso desmarcado passa por mérito?** **Sim.** Com o defeito ORIGINAL
   reinjetado (código de produção de `18a231e` contra os testes de `4855d57`)
   ele fica vermelho com `colisor/comando: a pé 1,0000 · cinemática 0,0000 ·
   painel 0,0000`. Ressalva de escrituração: o caso **nunca existiu marcado
   `todo` em commit nenhum** — `git show 18a231e:test/xr-passo-vista.test.js`
   não o tem; a marca só é citada no cabeçalho do arquivo, que ficou
   desatualizado. §4.2.

---

## 2. O que mudou, auditado

### 2.1 · §2.2 fechou — cinco estados, régua minha, passo de 2 cm por frame

Sonda própria (`/tmp/.../probe/pB-passo2.test.js`, porta 3762). Régua
independente: `dev.position`, que é a minha caneta. Vista lida de
`camera.matrixWorld` **depois do render**. Colisor é `player.pos`, que nem a
sonda nem o rig escrevem.

**Detalhe de instrumento que quase virou defeito falso:** na primeira sonda eu
reposicionava o headset para a origem entre cenários, e isso é um salto de
0,98 m num frame — `XR.saltoDescartado` acendia em 0,9800 m e parecia defeito
do produto. Refeita com a **volta ANDADA** em degraus de 2 cm, o alarme fica em
zero. Quem repetir: **a volta também é caminhada.**

| estado | comandado | vista | **COLISOR** | separação | `foraDoCorpo` | `saltoDescartado` | salto ao sair (horiz./cota) |
|---|--:|--:|--:|--:|--:|--:|--:|
| a pé | 0,9800 | 0,9800 | **0,9800** | 0,0000 | 0,0000 | 0,0000 | 0,0000 / 0,0000 |
| painel de pausa | 0,9800 | 0,9800 | **0,9800** | 0,0000 | 0,0000 | 0,0000 | 0,0000 / 0,0000 |
| cinemática | 0,9800 | 0,9800 | **0,9800** | 0,0000 | 0,0000 | 0,0000 | 0,0000 / 0,0000 |
| `__BR_freeze` | 0,9800 | 0,9800 | **0,9800** | 0,0000 | 0,0000 | 0,0000 | 0,0000 / 0,0000 |
| menu (`!started`) | 0,9800 | 0,9800 | **0,9800** | 0,0000 | 0,0000 | 0,0000 | 0,0000 / 0,0000 |

Maior passo comandado por frame: **0,0200 m** em todos — três vezes abaixo do
limiar de 0,35 m, ou seja **o ramo do descarte não foi exercitado**, que é a
condição que o briefing cobrava. Era **colisor 0,0000 m e separação 1,0236 m**
na rodada 10, com salto de **1,0000 m/frame** ao fechar.

**Os dois estados que nenhum teste da rodada 17 mede — `__BR_freeze` e o MENU —
também fecham.** Eles estão na lista do `game.js` e ninguém os mediu; medi.

### 2.2 · A afirmação central do commit está invertida, e uma linha do conserto não tem guarda

O commit `4855d57` diz: *"A causa é uma linha ausente, não duas: MEDIR o passo
físico morava dentro do `place()`… Medir virou CONTRATO DE FRAME"*. Testei as
duas metades em separado:

| metade arrancada | colisor (de 0,9800 comandados) | separação | salto ao sair | suíte |
|---|--:|--:|--:|---|
| **só `rig.rastrear()` fora do `sync()`** | 1,0000 | 0,0200 | 0,0000 | **14 de 14 VERDES** |
| **só as duas linhas `XR.place()` novas do `game.js`** | 0,9800 | 0,0000 | **0,7009 m/frame na cota** | 12 verdes, **2 vermelhos** |
| ambas (o defeito original) | 0,0000 | 1,0000 | **1,0000 m/frame** | 9 verdes, **5 vermelhos** |

**Leitura.** A metade que sustenta o eixo horizontal é o `XR.place()`
acrescentado aos dois ramos do `game.js`, não o `rastrear()`. Arrancando o
`rastrear()` do `sync()` — a linha que o commit vende como *a* causa — o
colisor passa a andar **1,0000 m para 0,9800 m comandados** (2 % de excesso, um
degrau inteiro) e a separação sobe de 0,0000 para 0,0200 m, e **nenhum dos 14
casos fica vermelho**: o teto de colisor é um piso (`>= passo × 0,96`) e o de
separação é 0,10 m.

Isso **não é defeito** — o valor arquitetural do `rastrear()` (nenhum estado
futuro re-arma a armadilha, porque nenhum passa por fora do `sync()`) é real e
eu concordo com ele. Mas **é uma linha de conserto sem guarda**, e a frase do
commit está trocada: são duas linhas, e a que o commit não destaca é a que os
testes seguram.

### 2.3 · As duas réguas novas — confirmado que não ligaram nada

```
grep -rn "separacao|saltoDescartado" js game.js br-game.js \
     city-destruction-client.js multiplayer-client.js server.js scripts
```
devolve **só** as declarações em `js/xr/xrrig.js`, os dois getters de
`js/xr/xrboot.js`, e ocorrências **homônimas e anteriores** em
`js/xr/xrcomfort.js` (`LIMITES.separacaoM`, que é o teto de C2 do relatório de
conformidade) e em `scripts/vr-sessao.js` (variável local do roteiro humano).
**Nenhum consumidor novo.**

- A cortina continua entrando por `foraDoCorpo`: `game.js:3795`
  `XR.conforto.intrusao(dt, XR.foraDoCorpo, sondaDeSolidoXR())`. Medido no
  banco de parede: `fora máx 0,4200 m → escuro máx 1,000`.
- `js/interact.js` **não mudou um byte** na rodada 17, e continua lendo
  `foraXR` = `XR.foraDoCorpo` (`game.js:3075` e `:3087`). A semântica do
  alcance de interação está intacta.
- `js/xr/xrcomfort.js` **não mudou um byte**.

**Uma ressalva sobre `saltoDescartado`:** ele **trava e nunca é limpo** (só em
`enter()`). O comentário promete *"zero em operação sadia; diferente de zero é
um frame que ninguém rastreou"*, mas um único recentrar legítimo o deixa aceso
para sempre. Como alarme de QA ele acusa **que já houve**, nunca **que há**.
Não reprova nada — é getter sem consumidor —, mas quem for lê-lo precisa saber.

### 2.4 · A6 — o vermelho caiu, medido em nove estados

Cabeça **parada**, 1,8 s por estado (≈108 frames), vista amostrada de
`camera.matrixWorld` **depois do render**, giro medido por quaternion:

| estado | frames | desloc. máx | por frame | giro máx | FOV |
|---|--:|--:|--:|--:|---|
| jogando | 108 | **0,00000 m** | 0,00000 | **0,0000°** | 89,9968 fixo |
| atirando | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| tomando dano | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| pausado | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| cinemática | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| morto | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| voando | 102 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| `__BR_freeze` | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |
| menu | 108 | 0,00000 | 0,00000 | 0,0000° | 89,9968 fixo |

Mais o que §2.1 já mostra: **salto ao sair de qualquer estado, 0,0000 m/frame**,
horizontal e cota. **APROVA.**

**Ressalva declarada, e ela é a mesma de dez rodadas:** nave do BR, queda livre,
paraquedas, espectador e fim de partida continuam fora de alcance (exigem
`startBRMatch` com segundo cliente, e a lição do CLAUDE.md avisa que
`startBRMatch` pula a fase da nave de propósito). A leitura estática de
`br-game.js` fecha, mas leitura não é medição.

### 2.5 · C2 — CONTINUA VERMELHO, e agora em três estados que ninguém tinha medido

O passeio canônico do critério (quadrado de 2,0 m × 2,0 m, 831 frames) passa com
folga total:

```
separação pela régua do produto ................. máx 0,0000 m · média 0,0000 m
separação medida na TELA (vista pós-render − colisor) ... máx 0,0000 m
voltou ao ponto: comando 0,0200 m · colisor 0,0200 m
```

(era 0,0236 m na rodada 10 — teto 0,10 m)

**Mas o dreno do passo físico é guardado por
`!state.driving && !state.flying && !player.dead`** (`game.js:3735`), e nesses
três o colisor congela. Medi (`/tmp/.../probe/pD-mortos.test.js`, porta 3772),
com passo físico de 2 cm/frame:

| estado | comandado | vista | COLISOR | **separação** | `foraDoCorpo` | **cortina** | salto ao voltar |
|---|--:|--:|--:|--:|--:|--:|---|
| **MORTO** | 0,9800 | 0,9800 | **0,0000** | **0,9800 m** | 0,0000 | **0,000** | vista 0,0000 · corpo 0,1500 m/frame |
| **VOANDO** | 0,9800 | 0,9800 | **0,0000** | **0,9800 m** | 0,0000 | **0,000** | vista 0,0000 · corpo 0,1500 m/frame |
| dirigindo (ver ressalva) | 0,9800 | 0,0344 | 0,9650 | 0,9800 m | 0,0000 | 0,000 | vista 1,8745 m/frame |

**É a forma exata do defeito §2.2, sobrevivendo em três estados.** Separação de
**0,9800 m** contra o teto de **0,10 m** que C2 escreve *"em todos os frames"*, com
`foraDoCorpo` em zero e **nenhuma cortina acendendo** — porque nenhuma parede
recusou nada, que é literalmente o parágrafo que a rodada 17 escreveu em
`js/xr/xrrig.js` para explicar o defeito que consertou. Nessa faixa o jogador
**vê o outro lado da parede** (limiar do repo: 0,34 m de separação já mostra o
outro lado do mundo).

**Atribuição honesta: isto NÃO nasceu desta rodada.** O guarda do dreno está
idêntico em `18a231e` (`git show 18a231e:game.js`, linha 3670). É defeito
anterior, que nem a rodada 17 fechou nem o laudo 10 mediu.

**O que atenua, e é medido:** ao voltar não há teleporte de vista — a dívida é
paga a **0,1500 m/frame**, que é o teto de `consumirPasso`. O estrago é a
separação enquanto dura, não o salto na volta.

**Ressalva de escopo, declarada:** o caso `dirigindo` foi produzido escrevendo
`state.driving = true` **sem** `Car.enter` — é a bandeira, não o estado (a lição
do `startBRMatch`). Os 1,8745 m/frame de salto ao sair **não** entram no laudo
como defeito; registro o número e declaro que não medi dirigir de verdade. O
laudo 10 mediu dirigindo pelo caminho certo e achou 0,0357 m de separação.

### 2.6 · B7 — sétima rodada, os MESMOS oito números

Tiro real do gatilho, `|origemDoTiro − canoPosDoTiro|` congelado no instante do
disparo, arma a arma (`/tmp/.../probe/pC-b7.test.js`, porta 3770):

| arma | origem → cano | teto 0,05 |
|---|--:|---|
| BAZUCA "TROVOADA" | **0,0000** | PASSA |
| SNIPER "AGULHA" | 0,0589 | REPROVA |
| DMR "FALCÃO" | 0,0700 | REPROVA |
| FUZIL "VAGALUME" | 0,0910 | REPROVA |
| ESCOPETA "RAJADA" | 0,0920 | REPROVA |
| ESCOPETA "TROVÃO" | 0,1810 | REPROVA |
| PLASMA "VISITANTE" | 0,2000 | REPROVA |
| FACA "AURORA" | 0,4367 | REPROVA |

**7 de 8, dígito por dígito idênticos às rodadas 9 e 10.** Nada mudou e nada
deveria ter mudado: **B7 e B3 continuam geometricamente incompatíveis** e a
decisão está com o dono há **sete rodadas**. Eu continuo marcando vermelho e
continuo não tendo autoridade para mudar isso.

### 2.7 · E2 — mediu três vezes, reprova nas três

`node scripts/vr-emulado.js`, três execuções (portas 3275, 3766, 3768). São
contagens, não tempo — a carga não as move; ainda assim, `load` de 1 min entre
0,35 e 0,67.

| pose | draw calls **por olho** (3 execuções) | teto 180 | triângulos **por olho** | teto 500 k |
|---|---|---|---|---|
| menu | 170,0 · 176,0 · 170,0 | PASSA | 492,3 k · **515,7 k** · 492,3 k | 1 de 3 fora |
| spawn | 177,0 · **183,0** · 177,0 | 1 de 3 fora | **500,5 k · 523,9 k · 500,5 k** | **3 de 3 fora** |
| cidade | **185,5 · 185,0 · 183,0** | **3 de 3 fora** | 425,0 k · 422,1 k · 416,2 k | PASSA |
| castelo | **200,0 · 198,5 · 200,5** | **3 de 3 fora** | **575,7 k · 566,9 k · 572,8 k** | **3 de 3 fora** |

Contra a rodada 10 (172 / 179 / 185 / 199,5 calls e 498,2 k / 506,4 k /
422,1 k / 572,8 k): **estatisticamente parado**. A rodada 17 não encostou em
render, e a medida confirma.

**E há um número novo que vale escrever:** o **castelo toca ou passa o teto da
META de 200 draw calls por olho em 2 de 3 execuções** (200,0 e 200,5). Até a
rodada 10 esse teto — o mais frouxo dos dois — nunca tinha sido cruzado.
**REPROVA.**

---

## 3. Anti-cheat e regressão — não reaberto

- `node --test test/security-regression.test.js` → **verde** (dentro do lote de
  98).
- **Lote 1** (`xr-rig`, `xr-parede`, `xr-conforto`, `xr-locomotion`,
  `xr-alcance`, `xr-interact`, `xr-bootstrap`, `xr-cabeca`): **148 testes ·
  148 passam · 0 falham**, `load` 0,46.
- **Lote 2** (`security-regression`, `xr-body`, `xr-corpo-ancora`,
  `xr-olho-limpo`, `xr-menu`, `xr-ui`, `xr-turn`, `xr-giro-desligado`,
  `xr-entrar-joga`): **98 testes · 98 passam · 0 falham**, `load` 0,74.
- `pageErrors` e `consoleErrors` **vazios** em todas as minhas sessões
  imersivas (I2 confirmado; ressalva de sempre: nenhuma durou 20 minutos).

**Zero regressão nos arquivos adjacentes ao rig.**

### 3.1 · Outras frentes rodando na mesma máquina — e por que isto não contaminou o laudo

Ao fechar a rodada encontrei **`server.js` de OUTRAS worktrees de agente vivos**
(`.claude/worktrees/agent-a66546d3f0fc4f315` e `agent-ac3c632181cd3f2d1`, as
duas em `4855d57`), um deles **segurando a porta 3740** — que é a porta do
`xr-painel-corpo`, arquivo que eu medi. É exatamente a armadilha que o
CLAUDE.md descreve ("worktree isola ARQUIVO, não PORTA"). Registro porque afeta
a condição declarada, e porque **não a matei**: os processos têm pai vivo, ou
seja não são órfãos — são frentes trabalhando agora.

**Por que as minhas medições não foram afetadas, com prova:**

1. **Separação no tempo.** Todas as minhas execuções ficaram entre **09:36 e
   ~10:20**. O processo que segurava a 3740 nasceu às **10:50:50** (26 s de
   vida quando o vi). São ~30 min de folga.
2. **O harness FALHA ALTO em porta ocupada — testado, não suposto.** Ocupei a
   3776 com um servidor meu e mandei o harness subir nela:
   ```
   RESULTADO: FALHOU ALTO — servidor de QA encerrou antes do boot (exit 1)
   ```
   Ou seja: porta tomada **não** produz medição silenciosamente errada, produz
   erro. (Uma primeira tentativa deste teste na 3740 "bootou" e me assustou —
   era o processo do outro agente tendo morrido entre a leitura do `ss` e o
   teste. O experimento controlado é o que vale.)
3. **A prova mais forte é o próprio método.** Cada mutante moveu os números na
   direção prevista e a restauração os trouxe de volta — 0,9800 → 0,0000 →
   0,9800, 50,75° → 131,90° → 50,75°, e assim por diante. Um servidor alheio
   teria devolvido **os mesmos números em todas as mutações**.

**Recado para o orquestrador:** havia frentes rodando teste em worktree
enquanto eu media a árvore principal. Desta vez não colidiu por sorte de
relógio. A regra do CLAUDE.md — *"enquanto o validador mede, a árvore principal
não muda, e a fila espera"* — precisa valer também para a **porta**, não só
para o arquivo.

---

## 4. OS SETE GUARDAS — reinjetei, e publico o par de números

**Veredito: os sete mordem.** Nenhum foi afrouxado. Um deles (§4.2) morde por
um motivo diferente do que está escrito nele.

### 4.0 · Tabela-resumo

| # | arquivo | mutante | laudo 10 | **AGORA** |
|---|---|---|---|---|
| §5.1 | `xr-aviso` | `rig: XR.rig, camera` fora do `game.js` | 9/9 verde | **1 verde, 8 VERMELHOS** |
| §5.2 | `xr-passo-vista` | defeito ORIGINAL (produção de `18a231e`) | — | **6 verdes, 1 VERMELHO** |
| §5.3 | `xr-corpo-coluna` | `recuoMax: 0` | 6/6 verde | **5 verdes, 1 VERMELHO** |
| §5.4 | `xr-punho-rotacao` | `rollL: 0` | 5/5 verde | **4 verdes, 1 VERMELHO** |
| §5.5 | `xr-mao-controle` | `switchWeapon(0)` ×2 | 7/7 verde | **6 verdes, 1 VERMELHO** |
| §5.6 | `xr-arma-janela` | 3 anéis de 30 cm no `guiaAro` | 5/5 verde | **4 verdes, 1 VERMELHO** |
| §5.7 | `xr-empunhadura-grip` | `gripOcupado: () => false` | 4v/2r, **apoio verde** | **3 verdes, 3 VERMELHOS, apoio VERMELHO** |
| §5.8 | `xr-corpo-piso` (fora do escopo) | `afundou = 0` | 7/7 verde | **7/7 VERDE — continua** |

### 4.1 · `xr-aviso` — o pior achado do laudo 10, fechado

**Mutante:** `game.js:4035`, `rig: XR.rig, camera, dt,` → `dt,`.

```
produto intacto ..... 9 de 9 verdes
fiação arrancada .... 1 verde, 8 VERMELHOS
  literal: "0 de N chamadas de XRHud.update chegaram sem `rig`/`camera`"
           (o contador `semArgs` sobe e o caso morre)
  e mais: "o aviso apareceu a 6.0108 m do olho — fora da faixa de foco confortável"
```

O embrulho agora **confere** em vez de preencher: `if (!o.rig || !o.camera)
semArgs++` e `assert.equal(r.semArgs, 0, …)`. O `suprimir` da medida de custo
**remove** um argumento que o jogo mandou, nunca fabrica um. **Conserto honesto,
e o orquestrador não se poupou.** H1 volta a ter guarda.

### 4.2 · `xr-passo-vista` — morde, mas a prova escrita no arquivo é FALSA

O cabeçalho do arquivo e o corpo do commit afirmam, os dois, que o colisor
*"cai de 0,5000 para 0,0000 sob o mutante"*, sendo o mutante `js/xr/xrrig.js`,
primeira linha de `place()` → `if (true) return;`. **Rodei esse mutante:**

```
place() inteiro arrancado ..... 6 verdes, 1 vermelho
   colisor/comando: a pé 1,0000 · cinemática 1,0000 · painel 1,0000
   o caso do CORPO (o desmarcado) fica VERDE
   o único vermelho é o caso 6, do salto
```

**A razão é a própria correção da rodada 17:** medir o passo saiu de dentro do
`place()` e virou `rastrear()` no `sync()`, e o dreno mora no `game.js`. Com
`place()` morto o colisor continua andando — o mutante deixou de ser o mutante.
A frase ficou copiada do laudo 10, onde era verdadeira.

**O caso morde com o mutante CERTO,** que é o defeito original —
`git checkout 18a231e -- game.js js/xr/xrrig.js js/xr/xrboot.js` com os testes
de `4855d57`:

```
produto intacto ....... 7 de 7 verdes  ·  colisor/comando 1,0000 / 1,0000 / 1,0000
defeito ORIGINAL ...... 6 verdes, 1 VERMELHO
   colisor/comando: a pé 1,0000 · cinemática 0,0000 · painel 0,0000
```

E no mesmo experimento `xr-painel-corpo` vai a **4 de 7 vermelhos**, com os
números do laudo 10 reproduzidos: `COLISOR 0,0000 m`, `sep máx 1,0000 m`,
`salto da vista ao fechar 1,0000 m/frame`, `foraMax 0,0000` sem cortina.

**Veredito:** o guarda é real, o caso desmarcado passa por mérito do produto —
e **a reprodução escrita no arquivo e no commit não reproduz mais nada**. Isso
importa porque é a frase que a próxima rodada vai usar para se convencer.

### 4.3 · `xr-corpo-coluna` — I3 medido dos DOIS olhos, e o servo cobrado

**Mutante:** `js/fpbody.js:188`, `recuoMax: 0.015,` → `recuoMax: 0,`.

```
produto intacto ......... 6 de 6 verdes
servo do olho desligado . 5 verdes, 1 VERMELHO
  literal: "com a cabeça a 0.6500 m a malha entrou a 0.1638 m do olho (dentro de
            0,15 + meia IPD = 0.1815 m) e o servo de recuo comprou só 0.0000 m
            (recuoOlho 0.0000 m)"
```

Era **6 de 6 VERDE**. O conserto acrescentou três réguas independentes (I3 de
cada olho estéreo, a distância sem o servo, e o ganho do servo dentro da faixa
`0,15 + meia IPD` **medida na sessão**) e um guarda de cenário (`mexeu >= 1`)
que impede o caso de voltar a ser a linha que nunca era visitada. **Bom
conserto.**

### 4.4 · `xr-punho-rotacao` — o eixo que faltava era a ROLAGEM

**Mutante:** `js/fpbody.js:27`, `rollL: -1.6` → `rollL: 0`.

```
produto intacto ........ 5 de 5 verdes
palma girada 91,67° .... 4 verdes, 1 VERMELHO
  literal: "o bastão que a mão do boneco segura … ficou a 131.90° do CANO,
            ou seja apontando PARA TRÁS ao longo dele (teto 90°, faixa
            geométrica possível [25,09°, 154,91°], medido intacto 50,75°)"
```

A asserção antiga (0,00° por álgebra) virou **diagnóstico impresso**, com o
motivo escrito, e o eixo que ela fingia cobrir ganhou régua de verdade: o
bastão deduzido do GLB (dedos × polegar) contra `direcaoDoCano()`. **Duas
canetas diferentes, nenhuma passando pelo código sob teste.** O teto de 90° não
é arbitrário — é o sinal da projeção, e o arquivo mostra a conta.

### 4.5 · `xr-mao-controle` — agora confere que trocou de arma

**Mutante:** `game.js:2716-2717`, `switchWeapon(1)` e `switchWeapon(2)` →
`switchWeapon(0)`.

```
produto intacto ............. 7 de 7 verdes  (vãos 0,5508 / 0,6015 / 0,6412 m)
as três viram a mesma arma .. 6 verdes, 1 VERMELHO
  [Digit1] FUZIL "VAGALUME" (índice 0) · vão 0.5508 m
  [Digit2] FUZIL "VAGALUME" (índice 0) · vão 0.5508 m
  [Digit3] FUZIL "VAGALUME" (índice 0) · vão 0.5508 m
  literal: "as três teclas deram os índices de arma 0 / 0 / 0 — o caso mediu
            a MESMA arma mais de uma vez"
```

Três asserções novas em ordem certa: **três índices distintos → três nomes
distintos → espalhamento de vão > 0,05 m**, e só então o resíduo da mão. **A
condição de medida precede a medida**, que é como tem de ser.

### 4.6 · `xr-arma-janela` — o guarda de orçamento agora conta

**Mutante:** três anéis de 30 cm de raio pendurados no `guiaAro`
(`js/xr/xrweapon.js`, dentro de `criarGuia`).

```
produto intacto ...... 5 de 5 verdes
                       pior caso: 2 objetos → 4 draw calls · maior raio 0,085 m
+3 anéis de 30 cm .... 4 verdes, 1 VERMELHO
                       pior caso: 5 objetos → 10 draw calls
  literal: "no pior caso a affordance pendurou 5 objetos no grafo da mira
            (xrPontoColimado r=0.003 m, xrGuiaJanelaMira r=0.085 m,
             MUTANTE_anel0 r=0.300 m, MUTANTE_anel1 r=0.300 m,
             MUTANTE_anel2 r=0.300 m)"
```

O `|| 1` que fazia `vistas() >= 1` passar sem sessão nenhuma virou `|| null`, e
o caso cobra **dois olhos** (`assert.equal(dentro.vistas, 2)`) — a unidade que
E2 declara. A contagem desceu a árvore a partir de `XRArma.miraNode()` e ganhou
o **raio desenhado** contra `PERP_MAX`. **Três eixos independentes, e o mutante
estoura os três.**

### 4.7 · `xr-empunhadura-grip` — o caso do APOIO deixou de ser segurado pelo `||`

**Mutante:** `js/xr/xrweapon.js:1143`, `gripOcupado: () => …` → `() => false`.

```
produto intacto ........ 6 de 6 verdes
gripOcupado desligado .. 3 verdes, 3 VERMELHOS   (era 4v/2r, com o apoio VERDE)
  [pente] porta fechada 0.0% · duasMaos 0.0% · gripOcupado 0.0% · 36 frames  → VERMELHO
  [apoio] porta fechada 100.0% · duasMaos 100.0% · gripOcupado 0.0% · 36 frames → VERMELHO
     literal: "…`gripOcupado()` esteve verdadeiro em só 0.0% dos 36 frames do
               aperto (a porta fechou em 100.0%, e `duasMaos()` estava ligado
               em 100.0%). A porta está fechada pelo termo VELHO do `||`…"
  [trava] porta fechada 27.6% · duasMaos 27.6% · gripOcupado 0.0% · 58 frames → VERMELHO
```

O espião passou a gravar **os dois termos do `||` no mesmo instante**, e cada
caso **atribui** a porta fechada ao mecanismo certo. É exatamente o conserto que
o laudo 10 pediu, e o número da mensagem de erro bate com o previsto no commit.

### 4.8 · `xr-painel-corpo` (novo) — sete casos, sete mordidas provadas

Não aceitei o arquivo pelo que ele diz. Reinjetei **quatro** defeitos
diferentes e conferi que cada asserção tem pelo menos um que a mata:

| asserção | mutante que a mata | intacto → mutado |
|---|---|---|
| `colisor >= passo × 0,96` (a pé, painel, cinemática) | defeito original | 0,9800 → **0,0000 m** |
| `sepMax <= 0,10` | `place()` arrancado | 0,0000 → **397,00 m** |
| `salto <= 0,02` ao fechar | defeito original | 0,0000 → **1,0000 m/frame** |
| `erroChaoMax <= 0,10` (encosta) | reamostragem da cota arrancada | 0,0000 → **0,7009 m** |
| `saltoY <= 0,02` (encosta) | as duas linhas `XR.place()` arrancadas | 0,0000 → **0,7009 m/frame** |
| `colisor < passo × 0,9` (parede) | — (segurado por `foraMax`/`escuroMax`) | 0,5600 m |
| `foraMax > 0,15` (parede) | defeito original | 0,4200 → **0,0000 m** |
| `escuroMax > 0,9` (parede) | `place()` arrancado | 1,000 → **0,000** |

**É o arquivo mais bem construído da frente até aqui.** Réguas independentes
(`dev.position` e a vista pós-render), condição de cenário publicada em todo
caso, o contrapeso obrigatório (parede) medido, e o filtro do salto só olha
frames em que a cabeça **não** se mexeu. Uma ressalva: **os dois casos de
ENCOSTA ficam verdes com o defeito original** (`erroChaoMax` 0,0000 e `saltoY`
0,0000, porque com o colisor congelado o chão sob ele nunca muda) — eles
guardam a regressão que a *correção* pode criar, não o defeito que ela
consertou. O arquivo declara isso; registro para ninguém confundir.

---

## 5. Testes que passam por acidente — dois achados

Varri os sete arquivos que a rodada 17 tocou procurando os dez formatos
catalogados, com reinjeção onde havia suspeita.

### 5.1 · `xr-passo-vista`, caso 4 — "a assimetria entre estados sumiu" continua sendo 0,0000 para qualquer produto (formatos 1 e 10)

A razão antiga (`vista / passoPose`) era 1 por álgebra e foi trocada por
`razaoVista = vista / passoDev`, contra a régua que o próprio arquivo escreve no
headset. **A troca ajudou os casos 1–3** — provei que `razaoVista` pode morrer
(§abaixo). **Mas o caso 4 mede o ESPALHAMENTO entre os três estados, e ele deu
0,0000 em CINCO produtos diferentes:**

| produto | vista/comando (a pé · cinemática · painel) | espalhamento | caso 4 |
|---|---|--:|---|
| intacto | 1,0000 · 1,0000 · 1,0000 | 0,0000 | verde |
| defeito ORIGINAL (`18a231e`) | 1,0000 · 1,0000 · 1,0000 | 0,0000 | **verde** |
| `place()` inteiro arrancado | 1,0000 · 1,0000 · 1,0000 | 0,0000 | **verde** |
| as duas linhas `XR.place()` fora | 1,0000 · 1,0000 · 1,0000 | 0,0000 | **verde** |
| **a "correção proibida"** (vista presa no colisor) | **0,0000 · 0,0000 · 0,0000** | 0,0000 | **verde** |

A última linha é a que fecha o argumento: **os três estados leem 0,0000 — a
vista não segue a cabeça em nenhum — e o caso da assimetria passa**, porque ele
só pergunta se os três *diferem*. Depois de a rodada 17 pôr `XR.place()` em
todos os ramos, os três estados percorrem o mesmo caminho de código e não há
mutação de uma linha que os faça divergir. **É o formato 1: asserção que não
pode falhar.**

Os casos 1, 2, 3, 5 e 6 do mesmo arquivo **morrem** com a correção proibida
(`js/xr/xrrig.js` sem `passoX/foraX` no `rig.position` + dreno desligado):

```
produto intacto ......... 7 de 7 verdes
correção proibida ....... 2 verdes, 5 VERMELHOS
   "andando a pé, a vista seguiu 0.0 % do passo físico (0.0000 m de 0.5000 m)"
   → e o caso 4 continua VERDE
```

**Conserto sugerido (uma linha):** cobrar também que cada `razaoVista` esteja na
faixa dentro do próprio caso 4, ou trocar o espalhamento pela grandeza que de
fato varia entre estados, que é `razaoCorpo` — no defeito original ela dá
1,0000 / 0,0000 / 0,0000, espalhamento **1,0000**.

### 5.2 · `xr-passo-vista` — a reprodução escrita no arquivo não reproduz (§4.2)

Não é "passar por acidente", é pior de ler: é uma **prova publicada que não
prova**. O cabeçalho afirma que `razaoCorpo` *"é a única grandeza deste arquivo
que morre com o `place()` morto: medida, ela vai de 1,0000 para 0,0000 e o caso
A PÉ fica vermelho"*, e o commit repete. **Medido: 1,0000 nos três, caso A PÉ
verde.** A frase envelheceu junto com a arquitetura que a correção mudou.

O cabeçalho também diz que o caso do corpo *"fica marcado `todo` até o produto
ser consertado"* — ele nunca esteve `todo` em commit nenhum.

### 5.3 · `xr-corpo-piso` — o §5.8 do laudo anterior continua aberto

Não estava no escopo declarado da rodada 17 (o commit diz "os outros seis"),
mas o laudo 10 o pediu no item 6. Reinjetei:

**Mutante:** `js/fpbody.js:1575`, `afundou = Math.max(0, piso - baixo);` →
`afundou = 0;`.

```
produto intacto .......... 7 de 7 verdes
afundou cravado em zero .. 7 de 7 VERDES  ✘  (idêntico ao laudo 10)
```

O antecedente do filtro (`m.folga < -ENTERRO_MAX && m.afundou < 0.01`) é a
negação exata do caso 2 do mesmo arquivo: vazio por construção com o produto
certo, e com o produto errado quem falha primeiro é o caso 2. **Asserção fraca
dentro de um arquivo bom.**

### 5.4 · O que eu varri e NÃO acusei

- **`xr-painel-corpo`** é o melhor arquivo da frente (§4.8). Formato 8 (dublê à
  mão) ausente; formato 9 coberto pelo `desnivel > 0.15` da encosta e pelo
  `passo > DIST × 0.9` de todo caso.
- **`xr-corpo-coluna`** ganhou o guarda de cenário `mexeu >= 1`, que é
  exatamente a defesa contra o formato 9 que o derrubou.
- **`xr-mao-controle`** põe as condições de medida ANTES da medida.
- **`xr-arma-janela`** trocou aritmética do ajudante por varredura de árvore, e
  as três grandezas novas são independentes entre si.
- **`xr-empunhadura-grip`** atribui a porta fechada ao termo certo do `||` em
  três casos, com o teto do caso da TRAVA declarado como não sendo sobre
  `duasMaos` porque **o cenário não cumpre essa condição** (28,1 % medidos) —
  honestidade que eu não esperava e registro.
- **`xr-punho-rotacao`** transformou uma asserção tautológica em diagnóstico
  impresso em vez de apagá-la, com o motivo escrito. É o jeito certo.

---

## 6. O que eu NÃO consegui medir, e por quê

1. **C4 (escala 1:1) e D6 (alcance de posição fixa)** — décima primeira rodada.
   Priorizei os vermelhos abertos e a verificação dos sete guardas, que era o
   pedido explícito. Assumo a dívida.
2. **G2 (antialiasing em XR)** — o IWER não expõe `samples` do alvo XR. Mesma
   causa das dez rodadas anteriores.
3. **I4 (nenhum estado sem saída)** e os estados de BR de **A6** — nave, queda
   livre, paraquedas, espectador e fim de partida exigem `startBRMatch` com
   segundo cliente. Medi `state.flying` **pela bandeira**, que não é a fase.
4. **Dirigir de verdade** — escrevi `state.driving` sem `Car.enter`, e por isso
   **não** conto os 1,8745 m/frame contra A6 (§2.5). Fica como pergunta aberta
   para a próxima rodada, e ela é barata: entrar no carro dentro da sessão,
   andar fisicamente 1 m e medir a separação e o salto ao sair.
5. **B6 (háptico)** e **B5 (segunda metade)** — herdados do laudo 10, sem sonda
   própria minha.
6. **A parte humana e a do aparelho** (E1, E3, E4, E5, F1, G4, G5, I1) —
   inalcançáveis daqui. **`output/vr/` continua com um único PNG,
   `baseline-quest.png`. Décima primeira rodada sem captura estéreo e sem
   sessão humana de 20 minutos, com `npm run vr:sessao` existindo.**

---

## 7. O que eu cobro da próxima rodada, em ordem

1. **C2 nos três estados sem dreno (§2.5).** Morto e voando têm **0,9800 m** de
   separação com **cortina zerada** — a mesma forma do defeito que esta rodada
   consertou, nos estados que sobraram. O caminho já existe e está escrito no
   próprio `js/xr/xrrig.js`: ou o dreno roda nesses estados com
   `resolverPassoSemFisicaXR` (e aí a lista do `game.js:3735` muda junto), ou a
   separação alimenta a cortina por `separacaoM` em vez de `foraDoCorpo` —
   **e o comentário do commit já explica por que a segunda opção escurece a
   tela dirigindo**, então a primeira parece a certa. Com teste que morda: o
   `xr-painel-corpo` já tem a bancada pronta, faltam dois estados na lista.
2. **Consertar o caso 4 de `xr-passo-vista` (§5.1).** Uma linha. Ele fica verde
   com a vista inteiramente presa ao colisor, que é a correção proibida.
3. **Corrigir a reprodução escrita em `xr-passo-vista` (§4.2 e §5.2).** O texto
   afirma um mutante que não morde mais. Frase de laudo envelhecida vira
   convicção errada na rodada seguinte.
4. **E2.** Duas poses de quatro fora do teto interno de draw call em 3 de 3
   execuções, três fora do de triângulo, e **o castelo tocou o teto da META de
   200 por olho em 2 de 3**. É o vermelho mais teimoso e o único que ninguém
   atacou em onze rodadas.
5. **B7 × B3 — decisão do dono, sétima rodada de espera.** Geometricamente
   incompatíveis. Não afrouxo a régua e não escolho por ele.
6. **`xr-corpo-piso`, o caso do `afundou` (§5.3).** Mutação já escrita, pendente
   desde o laudo 10.
7. **Um teste para o `rastrear()` (§2.2).** Ele é a linha que garante que
   nenhum estado FUTURO re-arma a armadilha, e hoje nada fica vermelho se
   alguém a apagar (colisor vai a 1,0000 para 0,9800 comandados e a suíte não
   vê). Um teto superior no colisor — não só o piso de 0,96 — já pegaria.
8. **G5 e I1.** Uma captura estéreo e uma sessão humana de 20 minutos destravam
   dois dos oito travados, e as duas ferramentas já existem há onze rodadas.
