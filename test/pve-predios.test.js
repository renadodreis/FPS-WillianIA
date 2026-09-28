/* ================================================================
   PvE × PRÉDIOS — "precisa ver nos prédios, se temos bugs" (dono).

   Varredura no MUNDO REAL (terreno do cliente + paredes de js/paredes.js,
   test/helpers/pve-mundo.js): soldado preso na patrulha, executivo da Torre
   Nexus saindo do andar, e golpe/tiro atravessando LAJE entre andares.
   O que a varredura achou e é de outra área (paredes flutuando sobre o
   terreno nas bases e no castelo) está no relatório com reprodução — não
   é PvE e não cabe consertar aqui.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mundoReal, comEstruturas, cruzaCaixa, randMeio, importar } = require('./helpers/pve-mundo');

async function soldadosDoMundo(semente) {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createEnemies } = await importar('enemies.js');
  const { t, mundo, paredes } = await mundoReal(semente);
  const S = await comEstruturas(paredes);
  // os acampamentos como js/structures.js monta: Torre Nexus (andares) + guardas das bases
  S.enemyCamps = mundo.plano.campsNexus.map(c => ({ ...c }))
    .concat(...mundo.plano.bases.map(b => b.guardas.map(g => ({ x: g.x, z: g.z, army: true }))));
  let s = 99;
  const prng = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const rand = (a = 1, b) => (b === undefined ? prng() * a : a + prng() * (b - a));
  const player = { pos: new THREE.Vector3(5000, 0, 5000), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
  const E = createEnemies({
    CFG: { ENEMY_COUNT: 12, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand, TAU: U.TAU,
    _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: t.heightAt, slopeAt: t.slopeAt, terrainNormal: (x, z, o) => o.set(0, 1, 0),
    WATER_LEVEL: t.WATER_LEVEL, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player, playerDamage() {},
    addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
    Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
    Chars: null, state: { flying: false } });
  return { E, mundo, t };
}

describe('Patrulha não fica presa em construção', () => {
  it('semente 1: nenhum soldado passa 30 s sem avançar a patrulha (guarda da base preso entre os caixotes)', async () => {
    const { E, mundo } = await soldadosDoMundo(1);
    const ult = E.list.map(() => ({ wp: -1, t: 0 }));
    let tt = 0, pior = 0, quem = null;
    for (let f = 0; f < 120 * 60; f++) {
      tt += 1 / 60; E.update(1 / 60, tt);
      E.list.forEach((e, i) => {
        if (e.wpIdx !== ult[i].wp) { ult[i].wp = e.wpIdx; ult[i].t = tt; }
        if (tt - ult[i].t > pior) { pior = tt - ult[i].t; quem = e; }
      });
    }
    assert.ok(E.list.length === 12 + mundo.plano.campsNexus.length + 4 * mundo.plano.bases.length,
      'pré-condição: todos os acampamentos nasceram');
    assert.ok(pior <= 30, `${quem && quem.name} ficou ${pior.toFixed(0)} s sem avançar a patrulha ` +
      `(${quem && quem.group.position.x.toFixed(1)}, ${quem && quem.group.position.z.toFixed(1)})`);
  });

  it('executivos da Torre Nexus seguem no andar deles e dentro da casca', async () => {
    for (const semente of [424242, 1]) {
      const { E, mundo } = await soldadosDoMundo(semente);
      const { cx, cz } = mundo.cidade;
      let tt = 0;
      for (let f = 0; f < 60 * 60; f++) { tt += 1 / 60; E.update(1 / 60, tt); }
      for (const e of E.list.filter(x => x.suit)) {
        const p = e.group.position;
        assert.ok(Math.abs(p.x - cx) < 8.75 && Math.abs(p.z - cz) < 8.75,
          `semente ${semente}: ${e.name} saiu da torre (${(p.x - cx).toFixed(2)}, ${(p.z - cz).toFixed(2)})`);
        assert.ok(p.y >= e.plan.floorY - 1e-6 && p.y < e.plan.floorY + 0.2,
          `semente ${semente}: ${e.name} fora do andar (y ${p.y.toFixed(2)} × piso ${e.plan.floorY.toFixed(2)})`);
      }
    }
  });
});

describe('Laje entre andares segura golpe e tiro (Torre Nexus)', () => {
  /* laje do 1º andar da Torre (interiorNexus): o jogador em cima, o bicho no
     saguão, na MESMA vertical */
  async function torre() {
    const { P } = await mundoReal();
    const nexus = P.interiorNexus(0, 0, 0);
    const paredes = nexus.ops.filter(o => o.parede).map(o => o.parede)
      .concat(P.cascaNexus(0, 0, 0).map(b => P.caixaDaPeca(b)));
    const laje = nexus.ops.find(o => o.tipo === 'laje' && Math.abs(o.y - P.NEXUS.FH) < 1e-6 && o.x0 > -5);
    assert.ok(laje, 'pré-condição: laje do 1º andar (bloco leste)');
    return { P, paredes, laje, lajeCaixa: laje.parede };
  }

  // (o que segura aqui é o portão de ALTURA do corpo-a-corpo, e a laje seguraria também)
  it('zumbi e esqueleto no saguão não alcançam quem está no 1º andar logo acima', async () => {
    const { paredes, laje, lajeCaixa } = await torre();
    const THREE = await import('three');
    const x = 3, z = 2;  // no bloco leste, longe de pilar e do poço
    for (const tipo of ['zumbi', 'esqueleto']) {
      const medir = async (yJogador) => {
        const S = await comEstruturas(paredes);
        const dano = [];
        const player = { pos: new THREE.Vector3(x + 0.8, yJogador, z), dead: false };
        const playerDamage = d => dano.push(d);
        let update, corpo;
        if (tipo === 'zumbi') {
          const { createNight } = await importar('night.js');
          const N = createNight({ rand: () => 0, TAU: Math.PI * 2, heightAt: () => 0, WATER_LEVEL: -50,
            SFX: { whisper() {}, groan() {} }, scene: new THREE.Scene(), csmMat: m => m, Structures: S,
            obstaclesNear: () => [], addScore() {}, addKillFeed() {}, state: { flying: false }, player, playerDamage,
            extraTargets: [], Pickups: { drop() {} }, Env: { nightK: 1 }, MFlags: {} });
          corpo = N.list.find(c => !c.ghost);
          corpo.alive = true; corpo.hp = 70; corpo.hitT = 0; corpo.group.visible = true;
          update = N.update;
        } else {
          const { createSkeletons } = await importar('skeletons.js');
          THREE.DefaultLoadingManager.setURLModifier(() => 'data:application/octet-stream;base64,');
          let K;
          try {
            K = createSkeletons({ rand: randMeio, TAU: Math.PI * 2, heightAt: () => 0, WATER_LEVEL: -50,
              SFX: { groan() {} }, scene: new THREE.Scene(), csmMat: m => m, addScore() {}, addKillFeed() {},
              player, playerDamage, extraTargets: [], Pickups: { drop() {} }, Structures: S, obstaclesNear: () => [],
              state: { flying: false } });
          } finally { THREE.DefaultLoadingManager.setURLModifier(undefined); }
          corpo = K.list[0];
          corpo.alive = true; corpo.hp = 90;
          update = K.update;
        }
        corpo.group.position.set(x, 0, z);
        const R = Math.random; Math.random = () => 0.99;
        try { for (let i = 0; i < 3 * 60; i++) update(1 / 60, i / 60); } finally { Math.random = R; }
        return dano.reduce((s, d) => s + d, 0);
      };
      assert.ok(await medir(0) > 0, `${tipo}: controle no mesmo andar não levou golpe`);
      assert.ok(x > laje.x0 && x < laje.x1 && z > laje.z0 && z < laje.z1, 'pré-condição: bicho debaixo da laje');
      assert.ok(cruzaCaixa({ x, y: 1, z }, { x: x + 0.8, y: laje.y + 0.9, z }, lajeCaixa), 'pré-condição: a laje separa os dois');
      const acima = await medir(laje.y);
      assert.equal(acima, 0, `${tipo}: ${acima} de dano através da laje do 1º andar`);
    }
  });

  it('executivo do 2º andar não acerta quem está no 1º através da laje', async () => {
    const { P, paredes } = await torre();
    const THREE = await import('three');
    const U = await importar('utils.js');
    const { createEnemies } = await importar('enemies.js');
    const piso2 = 2 * P.NEXUS.FH;
    const laje2 = paredes.find(b => b.noCollide && Math.abs(b.y1 - piso2) < 1e-6 && b.x0 > -5);
    assert.ok(laje2, 'pré-condição: laje do 2º andar (bloco leste)');
    const medir = async lista => {
      const S = await comEstruturas(lista);
      S.enemyCamps = [{ x: 3, z: -2, suit: true, floorY: piso2 }];
      const dano = [];
      const player = { pos: new THREE.Vector3(3, P.NEXUS.FH, 3), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
      const E = createEnemies({
        CFG: { ENEMY_COUNT: 0, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randMeio, TAU: U.TAU,
        _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: () => 0, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
        WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
        scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player,
        playerDamage: d => dano.push(d), addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
        Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
        Chars: null, state: { flying: false } });
      const e = E.list[0];
      assert.ok(e && e.suit, 'pré-condição: executivo nasceu');
      e.waypoints = [{ x: 3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: -2 }, { x: 3, z: -2 }];
      // estava vendo o jogador (pelo poço da escada, digamos) quando ele passou para baixo da laje
      e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(player.pos); e.senseAcc = 0;
      e.burstLeft = 3; e.nextShot = 0; e.nextBurst = 0.5;
      for (let i = 0; i < 4 * 60; i++) E.update(1 / 60, i / 60);
      const cano = { x: 3, y: piso2 + 1.45 * e.group.scale.y, z: -2 };
      return { total: dano.reduce((s, d) => s + d, 0), tiros: dano.length, cano, player };
    };
    const sem = await medir(paredes.filter(b => b !== laje2));
    assert.ok(sem.total > 0, 'controle sem a laje: o executivo não acertou — o cenário não mede nada');
    const com = await medir(paredes);
    assert.ok(cruzaCaixa(com.cano, { x: 3, y: P.NEXUS.FH + 1, z: 3 }, laje2), 'pré-condição: a laje do 2º andar está no meio');
    assert.equal(com.total, 0, `${com.total} de dano em ${com.tiros} tiros através da laje`);
  });
});
