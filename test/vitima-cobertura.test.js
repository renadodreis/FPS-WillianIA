/* ================================================================
   ONDE A VÍTIMA TESTA A COBERTURA — laudo afb1ae8, §4.5 e §4.6.

   A vítima (br-game.js, `youWereHit`) recusava o dano se a reta do atirador
   até UM ponto — o pé + 1 m — batesse em algo. Dois jeitos de virar
   "imune e atirando":
   • mureta na altura da cintura: o tronco tampado e a cabeça de fora; todo
     tiro, inclusive na cabeça que a tela do atirador mostrava, era recusado;
   • debaixo do 1º lance da escada da Torre Nexus: o tronco DENTRO de um
     degrau (degrau segura bala e não corpo), vida 100, e ele atirava.

   (a) rede de verdade (BR): o anfitrião atira da altura do olho dele, por
       cima da mureta, e a vítima tem de perder vida; o controle é a parede
       alta, onde nada passa. E o muro de 1,70–1,82 m (laudo a9a4ffd, §4.7):
       tronco e centro da cabeça tampados, o alto do capacete de fora — a
       tela do atirador mostra, a vítima testava o OLHO (1,62 m) e recusava.
   (b) a escada: o jogador anda de quatro lados para debaixo dos degraus
       baixos; âncora = a malha DESENHADA do interior (paridade da reta para
       cima): nem o tronco nem o olho entram nela.

   Porta 4160.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 4160;
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('onde a vítima testa a cobertura', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT, flags: { cidade: false } });
  });
  after(async () => { if (host) host.close(); if (h) await h.close(); });

  /* põe a página em (x, z) e o host em `hp`, com o servidor aceitando os dois */
  async function cena(vx, vz, hp) {
    await h.play((x, z) => {
      window.QA.reset(x, z); window.QA.tick(4);
      const P = window.__MP.player; P.health = 100; P.armor = 0; P.invulnUntil = 0;
    }, vx, vz);
    for (let i = 0; i < 14; i++) { host.emit('state', { pos: hp, rotY: 0, heldWeapon: 'FUZIL' }); await sleep(30); }
    await sleep(1100);   // janelas de 1 s do servidor
  }

  it('(a) mureta na cintura e muro na altura do olho: com a cabeça de fora o tiro entra; com a parede alta, não', async t => {
    const c = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE;
      const o = new T.Vector3(), d = new T.Vector3();
      const bloqueia = (a, b) => { d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = d.length(); d.multiplyScalar(1 / L); o.set(a[0], a[1], a[2]); return MP.rayBlockedAt(o, d, L) < L - 0.15; };
      // os pontos que o atirador vê em pé: centro do tronco, da cabeça e o alto dela
      const achar = (hMin, hMax, vale) => {
        for (const w of G.Structures.walls) {
          if (w.noBullet || w.city) continue;
          const lx = w.x1 - w.x0, lz = w.z1 - w.z0;
          const fino = lx < 1.0 && lz > 2 ? 'x' : lz < 1.0 && lx > 2 ? 'z' : null;
          if (!fino) continue;
          const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
          for (const lado of [1, -1]) {
            const vx = fino === 'x' ? (lado > 0 ? w.x1 + 0.55 : w.x0 - 0.55) : cx;
            const vz = fino === 'z' ? (lado > 0 ? w.z1 + 0.55 : w.z0 - 0.55) : cz;
            const sx = fino === 'x' ? (lado > 0 ? w.x0 - 8 : w.x1 + 8) : cx;
            const sz = fino === 'z' ? (lado > 0 ? w.z0 - 8 : w.z1 + 8) : cz;
            const gv = MP.groundAt(vx, vz, 999), gs = MP.groundAt(sx, sz, 999);
            if (Math.abs(gv - MP.heightAt(vx, vz)) > 0.05 || Math.abs(gs - MP.heightAt(sx, sz)) > 0.05) continue;
            const alto = w.y1 - gv;
            if (alto < hMin || alto > hMax || Math.abs(gv - gs) > 0.4) continue;
            const olhoHost = [sx, gs + 1.6, sz];
            const tampa = hh => bloqueia(olhoHost, [vx, gv + hh, vz]);
            if (vale(tampa(1.1), tampa(1.66), tampa(1.86))) return { v: [vx, vz], host: [sx, gs, sz], olhoHost, alto };
          }
        }
        return null;
      };
      return {
        mureta: achar(1.12, 1.45, (t, c) => t && !c),
        muro: achar(1.70, 1.82, (t, c, topo) => t && c && !topo),
        parede: achar(2.6, 8, (t, c, topo) => t && c && topo),
      };
    });
    assert.ok(c.mureta, 'cenário: nenhuma mureta com o tronco tampado e a cabeça de fora');
    assert.ok(c.muro, 'cenário: nenhum muro com só o alto da cabeça de fora');
    assert.ok(c.parede, 'cenário: nenhuma parede alta');
    const pageId = await h.play(() => window.__MP.socket.id);
    const vida = {};
    for (const [nome, cc] of [['mureta', c.mureta], ['muro', c.muro], ['parede', c.parede]]) {
      await cena(cc.v[0], cc.v[1], cc.host);
      host.emit('shotHit', { targetId: pageId, dmg: 25, weapon: 'FUZIL', fromPos: cc.olhoHost });
      await sleep(400);
      vida[nome] = await h.play(() => { window.QA.tick(2); return window.__MP.player.health; });
    }
    t.diagnostic(`mureta de ${c.mureta.alto.toFixed(2)} m: vida ${vida.mureta}; muro de ${c.muro.alto.toFixed(2)} m: vida ${vida.muro}; parede de ${c.parede.alto.toFixed(2)} m: vida ${vida.parede}`);
    assert.ok(vida.mureta < 100, `com a cabeça por cima da mureta o tiro foi recusado (vida ${vida.mureta})`);
    assert.ok(vida.muro < 100, `com o alto da cabeça por cima do muro o tiro foi recusado (vida ${vida.muro})`);
    assert.equal(vida.parede, 100, `o tiro atravessou a parede alta (vida ${vida.parede})`);
  });

  it('(b) escada da Torre: andando para debaixo dos degraus baixos, nem o tronco nem o olho entram no desenho', async t => {
    const r = await h.play(() => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, QA = window.QA, cam = MP.camera;
      const malha = MP.scene.getObjectByName('cityInteriorMesh');
      malha.updateWorldMatrix(true, false);
      const lado = malha.material.side; malha.material.side = T.DoubleSide;
      const rc = new T.Raycaster(), o = new T.Vector3(), cima = new T.Vector3(0, 1, 0);
      const dentro = (x, y, z) => { o.set(x, y, z); rc.set(o, cima); rc.near = 0; rc.far = 300; return rc.intersectObject(malha, false).length % 2 === 1; };
      // degraus: lajes de bala de 0,34 m de espessura (js/paredes.js, lance)
      const degraus = G.Structures.walls.filter(w => w.city && w.noCollide && Math.abs((w.y1 - w.y0) - 0.34) < 1e-6);
      const alvos = [];
      for (const w of degraus) {
        const cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
        const piso = MP.groundAt(cx, cz, w.y0 - 0.7);
        const folga = w.y0 - piso;
        if (folga > 0.4 && folga < 1.8) alvos.push({ cx, cz, piso });
        if (alvos.length >= 6) break;
      }
      const out = { alvos: alvos.length, quadros: 0, dentro: 0, exemplo: null };
      for (const a of alvos) {
        for (const [ox, oz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
          const sx = a.cx + ox, sz = a.cz + oz;
          if (Math.abs(MP.groundAt(sx, sz, a.piso + 0.3) - a.piso) > 0.05) continue;   // a partida é no mesmo piso
          QA.reset(sx, sz);
          const P = MP.player; P.pos.set(sx, a.piso, sz); P.vel.set(0, 0, 0); P.onGround = true;
          QA.tick(3);
          const yaw = Math.atan2(-(a.cx - P.pos.x), -(a.cz - P.pos.z));
          for (let f = 0; f < 90; f++) {
            cam.rotation.set(0, yaw, 0, 'YXZ'); if (P.yaw !== undefined) P.yaw = yaw;
            G.keys.KeyW = true; QA.tick(1); out.quadros++;
            for (const hh of [1, 1.62]) {
              if (dentro(P.pos.x, P.pos.y + hh, P.pos.z)) {
                out.dentro++;
                if (!out.exemplo) out.exemplo = { p: [P.pos.x, P.pos.y, P.pos.z].map(v => +v.toFixed(2)), altura: hh };
              }
            }
          }
          G.keys.KeyW = false; QA.tick(2);
        }
      }
      malha.material.side = lado;
      return out;
    });
    t.diagnostic(`${r.alvos} degraus baixos, ${r.quadros} quadros; tronco/olho dentro do desenho em ${r.dentro}${r.exemplo ? ' — ex.: ' + JSON.stringify(r.exemplo) : ''}`);
    assert.ok(r.alvos >= 3 && r.quadros >= 600, `cenário: ${r.alvos} degraus, ${r.quadros} quadros`);
    assert.equal(r.dentro, 0, `tronco ou olho dentro do desenho do interior em ${r.dentro} medidas`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
