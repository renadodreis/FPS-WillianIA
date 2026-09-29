/* ================================================================
   PvE × HELICÓPTERO no JOGO DE VERDADE — a FIAÇÃO.

   test/pve-heli.test.js prova a regra dentro de cada módulo, com um `state`
   de mentira. O que ele não pode provar é que o game.js ENTREGA o `state`
   de verdade a cada módulo: sem isso o portão fica inerte (state = null) e
   o bicho volta a morder quem está no helicóptero. Aqui é o jogo inteiro:
   o helicóptero real (Heli.tryEnter + o tick, que escreve `player.pos` no
   chão debaixo dele), os módulos criados pelo game.js, o `playerDamage`
   real. Lobo, esqueleto, soldado e Colosso — os quatro que dependem da
   fiação desta rodada (noite e Visitante já recebiam `state`).

   Controle: a mesma cena com o jogador A PÉ no mesmo ponto tem de sangrar.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

describe('Helicóptero no jogo real: nenhum PvE fere quem está nele', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 4090 }); });
  after(async () => { if (h) await h.close(); });

  async function cena(embarca, quem) {
    return h.play(async (embarca, quem) => {
      const { G, MP } = window.QA;
      const P = MP.player;
      // o helicóptero vai para um descampado perto do Colosso (o forte dele)
      const casa = G.Structures.FORT_POS;
      const hx = casa.x + 6, hz = casa.z + 34;
      const hy = MP.groundAt(hx, hz, 999);
      if (G.state.flying) G.Heli.exit();
      G.Heli.group.position.set(hx, hy + 0.05, hz);
      /* ISOLA O PORTÃO DE `state`: desde 2026-09-28 o helicóptero inteiro é
         COBERTURA (js/veiculo-vida.js) e barra a visada do PvE — com ele no
         meio, o caso "no helicóptero não" passaria pela lataria mesmo sem o
         portão (e o Colosso, a −5 m, nem alcançava o controle a pé). O que
         este arquivo mede é a fiação do `state`, não a cobertura. */
      G.Veiculos.porId('heli').inteiro = false;
      window.QA.reset(hx + 2, hz);
      P.health = P.maxHealth; P.armor = 0; P.invulnUntil = 0;
      if (embarca) {
        if (!G.Heli.tryEnter()) return { erro: 'não embarcou' };
      }
      window.QA.tick(2); // o Heli.update escreve player.pos no chão debaixo dele
      const base = P.pos.clone();
      const perto = (dx, dz) => ({ x: base.x + dx, y: MP.groundAt(base.x + dx, base.z + dz, base.y + 2), z: base.z + dz });
      let update = null;
      if (quem === 'lobo') {
        G.Animals.setEnabled(true);
        for (const a of G.Animals.list) { a.alive = true; a.group.position.set(9999, 0, 9999); }
        const lobo = G.Animals.list.find(a => a.predator);
        const p = perto(3, 0); lobo.group.position.set(p.x, p.y, p.z); lobo.biteT = 0;
        update = () => {}; // o tick já roda Animals.update
      } else if (quem === 'esqueleto') {
        const sk = G.Skeletons.list[0];
        const p = perto(3, 0);
        sk.alive = true; sk.hp = 90; sk.enabled = true; sk.group.visible = true; sk.group.position.set(p.x, p.y, p.z);
        update = (dt, t) => G.Skeletons.update(dt, t);
      } else if (quem === 'soldado') {
        const e = G.Enemies.list.find(x => !x.suit);
        for (const o of G.Enemies.list) if (o !== e) o.alive = false;
        const p = perto(12, 0);
        e.alive = true; e.health = e.maxHp; e.group.position.set(p.x, p.y, p.z);
        e.home = { x: p.x, z: p.z }; e.waypoints = [0, 1, 2, 3].map(() => ({ x: p.x, z: p.z }));
        e.yaw = Math.atan2(base.x - p.x, base.z - p.z); e.fsm = 'PATRULHA'; e.senseAcc = 1;
        update = (dt, t) => G.Enemies.update(dt, t);
      } else if (quem === 'colosso') {
        const B = G.Boss;
        B.state.alive = true; B.state.active = true; B.state.deadT = -1; B.state.nextStomp = 0;
        const p = perto(-5, 0); // o Colosso a 5 m, dentro da coleira (casa a 34 m)
        B.pos().set(p.x, p.y, p.z);
        update = (dt, t) => B.update(dt, t);
      }
      P.lastDamageCause = null;
      let minVida = P.health;
      for (let i = 0; i < 6 * 60; i++) {
        window.QA.tick(1);
        update(1 / 60, G.state.gameTime);
        minVida = Math.min(minVida, P.health);
        if (P.dead) break;
      }
      const causa = P.lastDamageCause && P.lastDamageCause.type;
      // devolve o mundo como estava
      if (G.state.flying) G.Heli.exit();
      G.Animals.setEnabled(false);
      for (const a of G.Animals.list) a.alive = false;
      G.Skeletons.list[0].group.position.set(9999, 0, 9999);
      for (const e of G.Enemies.list) e.alive = false;
      G.Boss.pos().set(casa.x, MP.groundAt(casa.x, casa.z, 999), casa.z); G.Boss.state.active = false;
      G.Veiculos.porId('heli').inteiro = true;
      P.dead = false; P.health = P.maxHealth;
      return { perdeu: +(P.maxHealth - minVida).toFixed(1), causa, voando: embarca };
    }, embarca, quem);
  }

  for (const quem of ['lobo', 'esqueleto', 'soldado', 'colosso']) {
    it(`${quem}: a pé sangra, no helicóptero não`, async () => {
      const aPe = await cena(false, quem);
      assert.ok(!aPe.erro, aPe.erro);
      assert.ok(aPe.perdeu > 0, `${quem}: controle a pé não perdeu vida (${JSON.stringify(aPe)})`);
      const noHeli = await cena(true, quem);
      assert.ok(!noHeli.erro, noHeli.erro);
      assert.equal(noHeli.perdeu, 0,
        `${quem}: perdeu ${noHeli.perdeu} de vida NO HELICÓPTERO (causa ${noHeli.causa}) — o game.js entrega o \`state\` a este módulo?`);
    });
  }
});
