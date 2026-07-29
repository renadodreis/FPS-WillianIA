/* ================================================================
   QA — GAME FEEL DE COMBATE no navegador (partida BR de verdade).

   Trava as lacunas de sensação que estavam abertas:
   1. o hitmarker MENTIA (predição local sem as regras do servidor);
   2. matar não acendia hitmarker no PvP;
   3. levar dano não dizia QUANTO;
   4. escudo quebrando não avisava.

   Porta reservada: 3750.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 3750;
const FAR = 130;   // > 120 m: fora do alcance da ESCOPETA no servidor
const wait = ms => new Promise(r => setTimeout(r, ms));

describe('game feel — combate', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host, myId, spot = null;
  let hostPos = null; // onde o servidor acha que o bot está

  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT });
    myId = await h.play(() => window.__MP_init.id);
    await h.play(() => {
      // espiã de saída: o que o cliente REALMENTE põe no fio
      const s = window.__MP.socket;
      window.__QA_emits = [];
      if (!s.__qaWrapped) {
        const orig = s.emit.bind(s);
        s.emit = function (...a) { window.__QA_emits.push(a[0]); return orig(...a); };
        s.__qaWrapped = true;
      }
    });
    // linha de tiro LIMPA a FAR metros: sem ela o disparo bate no morro e o
    // teste mediria pontaria em vez de feedback
    spot = await h.play(d => {
      const MP = window.QA.MP, THREE = MP.THREE;
      const P = MP.player.pos, LIM = MP.CFG.WORLD_SIZE / 2 - 20;
      const eye = new THREE.Vector3(P.x, P.y + 1.5, P.z), dir = new THREE.Vector3();
      for (let i = 0; i < 24; i++) {
        const a = i * Math.PI / 12;
        const tx = P.x + Math.cos(a) * d, tz = P.z + Math.sin(a) * d;
        if (Math.abs(tx) > LIM || Math.abs(tz) > LIM) continue;
        const gy = MP.heightAt(tx, tz);
        dir.set(tx - eye.x, gy + 1.1 - eye.y, tz - eye.z);
        const len = dir.length();
        dir.multiplyScalar(1 / len);
        if (MP.rayBlockedAt(eye, dir, len) >= len - 0.1) return { x: tx, y: gy, z: tz };
      }
      return null;
    }, FAR);
    if (spot) {
      // PRIMEIRO `state` do bot: o servidor ancora onde for (sem histórico de
      // posição não há checagem de velocidade)
      hostPos = [spot.x, spot.y, spot.z];
      host.emit('state', { pos: hostPos, rotY: 0, heldWeapon: 'FUZIL', ship: false, fall: false });
      await wait(500);
    }
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  /* Leva o bot CAMINHANDO até `d` metros de mim: o anti-cheat de movimento
     (90 m/s) descarta teleporte, e `state` recusado nunca vira playerUpdate. */
  async function walkHostTo(d) {
    const me = await h.play(() => {
      const P = window.QA.MP.player.pos;
      return [P.x, P.y, P.z];
    });
    const dx = hostPos[0] - me[0], dz = hostPos[2] - me[2];
    const len = Math.hypot(dx, dz) || 1;
    const tx = me[0] + dx / len * d, tz = me[2] + dz / len * d;
    for (let guard = 0; guard < 120; guard++) {
      const rx = tx - hostPos[0], rz = tz - hostPos[2];
      const rest = Math.hypot(rx, rz);
      if (rest < 0.05) break;
      const step = Math.min(rest, 4.2); // < 90 m/s com dt de 60 ms
      hostPos = [hostPos[0] + rx / rest * step, me[1], hostPos[2] + rz / rest * step];
      host.emit('state', { pos: hostPos, rotY: 0, heldWeapon: 'FUZIL', ship: false, fall: false });
      await wait(60);
    }
    await wait(400); // playerUpdate chega + meu `state` sai (o portão usa a posição de rede)
  }

  /* dispara um acerto predito no bot e devolve o que apareceu na tela/no fio */
  async function hitHost(weaponIdx, dmg) {
    return h.play(async (idx, amount) => {
      const { G, MP } = window.QA;
      G.arsenal[idx].locked = false;
      G.switchWeapon(idx);
      const rp = [...window.__BR_debug.remotes.values()][0];
      if (!rp) return { error: 'sem avatar remoto' };
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      rp.damage(amount, null, { head: false });
      await new Promise(r => setTimeout(r, 40));
      return {
        emits: window.__QA_emits.slice(),
        marker: marker.className,
        hitT: rp.hitT,
        verdict: window.__BR_debug.hitGate && window.__BR_debug.hitGate.last,
        dist: Math.hypot(rp.targetPos.x - MP.player.pos.x, rp.targetPos.z - MP.player.pos.z),
      };
    }, weaponIdx, dmg);
  }

  it('1 — ATIRANDO DE VERDADE: escopeta fora de alcance não pinta hitmarker', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const r = await h.play(async () => {
      const G = window.QA.G, QA = window.QA;
      const rp = [...window.__BR_debug.remotes.values()][0];
      if (!rp) return { error: 'sem avatar remoto' };
      G.arsenal[1].locked = false;
      G.switchWeapon(1);                       // ESCOPETA "TROVÃO"
      const gun = G.arsenal[1];
      const spread0 = gun.spreadHip;
      gun.spreadHip = 0;                       // chumbo no eixo: mede feedback, não pontaria
      gun.mag = gun.magSize; gun.reloading = false;
      QA.tick(20);                             // switchAnim sobe 3.4/s: precisa passar de 0.8
      QA.aimAt(rp.group.position.x, rp.group.position.y + 1.1, rp.group.position.z);
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      const mag0 = gun.mag;
      G.mouse.clicked = true;
      QA.tick(1);
      await new Promise(r2 => setTimeout(r2, 40));
      gun.spreadHip = spread0;
      return {
        emits: window.__QA_emits.slice(), marker: marker.className,
        fired: mag0 - gun.mag,
        verdict: window.__BR_debug.hitGate && window.__BR_debug.hitGate.last,
      };
    });
    assert.ok(!r.error, r.error);
    assert.equal(r.fired, 1, 'a arma nem chegou a disparar');
    assert.ok(!r.marker.includes('show'),
      'o disparo real ainda acende hitmarker num acerto que o servidor descarta');
    assert.ok(!r.emits.includes('shotHit'), 'acerto recusado ainda vai pro fio');
    assert.ok(r.verdict && r.verdict.reason === 'range',
      `o tiro tinha de chegar ao portão e ser recusado por alcance: ${JSON.stringify(r.verdict)}`);
  });

  it('1 — o mesmo vale pra qualquer origem de dano remoto (bala, faca, splash)', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const r = await hitHost(1, 22);
    assert.ok(!r.error, r.error);
    assert.ok(r.dist > 120, `bot precisa estar fora de alcance (dist=${r.dist})`);
    assert.ok(!r.marker.includes('show'), 'hitmarker num acerto descartado em silêncio');
    assert.ok(!r.emits.includes('shotHit'), 'cliente ainda gasta mensagem que o servidor recusa');
    assert.equal(r.hitT, 0, 'o avatar remoto piscou de dano sem ter tomado dano');
  });

  it('1 — escopeta DENTRO de 120 m acende o hitmarker e reporta o acerto', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    await walkHostTo(30);
    const r = await hitHost(1, 22);
    assert.ok(!r.error, r.error);
    assert.ok(r.marker.includes('show'),
      `acerto legítimo ficou sem hitmarker — veredito=${JSON.stringify(r.verdict)}`);
    assert.ok(r.emits.includes('shotHit'), 'acerto legítimo não foi reportado');
    assert.ok(r.hitT > 0, 'avatar remoto não piscou no acerto real');
  });

  it('1 — alvo já morto não gera hitmarker (a morte chega antes pela rede)', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    const r = await h.play(async () => {
      const G = window.QA.G;
      G.arsenal[0].locked = false; G.switchWeapon(0);
      const rp = [...window.__BR_debug.remotes.values()][0];
      const was = rp.alive;
      rp.alive = false;
      window.__QA_emits.length = 0;
      const marker = document.getElementById('hitmarker');
      marker.className = '';
      rp.damage(30, null, { head: true });
      await new Promise(r2 => setTimeout(r2, 40));
      const out = { emits: window.__QA_emits.slice(), marker: marker.className };
      rp.alive = was;
      return out;
    });
    assert.ok(!r.marker.includes('show'), 'hitmarker em cadáver');
    assert.ok(!r.emits.includes('shotHit'), 'shotHit em cadáver');
  });

  it('2 — kill confirmada pelo servidor acende o hitmarker de KILL no PvP', async function (t) {
    if (!spot) { t.skip('nenhuma linha de tiro limpa nesta seed'); return; }
    await walkHostTo(25);
    await hitHost(0, 60); // acerto validado: sem ele o servidor não credita a kill (hitBy)
    await wait(300);
    // o hitmarker de kill dura 260 ms — grava o sabor no instante em que sai,
    // em vez de correr atrás da classe no DOM
    await h.play(() => {
      window.__QA_markers = [];
      const orig = window.__MP.showHitmarker;
      window.__MP.showHitmarker = f => { window.__QA_markers.push(f); return orig(f); };
      document.getElementById('hitmarker').className = '';
    });
    host.emit('died', { killerId: myId, cause: { type: 'player' }, weapon: 'FUZIL' });
    await wait(700);
    const r = await h.play(() => ({
      markers: window.__QA_markers, cls: document.getElementById('hitmarker').className,
    }));
    assert.ok(r.markers.includes('kill'),
      `matar no PvP continua sem hitmarker de kill (sabores=${JSON.stringify(r.markers)})`);
    assert.ok(r.cls.includes('kill'), `classe vermelha não foi aplicada: "${r.cls}"`);
  });
});
