/* ================================================================
   VR EMULADO — sessão imersiva de verdade, no PC, sem headset.

   POR QUE EXISTE: medir e depurar VR pedindo pro dono do projeto vestir o
   aparelho a cada rodada não é desenvolvimento, é gambiarra — e o
   navegador do Quest ainda congela o contexto JS quando o painel perde
   foco, então nem automação salvava. Este script usa o IWER (Immersive
   Web Emulation Runtime, o runtime WebXR emulado que a Meta publica) com
   o preset do Quest 3: instala `navigator.xr` ANTES do game.js ler o
   ambiente, e a partir daí o jogo abre sessão `immersive-vr` de verdade,
   com duas câmeras de olho, no Chrome desta máquina.

   O QUE ISTO MEDE E O QUE NÃO MEDE:
     MEDE  — o que é contagem: draw calls e triângulos EM ESTÉREO, o grafo
             (rig, pai da câmera), o caminho de render (composer fora), a
             lógica de sessão e, mais pra frente, locomoção e UI. Tudo
             isso é idêntico no aparelho, como o baseline já provou
             comparando 413 (Quest) contra 463 (desktop) draw calls.
     NÃO MEDE — frame time do Snapdragon. Tempo é do aparelho, e o jeito
             de tirar isso sem ninguém na cabeça é o VrApi no logcat
             (`npm run vr:baseline -- --target=quest --immersive=1`).

   Uso: node scripts/vr-emulado.js [--port=3275] [--out=arquivo.json]
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bootGame } = require('../test/helpers/harness.js');

const ROOT = path.join(__dirname, '..');

/* Bundle UMD do IWER + a instalação do runtime, tudo num script só, para
   entrar por `evaluateOnNewDocument` antes de qualquer script da página.
   Precisa ser ANTES: o `xrEnv()` do js/xr/xrenv.js lê `navigator.xr` no
   escopo do módulo, e runtime instalado depois disso chegaria tarde. */
function scriptDoRuntimeEmulado() {
  const umd = fs.readFileSync(
    path.join(ROOT, 'node_modules', 'iwer', 'build', 'iwer.js'), 'utf8');
  return `${umd}
;(function () {
  try {
    var IWER = globalThis.IWER;
    var dev = new IWER.XRDevice(IWER.metaQuest3);
    /* forceInstall: o Chrome desta maquina JA tem navigator.xr nativo, que
       responde "nao suporto" a tudo por nao haver headset. Sem forcar, o
       IWER se recusa a substituir um runtime nativo e a emulacao nao sobe. */
    dev.installRuntime({ forceInstall: true });
    globalThis.__xrEmulado = dev;   // QA: recenter, visibilidade, controles
  } catch (e) {
    globalThis.__xrEmuladoErro = String(e && e.message || e);
  }
})();`;
}

function parseArgs(argv) {
  const out = { port: 3275, out: '', seconds: 12 };
  for (const a of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'port' || m[1] === 'seconds') out[m[1]] = +m[2];
    else if (m[1] in out) out[m[1]] = m[2];
  }
  return out;
}

(async () => {
  const cfg = parseArgs(process.argv.slice(2));
  const h = await bootGame({
    port: cfg.port,
    autoStart: false,               // começa no MENU: é o portão da Fase 1
    initScripts: [scriptDoRuntimeEmulado()],
    protocolTimeout: 300000,
  });
  let dados;
  try {
    // 1) o runtime emulado chegou antes do jogo?
    const ambiente = await h.play(() => ({
      erro: window.__xrEmuladoErro || null,
      temXr: !!navigator.xr,
      envDoJogo: window.__game ? { ...window.__game.XR.env } : null,
      temBotao: !!document.getElementById('btnVR'),
    }));
    console.log('runtime emulado:', JSON.stringify(ambiente));
    if (ambiente.erro) throw new Error(`IWER não instalou: ${ambiente.erro}`);
    const suporte = await h.play(async () => {
      try { return { ok: await navigator.xr.isSessionSupported('immersive-vr') }; }
      catch (e) { return { erro: String(e && e.name) + ': ' + String(e && e.message) }; }
    });
    console.log('isSessionSupported(immersive-vr):', JSON.stringify(suporte));

    // 2) o botão só nasce depois do isSessionSupported resolver
    await h.page.waitForFunction("!!document.getElementById('btnVR')",
      { timeout: 30000, polling: 200 });
    await h.page.click('#btnVR');
    await h.page.waitForFunction('window.__game.XR.presenting === true',
      { timeout: 30000, polling: 100 });

    // 3) mede a sessão: estéreo, grafo e caminho de render
    dados = await h.play(async segundos => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      G.perfHud.enabled = true;
      const camXR = R.xr.getCamera();
      const gl = R.getContext();

      const amostra = async (rotulo, prepara) => {
        if (prepara) prepara();
        await new Promise(r => setTimeout(r, 1200));   // assenta stream e sombra
        const frame0 = R.info.render.frame;
        const t0 = performance.now();
        const calls = [], tris = [];
        while (performance.now() - t0 < segundos * 250) {
          calls.push(R.info.render.calls);
          tris.push(R.info.render.triangles);
          await new Promise(r => setTimeout(r, 60));
        }
        const med = a => a.sort((x, y) => x - y)[a.length >> 1] || 0;
        const dt = performance.now() - t0;
        const st = G.perfHud.stats;
        return {
          pose: rotulo,
          framesReais: R.info.render.frame - frame0,
          fps: +((R.info.render.frame - frame0) / (dt / 1000)).toFixed(1),
          p50ms: +st.p50.toFixed(2), p99ms: +st.p99.toFixed(2), engasgos: st.hitches,
          calls: med(calls), tris: med(tris),
        };
      };

      const poses = [];
      poses.push(await amostra('menu'));
      G.forceStart();
      poses.push(await amostra('spawn'));
      const ir = (x, z) => () => {
        G.player.pos.set(x, G.groundAt(x, z, 999) + 1, z);
        G.player.vel.set(0, 0, 0);
      };
      poses.push(await amostra('cidade', ir(G.Structures.heliSpot.x, G.Structures.heliSpot.z)));
      poses.push(await amostra('castelo', ir(G.Structures.FORT_POS.x, G.Structures.FORT_POS.z)));

      return {
        poses,
        sessao: {
          presenting: R.xr.isPresenting,
          olhos: camXR && camXR.cameras ? camXR.cameras.length : 0,
          buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
          referencia: R.xr.getReferenceSpace ? 'ok' : 'ausente',
        },
        grafo: {
          rigExiste: !!G.XR.rig,
          camPaiEhRig: MP.camera.parent === G.XR.rig,
          rigNosPes: G.XR.rig
            ? [+(G.XR.rig.position.x - G.player.pos.x).toFixed(3),
              +(G.XR.rig.position.y - G.player.pos.y).toFixed(3),
              +(G.XR.rig.position.z - G.player.pos.z).toFixed(3)]
            : null,
          rigYaw: G.XR.rig ? +G.XR.rig.rotation.y.toFixed(4) : null,
        },
        erros: G.errors.slice(0, 10),
      };
    }, cfg.seconds);
    dados.ambiente = ambiente;
  } finally {
    await h.close();
  }

  const destino = cfg.out || path.join(ROOT, 'output', 'vr', 'emulado.json');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2));

  const s = dados.sessao, g = dados.grafo;
  console.log('\n=== VR EMULADO (Quest 3 via IWER, no PC) ===');
  console.log(`sessão: presenting ${s.presenting} · olhos ${s.olhos} · ` +
    `buffer ${s.buffer.join('x')} · referência ${s.referencia}`);
  console.log(`grafo: rig ${g.rigExiste ? 'existe' : 'AUSENTE'} · ` +
    `câmera filha do rig ${g.camPaiEhRig} · rig-menos-pés ${JSON.stringify(g.rigNosPes)} · ` +
    `yaw ${g.rigYaw}`);
  console.log('\npose        fps  frames   p50 ms   p1% ms   calls        tris');
  for (const p of dados.poses)
    console.log(`${p.pose.padEnd(10)} ${String(p.fps).padStart(4)} ${String(p.framesReais).padStart(7)} ` +
      `${String(p.p50ms).padStart(8)} ${String(p.p99ms).padStart(8)} ` +
      `${String(p.calls).padStart(7)} ${String(p.tris).padStart(11)}`);
  if (dados.erros.length) console.log('\nerros na página:', dados.erros);
  console.log(`\n→ ${path.relative(ROOT, destino)}`);
})().catch(e => { console.error(e); process.exit(1); });
