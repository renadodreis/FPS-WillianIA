/* ================================================================
   QA — fiação de qualidade de render (Chrome headless).

   Cobre dois contratos que o jogador sente na pele:
     1. Trocar "Resolução" tem que mudar a resolução DE VERDADE. O
        EffectComposer guarda o próprio pixelRatio; mexer só no renderer
        deixava o pós renderizando na razão do boot — quem baixava a
        qualidade fugindo do travamento não ganhava nada.
     2. O prewarm precisa ter linkado os programas antes do combate, e
        não pode refazer trabalho a cada chamada.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('./helpers/harness.js');

describe('Qualidade de render (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3281 }); });
  after(async () => { if (h) await h.close(); });

  it('renderer e composer nascem no mesmo pixelRatio', async () => {
    const r = await h.play(() => {
      const Q = window.QA.G.renderQuality;
      return { renderer: Q.pixelRatio, composer: Q.composerPixelRatio };
    });
    assert.equal(r.composer, r.renderer, 'composer fora de sincronia já no boot');
  });

  it('apply muda renderer E composer juntos', async () => {
    const r = await h.play(() => {
      const Q = window.QA.G.renderQuality;
      const before = Q.pixelRatio;
      Q.apply(0.75);
      const at = { renderer: Q.pixelRatio, composer: Q.composerPixelRatio };
      Q.apply(before);
      return { at, restored: Q.pixelRatio };
    });
    assert.equal(r.at.renderer, 0.75);
    assert.equal(r.at.composer, 0.75, 'render targets do pós ficaram na razão antiga');
  });

  it('o seletor "Resolução" realmente reduz a resolução interna do pós', async () => {
    const r = await h.play(async () => {
      const Q = window.QA.G.renderQuality;
      // headless roda em dpr 1: sem um dpr alto os tetos 1 / 1.5 / 2 colapsam
      // no mesmo número e o teste não conseguiria ver a diferença.
      const realDpr = window.devicePixelRatio;
      Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
      const sel = document.getElementById('setRes');
      const set = value => {
        sel.value = value;
        sel.dispatchEvent(new Event('change'));
        return {
          renderer: Q.pixelRatio, composer: Q.composerPixelRatio, ceiling: Q.ceilingOf(),
          // prova física: os pixels que a GPU realmente sombreia no pós
          targetWidth: window.QA.MP.composer.renderTarget1.width,
        };
      };
      const low = set('1'), high = set('2');
      set('1.5');
      Object.defineProperty(window, 'devicePixelRatio', { value: realDpr, configurable: true });
      return { low, high };
    });
    assert.equal(r.low.ceiling, 1);
    assert.equal(r.low.composer, 1, '"Desempenho" não chegou nos render targets do pós');
    assert.equal(r.high.ceiling, 2);
    assert.equal(r.high.composer, 2, '"Qualidade" não chegou nos render targets do pós');
    assert.equal(r.high.targetWidth, r.low.targetWidth * 2,
      `render target não mudou de tamanho: ${r.low.targetWidth} -> ${r.high.targetWidth}`);
  });

  it('a escala adaptativa nunca passa do teto escolhido pelo jogador', async () => {
    const r = await h.play(() => {
      const Q = window.QA.G.renderQuality;
      return { scale: Q.scale, ceiling: Q.ceiling, pixelRatio: Q.pixelRatio };
    });
    assert.ok(r.scale <= r.ceiling + 1e-9, `escala ${r.scale} acima do teto ${r.ceiling}`);
    assert.ok(r.scale > 0);
  });

  it('tick determinístico (forceDt) não mexe na resolução — QA e replay intactos', async () => {
    const r = await h.play(() => {
      const Q = window.QA.G.renderQuality;
      const before = Q.pixelRatio;
      window.QA.tick(300, 0.2); // 300 frames horríveis de 200 ms
      return { before, after: Q.pixelRatio, changes: window.QA.G.perf.renderScaleChanges };
    });
    assert.equal(r.after, r.before, 'passo manual não pode disparar reescala');
    assert.equal(r.changes, 0);
  });

  it('perf publica o tempo de CPU do frame separado do total', async () => {
    const r = await h.play(() => {
      window.QA.tick(5);
      const p = window.QA.G.perf;
      return { simMs: p.simMs, frameMs: p.frameMs, scale: p.renderScale };
    });
    assert.ok(r.simMs >= 0, 'simMs não foi publicado');
    assert.ok(r.scale > 0, 'renderScale não foi publicado');
  });

  it('prewarm linkou material no boot e não refaz trabalho', async () => {
    const r = await h.play(async () => {
      const pw = window.QA.G.prewarm, THREE = window.QA.MP.THREE;
      await pw.flush();  // fecha o que o boot deixou pendente
      const warmed = pw.stats.warmed;
      /* Raiz sintética em vez da cena: GLBs continuam chegando por load
         assíncrono durante a partida, então "a cena não mudou" não é uma
         premissa estável. Aqui a mudança é controlada. */
      const probe = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      const first = await pw.warm(probe);
      const second = await pw.warm(probe);
      probe.geometry.dispose(); probe.material.dispose();
      return { warmed, first, second, errors: pw.stats.errors };
    });
    assert.ok(r.warmed > 0, 'nenhum material foi aquecido no boot');
    assert.equal(r.first.materials, 1, 'material novo não foi linkado');
    assert.equal(r.first.skipped, false);
    assert.equal(r.second.skipped, true, 'prewarm recompilando raiz inalterada');
    assert.equal(r.second.materials, 0);
    assert.equal(r.errors, 0, 'prewarm registrou falha de GL');
  });

  it('trocar sombra invalida o prewarm (needsUpdate relinka o programa)', async () => {
    const r = await h.play(async () => {
      const pw = window.QA.G.prewarm;
      await pw.flush();
      const before = pw.stats.warmed;
      const sel = document.getElementById('setShadow');
      const original = sel.value;
      sel.value = original === '1' ? '0' : '1';
      sel.dispatchEvent(new Event('change'));
      const after = pw.stats.warmed;
      sel.value = original;
      sel.dispatchEvent(new Event('change'));
      await pw.flush();
      return { before, after };
    });
    assert.ok(r.before > 0);
    assert.equal(r.after, 0, 'materiais marcados com needsUpdate continuaram "aquecidos"');
  });

  it('o loop só reescala fora do passo forçado (guarda no fonte)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    assert.ok(/forceDt === undefined && \+SETTINGS\.autores !== 0 &&\s*\n?\s*resScaler\.push/.test(src),
      'a reescala perdeu a guarda de forceDt/autores');
    assert.ok(/composer\.setPixelRatio\(value\)/.test(src),
      'applyPixelRatio parou de sincronizar o composer');
  });

  it('o seletor de antisserrilhado liga e desliga o passe SMAA', async () => {
    const r = await h.play(() => {
      const composer = window.QA.MP.composer;
      const smaa = composer.passes.find(p => p.constructor.name === 'SMAAPass');
      const sel = document.getElementById('setAA');
      const set = v => { sel.value = v; sel.dispatchEvent(new Event('change')); return smaa.enabled; };
      const original = sel.value;
      const desligado = set('0'), ligado = set('1');
      sel.value = original; sel.dispatchEvent(new Event('change'));
      return { achouPasse: !!smaa, desligado, ligado, padrao: original,
        // o padrão deixou de ser fixo: no primeiro boot o js/gputier.js
        // escolhe o preset pela GPU (headless = SwiftShader = tier baixo)
        tier: window.QA.G.gpuTier };
    });
    assert.equal(r.achouPasse, true, 'SMAAPass sumiu do composer');
    assert.equal(r.desligado, false, 'desligar não desabilitou o passe: 3 passes fullscreen continuam');
    assert.equal(r.ligado, true);
    // O padrão agora vem do auto-tier: numa GPU capaz continua ligado; num
    // rasterizador de software (o caso do headless) nasce desligado de
    // propósito — SMAA são 3 passes em resolução cheia.
    const esperado = r.tier && r.tier.applied ? String(r.tier.preset.aa) : '1';
    assert.equal(r.padrao, esperado,
      `antisserrilhado nasceu em "${r.padrao}", fora do preset do tier "${r.tier && r.tier.tier}"`);
  });

  it('desligar antisserrilhado NÃO muda o que é desenhado (só pós)', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP, R = MP.renderer;
      const sel = document.getElementById('setAA');
      const conta = () => {
        R.info.reset();
        R.render(MP.scene, MP.camera);
        return { calls: R.info.render.calls, tris: R.info.render.triangles };
      };
      sel.value = '1'; sel.dispatchEvent(new Event('change'));
      const com = conta();
      sel.value = '0'; sel.dispatchEvent(new Event('change'));
      const sem = conta();
      sel.value = '1'; sel.dispatchEvent(new Event('change'));
      return { com, sem };
    });
    assert.equal(r.sem.tris, r.com.tris, 'geometria da cena mudou: não é só pós-processamento');
    assert.equal(r.sem.calls, r.com.calls, 'draw calls da cena mudaram: não é só pós-processamento');
  });

  /* TRAVA ANTI-TRAPAÇA. Configuração que reduz ou remove grama é wallhack:
     quem baixa vê o adversário deitado no mato. Vale igual pra distância de
     visão e névoa. Este teste existe pra impedir que "otimizar" no futuro
     abra esse vetor sem ninguém perceber. */
  it('nenhuma configuração do jogador controla grama, alcance de visão ou névoa', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const proibido = /grama|grass|distância de visão|distancia de visao|view\s*dist|névoa|nevoa|\bfog\b|densidade/i;

    /* A versão antiga achava o bloco por VIZINHANÇA (`#settings` seguido de
       `#loadingMsg`). A unificação do menu meteu o painel do multijogador
       entre os dois e o guarda ficou CEGO — passou a falhar por não achar
       nada, que é o pior modo de falha possível pra uma trava anti-trapaça.
       Agora ele varre todo controle exposto ao jogador, onde quer que esteja:
       cada linha de configuração e cada elemento de formulário. Não depende
       de ordem nem de aninhamento. */
    const linhas = [...html.matchAll(/<div class="srow"[\s\S]*?<\/div>/g)].map(m => m[0]);
    const controles = [...html.matchAll(/<(?:select|input|option)\b[\s\S]*?(?:<\/select>|>)/g)].map(m => m[0]);
    assert.ok(linhas.length >= 3,
      `varredura não achou as linhas de configuração (achou ${linhas.length}) — ` +
      'a trava anti-trapaça estaria passando sem olhar nada');

    for (const trecho of [...linhas, ...controles]) {
      assert.ok(!proibido.test(trecho),
        `controle exposto ao jogador abre vetor de wallhack:\n${trecho}`);
    }

    const cfg = fs.readFileSync(path.join(__dirname, '..', 'js', 'config.js'), 'utf8');
    const settings = /export const SETTINGS = Object\.assign\(\{([^}]*)\}/.exec(cfg);
    assert.ok(settings, 'SETTINGS não encontrado em js/config.js');
    assert.ok(!/grass|grama|viewDist|fog|density/i.test(settings[1]),
      `SETTINGS persistente expõe vetor de wallhack: ${settings[1]}`);
  });

  it('boot limpo: sem erro de console nem pageerror', () => {
    assert.deepEqual(h.pageErrors, []);
    assert.deepEqual(h.consoleErrors, []);
  });
});
