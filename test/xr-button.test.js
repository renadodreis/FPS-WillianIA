/* ================================================================
   QA — POLÍTICA DO BOTÃO DE VR (js/xr/xrbutton.js).

   Regra central: botão só aparece pra quem pode usar. Um "ENTRAR EM VR"
   morto num desktop é ruído no menu de 99% dos jogadores.

   A exceção que existe por experiência de campo: num HEADSET servido
   sem contexto seguro (o clássico `npm start` + IP da rede local),
   `navigator.xr` não existe e o botão sumiria calado — o jogador com o
   aparelho na cabeça concluiria que o jogo não tem VR. Nesse caso o
   botão aparece DESABILITADO, dizendo o que fazer.

   A política é pura de propósito: decidir texto e visibilidade não
   precisa de DOM, e é exatamente onde mora o bug chato.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let xrButtonState;
before(async () => {
  ({ xrButtonState } = await import('../js/xr/xrbutton.js'));
});

const DESKTOP = { device: false, api: true, reason: 'WebXR disponível, mas não é um headset' };
const HEADSET = { device: true, api: true, reason: 'navegador de headset com WebXR' };
const HEADSET_HTTP = { device: true, api: false, reason: 'WebXR exige contexto seguro (HTTPS ou localhost)' };
const SEM_WEBXR = { device: false, api: false, reason: 'navegador sem WebXR (navigator.xr ausente)' };

describe('quando o botão aparece', () => {
  it('não aparece num desktop sem headset plugado', () => {
    assert.equal(xrButtonState({ env: DESKTOP, supported: false }).show, false);
  });

  it('aparece quando existe sessão immersive-vr de verdade', () => {
    const s = xrButtonState({ env: DESKTOP, supported: true });
    assert.equal(s.show, true);
    assert.equal(s.enabled, true);
  });

  it('aparece no headset com suporte', () => {
    assert.equal(xrButtonState({ env: HEADSET, supported: true }).show, true);
  });

  it('não aparece em navegador sem WebXR nenhum', () => {
    assert.equal(xrButtonState({ env: SEM_WEBXR, supported: false }).show, false);
  });
});

describe('headset servido sem contexto seguro', () => {
  it('aparece desabilitado em vez de sumir calado', () => {
    const s = xrButtonState({ env: HEADSET_HTTP, supported: false });
    assert.equal(s.show, true);
    assert.equal(s.enabled, false);
  });

  it('o texto diz o que fazer, não só que falhou', () => {
    const s = xrButtonState({ env: HEADSET_HTTP, supported: false });
    assert.match(`${s.label} ${s.reason}`, /https|localhost/i);
  });
});

describe('texto', () => {
  it('convida a entrar quando está fora', () => {
    assert.match(xrButtonState({ env: HEADSET, supported: true }).label, /entrar|vr/i);
  });

  it('oferece a saída quando está dentro', () => {
    const s = xrButtonState({ env: HEADSET, supported: true, presenting: true });
    assert.match(s.label, /sair/i);
    assert.equal(s.enabled, true);
  });
});

describe('robustez', () => {
  it('não lança sem argumento nenhum', () => {
    const s = xrButtonState();
    assert.equal(s.show, false);
    assert.equal(typeof s.label, 'string');
  });

  it('não lança com ambiente corrompido', () => {
    for (const env of [null, 'lixo', 42, []]) {
      assert.equal(xrButtonState({ env, supported: true }).show, true);
    }
  });
});
