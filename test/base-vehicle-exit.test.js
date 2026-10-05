'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mundoReal } = require('./helpers/pve-mundo');
const { CHROME, bootGame } = require('./helpers/harness');

describe('Saída veicular das bases militares', () => {
  for (const seed of [424242, 99, 777, 20260928]) {
    it(`portão mantém corredor livre para o caminhão, seed ${seed}`, async () => {
      const { mundo, P } = await mundoReal(seed);
      mundo.plano.bases.forEach((base, i) => {
        const pecas = mundo.pecas.bases[i];
        // O portão tem 6 m. Mede a faixa inteira, não a consulta de
        // colisão do produto: nenhum sólido pode fechar seu acesso.
        const bloqueios = pecas.filter(p => p.solida).map(P.caixaDaPeca).filter(b =>
          b.x0 < base.x + 3 && b.x1 > base.x - 3 &&
          b.z0 < base.z + 16 && b.z1 > base.z);
        assert.equal(bloqueios.length, 0, `base ${i}: sólidos bloqueiam acesso ao portão: ${JSON.stringify(bloqueios)}`);
        assert.equal(pecas.filter(p => p.w === 2.2 && p.d === 0.6).length, 5,
          'defesas laterais permanecem na base');
      });
    });
  }
});

it('caminhões atravessam o portão acelerando, sem remover obstáculos (Chrome)',
  { skip: !CHROME && 'Chrome não encontrado' }, async () => {
    const h = await bootGame({ port: 4110 });
    try {
      const resultados = await h.play(() => {
        const { G, MP } = window.QA;
        return G.Structures.baseSites.map(base => {
          const v = G.Car.vehicles.find(c => c.cfg.name === 'CAMINHÃO MILITAR' &&
            Math.hypot(c.chassisBody.position.x - base.x, c.chassisBody.position.z - base.z) < 10);
          if (!v) throw new Error('caminhão da base ausente');
          window.QA.clearInput();
          G.Car.setCur(v);
          // Manobra de alinhamento ao portão, mantendo a vaga original.
          v.chassisBody.quaternion.setFromAxisAngle(new MP.THREE.Vector3(0, 1, 0), -Math.PI / 2);
          v.chassisBody.velocity.set(0, 0, 0);
          v.chassisBody.angularVelocity.set(0, 0, 0);
          v.chassisBody.wakeUp();
          G.state.driving = true;
          window.QA.tick(90);
          G.keys.KeyW = true;
          window.QA.tick(480);
          const pos = v.chassisBody.position;
          const resultado = { x: pos.x - base.x, z: pos.z - base.z };
          window.QA.clearInput();
          G.state.driving = false;
          return resultado;
        });
      });
      assert.equal(resultados.length, 2);
      for (const [i, r] of resultados.entries()) {
        assert.ok(r.z > 19, `base ${i}: caminhão não saiu: ${JSON.stringify(r)}`);
      }
    } finally { await h.close(); }
  });
