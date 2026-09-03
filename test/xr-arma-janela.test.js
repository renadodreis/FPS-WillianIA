/* ================================================================
   O RED DOT SÓ EXISTE ATRAVÉS DA JANELA — e não há aro nenhum.

   HISTÓRICO. Este arquivo nasceu para provar que a janela de mira "deixava de
   ser invisível": um ARO AZUL de tolerância aceso ANTES da janela e um ponto
   vermelho a 25 % em QUALQUER pose. O dono testou no aparelho (2026-08-30):
   "existe um arco azul ao redor da arma, existe um ponto vermelho no meio da
   tela... que porra é essa? isso é jogável pra você???". Fotografado no kit
   emulado (2026-09-03): com a arma no quadril, ocular a 0,292 m do olho, o
   ponto estava NO GRAFO com opacidade 0,25 — um ponto flutuando no ar, 20 cm
   à frente do rosto, seguindo a direção do cano. Nenhum FPS de VR desenha
   tolerância em volta da óptica, e nenhum red dot real mostra o ponto de
   fora da janela. Os dois eram andaime de tutorial virado produto.

   SEGUNDA RODADA, MESMO DIA: o dono recusou QUALQUER retículo desenhado —
   "agora tem uma mira vermelha... eu NÃO QUERO ISSO... a arma já tem mira,
   precisa ser uma mira natural de JOGOS de fps... quando mirar deveríamos
   ver por ELE". O circle-dot saiu junto. A mira é o ferro/óptica do MODELO
   (o `eye`/`front` do perfil de js/weaponrig.js), e o ADS por botão põe o
   olho sobre essa reta. É o que Onward, Pavlov, Contractors e Alyx fazem.

   O QUE ESTE ARQUIVO MEDE AGORA, e em que unidade:
     · em TRÊS poses (quadril, borda da janela, mirando) o nó da mira não tem
       NENHUM objeto desenhável pendurado — contado no grafo, em estéreo
       (DUAS vistas, a unidade que E2 declara), e `guia().aro`/`.ponto` são
       nulos por contrato;
     · tirar o desenho não tirou a MIRA: mirando, o ADS físico engata (> 0,9)
       e o OLHO fica a ≤ 2 cm do eixo óptico do MODELO; fora da janela o ADS
       fica em zero. O eixo é reconstruído do perfil, nunca do módulo.

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

    let desvioModelo = null, recuoModelo = null;
    if (ref) {
      const d = olho.clone().sub(ref.ocular);
      const proj = d.dot(ref.eixo);
      recuoModelo = -proj;
      desvioModelo = d.addScaledVector(ref.eixo, -proj).length();
    }
    amostra = {
      ads: e.ads, recuo: e.recuo, desvio: e.desvio, desvioModelo, recuoModelo,
      aroNulo: !g.aro, pontoNulo: !g.ponto,
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

describe('a mira não pendura NADA no mundo — a mira é a do modelo',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, K;
    before(async () => {
      h = await bootEmVR(bootGame, {
        port: PORT,
        initScripts: [`window.__XRW_PROMISE = import('/js/xr/xrweapon.js')
          .then(m => { window.__XRW = { PERP_MAX: m.PERP_MAX, RECUO_MIN: m.RECUO_MIN,
            RECUO_MAX: m.RECUO_MAX }; });`],
      });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(900));
      K = await h.play(async () => { await window.__XRW_PROMISE; return window.__XRW; });
    });
    after(async () => { if (h) await h.close(); });

    it('em NENHUMA pose há objeto pendurado no nó da mira (quadril, borda, mirando) — E2 em estéreo', async () => {
      /* Reinjetando qualquer desenho (o ponto colimado, o aro azul, um
         circle-dot), a varredura do grafo o encontra na pose em que ele
         acende e este caso morre com o nome e o raio do objeto. */
      const poses = [];
      for (const [recuo, lado, nome] of [[0.60, 0.40, 'quadril'], [0.30, 0.10, 'borda'], [0.22, 0, 'mirando']]) {
        const r = await h.play(async (rc, l) => {
          window.__AR.cabeca(1.70);
          const m = await window.__AR.mirarCom(rc, l);
          return { ...m, lista: window.__AR.desenhaveis(), vistas: window.__AR.vistas() };
        }, recuo, lado);
        poses.push({ nome, ...r });
        console.log(`  ${nome}: ads ${f3(r.ads)} · desvio ${f3(r.desvio)} m · objetos [` +
          r.lista.map(o => `${o.nome} r=${f3(o.raio)}`).join(', ') + `] · vistas ${r.vistas}`);
      }
      const mirando = poses[2];
      assert.equal(mirando.vistas, 2,
        `o renderer submeteu ${mirando.vistas} vista(s) por frame: sem os DOIS olhos esta medida não é XR`);
      assert.ok(mirando.ads > 0.9, `o cenário "mirando" não mirou (ads ${f3(mirando.ads)}) — nada foi testado`);
      for (const p of poses) {
        assert.equal(p.aroNulo, true, `${p.nome}: \`guia().aro\` tinha de ser nulo`);
        assert.equal(p.pontoNulo, true, `${p.nome}: \`guia().ponto\` tinha de ser nulo — o dono recusou retículo desenhado`);
        assert.equal(p.lista.length, 0,
          `${p.nome}: ${p.lista.length} objeto(s) pendurado(s) na mira (` +
          p.lista.map(o => `${o.nome} r=${f3(o.raio)} m`).join(', ') + '): custa ' +
          `${p.lista.length * p.vistas} draw calls e é desenho que o dono não quer`);
      }
    });

    it('tirar o desenho não tirou a MIRA: mirando, o olho fica sobre o eixo do MODELO; fora da janela, ADS zero', async () => {
      const dentro = await h.play(async () => {
        window.__AR.cabeca(1.70);
        return window.__AR.mirarCom(0.22, 0);
      });
      const fora = await h.play(async () => {
        window.__AR.cabeca(1.70);
        return window.__AR.mirarCom(0.24, 0.30);
      });
      console.log(`  mirando: ads ${f3(dentro.ads)} · olho contra o eixo do MODELO: recuo ${f3(dentro.recuoModelo)} m, desvio ${f3(dentro.desvioModelo)} m`);
      console.log(`  fora:    ads ${f3(fora.ads)} · desvio ${f3(fora.desvio)} m`);
      assert.ok(dentro.desvioModelo !== null, 'sem eixo de referência do modelo não há o que comparar');
      assert.ok(dentro.ads > 0.9, `com o olho na janela o ADS tinha de engatar: ${f3(dentro.ads)}`);
      assert.ok(dentro.desvioModelo <= 0.02,
        `mirando, o olho ficou ${f3(dentro.desvioModelo)} m fora do eixo do MODELO (teto 0,020)`);
      assert.ok(dentro.recuoModelo >= K.RECUO_MIN && dentro.recuoModelo <= K.RECUO_MAX,
        `o olho ficou a ${f3(dentro.recuoModelo)} m atrás da ocular, fora de [${K.RECUO_MIN}; ${K.RECUO_MAX}]`);
      assert.ok(fora.desvio > K.PERP_MAX, `o cenário "fora" não saiu da janela (desvio ${f3(fora.desvio)} m)`);
      assert.ok(fora.ads < 0.1, `fora da janela o ADS tinha de ficar em zero: ${f3(fora.ads)}`);
    });
  });
