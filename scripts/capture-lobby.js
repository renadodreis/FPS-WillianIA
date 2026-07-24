/* Captura do LOBBY: preview 3D do boneco + presets. Sobe o próprio servidor.
   Uso: node scripts/capture-lobby.js [porta] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  process.env.CHROME_PATH || ''].find(p => p && fs.existsSync(p));
const PORT = +(process.argv[2] || 3267);
const output = path.join(__dirname, '..', 'output', 'lobby');

(async () => {
  if (!CHROME) throw new Error('Chrome local não encontrado');
  fs.mkdirSync(output, { recursive: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), WORLD_SEED: '424242' }, stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 900));
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
      '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', '--window-size=1280,780'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 780, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    // espera o BR conectar, br-game carregar (buildBody) e o lobby aparecer com o preview
    await page.waitForFunction(
      "window.__BR_debug && typeof window.__BR_debug.buildBody === 'function' && document.getElementById('brPreview') && document.getElementById('brPreview').offsetParent !== null",
      { timeout: 60000, polling: 200 });
    await new Promise(r => setTimeout(r, 900)); // deixa o preview girar alguns frames
    await page.screenshot({ path: path.join(output, 'lobby-default.png') });
    // aplica um preset (Neon) e captura de novo
    await page.evaluate(() => { const b = document.querySelector('.brPreset[data-p="3"]'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: path.join(output, 'lobby-preset-neon.png') });
    const has = await page.evaluate(() => ({
      presets: document.querySelectorAll('.brPreset').length,
      random: !!document.getElementById('brRandom'),
      preview: !!document.getElementById('brPreview'),
      buildBody: typeof window.__BR_debug.buildBody === 'function',
    }));
    console.log('lobby capturado →', JSON.stringify(has));
    if (errors.length) { console.error('ERROS:'); for (const e of errors) console.error('  ' + e); }
    else console.log('sem erros de página');
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
