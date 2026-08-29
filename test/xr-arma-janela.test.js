/* ================================================================
   A JANELA DE MIRA DEIXA DE SER INVISÍVEL.

   O ADS físico deste jogo já funcionava — medido antes desta rodada: acende em
   1,000 com o olho a 0,220 m atrás da ocular e 0,000 m de desvio. O problema
   nunca foi a mecânica: era que FORA da janela nada acontecia. Sem dica, sem
   tolerância desenhada, sem "está quase". O jogador não tinha como descobrir
   onde a janela fica, e a primeira tentativa de quem a procurou (mirar 8 cm à
   frente do olho) caiu no raio que faz a arma SUMIR de propósito.

   O QUE ESTE ARQUIVO MEDE, e em que unidade:
     · a PROXIMIDADE da janela, contínua, em quatro distâncias declaradas —
       e o que interessa é ela ser maior que zero FORA da janela, porque um
       guia que só acende depois de a mira engatar não ensina nada;
     · o RAIO do aro desenhado, em metros, contra `PERP_MAX` — ele não
       representa a tolerância, ele é a tolerância em tamanho natural;
     · o ÂNGULO, em graus, entre a reta olho→ponto-vermelho e o eixo óptico,
       com o olho em cinco posições laterais diferentes: é a definição de
       colimador, e é zero para qualquer posição do olho ou não é red dot;
     · o custo em DRAW CALLS: quantos objetos a affordance pendura no grafo da
       mira × quantas vistas o renderer submete por frame (DUAS, uma por olho —
       é a unidade que E2 declara), mais o RAIO DESENHADO de cada um em metros.
       O `renderer.info` bruto fica impresso como diagnóstico, e só isso: entre
       a arma no quadril e a arma no olho mudam grama, LOD e frustum, e esse
       ruído do mundo já entrou uma vez na conta como se fosse custo da
       affordance.

   O QUE ESTE CASO NÃO CONTAVA, e foi medido por validação independente: as
   três asserções de custo eram aritmética do próprio ajudante — `vistas() >= 1`
   numa função que terminava em `|| 1`, `objs() <= 2` numa soma de dois
   booleanos, e `custo <= 2 × vistas` que é `objs × vistas ≤ 2 × vistas`.
   Pendurando TRÊS anéis de 30 cm de raio no `guiaAro` (+3 draw calls por olho,
   e um alvo vermelho de 60 cm na cara do jogador), o arquivo continuava 5 de 5
   VERDE. Hoje a contagem varre a árvore a partir de `XRArma.miraNode()` e o
   mesmo mutante dá 5 objetos / 10 draw calls contra teto de 2 / 4, com o raio
   de 0,300 m nomeado na mensagem.

   ÂNCORA INDEPENDENTE. O eixo óptico de referência é reconstruído aqui a
   partir de `WeaponRig` (os pontos `eye` e `front` do perfil da mira, que são
   calibração do MODELO desenhado) e da matriz de mundo do `gun.group` — nunca
   de `XRArma.estado().eixo`, que é gerado pelo código sob teste. Ler a mira e
   comparar com a mira é comparar uma reta consigo mesma, e nesta base isso já
   deu 1,86e-15 m de erro enquanto o desvio real era 0,12 m.

   PORTA 3672 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3672;
const f3 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '?');

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  let amostra = null;

  /* Sobe por `.parent` até a cena. A pergunta certa NÃO é `visible`: objeto com
     `visible: true` e sem pai não é desenhado por ninguém, e comentando uma
     linha um teste desta base já ficou 11 de 12 verde sobre produto quebrado. */
  const noGrafo = o => {
    for (let n = o; n; n = n.parent) if (n === MP.scene) return true;
    return false;
  };

  /* O EIXO ÓPTICO DE REFERÊNCIA, reconstruído do PERFIL DO MODELO.
     `WeaponRig.inspect` devolve o perfil calibrado contra o GLB; os pontos
     `eye` e `front` da mira ativa são geometria desenhada, não saída do módulo
     de XR. A matriz vem do `gun.group`, que é o objeto na tela. */
  function eixoDoModelo(gun) {
    const idx = G.arsenal.indexOf(gun);
    const perfil = G.WeaponRig.inspect ? G.WeaponRig.inspect(idx) : null;
    const s = G.WeaponRig.activeSight ? G.WeaponRig.activeSight(gun) : null;
    if (!s || !perfil) return null;
    const c = (gun.modelStatus === 'fallback' && s.fb) ? s.fb : s;
    if (!c || !c.eye || !c.front) return null;
    const olhoL = new T.Vector3().fromArray(c.eye);
    const frenteL = new T.Vector3().fromArray(c.front);
    const m = gun.group.matrixWorld;
    const a = olhoL.clone().applyMatrix4(m);
    const b = frenteL.clone().applyMatrix4(m);
    return { ocular: a, eixo: b.sub(a).normalize() };
  }

  const rOrig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = (cena, cam) => {
    const antesCalls = MP.renderer.info.render.calls;
    const v = rOrig(cena, cam);
    const calls = MP.renderer.info.render.calls;
    const e = G.XRArma.estado();
    const g = G.XRArma.guia();
    const gun = G.arsenal[G.gunIndex];
    const olho = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
    const ref = gun ? eixoDoModelo(gun) : null;

    /* O ÂNGULO DO COLIMADOR: entre olho→ponto e o eixo óptico DO MODELO. */
    let angPonto = null, raioAro = null, pontoNoGrafo = false, aroNoGrafo = false;
    if (g.ponto) {
      pontoNoGrafo = noGrafo(g.ponto);
      if (ref) {
        const p = g.ponto.getWorldPosition(new T.Vector3());
        const d = p.sub(olho);
        if (d.lengthSq() > 1e-12) {
          d.normalize();
          angPonto = Math.acos(Math.max(-1, Math.min(1, d.dot(ref.eixo)))) * 180 / Math.PI;
        }
      }
    }
    if (g.aro) {
      aroNoGrafo = noGrafo(g.aro);
      /* O RAIO DO ARO EM METROS, medido do atributo de posição da geometria —
         a coisa desenhada, não a constante do módulo. */
      const pos = g.aro.geometry.getAttribute('position');
      let rmax = 0;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        if (r > rmax) rmax = r;
      }
      const esc = new T.Vector3();
      g.aro.getWorldScale(esc);
      raioAro = rmax * esc.x;
    }

    amostra = {
      ads: e.ads, recuo: e.recuo, desvio: e.desvio,
      perto: g.perto, opacidade: g.opacidade,
      opacAro: g.aro ? g.aro.material.opacity : null,
      opacPonto: g.ponto ? g.ponto.material.opacity : null,
      aroNoGrafo, pontoNoGrafo, raioAro, angPonto,
      drawCalls: calls, drawCallsAntes: antesCalls,
      temRef: !!ref,
    };
    return v;
  };

  window.__AR = {
    ler: () => amostra,
    mao: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.right.position.set(x, y, z);
      d.controllers.right.quaternion.set(0, 0, 0, 1);
    },
    cabeca: (y = 1.70) => {
      const d = window.__xrEmulado;
      d.position.set(0, y, 0);
      d.quaternion.set(0, 0, 0, 1);
    },
    espera: ms => window.__A.espera(ms),
    /* Põe a OCULAR num ponto pedido do eixo do olho, perseguindo — a ocular
       fica acima e à frente do punho (sight height over bore), então "levar a
       arma ao olho" não é aproximar o controle do rosto. `recuo` é o quanto
       ATRÁS da ocular o olho fica; `lado` é o desvio lateral. */
    mirarCom: async (recuo, lado = 0, passos = 8) => {
      const dev = window.__xrEmulado;
      const alvo = new T.Vector3();
      for (let i = 0; i < passos; i++) {
        const e = G.XRArma.estado();
        const olho = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
        const oc = new T.Vector3().fromArray(e.ocular);
        const eixo = new T.Vector3().fromArray(e.eixo).normalize();
        /* o "direita" do eixo, para deslocar lateralmente de forma controlada */
        const dir = new T.Vector3().crossVectors(eixo, new T.Vector3(0, 1, 0)).normalize();
        alvo.copy(olho).addScaledVector(eixo, recuo).addScaledVector(dir, lado);
        const falta = alvo.sub(oc);
        const p = dev.controllers.right.position;
        dev.controllers.right.position.set(p.x + falta.x, p.y + falta.y, p.z + falta.z);
        await new Promise(r => setTimeout(r, 190));
      }
      await new Promise(r => setTimeout(r, 260));
      return window.__AR.ler();
    },
    constantes: () => window.__XRW,
    /* Quantas vistas o renderer submete por frame. Em sessão imersiva são
       DUAS (uma por olho), e é por isso que todo objeto custa em dobro — é a
       unidade do critério E2.

       O `|| 1` QUE ESTAVA AQUI ERA O DEFEITO. Com ele, `vistas() >= 1` era
       verdade por aritmética do próprio ajudante: fora de sessão, sem
       ArrayCamera, sem nada, a função devolvia 1 e a asserção passava. Agora
       ela devolve `null` quando não há estéreo, e o caso cobra DOIS — que é a
       unidade que E2 declara. Sem estéreo, a medida de custo em XR não vale e
       o caso tem de dizer isso em vez de fingir. */
    vistas: () => {
      const c = MP.renderer.xr.getCamera && MP.renderer.xr.getCamera();
      return (c && c.cameras && c.cameras.length) || null;
    },
    /* ================================================================
       TUDO O QUE A AFFORDANCE DESENHA, VARRIDO NO GRAFO — não os dois
       punhos que o módulo publica.

       A versão anterior contava `(aro no grafo ? 1 : 0) + (ponto no grafo ? 1
       : 0)` e cobrava `<= 2`: soma de dois booleanos contra teto 2, ou seja
       aritmética do ajudante. Validação independente pendurou TRÊS anéis de
       30 cm de raio no `guiaAro` (js/xr/xrweapon.js, `criarGuia`) — +3 draw
       calls por olho e um alvo vermelho de 60 cm na cara do jogador — e este
       arquivo continuou 5 de 5 VERDE.

       Aqui a conta desce a árvore inteira a partir do nó da mira
       (`XRArma.miraNode()`, que é o pai de tudo que a affordance pendura) e
       conta o que o renderer vai submeter: malha/linha/ponto/sprite, com
       geometria e material, VISÍVEL em toda a cadeia até a cena. Um filho
       novo entra na conta, esteja ele pendurado no aro, no ponto ou no nó.

       E mede o RAIO DESENHADO de cada um, em metros, do atributo de posição
       da geometria × escala de mundo: a affordance representa uma tolerância
       de 8,5 cm, então nada dela pode ser maior que isso. É o eixo em que o
       anel de 30 cm aparece mesmo que alguém um dia conte os objetos certo.
       ================================================================ */
    desenhaveis: () => {
      const raiz = G.XRArma.miraNode ? G.XRArma.miraNode() : null;
      const lista = [];
      if (!raiz || !noGrafo(raiz)) return lista;
      raiz.traverse(o => {
        if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite)) return;
        if (!o.material || !o.geometry) return;
        for (let n = o; n; n = n.parent) { if (!n.visible) return; if (n === MP.scene) break; }
        const pos = o.geometry.getAttribute('position');
        let rmax = 0;
        if (pos) {
          for (let i = 0; i < pos.count; i++) {
            const r = Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i));
            if (r > rmax) rmax = r;
          }
        }
        const esc = o.getWorldScale(new T.Vector3());
        lista.push({
          nome: o.name || '(sem nome)',
          raio: rmax * Math.max(Math.abs(esc.x), Math.abs(esc.y), Math.abs(esc.z)),
        });
      });
      return lista;
    },
  };
  return true;
}

describe('a janela de mira tem corpo no mundo',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, K;
    before(async () => {
      h = await bootEmVR(bootGame, {
        port: PORT,
        /* as constantes do módulo entram por import na página, para o teste
           poder cobrar o RAIO DESENHADO contra o PERP_MAX declarado */
        initScripts: [`window.__XRW_PROMISE = import('/js/xr/xrweapon.js')
          .then(m => { window.__XRW = { PERP_MAX: m.PERP_MAX, RECUO_MIN: m.RECUO_MIN,
            RECUO_MAX: m.RECUO_MAX, GUIA_FOLGA_DESVIO: m.GUIA_FOLGA_DESVIO,
            GUIA_FOLGA_RECUO: m.GUIA_FOLGA_RECUO }; });`],
      });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(900));
      K = await h.play(async () => { await window.__XRW_PROMISE; return window.__XRW; });
    });
    after(async () => { if (h) await h.close(); });

    it('a guia acende ANTES da janela e cresce conforme o olho se aproxima', async () => {
      /* Quatro desvios laterais declarados, do centro da janela para fora. O
         que este caso cobra é a MONOTONIA e, sobretudo, que o valor no meio da
         folga seja > 0: é isso que faz dela um guia, e não um carimbo de
         "acertou". */
      const linhas = [];
      for (const lado of [0, 0.06, 0.13, 0.30]) {
        const r = await h.play(async l => {
          window.__AR.cabeca(1.70);
          return window.__AR.mirarCom(0.24, l);
        }, lado);
        linhas.push({ lado, ...r });
        console.log(`  desvio pedido ${f3(lado)} m → medido ${f3(r.desvio)} m` +
          ` · perto ${f3(r.perto)} · opacidade do aro ${f3(r.opacAro)} · ads ${f3(r.ads)}`);
      }
      const [centro, perto, meio, longe] = linhas;
      assert.ok(centro.perto >= 0.99,
        `dentro da janela a proximidade tinha de ser 1: deu ${f3(centro.perto)}`);
      /* A AFIRMAÇÃO QUE IMPORTA: fora da janela (desvio > PERP_MAX) o guia
         ainda acende. Se este número for zero, a janela voltou a ser
         invisível — que é o defeito que este arquivo existe para não deixar
         voltar. */
      assert.ok(meio.desvio > K.PERP_MAX,
        `o cenário não chegou a sair da janela: desvio ${f3(meio.desvio)} m com PERP_MAX ${f3(K.PERP_MAX)}`);
      assert.ok(meio.perto > 0.05,
        `FORA da janela (desvio ${f3(meio.desvio)} m) o guia tinha de estar aceso:` +
        ` a proximidade deu ${f3(meio.perto)}`);
      assert.ok(perto.perto > meio.perto && meio.perto > longe.perto,
        `a proximidade tinha de cair monotonicamente com o desvio:` +
        ` ${f3(perto.perto)} → ${f3(meio.perto)} → ${f3(longe.perto)}`);
      /* E APAGA DE VEZ além da folga DECLARADA. O limite não é um número
         escolhido aqui: é `PERP_MAX + GUIA_FOLGA_DESVIO`, e o caso primeiro
         confirma que o cenário passou dele — senão estaria cobrando o apagão
         numa distância em que o guia legitimamente ainda acende. */
      const fim = K.PERP_MAX + K.GUIA_FOLGA_DESVIO;
      assert.ok(longe.desvio > fim,
        `o cenário não passou da folga declarada (${f3(fim)} m): foi só a ${f3(longe.desvio)} m`);
      assert.ok(longe.perto < 0.02,
        `além da folga (desvio ${f3(longe.desvio)} m > ${f3(fim)} m) o guia tinha de apagar:` +
        ` deu ${f3(longe.perto)}`);
    });

    it('o aro é a TOLERÂNCIA em tamanho natural (raio = PERP_MAX)', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        return window.__AR.mirarCom(0.30, 0.10);   // fora da janela, aro aceso
      });
      console.log(`  raio do aro desenhado ${f3(r.raioAro)} m · PERP_MAX ${f3(K.PERP_MAX)} m` +
        ` · no grafo ${r.aroNoGrafo}`);
      assert.ok(r.aroNoGrafo,
        'o aro tinha de estar NO GRAFO DA CENA (objeto sem pai não é desenhado por ninguém)');
      const err = Math.abs(r.raioAro - K.PERP_MAX);
      assert.ok(err <= 0.001,
        `o aro tinha de ter o raio da tolerância: desenhado ${f3(r.raioAro)} m contra` +
        ` PERP_MAX ${f3(K.PERP_MAX)} m (erro ${(err * 1000).toFixed(2)} mm, teto 1,00 mm)`);
    });

    it('o ponto vermelho é COLIMADO: ângulo zero para qualquer posição do olho', async () => {
      /* Cinco posições laterais do olho. Um ponto pintado no centro da mira
         (o erro comum) daria ângulo crescente com o desvio; o colimado dá zero
         nas cinco. É a diferença entre um red dot e um adesivo na lente. */
      const angs = [];
      for (const lado of [0, 0.02, 0.04, -0.03, -0.05]) {
        const r = await h.play(async l => {
          window.__AR.cabeca(1.70);
          return window.__AR.mirarCom(0.24, l);
        }, lado);
        angs.push({ lado, ang: r.angPonto, desvio: r.desvio, noGrafo: r.pontoNoGrafo, ads: r.ads });
        console.log(`  olho a ${f3(lado)} m do eixo (medido ${f3(r.desvio)} m) →` +
          ` olho→ponto contra o eixo do MODELO: ${f3(r.angPonto)}°`);
      }
      assert.ok(angs.every(a => a.noGrafo),
        'o ponto tinha de estar no grafo da cena em todas as cinco poses');
      assert.ok(angs.every(a => a.ang !== null),
        'sem eixo de referência do modelo não há o que comparar — o caso não mediu nada');
      const pior = angs.reduce((m, a) => (a.ang > m.ang ? a : m));
      assert.ok(pior.ang <= 0.5,
        `o ponto tinha de ser colimado: o pior ângulo foi ${f3(pior.ang)}° com o olho a` +
        ` ${f3(pior.desvio)} m do eixo (teto 0,5°)`);
      /* E o cenário PRECISA ter variado o desvio, senão as cinco medidas são a
         mesma medida e o caso não exercitou nada. */
      const spread = Math.max(...angs.map(a => a.desvio)) - Math.min(...angs.map(a => a.desvio));
      assert.ok(spread > 0.02,
        `o cenário não moveu o olho de verdade: os cinco desvios variaram só ${f3(spread)} m`);
    });

    it('o custo em draw calls, contado EM ESTÉREO (E2)', async () => {
      /* O DELTA BRUTO DE `renderer.info` NÃO SERVE DE MEDIDA, e a primeira
         versão deste caso caiu nessa: entre a arma no quadril e a arma no olho
         mudam grama, LOD de árvore e recorte de frustum, e o ruído do mundo
         entrou na conta como se fosse custo da affordance (deu +4 onde o aro
         sozinho explica +2). A grandeza honesta é: quantos OBJETOS meus estão
         no grafo × quantas VISTAS o renderer submete — que é exatamente a
         unidade que o critério E2 cobra, porque em XR cada objeto é desenhado
         uma vez por olho. Os números brutos ficam impressos como diagnóstico. */
      const longe = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.55, 0.95, -0.15);      // arma no quadril, bem fora
        await window.__AR.espera(900);
        return { ...window.__AR.ler(), vistas: window.__AR.vistas(), lista: window.__AR.desenhaveis() };
      });
      const dentro = await h.play(async () => {
        window.__AR.cabeca(1.70);
        const r = await window.__AR.mirarCom(0.24, 0);
        return { ...r, vistas: window.__AR.vistas(), lista: window.__AR.desenhaveis() };
      });
      const naBorda = await h.play(async () => {
        window.__AR.cabeca(1.70);
        const r = await window.__AR.mirarCom(0.30, 0.10);   // aro ACESO: o pior caso
        return { ...r, vistas: window.__AR.vistas(), lista: window.__AR.desenhaveis() };
      });
      const objs = r => r.lista.length;
      const custo = r => objs(r) * (r.vistas || 0);
      const nomes = r => (r.lista.length
        ? r.lista.map(o => `${o.nome} r=${f3(o.raio)} m`).join(', ') : '(nenhum)');
      const maiorRaio = r => r.lista.reduce((m, o) => Math.max(m, o.raio), 0);
      console.log(`  vistas submetidas por frame: ${dentro.vistas}`);
      console.log(`  quadril → objetos ${objs(longe)} → ${custo(longe)} draw calls` +
        ` (info bruto ${longe.drawCalls}) · ${nomes(longe)}`);
      console.log(`  mirando → objetos ${objs(dentro)} → ${custo(dentro)} draw calls` +
        ` (info bruto ${dentro.drawCalls}) · ${nomes(dentro)}`);
      console.log(`  PIOR CASO (aro aceso) → objetos ${objs(naBorda)} →` +
        ` ${custo(naBorda)} draw calls (info bruto ${naBorda.drawCalls}) · ${nomes(naBorda)}`);

      /* A UNIDADE DE E2 É O OLHO. Sem estéreo confirmado o custo em XR não foi
         medido — e o `|| 1` do ajudante antigo fazia esta linha passar mesmo
         sem sessão nenhuma. */
      assert.equal(dentro.vistas, 2,
        `o renderer submeteu ${dentro.vistas} vista(s) por frame: sem os DOIS olhos ` +
        'esta medida não é o custo de XR, e E2 se mede por olho');

      /* O QUE A AFFORDANCE PODE CUSTAR, e as três grandezas são independentes
         entre si: quantos objetos ela pendura PARADA, quantos no pior caso, e
         o tamanho do que ela desenha. Os três anéis de 30 cm da reinjeção
         estouram os três. */
      assert.ok(objs(longe) <= 1,
        `com a arma no quadril, longe da janela, a affordance deixou ${objs(longe)} ` +
        `objeto(s) no grafo (${nomes(longe)}): parada ela só pode custar o ponto ` +
        'colimado, ou vira imposto permanente de ' + custo(longe) + ' draw calls');
      assert.ok(objs(naBorda) <= 2,
        `no pior caso a affordance pendurou ${objs(naBorda)} objetos no grafo da ` +
        `mira (${nomes(naBorda)}): o desenho declarado é aro + ponto, ou seja 2`);
      assert.ok(custo(naBorda) <= 2 * dentro.vistas,
        `no pior caso a affordance custa ${custo(naBorda)} draw calls, acima do teto de` +
        ` ${2 * dentro.vistas} (2 objetos × ${dentro.vistas} vistas)`);

      /* E O TAMANHO. A affordance É a tolerância em tamanho natural: nada nela
         pode ser maior que `PERP_MAX`. Um objeto de 30 cm de raio pendurado
         aqui não é só custo — é um alvo de 60 cm na cara do jogador, e a
         contagem de objetos sozinha não o vê se alguém o pendurar no lugar de
         outro. */
      const raio = Math.max(maiorRaio(longe), maiorRaio(dentro), maiorRaio(naBorda));
      assert.ok(raio <= K.PERP_MAX + 0.001,
        `o maior objeto da affordance tem ${f3(raio)} m de raio, contra PERP_MAX ` +
        `${f3(K.PERP_MAX)} m: ela representa a tolerância em tamanho natural, e ` +
        'nada dela pode ser maior que ela');
    });

    it('DENTRO da janela o aro APAGA e o ponto fica cheio (o ferro assume)', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        return window.__AR.mirarCom(0.22, 0);
      });
      console.log(`  ads ${f3(r.ads)} · aro ${f3(r.opacAro)} (grafo ${r.aroNoGrafo})` +
        ` · ponto ${f3(r.opacPonto)} (grafo ${r.pontoNoGrafo})`);
      assert.ok(r.ads > 0.9,
        `o cenário não chegou a mirar: o ADS deu ${f3(r.ads)} — nada foi testado`);
      assert.ok(r.opacAro < 0.02,
        `com a mira engatada o aro tinha de apagar: opacidade ${f3(r.opacAro)}`);
      assert.equal(r.aroNoGrafo, false,
        'apagado, o aro tinha de SAIR do grafo — opacidade 0 ainda custa draw call');
      assert.ok(r.opacPonto > 0.8,
        `com a mira engatada o ponto tinha de estar cheio: opacidade ${f3(r.opacPonto)}`);
    });
  });
