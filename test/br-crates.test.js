/* ================================================================
   QA — baús do BR: modelo novo (tampa/fechadura) e placement fora de
   parede (não nascem DENTRO de estrutura). Porta própria 3262.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

describe('Baús do BR — modelo e placement', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  const PORT = 3262;

  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT });
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it('todo baú tem o modelo novo (tampa com dobradiça, fechadura que brilha, tesouro dentro)', async () => {
    const r = await h.play(() => {
      const crates = window.__BR_debug.crates;
      let semLid = 0, semGlow = 0, semLoot = 0;
      for (const c of crates) {
        if (!c.lid || typeof c.lid.rotation !== 'object') semLid++;
        if (!c.glow || typeof c.glow.emissiveIntensity !== 'number') semGlow++;
        if (!c.loot || (!c.opened && !c.loot.visible)) semLoot++;
      }
      return { total: crates.length, semLid, semGlow, semLoot };
    });
    assert.ok(r.total >= 34, `poucos baús (${r.total})`);
    assert.equal(r.semLid, 0, `${r.semLid} baús sem tampa articulada`);
    assert.equal(r.semGlow, 0, `${r.semGlow} baús sem fechadura/brilho`);
    assert.equal(r.semLoot, 0, `${r.semLoot} baús sem pilha de tesouro visível`);
  });

  it('baú aberto mostra o INTERIOR saqueado: tampa gira, tesouro some, brilho apaga', async () => {
    // abre um baú pelo protocolo REAL (host → servidor → broadcast chestOpened)
    const key = await h.play(() =>
      window.__BR_debug.crates.find(c => c.key.startsWith('c') && !c.opened).key);
    await new Promise((res, rej) => host.timeout(5000).emit('openChest', { key },
      (e, d) => (e || !d || !d.ok) ? rej(new Error('openChest falhou: ' + (e || JSON.stringify(d)))) : res()));
    await new Promise(r => setTimeout(r, 500)); // broadcast chega no cliente
    const r = await h.play(k => {
      const c = window.__BR_debug.crates.find(c => c.key === k);
      return { opened: c.opened, lidX: c.lid.rotation.x, lootVisible: c.loot.visible, glow: c.glow.emissiveIntensity };
    }, key);
    assert.equal(r.opened, true, 'cliente não marcou o baú como aberto');
    assert.ok(r.lidX < -0.8, `tampa não girou (rotation.x=${r.lidX})`);
    assert.equal(r.lootVisible, false, 'pilha de tesouro continuou visível depois de saqueado');
    assert.ok(r.glow < 0.3, `brilho não apagou (${r.glow})`);
  });

  it('nenhum baú nasce DENTRO de parede (placement empurrado pra fora)', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      let worst = 0, worstKey = null, checked = 0;
      for (const c of window.__BR_debug.crates) {
        if (c.g.position.y > 20) continue;            // torre/boss em laje: fora do teste de chão
        checked++;
        const y = MP.heightAt(c.x, c.z);
        const p = { x: c.x, y: y + 0.3, z: c.z };
        G.Structures.collide(p, 0.45, 0.6);           // oráculo: empurra pra fora de parede
        const push = Math.hypot(p.x - c.x, p.z - c.z);
        if (push > worst) { worst = push; worstKey = c.key; }
      }
      return { worst: +worst.toFixed(2), worstKey, checked };
    });
    assert.ok(r.checked > 0, 'nenhum baú de chão pra checar');
    assert.ok(r.worst < 0.4, `baú "${r.worstKey}" ainda dentro de parede (empurra ${r.worst} m)`);
  });

  it('o baú do heliponto (torre) segue no telhado (y>20) e fechado', async () => {
    const crate = await h.play(() => {
      const c = window.__BR_debug.crates.find(c => c.key === 'torre');
      return c ? { y: c.g.position.y, opened: c.opened } : null;
    });
    assert.ok(crate, 'baú da torre sumiu');
    assert.ok(crate.y > 20, `baú da torre no chão (y=${crate.y})`);
    assert.equal(crate.opened, false);
  });
});
