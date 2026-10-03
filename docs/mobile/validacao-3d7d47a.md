# Validação do porte para CELULAR — commit `3d7d47a`

Décima rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63), `validacao-4433c4d.md` (46/63),
`validacao-f672d81.md` (46/63). Autor: o **validador** — não escreveu código de
produto nem teste do repo. Nada foi commitado. **A régua não mudou**
(`git diff f672d81 3d7d47a -- docs/mobile/criterio-aaa.md` vazio).

Medido aqui o que entrou depois de `f672d81`: `d369beb` (só o laudo 9),
`e354364` (o carro solto sem o QUIQUE e sem a janela de meio segundo da
decolagem; a parede pela GRADE 3 × 5 do casco) e `3d7d47a` (o totem de fogos
ASSENTA com um pedestal desenhado; a carreta em 4 fatias e as rodas no raio
INSCRITO no polígono desenhado; o curso de argolas na trajetória REAL do disparo).

---

## 0. Condições

- **Árvore:** `dev` em `3d7d47a` (`git log -1` no início e no fim). `git status`
  antes e depois: limpo, e no fim só ESTE arquivo (não rastreado). `npm run lint`
  limpo. sha256 do índice e dos 510 arquivos rastreados em
  `out/r10/arvore-3d7d47a.sha256`, conferido no fim: **idêntico**. Mutantes em
  **cópias** (`copia-r10` para as minhas sondas, `copia-r10c` para os testes do
  construtor; rsync da árvore), restaurados por `sha256` antes de cada um e
  conferidos no fim (`server.js`, `js/maptoys.js`, `js/maptoys-core.js`,
  `js/cannon-core.js` das duas cópias = árvore). Controle da re-triagem da suíte:
  `copia-f672` (`git archive f672d81` + os arquivos ignorados que a árvore tem).
- **Carga:** amostrada a cada 20 s das 23h03 às 02h56 (UTC−3; 700 amostras):
  carga de 1 min **mediana 3,0, p90 3,8, máximo 6,9** (às 01h45, durante os pares
  geométricos de B7, que não dependem de tempo) em 12 núcleos. O outro projeto da
  máquina não fez rajada nesta janela. Cada artefato traz a carga do seu início e
  do seu fim. **O que depende de tempo foi medido com a carga baixa e declarada:**
  segurança no servidor (3,0 → 2,3; mutantes 2,0–2,1), salto do carro (3,9 → 2,6;
  2,3 → 2,4; 2,4), posse (2,4 → 2,6), dois navegadores (2,6), voo do canhão
  (2,2–3,4), boot em 4G (2,8–3,3). A suíte correu sem nenhuma sonda minha ao lado
  (2,3 → 4,0).
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360, V3 844×390; `hasTouch`, `isMobile`,
  DPR 2, `?mobile=1`. Semente 424242 (as 7 saídas do salto: pontos da semente 7,
  como em r7–r9).
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF)
  para tudo o que é do jogador; **dois navegadores** no mesmo servidor para o
  carro solto; o servidor de verdade (`node server.js`) com clientes por socket
  para o helicóptero e o carro solto; o salto pelo carro de verdade da página; o
  bot pelo `clearSight` do `scripts/bots.js`, com a geometria que ele mesmo monta.
- **O servidor medido é o servidor de verdade.** `srv10.js` foi REFEITO a partir
  do `server.js` novo (o briefing pediu): o mesmo arquivo da árvore carregado em
  processo com UMA linha de exportação no fim. Conferido nele que `quiqueDoCarro`
  **não existe**, que `tetoDoAr(ar, agora)` é a parábola só do último pacote
  aceito no chão e que `cantosDoCarro` devolve a grade de **15 pontos** (esportivo:
  comprimento −1,62 / 0 / +1,62 × largura −0,59 … +0,59 a cada 0,295). Ele serve de
  espelho (para escolher casos e para o cliente mentiroso que espelha a regra);
  todo veredito de segurança sai do processo de verdade por socket.
- **Portas:** 3982–3999 para as sondas; 3414–3419 só na re-triagem do
  `xr-controle-anda`; os testes do construtor rodaram na cópia, nas portas deles.
  Nunca a 3000. Antes de cada bloco, `ps` sem `run-tests`/`node --test`/
  `server.js` alheio.
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **`srv10`:** exportar `VV` (um `let` preenchido no boot) por valor dava `null`;
     trocado por uma função que o lê na hora.
  2. **`r10-solo`, 1ª execução:** as variáveis de ambiente das três variantes
     (cidade de pé, destruída, atrações) não chegaram, e as três escreveram a mesma
     saída. Refeito em três chamadas separadas.
  3. **`r10-atracoes`, 1ª execução completa:** (h) o perfil novo estourou o
     `protocolTimeout` (38 mil retas num `play` só) — refeito em lotes; e a 1ª
     versão do perfil (1ª malha × parada da bala na mesma reta) misturava peças (a
     roda na frente da carreta, o relevo) — trocada pela FAIXA da borda por peça
     (§A.3). Os pares (f) dessa execução estão **contaminados**: rodaram depois do
     (e), com o buggy do (e) estacionado encostado no canhão (2,0 m do centro) e o
     cano girado pelo (d); a minha chamada do bot passa `vehicles = null`, então os
     84 "bot vê o tampado" eram o buggy. Refeito em página nova (`SO=f,h`): **0**.
     As seções (a)–(e) dessa execução valem; a (g) também foi refeita em página nova
     (o buggy parado mudava o denominador: 2 832 paradas no canhão contra 3 673).
  4. **`r10-salto`, 1ª execução:** uma das 7 saídas (k = 6, 115 km/h) teve 29 de
     29 pacotes recusados — **inclusive os pacotes no chão**, que a parábola não
     toca: a pose do carro no servidor estava velha. A sonda TELEPORTA o chassi
     antes de cada saída, e o anti-teleporte recusa o motorista até re-ancorar.
     Acrescentei o registro da pose do motorista nos 2 s antes da saída e refiz
     duas vezes: **0 de 221** nas duas (12 `playerUpdate` do motorista antes da
     saída em k = 6). Atribuído ao teleporte da sonda — não provado.
  5. **`r10-atracoes` (e), o carro contra a RODA:** a sonda não entrou no buggy
     (sem N), como em r9.
  6. **`THROTTLE=4`** (CPU do navegador 4× mais lento pelo DevTools): o voo seguiu
     a 55–57 quadros/s nesta máquina — a estrangulação não derrubou a taxa. O voo
     em taxa de celular saiu de **conta pura** (as funções do repo, a ordem de
     integração do `game.js`, `dt` até 0,05), declarado como tal.
  7. **Um parede fina paralela** (o carro solto montado numa parede mais fina que
     o vão entre as linhas da grade): o espelho não achou caso com o caminho livre
     (0 candidatos); sem N no servidor.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `srv10.js`, `r10-seg.js` (privada), `r10-escada-node.js`, `r10-solo.js`,
  `r10-estreitos*.js`, `r10-pilar-node.js`, `r10-salto.js`, `r10-posse.js`,
  `r7-carro.js` (dois navegadores), `r10-atracoes.js`, `r10-argolas-node.mjs`,
  `r10-invis.js`, `r10-boottempo.js`, `bateria-r10.sh`, `boot4g10.sh`, `mut10.py`,
  `cadeia-*10*.sh`, `mut10-testes.sh`. Saídas em `out/r10/` e `out/r10b/`.

---

## 1. Placar

> **46 aprovados · 4 reprovados · 13 não medidos, em 63** (46/70).
> A entrega **não** está aprovada (régua §0, regra 1).

| área | aprovados | reprovados | não medidos | em `f672d81` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | 3 | 1 (P1) | 0 | 3 · 1 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | 4 | 0 | 1 (D2) | 4 · 0 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Nenhum critério mudou de cor.** As duas correções desta leva fecharam o que o
laudo 9 pediu nos itens 1, 2 e 4 do §6 (o [NC] 1 de r9 — o pairar por quiques —,
o resíduo do pilar do saguão na direção que ele foi medido, a fresta sob o totem
e as quinas do canhão) e a observação (d) (o curso de argolas não completava) —
nenhum desses reprovava critério.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando — a régua §8 lista
sete.

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), D6 ✓, E10 ✓, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Defeitos NOVOS nascidos das correções desta leva: 2** (§4, [NC] 1–2; os dois
baixos, os dois do curso de argolas, os dois em código antigo que a correção
tornou alcançável; **nenhum de segurança**). Em `f672d81`: 2; em `4433c4d`: 2; em
`a9a4ffd`: 3; em `afb1ae8`: 4.

`test/security-regression.test.js`: **38/38**.

**Suíte completa** (`npm test`, sem sonda minha ao lado, carga 2,3 → 4,0,
65,6 min): **2 619 testes, 2 569 passaram, 0 falharam, 47 cancelados, 3
pulados**. O runner re-rodou 4 arquivos isolados: `enemy-drawcalls`,
`xr-b7-origem` e `xr-parede` → **flake** (2 passes seguidos); `xr-controle-anda`
→ **"REGRESSÃO REAL"** (3 isolados seguidos falharam). Linha final do runner: "1
regressão(ões) real(is): xr-controle-anda.test.js", `EXIT 1`; `ps` vazio de
`run-tests` antes de ler o placar.
**Re-triagem (minha):** o sintoma é um só — o `before` não termina porque o
`bootGame` espera 90 s por `window.__game && window.__MP` e estoura (num bloco
diferente a cada execução). Três isolados a mais (00h16–00h23, carga 3,0–4,2):
falham do mesmo jeito. Controle alternado na MESMA porta com `f672d81` (`git
archive`): o 1º controle (sem os arquivos ignorados — mais leve, controle
injusto, declarado) passa e a árvore falha mais uma vez (00h24); depois de copiar
os 8 arquivos ignorados para o controle, a árvore passa **32/32 três vezes
seguidas** (00h29, 00h33, 00h35), alternada com `f672d81` 32/32. O boot em VR
(`bootEmVR`) alternado N = 5: árvore 3,60–3,85 s × `f672d81` 3,33–3,86 s. Nada do
caminho de VR mudou nesta leva (o diff toca o carro solto no `server.js`, o
`maptoys` e o `cannon-core`), e a suíte do orquestrador no MESMO commit (23h00)
passou o arquivo. **Veredito: flake de boot** (uma janela de ~15 min em que o
boot passou de 90 s), não regressão — mas o runner disse REGRESSÃO REAL e saiu
com `EXIT 1`, e isso fica escrito aqui.

---

## A. Os quatro itens do briefing, um por um

1. **Segurança — o detalhe está fora do repo; aqui só o que fecha e o que segue.**
   *(a) O [NC] 1 de r9 (pairar por quiques): FECHOU.* Servidor de verdade, o mesmo
   ensaio de r9: o carro solto "parado no ar" depois de uma decolagem forte tem
   **30 de 101** pacotes repassados, o último aos 2,9 s (r9: 86 de 101 até os
   10 s); o cliente que espelha a regra NOVA e nunca desce perto do chão: **30 de
   105** nas duas alturas (r9: 94 e 98). Mutante `QUIQUEvolta` (o teto e o quique
   de `f672d81` de volta; a grade fica): **86 de 101** — o número de r9. O teste
   novo do construtor exercita o caso de verdade e avermelha com o mutante (§5).
   *(b) O vizinho que sobrou:* existe e **não nasceu agora** — é a soma dos dois
   resíduos que o briefing declarou não mexidos (detalhe **fora do repo**;
   média-baixa, a mesma do [NC] 1 de r9).
   *(c) A grade 3 × 5:* **a porta da Torre FECHOU** (igual a r9: o centro na beira
   do vão, o caso de r8, 0 pacotes dentro; o carro centrado entra; lajes 0 de 4).
   **O pilar do saguão FECHOU no caso medido em r9** (o carro alinhado ao pilar,
   o centro 5 cm ao lado: não atravessa; mutante `CANTOS`, os 5 pontos de r9:
   atravessa, 4 de 6). A grade fecha o caso de r9 mas não a família inteira —
   resíduo do método, que **não nasceu agora** (a grade é estritamente mais densa
   que os cantos); detalhe **fora do repo**, baixa.
   *(d) Os dois resíduos antigos que o briefing não mexeu: SEGUEM* (os mesmos
   números de r9; fora do repo).
   *(e) Piloto a pé (regressão):* servidor de verdade, os 13 pontos de r9 — **a pé
   em 13 de 13**; Node: escada da Torre **0 de 30 175**, toda plataforma pisável
   **0 de 29 905**, cidade destruída nos dois lados **0 de 10 358** (= r9).
2. **O carro LEGÍTIMO sem o quique: 0 recusas — confirmado no código real.**
   `r10-salto`, os MESMOS 7 pontos e rumos de r7–r9, três execuções: **0 de 221**
   pacotes recusados na 2ª e na 3ª (na 1ª, 29 numa saída — o teleporte da sonda,
   §0, item 4). O carro de 118 km/h sai a 8,18 m do chão e chega a 0,03 m da
   física; fim a 0,04–0,36 m nas 7. O que r9 mediu com o mutante `SEMquique` (0)
   vale no código real. **A grade não recusa o honesto:** a caixa FÍSICA de cada
   carro no cliente (`js/car.js`: buggy 1,80 × 0,85, esportivo 1,90 × 0,88,
   caminhão 2,70 × 1,05 de meia-medida) contém a grade com ≥ 0,17 m de folga, e os
   pontos novos ficam dentro do retângulo dos cantos de r9 (conta, não medida); e
   medido: **posse** (8 ciclos pelo toque) — o `solto` do tique da saída aceito em
   **7 de 7** saídas com o carro andando (a do 2º ciclo saiu a 0,8 km/h: sem janela
   por projeto); **dois navegadores** — **109 de 109** `solto` aceitos (esportivo a
   118, 88 e 61 km/h; buggy a 59), o outro navegador desenha o carro parado a
   **0,10–0,30 m** da física de quem dirigia (r9: 0,09–1,61), maior buraco de
   `playerUpdate` **0,12 s**, B entra no 1º toque (1 de 1 que a minha sonda levou
   até o carro), A volta a entrar 4 de 4.
3. **Atrações — o totem e as quinas FECHARAM; o curso completa; o recorde não é
   gravado como foi feito.** Partida BR `?mobile=1`, toque; âncora = a MALHA
   desenhada nomeada.
   - *Paridade:* **32 caixas no cliente × 32 no bot** (painel 1, totem 1, carreta
     4 × 5, rodas 2 × 5), diferença 0, mesmas marcas.
   - *(a) O totem:* o desenho (5 malhas `totemFogos`, o pedestal incluído) é a
     caixa: **diferença 0** nas seis faces (r9: a caixa 0,44 m abaixo da base
     desenhada). A base desenhada fica 0,30–0,55 m abaixo do chão nas 4 quinas.
     Bala parando no ar rente (retas aleatórias, as de r9): **0 de 6 009** (r9: 71).
     Perfil da borda em 7 alturas, de 0,3 m abaixo da base ao topo: **0** retas em
     que a caixa sai do desenho e **0** em que a bala atravessa o desenho.
     Mutante `SEMpedestal`: **71 de 6 009**, todas abaixo da base (o número de r9).
   - *(b) O canhão:* **perfil da FAIXA da borda** — para cada azimute (passo 0,5°)
     e altura, a maior distância ao eixo em que a reta ainda pega a malha da peça
     × a maior em que ainda pega uma caixa de bala dessa peça. Carreta, 8 alturas,
     11 520 retas; rodas, no plano de cada roda, 2 880: **a caixa sai do desenho
     em 0** (r9: as quinas, até 2,2 cm). Em troca, a bala atravessa uma faixa da
     borda desenhada — por construção, porque a caixa fica DENTRO do desenho:
     carreta **mediana 2,2–5,8 cm, máximo 11,2 cm** (embaixo da fatia mais baixa,
     onde o tronco de cone alarga); rodas **mediana 1,4 cm, máximo 3,7 cm** (r9: a
     borda de baixo da carreta até 20 cm). Bala parando no ar rente (página nova):
     **0 de 3 673** (r9: 12 de 3 668).
   - *(c) Pares "a tela tampa e a bala passa"* (os mesmos 600 por peça de r9,
     página nova): **totem: 434 → 0** (= r9); **canhão: 364 → 158** (r9: 154):
     o **cano** em 141 (= r9; fica de fora por decisão), o **aro dourado** das
     rodas em 10 (r9: 8; não mexido) e a **faixa da borda** da carreta/roda em 5
     (r9: 3) + 2 em que a outra ponta só tem o feixe translúcido do farol (erro da
     minha âncora, como em r9). Os +4 são o custo previsto da caixa menor: a faixa
     que a bala atravessa ficou mais estreita (≤ 11 cm) mas existe em toda a volta.
     **O bot** vê **0** dos pares que o cliente tampa (totem 600; canhão 312) e não
     é cego em nenhum que o cliente vê (0 de 288).
   - *(d) O voo pelo canhão e as argolas:* o alcance da trajetória real é 54,2 m e
     as 5 argolas ficam de 10 a 45 m. **Do centro: CURSO COMPLETO, 5 de 5** (r9: 3
     de 5) — "💫 CURSO COMPLETO 1.8s — RECORDE!". **O recorde é gravado
     arredondado:** na memória 1,80 s; no `localStorage`, `"2"`; o que o
     carregamento lê depois de recarregar é **2,0 s** — [NC] 1. **Da borda** (1,7 m
     do centro): 4 de 5 — e o curso fica preso na 5ª argola: o disparo seguinte, do
     centro, "completou" passando só a 5ª, em **6,3 s** (o tempo somado dos dois
     voos) — [NC] 2. **A 4 m do centro** (ainda dentro do alcance do USAR, 4,6 m):
     1 de 5 (observação: o disparo não puxa o jogador para o cano). **Em taxa de
     celular** (conta pura, as funções do repo na ordem do `game.js`): a 30, 24 e
     20 quadros/s o voo passa 0,12–0,97 m abaixo dos centros (raio 2,6 m), 5 de 5
     nas três; no jogo, 55–60 quadros/s medidos (com e sem CPU 4× mais lento).
     Mutante `ARGOLASideal` (a balística ideal de `f672d81`): **3 de 5** nos 4
     disparos (= r9).
4. **O avesso — o carro bate, o jogador entra e é disparado, o totem não prende.**
   - *O carro* (buggy pelo USAR, polegar no talo): a 41 km/h contra o totem para
     sem cruzar (centro do chassi a 2,16 m do centro do totem); a 61 km/h contra a
     carreta para encostado nela (2,04 m do centro), sem cruzar (= r9). Contra a
     RODA: sem N (§0, item 5).
   - *O jogador:* contra o totem, pelo polegar nos 4 lados, para a **0,42 m** (o
     raio) em 4 de 4; posto dentro do totem, sai a 0,42 m e anda 6,8 m (não fica
     preso); **entra no canhão** (passa a 0,16 m do centro e sai do outro lado, 2
     de 2); **disparado em 4 de 4** tentativas pelo USAR.
   - *O bot:* não colide com parede andando (as paredes são só da visada); parado
     dentro do totem, o olho fica dentro de parede e ele fica cego
     (`eyeInsideWall`), como em qualquer construção — lido no código, não medido no
     caminho real.
   - *O servidor:* as peças do canhão (só de bala) ficam fora do corpo do carro
     solto, e o carro do cliente bate nelas — divergência permissiva, baixa;
     detalhe fora do repo.

*O [NC] 2 de r8 (agachado atrás de poste), não consertado de propósito:* remedido
(`r10-invis`, os mesmos 18 615 pares): **16** pares de poste com a silhueta fora da
tela e a vítima aceitando — **igual a r9**; no total, 38 (= r9).

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente,
com a rocha, o modelo do vulcão e o painel conferidos como carregados e
`cidade: false`; à parte, a TELA (`Oclusao`) e a malha do relevo desenhado.

### 2a. Caminho real
**Não refeito.** O bot (`scripts/bots.js`) não mudou; o que mudou para ele é a
geometria do canhão (15 → 30 caixas), medida em pares (§A.3 e 2b). A arena de r7
(0 / 0 / 0 / 0 em 52 válidos; mutante 376 disparos em 39 de 39) segue sendo a
medida do caminho real.

### 2b. Pares geométricos
`r10-invis`, os mesmos 18 615 pares de r6–r9: **o cliente tampa 10 312, o bot vê
1** (o mesmo par de caminhão de r6, determinístico); **bot cego onde o cliente vê:
0 de 8 629**; a malha do relevo barra e a bala passa: 0. Diferença para r9 em 7
números, todos de ±1 em pares de veículo (aleatórios). **Atrações** (§A.3, 1 200
pares dirigidos): o bot vê 0 dos tampados, cego 0.

### 2c. A tela e a regra da vítima
"A tela não mostra nada e a vítima aceita" (silhueta): **38** (= r9), dos quais
16 atrás de poste (o [NC] 2 de r8, igual).

### 2d. Veredito de B7
**◌ — igual a r9.** Os pares e as atrações passam, o tipo que reprovou em r6 segue
passando (arena de r7), e as duas razões de `d381d29` continuam: a "virada" pela
letra (redação com o dono) e o avesso (9) sem N no caminho real.

---

## 3. Veredito por critério (com a comparação com `f672d81`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 px / 0,00 cm a 10, 25 e 50 m** em todos os casos — idêntico a r9 campo a campo (`cmp10`: 0 diferenças em M1). Bazuca: idêntica a r9. |
| **M2** | ✓ | ✓ | Fuzil 720 m/s medidos → 7,9 cm a 100 m; DMR 800 → 5,3 cm; sniper 850 → 5,2 cm (ruído de ±5 m/s, como em r7–r9). |
| **M3**–**M5** | ✓ | ✓ | `mira.js` V3: os mesmos números de r9 (0 diferenças fora do M2). |
| **M6** | ✓ | ✓ | `m6b`: idêntico a r9 (a fase do espectador ao fim da sonda é cronologia, não leitura). |
| **M7** | ✓ | ✓ | `r3-toque`, `r3-m7c`: iguais a r9 dentro do ruído; (c) diferença **0,00** entre ~31 e ~61 quadros/s. |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Iguais a r9. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 do automático**; controle positivo 93 (r9: 92). As caixas do canhão continuam dentro do `rayBlockedAt` que a assistência consulta: só mais estrito. |
| **A3**, **A4** | ✓ | ✓ | `assist.js`: iguais a r9. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (c: erro com/sem **3,44°/4,34°** a 10 m e **3,64°/4,34°** a 20 m — iguais); (d) segue em conflito com A2. |
| **A6**, **A7** | ✓ | ✓ | Iguais a r9; `security-regression` **38/38**. |
| **A8** | ✓ | ✓ | Padrão desligado; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | Não remedido (código intocado): (e) três dedos em 0,5 s, 1,82 m < 2 m. |
| **C2** | ✓ | ✓ | `hud.js` V1 e V3: idênticos a r9 (0 diferenças). |
| **C3** | ◌ | ◌ | Igual: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque. |
| **C5** | ✓ | ✓ | `c5real`: idêntico a r9 (0 diferenças). |
| **C6** | ✓ | ✓ | Idêntico a r9. |
| **C7**–**C9** | ✓ | ✓ | Não remedidos fora do percurso (código intocado). |
| **C10** | ✓ | ✓ | Toque real: carro anda **5,18 m no 1º s**, pente 28 → 28; sair: 0 m, nada preso (= r9). |
| **C11** | ✗ | ✗ | Não remedido (código intocado). |
| **C12** | ✓ | ✓ | `r3-retic`: os casos parados idênticos a r9. O golem (que anda) teve a grama entre os dois em 29 de 30 quadros (motivo `grama`; em r9, `inimigo`) — a sonda só conta os pixels no 1º quadro, então não há N para dizer se a tela o mostrava; como em r8. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1**, **B2** | ✓ | ✓ | Não remedidos: o bot, o tiro do servidor e o caminho da arena não mudaram. |
| **B3** | ◌ | ◌ | Igual a r9. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ◌ | ◌ | Pares: **1 de 10 312** tampados vistos (o par de caminhão de sempre, veículo); **cego 0 de 8 629**. A arena do disparo dentro da janela de reação não foi refeita (bot intocado); segue a proposta de redação de r7. |
| **B7** | ◌ | ◌ | §2. Atrações: o bot vê 0 dos tampados, cego 0 (§A.3). |
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos (código do bot intocado). |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido (o mesmo de B1/B2). |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes, 45 s cada: **962 golpes, 0 através** (r9: 1 007). Torre Nexus, 10 pontos da escada: **547 golpes, 0 através** (r9: 504). |
| **P3** | ✓ | ✓ | Piloto LEGÍTIMO a ≥ 3 m: **0** com `heli = false` na grade de 2 m da cidade de pé e da destruída, 0 no castelo, nas torres e no vulcão (= r9); a pé no servidor de verdade nos 13 pontos (§A.1e). PvE (`r3-heli`): voando **0** golpes, pousado dentro 0; a pé 741. Resíduo: a faixa de 0,45 m acima de peça de corpo (totem 25 colunas, painel 36, tocos 271 — = r9). |
| **P4** | ✓ | ✓ | (a) 0 travessias (`r3-parede`, `r3-predio`). (b) os vãos de construção de sempre + caixas do CANHÃO, que a sonda conta como base suspensa: agora 24 no total (r9: 19); a diferença são fatias novas da carreta — é a única geometria que mudou entre as rodadas. Observação, não reprovação: P4 é "prédio". |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | `r4-v1` e `r4-v1-hitscan`: iguais a r9 fora de ids e do ruído de ±1 px/±1 quadro — **(a)** atrás do caminhão: fuzil, DMR e bazuca dão 0 px no alvo e 0 `shotHit` nele; controle com pixels e acertos; hitscan: controle 112 px, 104 de dano (r9: 111 px, 130). **(b)** arena de r7, não refeita (bot intocado). **(c)** vítima atrás do caminhão: 100; controle 48. **(d)** rajada de 100 em 0 s, igual; `security-regression` 38/38. **(e)** a reta fica livre no MESMO quadro da queima; explosão 5,05 s depois da queima (r9: 5,04). |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **232 draw calls p50** (máx. 256, mundo de 23 s) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 369: 0 `Object3D`. |
| **D4** | ✓ | ✓ | `desemp`: desktop × `?mobile=1` **iguais** (0 diferenças fora do D2). |
| **D5** | ✓ | ✓ | Não remedido (o laço dos bots não mudou; o canhão é +15 caixas na consulta: `r5-poda` 1 162 → 1 177 paredes, as mesmas 108 diferenças de poda do caso controle). |
| **D6** | ✓ | ✓ | `boot4g` (9 Mbps / 40 ms, V3, cache desligado, servidor novo a cada vez), **N = 5**, carga 2,8–3,3: total **11,14 MB** (11 138 660–11 138 935 B, 220 req., 17,0–17,1 s); menu jogável **3,10 MB** (4,3–4,4 s) em 4 das 5 e 3,51 MB (4,6 s) na 1ª; arma pronta **3,24 MB** (3,68 na 1ª). Limiar 15,03 / 5,25. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave, queda, pouso — iguais a r9. |
| **E4**, **E5** | ◌ | ◌ | Igual: chegar ao carro/helicóptero só pelo toque, a partir da nave, não completado. |
| **E6**–**E8** | ✓ | ✓ | Iguais a r9 (`estados-e7` estourou os 25 min, como em r7–r9). |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). A pausa em si: ✓. |
| **E10** | ✓ | ✓ | Retrato na pausa, nada preso. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; 0 `pageerror` no que foi percorrido (inclusive nas páginas das atrações, do voo, da posse e dos dois navegadores). |
| **E15** | ✓ | ✓ | V2 e V1: pouso a 0,2 m do baú; 1º toque abre e o item entra; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque, anda 23 m, sai no 1º toque, nada preso. |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `3d7d47a`, baixa; código antigo que a correção tornou alcançável] O
   recorde do curso de argolas é gravado arredondado a segundo inteiro.**
   `js/maptoys.js`: `saveNum` grava `Math.round(v)` (feito para o placar inteiro
   da galeria) e o curso usa o mesmo para o TEMPO. Do centro, o curso dura 1,80 s:
   na memória 1,80, no `localStorage` `"2"`, e o `loadNum` devolve 2 depois de
   recarregar — o recorde exibido passa a ser **2,0 s**, um tempo que ninguém fez,
   e a 1ª volta de cada sessão (1,8 s < 2) é anunciada de novo como "RECORDE" (esta
   última parte é leitura do código: `rec = best === 0 || time < best`). Antes
   desta leva o curso nunca completava, então nada era gravado. O teste do
   construtor confere só `best > 0`.
2. **[NC — `3d7d47a`, baixa; mesma natureza] O curso não reinicia ao pousar.** Um
   voo que passa 4 argolas e perde a 5ª (da borda do canhão, a 1,7 m do centro)
   deixa o curso esperando a 5ª; o voo seguinte "completa" passando SÓ a 5ª, com o
   tempo somado dos dois voos — medido: "💫 6.3s · recorde 1.8s", e as argolas 1–4
   do 2º voo não contam. O reinício só acontece a mais de 140 m da 1ª argola, e o
   voo pousa a ~54 m. Antes, preso na 4ª (inalcançável), nunca completava.
3. **Segurança — carro solto** (o vizinho que sobrou depois do [NC] 1 de r9 e o
   resíduo da grade): não nasceram nesta leva. Detalhe **fora do repo**.
4. **O canhão ainda mostra o que a bala atravessa** (correção que não fechou tudo,
   por decisão e por construção): 158 de 364 pares — o cano (141, decisão: gira),
   o aro dourado (10, não mexido nesta leva) e uma faixa da borda da carreta e das
   rodas (5) que a caixa inscrita deixa de fora: até 11,2 cm embaixo da carreta,
   2–6 cm no resto, ≤ 3,7 cm nas rodas. Antes: 154, com a borda de baixo até 20 cm.
5. **Faixa de 0,45 m acima de peça de corpo** (observação 7 de r8): igual a r9
   (totem 25 colunas, painel 36, tocos da cidade destruída 271).
6. **Agachado atrás de poste** ([NC] 2 de r8): igual a r9 (16).
7. Inalterados: **P1**, **C11**, **C1(e)**, **E9**.

**Observações sem veredito:** (a) **a beira da saia do vulcão segue muralha** e
(c) **o carro segue no relevo dentro da rocha do vulcão** enquanto alguém dirige —
não remedidos (código intocado); (d) de r9, **o curso de argolas não completa
pelo canhão — SAI** (5 de 5 do centro); nova: **o disparo não puxa o jogador para
o cano** — o curso completa do centro, a 1,7 m dele passa 4 de 5 e a 4 m (dentro
do alcance do USAR) 1 de 5; (e) **o gzip quase não reduz a bazuca** (−4 %),
inalterado; (f) P4(b): o canhão sobre a encosta aparece como base suspensa (agora
em mais fatias); não é prédio; (g) o runner da suíte chamou de "REGRESSÃO REAL" um
flake de boot de VR (§1).

**Contagem:** 4 critérios reprovados (os mesmos de r9); **0 nasceu de correção
desta rodada**; **2 defeitos novos nasceram de correções** (itens 1–2; nenhum de
segurança); **1 correção não fechou tudo** (item 4, por decisão e por construção).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| o quique e a janela de meio segundo de volta (`QUIQUEvolta`) | servidor: o carro "parado no ar" depois da decolagem forte, **86 de 101** repassados (árvore 30) | `veiculo-vida-servidor`: **1 vermelho em 17** (o caso novo da decolagem forte); `carro-solto`: 0 |
| a grade volta a ser os 5 pontos de r9 (`CANTOS`) | pilar do saguão (o caso de r9): **atravessa, 4 de 6** (árvore: não atravessa) | `veiculo-vida-servidor`: **1 vermelho** (o pilar) |
| grade 9 × 5 (prova de CAUSA do resíduo da grade, não defeito) | o resíduo da grade some (detalhe fora do repo) | não rodado |
| sem o pedestal desenhado (`SEMpedestal`) | bala parando no ar debaixo do totem **71 de 6 009** (árvore 0); o desenho 0,44 m acima da caixa | `atracoes-bala`: **1 vermelho** (por baixo, rente ao chão) |
| os fatores de círculo de volta (`CIRCULO`) | a caixa SAI do desenho em até **2,4 cm** (168 retas na carreta; rodas 1,4 cm); bala parando no ar **18 de 3 733** (árvore 0 de 3 673) | `atracoes-bala`: **1 vermelho** (carreta, rente) |
| a carreta numa fatia só (`UMAfatia`) | a faixa da borda que a bala atravessa vai a **25,5 cm** (árvore 11,2) | **0 vermelhos** (8/8) |
| as argolas pela balística ideal (`ARGOLASideal`) | **3 de 5** nos 4 disparos (árvore: 5 de 5 do centro) | `maptoys`: **1 vermelho** ("PRODUTO: ser disparado pelo canhão atravessa o curso"); `cannon-core`: 0 |

Controle (cópia = árvore): `veiculo-vida-servidor` 17/17, `carro-solto` 3/3,
`atracoes-bala` 8/8, `maptoys` 11/11, `cannon-core` 12/12.

**Todo mutante avermelha alguma sonda minha; um não avermelha nenhum teste do
construtor (`UMAfatia`).** O que os testes não medem, e que esta rodada achou:

- **A largura da faixa que a bala atravessa** (`UMAfatia`): o teste mede o miolo
  (alturas 30–70 %, até 70 % da borda) e a reta 1 cm POR FORA — não a reta 1 cm
  por DENTRO da borda. Com uma fatia só a borda de baixo volta aos 20+ cm de r9 e
  ninguém vê.
- **O recorde gravado e o curso preso** ([NC] 1–2): o teste do curso confere
  `best > 0` na memória, num voo só, sem recarregar.
- **O vizinho do carro solto e o resíduo da grade:** nenhum teste exercita os
  casos (detalhe fora do repo).
- **As minhas sondas erraram, e está no §0.**

---

## 6. Prioridade

1. **Segurança do carro solto** (fora do repo): o vizinho que sobrou do [NC] 1 de
   r9 e o resíduo da grade — os dois anteriores a esta leva, os dois sem teste.
2. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
3. **[NC] 1–2 — o curso de argolas** (recorde arredondado; curso preso depois de
   um voo incompleto): baixos e baratos.
4. **Item 4 — o canhão** (o aro dourado é consertável; o cano é decisão; a faixa
   da borda é o preço da caixa inscrita) e o teste que não mede a faixa por dentro.
5. **[NC] 2 de r8** — o avesso na tela (poste).
6. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
