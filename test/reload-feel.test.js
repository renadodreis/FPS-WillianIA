/* ================================================================
   QA — feel de recarga (lote 3, R9): recarga cancelável ao atirar e
   escopeta cartucho-a-cartucho (incremental, cancel mantém o parcial).
   Porta própria 3265.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

describe('Recarga — cancelável + escopeta incremental', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  const PORT = 3265;
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT });
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it('atirar CANCELA a recarga (arma normal) — não fica preso o reloadTime inteiro', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, QA = window.QA;
      QA.reset(60, 60);
      G.arsenal[0].locked = false; G.switchWeapon(0); // FUZIL idx0
      const gun = G.gun;
      gun.mag = 5; gun.reserve = 100; gun.reloading = false;
      MP.justPressed.add('KeyR'); QA.tick(1);
      const started = gun.reloading;
      QA.tick(Math.round(gun.reloadTime * 60 * 0.3)); // no meio da recarga
      const midMag = gun.mag, midReloading = gun.reloading;
      G.mouse.shooting = true; QA.tick(1); // FUZIL é auto → shooting; atira → cancela
      G.mouse.shooting = false;
      const afterReloading = gun.reloading, afterMag = gun.mag;
      return { started, midMag, midReloading, afterReloading, afterMag };
    });
    assert.equal(r.started, true, 'recarga não começou');
    assert.equal(r.midReloading, true, 'recarga não estava em andamento no meio');
    assert.equal(r.midMag, 5, 'arma normal não deve encher no meio (finish só no fim)');
    assert.equal(r.afterReloading, false, 'atirar não cancelou a recarga');
    assert.equal(r.afterMag, 4, 'o tiro do cancelamento não saiu (mag devia cair de 5→4)');
  });

  it('escopeta carrega cartucho a cartucho (parcial no meio, cheio no fim)', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, QA = window.QA;
      QA.reset(60, 60);
      G.arsenal[1].locked = false; G.switchWeapon(1); // ESCOPETA TROVÃO idx1 (pump)
      const gun = G.gun;
      gun.mag = 0; gun.reserve = 20; gun.reloading = false;
      const isPump = !!gun.parts.pump;
      MP.justPressed.add('KeyR'); QA.tick(1);
      QA.tick(Math.round(gun.reloadTime * 60 * 0.55)); // ~meio
      const midMag = gun.mag;
      QA.tick(Math.round(gun.reloadTime * 60 * 0.6) + 10); // até o fim
      const endMag = gun.mag, endReloading = gun.reloading;
      return { isPump, magSize: gun.magSize, midMag, endMag, endReloading };
    });
    assert.ok(r.isPump, 'idx1 não é escopeta com bomba');
    assert.ok(r.midMag > 0 && r.midMag < r.magSize, `escopeta não carregou PARCIAL no meio (${r.midMag}/${r.magSize})`);
    assert.equal(r.endMag, r.magSize, `escopeta não encheu no fim (${r.endMag}/${r.magSize})`);
    assert.equal(r.endReloading, false, 'recarga da escopeta não terminou');
  });

  it('cancelar a recarga da escopeta MANTÉM os cartuchos já carregados', async () => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, QA = window.QA;
      QA.reset(60, 60);
      G.arsenal[1].locked = false; G.switchWeapon(1);
      const gun = G.gun;
      gun.mag = 0; gun.reserve = 20; gun.reloading = false;
      MP.justPressed.add('KeyR'); QA.tick(1);
      QA.tick(Math.round(gun.reloadTime * 60 * 0.55)); // carrega alguns
      const loaded = gun.mag;
      G.mouse.clicked = true; QA.tick(1); // atira → cancela (dispara 1)
      const afterMag = gun.mag, afterReloading = gun.reloading;
      return { loaded, afterMag, afterReloading, magSize: gun.magSize };
    });
    assert.ok(r.loaded > 0, 'não carregou nenhum cartucho antes de cancelar');
    assert.equal(r.afterReloading, false, 'não cancelou ao atirar');
    // manteve o parcial (loaded), menos o tiro do cancelamento
    assert.ok(r.afterMag >= r.loaded - 1 && r.afterMag < r.magSize, `parcial perdido (carregou ${r.loaded}, ficou ${r.afterMag})`);
  });

  it('não gerou erros de página', async () => {
    const errs = await h.play(() => window.__game.errors.slice());
    assert.deepEqual(errs, [], `erros: ${errs.join(' | ')}`);
  });
});
