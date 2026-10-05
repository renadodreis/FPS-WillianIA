'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

describe('Helicóptero: câmera, toque e rede no jogo real', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: 4111, query: '?mobile=1',
      viewport: { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
      extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '600', GAS_DEFAULT: 'off' } });
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  it('câmera mantém posição e horizonte quando fuselagem inclina', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA, H = G.Heli;
      const update = H.update;
      // Isola câmera de perseguição: duas atitudes estáticas no mesmo ponto.
      H.update = () => {};
      G.state.flying = true;
      H.group.position.set(0, 90, 0);
      H.group.rotation.set(0, 0, 0);
      try {
        window.QA.tick(180);
        const p = MP.camera.position.clone();
        H.group.rotation.set(-0.35, 0, -0.3);
        window.QA.tick(180);
        const up = new MP.THREE.Vector3(0, 1, 0).applyQuaternion(MP.camera.quaternion);
        // Roll da imagem: eixo direito deve continuar horizontal.
        const right = new MP.THREE.Vector3(1, 0, 0).applyQuaternion(MP.camera.quaternion);
        return { drift: p.distanceTo(MP.camera.position), rightY: right.y, upY: up.y };
      } finally { H.update = update; G.state.flying = false; H.group.rotation.set(0, 0, 0); }
    });
    assert.ok(r.drift < 0.08, `inclinação arrasta câmera: ${r.drift} m`);
    assert.ok(Math.abs(r.rightY) < 0.01 && r.upY > 0.9, JSON.stringify(r));
  });

  it('arrasto parcial do analógico pilota suavemente; soltar freia e nivela', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA, H = G.Heli;
      window.QA.clearInput();
      H.group.position.set(0, 90, 0);
      MP.player.pos.copy(H.group.position);
      if (!H.tryEnter()) throw new Error('não entrou no helicóptero');
      const el = document.getElementById('tcMove'), box = el.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const send = (type, dy) => el.dispatchEvent(new PointerEvent(type, {
        pointerId: 83, pointerType: 'touch', clientX: x, clientY: y + dy,
        bubbles: true, cancelable: true }));
      const pitch = () => {
        const n = new MP.THREE.Vector3(1, 0, 0).applyQuaternion(H.group.quaternion);
        return Math.atan2(n.y, Math.hypot(n.x, n.z));
      };
      try {
        send('pointerdown', 0); send('pointermove', -22);
        window.QA.tick(90);
        const partial = Math.hypot(H.vel.x, H.vel.z);
        send('pointermove', -120); window.QA.tick(90);
        const full = Math.hypot(H.vel.x, H.vel.z), nose = pitch();
        send('pointerup', -120); window.QA.tick(24);
        const brake = pitch();
        window.QA.tick(240);
        return { partial, full, nose, brake, level: pitch(), speed: Math.hypot(H.vel.x, H.vel.z) };
      } finally { send('pointerup', 0); H.exit(); window.QA.clearInput(); }
    });
    assert.ok(r.partial > 2 && r.partial < 12, `analógico parcial vira acelerador binário: ${r.partial}`);
    assert.ok(r.full > 23 && r.nose < -0.12, JSON.stringify(r));
    assert.ok(r.brake > 0.02 && Math.abs(r.level) < 0.01 && r.speed < 0.05, JSON.stringify(r));
  });

  it('mouse e toque giram mira; guinada não arrasta direção escolhida', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA, H = G.Heli;
      H.group.position.set(0, 90, 0); MP.player.pos.copy(H.group.position);
      H.tryEnter(); window.QA.tick(180);
      const direction = () => MP.camera.getWorldDirection(new MP.THREE.Vector3());
      const initial = direction();
      G.state.pointerLocked = true; G.controls.isLocked = true;
      document.dispatchEvent(new MouseEvent('mousemove', { movementX: 350, movementY: -120, bubbles: true }));
      window.QA.tick(180); const mouse = direction();
      G.keys.KeyA = true; window.QA.tick(90); G.keys.KeyA = false;
      window.QA.tick(180); const held = direction();
      const el = document.getElementById('tcLook'), b = el.getBoundingClientRect();
      const send = (type, dx) => el.dispatchEvent(new PointerEvent(type, { pointerId: 89,
        pointerType: 'touch', clientX: b.left + b.width / 2 + dx,
        clientY: b.top + b.height / 2, bubbles: true, cancelable: true }));
      send('pointerdown', 0); send('pointermove', -120); window.QA.tick(2);
      send('pointerup', -120); window.QA.tick(180); const touch = direction();
      H.exit(); G.state.pointerLocked = false; G.controls.isLocked = false; window.QA.clearInput();
      return { mouse: initial.angleTo(mouse), held: mouse.angleTo(held), touch: held.angleTo(touch) };
    });
    assert.ok(r.mouse > 0.3, `mouse travado: ${JSON.stringify(r)}`);
    assert.ok(r.held < 0.04, `guinada arrasta mira: ${JSON.stringify(r)}`);
    assert.ok(r.touch > 0.2, `toque travado: ${JSON.stringify(r)}`);
  });

  it('receptor multiplayer desenha inclinação a partir de poses remotas', async () => {
    host = await startBRMatch(h, { serverPort: 4111, flags: { golem: false } });
    // Inicializa sessão real; injeta playerUpdate no receptor existente.
    // Fase de nave é encerrada no cliente para medir só o desenho remoto.
    await h.play(() => {
      window.__BR_debug.S.phase = 'PLAY';
      window.QA.G.Heli.group.position.set(0, 90, 0);
      window.QA.G.Heli.group.rotation.set(0, 0, 0);
    });
    // O servidor aceita posse apenas perto do heliponto: este teste de
    // desenho injeta evento no receptor socket.io já ligado, sem declarar
    // posse nem mudar regras do servidor.
    const result = await h.play(async () => {
      const { G } = window.QA;
      const listeners = window.__MP.socket.listeners('playerUpdate');
      const initial = { id: 'qa-piloto-remoto', nick: 'QA piloto', pos: [0, 90, 0], rotY: 0, heli: true };
      listeners.forEach(fn => fn(initial));
      await new Promise(r => setTimeout(r, 500));
      for (let i = 1; i <= 120; i++) {
        if (i % 6 === 0) listeners.forEach(fn => fn({ ...initial, pos: [i / 3, 90, 0] }));
        await new Promise(requestAnimationFrame);
      }
      const n = new window.__MP.THREE.Vector3(1, 0, 0).applyQuaternion(G.Heli.group.quaternion);
      const noseY = n.y;
      let heading = 0, x = 40, z = 0;
      for (let i = 1; i <= 120; i++) {
        heading += 1.4 / 60;
        x += Math.cos(heading) / 3; z -= Math.sin(heading) / 3;
        if (i % 6 === 0) listeners.forEach(fn => fn({ ...initial, pos: [x, 90, z], rotY: heading }));
        await new Promise(requestAnimationFrame);
      }
      const yaw = G.Heli.group.rotation.y;
      const inside = new window.__MP.THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const up = new window.__MP.THREE.Vector3(0, 1, 0).applyQuaternion(G.Heli.group.quaternion);
      return { noseY, bank: up.dot(inside) };
    });
    assert.ok(result.noseY < -0.08, `helicóptero remoto nivelado: ${JSON.stringify(result)}`);
    assert.ok(result.bank > 0.12, `curva remota sem inclinação: ${JSON.stringify(result)}`);
  });
});
