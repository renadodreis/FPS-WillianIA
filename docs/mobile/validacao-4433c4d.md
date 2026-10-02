# Validação do porte para CELULAR — commit `4433c4d`

Oitava rodada de validação independente contra `docs/mobile/criterio-aaa.md`.
Laudos anteriores: `validacao-7515734.md` (12/53), `validacao-6aeda6c.md`
(32/53), `validacao-070502f.md` (42/62), `validacao-2224bf5.md` (44/63),
`validacao-d381d29.md` (43/63), `validacao-afb1ae8.md` (45/63),
`validacao-a9a4ffd.md` (44/63). Autor: o **validador** — não escreveu código de
produto nem teste do repo. Nada foi commitado. **A régua não mudou.**

Medido aqui o que entrou depois de `a9a4ffd`: `1f6cc8b` (o servidor conhece o
chão que SUSTENTA — `superficieSob`, castelo e torres de vigia, acabamento fora;
o carro solto pela parábola, lajes no corpo dele, janela só para quem dirigiu),
`f5dc7c7` (o relevo da bala é exato — `retaNoRelevo`), `8c19d8a` (a vítima testa
os pontos que o atirador vê; a posse sai depois do `state`), `fafbf3a` (modelos
3D em gzip no fio) e `4433c4d` (só teste).

---

## 0. Condições

- **Árvore:** `dev` em `4433c4d` (`git log -1` no início e no fim). `git status`
  antes e depois: limpo, e no fim só ESTE arquivo (não rastreado). `npm run lint`
  limpo. sha256 do índice e dos arquivos medidos em
  `out/r8/arvore-4433c4d.sha256`. Mutantes em **cópias** (`copia-r8`,
  `copia-r8b`, `copia-r8c`, rsync da árvore; as duas últimas, idênticas, só para
  correr em paralelo, apagadas no fim), restaurados por `sha256` antes de cada um; `copia-r8dbg` é o servidor com log do motivo de cada recusa do carro
  solto (diagnóstico, não mutante).
- **Carga:** amostrada a cada 20 s das 12h01 às 15h00 (UTC−3; 537 amostras):
  carga de 1 min **mediana 3,7, p90 14,6, máximo 29,2** em 12 núcleos. As rajadas
  acima de ~10 são de OUTRO projeto (vitest + postgres; não toquei nele) somadas
  às minhas sondas em paralelo. Cada artefato traz a carga do seu início. **O que
  depende de tempo foi medido com a carga baixa e declarada**: salto do carro
  (2,6), posse (3,3), boot em 4G (4,3–4,8; os bytes não dependem da carga),
  custo do `rayBlockedAt` (2,3–2,6), e a suíte correu sem nenhuma sonda minha ao lado (mediana 3,4, p90 7,7, picos
  do outro projeto até 29). Os `server.js` que aparecem como "alheios" nos
  artefatos são os das minhas próprias sondas (pelo caminho do repo); nenhum
  processo de teste de outra frente apareceu. Dois itens da bateria que mudaram
  sob carga foram refeitos isolados (§0, correções 6 e 7).
- **GPU:** Chrome headless, ANGLE sobre RTX 3050. Tempo de frame não medido.
- **Viewports:** V1 667×375, V2 800×360, V3 844×390; `hasTouch`, `isMobile`,
  DPR 2, `?mobile=1`. Semente 424242.
- **Caminho real:** toque do DevTools (`Input.dispatchTouchEvent`, laço no rAF)
  para tudo o que é do jogador; **dois navegadores** no mesmo servidor para o
  carro solto (`r8-carro`); o servidor de verdade (`node server.js`) com
  clientes por socket para o helicóptero e o carro solto; o salto pelo carro de
  verdade da página.
- **O servidor medido é o servidor de verdade** (o briefing apontou que a minha
  réplica `solo7.js` ficou velha — aposentada). Dois caminhos: (i) o processo
  (`node server.js`) por socket; (ii) para as varreduras, o MESMO `server.js` da
  árvore carregado em processo com uma única linha de exportação no fim
  (`srv8.js`: `heliNoAr` e `superficieSob` reais). Paridade (i)×(ii): **22 de 22
  pontos** iguais (14 do P3, 8 da sonda de segurança). Prova extra: com o mutante
  `COLUNA` (a semântica de `a9a4ffd`) o (ii) dá exatamente os números de r7
  (152 e 54 na grade da cidade).
- **Portas:** 3966–3999 para as sondas; os testes do construtor rodaram só nas
  cópias, nas portas deles (4120–4161 e `PORT=0`). Nunca a 3000.
- **Correções das MINHAS sondas nesta rodada — todas medidas e declaradas:**
  1. **`r8-invis`, 1ª execução, sem `cidade: false`**: a âncora nova (Raycaster
     do three no `terrainMesh`) deixou a sonda com ~7 min, e aos 90 s a cidade
     caiu no meio dela (CLAUDE.md avisa): 368 "violações" e 3 922 "bot cego"
     falsos, todos na cidade. Descartada e refeita (v2) e refeita com o rótulo
     do "parou no ar" detalhado (v3).
  2. **`r8-posse`, 1ª versão**: a chave do `state` era a pos com 4 casas —
     parado, dois `state` seguidos tinham a mesma chave, e o "solto do tique da
     saída aceito 5 de 8" era de OUTRO pacote. Refeita com chave exata e única
     (a sonda soma seq·1e-6 m ao x de cada `state`).
  3. **`r8-seg`, salto falso**: começava com passo horizontal mínimo e o
     `solto.t` velho — a decolagem saía com vy0 ≈ 0,5 m/s (0 de 28). Refeito em
     `r8-seg-b` (5 pacotes no chão a 25 m/s antes de decolar).
  4. **`r8-seg-b`, pouso em cima de telhado**: a parábola passou do telhado da
     cabana — sem N (fora do repo).
  5. **`r8-vitima`**: as leituras "vida 88" (6) e "36" (1) são o golpe de
     esqueleto (12, o `MELEE_DMG`), como em r7; nos 88 a bala e a tela estavam
     tampadas (os tiros foram recusados).
  6. **D4 na bateria (`desemp.js`) deu "diferente"** (21 × 22 sítios): o retrato
     lê `Structures.sites` AO VIVO, e o mercado/refúgio entram nele quando o GLB
     deles chega — com o gzip a ordem de chegada mudou e um navegador tinha o
     mercado e o outro não. Refeito em `d4b.js` esperando a lista assentar:
     **igual em 2 de 2 pares** (23 × 23; mercado e refúgio entram aos 2,9–3,6 s
     nos dois).
  7. **E9 na bateria (`estados.js`, carga 13,5) não pausou** — e nessa execução
     o roteiro tinha deixado o jogador a 7 m do helicóptero. Isolado (carga 3,2):
     **pausa ✓** (igual a r7); e o jogador posto a 4, 7, 12 e 40 m do helicóptero (`r8-pausa-heli`, carga 4,7): **pausa em 12 de 12**. Flake de carga, não regressão.
  8. **`r8-carro` (dois navegadores)**: em 2 das 3 tentativas o andar da MINHA
     sonda pelo polegar não levou B até o carro (parou a 35 e 67 m dele); B
     desenhava o carro a 1,07 e 0,10 m da física de A. Só a 1ª tentativa vale
     para "B entra".
  9. **O teste `modelos-gzip` do construtor falha na minha cópia** (1 de 5): ele
     lista os modelos por `git ls-files`, e a cópia não tem `.git`. Refeito com
     `GIT_DIR` da árvore (só leitura): 5 de 5 na cópia sem mutante.
- **Sondas** (fora do repo, em
  `/tmp/claude-1000/-home-reis-repos-FPS-WillianIA/5d35f60f-a978-4c04-b28f-9aeed55e84f5/scratchpad/validacao/`):
  `srv8.js` (o servidor em processo), `r8-solo.js`, `r8-escada-node.js`,
  `r8-p3b.js`, `r8-seg.js` e `r8-seg-b.js` (privadas), `r8-salto.js`,
  `r8-posse.js`, `r8-vitima.js`, `r8-invis.js`, `r8-gzip.js`, `boot4g8.sh`,
  `d4b.js`, `r8-pausa-heli.js`, `r7-carro.js` (dois navegadores),
  `bateria-r8.sh` (as de sempre), `mut8.py`, `cadeia-mut8-*.sh`,
  `mut8-testes.sh`, `cmp8.py`. Saídas em `out/r8/` e `out/r8b/`.

---

## 1. Placar

> **46 aprovados · 4 reprovados · 13 não medidos, em 63** (46/70).
> A entrega **não** está aprovada (régua §0, regra 1).


| área | aprovados | reprovados | não medidos | em `a9a4ffd` |
|---|--:|--:|--:|---|
| M — mira (7) | 7 | 0 | 0 | 7 · 0 · 0 |
| A — assistência (8) | 7 | 0 | 1 (A5) | 7 · 0 · 1 |
| C — controles/HUD (12) | 9 | 2 (C1, C11) | 1 (C3) | 9 · 2 · 1 |
| B — bots (13) | 7 | 0 | 6 (B3, B4, B5, B6, B7, B9) | 7 · 0 · 6 |
| P — PvE (4) | **3** | 1 (P1) | 0 | 2 · 2 · 0 |
| V — veículo (1) | 1 | 0 | 0 | 1 · 0 · 0 |
| D — desempenho (5) | **4** | 0 | 1 (D2) | 3 · 1 · 1 |
| E — estados (13) | 8 | 1 (E9) | 4 (E4, E5, E11, E12) | 8 · 1 · 4 |

**Mudaram de cor: P3 (✗ → ✓) e D6 (✗ → ✓).**
- **P3**: o piloto LEGÍTIMO deixou de perder o `heli` debaixo de acabamento — no
  servidor de verdade, debaixo da cobertura do lote#5 a 3 m do chão do cliente,
  **`heli = true` em 4 de 4** (r7: false em 4 de 4); na grade de 2 m da cidade,
  **3 e 2** pontos a 0,55 e a 3 m (r7: 152 e 54), e **0 a 3 m** quando a pose é
  a que o próprio cliente aceita para o helicóptero. Resíduo (observação, não
  nasceu agora): faixa de 0,45 m logo acima do topo de peça de CORPO que não é
  piso do cliente — §A.1(a).
- **D6**: os modelos em gzip levaram o boot em 4G de **16,97 para 11,14 MB**
  (N = 5, 11 138 493–11 138 881 B), abaixo de 15,03; a arma pronta com
  **3,51–4,03 MB** (≤ 5,25) — §A.5.

Aparelho/humano (A9, B13, D1, D7, D8, E13, E14): aguardando. *(O briefing fala
em oito; a régua §8 lista sete — vale a régua.)*

**Regressões obrigatórias (§8):** M1 ✓, M2 ✓, C4 ✓, D2 ◌ (a parte medida
passa), **D6 ✓**, E10 ✓, E11 ◌.

**Defeitos que reprovam critério e nasceram de correção desta rodada: 0.**
**Defeitos NOVOS nascidos das correções desta leva: 2** (§4, [NC] 1–2; um de
segurança). Em `a9a4ffd`: 3; em `afb1ae8`: 4; em `d381d29`: 3. **Duas correções
não fecharam tudo o que prometiam**: o carro LEGÍTIMO que pula ainda tem pacote
recusado (o [NC] 2 de r7, menor: 2 de 7 saídas, era 4 de 7) e o carro solto
segue com três resíduos abertos (detalhe fora do repo).

`test/security-regression.test.js`: **36/36** (34 + os 2 casos novos desta leva).
Suíte completa (`npm test`, sem sonda minha ao lado, 73 min): 2 603 testes, 2 551
passaram, 1 falhou, 48 cancelados, 3 pulados; 9 arquivos re-rodados isolados pelo
runner — 8 **flake** (2 passes seguidos: `aim-visibilidade`, `butterfly-drawcalls`,
`car-settle`, `predios-desenho`, `xr-braco-alcance`, `xr-corpo-ancora`,
`xr-haptics`, `xr-interact`) e **`xr-olho-limpo` chamado de "regressão real"**
(3 rodadas sem 2 passes seguidos, carga 2,3–4,2). Refeito por mim, isolado, logo
depois (carga 2,7–3,1): **9/9 em 2 de 2** — pela regra do próprio runner, flake. A
falha era o boot de 90 s da 2ª suíte do arquivo (`waitForFunction` do harness),
não asserção. A única falha de asserção da corrida (`aim-visibilidade`, "cenário:
só 7 controles visíveis e assistidos antes", com a carga do outro projeto a 13)
passou 2× isolada. **Veredito: verde por triagem refeita**, não pela linha final
do runner.

---

## A. Os cinco itens do briefing, um por um

1. **Servidor — o chão que SUSTENTA (`superficieSob`).**
   *(a) P3 volta a ✓.* Servidor de verdade (`r8-p3b`, socket, âncora o
   `playerUpdate.heli` que os bots leem): debaixo da cobertura `noCollide` do
   lote#5 (os 4 pontos de r7, a 3 m do chão do cliente) **`heli = true` em 4 de
   4**, ao lado e de volta também. Grade de 2 m na cidade (17 161 pontos), a
   mesma de r7, com o servidor real em processo: piloto a 0,55 e a 3 m do chão do
   cliente → **3 e 2** pontos com `heli = false` (r7: **152 e 54**; os 2 a 3 m são
   POSTES — peça de corpo que empurra o helicóptero do cliente). Legitimando a
   pose pelo próprio cliente (o `Structures.collide` não a move e y ≥ `groundAt`
   + 0,55, a conta do js/heli.js): **3 a 0,55 m e 0 a 3 m**. Castelo, 6 torres de
   vigia e vulcão: 0 e 0. A varredura de altura (de 5 em 5 cm, do relevo + 0,55 até
   o topo + 30 m, em cada coluna) acha as únicas poses LEGÍTIMAS em que o servidor
   diz "a pé": **uma faixa de 0,45 m logo acima do topo de peça de CORPO que não é
   piso do cliente** — 41 colunas na cidade (38 casa de máquinas/caixa d'água com
   corpo nos telhados, 3 na praça) e 5 no castelo (ponte e pilares do portão); o
   `collide` não empurra o heli que está a ≥ topo − 0,12, e o servidor conta o
   topo como chão. No servidor de verdade: **false na faixa, true 1 m acima (5 de
   5)**. Ali o helicóptero está a menos de 0,4 m do que tem debaixo dele — não é o
   "≥ 3 m" de P3, e já existia em r7 (a coluna inteira contava). Observação.
   PvE no heli (`r3-heli`): voando 0 golpes, pousado dentro 0; a pé 727.
   *(b) Segurança — fora do repo.* Os quatro vizinhos de r7 (adarve, escada e
   patamar da muralha, torres de vigia) **fecharam** no servidor de verdade; do
   carro solto, pairar abaixo do teto e subir pelas lajes da Torre **fecharam**, a
   janela não abre mais para quem não dirigiu. **Nasceu um vizinho novo** da
   própria correção ([NC] 1) e três resíduos do carro solto seguem abertos.
   *(c) O [NC] 2 de r7 — o carro legítimo que pula.* `r8-salto`, os MESMOS 7
   pontos e rumos de r7 (semente 7), carga 2,6: o servidor recusa, além do pacote
   do tique da saída, **9 pacotes numa saída a 118 km/h e 2 numa a 40 km/h; 0 nas
   outras 5** (r7: 2–7 pacotes em 4 de 7). A mesma execução no servidor com o
   motivo de cada recusa (`copia-r8dbg`) reproduz os números (9 e 3) e diz:
   **12 de 12 recusas = "parábola"**. O carro desce do salto, QUICA (1,5–2,7 m
   acima do chão do cliente) sem que nenhum pacote venha a ≤ 1,5 m — e o servidor
   segue julgando pela parábola da 1ª decolagem (vy0 = 0 a partir do topo, T de
   1,7 s), cujo teto já está abaixo do carro. Na saída de 118 km/h o carro fica
   parado no ar para os outros por **0,5 s** (5 pacotes) e de novo por 0,4 s (4); fim
   a 0,03 m da física em 7 de 7. §4, item 3.
2. **Relevo EXATO na bala (`retaNoRelevo`).**
   *O §4.3 de r7 refeito*, nos mesmos 18 941 pares e com a MESMA régua de r7 (tela
   = `Oclusao` nos dois pontos do bot; vítima pela regra de `a9a4ffd`): "a tela
   tampa e a vítima aceita" **85 → 65** — a classe da crista sumiu.
   *O par geral "a tela tampa e a bala passa" no relevo*, com âncora nova e
   independente do produto: o **Raycaster do three no `terrainMesh` desenhado**:
   a malha barra e a bala do cliente passa em **0 de 37 882 retas** (cabeça e
   tronco dos 18 941 pares; r7: 28 pares de crista). Mutante `RELEVO16` (a marcha
   de 1,6 m de volta), só nos 6 544 aleatórios: **55 retas**.
   *O avesso — bala parando no ar por cima de crista:* **0**. A sonda marcou 14
   retas em que a bala parou "no relevo" sem a malha barrar antes; as 14 são
   obstáculo rente ao chão que o MEU rótulo chamou de relevo (ponto de parada
   dentro do círculo de pedra 10, árvore 1, cacto 1, mercado 1, e 1 na rocha do
   vulcão, 12 cm antes da malha do relevo). Com o mutante `RELEVO16`, 1 257 das
   paradas no relevo dos aleatórios ficam até 0,8 m ANTES da malha (o meio-passo
   da marcha velha) — o impacto desenhado no ar antes da crista, que o exato
   tirou.
   *Bot × cliente no relevo (B6):* o cliente agora tampa **10 312** pares (r7:
   10 285; +27, as cristas que a marcha de 1,6 m não pegava) e o bot vê **1** deles
   (o mesmo par de caminhão de r6/r7); **bot cego onde o cliente vê: 0 de 8 629**
   (r7: 27 — eram cristas em que o bot, exato desde `7515734`, barrava e a bala
   do cliente passava). Mutante `RELEVO16`: 24 de volta (r7: 24) nos aleatórios.
   *Custo* (`r5-custo`, 2 000 retas × 9, mesma semente): carga 2,3–2,6, três execuções da árvore: cidade **8,50–8,65 µs**, campo **7,05–7,15 µs** por reta; o mutante com a marcha velha, na mesma carga: 8,35 / 7,00 µs. **O exato custa +0,15–0,3 µs por reta (+2–4 %).** (r7: 8,9 e 7,6–7,9 µs com carga 2,95.)
3. **Vítima pelos pontos que o atirador vê.**
   *O §4.7 de r7 refeito no cliente* (`r8-vitima`, pelo toque, anfitrião por
   socket; tela = `Oclusao` do olho dele): **muros de ruína de 1,70–1,82 m, em pé:
   em 6 dos 8 casos a tela mostra o alto da cabeça e a vítima ACEITA em 5 de 6**
   (vida 48, 48, 48, 48 e 36 — a do 36 levou também o esqueleto). r7: **recusava
   5 de 5**. O 1 que ainda recusa: a tela mostra só os últimos 5 cm do capacete
   desenhado (1,86–1,91 m; a esfera vai a 1,94) e o 3º ponto (1,86) fica atrás do
   muro — resíduo, observação. Nos 2 casos em que a tela não mostra nada, recusa
   (100/88). Mureta de 1,31–1,42 m em pé com a cabeça de fora: **48 em 4 de 4**
   (um deles só pelo alto do capacete: a regra de `a9a4ffd` recusaria);
   agachado: 100 (3) e 88 (esqueleto). Muro de 2,01 m: 100 em 4 de 4. Esportivo
   parado: em pé com a cabeça por cima 48, os outros 100 (V1(c)). Mutantes: a
   regra de `a9a4ffd` (`VITIMAolho`) aceita **1 de 6** dos casos com o alto da
   cabeça na tela; sem o 3º ponto (`SEMcapacete`), **2 de 6**.
   *O avesso — "a tela não mostra nada e o dano entra"* (os 18 941 pares, tela =
   a SILHUETA: 6 pontos do boneco desenhado — centro e alto do capacete
   desenhado, tronco e as duas laterais dele, pernas — pelo `Oclusao` e pela malha
   do relevo; a vítima de frente para quem atira): **39 pares (0,21 %) com a regra
   nova, 21 com a de `a9a4ffd` nos mesmos pares**; **2 só pelo alto do
   capacete**. Dos +18, **16 são agachado atrás de POSTE** (o ponto do tronco a
   0,54 m, com o avanço de 0,11 m, passa pelas 5 caixas de bala do poste — que
   ficam DENTRO do cilindro desenhado, de propósito — onde o desenho tampa).
   §4, [NC] 2. Em troca, **"a tela mostra a cabeça e a vítima recusa" cai de 312
   para 89**.
4. **Posse depois do `state`: FECHOU — na saída e na entrada.** `r8-posse`, 8
   ciclos pelo toque (USAR, polegar; 22–74 km/h na saída), chave exata por
   pacote: o `state` do MESMO tique da saída chega ao servidor em **8 de 8** (r7:
   perdido em 6 de 6), o da entrada em **8 de 8**; os dois seguintes, 8 de 8;
   778 de 788 `state` repassados no teste (os 10 que faltam são o anti-teleporte
   depois do único `QA.reset` da sonda). Mutante `POSSEantes` (a ordem de
   `a9a4ffd`): **perdido em 6 de 6 na entrada e 6 de 6 na saída**. Dois navegadores
   (`r8-carro`, esportivo a 117,9 km/h): 26 `playerUpdate` do ex-motorista nos
   2,55 s do rolar, **maior buraco 0,13 s** (r7: 0,19–0,20 s), o 1º `car = −1` a
   0,13 s; o outro navegador desenha o carro parado a 0,28 m da física de quem
   dirigia, anda até ele e **entra no 1º toque** (1 de 1 — nas outras 2 a minha
   sonda não chegou ao carro, §0). Observação: o `solto` que vai no `state` da
   saída chega ANTES do `leaveCar`, quando a janela ainda não abriu, e é recusado
   em 8 de 8 (o 1º seguinte é aceito em 8 de 8): o carro fica 100 ms na pose do
   último tique dirigindo para os outros. Antes perdia-se o `state` inteiro.
5. **D6 — boot em 4G: ✓.** `boot4g.js` (9 Mbps / 40 ms, V3, cache desligado,
   servidor novo a cada vez), **N = 5**, carga 4,3–4,8:
   | | árvore (N = 5) | mutante `SEMgzip` (N = 2) | r7 | limiar |
   |---|--:|--:|--:|--:|
   | menu jogável | **3,51–4,03 MB** (4,6–5,9 s) | 3,12 MB | 3,11 MB | ≤ 15,03 |
   | arma equipada pronta | **3,51–4,03 MB** (4,7–5,9 s) | 4,46 MB | 4,45 MB | ≤ 5,25 |
   | total (o número que eu vinha usando) | **11,14 MB** (220 req., 17,0–17,3 s) | 16,98 MB | 16,97 MB | ≤ 15,03 |
   GLB 14,06 → **8,22 MB**; JS 2,78 MB (cru — ver abaixo). Com o gzip o fuzil
   chega junto do menu: a arma fica pronta no MESMO byte em que o menu libera.
   *Local × produção:* o servidor local não comprime o JS; em produção a borda já o
   mandava em brotli (`game.js` 298 978 → **107 067 B**, `br-game.js` → 46 526 B,
   conferido agora) e passava o `.glb` cru. Conferido na produção, só cabeçalhos:
   o fuzil sai `Content-Encoding: gzip`, **139 651 B** (556 936 no disco),
   `Vary: Accept-Encoding`, ETag `W/"gz-…"`, e a borda diz que não guarda o
   arquivo (status de cache "dinâmico" — não há cache dela misturando cru e gzip); sem gzip no pedido a borda entrega os
   556 936 B crus. A fonte v1 do castelo dá 404 na produção em 6 grafias (HEAD).
   O boot em produção fica, portanto, ABAIXO dos 11,14 MB locais (não medido:
   não abro o jogo de produção num navegador de sonda).
   *O avesso (`r8-gzip`, âncora nos bytes do disco):* 27 modelos (os da árvore
   inteira, inclusive os não versionados): gzip descomprime nos MESMOS bytes em
   27 de 27; sem gzip, cru e idêntico; `Vary` nos dois; ETag do gzip ≠ do cru;
   304 com o ETag do gzip; **pedido sem gzip com o ETag do gzip → 200 cru** (nada
   de corpo gzip para quem não aceita); HEAD sem corpo; Range → 206 cru. **A fonte
   v1: 404 em 16 grafias × 2** (maiúscula, %-codificada, barra no fim, `./`,
   `../`, `\`, nulo, `;`, dupla codificação, `?`, ponto no fim). No navegador: as
   7 armas prontas, o `fetch` de cada modelo dá os bytes do disco em 27 de 27,
   50 de 50 recursos chegaram comprimidos, 0 erro de página. Custo da compressão
   fria (1º pedido de cada arquivo, carga 20): até 232 ms (a bazuca de 9,2 MB, que
   o gzip quase não reduz: 4 %); 0,8 s para todos em fila.

---

## 2. B7 — "bots atirando através de parede" (o principal para o dono)

**Âncora:** o `rayBlockedAt` do CLIENTE numa página do jogo da mesma semente
(terreno — agora exato —, `Structures.rayHit` com veículos e rocha do vulcão,
obstáculos), com a rocha, o modelo do vulcão e o painel conferidos como
carregados e `cidade: false` (§0, correção 1). À parte, a TELA (`Oclusao`) e,
nesta rodada, a malha do relevo desenhado (Raycaster do three no
`terrainMesh`).

### 2a. Caminho real

**Não refeito.** Nada do lado do bot mudou nesta leva (`scripts/bots.js` e o
`solto` no `playerUpdate` intocados); a arena de r7 (0 / 0 /
0 / 0 em 52 válidos com o carro que rolou; mutante 376 disparos em 39 de 39) segue
sendo a medida. A posse que mudou (§A.4) só acrescenta o `state` que antes se
perdia.

### 2b. Pares geométricos (18 941 pares, semente 424242)

Os mesmos pares de r6/r7. **0 de 10 312 tampados vistos pelo bot**, fora o
mesmo par de caminhão de r6 (determinístico). O cliente tampa 27 pares a mais
que em r7 — as cristas que a marcha de 1,6 m não pegava (24 aleatórios, 1 árvore,
2 vulcão) —, e o bot já os via tampados. **Bot cego onde o cliente vê: 0 de 8 629**
(r7: 27 de 8 656 — eram essas cristas, ao contrário). Guarda-corpo `noBullet` no
caminho: 40, o bot vê 40.

### 2c. A tela e a regra nova da vítima

§A.3: com a silhueta na tela, "a tela não mostra nada e a vítima aceita" = 39
(0,21 %; 21 com a regra de `a9a4ffd`); "a tela mostra a cabeça e a vítima recusa"
= 89 (312).

### 2d. Veredito de B7

**◌ — igual a r7.** Os pares melhoraram (0 cego), o tipo que reprovou em r6
segue passando (arena de r7), e as duas razões de `d381d29` continuam: a
"virada" pela letra (redação com o dono) e o avesso (9) sem N no caminho real.

---

## 3. Veredito por critério (com a comparação com `a9a4ffd`)

### M — Mira e tiro

| | agora | antes | medido / âncora |
|---|---|---|---|
| **M1** | ✓ | ✓ | V3 e V2: **0,00 px / 0,00 cm a 10, 25 e 50 m** em todos os casos, idêntico a r7 campo a campo (`cmp8`: 0 diferenças). Bazuca: idêntica a r7 (0 diferenças). |
| **M2** | ✓ | ✓ | Fuzil 720 m/s medidos → 8,4 cm a 100 m (0,081 s); DMR 800 → 5,1 cm; sniper 845 → 5,4 cm. |
| **M3**–**M5** | ✓ | ✓ | `mira.js` V3: os mesmos números de r7 (0 diferenças fora do M2). |
| **M6** | ✓ | ✓ | `m6b`: idêntico a r7. |
| **M7** | ✓ | ✓ | Bateria (`r3-toque`, `r3-m7c`, carga 2,2–2,9): iguais a r7 dentro do ruído; (c) diferença **0,01** entre ~32 e ~61 quadros/s. O `SO_M7` de r7 não foi refeito (código intocado). |

### A — Assistência

| | agora | antes | medido |
|---|---|---|---|
| **A1** | ✓ | ✓ | Mouse e caneta: 0; controle de toque 4,71°. |
| **A2** | ✓ | ✓ | 236 casos com âncora de pixels: **0 com 0 px e a assistência agindo, 0 do automático**; controle positivo 90 (r7: 78). A assistência consulta o `rayBlockedAt`, agora exato: o relevo só ficou mais estrito. |
| **A3**, **A4** | ✓ | ✓ | `assist.js`: iguais a r7. |
| **A5** | ◌ | ◌ | (a)–(c) ✓ (c: erro com/sem **3,44°/4,34°** a 10 m e **3,64°/4,34°** a 20 m); (d) segue em conflito com A2. |
| **A6**, **A7** | ✓ | ✓ | Iguais a r7; `security-regression` **36/36**. |
| **A8** | ✓ | ✓ | Padrão desligado; fuzil a 20 m: 3 tiros (1º em 0,217 s); 0 a 75 m; faca/bazuca/DMR/sniper 0. |

### C — Controles e HUD

| | agora | antes | medido |
|---|---|---|---|
| **C1** | ✗ | ✗ | (e) três dedos em 0,5 s: **1,82 m < 2 m** (igual). |
| **C2** | ✓ | ✓ | `hud.js` V1 e V3: idênticos a r7. |
| **C3** | ◌ | ◌ | Igual: morte, espectador e carro não medidos. |
| **C4** | ✓ | ✓ | 0 nomes de tecla no percurso por toque. |
| **C5** | ✓ | ✓ | Grade real 280 pontos: os mesmos 3 "tiros" de troca de arma; giro 0. |
| **C6** | ✓ | ✓ | Idêntico a r7. |
| **C7**–**C9** | ✓ | ✓ | Não remedidos fora do percurso (código intocado). |
| **C10** | ✓ | ✓ | Toque real: carro anda **5,36 m no 1º s**, pente 28 → 28; helicóptero com o ⇧ translada 6,45 m; sair: 0 m, nada preso — com a posse saindo depois do `state`. |
| **C11** | ✗ | ✗ | Não remedido (código intocado): (a) 95,2 %; (c) a corrida liga entre 0,81 e 0,85. |
| **C12** | ✓ | ✓ | `r3-retic`: idêntico a r7. |

### B — Bots (caminho real)

| | agora | antes | medido |
|---|---|---|---|
| **B1**, **B2** | ✓ | ✓ | Não remedidos: o bot, o tiro do servidor e o caminho da arena não mudaram; a regra nova da vítima não entra na arena (o humano dela é um socket) e, exposto, a vítima aceita igual. |
| **B3** | ◌ | ◌ | Igual a r7. |
| **B4**, **B5** | ◌ | ◌ | Não medidos. |
| **B6** | ◌ | ◌ | Pares: **0 de 10 312** tampados vistos (o par de caminhão é veículo, não relevo); **cego 0** (r7: 27). A arena de r7 (o disparo dentro da janela de reação de 0,6 s depois de o bot perder a linha) não foi refeita — bot intocado; segue a proposta de redação de r7. |
| **B7** | ◌ | ◌ | §2. |
| **B8**, **B10**–**B12** | ✓ | ✓ | Não remedidos (código do bot intocado). |
| **B9** | ◌ | ◌ | Não medido. |
| **B14** | ✓ | ✓ | Não remedido (o mesmo de B1/B2). |

### P — PvE

| | agora | antes | medido |
|---|---|---|---|
| **P1** | ✗ | ✗ | Não remedido. |
| **P2** | ✓ | ✓ | BR: 3 térreos e 3 paredes, 45 s cada: **1 140 golpes, 0 através** (r7 1 087). Torre Nexus, 10 pontos da escada: **447 golpes, 0 através** (r7 487). O PvE agora vê pelo relevo exato. |
| **P3** | **✓** | ✗ | §A.1(a): piloto LEGÍTIMO a ≥ 3 m (pose aceita pelo próprio cliente): **0 de 17 161** com `heli = false` na cidade, 0 no castelo, nas torres e no vulcão; debaixo da cobertura do lote#5, **true em 4 de 4** no servidor de verdade (r7: false em 4 de 4). PvE: voando 0 golpes, pousado 0; a pé 727. A arena de bots de P3 não foi refeita — o veredito sai do portão (`playerUpdate.heli`), como em r6/r7. Resíduo: faixa de 0,45 m acima de peça de corpo (observação). |
| **P4** | ✓ | ✓ | (a) 0 travessias em 53 corridas contra 19 paredes; (b) os mesmos 11 de 101 vãos. |

### V — Veículo

| | agora | antes | medido |
|---|---|---|---|
| **V1** | ✓ | ✓ | **(a)** atrás do caminhão: fuzil, DMR e bazuca dão 0 px no alvo e 0 `shotHit` nele (vão para `vehicleHit`/`vehicleBlast`); hitscan (solo): soldado 0 de dano, caminhão 1 760 → 1 396; controles acertam (DMR 127 px e 1 `shotHit`; hitscan 104, morre). **(b)** arena de r7, não refeita (bot intocado). **(c)** vítima atrás do caminhão: 100; controle 48. **(d)** não remedido (o dano em veículo no servidor não mudou); `security-regression` 36/36. **(e)** a reta fica livre no MESMO quadro da queima; queima 2,54 s depois dos 30 tiros; explosão **5,03 s** depois da queima. (c) com a vítima nova: atrás do esportivo agachado e em pé tampado → 100 em 3 de 3; em pé com a cabeça por cima → 48 (a régua cobra cabeça E tronco). |

### D — Desempenho

| | agora | antes | medido |
|---|---|---|---|
| **D2** | ◌ | ◌ | BR entrada: **233 draw calls p50** (225–258, mundo de 22,9 s) — igual. Solo e combate: não medidos. |
| **D3** | ✓ | ✓ | 600 quadros de olhar com a assistência agindo em 370: 0 `Object3D`. |
| **D4** | ✓ | ✓ | `d4b`, com a lista de sítios assentada: **idêntico desktop × `?mobile=1` em 2 de 2 pares** (§0, correção 6). |
| **D5** | ✓ | ✓ | Não remedido (o laço dos bots não mudou). Custo do `rayBlockedAt` do cliente: §A.2. |
| **D6** | **✓** | ✗ | §A.5: **11,14 MB** no total (N = 5), menu 3,51–4,03 MB, arma pronta 3,51–4,03 MB; mutante sem gzip 16,98 MB. |

### E — Estados

| | agora | antes | medido |
|---|---|---|---|
| **E1**–**E3** | ✓ | ✓ | Menu, lobby, retrato, nave (pular em 0 quadros), queda em 8 direções (erro 0), pouso — iguais a r7. |
| **E4**, **E5** | ◌ | ◌ | Igual: chegar ao carro/helicóptero só pelo toque, a partir da nave, não completado (o roteiro chega a 11,8 m do carro e a 6,9 m do helicóptero). |
| **E6**–**E8** | ✓ | ✓ | Solo: JOGAR DE NOVO / VOLTAR AO MENU; espectador "botão ⇧ troca" → lobby; fim → lobby em 8,8 s → nova partida, nada preso. (`estados-e7` estourou os 25 min, como em r7.) |
| **E9** | ✗ | ✗ | Sem "sair da partida" no BR (decisão do dono). A pausa em si: ✓ (§0, correção 7). |
| **E10** | ✓ | ✓ | Retrato na pausa, nada preso. |
| **E11**, **E12** | ◌ | ◌ | Cinemática não percorrida; 0 `pageerror` no que foi percorrido. |
| **E15** | ✓ | ✓ | V2 e V1: pouso a 0,1 m do baú; 1º toque abre e o item entra; 19 baús desenhados, 0 de enfeite; caminhão: entra no 1º toque, anda 23 m, sai no 1º toque, nada preso — com a posse depois do `state` (§A.4). |

---

## 4. Defeitos NOVOS e resíduos, com reprodução mínima

**[NC]** = nasceu de uma correção desta leva.

1. **[NC — `1f6cc8b`, segurança] Um vizinho NOVO do vetor do helicóptero**,
   nascido desta correção (com a semântica de `a9a4ffd`, mutante `COLUNA`, ele não
   existe). Exige cliente modificado. Medido no servidor de verdade e na
   varredura. Detalhe **fora do repo**.
2. **[NC — `8c19d8a`, baixa] Mais dano entrando sem nada na tela do atirador** (o
   avesso pedido): com a silhueta como âncora, 39 de 18 941 pares (0,21 %) contra
   21 com a regra anterior nos mesmos pares. +16 são **agachado atrás de poste**:
   o ponto do tronco (0,54 m, 0,11 m à frente) passa pelas caixas de bala do poste
   — 5 caixas DENTRO do cilindro desenhado (CLAUDE.md, "caixa de bala maior que o
   desenho é bala parando no ar") — onde o desenho tampa. É a família "a tela
   tampa e a bala passa" de sempre; o que é novo é a vítima não recusar ali.
   Reprodução: vítima agachada ~0,8–0,9 m atrás de um poste da avenida, de frente
   para o atirador a 15–40 m, com a reta do tronco raspando a borda do poste
   (exemplos em `out/r8/r8-invis-v3.json`, `acab:poste`). Só pelo 3º ponto (o
   alto do capacete): 2 pares.
3. **O carro LEGÍTIMO que pula ainda tem pacote recusado — o [NC] 2 de r7, menor
   (correção que não fechou tudo).** 2 de 7 saídas (era 4 de 7), 9 e 2 pacotes;
   causa medida: a parábola não reinicia no QUIQUE (12 de 12 recusas "parábola";
   o carro quica a 1,5–2,7 m sem nenhum pacote a ≤ 1,5 m). Reprodução: `r8-salto`
   saída k0 — esportivo posto a 33 m/s em (−235,1; 372,1) rumo 3,85 rad, polegar
   no talo, sair pelo USAR a 118 km/h: pacotes 16–20 e 29–32 recusados.
4. **Segurança — o carro solto** (correção que não fechou tudo): pairar acima
   do teto e subir pelas lajes FECHARAM, a janela não abre sem dirigir; seguem
   abertos três resíduos (um deles já de r7). Detalhe **fora do repo**.
5. **Atrás de muro de 1,70–1,82 m, 1 de 6 casos com o alto da cabeça na tela
   ainda recusa** — a tela mostra só os últimos 5 cm do capacete desenhado (1,86
   → 1,91 m) e o 3º ponto fica a 1,86 m. Resíduo, observação (r7: 5 de 5).
6. **O `solto` do tique da saída é recusado** (chega antes do `leaveCar`): 100 ms
   do carro parado na pose do último tique dirigindo, 8 de 8. Antes perdia-se o
   `state` inteiro; observação.
7. **Faixa de 0,45 m acima de peça de corpo que não é piso do cliente** (casa de
   máquinas/caixa d'água com corpo nos telhados, ponte do portão do castelo): o
   helicóptero do cliente pode pairar ali e o servidor diz "a pé". Já existia
   (r7 contava a coluna inteira); observação de P3.
8. Inalterados: **P1**, **C11**, **C1(e)**, **E9**.

**Observações sem veredito:**
(a) **A beira da saia do vulcão segue muralha**, (b) **a pilha de caixas dos
fogos e o canhão vermelho** seguem sem colisor de bala, (c) **o carro segue no
relevo dentro da rocha do vulcão** enquanto alguém dirige — os três não
remedidos (código intocado nesta leva). (d) **O gzip quase não reduz a bazuca**
(9,2 MB, −4 %; textura já comprimida) — o maior arquivo do diretório; não entra
no boot do celular (o boot leva a `bazooka.optimized`).

**Contagem:** 4 critérios reprovados; **0 nasceu de correção desta rodada**;
**2 defeitos novos nasceram de correções** (itens 1–2; 1 de segurança); **2
correções não fecharam tudo** (itens 3–4).

---

## 5. Mutantes — e o que os testes do construtor não pegam

| mutante (na cópia) | minha sonda | teste do construtor |
|---|---|---|
| a semântica de `a9a4ffd` na coluna (`COLUNA`) | `r8-solo`: **152 e 54** na grade (os de r7); servidor de verdade: debaixo da cobertura **false em 4 de 4**; e o [NC] 1 deixa de existir (fora do repo) | `security-regression`: 1 vermelho em 36; `veiculo-vida-servidor`: 0 em 11 |
| só o acabamento volta a sustentar (`ACABpiso`) | `r8-solo`: 75 colunas com pose legítima "a pé" (árvore 41); a 3 m sem legitimar 8 (árvore 2) | **0 vermelhos** (11 + 36) |
| sem as plataformas do castelo e das torres (`SEMplataformas`) | `r8-solo`: adarve 192+192+192+84+84, escada 55 de 58, torres 126+394 de novo "piloto a pé" | `security-regression`: 1 vermelho |
| teto fixo de 3 m no carro solto (`TETO3`) | `r8-seg`: pairar a 2,8 m **60 de 60** (árvore 0) | `veiculo-vida-servidor`: 1 vermelho |
| sem regra de ar (`SEMar`) | `r8-seg`: pairar **60 de 60**; o salto falso fraco **28 de 28** (árvore 0) | `veiculo-vida-servidor`: 1 vermelho |
| laje não é corpo do carro solto (`LAJEcorpo`) | `r8-seg`: subir por dentro da Torre **1 de 4** (árvore 0) — a parábola segura o resto | **0 vermelhos** |
| a janela abre sem dirigir (`JANELA`) | `r8-seg`: **2 de 2** (árvore 0) | `veiculo-vida-servidor`: 1 vermelho |
| a marcha de 1,6 m na bala (`RELEVO16`) | `r8-invis` (aleatórios): malha barra e bala passa **55** (árvore 0); bot cego **24** (árvore 0) | `relevo-bala`: 2 vermelhos em 5; `vitima-cobertura`: 0 |
| a vítima de `a9a4ffd` (`VITIMAolho`) | `r8-vitima`: aceita **1 de 6** com o alto da cabeça na tela (árvore 5 de 6) | `vitima-cobertura`: 1 vermelho em 3 |
| sem o alto do capacete (`SEMcapacete`) | `r8-vitima`: **2 de 6** | `vitima-cobertura`: 1 vermelho em 3 |
| a posse antes do `state` (`POSSEantes`) | `r8-posse`: o `state` do tique **perdido em 6 de 6** na entrada e na saída (árvore 0 de 8) | `carro-solto`: 1 vermelho em 3 |
| sem gzip (`SEMgzip`) | `boot4g`: **16,98 MB** (árvore 11,14) | `modelos-gzip`: 3 vermelhos em 5 |

**Todo mutante desta rodada avermelha alguma sonda minha; dois não avermelham
nenhum teste do construtor** (`ACABpiso` e `LAJEcorpo`). O que os testes não
medem, e que esta rodada achou:

- **O vizinho novo** ([NC] 1): nenhum teste do construtor passa por ele
  (detalhe fora do repo).
- **O helicóptero logo acima de acabamento** (`ACABpiso`): o teste do construtor
  põe o piloto DEBAIXO da cobertura — com a superfície abaixo da pose, contar o
  acabamento só muda quem está logo ACIMA dele, e ninguém testa isso.
- **A laje no corpo do carro** (`LAJEcorpo`): os testes do carro solto não
  entram em prédio.
- **O carro que quica** (item 3): o teste do "pulo de verdade" é uma parábola
  única de 8 m/s; nenhum tem quique.
- **O avesso na tela** ([NC] 2): `vitima-cobertura` mede mureta, muro e parede
  pela bala; nenhum teste olha a tela do atirador.
- **`modelos-gzip` depende do `.git`** (lista por `git ls-files`): numa cópia da
  árvore sem `.git` ele falha por cenário, não por defeito (§0, correção 9).
- **As minhas sondas erraram, e está no §0**: a cidade caindo no meio do
  `r8-invis`, a chave ambígua do `r8-posse`, o salto falso fraco, o pouso no
  telhado, o esqueleto, o D4 lendo a lista ao vivo, o E9 sob carga.

---

## 6. Prioridade

1. **[NC] 1 — segurança** (fora do repo): o vizinho novo nasceu desta leva.
2. **Item 3 — o carro que quica**: a parábola precisa reiniciar quando o carro
   volta a subir (ou aceitar o quique), ou o carro legítimo some no ar para os
   outros.
3. **§4 item 4 — segurança do carro solto** (fora do repo).
4. **B7 ◌ e B6 ◌ — a redação da "virada" e da janela de reação** com o dono
   (desde `d381d29`); e o avesso (9) com N no caminho real.
5. **[NC] 2** — o avesso na tela (0,21 % dos pares; postes).
6. **P1**, **C11** (decisão do dono), **C1(e)**, **E9**.
7. **Os não medidos** — A5, C3, B3, B4, B5, B9, D2 (solo e combate), E4, E5,
   E11, E12.
