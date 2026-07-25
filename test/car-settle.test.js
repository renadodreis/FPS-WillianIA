/* Assentamento dos veículos em seeds diferentes: ninguém nasce enterrado,
   flutuando ou ejetado — e a travessia cidade↔campo não dá salto visual.
   O apoio é medido nas RODAS físicas (raycast), não no Box3 do modelo. */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

function settleChecks(h) {
  return h.play(() => {
    const QA = window.QA, G = QA.G, world = QA.MP.world;
    QA.tick(360); // 6 s de física: tudo assenta
    const parked = G.Car.vehicles.map(v => {
      const up = v.chassisBody.quaternion.vmult(
        new (Object.getPrototypeOf(v.chassisBody.position).constructor)(0, 1, 0));
      return {
        tipo: v.cfg.name,
        rig: v.wheelRigStatus,
        upY: +up.y.toFixed(3),
        vel: +v.chassisBody.velocity.length().toFixed(3),
        finito: [v.chassisBody.position.x, v.chassisBody.position.y, v.chassisBody.position.z,
          v.chassisBody.quaternion.x, v.chassisBody.quaternion.w,
          ...v.vehicle.wheelInfos.map(w => w.suspensionLength)].every(Number.isFinite),
        sleepState: v.chassisBody.sleepState,
        sleepingState: v.chassisBody.constructor.SLEEPING,
        suspensaoAtiva: world.hasEventListener('preStep', v.vehicle.preStepCallback),
        bodyNoWorld: world.bodies.includes(v.chassisBody),
        rodas: v.vehicle.wheelInfos.map(w => ({
          contato: !!w.raycastResult.body,
          susp: +w.suspensionLength.toFixed(3),
          apoio: +(w.worldTransform.position.y - w.raycastResult.hitPointWorld.y - w.radius).toFixed(3),
        })),
      };
    });

    // A retomada precisa ser síncrona: a suspensão volta antes do próximo
    // world.step e usa exatamente o callback criado pelo RaycastVehicle.
    const byWake = G.Car.vehicles[0];
    const wakeCallback = byWake.vehicle.preStepCallback;
    byWake.chassisBody.wakeUp();
    const wakeUp = {
      awake: byWake.chassisBody.sleepState === byWake.chassisBody.constructor.AWAKE,
      callbackMesmo: byWake.vehicle.preStepCallback === wakeCallback,
      suspensaoAtiva: world.hasEventListener('preStep', wakeCallback),
      bodyNoWorld: world.bodies.includes(byWake.chassisBody),
    };

    const bySetCur = G.Car.vehicles[1];
    const setCurCallback = bySetCur.vehicle.preStepCallback;
    G.Car.setCur(bySetCur);
    const setCur = {
      selecionado: G.Car.group === bySetCur.group,
      awake: bySetCur.chassisBody.sleepState === bySetCur.chassisBody.constructor.AWAKE,
      callbackMesmo: bySetCur.vehicle.preStepCallback === setCurCallback,
      suspensaoAtiva: world.hasEventListener('preStep', setCurCallback),
      bodyNoWorld: world.bodies.includes(bySetCur.chassisBody),
    };

    // O multiplayer escreve pose direto no body. A API precisa acordá-lo e
    // invalidar o AABB ANTES da escrita, inclusive no primeiro pacote (sem hint).
    const byRemotePose = G.Car.vehicles[2];
    const remoteCallback = byRemotePose.vehicle.preStepCallback;
    const hasWakeApi = typeof G.Car.wake === 'function';
    let remotePose = null;
    if (hasWakeApi) {
      byRemotePose.chassisBody.aabbNeedsUpdate = false;
      G.Car.wake(byRemotePose);
      byRemotePose.chassisBody.position.x += 1;
      remotePose = {
        awake: byRemotePose.chassisBody.sleepState === byRemotePose.chassisBody.constructor.AWAKE,
        callbackMesmo: byRemotePose.vehicle.preStepCallback === remoteCallback,
        suspensaoAtiva: world.hasEventListener('preStep', remoteCallback),
        aabbDirty: byRemotePose.chassisBody.aabbNeedsUpdate,
        bodyNoWorld: world.bodies.includes(byRemotePose.chassisBody),
      };
    }
    return { parked, wakeUp, setCur, hasWakeApi, remotePose };
  });
}

function assertSettled(r) {
  for (const v of r.parked) {
    assert.equal(v.rig, 'ready', `${v.tipo}: rig ${v.rig}`);
    assert.ok(v.finito, `${v.tipo}: estado não finito`);
    assert.ok(v.vel < 0.6, `${v.tipo}: ainda se movendo (${v.vel} m/s) — spawn ejetou?`);
    assert.ok(v.upY > 0.85, `${v.tipo}: tombado (up.y=${v.upY})`);
    assert.equal(v.sleepState, v.sleepingState, `${v.tipo}: body não dormiu após 6 s`);
    assert.equal(v.suspensaoAtiva, false, `${v.tipo}: callback de suspensão continuou no preStep`);
    assert.ok(v.bodyNoWorld, `${v.tipo}: hibernação removeu body/collider do world`);
    const contato = v.rodas.filter(w => w.contato);
    assert.ok(contato.length >= 3, `${v.tipo}: só ${contato.length}/4 rodas apoiadas`);
    for (const w of contato) {
      // apoio ≈ raio: nem enterrado (apoio<-0.06) nem flutuando (apoio>0.08)
      assert.ok(w.apoio > -0.06 && w.apoio < 0.08,
        `${v.tipo}: pneu a ${w.apoio}m do apoio esperado (susp=${w.susp})`);
    }
  }
  for (const [origem, resumed] of [['wakeUp()', r.wakeUp], ['setCur()', r.setCur]]) {
    if (origem === 'setCur()') assert.ok(resumed.selecionado, 'setCur() não selecionou o veículo');
    assert.ok(resumed.awake, `${origem} não acordou o body imediatamente`);
    assert.ok(resumed.callbackMesmo, `${origem} trocou a identidade do preStepCallback`);
    assert.ok(resumed.suspensaoAtiva, `${origem} não reinstalou a suspensão imediatamente`);
    assert.ok(resumed.bodyNoWorld, `${origem} precisou reinserir o body no world`);
  }
  assert.ok(r.hasWakeApi, 'Car.wake ausente para pose remota sem remoteHint');
  assert.ok(r.remotePose.awake, 'Car.wake não acordou pose remota imediatamente');
  assert.ok(r.remotePose.callbackMesmo, 'Car.wake trocou a identidade do preStepCallback');
  assert.ok(r.remotePose.suspensaoAtiva, 'Car.wake não reinstalou a suspensão');
  assert.ok(r.remotePose.aabbDirty, 'Car.wake não invalidou o AABB antes da pose remota');
  assert.ok(r.remotePose.bodyNoWorld, 'Car.wake removeu/reinseriu o body no world');
}

for (const [seed, port] of [['99', 3173], ['7', 3180]]) {
  describe(`Veículos assentados na seed ${seed}`, { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootGame({ port, worldSeed: seed });
      await h.play(async () => { await window.QA.G.Car.ready; });
    });
    after(async () => { if (h) await h.close(); });

    it('dado o spawn, então cada carro assenta e hiberna só a suspensão', async () => {
      assertSettled(await settleChecks(h));
    });

    if (seed === '99') {
      it('dado um carro pilotado ou com dica remota viva, então a suspensão não hiberna', async () => {
        const r = await h.play(() => {
          const QA = window.QA, G = QA.G, world = QA.MP.world;
          QA.clearInput();
          G.state.driving = false;
          QA.tick(360);

          const driven = G.Car.vehicles[0];
          G.Car.setCur(driven);
          G.state.driving = true;
          QA.tick(240);
          const drivenState = {
            awake: driven.chassisBody.sleepState !== driven.chassisBody.constructor.SLEEPING,
            suspensaoAtiva: world.hasEventListener('preStep', driven.vehicle.preStepCallback),
          };

          G.state.driving = false;
          const remote = G.Car.vehicles[2];
          remote.remoteHint = { speed: 8, steer: 0.1, ttl: 10 };
          remote.chassisBody.wakeUp();
          QA.tick(240);
          const remoteState = {
            awake: remote.chassisBody.sleepState !== remote.chassisBody.constructor.SLEEPING,
            suspensaoAtiva: world.hasEventListener('preStep', remote.vehicle.preStepCallback),
          };
          remote.remoteHint.ttl = 0;
          QA.clearInput();
          return { drivenState, remoteState };
        });
        assert.ok(r.drivenState.awake, 'carro pilotado foi hibernado');
        assert.ok(r.drivenState.suspensaoAtiva, 'suspensão do carro pilotado foi removida');
        assert.ok(r.remoteState.awake, 'carro com dica remota viva foi hibernado');
        assert.ok(r.remoteState.suspensaoAtiva, 'suspensão do carro remoto foi removida');
      });

      it('dada uma troca física da cidade, então acorda toda a frota antes do próximo step', async () => {
        const r = await h.play(() => {
          const QA = window.QA, G = QA.G, world = QA.MP.world;
          const city = G.Structures.city;
          city.restore();
          QA.clearInput();
          G.state.driving = false;
          for (const v of G.Car.vehicles) {
            v.remoteHint = null;
            v.chassisBody.velocity.setZero();
            v.chassisBody.angularVelocity.setZero();
          }
          QA.tick(360);
          const sleepers = G.Car.vehicles.filter(v =>
            v.chassisBody.sleepState === v.chassisBody.constructor.SLEEPING &&
            !world.hasEventListener('preStep', v.vehicle.preStepCallback));
          const originalWake = G.Car.wake;
          const calls = { destroyed: [], intact: [] };
          let phase = 'destroyed';
          G.Car.wake = v => {
            calls[phase].push(G.Car.vehicles.indexOf(v));
            return originalWake(v);
          };
          let afterDestroy;
          try {
            city.destroy();
            afterDestroy = sleepers.map(v => ({
              awake: v.chassisBody.sleepState === v.chassisBody.constructor.AWAKE,
              suspension: world.hasEventListener('preStep', v.vehicle.preStepCallback),
              aabbDirty: v.chassisBody.aabbNeedsUpdate,
            }));
            phase = 'intact';
            city.restore();
          } finally {
            G.Car.wake = originalWake;
          }
          return {
            vehicleCount: G.Car.vehicles.length,
            sleeperCount: sleepers.length,
            calls,
            afterDestroy,
          };
        });
        assert.ok(r.sleeperCount > 0, 'pré-condição vazia: nenhum veículo hibernou');
        assert.deepEqual(r.calls.destroyed, [...Array(r.vehicleCount).keys()],
          'destroy() não acordou toda a frota');
        assert.deepEqual(r.calls.intact, [...Array(r.vehicleCount).keys()],
          'restore() não acordou toda a frota');
        for (const v of r.afterDestroy) {
          assert.ok(v.awake, 'carro hibernado não acordou sincronicamente no destroy()');
          assert.ok(v.suspension, 'suspensão não voltou antes da remoção dos apoios urbanos');
          assert.ok(v.aabbDirty, 'AABB não foi invalidado antes da troca física da cidade');
        }
      });
    }
  });
}

describe('Travessia cidade ↔ campo (seed 424242)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: 3193 });
    await h.play(async () => { await window.QA.G.Car.ready; window.QA.tick(240); });
  });
  after(async () => { if (h) await h.close(); });

  it('dado um esportivo saindo da cidade pro campo, então não há salto visual nem estado urbano preso', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, THREE = QA.MP.THREE;
      const v = G.Car.vehicles.find(x => x.cfg.name === 'ESPORTIVO GT');
      G.Car.setCur(v);
      // rua leste da cidade apontando pro campo (+x)
      const CITY = { x: -340, z: 130 };
      v.chassisBody.position.set(CITY.x + 55, QA.MP.heightAt(CITY.x + 55, CITY.z) + 1.3, CITY.z);
      v.chassisBody.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      v.chassisBody.velocity.set(0, 0, 0); v.chassisBody.angularVelocity.set(0, 0, 0);
      v.chassisBody.wakeUp();
      QA.tick(120); // assenta na laje da rua
      G.state.driving = true;
      G.keys.KeyW = true;
      let prevY = null, maxDropPerFrame = 0, maxX = -1e9;
      const _p = new THREE.Vector3();
      for (let i = 0; i < 420; i++) {
        QA.tick(1);
        v.group.updateMatrixWorld(true);
        v.bodyRoot.getWorldPosition(_p);
        if (prevY !== null) maxDropPerFrame = Math.max(maxDropPerFrame, Math.abs(_p.y - prevY));
        prevY = _p.y;
        maxX = Math.max(maxX, v.chassisBody.position.x);
      }
      G.keys.KeyW = false; G.state.driving = false;
      QA.clearInput();
      const distDaCidade = Math.hypot(v.chassisBody.position.x - CITY.x, v.chassisBody.position.z - CITY.z);
      return {
        maxDropPerFrame, distDaCidade, maxX: maxX - CITY.x,
        semEstadoUrbano: v.naCidade === undefined && v.modelBottomRel === undefined,
        finito: Number.isFinite(v.chassisBody.position.y),
      };
    });
    assert.ok(r.maxX > 95, `carro não cruzou a fronteira (chegou a +${r.maxX.toFixed(0)}m do centro)`);
    // descer da laje do asfalto (~0,15 m) amortecido pela suspensão: nada de salto
    assert.ok(r.maxDropPerFrame < 0.3, `salto visual na travessia: ${r.maxDropPerFrame.toFixed(2)}m num frame`);
    assert.ok(r.semEstadoUrbano, 'estado cacheado "naCidade" voltou');
    assert.ok(r.finito, 'pose não finita');
  });

  it('dado um carro na rua da cidade, então ele apoia NA LAJE do asfalto (acima do terreno)', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, THREE = QA.MP.THREE;
      const v = G.Car.vehicles.find(x => x.cfg.name === 'ESPORTIVO GT');
      // devolve pra rua (o teste anterior dirigiu ele pro campo) e deixa assentar
      const CITY = { x: -340, z: 130 };
      v.chassisBody.position.set(CITY.x + 14, QA.MP.heightAt(CITY.x + 14, CITY.z + 26) + 1.5, CITY.z + 26);
      v.chassisBody.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
      v.chassisBody.velocity.set(0, 0, 0); v.chassisBody.angularVelocity.set(0, 0, 0);
      v.chassisBody.wakeUp();
      QA.tick(300);
      /* a laje do asfalto é PLANA na altura do centro da cidade (+0,14 m); o
         terreno local ondula um pouco — compara com a cota da laje, não com
         o heightAt do ponto */
      const lajeTopo = QA.MP.heightAt(CITY.x, CITY.z) + 0.14;
      const contatos = v.vehicle.wheelInfos.map(w => ({
        contato: !!w.raycastResult.body,
        vsLaje: +(w.raycastResult.hitPointWorld.y - lajeTopo).toFixed(3),
      }));
      return { contatos };
    });
    const apoiadas = r.contatos.filter(c => c.contato);
    assert.ok(apoiadas.length >= 3, `só ${apoiadas.length}/4 rodas apoiadas na rua`);
    for (const c of apoiadas)
      assert.ok(Math.abs(c.vsLaje) < 0.1, `pneu apoiado a ${c.vsLaje}m da laje do asfalto`);
  });
});
