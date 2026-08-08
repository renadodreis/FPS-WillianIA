/* CRÍTICO VISUAL — captura consolidada (1 boot):
   gamefeel (hitmarker/dano/escudo/explosão), muzzle flash (w0/w1/w4),
   interior da Torre Nexus (5 poses), baú (3 estados), cidade destruída.
   Uso: node scripts/critic-final.js 3760 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withCaptureResources } = require('./capture-world.js');

const PORT = +(process.argv[2] || 3760);
const OUT = path.join(__dirname, '..', 'output', 'critic-final');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const errors = [];
  await withCaptureResources(async browser => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(() => {
      window.requestAnimationFrame = () => 0;
      window.__MP_active = true;
      window.__MP_respawn = () => {};
      window.__BR_active = true;
    });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__game && window.__MP && window.__game.buildChest', { timeout: 90000, polling: 250 });
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      if (MP.socket && MP.socket.io && typeof MP.socket.io.off === 'function') MP.socket.io.off('reconnect');
      G.forceStart();
      for (const a of (G.Animals && G.Animals.list) || []) a.alive = false;
      G.Env.tod = 0.5;
      const origRender = MP.composer.render.bind(MP.composer);
      MP.composer.render = () => {};
      MP.renderer.info.autoReset = false;
      window.CRR = () => { MP.renderer.info.reset(); try { origRender(); } catch { MP.renderer.render(MP.scene, MP.camera); } };
    });
    await new Promise(r => setTimeout(r, 4000));
    // esconde o lobby BR mas mantém o HUD do jogo
    await page.addStyleTag({ content: '#overlay, .brPanel { display:none !important; }' });

    async function full(name) {
      await new Promise(r => setTimeout(r, 120));
      await page.screenshot({ path: path.join(OUT, name) });
      console.log('ok', name);
    }
    async function canvasShot(name) {
      await new Promise(r => setTimeout(r, 80));
      const canvas = await page.$('#game');
      await canvas.screenshot({ path: path.join(OUT, name) });
      console.log('ok', name);
    }

    // congelador dos avisos curtos (mesma técnica do capture-gamefeel)
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

    // fundo de jogo real atrás do HUD (não o void): posiciona no campo e renderiza
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      const P = MP.player;
      P.pos.set(30, MP.groundAt(30, 30, 999), 30);
      G.state.cinematic = false;
      G.tick(1 / 60);
      MP.camera.position.set(P.pos.x, P.pos.y + 1.62, P.pos.z);
      MP.camera.lookAt(P.pos.x + 20, P.pos.y + 1.4, P.pos.z + 4);
      MP.camera.updateMatrixWorld(true);
      G.tick(1 / 60);
      window.CRR();
    });

    // --- 1. hitmarkers ---
    for (const flavor of ['hit', 'head', 'kill']) {
      await page.evaluate(f => {
        window.__capKeep = [];
        document.getElementById('hitmarker').className = '';
        window.__MP.showHitmarker(f);
        window.__capFreeze(['hitmarker']);
      }, flavor);
      await full(`hitmarker-${flavor}.png`);
    }

    // --- 2. dano recebido / perigo / escudo ---
    const danoShot = async (name, setup, freeze) => {
      await page.evaluate(() => {
        window.__capKeep = [];
        document.getElementById('hitmarker').className = '';
      });
      await page.evaluate(setup);
      await page.evaluate(ids => window.__capFreeze(ids), freeze);
      await full(name);
      await new Promise(r => setTimeout(r, 900));
    };
    await danoShot('dano-recebido.png', () => {
      const MP = window.__MP;
      MP.player.health = 100; MP.player.armor = 0; MP.player.invulnUntil = 0;
      MP.playerDamage(37, null, { type: 'demo' });
    }, ['hfTook']);
    await danoShot('dano-perigo.png', () => {
      const MP = window.__MP;
      MP.player.health = 40; MP.player.armor = 0; MP.player.invulnUntil = 0;
      MP.playerDamage(30, null, { type: 'demo' });
    }, ['hfTook']);
    await danoShot('escudo-quebrando.png', () => {
      const MP = window.__MP;
      MP.player.health = 100; MP.player.armor = 6; MP.player.invulnUntil = 0;
      MP.playerDamage(40, null, { type: 'demo' });
    }, ['hfTook', 'armorFill']);

    // --- 3. explosão remota (fx) ---
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      MP.camera.lookAt(MP.player.pos.x + 8, MP.player.pos.y + 1, MP.player.pos.z);
      MP.camera.updateMatrixWorld(true);
      const at = new MP.THREE.Vector3(MP.player.pos.x + 8, MP.player.pos.y + 0.8, MP.player.pos.z);
      G.Grenades.explodeFx(at);
      window.CRR();
    });
    await full('explosao-remota.png');

    // --- 4. muzzle flash: w0 (fuzil), w1 (escopeta), w4 (plasma) ---
    for (const idx of [0, 1, 4]) {
      const r = await page.evaluate(i => {
        const G = window.__game, MP = window.__MP;
        G.arsenal[i].locked = false;
        G.switchWeapon(i);
        const gun = G.gun;
        gun.reloading = false; gun.mag = gun.magSize; gun.reserve = Math.max(gun.reserve, 10);
        G.state.paused = false;
        G.mouse.aiming = false;
        for (let k = 0; k < 90; k++) G.tick(1 / 60);
        G.mouse.clicked = true; G.mouse.shooting = true;
        G.tick(1 / 60); G.tick(1 / 60);
        G.mouse.shooting = false;
        MP.camera.updateMatrixWorld(true);
        window.CRR();
        return { arma: gun.name };
      }, idx);
      console.log(JSON.stringify(r));
      await full(`fire-w${idx}.png`);
    }

    // --- 5. Torre Nexus interior (altura do olho) ---
    const TSHOTS = [
      { name: 'nexus-01-entrada', eye: [0, 1.62, 15], look: [0, 2.0, 0], day: true },
      { name: 'nexus-02-lobby', eye: [0, 1.62, 6], look: [-6.8, 1.6, -6], day: true },
      { name: 'nexus-07-poco', eye: [-4.4, 5.4, -3.0], look: [-6.9, 0.5, -6.5], day: true },
      { name: 'nexus-08-pav-intermediario', eye: [3, 18.9, 3], look: [-6, 18.9, -6], day: true },
      { name: 'nexus-11-noite', eye: [0, 1.62, 6], look: [-6.8, 1.6, -6], day: false },
    ];
    await page.evaluate(() => { window.__game.state.cinematic = true; });
    for (const s of TSHOTS) {
      await page.evaluate(sh => {
        const G = window.__game, MP = window.__MP, S = G.Structures;
        const C = S.city.center, gy = MP.heightAt(C.x, C.z);
        G.Env.tod = sh.day ? 0.5 : 0.92;
        G.state.cinematic = false; G.tick(1 / 60); G.state.cinematic = true;
        MP.player.pos.set(C.x + sh.eye[0], gy + sh.eye[1] - 1.62, C.z + sh.eye[2]);
        MP.camera.position.set(C.x + sh.eye[0], gy + sh.eye[1], C.z + sh.eye[2]);
        MP.camera.lookAt(C.x + sh.look[0], gy + sh.look[1], C.z + sh.look[2]);
        MP.camera.updateMatrixWorld(true);
        MP.weaponRoot.visible = false;
        window.CRR();
      }, s);
      await canvasShot(`${s.name}.png`);
    }

    // --- 6. cidade destruída (mecânica intencional) ---
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures;
      const C = S.city.center, gy = MP.heightAt(C.x, C.z);
      G.Env.tod = 0.5;
      if (S.city.getState() !== 'destroyed') S.city.destroy();
      MP.camera.position.set(C.x + 40, gy + 30, C.z + 55);
      MP.camera.lookAt(C.x, gy + 8, C.z);
      MP.camera.updateMatrixWorld(true);
      window.CRR();
    });
    await canvasShot('cidade-destruida.png');
    await page.evaluate(() => {
      const S = window.__game.Structures;
      if (S.city.getState() !== 'intact') S.city.restore();
    });

    // --- 7. baú: 3 estados ---
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      G.Env.tod = 0.5;
      const bx = 60, bz = 60, gy = MP.groundAt(bx, bz, 999);
      const closed = G.buildChest(); closed.group.position.set(bx - 1.7, MP.groundAt(bx - 1.7, bz, 999), bz); closed.group.rotation.y = 0.4; MP.scene.add(closed.group);
      const open = G.buildChest(); open.group.position.set(bx, gy, bz); open.group.rotation.y = 0.4; open.lid.rotation.x = -1.15; MP.scene.add(open.group);
      const looted = G.buildChest(); looted.group.position.set(bx + 1.7, MP.groundAt(bx + 1.7, bz, 999), bz); looted.group.rotation.y = 0.4;
      looted.lid.rotation.x = -1.15; looted.glow.emissiveIntensity = 0.12; looted.loot.visible = false; MP.scene.add(looted.group);
      MP.camera.position.set(bx, gy + 2.1, bz + 2.4);
      MP.camera.lookAt(bx, gy + 0.3, bz);
      MP.camera.updateMatrixWorld(true);
      window.CRR();
    });
    await canvasShot('bau-3-estados.png');

    if (errors.length) console.log('ERROS DE PÁGINA:\n' + errors.map(e => '  ' + e).join('\n'));
    else console.log('sem erros de página');
  }, { port: PORT });
}
main().catch(e => { console.error(e); process.exitCode = 1; });
