/* ================================================================
   GAME FEEL DE COMBATE — núcleo PURO (sem DOM, sem THREE, sem rede).
   Roda igual no navegador e no `node --test`.

   Por que existe: a sensação de combate é feita de decisões pequenas e
   repetidas (mostro hitmarker? de que sabor? quanto treme? o escudo
   quebrou agora?). Cada uma dessas decisões vira função pura aqui e
   ganha teste — o resto do jogo só desenha o resultado.

   ---------------------------------------------------------------
   PORTÃO DE PREDIÇÃO (createHitGate)
   ---------------------------------------------------------------
   O cliente é quem reporta acerto (`shotHit`) e o servidor VALIDA. Até
   aqui o cliente mostrava hitmarker + número de dano ANTES de saber se o
   servidor aceitaria: acerto recusado por alcance, imunidade ou orçamento
   virava mentira na tela e o jogador aprendia a não confiar no feedback.

   A correção é aplicar as MESMAS regras localmente, antes de desenhar.
   Zero byte a mais na rede — e, de quebra, o cliente para de enviar
   mensagens que seriam descartadas.

   Uma diferença deliberada em relação ao server.js: lá a janela de
   anti-flood é incrementada ANTES da checagem de orçamento; aqui as duas
   janelas só são gravadas quando o acerto passa por TUDO. Isso é
   equivalente e mantém os contadores sincronizados, porque o cliente
   passa a enviar exclusivamente o que ele próprio aprovou — o servidor
   nunca vê uma mensagem que este portão recusou.
   ================================================================ */

/* --- espelho de server.js (shotHit / explosionHit) --- */
export const SHOT_RANGE = { FACA: 4, ESCOPETA: 120 };
export const SHOT_RANGE_DEFAULT = 320;
export const SHOT_DMG_CAP = 95;
export const BLAST_DMG_CAP = 130;
export const DMG_BUDGET_PER_S = 520;
export const HITS_PER_S = 12;
export const BLAST_REACH = { BAZUCA: 340, GRANADA: 80 };
export const BLAST_VICTIM_RADIUS = 12;
export const WINDOW_MS = 1000;

/* prefixos aceitos pelo servidor: renomear arma fora desta lista faz o
   shotHit ser descartado em silêncio (server.js valida por prefixo) */
const WEAPON_CODES = ['FUZIL', 'ESCOPETA', 'DMR', 'BAZUCA', 'PLASMA', 'FACA', 'SNIPER'];

export function isWeaponCode(w) { return WEAPON_CODES.indexOf(w) >= 0; }

export function shotRange(weapon) {
  const r = SHOT_RANGE[weapon];
  return r === undefined ? SHOT_RANGE_DEFAULT : r;
}

function clampDmg(d, cap) {
  const n = +d;
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), cap);
}

const NO = (reason) => ({ ok: false, dmg: 0, reason });

export function createHitGate() {
  /* janelas deslizantes de 1 s — compartilhadas por tiro e explosão,
     porque no servidor é o MESMO par de janelas por atirador */
  const hitAt = [];          // timestamps
  const dmgAt = [];          // { t, d }

  function prune(now) {
    while (hitAt.length && now - hitAt[0] >= WINDOW_MS) hitAt.shift();
    while (dmgAt.length && now - dmgAt[0].t >= WINDOW_MS) dmgAt.shift();
  }
  function budgetUsed() {
    let s = 0;
    for (let i = 0; i < dmgAt.length; i++) s += dmgAt[i].d;
    return s;
  }
  /* checagens comuns às duas rotas, na ordem do servidor */
  function commonBlock(p) {
    if (!p.playing) return 'phase';
    if (!p.shooterAlive) return 'shooter-dead';
    if (!p.victimAlive) return 'victim-dead';
    return null;
  }
  function meter(now, dmg) {
    prune(now);
    if (dmg <= 0) return NO('dmg');
    if (hitAt.length >= HITS_PER_S) return NO('flood');
    if (budgetUsed() + dmg > DMG_BUDGET_PER_S) return NO('budget');
    hitAt.push(now);
    dmgAt.push({ t: now, d: dmg });
    return { ok: true, dmg, reason: null };
  }

  return {
    admitShot(now, p) {
      const blocked = commonBlock(p);
      if (blocked) return NO(blocked);
      if (!isWeaponCode(p.weapon)) return NO('weapon');
      if (p.shooterImmune || p.victimImmune) return NO('immune');
      if (!(p.dist <= shotRange(p.weapon))) return NO('range');
      return meter(now, clampDmg(p.dmg, SHOT_DMG_CAP));
    },
    admitBlast(now, p) {
      const blocked = commonBlock(p);
      if (blocked) return NO(blocked);
      if (p.kind !== 'GRANADA' && p.kind !== 'BAZUCA') return NO('kind');
      if (p.shooterImmune || p.victimImmune) return NO('immune');
      if (!(p.distShooterToImpact <= BLAST_REACH[p.kind])) return NO('reach');
      if (!(p.distImpactToVictim <= BLAST_VICTIM_RADIUS)) return NO('radius');
      return meter(now, clampDmg(p.dmg, BLAST_DMG_CAP));
    },
    /* QA/depuração: o que a janela enxerga agora */
    stats(now) {
      prune(now);
      return { hits: hitAt.length, dmg: budgetUsed() };
    },
  };
}

/* ================================================================
   SABOR DO HITMARKER — "acertei? na cabeça? matei?"
   ================================================================ */
export function hitmarkerFlavor(o) {
  if (o && o.kill) return 'kill';
  if (o && o.head) return 'head';
  return 'hit';
}
const HITMARKER_MS = { hit: 110, head: 170, kill: 260 };
export function hitmarkerDuration(flavor) { return HITMARKER_MS[flavor] || HITMARKER_MS.hit; }

/* ================================================================
   TRAUMA POR ARMA — o screenshake tem de dizer "esta arma é pesada",
   não enjoar. Duas forças:
     heft  — peso do tiro (coice + chumbo grosso);
     teto  — fogo sustentado não pode passar de SUSTAIN_CEIL de trauma
             acumulado, porque o decaimento é linear e uma automática
             rápida PINAVA o shake no talo com a fórmula antiga
             (0.08 + kick*1.1 dava ~0.95 permanente no fuzil).
   ================================================================ */
export const TRAUMA_DECAY = 1.7;   // por segundo (game.js applyFpsCamera)
export const SUSTAIN_CEIL = 0.34;  // trauma máximo em fogo contínuo
export const TRAUMA_MIN = 0.03;
export const TRAUMA_MAX = 0.6;

export function shotTrauma(gun) {
  const g = gun || {};
  if (Number.isFinite(g.trauma)) return g.trauma;
  const kick = Number.isFinite(g.kick) ? g.kick : 0;
  const rpm = Number.isFinite(g.rpm) && g.rpm > 0 ? g.rpm : 30;
  const rps = Math.max(0.5, rpm / 60);
  const heft = 0.05 + kick * 1.3 + (g.pellets > 1 ? 0.04 : 0);
  const ceil = (SUSTAIN_CEIL * TRAUMA_DECAY) / rps;
  return Math.min(TRAUMA_MAX, Math.max(TRAUMA_MIN, Math.min(heft, ceil)));
}

/* ================================================================
   ESCUDO — absorve 70% até acabar. `broke` marca o ÚNICO frame em que
   o escudo some: é a informação tática que passava despercebida.
   ================================================================ */
export const ARMOR_ABSORB_RATIO = 0.7;

export function armorAbsorb(armor, dmg, ratio = ARMOR_ABSORB_RATIO) {
  const a0 = Math.max(0, +armor || 0);
  const d0 = Math.max(0, +dmg || 0);
  if (a0 <= 0) return { armor: 0, dmg: d0, absorbed: 0, broke: false };
  const absorbed = Math.min(a0, d0 * ratio);
  const armorLeft = a0 - absorbed;
  return { armor: armorLeft, dmg: d0 - absorbed, absorbed, broke: armorLeft <= 0 };
}

/* ================================================================
   "VOU MORRER?" — outro golpe igual a este me mata. Precisa ser
   verdade: quem já morreu tem encenação própria (câmera lenta).
   ================================================================ */
export function lethalThreat(healthAfter, dmg) {
  return healthAfter > 0 && healthAfter <= dmg;
}
