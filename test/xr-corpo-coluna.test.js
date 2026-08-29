/* ================================================================
   QA — O JOGADOR SENTADO NO CHÃO: A COLUNA DOBRA, O QUADRIL NÃO AFUNDA.

   ONDE A RODADA PASSADA PAROU, com número. A raiz do boneco acompanha a CABEÇA
   até o fim (critério C5, "corpo ancorado na cabeça com erro ≤ 0,05 m") e o
   quadril mora ~0,94 unidades de raiz abaixo dela. Com a cabeça do jogador
   abaixo disso — ele SENTADO NO CHÃO, que num BR acontece — o quadril está
   debaixo do piso e nenhuma pose de PERNA resolve. Medido no vértice skinado,
   no render:

     cabeça | malha mais baixa | quadril
     -------|------------------|---------
     0,90 m |      −0,0588 m   | −0,0414 m
     0,80 m |      −0,1635 m   | −0,1412 m
     0,70 m |      −0,2626 m   | −0,2412 m

   A perna responde por ~0,02 m disso; o resto é o TRONCO. O grau de liberdade
   que falta é a COLUNA — e ela EXISTE neste rig: `Torso_49` (a pelve, raiz de
   tudo) → `Chest_40` → `Head_0`. A junta que inclina o tronco sem levar as
   pernas junto é o `Chest`.

   E A SAÍDA NÃO PODE SER O CLAMP. Travar a raiz para o quadril não descer é
   exatamente o `plantFeet` do VRIK que já foi removido daqui: com a cabeça a
   0,95 m o ombro ia para +0,0521 m ACIMA do olho e o erro de âncora para
   0,20 m, contra os 0,05 m que C5 escreve. A saída é o clamp MAIS a coluna: a
   raiz sobe o tanto que o quadril precisa, e o tronco dobra o tanto que a
   cabeça precisa para voltar ao lugar. Quem valida isso não é a raiz (que
   passou a ser outra coisa), é o OSSO DA CABEÇA.

   COMO ESTE ARQUIVO MEDE
   ----------------------
   · A ÂNCORA, PELO OSSO DA CABEÇA. `Head_0` é geometria do rig e mantém uma
     relação fixa com o olho enquanto o corpo está em pé. O que este arquivo
     cobra é que essa MESMA relação sobreviva ao agachamento fundo: se a raiz
     subir e o tronco não dobrar, a cabeça do boneco sobe junto e o número
     denuncia. Ler `bodyRoot.position` não serviria — é justamente o que muda.
   · VÉRTICE SKINADO, nunca `Box3` num `SkinnedMesh` (a caixa fica congelada na
     primeira pose pedida; três arquivos desta base mediram a raiz achando que
     mediam os pés).
   · NO RENDER, com `updateWorldMatrix(true, true)` antes — a sonda roda antes
     do `scene.updateMatrixWorld()` e os ossos só ROTACIONADOS ainda não têm
     matriz de mundo deste frame.
   · A FAIXA CONTÍNUA, de 1,10 m até 0,65 m em degraus de 5 cm, e a linha de
     base EM PÉ na mesma sessão — porque o que se compara é a relação
     cabeça↔olho de uma pose com a da outra.

   PORTA 3643 — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3643;
/* O quadril não passa do piso. 2 cm é menos que a espessura da sola deste
   modelo e um décimo do defeito medido (0,2412 m). */
const QUADRIL_MAX = 0.02;
/* Erro de âncora do critério C5, medido no osso da cabeça. */
const ANCORA_MAX = 0.05;

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
  const _p = new T.Vector3();
  const wp = o => o.getWorldPosition(new T.Vector3());
  const local = o => raiz.worldToLocal(wp(o));

  function amostrar() {
    raiz.updateWorldMatrix(true, true);
    G.camera.updateWorldMatrix(true, false);
    const olho = wp(G.camera);
    /* MALHA INTEIRA por vértice skinado: quem toca o chão primeiro num
       agachamento fundo pode ser a bainha da capa, e olhar só a bota passaria
       com o casaco atravessando o piso. */
    let minV = Infinity, maxV = -Infinity, osso = '?', ossoTopo = '?', perto = Infinity;
    /* O TOPO IGNORA O BRAÇO, e isto NÃO é conveniência: no kit emulado os
       controles não descem junto com o headset, então o braço do boneco sobe
       atrás deles e quem ganha o topo passa a ser o DEDO — medido aqui, +0,3372 m
       acima do olho com o corpo intacto e a coluna sequer engatada. É a mesma
       armadilha que test/xr-corpo-ancora.test.js registra. O que este número
       precisa seguir é o TRONCO. */
    const tronco = /^(Chest|Head)/;
    raiz.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry, pos = g.attributes.position;
      if (!pos) return;
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const dono = i => {
        if (!o.isSkinnedMesh || !si || !sw || !o.skeleton) return '(nao skinado)';
        let bi = si.getX(i), bw = sw.getX(i);
        for (const par of [[si.getY(i), sw.getY(i)], [si.getZ(i), sw.getZ(i)],
          [si.getW(i), sw.getW(i)]]) {
          if (par[1] > bw) { bw = par[1]; bi = par[0]; }
        }
        return (o.skeleton.bones[bi] && o.skeleton.bones[bi].name) || '?';
      };
      for (let i = 0; i < pos.count; i++) {
        if (o.isSkinnedMesh) o.getVertexPosition(i, _p);
        else _p.fromBufferAttribute(pos, i);
        _p.applyMatrix4(o.matrixWorld);
        const d = dono(i);
        if (_p.y > maxV && tronco.test(d)) { maxV = _p.y; ossoTopo = d; }
        /* I3 medido AQUI, sobre a malha inteira e no mesmo frame: o
           `FpBody.olhoMin` é uma varredura ROLANTE (256 vértices por frame de
           2 631), então uma amostra solta dele pode devolver um número grande
           só porque a fatia daquele frame não visitou o vértice mais perto —
           passa por acidente. Aqui o laço já percorre tudo. O braço fica de
           fora porque no kit emulado o controle NÃO desce com o headset, e a
           mão parada perto do rosto é artefato do dublê, não do produto. */
        if (!/^(Sholder|Arm_|Hand|Finger)/.test(d)) {
          const dd = _p.distanceTo(olho);
          if (dd < perto) perto = dd;
        }
        if (_p.y >= minV) continue;
        minV = _p.y;
        osso = d;
      }
    });
    const rig = G.XR.rig;
    const chao = rig ? wp(rig).y : null;
    const cab = B.head ? wp(B.head) : null;
    const quadril = wp(B.leg1R), torso = wp(B.torso), peito = wp(B.chest);
    /* FLEXÃO DO TRONCO: o ângulo ENTRE as duas partes da coluna — pelve→peito
       e peito→cabeça. É a dobra da junta, e é ela que tem limite humano.
       Medir o primeiro eixo contra a vertical não veria nada: a junta que dobra
       é o `Chest`, e a pelve não se mexe. */
    const baixo = peito.clone().sub(torso), alto = B.head ? wp(B.head).sub(peito) : null;
    const flexao = alto && baixo.lengthSq() > 1e-9 && alto.lengthSq() > 1e-9
      ? Math.acos(Math.min(1, Math.max(-1,
        baixo.normalize().dot(alto.normalize())))) * 180 / Math.PI : null;
    /* ================================================================
       A ÂNCORA DE C5, E POR QUE ELA É ESTE PONTO E NÃO OUTRO.

       Com o tronco dobrado, NENHUM osso ou vértice acima da cintura guarda
       relação fixa com o olho — todos giram junto com a dobra. Três réguas
       foram tentadas e DESCARTADAS por medirem a dobra em vez da âncora
       (os números ficam impressos no log, para o próximo não repetir):
         · osso da cabeça contra o olho .... 0,1825 m a 0,65 m de cabeça;
         · distância olho↔ombro ............ anda 0,15 m sozinha, porque o
           corpo é posto `recuo` ATRÁS do visor de propósito e esse vetor é de
           MUNDO enquanto o ombro gira;
         · topo da malha do peito .......... +0,27 m, pelo mesmo giro.

       O que É a âncora: o CENTRO DA CABEÇA do boneco — o ponto que o módulo
       põe na cabeça do jogador, `recuo` atrás do visor (Population: ONE, "set
       height at center of head instead of headset"). Ele é carregado pelo
       PEITO, então sobrevive à dobra.

       E as duas referências vêm de MEDIÇÃO, não do código: numa pose já
       agachada mas ANTES de a coluna engatar (cabeça a 1,10 m, onde o `recuo`
       já saturou), o teste lê (a) onde esse ponto mora no espaço do peito e
       (b) o vetor olho→ponto. Depois cobra que, no agachamento fundo, o MESMO
       ponto do peito continue caindo no MESMO lugar em relação ao olho. Se o
       solver puser outro ponto no alvo, ou puser o certo no lugar errado, o
       número sobe.
       ================================================================ */
    const raizW = new T.Vector3().setFromMatrixPosition(raiz.matrixWorld);
    const ref = window.__M.ref;
    const ancoraC5 = ref
      ? new T.Vector3().fromArray(ref.pt).applyMatrix4(B.chest.matrixWorld)
        .distanceTo(olho.clone().add(new T.Vector3().fromArray(ref.off)))
      : null;
    return {
      raizNoPeito: B.chest.worldToLocal(raizW.clone()).toArray(),
      raizMenosOlho: raizW.clone().sub(olho).toArray(),
      ancoraC5,
      olhoMin: G.FpBody.olhoMin, olhoMinTronco: perto,
      colunaDivida: G.FpBody.colunaDivida,
      /* O TOPO DA MALHA EM RELAÇÃO AO OLHO — a régua que o laudo desta base já
         usou para o defeito antigo ("topo do boneco 0,709 m acima do olho").
         É o corpo INTEIRO subindo em relação à cabeça, medido no vértice, e não
         tem como um clamp de raiz escapar dela. */
      topoRelOlho: maxV - olho.y, ossoTopo,
      chao, minV, osso,
      folga: chao === null ? null : minV - chao,
      escala: raiz.scale.x || 1, visivel: raiz.visible,
      raizY: raiz.position.y,
      altCabeca: G.XR.corpo.alturaCabeca,
      altDePe: G.XR.corpo.alturaDePe,
      encurtar: raiz.userData.encurtar,
      dobra: raiz.userData.colunaDobra === undefined ? null : raiz.userData.colunaDobra,
      flexao,
      olho: olho.toArray(),
      /* A ÂNCORA: onde o osso da cabeça do boneco está EM RELAÇÃO AO OLHO. Em
         pé isso é uma constante do rig; agachado tem de continuar sendo. */
      cabRel: cab ? cab.clone().sub(olho).toArray() : null,
      ombroRelY: wp(B.shR).y - olho.y,
      /* A DISTÂNCIA OLHO↔OMBRO É UMA CONSTANTE DO CORPO — o pescoço não estica.
         É a régua literal de C5 ("a distância entre o ombro renderizado e a
         posição do headset") e a única que sobrevive ao tronco dobrado: com o
         tronco em pé ou dobrado, o ombro continua à mesma distância do olho;
         quem MOVE o corpo em relação à cabeça é que muda esse número. */
      ombroDistR: wp(B.shR).distanceTo(olho),
      ombroDistL: wp(B.shL).distanceTo(olho),
      quadrilSobreOPiso: chao === null ? null : quadril.y - chao,
      torsoSobreOPiso: chao === null ? null : torso.y - chao,
      peitoSobreOPiso: chao === null ? null : peito.y - chao,
      /* geometria do rig no espaço da RAIZ (é ela que decide o quanto a coluna
         tem para dobrar) */
      locTorso: local(B.torso).toArray(),
      locChest: local(B.chest).toArray(),
      locHead: B.head ? local(B.head).toArray() : null,
      locQuadril: local(B.leg1R).toArray(),
      afundou: G.FpBody.afundou,
      joelhoAcimaDoQuadril: wp(B.leg2R).y - quadril.y,
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
  return { ok: !!(B.torso && B.chest && B.head && B.leg1R) };
}

const f4 = v => (v === null || v === undefined ? 'n/d' : v.toFixed(4));
const f2 = v => (v === null || v === undefined ? 'n/d' : v.toFixed(2));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('em VR o jogador sentado no chão não fica com o quadril debaixo do piso',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, dePe = null, fundo = [];
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos da coluna não encontrados no rig');

      /* "EM PÉ" é a maior altura SUSTENTADA (0,75 s de janela em tempo
         SIMULADO): fixá-la em 1,90 m aqui faz a varredura inteira correr com a
         mesma escala de boneco, que é o que torna os degraus comparáveis. */
      await h.play(async () => {
        const dev = window.__xrEmulado;
        dev.quaternion.set(0, 0, 0, 1);
        dev.position.set(0, 1.90, 0);
        await new Promise(r2 => setTimeout(r2, 4000));
      });
      dePe = await h.play(async () => {
        window.__xrEmulado.position.set(0, 1.70, 0);
        await new Promise(r2 => setTimeout(r2, 1500));
        return await window.__M.ler();
      });
      /* CALIBRA A ÂNCORA NUMA POSE JÁ AGACHADA MAS ANTES DO ENGATE DA COLUNA
         (1,10 m). Tem de ser aqui e não em pé: o `recuo` do corpo cresce com o
         agachamento (0,08 → 0,14 m) e satura muito antes desta altura, então a
         referência e as amostras compartilham o mesmo recuo. Calibrar em pé
         embutiria 0,038 m de diferença de projeto no orçamento de 0,05 m. */
      await h.play(async () => {
        window.__xrEmulado.position.set(0, 1.10, 0);
        await new Promise(r2 => setTimeout(r2, 1500));
        const c = await window.__M.ler();
        window.__M.ref = { pt: c.raizNoPeito, off: c.raizMenosOlho };
      });
      for (let y = 1.10; y > 0.64; y -= 0.05) {
        fundo.push(await h.play(async (yy) => {
          window.__xrEmulado.position.set(0, yy, 0);
          await new Promise(r2 => setTimeout(r2, 1000));
          const m = await window.__M.ler();
          m.alvoY = yy;
          return m;
        }, Math.round(y * 100) / 100));
      }
      console.log(`  [rig, unidades da raiz] torso ${dePe.locTorso.map(f4)} · chest ` +
        `${dePe.locChest.map(f4)} · head ${(dePe.locHead || []).map(f4)} · quadril ` +
        `${dePe.locQuadril.map(f4)} · escala ${f4(dePe.escala)}`);
      console.log(`  [em pé 1,70] topo ${f4(dePe.topoRelOlho)} · ombro ` +
        `${f4(dePe.ombroRelY)} · malha ${f4(dePe.folga)} · quadril ` +
        `${f4(dePe.quadrilSobreOPiso)} · olhoMinTronco ${f4(dePe.olhoMinTronco)} · flexão ` +
        `${f2(dePe.flexao)}°`);
      for (const m of fundo) {
        console.log(`  cabeca ${f4(m.alvoY)} (lida ${f4(m.altCabeca)}) => malha ` +
          `${f4(m.folga)} (${m.osso}) · quadril ${f4(m.quadrilSobreOPiso)} · torso ` +
          `${f4(m.torsoSobreOPiso)} · ancoraC5 ${f4(m.ancoraC5)} · topo ` +
          `${f4(m.topoRelOlho)} · ombro ` +
          `${f4(m.ombroRelY)} · flexão ${f2(m.flexao)}° · dobra ${f4(m.dobra)} · ` +
          `dívida ${f4(m.colunaDivida)} · olhoMinTronco ${f4(m.olhoMinTronco)} · ` +
          `raizY ${f4(m.raizY)} · afundou ${f4(m.afundou)} · [réguas descartadas: ` +
          `cabRel ${f4(dist(m.cabRel, dePe.cabRel))} · ombroDist ${f4(m.ombroDistR)}]`);
      }
    });
    after(async () => { if (h) await h.close(); });

    const condicao = m => {
      assert.ok(m.visivel, 'o boneco não está visível — não há o que medir');
      assert.ok(m.chao !== null, 'sem rig não há piso a comparar');
      assert.ok(Math.abs(m.altCabeca - m.alvoY) < 0.02,
        `o headset foi posto a ${f4(m.alvoY)} m e o jogo leu ${f4(m.altCabeca)} m: ` +
        'a pose não chegou, e o resto da medida não vale');
    };

    it('a faixa medida é mesmo a que põe o quadril no piso (senão não mede nada)', () => {
      /* CONDIÇÃO DE MEDIDA, e ela precede tudo: com a raiz seguindo a cabeça, o
         quadril só passa do piso abaixo de ~0,94 m de cabeça. Uma varredura que
         não chegue lá passa em todos os casos abaixo sem exercitar nada. */
      assert.ok(fundo.length >= 9, `a varredura tem só ${fundo.length} degraus`);
      for (const m of fundo) condicao(m);
      const olhoBaixo = Math.min(...fundo.map(m => m.altCabeca));
      const quadrilNominal = -dePe.locQuadril[1] * dePe.escala;
      assert.ok(olhoBaixo < quadrilNominal - 0.15,
        `a cabeça só desceu até ${f4(olhoBaixo)} m e o quadril mora ` +
        `${f4(quadrilNominal)} m abaixo da raiz: sem passar disso o defeito não ` +
        'aparece');
    });

    it('NENHUM degrau põe o QUADRIL debaixo do piso', () => {
      const fora = fundo.filter(m => m.quadrilSobreOPiso < -QUADRIL_MAX);
      const pior = fundo.reduce((a, b) => (b.quadrilSobreOPiso < a.quadrilSobreOPiso ? b : a));
      assert.deepEqual(
        fora.map(m => `cabeca ${f4(m.alvoY)}: ${f4(m.quadrilSobreOPiso)}`), [],
        `degraus com o quadril dentro do chão (pior: ${f4(pior.quadrilSobreOPiso)} m ` +
        `com a cabeça a ${f4(pior.alvoY)} m). Medido antes: −0,2412 m a 0,70 m`);
    });

    it('e a MALHA acompanha: nada de tronco enfiado no piso', () => {
      const fora = fundo.filter(m => m.folga < -0.03);
      const pior = fundo.reduce((a, b) => (b.folga < a.folga ? b : a));
      assert.deepEqual(fora.map(m => `cabeca ${f4(m.alvoY)}: ${f4(m.folga)} (${m.osso})`), [],
        `degraus com a malha dentro do chão (pior: ${f4(pior.folga)} m em ` +
        `${f4(pior.alvoY)} m, osso ${pior.osso}). Medido antes: −0,2626 m a 0,70 m`);
    });

    it('C5 SOBREVIVE: a cabeça do boneco continua onde o olho do jogador está', () => {
      /* O CASO QUE IMPEDE A CORREÇÃO DE VIRAR O DEFEITO ANTIGO. Levantar a raiz
         sem dobrar a coluna tira o quadril do chão e empurra a cabeça do boneco
         para cima do olho do jogador — é o `plantFeet` do VRIK voltando pela
         porta dos fundos, e foi medido antes: ombro +0,0521 m ACIMA do olho com
         0,20 m de erro de âncora. A régua é o OSSO DA CABEÇA contra o olho, e a
         referência é a MESMA relação medida em pé. */
      /* A régua e a escolha dela estão explicadas na sonda (`ancoraC5`): é o
         CENTRO DA CABEÇA do boneco contra a cabeça do jogador, com as duas
         referências medidas numa pose pré-engate. */
      assert.ok(fundo.every(m => m.ancoraC5 !== null),
        'a âncora não foi calibrada — o caso não mede nada');
      for (const m of fundo) {
        assert.ok(m.ancoraC5 <= ANCORA_MAX,
          `com a cabeça a ${f4(m.alvoY)} m o centro da cabeça do boneco ficou ` +
          `${f4(m.ancoraC5)} m fora da cabeça do jogador (teto C5 ${ANCORA_MAX} m). ` +
          `Isso é o corpo escorregando em relação à cabeça — o clamp de raiz sem ` +
          `a coluna, o plantFeet do VRIK. Raiz em ${f4(m.raizY)}, topo do peito ` +
          `${f4(m.topoRelOlho)}`);
        assert.ok(m.ombroRelY < -0.05,
          `com a cabeça a ${f4(m.alvoY)} m o ombro do boneco ficou ` +
          `${f4(m.ombroRelY)} m em relação ao olho do jogador (negativo = abaixo; ` +
          'medido com a raiz travada e sem coluna: +0,0521 m ACIMA)');
      }
    });

    it('e a dobra não traz a malha para dentro do olho (I3)', () => {
      /* O RISCO NOVO QUE A CORREÇÃO CRIA, medido: dobrar o tronco leva a gola e
         o ombro para a frente, que é justamente a direção do olho. O critério
         I3 proíbe geometria dentro de 0,15 m do olho, e js/fpbody.js tem servo
         próprio para isso (`recuoOlho`, teto 0,015 m) — este caso cobra que ele
         dê conta também nesta pose. */
      for (const m of fundo) {
        assert.ok(m.olhoMinTronco > 0.15,
          `com a cabeça a ${f4(m.alvoY)} m a malha do boneco chegou a ` +
          `${f4(m.olhoMinTronco)} m do olho (I3 exige 0,15 m), com a coluna dobrada ` +
          `${f2((m.dobra || 0) * 180 / Math.PI)}°`);
      }
    });

    it('a coluna dobra dentro do que uma coluna humana dobra', () => {
      /* O PREÇO TEM LIMITE ANATÔMICO. A flexão do tronco (lombar + torácica)
         vai a ~90–105° num adulto; passar disso troca um defeito por um boneco
         quebrado ao meio. E a outra ponta é obrigatória: EM PÉ a coluna não
         pode estar dobrada. */
      /* A flexão é medida CONTRA O REPOUSO: este rig já nasce com 33,5° entre
         os dois trechos da coluna, e cobrar o ângulo absoluto mediria o
         desenho do modelo em vez do que o solver fez. */
      assert.ok(dePe.flexao !== null, 'sem osso de cabeça não há flexão a medir');
      const demais = fundo.filter(m => m.flexao - dePe.flexao > 95);
      assert.deepEqual(
        demais.map(m => `cabeca ${f4(m.alvoY)}: +${f2(m.flexao - dePe.flexao)}°`), [],
        `a coluna dobrou mais do que uma coluna humana dobra (repouso ` +
        `${f2(dePe.flexao)}°)`);
      const emPe = fundo.filter(m => m.dobra > 0.01 && m.quadrilSobreOPiso > 0.05);
      assert.deepEqual(emPe.map(m => `cabeca ${f4(m.alvoY)}: dobra ${f4(m.dobra)}`), [],
        'a coluna dobrou em pose que não precisava — o quadril já estava fora do ' +
        'chão, e dobrar ali é mexer no que já estava certo');
    });
  });
