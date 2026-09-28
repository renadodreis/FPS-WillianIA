/* ================================================================
   SENSIBILIDADE DO TOQUE MEDIDA PELO DEDO DE VERDADE — relato do dono:
   "a sensibilidade ali na movimentação deve ser melhorada".

   Caminho: o laço do jogo roda SOZINHO no rAF (nenhum QA.tick) e o dedo é o
   `Input.dispatchTouchEvent` do DevTools, com o RELÓGIO de cada amostra
   (`timestamp`) — é assim que a velocidade do dedo fica exata sem depender
   do relógio do Node. O teclado de referência é o `Input.dispatchKeyEvent`
   (tecla confiável, a mesma que o jogador aperta). Viewport: Galaxy S22 do
   dono em paisagem, 780×360 CSS, DPR 3.

   ÂNCORAS INDEPENDENTES DO PRODUTO: o giro é lido da `camera.matrixWorld`
   do quadro desenhado; a sensibilidade esperada é o TEXTO do menu (o que o
   jogador lê), nunca `Touch.lookSens`; a velocidade de referência é a do
   próprio jogador andando pelo W do teclado.

   O QUE ESTE ARQUIVO PEGOU (antes, medido no S22 pelo toque real):
   · andar pelo analógico parava em 85 % do andar do teclado (4,42 contra
     5,20 m/s): o vetor de andar valia a deflexão e a faixa de andar acaba
     no limiar de corrida; meio curso dava 2,24 m/s;
   · correr pedia 0,85 de deflexão — acima da Apple (0,8) e do Touch
     Adaptation Kit da Microsoft (0,75);
   · o menu dizia "100%", sem unidade: a régua M3 pede o giro medido contra
     o que o MENU mostra.

   Porta 4072.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4072;
const S22 = { width: 780, height: 360, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('sensibilidade do toque pelo dedo real (S22 780×360)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, cdp;
  before(async () => {
    h = await bootGame({ port: PORT, query: '?mobile=1', viewport: S22 });
    cdp = await h.page.target().createCDPSession();
    await h.play(() => {
      const G = window.QA.G;
      for (const e of G.Enemies.list) { e.alive = false; if (e.group) e.group.visible = false; }
      G.Skeletons.setEnabled(false);
      window.__S = {
        yaw() { const m = window.QA.MP.camera.matrixWorld.elements; return Math.atan2(-m[8], -m[10]) * 180 / Math.PI; },
        quadros: n => new Promise(r => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }),
        centro(sel) { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; },
        /* mexe num ajuste do menu como o slider faz (evento `input`) e devolve
           o texto que o jogador lê ao lado dele */
        ajustar(id, v) {
          const el = document.getElementById(id);
          el.value = String(v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input'));
          const o = document.getElementById(id + 'V');
          return o ? o.textContent : null;
        },
        texto: id => document.getElementById(id).textContent,
      };
    });
  });
  after(async () => { if (h) await h.close(); });

  const unwrap = d => ((d + 540) % 360) - 180;
  /* um dedo arrasta `px` na horizontal a `pxs` px/s, com uma amostra a cada
     `hzDedo` Hz. `tempoReal`: espera entre amostras (o jogo vê as amostras
     espalhadas pelos quadros) ou manda tudo de uma vez (um quadro só vê o
     arrasto inteiro — a taxa de quadros mais baixa possível). */
  async function arrastarOlhar(px, pxs, { hzDedo = 120, tempoReal = false, id = 1 } = {}) {
    const L = await h.play(() => window.__S.centro('#tcLook'));
    const x0 = Math.round(L.x + Math.min(px / 2, 180)), y = Math.round(L.y);
    const n = Math.max(1, Math.round(px / pxs * hzDedo)), dt = px / pxs / n;
    const t0 = Date.now() / 1000;
    const ev = (type, x, t) => cdp.send('Input.dispatchTouchEvent',
      { type, timestamp: t, touchPoints: [{ x, y, id, radiusX: 5, radiusY: 5, force: 1 }] });
    await h.play(() => window.__S.quadros(3));
    const a = await h.play(() => window.__S.yaw());
    await ev('touchStart', x0, t0);
    for (let i = 1; i <= n; i++) {
      await ev('touchMove', x0 - px * i / n, t0 + dt * i);
      if (tempoReal) await sleep(dt * 1000);
    }
    await h.play(() => window.__S.quadros(3));
    const b = await h.play(() => window.__S.yaw());
    await ev('touchEnd', x0 - px, t0 + dt * n + 0.01);
    await h.play(() => window.__S.quadros(2));
    return Math.abs(unwrap(b - a));
  }

  it('M3: dado o menu, então arrastar MEIA TELA gira os graus que o menu mostra — a 100 % e a 150 %', async () => {
    const r = [];
    for (const pct of [100, 150]) {
      const texto = await h.play(p => window.__S.ajustar('setTLook', p), pct);
      const m = /meia tela (\d+)°/.exec(texto || '');
      const meia = await h.play(() => innerWidth / 2);
      const giro = await arrastarOlhar(meia, 400);
      r.push({ pct, texto, prometido: m ? +m[1] : NaN, giro });
    }
    await h.play(() => window.__S.ajustar('setTLook', 100));
    for (const c of r) console.log(`  [M3] ${c.pct}%: menu "${c.texto}"; meia tela girou ${c.giro.toFixed(2)}°`);
    for (const c of r) {
      assert.ok(Number.isFinite(c.prometido), `o menu não diz quanto a meia tela gira: "${c.texto}"`);
      /* o menu arredonda ao grau: tolerância de 0,5° + 1 % */
      assert.ok(Math.abs(c.giro - c.prometido) <= 0.5 + c.prometido * 0.01,
        `${c.pct}%: o menu promete ${c.prometido}°, a meia tela girou ${c.giro.toFixed(2)}°`);
    }
  });

  it('dado o PADRÃO (sem aceleração), então dedo lento e dedo rápido giram o MESMO pelo mesmo arrasto', async () => {
    const lento = await arrastarOlhar(200, 150);
    const rapido = await arrastarOlhar(200, 2500);
    console.log(`  [padrão] 200 px: ${lento.toFixed(3)}° a 150 px/s, ${rapido.toFixed(3)}° a 2500 px/s`);
    assert.ok(Math.abs(rapido / lento - 1) < 0.005, `linear por padrão (M3e): ${lento}° × ${rapido}°`);
  });

  it('dada a aceleração a 100 %, então lento gira o do linear, rápido gira 2×, e o giro não depende da taxa de quadros', async () => {
    const txt = await h.play(() => window.__S.ajustar('setTAccel', 100));
    const linear = 200 * 0.0032 * 180 / Math.PI;
    const lento = await arrastarOlhar(200, 150);
    const rapido = await arrastarOlhar(200, 2500);
    const rapidoTempoReal = await arrastarOlhar(200, 2500, { tempoReal: true, hzDedo: 60 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    let lentoCPU, rapidoCPU;
    try {
      lentoCPU = await arrastarOlhar(200, 150, { tempoReal: true, hzDedo: 60 });
      rapidoCPU = await arrastarOlhar(200, 2500, { tempoReal: true, hzDedo: 60 });
    } finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); }
    await h.play(() => window.__S.ajustar('setTAccel', 0));
    console.log(`  [aceleração ${txt}] 200 px: lento ${lento.toFixed(2)}°, rápido ${rapido.toFixed(2)}° ` +
      `(tempo real ${rapidoTempoReal.toFixed(2)}°; CPU 4×: lento ${lentoCPU.toFixed(2)}°, rápido ${rapidoCPU.toFixed(2)}°); linear ${linear.toFixed(2)}°`);
    assert.ok(Math.abs(lento / linear - 1) < 0.01, `dedo lento com aceleração: ${lento}° (linear ${linear}°)`);
    assert.ok(Math.abs(rapido / linear - 2) < 0.02, `dedo rápido com aceleração: ${rapido}° (2× o linear = ${2 * linear}°)`);
    for (const [nome, v, ref] of [['rápido em tempo real', rapidoTempoReal, rapido], ['lento com CPU 4×', lentoCPU, lento],
      ['rápido com CPU 4×', rapidoCPU, rapido]])
      assert.ok(Math.abs(v / ref - 1) < 0.01, `${nome}: ${v.toFixed(3)}°, num quadro só ${ref.toFixed(3)}° — depende da taxa de quadros`);
  });

  /* ---- ANALÓGICO ---- */
  async function velocidade(fn, ms = 900) {
    /* recoloca o jogador num chão aberto SEM passo manual do laço */
    await h.play(() => {
      const MP = window.QA.MP, P = MP.player;
      P.pos.set(30, MP.groundAt(30, 30, 999), 30); P.vel.set(0, 0, 0);
    });
    await sleep(150);
    await fn();
    await sleep(500);
    const a = await h.play(() => { const P = window.QA.MP.player.pos; return [P.x, P.z, performance.now()]; });
    await sleep(ms);
    const b = await h.play(() => { const P = window.QA.MP.player.pos; return [P.x, P.z, performance.now()]; });
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / ((b[2] - a[2]) / 1000);
  }
  async function comPolegar(frac, raio = 58) {
    const S = await h.play(() => window.__S.centro('#tcMove'));
    const p = { x: S.x, y: S.y, id: 7, radiusX: 5, radiusY: 5, force: 1 };
    const v = await velocidade(async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
      p.y = S.y - frac * raio;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [p] });
    return v;
  }
  /* deflexão pós-zona-morta m → fração do raio bruta */
  const bruto = m => m * 0.88 + 0.12;

  it('dado o analógico logo abaixo do limiar de corrida, então anda o que o W do TECLADO anda; a 0,82 corre', async () => {
    const teclado = await velocidade(async () => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
    });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
    const topo = await comPolegar(bruto(0.78));
    const meio = await comPolegar(0.5);
    const corre = await comPolegar(bruto(0.82));
    console.log(`  [andar] W do teclado ${teclado.toFixed(2)} m/s; polegar a 0,78: ${topo.toFixed(2)} m/s; ` +
      `meio curso: ${meio.toFixed(2)} m/s; a 0,82: ${corre.toFixed(2)} m/s`);
    assert.ok(teclado > 4.5, `cenário inválido: o W do teclado andou ${teclado.toFixed(2)} m/s`);
    assert.ok(topo / teclado > 0.95, `no topo da faixa de andar o toque anda ${(topo / teclado * 100).toFixed(1)} % do teclado`);
    assert.ok(corre > teclado * 1.4, `a 0,82 de deflexão devia CORRER: ${corre.toFixed(2)} m/s`);
    assert.ok(meio > 1 && meio < topo, `meio curso fora da faixa de andar: ${meio.toFixed(2)} m/s`);
  });

  it('dado o curso do analógico em 60 %, então 36 px de polegar já correm; em 100 %, andam', async () => {
    const t100 = await h.play(() => window.__S.texto('setTStickV'));
    const anda = await comPolegar(36 / 58);
    const t60 = await h.play(() => window.__S.ajustar('setTStick', 60));
    const corre = await comPolegar(36 / 58);
    await h.play(() => window.__S.ajustar('setTStick', 100));
    console.log(`  [curso] 36 px: ${anda.toFixed(2)} m/s com "${t100}", ${corre.toFixed(2)} m/s com "${t60}"`);
    assert.ok(anda < 5.3, `curso 100 %: 36 px já correm (${anda.toFixed(2)} m/s)`);
    assert.ok(corre > 7, `curso 60 %: 36 px deviam correr (${corre.toFixed(2)} m/s)`);
  });

  it('dado RESTAURAR PADRÃO, então aceleração e curso voltam (0 % e 100 %) junto com o resto', async () => {
    const r = await h.play(() => {
      const S = window.__S;
      S.ajustar('setTAccel', 70); S.ajustar('setTStick', 80);
      document.getElementById('setTReset').click();
      return { accel: S.texto('setTAccelV'), stick: S.texto('setTStickV'),
        vAccel: document.getElementById('setTAccel').value, vStick: document.getElementById('setTStick').value };
    });
    assert.deepEqual(r, { accel: '0%', stick: '100%', vAccel: '0', vStick: '100' });
  });

  it('dado o percurso, então nenhum erro de página apareceu', () => {
    assert.deepEqual(h.pageErrors, [], `erros de página: ${h.pageErrors.join(' | ')}`);
  });
});
