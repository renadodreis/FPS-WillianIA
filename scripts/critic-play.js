/* CRÍTICO VISUAL — playthrough real na altura do olho (1,62 m).
   Anda, entra em interior, sobe torre, visita atrações, acha segredo,
   atira no campo de tiro. Screenshots FULL PAGE (HUD visível).
   Uso: node scripts/critic-play.js 3760 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { withCaptureResources } = require('./capture-world.js');

const PORT = +(process.argv[2] || 3760);
const OUT = path.join(__dirname, '..', 'output', 'critic-play');

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
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => {
      if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__game && window.__MP', { timeout: 90000, polling: 250 });

    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      window.__MP_active = true; window.__MP_respawn = () => {};
      if (MP.socket && MP.socket.io && typeof MP.socket.io.off === 'function') MP.socket.io.off('reconnect');
      G.forceStart();
      G.Env.tod = 0.5;
    });
    await page.waitForFunction('window.__game.Structures.castle.status === "ready"', { timeout: 90000, polling: 500 });
    await new Promise(r => setTimeout(r, 5000)); // demais GLBs de mundo
    // o lobby BR cobre a tela no QA — some com ele, mas mantém o HUD de jogo
    await page.addStyleTag({ content: '#overlay, .brPanel { display:none !important; }' });
    const boot = await page.evaluate(() => {
      const G = window.__game;
      const MP = window.__MP;
      return {
        spawn: [MP.player.pos.x, MP.player.pos.y, MP.player.pos.z].map(v => +v.toFixed(1)),
        sites: G.Structures.sites.map(s => ({ t: s.type, x: s.x | 0, z: s.z | 0 })),
        toys: G.MapToys.spots,
        nest: G.Secrets.nest,
        vault: G.Secrets.vault,
        tablet: G.Secrets.tablet,
        interiors: G.Structures.cityInteriors.map(i => ({ bx: +i.bx.toFixed(1), bz: +i.bz.toFixed(1), gy: +i.gy.toFixed(2), d: +(i.d || 0).toFixed(1) })),
      };
    });
    console.log('BOOT ' + JSON.stringify(boot));

    // helpers no browser
    await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      // SwiftShader: render por tick custa segundos — sim roda sem pixels,
      // e só CR.render() pinta um frame de verdade (padrão do harness de QA)
      const origRender = MP.composer.render.bind(MP.composer);
      MP.composer.render = () => {};
      MP.renderer.info.autoReset = false;
      window.CR = {
        origRender,
        place(x, z, lx, lz, ly) {
          const P = MP.player;
          const y = MP.groundAt(x, z, 999);
          P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.onGround = true;
          P.dead = false; P.health = P.maxHealth;
          G.state.cinematic = false;
          G.tick(1 / 60);
          MP.camera.position.set(P.pos.x, P.pos.y + 1.62, P.pos.z);
          MP.camera.lookAt(lx, ly !== undefined ? ly : P.pos.y + 1.62, lz);
          MP.camera.updateMatrixWorld(true);
          G.tick(1 / 60);
        },
        walk(sec) {
          G.keys['KeyW'] = true;
          for (let i = 0; i < Math.round(sec * 60); i++) G.tick(1 / 60);
          G.keys['KeyW'] = false; G.tick(1 / 60);
        },
        look(lx, lz, ly) {
          const P = MP.player.pos;
          MP.camera.position.set(P.x, P.y + 1.62, P.z);
          MP.camera.lookAt(lx, ly !== undefined ? ly : P.y + 1.62, lz);
          MP.camera.updateMatrixWorld(true);
        },
        render() {
          MP.renderer.info.reset();
          try { window.CR.origRender(); } catch { MP.renderer.render(MP.scene, MP.camera); }
        },
        stats() {
          const info = MP.renderer.info;
          return { calls: info.render.calls, tris: info.render.triangles,
            pos: [MP.player.pos.x | 0, MP.player.pos.y | 0, MP.player.pos.z | 0],
            perf: G.perf ? JSON.parse(JSON.stringify(G.perf)) : null };
        },
      };
    });

    async function shot(name, info) {
      await new Promise(r => setTimeout(r, 100));
      await page.screenshot({ path: path.join(OUT, name) });
      console.log(`${name}  →  ${JSON.stringify(info || {})}`);
    }

    // ---------- 1. SPAWN + 360 (findability) ----------
    const sp = boot.spawn;
    for (const [suf, dx, dz] of [['n', 0, -50], ['e', 50, 0], ['s', 0, 50], ['w', -50, 0]]) {
      const r = await page.evaluate(([x, z, dx, dz]) => {
        window.CR.place(x, z, x + dx, z + dz);
        window.CR.render();
        return window.CR.stats();
      }, [sp[0], sp[2], dx, dz]);
      await shot(`01-spawn-360-${suf}.png`, r);
    }

    // ---------- 2. caminhada até a cidade ----------
    let r = await page.evaluate(() => {
      window.CR.place(-180, 118, -340, 130);
      window.CR.walk(4);
      window.CR.look(-340, 130);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('02-walk-to-city.png', r);

    // rua da cidade na altura do olho
    r = await page.evaluate(() => {
      window.CR.place(-262, 130, -340, 130);
      window.CR.walk(5);
      window.CR.look(-340, 130);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('03-city-street-eye.png', r);

    // ---------- 3. interior oco (o mais próximo) ----------
    r = await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      const it = G.Structures.cityInteriors[0];
      // porta: fica de frente pro centro do lote — aproxima por fora e anda pra dentro
      const ang = Math.atan2(130 - it.bz, -340 - it.bx); // direção lote→centro da cidade
      const ox = it.bx + Math.cos(ang) * 9, oz = it.bz + Math.sin(ang) * 9;
      window.CR.place(ox, oz, it.bx, it.bz);
      window.CR.walk(3.5);
      window.CR.look(it.bx, it.bz);
      window.CR.render();
      const s = window.CR.stats();
      s.interior = { bx: it.bx, bz: it.bz, playerDist: Math.hypot(MP.player.pos.x - it.bx, MP.player.pos.z - it.bz).toFixed(1) };
      return s;
    });
    await shot('04-interior-walkin.png', r);

    r = await page.evaluate(() => {
      const G = window.__game;
      const it = G.Structures.cityInteriors[0];
      window.CR.place(it.bx + 2.5, it.bz + 2.5, it.bx - 4, it.bz - 4);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('05-interior-inside.png', r);

    // ---------- 4. torre de vigia ----------
    r = await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      const P = MP.player.pos;
      const t = G.Structures.sites.filter(s => s.type === 'torre')
        .sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      window.CR.place(t.x + 14, t.z + 14, t.x, t.z, MP.groundAt(t.x, t.z, 999) - 2);
      window.CR.render();
      const s = window.CR.stats(); s.tower = { x: t.x | 0, z: t.z | 0 }; return s;
    });
    await shot('06-tower-base.png', r);

    r = await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      const P = MP.player.pos;
      const t = G.Structures.sites.filter(s => s.type === 'torre')
        .sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      // sobe: teleporta pro topo (groundAt de cima acha a plataforma mais alta)
      const topY = MP.groundAt(t.x, t.z, 999);
      MP.player.pos.set(t.x, topY, t.z); MP.player.vel.set(0, 0, 0);
      G.tick(1 / 60);
      window.CR.look(-340, 130, topY - 4); // olha pra cidade do alto
      window.CR.render();
      const s = window.CR.stats(); s.topY = +topY.toFixed(1); return s;
    });
    await shot('07-tower-top-view.png', r);

    // meia-escada (altura intermediária dentro da torre)
    r = await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      const P = MP.player.pos;
      const t = G.Structures.sites.filter(s => s.type === 'torre')
        .sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
      const gy = MP.heightAt(t.x, t.z);
      // plataformas da torre entre o chão e o topo
      const plats = (G.platforms || []).filter(p => Math.hypot((p.x ?? p.cx ?? 0) - t.x, (p.z ?? p.cz ?? 0) - t.z) < 8);
      const mid = plats.length ? plats[Math.floor(plats.length / 2)] : null;
      const my = mid ? (mid.y ?? mid.cy ?? gy + 4) : gy + 4;
      MP.player.pos.set(t.x + 1, my + 0.1, t.z + 1); MP.player.vel.set(0, 0, 0);
      G.tick(1 / 60);
      window.CR.look(t.x, t.z, my + 3); // olha escada acima
      window.CR.render();
      const s = window.CR.stats(); s.plats = plats.length; s.midY = +my.toFixed(1); return s;
    });
    await shot('08-tower-stairs.png', r);

    // ---------- 5. atrações: cama elástica + campo de tiro ----------
    r = await page.evaluate(() => {
      const G = window.__game;
      const tr = G.MapToys.spots.tramp;
      window.CR.place(tr.x + 10, tr.z + 10, tr.x, tr.z, tr.y + 1);
      window.CR.walk(2);
      window.CR.look(tr.x, tr.z, tr.y + 1);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('09-toy-trampoline.png', r);

    r = await page.evaluate(() => {
      const G = window.__game;
      const g = G.MapToys.spots.gallery;
      window.CR.place(g.x, g.z + 7, g.x, g.z - 1.7, g.y + 1.4);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('10-toy-gallery.png', r);

    // atira nos alvos com a galeria ativa
    r = await page.evaluate(() => {
      const G = window.__game;
      G.MapToys.startGallery();
      for (let i = 0; i < 40; i++) G.tick(1 / 60); // alvos sobem
      const alvo = G.extraTargets.find(t => t.alive && t.mesh && t.mesh.visible);
      if (alvo) {
        const p = alvo.pos();
        window.CR.look(p.x, p.z, p.y);
        G.mouse.shooting = true;
        for (let i = 0; i < 10; i++) G.tick(1 / 60);
        G.mouse.shooting = false;
        G.tick(1 / 60);
      }
      window.CR.render();
      const s = window.CR.stats();
      s.gallery = G.MapToys.gallery; return s;
    });
    await shot('11-gallery-shooting.png', r);

    // ---------- 6. segredo: ninho do atirador ----------
    r = await page.evaluate(() => {
      const G = window.__game;
      const n = G.Secrets.nest;
      if (!n) return { erro: 'sem ninho' };
      // de longe: o feixe vermelho aparece?
      window.CR.place(n.x + 60, n.z + 60, n.x, n.z, n.y + 2);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('12-secret-nest-far.png', r);

    r = await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      const n = G.Secrets.nest;
      if (!n) return { erro: 'sem ninho' };
      MP.player.pos.set(n.x + 2, n.y + 0.2, n.z + 2); MP.player.vel.set(0, 0, 0);
      G.tick(1 / 60);
      window.CR.look(n.x, n.z, n.y + 0.4);
      window.CR.render();
      const s = window.CR.stats(); s.taken = G.Secrets.taken; return s;
    });
    await shot('13-secret-nest-close.png', r);

    // cofre na cidade (só o visual da porta acesa/cadeado)
    r = await page.evaluate(() => {
      const G = window.__game;
      const v = G.Secrets.vault;
      if (!v) return { erro: 'sem cofre' };
      window.CR.place(v.x + 5, v.z + 5, v.x, v.z, v.y + 0.8);
      window.CR.render();
      const s = window.CR.stats(); s.vault = v; return s;
    });
    await shot('14-secret-vault.png', r);

    // ---------- 7. perf: parado vs andando na cidade ----------
    const perf = await page.evaluate(() => {
      const G = window.__game, MP = window.__MP;
      MP.renderer.info.autoReset = false;
      const probe = (x, z, walk) => {
        window.CR.place(x, z, -340, 130);
        if (walk) window.CR.walk(3);
        MP.renderer.info.reset();
        window.CR.render();
        const i = MP.renderer.info.render;
        return { calls: i.calls, tris: i.triangles };
      };
      const cidadeParado = probe(-330, 122, false);
      const cidadeAndando = probe(-300, 122, true);
      const campoParado = probe(30, 30, false);
      return { cidadeParado, cidadeAndando, campoParado,
        perf: G.perf ? JSON.parse(JSON.stringify(G.perf)) : null,
        quality: { scale: G.renderQuality.scale, ceiling: G.renderQuality.ceiling } };
    });
    console.log('PERF ' + JSON.stringify(perf));

    // golden hour na cidade (direção de arte)
    r = await page.evaluate(() => {
      const G = window.__game;
      G.Env.tod = 0.715;
      window.CR.place(-290, 100, -340, 130);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('15-city-golden-hour.png', r);

    // noite na rua da cidade
    r = await page.evaluate(() => {
      const G = window.__game;
      G.Env.tod = 0.0;
      window.CR.place(-330, 122, -360, 130);
      window.CR.render();
      return window.CR.stats();
    });
    await shot('16-city-night.png', r);

    if (errors.length) console.log('ERROS DE PÁGINA:\n' + errors.map(e => '  ' + e).join('\n'));
    else console.log('sem erros de página');
  }, { port: PORT });
}

main().catch(e => { console.error(e); process.exitCode = 1; });
