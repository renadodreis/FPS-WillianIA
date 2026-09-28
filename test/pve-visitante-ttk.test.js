/* ================================================================
   VISITANTE — "o ET está muito forte pra matar ele" (relato do dono).

   TTK medido contra o `damage()` DE VERDADE do Visitante (js/alien.js),
   com os números DE VERDADE do arsenal (js/weapons.js: dano, cadência,
   pente, recarga) — nada copiado para cá.

   Modelo do atirador: fogo contínuo na cadência da arma, 80 % dos
   projéteis acertam o CORPO (sem cabeça: é o piso, e no celular quase
   ninguém tira cabeça de um alvo que teleporta), recarga cheia quando o
   pente esvazia. Esse é o mesmo modelo dos dois modos: no solo o tiro é
   hitscan com `gun.dmg`; no BR a bala nasce com `dmg: gun.dmg`
   (br-game.js, __BR_ballistics) — corpo ×1 nos dois.

   META (decisão desta rodada, A CONFIRMAR COM O DONO — ver js/alien.js):
   fuzil a 80 % no corpo derruba o Visitante em 5–8 s, recargas incluídas.
   Referência de gênero: chefes de BR ficam entre 2,5× e ~12× a vida
   efetiva de um jogador (Fortnite: Brutus 400 escudo + 100 vida contra
   200 do jogador; os mais duros até ~2 500) — aqui o "jogador" de
   referência é o soldado comum, 100 de vida.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { comEstruturas, randMeio, importar } = require('./helpers/pve-mundo');

async function arsenalReal() {
  const THREE = await import('three');
  const { createWeapons } = await importar('weapons.js');
  const { arsenal } = createWeapons({ camera: new THREE.PerspectiveCamera() });
  const por = nome => {
    const w = arsenal.find(a => a.name.startsWith(nome));
    assert.ok(w, `arma ${nome} sumiu do arsenal`);
    return w;
  };
  return { FUZIL: por('FUZIL'), ESCOPETA: por('ESCOPETA "TROVÃO"'), DMR: por('DMR'), PLASMA: por('PLASMA'),
    SNIPER: por('SNIPER'), RAJADA: por('ESCOPETA "RAJADA"') };
}

async function visitante(dano = null, player = null, state = null, rand = null) {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createAlien } = await importar('alien.js');
  const S = await comEstruturas([]);
  return createAlien({
    rand: rand || randMeio, TAU: U.TAU, _v1: U._v1, _v2: U._v2, heightAt: () => 0, biomeAt: () => -1, WATER_LEVEL: -50,
    CITY: { x: 9999, z: 9999 }, SFX: { roar() {}, bossShot() {}, victory() {} }, FX: { burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, addScore() {}, addKillFeed() {}, showBanner() {}, unlockWeapon() {},
    state: state || { gameTime: 0 }, player: player || { pos: new THREE.Vector3(), dead: false },
    playerDamage: dano || (() => {}),
    Bosses: [], Pickups: { drop() {} }, MFlags: {}, setTimeScale() {}, Structures: S, Chars: null,
  });
}

/* segundos até a bala que mata; acerto distribuído sem sorteio (80 % exatos) */
async function ttk(arma, acerto = 0.8) {
  const A = await visitante();
  const THREE = await import('three');
  const pos = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, 1);
  const intervalo = 60 / arma.rpm;
  let t = 0, pente = arma.magSize, projeteis = 0, acertos = 0, disparos = 0;
  while (A.alive) {
    if (pente === 0) { t += arma.reloadTime; pente = arma.magSize; }
    pente--; disparos++;
    for (let p = 0; p < arma.pellets; p++) {
      projeteis++;
      if (Math.floor(projeteis * acerto) > Math.floor((projeteis - 1) * acerto)) {
        acertos++;
        A.damage(arma.dmg, pos, dir, 'body');
      }
    }
    if (!A.alive) break;
    t += intervalo;
    assert.ok(t < 600, 'não morreu em 10 min — o modelo quebrou');
  }
  return { s: +t.toFixed(2), disparos, acertos, vida: A.state.hpMax };
}

/* O DUELO (critério P1, docs/mobile/criterio-aaa.md): o tempo que o
   Visitante DE VERDADE (update + orbes de js/alien.js) leva para matar um
   jogador parado, de frente, a `dist` m — sem colete, 100 de vida. O laudo
   validacao-070502f.md mediu no jogo o jogador morrendo ANTES do Visitante
   (5,4–7,3 s contra 7,74–7,84 s do fuzil): este caso só media o lado do fuzil,
   e a pergunta do dono é quem cai primeiro. */
async function ttkNoJogador(dist = 20, semente = null, ms = 60000) {
  const THREE = await import('three');
  let recebido = 0;
  const player = { pos: new THREE.Vector3(), dead: false, vel: new THREE.Vector3(), onGround: true };
  const state = { gameTime: 0, flying: false, driving: false };
  // semente null = sorteio MÉDIO (randMeio: pior caso, os orbes não se espalham ao acaso)
  let x = semente >>> 0;
  const rng = semente === null ? null : (a, b) => { x = (x * 1664525 + 1013904223) >>> 0; return a + (x / 4294967296) * (b - a); };
  const A = await visitante((d) => { recebido += d; }, player, state, rng);
  const p0 = A.pos();
  player.pos.set(p0.x + dist, 0, p0.z);
  const dt = 1 / 60;
  let t = 0;
  // jogador PARADO (o cenário da régua): o Visitante anda/teleporta, ele não
  while (recebido < 100 && t < ms / 1000) {
    t += dt; state.gameTime = t;
    A.update(dt, t);
  }
  return recebido >= 100 ? +t.toFixed(2) : Infinity;
}

describe('Visitante — tempo para matar com as armas do jogo', () => {
  it('fuzil a 80 % no corpo derruba em 5–8 s (meta), e o Visitante continua chefe', async () => {
    const W = await arsenalReal();
    const tabela = {};
    for (const [nome, arma] of Object.entries(W)) tabela[nome] = await ttk(arma);
    console.log('TTK do Visitante (80 % no corpo, recargas incluídas):');
    for (const [nome, r] of Object.entries(tabela))
      console.log(`  ${nome.padEnd(8)} ${String(r.s).padStart(6)} s  ${r.disparos} disparos  vida ${r.vida}`);
    const f = tabela.FUZIL;
    assert.ok(f.s <= 8, `fuzil leva ${f.s} s (${f.disparos} disparos) para derrubar o Visitante — meta ≤ 8 s`);
    assert.ok(f.s >= 5, `fuzil derruba em ${f.s} s — abaixo de 5 s deixa de ser chefe`);
    assert.ok(f.vida >= 10 * 100, `vida ${f.vida}: menos de 10× um soldado comum não é chefe`);
    // a ordem do arsenal se mantém: plasma (a arma do próprio Visitante) é a mais rápida do rifle pra cima
    assert.ok(tabela.PLASMA.s < f.s, 'plasma deixou de ser mais rápido que o fuzil');
  });

  it('P1: no duelo a 20 m, o fuzil a 80 % derruba o Visitante ANTES de ele matar o jogador parado', async () => {
    const W = await arsenalReal();
    const f = await ttk(W.FUZIL);
    const pior = await ttkNoJogador(20, null);
    const amostras = [];
    for (let k = 1; k <= 20; k++) amostras.push(await ttkNoJogador(20, k * 7919));
    amostras.sort((a, b) => a - b);
    const mediana = amostras[10], minimo = amostras[0];
    console.log(`  [duelo 20 m] fuzil derruba o Visitante em ${f.s} s (${f.disparos} disparos) · Visitante mata o jogador: ` +
      `sorteio médio ${pior} s; 20 sementes mín ${minimo} s, mediana ${mediana} s`);
    assert.ok(f.s < pior, `o Visitante vence o duelo (sorteio médio): mata em ${pior} s e o fuzil leva ${f.s} s`);
    assert.ok(f.s < minimo, `o Visitante vence o duelo em alguma semente: mata em ${minimo} s e o fuzil leva ${f.s} s`);
    assert.ok(f.disparos <= 60, `mais de 2 pentes do fuzil (${f.disparos} disparos) — P1(b)`);
  });
});
