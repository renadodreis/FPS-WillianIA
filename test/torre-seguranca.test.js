/* ================================================================
   OS SEGURANÇAS DA TORRE NEXUS — relato do dono (solo):
   "de onde vieram os dois seguranças bots que estão dentro do prédio no
   3º andar... e por que eles NÃO MORREM e ATIRAM PELA PAREDE?"

   São os Executivos (js/enemies.js, `plan.suit`): js/paredes.js sorteia
   dois postos em cada andar par da torre (k = 2, 4, 6, 8 — as placas da
   escada dizem 3, 5, 7 e 9, porque a placa 1 é o térreo).

   Mundo REAL: terreno do cliente + paredes de js/paredes.js
   (test/helpers/pve-mundo.js). Medido no jogo real antes do conserto
   (sondas no relatório): o executivo MORRE com 3 tiros de fuzil, mas o
   corpo voava 7,6 m, atravessava a fachada norte, caía 6,8 m até o
   TERRENO, encolhia e sumia em 1,5 s — e ele voltava VIVO no mesmo posto
   8 s depois, a 9,18 m do jogador, com a linha de visada livre.

   Âncoras independentes do código sob teste: a planta do andar e a
   faixa desenhada de cada lance saem dos NÚMEROS de NEXUS_INTERIOR
   (info), e o cruzamento é o slab test próprio do helper (`cruzaCaixa`).
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mundoReal, comEstruturas, cruzaCaixa, randMeio, importar } = require('./helpers/pve-mundo');

const HUMANO = 1.75 / 2.1; // escala do executivo (js/enemies.js: HUMAN_SCALE)

async function torre(semente = 424242) {
  const R = await mundoReal(semente);
  const { mundo, t } = R;
  const { cx, cz, gy } = mundo.cidade;
  const NI = mundo.cidade.nexus.info;
  const Y2 = gy + 2 * NI.fh; // andar do primeiro par de executivos (placa "3")
  return { ...R, cx, cz, gy, NI, Y2, heightAt: t.heightAt };
}

/* planta do andar (bloco leste + faixa sul do poço), só com os números */
function naPlanta(NI, cx, cz, x, z) {
  const lx = x - cx, lz = z - cz, H = NI.half;
  if (Math.abs(lx) > H || Math.abs(lz) > H) return false;
  return lx >= NI.well.x1 || lz >= NI.zBot;
}

/* sorteio determinístico com espalhamento de verdade (o randMeio põe todo
   mundo no mesmo ponto do círculo e esconde a perseguição) */
function lcg(semente) {
  let s = semente >>> 0;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  return (a = 1, b) => (b === undefined ? r() * a : a + r() * (b - a));
}

async function sistema({ paredes, camps, player, heightAt, rand = randMeio }) {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createEnemies } = await importar('enemies.js');
  const S = await comEstruturas(paredes);
  S.enemyCamps = camps.map(c => ({ ...c }));
  const dano = [];
  const P = { pos: new THREE.Vector3(player.x, player.y, player.z), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
  const E = createEnemies({
    CFG: { ENEMY_COUNT: 0, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand, TAU: U.TAU,
    _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
    WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player: P,
    playerDamage: d => dano.push(d), addTrauma() {},
    Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
    Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
    Chars: null, state: { flying: false } });
  return { E, P, S, dano, THREE };
}

describe('Executivo morto fica morto no andar dele', () => {
  it('o corpo cai na laje em que morreu — não atravessa laje nem fachada, e não some', async () => {
    const T = await torre();
    const camp = T.mundo.plano.campsNexus[0];
    assert.ok(Math.abs(camp.floorY - T.Y2) < 1e-6, 'pré-condição: primeiro posto é o andar da placa 3');
    const { E, THREE } = await sistema({ paredes: T.paredes, camps: [camp], heightAt: T.heightAt,
      player: { x: T.cx - 2, y: T.Y2, z: T.cz + 4 } });
    const e = E.list[0];
    // o tiro vem do sul: o corpo é jogado para o NORTE, contra a fachada (o caso medido no jogo)
    const morreu = e.damage(e.maxHp + 1, e.group.position.clone(), new THREE.Vector3(0.53, 0, -0.85), false);
    assert.equal(morreu, true, 'pré-condição: o dano mata');
    let minY = Infinity, forDaPlanta = 0;
    for (let i = 0; i < 3 * 60; i++) {
      E.update(1 / 60, i / 60);
      const p = e.group.position;
      minY = Math.min(minY, p.y);
      if (!naPlanta(T.NI, T.cx, T.cz, p.x, p.z)) forDaPlanta++;
    }
    const p = e.group.position;
    assert.ok(minY >= T.Y2 - 0.01, `o corpo afundou ${(T.Y2 - minY).toFixed(2)} m abaixo do piso do andar (atravessou a laje)`);
    assert.equal(forDaPlanta, 0, `o corpo passou ${forDaPlanta} quadros fora do andar (fachada/poço) — ` +
      `terminou em (${(p.x - T.cx).toFixed(2)}, ${(p.y - T.gy).toFixed(2)}, ${(p.z - T.cz).toFixed(2)})`);
    assert.ok(e.group.scale.y > HUMANO * 0.99, `o corpo sumiu (escala ${e.group.scale.y.toFixed(3)}) — morte que some parece que não morreu`);
    assert.equal(e.alive, false);
  });
});

describe('Executivo morto na beira do poço', () => {
  it('jogado para o poço, o corpo fica na laje (a borda sul do poço não tem grade)', async () => {
    const T = await torre();
    const camp = T.mundo.plano.campsNexus[0];
    const { E, THREE } = await sistema({ paredes: T.paredes, camps: [camp], heightAt: T.heightAt,
      player: { x: T.cx + 3, y: T.Y2, z: T.cz + 6 } });
    const e = E.list[0];
    e.group.position.set(T.cx - 7.8, T.Y2, T.cz + T.NI.zBot + 0.3); // no apron, junto do lance A
    e.damage(e.maxHp + 1, e.group.position.clone(), new THREE.Vector3(0, 0, -1), false); // jogado para o norte
    let fora = 0;
    for (let i = 0; i < 3 * 60; i++) {
      E.update(1 / 60, i / 60);
      const p = e.group.position;
      if (!naPlanta(T.NI, T.cx, T.cz, p.x, p.z)) fora++;
    }
    assert.equal(fora, 0, `o corpo passou ${fora} quadros sobre o poço da escada (parado no ar ou dentro do lance)`);
  });
});

describe('Corpo não atravessa parede', () => {
  /* o guarda da laje segura o executivo pela PLANTA (a laje acaba na
     fachada); este caso isola a parede: soldado comum, chão plano, parede
     de fundo da cabana (pecasCabana) e o corpo jogado contra ela */
  it('soldado morto colado na parede da cabana cai do lado de cá', async () => {
    const { P } = await mundoReal();
    const cab = P.pecasCabana(0, 0, 0, false);
    const fundo = P.caixaDaPeca(cab[1]);
    assert.ok(fundo.y1 - fundo.y0 > 2.6 && fundo.z1 - fundo.z0 < 0.3, 'pré-condição: peça é a parede de fundo');
    const THREE = await import('three');
    const U = await importar('utils.js');
    const { createEnemies } = await importar('enemies.js');
    const S = await comEstruturas(cab.filter(p => p.solida).map(p => P.caixaDaPeca(p)));
    const jog = { pos: new THREE.Vector3(0, 0, 40), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
    const E = createEnemies({
      CFG: { ENEMY_COUNT: 1, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randMeio, TAU: U.TAU,
      _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: () => 0, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
      WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
      scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player: jog,
      playerDamage() {}, addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
      Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
      Chars: null, state: { flying: false } });
    const e = E.list[0];
    e.group.position.set(0, 0, fundo.z0 - 0.5); // do lado de fora, colado no fundo
    e.damage(999, e.group.position.clone(), new THREE.Vector3(0, 0, 1), false); // jogado para dentro da parede
    let passou = 0;
    for (let i = 0; i < 90; i++) { E.update(1 / 60, i / 60); if (e.group.position.z > fundo.z0) passou++; }
    assert.equal(passou, 0, `o corpo passou ${passou} quadros do outro lado da parede (z ${e.group.position.z.toFixed(2)} × face ${fundo.z0.toFixed(2)})`);
  });
});

describe('Executivo não renasce à vista (regra do Left 4 Dead: nasce onde ninguém vê)', () => {
  it('com o jogador olhando o posto, ou perto da torre, não volta; longe e sem visada, volta no posto', async () => {
    const T = await torre();
    const camp = T.mundo.plano.campsNexus[0];
    const perto = { x: T.cx - 2, y: T.Y2, z: T.cz + 4 };
    const { E, P, THREE, S } = await sistema({ paredes: T.paredes, camps: [camp], heightAt: T.heightAt, player: perto });
    const e = E.list[0];
    e.damage(e.maxHp + 1, e.group.position.clone(), new THREE.Vector3(0, 0, -1), false);
    // pré-condição: dali o jogador VÊ o posto (nenhuma caixa entre o olho e a cabeça do posto)
    const olho = { x: perto.x, y: perto.y + 1.62, z: perto.z };
    const cabeca = { x: camp.x, y: camp.floorY + 1.5, z: camp.z };
    assert.ok(!S.walls.some(w => cruzaCaixa(olho, cabeca, w)), 'pré-condição: o jogador vê o posto');
    let tt = 0, ondeVoltou = null;
    const rodar = s => {
      for (let i = 0; i < s * 60; i++) {
        const antes = e.alive; tt += 1 / 60; E.update(1 / 60, tt);
        if (!antes && e.alive && !ondeVoltou) ondeVoltou = e.group.position.clone();
      }
    };
    rodar(40);
    assert.equal(e.alive, false, 'renasceu na frente do jogador (40 s olhando o posto)');

    // colado na torre, do lado de fora: a fachada tampa, mas é a briga — ainda não
    const fora = { x: T.cx, z: T.cz + 20 };
    P.pos.set(fora.x, T.heightAt(fora.x, fora.z), fora.z);
    const olhoFora = { x: fora.x, y: P.pos.y + 1.62, z: fora.z };
    assert.ok(S.walls.some(w => cruzaCaixa(olhoFora, cabeca, w)), 'pré-condição: de fora a fachada tampa o posto');
    rodar(40);
    assert.equal(e.alive, false, 'renasceu com o jogador a 20 m da torre');

    // longe da torre: renasce, no posto, no piso do andar
    const longe = { x: T.cx + 150, z: T.cz + 150 };
    P.pos.set(longe.x, T.heightAt(longe.x, longe.z), longe.z);
    rodar(15);
    assert.equal(e.alive, true, 'não renasceu com o jogador a 200 m e sem visada');
    assert.ok(Math.hypot(ondeVoltou.x - camp.x, ondeVoltou.z - camp.z) < 0.2, 'renasceu fora do posto');
    assert.ok(Math.abs(ondeVoltou.y - camp.floorY) < 0.1, 'renasceu fora do andar');
  });

  it('guarda da base (posto a céu aberto): a 100 m olhando, não volta; além da névoa, volta', async () => {
    const R = await mundoReal();
    const { t, mundo } = R;
    const base = mundo.plano.bases[0];
    const g0 = base.guardas[0];
    const camp = { x: g0.x, z: g0.z, army: true };
    const cabeca = { x: g0.x, y: t.heightAt(g0.x, g0.z) + 1.5, z: g0.z };
    // um ponto a ~100 m com visada livre de verdade: nenhuma caixa e o relevo abaixo da reta
    const livre = (o) => !R.paredes.some(w => cruzaCaixa(o, cabeca, w)) &&
      [...Array(300).keys()].every(i => { const f = (i + 1) / 301;
        const x = o.x + (cabeca.x - o.x) * f, z = o.z + (cabeca.z - o.z) * f;
        return o.y + (cabeca.y - o.y) * f > t.heightAt(x, z) + 0.05; });
    let ponto = null;
    for (let a = 0; a < 64 && !ponto; a++) {
      const x = g0.x + Math.cos(a / 64 * Math.PI * 2) * 100, z = g0.z + Math.sin(a / 64 * Math.PI * 2) * 100;
      const o = { x, y: t.heightAt(x, z) + 1.62, z };
      if (livre(o)) ponto = o;
    }
    assert.ok(ponto, 'pré-condição: existe um ponto a 100 m que vê o posto');
    const THREE = await import('three');
    const U = await importar('utils.js');
    const { createEnemies } = await importar('enemies.js');
    const S = await comEstruturas(R.paredes);
    S.enemyCamps = [camp];
    const P = { pos: new THREE.Vector3(ponto.x, ponto.y - 1.62, ponto.z), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
    const E = createEnemies({
      CFG: { ENEMY_COUNT: 0, WORLD_SIZE: 1100, VIEW_DIST: 420 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randMeio, TAU: U.TAU,
      _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: t.heightAt, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
      WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
      scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player: P,
      playerDamage() {}, addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
      Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
      Chars: null, state: { flying: false } });
    const e = E.list[0];
    e.damage(999, e.group.position.clone(), new THREE.Vector3(1, 0, 0), false);
    let tt = 0;
    const rodar = s => { for (let i = 0; i < s * 60; i++) { tt += 1 / 60; E.update(1 / 60, tt); } };
    rodar(40);
    assert.equal(e.alive, false, 'o guarda renasceu com o jogador olhando o posto a 100 m');
    const longe = { x: g0.x + 450, z: g0.z };
    P.pos.set(longe.x, t.heightAt(longe.x, longe.z), longe.z);
    rodar(15);
    assert.equal(e.alive, true, 'o guarda não renasceu com o jogador além da névoa (450 m)');
  });

  it('soldado comum (sem posto) segue o ciclo de sempre: renasce longe, em 7–12 s', async () => {
    const THREE = await import('three');
    const U = await importar('utils.js');
    const { createEnemies } = await importar('enemies.js');
    const S = await comEstruturas([]);
    const P = { pos: new THREE.Vector3(0, 0, 0), vel: new THREE.Vector3(), dead: false, crouchT: 0 };
    const E = createEnemies({
      CFG: { ENEMY_COUNT: 1, WORLD_SIZE: 1100 }, clamp: U.clamp, lerp: U.lerp, damp: U.damp, rand: randMeio, TAU: U.TAU,
      _v1: U._v1, _v2: U._v2, _v3: U._v3, heightAt: () => 0, slopeAt: () => 0, terrainNormal: (x, z, o) => o.set(0, 1, 0),
      WATER_LEVEL: -50, obstaclesNear: () => [], SFX: { enemyShot() {} }, FX: { spawnTracer() {}, burst() {} },
      scene: new THREE.Scene(), csmMat: m => m, Structures: S, addScore() {}, addKillFeed() {}, player: P,
      playerDamage() {}, addTrauma() {}, Car: { speedKmh: () => 0, group: { position: new THREE.Vector3(1e6, 0, 1e6) } },
      Pickups: { drop() {} }, knuckleMat: new THREE.MeshStandardMaterial(), lastShotInfo: { pos: new THREE.Vector3(), t: -99 },
      Chars: null, state: { flying: false } });
    const e = E.list[0];
    e.damage(999, e.group.position.clone(), new THREE.Vector3(1, 0, 0), false);
    let tt = 0, voltou = -1;
    for (let i = 0; i < 20 * 60 && voltou < 0; i++) { tt += 1 / 60; E.update(1 / 60, tt); if (e.alive) voltou = tt; }
    assert.ok(voltou > 7 && voltou < 13.6, `soldado comum mudou de ciclo: voltou em ${voltou.toFixed(2)} s`);
  });
});

describe('Executivo fica na laje do andar dele', () => {
  it('perseguindo quem está na escada abaixo, não entra no poço nem afunda no lance', async () => {
    const T = await torre();
    const camps = T.mundo.plano.campsNexus.slice(0, 2); // o par do andar da placa 3
    const NI = T.NI;
    const xA = T.cx + (NI.xA0 + NI.xA1) / 2, z = T.cz + NI.zBot - 0.4;
    const yA = T.gy + NI.fh + 0.2; // base do lance A do 2º lance de escada (medido no jogo: 159 quadros no poço)
    let noPoco = 0, pior = 0, casos = 0;
    for (const semente of [1, 2, 3, 4, 5]) {
      const { E, P } = await sistema({ paredes: T.paredes, camps, heightAt: T.heightAt, player: { x: xA, y: yA, z },
        rand: lcg(semente * 99991) });
      for (const e of E.list) { e.fsm = 'PERSEGUIR'; e.lastKnown.copy(P.pos); e.losT = -99; }
      let tt = 0;
      for (let i = 0; i < 12 * 60; i++) {
        tt += 1 / 60; E.update(1 / 60, tt);
        for (const e of E.list) {
          const p = e.group.position;
          if (!naPlanta(NI, T.cx, T.cz, p.x, p.z)) noPoco++;
          pior = Math.max(pior, Math.abs(p.y - e.plan.floorY));
        }
      }
      casos++;
    }
    assert.equal(casos, 5);
    assert.equal(noPoco, 0, `os executivos passaram ${noPoco} quadros fora da laje (no poço da escada), em 5 sorteios`);
    assert.ok(pior <= 0.07, `o executivo saiu ${pior.toFixed(2)} m do piso do andar`);
  });
});
