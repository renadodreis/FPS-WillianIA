/* Captura do MENU INICIAL: título vivo, painel de controles agrupado,
   botões e o passeio cinematográfico da câmera. Sobe o próprio servidor.

   O socket.io é BLOQUEADO de propósito: com servidor no ar o lobby do BR
   abre por cima e cobre o menu base. Sem `window.io` o jogo cai no modo
   solo e a tela inicial aparece como o jogador de solo a vê.

   Uso: node scripts/capture-menu.js [porta]   (padrão 3700) */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  process.env.CHROME_PATH || ''].find(p => p && fs.existsSync(p));
const PORT = +(process.argv[2] || 3700);
const output = path.join(__dirname, '..', 'output', 'menu');
const SIZES = [[1920, 1080], [1366, 768], [900, 600]];
const SHOTS = ['cidade', 'castelo', 'vulcao', 'carro'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!CHROME) throw new Error('Chrome local não encontrado');
  fs.mkdirSync(output, { recursive: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), WORLD_SEED: '424242' }, stdio: 'ignore',
  });
  await sleep(900);
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', '--window-size=1920,1080',
      '--enable-precise-memory-info'],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', r => {
      if (r.url().includes('/socket.io/')) r.abort().catch(() => {});
      else r.continue().catch(() => {});
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (t.startsWith('Failed to load resource')) return; // socket.io bloqueado de propósito
      errors.push(t);
    });

    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      "window.__game && window.__game.MenuCam && document.querySelector('#title .ln')",
      { timeout: 90000, polling: 200 });
    await sleep(2500); // deixa o mundo assentar e o prewarm rodar

    /* 1. as três larguras exigidas */
    for (const [w, h] of SIZES) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.evaluate(() => window.__game.MenuCam.goTo('cidade'));
      await sleep(1400);
      await page.screenshot({ path: path.join(output, `menu-${w}x${h}.png`) });
    }

    /* 2. cada plano do passeio (framing da câmera) em 1920 */
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    for (const key of SHOTS) {
      await page.evaluate(k => window.__game.MenuCam.goTo(k), key);
      await sleep(1600);
      await page.screenshot({ path: path.join(output, `shot-${key}.png`) });
    }

    /* 3. configurações abertas + estado de pausa (tem que ser sóbrio) */
    await page.evaluate(() => document.getElementById('btnSettings').click());
    await sleep(500);
    await page.screenshot({ path: path.join(output, 'settings-1920x1080.png') });
    await page.evaluate(() => document.getElementById('btnBack').click());
    await sleep(300);
    await page.evaluate(() => {
      const ov = document.getElementById('overlay');
      ov.classList.add('paused');
      document.getElementById('pausedTag').style.display = 'block';
    });
    await sleep(400);
    await page.screenshot({ path: path.join(output, 'pausa-1920x1080.png') });
    await page.evaluate(() => {
      document.getElementById('overlay').classList.remove('paused');
      document.getElementById('pausedTag').style.display = '';
    });

    /* 3b. foco por teclado: a seta tem que mover o foco e o anel tem que aparecer */
    await page.keyboard.press('ArrowDown');
    await sleep(400);
    await page.screenshot({ path: path.join(output, 'foco-teclado.png') });
    const foco = await page.evaluate(() => ({
      ativo: document.activeElement.id,
      anel: getComputedStyle(document.activeElement).outlineWidth,
    }));

    /* 4. custo do passeio. Medir frameMs sob swiftshader não diz nada (a
       rasterização por software domina em segundos por frame), então o que
       vale é o custo do próprio passeio: N chamadas de update() cronometradas
       + variação de heap, que denuncia alocação por frame. */
    await page.evaluate(() => window.__game.MenuCam.goTo('vulcao'));
    /* corte de câmera: avançar além da duração do plano tem que trocar de
       plano E escrever a opacidade do #menuCut (o dip-to-black) */
    const corte = await page.evaluate(() => {
      const cam = window.__game.MenuCam, el = document.getElementById('menuCut');
      cam.goTo('carro');
      const antes = cam.shot;
      let pico = 0;
      for (let i = 0; i < 700; i++) { cam.update(1 / 60); pico = Math.max(pico, +el.style.opacity || 0); }
      return { antes, depois: cam.shot, picoDoDip: +pico.toFixed(2), opacidadeFinal: el.style.opacity || '0' };
    });

    const perf = await page.evaluate(() => {
      const cam = window.__game.MenuCam, N = 20000;
      for (let i = 0; i < 2000; i++) cam.update(1 / 600); // aquece o JIT
      const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      const t0 = performance.now();
      for (let i = 0; i < N; i++) cam.update(1 / 600);
      const dt = performance.now() - t0;
      const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;
      cam.goTo('cidade');
      return {
        chamadas: N,
        usPorFrame: +(dt * 1000 / N).toFixed(2),
        heapDeltaBytesPorChamada: +((heap1 - heap0) / N).toFixed(2),
      };
    });

    const geo = await page.evaluate(() => ({
      grupos: document.querySelectorAll('.ctlGroup').length,
      linhas: document.querySelectorAll('.ctl').length,
      teclas: document.querySelectorAll('.key').length,
      letras: document.querySelectorAll('#title .ln').length,
      menuCut: !!document.getElementById('menuCut'),
      launchFx: !!document.getElementById('launchFx'),
      settingsPai: document.getElementById('settings').parentElement.id,
      overflowX: document.documentElement.scrollWidth <= window.innerWidth,
    }));
    /* 5. clarão de "entrando no jogo". Congelado à mão: sob swiftshader um
       frame leva segundos e a animação de 0,52 s acaba antes do snapshot. */
    await page.evaluate(() => {
      const fx = document.getElementById('launchFx');
      fx.style.animation = 'none';
      fx.style.opacity = '0.92';
      fx.style.transform = 'scale(1.02)';
    });
    await sleep(400);
    await page.screenshot({ path: path.join(output, 'launch-flash.png') });
    await page.evaluate(() => {
      const fx = document.getElementById('launchFx');
      fx.style.animation = fx.style.opacity = fx.style.transform = '';
    });

    /* 6. transição real: clica NOVO JOGO e mostra o primeiro frame de jogo
       (prova que o menu sai e a grama já está pronta no spawn) */
    await page.evaluate(() => document.getElementById('btnNew').click());
    await sleep(2500);
    await page.screenshot({ path: path.join(output, 'primeiro-frame-de-jogo.png') });

    console.log('menu capturado →', JSON.stringify(geo));
    console.log('foco por teclado →', JSON.stringify(foco));
    console.log('corte de câmera  →', JSON.stringify(corte));
    console.log('custo do passeio →', JSON.stringify(perf));
    if (errors.length) { console.error('ERROS:'); for (const e of errors) console.error('  ' + e); }
    else console.log('sem erros de página');
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
