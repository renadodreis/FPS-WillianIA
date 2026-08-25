/* ================================================================
   QA — DETECÇÃO DE AMBIENTE XR (js/xr/xrenv.js).

   Mesma forma do js/mobile.js e do js/gputier.js: módulo PURO que
   recebe o ambiente por parâmetro. Quem lê `navigator`/`window` de
   verdade é só o wrapper fino no fim do arquivo.

   O módulo responde DUAS perguntas diferentes, e confundir as duas é o
   bug que este teste existe pra travar:

     `device` — "isto é um navegador de headset?" É SÍNCRONO e decide o
       preset de CFG (alcance de visão, sombra) ANTES do worldgen, do
       mesmo jeito que o corte de celular. Um Quest continua sendo um
       Quest mesmo servido por http:// numa rede local.

     `api`    — "dá pra abrir uma sessão WebXR?" Exige `navigator.xr` E
       contexto seguro. Este é o que decide se o botão de entrar em VR
       aparece.

   A separação não é preciosismo: servir o jogo por http:// num IP de
   rede local é o modo mais comum de testar no headset, e nesse caso
   `navigator.xr` simplesmente NÃO EXISTE. Sem `api` separado de
   `device`, o sintoma vira "o botão sumiu" sem nenhuma explicação — e o
   preset de qualidade também sumiria junto, o que é errado duas vezes.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let detectXr, xrOverrideFrom, XR_UA_RE;
before(async () => {
  ({ detectXr, xrOverrideFrom, XR_UA_RE } = await import('../js/xr/xrenv.js'));
});

/* User-agents reais, copiados na íntegra: encurtar UA em teste é como
   esconder o caso que quebra. */
const UA_QUEST = 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'OculusBrowser/35.1.0.20.45.567890 SamsungBrowser/4.0 Chrome/126.0.6478.122 VR Safari/537.36';
const UA_DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/151.0.0.0 Safari/537.36';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Mobile Safari/537.36';

describe('detecção de ambiente XR', () => {
  it('reconhece o navegador do Quest pelo user-agent', () => {
    const r = detectXr({ hasXr: true, secureContext: true, userAgent: UA_QUEST });
    assert.equal(r.device, true);
    assert.equal(r.api, true);
  });

  it('não confunde desktop com headset, mesmo com navigator.xr presente', () => {
    // Chrome de desktop expõe navigator.xr sempre — não é um aparelho de VR,
    // e não pode receber o corte de qualidade de VR.
    const r = detectXr({ hasXr: true, secureContext: true, userAgent: UA_DESKTOP });
    assert.equal(r.device, false);
    assert.equal(r.api, true);
  });

  it('não confunde celular Android com headset', () => {
    const r = detectXr({ hasXr: true, secureContext: true, userAgent: UA_ANDROID });
    assert.equal(r.device, false);
  });

  it('num Quest servido por http:// o aparelho continua sendo Quest, mas a API não', () => {
    // caso de campo: `npm start` + IP da rede local. Sem HTTPS e sem
    // localhost, `navigator.xr` não existe.
    const r = detectXr({ hasXr: false, secureContext: false, userAgent: UA_QUEST });
    assert.equal(r.device, true, 'o preset de VR tem que valer mesmo assim');
    assert.equal(r.api, false);
    assert.match(r.reason, /segur/i, 'o motivo precisa dizer que falta contexto seguro');
  });

  it('contexto seguro sem navigator.xr é navegador sem WebXR, não falta de HTTPS', () => {
    const r = detectXr({ hasXr: false, secureContext: true, userAgent: UA_DESKTOP });
    assert.equal(r.api, false);
    assert.doesNotMatch(r.reason, /segur/i);
  });

  it('?xr=1 força o modo VR num desktop (QA e suporte)', () => {
    const r = detectXr({ hasXr: true, secureContext: true, userAgent: UA_DESKTOP, search: '?xr=1' });
    assert.equal(r.device, true);
    assert.match(r.reason, /for[çc]ad/i);
  });

  it('?xr=0 desliga tudo num Quest e vence a detecção', () => {
    const r = detectXr({ hasXr: true, secureContext: true, userAgent: UA_QUEST, search: '?xr=0' });
    assert.equal(r.device, false);
    assert.equal(r.api, false);
  });

  it('não lança com ambiente ausente ou corrompido', () => {
    for (const env of [undefined, null, {}, [], 'lixo', { userAgent: 42, search: {} }]) {
      const r = detectXr(env);
      assert.equal(r.device, false);
      assert.equal(typeof r.reason, 'string');
    }
  });

  it('sempre devolve um motivo legível', () => {
    for (const env of [
      { hasXr: true, secureContext: true, userAgent: UA_QUEST },
      { hasXr: true, secureContext: true, userAgent: UA_DESKTOP },
      { hasXr: false, secureContext: false, userAgent: UA_QUEST },
    ]) {
      assert.ok(detectXr(env).reason.length > 3, JSON.stringify(env));
    }
  });
});

describe('override por query', () => {
  it('lê ?xr=1 e ?xr=0 e ignora o resto', () => {
    assert.equal(xrOverrideFrom('?xr=1'), true);
    assert.equal(xrOverrideFrom('?xr=0'), false);
    assert.equal(xrOverrideFrom('?xr=talvez'), null);
    assert.equal(xrOverrideFrom(''), null);
    assert.equal(xrOverrideFrom(undefined), null);
  });

  it('acha o parâmetro no meio da query', () => {
    assert.equal(xrOverrideFrom('?perf=1&xr=1&tier=alto'), true);
    assert.equal(xrOverrideFrom('?tier=alto&xr=0'), false);
  });

  it('não casa com parâmetro de nome parecido', () => {
    // `?xrole=1` não é `?xr=1`; e `?mobile=1` não pode virar VR
    assert.equal(xrOverrideFrom('?xrole=1'), null);
    assert.equal(xrOverrideFrom('?mobile=1'), null);
  });
});

describe('padrão de user-agent', () => {
  it('cobre os navegadores de headset conhecidos', () => {
    assert.match('OculusBrowser/35.1', XR_UA_RE);
    assert.match('Quest 3', XR_UA_RE);
    assert.match('Pico Browser/4.0', XR_UA_RE);
  });

  it('não casa com navegador comum', () => {
    assert.doesNotMatch(UA_DESKTOP, XR_UA_RE);
    assert.doesNotMatch(UA_ANDROID, XR_UA_RE);
  });
});
