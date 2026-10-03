/* ================================================================
   O BOOT NÃO DEPENDE DO CDN — laudo b92a932, §1.

   O importmap buscava three, os addons e cannon-es no jsDelivr: 26
   requisições por boot, e uma que falhasse (net::ERR_FAILED em 2 ms) deixava
   o jogo em "CARREGANDO O MUNDO..." para sempre, sem aviso — no 4G do
   jogador e na suíte (os "flakes de boot de XR" eram isso: 1, 5, 7, 9
   arquivos por rodada, crescendo com o número de boots, não com a carga).

   (a) todo SCRIPT do boot vem do próprio servidor (âncora: as requisições
       que o navegador faz, não o importmap);
   (b) com a biblioteca bloqueada, o botão do menu DIZ que não carregou, e o
       toque recarrega — e, liberada, o jogo sobe;
   (c) as bibliotecas saem com cache imutável (a versão vai no caminho).

   Porta 4163.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4163;

describe('o boot não depende do CDN', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('(a) todo script do boot vem do próprio servidor', async t => {
    const scripts = [];
    const ouvir = req => {
      const u = new URL(req.url());
      if (req.resourceType() === 'script' || /\.m?js$/.test(u.pathname)) scripts.push(u);
    };
    h.page.on('request', ouvir);
    await h.page.setCacheEnabled(false);
    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.page.waitForFunction('window.__gameModulo === true && !!window.__game', { timeout: 120000, polling: 200 });
    h.page.off('request', ouvir);
    const fora = scripts.filter(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname)).map(u => u.href);
    const vendor = scripts.filter(u => u.pathname.startsWith('/vendor/'));
    t.diagnostic(`${scripts.length} scripts no boot; ${vendor.length} de /vendor/; de fora: ${fora.length}`);
    assert.ok(vendor.length >= 3, `cenário: só ${vendor.length} scripts de /vendor/`);
    assert.deepEqual(fora, [], 'scripts do boot vindos de fora do servidor');
  });

  it('(b) com a biblioteca bloqueada, o menu avisa e o toque recarrega; liberada, o jogo sobe', async t => {
    const page = h.page;
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    let bloquear = true;
    const portao = req => {
      if (bloquear && new URL(req.url()).pathname.startsWith('/vendor/three')) req.abort('failed');
      else req.continue();
    };
    page.on('request', portao);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const t0 = Date.now();
      await page.waitForFunction("/NÃO CARREGOU/.test((document.getElementById('btnNew') || {}).textContent || '')",
        { timeout: 20000, polling: 100 });
      const ms = Date.now() - t0;
      const rodou = await page.evaluate(() => !!window.__gameModulo);
      t.diagnostic(`aviso de falha em ${ms} ms`);
      assert.equal(rodou, false, 'cenário: o módulo rodou com a biblioteca bloqueada');
      assert.ok(ms < 15000, `o aviso demorou ${ms} ms (o erro da importação devia chegar antes do vigia de 60 s)`);
      // libera e toca: recarrega e sobe
      bloquear = false;
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        page.click('#btnNew'),
      ]);
      await page.waitForFunction('window.__gameModulo === true && !!window.__game', { timeout: 120000, polling: 200 });
    } finally {
      page.off('request', portao);
      await page.setRequestInterception(false);
    }
  });

  it('(c) as bibliotecas saem com cache imutável e MIME de script', async () => {
    for (const p of ['/vendor/three@0.184.0/build/three.module.js', '/vendor/three@0.184.0/build/three.core.js',
      '/vendor/three@0.184.0/examples/jsm/loaders/GLTFLoader.js', '/vendor/cannon-es@0.20.0/dist/cannon-es.js']) {
      const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, x => { x.resume(); res(x); }).on('error', rej));
      assert.equal(r.statusCode, 200, `${p}: ${r.statusCode}`);
      assert.match(r.headers['content-type'] || '', /javascript/, `${p}: ${r.headers['content-type']}`);
      assert.match(r.headers['cache-control'] || '', /immutable/, `${p}: ${r.headers['cache-control']}`);
    }
    /* ERRO não fica guardado: o 404 e o 301 saíam com um ano de cache, e a
       borda os guardava (laudo af4eb8f) — na próxima troca de versão, um
       caminho errado ficaria errado por um ano. E pasta não redireciona */
    for (const p of ['/vendor/three@0.184.0/package.json', '/vendor/three@0.184.0/src/Three.js', '/vendor/../server.js',
      '/vendor/three@0.184.0/build/nao-existe.js', '/vendor/three@0.184.0/examples/jsm/loaders', '/vendor/three@9.9.9/build/three.module.js']) {
      const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, x => { x.resume(); res(x); }).on('error', rej));
      assert.notEqual(r.statusCode, 200, `${p} respondeu 200`);
      assert.ok(r.statusCode < 300 || r.statusCode >= 400, `${p} redirecionou (${r.statusCode})`);
      assert.doesNotMatch(r.headers['cache-control'] || '', /immutable|max-age=[1-9]/, `${p} (${r.statusCode}) com cache longo: ${r.headers['cache-control']}`);
    }
  });

  it('(c2) as bibliotecas saem em gzip, e o que descomprime é o arquivo do pacote', async () => {
    const zlib = require('node:zlib'), fs = require('node:fs'), path = require('node:path');
    const disco = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'three-cliente', 'build', 'three.core.js'));
    const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: '/vendor/three@0.184.0/build/three.core.js',
      headers: { 'Accept-Encoding': 'gzip' } }, x => { const c = []; x.on('data', d => c.push(d)); x.on('end', () => res({ h: x.headers, b: Buffer.concat(c) })); }).on('error', rej));
    assert.equal(r.h['content-encoding'], 'gzip');
    assert.match(r.h['cache-control'] || '', /immutable/);
    assert.match(r.h.vary || '', /accept-encoding/i);
    assert.ok(zlib.gunzipSync(r.b).equals(disco), 'o gzip não descomprime no arquivo do pacote');
    assert.ok(r.b.length < disco.length * 0.4, `gzip de ${r.b.length} B para ${disco.length} B`);
  });

  it('(d) no CELULAR, com o módulo do jogo sem rodar, a tela não cita tecla (C4)', async () => {
    const page = await h.browser.newPage();
    try {
      await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
      await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on('request', req => (new URL(req.url()).pathname.startsWith('/vendor/') ? req.abort('failed') : req.continue()));
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction("/NÃO CARREGOU/.test((document.getElementById('btnNew') || {}).textContent || '')", { timeout: 20000, polling: 100 });
      /* o texto VISÍVEL: nó de texto com área na tela (o `innerText` inclui o que o
         CSS do celular esconde com `font-size: 0`, e a tela não mostra) */
      const r = await page.evaluate(() => {
        const partes = [], it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = it.nextNode(); n; n = it.nextNode()) {
          if (!n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const vis = [...rg.getClientRects()].some(q => q.width > 1 && q.height > 1);
          const cs = getComputedStyle(n.parentElement);
          if (vis && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0) partes.push(n.textContent);
        }
        return { mobile: document.documentElement.classList.contains('mobile'), texto: partes.join(' ') };
      });
      assert.equal(r.mobile, true, 'a classe `mobile` não estava posta antes do módulo do jogo');
      const teclas = (r.texto.match(/\bESC\b|\bENTER\b|\bESPA[ÇC]O\b|\bSPACE\b|\bWASD\b|\bSHIFT\b|\bCTRL\b|\[[A-Z]\]|\bclique\b|\bmouse\b/gi) || []);
      assert.deepEqual(teclas, [], `a tela do celular cita tecla: ${teclas.join(', ')}`);
    } finally { await page.close(); }
  });

  it('(e) celular em RETRATO com o boot falhando: o "tentar de novo" é o que está sob o dedo (E10)', async () => {
    const page = await h.browser.newPage();
    try {
      await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on('request', req => (new URL(req.url()).pathname.startsWith('/vendor/') ? req.abort('failed') : req.continue()));
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction("/NÃO CARREGOU/.test((document.getElementById('btnNew') || {}).textContent || '')", { timeout: 20000, polling: 100 });
      const r = await page.evaluate(() => {
        const b = document.getElementById('btnNew'), q = b.getBoundingClientRect();
        const x = q.left + q.width / 2, y = q.top + q.height / 2;
        const sob = document.elementFromPoint(x, y);
        return { retrato: innerHeight > innerWidth, area: q.width * q.height, alvo: sob === b || b.contains(sob), sob: sob && (sob.id || (sob.getAttribute && sob.getAttribute('class')) || sob.tagName) };
      });
      assert.ok(r.retrato, 'cenário: não está em retrato');
      assert.ok(r.area > 400, `o botão não tem área na tela (${r.area})`);
      assert.ok(r.alvo, `sob o dedo, no centro do "tentar de novo", está ${r.sob}`);
    } finally { await page.close(); }
  });

  it('(f) alarme do vigia num link LENTO e o jogo chegando depois: o alarme se desfaz (o aviso de rotação volta)', async () => {
    const page = await h.browser.newPage();
    try {
      await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36');
      await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      // as bibliotecas ficam PRESAS (link lento) até o vigia ter dado o alarme
      const presas = [];
      await page.setRequestInterception(true);
      page.on('request', req => (new URL(req.url()).pathname.startsWith('/vendor/') ? presas.push(req) : req.continue()));
      // com módulo, o DOMContentLoaded espera o módulo (preso): espera-se o vigia no DOM
      const navegacao = page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 }).catch(() => {});
      await page.waitForFunction("!!window.__falhaDoBoot && !!document.getElementById('btnNew')", { timeout: 20000, polling: 50 });
      await page.evaluate(() => window.__falhaDoBoot());   // o que os 60 s fariam
      const noAlarme = await page.evaluate(() => document.documentElement.classList.contains('bootfalhou'));
      // o link "volta": tudo o que estava preso segue, e o módulo roda
      page.removeAllListeners('request');
      page.on('request', req => req.continue());
      for (const req of presas.splice(0)) await req.continue().catch(() => {});
      await page.waitForFunction('window.__gameModulo === true', { timeout: 120000, polling: 200 });
      await navegacao;
      const r = await page.evaluate(() => ({
        bootfalhou: document.documentElement.classList.contains('bootfalhou'),
        portao: getComputedStyle(document.getElementById('rotateGate')).display,
        retrato: innerHeight > innerWidth,
      }));
      assert.equal(noAlarme, true, 'cenário: o alarme não marcou bootfalhou');
      assert.ok(r.retrato, 'cenário: não está em retrato');
      assert.equal(r.bootfalhou, false, 'o jogo carregou e o alarme do vigia ficou (bootfalhou)');
      assert.notEqual(r.portao, 'none', 'em retrato, com o jogo carregado, o aviso de rotação sumiu');
    } finally { await page.close(); }
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors.filter(e => !/vendor\/three|Failed to fetch dynamically|net::ERR_FAILED/i.test(String(e))), []);
  });
});
