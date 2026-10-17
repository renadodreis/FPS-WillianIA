/* ================================================================
   QUEM AINDA CARREGA NÃO ENTRA NA PARTIDA COMO VIVO — auditoria do
   multiplayer 338d153, MP-1 (crítica).

   O socket conecta no começo do módulo do jogo, antes de gerar o mundo; o
   ouvinte do `matchStart` só existe depois do boot do BR. O `matchStart` que
   chega nessa janela some, e o servidor punha o jogador VIVO na nave: um
   fantasma que nunca mandava estado, contava nos vivos e era eliminado pelo
   backstop de inatividade 86 s depois — o dono, no celular, perdia a
   partida sem ver a nave (medido em E7, sem dublê).

   Pronto = o `hello` chegou (o cliente o emite no mesmo bloco síncrono em
   que registra os ouvintes da partida — multiplayer-client.js `boot`). Quem
   não está pronto quando a partida começa entra como espectador; a resposta
   do `hello` diz a fase, para o cliente atrasado se reencontrar.

   Socket puro contra o servidor real, PORT=0.
   ================================================================ */
'use strict';
const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const SERVER = path.join(__dirname, '..', 'server.js');

function subir(env = {}) {
  const rank = path.join(os.tmpdir(), `fps-pronto-rank-${process.pid}-${Date.now()}.json`);
  const proc = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: '0', HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60', GAS_DEFAULT: 'classica', RANK_FILE: rank, NODE_ENV: 'test', ...env },
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
const conectar = porta => new Promise((res, rej) => {
  const s = io(`http://127.0.0.1:${porta}`, { transports: ['websocket'], reconnection: false, forceNew: true });
  const to = setTimeout(() => rej(new Error('sem init')), 8000);
  s.once('init', d => { clearTimeout(to); s.initData = d; res(s); });
});
const esperar = (s, ev, filtro = () => true, ms = 8000) => new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('sem ' + ev)), ms);
  const f = d => { if (filtro(d)) { clearTimeout(to); s.off(ev, f); res(d); } };
  s.on(ev, f);
});
const hello = (s, nick) => new Promise(res => s.emit('hello', { nick, colors: null }, r => res(r)));

describe('pronto = hello: quem carrega não vira fantasma', () => {
  // um servidor por caso: a partida começada não volta ao lobby sozinha
  const servidores = [], abertos = [];
  after(() => {
    for (const s of abertos) s.close();
    for (const srv of servidores) { srv.proc.kill(); fs.rmSync(srv.rank, { force: true }); }
  });

  async function partida({ outroPronto }) {
    const srv = await subir(); servidores.push(srv);
    const dono = await conectar(srv.porta); abertos.push(dono);
    const outro = await conectar(srv.porta); abertos.push(outro);
    await hello(dono, 'Dono');
    if (outroPronto) await hello(outro, 'Celular');
    // o roster do lobby diz quem ainda carrega
    const lobby = await new Promise(res => {
      dono.emit('claimHost', { code: 'QA123' }, () => {});
      dono.once('roster', res);
    });
    const comeca = esperar(dono, 'matchStart', () => true, 10000);
    const rosterNaPartida = esperar(dono, 'roster', d => d.phase === 'PLAYING', 10000);
    dono.emit('requestStart');
    await comeca;
    const r = await rosterNaPartida;
    const resp = outroPronto ? null : await hello(outro, 'Celular');   // terminou de carregar DEPOIS
    return { lobby, r, resp, idOutro: outro.initData.id, idDono: dono.initData.id, dono, outro };
  }

  it('o lobby mostra quem ainda carrega; quem não mandou hello entra como ESPECTADOR, e a resposta do hello diz a fase', async t => {
    const { lobby, r, resp, idOutro, idDono, dono, outro } = await partida({ outroPronto: false });
    const noLobby = lobby.players.find(p => p.id === idOutro);
    const elePartida = r.players.find(p => p.id === idOutro);
    t.diagnostic(`lobby: ${JSON.stringify(noLobby)} · partida: vivos ${r.aliveCount}, outro ${JSON.stringify(elePartida)} · resposta: ${JSON.stringify(resp && { phase: resp.phase, spectator: resp.spectator })}`);
    assert.equal(noLobby.carregando, true, 'o lobby não mostra que ele ainda está carregando');
    assert.equal(r.aliveCount, 1, `o fantasma conta nos vivos (${r.aliveCount})`);
    assert.equal(elePartida.alive, false, 'quem não estava pronto entrou VIVO na nave');
    assert.equal(elePartida.spectator, true);
    assert.equal(r.players.find(p => p.id === idDono).alive, true, 'cenário: o anfitrião não entrou na partida');
    assert.equal(resp.phase, 'PLAYING', 'a resposta do hello não diz que a partida começou');
    assert.equal(resp.spectator, true);
    assert.equal(resp.worldSeed >>> 0, outro.initData.worldSeed >>> 0, 'a resposta do hello não traz a semente');
    dono.close(); outro.close();
  });

  it('o avesso: quem já estava pronto entra VIVO, e o lobby não o marca carregando', async () => {
    const { lobby, r, idOutro, dono, outro } = await partida({ outroPronto: true });
    assert.equal(lobby.players.find(p => p.id === idOutro).carregando, false);
    assert.equal(r.aliveCount, 2, `vivos: ${r.aliveCount}`);
    assert.equal(r.players.find(p => p.id === idOutro).alive, true, 'quem estava pronto ficou de fora');
    dono.close(); outro.close();
  });
});

/* auditoria 338d153, MP-5: no `nextMatch` todos os navegadores recarregam e
   desconectam juntos (10 ms); só com humanos a sala chegava a 0 e voltava à
   "fábrica" — o anfitrião reconectava 250 ms depois e achava as regras padrão
   (5 de 5). A sala só zera depois de ficar VAZIA por um tempo. */
describe('as regras da sala sobrevivem à troca de rodada', () => {
  const servidores = [], abertos = [];
  after(() => {
    for (const s of abertos) s.close();
    for (const srv of servidores) { srv.proc.kill(); fs.rmSync(srv.rank, { force: true }); }
  });
  const REGRAS = { tempo: 'relampago', gas: 'classica', animais: false, alien: false, cidade: false };
  async function salaComRegras(env) {
    const srv = await subir(env); servidores.push(srv);
    const dono = await conectar(srv.porta); abertos.push(dono);
    await hello(dono, 'Dono');
    await new Promise(res => dono.emit('claimHost', { code: 'QA123' }, res));
    const flags = esperar(dono, 'flags', f => f.tempo === 'relampago');
    dono.emit('setFlags', REGRAS);
    await flags;
    dono.close();   // a sala esvazia (o reload do nextMatch)
    return srv;
  }
  const regrasDe = d => Object.fromEntries(Object.keys(REGRAS).map(k => [k, d.flags[k]]));

  it('sala vazia por 250 ms (todos recarregando): quem volta acha as MESMAS regras', async t => {
    const srv = await salaComRegras({ SALA_VAZIA_S: '2' });
    await new Promise(res => setTimeout(res, 250));
    const volta = await conectar(srv.porta); abertos.push(volta);
    t.diagnostic(JSON.stringify(regrasDe(volta.initData)));
    assert.deepEqual(regrasDe(volta.initData), REGRAS, 'as regras da sala voltaram ao padrão na troca de rodada');
  });

  it('o avesso: sala vazia além do prazo volta à fábrica', async () => {
    const srv = await salaComRegras({ SALA_VAZIA_S: '1' });
    await new Promise(res => setTimeout(res, 1600));
    const volta = await conectar(srv.porta); abertos.push(volta);
    assert.equal(volta.initData.flags.tempo, 'normal', 'a sala abandonada guardou as regras para sempre');
    assert.equal(volta.initData.flags.cidade, true);
  });
});
