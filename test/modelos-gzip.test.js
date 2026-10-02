/* ================================================================
   MODELOS COMPRIMIDOS NO FIO — laudo a9a4ffd, D6 (boot em 4G).

   O Cloudflare comprime o JS, mas passa o `model/gltf-binary` cru: medido
   em produção, o fuzil (557 KB) chegava com 557 KB no fio, e os modelos são
   14 dos 17 MB do boot. O servidor passa a mandar cada .glb em gzip a quem
   aceita gzip, comprimido UMA vez e guardado.

   Âncora independente: os BYTES DO ARQUIVO no disco — o que sai
   descomprimido tem de ser idêntico a eles, com e sem gzip. E a fonte
   autoral do castelo continua 404 por todas as grafias, com gzip pedido.

   Servidor em PORT=0 (porta lida do log).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const MODELOS = path.join(RAIZ, 'assets', 'models');

function subir() {
  const rank = path.join(os.tmpdir(), `fps-gz-rank-${process.pid}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    env: { ...process.env, PORT: '0', HOST_CODE: 'QA123', RANK_FILE: rank, NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let erro = '';
  proc.stderr.on('data', d => { erro = (erro + d).slice(-1500); });
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('servidor não subiu\n' + erro)), 20000);
    proc.stdout.on('data', d => {
      const m = /Servidor BR no ar em http:\/\/localhost:(\d+)/.exec(String(d));
      if (m) { clearTimeout(to); res({ porta: +m[1], proc, rank }); }
    });
    proc.on('exit', c => rej(new Error('servidor morreu cedo, código ' + c + '\n' + erro)));
  });
}
function pedir(porta, caminho, headers = {}, method = 'GET') {
  return new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method, headers }, r => {
      const partes = [];
      r.on('data', c => partes.push(c));
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, corpo: Buffer.concat(partes) }));
    });
    req.on('error', rej);
    req.end();
  });
}
const urlDe = rel => '/assets/models/' + rel.split(path.sep).map(encodeURIComponent).join('/');
/* os modelos VERSIONADOS — o que vai para a produção. A árvore de quem
   desenvolve tem fontes locais ignoradas pelo git (a bazuca original, o
   alien de 5 MB, só textura): contá-las mudava o agregado conforme a máquina */
function glbs() {
  const saida = execFileSync('git', ['ls-files', '-z', '--', 'assets/models'], { cwd: RAIZ });
  return saida.toString('utf8').split('\0')
    .filter(f => /\.glb$/i.test(f) && path.basename(f) !== 'boss-castle.v1.glb')
    .map(f => path.relative('assets/models', f).split('/').join(path.sep));
}

describe('modelos comprimidos no fio', () => {
  let srv;
  before(async () => { srv = await subir(); });
  after(() => { if (srv) { srv.proc.kill(); fs.rmSync(srv.rank, { force: true }); } });

  it('com gzip aceito, todo .glb sai em gzip e descomprime nos MESMOS bytes do arquivo', async t => {
    const lista = glbs();
    assert.ok(lista.length >= 15, `cenário: só ${lista.length} modelos`);
    let cru = 0, fio = 0;
    const ruins = [];
    for (const rel of lista) {
      const disco = fs.readFileSync(path.join(MODELOS, rel));
      const r = await pedir(srv.porta, urlDe(rel), { 'Accept-Encoding': 'gzip, deflate, br' });
      const corpo = r.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(r.corpo) : r.corpo;
      if (r.status !== 200 || !corpo.equals(disco)) ruins.push(`${rel}: ${r.status}, ${corpo.length} B contra ${disco.length}`);
      if (!/model\/gltf-binary/.test(r.headers['content-type'] || '')) ruins.push(`${rel}: MIME ${r.headers['content-type']}`);
      if (!/accept-encoding/i.test(r.headers.vary || '')) ruins.push(`${rel}: sem Vary: Accept-Encoding`);
      if (!/max-age=[1-9]/.test(r.headers['cache-control'] || '')) ruins.push(`${rel}: cache ${r.headers['cache-control']}`);
      cru += disco.length; fio += r.corpo.length;
    }
    t.diagnostic(`${lista.length} modelos: ${(cru / 1048576).toFixed(2)} MB no disco, ${(fio / 1048576).toFixed(2)} MB no fio (${(100 * (1 - fio / cru)).toFixed(0)} % menos)`);
    assert.deepEqual(ruins, []);
    assert.ok(fio < cru * 0.75, `o fio levou ${(fio / 1048576).toFixed(2)} de ${(cru / 1048576).toFixed(2)} MB`);
  });

  it('o fuzil (geometria pura) sai em gzip com menos da metade dos bytes', async () => {
    const rel = path.join('Armas', 'low_poly_m4_rifle.glb');
    const r = await pedir(srv.porta, urlDe(rel), { 'Accept-Encoding': 'gzip' });
    assert.equal(r.headers['content-encoding'], 'gzip');
    assert.equal(+r.headers['content-length'], r.corpo.length);
    assert.ok(r.corpo.length < fs.statSync(path.join(MODELOS, rel)).size * 0.5, `${r.corpo.length} B no fio`);
  });

  it('sem gzip aceito, sai cru e idêntico; HEAD não manda corpo', async () => {
    const rel = path.join('Cenários', 'mercado.glb');
    const disco = fs.readFileSync(path.join(MODELOS, rel));
    const r = await pedir(srv.porta, urlDe(rel));
    assert.equal(r.status, 200);
    assert.equal(r.headers['content-encoding'], undefined);
    assert.ok(r.corpo.equals(disco), 'o corpo cru não é o arquivo');
    assert.match(r.headers.vary || '', /accept-encoding/i);
    const h = await pedir(srv.porta, urlDe(rel), { 'Accept-Encoding': 'gzip' }, 'HEAD');
    assert.equal(h.status, 200);
    assert.equal(h.headers['content-encoding'], 'gzip');
    assert.equal(h.corpo.length, 0);
  });

  it('revalidação: o ETag do gzip devolve 304', async () => {
    const u = urlDe(path.join('Armas', 'low_poly_m4_rifle.glb'));
    const a = await pedir(srv.porta, u, { 'Accept-Encoding': 'gzip' });
    assert.ok(a.headers.etag, 'sem ETag');
    const b = await pedir(srv.porta, u, { 'Accept-Encoding': 'gzip', 'If-None-Match': a.headers.etag });
    assert.equal(b.status, 304);
    assert.equal(b.corpo.length, 0);
  });

  it('a fonte autoral do castelo segue 404 por toda grafia, com gzip pedido; inexistente é 404', async () => {
    for (const p of [
      '/assets/models/boss-castle.v1.glb',
      '/assets/models//boss-castle.v1.glb',
      '/assets/models/%62oss-castle.v1.glb',
      '/assets/models/boss-castle.v1%2Eglb',
      '/assets/models/%2Fboss-castle.v1.glb',
      '/assets/models/boss-castle%2Ev1%2Eglb',
      '/assets/models/Armas/../boss-castle.v1.glb',
      '/assets/models/Armas/%2E%2E/boss-castle.v1.glb',
    ]) {
      const r = await pedir(srv.porta, p, { 'Accept-Encoding': 'gzip' });
      assert.equal(r.status, 404, `fonte autoral do castelo baixável por ${p} (status ${r.status})`);
    }
    for (const p of ['/assets/models/nao-existe.glb', '/assets/models/%2E%2E/server.js', '/assets/models/..%2F..%2Fserver.js']) {
      const r = await pedir(srv.porta, p, { 'Accept-Encoding': 'gzip' });
      assert.notEqual(r.status, 200, `${p} respondeu 200`);
      assert.ok(!r.corpo.includes('Servidor BR'), `${p} vazou o código do servidor`);
    }
  });
});
