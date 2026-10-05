'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { importar } = require('./helpers/pve-mundo');

let createHeli;
before(async () => { ({ createHeli } = await importar('heli.js')); });

function voo(move) {
  const state = { flying: true, paused: false }, keys = {};
  const heli = createHeli({
    CFG: { WORLD_SIZE: 2000 }, clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    damp: (x, y, k, dt) => y + (x - y) * Math.exp(-k * dt),
    _v1: new THREE.Vector3(), groundAt: () => 0,
    SFX: { heliUpdate() {} }, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    csmMat: m => m, Structures: { heliSpot: { x: 0, y: 80, z: 0 }, collide() {} },
    ui: { speedVal: {} }, state, keys, mouse: {},
    player: { pos: new THREE.Vector3(), vel: new THREE.Vector3() },
    getMove: () => move || { active: false },
  });
  const step = (seconds, fps = 60) => {
    for (let i = 0; i < Math.round(seconds * fps); i++) heli.update(1 / fps, i / fps);
  };
  // Régua geométrica: direção do nariz e sustentação desenhados no mundo.
  const pose = () => {
    const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(heli.group.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(heli.group.quaternion);
    return { pitch: Math.atan2(nose.y, Math.hypot(nose.x, nose.z)), up,
      speed: Math.hypot(heli.vel.x, heli.vel.z) };
  };
  return { heli, keys, state, step, pose };
}

describe('Helicóptero: atitude arcade ligada ao movimento', () => {
  it('acelera com nariz visivelmente baixo; soltar comando levanta nariz e depois nivela', () => {
    const v = voo(); v.keys.KeyW = true; v.step(0.6);
    assert.ok(v.pose().pitch < -0.21, `inclinação fraca: ${v.pose().pitch}`);
    v.step(1.4); v.keys.KeyW = false; v.step(0.4);
    assert.ok(v.pose().pitch > 0.025, `freio não levanta nariz: ${v.pose().pitch}`);
    v.step(4);
    assert.ok(Math.abs(v.pose().pitch) < 0.005);
    assert.ok(v.pose().speed < 0.02);
  });

  it('gira quase nivelado parado; banca para dentro da curva quando avança', () => {
    const v = voo(); v.keys.KeyA = true; v.step(1);
    assert.ok(Math.hypot(v.pose().up.x, v.pose().up.z) < 0.02, 'guinada parada não deve bancar como curva em voo');
    v.keys.KeyW = true; v.step(2);
    const yaw = v.heli.group.rotation.y;
    const inside = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    assert.ok(v.pose().up.dot(inside) > 0.25, 'sustentação precisa inclinar para dentro da curva');
    assert.ok(Math.abs(v.heli.group.rotation.x) <= 22 * Math.PI / 180 + 1e-6);
  });

  it('inclinação do nariz mantém direção ao mudar rumo', () => {
    const pitches = [];
    for (const turn of [0, 0.6, 1.2, 2]) {
      const v = voo(); v.keys.KeyA = true; v.step(turn);
      v.keys.KeyA = false; v.keys.KeyW = true; v.step(0.6);
      pitches.push(v.pose().pitch);
    }
    assert.ok(Math.max(...pitches) - Math.min(...pitches) < 0.005, JSON.stringify(pitches));
    assert.ok(pitches.every(p => p < -0.21));
  });

  it('30/60/120 FPS produzem mesma atitude e frenagem, dentro de 1 grau', () => {
    const out = [30, 60, 120].map(fps => {
      const v = voo(); v.keys.KeyW = true; v.step(2, fps);
      v.keys.KeyW = false; v.step(0.4, fps);
      return v.pose().pitch;
    });
    assert.ok(out.every(p => p > 0.025), `freio ausente: ${out}`);
    assert.ok(Math.max(...out) - Math.min(...out) < Math.PI / 180, JSON.stringify(out));
  });

  it('deflexão do analógico regula velocidade e inclinação sem precisar botão novo', () => {
    const partial = voo({ active: true, py: 0.25, px: 0 });
    const full = voo({ active: true, py: 1, px: 0 });
    partial.step(0.6); full.step(0.6);
    assert.ok(full.pose().speed > 15, 'analógico não chega ao motor');
    assert.ok(partial.pose().speed > 3 && partial.pose().speed < full.pose().speed * 0.35);
    assert.ok(Math.abs(partial.pose().pitch) < Math.abs(full.pose().pitch) * 0.35);
  });

  it('piloto remoto inclina em avanço, freia e curva usando poses recebidas', () => {
    const v = voo(); v.state.flying = false;
    const p = v.heli.group.position.clone();
    for (let i = 1; i <= 120; i++) {
      p.x += 20 / 60;
      v.heli.setRemotePose(p, 0, 1 / 60);
    }
    assert.ok(v.pose().pitch < -0.10, 'helicóptero remoto fica nivelado em voo');
    for (let i = 0; i < 24; i++) v.heli.setRemotePose(p, 0, 1 / 60);
    assert.ok(v.pose().pitch > 0.01, 'remoto não freia');
    let heading = 0;
    for (let i = 0; i < 180; i++) {
      heading += 1.4 / 60;
      p.x += Math.cos(heading) * 20 / 60;
      p.z -= Math.sin(heading) * 20 / 60;
      v.heli.setRemotePose(p, heading, 1 / 60);
    }
    const inside = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
    assert.ok(v.pose().up.dot(inside) > 0.2, 'remoto não inclina para dentro da curva');
  });

  it('ré levanta nariz; curvas à direita inclinam para direita sem passar limites', () => {
    const v = voo(); v.keys.KeyS = true; v.step(0.6);
    assert.ok(v.pose().pitch > 0.21);
    v.keys.KeyS = false; v.keys.KeyW = true; v.keys.KeyD = true; v.step(4);
    const yaw = v.heli.group.rotation.y;
    const right = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    assert.ok(v.pose().up.dot(right) > 0.2);
    assert.ok(Math.abs(v.pose().pitch) <= 18 * Math.PI / 180 + 1e-6);
  });

  it('em ré, inclina para dentro da trajetória real, não para lado oposto', () => {
    const v = voo(); v.keys.KeyS = true; v.keys.KeyA = true; v.step(3);
    const yaw = v.heli.group.rotation.y;
    const inside = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    assert.ok(v.pose().up.dot(inside) > 0.2, 'banca para fora da curva em ré');
  });

  it('ao deixar piloto local, fuselagem nivela; pausa não altera atitude', () => {
    const v = voo(); v.keys.KeyW = true; v.step(0.6);
    const angle = v.pose().pitch;
    v.state.paused = true; v.step(1);
    assert.ok(Math.abs(v.pose().pitch - angle) < 1e-9);
    v.state.paused = false; v.state.flying = false; v.step(2);
    assert.ok(Math.abs(v.pose().pitch) < 0.005, 'helicóptero vazio fica inclinado');
  });
});
