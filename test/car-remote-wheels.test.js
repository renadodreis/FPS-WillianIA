/* Animação de rodas de carros REMOTOS no BR: dica visual derivada da pose
   validada (nunca autoridade), e lixo de rede não corrompe nada. */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

it('acorda e invalida o carro antes de escrever a primeira pose remota', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'br-game.js'), 'utf8');
  const poseWrite = src.indexOf('v.chassisBody.position.set(gp.x, gp.y, gp.z)');
  const wakeCall = src.lastIndexOf('G.Car.wake(v)', poseWrite);
  assert.ok(poseWrite >= 0, 'escrita da pose remota não encontrada');
  assert.ok(wakeCall >= 0 && poseWrite - wakeCall < 160,
    'pose remota pode mover body hibernado sem reativar suspensão/AABB antes');
});

describe('Rodas de carros remotos (BR)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, bot;
  before(async () => {
    h = await bootGame({ port: 3190 });
    bot = await startBRMatch(h, { serverPort: 3190 });
    await h.play(async () => { await window.QA.G.Car.ready; window.QA.tick(120); });
  });
  after(async () => {
    if (bot) bot.close();
    if (h) await h.close();
  });

  /* bot emite 'state' dirigindo o carro `car` e a página processa em tempo
     real (tick + espera do socket) */
  async function botDrives(frames, makeState) {
    for (let f = 0; f < frames; f++) {
      bot.emit('state', makeState(f));
      await h.play(() => new Promise(res => setTimeout(() => { window.QA.tick(4, 1 / 60); res(); }, 34)));
    }
  }

  /* O avatar do remoto entra na partida no spawn dele e o carro pode estar a
     centenas de metros. Sem PARAR nele primeiro, os quadros medidos são a
     convergência do lerp (translação pura no sentido do alvo) e não a direção —
     o cenário do teste vira outro. Assentar aqui é o que um jogador de verdade
     faz: ele ANDA até o carro antes de dirigir. */
  async function botSettlesInCar(p0) {
    await botDrives(20, () => ({ pos: [p0[0] + 3, 4.4, p0[1]], rotY: 0, car: 1, heldWeapon: 'PISTOLA' }));
  }

  it('dado um remoto dirigindo em linha reta, então as rodas do carro giram', async () => {
    const p0 = await h.play(() => {
      const v = window.QA.G.Car.vehicles[1];
      return [v.chassisBody.position.x, v.chassisBody.position.z];
    });
    await botSettlesInCar(p0);
    const before = await h.play(() => {
      const v = window.QA.G.Car.vehicles[1];
      return { rot: v.vehicle.wheelInfos.map(w => w.rotation), pos: [v.chassisBody.position.x, v.chassisBody.position.z] };
    });
    // 12 m/s pra frente (+x, yaw 0), ~2 s
    await botDrives(15, f => ({
      pos: [p0[0] + 3 + f * 12 * 0.166, 4.4, p0[1]], rotY: 0, car: 1, heldWeapon: 'PISTOLA',
    }));
    const after = await h.play(() => {
      const v = window.QA.G.Car.vehicles[1];
      return {
        rot: v.vehicle.wheelInfos.map(w => w.rotation),
        hint: v.remoteHint && { speed: +v.remoteHint.speed.toFixed(1), steer: +v.remoteHint.steer.toFixed(3) },
        pos: [v.chassisBody.position.x, v.chassisBody.position.z],
        finito: v.vehicle.wheelInfos.every(w => Number.isFinite(w.rotation)),
      };
    });
    assert.ok(Math.abs(after.pos[0] - before.pos[0]) > 5, 'carro remoto nem se moveu — teste vazio');
    assert.ok(after.hint, 'dica visual não foi criada');
    assert.ok(after.hint.speed > 4, `velocidade estimada baixa (${after.hint.speed} m/s)`);
    for (let i = 0; i < 4; i++) {
      const d = after.rot[i] - before.rot[i];
      // convenção do cannon (indexUpAxis 1): frente = rotation NEGATIVA — o
      // mesmo sentido do carro dirigido localmente
      assert.ok(d < -1, `roda ${i} do carro remoto não girou pra frente (Δ=${d.toFixed(2)})`);
    }
    assert.ok(after.finito, 'rotação não finita');
  });

  /* BURACO DE REDE ≠ MARCHA À RÉ. O avatar remoto persegue `targetPos` por
     lerp; quando abre um buraco (perda de pacote, re-ancoragem do anti-cheat
     após lag), a perseguição é translação no sentido do ALVO, não do nariz do
     carro — e virava velocidade REVERSA no teto do clamp, com as rodas do
     carro do outro girando de ré a toda durante a recuperação inteira.
     O portão antigo olhava o passo POR QUADRO (< 8 m); como o passo é
     k·buraco com k ≈ 0,18, ele só reagia a buracos acima de ~44 m e a faixa
     de 8 a 44 m passava batido. Este teste fixa a faixa que escapava. */
  it('dado um buraco de rede de dezenas de metros, então as rodas não giram de RÉ a toda', async () => {
    const p0 = await h.play(() => {
      const v = window.QA.G.Car.vehicles[1];
      return [v.chassisBody.position.x, v.chassisBody.position.z];
    });
    await botSettlesInCar(p0);
    await h.play(() => { window.__qaHint = []; });
    // 30 m PARA TRÁS com o nariz ainda em +x. O anti-cheat recusa o salto e
    // re-ancora depois de 10 recusas seguidas — exatamente o caminho real.
    for (let f = 0; f < 14; f++) {
      bot.emit('state', { pos: [p0[0] + 3 - 30, 4.4, p0[1]], rotY: 0, car: 1, heldWeapon: 'PISTOLA' });
      await h.play(() => new Promise(res => setTimeout(() => {
        window.QA.tick(4, 1 / 60);
        const v = window.QA.G.Car.vehicles[1];
        if (v.remoteHint && v.remoteHint.ttl > 0) window.__qaHint.push(v.remoteHint.speed);
        res();
      }, 34)));
    }
    const r = await h.play(() => {
      const v = window.QA.G.Car.vehicles[1];
      const vMax = (v.cfg.maxKmh || 100) / 3.6 * 1.3;
      const amostras = window.__qaHint;
      return { vMax, pior: amostras.length ? Math.min(...amostras) : 0, n: amostras.length };
    });
    assert.ok(r.pior > -r.vMax * 0.5,
      `roda girou de ré a ${r.pior.toFixed(1)} m/s (teto de ré ${(-r.vMax).toFixed(1)}) ` +
      `durante a recuperação de um buraco de rede — ${r.n} amostras`);
  });

  it('dado lixo de rede (NaN, índice fora da frota, teleporte), então nada corrompe', async () => {
    const before = await h.play(() => {
      const G = window.QA.G;
      return G.Car.vehicles.map(v => ({
        pos: [v.chassisBody.position.x, v.chassisBody.position.y, v.chassisBody.position.z],
        rot: v.vehicle.wheelInfos.map(w => w.rotation),
      }));
    });
    // NaN na pose (servidor deve derrubar), índice gigante, índice negativo,
    // float como índice e teleporte impossível no mesmo carro
    bot.emit('state', { pos: [NaN, 4, 10], rotY: 0, car: 1 });
    bot.emit('state', { pos: [10, 4, 10], rotY: 0, car: 9999 });
    bot.emit('state', { pos: [10, 4, 10], rotY: 0, car: -7 });
    bot.emit('state', { pos: [10, 4, 10], rotY: 0, car: 1.7 });
    bot.emit('state', { pos: [10, 4, 10], rotY: Infinity, car: 2 });
    await h.play(() => new Promise(res => setTimeout(() => { window.QA.tick(20, 1 / 60); res(); }, 120)));
    // teleporte gigante dentro do mesmo carro: reseta a dica em vez de girar
    bot.emit('state', { pos: [400, 4, 400], rotY: 0, car: 1 });
    await h.play(() => new Promise(res => setTimeout(() => { window.QA.tick(20, 1 / 60); res(); }, 120)));
    const after = await h.play(() => {
      const G = window.QA.G;
      return {
        estados: G.Car.vehicles.map(v => ({
          finito: [v.chassisBody.position.x, v.chassisBody.position.y, v.chassisBody.position.z,
            ...v.vehicle.wheelInfos.map(w => w.rotation)].every(Number.isFinite),
          hintOk: !v.remoteHint || (Number.isFinite(v.remoteHint.speed) && Number.isFinite(v.remoteHint.steer)),
        })),
        erros: [],
      };
    });
    for (const [i, v] of after.estados.entries()) {
      assert.ok(v.finito, `veículo ${i} corrompido por pacote inválido`);
      assert.ok(v.hintOk, `veículo ${i} com dica não finita`);
    }
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join('\n')}`);
    void before;
  });

  it('dado o remoto saindo do carro, então a dica visual morre e as rodas param', async () => {
    bot.emit('state', { pos: [30, 4, 30], rotY: 0, car: -1 });
    await h.play(() => new Promise(res => setTimeout(() => { window.QA.tick(30, 1 / 60); res(); }, 120)));
    const r = await h.play(() => {
      const v = window.QA.G.Car.vehicles[1];
      window.QA.tick(300); // o carro largado assenta de vez (o teste anterior o teleportou)
      const rot0 = v.vehicle.wheelInfos.map(w => w.rotation);
      window.QA.tick(60);
      return {
        ttl: v.remoteHint ? v.remoteHint.ttl : 0,
        dRot: v.vehicle.wheelInfos.map((w, i) => Math.abs(w.rotation - rot0[i])),
      };
    });
    assert.ok(r.ttl <= 0, `dica visual continuou viva (ttl=${r.ttl})`);
    for (const d of r.dRot) assert.ok(d < 0.05, `roda continuou girando após sair do carro (Δ=${d})`);
  });
});
