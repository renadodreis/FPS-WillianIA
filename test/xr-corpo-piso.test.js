/* ================================================================
   QA — O BONECO NÃO FICA ENTERRADO, EM NENHUMA ALTURA DE AGACHAMENTO.

   O RELATO DO DONO ("o boneco parece enterrado") EM METROS. O corpo em
   primeira pessoa acompanha a CABEÇA até o fim (js/xr/xrbody.js, critério C5:
   "corpo ancorado na cabeça com erro ≤ 0,05 m") e a perna encurta por IK para
   o pé ficar parado no mundo. Só que o teto do encurtamento era um ESCALAR
   pré-calculado — `pernaDobra`, 0,6411 na raiz, o quanto a perna encurta com o
   pé subindo em linha reta pelo eixo quadril→tornozelo. Passado esse ponto o
   corpo continuava descendo e a perna não: o que sobrava virava bota dentro do
   chão. Medido no vértice skinado, no render, headset a 1,90 m de pé:

     agachamento | vértice mais baixo, em relação ao piso
     ------------|---------------------------------------
     0,00 m      | −0,0000 m   (ok)
     0,60 m      | +0,0005 m   (ok)
     0,75 m      | −0,1087 m   ← 10,9 cm de bota DENTRO do chão

   E o teto nem era o limite verdadeiro: com `enc` batendo nele, o joelho ainda
   estava a 27,1° contra os 22° que `kneeMin` permite. O escalar parava a perna
   ANTES do joelho porque ignorava que o pé também anda para a FRENTE
   (`footFwd`), e avanço horizontal é distância que o joelho não precisa
   entregar dobrando.

   O QUE ESTE ARQUIVO MEDE, E POR QUE ASSIM
   -----------------------------------------
   · VÉRTICE SKINADO (`getVertexPosition`), nunca `Box3`. `Box3.setFromObject`
     num `SkinnedMesh` grava em `mesh.boundingBox` e o three NUNCA invalida
     esse campo — e js/fpbody.js envenena esse cache de propósito no boot para
     calcular a escala. Caixa aqui mediria a pose de BIND com a raiz já
     descida. Três arquivos desta base já mediram a raiz achando que mediam os
     pés (CLAUDE.md).
   · A MALHA INTEIRA, não só a bota. Quem toca o chão primeiro num agachamento
     fundo pode ser a bainha da capa, e um teste que olhasse só o pé passaria
     com o casaco atravessando o piso.
   · NO RENDER, que é o que vai para a tela — e com
     `raiz.updateWorldMatrix(true, true)` antes, porque a sonda roda ANTES do
     `scene.updateMatrixWorld()` do próprio render e os ossos que só foram
     ROTACIONADOS (capa, tronco) ainda não têm matriz de mundo deste frame.
   · A ALTURA CONTÍNUA, não três pontos. Um solver que acerta os extremos e
     erra o meio entrega um degrau no movimento; e um teste de três pontos não
     tem como ver isso. Aqui o headset desce em degraus de 5 cm de 1,85 m até
     1,00 m e TODOS os degraus são medidos.
   · O JOELHO JUNTO, e não é enfeite: enterro se "conserta" dobrando o joelho
     ao contrário ou passando do limite humano, e as duas coisas são piores que
     o defeito. Cada degrau confere que o joelho ficou dentro do limite E que
     ele está ACIMA do tornozelo (joelho abaixo do tornozelo é a perna dobrando
     para trás, ou seja ajoelhar de costas em vez de agachar).

   ONDE ESTE ARQUIVO PARA, DECLARADO. A raiz do boneco é o OLHO e o quadril
   mora ~0,94 unidades da raiz abaixo dela. Com a cabeça do jogador abaixo
   disso (ele SENTADO NO CHÃO), o quadril está debaixo do piso e nenhuma pose
   de perna resolve — o que falta é dobrar a COLUNA, que este rig não faz.
   O último bloco mede essa faixa e cobra que o resíduo seja EXATAMENTE o
   quadril abaixo do piso, e não perna mal resolvida.

   PORTA 3646 — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

/* Tolerância do vértice abaixo do piso. 1 cm é menos que a espessura da sola
   deste modelo e menos de um décimo do defeito medido (10,9 cm). */
const ENTERRO_MAX = 0.01;
/* E a outra ponta: pé plantado é pé no CHÃO, não flutuando. */
const FLUTUA_MAX = 0.12;

async function esperarCorpo() {
  const G = window.__game;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
}

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const raiz = G.FpBody.bodyRoot, B = G.FpBody.bones;
  const _p = new T.Vector3(), _a = new T.Vector3(), _b = new T.Vector3();
  const wp = o => o.getWorldPosition(new T.Vector3());
  const ang = (p, q, r) => {
    _a.copy(wp(p)).sub(wp(q)); _b.copy(wp(r)).sub(wp(q));
    if (_a.lengthSq() < 1e-9 || _b.lengthSq() < 1e-9) return null;
    return Math.acos(Math.min(1, Math.max(-1,
      _a.normalize().dot(_b.normalize())))) * 180 / Math.PI;
  };

  function amostrar() {
    /* SEM ISTO A VARREDURA MENTE — ver o cabeçalho do arquivo. */
    raiz.updateWorldMatrix(true, true);
    let minV = Infinity, osso = '?', malha = '?';
    raiz.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry, pos = g.attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        if (o.isSkinnedMesh) o.getVertexPosition(i, _p);
        else _p.fromBufferAttribute(pos, i);
        _p.applyMatrix4(o.matrixWorld);
        if (_p.y >= minV) continue;
        minV = _p.y;
        malha = o.name;
        osso = '(nao skinado)';
        if (!o.isSkinnedMesh) continue;
        const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
        let bi = si.getX(i), bw = sw.getX(i);
        for (const par of [[si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)],
          [si.getW(i), sw.getW(i)]]) {
          if (par[1] > bw) { bw = par[1]; bi = par[0]; }
        }
        osso = (o.skeleton.bones[bi] && o.skeleton.bones[bi].name) || '?';
      }
    });
    const rig = G.XR.rig;
    const chao = rig ? rig.getWorldPosition(new T.Vector3()).y : null;
    const quadril = wp(B.leg1R), joelho = wp(B.leg2R), tornozelo = wp(B.footR);
    return {
      chao, minV, osso, malha,
      folga: chao === null ? null : minV - chao,
      escala: raiz.scale.x || 1,
      raizY: raiz.position.y,
      altCabeca: G.XR.corpo.alturaCabeca,
      altDePe: G.XR.corpo.alturaDePe,
      encurtar: raiz.userData.encurtar,
      /* o joelho, dos dois lados, contra o limite que js/fpbody.js declara */
      joelhoAngR: ang(B.leg1R, B.leg2R, B.footR),
      joelhoAngL: ang(B.leg1L, B.leg2L, B.footL),
      kneeMinGraus: G.FpBody.TUNE.kneeMin * 180 / Math.PI,
      joelhoAcimaDoPe: joelho.y - tornozelo.y,
      quadrilY: quadril.y, joelhoY: joelho.y, tornozeloY: tornozelo.y,
      tornozeloSobreOPiso: chao === null ? null : tornozelo.y - chao,
      dQuadrilPe: quadril.distanceTo(tornozelo),
      /* POLO REAL: para que lado o joelho saiu da linha quadril→pé. É a única
         forma de ver de fora a decisão que o solver tomou. */
      poloReal: (() => {
        const n = tornozelo.clone().sub(quadril);
        if (n.lengthSq() < 1e-9) return null;
        n.normalize();
        const k = joelho.clone().sub(quadril);
        k.addScaledVector(n, -k.dot(n));
        return k.lengthSq() < 1e-9 ? null : k.normalize().toArray();
      })(),
      quadrilSobreOPiso: chao === null ? null : quadril.y - chao,
      /* o que o produto DIZ que fez, ao lado do que a malha mostra */
      afundou: G.FpBody.afundou,
      peErguido: G.FpBody.peErguido,
      peAFrente: G.FpBody.peAFrente,
    };
  }

  const orig = MP.renderer.render.bind(MP.renderer);
  window.__M = { amostra: null, erro: null, quero: false };
  MP.renderer.render = function (cena, cam) {
    if (window.__M.quero) {
      try { window.__M.amostra = amostrar(); } catch (e) { window.__M.erro = String((e && e.stack) || e); }
      window.__M.quero = false;
    }
    return orig(cena, cam);
  };
  window.__M.ler = async () => {
    window.__M.quero = true;
    for (let i = 0; i < 150 && window.__M.quero; i++) await new Promise(r => setTimeout(r, 30));
    if (window.__M.erro) throw new Error('sonda: ' + window.__M.erro);
    return window.__M.amostra;
  };
  return { ok: !!(B.footR && B.footL && B.leg1R && B.leg2R) };
}

const f4 = v => (v === null || v === undefined ? 'n/d' : v.toFixed(4));

describe('em VR o boneco não fica enterrado em nenhuma altura de agachamento',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, varredura = null, pePlantado = null;
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3646 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos da perna não encontrados no rig');

      /* "EM PÉ" é a maior altura SUSTENTADA (0,75 s de janela, em tempo
         SIMULADO — game.js clampa o passo em 50 ms), e ela não desce sozinha:
         fixá-la em 1,90 m no começo faz a varredura inteira correr com a mesma
         escala de boneco, que é o que torna os degraus comparáveis. */
      await h.play(async () => {
        const dev = window.__xrEmulado;
        dev.quaternion.set(0, 0, 0, 1);
        dev.position.set(0, 1.90, 0);
        await new Promise(r2 => setTimeout(r2, 4000));
      });

      /* A VARREDURA: 5 cm por degrau, de 1,85 m até 0,95 m. Uma só passada
         para os quatro casos abaixo — cada degrau custa um settle, e repetir a
         descida por caso multiplicaria o arquivo por quatro sem medir nada
         novo. */
      varredura = [];
      for (let y = 1.85; y > 0.99; y -= 0.05) {
        varredura.push(await h.play(async (yy) => {
          window.__xrEmulado.position.set(0, yy, 0);
          await new Promise(r2 => setTimeout(r2, 700));
          const m = await window.__M.ler();
          m.alvoY = yy;
          return m;
        }, Math.round(y * 100) / 100));
      }
      pePlantado = await h.play(async () => {
        window.__xrEmulado.position.set(0, 1.90, 0);
        await new Promise(r2 => setTimeout(r2, 1500));
        return await window.__M.ler();
      });
      for (const m of varredura) {
        console.log(`  cabeca ${f4(m.alvoY)} (lida ${f4(m.altCabeca)}) => vertice ` +
          `${f4(m.folga)} do piso (${m.osso}/${m.malha}) · joelho ` +
          `${f4(m.joelhoAngR)}° · quadril ${f4(m.quadrilSobreOPiso)} · tornozelo ` +
          `${f4(m.tornozeloSobreOPiso)} · d ${f4(m.dQuadrilPe)} · polo ` +
          `${(m.poloReal || []).map(v => v.toFixed(2))} · ` +
          `afundou ${f4(m.afundou)} · erguido ${f4(m.peErguido)} · frente ${f4(m.peAFrente)}`);
      }
    });
    after(async () => { if (h) await h.close(); });

    const condicao = m => {
      assert.ok(m.chao !== null, 'sem rig não há piso a comparar');
      assert.ok(m.escala < 0.99 || m.escala > 1.01 || Math.abs(m.altDePe - 1.90) < 0.2,
        `a referência "em pé" ficou em ${f4(m.altDePe)} m: a varredura não está ` +
        'medindo a escala que ela pensa medir');
      assert.ok(Math.abs(m.altCabeca - m.alvoY) < 0.02,
        `o headset foi posto a ${f4(m.alvoY)} m e o jogo leu ${f4(m.altCabeca)} m: ` +
        'a pose não chegou, e o resto da medida não vale');
    };

    it('a varredura desce de verdade: o agachamento medido chega a 0,90 m', () => {
      /* CONDIÇÃO DA MEDIDA, e ela precede tudo: uma varredura que não desce
         mede a pose de pé nove vezes e passa em todos os casos abaixo sem
         exercitar nada. */
      assert.ok(varredura.length >= 18,
        `a varredura tem só ${varredura.length} degraus`);
      for (const m of varredura) condicao(m);
      const queda = varredura[0].altCabeca - varredura[varredura.length - 1].altCabeca;
      assert.ok(queda > 0.80,
        `a cabeça desceu ${f4(queda)} m do primeiro ao último degrau — o caso ` +
        'de agachamento fundo não foi exercitado');
      const pedido = Math.max(...varredura.map(m => m.encurtar || 0));
      assert.ok(pedido > 0.75,
        `o maior encurtamento pedido à perna foi ${f4(pedido)} m: sem passar de ` +
        '0,6411 m (o teto antigo, `pernaDobra`) o defeito não aparece');
    });

    it('NENHUM degrau enterra a malha no piso', () => {
      const fora = varredura.filter(m => m.folga < -ENTERRO_MAX);
      const pior = varredura.reduce((a, b) => (b.folga < a.folga ? b : a));
      assert.deepEqual(fora.map(m => `cabeca ${f4(m.alvoY)}: ${f4(m.folga)} (${m.osso})`), [],
        `degraus com a malha dentro do chão (pior de todos: ${f4(pior.folga)} m em ` +
        `${f4(pior.alvoY)} m de cabeça, osso ${pior.osso}). Medido antes do conserto: ` +
        '−0,1087 m com 0,75 m de agachamento');
    });

    it('e nenhum degrau deixa o boneco flutuando', () => {
      /* A OUTRA PONTA É OBRIGATÓRIA: "não enterra" se resolve trivialmente
         levantando o boneco, e aí o defeito só troca de sinal. */
      const fora = varredura.filter(m => m.folga > FLUTUA_MAX);
      assert.deepEqual(fora.map(m => `cabeca ${f4(m.alvoY)}: +${f4(m.folga)}`), [],
        'degraus com o boneco flutuando acima do piso');
      assert.ok(Math.abs(pePlantado.folga) < 0.02,
        `de volta de pé, o vértice mais baixo ficou a ${f4(pePlantado.folga)} m do ` +
        'piso: a pose não voltou');
    });

    it('o joelho absorve o agachamento sem passar do limite humano nem dobrar ao contrário', () => {
      /* SEM ISTO O CASO ANTERIOR PASSA COM A PERNA DESTRUÍDA: pé no chão se
         compra dobrando o joelho além do que um joelho faz, ou dobrando-o para
         o lado errado. Os dois são piores que o enterro. */
      const limite = varredura[0].kneeMinGraus - 1;
      const dobrouDemais = varredura.filter(
        m => m.joelhoAngR < limite || m.joelhoAngL < limite);
      assert.deepEqual(
        dobrouDemais.map(m => `cabeca ${f4(m.alvoY)}: ${f4(m.joelhoAngR)}°/${f4(m.joelhoAngL)}°`), [],
        `joelho abaixo de ${f4(limite)}° internos — mais do que um joelho humano fecha`);
      const paraTras = varredura.filter(m => m.joelhoAcimaDoPe <= 0.03);
      assert.deepEqual(
        paraTras.map(m => `cabeca ${f4(m.alvoY)}: joelho ${f4(m.joelhoAcimaDoPe)} m acima do pé`), [],
        'joelho na altura do tornozelo ou abaixo: a perna dobrou para trás, que é ' +
        'ajoelhar de costas e não agachar');
      const agachado = varredura[varredura.length - 1];
      assert.ok(agachado.joelhoAngR < 60,
        `no degrau mais fundo o joelho ficou em ${f4(agachado.joelhoAngR)}°: não é ` +
        'o joelho que está absorvendo o agachamento');
    });

    it('o número que o produto publica bate com a malha que aparece', () => {
      /* `FpBody.afundou` é o que o QA e js/xr/xrbody.js leem. Se ele disser
         zero enquanto a malha está enterrada, o próximo defeito passa
         despercebido — é o mesmo tipo de mentira do `pernaDobra` previsto. */
      const mentindo = varredura.filter(m => m.folga < -ENTERRO_MAX && m.afundou < 0.01);
      assert.deepEqual(mentindo.map(m => `cabeca ${f4(m.alvoY)}: malha ${f4(m.folga)}, ` +
        `afundou ${f4(m.afundou)}`), [],
      'o produto publicou afundou≈0 com a malha dentro do chão');
      const trabalhou = varredura.filter(m => m.peErguido > 0.001);
      assert.ok(trabalhou.length > 0,
        'a guarda do piso nunca precisou erguer o pé em degrau nenhum: ou a ' +
        'varredura não agacha, ou o alvo do pé já vinha acima do chão e este ' +
        'arquivo não está medindo o mecanismo que diz medir');
    });
  });

/* ================================================================
   O JOGADOR SENTADO NO CHÃO — onde a perna acaba e a COLUNA começaria.

   Separado de propósito: aqui o quadril do boneco está DEBAixo do piso porque
   a raiz acompanha a cabeça (C5) e o quadril mora 0,94 abaixo dela. Nenhuma
   pose de perna conserta isso. O que este bloco cobra é que o resíduo seja
   exatamente esse — quadril abaixo do piso —, e não perna mal resolvida em
   cima dele.
   ================================================================ */
describe('abaixo do quadril: o resíduo é a coluna, não a perna',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, fundo = [];
    before(async () => {
      h = await bootEmVR(bootGame, { port: 3648 });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos da perna não encontrados no rig');
      await h.play(async () => {
        const dev = window.__xrEmulado;
        dev.quaternion.set(0, 0, 0, 1);
        dev.position.set(0, 1.90, 0);
        await new Promise(r2 => setTimeout(r2, 4000));
      });
      for (const y of [0.95, 0.90, 0.80, 0.70]) {
        fundo.push(await h.play(async (yy) => {
          window.__xrEmulado.position.set(0, yy, 0);
          await new Promise(r2 => setTimeout(r2, 1200));
          const m = await window.__M.ler();
          m.alvoY = yy;
          return m;
        }, y));
      }
      for (const m of fundo) {
        console.log(`  cabeca ${f4(m.alvoY)} => vertice ${f4(m.folga)} do piso ` +
          `(${m.osso}) · quadril ${f4(m.quadrilSobreOPiso)} do piso · afundou ${f4(m.afundou)}`);
      }
    });
    after(async () => { if (h) await h.close(); });

    it('o quadril realmente passou do piso nesta faixa (senão o caso não mede nada)', () => {
      const abaixo = fundo.filter(m => m.quadrilSobreOPiso < 0.01);
      assert.ok(abaixo.length === fundo.length,
        `só ${abaixo.length} de ${fundo.length} poses põem o quadril no piso ou abaixo: ` +
        'a faixa escolhida não é a que este bloco diz medir');
    });

    it('o que sobra é o quadril, e a perna continua resolvida por baixo dele', () => {
      for (const m of fundo) {
        /* o enterro não pode ser MAIOR do que o quadril já está: se for, é a
           perna piorando o que a âncora do tronco começou */
        assert.ok(m.folga >= m.quadrilSobreOPiso - 0.03,
          `com a cabeça a ${f4(m.alvoY)} m o quadril está ${f4(m.quadrilSobreOPiso)} m do ` +
          `piso e a malha ${f4(m.folga)} m: a perna afundou ${f4(m.quadrilSobreOPiso - m.folga)} m ` +
          'ALÉM do quadril, ou seja piorou o que o tronco começou');
        /* "JOELHO ACIMA DO TORNOZELO" É A RÉGUA DO AGACHAMENTO, E AQUI ELA NÃO
           SE APLICA: com o quadril 0,24 m DEBAIXO do piso e a sola travada em
           cima dele, a perna inteira aponta para cima e o joelho fica no meio
           do caminho — abaixo do tornozelo por geometria, não por defeito. O
           que continua valendo é que a perna não MERGULHE a partir do quadril
           já enterrado, que é o que o polo invertido fazia (medido: joelho
           0,25 m abaixo do próprio tornozelo E abaixo do quadril). */
        assert.ok(m.joelhoY > m.quadrilY,
          `com a cabeça a ${f4(m.alvoY)} m o joelho ficou ${f4(m.joelhoY - m.quadrilY)} m ` +
          'acima do quadril: a perna mergulhou a partir de um quadril que já ' +
          'estava abaixo do piso, ou seja piorou o que o tronco começou');
      }
    });
  });
