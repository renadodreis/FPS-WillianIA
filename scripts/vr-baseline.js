/* ================================================================
   BASELINE DO PORTE VR — mede o jogo COMO ELE É, sem tocar em uma
   linha do runtime.

   Por que existe: o plano de porte pro Quest 3 fixa um orçamento por
   frame (draw calls, triângulos, materiais, frame time). Sem número
   medido no aparelho, toda decisão de otimização vira chute — e chute
   em VR custa enjoo, não "gráfico pior". Este script é o jeito
   repetível de regerar os números, antes e depois de cada fase.

   DOIS ALVOS, O MESMO AMOSTRADOR:
     --target=local  Chrome desta máquina (GPU real, via puppeteer-core).
                     Serve pra complexidade da CENA — draw calls,
                     triângulos, materiais, texturas — que NÃO dependem
                     do aparelho, e pra comparar contra o Quest.
     --target=quest  Meta Quest Browser, por CDP em cima do adb. Mede o
                     que interessa de verdade: frame time no Snapdragon.

   COMO O AMOSTRADOR NÃO MENTE:
     - `renderer.info` é zerado pelo próprio `render()` a cada passe, e
       com EffectComposer o número final descreveria só o ÚLTIMO passe.
       Quem resolve isso já existe: o overlay de perf (js/perfhud.js)
       assume `autoReset = false` e zera na mão no começo do frame.
       Por isso o amostrador LIGA o overlay e só então lê os contadores.
     - a coleta roda num requestAnimationFrame próprio, ou seja, na
       MESMA fila do loop do jogo: mede a cadência real de frame, não um
       laço sintético.
     - nada aqui escreve no jogo além de `forceStart()` e do teleporte
       entre poses fixas (o mesmo recurso que scripts/perf-probe.js já
       usa). Zero mudança de runtime, zero consumo de `rand`.

   Uso:
     node scripts/vr-baseline.js --target=local [--seconds=45]
     node scripts/vr-baseline.js --target=quest [--seconds=90]
     (opções: --port=3271 --seed=424242 --out=arquivo.json --tier=alto)
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { CHROME } = require('../test/helpers/harness.js');

const ROOT = path.join(__dirname, '..');

/* ---------- linha de comando ---------- */
function parseArgs(argv) {
  const out = { target: 'local', port: 3271, seconds: 45, seed: '424242', tier: '', out: '' };
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'port' || key === 'seconds') out[key] = +value;
    else if (key in out) out[key] = value;
  }
  return out;
}

/* ---------- servidor local com seed fixa ---------- */
async function startServer(port, seed) {
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), WORLD_SEED: seed, GAS_DEFAULT: 'classica' },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (srv.exitCode !== null) throw new Error(`servidor saiu antes do boot (exit ${srv.exitCode})`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.status === 200 && (await r.text()).includes('<canvas id="game"></canvas>')) return srv;
    } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 150));
  }
  srv.kill();
  throw new Error(`servidor não respondeu na porta ${port}`);
}

/* ---------- adb ---------- */
function adb(args, { quiet = false } = {}) {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'pipe'] }).trim();
  } catch (e) {
    throw new Error(`adb ${args.join(' ')} falhou: ${(e.stderr || e.message || '').toString().trim()}`,
      { cause: e });
  }
}

/* O socket de depuração do navegador do Quest não tem nome fixo entre
   versões; ele aparece no /proc/net/unix como `@..._devtools_remote`. */
function findDevtoolsSocket() {
  const unix = adb(['shell', 'cat', '/proc/net/unix']);
  const names = [...new Set(unix.split('\n')
    .map(l => (/@([\w.]*devtools_remote[\w.]*)/.exec(l) || [])[1])
    .filter(Boolean))];
  if (!names.length) {
    throw new Error('nenhum socket devtools no aparelho — abra o navegador do Quest ' +
      'e confira "Depuração USB" em Configurações > Sistema > Modo de desenvolvedor');
  }
  // preferência: o do navegador da Meta, se houver mais de um
  return names.find(n => /oculus|browser/i.test(n)) || names[0];
}

/* ---------- amostrador (roda DENTRO da página) ---------- */
/* Devolve uma amostra por frame + um censo único da cena. `poses` são
   teleportes fixos: quatro cantos com carga visual diferente (spawn,
   cidade, castelo, vulcão) para o número não descrever só o mato. */
async function collect(page, seconds) {
  return page.evaluate(async secs => {
    const G = window.__game, MP = window.__MP;
    G.perfHud.enabled = true;      // ver cabeçalho: sem isto os contadores mentem
    if (!G.state.started) G.forceStart();

    /* quatro cargas visuais bem diferentes, todas alcançáveis por
       `window.__game` (nada de constante privada do worldgen): mato aberto,
       cidade, castelo e o canhão — a mesma pose pesada que
       scripts/perf-probe.js já usa. */
    const poses = [
      ['spawn', G.player.pos.x, G.player.pos.z],
      ['cidade', G.Structures.heliSpot.x, G.Structures.heliSpot.z],
      ['castelo', G.Structures.FORT_POS.x, G.Structures.FORT_POS.z],
      ['canhao', G.Cannon.spot.x, G.Cannon.spot.z],
    ];

    const frames = [];
    let stop = false, last = performance.now(), pose = 0;
    const sample = () => {
      const now = performance.now();
      const info = MP.renderer.info.render;
      frames.push({ ms: now - last, calls: info.calls, tris: info.triangles, pose });
      last = now;
      if (!stop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);

    const perPose = (secs * 1000) / poses.length;
    for (let i = 0; i < poses.length; i++) {
      pose = i;
      const [, x, z] = poses[i];
      if (i > 0) {
        G.player.pos.set(x, G.groundAt(x, z, 999) + 1, z);
        G.player.vel.set(0, 0, 0);
      }
      await new Promise(r => setTimeout(r, perPose));
    }
    stop = true;
    await new Promise(r => setTimeout(r, 50));

    /* censo único da cena: o teto de "materiais únicos" do orçamento é
       sobre o que existe, não sobre o que passou no culling */
    const materials = new Set(), geometries = new Set(), textures = new Set();
    let meshes = 0, instanced = 0, instances = 0, skinned = 0, lightsShadow = 0;
    MP.scene.traverse(o => {
      if (o.isInstancedMesh) { instanced++; instances += o.count; }
      else if (o.isSkinnedMesh) skinned++;
      else if (o.isMesh) meshes++;
      if (o.isLight && o.castShadow) lightsShadow++;
      if (o.geometry) geometries.add(o.geometry.uuid);
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        materials.add(m.uuid);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'])
          if (m[k] && m[k].uuid) textures.add(m[k].uuid);
      }
    });

    const gl = MP.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames,
      poses: poses.map(p => p[0]),
      cena: {
        materiaisUnicos: materials.size, geometriasUnicas: geometries.size,
        texturasEmMaterial: textures.size, meshes, instancedMeshes: instanced,
        instancias: instances, skinnedMeshes: skinned, luzesComSombra: lightsShadow,
      },
      renderer: {
        gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '',
        programas: MP.renderer.info.programs ? MP.renderer.info.programs.length : -1,
        geometriasNaGpu: MP.renderer.info.memory.geometries,
        texturasNaGpu: MP.renderer.info.memory.textures,
        pixelRatio: MP.renderer.getPixelRatio(),
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        sombra: MP.renderer.shadowMap.enabled,
        xrDisponivel: !!navigator.xr,
      },
      config: {
        tier: G.gpuTier ? { tier: G.gpuTier.tier, reason: G.gpuTier.reason, applied: G.gpuTier.applied } : null,
        viewDist: MP.CFG.VIEW_DIST, grassTotal: MP.CFG.GRASS_TOTAL,
        shadowMapSize: MP.CFG.SHADOW_MAP_SIZE, csmMaxFar: MP.CFG.CSM_MAX_FAR,
        escalaAdaptativa: G.renderQuality.scale, tetoAdaptativo: G.renderQuality.ceiling,
      },
      ambiente: {
        userAgent: navigator.userAgent, devicePixelRatio: window.devicePixelRatio,
        tela: [window.screen.width, window.screen.height],
        viewport: [window.innerWidth, window.innerHeight],
        memoriaGB: navigator.deviceMemory || null, nucleos: navigator.hardwareConcurrency || null,
      },
      erros: G.errors.slice(0, 10),
    };
  }, seconds);
}

/* ---------- estatística (fora da página: número frio) ---------- */
const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];

function resumir(frames, poses) {
  const util = frames.slice(5); // os primeiros frames pagam o teleporte inicial
  const ms = util.map(f => f.ms).sort((a, b) => a - b);
  const calls = util.map(f => f.calls).sort((a, b) => a - b);
  const tris = util.map(f => f.tris).sort((a, b) => a - b);
  const p50 = pct(ms, 0.5);
  const porPose = poses.map((nome, i) => {
    const sub = util.filter(f => f.pose === i);
    if (!sub.length) return { pose: nome, frames: 0 };
    const m = sub.map(f => f.ms).sort((a, b) => a - b);
    return {
      pose: nome, frames: sub.length,
      fps: +(1000 / pct(m, 0.5)).toFixed(1),
      p50ms: +pct(m, 0.5).toFixed(2), p99ms: +pct(m, 0.99).toFixed(2),
      calls: pct(sub.map(f => f.calls).sort((a, b) => a - b), 0.5),
      tris: pct(sub.map(f => f.tris).sort((a, b) => a - b), 0.5),
    };
  });
  return {
    frames: util.length,
    fpsMediano: +(1000 / p50).toFixed(1),
    p50ms: +p50.toFixed(2), p99ms: +pct(ms, 0.99).toFixed(2), piorMs: +ms[ms.length - 1].toFixed(2),
    // engasgo com a mesma regra do overlay de produção (js/perfhud.js)
    engasgos: util.filter(f => f.ms > 30 && f.ms > p50 * 2.5).length,
    callsMediano: pct(calls, 0.5), callsPior: calls[calls.length - 1],
    trisMediano: pct(tris, 0.5), trisPior: tris[tris.length - 1],
    porPose,
  };
}

/* ---------- alvos ---------- */
async function runLocal(cfg) {
  const puppeteer = require('puppeteer-core');
  if (!CHROME) throw new Error('Chrome não encontrado (defina CHROME_PATH)');
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio', '--window-size=1280,720',
      '--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const boot = await abrirEMedirBoot(page, urlDoJogo(cfg));
  const dados = await collect(page, cfg.seconds);
  await browser.close();
  return { boot, dados };
}

async function runQuest(cfg) {
  const puppeteer = require('puppeteer-core');
  const dispositivos = adb(['devices']).split('\n').slice(1)
    .filter(l => /\tdevice$/.test(l)).map(l => l.split('\t')[0]);
  if (!dispositivos.length) {
    throw new Error('nenhum aparelho autorizado no adb — confira o cabo e o aviso ' +
      '"Permitir depuração USB?" DENTRO do headset');
  }
  // localhost no aparelho = servidor desta máquina: contexto seguro sem HTTPS,
  // que é o que o WebXR vai exigir a partir da Fase 1.
  adb(['reverse', `tcp:${cfg.port}`, `tcp:${cfg.port}`]);
  const socket = findDevtoolsSocket();
  adb(['forward', 'tcp:9222', `localabstract:${socket}`]);
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', urlDoJogo(cfg)], { quiet: true });

  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', protocolTimeout: 600000 });
  const page = await esperarAba(browser, cfg.port);
  const boot = await abrirEMedirBoot(page, urlDoJogo(cfg)); // recarrega: mede o boot limpo
  const dados = await collect(page, cfg.seconds);
  const shot = path.join(ROOT, 'output', 'vr', 'baseline-quest.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  await browser.disconnect();
  adb(['forward', '--remove', 'tcp:9222'], { quiet: true });
  return { boot, dados, screenshot: path.relative(ROOT, shot), adbSocket: socket, dispositivos };
}

async function esperarAba(browser, port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const p of await browser.pages()) {
      if (p.url().includes(`:${port}/`)) return p;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('o navegador do Quest não abriu a aba do jogo');
}

const urlDoJogo = cfg =>
  `http://localhost:${cfg.port}/?perf=1${cfg.tier ? `&tier=${cfg.tier}` : ''}`;

/* Boot = três marcos: HTML respondido, `window.__game` montado (worldgen
   inteiro no meio) e primeiro frame de fato desenhado. O requisito de loja
   ("gráfico head-tracked em < 4 s") mora no terceiro. */
async function abrirEMedirBoot(page, url) {
  /* Sem isto a medição não é repetível: com `callofai_cfg` salvo de uma visita
     anterior o auto-tier NÃO aplica preset nenhum (a escolha do jogador vence,
     por projeto) e o baseline descreveria a configuração de outro dia. */
  let cdp = null;
  /* o que o boot BAIXA é orçamento de duas coisas ao mesmo tempo: o tempo até
     o primeiro frame e o que o service worker vai ter que guardar na Fase 8 */
  const rede = { requisicoes: 0, bytes: 0, maiores: [] };
  const porUrl = new Map();
  try {
    cdp = await page.createCDPSession();
    await cdp.send('Storage.clearDataForOrigin',
      { origin: new URL(url).origin, storageTypes: 'local_storage' });
    await cdp.send('Network.enable');
    cdp.on('Network.responseReceived', e => porUrl.set(e.requestId, e.response.url));
    cdp.on('Network.loadingFinished', e => {
      rede.requisicoes++;
      rede.bytes += e.encodedDataLength || 0;
      const u = porUrl.get(e.requestId);
      if (u) rede.maiores.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), kb: Math.round((e.encodedDataLength || 0) / 1024) });
    });
  } catch { /* sem CDP: segue sem contagem de rede */ }

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const htmlMs = Date.now() - t0;
  await page.waitForFunction('!!window.__game && !!window.__MP', { timeout: 180000, polling: 100 });
  const gameMs = Date.now() - t0;
  await page.waitForFunction('window.__MP.renderer.info.render.frame > 0', { timeout: 180000, polling: 50 });
  const primeiroFrameMs = Date.now() - t0;
  if (cdp) {
    try { await cdp.send('Network.disable'); await cdp.detach(); } catch { /* já fechado */ }
  }
  rede.maiores.sort((a, b) => b.kb - a.kb);
  rede.maiores = rede.maiores.slice(0, 12);
  rede.mb = +(rede.bytes / 1048576).toFixed(2);
  return { htmlMs, gameMs, primeiroFrameMs, rede };
}

/* ---------- main ---------- */
(async () => {
  const cfg = parseArgs(process.argv.slice(2));
  const srv = await startServer(cfg.port, cfg.seed);
  let saida;
  try {
    saida = cfg.target === 'quest' ? await runQuest(cfg) : await runLocal(cfg);
  } finally {
    srv.kill();
  }
  const { frames, poses, ...resto } = saida.dados;
  const relatorio = {
    alvo: cfg.target, seed: cfg.seed, segundos: cfg.seconds,
    boot: saida.boot, resumo: resumir(frames, poses), ...resto,
    screenshot: saida.screenshot || null,
  };
  const destino = cfg.out || path.join(ROOT, 'output', 'vr', `baseline-${cfg.target}.json`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(relatorio, null, 2));

  const r = relatorio.resumo;
  console.log(`\n=== BASELINE VR (${cfg.target}) ===`);
  console.log(`GPU: ${relatorio.renderer.gpu}`);
  console.log(`UA: ${relatorio.ambiente.userAgent}`);
  console.log(`viewport ${relatorio.ambiente.viewport.join('x')} · dpr ${relatorio.ambiente.devicePixelRatio} · ` +
    `buffer ${relatorio.renderer.drawingBuffer.join('x')} · navigator.xr ${relatorio.renderer.xrDisponivel}`);
  console.log(`boot: html ${saida.boot.htmlMs} ms · __game ${saida.boot.gameMs} ms · 1º frame ${saida.boot.primeiroFrameMs} ms`);
  console.log(`rede no boot: ${saida.boot.rede.requisicoes} requisições · ${saida.boot.rede.mb} MB`);
  console.log(`fps ${r.fpsMediano} · p50 ${r.p50ms} ms · p1% ${r.p99ms} ms · pior ${r.piorMs} ms · engasgos ${r.engasgos}`);
  console.log(`draw calls ${r.callsMediano} (pior ${r.callsPior}) · tris ${r.trisMediano} (pior ${r.trisPior})`);
  console.log(`materiais ${relatorio.cena.materiaisUnicos} · programas ${relatorio.renderer.programas} · ` +
    `texturas na GPU ${relatorio.renderer.texturasNaGpu} · luzes com sombra ${relatorio.cena.luzesComSombra}`);
  for (const p of r.porPose) console.log(`  ${p.pose.padEnd(8)} ${p.fps} fps · ${p.calls} calls · ${p.tris} tris`);
  console.log(`\n→ ${path.relative(ROOT, destino)}`);
})().catch(e => { console.error(e); process.exit(1); });
