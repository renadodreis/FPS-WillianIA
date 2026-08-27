# Validação do porte VR — commit `2d55610`

Sétima rodada. Autor: o **validador**. Procedimento: §12 de `criterio-aaa.md`,
reexecutado inteiro.

**Condição declarada** (sem isso não é medida): cópia isolada do commit via
`git archive 2d55610`, md5 conferido arquivo a arquivo contra `git show` (13 de
13 idênticos); máquina ociosa, `load average` de 1 min entre **0,39 e 0,76**
durante todas as sondas (teto do §12: 1,5), 12 núcleos; Chrome com GPU real;
IWER 2.3.0 preset Meta Quest 3; seed 424242; sessão `immersive-vr` real via
`test/helpers/iwer.js` → `bootEmVR`; **portas 3560–3569**, nenhuma outra, nunca
a 3000. **Vinte sessões imersivas.** `npm test` não foi executado (a suíte já
tinha rodado verde antes da rodada); `npm run lint` limpo na cópia isolada.

**Higiene, declarada porque afeta a medida:** ao começar, a máquina estava com
`load 1,76` por causa de um **Chrome do puppeteer órfão havia 3 h 38 min**
(perfil `/tmp/puppeteer_dev_chrome_profile-*`, pai reparentado para o `systemd
--user`, ~80 % de CPU somando renderer e GPU). Encerrei **por PID exato**, não
por padrão amplo, e o load caiu para 0,65 em 20 s. Nenhuma medida deste laudo
foi tomada antes disso. É a lição do repo aplicada de véspera: triagem sob carga
não é triagem.

**Placar: 26 verdes · 7 vermelhos · 6 não medidos, em 39.**
Progressão de verdes: 14 → 19 → 22 → 22 → 23 → 25 → **26**.

**Sobre o denominador.** Os 47 critérios contêm **8 que nenhuma máquina fecha**
(E1, E3, E4, E5, F1, G4, I1 e a metade humana de G5): dependem do aparelho ou de
um humano de headset. Cobrar 47 esconde que oito deles nunca estiveram ao meu
alcance. O denominador honesto do que **eu posso** validar é **39**, e é nele
que este laudo pontua. Os 8 continuam listados, marcados `aguardando aparelho`
ou `aguardando humano`.

---

## 0. Como estas medidas foram feitas (e três instrumentos que mentiram no caminho)

Escrevo isto primeiro porque três vezes nesta rodada eu quase publiquei número
errado, e as três causas são reaproveitáveis:

1. **O spread não é `gun.spread`.** É
   `lerp(gun.spreadHip, gun.spreadAds, adsT) + vel·6e-4 + (no ar ? 0,012)`
   (`game.js:2389`). Zerar `gun.spread` — que é o que a sonda óbvia faz, e o que
   `test/xr-mira.test.js:47` faz — **não zera nada**. Minha primeira medição de
   B3 acusou 0,29 m de erro a 10 m que era dispersão, não desalinhamento.
2. **`__BR_melee` e o `__BR_shotMiss` da bazuca são chamados ANTES de
   `marcarTiroQA`.** Lendo `miraDoTiro()` dentro desses ganchos vem o registro
   do tiro **anterior**. Minha segunda medição atribuiu à faca um erro de 1,6 m
   que era do fuzil de antes.
3. **`place()` descarta delta maior que `PASSO_HUMANO_MAX` (0,35 m) como falha
   de rastreio.** Mover `dev.position` de 0 para 1,2 m num frame não é passo
   nenhum: minhas duas primeiras buscas por parede não acharam parede porque o
   passo era grande demais para existir.

E uma quarta, que é a do próprio repo e voltou a morder: **`groundAt(x, z, 999)`
devolve o TETO, não o piso.** Plantei o jogador em cima da parede que queria
testar. O uso canônico é `groundAt(x, z, curY)`.

O que sobrou, e é o que vale: para B3 o raio balístico é **reconstruído do ponto
final capturado no gancho** (`_missEnd`, que é `origem + direção·t` do primeiro
projétil), com tudo — origem, direção, linha de mira, cano — lido **dentro do
mesmo gancho**, no mesmo frame. Nada aqui compara um acessório de QA com outro
acessório de QA. Isso importa: é exatamente o que a suíte faz, e é por isso que
ela não pega o que este laudo pega.

---

## 1. Veredito, um por critério

### A — Giro e locomoção

| # | veredito | medido |
|---|---|---|
| A1 · giro não translada a cabeça | **APROVA** | **0,00000 m em 16 casos** (raios 0,71 e 1,4 m × 4 direções × 2 sentidos). Teto 0,02. |
| A2 · passo é escolha do jogador | **APROVA** | Herdado — `js/xr/xrturn.js` fora do diff `fa9ed86..2d55610`. |
| A3 · velocidade humana | **APROVA** | Perfil padrão `conforto`: **1,6930 / 2,8000 m/s** (tetos 2,0 / 4,0). `alcance` 3,6279 / 6,0000; `paridade` 5,2000 / 8,6000, opt-in. |
| A4 · aceleração instantânea | **APROVA — e a amarra que eu cobrei EXISTE** | `conforto` e `alcance` t95 = **0,0500 s**; `paridade` **0,2727 s** sob exceção declarada. **O perfil que forjei na rodada 10 agora dá `ok:false`** (§2.4). |
| A5 · vinheta some ao parar | **APROVA** | Receita do §12, três perfis: parado **0,000000**, pós-giro **0,000000**. O `xrcomfort.js` mudou nesta rodada e o fecho pela raiz aguentou. |
| A6 · nada além do pescoço move a vista | **REPROVA** | A parte da parede **melhorou e passa**: 10 m de caminhada física contra estrutura moveram a vista **10,0061 m** (§2.1). Reprovam as **mesmas duas causas da rodada passada, intactas**: `city-destruction-client.js:154‑180` escreve `MP.camera.fov/position/quaternion` na cinemática (`grep presenting` no arquivo: **0**), e `br-game.js:829`/`:1379` pilotam queda e paraquedas por `camera.getWorldDirection`. O irmão `MP.camera.quaternion` **foi corrigido** (0 ocorrências; agora `G.yawDaVista()` em 3 lugares). |

### B — Mira e empunhadura

| # | veredito | medido |
|---|---|---|
| B1 · arma na mão, no `gripSpace` | **APROVA** | Herdado (`xrweapon.js`, `xrhands.js` fora do diff). |
| B2 · 1:1 sem bob nem sway | **APROVA** | Herdado, mesmo motivo. |
| B3 · dá para ver pelo buraco | **REPROVA — mas metade do problema morreu** | **No solo, as 6 hitscan e a faca: 0,00000 m em 2, 5, 10, 25, 50 e 100 m**, em 4 poses × ADS/quadril, ângulo 0,0000°. Era 5,68–15,98 cm. **Reprovam a BAZUCA** (zeragem dinâmica intacta: 1,36–2,42°, 0,25 m a 10 m, 2,23 m a 100 m, zeragem variando **5,60 → 120,00 m** entre dois tiros) **e, em partida BR, as quatro armas balísticas** (§2.2). |
| B4 · botão de mirar não teleporta | **APROVA** | Medido: `|O−cano|` idêntico ao milésimo no quadril e no ADS em todas as 6 hitscan (ex.: SNIPER 0,0589 nos dois; PLASMA 0,2000 nos dois). |
| B5 · segunda mão importa | **NÃO MEDIDO** | Não existe conceito de segunda mão. **Sétima rodada.** |
| B7 · o tiro sai do cano | **REPROVA — por decisão declarada** | **56 de 59 disparos acima do teto de 0,05 m.** Por arma: SNIPER 0,0589 · DMR 0,0700 · FUZIL 0,0910 · RAJADA 0,0920 · TROVÃO 0,1810 · PLASMA 0,2000 · FACA 0,4367. Era 0,0011–0,0126. Só a BAZUCA fica em 0,0000. Ver §3, minha posição sobre o conflito. |
| B6 · háptico em toda ação | **APROVA** | Herdado (`xrhaptics.js` fora do diff). |

### C — Corpo, altura e escala

| # | veredito | medido |
|---|---|---|
| C1 · nunca enterrado | **APROVA** | Re-medido porque o `xrrig` mudou. **2880 frames**, quadrado de 2 m a 0,5 m/s: folga **1,5981 – 1,6019 m**, amplitude **3,9 mm** (janela 1,20–2,10). |
| C2 · o corpo segue a cabeça | **REPROVA — e o número piorou 63×** | Campo aberto, receita canônica, **3840 frames**: separação máxima **0,0083 m** ✔, `fora` 0, escurecimento 0. **Contra parede**, 10 m de caminhada física: separação **8,4140 m** (era 0,1331 m em `fa9ed86`), 204 de 240 frames acima do teto de 0,10. §2.1. |
| C3 · altura do aparelho, agachar | **APROVA** | Re-medido: um pico de **0,4 s a 2,05 m** deixa `alturaDePe` em **1,6000** (não trava mais); **2,0 s a 1,85 m** sobe para **1,8500**. §2.3. |
| C4 · escala 1:1 em metros | **NÃO MEDIDO** | **Sétima rodada.** |
| C5 · corpo em 1ª pessoa coerente | **REPROVA — agora com número** | Medido pela caixa do `FpBody.bodyRoot` contra a posição de MUNDO do olho: de pé o topo do boneco fica **0,1684 m ACIMA do olho**; agachado, **0,7084 m acima**, com o olho **dentro** da caixa. O autor declarou 0,709 m para o caso agachado e acertou; **o caso EM PÉ não estava declarado**. §2.5. |
| C6 · o avatar que os OUTROS veem | **APROVA** | Herdado no yaw; ressalva de C2 permanece. Não medi em dois clientes. |

### D — Interação com o mundo

| # | veredito | medido |
|---|---|---|
| D1 · toda ação alcançável pelo controle | **APROVA — o critério FECHOU** | Medido pelo EFEITO, não pela tecla: granada `nades 3→2`, kit `medkits 3→2`, comer `meat 3→2`, acessório de mira `Alça de ferro → Red Dot` com `adsFov 55→48`. **As 8 armas alcançadas** pelo botão de troca (índices 0–7). Pausa abre e volta (`state.paused false→true→false`, painel de mundo visível). Controle negativo: mexer o analógico **sem** abrir o radial não gasta nada. §2.6. |
| D2 · alcance medido da cabeça | **APROVA — com ressalva medida e agravada** | Uso normal: separação máxima **0,0083 m** em 3840 frames (teto 0,10). `js/interact.js` continua medindo de `player.pos` (**7 ocorrências**), e a separação deixou de ser transitória: contra parede medi **1,0607 m** de cabeça adiante do corpo com a tela já 100 % preta. §2.1. |
| D3 · pegar é com a EMPUNHADURA, e perto | **APROVA — sétima rodada, primeira em verde** | Medido pelo caminho do jogador, com a mão posta em coordenadas de MUNDO: **o gatilho não emite nada em nenhuma distância**; o **grip na borda** emite `KeyE` até `aCasca = 0,0700` e para em **0,0800** → raio de agarre direto entre **7,0 e 8,0 cm** (`RAIO_AGARRE` 0,075; a régua pede 5–10 cm). Agarre à distância existe como **verbo separado** (retenção ≥ 0,30 s ou puxão). **O alcance de gameplay não cresceu**: jogador a 3,6 m (fora dos 2,4 m) com a mão encostada e o grip mantido 0,9 s → **nenhuma tecla**. |
| D4 · affordance dentro do mundo | **APROVA** | Marcador de mundo presente e visível sobre o alvo (`marcadorVisivel: true`). |
| D5 · veículo sem quebrar cabeça nem chão | **APROVA** | Herdado; não re-isolei o salto de saída. Sétima rodada com essa ressalva. |
| D6 · tudo alcançável de posição fixa | **NÃO MEDIDO** | **Sétima rodada.** |

### E — Desempenho

| # | veredito | medido |
|---|---|---|
| E1 · 72 fps travado no aparelho | **`aguardando aparelho`** | — |
| E2 · orçamento em estéreo | **REPROVA** | `node scripts/vr-emulado.js --port=3569`: menu **346 / 997 250**, spawn **356 / 1 013 584**, cidade **370 / 844 996**, castelo **401 / 1 146 464**. **Por olho:** 173 / 178 / **185** / **200,5** calls e 498,6 k / **506,8 k** / 422,5 k / **573,2 k** triângulos. Tetos 180 / 500 k. **Subiu** contra `fa9ed86` (era 344/354/364/395): **+2, +2, +6, +6** calls em estéreo. |
| E3 · escala de render ≥ 85 % | **`aguardando aparelho`** | — |
| E4 · lógica de app ≤ 2 ms | **`aguardando aparelho`** | — |
| E5 · térmica 30 min | **`aguardando aparelho`** | — |

### F — Boot e ciclo de sessão

| # | veredito | medido |
|---|---|---|
| F1 · 4 s até gráfico rastreado | **`aguardando aparelho`** | Cache frio, N ≥ 7. |
| F2 · foco perdido | **APROVA** | Herdado (`xrsession.js` fora do diff). |
| F3 · recentrar não teleporta nem enterra | **APROVA** | Re-medido porque o `xrrig` mudou e `recentrar` passou a chamar `calibrar()`: a 0,55 m e a 1,0 m do centro, jogador **0,0000 m**, **vista 0,0000 m em 18 frames**, `alturaDePe` **1,6000 → 1,6000**. |
| F4 · sair devolve o desktop intacto | **APROVA** | Herdado. |
| F5 · jogável de ponta a ponta | **APROVA** | Herdado. |

### G — Qualidade de imagem

| # | veredito | medido |
|---|---|---|
| G1 · foveação declarada | **APROVA** | Herdado (`xrquality.js` fora do diff; `setFoveation` chamado). |
| G2 · antialiasing em XR | **NÃO MEDIDO** | O IWER não expõe `samples` do alvo XR. `antialias: true` está em `game.js:333`. |
| G3 · escala de framebuffer declarada | **APROVA** | Herdado (`setFramebufferScaleFactor` chamado). |
| G4 · texto e mira legíveis | **`aguardando humano`** | Números angulares medidos e registrados em §2.7 — inclusive um instrumento que erra por 3,4×. |
| G5 · uma captura por entrega | **NÃO MEDIDO** | `output/vr/` só tem `baseline-quest.png`, de 25/08. **Sétima rodada sem captura estéreo** — e esta mexeu num painel novo que ocupa o antebraço do jogador. |

### H — HUD e UI dentro do mundo

| # | veredito | medido |
|---|---|---|
| H1 · nada essencial só no DOM | **APROVA — 17 de 17** | `xrHudArma`, `xrHudPulso` e **`xrHudMapa`** presentes e visíveis dentro do rig; `xrUiPainel` cobre menu/pausa/lobby/placar/chat; marcador de interação presente; retículo por ausência declarada. O canvas do mapa existe (`MiniMap.canvasXR()`) e a **versão sobe** (48 → 57 em 700 ms): a textura não congela. §2.7. |
| H2 · UI não é colada na cara | **REPROVA — achado de medição NOVA** | Medi as distâncias pela primeira vez: **mapa 0,378 m**, **pulso 0,396 m**, arma 0,552 m. A régua pede painéis a partir de **0,45 m** e **"nada mais perto que 0,75 m para leitura demorada"** (Oculus BP: abaixo de 0,75 m as lentes desfocam). Dois dos três painéis estão abaixo de 0,45 m, e o novo é o mais perto de todos. **Não é regressão — é a primeira vez que alguém mede.** §2.7. |
| H3 · o retículo não mente | **APROVA** | Por ausência declarada. |

### I — Ausência de defeito grosseiro

| # | veredito | medido |
|---|---|---|
| I1 · vinte minutos, 20 caixas | **`aguardando humano`** | **Zero caixas em sete rodadas.** O kit destrava o caminho e melhorou muito — §4. |
| I2 · zero erro de console | **APROVA** | `pageErrors` e `consoleErrors` **vazios nas vinte sessões imersivas**. Ressalva: nenhuma durou 20 minutos. |
| I3 · nada atravessa a câmera | **NÃO MEDIDO** | Os três painéis estão a 0,378–0,552 m do olho, todos acima do teto de 0,15 m ✔. Mas **não amostrei geometria do mundo**, e o resultado de C5 (§2.5) é sinal amarelo: a **caixa** do corpo contém o olho. Caixa englobante não prova triângulo dentro de 0,15 m — por isso não converto isso em vermelho. **Sexta rodada sem medir de verdade.** |
| I4 · nenhum estado sem saída | **NÃO MEDIDO** | Pausa e menu confirmados por controle. Faltam do roteiro fechado: nave, queda livre, paraquedas, dirigindo, espectador e fim de partida. |

---

## 2. O que mudou, auditado

### 2.1 · A parede — A6 fechou, C2 abriu 63× mais

**A escolha do autor funciona, e eu confirmo o número dele.** Receita: 10 m de
caminhada física (`dev.position` em passos de 4,17 cm, abaixo do
`PASSO_HUMANO_MAX`) contra uma parede real de `js/structures.js`, 240 frames.

| grandeza | `fa9ed86` | **`2d55610`** |
|---|--:|--:|
| a VISTA andou | 10,9805 m | **10,0061 m** |
| o COLISOR andou | **10,9623 m** (atravessou) | **1,6435 m** |
| separação máxima cabeça↔colisor | 0,1331 m | **8,4140 m** |
| escurecimento de intrusão | não existia | **1,0000 (preto total)** |

O colisor **para na parede** — é o vetor de trapaça de escala de sala que
`fa9ed86` tinha, e ele morreu. **E a dívida é paga na volta:** andando os 10 m
de volta, `fora` volta a **0,0000** e a separação a **0,0417 m**, sem teleporte
de colisor. O mecanismo de abatimento está certo e eu o testei nos dois sentidos.

**A cortina de intrusão existe e funciona**, e ela é a razão de C2 não ser um
desastre: metade preta em **0,725 m** de separação, **100 % preta em 1,100 m**.
Em uso normal ela **nunca acende**: 3840 frames de quadrado de 2 m com
`escuro` máximo **0,0000**.

**Mas C2 reprova, e reprova pior que antes.** O critério pede ≤ 0,10 m em todos
os frames; medi 8,4140 m. Trocar 0,1331 m por 8,4140 m é uma piora de 63× no
número que o critério cobra. É uma **troca de projeto assumida** — A6 sobre C2 —,
e eu concordo com a direção. O que reprova é que **a troca continua sem exceção
declarada**, exatamente como na rodada passada. A4 tem `EXCECOES` em código, com
motivo, custo e condição de validade; esta escolha tem prosa em comentário. E a
caixa **I1 #4** pergunta, literal: *"Encosto numa parede andando fisicamente.
**Ela me para?** ☐"* — a resposta honesta do humano continua sendo NÃO.

**Três coisas que só apareceram medindo:**

1. **A cortina ATRASA.** A rampa é linear a `FORA_K·dt` (3/s), então leva 1/3 s
   do claro ao preto. Medido: no frame 40 `fora` = 0,225 m e `escuro` = **0,000**;
   no frame 60 `fora` = 1,058 m e `escuro` = 1,000. Nesses **0,33 s** o jogador
   atravessou de 0,27 m a 1,10 m para dentro do sólido **com a vista limpa ou
   quase**. É estreito, mas é a janela em que se vê do outro lado.
2. **`fora` não tem teto.** `devolverPasso` (`js/xr/xrrig.js:348`) faz
   `foraX += dx` sem clamp. O abatimento só desconta passo cuja direção de
   MUNDO se opõe ao `fora` — e o giro artificial gira o referencial. Medi 8,41 m
   acumulados numa caminhada só; nada impede mais. Com a tela preta não é
   vantagem visual, mas o corpo do jogador fica arbitrariamente fundo dentro de
   geometria. **Um teto (`FORA_MAX` já existe como número de conforto) resolveria.**
3. **O `shotFired` degrada.** O traçante manda a **boca do cano** como origem
   (`game.js:2564`), e o cano carrega o `fora`; `player.pos` não. Passando de
   ~3,5 m de separação, `server.js:912` descarta a replicação por passar dos
   5 m: o dano entra, o tiro some da tela dos outros. Cosmético, mas real.

**Anti-cheat: NÃO reaberto.** Confirmei o caminho inteiro por auditoria
independente do servidor. `foraX/foraZ` vive só em `rig.position`
(`js/xr/xrrig.js:243`) e **nunca entra em `player.pos`**; o `state` enviado
(`br-game.js:1864`) e o `fromPos` do `shotHit` (`br-game.js:329`) saem os dois
de `player.pos`, então a distância que `server.js:833` valida é fixa em ~1,5 m,
imune ao `fora`. O escoamento de 0,006 m/frame ≈ **0,43 m/s** contra os guardas
de **55 e 90 m/s** — folga de 128×. `test/security-regression.test.js`: **9/9
pass**.

### 2.2 · A mira — a correção está certa, e alcança metade do jogo

**No caminho hitscan, o conserto é perfeito e eu o confirmo com o raio real.**
Reconstruí o raio do ponto final capturado no gancho, com o spread REAL zerado
(`spreadHip`/`spreadAds`), em 4 poses × ADS/quadril:

```
FUZIL, TROVÃO, FALCÃO, PLASMA, SNIPER, RAJADA e a FACA
  ângulo raio↔linha de mira: 0,0000°
  desvio a 2 / 5 / 10 / 25 / 50 / 100 m: 0,00000 m em TODAS
```

Era 5,68 cm a 5 m no sniper e 15,98 cm na escopeta, com a zeragem andando entre
tiros. **Morreu.** É a melhor correção desta rodada e eu não tenho ressalva
sobre ela.

**Mas ela não alcança dois caminhos, e um deles é o modo principal do jogo.**

**(a) A BAZUCA ficou com a zeragem que o hitscan perdeu.** O ramo `rocket`
(`game.js:2356‑2362`) **não foi tocado** e faz, hoje, exatamente o que a rodada
10 reprovou:

```js
const zeroD = Math.max(4, Math.min(rayBlockedAt(_rayOrig, _rayDir, 240), 120));
_v1.copy(_rayOrig).addScaledVector(_rayDir, zeroD);
_rayDir.copy(_v1).sub(_v3).normalize();
```

Medido, seis tiros em pitches diferentes:

```
zeragem: variou de 5,60 m a 120,00 m entre dois tiros → amplitude 114,40 m
ângulo foguete↔linha de mira: 0,0630° a 2,4172°   (teto de B3: 0,5°)
desvio real: 2 m→0,10  5 m→0,03  10 m→0,12  25 m→0,44  50 m→1,04  100 m→2,23 m
```

É o defeito inteiro, com o mesmo nome e o mesmo mecanismo, vivo numa das oito
armas. E não é regressão de VR: esse ramo não é gateado por `XR.presenting` —
o jogador de monitor convive com ele desde sempre.

**(b) Em partida BR, quatro armas nunca passam pela alça.** Com o BR ativo,
`br-game.js` liga `projSpeed` nos slots 0, 2, 4 e 6, e essas armas saem por
`game.js:2460` — `window.__BR_ballistics(_v3, _rayDir, gun)` — com origem na
**boca do cano** e direção da **mira**. A correção de B3 mexeu no `_rayOrig` do
hitscan; esse ramo usa `_v3`. Resultado: o projétil fica **paralelo** à linha de
mira, deslocado exatamente da altura da alça, **em toda distância**. Medido
dentro de uma partida BR de verdade:

| arma | projSpeed | ângulo | desvio a 2 m | a 10 m | a 100 m |
|---|--:|--:|--:|--:|--:|
| FUZIL "VAGALUME" | 200 | 0,0000° | **0,0910** | **0,0910** | **0,0910** |
| DMR "FALCÃO" | 310 | 0,0000° | **0,0700** | **0,0700** | **0,0700** |
| PLASMA "VISITANTE" | 120 | 0,0000° | **0,2000** | **0,2000** | **0,2000** |
| SNIPER "AGULHA" | 290 | 0,0000° | **0,0589** | **0,0589** | **0,0589** |
| BAZUCA "TROVOADA" | — | 1,3630° | 0,1047 | 0,0856 | 2,2264 |
| TROVÃO, RAJADA, FACA | — | 0,0000° | 0,0000 | 0,0000 | 0,0000 |

Uma cabeça humana tem ~16 cm. **Com o plasma, o tiro passa 20 cm ao lado do
ponto que a alça indica — sempre, em qualquer distância.** Este é o defeito de
B3 que sobra, e ele mora justamente no modo que o dono joga.

Não é ruído: **o desvio é constante e igual ao `|origem − cano|` que medi no
solo, arma por arma** (0,0589 / 0,0700 / 0,0910 / 0,2000). É o mesmo número
visto dos dois lados — no solo como distância ao cano, no BR como erro de
acerto. A correção trocou os dois de lugar em metade do arsenal e não nos
outros.

### 2.3 · A altura do corpo — o pico não trava mais

Confirmado com o cenário do defeito, medido em sessão:

| cenário | `alturaDePe` | agachado |
|---|--:|:--:|
| repouso a 1,60 m | 1,6000 | não |
| **pico de 0,4 s a 2,05 m** (headset erguido) | **1,6000** | **não** |
| depois do pico, de volta a 1,60 m | 1,6000 | não |
| **2,0 s sustentados a 1,85 m** | **1,8500** | não |
| de volta a 1,60 m | 1,8500 | `agacharFrac 0,455` |

O defeito morreu: 0,4 s de leitura alta não travam mais o jogador agachado. E o
caso legítimo sobe. **A saída para a última linha existe e é a certa**
(`recentrar` → `XR.corpo.calibrar()`, `game.js:2947`), e eu confirmei que
`calibrar()` **desce** a referência, não só sobe.

**Ressalva honesta:** a aposta é que 0,75 s "é mais que qualquer falha de
rastreio". Um pico de **1,0 s** ainda trava — `candidato` recebe a primeira
leitura do ciclo, e se o salto foi instantâneo o mínimo da janela já é o valor
alto. Isso é um jogador tirando o headset e segurando-o no alto por um segundo,
o que acontece. Não reprovo por isso, porque o `calibrar()` do recentrar é uma
saída de um gesto — mas o número é aposta, não prova.

Observação lateral: com `agacharFrac = 0,455` medi `player.crouchT = 0,000`.
Os dois deveriam andar juntos (o comentário do `xrbody.js` diz que o
agachamento "alimenta" o `crouchT`). Pode ser recorte da minha sonda; registro
como coisa a olhar, não como veredito.

### 2.4 · A amarra do A4 — implementada, e ela para o meu ataque

Rodei o **mesmo perfil forjado**, letra por letra:

```
{ perfil: 'paridade', escala: 1, andar: 12, correr: 25, aceleraSolo: 4 }
rodada 10 → ok: true  · t95 0,7500 s · excecoes: ['A4']
AGORA     → ok: false · t95 0,7500 s · faltas: [A4 rampa95S 0,75 (teto 0,15)]
```

E ela não é frouxa: `paridade` com **um** número trocado (correr 8,6 → 9,9) dá
`ok:false`; com a **rampa** trocada (aceleraSolo 11 → 4) dá `ok:false`. Os três
perfis reais passam, e o `paridade` sai com a exceção carimbada e t95 = 0,2727 s.
**A condição que eu pus para aceitar a exceção está cumprida.**

**Duas brechas que sobram, e digo o tamanho delas.** A prova continua vindo do
réu: o plano carrega o próprio `pc`, então um plano forjado **com** um `pc`
forjado junto volta a sair `ok:true` com t95 de 0,75 s. E `auditar(plano,
excecoesUsadas)` aceita uma lista de exceções pelo segundo parâmetro — com
`vale: () => true` qualquer coisa passa. **Nenhuma das duas é caminho de
produção** (`auditar` só é chamado por `test/xr-conforto.test.js`), então isto
não muda o veredito de A4: é observação de auditoria. Mas a amarra definitiva é
comparar contra as constantes do PC do jogo, não contra um campo que o plano
carrega.

### 2.5 · O corpo de primeira pessoa — o autor mediu certo, e faltou uma linha

Medi a caixa do `FpBody.bodyRoot` contra a posição de **mundo** do olho:

| estado | topo do boneco | acima do olho | olho dentro da caixa |
|---|--:|--:|:--:|
| de pé | 4,5550 | **+0,1684 m** | **sim** |
| agachado (0,55 m) | 4,5350 | **+0,7084 m** | **sim** |

**O 0,709 m que o comentário do `xrbody.js` declara está certo ao milímetro.**
Reconheço o valor de o autor ter medido e escrito o próprio defeito, com o
raciocínio (`plantFeet` do VRIK, o modelo que não encurta ao agachar) e o
caminho de saída (o rig do corpo, não o `xrbody`). Isso é o oposto de esconder.

**Mas o caso EM PÉ não foi declarado, e ele é o normal:** mesmo em pé o topo do
boneco está 16,8 cm acima do olho do jogador. C5 pede corpo ancorado na cabeça
com erro ≤ 0,05 m, **ou** a decisão explícita de não renderizar corpo. Hoje não
é nem um nem outro, e a cabeça do boneco está acima do olho no estado padrão.
**Reprova.**

### 2.6 · Os quatro verbos e o radial — medidos pelo efeito, e passam

O radial é a melhor peça de engenharia desta rodada. Medi a máquina pura e o
efeito no mundo:

- **as quatro direções batem com as quatro fatias** (cima→`KeyG`, direita→`KeyQ`,
  baixo→`KeyF`, esquerda→`KeyT`), confirmando **na soltura**, e o **centro
  cancela**;
- **perder o controle no meio não confirma** (`confirmou: null`) — perder
  rastreio não gasta granada;
- **a histerese funciona** (entra em 0,5, larga em 0,3, mantém entre os dois);
- **com o radial aberto, andar = 0, correr = false, girar = 0**;
- **o rearme funciona**: soltando com o polegar ainda na direção, o jogador
  **não sai andando nem gira** — só depois de passar pelo centro. Este é o
  detalhe que separa "funciona" de "funciona na mão de quem joga";
- **a banda morta morreu**: a caminhada chega a **1,0000 em inclinada crua 0,85**
  e correr entra em **0,92**, com uma faixa de descanso entre os dois.

E o efeito, com controle negativo:

```
CIMA · granada                nades: 3 → 2
DIREITA · kit médico          medkits: 3 → 2
BAIXO · comer                 meat: 3 → 2
ESQUERDA · acessório de mira  Alça de ferro → Red Dot · adsFov 55 → 48
(analógico SEM o radial)      NADA MUDOU
```

**Atenção a este detalhe, porque ele é o que separa medida de ilusão:** medindo
o mesmo cenário sem tocar em nada, a **vida do jogador subiu de 40 para 59,6
sozinha** (regeneração). Qualquer sonda que aceitasse "a vida subiu" como prova
de kit médico estaria verde o tempo todo. O sinal que vale é o **contador cair**.

**Ergonomia — a pergunta que foi feita.** O orçamento acabou de verdade, e o
raciocínio do arquivo é o certo: cinco botões pressionáveis por mão (0, 1, 3, 4,
5), o 7 é reservado pela plataforma por especificação, o 6 é capacitivo. Com o
grip indo para o agarre (que é obrigação de VRC), a cascata agachar→clique e
correr→batente é a única que fecha, e correr no batente é convenção do gênero,
não improviso. **Quatro fatias é o teto certo** e a ordem cardeal (cima, direita,
baixo, esquerda) põe o centro de cada fatia num eixo — o polegar acha sem olhar.

O que eu diria ao dono, sem rodeios: **daqui para frente toda ação nova é fatia
de radial, e a quinta fatia é onde isso começa a doer.** Com 4 fatias de 90° a
fronteira está na diagonal e o erro é perdoador; com 6 fatias de 60° não é mais,
e o custo aparece em partida, sob pressão. Se houver um sexto verbo, a saída não
é dividir mais este radial — é um **segundo** radial no gatilho da outra mão, ou
um radial contextual (fatias diferentes conforme o que está na mão). E há uma
folga real ainda não gasta: **a mão de apoio tem o próprio clique de analógico
livre** hoje só para agachar.

**Uma assimetria pré-existente que a nova curva expôs:** a zona morta é aplicada
**por eixo**, não pelo vetor. Na diagonal a 0,85 de inclinada a caminhada dá
**0,8887** em vez de 1,0000. Andar na diagonal é 11 % mais lento que andar reto,
com o mesmo polegar. Não é desta rodada e não reprova nada — mas se alguém for
mexer na curva de novo, é ali.

### 2.7 · O minimapa — H1 fechou, e o painel está perto demais

**O item 17 existe e funciona.** `xrHudMapa` presente e visível no antebraço; o
canvas é o mesmo do minimapa 2D (o módulo não desenha um blip); a versão sobe
(48 → 57 em 700 ms), então a textura **não congela** — mapa congelado mente
sobre onde estão os inimigos, e não é o caso.

**E o defeito de baixo morreu, medido:**

```
 passo | yaw do MAPA | yaw da VISTA | yaw do RIG | yaw da CABEÇA (local)
     0 |     0,00000 |      0,00000 |    0,00000 |  0,00000
     1 |    -0,36216 |     -0,36216 |   -0,36216 | -0,00000
     4 |    -1,44578 |     -1,44578 |   -1,44578 | -0,00000
 cabeça +0,6 rad |  -0,84578 |  -0,84578 |   -1,44578 |  0,60000
erro máximo |mapa − vista de mundo| = 0,000e+0 rad
```

Quatro passos de giro artificial e um giro só de cabeça: o mapa acompanha a
vista de mundo **exatamente**, e a última linha é a que prova — o rig está em
−1,446 e a cabeça em +0,600, e o mapa segue a soma. Lendo `camera.quaternion`
(o defeito antigo) a última linha daria 0,600.

**O custo em draw call eu NÃO consegui medir de forma confiável, e digo por quê.**
Chamando `renderer.render` fora do laço XR, a diferença com e sem o quad deu
**0** — e deu **−2** para o painel do pulso, o que é impossível e denuncia a
medição, não o painel. É o mesmo furo que aponto no teste `xr-mapa` ("custa
poucas draw calls": `mediana(dif) <= 2` é satisfeito por 0, isto é, pelo painel
não ser desenhado). O que **é** medível: pelo `vr-emulado`, a cena da cidade foi
de **364 para 370** calls em estéreo contra `fa9ed86` — **+3 por olho**, com o
quad novo dentro desse orçamento. Um quad texturizado não pode custar mais de
1 draw call por olho, e nada nos números contradiz isso. **A resposta honesta é
"consistente com 1 por olho, não provado por medição direta".**

**H2 reprova, e é achado meu, não regressão.** Medi as distâncias pela primeira
vez em sete rodadas: **mapa 0,378 m · pulso 0,396 m · arma 0,552 m**. A régua
diz painéis a partir de 0,45 m e nada mais perto que 0,75 m para leitura
demorada, porque abaixo disso as lentes desfocam. Um mapa é leitura demorada por
definição. **O painel do pulso já estava assim antes e passou como "herdado" —
o erro foi meu, por herdar sem medir.** Registro como reprovação de H2 a partir
de agora, e não conto como defeito novo desta rodada.

**Legibilidade — e um instrumento que erra por 3,4×.** O quad subtende
**16,57°**; o menor blip (inimigo) é 3 px num desenho de 168 px, ou seja
**1,79 % do lado → 0,296°**. No painel do Quest 3 (≈18,8 px/grau) isso é
**~5,6 px**: um ponto, não uma forma. Fica como `aguardando humano` para G4.

O que **é** defeito: `XRHud.estado()` reporta `grausTexto = 0,087°` para o mapa
— **3,4× menos que o real** — porque a conta usa `cvH = PULSO_CV_H` (384) para
um canvas que tem **256** (`S_XR`), e ignora o `ctx.scale(k)` que o próprio
desenho aplica. Erra para o lado seguro (reprova o que passaria), mas é a mesma
família que já custou caro aqui: **o instrumento novo mente sobre o produto
novo**, e qualquer teste futuro de legibilidade que use esse campo mede errado.

### 2.8 · O contrato do RNG — segurou, e agora por construção

`cloneRig` cercado no `noSeed` (`js/skeletons.js:338`). Rodei
`test/carregamento-determinismo.test.js`: **1/1 pass** — castelo, sítios,
clareiras, vagas, inimigos, boss, alien e altura **byte a byte** iguais ao
retrato pré-fatiamento. O invariante mais caro do repositório continua de pé, e
agora está seguro **por construção** e não por ordem de execução, que era a
ressalva que eu mesmo levantei na rodada passada. **Correção limpa, sem preço.**

---

## 3. Minha posição sobre o conflito B7 × B3

Foi pedida, e eu dou sem meio-termo.

**A escolha está certa. Acertar onde a alça aponta é o critério que importa, e
B7 é o que deve ceder.**

Três razões, na ordem em que pesam:

1. **B7 nunca foi um fim, foi um meio.** O texto do critério diz, na própria
   fonte: *"consequência direta de B1/B3"*. Ele foi escrito quando a origem
   estava **50 cm atrás e 45° fora** do cano — um número que denunciava a arma
   pendurada no `targetRaySpace`. Aquele defeito morreu. O que o teto de 0,05 m
   pega hoje não é arma no lugar errado: é a **altura da alça sobre o cano**,
   que existe em toda arma de fogo do mundo real.
2. **O jogador não vê a origem do raio; ele vê o traçante e o clarão, e os dois
   continuam saindo da boca.** A separação entre o cosmético e o autoritativo é
   como o gênero inteiro resolve isso, e é invisível.
3. **O critério que o dono descreveu com as próprias palavras é B3**: *"ver o
   buraco da mira da arma, de forma real"*. Nenhuma das duas queixas dele fala
   de onde o raio nasce.

**Agora o teto de 0,25 m: é afrouxamento disfarçado? Não — mas está no lugar
errado, e é frágil.**

Não é disfarçado: está escrito no arquivo, com o motivo, e o caso vem
acompanhado de um assert **novo e mais forte** (`naLinha < 0,002` — a origem tem
de estar SOBRE a linha de mira), que não existia. Isso é o oposto de esconder.

O que está errado é o **lugar**: o teto de aceite mora no critério, e o critério
não foi tocado. Hoje `docs/vr/criterio-aaa.md` §B7 continua dizendo **0,05 m** e
o teste diz 0,25 m. **Enquanto os dois discordarem, B7 sai vermelho neste laudo
— e vai sair vermelho em todos os próximos**, porque eu leio a régua, não o
teste. Não vou editar a régua: não é minha função nesta rodada e o §0 é
explícito.

E é frágil por dois motivos que valem escrever:

- **0,25 m não vem de lugar nenhum.** A maior altura de alça medida é 0,2000 m
  (PLASMA), e a FACA dá **0,4367 m** — ou seja, o teto de 0,25 m já **não cobre
  o arsenal inteiro** e o teste só não vermelha porque não visita a faca. Um
  teto derivado seria *"≤ a altura de alça declarada por perfil de arma"*, não
  um número redondo.
- **Um teto solto reabre B1 pela porta dos fundos.** Se amanhã a arma escorregar
  20 cm da mão, `|origem − cano|` vai a 0,25 m e passa. A grandeza que fecha
  esse buraco não é essa: é a que o `test/xr-weapon.test.js` **já tem** no caso
  pré-existente *"o raio do tiro PASSA PELA MASSA DE MIRA"* — que compara contra
  a **geometria do modelo**, uma referência independente.

**Minha recomendação, em uma linha:** trocar o texto de B7 de *"≤ 0,05 m da boca
do cano"* para *"a origem do raio está SOBRE a linha de mira (≤ 0,002 m) e o
afastamento do cano não passa da altura de alça declarada daquela arma"*, e
deixar a massa de mira do modelo como o guarda de B3. Isso mantém o critério
cobrando o que ele foi criado para cobrar, sem número redondo e sem conflito.

**Mas nada disso vale enquanto B3 não fechar de verdade.** A escolha foi
"acertar onde a alça aponta" — e em partida BR, com quatro armas, **o tiro não
acerta onde a alça aponta**. O conflito B7×B3 só é um dilema legítimo no caminho
hitscan. Nos outros dois, não há dilema nenhum: há trabalho que não foi feito.

---

## 4. O kit `npm run vr:sessao` — fecha as 20 caixas, e ainda tem dois furos

**Os quatro vereditos que eu reprovei estão consertados, e eu confirmei um por
um com dados forjados que REPROVAM:**

| caso alimentado | rodada 10 | **agora** |
|---|---|---|
| 1 stale em 300 amostras (a mediana esconde) | VERDE | **VERMELHO** — "stale: pior 1, total 1" |
| 10 amostras abaixo da taxa do modo, nada abaixo de 60 | ignorado | **VERMELHO** — `abaixoDaTaxa` é lido |
| mediana 72 com pior 41 e 3 abaixo de 60 | VERDE | **VERMELHO** |
| taxa nunca declarada | VERDE | **VERMELHO** |
| `GPU% = 0,95` (fração) contra teto 90 | 0,95 > 90 = falso | **`gpuEmPct(0,95) = 95`** ✔ |
| `App=` ausente (`null <= 2`) | VERDE | **`aguardando aparelho`** ✔ |

Mais: `adb logcat -c` **é chamado** (`vrdevice.js`), o `presenting` **é impresso**
(coluna "em sessão", com o denominador ao lado), o bloco BOOT foi reordenado e
o item 1 deixou de ser inexecutável, `staleMax`/`staleSoma` existem ao lado da
mediana, e os 8 testes novos passam (`node --test test/vr-sessao-vereditos.test.js`
→ **8/8**). **Isto é conserto de verdade, e é a peça mais importante da rodada**,
porque é o único caminho para os oito critérios que só o aparelho fecha.

**Mas achei dois furos, e o primeiro é o MESMO defeito que foi consertado no
E4, sobrevivendo no E1:**

```
abaixoDaTaxa ausente (o campo some do parser)  →  **VERDE**  "abaixo da taxa undefined"
staleMax ausente     (o campo some do parser)  →  **VERDE**  "stale total undefined"
```

`undefined > 0` é `false`, então o veredito passa — e ainda **imprime
`undefined` dentro da string verde**, que é a assinatura exata do defeito
anterior (`piorFps` publicado como evidência do veredito que ele refuta). O
conserto do E4 usou o guarda certo (`typeof === 'number' && isFinite(...)`); o
do E1 não usou. E o cenário não é hipotético: **foi exatamente uma mudança de
formato do log que produziu o `App=` ausente** que originou o defeito do E4.
Conserto: o mesmo guarda, nos dois campos.

**Segundo furo: `groundAt(cabeca.x, cabeca.z, 999)` continua** em
`scripts/vr-sessao.js:484`. Eu apontei isso na rodada 10 e não foi corrigido. Com
`curY = 999` toda plataforma passa no filtro e a função devolve o **teto**, não o
piso — a folga que o relatório publica pode ser de outro andar. Sei que é assim
porque **cometi o mesmo erro nesta rodada** e plantei o jogador em cima da parede
que ia testar. O uso canônico é `groundAt(x, z, pos.y)`.

**E três coisas que continuam sem caixa, todas apontadas na rodada 10:**

- **I3 não tem evidência nenhuma**: aparece só como `crit` do bloco de soak, sem
  caixa própria e sem sonda de distância olho↔geometria;
- **quatro caixas (15, 16, 17 e o soak) dependem de o humano conseguir entrar
  numa partida de BR**, e o kit continua sem pôr o jogo em BR nem oferecer
  fallback — só *pede* ao humano que consiga;
- **I1 #3 ("o corpo veio junto?") continua aprovando com C2 vermelho**, porque
  as duas cláusulas são satisfeitas por rastreio puro.

**Veredito do kit:** as 20 caixas estão lá, nenhuma se auto-marca, e os
vereditos automáticos **deixaram de mentir nos quatro casos que eu apontei**.
Com os dois guardas de campo ausente (`abaixoDaTaxa`, `staleMax`) e o
`groundAt`, **eu soltaria o kit para uma sessão com o dono**. Sem eles, o kit
ainda pode imprimir VERDE sobre dado que não existe — e num kit cujo único
propósito é fechar oito critérios, isso é o defeito mais caro possível.

---

## 5. A caça ao teste que passa por acidente — achei a SEXTA e a SÉTIMA

Foram procuradas e foram encontradas, provadas por mutação (com a árvore
restaurada e conferida ao final).

### 5.1 · `test/xr-mira.test.js` — os TRÊS casos, e é o pior tipo

**Mutação:** `js/xr/xrweapon.js:196`, eixo óptico da arma girado **6°** em
relação às miras físicas do modelo — ou seja, **≈105 cm de erro a 10 m**, contra
o teto declarado de 2 cm no próprio arquivo.
**Resultado: `pass 3 · fail 0`.** Os três casos verdes, inclusive *"o raio
disparado passa pelo ponto que a alça indica — em toda distância"*.

**A causa é algébrica.** O arquivo calcula
`aoRaio(miraOrigem + miraDir·d, origemDoTiro, direcaoDoTiro)`. Mas em `game.js`:

- `_miraDirDoTiro` (:2422) e `_direcaoDoTiro` (:2455) são **a mesma chamada de
  `miraDirecao()`**;
- `_origemDoTiro` é `_rayOrig` **deslocado AO LONGO de `_rayDir`** (:2430).

A "linha de mira" e o "raio disparado" são **a mesma reta, por construção**. A
distância de um ponto da reta L à reta L é zero — para qualquer arma, qualquer
distância, qualquer direção. As 5 distâncias × 4 armas × 3 direções são a mesma
identidade repetida 60 vezes.

**E eu medi o zero.** Com a bazuca — que tem o defeito real de 1,36° e 12 cm a
10 m — a fórmula do teste devolve:

```
o que o TESTE mede a 10 m: 1,86e-15 a 3,79e-15 m   (teto do teste: 0,02 m)
o desvio REAL do foguete:  0,0856 a 0,1225 m
```

**Zero à precisão de ponto flutuante, treze ordens de grandeza de folga, sobre
uma arma que erra 12 cm.** É cobertura aparente exatamente onde o jogo está
errado.

Duas agravantes: **`marcarTiroQA(orig, dir)` grava o MESMO par** como tiro e
como mira nos caminhos da faca e da bazuca, então ali o zero é literal por
definição; e **o laço só visita 3 armas** (`min(destravadas, 4)`, e só 3 nascem
destravadas), então a bazuca, a faca, o plasma, o sniper e a escopeta RAJADA
**nunca são medidos** — enquanto o cabeçalho do arquivo promete "para TODAS as
armas destravadas".

O comentário do arquivo afirma: *"Quem mata aquele mutante é o caso 1, que cobra
erro ~zero em CINCO distâncias ao mesmo tempo — e nenhuma zeragem consegue isso,
por construção."* **A afirmação está invertida:** é o caso 1 que não consegue
falhar, por construção.

**O que consertaria:** a grandeza certa **já existe neste repositório**. Na mesma
execução mutada, o caso **pré-existente** de `xr-weapon` *"o raio do tiro PASSA
PELA MASSA DE MIRA"* ficou **VERMELHO** — porque compara contra a geometria do
modelo, que é referência independente. Basta usar aquela, e medir o raio
**reconstruído do ponto de impacto**, não o acessório de QA.

### 5.2 · `test/xr-weapon.test.js` — o caso reescrito nesta rodada

Mesma mutação de 6°: **verde**. O caso se chama *"a direção do tiro é a da mira —
medida na PERPENDICULAR, que é onde o erro mora"*, e o comentário diz ter
corrigido o quinto teste falso. **A perpendicular é medida contra a mesma fonte
que gerou o raio.** É o quinto defeito reencenado num eixo novo — e o caso
irmão, mais velho, pega.

### 5.3 · `test/xr-parede.test.js` — o teste instala a fiação que falta e aprova

**Mutação:** `game.js:3520` → `if (false) XR.conforto.intrusao(dt, XR.foraDoCorpo);`
— arranca do jogo a chamada do escurecimento.
**Resultado: `tests 12 · pass 12 · fail 0`.**

O caso conta as chamadas de produção e, se der zero, **chama a função ele mesmo**:

```js
if (doJogo === 0) intrusaoOrig(dt, sep);   // o teste vira a fiação
```

A variável que registra isso (`fiacaoDoJogo`) vai para o `console.log` e
**nunca entra num assert**. A rodada mutada imprimiu, literalmente, *"escuro máx
1,0000 · fiação do TESTE (a linha do game.js ainda não foi colada)"* — o teste
detectou que a fiação sumiu, se substituiu a ela, e aprovou o produto. É a quinta
ocorrência histórica (o `xr-hud` com a fiação arrancada) reencenada.

### 5.4 · Suspeitos não provados, que valem uma olhada

- **`xr-input`, "a caminhada chega a 100 % ANTES do batente"** — o assert usa a
  própria constante `ANDAR_CHEIO` no ponto exato do limiar: vale para qualquer
  valor da constante. É a família "só confere a própria tabela".
- **`xr-mapa`, "custa poucas draw calls"** — `mediana(dif) <= 2` é satisfeito
  por **0**, isto é, pelo painel não estar sendo desenhado. Foi exatamente isso
  que aconteceu comigo (§2.7).
- **`xr-mira`, o guarda `saiu`** — `origemDoTiro() !== antes || O.lengthSq() > 0`:
  depois do primeiro tiro da sessão o segundo ramo é sempre verdadeiro, então
  disparos que não saem passam como se tivessem saído.
- **`vr-sessao-vereditos`** — cobre E1 e `gpuEmPct`, mas os vereditos de **E4** e
  **E5** vivem inline em `relatorio()` e não são exportados: dois dos quatro
  defeitos que o cabeçalho declara ter consertado continuam sem teste que possa
  ficar vermelho.
- **`xr-agarrar`, "o alcance de GAMEPLAY não cresce"** — `if (e.alvo) assert(...)`:
  a asserção é pulada em silêncio se não houver alvo. (Descobri por experiência
  própria que `alvo` fica `null` com facilidade: `classes()` gateia os baús do
  solo com `!__BR_active`, e o harness liga essa bandeira por padrão.)
- **`xr-parede` unitário, `entregue < 11`** — o defeito histórico mediu
  **10,9623 m** e o teto é 11. Passa por 3,8 cm.

---

## 6. Defeitos NOVOS, com medição — e quantos nasceram de uma correção

O termômetro que vem caindo (5 → 3 → 2 → 1) **sobe para 4** nesta rodada.

| # | defeito | medido | nasceu de? |
|---|---|---|:--:|
| 1 | **C2: a separação cabeça↔colisor foi de 0,1331 m para 8,4140 m**, e `fora` não tem teto nem clamp | 8,4140 m em 240 frames; 204 frames acima de 0,10 | **da correção da parede** |
| 2 | **`vereditoE1` sai VERDE com campo ausente** (`abaixoDaTaxa`/`staleMax` `undefined`), imprimindo `undefined` dentro do texto verde | 2 casos forjados de 8 | **da correção do kit** (o guarda certo foi para o E4 e não para o E1) |
| 3 | **`XRHud.estado().grausTexto` do mapa subestima 3,4×** (0,087° reportado, 0,296° real): usa `PULSO_CV_H` = 384 para um canvas de 256 e ignora o `ctx.scale(k)` | 0,087° vs 0,296° | **da correção do H1** |
| 4 | **`shotFired` do traçante é descartado pelo servidor** quando `fora` passa de ~3,5 m (o cano leva o `fora`, `player.pos` não) | limiar de 5 m em `server.js:912` | **da correção da parede** |

E, fora dessa contagem, **três testes falsos nascidos das correções desta
rodada** (§5): `xr-mira` inteiro e o caso reescrito de `xr-weapon` — os dois
criados para consertar o quinto teste falso, e que o reproduzem — e
`xr-parede`, que instala a fiação que o jogo perdeu.

**Dois achados que NÃO são novos, e é importante dizer:** o desvio de B3 na
bazuca e nas quatro armas balísticas de BR já existia antes desta rodada. Eles
entram como **vermelho** porque a rodada declarou fechar B3 e não fechou — mas
não como defeito plantado. E **H2** é reprovação por medição inédita, não por
regressão: o painel do pulso já estava a 0,396 m e eu o herdei sem medir.

**O que melhorou de verdade, e merece ser dito com a mesma clareza:** três
correções desta rodada são limpas e sem preço — **a mira no caminho hitscan**
(0,00000 m em 6 armas × 6 distâncias × 8 poses), **o `noSeed` do `cloneRig`**
(determinismo byte a byte, e agora por construção) e **o radial** (que fechou
D1 e D3 juntos, com rearme, histerese e controle negativo, e passou em todas as
mutações que tentei contra ele). O kit de sessão é a quarta, com dois furos
residuais.

---

## 7. Os três mais longe do aceite

1. **B5 · segunda mão** — não existe conceito de segunda mão no jogo. **Sétima
   rodada, trabalho nunca começado.** É um sistema (apoio/punho dianteiro,
   redução medível de recuo), não um ajuste. E agora tem um agravante de
   orçamento: o grip esquerdo, que seria o botão natural do apoio, **acabou de
   ser dado ao agarre**. Fazer B5 exige decidir esse conflito antes de codar.
2. **I1 · vinte minutos, vinte caixas** — **zero caixas em sete rodadas.**
   O kit finalmente está quase pronto (§4), mas nenhuma rodada está validada sem
   um humano de headset, por mais verdes que o resto acumule.
3. **C5 · corpo em primeira pessoa** — agora está medido e reprovado, e o próprio
   autor documentou que a saída **não mora no `xrbody`**: exige um solver que
   encurte a perna ao agachar, porque o modelo do `js/fpbody.js` não encurta. É
   o único vermelho desta lista cuja correção não cabe num arquivo.

---

## 8. O que o dono reclama primeiro

**A mira — de novo, e agora invertida.**

No solo ela ficou **perfeita**: eu disparei 59 tiros em 4 poses e o desvio foi
0,00000 m em todas as distâncias. Se ele pegar o headset e atirar no modo solo,
ele vai sentir a diferença no primeiro pente, e vai ser bom.

**Mas o modo que ele joga é o BR.** Lá, com o fuzil, cada tiro passa **9,1 cm**
ao lado do ponto que a alça indica; com o plasma, **20,0 cm** — e não em uma
distância, em **todas**. Uma cabeça tem 16 cm. Ele vai alinhar a alça no alvo,
apertar, e errar; vai alinhar de novo, apertar, e errar igual. **O erro constante
é mais fácil de compensar na mão do que o erro que anda** (que era o defeito da
rodada passada), então ele pode levar meia partida para nomear o que está
sentindo — mas vai sentir na primeira troca de tiro. E se pegar a bazuca, o
desvio volta a **andar sozinho** entre um tiro e o outro.

**Em segundo lugar, na mesma sessão: a tela ficar preta.** Ele vai encostar numa
parede andando de verdade — todo mundo faz isso nos primeiros dois minutos — e a
vista vai escurecer até o preto total em 1,10 m de separação. É a decisão certa
de projeto e eu a defendo, mas **ele não sabe disso**, e a primeira impressão é
"a tela apagou". Sem um sinal que diga *por quê* (uma silhueta de guardian, um
contorno da parede, um "volte" no chão), o comportamento correto vai ser lido
como bug. E a caixa I1 #4 pergunta, literal, se a parede o para: a resposta
continua sendo não.

Em terceiro, se ele levantar o headset para ajeitar a correia e segurá-lo no
alto por um segundo: ainda trava agachado. O gesto de recentrar resolve — mas
ele precisa saber que resolve.

---

## 9. Quanto falta para "ausência de defeito"

Pela regra do §0 — um vermelho reprova a entrega inteira — **a rodada está
devolvida**, com 7 vermelhos.

O saldo honesto: **26 verdes de 39, 7 vermelhos, 6 medições não feitas**
(B5, C4, D6, G2, I3, I4), mais **8 critérios que só o aparelho ou um humano
fecham** (E1, E3, E4, E5, F1, G4, I1 e a metade humana de G5).

Traduzindo em distância, e com o tamanho de cada coisa:

**Pequeno e localizado (um arquivo, meia tarde cada):**
- **B3 na bazuca** — apagar as três linhas de zeragem de `game.js:2360‑2362` e
  aplicar o mesmo avanço sobre a linha de mira que o hitscan já faz;
- **B3 nas quatro armas de BR** — o ramo `__BR_ballistics` (`game.js:2460`)
  precisa da mesma origem que o hitscan recebeu; é uma linha;
- **os dois guardas do kit** (`abaixoDaTaxa`, `staleMax`) e o `groundAt(…, 999)`;
- **o `grausTexto` do mapa** (`S_XR` no lugar de `PULSO_CV_H`, e o `scale(k)`);
- **um teto para o `fora`**, que hoje cresce sem limite.

**Médio (uma decisão + código):**
- **A6** — as duas causas são conhecidas há três rodadas e não mudaram:
  `city-destruction-client.js` precisa de um gate de `presenting`, e os dois
  `camera.getWorldDirection` de `br-game.js` precisam da mesma fonte única
  (`G.yawDaVista()`) que já consertou o irmão deles;
- **H2** — os painéis precisam sair de 0,378/0,396 m para ≥ 0,45 m, e o mapa
  para ≥ 0,75 m se for para ser lido;
- **E2** — 200,5 calls e 573,2 k triângulos por olho no castelo, contra 180 e
  500 k. **E o número subiu nesta rodada**, então a direção está errada;
- **os três testes falsos** — e este é o item que eu poria antes dos outros,
  porque enquanto eles estiverem verdes ninguém sabe o que mais está quebrado.

**Grande (sistema):**
- **C5** (o rig do corpo), **B5** (a segunda mão), e a **exceção declarada para
  a escolha A6 sobre C2**, que precisa entrar em código como a de A4 entrou.

**Só o dono fecha:** as 20 caixas de I1. O kit está a dois guardas de distância
de poder ser usado para isso.

E uma frase para fechar, porque o padrão desta rodada é diferente do das
anteriores e isso merece registro. **Nas seis rodadas anteriores, a correção
grande abria o defeito seguinte.** Nesta, a correção grande — a mira — está
certa, é a melhor deste porte inteiro, e o que reprova B3 é **o que ela não
alcançou**, não o que ela quebrou. Isso é outro tipo de problema, e é um tipo
melhor: escopo incompleto se fecha; regressão em cadeia, não.

O que continua igual é a outra metade. **Três testes escritos nesta rodada para
guardar os defeitos desta rodada não podem falhar**, e dois deles nasceram
justamente do conserto do teste falso anterior. Sétima rodada, terceira vez que
o guarda novo tem o mesmo vício do guarda velho: **medir contra a fonte que
gerou o dado**. Enquanto a referência independente não entrar (a massa de mira
do modelo, o ponto de impacto real, a chamada de produção contada num assert),
cada rodada verde vai continuar tendo algo atrás.
