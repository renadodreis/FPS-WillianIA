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
| 3 baús | 48 | 8 malhas, 4 materiais — piso mesmo assim (ver o porquê lá embaixo) |
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

## A maior alavanca que sobrou é uma DECISÃO DO DONO — e o preço dela caiu a zero

A câmera nasce com `far = CFG.VIEW_DIST + 600` (1020 m) enquanto a névoa é
linear e satura em `CFG.VIEW_DIST` (420 m). Tudo entre 420 e 1020 m é desenhado
**100 % da cor da névoa** — pixel que não muda nada na tela.

O que segurava o corte não era técnico: os feixes de findability de
`js/secrets.js` e `js/maptoys.js` são declarados `fog: false` justamente para
serem vistos de longe (*"a névoa lavava a cor e o feixe sumia de longe"*,
*"feixe identificável a qualquer distância"*). Com far em 420 m eles sumiriam
além disso.

**`js/farbeacon.js` tirou esse preço da mesa** (rodada de 2026-08-26, sobre
`3cc8eea`). Os seis feixes viraram DUAS malhas — uma por módulo, cor por
vértice — em passe único, com o z de clip preso no far pelo mesmo truque que o
addon `Sky` do three usa (`gl_Position.z = min(z, w*0.999999)`). Não há passada
de render nova, nem camada extra, nem trabalho por frame.

Medido em sessão `immersive-vr` (IWER), mundo congelado com `MP.setTimeScale(0)`,
sombra desligada, GLB do Guardião carregado, seed 424242, `tier=baixo`,
`spread 0` em todas as amostras — os quatro estados dentro da MESMA sessão, com
os seis feixes de HEAD recriados em runtime ao lado dos novos.

> **Por que o absoluto não bate com os 508 da seção anterior.** Aquela medição
> partiu do jogo já rodando; esta entra em sessão pelo MENU (é o único jeito de
> o botão de VR existir) e teleporta o jogador, então o stream de grama assenta
> num estado diferente. A mesma sequência de poses repetida deu 482–514 na pose
> de castelo entre execuções. **Por isso todo número desta seção é A/B DENTRO
> da mesma sessão** — comparar absoluto entre execuções é o erro que já
> produziu o "não atribuído −1144" registrado acima.

| pose | HEAD, far 1020 | HEAD, far 420 | **farol, far 420** | Δ contra HEAD |
|---|--:|--:|--:|--:|
| spawn | 322 | 322 | **314** | −8 |
| cidade | 376 | 338 | **334** | −42 |
| castelo | **482** | 372 | **372** | **−110 (−22,8 %)** |

E o custo dos feixes, por subtração, é o mesmo em TODA pose:
**HEAD 12 draw calls estéreo · farol 4**. Ou seja, a opção 3 ("ficar com os
dois") não custa complexidade: ela **já paga −8 calls hoje**, com o far intacto.

Triângulos na pose de castelo: 1,626 M → 1,473 M estéreo com o far curto.

**O que falta é UMA LINHA do `game.js`, e ela é do dono:**

```
game.js:359   new THREE.PerspectiveCamera(75, …, 0.08, CFG.VIEW_DIST + 600)
                                                            ^^^^^^^^^^^^^^^^
                                                       → CFG.VIEW_DIST
```

Com ela a pior pose sai de **241 para 186 draw calls por olho** (teto 180).

### O que muda de aparência, dito na cara

Comparação pixel a pixel do framebuffer (mono, 800×600, câmera fixa apontada
para três feixes diferentes a 60, 250 e 600 m), decompondo a diferença:

| o que se compara | pixels diferentes de 480 000 | maxΔ |
|---|--:|--:|
| passe duplo × passe único (mesmas 6 malhas) | 0–24 | **1** |
| 6 malhas × 2 faróis mesclados, far 1020 | 0–12 | 30 |
| far 1020 × far 420, feixe a 600 m | 218–299 | 48 |

- O ±1 é arredondamento de 8 bits: somar aditivo em dois passes arredonda duas
  vezes. É a prova de que `forceSinglePass` em mistura aditiva é gratuito.
- Os ≤12 pixels da fusão são ordem de sort do transparente (uma malha ocupa uma
  posição só na fila) — e, num dos casos, o clamp devolvendo um feixe que
  estava sendo FATIADO pelo plano far a 1033 m.
- A terceira linha é a mudança pretendida: com far curto o feixe além de 420 m
  deixa de ser escondido por relevo que também está além de 420 m — relevo que
  àquela distância é 100 % cor de névoa. **Dentro dos 420 m a oclusão é
  idêntica.**

Rede: `test/world-drawcalls.test.js` (4 casos novos). O caso de pixel foi
verificado com o defeito reinjetado — sem o clamp o feixe a 603 m pinta
**0 pixels** e o teste morre.

---

## O lead de TRIÂNGULO dos `frustumCulled = false`: investigado, e NÃO é defeito

Cinco pontos do `game.js` desligam o culling. Um a um, medidos:

| ponto | o que é | estado medido |
|---|---|---|
| `game.js:775` `treeHiMesh` | InstancedMesh de árvore LOD-alto | **morta**: quando os 4 GLB de árvore carregam, `game.js:1017` faz `count = 0; visible = false` |
| `game.js:776` `treeLoMesh` | árvore LOD-baixo, mapa inteiro | 178 instâncias · 13,5 k tris mono |
| `game.js:1009` `treeVariantMeshes` | 4 InstancedMesh de GLB, mapa inteiro | 0–1 instância nas poses medidas |
| `game.js:1132` `rocks` | 240 pedras, mapa inteiro | 19,2 k tris mono |
| `game.js:1171` `flowers` | 2 600 flores, mapa inteiro | 10,4 k tris mono |
| `game.js:1222` `cacti` | 160 saguaros, deserto | 38,1 k tris mono — **238 tris cada** |

**Religar o culling não paga, e a medição é direta:** ligando
`frustumCulled = true` em TODOS os objetos da cena que o tinham desligado,

| pose | calls antes | calls depois | triângulos |
|---|--:|--:|--:|
| spawn | 372 | 366 | 1 551 378 → 1 548 534 |
| cidade | 378 | 368 | idem, −2 844 |
| castelo | 484 | 482 | idem |

**A razão é estrutural, não um bounds errado** — e é aqui que este caso difere
do dos inimigos. Para uma `InstancedMesh` o three testa UMA esfera que cobre
TODAS as instâncias (`Frustum.intersectsObject`). Essas cinco cobrem o mapa (ou
o deserto inteiro), a câmera está sempre dentro dessa esfera, e o teste sempre
passa. `frustumCulled = false` só pula uma verificação que daria "visível" de
qualquer jeito — o comentário do `game.js:775` já diz isso, e está certo.

O custo real é POR INSTÂNCIA, e o `WebGLRenderer` não faz culling por instância
de `InstancedMesh` (só `BatchedMesh` faz). Teto medido de um culling por
instância feito à mão (contando quantas instâncias caem no frustum de fato):

| malha | instâncias | dentro do frustum (spawn / cidade / castelo) | tris desenhados sempre (estéreo) |
|---|--:|--:|--:|
| cacti | 160 | 19 / 71 / 56 | 76 160 |
| rocks | 240 | 69 / 81 / 139 | 38 400 |
| treeLo | 178 | 88 / 55 / 121 | 27 056 |
| flowers | 2 600 | 864 / 776 / 1 675 | 20 800 |

Total desenhado sempre: **162 k triângulos estéreo**. Com culling por instância
PERFEITO sobraria 40 k / 61 k / 81 k — economia de 41 k a 61 k **por olho**,
contra 731 k / 563 k / 825 k por olho de frame (a MESMA execução que contou as
instâncias; entre execuções o total varia ~1 %). **5 a 9 %**, ao preço de
reordenar matriz de instância por frame (2 600 flores), fiação em `game.js` e
risco novo em cima do worldgen seedado. O corte do far entrega **153 k
triângulos estéreo na pose de castelo em uma linha**, sem nada disso.

**Recomendação: não fazer.** Se um dia se quiser mexer, o alvo é o cacto —
238 triângulos por saguaro é mais que o triplo de uma árvore (76), e são 160
deles desenhados em qualquer canto do mapa. Isso é geometria de conteúdo, não
culling.

---

## O teto de TRIÂNGULO não é alcançável sem mexer na grama

Pose de castelo, estéreo: 1,626 M triângulos = **813 k por olho**, contra teto
de 500 k. Por dono, tudo por subtração DENTRO da mesma execução congelada (a
linha da grama sai por diferença: total instanciado desenhado menos as
instanciadas nomeadas abaixo):

| dono | tris estéreo | por olho |
|---|--:|--:|
| **grama** (≈68 chunks no frustum) | **868 k** | **434 k** |
| terreno (1 malha) | 194 k | 97 k |
| buggy do spawn | 92 k | 46 k |
| cactos | 76 k | 38 k |
| castelo do boss | 47 k | 24 k |
| vulcão | 45 k | 22 k |
| pedras | 38 k | 19 k |
| casa da árvore | 31 k | 16 k |
| árvores LOD-baixo | 27 k | 14 k |
| 2 caminhões do mundo | 43 k | 21 k |
| arma em primeira pessoa | 21 k | 11 k |
| flores | 21 k | 10 k |

**A grama sozinha é 87 % do teto de 500 k por olho.** Apagando literalmente
todo o resto do mundo, o frame ainda ficaria em 434 k. O corte do far leva o
total de 813 k para 737 k por olho — ainda 47 % acima do teto.

Ou seja: **o critério de draw call é alcançável (186 por olho com o far curto,
contra teto de 180); o de triângulo não é, e a única alavanca que existe é a
grama** — que está fora de escopo por decisão anterior (`GRASS_CHUNKS` alimenta
o PRNG seedado, e super-chunks engrossam o culling e SOBEM triângulo). Isso é
decisão de produto, não de otimização: ou a grama muda, ou o teto de triângulo
muda.

---

## Achado colateral do plano far: o céu noturno já perdeu 96 % das estrelas

Medindo o corte do far apareceu isto, e é **defeito de hoje, não consequência do
corte**. `js/env.js:31-41` monta o campo de estrelas num raio de **1500 m** e
depois faz `stars.position.copy(camera.position)` todo frame — ou seja, as
estrelas ficam SEMPRE a 1500 m do olho, contra um `camera.far` de 1020 m. A GPU
recorta quase tudo.

Medido (mono, 800×600, câmera olhando o céu, opacidade das estrelas forçada em
0,9, contagem por diferença de framebuffer com e sem elas):

| `camera.far` | pixels de estrela |
|---|--:|
| 1020 (hoje) | **46** |
| 420 (com o corte) | **0** |
| 4000 (todas cabem) | 1082 |

**Hoje o jogador vê 4 % do céu que o código desenha.** Com o far curto, zero.

O conserto é barato e não muda um pixel do que se vê HOJE em nenhum outro
lugar: o material é `sizeAttenuation: false`, então o tamanho da estrela na tela
NÃO depende da distância — encolher o raio da esfera de estrelas (1500 → algo
dentro do far, ex.: `VIEW_DIST * 0.6`) mantém exatamente as mesmas direções e o
mesmo tamanho em pixels, e só para de ser recortada.

**Não foi aplicado de propósito:** é mudança do que o jogador VÊ à noite (de
quase nada para o céu inteiro), e mudança de aparência é decisão do dono, não
de quem estava medindo desempenho. Fica registrado com o número.

---

## Leads medidos que NÃO valem (para não serem re-investigados)

- **Religar `frustumCulled`**: ≤10 draw calls e 2 844 triângulos. Ver acima.
- **Culling por instância nas InstancedMesh de mundo**: 5–9 % de triângulo,
  CPU por frame + fiação em `game.js`. Ver acima.
- **Fundir os baús**: 8 malhas por baú, mas **4 materiais** que diferem em
  `roughness`/`metalness`/`emissive` (e o `glow` é escrito em runtime por
  `markOpened`), mais a tampa que GIRA e a pilha de tesouro que SOME. 8 é o
  piso sem consolidar material. 48 calls estéreo na pose de castelo.
- **Fundir os esqueletos**: 4 submalhas, 4 materiais — assinatura de aparência
  IDÊNTICA (`MeshPhysicalMaterial`, branco, rough 1, metal 0), o que difere é o
  MAPA: `skeleton.v1.glb` traz 4 texturas webp distintas, uma por material.
  Fundir exige atlas (rebuild de asset). 48 calls estéreo (6 esqueletos).
- **`forceSinglePass` no resto da cena**: varrida a cena inteira por
  `transparent && side === DoubleSide && !forceSinglePass`, 17 objetos visíveis,
  ganho total **8 calls estéreo** — dos quais 6 eram os feixes (feito). O que
  sobra são 2 calls na mira da arma (`js/weaponrig.js:172`, `reticleMat`), e a
  mira é uma cruz de dois quads: passe único trocaria a ordem de mistura entre
  eles. 1 call por olho não paga mexer no que o jogador encara.
- **Grama**: ver a seção acima. Continua fora.

---

## As duas decisões do dono estão LIGADAS — e uma delas conserta um bug de hoje

Com o farol (`js/farbeacon.js`) os feixes de findability deixaram de ser o
motivo para manter o `far` longo: eles agora prendem o z no far e continuam
visíveis de qualquer canto do mapa (medido: a 603 m pintam 218 px com far 420;
sem o clamp, 0). **A opção de cortar o far passou a custar zero em level
design.** O ganho: castelo 482 → 372 draw calls estéreo, ou 241 → 186 por olho,
contra teto de 180.

**Mas cortar o far MATA o céu noturno**, e por causa de um defeito que já existe
hoje: `js/env.js` monta as estrelas a **1500 m** e as cola na câmera todo frame,
contra um `far` de 1020 — a GPU já recorta 96% delas. Medido em pixels de
estrela pintados: **46 com far 1020**, **0 com far 420**, **1082 com far 4000**.

Ou seja, hoje o jogador já vê um céu quase vazio sem que ninguém tenha decidido
isso, e encurtar o far esvaziaria de vez.

As duas mudanças são de **aparência**, então são suas:

1. **Encolher o raio das estrelas** para caber no far. O material usa
   `sizeAttenuation: false`, então direção e tamanho em pixels não mudam — o céu
   volta a ter as estrelas que sempre deveria ter tido. Isso é conserto de bug,
   e vale independente do resto.
2. **Encurtar o far para 420 m.** −22,8% de draw call na pior pose. O que muda
   na tela: relevo além de 420 m deixa de ocluir o que está além de 420 m — e
   esse relevo é 100% cor de névoa. Dentro dos 420 m a oclusão é idêntica.

Feita a 1, a 2 fica sem contraindicação conhecida. Feita a 2 sem a 1, o céu
noturno acaba.

## O teto de TRIÂNGULO não é alcançável sem mexer na grama

Castelo: **813 k triângulos por olho** contra teto de 500 k — e a **grama
sozinha é 434 k**, 87% do teto. Apagando literalmente todo o resto do mundo, o
frame ainda ficaria acima de 434 k. O corte do far leva a 737 k.

**Ou a grama muda, ou o teto muda.** Isso é decisão de produto, não otimização —
e mexer na grama esbarra no `Math.random` seedado e na regra de que grama rala é
wallhack contra quem está deitado no mato.

## O lead dos `frustumCulled = false` NÃO era defeito

Investigado e descartado com medição: ligar o culling em todos eles rende 2 a 6
draw calls e 2.844 triângulos. A razão é o oposto do caso dos inimigos — numa
`InstancedMesh` o three testa UMA esfera que cobre TODAS as instâncias; as cinco
cobrem o mapa, a câmera está sempre dentro, o teste sempre passa. O comentário
que estava no código já dizia isso, e estava certo.

Um culling por instância feito à mão teria teto de 5 a 9% do frame, ao preço de
reordenar matriz por frame para 2.600 flores e de risco novo sobre o worldgen. O
corte do far entrega o triplo disso numa linha. **Recomendado não fazer.**
