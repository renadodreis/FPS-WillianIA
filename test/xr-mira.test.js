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

   ================================================================
   ERRO GRAVE DESTE ARQUIVO, CORRIGIDO — leia antes de mexer nele.
   ================================================================
   A primeira versão comparava o raio disparado com `miraDoTiro()`. Só que o
   código faz `_rayDir.copy(_miraDirDoTiro)`: as duas são A MESMA RETA, e a
   distância entre uma reta e ela mesma é zero POR ÁLGEBRA. O arquivo inteiro
   não podia falhar. Validação independente provou girando o eixo óptico em 6°
   — desvio real de ~105 cm a 10 m, contra teto de 2 cm — e o teste calculando
   **1,86e-15 m**. Foi a sexta ocorrência de "teste que passa por acidente"
   nesta base, e a primeira que eu mesmo escrevi.

   A REFERÊNCIA AGORA É O CANO (`direcaoDoCano()`), que é geometria do MODELO
   DESENHADO e não sai do código de mira. Girando o eixo óptico, o `miraNode`
   gira junto e a comparação contra ele continua dando zero — mas o cano não
   gira, porque ele é o que o jogador vê na mão. É essa a âncora.

   E COBRE OS DOIS CAMINHOS QUE FALTAVAM, ambos achados pela mesma validação:
   · a BAZUCA ficou com a zeragem dinâmica que o hitscan perdeu — zeragem
     variando de 5,60 a 120,00 m entre dois tiros, ângulo de até 2,4172°;
   · em partida BR, as armas com `projSpeed` saem por `__BR_ballistics` com
     origem no CANO e nunca passam pela alça: fuzil 9,10 cm, plasma 20,00 cm,
     constante em toda distância. É o modo que o dono joga.
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
    /* CAPTURA O PROJÉTIL DO BR NO PRÓPRIO PONTO DE ENTRADA. Em partida, as
       armas com `projSpeed` não são hitscan: saem por `__BR_ballistics`, que
       o br-game.js instala. O teste instala o MESMO gancho e registra o que o
       jogo passa — origem e direção reais, sem simular nada. */
    armarBR() {
      window.__balistica = null;
      window.__BR_ballistics = (origem, dir) => {
        window.__balistica = { origem: origem.toArray(), dir: dir.toArray() };
      };
    },
    /* cicla até achar arma que case com o filtro (bazuca, projétil, etc.) */
    async acharArma(filtro) {
      /* destrava o alvo: no solo a bazuca nasce trancada, e um caso que não
         mede nada é pior que caso nenhum */
      for (const a of G.arsenal) if (filtro(a)) a.locked = false;
      for (let i = 0; i < G.arsenal.length + 1; i++) {
        const g = G.arsenal[G.gunIndex];
        if (g && !g.locked && filtro(g)) return g.name;
        await window.__MIRA.trocar();
      }
      return null;
    },
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
      const cano = vec(G.canoDoTiro()).normalize();   // congelado no tiro: o outro já viu o recuo
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
        canoY: vec(G.canoDoTiro()).y,
        naLinha: aoRaio(O, mO, mD),
        /* ÂNGULO CONTRA O CANO — a única medida deste arquivo que não vem do
           código de mira. Sem zeragem, o tiro tem de sair PARALELO ao cano. */
        grausDoCano: Math.acos(Math.max(-1, Math.min(1, D.clone().normalize().dot(cano)))) * 180 / Math.PI,
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

  /* A BAZUCA FICOU PARA TRÁS, e foi validação independente que viu. O conserto
     do hitscan não tocou o ramo do foguete, que manteve a zeragem por
     `rayBlockedAt`: medido pelo validador, a distância de zeragem variava de
     5,60 a 120,00 m entre dois tiros e o ângulo chegava a 2,4172° — 2,23 m de
     desvio a 100 m. O foguete tem estilhaço, então centímetros não doem; o que
     dói é o ângulo ANDAR entre tiros, porque aí não há como compensar. */
  it('a BAZUCA também sai paralela ao cano, e não muda de tiro para tiro', async () => {
    const r = await h.play(async () => {
      const nome = await window.__MIRA.acharArma(g => g.rocket);
      if (!nome) return { semBazuca: true };
      /* MIRAR PARA BAIXO É O PONTO. A zeragem antiga convergia o foguete até o
         PRIMEIRO OBSTÁCULO, então ela só denuncia quando há obstáculo perto.
         Três tiros no horizonte devolvem sempre o teto de 120 m e o ângulo
         fica minúsculo — foi assim que a primeira versão deste caso passou com
         o defeito reinjetado. Apontando para o chão a poucos metros, a zeragem
         despenca e o ângulo estoura. */
      const dev = window.__xrEmulado;
      /* inclina a MÃO no eixo X. Escrito por componente e não por `setFromEuler`
         porque o quaternion do IWER não é o `Quaternion` do three — é um objeto
         {x,y,z,w} simples, e chamar método que não existe derrubaria o caso
         antes de medir. */
      const inclinar = p => {
        const q = dev.controllers.right.quaternion;
        const x = Math.sin(p / 2), w = Math.cos(p / 2);
        if (typeof q.set === 'function') q.set(x, 0, 0, w);
        else { q.x = x; q.y = 0; q.z = 0; q.w = w; }
      };
      const t = [];
      for (const pitch of [-0.15, -0.75, -1.1]) {
        inclinar(pitch);
        await window.__A.espera(260);
        t.push(await window.__MIRA.tiro());
      }
      inclinar(0);
      await window.__A.espera(200);
      return { nome, t };
    });
    assert.ok(!r.semBazuca, 'nenhuma bazuca destravada — o caso não mediu nada');
    console.log(`      bazuca: ângulos ${r.t.map(x => x.grausDoCano.toFixed(4) + '°').join(' ')} · cano.y ${r.t.map(x => x.canoY.toFixed(3)).join(' ')}`);
    const angs = r.t.map(x => x.grausDoCano);
    const pior = Math.max(...angs);
    assert.ok(pior < 0.5,
      `a ${r.nome} sai a ${pior.toFixed(3)}° do cano (${angs.map(a => a.toFixed(3) + '°').join(', ')}); teto 0,5°`);
    const espalha = pior - Math.min(...angs);
    assert.ok(espalha < 0.1,
      `o ângulo da ${r.nome} variou ${espalha.toFixed(3)}° entre três tiros em direções diferentes — é zeragem dependente do cenário, e ela anda sozinha`);
    /* E o foguete tem de passar pelo ponto da alça em TODA distância, igual ao
       hitscan. É esta medida que morre com a zeragem reinjetada: convergir do
       tubo para um ponto qualquer inclina o foguete, e a inclinação aparece
       nas distâncias longas mesmo quando o ângulo parece pequeno. */
    const ruins = [];
    for (const t of r.t) for (const d of DISTS) {
      if (t.erros[d] > TETO) ruins.push(`${d} m: ${(t.erros[d] * 100).toFixed(2)} cm`);
    }
    assert.equal(ruins.length, 0,
      `o foguete da ${r.nome} não passa onde a alça aponta:\n  ${ruins.join('\n  ')}`);
  });

  /* O PROJÉTIL DO BR — o modo que o dono joga. As armas com `projSpeed` não
     são hitscan: saem por `__BR_ballistics`, e esse ramo nascia no CANO. Como
     a alça fica 6 a 20 cm acima do cano, o erro era CONSTANTE em toda
     distância: 9,10 cm no fuzil, 20,00 cm no plasma. Uma cabeça tem 16 cm. */
  it('o projétil do BR nasce na linha de mira, não no cano', async () => {
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      /* o caso da bazuca roda antes e deixa o foguete na mão — e o ramo do
         foguete sai de `fire()` antes de chegar em `__BR_ballistics`. Volta
         para uma arma de tiro comum antes de medir. */
      await window.__MIRA.acharArma(x => !x.rocket && !x.melee);
      window.__MIRA.armarBR();
      const g = G.arsenal[G.gunIndex];
      const antes = g.projSpeed;
      g.projSpeed = 300; g.projDrop = 0;
      g.mag = Math.max(g.mag, 5); g.reloading = false;
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(200);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(300);
      g.projSpeed = antes;
      const b = window.__balistica;
      if (!b) return { semTiro: true, arma: g.name };
      const T = MP.THREE;
      const O = new T.Vector3().fromArray(b.origem);
      const D = new T.Vector3().fromArray(b.dir).normalize();
      const m = G.miraDoTiro();
      const mO = new T.Vector3().fromArray(m.origem);
      const mD = new T.Vector3().fromArray(m.direcao).normalize();
      const cano = new T.Vector3().fromArray(G.canoDoTiro()).normalize();
      const w = new T.Vector3().subVectors(O, mO);
      return {
        arma: g.name,
        naLinha: w.clone().sub(mD.clone().multiplyScalar(w.dot(mD))).length(),
        grausDoCano: Math.acos(Math.max(-1, Math.min(1, D.dot(cano)))) * 180 / Math.PI,
      };
    });
    assert.ok(!r.semTiro, `o gatilho não gerou projétil na ${r.arma} — o caso não mediu nada`);
    assert.ok(r.naLinha < 0.02,
      `o projétil da ${r.arma} nasce a ${(r.naLinha * 100).toFixed(2)} cm da linha de mira (teto 2 cm). ` +
      'Erro de origem em projétil é CONSTANTE em toda distância — não dá para compensar mirando mais alto');
    assert.ok(r.grausDoCano < 0.5,
      `o projétil da ${r.arma} sai a ${r.grausDoCano.toFixed(3)}° do cano`);
  });

  /* O CASO QUE MATA A MUTAÇÃO DO EIXO ÓPTICO. Tudo o mais aqui compara o raio
     com a linha de mira — e o raio É a linha de mira, então nada disso denuncia
     um eixo óptico torto. O cano é geometria do modelo: se a alça apontar para
     um lado e o cano para outro, o jogador vê a arma apontada para um lugar e
     acerta outro. Sem zeragem, os dois têm de ser paralelos. */
  it('o tiro sai PARALELO ao cano — a alça não pode apontar para um lado e a arma para outro', async () => {
    const r = await h.play(async () => {
      const out = [];
      const n = Math.min(window.__MIRA.destravadas(), 4);
      for (let i = 0; i < n; i++) { out.push(await window.__MIRA.tiro()); await window.__MIRA.trocar(); }
      return out;
    });
    const ruins = r.filter(t => t.grausDoCano > 0.5)
      .map(t => `${t.arma}: ${t.grausDoCano.toFixed(3)}°`);
    assert.equal(ruins.length, 0,
      `o tiro sai torto em relação ao cano:\n  ${ruins.join('\n  ')}\n(teto 0,5°; a 10 m, 0,5° já são 8,7 cm)`);
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
