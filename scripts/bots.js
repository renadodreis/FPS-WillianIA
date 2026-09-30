/* ================================================================
   BOTS DE PARTIDA — conecta N bots num servidor JÁ RODANDO e espera
   o anfitrião (você) iniciar. Eles caem da nave, andam pela zona e
   trocam tiro entre si (e com você!).
   Uso: node scripts/bots.js [n=8] [url=http://localhost:3000]
   Ctrl+C derruba todos.
   ================================================================ */
'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { io } = require('socket.io-client');
const { zoneAt, mulberry32 } = require(path.join(__dirname, '..', 'server.js'));
const ShipProto = require(path.join(__dirname, '..', 'ship-protocol.js'));

const NICKS = ['Zumbi', 'Falcao', 'Vaga-Lume', 'Trovao', 'Golem Jr', 'Coiote', 'Visitante', 'Sombra',
  'Pantera', 'Cacto', 'Urubu', 'Lagarto', 'Tempestade', 'Neve', 'Fumaca', 'Raio'];
// posicional com o arsenal do jogo: 6=sniper leve, 7=escopeta de rajada
// (a rajada usa o código/perfil ESCOPETA — o servidor valida por código)
const WEAPONS = ['FUZIL', 'ESCOPETA', 'DMR', 'BAZUCA', 'PLASMA', 'FACA', 'SNIPER', 'ESCOPETA'];
/* aimScale multiplica o erro angular do bot com aquela arma: luneta erra
   menos, espalhamento/foguete são mais generosos. `scoped` = DMR/sniper,
   que erram os primeiros disparos num alvo novo e distante (CoD4). */
const WEAPON_PROFILES = {
  FUZIL: { range: 85, dmg: 14, bursts: 2, cooldown: 1.1, aimScale: 1 },
  ESCOPETA: { range: 24, dmg: 38, bursts: 1, cooldown: 1.35, aimScale: 1.4 },
  DMR: { range: 100, dmg: 42, bursts: 1, cooldown: 1.5, aimScale: 0.7, scoped: true },
  BAZUCA: { range: 75, dmg: 55, bursts: 1, cooldown: 2.4, aimScale: 0.8 },
  PLASMA: { range: 75, dmg: 19, bursts: 2, cooldown: 1.0, aimScale: 1 },
  SNIPER: { range: 110, dmg: 32, bursts: 1, cooldown: 1.2, aimScale: 0.5, scoped: true }, // leve: rápida, dano menor
  FACA: { range: 2.8, dmg: 24, bursts: 1, cooldown: 1.0, aimScale: 1 },
};
// teto de comprimento do `shotFired` no servidor (FACA 4, ESCOPETA 120, resto 320)
const MISS_MAX_LEN = { FACA: 3.9, ESCOPETA: 119 };

/* ================================================================
   IA DE COMBATE — o bot deixou de ser onisciente e instantâneo.

   Queixa do dono: "os bots estão apelões", jogando no CELULAR. Antes: alvo =
   qualquer vivo a ≤ 100 m (humano primeiro), tiro no primeiro tick, acerto =
   sorteio fixo por bot. Pesquisa com fontes e citações em
   docs/mobile/referencia-bots.md; a seção 7 é a receita seguida aqui.
   [LASTRO] = a fonte diz isso; [INFERÊNCIA] = número de partida a calibrar.
   ================================================================ */
const DEG = Math.PI / 180;
const AI = {
  THINK_DT: 0.1,            // 10 Hz — o passo do bot do CS (g_flBotFullThinkInterval) [LASTRO]
  VIEW_RANGE: 100,          // teto do cone de visão, não mais o gatilho do alvo
  EYE_H: 1.5,               // olho do bot = altura do fromPos do tiro
  AIM_H: 1.0,               // a vítima testa cobertura contra pé + 1 m (br-game.js, youWereHit)
  HEAD_H: 1.6,              // olho do humano: visibilidade e erro "rente ao rosto"

  // Percepção. Cone largo perto e estreito longe (TLOU: ângulo inverso à
  // distância) [LASTRO]; ±45° longe = UT3 Novice [LASTRO]; 8/20 m [INFERÊNCIA].
  FOV_NEAR_HALF_DEG: 90, FOV_FAR_HALF_DEG: 45, FOV_NEAR_M: 8, FOV_FAR_M: 20,
  // Medidor de consciência: sobe vendo, desce sem ver, percebe em ~1–2 s (TLOU)
  // [LASTRO]; mais rápido perto e com alvo andando (tabela do CS) [LASTRO no
  // formato, INFERÊNCIA nos números]; em combate, limiar menor (TLOU) [LASTRO].
  NOTICE_NEAR_PER_S: 1.5, NOTICE_FAR_PER_S: 0.4, NOTICE_NEAR_M: 8, NOTICE_FAR_M: 70,
  NOTICE_MOVING_MULT: 2, NOTICE_MOVING_SPEED: 1.5, NOTICE_COMBAT_MULT: 2, NOTICE_DECAY_PER_S: 0.5,
  COMBAT_WINDOW_S: 5,
  MEMORY_S: 10,             // sem ver por ~10 s, desiste (TLOU) [LASTRO]
  // Perdeu de vista quem via: SEGURA a posição mirando onde o viu antes de ir
  // atrás. CS, states/cs_bot_attack.cpp: "if we haven't seen our enemy for a
  // long time, chase after them" — chaseTime = 2 + 2·(1 − Aggression), e
  // +3 s com fuzil de precisão ("if we are sniping, be very patient"); CS2
  // Easy tem Aggression = 10 → 3,8 s [LASTRO]. Halo (Isla): "the AI will
  // assume the player is still sitting where the AI last knew him to be"
  // [LASTRO]. Quem o bot só OUVIU vai investigar na hora (CS: `!m_haveSeenEnemy`).
  CHASE_AFTER_S: 2 + 2 * (1 - 0.10), CHASE_SCOPED_EXTRA_S: 3,
  ALERT_S: 2,               // ouviu/levou tiro: cone de 360° para quem atirou (Quake III f = 360) [LASTRO]
  HEAR_M: 70,               // raio de audição do tiro [INFERÊNCIA, 60–80 m sugerido]
  HEAR_OFFSCREEN_MULT: 0.5, // fora da tela de quem atirou, ouve pela metade (Splinter Cell) [LASTRO]
  HEAR_VIEW_HALF_DEG: 45,   // "tela" do humano ≈ FOV de 90° [INFERÊNCIA]

  // Reação: fila de amostras a 10 Hz, o bot age sobre a de 0,6 s atrás
  // (CS2 Easy/Normal ReactionTime 0,6; fila reactionTimeSteps do CS) [LASTRO].
  REACTION_S: 0.6, HISTORY: 20,
  // Atraso do 1º disparo depois de adquirir (CS 1.6 Fair/Easy AttackDelay) [LASTRO].
  ATTACK_DELAY_MIN_S: 1.0, ATTACK_DELAY_MAX_S: 1.5,
  // RE-EXPOSIÇÃO — quem some atrás da cobertura e volta (laudo 7515734, B1/B2:
  // antes o bot atirava 0,6 s depois da volta e acertava a escopeta junto).
  // CS, states/cs_bot_attack.cpp: sem ver o inimigo por mais de 0,25 s ele
  // vira "escondido" (`m_isEnemyHidden`); ao reaparecer, "if the enemy is
  // coming out of hiding, we need time to react" — `m_reacquireTimestamp =
  // now + ReactionTime` e só então `FireWeaponAtEnemy()` [LASTRO]. Aqui a
  // reação já é a fila (o bot só re-vê pela amostra de REACTION_S atrás); em
  // cima dela vem um atraso de reaquisição de 0,70–1,0 s. 0,70 é o AttackDelay
  // do CS2 Easy — o mesmo que a régua soma aos 0,6 s de reação para chegar
  // aos 1,3 s de B1 — e 1,0 o do CS 1.6 Fair [LASTRO nos números; INFERÊNCIA
  // em cobrá-los de novo na volta: o CS só cobra a reação].
  REACQUIRE_HIDDEN_S: 0.25,
  REACQUIRE_DELAY_MIN_S: 0.7, REACQUIRE_DELAY_MAX_S: 1.0,
  // sumido por mais de 3 s é engajamento NOVO: atraso cheio e foco do zero
  // (CS: `seenRecentTime = 3.0f` — depois disso o bot para de mirar nele) [INFERÊNCIA]
  REACQUIRE_S: 3,

  // Janela de erro obrigatório no começo do engajamento (CoD4 missTime Easy:
  // 1,0 s + 0,8/1000 por unidade; 1 un. = 2,54 cm → 0,0315 s/m) [LASTRO no
  // formato, INFERÊNCIA na conversão]. Ela rearma a cada rajada, a não ser
  // que a IA tenha atirado no jogador nos últimos 3 s ("we can only start
  // missing again if it's been a few seconds since we last shot") — E o
  // CoD4 zera esse bloqueio quando a IA faz outra coisa que não atirar:
  // `didSomethingOtherThanShooting()` ("make sure the next time
  // resetAccuracyAndPause() is called, we reset our misstime for sure"),
  // chamado ao virar para encarar (combat.gsc), ao sair da cobertura para
  // atirar (`shootAsTold`, corner.gsc/cover_wall.gsc), ao recarregar e ao
  // trocar de postura [LASTRO]. Aqui o equivalente é a re-exposição: o alvo
  // sumiu, o bot parou de atirar (segurou a posição ou foi atrás) e o re-vê.
  MISS_BASE_S: 1.0, MISS_PER_M_S: 0.0315, MISS_DEBOUNCE_S: 3,
  // PROTEÇÃO QUE SE ESGOTA (B14 — decisão do dono, 2026-09-28: "a 1ª
  // re-espiada continua protegida; espiar de novo em seguida vai perdendo a
  // proteção"). Antes, TODA volta rearmava a janela: quem espiava 3 s / 2 s
  // pagava reação + reaquisição + janela (~3,1–3,4 s a 24 m) e ficava imune
  // (laudo 6aeda6c §5: 282 exposições, 0 mortes). Agora só as
  // REEXPOSE_PROTECTED primeiras voltas SEGUIDAS (escondido ≤ REACQUIRE_S) do
  // mesmo engajamento rearmam a janela; da seguinte em diante ela não rearma
  // — nem pela volta, nem pelo silêncio do esconde (MISS_DEBOUNCE_S).
  // Lastro do mecanismo: CoD4 `_gameskill.gsc` — a cada disparo contra o
  // jogador `set_accuracy_based_on_situation()` chama `resetMissDebounceTime()`
  // (`missTimeDebounce = gettime() + 3000`) e `setMissTime()` sai sem rearmar
  // "if ( self.a.missTimeDebounce > gettime() )": "we can only start missing
  // again if it's been a few seconds since we last shot" — quem está atirando
  // em você não volta a errar de propósito [LASTRO]. A 1ª volta rearma por
  // equivaler a `didSomethingOtherThanShooting()` (o bot segurou a posição)
  // [INFERÊNCIA, de d04d318]. Contar o "seguida" pelo ESCONDE (≤ REACQUIRE_S,
  // a definição de B14) e não pelo relógio literal do CoD4 (3 s desde o último
  // disparo) [INFERÊNCIA, medida]: no ciclo 3 s / 2 s o último disparo cai no
  // fim da exposição e o 1º da volta ≥ 1,4 s depois dela — o silêncio passa
  // SEMPRE de 3 s, e com o relógio literal a janela rearmava em toda volta
  // (0 de 480 exposições com dano, test/bots-combate.test.js). Fora do
  // esconde nada muda: 3 s sem atirar com o alvo à vista (fora de alcance)
  // rearmam como antes. UMA volta protegida [DECISÃO do dono, B14 (a)/(c)].
  // Reação (fila) e reaquisição NÃO se esgotam: toda volta ainda dá ≥ 1,3 s
  // de aviso antes do 1º disparo — o que se esgota é o erro de propósito.
  REEXPOSE_PROTECTED: 1,
  // DMR/sniper: primeiros disparos num alvo novo além de 12,7 m erram (CoD4;
  // no fácil, dois) [LASTRO].
  SCOPED_FIRST_MISSES: 2, SCOPED_FIRST_MISS_M: 12.7,

  // Mira como ERRO ANGULAR (CS: offset ∝ distância; UT3: aimerror em ângulo)
  // [LASTRO no modelo]. A chance de acerto sai da geometria: desvio (m) no
  // alvo = distância × erro; o corpo é uma caixa de ±0,42 m × ±0,85 m.
  AIM_SIGMA_BEST_DEG: 0.7, AIM_SIGMA_WORST_DEG: 1.3, // mira 0,9 → 0,7°; 0,4 → 1,3° [INFERÊNCIA]
  // Foco que fecha com a exposição: ×3 ao adquirir, ×1,4 em 3 s, ~×1 em 6 s
  // (CS 1.6 "focus in" 2–5 s; CS2 AimFocusDecay; UT3 erro ×2 ao adquirir) [LASTRO no formato].
  AIM_FOCUS_EXTRA: 2, AIM_FOCUS_TAU_S: 2,
  BODY_HALF_W: 0.42, BODY_HALF_H: 0.85, // colisor r = 0,42 m; ~1,7 m de altura
  BOT_MOVING_MULT: 0.5,     // atirar andando custa metade (CoD4 run_accuracy) [LASTRO]
  // Alvo em movimento é mais difícil (DOOM) [LASTRO qualitativo]; ×0,8 andando
  // (5,2 m/s) e ×0,6 correndo (8,6 m/s) [INFERÊNCIA]; mudou de direção ×0,7 (Quake III) [LASTRO].
  TARGET_WALK_SPEED: 5.2, TARGET_WALK_MULT: 0.8, TARGET_RUN_SPEED: 8.6, TARGET_RUN_MULT: 0.6,
  TARGET_TURN_MULT: 0.7,

  // Token de acerto por humano: todos atiram, só o dono do token ACERTA; os
  // outros erram perto (Game AI Pro 3 cap. 33) [LASTRO]. Um token por humano
  // no celular (Half-Life 2 vagas, TLOU 1) [INFERÊNCIA na contagem].
  // Intervalo mínimo entre acertos de bot no mesmo humano [INFERÊNCIA: 1,0 s
  // não trava o fuzil de UM bot, 1,1 s de cadência]; dobra se o bot está
  // atrás do humano (cap. 33 dobra quando o jogador não vê a IA) [LASTRO no formato].
  HIT_GAP_S: 1.0, HIT_GAP_BEHIND_MULT: 2, BEHIND_DEG: 90,

  // Ameaça como soma, com desconto por atacante a mais (CoD Threat Bias:
  // visível 1000, alvo atual 500, feriu-me 1000, −150 por atacante, teto
  // −1000) [LASTRO]; humano sem viés extra no fácil [LASTRO: threatbias easy < veteran].
  THREAT_SEEN: 1000, THREAT_REMEMBERED: 250, THREAT_NEAR: 1000,
  THREAT_HURT_ME: 1000, THREAT_HURT_WINDOW_S: 5, THREAT_CURRENT: 500,
  THREAT_SHOOTING: 250, THREAT_SHOOTING_WINDOW_S: 3,
  THREAT_PER_ATTACKER: -150, THREAT_ATTACKERS_CAP: -1000, THREAT_HUMAN_BIAS: 0,

  // Erro VISÍVEL: traçante rente ao rosto (cap. 33 "at eye level"; Lidén)
  // [LASTRO]; 0,5–1,5 m de lado [INFERÊNCIA]; segue 12 m além do alvo.
  NEAR_MISS_MIN_M: 0.5, NEAR_MISS_MAX_M: 1.5, NEAR_MISS_LIFT_M: 0.2, NEAR_MISS_OVERSHOOT_M: 12,

  // POSTURA do humano: `crouch` do playerUpdate (0 = em pé, 1 = agachado; o
  // servidor já sanitizou e derruba para 0 quem se move rápido demais para
  // estar agachado — server.js crouchFromState).
  // O corpo agachado do boneco remoto (br-game.js, AGACHA): a cabeça desce os
  // mesmos 0,58 m do olho (game.js: 1,62 → 1,04) e o centro do tronco fica a
  // ~0,55 m. É ONDE o bot procura o alvo: atrás de uma crista baixa o agachado
  // some como some da tela de um humano [coerência com o desenho].
  CROUCH_DROP_M: 0.58, CROUCH_AIM_H: 0.55,
  // Intervalo entre acertos: "keep the base delay if the player is standing
  // [...] but double it if they are crouching" (Game AI Pro 3, cap. 33)
  // [LASTRO]. O atraso-base de UM bot é a cadência da arma dele quando ela
  // passa do intervalo global (fuzil 1,1 s > 1,0 s): dobrar só o global não
  // dobraria nada para um bot sozinho [INFERÊNCIA no atraso-base].
  HIT_GAP_CROUCH_MULT: 2,
  // Notar (CS, cs_bot_vision.cpp — chance por 0,25 s, perto → longe, com
  // interpolação linear entre 300 e 1000 unidades): parado em pé 100 → 10,
  // parado agachado 80 → 5 ("crouching and motionless - very tough to
  // notice"); andando em pé 100 → 75, andando agachado 90 → 60 [LASTRO]. Aqui
  // entra só a RAZÃO agachado ÷ em pé na taxa do medidor (chance por quantum
  // → taxa: [INFERÊNCIA]); 1 un. = 2,54 cm [INFERÊNCIA na conversão].
  // Passos: o CS não manda passo de quem anda agachado aos bots (player.cpp:
  // EVENT_PLAYER_FOOTSTEP só com `velocity.Length2D() > 150`, e agachado anda
  // a 0,333 × a velocidade — pm_shared.h PLAYER_DUCKING_MULTIPLIER). Estes
  // bots não ouvem passo nenhum, só tiro: não há o que aplicar.
  NOTICE_CS_NEAR_M: 300 * 0.0254, NOTICE_CS_FAR_M: 1000 * 0.0254,
  NOTICE_CS_STILL_STAND: [100, 10], NOTICE_CS_STILL_CROUCH: [80, 5],
  NOTICE_CS_MOVING_STAND: [100, 75], NOTICE_CS_MOVING_CROUCH: [90, 60],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* erf (Abramowitz & Stegun 7.1.26, erro < 1,5e-7): P(|N(0,σ)| < a) = erf(a/(σ√2)) */
function erf(x) {
  const s = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const k = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * k - 1.453152027) * k) + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-ax * ax);
  return s * y;
}

/* ---------------- percepção ---------------- */

/* Quem está no helicóptero NÃO é alvo (decisão do dono, 2026-09-28): o bot
   não o percebe, não vira para ele e não atira — voando ou pousado. O
   `playerUpdate` do servidor traz `heli` (observePlayerUpdate); ao descer ele
   volta a ser candidato e o bot precisa notá-lo de novo. */
function isTargetable(self, c) {
  return !!c && c.id !== self.id && !!c.alive && !c.spectator && c.phase === 'PLAY' && !c.heli
    && [self.x, self.z, c.x, c.z].every(Number.isFinite);
}

function viewHalfAngleDeg(d) {
  const k = clamp((d - AI.FOV_NEAR_M) / (AI.FOV_FAR_M - AI.FOV_NEAR_M), 0, 1);
  return AI.FOV_NEAR_HALF_DEG + (AI.FOV_FAR_HALF_DEG - AI.FOV_NEAR_HALF_DEG) * k;
}

/* frente do avatar = -Z girado por yaw (mesma convenção de movementYaw) */
function inViewCone(yaw, dx, dz, d) {
  if (d < 1e-6) return true;
  if (!Number.isFinite(yaw)) return true;
  const cos = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d;
  return cos >= Math.cos(viewHalfAngleDeg(d) * DEG) - 1e-12;
}

/* Linha de visada contra o HEIGHTMAP; bloqueia se o chão passa acima da reta
   olho → ponto em qualquer lugar dela. As PAREDES entram por cima dela, em
   `clearSight` (B7, abaixo).

   Na grade do terreno (`terrain.losGrid`, a MESMA do cliente: createBotTerrain)
   a visada é EXATA. `heightAt` interpola o triângulo da célula (js/terrain.js),
   então ao longo da reta o chão é linear por trechos, com quebra onde a reta
   cruza x = i·cell, z = j·cell ou a diagonal fx + fz = k. A diferença
   chão − reta também é linear por trechos: se passa de zero em algum ponto,
   passa numa quebra ou numa ponta — basta testar essas. Custa ~2 pontos por
   célula atravessada, o mesmo da antiga marcha de 2 m, que pulava cristas
   finas (laudo 7515734, B6: o bot via 0,44 % dos pares que o cliente esconde).
   Fora da grade (borda do mundo, altura analítica) e em dublês de teste:
   marcha de LOS_MARCH_M.

   SEM TERRENO NÃO HÁ VISADA (B12c). Antes, `terrain` nulo devolvia true: o bot
   enxergava através de tudo, em silêncio — foi assim que os bots rodaram em
   produção quando o `three` faltou. Agora ele não enxerga ninguém: ouve tiro
   e vai investigar, mas não vira nem atira (atirar exige ver). A falha
   aparece no log (`[bots] terreno indisponível`, startBots). */
const LOS_MARCH_M = 0.5;
function lineOfSight(terrain, from, to) {
  if (!relevoLivre(terrain, from, to)) return false;
  /* a rocha DESENHADA do vulcão (js/vulcao-solido.js), a mesma que para a
     bala do cliente: o relevo é uma grade suave dela */
  const v = terrain.vulcao;
  if (v) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
    if (len > 1e-6 && v.reta(from.x, from.y, from.z, dx / len, dy / len, dz / len, len) < len) return false;
  }
  return true;
}
/* onde o bot pisa: o relevo, ou a rocha desenhada do vulcão quando ela está
   por cima (a mesma regra do jogador, js/vulcao-solido.js chaoDoVulcao) */
function chaoDoBot(terrain, x, z) {
  const h = terrain.heightAt(x, z);
  const v = terrain.vulcao ? terrain.vulcao.chao(x, z) : -Infinity;
  return v > h ? v : h;
}
function relevoLivre(terrain, from, to) {
  if (!terrain || typeof terrain.heightAt !== 'function') return false;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const above = k => terrain.heightAt(from.x + dx * k, from.z + dz * k) <= from.y + dy * k;
  if (!above(0) || !above(1)) return false;
  const g = terrain.losGrid;
  if (g) {
    const ax = (from.x + g.half) / g.cell, az = (from.z + g.half) / g.cell;
    const bx = (to.x + g.half) / g.cell, bz = (to.z + g.half) / g.cell;
    if (Math.min(ax, az, bx, bz) >= 0 && Math.max(ax, az, bx, bz) < g.segs) {
      return gridCrossingsClear(ax, bx, above) && gridCrossingsClear(az, bz, above)
        && gridCrossingsClear(ax + az, bx + bz, above);
    }
  }
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / LOS_MARCH_M));
  for (let i = 1; i < n; i++) if (!above(i / n)) return false;
  return true;
}
/* uma família de retas da grade (coordenada `a` inteira): testa cada cruzamento */
function gridCrossingsClear(a0, a1, above) {
  if (a1 === a0) return true;
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1), inv = 1 / (a1 - a0);
  for (let n = Math.floor(lo) + 1; n < hi; n++) if (!above((n - a0) * inv)) return false;
  return true;
}

/* ---------------- paredes (B7) ----------------
   O bot enxerga os MESMOS prédios que o jogador: js/paredes.js monta, só a
   partir da semente e do relevo, as caixas que o cliente tem em
   `Structures.walls` (cidade, Torre Nexus, castelo, cabanas, torres, ruínas,
   bases e o cofre) — paridade caixa a caixa em test/paredes-paridade.test.js.
   A cidade tem dois estados: de pé, e destruída pelos mísseis (urbano sai,
   escombros entram — `paredesComCidadeDestruida`); quem diz qual vale é o
   servidor (`cityDestruction`, ver `applyCityState`).

   A consulta é a conta do `Structures.rayHit` (slab test de paredes.js),
   dividida em grupos por vizinhança com uma caixa envolvente cada: o segmento
   que não encosta na caixa do grupo (alargada 1 mm, folga para o arredondamento
   das duas parametrizações) não pode bater em nenhuma parede dele, então o
   resultado é o MESMO da consulta inteira — só mais barato (o teste compara
   os dois em 40 000 segmentos). A cidade sozinha tem 139 caixas.

   Árvores, pedras, cactos, a tenda e os POIs entram pela consulta de
   OBSTÁCULOS (abaixo, `createBotObstacles`): mesma ideia, outro módulo puro.

   O SOM atravessa parede, de propósito: `onPlayerFired` não consulta nada
   disto. O tiro revela a posição (Quake III, Halo — "Cause-Effect Stimuli —
   Discovery — Weapon Fire"; TLOU — "either visibly or by shooting his gun";
   referência de bots §3.5): o bot ouve quem atira atrás do prédio, vira e vai
   investigar — mas atirar continua exigindo VER. */
const WALL_CELL_M = 24, WALL_GROUP_PAD_M = 1e-3;

/* o trecho [t0, t1] do segmento (parâmetro em [0, 1]) que cabe entre lo e hi
   num eixo; devolve false se não sobra nada */
function slab(o, d, lo, hi, span) {
  if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
  let ta = (lo - o) / d, tb = (hi - o) / d;
  if (ta > tb) { const m = ta; ta = tb; tb = m; }
  if (ta > span[0]) span[0] = ta;
  if (tb < span[1]) span[1] = tb;
  return span[0] <= span[1];
}

function createWallQuery(walls, Par) {
  const groups = new Map();
  for (const w of walls) {
    const key = Math.floor((w.x0 + w.x1) / 2 / WALL_CELL_M) + ',' + Math.floor((w.z0 + w.z1) / 2 / WALL_CELL_M);
    let g = groups.get(key);
    if (!g) { g = { walls: [], x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity }; groups.set(key, g); }
    g.walls.push(w);
    g.x0 = Math.min(g.x0, w.x0 - WALL_GROUP_PAD_M); g.x1 = Math.max(g.x1, w.x1 + WALL_GROUP_PAD_M);
    g.y0 = Math.min(g.y0, w.y0 - WALL_GROUP_PAD_M); g.y1 = Math.max(g.y1, w.y1 + WALL_GROUP_PAD_M);
    g.z0 = Math.min(g.z0, w.z0 - WALL_GROUP_PAD_M); g.z1 = Math.max(g.z1, w.z1 + WALL_GROUP_PAD_M);
  }
  const list = [...groups.values()].map(g => Object.assign(g, { q: Par.criarConsultaParedes(g.walls) }));
  const span = [0, 1];
  /* o segmento a→b encosta na caixa envolvente do grupo? */
  function touches(g, a, dx, dy, dz) {
    span[0] = 0; span[1] = 1;
    return slab(a.x, dx, g.x0, g.x1, span) && slab(a.y, dy, g.y0, g.y1, span) && slab(a.z, dz, g.z0, g.z1, span);
  }
  return {
    walls, groups: list.length,
    /* a reta a→b bate numa parede antes de chegar em b (Structures.segBlocked) */
    segmentBlocked(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      for (const g of list) if (touches(g, a, dx, dy, dz) && g.q.segmentoBloqueado(a, b)) return true;
      return false;
    },
    /* o ponto está dentro de alguma parede (bot que atravessou uma andando) */
    contains(p) {
      for (const g of list) {
        if (p.x < g.x0 || p.x > g.x1 || p.y < g.y0 || p.y > g.y1 || p.z < g.z0 || p.z > g.z1) continue;
        for (const w of g.walls) {
          if (p.x > w.x0 && p.x < w.x1 && p.y > w.y0 && p.y < w.y1 && p.z > w.z0 && p.z < w.z1) return true;
        }
      }
      return false;
    },
  };
}

/* As paredes da semente, nos dois estados da cidade. `terrain` é o de
   createBotTerrain: o relevo decide onde cada construção assenta. */
async function createBotSolids(worldSeed, terrain) {
  const Par = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
  const Ob = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'obstaculos.js')).href);
  const Toys = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'maptoys-core.js')).href);
  const mundo = Par.construirMundoSolido({
    worldSeed, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
    WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY,
  });
  /* o painel do campo de tiro é parede no cliente (js/maptoys.js) — e fica
     de pé com a cidade destruída (não é urbano) */
  const atracoes = Ob.atracoesDaSemente({
    worldSeed, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt, biomeAt: terrain.biomeAt,
    WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY, sitios: mundo.plano.sites,
  });
  const dasAtracoes = Toys.paredesDasAtracoes(atracoes, terrain.heightAt);
  return {
    intact: createWallQuery(Par.paredesDoJogo(mundo).concat(dasAtracoes), Par),
    destroyed: createWallQuery(Par.paredesComCidadeDestruida(mundo).concat(dasAtracoes), Par),
    atracoes,
  };
}

/* ---------------- obstáculos (B7: pedra, árvore) ----------------
   Árvores, pedras, cactos, a tenda do acampamento e os POIs (mercado,
   refúgio, barris) barram a bala no `rayBlockedAt` do cliente — e a VÍTIMA
   recusa o dano por eles (`youWereHit`, br-game.js). Antes o Node não os
   conhecia (nasciam do Math.random global seedado, depois do terreno e da
   grama) e o bot via, virava e metralhava a pedra na frente do jogador:
   33 de 41 pares atrás de pedra no laudo 070502f.

   js/obstaculos.js monta, só pela semente, o relevo e os sítios das
   construções, a MESMA lista que o cliente registra no `obstaclesNear`
   (paridade em test/obstaculos-paridade.test.js) e a consulta com a regra da
   bala: círculo de raio r·√0,8, até 3,4 m acima do chão. A consulta é
   contínua — o cliente amostra a cada 1,6 m, então tudo que a vítima diz
   estar coberto o bot também diz (e um pouco mais: a reta que passa pela
   borda entre duas amostras). Obstáculo não depende do estado da cidade: a
   vegetação não nasce no distrito urbano. */
async function createBotObstacles(worldSeed, terrain) {
  const Par = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'paredes.js')).href);
  const Ob = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'obstaculos.js')).href);
  const { CFG } = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'config.js')).href);
  const { plano } = Par.construirMundoSolido({
    worldSeed, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt,
    WATER_LEVEL: terrain.WATER_LEVEL, CITY: terrain.CITY,
  });
  const { solidos } = Ob.construirObstaculos({
    worldSeed, heightAt: terrain.heightAt, slopeAt: terrain.slopeAt, biomeAt: terrain.biomeAt,
    noise: (x, z) => terrain.simplex.noise(x, z), WATER_LEVEL: terrain.WATER_LEVEL,
    CITY: terrain.CITY, VOLCANO: terrain.VOLCANO, sitios: plano.sites,
    WORLD_SIZE: CFG.WORLD_SIZE, TREE_COUNT: CFG.TREE_COUNT, ROCK_COUNT: CFG.ROCK_COUNT,
  });
  const q = Ob.criarConsultaObstaculos(solidos, { heightAt: terrain.heightAt, grade: terrain.losGrid || null });
  return { ...q, solidos };
}

/* O olho do bot dentro do colisor de um obstáculo (o bot anda em linha reta
   e atravessa pedra e árvore). De dentro ele não ENXERGA porque a consulta já
   barra a reta que nasce dentro do cilindro (js/obstaculos.js) — ao contrário
   do `Structures.rayHit`, que ignora a caixa onde a reta nasce e por isso
   precisa do `eyeInsideWall` na percepção. Aqui a guarda serve para o FOGO:
   na cauda da reação (0,6 s) o bot age sobre o que via de fora, e o traçante
   sairia de dentro da pedra. */
function eyeInsideObstacle(obstacles, eye) {
  return !!obstacles && obstacles.contem(eye);
}

/* O estado da cidade é do SERVIDOR (city-destruction-protocol.js, server.js):
   `cityDestruction` sai com state 'intact' → 'cinematic' → 'destroyed', no
   impacto. O cliente troca as paredes no MESMO instante (city.destroy() no
   `impactAt`), então 'cinematic' ainda é cidade de pé. `init` traz o estado
   atual, `matchStart` e `nextMatch` recomeçam de pé. */
function applyCityState(world, cd) {
  world.cityDestroyed = !!cd && cd.state === 'destroyed';
}
function activeWalls(world) {
  if (!world.solids) return null;
  return world.cityDestroyed ? world.solids.destroyed : world.solids.intact;
}

/* ---------------- veículos (cobertura com vida) ----------------
   Decisão do dono (2026-09-28): "carro pode segurar tiro, mas não... pra
   sempre!!". Veículo INTEIRO barra a bala no cliente (os três caminhos do
   tiro) e a vítima recusa dano através dele — o bot segue a MESMA regra, com
   o MESMO módulo (js/veiculo-vida.js): não enxerga através de veículo
   inteiro, e o tiro que ele dá num humano com o veículo no caminho ACERTA O
   VEÍCULO (`vehicleHit`, validado e descontado no servidor). Quando o
   servidor anuncia a vida em zero (`vehicleBurning`) o veículo deixa de
   barrar na hora; quando explode (`vehicleExploded`), sai do mundo.

   Onde está cada um: a frota da semente vem do servidor (`plan.veiculos` no
   `matchStart`; `init.veiculos` para quem conecta com a partida rodando) e
   a pose de quem está sendo dirigido vem do `playerUpdate` do motorista
   (`car` = índice, `pos` = a pose do veículo, `rotY` = o giro), igual ao que
   os clientes desenham. Carro largado fica onde o motorista o deixou.
   Referência: docs/mobile/referencia-veiculos.md. */
let VV = null; // js/veiculo-vida.js (ESM): carregado com a geometria do mundo
async function loadVehicleRules() {
  if (!VV) VV = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'veiculo-vida.js')).href);
  return VV;
}
/* `lista`: o formato do servidor — [{ v, tipo, pos: [x,y,z], ry, estado }] */
function applyVehicleFleet(world, lista) {
  world.vehicles = [];
  world.vehicleById = new Map();
  for (const e of Array.isArray(lista) ? lista : []) {
    if (!e || !Array.isArray(e.pos) || e.pos.length < 3 || !e.pos.every(Number.isFinite)) continue;
    const v = { id: e.v, tipo: e.tipo, inteiro: (e.estado || 'inteiro') === 'inteiro',
      pose: { x: e.pos[0], y: e.pos[1], z: e.pos[2], yaw: Number(e.ry) || 0 } };
    world.vehicles.push(v);
    world.vehicleById.set(String(e.v), v);
  }
}
/* quem está no veículo manda a pose dele no `playerUpdate` */
function observeVehicleFromUpdate(world, update) {
  if (!world.vehicleById || !update || !Array.isArray(update.pos)) return;
  const pos = update.pos.slice(0, 3).map(Number);
  if (pos.length < 3 || !pos.every(Number.isFinite)) return;
  const id = Number.isInteger(update.car) && update.car >= 0 ? String(update.car) : update.heli ? 'heli' : null;
  const v = id && world.vehicleById.get(id);
  if (!v) return;
  v.pose.x = pos[0]; v.pose.y = pos[1]; v.pose.z = pos[2];
  if (Number.isFinite(Number(update.rotY))) v.pose.yaw = Number(update.rotY);
}
/* vida em zero (queimando) ou explodido: não barra mais nada */
function vehicleOut(world, d) {
  const v = d && world.vehicleById && world.vehicleById.get(String(d.v));
  if (v) v.inteiro = false;
}
/* o primeiro veículo inteiro no segmento a→b: { t, alvo } (t ao longo da
   reta, em metros) ou null. Sem a regra carregada ou sem frota: null. */
function vehicleOnSegment(vehicles, a, b) {
  if (!VV || !vehicles || !vehicles.length) return null;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;
  const h = VV.raioNaFrota(a, { x: dx / len, y: dy / len, z: dz / len }, len, vehicles);
  return h ? { t: h.t, alvo: h.alvo, dir: { x: dx / len, y: dy / len, z: dz / len } } : null;
}
/* olho do bot dentro de um veículo inteiro (atravessou andando): de dentro
   ele não enxerga nem atira — a regra da parede */
function eyeInsideVehicle(vehicles, eye) {
  return !!(VV && vehicles && vehicles.length && VV.dentroDaFrota(eye, vehicles));
}

/* Visada completa: relevo, paredes, obstáculos E veículos inteiros.
   `walls`/`obstacles`/`vehicles` nulos = mundo sem construção/vegetação/
   frota (os dublês de teste). No processo real os três primeiros chegam
   JUNTOS (createBotWorldGeometry) — sem eles, `terrain` fica nulo e o bot não
   vê ninguém (B12c). */
function clearSight(terrain, walls, from, to, obstacles = null, vehicles = null) {
  if (!lineOfSight(terrain, from, to)) return false;
  if (walls && walls.segmentBlocked(from, to)) return false;
  if (obstacles && obstacles.segmentoBloqueado(from, to)) return false;
  return !vehicleOnSegment(vehicles, from, to);
}

/* postura de um candidato: número em [0, 1]; qualquer outra coisa é em pé */
function crouchOf(c) {
  const v = c ? c.crouch : 0;
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : 0;
}

/* alturas (acima do pé) onde o bot procura o corpo: cabeça e tronco */
function bodyHeights(crouch) {
  return {
    head: AI.HEAD_H - AI.CROUCH_DROP_M * crouch,
    aim: AI.AIM_H + (AI.CROUCH_AIM_H - AI.AIM_H) * crouch,
  };
}

/* razão agachado ÷ em pé da chance de notar do CS na distância `d` */
function crouchNoticeMult(d, moving, crouch) {
  if (!(crouch > 0)) return 1;
  const k = clamp((d - AI.NOTICE_CS_NEAR_M) / (AI.NOTICE_CS_FAR_M - AI.NOTICE_CS_NEAR_M), 0, 1);
  const [sN, sF] = moving ? AI.NOTICE_CS_MOVING_STAND : AI.NOTICE_CS_STILL_STAND;
  const [cN, cF] = moving ? AI.NOTICE_CS_MOVING_CROUCH : AI.NOTICE_CS_STILL_CROUCH;
  const ratio = (cN + (cF - cN) * k) / (sN + (sF - sN) * k);
  return 1 + (ratio - 1) * crouch;
}

function noticeRate(d, speed, inCombat, crouch = 0) {
  const k = clamp((d - AI.NOTICE_NEAR_M) / (AI.NOTICE_FAR_M - AI.NOTICE_NEAR_M), 0, 1);
  let r = AI.NOTICE_NEAR_PER_S + (AI.NOTICE_FAR_PER_S - AI.NOTICE_NEAR_PER_S) * k;
  const moving = speed > AI.NOTICE_MOVING_SPEED;
  if (moving) r *= AI.NOTICE_MOVING_MULT;
  if (inCombat) r *= AI.NOTICE_COMBAT_MULT;
  return r * crouchNoticeMult(d, moving, crouch);
}

function awarenessOf(bot, id) {
  if (!bot.aware) bot.aware = new Map();
  let a = bot.aware.get(id);
  if (!a) {
    a = {
      meter: 0, perceived: false, visible: false,
      known: null, knownT: -Infinity,   // última posição conhecida (vista ou ouvida)
      alertT: -Infinity, heardT: -Infinity, hurtT: -Infinity,
      hist: [],                         // fila de reação: {t, x, y, z, seen, known}
    };
    bot.aware.set(id, a);
  }
  return a;
}

/* amostra mais recente com instante ≤ tq (a fila é cronológica) */
function sampleAt(a, tq) {
  for (let i = a.hist.length - 1; i >= 0; i--) if (a.hist[i].t <= tq + 1e-6) return a.hist[i];
  return null;
}

/* velocidade do alvo (posição real de agora contra ~0,3 s atrás) e se ele
   inverteu a direção em relação aos 0,3 s anteriores */
function targetMotion(a, c, t) {
  if (!a || !c) return { speed: 0, turned: false };
  const s1 = sampleAt(a, t - 0.3), s0 = s1 && sampleAt(a, s1.t - 0.3);
  if (!s1 || t - s1.t < 0.05) return { speed: 0, turned: false };
  const vx = (c.x - s1.x) / (t - s1.t), vz = (c.z - s1.z) / (t - s1.t);
  const speed = Math.hypot(vx, vz);
  let turned = false;
  if (s0 && s1.t - s0.t > 0.05) {
    const ux = (s1.x - s0.x) / (s1.t - s0.t), uz = (s1.z - s0.z) / (s1.t - s0.t);
    turned = speed > 1 && Math.hypot(ux, uz) > 1 && vx * ux + vz * uz < 0;
  }
  return { speed, turned };
}

/* O olho do bot está DENTRO de uma parede: ele atravessou um prédio andando
   (o bot anda em linha reta e não desvia de construção). A conta do
   `Structures.rayHit` ignora a caixa onde a reta NASCE — pela regra dela, o
   bot enxergaria para fora do prédio enquanto quem está lá fora não o vê (a
   reta do humano até ele bate na fachada). Visão é recíproca: de dentro da
   parede ele não vê ninguém, e a bala que sairia dali para na parede. */
function eyeInsideWall(walls, eye) {
  return !!walls && walls.contains(eye);
}

/* Um passo de percepção de UM bot: atualiza o medidor, a memória e a fila de
   reação de cada candidato. Quem não está mais na lista (morreu, saiu, nave)
   é esquecido. `walls`: a consulta de paredes do estado atual da cidade;
   `obstacles`: a de pedras, árvores, cactos e POIs; `vehicles`: a frota
   (só os inteiros barram). */
function perceive(bot, candidates, terrain, t, dt, walls = null, obstacles = null, vehicles = null) {
  if (!bot.aware) bot.aware = new Map();
  const present = new Set();
  const inCombat = t - Math.max(bot.lastShotT ?? -Infinity, bot.hurtT ?? -Infinity) <= AI.COMBAT_WINDOW_S;
  const eye = { x: bot.x, y: (bot.y || 0) + AI.EYE_H, z: bot.z };
  const walled = eyeInsideWall(walls, eye) || eyeInsideVehicle(vehicles, eye);
  for (const c of candidates) {
    if (!isTargetable(bot, c)) continue;
    present.add(c.id);
    const dx = c.x - bot.x, dz = c.z - bot.z, d = Math.hypot(dx, dz);
    let a = bot.aware.get(c.id);
    if (!a) {
      if (d > AI.VIEW_RANGE) continue;
      a = awarenessOf(bot, c.id);
    }
    const alerted = t - a.alertT <= AI.ALERT_S;
    let visible = false;
    const crouch = crouchOf(c);
    if (!walled && d <= AI.VIEW_RANGE && (alerted || inViewCone(bot.yaw, dx, dz, d))) {
      const cy = c.y || 0, h = bodyHeights(crouch);
      visible = clearSight(terrain, walls, eye, { x: c.x, y: cy + h.head, z: c.z }, obstacles, vehicles)
        || clearSight(terrain, walls, eye, { x: c.x, y: cy + h.aim, z: c.z }, obstacles, vehicles);
    }
    if (visible) {
      const { speed } = targetMotion(a, c, t);
      a.meter = Math.min(1, a.meter + dt * noticeRate(d, speed, inCombat, crouch));
    } else if (!a.perceived) {
      a.meter = Math.max(0, a.meter - dt * AI.NOTICE_DECAY_PER_S);
    }
    if (!a.perceived && a.meter >= 1) a.perceived = true;
    if (a.perceived && visible) { a.known = { x: c.x, y: c.y || 0, z: c.z }; a.knownT = t; }
    a.visible = visible;
    // a fila guarda TUDO que o bot sabe naquele instante: se já percebeu, se
    // via, e onde achava que o alvo estava — o bot age sobre a de 0,6 s atrás
    a.hist.push({
      t, x: c.x, y: c.y || 0, z: c.z, seen: a.perceived && visible,
      known: a.perceived && a.known ? a.known : null,
    });
    if (a.hist.length > AI.HISTORY) a.hist.shift();
    if (a.perceived && !visible && t - a.knownT > AI.MEMORY_S) bot.aware.delete(c.id);
    else if (!a.perceived && a.meter <= 0 && d > AI.VIEW_RANGE) bot.aware.delete(c.id);
  }
  for (const id of [...bot.aware.keys()]) if (!present.has(id)) bot.aware.delete(id);
}

/* O que o bot SABE agora é o que ele sabia REACTION_S atrás: quem ele via
   naquela amostra (na posição dela), ou quem ele lembrava (na posição que
   conhecia então). Perceber, virar e reagir a tiro — tudo passa pela fila. */
function knownTargets(bot, candidates, t) {
  const byId = new Map(candidates.map(c => [c.id, c]));
  const out = [];
  for (const [id, a] of bot.aware || []) {
    const c = byId.get(id);
    const view = c && sampleAt(a, t - AI.REACTION_S);
    if (!view || !view.known) continue;
    const seen = !!view.seen;
    const p = seen ? view : view.known;
    out.push({
      id, x: p.x, y: p.y, z: p.z, isBot: !!c.isBot, alive: true, spectator: false, phase: 'PLAY',
      seen, hurtT: a.hurtT, heardT: a.heardT, rotY: c.rotY, crouch: crouchOf(c),
    });
  }
  return out;
}

/* ---------------- escolha de alvo ---------------- */

function threatScore(self, c, d, t, attackers) {
  let s = c.seen === false ? AI.THREAT_REMEMBERED : AI.THREAT_SEEN;
  s += AI.THREAT_NEAR * Math.max(0, 1 - d / AI.VIEW_RANGE);
  if (t - (c.hurtT ?? -Infinity) <= AI.THREAT_HURT_WINDOW_S) s += AI.THREAT_HURT_ME;
  if (t - (c.heardT ?? -Infinity) <= AI.THREAT_SHOOTING_WINDOW_S) s += AI.THREAT_SHOOTING;
  if (self.targetId != null && self.targetId === c.id) s += AI.THREAT_CURRENT;
  s += Math.max(AI.THREAT_ATTACKERS_CAP, AI.THREAT_PER_ATTACKER * attackers);
  if (!c.isBot) s += AI.THREAT_HUMAN_BIAS;
  return s;
}

/* Alvo = maior ameaça entre os candidatos alvejáveis no raio. Sem prioridade
   ao humano: antes era `nearestHuman || nearestBot`, e todo bot num raio de
   100 m escolhia o humano. `ctx.engaged` = Map id → nº de OUTROS bots já
   atacando aquele alvo. */
function selectTarget(self, candidates, maxRange, ctx = {}) {
  const t = Number.isFinite(ctx.t) ? ctx.t : 0;
  const engaged = ctx.engaged || null;
  let best = null, bestScore = -Infinity;
  for (const c of candidates) {
    if (!isTargetable(self, c)) continue;
    const d = Math.hypot(c.x - self.x, c.z - self.z);
    if (d > maxRange) continue;
    const score = threatScore(self, c, d, t, engaged ? (engaged.get(c.id) || 0) : 0);
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

function countAttackers(bots, self) {
  const m = new Map();
  for (const o of bots) {
    if (o === self || !o.alive || o.phase !== 'PLAY' || o.targetId == null) continue;
    m.set(o.targetId, (m.get(o.targetId) || 0) + 1);
  }
  return m;
}

/* Engajamento: `engageT` = quando o alvo atual passou a ser VISTO (depois da
   reação). É dele que contam o atraso do 1º disparo e o foco da mira. Trocar
   de alvo, ou perdê-lo de vista por REACQUIRE_S, recomeça do zero.

   Re-exposição: o alvo atual sumiu por mais de REACQUIRE_HIDDEN_S (medido num
   tick em que ele NÃO estava à vista, como o `notSeenEnemyTime > 0.25f` do CS
   — um piscar de um tick não conta) e voltou. A volta paga um atraso de
   reaquisição (`reacquireT` + `reacquireDelay`) e, só nas REEXPOSE_PROTECTED
   primeiras voltas seguidas (`reexposures`), rearma a janela de erro
   (`missRearm`); nas seguintes a janela fica gasta (`missDebounced`: nem o
   silêncio do esconde a rearma — B14). O foco da mira continua o do
   engajamento. Tudo isso em cima da fila de reação: `target.seen` já é o que
   o bot via REACTION_S atrás. */
function updateEngagement(bot, target, t, rng) {
  const id = target ? target.id : null;
  if (id !== bot.targetId) {
    bot.targetId = id; bot.engageT = null; bot.targetHidden = false; bot.targetSeenT = -Infinity;
  }
  if (!target) return;
  if (!target.seen) {
    if (bot.engageT != null && t - (bot.targetSeenT ?? -Infinity) > AI.REACQUIRE_HIDDEN_S) bot.targetHidden = true;
    return;
  }
  if (bot.engageT == null || t - (bot.targetSeenT ?? -Infinity) > AI.REACQUIRE_S) {
    bot.engageT = t;
    bot.attackDelay = AI.ATTACK_DELAY_MIN_S + rng() * (AI.ATTACK_DELAY_MAX_S - AI.ATTACK_DELAY_MIN_S);
    bot.reacquireT = null;
    bot.missRearm = true;
    bot.reexposures = 0;
    bot.missDebounced = false;
  } else if (bot.targetHidden) {
    bot.reacquireT = t;
    bot.reacquireDelay = AI.REACQUIRE_DELAY_MIN_S + rng() * (AI.REACQUIRE_DELAY_MAX_S - AI.REACQUIRE_DELAY_MIN_S);
    bot.reexposures = (bot.reexposures || 0) + 1;
    bot.missRearm = bot.reexposures <= AI.REEXPOSE_PROTECTED;
    bot.missDebounced = !bot.missRearm;
  }
  bot.targetHidden = false;
  bot.targetSeenT = t;
}

/* ---------------- disparo ---------------- */

function aimSigmaDeg(bot) {
  const mira = clamp(Number.isFinite(bot.mira) ? bot.mira : 0.65, 0.4, 0.9);
  return AI.AIM_SIGMA_WORST_DEG - (mira - 0.4) / 0.5 * (AI.AIM_SIGMA_WORST_DEG - AI.AIM_SIGMA_BEST_DEG);
}

function targetMotionMult(v) {
  if (!(v > 0.5)) return 1;
  if (v <= AI.TARGET_WALK_SPEED) return 1 + (AI.TARGET_WALK_MULT - 1) * (v - 0.5) / (AI.TARGET_WALK_SPEED - 0.5);
  if (v <= AI.TARGET_RUN_SPEED) {
    return AI.TARGET_WALK_MULT + (AI.TARGET_RUN_MULT - AI.TARGET_WALK_MULT)
      * (v - AI.TARGET_WALK_SPEED) / (AI.TARGET_RUN_SPEED - AI.TARGET_WALK_SPEED);
  }
  return AI.TARGET_RUN_MULT;
}

/* Chance de UM disparo acertar: geometria (erro angular × distância contra o
   tamanho do corpo), foco que fecha com a exposição, e os multiplicadores de
   movimento. Cai com a distância sem tabela nenhuma. */
function hitChance({ distance, sigmaDeg, aimScale = 1, exposureS = 0, botMoving = false, targetSpeed = 0, targetTurned = false }) {
  const focus = 1 + AI.AIM_FOCUS_EXTRA * Math.exp(-Math.max(0, exposureS) / AI.AIM_FOCUS_TAU_S);
  const spread = Math.max(0.02, Math.max(distance, 0.5) * sigmaDeg * DEG * aimScale * focus);
  let p = erf(AI.BODY_HALF_W / (Math.SQRT2 * spread)) * erf(AI.BODY_HALF_H / (Math.SQRT2 * spread));
  if (botMoving) p *= AI.BOT_MOVING_MULT;
  p *= targetMotionMult(targetSpeed);
  if (targetTurned) p *= AI.TARGET_TURN_MULT;
  return clamp(p, 0, 1);
}

/* Token de acerto por humano (Game AI Pro 3 cap. 33): "Token distribution
   is controlled by a global timer that tracks how long has passed since the
   last hit". Um cronômetro por humano: depois de um acerto de bot, nenhum
   bot acerta aquele humano até passar o intervalo; o primeiro disparo que
   acertaria depois disso leva o token e zera o cronômetro. Quem pede antes
   erra perto. Sem dono fixo de propósito: um dono que segurasse o token
   errando deixava 4 bots tão letais quanto 1 (medido: TTK 10,85 s × 10,65 s).
   Bot-contra-bot não usa token. */
function createHitDirector() {
  const lastHit = new Map();     // humano → último acerto de QUALQUER bot
  const lastByBot = new Map();   // humano|bot → último acerto DESTE bot (agachado)
  const since = (m, k, t) => t - (m.has(k) ? m.get(k) : -Infinity);
  return {
    /* `gap`: intervalo global do humano; `botGap` (> 0 só com o humano
       agachado): intervalo entre acertos do MESMO bot */
    claim(humanId, botId, t, gap, botGap = 0) {
      if (since(lastHit, humanId, t) < gap) return false;
      return !(botGap > 0) || since(lastByBot, humanId + '|' + botId, t) >= botGap;
    },
    hit(humanId, botId, t) { lastHit.set(humanId, t); lastByBot.set(humanId + '|' + botId, t); },
  };
}

/* Intervalo mínimo entre acertos de bot neste humano (global, qualquer bot):
   dobra se ele está de costas para o bot (rotY do humano, frente = -Z girado)
   e dobra se está agachado — as regras do cap. 33 se MULTIPLICAM. */
function hitGap(target, bot) {
  let gap = AI.HIT_GAP_S;
  if (Number.isFinite(target.rotY)) {
    const vx = bot.x - target.x, vz = bot.z - target.z, len = Math.hypot(vx, vz);
    if (len > 1e-6) {
      const cos = (-Math.sin(target.rotY) * vx - Math.cos(target.rotY) * vz) / len;
      if (cos < Math.cos(AI.BEHIND_DEG * DEG)) gap *= AI.HIT_GAP_BEHIND_MULT;
    }
  }
  return gap * crouchDelayMult(target);
}
function crouchDelayMult(target) { return 1 + (AI.HIT_GAP_CROUCH_MULT - 1) * crouchOf(target); }
/* Agachado, o MESMO bot também espera o dobro da cadência dele entre dois
   acertos: com um bot só, quem limita os acertos é a cadência (fuzil 1,1 s),
   não o intervalo global (1,0 s) — dobrar só o global não dobraria nada.
   Em pé não há trava por bot (0): o comportamento de antes, byte por byte. */
function botHitGap(target, bot, weapon) {
  if (!(crouchOf(target) > 0)) return 0;
  return (WEAPON_PROFILES[weapon || bot.weapon] || WEAPON_PROFILES.FUZIL).cooldown * crouchDelayMult(target);
}

/* Veredito de UM disparo contra a posição REAL do alvo agora. A ordem importa:
   janela de erro e luneta antes de tudo; o terreno e as paredes depois (bala
   não atravessa morro nem prédio); o cronômetro do token (humano só) antes da
   mira; e só o ACERTO consome o token. */
function decideShot(bot, target, action, ctx) {
  const { t, rng, terrain, walls = null, obstacles = null, vehicles = null, director, moved } = ctx;
  const weapon = action.weapon || bot.weapon;
  const profile = WEAPON_PROFILES[weapon] || WEAPON_PROFILES.FUZIL;
  const d = Math.hypot(target.x - bot.x, (target.y || 0) - (bot.y || 0), target.z - bot.z);
  const ranged = action.type === 'shoot';
  // alvo novo ou 3 s sem atirar: janela E luneta; re-exposição protegida
  // (`missRearm`): só a janela — a regra da luneta do CoD4 é por inimigo NOVO
  // (`lastMissedEnemy`); volta seguinte à protegida (`missDebounced`): o
  // silêncio foi o esconde, não conta como "3 s sem atirar" (B14)
  const silent = t - (bot.lastShotT ?? -Infinity) > AI.MISS_DEBOUNCE_S && !bot.missDebounced;
  const fresh = bot.missTargetId !== target.id || silent;
  if (ranged && (fresh || bot.missRearm)) {
    bot.missTargetId = target.id;
    bot.missUntil = t + AI.MISS_BASE_S + AI.MISS_PER_M_S * d;
    if (fresh) bot.scopedMisses = profile.scoped && d > AI.SCOPED_FIRST_MISS_M ? AI.SCOPED_FIRST_MISSES : 0;
    bot.missRearm = false;
  }
  bot.lastShotT = t;
  bot.missDebounced = false;
  if (ranged && bot.scopedMisses > 0) { bot.scopedMisses--; return { hit: false, why: 'luneta' }; }
  if (ranged && t < bot.missUntil) return { hit: false, why: 'janela' };
  const eye = { x: bot.x, y: (bot.y || 0) + AI.EYE_H, z: bot.z };
  // o tronco de quem está agachado fica mais baixo: a bala mira ali (e a
  // vítima, que testa cobertura a pé + 1 m, nunca recusa um tiro que passou
  // aqui — a reta até um ponto mais alto do mesmo lugar só sobe)
  const aimPt = { x: target.x, y: (target.y || 0) + bodyHeights(crouchOf(target)).aim, z: target.z };
  // veículo inteiro no caminho: a bala vai até a LATARIA dele, e o que vem
  // depois (terreno, parede, obstáculo) só conta se estiver ANTES dela
  const veh = eyeInsideVehicle(vehicles, eye) ? null : vehicleOnSegment(vehicles, eye, aimPt);
  const reach = veh ? { x: eye.x + veh.dir.x * veh.t, y: eye.y + veh.dir.y * veh.t, z: eye.z + veh.dir.z * veh.t } : aimPt;
  if (!lineOfSight(terrain, eye, reach)) return { hit: false, why: 'terreno' };
  // o bot atira sobre o que via 0,6 s atrás (reação): quem entrou atrás do
  // prédio nesse meio-tempo leva a bala na parede, não no corpo
  if (walls && (eyeInsideWall(walls, eye) || walls.segmentBlocked(eye, reach))) return { hit: false, why: 'parede' };
  // idem pedra, árvore, cacto e POI (a vítima recusaria o dano por eles)
  // (a reta que nasce dentro do cilindro já sai barrada: não precisa de guarda à parte)
  if (obstacles && obstacles.segmentoBloqueado(eye, reach)) return { hit: false, why: 'obstaculo' };
  // ...e quem se escondeu atrás do veículo leva a bala no veículo
  if (veh) return { hit: false, why: 'veiculo', vehicle: veh.alvo.id, at: [reach.x, reach.y, reach.z] };
  const human = !target.isBot;
  if (human && director && !director.claim(target.id, bot.id, t, hitGap(target, bot), botHitGap(target, bot, weapon))) {
    return { hit: false, why: 'token' };
  }
  const motion = targetMotion(bot.aware && bot.aware.get(target.id), target, t);
  const p = hitChance({
    distance: d, sigmaDeg: aimSigmaDeg(bot), aimScale: profile.aimScale,
    exposureS: bot.engageT == null ? 0 : t - bot.engageT,
    botMoving: !!moved, targetSpeed: motion.speed, targetTurned: motion.turned,
  });
  if (rng() >= p) return { hit: false, why: 'mira', p };
  // o acerto consome o token: dentro deste mesmo tick, outro bot já não passa
  if (human && director) director.hit(target.id, bot.id, t);
  return { hit: true, p };
}

function isPointInGas(x, z, zone) {
  if (!zone) return false;
  const distance = Math.hypot(x - zone.x, z - zone.z);
  return zone.inversa ? distance < zone.r : distance > zone.r;
}

function chooseWaypoint(zone, rng = Math.random, worldLimit = 490) {
  if (!zone) {
    return [(rng() * 2 - 1) * worldLimit, (rng() * 2 - 1) * worldLimit];
  }
  if (!zone.inversa) {
    const angle = rng() * Math.PI * 2;
    const radius = rng() * Math.max(10, zone.r * 0.75);
    return [zone.x + Math.cos(angle) * radius, zone.z + Math.sin(angle) * radius];
  }
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = (rng() * 2 - 1) * worldLimit;
    const z = (rng() * 2 - 1) * worldLimit;
    if (!isPointInGas(x, z, zone)) return [x, z];
  }
  const corners = [
    [-worldLimit, -worldLimit], [-worldLimit, worldLimit],
    [worldLimit, -worldLimit], [worldLimit, worldLimit],
  ];
  return corners.reduce((best, point) =>
    Math.hypot(point[0] - zone.x, point[1] - zone.z) > Math.hypot(best[0] - zone.x, best[1] - zone.z)
      ? point : best);
}

function movementYaw(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/* atirando, ou segurando a posição de quem sumiu: o corpo vira para o alvo
   (visto, ou onde foi visto); andando: para onde anda; parado: mantém
   (antes, parado virava atan2(-0, -0) = -π e o bot "estalava" para +Z) */
function combatFacingYaw(bot, target, action, moveDx, moveDz) {
  if (target && action && (action.type === 'shoot' || action.type === 'melee' || action.type === 'hold'))
    return movementYaw(target.x - bot.x, target.z - bot.z);
  if (Math.hypot(moveDx, moveDz) > 1e-4 || !Number.isFinite(bot.yaw)) return movementYaw(moveDx, moveDz);
  return bot.yaw;
}

function applyLoot(loadout, items) {
  let looseAmmo = 0;
  for (const item of items || []) {
    if (!item || typeof item !== 'object') continue;
    if (item.type === 'weapon' && Number.isInteger(item.weapon) && WEAPONS[item.weapon]) {
      loadout.weapon = WEAPONS[item.weapon];
      loadout.ammo = Math.max(0, Number(item.ammo) || 0);
    } else if (item.type === 'ammo') looseAmmo += Math.max(0, Number(item.amount) || 0);
  }
  if (loadout.weapon !== 'FACA') {
    loadout.ammo += looseAmmo;
    if (loadout.ammo <= 0) { loadout.weapon = 'FACA'; loadout.ammo = Infinity; }
  } else loadout.ammo = Infinity;
  return loadout;
}

/* alvo LEMBRADO (não visto na amostra de reação) não se ataca. Se o bot o via
   e o perdeu, segura a posição mirando a última posição conhecida por
   CHASE_AFTER_S (`hold`) e depois vai até ela (`chase`); se só o ouviu, vai
   na hora. Sem `t`, sem prazo: vai na hora. */
function chooseCombatAction(bot, target, t) {
  if (!target) return { type: 'patrol', distance: Infinity, weapon: bot.weapon || 'FACA' };
  const distance = Math.hypot(target.x - bot.x, target.z - bot.z);
  if (target.seen === false) {
    const lostFor = t - (bot.targetId === target.id ? (bot.targetSeenT ?? -Infinity) : -Infinity);
    const scoped = !!(WEAPON_PROFILES[bot.weapon] || {}).scoped;
    const patience = AI.CHASE_AFTER_S + (scoped ? AI.CHASE_SCOPED_EXTRA_S : 0);
    return { type: lostFor < patience ? 'hold' : 'chase', distance, weapon: bot.weapon || 'FACA' };
  }
  const hasRanged = bot.weapon && bot.weapon !== 'FACA' && bot.ammo > 0;
  if (hasRanged) {
    const range = (WEAPON_PROFILES[bot.weapon] || WEAPON_PROFILES.FUZIL).range;
    return { type: distance <= range ? 'shoot' : 'chase', distance, weapon: bot.weapon };
  }
  return { type: distance <= 2.8 ? 'melee' : 'chase', distance, weapon: 'FACA' };
}

/* cadência + atraso do 1º disparo depois de adquirir o alvo + atraso de
   reaquisição quando ele volta de trás da cobertura */
function canAttemptAttack(bot, target, action, t, jitter = 0) {
  if (!target || !action || (action.type !== 'melee' && action.type !== 'shoot')) return false;
  if (bot.engageT != null && t - bot.engageT < (bot.attackDelay || 0)) return false;
  if (bot.reacquireT != null && t - bot.reacquireT < (bot.reacquireDelay || 0)) return false;
  const profile = WEAPON_PROFILES[action.weapon || bot.weapon] || WEAPON_PROFILES.FACA;
  return t - bot.lastShot > profile.cooldown + jitter;
}

/* Erro que o jogador VÊ: a reta passa a 0,5–1,5 m do rosto do alvo, na altura
   dos olhos, e segue além. `playerFired` do br-game.js desenha até toPos + 1 m
   (mira o tronco), então o Y enviado já vem descontado desse 1 m. */
function buildMissShot(bot, target, rng = Math.random) {
  const from = [bot.x, (bot.y || 0) + AI.EYE_H, bot.z];
  const hx = target.x - from[0], hz = target.z - from[2];
  const hl = Math.hypot(hx, hz) || 1e-6;
  const ux = hx / hl, uz = hz / hl;
  const side = rng() < 0.5 ? -1 : 1;
  const off = AI.NEAR_MISS_MIN_M + rng() * (AI.NEAR_MISS_MAX_M - AI.NEAR_MISS_MIN_M);
  const lift = (rng() * 2 - 1) * AI.NEAR_MISS_LIFT_M;
  // gira a reta de θ = asin(off / hl): a distância do rosto à reta é `off`
  const sin = Math.min(0.95, off / hl), cos = Math.sqrt(1 - sin * sin);
  const dx = ux * cos - uz * side * sin, dz = uz * cos + ux * side * sin;
  const s = hl * cos; // ponto de maior aproximação do rosto, ao longo da reta
  const slope = ((target.y || 0) + AI.HEAD_H + lift - from[1]) / s;
  const maxLen = MISS_MAX_LEN[bot.weapon] || 319;
  let L = s + AI.NEAR_MISS_OVERSHOOT_M;
  const len3 = L * Math.sqrt(1 + slope * slope);
  if (len3 > maxLen) L *= maxLen / len3;
  return {
    weapon: bot.weapon,
    fromPos: from,
    toPos: [from[0] + dx * L, from[1] + slope * L - 1, from[2] + dz * L],
  };
}

async function createBotTerrain(worldSeed) {
  // Os módulos são carregados antes do seed no cliente também; só a construção
  // do SimplexNoise deve consumir a sequência determinística da partida.
  const terrainModule = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'terrain.js')).href);
  // a MESMA grade do cliente (game.js: buildHeightGrid(CFG.WORLD_SIZE,
  // CFG.TERRAIN_SEGS)) — a visada exata do bot depende de conhecer a malha
  const { CFG } = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'config.js')).href);
  const previousRandom = Math.random;
  Math.random = mulberry32(Number(worldSeed) >>> 0);
  let terrain;
  try {
    terrain = terrainModule.createTerrain({
      lerp: (a, b, t) => a + (b - a) * t,
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    });
    terrain.buildHeightGrid(CFG.WORLD_SIZE, CFG.TERRAIN_SEGS);
    terrain.losGrid = { half: CFG.WORLD_SIZE / 2, cell: CFG.WORLD_SIZE / CFG.TERRAIN_SEGS, segs: CFG.TERRAIN_SEGS };
  } finally {
    Math.random = previousRandom;
  }
  terrain.vulcao = await createBotVolcano(terrain.VOLCANO, terrain.heightAt);
  return terrain;
}

/* a rocha desenhada do vulcão: o MESMO GLB que o cliente desenha, lido do
   disco. Sem ele o bot veria através da rocha — falha BARULHENTA. */
async function createBotVolcano(VOLCANO, heightAt) {
  try {
    const Vul = await import(pathToFileURL(path.join(__dirname, '..', 'js', 'vulcao-solido.js')).href);
    const bytes = require('fs').readFileSync(path.join(__dirname, '..', Vul.VULCAO_GLB));
    const m = Vul.montarVulcao(bytes, VOLCANO);
    return { m, reta: (ox, oy, oz, dx, dy, dz, len) => Vul.retaNoVulcao(m, ox, oy, oz, dx, dy, dz, len),
      topo: (x, z) => Vul.topoDoVulcao(m, x, z),
      chao: (x, z) => Vul.chaoDoVulcao(m, x, z, heightAt, VOLCANO) };
  } catch (err) {
    console.error(`[bots] vulcão indisponível (${err && err.message}) — a visada ignora a rocha desenhada`);
    return null;
  }
}

/* cores distintas por bot (golden-angle no matiz) — determinístico por índice,
   NÃO usa o rand seedado do worldgen (invariante #1). O servidor valida o hex. */
function hsl2hex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}
function botColors(i) {
  const hue = (i * 137.508) % 360;
  return [hsl2hex(hue, 62, 55), hsl2hex((hue + 22) % 360, 34, 27), hsl2hex((hue + 200) % 360, 55, 46), '#ffe08a'];
}

function createBotChestSpots(worldSeed, terrain, worldSize = 1100) {
  if (!terrain || typeof terrain.heightAt !== 'function' || typeof terrain.slopeAt !== 'function') return [];
  const rng = mulberry32((Number(worldSeed) ^ 0xC0FFEE) >>> 0);
  const limit = worldSize / 2 - 70;
  const spots = [];
  let tries = 0;
  while (spots.length < 34 && tries < 400) {
    tries++;
    const x = (rng() * 2 - 1) * limit;
    const z = (rng() * 2 - 1) * limit;
    if (terrain.slopeAt(x, z) > 0.5) continue;
    const y = terrain.heightAt(x, z);
    if (y < terrain.WATER_LEVEL + 1.2) continue;
    rng(); // rotação consumida pelo cliente ao criar o mesmo baú
    spots.push({ key: `c${spots.length}`, x, y, z });
  }
  return spots;
}

function resetBotForMatch(bot) {
  bot.alive = true;
  bot.hp = 100;
  bot.phase = 'SHIP';
  bot.diedSent = false;
  bot.lootDropped = false;
  bot.weapon = 'FACA';
  bot.ammo = Infinity;
  bot.pendingDrop = null;
  bot.pendingChest = null;
  bot.lastShot = -Infinity;
  bot.wp = null;
  // o que o bot sabia da rodada anterior não vale nesta
  bot.yaw = 0;
  bot.aware = new Map();
  bot.targetId = null;
  bot.engageT = null;
  bot.attackDelay = 0;
  bot.targetSeenT = -Infinity;
  bot.targetHidden = false;
  bot.reacquireT = null;
  bot.reacquireDelay = 0;
  bot.missTargetId = null;
  bot.missUntil = -Infinity;
  bot.missRearm = false;
  bot.reexposures = 0;
  bot.missDebounced = false;
  bot.scopedMisses = 0;
  bot.lastShotT = -Infinity;
  bot.hurtT = -Infinity;
  return bot;
}

/* loot de morte idempotente: TODA morte solta loot (tiro, gás, cidade, AFK),
   mas só uma vez por vida — o servidor também limita com canDrop */
function dropLootOnce(bot, emit) {
  if (bot.lootDropped) return false;
  bot.lootDropped = true;
  const items = [{ type: 'ammo', amount: 60 }, { type: 'armor', amount: 50 }];
  const wi = WEAPONS.indexOf(bot.weapon);
  if (wi >= 0 && bot.weapon !== 'FACA') items.unshift({ type: 'weapon', weapon: wi, ammo: Math.max(0, bot.ammo) });
  emit('deathDrop', { pos: [bot.x, bot.y, bot.z], items });
  return true;
}

function observePlayerUpdate(observed, update) {
  if (!update || !update.id || !Array.isArray(update.pos) || update.pos.length < 3) return null;
  const pos = update.pos.slice(0, 3).map(Number);
  if (!pos.every(Number.isFinite)) return null;
  const previous = observed.get(update.id);
  const rotY = Number(update.rotY);
  const player = {
    ...(previous || {}),
    id: update.id,
    x: pos[0], y: pos[1], z: pos[2],
    // para onde ele olha: decide "atrás de quem atirou" (audição pela metade)
    // e "bot nas costas dele" (intervalo de acerto dobrado)
    rotY: Number.isFinite(rotY) ? rotY : (previous ? previous.rotY : undefined),
    // agachado (0..1): percepção, onde procurar o corpo e intervalo de acerto
    crouch: crouchOf(update),
    alive: previous ? previous.alive : true,
    spectator: previous ? previous.spectator : false,
    phase: update.ship ? 'SHIP' : (update.fall || update.chute) ? 'FALL' : 'PLAY',
    // no helicóptero (voando ou pousado): não é alvo de bot (isTargetable)
    heli: !!update.heli,
    isBot: !!update.bot,
  };
  observed.set(update.id, player);
  return player;
}

function shooterFacing(world, id) {
  const p = world.observedPlayers.get(id);
  if (p) return { rotY: p.rotY, x: p.x, y: p.y, z: p.z };
  const b = world.bots.find(o => o.id === id);
  return b ? { rotY: b.yaw, x: b.x, y: b.y, z: b.z } : null;
}

/* O tiro revela quem atirou (Quake III, Halo, TLOU). Recebido de `playerFired`
   — o servidor difunde tanto acerto (`shotHit`) quanto erro (`shotFired`).
   Quem ouve: raio HEAR_M, pela metade se o bot está fora da "tela" de quem
   atirou (Splinter Cell). Ouvir dá posição e abre o cone para 360° por
   ALERT_S; ATIRAR ainda exige ver (relevo E paredes, `clearSight`). O som
   atravessa parede e morro de propósito — nada aqui consulta visada: o tiro
   revela quem atirou mesmo atrás do prédio (referência de bots §3.5). */
function onPlayerFired(world, bot, d, t) {
  if (!bot || !bot.alive || bot.phase !== 'PLAY' || !d || !d.shooterId || d.shooterId === bot.id) return false;
  const f = Array.isArray(d.fromPos) ? d.fromPos.slice(0, 3).map(Number) : null;
  if (!f || f.length < 3 || !f.every(Number.isFinite)) return false;
  const dist = Math.hypot(f[0] - bot.x, f[2] - bot.z);
  let radius = AI.HEAR_M;
  const shooter = shooterFacing(world, d.shooterId);
  if (shooter && Number.isFinite(shooter.rotY) && dist > 1e-6) {
    const vx = bot.x - f[0], vz = bot.z - f[2];
    const cos = (-Math.sin(shooter.rotY) * vx - Math.cos(shooter.rotY) * vz) / dist;
    if (cos < Math.cos(AI.HEAR_VIEW_HALF_DEG * DEG)) radius *= AI.HEAR_OFFSCREEN_MULT;
  }
  if (dist > radius) return false;
  const a = awarenessOf(bot, d.shooterId);
  a.heardT = t;
  a.alertT = t;
  a.perceived = true;
  a.meter = 1;
  a.known = { x: f[0], y: f[1] - AI.EYE_H, z: f[2] };
  a.knownT = t;
  return true;
}

/* `youWereHit` no bot: tira vida, marca quem feriu (ameaça +1000) e abre o
   cone para ele. Em explosivo o fromPos é o ponto de impacto, então a posição
   conhecida vira a de quem atirou. */
function onBotHit(world, bot, d, t) {
  if (!bot.alive || bot.diedSent || !d) return;
  bot.hp -= d.dmg;
  bot.hurtT = t;
  if (d.shooterId && d.shooterId !== bot.id) {
    const a = awarenessOf(bot, d.shooterId);
    a.hurtT = t;
    a.alertT = t;
    a.perceived = true;
    a.meter = 1;
    const explosive = d.weapon === 'GRANADA' || d.weapon === 'BAZUCA';
    const f = Array.isArray(d.fromPos) ? d.fromPos.slice(0, 3).map(Number) : null;
    const shooter = shooterFacing(world, d.shooterId);
    if (!explosive && f && f.length === 3 && f.every(Number.isFinite)) a.known = { x: f[0], y: f[1] - AI.EYE_H, z: f[2] };
    else if (shooter) a.known = { x: shooter.x, y: shooter.y, z: shooter.z };
    a.knownT = t;
  }
  if (bot.hp <= 0) {
    bot.diedSent = true; bot.alive = false;
    dropLootOnce(bot, (ev, payload) => bot.s.emit(ev, payload));
    bot.s.emit('died', { killerId: d.shooterId, weapon: d.weapon, cause: { type: 'player' } });
    console.log(`[bot ${bot.i}] morreu`);
  }
}

function createBotState(i, s, rng = Math.random) {
  return {
    i, s, id: null, alive: false, hp: 100, phase: 'LOBBY',
    x: 0, y: 0, z: 0, wp: null, lastShot: 0, diedSent: false,
    weapon: 'FACA', ammo: Infinity, pendingDrop: null, pendingChest: null,
    jumpAt: 0, mira: 0.4 + rng() * 0.5, // "pontaria" varia por bot (vira erro angular: aimSigmaDeg)
    yaw: 0, aware: new Map(), targetId: null, engageT: null,
  };
}

/* Estado do processo inteiro de bots: todos moram num processo só, então o
   que é "global" (jogadores observados, drops, baús, terreno, paredes e o
   estado da cidade, o diretor dos tokens de acerto) é um objeto. */
function createBotWorld() {
  return {
    plan: null, t0: 0, bots: [],
    observedPlayers: new Map(), drops: new Map(), chests: new Map(),
    terrain: null, solids: null, obstacles: null, cityDestroyed: false, director: createHitDirector(), lastT: null,
    vehicles: null, vehicleById: null,
  };
}

/* Terreno, paredes e obstáculos da semente, JUNTOS. Se qualquer um falhar,
   nenhum vale: terreno sem paredes (ou sem obstáculos) daria bot que vê
   através da cidade (ou da pedra) em silêncio — o defeito que B7 fecha. Sem
   os três o bot fica cego (B12c) e a falha sobe. */
async function createBotWorldGeometry(worldSeed) {
  const terrain = await createBotTerrain(worldSeed);
  const solids = await createBotSolids(worldSeed, terrain);
  const obstacles = await createBotObstacles(worldSeed, terrain);
  await loadVehicleRules(); // a frota vem do servidor; a regra, daqui
  return { terrain, solids, obstacles };
}

/* Candidatos a alvo neste tick: os bots do processo (posição de agora) e os
   humanos observados pelo `playerUpdate`. */
function buildCandidates(world) {
  const botIds = new Set(world.bots.map(o => o.id));
  const candidates = world.bots.map(o => ({ ...o, isBot: true, spectator: false, rotY: o.yaw }));
  for (const player of world.observedPlayers.values()) {
    if (!botIds.has(player.id)) candidates.push(player);
  }
  return candidates;
}

function tickPlayingBot(world, b, zone, t, dt, rng) {
  const { drops, chests, terrain } = world;
  const walls = activeWalls(world);
  const obstacles = world.obstacles || null;
  const vehicles = world.vehicles || null;
  const candidates = buildCandidates(world);
  perceive(b, candidates, terrain, t, dt, walls, obstacles, vehicles);
  const target = selectTarget(b, knownTargets(b, candidates, t), AI.VIEW_RANGE, {
    t, engaged: countAttackers(world.bots, b),
  });
  updateEngagement(b, target, t, rng);
  const action = chooseCombatAction(b, target, t);
  if (action.weapon === 'FACA' && b.weapon !== 'FACA' && b.ammo <= 0) {
    b.weapon = 'FACA';
    b.ammo = Infinity;
  }
  let nearestLoot = null, nearestLootD = Infinity;
  if (b.weapon === 'FACA' || b.ammo < 12) for (const drop of drops.values()) {
    const dd = Math.hypot(drop.pos[0] - b.x, drop.pos[2] - b.z);
    if (dd < nearestLootD) { nearestLoot = { type: 'drop', value: drop }; nearestLootD = dd; }
  }
  if (b.weapon === 'FACA' || b.ammo < 12) for (const chest of chests.values()) {
    const dd = Math.hypot(chest.x - b.x, chest.z - b.z);
    if (dd < nearestLootD) { nearestLoot = { type: 'chest', value: chest }; nearestLootD = dd; }
  }
  if (nearestLoot && nearestLootD < 180) {
    const loot = nearestLoot.value;
    const lx = nearestLoot.type === 'drop' ? loot.pos[0] : loot.x;
    const lz = nearestLoot.type === 'drop' ? loot.pos[2] : loot.z;
    b.wp = [lx, lz];
    if (nearestLootD < 2.2 && nearestLoot.type === 'drop' && !b.pendingDrop) {
      b.pendingDrop = loot.id;
      b.y = Number(loot.pos[1]) || b.y;
      b.s.timeout(2000).emit('takeDrop', { id: loot.id }, (err, res) => {
        if (!err && res && res.ok) applyLoot(b, res.items);
        if (!err && res && res.ok) drops.delete(loot.id);
        b.pendingDrop = null;
      });
    } else if (nearestLootD < 2.2 && nearestLoot.type === 'chest' && !b.pendingChest) {
      b.pendingChest = loot.key;
      b.s.timeout(2000).emit('openChest', { key: loot.key }, (err, res) => {
        if (!err && res && res.ok) applyLoot(b, res.items);
        if (!err && res && (res.ok || res.opened)) chests.delete(loot.key);
        b.pendingChest = null;
      });
    }
  } else if (action.type === 'chase') {
    b.wp = [target.x, target.z];
  } else if (action.type === 'hold') {
    b.wp = [b.x, b.z];
  } else if (action.type === 'shoot' || action.type === 'melee') {
    // corpo a corpo também para: antes a faca caía no ramo da patrulha e o
    // bot saía andando para um waypoint aleatório no meio da facada
    b.wp = action.distance > 28 ? [target.x, target.z] : [b.x, b.z];
  } else if (!b.wp || Math.hypot(b.x - b.wp[0], b.z - b.wp[1]) < 3 || isPointInGas(b.wp[0], b.wp[1], zone)) {
    b.wp = chooseWaypoint(zone, rng);
  }
  const dx = b.wp[0] - b.x, dz = b.wp[1] - b.z, d = Math.hypot(dx, dz);
  let moved = false;
  if (d > 1e-4) {
    const step = Math.min(0.45, d);
    b.x += (dx / d) * step; b.z += (dz / d) * step;
    moved = step > 0.01;
  }
  if (terrain) b.y = chaoDoBot(terrain, b.x, b.z);
  b.yaw = combatFacingYaw(b, target, action, dx, dz);
  b.s.volatile.emit('state', {
    pos: [b.x, b.y, b.z], rotY: b.yaw, heldWeapon: b.weapon, car: -1,
  });
  const profile = WEAPON_PROFILES[action.weapon] || WEAPON_PROFILES.FACA;
  const fromPos = [b.x, b.y + AI.EYE_H, b.z];
  // de dentro da parede (ou da pedra) o bot segura o fogo: o cliente corta o
  // traçante no primeiro obstáculo MENOS a caixa onde ele nasce — o tiro
  // sairia do prédio (acontece na cauda da reação: ele via o alvo de fora e
  // entrou andando)
  const boca = { x: fromPos[0], y: fromPos[1], z: fromPos[2] };
  if (canAttemptAttack(b, target, action, t, rng() * 0.45)
    && !eyeInsideWall(walls, boca) && !eyeInsideObstacle(obstacles, boca) && !eyeInsideVehicle(vehicles, boca)) {
    b.lastShot = t;
    const bursts = action.type === 'melee' ? 1 : Math.min(profile.bursts, b.ammo);
    // o bot decidiu sobre o que via 0,6 s atrás; a bala vai contra onde o
    // alvo ESTÁ agora (e contra o terreno de agora)
    const real = candidates.find(c => c.id === target.id) || target;
    const verdict = decideShot(b, real, action, { t, rng, terrain, walls, obstacles, vehicles, director: world.director, moved });
    if (verdict.hit) for (let k = 0; k < bursts; k++) b.s.emit('shotHit', {
      targetId: real.id, dmg: profile.dmg,
      weapon: action.weapon,
      fromPos,
    });
    else if (verdict.why === 'veiculo' && action.type === 'shoot') {
      // a rajada para no veículo: cada bala desconta dele (o servidor valida),
      // e o traçante que os outros veem termina na lataria
      for (let k = 0; k < bursts; k++) b.s.emit('vehicleHit', { v: verdict.vehicle, dmg: profile.dmg, weapon: action.weapon, fromPos });
      b.s.emit('shotFired', { weapon: action.weapon, fromPos, toPos: [verdict.at[0], verdict.at[1] - 1, verdict.at[2]] });
    } else b.s.emit('shotFired', buildMissShot(b, real, rng));
    if (action.type === 'shoot') {
      b.ammo -= bursts;
      if (b.ammo <= 0) { b.weapon = 'FACA'; b.ammo = Infinity; }
    }
  }
}

/* UM passo de decisão de todos os bots (o laço de 10 Hz chama isto). Tudo que
   o bot faz sai pelos métodos do socket de cada bot (`s.emit`,
   `s.volatile.emit`, `s.timeout().emit`), e o acaso vem do `rng` injetado —
   é o que deixa o teste medir o laço de verdade. */
function tickBots(world, t, rng = Math.random) {
  const { plan, bots, terrain } = world;
  const dt = world.lastT == null ? AI.THINK_DT : clamp(t - world.lastT, 0, 0.5);
  world.lastT = t;
  const zone = plan ? zoneAt(Math.max(t, 0), plan) : null;
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.phase === 'SHIP') {
      if (!plan) continue;
      // protocolo novo: posição LOCAL no slot atribuído pelo servidor —
      // ele valida e reconstrói a posição mundial pela rota autoritativa
      const slotIdx = plan.shipSlots && Number.isInteger(plan.shipSlots[b.id]) ? plan.shipSlots[b.id] : b.i;
      const sl = ShipProto.slotLocal(slotIdx);
      const local = [sl[0], ShipProto.DIMS.floorY, sl[1]];
      const w = ShipProto.localToWorld(ShipProto.poseAt(plan.ship, t), local);
      [b.x, b.y, b.z] = w;
      if (t >= b.jumpAt) b.phase = 'FALL';
      b.s.volatile.emit('state', { pos: [b.x, b.y, b.z], rotY: 0, ship: true, shipLocal: local, heldWeapon: 'FACA', car: -1 });
    } else if (b.phase === 'FALL') {
      const groundY = terrain ? chaoDoBot(terrain, b.x, b.z) : 4;
      b.y = Math.max(groundY, b.y - 4.2);
      if (b.y <= groundY + 0.01) b.phase = 'PLAY';
      b.s.volatile.emit('state', { pos: [b.x, b.y, b.z], rotY: 0, fall: true, chute: true, heldWeapon: 'FACA', car: -1 });
    } else {
      tickPlayingBot(world, b, zone, t, dt, rng);
    }
  }
}

/* Conecta N bots em URL. Devolve `{ world, stop }` — o teste de integração
   olha o mundo que o processo real montou (terreno, paredes, cidade) e
   desliga tudo no fim; `watchdog: false` só para esse teste, que roda os bots
   dentro do próprio processo (o watchdog encerraria o processo inteiro). */
function startBots(N, URL, { watchdog = true } = {}) {
  const world = createBotWorld();
  const { bots, observedPlayers, drops, chests } = world;
  const nowT = () => (Date.now() - world.t0) / 1000;
  const timers = [];
  let terrainPromise = null, loadedWorldSeed = null;

  function rebuildWorld(worldSeed, openedChests = []) {
    const numericSeed = Number(worldSeed) >>> 0;
    if (terrainPromise && loadedWorldSeed === numericSeed) return terrainPromise;
    loadedWorldSeed = numericSeed;
    // mapa novo: terreno e paredes do anterior não valem (visada e altura
    // erradas). Até o novo carregar, sem terreno = sem visada (B12c)
    world.terrain = null;
    world.solids = null;
    world.obstacles = null;
    terrainPromise = createBotWorldGeometry(numericSeed)
      .then(({ terrain: t, solids, obstacles }) => {
        if (loadedWorldSeed !== numericSeed) return null; // chegou o mapa seguinte no meio
        world.terrain = t;
        world.solids = solids;
        world.obstacles = obstacles;
        const opened = new Set(openedChests);
        chests.clear();
        for (const chest of createBotChestSpots(numericSeed, t)) {
          if (!opened.has(chest.key)) chests.set(chest.key, chest);
        }
        return t;
      })
      .catch(err => {
        // stderr herdado pelo server.js (B12a): a falha chega no log dele
        console.error(`[bots] terreno/paredes/obstáculos indisponíveis: ${err.message} — sem eles os bots NÃO enxergam ninguém (sem linha de visada) e não atiram`);
        return null;
      });
    return terrainPromise;
  }

  for (let i = 0; i < N; i++) {
    const s = io(URL, { transports: ['websocket'] });
    const b = createBotState(i, s);
    s.on('init', d => {
      b.id = d.id;
      applyCityState(world, d.cityDestruction);
      // entrou com a partida rodando: a frota como está agora (vida/estado/pose)
      if (Array.isArray(d.veiculos) && d.veiculos.length) applyVehicleFleet(world, d.veiculos);
      rebuildWorld(d.worldSeed, d.openedChests || []);
      for (const drop of d.drops || []) {
        if (drop && drop.id && Array.isArray(drop.pos)) drops.set(drop.id, { id: drop.id, pos: drop.pos.slice(0, 3) });
      }
      s.emit('hello', { nick: NICKS[i % NICKS.length] + (i >= NICKS.length ? i : ''), bot: true, colors: botColors(i) });
    });
    s.on('matchStart', d => {
      world.plan = d.plan; world.t0 = d.t0;
      world.director = createHitDirector();
      world.lastT = null;
      applyCityState(world, d.plan && d.plan.city); // partida nova: cidade de pé
      applyVehicleFleet(world, d.plan && d.plan.veiculos); // e a frota inteira nas vagas
      resetBotForMatch(b);
      b.jumpAt = d.plan.ship.flyTime * (0.25 + 0.65 * Math.random());
      console.log(`[bot ${i}] partida começou — pulando aos ${b.jumpAt.toFixed(0)}s`);
    });
    s.on('playerUpdate', d => { observePlayerUpdate(observedPlayers, d); observeVehicleFromUpdate(world, d); });
    // vida do veículo em zero: para de barrar na hora; explodiu: sai do mundo
    s.on('vehicleBurning', d => vehicleOut(world, d));
    s.on('vehicleExploded', d => vehicleOut(world, d));
    s.on('roster', d => {
      for (const p of (d && d.players) || []) {
        const observed = observedPlayers.get(p.id);
        if (observed) { observed.alive = !!p.alive; observed.spectator = !!p.spectator; }
      }
    });
    // cada socket de bot recebe a difusão: cada bot ouve pelo seu
    s.on('playerFired', d => onPlayerFired(world, b, d, nowT()));
    s.on('youWereHit', d => onBotHit(world, b, d, nowT()));
    s.on('playerKilled', d => {
      const observed = observedPlayers.get(d.victimId);
      if (observed) observed.alive = false;
      if (d.victimId === b.id) {
        // morte decidida pelo servidor (gás/cidade/AFK) também solta o loot;
        // se a morte veio do próprio youWereHit, o flag já bloqueia o repique
        if (b.alive && !b.diedSent) dropLootOnce(b, (ev, payload) => s.emit(ev, payload));
        b.alive = false; b.diedSent = true;
      }
    });
    s.on('playerLeft', d => observedPlayers.delete(d.id));
    s.on('dropSpawn', d => {
      if (d && d.id && Array.isArray(d.pos)) drops.set(d.id, { id: d.id, pos: d.pos.slice(0, 3) });
    });
    s.on('dropTaken', d => { if (d && d.id) drops.delete(d.id); });
    s.on('chestOpened', d => { if (d && d.key) chests.delete(d.key); });
    // os mísseis derrubaram a cidade: as paredes urbanas saem e os escombros
    // entram NO MESMO instante em que o cliente troca as dele (impacto)
    s.on('cityDestruction', d => applyCityState(world, d));
    s.on('nextMatch', d => {
      b.phase = 'LOBBY'; b.alive = false; observedPlayers.clear(); drops.clear(); chests.clear();
      applyCityState(world, null);
      applyVehicleFleet(world, null); // mapa novo: a frota vem no próximo matchStart
      if (d && Number.isInteger(d.worldSeed)) rebuildWorld(d.worldSeed);
    });
    bots.push(b);
  }

  timers.push(setInterval(() => {
    if (!world.plan) return;
    tickBots(world, nowT());
  }, 100));

  /* watchdog: servidor caiu → bots saem sozinhos (sem processos órfãos) */
  if (watchdog) timers.push(setTimeout(() => {
    timers.push(setInterval(() => {
      if (bots.every(x => x.s.disconnected)) {
        console.log('[bots] servidor fora do ar — encerrando');
        process.exit(0);
      }
    }, 4000));
  }, 12000));

  console.log(`${N} bots conectando em ${URL} — inicie a partida pelo lobby (você é o anfitrião).`);
  console.log('Obs.: bots atiram entre si; quem atirar NELES tira vida deles de verdade.');
  return {
    world,
    stop() {
      for (const h of timers) { clearInterval(h); clearTimeout(h); }
      for (const b of bots) b.s.close();
    },
  };
}

if (require.main === module) {
  const n = Math.max(1, parseInt(process.argv[2], 10) || 8);
  const url = process.argv[3] || 'http://localhost:3000';
  startBots(n, url);
}

module.exports = {
  AI, WEAPON_PROFILES,
  startBots, createBotWorld, createBotState, buildCandidates, tickBots, selectTarget, isPointInGas, chooseWaypoint,
  movementYaw, combatFacingYaw, observePlayerUpdate, applyLoot, chooseCombatAction,
  createBotTerrain, createBotChestSpots, resetBotForMatch, canAttemptAttack, buildMissShot, dropLootOnce,
  perceive, knownTargets, lineOfSight, chaoDoBot, inViewCone, hitChance, createHitDirector, decideShot,
  onPlayerFired, onBotHit,
  createBotSolids, createBotObstacles, createBotWorldGeometry, applyCityState, activeWalls, clearSight,
  loadVehicleRules, applyVehicleFleet, observeVehicleFromUpdate, vehicleOut, vehicleOnSegment, eyeInsideVehicle,
};
