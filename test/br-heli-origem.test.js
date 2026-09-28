/* ================================================================
   ACERTO A PARTIR DO HELICÓPTERO NO BR — a origem do `shotHit` é a do tiro.

   Voando, o `state` manda a posição do HELICÓPTERO (br-game.js, envio de
   10 Hz) e o tiro local sai de `Heli.group.position + (0, 1,6, 0)`
   (game.js). Mas o `shotHit` montava `fromPos` com `MP.player.pos + 1,5 m`
   — e voando `MP.player.pos` é o CHÃO debaixo do helicóptero (js/heli.js:
   "player acompanha (recentra grama/chunks)"). Acima de ~6,5 m de altura a
   origem declarada ficava a mais de 5 m da posição que o servidor tem do
   atirador: o portão do cliente e o `shotHit` do servidor (fromPos a ≤ 5 m de
   p.pos) recusavam todo acerto dado de cima.

   A âncora é o SERVIDOR REAL: o outro jogador (BotHost) recebe ou não o
   `youWereHit`. E o anti-cheat de origem continua de pé: uma origem a mais
   de 5 m de onde o servidor põe o atirador é recusada — os 5 m não mudaram.

   Porta 4053.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness.js');

const PORT = 4053;
const ALTURA = 20; // m acima do chão
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('BR — acerto dado do helicóptero chega ao servidor', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, pageId;
  const hits = [];
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '600', GAS_DEFAULT: 'off' } });
    host = await startBRMatch(h, { serverPort: PORT, flags: { golem: false } });
    host.on('youWereHit', d => hits.push(d));
    pageId = await h.play(() => window.__MP.socket.id);
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      for (let i = 0; i < 100 && !(window.__MP_remotePlayers || []).some(r => r.nick === 'BotHost'); i++) await new Promise(r => setTimeout(r, 100));
      for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
      window.QA.MP.player.invulnUntil = 1e12;
      G.arsenal[0].locked = false;
      G.switchWeapon(0);                        // FUZIL: 320 m no servidor
      window.QA.tick(20);
      // o helicóptero vem até o jogador (a posição DELE é a que o servidor
      // aceitou; levar o jogador até o heli seria teleporte recusado)
      const P = window.QA.MP.player.pos;
      G.Heli.group.position.set(P.x + 1, window.QA.MP.groundAt(P.x + 1, P.z, P.y + 5) + 0.55, P.z);
      if (!G.Heli.tryEnter()) throw new Error('não entrou no helicóptero');
    });
    // sobe no motor dele (8 m/s — o anti-teleporte vertical é 120 m/s)
    await h.play(() => { window.QA.G.keys.Space = true; });
    await h.page.waitForFunction(alt => {
      const G = window.QA.G, g = G.Heli.group.position;
      return g.y - window.QA.MP.groundAt(g.x, g.z, g.y) >= alt;
    }, { timeout: 30000 }, ALTURA);
    await h.play(() => { window.QA.G.keys.Space = false; });
    // o servidor tem de ter ACEITO o jogador lá em cima: o BotHost o vê voando
    await new Promise((resolve, reject) => {
      const to = setTimeout(() => { host.off('playerUpdate', on); reject(new Error('o servidor não aceitou o jogador no ar')); }, 10000);
      const on = d => {
        if (!d || d.id !== pageId || !d.heli) return;
        clearTimeout(to); host.off('playerUpdate', on); resolve();
      };
      host.on('playerUpdate', on);
    });
    await sleep(300);
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it(`voando a ${ALTURA} m: o acerto predito no outro jogador passa no portão E no servidor`, async () => {
    hits.length = 0;
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const rp = (window.__MP_remotePlayers || []).find(x => x.nick === 'BotHost');
      rp.damage(20, null, { head: false });
      return new Promise(res => setTimeout(() => {
        const v = window.__BR_debug.hitGate.last;
        const g = G.Heli.group.position;
        res({ ok: v.ok, reason: v.reason, originDist: +v.originDist.toFixed(2), weapon: v.weapon,
          altura: +(g.y - MP.groundAt(g.x, g.z, g.y)).toFixed(1), voando: G.state.flying });
      }, 50));
    });
    await sleep(600);
    console.log(`  [heli] ${JSON.stringify(r)}; youWereHit no outro jogador: ${hits.length}`);
    assert.equal(r.voando, true);
    assert.ok(r.altura >= ALTURA - 1, `o helicóptero desceu: ${r.altura} m`);
    assert.equal(r.ok, true, `portão do cliente recusou o acerto voando: ${r.reason}, origem a ${r.originDist} m da posição enviada`);
    assert.ok(r.originDist <= 2, `origem do acerto a ${r.originDist} m da posição que o state mandou (voando: o heli)`);
    assert.equal(hits.length, 1, 'o servidor recusou o acerto dado do helicóptero');
  });

  it('origem falsa continua recusada: o chão debaixo do heli (e 10 m ao lado) não passam no servidor', async () => {
    hits.length = 0;
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const rp = (window.__MP_remotePlayers || []).find(x => x.nick === 'BotHost');
      const g = G.Heli.group.position;
      const chao = [g.x, MP.groundAt(g.x, g.z, g.y) + 1.5, g.z];
      const lado = [g.x + 10, g.y + 1.6, g.z];
      MP.socket.emit('shotHit', { targetId: rp.id, dmg: 20, weapon: 'FUZIL', fromPos: chao });
      MP.socket.emit('shotHit', { targetId: rp.id, dmg: 20, weapon: 'FUZIL', fromPos: lado });
      return { chao: chao.map(v => +v.toFixed(1)), lado: lado.map(v => +v.toFixed(1)) };
    });
    await sleep(600);
    assert.equal(hits.length, 0, `origem forjada aceita pelo servidor: ${JSON.stringify(r)}`);
    // controle: a origem verdadeira, no mesmo instante, passa
    await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const rp = (window.__MP_remotePlayers || []).find(x => x.nick === 'BotHost');
      const g = G.Heli.group.position;
      MP.socket.emit('shotHit', { targetId: rp.id, dmg: 20, weapon: 'FUZIL', fromPos: [g.x, g.y + 1.6, g.z] });
    });
    await sleep(600);
    assert.equal(hits.length, 1, 'controle: a origem do helicóptero tinha de passar');
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
