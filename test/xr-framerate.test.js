/* ================================================================
   QA — TAXA DE QUADROS DECLARADA DA SESSÃO XR (critério E1).

   Ponto de partida, medido pelo validador em `98b114f` e reconferido no
   HEAD: `updateTargetFrameRate` **nunca é chamado**, `supportedFrameRates`
   traz `[72, 80, 90, 120]` e a sessão nasce em **90 Hz por herança**.
   O alvo declarado do projeto é 72 — 13,89 ms por frame em vez de 11,11,
   ou seja **+25 % de orçamento**, num quadro que a medição de
   `docs/vr/perf-xr.md` põe a 4,3× do teto de draw calls.

   O QUE ESTE ARQUIVO MEDE:

   - **O estado da sessão, não a chamada.** A asserção é `session.frameRate`
     saindo de 90 e chegando em 72, mais o evento `frameratechange` que o
     runtime dispara. Se a política parar de escolher 72, ou se a aplicação
     parar de pedir, `frameRate` fica em 90 e este arquivo fica vermelho.
   - **Que pedir todo frame não vira enxurrada.** O wiring do game.js chama
     dentro do laço; se a aplicação não fosse idempotente, seriam dezenas de
     promessas e de eventos por segundo.
   - **Que a lista É `Float32Array`.** `Array.isArray(new Float32Array())` é
     **false** — a mesma armadilha do `inputSources` que já custou cinco
     relatos de "os controles não funcionam" nesta base.

   O que o emulado NÃO prova: que o compositor passou a rodar a 72 Hz. O
   próprio IWER avisa que "the nominal frame rate updates are emulated, no
   actual update to the display frame rate of the device will be executed".
   Tempo é do aparelho (`adb logcat -s VrApi`).

   Referência e números: docs/vr/referencia-tato-sessao.md
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3452;

/* ================================================================
   POLÍTICA PURA — qual taxa pedir, dada a lista da sessão.
   ================================================================ */
describe('escolha da taxa (unidade, sem navegador)', () => {
  let escolherTaxa, msPorFrame, TAXA_ALVO;
  before(async () => {
    ({ escolherTaxa, msPorFrame, TAXA_ALVO } = await import('../js/xr/xrframerate.js'));
  });

  it('o alvo do projeto é 72 — e 72 é taxa válida de loja', () => {
    assert.equal(TAXA_ALVO, 72,
      'VRC.Quest.Performance.1 aceita 72/80/90/96/100/120; o alvo declarado aqui é 72');
  });

  it('aceita `Float32Array`, que é o tipo REAL de supportedFrameRates', () => {
    /* `Array.isArray(new Float32Array([72]))` é FALSE. Um guarda com
       `Array.isArray` faz o jogo nunca declarar taxa nenhuma, em silêncio —
       exatamente o que `inputSources` já fez com os dois controles. */
    const r = escolherTaxa({ suportadas: new Float32Array([72, 80, 90, 120]), atual: 90 });
    assert.equal(r.taxa, 72, `com Float32Array a escolha saiu ${r.taxa} (motivo: ${r.motivo})`);
  });

  it('aceita Array comum também', () => {
    assert.equal(escolherTaxa({ suportadas: [72, 80, 90, 120], atual: 90 }).taxa, 72);
  });

  it('não pede o que já está em vigor — pedir de novo é ruído', () => {
    const r = escolherTaxa({ suportadas: [72, 80, 90], atual: 72 });
    assert.equal(r.taxa, null);
    assert.equal(r.motivo, 'ja-esta');
  });

  it('sem lista, não pede nada (navegador sem a API)', () => {
    for (const s of [undefined, null, [], new Float32Array(0), 42, {}]) {
      const r = escolherTaxa({ suportadas: s, atual: 90 });
      assert.equal(r.taxa, null, `lista ${JSON.stringify(s)} devia calar, e devolveu ${r.taxa}`);
      assert.equal(r.motivo, 'sem-lista');
    }
  });

  it('alvo fora da lista cai no maior valor ABAIXO dele, nunca acima', () => {
    const r = escolherTaxa({ suportadas: [60, 80, 90, 120], alvo: 72, atual: 90 });
    assert.equal(r.taxa, 60,
      'pedir 80 quando o alvo é 72 é pedir MENOS orçamento por frame do que o projeto decidiu');
  });

  it('se tudo é mais rápido que o alvo, pega o mais lento que existe', () => {
    const r = escolherTaxa({ suportadas: [90, 120], alvo: 72, atual: 120 });
    assert.equal(r.taxa, 90);
  });

  it('nunca escolhe uma taxa fora da lista — pedir fora REJEITA a promessa', () => {
    /* W3C: "If rate is not in supportedFrameRates, reject promise with a
       TypeError". A política é a primeira linha de defesa contra isso. */
    for (const lista of [[72, 90], [80], [90, 120], [60, 61, 62]]) {
      const r = escolherTaxa({ suportadas: lista, atual: -1 });
      assert.ok(r.taxa === null || lista.includes(r.taxa),
        `escolheu ${r.taxa}, que não está em ${JSON.stringify(lista)}`);
    }
  });

  it('o orçamento por frame bate com a aritmética que motivou o 72', () => {
    assert.ok(Math.abs(msPorFrame(72) - 13.888) < 0.01, msPorFrame(72));
    assert.ok(Math.abs(msPorFrame(90) - 11.111) < 0.01, msPorFrame(90));
    const ganho = msPorFrame(72) / msPorFrame(90) - 1;
    assert.ok(Math.abs(ganho - 0.25) < 0.001,
      `72 Hz devia dar +25% de orçamento sobre 90 Hz, deu ${(ganho * 100).toFixed(1)}%`);
    assert.equal(msPorFrame(0), null, 'taxa inválida não tem orçamento');
  });
});

/* ================================================================
   A SESSÃO DE VERDADE.
   ================================================================ */
describe('taxa aplicada na sessão de verdade', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(async () => {
      const { createXrFrameRate } = await import('/js/xr/xrframerate.js');
      window.__FR = createXrFrameRate();
      // contador do evento que o RUNTIME dispara — não do que o módulo faz
      window.__mudancas = [];
      const s = window.__MP.renderer.xr.getSession();
      s.addEventListener('frameratechange',
        () => window.__mudancas.push(s.frameRate));
    });
  });
  after(async () => { if (h) await h.close(); });

  /* ESTES CASOS MUDARAM COM A FIAÇÃO. Enquanto o game.js não chamava
     `aplicar()`, a sessão ficava nos 90 Hz de herança e dava pra observar o
     "antes". Com a fiação, o primeiro frame da sessão já declara 72 — e um
     teste que ainda cobra 90 está cobrando a ausência do produto. É a quinta
     vez que essa armadilha aparece nesta frente: teste escrito sem fiação mede
     um mundo onde o conserto não existe. O que continua verificável, e é o que
     importa, está abaixo: a sessão ESTÁ em 72, 72 é oferecido, e o tipo da
     lista continua sendo o que exige o guarda tolerante. */
  it('com a fiação, a sessão já está em 72 — e 90 era a herança', async () => {
    const r = await h.play(() => {
      const s = window.__MP.renderer.xr.getSession();
      return {
        nasceu: s.frameRate,
        oferece: Array.from(s.supportedFrameRates || []),
        ehArray: Array.isArray(s.supportedFrameRates),
        tipo: s.supportedFrameRates && s.supportedFrameRates.constructor.name,
      };
    });
    assert.equal(r.nasceu, 72,
      `a sessão está em ${r.nasceu} Hz: sem a declaração ela herda 90, que dá 11,11 ms ` +
      'por frame contra 13,89 — 25% menos orçamento num quadro que já está 4x acima do teto');
    assert.ok(r.oferece.includes(72), `72 não está em ${JSON.stringify(r.oferece)}`);
    assert.equal(r.ehArray, false,
      `supportedFrameRates virou Array de verdade (${r.tipo}) — o guarda tolerante ficou redundante`);
  });

  it('aplicar é IDEMPOTENTE: pedir de novo não repete o pedido nem o aviso', async () => {
    const r = await h.play(async () => {
      const s = window.__MP.renderer.xr.getSession();
      const antes = s.frameRate;
      const det = await window.__FR.aplicar(s);
      await new Promise(res => setTimeout(res, 60));
      return { antes, det, depois: s.frameRate, mudancas: window.__mudancas.slice() };
    });
    /* Com a fiação, o game.js já pôs a sessão em 72 antes deste teste rodar —
       então o "antes" aqui é 72, e o que se verifica é que pedir de novo não
       repete nada. Cobrar 90 seria cobrar que a fiação não existisse. */
    assert.equal(r.antes, 72, `a sessão devia já estar em 72 pela fiação, está em ${r.antes}`);
    assert.equal(r.depois, 72, `pedir de novo mexeu na taxa: ${r.depois} Hz`);
    assert.equal(r.det.ok, true, `aplicar falhou: ${JSON.stringify(r.det)}`);
    assert.deepEqual(r.mudancas, [],
      `pedir a taxa que já vale disparou ${JSON.stringify(r.mudancas)} — seriam ~72 eventos por segundo`);
  });

  it('chamar todo frame não vira enxurrada de pedidos', async () => {
    /* ESTE CASO NÃO PODIA FALHAR, e a auditoria pegou. Ele contava eventos de
       `frameratechange` com a sessão JÁ em 72: `escolherTaxa` devolvia
       'ja-esta' e nem chegava a pedir, então zero eventos era o resultado com
       ou sem a guarda de idempotência. Agora a sessão é empurrada para 90
       antes, para que a primeira das 50 chamadas TENHA trabalho a fazer — sem
       a guarda, as outras 49 pediriam de novo. */
    const r = await h.play(async () => {
      const s = window.__MP.renderer.xr.getSession();
      /* Empurra para 90 e mede SEM ceder o laço: o game.js reconquista os 72
         em um frame, e qualquer espera aqui deixaria ele resolver antes das 50
         chamadas — o teste voltaria a medir zero por construção. */
      window.__mudancas.length = 0;
      const p = s.updateTargetFrameRate(90);
      const pedidos = [];
      for (let i = 0; i < 50; i++) pedidos.push((await window.__FR.aplicar(s)).motivo);
      await p;
      await new Promise(res => setTimeout(res, 200));
      return {
        pediram: pedidos.filter(m => m !== 'ja-esta' && m !== 'em-voo').length,
        final: s.frameRate,
      };
    });
    assert.equal(r.final, 72, `a sessão terminou em ${r.final} Hz`);
    assert.ok(r.pediram <= 2,
      `das 50 chamadas, ${r.pediram} viraram pedido de verdade — sem a guarda de ` +
      'idempotência seriam ~72 por segundo, cada uma com sua promessa e seu evento');
  });

  it('o módulo SEGUE a taxa quando o sistema muda por fora', async () => {
    /* W3C: "If XRSession's nominal frame rate is changed for ANY reason […]".
       Quem presume que o valor pedido é o valor em vigor mente no relatório. */
    const r = await h.play(async () => {
      const s = window.__MP.renderer.xr.getSession();
      await s.updateTargetFrameRate(90);            // "o sistema baixou/subiu sozinho"
      /* LEITURA IMEDIATA, sem ceder um frame: com a fiação aplicada o game.js
         reconquista os 72 na primeira volta do laço, então esperar aqui mediria
         a reconquista e não a leitura. */
      const seguiu = window.__FR.taxa;
      await new Promise(res => setTimeout(res, 400));   // agora sim: deixa o jogo reagir
      return { seguiu, final: s.frameRate, taxaModulo: window.__FR.taxa };
    });
    assert.equal(r.seguiu, 90,
      `o sistema mudou para 90 e o módulo continuou reportando ${r.seguiu} — ` +
      'quem espelha o valor pedido em vez de ler a sessão mente no relatório');
    assert.equal(r.final, 72,
      'o jogo não reconquistou os 72 Hz depois de o sistema mudar por fora');
    assert.equal(r.taxaModulo, 72);
  });

  it('o orçamento por frame reportado é o dos 72 Hz', async () => {
    const ms = await h.play(() => window.__FR.orcamentoMs);
    assert.ok(Math.abs(ms - 13.888) < 0.01,
      `orçamento reportado ${ms} ms — a 72 Hz o frame tem 13,89 ms`);
  });

  it('sessão encerrada: rejeita, é engolido, e não deixa erro de console', async () => {
    /* W3C: `updateTargetFrameRate` rejeita com InvalidStateError se a sessão
       terminou. A sessão pode acabar por fora entre o frame e a promessa —
       Promise rejeitada sem catch é erro no console, e o critério I2 é zero. */
    const r = await h.play(async () => {
      const G = window.__game;
      const { createXrFrameRate } = await import('/js/xr/xrframerate.js');
      const s = window.__MP.renderer.xr.getSession();
      await G.XR.exit();
      for (let i = 0; i < 30 && G.XR.presenting; i++) await new Promise(res => setTimeout(res, 50));
      const outro = createXrFrameRate({ alvo: 90 });   // 90 ≠ 72 vigente: vai TENTAR pedir
      const det = await outro.aplicar(s);
      const semSessao = await outro.aplicar(null);
      await new Promise(res => setTimeout(res, 120));
      return { presenting: G.XR.presenting, det, semSessao, erros: G.errors.slice() };
    });
    assert.equal(r.presenting, false, 'a sessão não terminou — o caso não mediu o que queria');
    assert.equal(r.det.ok, false, `pedir taxa em sessão encerrada devolveu ${JSON.stringify(r.det)}`);
    assert.ok(r.det.erro, 'a rejeição foi engolida sem deixar rastro do motivo');
    assert.equal(r.semSessao.motivo, 'sem-sessao');
    assert.deepEqual(r.erros, [], `erro de console: ${r.erros.join(' | ')}`);
  });
});
