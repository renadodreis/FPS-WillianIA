'use strict';
/* O passeio do menu NÃO pode cortar para um POI enquanto o prewarm não tiver
   linkado os shaders (mayTour). Sem o portão, o primeiro corte para a cidade
   compila dezenas de programas SINCRONAMENTE em GPU fraca/SwiftShader, trava a
   main thread por segundos, o engine.io derruba o socket e o cliente renasce
   com id novo — em produção isso vira location.reload NO MEIO DO MENU
   (multiplayer-client.js), e no harness órfã o __MP_init.id e cancela os
   testes de BR (test/br-drops). Raiz diagnosticada por bissecção: base passa,
   commit do menu reconecta. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

async function makeCam(mayTour) {
  const THREE = await import('three');
  const { createMenuCamera } = await import('../js/menuscene.js');
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  const shots = [
    { key: 'a', dur: 1, at: v => v.set(0, 0, 0), r0: 10, r1: 8, h0: 4, h1: 3, a0: 0, spin: 0.05, fov0: 48, fov1: 50 },
    { key: 'b', dur: 1, at: v => v.set(100, 0, 100), r0: 10, r1: 8, h0: 4, h1: 3, a0: 0, spin: 0.05, fov0: 48, fov1: 50 },
  ];
  const cam = createMenuCamera({ THREE, camera, heightAt: () => 0, shots, cutEl: null, mayTour });
  // roda N passos e devolve o conjunto de planos visitados (o ciclo com 2
  // planos dá a volta: amostrar só o índice final esconderia o corte)
  const run = (steps, dt = 1 / 30) => {
    const seen = new Set();
    for (let i = 0; i < steps; i++) { cam.update(dt); seen.add(cam.shotIndex()); }
    return seen;
  };
  return { cam, run };
}

describe('portão do passeio do menu (prewarm antes de cortar)', () => {
  it('dado mayTour() falso, então o passeio NUNCA sai do primeiro plano', async () => {
    const { run } = await makeCam(() => false);
    const seen = run(1200); // 40 s simulados >> dur de 1 s
    assert.deepEqual([...seen], [0], 'cortou de plano com o prewarm frio');
  });

  it('dado mayTour() verdadeiro, então o passeio corta normalmente após a duração', async () => {
    const { run } = await makeCam(() => true);
    const seen = run(90); // 3 s >> dur 1 s + corte 0,48 s
    assert.ok(seen.has(1), 'nunca cortou mesmo liberado');
  });

  it('dado mayTour que esfria de novo (lote de GLB tardio), então o corte seguinte espera', async () => {
    let warm = true;
    const { cam, run } = await makeCam(() => warm);
    assert.ok(run(90).has(1), 'pré-condição: primeiro corte aconteceu');
    warm = false;   // chegou um lote novo de materiais pra aquecer
    run(30);        // deixa qualquer corte em voo terminar
    const before = cam.shotIndex();
    run(1200);
    assert.equal(cam.shotIndex(), before, 'cortou de novo com o prewarm frio');
  });

  it('sem mayTour nas deps, então comporta como sempre (retrocompatível)', async () => {
    const { run } = await makeCam(undefined);
    assert.ok(run(90).has(1));
  });
});
