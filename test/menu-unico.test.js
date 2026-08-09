'use strict';
/* ================================================================
   QA — UM MENU SÓ (etapa 2) E PAUSA HONESTA (etapa 3).

   Contrato: docs/2026-08-09-menu-unico.md.

   ETAPA 2 — o jogo tinha DUAS superfícies de menu em tela cheia
   disputando o mesmo espaço: o #overlay (menu do jogo, z 100) e o
   lobby do BR (.brPanel, `position: fixed`, z 300). O lobby cobria o
   menu inteiro, e por isso:
     · o menu base ficava inalcançável POR BAIXO do lobby (a etapa 1
       precisou de uma escada provisória — esconder o lobby 8 s depois
       da queda do socket — só pra devolver o menu ao jogador);
     · as CONFIGURAÇÕES do jogo eram alcançadas MOVENDO o nó #settings
       pra dentro do card do lobby e devolvendo depois. Qualquer
       `lobby.innerHTML =` com o painel emprestado DESTRUÍA as
       configurações do jogo inteiro, sem um erro no console — a única
       proteção era lembrar de chamar rescueSettings() antes.

   Agora o lobby mora DENTRO do #panel (#mpPanel), irmão do #settings.
   Ninguém reparenta ninguém: o acidente deixou de depender de
   disciplina e passou a ser impossível por estrutura.

   ETAPA 3 — `state.paused` tinha um escritor de fachada (setPaused) e
   escritores crus por toda parte (inclusive os testes). Escrita crua
   troca o valor sem tocar no #overlay nem no Touch.setPlaying, e no
   celular NÃO existe ESC: o botão de pausa some junto com
   `html.playing`, então a dessincronia deixa o jogador sem saída.
   E o `brTick()` nunca checou pausa: no BR o gás, o corpo-a-corpo e o
   GOLEM continuam rodando com o menu aberto. Parar o laço local seria
   pior (a partida é autoritativa no servidor: daria imunidade e
   dessincronizaria), então a pausa em BR passa a CONTAR A VERDADE.
   ================================================================ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('./helpers/harness');

const raiz = path.join(__dirname, '..');
const leia = f => fs.readFileSync(path.join(raiz, f), 'utf8');

describe('estrutura do menu único (fontes)', () => {
  const html = leia('index.html');
  const mpc = leia('multiplayer-client.js');

  it('dado o index.html, então o menu tem SOLO, MULTIJOGADOR, CONFIGURAÇÕES e CONTROLES nessa ordem', () => {
    const ordem = ['btnNew', 'btnMulti', 'btnSettings', 'btnCtl']
      .map(id => ({ id, at: html.indexOf(`id="${id}"`) }));
    for (const o of ordem) assert.ok(o.at > 0, `#${o.id} não existe no index.html`);
    for (let i = 1; i < ordem.length; i++)
      assert.ok(ordem[i].at > ordem[i - 1].at,
        `#${ordem[i].id} vem antes de #${ordem[i - 1].id} no DOM`);
  });

  it('dado o index.html, então o lobby do BR nasce DENTRO do #panel e o #settings é irmão dele', () => {
    const panel = html.slice(html.indexOf('id="panel"'), html.indexOf('id="launchFx"'));
    const mp = panel.indexOf('id="mpPanel"');
    const lobby = panel.indexOf('id="brLobby"');
    const settings = panel.indexOf('id="settings"');
    assert.ok(mp > 0, '#mpPanel não existe dentro do #panel');
    assert.ok(lobby > mp, '#brLobby não nasce dentro do #mpPanel');
    assert.ok(settings > 0, '#settings saiu do #panel');
    // o #settings NÃO pode morar dentro do painel que é reescrito por innerHTML
    const fimMp = panel.indexOf('id="settings"');
    assert.ok(settings > lobby && fimMp > lobby,
      '#settings está dentro do bloco do lobby — um innerHTML o destrói');
  });

  it('dado multiplayer-client.js, então NADA move o #settings (o acidente sumiu por estrutura)', () => {
    assert.ok(!/brCfgHolder/.test(mpc), 'o holder do reparent ainda existe');
    assert.ok(!/rescueSettings/.test(mpc), 'ainda existe resgate — logo ainda existe reparent');
    assert.ok(!/appendChild\(\s*stEl\s*\)/.test(mpc), 'ainda move o nó #settings');
  });

  it('dado multiplayer-client.js, então só UM lugar escreve o innerHTML do lobby', () => {
    const escritas = (mpc.match(/lobby\.innerHTML\s*=/g) || []).length;
    assert.equal(escritas, 1,
      `há ${escritas} escritas cruas de lobby.innerHTML — o contrato é um escritor só`);
  });

  it('dado multiplayer-client.js, então #btnBack tem UM dono só (o game.js)', () => {
    assert.ok(!/btnBack/.test(mpc),
      '#btnBack ainda ganha um segundo listener permanente no multiplayer-client');
    const game = leia('game.js');
    const listeners = (game.match(/btnBack'\)\.addEventListener/g) || []).length;
    assert.equal(listeners, 1, `#btnBack tem ${listeners} listeners no game.js`);
  });

  it('dado multiplayer-client.js, então a escada provisória da etapa 1 foi removida', () => {
    assert.ok(!/CARENCIA_QUEDA_MS|lobbyEscondidoPelaQueda/.test(mpc),
      'o lobby ainda se esconde sozinho pra devolver o menu — com o menu único isso não é mais preciso');
  });

  it('dado multiplayer-client.js, então o lobby respeita a escolha de jogo SOLO', () => {
    const bloco = mpc.slice(mpc.indexOf('const LOBBY = {'), mpc.indexOf('socket.on(\'flags\''));
    for (const metodo of ['show(extra) {', 'overlay(html) {']) {
      const at = bloco.indexOf(metodo);
      assert.ok(at > 0, `LOBBY.${metodo} sumiu`);
      const corpo = bloco.slice(at, at + 400);
      assert.ok(/soloEscolhido\(\)|__MP_soloOnly/.test(corpo),
        `LOBBY.${metodo} pode subir por cima de um jogo solo quando o servidor volta`);
    }
  });
});

describe('menu único no navegador (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3302;
  before(async () => {
    h = await bootGame({ port: PORT, autoStart: false, extraEnv: { COUNTDOWN_S: '90' } });
    await h.page.waitForFunction('!!document.getElementById("brStartBtn")', { timeout: 60000 });
  });
  after(async () => { if (h) await h.close(); });

  it('dado o lobby do BR na tela, então ele mora DENTRO do #panel e não cobre mais nada', async () => {
    const r = await h.play(() => {
      const lobby = document.getElementById('brLobby');
      const cs = getComputedStyle(lobby);
      /* Camadas que COMEM a tela: fixas, visíveis e que recebem ponteiro.
         (#launchFx e afins são fixos mas `pointer-events: none` — clarão, não
         superfície de menu.) */
      const fixos = [...document.querySelectorAll('body *')]
        .filter(el => el.id !== 'overlay' && el.id !== 'rotateGate')
        .filter(el => {
          const s = getComputedStyle(el);
          return s.position === 'fixed' && s.display !== 'none'
            && s.pointerEvents !== 'none' && +s.zIndex >= 100;
        })
        .map(el => el.id || el.className);
      return {
        dentroDoPanel: !!lobby.closest('#panel'),
        posicao: cs.position,
        outrosFixos: fixos,
        menuVisivel: getComputedStyle(document.getElementById('menuBtns')).display !== 'none',
      };
    });
    assert.ok(r.dentroDoPanel, 'o lobby continua fora do #panel');
    assert.notEqual(r.posicao, 'fixed', 'o lobby ainda é uma camada de tela cheia');
    assert.deepEqual(r.outrosFixos, [],
      `sobrou outra superfície de menu em tela cheia: ${JSON.stringify(r.outrosFixos)}`);
    assert.ok(r.menuVisivel, 'com o lobby aberto o menu base sumiu da tela');
  });

  it('dado o lobby reescrito várias vezes, então as CONFIGURAÇÕES sobrevivem intactas', async () => {
    const r = await h.play(() => {
      const linhas = () => {
        const st = document.getElementById('settings');
        return st ? st.querySelectorAll('.srow').length : -1;
      };
      const antes = linhas();
      // exatamente o caminho que destruía o painel: innerHTML no lobby
      window.__MP_lobby.overlay('<div class="brTitle">teste</div>');
      window.__MP_lobby.show();
      window.__MP_lobby.overlay('<div class="brTitle">de novo</div>');
      window.__MP_lobby.show();
      const st = document.getElementById('settings');
      return {
        antes, depois: linhas(),
        pai: st && st.parentElement ? st.parentElement.id : null,
        dentroDoLobby: !!(st && st.closest('#brLobby')),
        temVoltar: !!document.getElementById('btnBack'),
      };
    });
    assert.ok(r.antes > 4, `cenário inválido: #settings tinha ${r.antes} linhas`);
    assert.equal(r.depois, r.antes, 'o painel de configurações perdeu linhas depois do lobby');
    assert.equal(r.pai, 'panel', `#settings mudou de pai: ${r.pai}`);
    assert.equal(r.dentroDoLobby, false, '#settings voltou pra dentro do lobby');
    assert.ok(r.temVoltar, 'o VOLTAR das configurações sumiu');
  });

  it('dado o botão de gráficos do lobby, então CONFIGURAÇÕES abre no mesmo lugar e o VOLTAR devolve o lobby', async () => {
    const r = await h.play(() => {
      const mp = document.getElementById('mpPanel'), st = document.getElementById('settings');
      document.getElementById('brCfgBtn').click();
      const comCfg = { cfgAberto: st.classList.contains('open'), mpEscondido: mp.hidden };
      document.getElementById('btnBack').click();
      const depois = { cfgAberto: st.classList.contains('open'), mpEscondido: mp.hidden };
      return { comCfg, depois };
    });
    assert.ok(r.comCfg.cfgAberto, 'o botão do lobby não abriu as configurações');
    assert.ok(r.comCfg.mpEscondido, 'lobby e configurações abertos ao mesmo tempo (dois donos de tela)');
    assert.equal(r.depois.cfgAberto, false, 'VOLTAR não fechou as configurações');
    assert.equal(r.depois.mpEscondido, false, 'VOLTAR das configurações não devolveu o lobby');
  });

  it('dado o botão MULTIJOGADOR, então ele abre e fecha o painel do lobby', async () => {
    /* Esperar (em vez de ler uma vez) é obrigatório: o boot pesado derruba o
       transporte do engine.io com facilidade, e nessa janela o menu —
       corretamente — está oferecendo solo em vez de multijogador. */
    const liberou = await h.page.waitForFunction(
      () => {
        const b = document.getElementById('btnMulti');
        return !!b && !b.classList.contains('disabled');
      }, { timeout: 30000, polling: 200 }).then(() => true).catch(() => false);
    const r = await h.play(() => {
      const mp = document.getElementById('mpPanel');
      document.getElementById('btnMpBack').click();
      const fechado = mp.hidden;
      const btn = document.getElementById('btnMulti');
      const travado = btn.classList.contains('disabled');
      btn.click();
      return { fechado, travado, aberto: !mp.hidden, rotulo: (btn.textContent || '').trim(),
        temLobby: !!document.getElementById('brStartBtn'),
        conectado: !!(window.__MP.socket && window.__MP.socket.connected),
        brFalhou: window.__BR_loadFailed || null };
    });
    assert.ok(liberou, `MULTIJOGADOR nunca destravou com a sala no ar: ${JSON.stringify(r)}`);
    assert.ok(r.fechado, 'o VOLTAR do multijogador não fechou o painel');
    assert.equal(r.travado, false, `com a sala no ar o botão MULTIJOGADOR nasceu travado: ${JSON.stringify(r)}`);
    assert.ok(r.aberto, 'MULTIJOGADOR não reabriu o painel');
    assert.ok(r.temLobby, 'o painel abriu vazio (o lobby não foi redesenhado)');
  });

  it('dado o lobby aberto, então o teclado ainda navega o menu', async () => {
    const r = await h.play(() => {
      document.body.focus();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      const antes = document.activeElement ? document.activeElement.id : null;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const depois = document.activeElement ? document.activeElement.id : null;
      return { antes, depois, ehBotao: !!(document.activeElement
        && document.activeElement.classList.contains('mbtn')) };
    });
    assert.ok(r.ehBotao,
      `a seta não moveu o foco pra um botão do menu (antes=${r.antes} depois=${r.depois})`);
  });

  it('dado o socket caído com o lobby aberto, então o SOLO continua alcançável — sem esconder nada', async () => {
    await h.play(() => window.__MP.socket.disconnect());
    const liberou = await h.page.waitForFunction(
      () => {
        const b = document.getElementById('btnNew');
        return !!b && !b.classList.contains('disabled');
      }, { timeout: 15000, polling: 100 }).then(() => true).catch(() => false);
    const r = await h.play(() => {
      const b = document.getElementById('btnNew');
      const rect = b.getBoundingClientRect();
      const emCima = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        texto: (b.textContent || '').trim(),
        lobbyVisivel: !document.getElementById('mpPanel').hidden,
        alvo: emCima ? (emCima.id || emCima.className) : null,
        clicavel: !!(emCima && emCima.closest('#btnNew')),
      };
    });
    assert.ok(liberou, `#btnNew seguiu travado depois da queda: ${JSON.stringify(r)}`);
    assert.ok(r.lobbyVisivel,
      'o lobby precisou SUMIR pro menu voltar — a escada provisória continua aí');
    assert.ok(r.clicavel, `o SOLO está coberto por ${r.alvo}`);
  });

  it('dado o clique em SOLO nesse estado, então a partida começa e o BR não rouba mais a tela', async () => {
    const r = await h.play(() => {
      document.getElementById('btnNew').click();
      const S = window.__game.state;
      // servidor voltando: o BR não pode subir por cima do jogo solo
      window.__MP_lobby.show();
      window.__MP_lobby.overlay('<div>fim</div>');
      return {
        started: S.started, pausado: S.paused, soloOnly: !!window.__MP_soloOnly,
        overlay: getComputedStyle(document.getElementById('overlay')).display,
      };
    });
    assert.ok(r.started, 'clique em SOLO não iniciou a partida');
    assert.equal(r.pausado, false, 'a partida solo começou pausada');
    assert.ok(r.soloOnly, 'a escolha de solo não foi registrada');
    assert.equal(r.overlay, 'none', 'o lobby do BR trouxe o menu de volta por cima do jogo solo');
  });
});

describe('pausa honesta (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3303;
  before(async () => { h = await bootGame({ port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('dado o menu aberto em BR, então o painel avisa que A PARTIDA CONTINUA', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      window.__BR_active = true;
      MP.setPaused(true);
      const ov = document.getElementById('overlay');
      const out = {
        pausado: MP.state.paused,
        overlay: getComputedStyle(ov).display,
        classe: ov.classList.contains('brlive'),
        etiqueta: (document.getElementById('pausedTagText').textContent || '').trim(),
        aviso: (document.getElementById('pausedWarn').textContent || '').trim(),
        avisoEscondido: document.getElementById('pausedWarn').hidden,
      };
      MP.setPaused(false);
      return out;
    });
    assert.equal(r.pausado, true, 'setPaused(true) não pausou');
    assert.notEqual(r.overlay, 'none', 'menu de pausa não apareceu');
    assert.ok(r.classe, 'falta a marca #overlay.brlive (o visual precisa dela pra não cobrir a tela)');
    assert.match(r.etiqueta, /A PARTIDA CONTINUA/i,
      `a etiqueta de pausa mente no BR: "${r.etiqueta}"`);
    assert.equal(r.avisoEscondido, false, 'o aviso da partida em curso está escondido');
    assert.ok(r.aviso.length > 20, `aviso curto demais pra explicar: "${r.aviso}"`);
  });

  it('dado o jogo PAUSADO em BR, então o dano do servidor continua chegando (pausa não dá imunidade)', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      window.__BR_active = true;
      MP.player.dead = false;
      MP.player.health = MP.player.maxHealth;
      MP.player.armor = 0;
      MP.player.invulnUntil = 0;
      MP.setPaused(true);
      MP.playerDamage(23, null, { type: 'zone' });
      const depoisBR = MP.player.health;
      // ...e no SOLO a pausa continua sendo pausa de verdade
      window.__BR_active = false;
      MP.setPaused(true); // repinta o painel com o estado novo
      MP.player.health = MP.player.maxHealth;
      MP.playerDamage(23, null, { type: 'zone' });
      const depoisSolo = MP.player.health;
      const etiquetaSolo = (document.getElementById('pausedTagText').textContent || '').trim();
      const classeSolo = document.getElementById('overlay').classList.contains('brlive');
      window.__BR_active = true;
      MP.setPaused(false);
      MP.player.health = MP.player.maxHealth;
      return { depoisBR, depoisSolo, max: MP.player.maxHealth, etiquetaSolo, classeSolo };
    });
    assert.ok(r.depoisBR < r.max,
      'pausar no BR virou imunidade — exploit reaberto (game.js: "pausar NÃO pode dar imunidade")');
    assert.equal(r.depoisSolo, r.max, 'a pausa do solo deixou de proteger o jogador');
    assert.match(r.etiquetaSolo, /PAUSADO/i, `etiqueta errada no solo: "${r.etiquetaSolo}"`);
    assert.equal(r.classeSolo, false, 'o solo herdou a marca de partida ao vivo');
  });

  /* ÚLTIMO da suíte: mexe na tela de morte e deixa o jogo pausado até o fim. */
  it('dado o painel de fim de partida, então ele aparece por cima do jogo e a tela de morte sai da frente', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      MP.setPaused(false);
      const ds = document.getElementById('deathScreen');
      ds.classList.add('show'); // estado real: o jogo mostra isto 600 ms após a morte
      window.__MP_lobby.overlay('<div class="brTitle">☠ VOCÊ FOI ELIMINADO</div>');
      const ov = document.getElementById('overlay');
      const out = {
        pausado: MP.state.paused,
        overlay: getComputedStyle(ov).display,
        painel: window.__game.MENU.painel,
        morteNaFrente: ds.classList.contains('show'),
        texto: (document.getElementById('brLobby').textContent || '').trim(),
      };
      // e o fim do painel devolve a tela ao jogo (é o que o espectador faz)
      window.__MP_lobby.hide();
      out.depoisDeFechar = { pausado: MP.state.paused, painel: window.__game.MENU.painel };
      return out;
    });
    assert.equal(r.pausado, true, 'o painel de fim de partida não trouxe o menu pra frente');
    assert.notEqual(r.overlay, 'none', 'painel aberto e o menu invisível');
    assert.equal(r.painel, 'mp', `painel aberto errado: ${r.painel}`);
    assert.equal(r.morteNaFrente, false,
      'o "VOCÊ MORREU" (z 200) ficou cobrindo o painel do menu (z 100)');
    assert.match(r.texto, /ELIMINADO/, `o painel não tem o conteúdo do recap: "${r.texto}"`);
    assert.equal(r.depoisDeFechar.pausado, false, 'fechar o painel não devolveu a tela ao jogo');
    assert.equal(r.depoisDeFechar.painel, null, 'o painel continuou aberto depois do hide()');
  });

  it('dada uma escrita CRUA em state.paused, então ela é impossível de dessincronizar', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      const ov = document.getElementById('overlay');
      const html = document.documentElement;
      MP.setPaused(false);
      MP.state.paused = true;               // caminho proibido (era o dos testes)
      const cru = {
        valor: MP.state.paused,
        overlay: getComputedStyle(ov).display,
        playing: html.classList.contains('playing'),
      };
      MP.state.paused = false;
      const volta = {
        valor: MP.state.paused,
        overlay: getComputedStyle(ov).display,
      };
      return { cru, volta };
    });
    assert.equal(r.cru.valor, true, 'a escrita crua nem chegou a pausar');
    assert.notEqual(r.cru.overlay, 'none',
      'escreveu paused=true e o menu não subiu: estado e tela dessincronizados');
    assert.equal(r.cru.playing, false,
      'pausou e os controles de toque continuaram na tela (no celular não há ESC: jogador sem saída)');
    assert.equal(r.volta.valor, false, 'a escrita crua não despausou');
    assert.equal(r.volta.overlay, 'none', 'despausou e o menu ficou na frente');
  });
});
