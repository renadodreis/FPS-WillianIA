/* ================================================================
   O GRIP ESQUERDO TEM TRÊS TRABALHOS E UMA ORDEM — PENTE, APOIO, AGARRAR.

   O DEFEITO, medido no produto antes desta rodada: o grip esquerdo faz três
   coisas com o mesmo botão (buscar o pente, apoiar a arma, agarrar coisa do
   mundo) e a rodada passada fechou UMA porta — `js/xr/xrinteract.js` recebe
   `apoiando: XRArma.duasMaos()` e não agarra enquanto a mão APOIA. A porta do
   PENTE ficou aberta: com a mão de apoio no peito buscando o carregador, o
   `apoiando` que chega ao módulo de interação é `false`, o `gripSeguraT` corre
   solto, e passados `HOLD_LONGE` segundos com a mão apontada para um baú o jogo
   entende "agarre à distância". Recarregar abre baú.

   E não havia ORDEM declarada: pente e apoio decidiam cada um por conta, por
   frame. Duas consequências que este arquivo mede — a decisão pode EMPATAR (a
   mão está nas duas zonas ao mesmo tempo, e nada diz quem ganha) e pode TROCAR
   NO MEIO DO APERTO (a mão sai da zona do peito e vira apoio sem o jogador ter
   soltado o botão), que é justamente o instante em que a porta se abre.

   O QUE ESTE ARQUIVO MEDE, e em que unidade:
     · o MODO publicado pelo grip esquerdo na borda de subida, e as duas
       distâncias em metros que o decidiram (mão↔peito, mão↔linha do cano);
     · a FRAÇÃO DE FRAMES do aperto em que o módulo de interação recebeu a porta
       fechada — lida do argumento que o game.js REALMENTE passa, não de uma
       variável interna;
     · o EMPATE resolvido: a mesma mão dentro das duas zonas, com as duas
       distâncias medidas, tem de dar `pente` (§4.3 da referência);
     · a TRAVA do aperto: o modo escolhido na borda vale até soltar, mesmo que a
       geometria mude no meio.

   ÂNCORAS INDEPENDENTES. A zona do peito sai da CABEÇA (pose do runtime) e do
   yaw da vista; a linha do cano sai das âncoras `gripR`/`muzzle` do perfil da
   arma (js/weaponrig.js), que são geometria do modelo desenhado. Nenhuma das
   duas é gerada por js/xr/xrweapon.js, que é o código sob teste.

   POR QUE NÃO PASSA POR ACIDENTE (lista do CLAUDE.md):
     · formato 1 (asserção que não pode falhar): todo caso de porta FECHADA vem
       colado com o complementar de porta ABERTA — mesmo botão, mesmos frames,
       geometria diferente. Um bloqueio que engolisse o agarre inteiro deixaria
       o complementar vermelho.
     · formato 4 (o teste dirigir o produto): a porta é lida do argumento que o
       `game.js` passa para `XRInterage.update`, embrulhando o método para
       ANOTAR e repassar. O teste não chama `update` nenhuma vez.
     · formato 3 (medir o eixo em que o defeito não aparece): o empate é medido
       com as DUAS distâncias publicadas, e o caso só vale se as duas estiverem
       dentro dos respectivos limiares — senão ele não exercita empate nenhum.

   PORTA 3678 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3678;
const f3 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '?');

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  let amostra = null;

  /* ================================================================
     O ESPIÃO DA PORTA. `apoiando` é o argumento que o game.js passa para
     `XRInterage.update`, e é ELE que decide se o agarre roda. Ler uma variável
     interna do módulo da arma mediria a intenção; ler o argumento mede o que
     chega. O embrulho ANOTA e repassa — não chama, não decide, não substitui.
     ================================================================ */
  const porta = [];
  const uOrig = G.XRInterage.update.bind(G.XRInterage);
  G.XRInterage.update = (args) => {
    porta.push({ apoiando: !!(args && args.apoiando), t: performance.now() });
    return uOrig(args);
  };

  function maoEsqObj() { return G.XR.punho('left') || G.XR.mao('left'); }
  function maoEsqMundo() {
    const o = maoEsqObj();
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(new T.Vector3());
  }

  /* A ZONA DO PEITO, da CABEÇA e do YAW DA VISTA. Amostrada com
     `setFromMatrixPosition(camera.matrixWorld)` porque em XR o three escreve a
     pose da câmera DENTRO do render — `getWorldPosition` compõe rig(N) com
     pose(N−1) e os dois erros se cancelam exatamente. */
  function peitoMundo() {
    const cab = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
    const yaw = G.yawDaVista();
    return new T.Vector3(0, -0.45, -0.15).applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(cab);
  }

  /* A LINHA DO CANO, das âncoras `gripR`→`muzzle` do PERFIL da arma, e o pé da
     perpendicular limitado ao segmento — que é como o apoio engata. */
  function pontoNoCano(p) {
    const gun = G.arsenal[G.gunIndex];
    const perfil = G.WeaponRig.inspect ? G.WeaponRig.inspect(G.gunIndex) : null;
    const a = perfil && perfil.anchors;
    if (!gun || !gun.group || !a || !a.gripR || !a.muzzle || !p) return null;
    gun.group.updateWorldMatrix(true, false);
    const g = gun.group.localToWorld(new T.Vector3(a.gripR[0], a.gripR[1], a.gripR[2]));
    const m = gun.group.localToWorld(new T.Vector3(a.muzzle[0], a.muzzle[1], a.muzzle[2]));
    const eixo = m.clone().sub(g);
    const comp = eixo.length() || 1;
    eixo.multiplyScalar(1 / comp);
    const s = Math.max(0, Math.min(comp, p.clone().sub(g).dot(eixo)));
    return g.clone().addScaledVector(eixo, s);
  }

  const rOrig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = (cena, cam) => {
    const v = rOrig(cena, cam);
    const gun = G.arsenal[G.gunIndex];
    const mao = maoEsqMundo();
    const pe = peitoMundo();
    const noCano = pontoNoCano(mao);
    const grip = G.XRArma.gripEsquerdo ? G.XRArma.gripEsquerdo() : null;
    amostra = {
      modo: grip ? grip.modo : null,
      ocupado: G.XRArma.gripOcupado ? !!G.XRArma.gripOcupado() : null,
      duasMaos: !!G.XRArma.duasMaos(),
      dPeito: (mao && pe) ? mao.distanceTo(pe) : null,
      dCano: (mao && noCano) ? mao.distanceTo(noCano) : null,
      recarga: G.XRArma.recarga ? G.XRArma.recarga().estado : null,
      mag: gun ? gun.mag : null, magSize: gun ? gun.magSize : null,
      reserve: gun ? gun.reserve : null,
      recarregando: !!(gun && gun.reloading),
      frames: (amostra ? amostra.frames : 0) + 1,
    };
    return v;
  };

  window.__AG = {
    ler: () => amostra,
    porta: () => porta.slice(),
    limparPorta: () => { porta.length = 0; },
    espera: ms => window.__A.espera(ms),
    ate: async (cond, tetoMs = 8000) => {
      const t0 = performance.now();
      while (performance.now() - t0 < tetoMs) {
        if (cond()) return true;
        await window.__A.espera(50);
      }
      return false;
    },
    cabeca: (y = 1.70) => {
      const d = window.__xrEmulado;
      d.position.set(0, y, 0);
      d.quaternion.set(0, 0, 0, 1);
    },
    mao: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.right.position.set(x, y, z);
      d.controllers.right.quaternion.set(0, 0, 0, 1);
    },
    /* leva a mão esquerda a um ponto de MUNDO, por DELTA (o controle vive no
       espaço de referência da sessão; escrever coordenada de mundo direto erra
       pelo deslocamento do rig) */
    levarE: async (alvoFn, passos = 3, ms = 70) => {
      const dev = window.__xrEmulado;
      for (let i = 0; i < passos; i++) {
        const alvo = alvoFn();
        const atual = maoEsqMundo();
        if (!alvo || !atual) break;
        const falta = alvo.clone().sub(atual);
        const p = dev.controllers.left.position;
        dev.controllers.left.position.set(p.x + falta.x, p.y + falta.y, p.z + falta.z);
        await window.__A.espera(ms);
      }
    },
    noPeito: () => peitoMundo(),
    /* um ponto do GUARDA-MÃO: o meio do segmento gripR→muzzle */
    noGuardaMao: () => {
      const gun = G.arsenal[G.gunIndex];
      const perfil = G.WeaponRig.inspect ? G.WeaponRig.inspect(G.gunIndex) : null;
      const a = perfil && perfil.anchors;
      if (!gun || !gun.group || !a) return null;
      gun.group.updateWorldMatrix(true, false);
      const g = gun.group.localToWorld(new T.Vector3(a.gripR[0], a.gripR[1], a.gripR[2]));
      const m = gun.group.localToWorld(new T.Vector3(a.muzzle[0], a.muzzle[1], a.muzzle[2]));
      return g.clone().lerp(m, 0.55);
    },
    longeDeTudo: () => {
      const cab = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
      return cab.clone().add(new T.Vector3(-0.75, -0.30, -0.70));
    },
    grip: (v) => window.__A.botao('left', 'squeeze', v),
    /* PREPARO, não medição. */
    preparar: async (arma = 0, mag = 1, reserve = 150) => {
      window.__A.botao('left', 'squeeze', 0);
      window.__A.botao('right', 'squeeze', 0);
      window.__A.botao('left', 'y-button', 0);
      G.switchWeapon(arma);
      const g = G.arsenal[G.gunIndex];
      g.reloading = false; g.mag = mag; g.reserve = reserve;
      await window.__A.espera(280);
    },
  };
  return true;
}

/* fração de frames do aperto em que a porta chegou FECHADA */
const fechada = lista => (lista.length ? lista.filter(p => p.apoiando).length / lista.length : 0);

describe('o grip esquerdo tem uma ORDEM declarada: pente → apoio → agarrar',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      const vivo = await h.play(() => window.__AG.ate(
        () => window.__AG.ler() && window.__AG.ler().frames > 30, 20000));
      assert.ok(vivo, 'a cena não chegou a 30 frames: nada do que este arquivo mede existe ainda');
      const espiao = await h.play(async () => {
        window.__AG.limparPorta();
        await window.__AG.espera(400);
        return window.__AG.porta().length;
      });
      assert.ok(espiao >= 5,
        `o espião da porta viu ${espiao} chamada(s) de XRInterage.update em 0,4 s: ` +
        'sem instrumento calibrado nenhuma asserção sobre a porta vale');
    });
    after(async () => { if (h) await h.close(); });

    it('mão no PEITO com recarga pendente: o modo é `pente` e a porta FECHA', async () => {
      const r = await h.play(async () => {
        window.__AG.cabeca(1.70);
        window.__AG.mao(0.25, 1.20, -0.25);
        await window.__AG.preparar(0, 1, 150);
        await window.__AG.levarE(window.__AG.noPeito, 4);
        const antes = window.__AG.ler();
        window.__AG.limparPorta();
        window.__AG.grip(1);
        await window.__AG.espera(600);      // bem acima de HOLD_LONGE (0,30 s)
        const durante = window.__AG.ler();
        const p = window.__AG.porta();
        window.__AG.grip(0);
        await window.__AG.espera(200);
        return { antes, durante, porta: p };
      });
      assert.ok(r.antes.dPeito !== null && r.antes.dPeito <= 0.25,
        `a mão nem chegou à zona do peito (${f3(r.antes.dPeito)} m > 0,25 m): ` +
        'o cenário não exercita o limiar (formato 9), nada a medir');
      const frac = fechada(r.porta);
      assert.ok(frac >= 0.9,
        `buscando o pente a ${f3(r.antes.dPeito)} m do peito, a porta do agarre chegou ` +
        `FECHADA em ${(frac * 100).toFixed(1)}% dos ${r.porta.length} frames do aperto ` +
        `(modo publicado: ${r.durante.modo}). Com a porta aberta por ${f3(0.6)} s — o dobro de ` +
        'HOLD_LONGE — recarregar apontado para um baú abre o baú.');
      assert.equal(r.durante.modo, 'pente',
        `o modo do grip esquerdo veio "${r.durante.modo}" com a mão a ${f3(r.antes.dPeito)} m do peito`);
    });

    it('e o COMPLEMENTAR: LONGE de tudo, o modo é `agarrar` e a porta ABRE', async () => {
      /* Sem este caso o de cima passaria com a porta trancada para sempre —
         asserção que não pode falhar, formato 1 da lista. */
      const r = await h.play(async () => {
        window.__AG.cabeca(1.70);
        window.__AG.mao(0.25, 1.20, -0.25);
        await window.__AG.preparar(0, 1, 150);
        await window.__AG.levarE(window.__AG.longeDeTudo, 4);
        const antes = window.__AG.ler();
        window.__AG.limparPorta();
        window.__AG.grip(1);
        await window.__AG.espera(600);
        const durante = window.__AG.ler();
        const p = window.__AG.porta();
        window.__AG.grip(0);
        await window.__AG.espera(200);
        return { antes, durante, porta: p };
      });
      assert.ok(r.antes.dPeito > 0.25 && r.antes.dCano > 0.32,
        `a mão não ficou longe das duas zonas (peito ${f3(r.antes.dPeito)} m, ` +
        `cano ${f3(r.antes.dCano)} m): o cenário não separa os modos`);
      const frac = fechada(r.porta);
      assert.ok(frac <= 0.1,
        `longe da arma e do peito, a porta do agarre chegou FECHADA em ` +
        `${(frac * 100).toFixed(1)}% dos ${r.porta.length} frames: o bloqueio comeu o verbo inteiro`);
      assert.equal(r.durante.modo, 'agarrar',
        `o modo veio "${r.durante.modo}" com a mão a ${f3(r.antes.dPeito)} m do peito e ` +
        `${f3(r.antes.dCano)} m da linha do cano`);
    });

    it('mão no GUARDA-MÃO sem recarga pendente: o modo é `apoio`', async () => {
      const r = await h.play(async () => {
        window.__AG.cabeca(1.70);
        window.__AG.mao(0.25, 1.20, -0.25);
        await window.__AG.preparar(0, 30, 150);   // pente CHEIO: não há pente a buscar
        await window.__AG.levarE(window.__AG.noGuardaMao, 4);
        const antes = window.__AG.ler();
        window.__AG.limparPorta();
        window.__AG.grip(1);
        await window.__AG.espera(600);
        const durante = window.__AG.ler();
        const p = window.__AG.porta();
        window.__AG.grip(0);
        await window.__AG.espera(200);
        return { antes, durante, porta: p };
      });
      assert.ok(r.antes.dCano !== null && r.antes.dCano <= 0.20,
        `a mão nem chegou à linha do cano (${f3(r.antes.dCano)} m > 0,20 m): nada a medir`);
      assert.equal(r.durante.modo, 'apoio',
        `o modo veio "${r.durante.modo}" com a mão a ${f3(r.antes.dCano)} m da linha do cano ` +
        `e ${f3(r.antes.dPeito)} m do peito`);
      const frac = fechada(r.porta);
      assert.ok(frac >= 0.9,
        `apoiando a arma, a porta do agarre chegou FECHADA em só ${(frac * 100).toFixed(1)}% ` +
        `dos ${r.porta.length} frames`);
    });

    it('EMPATE: a mão dentro das DUAS zonas escolhe `pente` — a ordem é declarada', async () => {
      /* Este é o caso que a §4.3 da referência resolve e que o produto não
         resolvia: pente e apoio decidiam cada um por conta. O caso só vale se
         as DUAS distâncias estiverem dentro dos limiares — a asserção de
         cenário abaixo é o que impede formato 9. */
      const r = await h.play(async () => {
        window.__AG.cabeca(1.70);
        /* a arma ATRAVESSADA no peito: a linha do cano passa pela zona do peito */
        window.__AG.mao(0.10, 1.28, -0.10);
        await window.__AG.preparar(0, 1, 150);
        await window.__AG.levarE(window.__AG.noPeito, 4);
        const antes = window.__AG.ler();
        window.__AG.limparPorta();
        window.__AG.grip(1);
        await window.__AG.espera(500);
        const durante = window.__AG.ler();
        window.__AG.grip(0);
        await window.__AG.espera(200);
        return { antes, durante };
      });
      assert.ok(r.antes.dPeito <= 0.25,
        `mão a ${f3(r.antes.dPeito)} m do peito: fora da zona do pente, não há empate`);
      assert.ok(r.antes.dCano <= 0.20,
        `mão a ${f3(r.antes.dCano)} m da linha do cano: fora da zona do apoio, não há empate`);
      assert.equal(r.durante.modo, 'pente',
        `com a mão dentro das duas zonas (peito ${f3(r.antes.dPeito)} m, cano ${f3(r.antes.dCano)} m) ` +
        `o grip escolheu "${r.durante.modo}" — a ordem pente→apoio→agarrar não está declarada`);
    });

    it('TRAVA DO APERTO: o modo da borda vale até soltar, mesmo com a geometria mudando', async () => {
      /* É aqui que a porta se abria: o modo trocando no meio do aperto faz
         `apoiando` cair de true para false com o `gripSeguraT` do agarre à
         distância já acumulado — e o agarre dispara no frame seguinte. */
      const r = await h.play(async () => {
        window.__AG.cabeca(1.70);
        window.__AG.mao(0.25, 1.20, -0.25);
        await window.__AG.preparar(0, 1, 150);
        await window.__AG.levarE(window.__AG.noPeito, 4);
        const naBorda = window.__AG.ler();
        window.__AG.limparPorta();
        window.__AG.grip(1);
        await window.__AG.espera(250);
        const logo = window.__AG.ler();
        /* SEM SOLTAR: a mão sai do peito e vai para longe das duas zonas */
        await window.__AG.levarE(window.__AG.longeDeTudo, 4);
        await window.__AG.espera(400);
        const depois = window.__AG.ler();
        const p = window.__AG.porta();
        window.__AG.grip(0);
        await window.__AG.espera(250);
        const solto = window.__AG.ler();
        return { naBorda, logo, depois, solto, porta: p };
      });
      assert.equal(r.logo.modo, 'pente',
        `a borda não escolheu pente (veio "${r.logo.modo}" a ${f3(r.naBorda.dPeito)} m do peito)`);
      assert.ok(r.depois.dPeito > 0.25,
        `a mão não saiu da zona do peito (${f3(r.depois.dPeito)} m): a trava não foi exercitada`);
      assert.equal(r.depois.modo, 'pente',
        `o modo trocou para "${r.depois.modo}" no meio do aperto, com a mão a ` +
        `${f3(r.depois.dPeito)} m do peito — a decisão não está travada na borda`);
      const frac = fechada(r.porta);
      assert.ok(frac >= 0.95,
        `a porta do agarre chegou FECHADA em ${(frac * 100).toFixed(1)}% dos ${r.porta.length} ` +
        'frames do aperto: ela abriu no meio, que é exatamente quando o `gripSeguraT` já passou de HOLD_LONGE');
      assert.equal(r.solto.modo, 'livre',
        `soltar o grip deixou o modo em "${r.solto.modo}": a trava virou resíduo`);
    });

    it('sem resíduo: soltar e apertar de novo REAVALIA a geometria', async () => {
      const r = await h.play(async () => {
        window.__AG.cabeca(1.70);
        window.__AG.mao(0.25, 1.20, -0.25);
        await window.__AG.preparar(0, 1, 150);
        /* aperto 1: no peito → pente */
        await window.__AG.levarE(window.__AG.noPeito, 4);
        window.__AG.grip(1);
        await window.__AG.espera(300);
        const um = window.__AG.ler();
        window.__AG.grip(0);
        await window.__AG.espera(250);
        /* aperto 2: longe de tudo → agarrar */
        await window.__AG.levarE(window.__AG.longeDeTudo, 4);
        window.__AG.limparPorta();
        window.__AG.grip(1);
        await window.__AG.espera(500);
        const dois = window.__AG.ler();
        const p = window.__AG.porta();
        window.__AG.grip(0);
        await window.__AG.espera(200);
        return { um, dois, porta: p };
      });
      assert.equal(r.um.modo, 'pente', `o primeiro aperto veio "${r.um.modo}"`);
      assert.equal(r.dois.modo, 'agarrar',
        `o segundo aperto, longe de tudo, veio "${r.dois.modo}" — a trava do aperto anterior deixou resíduo`);
      const frac = fechada(r.porta);
      assert.ok(frac <= 0.1,
        `depois de buscar o pente, a porta do agarre continuou FECHADA em ` +
        `${(frac * 100).toFixed(1)}% dos frames do aperto seguinte: quem larga o pente para pegar ` +
        'uma caixa precisaria de um aperto extra para destravar');
    });
  });
