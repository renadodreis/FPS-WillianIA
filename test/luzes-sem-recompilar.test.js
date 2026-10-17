/* ================================================================
   TROCA DE LUZES SEM RECOMPILAR NO MEIO DA PARTIDA.
   A chave do programa WebGL do three carrega a CONTAGEM de luzes da
   cena. Cada vez que ela muda para um valor novo, TODO material visível
   relinka no quadro seguinte. Medido numa partida real (RTX 3050, tier
   baixo): 14–24 programas e 188–288 ms de quadro em cada troca —
   pular da nave (o clarão da arma some com a arma), pôr o pé no chão
   (volta), a cidade cair (+2 ruínas +1 explosão), a explosão apagar.
   No ANGLE/D3D11 do Windows compilar é várias vezes mais lento.

   Partida de verdade, do lobby ao fim da explosão da cidade, COM pixels
   (o harness desliga o render; aqui ele volta). A régua é do three: a
   assinatura de luzes é a que o `projectObject` conta (visível na cena,
   camada da câmera), e o programa novo é `renderer.info.programs`.
   O quadro em que a nave APARECE fica fora da conta: os materiais dela
   são vistos pela primeira vez ali (é trabalho do prewarm de material,
   não de luz) — ele é relatado, não cobrado.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 3704;
const CIDADE_MS = 30000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('Luzes — a contagem muda sem recompilar no meio da partida', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, dono;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false,
      extraEnv: { HOST_CODE: 'QA123', COUNTDOWN_S: '1', FLY_TIME: '8', NEXT_IN_S: '300',
        CITY_DESTRUCTION_DELAY_MS: String(CIDADE_MS) } });
  });
  after(async () => { if (dono) dono.close(); if (h) await h.close(); });

  it('da nave à explosão da cidade: ≤ 6 programas novos em todas as trocas de luz somadas', async t => {
    await h.page.waitForFunction('window.__BR_debug && window.__MP && window.__MP.socket && window.__MP.socket.connected', { timeout: 90000 });
    // pixels de volta: o que se mede aqui é o que a GPU compila para desenhar
    await h.play(() => { delete window.__MP.composer.render; });
    // o lobby é a janela segura: dá tempo ao prewarm (no jogo de verdade o lobby dura mais)
    await sleep(12000);
    await h.play(() => {
      const MP = window.__MP, r = MP.renderer, scene = MP.scene, cam = MP.camera;
      const out = window.__amostraLuzes = [];
      const assinatura = () => {
        const c = [0, 0, 0, 0, 0, 0, 0];
        scene.traverseVisible(o => {
          if (!o.isLight || !o.layers.test(cam.layers)) return;
          if (o.isPointLight) { c[0]++; if (o.castShadow) c[5]++; }
          else if (o.isSpotLight) { c[1]++; if (o.castShadow) c[6]++; }
          else if (o.isDirectionalLight) { c[2]++; if (o.castShadow) c[4]++; }
          else if (o.isHemisphereLight) c[3]++;
        });
        return c.join('/');
      };
      (function f() {
        requestAnimationFrame(f);
        out.push([assinatura(), r.info.programs.length, window.__BR_debug.S.phase]);
      })();
    });
    dono = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
    await new Promise(res => dono.once('init', res));
    dono.emit('hello', { nick: 'Dono' });
    await sleep(300);
    await new Promise((res, rej) => dono.timeout(4000).emit('claimHost', { code: 'QA123' },
      (e, d) => (e || !d || !d.ok ? rej(new Error('claimHost')) : res())));
    dono.emit('requestStart');
    // até a explosão apagar: cinemática + impacto 8,5 s + 2,2 s de explosão
    const fim = Date.now() + CIDADE_MS + 14000;
    while (Date.now() < fim) { dono.emit('state', { pos: [60, 300, 60], rotY: 0, ship: true }); await sleep(1000); }

    const a = await h.play(() => window.__amostraLuzes);
    const trocas = [];
    let naveVista = false;
    for (let i = 1; i < a.length; i++) {
      if (a[i][0] === a[i - 1][0]) continue;
      // programas que nasceram na troca: o quadro dela e os 2 seguintes
      const novos = a[Math.min(a.length - 1, i + 2)][1] - a[i - 1][1];
      const daNave = !naveVista && a[i][2] === 'SHIP';
      if (daNave) naveVista = true;
      trocas.push({ de: a[i - 1][0], para: a[i][0], fase: a[i][2], novos, daNave });
    }
    t.diagnostic(trocas.map(x => `${x.de} → ${x.para} (${x.fase}): +${x.novos} programas${x.daNave ? ' [nave aparece, fora da conta]' : ''}`).join('\n'));
    assert.ok(naveVista, 'cenário: a nave nunca apareceu');
    assert.ok(trocas.some(x => x.fase === 'PLAY' && !x.daNave), 'cenário: a cidade não caiu (nenhuma troca de luz em PLAY)');
    const soma = trocas.filter(x => !x.daNave).reduce((s, x) => s + x.novos, 0);
    assert.ok(soma <= 6, `${soma} programas compilados no meio da partida por troca de luz`);
  });
});
