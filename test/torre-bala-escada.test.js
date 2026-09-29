/* ================================================================
   A BALA NA ESCADA DA TORRE NEXUS — "atiram pela parede" (dono).

   Medido no jogo real (sonda no relatório): de 42 tiros de um executivo
   no andar da placa 3 contra quem subia o lance de baixo, 8 acertaram
   ATRAVÉS dos degraus desenhados do lance de cima; com o executivo na
   beira do poço, 16 de 16. Os lances eram só RAMPA pisável: nada deles
   era parede, então bala passava por degrau que a tela mostra maciço.
   E o avesso: o guarda-corpo do poço era uma caixa sólida de 0,98 m para
   a bala, desenhado como grade vazada — o jogador vê o executivo entre as
   barras, atira, e a bala para no ar.

   Mundo REAL (terreno do cliente + js/paredes.js). A faixa desenhada dos
   degraus sai dos NÚMEROS de NEXUS_INTERIOR (não da lista de paredes sob
   teste), e o cruzamento é o slab test próprio do helper.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mundoReal, comEstruturas, cruzaCaixa, randMeio, randTopo, importar } = require('./helpers/pve-mundo');

const HUMANO = 1.75 / 2.1; // escala do executivo (js/enemies.js: HUMAN_SCALE)

async function torre(semente = 424242) {
  const R = await mundoReal(semente);
  const { mundo, t } = R;
  const { cx, cz, gy } = mundo.cidade;
  const NI = mundo.cidade.nexus.info;
  const Y2 = gy + 2 * NI.fh;
  return { ...R, cx, cz, gy, NI, Y2, heightAt: t.heightAt };
}

async function sistema({ paredes, camps, player, heightAt }) {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createEnemies } = await importar('enemies.js');
  const S = await comEstruturas(paredes);
  S.enemyCamps = camps.map(c => ({ ...c }));
  const dano = [];
  const P = { pos: new THREE.Vector3(player.x, player.y, player.z), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
  const E = createEnemies({
    CFG: { ENEMY_COUNT: 0, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randMeio, TAU: U.TAU,
    _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
    WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player: P,
    playerDamage: d => dano.push(d), addTrauma() {},
    Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
    Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
    Chars: null, state: { flying: false } });
  return { E, P, S, dano, THREE };
}
const soma = a => a.reduce((s, d) => s + d, 0);

describe('Bala respeita o que está desenhado na escada', () => {
  /* faixa DESENHADA de um lance (degraus de 0,34 m sob a rampa), só com os números */
  function naFaixaDoLance(NI, T, p) {
    const lx = p.x - T.cx, lz = p.z - T.cz, y = p.y - T.gy;
    if (lz < NI.zMid || lz > NI.zBot) return false;
    const t = (lz - NI.zMid) / (NI.zBot - NI.zMid);
    for (let k = 1; k <= NI.floors; k++) {
      const yb = (k - 1) * NI.fh, ym = yb + NI.fh / 2, yt = k * NI.fh;
      const passo = Math.min(NI.riserCount - 1, Math.floor(t * NI.riserCount)), tc = (passo + 0.5) / NI.riserCount;
      if (lx >= NI.xA0 && lx <= NI.xA1) { const s = ym + (yb - ym) * tc; if (y <= s && y >= s - 0.34) return true; }
      if (lx >= NI.xB0 && lx <= NI.xB1) { const s = ym + (yt - ym) * tc; if (y <= s && y >= s - 0.34) return true; }
    }
    return false;
  }
  const cruzaLance = (NI, T, a, b) => {
    for (let i = 1; i < 400; i++) {
      const f = i / 400;
      if (naFaixaDoLance(NI, T, { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f })) return true;
    }
    return false;
  };

  it('executivo na beira do poço não acerta, ATRAVÉS dos degraus, quem está no lance de baixo', async () => {
    const T = await torre();
    const NI = T.NI;
    const posto = { x: T.cx - 7.6, z: T.cz + NI.zBot + 0.15, suit: true, floorY: T.Y2 };
    const jog = { x: T.cx + (NI.xA0 + NI.xA1) / 2, z: T.cz + NI.zBot - 0.4 };
    jog.y = T.gy + NI.fh + 0.2;
    const medir = async lista => {
      const { E, dano } = await sistema({ paredes: lista, camps: [posto], heightAt: T.heightAt, player: jog });
      const e = E.list[0];
      e.waypoints = e.waypoints.map(() => ({ x: posto.x, z: posto.z }));
      e.fsm = 'ATACAR'; e.losT = 0; e.senseAcc = 0; e.burstLeft = 3; e.nextShot = 0; e.nextBurst = 0;
      let tt = 0;
      for (let i = 0; i < 6 * 60; i++) {
        tt += 1 / 60;
        e.group.position.x = posto.x; e.group.position.z = posto.z; // segura na beira
        E.update(1 / 60, tt);
      }
      return { total: soma(dano), tiros: dano.length };
    };
    const olho = { x: posto.x, y: T.Y2 + 1.7 * HUMANO, z: posto.z };
    const alvo = { x: jog.x, y: jog.y + 1.62, z: jog.z };
    assert.ok(cruzaLance(NI, T, olho, alvo), 'pré-condição: a reta do olho do executivo ao jogador cruza os degraus desenhados');
    const origens = T.mundo.origens;
    const semDegraus = T.mundo.paredes.filter((w, i) => !/degrau/.test(origens[i]));
    const sem = await medir(semDegraus);
    assert.ok(sem.total > 0, 'controle sem os degraus: não levou tiro — o cenário não mede nada');
    const com = await medir(T.paredes);
    assert.equal(com.total, 0, `${com.total} de dano em ${com.tiros} tiros ATRAVÉS dos degraus do lance`);
  });

  it('guarda-corpo do poço segura o CORPO mas não a bala (é grade, não parede)', async () => {
    const T = await torre();
    const NI = T.NI;
    const { P } = T;
    // jogador no meio do lance B do 2º lance (sobe para o andar da placa 3), executivo no andar, atrás da grade leste
    const zJ = -5.5, tJ = (zJ - NI.zMid) / (NI.zBot - NI.zMid);
    const yJ = T.gy + NI.fh + NI.fh / 2 + (NI.fh / 2) * tJ;
    const olho = { x: T.cx + (NI.xB0 + NI.xB1) / 2, y: yJ + 1.62, z: T.cz + zJ };
    const peito = { x: T.cx - 3.5, y: T.Y2 + 1.22 * HUMANO, z: T.cz - 5.6 };
    // a grade como ela é DESENHADA: barra de cima (0,98 m) e do meio (0,49 m), montantes a cada ~1,1 m
    const fx = (T.cx + NI.well.x1 - olho.x) / (peito.x - olho.x);
    const hy = olho.y + (peito.y - olho.y) * fx - T.Y2, hz = olho.z + (peito.z - olho.z) * fx - T.cz;
    assert.ok(hy > 0.55 && hy < 0.93, `pré-condição: a reta passa ENTRE as barras da grade (${hy.toFixed(2)} m)`);
    const montantes = [0, 1, 2, 3, 4].map(i => NI.well.z0 + (NI.zBot - NI.well.z0) * i / 4);
    assert.ok(montantes.every(mz => Math.abs(hz - mz) > 0.1), `pré-condição: a reta não bate num montante (z ${hz.toFixed(2)})`);
    const grade = { x0: T.cx + NI.well.x1 - 0.06, x1: T.cx + NI.well.x1 + 0.06, y0: T.Y2, y1: T.Y2 + NI.railHeight,
      z0: T.cz + NI.well.z0, z1: T.cz + NI.zBot };
    assert.ok(cruzaCaixa(olho, peito, grade), 'pré-condição: a reta atravessa a caixa do guarda-corpo');
    const q = P.criarConsultaParedes(T.paredes);
    assert.equal(q.segmentoBloqueado(olho, peito), false, 'a bala parou numa grade que o jogador vê vazada');
    // e o corpo continua barrado: a caixa segue sólida para quem anda
    const caixa = T.paredes.find(w => Math.abs(w.x0 - grade.x0) < 1e-6 && Math.abs(w.y0 - grade.y0) < 1e-6 &&
      Math.abs(w.z1 - grade.z1) < 1e-6);
    assert.ok(caixa, 'o guarda-corpo sumiu das paredes');
    assert.ok(!caixa.noCollide, 'o guarda-corpo deixou de segurar o corpo (dá pra cair no poço)');
  });
});

describe('Acerto do executivo só com a reta até o corpo livre', () => {
  /* Medido no jogo real depois do conserto dos degraus: 6 tiros acertaram
     o jogador com o traçante passando 1,0–1,3 cm DENTRO do degrau. O tiro
     sorteia um desvio e testa obstáculo ao longo da reta DESVIADA; se ela
     passa a menos de 0,5 m do peito, conta acerto — e o dano (e o traçante)
     vão para o PEITO, por uma reta que ninguém testou. Um poste fino no
     meio do caminho mostra isso sem escada: a reta desviada passa ao lado
     dele e a reta até o peito o atravessa. */
  it('poste fino na frente do peito: a reta desviada passa ao lado, mas o acerto no peito não vale', async () => {
    const poste = { x0: -0.05, x1: 0.05, y0: 0, y1: 3, z0: 3.95, z1: 4.05 };
    const medir = async lista => {
      const { E, P, dano } = await (async () => {
        const THREE = await import('three');
        const U = await importar('utils.js');
        const { createEnemies } = await importar('enemies.js');
        const S = await comEstruturas(lista);
        const dano = [];
        const P = { pos: new THREE.Vector3(0, 0, 8), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
        const E = createEnemies({
          CFG: { ENEMY_COUNT: 1, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randTopo, TAU: U.TAU,
          _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: () => 0, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
          WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
          scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player: P,
          playerDamage: d => dano.push(d), addTrauma() {},
          Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
          Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
          Chars: null, state: { flying: false } });
        return { E, P, dano };
      })();
      const e = E.list[0];
      e.group.position.set(0, 0, 0); e.home = { x: 0, z: 0 };
      e.waypoints = [0, 1, 2, 3].map(() => ({ x: 0, z: 0 })); e.yaw = 0;
      // estava vendo o jogador: rajada armada
      e.fsm = 'ATACAR'; e.losT = 0; e.lastKnown.copy(P.pos); e.senseAcc = 0; e.burstLeft = 3; e.nextShot = 0; e.nextBurst = 99;
      for (let i = 0; i < 20; i++) { e.group.position.set(0, 0, 0); E.update(1 / 60, i / 60); }
      return { total: soma(dano), tiros: dano.length, esc: e.group.scale.y };
    };
    const sem = await medir([]);
    assert.ok(sem.total > 0, 'controle sem o poste: o executivo não acertou — o cenário não mede nada');
    const cano = { x: 0, y: 1.45 * sem.esc, z: 0 };
    assert.ok(cruzaCaixa(cano, { x: 0, y: 1.5, z: 8 }, poste) && cruzaCaixa(cano, { x: 0, y: 1.62, z: 8 }, poste),
      'pré-condição: a reta do cano ao peito (e à cabeça) atravessa o poste');
    const com = await medir([poste]);
    assert.equal(com.total, 0, `${com.total} de dano em ${com.tiros} tiros com o poste entre o cano e o corpo`);
  });
});
