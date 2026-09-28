/* ================================================================
   PvE × HELICÓPTERO — "eles não deveriam conseguir te pegar ou te dar
   dano se você está no helicóptero" (relato do dono).

   Voando, js/heli.js escreve `player.pos` no CHÃO debaixo do
   helicóptero (é o ponto que recentra grama e chunks). Todo bicho que
   mira `player.pos` mirava ESSE ponto: chegava debaixo do helicóptero e
   mordia, batia e atirava num jogador que estava lá em cima.

   Regra (decisão desta rodada, documentada em js/aihelpers.js): com
   `state.flying`, NENHUM PvE dá dano nem persegue o jogador. PvP segue
   igual (é do servidor). Cada caso tem o CONTROLE a pé, que tem de dar
   dano/aproximação — senão "zero" não prova nada.

   A cena reproduz o que o helicóptero faz: o jogador "voando" fica com
   `player.pos` no chão, colado no bicho.

   Dois blocos, porque são dois portões diferentes em cada módulo:
   • "voando desde o começo" — o bicho não começa ataque nem persegue;
   • "embarcou no meio do ataque" — golpe já armado, orbe já no ar, rajada
     já saindo: o DANO também tem de ser recusado. Sem este bloco, o portão
     do dano ficava escondido atrás do portão do ataque (reinjetado: os dois
     mutantes passavam verdes).
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { comEstruturas, randMeio, importar } = require('./helpers/pve-mundo');

const soma = arr => arr.reduce((s, h) => s + h.d, 0);
const horiz = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

async function base() {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const S = await comEstruturas([]);
  const dano = [];
  const player = { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), dead: false, crouchT: 0, eyeH: 1.62 };
  const state = { flying: false, started: true, gameTime: 0 };
  const playerDamage = (d, from, cause) => dano.push({ d, cause });
  return { THREE, U, S, dano, player, state, playerDamage };
}

/* ---------------- fábricas: os módulos DE VERDADE ---------------- */
async function animais({ THREE, U, S, player, state, playerDamage }) {
  const { createAnimals } = await importar('animals.js');
  const A = createAnimals({ clamp: U.clamp, rand: randMeio, TAU: U.TAU, heightAt: () => 0, slopeAt: () => 0,
    WATER_LEVEL: -50, CITY: { x: 9999, z: 9999 }, scene: new THREE.Scene(), csmMat: m => m, addScore() {},
    player, playerDamage, extraTargets: [], Pickups: { spawn() {} }, Structures: S, obstaclesNear: () => [],
    SFX: { groan() {} }, state });
  for (const a of A.list) a.group.position.set(500, 0, 500);
  return A;
}
async function esqueletos({ THREE, S, player, state, playerDamage }) {
  const { createSkeletons } = await importar('skeletons.js');
  // Node não tem página: o GLB do esqueleto falha (assíncrono) e o corpo fica sem malha
  THREE.DefaultLoadingManager.setURLModifier(() => 'data:application/octet-stream;base64,');
  try {
    return createSkeletons({ rand: randMeio, TAU: Math.PI * 2, heightAt: () => 0, WATER_LEVEL: -50,
      SFX: { groan() {} }, scene: new THREE.Scene(), csmMat: m => m, addScore() {}, addKillFeed() {},
      player, playerDamage, extraTargets: [], Pickups: { drop() {} }, Structures: S, obstaclesNear: () => [], state });
  } finally { THREE.DefaultLoadingManager.setURLModifier(undefined); }
}
async function noite({ THREE, S, player, state, playerDamage }) {
  const { createNight } = await importar('night.js');
  return createNight({ rand: () => 0, TAU: Math.PI * 2, heightAt: () => 0, WATER_LEVEL: -50,
    SFX: { whisper() {}, groan() {} }, scene: new THREE.Scene(), csmMat: m => m, Structures: S,
    obstaclesNear: () => [], addScore() {}, addKillFeed() {}, state, player, playerDamage,
    extraTargets: [], Pickups: { drop() {} }, Env: { nightK: 1 }, MFlags: {} });
}
async function inimigos({ THREE, U, S, player, state, playerDamage }) {
  const { createEnemies } = await importar('enemies.js');
  return createEnemies({
    CFG: { ENEMY_COUNT: 1, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randMeio, TAU: U.TAU,
    _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: () => 0, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
    WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player, playerDamage,
    addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
    Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(),
    lastShotInfo: { pos: new THREE.Vector3(), t: -99 }, Chars: null, state });
}
function soldadoEm(E, x, z) {
  const e = E.list[0];
  e.group.position.set(x, 0, z); e.home = { x, z };
  e.waypoints = [{ x, z }, { x, z }, { x, z }, { x, z }];
  return e;
}
function guardiao(e) { // pele GLB do Guardião (a que dá o soco); FSM, hitbox e dano iguais
  e.hasModel = true; e.mixer = { update() {} }; e.nextMelee = 0;
  e.actions = { Walk: { setEffectiveWeight() {} }, Punch: { reset() { return this; }, play() {} } };
}
async function visitante({ THREE, U, S, player, state, playerDamage }) {
  const { createAlien } = await importar('alien.js');
  return createAlien({ rand: randMeio, TAU: U.TAU, _v1: U._v1, _v2: U._v2, heightAt: () => 0, biomeAt: () => -1,
    WATER_LEVEL: -50, CITY: { x: 9999, z: 9999 }, SFX: { roar() {}, bossShot() {}, victory() {} }, FX: { burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, addScore() {}, addKillFeed() {}, showBanner() {}, unlockWeapon() {},
    state, player, playerDamage, Bosses: [], Pickups: { drop() {} }, MFlags: {}, setTimeScale() {}, Structures: S, Chars: null });
}
// o Colosso nasce EM CASA (o forte) — longe do ponto do jogador, senão
// "voltar para casa" seria o mesmo que ir até ele
async function colosso({ THREE, U, S, player, state, playerDamage }, casa) {
  const { createBoss } = await importar('boss.js');
  S.FORT_POS = casa; S.castle = null;
  const style = () => ({ style: {} });
  return createBoss({ clamp: U.clamp, damp: U.damp, rand: randMeio, TAU: U.TAU, _v1: U._v1, _v2: U._v2,
    heightAt: () => 0, groundAt: () => 0, SFX: { roar() {}, bossShot() {}, stomp() {}, explosion() {}, victory() {} },
    FX: { burst() {}, spawnParticle() {} }, scene: new THREE.Scene(), csmMat: m => m, Structures: S,
    ui: { bossFill: style(), bossWrap: style() }, addScore() {}, addKillFeed() {}, showBanner() {}, player,
    playerDamage, addTrauma() {}, Bosses: [], Pickups: { drop() {}, spawn() {} }, MFlags: {}, setTimeScale() {}, state });
}

/* ---------------- bloco 1: voando desde o começo ---------------- */
/* roda `frames` quadros e devolve quanto o bicho se aproximou do ponto */
function correr(update, alvo, corpo, frames, state) {
  const d0 = horiz(corpo, alvo);
  for (let i = 0; i < frames; i++) { state.gameTime += 1 / 60; update(1 / 60, state.gameTime); }
  return { aproximou: d0 - horiz(corpo, alvo) };
}
async function cenario(montar) {
  const out = {};
  for (const voando of [false, true]) {
    const b = await base();
    b.state.flying = voando;
    const r = await montar(b);
    out[voando ? 'voando' : 'aPe'] = { dano: soma(b.dano), golpes: b.dano.length, aproximou: r.aproximou };
  }
  return out;
}
function exigir(nome, r, { aproxima = true } = {}) {
  assert.ok(r.aPe.dano > 0, `${nome}: controle a pé não levou dano — o cenário não exercita o ataque`);
  if (aproxima) assert.ok(r.aPe.aproximou > 1, `${nome}: controle a pé não se aproximou (${r.aPe.aproximou.toFixed(2)} m)`);
  assert.equal(r.voando.dano, 0, `${nome}: ${r.voando.dano} de dano em ${r.voando.golpes} golpes com o jogador NO HELICÓPTERO`);
  if (aproxima) assert.ok(r.voando.aproximou <= 0.05,
    `${nome}: perseguiu o chão debaixo do helicóptero (${r.voando.aproximou.toFixed(2)} m)`);
}

describe('No helicóptero nenhum PvE fere nem persegue', () => {
  it('lobo', async () => {
    const r = await cenario(async b => {
      const A = await animais(b);
      const lobo = A.list.find(a => a.predator);
      lobo.group.position.set(6, 0, 0); lobo.biteT = 0;
      return correr(A.update, b.player.pos, lobo.group.position, 3 * 60, b.state);
    });
    exigir('lobo', r);
  });

  it('cervo encurralado', async () => {
    const r = await cenario(async b => {
      const A = await animais(b);
      const cervo = A.list.find(a => !a.predator);
      cervo.group.position.set(1.2, 0, 0); cervo.biteT = 0;
      return correr(A.update, b.player.pos, cervo.group.position, 1, b.state);
    });
    exigir('cervo', r, { aproxima: false });
  });

  it('esqueleto', async () => {
    const r = await cenario(async b => {
      const K = await esqueletos(b);
      const sk = K.list[0];
      sk.alive = true; sk.hp = 90; sk.group.position.set(8, 0, 0);
      return correr(K.update, b.player.pos, sk.group.position, 5 * 60, b.state);
    });
    exigir('esqueleto', r);
  });

  for (const fantasma of [false, true]) {
    it(fantasma ? 'fantasma' : 'zumbi', async () => {
      const r = await cenario(async b => {
        const N = await noite(b);
        const c = N.list.find(x => x.ghost === fantasma);
        c.alive = true; c.hp = 70; c.hitT = 0; c.group.visible = true; c.group.position.set(6, 0, 0);
        const R = Math.random; Math.random = () => 0.99; // ninguém mais nasce no meio da medição
        try { return correr(N.update, b.player.pos, c.group.position, 4 * 60, b.state); } finally { Math.random = R; }
      });
      exigir(fantasma ? 'fantasma' : 'zumbi', r);
    });
  }

  it('soldado (tiro)', async () => {
    const r = await cenario(async b => {
      const E = await inimigos(b);
      const e = soldadoEm(E, 40, 0);
      // patrulhando, de frente para o jogador: a pé ele vê, persegue e atira
      e.fsm = 'PATRULHA'; e.yaw = -Math.PI / 2; e.lastKnown.set(40, 0, 0);
      return correr(E.update, b.player.pos, e.group.position, 8 * 60, b.state);
    });
    exigir('soldado', r);
  });

  it('Guardião (soco)', async () => {
    const r = await cenario(async b => {
      const E = await inimigos(b);
      const e = soldadoEm(E, 2, 0);
      guardiao(e);
      e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(b.player.pos); e.burstLeft = 0; e.nextBurst = 99;
      E.update(1 / 60, 0);
      await new Promise(res => setTimeout(res, 450));
      return { aproximou: 0 };
    });
    exigir('Guardião', r, { aproxima: false });
  });

  it('Visitante', async () => {
    const r = await cenario(async b => {
      const A = await visitante(b);
      A.state.active = true; A.state.blinkT = 1e9;
      A.pos().set(25, 0, 0);
      return correr(A.update, b.player.pos, A.pos(), 10 * 60, b.state);
    });
    exigir('Visitante', r);
  });

  it('Colosso (pisão)', async () => {
    const r = await cenario(async b => {
      const B = await colosso(b, { x: 3, z: 0 });
      B.state.active = true;
      return correr(B.update, b.player.pos, B.pos(), 2 * 60, b.state);
    });
    exigir('Colosso pisão', r, { aproxima: false });
  });

  it('Colosso (orbes)', async () => {
    const r = await cenario(async b => {
      const B = await colosso(b, { x: 30, z: 0 });
      B.state.active = true;
      return correr(B.update, b.player.pos, B.pos(), 6 * 60, b.state);
    });
    exigir('Colosso orbes', r);
  });
});

/* ---------------- bloco 2: embarcou no meio do ataque ---------------- */
/* `armar(b)` monta a cena e devolve { update, pronto() } — `pronto` diz quando
   o ataque JÁ SAIU (golpe armado, orbe no ar, rajada correndo). Aí o jogador
   embarca (ou, no controle, fica a pé) e contamos só o dano DEPOIS disso. */
async function embarque(armar, segundos) {
  const out = {};
  for (const embarca of [false, true]) {
    const b = await base();
    const { update, pronto } = await armar(b);
    let f = 0;
    for (; f < 20 * 60 && !pronto(); f++) { b.state.gameTime += 1 / 60; update(1 / 60, b.state.gameTime); }
    assert.ok(pronto(), 'pré-condição: o ataque nunca saiu a pé');
    const antes = b.dano.length;
    b.state.flying = embarca;
    for (let i = 0; i < segundos * 60; i++) { b.state.gameTime += 1 / 60; update(1 / 60, b.state.gameTime); }
    await new Promise(res => setTimeout(res, 450)); // golpe com atraso (soco do Guardião)
    out[embarca ? 'embarcou' : 'aPe'] = soma(b.dano.slice(antes));
  }
  return out;
}
function exigirEmbarque(nome, r) {
  assert.ok(r.aPe > 0, `${nome}: controle a pé não levou o golpe que já tinha saído — o cenário não mede nada`);
  assert.equal(r.embarcou, 0, `${nome}: ${r.embarcou} de dano DEPOIS de embarcar no helicóptero`);
}

describe('Embarcou no helicóptero com o ataque já saindo: o golpe não chega', () => {
  it('esqueleto no meio do golpe', async () => {
    exigirEmbarque('esqueleto', await embarque(async b => {
      const K = await esqueletos(b);
      const sk = K.list[0];
      sk.alive = true; sk.hp = 90; sk.group.position.set(1.2, 0, 0);
      return { update: K.update, pronto: () => sk.attacking && !sk.attackHit };
    }, 1));
  });

  it('Guardião com o soco no ar', async () => {
    exigirEmbarque('Guardião', await embarque(async b => {
      const E = await inimigos(b);
      const e = soldadoEm(E, 2, 0);
      guardiao(e);
      e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(b.player.pos); e.burstLeft = 0; e.nextBurst = 99;
      return { update: E.update, pronto: () => e.nextMelee > 0 };
    }, 0));
  });

  it('soldado no meio da rajada', async () => {
    exigirEmbarque('soldado', await embarque(async b => {
      const E = await inimigos(b);
      const e = soldadoEm(E, 12, 0);
      e.yaw = -Math.PI / 2; e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(b.player.pos);
      e.burstLeft = 3; e.nextShot = 0; e.nextBurst = 99;
      /* o soldado olha (sentido escalonado a cada 0,16 s) e dispara no MESMO
         quadro; o 2º tiro da rajada sai 0,13 s depois — ANTES da próxima
         olhada. É a janela em que ele atira em quem acabou de embarcar. */
      e.senseAcc = 0.16;
      return { update: E.update, pronto: () => e.burstLeft === 2 };
    }, 1));
  });

  it('Visitante com orbe no ar', async () => {
    exigirEmbarque('Visitante', await embarque(async b => {
      const A = await visitante(b);
      A.state.active = false; A.pos().set(300, 0, 300); // só o orbe interessa
      // orbe descendo, vai estourar no chão a 2 m do jogador (raio de 4 m)
      const o = A.orbs[0];
      o.live = true; o.life = 4; o.m.visible = true;
      o.m.position.set(2, 1.5, 0); o.vel.set(0, -22, 0);
      return { update: A.update, pronto: () => true };
    }, 1));
  });

  it('Colosso com orbes no ar', async () => {
    exigirEmbarque('Colosso orbes', await embarque(async b => {
      const B = await colosso(b, { x: 20, z: 0 });
      B.state.active = true;
      let viu = false;
      return { update: (dt, t) => { B.update(dt, t); if (B.state.volleyLeft > 0) viu = true; },
        pronto: () => viu && B.state.volleyLeft === 0 };
    }, 3));
  });

  it('Colosso no meio do pisão', async () => {
    exigirEmbarque('Colosso pisão', await embarque(async b => {
      const B = await colosso(b, { x: 3, z: 0 });
      B.state.active = true;
      return { update: B.update, pronto: () => B.state.stompT >= 0 && !B.state.stompHit };
    }, 2));
  });
});
