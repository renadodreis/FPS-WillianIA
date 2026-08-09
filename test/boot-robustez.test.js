'use strict';
/* ================================================================
   QA — O BOOT NÃO PODE TRAVAR O MENU, E A QUEDA DO SOCKET PRECISA
   TER SAÍDA.

   Quatro buracos medidos (docs/2026-08-09-menu-unico.md, itens 1-3):

   1. `multiplayer-client.js` injetava <script src="br-game.js"> SEM
      `onerror`, e o poll de `window.__BR_game` não tinha teto. Arquivo
      404 / rede caída = poll girando pra sempre, `boot()` nunca roda,
      `#btnNew` fica `.disabled` com "ABRINDO LOBBY..." ETERNAMENTE e
      nada avisa. Este é o "trava" que o dono relata.
   2. `#btnNew` era desabilitado UMA vez no boot, por um instantâneo de
      `__mpSocket`. Nada revertia depois.
   3. Zero `socket.on('disconnect')` no cliente inteiro: a sala podia
      cair e o jogador ficava olhando um lobby morto.
   4. Do fim do parse do HTML até o fim do worldgen o menu já renderiza
      e faz hover por CSS, mas nenhum listener existe — clique não faz
      nada e nada avisa.

   Nada cobria isso. Estes testes são a rede.

   O CAMINHO IRMÃO (parte 2 que chega ATRASADA, e por isso NÃO pode ser
   amputada) já tem rede em test/harness-br-readiness.test.js (segura o
   br-game.js por 60 s) e test/br-reconnect-init.test.js (30 s): os dois
   exigem que o BR ainda boote depois do teto de espera. Transformar a
   demora em falha definitiva quebra aqueles dois, de propósito.
   ================================================================ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('./helpers/harness');

/* lido DENTRO da página (puppeteer serializa a função) */
function leiaMenu() {
  const btn = document.getElementById('btnNew');
  const cfg = document.getElementById('btnSettings');
  const aviso = document.getElementById('menuNotice');
  return {
    texto: (btn.textContent || '').trim(),
    desabilitado: btn.classList.contains('disabled'),
    clicavel: getComputedStyle(btn).pointerEvents !== 'none',
    cfgDesabilitado: cfg.classList.contains('disabled'),
    aviso: aviso && !aviso.hidden ? (aviso.textContent || '').trim() : '',
    started: window.__game.state.started,
    brFalhou: window.__BR_loadFailed || null,
    conectado: !!(window.__MP && window.__MP.socket && window.__MP.socket.connected),
  };
}

const botaoLiberado = () => {
  const b = document.getElementById('btnNew');
  return !!b && !b.classList.contains('disabled');
};
/* Sala online DE PÉ e o menu já sabendo disso. Esperar (em vez de ler uma
   vez) é obrigatório: o boot pesado derruba o transporte do engine.io com
   facilidade, e nessa janela o menu — corretamente — está oferecendo solo.
   AUTOCONTIDA de propósito: o puppeteer serializa só o corpo desta função,
   então chamar um helper daqui de fora vira ReferenceError DENTRO da página
   (e o waitForFunction morre de timeout mentindo sobre a causa). */
const salaNoArNoMenu = () => {
  const b = document.getElementById('btnNew');
  const socket = window.__MP && window.__MP.socket;
  return !!(socket && socket.connected) && !window.__BR_loadFailed
    && !!b && b.classList.contains('disabled');
};

describe('menu nasce sem handler (index.html)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  it('dado o HTML cru, então os botões do menu nascem desabilitados', () => {
    for (const id of ['btnNew', 'btnSettings']) {
      const tag = new RegExp(`<div[^>]*id="${id}"[^>]*>`).exec(html);
      assert.ok(tag, `#${id} não encontrado no index.html`);
      assert.match(tag[0], /class="[^"]*\bdisabled\b[^"]*"/,
        `#${id} nasce clicável — há uma janela inteira (worldgen) sem listener: ${tag[0]}`);
    }
  });

  it('dado o HTML cru, então #btnNew nasce com o MOTIVO na etiqueta', () => {
    const rotulo = /<div[^>]*id="btnNew"[^>]*>([^<]*)</.exec(html);
    assert.ok(rotulo, 'rótulo de #btnNew não encontrado');
    const texto = rotulo[1].trim();
    assert.notEqual(texto, 'NOVO JOGO',
      'botão travado ainda promete "NOVO JOGO": o jogador clica e nada acontece');
    assert.ok(/carregando/i.test(texto), `motivo não é legível: "${texto}"`);
  });
});

describe('br-game.js indisponível (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3300;
  before(async () => {
    // 404 do br-game.js pelo caminho REAL: a requisição é abortada e o
    // <script> injetado dispara `error`.
    h = await bootGame({ port: PORT, blockRequests: ['br-game.js'], autoStart: false });
  });
  after(async () => { if (h) await h.close(); });

  it('dado br-game.js que nunca carrega, então o menu cai pra SOLO em vez de girar pra sempre', async () => {
    const liberou = await h.page.waitForFunction(botaoLiberado, { timeout: 30000, polling: 200 })
      .then(() => true).catch(() => false);
    const m = await h.play(leiaMenu);
    assert.ok(liberou, `#btnNew ficou travado pra sempre: ${JSON.stringify(m)}`);
    assert.equal(m.started, false, 'cenário inválido: o jogo já tinha começado sozinho');
    assert.ok(m.clicavel, `botão liberado mas sem pointer-events: ${JSON.stringify(m)}`);
    assert.match(m.texto, /solo/i, `etiqueta não avisa que agora é solo: "${m.texto}"`);
    assert.ok(m.aviso.length > 8, `sem motivo visível no menu: "${m.aviso}"`);
    assert.ok(m.brFalhou, 'a falha do br-game.js não foi registrada');
  });

  it('dado o clique em NOVO JOGO nesse estado, então a partida solo COMEÇA', async () => {
    const r = await h.play(() => {
      const antes = window.__game.state.started;
      document.getElementById('btnNew').click();
      const S = window.__game.state;
      return { antes, depois: S.started, pausado: S.paused };
    });
    assert.equal(r.antes, false, 'cenário inválido: já estava em jogo');
    assert.ok(r.depois, 'clique em NOVO JOGO não iniciou o jogo solo');
    assert.equal(r.pausado, false, 'jogo solo começou pausado');
  });
});

describe('queda de socket com o menu na tela (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3301;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false, extraEnv: { COUNTDOWN_S: '60' } });
    // o lobby BR só existe depois que br-game.js carrega e boota
    await h.page.waitForFunction('!!document.getElementById("brStartBtn")', { timeout: 60000 });
  });
  after(async () => { if (h) await h.close(); });

  it('controle: com a sala no ar o solo segue barrado, mas CONFIGURAÇÕES já responde', async () => {
    const noAr = await h.page.waitForFunction(salaNoArNoMenu, { timeout: 30000, polling: 200 })
      .then(() => true).catch(() => false);
    const m = await h.play(leiaMenu);
    assert.ok(noAr, `sala online nunca estabilizou no menu: ${JSON.stringify(m)}`);
    assert.ok(m.desabilitado, `sala online no ar e #btnNew clicável: "${m.texto}"`);
    assert.match(m.texto, /SALA ONLINE/i, `etiqueta inesperada: "${m.texto}"`);
    assert.equal(m.cfgDesabilitado, false, 'CONFIGURAÇÕES continua travado depois do boot');
    assert.equal(m.brFalhou, null, 'br-game.js foi dado como perdido sem motivo');
  });

  it('dado o socket caindo no menu, então o jogador é avisado e o solo é liberado', async () => {
    // pré-condição: sala de pé (senão o cenário mede a queda de outra pessoa)
    await h.page.waitForFunction(salaNoArNoMenu, { timeout: 30000, polling: 200 });
    await h.play(() => window.__MP.socket.disconnect());
    const liberou = await h.page.waitForFunction(botaoLiberado, { timeout: 15000, polling: 100 })
      .then(() => true).catch(() => false);
    const caiu = await h.play(leiaMenu);
    assert.ok(liberou, `socket caiu e #btnNew seguiu travado: ${JSON.stringify(caiu)}`);
    assert.ok(caiu.aviso.length > 8, `queda sem aviso no menu: "${caiu.aviso}"`);
    assert.ok(caiu.clicavel, 'aviso na tela mas o botão continua morto');

    // e o lobby também precisa contar a verdade, não fingir que espera o anfitrião
    const btnLobby = await h.play(() => {
      const b = document.getElementById('brStartBtn');
      return b ? (b.textContent || '').trim() : null;
    });
    assert.ok(btnLobby && /CONEX|RECONECT/i.test(btnLobby),
      `lobby não avisou a queda: "${btnLobby}"`);
  });

  it('dado o socket voltando, então o menu retoma a sala online sozinho', async () => {
    await h.play(() => window.__MP.socket.connect());
    const voltou = await h.page.waitForFunction(
      () => {
        const b = document.getElementById('btnNew');
        return !!b && b.classList.contains('disabled');
      }, { timeout: 20000, polling: 100 }).then(() => true).catch(() => false);
    const m = await h.play(leiaMenu);
    assert.ok(voltou, `menu ficou preso no modo solo depois de reconectar: ${JSON.stringify(m)}`);
    assert.match(m.texto, /SALA ONLINE/i, `etiqueta não voltou pra sala: "${m.texto}"`);
  });

  /* ÚLTIMO da suíte de propósito: inicia o jogo solo e não dá pra voltar. */
  it('dado o socket caído além da carência, então o lobby sai da frente e o solo fica alcançável', async () => {
    await h.page.waitForFunction(salaNoArNoMenu, { timeout: 30000, polling: 200 });
    const cobrindo = await h.play(() => {
      const l = document.getElementById('brLobby');
      return !!l && l.style.display !== 'none';
    });
    assert.ok(cobrindo, 'pré-condição inválida: o lobby já não estava na frente');
    await h.play(() => window.__MP.socket.disconnect());
    const saiu = await h.page.waitForFunction(
      () => {
        const l = document.getElementById('brLobby');
        return !!l && l.style.display === 'none';
      }, { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
    assert.ok(saiu, 'lobby morto continuou cobrindo a tela — jogador sem saída');
    const r = await h.play(() => {
      const antes = window.__game.state.started;
      document.getElementById('btnNew').click();
      return { antes, depois: window.__game.state.started };
    });
    assert.equal(r.antes, false, 'cenário inválido: já estava em jogo');
    assert.ok(r.depois, 'com o lobby fora da frente o clique ainda não inicia o solo');
  });
});
