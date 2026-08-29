# Origem do tiro em VR — de onde a bala nasce nos jogos do gênero, e o que a régua deste jogo devia cobrar

> Pesquisa feita para destravar o impasse **B3 × B7**, que já custou sete rodadas.
> Regra deste arquivo: **sem fonte com URL e citação literal, não entra como
> fato.** Onde a busca falhou, está escrito que falhou, na seção
> [§7 O que NÃO foi encontrado](#7-o-que-não-foi-encontrado).
> Os números marcados "medido" foram calculados nesta máquina a partir dos
> arquivos deste repositório, e o comando está junto.
>
> Quem escreveu isto **não edita `criterio-aaa.md`** — recomenda, em [§9](#9-recomendação-de-texto-para-b7).

---

## 0. O impasse, em uma linha

B7 cobra a origem do raio a ≤ 5 cm da boca do cano. B3 cobra o tiro na linha de
mira. A alça deste jogo fica de 6 a 20 cm acima do cano. Uma reta que nasce no
cano e uma reta que nasce na alça só se cruzam **numa** distância — logo os dois
critérios são geometricamente incompatíveis, e nenhuma implementação os satisfaz.

O que esta pesquisa acrescenta é que **o número que o B7 mede hoje não é uma
propriedade do código de tiro** — é uma constante do modelo da arma, reproduzível
com uma calculadora e o `js/weaponrig.js` aberto, sem o jogo rodando. Ver
[§8](#8-medido-nesta-base-o-número-do-b7-é-uma-constante-do-modelo).

---

## 1. De onde os FPS de VR de referência fazem o tiro nascer

### Tabela-resumo

| Jogo | Onde a bala nasce | Como trata a altura de alça | Zeragem declarada | Força da fonte |
|---|---|---|---|---|
| **Pavlov VR** | Boca do cano (projétil real, com queda) | Assume o erro; é mecânica | **Red dot 25 m, holo 50 m** | **Post marcado "Developer"** |
| **Onward** | Boca do cano (projétil, com queda) | Assume o erro | ~30–50 m (estimativa de jogador; sem número oficial) | Fórum de jogadores |
| **Contractors VR** | Boca do cano (**hitscan**, sem queda) | Assume o erro, **deliberadamente** | Não declarada | Fórum de jogadores |
| **Half-Life: Alyx** | Não encontrado (ver §7) | **Removeu o height over bore**, segundo relato de terceiro | — | Relato indireto, um só |
| **Population: One** | Não encontrado (ver §7) | Contorna com **retículo desenhado** para tiro de quadril | — | Blog oficial da Meta (só a parte do retículo) |
| **RE4 VR** | Não encontrado (ver §7) | Oferece **laser** além da alça de ferro | — | Entrevista de dev (sem detalhe técnico) |
| **Ghosts of Tabor / Firewall** | Não encontrado (ver §7) | Calibração manual pelo jogador | — | Blog de fabricante de coronha |
| **Battlefield (PC, não-VR)** | **Da luneta** ao mirar, não do cano | **Elimina** o problema por construção | — | Wiki da série (texto literal) |
| **Escape from Tarkov (PC)** | Boca do cano | Assume o erro | Zeragem por arma | Resultado de busca, sem citação literal (ver §7) |

### 1.1 Pavlov VR — o único com **fonte de desenvolvedor**

Post marcado **Developer** no fórum oficial da Steam, autor **Junt**, 11 de
setembro de 2020, no tópico *"Can't aim with P90"*:

> "Pavlov VR uses bullet drop and sights the irons realistically. To account for
> the ballistic curve where the sight meets the bullet, the iron sights are
> "zero'd" at specific distances."

> "If you are on a large enough map you should be able to physically see in the
> tracer rounds in the ballistic curve happen in real time since Pavlov VR uses
> projectile weapons instead of hitscan."

> "Red dot is sighted in at 25 meters and the Holo sight is 50 meters."

Fonte: [Can't aim with P90 :: Pavlov VR General Discussions](https://steamcommunity.com/app/555160/discussions/0/2953753908248545138/)

Confirmação independente, outro tópico, **MoonPilot**, 9 de abril de 2019:

> "They are zeroed in at 25 meters (red dot) and 50 meters (holo), so both will
> be somewhat inacurate the first 10-15 meters."

Fonte: [Scopes are inaccurate now? :: Pavlov VR](https://steamcommunity.com/app/555160/discussions/0/1815422173048992939/)

**Leitura:** zeragem em distância FIXA e DECLARADA só faz sentido se o projétil
nasce no cano e o cano está angulado em relação à linha de mira. Pavlov nasce no
cano, e paga o preço: impreciso nos primeiros 10–15 m, por escrito, pelo próprio
estúdio.

### 1.2 Onward — mesmo desenho, o preço aparece nos relatos

Tópico *"Aiming and where the bullet hits"*, fórum oficial:

> **Shizora** (19/09/2016): "Note how i aim into the hole of the letter 'R' but
> the bullets hit far below. I'm about 10 meters away."

> **RED-FROG** (20/09/2016): "Yes it seems like the optics in Onward are zeroed
> to maybe 30-50 meters... the bullet impact is lower than the red dot/holograph."

> **junkme100** (28/06/2021): "Its NOT parallax because its consistent at all
> ranges regardless if I move my head up or down to the reticule."

Fonte: [Aiming and where the bullet hits :: Onward](https://steamcommunity.com/app/496240/discussions/0/350542145705964029/)

E no tópico de balística, **go1dfish** (07/09/2016) registra que *"Bullet Drop
exists"* e *"Bullets take time to travel"* foram confirmados por
desenvolvedores/testadores, e que *"scope crosshairs (not holo/red-dot) are
intentionally inaccurate for realism if your eye is not centered on the scope"*.
Fonte: [Onward Ballistics Questions](https://steamcommunity.com/app/496240/discussions/0/350540974011450253/)

**Leitura:** a última citação é a mais dura para este projeto. Em Onward o erro
é **constante em toda distância**, dito por um jogador que testou movendo a
cabeça — ou seja, é exatamente o quadro "origem no cano, direção paralela à
mira", que é o defeito que esta base mediu em 9,10 cm no fuzil e 20,00 cm no
plasma pelo caminho do BR. **Onward tem o defeito, e o jogador reclama há dez
anos.**

### 1.3 Contractors VR — **hitscan** e mesmo assim mantém o height over bore

Tópico *"Sights are off on most if not all guns"*:

> **SirLingLingRocket** (30/01/2021): "the acog, reflex, hamr, power, and some of
> the iron sights were hitting low for me. so instead of hitting on the red dot
> in the center of the acog or power scope it would hit 1, 2, or even 3 dots
> below."

> **OneStep** (31/01/2021): "What you experience is called height over bore which
> makes it seem like weapons are shooting low depending on how the sight is
> zeroed."
>
> "Height over bore gets unnoticable at a certain range - especially in this game
> since bullets are hitscan and dont drop."
>
> "Removing that (like Half Life Alyx did) would lower the authenticity and dumb
> down gun play in the favor of more arcade style gameplay."

Fonte: [Sights are off on most if not all guns :: Contractors VR](https://steamcommunity.com/app/963930/discussions/0/3104637814598891335/)
**OneStep não é marcado como Developer.**

**Leitura:** Contractors é hitscan (sem queda) e ainda assim nasce no cano — é a
prova de que "nascer no cano" não é consequência técnica de ter projétil, é
**escolha de autenticidade**. E a mesma citação é a única fonte que localizei
dizendo que **Alyx faz o contrário** (§1.4).

### 1.4 Half-Life: Alyx — a pista mais interessante, e a fonte mais fraca

A única afirmação encontrada sobre a origem do tiro em Alyx é a frase de OneStep
acima: *"Removing that (like Half Life Alyx did)"*. É **relato de jogador, uma
única ocorrência, em fórum de outro jogo**, e não achei confirmação por parte da
Valve nem por medição publicada. Registrado aqui como **pista, não como fato** —
ver §7.

O que É documentado de Alyx e vale para este projeto (já está em
`referencia-arma-mira.md`) é que o jogo **exige alinhar a alça de verdade** como
mecânica base, e que a mira laser opcional *"shows precisely where your shots will
land"* — ou seja, quando a Valve quer garantir que o jogador saiba onde a bala
vai, ela desenha uma linha, e essa linha é autoritativa.
Fonte: [Half-Life: Alyx | Weapon Upgrades | User Tips](https://www.vrone.co.uk/articles/half-life-alyx-weapon-upgrades-user-guide)

### 1.5 Population: One — a saída pelo retículo desenhado

Blog oficial da Meta, *Oculus Tips & Tricks: POPULATION: ONE*:

> "Reach forward and use your grab button to two hand your gun. This will reduce
> recoil to give you more accurate shots. Use a two handed grip and iron sights
> for the most accurate firing."

Fonte: [Meta — Oculus Tips & Tricks: POPULATION: ONE](https://www.meta.com/blog/oculus-tips-tricks-population-one/)

Não achei fonte de desenvolvedor para a origem da bala. O que é reportado por
crítica é que o jogo desenha um retículo para tornar o tiro de quadril viável —
sem citação literal utilizável (ver §7).

### 1.6 Fora do VR: **Battlefield resolve exatamente como esta base resolveu**

Wikitext da *Battlefield Wiki*, artigo *Projectile mechanics* (obtido pela API do
Fandom; a página HTML devolve HTTP 402):

> "Scopes used on in-game firearms may not reflect their real-world use. Actual
> weapon sights are "zeroed" on a point a set distance away (e.g. 300 meters)
> where projectiles from the weapon are expected to cross. The scope is thus
> pointing slightly downward from the axis of the gun barrel. Inside of the
> zeroed distance, the projectile is slightly higher than the scope's axis, a
> trivial matter given the size of the target."

> "In game, when aiming down sight or in a vehicle, the game engine actually
> emits the projectile *from the scope*, ensuring that the weapon will impact on
> target regardless of the position of the barrel (which may be clipping through
> an object). **The projectile's initial motion is parallel to the scope's
> axis.**"

Fonte: [Battlefield Wiki — Projectile mechanics](https://battlefield.fandom.com/wiki/Projectile_mechanics)

**Leitura:** é literalmente a solução que este repositório implementou em
`game.js` — origem sobre a linha de mira, direção paralela ao eixo da mira,
efeito visual saindo do cano. Numa franquia AAA, há uma década, com o motivo
escrito: garantir o impacto no alvo **independentemente de onde o cano está**.
Não é gambiarra deste porte; é prática publicada do gênero, só que fora do VR.

### 1.7 O que os motores e os manuais dizem sobre a origem

**NeoFPS** (kit comercial de FPS para Unity), manual, *Hitscan vs Projectiles*:

> "The shooter module picks a direction for the shot based on the camera
> direction, the weapon direction, and the current accuracy of the firearm and
> draws a straight line from the muzzle tip to the first thing it hits."

Fonte: [NeoFPS — Hitscan vs Projectiles](https://docs.neofps.com/manual/weapons-firearms-hitscan-projectiles.html)

Ou seja: **direção da câmera, origem no cano** — o oposto da escolha deste jogo,
e o mesmo desenho de Onward/Pavlov.

**Artigo técnico sobre origem de bala em FPS** (ipwnponies, *How Bullets Work In FPS*):

> "The obvious choice is to have the bullet origin from the gun barrel. This
> makes intuitive sense, as it matches reality."
>
> "Due to parallax, there's a skew from where you aim and the angle of the bullet."
>
> "At close distances, it can lead to wonky characteristics."
>
> "The other common way to model bullets is coming from the eyes. The motivation
> is to have this origin at the same place as the camera."
>
> "The primary benefit is 1:1 mapping to user's perspective: if they can see it,
> they can shoot it."
>
> "This allows 'head glitching', where a player can shoot as long as they can
> peek over a wall."

Fonte: [How Bullets Work In FPS](https://ipwnponies.github.io/gaming/2021/09/21/fps-hitscan-projectile.html)

**Leitura:** as duas opções e os dois preços, escritos. Origem no cano paga
paralaxe de perto. Origem no olho paga **head glitching**. A origem deste jogo —
na linha de mira, na estação longitudinal do cano — fica **entre as duas**: não é
o olho (não está a 44–91 cm atrás), é um ponto na própria arma, 6 a 20 cm acima
do cano. O risco de head glitching residual existe e é pequeno; ele vira um
critério mensurável em [§9](#9-recomendação-de-texto-para-b7).

---

## 2. Como o gênero trata *sight height over bore*

**Resposta curta: não trata. Assume, e manda o jogador calibrar a ARMA.**

Nenhum dos jogos de VR pesquisados move a origem da bala para resolver o
desalinhamento. O que eles oferecem é **calibração por arma da POSE do modelo em
relação ao controle** — que é o problema vizinho (coronha física, ângulo de
punho), não o height over bore:

> **Josh86** (25/08/2023, sobre Pavlov): "the shooting range map has a way to
> calibrate each weapon angle/offset or set all weapons to a global calibration.
> It's on the right side lane of the range."

Fonte: [does the game have gunstock calibration? :: Pavlov VR](https://steamcommunity.com/app/555160/discussions/0/3826424631147507801/)

Guia de fabricante de coronha, por jogo:

> **Contractors VR:** "It has a great gunstock calibration feature that allows you
> to optimize each weapon!"
> **Onward:** "The nice thing about it is it also has a robust gunstock
> calibration feature."
> **Pavlov:** "It has a gunstock calibration feature in the shooting range."
> **Breachers:** "You can adjust the weapon angle. For Index version, you can set
> it up from -30 to -40 degrees to make it line up properly."
> **Ghost of Tabor:** "You will need to manually calibrate each time you change
> weapon."

Fonte: [Sanlaki — Game settings for the Sanlaki gunstock](https://sanlaki.shop/blogs/news/game-settings-for-the-sanlaki-gunstock)

E o mercado de coronhas existe justamente porque em VR o ADS é físico — já
documentado em `referencia-arma-mira.md` §2.3.

**Conclusão para este projeto:** a régua não pode citar "o gênero" como fonte de
que o tiro tem de nascer no cano *e* na alça. O gênero nasce no cano, aceita o
erro de perto, e chama isso de autenticidade. Este jogo tem uma alça **1,5 a 5×
mais alta que a de um fuzil real** (6–20 cm contra ~4 cm), então herdar o erro do
gênero aqui custa 1,5 a 5× mais caro. Ver os números em §4.

---

## 3. Zeragem dinâmica — alguém usa?

**Sim, fora do VR, e a literatura de fórum documenta exatamente o efeito
colateral que esta base mediu.** Nenhuma fonte de jogo de VR de referência foi
encontrada usando zeragem dinâmica.

A técnica está descrita como opção no artigo técnico já citado:

> "A game developer can account for this by adjusting the gun angle, depending on
> how far something is, like principal focus."

Fonte: [How Bullets Work In FPS](https://ipwnponies.github.io/gaming/2021/09/21/fps-hitscan-projectile.html)

Onde ela é padrão é em **terceira pessoa**, e o receituário está publicado no
fórum oficial da Epic:

> **midgunner66:** traçar da câmera/retículo para o mundo, usar o ponto de impacto
> como alvo, e disparar o projétil da boca do cano na direção desse ponto — "the
> character always aims at what the reticle is on."
>
> Ressalva do próprio autor: "If the character's weapon is blocked by something
> (like when hiding behind a wall), they will be able to shoot through it since
> the shot is coming from the camera rather than the weapon."

Fonte: [Firing at Offset (Not Centered) Crosshair (3rd Person) — Epic Developer Community](https://forums.unrealengine.com/t/firing-at-offset-not-centered-crosshair-3rd-person/247920)

**E o efeito colateral é reclamação conhecida do gênero de terceira pessoa:** a
convergência muda com o que está na frente, então o ponto de impacto anda. Não
consegui extrair citação literal utilizável de nenhum dos tópicos que a busca
apontou (ver §7) — o que me deixa **sem fonte externa para o efeito colateral**.

**A medição desta base fica sendo a evidência principal, e ela é forte:**
`docs/vr/validacao-fa9ed86.md` e o cabeçalho de `test/xr-mira.test.js` registram
1,03 cm de deriva em três tiros idênticos no hitscan, e a bazuca com a distância
de zeragem variando de **5,60 m a 120,00 m entre dois tiros**, ângulo chegando a
**2,4172°** (2,23 m a 100 m).

**Veredito: CONFIRMADA a proibição.** A prática existe, é padrão em terceira
pessoa, e a ressalva publicada pelo próprio proponente é a de atirar através de
parede. Nenhum FPS de VR de referência foi encontrado usando-a. E o argumento
específico desta base — o ponto de impacto **andar entre um tiro e o outro**, o
que impede compensar na mão — não foi refutado por nenhuma fonte, e é o argumento
mais forte, porque em VR o jogador **não tem retículo de tela para recalibrar a
cada tiro**: ele tem a alça de ferro, que é fixa na arma.

---

## 4. O que se VÊ e o que ACERTA — separar é prática comum?

**Sim, é o padrão da indústria, e a separação já é maior do que a que este jogo
faz.**

Fórum oficial da Unity, *How do FPS' combine their bullet tracer/projectile
particles with raycast?*:

> **LiterallyJeff:** "An instant physics raycast, with bullet trace visual effect
> to simulate as if it had moved through space. The raycast hit is instantaneous,
> but the tracer or particles take a little time."

Fonte: [Unity Discussions](https://discussions.unity.com/t/how-do-fps-combine-their-bullet-tracer-projectile-particles-with-raycast/662801)

Ou seja: no FPS convencional o traçante **não é a bala** — ele é uma animação
desenhada depois que o resultado já foi decidido, e viaja em velocidade que a
bala não tem. A divergência entre o visto e o que acertou já é de **tempo
inteiro**. Somar a ela uma divergência de **origem de 6 a 20 cm** é aumento de
grau, não mudança de natureza.

E a Battlefield vai mais longe que este jogo (§1.6): lá o projétil **sai da
luneta** justamente para poder ignorar onde o cano está, inclusive quando o cano
atravessou um objeto.

### 4.1 Qual é o limite em que o jogador percebe?

**Não encontrei nenhum estudo sobre percepção da divergência traçante↔raio.** O
que existe, e é o vizinho mais próximo publicado, é o limiar de detecção de
**redirecionamento de mão** em VR — quanto a mão virtual pode ser deslocada da
real sem o usuário notar:

> "The findings show that the virtual hand can be unnoticeably displaced
> horizontally or vertically by up to 4.5° in either direction, respectively.
> This allows for a range of ca. 9°, in which users cannot reliably detect
> applied redirection."

— Zenner, A. e Krüger, A., *Estimating Detection Thresholds for Desktop-Scale
Hand Redirection in Virtual Reality*, IEEE VR 2019, Osaka.
Fonte: [pré-print, UMTL/DFKI, Universidade do Sarre](https://umtl.cs.uni-saarland.de/paper_preprints/zenner-krueger-hand-redirection-thresholds-vr-19-pre-print.pdf)
· [página do projeto](https://umtl.cs.uni-saarland.de/research/projects/hand-redirection-thresholds.html)

**Use com cuidado:** esse limiar mede uma discrepância *proprioceptiva* (a mão
que o jogador sente contra a mão que ele vê). O traçante não é o corpo do
jogador, então 4,5° não é o limiar da divergência de traçante. Está aqui como o
único número revisado por pares que localizei, e como **teto pessimista**: se
nem uma discrepância na própria mão é notada abaixo de ~4,5°, uma discrepância
num risco de luz que dura dois quadros não deveria ser.

### 4.2 A geometria do que este jogo mostra hoje — medido

O traçante do hitscan sai da **boca** (`FX.spawnTracer(_v3, _hitPos, …)` em
`game.js`, com `_v3 = muzzle.getWorldPosition`) e termina no **ponto de impacto
real**. Logo é uma reta honesta: começa na arma, acaba onde a bala acabou. O
único artefato geométrico é ela não ser exatamente paralela ao cano.

Ângulo entre o traçante (boca→impacto) e o eixo do cano, por arma e distância
(graus) — calculado da altura de alça de cada perfil:

| arma | 2 m | 5 m | 10 m | 25 m | 50 m | 100 m |
|---|---|---|---|---|---|---|
| FUZIL "VAGALUME" | 2,605 | 1,043 | 0,521 | 0,209 | 0,104 | 0,052 |
| ESCOPETA "TROVÃO" | 5,171 | 2,073 | 1,037 | 0,415 | 0,207 | 0,104 |
| DMR "FALCÃO" | 2,005 | 0,802 | 0,401 | 0,160 | 0,080 | 0,040 |
| PLASMA "VISITANTE" | 5,711 | 2,291 | 1,146 | 0,458 | 0,229 | 0,115 |
| SNIPER "AGULHA" | 1,687 | 0,675 | 0,337 | 0,135 | 0,067 | 0,034 |
| ESCOPETA "RAJADA" | 2,634 | 1,054 | 0,527 | 0,211 | 0,105 | 0,053 |

O pior caso do arsenal inteiro é o plasma a 2 m: **5,711°**. Acima dos 4,5° do
limiar de mão, num alvo colado; a 5 m já cai para 2,291°, e a partir de 10 m
nenhuma arma passa de 1,15°.

> **Comando:** `node -e '…atan(altura/dist)…'` com as alturas de §8. Reproduzível
> sem o jogo rodando.

### 4.3 Achado colateral, e é um defeito: **o traçante do BR NÃO sai do cano**

O texto do `CLAUDE.md` diz "traçante e clarão saem da boca (sempre saíram)". Isso
é verdade para o **hitscan** e para o **clarão** (`muzzleFlash()` está preso à
âncora do cano). **Não é verdade para o caminho do BR**, que é o modo jogado de
verdade:

- `game.js` entrega ao `window.__BR_ballistics` a origem `_rayOrig` quando em XR
  — a origem BALÍSTICA, sobre a linha de mira;
- `br-game.js` guarda essa origem em `b.p` e desenha o traçante **a partir de
  `b.p`**: `MP.FX.spawnTracer(b.p, _bv, col)`, três ocorrências no laço de balas.

Ou seja: nas armas com `projSpeed`, em XR, o risco de luz **começa 6 a 20 cm
acima da boca**, no ar. É exatamente a família "consertar um caminho não alcança
os outros" que o `CLAUDE.md` já registra para o `fire()`. **Não medi em sessão** —
é leitura de código, e merece uma medição antes de virar conserto. É também o
melhor argumento de que o critério visual precisa existir e ser medido nos TRÊS
caminhos (ver [§9](#9-recomendação-de-texto-para-b7)).

---

## 5. Projétil VISÍVEL (foguete, granada) — qual é a prática?

**A prática é nascer na boca, e o deslocamento existente é para a FRENTE do
atirador, nunca para trás.** O código-fonte de `Quake` (id Software, QuakeC,
`W_FireRocket`):

```qc
setorigin (newmis, self.origin + v_forward*8 + '0 0 16');
```

Fonte: [id-Software/Quake — `QW/progs/weapons.qc`](https://github.com/id-Software/Quake/blob/master/QW/progs/weapons.qc)

O foguete nasce **8 unidades à frente e 16 acima da origem do jogador** — não na
posição do modelo da arma, e sim num ponto escolhido para estar **fora do
colisor do próprio atirador**. É a resposta de 1996 ao problema "míssil que
explode em quem atirou", e continua sendo a resposta: afaste a origem do corpo do
atirador ao longo da direção do tiro.

O contra-exemplo é a Battlefield (§1.6), que **tira** o projétil do cano ao mirar
justamente para que o cano poder estar dentro de uma parede não importe. Repare
que ali é hitscan/bala, não foguete com estilhaço.

**Nesta base o assunto já está medido e resolvido**: origem deslocada no foguete
detona perto de quem atirou — **42 de dano em si mesmo, medido**
(`CLAUDE.md`). Por isso a bazuca nasce na BOCA e voa paralela à alça, e é a única
arma que dá **0,0000** no B7 atual.

**Recomendação:** manter isso, e transformá-lo em cláusula explícita do critério
em vez de exceção implícita — porque hoje a bazuca "aprova" o B7 por um motivo
que o texto do B7 não menciona, e um dia alguém "conserta" a bazuca para a linha
de mira e reabre os 42 de dano.

---

## 6. Existe diretriz de plataforma sobre origem de tiro em VR?

**Não existe. Digo com todas as letras: não achei nenhuma diretriz de plataforma,
de motor ou de biblioteca que diga de onde o tiro deve nascer em VR.** O que
verifiquei, um a um:

| Fonte | Verificação | Resultado |
|---|---|---|
| **Meta Horizon — Seven Design Decisions** | Fetch da página, busca por shooting/weapon/aiming/projectile | **Nada.** A única menção a arma é sobre fadiga de mão: *"If your game uses the trigger to grip objects and players are expected to hold something (like a weapon) for a long period, consider a toggle to grip option to alleviate hand fatigue."* ([fonte](https://developers.meta.com/horizon/resources/seven-design-decisions/)) |
| **Meta Horizon — Asset guidelines / Comfort** | Busca | Nada sobre mira ou origem de tiro; a página de assets só diz *"Don't include weapons, violence, blood, and so on"* como regra de material de loja ([fonte](https://developers.meta.com/horizon/resources/asset-guidelines/)) |
| **Unity XR Interaction Toolkit** | Fetch do manual (3.0) | **Nenhum sistema de arma.** O pacote é *"a high-level, component-based, interaction system for creating VR and AR experiences"* — hover/select/grab, háptico, UI, XR Origin, simulador. O `rayOriginTransform` que aparece nos tutoriais é do **raio de INTERAÇÃO**, não de tiro ([fonte](https://docs.unity3d.com/Packages/com.unity.xr.interaction.toolkit@3.0/manual/index.html)) |
| **Godot XR Tools** | Listagem completa da árvore do repositório no GitHub | **Nenhum arquivo de arma, tiro, bala ou projétil.** Os únicos resultados para `pistol/weapon/gun/bullet/shoot` são `hands/animations/{left,right}/Pistol.res` (pose de mão) e um `.wav` de torcida. ([árvore](https://api.github.com/repos/GodotVR/godot-xr-tools/git/trees/master?recursive=1)) |
| **WebXR / W3C** | — | Não procurei diretriz de tiro; a spec trata de espaços de entrada (`gripSpace`/`targetRaySpace`), já documentado em `referencia-arma-mira.md` |

**Consequência para a régua:** B7 **não tem lastro de plataforma**. Ele foi
escrito, segundo o próprio texto do critério, como *"consequência direta de
B1/B3"* mais um argumento de anti-cheat. Os dois se sustentam? Ver §8.3 e §9.

---

## 7. O que NÃO foi encontrado

Seção obrigatória e honesta. Nada aqui foi preenchido com suposição.

1. **Nenhuma publicação de desenvolvedor sobre origem de tiro em VR além do post
   do Junt (Pavlov).** Um único post de fórum marcado "Developer" é toda a fonte
   primária do gênero que localizei. Não há GDC talk, post de engenharia, nem
   documentação técnica de Onward, Contractors, Alyx, Population One, Firewall,
   Ghosts of Tabor ou RE4 VR sobre isso.
2. **Half-Life: Alyx — onde nasce a bala: NÃO ENCONTRADO.** A única afirmação é
   de terceiro, num fórum de outro jogo (§1.4). Fiz três buscas com formulações
   diferentes. Se isso importar para a decisão, só fecha com medição no jogo, e
   isso está fora do alcance desta pesquisa.
3. **Population: One, Firewall Zero Hour, Firewall Ultra, Ghosts of Tabor, RE4
   VR — origem do tiro: NÃO ENCONTRADO.** Achei material sobre mira, coronha,
   retículo e calibração, nada sobre de onde o raio parte.
4. **Nenhuma fonte de dev sobre "zeragem que anda entre tiros" como defeito.**
   A técnica de convergência dinâmica está documentada (§3) e a ressalva de
   "atirar através de parede" também; o efeito de **deriva entre tiros** não
   consegui citar literalmente de nenhuma fonte externa. As buscas devolveram
   tópicos de terceira pessoa (Star Wars Battlefront, Unreal, itch devlogs) que,
   ao serem abertos, ou tratavam de outro problema, ou remetiam a um vídeo. A
   medição desta base é a única evidência.
5. **Limiar de percepção da divergência traçante↔raio: NÃO ENCONTRADO.** Só o
   vizinho de redirecionamento de mão (§4.1), que mede outra coisa.
6. **Escape from Tarkov:** o buscador afirma que a bala nasce no cano e não na
   câmera, mas **não consegui abrir nenhuma fonte primária com citação literal**.
   Fica na tabela de §1 marcado como sem citação — não use como argumento.
7. **`gamedev.net`** (tópico *Virtual Reality Weapons*, que parecia ser a
   discussão mais direta de dev sobre isso) devolveu **HTTP 403**; a **Battlefield
   Wiki** em HTML devolveu **HTTP 402** — esta última contornei pela API do
   Fandom e o texto de §1.6 é o wikitext literal.
8. **Nenhuma diretriz de plataforma existe** — §6. Isto é um "não encontrado"
   verificado, não uma busca que falhou.

---

## 8. Medido nesta base: o número do B7 é uma constante do MODELO

Esta é a descoberta que muda a decisão, e ela não precisou do jogo rodando.

### 8.1 Os sete números do B7 saem do `js/weaponrig.js` com uma calculadora

Para cada arma, calculei a distância perpendicular entre o ponto da **mira ativa**
e a **âncora `muzzle`**, direto das constantes do perfil:

| arma | perfil | mira ativa (x, y) | âncora `muzzle` (x, y) | Δ calculado | **B7 medido em sessão** |
|---|---|---|---|---|---|
| SNIPER "AGULHA" | idx 6 | (−0,015, 0,085) | (0, 0,028) | **0,0589** | 0,0589 |
| DMR "FALCÃO" | idx 2 | (0, 0,100) | (0, 0,030) | **0,0700** | 0,0700 |
| FUZIL "VAGALUME" | idx 0 | (0, 0,124) | (0, 0,033) | **0,0910** | 0,0910 |
| ESCOPETA "RAJADA" | idx 7 | (0, 0,122) | (0, 0,030) | **0,0920** | 0,0920 |
| ESCOPETA "TROVÃO" | idx 1 | (0, 0,226) | (0, 0,045) | **0,1810** | 0,1810 |
| PLASMA "VISITANTE" | idx 4 | (0, 0,210) | (0, 0,010) | **0,2000** | 0,2000 |
| FACA "AURORA" | idx 5 | punho (0,015, −0,055, 0,03) | ponta (0, 0,02, −0,4) | **0,4367** | 0,4367 |

**Sete de sete, ao quarto decimal.** Comando:

```
node -e 'const W=[["FUZIL",[0,0.124],[0,0.033]],["TROVAO",[0,0.226],[0,0.045]],
 ["FALCAO",[0,0.100],[0,0.030]],["PLASMA",[0,0.210],[0,0.010]],
 ["AGULHA",[-0.015,0.085],[0,0.028]],["RAJADA",[0,0.122],[0,0.030]]];
 for(const [n,s,m] of W) console.log(n, Math.hypot(s[0]-m[0], s[1]-m[1]).toFixed(4));'
```

### 8.2 O que isso significa

**O B7 não está medindo o código de tiro. Está medindo a altura da alça do
modelo.** Nenhuma alteração em `fire()` pode mudar esses números, porque a
implementação atual põe a origem exatamente sobre a linha de mira na estação
longitudinal do cano — e a distância dela até o cano **é, por definição
geométrica, a altura de alça**. Para o B7 aprovar do jeito que está escrito,
seria preciso **baixar as miras dos oito modelos até ≤ 5 cm do cano**, o que
muda o desenho das armas, ou **devolver a origem ao cano**, o que reabre o
defeito que B3 existe para impedir.

Um critério cujo número é uma constante do asset e não do comportamento **estava
medindo a coisa errada**. Não é que ele seja inconveniente; é que ele responde a
outra pergunta.

### 8.3 A justificativa de anti-cheat do B7 não se sustenta — verificado no código

O texto do B7 diz: *"o anti-cheat do servidor valida **range** a partir dessa
origem — uma origem errada é também risco de regressão de segurança"*. No código:

- `br-game.js:329` monta `const fromPos = [MP.player.pos.x, MP.player.pos.y + 1.5, MP.player.pos.z];`
  — **da posição do jogador, não da origem do raio**;
- `server.js:912` rejeita o disparo se `fromPos` estiver a mais de **5 m** da
  posição autoritativa do jogador.

Uma diferença de 6 a 20 cm na origem balística **não chega ao servidor** e, se
chegasse, estaria três ordens de grandeza dentro da tolerância. A justificativa
de segurança do B7 é falsa na implementação atual, e o próprio comentário do
`game.js` já registra isso ("medido por validação independente").

O que sobra do B7 são duas preocupações **legítimas**, e as duas são mensuráveis:
(a) o jogador não pode ver a bala nascer no vazio; (b) o jogador não pode atirar
de um ponto que o cano não alcança (head glitching). Nenhuma das duas é
respondida por "distância até a boca do cano".

---

## 9. Recomendação de texto para B7

> **Recomendo SUBSTITUIR o B7 por três cláusulas, e NÃO afrouxar o número.** Os
> 5 cm continuam valendo — mudam de sujeito. Hoje eles são cobrados de uma
> grandeza que é constante do asset (§8.1); passam a ser cobrados de duas
> grandezas que são comportamento do código e que o jogador enxerga.

### Texto proposto

---

**B7 · O tiro nasce na arma — e o que se VÊ nasce na boca**

*Substitui o B7 anterior ("a origem do raio a ≤ 5 cm da boca do cano"). Motivo da
substituição: o número que o critério anterior media é, ao quarto decimal, a
altura de alça de cada perfil de `js/weaponrig.js` — uma constante do modelo, que
nenhuma mudança em `fire()` altera (§8.1). O critério media a geometria do asset e
a chamava de comportamento do tiro. A justificativa de anti-cheat que ele
invocava também não se confirma no código: `br-game.js` monta `fromPos` da
posição do jogador e `server.js` tolera 5 m (§8.3).*

- **B7a — o que se vê sai da boca.** Todo efeito VISÍVEL de disparo — clarão,
  traçante e o primeiro segmento de qualquer projétil desenhado — começa a
  **≤ 0,05 m** da âncora `muzzle` do modelo, congelada no instante do tiro.
  Vale para os **três caminhos** de `fire()` (hitscan, `__BR_ballistics`,
  foguete). **Reprova:** acima, ou efeito ausente do grafo da cena.
  *Fonte:* é o que o gênero de FPS faz há décadas — o traçante é animação,
  não a bala ([Unity Discussions](https://discussions.unity.com/t/how-do-fps-combine-their-bullet-tracer-projectile-particles-with-raycast/662801));
  e é a única parte de "o tiro sai do cano" que o jogador consegue observar.
- **B7b — a origem balística é ponto da ARMA, sobre a linha de mira.** Decomposta
  contra o eixo do cano do modelo: a componente **longitudinal** até a boca é
  **≤ 0,02 m** (não pode nascer à frente da boca nem recuar para o olho), e a
  componente **transversal** é igual à altura de alça do perfil da mira ATIVA,
  com tolerância de **± 0,01 m**. **Reprova:** fora de qualquer das duas faixas —
  inclusive **abaixo**, porque transversal zero significa origem no cano e é o
  defeito de paralaxe que B3 existe para impedir.
  *Fonte:* [Battlefield Wiki — Projectile mechanics](https://battlefield.fandom.com/wiki/Projectile_mechanics):
  *"the game engine actually emits the projectile from the scope, ensuring that
  the weapon will impact on target regardless of the position of the barrel…
  The projectile's initial motion is parallel to the scope's axis."*
- **B7c — não se atira de dentro do sólido.** O segmento entre a boca do cano e a
  origem balística **não cruza geometria sólida**. **Reprova:** qualquer disparo
  cuja origem esteja do outro lado de uma parede em relação à boca.
  *Fonte:* é o preço publicado da origem no olho —
  *"This allows 'head glitching', where a player can shoot as long as they can
  peek over a wall"* ([How Bullets Work In FPS](https://ipwnponies.github.io/gaming/2021/09/21/fps-hitscan-projectile.html));
  e a mesma ressalva aparece no receituário da Epic ([Epic Dev Community](https://forums.unrealengine.com/t/firing-at-offset-not-centered-crosshair-3rd-person/247920)).
- **B7d — projétil VISÍVEL nasce na boca.** Arma cujo projétil é um objeto que o
  jogador vê voar (bazuca) tem origem balística **na boca**, ≤ 0,02 m, e voa
  paralela à linha de mira. **Reprova:** origem deslocada.
  *Motivo medido:* origem deslocada em foguete detona perto de quem atirou —
  **42 de dano em si mesmo**. *Fonte histórica:* id Software resolve o mesmo
  problema empurrando a origem para FORA do atirador
  (`setorigin (newmis, self.origin + v_forward*8 + '0 0 16')`,
  [`QW/progs/weapons.qc`](https://github.com/id-Software/Quake/blob/master/QW/progs/weapons.qc)).
- **Não se aplica a arma branca.** Ver B7-M, abaixo.

**B7-M · A faca golpeia da MÃO, na direção da LÂMINA**

*Critério separado porque a faca não tem cano nem alça; ver §11.*

- **Mede:** distância da origem do golpe à âncora `gripR` do perfil, e o ângulo
  entre a direção do golpe e o eixo `gripR → muzzle` (a lâmina) do modelo.
- **Aprova:** origem ≤ **0,05 m** do punho **e** ângulo ≤ **1°** da lâmina, com o
  alcance de `__BR_melee` idêntico ao do desktop. **Reprova:** acima.

---

### Por que isto não é afrouxar a régua

Três razões, e nenhuma delas é conveniência:

1. **O critério antigo media o asset, não o código** (§8.1). Sete números,
   sete acertos ao quarto decimal, calculados sem o jogo rodando. Uma régua que
   um `node -e` de três linhas prevê inteiramente não está medindo
   comportamento.
2. **O texto novo cobra MAIS coisas, não menos.** O antigo tinha uma asserção
   (distância até a boca) e ela era inalcançável por construção. O novo tem
   cinco, todas alcançáveis e todas capazes de reprovar: B7a pega o defeito do
   traçante do BR que existe **agora** (§4.3), B7b tem **teto e piso** (zero
   reprova), B7c é fiscalização de head glitching que **não existia**, B7d trava
   a bazuca em vez de deixá-la aprovar por acidente, B7-M mede a faca em vez de
   isentá-la.
3. **Nenhum jogo de referência satisfaz o B7 antigo junto com o B3.** Pavlov,
   Onward e Contractors nascem no cano e **falham o B3** — e os jogadores
   reclamam disso em três fóruns oficiais há dez anos (§1.1–1.3). Battlefield
   nasce na mira e **falharia o B7 antigo** — e é a franquia AAA que resolveu o
   problema. A régua antiga reprova todo o gênero, o que é sinal de régua torta,
   não de gênero errado.

### O que fica pendente de decisão do dono

- **B3 permanece intocado.** Ângulo ≤ 0,5° entre o raio disparado e a linha de
  mira do modelo. Nada nesta pesquisa contraria B3; ao contrário, a Battlefield
  o corrobora.
- **Ficam 6 a 20 cm de altura de alça no arsenal**, contra ~4 cm de um fuzil
  real. Isso é decisão de ARTE, não de código, e vale a pena ela ser tomada
  explicitamente: baixar a alça do plasma (0,2000) e da escopeta "Trovão"
  (0,1810) reduziria o ângulo traçante↔cano de perto (§4.2, 5,7° e 5,2° a 2 m).
  Não é pré-requisito de nenhum critério aqui.

---

## 10. Como MEDIR o critério novo no kit emulado

Grandeza física, sonda, defeito reinjetado — e por que nenhuma das medidas cai
nos dez formatos de "teste que passa por acidente".

### 10.1 A âncora independente

Toda medida abaixo se ancora em **geometria do modelo desenhado**, nunca no
código de mira:

```
canoMundo   = gun.group.matrixWorld × anchors.muzzle        (js/weaponrig.js)
eixoCano    = normalizar(canoMundo − (gun.group.matrixWorld × anchors.gripR))
miraMundo   = gun.group.matrixWorld × sight.eye / sight.front  (perfil da mira ATIVA)
alturaAlca  = |perpendicular de miraMundo ao eixoCano|         (constante do perfil)
```

Ninguém lê `miraDoTiro()`, `_miraDirDoTiro` nem `fonteDaMira()`. É a mesma
disciplina que o `test/xr-mira.test.js` já adotou depois do erro dele, e por o
mesmo motivo.

### 10.2 B7b — as duas componentes

**Grandeza:** metros, decompostos.

```
v          = origemDoTiro() − canoMundo        (ambos congelados no instante do tiro)
longitud   = v · eixoCano                       →  |longitud| ≤ 0,02 m
transvers  = |v − eixoCano·longitud|            →  |transvers − alturaAlca| ≤ 0,01 m
```

**Defeitos reinjetados e o número que cada um produz:**

| mutante | longitudinal | transversal | cor |
|---|---|---|---|
| origem volta para a boca (`_rayOrig.copy(_v3)`) | 0,00 | **0,0000** vs 0,0910 esperado | 🔴 |
| tirar a projeção `avanco` (origem fica no olho) | **−0,44 a −0,91 m** | 0,0910 | 🔴 |
| origem no `targetRaySpace` do controle | ~−0,5 m | ~0,3–0,5 m | 🔴 |
| origem sobe 10 cm extra na mira | 0,00 | **0,1910** vs 0,0910 | 🔴 |
| **código atual** | 0,000 | 0,0910 = 0,0910 | 🟢 |

### 10.3 B7a — o traçante, medido no grafo da cena

**Grandeza:** metros entre o **ponto inicial do objeto desenhado** e `canoMundo`.

Não ler o argumento passado a `FX.spawnTracer`: ler o **mesh no grafo**, subindo
a cadeia de pais até `scene` e falhando se ela não chegar lá. Isso mata o formato
5 de uma vez.

**Reinjeção:** trocar `FX.spawnTracer(_v3, …)` por `FX.spawnTracer(_rayOrig, …)`
no hitscan → 0,0910 m no fuzil, teto 0,05 → 🔴.
**E, hoje, sem reinjetar nada:** as armas com `projSpeed` em XR devem dar 0,0589
a 0,2000 m, porque `br-game.js` desenha de `b.p` (§4.3). Se este caso nascer
VERDE nas armas do BR, o caso está errado, não o produto.

### 10.4 B7c — atravessar sólido

**Grandeza:** booleano com número — `MP.rayBlockedAt(canoMundo, dir(cano→origem),
|v|)` menor que `|v|`. Cenário: jogador encostado numa mureta com o cano abaixo
do topo e a alça acima. **Reinjeção:** subir a origem 40 cm → o segmento cruza a
mureta → 🔴.

### 10.5 Por que não cai em nenhum dos dez formatos

| # | formato | por que não |
|---|---|---|
| 1 | asserção que não pode falhar | `transvers` tem **teto E piso** em torno de um valor não-nulo por arma; origem no cano dá 0 e reprova, origem no olho dá 0,44 m e reprova. Um `.normalize()` não produz nenhum desses números. |
| 2 | **comparar uma reta com ela mesma** | A referência é `gun.group.matrixWorld` × constantes de `js/weaponrig.js`. O código de tiro **não escreve** essas constantes nem essa matriz. É o mesmo caminho que o `xr-mira.test.js` adotou depois de calcular 1,86e-15 m comparando `miraDoTiro()` consigo mesma. **E fica o alerta:** a asserção `r.naLinha < 0.002` que hoje vive em `test/xr-mira.test.js` **É este formato** — `_rayOrig` é obtido de `miraOrigem()` e depois avançado ao longo de `_rayDir`, então a distância dele à linha de mira é zero por álgebra. Recomendo trocá-la por `transvers` de §10.2. |
| 3 | medir o eixo em que o defeito não aparece | A medida é **decomposta de propósito** e as DUAS componentes são afirmadas. A longitudinal pega "nasceu à frente/atrás"; a transversal pega "saiu da linha de mira". Nenhum mutante da tabela de §10.2 escapa pelas duas. |
| 4 | o teste dirigir o produto | O disparo sai pelo **gatilho do Touch** no kit emulado, dentro do laço do jogo. O teste não chama `fire()` nem `marcarTiroQA`; ele lê `__game.origemDoTiro()` e o grafo da cena depois do frame. |
| 5 | ler `visible` sem perguntar se está no grafo | §10.3 exige a cadeia de pais até `scene`. |
| 6 | outro guarda segurando o caso | As três cláusulas são **casos separados**, e a reinjeção é feita uma de cada vez, com o número anotado. Nenhum mutante da tabela reprova por mais de um motivo simultâneo — se reprovar, o caso é dividido. |
| 7 | `\|\|` com termo que se satisfaz sozinho | Toda asserção é **um escalar contra um limite**. Não há disjunção em lugar nenhum. |
| 8 | dublê bom demais | Não há dublê: o kit emulado é a plataforma (IWER) e a âncora é o modelo real carregado (GLB ou procedural — `sightCoords` já escolhe o conjunto certo). |
| 9 | cenário que não exercita o limiar | O caso roda o **FUZIL com as três miras**: `iron` 0,0910 · `reddot` 0,1520 · `scope2x` 0,1570. O valor esperado **muda dentro do mesmo teste**. Um mutante que fixe um deslocamento constante passa arma a arma e **reprova ao trocar de mira**. |
| 10 | a condição que valida esconde o defeito | Caso complementar obrigatório: repetir com a arma **rolada 90°** e com o braço estendido para o lado, de modo que a altura de alça deixe de ser vertical no mundo. Um mutante que some `+Y` fixo em espaço de MUNDO passa com a arma em pé e reprova a 90°. |

### 10.6 ⚠️ Achado grave: **o caso PRINCIPAL do B3 hoje é formato 2**

Não é o `naLinha` só. É o caso *"o raio disparado passa pelo ponto que a alça
indica — em toda distância"*, que é a asserção central do
`test/xr-mira.test.js` e a única do B3.

A sonda calcula, na linha 129:

```js
erros[d] = aoRaio(mO.clone().addScaledVector(mD, d), O, D.clone().normalize());
```

com `mO, mD` vindos de `G.miraDoTiro()` e `O, D` de `G.origemDoTiro()` /
`G.direcaoDoTiro()`. No `game.js`, dentro do MESMO `fire()` síncrono:

```js
_miraOrigDoTiro.copy(_rayOrig);          //  mO := origem
miraDirecao(_miraDirDoTiro);             //  mD := miraDirecao()
if (XR.presenting) { _rayDir.copy(_miraDirDoTiro);
                     _rayOrig.addScaledVector(_rayDir, avanco); }
_origemDoTiro.copy(_rayOrig);            //  O  := mO + avanco·mD
…
miraDirecao(_rayDir);                    //  D  := miraDirecao()  ==  mD
if (p === 0) _direcaoDoTiro.copy(_rayDir);
```

Logo **`O` está sobre a reta `(mO, mD)` e `D` É `mD`**. A distância de
`mO + mD·d` à reta `(O, D)` é **zero por álgebra, para todo `d`** — e no desktop
também, porque lá a origem nem é avançada. O caso não pode ficar vermelho.

É a mesma armadilha que o cabeçalho do arquivo diz ter consertado. O conserto de
fato entrou — mas em `grausDoCano` (a comparação contra o cano), que só é
afirmado nos casos do PROJÉTIL e da BAZUCA. O caso principal continuou lendo
`miraDoTiro()`.

**Como confirmar sem adivinhar:** reinjete o mutante que já provou isso uma vez —
girar o eixo óptico em 6° dentro do `xrweapon.js`. Se `erros[d]` continuar na casa
de 1e-15 enquanto `grausDoCano` estoura, está confirmado.

**Como consertar:** trocar `mO/mD` pela linha de mira derivada do MODELO (§10.1),
que é `gun.group.matrixWorld` × as constantes `eye`/`front` do perfil da mira
ativa. Aí `erros[d]` passa a medir o que o nome dele diz.

*(Este achado é leitura de código, não medição em sessão. Está aqui porque o item
4 da encomenda pede explicitamente que a medida nova não caia no formato 2 — e
não dá para responder isso sem dizer que a medida ATUAL cai.)*

---

## 11. O caso da FACA (0,4367 m)

**Arma branca não tem cano, e o número que o B7 cobra dela é o comprimento da
lâmina.**

O perfil `idx 5` de `js/weaponrig.js` tem `sights: []` — a faca não tem mira
nenhuma — e duas âncoras: `gripR: [0.015, -0.055, 0.03]` (o punho) e
`muzzle: [0, 0.02, -0.4]` (a PONTA da lâmina; o campo se chama `muzzle` porque é
o mesmo segmento que o deslizamento da mão de apoio usa, não porque exista boca
de cano). A distância entre os dois:

```
|(0,015; −0,075; 0,43)| = 0,43675 m
```

O B7 mede **0,4367 m**. É a mesma conta. A "falha" do critério é o tamanho da
faca, medido do punho até a ponta.

Cobrar ≤ 5 cm disso significa exigir que o golpe **nasça na ponta da lâmina** —
uma faca de 5 cm de alcance útil, que só acerta o que a ponta já encostou. E
mexeria no alcance de `__BR_melee` (2,6 m), que é constante de game design,
idêntica no monitor, e cujo comentário no `game.js` já registra que mudá-la seria
"mudar balanceamento a pretexto de conserto de VR".

**O critério não deve valer para ela — mas isentar não é o mesmo que medir.** Uma
isenção escrita dentro do B7 é exatamente como uma régua começa a afrouxar. A
recomendação é o **B7-M** de §9: origem do golpe ≤ 5 cm do **punho** (que é onde
a mão do jogador está, e é a coisa análoga à boca do cano numa arma branca),
direção ≤ 1° do eixo da lâmina, alcance inalterado. Isso continua reprovando um
defeito real — o mesmo que já foi consertado uma vez, quando a diagonal
punho→ponta apontava **10,086° acima** de onde a faca aponta, 35 cm de erro a
2 m, na arma INICIAL do BR.

---

## 12. Resumo executivo

1. **O gênero de VR nasce no cano e paga o preço** — Pavlov (fonte de dev),
   Onward e Contractors, os três com reclamação pública de "atira baixo". Nenhum
   deles satisfaz o B3 desta régua.
2. **Quem resolveu o problema resolveu como este repositório resolveu**:
   Battlefield emite o projétil **da luneta**, paralelo ao eixo da mira,
   explicitamente para que a posição do cano não importe.
3. **Zeragem dinâmica: proibição CONFIRMADA.** Existe, é padrão em terceira
   pessoa, nenhum FPS de VR de referência usa, e a ressalva publicada pelo próprio
   receituário é atirar através de parede. O argumento da deriva entre tiros
   continua sendo medição desta base — não achei fonte externa.
4. **Separar o visto do que acerta é o padrão** e a divergência já é de tempo
   inteiro no FPS convencional. A divergência angular deste jogo é ≤ 5,71° na
   pior arma a 2 m, e ≤ 1,15° a partir de 10 m.
5. **Não existe diretriz de plataforma** — Meta, Unity XRI e Godot XR Tools
   verificados um a um, nenhum tem sistema de arma ou palavra sobre origem de tiro.
6. **O B7 atual mede o asset, não o código**: os sete números saem do
   `js/weaponrig.js` com uma calculadora, e a justificativa de anti-cheat dele é
   falsa no código atual.
7. **Achado colateral que vale medição:** o traçante do caminho do BR
   (`__BR_ballistics` → `br-game.js`) **não sai do cano** em XR — sai da origem
   balística, 6 a 20 cm acima. É leitura de código, não medição em sessão.
8. **Achado GRAVE (§10.6):** o caso principal do B3 em `test/xr-mira.test.js`
   compara o raio disparado com a própria linha de mira que o gerou — `erros[d]`
   é **zero por álgebra**, em toda distância, em XR e no desktop. É o formato 2,
   no arquivo escrito para impedir o formato 2. Também é leitura de código;
   confirma-se reinjetando o mutante de 6° no eixo óptico.
