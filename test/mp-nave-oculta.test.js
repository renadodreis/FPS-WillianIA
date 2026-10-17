/* ================================================================
   APP EM SEGUNDO PLANO NA NAVE — auditoria do multiplayer 338d153, MP-3.

   A aba oculta não roda rAF. A posição na cabine (`shipLocalPos`) só nascia
   no 1º quadro, e o `state` (setInterval, roda oculto) saía sem ela: o
   servidor convertia a posição do LOBBY para a cabine, achava fora, somava
   1 strike por pacote e RECUSAVA — os outros não o viam na nave (23–49
   strikes medidos). E o salto automático, que vem do watchdog sem quadro,
   saía da posição de mundo de quando a aba sumiu (~900 m da nave).

   O jogador some (janela minimizada: visibilityState hidden, sem rAF) no
   LOBBY e o anfitrião começa. Âncora independente do cliente: o que um
   observador RECEBE do servidor (`playerUpdate`, só sai de pose aceita)
   contra a pose da nave calculada aqui (ship-protocol.js, a regra do
   servidor).

   Porta 4178.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { io } = require('socket.io-client');
const { CHROME, bootGame } = require('./helpers/harness.js');
const ShipProto = require(path.join(__dirname, '..', 'ship-protocol.js'));

const PORT = 4178;
const FLY = 9;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evento = (s, ev, filtro = () => true, ms = 20000) => new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('sem ' + ev)), ms);
  const f = d => { if (filtro(d)) { clearTimeout(to); s.off(ev, f); res(d); } };
  s.on(ev, f);
});

describe('app em segundo plano durante a nave', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, dono, cdp;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false, extraEnv: { HOST_CODE: 'QA123', COUNTDOWN_S: '1', FLY_TIME: String(FLY) } });
    cdp = await h.page.target().createCDPSession();
  });
  after(async () => { if (dono) dono.close(); if (h) await h.close(); });

  it('oculto desde o lobby: o servidor aceita a posição na CABINE, e o salto automático sai de onde a nave está', async t => {
    await h.page.waitForFunction('window.__BR_debug && window.__BR_debug.S && window.__MP && window.__MP.socket && window.__MP.socket.connected', { timeout: 60000 });
    const meuId = await h.play(() => window.__MP.socket.id);
    dono = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
    const ini = await evento(dono, 'init');
    dono.emit('hello', { nick: 'Dono' });
    await new Promise((res, rej) => dono.timeout(4000).emit('claimHost', { code: 'QA123' }, (e, d) => (e || !d || !d.ok ? rej(new Error('claimHost')) : res())));
    const pulso = setInterval(() => dono.emit('state', { pos: [(ini.spawn && ini.spawn.x) || 60, 2, (ini.spawn && ini.spawn.z) || 60], rotY: 0 }), 1000);
    try {
      // o jogador troca de app no lobby
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await sleep(800);
      const oculto = await h.page.evaluate(() => document.visibilityState);
      const ups = [];
      dono.on('playerUpdate', d => { if (d && d.id === meuId) ups.push({ t: Date.now(), pos: d.pos, ship: d.ship, fall: d.fall }); });
      const comeca = evento(dono, 'matchStart');
      dono.emit('requestStart');
      const ms = await comeca;
      const offset = ms.serverNow - Date.now();
      await sleep((FLY + 4) * 1000);
      const plan = ms.plan.ship;
      const naNave = ups.filter(u => u.ship);
      const erros = naNave.map(u => {
        const pose = ShipProto.poseAt(plan, (u.t + offset - ms.t0) / 1000);
        return Math.hypot(u.pos[0] - pose.x, u.pos[2] - pose.z);
      });
      /* a 1ª pose da queda contra a ROTA da nave entre o fim do voo (o salto
         automático: o watchdog confere a cada 0,5 s) e a chegada do pacote —
         a nave do teste voa a ~130 m/s, e o pacote chega depois do salto */
      const queda = ups.find(u => u.fall);
      let erroSalto = null;
      if (queda) {
        const tq = (queda.t + offset - ms.t0) / 1000;
        erroSalto = Infinity;
        for (let tt = FLY - 0.6; tt <= tq + 0.05; tt += 0.02) {
          const pose = ShipProto.poseAt(plan, tt);
          erroSalto = Math.min(erroSalto, Math.hypot(queda.pos[0] - pose.x, queda.pos[2] - pose.z));
        }
      }
      t.diagnostic(`aba ${oculto}; poses aceitas na nave: ${naNave.length} (maior erro ${erros.length ? Math.max(...erros).toFixed(1) : '—'} m); 1ª da queda a ${erroSalto == null ? '—' : erroSalto.toFixed(1)} m da rota da nave`);
      assert.equal(oculto, 'hidden', 'cenário: a aba não ficou oculta');
      assert.ok(naNave.length >= 20, `o servidor recusou a posição na nave: ${naNave.length} poses aceitas em ${FLY} s`);
      assert.ok(Math.max(...erros) < 25, `pose aceita fora da nave: ${Math.max(...erros).toFixed(1)} m`);
      assert.ok(queda, 'o salto automático não chegou ao servidor (aba oculta)');
      assert.ok(erroSalto < 30, `o salto automático saiu a ${erroSalto.toFixed(1)} m da rota da nave`);
    } finally {
      clearInterval(pulso);
      const { windowId } = await cdp.send('Browser.getWindowForTarget');
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
    }
  });
});
