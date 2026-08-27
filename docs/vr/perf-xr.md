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

> **ATUALIZADO em 2026-08-26, sobre `c070737`.** A grama SAIU do "fora de
> escopo": há uma alavanca de geometria que não encosta no PRNG e não rala
> grama, e ela já está no ar em XR. Ver
> "[A grama dentro da sessão XR](#a-grama-dentro-da-sessão-xr-medido-em-2026-08-26-sobre-c070737)".
> O que continua verdadeiro é a conclusão: **mesmo com a alavanca no extremo,
> o teto de 500 k não é alcançável.**

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

> **ATUALIZADO em 2026-08-26.** A grama mudou o quanto podia mudar sem esbarrar
> em nenhum dos dois: o preset de sessão troca o LOD DE LÂMINA e tira 28,7 % do
> triângulo dela na pose de castelo. **Não bastou** — ver a seção abaixo.

## O lead dos `frustumCulled = false` NÃO era defeito

Investigado e descartado com medição: ligar o culling em todos eles rende 2 a 6
draw calls e 2.844 triângulos. A razão é o oposto do caso dos inimigos — numa
`InstancedMesh` o three testa UMA esfera que cobre TODAS as instâncias; as cinco
cobrem o mapa, a câmera está sempre dentro, o teste sempre passa. O comentário
que estava no código já dizia isso, e estava certo.

Um culling por instância feito à mão teria teto de 5 a 9% do frame, ao preço de
reordenar matriz por frame para 2.600 flores e de risco novo sobre o worldgen. O
corte do far entrega o triplo disso numa linha. **Recomendado não fazer.**

---

## A grama dentro da sessão XR (medido em 2026-08-26, sobre `c070737`)

A frente anterior parou aqui: *"o teto de triângulo não é alcançável sem mexer
na grama"*, com a grama declarada fora de escopo. Esta seção mede a grama por
dentro, aplica a única alavanca que não viola nenhum invariante e diz, com
número, **onde ela chega e onde ela não chega**.

### Condição de medição (sem isto nada abaixo é medida)

Sessão `immersive-vr` real (IWER, preset Quest 3, dois olhos), entrada pelo
MENU (é o único caminho em que o botão de VR existe), **mundo congelado com
`MP.setTimeScale(0)`**, sombra desligada durante a atribuição, **GLB do
Guardião carregado** (`hasModel >= 10`, 20 confirmados), seed 424242,
`tier=baixo`, 9 amostras por ponto com **spread 0** em todas.

**Todo número é A/B DENTRO da mesma sessão**, com o preset sendo aplicado e
desfeito pela instância do JOGO (`G.XR.qualidade`) — nunca por um condutor do
harness. Comparar absoluto entre execuções é o erro que já produziu o "não
atribuído −1144" registrado mais acima.

### O que a grama é, por dentro

169 chunks (grade 13×13, `GRASS_CHUNKS`), **1005 lâminas por chunk**
(`PER_CHUNK = floor(GRASS_TOTAL / 169)`), um `InstancedMesh` por chunk. A
lâmina é `PlaneGeometry(0.1, 1, 1, N)`: **2·N triângulos**, com N = 4 perto e
N = 2 além do anel `CFG.GRASS_LOD_RING`. Ou seja **8 ou 4 triângulos por
lâmina**, e nada mais — não há terceiro botão de geometria na lâmina.

E o culling é POR CHUNK: no three r185 o `WebGLRenderer` roda `projectObject`
**uma vez**, com a `ArrayCamera` da sessão, e depois desenha a MESMA lista nos
dois olhos (`renderScene` por sub-câmera). Logo:

```
triângulos estéreo da grama = 2 × 1005 × Σ (triângulos por lâmina do chunk)
                                          chunks no frustum da ArrayCamera
```

Essa fórmula foi conferida contra a medição por subtração em **24 pontos** (os
sete anéis mais o piso forçado, nas três poses) e bateu **triângulo a
triângulo, exato, nos 24** — com spread 0 em todas as amostras. Ou seja: a
tabela abaixo é medida, e ainda por cima previsível.

Chunks no frustum, por anel de Chebyshev:

| pose | total | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| spawn | 78 | 1 | 8 | 9 | 11 | 13 | 17 | 19 |
| cidade | 50 | – | – | – | 7 | 11 | 15 | 17 |
| castelo | 70 | 1 | 6 | 7 | 11 | 13 | 15 | 17 |

### Quanto a grama custa em cada anel (por olho)

| anel | spawn | cidade | **castelo** |
|---|--:|--:|--:|
| 6 (nada reduzido) | 627 120 | 402 000 | 562 800 |
| 5 | 550 740 | 333 660 | 494 460 |
| **4 — desktop de hoje** | **482 400** | **273 360** | **434 160** |
| 3 | 430 140 | 229 140 | 381 900 |
| 2 | 385 920 | 201 000 | 337 680 |
| **1 — preset XR (e o do celular)** | **349 740** | **201 000** | **309 540** |
| 0 (modo agressivo) | 317 580 | 201 000 | 285 420 |
| piso: tudo a 2 segmentos | 313 560 | 201 000 | 281 400 |

Na cidade nenhum chunk do frustum está a menos de 3 anéis, então os anéis 0-2
dão o mesmo número — não há o que reduzir a mais. E o mundo SEM grama, por
olho, nas mesmas medições: **293 281** (spawn), **279 768** (cidade),
**302 453** (castelo).

**Draw calls não se movem**: 156 / 100 / 140 estéreo, idênticos com e sem o
preset. O LOD troca a geometria do chunk, não o número de chunks.

### O que entrou

`js/xr/xrquality.js` passou a incluir `anelGrama` no plano e a escrever
`CFG.GRASS_LOD_RING` ao entrar na sessão, devolvendo o valor anterior ao sair —
o mesmo canal por onde ele já mexia no `CFG.CSM_MAX_FAR`. `js/grass.js` passou
a **reler** esse campo a cada `atualizarLods()` em vez de congelá-lo no boot.
**Zero fiação nova**: quem chama `atualizarLods()` é o `Grass.update()` que o
`game.js` já executa uma vez por frame.

Frame inteiro, estéreo, mesma sessão, sombra desligada:

| pose | sem preset (anel 4) | com preset (anel 1) | Δ | por olho |
|---|--:|--:|--:|--:|
| spawn | 1 551 362 | 1 286 042 | −265 320 (−17,1 %) | 775 681 → **643 021** |
| cidade | 1 106 256 | 961 536 | −144 720 (−13,1 %) | 553 128 → **480 768** |
| castelo | 1 473 226 | 1 223 986 | −249 240 (−16,9 %) | 736 613 → **611 993** |

Só a grama: **482 → 350 k** (spawn), **273 → 201 k** (cidade),
**434 → 310 k** por olho (castelo, **−28,7 %**).

### Por que isto é LOD e não wallhack — medido em pixel, não prometido

A regra do repo é dura e está certa: grama mais rala, mais baixa ou com menos
alcance é wallhack contra quem está deitado no mato. As três provas:

1. **Quantidade, altura e alcance**: 169 chunks e 1005 lâminas em cada, com e
   sem o preset; `PATCH_RADIUS` idêntico; e os **bytes** de matriz de
   instância, fase de vento e tint de 12 chunks **iguais byte a byte** nos dois
   estados. O LOD troca só `position/normal/uv/index` — atributos
   COMPARTILHADOS entre chunks —, nunca as instâncias.
2. **A lâmina reduzida tem a mesma extensão**: o afunilamento é LINEAR em `y`,
   então base e ponta caem no mesmo ponto com 4 ou com 2 segmentos
   (`alturaMax`, `larguraBase` e `larguraTopo` idênticos). O que some é a
   subdivisão intermediária da curvinha `z = y²·0,18`.
3. **A pergunta direta, em pixels.** Alvo opaco do tamanho de um corpo deitado
   (2,0 × 0,55 m) plantado a 18/25/32 m, olho **em pé a 1,6 m olhando para
   baixo** — a pose real de quem procura alguém deitado. De **1 847 pixels** de
   alvo sem grama nenhuma na frente, passam **94 px com o anel do desktop** e
   **94 px com o anel do headset**. Uma varredura independente com 12 poses
   (18/25/32/40 m × 0,15/0,3/0,5 m de altura, 2 856 px de alvo) deu
   **108 px no anel 4, 103 no anel 1 e 95 no anel 0** — a lâmina reduzida
   esconde de leve MAIS, e a diferença caso a caso é de poucos pixels para os
   dois lados: é lâmina individual mudando de lugar, não buraco no mato.

   A primeira versão desse caso media com o olho DEITADO olhando o horizonte e
   dava 100 % de ocultamento em toda configuração — a grama dos primeiros 15 m,
   que o preset não toca, saturava a medida. **Teste que não pode falhar não é
   teste**; o olho subiu, e aí ele distingue.

   Medindo a cobertura de tela da grama inteira na mesma cena, a lâmina
   reduzida cobre **MAIS**, não menos: 214 513 px no anel 4 contra 225 406 px
   no anel 1 (+5,1 %) de 480 000. Faz sentido — sem os pontos intermediários a
   lâmina interpola em linha reta entre base e ponta em vez de acompanhar a
   curva, e fica um pouco mais ereta.

E o `Math.random`: a troca de anel não consome **um** sorteio. Duas janelas de
40 frames com o mundo congelado, uma com a troca no meio, dão a MESMA contagem
de chamadas — e em produção `Math.random` É o fluxo seedado (o `game.js` troca
a função e nunca a devolve), então contar chamadas é a leitura direta do
invariante. Reinjetando um `Math.random()` na troca de LOD, o caso morre.

Rede: `test/xr-quality.test.js` (14 casos novos, 23 no total), com
**7 mutantes provados**
— anel congelado no boot, `aplicar()` sem escrever o CFG, `restaurar()` sem
devolver, lâmina reduzida com metade da altura, lâmina reduzida mais estreita,
um `Math.random()` na troca de LOD, e o `|| 4` engolindo o anel ZERO do modo
agressivo. Todos morreram, e cada um matou o caso que devia matar.

### O veredito honesto: 500 k continua fora de alcance

> **SUPERADO em 2026-08-26, na mesma rodada.** Esta seção estava certa no
> número e errada na conclusão: ela devolveu a decisão ao dono em vez de
> resolver. A saída (1) logo abaixo — o terceiro degrau de LOD — foi
> implementada, mais o corte do que não pinta pixel, e **as três poses agora
> cabem**. Ver "[A grama cabe em 500 k](#a-grama-cabe-em-500-k-medido-em-2026-08-26)".
> O raciocínio abaixo fica porque é ele que explica POR QUE dois degraus não
> bastavam.

Pose de castelo, nesta execução, por olho:

```
mundo sem grama ......................... 302 453
grama, anel 4 (desktop) ................. 434 160  →  frame 736 613
grama, anel 1 (preset que entrou) ....... 309 540  →  frame 611 993
grama, anel 0 (modo agressivo) .......... 285 420  →  frame 587 873
grama, PISO absoluto (tudo 2 segmentos) . 281 400  →  frame 583 853
                                            teto ...... 500 000
```

**Com a alavanca no extremo — todas as lâminas do mapa com 2 segmentos — o
frame ainda fica 17 % acima do teto.** E o extremo entrega só **28 k por olho a
mais** que o preset que entrou: os chunks do frustum estão concentrados nos
anéis externos, que o anel 4 já reduzia; o anel 1 pega os 31 chunks dos anéis
2-4, e do anel 1 para o piso sobram apenas os **7 chunks** dos anéis 0 e 1.
Não há margem escondida aqui.

O que faltaria, em número: sobram **197 547 triângulos por olho** de orçamento
para a grama depois do resto do mundo. Com 70 chunks de 1005 lâminas no
frustum, isso é **2,8 triângulos por lâmina** — e a lâmina de 2 segmentos custa
4. **Não existe combinação de anel que caiba.**

As três saídas, todas de produto e todas do dono:

1. **Terceiro degrau de LOD: lâmina de 1 segmento (2 triângulos).** Base e
   ponta continuam nos mesmos pontos (o afunilamento é linear); o que some é o
   último ponto da curva, e a lâmina vira uma reta entre raiz e ponta. Piso com
   ela: **140 700 por olho** (frame 443 153 — abaixo do teto). Para caber em
   500 k bastaria menos: com 8·x + 4·y + 2·z ≤ 196 sobre 70 chunks, cabem
   **os anéis 0-1 a 4 segmentos, o anel 2 a 2 segmentos e do anel 3 (~25 m)
   para fora a 1 segmento**. É mudança de APARÊNCIA da grama de perto-média
   distância, e por isso não foi feita aqui.
2. **Cortar o `far` para `CFG.VIEW_DIST`** (a decisão já registrada duas
   seções acima) tira ~76 k por olho do "mundo sem grama" na pose de castelo —
   e não tira nada da grama, que vive toda dentro de 65 m. Mundo sem grama iria
   a ~226 k; somado ao PISO da grama (281 k) dá **~507 k**: encosta no teto e
   **não passa**. Sozinho não resolve; com o item 1 sobra folga larga.
3. **Mudar o teto.** 500 k por olho é um alvo escrito para um mundo com menos
   vegetação. Este mundo tem 169 845 lâminas de grama por decisão de arte.

**O que NÃO é saída, e continua não sendo:** baixar `GRASS_TOTAL` ou
`GRASS_CHUNKS` (alimentam o `Math.random` seedado — quem usa headset jogaria
num mundo diferente do dos outros da mesma partida), encurtar o raio do tapete,
baixar a altura da lâmina ou expor qualquer disso como opção do jogador. É
wallhack, e `test/render-quality.test.js` trava.

### Lead medido que NÃO foi seguido (fica registrado)

A grama tem `edgeFade` no vertex shader: a lâmina encolhe a ZERO entre
`0,72·PATCH_RADIUS` (46,8 m) e `0,97·PATCH_RADIUS` (63,05 m) de distância da
CÂMERA. Lâmina com `edgeFade = 0` tem x e y multiplicados por zero — o quad
degenera numa linha e **não pinta pixel nenhum**, mas continua sendo desenhado
e contado. Pela geometria da grade, ~24 dos 169 chunks (as quinas dos anéis 5
e 6) estão INTEIROS além dos 63 m e portanto são invisíveis por construção.

Pular esses chunks seria gratuito visualmente (é o mesmo argumento do frustum
culling). Não foi feito por dois motivos: o ganho estimado é ~9 % do triângulo
da grama, e **valeria para o desktop também** — está fora do escopo "preset de
sessão XR, desktop não muda uma lâmina". Fica anotado com o número para quem
pegar a próxima rodada.

---

## O que o corte do `far` custou, medido em PIXELS (validação independente)

O commit anunciou "invisível". Isso vale no chão e **não** vale no alto. Medido
pixel a pixel pela validação de `c070737`:

| de onde | quadro que muda |
|---|--:|
| no chão | **0,03 %** |
| do castelo | 2,73 % |
| de paraquedas | 4,36 % |
| **da nave do BR** | **13,10 %** |

E a cor prova o mecanismo: a névoa `(185,208,225)` é substituída por céu
`(218,219,219)`, com borda dura a 420 m.

**Nenhuma informação de jogo se perde** — o que estava além de 420 m já era
100 % cor de névoa, e os feixes de findability continuam visíveis (verificado
por pixel). O que se perde é **paisagem**: da nave, o horizonte distante vira
céu em vez de neblina.

A troca: −22,9 % de draw call em toda pose (castelo 558 → 430 na bancada da
validação; o *delta* reproduz, o absoluto varia com a bancada).

Se a queda da nave for considerada um momento de vitrine — e num battle royale
ela é a primeira coisa que o jogador vê —, a alternativa é um `far` maior
**só durante a fase da nave e do paraquedas**, voltando a 420 m ao tocar o
chão. Custa uma linha por transição de fase e devolve a paisagem justamente
onde ela aparece. **Não foi feito**: é mudança de comportamento por fase, e
merece a medição própria antes de entrar.

---

## A grama cabe em 500 k (medido em 2026-08-26)

A seção anterior media que dois degraus de LOD de lâmina não bastavam e parava
aí. Não bastava mesmo — e a resposta certa não era escolher entre estourar o
teto e mexer no desenho do mundo, era **descer mais um degrau de geometria** e
**parar de desenhar o que já não pinta pixel**. As duas coisas entraram, e o
resultado é o teto cumprido nas três poses.

### 1. Terceiro degrau: a lâmina de 1 segmento

`js/grass.js` passou a ter três lâminas compartilhadas, todas da MESMA fórmula:

| degrau | segmentos | triângulos | onde |
|---|--:|--:|---|
| completa | 4 | 8 | anel 0 (o chunk sob os pés) |
| reduzida | 2 | 4 | anéis 1-2 (~10 a 25 m) |
| **mínima** | **1** | **2** | anel 3+ (além de ~25 m) |

Dois é o **piso geométrico de um quad**: não existe degrau abaixo dele sem
deixar de ser um quad.

**Por que continua não sendo wallhack**, e não é opinião: o afunilamento da
lâmina é **linear em y** (`x *= 1 - y*0,82`), então a largura em qualquer
altura é idêntica com 4, 2 ou 1 segmento — o rasterizador interpola a mesma
reta. Raiz e ponta caem no mesmo ponto nos três. O único que muda é a curvinha
`z = y²·0,18`, que vira uma poligonal com menos vértices; a flecha dela é
4,5 cm no meio da lâmina, e a 25 m isso é fração de pixel. Medido:
`alturaMax`, `larguraBase` e `larguraTopo` **idênticos** nos três degraus.

### 2. O corte do que não pinta pixel (vale para o desktop também)

O lead registrado na seção anterior e não seguido virou código. O vertex shader
já apaga a grama longe: `edgeFade` vai a ZERO quando a raiz da lâmina passa de
`0,97 · PATCH_RADIUS` = **63,05 m da CÂMERA**, e ali ele multiplica x E y por
zero. A lâmina vira uma linha, as duas colunas do quad viram o mesmo ponto,
todo triângulo fica degenerado — **nenhum pixel**. Vento e dobra não salvam: os
vértices coincidentes têm o mesmo `wpos.xz` e sofrem o mesmo deslocamento.

Os chunks das quinas externas da grade eram desenhados INTEIROS para pintar
nada. Agora `mesh.count = 0` os pula, e o three sai antes da chamada de GL
(`renderInstances` tem `if (primcount === 0) return`), então **some o triângulo
E a draw call**. `onAfterRender` devolve a contagem, para que `mesh.count`
continue sendo 1005 para todo mundo que lê contagem de lâmina — inclusive o
vigia anti-trapaça do `scripts/soak.js`.

**Onde o teste mora, e por que ali:** `onBeforeRender` do MESH, não no
`update()`. O fade é função da posição da CÂMERA, e `update()` só recebe a do
jogador/carro — que na câmera de perseguição fica **7,4 m atrás** (helicóptero:
10,5 m) e no passeio do menu, centenas de metros. Cortar por ali exigiria uma
margem de ~12 m que comeria o ganho inteiro, e erraria para o lado ERRADO:
grama sumindo na tela. `onBeforeRender` recebe a câmera EXATA que vai desenhar
— em XR, a sub-câmera de CADA OLHO — imediatamente antes do `renderBufferDirect`
(three r185, `renderObject`). Sem margem e certo nos dois olhos.

Prova de que não muda a tela: A/B de framebuffer com e sem o corte, mono,
800×600, mesma câmera. **0 pixels diferentes de 480 000**, com 10 chunks
pulados, −40 200 triângulos e −10 draw calls no mesmo quadro. O caso cobra as
duas metades: se o corte não pular nada, ele falha por não ter medido nada.

> **O defeito que essa medição pegou, e ele só existia em XR.** A primeira
> versão lia a câmera com `camera.getWorldPosition()`. Esse método chama
> `updateWorldMatrix`, que **recalcula** a `matrixWorld` a partir do transform
> local — e a sub-câmera de olho do XR tem a `matrixWorld` escrita direto pelo
> `WebXRManager`, sem local correspondente. A câmera ia parar na origem, todo
> chunk virava "longe" e **o corte comia a grama INTEIRA dentro do headset**:
> 196 980 → 0 triângulos por olho na pose de castelo. O A/B de pixel no monitor
> ficou verde o tempo todo, porque em mono o recálculo dá o mesmo resultado.
> É literalmente a linha do CLAUDE.md sobre a câmera em XR não ser coordenada
> de mundo, e ela mordeu de novo. O certo é
> `setFromMatrixPosition(camera.matrixWorld)` — que é exatamente o vetor com
> que o three preenche o uniform `cameraPosition` do shader. Hoje há caso
> medindo o corte DENTRO da sessão, em estéreo, com as duas cercas: ele tem que
> tirar alguma coisa, e tem que tirar uma minoria.

### 3. O número: cabe

Sessão `immersive-vr` (IWER), mundo congelado, sombra desligada, GLB do
Guardião carregado, seed 424242, spread 0, A/B dentro da mesma sessão.
Triângulos **por olho**:

| pose | grama desktop | frame desktop | grama headset | **frame headset** | teto 500 k |
|---|--:|--:|--:|--:|---|
| spawn | 426 120 | 719 409 | 168 840 | **462 129** | cabe, folga 37 871 (7,6 %) |
| cidade | 225 120 | 499 048 | 76 380 | **350 308** | cabe, folga 149 692 (29,9 %) |
| castelo | 385 920 | 694 229 | 148 740 | **457 049** | cabe, folga 42 951 (8,6 %) |

Contra o HEAD desta rodada (desktop, antes do corte do fade): spawn
775 689 → 462 129 (**−40,4 %**), cidade 553 136 → 350 308 (−36,7 %), castelo
736 621 → 457 049 (**−38,0 %**). Só a grama, por olho: 482 400 → 168 840
(−65 %), 273 360 → 76 380 (−72 %), 434 160 → 148 740 (−65,7 %).

Dentro do preset, o corte do fade responde por 28 140 (spawn) e 24 120 (cidade
e castelo) triângulos por olho, e por **24 a 28 draw calls estéreo**.

**E o desktop ganha de graça**, porque o corte do fade vale para os dois e não
muda um pixel: spawn 775 689 → 719 409 por olho (−7,3 %), cidade
553 136 → 499 048 (−9,8 %), castelo 736 621 → 694 229 (−5,8 %); em draw call de
grama, 156/100/140 → 128/76/116 estéreo. **O LOD de lâmina, esse, não muda uma
lâmina no monitor** — continua sendo preset de sessão, desfeito ao sair.

### 4. O anel completo teve que descer de 1 para 0, e o motivo importa

A distribuição proposta a partir da pose de CASTELO era anéis 0-1 completos,
anel 2 reduzido, anel 3+ mínimo. Medida a pose de **SPAWN** ela estourava:
78 chunks no frustum contra 70, e o dobro de chunks no primeiro anel.

| tentativa | spawn | castelo |
|---|--:|--:|
| anéis 1/2, sem corte de fade | 522 429 ✗ (faltam 22 429) | 499 441 ✓ (folga 559) |
| anéis 1/2, com corte de fade | 511 833 ✗ (faltam 11 833) | 479 045 ✓ |
| **anéis 0/2, com corte de fade** | **462 129 ✓** | **457 049 ✓** |

Note a folga de **559 triângulos** do castelo na primeira linha: cabia por
0,1 %, o que não é caber. Só a pose pior obrigou o número honesto.

Ceder o limiar 4→2 é o degrau CERTO para ceder: a lâmina de 2 segmentos guarda
base, MEIO e ponta exatamente sobre a curva (desvio máximo de 1,1 cm, em
y=0,25 e y=0,75), enquanto a de 1 segmento perde o meio. O limiar 2→1 — o que
se quis proteger — ficou onde estava, no anel 3 (~25 m).

### 5. O guarda de wallhack, refeito com o degrau novo

Mesmo instrumento da rodada anterior, agora medindo a configuração REAL do
headset (os dois anéis, com a lâmina mínima presente — há um caso cobrando que
os três níveis apareçam, senão o guarda cobriria o degrau errado). Alvo opaco
do tamanho de um corpo deitado a 18/25/32 m, olho em pé a 1,6 m olhando para
baixo:

| configuração | pixels de alvo visíveis (de 1 847) |
|---|--:|
| desktop, anel 4, sem degrau mínimo | 94 |
| **headset, anéis 0/2, com lâmina de 1 segmento** | **92** |

**O degrau mais agressivo até agora esconde MAIS, não menos.** É o mesmo
resultado da rodada anterior e pela mesma razão: sem os pontos intermediários a
lâmina interpola em linha reta entre raiz e ponta em vez de acompanhar a curva,
e fica um pouco mais ereta. O que esconde alguém deitado a 25 m é a DENSIDADE
de lâminas — que não muda —, não a curvatura de cada uma.

E as provas estruturais seguem valendo, agora com três degraus: 169 chunks e
1005 lâminas em cada nos dois estados, `PATCH_RADIUS` idêntico, bytes de matriz
de instância / fase de vento / tint iguais byte a byte, `GRASS_LOD_RING_FAR`
apagado do `CFG` ao sair da sessão (a chave não existe no `js/config.js`: é a
ausência dela que faz o desktop não ter degrau mínimo) e nenhum chunk em nível
mínimo no monitor depois do `XR.exit()`.

### 6. O que ainda não é preciso fazer

O corte do `far` para `CFG.VIEW_DIST` (decisão do dono, registrada duas seções
acima) valia ~76 k por olho na pose de castelo. **Ela deixou de ser necessária
para o teto de triângulo** — as três poses cabem sem ela. Continua valendo para
draw call, que é o outro critério.

E a técnica seguinte, se um dia o orçamento apertar de novo, é **grass cards**:
trocar N lâminas por um quad texturizado com atlas (uma "touceira" por quad).
Estimativa de ganho: um card de 2 triângulos cobrindo 6-8 lâminas divide o
triângulo da grama distante por 3 a 4 — a grama do headset cairia de ~149 k
para ~40-50 k por olho na pose de castelo. Risco: é a primeira mudança da
lista que **muda de verdade a aparência** (silhueta de touceira em vez de
lâminas soltas), precisa de atlas novo (rebuild de asset, sRGB/linear), de
alpha test (que reabre a discussão de ocultamento — alpha test com `alphaMap`
tem borda dura e MUDA quanto se enxerga através), e o ganho só existe onde já
está a lâmina de 1 segmento. **Não recomendada enquanto houver 7,6 % de folga
na pior pose.**

---

## O censo de DRAW CALL refeito no estado atual (2026-08-26, sobre `4c4810b`)

Quatro frentes mudaram o quadro desde a última atribuição (culling dos
inimigos, fusão dos GLB crus, feixes 6→2, `far` na névoa, LOD de lâmina e
corte do fade da grama). Este censo refaz a conta por subtração, do zero, e o
primeiro resultado é que **o número que abria esta rodada não se reproduz**.

### Condição (sem ela nada abaixo é medida)

Sessão `immersive-vr` real (IWER, preset Quest 3, dois olhos), entrada pelo
MENU, **mundo congelado com `MP.setTimeScale(0)`**, **GLB do Guardião
carregado** (`hasModel >= 10`, 20 confirmados) e esqueletos prontos, seed
424242, `tier=baixo`, mediana de 7-11 amostras com **spread 0** em todas.
Medido num **worktree limpo de `4c4810b`** — havia outro agente com a árvore
de trabalho suja, e comparar contra ela seria comparar contra o trabalho dele.

### O frame, e o que ele NÃO é

| pose | frame estéreo (sombra desligada) | **por olho** | com as 2 cascatas do preset |
|---|--:|--:|--:|
| spawn | 336 | **168** | 350 |
| cidade | 304 | **152** | 352 |
| **castelo** | **358** | **179** | 380 |

Os três números da coluna do meio saíram **idênticos em duas execuções
independentes** (censo por nó e sonda de esqueleto), com spread 0.

**A pose de castelo está em 179 draw calls por olho contra teto de 180 — e
não em ~215.** A diferença para o número que abria a rodada tem três
candidatos, todos declaráveis: (a) a sombra, que vale +14 a +40 estéreo e faz
o frame com sombra chegar a 380; (b) o que esta bancada NÃO tem — o harness
desliga os animais, não há outro jogador na sala e a fase de noite está fora;
(c) o absoluto oscila entre execuções (uma terceira sonda, que liga e desliga
sombra dezenas de vezes, deu 336/312/350). O que **não** oscila é a
composição, e é ela que decide o que cortar.

### De quem é cada draw call na pose de CASTELO (358 estéreo)

Tudo de UMA execução só — misturar runs é o erro que já produziu o "não
atribuído −1144" registrado acima. A soma fecha exata com o frame:
`não atribuído = 0` nas três poses.

| dono | estéreo | por olho | o que é |
|---|--:|--:|---|
| grama | 116 | 58 | 58 chunks no frustum, 1 call por chunk por olho |
| **veículos** | **50** | **25** | 2 de 6 no frustum: buggy (17 malhas, 36) + caminhão (7 malhas, 14) |
| 22 malhas soltas do mundo | 44 | 22 | terreno, água, céu, cidade, ruínas, interior da Torre, acampamento, barras do xilofone — 1 call por olho CADA, já mescladas |
| **baús** | **32** | **16** | 2 de 4 no frustum, 8 malhas cada |
| arma FP + mãos + HUD (`xrRig`) | 24 | 12 | |
| castelo do boss + fundação | 18 | 9 | 10 malhas, 10 materiais, ZERO texturas |
| esqueletos (2 no frustum) | 16 | 8 | 4 submalhas cada |
| inimigos de GLB (7 no frustum) | 14 | 7 | culling já resolvido na rodada passada |
| 5 `InstancedMesh` de mundo | 10 | 5 | árvores, pedras, flores, cactos |
| drops, segredos, pássaros, borboletas, faróis, estrelas | 34 | 17 | |

**A grama continua sendo o maior bloco isolado e continua fora** pelos motivos
já medidos. O maior bloco ENDEREÇÁVEL é o de veículos, seguido dos baús.

> **O que oscila entre boots, e por quê.** Numa segunda execução da mesma pose
> a linha dos esqueletos deu 8 em vez de 16 e a dos inimigos 18 em vez de 14:
> a POSIÇÃO dos sete esqueletos sai de `drySpot()` dentro do callback do GLB, e
> a posição do fluxo seedado naquele instante depende da ordem de chegada dos
> assets. Duas execuções de HEAD, mesma seed, largam os sete em coordenadas
> completamente diferentes. **É por isso que o corte é medido por SUBTRAÇÃO com
> os sete plantados na frente da câmera, e não pelo absoluto do frame.**

E o que a bancada NÃO estava contando **não muda nada**: religando os 13
animais (o harness os desliga para não estragar teste de mira) e medindo por
subtração, eles custam **0 draw calls nas três poses** — 13 bichos espalhados
num mapa de 900 m raramente caem no frustum.

---

## ATLAS DE TEXTURA — a técnica que faltava, medida nos esqueletos

O censo acima aponta o mesmo padrão em três donos diferentes: **N malhas cujos
materiais só diferem no MAPA**. Compartilhar material não resolve isso e já
está registrado por quê (o three não faz batching por material: N malhas são N
calls). O único caminho é fundir a GEOMETRIA, e para isso o mapa precisa ser
um só — que é o que um atlas faz.

O caso mais limpo do jogo é o esqueleto: `skeleton.v1.glb` traz quatro
`SkinnedMesh` com materiais **idênticos** (`MeshPhysicalMaterial` branco,
rugosidade 1, metalicidade 0, `DoubleSide`, nenhum outro mapa) e quatro
texturas webp de **256×256** — uma por submalha. Quatro draw calls por olho,
por esqueleto, e são sete esqueletos que caçam o jogador sem parar (em solo e
na fase PLAY do BR).

`js/meshutils.js` ganhou `fundirPorAtlas(root)`: monta as N texturas numa
grade, reescreve o `uv` de cada peça para a célula dela, funde as geometrias e
devolve UMA malha. Ele **recusa** (devolve `null`, e o chamador segue com as N
malhas) sempre que qualquer premissa não se sustenta — materiais que diferem
em algo além do mapa, texturas de tamanhos diferentes, `uv` fora de [0,1],
bandeiras de render divergentes, transform local não-identidade.

### O que ele paga

Sessão `immersive-vr` (IWER Quest 3), mundo congelado, sombra desligada na
atribuição, GLB do Guardião carregado, seed 424242, spread 0, medido por
subtração DENTRO de cada execução, worktrees limpos de `4c4810b` com e sem o
patch:

| pose | esqueletos no frustum | antes (estéreo) | depois | por olho, por esqueleto |
|---|--:|--:|--:|---|
| spawn | 1 | 8 | **2** | 4,00 → **1,00** |
| cidade | 1 | 8 | **2** | 4,00 → **1,00** |
| castelo | 2 | 16 | **4** | 4,00 → **1,00** |
| **controlada: os 7 plantados na frente da câmera** | 7 | **56** | **14** | **−75 %** |
| idem, com as 2 cascatas do preset | 7 | 84 | **21** | |

**1,00 draw call por olho por esqueleto é o piso** — não existe menos que uma
malha. E o frame inteiro, mesma bancada:

| pose | antes | depois |
|---|--:|--:|
| spawn | 336 | **330** |
| cidade | 304 | **298** |
| castelo | **358** | **346** (179 → **173 por olho**) |

**Triângulos não se movem**: 11 696 / 23 392 / 81 872 estéreo, o MESMO número
nos dois lados. Fusão de geometria não é redução de geometria.

E o desktop **ganha junto** — isto não é preset de sessão: o mesmo corte de 28
para 7 draw calls vale no monitor, com os mesmos pixels medidos abaixo. O
preço é **11,5 ms de CPU** (mediana de 5, máx. 19) uma única vez, dentro do
callback do GLB, que chega bem depois do primeiro quadro.

### O que muda na tela, dito em pixel

Framebuffer a framebuffer, mono 800×600, câmera fixa, mundo congelado, meio-dia
fixo, comparando só os pixels em que (a) o esqueleto aparece nos DOIS lados e
(b) o fundo é idêntico nos dois — sem esse recorte a comparação mede o céu
mudando entre execuções, não a malha:

| distância | pixels do esqueleto | Δ=0 | Δ=1 | Δ 2-3 | Δ 4-7 | Δ 8-15 | Δ≥16 | **silhueta** |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| 2,2 m | 77 830 | 71 712 | 5 949 | 91 | 32 | 26 | 20 | **0 px** |
| 8 m | 5 904 | 3 499 | 2 305 | 50 | 23 | 21 | 6 | **0 px** |
| 25 m | 665 | 224 | 363 | 40 | 20 | 12 | 6 | **0 px** |

**A silhueta é idêntica em zero pixels de diferença nas três distâncias**, e a
esmagadora maioria do resto é arredondamento de 8 bits. O que sobra são os
texels de costura entre células (o GLB pede `RepeatWrapping`, o atlas usa
`ClampToEdge`) e a diferença residual de filtro de mip.

### As quatro armadilhas, e o preço de cada uma

1. **Escorrimento entre células no mip.** Deixar a GPU gerar a cadeia mistura
   texel de uma textura com o da vizinha nos níveis baixos. A cadeia é montada
   à mão, célula a célula.

2. **Média de mip em BYTE em vez de em LUZ.** Textura sRGB reduzida somando
   bytes escurece a cada nível. Medido, com o esqueleto a 25 m: média em byte
   deixa 82 % dos pixels diferentes de HEAD (desvio médio 3,49); média em luz,
   66 % (desvio médio 1,24). E o filtro do `drawImage` do Chrome — que parece a
   escolha óbvia — é ainda pior: **87 %, com desvio de até 37 em 255**. Só a
   média 2×2 explícita, em espaço linear, reproduz o `generateMipmap` do driver.

3. **Espaço de bind diferente por submalha.** Este GLB traz UMA SKIN POR
   SUBMALHA, com `inverseBindMatrices` diferentes apesar da mesma lista de 37
   ossos (a escala de dequantização de cada malha foi parar ali). Fundir sem
   corrigir deforma o corpo. A correção é uma matriz só — `IBM_base⁻¹ · IBM_p`
   — e só vale porque ela é a MESMA em todos os 37 ossos, o que é conferido
   osso a osso; se não fosse, a fusão seria recusada.

4. **`KHR_mesh_quantization` — a que custou a rodada.** O GLB é otimizado:
   posição e normal são inteiro NORMALIZADO, isto é, moram em [-1,1] com a
   escala real na matriz de bind. `BufferAttribute.setXYZ` renormaliza ao
   escrever, então a correção do item 3 era **cortada em ±1** e um punhado de
   vértices voava: a caixa de duas submalhas errava 13,6 e 6,6 unidades
   enquanto as outras duas batiam na quinta casa decimal. O sintoma é
   traiçoeiro justamente por ser parcial — a malha inteira parece certa.
   Posição, normal e uv são desquantizados para float antes de qualquer escrita.

### Rede

`test/world-drawcalls.test.js` (6 casos novos), com **7 mutantes provados**,
cada um matando exatamente o caso que devia:

| mutante | caso que morre |
|---|---|
| ninguém funde | os 6 |
| `generateMipmaps = true` (cadeia da GPU) | a cadeia de mip |
| média de mip em byte | a cadeia de mip |
| mip pelo filtro do canvas | a cadeia de mip |
| sem desquantizar | os vértices skinados |
| sem correção de espaço de bind | os vértices skinados |
| `uv` sem o deslocamento do atlas | os pixels do atlas |

O caso dos pixels compara o **hash FNV-1a dos 262 144 bytes RGBA** de cada
célula contra a textura que ela substituiu — e ainda cobra que o `uv` de cada
peça caia DENTRO da célula dela, porque só o hash deixaria passar quatro peças
lendo todas o mesmo canto.

Verde no worktree isolado: `world-drawcalls` (19), `skeletons`,
`carregamento-determinismo`, `enemy-drawcalls`, `animal-drawcalls` (81),
`render-quality`, `security-regression`, `level-design`, `xr-quality`,
`asset-models` (67).

### O `Math.random` seedado

A fusão roda dentro de `noSeed` (o mesmo canal de `fuseBody`), então nenhum dos
UUID que ela cria consome o fluxo seedado. E o retrato do mundo continua byte a
byte igual: `test/carregamento-determinismo.test.js` passa. Registre-se, de
passagem, um fato que já era verdade e não muda: **a POSIÇÃO dos sete
esqueletos já não é reprodutível entre boots** — ela sai de `drySpot()` dentro
do callback do GLB, e a posição do fluxo naquele instante depende da ordem de
chegada dos assets. Duas execuções de HEAD, mesma seed, dão sete pares de
coordenadas completamente diferentes. Isso é de antes, não é do atlas, e é por
isso que os dourados deste bloco fixam o grupo na origem antes de medir.

---

## O que sobra, por tamanho — e o que cada corte custaria

Depois do atlas dos esqueletos, na pose de castelo (346 estéreo = **173 por
olho**, teto 180):

| bloco | por olho | técnica | risco |
|---|--:|---|---|
| grama (58 chunks) | 58 | — | **fora**: `GRASS_CHUNKS` alimenta o PRNG seedado, super-chunk engrossa culling e SOBE triângulo |
| **veículos** | **25** | atlas, como o dos esqueletos | **alto**: ver abaixo |
| **baús** | **16** | cor por vértice + mapa ORM minúsculo | **médio**, e paga pouco: ver abaixo |
| arma FP + mãos + HUD | 12 | — | mora em `xrRig`/`game.js` |
| castelo do boss | 9 | cor por vértice (10 materiais, ZERO texturas) | **alto**: `validateCastleModel` cobra 10 materiais por NOME e por cor, e há 4 arquivos de teste em cima do castelo |
| inimigos (28) | 9 | — | já resolvido pelo culling da rodada passada |
| esqueletos | 4 | **feito** | |
| resto (22 malhas soltas + 5 InstancedMesh + drops + segredos) | 46 | — | é 1 call/olho cada; nada isolado paga |

### Veículos: por que o atlas ali NÃO é o mesmo atlas

O inventário, medido no runtime (`fuseParts` de `js/carwheels.js` já fundiu o
que dava por cor):

- **Buggy `gumball` — 17 malhas, 36 estéreo (18 por olho), o objeto mais caro
  do frame depois da grama.** Corpo com 9 malhas e **7 texturas de CINCO
  tamanhos diferentes** (256², 128², 256×128, 256×4 de paleta), rugosidade
  variando de 0,806 a 1, metalicidade 0 ou 1, **duas com `roughnessMap` e
  `metalnessMap`** e uma TRANSPARENTE. Cada roda são 2 malhas com texturas de
  tamanhos diferentes entre si.
- **Caminhão `truck-drifter` — 7 malhas, 14 estéreo.** As sete usam a MESMA
  textura de 64×4; o que as separa é rugosidade (1 e 0) — não é caso de atlas,
  é caso de mapa de parâmetro.
- **Esportivos `mazda-rx7` — já em 6 malhas**, com cor por vértice: 15
  primitivas viraram 2 + 4 rodas. A fusão por cor que já existe funciona.

Teto do atlas no buggy: 17 → ~6 malhas, **−10 a −11 por olho** nas poses em
que ele aparece. O preço, e é ele que muda a recomendação: exige **normalizar
tamanho de textura** (subir 128² para 256² muda a filtragem e dobra a memória
daquelas), exige um **segundo atlas para o par rugosidade/metalicidade** (ORM),
e a peça transparente tem que ficar de fora por ordem de mistura. Ou seja: três
mecanismos novos, contra zero do caso do esqueleto. **Medir antes de fazer, e
medir em pixel — é a primeira aplicação em que o atlas MUDA a textura, não só
a realoca.**

### Baús: medido, e não paga

8 malhas por baú, 32 estéreo (16 por olho) com 2 dos 4 no frustum. Os 4
materiais não têm textura nenhuma — o que os separa é cor, rugosidade e
metalicidade —, então o caminho seria cor por vértice + um mapa ORM de 3×1.
Mas a tampa GIRA e a pilha de tesouro SOME, o `glow` é escrito em runtime por
`markOpened`, e `castShadow` é **true** só no corpo e no domo da tampa: fundir
só o que compartilha bandeira leva de 8 para 6 malhas. **−2 por olho por baú**,
ao preço de um mecanismo novo (mapa de parâmetro) num objeto que o jogador
abre de perto. Não recomendado.

### O número que falta, se o teto for o de 180 com sombra

Sem sombra o castelo já cabe: **173 contra 180**. Com as duas cascatas do
preset o frame vai a 376 estéreo; se o teto for lido como "tudo que o frame
submete", faltam **~16 draw calls**. A fonte mais barata deles, medida, é o
buggy (−10 a −11 por olho) — e a segunda é a cascata: os inimigos sozinhos
pagam **+18 estéreo de sombra** na pose de cidade, contra +0 nas outras duas.
