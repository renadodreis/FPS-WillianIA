/* ================================================================
   QA — O MINIMAPA DENTRO DO MUNDO (IWER, sessão imersiva real).

   O QUE ESTÁ SENDO COBRADO. O critério H1 do docs/vr/criterio-aaa.md tem uma
   lista fechada de 17 telas que não podem viver só no DOM, porque a sessão
   `immersive-vr` sem `dom-overlay` simplesmente não desenha DOM. Dezesseis
   fecharam. A décima sétima é o MINIMAPA, que hoje é o `<canvas id="minimap">`
   do index.html — certo no DOM, invisível no headset.

   E TEM UM SEGUNDO DEFEITO, que só aparece em VR. O minimapa gira o mundo
   pelo yaw da vista, e lê esse yaw de `camera.quaternion`. Em XR
   `camera.quaternion` é a pose da cabeça RELATIVA AO RIG, e o giro artificial
   (analógico) mora no RIG — então o minimapa ignora todo giro de analógico. É
   o mesmo defeito que já custou o movimento invertido e o `rotY` errado
   mandado ao servidor, e o `game.js` já tem a fonte única certa
   (`yawDaVista()`). O minimapa ficou de fora dela.

   COMO ESTE ARQUIVO EVITA MEDIR A SI MESMO. Ele NÃO instancia nada: lê o
   `XRHud` que o `game.js` fia de verdade (`window.__game.XRHud`) e o `MiniMap`
   do próprio jogo. Se a fiação do jogo sumir, este arquivo fica vermelho —
   que é exatamente o que um teste de HUD tem que fazer e o que
   `test/xr-hud.test.js` não faz (ele monta um condutor próprio).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3550;
const GRAU = Math.PI / 180;
const mediana = xs => {
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
/* diferença de ângulo levada para (−180°, 180°] — sem isto um giro que cruza
   o ±π vira erro de 360° e o teste acusa defeito que não existe */
const deltaGraus = (a, b) => {
  let d = (a - b) / GRAU % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
};

async function instalarSondas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const GRAU = Math.PI / 180;   // o do topo do arquivo vive no Node, não na página

  window.__M = {
    naCena: nome => {
      let achou = false;
      MP.scene.traverse(o => { if (o.name === nome) achou = true; });
      return achou;
    },
    /* estado do painel do mapa, lido do HUD QUE O JOGO FIA — não de uma
       instância criada aqui */
    painel: () => {
      const hud = G.XRHud;
      if (!hud || !hud.mapa) return null;
      MP.camera.updateWorldMatrix(true, false);
      const cab = MP.camera.getWorldPosition(new T.Vector3());
      const o = hud.mapa;
      o.updateWorldMatrix(true, false);
      const pos = o.getWorldPosition(new T.Vector3());
      const punho = G.XR.punho('left') || G.XR.mao('left');
      let aoPunho = null;
      if (punho) {
        punho.updateWorldMatrix(true, false);
        aoPunho = pos.distanceTo(punho.getWorldPosition(new T.Vector3()));
      }
      const d = pos.distanceTo(cab);
      return {
        nome: o.name,
        visivel: !!o.visible,
        temPai: !!o.parent,
        noPunho: !!(punho && o.parent === punho),
        aoPunho,
        distancia: d,
        /* ALTURA ANGULAR DO PAINEL, COM A ESCALA. `MAPA_H` é o tamanho BASE em
           metros; desde que os painéis passaram a ser projetados na
           profundidade de conforto, eles são empurrados `k` vezes mais longe E
           crescidos `k` vezes — usar só o tamanho base subestima o ângulo na
           mesma razão. O caso passava de qualquer jeito (18° reais contra teto
           de 6°), mas número que o teste IMPRIME errado é número que alguém vai
           citar. */
        grausV: 2 * Math.atan((hud.MAPA_H * o.getWorldScale(new T.Vector3()).y / 2)
          / Math.max(1e-6, d)) / GRAU,
      };
    },
    /* o yaw que o MINIMAPA usou no último desenho, e o yaw de verdade da
       vista no mundo. A diferença entre os dois é o defeito. */
    yaws: () => ({
      mapa: (G.MiniMap && typeof G.MiniMap.ultimoYaw === 'number') ? G.MiniMap.ultimoYaw : null,
      vista: G.yawDaVista(),
    }),
    async gira(ms) {
      window.__A.stick('right', 1, 0);
      await window.__A.espera(ms);
      window.__A.solta();
      await window.__A.espera(260);
    },
    calls: () => MP.renderer.info.render.calls,
    /* custo em draw calls por diferença pareada, no mesmo molde do
       test/xr-hud.test.js: a cena está viva e a contagem oscila entre frames,
       então o que vale é a MEDIANA de leituras próximas */
    async custo(n) {
      const hud = G.XRHud, dif = [];
      if (!hud || !hud.mapa) return null;
      for (let i = 0; i < n; i++) {
        hud.mapa.visible = true; await window.__A.espera(70);
        const com = MP.renderer.info.render.calls;
        hud.mapa.visible = false; await window.__A.espera(70);
        dif.push(com - MP.renderer.info.render.calls);
      }
      hud.mapa.visible = true;
      return dif;
    },
  };
  return true;
}

describe('minimapa dentro do mundo em VR (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarSondas);
    await h.play(() => window.__A.espera(800));
  });
  after(async () => { if (h) await h.close(); });

  it('o minimapa existe DENTRO do mundo — H1 item 17 de 17', async () => {
    const r = await h.play(() => ({
      naCena: window.__M.naCena('xrHudMapa'),
      p: window.__M.painel(),
    }));
    assert.equal(r.naCena, true,
      'não existe objeto `xrHudMapa` no grafo da cena — o minimapa continua só no DOM, que a sessão imersiva não desenha');
    assert.ok(r.p, 'o HUD do jogo não expõe o painel do mapa');
    assert.equal(r.p.visivel, true, 'o painel do mapa nasceu invisível');
  });

  it('o mapa está no PULSO esquerdo, ao alcance do braço e legível', async () => {
    const r = await h.play(() => window.__M.painel());
    assert.ok(r, 'sem painel do mapa não há o que medir');
    assert.equal(r.noPunho, true,
      `o painel do mapa está pendurado em "${r.temPai ? 'outro pai' : 'nada'}" — o mapa de pulso é preso na PALMA (gripSpace), não no raio de mira nem na cara`);
    assert.ok(r.aoPunho !== null && r.aoPunho < 0.25,
      `o painel está a ${r.aoPunho === null ? '?' : r.aoPunho.toFixed(3)} m da palma; acima de 0,25 m já não é "no pulso"`);
    assert.ok(r.grausV > 6,
      `o mapa ocupa ${r.grausV.toFixed(2)}° de altura — abaixo de 6° um blip de 3 px vira menos de 0,04° e some`);
  });

  it('o minimapa gira com o GIRO ARTIFICIAL, não só com a cabeça', async () => {
    const r = await h.play(async () => {
      const antes = window.__M.yaws();
      await window.__M.gira(500);          // ~90° no perfil suave (180°/s)
      const depois = window.__M.yaws();
      return { antes, depois };
    });
    assert.ok(r.antes.mapa !== null,
      'o minimapa não expõe o yaw que usou — sem isso não há como medir se ele segue o giro artificial');
    const girouAVista = Math.abs(deltaGraus(r.depois.vista, r.antes.vista));
    assert.ok(girouAVista > 30,
      `o analógico não girou a vista (${girouAVista.toFixed(1)}°) — sem giro não há o que medir`);
    const erro = Math.abs(deltaGraus(r.depois.mapa, r.depois.vista));
    assert.ok(erro < 3,
      `depois de girar ${girouAVista.toFixed(1)}° com o analógico, o minimapa está desenhando com um yaw ${erro.toFixed(1)}° fora da vista real — ele está lendo \`camera.quaternion\` (pose da cabeça RELATIVA ao rig) em vez do yaw de mundo`);
  });

  it('o mapa custa poucas draw calls', async () => {
    const dif = await h.play(() => window.__M.custo(7));
    assert.ok(Array.isArray(dif) && dif.length === 7, 'não deu para medir o custo');
    const m = mediana(dif);
    assert.ok(m <= 2, `o painel do mapa custa ${m} draw calls por olho (mediana de ${JSON.stringify(dif)}); um quad texturizado tem que custar 1`);
  });
});
