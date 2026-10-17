/* ================================================================
   O BONECO DOS OUTROS ANDA LISO (auditoria MP 338d153, MQ-6) — no jogo
   de verdade: a página observa um jogador remoto que anda em linha reta
   a 6 m/s mandando `state` a 10 Hz, com a chegada tremida em até 60 ms
   (o relógio do envio vai no pacote, como o br-game.js faz). A medida é
   a velocidade DESENHADA do boneco (group.position), quadro a quadro,
   contra os 6 m/s verdadeiros — não o que o interpolador diz de si.
   Antes: 19,9 % dos quadros fora de ±50 %.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');

const PORT = 3690;
const sleep = ms => new Promise(r => setTimeout(r, ms));

describe('Boneco remoto — velocidade desenhada = velocidade de quem anda',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, host;
    before(async () => {
      h = await bootGame({ port: PORT, extraEnv: { COUNTDOWN_S: '1', NEXT_IN_S: '300' } });
      host = await startBRMatch(h, { serverPort: PORT });
    });
    after(async () => {
      if (host) host.close();
      if (h) await h.close();
    });

    it('6 m/s a 10 Hz com tremor de 0–60 ms: ≥ 95 % dos quadros a ±15 %', async () => {
      const V = 6, DUR = 7000;
      const p0 = await h.play(() => window.QA.MP.player.pos.toArray());
      const x0 = p0[0] + 20, z0 = p0[2] + 10;
      const y = await h.play((x, z) => window.QA.MP.heightAt(x, z), x0, z0);
      // começa parado no ponto: o anti-teleporte do servidor aceita o resto
      host.emit('state', { pos: [x0, y, z0], rotY: 0, heldWeapon: 'FACA', fall: false, ship: false });
      await sleep(400);

      /* amostra no instante em que o LAÇO DO JOGO termina de desenhar o remoto
         (`rp.lastPos.copy`, igual no código antigo e no novo): posição e relógio
         do mesmo quadro. Um rAF próprio podia cair antes ou depois do brTick no
         quadro e medir posição de um quadro com o tempo de outro (2× de erro com
         quadro irregular). Observa, não dirige: a cópia segue igual. */
      const amostras = h.play((id, dur) => new Promise(res => {
        const out = [];
        const rp = window.__BR_debug.remotes.get(id);
        if (!rp) return res(out);
        const copiar = rp.lastPos.copy.bind(rp.lastPos);
        rp.lastPos.copy = v => { out.push([performance.now(), v.x]); return copiar(v); };
        setTimeout(() => { delete rp.lastPos.copy; res(out); }, dur);
      }), host.id, DUR + 500);

      // o remetente: relógio de envio a cada 100 ms; a chegada treme 0–60 ms
      let seed = 12345;
      const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      const inicio = Date.now();
      const envios = [];
      for (let k = 1; k * 100 <= DUR; k++) {
        const tEnvio = k * 100;
        envios.push(new Promise(res => setTimeout(() => {
          host.emit('state', {
            pos: [x0 + V * tEnvio / 1000, y, z0], rotY: 0, heldWeapon: 'FACA', fall: false, ship: false,
            t: 1e6 + tEnvio,
          });
          res();
        }, Math.max(0, inicio + tEnvio + rnd() * 60 - Date.now()))));
      }
      await Promise.all(envios);
      const qs = await amostras;

      const vels = [];
      for (let i = 1; i < qs.length; i++) {
        const dt = (qs[i][0] - qs[i - 1][0]) / 1000;
        if (dt <= 0) continue;
        vels.push({ t: qs[i][0] - qs[0][0], v: (qs[i][1] - qs[i - 1][1]) / dt });
      }
      // depois de assentar e antes de o remetente parar
      const meio = vels.filter(q => q.t > 1500 && q.t < DUR - 300);
      assert.ok(meio.length > 100, `só ${meio.length} quadros medidos`);
      const fora = meio.filter(q => Math.abs(q.v - V) > 0.15 * V);
      const frac = fora.length / meio.length;
      assert.ok(frac <= 0.05,
        `${(frac * 100).toFixed(1)} % dos quadros fora de ±15 % (ex.: ${fora.slice(0, 6).map(q => q.v.toFixed(1)).join(', ')} m/s)`);
    });
  });
