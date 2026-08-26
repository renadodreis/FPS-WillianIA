/* ================================================================
   QA — A ARMA NA MÃO E A MIRA DE VERDADE, DENTRO DE UMA SESSÃO IMERSIVA.

   Roda no runtime emulado oficial (IWER, o kit da Meta), em sessão
   `immersive-vr` de verdade no Chrome, com controles Touch sintéticos e
   POSES controláveis (`window.__xrEmulado.controllers.left/right`).

   TRÊS REGRAS QUE ESTE ARQUIVO SEGUE, E QUE FORAM APRENDIDAS DO JEITO CARO:

   1. MEDIR A COISA, NÃO UM PROXY. Para mira, o que vale é ÂNGULO e
      ALINHAMENTO — nunca "atirou" ou "andou X metros". O teste que media
      distância deixou passar movimento invertido com a suíte verde.
   2. NADA DE DUBLÊ ESCRITO À MÃO para API de navegador. Quem entrega
      `inputSources`, `gripSpace` e pose é o runtime.
   3. DENTRO DA SESSÃO NÃO SE CHAMA `tick` NA MÃO: quem chama o frame é a
      sessão. Aqui se espera TEMPO e se lê o efeito.

   O QUE ESTÁ SENDO COBRADO (e por que cada um existe):

   · a arma fica NO PUNHO — a âncora `gripR` do perfil tem que coincidir com
     o `gripSpace` do controle. Antes ela herdava a pose de PC (hip do fuzil
     = 0.26, −0.185, −0.44 relativos ao OLHO) e flutuava meio metro à frente
     da mão: era a queixa "o corpo onde segura a arma parece deslocado".
   · o tiro sai da LINHA DE MIRA da arma — a origem é a ocular e o raio passa
     pela massa de mira. Sem isso, alinhar as miras é decoração: a bala saía
     do raio do controle, que não tem relação nenhuma com o desenho da arma.
   · o cano aponta para onde o CONTROLE aponta (memória muscular preservada),
     e com as duas mãos passa a apontar pela LINHA ENTRE AS MÃOS (Onward).
   · mirar é FÍSICO: encostar a arma no olho liga o ADS; braço estendido pro
     lado desliga. Nada de FOV animado por botão.
   · a arma não entra na cara.
   · sair do VR devolve o desktop intacto.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3430;

const GRAUS = r => (r * 180) / Math.PI;
const norm = v => { const m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a, b) => Math.hypot(...sub(a, b));
const anguloEntre = (a, b) => GRAUS(Math.acos(Math.max(-1, Math.min(1, dot(norm(a), norm(b))))));

/* distância de um PONTO até a RETA (origem, direção) — a medida honesta de
   "o raio passa pela mira?"; comparar só posições não responde isso */
function distanciaAReta(ponto, origem, direcao) {
  const d = norm(direcao);
  const v = sub(ponto, origem);
  const t = dot(v, d);
  return Math.hypot(v[0] - d[0] * t, v[1] - d[1] * t, v[2] - d[2] * t);
}

/* Ferramentas instaladas NA PÁGINA. Ficam em `window.__W` para que os testes
   sejam funções normais: `page.evaluate` com string ignora argumentos, e
   interpolar código traz de volta a costura frágil que o kit veio eliminar. */
function instalarFerramentas() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;

  function indice(qual) {
    const s = MP.renderer.xr.getSession();
    const fontes = Array.from(s.inputSources);
    for (let i = 0; i < fontes.length; i++) if (fontes[i] && fontes[i].handedness === qual) return i;
    return -1;
  }
  /* O objeto do PUNHO vem do `gripSpace` — o espaço que a spec manda usar
     para renderizar o que está na mão ("the origin rests at their palm"). */
  function objeto(qual, tipo) {
    const i = indice(qual);
    if (i < 0) return null;
    const o = tipo === 'punho' ? MP.renderer.xr.getControllerGrip(i) : MP.renderer.xr.getController(i);
    o.updateWorldMatrix(true, false);
    return o;
  }
  const pos = o => o.getWorldPosition(new T.Vector3()).toArray();
  const quat = o => o.getWorldQuaternion(new T.Quaternion()).toArray();
  const frente = o => new T.Vector3(0, 0, -1).applyQuaternion(o.getWorldQuaternion(new T.Quaternion())).toArray();

  function coordsDaMira() {
    const gun = G.gun;
    const s = G.WeaponRig.activeSight(gun);
    if (!s) return null;
    return (gun.modelStatus === 'fallback' && s.fb) ? s.fb : s;
  }
  /* Ocular, massa de mira e eixo óptico da arma NO MUNDO, lidos da matriz do
     próprio modelo — não do módulo de XR. Assim o teste não confere o
     implementador consigo mesmo. */
  function miraDaArma() {
    const c = coordsDaMira();
    if (!c) return null;
    const gun = G.gun;
    gun.group.updateWorldMatrix(true, false);
    const eye = new T.Vector3().fromArray(c.eye).applyMatrix4(gun.group.matrixWorld);
    const front = new T.Vector3().fromArray(c.front).applyMatrix4(gun.group.matrixWorld);
    return {
      ocular: eye.toArray(),
      massa: front.toArray(),
      eixo: front.clone().sub(eye).normalize().toArray(),
    };
  }
  function ancora(nome) {
    const p = G.WeaponRig.inspect(G.gunIndex);
    if (!p || !p.anchors || !p.anchors[nome]) return null;
    const gun = G.gun;
    gun.group.updateWorldMatrix(true, false);
    return new T.Vector3().fromArray(p.anchors[nome]).applyMatrix4(gun.group.matrixWorld).toArray();
  }

  /* Move um controle usando coordenadas de MUNDO. A pose que o IWER aceita é
     no espaço de referência (= local do rig), então a conversão passa pelo
     rig — sem isso, todo teste sairia deslocado assim que o jogador andasse. */
  function porControle(qual, posMundo, quatMundo) {
    const dev = window.__xrEmulado;
    const rig = G.XR.rig;
    rig.updateWorldMatrix(true, false);
    if (posMundo) {
      const v = new T.Vector3().fromArray(posMundo);
      rig.worldToLocal(v);
      dev.controllers[qual].position.set(v.x, v.y, v.z);
    }
    if (quatMundo) {
      const q = new T.Quaternion().fromArray(quatMundo);
      q.premultiply(rig.getWorldQuaternion(new T.Quaternion()).invert());
      dev.controllers[qual].quaternion.set(q.x, q.y, q.z, q.w);
    }
  }
  function cabeca() {
    G.camera.updateWorldMatrix(true, false);
    return {
      pos: G.camera.getWorldPosition(new T.Vector3()).toArray(),
      frente: G.camera.getWorldDirection(new T.Vector3()).toArray(),
      quat: G.camera.getWorldQuaternion(new T.Quaternion()).toArray(),
    };
  }

  window.__W = {
    objeto, pos, quat, frente, miraDaArma, ancora, porControle, cabeca,
    punho: qual => { const o = objeto(qual, 'punho'); return o ? pos(o) : null; },
    raio: qual => { const o = objeto(qual, 'raio'); return o ? { pos: pos(o), frente: frente(o), quat: quat(o) } : null; },
    /* leva a arma até a pose pedida por ITERAÇÃO: a rotação do punho move a
       ocular, então uma correção só não fecha. Duas/três fecham (é translação
       rígida depois que o ângulo estabiliza). */
    async levar(alvoOcular, quatMundo, voltas) {
      for (let i = 0; i < (voltas || 4); i++) {
        const m = miraDaArma();
        const p = objeto('right', 'punho');
        if (!m || !p) return false;
        const atual = m.ocular, mao = pos(p);
        const destino = [mao[0] + alvoOcular[0] - atual[0], mao[1] + alvoOcular[1] - atual[1], mao[2] + alvoOcular[2] - atual[2]];
        porControle('right', destino, quatMundo);
        await window.__A.espera(110);
      }
      return true;
    },
    async solta() {
      const c = cabeca();
      // braço estendido pro lado direito, cotovelo baixo: longe do olho
      porControle('right', [c.pos[0] + 0.55, c.pos[1] - 0.45, c.pos[2] - 0.35], c.quat);
      porControle('left', [c.pos[0] - 0.55, c.pos[1] - 0.5, c.pos[2] - 0.2], c.quat);
      await window.__A.espera(250);
    },
  };
  return true;
}

describe('arma e mira em VR (IWER, sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarFerramentas);
    await h.play(() => window.__W.solta());
  });
  after(async () => { if (h) await h.close(); });

  it('o jogo usa o gripSpace do controle — o espaço que a spec manda para o que está na mão', async () => {
    const r = await h.play(() => {
      const W = window.__W;
      const p = W.objeto('right', 'punho'), raio = W.objeto('right', 'raio');
      return {
        temPunho: !!p,
        punhoVisivel: !!(p && p.visible),
        distanciaPunhoRaio: p && raio ? W.pos(p).map((v, i) => v - W.pos(raio)[i]) : null,
      };
    });
    assert.ok(r.temPunho, 'a sessão não entregou gripSpace para a mão direita');
    assert.ok(r.punhoVisivel,
      'o objeto do punho existe mas nunca recebeu pose: ele precisa ser criado ANTES de setSession (ver js/xr/xrhands.js)');
  });

  it('a ARMA está no PUNHO: a âncora gripR coincide com a palma, não meio metro à frente', async () => {
    const r = await h.play(async () => {
      const W = window.__W;
      const c = W.cabeca();
      await W.levar([c.pos[0], c.pos[1] - 0.25, c.pos[2] - 0.45], c.quat, 4);
      return { ancoraPunho: W.ancora('gripR'), palma: W.punho('right') };
    });
    assert.ok(r.ancoraPunho, 'o perfil da arma não tem âncora gripR');
    const d = dist(r.ancoraPunho, r.palma);
    assert.ok(d < 0.05,
      `a empunhadura da arma está a ${d.toFixed(3)} m da palma — a arma não está na mão. ` +
      'Sintoma clássico de herdar a pose de PC (relativa ao OLHO) num pai que é a MÃO.');
  });

  it('a mira do jogo NASCE na ocular da arma, não no controle', async () => {
    const r = await h.play(async () => {
      const W = window.__W;
      const c = W.cabeca();
      await W.levar([c.pos[0], c.pos[1] - 0.25, c.pos[2] - 0.45], c.quat, 4);
      return { mira: window.__game.mira(), arma: W.miraDaArma(), raio: W.raio('right') };
    });
    assert.ok(r.arma, 'a arma ativa não tem perfil de mira');
    const dOcular = dist(r.mira.origem, r.arma.ocular);
    assert.ok(dOcular < 0.03,
      `a origem do tiro está a ${dOcular.toFixed(3)} m da ocular da arma — o tiro não sai da linha de mira`);
    const dRaio = dist(r.mira.origem, r.raio.pos);
    assert.ok(dRaio > 0.05,
      `a origem do tiro ainda é o raio do controle (${dRaio.toFixed(3)} m de distância da ocular)`);
  });

  it('o raio do tiro PASSA PELA MASSA DE MIRA — alinhar as miras é a mecânica, não decoração', async () => {
    const r = await h.play(async () => {
      const W = window.__W;
      const c = W.cabeca();
      await W.levar([c.pos[0], c.pos[1] - 0.25, c.pos[2] - 0.45], c.quat, 4);
      return { mira: window.__game.mira(), arma: W.miraDaArma() };
    });
    const desvio = distanciaAReta(r.arma.massa, r.mira.origem, r.mira.direcao);
    assert.ok(desvio < 0.006,
      `o tiro passa a ${(desvio * 1000).toFixed(1)} mm da massa de mira: olhar pelo ferro não aponta para onde a bala vai`);
    const ang = anguloEntre(r.mira.direcao, r.arma.eixo);
    assert.ok(ang < 0.5,
      `o tiro sai ${ang.toFixed(2)}° fora do eixo óptico da arma`);
  });

  it('com UMA mão o cano aponta para onde o CONTROLE aponta (a memória muscular do jogador)', async () => {
    const r = await h.play(async () => {
      const W = window.__W, T = window.__MP.THREE;
      const c = W.cabeca();
      await W.solta();
      // gira o controle 35° para a esquerda e 12° para baixo, longe da mão de apoio
      const q = new T.Quaternion().setFromEuler(new T.Euler(-0.21, 0.61, 0, 'YXZ')).toArray();
      W.porControle('right', [c.pos[0] + 0.30, c.pos[1] - 0.35, c.pos[2] - 0.40], q);
      await window.__A.espera(300);
      return { mira: window.__game.mira(), raio: W.raio('right'), duasMaos: window.__game.XRArma.estado().duasMaos };
    });
    assert.equal(r.duasMaos, false, 'a mão de apoio engatou sozinha, longe do guarda-mão');
    const ang = anguloEntre(r.mira.direcao, r.raio.frente);
    assert.ok(ang < 3,
      `o cano aponta ${ang.toFixed(2)}° fora da direção do controle: apontar o controle deixou de mirar`);
  });

  it('DUAS MÃOS: a direção passa a ser a linha entre as mãos (Onward/Pavlov)', async () => {
    const r = await h.play(async () => {
      const W = window.__W, T = window.__MP.THREE;
      const c = W.cabeca();
      await W.solta();
      const q = new T.Quaternion().setFromEuler(new T.Euler(-0.1, 0.25, 0, 'YXZ')).toArray();
      W.porControle('right', [c.pos[0] + 0.15, c.pos[1] - 0.35, c.pos[2] - 0.35], q);
      await window.__A.espera(220);
      // mão de apoio sobe DEPOIS, no guarda-mão da arma, e desviada do eixo
      for (let i = 0; i < 4; i++) {
        const alvo = W.ancora('supportHand');
        if (!alvo) return null;
        W.porControle('left', [alvo[0] - 0.09, alvo[1] + 0.05, alvo[2] - 0.02], q);
        await window.__A.espera(140);
      }
      return {
        mira: window.__game.mira(),
        estado: window.__game.XRArma.estado(),
        maoP: W.punho('right'), maoA: W.punho('left'),
        raio: W.raio('right'),
      };
    });
    assert.ok(r, 'o perfil da arma não tem âncora supportHand');
    assert.equal(r.estado.duasMaos, true,
      'a mão de apoio encostou no guarda-mão e a arma não engatou as duas mãos');
    const entreMaos = sub(r.maoA, r.maoP);
    const angEntreMaos = anguloEntre(r.mira.direcao, entreMaos);
    const angControle = anguloEntre(r.mira.direcao, r.raio.frente);
    assert.ok(angEntreMaos < 6,
      `com as duas mãos o cano ficou ${angEntreMaos.toFixed(2)}° fora da linha entre as mãos`);
    assert.ok(angControle > angEntreMaos,
      `a segunda mão não mudou nada: ${angControle.toFixed(2)}° do controle contra ${angEntreMaos.toFixed(2)}° da linha entre as mãos`);
  });

  it('mirar é FÍSICO: trazer a arma ao olho liga o ADS; braço estendido desliga', async () => {
    const perto = await h.play(async () => {
      const W = window.__W;
      await W.solta();                 // mão de apoio FORA: aqui o cenário é de uma mão só
      const c = W.cabeca();
      await W.levar([c.pos[0] + c.frente[0] * 0.28, c.pos[1] + c.frente[1] * 0.28, c.pos[2] + c.frente[2] * 0.28], c.quat, 5);
      await window.__A.espera(220);
      const e = window.__game.XRArma.estado();
      return { ads: e.ads, mirando: e.mirando, aiming: window.__game.mouse.aiming, desvio: e.desvio };
    });
    assert.ok(perto.mirando,
      `arma na altura do olho e alinhada, e o jogo não considerou que está mirando (desvio ${(perto.desvio || 0).toFixed(3)} m)`);
    assert.ok(perto.ads > 0.6, `ADS só chegou a ${perto.ads.toFixed(2)} com a arma no olho`);
    assert.equal(perto.aiming, true, 'o ADS físico não chegou no jogo (mouse.aiming continua falso)');

    const longe = await h.play(async () => {
      await window.__W.solta();
      await window.__A.espera(250);
      const e = window.__game.XRArma.estado();
      return { ads: e.ads, mirando: e.mirando, aiming: window.__game.mouse.aiming };
    });
    assert.equal(longe.mirando, false, 'braço estendido pro lado e o jogo ainda acha que está mirando');
    assert.ok(longe.ads < 0.2, `ADS não caiu com o braço estendido: ${longe.ads.toFixed(2)}`);
  });

  /* A arma NÃO é empurrada para fora da cara: empurrar desgruda a arma da mão,
     que é o defeito que esta rodada veio consertar. Ela SOME — é o que o plano
     próximo da câmera já faria, com margem. O que se cobra aqui é o produto:
     enfiar a arma na cara não pode mostrar o interior do modelo. */
  it('arma enfiada na cara SOME em vez de mostrar o interior do modelo', async () => {
    const r = await h.play(async () => {
      const W = window.__W;
      await W.solta();
      const c = W.cabeca();
      await W.levar(c.pos, c.quat, 5);
      await window.__A.espera(200);
      const e = window.__game.XRArma.estado();
      return {
        d: 0, naCara: e.naCara, visivel: window.__MP.weaponRoot.visible,
        cabeca: W.cabeca().pos, ocular: e.ocular,
      };
    });
    const d = dist(r.cabeca, r.ocular);
    assert.ok(d < 0.12, `o cenário do teste não conseguiu enfiar a arma na cara (ficou a ${d.toFixed(3)} m)`);
    assert.equal(r.naCara, true, 'a arma está dentro da cabeça e o módulo não percebeu');
    assert.equal(r.visivel, false, 'a arma dentro da cabeça continuou desenhando: o jogador vê o interior do modelo');
  });

  it('e volta a aparecer assim que sai da cara', async () => {
    const r = await h.play(async () => {
      const W = window.__W;
      await W.solta();
      await window.__A.espera(250);
      return { naCara: window.__game.XRArma.estado().naCara, visivel: window.__MP.weaponRoot.visible };
    });
    assert.equal(r.naCara, false);
    assert.equal(r.visivel, true, 'a arma não voltou depois de sair da cara: o jogador fica sem arma na mão');
  });

  it('a arma continua VISÍVEL em VR mesmo com o ADS cheio (a luneta 2D não existe no headset)', async () => {
    const r = await h.play(async () => {
      const W = window.__W;
      await W.solta();
      const c = W.cabeca();
      await W.levar([c.pos[0] + c.frente[0] * 0.28, c.pos[1] + c.frente[1] * 0.28, c.pos[2] + c.frente[2] * 0.28], c.quat, 5);
      await window.__A.espera(200);
      return { visivel: window.__MP.weaponRoot.visible, ads: window.__game.XRArma.estado().ads };
    });
    assert.ok(r.ads > 0.6, 'o cenário do teste não chegou a mirar');
    assert.equal(r.visivel, true, 'a arma sumiu no ADS — em VR isso é o jogador ficar sem arma na mão');
  });

  it('sair do VR devolve o desktop intacto: arma na câmera e mira pela câmera', async () => {
    const r = await h.play(async () => {
      await window.__game.XR.exit();
      await new Promise(res => setTimeout(res, 400));
      window.__game.tick(1 / 60);
      window.__game.tick(1 / 60);
      const MP = window.__MP;
      return {
        presenting: window.__game.XR.presenting,
        paiEhCamera: MP.weaponRoot.parent === window.__game.camera,
        naMao: window.__game.mira().naMao,
        pos: MP.weaponRoot.position.toArray(),
      };
    });
    assert.equal(r.presenting, false, 'a sessão não terminou');
    assert.equal(r.paiEhCamera, true, 'fora do VR a arma tem que voltar a ser filha da câmera');
    assert.equal(r.naMao, false, 'fora do VR a mira tem que voltar a ser a da câmera');
    assert.ok(Math.abs(r.pos[2]) > 0.1 && Math.abs(r.pos[2]) < 1.2,
      `a pose de desktop não voltou: weaponRoot.position.z = ${r.pos[2].toFixed(3)}`);
  });
});
