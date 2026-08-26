/* ================================================================
   QA — progresso HONESTO durante o carregamento do mundo.

   Antes desta rodada o botão nascia com "CARREGANDO O MUNDO..." (ver
   index.html) e ficava com ESSE MESMO texto estático por ~2,7 s (medido
   com scripts/vr-baseline.js), porque nada no boot cedia a vez pro
   navegador repintar — a etiqueta só existia OFICIALMENTE (MenuGate.wired
   vira true no meio do arquivo), mas o usuário nunca via a mudança antes
   do módulo inteiro terminar de rodar.

   Este teste prova que o boot agora anuncia fases DE VERDADE — não uma
   barra falsa: cada fase é um ponto real do worldgen que já terminou
   quando o texto muda (ver os `await bootFase(...)` em game.js, sempre
   DEPOIS do statement que fecha aquele pedaço do mundo). MenuGate.bootFases
   é o registro cru dessas fases, na ordem em que aconteceram.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

describe('progresso do boot (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3427, autoStart: false }); });
  after(async () => { if (h) await h.close(); });

  it('dado o boot completo, então MenuGate anunciou várias fases distintas (não uma etiqueta congelada)', async () => {
    const r = await h.play(() => {
      const MG = window.__game.MenuGate;
      return { fases: MG.bootFases.slice(), wired: MG.wired };
    });
    assert.ok(r.wired, 'boot terminou sem destravar o menu (MenuGate.wired continua false)');
    assert.ok(Array.isArray(r.fases), 'MenuGate.bootFases não existe — o boot não registra progresso');
    assert.ok(r.fases.length >= 4,
      `poucas fases anunciadas (${r.fases.length}) — o boot ainda parece uma etiqueta só: ${JSON.stringify(r.fases)}`);
    for (const f of r.fases) {
      assert.equal(typeof f, 'string', `fase não é texto: ${JSON.stringify(f)}`);
      assert.ok(f.trim().length >= 4, `fase vazia ou curta demais pra dizer algo: "${f}"`);
    }
    const distintas = new Set(r.fases);
    assert.equal(distintas.size, r.fases.length,
      `fase repetida — sinal falso de progresso: ${JSON.stringify(r.fases)}`);
  });

  it('dado o boot completo, então o botão principal NÃO fica preso no texto de carregamento', async () => {
    const texto = await h.play(() => (document.getElementById('btnNew').textContent || '').trim());
    assert.ok(!/CARREGANDO/i.test(texto), `botão ainda diz "carregando" com o boot pronto: "${texto}"`);
  });
});
