/* ================================================================
   PvE × PAREDE — "os bichos te matam através da parede" (relato do dono).

   Cada caso põe o atacante de um lado de uma peça REAL do jogo (as
   funções de js/paredes.js que montam Structures.walls: caixote da
   base, parede de fundo da cabana, casca da Torre Nexus) e o jogador do
   outro, e mede o DANO que chega — não um proxy.

   Âncora independente: antes de medir, o próprio teste prova com
   `cruzaCaixa()` (slab test sobre a caixa da peça, test/helpers) que a
   reta do golpe atravessa a peça. E todo caso tem o CONTROLE sem a peça,
   que tem de dar dano — senão "0 de dano" não prova nada.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mundoReal, comEstruturas, cruzaCaixa, randMeio, randTopo, importar } = require('./helpers/pve-mundo');

async function pecas() {
  const { P } = await mundoReal();
  return P;
}

/* ---------------- soldados (js/enemies.js) ---------------- */
async function sistemaInimigos({ paredes, n = 1, rand = randMeio }) {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createEnemies } = await importar('enemies.js');
  const S = await comEstruturas(paredes);
  const dano = [];
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), dead: false, crouchT: 0, eyeH: 1.62 };
  const state = { flying: false };
  const E = createEnemies({
    CFG: { ENEMY_COUNT: n, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand, TAU: U.TAU,
    _v1: U._v1, _v2: U._v2, _v3: U._v3,
    heightAt: () => 0, slopeAt: () => 0, terrainNormal: (x, z, out) => out.set(0, 1, 0), WATER_LEVEL: -50,
    obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {},
    player, playerDamage: (d, from, cause) => dano.push({ d, from: from && { x: from.x, y: from.y, z: from.z }, cause }),
    addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
    Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(),
    lastShotInfo: { pos: new THREE.Vector3(), t: -99 }, Chars: null, state,
  });
  return { E, player, dano, state, THREE };
}
function posicionar(e, x, z, alvo) {
  e.group.position.set(x, 0, z);
  e.home = { x, z };
  e.waypoints = [{ x, z }, { x, z }, { x, z }, { x, z }];
  e.yaw = Math.atan2(alvo.x - x, alvo.z - z);
}
const soma = arr => arr.reduce((s, h) => s + h.d, 0);

describe('Soldado não acerta através de cobertura', () => {
  /* caixote de 1,4 m da base militar (pecasBase), em chão plano */
  async function cenarioCaixote({ comCaixote, agachado }) {
    const P = await pecas();
    const base = P.pecasBase(0, 0, 0);
    const caixote = base[base.length - 2];
    assert.equal(caixote.h, 1.4, 'pré-condição: a peça é o caixote de 1,4 m');
    const caixa = P.caixaDaPeca(caixote);
    const paredes = base.filter(p => p.solida).map(p => P.caixaDaPeca(p))
      .filter(b => comCaixote || b.y1 !== caixa.y1 || b.x0 !== caixa.x0);
    const { E, player, dano } = await sistemaInimigos({ paredes });
    // jogador colado atrás do caixote (face -z), soldado 12 m à frente
    player.pos.set(caixote.x, 0, caixa.z0 - 0.6);
    player.crouchT = agachado ? 1 : 0;
    const e = E.list[0];
    posicionar(e, caixote.x, caixa.z1 + 11.3, player.pos);
    e.fsm = 'PERSEGUIR';
    let mirando = 0;
    for (let i = 0; i < 6 * 60; i++) { E.update(1 / 60, i / 60); if (e.fsm === 'ATACAR') mirando++; }
    return { dano: soma(dano), tiros: dano.length, mirando, caixa, player, e };
  }

  it('agachado atrás do caixote de 1,4 m: zero de dano (e sem o caixote, leva)', async () => {
    const com = await cenarioCaixote({ comCaixote: true, agachado: true });
    // âncora: a reta do cano (1,45 m) ao peito agachado (0,95 m) atravessa o caixote
    const cano = { x: com.e.group.position.x, y: 1.45, z: com.e.group.position.z };
    const peito = { x: com.player.pos.x, y: 0.95, z: com.player.pos.z };
    assert.ok(cruzaCaixa(cano, peito, com.caixa), 'pré-condição: o tiro no peito agachado cruza o caixote');
    const sem = await cenarioCaixote({ comCaixote: false, agachado: true });
    assert.ok(sem.dano > 0, `controle sem caixote não levou tiro (${sem.dano}) — o cenário não exercita nada`);
    assert.equal(com.dano, 0, `levou ${com.dano} de dano em ${com.tiros} tiros ATRAVÉS do caixote`);
    /* e nem "viu": a cabeça agachada (1,04 m) está abaixo do caixote. Soldado
       que entra em ATACAR aqui fica metralhando o caixote — o traçante entra
       nele, e é isso que o jogador lê como "tiro através da parede". Este é o
       SEGUNDO guarda (visão pela cabeça de verdade); o primeiro (a bala
       para no obstáculo) é medido no caso da parede da cabana. */
    assert.equal(com.mirando, 0, `soldado mirou o jogador escondido por ${com.mirando} quadros`);
  });

  it('em pé atrás do caixote (cabeça e peito acima dele): o soldado ainda acerta', async () => {
    const r = await cenarioCaixote({ comCaixote: true, agachado: false });
    assert.ok(r.dano > 0, 'o conserto cegou o soldado para quem está exposto');
  });
});

describe('Soldado não atira através de parede com contato visual velho', () => {
  /* parede de FUNDO da cabana (pecasCabana): 2,7 m de altura, 0,26 m */
  async function cabana() {
    const P = await pecas();
    const cab = P.pecasCabana(0, 0, 0, false);
    const fundo = P.caixaDaPeca(cab[1]);
    assert.ok(fundo.y1 - fundo.y0 > 2.6 && fundo.z1 - fundo.z0 < 0.3, 'pré-condição: peça é a parede de fundo');
    return { P, cab, fundo, paredes: cab.filter(p => p.solida).map(p => P.caixaDaPeca(p)) };
  }

  it('entrou atrás da parede no meio da rajada: nenhum tiro atravessa', async () => {
    const { fundo, paredes } = await cabana();
    const medir = async lista => {
      const { E, player, dano } = await sistemaInimigos({ paredes: lista });
      player.pos.set(0, 0, fundo.z1 + 0.7);          // dentro da cabana, colado no fundo
      const e = E.list[0];
      posicionar(e, 0, fundo.z0 - 6, player.pos);     // fora, 6 m atrás do fundo
      // o soldado ESTAVA vendo o jogador (acabou de entrar na cabana): rajada armada
      e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(player.pos);
      e.senseAcc = 0; e.burstLeft = 3; e.nextShot = 0; e.nextBurst = 99;
      for (let i = 0; i < 60; i++) E.update(1 / 60, i / 60);
      return { dano: soma(dano), tiros: dano.length, player, e };
    };
    const com = await medir(paredes);
    const cano = { x: com.e.group.position.x, y: 1.45, z: com.e.group.position.z };
    assert.ok(cruzaCaixa(cano, { x: 0, y: 1.2, z: com.player.pos.z }, fundo), 'pré-condição: a reta cruza a parede');
    const sem = await medir([]);
    assert.ok(sem.dano > 0, 'controle sem parede não levou tiro');
    assert.equal(com.dano, 0, `levou ${com.dano} de dano em ${com.tiros} tiros ATRAVÉS da parede da cabana`);
  });

  it('o erro de mira de UM soldado não dá visão a OUTRO que está atrás da parede', async () => {
    /* Parede LATERAL da cabana (pecasCabana), sozinha: 2,7 m × 4,4 m.
       Jogador colado do lado de dentro; B do lado de fora, atrás dela.
       A, ao norte e sem nada no caminho, vê o jogador e ERRA (rand no topo =
       desvio máximo): a bala passa e cai ~8 m além, num ponto que B enxerga.
       O defeito: o olho do jogador e o fim do traçante do erro eram o MESMO
       vetor (`_v3` de game.js) — B passava a "ver" o jogador pelo tiro de A. */
    const P = await pecas();
    const lado = P.caixaDaPeca(P.pecasCabana(0, 0, 0, false)[2]);
    assert.ok(lado.z1 - lado.z0 > 4 && lado.x1 - lado.x0 < 0.3, 'pré-condição: peça é a parede lateral');
    const { E, player, dano } = await sistemaInimigos({ paredes: [lado], n: 2, rand: randTopo });
    player.pos.set(lado.x1 + 0.7, 0, 0);
    const [A, B] = E.list;
    posicionar(A, player.pos.x, 12, player.pos);
    posicionar(B, lado.x0 - 5.5, 0, player.pos);
    A.fsm = 'ATACAR'; A.losT = 0; A.lastKnown.copy(player.pos); A.senseAcc = 0;
    A.burstLeft = 3; A.nextShot = 0; A.nextBurst = 0;
    B.fsm = 'ALERTA'; B.alertT = 0; B.senseAcc = 0.16; B.lastKnown.copy(B.group.position);
    let bAtras = 0, primeiro = -1;
    for (let i = 0; i < 5 * 60; i++) {
      E.update(1 / 60, i / 60);
      if (B.fsm === 'ATACAR' || B.fsm === 'PERSEGUIR') { bAtras++; if (primeiro < 0) primeiro = i; }
    }
    const doB = dano.filter(h => h.from && h.from.x < lado.x0);
    const olhoB = { x: B.group.position.x, y: 1.7 * B.group.scale.y, z: B.group.position.z };
    assert.ok(cruzaCaixa(olhoB, { x: player.pos.x, y: 1.62, z: 0 }, lado), 'pré-condição: B está atrás da parede');
    assert.ok(cruzaCaixa(olhoB, { x: player.pos.x, y: 1.04, z: 0 }, lado), 'pré-condição: nem agachado B o veria');
    assert.equal(bAtras, 0, `B foi atrás do jogador que não pode ver por ${bAtras} quadros (1º no quadro ${primeiro})`);
    assert.equal(soma(doB), 0, `B deu ${soma(doB)} de dano através da parede`);
  });

  it('soco do Guardião não atravessa a parede da cabana', async () => {
    const { fundo, paredes } = await cabana();
    const medir = async lista => {
      const { E, player, dano } = await sistemaInimigos({ paredes: lista });
      player.pos.set(0, 0, fundo.z1 + 0.5);
      const e = E.list[0];
      posicionar(e, 0, fundo.z0 - 0.55, player.pos);  // encostado na parede, do lado de fora
      // pele GLB do Guardião (a que dá o soco); FSM, hitbox e dano são os mesmos
      e.hasModel = true; e.mixer = { update() {} }; e.nextMelee = 0;
      e.actions = { Walk: { setEffectiveWeight() {} }, Punch: { reset() { return this; }, play() {} } };
      e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(player.pos);
      e.senseAcc = 0; e.burstLeft = 0; e.nextBurst = 99;
      E.update(1 / 60, 0);
      await new Promise(r => setTimeout(r, 450)); // o soco conecta 380 ms depois
      return { dano: soma(dano), golpes: dano.length, causa: dano[0] && dano[0].cause };
    };
    const sem = await medir([]);
    assert.ok(sem.dano > 0, 'controle sem parede: o soco não saiu');
    assert.deepEqual(sem.causa, { type: 'enemy' }, 'o soco precisa dizer QUEM bateu (tela de morte)');
    const com = await medir(paredes);
    assert.equal(com.dano, 0, `soco atravessou a parede: ${com.dano} de dano`);
  });
});

/* ---------------- Visitante (js/alien.js) ---------------- */
async function sistemaAlien({ paredes, heightAt = () => 0 }) {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createAlien } = await importar('alien.js');
  const S = await comEstruturas(paredes);
  const dano = [];
  const player = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
  const state = { gameTime: 0, flying: false };
  const A = createAlien({
    rand: randMeio, TAU: U.TAU, _v1: U._v1, _v2: U._v2, heightAt, biomeAt: () => -1, WATER_LEVEL: -50,
    CITY: { x: 9999, z: 9999 }, SFX: { roar() {}, bossShot() {}, victory() {} }, FX: { burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, addScore() {}, addKillFeed() {}, showBanner() {},
    unlockWeapon() {}, state, player, playerDamage: (d, from, cause) => dano.push({ d, cause }),
    Bosses: [], Pickups: { drop() {} }, MFlags: {}, setTimeScale() {}, Structures: S, Chars: null,
  });
  return { A, player, dano, state, THREE };
}

describe('Visitante: explosão do orbe não atravessa parede', () => {
  it('orbe que cai do lado de fora da cabana não fere quem está dentro', async () => {
    const P = await pecas();
    const cab = P.pecasCabana(0, 0, 0, false);
    const fundo = P.caixaDaPeca(cab[1]);
    const paredes = cab.filter(p => p.solida).map(p => P.caixaDaPeca(p));
    const medir = async lista => {
      const { A, player, dano } = await sistemaAlien({ paredes: lista });
      player.pos.set(0, 0, fundo.z1 + 0.6);
      A.state.active = false; // o corpo dele longe, parado; só o orbe interessa
      A.pos().set(300, 0, 300);
      const o = A.orbs.find(x => !x.live);
      o.live = true; o.life = 4; o.m.visible = true;
      o.m.position.set(0, 0.5, fundo.z0 - 1.2);   // do lado de fora, descendo no chão
      o.vel.set(0, -22, 0);
      A.update(1 / 60, 0);
      return { dano: dano.reduce((s, h) => s + h.d, 0), explodiu: !o.live, o };
    };
    const sem = await medir([]);
    assert.ok(sem.explodiu && sem.dano > 0, `controle sem parede: explosão a ~2 m não feriu (${sem.dano})`);
    const com = await medir(paredes);
    assert.ok(com.explodiu, 'o orbe nem explodiu — o cenário não mede nada');
    assert.ok(cruzaCaixa(com.o.m.position, { x: 0, y: 1, z: fundo.z1 + 0.6 }, fundo), 'pré-condição: explosão e jogador em lados opostos');
    assert.equal(com.dano, 0, `explosão atravessou a parede: ${com.dano} de dano`);
  });
});

/* ---------------- criaturas da noite (js/night.js) ---------------- */
async function sistemaNoite({ paredes, heightAt = () => 0, rand = () => 0, nightK = 1 }) {
  const THREE = await import('three');
  const { createNight } = await importar('night.js');
  const S = await comEstruturas(paredes);
  const dano = [];
  const player = { pos: new THREE.Vector3(), dead: false };
  const N = createNight({
    rand, TAU: Math.PI * 2, heightAt, WATER_LEVEL: -50, SFX: { whisper() {}, groan() {} },
    scene: new THREE.Scene(), csmMat: m => m, Structures: S, obstaclesNear: () => [],
    addScore() {}, addKillFeed() {}, state: { started: false, flying: false }, player,
    playerDamage: (d, from, cause) => dano.push({ d, cause }), extraTargets: [], Pickups: { drop() {} },
    Env: { nightK }, MFlags: {},
  });
  return { N, player, dano, S, THREE };
}

describe('Fantasma atravessa parede (design), mas não fere de dentro dela', () => {
  it('fantasma com o centro dentro da casca da Torre Nexus não acerta quem está no saguão', async () => {
    const P = await pecas();
    const casca = P.cascaNexus(0, 0, 0).map(b => P.caixaDaPeca(b));
    const oeste = casca[1];
    assert.ok(oeste.x1 - oeste.x0 === 0.5, 'pré-condição: casca oeste de 0,5 m');
    const medir = async lista => {
      const { N, player, dano } = await sistemaNoite({ paredes: lista });
      for (const c of N.list) { c.alive = false; }
      const g = N.list.find(c => c.ghost);
      g.alive = true; g.hp = 50; g.hitT = 0; g.group.visible = true;
      g.group.position.set((oeste.x0 + oeste.x1) / 2, 0, 0);  // meio da parede
      player.pos.set(oeste.x1 + 0.55, 0, 0);                  // saguão, 0,55 m da face interna
      N.update(0, 0);
      return { dano: dano.reduce((s, h) => s + h.d, 0) };
    };
    const sem = await medir([]);
    assert.ok(sem.dano > 0, 'controle sem parede: o toque não saiu');
    const com = await medir(casca);
    assert.equal(com.dano, 0, `fantasma feriu de DENTRO da parede: ${com.dano} de dano`);
  });
});

describe('Criaturas da noite não nascem dentro de prédio', () => {
  it('com o jogador no centro da cidade (semente 424242), nenhum nascimento dentro de parede', async () => {
    const { t, paredes } = await mundoReal(424242);
    let s = 0x9E3779B9;
    const prng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const rand = (a = 1, b) => (b === undefined ? prng() * a : a + prng() * (b - a));
    const { N, player, S } = await sistemaNoite({ paredes, heightAt: t.heightAt, rand });
    player.pos.set(t.CITY.x, t.heightAt(t.CITY.x, t.CITY.z), t.CITY.z);
    player.dead = false;
    /* ÂNCORA: dentro = o círculo do corpo sobrepõe a caixa na faixa de altura
       do corpo — a MESMA faixa em que o collide do jogo expulsaria o bicho */
    const dentro = (p, r, h) => S.walls.some(b => !b.noCollide && !(p.y + h < b.y0 || p.y >= b.y1 - 0.12) &&
      (p.x - Math.max(b.x0, Math.min(b.x1, p.x))) ** 2 + (p.z - Math.max(b.z0, Math.min(b.z1, p.z))) ** 2 < r * r);
    const R = Math.random;
    Math.random = prng;
    let nasc = 0, ruins = 0;
    try {
      for (let f = 0; f < 60 * 400 && nasc < 400; f++) {
        const vivos = new Set(N.list.filter(c => c.alive));
        N.update(1 / 60, f / 60);
        for (const c of N.list) {
          if (!c.alive || vivos.has(c)) continue;
          nasc++;
          if (dentro(c.group.position, 0.4, 1.8)) ruins++;
          c.alive = false; c.group.visible = false; // recicla: só o nascimento importa
        }
      }
    } finally { Math.random = R; }
    assert.ok(nasc >= 200, `pré-condição: poucos nascimentos (${nasc})`);
    assert.equal(ruins, 0, `${ruins} de ${nasc} nascimentos (${(100 * ruins / nasc).toFixed(1)} %) DENTRO de prédio`);
  });
});
