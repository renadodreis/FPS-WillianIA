/* ================================================================
   INTERPOLAÇÃO DE SNAPSHOTS dos jogadores remotos (js/interp-rede.js)
   e o relógio do remetente no fio (server.js repassa `t`).

   O boneco dos outros perseguia o ÚLTIMO pacote (10 Hz) por lerp
   exponencial: a cada pacote acelerava e freava — 19,9 % dos quadros
   com a velocidade desenhada fora de ±50 % da real (auditoria MP
   338d153, MQ-6). A regra do gênero (Valve, "Source Multiplayer
   Networking"; Fiedler, "Snapshot Interpolation") é desenhar um pouco
   no PASSADO, entre os dois pacotes que cercam esse instante, com o
   atraso cobrindo um intervalo de envio mais o tremor da rede.

   As medidas aqui são contra a TRAJETÓRIA VERDADEIRA que o teste gera
   (independente do código sob teste), quadro a quadro.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const { io } = require('socket.io-client');

let IR;
before(async () => { IR = await import('../js/interp-rede.js'); });

// gerador determinístico (o tremor tem de ser o mesmo a cada execução)
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/* Simula a rede: o remetente anda em linha reta a `v` m/s e manda a 10 Hz
   pelo relógio DELE (que difere do nosso por `desvio`); cada pacote leva
   `lat` ± `tremor` ms; `perde(i)` descarta pacotes. O receptor desenha a
   60 Hz. Devolve, por quadro, a velocidade desenhada e o atraso real
   (quanto o desenhado está atrás da posição verdadeira, em ms). */
function simular({ v = 6, lat = 70, tremor = 30, perde = () => false, semRelogio = false,
  desvio = 123456, duracao = 8000, seed = 7, intervalo = 100 } = {}) {
  const rnd = lcg(seed);
  const chegadas = [];
  for (let i = 0, ts = 0; ts <= duracao; i++, ts += intervalo) {
    if (perde(i)) continue;
    const chega = ts + lat + (rnd() * 2 - 1) * tremor; // no NOSSO relógio (ts = 0 nos dois)
    chegadas.push({ chega, tRem: ts + desvio, x: v * ts / 1000 });
  }
  chegadas.sort((a, b) => a.chega - b.chega);   // tremor reordena a chegada
  const it = IR.criarInterpolador();
  const out = { x: 0, y: 0, z: 0, yaw: 0 };
  const quadros = [];
  let k = 0, xAnt = null, tAnt = null;
  for (let t = 0; t <= duracao; t += 1000 / 60) {
    while (k < chegadas.length && chegadas[k].chega <= t) {
      const c = chegadas[k++];
      IR.receber(it, semRelogio ? null : c.tRem, c.chega, c.x, 0, 0, 0);
    }
    if (!IR.amostrar(it, t, out)) continue;
    if (xAnt !== null) {
      const dt = (t - tAnt) / 1000;
      const tVerdadeiro = out.x / v * 1000;   // a posição desenhada corresponde a que instante?
      quadros.push({ t, x: out.x, vel: (out.x - xAnt) / dt, atraso: t - tVerdadeiro });
    }
    xAnt = out.x; tAnt = t;
  }
  return quadros.filter(q => q.t > 1500);       // depois de assentar
}
const fracaoFora = (qs, v, banda) => qs.filter(q => Math.abs(q.vel - v) > banda * v).length / qs.length;
const media = a => a.reduce((s, x) => s + x, 0) / a.length;

describe('Interpolação de snapshots — o boneco anda na velocidade em que o outro anda', () => {
  it('10 Hz com ±30 ms de tremor: ≥ 99 % dos quadros a ±10 % da velocidade real', () => {
    const qs = simular({});
    const fora = fracaoFora(qs, 6, 0.10);
    assert.ok(fora <= 0.01, `${(fora * 100).toFixed(1)} % dos quadros fora de ±10 %`);
  });

  it('o atraso desenhado fica entre a latência e latência + 250 ms', () => {
    const qs = simular({});
    const a = media(qs.map(q => q.atraso));
    assert.ok(a >= 70 && a <= 70 + 250, `atraso médio ${a.toFixed(0)} ms`);
  });

  it('20 Hz (o br-game.js): liso, e o boneco fica ≥ 40 ms mais atual que a 10 Hz', () => {
    const q10 = simular({}), q20 = simular({ intervalo: 50 });
    const fora = fracaoFora(q20, 6, 0.10);
    assert.ok(fora <= 0.01, `${(fora * 100).toFixed(1)} % dos quadros fora de ±10 % a 20 Hz`);
    const a10 = media(q10.map(q => q.atraso)), a20 = media(q20.map(q => q.atraso));
    assert.ok(a10 - a20 >= 40, `atraso médio ${a10.toFixed(0)} ms a 10 Hz, ${a20.toFixed(0)} ms a 20 Hz`);
  });

  it('nunca anda para trás', () => {
    const qs = simular({ tremor: 60 });
    const re = qs.filter(q => q.vel < -1e-6);
    assert.equal(re.length, 0, `${re.length} quadros andando para trás`);
  });

  it('1 pacote perdido em cada 7: segue liso (extrapola a linha reta)', () => {
    const qs = simular({ perde: i => i % 7 === 3 });
    const fora = fracaoFora(qs, 6, 0.10);
    assert.ok(fora <= 0.02, `${(fora * 100).toFixed(1)} % fora de ±10 %`);
  });

  it('rede parada 1 s: segura perto do último pacote (não voa) e volta ao atraso normal', () => {
    // pacotes 40..49 somem: o último antes do buraco é o 39 (x = 23,4 m, enviado em 3,9 s)
    const qs = simular({ perde: i => i >= 40 && i < 50 });
    const noBuraco = qs.filter(q => q.t > 4100 && q.t < 5000);
    const longe = Math.max(...noBuraco.map(q => q.x));
    // extrapolação com teto: no máx. ~150 ms além do último pacote
    assert.ok(longe <= 23.4 + 6 * 0.15, `foi até x=${longe.toFixed(2)} sem pacote nenhum`);
    // e, 300 ms depois do 1º pacote novo, desenha de novo com o atraso de sempre
    const depois = qs.filter(q => q.t > 5000 + 70 + 300);
    const fora = depois.filter(q => q.atraso < 70 || q.atraso > 70 + 250);
    assert.equal(fora.length, 0, `${fora.length} quadros fora do atraso normal depois da volta`);
  });

  it('sem relógio do remetente (servidor/bot antigo): ainda sem degrau de 10 Hz', () => {
    const qs = simular({ semRelogio: true, tremor: 5 });
    const fora = fracaoFora(qs, 6, 0.25);
    assert.ok(fora <= 0.05, `${(fora * 100).toFixed(1)} % fora de ±25 %`);
  });

  it('o lerp antigo (perseguir o último pacote) falha a mesma régua — a régua discrimina', () => {
    // espelho do br-game.js antigo: k = 1 − e^(−12·dt) atrás do último pacote
    const rnd = lcg(7); let alvo = 0, x = 0, xAnt = null; const qs = [];
    const chegadas = [];
    for (let ts = 0; ts <= 8000; ts += 100) chegadas.push({ chega: ts + 70 + (rnd() * 2 - 1) * 30, x: 6 * ts / 1000 });
    chegadas.sort((a, b) => a.chega - b.chega);
    let k = 0;
    for (let t = 0; t <= 8000; t += 1000 / 60) {
      while (k < chegadas.length && chegadas[k].chega <= t) alvo = chegadas[k++].x;
      x += (alvo - x) * (1 - Math.exp(-12 / 60));
      if (xAnt !== null && t > 1500) qs.push({ vel: (x - xAnt) * 60 });
      xAnt = x;
    }
    assert.ok(fracaoFora(qs, 6, 0.10) > 0.30, 'a régua não separaria o defeito antigo');
  });
});

describe('Interpolação de snapshots — casos de borda', () => {
  it('teleporte (> 25 m entre pacotes): encaixa, não desliza pelo mapa', () => {
    const it2 = IR.criarInterpolador();
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    for (let i = 0; i < 10; i++) IR.receber(it2, i * 100, i * 100 + 50, 0, 0, 0, 0);
    IR.receber(it2, 1000, 1050, 500, 0, 0, 0);      // pousou longe / respawn
    IR.receber(it2, 1100, 1150, 500.6, 0, 0, 0);
    IR.amostrar(it2, 1160, out);
    assert.ok(out.x === 0 || out.x >= 499, `desenhado em x=${out.x.toFixed(1)} (deslizando entre 0 e 500)`);
    IR.amostrar(it2, 1500, out);
    assert.ok(out.x >= 499, `depois do teleporte ainda em x=${out.x.toFixed(1)}`);
  });

  it('relógio do remetente volta para trás (recarregou a página): recomeça, não congela', () => {
    const it2 = IR.criarInterpolador();
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    for (let i = 0; i < 10; i++) IR.receber(it2, 900000 + i * 100, i * 100, i * 0.6, 0, 0, 0);
    for (let i = 0; i < 10; i++) IR.receber(it2, 50 + i * 100, 2000 + i * 100, 10 + i * 0.6, 0, 0, 0);
    IR.amostrar(it2, 3200, out);
    assert.ok(out.x > 14, `congelou em x=${out.x.toFixed(2)}`);
  });

  it('pacote atrasado que chega depois de um mais novo é ignorado', () => {
    const it2 = IR.criarInterpolador();
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    IR.receber(it2, 0, 50, 0, 0, 0, 0);
    IR.receber(it2, 200, 250, 2, 0, 0, 0);
    IR.receber(it2, 100, 260, 99, 0, 0, 0);          // fora de ordem e absurdo
    IR.amostrar(it2, 300, out);
    assert.ok(out.x <= 2 + 1e-9, `x=${out.x}`);
  });

  it('rumo: interpola pelo menor arco (179° → −179° não dá a volta inteira)', () => {
    const it2 = IR.criarInterpolador();
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    const a = 179 * Math.PI / 180, b = -179 * Math.PI / 180;
    IR.receber(it2, 0, 50, 0, 0, 0, a);
    IR.receber(it2, 100, 150, 0, 0, 0, b);
    IR.receber(it2, 200, 250, 0, 0, 0, b);
    for (let t = 150; t <= 300; t += 5) {
      IR.amostrar(it2, t, out);
      const d = Math.abs(Math.atan2(Math.sin(out.yaw - Math.PI), Math.cos(out.yaw - Math.PI)));
      assert.ok(d <= 2 * Math.PI / 180 + 1e-9, `rumo passou por ${(out.yaw * 180 / Math.PI).toFixed(1)}°`);
    }
  });

  it('relógio forjado (t do futuro, pulando): o atraso tem teto', () => {
    const it2 = IR.criarInterpolador();
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    const rnd = lcg(3);
    for (let i = 0; i < 60; i++) IR.receber(it2, i * 100 + rnd() * 900, i * 100, i * 0.6, 0, 0, 0);
    for (let t = 5000; t < 6000; t += 16) IR.amostrar(it2, t, out);
    assert.ok(it2.atraso <= IR.INTERP.ATRASO_MAX_MS, `atraso ${it2.atraso} ms`);
  });
});

/* o relógio do remetente atravessa o servidor */
describe('Servidor — repassa o relógio do remetente no playerUpdate', () => {
  it('`t` finito vai junto; lixo não vai', async t => {
    const rank = path.join(os.tmpdir(), `fps-interp-rank-${process.pid}-${Date.now()}.json`);
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: '0', HOST_CODE: 'QA123', COUNTDOWN_S: '1', NEXT_IN_S: '60', RANK_FILE: rank },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    t.after(() => { proc.kill(); fs.rmSync(rank, { force: true }); });
    proc.stderr.resume();
    const port = await new Promise((res, rej) => {
      let log = '';
      const to = setTimeout(() => rej(new Error('servidor não subiu')), 5000);
      proc.stdout.on('data', d => {
        log += d;
        const m = /no ar em http:\/\/localhost:(\d+)/.exec(log);
        if (m) { clearTimeout(to); res(+m[1]); }
      });
    });
    const conectar = () => new Promise(res => {
      const s = io(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
      s.once('init', () => res(s));
    });
    const a = await conectar(), b = await conectar();
    t.after(() => { a.close(); b.close(); });
    const recebidos = [];
    b.on('playerUpdate', d => recebidos.push(d));
    // espaçados: dois voláteis seguidos para o mesmo destino, o socket.io descarta o 2º
    for (const tt of [12345.6, 'x', Infinity]) {
      a.emit('state', { pos: [1, 2, 3], rotY: 0, t: tt });
      await new Promise(r => setTimeout(r, 150));
    }
    const fim = Date.now() + 2000;
    while (recebidos.length < 3 && Date.now() < fim) await new Promise(r => setTimeout(r, 20));
    assert.equal(recebidos.length, 3);
    assert.equal(recebidos[0].t, 12345.6);
    assert.equal(recebidos[1].t, undefined);
    assert.equal(recebidos[2].t, undefined);
  });
});
