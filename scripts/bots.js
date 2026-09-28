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

function isTargetable(self, c) {
  return !!c && c.id !== self.id && !!c.alive && !c.spectator && c.phase === 'PLAY'
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

/* Linha de visada contra o HEIGHTMAP (o bot não tem paredes: B7/P3); bloqueia
   se o chão passa acima da reta olho → ponto em qualquer lugar dela.

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

/* Um passo de percepção de UM bot: atualiza o medidor, a memória e a fila de
   reação de cada candidato. Quem não está mais na lista (morreu, saiu, nave)
   é esquecido. */
function perceive(bot, candidates, terrain, t, dt) {
  if (!bot.aware) bot.aware = new Map();
  const present = new Set();
  const inCombat = t - Math.max(bot.lastShotT ?? -Infinity, bot.hurtT ?? -Infinity) <= AI.COMBAT_WINDOW_S;
  const eye = { x: bot.x, y: (bot.y || 0) + AI.EYE_H, z: bot.z };
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
    if (d <= AI.VIEW_RANGE && (alerted || inViewCone(bot.yaw, dx, dz, d))) {
      const cy = c.y || 0, h = bodyHeights(crouch);
      visible = lineOfSight(terrain, eye, { x: c.x, y: cy + h.head, z: c.z })
        || lineOfSight(terrain, eye, { x: c.x, y: cy + h.aim, z: c.z });
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
   reaquisição (`reacquireT` + `reacquireDelay`) e rearma a janela de erro
   (`missRearm`); o foco da mira continua o do engajamento. Tudo isso em cima
   da fila de reação: `target.seen` já é o que o bot via REACTION_S atrás. */
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
  } else if (bot.targetHidden) {
    bot.reacquireT = t;
    bot.reacquireDelay = AI.REACQUIRE_DELAY_MIN_S + rng() * (AI.REACQUIRE_DELAY_MAX_S - AI.REACQUIRE_DELAY_MIN_S);
    bot.missRearm = true;
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
   janela de erro e luneta antes de tudo; o terreno depois (bala não atravessa
   morro); o cronômetro do token (humano só) antes da mira; e só o ACERTO
   consome o token. */
function decideShot(bot, target, action, ctx) {
  const { t, rng, terrain, director, moved } = ctx;
  const weapon = action.weapon || bot.weapon;
  const profile = WEAPON_PROFILES[weapon] || WEAPON_PROFILES.FUZIL;
  const d = Math.hypot(target.x - bot.x, (target.y || 0) - (bot.y || 0), target.z - bot.z);
  const ranged = action.type === 'shoot';
  // alvo novo ou 3 s sem atirar: janela E luneta; re-exposição (`missRearm`):
  // só a janela — a regra da luneta do CoD4 é por inimigo NOVO (`lastMissedEnemy`)
  const fresh = bot.missTargetId !== target.id || t - (bot.lastShotT ?? -Infinity) > AI.MISS_DEBOUNCE_S;
  if (ranged && (fresh || bot.missRearm)) {
    bot.missTargetId = target.id;
    bot.missUntil = t + AI.MISS_BASE_S + AI.MISS_PER_M_S * d;
    if (fresh) bot.scopedMisses = profile.scoped && d > AI.SCOPED_FIRST_MISS_M ? AI.SCOPED_FIRST_MISSES : 0;
    bot.missRearm = false;
  }
  bot.lastShotT = t;
  if (ranged && bot.scopedMisses > 0) { bot.scopedMisses--; return { hit: false, why: 'luneta' }; }
  if (ranged && t < bot.missUntil) return { hit: false, why: 'janela' };
  const eye = { x: bot.x, y: (bot.y || 0) + AI.EYE_H, z: bot.z };
  // o tronco de quem está agachado fica mais baixo: a bala mira ali (e a
  // vítima, que testa cobertura a pé + 1 m, nunca recusa um tiro que passou
  // aqui — a reta até um ponto mais alto do mesmo lugar só sobe)
  if (!lineOfSight(terrain, eye, { x: target.x, y: (target.y || 0) + bodyHeights(crouchOf(target)).aim, z: target.z })) {
    return { hit: false, why: 'terreno' };
  }
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
  try {
    const terrain = terrainModule.createTerrain({
      lerp: (a, b, t) => a + (b - a) * t,
      clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
    });
    terrain.buildHeightGrid(CFG.WORLD_SIZE, CFG.TERRAIN_SEGS);
    terrain.losGrid = { half: CFG.WORLD_SIZE / 2, cell: CFG.WORLD_SIZE / CFG.TERRAIN_SEGS, segs: CFG.TERRAIN_SEGS };
    return terrain;
  } finally {
    Math.random = previousRandom;
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
   ALERT_S; ATIRAR ainda exige ver (linha de visada no terreno). */
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
   que é "global" (jogadores observados, drops, baús, terreno, o diretor dos
   tokens de acerto) é um objeto. */
function createBotWorld() {
  return {
    plan: null, t0: 0, bots: [],
    observedPlayers: new Map(), drops: new Map(), chests: new Map(),
    terrain: null, director: createHitDirector(), lastT: null,
  };
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
  const candidates = buildCandidates(world);
  perceive(b, candidates, terrain, t, dt);
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
  if (terrain) b.y = terrain.heightAt(b.x, b.z);
  b.yaw = combatFacingYaw(b, target, action, dx, dz);
  b.s.volatile.emit('state', {
    pos: [b.x, b.y, b.z], rotY: b.yaw, heldWeapon: b.weapon, car: -1,
  });
  const profile = WEAPON_PROFILES[action.weapon] || WEAPON_PROFILES.FACA;
  if (canAttemptAttack(b, target, action, t, rng() * 0.45)) {
    b.lastShot = t;
    const bursts = action.type === 'melee' ? 1 : Math.min(profile.bursts, b.ammo);
    const fromPos = [b.x, b.y + AI.EYE_H, b.z];
    // o bot decidiu sobre o que via 0,6 s atrás; a bala vai contra onde o
    // alvo ESTÁ agora (e contra o terreno de agora)
    const real = candidates.find(c => c.id === target.id) || target;
    const verdict = decideShot(b, real, action, { t, rng, terrain, director: world.director, moved });
    if (verdict.hit) for (let k = 0; k < bursts; k++) b.s.emit('shotHit', {
      targetId: real.id, dmg: profile.dmg,
      weapon: action.weapon,
      fromPos,
    });
    else b.s.emit('shotFired', buildMissShot(b, real, rng));
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
      const groundY = terrain ? terrain.heightAt(b.x, b.z) : 4;
      b.y = Math.max(groundY, b.y - 4.2);
      if (b.y <= groundY + 0.01) b.phase = 'PLAY';
      b.s.volatile.emit('state', { pos: [b.x, b.y, b.z], rotY: 0, fall: true, chute: true, heldWeapon: 'FACA', car: -1 });
    } else {
      tickPlayingBot(world, b, zone, t, dt, rng);
    }
  }
}

function startBots(N, URL) {
  const world = createBotWorld();
  const { bots, observedPlayers, drops, chests } = world;
  const nowT = () => (Date.now() - world.t0) / 1000;
  let terrainPromise = null, loadedWorldSeed = null;

  function rebuildWorld(worldSeed, openedChests = []) {
    const numericSeed = Number(worldSeed) >>> 0;
    if (terrainPromise && loadedWorldSeed === numericSeed) return terrainPromise;
    loadedWorldSeed = numericSeed;
    // mapa novo: o terreno do anterior não vale (visada e altura erradas).
    // Até o novo carregar, sem terreno = sem visada (lineOfSight, B12c)
    world.terrain = null;
    terrainPromise = createBotTerrain(numericSeed)
      .then(t => {
        world.terrain = t;
        const opened = new Set(openedChests);
        chests.clear();
        for (const chest of createBotChestSpots(numericSeed, t)) {
          if (!opened.has(chest.key)) chests.set(chest.key, chest);
        }
        return t;
      })
      .catch(err => {
        // stderr herdado pelo server.js (B12a): a falha chega no log dele
        console.error(`[bots] terreno indisponível: ${err.message} — sem terreno os bots NÃO enxergam ninguém (sem linha de visada) e não atiram`);
        return null;
      });
    return terrainPromise;
  }

  for (let i = 0; i < N; i++) {
    const s = io(URL, { transports: ['websocket'] });
    const b = createBotState(i, s);
    s.on('init', d => {
      b.id = d.id;
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
      resetBotForMatch(b);
      b.jumpAt = d.plan.ship.flyTime * (0.25 + 0.65 * Math.random());
      console.log(`[bot ${i}] partida começou — pulando aos ${b.jumpAt.toFixed(0)}s`);
    });
    s.on('playerUpdate', d => observePlayerUpdate(observedPlayers, d));
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
    s.on('nextMatch', d => {
      b.phase = 'LOBBY'; b.alive = false; observedPlayers.clear(); drops.clear(); chests.clear();
      if (d && Number.isInteger(d.worldSeed)) rebuildWorld(d.worldSeed);
    });
    bots.push(b);
  }

  setInterval(() => {
    if (!world.plan) return;
    tickBots(world, nowT());
  }, 100);

  /* watchdog: servidor caiu → bots saem sozinhos (sem processos órfãos) */
  setTimeout(() => {
    setInterval(() => {
      if (bots.every(x => x.s.disconnected)) {
        console.log('[bots] servidor fora do ar — encerrando');
        process.exit(0);
      }
    }, 4000);
  }, 12000);

  console.log(`${N} bots conectando em ${URL} — inicie a partida pelo lobby (você é o anfitrião).`);
  console.log('Obs.: bots atiram entre si; quem atirar NELES tira vida deles de verdade.');
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
  perceive, knownTargets, lineOfSight, inViewCone, hitChance, createHitDirector, decideShot,
  onPlayerFired, onBotHit,
};
