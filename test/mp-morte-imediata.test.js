/* ================================================================
   A MORTE CHEGA AO SERVIDOR NA HORA (auditoria MP 338d153, MQ-1).
   O cliente da vítima só mandava o `died` 3,6 s depois de zerar a vida
   (setTimeout do __MP_respawn): até lá o servidor e os outros a tinham
   viva, o boneco ficava EM PÉ na tela de todos, o killfeed e o "kill"
   de quem atirou atrasavam 3,5 s e o atirador seguia descarregando —
   o "lag" que se sente no PvP. A câmera lenta da vítima continua com
   os 3,6 s dela; e se a morte encerra a partida, o placar do perdedor
   espera a câmera lenta acabar (não corta a encenação na hora).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const conectar = async (port, nick) => {
  const s = io(`http://localhost:${port}`, { transports: ['websocket'] });
  await new Promise(resolve => s.once('init', resolve));
  s.emit('hello', { nick });
  return s;
};

/* página na partida com a vida baixa, o anfitrião (bot do harness) do lado,
   e os ganchos de morte REAIS de volta (o harness os neutraliza) */
async function prepararVitima(h, host) {
  const victim = await h.play(() => {
    window.QA.reset(30, 30);
    const P = window.QA.MP.player;
    P.health = 10; P.armor = 0; P.invulnUntil = 0; P.lastDamageCause = null;
    window.__MP_respawn = window.__QA_originalRespawn;
    if (window.__QA_originalDied) window.__MP_died = window.__QA_originalDied;
    return { id: window.__MP_init.id, pos: P.pos.toArray() };
  });
  host.emit('state', {
    pos: [victim.pos[0] + 2, victim.pos[1], victim.pos[2]], rotY: 0,
    heldWeapon: 'FUZIL', fall: false, ship: false,
  });
  await sleep(300);
  return victim;
}
const tiroLetal = (host, victim) => host.emit('shotHit', {
  targetId: victim.id, dmg: 20, weapon: 'FUZIL',
  fromPos: [victim.pos[0] + 2, victim.pos[1] + 1.5, victim.pos[2]],
});

describe('Morte online — o servidor sabe na hora', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, terceiro;
  const PORT = 3696;
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    // um terceiro vivo: a morte da página NÃO encerra a partida neste caso
    terceiro = await conectar(PORT, 'Terceiro');
    host = await startBRMatch(h, { serverPort: PORT });
  });
  after(async () => {
    if (host) host.close();
    if (terceiro) terceiro.close();
    if (h) await h.close();
  });

  it('do tiro letal ao `playerKilled` nos outros: menos de 1,5 s (era ≥ 3,6 s)', async () => {
    const victim = await prepararVitima(h, host);
    const killed = new Promise((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('morte não foi reportada em 8 s')), 8000);
      host.on('playerKilled', d => { if (d.victimId === victim.id) { clearTimeout(to); resolve(Date.now()); } });
    });
    const t0 = Date.now();
    tiroLetal(host, victim);
    const dt = (await killed) - t0;
    assert.ok(dt < 1500, `playerKilled chegou ${dt} ms depois do tiro letal`);
    // e a encenação da vítima segue: câmera lenta ainda no ar logo depois
    const morto = await h.play(() => window.__game.player.dead);
    assert.equal(morto, true);
  });
});

describe('Morte que encerra a partida — o perdedor vê a própria queda antes do placar',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, host;
    const PORT = 3698;
    before(async () => {
      h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
      host = await startBRMatch(h, { serverPort: PORT });
    });
    after(async () => {
      if (host) host.close();
      if (h) await h.close();
    });

    it('o `matchEnd` chega na hora, mas o FIM DE PARTIDA só aparece ~3,6 s depois da morte', async () => {
      const victim = await prepararVitima(h, host);
      const fim = new Promise(resolve => host.once('matchEnd', () => resolve(Date.now())));
      tiroLetal(host, victim);
      await h.page.waitForFunction('window.__game.player.dead === true', { timeout: 3000 });
      const tMorte = Date.now();
      const tFim = await fim;
      assert.ok(tFim - tMorte < 1500, `matchEnd ${tFim - tMorte} ms depois da morte`);
      const placarNaTela = () => h.play(() => [...document.querySelectorAll('.brTitle')]
        .some(e => e.offsetParent !== null && /FIM DE PARTIDA/.test(e.textContent)));
      await sleep(Math.max(0, tMorte + 2500 - Date.now()));
      assert.equal(await placarNaTela(), false, 'o placar cortou a câmera lenta da morte');
      await sleep(Math.max(0, tMorte + 5500 - Date.now()));
      assert.equal(await placarNaTela(), true, 'o placar não apareceu depois da câmera lenta');
    });
  });
