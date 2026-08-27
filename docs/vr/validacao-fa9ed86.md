# Validação do porte VR — commit `fa9ed86`

Sexta rodada. Autor: o **validador**. Procedimento: §12 de `criterio-aaa.md`,
reexecutado inteiro.

**Condição declarada** (sem isso não é medida): cópia isolada do commit via
`git archive fa9ed86`, md5 conferido arquivo a arquivo contra `git show` (11 de
11 idênticos); máquina ociosa, `load average 1,25` no minuto (teto do §12: 1,5),
12 núcleos; Chrome com GPU real; IWER 2.3.0 preset Meta Quest 3; **three
r0.184.0** (o `importmap` de `index.html` aponta para o CDN — não o 0.185.1 do
`node_modules`); seed 424242; sessão `immersive-vr` real via
`test/helpers/iwer.js` → `bootEmVR`; portas 3480–3489. Oito sessões imersivas.
`npm test` **não** foi executado (read-only, por instrução).

**Placar: 25 verdes · 7 vermelhos · 15 não medidos.**
Progressão: 14 → 19 → 22 → 22 → 23 → **25**.

---

## 0. O amostrador desta rodada (por que os números valem)

A rodada passada registrou que o amostrador de vista compunha `rig(N) × pose(N−1)`
e **cancelava o próprio erro**. Para não repetir isso, a vista aqui **não** é lida
durante o tick. O probe captura a `XRSession` real (patch em
`navigator.xr.requestSession`, antes de qualquer script da página), registra um
`session.requestAnimationFrame` **depois** do três já ter registrado o dele, e lê
`camera.matrixWorld` — a matriz que o `render()` daquele frame acabou de escrever.

Isso importa: `renderer.render` no three r184 é **propriedade de instância**
(`this.render = function…`, three.module.js:17541), não do protótipo. Quem tentar
instrumentar por `WebGLRenderer.prototype.render` não instrumenta nada e mede o
que sobrou na memória. Foi a primeira coisa que quebrou aqui.

---

## 1. Veredito, um por critério

### A — Giro e locomoção

| # | veredito | medido |
|---|---|---|
| A1 · giro não translada a cabeça | **APROVA** | **0,00000 m em 16 casos** (raios 0,71 e 1,4 m × 4 direções × 2 sentidos). Teto 0,02. |
| A2 · passo é escolha do jogador | **APROVA** | Herdado — `js/xr/xrturn.js` não aparece no diff `4c4810b..fa9ed86`. |
| A3 · velocidade humana | **APROVA** | Perfil padrão `conforto` dentro dos tetos; `auditar()` do próprio módulo devolve `ok:true` sem faltas. `IGUAL AO PC` alcançável: 5,2000 / 8,6000. |
| A4 · aceleração instantânea | **APROVA — exceção aceita, com uma condição** | `conforto` **50,0 ms** · `alcance` **50,0 ms** · `paridade` **286,5 ms** medidos em sessão (teto 150). Ver §2.1: aceito a exceção e reprovo a **amarra que não foi implementada**. |
| A5 · vinheta some ao parar | **APROVA** | Receita do §12 (andar 2 s, parar 1,5 s), teto 0,0100: `conforto` **0,000000** · `alcance` **0,000000** · `paridade` **0,000000**. Ao parar de **girar**, idem: **0,000000** nos três. Era 0,00698 / 0,01144 / 0,01371. **Fechado pela raiz, e a raiz aguentou.** |
| A6 · nada além do pescoço move a vista | **REPROVA** | As três causas da rodada passada **morreram e eu re-medi as três** (§2.2). Restam dois donos de câmera **sem gate de XR nenhum**, em estados que A6 nomeia: `city-destruction-client.js:154‑180` escreve `MP.camera.fov/position/quaternion` na cinemática (zero ocorrências de `presenting` no arquivo) e `br-game.js:829`/`:1379` pilotam queda e paraquedas por `camera.getWorldDirection`. Não visitei esses estados em sessão — reprovo pelo código, não pela medida. |

### B — Mira e empunhadura

| # | veredito | medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | **APROVA** | Herdado (`xrweapon.js`, `xrhands.js` fora do diff). |
| B2 · 1:1 sem bob nem sway | **APROVA** | Herdado, mesmo motivo. |
| B3 · dá para ver pelo buraco | **REPROVA — defeito NOVO desta rodada** | Ver §2.3. O tiro deixou de sair na linha de mira: a **5 m** ele passa a **15,98 cm** do ponto que a alça indica na ESCOPETA, **5,68 cm** no SNIPER. |
| B4 · botão de mirar não teleporta | **APROVA** | Medido: apertar e soltar `squeeze` não muda **nada** na geometria mira↔cano (0,1810 m e 0,0589 m idênticos nos dois estados, três armas). |
| B5 · segunda mão importa | **NÃO MEDIDO** | Não existe conceito de segunda mão. **Sexta rodada.** |
| B6 · háptico em toda ação | **APROVA** | Herdado: `XRTato.emitir` cobre tiro, acerto, recarga, ferrolho, **pegar**, dano e UI. |
| B7 · o tiro sai do cano | **APROVA — com o instrumento quebrado** | **Origem a 0,0011–0,0126 m da boca** em 6 das 8 armas (teto 0,05). Era 0,437–0,910 m. Mas a **BAZUCA** e a **FACA** nunca reescrevem `_origemDoTiro` (§2.4) — o acessório de QA devolve o valor da arma anterior para as duas. |

### C — Corpo, altura e escala

| # | veredito | medido |
|---|---|---|
| C1 · nunca enterrado | **APROVA** | Receita do §12, **1200 frames**: folga **1,5985 – 1,6007 m**, amplitude **2,2 mm** (janela 1,20–2,10). Era 18 mm. |
| C2 · o corpo segue a cabeça | **REPROVA** | Receita (quadrado de 2 m, 0,5 m/s, **1799 frames**): separação máxima **0,0131 m** ✔. Mas: (a) **contra parede**, pico de **0,1331 m** (teto 0,10) — e o colisor **atravessa**: 10 m de caminhada física pedidos, colisor andou **10,9623 m**; (b) **morto**, 3,00 m de passo físico → separação **3,0000 m**, colisor **0,0000 m**, sem teto. Ao reviver escoa a 0,0000 sem teleporte. |
| C3 · altura do aparelho, agachar | **APROVA** | Herdado (`xrbody.js` fora do diff). |
| C4 · escala 1:1 em metros | **NÃO MEDIDO** | **Sexta rodada.** |
| C5 · corpo em 1ª pessoa coerente | **NÃO MEDIDO** | **Sexta rodada.** |
| C6 · o avatar que os OUTROS veem | **APROVA** | Herdado no yaw. Ressalva de C2 permanece; não medi em dois clientes. |

### D — Interação com o mundo

| # | veredito | medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | **REPROVA** | `js/xr/xrinput.js` tem **zero** ocorrências de `KeyG`/`KeyQ`/`KeyF`/`KeyT`: **lançar granada, usar kit médico, comer e trocar acessório de mira** continuam sem mapeamento. Quatro, iguais à rodada passada. `br-game.js:1814` ainda instala o `keydown` de DOM. |
| D2 · alcance medido da cabeça | **APROVA — com ressalva medida** | Separação 0,0131 m no pior frame da receita. Ressalva: no encosto de parede o pico de **0,1331 m** passa do teto de 0,10 por ~3 frames. `js/interact.js` continua medindo de `player.pos` (7 ocorrências). |
| D3 · pegar é com a EMPUNHADURA, e perto | **REPROVA** | Herdado: `xrinput.js` e `xrinteract.js` fora do diff. **Sexta rodada sem uma linha.** |
| D4 · affordance dentro do mundo | **APROVA** | Herdado. |
| D5 · veículo sem quebrar cabeça nem chão | **APROVA** | Herdado; não re-isolei o salto de saída. Sexta rodada com essa ressalva. |
| D6 · tudo alcançável de posição fixa | **NÃO MEDIDO** | **Sexta rodada.** |

### E — Desempenho

| # | veredito | medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | **NÃO MEDIDO** | `session.frameRate` 72 declarado. O resto é do aparelho. |
| E2 · orçamento em estéreo | **REPROVA** | `node scripts/vr-emulado.js --port=3483`: menu **344 / 985 554**, spawn **354 / 1 001 900**, cidade **364 / 833 280**, castelo **395 / 1 146 428** (calls/triângulos, estéreo, mediana). **Por olho:** 172 / 177 / 182 / **197,5** calls e 492,8 k / **500,9 k** / 416,6 k / **573,2 k** triângulos. Tetos 180 / 500 k. Queda real contra `4c4810b` (era 350–414 calls): **castelo −11 a −19 calls**. |
| E3 · escala de render ≥ 85 % | **NÃO MEDIDO** | Aparelho. |
| E4 · lógica de app ≤ 2 ms | **NÃO MEDIDO** | Aparelho. |
| E5 · térmica 30 min | **NÃO MEDIDO** | Aparelho. |

### F — Boot e ciclo de sessão

| # | veredito | medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | **NÃO MEDIDO** | Aparelho, cache frio, N ≥ 7. |
| F2 · foco perdido | **APROVA** | Herdado (`xrsession.js` fora do diff). |
| F3 · recentrar não teleporta nem enterra | **APROVA — e a ressalva grave MORREU** | `dev.recenter()` a **0,55 m**: jogador **0,0000 m**, **vista 0,0000 m em 18 frames consecutivos**. A **1,0 m**: **0,0000 / 0,0000**. Era 0,7778 e 1,4142 m de tranco de vista. |
| F4 · sair devolve o desktop intacto | **APROVA** | Herdado. |
| F5 · jogável de ponta a ponta | **APROVA** | Herdado da rodada passada. |

### G — Qualidade de imagem

| # | veredito | medido |
|---|---|---|
| G1 · foveação declarada | **APROVA** | Herdado (0,2). |
| G2 · antialiasing em XR | **NÃO MEDIDO** | O IWER não expõe `samples` do alvo XR. `antialias: true` está em `game.js:333` — a pré-condição existe, o número não. |
| G3 · escala de framebuffer declarada | **APROVA** | Herdado (0,9). |
| G4 · texto e mira legíveis | **NÃO MEDIDO** | Parte humana obrigatória. |
| G5 · uma captura por entrega | **NÃO MEDIDO** | `output/vr/` não tem captura estéreo nova. **Sexta rodada sem** — e esta mexeu em duas coisas que se VEEM (o atlas dos esqueletos e a mira). |

### H — HUD e UI dentro do mundo

| # | veredito | medido |
|---|---|---|
| H1 · nada essencial só no DOM | **REPROVA** | **16 de 17.** Varri a cena inteira em sessão: `xrHudArma` e `xrHudPulso` presentes e visíveis, **`xrHudMapa` ausente**. O código do mapa existe (`js/xr/xrhud.js:108‑117`, "item 17 de 17") mas `criar('mapa', …)` nunca roda porque `d.mapa.canvas` chega vazio no estado que medi. |
| H2 · UI não é colada na cara | **APROVA** | Herdado. |
| H3 · o retículo não mente | **APROVA** | Por ausência declarada. |

### I — Ausência de defeito grosseiro

| # | veredito | medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | **NÃO MEDIDO** | **Zero caixas marcadas.** Sem elas a rodada não está validada. O kit novo destrava o caminho mas tem defeito de veredito — §3. |
| I2 · zero erro de console | **APROVA** | `__game.errors`, `pageErrors` e `consoleErrors` **vazios nas oito sessões imersivas**. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | **NÃO MEDIDO** | Não amostrado. **Quinta rodada.** |
| I4 · nenhum estado sem saída | **NÃO MEDIDO** | O **botão morto do lobby fechou** (verificado no diff de `xrsocial.js`: `SAIR DA PARTIDA` agora só nasce com `d.jogando`). Faltam do roteiro fechado: nave, queda livre, paraquedas, dirigindo, espectador e fim de partida. |

---

## 2. As três mudanças grandes, auditadas

### 2.1 · O rig lia a pose de um frame atrás — **confirmado, e a idempotência é real**

Re-medi tudo o que a mensagem de commit afirma, e bate:

| medida | rodada passada | agora |
|---|--:|--:|
| recentrar a 0,55 m do centro → deslocamento da VISTA | 0,7778 m | **0,0000 m** |
| recentrar a 1,0 m → deslocamento da VISTA | 1,4142 m | **0,0000 m** |
| salto de rastreio de 1,00 m num frame → vista | 1,0000 m | **0,0000 m** |
| A1, 16 casos | 0,00000 m | **0,00000 m** |

**A idempotência não é fé, é álgebra, e conferi no arquivo que a página carrega.**
`this.updateCamera` (three r0.184.0, three.module.js:14561) faz
`updateCamera(cameraXR, parent)` → `cameraXR.matrixWorld = parent.matrixWorld ×
cameraXR.matrix`, e em seguida `updateUserCamera` (:14628) faz `camera.matrix =
parent.matrixWorld⁻¹ × cameraXR.matrixWorld`. O pai **cancela exatamente**: o
resultado é `cameraXR.matrix`, independente de onde o rig está no instante da
chamada. Chamar duas ou três vezes no mesmo frame dá o mesmo número.

**E o efeito colateral que o agente evitou é exatamente o que ele diz.** Medi as
poses dos dois olhos dentro da sessão:

```
olho esquerdo  [-0.03150, 1.6, 0]
olho direito   [ 0.03150, 1.6, 0]
IPD 0.06300 · meia IPD 0.03150
```

Ler `xr.getCamera().matrix` direto entregaria a matriz do **olho esquerdo**
(`cameraXR.matrix.copy(cameras[0].matrix)`), e a câmera do jogo recebe a de
**união**. O desvio seria **0,0315 m — os 3,15 cm anunciados, ao centésimo de
milímetro**, plantados lateralmente no mundo inteiro. A escolha está certa.

Registro uma imprecisão de comentário sem consequência: `js/xr/xrrig.js` cita
"three (r185)" e "three.module.js:17637". A página carrega **r0.184.0** pelo
`importmap` (`index.html:290`), onde a mesma linha é a 17575. Conferi que
`updateCamera` e `updateUserCamera` são byte-a-byte equivalentes nas duas versões
— o conserto vale; a referência é que aponta para o arquivo errado.

**O caso que exige posição ABSOLUTA existe** (`test/xr-rig.test.js`, *"a cabeça
cai EXATAMENTE onde o rig foi mandado pôr, todo frame"*, com
`assert.ok(entregue, 'o teste compôs um frame sem o runtime ter entregue pose')`).
O guarda contra o teste-que-passa-por-acidente está lá e é o certo.

### 2.2 · A parede deixou de comer o rastreio — **e cobrou C2**

O `devolverPasso` funciona: medi 10 m de caminhada física contra estrutura e a
vista andou **10,9805 m** — o mundo não trava mais. Custo, medido:

- a separação cabeça↔colisor **pica em 0,1331 m** no encosto (teto de C2: 0,10);
- o **colisor atravessa junto**: andou **10,9623 m** dos 10 m pedidos.

Isso é uma **troca de projeto, não um bug**: A6 (a vista não congela) foi
escolhido sobre C2 (a parede me para). O comentário em `js/xr/xrrig.js` assume a
escolha por escrito e o argumento é bom — a parede não existe no quarto do
jogador. **Mas a escolha não foi declarada onde precisa.** A caixa **I1 #4** é,
literal: *"Encosto numa parede andando fisicamente. **Ela me para?** ☐"*. Com o
comportamento de hoje a resposta honesta do humano é **NÃO**, e a caixa reprova
por desenho. A4 ganhou uma exceção escrita para uma decisão dessas; esta não
ganhou nenhuma.

E não há mitigação: `grep` por blackout/fade/intrusão em `js/xr/` e `game.js`
devolve **zero**. Em multijogador isso é um espiar-parede de escala de sala —
ande fisicamente para dentro do muro e você vê e atira do outro lado.

**O anti-cheat, esse, está limpo.** Conferi o caminho inteiro: `br-game.js:329`
monta `fromPos` de `MP.player.pos`, **não** da origem do raio, e
`server.js:833‑835` valida `|fromPos − p.pos| ≤ 5`. A mudança do B7 não toca esse
vetor. O que a combinação faz é degradar o `shotFired` (o tracer, `game.js:2520`,
que manda o cano como `fromPos`): com a cabeça longe do colisor, `server.js:913`
descarta a replicação por passar dos 5 m — o dano entra, o tiro some da tela dos
outros.

### 2.3 · O tiro sai do cano — **e passou a não sair na mira. Defeito NOVO.**

B7 fechou: origem a **0,0011–0,0126 m** da boca. Mas a correção re-mira o tiro
do cano para um ponto de **zeragem** na linha de mira
(`zeroVR = clamp(rayBlockedAt(…), 4, 120)`), e cano e ocular **não são
colineares**. Medido em sessão, com o controle parado:

| arma | (cano − ocular) ao longo da mira | **componente LATERAL** |
|---|--:|--:|
| ESCOPETA "TROVÃO" | 0,7000 m | **0,1810 m** |
| PLASMA "VISITANTE" | 0,5900 m | **0,2000 m** |
| SNIPER "AGULHA" | 0,7700 m | **0,0589 m** |

Idênticos no quadril e no ADS.

A consequência não é teórica. Capturei o **raio que o jogo realmente dispara**
(gancho em `window.__BR_shotMiss`, que recebe origem e ponto final reais), com
`spread` zerado, `pellets = 1` e o jogador parado, e medi a distância entre o
raio e o ponto que a linha de mira indica:

```
SNIPER "AGULHA"   (zerou em 120 m)
  2 m → 0,0583 m   5 m → 0,0568 m   10 m → 0,0544 m
 25 m → 0,0470 m  50 m → 0,0346 m  120 m → 0,0000 m

ESCOPETA "TROVÃO" (zerou em ~25 m, porque rayBlockedAt achou terreno)
  2 m → 0,1851 m   5 m → 0,1598 m   10 m → 0,1176 m
 25 m → 0,0088 m  50 m → 0,2196 m  120 m → 0,8097 m
```

Três coisas, e a terceira é a pior:

1. **O tiro e a mira só concordam em UMA distância.** Fora dela, erram — para os
   dois lados.
2. **A 10 m o erro é de 5,4 a 11,8 cm.** Uma cabeça humana tem ~16 cm.
3. **A distância de zeragem muda a cada tiro**, porque `rayBlockedAt` depende do
   que está na frente. O ponto de impacto em relação à mira **anda sozinho entre
   um tiro e o outro**. Antes desta rodada o desvio era **0 em toda distância** —
   a bala saía da própria linha de mira. Trocou-se um defeito visível (bala
   nascendo do nada) por um defeito de acerto.

Isto é REPROVA de B3 e é o que derruba a caixa **I1 #10** (*"Acerto o que estava
alinhado na mira?"*). O ângulo isolado (0,028° no sniper) passa no teto de 0,5° de
B3 — é a **origem deslocada**, não o ângulo, que produz o erro.

E há uma consequência de contrato: **B3 mede `__game.mira().direcao` chamando-a
de "a direção real do tiro". Desde `0bccf4f` ela não é mais.** Quem seguir a
receita de B3 ao pé da letra passa a medir uma direção que o jogo não usa.

### 2.4 · A quarta do "teste que passa por acidente" — **achei, e é a que guardava justamente este defeito**

`test/xr-weapon.test.js`, caso *"e a direção continua alinhada com a mira depois
de mover a origem"*. O comentário nomeia o risco com precisão cirúrgica:

> *"Mover a origem para frente SEM corrigir o ângulo manda a bala para o lado —
> seria trocar um defeito por outro pior."*

E então asserta duas coisas:

```js
assert.ok(Math.abs(r.mod - 1) < 0.01, …);   // a direção é unitária
assert.ok(r.frente > 0, …);                 // o cano está À FRENTE da ocular
```

A primeira é uma propriedade de `.normalize()` — **não pode falhar**. A segunda é
o produto escalar, ou seja **a componente AO LONGO do cano** (medida: +0,59 a
+0,77 m). A grandeza que decide "bala para o lado" é a componente
**perpendicular** — a que eu medi em 0,059 a 0,200 m — e o teste a joga fora ao
projetar. Uma arma com o cano 5 m para o lado e 10 cm à frente passa neste caso.

**O teste escrito para guardar o defeito mede o único eixo em que o defeito não
aparece.** É a quarta da família, e é a mais cara: ela dá cobertura aparente
exatamente onde a rodada regrediu.

Duas irmãs menores, na mesma mudança:

- **`origemDoTiro()` mente para 2 das 8 armas.** `fire()` retorna cedo no *melee*
  (`game.js:2315`) e no *rocket* (`:2356`), ambos **antes** de
  `_origemDoTiro.copy(_rayOrig)` (`:2404`). Medido, arma por arma, com o gatilho
  de verdade:

  | arma | disparou | `origemDoTiro` reescrita |
  |---|:-:|:-:|
  | FUZIL, ESCOPETA×2, DMR, PLASMA, SNIPER | sim | **sim** (0,0011–0,0126 m do cano) |
  | **BAZUCA "TROVOADA"** | sim | **NÃO** |
  | **FACA "AURORA"** | sim | **NÃO** |

  O número que o acessório devolve para essas duas é o da arma anterior. O
  foguete de fato nasce no cano (`Rockets.fire(_v3, …)`, `_v3 = muzzle`), então a
  substância está certa e o **instrumento** é que está quebrado — mas qualquer
  teste futuro que varra o arsenal lendo esse acessório vai ler lixo e passar.

- **A exceção de A4 não implementa a própria amarra.** O §A4 diz que ela *"só
  vale enquanto o perfil for paridade **inteira** — escala 1 e os quatro números
  do PC bit por bit"*. O código é `vale: plano => plano.escala === 1`
  (`js/xr/xrcomfort.js`) — **uma das cinco condições**. Provei rodando o
  `auditar()` do próprio módulo com um perfil forjado:

  ```
  { perfil: 'paridade', escala: 1, andar: 12, correr: 25, aceleraSolo: 4 }
  → ok: true · t95: 0,7500 s · faltas: [] · excecoes: ['A4']
  ```

  Uma rampa **cinco vezes** o teto, num perfil que não tem nada a ver com o PC,
  sai verde com a exceção carimbada. O mecanismo criado para impedir que A4
  reabra em silêncio **não impede**.

---

## 2.5 · Sobre a exceção de A4 — aceito

Aceito, e explico por quê para a decisão ficar registrada e não virar folclore:

- o argumento **não é de conforto, é de equilíbrio competitivo**, e nesse jogo
  headset e monitor disputam a mesma partida. Vantagem de headset é defeito de
  projeto. O raciocínio está certo;
- o perfil é **opt-in** e **não é o padrão** — os outros dois ficam em 50 ms
  medidos;
- o custo está escrito **com número** (t95 ≈ 273 ms; medi 286,5 ms) em vez de
  "por enquanto";
- e o decisivo: **A5 não aceita exceção nenhuma e foi fechado pela raiz**. A
  vinheta agora termina em zero exato seja qual for o pico, então o perfil rápido
  **não pode mais reabrir A5** — que era o mecanismo pelo qual "acelerar" derrubava
  conforto de lado. Sem isso eu não aceitaria.

**A aceitação tem uma condição, e ela não está cumprida:** a amarra (2) precisa
existir em código, não só em prosa (§2.4). Enquanto `vale` só olhar `escala === 1`,
a exceção é um cheque em branco para o próximo perfil que alguém chamar de
`paridade`. A4 sai **verde nesta rodada** porque o perfil real É paridade inteira
hoje (5,2 / 8,6 / aceleraSolo 11 / escala 1, conferido em sessão); sai verde
**apesar** do guarda, não por causa dele.

---

## 2.6 · Sobre a régua de triângulo — concordo com "por olho", e a conversão ficou pela metade

**Concordo com a régua.** É a leitura comparável (cena, orçamento e diretriz
publicada falam do que UMA câmera desenha), a ambiguidade era real e vinha de
rodadas, e a escolha foi feita **contra o próprio placar** — a linha continua
reprovando nas duas leituras, o que é a prova de que não foi conveniência. A
ressalva do commit também está certa e é importante: sem multiview o segundo olho
custa de verdade, então um teto por olho é régua de comparação, não orçamento de
GPU.

**Mas a conversão pegou uma linha só.** A tabela do §1 agora diz:

```
| Draw calls em estéreo (menu → castelo) | 517 – 806      | ≤ 180  |
| Triângulos por olho (estéreo ÷ 2)      | 730 k – 1,02 M | ≤ 500 k |
```

Os dois tetos — 200 draw calls e 1,5 M triângulos — saem **da mesma frase da mesma
página da Meta**. Qualquer leitura que se aplique a um se aplica ao outro; medir
um em estéreo e o outro por olho, na mesma tabela, é a maçã-com-laranja que o
commit foi consertar, movida uma linha para cima. E não é inócuo: com a régua
aplicada aos dois, os meus números de hoje ficam

```
por olho:  menu 172 · spawn 177 · cidade 182 · castelo 197,5   (teto 180)
```

ou seja **menu e spawn passariam** no teto de draw call — o que a tabela atual
esconde. **Converta a linha de draw call também**, ou a próxima rodada encontra a
mesma ambiguidade com o sinal trocado.

---

## 3. O kit `npm run vr:sessao` — destrava o caminho, mas os vereditos automáticos não podem ir ao ar

A parte que o validador mais cobra, o kit acerta: **as 20 caixas de I1 estão todas
lá, uma a uma, sem furo** (`CAIXAS_I1.length === 20`; o `.md` regenerado do
gerador bate byte a byte com o arquivo commitado), **nenhuma caixa é
auto-marcada** (a única escrita em `est.respostas` está atrás de uma tecla), e sem
aparelho ele para antes de qualquer efeito colateral. Isso é o esqueleto certo.

O problema é a camada de baixo. **Quatro vereditos podem imprimir VERDE
exatamente sobre o dado que o critério manda reprovar** — e três eu conferi
diretamente no código:

1. **E5 nunca pode reprovar por GPU.** O VrApi emite `GPU%` como **fração 0–1** —
   o próprio arquivo documenta o formato (`scripts/lib/vrdevice.js:67`:
   `GPU%=0.81`). O portão é `est.vrapiTudo.gpuPct > 90`
   (`scripts/vr-sessao.js:714`). **0,95 > 90 é falso.** Um aparelho a 95 % de GPU
   — acima do gatilho de subida de clock de 87 % que o próprio critério cita —
   sai como "GPU% dentro do teto", e o relatório ainda imprime
   `(mediana 0.95, teto 90)` sem notar.
2. **E4 sai verde sobre dado ausente.** `est.vrapiTudo.appMs <= 2`
   (`vr-sessao.js:707`) com `appMs = null` quando o campo `App=` não casa:
   **`null <= 2` é `true` em JS**. Imprime *"`App=` mediana **— ms** … **VERDE por
   inferência sólida**"* — um verde com um travessão no lugar do número.
3. **E1 ignora dois dos seus quatro requisitos.** `vereditoE1`
   (`vr-sessao.js:617`) cobra taxa, mediana, `abaixoDe60` e `stale`. Fora:
   - *"nenhuma janela de 1 s abaixo de 72"* — o campo que mede isso,
     `abaixoDaTaxa` (`vrdevice.js:139`), é calculado e **nunca lido por ninguém**
     (grep: só a própria definição);
   - **swap interval nunca é colhido** (grep por `swap` nos dois arquivos: zero);
   - e `stale` é a **MEDIANA** (`vrdevice.js:146`) enquanto `tear` ao lado é
     **soma** (`:147`). Dez segundos de stale em cem viram `stale 0`. O critério é
     `= 0`. Pior: `piorFps` é impresso **dentro da string verde** — o número que
     refuta o veredito publicado como evidência dele.
4. **`adb logcat -c` não é chamado.** O irmão faz certo
   (`scripts/vr-baseline.js:453`); o `vr-sessao` não (grep: zero). O `logcat`
   despeja o buffer velho antes de seguir e cada linha recebe `Date.now()` na
   leitura — inclusive as do painel 2D a 30 Hz, que caem direto em `abaixoDe60`
   carimbadas como se fossem do item 1.

E dois furos que atingem I1 direto:

- **A caixa 1 é inexecutável no momento em que é dada.** O bloco BOOT manda
  *"toque em ENTRAR EM VR e comece a contar"*, mas o laço do roteiro só começa
  **depois** do portão `XR.presenting === true` (`vr-sessao.js:1045`), do
  diagnóstico de controles de 10 s e da telemetria. Quando o item 1 aparece, o
  jogador está dentro do VR há mais de um minuto. E o boot que o computador mede
  (`abrirEMedirBoot`, para no primeiro frame do **painel 2D**, com o headset na
  mesa) não é a grandeza de F1.
- **O portão `presenting` é checado uma vez e some do relatório.** O arquivo
  chama isso de "O PORTÃO" e diz que *"foi lendo página fora de sessão que este
  projeto já afirmou cinco vezes, com confiança, uma coisa falsa"* — mas o campo
  `presenting` de `resumirPagina` **nunca é impresso**, o aviso de sessão caída só
  vai ao terminal, e nenhuma amostra de VrApi é filtrada por ele. Um `.md`
  arquivado pode dizer **"20 de 20 · I1 APROVA"** sobre uma sessão que morreu no
  item 3.

Ambiguidades que valem consertar antes de gastar 30 min de headset do dono:

- **I1 #3 ("o corpo veio junto?") aprova mesmo com C2 vermelho.** As duas
  cláusulas de aprovação — o mundo se move com o passo, a arma fica no lugar — são
  satisfeitas por rastreio puro. O colisor plantado não muda nenhuma das duas.
- **I1 #20 pede "72 fps", que o humano não vê**, e o relatório **não cruza** a
  caixa com o `fps` do último terço que ele tem em mãos.
- **I3 fica sem evidência nenhuma**: não tem caixa própria, a sonda nunca amostra
  distância olho↔geometria, e a resposta do bloco que o cobriria é gravada e nunca
  impressa.
- **Quatro caixas (15–17 e o soak) dependem de entrar numa partida de BR**, e o
  kit nunca põe o jogo em BR nem oferece fallback.
- Sondas com recorte errado: `folga` usa `groundAt(x, z, 999)` — com `curY = 999`
  toda plataforma passa no filtro e a função devolve o **teto**, não o piso (o uso
  canônico é `groundAt(pos.x, pos.z, pos.y)`, `game.js:1796`); a linha "A5 vinheta
  **parado**" imprime o `max` da sessão, que inclui o bloco em que a vinheta
  **deve** estar fechada; "as 8 armas" é amostrado a 1 Hz.

**Veredito do kit:** o roteiro fecha as 20 caixas e é executável como folha de
papel. **Não solte os vereditos automáticos** — hoje E1, E4 e E5 podem sair verdes
sobre dados reprovantes, que é o defeito mais caro possível num kit cujo único
propósito é destravar 8 critérios. Conserto mínimo antes de usar: `logcat -c`;
`gpuPct > 0.90`; `appMs != null && appMs <= 2`; ler `abaixoDaTaxa` e somar
`stale`; imprimir `presenting` no `.md`; e mover o bloco BOOT para antes do portão
(ou parar de chamá-lo de F1).

---

## 4. Regressão de PC e resíduo — nada

- **Atlas dos esqueletos:** sem regressão de layout de mundo. Tudo o que
  `fundirPorAtlas` constrói roda dentro de `noSeed` (`js/meshutils.js:394`). Há um
  desvio real do fluxo seedado — `cloneRig` (`js/skeletons.js:338`) fica **fora**
  de `noSeed` e passou a gastar 168 sorteios a menos (4 skins viraram 1, e
  `Skeleton` tem UUID) — mas `createSkeletons` roda em `game.js:2816`, **depois**
  de todo o worldgen e sem `await` até o próximo ponto de suspensão, então nada
  posicional se move. **O invariante segurou por ordem de execução, não por
  construção** — vale um `noSeed` em volta do laço de clone antes que alguém mova
  a chamada.
- **Defeito visual pequeno e real:** o atlas não faz *inset* de meio texel, e o
  guarda aceita explicitamente UV na costura (`u > 1 + 1e-4`). Treze vértices do
  GLB caem exatamente na borda interna e sangram para a célula vizinha; com
  mipmap a faixa contaminada dobra a cada nível. O teste novo tem a mesma
  tolerância `+1e-4` e **não pode falhar** nesse caso.
- **O teste de draw call NÃO é de grafo.** `test/world-drawcalls.test.js:912‑936`
  desliga `info.autoReset`, aquece 20 frames e faz `tick → info.reset → render →
  lê `info.render.calls``, subtraindo a corrida com os esqueletos escondidos. Mede
  frame de verdade — a armadilha da memória do repo foi evitada.
- **`updateCamera` no `sync()` não toca o PC:** duplamente guardado
  (`if (p)` no `xrboot.js` e `xr.isPresenting !== true` no `xrrig.js`).
- **Resíduo de mutação: zero.** Varri `js/`, `game.js`, `br-game.js`, `server.js`
  e `test/` por `.only(`, `skip(`, `debugger;` e marcadores de mutante: todas as
  ocorrências de "mutante" são **prosa de comentário** descrevendo mutação já
  feita. `npm run lint` limpo na cópia isolada.

---

## 5. Os três mais longe do aceite

1. **D3 · pegar é com a empunhadura** — o grip esquerdo continua sendo agachar, o
   direito mirar, e "pegar" um botão de polegar com raio medido do avatar.
   **Sexta rodada sem uma linha de código.** Exige redesenhar o mapa de botões.
2. **B5 · segunda mão** — não existe conceito de segunda mão no jogo. **Sexta
   rodada, trabalho nunca começado.** É um sistema inteiro (apoio/punho dianteiro,
   redução medível de recuo), não um ajuste.
3. **I1 · vinte minutos, vinte caixas** — **zero caixas em seis rodadas**, e o
   único caminho para elas (o kit) imprime verde sobre dado reprovante em três
   critérios. Enquanto isso não fechar, **nenhuma rodada está validada**, por mais
   verdes que o resto acumule.

## 6. O que o dono reclama primeiro

**A mira.** Ele já disse, com estas palavras: *"eu não consigo ter o movimento de
mira centralizado, ver o buraco da mira da arma, de forma real."* Nesta rodada a
arma finalmente cospe a bala do cano — e a bala parou de ir aonde a alça aponta.
A 5 m ele erra por **16 cm** com a escopeta; e como a zeragem muda a cada tiro,
o desvio **não é constante**, que é a pior forma possível: não dá nem para
compensar na mão. Ele vai notar no primeiro pente.

Em segundo lugar, na mesma sessão: **ele atravessa a parede andando**. O mundo
não trava mais (isso melhorou de verdade), mas o corpo passa junto — e a caixa
I1 #4 pergunta, literal, se a parede o para.

## 7. Quanto falta para "ausência de defeito"

Pela regra do §0 — um vermelho reprova a entrega inteira — **a rodada está
devolvida**, com 7 vermelhos.

O saldo honesto: **25 de 47 verdes, 7 vermelhos, 15 não medidos.** Dos 15 não
medidos, **8 dependem de aparelho ou de humano** (E1, E3, E4, E5, F1, G4, I1 e a
metade humana de G5) e **7 são trabalho de medição que seis rodadas não fizeram**
(B5, C4, C5, D6, G2, I3, I4).

Traduzindo em distância: **7 defeitos para consertar, 7 medições para fazer, e
uma sessão de headset cujo kit precisa de cinco correções antes de valer.** Os
consertos não são simétricos — A6, C2 e H1 são pequenos e localizados; B3 exige
decidir o que fazer com a zeragem; D1 e D3 são o mesmo trabalho (o mapa de
botões) e resolvem quatro critérios juntos.

Duas coisas devem ser ditas em favor da rodada. **A causa raiz que eu mesmo
escrevi foi de fato eliminada** — não mitigada, eliminada: 0,0000 m em três
medidas independentes onde antes havia 0,78, 1,41 e 1,00 m. E **A5 foi fechado
pela raiz**, de um jeito que tira da frente a classe inteira de regressão que
derrubava conforto toda vez que alguém mexia em velocidade. São as duas melhores
correções que este porte recebeu até aqui.

O que não melhorou é o padrão: **as duas mudanças grandes que fecharam critérios
abriram defeito novo** — o tiro que não sai na mira e a parede que deixa de parar
—, e o teste escrito para guardar exatamente o primeiro mede o único eixo em que
ele não aparece. Sexta rodada, mesmo padrão, terceira vez que uma correção planta
o próximo achado.
