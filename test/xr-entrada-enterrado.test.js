/* ================================================================
   SONDA — "O BONECO ENTRA NO VR ENTERRADO ATÉ A METADE DO CORPO".

   Relato do dono, repetido desde o começo do porte e ainda não resolvido:
   "ainda sinto que o personagem está enterrado, metade do corpo, isso
   precisa ser resolvido com prioridade, assim que entra em modo VR ele já
   entra desta forma".

   POR QUE NENHUM TESTE DESTA BASE PEGOU ISSO. Todo arquivo de VR daqui usa
   `bootEmVR(...)`, que por padrão chama `forceStart()` logo depois de entrar
   na sessão — ou seja, TODOS medem o jogo JÁ RODANDO. O estado que o dono
   descreve é o do INSTANTE DA ENTRADA, antes de a partida começar, e ele
   nunca teve teste. É exatamente a lição já registrada no CLAUDE.md ("teste
   verde não prova tela certa... o buraco não era de cobertura de código, era
   de cobertura de ESTADO"), repetida.

   O QUE ESTA SONDA MEDE, e nada aqui é proxy:
     · a altura do OLHO acima do chão do mundo, no instante da entrada;
     · a altura dos PÉS do boneco acima do mesmo chão;
     · o ponto mais baixo da MALHA do boneco contra o chão;
     · o tipo de espaço de referência que a sessão realmente concedeu;
     · a altura do RIG contra o terreno debaixo dele.

   A régua é o terreno do jogo (`heightAt`/`groundAt`), que existe antes e
   fora do código de XR — não é o próprio rig comparado consigo mesmo.

   PORTA 3860 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3860;

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  window.__EN = {
    /* Tudo medido DEPOIS do render, que é quando a pose da câmera já foi
       escrita pelo three (antes disso a leitura compõe rig(N) com pose(N−1)). */
    ler: () => {
      MP.camera.updateWorldMatrix(true, false);
      const olho = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
      const chao = MP.heightAt ? MP.heightAt(olho.x, olho.z) : null;
      const rig = G.XR.rig ? G.XR.rig.position.clone() : null;
      const corpo = G.FpBody && G.FpBody.bodyRoot ? G.FpBody.bodyRoot : null;
      let pesY = null, malhaY = null;
      if (corpo) {
        corpo.updateWorldMatrix(true, true);
        const B = G.FpBody.bones;
        if (B && B.footL && B.footR) {
          pesY = Math.min(
            B.footL.getWorldPosition(new T.Vector3()).y,
            B.footR.getWorldPosition(new T.Vector3()).y);
        }
        /* ponto mais baixo da malha, por vértice skinado — `Box3` num
           SkinnedMesh devolve caixa CONGELADA na primeira pose pedida */
        let min = Infinity;
        corpo.traverse(o => {
          if (!o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
          const pos = o.geometry.attributes.position, v = new T.Vector3();
          const passo = Math.max(1, Math.floor(pos.count / 400));
          for (let i = 0; i < pos.count; i += passo) {
            o.getVertexPosition(i, v);
            o.localToWorld(v);
            if (v.y < min) min = v.y;
          }
        });
        malhaY = Number.isFinite(min) ? min : null;
      }
      return {
        olhoY: olho.y, olhoX: olho.x, olhoZ: olho.z,
        chao,
        olhoAcimaDoChao: chao === null ? null : olho.y - chao,
        rigY: rig ? rig.y : null,
        rigAcimaDoChao: (rig && chao !== null) ? rig.y - chao : null,
        pesAcimaDoChao: (pesY !== null && chao !== null) ? pesY - chao : null,
        malhaAcimaDoChao: (malhaY !== null && chao !== null) ? malhaY - chao : null,
        corpoNaCena: !!(corpo && corpo.parent),
        corpoVisivel: !!(corpo && corpo.visible),
        playerY: MP.player.pos.y,
        started: G.state.started,
        presenting: G.XR.presenting,
        espaco: (() => {
          const s = MP.renderer.xr.getSession && MP.renderer.xr.getSession();
          return s ? (MP.renderer.xr.getReferenceSpace ? 'obtido' : '?') : 'sem sessão';
        })(),
        tipoEspaco: MP.renderer.xr.getReferenceSpaceType
          ? MP.renderer.xr.getReferenceSpaceType() : 'sem getter',
      };
    },
    espera: ms => new Promise(r => setTimeout(r, ms)),
    comecar: () => { window.__game.forceStart(); },
    /* ALTURA DO HEADSET NA ENTRADA. O runtime emulado nasce em 1,60 m; um
       jogador de 1,85 m tem o olho perto de 1,75. É a única variável que o
       emulado fixa e o mundo real não — e a suspeita é que o boneco só fecha
       na altura em que o emulado nasce. */
    altura: y => { window.__xrEmulado.position.set(0, y, 0); },
    /* O CHÃO CALCULADO CONTRA O CHÃO DESENHADO. Toda a régua desta base
       compara o corpo com `heightAt`, que é a altura que o jogo CALCULA. O
       jogador enxerga a MALHA do terreno. Se as duas divergirem, tudo mede
       certo e ele vê metade do corpo enterrada — que é exatamente o relato.
       Aqui um raio vertical procura a superfície de verdade. */
    chaoDesenhado: () => {
      MP.camera.updateWorldMatrix(true, false);
      const olho = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
      const rc = new T.Raycaster(
        new T.Vector3(olho.x, olho.y + 50, olho.z), new T.Vector3(0, -1, 0), 0, 200);
      const alvos = [];
      MP.scene.traverse(o => {
        if (o.isMesh && o.visible && o.geometry && !o.isSkinnedMesh) alvos.push(o);
      });
      const hits = rc.intersectObjects(alvos, false)
        .filter(h => h.object !== (G.FpBody && G.FpBody.bodyRoot))
        .slice(0, 4)
        .map(h => ({ y: h.point.y, nome: h.object.name || h.object.type,
          inst: !!h.object.isInstancedMesh }));
      return {
        calculado: MP.heightAt ? MP.heightAt(olho.x, olho.z) : null,
        groundAt: MP.groundAt ? MP.groundAt(olho.x, olho.z, olho.y) : null,
        desenhado: hits.length ? hits[0].y : null,
        alvos: alvos.length,
        hits,
        olhoY: olho.y,
      };
    },
    recalibrar: () => { if (window.__game.XR.corpo.calibrar) window.__game.XR.corpo.calibrar(); },
  };
  return true;
}

describe('SONDA — o estado do corpo NO INSTANTE DA ENTRADA em VR', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    /* `emJogo: false` é o ponto inteiro deste arquivo: mede o que o jogador vê
       ao entrar, ANTES de a partida começar. Todo o resto da suíte mede depois. */
    h = await bootEmVR(bootGame, { port: PORT, emJogo: false });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('logo ao ENTRAR (menu, sem partida)', async () => {
    for (const ms of [0, 500, 1500, 3000]) {
      const r = await h.play(async t => {
        if (t) await window.__EN.espera(t);
        return window.__EN.ler();
      }, ms);
      console.log(`  +${String(ms).padStart(4)} ms · espaço "${r.tipoEspaco}" · started ${r.started}` +
        ` · olho ${r.olhoY === null ? '?' : r.olhoY.toFixed(3)} (chão ${r.chao === null ? '?' : r.chao.toFixed(3)})` +
        ` → olho acima do chão ${r.olhoAcimaDoChao === null ? '?' : r.olhoAcimaDoChao.toFixed(3)} m` +
        ` · rig ${r.rigAcimaDoChao === null ? '?' : r.rigAcimaDoChao.toFixed(3)}` +
        ` · pés ${r.pesAcimaDoChao === null ? '?' : r.pesAcimaDoChao.toFixed(3)}` +
        ` · malha ${r.malhaAcimaDoChao === null ? '?' : r.malhaAcimaDoChao.toFixed(3)}` +
        ` · corpo naCena ${r.corpoNaCena} visível ${r.corpoVisivel} · player.y ${r.playerY.toFixed(3)}`);
    }
  });

  it('VARRENDO A ALTURA DO JOGADOR na entrada — 1,40 a 1,90 m', async () => {
    for (const y of [1.40, 1.55, 1.60, 1.70, 1.75, 1.85, 1.90]) {
      const r = await h.play(async alt => {
        window.__EN.altura(alt);
        await window.__EN.espera(700);
        window.__EN.recalibrar();
        await window.__EN.espera(700);
        return window.__EN.ler();
      }, y);
      console.log(`  headset ${y.toFixed(2)} m → olho acima do chão ` +
        `${r.olhoAcimaDoChao === null ? '?' : r.olhoAcimaDoChao.toFixed(3)}` +
        ` · pés ${r.pesAcimaDoChao === null ? '?' : r.pesAcimaDoChao.toFixed(3)}` +
        ` · MALHA ${r.malhaAcimaDoChao === null ? '?' : r.malhaAcimaDoChao.toFixed(3)} m`);
    }
  });

  it('O CHÃO CALCULADO É O CHÃO DESENHADO?', async () => {
    const r = await h.play(async () => {
      window.__EN.altura(1.70);
      await window.__EN.espera(800);
      return window.__EN.chaoDesenhado();
    });
    console.log(`  olho ${r.olhoY.toFixed(3)} · heightAt ${r.calculado === null ? '?' : r.calculado.toFixed(3)}` +
      ` · groundAt ${r.groundAt === null ? '?' : r.groundAt.toFixed(3)}` +
      ` · DESENHADO ${r.desenhado === null ? 'nenhum hit' : r.desenhado.toFixed(3)}` +
      ` · divergência ${(r.desenhado === null || r.calculado === null) ? '?' : (r.desenhado - r.calculado).toFixed(3)} m` +
      ` · alvos ${r.alvos}`);
    for (const h2 of r.hits) {
      console.log(`      hit y=${h2.y.toFixed(3)} "${h2.nome}"${h2.inst ? ' (instanced)' : ''}`);
    }
  });

  it('CALIBRAR ALTO e depois VESTIR — a hipótese do boneco gigante', async () => {
    /* Em uso real o jogador clica "entrar em VR" com o headset na MÃO ou na
       MESA, e só depois veste. Se a calibração da altura acontecer naquele
       instante, o boneco é dimensionado para um jogador que não existe. */
    for (const [calib, usa] of [[2.20, 1.70], [1.90, 1.70], [1.70, 1.70], [1.20, 1.70], [0.80, 1.70]]) {
      const r = await h.play(async par => {
        window.__EN.altura(par[0]);
        await window.__EN.espera(600);
        window.__EN.recalibrar();
        await window.__EN.espera(400);
        window.__EN.altura(par[1]);
        await window.__EN.espera(900);
        return window.__EN.ler();
      }, [calib, usa]);
      console.log(`  calibrou a ${calib.toFixed(2)} e usa a ${usa.toFixed(2)} →` +
        ` olho ${r.olhoAcimaDoChao === null ? '?' : r.olhoAcimaDoChao.toFixed(3)}` +
        ` · pés ${r.pesAcimaDoChao === null ? '?' : r.pesAcimaDoChao.toFixed(3)}` +
        ` · MALHA ${r.malhaAcimaDoChao === null ? '?' : r.malhaAcimaDoChao.toFixed(3)} m`);
    }
  });

  it('depois de COMEÇAR a partida', async () => {
    await h.play(() => window.__EN.comecar());
    for (const ms of [500, 2000]) {
      const r = await h.play(async t => {
        await window.__EN.espera(t);
        return window.__EN.ler();
      }, ms);
      console.log(`  +${String(ms).padStart(4)} ms · started ${r.started}` +
        ` · olho acima do chão ${r.olhoAcimaDoChao === null ? '?' : r.olhoAcimaDoChao.toFixed(3)} m` +
        ` · rig ${r.rigAcimaDoChao === null ? '?' : r.rigAcimaDoChao.toFixed(3)}` +
        ` · pés ${r.pesAcimaDoChao === null ? '?' : r.pesAcimaDoChao.toFixed(3)}` +
        ` · malha ${r.malhaAcimaDoChao === null ? '?' : r.malhaAcimaDoChao.toFixed(3)}` +
        ` · corpo naCena ${r.corpoNaCena} visível ${r.corpoVisivel} · player.y ${r.playerY.toFixed(3)}`);
    }
  });
});
