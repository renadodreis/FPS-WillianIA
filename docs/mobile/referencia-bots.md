# Bots justos num BR jogado no celular — o que a indústria e a literatura dizem

Pesquisa feita antes de mexer em `scripts/bots.js`, a partir da queixa do dono:
*"os bots estão apelões"* — jogando no celular, onde a mira humana é pior que no
PC. Nenhum código foi alterado nesta rodada.

**Formato.** Cada assunto segue: afirmação → FONTE (URL) → CITAÇÃO LITERAL em
inglês. Números concretos sempre que a fonte os dá. Onde a fonte é código, a
citação é a linha do código. No fim: o que **não** foi encontrado, e a
recomendação para este jogo, com cada item marcado:

- **[LASTRO]** — a fonte diz isso (e é citada acima);
- **[INFERÊNCIA]** — conta minha, adaptação ou número de partida a calibrar.

**Unidades.** Quake III, Counter-Strike (GoldSrc/Source) e Call of Duty usam
"unidades do motor". Nenhuma das fontes citadas declara a conversão para metro.
Onde converto, uso 1 unidade ≈ 1 polegada = 2,54 cm, e isso é **[INFERÊNCIA]**.
Unreal usa 65 536 unidades de rotação por volta (360°) — também **[INFERÊNCIA]**
na conversão para graus.

---

## 0. O que os bots fazem hoje (leitura de `scripts/bots.js`)

Não é pesquisa, é o ponto de partida. Linhas de `scripts/bots.js` no commit
`8f414c3`.

| Aspecto | Hoje | Onde |
|---|---|---|
| Quem vira alvo | Qualquer vivo a ≤ 100 m, **humano mais próximo antes de qualquer bot** | `selectTarget` (l. 30–47), chamada com `100` (l. 345) |
| Visão | Nenhuma: sem cone, sem linha de visada, sem postura, sem grama | — |
| Reação | `lastShot = -Infinity` ao começar (l. 195): atira no **primeiro tick** em que o alvo entra no alcance | l. 115–119, 398 |
| Ritmo | `cooldown + jitter`, com jitter `U(0; 0,45)` **re-sorteado a cada tick**; no fuzil (1,1 s) o intervalo médio sai ~1,33 s (conta minha sobre ticks de 100 ms) | l. 118, 398 |
| Acerto | Um sorteio por rajada contra `mira ∈ [0,4; 0,9]` fixo por bot; acertou, **todas** as balas da rajada entram | l. 262, 402 |
| O que o bot sabe do alvo | `pos`, fase, `isBot`. O servidor manda também `rotY` (para onde o humano olha), mas `observePlayerUpdate` o **descarta** | l. 212–227; `server.js` ~l. 805 |
| Postura do humano | **Não chega** ao bot: o `state` do cliente (`br-game.js` ~l. 1945) não tem agachado/deitado; `pos` é o pé (`game.js` l. 1620) | — |
| Tiro do humano | O servidor já difunde `playerFired` com `shooterId` e `fromPos` (`server.js` l. 914). Os bots **não escutam** | — |
| Erro visível | `shotFired` com `toPos` = pé do alvo ± 2 m em X/Z (traçante no chão) | l. 121–129 |

**TTK aproximado de UM bot contra humano sem colete** (cálculo a partir das
constantes, não medido em jogo — **[INFERÊNCIA]**): fuzil = 28 de dano por
rajada, ~1,33 s entre rajadas; 100 de vida pedem 4 rajadas certas. Com `mira`
0,9: ~4,4 tentativas → **~4,6 s**, contando que a primeira sai no instante zero.
Com `mira` 0,4: ~10 tentativas → ~12 s. Como **todos** os bots no raio escolhem
o humano, três bots dividem esse tempo por ~3 (~1,5 s no pior caso). O humano de
celular ainda está achando o inimigo na tela quando a primeira rajada já entrou.

---

## 1. Como os BRs comerciais usam bots

### 1.1 O papel declarado é o mesmo em todos: alvo para novato, some com a habilidade

**Fortnite (Epic, 2019)** — bots entram junto com o matchmaking por habilidade;
quanto melhor o jogador, menos bots.
FONTE: PC Gamer citando o post da Epic —
<https://www.pcgamer.com/fortnite-is-getting-skill-based-matchmaking-and-bots/>
(post original: <https://www.epicgames.com/fortnite/en-US/news/fortnite-matchmaking-update-battle-royale>)
> "They will behave similarly to normal players and will help provide a better
> path for players to grow in skill," / "Bots will work in conjunction with the
> new matchmaking system, and as your skill improves, you'll face fewer bots.
> Bots will not be present in Competitive playlists."

**PUBG (PC, Update 7.2, 2020)** — o motivo declarado é o novato morrendo cedo
sem causar dano; a proporção de bots varia com a habilidade.
FONTE: TheSixthAxis reproduzindo as notas da PUBG Corp —
<https://www.thesixthaxis.com/2020/05/20/pubg-update-7-2-pc-bots-ranked-patch-notes/>
> "We're seeing more often that many newer players are being eliminated early
> with no kills — and oftentimes with no damage dealt."
> "The ratio of bots in each match will change according to player skill and
> the matchmaking pool in each server."
> "Bots can perform basic actions such as walk/run/crouch/prone/shoot and are
> also capable of doing basic low height parkour, swimming, parachuting and
> looting. Leaning, jumping, ledge grab, and the use of throwables will be added
> at a later date."

**PUBG Mobile (2018)** — nunca declarado oficialmente; a imprensa registrou
bots "fáceis de matar" no começo, sumindo com o nível.
FONTE: Wccftech (secundária, citando The Verge) — <https://wccftech.com/pubg-mobile-bots/>
> "PUBG Mobile initially fills games with easy-to-kill AI bots, then gradually
> increases the number of real players as your level goes up."
> "The mobile version of PUBG never explicitly states that it uses bots, and
> publishers PUBG Corp. and Tencent have yet to comment"

**Warzone Mobile (Activision)** — bots para tempo de fila e para a dificuldade do
novato.
FONTE: Dexerto citando os posts oficiais —
<https://www.dexerto.com/call-of-duty/warzone-mobile-lobbies-fill-with-bots-following-aprils-season-3-update-2633922/>
> "the game's April 2 update adjusted matchmaking and other levers "to improve
> the level of difficulty for new players.""
> "stating in a social media post that "some bots may exist for the sake of
> optimal matchmaking times.""

**Apex Legends (Respawn, 2025)** — bots só em lobby de nível baixo, só como
oponentes, medidos como teste.
FONTE: EA/Respawn, dev update —
<https://www.ea.com/nb/games/apex-legends/apex-legends/news/dev-update-0225>
> "We've slowly been introducing a small and deliberate amount of npc bots,
> "Apex Bots," into lower-tier public lobbies. These bots only deploy as
> opponents and will be a full squad; your squad will not be filled."
> "Enemy bots don't always create the best in-game experience, so it's worth
> repeating that this is a test. We'll be monitoring and measuring for impact in
> a few areas: decreasing skill width, decreasing overall queue wait times, and
> whether or not this helps players increase their game sense and combat
> effectiveness."

**CoD Mobile e Free Fire** — nenhuma declaração oficial com conteúdo técnico
encontrada (ver seção 6). A GameRevolution registra, para o CoD Mobile:
FONTE: <https://www.gamerevolution.com/guides/602833-call-of-duty-mobile-bots-ai>
> "There's been no official word from publisher Activision or developers Tencent
> and Timi Studios if bots are present in CoD Mobile."

### 1.2 O caso que mais se parece com o nosso: PUBG 12.1 deixou os bots fortes demais

Em 2021 a PUBG reforçou os bots; os jogadores os acusaram de *aimbot* e
*wallhack*; um hotfix derrubou precisão e reação em dias. É a mesma queixa do dono,
num jogo de tamanho AAA.
FONTE: PC Gamer — <https://www.pcgamer.com/pubgs-terrifying-bots-have-been-toned-back-down/>
> "Clips shared across Reddit and Twitter show bots with absolutely frightening
> reaction times and accuracy, the kind of thing that'd have you immediately
> slamming the report button were it a human player."
> "In response to recent player feedback, we have deployed an update with
> additional changes to the bot balance adjustments applied in Update 12.1;
> reducing the overall strength and effectiveness of bots when engaged in combat
> against players," wrote PUBG Corp.

As três mudanças do hotfix, literais das notas (9 jun. 2021):
FONTE: NME — <https://www.nme.com/news/gaming-news/player-unknowns-battlegrounds-bots-get-nerfed-in-new-patch-2964918>
> "Reduced overall firing accuracy when shooting players."
> "reduced the engagement distance at which bots switch to full-auto firing
> mode, preferring single-fire mode at longer distances."
> "Bots now engage less quickly after acquiring their target."

Leitura: as três alavancas que a PUBG mexeu — **precisão contra jogador**,
**tempo até engajar depois de adquirir o alvo** e **cadência a distância** — são
exatamente as três que hoje estão no máximo nos nossos bots.

---

## 2. Modelos de mira de IA

### 2.1 Tempo de reação — valores publicados

**Counter-Strike 1.6 / Condition Zero** (arquivo de perfis de Michael Booth,
autor do bot oficial). `ReactionTime` e `AttackDelay` em segundos.
FONTE (cópia do arquivo do jogo): <https://github.com/professorDeveloper/CS-1.6/blob/main/BotProfile.db>

| Template | Skill | ReactionTime | AttackDelay |
|---|---|---|---|
| Easy | 0 | **0.5** | **1.5** |
| Fair | 25 | 0.4 | 1.0 |
| Normal | 50 | 0.4 | 0.7 |
| Tough | 60 | 0.3 | 0.35 |
| Hard | 75 | 0.25 | — (herda 0) |
| VeryHard | 80 | 0.25 | — |
| Expert | 90 | 0.2 | — |
| Elite | 100 | 0.2 | — |

**Counter-Strike 2** (arquivo atual do jogo, extraído pelo SteamTracking).
FONTE: <https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/botprofile.db>

| Template | Skill | ReactionTime | AttackDelay |
|---|---|---|---|
| Easy | 5 | **0.60** | **.70** |
| Fair | 25 | 0.60 | .90 |
| Normal | 50 | 0.60 | .80 |
| Tough | 60 | 0.50 | .70 |
| Hard | 75 | 0.40 | — |
| VeryHard | 80 | 0.30 | — |
| Expert | 90 | 0.20 | — |
| Elite | 100 | 0.05 | — |

O que `AttackDelay` faz, no código do bot (ReGameDLL_CS, reimplementação
pública do CS 1.6):
FONTE: <https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/bot/cs_bot_weapon.cpp>
> `if (gpGlobals->time > m_fireWeaponTimestamp && GetTimeSinceAcquiredCurrentEnemy() >= GetProfile()->GetAttackDelay() && GetTimeSinceAcquiredCurrentEnemy() >= GetSurpriseDelay())`

Ou seja: **reação** atrasa o *perceber*; **AttackDelay** atrasa o *primeiro
disparo* depois de perceber. Somados, o bot Easy do CS 1.6 leva **2,0 s** do
alvo aparecer ao primeiro tiro; o Normal do CS2, **1,4 s**.

**Como a reação é implementada — e a 10 Hz, como os nossos bots.** O bot
guarda uma fila circular do que viu a cada "pensamento" e age sobre a entrada
de *N* passos atrás:
FONTE: <https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/bot/cs_bot_vision.cpp>
> `// "rewind" time back to our reaction time`
> `int reactionTimeSteps = int((reactionTime / g_flBotFullThinkInterval) + 0.5f);`

FONTE: <https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/game_shared/bot/bot.h>
> `constexpr float g_flBotFullThinkInterval = 1.0 / 10.0;`

A fila tem `MAX_ENEMY_QUEUE = 20` entradas (2 s a 10 Hz). O bot do CS "pensa" a
10 Hz — o mesmo passo do `setInterval(…, 100)` de `scripts/bots.js`.

**Quake III Arena** — a tese do autor do bot define reação em segundos e o
código a aplica a partir do instante em que o inimigo foi visto.
FONTE: van Waveren, *The Quake III Arena Bot* (2001) —
<http://www.kbs.twi.tudelft.nl/docs/MSc/2001/Waveren_Jean-Paul_van/thesis.pdf>
> "Reaction time — Reaction time in seconds."

FONTE: `ai_dmq3.c` (ioquake3) — <https://github.com/ioquake/ioq3/blob/main/code/game/ai_dmq3.c>
> `reactiontime = trap_Characteristic_BFloat(bs->character, CHARACTERISTIC_REACTIONTIME, 0, 1);`
> `if (bs->enemysight_time > FloatTime() - reactiontime) return;`

(Faixa declarada em `chars.h`: `CHARACTERISTIC_REACTIONTIME 6 //float [0, 5]`.)

**Unreal Tournament 3 (UDK)** — o bot mira na posição do alvo de
`TrackingReactionTime` atrás, extrapolada; se o alvo muda de direção, erra até
a reação alcançar.
FONTE: `UDKBot.uc` — <https://github.com/npruehs/hostile-worlds/blob/master/src/Hostile%20Worlds/Development/Src/UDKBase/classes/UDKBot.uc>
> "Bots actually aim at a position based that's predicted based on the target's
> position TrackingReactionTime ago, extrapolated using the target's velocity at
> that time. This means, for example, that if a target suddenly changes
> directions, bots will miss because they'll fire at where they thought he was
> going (until their reactio delay catches up"

> `BaseTrackingReactionTime=+0.25`

FONTE: `UTBot.uc` — <https://github.com/npruehs/hostile-worlds/blob/master/src/Hostile%20Worlds/Development/Src/UTGame/Classes/UTBot.uc>
> `TrackingReactionTime = BaseTrackingReactionTime * 7/(Skill+2);`

Números: skill 0 (Novice) → **0,875 s**; skill 3 → 0,35 s; skill 7 (Godlike) →
0,19 s.

**O autor do bot do CS resume a régua dos níveis** (Booth, GDC 2004):
FONTE: <https://media.gdcvault.com/gdc04/slides/making_of_official.pdf>
> "Easy – Poor reaction times – Terrible aim – Substantial additional delay
> before opening fire on victim – Poor weapon proficiency – Inferior Weapon
> selection"
> "Expert – Very good (but still human) reaction times – Excellent aim"

### 2.2 "Os primeiros tiros erram de propósito"

**Call of Duty 4 — `missTime`.** Ao começar a atirar no jogador, a IA tem
precisão **zero** por um tempo que cresce com a distância; é um aviso antes do
dano. Script oficial de dificuldade (distribuído nas Mod Tools do CoD4).
FONTE: <https://github.com/promod/CoD4-Mod-Tools/blob/master/raw/maps/_gameskill.gsc>
> `// missTime is a number based on the distance from the AI to the player + some baseline`
> `// it simulates bad aim as the AI starts shooting, and helps give the player a warning before they get hit.`
> `// missTime = missTimeConstant + distance * missTimeDistanceFactor`
> `level.difficultySettings[ "missTimeConstant" ][ "easy" ]     = 1.0;`
> `level.difficultySettings[ "missTimeConstant" ][ "normal" ]   = 0.05;`
> `level.difficultySettings[ "missTimeDistanceFactor" ][ "easy" ]     = 0.8  / 1000;`
> `level.difficultySettings[ "missTimeDistanceFactor" ][ "normal" ]   = 0.1  / 1000;`

E, dentro da janela, a precisão é zerada:
> `if ( self.a.missTime > gettime() )`
> `{`
> `	self.accuracy = 0;`

A janela só rearma se a IA ficou uns segundos sem atirar:
> `// we can only start missing again if it's been a few seconds since we last shot`
> `self.a.missTimeDebounce = gettime() + 3000;`

Convertido (1 un. = 2,54 cm, **[INFERÊNCIA]**): Easy = **1,0 s + 0,0315 s/m**
(30 m → 1,9 s; 85 m → 3,7 s); Normal = 0,05 s + 0,0039 s/m (30 m → 0,17 s).

**Call of Duty 4 — sniper.** O primeiro tiro de sniper num alvo novo além de
500 unidades (~12,7 m) **sempre erra**; no Easy erra duas vezes.
Mesma FONTE:
> `if ( ( !isDefined( self.lastMissedEnemy ) || self.enemy != self.lastMissedEnemy ) && distanceSquared( self.origin, self.enemy.origin ) > 500 * 500 )`
> `{`
> `	// miss`
> `	self.accuracy = 0;`
> `if ( level.gameSkill < 1 && self.sniperHitCount == 1 )`
> `	self.lastMissedEnemy = undefined;// miss again`

**Lidén, *Artificial Stupidity* (AI Game Programming Wisdom 2, 2003)** — o
texto de referência sobre errar de propósito.
FONTE: <http://web.archive.org/web/2019id_/http://www.liden.cc/lars/WEB/Resume/Papers/2003_AIWisdom.pdf>
> "For weapons that do more damage, such as those that kill with one or two
> shots, something more than bad aim is required. In general, it is not fun to
> suddenly and unexpectedly take large amounts of damage. Players often feel
> cheated in such situations. One can alleviate this frustration by
> intentionally missing the player the first time. Doing so gives the player a
> second to react and maintains a high level of tension."
> "opponent NPCs should move the first time they see the player rather than
> shoot at them."
> "Intentional misses, particularly those coming from behind the player, can
> alleviate this problem by indicating the direction of attack without breaking
> the illusion of reality."

**Halo (kit de edição oficial, documentado pela comunidade).** O `actor_variant`
tem atraso antes da primeira rajada num alvo novo, e a rajada **começa ao lado
do alvo e anda até ele**.
FONTE: c20 (Reclaimers) — <https://c20.reclaimers.net/h1/tags/actor_variant/>
> First Burst Delay Time: "The delay in seconds before the actor starts its
> first burst on a new target."
> Burst Origin Radius: "The starting point of the burst, randomly to the left or
> right of the target in world units."
> Burst Return Length: "How far the burst point moves back towards the target."
> New Target Firing Pattern Time: "How long this AI follows "New target" firing
> modifiers when first engaging a target."
> New Target Projectile Error: "Multiplier for projectile error in the new
> target state. No effect if 0."
> Moving Projectile Error: "Multiplier for projectile error in the moving state.
> No effect if 0."

Ou seja: o Halo tem estados separados de disparo para **alvo novo** e para
**IA andando**, cada um com seu multiplicador de erro — os mesmos dois eixos do
CoD4 (`missTime` e `run_accuracy`) com outro nome.

### 2.3 Erro de mira como cone que fecha com o tempo de exposição

**Counter-Strike 2 — `AimFocus`.** Cone inicial em graus que encolhe por
segundo. Os comentários estão no próprio arquivo do jogo.
FONTE: <https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/botprofile.db>
> `AimFocusInitial = 20			// initial focus spread in degrees (from desired center)`
> `AimFocusDecay = 0.7				// how much focus shrinks per second (.25 = 25% of size after 1 sec)`
> `AimFocusOffsetScale = 0.30		// controls accuracy when tracking to target (0 == perfect, should always be < 1)`
> `AimfocusInterval = 0.8			// how often focus is adjusted (smaller intervals means better movement tracking)`

| Template | AimFocusInitial | AimFocusDecay | Cone após 1 s / 2 s / 3 s |
|---|---|---|---|
| Easy | **20°** | 0.7 | 14° / 9,8° / 6,9° |
| Fair | 17° | 0.6 | 10,2° / 6,1° / 3,7° |
| Normal | 12° | 0.5 | 6° / 3° / 1,5° |
| Hard | 10° | 0.4 | 4° / 1,6° / 0,6° |
| Expert | 2° | 0.2 | 0,4° / 0,08° / — |
| Elite | 0,5° | 0.1 | 0,05° / — / — |

(As três colunas finais são `inicial × decay^t`, conta minha.)

**Counter-Strike 1.6 — "focus in".** A precisão melhora enquanto o bot não
gira a vista, de 2 a 5 s, com teto de 75 %; girar a vista zera o foco. O erro
máximo é 10 % da distância.
FONTE: <https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/bot/cs_bot_weapon.cpp>
> `// if our accuracy is less than perfect, it will improve as we "focus in" while not rotating our view`
> `// if we moved our view, reset our "focus" mechanism`
> `// focusTime is the time it takes for a bot to "focus in" for very good aim, from 2 to 5 seconds`
> `const float focusTime = Q_max(5.0f * (1.0f - accuracy), 2.0f);`
> `const float maxFocusAccuracy = 0.75f;`
> `const real_t maxOffset = range * (real_t(m_iFOV) / DEFAULT_FOV) * 0.1;`

Booth lista isso como momento de jogo, não como defeito — "Exciting 'Moments'
… 'Focusing in'" (slides GDC 2004, link acima).

**Unreal Tournament 3 — erro dobrado logo após adquirir o alvo.**
FONTE: `UTBot.uc` (link acima)
> `// Bots don't aim as well at recently acquired targets (because they haven't had a chance to lock in to the target)`
> `FullAcquisitionTime = 0.5 + 1.0 * (7.0 - FMin(7.0, Skill + ReactionTime));`
> `if ( AcquireTime > WorldInfo.TimeSeconds - FullAcquisitionTime )`
> `{`
> `	if ( Skill < 6.0 )`
> `	{`
> `		aimerror *= 2.0;`

Números: Novice (skill 0) → erro ×2 durante **7,5 s**; skill 3 → 4,5 s;
Godlike → 0,5 s. Para arma de impacto instantâneo o multiplicador ainda ganha
×1,2 (`if ( bInstantProj ) aimerror *= 1.2;`). O erro-base da arma é
`AimError=525` (`UTWeapon.uc`), ≈ 2,9° (**[INFERÊNCIA]** na conversão).

**Halo 3** — ao esquivar, levar atordoamento etc., a precisão e o padrão de
rajada **voltam ao inicial**, ou seja, havia uma rampa.
FONTE: c20 — <https://c20.reclaimers.net/h3/engine/ai/>
> "should the AI perform a dodge, be stunned, hard pinged or engage in a movement
> hint of some type, their accuracy bounds and firing pattern will be reset to
> their initial values."

### 2.4 Acerto em função de distância, velocidade, postura e movimento

**Game AI Pro 3, cap. 33 — Sergio Ocio Barriales, *Using Your Combat AI
Accuracy to Balance Difficulty*** (o capítulo que mais se aplica aqui). O
atraso entre acertos no jogador é `delay = delay_base × Π regras`.
FONTE: <https://www.gameaipro.com/GameAIPro3/GameAIPro3_Chapter33_Using_Your_Combat_AI_Accuracy_to_Balance_Difficulty.pdf>
> Distância: "any distance greater than 15 m will not affect the delay, and that
> anything closer than 5 m will halve the time."
> Postura: "we will keep the base delay if the player is standing (i.e., the
> multiplier is 1), but double it if they are crouching, making the player feel
> safer. Likewise, we will use another rule that will double the delay if the
> player is in a valid cover position."
> Para onde o jogador olha: "doubling the delay if the angle difference between
> the facing vector and the vector that goes from the player to the AI is greater
> than 170 degrees, and leaving the delay unchanged otherwise."
> Velocidade do alvo: "this rule will halve the delay if the angle is lower than
> 30°, maintain it unchanged between 45° and 90° and make if longer the closer we
> get to 180° (we are actually capping it at 160°)."
> Exemplos: "let us say our base delay is 0.5 s" … "The final delay is
> 0.5 * ( 1* 2* 2 ) = 2 s." (agachado atrás de cobertura a 30 m) … "The delay for
> the second scenario is 0.5 * ( 0.75 * 1 * 1 * 1 * 0.5 ) = 0.1875 s." (a 10 m,
> correndo na direção da IA)

(Observação: o texto define o teto da regra de distância em 15 m e no exemplo
fala em "well over the 20 m cap" — inconsistência do próprio capítulo.)

**DOOM (2016)** — a precisão cai com a velocidade do jogador, de propósito.
FONTE: AI and Games / Game Developer — <https://www.gamedeveloper.com/design/cyber-demons-the-ai-of-doom-2016->
> "Demon accuracy is intentionally reduced the faster the player moves to make
> you harder to hit. This is achieved through use of a weighted distribution of
> shot accuracy, whereby demons deliberately miss when you're moving top speed and
> are more accurate the slower and less mobile you are. This system is also tied
> into the in-game difficulty, with the demon accuracy compensating for player
> movement faster on higher difficulties."

**Call of Duty 4 — atirar andando custa metade.**
FONTE: `_gameskill.gsc` (link acima)
> `anim.run_accuracy = 0.5;`
> `if ( self.a.script == "move"  )`
> `{`
> `	self.accuracy = anim.run_accuracy * self.baseAccuracy;`

E a distância entra como escala no nível de dificuldade:
> `// lower numbers = higher accuracy for AI at a distance`
> `level.difficultySettings[ "accuracyDistScale" ][ "veteran" ]  = 0.5;`
(Easy, Normal e Hardened ficam em 1.0.)

**Quake III — mudança de direção do alvo piora a mira.**
FONTE: `ai_dmq3.c` (link acima)
> `//if the enemy changed direction`
> `if (DotProduct(bs->enemyvelocity, enemyvelocity) < 0) {`
> `	//aim accuracy should be worse now`
> `	aim_accuracy *= 0.7f;`

E a tese lista o que o `aim skill` destrava por faixa:
> "> 0.0 & < 0.9 = aim is affected by enemy movement"
> "> 0.4 & <= 0.8 = enemy linear leading"
> "> 0.8 & <= 1.0 = enemy exact movement leading"

**Unreal Tournament 3 — alvo lento, bot parado, bot recém-atingido.**
FONTE: `UTBot.uc` (link acima)
> `if ( VSizeSq(TrackedVelocity) < 2500.f )`
> `	aimerror *= (0.2 + 0.06 * (7 - FMin(7,Skill)));`
> `// aiming improves over time if stopped`
> `// Bots don't aim as well if recently hit, or if they or their target is flying through the air`
> `if ( (skill < 5 + 2*FRand()) && (WorldInfo.TimeSeconds - Pawn.LastPainTime < 0.2) )`
> `	aimerror *= 1.3;`

### 2.5 Como errar sem parecer burro

FONTE: Game AI Pro 3, cap. 33 (link acima)
> "Instead, what we want is to make our "accuracy problems" an interesting
> situation from the visual standpoint, so what we should try to do is hit
> things surrounding the player to generate sparks, dust… in a nutshell,
> destruction."
> "But normally players will be moving around, so our best bet will be trying
> to whiz tracers right past the player's face at eye level."
> "we should only target these special items if the player is going to see it"

FONTE: Lidén (link acima)
> "One of the fortuitous by-products of bad aim is the tension created by bullet
> tracers flying past the player's head or puffs of concrete dust or sparks
> exploding from projectiles impacting walls next to the player. Additionally,
> there is a feeling of reward imparted by having just been missed by a bullet.
> Players will often attribute near misses as an affirmation of their clever
> movement skills."
> "FPSs often use a bullet spread as wide as 40 degrees."

### 2.6 Bot perfeito não é o objetivo

FONTE: van Waveren (tese, link acima)
> "A bot that is just a little bit better than the human player is often very
> suitable for training and practice. A perfect bot would not be any fun to play
> with. Human players do not want to loose the game continuously."

FONTE: Isla (Bungie), *Eight Years of Halo AI* —
<https://www.gamedeveloper.com/game-platforms/in-depth-bungie-on-eight-years-of-i-halo-i-ai>
> "They have to be roughly player-equivalent in terms of capabilities"

---

## 3. Percepção

### 3.1 Onisciência é trapaça — e o jogador percebe

FONTE: van Waveren (tese, link acima)
> "For instance the bot should not be able to always know where it's opponents
> are within the virtual world. The bot is supposed to be a fair player and the
> ability to directly acquire more knowledge than a human player would be
> considered cheating."

FONTE: Butcher & Griesemer, *The Illusion of Intelligence* (Halo, GDC 2002) —
<https://www.jmeiners.com/shamans/papers/ai/the_illusion_of_intelligence.pdf>
> "Individual Knowledge Model — Discarded: Complete Model — 'Real' Perception —
> No cheating — Vision, Hearing, Touch, ESP"
(tópicos de slide, separados aqui por travessão)

E no Halo 3, pela documentação do kit de edição:
FONTE: c20 — <https://c20.reclaimers.net/h3/engine/ai/>
> "AI in Halo, outside of scripting and specific task flags, do not have the
> ability to see through walls, they must be able to actually see their targets
> or hear them"

FONTE: McIntosh, *Human Enemy AI in The Last of Us* (Game AI Pro 2, cap. 34) —
<https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter34_Human_Enemy_AI_in_The_Last_of_Us.pdf>
> "Of note, the NPCs did not cheat with regard to knowing the player's location
> in most circumstances."

FONTE: Lidén (link em 2.2)
> "as a programmer with full access to game data structures, one can easily cheat
> by making non-player characters (NPCs) omniscient. NPCs can know where their
> enemies are, or know where to find weapons or ammunition, without seeing them.
> Players, however, often eventually detect cheap tricks of this type. Even if
> they can't determine the exact nature of the cheating, they might report feeling
> that NPC's behavior seems somehow unnatural."

### 3.2 Cone de visão

**The Last of Us — ângulo inversamente proporcional à distância.**
FONTE: Game AI Pro 2, cap. 34 (link acima)
> "Often, players right next to the NPC would be unseen, while NPCs too far away
> were noticed, simply because the cone we used for testing was not adequate to
> represent real vision. The fundamental issue was that, when close, we needed a
> larger angle of view, but at a distance we needed a smaller one. Using a simple
> rule—the angle of view for an NPC is inversely proportional to distance—we
> reinvented our view frustum to be much more effective"

**Splinter Cell: Blacklist — caixa em forma de caixão.**
FONTE: Walsh, Game AI Pro 2, cap. 28 —
<http://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter28_Modeling_Perception_and_Awareness_in_Tom_Clancy's_Splinter_Cell_Blacklist.pdf>
> "we refined it further and replaced our standard boxes with coffin-shaped boxes
> (Figure 28.3) that expand up to a point like a cone and then start to contract
> as they continue to move further away from the NPC"
> "If the player is 1 cm outside of that threshold, then the NPC will stand there
> forever without seeing the player. One centimeter inside and the player will be
> detected within a couple of seconds at most."

**Unreal Tournament 3 — visão periférica por nível.** `PeripheralVision` é o
cosseno do meio-ângulo.
FONTE: `UTBot.uc` (link acima)
> `if ( Skill < 2 )`
> `	Pawn.PeripheralVision = 0.7;`
> `else if ( Skill > 6 )`
> `	Pawn.PeripheralVision = -0.2;`
> `else`
> `	Pawn.PeripheralVision = 1.0 - 0.2 * skill;`

Em graus (**[INFERÊNCIA]**, `acos`): Novice/Average ±45,6° (≈ 91° no total);
skill 3 ±66,4° (≈ 133°); skill 5 ±90°; acima de 6, ±101,5° (≈ 203°).

**Quake III — cone que abre com a distância, e 360° quando atirado.**
FONTE: `ai_dmq3.c`, `BotFindEnemy` (link acima)
> `if (squaredist > Square(900.0 + alertness * 4000.0)) continue;`
> `//if the bot's health decreased or the enemy is shooting`
> `if (curenemy < 0 && (healthdecrease || EntityIsShooting(&entinfo)))`
> `	f = 360;`
> `else`
> `	f = 90 + 90 - (90 - (squaredist > Square(810) ? Square(810) : squaredist) / (810 * 9));`

(`f` vai de 90° colado a 180° a partir de 810 unidades. É a regra oposta à do
TLOU; a do TLOU é a que foi validada em teste com jogador.)

### 3.3 Detecção gradual (medidor de consciência)

**The Last of Us — cronômetro que sobe vendo e desce sem ver, ~1–2 s.**
FONTE: Game AI Pro 2, cap. 34 (link acima)
> "When an NPC saw the player, he would start a timer. Each frame the player was
> seen, the timer was incremented. Each frame the player was unseen, the timer
> was decremented. The player did not count as perceived until the timer reached
> a specified value (around 1 or 2 seconds for the typical NPC). When in combat,
> this threshold was much lower, and when the NPC had yet to perceive the player
> in its lifetime (i.e., the player is in stealth), this threshold was much
> higher."
> "Each joint was weighted, and the weighted average was compared against a
> threshold (typically 60%)."
> "If the player was in stealth, then the point is located in the center of the
> player's chest. If the player has engaged an NPC in combat, the point moved to
> the top of the player's head."

**Splinter Cell: Blacklist — cronômetro escalado pela distância.**
FONTE: Game AI Pro 2, cap. 28 (link acima)
> "On Blacklist, when the player is inside of a vision shape of the NPC,
> unobstructed and lit, a timer kicks off, which is scaled based on the distance
> to the player, lightness of the player, NPC state, etc., and when that timer
> reaches 0 (or the progress bar is full), the NPC immediately does two things:
> he perceives the player and becomes aware of him as a threat."
> "On Blacklist, we raycast to eight different bones on the player's body.
> Depending on the stance, it takes a certain number of visible bones to kick
> off detection."

**Counter-Strike — chance de notar por *quantum* de 0,25 s, por postura,
velocidade, distância e fração visível.** É a tabela mais concreta achada.
FONTE: `cs_bot_vision.cpp` (ReGameDLL_CS; bloco `REGAMEDLL_ADD`, o mesmo código
e comentários do bot do CS:Source) —
<https://github.com/rehlds/ReGameDLL_CS/blob/master/regamedll/dlls/bot/cs_bot_vision.cpp>
> `// all chances are specified in terms of a standard "quantum" of time`
> `// in which a normal person would notice something`
> `const float noticeQuantum = 0.25f;`
> `const float closeRange = 300.0f;`
> `const float farRange = 1000.0f;`
> `// running players are always easy to spot (must be standing to run)`
> `// crouching and motionless - very tough to notice`
> `closeChance = 80.0f;`
> `farChance = 5.0f;		// takes about three seconds to notice (50% chance)`
> `noticeChance *= (0.5f + 0.5f * GetProfile()->GetSkill());`

Tabela completa (chance em % por 0,25 s, de perto → de longe; perto = < 300
un. ≈ 7,6 m, longe = > 1000 un. ≈ 25 m, **[INFERÊNCIA]** na conversão):

| Alvo | Perto | Longe |
|---|---|---|
| Correndo (> 200 un./s) | sempre notado | sempre notado |
| Andando, em pé | 100 | 75 |
| Andando, agachado | 90 | 60 |
| Parado, em pé | 100 | 10 |
| Parado, agachado | 80 | **5** |

Multiplicada pela fração visível do corpo (tronco 40, cada lado 20, cabeça 10,
pés 10), por `0,5 + 0,5 × skill`, +50 se o bot estiver em alerta, com piso de
0,1 %.

### 3.4 Vegetação e camuflagem

Nenhuma fonte primária de jogo lançado com modelo de ocultação por grama foi
obtida (ver seção 6). O que há de lastro é **postura + movimento + fração
visível** (CS, Splinter Cell, TLOU, acima) e a regra de design do Lidén, que vai
no sentido oposto — inimigo visível é bom jogo:
> "in the game world great camouflage makes for bad gameplay. Pixel scrubbing
> while searching for opponents is not an enjoyable experience."

Para o *jogador* se esconder, a lição do Splinter Cell é que vale o que o jogador
**acha** que o NPC vê:
> "it's only important what's plausible from the player's point of view—it
> really doesn't matter what the NPC should see or hear; it's what the player
> thinks the NPC can see and hear."

### 3.5 O tiro revela a posição

- Quake III: atirar ou ferir o bot abre o cone para 360° (código em 3.2).
- Halo: "Cause-Effect Stimuli — Discovery — Weapon Fire — Damage, Death"
  (slides GDC 2002, link em 3.1).
- The Last of Us: "The player showed himself, either visibly or by shooting his
  gun." (cap. 34, link em 3.1).
- Splinter Cell — ouvir quem o jogador não vê parece injusto; a correção foi
  **reduzir à metade a audição de quem está fora da tela**:
  > "NPCs that are offscreen, but far enough away from the player that it was
  > plausible they didn't hear him, have their hearing reduced for certain events
  > by ½. The result was that the game instantly became more fun and our creative
  > director stopped complaining."

### 3.6 Memória da última posição vista

FONTE: Isla (Halo) — link em 2.6
> "If the player moves stealthily, the AI will assume the player is still
> sitting where the AI last knew him to be."
> "Each AI has an internal model of each target, and that model can be wrong,"
> Isla summarized. "This allows the AI to be surprised by you, and this is very
> fun."

FONTE: TLOU, cap. 34 — link em 3.1
> "When the player was perceived, the NPC would create an entity object with
> location and time stamp and then signal all other NPCs with the player's new
> location. If the player was not perceived by any NPCs, his location was never
> updated, instead remained in the previous location."
> "If they had advanced as close as they could and they hadn't seen the player in
> a long enough period (10 s or more), a single NPC was chosen to approach the
> player's position to see if he was still there."

---

## 4. Seleção de alvo e limite de atacantes simultâneos

**DOOM (2016) — tokens por tipo de ataque, contados por dificuldade.**
FONTE: link em 2.4
> "A demon needs to request a token to make their attack, then release the token
> back to the system after use. Each difficulty level has a different set of
> token counts for each attack type, allowing for a more aggressive demon horde
> that is still balanced for a fun experience by ultimately limiting how many
> demons can be attacking at any point in time."
> "demons can actually steal tokens from one another if they feel they're better
> suited to use them at a given point in time. One major reason for this is to
> ensure that demons in front of the player can attack and don't stand around
> looking stupid instead of trying to kill you!"
> "the designers realised it's unfair if the demons are attacking when the player
> cannot respond."

**Half-Life — dois atiradores por esquadrão, sem comunicação.**
FONTE: Lidén (link em 2.2)
> "The marines in Half-Life used the "Kung-Fu" style of fighting, meaning that
> regardless of the number of marines that the player is fighting, only two are
> actually allowed to shoot at the player at any given time. No actual
> communication exists between the marines. Instead, each squad of marines is
> given two attack slots; if a marine wants to attack and both slots are filled,
> he finds something else to do (such as reloading his weapon or moving to a new
> attack position)."

**The Last of Us — basta UM atirando; os outros flanqueiam.**
FONTE: cap. 34 (link em 3.1)
> "With that said, it was only necessary for one NPC to be shooting the player at
> any given time; all other NPCs could spend their time taking cover, flanking,
> etc."
> "We created a system we called the Combat Coordinator. The Combat Coordinator
> was simply a global object that managed each NPC's role."
(Atenção ao contexto: TLOU queria **mais** letalidade; o papel
`OpportunisticShooter` garante *pelo menos* um atirador. Para nós vale o teto.)

**Game AI Pro 3, cap. 33 — o token decide quem ACERTA, não quem atira.** Todos
podem atirar; só o dono do token acerta; os demais erram perto. Um único
cronômetro global.
FONTE: link em 2.4
> "AIs can freely enter any of the shooting behaviors, but shots can only
> actually hit the player if the shooter has a token; any other shot will
> deliberately miss the player and hit some location around him or her."
> "Token distribution is controlled by a global timer that tracks how long has
> passed since the last hit."
> "This system avoids multiple hits occurring on the same frame"
E por que não travar o *disparo* (o token clássico):
> "this could yield potentially unbelievable behaviors, such as AIs being at
> perfect spots to shoot and hit the player but not even trying to do so because
> they are clearly waiting for their turn."
Quem recebe o token (soma ponderada): distância, exposição do alvo, arquétipo,
"If an agent is currently under attack, it is more likely that it will receive
the token." e "Agents that have not received a token in a long time may have a
higher chance of receiving the token soon."

**Call of Duty — ameaça como soma de fatores, com desconto por atacante a
mais.** É o antídoto direto para "todos focam o humano".
FONTE: COD Modding & Mapping Wiki —
<https://wiki.zeroy.com/index.php?title=Call_of_Duty_5:_SP_-_Threat_Bias_Groups>
> "This could be used to have the player take less fire in a massive line battle"
> Visibility: "visible = 1000, fully aware = 500, friendlyTimingOut = 250, not
> aware = 0"
> Enemy Count: "-150 threat per extra attacking friendly, capping at -1000"
> Current Enemy: "damaged player(fully aware) = 1000, current enemy (fully aware)
> = 500, current timing out enemy = 200, current enemy(not fully aware) = 100,
> not current enemy = 0"
(Distância entra com faixa [0, 5000] dentro de 2500 unidades.)

E o viés contra o **jogador** cresce com a dificuldade — no fácil, a IA espalha
fogo nos aliados:
FONTE: `_gameskill.gsc` (link em 2.2)
> `add_fractional_data_point( "threatbias", 0.25, 100 ); // original easy`
> `add_fractional_data_point( "threatbias", 0.75, 150 ); // original normal`
> `level.difficultySettings[ "threatbias" ][ "hardened" ] = 200;`
> `level.difficultySettings[ "threatbias" ][ "veteran" ] = 400;`

**Left 4 Dead — ritmo por intensidade do jogador.** Depois do pico, recua.
FONTE: Booth, *The AI Systems of Left 4 Dead* (2009) —
<https://steamcdn-a.akamaihd.net/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf>
> "Increase Survivor Intensity — When injured by the Infected, proportional to
> damage taken"
> "Sustain Peak — Continue full threat population for 3-5 seconds after Survivor
> Intensity has peaked"
> "Relax — Maintain minimal threat population for 30-45 seconds, or until
> Survivors have traveled far enough toward the next safe room, then resume Build
> Up."
E os bots-sobreviventes, que substituem humanos, precisam parecer justos:
> "Believability/Fairness — Players need to believe bot replacements are "fair" —
> Imperfect knowledge – simulated senses — Simulated aiming — Reaction times"

---

## 5. Dano e TTK do bot contra o humano

**Unreal Tournament (1999) — no modo Novice, bot causa 25–70 % do dano ao
humano.**
FONTE: `DeathMatchPlus.uc` (SDK do UT 469d) —
<https://github.com/mmdanggg2/UE1-sdks/blob/master/sdk_ut469d/Botpack/Classes/DeathMatchPlus.uc>
> `//skill level modification`
> `if ( instigatedBy.IsA('Bot') && injured.IsA('PlayerPawn') )`
> `	Damage = Damage * (0.25 + 0.15 * instigatedBy.skill);`
(Skill 0 → 25 %; 1 → 40 %; 2 → 55 %; 3 → 70 %. Corpo a corpo tem outra fórmula,
`0.76 + 0.08 * skill`.)

**Call of Duty 4 — a vida efetiva do jogador varia 4× entre Easy e Veteran, e há
janelas de invulnerabilidade depois de levar tiro.**
FONTE: `_gameskill.gsc` (link em 2.2)
> `add_fractional_data_point( "playerDifficultyHealth", 0.25, 475 ); // original easy`
> `add_fractional_data_point( "playerDifficultyHealth", 0.75, 275 ); // original normal`
> `level.difficultySettings[ "playerDifficultyHealth" ][ "hardened" ] = 165;`
> `level.difficultySettings[ "playerDifficultyHealth" ][ "veteran" ] = 115;`
> `// level.invulTime_onShield: time player is invulnerable when hit the first time they get a red health overlay( should be reasonably long )`
> `add_fractional_data_point( "invulTime_onShield", 0.25, 0.8 ); // original easy`
> `add_fractional_data_point( "invulTime_onShield", 0.75, 0.5 ); // original normal`

**Game AI Pro 3, cap. 33 — cortar dano funciona, mas tem custo de
credibilidade; por isso o capítulo prefere controlar o ACERTO.**
> "we could have AIs be less accurate and only really hit the player once every
> few shots."
> "tracking the total damage the target has received each frame and adjust
> incoming damage accordingly (e.g., not damaging the target anymore after a
> certain threshold has been hit), but this could lead to other believability
> problems"

**Lidén — mesma ressalva:** baixar o dano tira a tensão que o erro de mira dá.
> "Alternatively, one can reduce the player's difficulty by making opponent
> bullets do very small amounts of damage. However, in doing so, one loses some of
> the secondary benefits of bad aim."

**Halo — inimigo mais resistente é lido como mais inteligente.** Não é dano do
bot, mas é o outro lado do TTK:
FONTE: slides GDC 2002 (link em 3.1) — teste com inimigo fraco: "Too hard 12% /
About right 52% / Too easy 36%" e "Very Intelligent 8%"; com inimigo resistente:
"Too hard 7% / About right 92% / Too easy 0%" e "Very Intelligent 43%".

---

## 6. O que NÃO foi encontrado

- **Números de mira, reação ou dano dos bots de PUBG Mobile, Free Fire, CoD
  Mobile, Warzone Mobile, Fortnite ou Apex.** Nenhuma fonte oficial publica. Tudo
  que circula (bots "fáceis", "mira que gruda de longe", "andam em linha reta")
  é observação de jogador ou de site de guia — não entrou como lastro.
- **Se algum BR móvel reduz o dano do bot contra o humano.** Não encontrado.
- **Quantos tokens o DOOM dá por tipo de ataque e por dificuldade.** O artigo diz
  que existem e variam; os números não.
- **Valores dos campos de rajada do Halo** (`burst origin radius`, `first burst
  delay`, multiplicadores de "new target"). Só as definições; os números por
  inimigo não foram obtidos. A afirmação corrente de que a precisão do Halo
  "melhora com a exposição contínua" só apareceu em resumo de terceiros; o que
  tem fonte é o *reset* da precisão no Halo 3 (seção 2.3).
- **Uncharted / Naughty Dog sobre precisão.** A palestra de Uncharted 4 (GDC
  2017) está em vídeo; o artigo de Uncharted 2 acessível não fala de mira.
- **F.E.A.R. e Killzone sobre precisão.** Os papers (Orkin 2006; Beij &
  Straatman 2005) foram lidos e tratam de planejamento e posicionamento, não de
  precisão. Do Killzone sobra algo útil noutro eixo: tabela de linha de fogo
  pré-computada, "Killzone's LoF table for 4000 waypoints: 64KB" / "For every
  waypoint, per radial sector, record the largest distance from where an
  attacker within that sector can fire at the waypoint." / "Inaccurate, but
  consistent." (<https://www.guerrilla-games.com/media/News/Files/gdce05_killzone_ai.pdf>)
- **Modelo de ocultação por grama/vegetação em jogo lançado, com fonte
  primária.** A referência óbvia (wiki da Bohemia sobre Arma 3) devolveu 403; só
  sobraram afirmações de fórum, que não entram.
- **Tempo de reação humano com citação literal de fonte primária.** A página do
  Human Benchmark é renderizada por JavaScript e não foi lida; o resumo do estudo
  de Jain et al. (2015) não traz os milissegundos. O "~250–273 ms" que circula
  ficou **sem verificação**.
- **Diferença quantificada entre mira de toque e de mouse.** Não encontrada.
- **Conversão de unidade de motor para metro** em qualquer das fontes de
  código (CoD, CS, Quake). Todas as conversões deste documento são minhas.
- **O bot do Counter-Strike percebendo quem acabou de atirar.** A versão do
  CS:Source tem essa regra no topo de `IsNoticable`, mas só circula em código
  vazado, que não cito; a cópia pública (ReGameDLL_CS) não a tem. O lastro de
  "tiro revela" ficou com Quake III, Halo e TLOU.

---

## 7. Recomendação para este jogo

**Restrições que moldam tudo:**

1. O bot **não tem paredes** — só o heightmap do terreno (`createBotTerrain`).
   Linha de visada contra terreno é possível; contra prédio, não.
2. Roda a **10 Hz** — o mesmo passo do bot do Counter-Strike
   (`g_flBotFullThinkInterval = 1.0 / 10.0`). Reação vira fila de N ticks.
3. **Todos os bots moram num processo só** (`startBots`). Um "diretor" que
   distribui tokens entre eles é uma variável de módulo, sem protocolo novo.
4. O cliente da vítima já **recusa dano através de parede/terreno**. Isso
   segura o dano, mas não a *informação*: o bot continua perseguindo e
   atirando (e errando) em quem está atrás do prédio.
5. Chega ao bot: `pos` (pé), `rotY` (hoje descartado), fase, arma, e o
   `playerFired` dos humanos (hoje ignorado). **Não** chega: postura.
6. Mexer em dano passa pela validação do servidor e por
   `test/security-regression.test.js`. **Diminuir** o que o bot causa não abre
   vetor; criar mensagem nova de cliente para servidor, sim (ver P3).

### P0 — o que tira o "apelão" (tudo com lastro direto)

**P0.1 Reação + atraso do primeiro disparo, como fila de ticks.**
**[LASTRO]** CS 1.6/CS2 (`ReactionTime`, `AttackDelay`, fila `reactionTimeSteps`
a 10 Hz); Quake III (`enemysight_time`); PUBG 12.1 ("engage less quickly after
acquiring their target").
- Guardar, por humano observado, as últimas 20 amostras (2 s) de `pos`; o bot
  decide sobre a amostra de `reação/0,1` ticks atrás.
- Números de partida: **reação 0,6 s** (CS2 Easy/Normal/Fair) → 6 ticks;
  **AttackDelay 1,0–1,5 s** no celular (CS 1.6 Fair/Easy), 0,7–0,8 s no
  Normal (CS2). Primeiro tiro possível **~1,6–2,1 s** depois de o humano ficar
  percebível. **[INFERÊNCIA]** na escolha entre as faixas.
- Trocar `lastShot = -Infinity` por "tempo desde adquirir o alvo", que zera ao
  trocar de alvo.

**P0.2 Janela de erro obrigatório no começo de cada engajamento.**
**[LASTRO]** CoD4 `missTime` e `missTimeDebounce`; CoD4 sniper; Lidén "Miss the
First Time".
- `missTime = 1,0 s + 0,0315 s/m × d` no celular (CoD4 Easy convertido);
  `0,05 s + 0,0039 s/m` no Normal. A 85 m (alcance do fuzil) dá 3,7 s no Easy.
  Rearma só depois de **3 s** sem atirar naquele alvo.
- DMR e sniper: o **primeiro tiro num alvo novo além de ~12,7 m erra**; no
  celular, os dois primeiros.
- A conversão 2,54 cm/unidade é **[INFERÊNCIA]**; o formato (constante +
  distância, com debounce) é **[LASTRO]**.

**P0.3 Limite de quem ACERTA o humano — token global por humano.**
**[LASTRO]** Game AI Pro 3 cap. 33 (todos atiram, só o dono do token acerta;
cronômetro único por alvo; "avoids multiple hits occurring on the same frame");
Half-Life (2 vagas); TLOU (basta 1); DOOM (contagem por dificuldade).
- Por humano: no celular **1** bot com token de acerto; no Normal, **2**.
  **[INFERÊNCIA]** na contagem, dentro do intervalo 1–2 das fontes.
- Entre acertos no mesmo humano, um atraso mínimo `delay_base × Π regras`, com
  as regras do cap. 33: distância ≤ 5 m ×0,5 / ≥ 15 m ×1; **agachado ×2**;
  **olhando para longe do bot (> 170°) ×2** — o `rotY` já chega, basta não
  descartá-lo em `observePlayerUpdate`; correndo na direção do bot ×0,5.
- O `delay_base` do capítulo (0,5 s) é para bala de fuzil de campanha. Aqui cada
  acerto vale 28–55; o base tem de sair de um TTK-alvo, não do capítulo.
  **[INFERÊNCIA]**: calibrar para TTK de **≥ 6 s** de um bot sozinho contra
  humano parado em pé no celular, e medir.
- Quem não tem token **atira e erra perto** (ver P1.3), em vez de ficar parado
  "esperando a vez" — é a crítica do próprio capítulo ao token que trava o
  disparo.

**P0.4 Fim da prioridade absoluta ao humano.**
**[LASTRO]** CoD: ameaça como soma (visibilidade, distância, quem me feriu,
alvo atual) com **−150 por atacante a mais, teto −1000**; `threatbias` do
jogador **menor** no fácil (100 contra 400 no Veteran).
- Trocar `nearestHuman || nearestBot` por pontuação: distância, "está me
  ferindo", "está atirando", e desconto por bot que já está engajado nesse alvo.
  Humano sem viés extra no celular. **[INFERÊNCIA]** nos pesos.
- Efeito esperado: bots brigando entre si de novo, e o humano deixando de ser o
  ímã de todo bot num raio de 100 m.

### P1 — percepção e acerto que respondem ao que o humano faz

**P1.1 Probabilidade de acerto por disparo em vez de `mira` fixa.**
`P = base(nível) × f_rampa × f_movimento_alvo × f_bot_andando × f_postura`
- `f_rampa`: sobe de ~0,3 a 1 em **2–5 s** de exposição contínua, zera ao
  perder o alvo. **[LASTRO]** CS 1.6 "focus in" (2–5 s, teto 75 %); CS2
  `AimFocusDecay` (Easy 20° × 0,7/s); UT3 erro ×2 por 7,5 s (Novice) após
  adquirir. O 0,3 inicial é **[INFERÊNCIA]**.
- `f_bot_andando = 0,5` quando o bot anda. **[LASTRO]** CoD4 `run_accuracy`.
  Hoje o bot atira andando com a mesma mira.
- `f_movimento_alvo`: ×0,7 se o humano inverteu a direção desde a amostra
  anterior (**[LASTRO]** Quake III); cair com a velocidade (**[LASTRO]**
  qualitativo, DOOM). Números para 5,2 m/s (andar) e 8,6 m/s (correr), p. ex.
  ×0,8 e ×0,6, são **[INFERÊNCIA]**.
- Alternativa mais "geometria, não gosto" (**[LASTRO]** UT3
  `TrackingReactionTime`): o bot mira na posição **extrapolada da amostra de
  reação**; se o humano está a mais de ~0,42 m (raio do colisor) de onde o bot
  previu, é erro. O acerto passa a sair do movimento do alvo, sem tabela.
  Implementação **[INFERÊNCIA]**.

**P1.2 Percepção: cone + linha de visada no terreno + cronômetro + memória.**
- Cone largo perto e estreito longe, não o contrário. **[LASTRO]** TLOU
  (inversamente proporcional à distância), Splinter Cell (caixão). Largura de
  partida no celular: ±45° além de ~20 m, abrindo para ±90° perto.
  **[LASTRO]** para ±45° (UT3 Novice, `PeripheralVision = 0.7`); os 20 m são
  **[INFERÊNCIA]**. A orientação do bot é o `combatFacingYaw` que ele mesmo
  manda.
- Linha de visada contra o **heightmap**: marchar do olho do bot (y + 1,5) até o
  tronco do humano. Barato, cobre morro e vale. **[INFERÊNCIA]** na técnica;
  **[LASTRO]** no princípio (Halo "No cheating"; tese do Q3; TLOU).
- Cronômetro de consciência: soma a cada tick com o humano no cone e visível no
  terreno, subtrai fora; percebe ao passar de **1–2 s** (TLOU), com multiplicador
  por distância (Splinter Cell) e por movimento/postura (tabela do CS da seção
  3.3). Em combate, limiar menor (TLOU). **[LASTRO]** nos números-base.
- Memória: ao perder a percepção, o bot segue para a **última posição vista**,
  e não para a posição atual. Depois de ~10 s sem ver, desiste e volta à zona.
  **[LASTRO]** TLOU (10 s), Halo (Isla).
- O raio de 100 m passa a ser só o teto do cone, não o gatilho.

**P1.3 Erro que o jogador VÊ.** Hoje `buildMissShot` joga o traçante no chão
±2 m em volta do **pé**. **[LASTRO]** Game AI Pro 3 cap. 33 ("whiz tracers right
past the player's face at eye level"), Lidén (traçante perto da cabeça é
tensão e recompensa). Mirar o erro na altura dos olhos (~1,6 m) com
deslocamento lateral de 0,5–1,5 m, e às vezes o chão **à frente** do humano.
Faixas **[INFERÊNCIA]**. Não mexer na convenção de `toPos` sem ler o comentário
de `buildMissShot` (o servidor soma 1 m).

**P1.4 O tiro do humano revela.** Escutar `playerFired` (já difundido pelo
servidor): quem atirou num raio de audição fica percebido em **360°**.
**[LASTRO]** Quake III (`f = 360` se o inimigo atira), Halo, TLOU. O raio é
**[INFERÊNCIA]** (sugestão: 60–80 m para fuzil). Aplicar o desconto do Splinter
Cell: bot fora da tela do humano ouve **pela metade** — **[LASTRO]**. "Fora da
tela" dá para saber com o `rotY` do humano e um FOV de ~90° **[INFERÊNCIA]**.

### P2 — dano e ritmo

**P2.1 Multiplicador de dano bot→humano no celular.** **[LASTRO]** UT99 Novice
(25–70 % por skill); CoD4 (vida efetiva 475 no Easy contra 275 no Normal,
≈ 1,7×). Número de partida: **×0,6** no celular. **[INFERÊNCIA]**. A ressalva
do cap. 33 e do Lidén vale: isso é o *último* botão, depois de P0 — dano baixo
com mira perfeita continua lendo como aimbot.

**P2.2 Janela de graça depois de um acerto.** O mesmo humano não toma outro
acerto de bot por **0,5–0,8 s** (CoD4 `invulTime_onShield` Normal/Easy).
**[LASTRO]**. Cai naturalmente no cronômetro do P0.3.

**P2.3 Recuo depois de pico.** Humano que tomou muito dano em pouco tempo: os
bots próximos perdem o token por alguns segundos. **[LASTRO]** na estrutura
(L4D: pico sustentado 3–5 s, alívio 30–45 s); aplicar isso a BR é
**[INFERÊNCIA]**, e 30–45 s é longo demais para BR — começar com 5–10 s.

### P3 — o que depende de trabalho fora de `scripts/bots.js`

- **Postura.** Agachado/deitado dobra o atraso entre acertos (cap. 33) e derruba
  a chance de ser notado de longe (CS: parado e agachado = 5 % por 0,25 s,
  "about three seconds to notice"). Hoje a postura **não chega**; precisa de um
  campo novo no `state` do cliente e no `playerUpdate` do servidor.
  **[INFERÊNCIA]** na mudança; **[LASTRO]** no efeito.
- **Paredes.** Sem geometria de prédio, o bot "vê" através da cidade. Duas
  saídas: (a) o construtor puro de paredes já previsto para o anti-cheat, reusado
  pelos bots; (b) tabela de linha de fogo pré-computada por seed, no estilo
  Killzone ("Inaccurate, but consistent."). **[INFERÊNCIA]**. **Não**
  recomendo o atalho de o cliente avisar "estou atrás da parede": o humano que
  mente ficaria invisível para todos os bots — é vetor novo e cairia na régua de
  `test/security-regression.test.js`.
- **Grama.** Não achei fonte primária de modelo de ocultação por vegetação
  (seção 6). O bot pode reconstruir a densidade de grama pelo seed, como já
  reconstrói o terreno — mas o gerador tem ordem de consumo do `Math.random`
  contratual (CLAUDE.md). **[INFERÊNCIA]**, e cara.
- **Quantidade de bots por habilidade** (Fortnite, PUBG, Apex): mais bots para
  quem morreu cedo sem causar dano. **[LASTRO]** na prática da indústria; o
  critério concreto é **[INFERÊNCIA]**.

### Como medir (para não repetir o PUBG 12.1)

A queixa é de sensação, então o teste tem de medir a sensação em número, com
dublê de humano parado, andando e correndo, e RNG com seed:

- **tempo até o primeiro dano** a partir de o humano entrar no cone — tem de
  ficar ≥ reação + AttackDelay + missTime;
- **TTK** de 1 e de 3 bots contra humano sem colete, em pé, parado — a meta vem
  do dono, e o número de partida é ≥ 6 s para 1 bot;
- **máximo de bots acertando o mesmo humano** na mesma janela de 1 s — tem de
  ser ≤ o número de tokens;
- **fração de engajamentos iniciados contra humano** com bot mais perto do que
  ele — deve cair de ~100 % para perto da proporção de humanos no raio.

Cada um reinjetando o defeito (voltar `nearestHuman || nearestBot`, zerar a
reação) e vendo o teste ficar vermelho, como pede o CLAUDE.md.
