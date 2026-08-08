/* Captura de VALIDAÇÃO das armas: hip, ADS, tiro e recarga de cada índice,
   pra comparar antes/depois da calibração de mira (weaponrig).
   Uso: node scripts/capture-weapons.js [porta] [pastaSaida] [--armas=3,6] [--modos=hip,ads]

   Os filtros existem porque cada quadro custa ~1,5 min sob swiftshader: a
   varredura completa (8 armas x 4 modos) passa de 30 min, e quase sempre a
   pergunta é sobre UMA arma. Sem filtro, o comportamento é o de sempre. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH || ''].find(p => p && fs.existsSync(p));
const args = process.argv.slice(2);
const flag = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).split(',').filter(Boolean) : null;
};
const positional = args.filter(a => !a.startsWith('--'));
const PORT = +(positional[0] || 3213);
const output = path.resolve(positional[1] || path.join(__dirname, '..', 'output', 'weapons'));
const onlyWeapons = flag('armas') && new Set(flag('armas').map(Number));
const onlyModes = flag('modos') && new Set(flag('modos'));

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
    page.on('console', m => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__game && window.__game.WeaponModels', { timeout: 60000, polling: 250 });
    await page.evaluate(async () => {
      const G = window.__game, MP = window.__MP;
      window.__MP_active = true; window.__MP_respawn = () => {};
      window.__BR_active = true;
      G.forceStart();
      await G.WeaponModels.ready;
      for (let i = 0; i < 200 && !(G.FpBody.ready || G.FpBody.failed); i++)
        await new Promise(r => setTimeout(r, 100));
      MP.player.pos.set(30, MP.groundAt(30, 30, 999), 30);
      MP.player.vel.set(0, 0, 0);
      G.Env.tod = 0.5;
      MP.camera.rotation.set(0, 0.6, 0);
    });
    await page.addStyleTag({ content: 'body > :not(#game) { display:none !important; }' });

    const nWeapons = await page.evaluate(() => window.__game.arsenal.length);
    for (let i = 0; i < nWeapons; i++) {
      if (onlyWeapons && !onlyWeapons.has(i)) continue;
      for (const mode of ['hip', 'ads', 'fire', 'reload']) {
        if (onlyModes && !onlyModes.has(mode)) continue;
        const report = await page.evaluate(setup => {
          const G = window.__game, MP = window.__MP;
          G.arsenal[setup.idx].locked = false;
          G.switchWeapon(setup.idx);
          const gun = G.gun;
          gun.reloading = false;
          gun.mag = gun.magSize; gun.reserve = Math.max(gun.reserve, 10);
          G.state.paused = false;
          G.mouse.aiming = setup.mode === 'ads' || setup.mode === 'fire';
          for (let k = 0; k < 90; k++) G.tick(1 / 60); // saque + ADS até o repouso
          if (setup.mode === 'fire') {
            G.mouse.clicked = true; G.mouse.shooting = true;
            G.tick(1 / 60); G.tick(1 / 60); // flash/recuo visíveis
            G.mouse.shooting = false;
          }
          if (setup.mode === 'reload') {
            gun.mag = Math.max(0, gun.magSize - 2);
            gun.reloading = true;
            gun.reloadEnd = G.state.gameTime + 0.5 * gun.reloadTime + 1 / 30; // k ≈ 0.5
            G.tick(1 / 60);
          }
          G.state.paused = true;
          G.mouse.aiming = false;
          MP.camera.updateMatrixWorld(true);
          MP.renderer.render(MP.scene, MP.camera);
          return { arma: gun.name, modelo: gun.modelStatus || 'procedural' };
        }, { idx: i, mode });
        await new Promise(r => setTimeout(r, 40));
        const canvas = await page.$('#game');
        const file = `w${i}-${mode}.png`;
        await canvas.screenshot({ path: path.join(output, file) });
        console.log(`${file}  →  ${JSON.stringify(report)}`);
      }
    }
    if (errors.length) { console.error('\nERROS DE PÁGINA:'); for (const e of errors) console.error('  ' + e); }
    else console.log('\nsem erros de página');
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch(e => { console.error(e); process.exit(1); });
