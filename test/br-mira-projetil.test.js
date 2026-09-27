/* ================================================================
   QA — o projétil do BR passa pelo CENTRO DA TELA (fora de VR).

   No BR as armas com `projSpeed` não são hitscan: `fire()` entrega origem e
   direção a `window.__BR_ballistics`. Fora de VR essa origem era a BOCA DO
   CANO, com a direção da câmera — duas retas paralelas separadas pelo
   deslocamento da arma na tela. Medido antes da correção, no desktop e com
   `?mobile=1` (mesmos números): 29–31 cm no quadril (26 cm à direita, 15 cm
   abaixo) e 6–20 cm na mira, CONSTANTE em 10, 25 e 50 m. Erro de origem em
   projétil não fecha com a distância: mirar na cabeça acertava o ombro, e no
   celular, onde se atira do quadril, isso era o jogo inteiro.

   ÂNCORA INDEPENDENTE: a retícula é desenhada no centro do canvas, e o centro
   do canvas é o eixo da câmera — isso vem da projeção do three, não do código
   do tiro. O teste projeta o ponto por onde a bala passa em cada distância
   para PIXELS de tela e mede a distância até o centro. Queda balística fica
   de fora de propósito (reta de lançamento): o que se mede aqui é ORIGEM e
   DIREÇÃO, que é o que o defeito errava.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 3952;

describe('BR: o projétil sai pela linha de mira (fora de VR)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, host;
  before(async () => {
    h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
    host = await startBRMatch(h, { serverPort: PORT });
    await h.play(async () => {
      const G = window.QA.G;
      await G.WeaponModels.ready;
      for (let i = 0; i < 200 && !(G.FpBody.ready || G.FpBody.failed); i++)
        await new Promise(r => setTimeout(r, 100));
    });
  });
  after(async () => {
    if (host) host.close();
    if (h) await h.close();
  });

  it('dado quadril e mira, então a bala cruza o centro da tela a 10/25/50 m em toda arma de projétil', async () => {
    const medidas = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP, THREE = MP.THREE;
      const capturados = [];
      const original = window.__BR_ballistics;
      /* captura E repassa: o tiro continua acontecendo de verdade */
      window.__BR_ballistics = (o, d, gun) => {
        capturados.push({ o: o.clone(), d: d.clone() });
        return original(o, d, gun);
      };
      const W = MP.renderer.domElement.clientWidth, H = MP.renderer.domElement.clientHeight;
      const out = [];
      try {
        for (const i of [0, 2, 4, 6]) {
          if (!G.arsenal[i] || !G.arsenal[i].projSpeed) continue;
          for (const ads of [false, true]) {
            window.QA.reset();
            G.arsenal[i].locked = false;
            G.switchWeapon(i);
            window.QA.tick(40);
            const P = MP.player.pos;
            window.QA.aimAt(P.x + 50, P.y + 1.62, P.z);
            G.mouse.aiming = ads;
            window.QA.tick(60);
            window.QA.aimAt(P.x + 50, P.y + 1.62, P.z);
            /* o que o jogador VÊ neste instante: câmera e projeção */
            MP.camera.updateMatrixWorld(true);
            const cam = new THREE.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
            const fwd = new THREE.Vector3(); MP.camera.getWorldDirection(fwd);
            const vista = MP.camera.clone();
            const g = G.arsenal[i];
            const sh = g.spreadHip, sa = g.spreadAds;
            g.spreadHip = 0; g.spreadAds = 0;   // espalhamento é outro assunto
            capturados.length = 0;
            try {
              G.mouse.shooting = true; G.mouse.clicked = true;
              window.QA.tick(1);
            } finally {
              G.mouse.shooting = false; G.mouse.clicked = false;
              g.spreadHip = sh; g.spreadAds = sa;
            }
            if (!capturados.length) { out.push({ arma: g.name, ads, erro: 'nenhum projétil' }); continue; }
            const { o, d } = capturados[0];
            const px = {}, cm = {};
            for (const D of [10, 25, 50]) {
              const t = (D - o.clone().sub(cam).dot(fwd)) / d.dot(fwd);
              const bala = o.clone().addScaledVector(d, t);
              cm[D] = bala.distanceTo(cam.clone().addScaledVector(fwd, D)) * 100;
              const ndc = bala.clone().project(vista);
              px[D] = Math.hypot(ndc.x * W / 2, ndc.y * H / 2);
            }
            out.push({ arma: g.name, ads, cm, px });
          }
        }
      } finally {
        window.__BR_ballistics = original;
      }
      return out;
    });

    assert.ok(medidas.length >= 6, `esperava ≥ 3 armas de projétil × 2 posturas, veio ${medidas.length}`);
    const ruins = [];
    for (const m of medidas) {
      if (m.erro) { ruins.push(`${m.arma} ${m.ads ? 'mira' : 'quadril'}: ${m.erro}`); continue; }
      for (const D of [10, 25, 50]) {
        if (m.cm[D] > 1 || m.px[D] > 1)
          ruins.push(`${m.arma} ${m.ads ? 'mira' : 'quadril'} @${D} m: ${m.cm[D].toFixed(2)} cm / ${m.px[D].toFixed(1)} px do centro`);
      }
    }
    assert.deepEqual(ruins, [], 'a bala tem de cruzar o centro da tela (≤ 1 cm e ≤ 1 px):\n' + ruins.join('\n'));
  });

  /* VELOCIDADE DE BALA DE FUZIL É DE GÊNERO, NÃO DE GOSTO. O BR nasceu com o
     fuzil a 200 m/s: um alvo correndo a 5 m/s a 50 m pedia 1,25 m de
     antecipação — impraticável no dedo. Referências (docs/mobile/
     referencia-mira-toque.md): Fortnite, "assault rifles ... are all
     hitscan"; Apex R-301, "projectile_launch_speed: 29000 ... equals to 736
     meters per second"; PUBG M416 ~880 m/s. O plasma fica de fora: é arma
     de energia, lenta por desenho, e o traçante dela é o próprio projétil.
     A velocidade medida é a do projétil ENTREGUE ao br-game (não a tabela). */
  it('dado fuzil/DMR/sniper no BR, então a bala chega a 100 m em ≤ 0,15 s e cai ≤ 10 cm', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, MP = window.QA.MP;
      const vistos = [];
      const original = window.__BR_ballistics;
      window.__BR_ballistics = (o, d, gun) => { vistos.push({ v: gun.projSpeed, g: gun.projDrop || 6 }); return original(o, d, gun); };
      const out = [];
      try {
        for (const i of [0, 2, 6]) {
          const g = G.arsenal[i];
          if (!g) continue;
          window.QA.reset();
          g.locked = false;
          G.switchWeapon(i);
          window.QA.tick(40);
          const P = MP.player.pos;
          window.QA.aimAt(P.x + 50, P.y + 1.62, P.z);
          vistos.length = 0;
          try { G.mouse.shooting = true; G.mouse.clicked = true; window.QA.tick(1); }
          finally { G.mouse.shooting = false; G.mouse.clicked = false; }
          const s = vistos[0];
          out.push(s ? { arma: g.name, t100: 100 / s.v, queda100: 0.5 * s.g * (100 / s.v) ** 2 }
            : { arma: g.name, erro: 'nenhum projétil' });
        }
      } finally { window.__BR_ballistics = original; }
      return out;
    });
    assert.equal(r.length, 3, 'esperava fuzil, DMR e sniper');
    const ruins = r.filter(m => m.erro || m.t100 > 0.15 || m.queda100 > 0.10)
      .map(m => m.erro ? `${m.arma}: ${m.erro}` : `${m.arma}: ${m.t100.toFixed(3)} s e ${(m.queda100 * 100).toFixed(1)} cm a 100 m`);
    assert.deepEqual(ruins, [], 'bala de fuzil lenta demais para o gênero:\n' + ruins.join('\n'));
  });
});
