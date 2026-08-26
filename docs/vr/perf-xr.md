# Desempenho em XR — medição e o que ela diz

Medido em sessão `immersive-vr` real (IWER, preset Quest 3), commit `5a52d51`.
Contagem (draw calls, triângulos) o emulado mede igual ao aparelho; **tempo
não** — frame time só vale medido no Quest, via `adb logcat -s VrApi`.

## Onde o quadro é gasto

Atribuição por subtração (`npm run vr:censo`, mono, pose de spawn, sombras
desligadas durante a atribuição — com elas ligadas o agendamento das cascatas
CSM torna os frames incomparáveis):

| dono | draw calls | triângulos | nós |
|---|--:|--:|--:|
| mundo (Mesh anônimo) | 96 | 591 k | 93 |
| Enemies | 56 | 48 k | 8 |
| arma em primeira pessoa | 24 | 11 k | 1 |
| grupos diversos | 19 | 1 k | 5 |
| **frame sem sombra** | **198** | **0,65 M** | |
| custo das 4 cascatas CSM | +42 | +0,16 M | |

> **CORREÇÃO — a linha de Enemies acima está ERRADA, e vale registrar por quê.**
> `npm run vr:censo` mede logo depois do boot e **não espera o GLB do Guardião
> carregar**: os "56 draw calls para 8 nós" descrevem 28 bonecos procedurais, não
> o jogo real. Com o GLB carregado são **20 inimigos de GLB a 2 calls cada** (e
> **sempre desenhando**, porque `prepRiggedMesh` desligava o `frustumCulled`)
> mais **8 executivos a 9 calls**. Medição que chega cedo demais descreve outro
> jogo — e esta aqui mandou a frente de corte para o alvo errado por uma rodada
> inteira.

A leitura que sobreviveu:

- **A arma custa 24 draw calls sozinha**, e o censo lista **192 aparências
  repetidas** de `MeshStandardMaterial` só nela. É gordura, não conteúdo.

## O preset de sessão: quanto ele paga

`js/xr/xrquality.js` apaga as cascatas de sombra distantes, encurta o alcance
da sombra, ajusta o framebuffer e a foveação — tudo aplicado ao entrar e
desfeito ao sair. Medido em estéreo, com e sem:

| pose | sem preset | com preset | ganho |
|---|--:|--:|--:|
| spawn | 516 calls · 1,74 M tris | 495 · 1,66 M | −4 % |
| cidade | 565 calls · 1,45 M tris | 515 · 1,34 M | −9 % |
| castelo | 808 calls · 2,03 M tris | 775 · 1,88 M | −4 % |

## A conclusão honesta

**O alvo é 180 draw calls e 500 k triângulos por olho. A pose de castelo está
em 808 e 2,03 M. É preciso cortar 78 %, e o preset entrega 4–9 %.**

Configuração não resolve isso, e insistir nela é teatro. O que falta é
estrutural, e cada item tem um risco declarado:

1. **Mesclar a geometria estática do mundo.** 93 nós anônimos pagando 96 draw
   calls é o maior bloco. Merge por material, com atenção ao culling — objeto
   mesclado grande fica sempre visível.
2. ~~**Reduzir meshes por inimigo.**~~ **FEITO, e não era isso.** O gargalo não
   era a contagem de malhas ("29 por inimigo" foi refutado — `fuseBody` já
   colapsava o corpo para 7–9, e o GLB deixa 2 visíveis): era
   `frustumCulled = false`, que fazia os 20 inimigos de GLB desenharem **sempre**,
   inclusive a 400 m e atrás do jogador. Com esfera de bounds calculada a partir
   da animação (32 amostras por clipe, folga 1,12×) o culling pôde voltar, e as
   duas submalhas do GLB — mesmo material, mesmo esqueleto — viraram uma.
   Medido em estéreo, por subtração dentro da mesma execução:
   spawn **78 → 14** (−82 %), cidade **103 → 43** (−58 %), castelo **80 → 34**
   (−58 %). Sobra como maior custo de inimigo os **8 executivos a 9 calls**.

3. **Executivo de 9 para 2 calls** colapsando os 7 materiais (cor por vértice +
   atlas). Teto medido de −56 calls, mas exige segundo jogo de UV, mexe no
   registro do CSM e nos baldes de sombra, com risco de sRGB/linear. É
   exatamente a consolidação que já saiu net-negativa nesta base: fica
   registrado como decisão do dono, não como pendência.
4. **Compartilhar material na arma.** 192 aparências repetidas num único
   objeto. Cuidado: já houve uma tentativa de consolidação de material nesta
   base que saiu **net-negativa**; refazer sem medir antes e depois é repetir
   o erro.
5. **Atlas de textura** para colapsar os 258 materiais redundantes (59 % das
   434 aparências da cena).

**O risco que governa tudo isso:** os módulos de mundo consomem o `Math.random`
seedado, e a ordem de consumo é contrato — bots e servidor reconstroem o mesmo
mundo a partir da mesma semente. Merge e instancing têm que preservar a ordem
de consumo, ou o headset joga num mundo diferente do dos outros jogadores.

Enquanto esses quatro não forem feitos, **72 fps travados não é uma promessa que
se possa fazer**, e o critério E do `criterio-aaa.md` continua reprovado.

---

## O que o mundo era, de verdade (medido em 2026-08-26, sobre bbe6b48)

> **CORREÇÃO — a linha "mundo (Mesh anônimo) · 96 calls · 93 nós" da tabela lá
> em cima descreve a GRAMA, não a cidade.** Aquele censo roda em MONO, agrega
> tudo que é `Mesh` sem nome num rótulo só, e os 169 chunks de grama
> (`GRASS_CHUNKS = 13`, grade 13×13, um `InstancedMesh` por chunk) são
> exatamente isso. A conclusão que saiu dali — "mesclar a geometria estática do
> mundo, 93 nós anônimos é o maior bloco" — mandava mesclar o que já estava
> mesclado: terreno, cidade, trim urbano, interior da Torre, ruínas, rochas,
> flores, cactos e árvores JÁ SÃO uma malha (ou uma `InstancedMesh`) cada, a
> 1 draw call por olho.

### Como medir sem ruído

Subtração de conjunto dentro de sessão `immersive-vr`, com **o mundo congelado
por `MP.setTimeScale(0)`**. Sem congelar, o stream de grama e o LOD de árvore
mexem entre uma amostra e a outra: a primeira tentativa deste censo devolveu
296 "linhas" somando mais que o frame inteiro e um "não atribuído" de −1144.
Congelado, as 15 amostras dão **spread 0** e a soma das categorias fecha
exatamente com o frame. E é obrigatório esperar o GLB do Guardião
(`Enemies.list.filter(e => e.hasModel).length >= 10`), pelo motivo já
registrado acima.

### Composição real (estéreo, sombra desligada, seed 424242)

| pose | frame | mundo | grama | Car | Enemies | Skeletons |
|---|--:|--:|--:|--:|--:|--:|
| spawn | 420 | 196 | 156 | 36 | 14 | 16 |
| cidade (heliponto do Nexus) | 422 | 244 | 114 | 0 | 24 | 24 |
| castelo | **702** | 460 | 140 | 36 | 32 | 32 |

Os 460 do "mundo" na pose de castelo, por dono:

| dono | calls | o que era |
|---|--:|---|
| 3 barris de madeira | 120 | `wooden_barrel.glb` cru: **20 malhas, 1 material** |
| 3 baús | 48 | 8 materiais — já é o piso desse conjunto |
| 5 drops de loot | 34 | munição = caixa + 3 cápsulas soltas |
| casa da árvore | 28 | GLB cru: 14 malhas, 2 materiais |
| 2 carros do mundo | 28 | GLB cru: 7 malhas |
| acampamento do spawn | 32 | 3 lenhas + 7 pedras + banco + 3 chamas, soltos |
| 7 pássaros | 14 | 15 malhas idênticas |
| resto (terreno, água, céu, cidade, ruínas, rochas, árvores…) | ~2 cada | já mesclado |

**Ou seja: o custo do mundo era GLB entregue cru e decoração solta, não
worldgen.** E o `camera.far` (VIEW_DIST + 600 = 1020 m) contra uma névoa LINEAR
que satura em VIEW_DIST (420 m) fazia tudo isso ser desenhado do outro lado do
mapa sem colocar um pixel na tela.

### O que a fusão pagou

`js/scenery.js` (prop de GLB), `js/amb.js` (acampamento, pássaros, chamas) e
`js/pickups.js` (drops), todos via `fuseBody` sem ossos — que já existia e já
roda em `noSeed`:

| pose | antes | depois | Δ |
|---|--:|--:|--:|
| spawn | 420 | 380 | −40 (−10 %) |
| cidade | 422 | 408 | −14 (−3 %) |
| castelo | **702** | **508** | **−194 (−28 %)** |

Prova de que a aparência não mudou: `test/world-drawcalls.test.js` compara, POR
MATERIAL, a caixa que os vértices ocupam no MUNDO contra os dourados colhidos
antes da fusão. No drop de munição os dois números batem com a geometria
escrita à mão em js/pickups.js, casa decimal por casa decimal.

### O que NÃO paga (medido, não achismo)

- **Grama.** 114–156 calls, o maior bloco isolado que sobra. `GRASS_CHUNKS`
  alimenta o PRNG seedado (js/config.js diz isso explicitamente), então a grade
  não muda; e juntar chunks em super-chunks engrossa o culling por chunk e
  SOBE triângulo — que também está estourado. Fica.
- **Baú, segredos, atrações do mapa.** São um material por peça DE PROPÓSITO
  (arco-íris, emissivo que pulsa, alvo que vira). Fundir exigiria consolidar
  material — exatamente a consolidação que já saiu net-negativa nesta base.
- **Compartilhar material não corta draw call.** O three não faz batching por
  material: `N` malhas são `N` calls mesmo com um material só. Os "258
  materiais redundantes" só valem como HABILITADOR de fusão de geometria —
  sozinhos, não pagam nada.
- **Executivo de 9 para 2 calls.** A premissa ("8 executivos × 9 = 72") não se
  reproduz: medido, `Enemies` custa 14 (spawn), 24 (cidade, com os executivos
  da Torre no frustum) e 32 (castelo) calls ESTÉREO — 7 a 16 por olho, para os
  28 inimigos juntos. O culling que a frente anterior devolveu já resolveu o
  grosso.

### A alavanca que sobrou, e ela é de game.js

`game.js:359` — `new THREE.PerspectiveCamera(75, …, 0.08, CFG.VIEW_DIST + 600)`
contra `game.js:357` — `new THREE.Fog(FOG_COLOR, VIEW_DIST * 0.5, VIEW_DIST)`.
Encurtar o far para `CFG.VIEW_DIST`, medido em mono no mesmo frame congelado
(canvas 600×450, comparação pixel a pixel do framebuffer):

| pose | far 1020 | far 420 | pixels diferentes | maxΔ |
|---|--:|--:|--:|--:|
| castelo | 412 calls · 842 k tris | **179 calls · 691 k tris** | 5 de 270 000 (0,002 %) | 25 |
| cidade | 114 · 538 k | 114 · 538 k | 1 246 (0,46 %) | 35 |
| spawn | 148 · 593 k | 148 · 593 k | 12 (0,004 %) | 29 |

Na cidade a contagem NÃO muda (nada da pose está além de 420 m) e mesmo assim
1 246 pixels mudam: é precisão de profundidade — o far 2,4× mais perto muda
quem ganha o z-fight nas superfícies coplanares do urbano. Provavelmente
melhora, mas é mudança de pixel e quer olho humano antes de entrar. O outro
ponto a conferir são os feixes de findability com `fog: false`
(`js/secrets.js:73`, e os `beam` de `js/maptoys.js`): eles existem PARA serem
vistos através da névoa, e são os candidatos naturais àqueles 5 pixels.

---

## A maior alavanca que sobrou é uma DECISÃO DO DONO, não uma correção

A câmera nasce com `far = CFG.VIEW_DIST + 600` (1020 m) enquanto a névoa é
linear e satura em `CFG.VIEW_DIST` (420 m). Tudo entre 420 e 1020 m é desenhado
**100 % da cor da névoa** — pixel que não muda nada na tela.

Encurtar o far para 420 m, medido em mono no mesmo frame congelado, comparando o
framebuffer pixel a pixel (600×450):

| pose | far 1020 | far 420 | pixels diferentes | maxΔ |
|---|--:|--:|--:|--:|
| castelo | 412 calls · 842 k tris | **179 calls · 691 k tris** | 5 de 270 000 (0,002 %) | 25 |
| cidade | 114 · 538 k | 114 · 538 k | 1 246 (0,46 %) | 35 |
| spawn | 148 · 593 k | 148 · 593 k | 12 (0,004 %) | 29 |

**−57 % de draw call na pior pose, numa linha.** E mesmo assim não foi aplicado,
por um motivo que não é técnico:

**Corta um recurso de level design, de propósito colocado ali.** Os feixes de
findability de `js/secrets.js` e `js/maptoys.js` são declarados com
`fog: false`, e os comentários do próprio código dizem por quê — *"a névoa
lavava a cor e o feixe sumia de longe"* e *"feixe identificável a qualquer
distância"*. Eles existem para serem vistos de longe; com far em 420 m, somem
além disso. Provavelmente são exatamente aqueles 5 pixels da pose de castelo.

As opções, para quem decide o produto:

1. **Manter como está.** Paga 233 draw calls na pior pose para que os feixes
   sejam vistos de qualquer canto do mapa de 1100 m.
2. **Cortar o far.** Ganha os 233 e os feixes passam a aparecer só dentro de
   420 m — perde-se a função de orientação à distância.
3. **Cortar o far e tirar os feixes do corte** (camada separada, ou segunda
   passada de render só para eles). Fica com os dois, ao custo de complexidade
   nova no caminho de render, que em XR é onde menos se quer complexidade.

Há ainda um lead secundário de TRIÂNGULO (não de draw call): cinco pontos do
`game.js` marcam `frustumCulled = false`, somando ~249 k triângulos desenhados
sempre, em qualquer pose. Mesma família do defeito que custava 40 draw calls nos
inimigos, e vale investigar caso a caso — cada um desses provavelmente tem uma
justificativa como a que os inimigos tinham (esfera de bounds errada), e a
correção é dar bounds certos, não religar o culling às cegas.
