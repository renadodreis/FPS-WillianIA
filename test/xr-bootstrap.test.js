/* ================================================================
   QA — BOOTSTRAP XR no game.js (Fase 1 do porte pro Quest).

   Três coisas mudam no jogo, e as três podem quebrar o desktop se
   saírem erradas:

   1. O DONO DO LOOP passa a ser o renderer. `requestAnimationFrame` não
      existe dentro de uma sessão WebXR — quem agenda frame lá é
      `session.requestAnimationFrame`, e o three só sabe trocar um pelo
      outro se o loop for dele (`renderer.setAnimationLoop`). Um
      `requestAnimationFrame(animate)` sobrevivente significa tela preta
      no headset.

   2. O EFFECTCOMPOSER SAI EM XR. Ele renderiza pros próprios render
      targets; o framebuffer da sessão WebXR não é um deles. Não é
      otimização, é requisito: com o composer no caminho, o headset não
      recebe imagem.

   3. O JOGO NÃO MEXE NA CABEÇA DO JOGADOR. O passeio de câmera do menu é
      a vitrine do jogo no desktop e é enjoo garantido em VR. Em sessão
      XR ele não roda.

   E a trava do contrato do worldgen: o rig é um `Object3D`, e todo
   `Object3D` gasta 4 números do `Math.random` SEEDADO no UUID
   (game.js:201). Fora de XR ele não pode nem existir.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('./helpers/harness.js');

const PORT_JOGO = 3310;
const PORT_MENU = 3312;

describe('bootstrap XR — em jogo', () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT_JOGO }); });
  after(async () => { if (h) await h.close(); });

  it('publica a camada XR e no desktop ela fica quieta', async () => {
    const out = await h.play(() => {
      const XR = window.__game.XR;
      return {
        existe: !!XR,
        presenting: XR.presenting,
        device: XR.env.device,
        api: typeof XR.env.api,
        temEnter: typeof XR.enter === 'function',
      };
    });
    assert.equal(out.existe, true);
    assert.equal(out.presenting, false);
    assert.equal(out.device, false, 'Chrome de teste não é headset');
    assert.equal(out.temEnter, true);
  });

  it('fora de XR o rig NÃO existe (contrato do rand seedado)', async () => {
    const out = await h.play(() => window.__game.XR.rig);
    assert.equal(out, null);
  });

  it('quem agenda o frame é o renderer, não o requestAnimationFrame do jogo', async () => {
    const out = await h.play(async () => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      let n = 0;
      MP.composer.render = () => { n++; };
      const espera = ms => new Promise(r => setTimeout(r, ms));
      /* espera por CONDIÇÃO, não por relógio: sob carga o rAF entrega menos
         frames por segundo, e um `setTimeout(250)` viraria flake nosso */
      const ate = async (cond, limite = 8000) => {
        const fim = Date.now() + limite;
        while (Date.now() < fim && !cond()) await espera(25);
        return cond();
      };
      const rodando = await ate(() => n >= 4);
      R.setAnimationLoop(null);
      const aoParar = n;
      await espera(300);                    // janela generosa pra QUALQUER frame vazar
      const parado = n;
      R.setAnimationLoop(() => G.tick());   // devolve um loop equivalente
      const alvo = n + 3;
      const voltou = await ate(() => n >= alvo);
      return { rodando, aoParar, parado, voltou };
    });
    assert.equal(out.rodando, true, 'o jogo tem que estar rodando sozinho');
    assert.equal(out.parado, out.aoParar,
      'tirar o loop do renderer tem que congelar o jogo — se não congelou, sobrou um rAF próprio');
    assert.equal(out.voltou, true, 'devolver o loop volta a rodar');
  });

  it('em XR o render vai direto, sem passar pelo EffectComposer', async () => {
    const out = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      let comp = 0, direto = 0;
      MP.composer.render = () => { comp++; };
      const renderOriginal = R.render;
      R.render = () => { direto++; };
      R.setAnimationLoop(null); // passo manual: sem corrida com o loop
      G.tick(1 / 60);
      const desktop = { comp, direto };
      R.xr.isPresenting = true;
      G.tick(1 / 60);
      const xr = { comp: comp - desktop.comp, direto: direto - desktop.direto };
      R.xr.isPresenting = false;
      R.render = renderOriginal;
      R.setAnimationLoop(() => G.tick());
      return { desktop, xr };
    });
    assert.equal(out.desktop.comp, 1, 'no desktop o pós continua no caminho');
    assert.equal(out.desktop.direto, 0);
    assert.equal(out.xr.comp, 0, 'com composer no caminho o headset não recebe imagem');
    assert.equal(out.xr.direto, 1);
  });

  it('entrar em XR cria o rig e sair devolve a câmera', async () => {
    const out = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      R.setAnimationLoop(null);
      /* precondição própria: o caso anterior pode ter deixado o grafo em XR
         e o frame de reconciliação ainda não ter rodado */
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      const paiAntes = MP.camera.parent === MP.scene;
      R.xr.isPresenting = true;
      G.tick(1 / 60);
      const dentro = {
        temRig: !!G.XR.rig,
        paiEhRig: MP.camera.parent === G.XR.rig,
        presenting: G.XR.presenting,
      };
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      const fora = { paiEhCena: MP.camera.parent === MP.scene, presenting: G.XR.presenting };
      R.setAnimationLoop(() => G.tick());
      return { paiAntes, dentro, fora };
    });
    assert.equal(out.paiAntes, true);
    assert.equal(out.dentro.temRig, true);
    assert.equal(out.dentro.paiEhRig, true);
    assert.equal(out.dentro.presenting, true);
    assert.equal(out.fora.paiEhCena, true, 'a sessão pode acabar pelo sistema; o desktop volta inteiro');
    assert.equal(out.fora.presenting, false);
  });

  it('em XR quem manda na resolução é a sessão, não o jogo', async () => {
    // `setPixelRatio`/`setSize` durante uma sessão são no-op com aviso no
    // console — o framebuffer é da sessão. O escalador adaptativo do desktop
    // tentaria isso justamente quando o frame estoura, que em XR é sempre no
    // começo: viraria enxurrada de aviso sem mudar um pixel.
    const out = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      R.setAnimationLoop(null);
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      const prAntes = R.getPixelRatio();
      let tamanhos = 0;
      const setSizeOriginal = R.setSize;
      R.setSize = () => { tamanhos++; };
      R.xr.isPresenting = true;
      G.tick(1 / 60);
      G.renderQuality.apply(0.5);            // o escalador adaptativo passa por aqui
      const durante = { pr: R.getPixelRatio(), tamanhos };
      window.dispatchEvent(new Event('resize'));
      const aposResize = tamanhos;
      R.setSize = setSizeOriginal;
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      R.setAnimationLoop(() => G.tick());
      return { prAntes, durante, aposResize };
    });
    assert.equal(out.durante.pr, out.prAntes, 'o pixel ratio da sessão não é do jogo');
    assert.equal(out.durante.tamanhos, 0);
    assert.equal(out.aposResize, 0, 'redimensionar a janela não pode tocar no framebuffer da sessão');
  });

  it('sem headset o botão de VR não aparece', async () => {
    const out = await h.play(() => !!document.getElementById('btnVR'));
    assert.equal(out, false);
  });
});

describe('bootstrap XR — no menu', () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT_MENU, autoStart: false }); });
  after(async () => { if (h) await h.close(); });

  it('no desktop o passeio de câmera do menu continua rodando', async () => {
    const out = await h.play(() => {
      const G = window.__game, MP = window.__MP;
      MP.renderer.setAnimationLoop(null);
      const antes = MP.camera.position.clone();
      for (let i = 0; i < 12; i++) G.tick(1 / 60);
      const d = MP.camera.position.distanceTo(antes);
      MP.renderer.setAnimationLoop(() => G.tick());
      return d;
    });
    assert.ok(out > 0.001, `o passeio do menu tem que mover a câmera no desktop (${out})`);
  });

  it('em XR o jogo NÃO move a cabeça do jogador no menu', async () => {
    const out = await h.play(() => {
      const G = window.__game, MP = window.__MP, R = MP.renderer;
      R.setAnimationLoop(null);
      R.xr.isPresenting = true;
      G.tick(1 / 60);                       // adota o rig
      const antes = MP.camera.position.clone();
      const rigAntes = G.XR.rig.position.clone();
      for (let i = 0; i < 12; i++) G.tick(1 / 60);
      const d = MP.camera.position.distanceTo(antes);
      const dRig = G.XR.rig.position.distanceTo(rigAntes);
      R.xr.isPresenting = false;
      G.tick(1 / 60);
      R.setAnimationLoop(() => G.tick());
      return { d, dRig };
    });
    assert.equal(+out.d.toFixed(6), 0, 'passeio de câmera em VR é enjoo, não vitrine');
    assert.equal(+out.dRig.toFixed(6), 0, 'e o rig também fica parado');
  });
});
