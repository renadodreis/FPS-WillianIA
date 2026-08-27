/* ================================================================
   QA — O TIRO SAI ONDE A MIRA APONTA (B3), medido no raio REAL.

   O DEFEITO QUE ESTE ARQUIVO NASCEU PARA PEGAR. A correção do B7 ("o tiro sai
   do cano") moveu a origem do raio da linha de mira para a boca do cano e
   re-mirou o tiro para um ponto de ZERAGEM calculado com `rayBlockedAt` — o
   primeiro obstáculo à frente. Cano e linha de mira não são colineares: a alça
   deste jogo fica de 6 a 20 cm ACIMA do cano (é a "sight height over bore" de
   qualquer arma, só que exagerada — um fuzil real tem ~4 cm). Consequências
   medidas por validação independente:

     · o tiro e a mira só concordam em UMA distância;
     · a 10 m o erro ia de 5,4 a 11,8 cm — uma cabeça humana tem ~16 cm;
     · e a distância de zeragem MUDA A CADA TIRO, porque depende do que está
       na frente. O ponto de impacto anda sozinho entre um tiro e o outro, o
       que torna impossível compensar na mão.

   POR QUE A SUÍTE NÃO PEGOU. `test/xr-weapon.test.js` tem um caso chamado "a
   direção continua alinhada com a mira", e ele asserta `|dir| ≈ 1` (que é
   propriedade de `.normalize()` e não pode falhar) e `dir · frente > 0` — a
   componente AO LONGO do cano. A grandeza que decide é a PERPENDICULAR. Uma
   arma com o cano cinco metros para o lado passa naquele caso.

   O QUE ESTE ARQUIVO MEDE. Dispara de verdade (gatilho do Touch), com spread
   zerado, e mede a distância entre o RAIO DISPARADO e o ponto que a linha de
   mira indica, a 2, 5, 10, 25 e 50 m — para TODAS as armas destravadas. E
   dispara três vezes seguidas para provar que o desvio não anda sozinho.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3552;
const DISTS = [2, 5, 10, 25, 50];
/* Teto: 2 cm. É o que separa "acertei o que estava na mira" de "errei a
   cabeça": uma cabeça tem ~16 cm e um torso ~40 cm, então erro de 5 cm já
   custa acerto em alvo pequeno, e 16 cm custa o alvo inteiro. */
const TETO = 0.02;

async function instalarSondas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  /* Sem spread e com um projétil: o que se quer medir é o EIXO do tiro, e
     dispersão aleatória em cima disso só embaralharia a medição. */
  for (const a of G.arsenal) { a.spread = 0; a.pellets = 1; }

  const vec = a => new T.Vector3().fromArray(a);
  /* distância do ponto ao raio (origem O, direção unitária D) */
  const aoRaio = (P, O, D) => {
    const w = new T.Vector3().subVectors(P, O);
    return w.clone().sub(D.clone().multiplyScalar(w.dot(D))).length();
  };

  window.__MIRA = {
    arma: () => (G.arsenal[G.gunIndex] || {}).name || '?',
    destravadas: () => G.arsenal.filter(a => !a.locked).length,
    async trocar() {
      window.__A.botao('right', 'b-button', 1);
      await window.__A.espera(120);
      window.__A.botao('right', 'b-button', 0);
      await window.__A.espera(320);
    },
    /* UM tiro de verdade e a leitura do que o jogo disparou. Munição é
       reposta na mão para o teste nunca medir um clique que não virou tiro. */
    async tiro() {
      const g = G.arsenal[G.gunIndex];
      if (g) { g.mag = Math.max(g.mag, 5); g.reloading = false; }
      const antes = G.origemDoTiro().join(',');
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(200);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(260);
      const O = vec(G.origemDoTiro()), D = vec(G.direcaoDoTiro());
      /* a linha de mira DO INSTANTE DO TIRO. Ler `G.mira()` agora mediria o
         recuo: numa automática o cano já subiu graus quando a sonda chega. */
      const m = G.miraDoTiro();
      const mO = vec(m.origem), mD = vec(m.direcao).normalize();
      const saiu = G.origemDoTiro().join(',') !== antes || O.lengthSq() > 0;
      const erros = {};
      for (const d of [2, 5, 10, 25, 50]) {
        erros[d] = aoRaio(mO.clone().addScaledVector(mD, d), O, D.clone().normalize());
      }
      return {
        arma: (G.arsenal[G.gunIndex] || {}).name || '?',
        saiu,
        aoCano: O.distanceTo(vec(G.canoMundo())),
        naLinha: aoRaio(O, mO, mD),
        erros,
      };
    },
  };
  return true;
}

describe('o tiro sai onde a mira aponta, em VR (B3)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarSondas);
    await h.play(() => window.__A.espera(700));
  });
  after(async () => { if (h) await h.close(); });

  it('o raio disparado passa pelo ponto que a alça indica — em toda distância', async () => {
    const r = await h.play(async () => {
      const out = [];
      const n = Math.min(window.__MIRA.destravadas(), 4);
      for (let i = 0; i < n; i++) {
        out.push(await window.__MIRA.tiro());
        await window.__MIRA.trocar();
      }
      return out;
    });
    assert.ok(r.length > 0, 'nenhum tiro medido');
    const ruins = [];
    for (const t of r) {
      assert.equal(t.saiu, true, `o gatilho não virou tiro na ${t.arma}`);
      for (const d of DISTS) {
        if (t.erros[d] > TETO) ruins.push(`${t.arma} a ${d} m: ${(t.erros[d] * 100).toFixed(2)} cm`);
      }
    }
    assert.equal(ruins.length, 0,
      `o tiro não passa onde a alça aponta:\n  ${ruins.join('\n  ')}\n(teto ${TETO * 100} cm; erro assim é a diferença entre acertar e errar uma cabeça de 16 cm)`);
  });

  /* ESTE CASO NÃO É UM ACEITE: É O REGISTRO DE UM CONFLITO GEOMÉTRICO.
     O critério B7 cobra a origem do raio a ≤ 5 cm da boca do cano. O B3 cobra
     o tiro passando pelo ponto que a alça indica. Enquanto a alça estiver de
     6 a 20 cm ACIMA do cano, os dois NÃO PODEM valer ao mesmo tempo: origem no
     cano dá paralaxe (o defeito medido), origem na mira dá exatamente a altura
     da alça de distância até o cano. O que se vê continua saindo do cano (o
     traçante e o clarão usam a boca, não a origem balística) — a escolha foi
     acertar onde a alça aponta. Este caso trava o número para que ninguém
     confunda "6 a 20 cm de altura de alça" com uma volta dos 67 cm do defeito
     original, e para que a decisão fique medida e não implícita. */
  it('a origem balística está SOBRE a linha de mira, e o afastamento do cano é a altura da alça', async () => {
    const r = await h.play(() => window.__MIRA.tiro());
    assert.ok(r.naLinha < 0.002,
      `a origem do raio está a ${(r.naLinha * 100).toFixed(2)} cm da linha de mira — ela tem que estar EM CIMA dela`);
    assert.ok(r.aoCano < 0.25,
      `a origem balística ficou a ${(r.aoCano * 100).toFixed(1)} cm do cano; altura de alça deste jogo vai até 20 cm, acima disso é outro defeito`);
  });

  /* O QUE ESTE CASO PROVA, E O QUE ELE NÃO PROVA — escrito porque tentei usá-lo
     para outra coisa e ele não serviu.
     PROVA: o alinhamento se mantém disparando em direções diferentes, girando
     entre os tiros. É cobertura real: uma correção que só valesse olhando para
     frente morre aqui.
     NÃO PROVA: que a zeragem dinâmica sumiu. Reinjetei a zeragem duas vezes —
     sem girar e girando 25° entre os tiros — e este caso passou nas DUAS,
     porque neste ponto do mapa `rayBlockedAt` devolve o mesmo teto em qualquer
     direção. Quem mata aquele mutante é o caso 1, que cobra erro ~zero em CINCO
     distâncias ao mesmo tempo — e nenhuma zeragem consegue isso, por
     construção. Se algum dia este caso for citado como o guarda da deriva,
     está sendo citado errado. */
  it('o alinhamento se mantém em qualquer direção, girando entre os tiros', async () => {
    const r = await h.play(async () => {
      const a = [];
      for (let i = 0; i < 3; i++) {
        a.push(await window.__MIRA.tiro());
        window.__A.stick('right', 1, 0);
        await window.__A.espera(140);
        window.__A.solta();
        await window.__A.espera(220);
      }
      return a;
    });
    const e10 = r.map(t => t.erros[10]);
    const espalha = Math.max(...e10) - Math.min(...e10);
    const pior = Math.max(...e10);
    assert.ok(pior < TETO,
      `girando entre os tiros, o pior erro a 10 m foi ${(pior * 100).toFixed(2)} cm (${e10.map(v => (v * 100).toFixed(2) + ' cm').join(', ')}) — o alinhamento não pode depender da direção em que se olha`);
    assert.ok(espalha < 0.005,
      `o erro a 10 m variou ${(espalha * 100).toFixed(2)} cm entre as três direções`);
  });
});
