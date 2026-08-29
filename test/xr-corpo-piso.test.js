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
   mora 0,9414 unidades da raiz abaixo dela. Com a cabeça do jogador abaixo
   disso (ele SENTADO NO CHÃO), nenhuma pose de PERNA resolve: quem tem de
   dobrar é a COLUNA, e é o que `ajustarColuna` (js/fpbody.js) faz hoje. O
   último bloco mede essa faixa e cobra o novo contrato — quadril NO piso e
   perna resolvida por baixo dele. A âncora C5 e o limite anatômico da dobra
   são cobrados em test/xr-corpo-coluna.test.js, que é onde eles moram.

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
  /* MUTAÇÃO ISOLADA DE UM OSSO SÓ — não do jogo. `js/fpbody.js` lê
     `quadril.getWorldPosition(_hipP).y` do MESMO objeto `B.leg1R` todo frame
     para publicar `afundou`; sobrescrever o método na instância (não no
     protótipo) faz o produto e esta sonda enxergarem o MESMO deslocamento
     sem tocar no solver de perna/coluna que os outros casos deste arquivo já
     travam como hermético. Restaura sozinho, mesmo se `ler()` explodir. */
  window.__M.comOssoForcado = async (offsetY) => {
    const origGWP = B.leg1R.getWorldPosition.bind(B.leg1R);
    B.leg1R.getWorldPosition = v => { const r = origGWP(v); r.y += offsetY; return r; };
    try { return await window.__M.ler(); } finally { B.leg1R.getWorldPosition = origGWP; }
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

    it('o número que o produto publica bate com a perna medida por fora', () => {
      /* ACHADO por validação independente (docs/vr/validacao-18a231e.md §5.8):
         o antecedente `folga < -ENTERRO_MAX` é a NEGAÇÃO exata do caso anterior
         ("NENHUM degrau enterra a malha") — se aquele caso passa, `folga` nunca
         fica abaixo de `-ENTERRO_MAX` aqui, e `mentindo` é vazio por construção
         SEMPRE, produto certo ou não. Reinjetando `afundou = 0` fixo em
         js/fpbody.js o arquivo inteiro continuava 7 de 7 verde.

         A âncora agora é INDEPENDENTE do que `folga` mede (vértice de malha):
         a mesma sonda já lê `quadrilY`/`joelhoY` e `tornozeloSobreOPiso` por
         OSSO, do jeito que `js/fpbody.js` computa `baixo` para publicar
         `afundou` — mas lidos aqui, no teste, sem perguntar ao módulo. Se
         `FpBody.afundou` for travado ou desconectado da perna real, diverge
         desta conta e o caso morre com número. */
      const TOL = 0.03;   // ruído de posição de osso entre chamadas de amostra
      const linhas = varredura.map(m => {
        const joelhoSobreOPiso = m.joelhoY - m.chao;
        const baixoIndependente = Math.min(
          m.quadrilSobreOPiso, joelhoSobreOPiso, m.tornozeloSobreOPiso);
        const esperado = Math.max(0, -baixoIndependente);
        return { m, esperado, diff: Math.abs(m.afundou - esperado) };
      });
      const divergiu = linhas.filter(l => l.diff > TOL);
      assert.deepEqual(divergiu.map(l => `cabeca ${f4(l.m.alvoY)}: afundou=` +
        `${f4(l.m.afundou)} vs perna-por-fora=${f4(l.esperado)} (dif ${f4(l.diff)})`), [],
        'FpBody.afundou não bate com a perna medida por fora (quadril/joelho/' +
        'tornozelo) — o número publicado ficou desconectado da pose real');
      /* MEDIDO, NÃO SUPOSTO: nesta varredura inteira (1,85 a 0,70 m de cabeça)
         o quadril NUNCA cruza o piso — o pico de afundamento medido por fora é
         0,0000 m em todo degrau, porque o clamp de quadril/coluna (travado nos
         casos acima e no describe "abaixo do quadril") é hermético nessa
         faixa. Um `assert.ok(picoPerna > TOL)` aqui seria FALSO no produto
         correto — cheguei a escrever essa asserção, rodei, e ela morreu no
         produto intacto: é exatamente o formato 9 do CLAUDE.md ("cenário que
         não exercita o limiar"), só que desta vez pego pelo próprio processo
         de TDD antes de entrar no repo. A direção "afundou sobe quando a
         perna realmente relata abaixo do piso" não tem cenário natural nesta
         faixa — é o próximo caso, por mutação isolada de UM osso. */
      /* QUAL DAS DUAS GUARDAS DO PÉ ESTE ARQUIVO CONSEGUE COBRAR, E POR QUÊ.

         Eram os 0,001 m de `peErguido`, e esse número vive NO RUÍDO: na
         varredura inteira ele dá 0,0000–0,0010 m, ou seja o caso passava por
         0,0 mm de margem. Qualquer coisa que mova o corpo uma fração de
         milímetro — e o servo anti-olho (`recuoOlho`, teto 15 mm) move — troca
         o veredito. Medido: com o punho esquerdo passando a seguir o controle
         do jogador, a malha perto do olho muda, o servo responde e o pico de
         `peErguido` foi de 0,0010 para 0,0004 m. Guarda que decide no quarto
         decimal não guarda nada — é o formato 9 do CLAUDE.md ("cenário que não
         exercita o limiar") com outra roupa.

         A guarda que TRABALHA nesta faixa é a outra, e com sinal de sobra: o pé
         desliza para a frente para o joelho não passar de `kneeMin`, e isso vale
         0,0423 / 0,0364 / 0,0319 m nos degraus fundos — quarenta vezes o ruído.
         Trocar o teto de 0,001 m num sinal de 0,001 por 0,02 m num sinal de
         0,042 é APERTAR a régua, não afrouxá-la. `peErguido` continua impresso
         degrau a degrau, como número de acompanhamento. */
      const trabalhou = varredura.filter(m => m.peAFrente > 0.02);
      const pico = Math.max(...varredura.map(m => m.peAFrente || 0));
      assert.ok(trabalhou.length > 0,
        `nenhum degrau exigiu que o pé deslizasse para a frente (pico ` +
        `${f4(pico)} m): ou a varredura não agacha, ou o joelho nunca chega ao ` +
        'limite e este arquivo não está medindo o mecanismo que diz medir');
    });

    it('quando o osso do quadril REALMENTE relata abaixo do piso, `afundou` acompanha', async () => {
      /* A direção que o caso anterior não conseguiu exercitar: aqui o produto
         não é enganado com um argumento fabricado (formato 4) — é o MESMO
         objeto `B.leg1R` que `js/fpbody.js` lê todo frame para publicar
         `afundou`, com `getWorldPosition` deslocado 0,15 m para baixo por UM
         instante. O solver de perna/coluna não é tocado: ele continua
         resolvendo a pose real, só que a LEITURA do quadril mente por um
         frame, do mesmo jeito que um sensor de rastreio poderia mentir.

         AGACHA PRIMEIRO — de propósito. Este caso roda depois de `pePlantado`
         (headset de volta a 1,90 m, de pé), e de pé o quadril mede ~0,96 m
         acima do piso: um offset de 0,15 m não chega nem perto de zero. Só
         com a folga já pequena (degrau de 0,95 m de cabeça, ~0,06 m de
         quadril acima do piso, medido na varredura) o offset atravessa o
         piso de verdade. */
      await h.play(async () => {
        window.__xrEmulado.position.set(0, 0.95, 0);
        await new Promise(r => setTimeout(r, 700));
      });
      const OFFSET = -0.15;
      const forcado = await h.play(off => window.__M.comOssoForcado(off), OFFSET);
      const esperado = Math.max(0, -Math.min(
        forcado.quadrilSobreOPiso, forcado.joelhoY - forcado.chao, forcado.tornozeloSobreOPiso));
      assert.ok(esperado > 0.05,
        `a mutação não alcançou o osso que o produto lê (esperado ${f4(esperado)} m ` +
        'de afundamento independente) — o monkey-patch não está no objeto certo');
      assert.ok(Math.abs(forcado.afundou - esperado) < 0.03,
        `com o quadril relatando ${f4(esperado)} m abaixo do piso, o produto publicou ` +
        `afundou=${f4(forcado.afundou)} — desconectado da leitura real do osso ` +
        '(reinjete `js/fpbody.js:1575`, `afundou = Math.max(0, piso - baixo)` → ' +
        '`afundou = 0`, e este caso morre com este mesmo número)');
      const depois = await h.play(() => window.__M.ler());
      assert.ok(depois.afundou < 0.03,
        `depois de desfazer a mutação, afundou continuou em ${f4(depois.afundou)} — ` +
        'o monkey-patch vazou para fora deste caso');
    });
  });

/* ================================================================
   O JOGADOR SENTADO NO CHÃO — onde a perna acaba e a COLUNA COMEÇA.

   ESTE BLOCO MUDOU DE CONTRATO, e o motivo fica escrito. Ele nasceu medindo o
   LIMITE conhecido: com a raiz acompanhando a cabeça (C5) e o quadril morando
   0,94 abaixo dela, o quadril ficava DEBAIXO do piso e nenhuma pose de perna
   consertava — o que faltava era dobrar a COLUNA. O que ele cobrava, então,
   era que o resíduo fosse exatamente esse, e não perna mal resolvida em cima
   dele.

   A coluna passou a dobrar (`ajustarColuna` em js/fpbody.js, medido em
   test/xr-corpo-coluna.test.js): a raiz sobe o tanto que o quadril precisa e o
   tronco dobra o tanto que a cabeça precisa para voltar ao lugar. Medido:

     cabeça | quadril ANTES | quadril DEPOIS | malha ANTES | malha DEPOIS
     -------|---------------|----------------|-------------|--------------
     0,90 m |   −0,0412 m   |   +0,0001 m    | −0,0588 m   |  −0,0194 m
     0,80 m |   −0,1412 m   |   +0,0001 m    | −0,1635 m   |  −0,0196 m
     0,70 m |   −0,2412 m   |   +0,0001 m    | −0,2626 m   |  −0,0117 m

   O contrato aqui vira o novo: o quadril NÃO passa do piso nesta faixa, e a
   perna continua resolvida por baixo dele. A âncora C5 e o limite anatômico da
   dobra são cobrados no arquivo da coluna, que é onde eles moram.
   ================================================================ */
describe('abaixo do quadril: a coluna dobra e a perna continua resolvida',
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
      for (const y of [0.90, 0.85, 0.80, 0.70]) {
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

    it('a faixa medida é a que EXIGE a coluna (senão o caso não mede nada)', () => {
      /* CONDIÇÃO DE MEDIDA. Sem a coluna, a raiz seguindo a cabeça põe o
         quadril `0,9414 − altura da cabeça` abaixo do piso; a faixa deste bloco
         é justamente a que passa disso. Se a varredura não chegar lá, tudo
         abaixo passa sem exercitar nada. */
      const exige = fundo.filter(m => m.altCabeca < 0.9414 - 0.01);
      assert.ok(exige.length === fundo.length,
        `só ${exige.length} de ${fundo.length} poses ficam abaixo dos 0,9414 m em que ` +
        'o quadril passaria do piso: a faixa escolhida não é a que este bloco mede');
    });

    it('o quadril NÃO passa do piso, e a perna continua resolvida por baixo dele', () => {
      for (const m of fundo) {
        assert.ok(m.quadrilSobreOPiso > -0.02,
          `com a cabeça a ${f4(m.alvoY)} m o quadril ficou ${f4(m.quadrilSobreOPiso)} m ` +
          'em relação ao piso (medido antes da coluna: −0,2412 m a 0,70 m)');
        /* e a perna não pode afundar ALÉM do quadril: se afundar, é a perna
           piorando o que o tronco entregou resolvido */
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
