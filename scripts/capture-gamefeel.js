/* Captura visual do GAME FEEL de combate: os três sabores de hitmarker,
   o contador de dano recebido (normal, com escudo e em perigo de morte),
   a quebra do escudo e o clarão da explosão remota. Sobe o próprio servidor.
   Uso: node scripts/capture-gamefeel.js [porta] */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer-core');

const CHROME = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH || ''].find(p => p && fs.existsSync(p));
const PORT = +(process.argv[2] || 3750);
const output = path.join(__dirname, '..', 'output', 'gamefeel');

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
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__game && window.__MP', { timeout: 60000 });
    await page.evaluate(() => {
      window.__MP_active = true; window.__MP_respawn = () => {};
      window.__BR_active = true;
      window.__game.forceStart();
      const P = window.__MP.player;
      P.pos.set(30, window.__MP.groundAt(30, 30, 999), 30);
      P.health = P.maxHealth; P.armor = 0; P.invulnUntil = 0;
    });
    await new Promise(r => setTimeout(r, 2500));

    // o lobby do BR fica por cima do HUD: some com ele pra fotografar a tela de jogo
    const hideLobby = () => page.evaluate(() => {
      for (const el of document.querySelectorAll('.brPanel')) el.style.display = 'none';
    });
    await hideLobby();
    /* Os avisos de combate são CURTOS de propósito (110–460 ms) e a captura
       headless com swiftshader é bem mais lenta que isso. Este congelador
       reaplica a classe até a foto sair — não muda o jogo, só a fotografia. */
    await page.evaluate(() => {
      window.__capKeep = [];
      setInterval(() => {
        for (const k of window.__capKeep) {
          const el = document.getElementById(k.id);
          if (el) el.className = k.cls;
        }
      }, 16);
      window.__capFreeze = ids => {
        window.__capKeep = ids.map(id => ({ id, cls: document.getElementById(id).className }));
      };
    });

    const shot2 = (n, f) => shot(n, f, ['hfTook']);
    const shot3 = (n, f) => shot(n, f, ['hfTook', 'armorFill']);
    const shot = async (name, setup, freeze = []) => {
      await hideLobby();
      await page.evaluate(() => {  // solta o congelador e limpa o quadro anterior
        window.__capKeep = [];
        document.getElementById('hitmarker').className = '';
      });
      await page.evaluate(setup);
      if (freeze.length) await page.evaluate(ids => window.__capFreeze(ids), freeze);
      await new Promise(r => setTimeout(r, 120)); // deixa a transição CSS assentar
      await page.screenshot({ path: path.join(output, name + '.png') });
      console.log('  ok', name);
    };

    /* --- os três sabores de hitmarker --- */
    for (const flavor of ['hit', 'head', 'kill']) {
      await hideLobby();
      await page.evaluate(() => { window.__capKeep = []; });
      await page.evaluate(f => window.__MP.showHitmarker(f), flavor);
      await page.evaluate(() => window.__capFreeze(['hitmarker']));
      await new Promise(r => setTimeout(r, 120));
      await page.screenshot({ path: path.join(output, 'hitmarker-' + flavor + '.png') });
      console.log('  ok hitmarker-' + flavor);
    }

    /* --- quanto eu tomei --- */
    await shot2('dano-recebido', () => {
      const MP = window.__MP;
      MP.player.health = 100; MP.player.armor = 0;
      MP.playerDamage(37, null, { type: 'demo' });
    });
    await new Promise(r => setTimeout(r, 900)); // fecha a janela de rajada
    await shot2('dano-com-escudo', () => {
      const MP = window.__MP;
      MP.player.health = 100; MP.player.armor = 50; MP.player.invulnUntil = 0;
      MP.playerDamage(40, null, { type: 'demo' });
    });
    await new Promise(r => setTimeout(r, 900));
    await shot2('dano-perigo-de-morte', () => {
      const MP = window.__MP;
      MP.player.health = 40; MP.player.armor = 0; MP.player.invulnUntil = 0;
      MP.playerDamage(30, null, { type: 'demo' });
    });
    await new Promise(r => setTimeout(r, 900));
    await shot3('escudo-quebrando', () => {
      const MP = window.__MP;
      MP.player.health = 100; MP.player.armor = 6; MP.player.invulnUntil = 0;
      MP.playerDamage(40, null, { type: 'demo' });
    });

    /* --- explosão remota (só efeito, zero dano) --- */
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      MP.camera.lookAt(MP.player.pos.x + 8, MP.player.pos.y + 1, MP.player.pos.z);
      const at = new MP.THREE.Vector3(MP.player.pos.x + 8, MP.player.pos.y + 0.8, MP.player.pos.z);
      G.Grenades.explodeFx(at);
    });
    await new Promise(r => setTimeout(r, 120));
    await page.screenshot({ path: path.join(output, 'explosao-remota.png') });
    console.log('  ok explosao-remota');

    if (errors.length) console.log('ERROS DE PÁGINA:', errors.slice(0, 5));
    console.log('capturas em', output);
  } finally {
    await browser.close();
    srv.kill();
  }
})();
