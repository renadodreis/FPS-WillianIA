/* Probe do PREWARM: conta quantos programas WebGL o three ainda precisa
   LINKAR durante o render — cada um desses é um congelamento de frame.
   Compara boot sem prewarm (baseline) contra boot com prewarm.
   Não mede FPS: mede quantas vezes o jogo pararia pra compilar shader.
   Uso: node scripts/prewarm-probe.js [porta] */
'use strict';
const { bootGame } = require('../test/helpers/harness.js');

const PORT = +(process.argv[2] || 3283);

(async () => {
  const h = await bootGame({ port: PORT, protocolTimeout: 600000 });
  try {
    const out = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      const R = MP.renderer;
      const programs = () => R.info.programs.length;

      /* Oito poses cobrindo o mapa: cada uma põe materiais diferentes no
         frustum, que é exatamente quando o three linka o programa. */
      const POSES = [
        [30, 30], [-180, 120], [220, -80], [0, 0],
        [-90, -240], [160, 200], [-300, 40], [90, -150],
      ];
      const novos = [];
      function sweep() {
        let linked = 0;
        for (const [x, z] of POSES) {
          MP.camera.position.set(x, MP.groundAt(x, z, 999) + 2, z);
          MP.camera.lookAt(x + 10, MP.groundAt(x, z, 999), z + 10);
          MP.camera.updateMatrixWorld();
          const before = programs();
          const known = new Set(R.info.programs.map(p => p.id));
          R.render(MP.scene, MP.camera);
          for (const p of R.info.programs)
            if (!known.has(p.id)) novos.push(p.name + (p.cacheKey && /shadow|depth/i.test(p.cacheKey) ? '*' : ''));
          linked += programs() - before;
        }
        return linked;
      }

      /* Sem baseline destrutivo: mexer no cache de programas do three
         corrompe a contagem. A pergunta honesta é "quantos programas já
         estão linkados quando o combate começa" contra "quantos ainda
         faltam linkar quando a câmera varre o mapa" — cada um dos que
         faltam é uma travada de frame que o jogador sentiria. */
      const antesDoWarm = programs();
      const t0 = performance.now();
      await G.prewarm.flush();
      const custoPrewarmMs = performance.now() - t0;
      const prontosAntesDoCombate = programs();
      const linkadosDuranteORender = sweep();

      return {
        antesDoWarm, prontosAntesDoCombate, linkadosDuranteORender, novos,
        custoPrewarmMs: +custoPrewarmMs.toFixed(1),
        materiais: G.prewarm.stats.warmed,
        erros: G.prewarm.stats.errors,
      };
    });

    console.log(JSON.stringify(out, null, 2));
    const total = out.prontosAntesDoCombate + out.linkadosDuranteORender;
    const pct = total ? (100 * out.prontosAntesDoCombate / total).toFixed(1) : '0';
    console.log(`\nProgramas linkados na janela segura: ${out.prontosAntesDoCombate}/${total} (${pct}%)`);
    console.log(`Ainda linkam durante o render: ${out.linkadosDuranteORender}`);
    console.log(`Custo movido pra fora do combate: ${out.custoPrewarmMs} ms`);
  } finally {
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
