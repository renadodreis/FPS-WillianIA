'use strict';
/* ================================================================
   QA — SOLO COM A SALA ONLINE NO AR.

   O menu único nasceu com SOLO travado enquanto `salaNoAr()` fosse
   verdadeiro. Em produção o servidor está SEMPRE no ar: o botão nunca
   era clicável e o menu tinha um botão morto. A decisão do dono é
   liberar SOLO sempre — e entrar nele SAI DA SALA de verdade, para o
   jogador solo não virar fantasma no roster dos outros.

   O caminho escolhido é FECHAR O SOCKET, não "marcar como oculto" no
   servidor. O `disconnect` já é o único caminho testado de "este
   jogador foi embora": tira do `players`, libera o anfitrião, devolve
   os carros, recalcula a vitória e reemite o roster. A alternativa
   (evento novo que apaga alguém do roster MANTENDO a conexão) seria
   literalmente o fantasma — invisível e ainda recebendo `playerUpdate`
   de todo mundo.

   Este arquivo é, antes de tudo, o teste dos VETORES DE EXPLOIT que a
   mudança encosta. Nesta ordem:
     1. o solo pode ser usado pra sumir do roster no meio da partida?
     2. dá pra largar e retomar o posto de anfitrião?
     3. dá pra zerar o cooldown de `claimHost` reconectando?
   Se algum destes ficar vermelho, NÃO relaxe a asserção.
   ================================================================ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { CHROME, bootGame } = require('./helpers/harness');

const SERVER = path.join(__dirname, '..', 'server.js');
let nextPort = 37000 + (process.pid % 400) * 10;

function spawnServer(env = {}) {
  const port = nextPort++;
  const rankFile = path.join(os.tmpdir(),
    `fps-solo-rank-${process.pid}-${port}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env, PORT: String(port), HOST_CODE: 'QA123',
      COUNTDOWN_S: '1', NEXT_IN_S: '60', GAS_DEFAULT: 'classica',
      RANK_FILE: rankFile, ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('servidor não subiu')), 8000);
    proc.stdout.on('data', d => {
      if (String(d).includes('Servidor BR no ar')) {
        clearTimeout(to);
        res({
          port, proc,
          stop: () => new Promise(resolve => {
            const done = () => { fs.rmSync(rankFile, { force: true }); resolve(); };
            if (proc.exitCode !== null) return done();
            proc.once('exit', done);
            proc.kill();
          }),
        });
      }
    });
    proc.on('exit', c => rej(new Error('servidor morreu cedo, código ' + c)));
  });
}

const connect = port => {
  const s = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('sem init')), 5000);
    s.once('init', init => { clearTimeout(to); res({ s, init }); });
  });
};
const ack = (sock, ev, data) => new Promise((res, rej) =>
  sock.timeout(3000).emit(ev, data, (err, d) => (err ? rej(err) : res(d))));
const once = (sock, ev) => new Promise(res => sock.once(ev, res));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* espera um `roster` que satisfaça `pred` (o servidor reemite a cada
   entrada/saída/hello). Devolve o último visto pra mensagem de erro. */
function esperaRoster(sock, pred, ms = 6000) {
  return new Promise((res, rej) => {
    let ultimo = null;
    const onR = r => { ultimo = r; if (pred(r)) { limpa(); res(r); } };
    const timer = setTimeout(() => {
      limpa();
      rej(new Error('roster esperado não chegou; último=' + JSON.stringify(ultimo)));
    }, ms);
    const limpa = () => { clearTimeout(timer); sock.off('roster', onR); };
    sock.on('roster', onR);
  });
}

/* =================================================================
   VETORES DE EXPLOIT — servidor puro (socket.io-client, sem Chrome)
   ================================================================= */
describe('sair pro solo = sair da sala (servidor)', () => {
  it('dado o jogador saindo no LOBBY, então ele some do roster e larga o posto de anfitrião', async t => {
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    t.after(() => b.s.close());
    a.s.emit('hello', { nick: 'SaiPraSolo' });
    b.s.emit('hello', { nick: 'FicaNaSala' });
    await ack(a.s, 'claimHost', { code: 'QA123' });
    await esperaRoster(b.s, r => r.hostId === a.init.id && r.players.length === 2);

    a.s.close(); // é o que o botão SOLO faz
    const depois = await esperaRoster(b.s, r => r.players.length === 1);
    assert.equal(depois.players.length, 1, 'o jogador solo continuou no roster dos outros');
    assert.equal(depois.players[0].id, b.init.id, 'sobrou o jogador errado no roster');
    assert.equal(depois.hostId, null,
      'o jogador solo continuou segurando o posto de anfitrião de uma sala em que não está');

    // e sem anfitrião ninguém inicia partida — o posto ficou VAGO, não herdado
    const comecou = [];
    b.s.on('countdown', d => comecou.push(d));
    b.s.on('matchStart', d => comecou.push(d));
    b.s.emit('requestStart');
    await sleep(600);
    assert.deepEqual(comecou, [],
      'o posto de anfitrião foi herdado por quem nunca deu o código');
  });

  it('dado o jogador saindo NO MEIO da partida, então ele PERDE — não vira invisível', async t => {
    const srv = await spawnServer();
    t.after(() => srv.stop());
    const a = await connect(srv.port);
    const b = await connect(srv.port);
    t.after(() => b.s.close());
    a.s.emit('hello', { nick: 'Fujao' });
    b.s.emit('hello', { nick: 'Ficou' });
    await ack(a.s, 'claimHost', { code: 'QA123' });
    const comecou = Promise.all([once(a.s, 'matchStart'), once(b.s, 'matchStart')]);
    a.s.emit('requestStart');
    await comecou;

    const fim = once(b.s, 'matchEnd');
    a.s.close(); // "sumir do roster no meio da luta"
    const roster = await esperaRoster(b.s, r => r.players.length === 1);
    assert.equal(roster.players.length, 1, 'quem saiu continuou no roster durante a partida');
    const e = await Promise.race([fim, sleep(4000).then(() => null)]);
    assert.ok(e, 'sair no meio da partida não encerrou nada: o fujão seguiu contando como vivo');
    assert.equal(e.winner && e.winner.id, b.init.id,
      'quem ficou não venceu — sair da partida virou empate/escapatória');
    // ...e voltar não devolve a partida: quem chega com o jogo rodando é espectador
    const volta = await connect(srv.port);
    t.after(() => volta.s.close());
    assert.notEqual(volta.init.phase, 'LOBBY',
      'cenário inválido: a sala já tinha voltado pro lobby');
  });

  it('dado 5 códigos errados, então desconectar e voltar NÃO zera o cooldown do IP', async t => {
    /* IP_LIMIT_ALL=1 tira a isenção de loopback: é o ÚNICO jeito de exercitar,
       em teste, o caminho de produção em que a conexão é CONTADA por IP — e é
       justamente ali que o `disconnect` apagava o histórico de tentativas.
       Com o botão SOLO fechando o socket, esse apagamento viraria um zerador
       de cooldown a um clique de distância. */
    const srv = await spawnServer({ IP_LIMIT_ALL: '1', CLAIM_COOLDOWN_MS: '4000' });
    t.after(() => srv.stop());
    const c1 = await connect(srv.port);
    for (let i = 0; i < 5; i++) await ack(c1.s, 'claimHost', { code: 'ERRADO' + i });
    const travado = await ack(c1.s, 'claimHost', { code: 'QA123' });
    assert.equal(travado.ok, false, 'cenário inválido: o cooldown nem chegou a fechar');

    c1.s.close(); // ÚNICA conexão daquele IP saindo — era aqui que o histórico sumia
    await sleep(400);
    const c2 = await connect(srv.port);
    t.after(() => c2.s.close());
    const r = await ack(c2.s, 'claimHost', { code: 'QA123' });
    assert.equal(r.ok, false,
      'sair pro solo e voltar zerou o cooldown de anfitrião — força bruta de graça');

    // e o cooldown continua sendo COOLDOWN: passada a janela, abre sozinho
    await sleep(4200);
    const depois = await ack(c2.s, 'claimHost', { code: 'QA123' });
    assert.equal(depois.ok, true, 'o cooldown virou banimento permanente do IP');
  });
});

/* =================================================================
   O MENU, COM A SALA NO AR (Chrome headless)
   ================================================================= */
describe('menu: SOLO com a sala no ar (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, espiao;
  let mundoNoSolo = null; // assinatura + seed medidos com o solo rodando
  const PORT = 3307;
  before(async () => {
    // ?host=QUEDALIVRE: a página vira anfitriã sozinha (mesmo caminho do lobby
    // real) — é o que deixa testável "largar e retomar o posto".
    h = await bootGame({ port: PORT, autoStart: false, query: '?host=QUEDALIVRE',
      extraEnv: { COUNTDOWN_S: '90' } });
    await h.page.waitForFunction('!!document.getElementById("brStartBtn")', { timeout: 60000 });
    /* ESPERA O MUNDO ASSENTAR ANTES DE MEDIR. Mercado, refúgio na árvore e
       barris entram num bloco ASSÍNCRONO (game.js), depois do download dos
       GLBs, com RNG PRÓPRIO — de propósito, pra não consumir o stream seedado
       em pontos diferentes por cliente. Medir a assinatura do mundo antes
       disso e de novo depois acusaria "regeneração" onde só houve o boot
       terminando. Duas amostras iguais com 1,5 s de intervalo = assentado. */
    await h.page.waitForFunction(() => {
      const n = window.__game.Structures.sites.length;
      const estavel = window.__qaSites === n;
      window.__qaSites = n;
      return estavel && n > 5;
    }, { timeout: 60000, polling: 1500 });
    espiao = io(`http://localhost:${PORT}`, { transports: ['websocket'], reconnection: false });
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('espião sem init')), 8000);
      espiao.once('init', () => { clearTimeout(to); res(); });
    });
    espiao.emit('hello', { nick: 'Espiao' });
  });
  after(async () => {
    if (espiao) espiao.close();
    if (h) await h.close();
  });

  it('dado a sala online DE PÉ, então SOLO está clicável e diz que é solo', async () => {
    const liberou = await h.page.waitForFunction(() => {
      const b = document.getElementById('btnNew');
      const s = window.__MP && window.__MP.socket;
      return !!(s && s.connected) && !!b && !b.classList.contains('disabled');
    }, { timeout: 30000, polling: 200 }).then(() => true).catch(() => false);
    const m = await h.play(() => {
      const b = document.getElementById('btnNew');
      const r = b.getBoundingClientRect();
      const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        texto: (b.textContent || '').trim(),
        travado: b.classList.contains('disabled'),
        ponteiro: getComputedStyle(b).pointerEvents,
        porCima: alvo ? (alvo.id || alvo.className) : null,
        conectado: !!(window.__MP.socket && window.__MP.socket.connected),
        multi: (document.getElementById('btnMulti').textContent || '').trim(),
      };
    });
    assert.ok(liberou, `sala no ar e SOLO segue travado — botão morto: ${JSON.stringify(m)}`);
    assert.equal(m.travado, false, `SOLO travado com a sala no ar: ${JSON.stringify(m)}`);
    assert.notEqual(m.ponteiro, 'none', 'SOLO liberado mas sem receber ponteiro');
    assert.match(m.texto, /solo/i, `a etiqueta não promete solo: "${m.texto}"`);
    assert.ok(!/SALA ONLINE/i.test(m.texto),
      `a etiqueta ainda manda o jogador pro multijogador: "${m.texto}"`);
  });

  it('dado uma partida em andamento, então SOLO NÃO é saída (não desconecta ninguém)', async () => {
    /* O vetor: sumir do roster no meio da luta. A tranca é dupla — o botão
       nasce travado com a partida em curso E o handler recusa. Aqui vale a
       segunda, que é a que sobrevive a QA/console/caminho novo. */
    const r = await h.play(() => {
      const G = window.__game;
      G.forceStart(); // partida em andamento (é o que o BR faz no beginMatch)
      document.getElementById('btnNew').click();
      const out = {
        started: G.state.started,
        soloOnly: !!window.__MP_soloOnly,
        conectado: !!(window.__MP.socket && window.__MP.socket.connected),
        travado: document.getElementById('btnNew').classList.contains('disabled'),
      };
      G.voltarAoMenu(); // devolve o cenário pro menu
      return out;
    });
    assert.ok(r.started, 'cenário inválido: a partida não estava em andamento');
    assert.ok(r.travado, 'com a partida em curso o SOLO continua clicável');
    assert.equal(r.soloOnly, false, 'a partida em curso virou modo solo por um clique');
    assert.ok(r.conectado,
      'clicar em SOLO no meio da partida desconectou o jogador — é a escapatória do roster');
  });

  it('dado o clique em SOLO, então o jogo solo roda e os OUTROS deixam de ver o jogador', async () => {
    const antes = await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('roster inicial não chegou')), 8000);
      espiao.emit('hello', { nick: 'Espiao' });
      espiao.on('roster', function onR(r) {
        if (r.players.length >= 2) { clearTimeout(to); espiao.off('roster', onR); res(r); }
      });
    });
    assert.equal(antes.players.length, 2, 'cenário inválido: a página não estava na sala');

    const sumiu = esperaRoster(espiao, r => r.players.length === 1, 12000);
    const r = await h.play(() => {
      document.getElementById('btnNew').click();
      const G = window.__game;
      // servidor voltando/lobby insistindo: o BR não pode tomar a tela do solo
      if (window.__MP_lobby) { window.__MP_lobby.show(); window.__MP_lobby.overlay('<div>fim</div>'); }
      return {
        started: G.state.started, pausado: G.state.paused,
        soloOnly: !!window.__MP_soloOnly,
        conectado: !!(window.__MP.socket && window.__MP.socket.connected),
        mpAtivo: !!window.__MP_active,
        overlay: getComputedStyle(document.getElementById('overlay')).display,
        aviso: (document.getElementById('menuNotice').textContent || '').trim(),
      };
    });
    assert.ok(r.started, 'clique em SOLO com a sala no ar não iniciou a partida');
    assert.equal(r.pausado, false, 'a partida solo começou pausada');
    assert.ok(r.soloOnly, 'a escolha de solo não foi registrada');
    assert.equal(r.conectado, false,
      'o jogador solo continuou conectado — é o fantasma que o servidor ainda lista');
    assert.equal(r.mpAtivo, false,
      '__MP_active ficou ligado no solo: a tela de morte não teria saída e JOGAR DE NOVO recusaria');
    assert.equal(r.overlay, 'none', 'o lobby do BR trouxe o menu de volta por cima do jogo solo');
    assert.ok(r.aviso.length > 8, `o menu não explica que o jogador saiu da sala: "${r.aviso}"`);

    const depois = await sumiu;
    assert.equal(depois.players.length, 1, 'o jogador solo continuou no roster dos outros');
    assert.equal(depois.aliveCount, 0, 'o jogador solo continuou contando como vivo');
    assert.equal(depois.hostId, null,
      'o jogador solo levou o posto de anfitrião embora e a sala ficou sem dono');
  });

  it('dado o solo em andamento, então o MUNDO é o MESMO que a sala montou', async () => {
    /* A ordem de consumo do Math.random seedado é contrato (CLAUDE.md): entrar
       em solo não pode reexecutar worldgen nem deslocar o stream. Assinatura
       nos moldes de test/morte-sem-reload, SEM o varrido de obstáculos: aquele
       registro é rebalanceado por posição do jogador (rebucketTrees), então
       mudaria entre "no menu" e "em jogo" sem o mundo ter mudado — mediria o
       balde, não o mundo. O que fica é saída DIRETA do worldgen. */
    const r = await h.play(() => {
      const G = window.__game;
      const S = G.Structures;
      return {
        assinatura: JSON.stringify({
          sites: S.sites.map(s => `${s.type}:${s.x.toFixed(3)},${s.z.toFixed(3)}`),
          baus: S.chestSpots.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
          carros: S.carSpots.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
          spawns: G.Enemies.list.map(e => `${e.home.x.toFixed(3)},${e.home.z.toFixed(3)}`),
        }),
        seed: window.__MP_init.worldSeed,
      };
    });
    // guardado pro teste da volta comparar (o mundo tem que ser o MESMO)
    mundoNoSolo = r;
    assert.ok(r.assinatura.length > 100, 'assinatura de mundo vazia: cenário inválido');
  });

  it('dado MULTIJOGADOR depois do solo, então volta pra sala SEM recarregar a página', async () => {
    /* 2 na sala E com anfitrião: a volta só está completa quando o posto é
       retomado pelo código salvo (é a outra metade do vetor "largar/retomar").
       O `.catch` guarda o erro em vez de rejeitar: sem ele, qualquer asserção
       que falhe ANTES do await vira um unhandledRejection que esconde a causa
       real no relatório. */
    const voltou = esperaRoster(espiao, r => r.players.length === 2 && !!r.hostId, 25000)
      .catch(e => e);
    await h.play(() => { window.__semReload = 'sentinela'; }); // some se a página recarregar
    const rot = await h.play(() => {
      const b = document.getElementById('btnMulti');
      return { rotulo: (b.textContent || '').trim(), travado: b.classList.contains('disabled') };
    });
    assert.equal(rot.travado, false,
      `depois do solo o MULTIJOGADOR ficou morto: "${rot.rotulo}"`);
    assert.ok(!/RECARREGUE/i.test(rot.rotulo),
      `o menu ainda manda recarregar a página: "${rot.rotulo}"`);

    await h.play(() => document.getElementById('btnMulti').click());
    const conectou = await h.page.waitForFunction(
      () => !!(window.__MP && window.__MP.socket && window.__MP.socket.connected)
        && !window.__MP_soloOnly,
      { timeout: 20000, polling: 150 }).then(() => true).catch(() => false);
    const r = await h.play(() => {
      const G = window.__game;
      const S = G.Structures;
      const assinatura = () => JSON.stringify({
        sites: S.sites.map(s => `${s.type}:${s.x.toFixed(3)},${s.z.toFixed(3)}`),
        baus: S.chestSpots.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
        carros: S.carSpots.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
        spawns: G.Enemies.list.map(e => `${e.home.x.toFixed(3)},${e.home.z.toFixed(3)}`),
      });
      return {
        sentinela: window.__semReload || null,
        started: G.state.started,
        soloOnly: !!window.__MP_soloOnly,
        conectado: !!(window.__MP.socket && window.__MP.socket.connected),
        painel: G.MENU.painel,
        mpEscondido: document.getElementById('mpPanel').hidden,
        temLobby: !!document.getElementById('brStartBtn'),
        seed: window.__MP_init.worldSeed,
        assinatura: assinatura(),
      };
    });
    assert.ok(conectou, `MULTIJOGADOR não reconectou depois do solo: ${JSON.stringify(r)}`);
    assert.equal(r.sentinela, 'sentinela',
      'a volta ao multijogador recarregou a página (o contexto foi embora)');
    assert.equal(r.started, false, 'voltou pra sala com a partida solo ainda rodando');
    assert.equal(r.soloOnly, false, 'a bandeira de solo não foi desfeita');
    assert.equal(r.painel, 'mp', `o painel do lobby não abriu: ${r.painel}`);
    assert.equal(r.mpEscondido, false, 'o painel do multijogador voltou escondido');
    assert.ok(r.temLobby, 'o painel abriu vazio (o lobby não foi redesenhado)');
    assert.equal(r.seed, mundoNoSolo.seed, 'a seed do mundo mudou na volta');
    assert.equal(r.assinatura, mundoNoSolo.assinatura,
      'o mundo foi regenerado no ciclo solo→multijogador — o rand seedado é contrato');

    /* CONTADOR DO STREAM SEEDADO na peça que mexe no mundo. A volta abandona a
       partida solo com `voltarAoMenu()` (restauração de instantâneo), e é ELA
       que não pode tocar no worldgen. Medida à parte do clique de propósito:
       um clique de menu qualquer já consome do stream pelo SOM DE INTERFACE
       (js/sfx.js: noise → rand) e o socket.io consome no `randomString` do
       transporte — nada disso é worldgen, e nenhum dos dois é desta rodada. */
    const consumo = await h.play(() => {
      const puro = Math.random;
      let n = 0;
      Math.random = () => { n++; return puro(); };
      try { window.__game.voltarAoMenu(); } finally { Math.random = puro; }
      return n;
    });
    assert.equal(consumo, 0,
      `a restauração do mundo consumiu ${consumo} números do Math.random seedado`);

    const rst = await voltou;
    assert.ok(!(rst instanceof Error), `a sala não voltou a ver o jogador: ${rst && rst.message}`);
    assert.equal(rst.players.length, 2, 'o jogador não reapareceu no roster da sala');
    assert.equal(rst.hostId, await h.play(() => window.__MP.socket.id),
      'o anfitrião não foi retomado com o código salvo depois da volta');
  });
});
