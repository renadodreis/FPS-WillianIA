#!/usr/bin/env node
/* ================================================================
   KIT DE CONTROLE DE VR — diagnóstico honesto, em camadas.

   POR QUE ESTE ARQUIVO EXISTE. O relato "os controles de VR não funcionam"
   se repetiu CINCO vezes enquanto a suíte estava verde, e a razão de eu não
   ter achado o defeito é que minhas sondas liam uma página que NUNCA tinha
   estado em sessão imersiva — e reportavam o número mesmo assim. Sonda que
   mede o que não é a coisa é pior que sonda nenhuma: ela produz uma
   afirmação confiante e errada.

   A REGRA DESTE SCRIPT: nada de entrada é reportado sem sessão imersiva
   confirmada na própria página. Cada camada abaixo é verificada em ordem, e
   a primeira que falhar PARA a execução dizendo o que fazer. Ele nunca
   inventa um resultado a partir do que sobrou.

     1. adb            aparelho autorizado?
     2. controles      pareados, acordados, com bateria?
     3. túnel          `adb reverse` de pé? (sem ele não há contexto seguro)
     4. navegador      socket de depuração no ar?
     5. abas           UMA só? (duplicadas matam a interação pra sempre)
     6. página         o jogo montou?
     7. SESSÃO         `XR.presenting === true`?  <-- o portão
     8. fontes         `session.inputSources` traz controle?
     9. sinal          eixo/botão MUDAM quando o dono mexe?

   Uso:
     node scripts/vr-controles.js                 # espera você entrar em VR
     node scripts/vr-controles.js --entrar        # clica no botão de VR pra você
     node scripts/vr-controles.js --segundos=20
   ================================================================ */
'use strict';
const { adb, aparelhos, findDevtoolsSocket, abasDoJogo } = require('./lib/vrdevice.js');

const cfg = { port: 3000, segundos: 20, entrar: false };
for (const a of process.argv.slice(2)) {
  const [k, v] = a.replace(/^--/, '').split('=');
  if (k === 'entrar') cfg.entrar = v !== '0';
  else if (k in cfg) cfg[k] = v === undefined ? true : (isNaN(+v) ? v : +v);
}

const ok = m => console.log(`  ok   ${m}`);
const aviso = m => console.log(`  !    ${m}`);
class Parar extends Error {
  constructor(camada, motivo, comoResolver) {
    super(motivo); this.camada = camada; this.comoResolver = comoResolver;
  }
}

/* ---------- camada 2: o que o sistema sabe dos controles ----------
   O runtime da Meta guarda o estado no serviço de rastreamento. Três coisas
   valem: se estão PAREADOS, se estão ATIVOS e a bateria. `CONNECTED_INACTIVE`
   é o estado de controle parado na mesa — ele existe, tem bateria, e não
   manda nada. É indistinguível de "controle quebrado" pra quem só olha se
   chegou entrada, e foi exatamente essa confusão que custou uma rodada. */
function estadoDosControles() {
  let saida = '';
  for (const svc of ['OVRRemoteService', 'trackingservice', 'input']) {
    try { saida += '\n' + adb(['shell', 'dumpsys', svc], { quiet: true }); } catch { /* serviço ausente: segue */ }
  }
  const achados = [...saida.matchAll(/model:\s*(CONTROLLER_\w+),\s*conn:\s*(\w+),\s*battery:\s*(\d+)/g)]
    .map(m => ({ modelo: m[1], conexao: m[2], bateria: +m[3] }));
  const mao = m => (new RegExp(`${m}\\s+Id:\\s*([0-9a-f]{4,})`, 'i').exec(saida) || [])[1] || null;
  const handTracking = /Hand tracking enabled:\s*1/i.test(saida);
  return { achados, esquerdo: mao('LEFT'), direito: mao('RIGHT'), handTracking };
}

/* ---------- camada 9: o que a SESSÃO está entregando ----------
   Roda DENTRO da página, dentro da sessão. Não deriva nada de fora: lê
   `session.inputSources` como o jogo lê, guarda o extremo de cada eixo e
   quais botões foram pressionados na janela. É o que separa "não chega
   entrada" de "chega entrada e o jogo ignora". */
function amostrarNaPagina(segundos) {
  return new Promise(resolve => {
    const R = window.__MP.renderer;
    const sessao = R.xr.getSession && R.xr.getSession();
    if (!sessao) return resolve({ erro: 'a página não tem sessão XR' });

    const acc = { frames: 0, maxFontes: 0, maos: {}, tipoDaColecao: null, ehArray: null };
    const t0 = performance.now();
    const passo = () => {
      const fontes = sessao.inputSources;
      if (acc.tipoDaColecao === null) {
        acc.tipoDaColecao = Object.prototype.toString.call(fontes);
        acc.ehArray = Array.isArray(fontes);
      }
      const lista = fontes ? Array.from(fontes) : [];
      acc.frames++;
      acc.maxFontes = Math.max(acc.maxFontes, lista.length);
      for (const f of lista) {
        const m = f.handedness || 'sem-mao';
        const r = acc.maos[m] || (acc.maos[m] = {
          perfis: f.profiles ? [...f.profiles] : [], eixos: [], botoes: [], nEixos: 0, nBotoes: 0,
        });
        const g = f.gamepad;
        if (!g) continue;
        r.nEixos = g.axes.length; r.nBotoes = g.buttons.length;
        for (let i = 0; i < g.axes.length; i++) {
          const v = g.axes[i];
          const e = r.eixos[i] || (r.eixos[i] = { min: 0, max: 0 });
          if (v < e.min) e.min = v;
          if (v > e.max) e.max = v;
        }
        for (let i = 0; i < g.buttons.length; i++)
          if (g.buttons[i].pressed) r.botoes[i] = (r.botoes[i] || 0) + 1;
      }
      if (performance.now() - t0 >= segundos * 1000) return resolve(acc);
      sessao.requestAnimationFrame(passo);
    };
    sessao.requestAnimationFrame(passo);
  });
}

async function main() {
  const puppeteer = require('puppeteer-core');
  console.log('\nKIT DE CONTROLE DE VR — cada camada para na primeira falha\n');

  /* 1. aparelho */
  const devs = aparelhos();
  if (!devs.length) {
    const bruto = (() => { try { return adb(['devices']); } catch (e) { return e.message; } })();
    throw new Parar(1, 'nenhum aparelho autorizado no adb',
      /unauthorized/.test(bruto)
        ? 'o headset está listado como "unauthorized": coloque o headset e aceite "Permitir depuração USB?"'
        : 'plugue o cabo (ou `adb connect <ip>`) e ligue a Depuração USB no modo de desenvolvedor.\n' +
          '       SEM APARELHO NÃO EXISTE MEDIÇÃO: este script não vai adivinhar nada a partir daqui.');
  }
  ok(`aparelho: ${devs.join(', ')}`);

  /* 2. controles */
  const c = estadoDosControles();
  if (!c.achados.length && !c.esquerdo && !c.direito) {
    aviso('o sistema não relata NENHUM controle pareado — sem controle e sem mãos não há o que medir');
  } else {
    for (const a of c.achados)
      console.log(`  ${a.conexao === 'CONNECTED_ACTIVE' ? 'ok  ' : '!   '} ${a.modelo}: ${a.conexao}, bateria ${a.bateria}%`);
    if (c.achados.every(a => a.conexao !== 'CONNECTED_ACTIVE')) {
      aviso('nenhum controle ATIVO. `CONNECTED_INACTIVE` é controle parado na mesa: ele existe, tem');
      aviso('bateria, e não manda nada. Pegue os dois na mão e aperte um botão ANTES de medir.');
    }
    if (!c.handTracking) aviso('rastreamento de mãos desligado — sem controle ativo, a sessão fica sem entrada nenhuma');
  }

  /* 3. túnel + 4. navegador */
  adb(['reverse', `tcp:${cfg.port}`, `tcp:${cfg.port}`]);
  ok(`túnel: localhost:${cfg.port} no aparelho = servidor desta máquina (é o que dá contexto seguro)`);
  const socket = await findDevtoolsSocket();
  adb(['forward', 'tcp:9222', `localabstract:${socket}`]);
  ok(`navegador no ar: ${socket}`);

  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222', protocolTimeout: 600000 });
  try {
    /* 5. abas */
    const abas = await abasDoJogo(browser, cfg.port);
    if (!abas.length) {
      throw new Parar(5, 'nenhuma aba está com o jogo aberto',
        `abra http://localhost:${cfg.port}/ no navegador do headset`);
    }
    if (abas.length > 1) {
      aviso(`${abas.length} abas com o jogo. As de trás ficam escondidas, PARAM de desenhar e não`);
      aviso('respondem a clique nunca mais — quem está de headset clica numa tela morta. Feche as extras.');
    } else ok('uma aba só com o jogo');
    const page = abas[abas.length - 1];

    /* 6. página */
    const montou = await page.evaluate(() => !!(window.__game && window.__game.XR)).catch(() => false);
    if (!montou) throw new Parar(6, 'a página não montou o jogo (window.__game.XR ausente)',
      'recarregue a aba e espere o menu aparecer');
    ok('jogo montado na página');

    /* 7. O PORTÃO */
    if (cfg.entrar) {
      await page.evaluate(() => { const b = document.getElementById('btnVR'); if (b) b.click(); });
    }
    const presente = await page.waitForFunction('window.__game.XR.presenting === true',
      { timeout: 60000, polling: 250 }).then(() => true).catch(() => false);
    if (!presente) {
      throw new Parar(7, 'a página NÃO está em sessão imersiva',
        'coloque o headset e toque em "ENTRAR EM VR" (ou rode com --entrar).\n' +
        '       DAQUI PRA BAIXO NADA É MEDIDO SEM ISSO: foi lendo página fora de sessão que\n' +
        '       este kit já afirmou "0 fontes de entrada" cinco vezes seguidas, sobre uma página\n' +
        '       que estava no menu da biblioteca do sistema.');
    }
    ok('SESSÃO IMERSIVA CONFIRMADA na página — a partir daqui a leitura vale');

    /* 8 + 9 */
    console.log(`\n  mexa os dois analógicos e aperte os gatilhos pelos próximos ${cfg.segundos}s...\n`);
    const r = await page.evaluate(amostrarNaPagina, cfg.segundos);
    if (r.erro) throw new Parar(8, r.erro, 'a sessão caiu no meio da medição — repita');

    console.log(`  coleção entregue pelo navegador: ${r.tipoDaColecao}  (Array.isArray = ${r.ehArray})`);
    if (r.ehArray === false) {
      console.log('  ^ NÃO é Array. Guardar a entrada com `Array.isArray()` descarta os controles todo');
      console.log('    frame, sem erro e sem console. Foi esse o defeito de "os controles não funcionam".');
    }
    console.log(`  frames da sessão amostrados: ${r.frames}`);
    console.log(`  máximo de fontes de entrada simultâneas: ${r.maxFontes}\n`);

    if (!r.maxFontes) {
      throw new Parar(8, 'a sessão está de pé mas não entregou fonte de entrada nenhuma',
        'os controles não acordaram: aperte um botão em cada um e repita. Se continuar zero com\n' +
        '       ambos ATIVOS na camada 2, aí sim o problema é do navegador/runtime, não do jogo.');
    }

    let mexeu = false;
    for (const [m, d] of Object.entries(r.maos)) {
      const eixos = d.eixos.map((e, i) => `${i}:[${e.min.toFixed(2)},${e.max.toFixed(2)}]`).join(' ');
      const bt = d.botoes.map((n, i) => (n ? `${i}(${n})` : null)).filter(Boolean).join(' ') || '—';
      console.log(`  ${m.padEnd(6)} ${d.nEixos} eixos ${d.nBotoes} botões | amplitude ${eixos || '—'} | apertados ${bt}`);
      console.log(`         perfis: ${d.perfis.join(', ') || '—'}`);
      if (d.eixos.some(e => e.max - e.min > 0.5) || d.botoes.some(Boolean)) mexeu = true;
    }
    console.log('');
    if (!mexeu) {
      aviso('nenhum eixo saiu do lugar e nenhum botão foi apertado na janela.');
      aviso('Isso não prova defeito: pode ser que ninguém tenha mexido. Repita MEXENDO.');
    } else {
      ok('VEREDICTO: os controles chegam na sessão com sinal de verdade.');
      ok('Se mesmo assim o jogador não anda, o defeito é do jogo, não do aparelho —');
      ok('e `test/xr-controle-anda.test.js` é o teste que cobra isso sem headset.');
    }
  } finally {
    await browser.disconnect();
    // faxina nunca derruba medição: o --remove falha se já não existe
    try { adb(['forward', '--remove', 'tcp:9222'], { quiet: true }); } catch { /* já removido */ }
  }
}

main().catch(e => {
  if (e instanceof Parar) {
    console.error(`\n  PAROU na camada ${e.camada}: ${e.message}`);
    console.error(`  o que fazer: ${e.comoResolver}\n`);
  } else {
    console.error(`\n  falhou: ${e.message}\n`);
  }
  process.exitCode = 1;
});
