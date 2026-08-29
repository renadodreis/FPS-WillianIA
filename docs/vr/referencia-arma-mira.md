# Arma, mira e interação em VR — o que os jogos do gênero fazem, e o que a plataforma manda fazer

> Estudo feito ANTES de codar, por causa da regra do dono do projeto: "estudar
> a documentação e como os jogos de VR existentes resolvem o problema antes de
> codar; trazer a experiência do que já funciona no gênero em vez de inventar".
> Tudo aqui tem fonte. Os números que dizem "medido" foram calculados nesta
> máquina a partir dos arquivos do próprio repositório, e o comando está junto.

---

## 1. O diagnóstico: por que "pendurar a arma no controle" fica horrível

O relato do dono foi: *"a mira e a forma de mirar estão horríveis ao segurar a
arma; não consigo ter o movimento de mira centralizado, ver o buraco da mira da
arma, de forma real"* e *"o corpo onde segura a arma parece deslocado do
centro"*. Esses dois sintomas têm **quatro causas técnicas distintas**, e todas
são verificáveis no código.

### 1.1 A arma estava pendurada no espaço ERRADO (`targetRaySpace`)

A especificação WebXR define **dois** espaços por controle, e eles não são
intercambiáveis:

| espaço | o que é | para que serve |
|---|---|---|
| `targetRaySpace` | "the input source's targeting ray origin and direction in space"; -Z é a direção em que o controle APONTA | mira/hit-test/cursor |
| `gripSpace` | "an `XRSpace` where, if the user was holding a straight rod in their hand, it would be aligned with the negative Z axis (forward) and the origin rests at their palm" | **renderizar o objeto que está na mão** |

E a recomendação normativa é explícita: *"The `gripSpace` should be used
instead \[de targetRaySpace] to place the renderable model of a
'tracked-pointer'"* — com o exemplo de uma espada
([WebXR Input Explainer](https://immersive-web.github.io/webxr/input-explainer.html)).

O MDN é ainda mais específico sobre os eixos do `gripSpace`
([XRInputSource.gripSpace](https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/gripSpace)):

> "the native origin of the grip space is located at the centroid — the center
> of mass — of the user's fist"
> "The z-axis along the length of the rod, parallel to the user's palm and along
> the length of their grip. **-Z is in the direction of the user's thumb**"

Ou seja: o -Z do grip é a direção do POLEGAR, não a direção para onde a arma
aponta. Quem pendura o modelo no grip com identidade vê a arma apontando para o
próprio polegar; quem pendura no raio de mira vê a arma no ângulo de punho
errado. **Nenhum dos dois é "pegar a arma": os dois precisam de uma pose de
empunhadura autoral.**

O three.js expõe os dois — `renderer.xr.getController(i)` devolve o
targetRaySpace e `renderer.xr.getControllerGrip(i)` devolve o gripSpace — e a
doc do próprio `WebXRManager` diz o que fazer:

> "If you want to show something in the user's hand AND offer a pointing ray at
> the same time, you'll want to attach the handheld object to the group returned
> by `getControllerGrip()` and the ray to the group returned by
> `getController()`."
> — `node_modules/three/build/three.module.js:14012-14017` (r0.185.1)

### 1.2 Quanto exatamente os dois espaços diferem — MEDIDO

Não é um detalhe cosmético. O config oficial da Meta (o mesmo que o IWER usa,
extraído de `webxr-device-config` para Quest 1/2/Pro/3) traz a matriz do grip
relativa ao raio: `node_modules/iwer/lib/device/configs/controller/meta.js`,
campo `gripOffsetMatrix`. Decodificando com o próprio three:

```
$ node --input-type=module -e "import * as THREE from 'three'; ..."
oculus-touch-v3 right
  translação grip←raio (m): 0.0040, -0.0159, 0.0496
  euler XYZ (graus): 45.21, -4.94, 4.96
  frente do grip no espaço do raio: 0.0862, 0.7071, -0.7018
  ÂNGULO entre a frente do grip e a frente do raio: 45.43 graus
```

**45,4° de diferença de inclinação e ~5 cm de deslocamento.** Uma arma colocada
no raio de mira com identidade aparece com o punho 45° torto e 5 cm fora da mão.
É literalmente a queixa "o corpo onde segura a arma parece deslocado do centro".

E o IWER confirma a direção da transformação — o grip é FILHO do raio:

```js
const gripSpace = controllerConfig.layout[handedness].gripOffsetMatrix
  ? new XRSpace(targetRaySpace, controllerConfig.layout[handedness].gripOffsetMatrix)
  : undefined;
// node_modules/iwer/lib/device/XRController.js
```

### 1.3 A arma estava a MEIO METRO da mão (offsets de PC aplicados na mão)

Este é o defeito mais grosseiro, e ele não vem do WebXR: vem de reaproveitar a
pose de desktop. No PC a arma é filha da CÂMERA e a pose é escrita todo frame
por `applyFpsCamera` (game.js:1887-1897) com coordenadas **relativas ao olho**:

```js
weaponRoot.position.lerpVectors(hipPose.pos, adsPose.pos, ads);   // game.js:1887
```

`hipPose` do fuzil = `(0.26, −0.185, −0.44)` (js/weaponrig.js:123-128 sobre
`gun.hipV`). Em XR o game.js trocava só o PAI (game.js:3001) e mantinha a mesma
pose local:

```js
const paiDaArma = (xrOn && XR.mao('right')) || camera;
if (weaponRoot.parent !== paiDaArma) paiDaArma.add(weaponRoot);
```

Resultado no headset: a arma flutua **26 cm à direita, 19 cm abaixo e 44 cm à
frente da mão**, porque um offset que significava "encostada no canto direito da
tela" passou a significar "meio metro na frente do punho". Somando com o item
1.2, a arma nasce fora da mão e torta.

### 1.4 A mira era o raio do controle, não a LINHA DE MIRA da arma

`fonteDaMira()` (game.js:2149) devolvia o objeto do controle, e
`miraOrigem`/`miraDirecao` extraíam origem e -Z dele. Ou seja: **a bala saía do
raio do controle, e as miras desenhadas na arma não tinham relação nenhuma com
isso.** Alinhar a alça com a massa de mira não mudava nada — e é exatamente
isso que o dono descreveu ao dizer que não conseguia "ver o buraco da mira da
arma, de forma real".

Em VR isso não tem conserto por ajuste fino: enquanto a bala não sair da linha
óptica declarada da arma, olhar pelas miras é decoração.

---

## 2. Como os FPS de VR do gênero resolvem

### 2.1 Half-Life: Alyx — a empunhadura é desenhada para o CONTROLE, não para a arma

Duas decisões documentadas:

- **A pegada foi projetada a partir de como a pessoa segura o controle na vida
  real**, não a partir de como se segura uma pistola de verdade — decisão
  deliberada de Valve, mesmo divergindo da técnica real de tiro
  ([discussão da comunidade, Steam](https://steamcommunity.com/app/546560/discussions/0/2143091389819232025/);
  [Half-Life: Alyx — Weapons and Equipment](https://en.namu.wiki/w/%ED%95%98%ED%94%84%EB%9D%BC%EC%9D%B4%ED%94%84:%20%EC%95%8C%EB%A6%AD%EC%8A%A4/%EB%AC%B4%EA%B8%B0%20%EB%B0%8F%20%EC%9E%A5%EB%B9%84)).
- **O jogo começa exigindo alinhar as miras de ferro de verdade** ("aligning the
  sights and shooting as if shooting a real gun") e só depois oferece o laser,
  que bloqueia as miras e projeta um círculo com o tamanho do espalhamento
  (mesma fonte). Ou seja: a mira de ferro é a mecânica BASE, não um extra.
- Alyx evita que a arma atravesse parede e objeto, e isso é citado como parte do
  que sustenta a imersão ([Road to VR — VR Design Unpacked](https://www.roadtovr.com/these-details-make-half-life-alyx-unlike-any-other-vr-game-inside-xr-design/2/)).

### 2.2 Onward / Pavlov — duas mãos, e a direção sai da LINHA ENTRE AS MÃOS

- A segunda mão gruda no guarda-mão quando chega perto e solta quando afasta
  ("snap to the foregrip when close enough... when moved far enough away it
  detaches") — inclusive com a nuance de que em Pavlov a mão de apoio **não**
  afeta a direção, e essa é justamente a reclamação recorrente dos jogadores
  ([Pavlov VR — weapon handling](https://steamcommunity.com/app/555160/discussions/0/1743342647558243720/);
  [Note to Devs about GRIP TOGGLE](https://steamcommunity.com/app/555160/discussions/0/2828702373010608612/)).
- Duas mãos dão **estabilização de mira e redução de recuo**; uma mão só tem
  mais tremor (mesma fonte).
- E a armadilha do gênero, dita com todas as letras: *"with real-world objects,
  the direction each hand is pointing and the direction created by drawing a
  line between hands are the same, but with VR controllers, those directions can
  be different, causing aim shifts when gripping with the off-hand"* — ou seja,
  a transição de uma para duas mãos precisa ser SUAVE, senão a mira salta no
  momento em que a segunda mão encosta.

### 2.3 Onward / Contractors — o "aim down sights" é FÍSICO

Não existe animação de ADS: o jogador encosta a coronha no ombro e a bochecha no
controle, e o "sight picture" é geometria real. Toda a indústria de acessórios
de gunstock existe por causa disso: *"aiming down sights with a VR stock becomes
an unconscious, physical action where you build muscle memory for a consistent
cheek weld and sight picture"*, e o efeito citado é eliminar o micro-tremor que
faz a mira derivar
([Wield VR — What is a VR stock](https://wieldvr.com/blogs/news/what-is-a-vr-stock);
[Wield VR — How to improve aim in VR FPS](https://wieldvr.com/blogs/news/how-to-improve-aim-in-vr-fps-games-techniques-practice-and-gear);
[Olen VR](https://www.olenvr.com/pages/what-is-a-vr-gun-stock)).

**Consequência de projeto para este jogo:** o ADS de PC (lerp da arma para uma
pose canônica na frente da câmera + FOV animado) é o oposto do que se deve fazer
em VR. Em VR o "mirar" tem que ser DETECTADO (a arma chegou ao olho, a linha de
mira passa perto da pupila) e depois só ajudar — reduzir espalhamento e tremor —
nunca mover a arma na frente do jogador.

### 2.4 Red dot sem paralaxe

Um red dot real é colimado: o ponto aparece no infinito ao longo do eixo do
cano, então ele **fica no alvo mesmo com o olho fora do centro da janela**. As
implementações do gênero fazem isso por deslocamento do retículo em função da
direção do olho no espaço local da lente — no shader do Godot,
`lens_dir = (inverse(MODEL_MATRIX) * vec4(CAMERA_POSITION_WORLD - world_position, 0)).xz`
e depois `offset_uv -= lens_dir * depth`
([Godot Shaders — Reflector Sight (Red Dot)](https://godotshaders.com/shader/reflector-sight-red-dot/);
versão Unity URP sem render texture:
[FPS Red Dot Shader, Youssef Alioua](https://www.artstation.com/artwork/V2Qqab)).

Em geometria pura (sem shader), o mesmo resultado sai de uma projeção trivial:
**com a lente no plano `z = 0` do espaço da mira e o eixo do cano em -Z, o ponto
tem que ser desenhado em `(olho.x, olho.y, 0)` desse espaço**. Isso faz o ângulo
entre "olho → ponto" e o eixo do cano ser ZERO para qualquer posição do olho —
que é a definição de colimado, e é uma propriedade **testável por ângulo**.

---

## 3. Interação (pegar carro, abrir baú) — o que a plataforma manda

Fonte: [Meta — Hands Interaction Types](https://developers.meta.com/horizon/design/hands-interaction-types/),
[Meta — Interaction SDK overview](https://developers.meta.com/horizon/documentation/unity/unity-isdk-getting-started/),
[Meta — Create Poke Interactions](https://developers.meta.com/horizon/documentation/unity/unity-isdk-create-poke-interactions/),
[Immersive Web SDK — XR Input](https://iwsdk.dev/concepts/xr-input/).

Os quatro modelos de interação e quando usar cada um:

| modelo | alcance | quando |
|---|---|---|
| **Grab** (direto) | ao alcance da mão | objeto que a mão encosta; pinça ou palma |
| **Poke** | ponta do dedo | botão/painel; alvo mínimo 22 mm × 22 mm, espaço mínimo 12 mm |
| **Ray** | longe | selecionar/manipular o que está fora de alcance |
| **Distance grab** | longe | trazer o objeto; três métodos (Interactable-to-Hand, Anchor-at-Hand, Hand-to-Interactable) |

Regras que viraram requisito aqui:

- **"Include visual and audio cues to indicate which object is currently
  targeted."** Sem isso a interação em VR é adivinhação. E neste jogo é pior que
  no caso geral: o prompt de interação é DOM (`#prompt`, index.html:55) e **DOM
  não é renderizado dentro de uma sessão imersiva** — em VR o jogador nunca viu
  o "E — ENTRAR NO VEÍCULO". Ele não estava sem alcance; estava sem AVISO.
- **"Implement magnetism to simplify targeting"** e **"don't rely solely on
  distance grab; combine with direct grab"** — daí a seleção em duas faixas:
  perto pela mão, longe por cone/ângulo.
- **Ergonomia:** *"design your interactions so users can keep their arms close
  to their body with elbows at hip level; requiring hands above heart level
  causes rapid fatigue."*
- **Gesto:** o IWSDK separa `select` (gatilho / pinça) para o ponteiro de raio e
  `squeeze` para o ponteiro de agarrar. Neste jogo o `squeeze` já está ocupado
  nas duas mãos (esquerda agacha, direita mirava), e o **gatilho da mão de apoio
  está livre** — é o `select` canônico da plataforma e não colide com nada.
- E o IWSDK repete a regra do espaço: *"Use `xrOrigin.gripSpaces.left/right` to
  attach held items"*.

---

## 4. O que isso vira aqui (decisões, com o porquê)

1. **A arma mora no `gripSpace` com pose de empunhadura autoral.** A âncora
   `anchors.gripR` de cada arma (js/weaponrig.js, já existente e calibrada
   contra os GLBs) é colocada no centro do punho. Nada de offset de câmera.
2. **A direção do tiro é a LINHA DE MIRA da arma**, construída a partir de
   `sight.eye` → `sight.front` do perfil ativo (a mesma fonte que o ADS de PC já
   usa). Alinhar a mira passa a ser a mecânica, não a decoração.
3. **A arma aponta para onde o controle aponta.** O eixo do cano é alinhado com
   o -Z do `targetRaySpace`, então a memória muscular de "aponto o controle"
   continua valendo — mas o PUNHO fica no punho. É o meio-termo que resolve o
   45,4° do item 1.2 sem inventar ângulo.
4. **Duas mãos:** quando a mão de apoio chega perto da âncora `supportHand`, a
   direção do cano passa a ser a LINHA ENTRE AS MÃOS (Onward), com transição
   suave para não dar o salto de mira descrito no item 2.2, e histerese para
   engatar/soltar (Pavlov).
5. **ADS é físico.** `adsT` em VR deixa de vir do botão e passa a ser medido:
   quão perto o olho está da linha de mira, e a que distância da ocular. O que
   ele controla continua sendo o que já controlava (espalhamento, recuo,
   retículo) — menos a POSE da arma, que passa a ser da mão.
6. **A arma não entra na cara — e a saída é ela SUMIR, não ser empurrada.**
   Dentro de `CABECA_RAIO = 0,12 m` entre a culatra e a cabeça, `weaponRoot`
   deixa de ser desenhado (`js/xr/xrweapon.js`). Sem alguma saída, encostar a
   arma no rosto mostra o interior do modelo.

   > **Correção de 2026-08-29.** Até esta data este item dizia que a arma "é
   > empurrada para a frente ao longo do cano". **O código faz o contrário, de
   > propósito, e o documento é que estava errado** — a versão empurrada nunca
   > existiu em `js/xr/xrweapon.js`. Empurrar é a correção intuitiva e é a
   > errada: ela desgruda a arma da mão, que é exatamente o defeito que o
   > módulo veio consertar (B1), e o jogador sente a arma escorregando do
   > punho. O que o gênero faz é não deixar o jogador ver o interior do
   > modelo; o plano próximo da câmera (0,08 m) já corta quase tudo, e
   > `CABECA_RAIO` é a margem em cima dele. É rede de segurança, não mecânica:
   > com o controle na bochecha a ocular fica a ~0,20 m do olho, bem fora
   > desse raio.
   >
   > E o raio tem um INVARIANTE amarrado: `RECUO_MIN` (0,14 m) tem de ser
   > MAIOR que `CABECA_RAIO`, senão as duas janelas se sobrepõem e o jogador
   > que faz o gesto de mirar vê a arma DESAPARECER. Já aconteceu: com
   > `CABECA_RAIO` em 0,06 a sobreposição era de 6 cm e um recuo medido de
   > 0,1004 m dava `mirando: true` **e** `naCara: true` ao mesmo tempo.
   > `JANELAS_SEPARADAS` trava isso no próprio módulo.
7. **Interação com marcação 3D obrigatória:** anel no chão do alvo (com o raio
   real da regra de gameplay) + rótulo, porque o HUD 2D não existe em VR.
8. **Nenhum alcance de gameplay muda.** Os raios de `js/interact.js` e do BR
   continuam sendo os mesmos; a camada de VR só ESCOLHE e MOSTRA. Mexer no
   alcance seria vetor de trapaça, e há
   `test/security-regression.test.js` cobrindo isso.

---

## Fontes

- [WebXR Device API — Input Explainer (immersive-web)](https://immersive-web.github.io/webxr/input-explainer.html)
- [MDN — XRInputSource.gripSpace](https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/gripSpace)
- [MDN — XRInputSource.targetRaySpace](https://developer.mozilla.org/en-US/docs/Web/API/XRInputSource/targetRaySpace)
- [three.js — WebXRManager](https://threejs.org/docs/api/en/renderers/webxr/WebXRManager.html) (e o código de `getControllerGrip` em r0.185.1)
- [Meta — Hands Interaction Types](https://developers.meta.com/horizon/design/hands-interaction-types/)
- [Meta — Getting Started with Interaction SDK](https://developers.meta.com/horizon/documentation/unity/unity-isdk-getting-started/)
- [Meta — Create Poke Interactions](https://developers.meta.com/horizon/documentation/unity/unity-isdk-create-poke-interactions/)
- [Meta — Building Intuitive Interactions in VR](https://developers.meta.com/horizon/blog/interaction-sdk-building-intuitive-vr-experiences-tools-resources/)
- [Immersive Web SDK — XR Input](https://iwsdk.dev/concepts/xr-input/)
- [Immersive Web SDK — visão geral (Meta)](https://developers.meta.com/horizon/documentation/web/iwsdk-overview/)
- [Road to VR — VR Design Unpacked: Half-Life: Alyx](https://www.roadtovr.com/these-details-make-half-life-alyx-unlike-any-other-vr-game-inside-xr-design/2/)
- [Steam — Half-Life: Alyx, discussão sobre a empunhadura da pistola](https://steamcommunity.com/app/546560/discussions/0/2143091389819232025/)
- [Half-Life: Alyx — armas e equipamento (NamuWiki EN)](https://en.namu.wiki/w/%ED%95%98%ED%94%84%EB%9D%BC%EC%9D%B4%ED%94%84:%20%EC%95%8C%EB%A6%AD%EC%8A%A4/%EB%AC%B4%EA%B8%B0%20%EB%B0%8F%20%EC%9E%A5%EB%B9%84)
- [Steam — Pavlov VR, weapon handling](https://steamcommunity.com/app/555160/discussions/0/1743342647558243720/)
- [Steam — Pavlov VR, GRIP TOGGLE](https://steamcommunity.com/app/555160/discussions/0/2828702373010608612/)
- [Exploring Methods for Two-Handed Object Interaction in VR (UW CSE 490V)](https://courses.cs.washington.edu/courses/cse490v/20wi/public/report_15.pdf)
- [Wield VR — What Is a VR Stock](https://wieldvr.com/blogs/news/what-is-a-vr-stock)
- [Wield VR — How to Improve Aim in VR FPS Games](https://wieldvr.com/blogs/news/how-to-improve-aim-in-vr-fps-games-techniques-practice-and-gear)
- [Olen VR — What Is A VR Gun Stock](https://www.olenvr.com/pages/what-is-a-vr-gun-stock)
- [Godot Shaders — Reflector Sight (Red Dot)](https://godotshaders.com/shader/reflector-sight-red-dot/)
- [ArtStation — FPS Red Dot Shader, Parallax Reticle (Youssef Alioua)](https://www.artstation.com/artwork/V2Qqab)
