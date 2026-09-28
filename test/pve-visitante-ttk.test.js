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

async function visitante() {
  const THREE = await import('three');
  const U = await importar('utils.js');
  const { createAlien } = await importar('alien.js');
  const S = await comEstruturas([]);
  return createAlien({
    rand: randMeio, TAU: U.TAU, _v1: U._v1, _v2: U._v2, heightAt: () => 0, biomeAt: () => -1, WATER_LEVEL: -50,
    CITY: { x: 9999, z: 9999 }, SFX: { roar() {}, bossShot() {}, victory() {} }, FX: { burst() {} },
    scene: new THREE.Scene(), csmMat: m => m, addScore() {}, addKillFeed() {}, showBanner() {}, unlockWeapon() {},
    state: { gameTime: 0 }, player: { pos: new THREE.Vector3(), dead: false }, playerDamage() {},
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
});
