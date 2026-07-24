/* Captura das atrações do mapa: canhão + curso de argolas (arco balístico),
   marcos (mastro/bandeirola) e visão do jogador chegando. Sobe o próprio
   servidor. Uso: node scripts/capture-toys.js [porta] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  process.env.CHROME_PATH || ''].find(p => p && fs.existsSync(p));
const PORT = +(process.argv[2] || 3268);
const output = path.join(__dirname, '..', 'output', 'toys');

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
      '--use-gl=angle', '--use-angle=swiftshader', '--mute-audio', '--window-size=1280,720'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => { window.requestAnimationFrame = () => 0; });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__game && window.__game.MapToys', { timeout: 60000, polling: 250 });
    await page.evaluate(() => {
      const G = window.__game;
      window.__MP_active = true; window.__MP_respawn = () => {};
      window.__BR_active = true;
      G.forceStart();
      G.Env.tod = 0.5; G.state.paused = true;
    });
    await page.addStyleTag({ content: 'body > :not(#game) { display:none !important; }' });
    const canvas = await page.$('#game');
    const shot = async (name, setCam) => {
      await page.evaluate(setCam);
      await new Promise(r => setTimeout(r, 50));
      await page.evaluate(() => { const MP = window.__MP; MP.camera.updateMatrixWorld(true); MP.renderer.render(MP.scene, MP.camera); });
      await page.$eval('#game', c => { c.style.width = '1280px'; c.style.height = '720px'; });
      await canvas.screenshot({ path: path.join(output, name) });
      console.log('→', name);
    };
    // 1) LATERAL ao curso: canhão + as 5 argolas do arco balístico de uma vez
    await shot('canhao-curso.png', () => {
      const G = window.__game, MP = window.__MP;
      const c = G.Cannon.spot, L = G.MapToys.rings.list;
      const mid = L[2];
      // perpendicular ao curso, 40 m de lado, altura segura acima do terreno
      const dx = mid.x - c.x, dz = mid.z - c.z, dl = Math.hypot(dx, dz) || 1;
      const px = mid.x + (-dz / dl) * 40, pz = mid.z + (dx / dl) * 40;
      MP.camera.position.set(px, Math.max(G.heightAt(px, pz) + 3, mid.y + 2), pz);
      MP.camera.lookAt(mid.x, mid.y - 4, mid.z);
    });
    // 2) jogador a ~60 m da cama elástica: o MASTRO tem que denunciar a atração
    await shot('marco-de-longe.png', () => {
      const G = window.__game, MP = window.__MP;
      const t = G.MapToys.spots.tramp;
      const y = G.heightAt(t.x + 55, t.z + 25);
      MP.camera.position.set(t.x + 55, y + 1.62, t.z + 25);
      MP.camera.lookAt(t.x, G.heightAt(t.x, t.z) + 5, t.z);
    });
    // 3) close da cama elástica com o mastro
    await shot('cama-elastica.png', () => {
      const G = window.__game, MP = window.__MP;
      const t = G.MapToys.spots.tramp;
      MP.camera.position.set(t.x + 9, G.heightAt(t.x + 9, t.z + 7) + 2.4, t.z + 7);
      MP.camera.lookAt(t.x, G.heightAt(t.x, t.z) + 2, t.z);
    });
    if (errors.length) { console.error('ERROS:'); for (const e of errors) console.error('  ' + e); }
    else console.log('sem erros de página');
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
