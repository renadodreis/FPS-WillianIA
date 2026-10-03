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
    for (const p of ['/vendor/three@0.184.0/package.json', '/vendor/three@0.184.0/src/Three.js', '/vendor/../server.js']) {
      const r = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: p }, x => { x.resume(); res(x); }).on('error', rej));
      assert.notEqual(r.statusCode, 200, `${p} respondeu 200`);
    }
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors.filter(e => !/vendor\/three|Failed to fetch dynamically|net::ERR_FAILED/i.test(String(e))), []);
  });
});
