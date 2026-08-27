# Validação da rodada — commit `4c4810b`

Autor: o **validador**. Quinta passagem pelo §12 de `docs/vr/criterio-aaa.md`.
Rodadas anteriores: `validacao-98b114f.md` (14 verdes), `validacao-bbe6b48.md`
(19), `validacao-3cc8eea.md` (22), `validacao-c070737.md` (22).

---

## 0. Condição da medição (sem isto não é medida)

| | |
|---|---|
| Commit medido | `4c4810b` — *docs: git add -A com agente na árvore commitou um mutante de teste* |
| Código do commit | é `aa72ded` (menu) + `00caf2a` (grama); `f755cfd` e `4c4810b` são só documentação |
| Branch | `dev` (HEAD = `4c4810b` no início e no fim da janela) |
| **Onde medi** | **cópia isolada**, `git archive 4c4810b` no scratchpad, `node_modules` por symlink |
| Conferência da cópia | md5 de `xrmenu.js`, `xrui.js`, `xrquality.js`, `xrrig.js`, `grass.js`, `game.js`, `xrsession.js`, `xrlocomotion.js`, `xrturn.js`, `xrcomfort.js`, `test/helpers/iwer.js`, `scripts/vr-emulado.js` — **os doze iguais** ao `git show 4c4810b:<arquivo>` |
| Portas | 3480–3489 |
| Runtime | IWER 2.3.0, preset Meta Quest 3, Chrome com GPU real, `test/helpers/iwer.js` → `bootEmVR` |
| Seed | 424242 |
| **Carga da máquina** | `load average` **4,13** no início da janela (o critério pede < 1,5). As sondas individuais rodaram com load de **1,29 a 2,86**, sempre uma por vez. Isso importa para **A4** (tempo em ms) e para nada mais: contagem de draw call, triângulo, pixel e metro não depende de carga. A4 reproduziu a rodada passada dentro de 2 % (286,3 contra 281,1 ms), então a leitura é segura. |
| `npm run lint` | **limpo** (rodado na cópia isolada; exit 0, sem saída) |
| `npm test` | **não rodei** — proibido nesta rodada |
| Aparelho | não rodei o passo 4 (E1-tempo, E3, E4, E5, F1 continuam do aparelho) |
| Humano de headset | nenhuma das 20 caixas de I1 marcada |

Onze sessões imersivas (`bootEmVR`) e duas fora de XR. `__game.errors`,
`pageErrors` e `consoleErrors` **vazios em todas**.

**A cópia isolada se justificou de novo, e desta vez o que mudou embaixo de mim
foi o PRÓPRIO CRITÉRIO.** Ao fim da janela, `git status` mostrava
`js/meshutils.js`, `js/skeletons.js`, **`js/xr/xrcomfort.js`** e
**`docs/vr/criterio-aaa.md`** modificados e `test/xr-conforto.test.js` novo —
outra frente trabalhando enquanto eu media (mtime 22:30–22:36; eu li o critério
às 22:12). Nada disso entrou em número nenhum deste documento. O que ela propõe
está registrado no §12, porque muda a régua da PRÓXIMA rodada e não desta.

Superfície de código da rodada, inteira: **6 arquivos** — `game.js` (3 trechos),
`js/grass.js`, `js/xr/xrmenu.js` (novo), `js/xr/xrquality.js`, `js/xr/xrrig.js`,
`js/xr/xrui.js`. Li os seis diffs por completo. Tudo o mais está intocado desde
`c070737` e é herdado com essa palavra escrita.

---

## 1. Placar

| Rodada | 🟢 Verde | 🔴 Vermelho | ⚪ Não medido |
|---|--:|--:|--:|
| `98b114f` | 14 | 19 | 14 |
| `bbe6b48` | 19 | 14 | 14 |
| `3cc8eea` | 22 | 10 | 15 |
| `c070737` | 22 | 10 | 15 |
| **`4c4810b`** | **23** | **9** | **15** |

**F5 virou verde, e é a maior linha que já virou verde nesta frente.** Eu
executei o ciclo inteiro dentro do headset, pelo caminho do produto, sem tocar
em DOM: menu → lobby → menu → SOLO → partida → pausa → SAIR DA PARTIDA → menu
→ SOLO → morte → VOLTAR AO MENU → menu → SAIR DO VR. É o §7/F5 do critério
palavra por palavra.

Nenhum verde caiu. O placar andou uma casa porque **A6 e E2 continuam
vermelhos pelas mesmas causas que eu já tinha medido** — e essa é a notícia
menos confortável da rodada: pela primeira vez em quatro passagens, as causas
de A6 **não são novas**.

---

## 2. Varredura de resíduo de mutação (prioridade alta do pedido)

### 2.1 · O mutante conhecido está morto — e eu conferi na tela, não no diff

`js/grass.js:59` no HEAD é `const loBlade = bladeGeometry(2);`, sem `.scale()`.
Mas diff não é prova de comportamento, então medi o efeito:

| configuração | pixels de alvo visíveis (de 1 847 sem grama) |
|---|--:|
| desktop, anel 4, sem degrau mínimo | **94** |
| headset, anéis 0/2, com lâmina de 1 segmento | **92** |

Alvo opaco do tamanho de um corpo deitado a 18/25/32 m, olho **em pé** a 1,6 m
procurando, seis casos somados. **O headset esconde MAIS**: 95,02 % contra
94,91 %. E a geometria bate: `alturaMax` 1,000 · `larguraBase` 0,05000 ·
`larguraTopo` 0,00900 **idênticos nos três degraus** (8 / 4 / 2 triângulos).
Wallhack não existe aqui. O número do commit (92 contra 94) **reproduz exato**.

### 2.2 · O incidente teve DOIS defeitos no ar, não um — e o segundo é pior

O commit `00caf2a` desfaz o mutante e ninguém registrou que ele desfez outra
coisa junto. Em `aa72ded`, `js/grass.js` tinha:

```js
const loBlade = bladeGeometry(2); loBlade.scale(0.35, 1, 1);   // o mutante
const minBlade = bladeGeometry(1);                             // ESTE também estava no ar
```

`bladeGeometry(1)` é um `BufferGeometry` novo criado **no boot**, e todo
`BufferGeometry` gasta **4 números do `Math.random`** no UUID — que durante o
worldgen É o fluxo seedado. Isso desloca o layout do mundo de **todos os
jogadores da mesma seed**, e quebra a reconstrução do terreno que bot e
servidor fazem a partir dela. É o invariante nº 1 do CLAUDE.md.

O wallhack ficou 20 minutos no ar; **a dessincronização de worldgen ficou os
mesmos 20 minutos e é a mais grave das duas**. Hoje a lâmina mínima nasce
preguiçosa e sob RNG local (`js/grass.js:64-77`), o que está certo e tem caso
de teste. Registro porque a lição escrita no CLAUDE.md fala só do wallhack, e
a próxima pessoa a ler vai subestimar o que um `git add -A` derruba.

### 2.3 · O resto do HEAD: varrido, limpo — mas a ARMADILHA continua armada

Varri as 12 mutações de `scripts/mutation.js` contra o HEAD, arquivo por
arquivo: **10 com o código original intacto**. Duas com alvo ausente, e conferi
as duas na mão — são **evolução legítima do código**, não mutante:

- **M3** (`js/structures.js`): a linha ganhou guardas `if (roof)` / `if (floor)`
  (`:339`, `:352`). A plataforma de telhado está lá.
- **M8** (`server.js`): virou o caminho de crédito de kill com `hitBy` +
  `KILL_CREDIT_WINDOW_MS` (`:929-935`). O anti-cheat está lá, mais forte.

**O que eu acho de verdade preocupante é o mecanismo, e ele está vivo:**

```js
} finally {
  execSync(`git checkout -- ${m.file}`, { cwd: ROOT });   // scripts/mutation.js:90
}
```

`git checkout -- <arquivo>` restaura **do ÍNDICE**, não do HEAD. Se qualquer
`git add` acontecer enquanto o mutante está no disco — que é exatamente o que
aconteceu — o "restaurar" do próprio arnês **devolve o mutante**. A ferramenta
que existe para provar que o teste pega o defeito é a mesma que grava o defeito
quando alguém encosta no índice. `git checkout HEAD -- <arquivo>` fecharia isso
numa palavra. E os dois alvos vencidos fazem `scripts/mutation.js` sair com
status 1 hoje: dois guardas (telhado como plataforma, crédito de kill) estão
sem mutante que prove que o teste os pega.

---

## 3. Critério a critério

### A — Giro e locomoção

| Critério | | Medido |
|---|:-:|---|
| A1 · giro não translada a cabeça | 🟢 | **0,00000 m em 8 casos** (raios 0,71 e 1,4 m × 4 direções). Re-medido de propósito: `xrrig.js` mudou nesta rodada e o pivô na cabeça sobreviveu. |
| A2 · passo é escolha do jogador | 🟢 | Herdado (`xrturn.js` intocado). **E melhorou de alcance**: as cinco linhas de conforto agora aparecem no menu **antes da partida** — `GIRO`, `VELOCIDADE DO GIRO`, `VELOCIDADE`, `VINHETA DE CONFORTO`, `RECENTRAR A VISTA`, lidas por mim na sessão. Configurar conforto deixou de exigir entrar em jogo primeiro. |
| A3 · velocidade humana | 🟢 | Padrão `conforto`: **andar 1,6930 m/s · correr 2,8000** (tetos 2,0 / 4,0). `IGUAL AO PC` alcançável: 5,2000 / 8,6000. |
| A4 · aceleração instantânea | 🔴 | **Inalterado.** `conforto` **52,0 ms** ✔ · `alcance` **51,5 ms** ✔ · **`paridade` 286,3 ms** ✘ (teto 150). Parada idem: 50,1 / 51,6 / **286,2 ms**. Era 281,1 ms na rodada passada — mesmo defeito, mesma ordem de grandeza, e os três perfis continuam a dois cliques no painel. |
| A5 · vinheta some ao parar | 🔴 | **Inalterado.** Receita do §12 (andar 2 s, parar 1,5 s), teto **0,0100**: `conforto` **0,00698** ✔ · `alcance` **0,01144** ✘ · `paridade` **0,01371** ✘. Aos 3 s todos caem para ≤ 0,00030. Reprodução ponto a ponto da rodada passada (0,00702 / 0,01148 / 0,01361). |
| A6 · nada além do pescoço move a vista | 🔴 | **Duas causas vivas, e as DUAS já eram minhas.** Ver §4.1 e §4.2. (a) qualquer salto de pose acima do limiar de 0,35 m desloca a VISTA por **um frame**, do tamanho inteiro do salto — recentrar a 0,55 m do centro: **0,7778 m**; a 1,0 m: **1,4142 m**; morto com 3 m de passo acumulado: **3,0000 m**. (b) o deslocamento PERMANENTE de 2,9981 m **morreu** (líquido 0,0000 m). (c) andar fisicamente contra sólido **congela a vista**: 3,00 m de caminhada real, a vista anda 0,82 m e depois **0,000 m em 2,08 m de caminhada**. |

### B — Mira e empunhadura

| Critério | | Medido |
|---|:-:|---|
| B1 · arma na mão, no `gripSpace` | 🟢 | Herdado. `js/xr/xrweapon.js` e `js/xr/xrhands.js` **não aparecem no diff** `c070737..4c4810b`. |
| B2 · 1:1 sem bob nem sway | 🟢 | Herdado, mesmo motivo. |
| B3 · dá para ver pelo buraco | 🟢 | Herdado, mesmo motivo. |
| B4 · botão de mirar não teleporta | 🟢 | Herdado, mesmo motivo. |
| B5 · segunda mão importa | ⚪ | *"o recuo reduz de forma medível com duas mãos"* continua sem medida. Quinta rodada. |
| B6 · háptico em toda ação | 🟢 | Herdado (`xrtato`, `js/interact.js`, `js/pickups.js` intocados; o trecho do `SFX` em `game.js:401` não está no diff). |
| B7 · o tiro sai do cano | 🔴 | Herdado do vermelho: código intocado desde `98b114f`. Origem a **0,437 m (faca) a 0,910 m (bazuca)** da boca, teto 0,05 m. |

### C — Corpo, altura e escala

| Critério | | Medido |
|---|:-:|---|
| C1 · nunca enterrado | 🟢 | Receita do §12 (quadrado de 2 m a 0,5 m/s, **960 frames**): folga **1,5904 – 1,6087 m**, amplitude 18 mm, janela 1,20–2,10. |
| C2 · o corpo segue a cabeça | 🔴 | **Mesma régua da rodada passada.** Pela receita: separação **máxima 0,0167 m** em 960 frames ✔. Pela cláusula *"≤ 0,10 m **em todos os frames**"*: com `player.dead = true` (estado sem dreno de verdade, `game.js:3341`), 3,00 m de passo físico dão separação **3,0000 m** e colisor **0,0000 m** — sem teto. Ao reviver, escoa e volta a 0,0000 m sem teleporte, que é a metade boa. |
| C3 · altura do aparelho, agachar de verdade | 🟢 | Herdado (`js/xr/xrbody.js` intocado). |
| C4 · escala 1:1 em metros | ⚪ | Não medido. Quinta rodada. |
| C5 · corpo em 1ª pessoa coerente | ⚪ | Não medido. Quinta rodada. |
| C6 · o avatar que os OUTROS veem | 🟢 | Herdado no yaw. A ressalva de C2 permanece: no estado sem dreno a posição do avatar remoto diverge da cabeça sem teto. Não medi em dois clientes. |

### D — Interação com o mundo

| Critério | | Medido |
|---|:-:|---|
| D1 · toda ação alcançável pelo controle | 🔴 | **Duas linhas da lista fechada fecharam nesta rodada, e eu executei as duas pelo caminho do jogador**: **abrir o menu** (entrar em VR abre; e `SAIR DA PARTIDA` volta para ele) e **sair da partida a partir da tela de morte** (mirei `VOLTAR AO MENU` com o raio, puxei o gatilho, caí no menu). Continuam sem mapeamento nenhum: **lançar granada** (`KeyG`), **usar kit médico** (`KeyQ`), **comer** (`KeyF`) e **trocar acessório de mira** (`KeyT`) — quatro. `js/xr/xrinput.js` intocado. |
| D2 · alcance medido da cabeça | 🟢 | Vivo, a separação é 0,0167 m no pior frame da receita, e a interação só existe vivo. `js/interact.js` continua medindo de `player.pos` e continua não custando nada por isso. |
| D3 · pegar é com a EMPUNHADURA, e perto | 🔴 | Herdado: `xrinput.js` e `xrinteract.js` intocados. |
| D4 · affordance dentro do mundo | 🟢 | Herdado (`xrinteract.js` intocado). |
| D5 · veículo sem quebrar cabeça nem chão | 🟢 | Herdado; o rig mudou, mas a mudança (limiar de 0,35 m) só rejeita delta de pose acima de 35 cm, e dentro do carro o passo do cômodo é o mesmo de fora. Não re-isolei o salto de saída — quinta rodada com essa ressalva. |
| D6 · tudo alcançável de posição fixa | ⚪ | Não roteirizado. Quinta rodada. |

### E — Desempenho

| Critério | | Medido |
|---|:-:|---|
| E1 · 72 fps travado no aparelho | ⚪ | A metade daqui continua feita (`session.frameRate` 72). O resto é do aparelho. |
| E2 · orçamento em estéreo | 🔴 | `node scripts/vr-emulado.js`, **duas execuções**: menu **350 / 985 554**, spawn **358–360 / 1 001 884–1 001 900**, cidade **366 / 830 848**, castelo **406–414 / 1 145 780–1 157 476** (calls / triângulos, estéreo, mediana). Tetos 180 / 500 k → **1,9× a 2,3× em calls** e **1,7× a 2,3× em triângulos**. **Queda real e grande**, contra a minha própria medição de `c070737`: triângulos **−38,5 % no spawn** (1,629 M → 1,002 M) e **−32,6 a −33,3 % no castelo** (1,717 M → 1,146–1,157 M); calls −38 no menu, −34 no spawn, −26 na cidade, −16 a −24 no castelo. Ver §4.4 sobre o teto que a rodada usou. |
| E3 · escala de render ≥ 85 % | ⚪ | Aparelho. |
| E4 · lógica de app ≤ 2 ms | ⚪ | Aparelho. |
| E5 · térmica 30 min | ⚪ | Aparelho. |

### F — Boot e ciclo de sessão

| Critério | | Medido |
|---|:-:|---|
| F1 · 4 s até gráfico rastreado | ⚪ | Aparelho, cache frio, N ≥ 7. |
| F2 · foco perdido | 🟢 | Herdado (`xrsession.js` intocado). |
| F3 · recentrar não teleporta nem enterra | 🟢 | Re-medido, porque `xrrig.js` mudou. `dev.recenter()` a **0,7778 m** do centro: jogador deslocado **0,0000 m**; a **1,4142 m**: **0,0000 m**. Folga de C1 preservada (**1,6000 m** antes e depois). Ressalva grave que não reprova F3 e reprova A6: a VISTA pula um frame (§4.1). |
| F4 · sair devolve o desktop intacto | 🟢 | Re-medido no fim do ciclo: `SAIR DO VR` → `presenting false`, `XRUI.aberto false`, **malha `xrUiPainel` fora da cena**, `#overlay` do DOM visível, partida não reiniciada. |
| **F5 · jogável de ponta a ponta sem tirar o aparelho** | **🟢** | **VIROU VERDE.** Ver §4.3 — o ciclo inteiro executado por raio e gatilho, sem um toque em DOM. |

### G — Qualidade de imagem

| Critério | | Medido |
|---|:-:|---|
| G1 · foveação declarada | 🟢 | `renderer.xr.getFoveation()` = **0,2** dentro da sessão. |
| G2 · antialiasing em XR | ⚪ | O IWER não expõe o número de amostras do alvo de render XR. |
| G3 · escala de framebuffer declarada | 🟢 | Herdado (0,9 pelo preset). |
| G4 · texto e mira legíveis | ⚪ | Parte humana obrigatória. |
| G5 · uma captura por entrega | ⚪ | **Nenhuma captura estéreo nova.** Quinta rodada sem — e esta rodada mexeu em duas coisas que se VEEM (o menu novo e o degrau mínimo da grama). |

### H — HUD e UI dentro do mundo

| Critério | | Medido |
|---|:-:|---|
| H1 · nada essencial só no DOM | 🔴 | **De 15 para 16 de 17.** Entrou o **menu principal** (medido em sessão: painel em modo `menu` com `JOGAR SOLO`, `MULTIJOGADOR`, as cinco de conforto e `SAIR DO VR`). Falta **um**: o **minimapa**. |
| H2 · UI não é colada na cara | 🟢 | Herdado; o painel é o mesmo objeto, mesma distância e mesmo tamanho angular. |
| H3 · o retículo não mente | 🟢 | Por ausência declarada, que é a saída que o critério autoriza. |

### I — Ausência de defeito grosseiro

| Critério | | Medido |
|---|:-:|---|
| I1 · vinte minutos, 20 caixas | ⚪ | Exige um humano de headset. **Nenhuma caixa marcada. Sem elas a rodada não está validada**, independente do resto. |
| I2 · zero erro de console | 🟢 | `__game.errors`, `pageErrors` e `consoleErrors` **vazios nas onze sessões imersivas e nas duas fora de XR**. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | ⚪ | Não amostrado. Quarta rodada. |
| I4 · nenhum estado sem saída | ⚪ | **Andou muito e ainda não fecha.** Verifiquei com raio e gatilho, sem DOM: menu → lobby → **volta do lobby pela faixa de abas** → menu → partida → pausa → menu → morte → menu → sair do VR. Faltam do roteiro fechado: nave, queda livre, paraquedas, dirigindo, espectador e fim de partida. E achei um **botão morto** dentro do lobby (§4.5). |

---

## 4. Os defeitos, com a medição que prova

### 4.1 · A6 (a) · O recentrar ainda dá um tranco de um frame — e agora eu sei EXATAMENTE por quê

O jogador não sai do lugar (F3 verde). A vista sai, por um frame. Trilha
quadro a quadro, com o headset a 0,55 m em cada eixo:

| Frame | cabeça no MUNDO | colisor |
|---|---|---|
| antes | (0,0000 · 4,0236) | (0,0000 · 4,0236) |
| f1 | (0,0000 · 4,0236) | (0,0000 · 4,0236) |
| **f2** | **(−0,5500 · 3,4736)** | (0,0000 · 4,0236) |
| f3 …fim | (0,0000 · 4,0236) | (0,0000 · 4,0236) |

Deslocamento no f2: **0,7778 m**. A 1,0 m de offset: **1,4142 m**. Morto com
3,00 m de passo acumulado: **3,0000 m**. Líquido, nos três: **0,0000 m**.

**A causa não é mais suposição — é um degrau medido.** Saltei a pose em um
frame, em seis tamanhos, e li a vista quadro a quadro:

| salto de pose num frame | maior salto da VISTA | líquido da vista | líquido do jogador |
|--:|--:|--:|--:|
| 0,10 m | 0,10 | **0,10** | 0,10 |
| 0,30 m | 0,30 | **0,30** | 0,30 |
| 0,34 m | 0,34 | **0,34** | 0,34 |
| **0,36 m** | **0,36** | **0,00** | 0,00 |
| 0,50 m | 0,50 | **0,00** | 0,00 |
| 1,00 m | 1,00 | **0,00** | 0,00 |

A fronteira cai **exatamente** no `PASSO_HUMANO_MAX = 0.35`. Abaixo dele o
acumulado absorve o delta e a vista fica onde tem que ficar. Acima dele o
delta é **rejeitado do acumulado** — e a vista fica deslocada do tamanho
inteiro do salto por um frame, porque o rig daquele frame foi calculado com a
pose ANTIGA.

**E o motivo de o rig usar a pose antiga é de ORDEM DE RENDER, não de evento.**
`place()` lê `camera.position` (`js/xr/xrrig.js:107`). Quem escreve esse vetor
é `xr.updateCamera(camera)`, chamado **dentro de `WebGLRenderer.render()`**
(three r185, `three.module.js:17637`) — ou seja, **depois** do `tick` do jogo.
O que o three atualiza **antes** de chamar o callback do jogo é o `cameraXR`
(`:14840-14870`), e o `frame` que ele passa como 2º argumento —
`renderer.setAnimationLoop(() => tick())` (`game.js:3200`) **descarta os dois**.

Consequência prática: **o rig é posicionado, todo frame, para a pose do frame
anterior.** Andando, isso é 2 cm e ninguém vê. Num recentrar, num piso
redefinido ou numa perda de rastreio, é o offset inteiro, e o jogador leva um
soco de 0,78 a 3,00 m.

O limiar consertou o que ele prometia consertar — o **acumulado** e, com ele,
o deslocamento permanente de 2,9981 m que eu tinha medido. Ele **não** conserta
o tranco, e não podia: o problema é a pose que `place()` lê, não a decisão que
`place()` toma. O conserto independente de ordem é ler a pose do frame ATUAL —
`renderer.xr.getFrame()` / `frame.getViewerPose(referenceSpace)`, ou o
`renderer.xr.getCamera()`, que o three atualiza **antes** do callback.

**Ressalva honesta:** medido no IWER. No aparelho a latência pode ser outra —
mas a ordem `tick` → `render` → `updateCamera` é do three, não do runtime, e
essa parte vale igual nos dois.

### 4.2 · A6 (c) · A parede congela a vista — reproduzido, com o número

Terceira rodada que este defeito aparece; a primeira em que eu o reproduzo
neste commit. Jogador plantado 1,2 m à frente da face de um sólido de 11 × 10 m,
andando **3,00 m fisicamente** no cômodo, em degraus de 2 cm:

| dev.position.x | vista (mundo) | colisor |
|--:|--:|--:|
| 0,02 | −380,68 | −380,70 |
| 0,32 | −380,38 | −380,42 |
| 0,62 | −380,08 | −380,12 |
| **0,92** | **−379,88** | −379,92 |
| 1,22 … 2,72 | **−379,88** | −379,92 |

**A vista andou 0,82 m dos 3,00 m que o jogador andou. Os últimos 2,08 m de
caminhada real produzem deslocamento ZERO na vista.** O colisor parar está
certo — a parede existe. A vista parar é a coisa que o Oculus BP proíbe com
todas as letras (*"The display should respond to the user's movements at all
times, without exception"*) e o que VRC.Quest.Functional.5 cobra como
obrigatório. É também o defeito que mais rápido enjoa: o corpo diz que andou
2 m, o olho diz que não saiu do lugar.

### 4.3 · F5 · O ciclo inteiro, executado por mim, sem tirar o aparelho

Sonda com `bootEmVR(..., { emJogo: false })` — **sem `forceStart`, sem fiação
de teste, com o `conectarMenu` do próprio `game.js`**. Tudo acionado com o raio
da mão direita e o gatilho do Touch:

| passo | o que medi |
|---|---|
| entrar em VR | painel abre em modo **`menu`**, `started false`, `paused true`, aba `pausa`, linhas `JOGAR SOLO · MULTIJOGADOR · GIRO · VELOCIDADE DO GIRO · VELOCIDADE · VINHETA DE CONFORTO · RECENTRAR A VISTA · SAIR DO VR` |
| MULTIJOGADOR | aba vira **`sala`** (o lobby que já existia), `started` continua false |
| voltar do lobby | mirei a **faixa de abas** (`aba:pausa`), gatilho → `ultimoAcionado: 'aba:pausa'`, linhas do menu de volta |
| clique do analógico | **não fecha** o menu principal (`modo menu`, `aberto true`) — o beco que a rodada veio fechar |
| JOGAR SOLO | `started true`, `paused false`, painel **fechado** |
| pausa → SAIR DA PARTIDA | volta ao modo **`menu`**, `started false`; e os rótulos mudam certo: `JOGAR SOLO / FORA DA SALA` e `VOLTAR PRA SALA` |
| morrer | modo **`morte`**, uma linha só: `VOLTAR AO MENU` (sem `JOGAR DE NOVO`, porque a partida é online — a regra do botão morto respeitada) |
| VOLTAR AO MENU | modo **`menu`**, `started false` |
| SAIR DO VR | `presenting false`, `aberto false`, malha `xrUiPainel` **fora da cena**, `#overlay` visível, partida não reiniciada |

Zero erro de console em todo o ciclo. **Nenhum beco, nenhuma tela que só o
mouse resolve.** F5 é verde.

Verifiquei também o que acontece **se a sessão cair com o menu aberto**: o
`end` da sessão dispara `aoTerminar` (`js/xr/xrsession.js:49`) → `onExit`
(`game.js:424`) → `XRUI.exit()`, que zera `aberto`, tira o painel da cena e
anula a malha. Ao voltar para VR, `!state.started && !XRUI.aberto` reabre o
menu. Não há estado preso.

### 4.4 · E2 · O teto foi alcançado — mas contra uma régua que não é a do critério

Isto não é implicância: é a lição de método do repo aplicada ao meu próprio
lado da mesa. O commit diz *"grama cabe em 500 k"*, e cabe — **contra o teto
que o `docs/vr/perf-xr.md` usa, que é 500 k triângulos POR OLHO**
(`perf-xr.md:50`). O `criterio-aaa.md` compara contra outro número: a tabela
de linha de base do §1 põe *"Triângulos **em estéreo**: 1,46 M – 2,03 M"* na
mesma linha que *"≤ 500 k"*, e E2 manda medir com `npm run vr:emulado`, que
reporta **estéreo**.

As duas leituras, com as duas condições declaradas:

| pose | perf-xr diz (por olho) | eu, condição do perf-xr¹ | eu, receita do E2² (por olho) | eu, receita do E2 (estéreo) |
|---|--:|--:|--:|--:|
| spawn | 462 129 | **439 524** | **500 950** | 1 001 900 |
| cidade | 350 308 | **371 850** | **415 424** | 830 848 |
| castelo | 457 049 | **499 237** | **572 890 · 578 738** | 1 145 780 · 1 157 476 |

¹ sessão imersiva, mundo congelado (`setTimeScale(0)`), sombra desligada, jogador plantado na pose, 24 amostras.
² `node scripts/vr-emulado.js --port=348x --seconds=12`, duas execuções, mundo vivo, load 1,29 no início da segunda.

Três leituras, e as três importam:

1. **A queda é real e é a maior desta frente inteira.** −38,5 % de triângulo no
   spawn e −32,6 a −33,3 % no castelo, medidos pela receita do critério, contra
   a minha própria medição de `c070737`. Nenhuma rodada anterior chegou perto.
2. **Pela receita do E2, a pose de castelo não cabe nem por olho:** 572 890 e
   578 738 contra 500 000 — **15 % acima**, reprodutível em duas execuções.
3. **Pela condição do perf-xr, o castelo cabe por 763 triângulos** (499 237 de
   500 000, folga de 0,15 %). O próprio documento chamou de "não caber" uma
   folga de 559 triângulos, duas seções antes: *"cabia por 0,1 %, o que não é
   caber"*. A régua aplicada à tentativa anterior devia valer para esta.

E draw call não se moveu de patamar: **350 a 414 estéreo contra teto de 180**
(175 a 207 por olho, contra 180 por olho). **E2 reprova nas duas leituras.**

### 4.5 · Botão morto dentro do menu novo — e é a regra que o próprio módulo escreveu

O cabeçalho de `js/xr/xrmenu.js`, item 4, é literal: *"NENHUM BOTÃO MORTO.
Regra desta base, paga caro… Botão que recusa é pior que botão ausente."* A
regra foi aplicada às linhas do menu (sem sala, `MULTIJOGADOR` vira nota
apagada que o raio não marca). **Não foi aplicada à aba para onde o menu
agora leva.**

Medido, em modo `menu`, com o jogo **não iniciado**, duas ações de raio a
partir da primeira tela que o jogador de headset vê:

| | |
|---|---|
| Caminho | `MULTIJOGADOR` → aba `SALA` |
| O que a aba mostra | `SALA · 1 AQUI` · `SALA SEM ANFITRIÃO` · `Recruta947` · **`SAIR DA PARTIDA`** |
| O raio marca? | **sim** — `item: { id: 'sair', zona: 'social' }` (não é nota) |
| O gatilho aciona? | **sim** — `ultimoAcionado: 'sair'` |
| O que acontece | **nada.** `modo` menu, `aba` sala, `started` false, `paused` true, jogador no mesmo lugar |

`js/xr/xrsocial.js:394-397` empurra a linha `SAIR DA PARTIDA` na aba `sala`
**sem condição nenhuma**, e `game.js:2912` a liga em `voltarAoMenu()` — que,
sem partida em andamento, roda `resetarPartida()` e devolve o jogador ao mesmo
menu. É um botão que promete sair de uma partida que não existe, e o jogador
o encontra em **dois cliques** a partir do menu principal.

Não é grave em consequência (nenhum erro, nenhum estado preso), e é grave em
princípio: é exatamente a classe de defeito que esta rodada foi escrita para
eliminar, um degrau abaixo de onde ela olhou. Conserto do tamanho da causa:
`sair` só entra na lista quando há partida (o mesmo `souAnfitriao()` que já
gateia `COMEÇAR PARTIDA`, com outro predicado), ou vira nota.

### 4.6 · O corte de chunk no DESKTOP: não custa um pixel, e paga

Fui atrás da regressão de PC porque o corte vale para o monitor também. A/B de
framebuffer, mono, 800 × 600, mesma câmera, mundo congelado, sombra desligada:

| pose | chunks pulados | draw calls | triângulos | **pixels diferentes** | maior Δ |
|---|--:|--:|--:|--:|--:|
| spawn | 20 | 174 → **164** | 623 469 → **583 269** | **0 / 480 000** | 0 |
| cidade | 20 | 178 → **168** | 511 865 → **471 665** | **0 / 480 000** | 0 |
| castelo | 20 | 195 → **185** | 654 289 → **614 089** | **0 / 480 000** | 0 |

**Zero pixel, −10 draw calls e −40 200 triângulos por pose, de graça, no
monitor.** O corte é medido contra o QUADRADO do chunk (a raiz mais próxima
possível) enquanto o shader mede em 3D — então ele sempre erra para o lado de
desenhar demais, nunca de esconder grama. E `onAfterRender` devolve
`mesh.count = 1005` fora do desenho, que é o que o vigia anti-trapaça do
`scripts/soak.js` lê. Não achei regressão de PC.

O que **não** se salva pelo corte e vale registrar: o `WebGLShadowMap` do three
não chama `onBeforeRender`, então a grama entra inteira nos mapas de sombra. É
economia que não aconteceu, não é defeito.

---

## 5. O que EU tinha reprovado e está resolvido, com o número

| Defeito da rodada passada | Estado | Medido agora |
|---|---|---|
| §3.3 rebasear zera o acumulado → vista 2,9981 m fora do lugar PARA SEMPRE | **RESOLVIDO** | Morto com 3,00 m de passo: deslocamento líquido da vista **0,0000 m**. A linha `passoX = 0; passoZ = 0;` saiu. |
| §3.2 o recentrar teleporta a VISTA por um frame | **NÃO RESOLVIDO** | 0,7778 / 1,4142 / 3,0000 m, ver §4.1. A correção atacou o acumulado; o tranco é da ordem de render. |
| F5 · entrar em VR força `startGame` e não há caminho de volta | **RESOLVIDO** | Ciclo inteiro executado por raio e gatilho, §4.3. |
| A carência de frames defende a ordem errada | **RESOLVIDO como diagnóstico** | O limiar físico não depende de ordem — confirmei a fronteira em 0,35 m, nos dois lados (§4.1). O `REBASE_FRAMES` continua no arquivo e agora é redundante. |
| §3.3 (`3cc8eea`) andar contra sólido congela a vista | **NÃO TOCADO** | Reproduzido: 2,08 m de caminhada real com 0,000 m de vista (§4.2). |

Duas de cinco fechadas, mais o diagnóstico. E as **duas que sobraram são as
duas que eu já tinha apontado** — é a primeira rodada em que nenhuma causa de
A6 é nova.

---

## 6. Testes que não podem falhar

Auditei `xr-menu` (novo, 527 linhas), `xr-quality` (cresceu 795 linhas),
`xr-social` (intocado) e os dois que a rodada consertou.

**Primeiro o que está certo, porque é a maior parte.**
`test/xr-quality.test.js:399` (*"o corte do que não pinta pixel não muda UM
pixel — e pula chunk de verdade"*) é o melhor caso que esta frente escreveu:
ele **calibra três vezes** antes de afirmar (`pulados > 0`, `semTris − comTris
> 0`, e a contagem de lâmina fora do desenho tem que continuar 1005), então
não pode passar por acidente. `:462` cobra que o degrau mínimo esteja mesmo
presente na configuração medida — sem isso o guarda de wallhack cobriria o
degrau errado. `:340` mede que criar a lâmina mínima gasta **0** sorteios do
`Math.random` compartilhado, e o comentário registra que a primeira versão do
caso falhou por ruído e foi refeita. Isso é medir, não afirmar.

E os dois consertos de `f755cfd` são reais:
`test/xr-bootstrap.test.js` passava por acidente (o salto de 8 m da sentinela
virava passo físico que cancelava a compensação) e hoje cobra **cabeça sobre os
pés**; `test/xr-entrar-joga.test.js` cobrava o defeito removido e hoje cobra
`aberto === true` e `modo === 'menu'`. Este segundo **cobre a linha do
produto** (`game.js:3267`), e eu estava errado ao supor que não cobria.

O que achei, em ordem de gravidade:

1. **`test/xr-menu.test.js` · a fiação de PRODUÇÃO não é executada por teste
   nenhum.** O arquivo chama `G.XRUI.conectarMenu({...})` com `ler` e `acoes`
   **próprios** — e `conectarMenu` **substitui** os do `game.js` (`men.conectar(cfg)`,
   `xrui.js:251`). As três ações reais de `game.js:2937-2945` —
   `entrarEmSolo(); MENU.close(); startGame(false)`, `if (emSolo()) voltarParaSala()`
   e `XR.exit()` — **não são exercidas em lugar nenhum**. Um `grep conectarMenu`
   no repo devolve o teste e o `game.js`, e mais nada. Elas funcionam (eu medi,
   §4.3), mas quem prova isso sou eu, não a suíte. É o mesmo padrão do
   `acionarPorId` que apontei na rodada passada, um degrau acima.

2. **`test/xr-quality.test.js:325` · o guarda de wallhack tem uma porta de
   60 %.** A asserção é `vr <= desk * 1.5 + 10`. Com `desk = 94`, a barra
   está em **151 pixels** — uma configuração que deixasse o adversário deitado
   **60 % mais visível** passaria verde. O valor medido (92) está muito dentro,
   e o teste é bom no resto (calibra que a sonda enxerga o alvo e que não
   saturou). Mas o número que ele cobra não é o número que a regra dura do
   `js/grass.js` promete (*"quantidade, altura e alcance idênticos"*): para uma
   regra de anti-trapaça, 1,5× + 10 é folga demais.

3. **`test/xr-menu.test.js` · o estado de antes da partida é alcançado por
   atalho.** O `before()` boota com `bootEmVR` no padrão (`emJogo: true`, que
   chama `forceStart`) e volta ao menu com `voltarAoMenu(); XRUI.abrir('menu')`
   no mesmo turno. O helper `bootEmVR` documenta `emJogo: false` como o caminho
   de quem quer medir o menu — e **`grep emJogo test/*.js` não devolve uma
   linha**: nenhum teste do repo usa. A minha sonda usa, e é por isso que ela
   viu coisas que a suíte não vê (o §4.5, por exemplo).

4. **Nada, em nenhum arquivo, aciona o botão `SAIR DA PARTIDA` da aba `sala`
   com o jogo NÃO iniciado.** `test/xr-social.test.js:633` cobre `COMEÇAR
   PARTIDA` (que só existe para o anfitrião) e o arquivo inteiro roda em jogo.
   O estado que o menu novo criou — lobby aberto **antes** da partida — não tem
   um caso.

5. **`xr-quality.test.js:83/91/100/105/119`** continuam sendo guardas de
   constante (comparam o plano com números do próprio repo). Travam decisão, o
   que tem valor; não pegam defeito.

6. **`test/xr-social.test.js` está intocado e continua sendo a referência
   desta frente** — calibra antes de afirmar, lê o efeito por um caminho
   independente do que aciona (`estadoUi().ultimoAcionado` contra `soc.aba`), e
   `:684` prova a ida e a volta da aba com raio e gatilho de verdade. Foi ele
   que me deu a receita para fechar o I4 do lobby.

---

## 7. Interação entre frentes — o que procurei e o que achei

| Suspeita | Medido |
|---|---|
| O degrau mínimo da grama quebra o contrato do `Math.random` seedado | **Não quebra.** A lâmina nasce preguiçosa e sob RNG local (`js/grass.js:64-77`); há caso cobrando **0 sorteios**. Era um defeito real em `aa72ded` (§2.2) e está fechado. |
| O corte de chunk muda a tela no desktop | **0 pixels de 480 000** em três poses (§4.6). |
| O corte de chunk vaza para a contagem de lâmina (vigia do soak) | **Não vaza.** `onAfterRender` devolve 1005; há caso cobrando. |
| O preset da grama vaza para o monitor ao sair da sessão | Há caso saindo da sessão de verdade e lendo o LOD depois (`xr-quality:846`); `GRASS_LOD_RING_FAR` é **apagado** do CFG, não sobrescrito com `undefined`. Não re-medi à mão. |
| O menu novo custa draw call | **Zero.** É um MODO do painel que já existia, sem `Object3D` novo — e sem `Object3D` não há 4 sorteios de UUID no fluxo seedado. Há caso cobrando os dois. |
| O menu novo come o clique da pausa / do lobby | **Não come.** As linhas do menu se declaram (`dono: 'menu'`) e só elas passam pelo ramo novo de `acionar()`; `retomar` cai no tratador antigo de propósito. |
| Abrir o menu com o PLACAR na frente esconderia SOLO | **Tratado**: `abrir('menu')` seleciona a aba `pausa` **só na abertura** (`xrui.js:587`), e depois a escolha é do jogador — que é como `MULTIJOGADOR` consegue levar até o lobby. |
| A sessão cair com o menu aberto deixa painel preso | **Não deixa.** `end` → `onExit` → `XRUI.exit()`: malha fora da cena, `aberto` false, e ao voltar o menu reabre (§4.3). |
| O limiar de 0,35 m quebra o passo físico legítimo | **Não quebra.** Passo de **1,4420 m** em degraus de 2 cm: colisor andou **1,4420 m**, separação 0,0000. A fronteira está em 0,35 e o degrau abaixo dela absorve tudo (§4.1). |
| O limiar depende de ordem de entrega | **Não depende** — é o que a tabela de 6 saltos prova. O que depende de ordem é o que sobrou (a pose que `place()` lê). |
| Regressão de PC pelo LOD de lâmina | **Não existe**: o LOD é preset de sessão, o desktop não tem o segundo anel (a chave nem existe no `js/config.js`), e o corte de chunk não muda pixel. |

---

## 8. Os três critérios mais longe do aceite

1. **E2 · orçamento de submissão em estéreo.** 350–414 draw calls contra 180;
   0,83–1,16 M triângulos estéreo contra 500 k. É o único item que continua a
   um fator ~2× nas duas grandezas, e é o único cuja correção não cabe em
   ajuste. Esta rodada tirou **um terço dos triângulos** — a maior alavanca já
   puxada — e ainda falta metade. E a discussão do teto (§4.4) precisa ser
   resolvida antes da próxima medição, senão as duas frentes vão continuar
   medindo coisas diferentes com o mesmo número.
2. **B7 · o tiro sai do cano.** 0,437 m (faca) a 0,910 m (bazuca) contra teto
   de 0,05 m — **9× a 18×**. É o maior fator de todos os vermelhos, está
   intocado há cinco rodadas, e não é só cosmético: o anti-cheat do servidor
   valida **range** a partir dessa origem (`test/security-regression.test.js`).
3. **A6 · nada além do pescoço move a vista.** Quinta rodada, e a primeira em
   que as causas **não são novas**: as duas que sobraram são as duas que eu já
   tinha escrito. Uma delas (a parede) está aberta desde `3cc8eea` sem
   ninguém encostar. A outra tem endereço, mecanismo e conserto medidos (§4.1).

Menção obrigatória, porque não mudou e o dono vai sentir: **A4 e A5** continuam
vermelhos exatamente nos mesmos números, e continuam morando no perfil que o
jogador precisa escolher para fugir do gás.

---

## 9. O que ficou NÃO MEDIDO (e por quê)

- **E1 (tempo), E3, E4, E5, F1** — só existem no aparelho. Não rodei o passo 4.
- **I1 (as 20 caixas), G4** — exigem um humano de headset. **Sem as 20 caixas a
  rodada não está validada**, mesmo com tudo o mais verde.
- **G5** — nenhuma captura estéreo gerada. **Quinta rodada sem**, e a segunda
  seguida que mexe no que se VÊ.
- **C4 (escala em metros), C5 (corpo em 1ª pessoa), D6, I3** — cabiam e ficaram
  de fora por orçamento de sessão. Quinta rodada para C4/C5/D6.
- **B5 segunda metade** (recuo reduz com duas mãos) — continua sem medida.
- **G2 (4× MSAA no alvo XR)** — o IWER não expõe o framebuffer real.
- **I4** — parcial: cinco dos dez estados do roteiro fechado. Faltam nave,
  queda, paraquedas, dirigindo, espectador e fim de partida.
- **B1/B2/B3/B4, B6, C3, C6, D3, D4, D5, F2, G3, H2, H3, A2** — não re-medidos:
  os módulos (`xrweapon`, `xrhands`, `xrbody`, `xrinteract`, `xrinput`,
  `xrturn`, `xrcomfort`, `xrsession`, `xrsocial`, `xrhud`, `xrlocomotion`,
  `interact.js`) **não aparecem no diff** `c070737..4c4810b`. Está escrito em
  cada linha.
- **`npm test`** — proibido. `npm run lint` limpo, rodado.

---

## 10. Se o dono puser o headset agora, o que ele reclama primeiro

1. **"Agora tem menu."** — e não é reclamação, é a notícia. Ele entra em VR e
   está **no menu**, não numa partida forçada. Escolhe SOLO, entra no lobby
   pelo MULTIJOGADOR, ajusta giro/velocidade/vinheta ANTES de jogar, sai da
   partida de volta ao menu, e sai do VR pela linha `SAIR DO VR`. O ciclo
   inteiro, sem tirar o aparelho. Era a queixa nº 1 há três rodadas.
2. **"Encostei na parede e o mundo parou."** — andando fisicamente contra
   qualquer sólido, a vista trava depois de 0,82 m e os **2,08 m seguintes de
   caminhada real não movem a vista**. É o defeito que mais rápido enjoa, é o
   terceiro relatório dele, e ninguém encostou.
3. **"O mundo deu um tranco."** — no primeiro gesto de quem põe o aparelho: o
   recentrar do sistema. A vista pula **0,78 m** (a 0,55 m do centro), **1,41 m**
   (a 1,0 m) e **3,00 m** se ele estiver morto depois de ter andado pelo quarto.
   Um frame, e volta. Ele **não é mais deslocado de vez** — essa metade morreu.
4. **"Esse botão não faz nada."** — dois cliques a partir da primeira tela:
   MULTIJOGADOR → aba SALA → **`SAIR DA PARTIDA`**, sem partida nenhuma. O raio
   marca, o gatilho aciona, nada acontece.
5. **"Continua tremendo."** — 350 a 414 draw calls e 0,83 a 1,16 M triângulos
   estéreo. Melhorou um terço em triângulo; o teto continua a 2× de distância.
6. **"Por que o analógico demora a pegar, e a vinheta a abrir?"** — só em
   `ALCANCE` e `IGUAL AO PC`, que é justamente o que ele vai escolher para
   fugir do gás: **286 ms** até 95 % da velocidade (teto 150) e vinheta em
   **0,0114 / 0,0137** 1,5 s depois de parar (teto 0,0100).
7. **"A grama continua escondendo direito."** — e essa é boa: **92 pixels** de
   um corpo deitado passam pela grama do headset contra **94** no monitor. O
   degrau mais agressivo esconde **mais**.

O que ele **não** vai reclamar: **o monitor está intacto** (0 pixel mudado pelo
corte de chunk, e ainda ganhou −10 draw calls e −40 200 triângulos de graça),
**o mundo não anda quando ele recentra**, **ele conversa, vê o placar, entra na
sala e agora escolhe o modo sem tirar o aparelho**, e **o boneco não fica
enterrado** (folga 1,5904–1,6087 m em 960 frames).

---

## 11. Quanto falta para "ausência de defeito"

**O denominador honesto continua sendo 39, não 47.** Oito critérios não podem
ser certificados deste assento em nenhuma rodada: E1 (tempo), E3, E4, E5 e F1
exigem o aparelho; I1, G4 e G5 exigem um humano de headset. Dos 39,
**23 estão verdes (59 %)**, 9 vermelhos e **7 mediveis que eu ainda não medi**
(B5, C4, C5, D6, G2, I3, I4).

| Rodada | 🟢 | 🔴 | defeitos NOVOS introduzidos | quantos nasceram de uma correção |
|---|--:|--:|--:|--:|
| `98b114f` | 14 | 19 | — | — |
| `bbe6b48` | 19 | 14 | 5 | ? |
| `3cc8eea` | 22 | 10 | 3 | 2 |
| `c070737` | 22 | 10 | 2 | 2 |
| **`4c4810b`** | **23** | **9** | **1** | **1** |

O defeito novo é o botão morto do lobby (§4.5), e ele nasceu de uma correção —
o menu levar ao lobby criou um estado (lobby antes da partida) em que uma linha
antiga deixou de fazer sentido. Cinco rodadas, cinco vezes o mesmo padrão. Mas
a taxa caiu 5 → 3 → 2 → **1**, e o defeito desta é o mais barato de todos os
que já apareceram.

**Do que ainda falta, por natureza do trabalho:**

- **Dois vermelhos são uma linha cada, e as duas estão medidas com endereço.**
  **A6 (a)**: `place()` lê `camera.position`, que o three só escreve dentro do
  `render()` — o rig é posicionado, todo frame, para a pose do frame anterior.
  Ler a pose do frame atual (`renderer.xr.getFrame()` /
  `frame.getViewerPose(...)`, ou o `renderer.xr.getCamera()`, que o three
  atualiza **antes** do callback) mata o tranco sem depender de ordem nenhuma.
  **§4.5**: `js/xr/xrsocial.js:394` empurra `SAIR DA PARTIDA` na aba `sala` sem
  condição — basta a mesma cerca que `COMEÇAR PARTIDA` já tem.
- **Um vermelho é um teto de física que ninguém escreveu.** **A6 (c)**: quando
  o colisor bate na parede, o passo físico não entregue tem que ir para algum
  lugar que **não** seja "a vista para". As três saídas conhecidas do gênero
  (fade para preto, empurrar o rig junto com uma vinheta, ou deixar a cabeça
  atravessar e desenhar o "fora do mundo") são decisão de produto, não conserto.
- **Dois vermelhos são desenho que ainda não foi feito.** `D3` (verbo de
  agarrar no grip) e metade de `D1` (quatro verbos sem botão num Touch que
  acabou — é decidir um menu radial ou um gesto).
- **`B7` é uma conta de geometria** que ninguém fez em cinco rodadas, e que
  encosta no anti-cheat do servidor.
- **`A4` + `A5` são a mesma decisão**, escrita na rodada passada e não tomada:
  quantizar a velocidade também no perfil rápido e escalar a vinheta pela razão
  velocidade/corrida em vez do valor absoluto.
- **`H1` é UMA tela** — o minimapa, 16 de 17.
- **`C2` continua sendo uma decisão, não um conserto.** Ou o critério ganha a
  cláusula "nos estados em que o colisor pode seguir", ou o jogo aceita mover o
  corpo do morto. Reprovar sem dizer isso seria esconder que a alternativa é
  pior.
- **`E2` continua sendo o único que não sabemos se cabe** — e agora com uma
  pendência a mais, que é acertar **qual** teto está sendo cobrado (§4.4).

**E o dado que mais importa, que não é percentual:** esta é a primeira rodada
em que **nenhuma causa de A6 é nova**. Nas quatro anteriores, cada passagem
descobria um mecanismo diferente empurrando a câmera; nesta, os dois que
sobraram são os dois que já estavam escritos, com número, no documento
anterior. O modelo do sistema fechou. O que separa esta frente de "ausência de
defeito" deixou de ser "descobrir o que está errado" e passou a ser **fazer o
que já está escrito**: uma leitura de pose, uma cerca de botão, um teto de
física, uma conta de cano e uma tela de minimapa.

**Resumo em uma frase:** 23 de 39, o primeiro verde de F5 da história desta
frente, a grama um terço mais barata sem abrir um pixel de wallhack e sem tocar
no monitor — e nove vermelhos dos quais **cinco já têm o conserto escrito com
endereço de arquivo e linha**.

---

## 12. A régua está sendo editada enquanto eu meço — e isso precisa ficar escrito

Durante a minha janela, outra frente alterou **`docs/vr/criterio-aaa.md`** na
árvore de trabalho (mtime 22:32; eu tinha lido às 22:12), junto com
`js/xr/xrcomfort.js` e um `test/xr-conforto.test.js` novo. **Nada disso está em
`4c4810b`**, então **A4 e A5 continuam vermelhos NESTA rodada**, medidos contra
o critério que este commit carrega — que eu conferi por `git show
4c4810b:docs/vr/criterio-aaa.md` e não tem uma linha do que foi proposto.

Registro o conteúdo porque ele é sério e porque a próxima rodada vai ser
cobrada por ele:

- **A4 ganharia uma exceção declarada para o perfil `paridade`.** O argumento
  é bom e não é de conforto: headset e monitor jogam a MESMA partida, e rampa
  instantânea com a velocidade do PC deixaria quem está de headset
  estritamente melhor no duelo de canto. Vem com três amarras (só perfil
  opt-in, só com paridade bit a bit com o PC, escrita em código em `EXCECOES`
  com teste que reprova exceção não declarada) e com o custo assumido por
  escrito (t95 ≈ 273 ms). **Como validador, a minha posição:** a exceção é
  legítima *desde que* a terceira amarra seja verdade — que exista um caso
  reprovando um perfil rápido SEM exceção declarada — e desde que a mudança
  do critério venha assinada pelo dono, não pela frente que ela desbloqueia.
  Critério que a implementação reescreve para si mesma deixa de ser critério.
- **A5 seria fechado pela raiz** (a vinheta chegando a zero exato em ≤ 1 s do
  túnel cheio, independentemente do pico), com caso cobrando `=== 0` também ao
  parar de GIRAR — que é o resíduo de 0,01805 que eu medi em `c070737` e que a
  receita do §12 não cobre. **Isso não é mudar a régua, é consertar o
  defeito**, e é o caminho certo: A5 volta a ser uma medida do jogo e não uma
  função do perfil de velocidade.

A diferença entre os dois é toda: **A5 propõe consertar o produto; A4 propõe
mudar o critério.** O primeiro eu meço na próxima rodada. O segundo eu só meço
depois que o dono do projeto disser que a régua é essa — e, se disser, o
critério A4 tem que passar a exigir a PROVA da paridade (escala 1 e os quatro
números do PC bit a bit), senão a exceção vira porta.

---

*Reprodução: cópia isolada por `git archive 4c4810b`, `node scripts/vr-emulado.js
--port=3480|3487 --seconds=12`, e sondas em `test/helpers/iwer.js` → `bootEmVR`
nas portas 3481–3489. Nenhum arquivo do repo foi alterado além deste.*
