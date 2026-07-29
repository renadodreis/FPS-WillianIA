/* Captura do conteúdo novo do mapa (stream C): torre de vigia subível,
   térreos ocos da cidade e o segredo do xilofone. Sobe o próprio servidor.
   Uso: node scripts/capture-content.js [porta] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  process.env.CHROME_PATH || ''].find(p => p && fs.existsSync(p));
const PORT = +(process.argv[2] || 3741);
const output = path.join(__dirname, '..', 'output', 'content');

(async () => {
  if (!CHROME) throw new Error('Chrome local não encontrado');
  fs.mkdirSync(output, { recursive: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), WORLD_SEED: '424242' }, stdio: 'ignore',
  });
  await new Promise(r => setTimeout(r, 1200));
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
    await page.waitForFunction('window.__game && window.__game.MapToys', { timeout: 90000, polling: 250 });
    await page.evaluate(() => {
      const G = window.__game;
      window.__MP_active = true; window.__MP_respawn = () => {};
      window.__BR_active = false;   // solo: segredos ativos
      G.forceStart();
      G.Env.tod = 0.42; G.state.paused = true;
    });
    await page.addStyleTag({ content: 'body > :not(#game) { display:none !important; }' });
    const canvas = await page.$('#game');
    const shot = async (name, setCam, ...args) => {
      await page.evaluate(setCam, ...args);
      await new Promise(r => setTimeout(r, 60));
      await page.evaluate(() => {
        const MP = window.__MP;
        MP.camera.updateMatrixWorld(true);
        MP.renderer.render(MP.scene, MP.camera);
      });
      await page.$eval('#game', c => { c.style.width = '1280px'; c.style.height = '720px'; });
      await canvas.screenshot({ path: path.join(output, name) });
      console.log('→', name);
    };

    /* ---- 1) TORRE DE VIGIA: escada inteira, de fora ---- */
    await shot('torre-escada.png', () => {
      const G = window.__game, MP = window.__MP;
      const t = G.Structures.sites.filter(s => s.type === 'torre')[0];
      const y = G.heightAt(t.x, t.z);
      MP.camera.position.set(t.x + 16, y + 7.5, t.z + 13);
      MP.camera.lookAt(t.x + 2.5, y + 3.4, t.z);
    });
    /* ---- 2) TORRE: pé da escada, ponto de vista do jogador ---- */
    await shot('torre-pe.png', () => {
      const G = window.__game, MP = window.__MP;
      const t = G.Structures.sites.filter(s => s.type === 'torre')[0];
      const y = G.heightAt(t.x, t.z);
      MP.camera.position.set(t.x + 3.85, y + 1.62, t.z + 8);
      MP.camera.lookAt(t.x + 3.85, y + 4.2, t.z - 2);
    });
    /* ---- 3) TORRE: em cima do tampo, olhando o mundo ---- */
    await shot('torre-tampo.png', () => {
      const G = window.__game, MP = window.__MP;
      const t = G.Structures.sites.filter(s => s.type === 'torre')[0];
      const deck = G.platforms.find(p => p.role === 'deck' &&
        Math.hypot((p.x0 + p.x1) / 2 - t.x, (p.z0 + p.z1) / 2 - t.z) < 0.01);
      MP.camera.position.set(t.x, deck.y + 1.62, t.z + 1.0);
      MP.camera.lookAt(t.x, deck.y + 1.3, t.z - 20);
    });
    /* ---- 4) TORRE: contra-plongée do tampo (guarda-corpo/cobertura) ---- */
    await shot('torre-alto.png', () => {
      const G = window.__game, MP = window.__MP;
      const t = G.Structures.sites.filter(s => s.type === 'torre')[0];
      const y = G.heightAt(t.x, t.z);
      MP.camera.position.set(t.x + 11, y + 13, t.z + 9);
      MP.camera.lookAt(t.x + 1, y + 6, t.z);
    });

    /* ---- 5..8) TÉRREOS OCOS: fachada e interior ---- */
    for (let i = 0; i < 4; i++) {
      await shot(`cidade-oco-${i}-fora.png`, (idx) => {
        const G = window.__game, MP = window.__MP;
        const it = G.Structures.cityInteriors[idx];
        const e = it.plan.exits[0];
        const nx = e.face === 'E' ? 1 : e.face === 'O' ? -1 : 0;
        const nz = e.face === 'S' ? 1 : e.face === 'N' ? -1 : 0;
        MP.camera.position.set(it.bx + e.x + nx * 13, it.gy + 4.5, it.bz + e.z + nz * 13);
        MP.camera.lookAt(it.bx + e.x, it.gy + 1.6, it.bz + e.z);
      }, i);
      await shot(`cidade-oco-${i}-dentro.png`, (idx) => {
        const G = window.__game, MP = window.__MP;
        const it = G.Structures.cityInteriors[idx];
        const a = it.plan.exits[0], b = it.plan.exits[1];
        MP.camera.position.set(it.bx + a.x * 0.62, it.gy + 1.62, it.bz + a.z * 0.62);
        MP.camera.lookAt(it.bx + b.x, it.gy + 1.3, it.bz + b.z);
      }, i);
    }
    // "planta": câmera logo abaixo do teto olhando pra baixo — confere
    // cobertura, rota entre as portas e os vãos de uma vez só
    await shot('cidade-oco-planta.png', () => {
      const G = window.__game, MP = window.__MP;
      const it = G.Structures.cityInteriors[0];
      MP.camera.position.set(it.bx - it.lot.w / 2 + 0.9, it.gy + it.gfH - 0.35, it.bz - it.d / 2 + 0.9);
      MP.camera.lookAt(it.bx + 1, it.gy + 0.4, it.bz + 1);
    });

    /* ---- 9) o segredo do xilofone (tábua da melodia) ---- */
    await shot('segredo-xilofone.png', () => {
      const G = window.__game, MP = window.__MP;
      if (!G.Secrets || !G.Secrets.marks) return;
      const s = G.MapToys.spots.xylo;
      MP.camera.position.set(s.x, G.heightAt(s.x, s.z) + 4.2, s.z + 11);
      MP.camera.lookAt(s.x, G.heightAt(s.x, s.z) + 0.9, s.z - 1);
    });
    /* ---- 10) o ninho do atirador (torre marcada) ---- */
    await shot('segredo-ninho.png', () => {
      const G = window.__game, MP = window.__MP;
      if (!G.Secrets || !G.Secrets.nest) return;
      const n = G.Secrets.nest;   // em pé NO tampo, olhando o estojo
      MP.camera.position.set(n.x + 1.9, n.y + 1.62, n.z + 1.9);
      MP.camera.lookAt(n.x, n.y + 0.35, n.z);
    });
    await shot('segredo-ninho-longe.png', () => {
      const G = window.__game, MP = window.__MP;
      if (!G.Secrets || !G.Secrets.nest) return;
      const n = G.Secrets.nest;   // a pista vista de longe: o feixe vermelho
      MP.camera.position.set(n.x + 95, n.y + 22, n.z + 95);
      MP.camera.lookAt(n.x, n.y + 6, n.z);
    });
    /* ---- 11) o cofre lacrado (dentro do prédio oco) ---- */
    await shot('segredo-cofre.png', () => {
      const G = window.__game, MP = window.__MP;
      if (!G.Secrets || !G.Secrets.vault) return;
      const v = G.Secrets.vault, it = G.Structures.cityInteriors
        .find(i => Math.abs(v.x - i.bx) < i.lot.w && Math.abs(v.z - i.bz) < i.d);
      // do miolo da sala, como quem acabou de entrar
      const ox = it ? it.bx : v.x, oz = it ? it.bz : v.z;
      MP.camera.position.set(ox, v.y + 1.62, oz);
      MP.camera.lookAt(v.x, v.y + 0.55, v.z);
    });
    /* ---- 12) cidade destruída: nada do interior pode sobrar flutuando ---- */
    await shot('cidade-destruida.png', () => {
      const G = window.__game, MP = window.__MP;
      G.Structures.city.destroy();
      const it = G.Structures.cityInteriors[0];
      MP.camera.position.set(it.bx + 26, it.gy + 16, it.bz + 26);
      MP.camera.lookAt(it.bx, it.gy + 3, it.bz);
    });

    if (errors.length) console.log('ERROS DE PÁGINA:', errors.slice(0, 8));
    else console.log('sem erros de página');
  } finally {
    await browser.close();
    srv.kill('SIGTERM');
  }
})();
