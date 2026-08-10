/* Harness compartilhado dos testes de jogabilidade/colisão:
   sobe servidor com seed fixa + Chrome headless, injeta window.QA
   (tick manual determinístico, reset, mira) e devolve play(). */
'use strict';
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

const CHROME = [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium',
  // Windows (máquina do Willian): mesmos testes, mesmo Chrome headless
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH || '',
].find(p => p && fs.existsSync(p));

/* Backend de GPU do Chrome de teste.

   `swiftshader` é rasterizador de SOFTWARE: foi o padrão histórico porque roda
   em qualquer CI, mas é lento (boot de página passando de 60 s sob carga é a
   origem de quase todo o flake conhecido deste repo) e não representa GPU
   nenhuma. Numa máquina com GPU de verdade, `gpu` usa ANGLE sobre o driver
   nativo.

   QA_GPU=gpu | swiftshader | auto   (padrão: auto)
   `auto` usa a GPU quando existe um render node (/dev/dri/renderD*) e cai pro
   software quando não existe — o Windows do Willian e um CI sem GPU continuam
   funcionando sem ninguém configurar nada.

   ATENÇÃO ao trocar: a string da GPU decide o tier de qualidade
   (js/gputier.js). Com swiftshader a regra /swiftshader/ dava `baixo`; com
   NVIDIA daria `alto`, mudando sombra, bloom, SMAA e resolução — e com isso
   draw calls e as asserções de render. Por isso o harness FIXA o tier na URL
   (ver `query` no bootGame): o backend passa a ser detalhe de velocidade, não
   de comportamento. */
function backendGpuAtivo() {
  const escolha = (process.env.QA_GPU || 'auto').toLowerCase();
  if (escolha === 'gpu') return true;
  if (escolha === 'swiftshader' || escolha === 'sw') return false;
  try {
    return fs.readdirSync('/dev/dri').some(n => n.startsWith('renderD'));
  } catch { return false; }
}

function backendArgs() {
  return backendGpuAtivo()
    ? ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
}

/* Acrescenta `tier=baixo` quando o teste não pediu tier nenhum. Mantém o
   preset que o swiftshader produzia, para a troca de backend não mexer no que
   os testes medem. Teste que quer outro tier passa `query` com o seu. */
function comTierFixo(query) {
  const q = String(query || '');
  if (/[?&]tier=/.test(q)) return q;
  if (!q) return '?tier=baixo';
  return q + (q.startsWith('?') ? '&' : '?') + 'tier=baixo';
}

async function waitForServer(srv, port, bootToken, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (srv.exitCode !== null)
      throw new Error(`servidor de QA encerrou antes do boot (exit ${srv.exitCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const body = await response.text();
      if (response.status === 200 &&
          response.headers.get('x-qa-boot-token') === bootToken &&
          body.includes('<canvas id="game"></canvas>')) {
        if (srv.exitCode !== null)
          throw new Error(`servidor de QA encerrou durante o boot (exit ${srv.exitCode})`);
        return;
      }
      lastError = new Error(`resposta inesperada HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`servidor de QA não respondeu na porta ${port}: ${lastError || 'timeout'}`);
}

function waitForSocketEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off('connect_error', onError);
      if (error) reject(error);
      else resolve(value);
    };
    const onEvent = value => finish(null, value);
    const onError = error => finish(error instanceof Error ? error : new Error(String(error)));
    const timer = setTimeout(
      () => finish(new Error(`socket não recebeu '${event}' em ${timeoutMs}ms`)),
      timeoutMs,
    );
    socket.once(event, onEvent);
    socket.once('connect_error', onError);
  });
}

async function stopServer(srv) {
  if (!srv || srv.exitCode !== null) return;
  await new Promise(resolve => {
    let finished = false;
    let forceTimer, giveUpTimer;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      clearTimeout(giveUpTimer);
      srv.off('exit', done);
      resolve();
    };
    forceTimer = setTimeout(() => {
      if (srv.exitCode === null) srv.kill('SIGKILL');
    }, 1500);
    giveUpTimer = setTimeout(done, 3000);
    srv.once('exit', done);
    srv.kill();
  });
}

async function bootGame({
  port,
  serverPort,
  worldSeed = '424242',
  extraEnv = {},
  blockRequests = [],
  delayRequests = [],
  protocolTimeout = 180000,
  // query da URL do jogo (ex.: '?mobile=1' pro modo celular, '?tier=baixo').
  // Vazio = comportamento histórico, byte por byte.
  query = '',
  /* viewport do page (ex.: paisagem de celular com hasTouch). Aplicado ANTES
     do goto de propósito: chamar setViewport depois do boot RECRIA o contexto
     de execução e apaga o window.QA injetado aqui. null = não chama nada. */
  viewport = null,
  /* true (padrão histórico) = o harness chama G.forceStart() e entrega a
     página JÁ em jogo. false = para no MENU, com window.QA montado do mesmo
     jeito: é o único modo de testar o próprio menu (botão travado, aviso de
     queda, clique que inicia o solo). Nada mais muda. */
  autoStart = true,
  /* true (padrão histórico) = a página nasce com __MP_active e __BR_active
     ligados, como sempre foi: a IA solo fica fora do caminho e a morte cai no
     fluxo de sessão online. false = modo SOLO DE VERDADE — é o único jeito de
     alcançar a branch de morte solo, que com as duas bandeiras sempre ligadas
     era matematicamente inalcançável em CI (ver docs/2026-08-09-menu-unico.md,
     "lacunas de teste"). Com false os inimigos, a noite e o boss VOLTAM a
     rodar: é o jogo solo, não um cenário controlado. */
  online = true,
}) {
  const puppeteer = require('puppeteer-core');
  const rankFile = extraEnv.RANK_FILE || path.join(os.tmpdir(),
    `fps-harness-rank-${process.pid}-${serverPort || port}-${Date.now()}.json`);
  const bootToken = randomUUID();
  const removeRankFile = !extraEnv.RANK_FILE;
  const srv = spawn(process.execPath, [path.join(__dirname, '..', '..', 'server.js')], {
    // GAS_DEFAULT clássico: testes determinísticos (o 'auto' de produção sorteia
    // modo por partida; os modos novos têm testes dedicados que setam a flag)
    env: { ...process.env, PORT: String(serverPort || port), WORLD_SEED: worldSeed,
      GAS_DEFAULT: 'classica', RANK_FILE: rankFile, QA_BOOT_TOKEN: bootToken, ...extraEnv },
    stdio: 'ignore',
  });
  let browser = null;
  let closed = false;
  try {
    await waitForServer(srv, serverPort || port, bootToken);
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      protocolTimeout,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio',
        '--window-size=800,600', ...backendArgs()],
    });
    const page = await browser.newPage();
    // As flags existem antes do primeiro tick: sob máquina carregada, uma morte
    // no boot não pode cair no fluxo errado e destruir o contexto do QA.
    await page.evaluateOnNewDocument(onlineNaPagina => {
      if (onlineNaPagina) {
        window.__MP_active = true;
        window.__BR_active = true;
        window.__MP_respawn = () => {};
      } else {
        /* SOLO DE VERDADE. O servidor de QA está no ar (ele serve a página),
           então sem esta bandeira o cliente BR bootaria e publicaria
           __MP_active — e a branch solo seguiria inalcançável. É a MESMA
           bandeira que o botão SOLO do menu levanta em produção. */
        window.__MP_soloOnly = true;
      }
      // reconexão em partida recarrega a página em produção; o QA preserva o
      // contexto (mesmo padrão do __MP_respawn) — o cenário degrada gracioso
      window.__MP_reload = () => {};
    }, online);
    if (viewport) await page.setViewport(viewport);
  const pageErrors = [];
  const consoleErrors = [];
  const requestFailures = [];
  page.on('pageerror', e => { pageErrors.push(e.message); console.error('  [pageerror]', e.message); });
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    requestFailures.push(`${request.url()} — ${request.failure()?.errorText || 'falha desconhecida'}`);
  });
  if (blockRequests.length || delayRequests.length) {
    await page.setRequestInterception(true);
    page.on('request', async request => {
      if (blockRequests.some(fragment => request.url().includes(fragment))) {
        await request.abort();
        return;
      }
      const delayed = delayRequests.find(item => request.url().includes(item.fragment));
      if (delayed) await new Promise(resolve => setTimeout(resolve, delayed.ms));
      await request.continue();
    });
  }
  await page.goto(`http://localhost:${port}/${comTierFixo(query)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await page.waitForFunction('!!window.__game && !!window.__MP', { timeout: 90000 });
    await page.evaluate((autoStartNaPagina, onlineNaPagina) => {
      const G = window.__game, MP = window.__MP;
      // Loops manuais longos podem bloquear o heartbeat do socket. Em
      // produção o reconnect recarrega a página de propósito; no QA removemos
      // só esse reload, preservando a reconexão necessária para o boot BR.
      if (MP.socket && MP.socket.io) {
        if (typeof MP.socket.io.off === 'function') MP.socket.io.off('reconnect');
        if (typeof MP.socket.io.reconnection === 'function') MP.socket.io.reconnection(true);
      }
      // a morte online devolve o fluxo pro servidor — no QA o respawn é neutro
    if (onlineNaPagina) {
      window.__MP_active = true;
      window.__QA_originalRespawn = window.__MP_respawn;
      window.__MP_respawn = () => {};
      // IA fora do caminho: __BR_active desliga Enemies/Night/Boss no tick
      // (o hitscan continua acertando os bonecos parados) e os animais morrem
      window.__BR_active = true;
    }
    // PERF do QA: mecânica não precisa de pixels — render vira no-op
    MP.composer.render = () => {};
    if (autoStartNaPagina) G.forceStart();
    for (const a of (G.Animals && G.Animals.list) || []) a.alive = false;
    window.QA = {
      G, MP,
      tick(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) G.tick(dt); },
      clearInput() {
        for (const k in G.keys) G.keys[k] = false;
        G.mouse.shooting = G.mouse.clicked = G.mouse.aiming = false;
        MP.justPressed.clear();
      },
      reset(x = 30, z = 30) {
        this.clearInput();
        const P = MP.player;
        const y = MP.groundAt(x, z, 999);
        P.pos.set(x, y, z);
        P.vel.set(0, 0, 0);
        P.onGround = true;
        P.dead = false;
        P.health = P.maxHealth;
        P.armor = 0;
        P.healPool = 0;
        P.lastDamageCause = null;
        P.lastDamageT = -Infinity;
        P.invulnUntil = 0;
        P.slideT = -1;
        MP.setTimeScale(1);
        if (G.state.driving || G.state.flying) G.tryToggleCar();
        MP.camera.position.set(P.pos.x, P.pos.y + 1.62, P.pos.z);
        MP.camera.rotation.set(0, 0, 0);
        this.tick(2); // assenta
      },
      aimAt(x, y, z) { window.QA.MP.camera.lookAt(x, y, z); },
      fwdDelta(before) { // deslocamento horizontal desde `before`
        const P = window.QA.MP.player.pos;
        return Math.hypot(P.x - before[0], P.z - before[1]);
      },
      pos() { const P = window.QA.MP.player.pos; return [P.x, P.z, P.y]; },
    };
  }, autoStart, online);

  return {
    browser, page, srv, port, pageErrors, consoleErrors, requestFailures,
    play: (fn, ...args) => page.evaluate(fn, ...args),
    async close() {
      if (closed) return;
      closed = true;
      let browserError = null;
      try {
        if (browser) await browser.close();
      } catch (error) {
        browserError = error;
      } finally {
        await stopServer(srv);
        if (removeRankFile) fs.rmSync(rankFile, { force: true });
      }
      if (browserError) throw browserError;
    },
  };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    await stopServer(srv);
    if (removeRankFile) fs.rmSync(rankFile, { force: true });
    throw error;
  }
}

/* inicia uma partida BR de verdade: bot-host conecta, dá o código e inicia;
   a página entra na partida e é jogada direto pro chão em fase PLAY */
async function waitForBRClientReady(h) {
  // O socket pode conectar antes de br-game.js terminar o carregamento
  // dinâmico. Só iniciar a rodada depois que o listener de matchStart e o
  // estado de depuração forem publicados; caso contrário o evento se perde.
  await h.page.waitForFunction(
    'window.__BR_debug && window.__BR_debug.S && window.__BR_debug.S.phase === "LOBBY"' +
      ' && window.__MP_init && window.__MP && window.__MP.socket' +
      ' && window.__MP_init.id === window.__MP.socket.id',
    { timeout: 60000 },
  );
}

/* O SERVIDOR NÃO ACREDITA NO TELEPORTE DO HARNESS.
   Pular a nave (S.phase = 'PLAY' + QA.reset) move o boneco da cabine — ou do
   spawn do lobby — direto pro chão, num salto de centenas de metros num frame.
   O anti-teleporte de server.js (`state`: hSpd > 90 m/s) rejeita esse `state`
   e, enquanto rejeita, NÃO atualiza pos/ship/fall: a visão do servidor sobre a
   página continua "dentro da nave, a ~700 m daqui". Nessa janela todo
   `shotHit` contra a página é descartado em silêncio por DOIS portões —
   combatImmune(victim) e o alcance de 320 m — e o cenário morre sem sintoma:
   nenhum `youWereHit`, nenhuma morte, só o timeout de quem esperava.
   (Medido: 5 falhas em 50 execuções de test/br-death-cause; em 100% delas o
   último estado ACEITO da página era ship=true a 695 m. Aumentar o tempo de
   espera não salva nenhuma — o tiro não atrasa, ele é recusado.)
   `playerUpdate` só é transmitido a partir de estado ACEITO, então o bot-host
   vendo a página no chão na posição pedida é a prova de que o servidor e o
   cliente finalmente concordam sobre onde ela está. */
async function waitServerSawLanding(h, bot, x, z, timeoutMs = 10000) {
  const pageId = await h.play(() => window.__MP.socket.id);
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bot.off('playerUpdate', onUpdate);
      if (error) reject(error);
      else resolve();
    };
    const onUpdate = d => {
      if (!d || d.id !== pageId || d.ship || d.fall || !Array.isArray(d.pos)) return;
      if (Math.hypot(d.pos[0] - x, d.pos[2] - z) > 2) return;
      finish(null);
    };
    const timer = setTimeout(
      () => finish(new Error(
        `o servidor não aceitou o pouso da página em (${x}, ${z}) em ${timeoutMs}ms ` +
        '— anti-teleporte ainda rejeitando o estado')),
      timeoutMs,
    );
    bot.on('playerUpdate', onUpdate);
  });
}

/* `flags`: regras da sala (gas, alien, zumbis…) aplicadas pelo anfitrião
   ANTES do início — mesmo caminho do lobby real (setFlags do host). */
async function startBRMatch(h, { hostCode = 'QUEDALIVRE', serverPort, flags = null } = {}) {
  const { io } = require('socket.io-client');
  let bot = null;
  try {
    await h.play(() => {
      const socket = window.__MP && window.__MP.socket;
      if (socket && !socket.connected) socket.connect();
    });
    await h.page.waitForFunction(
      'window.__MP && window.__MP.socket && window.__MP.socket.connected',
      { timeout: 15000 },
    );
    await waitForBRClientReady(h);
    bot = io(`http://localhost:${serverPort || h.port}`, { transports: ['websocket'] });
    const botInit = await waitForSocketEvent(bot, 'init');
    bot.emit('hello', { nick: 'BotHost' });
    /* HEARTBEAT DE VIDA. O servidor executa por INATIVIDADE quem fica 45 s
       sem emitir `state` (anti-AFK, backstop da zona). O bot-host parado é
       exatamente isso: em testes que passam de ~87 s de partida ele morria
       sozinho, encerrava a partida e roubava a vitória do cenário (raiz da
       falha tardia de test/gamefeel). Um state parado a cada 5 s é o que um
       jogador vivo de verdade faria. unref(): o timer não segura o processo. */
    const botSpawn = (botInit && botInit.spawn) || { x: 60, z: 60 };
    let botLastState = { pos: [botSpawn.x || 60, 2, botSpawn.z || 60], rotY: 0 };
    /* o pulso REPETE a última posição que o teste mandou (walkHostTo etc.);
       reenviar o spawn teleportaria o host de volta no meio do cenário. */
    const botEmit = bot.emit.bind(bot);
    bot.emit = (ev, ...args) => {
      if (ev === 'state' && args[0] && args[0].pos) botLastState = args[0];
      return botEmit(ev, ...args);
    };
    const botPulse = setInterval(() => {
      if (bot.connected) botEmit('state', botLastState);
    }, 5000);
    if (botPulse.unref) botPulse.unref();
    const botClose = bot.close.bind(bot);
    bot.close = () => { clearInterval(botPulse); return botClose(); };
    await new Promise((res, rej) => bot.timeout(4000).emit('claimHost', { code: hostCode },
      (e, d) => (e || !d || !d.ok) ? rej(new Error('claimHost falhou')) : res()));
    if (flags) {
      /* o servidor aplica e ECOA as regras pra sala inteira (io.emit('flags')).
         Esperar o eco — em vez de dormir um tanto — é o que garante que o
         requestStart abaixo já pegue a partida com as regras novas. */
      const aplicadas = waitForSocketEvent(bot, 'flags', 5000);
      bot.emit('setFlags', flags);
      await aplicadas;
    }
    bot.emit('requestStart');
    await h.page.waitForFunction('window.__BR_debug && !!window.__BR_debug.S.plan', {
      timeout: 60000,
    });
    await h.play(() => {
      const S = window.__BR_debug.S;
      S.phase = 'PLAY';           // pula nave/queda: direto pro chão
      window.__BR_freeze = false;
      window.QA.reset(30, 30);
    });
    await waitServerSawLanding(h, bot, 30, 30);
    return bot; // fica vivo na partida — quem chamou fecha com bot.close()
  } catch (error) {
    if (bot) bot.close();
    throw error;
  }
}

/* inicia uma partida BR e PERMANECE na fase SHIP (não força PLAY).
   Use FLY_TIME alto no extraEnv do bootGame pra nave não acabar no meio
   do teste. Não mexe no startBRMatch acima: os testes legados dependem
   do pulo direto pro chão. */
async function startBRMatchInShip(h, { hostCode = 'QUEDALIVRE' } = {}) {
  const { io } = require('socket.io-client');
  let bot = null;
  try {
    await h.play(() => {
      const socket = window.__MP && window.__MP.socket;
      if (socket && !socket.connected) socket.connect();
    });
    await h.page.waitForFunction(
      'window.__MP && window.__MP.socket && window.__MP.socket.connected',
      { timeout: 15000 },
    );
    await waitForBRClientReady(h);
    bot = io(`http://localhost:${h.port}`, { transports: ['websocket'] });
    await waitForSocketEvent(bot, 'init');
    bot.emit('hello', { nick: 'BotHost' });
    await new Promise((res, rej) => bot.timeout(4000).emit('claimHost', { code: hostCode },
      (e, d) => (e || !d || !d.ok) ? rej(new Error('claimHost falhou')) : res()));
    bot.emit('requestStart');
    await h.page.waitForFunction(
      'window.__BR_debug && !!window.__BR_debug.S.plan && window.__BR_debug.S.phase === "SHIP"' +
      ' && !!window.__BR_debug.shipDebug.local',
      { timeout: 60000 });
    return bot;
  } catch (error) {
    if (bot) bot.close();
    throw error;
  }
}

module.exports = { CHROME, bootGame, startBRMatch, startBRMatchInShip };
