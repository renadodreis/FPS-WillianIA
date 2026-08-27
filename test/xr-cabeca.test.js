/* ================================================================
   QA — A6: NADA ALÉM DO PESCOÇO DO JOGADOR MOVE A VISTA.

   O invariante nº 1 do CLAUDE.md: em XR o grafo é `scene > xrRig > camera`,
   o jogo move o RIG (nos pés) e o HEADSET move a câmera. Dois arquivos
   sobreviveram quatro rodadas de validação violando isso porque nenhum
   construtor teve eles na posse (todos ficaram dentro de `js/xr/`):

     - `city-destruction-client.js` escreve `camera.fov`, `.position` e
       `.quaternion` na cinemática da destruição da cidade, e esconde
       `camera.children` POR ÍNDICE — em XR a vinheta de conforto
       (`xrComfort`) e o corpo em primeira pessoa são filhos da câmera.
       `grep presenting` nesse arquivo devolvia ZERO.
     - `br-game.js` pilotava queda livre, paraquedas e espectador por
       `MP.camera.getWorldDirection`, que carrega o PITCH da cabeça — e em XR
       o pitch da cabeça é livre, inclusive além da vertical.

   COMO ESTE ARQUIVO MEDE, E POR QUE ASSIM:

   - Sessão `immersive-vr` DE VERDADE (IWER, o runtime de emulação WebXR que
     a Meta publica). Dublê escrito à mão tem a forma que quem escreveu
     imaginou; aqui o teste aciona o mesmo objeto que o navegador entregaria.

   - A pose da câmera em XR é escrita pelo three DENTRO de `render()`
     (`WebXRManager.updateUserCamera`, que copia a matriz do `cameraXR` e a
     decompõe em position/quaternion). Amostrar ANTES do render mede o que o
     JOGO deixou na câmera; DEPOIS mede o que foi para a TELA. Este arquivo
     mede os dois, envolvendo o call site real de cada modo — `renderer.render`
     em XR e `composer.render` no monitor (game.js, `renderFrame`), nunca um
     dublê ao lado deles. (Medido: fora de XR `renderer.render` não é chamado
     nenhuma vez — só o composer. Sonda instalada só no renderer grava zero
     frames no monitor e "passa" sem medir nada.)

   - A medida da imposição é a VARIAÇÃO da pose com o headset PARADO. Valor
     absoluto dependeria do offset do reference space; variação não depende de
     nada: headset parado e rig parado ⇒ toda mudança veio do jogo.

   - Para a deriva do paraquedas a medida é o RUMO REAL: o deslocamento que
     sobrou em `player.pos` entre dois frames. Ler o vetor que o próprio código
     de deriva usou seria comparar uma reta com ela mesma, e o teste não
     poderia falhar.

   PORTAS 3620–3628 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame, startBRMatch } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const GRAU = Math.PI / 180;

/* ---------------- sonda de câmera (injetada na página) ---------------- */
function instalarSondaCamera() {
  const MP = window.__MP;
  const dev = window.__xrEmulado || null;
  const S = { gravando: false, antes: [], depois: [] };
  window.__CAB = S;
  const cap = cam => ({
    lp: [cam.position.x, cam.position.y, cam.position.z],
    lq: [cam.quaternion.x, cam.quaternion.y, cam.quaternion.z, cam.quaternion.w],
    mw: Array.from(cam.matrixWorld.elements),
    fov: cam.fov,
    p11: cam.projectionMatrix.elements[5],
    hp: dev ? [dev.position.x, dev.position.y, dev.position.z] : null,
    hq: dev ? [dev.quaternion.x, dev.quaternion.y, dev.quaternion.z, dev.quaternion.w] : null,
  });
  const orig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = function (sc, cam) {
    if (S.gravando && cam && cam.isCamera) S.antes.push(cap(cam));
    orig(sc, cam);
    if (S.gravando && cam && cam.isCamera) S.depois.push(cap(cam));
  };
  if (MP.composer) { // caminho do MONITOR: o composer é quem desenha
    const oc = MP.composer.render.bind(MP.composer);
    MP.composer.render = function (...a) {
      if (S.gravando) S.antes.push(cap(MP.camera));
      const out = oc(...a);
      if (S.gravando) S.depois.push(cap(MP.camera));
      return out;
    };
  }
}

/* ---------------- redução das amostras (roda no Node) ---------------- */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angQ = (a, b) => {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
};
const eixo = (mw, i) => [mw[i], mw[i + 1], mw[i + 2]];
const angV = (a, b) => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n < 1e-9 ? 0 : Math.acos(Math.max(-1, Math.min(1, d / n)));
};
const difAng = (a, b) => { const d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };

function variacao(lista) {
  if (!lista.length) return { n: 0, pos: NaN, ang: NaN };
  const p0 = lista[0].lp, q0 = lista[0].lq;
  let mp = 0, ma = 0;
  for (const a of lista) { mp = Math.max(mp, dist(a.lp, p0)); ma = Math.max(ma, angQ(a.lq, q0)); }
  return { n: lista.length, pos: mp, ang: ma };
}
function variacaoMundo(lista) {
  if (!lista.length) return { n: 0, pos: NaN, ang: NaN };
  const p0 = eixo(lista[0].mw, 12), f0 = eixo(lista[0].mw, 8), u0 = eixo(lista[0].mw, 4);
  let mp = 0, ma = 0;
  for (const a of lista) {
    mp = Math.max(mp, dist(eixo(a.mw, 12), p0));
    ma = Math.max(ma, Math.max(angV(eixo(a.mw, 8), f0), angV(eixo(a.mw, 4), u0)));
  }
  return { n: lista.length, pos: mp, ang: ma };
}
/* maior salto da posição de MUNDO entre dois frames CONSECUTIVOS — pega
   teleporte que a variação total esconde (ex.: sair da cinemática com o rig
   reassumindo de uma vez) */
function saltoMundo(lista) {
  let m = 0;
  for (let i = 1; i < lista.length; i++)
    m = Math.max(m, dist(eixo(lista[i].mw, 12), eixo(lista[i - 1].mw, 12)));
  return m;
}
const varia = (lista, f) => {
  if (!lista.length) return NaN;
  let lo = Infinity, hi = -Infinity;
  for (const a of lista) { const v = f(a); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return hi - lo;
};

/* Dispara o evento da cidade com tempos curtos e ESPERA a cinemática ligar.

   Os timestamps do evento são lidos pelo relógio COMPENSADO do servidor
   (`Date.now() + clockOffset + halfRtt`), e nos testes o offset chega a passar
   de −1,6 s: entre o `sync` e a cinemática ligar de fato há segundos. Quem
   voltar aqui: o `await` do fim não é enfeite — sem ele esta função devolvia
   uma Promise truthy, o teste seguia na hora e media a cena antes de o evento
   existir. */
function receitaEvento(id) {
  return `(async () => {
    const MP = window.__MP;
    const t0 = Date.now();
    window.__CityDestruction.sync({ eventId: '${id}', seed: 424242, state: 'intact',
      cinematicStartedAt: t0 + 500, impactAt: t0 + 4000 });
    const lim = performance.now() + 20000;
    while (MP.state.cinematic !== true && performance.now() < lim)
      await new Promise(r => setTimeout(r, 50));
    return MP.state.cinematic === true;
  })()`;
}

/* ================================================================
   1 · A CINEMÁTICA DA CIDADE DENTRO DO HEADSET
   ================================================================ */
describe('A6 · cinemática da destruição da cidade em sessão imersiva',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3620 });
      await h.page.evaluate(instalarSondaCamera);
    });
    after(async () => { if (h) await h.close(); });

    it('dada a cinemática rodando com o headset PARADO, então o jogo não impõe ' +
      'deslocamento, rotação nem FOV à câmera — e o evento acontece assim mesmo',
    async () => {
      const ligou = await h.page.evaluate(receitaEvento('xr-cinema-1'));
      assert.ok(ligou, 'a cinemática nunca ligou dentro da sessão');
      const r = await h.page.evaluate(async () => {
        const G = window.__game, MP = window.__MP, S = window.__CAB;
        const espera = async (cond, ms) => {
          const t0 = performance.now();
          while (!cond() && performance.now() - t0 < ms)
            await new Promise(r2 => setTimeout(r2, 50));
          return cond();
        };
        const filhos = () => MP.camera.children.map(c => `${c.name || c.type}:${c.visible}`);
        const antesFilhos = filhos();
        S.antes = []; S.depois = []; S.gravando = true;
        const grp = MP.scene.getObjectByName('cityMissiles');
        const pos0 = grp ? grp.children.slice(0, 4).map(m => m.position.toArray()) : null;
        await new Promise(r2 => setTimeout(r2, 1500));
        const pos1 = grp ? grp.children.slice(0, 4).map(m => m.position.toArray()) : null;
        const duranteFilhos = filhos();
        const destruiu = await espera(() => G.Structures.city.getState() === 'destroyed', 14000);
        const desligou = await espera(() => MP.state.cinematic === false, 20000);
        // segue gravando 1 s DEPOIS do fim: a saída da cinemática é onde um rig
        // que ficou parado 12 s reassumiria de uma vez, e isso é teleporte
        await new Promise(r2 => setTimeout(r2, 1000));
        S.gravando = false;
        return { destruiu, desligou, presenting: G.XR.presenting,
          temGrupo: !!grp, pos0, pos1,
          nomesCena: grp ? null : MP.scene.children.map(c => c.name).filter(Boolean),
          antesFilhos, duranteFilhos, depoisFilhos: filhos(),
          antes: S.antes, depois: S.depois };
      });

      assert.equal(r.presenting, true, 'a sessão imersiva caiu no meio do teste');
      assert.ok(r.destruiu, 'a cidade não foi destruída em XR (mecânica do servidor bloqueada)');
      assert.ok(r.desligou, 'a cinemática não terminou em XR');
      assert.ok(r.antes.length > 30, `poucas amostras de frame (${r.antes.length})`);

      const imposto = variacao(r.antes);                 // o que o JOGO deixou
      const impostoFov = varia(r.antes, a => a.fov);
      const tela = variacaoMundo(r.depois);              // o que foi pra TELA
      const telaFov = varia(r.depois, a => a.p11);
      const salto = saltoMundo(r.depois);                // teleporte entre frames
      console.log('[A6/cinemática XR] imposto pelo jogo: pos %s m · ang %s ° · fov %s | ' +
        'tela: pos %s m · ang %s ° · proj %s · maior salto entre frames %s m | %d frames',
      imposto.pos.toFixed(4), (imposto.ang / GRAU).toFixed(3), impostoFov.toFixed(3),
      tela.pos.toFixed(4), (tela.ang / GRAU).toFixed(3), telaFov.toFixed(5),
      salto.toFixed(4), r.antes.length);

      assert.ok(imposto.pos <= 0.001,
        `a cinemática empurrou a câmera ${imposto.pos.toFixed(3)} m em XR`);
      assert.ok(imposto.ang <= 0.001,
        `a cinemática girou a câmera ${(imposto.ang / GRAU).toFixed(2)}° em XR`);
      assert.ok(impostoFov <= 0.001,
        `a cinemática mexeu no FOV da câmera em XR (${impostoFov.toFixed(2)}°)`);
      assert.ok(tela.pos <= 0.001,
        `a tela mostrou a câmera andando ${tela.pos.toFixed(3)} m com o headset parado`);
      assert.ok(tela.ang <= 0.001,
        `a tela mostrou a câmera girando ${(tela.ang / GRAU).toFixed(2)}° com o headset parado`);
      assert.ok(salto <= 0.05,
        `a vista deu um salto de ${salto.toFixed(2)} m num frame só (entrada ou saída da cinemática)`);

      // os projéteis continuam existindo e VOANDO (invariante do projeto)
      assert.ok(r.temGrupo,
        `o grupo de mísseis não está na cena em XR (cena: ${(r.nomesCena || []).join(' ')})`);
      const andou = r.pos0.reduce((m, p, i) => Math.max(m, dist(p, r.pos1[i])), 0);
      console.log('[A6/cinemática XR] mísseis andaram %s m em 1,5 s · filhos da câmera: %s',
        andou.toFixed(1), r.antesFilhos.join(' '));
      assert.ok(andou > 5, `os mísseis não voaram em XR (máx ${andou.toFixed(2)} m)`);

      // os filhos da câmera (a vinheta de conforto mora aqui em XR)
      assert.ok(r.antesFilhos.length > 0,
        'pré-condição falhou: a câmera não tem filhos em XR, o teste ficaria vazio');
      assert.deepEqual(r.duranteFilhos, r.antesFilhos,
        'a cinemática escondeu filhos da câmera em XR (a vinheta de conforto é um deles)');
      assert.deepEqual(r.depoisFilhos, r.antesFilhos,
        'a cinemática devolveu os filhos da câmera trocados em XR');
    });

    /* Passeia com o headset por quatro poses e devolve, para cada uma, a pose
       de MUNDO da câmera depois do render. Roda igual dentro e fora do evento. */
    async function passeioDaCabeca() {
      return h.page.evaluate(async () => {
        const S = window.__CAB, dev = window.__xrEmulado;
        S.antes = []; S.depois = []; S.gravando = true;
        const y0 = dev.position.y;
        const passos = [];
        for (const [x, y, z, gr] of [[0, 0, 0, 0], [0.2, 0.05, -0.1, 15],
          [0.4, 0, -0.25, 35], [0, 0, 0, 0]]) {
          dev.position.set(x, y0 + y, z);
          dev.quaternion.set(0, Math.sin(gr * Math.PI / 360), 0, Math.cos(gr * Math.PI / 360));
          await new Promise(r2 => setTimeout(r2, 350));
          const u = S.depois[S.depois.length - 1];
          passos.push(u ? { mw: u.mw, hp: u.hp, hq: u.hq } : null);
        }
        S.gravando = false;
        return passos;
      });
    }
    /* resposta da vista a cada passo do headset, em módulo — invariante a
       referencial (rotação preserva distância e ângulo) */
    function resposta(passos) {
      const out = [];
      for (let i = 1; i < passos.length; i++) {
        const a = passos[i - 1], b = passos[i];
        assert.ok(a && b && a.mw && a.hp, 'sonda sem amostra depois do render');
        out.push({
          pedidoP: dist(b.hp, a.hp), obtidoP: dist(eixo(b.mw, 12), eixo(a.mw, 12)),
          pedidoA: angQ(b.hq, a.hq), obtidoA: angV(eixo(b.mw, 8), eixo(a.mw, 8)),
        });
      }
      return out;
    }

    it('dada a cinemática rodando, então girar a cabeça gira a vista igualzinho e o ' +
      'passo físico não encolhe (cutscene não pode congelar o rastreamento)', async () => {
      /* A referência é o próprio jogo FORA do evento, não um ideal: quem
         responde pelo passo físico é `js/xr/xrrig.js`, e este arquivo só pode
         cobrar que a cinemática não piore o que já existe. A rotação, essa,
         é cobrada em absoluto — girar a cabeça é o que não pode falhar. */
      const fora = resposta(await passeioDaCabeca());
      const ligou = await h.page.evaluate(receitaEvento('xr-cinema-2'));
      assert.ok(ligou, 'a cinemática nunca ligou (segunda rodada)');
      const dentro = resposta(await passeioDaCabeca());
      const desligou = await h.page.evaluate(`(async () => {
        const t0 = performance.now();
        while (window.__MP.state.cinematic && performance.now() - t0 < 20000)
          await new Promise(r => setTimeout(r, 50));
        return window.__MP.state.cinematic === false;
      })()`);

      let difA = 0, pedidoP = 0, pedidoA = 0, erroRot = 0, foraP = 0, dentroP = 0, pior = 0;
      for (let i = 0; i < dentro.length; i++) {
        pedidoP = Math.max(pedidoP, dentro[i].pedidoP);
        pedidoA = Math.max(pedidoA, dentro[i].pedidoA);
        foraP = Math.max(foraP, fora[i].obtidoP);
        dentroP = Math.max(dentroP, dentro[i].obtidoP);
        pior = Math.max(pior, fora[i].obtidoP - dentro[i].obtidoP); // quanto a cinemática TIROU
        difA = Math.max(difA, Math.abs(dentro[i].obtidoA - fora[i].obtidoA));
        erroRot = Math.max(erroRot, Math.abs(dentro[i].obtidoA - dentro[i].pedidoA));
      }
      console.log('[A6/cinemática XR] cabeça em movimento (pedido até %s m / %s °): ' +
        'passo que chegou à vista %s m fora ↔ %s m dentro da cinemática | rotação: ' +
        'diferença dentro↔fora %s ° · erro absoluto %s °',
      pedidoP.toFixed(3), (pedidoA / GRAU).toFixed(1), foraP.toFixed(3), dentroP.toFixed(3),
      (difA / GRAU).toFixed(4), (erroRot / GRAU).toFixed(4));
      assert.ok(pedidoP > 0.15 && pedidoA > 10 * GRAU,
        'pré-condição falhou: o headset mal se mexeu, o teste ficaria vazio');
      /* O passo FÍSICO tem outro dono (`js/xr/xrrig.js`, que gruda a cabeça no
         colisor): fora da cinemática ele chega à vista em 0,000 m nesta base.
         O que este arquivo pode cobrar é que a cinemática não ENCOLHA o que
         chega — congelar a vista durante a cutscene é exatamente o que a Meta
         desaconselha em `design/head`. */
      assert.ok(pior <= 0.002,
        `a cinemática encolheu em ${pior.toFixed(3)} m o passo da cabeça que chega à vista`);
      assert.ok(difA <= 0.2 * GRAU,
        `a cinemática mudou a resposta da vista ao GIRO da cabeça em ${(difA / GRAU).toFixed(2)}°`);
      assert.ok(erroRot <= 1 * GRAU,
        `girar a cabeça não girou a vista durante a cinemática (erro ${(erroRot / GRAU).toFixed(2)}°)`);
      assert.ok(desligou, 'a cinemática não terminou (segunda rodada)');
    });
  });

/* ================================================================
   2 · QUEDA LIVRE / PARAQUEDAS / ESPECTADOR DENTRO DO HEADSET

   A fase FALL é escrita à mão porque `jumpFromShip` exige a nave e o
   `startBRMatch` (o único que deixa um adversário VIVO na sala, sem o qual o
   teste do espectador cairia no ramo "ninguém pra assistir" e passaria vazio)
   já pula a nave. O que está sob teste é `fallStep`, e ele continua sendo
   chamado pelo caminho real do `brTick`.
   ================================================================ */
describe('A6 · queda livre, paraquedas e espectador em sessão imersiva',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, bot;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3622 });
      bot = await startBRMatch(h, { hostCode: 'QUEDALIVRE' });
    });
    after(async () => { if (bot) bot.close(); if (h) await h.close(); });

    /* Mede o RUMO REAL: o deslocamento horizontal que sobrou em player.pos. */
    async function rumoEmQueda(pitchGraus, jitterGraus, yawGraus) {
      return h.page.evaluate(async (pitch, jitter, yaw) => {
        const MP = window.__MP, dev = window.__xrEmulado, D = window.__BR_debug, T = MP.THREE;
        D.S.phase = 'FALL'; D.S.chuteOpen = false;
        window.__BR_freeze = true;              // queda: o playerUpdate global fica fora
        MP.player.pos.set(0, 400, 0);
        MP.player.vel.set(0, 0, 0);
        const poseCabeca = g => {
          const q = new T.Quaternion().setFromEuler(new T.Euler(
            (pitch + g) * Math.PI / 180, yaw * Math.PI / 180, 0, 'YXZ'));
          dev.quaternion.set(q.x, q.y, q.z, q.w);
        };
        poseCabeca(0);
        window.__A.stick('left', 0, -1); // analógico pra frente = a MESMA KeyW do teclado
        await new Promise(r => setTimeout(r, 250));
        const rumos = [];
        let ant = [MP.player.pos.x, MP.player.pos.z], andou = 0;
        for (let i = 0; i < 24; i++) {
          poseCabeca(((i % 2) ? 1 : -1) * jitter); // tremor humano da cabeça
          await new Promise(r => setTimeout(r, 90));
          const cur = [MP.player.pos.x, MP.player.pos.z];
          const dx = cur[0] - ant[0], dz = cur[1] - ant[1];
          const d = Math.hypot(dx, dz);
          andou += d;
          if (d > 0.02) rumos.push(Math.atan2(-dx, -dz)); // convenção do jogo: frente = (−sin y, −cos y)
          ant = cur;
        }
        window.__A.solta();
        const T2 = MP.THREE;
        const yawLocal = new T2.Euler().setFromQuaternion(MP.camera.quaternion, 'YXZ').y;
        return { rumos, andou, yawVista: window.__game.yawDaVista(), yawLocal,
          yawRig: MP.camera.parent ? MP.camera.parent.rotation.y : 0,
          fase: D.S.phase, chute: D.S.chuteOpen, y: MP.player.pos.y };
      }, pitchGraus, jitterGraus, yawGraus);
    }

    /* Gira o RIG pelo analógico direito — o caminho real do giro artificial. */
    async function girarRig(segundos) {
      return h.page.evaluate(async s => {
        window.__A.stick('right', 1, 0);
        await new Promise(r => setTimeout(r, s * 1000));
        window.__A.solta();
        await new Promise(r => setTimeout(r, 300));
        return window.__MP.camera.parent ? window.__MP.camera.parent.rotation.y : 0;
      }, segundos);
    }

    it('dada queda livre com a cabeça apontada EXATAMENTE para o chão (o ponto de ' +
      'pouso), então o paraquedas continua respondendo ao analógico', async () => {
      const r = await rumoEmQueda(-90, 0, 0);
      console.log('[A6/queda XR] cabeça a −90,0° (nadir exato): andou %s m em ~2,2 s · ' +
        '%d amostras de rumo', r.andou.toFixed(2), r.rumos.length);
      assert.equal(r.fase, 'FALL', 'saiu da queda no meio da medição');
      assert.ok(r.andou > 8,
        `olhando reto para baixo o jogador ficou preso no ar: derivou só ${r.andou.toFixed(2)} m`);
    });

    it('dada queda livre com a cabeça ALÉM da vertical (jogador deitado olhando ' +
      'para trás), então a deriva não inverte', async () => {
      const r = await rumoEmQueda(-100, 0, 0);
      assert.ok(r.rumos.length >= 8, `o jogador não derivou (${r.rumos.length} amostras)`);
      const erro = difAng(r.rumos[r.rumos.length - 1], r.yawVista);
      console.log('[A6/queda XR] cabeça a −100° (além do nadir): erro do rumo contra a ' +
        'vista %s ° · andou %s m', (erro / GRAU).toFixed(2), r.andou.toFixed(2));
      assert.ok(erro <= 5 * GRAU,
        `a deriva saiu ${(erro / GRAU).toFixed(1)}° fora da vista do jogador`);
    });

    it('dada queda livre com a cabeça quase no nadir e o tremor humano, então o rumo ' +
      'é estável', async () => {
      const r = await rumoEmQueda(-89.5, 0.25, 0);
      assert.ok(r.rumos.length >= 8, `o jogador não derivou (${r.rumos.length} amostras)`);
      let pior = 0;
      for (let i = 1; i < r.rumos.length; i++) pior = Math.max(pior, difAng(r.rumos[i], r.rumos[i - 1]));
      console.log('[A6/queda XR] cabeça a −89,5° com tremor de ±0,25°: oscilação do rumo %s °',
        (pior / GRAU).toFixed(2));
      assert.ok(pior <= 5 * GRAU,
        `o rumo do paraquedas oscilou ${(pior / GRAU).toFixed(1)}° com a cabeça quase parada`);
    });

    it('dada queda livre com a cabeça virada 120°, então a deriva vai para onde o ' +
      'jogador olha (o caso fácil não pode regredir)', async () => {
      const r = await rumoEmQueda(-8, 0, 120);
      assert.ok(r.rumos.length >= 8, `o jogador não derivou (${r.rumos.length} amostras)`);
      const erro = difAng(r.rumos[r.rumos.length - 1], r.yawVista);
      console.log('[A6/queda XR] cabeça a 120°: erro do rumo contra a vista %s °',
        (erro / GRAU).toFixed(2));
      assert.ok(erro <= 5 * GRAU, `deriva ${(erro / GRAU).toFixed(1)}° fora da vista`);
    });

    it('dado o RIG girado pelo analógico, então a deriva segue a vista de MUNDO e ' +
      'não a pose local da cabeça', async () => {
      /* Este é o caso que separa a fonte única do defeito irmão que já viveu em
         três lugares deste arquivo: com o rig girado, `camera.quaternion` (a
         cabeça RELATIVA ao rig) e o yaw de mundo divergem pelo yaw do rig. A
         pré-condição abaixo é o que impede o teste de passar vazio. */
      const yawRig = await girarRig(1.2);
      const r = await rumoEmQueda(-8, 0, 0);
      assert.ok(r.rumos.length >= 8, `o jogador não derivou (${r.rumos.length} amostras)`);
      const rumo = r.rumos[r.rumos.length - 1];
      const erroMundo = difAng(rumo, r.yawVista);
      const erroLocal = difAng(rumo, r.yawLocal);
      console.log('[A6/queda XR] rig girado a %s ° (analógico): rumo erra %s ° contra a vista ' +
        'de mundo e %s ° contra a pose local da cabeça',
      (r.yawRig / GRAU).toFixed(1), (erroMundo / GRAU).toFixed(2), (erroLocal / GRAU).toFixed(2));
      assert.ok(Math.abs(yawRig) > 20 * GRAU,
        `pré-condição falhou: o analógico não girou o rig (${(yawRig / GRAU).toFixed(1)}°)`);
      assert.ok(difAng(r.yawVista, r.yawLocal) > 20 * GRAU,
        'pré-condição falhou: vista de mundo e pose local coincidem, o teste ficaria vazio');
      assert.ok(erroMundo <= 5 * GRAU,
        `a deriva saiu ${(erroMundo / GRAU).toFixed(1)}° fora da vista de mundo`);
    });

    it('dado o espectador com alvo vivo, então olhar para cima e para baixo NÃO ' +
      'arrasta o jogador (a vista de mundo só anda por comando)', async () => {
      const r = await h.page.evaluate(async () => {
        const MP = window.__MP, dev = window.__xrEmulado, D = window.__BR_debug, T = MP.THREE;
        const alvos = () => (window.__MP_remotePlayers || []).filter(p => p.alive && !p.isBoss);
        const t0 = performance.now();
        while (!alvos().length && performance.now() - t0 < 15000)
          await new Promise(r2 => setTimeout(r2, 200));
        const nAlvos = alvos().length;
        D.spect();
        const pitch = g => {
          const q = new T.Quaternion().setFromEuler(new T.Euler(g * Math.PI / 180, 0, 0, 'YXZ'));
          dev.quaternion.set(q.x, q.y, q.z, q.w);
        };
        pitch(0);
        await new Promise(r2 => setTimeout(r2, 500));
        const p0 = MP.player.pos.toArray();
        let maxD = 0, maxY = 0;
        for (const g of [-60, -30, 0, 30, 60, 0]) {
          pitch(g);
          await new Promise(r2 => setTimeout(r2, 250));
          maxD = Math.max(maxD, Math.hypot(MP.player.pos.x - p0[0], MP.player.pos.z - p0[2]));
          maxY = Math.max(maxY, Math.abs(MP.player.pos.y - p0[1]));
        }
        pitch(0);
        return { maxD, maxY, nAlvos, fase: D.S.phase };
      });
      console.log('[A6/espectador XR] olhar cima/baixo arrastou: %s m no plano · %s m em ' +
        'altura (%d alvo(s) vivo(s))', r.maxD.toFixed(3), r.maxY.toFixed(3), r.nAlvos);
      assert.equal(r.fase, 'SPECT', 'não entrou em espectador');
      assert.ok(r.nAlvos > 0,
        'pré-condição falhou: nenhum alvo vivo — o espectador caiu no ramo que não usa a vista');
      assert.ok(r.maxY <= 0.20,
        `olhar para cima/baixo levantou o espectador ${r.maxY.toFixed(2)} m`);
      assert.ok(r.maxD <= 0.50,
        `olhar para cima/baixo arrastou o espectador ${r.maxD.toFixed(2)} m`);
    });
  });

/* ================================================================
   3 · O MONITOR NÃO REGREDIU (feature anunciada: o passeio de câmera)
   ================================================================ */
describe('A6 · fora de XR a cinemática continua sendo cinemática',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => { h = await bootGame({ port: 3624 }); });
    after(async () => { if (h) await h.close(); });

    it('dado o monitor, então a cinemática sobe a câmera aos céus, muda o FOV, tira o ' +
      'viewmodel de cena e devolve tudo no fim', async () => {
      await h.page.evaluate(instalarSondaCamera);
      const ligou = await h.page.evaluate(receitaEvento('monitor-cinema'));
      assert.ok(ligou, 'a cinemática não ligou no monitor');
      const r = await h.page.evaluate(async () => {
        const G = window.__game, MP = window.__MP, S = window.__CAB;
        const espera = async (cond, ms) => {
          const t0 = performance.now();
          while (!cond() && performance.now() - t0 < ms)
            await new Promise(r2 => setTimeout(r2, 50));
          return cond();
        };
        const camIni = MP.camera.position.toArray();
        S.antes = []; S.depois = []; S.gravando = true;
        /* O viewmodel é medido pelo objeto que ele É (`MP.weaponRoot`), não pela
           lista de filhos da câmera: o corpo em primeira pessoa entra e sai
           dessa lista por conta própria, e comparar listas mediria a corrida
           entre donos em vez da cinemática. */
        let escondeu = false;
        const iv = setInterval(() => { if (!MP.weaponRoot.visible) escondeu = true; }, 60);
        const destruiu = await espera(() => G.Structures.city.getState() === 'destroyed', 14000);
        const desligou = await espera(() => MP.state.cinematic === false, 20000);
        clearInterval(iv);
        S.gravando = false;
        await new Promise(r2 => setTimeout(r2, 600)); // o jogo reassume a arma
        return { destruiu, desligou, escondeu, camIni,
          armaVoltou: MP.weaponRoot.visible,
          camFim: MP.camera.position.toArray(),
          depois: S.depois };
      });
      assert.ok(r.destruiu && r.desligou, 'a cinemática não completou no monitor');
      const passeio = variacaoMundo(r.depois);
      const fov = r.depois.map(a => a.fov);
      const fovMin = Math.min(...fov), fovMax = Math.max(...fov);
      console.log('[A6/monitor] passeio de câmera: %s m · %s ° | FOV %s–%s | %d frames | ' +
        'volta a %s m do ponto de partida',
      passeio.pos.toFixed(1), (passeio.ang / GRAU).toFixed(1), fovMin.toFixed(0),
      fovMax.toFixed(0), r.depois.length, dist(r.camFim, r.camIni).toFixed(3));
      assert.ok(r.depois.length > 30, `poucas amostras no monitor (${r.depois.length})`);
      assert.ok(passeio.pos > 40,
        `o passeio de câmera do monitor sumiu (só ${passeio.pos.toFixed(1)} m)`);
      assert.ok(passeio.ang > 20 * GRAU,
        `a cinemática do monitor parou de girar a câmera (${(passeio.ang / GRAU).toFixed(1)}°)`);
      assert.ok(fovMin <= 53 && fovMax >= 66,
        `o FOV cinematográfico do monitor mudou (${fovMin.toFixed(0)}–${fovMax.toFixed(0)})`);
      assert.ok(r.escondeu, 'o viewmodel não sai mais de cena na cinemática do monitor');
      assert.ok(r.armaVoltou, 'o viewmodel ficou preso invisível depois da cinemática');
      assert.ok(dist(r.camFim, r.camIni) < 1.5,
        `a câmera não voltou pro jogador (${dist(r.camFim, r.camIni).toFixed(2)} m)`);
    });
  });
