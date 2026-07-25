/* Probe de PERF: draw calls / triângulos / throughput de um frame controlado em
   oito poses controladas, isolando baús, feixes e a cadência das sombras.
   Cada amostra prepara frusta/scheduler com G.tick(0), depois chama
   WebGLRenderer.render (composer é no-op), em 800×600/SwiftShader. Não é GPU.
   Uso: node scripts/perf-probe.js [porta] [arquivo-json] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bootGame, startBRMatch } = require('../test/helpers/harness.js');

const PORT = +(process.argv[2] || 3269);
const OUTPUT = process.argv[3] ? path.resolve(process.argv[3]) : null;

(async () => {
  const h = await bootGame({
    port: PORT,
    protocolTimeout: 600000,
    extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' },
  });
  let host = null;
  try {
    host = await startBRMatch(h, { serverPort: PORT });
    const out = await h.play(() => {
      const G = window.__game, MP = window.__MP, THREE = MP.THREE;
      const R = MP.renderer, dbg = window.__BR_debug;
      const gl = R.getContext();
      const crates = dbg.crates;
      const shadowLights = [];
      MP.scene.traverse(o => {
        if (o.isDirectionalLight && o.castShadow && o.shadow) shadowLights.push(o);
      });
      const saved = {
        cinematic: G.state.cinematic,
        playerPos: G.player.pos.clone(),
        playerVel: G.player.vel.clone(),
        playerOnGround: G.player.onGround,
        cameraPos: MP.camera.position.clone(),
        cameraQuat: MP.camera.quaternion.clone(),
        crates: crates.map(c => c.g.visible),
        shadows: shadowLights.map(l => ({
          autoUpdate: l.shadow.autoUpdate,
          needsUpdate: l.shadow.needsUpdate,
        })),
      };
      // Grade máxima 13×13 (169 chunks), com orçamento de 6 refills/update:
      // ceil(169 / 6) = 29; três updates extras dão margem ao teleporte.
      const STREAM_SETTLE_UPDATES = 32;
      // Dois ciclos completos das três cascatas distantes estabilizam também
      // os sistemas visuais que reagem ao teleporte da câmera.
      const WARMUP_FRAMES = 6;
      const SAMPLES_PER_POSE = 9; // cobre as 3 cascatas distantes igualmente

      /* G.tick(0) atualiza os frusta e executa exatamente o escalonador de
         produção; composer é no-op no harness. O tempo de submissão individual
         começa depois dele; o throughput do lote inclui o caminho completo. */
      function renderRawFrame() {
        G.tick(0);
        const scheduledMask = G.csmDebug.scheduledUpdateMask;
        R.info.reset();
        const t = performance.now();
        R.render(MP.scene, MP.camera);
        return {
          submissionMs: performance.now() - t,
          calls: R.info.render.calls,
          tris: R.info.render.triangles,
          scheduledMask,
        };
      }

      function preparePose(px, pz, yaw) {
        const groundY = MP.groundAt(px, pz, 999);
        G.player.pos.set(px, groundY, pz);
        G.player.vel.set(0, 0, 0);
        G.player.onGround = true;
        MP.camera.position.set(px, groundY + 1.62, pz);
        MP.camera.rotation.set(0, yaw, 0);
        MP.camera.updateMatrixWorld(true);
        for (let i = 0; i < STREAM_SETTLE_UPDATES; i++)
          G.Grass.update(G.player.pos, G.Car.group.position, G.state.gameTime);
      }

      function measure(px, pz, yaw, crateMode) {
        preparePose(px, pz, yaw);
        if (crateMode === 'cull') dbg.cullCrates({ x: px, z: pz });
        else for (const c of crates) c.g.visible = crateMode === 'all';
        for (let i = 0; i < WARMUP_FRAMES; i++) renderRawFrame();
        gl.finish(); // warmup não pode vazar trabalho para o lote medido
        const raw = [];
        const batchStart = performance.now();
        for (let i = 0; i < SAMPLES_PER_POSE; i++)
          raw.push(renderRawFrame());
        gl.finish(); // inclui todo o trabalho enfileirado pelo lote
        const throughputMs = (performance.now() - batchStart) / raw.length;
        const submissions = raw.map(r => r.submissionMs).sort((a, b) => a - b);
        return {
          pose: [px, pz, yaw],
          throughputMs: +throughputMs.toFixed(2),
          submissionMedianMs: +submissions[Math.floor(submissions.length / 2)].toFixed(2),
          calls: raw.map(r => r.calls),
          tris: raw.map(r => r.tris),
          scheduledMasks: raw.map(r => r.scheduledMask),
          visibleCrates: crates.reduce((n, c) => n + (c.g.visible ? 1 : 0), 0),
        };
      }
      function sweep(label, crateMode = 'cull') {
        const poses = [[30, 30], [G.Cannon.spot.x, G.Cannon.spot.z]];
        const rows = [];
        for (const [px, pz] of poses)
          for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2])
            rows.push(measure(px, pz, yaw, crateMode));
        const throughput = rows.map(r => r.throughputMs).sort((a, b) => a - b);
        const submissions = rows.map(r => r.submissionMedianMs).sort((a, b) => a - b);
        return {
          label,
          worstCalls: Math.max(...rows.flatMap(r => r.calls)),
          worstTris: Math.max(...rows.flatMap(r => r.tris)),
          medianThroughputMs: +((throughput[3] + throughput[4]) / 2).toFixed(2),
          meanThroughputMs: +(rows.reduce((s, r) => s + r.throughputMs, 0) / rows.length).toFixed(2),
          medianSubmissionMs: +((submissions[3] + submissions[4]) / 2).toFixed(2),
          visibleCrates: [
            Math.min(...rows.map(r => r.visibleCrates)),
            Math.max(...rows.map(r => r.visibleCrates)),
          ],
          rows,
        };
      }
      const beams = [];
      MP.scene.traverse(o => { if (o.isMesh && o.material && o.material.blending === THREE.AdditiveBlending && o.geometry.parameters && o.geometry.parameters.height === 46) beams.push(o); });
      const savedBeams = beams.map(b => b.visible);
      G.state.cinematic = true;
      try {
        const A = sweep('produção: culling + sombras escalonadas', 'cull');
        const B = sweep('controle: todos os baús', 'all');
        const C = sweep('controle: sem baús', 'none');
        for (const b of beams) b.visible = false;
        const D = sweep('controle: produção sem feixes', 'cull');
        let meshes = 0; MP.scene.traverse(o => { if (o.isMesh) meshes++; });
        const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info');
        const rendererName = rendererInfo
          ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);
        return {
          meta: {
            viewport: [window.innerWidth, window.innerHeight],
            pixelRatio: R.getPixelRatio(),
            renderer: rendererName,
            softwareRenderer: /swiftshader/i.test(rendererName),
            renderPath: 'por amostra: G.tick(0) de preparação + WebGLRenderer.render; composer no-op e simulação sem avanço',
            measurement: 'throughput de lote: 9 caminhos controlados + gl.finish, dividido por 9; não é timer GPU',
            shadowLights: shadowLights.length,
            samplesPerPose: SAMPLES_PER_POSE,
            warmupFrames: WARMUP_FRAMES,
            streamingSettleUpdates: STREAM_SETTLE_UPDATES,
            poses: 8,
          },
          A, B, C, D,
          crateCount: crates.length,
          beamCount: beams.length,
          sceneMeshes: meshes,
        };
      } finally {
        for (let i = 0; i < crates.length; i++) crates[i].g.visible = saved.crates[i];
        for (let i = 0; i < beams.length; i++) beams[i].visible = savedBeams[i];
        G.player.pos.copy(saved.playerPos);
        G.player.vel.copy(saved.playerVel);
        G.player.onGround = saved.playerOnGround;
        MP.camera.position.copy(saved.cameraPos);
        MP.camera.quaternion.copy(saved.cameraQuat);
        MP.camera.updateMatrixWorld(true);
        for (let i = 0; i < STREAM_SETTLE_UPDATES; i++)
          G.Grass.update(G.player.pos, G.Car.group.position, G.state.gameTime);
        for (let i = 0; i < shadowLights.length; i++) {
          shadowLights[i].shadow.autoUpdate = saved.shadows[i].autoUpdate;
          shadowLights[i].shadow.needsUpdate = saved.shadows[i].needsUpdate;
        }
        G.state.cinematic = saved.cinematic;
      }
    });
    out.errors = {
      page: h.pageErrors,
      console: h.consoleErrors,
      requests: h.requestFailures,
    };
    const json = JSON.stringify(out, null, 2);
    if (OUTPUT) {
      fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
      fs.writeFileSync(OUTPUT, `${json}\n`);
      const compact = { output: OUTPUT, meta: out.meta };
      for (const key of ['A', 'B', 'C', 'D']) {
        const row = out[key];
        compact[key] = {
          medianThroughputMs: row.medianThroughputMs,
          worstCalls: row.worstCalls,
          worstTris: row.worstTris,
          visibleCrates: row.visibleCrates,
        };
      }
      compact.errors = out.errors;
      console.log(JSON.stringify(compact, null, 2));
    } else {
      console.log(json);
    }
  } finally {
    if (host) host.close();
    await h.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
