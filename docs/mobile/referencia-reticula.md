# Retícula vermelha sobre o inimigo — o que os FPS fazem, e o que isso cobra deste jogo

Relato do dono: *"a mira não fica vermelha quando apontada aos inimigos"*.
Pesquisa feita antes de mexer em `game.js` (retícula) e `js/aimassist.js`
(consulta pura `createReticula`).

**Formato.** Afirmação → FONTE (URL) → CITAÇÃO LITERAL em inglês. No fim: o
que **não** foi encontrado, e a decisão para este jogo, cada item marcado
**[LASTRO]** (a fonte diz) ou **[INFERÊNCIA]** (conta minha, a calibrar).

---

## 1. Halo — "red reticle range": vermelha = inimigo sob a cruz E no alcance da arma

**Quando fica vermelha, e as outras cores.**
FONTE: <https://www.halopedia.org/Reticle>
> "Normally blue in color, the reticle will change to red if moved over an
> enemy or green if moved over an ally."

**Fora do alcance da arma, NÃO fica vermelha.**
FONTE: <https://www.halopedia.org/Reticle>
> "Note that if the enemy is not in range for that particular weapon, the
> reticle will still remain as blue."

**O alcance depende da arma e do zoom (quadril × mira).**
FONTE: <https://www.halopedia.org/Red_reticle_range>
> "This distance varies depending on the weapon the player is currently
> wielding, and whether the player is hip-firing or zoomed in."

FONTE: <https://www.halopedia.org/Reticle>
> "Zooming in (if your weapon has a scope attachment) may well make the
> reticle red if moved over a previously out of range enemy."

**O que o vermelho SIGNIFICA: o tiro vai ser ajudado — é o alcance útil.**
FONTE: <https://www.halopedia.org/Red_reticle_range>
> "The reticle being red indicates that when the player's weapon is fired,
> auto-aim will take effect, bending the fired projectile's trajectory towards
> the enemy."
> "If an enemy is beyond a weapon's red reticle range, the player will not
> receive any aim assist when firing the weapon, and so it is significantly
> harder to accurately hit them."

FONTE (imprensa, Halo Infinite): <https://www.gfinityesports.com/halo-infinite/red-reticle-range-rrr/>
> "This means that your foe is in range and indicates that aim assist is
> currently active."

## 2. Destiny 2 — a retícula muda de cor com inimigo sob ela, e acompanha precisão e auto-aim

FONTE: <https://www.dexerto.com/destiny/destiny-2-devs-reveal-major-reticle-overhaul-coming-in-season-of-the-deep-2148770/>
> "This means the reticle will react to the weapon's accuracy and auto-aim and
> will change color if an enemy is under it."

**Na MIRA (ADS) a mira da arma não mudava de cor** — a primeira arma a
ganhar isso foi um experimento, trocando a mira da arma por uma variante da
retícula do quadril:
> "Instead of the regular red dot or crosshair, it will be replaced with a
> variant of the hip-fire reticle."

## 3. Call of Duty — cor de inimigo na retícula existe e vem LIGADA

As listas de dvars do CoD5 (World at War) e do CoD7 (Black Ops) trazem a
variável com padrão `1`:
FONTE: <https://wiki.zeroy.com/index.php/Call_of_Duty_5:_Dvars> e
<https://wiki.zeroy.com/index.php/Call_of_Duty_7:_Dvars_List>
> `cg_crosshairEnemyColor "1"`
> `cg_enemyNameFadeIn "250"` / `cg_enemyNameFadeOut "250"`

As listas NÃO trazem a descrição da variável; o código do CoD não é público.

**Como o motor ANCESTRAL decide "o que está sob a cruz".** O CoD de 2003 roda
num id Tech 3 modificado:
FONTE: <https://en.wikipedia.org/wiki/Call_of_Duty_(video_game)>
> "Using an enhanced version of the id Tech 3 game engine developed for
> Quake III Arena..."

E no Quake III (código GPL da id), a varredura da cruz é um TRAÇO do olho ao
longo do eixo da vista, parado por geometria sólida, e recusado na névoa e
com o alvo invisível; o que aparece some com um temporizador:
FONTE: <https://github.com/id-Software/Quake-III-Arena/blob/master/code/cgame/cg_draw.c>
> ```c
> CG_Trace( &trace, start, vec3_origin, vec3_origin, end,
> 	cg.snap->ps.clientNum, CONTENTS_SOLID|CONTENTS_BODY );
> ...
> // if the player is in fog, don't show it
> ...
> // if the player is invisible, don't show it
> ...
> // update the fade timer
> cg.crosshairClientNum = trace.entityNum;
> cg.crosshairClientTime = cg.time;
> ```
> `color = CG_FadeColor( cg.crosshairClientTime, 1000 );`

(No Quake III isso pinta o NOME do jogador, não a cor da cruz — conferido no
`CG_DrawCrosshair`, que só colore pela vida.)

## 4. Apex, Fortnite, PUBG Mobile — sem retícula que muda de cor

As páginas de ajuda e os guias encontrados só descrevem cor FIXA escolhida
pelo jogador. PUBG Mobile, ajuda oficial:
FONTE: <https://pubgmobile.helpshift.com/hc/en/3-pubg-mobile/faq/223-i-want-to-change-the-design-of-the-crosshair-on-my-scope-1555641544/>
> "You can also customize the crosshair color when not using a scope."

---

## 5. O que NÃO foi encontrado

1. **CoD Mobile**: nenhuma fonte (oficial ou guia) sobre a retícula mudar de
   cor sobre o inimigo. Não afirmar nem que tem nem que não tem.
2. **Descrição oficial de `cg_crosshairEnemyColor`** e se o traço dele é
   parado por parede. Só nome e padrão.
3. **Halo: a retícula vermelha atravessa parede?** Nenhuma fonte diz. Como o
   vermelho é "o auto-aim vai agir", e auto-aim não age através de parede, o
   natural é que não — mas é dedução.
4. **Números de alcance** ("red reticle range" em metros) de qualquer arma de
   qualquer jogo, em fonte citável.
5. **Nota de patch da Bungie (7.1.0) com o texto literal** da opção de cor
   "sobre inimigo": a página não abriu para conferência.

---

## 6. Decisão para este jogo

- **[LASTRO]** Vermelha só com INIMIGO sob a cruz (Halo, Destiny, CoD). Quem
  é inimigo é a MESMA categoria `combate` da fiação da assistência (jogador
  remoto, bot, inimigo PvE, chefes, esqueletos, zumbis, lobo). Disco do campo
  de tiro, cadeado do cofre e cervo ficam brancos. Não há aliado neste jogo
  (BR sem equipe): o verde do Halo não tem uso.
- **[LASTRO]** Só no ALCANCE da arma, que cresce na mira (Halo).
  **[INFERÊNCIA]** o número: a distância em que o cone de espalhamento
  (`lerp(spreadHip, spreadAds, adsT)`, o mesmo do `fire()`) abre 0,84 m de
  raio — a mesma conta que dá o `autoRange` de 60 m do fuzil na assistência
  (`WEAPON_ASSIST`). Fuzil 60 m no quadril, escopetas ~15–17 m, DMR/sniper
  ~42–47 m no quadril; na mira todas crescem até o teto do hitscan (240 m).
  Faca: 2,6 m, o golpe do `__BR_melee`. Nunca além da névoa (metade da faixa,
  a mesma régua da assistência).
- **[LASTRO]** Parede e névoa apagam (o traço do Quake III). **[INFERÊNCIA,
  e regra da casa]** apaga também o que a TELA esconde e a bala não conhece:
  veículo, copa, painel, grama — `js/oclusao.js`, a régua da assistência. É o
  mesmo vazamento do wallhack de grama que já foi deployado nesta base.
- **[LASTRO]** Temporizador de saída (o `fade timer` do Quake III, 1000 ms para
  o nome; `cg_enemyNameFadeOut 250` no CoD). **[INFERÊNCIA]** 0,1 s aqui, e só
  na saída: entrar é imediato, e a retícula não pisca na borda da silhueta.
- **[LASTRO]** Na mira com alça/luneta, a referência da ARMA é a retícula —
  CoD e Destiny não pintam a mira da arma (a do Destiny foi experimento de uma
  arma só). A retícula do HUD já some ali (M6), então o vermelho aparece no
  quadril, na transição e nas armas sem alça; a luneta deste jogo já tem ponto
  vermelho fixo. **Pintar a mira 3D da arma** (red dot, holográfica) é decisão
  do dono e mora em `js/weaponrig.js`.
- **XR:** não existe retícula de tela no headset; nada muda lá.
