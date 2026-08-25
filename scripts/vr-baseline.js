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
  const out = { target: 'local', port: 3271, seconds: 45, seed: '424242', tier: '', out: '',
    immersive: '' };
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
   versões; ele aparece no /proc/net/unix como `@..._devtools_remote`. Só
   existe com o navegador NO AR, e ele leva alguns segundos pra subir depois
   do intent — por isso a espera por condição. */
async function findDevtoolsSocket(limiteMs = 30000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    const unix = adb(['shell', 'cat', '/proc/net/unix']);
    const nomes = [...new Set(unix.split('\n')
      .map(l => (/@([\w.]*devtools_remote[\w.]*)/.exec(l) || [])[1])
      .filter(Boolean))];
    // preferência: o do navegador da Meta, se houver mais de um
    const escolhido = nomes.find(n => /oculus|browser/i.test(n)) || nomes[0];
    if (escolhido) return escolhido;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('nenhum socket devtools no aparelho — confira se o navegador do Quest ' +
    'abriu e se "Depuração USB" está ligada em Configurações > Sistema > Modo de desenvolvedor');
}

/* ---------- telemetria do runtime do Quest (VrApi) ----------
   O jeito de medir VR sem ninguém dentro do aparelho. O runtime cospe uma
   linha por segundo no logcat com FPS real contra o modo de tela, tempo de
   aplicação, ocupação de GPU e CPU, térmica e memória — é a mesma fonte que
   o OVR Metrics Tool mostra. Nada disso depende de alguém com o headset na
   cabeça, e é por isso que a medição passa a viver aqui em vez de pedir
   favor pro dono do projeto.

   O sensor de presença é desligado pelo comando de automação do modo
   desenvolvedor (`prox_close`) e RESTAURADO no fim: deixar ligado seria
   deixar o aparelho sem dormir, gastando bateria. */
function coletorVrApi() {
  const proc = spawn('adb', ['logcat', '-s', 'VrApi:V', '-v', 'brief'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const amostras = [];
  let resto = '';
  const num = (linha, chave, re) => {
    const m = new RegExp(chave + re).exec(linha);
    return m ? +m[1] : null;
  };
  proc.stdout.on('data', b => {
    resto += b.toString();
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) {
      if (!/FPS=/.test(l)) continue;
      amostras.push({
        t: Date.now(),
        fps: num(l, 'FPS=', '([0-9]+)/'),
        modo: num(l, 'FPS=[0-9]+/', '([0-9]+)'),
        appMs: num(l, 'App=', '([0-9.]+)ms'),
        cpuGpuMs: num(l, 'CPU&GPU=', '([0-9.]+)ms'),
        gpu: num(l, 'GPU%=', '([0-9.]+)'),
        cpu: num(l, 'CPU%=', '([0-9.]+)'),
        stale: num(l, 'Stale=', '([0-9]+)'),
        tear: num(l, 'Tear=', '([0-9]+)'),
        tempC: num(l, 'Temp=', '([0-9.]+)C'),
        livreMB: num(l, 'Free=', '([0-9]+)MB'),
      });
    }
  });
  return {
    amostras,
    parar() { try { proc.kill(); } catch { /* já morreu */ } },
  };
}

const mediana = a => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);

function resumirVrApi(amostras, de, ate) {
  const janela = amostras.filter(a => a.t >= de && a.t <= ate && a.fps !== null);
  if (!janela.length) return { amostras: 0 };
  return {
    amostras: janela.length,
    fps: mediana(janela.map(a => a.fps)),
    modoTela: mediana(janela.map(a => a.modo)),
    appMs: mediana(janela.map(a => a.appMs)),
    cpuGpuMs: mediana(janela.map(a => a.cpuGpuMs)),
    gpuPct: mediana(janela.map(a => a.gpu)),
    cpuPct: mediana(janela.map(a => a.cpu)),
    stale: mediana(janela.map(a => a.stale)),
    tear: janela.reduce((n, a) => n + (a.tear || 0), 0),
    tempC: mediana(janela.map(a => a.tempC)),
    livreMB: mediana(janela.map(a => a.livreMB)),
  };
}

/* ---------- entrar em sessão imersiva ----------
   `requestSession` exige ativação do usuário. O clique do puppeteer é evento
   CONFIÁVEL (vai pelo Input do CDP), então vale como gesto — é o único jeito
   de medir XR de verdade sem alguém apertando o botão dentro do headset. */
async function entrarEmVR(page) {
  await page.waitForFunction("!!document.getElementById('btnVR')", { timeout: 60000, polling: 250 });
  await page.click('#btnVR');
  await page.waitForFunction('window.__game.XR.presenting === true', { timeout: 60000, polling: 250 });
}

/* Amostrador de SESSÃO IMERSIVA. O `requestAnimationFrame` da janela NÃO
   descreve o frame de XR: lá quem agenda é `session.requestAnimationFrame`, na
   cadência do aparelho. Quem enxerga isso é o overlay de perf do próprio jogo
   (js/perfhud.js), que mede `perf.frameMs` dentro do `tick` — e o `tick` em XR
   é chamado pela sessão. Por isso aqui a estatística vem dele, não de um laço
   nosso. */
async function collectImmersive(page, seconds) {
  return page.evaluate(async secs => {
    const G = window.__game, MP = window.__MP;
    G.perfHud.enabled = true;
    if (!G.state.started) G.forceStart();

    /* SESSÃO SEM NINGUÉM NO HEADSET NÃO DESENHA. Fora da cabeça, a sessão
       vira `visible-blurred`/`hidden` e o compositor PARA de chamar
       `session.requestAnimationFrame` — o `tick` não roda e a medição sai
       com zero amostra, sem dizer por quê. Espera a sessão ficar visível e
       registra o que aconteceu. (É o mesmo sinal que a Fase 6 tem que
       tratar como focus-aware: requisito de loja.) */
    const sessao = MP.renderer.xr.getSession ? MP.renderer.xr.getSession() : null;
    const visivel = () => !sessao || sessao.visibilityState === 'visible';
    const t0espera = performance.now();
    while (!visivel() && performance.now() - t0espera < 120000)
      await new Promise(r => setTimeout(r, 500));
    const visibilidadeXR = sessao ? sessao.visibilityState : 'sem sessão';
    const esperaVisivelMs = Math.round(performance.now() - t0espera);

    const poses = [
      ['spawn', G.player.pos.x, G.player.pos.z],
      ['cidade', G.Structures.heliSpot.x, G.Structures.heliSpot.z],
      ['castelo', G.Structures.FORT_POS.x, G.Structures.FORT_POS.z],
      ['canhao', G.Cannon.spot.x, G.Cannon.spot.z],
    ];
    const porPose = [];
    const perPose = (secs * 1000) / poses.length;
    for (let i = 0; i < poses.length; i++) {
      const [nome, x, z] = poses[i];
      if (i > 0) {
        G.player.pos.set(x, G.groundAt(x, z, 999) + 1, z);
        G.player.vel.set(0, 0, 0);
      }
      await new Promise(r => setTimeout(r, 1500));   // assenta streaming e sombra
      const calls = [], tris = [];
      const frame0 = MP.renderer.info.render.frame;
      const t0 = performance.now();
      const t0wall = Date.now();
      const janela = Math.max(2000, perPose - 1500);
      while (performance.now() - t0 < janela) {
        calls.push(MP.renderer.info.render.calls);
        tris.push(MP.renderer.info.render.triangles);
        await new Promise(r => setTimeout(r, 120));
      }
      /* fps por CONTAGEM DE FRAME do renderer: não depende do perfHud e é o
         que denuncia loop parado (frames = 0) em vez de devolver zero mudo */
      const frames = MP.renderer.info.render.frame - frame0;
      const decorridoMs = performance.now() - t0;
      const janelaWall = [t0wall, Date.now()];
      const med = a => a.sort((x2, y2) => x2 - y2)[a.length >> 1] || 0;
      const st = G.perfHud.stats;
      porPose.push({ pose: nome, fps: +st.fps.toFixed(1), p50ms: +st.p50.toFixed(2),
        p99ms: +st.p99.toFixed(2), piorMs: +st.worst.toFixed(2), engasgos: st.hitches,
        amostras: st.samples, calls: med(calls), tris: med(tris),
        framesReais: frames, fpsReal: +(frames / (decorridoMs / 1000)).toFixed(1),
        janelaWall });
    }
    const gl = MP.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const camXR = MP.renderer.xr.getCamera();
    return {
      imersivo: true, porPose, visibilidadeXR, esperaVisivelMs,
      xr: {
        presenting: MP.renderer.xr.isPresenting,
        olhos: camXR && camXR.cameras ? camXR.cameras.length : 0,
        foveation: MP.renderer.xr.getFoveation === undefined ? null : MP.renderer.xr.getFoveation(),
        buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        refPose: MP.renderer.xr.getReferenceSpace ? 'ok' : 'ausente',
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

    /* ABA ESCONDIDA NÃO DESENHA. No navegador do Quest, com o headset fora da
       cabeça ou o painel fora de vista, o `requestAnimationFrame` simplesmente
       não dispara — e a medição sairia com zero frame, sem dizer por quê.
       Espera até a página estar visível e registra o que aconteceu. */
    const esperandoDesde = performance.now();
    while (document.visibilityState !== 'visible' && performance.now() - esperandoDesde < 120000)
      await new Promise(r => setTimeout(r, 500));
    const visibilidade = document.visibilityState;
    const esperaVisivelMs = Math.round(performance.now() - esperandoDesde);

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
      visibilidade, esperaVisivelMs,
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
  /* Zero frame é RESULTADO, não erro: significa que a aba não desenhou
     (headset fora da cabeça, painel fora de vista). Estourar aqui esconderia
     justamente o que precisa aparecer no relatório. */
  if (util.length < 8) return { frames: util.length, semFrames: true, porPose: [] };
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
  // que é o que o WebXR exige da Fase 1 em diante. Vem ANTES do intent, senão
  // o navegador abre a URL antes de existir rota pra ela.
  adb(['reverse', `tcp:${cfg.port}`, `tcp:${cfg.port}`]);
  /* O intent serve só pra ACORDAR o navegador. A URL vai sem query de
     propósito: `adb shell` entrega a linha ao shell do aparelho, que come `?`
     e `&` — quem navega de verdade é o CDP, logo abaixo, sem shell no meio. */
  adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
    '-d', `http://localhost:${cfg.port}/`], { quiet: true });
  // o socket só nasce com o navegador no ar: procurar antes do intent achava nada
  const socket = await findDevtoolsSocket();
  adb(['forward', 'tcp:9222', `localabstract:${socket}`]);

  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', protocolTimeout: 600000 });
  const page = await esperarAba(browser, cfg.port);
  const boot = await abrirEMedirBoot(page, urlDoJogo(cfg)); // recarrega: mede o boot limpo
  /* `--immersive=1` entra em sessão XR de verdade. É a ÚNICA medição de frame
     time que vale: em painel 2D o navegador do Quest trava a página em 30 Hz e
     a mediana fica idêntica em qualquer carga. */
  let dados;
  if (cfg.immersive) {
    /* Sensor de presença fora: é o comando de automação do modo desenvolvedor
       que faz o aparelho renderizar na mesa. Restaurado no fim — deixar
       ligado é deixar o headset sem dormir, gastando bateria. */
    try { adb(['shell', 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.prox_close'], { quiet: true }); } catch { /* sem automação: segue */ }
    try { adb(['logcat', '-c'], { quiet: true }); } catch { /* buffer cheio: segue */ }
    const vrapi = coletorVrApi();
    try {
      await entrarEmVR(page);
      dados = await collectImmersive(page, cfg.seconds);
    } finally {
      vrapi.parar();
      try { adb(['shell', 'am', 'broadcast', '-a', 'com.oculus.vrpowermanager.automation_disable'], { quiet: true }); } catch { /* idem */ }
    }
    for (const p of dados.porPose)
      p.runtime = resumirVrApi(vrapi.amostras, p.janelaWall[0], p.janelaWall[1]);
    dados.vrapiAmostras = vrapi.amostras.length;
  } else {
    dados = await collect(page, cfg.seconds);
  }
  /* Captura é ENFEITE: no navegador do Quest o `Page.captureScreenshot`
     às vezes simplesmente não volta, e perder 60 s de medição por causa de
     um PNG seria burrice. Falhou, segue sem ele. */
  let shot = null;
  try {
    const alvoPng = path.join(ROOT, 'output', 'vr', 'baseline-quest.png');
    fs.mkdirSync(path.dirname(alvoPng), { recursive: true });
    await page.screenshot({ path: alvoPng, timeout: 20000 });
    shot = alvoPng;
  } catch { console.warn('(sem captura de tela: o navegador do Quest não respondeu)'); }
  await browser.disconnect();
  /* FAXINA NUNCA DERRUBA MEDIÇÃO. Já custou três corridas de 60 s no
     aparelho: o `--remove` falha se o encaminhamento não existe mais, e o
     relatório morria depois do dado já estar colhido. */
  try { adb(['forward', '--remove', 'tcp:9222'], { quiet: true }); } catch { /* já removido */ }
  return { boot, dados, screenshot: shot ? path.relative(ROOT, shot) : null,
    adbSocket: socket, dispositivos };
}

/* Devolve a aba onde medir. Preferência pra uma que JÁ esteja no jogo; se não
   houver, qualquer aba serve — `abrirEMedirBoot` navega ela de qualquer jeito,
   e é isso que dá um boot limpo e cronometrado. A aba nova do navegador do
   Quest nasce em `chrome://panel-app-nav/ntp`, que é alvo do tipo `page` e
   aceita navegação normalmente. */
async function esperarAba(browser, port) {
  const deadline = Date.now() + 30000;
  let qualquer = null;
  while (Date.now() < deadline) {
    const abas = await browser.pages();
    for (const p of abas) {
      if (p.url().includes(`:${port}/`)) return p;
      if (!qualquer && !/^devtools:/.test(p.url())) qualquer = p;
    }
    if (qualquer) return qualquer;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('o navegador do Quest não expôs nenhuma aba pra medir');
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
    boot: saida.boot,
    resumo: saida.dados.imersivo ? { imersivo: true, porPose: saida.dados.porPose } : resumir(frames, poses),
    ...resto,
    screenshot: saida.screenshot || null,
  };
  const destino = cfg.out || path.join(ROOT, 'output', 'vr', `baseline-${cfg.target}.json`);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(relatorio, null, 2));

  const r = relatorio.resumo;
  if (r.imersivo) {
    console.log(`\n=== BASELINE VR (${cfg.target}, SESSÃO IMERSIVA) ===`);
    console.log(`GPU: ${relatorio.renderer.gpu}`);
    console.log(`olhos ${relatorio.xr.olhos} · buffer ${relatorio.xr.buffer.join('x')} · ` +
      `foveation ${relatorio.xr.foveation} · pixelRatio ${relatorio.renderer.pixelRatio}`);
    console.log(`boot: html ${saida.boot.htmlMs} ms · __game ${saida.boot.gameMs} ms · ` +
      `1º frame ${saida.boot.primeiroFrameMs} ms`);
    console.log(`visibilidade da sessão: ${relatorio.visibilidadeXR} ` +
      `(esperou ${relatorio.esperaVisivelMs} ms)`);
    console.log(`telemetria do runtime (VrApi): ${relatorio.vrapiAmostras} amostras\n`);
    console.log('pose      fps/modo   app ms  cpu+gpu  gpu%  cpu%  stale  °C   calls      tris');
    for (const p of r.porPose) {
      const rt = p.runtime || {};
      console.log(`${p.pose.padEnd(9)} ${String(rt.fps ?? '—').padStart(3)}/${String(rt.modoTela ?? '—').padEnd(4)} ` +
        `${String(rt.appMs ?? '—').padStart(7)} ${String(rt.cpuGpuMs ?? '—').padStart(8)} ` +
        `${String(rt.gpuPct ?? '—').padStart(5)} ${String(rt.cpuPct ?? '—').padStart(5)} ` +
        `${String(rt.stale ?? '—').padStart(6)} ${String(rt.tempC ?? '—').padStart(4)} ` +
        `${String(p.calls).padStart(6)} ${String(p.tris).padStart(9)}`);
    }
    if (r.porPose.every(p => p.framesReais === 0)) {
      console.log('\nZERO frame desenhado: a sessão existe mas não está visível. ' +
        'Ponha o headset NA CABEÇA durante a medição.');
    }
    console.log(`\n→ ${path.relative(ROOT, destino)}`);
    return;
  }
  if (r.semFrames) {
    console.log(`\n=== BASELINE VR (${cfg.target}) — SEM FRAMES ===`);
    console.log(`a aba não desenhou (visibilidade "${relatorio.visibilidade}", ` +
      `${r.frames} frames). No Quest: ponha o headset e deixe o painel do ` +
      'navegador à vista durante a medição.');
    console.log(`\n→ ${path.relative(ROOT, destino)}`);
    return;
  }
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
